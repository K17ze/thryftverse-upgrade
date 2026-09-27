# Audit — CO-OWN/TRADING (mobile) — 2026-09-26

## Verdict
The mobile Co-Own/Trading department is the most engineered surface in the app: live order-book streaming with reconciliation, backend-authoritative preview → reservation → idempotent placement, protected-market order types, server-persisted watchlist, and near-complete loading/empty/error/partial/offline coverage. It meets or exceeds the web terminal on order-book grammar (ladder, depth fan, tape, spread bps, imbalance gauge) and exceeds the web hub (three segments, search, highlights). The material gaps are feature-level omissions — the entire syndicate pooled-buy domain is absent from mobile, the portfolio lacks the web's open-orders panel and distributions ledger — plus a handful of stale-copy and data-path correctness issues.

## Findings

### CT-01 — Syndicate pooled-buy feature entirely absent on mobile [P1]
- Screens: `frontend/src/screens/SyndicateHubScreen.tsx` (file is misnamed — it exports the Co-Own market hub), `frontend/src/screens/CreateSyndicateScreen.tsx`, `frontend/src/screens/SyndicateOnboardingScreen.tsx`
- Evidence: `frontend/src/services/marketApi.ts` contains no syndicate/pool/contribution endpoints; `frontend/src/navigation/types.ts` has no `SyndicateDetail`/`SyndicateHistory`/`Syndicate` routes; `CreateSyndicateScreen.tsx` only collects onboarding-style input with no pool-creation service call behind it. Mobile users cannot create a pool, contribute to one, or view pool status/executions.
- Web parity: `web/src/app/co-own/syndicate/` + `web/src/components/coown/syndicate/` ship the full feature — `SyndicateHubView.tsx` ("Your syndicates" vs "Open syndicates" sorted by joinability), `SyndicateDetailView.tsx`, `PoolMeter.tsx`, `ContributionComposer.tsx`, `MemberList.tsx`, `ExecutionList.tsx`, and `co-own/syndicate/history`. Backed by `/api/coown/syndicates*` contracts in `web/src/lib/contracts/coownSyndicates.ts`.
- Competitor: Pooled/fractional group buying (Polymarket-style shared positions, eBay group funding) is a headline differentiator — the web hub markets it as "Syndicates" in top nav (`CoOwnHubView.tsx:111`).
- Root cause: Syndicate API surface was built web-only; mobile `marketApi.ts` was never extended, so no screen could be built.
- Fix: Add `syndicateApi` section to `marketApi.ts` mirroring the web contracts (list pools, pool detail, create, contribute, withdraw, executions); rebuild `CreateSyndicateScreen` against it; add `SyndicateDetail` + `SyndicateList` screens surfaced from the Co-Own hub; reuse `CoOwnTradeComposer`-style contribution composer with idempotency keys (same pattern as `TradeScreen.tsx` 232–237).
- Acceptance: A mobile user can discover, create, contribute to, and track a syndicate pool end-to-end; pooled buys appear in order history; states cover loading/empty/error/offline.

### CT-02 — Portfolio lacks open-orders panel with inline cancel [P1]
- Screens: `frontend/src/screens/PortfolioScreen.tsx:148-200`, `frontend/src/components/coown/portfolio/*`
- Evidence: Portfolio renders a `FlashList` of positions with Positions/Insights tabs; no open-orders section exists anywhere in `components/coown/portfolio`. A user must open each asset detail (`AssetMarketSection.tsx:646-733` renders per-asset open orders) to see or cancel resting orders — there is no portfolio-wide view of resting orders.
- Web parity: `web/src/components/coown/portfolio/PortfolioView.tsx:197-205` renders an `OpenOrders` panel with two-tap cancel across all markets, above the positions table.
- Competitor: Binance/TradingView/Kalshi all surface "Open orders" on the positions page — cancel-without-navigation is expected grammar.
- Root cause: `fetchCoOwnOpenOrders` exists only per-asset; no aggregate open-orders fetch was wired into the portfolio load path.
- Fix: Add an "Open orders" section at the top of the Positions tab backed by a portfolio-scoped open-orders endpoint (or aggregate per-asset fetches); reuse the cancel flow + reconciliation gating already implemented in `AssetDetailScreen`.
- Acceptance: Portfolio shows all resting orders with side/limit/units and a 2-tap cancel; parity with `PortfolioView.tsx` open-orders behavior; unreachable state (empty) renders a quiet "No resting orders" line, not a dead control.

### CT-03 — Onboarding copy contradicts settlement and fee contract [P1]
- Screens: `frontend/src/screens/SyndicateOnboardingScreen.tsx:35`
- Evidence: Slide body reads "Settlement is in GBP, TVUSD, or both. A 1% fee applies." Everywhere else the department settles exclusively in 1ZE (`AssetMarketSection.tsx:749-752` "Settlement / 1ZE · {tradingFeeRate}% fee"; `TradeScreen.tsx:900-902` "…1ZE"), and the fee is a per-asset `tradingFeeRate` (e.g. `(asset.tradingFeeRate*100).toFixed(2)%`), not a flat 1%. First-run users are told the wrong currency and wrong fee — dishonest copy on a financial surface.
- Web parity: `web/src/components/coown/CoOwnOnboardingGate.tsx` uses generic "one onboarding tour" copy with no currency/fee claims.
- Competitor: Broker onboarding (Coinbase, Public) never hardcodes fee/currency claims in copy — they bind to live contract terms.
- Root cause: Slide copy predates the 1ZE settlement migration and was never updated; fee hardcoded instead of bound to contract constants.
- Fix: Remove currency/fee specifics or bind to the same constants used by `AssetMarketSection` (e.g. `coownContracts` fee + settlement constants); align with web gate copy.
- Acceptance: No onboarding text names a settlement currency or fee that isn't the live contract value; automated check that onboarding copy contains no "TVUSD"/"GBP"/hardcoded "%".

### CT-04 — DistributionHistory does N+1 asset-title fetches that block the list [P2]
- Screens: `frontend/src/screens/DistributionHistoryScreen.tsx:135-144`
- Evidence: After `fetchCoOwnDistributions` returns, the screen gathers unique `assetId`s and fires one `fetchCoOwnAssetById` per asset via `Promise.all` *inside the same await chain* — every title lookup must complete before the list can render, and one slow/failed asset stalls the whole history. Comment at line 127 admits titles "aren't in the distributions contract."
- Web parity: `web/src/components/coown/portfolio/DistributionsTable.tsx` renders asset slugs/ids directly from the distribution record (compact id fallback) — no secondary fetch.
- Competitor: eBay/Polymarket activity ledgers never block render on N secondary entity lookups.
- Root cause: Distributions contract lacks `assetTitle`; mobile compensates client-side per-item.
- Fix: Add `assetTitle`/`assetSlug` to the distributions response contract (backend join), or render `assetId` immediately and hydrate titles lazily per row (non-blocking, per-row cache like `assetTitlesRef` but post-render).
- Acceptance: History rows render on first response; title hydration is per-row async with no render-blocking; zero N+1 in the critical path.

### CT-05 — DRIP-failure flag reads stale state inside the async pass [P2]
- Screens: `frontend/src/screens/DistributionHistoryScreen.tsx:111-117`
- Evidence: `handleEnrollmentFailure` sets `dripFetchError` via setState, then `loadData` reads `dripFetchError` from closure later in the same pass — the read always sees the previous render's value, so a DRIP-fetch failure can go unreported (or reported one pass late). The flag is also listed in `loadData`'s `useCallback` deps (line 175), so toggling it re-triggers the whole load — a self-feeding reload loop risk.
- Web parity: n/a (web distributions route has no DRIP enrollments panel).
- Competitor: n/a.
- Root cause: Set-then-read of React state within one async scope.
- Fix: Track failure in a local variable/`Set` inside `loadData` (same pattern already used at line 115's inline `dripFetchError` assignment comment) and set the flag once from the local result; drop it from the deps array.
- Acceptance: A failed DRIP fetch surfaces the offline/error qualifier in the same load pass; no spurious reload when the flag flips.

### CT-06 — Protected-instant submit guard uses reference price, not the quoted fill average [P2]
- Screens: `frontend/src/screens/TradeScreen.tsx:398-401` vs `TradeScreen.tsx:295-308`
- Evidence: `evaluateTradeSubmit` is called with `marketPrice` (`asset.unitPriceGbp` — the static reference price) while the quote/total shown to the user is `headlineMarketPrice` (`marketPriceForQuantity` — the live fill-average across book depth). For protected-instant orders in a deep or thin book the evaluated total can diverge from the displayed "Total est." (`headlineMarketPrice` at line 349), so the submit gate may pass/block on a different number than the user sees.
- Web parity: `web/src/components/coown/trade/TradePanel.tsx` binds its guard to the same live quote it displays.
- Competitor: Binance order ticket gates on the computed notional of the actual fill estimate, never the last-trade reference.
- Root cause: Guard wired to `marketPrice` before `headlineMarketPrice` was introduced; the two were never reconciled.
- Fix: Pass `headlineMarketPrice` (or the preview's authoritative notional) into `evaluateTradeSubmit` for protected orders; keep `marketPrice` only for limit-order comparison where the user sets the price.
- Acceptance: For a 2-level-deep book, the submit button enablement matches the displayed total exactly; no state where the user sees total X but the gate evaluates Y.

### CT-07 — Portfolio positions have no sort/filter; distributions ledger is a push away [P2]
- Screens: `frontend/src/screens/PortfolioScreen.tsx`, `frontend/src/components/coown/portfolio/PortfolioPositionRow.tsx`, `frontend/src/components/coown/portfolio/PortfolioPositionsHeader.tsx`
- Evidence: Positions render in server order with no sort control (web table sorts by units/cost/value/appraisal/est. income). Portfolio shows positions + insights only — the income/distributions table that web renders inline on the same page is a separate screen reached via a link (`onViewDistributions`).
- Web parity: `web/src/components/coown/portfolio/PortfolioView.tsx:207-219` renders `DistributionsTable` directly beneath positions; `PositionsTable.tsx` is sortable with thumbnail column.
- Competitor: Vinted wallet / eBay portfolio pages keep positions sortable by value & recency.
- Root cause: Mobile flattened the two-table page into tabs + linked screens without preserving sorting.
- Fix: Add a compact sort affordance on the Positions tab (value / cost / recent) and a slim "Recent distributions" inline section (3–5 rows + "See all") on the Insights tab.
- Acceptance: Positions sortable by at least value and recent; distributions preview visible without leaving Portfolio.

### CT-08 — "Trading rules" pre-trade strip omits issuer/custody terms the web accordion shows [P3]
- Screens: `frontend/src/components/coown/asset-detail/AssetMarketSection.tsx:735-755`
- Evidence: The market tab ends with two compact rows — "Price protection" and "Settlement 1ZE · {fee}%" — while issuer identity/verification and custody terms require opening the dossier sheet (`AssetDetailScreen.tsx:1306`) or pushing to `AssetDueDiligence`. Trust badges do exist in `AssetOverviewDetails.tsx:91-98` (Authenticated / Insured custody), but only on the Overview tab, not adjacent to the trade entry point.
- Web parity: `web/src/components/coown/asset-detail/DueDiligenceSection.tsx` renders an inline "Market rules" accordion on the same page as the order book — Issuer row with Verified badge, Custody & condition, Fees — plus the full Due diligence accordion.
- Competitor: eBay places trust signals adjacent to buy actions; brokers keep fee/custody terms one tap from the ticket.
- Root cause: Mobile consolidated rules into 2 rows + a sheet; issuer/custody never surfaced on the market tab.
- Fix: Add a third compact row "Issuer · Verified" (from `asset.issuerDisplayName`/`verificationLevel`) and "Custody · {custodyAccountType}" rows, or deep-link the "Trading rules" section header to the dossier sheet.
- Acceptance: Issuer verification and custody are visible on the market tab before the user presses Trade, matching web accordion coverage.

### CT-09 — Corporate-action resolution fetches the whole action list to find one record [P3]
- Screens: `frontend/src/screens/CorporateActionVoteScreen.tsx:48-54`, `CorporateActionDetailScreen.tsx:27-33`
- Evidence: Both screens `fetchCoOwnAssetCorporateActions` then `.find(a => a.id === actionId)`; the code comment admits "No dedicated single-action contract exists." A failed/empty list conflates "action doesn't exist" with "service error" (`CorporateActionDetailScreen.tsx:39-40` falls back to synthetic record — benign but noted).
- Web parity: `web/src/lib/contracts/coown.ts` exposes a single corporate-action contract used by `web/src/app/co-own/asset/[id]/actions/[actionId]/`.
- Competitor: n/a.
- Root cause: Missing `GET /api/coown/assets/{id}/corporate-actions/{actionId}` endpoint; mobile loops on the list.
- Fix: Add the single-action endpoint and contract; fall back to the list-find only for backward compat.
- Acceptance: Voting/detail screens issue one request scoped to the action; "action not found" is distinguishable from transport error.

## Non-findings (verified good)
- **Direction grammar** — buy=coownUp/sell=coownDown consistent: `TradeScreen.tsx:1015`, `CoOwnOrderBook.tsx`, `AssetMarketSection.tsx:678`, `SyndicateOrderHistoryScreen.tsx`, `MarketLedgerScreen.tsx`, `TradeConfirmScreen.tsx`.
- **Order book parity** — Book/Depth/Trades tabs (`AssetMarketSection.tsx:504-615`), cumulative depth bars + bid/ask imbalance gauge + spread bps (`CoOwnOrderBook.tsx`), tap-to-prefill via `onSelectOrderBookLevel` → `handleBookSelect` (`TradeScreen.tsx:422-436`), top-of-book strip with freshness stamp.
- **Trade flow correctness** — live-data gate with staleness reconciliation (`TradeScreen.tsx:238-263`), preview→reservation (`TradeScreen.tsx:294-367`), per-session idempotency keys rotated after each attempt (`TradeScreen.tsx:232-237`, `TradeConfirmScreen.tsx`), `maxPriceGbp`/`minPriceGbp` protected-market contract fields, BigInt-safe GBP parsing via `formatTradeMoneyInput`/`sanitizeTradePriceInput`.
- **Watchlist persistence** — server-authoritative: `useStore.ts` hydrates via `fetchCoOwnWatchlist(200)` on auth, applies mutations only after server ack, tracks pending/confirmed/failed; `CoOwnInstrumentCard` star reflects live watched state (fixes the historical web "stars never persisted" bug — web still uses localStorage, `coownWatchlist.ts`).
- **Chart-type segmented control** — `AssetDetailScreen.tsx:164` (`Line`/`Candlestick`/`Area`) + `CoOwnValueStrip` TradingView details strip; range→server-interval mapping is explicit per-range in `AssetOverviewSection.tsx:49-56` (no silent wrong-range render).
- **Open-order cancel safety** — ownership + asset-association verified before cancel, cancellation blocked during order-book reconciliation (`AssetDetailScreen.tsx`), inline cancel with per-row spinner (`AssetMarketSection.tsx:708-722`).
- **Eligibility & guardrails** — `computeEligibility`/`evaluateTradeSubmit` produce inline reasons ("closed to trading", "synchronizing book", "max N units") under the disabled CTA (`TradeScreen.tsx:1020-1024`); max-units clamps to `executableUnits` on protected orders (`TradeScreen.tsx:176-179`).
- **State coverage** — every scoped screen ships skeleton (not spinner) + error-with-retry + empty + offline-banner + partial states (`CoOwnStateCanvas`, `CoOwnOfflineBanner`, `CommerceDetailUnavailableInline`, `PortfolioPartialBanner`); tape/orders show "Offline — last known" qualifiers rather than stale-as-live.
- **Honesty** — `CoOwnPriceAlertsScreen.tsx` displays "Alert evaluation runs every few minutes; notifications are not guaranteed"; corporate-action quorum/threshold/deadline missing data fails closed (`CorporateActionVoteScreen.tsx`); Leaderboard uses only real allocation/supply/recency metrics with explicit "no speculative price-move metrics" comment (`AssetLeaderboardScreen.tsx:104`).
- **Buyout** — unavailable-holdings vs zero-ownership distinguished, durable idempotency via `loadOrCreateIdempotencyKey`, partial-unit accept supported (`BuyoutScreen.tsx`).
- **A11y** — accessibilityRole/Label/State present on segmented controls, tabs, cancel links, duration chips; tabular-nums on all monetary columns.
