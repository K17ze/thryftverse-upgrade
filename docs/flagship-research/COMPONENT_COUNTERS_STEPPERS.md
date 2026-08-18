# ThryftVerse Flagship Upgrade — Counters & Steppers

**Component deep-dive:** every quantity selector, number stepper, count badge, and +/- control in the ThryftVerse React Native app, audited and upgraded to 2026 flagship quality.

**Benchmark date:** 2026-08
**Sources:** AGENTS.md §4 (stroke grammar, icon grammar) · production codebase audit · 2026 web research.

---

## 1. 2026 Competitor Benchmark

### eBay (2026)
eBay's cart quantity stepper uses a compact inline control: [−] [2] [+], with the minus disabled at 1 and the plus disabled at the available stock. The buttons are 32pt circles with 1pt borders (Stroke.standard), the value is centered between them. Haptic fires on each step. eBay's lesson: **steppers must enforce bounds visually — disabled buttons communicate the limit without an error.**

### Instagram (2026)
Instagram's notification count badge is a small pill (16pt height) with the count in white text on a brand-colored fill. It appears on tab icons and profile elements. Instagram's lesson: **count badges are ambient — they communicate "something new" without demanding attention.**

### Cross-cutting 2026 consensus
- **Compact inline stepper** [−] [value] [+] for quantity selection.
- **32pt buttons** with 1pt border, Radius.full or Radius.sm.
- **Bounds enforcement** — minus disabled at min, plus disabled at max.
- **Haptic on each step** — selection haptic (light).
- **Count badge** — small pill, brand fill, white text, for notification counts.
- **Long-press to fast-change** — hold plus/minus to rapidly increment/decrement.
- **Accessibility** — `accessibilityRole="adjustable"`, increment/decrement actions.

---

## 2. Psychology & Principles

### Direct manipulation of numbers
A stepper lets the user directly manipulate a number by pressing +/−. This is more tactile than typing a number into a text field — the user feels the increment. For small ranges (1-10), steppers are faster than text input. For large ranges (1-1000), a text input or slider is better.

### Visual bounds enforcement
Disabled minus/plus buttons communicate the bounds without an error message. The user sees "I can't go below 1" because the minus is greyed out, not because the app shows an error when they tap it. This is the 2026 standard: prevent errors through visual state, not error messages.

### Count badges as ambient signals
A count badge on a tab icon ("3 new messages") is an ambient signal — it tells the user something is new without blocking their current task. The badge must be small enough to not dominate the icon but large enough to be legible. 16pt height with 10pt text is the standard.

---

## 3. Current ThryftVerse Audit — Concrete Defects

### Counter/stepper files (60 files matched, key ones)

| File | Lines | Type | Notes |
|------|-------|------|-------|
| `components/AnimatedCounter.tsx` | 28 | Animated number counter | ✅ Reanimated count-up |
| `components/ui/BidSheet.tsx` | 420-433, 895-916 | Bid increment stepper | Custom +/− buttons |
| `components/commerce/detail/MakeOfferSheet.tsx` | 389-394 | Offer quantity | Custom stepper |
| `screens/MakeOfferScreen.tsx` | 60-86, 153-176 | Offer amount stepper | 19 matches, custom |
| `screens/TradeScreen.tsx` | 17-92, 168-255 | Trade quantity | 25 matches, custom |
| `screens/TradeConfirmScreen.tsx` | 33-86, 142-221 | Trade confirm quantity | Custom |
| `components/chat/MarketplaceChatCard.tsx` | 110-133, 200-202 | Chat commerce quantity | Custom |
| `screens/EditProfileScreen.tsx` | 312-349 | Bio character counter | Custom counter |
| `screens/SyndicateOrderHistoryScreen.tsx` | 41-106 | Order quantity display | Display only |
| `components/OfferBubble.tsx` | 32-70, 211-213 | Offer quantity in chat | Custom |

### Defects

| # | Defect | Location | Severity |
|---|--------|----------|----------|
| 1 | **No shared Stepper component** — every screen builds its own +/− buttons | 10+ inline implementations | High |
| 2 | **Inconsistent button styling** — different sizes, borders, radii across steppers | Multiple files | Medium |
| 3 | **Inconsistent haptic feedback** — some steppers have haptics, others don't | Multiple files | Medium |
| 4 | **No bounds enforcement on some steppers** — can go below 1 or above stock | Some custom implementations | Medium |
| 5 | **No long-press fast-change** — must tap repeatedly for large changes | All steppers | Low |
| 6 | **AnimatedCounter exists but is only for display** — no input variant | `AnimatedCounter.tsx` | Low |
| 7 | **No shared CountBadge component** — notification counts built inline | Multiple tab icons | Low |
| 8 | **Bio character counter is custom** — not reusable | `EditProfileScreen.tsx:312-349` | Low |

---

## 4. Micro Improvements

### M1 — Create shared Stepper component
```tsx
interface StepperProps {
  value: number;
  onValueChange: (value: number) => void;
  min?: number;      // default 1
  max?: number;      // default Infinity
  step?: number;     // default 1
  size?: 'sm' | 'md';  // sm=28pt, md=32pt
  disabled?: boolean;
}
```
32pt buttons, 1pt border (Stroke.standard), Radius.full, minus disabled at min, plus disabled at max, haptic on each step, long-press for fast-change.

### M2 — Create shared CountBadge component
```tsx
interface CountBadgeProps {
  count: number;
  max?: number;      // shows "99+" when exceeded
  size?: 'sm' | 'md';  // sm=16pt, md=20pt
}
```
Pill shape, brand fill, white text, "99+" overflow, Radius.full.

### M3 — Create shared CharacterCounter component
```tsx
interface CharacterCounterProps {
  current: number;
  max: number;
  warnAt?: number;   // color change threshold
}
```
Right-aligned caption text, color shifts to warning at warnAt, danger at max.

### M4 — Replace all inline steppers with shared Stepper
Migrate BidSheet, MakeOfferSheet, MakeOfferScreen, TradeScreen, TradeConfirmScreen, MarketplaceChatCard, OfferBubble to use the shared Stepper.

### M5 — Add long-press fast-change
On long-press of +/−, start a timer that increments/decrements every 100ms. Release stops the timer. Haptic on each step (debounced to 200ms to avoid haptic spam).

### M6 — Add bounds enforcement everywhere
Ensure every stepper disables minus at min and plus at max. No error messages — visual disable only.

---

## 5. Macro Improvements

### A1 — Counter/stepper component system
Create a unified family:
- `Stepper` — inline [−] [value] [+] for quantity selection
- `CountBadge` — notification count pill
- `CharacterCounter` — text input character count
- `AnimatedCounter` — display-only count-up animation (already exists)

### A2 — Consistent stepper visual language
- **Buttons:** 32pt circles, 1pt border (Stroke.standard), Radius.full
- **Value:** Centered, Type.body, tabular numerals
- **Disabled state:** 50% opacity, no haptic
- **Haptic:** selection on each step
- **Long-press:** fast-change with debounced haptic

---

## 6. Flagship Acceptance Criteria

- **Shared Stepper component** — no inline +/− implementations
- **Shared CountBadge** — no inline notification count badges
- **Shared CharacterCounter** — no inline character counters
- **Bounds enforcement** — disabled buttons at min/max, no error messages
- **Haptic on each step** — selection haptic
- **Long-press fast-change** — hold to rapidly increment/decrement
- **Consistent styling** — 32pt, 1pt border, Radius.full
- **Accessibility** — `adjustable` role, increment/decrement actions

### Thumbnail test
At 25% scale, a stepper must show: two buttons (− and +) with the value between them. The disabled state must be visually distinguishable from the enabled state.

---

## 7. Priority & Sequencing

| Priority | Item | Risk | Unblocks |
|----------|------|------|----------|
| P0 | M1 — Shared Stepper | Low | All steppers |
| P1 | M4 — Replace inline steppers | Low | Consistency |
| P1 | M6 — Bounds enforcement | Low | UX safety |
| P2 | M2 — CountBadge | Low | Notification badges |
| P2 | M3 — CharacterCounter | Low | Form UX |
| P2 | M5 — Long-press fast-change | Medium | Power user UX |
| P3 | A1 — Full counter system | High | All counter surfaces |

---

## 8. Token-Level Spec

| Token | Value | Notes |
|-------|-------|-------|
| `stepper.button.size` | 32pt | Control.touchable - 12 |
| `stepper.button.border` | 1pt (Stroke.standard) | |
| `stepper.button.radius` | Radius.full | Circle |
| `stepper.button.disabledOpacity` | 0.5 | |
| `stepper.value.font` | Type.body | tabular numerals |
| `stepper.haptic` | selection per step | |
| `stepper.longPress.interval` | 100ms | Fast-change |
| `stepper.longPress.hapticDebounce` | 200ms | Avoid spam |
| `countBadge.height.sm` | 16pt | Tab icons |
| `countBadge.height.md` | 20pt | Inline |
| `countBadge.fill` | colors.brand | |
| `countBadge.text` | colors.textInverse | White |
| `countBadge.overflow` | "99+" | Max display |
| `charCounter.font` | Type.caption | 12pt |
| `charCounter.color.normal` | colors.textMuted | |
| `charCounter.color.warn` | colors.warning | At warnAt |
| `charCounter.color.max` | colors.danger | At max |

---

*Generated 2026-08-18. Sources: production codebase audit, eBay cart quantity stepper, Instagram notification count badge patterns.*
