# Micro-Interaction Grammar

> 2026 August research on micro-interactions, codified as the single source
> of truth for press feedback, pull-to-refresh, swipe actions, and haptic
> patterns across ThryftVerse. Every animated surface must reference these
> values — no local "magic" numbers (AGENTS.md §17).

---

## Press feedback

Asymmetric timing separates "sluggish" from "twitchy": press-down is fast so
the feedback arrives within the 100ms budget; release is slower so the surface
settles naturally instead of snapping back.

| Surface | Scale | Press-down | Release | Haptic |
|---------|-------|------------|---------|--------|
| Cards | 0.98 | 80ms (`spring.tap`) | 160ms (`spring.press`) | none |
| Buttons | 0.95 | 80ms (`spring.tap`) | 160ms (`spring.press`) | light on press |
| Destructive buttons | 0.95 | 80ms (`spring.tap`) | 160ms (`spring.press`) | medium on press |

**Implementation:** `AnimatedPressable` (`src/components/AnimatedPressable.tsx`)
- Press-down: `withSpring(scaleValue, spring.tap)` + opacity 80ms (`duration.touch`)
- Release: `withSpring(1, spring.press)` + opacity 160ms (`duration.pressRelease`)
- Reduced motion: critically-damped spring + 0ms opacity (instant state change)
- Haptic fires on `onPress` (activation), not `onPressIn`, so aborted scroll
  gestures don't trigger spurious haptics

---

## Pull-to-refresh

A rubber-band pull with progressive haptics. The indicator fades in during the
pull, a light haptic fires when the user crosses the threshold, and a success
haptic fires when the refresh completes.

| Parameter | Value | Token |
|-----------|-------|-------|
| Resistance ratio | 0.45 | `RESISTANCE_RATIO` |
| Trigger threshold | 64px | `TRIGGER_THRESHOLD` |
| Min display time | 600ms | `MIN_DISPLAY_MS` |
| Indicator size | 24pt | `INDICATOR_SIZE` |
| Max pull displacement | 120px | `MAX_PULL_DISPLACEMENT` |

**Haptics:**
- Light impact at threshold crossing (fires once per pull attempt)
- Success notification on refresh complete

**Reduced motion:** no spring — indicator snaps to fixed position instantly.
The success haptic still fires (notification haptics communicate outcome).

**Implementation:** `PullToRefreshEnhanced` (`src/components/PullToRefreshEnhanced.tsx`)
- Uses Reanimated shared values driven on the UI thread
- Wraps a gesture-handler `ScrollView` so nested gesture-handler children
  (Swipeable, FlashList) coexist without gesture conflicts
- Minimum display time enforced via `Promise` + `setTimeout` so the indicator
  doesn't flash even if the refresh callback resolves instantly

---

## Swipe actions

iOS-style swipe-to-reveal with haptic cues on reveal and commit, plus a
full-swipe commit gesture that triggers the first action automatically.

| Parameter | Value |
|-----------|-------|
| Action width | 80pt |
| Full-swipe | triggers first action |
| Reveal haptic | light (tick) |
| Commit haptic | medium (snap) |
| Destructive background | `colors.danger` |
| Non-destructive background | `colors.surfaceAlt` |
| Auto-close | when another row opens |

**Reduced motion:** no spring animation — actions snap instantly.

**Accessibility:** each action has `accessibilityRole="button"` and
`accessibilityLabel`. The row itself is announced with a hint describing the
available swipe actions.

**Implementation:** `SwipeActionRow` + `SwipeProvider` (`src/components/SwipeActionRow.tsx`)
- Uses `react-native-gesture-handler` `Swipeable` + Reanimated
- `SwipeProvider` coordinates auto-close: when a new row opens, any
  previously-open row closes (mimics iOS Mail)
- Full-swipe commit: `onSwipeableRightOpened` fires the first action
- Partial-swipe commit: tapping a revealed action button fires it
- Destructive actions use `colors.danger` with `textInverse` icon/label
- Non-destructive actions use `colors.surfaceAlt` with `textPrimary` icon/label

---

## Haptic patterns

| Interaction | Pattern | Intensity |
|-------------|---------|-----------|
| Button press | tick | light |
| Selection change | tick | light |
| Success | snap | medium |
| Error | double thud | heavy |
| Destructive | thud | heavy |
| Swipe reveal | tick | light |
| Swipe commit | snap | medium |
| Pull threshold | tick | light |
| Refresh complete | snap | success |

**Gating (AGENTS.md §18):**
- Impact haptics (light/medium/heavy) are suppressed under Reduce Motion
- Notification haptics (success/error/warning) fire even under Reduce Motion
  because they communicate outcome, not decoration
- Android: impact haptics mapped to VibrationEffect compositions (API 26+)
- iOS: Core Haptics engine for compound patterns (see `HapticsEngine`)

**Implementation:**
- `useHaptic` hook (`src/hooks/useHaptic.ts`) — primitive haptic methods
- `HapticPatterns` (`src/utils/hapticPatterns.ts`) — compound sequences
- `HapticsEngine` (`src/platform/haptics/HapticsEngine.ts`) — platform engine

---

## Motion tokens

All durations and springs are defined in `src/theme/motionTokens.ts` and
consumed via `useMotionConfig()` which collapses to instant/critically-damped
under Reduce Motion.

| Token | Value | Usage |
|-------|-------|-------|
| `duration.touch` | 80ms | Press-down opacity |
| `duration.pressRelease` | 160ms | Release opacity |
| `spring.tap` | damping 18, stiffness 280 | Press-down scale |
| `spring.press` | damping 15, stiffness 200 | Release scale |
| `spring.settle` | damping 24, stiffness 240 | Pull-to-refresh snap |
| `REDUCED_SPRING` | damping 100, stiffness 1000 | All springs under Reduce Motion |
