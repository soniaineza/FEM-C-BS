<?php
// Shared setup for index.php and api.php: configuration, hardened session,
// security headers, CSRF tokens, operator sign-in and its throttle.
declare(strict_types=1);

const KIMU_OPERATOR_VERSION = '1.0.0';

/** Loads config.php (or the file named by KIMU_OPERATOR_CONFIG). */
function kimu_config(): array
{
    static $config = null;
    if ($config !== null) {
        return $config;
    }
    $candidates = [];
    $fromEnv = getenv('KIMU_OPERATOR_CONFIG');
    if (is_string($fromEnv) && $fromEnv !== '') {
        $candidates[] = $fromEnv;
    }
    $candidates[] = dirname(__DIR__) . '/config.php';
    foreach ($candidates as $path) {
        if (is_file($path) && is_readable($path)) {
            $loaded = require $path;
            if (!is_array($loaded)) {
                kimu_fail(500, 'config.php must return an array.');
            }
            $config = array_merge(kimu_default_config(), $loaded);
            return $config;
        }
    }
    kimu_fail(503, 'The dashboard is not configured yet: create config.php from config.example.php.');
}

function kimu_default_config(): array
{
    return [
        'api_base_url' => 'https://fem-cabs-api.onrender.com',
        'api_admin_username' => '',
        'api_admin_password' => '',
        'operators' => [],
        'session_lifetime' => 8 * 3600,
        'session_idle_timeout' => 2 * 3600,
        'login_max_failures' => 5,
        'login_lockout_seconds' => 900,
        'trust_forwarded_proto' => false,
        'api_connect_timeout' => 20,
        'api_timeout' => 90,
    ];
}

/** Stops with a plain error page or JSON body, depending on the caller. */
function kimu_fail(int $status, string $message): void
{
    http_response_code($status);
    if (defined('KIMU_JSON_API')) {
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['error' => $message], JSON_UNESCAPED_SLASHES);
    } else {
        header('Content-Type: text/plain; charset=utf-8');
        echo $message;
    }
    exit;
}

function kimu_is_https(): bool
{
    if (!empty($_SERVER['HTTPS']) && strtolower((string) $_SERVER['HTTPS']) !== 'off') {
        return true;
    }
    if ((int) ($_SERVER['SERVER_PORT'] ?? 0) === 443) {
        return true;
    }
    $config = kimu_config();
    if (!empty($config['trust_forwarded_proto']) &&
        strtolower((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https') {
        return true;
    }
    return false;
}

/** The directory this dashboard is served from, for the cookie path. */
function kimu_base_path(): string
{
    $script = (string) ($_SERVER['SCRIPT_NAME'] ?? '/');
    $dir = rtrim(str_replace('\\', '/', dirname($script)), '/');
    return $dir === '' ? '/' : $dir . '/';
}

/** Headers every response carries. The page sets its own CSP in index.php. */
function kimu_security_headers(): void
{
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: DENY');
    header('Referrer-Policy: no-referrer');
    header('Cache-Control: no-store');
    header('Permissions-Policy: camera=(), microphone=(), geolocation=()');
    header_remove('X-Powered-By');
}

function kimu_session_start(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    $config = kimu_config();
    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    ini_set('session.gc_maxlifetime', (string) (int) $config['session_lifetime']);
    session_name('kimu_operator');
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => kimu_base_path(),
        'domain' => '',
        'secure' => kimu_is_https(),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
    }
}

function kimu_csrf_token(): string
{
    kimu_session_start();
    return (string) $_SESSION['csrf'];
}

/** True when the request carries this session's CSRF token (header or field). */
function kimu_csrf_ok(): bool
{
    kimu_session_start();
    $given = (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ($_POST['csrf'] ?? ''));
    if ($given === '' || empty($_SESSION['csrf'])) {
        return false;
    }
    // A browser that says the request came from another site is refused even
    // with a token (defence in depth; older browsers do not send the header).
    $site = strtolower((string) ($_SERVER['HTTP_SEC_FETCH_SITE'] ?? ''));
    if ($site !== '' && !in_array($site, ['same-origin', 'none'], true)) {
        return false;
    }
    return hash_equals((string) $_SESSION['csrf'], $given);
}

/** The signed-in operator's username, or null. Expired sessions are ended. */
function kimu_current_operator(): ?string
{
    kimu_session_start();
    if (empty($_SESSION['operator'])) {
        return null;
    }
    $config = kimu_config();
    $now = time();
    $signedIn = (int) ($_SESSION['signed_in_at'] ?? 0);
    $lastSeen = (int) ($_SESSION['last_seen_at'] ?? 0);
    if ($now - $signedIn > (int) $config['session_lifetime'] || $now - $lastSeen > (int) $config['session_idle_timeout']) {
        kimu_sign_out();
        return null;
    }
    $_SESSION['last_seen_at'] = $now;
    return (string) $_SESSION['operator'];
}

function kimu_sign_out(): void
{
    kimu_session_start();
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $p = session_get_cookie_params();
        setcookie(session_name(), '', [
            'expires' => time() - 42000,
            'path' => $p['path'],
            'domain' => $p['domain'],
            'secure' => $p['secure'],
            'httponly' => $p['httponly'],
            'samesite' => $p['samesite'],
        ]);
    }
    session_destroy();
}

function kimu_client_ip(): string
{
    return (string) ($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0');
}

/** Where failed sign-ins per address are counted (outside the web root). */
function kimu_throttle_file(): string
{
    return rtrim(sys_get_temp_dir(), '/\\') . '/kimu-operator-logins-' . substr(hash('sha256', __DIR__), 0, 16) . '.json';
}

function kimu_throttle_read(): array
{
    $file = kimu_throttle_file();
    if (!is_file($file)) {
        return [];
    }
    $data = json_decode((string) @file_get_contents($file), true);
    return is_array($data) ? $data : [];
}

function kimu_throttle_write(array $data): void
{
    $now = time();
    $config = kimu_config();
    foreach ($data as $ip => $entry) {
        if ($now - (int) ($entry['last'] ?? 0) > (int) $config['login_lockout_seconds']) {
            unset($data[$ip]);
        }
    }
    @file_put_contents(kimu_throttle_file(), json_encode($data), LOCK_EX);
}

/** Seconds the caller must still wait before another sign-in attempt, or 0. */
function kimu_login_locked_for(): int
{
    $config = kimu_config();
    $entry = kimu_throttle_read()[kimu_client_ip()] ?? null;
    if (!$entry || (int) $entry['failures'] < (int) $config['login_max_failures']) {
        return 0;
    }
    $remaining = (int) $entry['last'] + (int) $config['login_lockout_seconds'] - time();
    return $remaining > 0 ? $remaining : 0;
}

function kimu_login_failed(): void
{
    $data = kimu_throttle_read();
    $ip = kimu_client_ip();
    $data[$ip] = ['failures' => (int) ($data[$ip]['failures'] ?? 0) + 1, 'last' => time()];
    kimu_throttle_write($data);
    // Slow down guessing without holding a worker for long.
    usleep(300000);
}

function kimu_login_succeeded(): void
{
    $data = kimu_throttle_read();
    unset($data[kimu_client_ip()]);
    kimu_throttle_write($data);
}

/** Checks the dashboard credentials; on success starts the operator session. */
function kimu_sign_in(string $username, string $password): bool
{
    $config = kimu_config();
    $hash = $config['operators'][$username] ?? null;
    // Verify against a dummy hash when the user is unknown, so the timing
    // does not reveal which usernames exist.
    $dummy = '$2y$10$7EqJtq98hPqEX7fNZaFWoOhi5XIuMjHO8kXKnwEIh4r5pIbrh0yJa';
    $ok = password_verify($password, is_string($hash) ? $hash : $dummy) && is_string($hash);
    if (!$ok) {
        return false;
    }
    kimu_session_start();
    session_regenerate_id(true);
    $_SESSION['operator'] = $username;
    $_SESSION['signed_in_at'] = time();
    $_SESSION['last_seen_at'] = time();
    $_SESSION['csrf'] = bin2hex(random_bytes(32));
    unset($_SESSION['upstream']);
    if (is_string($hash) && password_needs_rehash($hash, PASSWORD_DEFAULT)) {
        // Nothing to do here: hashes live in config.php, which this code never
        // writes. Regenerate it with bin/make-password-hash.php when PHP's
        // default algorithm changes.
    }
    return true;
}

function kimu_escape(?string $value): string
{
    return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}
