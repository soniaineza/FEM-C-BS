# Kimu Transport

Ride-hailing for Kigali: one Expo (React Native) app containing the rider and
driver experiences, and a Node.js + Express + PostgreSQL API in `server/`.

## Layout

| Path | What it is |
| --- | --- |
| `app/` | Screens (expo-router): `(auth)` and `(main)` for riders, `(driver-auth)` and `(driver)` for drivers |
| `components/`, `hooks/`, `stores/`, `services/`, `utils/` | Shared UI, state and API clients |
| `locales/` | English, French and Kinyarwanda strings |
| `server/` | The API — see `server/README.md` for setup, production settings and operator commands |
| `tests/e2e/` | Playwright tests of the web build |

## Run it locally

1. API: follow `server/README.md` (PostgreSQL, `server/.env`, `npm install`, `npm start`).
2. App: copy `.env.example` to `.env`, then

   ```
   npm install
   npm run web        # or: npm run android
   ```

`EXPO_PUBLIC_API_BASE_URL` (in `.env`) must point at the API, ending in `/api`.

## Host the operator page on Vercel

Create a Vercel project from this repository and set its **Root Directory** to
`operator` and **Framework Preset** to **Other**. No build command or output
directory is needed. The static operator page is in `operator/index.html`;
`operator/vercel.json` proxies its `/api/admin/*` requests to the existing
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

Before using the Vercel URL, set `ADMIN_USERNAME` and a strong
`ADMIN_PASSWORD` (at least 12 characters) in the Render service's environment
and redeploy the API. Do not put operator credentials in Vercel or in this
repository. The existing `/operator` page on the API remains available.

Push notifications and driver background location need native code, so they
do not work in Expo Go or on web: build the app with EAS (`eas build -p android
--profile preview`) and install that build.

## Checks

```
npm run typecheck      # TypeScript
npm run test:i18n      # every locale has every key and placeholder
npx playwright test    # browser tests; needs the API and web server running (see playwright.config.ts)
cd server && npm test  # API tests; see the table in server/README.md
```

`FUNCTIONALITY_COMPLETION_PLAN.md` tracks what still has to be proven on real
phones and with real providers before launch.
