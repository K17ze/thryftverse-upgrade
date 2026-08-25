# ThryftVerse Flagship Upgrade — Cards & Surfaces

> Flagship upgrade research for ThryftVerse cards and surface primitives.
> Benchmark date: August 2026. Canonical references: `AGENTS.md` §4 (quality bar, surface/radius budgets, thumbnail & squint tests), `Design.md` (elevation scale, shape/stroke/surface budget, masonry/product/trust card micro specs).
> Runtime source of truth: `frontend/src/theme/designTokens.ts` (`Radius`, `Elevation`, `Control`, `Space`).

---

## 1. 2026 Competitor Benchmark — Pinterest, Instagram, eBay

The 2026 card landscape has converged on a single dominant idea: **the image is the card; chrome recedes until it is nearly invisible.** The strongest marketplace and discovery apps no longer wrap every content unit in a bordered, shadowed rectangle. They let media carry the visual weight and reserve surfaces for genuine containment — transactional state, trust, input boundaries, or modal separation.

### Pinterest — image-as-card, near-invisible chrome

Pinterest remains the benchmark for media-first discovery. In 2026, Pinterest's mobile feed is a two-column staggered masonry grid where **the image itself is the surface**. There is no visible card frame around each pin; the neutral white canvas and 8–12pt gutters do all the separation work. Pin radius sits at roughly 12–16pt, applied to the image, not to a wrapping container. Metadata (title, price, seller) appears as flat text below the image with no background fill, no border, and no shadow. The only chrome that floats above media is the save button — a transparent 44pt hit target with a 22pt glyph that appears on hover/press, not a persistent filled circle.

The lesson for ThryftVerse: on discovery surfaces, **avoid visible frames around every image** (`Design.md` §Component B: "Image itself is the card; avoid visible frames around every image"). Pinterest's quality comes from vivid media, true aspect ratios, modular discovery, and perceived performance — not from beige backgrounds or decorative containment.

### Instagram — full-attention media, stable action grammar

Instagram's feed in 2026 is a vertical scroll where each post occupies 70%+ of the viewport. The media area (4:5 portrait or 1:1 square) fills the card width edge-to-edge with no card padding. The action row (like, comment, share, save) sits below the media as flat 44pt hit targets with 24pt glyphs — no pill backgrounds, no contained buttons. The profile grid, since the 2024–2025 redesign, now previews each post as a 3:4 portrait thumbnail rather than a square, giving media more vertical presence. Chrome is deliberately lighter than media at every layer.

The lesson: **one post/listing should own at least 70% of the viewport** (`Design.md` §Component A). Media loads with crossfade; skeletons match final aspect ratio exactly. Action feedback is instant. The card is not a decorated rectangle — it is a media unit with a stable, restrained action grammar.

### eBay Evo — marketplace utility with controlled density

eBay's Evo design system (2024–2026) is the marketplace benchmark for dense product grids. The `ItemCard` component surfaces image, title, price, condition, and seller signal in a compact unit that works in both lists and grids. Elevation is disciplined: a single `card` shadow token (`0 2px 7px rgba(0,0,0,0.15)`) is used for product cards, not a proliferation of ad-hoc shadows. Filter and refinement patterns use stacked groups with applied-chip review and a sticky apply bar — a single dominant panel, not a cascade of grey surfaces.

The lesson for ThryftVerse commerce: **density and trust clarity matter more than decoration**. eBay's card succeeds because it has a stable internal order (title → price → condition → seller), consistent metadata, and one primary action. It does not cram two ideas into one card.

### Cross-platform convergence

Across all three benchmarks, the 2026 consensus is:

1. **Image-as-card on discovery** — no frame around media; the image's own radius is the only shape.
2. **Surfaces are reserved for meaning** — transactional state, trust, input boundaries, modal separation. Routine rows use flat canvas + hairlines.
3. **Elevation discipline** — one or two shadow tokens across the whole system, not per-component ad-hoc shadows. Material 3 expresses depth through tonal color overlays, not just shadows.
4. **One concept per card** — cards that carry two ideas or scattered actions read as clutter and slow decisions.
5. **Restraint over decoration** — quality comes from composition, hierarchy, rhythm, and contrast — not from shadows on every surface, cards around every element, or pills around every control.

Sources:
- UNATION, "Mobile Card UI Design Trends and Best Practices for 2026" — https://www.unation.com/mobile-card-ui-design-trends-and-best-practices-for-2026/
- Stan Vision, "UI Card Design: Examples, Best Practices & Common Patterns" — https://www.stan.vision/journal/ui-card-design-examples-best-practices-and-common-patterns
- GenDesigns, "Mobile UI Patterns 2026: 19 Patterns and When to Use Them" — https://gendesigns.ai/blog/mobile-ui-patterns-2026
- Oh My Drifter, "Card UI Design Trends for Mobile Apps in 2026" — https://ohmydrifter.com/card-ui-design-trends-for-mobile-apps-in-2026/
- DesignSystems.one, "eBay Evo Design System Breakdown" — https://www.designsystems.one/design-systems/ebay-design
- Creative Bloq, "eBay's interface update is a much needed glow-up" — https://www.creativebloq.com/design/im-impressed-by-ebays-new-human-centred-ui-evolution
- 9grid, "Instagram Image Size Guide (2026)" — https://9grid.app/blog/instagram-image-size-guide
- Superdesign, "How Google Designs Their UI: A Material Design Breakdown (2026)" — https://superdesign.dev/blog/material-design-system

---

## 2. Psychology & Principles — Why Surfaces Work and When They Fail

### Gestalt grouping via surfaces

Gestalt psychology tells us that viewers perceive groupings before they perceive individual elements. The six core principles — proximity, similarity, continuity, closure, figure-ground, and common fate — govern how the eye organises a screen. **Surfaces are the designer's tool for enforcing "common region"**, the extrinsic grouping cue that tells the viewer "these elements belong together." But common region is expensive: it adds visual weight, chrome, and cognitive surface area. When every element gets its own region, the grouping signal is destroyed — everything is grouped, so nothing is grouped.

The highest-leverage grouping tool is **proximity**, not containment. A form label placed 4pt from its input reads as one unit without any box. A list with consistent row spacing reads as one list without card backgrounds. Surfaces should be reserved for when proximity alone cannot communicate the grouping — when there is a genuine state boundary, interaction boundary, or material separation that the viewer needs to perceive.

Source: Digital Polo, "Gestalt Principles of Design: The 6 Rules (2026)" — https://www.digitalpolo.com/gestalt-principles-of-design/

### Containment = meaning

This is the core principle behind ThryftVerse's surface budget (`AGENTS.md` §4: "Visible containment must have meaning"). A persistent fill or outline is justified only for:

- **Selection** — the user has chosen this item.
- **Primary action** — this is the dominant CTA.
- **Input boundary** — this is an editable field.
- **Status** — this carries a real state (pending, shipped, sold, verified).
- **Media contrast** — text needs a scrim to be legible over an image.
- **Grouping that is unclear without it** — a set of related rows that proximity alone cannot bind.

Everything else defaults to transparent. Ordinary Back, search, overflow, camera, notification and chevron controls default to transparent 44pt targets. Routine list rows default to flat canvas + hairline separators. When containment is used decoratively — a grey pill around a chevron, a card around a single label, a surface around every settings row — it reads as amateur because it signals that the designer did not decide what matters.

### Visual weight and the flat-canvas philosophy

Visual weight is the perceived "heaviness" of an element on screen. A filled grey surface weighs more than flat canvas. A shadowed card weighs more than a bordered card. A bordered card weighs more than a hairline-separated row. When every element carries equal visual weight, hierarchy collapses — the eye has no path from primary to secondary to tertiary.

The **flat-canvas philosophy** treats the screen background as the default structure. Hierarchy is built through typography scale, spacing rhythm, and selective media dominance — not through stacking surfaces. This is why Pinterest, Instagram, and Linear feel premium: they trust the canvas. They do not wrap every concept in a grey box. The 2026 "dense interfaces" trend (Notion, Linear, Superhuman, Stripe) confirms that information hierarchy beats minimalism when the hierarchy is intentional — density achieved through modular bento grids, not through card-on-card stacking.

Source: MyDesigner, "Dense Interfaces Are Back: Why Information Hierarchy Beats Minimalism in 2026" — https://mydesigner.gg/blog/dense-interfaces-information-hierarchy-2026

### Why card-on-card reads as amateur

Card-on-card composition is the single most reliable signal of prototype-level design. When a card nests inside another card without a distinct interaction or state boundary, the viewer perceives **redundant containment** — two surfaces fighting to say the same thing. The inner card's border or shadow adds visual noise without adding meaning. The thumbnail test (25% scale) reveals this immediately: nested rounded rectangles dominate the silhouette, and the actual content recedes.

`AGENTS.md` §4 is explicit: "No card-on-card composition. A nested surface requires a distinct interaction or state boundary. Otherwise flatten it." The squint test confirms: when you blur the screen, nested surfaces create a "stack of grey rectangles" impression rather than a clear figure-ground relationship where content dominates and chrome recedes.

The fix is almost always to **flatten** — remove the inner surface and let the outer surface (or the flat canvas) carry the content with spacing and hairlines for structure. If the inner content genuinely has a different state (e.g. an embedded order-status card inside a transaction detail), give it a distinct visual treatment (a status pill, a tinted strip) rather than a full nested card.

---

## 3. Current ThryftVerse Audit — Concrete Defects

### Token discipline: good on radius, poor on elevation

A grep across `frontend/src/components` reveals the token-vs-hardcoded split:

- **`borderRadius`**: 1,219 raw occurrences vs 1,232 `Radius.*` token references. This is roughly 50/50 — nearly half of all radius values are hardcoded numbers rather than tokens. This is a significant discipline gap for a system that mandates "Use no more than two non-avatar radius sizes in one viewport" (`AGENTS.md` §4).
- **`shadow`**: 382 total references. Of these, only **33 use `Elevation.*` tokens** while **168 use raw `shadowColor`/`shadowOpacity`/`shadowRadius`/`shadowOffset` properties** across **32 files**. This means roughly **5x more hardcoded shadow configurations than tokenised ones**. The elevation contract defined in `designTokens.ts:275` (`Elevation.none/subtle/card/floating/modal`) is being bypassed in the majority of components.
- **`elevation`**: 91 total references (the Android `elevation` property), many of which are inside the `Elevation` token objects themselves.

This is the root systemic defect: **the elevation token system exists but is under-adopted.** Per `AGENTS.md` §4, "If three or more screens exhibit the same visual defect, inspect and correct the shared primitive first." The shared primitive here is the shadow/elevation system — 32 files contain hand-rolled shadow configs that will inevitably drift from the canonical scale.

### Defect 1 — FlagshipAssetCard: card-on-card risk and inconsistent radius

`FlagshipAssetCard.tsx` renders a bordered, surface-filled card (`root` style, line 90–100) containing:
- An image thumbnail with `Radius.md` (8pt) inside a card with `Radius.lg` (12pt) — two different radii in one component, violating the radius budget.
- A status dot with `Radius.sm` (4pt) — a third radius.
- An ownership bar with `Radius.sm` (4pt) — a fourth radius.
- An action button with `Radius.md` (8pt) — a fifth radius.

**Five distinct radius values in a single card.** This fails the "at most two non-avatar radius sizes per viewport" budget. The card also uses `borderWidth: 1` + `backgroundColor: colors.surface` simultaneously — a fill + border combination that `Design.md` §"Shape, stroke and surface budget" warns against: "Avoid simultaneous fill + border + shadow on routine cards. Choose the minimum treatment that makes hierarchy legible."

### Defect 2 — FlagshipOrderCard: same pattern, same problems

`FlagshipOrderCard.tsx` mirrors `FlagshipAssetCard` almost exactly:
- `root` (line 92–103): `backgroundColor: colors.surface`, `borderRadius: Radius.lg`, `borderWidth: 1`, `borderColor: colors.border` — fill + border on a routine list card.
- `imageWrap` (line 104–110): `Radius.md` (8pt) — second radius inside the card.
- `PremiumStatusPill` (line 75) — likely introduces a `Radius.full` pill, a third radius.

This is a **list-row context** (orders are scanned, not browsed), yet it uses full card containment. Per `Design.md` and the `FlatRow` primitive's own documentation (line 19–21): "Use this instead of card-wrapped rows whenever the row is part of a list and does not meet the card budget criteria." `FlagshipOrderCard` should arguably be a `FlatRow` variant or a flat row with a status pill, not a bordered surface.

### Defect 3 — FlagshipProductCard vs FlagshipAssetCard: architectural overlap

`FlagshipProductCard.tsx` and `FlagshipAssetCard.tsx` represent two fundamentally different surface contracts that are both called "card":

- **FlagshipProductCard** (discovery): correctly uses **image-as-card** — no card background, no border, no shadow. The image wrap (`imageWrap`, line 126–130) has `borderRadius: Radius.lg` and `backgroundColor: colors.surfaceAlt` (for loading), but the root has no surface fill. Metadata sits as flat text below. This is the correct Pinterest/Instagram pattern. The `conditionPill` (line 178–187) introduces `Radius.full` — acceptable as an avatar-class pill.
- **FlagshipAssetCard** (portfolio/ledger): uses **full card containment** — surface fill + border + radius. This is a list/ledger context where flat rows would be more appropriate.

The overlap: both are "Flagship*Card" components, but they follow opposite surface contracts. There is no shared contract documenting when to use image-as-card vs contained-card. This ambiguity will propagate — new cards will copy whichever pattern the developer sees first.

### Defect 4 — PremiumFormCard: nesting risk and fill+border

`PremiumFormCard.tsx` (line 48–56) uses `backgroundColor: colors.surface`, `borderRadius: Radius.lg`, `borderWidth: 1`, `borderColor: colors.border` — fill + border on a form container. The danger is **card-on-card nesting**: when form fields (which per `Design.md` §form-field micro spec should have their own `colors.input` background + 1px border) are placed inside `PremiumFormCard`, the result is a bordered field inside a bordered card — redundant containment. The form field's border already communicates "this is an input boundary"; the outer card's border adds nothing except visual noise.

### Defect 5 — PremiumListSection: double-surface with FlatRow

`PremiumListSection.tsx` wraps children in a bordered surface card (`card` style, line 60–66). When `FlatRow` children (which have no background, no border, no radius by design) are placed inside, the result is **one surface binding a set of flat rows** — this is actually the correct pattern per `Design.md` §"Shape, stroke and surface budget": "One group surface may bind a related set of rows." However, the `PremiumListSection` card uses `borderWidth: StyleSheet.hairlineWidth` (good) but also `backgroundColor: colors.surface` — if the screen background is also `colors.surface`, the card is invisible and the border is doing all the work. If the screen background is `colors.background` (white), the `colors.surface` (#F5F5F5) fill creates a visible grey panel. The intent is ambiguous and theme-dependent.

### Defect 6 — ElevatedSurface: variant confusion

`ElevatedSurface.tsx` exposes four variants (`surface`, `elevated`, `subtle`, `tint`) but the naming is confusing:
- `surface`: `colors.surface` fill + `colors.border` + `Elevation.none` (no shadow).
- `elevated`: `colors.surface` fill + `colors.border` + `Elevation.card` (shadow).
- `subtle`: `colors.surfaceAlt` fill + `colors.borderSubtle` + `Elevation.subtle`.
- `tint`: `colors.surfaceAlt` fill + `colors.borderSubtle` + `Elevation.none`.

The `elevated` variant uses **fill + border + shadow simultaneously** — the exact combination `Design.md` warns against. A surface that is shadow-elevated does not also need a border; the shadow is the separation signal. The border + shadow combo reads as "I wasn't confident which separation tool to use, so I used both."

### Defect 7 — FlatRow: the correct primitive is under-used

`FlatRow.tsx` is the most disciplined surface primitive in the codebase. It has no card background, no border, no radius. It uses whitespace, inset hairline separators, and typography for structure. Its documentation (line 19–21) explicitly states it should replace card-wrapped rows in list contexts. Yet `FlagshipOrderCard` and `FlagshipAssetCard` both reimplement contained rows instead of composing `FlatRow`. The under-use of `FlatRow` is a systemic missed opportunity — it is the canonical "flat canvas" primitive but is bypassed in favor of bespoke bordered cards.

---

## 4. Micro Improvements

### Per-component fixes

1. **FlagshipProductCard** — Already close to correct. Micro fixes:
   - The `conditionPill` (line 178) uses `colors.surfaceAlt` fill + hairline border — acceptable, but verify it does not appear simultaneously with the save button's scrim, creating two competing chrome elements over the image.
   - The `videoBadge` (line 140) uses `rgba(0,0,0,0.55)` — hardcoded, should use a token or `colors.overlay` variant.
   - Title uses `FontFamily.medium` (line 160) but `Design.md` product card micro spec says `Type.body` or `Type.captionElevated` — verify the weight matches the spec's intent.

2. **FlagshipAssetCard** — Flatten the radius budget:
   - Reduce to two radii: `Radius.lg` (12pt) for the card, `Radius.full` for the status dot (or keep the dot as a small `Radius.sm` but document it as a status indicator, not a card element).
   - Remove `borderWidth: 1` and rely on either the surface fill OR a hairline border, not both.
   - Consider converting to a `FlatRow` variant with a status pill and ownership bar, since this is a ledger/list context.

3. **FlagshipOrderCard** — Convert to flat row:
   - Replace the bordered card with a `FlatRow`-style flat row: thumbnail + title/price/status + chevron, separated by hairlines.
   - The `PremiumStatusPill` is the only element that earns containment (it carries status).
   - Remove `backgroundColor: colors.surface` and `borderWidth: 1` from root.

4. **PremiumFormCard** — Remove the fill, keep the grouping:
   - Drop `backgroundColor: colors.surface` — let the form fields' own backgrounds define the editable region.
   - Keep a hairline border or simply use spacing + a section header to group the form. The header (`title`/`subtitle`) already communicates grouping via proximity.

5. **ElevatedSurface** — Fix the `elevated` variant:
   - Remove `borderColor` when shadow is applied. Use either border OR shadow, not both.
   - Rename variants for clarity: `flat` (no shadow, optional border), `raised` (shadow, no border), `tinted` (alt fill, no shadow), `subtle` (alt fill + subtle shadow).

6. **PremiumListSection** — Document the intent:
   - If the screen background is `colors.background`, the `colors.surface` fill is correct (visible grouping).
   - If the screen background is `colors.surface`, drop the fill and use border-only grouping.
   - Add a `flat` variant that uses no fill and no border — just spacing + header — for screens that are already surface-dense.

### Token-level micro fixes

- Replace all 168 hardcoded `shadowColor/shadowOpacity/shadowRadius/shadowOffset` blocks with `Elevation.*` token spreads. This is a mechanical migration across 32 files.
- Audit the 1,219 hardcoded `borderRadius` values and migrate to `Radius.*` tokens. Prioritise the flagship component directory first.

---

## 5. Macro Improvements — Card/Surface Architecture

### When to use surface vs flat canvas

ThryftVerse needs a **decision contract** that every card/surface consumer follows:

| Context | Surface contract | Primitive |
|---|---|---|
| Discovery masonry (Explore, boards, similar items) | Image-as-card, no frame | `FlagshipProductCard` pattern |
| Feed post/listing unit | Media-dominant, flat action row | Feed post component |
| List/ledger (orders, portfolio, settings rows) | Flat canvas + hairlines, one optional group surface | `FlatRow` inside `PremiumListSection` (flat variant) |
| Form/account editing | Flat canvas, fields carry their own input boundary | `PremiumFormCard` (borderless) + form fields |
| Trust/commerce (buyer protection, shipping, returns) | One surface panel with hairline border, no shadow | `ElevatedSurface` flat variant |
| Modal/sheet/dialog | Shadow-elevated, no border | `ElevatedSurface` raised variant |
| Sticky action dock | Shadow-elevated (`Elevation.floating`), glass background | Dock component |

The default is **flat canvas**. Surfaces are opt-in, not opt-out. A component must justify why it needs containment before adding a fill, border, or shadow.

### Elevation contract

The elevation scale in `designTokens.ts:275` defines five levels. The contract should be:

- **`Elevation.none`** — default for all list rows, form containers, trust strips, settings groups. No shadow.
- **`Elevation.subtle`** — rarely used; only when a card sits on a same-colour canvas and needs barely-perceptible separation.
- **`Elevation.card`** — elevated cards that are genuinely tappable and need to read as floating above the canvas. Use sparingly; most "cards" should be `none`.
- **`Elevation.floating`** — sticky docks, FABs, overlays that separate from scroll content.
- **`Elevation.modal`** — bottom sheets, dialogs. Clear material separation.

**Never combine border + shadow on the same surface.** Border is for flat separation; shadow is for elevation. If a surface is elevated, the shadow is the separation signal and the border is redundant. If a surface is flat, the border (hairline) is the separation signal and the shadow is unnecessary.

In dark mode, shadows become mostly invisible. The 2026 consensus (Material 3, SAP Fiori, Fluent 2) is to use **tonal elevation** — shifting the surface color lighter as it rises — rather than relying on shadows alone. ThryftVerse's `colors.surface` vs `colors.surfaceElevated` tokens already support this; the contract should mandate that elevated surfaces in dark mode use `colors.surfaceElevated` fill, not just a shadow.

Sources:
- SAP Fiori, "Elevation" — https://www.sap.com/design-system/fiori-design-android/v26-1/foundations/elevation
- Atlassian Design, "Elevation" — https://atlassian.design/foundations/elevation
- Fluent 2, "Elevation" — https://fluent2.microsoft.design/elevation
- Koder Design, "Elevation system" — https://kds.koder.dev/en-US/reference/themes-elevation.html

### Radius contract

The radius scale in `designTokens.ts:45` defines seven values. The contract:

- **`Radius.none` (0)** — full-bleed images, sharp edges.
- **`Radius.sm` (4)** — hairline tags, tiny chips, internal controls.
- **`Radius.md` (8)** — compact thumbnails, small cards in dense modules.
- **`Radius.lg` (12)** — standard product/discovery cards, media, medium cards.
- **`Radius.xl` (16)** — form fields, settings groups, large cards.
- **`Radius.xxl` (24)** — navigation docks and genuinely dominant panels only.
- **`Radius.full` (999)** — avatars, pill buttons, story rings, status pills.

**Per viewport: at most two non-avatar radius sizes** (`AGENTS.md` §4). Avatar-class radii (`full`) do not count toward the budget. A modal may introduce one additional radius. The current codebase violates this routinely — `FlagshipAssetCard` alone uses five radii. The fix is to pick two radii per screen context and enforce them through the component contract.

---

## 6. Flagship Acceptance Criteria

A card/surface passes flagship review only when ALL of the following are true:

### Surface budget
- [ ] Above the fold, there is **at most one dominant non-media panel**.
- [ ] No row, icon, filter, or section is wrapped in a separate grey surface unless it carries a distinct state or interaction boundary.
- [ ] Flat canvas, spacing, and hairlines are the default utility structure.
- [ ] No card-on-card composition. Nested surfaces are flattened unless the inner surface has a distinct interaction or state boundary.

### Radius budget
- [ ] No more than **two non-avatar radius sizes** appear in one viewport.
- [ ] A modal may introduce one additional radius.
- [ ] No component uses more than two non-avatar radii internally.
- [ ] All radius values come from `Radius.*` tokens — zero hardcoded numbers.

### Elevation contract
- [ ] All shadows come from `Elevation.*` tokens — zero hardcoded `shadowColor`/`shadowOpacity`/`shadowRadius`/`shadowOffset` blocks.
- [ ] No surface combines border + shadow simultaneously.
- [ ] Elevated surfaces in dark mode use `colors.surfaceElevated` fill (tonal elevation), not shadow alone.
- [ ] `Elevation.none` is the default; shadows are opt-in with justification.

### Stroke grammar
- [ ] Separators are hairline (`StyleSheet.hairlineWidth`).
- [ ] Fields and explicit outlines are 1pt.
- [ ] 2pt is reserved for focus or selection only.
- [ ] No arbitrary 0.5, 1, 1.5, 2pt outlines mixed in the same component family.

### Thumbnail test
- [ ] At 25% scale, the primary object and reading order remain obvious.
- [ ] Repeated rounded rectangles do not dominate the silhouette.

### Squint test
- [ ] Under blur/squint, media/identity/content dominates.
- [ ] Navigation and utility chrome recede.
- [ ] No "stack of grey rectangles" impression.

---

## 7. Priority & Sequencing

### Phase 1 — Token migration (mechanical, high impact)
1. Replace all 168 hardcoded shadow configs across 32 files with `Elevation.*` token spreads.
2. Audit and migrate hardcoded `borderRadius` values to `Radius.*` tokens, starting with `components/flagship/`.
3. Fix `ElevatedSurface` `elevated` variant — remove border when shadow is applied.

### Phase 2 — Component contract fixes (structural)
4. Convert `FlagshipOrderCard` to a flat-row pattern (no surface fill, no border; use `FlatRow` composition with a status pill).
5. Flatten `FlagshipAssetCard` radius budget to two radii; remove fill+border combo.
6. Remove `PremiumFormCard` surface fill; rely on field boundaries + header proximity for grouping.
7. Document the `PremiumListSection` fill intent (add a `flat` variant).

### Phase 3 — Architecture contract (systemic)
8. Write and enforce a card/surface decision contract (the table in §5 above) as a linting rule or PR checklist.
9. Audit all screens for card-on-card composition; flatten violations.
10. Validate dark-mode tonal elevation — ensure elevated surfaces use `colors.surfaceElevated`, not shadow alone.

### Phase 4 — Visual validation
11. Run thumbnail + squint tests on every flagship screen.
12. Capture before/after renders and compare visible rounded-container count, first-content Y-position, and media-to-chrome ratio.
13. Report `Visual QA: pending user review` — do not claim visual acceptance without device review.

---

## 8. Token-Level Spec Table — Per Card Variant

| Card variant | Surface fill | Border | Shadow | Radius (primary) | Radius (secondary) | Primitive | Canvas mode |
|---|---|---|---|---|---|---|---|
| **Discovery masonry card** (Explore, boards, similar) | `transparent` | none | `Elevation.none` | `Radius.lg` (12) on image | — | `FlagshipProductCard` | Media |
| **Feed post/listing unit** | `transparent` | none | `Elevation.none` | `Radius.lg` (12) on media | `Radius.full` for avatar/action pills | Feed post component | Media |
| **Product detail hero** | `transparent` | none | `Elevation.none` | `Radius.xl` (16) on gallery | `Radius.full` for CTA pills | Gallery component | Media |
| **Order/ledger row** | `transparent` | hairline separator | `Elevation.none` | `Radius.md` (8) on thumbnail | `Radius.full` for status pill | `FlatRow` + status pill | Utility |
| **Co-own asset row** | `transparent` | hairline separator | `Elevation.none` | `Radius.md` (8) on thumbnail | `Radius.full` for status dot | `FlatRow` + ownership bar | Utility |
| **Settings group** | `colors.surface` OR transparent | hairline | `Elevation.none` | `Radius.xl` (16) on group | — | `PremiumListSection` (flat variant) | Utility |
| **Form card** | `transparent` | none (fields carry border) | `Elevation.none` | `Radius.xl` (16) on fields | — | `PremiumFormCard` (borderless) | Utility |
| **Trust/commerce strip** (buyer protection, shipping) | `colors.surface` | hairline | `Elevation.none` | `Radius.lg` (12) | — | `ElevatedSurface` (flat) | Premium-commerce |
| **Auction lot card** (featured) | `colors.surface` | none | `Elevation.card` | `Radius.lg` (12) | `Radius.full` for status pill | `ElevatedSurface` (raised) | Premium-commerce |
| **Bottom sheet / dialog** | `colors.surfaceElevated` | none | `Elevation.modal` | `Radius.xl` (16) | — | `ElevatedSurface` (raised) | Utility |
| **Sticky action dock** | `colors.glassBg` | `colors.glassBorder` top | `Elevation.floating` | `Radius.full` for buttons | — | Dock component | Utility |
| **Board/collection cover** | `transparent` | none | `Elevation.none` | `Radius.lg` (12) on mosaic | — | Authored mosaic | Media |
| **Profile storefront tile** | `transparent` | none | `Elevation.none` | `Radius.lg` (12) on thumbnail | — | Storefront tile | Media |
| **Chat commerce card** (embedded listing in chat) | `colors.surface` | hairline | `Elevation.none` | `Radius.lg` (12) | `Radius.md` (8) on thumbnail | `ElevatedSurface` (flat) | Utility |
| **Notification/alert card** | `colors.surface` | none | `Elevation.subtle` | `Radius.lg` (12) | `Radius.full` for action pill | `ElevatedSurface` (subtle) | Utility |

### Token reference (from `designTokens.ts`)

```
Radius:  none(0) · sm(4) · md(8) · lg(12) · xl(16) · xxl(24) · full(999)
Elevation:  none(0,0,0,0) · subtle(1dp,0.04,6) · card(3dp,0.06,10) · floating(6dp,0.10,14) · modal(16dp,0.18,24)
Control:  hit(44) · iconCompact(20-24) · iconMetadata(14-18)
Space:  xs(4) · sm(8) · md(16) · lg(24) · xl(32) · xxl(48)
```

### Rules derived from the spec table

1. **Discovery and media surfaces use `transparent` fill** — the image is the card. No frame.
2. **List/ledger rows use `transparent` fill + hairline separator** — flat canvas, not contained cards.
3. **Trust and commerce strips use `colors.surface` + hairline border + no shadow** — one panel, flat separation.
4. **Modals and dialogs use `colors.surfaceElevated` + shadow + no border** — elevation is the separation signal.
5. **Sticky docks use glass background + `Elevation.floating`** — separation from scroll content.
6. **No row in the table combines border + shadow.** This is the contract.
7. **No row uses more than two non-avatar radii.** This is the budget.
8. **Avatar-class radii (`full`) are exempt from the budget** but must be reserved for avatars, pill buttons, story rings, and status pills — not used as a general-purpose radius.

---

## Summary

The ThryftVerse card/surface system has the right tokens (`Radius`, `Elevation`, `Control`, `Space`) and the right primitives (`FlatRow`, `ElevatedSurface`, `FlagshipProductCard`'s image-as-card pattern). The defects are in **adoption and discipline**: 168 hardcoded shadow configs bypass the elevation scale; 1,219 hardcoded radii bypass the radius tokens; `FlagshipAssetCard` and `FlagshipOrderCard` use full containment in list contexts where `FlatRow` is the correct primitive; `ElevatedSurface`'s `elevated` variant combines border + shadow against the design contract.

The flagship upgrade path is: **migrate all hardcoded shadows and radii to tokens (mechanical), flatten list/ledger cards to `FlatRow` patterns (structural), enforce the "border XOR shadow" rule and the two-radius budget (contractual), and validate with thumbnail + squint tests on every screen.** The goal is a surface system where containment always means something, media dominates discovery, and chrome recedes until it is nearly invisible — the 2026 benchmark set by Pinterest, Instagram, and eBay Evo.
