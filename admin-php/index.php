<?php
declare(strict_types=1);

/** KIMU Admin login page. Dashboard is kept separate in dashboard.php. */
require_once __DIR__ . '/lib/bootstrap.php';
kimu_security_headers();
header("Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; form-action 'self'; base-uri 'self'; frame-ancestors 'none'");
header('Content-Type: text/html; charset=utf-8');

$config = kimu_config();
$flash = null;
$basePath = (string) kimu_base_path();
$csrf = kimu_csrf_token();
$assetVersion = defined('KIMU_OPERATOR_VERSION') ? (string) KIMU_OPERATOR_VERSION : '1';
$operator = kimu_current_operator();
$configured = !empty($config['api_admin_username']) && !empty($config['api_admin_password']) && !empty($config['operators']) && is_array($config['operators']);

if ($operator !== null && ($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    header('Location: ' . rtrim($basePath, '/') . '/dashboard.php', true, 302);
    exit;
}
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    $action = (string) ($_POST['action'] ?? '');
    if (!kimu_csrf_ok()) {
        $flash = 'The form expired. Refresh the page and try again.';
    } elseif ($action === 'login') {
        $wait = (int) kimu_login_locked_for();
        $username = trim((string) ($_POST['username'] ?? ''));
        $password = (string) ($_POST['password'] ?? '');
        if ($wait > 0) {
            $flash = 'Too many unsuccessful attempts. Try again in ' . (int) ceil($wait / 60) . ' minute(s).';
        } elseif ($username === '' || $password === '') {
            $flash = 'Enter your username and password.';
        } elseif (kimu_sign_in($username, $password)) {
            kimu_login_succeeded();
            header('Location: ' . rtrim($basePath, '/') . '/dashboard.php', true, 303);
            exit;
        } else {
            kimu_login_failed();
            $flash = 'Invalid username or password.';
        }
    } else {
        $flash = 'That action is not supported.';
    }
}
function kimu_index_asset(string $path, string $version): string { return $path . '?v=' . rawurlencode($version); }
?>
<!doctype html>
<html lang="en">
<head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><meta name="csrf-token" content="<?= kimu_escape($csrf) ?>">
<meta name="theme-color" content="#e2f5fc"><title>KIMU Admin | Sign in</title>
<link rel="stylesheet" href="<?= kimu_escape(kimu_index_asset('assets/app.css', $assetVersion)) ?>">
<style>
:root{--ink:#14264a;--muted:#7583a2;--green:#078b50;--orange:#f28b24;--violet:#4c2cf3;--line:#e1e7f3}
*{box-sizing:border-box}html,body{margin:0;min-height:100%;font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink)}
body{min-height:100svh;display:grid;place-items:center;padding:clamp(12px,3vw,38px);background:radial-gradient(ellipse at 10% 10%,#fff 0,#e9f8ff 45%,#d7effb 100%);overflow-x:hidden}
.login-frame{width:min(1240px,100%);height:min(760px,calc(100svh - 48px));min-height:570px;display:grid;grid-template-columns:minmax(360px,.92fr) minmax(0,1.08fr);overflow:hidden;background:#fff;border-radius:32px;box-shadow:0 28px 90px #1e47721c;border:1px solid #ffffffb8}
.login-side{min-width:0;padding:clamp(28px,4vw,62px);display:flex;flex-direction:column;justify-content:center;overflow:auto}.brand{display:flex;align-items:center;gap:13px;margin-bottom:clamp(20px,4vh,42px)}.brand img{width:66px;height:66px;object-fit:contain}.brand-text{font-weight:900;font-size:27px;line-height:1.05;letter-spacing:-1px}.brand-text span{display:block;color:var(--orange);font-size:18px;letter-spacing:2px;margin-top:4px}
.kicker{display:inline-flex;align-items:center;gap:8px;color:var(--green);font-size:10px;font-weight:800;letter-spacing:1.4px;margin-bottom:10px}.kicker:before{content:"";width:22px;height:3px;background:var(--green);border-radius:99px}h1{font-size:clamp(29px,3vw,42px);letter-spacing:-1.7px;line-height:1.08;margin:0 0 10px} .sub{margin:0 0 26px;color:var(--muted);font-size:14px;line-height:1.6}
form.login-form{display:grid;gap:9px}label{font-size:12px;font-weight:750;margin-top:5px}.input-wrap{display:flex;align-items:center;gap:10px;border:1px solid #dbe2ef;border-radius:15px;height:51px;padding:0 14px;transition:border-color .2s,box-shadow .2s}.input-wrap:focus-within{border-color:#7a66ff;box-shadow:0 0 0 4px #4c2cf313}.input-wrap svg{width:19px;height:19px;flex:none;color:#7483a5}.input-wrap input{min-width:0;width:100%;border:0;outline:0;background:transparent;color:var(--ink);font:inherit;font-size:13px}.input-wrap input::placeholder{color:#99a5bd}.toggle{border:0;background:none;color:#647394;cursor:pointer;padding:4px;font-size:12px}
.form-meta{display:flex;justify-content:flex-end;font-size:11px;color:var(--muted);padding:2px 0 5px}.submit{height:51px;border:0;border-radius:15px;background:linear-gradient(100deg,#4c2cf3,#6545ff);color:#fff;font-size:14px;font-weight:800;box-shadow:0 9px 22px #4c2cf329;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:12px;transition:transform .18s,filter .18s}.submit:hover{filter:brightness(1.05);transform:translateY(-1px)}.submit span{font-size:20px}.error{border-radius:12px;padding:10px 12px;background:#fff0ee;color:#a33128;font-size:12px;margin:6px 0 0}.secure{display:flex;align-items:center;gap:9px;color:#8592ae;font-size:11px;margin-top:23px}.secure svg{width:20px;height:20px;color:var(--green);flex:none}.foot{margin-top:17px;font-size:10px;color:#a2abc0;letter-spacing:.2px}
.visual{position:relative;min-width:0;min-height:0;overflow:hidden;border-radius:0 32px 32px 0;background:linear-gradient(145deg,#765bff,#4421d7 58%,#24168e);color:#fff}.visual:before,.visual:after{content:"";position:absolute;pointer-events:none;border-radius:50%;border:1px solid #ffffff16;width:620px;height:620px;right:-260px;top:-340px}.visual:after{width:470px;height:470px;right:-180px;top:-260px;border-width:50px;border-color:#ffffff08}.slide-stage{position:absolute;inset:0;overflow:hidden}.slide{position:absolute;inset:0;opacity:0;animation:showSlide 18s infinite;display:flex;flex-direction:column;justify-content:space-between;padding:clamp(28px,4vw,55px);background:linear-gradient(180deg,#ffffff04,#140d5a55)}.slide:nth-child(1){animation-delay:0s}.slide:nth-child(2){animation-delay:6s}.slide:nth-child(3){animation-delay:12s}@keyframes showSlide{0%,3%{opacity:0;transform:scale(1.025)}8%,30%{opacity:1;transform:scale(1)}36%,100%{opacity:0;transform:scale(1.015)}}
.slide-label{font-size:10px;font-weight:800;letter-spacing:1.8px;color:#d7ceff;display:flex;align-items:center;gap:9px}.slide-label:before{content:"";height:3px;width:23px;background:var(--orange);border-radius:10px}.slide h2{font-size:clamp(32px,4.2vw,54px);line-height:1.03;letter-spacing:-1.7px;margin:16px 0}.slide h2 em{font-style:normal;color:#ffb64e}.slide p{font-size:14px;line-height:1.7;color:#e7e4ff;max-width:370px;margin:0}.art{position:absolute;right:8%;bottom:17%;width:72%;height:40%;display:grid;place-items:center;opacity:.98}.art img{width:100%;height:100%;object-fit:contain;filter:drop-shadow(0 22px 25px #160d4e55)}.art-card{width:min(100%,400px);height:100%;border:1px solid #ffffff30;border-radius:28px;background:linear-gradient(145deg,#ffffff22,#ffffff08);box-shadow:inset 0 1px #ffffff25;display:grid;place-items:center;position:relative;overflow:hidden}.art-card:before{content:"";position:absolute;width:220px;height:220px;border-radius:50%;border:1px solid #ffffff35;box-shadow:0 0 0 28px #ffffff08,0 0 0 58px #ffffff05}.car{font-size:clamp(80px,11vw,150px);filter:drop-shadow(0 14px 16px #110a4b55);position:relative}.road{position:absolute;bottom:0;left:-10%;width:120%;height:15%;transform:rotate(-7deg);background:linear-gradient(180deg,#ffb64e,#f47d25);opacity:.9;box-shadow:0 -7px 24px #ff9c4233}.slide-bottom{display:flex;align-items:center;justify-content:space-between;gap:14px;z-index:2}.slide-bottom small{font-size:10px;color:#ded8ff;letter-spacing:1px}.dots{display:flex;gap:6px}.dots i{display:block;width:6px;height:6px;border-radius:50%;background:#ffffff60}.dots i:first-child{background:#fff;box-shadow:0 0 0 4px #ffffff20}.mini-features{display:flex;gap:9px;flex-wrap:wrap;margin-top:25px}.mini-features span{font-size:10px;padding:9px 11px;border-radius:11px;background:#ffffff13;border:1px solid #ffffff20;color:#f4f0ff}.visual-note{position:absolute;bottom:26px;right:28px;font-size:9px;letter-spacing:1.2px;color:#c9c0ff;z-index:4}
@media(max-height:680px) and (min-width:761px){body{padding:12px}.login-frame{height:calc(100svh - 24px);min-height:0}.login-side{padding:24px 38px}.brand{margin-bottom:15px}.brand img{width:48px;height:48px}.sub{margin-bottom:14px}.input-wrap{height:45px}.submit{height:45px}.secure{margin-top:12px}.foot{margin-top:9px}.slide{padding:30px}.art{bottom:15%;height:36%}}
@media(max-width:760px){body{display:block;padding:12px;overflow-y:auto}.login-frame{height:auto;min-height:0;display:flex;flex-direction:column;border-radius:26px;max-width:520px;margin:0 auto}.login-side{padding:26px 23px 24px;overflow:visible}.brand{margin-bottom:23px}.brand img{width:50px;height:50px}.brand-text{font-size:22px}.brand-text span{font-size:14px}.sub{margin-bottom:18px}.visual{height:260px;min-height:260px;border-radius:0 0 26px 26px}.slide{padding:24px}.slide h2{font-size:31px;margin:10px 0}.slide p{font-size:12px;max-width:290px}.art{height:44%;width:55%;right:4%;bottom:15%}.car{font-size:75px}.visual-note{bottom:15px;right:18px}.secure{margin-top:17px}}
@media(prefers-reduced-motion:reduce){.slide{animation:none;opacity:0}.slide:first-child{opacity:1}}
</style>
</head><body>
<main class="login-frame">
<section class="login-side" aria-labelledby="login-title">
<a class="brand" href="<?= kimu_escape($basePath) ?>" style="text-decoration:none;color:inherit">
<img src="assets/kimu-logo.png" alt="KIMU logo" onerror="this.style.display='none'"><span class="brand-text">KIMU<span>ADMIN PORTAL</span></span></a>
<div class="kicker">KIMU TRANSPORT &amp; MULTISERVICES</div>
<h1 id="login-title">Welcome back<span style="color:var(--orange)">.</span></h1>
<p class="sub">Sign in to manage your transport operations securely.</p>
<?php if (!$configured): ?>
<div class="error" role="alert">Admin setup is incomplete. Please check config.php and operator settings.</div>
<?php else: ?>
<form class="login-form" method="post" action="<?= kimu_escape($basePath) ?>" autocomplete="on">
<input type="hidden" name="csrf" value="<?= kimu_escape($csrf) ?>"><input type="hidden" name="action" value="login">
<label for="username">Email or username</label><div class="input-wrap"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg><input id="username" name="username" type="text" autocomplete="username" placeholder="Enter your username" required autofocus></div>
<label for="password">Password</label><div class="input-wrap"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg><input id="password" name="password" type="password" autocomplete="current-password" placeholder="Enter your password" required><button class="toggle" type="button" id="toggle-password" aria-label="Show password">Show</button></div>
<div class="form-meta">Secure operator sign-in</div><button class="submit" type="submit">Sign in <span aria-hidden="true">→</span></button>
<?php if ($flash !== null): ?><p class="error" role="alert"><?= kimu_escape($flash) ?></p><?php endif; ?>
</form>
<?php endif; ?>
<div class="secure"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/></svg><span>Protected access · KIMU Admin Portal</span></div>
<div class="foot">© <?= date('Y') ?> KIMU Transport &amp; Multiservices</div>
</section>
<aside class="visual" aria-label="KIMU transport highlights"><div class="slide-stage">
<section class="slide"><div><div class="slide-label">WELCOME TO KIMU</div><h2>Every journey<br>starts with <em>trust.</em></h2><p>One secure workspace to coordinate drivers, journeys and support.</p><div class="mini-features"><span>Driver management</span><span>Trip operations</span><span>Safety support</span></div></div><div class="art"><div class="art-card"><div class="car" aria-hidden="true">🚘</div><div class="road"></div></div></div><div class="slide-bottom"><small>MOVE PEOPLE. CONNECT PLACES.</small><div class="dots"><i></i><i></i><i></i></div></div></section>
<section class="slide"><div><div class="slide-label">DRIVER MANAGEMENT</div><h2>Better service.<br><em>Smoother trips.</em></h2><p>Review driver applications and keep your operations moving from one place.</p><div class="mini-features"><span>Verification</span><span>Operations</span><span>Reliable journeys</span></div></div><div class="art"><div class="art-card"><div class="car" aria-hidden="true">🚖</div><div class="road"></div></div></div><div class="slide-bottom"><small>BUILT FOR BETTER JOURNEYS</small><div class="dots"><i></i><i></i><i></i></div></div></section>
<section class="slide"><div><div class="slide-label">SAFETY &amp; OVERSIGHT</div><h2>Your operations,<br><em>in control.</em></h2><p>Review payment cases, respond to safety events and manage with confidence.</p><div class="mini-features"><span>Payment oversight</span><span>Safety response</span><span>One workspace</span></div></div><div class="art"><div class="art-card"><div class="car" aria-hidden="true">🛡️</div><div class="road"></div></div></div><div class="slide-bottom"><small>KIMU TRANSPORT &amp; MULTISERVICES</small><div class="dots"><i></i><i></i><i></i></div></div></section>
</div><div class="visual-note">KIMU · ADMIN</div></aside>
</main>
<script>
(function(){var b=document.getElementById('toggle-password'),p=document.getElementById('password');if(b&&p)b.addEventListener('click',function(){var reveal=p.type==='password';p.type=reveal?'text':'password';b.textContent=reveal?'Hide':'Show';b.setAttribute('aria-label',reveal?'Hide password':'Show password');});})();
</script>
</body></html>
