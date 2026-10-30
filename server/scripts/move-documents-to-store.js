#!/usr/bin/env node
// Moves driver documents that are still stored inside the database
// (driver_documents.file_data) onto the document store on cPanel, one at a
// time. Each file is uploaded, read back and compared byte for byte before its
// database copy is cleared, so an interrupted run loses nothing and can simply
// be run again. Needs the MYSQL_* settings, DOCUMENT_STORE_URL and DOCUMENT_STORE_TOKEN.
//
//   cd server && npm run docs:move -- --dry-run     # list what would move
//   cd server && npm run docs:move                  # move everything
//
// To hand the freed space back to the database host run
// "OPTIMIZE TABLE driver_documents;" afterwards (it locks the table briefly,
// so do it when no driver is uploading).
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { ensureDatabase, initPool } = require('../src/db');
const documentStore = require('../src/services/documentStore');

const dryRun = process.argv.includes('--dry-run');

async function main() {
  if (!documentStore.isRemote()) throw new Error('Set DOCUMENT_STORE_URL and DOCUMENT_STORE_TOKEN first.');
  const pool = initPool(await ensureDatabase());

  const { rows: todo } = await pool.query(
    `SELECT id, doc_type, file_size FROM driver_documents
      WHERE file_data IS NOT NULL AND NOT file_remote ORDER BY uploaded_at`
  );
  console.log(`${todo.length} document(s) to move${dryRun ? ' (dry run, nothing will change)' : ''}.`);

  let moved = 0;
  let failed = 0;
  for (const doc of todo) {
    const label = `${doc.id} ${doc.doc_type} (${doc.file_size ?? '?'} bytes)`;
    if (dryRun) {
      console.log(`would move ${label}`);
      continue;
    }
    try {
      const { rows } = await pool.query('SELECT file_data FROM driver_documents WHERE id = $1', [doc.id]);
      const bytes = rows[0] && rows[0].file_data;
      if (!bytes) continue; // moved or removed since the list was taken
      await documentStore.save(doc.id, bytes);
      const stored = await documentStore.read({ id: doc.id, file_remote: true });
      if (!stored.equals(bytes)) throw new Error('the stored copy does not match the original');
      await pool.query(
        'UPDATE driver_documents SET file_remote = TRUE, file_data = NULL WHERE id = $1 AND file_data IS NOT NULL',
        [doc.id]
      );
      moved += 1;
      console.log(`moved ${label}`);
    } catch (err) {
      failed += 1;
      console.error(`FAILED ${label}: ${err.message}`);
    }
  }

  if (!dryRun) console.log(`Done: ${moved} moved, ${failed} failed.`);
  await pool.end();
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error('[move-documents]', err.message);
  process.exit(1);
});
