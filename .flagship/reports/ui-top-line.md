# UI Bug Report — Thin white horizontal line at top of every screen

## Symptom

A thin (~3px) light/white horizontal line renders uniformly at the top of ALL
screens — just under the status-bar area, above screen content — regardless of
which screen is shown.

## Root cause

**`frontend/src/creator/surfaces/GlobalUploadIndicator.tsx`** (mounted once at
the app root in `AppNavigator.tsx:509`, as a sibling after `<Stack.Navigator>`).

The component renders an ambient upload-progress track:

```tsx
<View
  pointerEvents="none"
  style={[styles.track, { top: insets.top, backgroundColor: colors.surfaceAlt }]}
>
  <Animated.View style={[styles.barClip, barStyle]}>   // opacity gated HERE only
    <Animated.View style={[styles.fill, ...]} />
  </Animated.View>
</View>
```

`styles.track` = `{ position: 'absolute', left: 0, right: 0, height: 3 (BAR_HEIGHT), zIndex: 200 }`
plus `top: insets.top` and `backgroundColor: colors.surfaceAlt`.

The show/hide opacity animation (`barStyle`, driven by
`active = isUploading || isConfirming`) was applied **one level too deep** —
on `barClip` (the fill wrapper) only. The **track itself was painted
unconditionally** at full opacity. Because it is:

- `position: absolute` at `top: insets.top` → sits on the first pixel below
  the status-bar inset ("just under the status bar area"),
- `left: 0, right: 0, height: 3` → a thin full-width band,
- `zIndex: 200` → above all screen content,
- mounted at the app root → uniform on EVERY screen (tabs, pushed screens,
  modals — anything inside `AppNavigator`'s root `View`),

…it produced exactly the reported artifact.

### Color reading

The band is `colors.surfaceAlt` over `colors.background`:

| Theme | Track (`surfaceAlt`) | Screen (`background`) | Appearance |
|-------|----------------------|-----------------------|------------|
| Dark (default; `resolvedTheme` initialises `'dark'`) | `#1C1C1C` | `#0A0A0A` | lighter band on near-black → reads as a faint white/light line |
| Dark + high contrast | `#222222` | `#0A0A0A` | same, slightly stronger |
| Light | `#EFEFEF` | `#FFFFFF` | subtle gray band at the top edge |

## Suspects eliminated

- **`FlagshipScreen.tsx` `headerWrap` border** — `borderBottomWidth` interpolates
  `scrollY [0,10] → [0, hairline]`; at `scrollY = 0` it is `0`. No hairline at
  rest. Reduced-motion path returns `borderBottomWidth: 0`. Not the cause (and
  only renders when a `header` prop is supplied — not universal).
- **`FlagshipHeader.tsx`** — no borderTop/borderBottom/hairline anywhere.
- **`AppNavigator.tsx` screenOptions** — `pushScreenOptions` sets
  `headerShown: false`; no `contentStyle`/`cardStyle`/white screen background
  anywhere; no translucent-header white underlay.
- **`TabNavigator.tsx`** — the only hairline is `borderTopWidth` on the bottom
  tab bar (`tabBarStyle`), at the bottom of the screen.
- **`InAppNotificationCenter`** — returns `null` when no notifications.
- **`KeyboardStickyView`** — thin re-export of
  `react-native-keyboard-controller`; paints nothing.
- **`app.json`** — no `androidStatusBar`/white chrome config; splash bg
  `#ffffff` is only on the native splash, not in-app.
- **`SafeAreaView edges={['top']}`** — paints `colors.background` into the
  status-bar inset correctly; not a line source.

## Fix

`GlobalUploadIndicator.tsx` — moved the visibility gate from the fill wrapper
to the whole indicator:

- Outer track `View` → `Animated.View` with `barStyle` (opacity) applied, so
  the **entire indicator — track + fill — fades in/out with `active`**. When
  nothing is uploading/confirming, opacity is `0` and nothing is painted:
  no line.
- Inner `barClip` demoted to a plain `View` (its `barStyle` was redundant once
  the parent owns opacity; `flex: 1` still stretches the fill's %-width).
- Added `accessibilityElementsHidden={!active}` (iOS) and
  `importantForAccessibility={active ? 'yes' : 'no-hide-descendants'}`
  (Android) so the invisible progress bar is also removed from the a11y tree —
  a hidden element should not be announced.

No changes needed in `FlagshipScreen`, `FlagshipHeader`, `AppNavigator`, or
theme tokens — the shared-layer element itself was defective.

## Before / after

- **Before:** track `View` painted `surfaceAlt` at opacity 1 forever →
  permanent 3px band under the status bar on all screens.
- **After:** track opacity follows `active` (200ms `withTiming`, or instant
  under `useReducedMotion`) → bar appears only while uploads are in
  flight/confirming, exactly as designed; dark mode, light mode, and
  high-contrast palettes unaffected because only opacity changed, not colors.

## Verification

- `cd frontend && npx tsc --noEmit` → exit 0, no errors.
- Manual check: with no active upload jobs (`isUploading`/`isConfirming`
  false), the indicator's outer view is `opacity: 0` → nothing renders at
  `top: insets.top`. The IG-style progress bar still fades in/out during
  uploads and respects reduced motion.
