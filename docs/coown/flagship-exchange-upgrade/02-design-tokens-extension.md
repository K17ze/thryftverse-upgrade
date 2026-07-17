# 02 — Design Tokens Extension

**Goal:** extend the existing `colors.ts` / `designTokens.ts` with exchange semantics **without breaking** the current warm-near-black, Inter, restrained aesthetic. No new font families, no gold gradients, no glass.

**Files to touch:**
- `frontend/src/constants/colors.ts` — add exchange semantic colours.
- `frontend/src/theme/designTokens.ts` — add `Market`, `Numeric`, `Depth` token groups; extend `Type` with tabular figures.
- No new font files. Inter already loaded (`@expo-google-fonts/inter`).

---

## 1. Colour additions (additive only — do not rename existing)

The current palette is correct. Add exchange semantics that reuse existing tokens where possible and only introduce new ones where a state genuinely needs its own hue.

### 1.1 Market-state semantics (new)

The current `success`/`danger`/`warning` are too coarse for market microstructure. Add a `Market` group using **darker luxury shades** that match the existing palette register — navy instead of light blue, taupe instead of yellow, cherry red instead of bright red. No light/bright/saturated hues.

```ts
// colors.ts — add to DARK_COLORS and LIGHT_COLORS mirrors
export const MARKET_COLORS = {
  // Continuous trading — deep navy. Calm, authoritative, "live but quiet".
  continuous: {
    dot:   '#1B2845',   // deep navy — dark enough to sit on #0A0A0A without glare
    ink:   'transparent',
    shape: 'circle',
  },
  // Call auction — taupe. Warm but muted, distinct from warning cream.
  auction: {
    dot:   '#6B5D4F',   // taupe — earthy, luxury, not yellow
    ink:   '#6B5D4F22', // alpha-hex pattern matching existing codebase
    shape: 'diamond',
  },
  // Halted — cherry red. Dark, serious, not alarm red.
  halted: {
    dot:   '#6B1A1A',   // cherry red — darker than danger #7e0202 family
    ink:   '#6B1A1A22',
    shape: 'circle',
  },
  // Closed / outside session — neutral muted (reuse textMuted).
  closed: {
    dot:   '#666666',   // matches DARK_COLORS.textMuted
    ink:   'transparent',
    shape: 'circle',
  },
  // RFQ — deep plum. Distinct from navy continuous, still dark and luxury.
  rfq: {
    dot:   '#3D2B3D',   // deep plum/aubergine — dark, not violet
    ink:   '#3D2B3D22',
    shape: 'diamond',
  },
} as const;
```

**Rationale:** the existing `colors.ts` comment cites "Farfetch/SSENSE aesthetic — Principle: Restraint." These five states use **dark, desaturated, luxury-register hues** (navy, taupe, cherry red, muted grey, deep plum) that sit on `#0A0A0A` without glare. States are also distinguishable by **shape + label + dot**, not colour alone (accessibility §18). The `shape` field (circle vs diamond) provides a second visual differentiator. The `+ '22'` alpha-hex pattern matches the existing codebase convention (e.g. `statusColor + '22'` in `CoOwnOwnershipPanel`).

### 1.2 Direction semantics (derived from existing success/danger family)

The current `success: '#0c5728'` (dark green) / `danger: '#7e0202'` (dark red) are the correct hue family. They are very dark — almost too dark for thin price ticks on `#0A0A0A`. Rather than introducing a new hue family (no sea-green, no bright red), **lighten within the same hue family** just enough for tick readability, keeping the luxury register:

```ts
export const DIRECTION_COLORS = {
  // Dark forest green — same hue as success #0c5728, lifted ~1 stop for tick contrast.
  up:        '#1A6B3A',
  upFill:    '#1A6B3A18',   // alpha-hex pattern, low alpha for chart fill
  // Dark cherry red — same hue as danger #7e0202, lifted ~1 stop.
  down:      '#8B2020',
  downFill:  '#8B202018',
  // Flat — reuse existing textSecondary.
  flat:      '#A3A3A3',
} as const;
```

**Rule:** direction colour is **always** paired with a `▲` / `▼` / `−` glyph and a sign (`+` / `−`). Never colour alone (source §17.5, §18). The chart fill uses `upFill` / `downFill` only. These are **not** brighter than the existing palette — they are the same dark green/red family, lifted just enough to be visible as a 1px tick on near-black.

### 1.3 Depth-bar semantics (new)

Order-book depth bars sit behind price levels. They must read as **structure**, not decoration. Use the **same direction hues** at lower alpha via the codebase's `+ '22'` / `+ '18'` alpha-hex pattern:

```ts
export const DEPTH_COLORS = {
  bidBar:     '#1A6B3A18',   // same hue as DIRECTION_COLORS.up, low alpha
  askBar:     '#8B202018',   // same hue as DIRECTION_COLORS.down, low alpha
  bidBarEdge: '#1A6B3A30',   // slightly higher alpha for the leading edge
  askBarEdge: '#8B202030',
} as const;
```

---

## 2. Typography — tabular figures for all 1ZE values

The current `Type` scale is correct for layout. The gap is **tabular numerals**: 1ZE values currently render in proportional Inter and jitter horizontally when they tick. Add a `Numeric` group:

```ts
// designTokens.ts — add
export const Numeric = {
  // All 1ZE amounts, prices, quantities, P&L. Inter supports tnum via
  // fontVariant: ['tabular-nums'] — no new font file needed.
  price: {
    ...Type.price,
    fontVariant: ['tabular-nums'],
    fontFeatureSettings: '"tnum" 1, "lnum" 1',  // tabular + lining
  },
  priceList:  { ...Type.priceList,  fontVariant: ['tabular-nums'] },
  priceLarge: { ...Type.priceLarge, fontVariant: ['tabular-nums'] },
  // Hero portfolio / wallet value
  display:    { ...Type.display,    fontVariant: ['tabular-nums'] },
  // Order book, depth, stats grids
  mono: {
    size: 13, lineHeight: 18, weight: '500',
    letterSpacing: 0, fontVariant: ['tabular-nums'],
  },
} as const;
```

**Rules:**
- Every 1ZE amount, unit count, percentage, bid/ask size, volume and P&L uses a `Numeric.*` style. No exceptions.
- Decimal alignment: in any vertical list of prices, render to the **same decimal precision** and right-align the column. Reserve layout width for the longest value so a tick does not shift the column (source §11.11).
- Use the true minus sign `−` (U+2212), not hyphen `-`, for negative P&L and spreads.
- Locale-aware grouping for the local-fiat indication only; 1ZE stays canonical (`1,240.00 1ZE`).

---

## 3. Spacing & layout tokens — exchange-specific additions

The existing `Space` (4/8/16/24/32/48) is correct. Add layout constants for the surfaces that need deterministic geometry:

```ts
// designTokens.ts — add
export const ExchangeLayout = {
  // Sticky action dock — already exists as DockConstants; keep.
  // Order ticket sheet snap points (bottom sheet on mobile)
  ticketSnapCollapsed:  120,   // header peek: side + headline numbers
  ticketSnapExpanded:   '80%', // full ticket with depth preview
  // Order book row height — deterministic for skeleton match
  bookRowHeight:        32,
  bookVisibleLevels:    5,     // mobile default; 10 on tablet
  // Market-status strip height
  statusStripHeight:    36,
  // Value strip (last/bid/ask/mid/NAV) row height
  valueStripRowHeight:  44,
  // Chart hero min height on AssetDetail
  chartHeroMinHeight:   220,
} as const;
```

---

## 4. Radius discipline (no change, restate)

Three families only (source §11.10, current `Radius`):
- **Controls** (buttons, inputs, chips, segment): `Radius.sm` = 4.
- **Cards** (panels, sheets, stat tiles): `Radius.md`/`lg` = 8/12.
- **Media** (full-bleed hero images, thumbnails): `Radius.none` = 0, or `Radius.full` for avatars/pills.

Do **not** introduce a 20/24/28 radius. Large radii read as consumer-app softness, not exchange authority.

---

## 5. Elevation discipline (no change, restate)

Use the existing `Elevation` ladder. Exchange surfaces should be **mostly flat** with one-pixel tonal borders (`border` / `borderLight`). Reserve `Elevation.floating` for the sticky action dock and `Elevation.modal` for sheets. No shadows on stat tiles, order-book rows or value strips — alignment and tonal borders carry the hierarchy (source §4, §11.10).

---

## 6. Icon family — one family, consistent optical weight

Current code uses `@expo/vector-icons` (Ionicons). Keep Ionicons as the single family. Rules:
- One optical weight per surface (use the `outline` variant consistently for exchange chrome; `filled` only for active states).
- Never mix MaterialIcons / FontAwesome / Entypo in Co-Own surfaces.
- Every icon-only control has an `accessibilityLabel` (`AGENTS.md` §13, §18).

---

## 7. What this token extension deliberately does NOT add

- No gold/champagne accent. The brand off-white `#F4F0E8` remains the only brand accent.
- No glass/blur surfaces for exchange chrome (blur is reserved for media overlays).
- No gradient buttons. Primary CTAs are solid `brand` on `background`.
- No confetti, no shimmer-after-load, no pulsing dots (source §17; `AGENTS.md` §17).
- No neon/bright/light green or red. Direction colours are **dark** shades derived from the existing `success`/`danger` hue family — forest green `#1A6B3A` and cherry red `#8B2020`, not sea-green or alarm red.
- No light blue, light violet, amber, or yellow. Market-state dots use **dark luxury shades**: navy `#1B2845`, taupe `#6B5D4F`, cherry red `#6B1A1A`, muted grey `#666666`, deep plum `#3D2B3D`.
- No new font. Inter + tabular-nums covers the exchange numeral need.
