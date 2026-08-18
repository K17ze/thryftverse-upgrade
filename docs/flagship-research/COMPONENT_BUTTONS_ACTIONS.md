# ThryftVerse Flagship Upgrade — Buttons & Action Controls

**Component deep-dive:** every button variant, action bar, sticky dock and hold-to-confirm control in the ThryftVerse React Native app, audited and upgraded to 2026 flagship quality.

**Benchmark date:** 2026-08
**Sources:** AGENTS.md §4, §11, §13, §17, §27 · Design.md `components.button-primary`, `button-quiet`, `dock-geometry`, "Visible chrome is not the hit target", "Sticky action dock micro spec", press scale motion · production codebase audit · 2026 web research (URLs cited inline).

---

## 1. 2026 Competitor Benchmark — Instagram, Pinterest, eBay, Snapchat

A flagship button system is not invented in a vacuum. The strongest 2026 mobile products converge on a small set of principles: one dominant action per viewport, restrained chrome, immediate press feedback, and haptics mapped to intent rather than to component. The differences are in emphasis.

### Instagram (Meta, 2026)

Instagram's action grammar is the most stable in social commerce. The primary commerce CTA ("Buy now", "Checkout") is a full-pill, near-black filled button that sits in a sticky bottom dock; secondary actions ("Message", "Share") are quiet text or icon controls with transparent backgrounds and 44pt hit areas. Press feedback is a fast opacity dip plus a light selection haptic — never a bounce. The camera capture button is the one place Instagram uses a large circular contained control (≈80pt), because capture is the single dominant action on that surface and the circle communicates "press and hold to record" (LinkedIn UI Comparison Series 5/7, 2026-01-11, https://www.linkedin.com/posts/nandini-dunaka-4a1a53351_uiux-uicomparison-uxdesign-activity-7416109291926941696-aCdb). Instagram's lesson for ThryftVerse: **action prominence is contextual, not global** — the same "primary" treatment is reserved for the one action that owns the current viewport.

### Pinterest (2026)

Pinterest runs a near-flat canvas where a single red (`#e60023`) is the *only* filled button colour on a page, and every control is rounded at 16px (controls) to 20–40px (image cards) — a deliberate radius gradient, not a single pill everywhere (Refero Styles, Pinterest design system, https://styles.refero.design/style/8ff3bfb4-6f5e-4e07-83be-56e62ce80d2f; superloopy design tokens, https://github.com/beefiker/superloopy/blob/main/skills/superloopy-frontend/references/design/pinterest.md). Depth is essentially flat; warmth of surface colour and generous rounding do the depth work, not shadows. The Pinterest lesson: **one accent, one radius family, photography carries the rest.** ThryftVerse's neutral `colors.brand` already mirrors this discipline; the gap is in execution consistency, not palette.

### eBay (2026)

eBay's mobile checkout uses a sticky bottom CTA ("Place order" / "Pay now") pinned above the keyboard, 56–64pt tall, with a collapsed order summary above it (Shopify Checkout UX Best Practices 2026, https://cartylabs.com/blog/shopify-checkout-ux-best-practices/; Levri mobile checkout guide, https://www.levri.ai/guide/mobile-checkout-optimization). The sticky CTA is the single highest-impact mobile checkout change — typical lift +5% to +12% on completion (BTNG.studio, https://www.btng.studio/articles/mobile-checkout-optimization-guide/; ConvertCart, https://www.convertcart.com/blog/mobile-checkout-optimization). eBay's lesson: **the primary transactional action must never leave the thumb zone.** ThryftVerse's `ActionDock` already targets this, but `PremiumActionBar` and `PremiumActionFooter` duplicate the pattern with weaker geometry.

### Snapchat (2026)

Snapchat treats the camera as the core of the app and stacks creative tools on the right edge for one-handed speed; the capture button is a large, contained circular control with a hold-to-record progress ring. This is the closest analog to ThryftVerse's `HoldToSubmitButton` — a contained primary control whose *shape* communicates a press-and-hold affordance. Snapchat's lesson: **when the interaction is not a simple tap, the control's geometry must telegraph the gesture.**

### Cross-cutting 2026 consensus

- **One primary button per logical step** (SubUX, https://subux.pro/guides/article/button-hierarchy-primary-secondary-tertiary; Slickplan 2026 guide, https://slickplan.com/blog/designing-buttons-for-the-web-guide-examples; Accor design system, https://design.accor.com/latest/web/core-components/button/usage-b5SKXU8g; Microsoft Fluent 2, https://fluent2.microsoft.design/components/ios/core/button/usage).
- **44pt minimum touch target, 48dp on Android, 56dp for FABs** (72Technologies, https://www.72technologies.com/blog/tap-targets-thumb-zones-mobile-ux; MobileViewer, https://www.mobileviewer.io/blog/touch-target-size; Android FAB docs, https://developer.android.com/develop/ui/compose/components/fab).
- **Target separation matters as much as target size** — 4pt gap → 11% mistap; 12pt gap → 2% mistap (72Technologies).
- **Press feedback: scale 0.95–0.97 + spring back + light haptic** is the 2026 flagship bar (AGENTS.md §27.9; UXPin button states, https://www.uxpin.com/studio/blog/button-states/).
- **Haptics mapped to intent, not component** — success/error/warning/selection patterns, used sparingly, never the sole signal (VP0 Journal, https://vp0.com/blogs/haptic-feedback-ui-design-guidelines-ios; UX Collective haptics, https://uxdesign.cc/haptics-how-to-build-a-consistent-cross-platform-solution-and-align-code-with-figma-5990a24a2fbd; Singtel design system, https://medium.com/singtel-experience-design/designing-the-unseen-introducing-motion-design-and-haptics-in-a-design-system-6994d51d8d06).
- **Material 3 Expressive (Android 16)** introduces five button sizes, shape-morph-on-press, and toggle buttons — motion and shape now carry emphasis, not just colour (Material Components CommonButton docs, https://github.com/material-components/material-components-android/blob/master/docs/components/CommonButton.md; Android Developers M3 in Compose, https://developer.android.com/develop/ui/compose/designsystems/material3).

---

## 2. Psychology & Principles

### Affordance theory

A button's job is to make the next step feel obvious and safe (Rafa Queens, https://rafaqueens.com/how-to-design-mobile-app-buttons-users-can-spot-understand-tap-and-trust/). Affordance is the perceived invitation to act. In 2026, affordance comes from **contrast, containment, placement and label clarity** — not from skeuomorphic bevels or decorative shadows. A filled high-contrast pill in the thumb zone reads "tap me" instantly; a grey outlined rectangle of equal size reads "maybe tap me, if you figure out why." ThryftVerse's Design.md encodes this: `button-primary` is `colors.brand` filled with `text-inverse`; `button-quiet` is transparent with `text-primary`. The contrast gap between primary and quiet *is* the affordance hierarchy.

### Press feedback as trust

Press feedback is the fastest, cheapest trust signal in a mobile UI. If a user taps and *feels* nothing — no scale, no opacity shift, no haptic — the brain interprets the app as unresponsive or broken, even when the action succeeded. The 2026 flagship standard is **scale 0.95–0.97 + spring back + a haptic mapped to intent**, arriving within 100ms of the touch (AGENTS.md §27.2, §27.9; UXPin button states). Feedback must be *immediate and reversible* — the active state should feel "snappy" and reverse cleanly on release (UXPin). This is not decoration; it is the behavioral layer of Don Norman's three emotional-design levels (AGENTS.md §27.1): visceral (it looks tappable), behavioral (it responds instantly), reflective (it felt reliable, so I trust the next tap).

### Fitts's law and the thumb zone

Fitts's law: time to acquire a target is a function of distance and size. On a 6.1–6.9" 2026 phone held one-handed, the thumb's natural resting zone is the bottom third of the screen (BTNG.studio). The primary CTA belongs there — sticky, 48–56pt tall, full-width or dominant. The 44pt rule is a *floor*, not a target: MIT Touch Lab data puts the thumb pad at ~25mm vs ~16–20mm for a fingertip, and a 44pt target on a modern iPhone is only ~7mm — "a thumb fits if you aim well" (72Technologies). **Target separation** (≥8dp between adjacent targets) has a larger effect on mistap rate than incremental size increases (72Technologies). ThryftVerse's `ActionDock` secondary buttons at `gap: Space.xs` (4px) violate this — they should be `Space.sm` (8px) minimum.

### Hierarchy of action prominence

A viewport should answer "what do I do next?" with one visually dominant action. The hierarchy, from 2026 consensus:

1. **Primary** — filled, highest contrast, full-pill or dominant rectangle, one per logical step.
2. **Secondary** — outlined or tonal, same height or 4–8pt shorter, restrained fill.
3. **Tertiary / quiet** — text-only or transparent, 44pt hit area, no fill.
4. **Destructive** — separated, danger-coloured, often behind a hold-to-confirm or confirmation sheet.

When two actions share equal visual weight, decision time increases and errors rise (SubUX; Infor Design System, https://design.infor.com/patterns/interactions/button-group/). Limit button groups to a maximum of 3 actions; more weakens hierarchy (Infor).

### The "one primary action" rule

Every 2026 source restates this: **one primary button per screen or logical step** (SubUX; Slickplan; Accor; Fluent 2; Randstad, https://randstad.design/design-patterns/button-hierarchy/). The exception is a sticky CTA that mirrors an in-flow primary (e.g. a "Buy" button that follows scroll). ThryftVerse violates this in `PremiumActionBar`/`PremiumActionFooter`, where the primary and secondary buttons sit in the same dock with only an opacity difference — the secondary is too loud, the primary is not loud enough.

---

## 3. Current ThryftVerse Audit — Concrete Defects

The codebase has **at least four parallel button/action systems** that should be one. Each has its own radius, height, press scale, haptic level, disabled opacity and loading treatment. Below are the defects with file:line references.

### 3.1 Four duplicate button systems

| System | File | Primary height | Primary radius | Press scale | Haptic | Disabled opacity |
|--------|------|----------------|----------------|-------------|--------|------------------|
| `AppButton` | `components/ui/AppButton.tsx:190-199` | 52pt (md) | `Radius.lg` (12) | `0.985` (`:138`) | `none` default (`:112`) | `0.52` (`:183`) |
| `PremiumActionBar` | `components/ui/PremiumActionBar.tsx:113-127` | 54pt | `Radius.lg` (12) | `0.985` (`:57`) | `medium` (`:58`) | `0.4` (`:121`) |
| `PremiumActionFooter` | `components/ui/PremiumActionFooter.tsx:105-119` | 52pt | `Radius.lg` (12) | *none* (missing `scaleValue`) | *none* (missing `hapticFeedback`) | `0.45` (`:113`) |
| `ActionDock` | `components/ui/ActionDock.tsx:272-279` | `DockConstants.primaryButtonHeight` | `Radius.lg` (12) | `0.97` (`:189`) | `medium` (`:191`) | per-button via `disabled` |
| `HoldToSubmitButton` | `components/ui/HoldToSubmitButton.tsx:148-157` | 48pt min | `Radius.md` (8) | *none* (raw `Pressable`, no scale) | `heavy` on completion (`:61`) | `colors.surfaceAlt` bg (`:106`) |
| `FlagshipActionCluster` | `components/flagship/FlagshipActionCluster.tsx` | delegates to `AppButton` | delegates | delegates | `medium`/`heavy` (`:56`) | delegates |

**Defects:**
- `PremiumActionFooter` (`:46-56`, `:64-76`) omits `scaleValue` and `hapticFeedback` entirely — its buttons have *no press scale and no haptic*. This fails AGENTS.md §13 ("pressed feedback (scale, opacity, or both)") and §27.9 ("Button press: Scale 0.95–0.97 + spring back + light haptic").
- `HoldToSubmitButton` (`:114`) uses a raw `Pressable` with no scale animation — the only feedback is the progress ring and a label swap. A hold-to-confirm button *especially* needs press feedback because the user is sustaining contact.
- `AppButton` defaults `hapticFeedback` to `'none'` (`:112`) — most call sites must opt in, and many don't.
- Primary height varies: 48, 52, 54pt across systems. Radius varies: `Radius.md` (8) on `HoldToSubmitButton`, `Radius.lg` (12) everywhere else. Design.md specifies `button-primary` at **52pt, `Radius.full` (999px)** — *none* of the production buttons use `Radius.full` for the primary. They all use `Radius.lg` (12pt), which is the spec for *media/fields*, not primary pills.

### 3.2 Inconsistent press feedback

`scaleValue` appears in 521 matches across `frontend/src`, but the values are inconsistent: `0.985` (AppButton, PremiumActionBar), `0.97` (ActionDock), and *missing* (PremiumActionFooter, HoldToSubmitButton). AGENTS.md §17 specifies `0.97–0.985` and §27.9 specifies `0.95–0.97 + spring back`. The codebase splits the difference with no rationale. `0.985` is barely perceptible on a 52pt button (~0.8pt of shrink); `0.97` is the flagship value.

### 3.3 Missing haptics

`AppButton` defaults to `'none'`. `PremiumActionFooter` omits haptics entirely. `HoldToSubmitButton` fires `heavy` only on completion — there is no `light` selection haptic on initial press, no progress tick haptic during the hold. The 2026 standard (VP0 Journal; UX Collective; Singtel) is to map haptics to *intent*: selection for navigation, light for low-risk taps, medium for commitment (buy/bid/offer/send), success for completion, error/warning for failure. ThryftVerse has no central haptic language — each component invents its own.

### 3.4 2020-era shadows

`FlagshipActionCluster` applies `Elevation.floating` (`...Elevation.floating`, `:91`) to *every primary button* via `primaryShadow`. `Elevation.floating` is `{ shadowOpacity: 0.12, shadowRadius: 16, elevation: 8 }` (Design.md elevation scale) — that is the shadow spec for **FABs and overlays**, not routine primary buttons. Design.md §"Avoid" explicitly lists "shadows on every card" and the AGENTS.md §4 chrome budget says shadows are not how elevation is earned. A primary button in a sticky dock does not need a floating shadow; the dock's own `Elevation.floating` (`ActionDock.tsx:242`) already separates it from scroll content. The button-on-button shadow is a 2020-era affordance crutch.

### 3.5 Inconsistent radii

687 matches for `borderRadius.*999|borderRadius.*full` across `frontend/src` — the codebase mixes full-pill and 12pt radii freely. Design.md is explicit: `button-primary` = `Radius.full` (999px); `button-quiet` = `Radius.full`. But every production action bar uses `Radius.lg` (12pt). Meanwhile `HoldToSubmitButton` uses `Radius.md` (8pt). Three different radii for the same conceptual component family violates the AGENTS.md §4 radius budget ("no more than two non-avatar radius sizes in one viewport") and the stroke-grammar rule against mixing arbitrary values in the same family.

### 3.6 Missing / inconsistent disabled & loading states

- Disabled opacity: `0.52` (AppButton), `0.4` (PremiumActionBar primary), `0.35` (PremiumActionBar secondary), `0.45` (PremiumActionFooter), `colors.surfaceAlt` background swap (HoldToSubmitButton). Five different disabled treatments.
- Loading: `AppButton` swaps content for an `ActivityIndicator` (`:146`); `PremiumActionBar` does the same (`:63`); `ActionDock` does the same (`:198`); `HoldToSubmitButton` has *no loading state* — it only has a hold progress ring.
- **No success or error state** exists on any button. AGENTS.md §27.9 and §27.4 specify "Success: Spring celebration + success notification haptic" and "Error: Shake + inline message." A flagship buy/offer/bid button should transition to a success state (checkmark + success haptic) or error state (shake + error haptic + inline message) — none of the current systems support this.

### 3.7 1,825 raw Pressable / TouchableOpacity usages in screens

`grep` for `Pressable|TouchableOpacity` across `frontend/src/screens` returns **1,825 matches**. These are screen-level ad-hoc buttons that bypass every shared component. Each one is a potential defect: missing accessibility label, missing press feedback, missing haptic, sub-44pt hit area, or a one-off radius/colour. This is the single largest source of button inconsistency in the product. The AGENTS.md §4 rule ("if three or more screens exhibit the same visual defect, inspect and correct the shared primitive first") applies directly: the shared primitive (`AppButton`) is not capable enough, so screens compensate with raw `Pressable`s.

### 3.8 Secondary-button spacing in ActionDock

`ActionDock.tsx:257` sets `secondaryRow` `gap: Space.xs` (4px). 72Technologies' field data shows 4pt gaps produce ~11% mistap rates; 12pt gaps drop it to ~2%. The secondary icon buttons are 44pt targets (`:261`) but only 4pt apart — adjacent thumbs will misfire.

---

## 4. Micro Improvements — Per-Button Changes with Exact Token Values

### AppButton (`components/ui/AppButton.tsx`)

| Property | Current | Target | Rationale |
|----------|---------|--------|-----------|
| Primary radius | `Radius.lg` (12) `:192` | `Radius.full` (999) | Design.md `button-primary.rounded` |
| Primary height | 52pt `:191` | 52pt | Already correct |
| Press scale | `0.985` `:138` | `0.97` | AGENTS.md §27.9 flagship |
| Default haptic | `'none'` `:112` | `'light'` for non-primary, `'medium'` for primary | Intent mapping |
| Disabled opacity | `0.52` `:183` | `0.4` | Design.md dock spec; parity with PremiumActionBar |
| Loading | `ActivityIndicator` only `:146` | `ActivityIndicator` + label fade, button keeps geometry | No layout shift |
| Success state | *missing* | Checkmark spring + `success` haptic, 800ms then reset | AGENTS.md §27.9 |
| Error state | *missing* | Shake (translateX ±4pt, 3 cycles, 200ms) + `error` haptic + inline message | AGENTS.md §27.9 |
| `sm` radius | `Radius.md` (8) `:187` | `Radius.full` | Pill consistency across sizes |
| `lg` radius | `Radius.xl` (16) `:198` | `Radius.full` | Pill consistency |

### PremiumActionBar (`components/ui/PremiumActionBar.tsx`)

| Property | Current | Target | Rationale |
|----------|---------|--------|-----------|
| Primary radius | `Radius.lg` `:115` | `Radius.full` | Design.md |
| Primary height | 54pt `:116` | 52pt | Parity with AppButton/Design.md |
| Secondary radius | `Radius.lg` `:129` | `Radius.full` | Design.md `button-quiet` |
| Secondary height | 48pt `:130` | 44pt | Design.md `button-quiet.height` |
| Secondary border | 1px `colors.border` `:133` | transparent, `colors.textPrimary` label | Quiet = transparent per Design.md |
| Disabled opacity (primary) | `0.4` `:121` | `0.4` | Keep |
| Disabled opacity (secondary) | `0.35` `:138` | `0.4` | Parity |
| **Action: deprecate, delegate to AppButton** | — | Replace internals with `<AppButton variant="primary">` + `<AppButton variant="ghost">` | One-button-system architecture (§5) |

### PremiumActionFooter (`components/ui/PremiumActionFooter.tsx`)

| Property | Current | Target | Rationale |
|----------|---------|--------|-----------|
| Press scale | *missing* `:46-56` | `0.97` | AGENTS.md §13 failure |
| Haptic | *missing* | `medium` (primary), `light` (secondary) | Intent mapping |
| Primary bg | `colors.textPrimary` `:106` | `colors.brand` | Design.md `button-primary` |
| Primary text colour | `colors.background` `:116` | `colors.textInverse` | Semantic token |
| Top border width | `1` `:85` | `StyleSheet.hairlineWidth` | Parity with PremiumActionBar `:93` |
| **Action: deprecate, delegate to AppButton** | — | Same as PremiumActionBar | One-button-system |

### ActionDock (`components/ui/ActionDock.tsx`)

| Property | Current | Target | Rationale |
|----------|---------|--------|-----------|
| Primary radius | `Radius.lg` `:275` | `Radius.full` | Design.md dock spec: "full-pill `Radius.full` for primary" |
| Secondary gap | `Space.xs` (4) `:257` | `Space.sm` (8) | 72Technologies mistap data |
| Primary press scale | `0.97` `:189` | `0.97` | Already flagship |
| Secondary press scale | `0.97` `:154` | `0.97` | Keep |
| Secondary radius | none (icon/text only) | `Radius.full` when text label | Design.md dock spec: "`Radius.xl` for secondary" — use full-pill for text, transparent for icon |
| Loading | `ActivityIndicator` only `:198` | Spinner + keep label faded behind | No layout shift |
| Success/error | *missing* | Delegate to AppButton internals | §5 architecture |

### HoldToSubmitButton (`components/ui/HoldToSubmitButton.tsx`)

| Property | Current | Target | Rationale |
|----------|---------|--------|-----------|
| Base component | raw `Pressable` `:114` | `AnimatedPressable` | Press feedback parity |
| Press scale | *none* | `0.97` on press-in, spring back on release | AGENTS.md §27.9 |
| Radius | `Radius.md` (8) `:150` | `Radius.full` | Primary pill consistency |
| Height | 48pt min `:155` | 52pt | Parity with primary family |
| Hold progress haptic | *none* during hold | `light` tick at 50% progress | 2026 haptic synthesis (Lucky Graphics, https://lucky.graphics/learn/haptic-synthesis-mobile-ui/) |
| Press-in haptic | *none* | `light` selection | Confirm contact |
| Completion haptic | `heavy` `:61` | `success` pattern | Intent = completion, not force |
| Loading state | *missing* | Spinner + disabled, keep geometry | §6 state coverage |
| Disabled treatment | `colors.surfaceAlt` bg + `textMuted` `:106-107` | `colors.brand` at 0.4 opacity | Parity with primary family; surfaceAlt reads as a different component |

### FlagshipActionCluster (`components/flagship/FlagshipActionCluster.tsx`)

| Property | Current | Target | Rationale |
|----------|---------|--------|-----------|
| Primary shadow | `Elevation.floating` on every primary `:91` | Remove; let the dock/container carry elevation | Design.md "Avoid shadows on every card" |
| Haptic logic | `danger → heavy, else medium` `:56` | Delegate to AppButton variant defaults | One haptic language |

---

## 5. Macro Improvements — One-Button-System Architecture

### 5.1 The contract

There should be **one button primitive** (`AppButton`) that every action surface composes. The action bars and docks become *layout wrappers*, not button re-implementations. The contract:

```
AppButton
  ├─ variant: primary | secondary | danger | ghost | tonal
  ├─ size: sm | md | lg
  ├─ states: default | pressed | disabled | loading | success | error
  ├─ press: scale 0.97 + spring back + haptic(intent)
  └─ geometry: Radius.full pill, height by size, 44pt min hit target

Layout wrappers (compose AppButton, do not re-style it):
  ├─ FlagshipActionCluster  — in-flow stacked/row action group
  ├─ FlagshipStickyFooter   — opaque sticky dock (utility surfaces)
  ├─ ActionDock             — Liquid Glass sticky dock (commerce detail)
  ├─ HoldToSubmitButton     — AppButton + hold gesture + progress ring
  └─ PremiumActionBar/Footer — DEPRECATE → migrate callers to ActionDock or FlagshipStickyFooter
```

### 5.2 Button variant contract

| Variant | Fill | Text | Border | Use case |
|---------|------|------|--------|----------|
| `primary` | `colors.brand` | `colors.textInverse` | none | One per logical step; buy, bid, offer, publish |
| `secondary` | `colors.surface` | `colors.textPrimary` | 1px `colors.border` | Alternative action in a 2-action dock |
| `tonal` | `colors.surfaceAlt` | `colors.textPrimary` | none | Tertiary contained action; filter apply |
| `ghost` | transparent | `colors.textPrimary` | none | Quiet action; cancel, back, share |
| `danger` | `colors.danger` | `colors.textInverse` | none | Destructive primary; delete, withdraw |

### 5.3 Press feedback language

All buttons use `AnimatedPressable` with:
- `scaleValue: 0.97` (flagship per AGENTS.md §27.9)
- spring back: `tap` config (damping 18, stiffness 280, mass 0.8) per AGENTS.md §27.3
- `activeOpacity: 0.9` as a secondary visual layer
- reduced-motion: instant scale restore, no spring

### 5.4 Haptic language

Map haptics to *intent*, not component (VP0 Journal; UX Collective; Singtel):

| Intent | Haptic | Example |
|--------|--------|---------|
| Selection / navigation | `selection` | Tab switch, filter tap |
| Low-risk tap | `light` | Like, save, share, secondary button |
| Commitment | `medium` | Buy, bid, offer, send, publish |
| Completion | `success` | Purchase confirmed, listing published |
| Failure | `error` | Payment failed, publish failed |
| Destructive confirm | `heavy` | Hold-to-delete completion |
| Progress threshold | `light` tick | Hold-to-submit at 50% progress |

`AppButton` should derive its default haptic from variant: `primary → medium`, `secondary/tonal/ghost → light`, `danger → heavy`. Call sites can override for completion/failure flows.

### 5.5 Loading state design

- Replace label with `ActivityIndicator` (size small, colour = title colour).
- **Keep the button's geometry** — do not shrink/expand height or radius.
- Fade label out (opacity 0 → 0 over 100ms) before spinner appears to avoid a pop.
- Disable press (`disabled || loading`).
- Accessibility: `accessibilityState={{ busy: true }}` plus the existing `disabled` state.
- For `HoldToSubmitButton`, loading replaces the progress ring with a spinner and the label with "Processing…".

### 5.6 Success & error states

- **Success:** label swaps to a checkmark icon + "Done" (or the action's past tense) for 800ms, `success` haptic fires, then the button resets or navigates. Spring config: `success` (damping 12, stiffness 120) per AGENTS.md §27.3.
- **Error:** button shakes (translateX ±4pt, 3 cycles, 200ms total), `error` haptic fires, label keeps original text, an inline error message appears below the dock (the existing `errorBanner` pattern in PremiumActionBar is the right shape). The button returns to default after the shake.

---

## 6. Flagship Acceptance Criteria

### 6.1 Thumbnail test (25% scale)

At thumbnail size, the primary action must be the single most dominant non-media object. Repeated rounded rectangles of equal weight must not dominate the silhouette. After upgrade:
- One filled pill per viewport reads as the clear primary.
- Secondary/ghost buttons recede (transparent or surface fill).
- The sticky dock reads as a *dock*, not as a stack of equal buttons.

### 6.2 Squint test

Under blur, the primary button's fill is the only strong non-media colour block in the action zone. Chrome (borders, shadows, icons) recedes. Media and price dominate above the dock.

### 6.3 Surface / stroke / radius budgets (AGENTS.md §4)

- **Surface budget:** the sticky dock is the one dominant non-media panel. Buttons inside it are not separate surfaces — they are controls within the dock.
- **Stroke budget:** primary and danger buttons have *no border* (fill is the boundary). Secondary has 1px `colors.border`. Ghost has no border. No 0.5/1.5/2pt mixing.
- **Radius budget:** `Radius.full` (999) for all buttons (primary, secondary, ghost, danger). `Radius.xl` (16) for the dock container. Two non-avatar radii per viewport — satisfied.

### 6.4 State coverage

Every button variant must implement all six states:

| State | Visual | Haptic | Press enabled |
|-------|--------|--------|---------------|
| Default | variant fill | — | yes |
| Pressed | scale 0.97 + opacity 0.9 | intent haptic | — |
| Disabled | 0.4 opacity, no press | none | no |
| Loading | spinner, geometry preserved, label faded | none | no |
| Success | checkmark + "Done", 800ms | `success` | no |
| Error | shake ±4pt, 3 cycles, 200ms | `error` | yes (retry) |

### 6.5 Touch target & separation

- Minimum 44pt hit target on every button (AGENTS.md §13; Apple HIG).
- 48dp on Android (Material 3; MobileViewer).
- 56pt for any floating action button (Android FAB docs).
- Adjacent targets ≥8pt apart (72Technologies mistap data).

### 6.6 Accessibility

- `accessibilityRole="button"` on every button.
- `accessibilityLabel` defaults to the title; icon-only buttons *must* supply a label (AGENTS.md §13).
- `accessibilityState` reflects `disabled`, `busy` (loading), `selected` (toggle).
- Contrast ≥4.5:1 for text on fill (WCAG AA; UXPin; SubUX).
- Haptics never the sole signal — always paired with visual feedback (VP0 Journal).

---

## 7. Priority & Sequencing

### Phase 1 — Unify the primitive (highest impact, blocks everything)
1. Upgrade `AppButton` to the full variant contract (§5.2), press language (§5.3), haptic language (§5.4), loading (§5.5), success/error states (§5.6). Radius → `full`, scale → `0.97`, default haptics by variant.
2. Add `tonal` variant.
3. Remove `Elevation.floating` from `FlagshipActionCluster` primary buttons.

### Phase 2 — Migrate the docks
4. `ActionDock`: primary radius → `full`, secondary gap → `Space.sm`, delegate button rendering to `AppButton`.
5. `FlagshipStickyFooter`: already delegates to `FlagshipActionCluster` → `AppButton`; verify after Phase 1.
6. `HoldToSubmitButton`: rebuild on `AnimatedPressable`, radius → `full`, height → 52pt, add press scale, progress haptic, loading state.

### Phase 3 — Deprecate duplicates
7. Mark `PremiumActionBar` and `PremiumActionFooter` as deprecated. Migrate callers to `ActionDock` (commerce detail) or `FlagshipStickyFooter` (utility). Delete the duplicates once no imports remain.

### Phase 4 — Screen-level cleanup
8. Audit the 1,825 `Pressable`/`TouchableOpacity` usages in `frontend/src/screens`. Replace ad-hoc buttons with `AppButton` or `AnimatedPressable` + accessibility label + press scale + haptic. Prioritise checkout, product detail, profile, and auction surfaces first (highest transactional risk).

### Phase 5 — Verification
9. TypeScript pass.
10. Device validation: test every variant × state in light/dark on compact (360pt) and large (430pt) phones.
11. Thumbnail + squint tests on every screen that shows a primary CTA.

---

## 8. Token-Level Spec Table

The canonical spec for every button variant in the unified system. All values derive from Design.md front matter and `theme/designTokens.ts`.

| Variant | Height | Radius | Typography | Fill | Text | Border | Press scale | Haptic (default) | Disabled opacity | Loading |
|---------|--------|--------|------------|------|------|--------|-------------|------------------|------------------|---------|
| `primary` | 52pt | `Radius.full` (999) | `Type.bodyEmphasis` (15/21/600) | `colors.brand` | `colors.textInverse` | none | `0.97` | `medium` | `0.4` | spinner, geometry kept |
| `primary` lg | 56pt | `Radius.full` | `Type.bodyLarge` (17/24/700) | `colors.brand` | `colors.textInverse` | none | `0.97` | `medium` | `0.4` | spinner, geometry kept |
| `primary` sm | 44pt | `Radius.full` | `Type.body` (14/20/600) | `colors.brand` | `colors.textInverse` | none | `0.97` | `medium` | `0.4` | spinner, geometry kept |
| `secondary` | 48pt | `Radius.full` | `Type.bodyEmphasis` | `colors.surface` | `colors.textPrimary` | 1px `colors.border` | `0.97` | `light` | `0.4` | spinner, geometry kept |
| `tonal` | 44pt | `Radius.full` | `Type.bodyEmphasis` | `colors.surfaceAlt` | `colors.textPrimary` | none | `0.97` | `light` | `0.4` | spinner, geometry kept |
| `ghost` (quiet) | 44pt | `Radius.full` | `Type.bodyEmphasis` | transparent | `colors.textPrimary` | none | `0.97` | `light` | `0.4` | spinner, geometry kept |
| `danger` | 52pt | `Radius.full` | `Type.bodyEmphasis` | `colors.danger` | `colors.textInverse` | none | `0.97` | `heavy` | `0.4` | spinner, geometry kept |
| `danger` ghost | 44pt | `Radius.full` | `Type.bodyEmphasis` | transparent | `colors.danger` | none | `0.97` | `light` | `0.4` | spinner, geometry kept |
| `hold-to-submit` | 52pt | `Radius.full` | `Type.bodyEmphasis` | `colors.brand` | `colors.textInverse` | none | `0.97` on press-in | `light` press, `light` tick @50%, `success` on complete | `0.4` (brand fill) | spinner + "Processing…" |
| FAB (if needed) | 56pt | `Radius.full` (circle) | — | `colors.brand` | `colors.textInverse` | none | `0.97` | `medium` | `0.4` | spinner |

### Dock container spec

| Property | Value | Source |
|----------|-------|--------|
| `ActionDock` background | `LiquidGlassBackdrop` (iOS 26) / `colors.background` (Reduce Transparency / Android) | `ActionDock.tsx:132-140` |
| `ActionDock` min height | `DockConstants.baseHeight` (72pt) | Design.md `dock-geometry` |
| `ActionDock` top border | `StyleSheet.hairlineWidth` `colors.border` | `ActionDock.tsx:240` |
| `ActionDock` elevation | `Elevation.floating` | `ActionDock.tsx:242` |
| `FlagshipStickyFooter` background | `colors.background` | `FlagshipStickyFooter.tsx:27` |
| `FlagshipStickyFooter` top border | `StyleSheet.hairlineWidth` `colors.border` | `FlagshipStickyFooter.tsx:41` |
| `FlagshipStickyFooter` elevation | none (opaque utility dock) | Design.md "Sticky dock shadow only when it separates persistent action from scroll content" |
| Safe-area bottom | `Math.max(insets.bottom, Space.md)` | `FlagshipStickyFooter.tsx:29` |
| Primary button in dock | `flex: 1`, `Radius.full`, 52pt | Design.md dock spec |
| Twin CTA split | equal width or 40/60 (primary wider), 8pt gap | Design.md dock spec |

### Press & motion spec

| Property | Value | Source |
|----------|-------|--------|
| Press scale | `0.97` | AGENTS.md §27.9 |
| Spring config | `tap`: damping 18, stiffness 280, mass 0.8 | AGENTS.md §27.3 |
| Press feedback duration | 50–100ms | AGENTS.md §27.2 |
| Spring back duration | 100–200ms | AGENTS.md §27.2 |
| Reduced motion | instant restore, no spring | AGENTS.md §17 |
| Success spring | `success`: damping 12, stiffness 120, mass 1.0, 800ms | AGENTS.md §27.3 |
| Error shake | translateX ±4pt, 3 cycles, 200ms | AGENTS.md §27.9 |

---

## Sources

- AGENTS.md §4 (Push to Maximum Quality), §11 (Truthful UI), §13 (Control Quality), §17 (Motion and Interaction), §27 (2026 Flagship UX Psychology Principles) — `C:\Users\User\Desktop\thryftverse-upgrade\AGENTS.md`
- Design.md `components.button-primary`, `components.button-quiet`, `dock-geometry`, "Visible chrome is not the hit target", "Sticky action dock micro spec", "Shape, stroke and surface budget", press scale motion — `C:\Users\User\Desktop\thryftverse-upgrade\Design.md`
- UXPin, "Button States Explained: The Complete Design Guide for 2026" — https://www.uxpin.com/studio/blog/button-states/
- 72Technologies, "Tap Targets and Thumb Zones: Beyond the 44px Rule" — https://www.72technologies.com/blog/tap-targets-thumb-zones-mobile-ux
- Rafa Queens, "How to Design Mobile App Buttons Users Can Spot, Understand, Tap, and Trust" — https://rafaqueens.com/how-to-design-mobile-app-buttons-users-can-spot-understand-tap-and-trust/
- MobileViewer, "Touch Target Size: Google's Guidelines for Mobile Buttons" — https://www.mobileviewer.io/blog/touch-target-size
- ProCreator, "Button Design Rules for Better UX" — https://procreator.design/blog/basic-rules-button-design-website-app/
- Android Developers, "Material Design 3 in Compose" — https://developer.android.com/develop/ui/compose/designsystems/material3
- Material Components, "CommonButton — M3 Expressive update" — https://github.com/material-components/material-components-android/blob/master/docs/components/CommonButton.md
- Android Developers, "MaterialExpressiveTheme" — https://developer.android.com/reference/kotlin/androidx/compose/material3/MaterialExpressiveTheme.composable
- UX Collective (Igor Dolgov), "Haptics: how to build a consistent cross-platform solution" (Apr 15, 2026) — https://uxdesign.cc/haptics-how-to-build-a-consistent-cross-platform-solution-and-align-code-with-figma-5990a24a2fbd
- Lucky Graphics, "Haptic Synthesis in Mobile UI: The Tactile Frontier" — https://lucky.graphics/learn/haptic-synthesis-mobile-ui/
- Singtel Experience Design, "Designing the unseen: Introducing motion design and haptics in a Design System" (Mar 11, 2026) — https://medium.com/singtel-experience-design/designing-the-unseen-introducing-motion-design-and-haptics-in-a-design-system-6994d51d8d06
- SWMansion, "iOS vs Android Haptics: Why the Gap Exists" — https://swmansion.com/blog/what-is-the-difference-between-i-os-and-android-haptics/
- VP0 Journal, "Haptic Feedback UI Guidelines for iOS" — https://vp0.com/blogs/haptic-feedback-ui-design-guidelines-ios
- SubUX, "Button hierarchy (primary, secondary, tertiary)" — https://subux.pro/guides/article/button-hierarchy-primary-secondary-tertiary
- Microsoft Fluent 2, "iOS Button" — https://fluent2.microsoft.design/components/ios/core/button/usage
- Infor Design System, "Button Group" — https://design.infor.com/patterns/interactions/button-group/
- Slickplan, "Website Button Design Guide 2026" — https://slickplan.com/blog/designing-buttons-for-the-web-guide-examples
- Accor Design System, "Button Usage" — https://design.accor.com/latest/web/core-components/button/usage-b5SKXU8g
- Randstad Design, "Button Hierarchy" — https://randstad.design/design-patterns/button-hierarchy/
- Google Design, "FAB: UX Design Win" — https://design.google/library/absolutely-fab-button
- Android Developers, "Floating action button" — https://developer.android.com/develop/ui/compose/components/fab
- ASOasis, "Building an Accessible React Floating Action Button" (May 30, 2026) — https://asoasis.tech/articles/2026-05-30-0838-react-floating-action-button-component/
- UXPin, "What Is Mobile UI? Principles, Patterns, and Best Practices (2026)" — https://www.uxpin.com/studio/blog/what-is-mobile-ui/
- Levri, "Your mobile checkout is leaking" — https://www.levri.ai/guide/mobile-checkout-optimization
- ConvertCart, "Mobile Checkout Optimization" — https://www.convertcart.com/blog/mobile-checkout-optimization
- BTNG.studio, "Mobile Checkout Optimization: UX Fixes and Real Benchmarks" — https://www.btng.studio/articles/mobile-checkout-optimization-guide/
- CartyLabs, "Shopify Checkout UX Best Practices: 30 Design Principles for 2026" — https://cartylabs.com/blog/shopify-checkout-ux-best-practices/
- Corefy, "Mobile Checkout UI: Principles & Best Practices" — https://corefy.com/blog/mobile-checkout-ui
- Stripe, "Mobile checkout UI: Best practices for businesses" — https://stripe.com/au/resources/more/mobile-checkout-ui
- Refero Styles, "Pinterest design system" — https://styles.refero.design/style/8ff3bfb4-6f5e-4e07-83be-56e62ce80d2f
- superloopy design tokens, "Pinterest — Design Tokens" — https://github.com/beefiker/superloopy/blob/main/skills/superloopy-frontend/references/design/pinterest.md
- Nandini Dunaka, "UI Comparison Series 5/7 — Instagram vs Snapchat (Camera Screen)" (Jan 11, 2026) — https://www.linkedin.com/posts/nandini-dunaka-4a1a53351_uiux-uicomparison-uxdesign-activity-7416109291926941696-aCdb
- Autogram, "Instagram Contact & CTA Buttons 2026" — https://autogram.dev/blog/instagram-cta-buttons-complete-guide-2026
