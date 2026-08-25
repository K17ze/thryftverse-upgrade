# ThryftVerse Flagship Upgrade — Layouts, Spacing & Composition

**Version:** 1.0
**Date:** 2026-08-18
**Scope:** Deep-dive on layout systems, spacing rhythm, composition patterns, grid structure, safe-area contracts, first-viewport geometry, and alignment discipline for the ThryftVerse flagship native app.
**Source of truth:** `AGENTS.md` §4 (Quality bar, Surface budget, Density target, Text budget, First-viewport usefulness, Deliberate spacing, Consistent alignment, Comparative visual-fidelity protocol); `Design.md` (Layout section — structural rails, sticky dock geometry, safe-area contract, responsive breakpoints, first viewport rule, media-first geometry, Space scale); `frontend/src/theme/designTokens.ts` (Space, Radius, DockConstants, Layout, Control).

---

## 1. 2026 Competitor Benchmark — Layout Composition

### Instagram

Instagram's 2026 layout composition is defined by three converging decisions: the 3:4 profile grid (migrated from 1:1 in early 2025), the 4:5 feed portrait standard that occupies 33% more vertical feed pixels than square, and the globally-launched Grid Reordering feature (June 8, 2026) that frees the profile from reverse-chronological lock. The compositional lesson is **media ownership of the viewport**: a single feed post owns at least 70% of the screen, the header chrome is lighter than the media, and action rows are fixed-order with 44pt hit areas and 8px spacing between glyphs. Instagram's three-zone layout model — hook zone (top ~25%), subject zone (middle ~50%), action zone (bottom ~25%) — is a composition discipline that maps directly to ThryftVerse's first-viewport rule. The critical safe zone insight: UI chrome overlays the bottom ~100px and top ~100px, so all critical content must live in the central band.

> Source: [Instagram Layout 2026 — Inrō](https://www.inro.social/blog/instagram-layout)
> Source: [Instagram Post Layout 2026 — Blur Test](https://www.blurtest.com/blog/instagram-post-layout-guide)
> Source: [Social Media Design 2026 — Lucky Graphics](https://lucky.graphics/learn/social-media-design-guide-2026/)

### Pinterest

Pinterest remains the benchmark for masonry composition: a neutral canvas, vivid media, true image proportions, 8pt gutters, and image-as-card philosophy. The 2026 pattern is modular discovery — visual topic heroes, featured collections, creator spotlights, and visual-similarity rails — inserted contextually, never at fixed intervals. Pinterest's compositional strength is **invisible structure**: the grid is felt but not seen. There are no visible frames around every pin; the image itself is the surface. Two-column staggered grids on phones use real `width / height` data, never derived from item IDs or random render values.

> Source: [Pinterest App Store Screenshots — App Screen Magic](https://appscreenmagic.com/top-screenshots/pinterest)
> Source: [How to Design Pinterest — Design Gurus](https://designgurus.substack.com/p/how-to-design-pinterest-in-45-mins)

### eBay / Commerce Surfaces

eBay and modern mobile commerce PDPs in 2026 converge on a tight above-the-fold contract: hero image (~60% of viewport), title (truncated to ~70-80 characters on mobile), price with sale logic, star rating, and a sticky add-to-cart/buy-now dock. The discipline is **five jobs in roughly 700 vertical pixels** on a mid-range Android device (390×844px). Research shows the first viewport captures ~57% of total page viewing time; the second viewport drops to ~17%. Anything that does not directly support the primary conversion goal — long descriptions, trust badges, shipping calculators, social sharing buttons — is pushed below the fold. The sticky CTA is non-negotiable: it pins to the bottom of the viewport, never buried below the fold.

> Source: [Above-the-Fold Mobile Listing Audit 2026 — Velocity Sellers](https://www.velocitysellers.com/2026/06/18/amazon-above-the-fold-mobile-listing-audit-2026/)
> Source: [Mobile-First Collection Design — Depict](https://depict.ai/resources/blog/mobile-first-collection-design-optimizing-the-small-screen-shopping-experience)
> Source: [PDP Patterns That Convert on Mobile 2026 — Michael Dishmon](https://michaeldishmon.com/writing/pdp-patterns-convert-mobile-2026)
> Source: [Above-the-Fold UX — Metricuno](https://www.metricuno.com/above-the-fold-ux)

### Snapchat

Snapchat's 2026 layout is full-bleed media with floating chrome: the camera fills the entire screen, tools float on top with gradient scrims, and navigation is a bottom rail within thumb reach. The compositional lesson is **canvas-as-product**: there is no padding, no card, no reserved space around the primary media surface. This maps directly to ThryftVerse's Poster/Story composer architecture (Design.md §Poster / Story Composer): "The canvas fills the entire screen. Media is the background layer. There is no padding, no card, no reserved space around the canvas."

> Source: [Social Media Design 2026 — Lucky Graphics](https://lucky.graphics/learn/social-media-design-guide-2026/)

### Cross-Platform Convergence: 4-Column Mobile Grid

The 2026 industry consensus is that **4 columns remain the mobile standard**. Even as AI tools generate screens in seconds, designers must still make correct decisions about spacing, alignment, readability, and responsiveness. The recommended settings: 4 columns, 16-24px margins, 8-16px gutters, validated across 360-430px widths. Six-column grids on mobile consistently produce cramped layouts, awkward spacing, and reduced readability. This aligns with Android's Material Design guidance: "Mobile screens are often divided into four columns" and "A standard margin value for compact sizing is 16 dp."

> Source: [Why 4-Column Grids Still Work Best for Mobile UI in 2026 — Design Systems Collective](https://www.designsystemscollective.com/why-4-columns-work-best-for-mobile-ui-841f95a9eb20)
> Source: [Content Composition and Structure — Android Developers](https://developer.android.com/design/ui/mobile/guides/layout-and-content/content-structure)

### Window Size Classes (2026 Standard)

Both Apple and Google have converged on window size classes: Compact (<600dp, phones portrait, single column), Medium (600-840dp, foldables/small tablets, optional two-pane), Expanded (>840dp, tablets/desktop, multi-pane). Modern apps use both responsive (content reflows) and adaptive (structural layout switches) strategies. ThryftVerse's Design.md breakpoints — compact phone 320-359pt, standard phone 360-399pt, large phone 400-479pt, tablet 600pt+ — map cleanly to this framework.

> Source: [Responsive and Adaptive Layouts for Mobile Apps in 2026 — Mobile App Wiki](https://mobileapp.wiki/en/uiux/responsive-adaptive-layout)

---

## 2. Psychology & Principles — Spacing as Relationship

### Spacing Is Syntax, Not Decoration

The most important insight from 2026 UX research is that **spacing is the invisible system that tells the eye what belongs together, what is separate, and what matters most**. It fails silently: no default linter flags a 13px gap, no reviewer writes "the rhythm is broken." But the human eye registers arbitrary values as sloppiness without being able to name it. The rule: every spacing value comes from the scale or carries a documented reason.

> Source: [The Five Spacing Decisions That Fix Most UI — Blake Crosley](https://blakecrosley.com/blog/five-spacing-decisions)

### Gestalt Proximity — The Load-Bearing Principle

Gestalt proximity is the single most important grouping principle in UI design, and it can overpower competing visual cues such as similarity of color or shape. The principle: **items close together are perceived as related; items spaced apart are perceived as belonging to separate groups.** The critical ratio in forms: distance from label to its field must be less than 50% of the distance from field to the next label. When those distances are equal, the label appears unanchored — equidistant from two possible "owners." Proximity is pre-attentive: it is processed before conscious awareness, in parallel with the visual scene. A correctly-spaced form is parsed without cognitive effort; an equally-spaced form requires serial attention to disambiguate.

The practical rule for ThryftVerse: **space between groups must visibly exceed space within groups.** This single Gestalt rule replaces most borders and boxes. A form where the label sits 8px from its field, and fields sit 24px from each other, needs no boxes, no dividers, no background tints — the grouping is self-evident.

> Source: [Proximity Principle in Visual Design — NN/G](https://www.nngroup.com/articles/gestalt-proximity/)
> Source: [Gestalt: Spacing Is Syntax — The Frontend Casebook](https://anmshpndy.com/cases/gestalt-spacing-as-syntax/)
> Source: [What Gestalt Principles Apply to Mobile App Interface Design — We Are Affective](https://weareaffective.com/learning-centre/what-gestalt-principles-apply-to-mobile-app-interface-design)

### Rhythm — The Cadence of Spacing and Scale

Rhythm is the cadence of spacing and scale across a surface. When margins behave consistently, when columns align across screens, when vertical rhythm remains stable, a user interface becomes legible at a glance. Users do not need to relearn the layout each time they move to a new page. This stability reduces mental effort: instead of asking "Where am I now?" the user can immediately ask "What do I need to do?" Rhythmic failures — uneven spacing (8px / 10px / 12px mix), fractional pixels, inconsistent spacing between cards — are micro-failures that don't affect functionality but disrupt visual rhythm. Users can't articulate what's wrong; they simply lose trust.

> Source: [The Hidden Geometry of Calm Screens — UXmatters](https://www.uxmatters.com/mt/archives/2026/01/the-hidden-geometry-of-calm-screens.php)
> Source: [UX Micro-Failures — Ramotion](https://www.ramotion.com/blog/hidden-ux-trust-breakers/)

### Alignment as Trust

Alignment creates invisible rails, letting users scan without constantly recalculating where to look next. When every element on a page aligns to the same vertical edges, the layout feels unified — even if individual sections differ in content type or density. Consistent spacing creates trust because it implies the system has an internal logic. When alignment is inconsistent — a text baseline slightly misaligned with an icon, a 23px spacing instead of 24px — the brain seeks rhythm and finds tension. A product can be fully functional and still feel unreliable because of these micro-failures.

> Source: [Alignment in Design — UXPin](https://www.uxpin.com/studio/blog/alignment-in-design-making-text-and-visuals-more-appealing/)
> Source: [UX Micro-Failures — Ramotion](https://www.ramotion.com/blog/hidden-ux-trust-breakers/)

### Grid as Invisible Structure

A UI grid is the invisible backbone: a structural framework of columns, rows, gutters, and margins that organizes content. The 8-point spacing system (multiples of 8px) keeps vertical and horizontal rhythm consistent. A baseline grid focuses on vertical rhythm, defining evenly-spaced horizontal lines (typically 4px or 8px) so all text and elements align vertically. Embedding grid tokens in a shared design system ensures every team member — and AI tools — use the same spatial rules. The grid should be felt, not seen: when it becomes visible (mismatched columns, drifting margins), the surface loses its calm.

> Source: [UI Grids: The Complete Guide — UXPin](https://www.uxpin.com/studio/blog/ui-grids-how-to-guide/)
> Source: [Ant Design Layout Specification](https://ant.design/docs/spec/layout/)

### Breathing Room

Whitespace separates shapes into distinct groupings through the principle of proximity. Letting whitespace do hierarchy before reaching for dividers is a core discipline: "Borders are what spacing looks like when it gives up." On mobile, where every pixel matters, whitespace is not wasted space — it is the primary tool for creating clear information hierarchies. Empty space must support focus, not compensate for oversized chrome (AGENTS.md §4, Density target).

> Source: [The Five Spacing Decisions That Fix Most UI — Blake Crosley](https://blakecrosley.com/blog/five-spacing-decisions)

---

## 3. Current ThryftVerse Audit — Concrete Defects

### 3.1 Hardcoded Padding vs Space Token Usage

A grep across `frontend/src/screens` reveals the scale of spacing drift:

| Metric | Count |
|--------|-------|
| `padding*: Space.*` token usages | **2,110** |
| `padding*: <raw number>` hardcoded usages | **252** |
| `padding*: Space.* ± number` arithmetic drift | **30+** (sampled) |

The token adoption rate is ~89% — respectable but not flagship-grade. The 252 hardcoded values and 30+ arithmetic expressions (`Space.sm + 2`, `Space.xs / 2`, `Space.sm - 1`, `Space.md - 2`, `Space.xs + 1`, `Space.sm + Space.xs`) represent **spacing drift**: values that are technically close to the scale but break the rhythm by 1-2px. These are the micro-failures that Ramotion identifies as trust-breakers: "a 23px spacing instead of 24px" violates the 8px grid pattern and the eye registers it as sloppiness.

**Specific defects:**

- `FlagshipHeader.tsx:138` — `paddingVertical: 6` — hardcoded 6px, not a Space token. Should be `Space.xs + 2` (6px) or a dedicated `Space.headerVertical` semantic token.
- `FlagshipAssetCard.tsx:176,178` — `paddingHorizontal: 14, paddingVertical: 10` — hardcoded values that don't sit on the 4px grid (14 is not a multiple of 4; 10 is not in the Space scale).
- `FlagshipProfileMedia.tsx:261,262,275` — `paddingHorizontal: 12, paddingVertical: 10` — 12px maps to `Space.smMd` but is hardcoded; 10px is off-scale.
- `FlagshipProductCard.tsx:154,176,183` — `paddingHorizontal: 2, paddingVertical: 3` — sub-token adjustments that should use `Space.xxs` (2px) or be documented as optical corrections.
- `ScreenHeader.tsx:92` — `paddingHorizontal: Space.md - Space.xs` (12px) — arithmetic drift; should use `Space.smMd` directly.
- `ScreenHeader.tsx:93` — `paddingVertical: 6` — same hardcoded 6px as FlagshipHeader.
- `InboxScreen.tsx:1048` — `paddingHorizontal: Space.sm - 2` (6px) — arithmetic drift producing an off-grid value.
- `ChatScreen.tsx:238` — `paddingVertical: Space.sm - 1` (7px) — arithmetic drift; 7px is not on any scale.
- `CreateGroupChatScreen.tsx:703` — `paddingVertical: Space.xs / 2 + 1` (3px) — compound arithmetic producing an off-grid value.
- `ItemDetailScreen.tsx:2226` — `paddingHorizontal: Space.xs / 2` (2px) — should use `Space.xxs` directly.
- `PosterViewerScreen.tsx:1797` — `paddingVertical: Space.xs - 1` (3px) — off-grid arithmetic.
- `UserProfileScreen.tsx:898` — `paddingVertical: Space.md - 2` (14px) — off-grid arithmetic.

### 3.2 Inconsistent Structural Rails

Design.md specifies a standard screen horizontal rail of 16pt (`Space.md`) and a dense media/discovery gutter of 8pt (`Space.sm`). The audit reveals rail inconsistency:

- `FlagshipScreen.tsx:155-156` — `scrollContent` uses `paddingHorizontal: Space.md` (16px) ✓
- `FlagshipScreen.tsx:165` — `stickyFooter` uses `paddingHorizontal: Space.md` (16px) ✓
- `ScreenHeader.tsx:92` — `paddingHorizontal: Space.md - Space.xs` (12px) — **breaks the 16px rail**. The header rail is 4px narrower than the content rail, creating alignment drift between header content and scroll content.
- `FlagshipHeader.tsx:137` — `paddingHorizontal: Space.md` (16px) ✓ — but this means `FlagshipHeader` and `ScreenHeader` use **different horizontal rails** (16px vs 12px) for the same structural role. Any screen that switches between these two header components will have visible alignment drift.
- `UserProfileScreen.tsx:867` — collapsed bar uses `paddingHorizontal: Space.sm` (8px) — a third rail value for a header-adjacent surface.
- `UserProfileScreen.tsx:872` — collapsed center uses `paddingHorizontal: Space.xs` (4px) — a fourth rail value within the same header zone.

This is a **shared primitive defect** (AGENTS.md §4): "If three or more screens exhibit the same visual defect, inspect and correct the shared primitive first." The header rail should be a single semantic token, not per-component arithmetic.

### 3.3 Missing Space Token Usage in Flagship Components

The flagship components — which should be the gold standard — contain hardcoded padding:

- `FlagshipHeader.tsx:138` — `paddingVertical: 6` instead of a Space token
- `FlagshipAssetCard.tsx:176,178` — `paddingHorizontal: 14, paddingVertical: 10` — neither value is a Space token
- `FlagshipProfileMedia.tsx:261,262,275` — `paddingHorizontal: 12, paddingVertical: 10` — neither is a Space token
- `FlagshipProductCard.tsx:154,176,183` — `paddingHorizontal: 2, paddingVertical: 3` — raw numbers instead of `Space.xxs`

If the flagship primitives themselves don't use the token system, every screen that consumes them inherits the drift.

### 3.4 Weak First-Viewport Geometry

`FlagshipScreen.tsx:156` sets `paddingTop: Space.sm` (8px) on scroll content. This is the gap between the header and the first content element. For a flagship first viewport, 8px is too tight — it doesn't create a clear separation between header chrome and content. Design.md's first viewport rule requires the first viewport to answer: Where am I? What matters most? What can I do? What trust/state do I need? An 8px gap between header and first content doesn't establish a strong enough visual break to signal "you are now in the content zone."

`FlagshipScreen.tsx:101` sets `trailingSpace = footerInsetHeight ?? (stickyFooter ? Space.xxl : Space.xl)` — 48px or 32px. This is reasonable for bottom clearance, but it's a single value that doesn't account for the actual dock variant height. Design.md specifies computing scroll clearance from `DockConstants.singleActionHeight` / `dualActionHeight` / `stackedActionHeight`. The current code uses a flat 48px, which may be insufficient for a stacked dock (188px) or excessive for a base dock (72px).

### 3.5 Alignment Drift Between Header Primitives

`FlagshipHeader.tsx` and `ScreenHeader.tsx` are two header primitives serving the same structural role but with different geometry:

| Property | FlagshipHeader | ScreenHeader |
|----------|---------------|--------------|
| `paddingHorizontal` | `Space.md` (16px) | `Space.md - Space.xs` (12px) |
| `paddingVertical` | `6` (hardcoded) | `6` (hardcoded) |
| `minHeight` | `56` | `56` |
| Title alignment | center | center |
| Subtitle `marginTop` | `2` | `1` |

The 4px horizontal rail difference and 1px subtitle gap difference mean that any screen switching between these headers will have visible alignment drift. This violates AGENTS.md §4 "Consistent alignment — edges, baselines, and centres are intentional."

### 3.6 Density Target Compliance

AGENTS.md §4 specifies: "A normal list viewport should expose roughly 4-6 useful rows. A discovery viewport should expose at least two meaningful media objects or the beginning of the next module." The current `FlagshipScreen` with `paddingTop: Space.sm` (8px) and `Space.md` (16px) horizontal rails is structurally sound for density, but the hardcoded `paddingVertical: 6` on headers (56px minHeight) plus 8px content top padding means the first useful content starts at ~70px from the header top — consuming valuable first-viewport real estate. On a compact phone (320pt width, ~568pt height), with a status bar (~44pt) and header (~56pt), the first viewport has ~468pt of content space. 70px of header+gap overhead leaves ~398pt for content — enough for 4-5 rows at 72pt each, but barely meeting the 4-row minimum.

---

## 4. Micro Improvements

### 4.1 Eliminate Hardcoded Padding in Flagship Primitives

Replace every hardcoded padding value in `frontend/src/components/flagship/` with Space tokens or documented semantic tokens:

- `FlagshipHeader.tsx:138` — `paddingVertical: 6` → introduce `Space.headerVertical` semantic token (6px) or use `Space.xs + 2` with a comment documenting the optical correction.
- `FlagshipAssetCard.tsx:176,178` — `paddingHorizontal: 14` → `Space.smMd` (12px) or `Space.md` (16px); `paddingVertical: 10` → `Space.sm + 2` (10px) with optical-correction comment.
- `FlagshipProfileMedia.tsx:261,262,275` — `paddingHorizontal: 12` → `Space.smMd`; `paddingVertical: 10` → `Space.sm + 2`.
- `FlagshipProductCard.tsx:154,176,183` — `paddingHorizontal: 2` → `Space.xxs`; `paddingVertical: 3` → document as optical correction or introduce `Space.xxs + 1`.

### 4.2 Unify Header Rails

Align `ScreenHeader.tsx:92` to use `Space.md` (16px) — the same rail as `FlagshipHeader.tsx:137` and `FlagshipScreen.tsx:155`. This eliminates the 4px alignment drift between header primitives. If a 12px rail is genuinely needed for a specific header variant, introduce a semantic token `Space.headerRail` and consume it in both headers, rather than using ad-hoc arithmetic.

### 4.3 Eliminate Arithmetic Drift

Replace `Space.sm + 2`, `Space.xs / 2`, `Space.sm - 1`, `Space.md - 2` expressions with either:
1. The nearest Space token if one exists (`Space.smMd` for 12px instead of `Space.sm + Space.xs`).
2. A documented semantic token if the value is used in 3+ places (e.g., `Space.controlVertical = 6`).
3. A comment-documented optical correction if the value is truly one-off.

### 4.4 Fix Subtitle Gap Consistency

`FlagshipHeader.tsx:167` uses `marginTop: 2` for subtitle; `ScreenHeader.tsx:117` uses `marginTop: 1`. Unify to a single value — `Space.xxs` (2px) — in both primitives.

### 4.5 Increase First-Content Top Padding

`FlagshipScreen.tsx:156` — increase `paddingTop` from `Space.sm` (8px) to `Space.md` (16px) to create a stronger visual break between header and first content. This is a 1-token change that improves first-viewport hierarchy without reducing density below the 4-row target.

---

## 5. Macro Improvements — Layout System

### 5.1 Structural Rails System

Define a **semantic rail token system** that separates intent from value:

```typescript
export const Rails = {
  /** Standard screen horizontal rail — used by scroll content, headers, footers */
  screen: Space.md,       // 16px
  /** Dense media/discovery gutter — masonry, rails, horizontal scrollers */
  media: Space.sm,        // 8px
  /** Full-bleed — intentionally breaks the rail for media-first surfaces */
  bleed: 0,
  /** Header internal rail — must match screen rail to prevent alignment drift */
  header: Space.md,       // 16px
  /** Sticky footer internal rail — must match screen rail */
  footer: Space.md,       // 16px
} as const;
```

Every screen, header, and footer consumes `Rails.screen` instead of `Space.md` directly. If the rail value ever changes (e.g., 20px on large phones), one token edit updates the entire system. This prevents the drift seen between `FlagshipHeader` (16px) and `ScreenHeader` (12px).

### 5.2 Spacing Rhythm System

Adopt the **three-scale spacing system** from 2026 research: component scale (tight internal), layout scale (section/module), and page scale (major composition breaks). ThryftVerse's current `Space` scale maps cleanly:

| Scale | Tokens | Usage |
|-------|--------|-------|
| Component | `Space.xxs` (2), `Space.xs` (4), `Space.sm` (8), `Space.smMd` (12) | Icon gaps, inline elements, card internal padding, grid gaps |
| Layout | `Space.md` (16), `Space.lg` (24) | Screen rails, card padding, section gaps, between-group spacing |
| Page | `Space.xl` (32), `Space.xxl` (48) | Major sections, hero spacing, composition breaks |

The rule from Gestalt proximity: **between-group spacing must visibly exceed within-group spacing.** If a card uses `Space.md` (16px) internal padding, the gap between cards must be at least `Space.lg` (24px). If a section uses `Space.sm` (8px) internal item spacing, the gap between sections must be at least `Space.lg` (24px) or `Space.xl` (32px).

### 5.3 Grid System

Formalize the **4-column mobile grid** as a layout token:

```typescript
export const Grid = {
  /** Mobile phone columns — 4 is the 2026 industry standard */
  phoneColumns: 4,
  /** Tablet/foldable columns — derived from minimum card width */
  tabletColumns: 8,
  /** Standard gutter between grid columns */
  gutter: Space.sm,       // 8px
  /** Standard margin (screen rail) */
  margin: Space.md,       // 16px
  /** Masonry: 2 columns on phone, 3-4 on tablet */
  masonryPhoneColumns: 2,
  masonryMinCardWidth: 150,
  /** Profile archive: 3 columns on phone when text not required in tiles */
  archivePhoneColumns: 3,
} as const;
```

The existing `Layout` token in `designTokens.ts:344-354` already defines `gridColumns: 2` and `gridGap: Space.sm` — extend it with the full grid specification above.

### 5.4 Safe-Area Contract

`FlagshipScreen.tsx:134` correctly uses `SafeAreaView` with `edges={['top']}` and delegates bottom safe-area to the sticky footer. This is architecturally sound. The contract to enforce:

1. **Sticky docks never cover the last scroll item** — compute scroll bottom padding from `DockConstants` variant + `insets.bottom`, not a flat `Space.xxl`.
2. **Headers do not collide with Dynamic Island/status bar** — `SafeAreaView edges={['top']}` handles this ✓.
3. **Bottom sheets include safe-area bottom padding** — verify in all bottom sheet consumers.
4. **Keyboard transitions keep focused field visible** — `KeyboardStickyView` is wired in `FlagshipScreen.tsx:137` ✓.

The improvement: replace `FlagshipScreen.tsx:101`'s flat `trailingSpace` with a dock-variant-aware computation:

```typescript
const dockClearance = stickyFooter
  ? (footerInsetHeight ?? DockConstants.singleActionHeight) + insets.bottom
  : Space.xl;
```

### 5.5 First-Viewport Contract

Formalize the first-viewport budget as a measurable contract:

| Metric | Target | Measurement |
|--------|--------|-------------|
| First useful content Y-position | ≤ 120px from screen top (including status bar + header) | Screenshot analysis |
| Useful objects above fold | ≥ 4 rows (list) or ≥ 2 media objects (discovery) | Visual count |
| Type sizes in first viewport | ≤ 3 + 1 eyebrow | Token audit |
| Visible rounded-container count | ≤ 1 dominant non-media panel | Thumbnail test |
| Header overhead | ≤ 70px (status bar + header + gap) | Geometry computation |

### 5.6 Alignment System

Enforce **edge alignment** through the rail system (§5.1) and **baseline alignment** through the type system. The key principle from 2026 research: "When every element on a page aligns to the same vertical edges, the layout feels unified — even if individual sections differ in content type or density." The current defect is that `ScreenHeader` (12px rail) and `FlagshipHeader` (16px rail) break edge alignment when used on the same screen or when a screen migrates from one to the other. The fix is the unified `Rails.screen` token.

---

## 6. Flagship Acceptance Criteria

### 6.1 Density Target

Per AGENTS.md §4: "A normal list viewport should expose roughly 4-6 useful rows. A discovery viewport should expose at least two meaningful media objects or the beginning of the next module."

**Acceptance:**
- Standard phone (390pt width, 844pt height): first viewport shows ≥ 4 useful list rows after header.
- Compact phone (360pt width, 740pt height): first viewport shows ≥ 4 useful list rows.
- Discovery viewport: first viewport shows ≥ 2 meaningful media objects or the beginning of the next module.
- Empty space supports focus; it does not compensate for oversized chrome.
- Header overhead (status bar + header + top gap) ≤ 120px on standard phone.

### 6.2 Text Budget

Per AGENTS.md §4: "The first viewport normally uses no more than three type sizes and one eyebrow."

**Acceptance:**
- First viewport uses ≤ 3 distinct `Type.*` sizes (e.g., `Type.title`, `Type.bodyEmphasis`, `Type.caption`).
- One eyebrow/label (`Type.metaElevated` or `Type.label`) is allowed.
- No duplicate headings, decorative subtitles, or labels that merely name an obvious object.
- Section headers are quieter than content (lower weight or smaller size).

### 6.3 First-Viewport Usefulness

Per Design.md First viewport rule: the first viewport must answer — Where am I? What object or task matters most? What can I do now? What trust/state information do I need?

**Acceptance:**
- The primary object (media, product, list) is visible without scrolling.
- The primary action is either visible or accessible via a sticky dock.
- Trust/state information (price, seller, status) is visible if decision-relevant.
- No low-value hero, repeated titles, generic cards, blank loading blocks, or decoration dominates.

### 6.4 Deliberate Spacing

Per AGENTS.md §4: "Every gap communicates relationship; no random padding."

**Acceptance:**
- Every padding/margin value is either a `Space.*` token, a `Rails.*` semantic token, or a documented optical correction.
- Between-group spacing visibly exceeds within-group spacing (Gestalt proximity).
- No hardcoded numeric padding values in flagship components (`frontend/src/components/flagship/`).
- No arithmetic drift (`Space.sm + 2`, `Space.xs / 2`) without a comment documenting the optical reason.
- Thumbnail test at 25% scale: primary object and reading order remain obvious; repeated rounded rectangles do not dominate the silhouette.
- Squint test: media/identity/content dominate; navigation and utility chrome recede.

### 6.5 Consistent Alignment

Per AGENTS.md §4: "Edges, baselines, and centres are intentional."

**Acceptance:**
- All headers use the same horizontal rail (`Rails.screen`).
- All scroll content uses the same horizontal rail (`Rails.screen`).
- All sticky footers use the same horizontal rail (`Rails.screen`).
- Header minHeight is consistent across primitives (56px ✓ currently).
- Icon hit targets are consistent (44px ✓ via `Control.hit`).
- Subtitle gaps are consistent across header primitives.

---

## 7. Priority & Sequencing

### Phase 1: Token Foundation (1-2 hours)

1. Add `Rails` semantic token object to `designTokens.ts`.
2. Add `Grid` extended token object to `designTokens.ts`.
3. Add `Space.headerVertical` (6px) and `Space.controlVertical` (10px) semantic tokens for recurring hardcoded values.
4. Update `FlagshipHeader.tsx`, `ScreenHeader.tsx` to consume `Rails.screen` and `Space.headerVertical`.

### Phase 2: Flagship Primitive Cleanup (1-2 hours)

1. Replace all hardcoded padding in `frontend/src/components/flagship/` with Space/Rails tokens.
2. Unify subtitle `marginTop` across header primitives.
3. Fix `FlagshipScreen.tsx` first-content `paddingTop` to `Space.md` (16px).
4. Replace flat `trailingSpace` with dock-variant-aware clearance.

### Phase 3: Screen-Level Drift Sweep (2-3 hours)

1. Grep for `padding*: \d` across `frontend/src/screens/` and replace with tokens.
2. Grep for `Space.* ± \d` arithmetic and replace with nearest token or documented optical correction.
3. Prioritize high-traffic screens: `ItemDetailScreen`, `UserProfileScreen`, `ChatScreen`, `InboxScreen`, `AuctionDetailScreen`.

### Phase 4: Validation (1 hour)

1. Thumbnail test at 25% scale on each flagship screen.
2. Squint test on each flagship screen.
3. Verify light/dark parity — geometry and density identical across themes.
4. Verify compact phone (360pt) density target — ≥ 4 useful rows.
5. Verify first-viewport text budget — ≤ 3 type sizes + 1 eyebrow.

---

## 8. Token-Level Spec Table

| Layout Pattern | Token | Value | Source | Usage Rule |
|---|---|---|---|---|
| Screen horizontal rail | `Rails.screen` | 16px (`Space.md`) | `designTokens.ts:33` | Every scroll content, header, footer horizontal padding. Must be uniform across a screen. |
| Dense media gutter | `Rails.media` | 8px (`Space.sm`) | `designTokens.ts:29` | Masonry gutters, horizontal scrollers, rail gaps. Used when media density demands tighter columns. |
| Full-bleed rail | `Rails.bleed` | 0 | — | Intentionally breaks the rail for media-first surfaces (Poster viewer, full-screen media). |
| Header internal rail | `Rails.header` | 16px (`Space.md`) | `FlagshipHeader.tsx:137` | Must match `Rails.screen` to prevent alignment drift. Currently `ScreenHeader.tsx:92` uses 12px — **defect**. |
| Footer internal rail | `Rails.footer` | 16px (`Space.md`) | `FlagshipScreen.tsx:165` | Must match `Rails.screen`. |
| Header height | — | 56px minHeight | `FlagshipHeader.tsx:139`, `ScreenHeader.tsx:94` | Consistent across primitives. Plus `paddingVertical: 6` → total ~68px. |
| Header vertical padding | `Space.headerVertical` | 6px (proposed) | `FlagshipHeader.tsx:138` | Currently hardcoded. Should be semantic token consumed by all headers. |
| First-content top gap | — | 8px → **16px** (proposed) | `FlagshipScreen.tsx:156` | Currently `Space.sm`; should be `Space.md` for stronger header/content separation. |
| Within-group spacing | `Space.sm` / `Space.smMd` | 8px / 12px | `designTokens.ts:29,31` | Tight internal spacing: icon gaps, inline elements, card internal padding. |
| Between-group spacing | `Space.lg` | 24px | `designTokens.ts:35` | Must visibly exceed within-group spacing (Gestalt proximity). |
| Major composition break | `Space.xl` / `Space.xxl` | 32px / 48px | `designTokens.ts:37,39` | Only when earned — hero spacing, major section transitions. |
| Grid columns (phone) | `Grid.phoneColumns` | 4 | 2026 industry standard | 4-column grid for mobile layout. 6 columns produces cramped layouts. |
| Masonry columns (phone) | `Layout.gridColumns` | 2 | `designTokens.ts:352` | Two-column staggered grid on phones. Tablet derives from min card width. |
| Grid gutter | `Layout.gridGap` | 8px (`Space.sm`) | `designTokens.ts:353` | Consistent gutter between masonry/grid columns. |
| Grid item width | `Layout.gridItemWidth` | `(screenWidth - Space.md * 3) / 2` | `designTokens.ts:348` | Two-column masonry item width with 16px gaps. |
| Dock base height | `DockConstants.baseHeight` | 72px | `designTokens.ts:409` | Minimum dock content height. |
| Dock single-action | `DockConstants.singleActionHeight` | 104px | `designTokens.ts:411` | One full-width button dock. Use for scroll bottom padding. |
| Dock dual-action | `DockConstants.dualActionHeight` | 140px | `designTokens.ts:413` | Cancel + confirm side by side. Use for scroll bottom padding. |
| Dock stacked | `DockConstants.stackedActionHeight` | 188px | `designTokens.ts:415` | Buttons stacked vertically. Use for scroll bottom padding. |
| Dock top padding | `DockConstants.dockTopPadding` | 10px | `designTokens.ts:421` | Breathing room above action buttons in dock. |
| Dock clearance (scroll) | — | `dockVariantHeight + insets.bottom` | Design.md §Sticky dock geometry | Compute from actual dock variant, never flat `Space.xxl`. Currently `FlagshipScreen.tsx:101` uses flat 48px — **defect**. |
| Primary button height | `DockConstants.primaryButtonHeight` | 52px | `designTokens.ts:417` | Full-pill primary CTA in dock. |
| Secondary button height | `DockConstants.secondaryButtonHeight` | 44px | `designTokens.ts:419` | Quiet/secondary CTA in dock. |
| Hit target | `Control.hit` | 44px | `designTokens.ts:490` | Minimum practical touch target. Not the visible button size. |
| Standard icon | `Control.icon` | 22px | `designTokens.ts:496` | Standard navigation/action glyph. 20-24pt optical band. |
| Compact icon | `Control.iconCompact` | 18px | `designTokens.ts:498` | Compact inline glyph for metadata rows. 14-18pt optical band. |
| Compact contained control | `Control.chromeCompact` | 32px | `designTokens.ts:492` | Visible chrome inside 44pt hit target. |
| Standard contained control | `Control.chrome` | 36px | `designTokens.ts:494` | Visible chrome for prominent contained controls. |
| Separator stroke | `Stroke.hairline` | 0.5px | `designTokens.ts:503` | Subtle separators and grouped-list hairlines. |
| Field stroke | `Stroke.standard` | 1px | `designTokens.ts:505` | Fields and intentionally outlined controls. |
| Focus/selection stroke | `Stroke.emphasis` | 2px | `designTokens.ts:507` | Selection/focus only; never routine card decoration. |
| Safe-area top | `insets.top` | device-dependent | `react-native-safe-area-context` | Headers must not collide with status bar / Dynamic Island. |
| Safe-area bottom | `insets.bottom` | device-dependent | `react-native-safe-area-context` | Sticky docks must not overlap home indicator. Add to dock clearance. |
| Responsive: compact phone | — | 320-359pt width | Design.md §Responsive breakpoints | Do not shrink touch targets below 44pt. |
| Responsive: standard phone | — | 360-399pt width | Design.md §Responsive breakpoints | Primary validation target. |
| Responsive: large phone | — | 400-479pt width | Design.md §Responsive breakpoints | Secondary validation target. |
| Responsive: tablet/foldable | — | 600pt+ content width | Design.md §Responsive breakpoints | Three or four masonry columns based on min card width. |

---

## Appendix A — Audit Methodology

### Padding Token Adoption Rate

```
Total padding:* usages in frontend/src/screens:  2,362
  Space.* token usages:                           2,110  (89.4%)
  Hardcoded numeric usages:                         252  (10.7%)
  Arithmetic drift (Space.* ± n):                    30+  (1.3%)
```

The 89.4% token adoption rate is a B+ grade. Flagship grade requires ≥ 95% token adoption with zero hardcoded values in flagship primitive components.

### Files Audited

| File | Role | Key Findings |
|------|------|-------------|
| `frontend/src/theme/designTokens.ts` | Token source of truth | Space scale (4/8/12/16/24/32/48), Radius, DockConstants, Layout, Control, Stroke all defined. Missing: `Rails` semantic token, `Grid` extended spec, `Space.headerVertical`. |
| `frontend/src/components/flagship/FlagshipScreen.tsx` | Screen shell | Uses `Space.md` rails ✓. `paddingTop: Space.sm` too tight. Flat `trailingSpace` doesn't account for dock variant. |
| `frontend/src/components/flagship/FlagshipHeader.tsx` | Flagship header | `paddingHorizontal: Space.md` ✓. `paddingVertical: 6` hardcoded. Subtitle `marginTop: 2`. |
| `frontend/src/components/flagship/FlagshipHeroSection.tsx` | Hero section | Uses `Space.lg`/`Space.xl`/`Space.md`/`Space.xs` ✓. Hardcoded `lineHeight: 38` and `lineHeight: 22` should use `Type.display.lineHeight` / `Type.body.lineHeight`. |
| `frontend/src/components/ui/ScreenHeader.tsx` | Legacy header | `paddingHorizontal: Space.md - Space.xs` (12px) — **breaks 16px rail**. `paddingVertical: 6` hardcoded. Subtitle `marginTop: 1` (differs from FlagshipHeader's 2). |
| `frontend/src/components/ui/Text.tsx` | Text primitives | All styles use `Type.*` tokens ✓. `bodyEmphasis` maps to `Type.price` (14/20/600) — a semantic mismatch worth documenting. |

---

## Appendix B — Web Sources

1. [Spacing — Create UI](https://createui.co/docs/spacing) — Semantic spacing tokens with responsive curves.
2. [UI Grids: The Complete Guide — UXPin](https://www.uxpin.com/studio/blog/ui-grids-how-to-guide/) — Grid types, 12-column system, 8-point spacing.
3. [Ant Design Layout Specification](https://ant.design/docs/spec/layout/) — Spatial layout, unified canvas, grid unit, raster.
4. [Content Composition and Structure — Android Developers](https://developer.android.com/design/ui/mobile/guides/layout-and-content/content-structure) — Margins, columns, 4-column mobile grid, safe zones.
5. [Mobile System Design — Structuring Spacing](https://www.mobilesystemdesign.com/blog/design-system-spacing/) — Spacing primitives, semantic values, scaling across teams.
6. [Why 4-Column Grids Still Work Best for Mobile UI in 2026 — Design Systems Collective](https://www.designsystemscollective.com/why-4-columns-work-best-for-mobile-ui-841f95a9eb20) — 4 vs 6 columns, 16-24px margins, 8-16px gutters.
7. [Responsive and Adaptive Layouts for Mobile Apps in 2026 — Mobile App Wiki](https://mobileapp.wiki/en/uiux/responsive-adaptive-layout) — Window size classes, compact/medium/expanded breakpoints.
8. [What Is Mobile UI — UXPin](https://www.uxpin.com/studio/blog/what-is-mobile-ui/) — Touch targets, thumb zone, Material 3, HIG, accessibility.
9. [Responsive Layout Fundamentals — 2BAB's Blog](https://2bab.me/en/blog/2026-03-16-responsive-layout-fundamentals/) — Navigation patterns, list-detail, adaptive panes.
10. [How Can Gestalt Theory Transform Your Mobile Interface Layout — We Are Affective](https://weareaffective.com/learning-centre/how-can-gestalt-theory-transform-your-mobile-interface-layout) — Gestalt principles, 50ms first impression, grouping.
11. [What Gestalt Principles Apply to Mobile App Interface Design — We Are Affective](https://weareaffective.com/learning-centre/what-gestalt-principles-apply-to-mobile-app-interface-design) — Proximity, grouping, information hierarchy on mobile.
12. [Proximity Principle in Visual Design — NN/G](https://www.nngroup.com/articles/gestalt-proximity/) — Proximity as grouping principle, whitespace as separator.
13. [The Five Spacing Decisions That Fix Most UI — Blake Crosley](https://blakecrosley.com/blog/five-spacing-decisions) — Scale refusal, group > within spacing, container padding, whitespace hierarchy.
14. [Gestalt: Spacing Is Syntax — The Frontend Casebook](https://anmshpndy.com/cases/gestalt-spacing-as-syntax/) — Label-to-field ratio ≤ 50%, pre-attentive processing.
15. [The Hidden Geometry of Calm Screens — UXmatters](https://www.uxmatters.com/mt/archives/2026/01/the-hidden-geometry-of-calm-screens.php) — Proportion, alignment, spatial rhythm, trust through geometry.
16. [UX Micro-Failures — Ramotion](https://www.ramotion.com/blog/hidden-ux-trust-breakers/) — Micro-failures, rhythmic violations, pixel grid inspection, trust.
17. [Alignment in Design — UXPin](https://www.uxpin.com/studio/blog/alignment-in-design-making-text-and-visuals-more-appealing/) — Edge alignment, grid systems, consistent spacing, baseline grids.
18. [Instagram Layout 2026 — Inrō](https://www.inro.social/blog/instagram-layout) — 3:4 grid, Grid Reordering, Layout app discontinuation.
19. [Instagram Post Layout 2026 — Blur Test](https://www.blurtest.com/blog/instagram-post-layout-guide) — 4:5 portrait, three-zone layout, hook/subject/action zones.
20. [Social Media Design 2026 — Lucky Graphics](https://lucky.graphics/learn/social-media-design-guide-2026/) — Format dimensions, 4:5 performance, safe zones, visual hierarchy.
21. [Pinterest App Store Screenshots — App Screen Magic](https://appscreenmagic.com/top-screenshots/pinterest) — Masonry grid, content-first design, board organization.
22. [How to Design Pinterest — Design Gurus](https://designgurus.substack.com/p/how-to-design-pinterest-in-45-mins) — Pin/board/feed architecture, visual discovery.
23. [Above-the-Fold Mobile Listing Audit 2026 — Velocity Sellers](https://www.velocitysellers.com/2026/06/18/amazon-above-the-fold-mobile-listing-audit-2026/) — First viewport composition, 5 elements, 70-80 char title truncation.
24. [Mobile-First Collection Design — Depict](https://depict.ai/resources/blog/mobile-first-collection-design-optimizing-the-small-screen-shopping-experience) — Above-fold density, hero banner limits, compact filters.
25. [Above-the-Fold UX — Metricuno](https://www.metricuno.com/above-the-fold-ux) — First viewport as scarce real estate, 57% viewing time, Fold Score.
26. [How to Build a Mobile-First Product Page That Converts in 2026 — Online Store News](https://onlinestorenews.com/how-to-build-a-mobile-first-product-page-that-converts-in-2026-4/) — 390×844px viewport, sticky CTA, star rating, urgency signals.
27. [PDP Patterns That Convert on Mobile 2026 — Michael Dishmon](https://michaeldishmon.com/writing/pdp-patterns-convert-mobile-2026) — Above-the-fold composition, gallery, sticky CTA, trust layer.
28. [Shopify Mobile UX — Craftshift](https://craftshift.com/shopify-mobile-product-page-optimization/) — 375px screen, 600px content, stacking order, above-fold priority.

---

*This document is a research deliverable for the ThryftVerse flagship upgrade programme. It informs implementation but is not itself implementation. Per AGENTS.md §10: "An audit is not completion. A case study is not completion. Documentation is not completion. Visible product improvement is completion."*
