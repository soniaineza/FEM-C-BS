<?php
// Prints a password hash for config.php's "operators" list.
//
//   php bin/make-password-hash.php              (asks for the password)
//   php bin/make-password-hash.php 'the password'
//
// Paste the printed line into config.php: 'username' => '<hash>',
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

$password = $argv[1] ?? null;
if ($password === null) {
    fwrite(STDOUT, "Password: ");
    $password = rtrim((string) fgets(STDIN), "\r\n");
}
if (strlen($password) < 12) {
    fwrite(STDERR, "Use at least 12 characters.\n");
    exit(1);
}
echo password_hash($password, PASSWORD_DEFAULT), PHP_EOL;
