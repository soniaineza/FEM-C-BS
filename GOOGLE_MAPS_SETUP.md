# Google Maps setup (FEM c@bs)

The app currently ships with **keyless maps** (Leaflet + OpenStreetMap tiles in
`components/RideMap.native.tsx` / `RideMap.tsx`). `react-native-maps` is
installed and wired for config (`app.config.js`), so switching to Google Maps
later only needs a key — no code rewrite. Follow this doc exactly; **never
ship one unrestricted key everywhere**.

## 1. Create the Google Cloud project

1. Go to https://console.cloud.google.com/ and create a project (e.g. `femcabs-prod`).
2. Enable **billing** on the project (required for Maps; free tier still applies).

## 2. Enable the APIs you actually use

Enable only what the app needs:

- **Maps SDK for Android** — required for `react-native-maps` on Android.
- **Maps SDK for iOS** — required if you ship iOS.
- **Places API** — only if you replace the current backend geocoding proxy
  (`/api/locations/search`) with direct Google Places calls. The backend
  currently proxies geocoding/routing (Nominatim/OSRM), so this is optional.
- **Directions API / Routes API** — only if you move routing client-side.
  Routing currently goes through the backend (`/api/locations/route`).

## 3. Create separate, restricted keys

Create **two** keys under *APIs & Services → Credentials*:

### Android key
- Application restrictions → **Android apps**
- Add your package name **and** SHA-1 fingerprint:
  - Package: `com.femcabs.passenger` (see `app.json` → `android.package`)
  - SHA-1: `keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android` (debug), or your release keystore's SHA-1
- API restrictions → restrict to **Maps SDK for Android**

### iOS key
- Application restrictions → **iOS apps**
- Bundle identifier: `com.femcabs.passenger`
- API restrictions → restrict to **Maps SDK for iOS**

## 4. Wire the keys into the app (never in source)

`app.config.js` reads them from environment variables at build time:

- `GOOGLE_MAPS_ANDROID_API_KEY`
- `GOOGLE_MAPS_IOS_API_KEY`

Set them in `eas.json` per-profile (`env` block) or as EAS secrets:

```bash
eas secret:create --name GOOGLE_MAPS_ANDROID_API_KEY --value "AIza..."
```

Never commit keys. `.env` is git-ignored; `eas.json` with literal keys must
not be committed either.

## 5. Verify

1. `npx expo prebuild --platform android` then check
   `android/app/src/main/AndroidManifest.xml` contains
   `com.google.android.geo.API_KEY` with your key.
2. Build and run — the map should render tiles (not a blank grid).
3. If tiles fail, check: key restrictions (SHA-1 mismatch is the #1 cause),
   billing enabled, and the right SDK enabled for the platform.

## 6. Status quo (what the app uses today)

| Concern | Today | Google Maps migration |
| --- | --- | --- |
| Map display | Leaflet in WebView (keyless OSM tiles) | `react-native-maps` (installed, config wired) |
| Place search | Backend proxy → Photon (`/api/locations/search`) | Optional: Places API (new key restriction) |
| Reverse geocode | Backend proxy (`/api/locations/reverse`) | Optional: Geocoding API |
| Routing | Backend proxy → OSRM (`/api/locations/route`) | Optional: Directions/Routes API |

The map-in-a-frame UX (`FEMMapCard`) stays identical either way — only the
rendering component under it changes.
