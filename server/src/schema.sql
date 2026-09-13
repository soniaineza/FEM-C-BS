CREATE TABLE IF NOT EXISTS passengers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  photo_url TEXT,
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  is_profile_complete BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS verification_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passenger_id UUID NOT NULL REFERENCES passengers(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'otp',
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ
);

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

CREATE TABLE IF NOT EXISTS vehicles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  capacity INTEGER NOT NULL,
  base_fare DOUBLE PRECISION NOT NULL,
  fare_per_km DOUBLE PRECISION NOT NULL,
  eta_minutes INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS rides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passenger_id UUID NOT NULL REFERENCES passengers(id) ON DELETE CASCADE,
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id),
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

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  passenger_id UUID NOT NULL REFERENCES passengers(id) ON DELETE CASCADE,
  amount DOUBLE PRECISION NOT NULL,
  method TEXT NOT NULL,
  status TEXT NOT NULL,
  reference TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passenger_id UUID NOT NULL REFERENCES passengers(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'general',
  read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS device_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passenger_id UUID NOT NULL REFERENCES passengers(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  platform TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS support_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passenger_id UUID NOT NULL REFERENCES passengers(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rides_passenger ON rides(passenger_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_passenger ON notifications(passenger_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_ride ON payments(ride_id);
CREATE INDEX IF NOT EXISTS idx_device_tokens_passenger ON device_tokens(passenger_id);

-- Vehicle catalogue served by the backend (real data).
INSERT INTO vehicles (id, name, description, capacity, base_fare, fare_per_km, eta_minutes) VALUES
  ('fem_economy', 'FEM Economy', 'Everyday rides at the best price.', 4, 1200, 500, 5),
  ('fem_comfort', 'FEM Comfort', 'Newer cars with extra legroom.', 4, 1800, 700, 6),
  ('fem_xl', 'FEM XL', 'Spacious vehicles for groups and luggage.', 6, 2500, 900, 8)
ON CONFLICT (id) DO NOTHING;