# Co-Own campaign log — 2026-09-07

## Wave 1 — contract and trust closure

- Added authenticated asset issue persistence and compliance audit event.
- Blocked issuer self-asserted authenticity verification.
- Removed holdings fallback that converted an endpoint failure into an empty portfolio.
- Preserved protected-market order type and exact GBP preview strings through history and confirmation.

## Wave 2 — market truth and portfolio liquidity

- Added backend-backed best bid/ask and executable depth to asset discovery.
- Added reserved sell units and bid-depth sale proceeds to authenticated holdings.
- Portfolio cards now separate marked value from estimated sale proceeds and show `No current bids` when depth is empty.
- Public raw order responses omit counterparty user IDs.
- Ledger online failures now surface reconciliation/error state instead of silently presenting partial local cache.
- Asset detail now exposes a compact first-viewport bid/ask strip with honest loading and no-depth states; the full ladder remains progressive.
- Foreground revalidation now fails closed through the shared order-book hook while a fresh snapshot is in flight.

## Wave 3 — lifecycle model, asset screen restructure, discovery evolution, trade flow, portfolio truth, security hardening

### Backend
- Fixed voting handler: `units` → `units_owned` column, `holder_user_id` → `user_id`, action-asset identity enforced, record date eligibility added.
- Added `offeringStatus` (`offering`/`allocated`/`failed`/`closed`) and `marketStatus` (`pre_market`/`trading`/`paused`/`closed`) to all asset projections. `isOpen` retained for backward compatibility.
- Added `lastTradePriceGbp` to asset projections.
- Fixed buyout auth binding: `.strict()` on body schemas, authenticated-user identity check against `bidderUserId`/`holderUserId`.
- Added exit lifecycle enforcement: `hasActiveExitAction()` check in preview, reserve, order placement, and buyout creation handlers.
- Fixed reservation/final placement rounding mismatch: final placement now uses 4-decimal rounding matching reservation.
- Added reconciliation halt check to preview and reserve handlers.

### Frontend — Asset Detail
- Reduced from ~2,064 to ~1,352 lines; extracted to `AssetOverviewSection`, `AssetMarketSection`, `AssetOwnershipSection`.
- Removed "Co-Own v2" implementation badge.
- Fixed NAV labeling: "NAV / unit" → "Appraised value / unit", "Reference vs NAV" → "Reference vs appraisal".
- Reduced media height from 50-58% to 26-30% to bring ownership info into first viewport.
- Consolidated to one dominant price display: offering price during issuance, last trade with timestamp for secondary.
- Lifecycle-aware composition: initial offering, secondary trading, trading paused, exit underway.
- `deriveLifecycleState` now uses backend `marketStatus`/`offeringStatus` with legacy fallback.

### Frontend — Discovery Hub
- Segments replaced: `active`/`new_issues`/`watchlist` → `offerings`/`trading`/`watchlist`.
- ROI sorting replaced with factual options: `newest`/`price`/`activity`.
- Lifecycle labels fixed: "Offering", "Trading", "Available to trade", "Funding ended".
- Public browsing enabled (no auth gate on discovery).

### Frontend — Trade Flow
- Post-submission navigation now passes `orderId`/`assetId` to order history (not general hub).
- Plain-language trade ticket: "Marketable limit" → "Buy/Sell available units", "Protection price" → "Maximum/Minimum price per unit".
- Explicit remainder behavior in review step.
- TradeScreen "Last" price now uses `lastExecutionPriceGbp` instead of reference price.
- Protected-instant headline quote now uses fill estimate average price, not reference price.

### Frontend — Portfolio
- `coOwnPortfolio.ts` fetches holdings first; only fetches assets for held positions; empty holdings short-circuits.
- `CoOwnPortfolioPerformanceChart.tsx` replaced fabricated time-series with honest cost-vs-value bar comparison.
- Portfolio partial state: failed asset fetches now surface a "Some positions unavailable" warning banner.
- Error state: "Portfolio unavailable" with retry button.

### Frontend contract
- `MarketCoOwnAsset` type now includes `offeringStatus`, `marketStatus`, `lastTradePriceGbp`.

### Tests
- Updated 4 test files to match new code structure (section components, renamed labels).
- All co-own tests pass (140/140 in the 4 affected files).
- 6 pre-existing group chat failures remain (unrelated to co-own).

## Current status

TypeScript (frontend + backend) passes. 1719 tests pass, 6 pre-existing group chat failures remain (unrelated). Native visual capture and accessibility traversal remain pending because no configured native device is available.
