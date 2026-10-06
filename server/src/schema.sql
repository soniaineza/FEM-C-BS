CREATE TABLE IF NOT EXISTS passengers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  photo_url TEXT,
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  preferred_language TEXT,
  referral_code TEXT UNIQUE,
  referred_by UUID,
  is_profile_complete BOOLEAN NOT NULL DEFAULT FALSE,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE passengers ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS verification_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passenger_id UUID NOT NULL REFERENCES passengers(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'otp',
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
UPDATE passengers p SET verified_at = v.used_at
  FROM (SELECT passenger_id, MIN(used_at) AS used_at FROM verification_codes
        WHERE purpose='signup' AND used_at IS NOT NULL GROUP BY passenger_id) v
  WHERE p.id=v.passenger_id AND p.verified_at IS NULL;

CREATE TABLE IF NOT EXISTS saved_places (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passenger_id UUID NOT NULL REFERENCES passengers(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recent_destinations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passenger_id UUID NOT NULL REFERENCES passengers(id) ON DELETE CASCADE,
  address TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  times_used INTEGER NOT NULL DEFAULT 1,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (passenger_id, address)
);

CREATE TABLE IF NOT EXISTS vehicles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  capacity INTEGER NOT NULL,
  base_fare DOUBLE PRECISION NOT NULL,
  fare_per_km DOUBLE PRECISION NOT NULL,
  eta_minutes INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS drivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  license_number TEXT,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'offline',
  current_vehicle_id TEXT REFERENCES vehicles(id),
  current_latitude DOUBLE PRECISION,
  current_longitude DOUBLE PRECISION,
  rating DOUBLE PRECISION,
  total_trips INTEGER NOT NULL DEFAULT 0,
  last_online_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passenger_id UUID NOT NULL REFERENCES passengers(id) ON DELETE CASCADE,
  driver_id UUID REFERENCES drivers(id),
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id),
  ride_type TEXT NOT NULL DEFAULT 'private',
  pickup_address TEXT NOT NULL,
  pickup_latitude DOUBLE PRECISION NOT NULL,
  pickup_longitude DOUBLE PRECISION NOT NULL,
  dest_address TEXT NOT NULL,
  dest_latitude DOUBLE PRECISION NOT NULL,
  dest_longitude DOUBLE PRECISION NOT NULL,
  distance_km DOUBLE PRECISION NOT NULL,
  duration_minutes INTEGER NOT NULL,
  estimated_fare DOUBLE PRECISION NOT NULL,
  final_fare DOUBLE PRECISION,
  status TEXT NOT NULL DEFAULT 'searchingDriver',
  payment_method TEXT NOT NULL,
  ride_note TEXT,
  ride_pin_hash TEXT,
  pin_verified_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  cancelled_by TEXT,
  scheduled_for TIMESTAMPTZ,
  promotion_id UUID,
  applied_discount DOUBLE PRECISION,
  driver_name TEXT,
  driver_phone TEXT,
  driver_rating DOUBLE PRECISION,
  driver_vehicle_model TEXT,
  driver_vehicle_color TEXT,
  driver_license_plate TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  arrived_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  rating INTEGER,
  rating_comment TEXT
);

ALTER TABLE rides ADD COLUMN IF NOT EXISTS driver_id UUID;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS ride_pin TEXT;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS ride_pin_hash TEXT;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS pin_verified_at TIMESTAMPTZ;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS pin_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS cancelled_by TEXT;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS promotion_id UUID;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS applied_discount DOUBLE PRECISION;

-- Real shared-ride pooling: rides that are actually being driven together, in
-- the same vehicle, at the same time share a pool_group_id (the id of the
-- first ride in the pool). A private ride's pool_group_id is always NULL.
ALTER TABLE rides ADD COLUMN IF NOT EXISTS pool_group_id UUID;
CREATE INDEX IF NOT EXISTS idx_rides_pool_group ON rides (pool_group_id)
  WHERE pool_group_id IS NOT NULL;
-- Seats this booking takes in a shared vehicle (1 or 2). Private rides are 1.
ALTER TABLE rides ADD COLUMN IF NOT EXISTS seats INTEGER NOT NULL DEFAULT 1;
-- Mobile-money number to charge when it is not the rider's account phone.
ALTER TABLE rides ADD COLUMN IF NOT EXISTS payment_phone TEXT;
-- Set when the driver did not confirm a cash fare in time: the ride is with
-- an operator (payment_exceptions) and no longer blocks the rider or driver.
ALTER TABLE rides ADD COLUMN IF NOT EXISTS cash_disputed_at TIMESTAMPTZ;
-- A closed account keeps its row (rides, payments and wallet history hang
-- off it) with the personal details removed.
ALTER TABLE passengers ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS ride_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_by TEXT NOT NULL DEFAULT 'system',
  reason TEXT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ride_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS driver_locations (
  driver_id UUID PRIMARY KEY REFERENCES drivers(id) ON DELETE CASCADE,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  heading DOUBLE PRECISION,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- GPS breadcrumbs recorded while a ride is active, so the passenger can see
-- the actual road path the driver drove (not just a straight pickup->drop
-- line) once the trip is done.
CREATE TABLE IF NOT EXISTS ride_route_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ride_route_points_ride_id
  ON ride_route_points (ride_id, recorded_at);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passenger_id UUID NOT NULL REFERENCES passengers(id) ON DELETE CASCADE,
  ride_id UUID,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'general',
  read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS ride_id UUID;

CREATE TABLE IF NOT EXISTS device_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passenger_id UUID NOT NULL REFERENCES passengers(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  platform TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  passenger_id UUID NOT NULL REFERENCES passengers(id) ON DELETE CASCADE,
  amount DOUBLE PRECISION NOT NULL,
  method TEXT NOT NULL,
  status TEXT NOT NULL,
  provider TEXT,
  state TEXT,
  reference TEXT NOT NULL,
  external_reference TEXT,
  description TEXT,
  idempotency_key TEXT UNIQUE,
  webhook_id TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE payments ADD COLUMN IF NOT EXISTS provider TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS external_reference TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS webhook_id TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
ALTER TABLE payments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number TEXT NOT NULL UNIQUE,
  payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
  ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  passenger_id UUID NOT NULL REFERENCES passengers(id) ON DELETE CASCADE,
  amount DOUBLE PRECISION NOT NULL,
  method TEXT NOT NULL,
  paid_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
  discount_value DOUBLE PRECISION NOT NULL,
  min_fare DOUBLE PRECISION DEFAULT 0,
  max_discount DOUBLE PRECISION,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  max_uses INTEGER,
  uses_count INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wallets (
  passenger_id UUID PRIMARY KEY REFERENCES passengers(id) ON DELETE CASCADE,
  balance DOUBLE PRECISION NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passenger_id UUID NOT NULL REFERENCES passengers(id) ON DELETE CASCADE,
  amount DOUBLE PRECISION NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('credit', 'debit')),
  source TEXT NOT NULL,
  reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Wallet top-ups: a passenger depositing money into their Kimu Wallet via
-- mobile money, mirroring the `payments` table's pending -> provider-charge
-- -> settle shape (server/src/services/payments.js) so it goes through the
-- same real Paypack collect/refresh flow and is never faked when the
-- provider isn't configured.
CREATE TABLE IF NOT EXISTS wallet_topups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passenger_id UUID NOT NULL REFERENCES passengers(id) ON DELETE CASCADE,
  amount DOUBLE PRECISION NOT NULL,
  phone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  provider TEXT,
  state TEXT,
  reference TEXT NOT NULL,
  external_reference TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wallet_topups_passenger ON wallet_topups(passenger_id, created_at DESC);

CREATE TABLE IF NOT EXISTS referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES passengers(id) ON DELETE CASCADE,
  referred_id UUID NOT NULL REFERENCES passengers(id) ON DELETE CASCADE,
  reward_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (referred_id)
);

CREATE TABLE IF NOT EXISTS support_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passenger_id UUID NOT NULL REFERENCES passengers(id) ON DELETE CASCADE,
  ride_id UUID,
  category TEXT NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS support_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES support_requests(id) ON DELETE CASCADE,
  sender_role TEXT NOT NULL DEFAULT 'passenger',
  message TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS emergency_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID REFERENCES rides(id) ON DELETE SET NULL,
  passenger_id UUID NOT NULL REFERENCES passengers(id) ON DELETE CASCADE,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  address TEXT,
  details TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
ALTER TABLE emergency_events ADD COLUMN IF NOT EXISTS reference TEXT;
ALTER TABLE emergency_events ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ;
ALTER TABLE emergency_events ADD COLUMN IF NOT EXISTS dispatch_started_at TIMESTAMPTZ;
ALTER TABLE emergency_events ADD COLUMN IF NOT EXISTS dispatch_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE emergency_events ADD COLUMN IF NOT EXISTS dispatch_error TEXT;
ALTER TABLE emergency_events ALTER COLUMN passenger_id DROP NOT NULL;
ALTER TABLE emergency_events ADD COLUMN IF NOT EXISTS driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_emergency_reference ON emergency_events(reference);

-- Provider charges that succeeded after a ride was settled another way need
-- operator refund/reconciliation, never another ride completion or earnings.
CREATE TABLE IF NOT EXISTS payment_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL UNIQUE REFERENCES payments(id),
  ride_id UUID NOT NULL REFERENCES rides(id),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  resolution TEXT,
  resolution_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
ALTER TABLE payment_exceptions ADD COLUMN IF NOT EXISTS resolution TEXT;
ALTER TABLE payment_exceptions ADD COLUMN IF NOT EXISTS resolution_reference TEXT;
-- A wallet top-up the provider collected after it had expired or failed is
-- queued for refund the same way, keyed by the top-up instead of a payment.
ALTER TABLE payment_exceptions ALTER COLUMN payment_id DROP NOT NULL;
ALTER TABLE payment_exceptions ALTER COLUMN ride_id DROP NOT NULL;
ALTER TABLE payment_exceptions ADD COLUMN IF NOT EXISTS topup_id UUID UNIQUE REFERENCES wallet_topups(id);

-- Why an attempt ended unpaid (PAYMENT_EXPIRED, PROVIDER_DECLINED, ...).
-- status is one of: pending | succeeded | failed | expired | refund_pending |
-- refunded — see services/paymentState.js for the allowed moves.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS failure_reason TEXT;
ALTER TABLE wallet_topups ADD COLUMN IF NOT EXISTS failure_reason TEXT;

CREATE TABLE IF NOT EXISTS trip_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  passenger_id UUID NOT NULL REFERENCES passengers(id) ON DELETE CASCADE,
  view_count INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID NOT NULL UNIQUE REFERENCES rides(id) ON DELETE CASCADE,
  passenger_id UUID NOT NULL REFERENCES passengers(id) ON DELETE CASCADE,
  driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ride status is a closed set governed by the state machine in
-- services/rideStateMachine.js (new statuses require a migration).
DO $block$
BEGIN
  ALTER TABLE rides DROP CONSTRAINT IF EXISTS rides_status_check;
  ALTER TABLE rides ADD CONSTRAINT rides_status_check CHECK (
    status IN (
      'scheduled', 'searchingDriver', 'driverAssigned', 'driverArriving',
      'driverArrived', 'pinVerified', 'inProgress', 'arrived',
      'paymentPending', 'completed', 'cancelled'
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $block$;

CREATE INDEX IF NOT EXISTS idx_rides_passenger ON rides(passenger_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rides_driver ON rides(driver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rides_status ON rides(status);
CREATE INDEX IF NOT EXISTS idx_rides_scheduled ON rides(scheduled_for) WHERE scheduled_for IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ride_history_ride ON ride_status_history(ride_id, changed_at);
CREATE INDEX IF NOT EXISTS idx_ride_events_ride ON ride_events(ride_id, created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_passenger ON notifications(passenger_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_ride ON payments(ride_id);
CREATE INDEX IF NOT EXISTS idx_payments_passenger ON payments(passenger_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_receipts_ride ON receipts(ride_id);
CREATE INDEX IF NOT EXISTS idx_device_tokens_passenger ON device_tokens(passenger_id);
CREATE INDEX IF NOT EXISTS idx_recent_dest_passenger ON recent_destinations(passenger_id, last_used_at DESC);
CREATE INDEX IF NOT EXISTS idx_drivers_status ON drivers(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_support_passenger ON support_requests(passenger_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_emergency_ride ON emergency_events(ride_id) WHERE ride_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trip_shares_ride ON trip_shares(ride_id);
CREATE INDEX IF NOT EXISTS idx_verification_lookup ON verification_codes(passenger_id, purpose, used_at);

-- Vehicle catalogue served by the backend (real data).
INSERT INTO vehicles (id, name, description, capacity, base_fare, fare_per_km, eta_minutes) VALUES
  ('fem_economy', 'Kimu Economy', 'Everyday rides at the best price.', 4, 1200, 500, 5),
  ('fem_comfort', 'Kimu Comfort', 'Newer cars with extra legroom.', 4, 1800, 700, 6),
  ('fem_xl', 'Kimu XL', 'Spacious vehicles for groups and luggage.', 6, 2500, 900, 8)
ON CONFLICT (id) DO NOTHING;
-- Brand rename: existing databases still hold the old default names.
-- Only rows that were never edited by an operator are touched.
UPDATE vehicles SET name = 'Kimu Economy' WHERE id = 'fem_economy' AND name = 'FEM Economy';
UPDATE vehicles SET name = 'Kimu Comfort' WHERE id = 'fem_comfort' AND name = 'FEM Comfort';
UPDATE vehicles SET name = 'Kimu XL' WHERE id = 'fem_xl' AND name = 'FEM XL';
-- Upfront pricing (services/pricing.js): per-minute rate, minimum fare and
-- booking fee per vehicle class. Seeded only where still unset so operator
-- edits are never overwritten.
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS per_minute DOUBLE PRECISION;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS min_fare DOUBLE PRECISION;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS booking_fee DOUBLE PRECISION;
UPDATE vehicles SET per_minute = 40, min_fare = 2000, booking_fee = 200
 WHERE id = 'fem_economy' AND per_minute IS NULL;
UPDATE vehicles SET per_minute = 60, min_fare = 3000, booking_fee = 250
 WHERE id = 'fem_comfort' AND per_minute IS NULL;
UPDATE vehicles SET per_minute = 80, min_fare = 4000, booking_fee = 300
 WHERE id = 'fem_xl' AND per_minute IS NULL;

-- The itemised fare a ride was booked at, and the surge in effect then.
ALTER TABLE rides ADD COLUMN IF NOT EXISTS fare_breakdown JSONB;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS surge_multiplier DOUBLE PRECISION;

-- Direction of travel, so maps can orient the car.
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS current_heading DOUBLE PRECISION;
