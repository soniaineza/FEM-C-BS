<?php
// Kimu Admin dashboard: sign in, then review driver applications, decide
// payment cases and close SOS events. All data comes live from the Kimu API
// through api.php; this page holds no secret and no copy of any record.
declare(strict_types=1);

require __DIR__ . '/lib/bootstrap.php';

kimu_security_headers();
header("Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' blob:; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
header('Content-Type: text/html; charset=utf-8');

$config = kimu_config();
$flash = null;

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    $action = (string) ($_POST['action'] ?? '');
    if (!kimu_csrf_ok()) {
        $flash = 'The form expired. Please try again.';
    } elseif ($action === 'logout') {
        kimu_sign_out();
        header('Location: ' . kimu_base_path(), true, 303);
        exit;
    } elseif ($action === 'login') {
        $wait = kimu_login_locked_for();
        $username = trim((string) ($_POST['username'] ?? ''));
        $password = (string) ($_POST['password'] ?? '');
        if ($wait > 0) {
            $flash = 'Too many wrong passwords. Try again in ' . (int) ceil($wait / 60) . ' min.';
        } elseif ($username === '' || $password === '') {
            $flash = 'Enter your username and password.';
        } elseif (kimu_sign_in($username, $password)) {
            kimu_login_succeeded();
            header('Location: ' . kimu_base_path(), true, 303);
            exit;
        } else {
            kimu_login_failed();
            $flash = 'Invalid username or password.';
        }
    }
}

$operator = kimu_current_operator();
$csrf = kimu_csrf_token();
$configured = $config['api_admin_username'] !== '' && $config['api_admin_password'] !== '' && !empty($config['operators']);
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="csrf-token" content="<?= kimu_escape($csrf) ?>">
<title>Kimu Admin</title>
<link rel="stylesheet" href="assets/app.css?v=<?= kimu_escape(KIMU_OPERATOR_VERSION) ?>">
</head>
<body>
<main>
  <header>
    <h1>Kimu Admin</h1>
    <?php if ($operator !== null): ?>
    <form method="post" class="inline">
      <input type="hidden" name="csrf" value="<?= kimu_escape($csrf) ?>">
      <input type="hidden" name="action" value="logout">
      <span class="muted who"><?= kimu_escape($operator) ?></span>
      <button type="submit">Sign out</button>
    </form>
    <?php endif; ?>
  </header>

<?php if (!$configured): ?>
  <section class="card">
    <h2>Not configured</h2>
    <p>Create <code>config.php</code> from <code>config.example.php</code> with the API operator credentials and at least one dashboard operator (see README.md).</p>
  </section>
<?php elseif ($operator === null): ?>
  <section class="card">
    <h2>Sign in</h2>
    <p class="muted">Sign in with your dashboard username and password. The session ends when you sign out, after <?= (int) ($config['session_idle_timeout'] / 3600) ?> h without activity, or after <?= (int) ($config['session_lifetime'] / 3600) ?> h at most.</p>
    <form method="post" autocomplete="on">
      <input type="hidden" name="csrf" value="<?= kimu_escape($csrf) ?>">
      <input type="hidden" name="action" value="login">
      <label for="username">Username</label>
      <input id="username" name="username" type="text" autocomplete="username" required autofocus>
      <label for="password">Password</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required>
      <div class="row"><button type="submit" class="primary">Continue</button></div>
      <?php if ($flash !== null): ?><p class="error" role="alert"><?= kimu_escape($flash) ?></p><?php endif; ?>
    </form>
  </section>
<?php else: ?>
  <section id="app" data-operator="<?= kimu_escape($operator) ?>">
    <nav aria-label="Sections">
      <button data-tab="drivers" aria-pressed="true">Drivers to approve</button>
      <button data-tab="verified" aria-pressed="false">Verified drivers</button>
      <button data-tab="cases" aria-pressed="false">Payment cases</button>
      <button data-tab="sos" aria-pressed="false">Emergencies</button>
      <button data-tab="integrations" aria-pressed="false">Integrations</button>
      <button id="reload">Refresh</button>
    </nav>
    <p id="status" class="muted" role="status"></p>
    <div id="list"></div>
  </section>
  <script src="assets/app.js?v=<?= kimu_escape(KIMU_OPERATOR_VERSION) ?>"></script>
<?php endif; ?>
</main>
</body>
</html>
