# FEM C@BS backend

Node.js + Express + PostgreSQL REST API for the FEM C@BS passenger app.

The current routes and schema use PostgreSQL. `MONGODB_URI` is reserved for a
future migration and is not used by the current API; do not put a MongoDB URI
in tracked source files. Store it in `server/.env` when the data layer is
migrated deliberately.

## Setup

1. Have a PostgreSQL server running and create a database (or use an existing one).
2. Copy `.env.example` to `.env` and set `DATABASE_URL`, e.g.:
   ```
   DATABASE_URL=postgres://postgres:postgres@localhost:5432/femcabs
   ```
3. Install dependencies and start:
   ```
   npm install
   npm start
   ```
   The schema in `src/schema.sql` (tables + the vehicle catalogue seed) is applied
   automatically on every start — it's idempotent, safe to run repeatedly.

The Expo app reads `EXPO_PUBLIC_API_BASE_URL` at build time. The Render
blueprint builds its web export from the repository root and serves it with
this API.

## API summary

All authenticated routes require `Authorization: Bearer <token>` (returned by
signup/login). All responses are JSON; errors are `{ "error": "message" }`.

- `POST /api/auth/signup` `{ fullName, phone, email, password }` → `{ passenger, token }`
- `POST /api/auth/login` `{ identifier, password }` → `{ passenger, token }`
- `POST /api/auth/verify-otp` `{ passengerId, code }`
- `POST /api/auth/reset-password/request` `{ identifier }`
- `POST /api/auth/reset-password/confirm` `{ identifier, code, newPassword }`
- `GET /api/auth/me` (auth)
- `PUT /api/auth/profile` (auth) `{ fullName?, phone?, email?, photoUrl?, emergencyContactName?, emergencyContactPhone? }`
- `DELETE /api/auth/account` (auth)

- `GET /api/vehicles` — the ride catalogue

- `GET /api/places/saved` (auth)
- `POST /api/places/saved` (auth) `{ type, name, address, latitude?, longitude? }`
- `DELETE /api/places/saved/:id` (auth)

- `POST /api/rides` (auth) `{ pickup: {address, latitude, longitude}, destination: {...}, vehicleId, paymentMethodId }`
  — distance/duration/fare are always computed server-side. Kicks off a simulated
  driver-matching lifecycle (see below).
- `GET /api/rides` (auth) — ride history
- `GET /api/rides/:id` (auth)
- `GET /api/rides/:id/stream` (auth) — Server-Sent Events with live status pushes
- `POST /api/rides/:id/cancel` (auth)
- `POST /api/rides/:id/rate` (auth) `{ rating: 1-5, comment? }`

- `POST /api/payments` (auth) `{ rideId }` — initiates the ride's selected method.
  `{ rideId, method: "cash" }` is available only after a previous payment is
  confirmed failed. The assigned driver then calls
  `POST /api/drivers/rides/:id/confirm-cash` after collecting cash.

- `GET /api/notifications` (auth)
- `POST /api/notifications/:id/read` (auth)
- `POST /api/notifications/device-token` (auth) `{ token, platform? }`

- `POST /api/support` (auth) `{ category, subject, message }`
- `GET /api/support` (auth)

## The ride simulator

There is no live driver fleet yet, so `src/services/rideSimulator.js` plays a
requested ride forward through `searchingDriver → driverAssigned →
driverArriving → inProgress → completed` using timers, picking from a small
roster of fictional drivers. Pacing is controlled by `SIM_ACCEPT_DELAY`,
`SIM_WAIT_AT_PICKUP` and `SIM_SECONDS_PER_KM` in `.env`. Swap this module out
for real dispatch once there are actual drivers — every other route (history,
cancel, rate, payments) already works against whatever is in the `rides` table
regardless of who/what updates it.

## Dev conveniences

`DEV_REVEAL_CODES=1` (the default) returns OTP codes and payment references
directly in API responses so the flows can be exercised without a real SMS/
payment provider. Set it to `0` before shipping — codes must go out over real
SMS and payment references must come from the real provider webhook instead.

## Going to production

With `NODE_ENV=production` the server refuses to start until every item
below is configured (it prints exactly what is missing). `render.yaml` at the
repo root lists the same variables for the Render service.

**OTP SMS.** Set `SMS_PROVIDER` to `pindo`, `africastalking` or `generic`,
plus `SMS_API_KEY` (and `AT_USERNAME` for Africa's Talking, or
`SMS_GATEWAY_URL` for generic). `SMS_SENDER_NAME` must be a sender ID
registered with the provider. If a send fails, resending a code or
requesting a password reset returns a 502 the app can show.

**Paypack.** Set `PAYPACK_CLIENT_ID`, `PAYPACK_CLIENT_SECRET` and
`PAYPACK_WEBHOOK_SECRET`, and register
`https://<api-host>/api/webhooks/paypack` as the webhook in the Paypack
dashboard. Successful or failed `transaction:processed` events settle ride
payments and wallet top-ups (each one exactly once, even if the event is
delivered twice). The app's refresh endpoints poll Paypack as a fallback.

**SOS.** `EMERGENCY_CALL_CENTER_PHONE` is the number the SOS button dials.
The API also sends a reference-bearing SMS alert to that number. Operators
must monitor `GET /api/admin/emergencies`, call the rider, and resolve the
event through `POST /api/admin/emergencies/:id/resolve`. Failed SMS sends stay
in the queue and are retried. Confirm provider delivery and staff coverage
before opening this workflow to riders.

**Maps.** Production requires private or contracted `OSRM_URL`, `PHOTON_URL`
and `PHOTON_REVERSE_URL` endpoints. Optional Nominatim fallback must also be
private. The public demonstration endpoints are development defaults only.

**Driver verification.** New drivers start unverified and can't go online
until an operator approves them. Set `ADMIN_API_KEY` (at least 24 random
characters) and call the admin API with the `X-Admin-Key` header:

```
H="X-Admin-Key: $ADMIN_API_KEY"; API=https://<api-host>/api/admin
curl -H "$H" "$API/drivers?verified=false"          # awaiting review, with documents
curl -H "$H" -X POST "$API/documents/<docId>/review" \
     -H 'Content-Type: application/json' \
     -d '{"status":"approved","reviewer":"operator-id","method":"in_person","evidenceReference":"inspection-log-id"}'
     # or {"status":"rejected","reason":"Photo unreadable"}
curl -H "$H" -X POST "$API/drivers/<driverId>/verify"
curl -H "$H" -X POST "$API/drivers/<driverId>/suspend" \
     -H 'Content-Type: application/json' -d '{"reason":"..."}'
```

The driver gets an in-app notification for each decision.
Inspect the original license, national ID, vehicle registration and insurance
in person before recording approval. All four current documents must be
approved before driver verification and dispatch. Driver-submitted filenames
and URLs alone are not evidence. Verified drivers cannot change their vehicle
details through self service. Operators can use
`PUT /api/admin/drivers/:id/vehicle` to change those details; this takes the
driver offline and requires fresh registration and insurance review.

Monitor `GET /api/admin/payment-exceptions` for provider charges that arrive
after a ride was settled another way; these require operator reconciliation
and a refund where appropriate. Record the provider refund or investigation
reference through `POST /api/admin/payment-exceptions/:id/resolve` with
`{"resolution":"refunded","reference":"provider-refund-id"}` (or
`resolution: "no_refund_due"` with an investigation reference).

**Demo switches.** `DEV_REVEAL_CODES`, `DEMO_PAYMENTS` and
`DEV_AUTO_VERIFY_DRIVERS` must be `0`.

`test/production-readiness.js` covers the webhook, admin and driver
verification flows end to end. Run it against a dev server started with the
same `PAYPACK_WEBHOOK_SECRET` and `ADMIN_API_KEY`.

## Pricing, routing and the demo fleet

**Upfront pricing** (`src/services/pricing.js`): every fare uses the real
road route, not the straight line, and is itemised as base + per-km +
per-minute + booking fee, a minimum fare, surge (demand vs available cars
within 3 km of the pickup, up to ×2.0) and the shared-ride discount, rounded
up to 100 RWF. `GET /api/rides/quote` prices every vehicle class at once with
the route geometry and pickup ETAs by road; each option's `quoteId` locks its
price for 5 minutes when passed to `POST /api/rides`. Per-class rates live in
the `vehicles` table (`per_minute`, `min_fare`, `booking_fee`).

**Routing** (`src/services/routing.js`) goes through OSRM. The public
`router.project-osrm.org` demo is for non-commercial use at up to 1
request/second, so production must self-host: `osrm/build-rwanda.sh` builds a
Rwanda graph from the daily Geofabrik extract (about 120 MB of RAM, a few
minutes) and `osrm/Dockerfile` bakes it into a deployable image. Point the
API at it with `OSRM_URL=http://<host>:5000/route/v1/driving`. Matching and
pickup ETAs use OSRM's table service to rank nearby cars by road time.

**Demo fleet** (`DEMO_FLEET=1`, refused in production): 16 simulated
drivers drive real Kigali roads between real places and serve rides end to
end (accept, drive to the pickup, start with the PIN, drive, complete)
through the same code paths as the driver app. `FLEET_DEBUG=1` logs each
car's decisions. Nearby cars and the assigned driver are served with the
last ~12 s of their trail so the app can animate them along the road.

**Tests**: `test/invariants.js` (production mode, fake Paypack/SMS, random
walk with money/state invariants after every step), `test/smoke.js`,
`test/wallet-flow.js`, `test/production-readiness.js`, and
`test/jev-place-search.js`, where TypeSafe's Jev judges whether place search
returns the place a rider meant (needs `TYPESAFE_API_KEY`).

## Wiring up the app

The current Expo passenger and driver clients use the service modules at the
repository root. Set `EXPO_PUBLIC_API_BASE_URL` to the deployed API URL ending
in `/api` before exporting web or building native clients.
