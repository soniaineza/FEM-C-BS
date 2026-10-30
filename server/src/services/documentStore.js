// Where the bytes of a driver document live. With DOCUMENT_STORE_URL and
// DOCUMENT_STORE_TOKEN set they are kept on the cPanel host (doc-store/ in this
// repo), keyed by the document's id, and the database row only records that
// (file_remote). With neither set they stay in driver_documents.file_data, as
// before; that is what the local test suite uses.
const { config } = require('../config');
const { ApiError } = require('../utils/asyncHandler');

/** SQL for "this document row has a file", whichever way it is stored. */
const HAS_FILE_SQL = '(file_data IS NOT NULL OR file_remote)';

const UNAVAILABLE_MESSAGE = 'Document storage is unavailable. Please try again in a moment.';

function isRemote() {
  return Boolean(config.documentStoreUrl && config.documentStoreToken);
}

function unavailable(action, id, cause) {
  console.error(`[documents] store ${action} failed for ${id}:`, cause instanceof Error ? cause.message : cause);
  return new ApiError(503, UNAVAILABLE_MESSAGE, 'DOCUMENT_STORAGE_UNAVAILABLE');
}

/**
 * One call to the store: [status, body] with the secret attached. A custom
 * header carries it because shared hosts often strip Authorization before PHP.
 */
async function call(method, id, body) {
  const url = new URL(config.documentStoreUrl);
  url.searchParams.set('id', id);
  const response = await fetch(url, {
    method,
    headers: {
      'X-Store-Token': config.documentStoreToken,
      ...(body ? { 'Content-Type': 'application/octet-stream' } : {}),
    },
    body,
    redirect: 'error',
    signal: AbortSignal.timeout(config.documentStoreTimeoutMs),
  });
  return [response.status, Buffer.from(await response.arrayBuffer())];
}

/** Stores a new document's bytes on the document store under `id`. */
async function save(id, bytes) {
  let status;
  let body;
  try {
    [status, body] = await call('PUT', id, bytes);
  } catch (err) {
    throw unavailable('save', id, err);
  }
  // The store answers with the size it wrote; a mismatch means a cut-off upload.
  let written = null;
  try { written = JSON.parse(body.toString('utf8')).size; } catch (_) { /* not JSON */ }
  if (status !== 201 || written !== bytes.length) {
    throw unavailable('save', id, `HTTP ${status}, stored ${written} of ${bytes.length} bytes`);
  }
}

/** The bytes of a document row (needs file_data, file_remote and id). */
async function read(row) {
  if (!row.file_remote) {
    if (!row.file_data) throw new ApiError(404, 'Document file not found.');
    return row.file_data;
  }
  let status;
  let body;
  try {
    [status, body] = await call('GET', row.id);
  } catch (err) {
    throw unavailable('read', row.id, err);
  }
  if (status === 404) throw new ApiError(404, 'Document file not found.');
  if (status !== 200) throw unavailable('read', row.id, `HTTP ${status}`);
  return body;
}

/** Deletes files from the store. Best effort: a miss never blocks the caller. */
async function remove(ids) {
  await Promise.all(ids.map(async (id) => {
    try {
      const [status] = await call('DELETE', id);
      if (status !== 204 && status !== 404) throw new Error(`HTTP ${status}`);
    } catch (err) {
      console.error(`[documents] store delete failed for ${id}:`, err.message);
    }
  }));
}

module.exports = { HAS_FILE_SQL, isRemote, save, read, remove };
