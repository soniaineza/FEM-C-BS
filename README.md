# Kimu Transport

Ride-hailing for Kigali: two Expo (React Native) apps, one for riders and one
for drivers, and a Node.js + Express + PostgreSQL API in `server/`.

## Layout

| Path | What it is |
| --- | --- |
| `apps/passenger/` | Rider app "Kimu Transport" (`com.femcabs.passenger`, scheme `femcabs`). Screens in `app/`: `(auth)`, `profile-setup`, `(main)` |
| `apps/driver/` | Driver app "Kimu Drive" (`com.femcabs.driver`, scheme `kimudrive`). Screens in `app/`: `(driver-auth)`, `driver-profile-setup`, `(driver)` |
| `packages/shared/` | `@kimu/shared`: code both apps use (HTTP client, maps, UI components, translations, types, Tailwind theme) |
| `server/` | The API — see `server/README.md` for setup, production settings and operator commands |
| `admin/` | Static admin page (driver approvals, payment exceptions, SOS queue) |
| `tests/e2e/` | Playwright tests of the web builds |

The apps share no runtime state: each has its own sign-in, stored session and
API client. Each app registers its client with `setAppApiClient()` in its root
`app/_layout.tsx` so shared modules (map lookups, support contacts) use it.

## Run it locally

1. API: follow `server/README.md` (PostgreSQL, `server/.env`, `npm install`, `npm start`).
2. Apps: copy `apps/passenger/.env.example` and `apps/driver/.env.example` to
   `.env` in the same folders, then from the repository root

   ```
   npm install            # installs all workspaces
   npm run passenger      # rider app (Expo dev server)
   npm run driver         # driver app (Expo dev server)
   ```

   Or work inside one app folder: `cd apps/driver && npx expo start --android`.

`EXPO_PUBLIC_API_BASE_URL` (in each app's `.env`) must point at the API, ending in `/api`.

The web build served by the API (`npm run build`, used by `render.yaml`) is the
rider app.

## Build the apps

### APKs on this machine (no EAS)

```
bash scripts/build-apks.sh            # both apps; or: bash scripts/build-apks.sh driver
```

Before each release raise `expo.android.versionCode` in the app's `app.json`
(phones refuse to install a lower code over a higher one; the rider app's
earlier EAS builds reached code 12, so it now starts at 21).

Needs the Android SDK and JDK 17. It writes `build/apk/kimu-<app>-<abi>-release.apk`:
`arm64-v8a` for phones from about 2016 on, `armeabi-v7a` for older ones, and a
larger `universal` APK that installs on any phone. Release builds are shrunk
(R8, resource shrinking, compressed JS bundle; see `expo-build-properties` in
each `app.json`).

### With EAS

Each app is its own EAS project. From the app's folder:

```
cd apps/passenger && eas build -p android --profile preview
cd apps/driver && eas init        # once: creates the driver app's EAS project
cd apps/driver && eas build -p android --profile preview
```

## Host the admin page on Vercel

Create a Vercel project from this repository and set its **Root Directory** to
`admin` and **Framework Preset** to **Other**. No build command or output
directory is needed. The static operator page is in `admin/index.html`;
`admin/vercel.json` proxies its `/api/admin/*` requests to the existing
Render API at `https://fem-cabs-api.onrender.com`. The API and database remain
on Render.

The operator queue refreshes automatically every 15 seconds while its browser
tab is visible. New driver applications, unresolved Paypack/cash exceptions,
and passenger or driver SOS events are loaded from the API database; they are
not sample records.

Driver KYC documents and profile/vehicle photos are uploaded as private files
(PDF or supported image, maximum 8 MB each) and stored in the API database.
Only the uploading driver and authenticated operators can retrieve them.
Operators must review the actual files and verify the originals in person;
document references alone cannot satisfy driver approval.
The operator approval queue also has a per-driver **Delete application**
action. It permanently removes the pending applicant's personal profile and
uploaded documents and frees the phone number for a fresh registration.
Financial and trip records are retained; applications with an active trip or
unsettled driver balance cannot be removed.

Before using the Vercel URL, set `ADMIN_USERNAME` and a strong
`ADMIN_PASSWORD` (at least 12 characters) in the Render service's environment
and redeploy the API. Do not put operator credentials in Vercel or in this
repository. The existing `/admin` page on the API (also served at `/operator`) remains available.

Push notifications and driver background location need native code, so they
do not work in Expo Go or on web: build the apps with EAS (see above) and
install those builds.

## Checks

```
npm run typecheck      # TypeScript, both apps
npm run test:i18n      # every locale has every key and placeholder
npm run test:e2e       # browser tests; needs the API and both apps' web servers (see playwright.config.ts)
cd server && npm test  # API tests; see the table in server/README.md
```

`FUNCTIONALITY_COMPLETION_PLAN.md` tracks what still has to be proven on real
phones and with real providers before launch.
