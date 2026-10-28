-- Back-office tables for the cPanel dashboard (MariaDB 10.6, utf8mb4).
--
-- Ported from server/src/operator-schema.sql (PostgreSQL). Differences:
--   * UUID primary keys are CHAR(36) DEFAULT (UUID()).
--   * driver_id / ride_id point at rows in the Render API's PostgreSQL, a
--     different database, so they are plain CHAR(36) columns, not foreign keys.
--   * operator_accounts.disabled_at was declared twice in the original.
--   * driver_earnings was indexed on a created_at column it does not have.
-- Safe to run repeatedly (CREATE TABLE IF NOT EXISTS only).

CREATE TABLE IF NOT EXISTS operator_accounts (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  username VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'operator',
  disabled_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT chk_operator_accounts_role CHECK (role IN ('team_lead', 'dispatcher', 'operator'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS operator_teams (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  root_id CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT chk_operator_teams_status CHECK (status IN ('active', 'archived')),
  CONSTRAINT fk_operator_teams_root FOREIGN KEY (root_id) REFERENCES operator_teams(id) ON DELETE CASCADE,
  INDEX idx_operator_teams_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS operator_team_members (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  team_id CHAR(36) NOT NULL,
  operator_id CHAR(36) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'operator',
  joined_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_team_operator (team_id, operator_id),
  CONSTRAINT chk_operator_team_members_role CHECK (role IN ('team_lead', 'dispatcher', 'operator')),
  CONSTRAINT fk_otm_team FOREIGN KEY (team_id) REFERENCES operator_teams(id) ON DELETE CASCADE,
  CONSTRAINT fk_otm_operator FOREIGN KEY (operator_id) REFERENCES operator_accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS operator_sessions (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  operator_id CHAR(36) NOT NULL,
  username VARCHAR(100) NOT NULL,
  role VARCHAR(20) NOT NULL,
  team_id CHAR(36) NULL,
  token VARCHAR(128) NOT NULL UNIQUE,
  expires_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_os_operator FOREIGN KEY (operator_id) REFERENCES operator_accounts(id) ON DELETE CASCADE,
  CONSTRAINT fk_os_team FOREIGN KEY (team_id) REFERENCES operator_teams(id) ON DELETE SET NULL,
  INDEX idx_operator_sessions_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS operator_notes (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  team_id CHAR(36) NOT NULL,
  author VARCHAR(100) NULL,
  text VARCHAR(2000) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_on_team FOREIGN KEY (team_id) REFERENCES operator_teams(id) ON DELETE CASCADE,
  INDEX idx_operator_notes_team (team_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Append-only audit trail: the application never UPDATEs or DELETEs here.
CREATE TABLE IF NOT EXISTS operator_activities (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  team_id CHAR(36) NOT NULL,
  type VARCHAR(60) NOT NULL,
  summary VARCHAR(300) NOT NULL,
  detail TEXT NULL,
  actor VARCHAR(100) NOT NULL,
  receiver VARCHAR(100) NULL,
  caused_by VARCHAR(100) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_oa_team FOREIGN KEY (team_id) REFERENCES operator_teams(id) ON DELETE CASCADE,
  INDEX idx_operator_activities_team (team_id),
  INDEX idx_operator_activities_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Finance ledger. driver_id / ride_id reference the Render API's PostgreSQL.
CREATE TABLE IF NOT EXISTS driver_earnings (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  driver_id CHAR(36) NOT NULL,
  ride_id CHAR(36) NOT NULL UNIQUE,
  gross_amount DOUBLE NOT NULL,
  commission DOUBLE NOT NULL,
  net_amount DOUBLE NOT NULL,
  payment_method VARCHAR(40) NOT NULL,
  status VARCHAR(40) NOT NULL,
  settled_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_driver_earnings_driver (driver_id, settled_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS driver_payouts (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  driver_id CHAR(36) NOT NULL,
  amount DOUBLE NOT NULL,
  method VARCHAR(40) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  reference VARCHAR(120) NOT NULL,
  phone VARCHAR(30) NULL,
  fee DOUBLE NOT NULL DEFAULT 0,
  external_reference VARCHAR(120) NULL,
  failure_reason VARCHAR(300) NULL,
  reviewed_by VARCHAR(100) NULL,
  processed_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT chk_driver_payouts_status CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  INDEX idx_driver_payouts_driver (driver_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS driver_settlements (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  driver_id CHAR(36) NOT NULL,
  amount DOUBLE NOT NULL,
  method VARCHAR(40) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  reference VARCHAR(120) NULL,
  recorded_by VARCHAR(100) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT chk_driver_settlements_status CHECK (status IN ('pending', 'succeeded', 'failed')),
  INDEX idx_driver_settlements_driver (driver_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS paypack_fees (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  network VARCHAR(40) NOT NULL,
  driver_id CHAR(36) NOT NULL,
  amount DOUBLE NOT NULL,
  reference VARCHAR(120) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_paypack_fees_network (network)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS paypack_absorbed (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  network VARCHAR(40) NOT NULL,
  driver_id CHAR(36) NOT NULL,
  amount DOUBLE NOT NULL,
  reference VARCHAR(120) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_paypack_absorbed_network (network)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
