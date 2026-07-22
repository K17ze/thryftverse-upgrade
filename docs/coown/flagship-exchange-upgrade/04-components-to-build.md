# 04 — Components to Build

**Goal:** the purpose-built components the exchange requires. Each is either **new** (genuinely missing, not a duplicate) or an **upgrade** to an existing canonical component. No `ComponentV2.tsx` (`AGENTS.md` §7).

**Directory:** `frontend/src/components/coown/` for Co-Own-specific; `frontend/src/components/ui/` for shared primitives.

---

## A. New components (genuinely missing)

### A1. `CoOwnMarketStatusStrip`
**File:** `frontend/src/components/coown/CoOwnMarketStatusStrip.tsx`
**Purpose:** the single source of truth for market microstructure state on AssetDetail + Trade.
**Props:**
```ts
interface CoOwnMarketStatusStripProps {
  mode: 'continuous' | 'call_auction' | 'rfq' | 'halted' | 'closed';
  sessionLabel: string;          // "Open · closes 17:00 BST"
  countdownSeconds?: number | null;  // null = no countdown
  haltReason?: string;
  nextSessionAt?: string;
  disclosureVersion?: string;    // "Rights v2 · Jul 2026"
  onOpenRights?: () => void;
}
```
**Renders:** one row, height `ExchangeLayout.statusStripHeight`, dot from `MARKET_COLORS[mode]`, label, countdown (factual, not gamified), disclosure version chip. Sticky-on-scroll on AssetDetail.
**States:** each mode has a designed dot + ink + label. Halted shows reason. Closed shows next session. No pulsing.
**Placement:** AssetDetail §1.4, TradeScreen §1.2.

### A2. `CoOwnValueStrip`
**File:** `frontend/src/components/coown/CoOwnValueStrip.tsx`
**Purpose:** the three-column Market/Fundamental/Cash value strip that replaces the single-price display.
**Props:**
```ts
interface CoOwnValueStripProps {
  last?: { price: number; ageSeconds: number | null };   // undefined = no trade
  bid?: { price: number; size: number };
  ask?: { price: number; size: number };
  spread?: number;
  nav?: { pricePerUnit: number; valuedAt: string; method: string; valuer?: string };
  premiumPct?: number | null;                             // (last/nav - 1)
  nextDistribution?: string | null;
  nextReporting?: string | null;
  localFiat?: { symbol: string; rate: number; source: string; timestamp: string };
}
```
**Renders:** three labelled columns. Each value uses `Numeric.*`. Missing values show "—" + "No current order" / "Not yet available". No zeros. Timestamps beside data (source §11.11).
**Placement:** AssetDetail §1.3.

### A3. `CoOwnOrderBook`
**File:** `frontend/src/components/coown/CoOwnOrderBook.tsx`
**Purpose:** executable top-of-book + depth, the missing exchange primitive.
**Props:**
```ts
interface CoOwnOrderBookProps {
  bids: CoOwnBookLevel[];
  asks: CoOwnBookLevel[];
  visibleLevels?: number;        // 5 mobile, 10 tablet
  lastPrice?: number;
  lastAgeSeconds?: number | null;
  onSelectLevel?: (side: 'bid'|'ask', price: number) => void;  // pre-fill ticket
  mode: 'continuous' | 'call_auction' | 'rfq' | 'halted' | 'closed';
}
interface CoOwnBookLevel { price: number; size: number; orderCount?: number; cumulative?: number; }
```
**Renders:** two columns (asks descending on top, bids descending below) or a single column with depth bars from `DEPTH_COLORS`. Spread row in the middle. Tap a level → `onSelectLevel`. Deterministic row height `ExchangeLayout.bookRowHeight` for skeleton match.
**States:** empty book → "No open orders" per side; halted → frozen with overlay; RFQ → "Request for quote" CTA instead of book.
**Placement:** AssetDetail §1.7.

### A4. `CoOwnDepthPreview`
**File:** `frontend/src/components/coown/CoOwnDepthPreview.tsx`
**Purpose:** mini depth strip inside the order ticket showing where a proposed order consumes liquidity.
**Props:**
```ts
interface CoOwnDepthPreviewProps {
  side: 'buy' | 'sell';
  quantity: number;
  book: { bids: CoOwnBookLevel[]; asks: CoOwnBookLevel[] };
}
```
**Renders:** a compact horizontal depth bar with the proposed order's consumption highlighted; shows avg fill price + worst price + % of visible depth consumed. If order would slip beyond visible depth, show "Slippage beyond visible depth — use limit".
**Placement:** TradeScreen §1.9.

### A5. `CoOwnCandleChart`
**File:** `frontend/src/components/coown/CoOwnCandleChart.tsx`
**Purpose:** candlestick chart for power users; the current `CoOwnPriceChart` is sparkline-only.
**Tech:** `@shopify/react-native-skia` (already in deps, v2.6.2, currently unused for Co-Own) for performant candles; fall back to `react-native-svg` line if skia path fails.
**Props:**
```ts
interface CoOwnCandleChartProps {
  candles: { t: number; o: number; h: number; l: number; c: number; v: number }[];
  range: '1D'|'1W'|'1M'|'3M'|'1Y'|'ALL';
  onRangeChange: (r: CoOwnCandleChartProps['range']) => void;
  showVolume: boolean;
  lastPrice?: number;
  lastAgeSeconds?: number | null;
}
```
**Renders:** candles with `DIRECTION_COLORS.up`/`down` bodies, volume bars below, crosshair on long-press, range chips, line/candle toggle. **Textual summary** above the chart for screen readers ("1ZE last 12.40, down 0.8% over 1W, 3 trades in range"). Source §17.5: charts must not imply continuity where observations are sparse — render sparse trades as discrete marks, not interpolated lines across gaps.
**Placement:** AssetDetail §1.5 (toggle with `CoOwnPriceChart`).

### A6. `CoOwnVehicleCard` (upgrade of `CoOwnIssuerCard`)
**File:** modify `frontend/src/components/coown/CoOwnIssuerCard.tsx` in place (canonical, not a new file).
**Purpose:** show the **issuance vehicle**, not just a person.
**New props:**
```ts
interface CoOwnVehicleCardProps {
  vehicleName: string;
  legalForm: string;          // "UK private limited company"
  jurisdiction: string;
  operator: string;
  custodian?: string;
  documents: { label: string; uri: string }[];
  onPress?: () => void;
}
```
**Renders:** vehicle name, legal form, jurisdiction, operator, custodian, documents list (tap → PDF viewer). Keep the existing avatar/verification visual treatment for continuity.

### A7. `CoOwnAssetDossier`
**File:** `frontend/src/components/coown/CoOwnAssetDossier.tsx`
**Purpose:** the Galleria-quality provenance/condition/custody/insurance/appraisal panel.
**Props:**
```ts
interface CoOwnAssetDossierProps {
  provenance: { event: string; date: string; note?: string }[];
  condition: { grade: string; reportUri?: string; inspectedAt?: string };
  custody: { location: string; custodian: string; insured: boolean; policyRef?: string };
  appraisal: { value: number; currency: '1ZE'|'GBP'; valuedAt: string; method: string; valuer?: string; rangeLow?: number; rangeHigh?: number; nextScheduled?: string };
}
```
**Renders:** four sections, each with a header and rows. Appraisal shows value + date + method + valuer + range + next update. A stale appraisal (>180d) gets a "Stale appraisal" badge — more trustworthy than silently rolling forward (source §7.3).
**Placement:** AssetDetail §1.10.

### A8. `CoOwnRightsSheet`
**File:** `frontend/src/components/coown/CoOwnRightsSheet.tsx`
**Purpose:** modal with the 13-row rights table (`01` §4).
**Props:**
```ts
interface CoOwnRightsSheetProps {
  visible: boolean;
  onClose: () => void;
  rights: { label: string; answer: string; documentUri?: string }[];
  disclosureVersion: string;
}
```
**Renders:** bottom sheet (reuse `BottomSheet`), rows expand to plain-language answer + "View document". Each row must have an answer or "To be confirmed" — never blank.
**Placement:** AssetDetail §1.11 (modal).

### A9. `CoOwnWalletBreakdown`
**File:** `frontend/src/components/coown/CoOwnWalletBreakdown.tsx`
**Purpose:** the 1ZE sub-balance breakdown (`01` §6, corrected per audit).
**Props:**
```ts
interface CoOwnWalletBreakdownProps {
  // Settled claim — nonnegative buckets
  available: number;
  reservedForOrders: number;
  redemptionInProgress: number;
  otherHolds: number;
  settledCustomerClaim: number;   // = available + reserved + redemption + otherHolds
  // Pending — separate section
  pendingDeposit: number;
  unsettledSaleProceeds: number;
  // Derived
  withdrawable: number;           // ≤ available
  // Trust
  safeguardingPartner?: string;
  localFiat?: { symbol: string; rate: number; source: string; timestamp: string };
  // Sequencing
  reconciliationState: 'reconciled' | 'reconciling' | 'break';
}
```
**Renders:** two sections — "Settled claim" (nonnegative buckets summing to `settledCustomerClaim`) and "Pending" (separate, not added to claim). All values via `Numeric.price`, all nonnegative, each sub-balance with a one-line explanation ("Reserved for 2 open buy orders"). Safeguarding partner line is mandatory when present. If `reconciliationState !== 'reconciled'`, show "Reconciling" banner and disable Add/Redeem.
**Placement:** WalletScreen §2.

### A10. `CoOwnPositionMarkRow` (upgrade of `CoOwnPositionCard` internals)
**File:** modify `frontend/src/components/coown/CoOwnPositionCard.tsx` in place.
**New props to add:**
```ts
markSource: 'last' | 'nav' | 'mid';
markAgeSeconds: number | null;
navPerUnit?: number;
premiumPct?: number | null;
reservedUnits: number;
pendingInUnits: number;
pendingOutUnits: number;
outstandingUnits: number;     // labelled denominator
```
**Renders:** the upgraded row per `03` §5 + `06`. The **premium of last/NAV** line is the truth-telling element — always show when both last and NAV exist.

### A11. `CoOwnNumericText` (shared primitive)
**File:** `frontend/src/components/ui/CoOwnNumericText.tsx`
**Purpose:** a single text component that enforces tabular numerals, decimal alignment, true minus, locale-aware grouping for fiat, and 1ZE canonical formatting. Every 1ZE/unit/P&L value in Co-Own renders through this.
**Props:**
```ts
interface CoOwnNumericTextProps {
  value: number;
  unit?: '1ZE' | 'units' | 'pct' | fiat symbol;
  precision?: number;          // default 2 for 1ZE, 0 for units, 2 for pct
  signed?: boolean;            // prefix + / −
  direction?: 'up'|'down'|'flat';  // applies DIRECTION_COLORS + glyph
  align?: 'left'|'right';
  size?: keyof typeof Numeric;
}
```
**Rationale:** centralising numeral formatting prevents the horizontal jitter and inconsistent minus signs that currently degrade the exchange feel (source §11.11).

### A12. `CoOwnMarketRowTile` (upgrade of `CoOwnAssetTile` for the Active tab)
**File:** modify `frontend/src/components/coown/CoOwnAssetTile.tsx` (add a `variant: 'discovery' | 'market'` prop).
**Market variant renders:** ticker, last price + age, 24h change (with timestamp), spread, depth ±2%, status pill — the sortable market row. Discovery variant keeps the current art-directed tile.
**Placement:** SyndicateHubScreen Active tab.

---

## B. Existing components to upgrade (in place)

| Component | File | Upgrade |
|---|---|---|
| `CoOwnOwnershipPanel` | `CoOwnOwnershipPanel.tsx` | Render authorised/issued/float/locked/treasury + viewer settled/reserved/pending + labelled denominator (`01` §3). |
| `CoOwnTradeComposer` | `CoOwnTradeComposer.tsx` | Becomes the **quote block** inside the new order ticket (`05`). Add spread, avg fill, worst price, impact, reservation state, duration. |
| `CoOwnTradeReceipt` | `CoOwnTradeReceipt.tsx` | Add max 1ZE reserved, post-trade units + ownership %, local-fiat indication, market/liquidity warning, disclosure version (`03` §4). |
| `CoOwnPriceChart` | `CoOwnPriceChart.tsx` | Add candle toggle (delegates to `CoOwnCandleChart`), volume bars, sparse-trade marks, textual summary for a11y, last-age badge. |
| `CoOwnActivityRow` | `CoOwnActivityRow.tsx` | Add execution reference, remove any user identity/cost data on public rows, add status transitions. |
| `CoOwnLedgerSummary` | `CoOwnLedgerSummary.tsx` | Add mark-used label + window label to each metric. |
| `CoOwnStateCanvas` | `CoOwnStateCanvas.tsx` | Add `variant: 'stale' | 'halted' | 'restricted' | 'thin'` for the new exchange states. |
| `CoOwnSkeletons` | `CoOwnSkeletons.tsx` | Add `CoOwnValueStripSkeleton`, `CoOwnOrderBookSkeleton`, `CoOwnWalletBreakdownSkeleton`; ensure all skeletons match final geometry (source §14, §17.5). |
| `CoOwnStickyActionDock` | `CoOwnStickyActionDock.tsx` | Support disabled-with-reason state for Buy/Sell (market closed/halted/restricted). |
| `CoOwnRiskDisclosure` | `CoOwnRiskDisclosure.tsx` | Add disclosure version + "accepted" state for TradeConfirm. |

---

## C. Components NOT to build (prohibited by source/AGENTS)

- No `CoOwnAssetCardV2` / `CoOwnTradeComposerFinal` / `AssetDetailScreenFlagship` — canonical upgrades only (`AGENTS.md` §7).
- No confetti / shimmer / floating-card / pulse components (source §17; `AGENTS.md` §17).
- No "verified" badge component that could be shown on an expired document (source §11.11).
- No fake-liquidity / fake-viewers / fake-activity components (source §6.9, §11).

---

## D. Component count summary

- **New:** 12 (A1–A12, of which A6/A10/A12 are in-place upgrades of existing canonical files).
- **Upgraded in place:** 10.
- **Total touched:** ~22 components, all inside the existing `components/coown/` + `components/ui/` directories.
