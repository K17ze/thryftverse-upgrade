# Task 1 — TradeConfirmScreen contract-truth fixes (F12 fee rate, F13 hold threshold)

**Status:** DONE
**File changed:** `frontend/src/screens/TradeConfirmScreen.tsx` (only file edited)
**tsc result:** `tsc --noEmit -p tsconfig.json` → 0 errors project-wide; 0 lines matching "TradeConfirm"
**Tests:** `vitest run` on coownFlagshipUpgrade / coownP0ContractDefects / coownP0ForegroundRevalidation / coownP0TruthLanguage → 4 files, 72 tests, all passed. No existing test file covers TradeConfirm behaviour directly (`Get-ChildItem -Recurse -Filter "*trade*"` → only `tradeSubmitFlows.test.ts`, which tests `evaluateTradeSubmit`, not this screen).

---

## F12 — Fee rate fallback invented 1%

### Before
```ts
const feeRate = routeFeeRate ?? 0.01;
```
A missing `feeRate` route param silently became "1% fee" in the receipt caption — a fabricated value presented as authoritative.

### After
- `feeRate` is now `routeFeeRate` **only when it is a finite number ≥ 0**; otherwise it falls back to `fetchedFeeRate` — the backend's authoritative per-asset `tradingFeeRate` recovered by `fetchMarketData` (`fetchCoOwnAssetById`, the existing fetch mechanism, now also captures `tradingFeeRate`). If neither source yields a rate, `feeRate` is `null` and `feeUnavailable = true`.
- **Caption:** `totalCaption` renders `Fee unavailable — refresh quote` instead of an invented percentage.
- **Blocked commitment:** `commitBlocked = feeUnavailable || !quoteComplete` disables `HoldToSubmitButton` and early-returns in `handleConfirm` with a toast (`'Fee unavailable — refresh the quote before confirming.'`). Defence in depth: even if the disabled button were bypassed, the handler refuses.
- **Incomplete quote also blocked:** `quoteComplete` requires finite `quantity > 0`, `totalValue`, `netValue`, `fee`, at least one usable price (`limitPriceGbp` / `protectionPriceGbp` / `averageFillPriceGbp`), and a finite expiry (`validUntilMs`). Missing fields → `'Quote incomplete'` state + block. (`format1ze` is now NaN-safe — renders `— 1ZE` rather than crashing on absent params; `localFiatLabel` likewise renders `Reference: unavailable` when `netValue` is non-finite.)
- **Refresh/retry path:** a new warning card (mirroring the existing `quoteChangedCard` grammar — no layout redesign) explains the state and contains a `Retry quote data` `AppButton` (secondary/sm) that re-runs `fetchMarketData`; on failure a toast directs the user back to the ticket for a fresh quote. Copy explicitly says the user cannot commit with an unknown fee.
- `TradeConfirmRouteParams.feeRate` remains `number | undefined` — the fix is in handling, not the type.

## F13 — Hold threshold dropped the public-float dimension

### Before
```ts
const requireHold = netValue > 5000;
```
The "OR > 5% of public float" policy arm was silently dropped.

### After
- **Float source:** `publicFloat`/`circulatingUnits` do not exist on `MarketCoOwnAsset` (`publicFloat` exists only as an always-null `CoOwnSupplyBuckets` slot). The fix reads optional `publicFloatUnits` / `circulatingUnits` added to the local `TradeConfirmRouteParams` widening, then falls back to `fetchedAsset.totalUnits` — the outstanding-supply figure already used as the ownership-share denominator in `TradeScreen` (`ownershipPct`) and `coOwnPortfolio` (`outstandingUnits`).
- **Both policy arms implemented:**
  - `exceedsValueBand = netValue > 5000` (unchanged threshold, now NaN-guarded)
  - `exceedsFloatBand = quantity > 0.05 * floatUnits || netValue > 0.05 * floatNotional1ze` where `floatNotional1ze = floatUnits * (totalValue / quantity)` — both the unit share and the notional share are checked since they diverge when avg fill price ≠ reference price.
  - `requireHold = exceedsValueBand || exceedsFloatBand`
- **Honesty when float is unavailable:** `holdReasonLabel` names the check that actually fired — `"Large order relative to asset supply"` when the float band triggered, `"High-value order"` when only the value band did (or the float dimension could not be evaluated). Surfaced via the confirm button's `accessibilityLabel` (no visual-layout change). Comments document that `totalUnits` overstates true float (treasury/locked included), so the 5% arm can under-trigger but never over-triggers.

### Secondary issue — `delta > 0.02` symmetric quote-change check
Made **directional** (the spec's preferred option): only adverse movement invalidates the quote —
`adverseDelta = isBuy ? (current − reserved)/reserved : (reserved − current)/reserved`.
Favorable movement benefits the user (protected_market caps/floors still bound the fill) and deliberately distant limit prices are not rejection reasons. The "Quote changed" card copy updated to "moved **against** this quote" for honesty.

## Implementation notes
- The mount-time fetch effect was refactored into `fetchMarketData` (`useCallback`, returns `Promise<boolean>`) so the retry button reuses it; mount still calls it via `useEffect`. A `mountedRef` guards setState-after-unmount (reset inside the effect body for StrictMode safety).
- No `components/coown/` files touched. No layout redesign — one new conditional warning card reusing `quoteChangedCard`/`remainderHeader`/`remainderText` styles (TypographyV2-derived) plus a `retryBtn` style. All navigation, analytics, haptics, idempotency, and reservation-release handling preserved.

## Concerns / notes for parent agent
1. **Public float is proxied, not canonical.** The backend does not expose a float figure; `totalUnits` (outstanding supply) is the same denominator used elsewhere, but it can overstate true float → the 5% arm may under-trigger on assets with large treasury/locked allocations. If the backend later ships `publicFloat`/`circulatingUnits` on the asset or route params, the plumbing already prefers them.
2. **Fee recovery is best-effort.** If `fetchCoOwnAssetById` fails or the asset lacks `tradingFeeRate`, the screen honestly blocks commitment until retry succeeds or the user returns for a fresh quote — correct per contract-truth, but a hard backend outage now blocks confirm (previously it fabricated 1% and let the user proceed).
3. **Directional detection** was chosen over documenting symmetric detection; a distant resting limit order placed intentionally will no longer be flagged unless the market moves *against* the reserved price by >2%.
