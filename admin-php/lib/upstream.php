<?php
// Talks to the Kimu API's /api/admin endpoints on the operator's behalf.
// Signs in with the configured operator credentials, keeps the API's
// eight-hour token in the PHP session, forwards whitelisted requests and
// streams document files back with their content type.
declare(strict_types=1);

/** Routes the dashboard may call, as [method, regex on the path]. */
function kimu_allowed_routes(): array
{
    $id = '[0-9a-fA-F-]{36}';
    return [
        ['GET', "#^/drivers$#"],
        ['GET', "#^/drivers/{$id}/balance$#"],
        ['POST', '#^/drivers/create$#'],
        ['POST', "#^/drivers/{$id}/verify$#"],
        ['POST', "#^/drivers/{$id}/suspend$#"],
        ['GET', "#^/documents/{$id}/file$#"],
        ['POST', "#^/documents/{$id}/review$#"],
        ['GET', '#^/payment-exceptions$#'],
        ['POST', "#^/payment-exceptions/{$id}/resolve$#"],
        ['GET', '#^/emergencies$#'],
        ['POST', "#^/emergencies/{$id}/resolve$#"],
        ['GET', '#^/integrations$#'],
        ['POST', '#^/integrations/otp/test$#'],
        ['GET', '#^/payouts$#'],
        ['POST', "#^/payouts/{$id}/(approve|reject)$#"],
        ['GET', '#^/paypack/status$#'],
    ];
}

/** Query parameters that may be forwarded, per path prefix. */
function kimu_allowed_query(string $path, array $query): array
{
    $allowed = [];
    if ($path === '/drivers') {
        $allowed = ['verified'];
    } elseif ($path === '/payouts') {
        $allowed = ['status'];
    }
    $out = [];
    foreach ($allowed as $key) {
        if (isset($query[$key]) && is_string($query[$key]) && preg_match('/^[A-Za-z0-9_-]{0,40}$/', $query[$key])) {
            $out[$key] = $query[$key];
        }
    }
    return $out;
}

function kimu_route_allowed(string $method, string $path): bool
{
    foreach (kimu_allowed_routes() as [$m, $re]) {
        if ($m === $method && preg_match($re, $path)) {
            return true;
        }
    }
    return false;
}

function kimu_api_url(string $path, array $query = []): string
{
    $config = kimu_config();
    $base = rtrim((string) $config['api_base_url'], '/');
    return $base . '/api/admin' . $path . ($query ? '?' . http_build_query($query) : '');
}

/** One cURL call returning [status, headers(lower-cased), body] or throwing. */
function kimu_curl(string $method, string $url, ?string $body, array $headers): array
{
    if (!function_exists('curl_init')) {
        throw new RuntimeException('PHP cURL extension is not enabled on this host.');
    }
    $config = kimu_config();
    $ch = curl_init($url);
    $responseHeaders = [];
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_CONNECTTIMEOUT => (int) $config['api_connect_timeout'],
        CURLOPT_TIMEOUT => (int) $config['api_timeout'],
        CURLOPT_HTTPHEADER => array_merge(['Accept: application/json', 'User-Agent: kimu-operator-php/' . KIMU_OPERATOR_VERSION], $headers),
        CURLOPT_HEADERFUNCTION => static function ($ch, string $line) use (&$responseHeaders): int {
            $parts = explode(':', $line, 2);
            if (count($parts) === 2) {
                $responseHeaders[strtolower(trim($parts[0]))] = trim($parts[1]);
            }
            return strlen($line);
        },
    ]);
    if ($body !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    }
    $out = curl_exec($ch);
    if ($out === false) {
        $err = curl_error($ch);
        curl_close($ch);
        throw new RuntimeException('Kimu API unreachable: ' . $err);
    }
    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    return [$status, $responseHeaders, (string) $out];
}

/** The API's operator token, signing in when there is none or it expired. */
function kimu_upstream_token(bool $forceNew = false): string
{
    kimu_session_start();
    $cached = $_SESSION['upstream'] ?? null;
    if (!$forceNew && is_array($cached) && !empty($cached['token']) && (int) ($cached['expires'] ?? 0) > time()) {
        return (string) $cached['token'];
    }
    $config = kimu_config();
    if ($config['api_admin_username'] === '' || $config['api_admin_password'] === '') {
        throw new RuntimeException('api_admin_username and api_admin_password are not set in config.php.');
    }
    [$status, , $body] = kimu_curl('POST', kimu_api_url('/login'), json_encode([
        'username' => $config['api_admin_username'],
        'password' => $config['api_admin_password'],
    ]), ['Content-Type: application/json']);
    $data = json_decode($body, true);
    if ($status !== 200 || !is_array($data) || empty($data['token'])) {
        $reason = is_array($data) && !empty($data['error']) ? (string) $data['error'] : "HTTP {$status}";
        throw new RuntimeException('The API refused the operator credentials in config.php: ' . $reason);
    }
    // The API issues eight-hour tokens; renew a little before that.
    $_SESSION['upstream'] = ['token' => (string) $data['token'], 'expires' => time() + 7 * 3600 + 1800];
    return (string) $data['token'];
}

/**
 * Forwards a JSON request. Returns [status, bodyArray]. A 401 from the API
 * (token expired or revoked) is retried once with a fresh token.
 */
function kimu_upstream_json(string $method, string $path, array $query, ?array $json): array
{
    $url = kimu_api_url($path, $query);
    $payload = $json === null ? null : json_encode($json, JSON_UNESCAPED_SLASHES);
    $headers = $payload === null ? [] : ['Content-Type: application/json'];
    for ($attempt = 0; $attempt < 2; $attempt++) {
        $token = kimu_upstream_token($attempt > 0);
        [$status, , $body] = kimu_curl($method, $url, $payload, array_merge($headers, ['Authorization: Bearer ' . $token]));
        if ($status === 401 && $attempt === 0) {
            continue;
        }
        $data = json_decode($body, true);
        if (!is_array($data)) {
            $data = ['error' => $status >= 200 && $status < 300 ? 'The API sent an unexpected reply.' : "The API answered HTTP {$status}."];
        }
        return [$status, $data];
    }
    return [502, ['error' => 'The API keeps refusing the operator session.']];
}

/** Content types a document file may be shown as; anything else downloads as bytes. */
function kimu_inline_types(): array
{
    return ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif', 'application/pdf'];
}

/**
 * Streams GET /documents/:id/file straight to the browser: the status and
 * content type come from the API, the bytes are passed through as they
 * arrive. An error from the API is relayed as JSON.
 */
function kimu_upstream_stream_file(string $path): void
{
    $url = kimu_api_url($path);
    if (!function_exists('curl_init')) {
        kimu_fail(500, 'PHP cURL extension is not enabled on this host.');
    }
    $config = kimu_config();
    for ($attempt = 0; $attempt < 2; $attempt++) {
        $token = kimu_upstream_token($attempt > 0);
        $status = 0;
        $contentType = '';
        $disposition = '';
        $length = null;
        $started = false;
        $errorBody = '';
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_HTTPGET => true,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_CONNECTTIMEOUT => (int) $config['api_connect_timeout'],
            CURLOPT_TIMEOUT => (int) $config['api_timeout'],
            CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $token, 'User-Agent: kimu-operator-php/' . KIMU_OPERATOR_VERSION],
            CURLOPT_HEADERFUNCTION => static function ($ch, string $line) use (&$status, &$contentType, &$disposition, &$length): int {
                if (preg_match('#^HTTP/\S+\s+(\d{3})#', $line, $m)) {
                    $status = (int) $m[1];
                    return strlen($line);
                }
                $parts = explode(':', $line, 2);
                if (count($parts) === 2) {
                    $name = strtolower(trim($parts[0]));
                    $value = trim($parts[1]);
                    if ($name === 'content-type') {
                        $contentType = strtolower(explode(';', $value)[0]);
                    } elseif ($name === 'content-disposition') {
                        $disposition = $value;
                    } elseif ($name === 'content-length' && ctype_digit($value)) {
                        $length = (int) $value;
                    }
                }
                return strlen($line);
            },
            CURLOPT_WRITEFUNCTION => static function ($ch, string $chunk) use (&$status, &$contentType, &$disposition, &$length, &$started, &$errorBody): int {
                if ($status !== 200) {
                    $errorBody .= $chunk;
                    return strlen($chunk);
                }
                if (!$started) {
                    $started = true;
                    $inline = in_array($contentType, kimu_inline_types(), true);
                    $name = 'driver-document';
                    if (preg_match('/filename="?([^";]+)"?/i', $disposition, $m)) {
                        $name = preg_replace('/[^A-Za-z0-9._ -]/', '_', $m[1]) ?: $name;
                    }
                    http_response_code(200);
                    header('Content-Type: ' . ($inline ? $contentType : 'application/octet-stream'));
                    header('Content-Disposition: ' . ($inline ? 'inline' : 'attachment') . '; filename="' . $name . '"');
                    header('Cache-Control: private, no-store');
                    header('X-Content-Type-Options: nosniff');
                    if ($length !== null) {
                        header('Content-Length: ' . $length);
                    }
                }
                echo $chunk;
                flush();
                return strlen($chunk);
            },
        ]);
        // Output buffering and compression would hold the whole file in memory.
        ini_set('zlib.output_compression', '0');
        while (ob_get_level() > 0) {
            ob_end_clean();
        }
        $ok = curl_exec($ch);
        $err = $ok === false ? curl_error($ch) : '';
        curl_close($ch);
        if ($ok === false) {
            if ($started) {
                exit; // the browser already received part of the file; nothing more to say
            }
            kimu_fail(502, 'Kimu API unreachable: ' . $err);
        }
        if ($status === 401 && $attempt === 0) {
            continue;
        }
        if ($status === 200) {
            exit;
        }
        $data = json_decode($errorBody, true);
        kimu_fail($status >= 400 && $status < 600 ? $status : 502, is_array($data) && !empty($data['error']) ? (string) $data['error'] : "The API answered HTTP {$status}.");
    }
    kimu_fail(502, 'The API keeps refusing the operator session.');
}
