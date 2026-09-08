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

## Wave 4 — Asset Detail flagship trading surface (Kalshi/Polymarket benchmark)

Research: live web research on Kalshi market screen + Polymarket event page (see `research-ledger-asset-detail-2026-09.md`); full repo archaeology audit of Asset Detail data flow.

### Backend
- Added `GET /co-own/distributions` (was missing — DistributionHistoryScreen 404'd): authenticated user-scoped rows with keyset cursor pagination; anonymous path returns per-asset aggregates only, no per-user data.
- Added `GET /co-own/corporate-actions` and `GET /co-own/assets/:assetId/corporate-actions` (were missing — CorporateActionDetailScreen 404'd): assetId/type/limit filters, 404 for missing asset, exact CoOwnCorporateAction contract mapping.

### Frontend — Market tab
- 24h stats strip: `24h ±X.X% · Vol · Spread` under the transaction surface, direction-colored (coownUp/coownDown), null segments omitted entirely.
- Execution tape: last 8 settled executions (time · price · units) with cancellation guard, stale-tape clearing on asset switch, inline error + retry. Public feed carries no side data, so no side glyphs are fabricated.

### Frontend — Overview tab
- Real ranged price history: range chips now drive `fetchCoOwnPriceHistory` (1D→1h/48, 1W→4h/42, 1M→1d/30, 3M→1d/90, 1Y/ALL→1w/52). Previous candles no longer leak across ranges; embedded asset candles are the fallback; loading/error states honest.
- Volume toggle wired end-to-end (was dead state); chart receives lastPrice.

### Frontend — Ownership tab
- Corporate actions & events block (up to 3 rows, unknown backend types skipped, never guessed).
- Buyout offers disclosure row → real Buyout screen (backend routes + P0-hardened auth from Wave 3).
- Hard-coded hex colors replaced with theme tokens (successSubtle/textMuted/success); P&L uses financial-direction tokens.

### Frontend — screen wiring
- `hasActiveOrders` no longer hard-coded false: owner-scoped market history checked for open/partially_filled orders on this asset (recent-50 window, documented approximation).
- `hasUnclaimedDistributions` now status-based (non-settled only), not "any distribution exists".
- Pull-to-refresh now bumps a refreshKey so distributions, corporate actions, and active orders refresh with asset/orderbook/holdings.
- Dead expansion props removed from screen + sections.

### Adversarial review + repairs (fresh-context reviewer)
- P0 fixed: inverted `.catch` guards in three effects left previous asset's distribution/corporate-actions/active-orders state visible after an asset switch with a failing fetch.
- P1 fixed: stale candles under a new range label (history state now reset on range change and error).
- P1 fixed: execution tape race (cancellation guard + tape cleared on asset switch + limit raised to 25 to survive settled-filtering).
- P1 fixed: pull-to-refresh now refreshes all new data sources.
- P1 fixed: hard-coded colors in ownership section → theme tokens.
- Documented P2/P3 (deferred): cursor off-by-one (empty final page possible), silent failure states in ownership rows, remaining card-density in overview/ownership sections, static source-string test weakness, 50-entry active-orders window.

### Tests
- Updated 2 stale source-analysis tests: candle gating (now `hasChartCandles` with ranged history) and buyout navigation (Buyout is now a real screen — assertion inverted from prohibition to requirement).

## Wave 5 — P2/P3 debt closure (pagination, state coverage, anti-AI density, runtime tests)

### Backend
- Fixed distributions cursor off-by-one: fetches limit+1 rows, `hasMore = rows.length > limit` — no more empty final page when exactly `limit` rows remain.
- Anonymous distributions path now validates an explicit `assetId` exists (404 for unknown assets instead of a silent empty aggregate).

### Frontend — fail-visible states (was fail-silent)
- `AssetOwnershipSection` gained `distributionsFailed` / `corporateActionsFailed` props; failed fetches render quiet "Distribution history unavailable" / "Events unavailable" lines instead of looking identical to a genuine empty state. Screen tracks and resets the flags per fetch/refresh.
- Genuinely-empty corporate actions still omit the block entirely (no placeholder chrome).

### Frontend — code quality
- All 10 dead props removed from `AssetMarketSection` (+ `dossierSummary` from overview, dead `dossierVerified`/`dossierMissing` computations from the screen).
- `!` non-null assertions eliminated (safe optional chains with identical behavior); `as unknown as RecommendationItem` cast replaced with a type-safe minimal object.
- Tabular numerals added to distribution amount/per-unit values.

### Anti-AI design pass (overview + ownership sections)
- Card-sprawl reduced: provenance, decisions & exit rules, corporate actions, and distributions blocks flattened from `cardSurface` rectangles to flat `CommerceDetailSection` + hairline-separated rows. Position card and valuation benchmark (dominant panels) kept.
- All hard-coded rgba/hex fills replaced with theme tokens (`colors.border`, `colors.surface`, `colors.surfaceAlt`, `colors.successSubtle`).
- Label-everything noise stripped: decorative per-row glyphs removed (icons kept only where they carry state); document chips became flat brand-colored links; a11y labels preserved verbatim.

### Runtime behavioral tests (new `coownAssetDetailRuntime.test.tsx`, 15 tests)
- Ranged history: range→interval mapping verified (1W→4h/42, 1M→1d/30, 1D→1h/48); previous-range candles never render under a new range while loading; error/empty falls back to embedded candles; minor-unit→GBP conversion verified.
- Execution tape: settled-only filtering verified; inline error on failure.
- 24h stats strip: null segments omitted; no strip when all fields null.
- Ownership fail-visible states: "Events unavailable" / "Distribution history unavailable" render only on failure, never on genuine emptiness.
- Test-infrastructure mocks documented: expo-video, FlashList, BottomSheet (node-unparseable native builds), coown barrel (Skia).

## Current status

TypeScript (frontend + backend) passes. 84/85 test files pass (new runtime suite green at 28 tests); the only failing file remains the pre-existing group-chat parity suite (6 tests, unrelated to co-own).

## Wave 6 — Kalshi/Polymarket parity: open orders, related assets, holder transparency

### Market tab — Your Open Orders panel (6A)
- New inline panel on the Market tab between the transaction surface and the order book ladder — the same placement Kalshi and Polymarket use for open-order management.
- Fetches the viewer's open/partially_filled orders for THIS asset from `listUserMarketHistory` (latest 50, filtered by `referenceId` and `status`). Anonymous viewers get `null` → panel hidden entirely.
- Each row shows: BUY/SELL side badge (coownUp/coownDown tokens), order type (limit/protected), limit price, remaining/total units, and a Cancel control.
- Cancel is optimistic: local removal → API call → on error, re-fetch and toast. Cancel-in-flight shows a spinner instead of the Cancel button.
- State coverage: populated (rows with cancel), empty ("No resting orders on this asset"), error ("Open orders unavailable" with retry), anonymous (panel omitted), cancelling (spinner).
- Refresh-key invalidation: pull-to-refresh re-fetches open orders alongside asset, order book, holdings, distributions, and corporate actions.

### Related Assets rail (6B)
- Compact horizontal scroll below the tabbed content showing same-issuer sibling assets — the Kalshi/Polymarket "Related markets" pattern adapted for ownership markets.
- Fetches up to 8 sibling assets via `listCoOwnAssets({ issuerId })`, excluding the current asset.
- Each chip: image, title, last-trade-or-offering price, availability dot + units-left label. Minimal card surface (hairline border, surfaceAlt fill) — not a card-heavy grid.
- Failed fetch is silent (rail hidden) — related assets are a discovery enhancement, not critical market data.
- Navigation: `navigation.push('AssetDetail', { assetId })` to avoid losing scroll position on the current asset.

### Ownership concentration transparency (6C)
- Added `holderCount` prop to `AssetOwnershipSection` — renders a factual line below the ownership bar legend: "N co-owners · X% allocated".
- Uses singular "co-owner" when count is 1. Omitted entirely when holderCount is null or 0.
- No fabricated top-holder list — only the verified aggregate count from the asset contract.

### Runtime tests (6D)
- New `coownAssetDetailRuntime.test.tsx` expanded from 19 to 28 tests:
  - Open orders panel: renders side/price/remaining units, empty state, error state, anonymous omission, cancel control, cancelling spinner.
  - Holder count: renders count + allocation %, singular pluralization, omission on null/0.
  - Contract surface: verifies `cancelCoOwnOrder` and `listCoOwnAssets` are exported functions.

### Verification
- TypeScript (frontend): pass.
- Runtime suite: 28/28 tests pass.
- Full suite: 84/85 test files pass, 1759 tests passed, 6 pre-existing group-chat failures (unrelated).

## Waves 24-30 (2026-09-08) � Section nav restyle + broker-grade section deepening

### User direction
- Restyle Overview/Market/Ownership navigation to the editorial tab rail used by
  Profile (Listings/Looks/About/Reviews) and Home (For you/Following).
- Deepen each section with properly engineered components.

### Wave 24 � Editorial tab rail + market surface upgrades (d09d47f3)
- CoOwnSegmentNav restyled from filled pill segmented control to the canonical
  editorial tab rail: text tabs on canvas, hairline bottom border, one shared
  animated underline (Reanimated, 220ms cubic-out, 40% tab width, brand color),
  reduced-motion instant assignment. Notification dots + haptics retained.
- Market: top-of-book quote strip (best bid price+size | spread | best ask
  price+size, coownUp/coownDown, tabular numerals) above the ladder.
- Market: execution tape prints uptick/downtick direction vs previous execution.
- Overview: valuation row restructured from 3 equal cells to dominant appraised
  value + right-aligned valuer/date caption column.

### Wave 25 � Distribution summary hierarchy (ee3b1dfb)
- Per-unit payout is now the dominant number; total pool + settled date as
  supporting line.

### Wave 26 � Nav underline geometry fix (bc43f317)
- Adversarial self-review found the underline offset by the container's
  horizontal padding; rail made full-bleed to match profile TabRail exactly.

### Wave 27 � Chart header hierarchy (d996a27d)
- Premium/discount % rendered semibold tabular; stale marker on its own
  warning-colored line instead of a buried string suffix.

### Waves 28-30 � Fresh-eyes adversarial audit fixes (249fb4ff, da2a71f2, 0b0cf8d8)
Independent subagent audit of the three sections found 18 findings (0 P0).
Fixed the material ones:
- Market: dead orderBookHasGap prop removed; filled market-state pill replaced
  with 6pt dot + text; execution tape loading row added; order book loading
  ("Synchronizing depth...") no longer conflated with empty; Alert hitSlop +
  press feedback; venueMetadataText on canonical caption token.
- Overview: duplicate "Full dossier" trailing CTA removed; metaLabel on
  TypographyV2.label token; sparse-chart body tabular numerals; chevron sizes
  standardized to 14; doc chips hitSlop.
- Ownership: Unrealized P&L dominates the position row (flex 1.4 + priceList
  20pt bold); distributions and corporate actions gained explicit loading
  states (screen tracks distributionsLoading/corporateActionsLoading);
  metaLabel on TypographyV2.label token.

### Verification (final)
- TypeScript (frontend): pass.
- Full suite: 85/85 test files, 1764 tests passed, 2 skipped, 0 failures.
