<?php
// cPanel MariaDB connection for features the dashboard owns (the Kimu API on
// Render keeps its own PostgreSQL; nothing here reads or writes that).
// Credentials live in /home/<cpanel user>/kimu-db-config.php, outside the web
// root, or in the file named by KIMU_DB_CONFIG.
declare(strict_types=1);

/** Returns a shared PDO connection (utf8mb4, exceptions on error). */
function kimu_db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }
    $candidates = [];
    $fromEnv = getenv('KIMU_DB_CONFIG');
    if (is_string($fromEnv) && $fromEnv !== '') {
        $candidates[] = $fromEnv;
    }
    $home = getenv('HOME');
    if (is_string($home) && $home !== '') {
        $candidates[] = rtrim($home, '/') . '/kimu-db-config.php';
    }
    $candidates[] = dirname(__DIR__, 2) . '/kimu-db-config.php';
    $cfg = null;
    foreach ($candidates as $path) {
        if (is_file($path) && is_readable($path)) {
            $cfg = require $path;
            break;
        }
    }
    if (!is_array($cfg)) {
        throw new RuntimeException('Database config not found: create kimu-db-config.php outside the web root.');
    }
    $dsn = sprintf('mysql:host=%s;dbname=%s;charset=%s', $cfg['host'], $cfg['name'], $cfg['charset'] ?? 'utf8mb4');
    $pdo = new PDO($dsn, (string) $cfg['user'], (string) $cfg['pass'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    return $pdo;
}
