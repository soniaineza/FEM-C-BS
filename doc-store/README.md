# Kimu document store (cPanel)

Keeps the driver document files (licences, IDs, photos) on the cPanel host so
the PostgreSQL database stays small. The Kimu API on Render talks to it over
HTTPS; the database row only records that the file is stored here.

It is one PHP file. It knows nothing about drivers: it holds opaque files named
by UUID and answers `PUT`, `GET` and `DELETE` on `index.php?id=<uuid>` to
callers that send the shared secret in the `X-Store-Token` header. Needs PHP 8.1+.

## Set up (cPanel File Manager, no shell needed)

1. In File Manager create `public_html/doc-store/` and upload `index.php` and
   `.htaccess` from this folder into it.
2. In your **home folder** (not `public_html`) create `kimu-doc-store-config.php`
   from `config.example.php`. Set `token` to a long random secret and leave
   `storage_dir` as `/home/unguka/kimu-documents`. Set the file's permissions to `600`.
3. Open `https://kimutransport.com/doc-store/` in a browser. `{"error":"Not authorised."}`
   means it works. `{"error":"The document store is not configured."}` means step 2
   is missing or the path is wrong; the cPanel error log has the exact path.
4. In the Render service's Environment tab set
   - `DOCUMENT_STORE_URL=https://kimutransport.com/doc-store/`
   - `DOCUMENT_STORE_TOKEN=<the same secret>`

   and let it redeploy. New uploads now go to cPanel.
5. Move the existing documents with `npm run docs:move` (see `server/README.md`).

## Security

- Files live in `storage_dir`, outside the web root: no URL can reach them. Only
  `index.php` answers, and only for a caller with the secret over HTTPS.
- Document files are personal data. Include `kimu-documents/` in your cPanel
  backups, and keep the config file out of the web root.
- To rotate the secret change `token` in the config file and
  `DOCUMENT_STORE_TOKEN` on Render together.
