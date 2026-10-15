<?php
// Kimu Operator dashboard configuration.
//
// Copy this file to config.php (next to index.php, where .htaccess refuses to
// serve it) or, better, to a file outside public_html and point at it with
// the KIMU_OPERATOR_CONFIG environment variable (see .htaccess). Never commit
// config.php: it holds the credentials the dashboard uses on your behalf.
return [
    // The Kimu Transport API. Every driver, document, payment case and SOS
    // lives there (Node + PostgreSQL on Render); this dashboard keeps no copy.
    'api_base_url' => 'https://fem-cabs-api.onrender.com',

    // The operator account the API knows: ADMIN_USERNAME and ADMIN_PASSWORD
    // from the API's environment. api.php signs in with these on the server
    // side and keeps the API's session token in the PHP session. They are
    // never sent to a browser.
    'api_admin_username' => '',
    'api_admin_password' => '',

    // Who may sign in to this dashboard: username => password hash. Make a
    // hash with `php bin/make-password-hash.php` (or any password_hash()
    // call) and paste it here. Several operators can be listed.
    'operators' => [
        // 'sonia' => '$2y$10$replace-with-the-hash-printed-by-make-password-hash',
    ],

    // How long a dashboard sign-in lasts (seconds), and how long it may sit
    // idle before the operator has to sign in again.
    'session_lifetime' => 8 * 3600,
    'session_idle_timeout' => 2 * 3600,

    // Wrong passwords allowed per address before sign-in is paused, and for
    // how long (seconds).
    'login_max_failures' => 5,
    'login_lockout_seconds' => 15 * 60,

    // Set true only when a proxy in front of this site terminates HTTPS and
    // sends X-Forwarded-Proto (plain cPanel hosting: leave false).
    'trust_forwarded_proto' => false,

    // Seconds to wait for the API. Render's free tier can take ~30 s to wake
    // up after idling, so the first request of the day is slow.
    'api_connect_timeout' => 20,
    'api_timeout' => 90,
];
