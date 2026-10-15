# Kimu Operator dashboard (PHP, for cPanel)

The operator's page for the Kimu Transport service, as plain PHP that runs on
shared cPanel hosting: approve drivers after checking their four documents,
reject a document with a reason, open each uploaded file, decide payment
cases, close SOS events, check the Google / OTP integrations. Everything is
read from and written to the Kimu API (`https://fem-cabs-api.onrender.com`,
Node + PostgreSQL); this dashboard keeps **no database and no copy** of any
record.

```
operator-php/
  index.php             sign-in form and the dashboard page
  api.php               server-side proxy to <API>/api/admin/* (whitelisted routes, CSRF-checked)
  lib/bootstrap.php     config loading, hardened session, CSRF, sign-in throttle
  lib/upstream.php      cURL client: API operator token, JSON forwarding, file streaming
  assets/app.js, app.css
  config.example.php    copy to config.php (never committed)
  bin/make-password-hash.php
  .htaccess             security headers, denies config/lib/bin
```

How it works: the operator signs in to the dashboard with a username and a
`password_hash()` from `config.php`. The browser then calls `api.php`, which
signs in to the Kimu API with the API operator credentials from `config.php`
(`ADMIN_USERNAME` / `ADMIN_PASSWORD` on Render), keeps the API's eight-hour
token in the PHP session, and forwards only the routes the dashboard needs.
Document files (`/api/admin/documents/<id>/file`) are streamed through
`api.php` with their content type, so images show inline and PDFs open in a
new tab. The API credentials and token never reach the browser.

## Requirements

- PHP 8.0 or newer with the `curl` and `json` extensions (standard on cPanel;
  choose the version in cPanel > *MultiPHP Manager*).
- HTTPS on the domain (cPanel > *SSL/TLS Status* > AutoSSL). The session
  cookie is marked `Secure` automatically when the page is served over HTTPS.

## Install on cPanel

1. **Upload.** In cPanel > *File Manager* (or by FTP/SFTP) create a folder
   under `public_html`, e.g. `public_html/operator`, and upload everything in
   this directory into it (`index.php`, `api.php`, `assets/`, `lib/`, `bin/`,
   `.htaccess`, `config.example.php`). Keep the `.htaccess` files, including
   the ones inside `lib/` and `bin/`; turn on *Show hidden files* in File
   Manager to see them.

2. **Make password hashes** for the people who will sign in. On any machine
   with PHP (or in cPanel > *Terminal*):

   ```
   php bin/make-password-hash.php 'a long password'
   ```

   It prints a `$2y$...` hash. Without a terminal, the one-liner
   `php -r "echo password_hash('a long password', PASSWORD_DEFAULT);"` does
   the same.

3. **Create the configuration.** Copy `config.example.php` to `config.php` and
   fill in:

   - `api_base_url` — the API, `https://fem-cabs-api.onrender.com`.
   - `api_admin_username` / `api_admin_password` — the operator credentials
     the API knows (`ADMIN_USERNAME` and `ADMIN_PASSWORD` in the Render
     service's environment).
   - `operators` — one `'username' => '<hash>'` line per dashboard user.

   Two places are supported for this file:

   - **Outside the web root (recommended):** save it as, for example,
     `/home/YOUR_CPANEL_USER/kimu-operator-config.php` and uncomment the
     `SetEnv KIMU_OPERATOR_CONFIG ...` line in `.htaccess` with that path.
     Nothing under `public_html` then contains a secret.
   - **Next to `index.php`:** save it as `public_html/operator/config.php`.
     `.htaccess` refuses to serve `config*.php`, so it is not downloadable,
     but a hosting misconfiguration could expose it; prefer the first option.

   Set the file's permissions to `600` (owner read/write only).

4. **Open** `https://your-domain/operator/` and sign in. The *Drivers to
   approve* tab lists every unverified driver with the state of each required
   document (not submitted / to check / rejected / approved), a *View* button
   for image files and *Open file* for PDFs, *Reject ...* buttons (the reason
   you type is sent to the driver's phone), and *I checked the originals —
   approve driver*, which records the in-person check on all four documents
   and verifies the account. The page refreshes itself every 15 seconds while
   it is visible (not while a preview is open).

### If something does not work

- *"Not configured"* — `config.php` was not found or `operators` is empty.
- *"The API refused the operator credentials in config.php"* — the
  `api_admin_*` values do not match the API's `ADMIN_USERNAME` /
  `ADMIN_PASSWORD`.
- *"Kimu API unreachable"* — the host cannot reach Render (outbound HTTPS is
  blocked, or the API is asleep: Render's free tier takes up to ~30 s to wake,
  which is why `api_timeout` is 90 s).
- HTTP 500 right after upload — remove or correct the `SetEnv` line, and check
  that the PHP version is 8.0+ with `curl` enabled.
- Sign-in paused after wrong passwords — five failures per address pause
  sign-in for 15 minutes (`login_max_failures`, `login_lockout_seconds`).

## Run it locally against a local API

```
# 1. API (see server/README.md); for example on port 3100
# 2. a config for this machine, anywhere outside the repo:
cp operator-php/config.example.php /tmp/kimu-operator-config.php
#    api_base_url => 'http://127.0.0.1:3100', api_admin_* => the API's ADMIN_* values,
#    operators => ['me' => '<hash from bin/make-password-hash.php>']
# 3. PHP's built-in server
KIMU_OPERATOR_CONFIG=/tmp/kimu-operator-config.php php -S 127.0.0.1:8080 -t operator-php
```

Open `http://127.0.0.1:8080/`. (On Windows PowerShell:
`$env:KIMU_OPERATOR_CONFIG='C:\path\kimu-operator-config.php'; php -S 127.0.0.1:8080 -t operator-php`.)

## Security notes

- Sessions: `HttpOnly`, `SameSite=Lax`, `Secure` on HTTPS, strict ids,
  regenerated at sign-in, 2 h idle / 8 h absolute limits.
- CSRF: every POST (sign-in, sign-out, every decision) must carry the
  session's token (`X-CSRF-Token` header or hidden field); requests the
  browser marks as cross-site are refused.
- `api.php` forwards only the routes listed in `lib/upstream.php`, to the
  configured API only; the path and query are validated, so it cannot be
  used to reach other hosts or other API routes.
- Document files are re-served only as image/* or application/pdf (anything
  else downloads as bytes), with `X-Content-Type-Options: nosniff`.
- Content-Security-Policy on the page allows only this origin's script and
  style files; nothing inline, no third-party resources.
- Wrong-password attempts are throttled per address; unknown usernames are
  verified against a dummy hash so timing does not reveal valid names.
- No secret is in this repository: `config.php` is ignored by git.
