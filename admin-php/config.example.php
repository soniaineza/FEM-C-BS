<?php
// Kimu Operator dashboard configuration.
//
// Copy this file to config.php (next to index.php, where .htaccess refuses to
// serve it) or, better, to a file OUTSIDE public_html and point at it with the
// KIMU_OPERATOR_CONFIG environment variable (see .htaccess). Never commit
// config.php: it holds the credentials the dashboard uses on your behalf.
//
// For cPanel, the cleanest setup is:
//   1. Upload admin-php/ (index.php, api.php, lib/, assets/, bin/, .htaccess)
//      to public_html/admin/ on your cPanel account.
//   2. Create /home/YOUR_CPANEL_USER/kimu-operator-config.php and set
//      SetEnv KIMU_OPERATOR_CONFIG /home/YOUR_CPANEL_USER/kimu-operator-config.php
//      in admin-php/.htaccess. Nothing secret then lives in public_html.
return [
    // The Kimu Transport API this dashboard talks to (HTTPS only).
    // Node on Render with its MySQL database on cPanel; this dashboard keeps no copy of any record.
    'api_base_url' => 'https://api.kimutransport.com/api',

    // Operator account the API knows: ADMIN_USERNAME / ADMIN_PASSWORD on the
    // Render service environment. api.php signs in to the API server-side and
    // keeps the API's token in the PHP session. Never sent to a browser.
    'api_admin_username' => '',
    'api_admin_password' => '',

    // Who may sign in to the dashboard: username => password_hash().
    // Generate a hash with `php bin/make-password-hash.php 'a long password'`
    // (12+ characters) and paste the $2y$ line here. Several operators allowed.
    'operators' => [
        // 'me' => '$2y$10$...',
    ],

    // Dashboard sign-in lifetime (seconds) / idle timeout (seconds).
    'session_lifetime' => 8 * 3600,
    'session_idle_timeout' => 2 * 3600,

    // Login throttle: failed attempts per address.
    'login_max_failures' => 5,
    'login_lockout_seconds' => 15 * 60,

    // HTTPS trust: false on plain cPanel; set true only if a proxy in front
    // sends X-Forwarded-Proto: https.
    'trust_forwarded_proto' => false,

    // API timeouts. Render's free tier can take ~30 s to wake after idling.
    'api_connect_timeout' => 20,
    'api_timeout' => 90,
];
