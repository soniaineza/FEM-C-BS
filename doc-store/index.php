<?php
// Kimu document store: keeps driver document files on this cPanel host for the
// Kimu API (Render). It knows nothing about drivers or the database; it only
// holds opaque files named by a UUID.
//
//   PUT    index.php?id=<uuid>   body = the file bytes   -> 201 {"size": n}
//   GET    index.php?id=<uuid>                           -> 200 the bytes | 404
//   DELETE index.php?id=<uuid>                           -> 204 (also when absent)
//
// Every call must carry the shared secret in the X-Store-Token header and
// arrive over HTTPS. Files go to storage_dir, which must be OUTSIDE public_html
// so they can never be fetched by URL; the secret and that path live in a
// config file outside public_html too (see README.md).
declare(strict_types=1);

const KIMU_STORE_CHUNK = 65536;

function kimu_store_reply(int $status, ?array $body = null): never
{
    http_response_code($status);
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    if ($body !== null) {
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($body, JSON_UNESCAPED_SLASHES);
    }
    exit;
}

function kimu_store_fail(int $status, string $message): never
{
    kimu_store_reply($status, ['error' => $message]);
}

$configFile = getenv('KIMU_DOC_STORE_CONFIG') ?: dirname(__DIR__, 2) . '/kimu-doc-store-config.php';
$config = is_file($configFile) ? require $configFile : null;
if (!is_array($config) || strlen((string) ($config['token'] ?? '')) < 32 || (string) ($config['storage_dir'] ?? '') === '') {
    error_log('kimu doc-store: config file missing or incomplete: ' . $configFile);
    kimu_store_fail(500, 'The document store is not configured.');
}
$maxBytes = (int) ($config['max_bytes'] ?? 13 * 1024 * 1024);

$https = !empty($_SERVER['HTTPS']) && strtolower((string) $_SERVER['HTTPS']) !== 'off';
if (!$https) {
    kimu_store_fail(403, 'HTTPS is required.');
}

$sent = (string) ($_SERVER['HTTP_X_STORE_TOKEN'] ?? '');
if (!hash_equals((string) $config['token'], $sent)) {
    usleep(300000); // slows down guessing
    kimu_store_fail(401, 'Not authorised.');
}

$id = (string) ($_GET['id'] ?? '');
if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/', $id)) {
    kimu_store_fail(400, 'Unknown request.');
}

$dir = rtrim((string) $config['storage_dir'], '/\\');
if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) {
    error_log('kimu doc-store: cannot create ' . $dir);
    kimu_store_fail(500, 'The document store is not writable.');
}
$path = $dir . '/' . $id;
$method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));

if ($method === 'PUT') {
    $declared = isset($_SERVER['CONTENT_LENGTH']) ? (int) $_SERVER['CONTENT_LENGTH'] : null;
    if ($declared !== null && $declared > $maxBytes) {
        kimu_store_fail(413, 'File too large.');
    }
    // Written to a temporary name and renamed into place, so a reader never
    // sees half a file and a cut-off upload never replaces a good one.
    $tmp = tempnam($dir, '.upload-');
    $in = fopen('php://input', 'rb');
    $out = $tmp === false ? false : fopen($tmp, 'wb');
    if ($in === false || $out === false) {
        error_log('kimu doc-store: cannot open upload streams in ' . $dir);
        kimu_store_fail(500, 'The document store is not writable.');
    }
    $size = 0;
    $problem = null;
    while (!feof($in)) {
        $chunk = fread($in, KIMU_STORE_CHUNK);
        if ($chunk === false) {
            $problem = [400, 'The upload was interrupted.'];
            break;
        }
        $size += strlen($chunk);
        if ($size > $maxBytes) {
            $problem = [413, 'File too large.'];
            break;
        }
        if ($chunk !== '' && fwrite($out, $chunk) !== strlen($chunk)) {
            error_log('kimu doc-store: write failed (disk full?) in ' . $dir);
            $problem = [507, 'The document store is full.'];
            break;
        }
    }
    fclose($in);
    fclose($out);
    if ($problem === null && ($size === 0 || ($declared !== null && $declared !== $size))) {
        $problem = [400, $size === 0 ? 'The file is empty.' : 'The upload was cut off.'];
    }
    if ($problem !== null) {
        @unlink($tmp);
        kimu_store_fail($problem[0], $problem[1]);
    }
    chmod($tmp, 0600);
    if (!rename($tmp, $path)) {
        @unlink($tmp);
        kimu_store_fail(500, 'The document store is not writable.');
    }
    kimu_store_reply(201, ['size' => $size]);
}

if ($method === 'GET') {
    if (!is_file($path)) {
        kimu_store_fail(404, 'No such file.');
    }
    // The API knows the real content type; the store never guesses one.
    header('Content-Type: application/octet-stream');
    header('Content-Length: ' . filesize($path));
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    while (ob_get_level() > 0) {
        ob_end_clean();
    }
    readfile($path);
    exit;
}

if ($method === 'DELETE') {
    if (is_file($path)) {
        unlink($path);
    }
    kimu_store_reply(204);
}

header('Allow: GET, PUT, DELETE');
kimu_store_fail(405, 'Method not allowed.');
