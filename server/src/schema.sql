-- Kimu Transport database schema for MySQL 8.0.13+ / MariaDB 10.4+.
-- One statement per ";" at the end of a line (src/db.js splits on that), no
-- ";" inside a statement. Every statement is idempotent: the API applies this
-- file on each start. Changes to an existing table go through the "migrations"
-- list in src/db.js, never by editing a CREATE TABLE below.
--
-- Conventions: ids are CHAR(36) UUIDs (the API generates them; the default
-- covers raw inserts); times are DATETIME(3) in UTC; money is DOUBLE as in the
-- original PostgreSQL schema; booleans are BOOLEAN (TINYINT(1)); "is_read"
-- replaces the old "read" column because READ is a reserved word in MySQL.

CREATE TABLE IF NOT EXISTS passengers (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  full_name VARCHAR(255) NULL,
  phone VARCHAR(64) NULL UNIQUE,
  email VARCHAR(320) NULL UNIQUE,
  password_hash VARCHAR(255) NULL,
  photo_url TEXT NULL,
  emergency_contact_name VARCHAR(255) NULL,
  emergency_contact_phone VARCHAR(64) NULL,
  preferred_language VARCHAR(16) NULL,
  referral_code VARCHAR(64) NULL UNIQUE,
  referred_by CHAR(36) NULL,
  is_profile_complete BOOLEAN NOT NULL DEFAULT FALSE,
  verified_at DATETIME(3) NULL,
  deleted_at DATETIME(3) NULL,
  google_sub VARCHAR(255) NULL UNIQUE,
  google_linked_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS verification_codes (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  passenger_id CHAR(36) NOT NULL,
  code_hash VARCHAR(255) NOT NULL,
  purpose VARCHAR(32) NOT NULL DEFAULT 'otp',
  expires_at DATETIME(3) NOT NULL,
  used_at DATETIME(3) NULL,
  attempts INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_verification_lookup (passenger_id, purpose, used_at),
  CONSTRAINT fk_verification_codes_passenger FOREIGN KEY (passenger_id) REFERENCES passengers (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS login_codes (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  passenger_id CHAR(36) NOT NULL,
  code_hash VARCHAR(255) NOT NULL UNIQUE,
  provider VARCHAR(32) NOT NULL DEFAULT 'google',
  expires_at DATETIME(3) NOT NULL,
  used_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_login_codes_expires (expires_at),
  CONSTRAINT fk_login_codes_passenger FOREIGN KEY (passenger_id) REFERENCES passengers (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS saved_places (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  passenger_id CHAR(36) NOT NULL,
  type VARCHAR(32) NOT NULL,
  name VARCHAR(255) NOT NULL,
  address TEXT NOT NULL,
  latitude DOUBLE NULL,
  longitude DOUBLE NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_saved_places_passenger FOREIGN KEY (passenger_id) REFERENCES passengers (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS recent_destinations (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  passenger_id CHAR(36) NOT NULL,
  address VARCHAR(500) NOT NULL,
  latitude DOUBLE NOT NULL,
  longitude DOUBLE NOT NULL,
  times_used INT NOT NULL DEFAULT 1,
  last_used_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_recent_destinations (passenger_id, address),
  KEY idx_recent_dest_passenger (passenger_id, last_used_at),
  CONSTRAINT fk_recent_destinations_passenger FOREIGN KEY (passenger_id) REFERENCES passengers (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Kimu's published tariff. The fare is tiered by distance: base_fare covers the
-- first included_km, fare_per_km applies up to long_distance_km, and
-- fare_per_km_long beyond it (services/pricing.js).
CREATE TABLE IF NOT EXISTS vehicles (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  capacity INT NOT NULL,
  base_fare DOUBLE NOT NULL,
  fare_per_km DOUBLE NOT NULL,
  eta_minutes INT NOT NULL,
  per_minute DOUBLE NULL,
  min_fare DOUBLE NULL,
  booking_fee DOUBLE NULL,
  included_km DOUBLE NULL,
  long_distance_km DOUBLE NULL,
  fare_per_km_long DOUBLE NULL,
  waiting_fee DOUBLE NULL,
  waiting_fee_minutes INT NULL,
  free_waiting_minutes INT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS drivers (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  full_name VARCHAR(255) NOT NULL,
  phone VARCHAR(64) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NULL,
  license_number VARCHAR(64) NULL,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(32) NOT NULL DEFAULT 'offline',
  current_vehicle_id VARCHAR(64) NULL,
  current_latitude DOUBLE NULL,
  current_longitude DOUBLE NULL,
  current_heading DOUBLE NULL,
  rating DOUBLE NULL,
  total_trips INT NOT NULL DEFAULT 0,
  last_online_at DATETIME(3) NULL,
  email VARCHAR(320) NULL,
  photo_url TEXT NULL,
  emergency_contact_name VARCHAR(255) NULL,
  emergency_contact_phone VARCHAR(64) NULL,
  preferred_language VARCHAR(16) NULL DEFAULT 'en',
  is_profile_complete BOOLEAN NOT NULL DEFAULT FALSE,
  vehicle_make VARCHAR(100) NULL,
  vehicle_model VARCHAR(100) NULL,
  vehicle_year INT NULL,
  vehicle_color VARCHAR(64) NULL,
  vehicle_plate VARCHAR(32) NULL,
  total_earnings DOUBLE NOT NULL DEFAULT 0,
  today_earnings DOUBLE NOT NULL DEFAULT 0,
  deleted_at DATETIME(3) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_drivers_status (status),
  CONSTRAINT fk_drivers_vehicle FOREIGN KEY (current_vehicle_id) REFERENCES vehicles (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS promotions (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  code VARCHAR(64) NOT NULL UNIQUE,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  discount_type VARCHAR(16) NOT NULL,
  discount_value DOUBLE NOT NULL,
  min_fare DOUBLE NULL DEFAULT 0,
  max_discount DOUBLE NULL,
  starts_at DATETIME(3) NULL,
  ends_at DATETIME(3) NULL,
  max_uses INT NULL,
  uses_count INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT chk_promotions_type CHECK (discount_type IN ('percent', 'fixed'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Ride status is a closed set governed by services/rideStateMachine.js.
CREATE TABLE IF NOT EXISTS rides (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  passenger_id CHAR(36) NOT NULL,
  driver_id CHAR(36) NULL,
  vehicle_id VARCHAR(64) NOT NULL,
  ride_type VARCHAR(32) NOT NULL DEFAULT 'private',
  pickup_address TEXT NOT NULL,
  pickup_latitude DOUBLE NOT NULL,
  pickup_longitude DOUBLE NOT NULL,
  dest_address TEXT NOT NULL,
  dest_latitude DOUBLE NOT NULL,
  dest_longitude DOUBLE NOT NULL,
  distance_km DOUBLE NOT NULL,
  duration_minutes INT NOT NULL,
  estimated_fare DOUBLE NOT NULL,
  final_fare DOUBLE NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'searchingDriver',
  payment_method VARCHAR(32) NOT NULL,
  payment_phone VARCHAR(64) NULL,
  ride_note TEXT NULL,
  ride_pin TEXT NULL,
  ride_pin_hash VARCHAR(255) NULL,
  pin_verified_at DATETIME(3) NULL,
  pin_attempts INT NOT NULL DEFAULT 0,
  pair_code VARCHAR(64) NULL,
  cancellation_reason TEXT NULL,
  cancelled_by VARCHAR(32) NULL,
  scheduled_for DATETIME(3) NULL,
  promotion_id CHAR(36) NULL,
  applied_discount DOUBLE NULL,
  pool_group_id CHAR(36) NULL,
  seats INT NOT NULL DEFAULT 1,
  cash_disputed_at DATETIME(3) NULL,
  fare_breakdown JSON NULL,
  surge_multiplier DOUBLE NULL,
  driver_name VARCHAR(255) NULL,
  driver_phone VARCHAR(64) NULL,
  driver_rating DOUBLE NULL,
  driver_vehicle_model VARCHAR(100) NULL,
  driver_vehicle_color VARCHAR(64) NULL,
  driver_license_plate VARCHAR(32) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  accepted_at DATETIME(3) NULL,
  arrived_at DATETIME(3) NULL,
  started_at DATETIME(3) NULL,
  completed_at DATETIME(3) NULL,
  cancelled_at DATETIME(3) NULL,
  rating INT NULL,
  rating_comment TEXT NULL,
  KEY idx_rides_passenger (passenger_id, created_at),
  KEY idx_rides_driver (driver_id, created_at),
  KEY idx_rides_status (status),
  KEY idx_rides_scheduled (scheduled_for),
  KEY idx_rides_pool_group (pool_group_id),
  CONSTRAINT fk_rides_passenger FOREIGN KEY (passenger_id) REFERENCES passengers (id) ON DELETE CASCADE,
  CONSTRAINT fk_rides_driver FOREIGN KEY (driver_id) REFERENCES drivers (id),
  CONSTRAINT fk_rides_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles (id),
  CONSTRAINT rides_status_check CHECK (status IN (
    'scheduled', 'searchingDriver', 'driverAssigned', 'driverArriving',
    'driverArrived', 'pinVerified', 'inProgress', 'arrived',
    'paymentPending', 'completed', 'cancelled'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ride_status_history (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  ride_id CHAR(36) NOT NULL,
  from_status VARCHAR(32) NULL,
  to_status VARCHAR(32) NOT NULL,
  changed_by VARCHAR(64) NOT NULL DEFAULT 'system',
  reason TEXT NULL,
  changed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_ride_history_ride (ride_id, changed_at),
  CONSTRAINT fk_ride_history_ride FOREIGN KEY (ride_id) REFERENCES rides (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ride_events (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  ride_id CHAR(36) NOT NULL,
  event_type VARCHAR(64) NOT NULL,
  payload JSON NOT NULL DEFAULT ('{}'),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_ride_events_ride (ride_id, created_at),
  CONSTRAINT fk_ride_events_ride FOREIGN KEY (ride_id) REFERENCES rides (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The latest accepted GPS fix per driver (and, below, per passenger).
CREATE TABLE IF NOT EXISTS driver_locations (
  driver_id CHAR(36) NOT NULL PRIMARY KEY,
  latitude DOUBLE NOT NULL,
  longitude DOUBLE NOT NULL,
  heading DOUBLE NULL,
  accuracy DOUBLE NULL,
  device_recorded_at DATETIME(3) NULL,
  state VARCHAR(32) NULL,
  recorded_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_driver_locations_driver FOREIGN KEY (driver_id) REFERENCES drivers (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS passenger_locations (
  passenger_id CHAR(36) NOT NULL PRIMARY KEY,
  latitude DOUBLE NOT NULL,
  longitude DOUBLE NOT NULL,
  heading DOUBLE NULL,
  recorded_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_passenger_locations_passenger FOREIGN KEY (passenger_id) REFERENCES passengers (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- GPS breadcrumbs recorded while a ride is active.
CREATE TABLE IF NOT EXISTS ride_route_points (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  ride_id CHAR(36) NOT NULL,
  latitude DOUBLE NOT NULL,
  longitude DOUBLE NOT NULL,
  recorded_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_ride_route_points_ride_id (ride_id, recorded_at),
  CONSTRAINT fk_ride_route_points_ride FOREIGN KEY (ride_id) REFERENCES rides (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notifications (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  passenger_id CHAR(36) NOT NULL,
  ride_id CHAR(36) NULL,
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  type VARCHAR(32) NOT NULL DEFAULT 'general',
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_notifications_passenger (passenger_id, created_at),
  CONSTRAINT fk_notifications_passenger FOREIGN KEY (passenger_id) REFERENCES passengers (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS device_tokens (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  passenger_id CHAR(36) NOT NULL,
  token VARCHAR(512) NOT NULL UNIQUE,
  platform VARCHAR(32) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_device_tokens_passenger (passenger_id),
  CONSTRAINT fk_device_tokens_passenger FOREIGN KEY (passenger_id) REFERENCES passengers (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- status is one of: pending | succeeded | failed | expired | refund_pending |
-- refunded (services/paymentState.js has the allowed moves).
CREATE TABLE IF NOT EXISTS payments (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  ride_id CHAR(36) NOT NULL,
  passenger_id CHAR(36) NOT NULL,
  amount DOUBLE NOT NULL,
  method VARCHAR(32) NOT NULL,
  status VARCHAR(32) NOT NULL,
  provider VARCHAR(32) NULL,
  state VARCHAR(64) NULL,
  reference VARCHAR(255) NOT NULL,
  external_reference VARCHAR(255) NULL,
  description TEXT NULL,
  idempotency_key VARCHAR(255) NULL UNIQUE,
  webhook_id VARCHAR(255) NULL,
  failure_reason TEXT NULL,
  metadata JSON NULL DEFAULT ('{}'),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_payments_ride (ride_id),
  KEY idx_payments_passenger (passenger_id, created_at),
  KEY idx_payments_external (external_reference),
  CONSTRAINT fk_payments_ride FOREIGN KEY (ride_id) REFERENCES rides (id) ON DELETE CASCADE,
  CONSTRAINT fk_payments_passenger FOREIGN KEY (passenger_id) REFERENCES passengers (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS receipts (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  receipt_number VARCHAR(64) NOT NULL UNIQUE,
  payment_id CHAR(36) NULL,
  ride_id CHAR(36) NOT NULL,
  passenger_id CHAR(36) NOT NULL,
  amount DOUBLE NOT NULL,
  method VARCHAR(32) NOT NULL,
  paid_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_receipts_ride (ride_id),
  CONSTRAINT fk_receipts_payment FOREIGN KEY (payment_id) REFERENCES payments (id) ON DELETE SET NULL,
  CONSTRAINT fk_receipts_ride FOREIGN KEY (ride_id) REFERENCES rides (id) ON DELETE CASCADE,
  CONSTRAINT fk_receipts_passenger FOREIGN KEY (passenger_id) REFERENCES passengers (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wallets (
  passenger_id CHAR(36) NOT NULL PRIMARY KEY,
  balance DOUBLE NOT NULL DEFAULT 0,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_wallets_passenger FOREIGN KEY (passenger_id) REFERENCES passengers (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  passenger_id CHAR(36) NOT NULL,
  amount DOUBLE NOT NULL,
  type VARCHAR(16) NOT NULL,
  source VARCHAR(64) NOT NULL,
  reference VARCHAR(255) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_wallet_transactions_passenger FOREIGN KEY (passenger_id) REFERENCES passengers (id) ON DELETE CASCADE,
  CONSTRAINT chk_wallet_transactions_type CHECK (type IN ('credit', 'debit'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Wallet top-ups mirror payments: pending -> provider charge -> settle.
CREATE TABLE IF NOT EXISTS wallet_topups (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  passenger_id CHAR(36) NOT NULL,
  amount DOUBLE NOT NULL,
  phone VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  provider VARCHAR(32) NULL,
  state VARCHAR(64) NULL,
  reference VARCHAR(255) NOT NULL,
  external_reference VARCHAR(255) NULL,
  failure_reason TEXT NULL,
  metadata JSON NULL DEFAULT ('{}'),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_wallet_topups_passenger (passenger_id, created_at),
  CONSTRAINT fk_wallet_topups_passenger FOREIGN KEY (passenger_id) REFERENCES passengers (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS referrals (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  referrer_id CHAR(36) NOT NULL,
  referred_id CHAR(36) NOT NULL,
  reward_amount DOUBLE NOT NULL DEFAULT 0,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_referrals_referred (referred_id),
  CONSTRAINT fk_referrals_referrer FOREIGN KEY (referrer_id) REFERENCES passengers (id) ON DELETE CASCADE,
  CONSTRAINT fk_referrals_referred FOREIGN KEY (referred_id) REFERENCES passengers (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Rider and driver tickets share this table: a driver's ticket sets driver_id
-- and has no passenger_id.
CREATE TABLE IF NOT EXISTS support_requests (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  passenger_id CHAR(36) NULL,
  driver_id CHAR(36) NULL,
  ride_id CHAR(36) NULL,
  category VARCHAR(64) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'open',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_support_passenger (passenger_id, created_at),
  KEY idx_support_driver (driver_id, created_at),
  CONSTRAINT fk_support_requests_passenger FOREIGN KEY (passenger_id) REFERENCES passengers (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS support_messages (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  ticket_id CHAR(36) NOT NULL,
  sender_role VARCHAR(32) NOT NULL DEFAULT 'passenger',
  message TEXT NOT NULL,
  read_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_support_messages_ticket FOREIGN KEY (ticket_id) REFERENCES support_requests (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS emergency_events (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  ride_id CHAR(36) NULL,
  passenger_id CHAR(36) NULL,
  driver_id CHAR(36) NULL,
  latitude DOUBLE NULL,
  longitude DOUBLE NULL,
  address TEXT NULL,
  details TEXT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  reference VARCHAR(128) NULL,
  dispatched_at DATETIME(3) NULL,
  dispatch_started_at DATETIME(3) NULL,
  dispatch_attempts INT NOT NULL DEFAULT 0,
  dispatch_error TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  resolved_at DATETIME(3) NULL,
  UNIQUE KEY idx_emergency_reference (reference),
  KEY idx_emergency_ride (ride_id),
  KEY idx_emergency_driver (driver_id),
  CONSTRAINT fk_emergency_ride FOREIGN KEY (ride_id) REFERENCES rides (id) ON DELETE SET NULL,
  CONSTRAINT fk_emergency_passenger FOREIGN KEY (passenger_id) REFERENCES passengers (id) ON DELETE CASCADE,
  CONSTRAINT fk_emergency_driver FOREIGN KEY (driver_id) REFERENCES drivers (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Provider charges that succeeded after a ride was settled another way (or a
-- wallet top-up collected after it expired) need operator reconciliation.
CREATE TABLE IF NOT EXISTS payment_exceptions (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  payment_id CHAR(36) NULL UNIQUE,
  topup_id CHAR(36) NULL UNIQUE,
  ride_id CHAR(36) NULL,
  reason VARCHAR(128) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'open',
  resolution VARCHAR(64) NULL,
  resolution_reference VARCHAR(255) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  resolved_at DATETIME(3) NULL,
  CONSTRAINT fk_payment_exceptions_payment FOREIGN KEY (payment_id) REFERENCES payments (id),
  CONSTRAINT fk_payment_exceptions_topup FOREIGN KEY (topup_id) REFERENCES wallet_topups (id),
  CONSTRAINT fk_payment_exceptions_ride FOREIGN KEY (ride_id) REFERENCES rides (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A rider's or a driver's shared live trip (the share belongs to whoever made it).
CREATE TABLE IF NOT EXISTS trip_shares (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  token VARCHAR(255) NOT NULL UNIQUE,
  ride_id CHAR(36) NOT NULL,
  passenger_id CHAR(36) NULL,
  driver_id CHAR(36) NULL,
  view_count INT NOT NULL DEFAULT 0,
  expires_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_trip_shares_ride (ride_id),
  CONSTRAINT fk_trip_shares_ride FOREIGN KEY (ride_id) REFERENCES rides (id) ON DELETE CASCADE,
  CONSTRAINT fk_trip_shares_passenger FOREIGN KEY (passenger_id) REFERENCES passengers (id) ON DELETE CASCADE,
  CONSTRAINT fk_trip_shares_driver FOREIGN KEY (driver_id) REFERENCES drivers (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ratings (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  ride_id CHAR(36) NOT NULL UNIQUE,
  passenger_id CHAR(36) NOT NULL,
  driver_id CHAR(36) NULL,
  rating INT NOT NULL,
  comment TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_ratings_ride FOREIGN KEY (ride_id) REFERENCES rides (id) ON DELETE CASCADE,
  CONSTRAINT fk_ratings_passenger FOREIGN KEY (passenger_id) REFERENCES passengers (id) ON DELETE CASCADE,
  CONSTRAINT fk_ratings_driver FOREIGN KEY (driver_id) REFERENCES drivers (id) ON DELETE SET NULL,
  CONSTRAINT chk_ratings_range CHECK (rating BETWEEN 1 AND 5)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Safety reports a driver files about a trip, kept apart from support tickets.
CREATE TABLE IF NOT EXISTS driver_incident_reports (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  driver_id CHAR(36) NOT NULL,
  ride_id CHAR(36) NULL,
  category VARCHAR(64) NOT NULL,
  details TEXT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'open',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_driver_incidents_driver (driver_id, created_at),
  CONSTRAINT fk_driver_incidents_driver FOREIGN KEY (driver_id) REFERENCES drivers (id) ON DELETE CASCADE,
  CONSTRAINT fk_driver_incidents_ride FOREIGN KEY (ride_id) REFERENCES rides (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Driver KYC documents. The bytes live on the cPanel document store
-- (file_remote = TRUE, keyed by this row's id); file_data only holds them when
-- no store is configured (local development and tests).
CREATE TABLE IF NOT EXISTS driver_documents (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  driver_id CHAR(36) NOT NULL,
  doc_type VARCHAR(32) NOT NULL,
  file_url TEXT NULL,
  file_name VARCHAR(255) NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  rejection_reason TEXT NULL,
  expires_at DATETIME(3) NULL,
  uploaded_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  reviewed_at DATETIME(3) NULL,
  reviewed_by VARCHAR(255) NULL,
  verification_method VARCHAR(32) NULL,
  evidence_reference VARCHAR(255) NULL,
  file_data LONGBLOB NULL,
  content_type VARCHAR(100) NULL,
  file_size INT NULL,
  file_remote BOOLEAN NOT NULL DEFAULT FALSE,
  KEY idx_driver_documents_driver (driver_id, doc_type),
  CONSTRAINT fk_driver_documents_driver FOREIGN KEY (driver_id) REFERENCES drivers (id) ON DELETE CASCADE,
  CONSTRAINT chk_driver_documents_type CHECK (doc_type IN ('license', 'national_id', 'vehicle_registration', 'insurance', 'profile_photo', 'vehicle_photo', 'other')),
  CONSTRAINT chk_driver_documents_status CHECK (status IN ('pending', 'approved', 'rejected', 'expired'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS driver_notifications (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  driver_id CHAR(36) NOT NULL,
  ride_id CHAR(36) NULL,
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  type VARCHAR(32) NOT NULL DEFAULT 'general',
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_driver_notifications_driver (driver_id, created_at),
  CONSTRAINT fk_driver_notifications_driver FOREIGN KEY (driver_id) REFERENCES drivers (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS driver_device_tokens (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  driver_id CHAR(36) NOT NULL,
  token VARCHAR(512) NOT NULL UNIQUE,
  platform VARCHAR(32) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_driver_device_tokens_driver FOREIGN KEY (driver_id) REFERENCES drivers (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS driver_earnings (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  driver_id CHAR(36) NOT NULL,
  ride_id CHAR(36) NOT NULL,
  gross_amount DOUBLE NOT NULL DEFAULT 0,
  commission DOUBLE NOT NULL DEFAULT 0,
  net_amount DOUBLE NOT NULL DEFAULT 0,
  payment_method VARCHAR(32) NOT NULL DEFAULT 'cash',
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  settled_at DATETIME(3) NULL,
  KEY idx_driver_earnings_driver (driver_id, created_at),
  KEY idx_driver_earnings_ride (ride_id),
  CONSTRAINT fk_driver_earnings_driver FOREIGN KEY (driver_id) REFERENCES drivers (id) ON DELETE CASCADE,
  CONSTRAINT fk_driver_earnings_ride FOREIGN KEY (ride_id) REFERENCES rides (id) ON DELETE CASCADE,
  CONSTRAINT chk_driver_earnings_status CHECK (status IN ('pending', 'settled', 'refunded'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS driver_payouts (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  driver_id CHAR(36) NOT NULL,
  amount DOUBLE NOT NULL,
  fee DOUBLE NOT NULL DEFAULT 0,
  method VARCHAR(32) NOT NULL DEFAULT 'mobile_money',
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  reference VARCHAR(255) NULL,
  phone VARCHAR(64) NULL,
  external_reference VARCHAR(255) NULL,
  failure_reason TEXT NULL,
  reviewed_by VARCHAR(255) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  processed_at DATETIME(3) NULL,
  KEY idx_driver_payouts_driver (driver_id, created_at),
  KEY idx_driver_payouts_external (external_reference),
  CONSTRAINT fk_driver_payouts_driver FOREIGN KEY (driver_id) REFERENCES drivers (id) ON DELETE CASCADE,
  CONSTRAINT chk_driver_payouts_status CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'reversed'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS driver_settlements (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  driver_id CHAR(36) NOT NULL,
  amount DOUBLE NOT NULL,
  method VARCHAR(32) NOT NULL DEFAULT 'mobile_money',
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  reference VARCHAR(255) NULL,
  external_reference VARCHAR(255) NULL,
  recorded_by VARCHAR(255) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_driver_settlements_driver (driver_id, created_at),
  KEY idx_driver_settlements_external (external_reference),
  CONSTRAINT fk_driver_settlements_driver FOREIGN KEY (driver_id) REFERENCES drivers (id) ON DELETE CASCADE,
  CONSTRAINT chk_driver_settlements_method CHECK (method IN ('mobile_money', 'operator')),
  CONSTRAINT chk_driver_settlements_status CHECK (status IN ('pending', 'succeeded', 'failed'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS driver_status_history (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  driver_id CHAR(36) NOT NULL,
  from_status VARCHAR(32) NULL,
  to_status VARCHAR(32) NOT NULL,
  changed_by VARCHAR(64) NOT NULL DEFAULT 'driver',
  reason TEXT NULL,
  changed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_driver_status_history (driver_id, changed_at),
  CONSTRAINT fk_driver_status_history_driver FOREIGN KEY (driver_id) REFERENCES drivers (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Vehicle catalogue. The published tariff (Fare Info / Tariff screens) is the
-- single source of truth for what a rider is charged, so the rates below are
-- re-applied on every start; the base fare is the minimum fare.
INSERT INTO vehicles (id, name, description, capacity, base_fare, fare_per_km, eta_minutes) VALUES
  ('fem_economy', 'Kimu Economy', 'Everyday rides at the best price.', 4, 1200, 500, 5),
  ('fem_comfort', 'Kimu Comfort', 'Newer cars with extra legroom.', 4, 1800, 700, 6),
  ('fem_xl', 'Kimu XL', 'Spacious vehicles for groups and luggage.', 6, 2500, 900, 8)
ON DUPLICATE KEY UPDATE id = id;

UPDATE vehicles SET
  base_fare = 1800,
  included_km = 1,
  fare_per_km = 1080,
  long_distance_km = 30,
  fare_per_km_long = 900,
  waiting_fee = 1500,
  waiting_fee_minutes = 15,
  free_waiting_minutes = 15,
  per_minute = 0,
  booking_fee = 0,
  min_fare = 1800;
