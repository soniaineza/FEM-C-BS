# Kimu Transport functionality completion plan

Updated: 2026-09-29. This is a work plan and acceptance checklist, not a claim that every screen has passed on a physical phone. Check a box only after the named behavior has been observed and its evidence recorded in a PR or release note.

## Latest local evidence

- The isolated local API and PostgreSQL test stack passed all 10 existing Playwright tests. After the screen changes, the focused driver account, map-focused Home, and geocoded saved-place tests passed (3/3). These are browser checks, not Android or provider checks.
- TypeScript and translation checks passed. A rendered web heading resolved to `Poppins_700Bold`; Inter remains the body and control font.
- Jev selected the compact persistent map booking panel, inline errors with retry, geocoded saved places, and Inter body text with Poppins major headings. The review questions and redacted product state are in `tests/jev/screen-design-decisions.mjs`; the API key stays outside the repository.
- Expo's universal Tailwind guidance supports NativeWind for Android and web. The app already uses NativeWind, so the current visual work extends its shared type tokens instead of adding a second UI system. Reassess components only after testing actual short-phone screens.

## Product target

Riders open directly onto a live, map-focused Home screen, see nearby available drivers, and can book a ride without hunting through menus. Drivers can register, become verified, accept and complete trips, and see correct earnings. Every visible control must either complete its advertised action or clearly explain why it cannot. English, French, and Kinyarwanda must work on Android and web; native-only actions also need a real Android check.

## What exists now

| Area | Current implementation | Completion evidence still needed |
| --- | --- | --- |
| Rider Home | Full-screen map, nearby cars, compact pickup/destination panel, Private/Share choice, Find Ride, location recenter | Android layout and map performance; permission-denied and no-driver states |
| Booking and trips | Place picker, quotes, Economy/Comfort/XL, cash/wallet/mobile money, matching, live tracking, PIN, cancellation, rating | Full rider and driver journey on Android; payment provider and timeout/reassignment cases |
| Driver app | Registration, profile, vehicle, online status, offers, journey, history, earnings, notifications, support | Verification, background push, app restart, and payout operations with real drivers |
| Accounts | Rider and driver auth, OTP, password reset, profile, logout, deletion | Real SMS, expired OTP, session expiry, deletion and data-retention checks |
| Safety | Trip sharing, SOS event, operator dispatch, call-center dialing | Real operator receipt and dialer behavior on a phone |
| Operations | Admin APIs for driver verification, emergencies, payment exceptions | Operator workflow and audit trail; no production demo switches |

These are code inventory observations. They are not substitutes for end-to-end acceptance.

## Driver supply and matching

The moving demo fleet has been removed. Passenger maps and matching now depend
on eligible drivers reporting a fresh location from their own devices; driver
ride feeds use the passenger attached to each real booking. Recruit and verify
real drivers before launch, and use the operator view and real location data
to measure coverage by area and vehicle class.

## P0: complete the core ride and payment loop

- [ ] **Home and map:** GPS allowed/denied, manual pickup, location recenter, nearby drivers, empty/error/retry states, map pan/zoom to street level, readable controls with keyboard and screen reader. Keep the map visible when the app opens and the booking action reachable on a short screen.
- [ ] **Place selection:** search, reverse geocoding, saved places, pin drag, destination change, map taps, invalid/no-result/offline states, and correct pickup/destination after returning from a picker. Verify addresses across Kigali and outside it.
- [ ] **Quote and booking:** all three vehicle classes, Private/Share selection, fare breakdown, quote expiry, payment choice, promo behavior, notes, duplicate-tap prevention, active-ride restore after app restart, and honest no-driver behavior.
- [ ] **Dispatch:** only verified online drivers with an eligible vehicle appear; timeouts reassign without double acceptance; accept/reject and cancellation race conditions preserve a single ride state. Verify nearby map positions are privacy-safe and are not mistaken for guaranteed supply.
- [ ] **Trip:** driver arrival, PIN validation, route and ETA changes, rider and driver notifications, cash collection, completion, rating, history, receipt/charge display, and recovery after network loss or process restart.
- [ ] **Money:** cash, wallet top-up/payment, mobile-money collection, payment webhooks, retries, duplicate callbacks, refunds/exceptions, driver commission, earnings and payout ledger reconciliation. Confirm real Paypack callbacks in a staging environment before treating payments as ready. No demo settlement in production.
- [ ] **Safety:** trip-share link expiry, SOS submission, operator notification and acknowledgement, call-center number, OS dialer, and failure fallback. Test both rider and driver emergency routes on actual phones.

## P0: make every account and operator control real

- [ ] **Rider auth:** all language, signup, OTP, login, wrong password, reset, logout, token expiry, profile, saved places, notifications, support, and deletion flows. Test server state as well as navigation.
- [ ] **Driver onboarding:** registration, vehicle details, real license/ID/insurance/photo capture and upload, secure storage, operator review, approval/rejection with reason, resubmission, and clear offline/verification states. The current Documents screen accepts a file reference only; a file name must never count as verified evidence.
- [ ] **Driver work:** online/offline transitions, background offer alerts, accept/reject timeout, route to pickup, arrival, PIN, pooled/shared trip ordering, completion, cash confirmation, trip history, ratings, wallet and support.
- [ ] **Operator:** usable restricted workflow for KYC review, emergency queue, payment exception resolution, and driver supply by area; audit who changed each record. Exercise admin APIs with permission checks.
- [ ] **Push/SMS:** deliver real OTP SMS and rider/driver push to an installed Android build, including background and killed-app cases. Review the existing driver push implementation before production because it targets the legacy FCM endpoint and includes a Flutter click action.

## P1: finish the product surface

- [ ] Review every route under `app/(auth)`, `app/(main)`, `app/(driver-auth)`, and `app/(driver)`. For every button, menu tile, input, tab and link, record its expected action, resulting screen/API call, error state and back-navigation behavior. Remove or implement dead ends.
- [ ] Repair the server test entry point and split local smoke, provider/webhook, and invariant tests by their required environment. The current `npm test` uses `node --test test/`, which fails on the installed Node 22; running all files together also needs a live API, database and provider fixtures.
- [ ] Make payment methods and payout screens explain available actions and status. A history list alone is insufficient if the UI implies an action the backend cannot perform.
- [ ] Complete empty/loading/error/retry states, readable contrast, touch targets, accessibility names and radio states, keyboard avoidance, safe areas, and status-bar icons on small Android devices.
- [ ] Review copy and layout in English, French and Kinyarwanda, including long translations, dates, currency, singular/plural driver counts, and network errors.
- [ ] Consolidate visual tokens and reusable components across rider and driver screens so buttons, cards, spacing, typography and sheets feel like one product. Keep the map as the rider Home focal point.
- [ ] Replace the stale Flutter starter `README.md` with accurate Expo/Node setup, development commands, environment variables, and a release runbook.

## Release gates and evidence

1. **Local code:** TypeScript check; translation tests; environment-specific server tests; `git diff --check`. Fix failures before counting a gate as passed.
2. **Browser:** Playwright auth, Home, booking, cancellation, safety and link tests. Add a screen/button coverage matrix and retain screenshots/traces for failures. Web success does not prove native permission, keyboard, push, dialer or status-bar behavior.
3. **Android:** Install a fresh build with native modules, then complete at least one whole rider trip and one whole driver trip using test accounts. Check GPS denial, background/reopen, keyboard, status bar, map zoom, calls and push.
4. **Staging services:** private routing/geocoding capacity, real SMS, real payment provider, webhook signatures, operator SOS delivery, admin verification and payout reconciliation. Use test credentials; document provider receipts.
5. **Production:** verify real Paypack/SMS credentials, ensure local OTP reveal is disabled, and confirm every driver is approved through KYC; verify driver availability, backups, monitoring, rollback and post-deploy readback. Do not mark ready from a local green suite alone.

Run the existing checks from the repository root with the appropriate API and development database running:

```bash
npx tsc --noEmit -p .
npm run test:i18n
npx playwright test
```

The browser suite uses development fixtures and requires its configured API/web servers; read `playwright.config.ts` and `tests/e2e/helpers.ts` before running it. Server tests currently run as individual scripts under `server/test/`, with different API, database and provider prerequisites; read each header before running it. Keep secrets in environment variables. Use Jev for bounded semantic design or place-search judgments where useful, then verify the chosen behavior deterministically; Jev does not replace these release gates.
