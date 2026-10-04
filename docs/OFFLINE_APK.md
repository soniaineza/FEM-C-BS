# Standalone (server-free) APK

The normal builds talk to the Kimu Transport API. This build does not: every API call
is answered **on the phone**, so the app installs and works with no server,
no database and no internet. Both apps (passenger and driver) are inside it.

```bash
scripts/build-offline-apk.sh        # -> fem-cabs-offline.apk
adb install -r fem-cabs-offline.apk
```

(or `eas build --profile offline --platform android` for a cloud build).
It installs as **Kimu Transport Offline** (`com.femcabs.passenger.offline`), next to
the server-backed app rather than over it.

## How it works

`EXPO_PUBLIC_OFFLINE_DEMO=1` at build time flips `services/api-client.ts` and
`services/driver-api-client.ts` from `fetch` to `services/offline/`, a
re-implementation of the Express routes the apps use, with the same URLs,
status codes and JSON shapes. Nothing above the API clients changed, so every
screen, store and hook behaves as it does against the real backend.

| File | Role |
|---|---|
| `http.ts` | route table + dispatcher (auth by bearer token, `{ error }` bodies) |
| `db.ts` | the database: one JSON document in the phone's AsyncStorage |
| `account.ts` | auth/OTP, saved places, wallet, notifications, support, SOS, place search |
| `rides.ts` | quotes, booking, tracking, cancel/rate, payments |
| `driver.ts` | driver sign-up, going online, ride requests, earnings, ratings |
| `sim.ts` | the ride timeline and the ambient cars (pure functions of the clock) |
| `geo.ts`, `pricing.ts` | routes, a Rwanda gazetteer, the server's fare formula |
| `sms.ts`, `pindo.ts` | optional SMS (below) |
| `device.ts` | phone-side bits: local notifications, save on background |

### What comes from the phone

- **GPS** (expo-location): pickup point, and the cars you see are generated
  around wherever the phone is.
- **Storage**: all accounts, rides, wallet and tickets persist across restarts.
- **Notifications**: driver-found / arrived / trip-ended alerts are scheduled
  with the OS, so they fire even if the app is closed.
- **Dialer and share sheet**: SOS opens the phone's dialer (112); "share trip"
  shares a maps link to the route.
- **SMS** (optional, needs signal): see below.

### What is simulated

There is no real fleet or gateway, so these are stand-ins, and the app labels
payments as simulated:

- **Passenger side**: after you request a ride a fictional driver is found in
  ~4 s, drives over, waits, and takes you to the destination. Trips run
  compressed (30 s–3 min) so a demo isn't a half-hour wait. Pacing lives in
  `TIMING` in `sim.ts`.
- **Driver side**: go online and a fictional rider's request arrives after ~6 s.
  Accept, arrive, enter the rider's trip code (**1234**; the wrong-code error
  says so), complete, and confirm cash. Earnings (15% commission) and ratings
  accrue like the real thing. Requests that go unanswered lapse.
- **Payments**: cash, wallet, mobile money and card all succeed locally. New
  accounts get RWF 10,000 of wallet credit; a too-small balance fails and
  offers cash, as the server does.
- **Maps and routes**: two separate things need the internet, and neither is a
  Kimu server.
  - *Map tiles* (streets, buildings) come from OpenFreeMap. Online you get the
    real Kigali map; with no internet the map falls back to a plain background
    with a faint grid (cars, routes and pins still draw). Reopen the app after
    connectivity returns to get the tiles back.
  - *Routes and traffic* follow real streets only when a routing service
    answers. The app asks an OSRM-compatible service directly from the phone: the
    public OSRM demo by default (free, no key, light non-commercial use, about one
    request a second: fine for one tester, not for a launch). Set
    `EXPO_PUBLIC_OSRM_URL` to your own OSRM, or `off` to disable. It covers the
    fare quote, the booked car's drive (its geometry is saved with the ride, so it
    survives a restart) and the ambient cars on the home map. With no service
    (offline, throttled, or no road) routes fall back to a smooth local curve and
    ambient cars circle rectangular blocks; the app says the route is estimated.
  - *Fully offline* real roads would mean bundling a road network for Rwanda and
    routing on the phone; that is not built.
  - Place search covers a built-in list of ~75 Rwandan places, not all of
    OpenStreetMap.
- **Support**: tickets are saved on the phone; nobody replies (the app says so).
- **Payouts**: the list is empty; there is no payout rail.

Passenger and driver accounts live in the same on-device database but don't see
each other's rides: a passenger's ride is driven by a simulated driver, and a
driver's requests come from simulated riders.

## SMS through Pindo or Twilio (optional, off by default)

**The default build sends no SMS.** OTP codes appear on screen ("Demo OTP
code") and ride updates show in the app's notifications, so nothing outside the
phone is involved and no credentials are compiled in. Twilio proved unusable for
Rwandan numbers from the owner's location (and its trial only texts verified
numbers); Pindo has not been tried. The rest of this section only matters if you
later add a provider.

Two providers are supported; configure either or both (see `.env.example`).

- **Pindo** (`EXPO_PUBLIC_PINDO_TOKEN`): a Rwandan gateway, about $0.01 per SMS to
  Rwanda, the same call the server's `otpSender.js` makes
  (`POST https://api.pindo.io/v1/sms/`).
- **Twilio** (`EXPO_PUBLIC_TWILIO_*`): about $0.33 per SMS to Rwanda, but a free
  trial exists. **OTP codes go through Twilio Verify**: Twilio generates, texts
  and checks the code, so the app never holds it and a correct entry is real
  proof of phone ownership (checking needs internet). Ride and SOS texts use the
  Messages API when `EXPO_PUBLIC_TWILIO_FROM` is set. If Verify can't send (no
  signal, an unverified trial number) the app issues its own code and shows it
  on screen. With both providers set, `EXPO_PUBLIC_SMS_PROVIDER` picks the
  sender for ride/SOS texts (default Pindo); Verify still handles OTP.

What is texted:

| Event | Text | Recipient |
|---|---|---|
| `otp` | sign-up and password-reset codes (Twilio Verify, or an app-issued code via the sender) | the account's phone |
| `ride` | "driver is on the way + trip PIN", "trip completed + fare" | the passenger |
| `sos` | alert with a map link | the person's emergency contact |

Choose events with `EXPO_PUBLIC_PINDO_SMS_EVENTS` (default `otp,sos,ride`) and
the sender name with `EXPO_PUBLIC_PINDO_SENDER` (must be registered with Pindo).

If a text can't be sent (no signal, bad token, rate cap) the app falls back to
showing the code on screen, so sign-up never gets stuck. When a text *is*
delivered the code is not also shown; "Resend" shows it as the fallback. At
most 30 texts per hour are sent from one install.

> **Security: the credentials are inside the APK.** `EXPO_PUBLIC_*` values are
> compiled into the app and can be pulled out by anyone who has the file,
> letting them send SMS on your account. For builds you hand out: use a
> dedicated Pindo token with a small balance; for Twilio use a *Restricted* API
> key and keep the account on **trial** (a trial account can only text numbers
> you verified, which caps what a stolen key can do; a funded account at $0.33
> per SMS is expensive to lose). Keep them in the untracked `.env`, and rotate
> them afterwards. A public release should send SMS from a server instead,
> which is what the regular backend does.

## Limits worth knowing

- Data lives only on the phone: uninstalling or clearing app data deletes it,
  and two phones share nothing.
- Passwords are stored as salted hashes on the device, not with bcrypt; that is
  fine for a local store and not a substitute for a real backend.
- It is a demo/standalone build. Real dispatch, real payments, real push and
  real routing need the server.

## Tests

`npm run test:offline` compiles the backend and runs 39 scenarios with a fake
clock (sign-up and OTP, a whole ride to receipt, wallet/cash/mobile-money,
cancel/reschedule, a driver's shift, persistence, and every SMS path).
