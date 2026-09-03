# ThryftVerse Motion Grammar

The single documented motion contract for the app. Every animated surface must
map to one of the semantic families below. If a motion does not fit a family,
it is decorative and should be removed.

This document is the spec; `src/theme/motionPresets.ts` is the code. Raw
durations, spring constants, and easing curves live in
`src/theme/motionTokens.ts` (`Motion`) — the single source of truth for
numbers. `motionPresets.ts` names the families; screens consume presets, not
magic numbers.

## Principles

1. **Motion explains continuity and state — it is never decorative.** If
   removing the animation would not confuse the user about what changed or
   where an element went, the animation is decoration. Delete it.
2. **Three duration families, one reduced-motion policy.** No other durations.
3. **No bespoke spring constants per screen.** The only spring in the grammar
   is press feedback. Everything else is timing-based. Use `Motion.spring.*`
   or `SPRING` in `motionPresets.ts`; never inline `{ damping, stiffness, mass }`
   in a screen or component.
4. **Every animation declares six things:** trigger, property, duration/spring
   family, interruption behavior, reduced-motion replacement, and the
   accessibility announcement (if any).
5. **Content availability is never delayed by animation.** A user must never
   wait for an animation to finish to read, scroll, or act. Screen readers must
   not wait for animation.

## Duration families

Only three bands are permitted. They map onto the existing `Motion` tokens so
there is one set of raw numbers.

### Instant (100–200ms) — `DURATION.instant` = `Motion.duration.normal` (180ms)
- Press feedback, tap state changes, toggle switches, message entrance.
- Easing: `EASING.easeOut` (`Motion.easing.easeOut`).
- Spring: press feedback uses `SPRING.press` (`Motion.spring.press`); tap uses
  `SPRING.tap` (`Motion.spring.tap`).
- Reduced motion: opacity-only crossfade, **0ms**.

### Prompt (200–350ms) — `DURATION.prompt` = `Motion.duration.slow` (280ms)
- Sheet present/dismiss, modal transitions, section reveals, list item reveal,
  loading → content crossfade.
- Easing: `EASING.decelerated` (`Motion.easing.entrance`, ease-out).
- Reduced motion: opacity-only crossfade, **100ms**.

### Continuity (350–600ms) — `DURATION.continuity` = `Motion.duration.slower` (400ms)
- Shared element transitions, hero image expansion, screen push with media.
- Easing: `EASING.decelerated`.
- Reduced motion: opacity-only crossfade, **150ms**.

> The existing `Motion.duration` scale (`touch`, `fast`, `normal`, `slow`,
> `slower`, `crawl`) and `Motion.tier` (`instant`, `micro`, `deliberate`) remain
> valid for legacy callers, but **new work should reference `DURATION.*` and
> `MOTION_PRESETS.*`** so the three-family discipline is enforced at the call
> site. `crawl` (600ms) is reserved for rare celebratory/onboarding moments only
> and must be justified in code review.

## Semantic motion families

Each family has a preset in `MOTION_PRESETS` (`src/theme/motionPresets.ts`).

### 1. Press feedback — `MOTION_PRESETS.pressFeedback`
- **Trigger:** touch down / touch up.
- **Property:** scale (0.97), opacity (0.8).
- **Family:** Instant. Spring: `SPRING.press`.
- **Interruption:** reversible — touch up reverses immediately.
- **Reduced motion:** opacity only (0.6 → 1.0), 0ms. Spring collapses via
  `useMotionConfig()` (`REDUCED_SPRING`).
- **Accessibility:** no announcement — pure visual feedback.

### 2. Sheet present — `MOTION_PRESETS.sheetPresent`
- **Trigger:** tap action that opens a bottom sheet.
- **Property:** translateY (100% → 0), opacity (0 → 1).
- **Family:** Prompt.
- **Interruption:** dismiss reverses the same animation.
- **Reduced motion:** opacity crossfade, 100ms.
- **Accessibility:** announce sheet title via `accessibilityLiveRegion` or an
  `AccessibilityInfo.announceForAccessibility` call on present.

### 3. Modal push — `MOTION_PRESETS.modalPush`
- **Trigger:** navigation to a modal screen.
- **Property:** translateY (full-screen slide up), opacity.
- **Family:** Prompt.
- **Interruption:** back reverses.
- **Reduced motion:** opacity crossfade, 100ms.
- **Accessibility:** screen reader focus moves to the modal title automatically
  via React Navigation; no extra announcement needed.

### 4. List item reveal — `MOTION_PRESETS.listReveal`
- **Trigger:** scroll into view / data load.
- **Property:** opacity (0 → 1), translateY (8pt → 0).
- **Family:** Prompt.
- **Interruption:** new items replace without animation.
- **Reduced motion:** opacity only, 100ms.
- **Accessibility:** no announcement.
- **IMPORTANT:** Do **NOT** animate every item on mount. Only animate items
  that enter the viewport during scroll, and only the first time. Cap cascades
  to the first viewport (`Motion.stagger.maxItems` = 8). Long lists must not
  animate their entire history (AGENTS.md §16).

### 5. Media hero expand — `MOTION_PRESETS.mediaExpand`
- **Trigger:** tap on a product image to open the full-screen viewer.
- **Property:** scale + position (shared element transition).
- **Family:** Continuity.
- **Interruption:** close reverses.
- **Reduced motion:** opacity crossfade, 150ms.
- **Accessibility:** announce "Image viewer opened" on present; move focus to
  the viewer container.

### 6. State transition (loading → content) — `MOTION_PRESETS.stateTransition`
- **Trigger:** data finishes loading.
- **Property:** opacity crossfade (skeleton → content).
- **Family:** Prompt.
- **Interruption:** if data refreshes, crossfade again.
- **Reduced motion:** opacity only, 100ms.
- **Accessibility:** announce "Content loaded" only if the screen was
  previously in an error/empty state the user would want to know resolved.

### 7. Send/receive message — `MOTION_PRESETS.messageSend`
- **Trigger:** message sent or received.
- **Property:** translateY (from below) + opacity; received messages slide in
  from bottom.
- **Family:** Instant.
- **Interruption:** new messages appear without animating the old ones.
- **Reduced motion:** opacity only, 0ms.
- **Accessibility:** received messages must be announced via
  `AccessibilityInfo.announceForAccessibility` (sender + preview). Sent
  messages are not announced (the user just typed them).

### 8. Filter/sort change — `MOTION_PRESETS.filterChange`
- **Trigger:** filter or sort selection.
- **Property:** list opacity (1 → 0.3 → 1), **no layout shift**.
- **Family:** Instant.
- **Interruption:** rapid changes debounce — animate only the final state.
- **Reduced motion:** no animation, instant swap.
- **Accessibility:** announce the active filter result count, e.g.
  "Showing 12 results".

### 9. Tab switch — `MOTION_PRESETS.tabSwitch`
- **Trigger:** tab bar selection.
- **Property:** content crossfade, tab indicator slide.
- **Family:** Instant.
- **Interruption:** rapid switches cancel the previous animation.
- **Reduced motion:** instant swap, no indicator animation.
- **Accessibility:** no announcement — the tab label itself is the
  announcement. Ensure the selected tab's `accessibilityState={{ selected: true }}`
  is set.

### 10. Pull to refresh — `MOTION_PRESETS.pullRefreshSpinner` / `pullRefreshSettle`
- **Trigger:** pull down on a scroll view.
- **Property:** spinner rotation (Instant), content translateY settle (Prompt).
- **Family:** Instant (spinner), Prompt (content settle).
- **Interruption:** release triggers refresh; content settles back.
- **Reduced motion:** spinner only, no content translation.
- **Accessibility:** announce "Refreshing" on release and "Refresh complete"
  on success, via `AccessibilityInfo.announceForAccessibility`.

## Forbidden motion

These are defects, not style choices (AGENTS.md §17, §4 anti-AI design):

- Decorative entrance animation on every module mount.
- Bounce / spring on every press (use the one press spring, or timing).
- Slide-in from random directions.
- Parallax on every scroll.
- Wobble or overshoot on state changes.
- Animation that delays content availability.
- A second set of spring constants defined in a screen or component file.
- `FadeIn.duration(<magic number>)` that does not reference a token or preset.

## Reduced motion policy

One policy, enforced everywhere:

- All motion must respect `useReducedMotion()` from
  `hooks/useReducedMotion.ts` (OS setting ORed with the in-app preference).
- Reduced motion = **opacity-only crossfades at 0–150ms**. No scale, translate,
  or rotation.
- Springs collapse to `REDUCED_SPRING` (critically damped) via `useMotionConfig()`.
- Durations collapse to the preset's `reducedMotionDuration` (0, 100, or 150ms).
- Content availability must never be delayed by animation.
- Screen readers must not wait for animation to complete.
- Shimmer / parallax / continuous loops must be disabled entirely under reduced
  motion (static placeholder, no animation).

## How to use the grammar in code

```ts
import { MOTION_PRESETS, useMotionDuration } from '../theme/motionPresets';
import { withTiming } from 'react-native-reanimated';

const preset = MOTION_PRESETS.sheetPresent;
const duration = useMotionDuration(preset);

opacity.value = withTiming(1, { duration, easing: preset.easing });
translateY.value = withTiming(0, { duration, easing: preset.easing });
```

For press feedback (the only spring):

```ts
import { SPRING } from '../theme/motionPresets';
import { withSpring } from 'react-native-reanimated';
// useMotionConfig() already collapses SPRING.press to REDUCED_SPRING.
scale.value = withSpring(0.97, SPRING.press);
```

## Migration needed

The following call sites use bespoke constants (hardcoded durations or inline
spring constants) instead of `MOTION_PRESETS` / `Motion.*` tokens. They are
**not broken** and must not be changed in this pass — they are flagged for a
follow-up migration to the grammar. Grouped by defect type.

### A. Hardcoded `withTiming` durations (not referencing `Motion.duration.*`)

| File | Lines | Value | Target preset |
|------|-------|-------|---------------|
| `components/chat/InboxConversationRow.tsx` | 60, 65, 71 | `duration: 200` | `messageSend` (typing dot loop — custom, but should derive from `DURATION.instant`) |
| `components/look/LookCommentsSheet.tsx` | 160–161, 165–166 | `140`, `120`, `80` | `pressFeedback` / `messageSend` |
| `creator/CreatorCanvas.tsx` | 1863 | `Math.max(800, len * 60)` | bespoke typewriter — keep, but document as a named exception |

### B. Hardcoded `FadeIn/SlideIn/FadeOut.duration(N)` not referencing tokens

| File | Lines | Value | Target preset |
|------|-------|-------|---------------|
| `screens/EditListingScreen.tsx` | 939, 940, 1348, 1349, 1362, 1363 | `200` | `stateTransition` |
| `screens/SellScreen.tsx` | 698, 699 | `200` | `stateTransition` |
| `screens/UserProfileScreen.tsx` | 1049, 1083 | `200` | `tabSwitch` |
| `screens/MyProfileScreen.tsx` | 876, 937, 984, 1090 | `200` | `tabSwitch` |
| `screens/ClosetScreen.tsx` | 866, 871, 876, 881 | `200` | `tabSwitch` |
| `screens/CreateSyndicateScreen.tsx` | 425, 477, 671, 737 | `250` | `stateTransition` |
| `screens/StyleQuizScreen.tsx` | 120, 140, 163, 183 | `250` | `modalPush` (step enter) |
| `screens/CategoryDetailScreen.tsx` | 413 | `220` | `listReveal` |
| `screens/MoodboardHomeScreen.tsx` | 518 | `250` | `listReveal` |
| `screens/GalleriaScreen.tsx` | 583 | `250` | `listReveal` |
| `screens/OnboardingScreen.tsx` | 169, 215 | `SlideInRight.springify()`, `220` | `modalPush` |
| `components/EmptyState.tsx` | 39 | `300` | `stateTransition` |
| `components/animations/AnimatedEmptyState.tsx` | 64 | `300` | `stateTransition` |
| `platform/monitoring/AppErrorBoundary.tsx` | 182 | `300` | `stateTransition` |
| `screens/LiveStreamViewerScreen.tsx` | 752 | `300` | `stateTransition` |
| `components/product/FullscreenMediaViewer.tsx` | 403, 404 | `200` | `mediaExpand` |
| `components/look/LookCommentsSheet.tsx` | 943 | `SlideInDown.duration(280)` | `sheetPresent` |

### C. Inline bespoke spring constants (`.damping(N).stiffness(N)`)

| File | Lines | Constants | Target |
|------|-------|-----------|--------|
| `screens/SignUpScreen.tsx` | 191 | `damping(22)` | `SPRING.press` or timing `modalPush` |
| `screens/OnboardingScreen.tsx` | 170 | `damping(20).stiffness(200)` | `SPRING.press` / `modalPush` |
| `screens/SyndicateOnboardingScreen.tsx` | 85, 88 | `damping(20).stiffness(200)` | `SPRING.press` / `modalPush` |

### D. Missing reduced-motion guard (animation runs regardless of preference)

| File | Line | Issue |
|------|------|-------|
| `components/product/FullscreenMediaViewer.tsx` | 403, 404 | `FadeIn/FadeOut.duration(200)` with no `useReducedMotion()` branch |
| `components/look/LookCommentsSheet.tsx` | 943 | `SlideInDown.duration(280)` with no `useReducedMotion()` branch |

### E. Duplicate motion token source (second spring constant set)

| File | Lines | Issue |
|------|-------|-------|
| `theme/m3ExpressiveTokens.ts` | 96–98 | Defines a second set of `damping/stiffness/mass` triples (`emphasizedStandard`, `emphasizedAccelerate`, `emphasizedDecelerate`). These should either be retired in favor of `Motion.spring.*` / `MOTION_PRESETS`, or explicitly documented as the M3 expressive exception with a pointer from this grammar. |

### Migration order

1. **D first** (missing reduced-motion guards) — accessibility regression, highest priority.
2. **C** (inline spring constants) — replace with `SPRING.press` or timing presets.
3. **B** (hardcoded entrance durations) — replace with `MOTION_PRESETS.<family>` + `useMotionDuration`.
4. **A** (hardcoded `withTiming` durations) — replace with `Motion.duration.*` or presets.
5. **E** (duplicate token source) — decide whether `m3ExpressiveTokens` motion is retired or documented as a named exception.
