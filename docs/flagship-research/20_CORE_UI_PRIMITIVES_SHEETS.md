# 20 — Core UI Primitives & Sheets

**Department:** Core UI primitives — `components/ui` (25 files), `components/sheets` (5 files)
**Scope:** Bottom sheets, modals, toasts, buttons, inputs, chips, badges, dividers — the cross-cutting foundation every screen depends on.
**Date:** August 2026
**Status:** Research report — flagship upgrade programme

---

## 1. 2026 Competitor Benchmark

The 2026 mobile primitive landscape is defined by two converging platform languages — **iOS 26 Liquid Glass** and **Android 16 Material 3 Expressive** — and by a cohort of social-commerce apps (Instagram, Pinterest, eBay, Snapchat, Depop, Vinted) that have hardened their primitive sets into deliberately small, role-specialised vocabularies. The through-line across every benchmark is **restraint at the primitive layer**: fewer components, each with a tighter contract, each mapped to a specific semantic job.

### 1.1 Platform primitive languages

**Apple iOS 26 (Liquid Glass).** Apple's March 2026 HIG update tightened two pieces of guidance directly relevant to this department: *Sheets* guidance now prescribes button placement rules (primary action pinned, secondary restrained, destructive separated), and *Buttons* guidance re-emphasises that colour belongs on controls and actions, not on container chrome ([Apple Design What's New](https://developer.apple.com/design/whats-new)). The WWDC26 session *Communicate your brand identity on iOS* makes the philosophy explicit: "move color into the content area… colour is often seen on controls and actions… intentional use of colour communicates status, feedback, and selection states" ([WWDC26/251](https://developer.apple.com/videos/play/wwdc2026/251/)). The Liquid Glass material itself is scoped — Apple repeatedly warns it is for *navigation bars, floating controls, and compact panels*, never a blanket wrapper. That maps cleanly onto AGENTS.md §27.5 and §4's "surface budget."

**Android 16 Material 3 Expressive.** Google's CHI 2026 study (*Usability Hasn't Peaked*) measured 48 participants across 10 apps and found M3 Expressive designs produced **33% faster fixation on the correct element, 20% faster task completion, and higher aesthetic ratings** versus prior Material ([Google Research, CHI '26](https://research.google/pubs/usability-hasnt-peaked-exploring-how-expressive-design-overcomes-the-usability-plateau/)). Three primitive-level shifts matter for ThryftVerse:

1. **Motion is now a first-class token.** Buttons do not just change colour — they physically respond with spring-based displacement (translateZ on press). Durations are context-aware (50–150ms feedback, 200–400ms standard) rather than fixed cubic-beziers ([Sabaoon, Material Expressive 2026](https://www.sabaoon.dev/blog/material-expressive)).
2. **Radii moved up.** Buttons shifted from 12dp → 16dp, cards from 4dp → 20dp. Touch targets are strictly enforced at 48dp. Hardcoded radii are now a liability ([Suridevs, M3 Expressive Compose guide](https://www.suridevs.com/blog/posts/google-material-3-expressive-android-16/)).
3. **Tactile surfaces replace flat shadows.** Press = translate *into* the surface with a flatter shadow; rest = subtle lift. Shadows communicate state change, not decoration.

**Chip grammar (Android).** Material 3 codifies *four* chip roles — **assist, filter, input, suggestion** — each with a distinct interaction contract ([Android Chip guidance](https://developer.android.com/develop/ui/compose/components/chip)). The discipline is naming: calling everything a "badge" because it looks small and rounded is how inconsistent behaviour creeps in.

### 1.2 Social-commerce primitive patterns

**Pinterest Gestalt** is the canonical image-first system: masonry layout primitives, a motion language tuned for image-heavy surfaces (fades, scale-ins, shimmer placeholders as first-class), and an internally consistent icon set with per-component accessibility documentation more complete than most peers ([Gestalt breakdown](https://www.designsystems.one/design-systems/gestalt)). The lesson for ThryftVerse: primitives must be tuned to the *content type* (media-led discovery), not generic.

**eBay Evo** (Feb 2026 playbook) is the strongest governance benchmark: "Brand, design system, engineering, and accessibility live together. Not linked. Not mirrored. Together. One space. One language." Component status is *honest* — alpha/beta/stable/deprecated is visible, and accessibility is embedded directly into components, colour-coded green/yellow/red ([eBay Evo Playbook](https://uiuxshowcase.com/resources/evo-ebay-design-playbook/)). This is the model for ThryftVerse's deprecation path (§5).

**Snapchat Valdi** demonstrates the performance ceiling: declarative TS compiles to native views with automatic view recycling, powering Snap's production apps for 8 years ([Snapchat/Valdi](https://github.com/snapchat/valdi)). The primitive-level takeaway: view recycling and stable identity are not optional at flagship scale.

**Instagram** (per AGENTS.md §27.6 analysis) and **Depop/Vinted** converge on the same button/sheet grammar: one dominant primary action per surface, secondary actions as restrained icon-only or text-only controls, bottom sheets as the default overlay (not centred modals), and chips reserved for *filtering*, not decoration.

### 1.3 Bottom sheet patterns (2026)

NN/g's bottom-sheet research remains the canonical reference: sheets are a form of **progressive disclosure** that preserve the user's current context, and they are *especially* useful when users need to refer to background information while interacting ([NN/g, Bottom Sheets](https://www.nngroup.com/articles/bottom-sheet/)). The 2026 consensus across iOS/Android native and the Mobile App Wiki:

- **Detents** are the standard: peek (15–25%), half (~50%, default), expanded (90–95%) ([Mobile App Wiki](https://mobileapp.wiki/en/uiux/bottom-sheet-modal-guide)).
- **Closing indicators** differ by platform: Android uses a drag handle; iOS uses a grabber + tap-outside + drag-from-top ([designfornative.com](https://designfornative.com/bottom-sheets-vs-fullscreen-modals/)).
- **Modal vs non-modal** is a deliberate choice: modal sheets dim/disable background (focus tasks, confirmations); non-modal/collapsible sheets allow background interaction (Maps-style results) ([designfornative.com](https://designfornative.com/bottom-sheets-vs-fullscreen-modals/)).
- **Sheets reduce cognitive load** versus page navigation because they avoid spatial reorientation and working-memory burden ([LogRocket, bottom sheet UX](https://blog.logrocket.com/ux-design/bottom-sheets-optimized-ux/)).

ThryftVerse's `BottomSheet` engine already implements variant-aware material grammar (system/form/inspector/transaction/immersive) — this is ahead of most competitors. The gap is in *adoption and enforcement*, not architecture.

---

## 2. Psychology & Principles

### 2.1 Consistency = trust

Primitives are the *vocabulary* of the product. When the same action (a primary button) renders with three different radii, three different heights, and three different press behaviours across the app, the user's subconscious inference is not "this app has variety" — it is "this app was assembled by different people who didn't talk to each other." That inference generalises: *if the buttons are inconsistent, maybe the payments are too.* Per AGENTS.md §27.1, Don Norman's reflective level of emotional design is driven by trust signals — and primitive consistency is the most pervasive trust signal in the product.

### 2.2 Cognitive load reduction

Every visual variation the user encounters is a tiny parsing cost. NN/g's research on bottom sheets frames this precisely: the value of a sheet over a page is that it *preserves context*, reducing the working-memory burden ([NN/g](https://www.nngroup.com/articles/bottom-sheet/)). The same logic applies to primitives: when every primary button looks and behaves identically, the user spends zero cognitive budget on "what is this control?" and 100% on the decision. The M3 Expressive CHI 2026 result — 33% faster fixation, 20% faster task completion — is the quantitative proof that primitive consistency is a performance feature, not an aesthetic preference ([CHI '26](https://research.google/pubs/usability-hasnt-peaked-exploring-how-expressive-design-overcomes-the-usability-plateau/)).

### 2.3 The "one language" feeling

eBay Evo's "one space, one language" principle is the flagship bar ([eBay Evo](https://uiuxshowcase.com/resources/evo-ebay-design-playbook/)). The user should never be able to tell that Screen A was built by a different engineer than Screen B. This is only achievable when the primitive layer is *small, complete, and mandatory* — when there is exactly one button, one input, one sheet engine, one chip, one badge, and every screen composes from that set.

### 2.4 Affordance clarity

A primary button must *look* primary. A destructive action must *look* destructive and be *separated* (AGENTS.md §13). A chip must *look* tappable; a badge must *look* informational, not actionable. The Eleken badge-ui research crystallises the distinction: "the moment a user can click it, filter with it, or remove it — it's a chip or a tag. Calling everything a 'badge' because it looks small and rounded is how you end up with inconsistent behaviour" ([Eleken, Badge UI](https://www.eleken.co/blog-posts/badge-ui-design)). ThryftVerse currently violates this naming discipline (see §3).

### 2.5 Friction tuning via primitive choice

Primitive choice *is* friction tuning. A `TransactionSheet` with a pinned confirm footer and a `HoldToSubmitButton` creates deliberate friction for irreversible financial actions. An `ActionSheet` with a quick tap-to-dismiss creates low friction for reversible choices. A `FormSheet` with a stable title bar and Save/Done actions creates medium friction for editing. The primitive *is* the interaction contract — which is why having the right sheet for the right job (and not using `BottomSheet` directly) matters.

---

## 3. Current ThryftVerse Audit

The audit read all 25 `components/ui` files and all 5 `components/sheets` files in full, plus the `BottomSheet` engine and `designTokens.ts`. The architecture is *conceptually sound* — there is a token system, a sheet engine with variant grammar, and a set of named primitives. The defects are in **duplication, drift, and enforcement**, not in the foundational thinking.

### 3.1 Duplicate button components (3 button systems)

ThryftVerse ships **three** overlapping button implementations:

1. **`AppButton`** (`components/ui/AppButton.tsx:94`) — 4 variants (primary/secondary/danger/ghost), 3 sizes (sm/md/lg), scale 0.985 press, haptic-aware, token-driven. This is the canonical button and the best of the three.
2. **`PremiumActionBar`** (`components/ui/PremiumActionBar.tsx:27`) — a sticky footer with a primary + optional secondary button, brand-coloured, scale 0.985, haptic medium/light. Near-duplicate of `PremiumActionFooter`.
3. **`PremiumActionFooter`** (`components/ui/PremiumActionFooter.tsx:24`) — *the same* sticky footer with primary + optional secondary, but **no scale animation, no haptic**, `colors.textPrimary` background instead of `colors.brand`, and `borderTopWidth: 1` instead of `hairlineWidth`. This is a 2020-era button: static press, no haptic, inconsistent colour source.

**Defect:** `PremiumActionFooter` (`:46-62`) uses a plain `AnimatedPressable` with `activeOpacity={0.85}` and **no `scaleValue`, no `hapticFeedback`** — it is functionally a downgrade of `PremiumActionBar`. Two screens import `PremiumActionFooter`, others import `PremiumActionBar`. The user sees two different "primary action" buttons depending on which screen they're on. This is a §4 "three or more screens exhibit the same visual defect" trigger — the shared primitive must be corrected first.

Additionally, **`ActionDock`** (`components/ui/ActionDock.tsx:99`) is a *third* sticky-action surface (Liquid Glass, floating, used on detail screens). `ActionDock` is genuinely distinct (glass material, floating, leading slot), but the overlap with `PremiumActionBar`/`PremiumActionFooter` is real: all three render "primary + secondary action at the bottom." The taxonomy must be: `ActionDock` = floating glass dock for detail CTAs; `PremiumActionBar` = opaque sticky footer for forms/flows; `PremiumActionFooter` = **deprecate, fold into `PremiumActionBar`**.

### 3.2 Duplicate input components (3 input systems)

Three overlapping text-input implementations:

1. **`AppInput`** (`components/ui/AppInput.tsx:39`) — 3 appearances (filled/outline/underline), label/helper/error, prefix/suffix, token-driven, `Stroke.standard`/`Stroke.emphasis`. Canonical.
2. **`PremiumTextField`** (`components/ui/PremiumTextField.tsx:35`) — *same* 3 appearances, *same* label/helper/error, left icon + right action, `colors.surfaceAlt` fill (vs `AppInput`'s `colors.input`). Near-duplicate with a slightly different surface token and an extra `leftIcon`/`rightAction` slot.
3. **`PremiumInputShell`** (`components/ui/PremiumInputShell.tsx:30`) — *same* label/helper/error, left icon + right action, fixed `borderWidth: 1`, `colors.surfaceAlt` fill, no appearance switching. A subset of `PremiumTextField`.

**Defect:** Three components doing the same job with three different default fills (`colors.input` vs `colors.surfaceAlt` vs `colors.surfaceAlt`), three different min-heights (48 vs 52 vs 54), and three different disabled opacities (0.6 vs 0.55 vs 0.55). The user sees three different "text field" silhouettes across auth, settings, and forms. Per AGENTS.md §4 stroke grammar, this is a stroke-family violation: `AppInput` uses `Stroke.emphasis` on focus, `PremiumInputShell` uses a fixed `1`, `PremiumTextField` mixes both.

### 3.3 Duplicate status pill components (2 pill systems)

1. **`AppStatusPill`** (`components/ui/AppStatusPill.tsx:61`) — 5 tones (neutral/accent/positive/negative/warning), 2 sizes, `Radius.full` pill shape, hairline border, Ionicons icon.
2. **`PremiumStatusPill`** (`components/ui/PremiumStatusPill.tsx:78`) — 10 tones (active/sold/paid/shipped/delivered/refunded/pending/error/success/neutral), `Radius.md` rounded-rectangle (not a pill), `borderWidth: 1`, dot-or-icon.

**Defect:** Two "status pill" components with *different shapes* (full pill vs 8pt rounded rect), *different tone vocabularies*, and *different border weights* (hairline vs 1pt). `AppStatusPill` is a pill; `PremiumStatusPill` is a badge. They are not the same component and should not both be named "pill." Per Eleken's naming discipline, this is exactly the "call everything a badge" anti-pattern ([Eleken](https://www.eleken.co/blog-posts/badge-ui-design)).

### 3.4 Chip / badge / tag sprawl (no canonical primitive)

A grep for `Chip|Badge|Pill|Tag` across `components/` returned **119 files** with matches — and there is **no canonical `Chip`, `Badge`, or `Tag` component** in `components/ui/index.ts`. The barrel exports `AppStatusPill` and `PremiumStatusPill` (neither is a true chip), and `ActivityBadge` (`components/ui/ActivityBadge.tsx:111`) which is a domain-specific social-proof indicator with 8 hardcoded variants and hardcoded hex colours (`#FF6B35` at `:62`, `:89`). The remaining 116 files roll their own chip/badge/tag inline, producing arbitrary radii, arbitrary padding, and arbitrary tone palettes.

**Defect:** This is the single largest primitive gap. ThryftVerse has no `Chip` (interactive, filter/remove), no `Tag` (static category label), and no `Badge` (non-interactive status/count dot). Every screen invents its own. This guarantees the "inconsistent behaviour across your product" failure mode Eleken describes.

### 3.5 Inconsistent radius usage

`designTokens.ts:45-60` defines a clean `Radius` scale (none/sm/md/lg/xl/xxl/full). But the primitives do not consistently use it:

- `AppButton` sizes use `Radius.md`/`Radius.lg`/`Radius.xl` (`AppButton.tsx:188-198`) — three radii for three sizes, which is defensible but means a viewport with sm + md buttons shows two radii.
- `TransactionSheet.tsx:108,126` hardcodes `borderRadius: 8` for the primary/secondary footer buttons — **bypassing the token system entirely** and conflicting with `AppButton`'s `Radius.lg` (12). This is a direct §4 "radius budget" violation: the transaction sheet footer shows 8pt buttons while the rest of the app shows 12pt.
- `MediaStage.tsx:527` hardcodes `borderRadius: 28` for the center play button; `:819,825` hardcode `borderRadius: 2.5` for page-indicator dots. The dots are fine (sub-token detail), but the 28pt play button is an untracked radius.
- `PremiumStatusPill.tsx:113` uses `borderWidth: 1` (not `Stroke.standard`), while `AppStatusPill.tsx:94` uses `StyleSheet.hairlineWidth`. Two "pills," two stroke weights — a §4 stroke-grammar violation.

### 3.6 Shadow misuse

A grep for `shadowColor|shadowOpacity|shadowRadius|elevation:` in `components/ui` returned **zero matches** — meaning all shadowing is routed through `Elevation` tokens in `designTokens.ts:275` (`none/subtle/card/floating/modal`). This is *good*. However, `ElevatedSurface.tsx:64` applies `Elevation.card` and `Elevation.subtle` to the `elevated` and `subtle` variants — and `ElevatedSurface` is rarely used, while screens freely apply `Elevation.*` directly. The token system exists but is not *enforced* through a single surface primitive. AGENTS.md §4 is explicit: "shadows on every surface" is a decoration anti-pattern, and "no card-on-card composition" — but without enforcement, screens compensate by stacking `ElevatedSurface` and `PremiumFormCard` (which also has a border + radius but no shadow, `PremiumFormCard.tsx:49-56`).

### 3.7 Missing sheet variants & direct-engine usage

The sheet architecture is strong: `BottomSheet.tsx:59-95` defines 5 variant configs (system/form/inspector/transaction/immersive) with per-variant radius, shadow, backdrop opacity, and glass flag. The 4 semantic wrappers (`ActionSheet`, `FormSheet`, `InspectorSheet`, `TransactionSheet`) cover the common cases. **But:**

- **0 screens import from `components/sheets`** (the barrel). 8 imports use the named wrapper files directly; 8 imports use `components/BottomSheet` directly. The barrel re-export exists but is unused, and **8 screens bypass the semantic wrappers and call `BottomSheet` directly** — meaning they get `variant="system"` defaults rather than the task-appropriate material. This is the §7 canonical-implementation violation: the wrappers exist to encode material grammar, but callers ignore them.
- **No `Toast` primitive.** AGENTS.md §11 prohibits "Coming soon" toasts, but toasts themselves are a legitimate feedback channel and there is no canonical toast/snackbar component in `components/ui` or `components/sheets`. Screens that need transient feedback roll their own.
- **No `Modal` primitive** distinct from sheets. iOS HIG distinguishes form sheets from full-screen modals from centered modals; ThryftVerse only has bottom-anchored sheets. Full-screen media is handled by `MediaStage` + fullscreen viewers, but a centered confirmation modal does not exist canonically.
- **`BidSheet` and `BuyNowSheet` live in `components/ui`** (`BidSheet.tsx`, `BuyNowSheet.tsx`) — these are *domain sheets* (auction bidding, buy-now confirmation), not primitives. They are 535+ and 614+ lines respectively, they call `BottomSheet` directly with `blurIntensity={30}` (bypassing variant grammar), and they belong in a domain folder, not in the primitive layer. Their presence in `components/ui` pollutes the primitive barrel scope.

### 3.8 2020-era button styles

`PremiumActionFooter.tsx:46-62` is the clearest 2020-era artifact: no scale animation, no haptic, `activeOpacity` only, `colors.textPrimary` as the primary button background (a black-button-on-light pattern that predates the brand-coloured canonical `AppButton`). `TransactionSheet.tsx:73-89` similarly uses a plain `Pressable` with no scale/haptic for the confirm action — a financial confirmation button with no press feedback beyond opacity. AGENTS.md §27.9 is explicit: flagship button press = scale 0.95–0.97 + spring back + light haptic. These two are below the "good" bar, let alone flagship.

### 3.9 Import sprawl vs. rolling own

- **59 files** import the duplicate primitives (`AppButton`/`AppInput`/`PremiumTextField`/`PremiumInputShell`/`PremiumStatusPill`/`AppStatusPill`/`PremiumActionBar`/`PremiumActionFooter`).
- **1,823 `Pressable` usages** exist across `screens/` — many are legitimately list-item presses, but a significant fraction are screens rolling their own buttons (with their own radii, their own padding, their own press feedback) instead of using `AppButton`. The `components/ui` barrel (`index.ts`) exports only 9 of the 25 files in the folder — `AppButton`, `AppSearchBar`, `AppSegmentControl`, `AppStatusPill`, `ScreenHeader`, `HoldToSubmitButton`, `ElevatedSurface`, `ActivityBadge`, `BidSheet`, `BuyNowSheet`, `CoOwnNumericText`, `Text` are *not* exported from the barrel. Screens import these by deep path, which is fragile and signals the barrel is incomplete.

### 3.10 "Coming soon" in primitives

A grep for `Coming soon|Backend required` in `components/` found **zero matches inside primitives** — the only hit is a comment in `CommandPalette.tsx:15` *asserting* that there is no fabricated destination. This is clean. The primitive layer does not lie. Good.

---

## 4. Micro Improvements (Per-Primitive)

### 4.1 AppButton

- **Add a `loadingLabel` prop** so the button can show "Submitting…" text alongside the spinner (currently shows only a spinner, losing the action's verbal identity).
- **Add a `fullWidth` convenience prop** — 59 consumers set `style={{ width: '100%' }}` manually.
- **Promote `hapticFeedback` default from `'none'` to `'light'`** for primary/secondary and `'medium'` for danger — AGENTS.md §27.9 expects haptic on every press. Currently the default is `'none'`, so most callers ship without haptics.
- **Add a `tone` prop** (`brand` | `neutral` | `danger` | `success`) decoupled from `variant`, so a "primary success" button (e.g. "Mark as shipped") doesn't require `color` overrides.

### 4.2 AppInput / PremiumTextField / PremiumInputShell → consolidate

- **Make `AppInput` the canonical input.** Fold `PremiumTextField`'s `leftIcon`/`rightAction` slots and `multiline`/`minHeight` props into `AppInput`. Delete `PremiumInputShell` (it is a strict subset). Delete `PremiumTextField` after migration.
- **Standardise the default fill** to `colors.input` (not `colors.surfaceAlt`) — `surfaceAlt` is for *containers*, `input` is the semantic input field token.
- **Standardise min-height at 52** (the `PremiumTextField`/`PremiumSelectRow` value), not 48 — this matches the M3 Expressive 48dp+ touch target with breathing room.
- **Use `Stroke.standard` (1pt) at rest and `Stroke.emphasis` (2pt) on focus** uniformly — `AppInput` already does this; `PremiumInputShell`'s fixed `1` must go.

### 4.3 AppSearchBar

- **Add a `submitOnReturn` prop and an `onSubmit` callback** — search bars currently cannot submit, callers wire `inputProps.onSubmitEditing` manually.
- **Add an optional `leadingNode`** so the search icon can be swapped (e.g. for a visual-search camera icon, which `VisualSearchScreen` currently rolls inline).

### 4.4 AppSegmentControl

- Already strong (spring indicator, haptic selection, accessibility `tablist`/`tab`). **Add a `size` prop** (`sm`/`md`) — currently fixed at `minHeight: 44` with no compact variant for dense filter bars.

### 4.5 AppStatusPill / PremiumStatusPill → split into Badge + Tag

- **Rename `AppStatusPill` to `Badge`** (non-interactive status indicator, pill shape, `Radius.full`). Keep its 5 tones.
- **Rename `PremiumStatusPill` to `Tag`** (non-interactive category label, rounded-rect, `Radius.md`). Keep its 10 domain tones but refactor them to map onto the 5 canonical tones + a `domain` overlay.
- **Create a new `Chip`** (interactive, `onPress`/`onRemove`, selected state, `Radius.full`). This is the missing primitive — 119 files need it.

### 4.6 ActivityBadge

- **Extract the hardcoded `#FF6B35`** (`:62,89`) into a theme token (`colors.urgency` or `colors.flame`). Hardcoded hex in primitives is a token-system bypass.
- **Add a `pulse` prop** (default off) — the `PulsingDot` component exists (`:97`) but is gated on `config.accent`; a screen-level prop is clearer.

### 4.7 FlatRow

- Already excellent (anti-synthetic, hairline inset separator, transparent icon wrap, 44pt target). **Add an optional `trailingMeta` slot** distinct from `value` so a row can show "£42.00 · 2d ago" without string concatenation.

### 4.8 ActionDock

- Strong (Liquid Glass, reduced-transparency fallback, 44pt targets, spring entrance). **Add a `compact` mode** that drops the leading slot for sub-44pt contexts (e.g. inline at the bottom of a sheet).

### 4.9 PremiumActionBar / PremiumActionFooter → consolidate

- **Delete `PremiumActionFooter`.** Migrate its 2 consumers to `PremiumActionBar`. `PremiumActionBar` already has scale + haptic + brand colour + hairline border — it is the strict superset.
- **Add an `errorBanner` slot prop** to `PremiumActionBar` (both currently render the error banner inline) so the banner is consistent.

### 4.10 PremiumFormCard / PremiumListSection / ElevatedSurface → surface taxonomy

- Three "container" primitives exist. Define the rule: `ElevatedSurface` = low-level surface (4 variants); `PremiumFormCard` = titled content card (header + body); `PremiumListSection` = titled list wrapper. Document the boundary; ensure no screen nests all three.

### 4.11 ScreenHeader

- **Add a `modal` variant behaviour** — the `variant` type includes `'modal'` (`ScreenHeader.tsx:8`) but there is no style branch for it; it falls through to `standard`. Either implement it or remove it from the type.

### 4.12 Text

- **`Title1`/`Title2`/`Title3` are identical** (`Text.tsx:338-355` — all three use `Type.title.size`). Either differentiate them or collapse to one `Title` component. This is dead variance.

### 4.13 HoldToSubmitButton

- Excellent (progress ring, reduced-motion fallback, haptic heavy on completion). **Expose `holdDurationMs` as a prop** — currently hardcoded to 600ms (`:28`); the threshold spec may change.

### 4.14 CoOwnNumericText

- Excellent (tabular nums, true minus sign, direction-glyph pairing, locale grouping). No changes — this is the model primitive.

### 4.15 Sheets

- **`TransactionSheet.tsx:108,126`**: replace hardcoded `borderRadius: 8` with `Radius.lg` and use `AppButton` for the confirm/secondary actions so they inherit scale + haptic + brand colour. Currently the confirm button is a plain `Pressable` with no press feedback — unacceptable for a financial confirmation.
- **`FormSheet.tsx:61-68`**: the left/right actions are plain `Pressable` with no scale/haptic. Wrap in `AnimatedPressable` with `scaleValue={0.97}` + `hapticFeedback="light"`.
- **`ActionSheet` and `InspectorSheet`**: thin wrappers, structurally fine. Add JSDoc examples of expected content.

---

## 5. Macro Improvements (Primitive Architecture)

### 5.1 The one-button / one-input / one-sheet rule

Establish a hard rule, enforced by lint and review:

- **One button component:** `AppButton`. `PremiumActionBar` is the sticky-footer composition *of* `AppButton`s (not a separate button). `PremiumActionFooter` is deleted. `HoldToSubmitButton` is the *only* specialised button (irreversible actions) and is composed on top of the same press-feedback grammar.
- **One input component:** `AppInput` (with `leftIcon`/`rightAction`/`multiline` folded in). `PremiumTextField` and `PremiumInputShell` are deleted after migration.
- **One sheet engine:** `BottomSheet`. Four semantic wrappers (`ActionSheet`/`FormSheet`/`InspectorSheet`/`TransactionSheet`) are the *only* allowed entry points. Direct `BottomSheet` usage is gated behind a review exception. `BidSheet`/`BuyNowSheet` move to a domain folder and compose `TransactionSheet` internally.

### 5.2 The missing primitives: `Chip`, `Tag`, `Badge`, `Toast`, `Divider`

- **`Chip`** — interactive, `onPress`/`onRemove`, `selected` state, `Radius.full`, 4 roles (assist/filter/input/suggestion) per Material 3 ([Android Chip](https://developer.android.com/develop/ui/compose/components/chip)).
- **`Tag`** — static category label, non-interactive, `Radius.md`, domain tones.
- **`Badge`** — non-interactive status/count, `Radius.full`, dot/numeric/text variants, truncation threshold (`999+`).
- **`Toast`** — transient feedback, auto-dismiss, haptic on success/error, anchored above the keyboard/dock. Replaces the ad-hoc toast rolls across screens.
- **`Divider`** — hairline separator with `inset` prop. Currently every screen uses `<View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />` inline.

### 5.3 Token enforcement

- **Add an ESLint rule** (per the OTF kit's `eslint-plugin-otf-design` pattern, [otf-kit.dev](https://otf-kit.dev/docs)) that flags hardcoded `borderRadius`, `borderWidth`, `shadowColor`, and hex colours inside `components/` and `screens/`. The token system exists; it is not enforced. `TransactionSheet.tsx:108` (`borderRadius: 8`) and `ActivityBadge.tsx:62` (`#FF6B35`) would be caught at lint time.
- **Complete the `components/ui/index.ts` barrel** — export every primitive. Deep-path imports are fragile and hide the public API.

### 5.4 Deprecation path (eBay Evo model)

eBay Evo's honest component status — alpha/beta/stable/deprecated — is the model ([eBay Evo](https://uiuxshowcase.com/resources/evo-ebay-design-playbook/)). Apply it:

1. **Mark `PremiumActionFooter`, `PremiumInputShell`, `PremiumTextField` as `@deprecated`** in JSDoc with a migration pointer to `PremiumActionBar` / `AppInput`.
2. **Run a codemod** that rewrites imports of the deprecated components to their canonical replacements where the prop surface is compatible.
3. **Remove the deprecated components** after one release cycle, once the diff is reviewed per AGENTS.md §8.

### 5.5 Sheet wrapper adoption enforcement

- **Add a lint rule** that flags `from '../BottomSheet'` and `from '../../components/BottomSheet'` outside `components/sheets/`. The 8 screens that bypass the wrappers should be migrated to the appropriate semantic wrapper.
- **Move `BidSheet` and `BuyNowSheet`** out of `components/ui/` into `components/auction/` or `components/trade/`. They are domain sheets, not primitives.

### 5.6 Variant-aware motion tokens

Material 3 Expressive makes motion a first-class token ([Sabaoon](https://www.sabaoon.dev/blog/material-expressive)). ThryftVerse already has `theme/motionTokens.ts` and `useMotionConfig()` (AGENTS.md §27.3). The gap is that `PremiumActionFooter` and `TransactionSheet` buttons do not *use* them. Enforce `useMotionConfig()` on every pressable primitive.

---

## 6. Flagship Acceptance Criteria (Budgets)

Apply the AGENTS.md §4 budgets to the primitive layer. Every primitive must satisfy:

### 6.1 Surface budget
- At most **one dominant non-media panel** above the fold per screen. `PremiumFormCard` + `ElevatedSurface` + `PremiumListSection` must not nest. Flatten unless there is a distinct interaction boundary.
- **No card-on-card.** A `PremiumFormCard` inside an `ElevatedSurface` is removed.

### 6.2 Radius budget
- **No more than two non-avatar radius sizes** in one viewport (unless a modal is present). The canonical primitive radii:
  - `Radius.sm` (4) — chips, badges, small metadata.
  - `Radius.lg` (12) — buttons, inputs, fields, cards, sheet tops.
  - `Radius.xl` (16) — large containers.
  - `Radius.full` (999) — pills, avatars, FABs.
- **`TransactionSheet.tsx:108,126` hardcoded `8`** is removed → `Radius.lg`.
- **`AppButton` sm/md/lg using three radii** is collapsed to two: sm = `Radius.lg`, md/lg = `Radius.lg` (differentiate by height/padding, not radius).

### 6.3 Stroke grammar
- Separators = `StyleSheet.hairlineWidth`. Fields and explicit outlines = `Stroke.standard` (1pt). Focus/selection = `Stroke.emphasis` (2pt).
- **No mixing 0.5/1/1.5/2pt** in the same component family. `PremiumStatusPill.tsx:113` (`borderWidth: 1`) and `AppStatusPill.tsx:94` (`hairlineWidth`) are reconciled: `Badge` = hairline, `Tag` = `Stroke.standard`.

### 6.4 Icon grammar
- One icon family (Ionicons), one optical size band per region. Navigation glyphs = 20–24pt (`Control.icon`). Metadata glyphs = 14–18pt (`Control.iconCompact` = 18).
- **`ActivityBadge` icons at 14pt** (`:140`) and **`FlatRow` metadata icons at 18pt** (`:310`) are correct. `AppStatusPill` icon at 12/14 (`:71`) is correct for badge scale.
- **Hardcoded `#FF6B35`** in `ActivityBadge` is removed → theme token.

### 6.5 Text budget
- First viewport: **no more than three type sizes and one eyebrow.** `Text.tsx` ships 12 components (`Caption`/`CaptionEmphasis`/`Body`/`BodyEmphasis`/`Headline`/`Title3`/`Title2`/`Title1`/`Price`/`PriceCompact`/`PriceLarge`/`Meta`) — but `Title1`=`Title2`=`Title3` (all `Type.title.size`). Collapse the dead variance.
- **Remove duplicate headings and decorative subtitles** in primitives — `PremiumFormCard` already does this well (optional title/subtitle).

### 6.6 Touch target
- **44pt minimum** (`Control.hit`). `AppButton` sm = 44, md = 52, lg = 56 — correct. `TransactionSheet` footer buttons at `height: 52` — correct. `FormSheet` action buttons at `minHeight: 44` — correct.

### 6.7 Press feedback
- **Every interactive primitive:** scale 0.95–0.985 + spring back + haptic (light for secondary, medium for primary, heavy for destructive/hold). `PremiumActionFooter` and `TransactionSheet` confirm button must gain scale + haptic.

### 6.8 State completeness
- Every primitive supports: enabled, disabled (truthful, opacity 0.4–0.55), loading (spinner replacing label), pressed (scale + opacity). `AppButton` has all four. `PremiumActionFooter` lacks pressed scale. `TransactionSheet` lacks pressed scale + haptic.

### 6.9 Light/dark parity
- Geometry, hierarchy, and density identical across themes. `AppStatusPill` (`:25-58`) branches heavily on `isDark` with hardcoded hex per theme — this is acceptable for tone mapping but the hex values must live in the theme, not the component.

### 6.10 Thumbnail + squint tests
- At 25% scale, repeated rounded rectangles must not dominate the silhouette. The current 3-button / 3-input / 2-pill duplication produces exactly the "repeated rounded rectangles" failure mode. Consolidation is the fix.

---

## 7. Priority & Sequencing

### Phase 1 — Foundation (highest impact, blocks everything)
1. **Consolidate inputs:** fold `PremiumTextField` + `PremiumInputShell` into `AppInput`. Codemod the 59 consumers. Delete the two deprecated files.
2. **Consolidate buttons:** delete `PremiumActionFooter`, migrate to `PremiumActionBar`. Add `errorBanner` slot to `PremiumActionBar`.
3. **Fix `TransactionSheet` footer:** replace hardcoded `borderRadius: 8` with `Radius.lg`, swap plain `Pressable` for `AppButton` (inherits scale + haptic + brand).
4. **Complete the `components/ui/index.ts` barrel** — export every primitive.

### Phase 2 — Missing primitives
5. **Create `Chip`** (interactive, 4 roles per Material 3). Begin migrating the 119 files that roll their own.
6. **Rename `AppStatusPill` → `Badge`**, `PremiumStatusPill` → `Tag`. Document the boundary.
7. **Create `Toast`** (transient feedback, haptic-aware). Replace ad-hoc toast rolls.
8. **Create `Divider`** (hairline + inset). Replace inline `<View style={{ height: hairlineWidth }} />`.

### Phase 3 — Sheet adoption & cleanup
9. **Enforce sheet wrapper usage** via lint. Migrate the 8 screens that call `BottomSheet` directly to the appropriate semantic wrapper.
10. **Move `BidSheet` and `BuyNowSheet`** out of `components/ui/` into `components/auction/` (or `components/trade/`). Refactor to compose `TransactionSheet`.
11. **Add `FormSheet` action press feedback** (scale + haptic).

### Phase 4 — Token enforcement & polish
12. **Add ESLint rules** for hardcoded `borderRadius`/`borderWidth`/`shadowColor`/hex in `components/` and `screens/`.
13. **Extract `ActivityBadge` hardcoded hex** into theme tokens.
14. **Collapse `Text.tsx` dead variance** (`Title1`/`Title2`/`Title3`).
15. **Implement `ScreenHeader` `modal` variant** or remove it from the type.
16. **Promote `AppButton` haptic default** from `'none'` to `'light'`/`'medium'`.

### Phase 5 — Governance (ongoing)
17. **Adopt eBay Evo-style component status** (alpha/beta/stable/deprecated) in JSDoc on every primitive.
18. **Document the one-button/one-input/one-sheet rule** in `components/ui/README.md` and enforce in review.

---

## Sources

- Apple Design What's New — https://developer.apple.com/design/whats-new
- WWDC26/251 Communicate your brand identity on iOS — https://developer.apple.com/videos/play/wwdc2026/251/
- Google Research, CHI '26 — Usability Hasn't Peaked — https://research.google/pubs/usability-hasnt-peaked-exploring-how-expressive-design-overcomes-the-usability-plateau/
- Sabaoon — Material Expressive 2026 — https://www.sabaoon.dev/blog/material-expressive
- Suridevs — Material 3 Expressive Compose guide — https://www.suridevs.com/blog/posts/google-material-3-expressive-android-16/
- Android Developers — Chip — https://developer.android.com/develop/ui/compose/components/chip
- Android Developers — Material Design 3 in Compose — https://developer.android.com/develop/ui/compose/designsystems/material3
- Android Developers — Bottom sheets (Compose) — https://developer.android.com/develop/ui/compose/components/bottom-sheets
- NN/g — Bottom Sheets: Definition and UX Guidelines — https://www.nngroup.com/articles/bottom-sheet/
- Mobile App Wiki — Bottom Sheets and Modals — https://mobileapp.wiki/en/uiux/bottom-sheet-modal-guide
- designfornative.com — Bottom Sheets vs Fullscreen Modals — https://designfornative.com/bottom-sheets-vs-fullscreen-modals/
- LogRocket — How to design bottom sheets for optimized UX — https://blog.logrocket.com/ux-design/bottom-sheets-optimized-ux/
- Eleken — Badge UI Design — https://www.eleken.co/blog-posts/badge-ui-design
- DesignSystems.one — Pinterest Gestalt breakdown — https://www.designsystems.one/design-systems/gestalt
- UIUX Showcase — eBay Evo Design Playbook — https://uiuxshowcase.com/resources/evo-ebay-design-playbook/
- Snapchat/Valdi — https://github.com/snapchat/valdi
- OTF SDK — https://otf-kit.dev/docs
- POLPROG-TECH/Native-UI — https://github.com/POLPROG-TECH/Native-UI
- SAP Fiori Design iOS v26.4 — What's New — https://www.sap.com/design-system/fiori-design-ios/v26-4/discover/what-is-new
- UIUXDesigning — iOS Tab Bar guide 2026 — https://uiuxdesigning.com/ios-tab-bar/
