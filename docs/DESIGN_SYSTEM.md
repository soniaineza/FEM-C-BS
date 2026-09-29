# FEM C@BS design system

One system for the rider and driver apps. It borrows proven conventions instead of inventing new ones:

| Area | Borrowed from | What it means here |
| --- | --- | --- |
| Color roles | Radix Colors, shadcn/ui | Raw scales (`green`, `neutral`) feed a small set of semantic roles (`canvas`, `surface`, `fg`, `primary`, `danger`, …). Screens use roles, never raw hex. |
| Type ramp | Apple HIG | `large-title` → `micro`, each a fixed size + line height. Poppins for titles, Inter for everything else. |
| Lists and settings | iOS inset grouped lists | `ListSection` + `ListItem`: one rounded card per group, hairline dividers, overline group title. |
| Navigation bar | Material 3 | Pill active indicator behind the icon, label below. |
| Buttons | Uber Base / Bolt | Solid brand fill for the primary action, no gradients; soft-green secondary; neutral outline for tertiary actions. |
| Elevation | Material elevation levels | `Elevation[0–4]`, one ink-tinted shadow color. |

## Tokens

`constants/tokens.js` is the single source of truth. `tailwind.config.js` turns it into class names and `constants/theme.ts` exports it typed for `StyleSheet`s and icon colors. Change a value there and both styling paths update.

**Color roles** (class suffix → use)

- `canvas`: app background behind cards (grey). `surface`: cards, sheets, fields (white). `surface-muted`: inset wells, chips, segmented control track.
- `fg` (17.6:1), `fg-muted` (7.4:1, secondary text), `fg-subtle` (4.6:1, placeholders and tertiary text), `fg-disabled`.
- `primary`: brand fills only. **Brand-colored text must use `primary-text`** (green-700); `#16A34A` on white is 3.3:1 and fails WCAG AA for body text.
- `primary-soft` / `primary-tint`: selected rows, icon wells, secondary buttons.
- Status: `danger`, `warning`, `info`, `success`, each with a `-soft` background. `star` is the rating amber.
- `border`, `border-strong`, `divider`.

Legacy class names (`text-ink`, `text-text-secondary`, `bg-bg-light`, `bg-gray-light`, `text-error`) still resolve to the new palette, but new code should use the role names.

**Type** (`text-<name>` class or `<Text variant>`)

`large-title` 30/36 · `title-1` 26/32 · `title-2` 22/28 · `title-3` 18/24 · `headline` 16/22 semibold · `body` 16/24 · `callout` 15/22 · `subhead` 14/20 · `footnote` 13/18 · `caption` 12/16 · `micro` 11/14

**Radius:** fields and buttons 14–16, cards `rounded-card` (20), sheets `rounded-t-sheet` (28), pills `rounded-full`.
**Spacing:** 4-pt grid; screen gutter 20 (`px-5`); 24–32 between sections.
**Touch targets:** 44pt minimum (`IconButton`, `ListItem` 56, buttons 48–56).

## Components

Import primitives from `components/ui`:

| Component | Use it for |
| --- | --- |
| `Screen` | Page scaffold: safe areas, canvas/surface background, gutter, tablet max-width, pull-to-refresh, sticky `footer` CTA. |
| `ScreenHeader` | Back button + large title + subtitle + trailing action. Every screen title goes through it. |
| `Text` | Typography by role: `variant`, `tone` (`muted`, `primary`, `danger`, `inverse`…), `weight`. Style it with props, not text classes. |
| `Button` (`components/Button`) | `variant`: `primary` · `secondary` · `outline` · `ghost` · `danger`; `size`: `lg` 56 · `md` 48 · `sm` 36; `icon`/`iconRight`; `loading`. |
| `Input` (`components/Input`) | Label, leading icon, focus ring, `hint`, `error`, password reveal. |
| `Card` (`components/Card`) | `tone`: `white` · `tint` · `muted` · `primary` (hero balances) · `ink`; pass `onPress` for a pressable card. |
| `ListSection` / `ListItem` | Grouped menus and settings (`MenuTile` is a legacy wrapper around `ListItem`). |
| `SegmentedControl` | 2–4 mutually exclusive views (ride history tabs, filters). |
| `Chip` | Multi-option pickers (topics, document type, quick amounts). |
| `Badge`, `RideStatusBadge` | Status as text + color, never color alone. |
| `Banner` / `ErrorMessage` | Inline notices and errors (`info`, `success`, `warning`, `danger`). |
| `EmptyState`, `ErrorState`, `LoadingState`, `Skeleton` | Every list and fetch has all three states, with a way forward. |
| `Avatar`, `IconButton`, `Divider`, `Sheet` / `SheetOption` | Initials/photo avatar, circular icon control, hairline, bottom-sheet picker. |
| `RouteTimeline` (`components/TripRouteCard`) | Pickup ring → drop-off square rail, used for every route summary. |

## Screen recipe

```tsx
<Screen header={<ScreenHeader back title={t('settings')} />} footer={<Button title={t('save')} onPress={save} />}>
  {loading ? <LoadingState /> : error ? <ErrorState message={error} retryLabel={t('tryAgain')} onRetry={load} /> : (
    <ListSection title={t('account')}>
      <ListItem icon="person-outline" title={t('editProfile')} onPress={openProfile} />
    </ListSection>
  )}
</Screen>
```

Forms keep using `components/layout/KeyboardFormScrollView` (keyboard-aware, 440px max width).

## Rules

1. No raw hex or `rgba()` in screens; add a role to `tokens.js` if one is missing.
2. One primary button per screen; put it in `Screen`'s `footer` when it completes the screen's task.
3. Brand-colored text uses `primary-text`; `primary` is for fills and icons.
4. Pressables that use `className` cannot also use a `style={({ pressed }) => …}` function (NativeWind drops it); track `pressed` in state as `Card` does.
5. Check each route at 320pt width with the longest locale (rw), large text, keyboard open, and loading, empty and error states.
