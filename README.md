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
