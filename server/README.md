# Kimu Transport backend

Node.js + Express + PostgreSQL REST API for the Kimu Transport passenger app.

The current routes and schema use PostgreSQL. `MONGODB_URI` is reserved for a
future migration and is not used by the current API; do not put a MongoDB URI
in tracked source files. Store it in `server/.env` when the data layer is
migrated deliberately.

## Setup

1. Have a PostgreSQL server running and create a database (or use an existing one).
2. Copy `.env.example` to `.env` and set `DATABASE_URL`, e.g.:
   ```
   DATABASE_URL=postgres://postgres:postgres@localhost:5432/kimutransport
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

- `GET /api/rides/quote?pickup=lat,lng&destination=lat,lng&rideType=private|shared&seats=1|2`
  — upfront price for every vehicle class. A shared quote also returns
  `shared: { maxAddedMinutes, maxSeats, seats }`.
- `POST /api/rides` (auth) `{ pickup: {address, latitude, longitude}, destination: {...}, vehicleId, paymentMethodId, rideType?, seats?, quoteId? }`
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

## Development switches

`DEV_REVEAL_CODES`, `DEV_AUTO_VERIFY_DRIVERS`, `DEV_ALLOW_STALE_DRIVERS`,
`DEMO_PAYMENTS` and `DEMO_FLEET` exist so the flows can be exercised on a
developer's machine without SMS, operator review, GPS or a payment provider.
They take effect only when `DATABASE_URL` points at a local database
(`localhost`). On any hosted database they are ignored with a warning,
whatever `NODE_ENV` is, and with `NODE_ENV=production` the server refuses to
start if one is even set.

The same rule protects against development accounts. `npm run seed:dev`
creates three test drivers; it needs `SEED_DEV_DATA=1`, a local database and
your own `SEED_DRIVER_PASSWORD` in `server/.env` (there is no built-in
password). On a hosted database the server closes those accounts, and any
simulated-fleet accounts, at every startup: no password, unverified,
suspended. Without an SMS provider a hosted server fails to send a login code
rather than writing it to the log.

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

**Payment states.** Every ride payment and wallet top-up is one attempt in one of
`pending`, `succeeded`, `failed`, `expired`, `refund_pending`, `refunded`
(`src/services/paymentState.js`). A mobile-money prompt nobody approves expires
after `PAYMENT_EXPIRY_SECONDS` (default 180); the rider can then send a new
prompt (a new attempt with its own idempotency key) or switch to cash. Money
Paypack collects for an attempt that had already failed or expired, for a fare
paid another way, or for the wrong amount is never applied: the attempt becomes
`refund_pending` and appears in `GET /api/admin/payment-exceptions` with the
number to refund; resolving it as `refunded` closes it. Drivers are released
at the end of a wallet or mobile-money trip; a cash trip holds them until they
confirm the cash.

**Unconfirmed cash.** If a driver does not confirm a cash fare within
`CASH_CONFIRM_TIMEOUT_SECONDS` (default 15 minutes) the ride is handed to an
operator as a `cash_unconfirmed` payment exception and both rider and driver
are freed. Nothing is marked paid. The driver can still confirm later, which
closes the case; otherwise an operator decides:

```
curl -H "$H" "$API/payment-exceptions"
curl -H "$H" -X POST "$API/payment-exceptions/<id>/resolve"      -H 'Content-Type: application/json'      -d '{"resolution":"cash_received","reference":"call-log-id"}'
     # or "cash_not_received": the ride ends cancelled, no money is recorded
```

**Closing accounts.** `DELETE /api/auth/account` and
`DELETE /api/driver/account` never delete the row: personal details are
removed, sign-in and existing sessions stop working, and the phone number is
freed, while rides, payments, receipts, wallet history, earnings and cash
records stay. A rider with an unfinished or unpaid ride, and a driver with an
open ride, a payout in progress or cash still owed to Kimu, is refused.

**Operator checks** (read-only):

```
curl -H "$H" "$API/paypack/status"     # do the Paypack credentials still sign in?
curl -H "$H" "$API/audit/test-data"    # records that look like development/test data
```

**Browser origins.** The web app is served by this server and the mobile apps
are not browsers, so `CORS_ORIGINS` can be left empty. On a hosted database
`*` is ignored; list exact origins only if another website must call the API.

**SOS.** `EMERGENCY_CALL_CENTER_PHONE` is the number the SOS button dials.
The API also sends a reference-bearing SMS alert to that number. Operators
must monitor `GET /api/admin/emergencies`, call the rider, and resolve the
event through `POST /api/admin/emergencies/:id/resolve`. Failed SMS sends stay
in the queue and are retried. Confirm provider delivery and staff coverage
before opening this workflow to riders.

**Maps.** The apps never call a map provider: they call `/api/maps/search`,
`/api/maps/reverse`, `/api/maps/route` and `/api/maps/config` on this server
(signed-in riders and drivers only, rate limited per account, coordinates
validated against the service area). Which provider answers is configuration:

| Variable | Values |
| --- | --- |
| `MAP_ROUTING_PROVIDER` | `geoapify` (needs `MAP_ROUTING_API_KEY`) or `osrm` (needs your own `OSRM_URL`; see `osrm/`) |
| `MAP_GEOCODING_PROVIDER` | `geoapify` (needs `MAP_GEOCODING_API_KEY`, defaults to the routing key) or `photon` (needs your own `PHOTON_URL` / `PHOTON_REVERSE_URL`) |
| `MAP_TILE_URL` | MapLibre style the apps draw; default OpenFreeMap |

Without these the server falls back to the public OSRM and Photon servers,
which are for development only and are refused when `NODE_ENV=production`.
A fare is only ever computed from a route the provider returned: if routing
is down, pricing and booking answer 503 `MAP_SERVICE_UNAVAILABLE` and the app
offers a retry. Routes, searches and reverse lookups are cached.

**Driver GPS.** `POST /api/drivers/location` takes `latitude`, `longitude`,
`heading`, `accuracy` and `recordedAt` and answers `{ accepted, reason }`. A
fix outside the service area, older than 60 s, less accurate than 150 m,
sooner than 1 s after the last, or implying an impossible jump is ignored.
A driver is shown to riders and matched only while their last accepted fix is
newer than `DRIVER_LOCATION_MAX_AGE_SECONDS` (default 45). Accepted fixes are
pushed to the rider over `GET /api/rides/:id/stream`.

**Login codes.** `OTP_MODE=sms` (default) sends codes through the SMS provider
below. `OTP_MODE=demo` sends nothing: the code is returned to the app, which
shows it on screen. Codes are still random, single-use and expire. Demo mode
verifies nobody's phone number, so anyone who knows a rider's phone or email
can reset that rider's password; use it for a pilot only. It is on only when
set explicitly, and the server warns about it at every start.

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

**Driver money.** Each driver has a running balance derived from the
ledgers: the net fare of rides paid digitally, minus the commission on cash
rides (the driver kept the whole fare), minus payouts, plus commission they
have paid in. A driver who owes more than `DRIVER_MAX_COMMISSION_DEBT`
(default RWF 5,000) is taken offline and cannot go online until it is paid:
from the app by mobile money (`POST /api/driver/balance/settle`), or in person
and recorded by an operator. Drivers request payouts of a positive balance in
the app (`POST /api/driver/payouts`, minimum `DRIVER_MIN_PAYOUT`); an operator
approves each one:

```
curl -H "$H" "$API/payouts?status=pending"
curl -H "$H" -X POST "$API/payouts/<payoutId>/approve" \
     -H 'Content-Type: application/json' -d '{"reviewer":"operator-id"}'
     # without Paypack configured: pay by hand, then add "reference":"transfer-id"
curl -H "$H" -X POST "$API/payouts/<payoutId>/reject" \
     -H 'Content-Type: application/json' -d '{"reviewer":"operator-id","reason":"Wrong number"}'
curl -H "$H" "$API/drivers/<driverId>/balance"
curl -H "$H" -X POST "$API/drivers/<driverId>/settlements" \
     -H 'Content-Type: application/json' \
     -d '{"amount":3000,"reference":"office-receipt-id","recordedBy":"operator-id"}'
```

With Paypack configured, approval sends the money by mobile-money cash-out
(the Paypack account needs cash-out enabled and a funded balance) and the
payout completes when the `transaction:processed` webhook or the scheduler's
poll confirms it. A failed or rejected payout returns to the driver's balance.

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

**Shared rides** (`src/services/poolPlanner.js`, `driverMatcher.js`): a shared
booking takes 1 or 2 seats (the second adds 25%) and costs 70% of the private
fare whether or not anyone joins. A new shared request joins a vehicle already
carrying shared riders of the same class when there are enough free seats and
the best stop order, timed by road, delays no rider (the newcomer included) by
more than 8 minutes and reaches the newcomer within 15. Otherwise it gets its
own car and becomes a pool others can join. Each rider keeps their own PIN,
fare and payment. `GET /api/drivers/rides/stops` returns the driver's remaining
pickups and drop-offs in driving order.

**Routing** (`src/services/routing.js`) goes through OSRM. The public
`router.project-osrm.org` demo is for non-commercial use at up to 1
request/second, so production must self-host: `osrm/build-rwanda.sh` builds a
Rwanda graph from the daily Geofabrik extract (about 120 MB of RAM, a few
minutes) and `osrm/Dockerfile` bakes it into a deployable image. Point the
API at it with `OSRM_URL=http://<host>:5000/route/v1/driving`. Matching and
pickup ETAs use OSRM's table service to rank nearby cars by road time.

**Demo fleet** (`DEMO_FLEET=1`, refused in production): 32 simulated
drivers drive real Kigali roads between real places and serve rides end to
end (accept, drive to the pickup, start with the PIN, drive, complete)
through the same code paths as the driver app. `FLEET_DEBUG=1` logs each
car's decisions. Nearby cars and the assigned driver are served with the
last ~12 s of their trail so the app can animate them along the road.

**Tests** are plain scripts with different prerequisites, so each has its
own npm script (each exits non-zero on failure):

| Command | Needs |
| --- | --- |
| `npm test` | Runs `test:smoke` then `test:wallet`. |
| `npm run test:smoke` | API on `:3000` started with `DEV_REVEAL_CODES=1 DEV_AUTO_VERIFY_DRIVERS=1`; add `DEMO_PAYMENTS=1` to both the server and the test to cover demo settlement. |
| `npm run test:wallet` | Same local API as the smoke test. |
| `npm run test:money` | Same local API started with `DEMO_PAYMENTS=1` and an `ADMIN_API_KEY` (pass the same key to the test). Covers shared-ride seats, the stop plan, cash commission, commission settlement and payouts; start the API with `DRIVER_MAX_COMMISSION_DEBT=100` to also cover the going-online block. |
| `npm run test:maps` | Nothing: provider adapters, routing, geocoding and GPS validation with the provider stubbed. |
| `npm run test:otp` | A local database; starts its own server to check demo login codes. |
| `npm run test:readiness` | API on `:3000` started with the same `PAYPACK_WEBHOOK_SECRET` and `ADMIN_API_KEY` as in `server/.env`. |
| `npm run test:invariants` | Only PostgreSQL (`INV_DATABASE_URL`). Starts its own production-mode API, fake Paypack and SMS gateway, and a fresh database. Optional args: `-- <seed> <steps>`. |
| `npm run test:places` | API on `:3000` and `TYPESAFE_API_KEY`; TypeSafe's Jev judges whether place search returns the place a rider meant. |

The smoke, wallet and money tests need the seeded dev drivers online: set `SEED_DRIVER_PASSWORD` in `server/.env`, run `SEED_DEV_DATA=1 npm run seed:dev` first, and `node scripts/reset-dev-rides.js` after a crashed run (it cancels stuck rides and clears test commission debt).

## Wiring up the app

The current Expo passenger and driver clients use the service modules at the
repository root. Set `EXPO_PUBLIC_API_BASE_URL` to the deployed API URL ending
in `/api` before exporting web or building native clients.
