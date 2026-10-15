<?php
// The dashboard's only way to the Kimu API. The browser calls
//   api.php?path=/drivers&verified=false            (GET)
//   api.php?path=/documents/<id>/review              (POST, JSON body)
//   api.php?path=/documents/<id>/file                (GET, the file itself)
// and this script forwards it to <api_base_url>/api/admin<path> with the
// operator token it obtained from the configured credentials. Only the
// routes in lib/upstream.php are forwarded; every POST needs the session's
// CSRF token; nothing is served to a browser that is not signed in.
declare(strict_types=1);

define('KIMU_JSON_API', true);
require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/upstream.php';

kimu_security_headers();
header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'");

$method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
if (!in_array($method, ['GET', 'POST'], true)) {
    kimu_fail(405, 'Method not allowed.');
}

if (kimu_current_operator() === null) {
    kimu_fail(401, 'Sign in to the dashboard to continue.');
}

$path = (string) ($_GET['path'] ?? '');
if ($path === '' || $path[0] !== '/' || strpos($path, '..') !== false || !preg_match('#^/[A-Za-z0-9/_-]+$#', $path)) {
    kimu_fail(400, 'Unknown request.');
}
if (!kimu_route_allowed($method, $path)) {
    kimu_fail(404, 'This dashboard does not use that API route.');
}

if ($method === 'POST' && !kimu_csrf_ok()) {
    kimu_fail(403, 'Your dashboard session changed. Reload the page and try again.');
}

$query = $_GET;
unset($query['path']);
$query = kimu_allowed_query($path, $query);

// Document files are streamed as they are, with their content type.
if ($method === 'GET' && preg_match('#^/documents/[0-9a-fA-F-]{36}/file$#', $path)) {
    try {
        kimu_upstream_stream_file($path);
    } catch (Throwable $e) {
        kimu_fail(502, $e->getMessage());
    }
    exit;
}

$json = null;
if ($method === 'POST') {
    $raw = (string) file_get_contents('php://input');
    if ($raw !== '') {
        $decoded = json_decode($raw, true);
        if (!is_array($decoded)) {
            kimu_fail(400, 'The request body must be JSON.');
        }
        $json = $decoded;
    } else {
        $json = [];
    }
    // The operator's name travels with every decision, so the API's records
    // say who approved or rejected, not just that the dashboard did.
    if (!isset($json['reviewer']) && !isset($json['recordedBy'])) {
        $json['reviewer'] = kimu_current_operator();
    }
}

try {
    [$status, $data] = kimu_upstream_json($method, $path, $query, $json);
} catch (Throwable $e) {
    kimu_fail(502, $e->getMessage());
}

http_response_code($status);
header('Content-Type: application/json; charset=utf-8');
echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
