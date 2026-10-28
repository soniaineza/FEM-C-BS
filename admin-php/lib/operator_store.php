<?php
// Data layer for the back-office tables in sql/operator-mariadb.sql (cPanel
// MariaDB). The Kimu API on Render keeps riders, drivers and rides; this holds
// the dashboard's own records: teams, notes, the audit trail and the ledger.
declare(strict_types=1);

require_once __DIR__ . '/db.php';

const KIMU_ROLES = ['team_lead', 'dispatcher', 'operator'];

/** Applies sql/operator-mariadb.sql (idempotent). Returns the table count. */
function kimu_migrate(string $sqlFile): int
{
    $sql = file_get_contents($sqlFile);
    if ($sql === false) {
        throw new RuntimeException('Cannot read ' . $sqlFile);
    }
    $sql = preg_replace('/^\s*--.*$/m', '', $sql);
    $pdo = kimu_db();
    $n = 0;
    foreach (array_filter(array_map('trim', explode(';', (string) $sql))) as $stmt) {
        $pdo->exec($stmt);
        $n++;
    }
    return $n;
}

function kimu_uuid(): string
{
    return kimu_db()->query('SELECT UUID() AS u')->fetch()['u'];
}

function kimu_team_create(string $name, ?string $rootId = null): string
{
    $name = trim($name);
    if ($name === '' || mb_strlen($name) > 150) {
        throw new InvalidArgumentException('Team name must be 1-150 characters.');
    }
    $id = kimu_uuid();
    kimu_db()->prepare('INSERT INTO operator_teams (id, name, root_id) VALUES (?, ?, ?)')->execute([$id, $name, $rootId]);
    return $id;
}

function kimu_teams(bool $includeArchived = false): array
{
    $sql = 'SELECT id, name, status, root_id, created_at FROM operator_teams'
        . ($includeArchived ? '' : " WHERE status = 'active'") . ' ORDER BY created_at, name';
    return kimu_db()->query($sql)->fetchAll();
}

function kimu_team_archive(string $teamId): void
{
    kimu_db()->prepare("UPDATE operator_teams SET status = 'archived' WHERE id = ?")->execute([$teamId]);
}

/** Creates an operator account; the password is stored only as a hash. */
function kimu_operator_create(string $username, string $password, string $role = 'operator'): string
{
    if (!in_array($role, KIMU_ROLES, true)) {
        throw new InvalidArgumentException('Unknown role.');
    }
    if (strlen($password) < 12) {
        throw new InvalidArgumentException('Password must be at least 12 characters.');
    }
    $id = kimu_uuid();
    kimu_db()->prepare('INSERT INTO operator_accounts (id, username, password_hash, role) VALUES (?, ?, ?, ?)')
        ->execute([$id, trim($username), password_hash($password, PASSWORD_DEFAULT), $role]);
    return $id;
}

function kimu_team_add_member(string $teamId, string $operatorId, string $role = 'operator'): void
{
    if (!in_array($role, KIMU_ROLES, true)) {
        throw new InvalidArgumentException('Unknown role.');
    }
    kimu_db()->prepare('INSERT INTO operator_team_members (team_id, operator_id, role) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE role = VALUES(role)')
        ->execute([$teamId, $operatorId, $role]);
}

function kimu_team_members(string $teamId): array
{
    $st = kimu_db()->prepare('SELECT a.id, a.username, m.role, m.joined_at FROM operator_team_members m JOIN operator_accounts a ON a.id = m.operator_id WHERE m.team_id = ? AND a.disabled_at IS NULL ORDER BY a.username');
    $st->execute([$teamId]);
    return $st->fetchAll();
}

function kimu_note_add(string $teamId, string $author, string $text): string
{
    $text = trim($text);
    if ($text === '' || mb_strlen($text) > 2000) {
        throw new InvalidArgumentException('A note must be 1-2000 characters.');
    }
    $id = kimu_uuid();
    kimu_db()->prepare('INSERT INTO operator_notes (id, team_id, author, text) VALUES (?, ?, ?, ?)')->execute([$id, $teamId, $author, $text]);
    return $id;
}

function kimu_notes(string $teamId, int $limit = 50): array
{
    $st = kimu_db()->prepare('SELECT id, author, text, created_at FROM operator_notes WHERE team_id = ? ORDER BY created_at DESC LIMIT ' . max(1, min(200, $limit)));
    $st->execute([$teamId]);
    return $st->fetchAll();
}

/** Appends to the audit trail. There is deliberately no update or delete. */
function kimu_activity_log(string $teamId, string $type, string $summary, string $actor, ?string $detail = null, ?string $receiver = null, ?string $causedBy = null): string
{
    $id = kimu_uuid();
    kimu_db()->prepare('INSERT INTO operator_activities (id, team_id, type, summary, detail, actor, receiver, caused_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        ->execute([$id, $teamId, $type, mb_substr($summary, 0, 300), $detail, $actor, $receiver, $causedBy]);
    return $id;
}

function kimu_activity(?string $teamId = null, int $limit = 100): array
{
    $limit = max(1, min(500, $limit));
    if ($teamId === null) {
        return kimu_db()->query("SELECT * FROM operator_activities ORDER BY created_at DESC LIMIT $limit")->fetchAll();
    }
    $st = kimu_db()->prepare("SELECT * FROM operator_activities WHERE team_id = ? ORDER BY created_at DESC LIMIT $limit");
    $st->execute([$teamId]);
    return $st->fetchAll();
}

/** The shared team every dashboard operator belongs to (created on first use). */
function kimu_default_team_id(): string
{
    $pdo = kimu_db();
    $row = $pdo->query("SELECT id FROM operator_teams WHERE name = 'Operations' AND root_id IS NULL ORDER BY created_at LIMIT 1")->fetch();
    return $row ? $row['id'] : kimu_team_create('Operations');
}

/**
 * Records a successful dashboard decision in the audit trail. Only a fixed
 * set of fields is stored, never passwords or free-form request data.
 */
function kimu_log_decision(string $path, ?array $body, string $operator): void
{
    $uuid = '[0-9a-fA-F-]{36}';
    $map = [
        '#^/drivers/create$#' => ['driver_created', 'Created a driver account'],
        "#^/drivers/($uuid)/verify$#" => ['driver_verified', 'Verified a driver'],
        "#^/drivers/($uuid)/suspend$#" => ['driver_suspended', 'Suspended a driver'],
        "#^/documents/($uuid)/review$#" => ['document_reviewed', 'Reviewed a driver document'],
        "#^/payment-exceptions/($uuid)/resolve$#" => ['payment_resolved', 'Resolved a payment case'],
        "#^/emergencies/($uuid)/resolve$#" => ['sos_resolved', 'Closed an SOS emergency'],
        "#^/payouts/($uuid)/approve$#" => ['payout_approved', 'Approved a driver payout'],
        "#^/payouts/($uuid)/reject$#" => ['payout_rejected', 'Rejected a driver payout'],
    ];
    foreach ($map as $re => [$type, $summary]) {
        if (!preg_match($re, $path, $m)) {
            continue;
        }
        $keep = [];
        foreach (['fullName', 'decision', 'status', 'reason', 'note', 'resolution', 'type', 'documentType'] as $k) {
            if (isset($body[$k]) && is_scalar($body[$k])) {
                $keep[$k] = mb_substr((string) $body[$k], 0, 200);
            }
        }
        kimu_activity_log(
            kimu_default_team_id(),
            $type,
            $summary,
            $operator,
            $keep ? json_encode($keep, JSON_UNESCAPED_UNICODE) : null,
            $m[1] ?? ($keep['fullName'] ?? null)
        );
        return;
    }
}

/** Money totals for the finance panel, all in the API's currency units. */
function kimu_ledger_summary(): array
{
    $pdo = kimu_db();
    $e = $pdo->query('SELECT COALESCE(SUM(gross_amount),0) gross, COALESCE(SUM(commission),0) commission, COALESCE(SUM(net_amount),0) net, COUNT(*) rides FROM driver_earnings')->fetch();
    $p = $pdo->query("SELECT COALESCE(SUM(amount),0) paid, COALESCE(SUM(fee),0) fees FROM driver_payouts WHERE status = 'completed'")->fetch();
    $s = $pdo->query("SELECT COALESCE(SUM(amount),0) settled FROM driver_settlements WHERE status = 'succeeded'")->fetch();
    $f = $pdo->query('SELECT COALESCE(SUM(amount),0) paypack_fees FROM paypack_fees')->fetch();
    $a = $pdo->query('SELECT COALESCE(SUM(amount),0) paypack_absorbed FROM paypack_absorbed')->fetch();
    return array_map('floatval', array_merge($e, $p, $s, $f, $a));
}
