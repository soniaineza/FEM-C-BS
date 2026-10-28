<?php
declare(strict_types=1);

/** KIMU Admin Dashboard — presentation separated from index.php login. */
require_once __DIR__ . '/lib/bootstrap.php';
kimu_security_headers();
header("Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; form-action 'self'; base-uri 'self'; frame-ancestors 'none'");
header('Content-Type: text/html; charset=utf-8');

$operator = kimu_current_operator();
$basePath = (string) kimu_base_path();
$csrf = kimu_csrf_token();
$version = defined('KIMU_OPERATOR_VERSION') ? (string) KIMU_OPERATOR_VERSION : '1';
function kimu_dashboard_asset(string $path, string $version): string { return $path . '?v=' . rawurlencode($version); }

if ($operator === null) {
    header('Location: ' . rtrim($basePath, '/') . '/', true, 303);
    exit;
}
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    if (!kimu_csrf_ok()) {
        http_response_code(403);
        exit('Your session form expired. Please return and try again.');
    }
    if ((string)($_POST['action'] ?? '') === 'logout') {
        kimu_sign_out();
        header('Location: ' . rtrim($basePath, '/') . '/', true, 303);
        exit;
    }
    http_response_code(400);
    exit('Unsupported action.');
}
?>
<!doctype html>
<html lang="en">
<head><meta charset="utf-8">

<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<meta name="csrf-token" content="<?= kimu_escape($csrf) ?>">
<meta name="theme-color" content="#f4f7f6">
<title>KIMU Admin Dashboard</title>
<link rel="stylesheet" href="<?= kimu_escape(kimu_dashboard_asset('assets/dashboard.css', $version)) ?>">
</head>
<body>
<div class="dashboard-frame">
  <aside class="sidebar" id="sidebar">
    <a class="brand" href="<?= kimu_escape(rtrim($basePath, '/')) ?>/dashboard.php">
      <span class="brand-logo"><img src="assets/kimu-logo.png" alt=""></span>
      <span><strong>KimuEV</strong><small>Operations Console</small></span>
    </a>
    <nav class="side-nav" aria-label="Main navigation">
      <span class="nav-label">Overview</span>
      <button type="button" class="nav-item selected" data-tab="drivers" aria-pressed="true"><span class="nav-icon">▦</span>Dashboard</button>
      <span class="nav-label">Operations</span>
      <button type="button" class="nav-item" data-tab="drivers"><span class="nav-icon">▤</span>Bookings <em>API needed</em></button>
      <button type="button" class="nav-item" data-tab="drivers"><span class="nav-icon">⌖</span>Live Map <em>API needed</em></button>
      <button type="button" class="nav-item" data-tab="drivers"><span class="nav-icon">🚘</span>Private Rides <em>API needed</em></button>
      <button type="button" class="nav-item" data-tab="drivers"><span class="nav-icon">♧</span>Share Rides <em>API needed</em></button>
      <button type="button" class="nav-item" data-tab="cases" aria-pressed="false"><span class="nav-icon">▤</span>Payment cases</button>
      <span class="nav-label">People</span>
      <button type="button" class="nav-item" data-tab="verified"><span class="nav-icon">♙</span>Riders <em>API needed</em></button>
      <button type="button" class="nav-item" data-tab="drivers" aria-pressed="false"><span class="nav-icon">♙</span>Drivers to approve</button>
      <button type="button" class="nav-item" data-tab="verified" aria-pressed="false"><span class="nav-icon">☑</span>Verified drivers</button>
      <button type="button" class="nav-item" data-tab="newdriver" aria-pressed="false"><span class="nav-icon">＋</span>Add driver</button>
      <button type="button" class="nav-item" data-tab="activity" aria-pressed="false"><span class="nav-icon">☰</span>Activity</button>
      <button type="button" class="nav-item" data-tab="notes" aria-pressed="false"><span class="nav-icon">✎</span>Notes</button>
      <span class="nav-label">Fleet &amp; Pricing</span>
      <button type="button" class="nav-item" data-tab="integrations"><span class="nav-icon">🚗</span>Vehicles <em>API needed</em></button>
      <button type="button" class="nav-item" data-tab="integrations"><span class="nav-icon">⌖</span>City &amp; Tariffs <em>API needed</em></button>
      <button type="button" class="nav-item" data-tab="integrations"><span class="nav-icon">%</span>Coupons <em>API needed</em></button>
      <span class="nav-label">Finance</span>
      <button type="button" class="nav-item" data-tab="cases"><span class="nav-icon">▣</span>Wallet Fund <em>API needed</em></button>
      <button type="button" class="nav-item" data-tab="cases"><span class="nav-icon">▤</span>Payouts <em>API needed</em></button>
      <span class="nav-label">Safety &amp; system</span>
      <button type="button" class="nav-item" data-tab="sos" aria-pressed="false"><span class="nav-icon">◎</span>Emergencies / SOS</button>
      <button type="button" class="nav-item" data-tab="cases"><span class="nav-icon">☏</span>Complaints <em>API needed</em></button>
      <span class="nav-label">Reports &amp; System</span>
      <button type="button" class="nav-item" data-tab="integrations"><span class="nav-icon">▥</span>Analytics &amp; Reports <em>API needed</em></button>
      <button type="button" class="nav-item" data-tab="integrations" aria-pressed="false"><span class="nav-icon">⚙</span>Integrations</button>
      <button type="button" class="nav-item" data-tab="integrations"><span class="nav-icon">⚙</span>Settings <em>API needed</em></button>
    </nav>
    <div class="sidebar-bottom">
      <span class="online-dot"></span><span><strong>Operations portal</strong><small>Connected through KIMU API</small></span>
    </div>
  </aside>

  <main class="main-area">
    <header class="topbar">
      <button class="menu-toggle" id="menu-toggle" type="button" aria-label="Toggle navigation">☰</button>
      <div class="welcome"><strong>Admin User</strong><span>Welcome back to KIMU 👋</span></div>
      <div class="topbar-right"><span class="secure-chip"><span class="online-dot"></span> Secure session</span>
        <div class="operator-chip"><span class="avatar"><?= kimu_escape(strtoupper(substr((string)$operator, 0, 1))) ?></span><span><strong><?= kimu_escape($operator) ?></strong><small>Administrator</small></span></div>
        <form method="post" action="" class="logout-form"><input type="hidden" name="csrf" value="<?= kimu_escape($csrf) ?>"><input type="hidden" name="action" value="logout"><button type="submit" class="logout-button">Sign out ↗</button></form>
      </div>
    </header>

    <section class="page-content">
      <div class="page-heading"><div><span class="eyebrow">KIMU TRANSPORT &amp; MULTISERVICES</span><h1>Dashboard</h1><p>Live operations overview for KIMU Transport.</p></div><button type="button" id="reload" class="refresh-button">↻ <span>Refresh data</span></button></div>

      <section class="metric-grid" aria-label="Operations summary">
        <article class="metric-card"><span class="metric-icon green">◎</span><div class="metric-label">Drivers to approve</div><strong class="metric-value">Live data</strong><small>Loaded from the KIMU API</small></article>
        <article class="metric-card"><span class="metric-icon blue">♙</span><div class="metric-label">Verified drivers</div><strong class="metric-value">Live data</strong><small>Loaded from the KIMU API</small></article>
        <article class="metric-card"><span class="metric-icon orange">▤</span><div class="metric-label">Payment cases</div><strong class="metric-value">Live data</strong><small>Open cases from the API</small></article>
        <article class="metric-card"><span class="metric-icon red">◎</span><div class="metric-label">Emergencies / SOS</div><strong class="metric-value">Live data</strong><small>Open alerts from the API</small></article>
      </section>

      <section class="ride-overview" aria-label="Ride overview">
        <article class="ride-card ride-blue"><span class="ride-symbol">▤</span><div><span>Total bookings</span><strong>—</strong><small>Booking API not connected</small></div></article>
        <article class="ride-card ride-green"><span class="ride-symbol">▶</span><div><span>Ongoing rides</span><strong>—</strong><small>Ride API not connected</small></div></article>
        <article class="ride-card ride-purple"><span class="ride-symbol">🚘</span><div><span>Private rides</span><strong>—</strong><small>Ride type API not connected</small></div></article>
        <article class="ride-card ride-orange"><span class="ride-symbol">♧</span><div><span>Share rides</span><strong>—</strong><small>Ride type API not connected</small></div></article>
      </section>
      <div class="insight-grid">
        <section class="panel insight-panel"><div class="panel-heading"><div><h2>Bookings &amp; revenue</h2><p>Waiting for analytics endpoints</p></div><span class="insight-tag">Analytics</span></div><div class="chart-empty"><span>Chart will display real KIMU API data when available.</span><div class="chart-lines"></div></div></section>
        <section class="panel insight-panel"><div class="panel-heading"><div><h2>Live map — active rides</h2><p>GPS feed is not connected to this dashboard yet</p></div><span class="insight-tag">Live map</span></div><div class="map-empty"><span class="map-road road-one"></span><span class="map-road road-two"></span><b>Kigali</b><i class="pin-one">●</i><i class="pin-two">●</i><small>No live GPS data available</small></div></section>
      </div>

      <div class="content-grid">
        <section class="panel operations-panel">
          <div class="panel-heading"><div><h2 id="section-title">Drivers to approve</h2><p>Review and manage current operations</p></div><span class="live-badge"><span class="online-dot"></span> Live</span></div>
          <div class="tab-strip" aria-label="Operations sections">
            <button type="button" data-tab="drivers" aria-pressed="true" class="active">Pending drivers</button>
            <button type="button" data-tab="newdriver" aria-pressed="false">Add driver</button>
            <button type="button" data-tab="activity" aria-pressed="false">Activity</button>
            <button type="button" data-tab="notes" aria-pressed="false">Notes</button>
            <button type="button" data-tab="verified" aria-pressed="false">Verified</button>
            <button type="button" data-tab="cases" aria-pressed="false">Payment cases</button>
            <button type="button" data-tab="sos" aria-pressed="false">SOS</button>
            <button type="button" data-tab="integrations" aria-pressed="false">Integrations</button>
          </div>
          <div id="app" data-operator="<?= kimu_escape($operator) ?>">
            <p id="status" class="status-line" role="status" aria-live="polite">Connecting to KIMU API…</p>
            <div id="list" class="records-list"></div>
          </div>
        </section>
        <aside class="right-column">
          <section class="panel quick-panel"><div class="panel-heading"><div><h2>Quick actions</h2><p>Go directly to a work queue</p></div></div>
            <button type="button" class="quick-action" data-tab="drivers"><span class="quick-icon green">♙</span><span><strong>Review drivers</strong><small>Check submitted documents</small></span><b>›</b></button>
            <button type="button" class="quick-action" data-tab="cases"><span class="quick-icon orange">▤</span><span><strong>Payment cases</strong><small>Review and resolve issues</small></span><b>›</b></button>
            <button type="button" class="quick-action" data-tab="sos"><span class="quick-icon red">◎</span><span><strong>Safety alerts</strong><small>Check open emergencies</small></span><b>›</b></button>
          </section>
          <section class="panel note-panel"><span class="metric-icon green">✓</span><h2>System connection</h2><p>Operational records are loaded securely through <code>api.php</code>. This page does not create sample records or replace stored data.</p><div class="connection-line"><span class="online-dot"></span> Same-origin API</div></section>
        </aside>
      </div>
      <footer class="page-footer"><span>© KIMU Transport &amp; Multiservices</span><span>Automatic refresh every 15 seconds when supported</span></footer>
    </section>
  </main>
</div>
<script src="<?= kimu_escape(kimu_dashboard_asset('assets/app.js', $version)) ?>" defer></script>
<script src="<?= kimu_escape(kimu_dashboard_asset('assets/dashboard.js', $version)) ?>" defer></script>
</body>
</html>
