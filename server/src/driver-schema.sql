-- ============================================================
-- Kimu Transport Driver-Side Database Extensions
-- ============================================================
-- These tables extend the existing passenger schema with
-- driver-specific features: documents, earnings, payouts,
-- driver notifications, and status history.
-- ============================================================

-- Extend the drivers table with fields needed for the driver app.
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS preferred_language TEXT DEFAULT 'en';
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS is_profile_complete BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS vehicle_make TEXT;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS vehicle_model TEXT;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS vehicle_year INTEGER;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS vehicle_color TEXT;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS vehicle_plate TEXT;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS total_earnings DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS today_earnings DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Driver documents for KYC / verification.
CREATE TABLE IF NOT EXISTS driver_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL CHECK (doc_type IN ('license', 'national_id', 'vehicle_registration', 'insurance', 'profile_photo', 'vehicle_photo', 'other')),
  file_url TEXT,
  file_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  rejection_reason TEXT,
  expires_at TIMESTAMPTZ,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT,
  verification_method TEXT,
  evidence_reference TEXT
);
ALTER TABLE driver_documents ADD COLUMN IF NOT EXISTS reviewed_by TEXT;
ALTER TABLE driver_documents ADD COLUMN IF NOT EXISTS verification_method TEXT;
ALTER TABLE driver_documents ADD COLUMN IF NOT EXISTS evidence_reference TEXT;
CREATE INDEX IF NOT EXISTS idx_driver_documents_driver ON driver_documents(driver_id, doc_type);

-- Driver-specific notifications (separate from passenger notifications).
CREATE TABLE IF NOT EXISTS driver_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  ride_id UUID,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'general',
  read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_driver_notifications_driver ON driver_notifications(driver_id, created_at DESC);

-- Driver device tokens for push notifications.
CREATE TABLE IF NOT EXISTS driver_device_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  platform TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Driver earnings log (per-ride breakdown).
CREATE TABLE IF NOT EXISTS driver_earnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  gross_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  commission DOUBLE PRECISION NOT NULL DEFAULT 0,
  net_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL DEFAULT 'cash',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'settled', 'refunded')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  settled_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_driver_earnings_driver ON driver_earnings(driver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_driver_earnings_ride ON driver_earnings(ride_id);

-- Driver payouts.
CREATE TABLE IF NOT EXISTS driver_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  amount DOUBLE PRECISION NOT NULL,
  method TEXT NOT NULL DEFAULT 'mobile_money',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'reversed')),
  reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_driver_payouts_driver ON driver_payouts(driver_id, created_at DESC);

-- Driver status change history (audit trail).
CREATE TABLE IF NOT EXISTS driver_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_by TEXT NOT NULL DEFAULT 'driver',
  reason TEXT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_driver_status_history ON driver_status_history(driver_id, changed_at DESC);

-- Extend support_requests to support driver tickets too.
ALTER TABLE support_requests ADD COLUMN IF NOT EXISTS driver_id UUID;
-- Driver support tickets: reuse the same table with driver_id set.
CREATE INDEX IF NOT EXISTS idx_support_driver ON support_requests(driver_id, created_at DESC) WHERE driver_id IS NOT NULL;

-- Extend emergency_events for drivers.
ALTER TABLE emergency_events ADD COLUMN IF NOT EXISTS driver_id UUID;
CREATE INDEX IF NOT EXISTS idx_emergency_driver ON emergency_events(driver_id) WHERE driver_id IS NOT NULL;

-- Ensure driver_id index exists on driver_locations for fast lookups.
CREATE INDEX IF NOT EXISTS idx_driver_locations_driver ON driver_locations(driver_id);

-- Live passenger location, reported by the rider's own phone while a ride is
-- active — lets the assigned driver see where the passenger actually is
-- (they may have walked from where they originally requested pickup), the
-- same way driver_locations already lets the passenger see the driver.
-- Mirrors driver_locations' shape exactly.
CREATE TABLE IF NOT EXISTS passenger_locations (
  passenger_id UUID PRIMARY KEY REFERENCES passengers(id) ON DELETE CASCADE,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  heading DOUBLE PRECISION,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Payout requests: who it is paid to, the provider transfer and its outcome.
ALTER TABLE driver_payouts ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE driver_payouts ADD COLUMN IF NOT EXISTS external_reference TEXT;
ALTER TABLE driver_payouts ADD COLUMN IF NOT EXISTS failure_reason TEXT;
ALTER TABLE driver_payouts ADD COLUMN IF NOT EXISTS reviewed_by TEXT;
CREATE INDEX IF NOT EXISTS idx_driver_payouts_external ON driver_payouts(external_reference)
  WHERE external_reference IS NOT NULL;

-- Commission a driver pays in to the platform (owed on cash trips, where the
-- driver collected the whole fare): by mobile money, or recorded by an
-- operator when paid in person.
CREATE TABLE IF NOT EXISTS driver_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  amount DOUBLE PRECISION NOT NULL,
  method TEXT NOT NULL DEFAULT 'mobile_money' CHECK (method IN ('mobile_money', 'operator')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'succeeded', 'failed')),
  reference TEXT,
  external_reference TEXT,
  recorded_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_driver_settlements_driver ON driver_settlements(driver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_driver_settlements_external ON driver_settlements(external_reference)
  WHERE external_reference IS NOT NULL;
