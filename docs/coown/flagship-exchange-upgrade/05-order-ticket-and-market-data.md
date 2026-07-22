# 05 — Order Ticket & Market-Data Price Truth

**Goal:** the single highest-impact upgrade. `CoOwnTradeComposer` is currently a polished quote summary that looks like checkout. It must become an **exchange-grade order ticket** with spread, estimated fill, worst price, impact, reservation state, review and confirmation. Paired with the price-truth rules that govern last/bid/ask/mid/NAV.

**Source:** research §6 (market microstructure), §11.5–11.6 (order composer + review), §11.11 (minute detail).
**Files:** `frontend/src/screens/TradeScreen.tsx`, `frontend/src/components/coown/CoOwnTradeComposer.tsx`, `frontend/src/components/coown/CoOwnTradeReceipt.tsx`, `frontend/src/data/coOwnModels.ts`.

---

## 1. Order ticket hierarchy (TradeScreen) — collapsed default + expandable details

Source §11.5 specifies the hierarchy. The current screen has Buy/Sell, quantity, optional limit, composer, risk, dock. The gaps are: no spread, no estimated fill, no worst price, no impact, no duration, no reservation state, no post-trade preview.

**Density discipline:** the existing `CoOwnTradeComposer` breathes with `Space.md` gaps — luxury e-commerce register (Farfetch/SSENSE). The ticket must **not** become a 12-block trader-terminal wall. Use **progressive disclosure**: collapsed default matches the current breathing room; detail expands on tap.

### Collapsed (default — matches current density)

```text
┌─────────────────────────────────────────────┐
│ Header: ticker · last · status pill          │
├─────────────────────────────────────────────┤
│ [Buy]  [Sell]   ← AppSegmentControl, sticky  │
├─────────────────────────────────────────────┤
│ Available 1ZE: 12,400.00   (buy)             │
│   or                                         │
│ Sellable units: 500  (settled − reserved)    │
├─────────────────────────────────────────────┤
│ Quantity   [Units ⇄ 1ZE]                     │
│ [−]  500  [+]    lot step: 1                 │
├─────────────────────────────────────────────┤
│ Order type                                   │
│ [Protected instant] [Limit]                  │
├─────────────────────────────────────────────┤
│ Limit / protection price                     │
│ [−]  12.44 1ZE  [+]   tick: 0.01             │
├─────────────────────────────────────────────┤
│ ≈ 500 units · 6,282.20 1ZE incl. fee         │
│ ▸ 6,282.20 1ZE will be reserved              │
├─────────────────────────────────────────────┤
│ ▸ Details                          (expand)  │
├─────────────────────────────────────────────┤
│ ▸ Risk disclosure · Rights v2                │
├─────────────────────────────────────────────┤
│ [      Review order      ]   ← sticky dock   │
└─────────────────────────────────────────────┘
```

### Expanded (tap "Details" — revealed on demand)

```text
ESTIMATED FILL
  Avg fill price    12.41 1ZE
  Worst price       12.44 1ZE
  Units             500
  Gross             6,220.00 1ZE
  Fee (1.0%)        62.20 1ZE
  Total             6,282.20 1ZE

DEPTH IMPACT   (CoOwnDepthPreview)
  [████████░░░░] consumes 18% of ±2% depth

DURATION
  [GFD] [GTC 90d]

AFTER THIS ORDER
  700 units · 0.70% of outstanding
```

### Reservation math (audit blocker 2 — corrected)

The reservation must cover the **full maximum obligation**, not a partial amount. For a buy of 500 units at protection price 12.44 with 1% max fee:

```text
required_reserve = protection_price × quantity + max_fees + buffer
                 = 12.44 × 500 + (12.44 × 500 × 0.01) + 0
                 = 6,220.00 + 62.20
                 = 6,282.20 1ZE
```

**Every preview, confirmation and ledger entry must derive from the same authoritative calculation function.** Do not manually reproduce example totals across screens — a single `computeReservation(side, quantity, price, feeSchedule)` function feeds the ticket, the receipt, and the ledger posting. The previous example ("1,267.05 1ZE reserved" for a 6,267.05 total) would have permitted double spending and is corrected everywhere in this doc.

### Field rules

| Field | Rule |
|---|---|
| Quantity | Lot-step enforced; below lot minimum disables Review. Toggle Units/1ZE-amount; default **1ZE-amount for buy** (Robinhood dollar-first mental model), **units for sell**. |
| Order type | **Protected instant** = marketable limit with a visible protection price (max price for buy / min proceeds for sell). Never an uncapped market order in an illiquid asset (source §6.3). Limit = resting. GTT in Phase 3. |
| Limit/protection price | Tick-step enforced; outside ±price-band disables Review with inline reason. |
| Avg fill price | Computed by walking the book from the proposed order; if it would slip beyond visible depth, show "Slippage beyond visible depth — use limit" and disable Protected instant. |
| Worst price | The worst level the order would execute at against current visible book. |
| Reservation | `computeReservation()` — the **full maximum obligation** (protection_price × qty + max_fees + buffer) moved from available to order-reserved on acceptance. For sell: the full unit quantity moved from settled-available to reserved-for-sale. Shown in collapsed view as "▸ X 1ZE will be reserved". |
| Duration | GFD default; GTC 90d where appropriate. In expanded section. |
| Post-trade preview | Units after + ownership % of outstanding. In expanded section. |
| Review button | Disabled with reason for: insufficient 1ZE/units, market closed/halted, jurisdiction restricted, below lot min, beyond price band, slippage-beyond-visible-depth on Protected instant, rights incomplete. |

### Thin-market action substitution (source §11.5)

The market mode, not visual preference, selects the primary action:

| Market mode | Primary action |
|---|---|
| Continuous (with opposite side) | Review order (Protected instant / Limit) |
| Continuous (no opposite side) | "Request quote" / "Join auction" — no one-tap Buy |
| Call auction | "Join auction" with auction details + indicative uncrossing price |
| RFQ | "Request quote" with counterparty count + ETA |
| Halted / Closed | Disabled with reason |

---

## 2. Review & confirm (TradeConfirmScreen)

Source §11.6. The receipt must show everything a serious exchange shows before money moves:

```text
RECEIPT
  Side              BUY
  Order type        Protected instant  (limit 12.44)
  Units             500
  Avg fill est.     12.41 1ZE
  Worst price       12.44 1ZE
  Gross             6,220.00 1ZE
  Fee (1.0%)        62.20 1ZE
  Total             6,282.20 1ZE
  MAX 1ZE RESERVED  6,282.20 1ZE   ← prominent (full obligation)

PLAIN LANGUAGE
  You will own 500 units (0.50% of outstanding) of MYA-01,
  settled in 1ZE. This is a beneficial interest in [vehicle],
  not title to the yacht.

LOCAL-FIAT INDICATION
  ≈ £5,950 · source [partner] · 14:02 BST

MARKET & LIQUIDITY WARNING
  Last trade 3h ago · spread 0.04 1ZE · thin market.
  You may not be able to sell quickly at this price.

DISCLOSURE
  Rights v2 · Jul 2026 · accepted

[ Cancel ]   [ Hold to submit ]   (hold-to-submit above threshold)
```

**Hold-to-submit** threshold: orders > 5,000 1ZE **or** > 5% of public float. Below threshold, tap-to-submit with haptic medium. Above, hold 600ms with progress ring + haptic heavy on completion. Source §11.6.

### Confirmation states (restrained — no celebration)

| State | UI |
|---|---|
| Submitted | "Order accepted · 6,282.20 1ZE reserved" → route to `CoOwnOrderHistory` with new order highlighted |
| Partially filled | Receipt updates: filled qty + remaining; "Done" + "Modify" |
| Filled | Execution price(s) + contract-note link |
| Pending auction | "Queued for 14:00 call auction" + countdown |
| Rejected | Reason + recovery; haptic heavy; **no confetti** (source §17.5) |

---

## 3. Price-truth rules (govern all market-data surfaces)

Source §6.6. The current `CoOwnedAsset.currentPricePerShare` is one mutable field used as quote, valuation and traded price. Replace with separate facts, each with a type and timestamp.

### Facts

| Fact | Definition | When it updates |
|---|---|---|
| `last` | Most recent eligible execution price + time | Only on a new eligible execution |
| `bestBid` / `bestAsk` | Top of executable book | On book change |
| `mid` | (bestBid + bestAsk) / 2 | On book change, only when both exist |
| `indicativeAuction` | Current auction clearing estimate | During auction phase only |
| `officialClose` | Venue-defined session close | At session close |
| `navPerUnit` | (asset FV + vehicle cash − debt − accrued) / issued | On valuation update only |
| `localFiat` | 1ZE → fiat via disclosed source + timestamp | On rate update |

### Hard rules

1. **No trade → no new last price.** A model, editor, valuation update or random mock cannot create a market execution (source §2.2, §6.6).
2. **No bid or ask → em dash + "No current order"**, never zero.
3. **Last trade age** must be visible beside the last price everywhere it appears.
4. **Market cap** must identify the mark: `last × issued` vs `nav × issued`. Label explicitly.
5. **24h change** requires a timestamp and a prior reference price. A percentage without both is prohibited (source §11.4).
6. **24h volume** = `sum(execution_price × execution_quantity)` over a rolling window from execution timestamps — **not** accumulated (source §2.2).
7. **Spread** = `bestAsk − bestBid`; `spreadBps = spread / mid × 10,000`. Show both.
8. **Depth ±2%** = executable quantity inside ±2% of midpoint.
9. Do not count cancelled orders, deposits, primary issuance or internal ledger transfers as trading volume (source §6.7).

### Data-model additions (`coOwnModels.ts`)

These are the **frontend display-model** additions; the backend authoritative model is the source research §13. The frontend model must carry the facts above so the UI can render truthfully.

**Market-data sequencing (audit blocker 4):** a visually polished order book without sequencing can show internally inconsistent bids, asks and last prices. Every market-data snapshot must carry sequencing metadata so the UI can detect staleness, reject out-of-order updates, and show data age:

```ts
export interface CoOwnMarketData {
  // Sequencing — mandatory on every snapshot (audit blocker 4)
  marketId: string;              // durable market identifier
  instrumentId: string;          // durable instrument identifier
  snapshotSequence: number;      // monotonic snapshot sequence number
  lastEventSequence: number;     // last event applied to produce this snapshot
  serverTimestamp: string;       // server clock when snapshot was produced
  dataAgeSeconds: number;        // age at render time
  stalenessThresholdSeconds: number;  // UI shows "stale" badge after this
  reconciliationState: 'reconciled' | 'reconciling' | 'break';

  // Price facts
  last?: { price: number; executedAt: string };
  bestBid?: { price: number; size: number };
  bestAsk?: { price: number; size: number };
  spread?: number;
  spreadBps?: number;
  mid?: number;
  depthWithin2Pct?: number;
  turnover24h?: number;          // from executions only
  change24h?: { pct: number; referencePrice: number; windowStart: string };
  officialClose?: { price: number; closedAt: string };
  indicativeAuctionPrice?: number;

  // Market microstructure
  tickSize: number;
  lotSize: number;
  tradingSessionState: 'continuous' | 'call_auction' | 'rfq' | 'halted' | 'closed';
}

export interface CoOwnValuation {
  navPerUnit?: number;
  valuedAt: string;
  method: string;
  valuer?: string;
  rangeLow?: number;
  rangeHigh?: number;
  nextScheduled?: string;
}

export interface CoOwnMarketState {
  mode: 'continuous' | 'call_auction' | 'rfq' | 'halted' | 'closed';
  sessionLabel: string;
  countdownSeconds?: number | null;
  haltReason?: string;
  nextSessionAt?: string;
  tickSize: number;
  lotSize: number;
  priceBandPct: number;
  disclosureVersion: string;
}
```

**Sequencing rules:**
- The UI rejects any snapshot whose `snapshotSequence` is lower than the currently rendered one.
- If `dataAgeSeconds > stalenessThresholdSeconds`, the UI shows a "Data stale" badge and stops rendering live ticks.
- If `reconciliationState !== 'reconciled'`, the UI shows "Reconciling" and disables order submission.
- `marketId` and `instrumentId` are durable keys — never join cash, holdings or corporate actions on a user-editable asset slug.

`CoOwnedAsset` then carries `market: CoOwnMarketData`, `valuation: CoOwnValuation`, `marketState: CoOwnMarketState`, and the existing `currentPricePerShare` is **deprecated** (kept temporarily for migration, not rendered).

---

## 4. Reservation-state model additions

Source §6.4, corrected per audit (blocker 1). The frontend must show what will be reserved and what is reserved. The 1ZE balance uses **nonnegative buckets** with a strict invariant:

```ts
export interface CoOwn1ZeBalance {
  // Settled claim (safeguarded) — nonnegative buckets
  available: number;            // spendable now
  reservedForOrders: number;    // locked for open buy orders
  redemptionInProgress: number; // locked for pending redemptions
  otherHolds: number;           // any other settled holds
  settledCustomerClaim: number; // = available + reserved + redemption + otherHolds

  // Pending — separate, not part of settled claim until settled
  pendingDeposit: number;       // not yet settled
  unsettledSaleProceeds: number;// not yet settled

  // Derived
  withdrawable: number;         // ≤ available

  // Trust
  safeguarded: boolean;
  safeguardingPartner?: string;

  // Sequencing (same discipline as market data)
  snapshotSequence: number;
  serverTimestamp: string;
  reconciliationState: 'reconciled' | 'reconciling' | 'break';
}

// invariant: withdrawable ≤ available ≤ settledCustomerClaim
// invariant: all buckets ≥ 0
// invariant: settledCustomerClaim = available + reservedForOrders + redemptionInProgress + otherHolds
```

```ts
export interface CoOwnPositionState {
  settled: number;              // settled available
  reservedForSale: number;      // reserved for open sell orders
  pendingIn: number;            // pending transfer in (state of existing units)
  pendingOut: number;           // pending transfer out (state of existing units)
  outstandingUnits: number;     // labelled denominator
  // invariant: settled + reservedForSale + pendingIn + pendingOut ≤ issuedUnits
  // (these are states of existing units, not separate supply buckets)
}
```

The order ticket computes `requiredReserve = computeReservation(side, quantity, protectionPrice, feeSchedule)` — the **full maximum obligation** — and shows it as "will be reserved". On acceptance, the wallet's `reservedForOrders` increases by that amount; on cancel/expiry/fill, it releases idempotently. **Every preview, confirmation and ledger entry must derive from the same `computeReservation` function** — never manually reproduced.

---

## 5. Mock-fallback discipline (source §2.2, AGENTS §11)

Runtime mock fallbacks currently fabricate assets, books and history. The reconstruction rule:

- **Development only:** mocks may generate books/executions for local testing.
- **Production:** mocks fail closed. A missing book shows "No open orders", not a fabricated one. A missing last trade shows "—", not a random price.
- The UI must never look liquid when no market exists. A premium market earns trust by showing when liquidity is absent (source §6.9).

---

## 6. Acceptance gate for the order ticket

Before the order ticket is considered done:

- [ ] Every numeric value renders through `CoOwnNumericText` (tabular, aligned, true minus).
- [ ] Avg fill + worst price computed by walking the book; slippage-beyond-visible-depth disables Protected instant.
- [ ] Reservation amount shown pre-acceptance; wallet `reservedForOrders` updates on acceptance.
- [ ] Review button disabled-with-reason for all 7 failure conditions (§1 field rules).
- [ ] Thin-market action substitution works for all 5 market modes.
- [ ] TradeConfirm receipt shows max reserved, plain-language ownership, local-fiat with source/time, market warning, disclosure version.
- [ ] Hold-to-submit active above threshold.
- [ ] Confirmation states restrained — no confetti, no celebration of an unfilled order.
- [ ] No mock fallback in production renders a fabricated book or price.
- [ ] Reduced-motion: hold-to-submit becomes tap-to-confirm with a confirm dialog.
