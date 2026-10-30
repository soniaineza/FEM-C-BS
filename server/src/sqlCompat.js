// Turns the PostgreSQL-flavoured SQL the API is written in into MySQL/MariaDB
// SQL, so the 300+ queries in routes/ and services/ keep one readable shape.
// Pure functions only (no connection): src/db.js runs what this returns.
//
// What is translated:
//   $1, $2 ...                       -> ?  (a parameter used twice is sent twice)
//   now()                            -> NOW(3)
//   interval '30 seconds'            -> INTERVAL 30 SECOND
//   ($1 || ' seconds')::interval     -> INTERVAL $1 SECOND
//   x = ANY($1)                      -> x IN (?)   (the array is expanded)
//   ILIKE, ~ (regex), gen_random_uuid(), ::type casts
//   ON CONFLICT .. DO NOTHING        -> ON DUPLICATE KEY UPDATE <col> = <col>
//   ON CONFLICT .. DO UPDATE SET     -> ON DUPLICATE KEY UPDATE .. (EXCLUDED.x -> VALUES(x))
//   INSERT/UPDATE/DELETE .. RETURNING -> a plan of several statements (MySQL has no RETURNING)
//
// Anything else that PostgreSQL has and MySQL lacks is ported by hand at the
// call site; compile() throws on the few shapes it cannot emulate so a
// mistake shows up in tests, never as silently wrong SQL.

/** Primary key column per table, where it is not "id". */
const PRIMARY_KEYS = {
  driver_locations: 'driver_id',
  passenger_locations: 'passenger_id',
  wallets: 'passenger_id',
};

const UNIT_SQL = { second: 'SECOND', minute: 'MINUTE', hour: 'HOUR', day: 'DAY' };

/** Marks the generated id of an INSERT .. RETURNING in a plan's parameter order. */
const GENERATED_ID = 'generated-id';

function unitOf(word) {
  return UNIT_SQL[String(word).toLowerCase().replace(/s$/, '')];
}

/** Replaces string literals and drops comments so keywords inside text never match. */
function mask(sql) {
  const strings = [];
  let out = '';
  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];
    if (ch === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i += 1;
      out += '\n';
    } else if (ch === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      i = end === -1 ? sql.length : end + 1;
      out += ' ';
    } else if (ch === "'" || ch === '`' || ch === '"') {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === ch) {
          if (sql[j + 1] === ch) { j += 2; continue; }
          break;
        }
        j += 1;
      }
      strings.push(sql.slice(i, j + 1));
      out += `\u0000${strings.length - 1}\u0000`;
      i = j;
    } else {
      out += ch;
    }
  }
  return { text: out, strings };
}

function unmask(text, strings) {
  return text.replace(/\u0000(\d+)\u0000/g, (_, n) => strings[Number(n)]);
}

/** Index of the first top-level (outside parentheses) match of `re`, or -1. */
function topLevelIndex(text, re, from = 0) {
  let depth = 0;
  const flags = re.flags.includes('g') ? re.flags : `${re.flags}g`;
  const matcher = new RegExp(re.source, flags);
  for (let i = from; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    else if (depth === 0) {
      matcher.lastIndex = i;
      const m = matcher.exec(text);
      if (m && m.index === i) return i;
    }
  }
  return -1;
}

/** Splits "a, f(b, c), ?" at top-level commas. */
function splitTopLevel(text) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '(') depth += 1;
    else if (text[i] === ')') depth -= 1;
    else if (text[i] === ',' && depth === 0) {
      parts.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(text.slice(start).trim());
  return parts;
}

/** Index just past the ")" that closes the "(" at `open`. */
function closingParen(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '(') depth += 1;
    else if (text[i] === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  throw new Error('sqlCompat: unbalanced parentheses');
}

function rewriteLiterals(sql) {
  return sql
    // ($1 || ' seconds')::interval
    .replace(/\(\s*\$(\d+)\s*\|\|\s*'\s*(seconds?|minutes?|hours?|days?)\s*'\s*\)\s*::\s*interval/gi,
      (_, n, unit) => `INTERVAL $${n} ${unitOf(unit)}`)
    // interval '30 seconds'
    .replace(/\binterval\s+'\s*(\d+)\s*(seconds?|minutes?|hours?|days?)\s*'/gi,
      (_, n, unit) => `INTERVAL ${n} ${unitOf(unit)}`)
    .replace(/'epoch'/gi, "'1970-01-01 00:00:00'");
}

function rewriteOperators(text) {
  return text
    .replace(/\bnow\s*\(\s*\)/gi, 'NOW(3)')
    .replace(/\bgen_random_uuid\s*\(\s*\)/gi, 'UUID()')
    .replace(/\bILIKE\b/gi, 'LIKE')
    .replace(/\s~\s/g, ' REGEXP ')
    .replace(/::\s*(?:double\s+precision|timestamptz|timestamp|numeric|bigint|integer|boolean|float8|float|text|uuid|jsonb|json|date|int)\b(\s*\[\s*\])?/gi, '');
}

/**
 * ON CONFLICT -> ON DUPLICATE KEY UPDATE. Returns the rewritten text.
 * (MySQL fires on any unique key of the table, not just the named columns;
 * every call site in this code base names the table's only conflicting key.)
 */
function rewriteUpsert(text) {
  if (!/\bON\s+CONFLICT\b/i.test(text)) return text;
  if (/\bRETURNING\b/i.test(text)) {
    throw new Error('sqlCompat: INSERT .. ON CONFLICT .. RETURNING is not supported; port it by hand.');
  }
  return text
    .replace(/\bON\s+CONFLICT\s*(?:\([^)]*\))?\s*DO\s+NOTHING\b/i, () => {
      const cols = /\bINSERT\s+INTO\s+\w+\s*\(([^)]*)\)/i.exec(text);
      if (!cols) throw new Error('sqlCompat: ON CONFLICT DO NOTHING needs an INSERT with a column list.');
      const first = cols[1].split(',')[0].trim();
      return `ON DUPLICATE KEY UPDATE ${first} = ${first}`;
    })
    .replace(/\bON\s+CONFLICT\s*(?:\([^)]*\))?\s*DO\s+UPDATE\s+SET\b/i, 'ON DUPLICATE KEY UPDATE')
    .replace(/\bEXCLUDED\.(\w+)/gi, 'VALUES($1)');
}

/** $n -> ? and the order in which the caller's params must be sent. */
function numberPlaceholders(text) {
  const order = [];
  const out = text.replace(/\$(\d+)/g, (_, n) => {
    order.push(Number(n) - 1);
    return '?';
  });
  return { text: out, order };
}

function countPlaceholders(text) {
  return (text.match(/\?/g) || []).length;
}

/** x = ANY($n) / x <> ALL($n) -> IN / NOT IN. Returns the text and the list params. */
function rewriteAny(text) {
  const lists = new Set();
  const out = text
    .replace(/=\s*ANY\s*\(\s*\$(\d+)\s*\)/gi, (_, n) => { lists.add(Number(n) - 1); return `IN ($${n})`; })
    .replace(/(?:<>|!=)\s*ALL\s*\(\s*\$(\d+)\s*\)/gi, (_, n) => { lists.add(Number(n) - 1); return `NOT IN ($${n})`; });
  return { text: out, lists };
}

function parseReturning(text) {
  const m = /\bRETURNING\s+([\s\S]+?)\s*;?\s*$/i.exec(text);
  if (!m) return null;
  return { body: text.slice(0, m.index).trim(), columns: m[1].trim() };
}

function compileInsertReturning(body, columns, params) {
  const m = /^INSERT\s+INTO\s+(\w+)\s*\(([^)]*)\)\s*VALUES\s*\(/i.exec(body);
  if (!m) throw new Error('sqlCompat: INSERT .. RETURNING needs "INSERT INTO t (cols) VALUES (...)".');
  const table = m[1];
  const pk = PRIMARY_KEYS[table] || 'id';
  const cols = m[2].split(',').map((c) => c.trim());
  const valuesOpen = m[0].length - 1;
  const valuesClose = closingParen(body, valuesOpen);
  if (body.slice(valuesClose + 1).trim() !== '') {
    throw new Error('sqlCompat: multi-row INSERT .. RETURNING is not supported; port it by hand.');
  }
  const exprs = splitTopLevel(body.slice(valuesOpen + 1, valuesClose));
  const at = cols.indexOf(pk);
  let insertText = body;
  let order = params.order;
  let pkParam = null;
  if (at === -1) {
    if (pk !== 'id') throw new Error(`sqlCompat: INSERT into ${table} RETURNING must set ${pk}.`);
    insertText = `INSERT INTO ${table} (id, ${m[2].trim()}) VALUES (?, ${body.slice(valuesOpen + 1)}`;
    order = [GENERATED_ID, ...params.order];
    pkParam = 0;
  } else {
    if (exprs[at] !== '?') throw new Error(`sqlCompat: ${table}.${pk} must be a parameter in INSERT .. RETURNING.`);
    pkParam = countPlaceholders(body.slice(0, valuesOpen + 1)) + exprs.slice(0, at).reduce((n, e) => n + countPlaceholders(e), 0);
  }
  return {
    kind: 'insert-returning',
    insert: { text: insertText, order },
    pkParam,
    select: `SELECT ${columns} FROM ${table} WHERE ${pk} = ?`,
  };
}

function compileUpdateReturning(body, columns, params) {
  const m = /^UPDATE\s+(\w+)\s+SET\s+/i.exec(body);
  if (!m) throw new Error('sqlCompat: UPDATE .. RETURNING needs "UPDATE t SET ...".');
  const table = m[1];
  const pk = PRIMARY_KEYS[table] || 'id';
  const whereAt = topLevelIndex(body, /\bWHERE\b/i, m[0].length);
  if (whereAt === -1) throw new Error('sqlCompat: UPDATE .. RETURNING needs a WHERE clause.');
  if (/\b(?:ORDER\s+BY|LIMIT)\b/i.test(body.slice(whereAt))) {
    throw new Error('sqlCompat: UPDATE .. RETURNING with ORDER BY/LIMIT is not supported; port it by hand.');
  }
  const setText = body.slice(0, whereAt).trim();
  const whereText = body.slice(whereAt + 'WHERE'.length).trim();
  const setCount = countPlaceholders(setText);
  return {
    kind: 'update-returning',
    lock: { text: `SELECT ${pk} FROM ${table} WHERE ${whereText} FOR UPDATE`, order: params.order.slice(setCount) },
    update: { text: `${setText} WHERE ${pk} IN (?)`, order: params.order.slice(0, setCount) },
    select: `SELECT ${columns} FROM ${table} WHERE ${pk} IN (?)`,
    pk,
  };
}

function compileDeleteReturning(body, columns, params) {
  const m = /^DELETE\s+FROM\s+(\w+)\s+WHERE\s+/i.exec(body);
  if (!m) throw new Error('sqlCompat: DELETE .. RETURNING needs "DELETE FROM t WHERE ...".');
  const table = m[1];
  const pk = PRIMARY_KEYS[table] || 'id';
  const whereText = body.slice(m[0].length);
  return {
    kind: 'delete-returning',
    select: { text: `SELECT ${columns} FROM ${table} WHERE ${whereText} FOR UPDATE`, order: params.order },
    pk,
    table,
    lock: { text: `SELECT ${pk} FROM ${table} WHERE ${whereText} FOR UPDATE`, order: params.order },
    delete: `DELETE FROM ${table} WHERE ${pk} IN (?)`,
  };
}

const cache = new Map();

/**
 * Compiles one PostgreSQL-style statement.
 * Returns { kind: 'plain', text, order, lists } or a RETURNING plan (see the
 * compile*Returning functions); `order` lists, per `?`, the index of the
 * caller's parameter (or GENERATED_ID); `lists` the parameters that are arrays
 * spliced into IN (...).
 */
function compile(sql) {
  const hit = cache.get(sql);
  if (hit) return hit;

  const { text: masked, strings } = mask(rewriteLiterals(sql));
  const any = rewriteAny(rewriteOperators(masked));
  const upsert = rewriteUpsert(any.text);
  const returning = parseReturning(upsert);
  const params = numberPlaceholders(returning ? returning.body : upsert);

  let plan;
  if (!returning) {
    plan = { kind: 'plain', text: unmask(params.text, strings), order: params.order, lists: any.lists };
  } else {
    const verb = /^\s*(INSERT|UPDATE|DELETE)\b/i.exec(params.text);
    if (!verb) throw new Error('sqlCompat: RETURNING is only supported on INSERT, UPDATE and DELETE.');
    const compiled = {
      INSERT: compileInsertReturning,
      UPDATE: compileUpdateReturning,
      DELETE: compileDeleteReturning,
    }[verb[1].toUpperCase()](params.text.trim(), returning.columns, params);
    plan = JSON.parse(JSON.stringify(compiled, (key, value) => (typeof value === 'string' ? unmask(value, strings) : value)));
    plan.lists = any.lists;
  }
  cache.set(sql, plan);
  return plan;
}

module.exports = { compile, GENERATED_ID, PRIMARY_KEYS };
