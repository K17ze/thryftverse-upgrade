# ThryftVerse Flagship Upgrade — Icons, Chips, Badges & Pills

> **Component family:** iconography, status pills, activity badges, filter chips, metadata tags, trust/premium badges.
> **Benchmark date:** 2026-08.
> **Source of truth:** `AGENTS.md` §4 (Icon grammar, stroke grammar, hit-area separation), `Design.md` ("Iconography & Optical Alignment", "Visible chrome is not the hit target", settings-row / trust-badge / premium-badge micro specs).
> **Runtime truth:** `frontend/src/design/icons/iconRegistry.ts`, `frontend/src/design/icons/SemanticIcon.tsx`, `frontend/src/components/icons/*`, `frontend/src/components/ui/{AppStatusPill,PremiumStatusPill,ActivityBadge}.tsx`.

---

## 1. 2026 Competitor Benchmark — How Instagram, Pinterest, eBay, Snapchat Handle Icons, Chips & Badges

The 2026 benchmark season reveals a convergent discipline across top-shipping apps: **one icon family, a small set of optical size bands, and a strict semantic contract separating status (read-only) from action (interactive)**. The apps that feel premium are not the ones with the most icons — they are the ones with the fewest *visible* icon decisions.

### Instagram (Meta)

Instagram's 2026 brand refresh (Meta Design blog, "Built to celebrate creativity: the new Instagram brand identity") deliberately *reduced* chrome so community media carries the energy. The updated system introduces Instagram Sans, Instagram Pen, and Instagram Mono, but the in-app icon grammar remains a single outline family with a stable filled-state rule (like → filled heart, save → filled bookmark). Status pills are rare and reserved for genuine transactional state (Paid, Shipped, Delivered). The gradient is "a core part of the brand" but is used "more subtly" — it does not decorate every chip. The lesson for ThryftVerse: **a flagship surface can use zero decorative pills and still feel premium** because media, hierarchy and interaction carry the signal.

### Pinterest (Gestalt)

Pinterest's Gestalt design system (gestalt.pinterest.systems; community breakdown at designsystems.one) is the canonical reference for image-first icon restraint. Gestalt ships "a large, internally consistent, themeable React icon set" with a clean component API, and its accessibility documentation per component is "more complete than most peer systems." The shadcn.io DESIGN.md packaging of Pinterest confirms the discipline: a **two-radius shape system** (16px on buttons/cards, 32px on modals, "nothing in between"), a single accent voltage (Pinterest Red reserved for sign-up CTAs, active tabs, and the wordmark, "never decorative"), and filter chips that are visually subordinate to media. Pinterest does not wrap every filter in a separate grey surface — the selected chip is the only contained one. This maps directly to ThryftVerse's AGENTS.md §4 "Surface budget" and "no card-on-card" rules.

### eBay (evo-web / Skin)

eBay's 2026 badge work (eBay/evo-web #498, PR #683, PR #686) is the most instructive marketplace reference for ThryftVerse because eBay operates the same status/badge/chip taxonomy at scale. Key 2026 decisions:

- **Badge shape shifts by digit count**: circle for 1–2 digits, squircle for 3+ digits, with a `.badge--wide` modifier for clamped values like `99+` (PR #683). This prevents layout overflow without shrinking the badge.
- **Empty badge = dot variant**: a `:empty` badge renders as a tiny dot with no number, unifying the dot-badge and numeric-badge under one component (PR #683).
- **Icon-button badging is automatic via `:has(.badge)`** (PR #686): the overflow/positioning styles apply whenever a badge element is present — no manual modifier class. This is the structural equivalent of ThryftVerse's "badge is a semantic signal, not decoration" principle.
- eBay ships `ebay-badge`, `ebay-chip`, and `ebay-chips-combobox` as distinct components (registry.npmjs.org @ebay/ui-core-react) — **badge and chip are never the same component**, because their interaction contracts differ.

### Snapchat / Live & Social Platforms

The 2026 live-badge pattern (reactnative.live "Presence & Live Badge Patterns") consolidates around three token-driven primitives: `PresenceDot`, `LiveBadge`, and `StatusPill`. The discipline is: **semantic tokens first** (`color.presence.online` not hardcoded hex), **single source of truth** (one module used across the app), **progressive enhancement** (animate on capable devices, fall back when reduced motion is on), and **accessibility-first** (screen-reader announcements, reduce-motion support). Bluesky's 2026 rollout of LIVE badges and cashtag features (font.news "Icon + Type: Badge Systems for Live, Podcast & Social UI") confirms the trend: platforms are "standardizing signals that need consistent visual treatment" because creators publish to multiple ecosystems simultaneously.

### Cross-platform icon mapping

The 2026 cross-platform reality is that no single icon library covers every platform natively. `rn-icon-mapper` (founded-labs) provides bidirectional SF Symbols ↔ Material Icons ↔ Material Community Icons mapping; `unicon` (claudiob/unicon) holds the translation so "an app knows it wants to draw a house" and lets each client draw from the set it ships. Ionicons 5 (ionic.io/blog) ships `outline`, `fill`, and `sharp` variants per icon to "mirror the icon changes in iOS 13 with their new SF Symbols" while remaining Material-compatible. The implication for ThryftVerse: the **semantic name is the contract**, the platform glyph is the rendering — exactly the architecture `iconRegistry.ts` attempts, but does not yet enforce.

---

## 2. Psychology & Principles

### 2.1 Icon recognition speed

2026 eye-tracking and EEG research (Displays, doi:10.1016/j.displa.2026.103548; Open MIND figshare.31389289) confirms that **linear (outline) icons elicit faster responses**, while flat/skeuomorphic icons evoke larger P2/P3 amplitudes and are subjectively preferred. A separate study (HFES, doi:10.1002/hfm.70006) found that **solid (filled) icons are recognized and visually searched significantly better than outline icons, especially when unfamiliar** — but the advantage *decreases with familiarity*. The practical synthesis for ThryftVerse:

- Use **outline as the default resting state** for navigation and utility icons (fast scanning, low visual mass).
- Use **filled as the selected/active state** (higher recognition, signals commitment).
- Keep the outline→filled rule **stable across the whole app** so familiarity compounds. This is exactly `Design.md`'s "Keep stroke/fill state grammar stable" and `iconRegistry.ts`'s `variants: ['regular', 'filled']` on `thryftSave`.

Semantic distance research (Scientific Reports, s41598-026-37943-8) shows icons with **closer semantic distance** (the icon looks like the thing it means) yield better recognition efficiency and faster search times. This validates `iconRegistry.ts`'s banned-metaphor list (lines 3–8): flash/lightning for urgency, shield for generic trust, sparkles for AI, robot/brain for automation are all *remote* metaphors that slow recognition. The registry's `allowedContexts` field is the enforcement mechanism for semantic distance.

### 2.2 The "one family" cognitive principle

Cognitive fluency research (AGENTS.md §27.1, Don Norman's visceral level) shows users form snap quality judgments within seconds. Icon family inconsistency is one of the fastest ways to break the "edited, stable, deliberate" feeling. The 2026 icon-system literature (brainy.ink "Icon System Design"; madegooddesigns.com "Icon Design: A Practical Guide for 2026"; brandvm.com "Iconography in Web Design") is unanimous:

- **One base grid** (24px for product UI, 20px for dense data) with a fixed live area (20px live inside a 24px canvas, 2px padding each side).
- **One stroke weight** across the set (1.5px or 2px at 24px grid) — "the moment one icon uses a thinner line than its neighbors, the whole set looks broken, even if the viewer cannot articulate why" (madegooddesigns.com).
- **Keyline shapes** (square 18×18, circle 20×20, tall 16×20, wide 20×16) so a circle and a square *feel* equal despite the circle needing to be drawn slightly larger (brainy.ink).
- **One optical size band per region** — AGENTS.md §4: "Standard navigation glyphs are 20–24pt. Small metadata glyphs are 14–18pt."

Dutchicon's analysis ("Icon consistency: why consistent icons still feel off") adds the critical nuance: **two icons can share the same 24px bounding box and identical stroke weight yet feel unequal** because optical weight (filled vs outline, circle vs square) determines perceived hierarchy, not geometry. "Pixel perfect accuracy cannot guarantee perceptual consistency. Optical weight determines hierarchy long before labels are read." This is why `Design.md` insists on optical alignment, not bounding-box alignment.

### 2.3 Chip/badge as semantic signal, not decoration

The 2026 design-system consensus (eleken.co "Badge UI: Design Principles"; justfigma.com "Design Badges & Chips in Figma 2026"; SlayHyena Studio) draws a hard line:

- **Chip = Action.** Interactive. Users toggle, filter, select, or remove it. If it has an ✕, it's a chip. Min height 32–36px (touch-friendly). Ships `selected` + `dismiss` states.
- **Badge = Information.** Read-only. Highlights status, counts, or updates without demanding interaction. Min height 20–24px (dense). No dismiss state.
- **Tag = removable metadata.** A chip variant for static labels that can be removed.
- **Dot badge = read-only indicator** for unread count, online status — never for long labels.

Eleken's core rule: "A badge is a promise — only make it when you can keep it." And: "Don't mix dot badges and numeric badges designs on the same navigation bar, it creates visual inconsistency and confuses the signal. Pick one system and stick to it." This maps to AGENTS.md §4's "excessive badges" prohibition and `Design.md`'s "decorative badges without function" in the Avoid list.

### 2.4 Optical alignment

IBM's app-icon guidance (ibm.com/design/language/iconography) states icons are "optically aligned to the center of the icon grid within the boundary box" — geometric centering is insufficient. The lumo design-system commit (github.com/OneXeor-Dev/lumo 9b2e86c) documents why asymmetric icons (pencil, arrow, play, magnifier) have visual centres offset from geometric centres, with references to Apple HIG SF Symbols and Material Iconography. The commit deliberately does *not* ship an automated optical-centre check because of "high false-positive rate without per-icon optical-grid metadata" — meaning optical alignment must be authored per-icon, not computed. This is why `Design.md` says "Align icons optically, not only by bounding box" and why the `iconRegistry.ts` `defaultSize` band exists: it constrains the *canvas*, but the artwork inside still needs per-icon optical tuning.

---

## 3. Current ThryftVerse Audit — Concrete Defects

### 3.1 Icon registry bypass — 514 files import Ionicons directly

A grep for `Ionicons` across `frontend/src` returns **514 files** with direct `@expo/vector-icons` imports, bypassing the semantic registry entirely. The registry itself (`iconRegistry.ts` lines 32–62) defines only ~17 semantic entries, while the codebase uses hundreds of distinct Ionicons names inline. Worse, `SemanticIcon.tsx` lines 21–23 contain an explicit escape hatch:

```tsx
// Fallback: try as direct Ionicons name for backward compat
if (!def) {
  return <Ionicons name={name as any} size={size ?? 20} color={color ?? colors.textPrimary} />;
}
```

This means **any string passed to `SemanticIcon` that is not in the registry silently falls through to a raw Ionicons render** with no context validation, no color-role resolution, and no deprecation warning. The registry's `allowedContexts` enforcement (lines 68–72) and `__DEV__` warning in `SemanticIcon.tsx` lines 26–30 are dead code for the majority of icon usages because most calls never go through `SemanticIcon` at all — they use `<Ionicons>` directly.

**Impact:** metaphor drift (banned icons like sparkles/flash/shield can appear anywhere), color-role inconsistency (every caller picks its own color), and no way to audit which icons the product actually uses.

### 3.2 Dual status-pill systems with incompatible contracts

ThryftVerse ships **two competing status-pill components**:

- **`AppStatusPill.tsx`** (lines 1–115): tones `neutral | accent | positive | negative | warning`; sizes `sm | md`; `Radius.full` (pill); icon optional via `keyof typeof Ionicons.glyphMap`; uses `Type.meta` / `Type.caption` typography; `StyleSheet.hairlineWidth` border.
- **`PremiumStatusPill.tsx`** (lines 1–139): tones `active | sold | paid | shipped | delivered | refunded | pending | error | success | neutral`; `compact` boolean; `Radius.md` / `Radius.sm` (rounded rect, *not* pill); icon optional via `Ionicons.glyphMap`; uses `Type.caption` / `Type.meta`; `borderWidth: 1` (not hairline); includes a status *dot* fallback (lines 96–97) when no icon is supplied.

These two components disagree on **shape** (full-pill vs rounded-rect), **border weight** (hairline vs 1px), **tone taxonomy** (5 affective tones vs 10 transactional states), **icon-vs-dot handling** (icon-only vs icon-or-dot), and **typography**. A single screen that uses both (e.g., order detail showing `PremiumStatusPill` for shipment state and `AppStatusPill` for a warning) produces visible inconsistency in the same viewport — violating AGENTS.md §4 "one icon family, one optical size band" and the radius budget.

### 3.3 ActivityBadge hardcoded hex

`ActivityBadge.tsx` hardcodes `#FF6B35` for the `trending` variant (lines 61–62) and `fastSelling` variant (lines 89–90):

```tsx
trending: {
  icon: 'flame-outline',
  iconColor: '#FF6B35',
  glowColor: '#FF6B35',
  ...
},
fastSelling: {
  icon: 'timer-outline',
  iconColor: '#FF6B35',
  glowColor: '#FF6B35',
  ...
},
```

This bypasses `useAppTheme().colors` entirely. `#FF6B35` is an orange that does not exist in `ThemeColors` and is not the `warning` token (`#ffc765`) or `danger` (`#9b0202`). In dark mode this hardcoded orange will not adapt. This violates `Design.md`'s "Status colours must be truthful and accessible" and the runtime-truth rule ("never hardcode proposed tokens"). The component also names a `PulsingDot` (lines 97–109) but the dot does not actually pulse — it is a static `View` — which is a truthful-UI concern (the name promises motion the render does not deliver, though AGENTS.md §17 prohibits continuous pulsing anyway, so the *correct* fix is to rename or remove the pulse implication, not to add animation).

### 3.4 Inconsistent icon sizes — 16 distinct sizes vs 4 registry bands

The `iconRegistry.ts` `defaultSize` type is `16 | 20 | 24 | 28` (line 25) — four bands. A grep for `size={\d+}` across `.tsx` files reveals **at least 16 distinct hardcoded sizes** in production: `12, 13, 14, 16, 18, 20, 22, 24, 26, 28, 32, 40, 44, 48, 56, 64`. Examples of drift:

- `AuctionDetailScreen.tsx:1009` — `size={12}` chevron (below the 14pt metadata minimum).
- `LookComposerScreen.tsx:1181` — `size={26}` close icon (between the 24 and 28 bands, no optical reason).
- `SustainabilityTags.tsx:208` — `size={13}` (between 12 and 14, sub-pixel oddity).
- `VerificationResponseScreen.tsx:240` — `size={48}` checkmark (empty-state illustration, justifiable but undocumented as a band).
- `StyleQuizScreen.tsx:186` / `RetryState.tsx:24` — `size={64}` (empty-state hero, also undocumented).

The registry's four bands are the right idea, but they are **not enforced** because most icons bypass the registry (§3.1). Sizes 22 and 26 are the most damaging — they sit between bands and create optical-weight inconsistency that users perceive but cannot articulate (dutchicon.com: "Optical weight determines hierarchy long before labels are read").

### 3.5 Chip / badge / pill sprawl — 119+ files

Grep counts across `frontend/src`:
- **`chip|Chip`**: 107 files.
- **`badge|Badge`**: 218 files.
- **`pill|Pill`**: 113 files.

After de-duplicating overlaps, **well over 119 unique files** reference at least one of these patterns. Many are ad-hoc inline `<View>` chips with one-off styling rather than consuming a shared primitive. `ConversationalSearchScreen.tsx` alone has 41 chip matches; `ClosetScreen.tsx` has 36; `AuctionHomeScreen.tsx` has 53; `CreatorAssetPicker.tsx` has 42. This is the "six slightly different pills per squad" anti-pattern that justfigma.com (2026) explicitly warns against: "Design system teams who need one chip primitive instead of six slightly different pills per squad."

`Design.md` acknowledges the chip/badge token slots in `designTokens.ts` (lines 648–670) but there is no single enforced component contract — `AppStatusPill` and `PremiumStatusPill` are two of many, and most screens roll their own.

### 3.6 Deprecated coOwn icon still in the registry

`iconRegistry.ts` line 45:

```ts
coOwn: { ..., deprecated: { reason: 'Stock pie-chart is generic; commission authored co-own fraction mark', replacement: 'authored co-own icon' } },
```

The `deprecated` field exists in the `IconDefinition` interface (line 29) but **nothing in `SemanticIcon.tsx` reads it** — there is no `__DEV__` warning for deprecated icons, no migration path, and no authored replacement has been commissioned. The deprecated `pie-chart-outline` is still the rendered glyph for every co-own surface. This is a stalled migration: the data model is correct, the enforcement is missing.

### 3.7 Authored icons with hardcoded colors and sub-band defaults

- **`OnezeCoinIcon.tsx`** (lines 1–46): hardcoded gradient `['#f4d27b', '#c68a2d']`, hardcoded border `#9b6f22`, hardcoded text `#5d3c08`, hardcoded inner `rgba(255,255,255,0.36)`. Not theme-aware — does not call `useAppTheme()`. In dark mode the gold-on-gold rendering will not adapt. This is a branded coin mark (1z currency), so some brand-color fixedness is defensible, but the *border* and *inner* colors should derive from tokens or at least from a `champagne`/`antiqueGold` role once migrated.
- **`ThryftCartIcon.tsx`** (lines 1–59): default `size = 14` and `color = '#ffffff'`. The 14pt default is **below the registry's 16pt minimum** and below `Design.md`'s "Small metadata glyphs are 14–18pt" floor — 14 is the very bottom edge. The icon is assembled from absolute-positioned `View` primitives with fixed pixel geometry (`top: 2, left: 1, width: 5, height: 3`) that does not scale optically — at 20pt the handle/body/wheels proportions break because the geometry is hardcoded, not ratio-derived. The `#ffffff` default color means it is invisible on a white background unless a caller overrides.

---

## 4. Micro Improvements

1. **Close the `SemanticIcon` fallback hole.** In `SemanticIcon.tsx` lines 21–23, replace the silent fallback with a `__DEV__` warning that names the missing registry entry, and render a neutral placeholder glyph in production. This makes the registry the only path to an icon.

2. **Add `deprecated` enforcement to `SemanticIcon`.** Read `def.deprecated` in `SemanticIcon.tsx` and emit a `__DEV__` `console.warn` naming the replacement, so the `coOwn` migration surfaces during development.

3. **Unify the two status pills into one component with a `shape` prop.** Merge `AppStatusPill` and `PremiumStatusPill` into a single `StatusPill` with `shape: 'pill' | 'rounded'`, a unified tone taxonomy (transactional states map to affective tones internally), and a `dot` boolean that defaults to `!icon`. Preserve both call sites via thin compatibility wrappers during migration.

4. **Replace `ActivityBadge` hardcoded `#FF6B35` with a `warning`-adjacent semantic token.** Add a `color.urgency` token (or reuse `warning`) to `ThemeColors` with light/dark values, and consume it through `useAppTheme()`. Remove the `PulsingDot` name or make it an honest static `StatusDot`.

5. **Snap icon sizes to the four registry bands.** Replace `size={12}` → 14, `size={13}` → 14, `size={22}` → 24, `size={26}` → 24 (or 28 if optical weight demands). Document `32`, `48`, `64` as a fifth "empty-state illustration" band in the registry type.

6. **Make `ThryftCartIcon` geometry ratio-derived.** Replace the fixed `top/left/width/height` values with `size * ratio` computations (as `OnezeCoinIcon` already does for `innerSize`), and raise the default from 14 to 16.

7. **Add a `chip` vs `badge` vs `tag` lint rule.** A grep-based CI check that flags inline `<View style={[{ borderRadius: Radius.full, paddingHorizontal: ... }]}>` patterns outside the canonical chip/badge components.

---

## 5. Macro Improvements

### 5.1 One-icon-grammar architecture

Establish **one semantic icon registry as the only sanctioned path to a glyph**. The architecture:

```
SemanticIcon (entry) → iconRegistry (contract) → platform renderer (Ionicons today, SF Symbols/Material tomorrow)
```

- The registry owns the semantic name, allowed contexts, default size band, color role, variant grammar (outline/filled), and deprecation status.
- `SemanticIcon` is the only component allowed to render an icon. Direct `<Ionicons>` imports are banned via lint.
- The fallback in `SemanticIcon.tsx` lines 21–23 is removed; unknown names fail loudly in dev and render a neutral `questionmark` glyph in production.
- Authored icons (`OnezeCoinIcon`, `ThryftCartIcon`) register a `customComponent` in the registry and are rendered through `SemanticIcon` so they inherit size-band enforcement and color-role resolution.

This mirrors the `unicon` / `rn-icon-mapper` 2026 pattern: the semantic name is the contract, the platform glyph is the rendering. When ThryftVerse later adopts SF Symbols on iOS and Material Symbols on Android, only the registry's `systemName` mapping changes — no screen-level edits.

### 5.2 Chip / badge / pill contract

Define exactly **four primitives**, each with a non-overlapping interaction contract (per eleken.co and justfigma.com 2026):

| Primitive | Interaction | Min height | Shape | States |
|-----------|-------------|------------|-------|--------|
| `StatusBadge` | Read-only | 20–24pt | pill or rounded | default, tone |
| `FilterChip` | Toggle | 32–36pt | rounded | default, selected, disabled |
| `InputTag` | Removable | 32–36pt | rounded | default, dismiss |
| `StatusPill` | Read-only, compound (dot + label + optional icon) | 24–28pt | pill | default, tone, compact |

- `AppStatusPill` and `PremiumStatusPill` collapse into `StatusPill` with a `shape` prop and a unified tone map.
- `ActivityBadge` becomes a `StatusBadge` variant with a `variant` prop for the social-proof use case (viewers, closeted, recentSale, etc.).
- All inline ad-hoc chips in the 119+ files migrate to `FilterChip` or `InputTag`.
- Tone tokens are semantic (`tone: 'success' | 'warning' | 'danger' | 'neutral' | 'accent'`), bound to `ThemeColors`, never hardcoded hex (justfigma.com: "Bind fills and text to semantic color tokens — not one-off hex per screen").

### 5.3 Semantic icon registry enforcement

- Add an ESLint rule (`no-raw-ionicons`) that flags `import { Ionicons } from '@expo/vector-icons'` outside `SemanticIcon.tsx` and the registry.
- Add a `__DEV__` assertion in `SemanticIcon` that validates `context` against `allowedContexts` (already present at lines 26–30 but only fires when `context` is passed — make `context` required for non-decorative icons).
- Add a registry-completeness test that fails if a screen references a semantic name not in `ICON_REGISTRY`.

### 5.4 Optical sizing bands

Formalize **five bands** in the registry `defaultSize` type (currently `16 | 20 | 24 | 28`):

| Band | Size | Use |
|------|------|-----|
| `meta` | 14 | Inline metadata, chevrons in dense rows, badge icons |
| `navigation` | 20 | Secondary controls, share, more, search |
| `primary` | 24 | Navigation, close, primary actions, camera |
| `display` | 28 | Selected tab icons, prominent action glyphs |
| `illustration` | 32 / 48 / 64 | Empty-state and status-result illustrations (not utility) |

Any `size` prop outside these bands is a lint error. This eliminates the 16-size sprawl and aligns with brandvm.com's "Most teams need one compact size, one standard size, and one expressive size" and brainy.ink's 24px/20px grid guidance.

---

## 6. Flagship Acceptance Criteria

### 6.1 Icon grammar

- [ ] **One family.** Every glyph in the app renders through `SemanticIcon` → `iconRegistry`. Zero direct `<Ionicons>` imports outside the registry module.
- [ ] **One optical size band per region.** Navigation rows use 20–24pt; metadata rows use 14–18pt; empty-state illustrations use 32/48/64. No 12, 13, 22, 26 in production.
- [ ] **Stable outline/filled rule.** Outline is the resting state; filled denotes selected/active. The rule is identical on every screen (like → filled heart, save → filled bookmark, tab → filled glyph).
- [ ] **No banned metaphors.** Sparkles, robot/brain, flash-for-urgency, shield-for-generic-trust do not appear anywhere. The registry's banned list (lines 3–8) is enforced by lint.

### 6.2 Stroke grammar (AGENTS.md §4)

- [ ] Separators are hairline (`StyleSheet.hairlineWidth`).
- [ ] Field and explicit outlines are 1pt.
- [ ] 2pt is reserved for focus or selection only.
- [ ] No mixing of 0.5, 1, 1.5, 2pt outlines in the same component family. `PremiumStatusPill`'s `borderWidth: 1` and `AppStatusPill`'s `hairlineWidth` must reconcile to one rule.

### 6.3 "No decorative circles" rule

- [ ] No persistent 44pt filled circle/square around routine header actions (Back, Close, search, overflow, camera, notifications, chevrons). These are transparent 44pt hit targets with 20–24pt glyphs (Design.md "Visible chrome is not the hit target").
- [ ] Contained utility controls (32–36pt visible chrome inside 44pt hit target) appear only when containment communicates selection, priority, or media contrast.
- [ ] Icons inside chips/badges are not wrapped in their own circle — the chip/badge container is the containment.

### 6.4 Chip / badge / pill acceptance

- [ ] Exactly four primitives (`StatusBadge`, `FilterChip`, `InputTag`, `StatusPill`) with documented contracts.
- [ ] Tone colors come from `ThemeColors` tokens, never hardcoded hex.
- [ ] No screen rolls its own inline chip `<View>` — all consume the primitives.
- [ ] Dot badges and numeric badges are not mixed on the same navigation bar (eleken.co).
- [ ] Badge truncation is designed (`99+` / `999+`) and never overflows layout.
- [ ] Max one premium badge cluster per row (Design.md premium-badge micro spec).

---

## 7. Priority & Sequencing

| Phase | Work | Risk | Dependency |
|-------|------|------|------------|
| **P0** | Close `SemanticIcon` fallback; add `deprecated` warning; add `no-raw-ionicons` lint rule | Low — behavioral in dev only | None |
| **P1** | Replace `ActivityBadge` hardcoded `#FF6B35` with semantic token; rename/fix `PulsingDot` | Low | Token migration in `ThemeContext` |
| **P2** | Unify `AppStatusPill` + `PremiumStatusPill` into `StatusPill` with `shape` prop; ship compatibility wrappers | Medium — touches every status-pill call site | P1 token work |
| **P3** | Snap all icon sizes to the five bands; add `illustration` band to registry type | Medium — large mechanical pass | P0 lint enforcement |
| **P4** | Migrate the 119+ ad-hoc chip/badge/pill inline views to the four primitives | High — touches many screens | P2 primitives ready |
| **P5** | Commission authored `coOwn` replacement icon; remove `deprecated` flag; migrate `OnezeCoinIcon`/`ThryftCartIcon` to registry `customComponent` | Medium — design asset work | P0 registry enforcement |
| **P6** | Cross-platform glyph mapping (SF Symbols on iOS, Material Symbols on Android) via registry `systemName` indirection | High — platform split | P0–P5 complete |

P0 and P1 are unblocking and low-risk; they should land first. P2 is the highest-leverage single change because it eliminates the most visible inconsistency. P4 is the largest mechanical effort and should be sequenced per-screen behind the P2 primitive.

---

## 8. Token-Level Spec Table

| Variant | Component | Size band | Icon size | Radius | Border | Typography | Tone source | Hit target | Notes |
|---------|-----------|-----------|-----------|--------|--------|------------|-------------|------------|-------|
| **Navigation icon** | `SemanticIcon` (back, close, search, more) | `primary` 24pt | 24pt | transparent | none | — | `colors.textPrimary` | 44pt transparent | Outline default; no decorative circle (Design.md "Visible chrome is not the hit target") |
| **Secondary action icon** | `SemanticIcon` (share, play, pause, mute) | `navigation` 20pt | 20pt | transparent | none | — | `colors.textPrimary` | 44pt transparent | Outline default; filled only for active media state |
| **Metadata icon** | `SemanticIcon` (hotspot, conditionEvidence, chevron) | `meta` 14–16pt | 14–16pt | transparent | none | — | `colors.textSecondary` / `colors.textMuted` | parent row 44pt | Chevron 16pt, `colors.textMuted`, never overlaps right value (Design.md settings-row micro spec) |
| **Selected tab icon** | `SemanticIcon` (tab bar) | `display` 28pt | 28pt | transparent | none | — | `colors.brand` | 44pt transparent | Filled when selected; outline when inactive |
| **Empty-state illustration** | `SemanticIcon` (checkmark-circle, alert-circle) | `illustration` 48–64pt | 48–64pt | transparent | none | — | `colors.success` / `colors.danger` / `colors.textMuted` | n/a (non-interactive) | Documented as a band, not a one-off size |
| **Status pill (transactional)** | `StatusPill` (was `PremiumStatusPill`) | 24–28pt height | 12pt compact / 14pt standard | `Radius.full` (pill) or `Radius.md` (rounded) | 1px `colors.border` / `colors.borderSubtle` | `Type.caption` / `Type.meta`, `Typography.family.semibold` | `ThemeColors` semantic tone | n/a (read-only) | Dot fallback when no icon; max one premium cluster per row |
| **Status pill (affective)** | `StatusPill` (was `AppStatusPill`) | sm/md | 12pt sm / 14pt md | `Radius.full` | `StyleSheet.hairlineWidth` | `Type.meta` / `Type.caption`, `Typography.family.bold` | `ThemeColors` semantic tone | n/a (read-only) | Unified with transactional pill via `shape` prop |
| **Status badge (social proof)** | `StatusBadge` (was `ActivityBadge`) | 24–28pt height | 14pt | `Radius.lg` | `StyleSheet.hairlineWidth` | `Type.meta`, `Typography.family.medium`/`regular` | `ThemeColors` semantic tone (no `#FF6B35`) | n/a (read-only) | `PulsingDot` renamed to `StatusDot` (no false motion promise) |
| **Filter chip** | `FilterChip` | 32–36pt height | 16pt leading (optional) | `Radius.full` or `Radius.lg` | 1px `colors.border` default; 2px `colors.brand` selected | `Type.caption`, `Typography.family.semibold` | `ThemeColors` neutral/brand | 44pt | `selected` + `disabled` states; checkmark leading when selected |
| **Input tag** | `InputTag` | 32–36pt height | 16pt leading | `Radius.full` | 1px `colors.border` | `Type.caption`, `Typography.family.regular` | `ThemeColors` neutral | 44pt | Trailing `×` dismiss; removable |
| **Trust badge (seller verification)** | `StatusBadge` variant | 20–24pt icon | 16–20pt | inline (no container) | none | `Type.captionElevated` | `colors.success` / `commerceTrust` / `antiqueGold` (post-migration) | parent row 44pt | Only if trust signal is real (Design.md trust-card micro spec) |
| **Premium badge** | `StatusBadge` variant | 24–28pt height | 16–20pt | `Radius.full` | optional `goldBorderLight`/`goldBorderDark` 1px | `Type.meta`, `colors.textPrimary` / `luxuryOnAccent` | `antiqueGold` / `champagne` (post-migration) | n/a | Only for backend-confirmed premium/verified/authenticated status; never sole focus signal (Design.md premium-badge micro spec) |
| **Authored coin icon** | `SemanticIcon` → `OnezeCoinIcon` (`customComponent`) | `meta` 16–20pt | 16–20pt | `Radius.full` (coin) | 1px token border | `Type.meta` bold, `colors.textPrimary` | `champagne`/`antiqueGold` gradient (post-migration) | parent 44pt | Register in `ICON_REGISTRY` with `source: 'authored'`; migrate hardcoded hex to tokens |
| **Authored cart icon** | `SemanticIcon` → `ThryftCartIcon` (`customComponent`) | `meta` 16pt | 16pt | transparent | none | — | `colors.textInverse` / caller override | parent 44pt | Geometry ratio-derived from `size`; default raised from 14 to 16 |

---

## 9. References

### Web sources (2026 benchmark)

- Instagram brand identity refresh — Meta Design blog: https://www.meta.com/design-at-meta/blog/the-new-instagram-brand-identity/
- Pinterest Gestalt design system: https://gestalt.pinterest.systems/
- Pinterest DESIGN.md spec (shadcn.io packaging): https://www.shadcn.io/design/pinterest
- Gestalt breakdown — DesignSystems.one: https://www.designsystems.one/design-systems/gestalt
- eBay badge enhancements (evo-web #498): https://github.com/eBay/evo-web/issues/498
- eBay badge spec update (PR #683): https://github.com/eBay/evo-web/pull/683
- eBay icon-button `:has(.badge)` (PR #686): https://github.com/eBay/evo-web/pull/686
- eBay ui-core-react component registry: https://registry.npmjs.org/@ebay/ui-core-react
- Badge UI design principles (eleken.co, 2026): https://www.eleken.co/blog-posts/badge-ui-design
- Design Badges & Chips in Figma (justfigma.com, 2026): https://justfigma.com/designing-badges-and-chips-in-figma-status-tags-and-handoff/
- Chips vs Badges (SlayHyena Studio, 2026-04): https://www.linkedin.com/posts/slayhyena-studio_uidesign-uxdesign-designsystems-activity-7451548560380157952-td8H
- Icon + Type: Badge Systems for Live, Podcast & Social UI (font.news): https://font.news/icon-type-designing-badge-systems-for-live-podcast-and-social
- Presence & Live Badge Patterns — React Native (reactnative.live): https://reactnative.live/design-system-patterns-for-live-badges-and-presence-indicato
- Status Pill — Nexub DS: https://nexub.design/components/status-pill
- rn-icon-mapper (SF Symbols ↔ Material mapping): https://github.com/founded-labs/rn-icon-mapper
- unicon (cross-system icon concept translation): https://github.com/claudiob/unicon
- Ionicons 5 announcement (outline/fill/sharp variants): https://ionic.io/blog/announcing-ionicons-5
- Ionicons repository: https://github.com/ionic-team/ionicons
- Icon System Design (brainy.ink, 2026): https://brainy.ink/paper/icon-system-design
- Icon Design: A Practical Guide for 2026 (madegooddesigns.com): https://madegooddesigns.com/icon-design-guide/
- Iconography in Web Design — size & style consistency (brandvm.com): https://www.brandvm.com/post/iconography-web-design-size-style-icons
- Icon consistency: why consistent icons still feel off (dutchicon.com): https://dutchicon.com/icon-consistency-ui-design/
- Consistent icon system: multiple styles (dutchicon.com): https://dutchicon.com/consistent-icon-system/
- IBM Design Language — App icons & optical alignment: https://www.ibm.com/design/language/iconography/app-icons/usage/
- lumo touch-container vs visible glyph + icon_label_tautology (commit 9b2e86c): https://github.com/OneXeor-Dev/lumo/commit/9b2e86c1f2e78ded067a55b011f4820f89fa4eed
- Icon visual search eye-tracking study (Displays, 2026): https://doi.org/10.1016/j.displa.2026.103548
- Neurocognitive Dynamics of Icon Design (EEG, 2026): https://doi.org/10.6084/m9.figshare.31389289
- Outline or Solid? Icon style & perception (HFES): https://doi.org/10.1002/hfm.70006
- Icon semantic distance & visual search (Scientific Reports, 2026): https://www.nature.com/articles/s41598-026-37943-8
- Android adaptive icons (Jetpack Compose): https://developer.android.com/develop/ui/compose/system/icon_design_adaptive
- Apple Icon Composer (WWDC25): https://developer.apple.com/videos/play/wwdc2025/361/

### Internal source files

- `AGENTS.md` §4 — Icon grammar, stroke grammar, hit-area separation, surface/radius budgets
- `AGENTS.md` §27 — 2026 flagship UX psychology principles
- `Design.md` — "Iconography & Optical Alignment", "Visible chrome is not the hit target", settings-row / trust-card / premium-badge micro specs, visual-geometry tokens
- `frontend/src/design/icons/iconRegistry.ts` — semantic registry (17 entries, 4 size bands, banned metaphors, deprecated coOwn)
- `frontend/src/design/icons/SemanticIcon.tsx` — entry component with silent fallback (lines 21–23) and unused `deprecated` handling
- `frontend/src/components/icons/OnezeCoinIcon.tsx` — hardcoded gradient/hex coin mark
- `frontend/src/components/icons/ThryftCartIcon.tsx` — fixed-pixel geometry, default 14pt, `#ffffff` default
- `frontend/src/components/ui/AppStatusPill.tsx` — affective-tone pill, `Radius.full`, hairline border
- `frontend/src/components/ui/PremiumStatusPill.tsx` — transactional-tone pill, `Radius.md/sm`, 1px border, dot fallback
- `frontend/src/components/ui/ActivityBadge.tsx` — hardcoded `#FF6B35` (lines 61–62, 89–90), non-pulsing `PulsingDot`
- `frontend/src/theme/designTokens.ts` — chip/badge/pill token slots (lines 648–670), `Type.meta`/`Type.caption` typography
- `frontend/src/theme/ThemeContext.tsx` — runtime `ThemeColors` source of truth

---

## 10. Summary

ThryftVerse's icon/chip/badge system has the right *architecture* (`iconRegistry.ts` semantic contracts, `SemanticIcon.tsx` entry point, token slots in `designTokens.ts`) but the wrong *enforcement*. The registry is bypassed by 514 files, the fallback hole in `SemanticIcon` lets any string through, two status-pill systems disagree on shape and border, `ActivityBadge` hardcodes a hex that ignores dark mode, and 16 distinct icon sizes drift around 4 declared bands. The 2026 competitor benchmark (Instagram's chrome reduction, Pinterest's two-radius discipline, eBay's badge/chip separation, the live-badge token-first pattern) and the 2026 research literature (outline-for-speed, filled-for-familiarity, one-family cognitive fluency, optical-weight-over-pixels) all point to the same fix: **one enforced registry, four primitives with non-overlapping contracts, five optical size bands, semantic tone tokens, and lint that makes the contract real.** The priority sequence (P0–P6) lands the low-risk enforcement first, unifies the highest-visibility inconsistency second, and sequences the large mechanical migration behind the ready primitives.
