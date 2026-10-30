<?php
// Copy to /home/<cpanel user>/kimu-doc-store-config.php (OUTSIDE public_html)
// and fill in. The same token goes into the API as DOCUMENT_STORE_TOKEN.
// Make a token with:  php -r "echo bin2hex(random_bytes(32)), PHP_EOL;"
// (or any 64-character random string from a password generator).
return [
    'token' => 'PUT-A-LONG-RANDOM-SECRET-HERE',
    // Where the files are kept. Must be outside public_html.
    'storage_dir' => '/home/unguka/kimu-documents',
    // Largest file accepted; the API allows 12 MB, this leaves some headroom.
    'max_bytes' => 13 * 1024 * 1024,
];
