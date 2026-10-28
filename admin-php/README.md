# Kimu Admin dashboard (PHP, for cPanel)

The operator's page for the Kimu Transport service, as plain PHP that runs on
shared cPanel hosting: approve drivers after checking their four documents,
reject a document with a reason, open each uploaded file, decide payment cases,
close SOS events, and check the Google / OTP integrations. Everything is read
from and written to the Kimu API (`https://fem-cabs-api.onrender.com`, Node +
PostgreSQL); this dashboard keeps **no database and no copy** of any record.

## What this directory contains

| File | Purpose |
| --- | --- |
| `index.php` | Sign-in form and dashboard page |
| `api.php` | Server-side proxy to `<API>/api/admin/*` (whitelisted routes, CSRF-checked) |
| `lib/bootstrap.php` | Config loading, hardened session, CSRF, sign-in throttle |
| `lib/upstream.php` | cURL client: API operator token, JSON forwarding, file streaming |
| `assets/app.js`, `assets/app.css` | Dashboard UI |
| `config.example.php` | Copy to `config.php` (never committed) |
| `bin/make-password-hash.php` | Prints a `password_hash()` value for an operator password |
| `.htaccess` | Security headers, denies `config*.php`, `lib/`, `bin/` |

## How it works

The browser signs in with a username and password; `api.php` then signs in to
the API on the server side using the API operator credentials and keeps the
API's eight-hour token in the PHP session. Document files are streamed through
`api.php` with their content type, so images show inline and PDFs open in a new
tab. The API credentials and token never reach a browser.

## Install on cPanel (copy-paste)

1. **Upload.** In cPanel > *File Manager* (or with
   `bash scripts/deploy.sh <cPanel_user> <domain>` on a machine with SSH
   access), create a folder under `public_html`, e.g. `public_html/admin`, and
   upload everything in this directory into it: `index.php`, `api.php`,
   `assets/`, `lib/`, `bin/`, `.htaccess`, `config.example.php`. Keep the
   `.htaccess` files, including the ones inside `lib/` and `bin/`. Turn on
   *Show hidden files* in File Manager to see `.htaccess`.

2. **Make password hashes** for the people who will sign in:

   ```bash
   php bin/make-password-hash.php 'a long password'   # 12+ characters
   ```

   It prints a `$2y$...` line.

3. **Create the configuration.** Copy `config.example.php` to `config.php` and
   fill in:

   - `api_base_url` — `https://api.kimutransport.com/api`.
   - `api_admin_username` / `api_admin_password` — the operator credentials the
     API knows (`ADMIN_USERNAME` and `ADMIN_PASSWORD` in the Render service
     environment).
   - `operators` — one `'username' => '<hash>'` line per dashboard user.

   Two places are supported for the file:

   - **Outside the web root (recommended):** save it as, for example,
     `/home/YOUR_CPANEL_USER/kimu-operator-config.php` and uncomment the
     `SetEnv KIMU_OPERATOR_CONFIG ...` line in `.htaccess` with that path.
     Nothing under `public_html` then contains a secret.
   - **Next to `index.php`:** save it as `public_html/admin/config.php`.
     `.htaccess` refuses to serve `config*.php`, so it is not downloadable, but
     a hosting misconfiguration could expose it; prefer the first option.

   Set the file's permissions to `600` (owner read/write only).

4. **Open** `https://your-domain/admin/` and sign in. The *Drivers to approve*
   tab lists every unverified driver with the state of each required document
   (not submitted / to check / rejected / approved), a *View* button for image
   files and *Open file* for PDFs, *Reject ...* buttons (the reason you type is
   sent to the driver's phone), and *I checked the originals — approve driver*,
   which records the in-person check on all four documents and verifies the
   account. The page refreshes itself every 15 seconds while it is visible (not
   while a preview is open).

### One-command deployment

```bash
bash scripts/deploy.sh <cPanel_user> <domain>
```

`deploy.sh` builds the rider web export (so `dist/` is always current), uploads
everything in `admin-php/` to `public_html/admin/` via SSH, and writes a starter
`config.php` outside the web root with placeholder values. Edit that file with
your API URL, API operator credentials, and dashboard operator hashes before
opening the page.

## Local development against a local API

```bash
# 1. API (see server/README.md); for example on port 3100
# 2. a config for this machine, anywhere outside the repo:
cp admin-php/config.example.php /tmp/kimu-operator-config.php
#    api_base_url => 'http://127.0.0.1:3100', api_admin_* => the API's ADMIN_* values,
#    operators => ['me' => '<hash from bin/make-password-hash.php>']
# 3. PHP's built-in server
KIMU_OPERATOR_CONFIG=/tmp/kimu-operator-config.php php -S 127.0.0.1:8080 -t admin-php
```

Open `http://127.0.0.1:8080/`.

## Security notes

- Sessions: `HttpOnly`, `SameSite=Lax`, `Secure` on HTTPS, strict ids,
  regenerated at sign-in, 2 h idle / 8 h absolute limits.
- CSRF: every POST (sign-in, sign-out, every decision) must carry the session's
  token (`X-CSRF-Token` header or hidden field); cross-site requests are refused.
- `api.php` forwards only the routes listed in `lib/upstream.php`, to the
  configured API only; the path and query are validated, so it cannot reach
  other hosts or other API routes.
- Document files are re-served only as `image/*` or `application/pdf` (anything
  else downloads as bytes), with `X-Content-Type-Options: nosniff`.
- Content-Security-Policy on the page allows only this origin's script and
  style files; nothing inline, no third-party resources.
- Wrong-password attempts are throttled per address; unknown usernames are
  verified against a dummy hash so timing does not reveal valid names.
- No secret is in this repository: `config.php` is ignored by git and
  `.htaccess` denies `config*.php`, `*.example.php`, `README.md`, and `.htaccess`
  under `config`, `lib`, and `bin`.
