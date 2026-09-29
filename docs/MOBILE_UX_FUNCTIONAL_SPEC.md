# FEM C@BS mobile experience checklist

This checklist covers the passenger and driver apps in this Expo Router project. It defines expected behavior for each surface; a route's existence alone does not prove the behavior works on a device.

## Navigation

- Keep four labelled top level tabs for each role. Passenger: Home, My Rides, Wallet, Profile. Driver: Home, My Rides, Wallet, More. Use tabs to switch sections, never to trigger an action. Preserve each tab's place when switching tabs.
- Use a clear back or up control and a screen title on pushed screens. Android system back must lead to the same sensible destination. Keep primary tabs visible on the top level and avoid trapping users in a request or ride flow.
- Keep the primary ride action obvious on Home: request a ride for passengers; go online or offline, view an offer, and act on the active trip for drivers. Put Settings, documents, ratings, support, and legal pages under Profile or More.
- Adapt navigation on wide screens instead of stretching the phone tab bar across a tablet. Keep content in a readable column and respect status bar, gesture bar, keyboard, and display cutouts.

## Passenger journey

1. **Onboarding and account:** language choice, sign up and sign in, OTP verification, password recovery, profile completion, and clear validation errors.
2. **Plan a ride:** visible pickup and destination, search and recent or saved places, editable route, ride type and vehicle choice, fare estimate with currency and breakdown, payment choice, then an explicit confirmation step.
3. **Request and pickup:** searching state with cancellation rules, driver and vehicle identity, ETA and live status, contact and safety actions, pickup PIN instructions, and a clear response to lost location or connection.
4. **Trip and aftercare:** current route and status, safe sharing and SOS access, arrival and completion summary, receipt/payment status, rating, ride history, and support tied to a ride.
5. **Account and money:** wallet balance and transaction history, top up result and reconciliation state, saved places, notification settings, privacy, help, and account deletion.

## Driver journey

1. **Onboarding and eligibility:** registration and sign in, profile and vehicle details, document submission and review status, and an explicit reason when the driver cannot go online.
2. **Availability and offers:** online/offline state, location freshness, incoming request with pickup, destination, fare and response time, clear accept/decline controls, and a visible transition after an action.
3. **Active trip:** pickup route and arrival, rider contact and safety, PIN verification, start and finish actions, payment method and cash confirmation when applicable, and recovery after connection loss.
4. **Earnings:** wallet balance, trip earnings, payout request and payout history with amount, method, date, and text status. Show pending, processing, completed, failed, and reversed states with next steps where needed.
5. **Performance and support:** trip history and details, rating summary and individual feedback, notifications, account/settings, document renewal, and support threads.

## Cards, rows, and information hierarchy

- A card groups one subject: a ride, payout, offer, balance, or summary. Its first line says what it is; the next lines show the few facts needed for a decision; one primary action is visually dominant. Use a plain list row for repetitive history when a card adds no useful hierarchy.
- Make money, dates, ETA, and status explicit. Never rely on green/red alone: display a status word and, for a failure, a brief next step. Do not truncate the only copy of an amount, address, status, or driver's identity.
- Give loading, empty, error, offline, and success states meaningful text. An empty state should explain why the list is empty and offer an action where one exists. Retry errors without losing a partially completed ride request or form.
- Keep destructive actions separate, named, and confirmed. Show payment or payout processing as pending until the server confirms the final result.

## Legibility and access

- Design first at 320–360 dp width and test larger text settings. Let labels wrap or reflow instead of clipping; avoid fixed height on text heavy cards. Use scalable text and keep body copy comfortably readable.
- Check text contrast against its actual background, including disabled and tinted surfaces. Aim for WCAG AA guidance: 4.5:1 for normal text, 3:1 for large text; test the actual rendered colors.
- Give every interactive icon a spoken label and state. Keep tab selection, online/offline, selected payment method, loading, and disabled states available to accessibility services. Use generous touch areas; target at least 44–48 dp for frequent mobile controls.
- Test with screen readers, large fonts, keyboard focus on web, one hand use, French and Kinyarwanda strings, and slow or interrupted network conditions.

## Review priorities in this checkout

1. Verify passenger and driver flows on a narrow Android device and inspect the bottom tab bar labels, which currently use a 10.5 dp font in `components/FEMBottomNavigation.tsx`.
2. Audit detail screens for a consistent title and back control; `components/BackHeader.tsx` supplies the control but its icon button still needs an accessibility label.
3. Audit `Card` usage for information hierarchy, status text, and wrapping. In particular, the driver payout screen truncates amount and method to one line; its status is text, but the date and failure next step are absent.
4. Verify loading, empty, error, and offline states across the request, tracking, trip, wallet, ratings, and payout routes. Route and static code inspection do not establish device behavior.
5. Test payment, location, SOS, and driver eligibility against a staged API and a real device before treating the flows as release ready.

## Sources

- [Android layout and navigation patterns](https://developer.android.com/design/ui/mobile/guides/layout-and-content/layout-and-nav-patterns)
- [Android components and content grouping](https://developer.android.com/design/ui/mobile/guides/components/material-overview)
- [Android system bars and insets](https://developer.android.com/design/ui/mobile/guides/foundations/system-bars)
- [Apple tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars)
- [Apple accessibility and text guidance](https://developer.apple.com/design/human-interface-guidelines/accessibility)
- [W3C contrast minimum](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum)
- [W3C target size minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum)
- [W3C reflow](https://www.w3.org/WAI/WCAG21/Understanding/reflow)
