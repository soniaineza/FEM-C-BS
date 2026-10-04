# Location and production correctness review — 2026-10-02

Repair status: the 19 findings below are the original audit evidence. Their code repairs are implemented in the current working tree after merging main through `2f092c0` (merge `2e477ae`). Existing unrelated local changes and the pre-pull backup stash were preserved. This report distinguishes code repair from native/device and live-provider validation.

The location complaint had concrete causes: a provisional last-known fix could suppress fresh acquisition, and stale/coarse fixes could become a current pickup. GPS permission alone still does not guarantee a precise fix. The repaired policy accepts measurements at most 30 seconds old with known accuracy at most 100 metres; a provisional seed moves the camera only. If that policy cannot be met, the user can choose a manual map pin.

Scope: Expo 57 passenger and driver location/permission flows, map picker/rendering, tracking, Express authentication, dispatch, ride lifecycle, pricing, payments, wallet settlement, schema, and test configuration. Native background behavior and real SMS, Paypack, routing/geocoding and SOS delivery remain outside the local proof.

## Repair coverage

| Finding | Implemented repair |
| --- | --- |
| 1 | Camera-only seed, fresh GPS refinement, metadata retained. |
| 2 | Permission/services checked before cache, bounded removable acquisition, stale/coarse/unknown fixes rejected. |
| 3 | Global Expo TaskManager task, background permissions and native foreground service configuration; native rebuild/device checks still required. |
| 4 | Passenger samples tied to a pre-pickup ride, expire by measurement time, hidden after pickup. |
| 5 | Driver row lock, eligibility recheck, capacity/phase check, atomic assignment and lifecycle transition. |
| 6 | Passenger lock, unique live-ride constraint, booking idempotency and replay-body checks. |
| 7 | Wallet debit, ledger, payment, receipt, ride completion and earnings share one transaction. |
| 8 | Atomic trip preparation, completion replay, unstarted/uncertain payment reconciliation using the original provider key. |
| 9 | Phone changes revoke verification and prior OTPs under the account lock; active rides block changes; client returns to verification. |
| 10 | Late subscription removal, bounded heartbeat, serial/coalesced reports, measurement timestamps retained and monotonic server writes. |
| 11 | Explicit Locate forces acquisition. |
| 12 | Immediate search/reverse/GPS intent invalidation, movement blocks confirmation, late results ignored. |
| 13 | Padding participates in scene/camera updates; reported coordinates use the visible pin pixel; resizing preserves the selected point. |
| 14 | Route generations keyed by ride, phase and endpoints; stale routes/ETAs suppressed immediately. |
| 15 | Finite/range validation, zero-coordinate support, nonempty query validation, malformed route/search results rejected. |
| 16 | Promotion claim and booking transaction share row locks and rollback; cap regression tested concurrently. |
| 17 | Atomic OTP redemption and protected mutation, serialized resend cooldown, password limits, session revocation, IP plus identity throttles. |
| 18 | Response deadline includes body parsing; failed polling expires displayed cars; caches bounded and cleared on logout. |
| 19 | Runnable Bun regression scripts and a real ESLint gate including React hook rules. |

Further review repaired cash confirmation replay and consistent settlement lock order, dispatch crash windows, ownership races in driver actions, PIN attempt rollback, scheduler timeout races/overlapping sweeps, fractional top-up/provider amount mismatches, uncertain top-up recovery, and Safety/Call/Message availability before accepting a driver offer.

## Validation and release limits

- Client regression suite: 8 passing checks covering seed/refinement, GPS quality/revocation, late subscription cleanup, report ordering/coalescing, coordinates and response parsing/deadlines.
- PostgreSQL regression suite: 19 passing checks including real concurrency, injected rollback failures, payment replay, promotions, OTPs, profile verification, session revocation, PIN limits and provider/currency matching.
- Production-mode randomized invariant suite: seeds 3, 4 and 5 each passed 120 steps with zero violations (360 steps total). Seed 5 includes the final settlement lock-order and cash replay changes. These use real PostgreSQL and contract-faithful local fake Paypack/SMS services.
- TypeScript, ESLint, offline tests, locale tests and Expo web export passed. All 12 browser tests passed against the final exported web bundle and isolated API: authentication, full booking/trip/cash/rating flow, cancellation, SOS, driver calls/messages, account screens, nearby-driver map and saved places.
- Expo background tracking requires a new native development/release build and Android/iOS background permission. Test stationary reporting, screen lock, navigation app switching, revoked permission, logout, process termination and OS battery restrictions on devices. A successful web build does not prove these behaviors. See [Expo 57 Location](https://docs.expo.dev/versions/v57.0.0/sdk/location/) and [TaskManager](https://docs.expo.dev/versions/v57.0.0/sdk/task-manager/).
- Verify real provider approval, webhook retry, uncertain-charge replay, SMS delivery, routing capacity and SOS dispatch in staging. Paypack matching checks follow its documented [transaction reference, kind and amount](https://docs.paypack.rw/quickstart/api-reference); request retries preserve the stored idempotency key.
- Production clients must send numeric `measuredAt` (epoch milliseconds) and `accuracy` (metres). Legacy development-only reports are accepted for CLI/demo compatibility; production rejects missing metadata.
- Schema application now rolls back as a unit. Before applying it to an existing database, reconcile duplicate live passenger rides and duplicate wallet ride debits. New unique constraints intentionally fail on conflicting historical rows instead of deleting them. Historical location rows with no measurement timestamp are stale until a fresh report arrives.

Migration preflight (read-only):

```sql
SELECT passenger_id, array_agg(id), count(*)
FROM rides WHERE status NOT IN ('completed','cancelled')
GROUP BY passenger_id HAVING count(*) > 1;
SELECT reference, array_agg(id), count(*)
FROM wallet_transactions WHERE source='ride_payment' AND type='debit'
GROUP BY reference HAVING count(*) > 1;
```

Reproduce local checks with `bun run test:regression`, `bun run typecheck`, `bun run lint`, `bun run test:offline`, `bun run test:i18n`, `bun run build`; run `TEST_DATABASE_URL=<isolated PostgreSQL administrator URL> bun run server/test/regression.cjs` for database checks and `INV_DATABASE_URL=<isolated PostgreSQL administrator URL> bun run server/test/invariants.js 4 120` for the production contract stress suite. Browser tests require a local API/database and exported bundle configured with its API URL; see `playwright.config.ts`.

## Original audit evidence

P1 means a defect that can materially break dispatch, payments, privacy, or reliable pickup/tracking. P2 means a narrower correctness, recovery, security, or verification defect. Numbered findings below are distinct repair areas; source inspection findings need regression tests before a fix can be considered verified.

## Research used to guide the review

- [Expo 57 reference](https://docs.expo.dev/versions/v57.0.0/) and [Expo 57 Location](https://docs.expo.dev/versions/v57.0.0/sdk/location/): last-known fixes can be stale; the API supports both `maxAge` and `requiredAccuracy`; `watchPositionAsync` updates only in the foreground. Checked cache freshness, accuracy validation, watcher cleanup, and background expectations.
- [Android runtime location permissions](https://developer.android.com/develop/sensors-and-location/location/permissions/runtime): approval can grant approximate access even when fine location is requested. Checked the difference between permission granted and precise location available.
- [React useEffect](https://react.dev/reference/react/useEffect): asynchronous results can arrive out of order and effects must clean up subscriptions. Checked location initialization, reverse-geocoding generations, route generations, and polling lifecycles.
- [PostgreSQL locking](https://www.postgresql.org/docs/current/explicit-locking.html): concurrent operations need atomic claims or appropriate transactions/locks. Checked booking, driver assignment, OTP redemption, wallet debits, and promotion consumption.
- [Express production security guidance](https://expressjs.com/en/advanced/best-practice-security/): checked input validation, authentication controls, rate limiting, and production configuration.

## Findings

### 1. P1 — Last-known pickup prevents fresh GPS refinement

Evidence: `services/location-service.ts:64`, `:97`, `:147`; `app/(main)/(tabs)/index.tsx:84`, `:99`, `:116`.

`getSeedPlace()` calls `cachePlace()`. A seed accurate to 100 m or better receives a new five-minute cache window, regardless of its measurement timestamp. The next `getCurrentPlace()` therefore returns the seed instead of requesting a current position. Independently, `apply(seed)` updates the pickup store; `pickup` is an effect dependency, so cleanup can set `cancelled` before the refinement result applies. A coarse seed avoids the cache but can still trigger this second problem.

Reproduced the service path with a 90-second-old, 20 m seed: zero calls to `getCurrentPositionAsync`. This explains an old pickup remaining after the user approves permission.

Repair: use the seed only as a provisional camera position; separate it from the authoritative pickup/cache, force a fresh read, and cancel based on screen lifecycle or deliberate user selection rather than the flow's own provisional update.

### 2. P1 — Arbitrarily old fallback and inaccurate fixes become “Current location”

Evidence: `services/location-service.ts:112`, `:133`, `:142`, `:147`; `types/place.ts:1`.

The first successful acquisition is accepted without checking measurement age or uncertainty. Accuracy is progressively lowered to `Lowest`; after failures, an unbounded `getLastKnownPositionAsync()` is accepted. `cachePlace()` drops timestamp and accuracy and labels the point current. Null accuracy is treated as good. `force: true` skips the cache but still permits the ancient fallback. The five-minute cache is checked before services or permission, so cached service calls can also succeed after revocation.

Reproduced a 24-hour-old fallback and a fix with 3,000 m uncertainty; both returned `isCurrentLocation: true` without accuracy metadata. Android approximate permission is an additional plausible contributor, not proof of which permission an affected user selected.

Repair: carry measurement timestamp, accuracy, and source; enforce a documented pickup quality policy; display uncertainty and offer manual pin confirmation. Reject stale/unknown/coarse fixes as authoritative GPS pickup. Permission approval must not imply precision.

### 3. P1 — Driver tracking stops when the app is backgrounded

Evidence: `hooks/useDriverLocationReporting.ts:46`, `:62`; `app.json`; `server/src/services/driverKyc.js:5`; `server/src/services/scheduler.js:118`.

Driver reporting uses only `watchPositionAsync`; the heartbeat explicitly skips inactive app state. There is no background location task/service in this implementation. Screen lock or switching to navigation stops expected continuous updates; location expires against the 45-second backend freshness policy. Active drivers can disappear from matching, and busy-driver tracking becomes unavailable.

Repair: explicitly define the driver background contract and implement the supported Expo background task and platform permissions/service configuration, then test a release build on Android and iOS. Foreground-only availability must be clearly represented until that works. Native behavior was not exercised in this review.

### 4. P1 — Rider locations are exposed after pickup and without freshness filtering

Evidence: `server/src/services/rideDriverOps.js:33`, `:59`; `server/src/utils/serialize.js:112`.

Both active-ride queries join `passenger_locations` without restricting its age or ride phase. Their status set includes `inProgress` and `paymentPending`. The serializer emits any joined coordinates regardless of phase. A previous ride's retained location can also appear on a later assignment before a new passenger update arrives.

Reproduced serializer output containing rider coordinates for an `inProgress` ride. Driver query predicates are source-confirmed; no live database request was made.

Repair: restrict the join to pre-pickup phases, require recent measurement time, and tie reporting to the active ride/consent. Return null on stale or unavailable data.

### 5. P1 — Two private rides can claim the same free driver

Evidence: `server/src/services/driverMatcher.js:194`, `:230`.

Assignment updates the ride before attempting `active → busy` on the driver. The driver update's affected-row count is ignored. Two matchers that selected the same free driver can both attach their private rides, even though only one claim succeeds. Same-ride assignments also remain possible while status is `searchingDriver`, because attachment and transition are separate.

Reproduced against a controlled database mock: both assignment calls returned success although only one driver status update affected a row. Real PostgreSQL concurrency still needs validation.

Repair: claim/lock the driver and ride in one transaction; fail or retry on a lost claim; enforce private versus pooled capacity rules atomically.

### 6. P1 — Duplicate booking guard is not atomic

Evidence: `server/src/services/rideService.js:101`, `:137`; `server/src/schema.sql`.

The active-ride SELECT and ride INSERT are separate operations, with pricing awaited between them. Two concurrent requests can both observe no active ride and insert bookings. The schema has no unique constraint enforcing one nonterminal ride per passenger. Preventing automatic POST retries in the client does not prevent double taps, two sessions, or manual retries.

Repair: passenger-level locking plus an appropriate partial unique index and booking idempotency key. Include scheduled rides in the intended invariant and handle conflicts as a recoverable API response.

### 7. P1 — Wallet debit can commit without settling the ride

Evidence: `server/src/services/payments.js:46`, `:85`, `:100`, `:236`.

The wallet debit and debit ledger entry commit in one transaction; payment/receipt/ride settlement happens in another. A process crash or settlement failure between them leaves money removed while payment is pending. The reconciler handles Paypack only, and the debit ledger reference is not unique. A retry through the charging function is not a safe recovery boundary.

Repair: commit wallet debit, unique payment debit claim, payment settlement, receipt, and earnings together, or introduce a durable recoverable operation with enforced debit idempotency. Test a forced crash between the current boundaries.

### 8. P1 — Trip completion can leave an unrecoverable intermediate state

Evidence: `server/src/services/rideDriverOps.js:206`; `server/src/services/rideStateMachine.js:60`; `server/src/routes/payments.routes.js:69`.

Completion separately writes final fare, transitions to `arrived`, transitions to `paymentPending`, inserts a payment, and charges it. A failure after `arrived` leaves the ride excluded from driver active-ride queries. A failure after inserting the payment but before initiating the charge leaves a pending unstarted payment; the passenger payment endpoint returns an existing payment without starting it. Repeating the driver's complete action fails its `inProgress` prerequisite. Normal state transitions also write status, history, and event in separate commits unless passed an explicit transaction.

Repair: make the database portion transactional and make charge initiation a durable, idempotent resumable operation. Add recovery for existing intermediate states.

### 9. P1 — Changing phone number preserves verification of the old number

Evidence: `server/src/routes/auth.routes.js:270`, `:290`; `server/src/middleware/auth.js:33`; `server/src/services/payments.js:78`.

A verified passenger can update `phone` without clearing `verified_at` or proving ownership of the new number. Verified API access continues, and mobile-money charging reads the changed phone. Phone verification therefore stops representing the number actually used by payments and OTP delivery.

Repair: verify a pending new phone before adopting it, or invalidate verification and restrict sensitive operations until the new number is confirmed. Normalize phone identifiers consistently.

### 10. P2 — Location subscriptions can leak; reporting can overlap and reorder

Evidence: `hooks/usePassengerLocationReporting.ts:27`; `hooks/useDriverLocationReporting.ts:45`, `:46`, `:62`; `server/src/services/rideDriverOps.js:72`; `server/src/routes/rides.routes.js:50`.

Cleanup can run before `watchPositionAsync` resolves; its eventual subscription is assigned after cleanup and never removed. Reproduced this in the actual passenger hook with a deferred watcher promise. The driver hook has the same pattern. Passenger setup also lacks a rejection handler. The driver's initial GPS read is unbounded, watcher installation waits for a successful first upload, and async heartbeats have no in-flight guard. Watcher and heartbeat uploads can overlap.

Neither report includes measurement timestamp/accuracy; servers label arrival time as `recorded_at`. Delayed/out-of-order fixes can replace newer points and appear fresh. Assignment additionally refreshes `recorded_at` from cached driver coordinates.

Repair: keep each subscription owned by its effect; remove it immediately if setup resolves after cancellation; catch setup failures; serialize/coalesce reports; bound acquisition; enforce measurement time and monotonic sample ordering on the server.

### 11. P2 — Locate button in the pin picker reuses the same five-minute cache

Evidence: `components/PlacePicker.tsx:123`, `:134`, `:322`.

The home recenter uses `force: true`, but the picker's explicit locate action does not. Tapping locate because the pin is wrong can simply move back to the same cached point.

Repair: require a fresh measurement on explicit locate and keep manual changes protected from late automatic results.

### 12. P2 — A previous reverse lookup can overwrite the latest pin

Evidence: `components/PlacePicker.tsx:88`, `:103`, `:178`, `:230`.

Lookup generations increment when the debounced lookup begins, rather than when the pin changes. During the 350 ms debounce window an earlier request is still considered current and can overwrite the new candidate with old coordinates. `resolving` is also not set until the timer fires, leaving Confirm temporarily enabled. Choosing a search result does not invalidate an already-running reverse lookup.

Repair: invalidate generations immediately on every candidate change; disable confirmation until the candidate belongs to the latest settled camera position; cancel pending work when choosing a result or leaving the picker. Apply the same immediate invalidation to search results when query text is cleared or changed.

### 13. P2 — Map padding changes do not reliably move the camera under the visible pin

Evidence: `components/PlacePicker.tsx:203`, `:223`, `:256`; `components/map/MapEngine.tsx:648`.

The visible pin position is recalculated from header and sheet heights, but scene memoization tracks only the boolean `measured`, not those heights. The engine's camera change key also omits padding. Showing search results, changing sheet height, or resizing can move the visible pin without reapplying camera padding; coordinates reported by map center can then differ from the point visually under the pin.

Repair: include actual padding/dimensions in scene and camera synchronization, or derive the candidate using `unproject()` at the visible pin tip. Verify on narrow phones and during keyboard/search layout changes.

### 14. P2 — Route replanning can retain a previous ride or destination

Evidence: `hooks/useTripMap.ts:40`, `:55`, `:59`, `:69`.

Route state is tagged with phase only. A new ride in the same phase can pass the nonstale check and reuse the prior route; changed destination coordinates are omitted from effect dependencies. Outstanding planning has no cleanup/generation guard, and a shared `planning` flag can suppress the replacement request when phase changes.

Repair: key routes by ride, phase, and endpoints; invalidate on destination change; ignore old generations and schedule the latest requested plan after a pending request finishes.

### 15. P2 — Coordinate validation admits invalid numbers; zero is rejected elsewhere

Evidence: `types/place.ts:9`; `services/location-service.ts:200`; `services/ride-service.ts:32`; `server/src/services/rideService.js:89`; `server/src/services/rideDriverOps.js:73`; `server/src/routes/locations.routes.js:148`, `:224`.

Several checks use only `typeof === 'number'`, accepting nonfinite internal values and out-of-range latitude/longitude. Query parsing accepts blank values as zero. Client route/distance checks use truthiness and reject valid zero coordinates. No consistent service-area boundary is enforced at booking.

Repair: one shared finite/range policy per layer, explicit required query presence, and a separate documented service-area rule. Validate heading and provider route/geocoder responses too.

### 16. P2 — Promotion limit and consumption can race or survive failed booking

Evidence: `server/src/services/rideService.js:46`, `:66`, `:137`.

Promotion eligibility is read separately from an unconditional increment. Concurrent requests can exceed `max_uses`. Consumption commits before the ride INSERT, so later booking failure consumes a use without a ride.

Repair: conditionally claim usage within the booking transaction and record a redemption identity with the intended per-passenger policy.

### 17. P2 — OTP redemption is not single-use under concurrency; reset does not revoke sessions

Evidence: `server/src/utils/otp.js:44`, `:70`; `server/src/routes/auth.routes.js:210`, `:240`; `server/src/utils/jwt.js`; `server/src/routes/auth.routes.js:43`, `:56`.

OTP verification reads an unused code and returns a later unconditional `processCode()` callback. Two requests can both verify the same code before either marks it used; concurrent mismatches can also exceed the intended attempt budget. Password reset changes the hash without revoking existing JWTs, whose default lifetime is 30 days. Reset also lacks the signup minimum-password check. Identity-binding middleware runs after the limiter and sets a key only for email, so the claimed per-identity protection is not actually applied there.

Repair: atomically consume/check attempts in the same transaction as the protected account mutation; enforce password policy; revoke sessions on reset; configure account and IP limits deliberately, with distributed storage if needed.

### 18. P2 — Network deadline ends before response body is read

Evidence: `services/api-client.ts:75`, `:89`, `:109`; `services/driver-api-client.ts:74`, `:88`.

The timeout is cleared as soon as `fetch()` returns response headers, then `safeJson()` reads the body outside the deadline. A stalled body can keep requests and dependent reporting/polling pending indefinitely. Invalid JSON on a successful response becomes `{}` and is trusted as the requested type. Nearby/tracking state retained on network failure has no local expiry, so previously displayed cars can remain after the backend is unreachable.

Repair: apply the deadline through body parsing, validate expected response shape, and expire visual live state based on measurement freshness.

### 19. P2 — Verification commands cannot establish backend readiness

Evidence: `server/package.json:15`; root `package.json:64`; `server/test/*.js`.

`bun run test` in `server/` executes `node --test test/` and failed here with `MODULE_NOT_FOUND` for the directory; it ran no actual backend assertions. The files are standalone integration/stress scripts, with specific database, API, and provider-fixture requirements. Merely fixing discovery would not provision these dependencies. Root lint swallows all errors with a success-producing fallback and no eslint configuration was found, so it is not a trustworthy release gate.

Repair: expose explicit test commands and isolated fixtures for each integration suite; make lint fail on actual errors and document its prerequisite configuration.

## Controls present in the inspected code

The shared location permission flow prevents competing prompts and offers manual pickup. Android config declares coarse and fine permissions. Passenger APIs check verification; driver routes check role and assigned ride ownership. Ride PIN output is passenger-only and PIN attempts use a guarded increment. Client retries are restricted to GET. Production configuration rejects demo switches and requires operational dependencies. Paypack webhook signatures use the raw body. Provider settlement and wallet top-up credit use guarded transactional updates, which substantially reduce duplicate-settlement risk. These inspected controls do not resolve the separate defects above or constitute live-provider proof.

## Original review validation performed

| Check | Result and limit |
| --- | --- |
| `bun run typecheck` | Passed |
| `bun run test:offline` | Passed both test files; exercises the on-device backend, not Express/PostgreSQL |
| `bun run test:i18n` | Passed both test files |
| `bun run build` | Passed Expo web export; native permissions/background/WebView behavior not proved |
| `git diff --check` | Passed for the current tracked changes |
| `bun run docs/review-repro.cjs` | Six controlled assertions passed, confirming existing defects; database assignment uses a mock |
| `bun run test` in `server/` | Failed before backend tests ran: directory module resolution |
| Local API/web availability | Neither `127.0.0.1:3000/api/health` nor `127.0.0.1:8081` was available |
| Real database, browser booking E2E, Paypack/SMS/SOS | Not exercised; no test API/database was provisioned for this review |
| Native device GPS, approximate permission, screen lock/background | Not exercised; requires development/release devices |

The reproduction harness is a review artifact. Its passing assertions mean the defective behavior was reproduced, not that the app passed regression tests.

## Repair and acceptance order

1. Repair seed/refinement ownership and fix quality metadata first. Verify precise, approximate, stale seed, GPS disabled, no fix, Settings return, user drag during acquisition, and explicit recenter on physical Android/iOS devices.
2. Fix rider visibility and driver tracking lifecycle. Verify no rider coordinates after pickup or expiry, no orphan watches, no sample reordering, and lock-screen/navigation behavior for at least several minutes.
3. Repair atomic booking and dispatch. With real PostgreSQL, race two passenger requests and multiple private-driver claims; verify one booking/claim, accurate history, and pool capacity under contention.
4. Repair wallet/ride recovery boundaries, phone re-verification, and OTP/session behavior. Inject failures between writes and replay callbacks; verify exact balances, one receipt/earning, recoverable pending charges, and invalidated sessions after reset.
5. Fix pin/camera/route generations and real verification commands. Run browser E2E against isolated fixtures, then native tests and contracted geocoder/routing/payment/SMS/SOS staging checks. Preserve the distinction between mock, local, staging, and production evidence.
