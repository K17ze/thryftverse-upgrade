# ThryftVerse Motion System

A standardized motion token system inspired by **Linear's 120–180ms spring-based precision** and **Instagram's physics-based motion** that mimics human movement.

## Principles

1. **Motion as feedback, not decoration.** Every animation communicates a state change, a touch response, or a navigation event. No element moves just to look pretty.
2. **Spring-based, not ease-in-out.** Springs model real-world physics — they accelerate, overshoot slightly, and settle. This feels more natural than CSS-style easing curves.
3. **120–180ms for state changes.** Fast enough to feel responsive, slow enough for the eye to perceive the transition. Anything shorter feels like a snap; anything longer feels sluggish.
4. **Nothing snaps, everything settles.** Even reduced-motion users get a settle (critically damped spring) rather than an instant jump — the change is communicated without visible travel.

---

## Token Reference

Source: `src/theme/motionTokens.ts`

### Durations

| Token      | ms  | Use case                                      |
|------------|-----|-----------------------------------------------|
| `instant`  | 0   | Reduced-motion / no-animation fallback        |
| `fast`     | 120 | Quick feedback — tap, press, opacity fade     |
| `normal`   | 180 | Standard state change — sheet open, tab switch|
| `slow`     | 280 | Larger transition — screen push, modal        |
| `slower`   | 400 | Emphasis moment — success animation           |

### Spring Configs

All configs are Reanimated 4 compatible (`{ damping, stiffness, mass }`).

| Token           | Damping | Stiffness | Mass | Use case                                      |
|-----------------|---------|-----------|------|-----------------------------------------------|
| `tap`           | 18      | 280       | 0.8  | Quick tap feedback — snappy, settles fast     |
| `press`         | 15      | 200       | 0.9  | Gentle press — slightly softer, for buttons   |
| `entrance`      | 22      | 180       | 1.0  | Sheet/modal entrance — smooth, confident      |
| `lift`          | 16      | 160       | 1.0  | Card lift — playful but controlled            |
| `success`       | 12      | 120       | 1.0  | Success celebration — bouncy                  |
| `sharedElement` | 26      | 200       | 1.0  | Shared element transition — no overshoot      |

### Easing Curves

For non-spring animations (opacity fades, etc.):

| Token      | Curve          | Use case                        |
|------------|----------------|---------------------------------|
| `smooth`   | `easeInOut`    | Standard opacity fades          |
| `entrance` | `easeOutCubic` | Decelerate into rest            |
| `exit`     | `easeInCubic`  | Accelerate away                 |

### Stagger Delays

| Token    | ms  | Use case                              |
|----------|-----|---------------------------------------|
| `fast`   | 40  | Quick cascade — list entrance         |
| `normal` | 60  | Standard cascade                      |
| `slow`   | 100 | Dramatic cascade — hero sections      |

---

## When to Use Each Spring Config

### `Motion.spring.tap`
**Use for:** Quick tap feedback on small controls (icons, chips, tab buttons).
**Characteristics:** Snappy, high stiffness, low mass — settles in ~120ms.
**Example:** Tab bar create button press, small icon button tap.

### `Motion.spring.press`
**Use for:** Pressable buttons and cards that need a slightly softer feel.
**Characteristics:** Moderate damping and stiffness — settles in ~150ms with a tiny settle.
**Example:** `AnimatedPressable` scale feedback on feed tiles, header buttons.

### `Motion.spring.entrance`
**Use for:** Sheet/modal open/close, screen content entrance.
**Characteristics:** High damping, smooth — confident settle without overshoot.
**Example:** `BottomSheet` open/close, feed item staggered entrance.

### `Motion.spring.lift`
**Use for:** Card lift on long-press or drag.
**Characteristics:** Playful, slightly bouncy — communicates "picked up".
**Example:** Long-press peek on a product card.

### `Motion.spring.success`
**Use for:** Success celebrations (checkmark animation, confirmation).
**Characteristics:** Bouncy, low damping — joyful settle.
**Example:** Listing published confirmation.

### `Motion.spring.sharedElement`
**Use for:** Shared element transitions between screens.
**Characteristics:** High damping, no overshoot — position changes must be precise.
**Example:** Product card → product detail image transition.

---

## Duration Guidelines

- **0ms (`instant`):** Only for reduced-motion fallback. Never use for real animations.
- **120ms (`fast`):** Tap feedback, opacity fades on press, tab switch color transitions. The user initiated the action and expects immediate acknowledgment.
- **180ms (`normal`):** Sheet open/close, tab content swap, staggered list entrance. The standard "something appeared or changed" duration.
- **280ms (`slow`):** Screen push transitions, modal entrances with larger travel distance.
- **400ms (`slower`):** Emphasis moments — success checkmarks, celebration animations. Used sparingly.

### Rule of thumb
> If the animation communicates **"I received your touch"** → use a spring (`tap` or `press`).
> If the animation communicates **"something appeared/changed"** → use `normal` duration or `entrance` spring.
> If the animation communicates **"celebration"** → use `slow`/`slower` or `success` spring.

---

## Stagger Usage

Staggered entrances create a cascade effect where list items appear one after another.

### Guidelines
- **Only stagger the first 6 items.** Staggering the entire list causes re-triggered animations on scroll-back, which feels janky.
- **Use `Motion.stagger.fast` (40ms)** for feed/list entrances — quick enough to feel like a single fluid motion.
- **Use `Motion.stagger.normal` (60ms)** for sectioned content with fewer items.
- **Use `Motion.stagger.slow` (100ms)** for hero sections with 2–3 items where drama is desired.

### Example (HomeScreen feed)
```tsx
const shouldStagger = motionEnabled && index < 6;
const entering = shouldStagger
  ? () => {
      'worklet';
      const delay = index * Motion.stagger.fast;
      return {
        initialValues: {
          opacity: 0,
          transform: [{ translateY: 8 }, { scale: 0.97 }],
        },
        animations: {
          opacity: withDelay(delay, withTiming(1, { duration: Motion.duration.normal })),
          transform: [
            { translateY: withDelay(delay, withSpring(0, spring.entrance)) },
            { scale: withDelay(delay, withSpring(1, spring.entrance)) },
          ],
        },
      };
    }
  : undefined;
```

---

## Reduced Motion Handling

All motion in ThryftVerse respects the user's **Reduce Motion** accessibility setting (iOS Settings → Accessibility → Motion → Reduce Motion, or Android equivalent).

### `useMotionConfig()` hook

Source: `src/hooks/useMotionConfig.ts`

```tsx
const { duration, spring, stagger, isEnabled } = useMotionConfig();
```

When reduced motion is **enabled**:
- `isEnabled` → `false`
- All spring configs become critically damped (`damping: 100, stiffness: 1000`) — elements settle instantly with no visible travel
- All stagger delays → `0` — items appear simultaneously
- Durations → `0` — no timing-based animation travel

When reduced motion is **disabled** (default):
- `isEnabled` → `true`
- Full `Motion` token values are used

### Pattern
```tsx
// Spring-based animation — automatically handles reduced motion
scale.value = withSpring(target, spring.press);

// Timing-based animation — gate with isEnabled
opacity.value = withTiming(target, {
  duration: isEnabled ? Motion.duration.fast : 0,
});

// Entering animation — skip entirely when reduced motion is on
entering={isEnabled ? myEnteringAnimation : undefined}
```

---

## Examples by Motion Type

### 1. Press Feedback (AnimatedPressable)
```tsx
// Scale: spring-based, settles naturally
scale.value = withSpring(scaleValue, spring.press);
// Opacity: timing-based fade
opacity.value = withTiming(activeOpacity, {
  duration: isEnabled ? Motion.duration.fast : 0,
});
```

### 2. Sheet Entrance (BottomSheet)
```tsx
// Sheet translate: spring-based entrance
translateY.value = withSpring(0, spring.entrance);
// Backdrop opacity: timing-based fade
backdropOpacity.value = withTiming(1, {
  duration: isEnabled ? Motion.duration.normal : 0,
});
```

### 3. Tab Button Tap (TabNavigator create button)
```tsx
// Snappy tap feedback
scale.value = withSpring(0.9, spring.tap);
// ...on release:
scale.value = withSpring(1, spring.tap);
```

### 4. Staggered List Entrance (HomeScreen feed)
See [Stagger Usage](#stagger-usage) above.

---

## File Map

| File | Purpose |
|------|---------|
| `src/theme/motionTokens.ts` | Token definitions (durations, springs, easing, stagger) |
| `src/hooks/useMotionConfig.ts` | Hook that returns motion configs adjusted for reduced motion |
| `src/components/AnimatedPressable.tsx` | Uses `Motion.spring.press` for scale feedback |
| `src/components/BottomSheet.tsx` | Uses `Motion.spring.entrance` for open/close |
| `src/screens/HomeScreen.tsx` | Uses `Motion.stagger.fast` for feed entrance |
| `src/navigation/TabNavigator.tsx` | Uses `Motion.spring.tap` for create button |

---

## Migration Notes

An older `src/constants/motion.ts` exists with different token names (`Motion.timing.pressIn`, `Motion.spring.flagship`, etc.). Screens still importing from `constants/motion` should be migrated to `theme/motionTokens` + `useMotionConfig` when touched. The two systems coexist without conflict since they are separate modules.
