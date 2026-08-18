# 01 — Design System, Tokens, Typography, Motion, Radii & Iconography

**Department:** Design system, tokens, typography, motion, radii, iconography, flagship primitives
**Programme:** ThryftVerse Flagship Upgrade
**Date:** August 2026
**Status:** Research & audit report (informs implementation, not a substitute for it)

---

## 1. 2026 Competitor Benchmark

The 2026 mobile design-system landscape has consolidated around three ideas that ThryftVerse must meet or exceed: (1) a **three-tier token architecture** (primitive → semantic → component) with purpose-based naming, (2) **physics-driven motion and haptics as first-class tokens**, and (3) **dark-mode parity as a semantic re-mapping, not a colour inversion**. The benchmark below is drawn from the live systems shipping at flagship quality in August 2026.

| Competitor | Token architecture | Type system | Motion language | Dark-mode approach | Notable discipline |
|---|---|---|---|---|---|
| **Instagram** (2026 refresh) | Brand system with Instagram Sans / Pen / Mono triple-font family; subtle gradient retained but scoped; "more room to breathe" | Three-font family (Sans, Pen handwriting, Mono) with a tightened script wordmark; UI uses a restrained sans scale | Refreshed motion, layout and UI — "built so the community's work carries the energy" | Light/dark parity with the gradient used as accent, not background | Tactile photographic language (contact sheets, registration marks) — identity from craft, not ornament |
| **Pinterest Gestalt** | Mature three-tier system; color palettes, typography, iconography and principles documented as a shared language | Editorial-leaning scale tuned for pin/masonry density | Restrained, content-first; motion never competes with imagery | Semantic re-mapping with surface-elevation steps | "Gestalt is for everyone" — single source of truth for design + eng + PM |
| **eBay / marketplace peers** | Component-token layer on top of semantic aliases; commerce-precise numeric typography | Tabular figures for prices; clear price hierarchy (list vs hero) | Press feedback + sheet physics; minimal decorative motion | Surface elevation inverted (lighter surfaces rise on dark) | Trust signals tiered; transparent pricing as a design principle |
| **Snapchat** | Bold, springy Material 3 Expressive influence; dynamic colour | Expressive display scale; weight contrast for hierarchy | Spring physics foregrounded; haptic grammar mapped to intent | Vivid accents desaturated for dark; elevation via lightness | Haptic-semantic model (impact / selection / notification) |
| **Material 3 Expressive (Android 16)** | Reference tier (raw) → system tier (semantic) → component tier; dynamic colour from wallpaper | 13-style scale: display/headline/title/body/label × L/M/S; `titleLarge 22/28`, `bodyLarge 16/24`, `labelSmall 11/16` | Emotion-first, physics-driven; bold springy motion; variable corner radius | Elevation = lightness on dark; surfaces lighten as they rise | Grounded in 46 research studies / 18,000 participants |
| **iOS 26 Liquid Glass** | SF Pro with Dynamic Type (12 sizes: 7 standard + 5 AX); optical-size switching at 19/20pt | Large Title 34, Title 1 28, Title 2 22, Title 3 20, Headline/Body 17 | Three motion tiers: instant / micro (100–200ms) / deliberate (250–400ms) | Translucent lensing scoped to nav/controls — never whole-app glass | `AccessibilityInfo.isReduceTransparencyEnabled()` gate before glass |

**The 2026 consensus (W3C DTCG format, Style Dictionary, Figma Variables):** name tokens by **purpose** (`color.text.primary`), never by value (`gray-900`); keep primitives private; expose semantic + component tiers; start with 30–50 tokens covering colour, space, type, radius — a 400-token vocabulary nobody adopts fails like a 300-component library. Motion and haptics are now tokenised alongside colour and type, with haptics treated as a first-class sense (impact / selection / notification semantics). Dark mode is a **semantic re-mapping** where elevation lightens surfaces on dark, desaturated mid-tones replace neon accents, and contrast ratios are baked into token relationships rather than checked after the fact.

ThryftVerse's charter (AGENTS.md §4, §27) already encodes this consensus in spirit. The gap is in **enforcement and coverage**, not in principle.

---

## 2. Psychology & Principles — Why a Tight Token System Reads as Premium

Premium is less about decoration and more about control. Users form snap judgments about quality within seconds of opening an app; the product should feel "edited, stable, and deliberate" (AGENTS.md §27.1). A tight token system is the mechanical substrate of that feeling.

**Cognitive fluency.** Easy-to-process interfaces feel premium. When the same radius, the same stroke weight, and the same icon optical size recur across screens, the user's visual system does less work to parse each new surface. Inconsistency forces re-parsing; re-parsing reads as "prototype" or "assembled". The 137 raw numeric `borderRadius:` values scattered across `frontend/src` (see §3) are a direct tax on cognitive fluency — each one is a micro-decision the user's eye has to reconcile.

**Gestalt & rhythm.** Premium rhythm comes from a *cadence* of spacing and scale, not from a single beautiful value. The 4px base grid in `Space` (`designTokens.ts:23-40`) is correct, but rhythm only holds if every consumer uses the scale. Inline `paddingHorizontal: 2`, `gap: 4`, `marginTop: 2` (e.g. `FlagshipProductCard.tsx:154-156`, `:175`) break the grid and produce a staccato, less-confident cadence.

**Hierarchy via one weight delta.** The typography contract (`typography.v2.ts:10`) states "one weight delta is normally enough to express hierarchy." This mirrors Apple HIG and Material 3 — both use weight contrast rather than size proliferation. The charter's text budget (§4: "no more than three type sizes and one eyebrow" in the first viewport) is the product-level expression of the same principle.

**Restraint as confidence.** Generous whitespace signals confidence; shadows on every surface signal the opposite. The charter's anti-AI list (§4: no shadows on every surface, no card-on-card, no glass on content cards) is a restraint budget. A token system makes restraint enforceable: when `Elevation.none` is the default and `Elevation.card` requires a justification, restraint becomes the path of least resistance.

**Three levels of emotional design (Don Norman, §27.1).** Visceral quality comes from hierarchy, spacing rhythm, media quality, colour restraint — all token-driven. Behavioral quality comes from gesture responsiveness, spring physics, haptic grammar, state predictability — also token-driven (motion + haptic tokens). Reflective quality comes from trust signals and truthful UI — enabled by semantic colour tokens (`coownUp`, `commerceTrust`, `antiqueGold`). A loose token system leaks at all three levels.

---

## 3. Current ThryftVerse Audit — Concrete Defects

The token layer is well-conceived but **under-enforced and incompletely consumed**. The defects below are named with file paths and quoted values.

### 3.1 Radius inconsistency — the single largest defect

`Radius` (`designTokens.ts:45-60`) defines a clean 7-step scale: `none 0`, `sm 4`, `md 8`, `lg 12`, `xl 16`, `xxl 24`, `full 999`. `surfaceRadiusRules.ts` even codifies the role contract and the two-non-avatar-radii-per-viewport budget. Yet **137 raw numeric `borderRadius:` literals** exist across `frontend/src`, inventing values that exist nowhere in the scale:

- `HomeScreen.tsx` alone carries **25 raw radius literals** including `31`, `29`, `27`, `18`, `10`, `7`, `5` — none of which are in the `Radius` scale. Lines 1567–1610 introduce `31/29/27/27/5` in a single style block; lines 1662–1877 mix `18/10/12/7`. This is the exact "mix arbitrary radii in one viewport" failure the charter's radius budget forbids.
- `GlobalSearchScreen.tsx:278,283` use `borderRadius: 22` (a value between `xl 16` and `xxl 24` — undefined in the scale).
- `OrderDetailScreen.tsx:2349,2407` use `14` and `18` — both off-scale.
- `SellScreen.tsx:2296` uses `11`; `CreatorAssetPicker.tsx:4438` uses `9`; `GreenScreenSheet.tsx:498` uses `6`; `CommerceMediaStage.tsx:642` uses `6.5`; `CoOwnAssetTile.tsx:264,270` use `1.5` and `2.5`.
- `RetryState.tsx:56,80` use `60` and `30` — avatar-scale values used for non-avatar shapes.

This is a **viewport-budget violation on nearly every screen**: the thumbnail test (§4) fails because repeated rounded rectangles at slightly different radii dominate the silhouette. The fix is not at the screen level — it is at the shared primitive level, per §4's "if three or more screens exhibit the same visual defect, inspect and correct the shared primitive first."

### 3.2 Stroke mixing

`Stroke` (`designTokens.ts:501-508`) and `StrokeRole` (`surfaceRadiusRules.ts:150-159`) define a clean three-role grammar: hairline `0.5`, standard `1`, emphasis `2`. In practice:
- `FlagshipAssetCard.tsx:98,124` use `borderWidth: 1` and `borderWidth: 2` on the same card (root border + status dot ring) — the `2` is a status-dot ring, not a focus/selection, violating "2pt is reserved for focus or selection."
- `FlagshipProfileMedia.tsx:296,322` use `borderWidth: 4` (avatar ring) and `borderWidth: 2` (edit-avatar button) — `4` is off-grammar entirely.
- `FlagshipDangerZone.tsx:91` and `FlagshipState.tsx:312` use `borderWidth: 1` for routine outlined controls — correct, but inconsistent with `FlagshipFormSection.tsx:137` which uses `borderLeftWidth: 3` for the `state` variant (an off-scale accent).

### 3.3 Icon family drift

`IconGrammar` (`designTokens.ts:514-525`) and `ICON_REGISTRY` (`iconRegistry.ts`) establish a single-family (Ionicons), one-optical-size-band, outline-default/filled-selected rule. The registry even bans metaphors (sparkles, robot/brain) and constrains contexts. But:
- **`SemanticIcon` is barely used.** Flagship primitives bypass it entirely: `FlagshipProductCard.tsx:72,82` call `<Ionicons name={saved ? 'heart' : 'heart-outline'} ...>` and `name="videocam"` directly — no registry lookup, no context validation, no `colorRole`. Same in `FlagshipHeader.tsx:104`, `FlagshipOrderCard.tsx:60,85`, `FlagshipAssetCard.tsx:47`, `FlagshipProfileMedia.tsx:113,174,196`, `FlagshipNavigationRow.tsx:105,134`, `FlagshipState.tsx:134,246`.
- **Icon sizes are hardcoded, not banded.** `FlagshipProductCard.tsx:73` uses `size={20}`, `:82` uses `size={12}`; `FlagshipHeader.tsx:104` uses `Control.icon` (22) but `FlagshipNavigationRow.tsx:134` uses `16` and `:107` uses `Control.iconCompact` (18); `FlagshipProfileMedia.tsx:113` uses `17`, `:174` uses `32`, `:196` uses `14`. The `IconGrammar` bands (standard 22, metadata 16, badge 12, hero 28) exist but are not consumed by the primitives.
- **The `coOwn` icon is explicitly deprecated** in the registry (`iconRegistry.ts:45`: "Stock pie-chart is generic; commission authored co-own fraction mark") yet no authored replacement exists — so the deprecated system icon ships in production.
- **`FlagshipEmptyGraphic.tsx`** hand-draws bag/box/search/chat/image illustrations in Skia/SVG with hardcoded `strokeWidth={3.5}` and radii (`12, 12`, `10, 10`, `14, 14`) that do not reference `Radius` or `Stroke` — a parallel icon grammar outside the registry.

### 3.4 Motion absence & dual-source drift

`motionTokens.ts` is a strong, well-documented contract (three tiers, spring presets, easing curves, gesture thresholds, stagger caps, reduced-motion fallbacks). The defect is **dual ownership and non-consumption**:
- `designTokens.ts:324-335` defines a **second, conflicting `Duration` scale** (`fast 120, normal 200, slow 320, slower 500`) while `motionTokens.ts:51-65` defines `Motion.duration` (`touch 80, fast 120, normal 180, slow 280, slower 400, crawl 600`). Two duration scales with overlapping names and different values is a classic single-source-of-truth violation. `FlagshipProductCard.tsx:55` uses `transition={300}` (off both scales); `FlagshipHeroSection.tsx:33` uses `transition={500}`; `FlagshipProfileMedia.tsx:80` uses `transition={400}` — all raw literals.
- `FlagshipState.tsx:207` invents `duration: 1100` for the shimmer — outside every tier and above the charter's "nothing above 400ms except rare celebratory" rule (§17). A loading shimmer is not celebratory.
- `FlagshipProductCard.tsx:90,97,106,113` use `entering={reducedMotion ? undefined : FadeIn}` — bare `FadeIn` with no duration, no tier, no easing. The `Motion.transitions.listItem` preset exists exactly for this and is ignored.
- `PressScale` (`designTokens.ts:531-538`) defines `tap 0.97, gentle 0.985, icon 0.92`, but `FlagshipHeader.tsx:100` uses `scaleValue={0.9}` and `:117` uses `0.98`; `FlagshipNavigationRow.tsx:161` uses `0.98`; `FlagshipState.tsx:156,170` uses `0.97, 0.98`. The `0.9` in `FlagshipHeader` is off-scale (below the `icon 0.92` floor).

### 3.5 2020-era shadows & elevation misuse

`Elevation` (`designTokens.ts:275-317`) is a restrained 5-step scale (`none, subtle, card, floating, modal`) with the right philosophy. Defects are in consumption:
- `FlagshipActionCluster.tsx:90-92` applies `...Elevation.floating` to **every primary button** via `primaryShadow` — a shadow on a primary action button is decorative, not hierarchy-clarifying, and contradicts §4's "shadows on every surface" anti-pattern. A primary button's dominance should come from fill + label, not a floating shadow.
- `HomeScreen.tsx:1833-1837` invents `shadowOpacity: 0.3, shadowRadius: 4, elevation: 4` — a raw shadow heavier than `Elevation.floating` (0.10) and approaching `Elevation.modal` (0.16) but with a tiny radius, producing a 2020-era tight dark shadow.
- `PosterViewerScreen.tsx:1779-1783` uses `shadowOpacity: 0.35, shadowRadius: 4` — even heavier.
- `StickerPicker.tsx:1321-1325` uses `shadowOpacity: 0.22, shadowRadius: 20, elevation: 24` — `elevation: 24` exceeds the maximum `Elevation.modal` (12) by 2×.
- `AuthLandingScreen.tsx:533-537` uses `shadowColor: colors.brand` with `shadowOpacity: 0.2` — a coloured glow shadow, the "glow" the charter prohibits in dark mode (§4 light/dark parity).

### 3.6 Dark-mode parity failures

`ThemeContext.tsx` provides a solid semantic palette (`DARK_COLORS` / `LIGHT_COLORS`) with WCAG-compliant `textMuted` (4.64:1 dark, 4.65:1 light) and a high-contrast override path. Defects:
- **Hardcoded white-on-dark in primitives.** `FlagshipHeroSection.tsx:85,93` hardcode `color: '#fff'` and `'rgba(255,255,255,0.88)'` — these do not flip in light mode, so a hero with an image scrim reads correctly on dark but the text colour is fixed regardless of theme. The scrim itself (`rgba(0,0,0,0.0/0.35/0.65)`) is theme-agnostic, which is acceptable for image legibility, but the text colour should derive from a semantic token (`colors.textInverse` on dark, a scrim-aware token on light).
- `FlagshipProductCard.tsx:74` hardcodes `color={saved ? colors.danger : '#fff'}` — the `#fff` is correct over imagery but bypasses the theme; `:147` uses `backgroundColor: 'rgba(0,0,0,0.55)'` for the video badge, again theme-agnostic (acceptable over media).
- `FlagshipProfileMedia.tsx:249,251,260,278` hardcode `rgba(0,0,0,...)` and `rgba(255,255,255,...)` tints for cover overlays — these are media-overlays and acceptable, but the avatar fallback (`:167-178`) branches on `ActiveTheme === 'light'` using a **module-level constant** instead of the reactive `useAppTheme()` `isDark`, so a runtime theme switch can render a stale fallback.
- `gradients.ts:54` detects dark mode by string-comparing `colors.background === '#0A0A0A'` — a fragile heuristic that breaks the moment a background hex changes. Dark detection should be a first-class `isDark` from context, not a colour-value sniff.
- `colors.ts:44` defines `borderSubtle: '#333333'` while `ThemeContext.tsx:73` defines `borderSubtle: '#1E1E1E'` — **the two sources of truth disagree** on the dark `borderSubtle` value, despite `colors.ts:1` claiming "Values mirror ThemeContext exactly."

### 3.7 Flagship primitive misuse & token gaps

- **`FlagshipProductCard.tsx:14-15`** recomputes `CARD_W`/`CARD_H` from `Dimensions.get('window')` at module load — not reactive to rotation/size-class changes, and duplicates `Layout.gridItemWidth` (`designTokens.ts:348`) and `AspectRatio.marketplace` (`:558`) without referencing them.
- **`FlagshipAssetCard.tsx:87`** hardcodes `IMAGE_SIZE = 80`; `FlagshipOrderCard.tsx:90` hardcodes `IMAGE_SIZE = 72`; `FlagshipProfileMedia.tsx:208` hardcodes `AVATAR_SIZE = 104`. There is no `ThumbSize` token, so every card invents its own thumbnail dimension — a density-target violation (§4: "4–6 useful rows") waiting to happen.
- **`FlagshipFormSection.tsx:55-56`** resolves `variant ?? (noCard ? 'flat' : 'flat')` — both branches return `'flat'`, making the `noCard` prop and the ternary dead code. The deprecated card mode was removed but the branching was not simplified.
- **`FlagshipState.tsx:325-328`** references `Type.captionElevated` — a token listed in `FORBIDDEN_LEGACY_TOKENS` (`typography.v2.ts:248-257`). A flagship primitive consuming a forbidden legacy token is a contract violation.
- **`FlagshipDangerZone.tsx:31`** builds `${colors.danger}10` and `:32` `${colors.danger}30` — hex-alpha concatenation that fails if `danger` is ever a non-6-digit hex. `ThemeColors` already has `brandSubtle` as a rgba; danger has no `dangerSubtle` semantic token, so consumers invent alpha suffixes.
- **`FlagshipEmptyGraphic.tsx`** is ~290 lines of hand-built Skia/SVG geometry that duplicates the icon registry's job without registering anything — a parallel, un-governed illustration system.

---

## 4. Micro Improvements (File / Token-Level)

| # | Defect | File:line | Fix |
|---|---|---|---|
| M1 | 137 raw `borderRadius:` literals | `HomeScreen.tsx`, `GlobalSearchScreen.tsx`, `OrderDetailScreen.tsx`, `SellScreen.tsx`, etc. | Replace every numeric literal with a `Radius.*` or `resolveRadius(role)` call. Add an ESLint rule forbidding numeric `borderRadius` outside `theme/`. |
| M2 | Dual `Duration` scale | `designTokens.ts:324` vs `motionTokens.ts:51` | Delete `Duration` from `designTokens.ts`; re-export `Motion.duration` as the single duration scale. |
| M3 | Off-scale press scales | `FlagshipHeader.tsx:100` (`0.9`), `:117` (`0.98`) | Use `PressScale.icon` (0.92) and `PressScale.gentle` (0.985). |
| M4 | Raw `transition={300/500/400}` | `FlagshipProductCard.tsx:55`, `FlagshipHeroSection.tsx:33`, `FlagshipProfileMedia.tsx:80` | Use `Motion.transitions.mediaLoad.duration` (250) for images, `Motion.duration.slow` (280) for hero. |
| M5 | Bare `FadeIn` with no tier | `FlagshipProductCard.tsx:90,97,106,113` | Use `Motion.transitions.listItem` preset (`duration 220, translateY 8, entrance easing`). |
| M6 | Shimmer `duration: 1100` | `FlagshipState.tsx:207` | Cap at `Motion.duration.slower` (400) or define a dedicated `Motion.transitions.shimmer` preset ≤ 600ms with reduced-motion collapse. |
| M7 | Hardcoded icon sizes | `FlagshipProductCard.tsx:73,82`, `FlagshipHeader.tsx:104`, `FlagshipProfileMedia.tsx:113,174,196` | Route through `SemanticIcon` with `IconGrammar` bands (standard 22, metadata 16, badge 12, hero 28). |
| M8 | Direct `Ionicons` in primitives | All flagship components | Replace with `<SemanticIcon name="..." context="..." />` so registry validation + colorRole resolve. |
| M9 | `borderSubtle` mismatch | `colors.ts:44` (`#333333`) vs `ThemeContext.tsx:73` (`#1E1E1E`) | Make `colors.ts` import from `ThemeContext` or delete the static duplicate and expose a `getDarkColors()` getter. |
| M10 | Dark-mode sniff by hex | `gradients.ts:54` | Accept `isDark: boolean` from `useAppTheme()` instead of comparing `colors.background === '#0A0A0A'`. |
| M11 | `ActiveTheme` string compare for avatar fallback | `FlagshipProfileMedia.tsx:167` | Use `isDark` from `useAppTheme()` for reactive fallback. |
| M12 | Forbidden `Type.captionElevated` in flagship primitive | `FlagshipState.tsx:325-328` | Migrate to `TypographyV2.meta` / `.label`. |
| M13 | Hex-alpha `${colors.danger}10` | `FlagshipDangerZone.tsx:31-32` | Add `dangerSubtle` / `dangerBorder` semantic tokens to `ThemeColors`; consume them. |
| M14 | Dead `noCard` ternary | `FlagshipFormSection.tsx:55-56` | Collapse to `variant ?? 'flat'`; remove `noCard` prop. |
| M15 | Module-load `Dimensions` card size | `FlagshipProductCard.tsx:11-15` | Use `useWindowDimensions()` + `Layout.gridItemWidth` + `AspectRatio.marketplace`. |
| M16 | Hardcoded thumbnail sizes | `FlagshipAssetCard.tsx:87`, `FlagshipOrderCard.tsx:90`, `FlagshipProfileMedia.tsx:208` | Add `ThumbSize` token (`sm 64, md 72, lg 80, avatar 104`). |
| M17 | `Elevation.floating` on every primary button | `FlagshipActionCluster.tsx:90-92` | Remove `primaryShadow`; primary dominance comes from fill + label. |
| M18 | Raw heavy shadows | `HomeScreen.tsx:1833`, `PosterViewerScreen.tsx:1779`, `StickerPicker.tsx:1321` | Replace with `Elevation.modal` / `Elevation.floating`; cap `elevation` at 12. |
| M19 | Coloured brand glow shadow | `AuthLandingScreen.tsx:533-537` | Remove; use fill + scale for primary dominance. |
| M20 | Unregistered Skia illustrations | `FlagshipEmptyGraphic.tsx` | Register each variant in `ICON_REGISTRY` as `source: 'authored'` with `customComponent`, so the registry governs illustrations too. |

---

## 5. Macro Improvements (System-Level)

### 5.1 Single token ownership — collapse the dual sources

The codebase has **three overlapping colour sources** (`ThemeContext.tsx`, `constants/colors.ts`, `gradients.ts` static exports) and **two overlapping duration scales** (`designTokens.ts: Duration`, `motionTokens.ts: Motion.duration`). The 2026 consensus is unambiguous: one source of truth per token, everything else generated. Concretely:
- Make `ThemeContext.tsx` the canonical colour owner; `colors.ts` becomes a thin getter re-export (`getColorsForTheme`), not a parallel literal map.
- Delete `Duration` from `designTokens.ts`; `Motion.duration` is the only duration API.
- Move `PressScale` into `motionTokens.ts` so all motion-related values live together.
- Add a lint rule that forbids importing `Duration`, `TypeStyles`, or `Typography` (legacy re-exports) in any file under `components/flagship/`.

### 5.2 Motion language — consume the contract that already exists

`motionTokens.ts` already defines tiers, springs, easings, mappings, transitions, gestures, and reduced-motion fallbacks. The system-level fix is **adoption, not authoring**:
- Every flagship primitive's `entering`/`exiting` animation must reference `Motion.transitions.*` or `Motion.tier.*` — no bare `FadeIn`.
- Every press feedback must reference `PressScale.*` + `Motion.spring.*` via `AnimatedPressable`'s preset, not inline `scaleValue` literals.
- Add a `useMotionConfig()` hook (referenced in `motionTokens.ts` comments but not present in the audited files) that returns tier durations gated by `useReducedMotion()`, so callers never branch on reduced-motion manually.
- Map haptics to the Apple semantic model (impact / selection / notification) as tokenised haptic presets — `haptic.light/medium/heavy/success/error` — and pair every physical motion with a haptic so interactions feel grounded (2026 best practice: haptics as a first-class sense).

### 5.3 Icon grammar — enforce the registry

`ICON_REGISTRY` + `SemanticIcon` are the right primitives but are not the mandatory path. System-level changes:
- Make `SemanticIcon` the **only** sanctioned icon entry point in flagship components; add a lint rule forbidding raw `<Ionicons>` imports outside `design/icons/` and `SemanticIcon.tsx`.
- Complete the registry: every Ionicons name currently used inline (`heart`, `videocam`, `chevron-forward`, `cube-outline`, `image-outline`, `person`, `camera`, `alert-circle-outline`, `cloud-offline-outline`, `lock-closed-outline`, `sync-outline`) must be registered with `semanticName`, `allowedContexts`, `defaultSize` band, and `colorRole`.
- Commission the authored `coOwn` replacement icon (the registry already marks it deprecated) and the authored co-own fraction mark.
- Register `FlagshipEmptyGraphic` variants as `source: 'authored'` icons so the registry governs the illustration layer too, with `strokeWidth` and radii referencing `Stroke` and `Radius`.

### 5.4 Primitive contracts — encode the budgets as runtime guards

`surfaceRadiusRules.ts` defines `MAX_NON_AVATAR_RADII_PER_VIEWPORT = 2` and `MAX_DOMINANT_NON_MEDIA_PANELS_ABOVE_FOLD = 1` but nothing enforces them. System-level:
- Add a `__DEV__` viewport auditor (a lightweight hook used by `FlagshipScreen`) that walks its children's resolved styles and warns when a viewport exceeds the radius or surface budget.
- Add a `LayoutFamily` declaration to every screen (the type exists in `surfaceRadiusRules.ts:106` but is unused) and enforce that `FlagshipScreen` consumers declare one.
- Promote `ThumbSize` and `AvatarSize` to first-class tokens so card thumbnail dimensions stop drifting.

### 5.5 Dark-mode parity as semantic re-mapping

Following the 2026 consensus (elevation lightens on dark; desaturated accents; contrast baked into tokens):
- Add `dangerSubtle`, `successSubtle`, `warningSubtle`, `brandSubtle` (already present) as a complete `*Subtle` family so no consumer ever does `${color}10` hex-alpha again.
- Add `scrimTextPrimary` / `scrimTextSecondary` tokens for text over media scrims (currently hardcoded `#fff`), so light mode can use a different scrim text colour if needed.
- Replace the `gradients.ts` hex-sniff dark detection with `isDark` from context across all gradient/glass/glow computation.
- Verify every surface elevation step (`surface → surfaceAlt → surfaceRaised → surfaceElevated`) lightens monotonically on dark and darkens monotonically on light — the current `LIGHT_COLORS` (`surface #F5F5F5`, `surfaceAlt #EFEFEF`, `surfaceRaised #F2F2F2`, `surfaceElevated #FFFFFF`) is **non-monotonic** (`surfaceRaised #F2F2F2` is lighter than `surfaceAlt #EFEFEF` but darker than `surface #F5F5F5`, which inverts the intended ordering). This is a real hierarchy bug.

---

## 6. Flagship Acceptance Criteria (AGENTS.md Budgets)

The following are the pass/fail criteria for the design-system department, derived directly from AGENTS.md §4 and §27. A flagship pass requires **all** of them.

| Budget | Rule (AGENTS.md §4) | Current state | Acceptance criterion |
|---|---|---|---|
| **Radius budget** | ≤ 2 non-avatar radii per viewport (unless modal) | 137 raw literals; `HomeScreen` mixes 5+ in one viewport | Zero numeric `borderRadius` outside `theme/`; every viewport audited at ≤ 2 non-avatar radii |
| **Stroke grammar** | hairline 0.5 / field 1 / focus 2; no mixing in a component family | `borderWidth: 4`, `3`, `1.5`, `2.5` off-grammar | Every stroke references `Stroke.*` / `resolveStroke(role)`; no `borderWidth` literal outside `theme/` |
| **Icon grammar** | one family, one optical band, stable outline/filled rule | Direct `Ionicons` in 9+ flagship primitives; hardcoded sizes | `SemanticIcon` is the only icon entry point; sizes from `IconGrammar` bands; registry complete |
| **Surface budget** | ≤ 1 dominant non-media panel above fold | Not measured/enforced | `FlagshipScreen` dev-auditor warns on budget breach |
| **Text budget** | ≤ 3 type sizes + 1 eyebrow in first viewport | `FlagshipState` uses `subtitle` + `body` + `caption` + `captionElevated` (forbidden) + `meta` = 5 | First-viewport type-size count verified per screen; no forbidden legacy tokens |
| **Density target** | 4–6 rows (list) / 2+ media objects (discovery) | Hardcoded thumb sizes drift | `ThumbSize` token; density verified on device |
| **Light/dark parity** | Geometry, hierarchy, density identical across themes | `borderSubtle` mismatch; hex-sniff dark detection; non-monotonic light elevation | One colour owner; monotonic elevation; `isDark` from context everywhere |
| **Motion discipline** | tiers instant/micro/deliberate; nothing > 400ms except rare celebratory; reduced-motion fallbacks | Dual duration scale; bare `FadeIn`; 1100ms shimmer | Single `Motion.duration`; every animation references a tier/preset; reduced-motion collapses all |
| **Press feedback** | scale 0.97–0.985 (icon 0.92); spring + haptic | `0.9` and `0.98` off-scale | All press scales from `PressScale.*`; haptic paired with every physical motion |
| **Shadow discipline** | depth only for hierarchy/touchability/modal separation; no glow in dark | Floating shadow on every primary button; coloured brand glow; `elevation: 24` | `Elevation.*` only; no coloured shadows; `elevation` ≤ 12; primary buttons unshadowed |
| **Thumbnail test** | at 25% scale, primary object + reading order obvious | Untested | Captured and verified per flagship screen |
| **Squint test** | media/identity/content dominate; chrome recedes | Untested | Captured and verified per flagship screen |

---

## 7. Priority & Sequencing

The sequencing is ordered by **leverage**: fixes to shared primitives unlock correctness across every screen that consumes them, so they precede screen-local work per AGENTS.md §4 ("if three or more screens exhibit the same visual defect, inspect and correct the shared primitive first").

### Phase 0 — Source-of-truth consolidation (blocking, 1–2 days)
1. **M2** Delete `Duration` from `designTokens.ts`; re-export `Motion.duration`. (Unblocks all motion adoption.)
2. **M9** Resolve `borderSubtle` mismatch; make `ThemeContext.tsx` the canonical colour owner, `colors.ts` a thin getter. (Unblocks dark-mode parity.)
3. **M10** Replace `gradients.ts` hex-sniff with `isDark` from context.
4. Add `dangerSubtle / successSubtle / warningSubtle` semantic tokens; add `ThumbSize` / `AvatarSize` tokens; add `scrimTextPrimary` token.
5. Fix the non-monotonic `LIGHT_COLORS` elevation ordering (`surfaceRaised` must sit between `surface` and `surfaceAlt` or be renamed).

### Phase 1 — Primitive contract migration (high leverage, 2–3 days)
6. **M1** ESLint rule forbidding numeric `borderRadius` outside `theme/`; codemod the 137 literals to `Radius.*` / `resolveRadius(role)`.
7. **M7, M8** Route all flagship icons through `SemanticIcon`; complete `ICON_REGISTRY`; migrate hardcoded sizes to `IconGrammar` bands.
8. **M3, M4, M5, M6** Migrate all flagship primitives' motion to `Motion.transitions.*` / `Motion.tier.*` / `PressScale.*`; add `useMotionConfig()` hook.
9. **M17, M18, M19** Remove `Elevation.floating` from primary buttons; replace raw shadows with `Elevation.*`; cap `elevation` at 12; remove coloured glow.
10. **M12, M13, M14, M15, M16** Migrate flagship primitives off forbidden legacy tokens, hex-alpha, dead `noCard` branching, module-load `Dimensions`, and hardcoded thumb sizes.

### Phase 2 — Enforcement & runtime guards (1–2 days)
11. Add `__DEV__` viewport auditor to `FlagshipScreen` (radius + surface budget warnings).
12. Require `LayoutFamily` declaration on every `FlagshipScreen` consumer.
13. Add lint rules forbidding `Duration`, `TypeStyles`, `Typography`, raw `Ionicons`, and numeric `borderRadius` / `borderWidth` / `shadowOpacity` outside `theme/`.

### Phase 3 — Icon & illustration authoring (parallel, 3–5 days)
14. Commission authored `coOwn` replacement icon.
15. Register `FlagshipEmptyGraphic` variants in `ICON_REGISTRY` as `source: 'authored'`; align their `strokeWidth` and radii with `Stroke` / `Radius`.

### Phase 4 — Device verification (blocking for sign-off)
16. Per AGENTS.md §19: render → capture → criticise → correct on a native device for every flagship screen that consumes the migrated primitives. Verify the thumbnail test, squint test, light/dark parity, and reduced-motion collapse. Mark `IMPLEMENTED — NATIVE DEVICE VALIDATION PENDING` until device captures pass.

---

### Summary of evidence

- **137** raw numeric `borderRadius:` literals across `frontend/src` (grep count).
- **25** of those in `HomeScreen.tsx` alone, including off-scale values `31, 29, 27, 18, 10, 7, 5`.
- **2** conflicting `Duration` scales (`designTokens.ts:324` vs `motionTokens.ts:51`).
- **3** overlapping colour sources (`ThemeContext.tsx`, `constants/colors.ts`, `gradients.ts` static exports).
- **1** `borderSubtle` value mismatch between `colors.ts:44` (`#333333`) and `ThemeContext.tsx:73` (`#1E1E1E`).
- **1** non-monotonic light elevation step (`surfaceRaised #F2F2F2` vs `surfaceAlt #EFEFEF`).
- **9+** flagship primitives importing `Ionicons` directly, bypassing `SemanticIcon` / `ICON_REGISTRY`.
- **1** deprecated `coOwn` icon shipping in production with no authored replacement.
- **1** forbidden legacy token (`Type.captionElevated`) consumed by a flagship primitive (`FlagshipState.tsx:325`).
- **1** shimmer duration (`1100ms`) exceeding the charter's motion ceiling.
- **1** `Elevation.floating` applied to every primary button (`FlagshipActionCluster.tsx:90`).
- **1** `elevation: 24` exceeding `Elevation.modal` max of 12 (`StickerPicker.tsx:1325`).

The token layer is well-designed; the work is **enforcement, consumption, and consolidation**, not re-authoring. The highest-leverage move is Phase 0 (source-of-truth consolidation) followed by the radius codemod (M1), because radius inconsistency is the defect most visible at thumbnail scale and most pervasive across the codebase.
