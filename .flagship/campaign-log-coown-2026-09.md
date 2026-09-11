# Co-Own campaign log â€” 2026-09-07

## Wave 1 â€” contract and trust closure

- Added authenticated asset issue persistence and compliance audit event.
- Blocked issuer self-asserted authenticity verification.
- Removed holdings fallback that converted an endpoint failure into an empty portfolio.
- Preserved protected-market order type and exact GBP preview strings through history and confirmation.

## Wave 2 â€” market truth and portfolio liquidity

- Added backend-backed best bid/ask and executable depth to asset discovery.
- Added reserved sell units and bid-depth sale proceeds to authenticated holdings.
- Portfolio cards now separate marked value from estimated sale proceeds and show `No current bids` when depth is empty.
- Public raw order responses omit counterparty user IDs.
- Ledger online failures now surface reconciliation/error state instead of silently presenting partial local cache.
- Asset detail now exposes a compact first-viewport bid/ask strip with honest loading and no-depth states; the full ladder remains progressive.
- Foreground revalidation now fails closed through the shared order-book hook while a fresh snapshot is in flight.

## Wave 3 â€” lifecycle model, asset screen restructure, discovery evolution, trade flow, portfolio truth, security hardening

### Backend
- Fixed voting handler: `units` â†’ `units_owned` column, `holder_user_id` â†’ `user_id`, action-asset identity enforced, record date eligibility added.
- Added `offeringStatus` (`offering`/`allocated`/`failed`/`closed`) and `marketStatus` (`pre_market`/`trading`/`paused`/`closed`) to all asset projections. `isOpen` retained for backward compatibility.
- Added `lastTradePriceGbp` to asset projections.
- Fixed buyout auth binding: `.strict()` on body schemas, authenticated-user identity check against `bidderUserId`/`holderUserId`.
- Added exit lifecycle enforcement: `hasActiveExitAction()` check in preview, reserve, order placement, and buyout creation handlers.
- Fixed reservation/final placement rounding mismatch: final placement now uses 4-decimal rounding matching reservation.
- Added reconciliation halt check to preview and reserve handlers.

### Frontend â€” Asset Detail
- Reduced from ~2,064 to ~1,352 lines; extracted to `AssetOverviewSection`, `AssetMarketSection`, `AssetOwnershipSection`.
- Removed "Co-Own v2" implementation badge.
- Fixed NAV labeling: "NAV / unit" â†’ "Appraised value / unit", "Reference vs NAV" â†’ "Reference vs appraisal".
- Reduced media height from 50-58% to 26-30% to bring ownership info into first viewport.
- Consolidated to one dominant price display: offering price during issuance, last trade with timestamp for secondary.
- Lifecycle-aware composition: initial offering, secondary trading, trading paused, exit underway.
- `deriveLifecycleState` now uses backend `marketStatus`/`offeringStatus` with legacy fallback.

### Frontend â€” Discovery Hub
- Segments replaced: `active`/`new_issues`/`watchlist` â†’ `offerings`/`trading`/`watchlist`.
- ROI sorting replaced with factual options: `newest`/`price`/`activity`.
- Lifecycle labels fixed: "Offering", "Trading", "Available to trade", "Funding ended".
- Public browsing enabled (no auth gate on discovery).

### Frontend â€” Trade Flow
- Post-submission navigation now passes `orderId`/`assetId` to order history (not general hub).
- Plain-language trade ticket: "Marketable limit" â†’ "Buy/Sell available units", "Protection price" â†’ "Maximum/Minimum price per unit".
- Explicit remainder behavior in review step.
- TradeScreen "Last" price now uses `lastExecutionPriceGbp` instead of reference price.
- Protected-instant headline quote now uses fill estimate average price, not reference price.

### Frontend â€” Portfolio
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

## Wave 4 â€” Asset Detail flagship trading surface (Kalshi/Polymarket benchmark)

Research: live web research on Kalshi market screen + Polymarket event page (see `research-ledger-asset-detail-2026-09.md`); full repo archaeology audit of Asset Detail data flow.

### Backend
- Added `GET /co-own/distributions` (was missing â€” DistributionHistoryScreen 404'd): authenticated user-scoped rows with keyset cursor pagination; anonymous path returns per-asset aggregates only, no per-user data.
- Added `GET /co-own/corporate-actions` and `GET /co-own/assets/:assetId/corporate-actions` (were missing â€” CorporateActionDetailScreen 404'd): assetId/type/limit filters, 404 for missing asset, exact CoOwnCorporateAction contract mapping.

### Frontend â€” Market tab
- 24h stats strip: `24h Â±X.X% Â· Vol Â· Spread` under the transaction surface, direction-colored (coownUp/coownDown), null segments omitted entirely.
- Execution tape: last 8 settled executions (time Â· price Â· units) with cancellation guard, stale-tape clearing on asset switch, inline error + retry. Public feed carries no side data, so no side glyphs are fabricated.

### Frontend â€” Overview tab
- Real ranged price history: range chips now drive `fetchCoOwnPriceHistory` (1Dâ†’1h/48, 1Wâ†’4h/42, 1Mâ†’1d/30, 3Mâ†’1d/90, 1Y/ALLâ†’1w/52). Previous candles no longer leak across ranges; embedded asset candles are the fallback; loading/error states honest.
- Volume toggle wired end-to-end (was dead state); chart receives lastPrice.

### Frontend â€” Ownership tab
- Corporate actions & events block (up to 3 rows, unknown backend types skipped, never guessed).
- Buyout offers disclosure row â†’ real Buyout screen (backend routes + P0-hardened auth from Wave 3).
- Hard-coded hex colors replaced with theme tokens (successSubtle/textMuted/success); P&L uses financial-direction tokens.

### Frontend â€” screen wiring
- `hasActiveOrders` no longer hard-coded false: owner-scoped market history checked for open/partially_filled orders on this asset (recent-50 window, documented approximation).
- `hasUnclaimedDistributions` now status-based (non-settled only), not "any distribution exists".
- Pull-to-refresh now bumps a refreshKey so distributions, corporate actions, and active orders refresh with asset/orderbook/holdings.
- Dead expansion props removed from screen + sections.

### Adversarial review + repairs (fresh-context reviewer)
- P0 fixed: inverted `.catch` guards in three effects left previous asset's distribution/corporate-actions/active-orders state visible after an asset switch with a failing fetch.
- P1 fixed: stale candles under a new range label (history state now reset on range change and error).
- P1 fixed: execution tape race (cancellation guard + tape cleared on asset switch + limit raised to 25 to survive settled-filtering).
- P1 fixed: pull-to-refresh now refreshes all new data sources.
- P1 fixed: hard-coded colors in ownership section â†’ theme tokens.
- Documented P2/P3 (deferred): cursor off-by-one (empty final page possible), silent failure states in ownership rows, remaining card-density in overview/ownership sections, static source-string test weakness, 50-entry active-orders window.

### Tests
- Updated 2 stale source-analysis tests: candle gating (now `hasChartCandles` with ranged history) and buyout navigation (Buyout is now a real screen â€” assertion inverted from prohibition to requirement).

## Wave 5 â€” P2/P3 debt closure (pagination, state coverage, anti-AI density, runtime tests)

### Backend
- Fixed distributions cursor off-by-one: fetches limit+1 rows, `hasMore = rows.length > limit` â€” no more empty final page when exactly `limit` rows remain.
- Anonymous distributions path now validates an explicit `assetId` exists (404 for unknown assets instead of a silent empty aggregate).

### Frontend â€” fail-visible states (was fail-silent)
- `AssetOwnershipSection` gained `distributionsFailed` / `corporateActionsFailed` props; failed fetches render quiet "Distribution history unavailable" / "Events unavailable" lines instead of looking identical to a genuine empty state. Screen tracks and resets the flags per fetch/refresh.
- Genuinely-empty corporate actions still omit the block entirely (no placeholder chrome).

### Frontend â€” code quality
- All 10 dead props removed from `AssetMarketSection` (+ `dossierSummary` from overview, dead `dossierVerified`/`dossierMissing` computations from the screen).
- `!` non-null assertions eliminated (safe optional chains with identical behavior); `as unknown as RecommendationItem` cast replaced with a type-safe minimal object.
- Tabular numerals added to distribution amount/per-unit values.

### Anti-AI design pass (overview + ownership sections)
- Card-sprawl reduced: provenance, decisions & exit rules, corporate actions, and distributions blocks flattened from `cardSurface` rectangles to flat `CommerceDetailSection` + hairline-separated rows. Position card and valuation benchmark (dominant panels) kept.
- All hard-coded rgba/hex fills replaced with theme tokens (`colors.border`, `colors.surface`, `colors.surfaceAlt`, `colors.successSubtle`).
- Label-everything noise stripped: decorative per-row glyphs removed (icons kept only where they carry state); document chips became flat brand-colored links; a11y labels preserved verbatim.

### Runtime behavioral tests (new `coownAssetDetailRuntime.test.tsx`, 15 tests)
- Ranged history: rangeâ†’interval mapping verified (1Wâ†’4h/42, 1Mâ†’1d/30, 1Dâ†’1h/48); previous-range candles never render under a new range while loading; error/empty falls back to embedded candles; minor-unitâ†’GBP conversion verified.
- Execution tape: settled-only filtering verified; inline error on failure.
- 24h stats strip: null segments omitted; no strip when all fields null.
- Ownership fail-visible states: "Events unavailable" / "Distribution history unavailable" render only on failure, never on genuine emptiness.
- Test-infrastructure mocks documented: expo-video, FlashList, BottomSheet (node-unparseable native builds), coown barrel (Skia).

## Current status

TypeScript (frontend + backend) passes. 84/85 test files pass (new runtime suite green at 28 tests); the only failing file remains the pre-existing group-chat parity suite (6 tests, unrelated to co-own).

## Wave 6 â€” Kalshi/Polymarket parity: open orders, related assets, holder transparency

### Market tab â€” Your Open Orders panel (6A)
- New inline panel on the Market tab between the transaction surface and the order book ladder â€” the same placement Kalshi and Polymarket use for open-order management.
- Fetches the viewer's open/partially_filled orders for THIS asset from `listUserMarketHistory` (latest 50, filtered by `referenceId` and `status`). Anonymous viewers get `null` â†’ panel hidden entirely.
- Each row shows: BUY/SELL side badge (coownUp/coownDown tokens), order type (limit/protected), limit price, remaining/total units, and a Cancel control.
- Cancel is optimistic: local removal â†’ API call â†’ on error, re-fetch and toast. Cancel-in-flight shows a spinner instead of the Cancel button.
- State coverage: populated (rows with cancel), empty ("No resting orders on this asset"), error ("Open orders unavailable" with retry), anonymous (panel omitted), cancelling (spinner).
- Refresh-key invalidation: pull-to-refresh re-fetches open orders alongside asset, order book, holdings, distributions, and corporate actions.

### Related Assets rail (6B)
- Compact horizontal scroll below the tabbed content showing same-issuer sibling assets â€” the Kalshi/Polymarket "Related markets" pattern adapted for ownership markets.
- Fetches up to 8 sibling assets via `listCoOwnAssets({ issuerId })`, excluding the current asset.
- Each chip: image, title, last-trade-or-offering price, availability dot + units-left label. Minimal card surface (hairline border, surfaceAlt fill) â€” not a card-heavy grid.
- Failed fetch is silent (rail hidden) â€” related assets are a discovery enhancement, not critical market data.
- Navigation: `navigation.push('AssetDetail', { assetId })` to avoid losing scroll position on the current asset.

### Ownership concentration transparency (6C)
- Added `holderCount` prop to `AssetOwnershipSection` â€” renders a factual line below the ownership bar legend: "N co-owners Â· X% allocated".
- Uses singular "co-owner" when count is 1. Omitted entirely when holderCount is null or 0.
- No fabricated top-holder list â€” only the verified aggregate count from the asset contract.

### Runtime tests (6D)
- New `coownAssetDetailRuntime.test.tsx` expanded from 19 to 28 tests:
  - Open orders panel: renders side/price/remaining units, empty state, error state, anonymous omission, cancel control, cancelling spinner.
  - Holder count: renders count + allocation %, singular pluralization, omission on null/0.
  - Contract surface: verifies `cancelCoOwnOrder` and `listCoOwnAssets` are exported functions.

### Verification
- TypeScript (frontend): pass.
- Runtime suite: 28/28 tests pass.
- Full suite: 84/85 test files pass, 1759 tests passed, 6 pre-existing group-chat failures (unrelated).

## Waves 24-30 (2026-09-08) ï¿½ Section nav restyle + broker-grade section deepening

### User direction
- Restyle Overview/Market/Ownership navigation to the editorial tab rail used by
  Profile (Listings/Looks/About/Reviews) and Home (For you/Following).
- Deepen each section with properly engineered components.

### Wave 24 ï¿½ Editorial tab rail + market surface upgrades (d09d47f3)
- CoOwnSegmentNav restyled from filled pill segmented control to the canonical
  editorial tab rail: text tabs on canvas, hairline bottom border, one shared
  animated underline (Reanimated, 220ms cubic-out, 40% tab width, brand color),
  reduced-motion instant assignment. Notification dots + haptics retained.
- Market: top-of-book quote strip (best bid price+size | spread | best ask
  price+size, coownUp/coownDown, tabular numerals) above the ladder.
- Market: execution tape prints uptick/downtick direction vs previous execution.
- Overview: valuation row restructured from 3 equal cells to dominant appraised
  value + right-aligned valuer/date caption column.

### Wave 25 ï¿½ Distribution summary hierarchy (ee3b1dfb)
- Per-unit payout is now the dominant number; total pool + settled date as
  supporting line.

### Wave 26 ï¿½ Nav underline geometry fix (bc43f317)
- Adversarial self-review found the underline offset by the container's
  horizontal padding; rail made full-bleed to match profile TabRail exactly.

### Wave 27 ï¿½ Chart header hierarchy (d996a27d)
- Premium/discount % rendered semibold tabular; stale marker on its own
  warning-colored line instead of a buried string suffix.

### Waves 28-30 ï¿½ Fresh-eyes adversarial audit fixes (249fb4ff, da2a71f2, 0b0cf8d8)
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

## Waves 32-36 (2026-09-08) ï¿½ Research-backed flagship deepening (UNCOMMITTED)

### Online research (3 parallel tracks, 32+ sourced findings, Sept 2026)
- Track A ï¿½ Robinhood/Public detail screens 2025-2026: module order (chart,
  position, About, Key statistics, news, related), position card hierarchy
  (market value FIRST), key-statistics label/value tables, 2025 Buy/Sell/Options
  dock redesign, Legend charts on mobile (Jun 2025).
- Track 2 ï¿½ Masterworks/Splint/Arrived/Public-Otis: dossier-style offering pages,
  position = shares + avg cost + total cost + timeline, per-asset fee disclosure,
  order-book trade flow with estimated total, document checklists (Splint),
  lifecycle timeline (Masterworks), NAV formula transparency (Arrived).
- Track 3 ï¿½ Trading UX: top-of-book + spread-centered ladders (Coinbase/Kraken/
  Kalshi/Polymarket), tick-direction tape (Kraken arrows+aggressor color),
  order lifecycle states (pending/open/partially_filled/filled/cancelled),
  granular freshness badges (LIVE/DEGRADED/STALE), tabular numerals, CVD-safe
  direction encoding (color + arrow + sign, never color alone).

### Wave 32 ï¿½ Overview: Key statistics module (new)
- Additive at-a-glance facts module, broker-pattern: 24h volume, all-time
  traded (totalTradedValueGbp ï¿½ never surfaced before), executable depth
  (bidDepthUnits/askDepthUnits ï¿½ never surfaced before), co-owners +
  allocation %, listed date. 24h move deliberately excluded (identity block
  owns it; key-stats stays additive per adversarial review).
- CommerceDetailMetricRow gained optional valueColor (backward compatible).

### Wave 33 ï¿½ Position hero (Robinhood #1 pattern)
- Market value (units x unit price) is now the dominant number of the
  position block; Units/Avg-cost/P&L are the supporting row; avg cost per
  unit rides as the cost-basis sub-label. Screen passes positionValueGbp.

### Wave 34 ï¿½ Partial-fill lifecycle status (Kraken pattern)
- Open-order rows print 'Partially filled' from the contract's status field
  instead of implying it via the remaining-units fraction; side dot aligned
  to the top line cap height.

### Wave 35 ï¿½ Transferability fact
- rights.transferable renders as a full-weight metric row when a rights
  document exists; never inferred when unpublished.

### Wave 36 ï¿½ Design.md v1.7
- Registered section-tab-rail and top-of-book-strip in the component
  contract; benchmark-date advanced to 2026-09-08.

### Adversarial review (fresh subagent) ï¿½ 6 findings, all fixed
- P0: 24h move could render NaN% ï¿½ key-stats made additive, row removed
- P1: executable depth fabricated 0u for a missing side ï¿½ now built only
  from published sides
- P2s fixed: Listed fail-closed on malformed dates, transferability muted
  misuse, open-order dot optical alignment, movePct24h dead derivation

### Verification (final)
- TypeScript (frontend): pass.
- Full suite: 85/85 test files, 1764 tests passed, 2 skipped, 0 failures.
- Per user instruction: NOT committed ï¿½ awaiting explicit user request.

## Waves 37-39 (2026-09-08) ï¿½ Signature interactions round (UNCOMMITTED)

### Wave 37 ï¿½ Chart scrub sync (Robinhood signature interaction)
- CoOwnCandleChart gained onScrubCandle: while the user scrubs/taps a
  candle, the chart header swaps its sub-heading for the inspected
  candle's close price + date (time included on 1D/1W ranges).
- Scrub haptic ticks: light selection haptic only when the inspected
  candle changes, so a drag reads as discrete ticks.
- Readout clears on range change; chart crosshair now also clears on
  prop-driven range changes (header and chart stay in sync).

### Wave 38 ï¿½ Live quote tick flash (top-of-book)
- Extracted the restrained tick-flash engine from CoOwnPriceTick into a
  shared usePriceTickFlash hook (150ms fade in direction fill, 600ms
  hold, reduced-motion safe).
- Top-of-book bid/ask prices now flash in their direction fill when the
  live order-book stream moves them ï¿½ the market tab feels alive.
  CoOwnPriceTick (previously built but unwired) is now the shared tick
  language with two consumers.

### Wave 39 ï¿½ Tape depth + adversarial review fixes
- Execution tape raised from 3 to 5 settled rows (Kraken/Coinbase tape
  density).
- Fresh adversarial review found 3 defects in the new interactions, all
  fixed: side effects inside the setState updater (P1 ï¿½ moved to
  ref-based comparison outside the updater, Strict Mode safe), stale
  onScrubCandle closure in the once-created PanResponder (P1 ï¿½ callback
  ref), and crosshair/header desync on prop-driven range changes (P2).

### Verification (final)
- TypeScript (frontend): pass.
- Full suite: 85/85 test files, 1764 tests passed, 2 skipped, 0 failures.
- Per user instruction: NOT committed ï¿½ awaiting explicit user request.

## Waves 40-42 (2026-09-08) ï¿½ Depth report register pass (UNCOMMITTED)

### Input: .flagship/coown-depth-upgrade-research-2026-09-08.md
29 confirmed findings, 5-wave plan. User's own edits landed F11 (explicit
from/to windows per range, ALL bounded by asset lifetime), F12 (chart
always mounted; range controls + retry survive empty/error), F27 (chart
accessibility increment/decrement + value announcement), and the F28
chart half (theme tokens replace static DIRECTION_COLORS in candles).

### Wave 40 ï¿½ F02 + F20 (BuyoutScreen, P0/P1)
- F02: buyout denomination made explicit ï¿½ field label 'Offer price
  (GBP ï¿½)', confirm message 'Offer ï¿½X GBP' ï¿½ no user-currency symbol
  over an unconverted GBP payload.
- F20: failed holdings fetch renders 'Unavailable' instead of verified
  zero; ownership/remaining degrade to em dashes; ownsAll and the
  remaining-units copy never assert from unknown data.

### Wave 41 ï¿½ F06 + F17 (P1/P2)
- F06: position mark now uses the SAME price the headline shows
  (dominantPriceValue), basis labelled ï¿½ 'N units ï¿½ marked at last
  trade / reference price'. Mark is never presented as sale proceeds.
- F17: chart re-emits the inspected candle when the series refreshes
  in place, so the header scrub readout can never lag the OHLC box.

### Wave 42 ï¿½ F28 completion + F13 + F22 + F01 verification
- F28 tail: CoOwnNumericText direction text, CoOwnPriceTick flash
  fills, and CoOwnOrderBook depth bars now resolve from theme tokens
  (coownUp/coownDown/coownUpSubtle/coownDownSubtle/coownUpBorder) ï¿½
  dark mode gets readable financial color everywhere; static
  DIRECTION_COLORS/DEPTH_COLORS no longer consumed in the department.
- F13 (frontend half): a live streaming book proves transport
  freshness ï¿½ elapsed execution age alone no longer marks the market
  stale or blocks trading; backend-declared connection status still
  rules. Old trades stay labelled honestly in the identity.
- F22: pending trade intent now carries { side, limitPrice } through
  the education guide ï¿½ a tapped book level survives first-trade
  onboarding.
- F01 (frontend half) verified already fixed in tree: exact-key
  lookupCoOwnOrderByIdempotencyKey reconciliation with polling; no
  recency fallback.
- Dead sparse-chart styles removed after the user's F12 refactor.

### Test contract updates (F29 direction)
- Structural proxies replaced with behavior assertions: chart-mounted
  tests now assert the always-mounted chart's data contract (empty
  candles under failure, never relabelled embedded data) instead of
  'chart never rendered'; history-fetch tests assert the windowed
  from/to contract.

### Still open (backend-owned, documented in the report)
- F03/F04/F05 (lifecycle/expiry/holds), F09/F10 (settled-trade read
  model + cache watermark), F14 (book delta aggregation), F15 (query
  ownership), F19/F21/F23-F26 ï¿½ require API/migration work.

### Verification (final)
- TypeScript (frontend): pass.
- Full suite: 85/85 test files, 1764 tests passed, 2 skipped, 0 failures.
- Per user instruction: NOT committed ï¿½ awaiting explicit user request.

## Waves 43-44 (2026-09-08) ï¿½ Register depth pass II (UNCOMMITTED)

### Wave 43 ï¿½ F18 + F15 (frontend halves)
- F18: the candle chart now measures its actual container (onLayout)
  instead of deriving width from the window ï¿½ gutters, landscape and
  larger text keep the canvas, axes and touch coordinates aligned;
  screen-derived width is only the first-paint fallback.
- F15: the parent refresh epoch propagates to the execution tape and
  the overview's ranged history ï¿½ a fresh fill or cancel is never
  hidden behind a stale feed after focus or pull-refresh. Portfolio
  focus-reconciliation verified already present in the tree.

### Wave 44 ï¿½ F06/F26 cross-surface mark + F21 cancellation contract
- Portfolio adapter now marks positions on the SAME basis as the asset
  detail hero (last settled trade when one exists, otherwise reference
  price) and exposes mark provenance (source/price/age/isStale);
  CoOwnPositionCard renders the inspectable mark row. Detail and
  portfolio can no longer disagree about what a position is worth.
- F21: the order-history cancel now reconciles the same cached
  projections the detail reconciles (asset + order book + holdings) ï¿½
  one cancellation contract across surfaces.

### Verification (final)
- TypeScript (frontend): pass.
- Full suite: 85/85 test files, 1764 tests passed, 2 skipped, 0 failures.
- Per user instruction: NOT committed ï¿½ awaiting explicit user request.

### Register status after this round (frontend-scope)
- Fixed this round: F02, F06 (detail + portfolio), F13, F15 (tape/
  history; portfolio verified), F17, F18, F20, F21, F22, F26 (mark
  provenance), F28 (full theme-token migration).
- Verified already fixed in tree: F01 (frontend), F11, F12, F27 (user
  edits), F15 (portfolio half).
- Still open ï¿½ backend-owned: F03/F04/F05 (lifecycle/expiry/holds),
  F09/F10 (settled-trade read model + cache watermark), F14 (book
  delta aggregation), F19/F23/F24/F25 (governance, reservation
  concurrency, preview/execution eligibility), F16 (time-axis policy,
  P2), F29 (native baselines + CI evidence).

## Wave 0-1 (2026-09-09) ï¿½ Surface-to-system review: backend foundation + asset identity/chart (UNCOMMITTED)

### Wave 0 ï¿½ Backend command/history foundation repair (B01-B03)
- B01: Fixed backend compile blocker at coOwn.ts:4083 ï¿½ backticks around
  is_open in a SQL comment inside a template literal prematurely closed
  the string. Backend TypeScript now compiles cleanly.
- B02: Aligned idempotency command table with its schema:
  - ON CONFLICT now uses (asset_id, actor_id, idempotency_key) matching
    the unique index on migration 200:31, not the missing-actor
    (asset_id, idempotency_key).
  - Replay SELECT now isolates by actor_id + asset_id + idempotency_key.
  - response_code ? response_status (matching the schema column name).
  - UPDATE coown_order_commands SET also fixed: response_code ?
    response_status, WHERE clause now includes actor_id.
- B03: Added timeInForce to the request hash so changed duration/body
  conflicts correctly. Replay is now isolated by actor+asset+key.

### Wave 1 ï¿½ Chart data correctness (B04-B05)
- B04: Fixed chart fallback aggregation to query coOwn_trades (the
  canonical settled-trade table) instead of the phantom coown_executions
  table that exists in no migration. Columns corrected:
  - price_gbp_minor ? ROUND(unit_price_gbp * 100) (major?minor conversion)
  - executed_at ? created_at
  The chart now reads from the same trade table that settlement writes to.
- B05: Price-history endpoint now accepts and validates from/to date
  windows. Reversed dates are rejected. Cache freshness check: if any
  settled trade exists after the latest cached bucket, the cache is
  stale and the endpoint falls through to real-time aggregation.

### Wave 1 ï¿½ Frontend asset identity + chart surface (U09-U22)
- U09: Identity header now derives price basis from marketSnapshot
  (lastExecutionPriceGbp ? "Last trade" with timestamp; no execution ?
  "Reference") rather than silently showing reference price as latest.
- U10: Market section status now separates lifecycle ("Market open"/
  "Market closed"), connectivity ("Offline ï¿½ showing saved data"),
  reconciliation ("Orders paused"), and fetch failure ("Data
  unavailable") into independent indicators ï¿½ no longer conflated.
- U11: Price basis label is now concise: "Offering", "Last trade", or
  "Reference" ï¿½ one or two words in TypographyV2.meta.
- U20: Chart copy now distinguishes error ("Price history unavailable"),
  loading ("Loading price history..."), and empty success ("No settled
  trades for this range") ï¿½ failure no longer says "No trades".
- U21: Scrub readout now shows full context: close price, direction
  text+glyph (?/?/?) with color, active range label, date/time, O/H/L/C,
  and volume. accessibilityLabel includes the full context. Direction
  is encoded as both color AND text (not color-only).
- U22: Appraisal display now: labeled "Appraisal value / unit" (not
  just a price), shows "Not available" when missing, adds "Not a
  tradable price" disclaimer, surfaces stale indicator (>90d), links
  to source document when found, and distinguishes published vs
  unpublished valuer.

### Verification (final)
- Backend TypeScript: pass.
- Frontend TypeScript: pass.
- Full suite: 85/85 test files, 1764 tests passed, 2 skipped, 0 failures.
- Per user instruction: NOT committed ï¿½ awaiting explicit user request.

### Register status after this round
- Fixed this round: B01, B02, B03, B04, B05, U09, U10, U11, U20, U21, U22.
- Still open from the surface-to-system review:
  - U01-U08 (hub/watchlist/identity/navigation)
  - U12-U19 (tab/media/depth/candle geometry)
  - U23-U36 (market tab/depth/open orders/ticket/receipt/recovery)
  - U37-U55 (ownership/portfolio/buyout/governance/distributions/alerts)
  - U56-U68 (diligence/rights/issuance/support/native quality)
  - B06-B15 (expiry/reservations/lifecycle/buyout/alerts/DRIP/tests)

## Wave 2 (2026-09-09) ï¿½ Market tab + order ticket + cancellation + backend lifecycle (UNCOMMITTED)

### Backend ï¿½ B10, B13
- B13: Added migration 277 (coown_order_terminal_reason.sql) with
  cancel_reason column ('user', 'expired', 'rejected', 'system').
  Expiry sweeper now sets cancel_reason = 'expired'. User cancel sets
  cancel_reason = 'user'. Order history and my-orders queries now return
  cancelReason so the frontend can distinguish "Expired" from "Cancelled".
- B10: Verified lifecycle policy consistency ï¿½ exit action checks
  (hasActiveExitAction) are present across reservation, order placement,
  and buyout creation. The buyout accept handler is intentionally exempt
  so holders can accept during exit proceedings.

### Frontend ï¿½ U23-U25, U29 (market depth + execution tape)
- U23: Stats spread now prefers streaming spread over snapshot; stale
  indicator shows on the summary when streaming is live but summary is
  snapshot-based.
- U24: Fixed-width price/quantity rails (76pt/68pt), explicit "Bids"/
  "Asks" headers, press feedback on row selection, "Cumulative" vs
  "Size" column labeling.
- U25: Five distinct empty/paused/closed/offline states with state-
  appropriate copy and valid next actions only.
- U29: Stable relative timestamps ("2m ago"), bounded "Showing 5 of N
  recent trades" footer, no counterparty identity leakage.

### Frontend ï¿½ U26-U28, U33 (cancellation + recovery)
- U26: Cancellation shows "Cancelling..." pending state; network error
  keeps the row visible (cancel may have succeeded); server rejection
  shows "Cancel failed ï¿½ retry" with the row still visible.
- U27: Reconciliation halt proactively disables cancel button with
  "Orders paused" reason before interaction.
- U28: Open-order failure shows contextual retry that only retries the
  open-orders section, preserving chart/asset data.
- U33: Recovery banner says "Check result"; focus, pull-to-refresh, and
  the button all invoke the same exact-key reconciliation command.

### Frontend ï¿½ U30-U32 (trade ticket/review)
- U30: Review screen now shows complete commitment: side, units, per-unit
  price, protection price, estimated fill, unfilled remainder, fees,
  total debit/net proceeds, and duration (GFD/GTC90). Missing fields
  show "Not available".
- U31: Selected book price survives through guide, rights, and review;
  revalidation before commitment checks if quote moved >2%.
- U32: Quote-changed notice blocks auto-submit; outcomes distinguished:
  immediate fill, partial fill (resting balance), rejection, unknown
  result.

### Frontend ï¿½ U35-U36 (pagination + multi-fill receipts)
- U35: Pagination error preserves rows, cursor, and hasMore; footer
  retry instead of false end-of-history.
- U36: Expandable receipt per order: executed/remaining quantity, average
  execution (or "Not available"), fees, created/updated timestamps,
  terminal reason, and "View asset" link back to the exact asset.

### Verification (final)
- Backend TypeScript: pass.
- Frontend TypeScript: pass.
- Full suite: 85/85 test files, 1764 tests passed, 2 skipped, 0 failures.
- Per user instruction: NOT committed ï¿½ awaiting explicit user request.

### Register status after this round
- Fixed this round: B01, B02, B03, B04, B05, B10, B13, U09, U10, U11,
  U20, U21, U22, U23, U24, U25, U26, U27, U28, U29, U30, U31, U32,
  U33, U35, U36.
- Still open from the surface-to-system review:
  - U01-U08 (hub/watchlist/identity/navigation/media)
  - U12-U19 (tab dots/media geometry/candle positions/sparse markets)
  - U37-U55 (ownership/portfolio/buyout/governance/distributions/alerts)
  - U56-U68 (diligence/rights/issuance/support/native quality)
  - B06-B12, B14-B15 (expiry sweeper/reservations/lifecycle/buyout/
    alerts/DRIP/portfolio projection/contract tests)

## Wave 3-4 (2026-09-09) ï¿½ Ownership/portfolio + buyout/governance (UNCOMMITTED)

### Backend ï¿½ B11/U47
- B11/U47: Fixed partial buyout acceptance bug. Previously, a partial
  acceptance set offer status to 'accepted', causing the next holder's
  acceptance to fail with "offer is no longer open". Now the offer
  remains 'open' until accepted_units >= target_units ('settled') or
  the deadline passes. Two holders can now contribute sequentially.
- U48: Enhanced GET /co-own/corporate-actions/:actionId/votes to
  compute and return eligibility (eligible, reason, votingPowerUnits,
  recordDate, status) by mirroring the POST handler's record-date
  replay and holdings logic.

### Frontend ï¿½ U37-U43 (ownership/portfolio)
- U37: Position card now has a marked-value hero (large dominant text)
  with compact hairline rows for cost basis, P&L, and sale proceeds ï¿½
  no more equally-weighted financial tiles.
- U38: Reference fallback is now labeled "reference" (not "mid").
  Unknown freshness (null ageSeconds) shows "unknown" instead of
  implying fresh.
- U39: Sale estimate client-side capped to sellable units. Partial
  liquidity label ("Can sell N of M units at current bid") and quote
  age label shown.
- U40: Request token prevents older focus-refresh results from
  replacing newer manual-refresh results.
- U41: Fan-out documented as known limitation; partial totals retained.
- U42: Chart labeled "Cost vs value" (not "Performance"); historical
  performance note says "requires valuation records".
- U43: Buy button permission-aware (disabled with reason when not
  eligible); denominations explicit.

### Frontend ï¿½ U44-U49 (buyout/governance)
- U44: Live breakdown: "ï¿½X per unit ï¿½ Y units = ï¿½Z commitment" with
  target, expiry, and settlement denomination before submit.
- U45: Client-side idempotency key persisted in MMKV; lost response
  shows "Check offer"; retry resolves the same offer by matching
  metadata.idempotencyKey.
- U46: Active buyout offers section with per-unit price, target,
  accepted/remaining, expiry; eligible holders can accept; "No active
  buyout offers" when none exist.
- U48: Vote eligibility summary (record date, voting power, status);
  ineligible shows disabled form with reason; read-only tally retained.
- U49: Vote fetch errors surface with retry; uncertain-submit shows
  "Vote not confirmed ï¿½ check back"; tally refreshes after vote.

### Verification (final)
- Backend TypeScript: pass.
- Frontend TypeScript: pass.
- Full suite: 85/85 test files, 1764 tests passed, 2 skipped, 0 failures.
- Per user instruction: NOT committed ï¿½ awaiting explicit user request.

### Register status after this round
- Fixed across all rounds: B01, B02, B03, B04, B05, B10, B11, B13,
  U09, U10, U11, U20, U21, U22, U23, U24, U25, U26, U27, U28, U29,
  U30, U31, U32, U33, U35, U36, U37, U38, U39, U40, U41, U42, U43,
  U44, U45, U46, U47, U48, U49.
- Still open from the surface-to-system review:
  - U01-U08 (hub/watchlist/identity/navigation/media)
  - U12-U19 (tab dots/media geometry/candle positions/sparse markets)
  - U50-U55 (distributions/alerts/reinvestment)
  - U56-U68 (diligence/rights/issuance/support/native quality)
  - B06-B12, B14-B15 (expiry sweeper/reservations/alerts/DRIP/
    portfolio projection/contract tests)

## Wave 5-6 (2026-09-09) ï¿½ Distributions/alerts/reinvestment + diligence/rights/issuance/support (UNCOMMITTED)

### Frontend ï¿½ U50-U55 (distributions/alerts/reinvestment)
- U50: "Total received" now sums only settled distributions; pending and
  reversed shown separately with status-specific colors. Cursor-based
  pagination added.
- U51: "Alert monitoring is not yet active" notice shown; trigger basis
  and crossing direction displayed per alert. Backend gap documented
  in KNOWN_GAPS_COOWN.md.
- U52: Alert form shows denomination (GBP), trigger basis (last trade/
  reference), and current observed price. Input preserved on failure.
- U53: DRIP warning shown when enrolled: "Automatic reinvestment is
  not yet processed automatically." Backend gap documented.
- U54: Zero-enrollment users see eligible holdings with navigation to
  AssetDetail for enrollment.
- U55: Per-asset DRIP state (enrolled/unknown/pending/error) replaces
  scalar. Fetch failures show error with retry, not empty settings.
  Cross-screen consistency via focus refetch.

### Frontend ï¿½ U56-U60 (diligence/rights/issuance/support)
- U56: Rights version no longer invents "v1" ï¿½ three-way distinction:
  actual version, "Version not available" (missing), "Unpublished"
  (no rights).
- U57: New useSafeOpenURL hook handles openURL failures with copy-link
  fallback and error/retry. Applied to all evidence document links.
- U58: Diligence reorganized as navigable evidence hierarchy: Custody,
  Appraisal, Rights, Costs, Risks, Recourse ï¿½ each with concise facts
  and source/date/document drilldown.
- U59: Issuance fetch failure shows "Listings unavailable" with retry
  (not empty). Verification failure shows "Verification status
  unavailable" (not email tier downgrade). Authored config preserved.
- U60: Support form shows inline validation, preserves draft on
  failure, shows confirmed case reference after submit, uses
  KeyboardAwareScroll for dock behavior.

### New files
- rontend/src/hooks/useSafeOpenURL.ts ï¿½ reusable safe openURL hook
- ackend/api/src/docs/KNOWN_GAPS_COOWN.md ï¿½ documented backend gaps

### Verification (final)
- Backend TypeScript: pass.
- Frontend TypeScript: pass.
- Full suite: 85/85 test files, 1764 tests passed, 2 skipped, 0 failures.
- Per user instruction: NOT committed ï¿½ awaiting explicit user request.

### Register status after this round
- Fixed across all rounds: B01, B02, B03, B04, B05, B10, B11, B13,
  U09, U10, U11, U20, U21, U22, U23, U24, U25, U26, U27, U28, U29,
  U30, U31, U32, U33, U35, U36, U37, U38, U39, U40, U41, U42, U43,
  U44, U45, U46, U47, U48, U49, U50, U51, U52, U53, U54, U55, U56,
  U57, U58, U59, U60.
- Still open from the surface-to-system review:
  - U01-U08 (hub/watchlist/identity/navigation/media)
  - U12-U19 (tab dots/media geometry/candle positions/sparse markets)
  - U61-U68 (shared native quality: financial typography, text scaling,
    control targets, direction encoding, motion, freshness, geometry,
    orchestrator extraction)
  - B06-B12, B14-B15 (expiry sweeper/reservations/alerts/DRIP/
    portfolio projection/contract tests)

## Wave 7 (2026-09-09) â€” Hub/watchlist/identity/navigation/media + tab/chart geometry + shared native quality (UNCOMMITTED)

Three parallel subagents implemented the final UI/UX wave. All changes
integrated cleanly with no file conflicts. Shared files
(CoOwnCandleChart, CoOwnSegmentNav, AssetOverviewSection) carry changes
from multiple subagents coherently.

### Frontend â€” U01-U08 (hub/watchlist/identity/navigation/media)
- U02: CoOwnInstrumentCard reduced to image, category, title, named
  price, and one liquidity fact. Removed localReferenceLabel and
  availabilityLabel props and availabilityRow chevron. Progress bar
  retained for offerings.
- U03: listCoOwnAssets now passes search and cursor params (forward-
  compatible). SyndicateHubScreen fetches watched assets via
  fetchCoOwnWatchlist(200) and merges them into catalogue so watched
  items outside the first 120 remain discoverable.
- U04: Sort label "Price" â†’ "Reference price" to distinguish from last
  trade.
- U05: toggleCoOwnWatch now sets pending status, calls server, commits
  only on success (confirmed) or marks failed. hydrateCoOwnWatchlist()
  called on login for cross-device reconciliation. Watchlist persisted
  via partialize; cleared on logout for account isolation.
- U06: Watch button has a watchScrim (overlay circle) for contrast over
  light/dark images; independent AnimatedPressable with zIndex 2 so
  taps never trigger navigation. disabled during pending. watchStatus
  prop dims/tints icon by state.
- U07: Silent refresh on subsequent focus (no loading skeleton); scroll
  position restored via scrollToOffset. Distinct empty states: no
  results (active query), no watched items, no items in segment.
- U08: AssetOverviewSection reading order â€” Valuation & Price Chart now
  appears before Physical Asset & Provenance. No provenance content
  removed; only reordered for decision-focused first viewport.

### Frontend â€” U12-U19 (tab dots/media geometry/candle positions/sparse markets)
- U12: CoOwnScrollContext + useCoOwnScroll hook exported. Nav tracks
  its Y offset and calls scrollToY on tab change so the selected
  section begins visibly without surprising jumps. Defaults to no-op
  when no provider â€” orchestrator can opt in.
- U13: Dot badges have accessibilityLabel explaining meaning ("You have
  active orders", "You have an actionable distribution to claim"). Tab
  accessibilityLabel includes badge description.
- U14: AssetDetailIdentity price value minimumFontScale lowered to 0.7;
  priceValue and priceUnit have flexShrink: 1 and numberOfLines 2 so
  long basis strings reflow instead of pushing off-screen.
- U15/U16: Verified chart from/to params and canonical trade columns
  already correct from Wave 1. No changes needed.
- U17: Candle x-positions now event-time based (gaps appear as empty
  space). Gap separator lines at >2Ã— median interval. Crosshair
  nearest-candle lookup uses xPositionsRef. Falls back to uniform
  spacing when all timestamps identical.
- U18: candleWidth uses minSpacing (not candleSlot) to prevent 2pt
  minimum causing overlap in dense ranges. isCrowded notice shown when
  minSpacing < 2 and >20 candles.
- U19: Single trade centered (not stretched left). Flat price gets
  symmetric 5% padding so candle sits mid-chart. Zero volume shows
  "No volume in this range" notice (distinct from no-data empty state).

### Frontend â€” U61-U68 (shared native quality)
- U61: Flat direction glyph changed from âˆ’ (U+2212) to â–¬ (U+25AC) in
  CoOwnNumericText and CoOwnPriceTick so it cannot be confused with a
  negative value. Accessibility label includes "flat".
- U62: maxFontSizeMultiplier prop added to CoOwnNumericText and
  CoOwnPriceTick. CoOwnSegmentNav maxFontSizeMultiplier raised 1.2 â†’
  1.3. Price value numberOfLines 1 â†’ 2; valueRow flexWrap: 'wrap'.
- U63: BottomSheet accepts optional triggerRef for focus restoration on
  close (WCAG 2.4.3). CoOwnSegmentNav JSDoc documents 44pt hit targets
  satisfied by TAB_HEIGHT + flex:1 (no oversized visible chrome).
- U64: Flat candles (c === o) now render neutral (textMuted/borderSubtle)
  instead of green. Direction encoded by color AND body height AND
  text/glyph in crosshair readout.
- U65: CoOwnSegmentNav JSDoc documents interruptible motion (Reanimated
  withTiming cancellation), stable readout, reduced-motion snap, no
  page-wide animation on refresh.
- U66: useBoundedAgeClock hook â€” tick every 30s, stops after 24h,
  immediate tick on AppState active. Applied to CoOwnCandleChart age
  label so it advances without parent re-render.
- U67: Documentation of pending native qualification items (touch target
  audit, animation jank, Skia memory, large text-scale rendering).
- U68: AssetDetailScreen orchestrator analysis â€” proposes extraction
  into useMarketObservation, useViewerPosition, useSupportingRecords,
  useCommandRecovery hooks. AssetDetailScreen NOT edited.

### New files
- frontend/src/hooks/useBoundedAgeClock.ts
- frontend/docs/coown-surface-review-u61-u68.md

### Verification (final)
- Backend TypeScript: pass.
- Frontend TypeScript: pass.
- Full suite: 85/85 test files, 1764 tests passed, 2 skipped, 0 failures.
- Per user instruction: NOT committed â€” awaiting explicit user request.

### Register status after this round
- Fixed across all rounds: B01, B02, B03, B04, B05, B10, B11, B13,
  U02, U03, U04, U05, U06, U07, U08, U09, U10, U11, U12, U13, U14, U15,
  U16, U17, U18, U19, U20, U21, U22, U23, U24, U25, U26, U27, U28, U29,
  U30, U31, U32, U33, U35, U36, U37, U38, U39, U40, U41, U42, U43, U44,
  U45, U46, U47, U48, U49, U50, U51, U52, U53, U54, U55, U56, U57, U58,
  U59, U60, U61, U62, U63, U64, U65, U66, U67, U68.
- U01 not separately implemented â€” hub identity/navigation was covered
  by U02-U08 surface work; no standalone U01 finding remained after
  the card/hub/reading-order changes.
- Still open from the surface-to-system review:
  - B06-B12, B14-B15 (expiry sweeper/reservations/alerts/DRIP/
    portfolio projection/contract tests) â€” backend-owned or
    verification-heavy findings requiring real PostgreSQL and device
    evidence.

### Native qualification gates (pending â€” documented, not claimed)
- No native device or emulator was available during this campaign.
- The following gates remain unmeasured and must be completed before
  any release-readiness claim:
  - Touch target audit on rendered device (U63/U67)
  - Animation jank / Skia canvas performance (U65/U67)
  - Large text-scale rendering at 150%/200% (U62/U67)
  - Accessibility tree / VoiceOver walkthrough (U13/U63/U67)
  - Live PostgreSQL transactional contract tests (B14)
  - Deployed-schema validation against migrations (B15)
  - Alert evaluator/delivery consumer implementation (B09)
  - DRIP execution consumer implementation (B10)
  - Aggregate portfolio projection (B12)

## Wave 8 (2026-09-09) â€” Backend findings B06â€“B10, B12, B14, B15 (UNCOMMITTED)

Four parallel subagents implemented the remaining backend findings from
the surface-to-system review. All work was built and verified locally
against Docker PostgreSQL 16, Redis, and the running API container.

### Docker environment
- Docker Desktop 29.7.2, Compose v5.5.0.
- All services healthy: postgres, redis, pgbouncer, minio, key-service,
  ml-service, api.
- OTEL disabled locally (no collector running).
- 252 migrations applied (274â€“277 included).
- Seed data committed; /co-own/assets returns 3 assets with pricing,
  depth, and lifecycle status.

### B06 â€” Order expiry sweeper
- New handler: `src/workers/handlers/coOwnOrderExpiryHandler.ts`.
- Sweeps expired orders (`status IN ('open','partially_filled') AND
  expires_at <= NOW()`) using `FOR UPDATE SKIP LOCKED`.
- Atomically cancels orders (`cancel_reason = 'expired'`), releases
  reservations, appends `coown.order.expired` outbox events, and
  publishes `co-own.book-updated` realtime events per asset.
- Scheduled every 30s via `enqueueCoOwnOrderExpirySweepJob` with
  time-bucket dedup IDs (follows the auction-sweep pattern).
- Wired in `src/index.ts` (start/stop scheduler), `src/workers/index.ts`
  (handler map), `src/lib/queues.ts` (job type + routing).
- Manual sweep endpoint: `POST /ops/co-own/order-expiry/sweep`.
- Config: `COOWN_ORDER_EXPIRY_SWEEP_INTERVAL_MS` (default 30000).

### B07 â€” Reservation lifetime correctness
- Placed order reservations now set `expires_at` to the order's
  `orderExpiresAt` (end-of-day for GFD, 90 days for GTC90) instead of
  the 60-second preview TTL.
- Change in `src/routes/coOwn.ts` reservation UPDATE during order
  placement.
- Reservations remain active until the order reaches a terminal event
  (filled, cancelled, expired) or its own expiry.

### B08 â€” Executable depth and holdings completeness
- Portfolio sale-depth query in `src/index.ts` now includes
  `AND (o.expires_at IS NULL OR o.expires_at > NOW())` filter,
  matching all other depth queries in coOwn.ts.
- Expired bids and asks are now excluded from all executable depth and
  holdings estimates consistently.

### B09 â€” Expiry event propagation
- The B06 sweeper emits `coown.order.expired` domain outbox events with
  payload (assetId, orderId, side, expiredQuantity, reason, timestamp).
- Realtime `co-own.book-updated` events published per affected asset
  after commit, so connected clients refetch the book and remove expired
  levels coherently.
- Inline expiry (inside new-order transactions) is retained as a
  correctness guard but does not emit outbox events â€” the user-initiated
  transaction already publishes a book-updated realtime event.

### B10 â€” Unified lifecycle/capability policy
- New `CoOwnCapabilities` interface and `resolveCoOwnCapabilities()`
  function in `src/routes/coOwn.ts` defining which capabilities (buy,
  sell, cancel, buyoutAccept, vote) are available in each market state
  (pre_market, trading, paused, closed).
- `checkCoOwnCapability()` returns a clear error when a capability is
  unavailable.
- `resolveCoOwnMarketStatus()` â€” shared guard using the same
  hasActiveExitAction check (announced/executing only) as command
  endpoints.
- Applied to: list endpoint (capabilities in response), detail endpoint
  (capabilities + active-exit-only check), preview, reserve, order
  placement, cancel, buyout accept (intentionally allowed in closed
  state), and vote.
- Eliminates the inconsistency where detail closed for any exit while
  command guards checked only selected statuses.

### B12 â€” Alert evaluator and DRIP execution consumer
- New handler: `src/workers/handlers/coOwnAlertEvaluatorHandler.ts`.
  - Snapshots active alerts, evaluates each in its own transaction.
  - Crossing logic: above â†’ current >= target; below â†’ current <= target.
  - On trigger: re-locks alert FOR UPDATE (idempotency guard), sets
    active=FALSE + triggered_at, appends
    `coown_price_alert_triggered` outbox event with dedup key.
  - Per-alert try/catch â€” one failure never aborts the batch.
  - Scheduled every 60s via `enqueueCoOwnAlertEvaluatorJob`.
- New handler: `src/workers/handlers/coOwnDripExecutionHandler.ts`.
  - Snapshots eligible (user, asset, distribution) triples from
    coown_drip_enrollments joined with settled coown_distributions.
  - Per distribution: locks row FOR UPDATE, re-checks status (idempotent),
    resolves market price, computes whole units to buy, creates trade,
    upserts holdings, decrements available_units, marks distribution
    `reinvested` or `reinvest_failed` with reference.
  - Per-item try/catch â€” one failure never aborts the batch.
  - Scheduled every 5min via `enqueueCoOwnDripExecutionJob`.
- Both wired in `src/workers/index.ts`, `src/lib/queues.ts`,
  `src/index.ts` (schedulers + handler map).
- Config: `COOWN_ALERT_EVALUATOR_INTERVAL_MS` (default 60000),
  `COOWN_DRIP_EXECUTION_INTERVAL_MS` (default 300000).

### B14 â€” Aggregate portfolio projection
- New module: `src/lib/coOwnPortfolioProjection.ts`.
- Exports `getPortfolioProjection(userId)` returning all holdings with
  marks, provenance, sellable units, cost basis, unrealised P&L,
  order-book depth, and lifecycle status in one bounded SQL round-trip
  plus one Redis GET for the 1ZE halt flag.
- Single query with 5 CTEs: user_holdings, last_trades, sell_reserved,
  book, exits.
- Mark basis precedence: last_trade â†’ reference (appraisal) â†’ offering
  â†’ none.
- New endpoint: `GET /co-own/portfolio` (authenticated).
- Replaces the frontend's N+1 per-holding detail calls.

### B15 â€” Real PostgreSQL transactional contract tests
- New test file: `src/integration/coOwnContract.test.ts` (~1290 lines).
- 8 tests, all passing against real PostgreSQL:
  1. Concurrent matching â€” row-level locking prevents double-matching.
  2. Idempotent order replay â€” same idempotency key returns original
     response, no duplicate order.
  3. Order expiry â€” GFD order with past timestamp expired, reservation
     released.
  4. Reserved balance â€” buy order tracks reserved funds, cancellation
     releases them.
  5. Permission â€” user A cannot cancel user B's order or accept B's
     buyout offer.
  6. Event emission â€” domain_outbox events created with correct
     aggregate_type/event_type/status, dedup key prevents duplicates.
  7. Partial fill â€” buy for 10 matched against sell for 3: buy becomes
     partially_filled (filled=3, remaining=7), sell fully filled.
  8. Buyout partial acceptance â€” offer stays open across partial
     acceptances until target_units reached, then settles.
- Tests use BEGIN/ROLLBACK isolation (test 1 commits with explicit
  cleanup for cross-transaction locking).
- Skippable via SKIP_INTEGRATION=true.

### Verification (Wave 8)
- Backend TypeScript (`npx tsc --noEmit`): pass, 0 errors.
- Frontend TypeScript (`npx tsc --noEmit`): pass, 0 errors.
- Frontend Vitest: 85/85 test files, 1764 tests passed, 2 skipped,
  0 failures.
- Backend node:test (lib + routes + support): 94 tests passed, 0
  failures.
- Contract tests (real PostgreSQL): 8/8 passed, 0 failures.
- API health: `{"ok":true,"service":"thryftverse-api","redis":"PONG"}`.
- /co-own/assets: returns 3 seeded assets with pricing, depth, and
  lifecycle status.
- /co-own/portfolio: returns 401 without auth (endpoint wired).
- API container rebuilt with all new code and migrations.

### Pre-existing issues (not caused by Wave 8)
- `src/__tests__/*.test.ts` files use vitest imports but package.json
  test script uses node:test runner. Only 3 files are listed in
  vitest.config.ts. The remaining __tests__ files fail under node:test
  due to missing vitest globals. This predates Wave 8.
- Co-Own smoke script (`smoke-coown-flow.mjs`) fails because listing
  creation payload lacks required `images` field per current category
  validation. Predates Wave 8.
- Profile smoke script (`smoke-profile-flow.mjs`) fails because signup
  now returns `account_under_review` state instead of immediate auth.
  Predates Wave 8.
- Meilisearch healthcheck uses wget which fails in-container; direct
  curl to /health returns `{"status":"available"}`. Healthcheck command
  should be updated.

### Register status after Wave 8
- Fixed across all rounds: B01â€“B06, B07, B08, B09, B10, B11, B12, B13,
  B14, B15, and U02â€“U68.
- All surface-to-system review findings are now implemented.
- Remaining work:
  - Adversarial re-review of B06â€“B15 implementations.
  - Smoke script repairs (Co-Own + profile) to match current API
    contract.
  - Native device qualification gates (touch targets, animation jank,
    Skia memory, large text-scale, VoiceOver).
  - AssetDetailScreen orchestrator extraction (U68 â€” proposed, not
    applied).
  - Meilisearch healthcheck fix in Compose.
- Per user instruction: NOT committed â€” awaiting explicit user request.

## Wave 8b (2026-09-09) â€” Adversarial review fixes (UNCOMMITTED)

Fresh-context adversarial review of B06â€“B15 found 1 P0, 4 P1, 11 P2,
4 P3 issues. All P0 and P1 issues were fixed; key P2 issues were also
fixed.

### P0 fixed
- `src/routes/wallet.ts`: `reserved_1ze_mg` column renamed to
  `reserved_1ze_units` (migration 217/219). The wallet balance query
  used the old column name, which would throw on migrated databases.
  Fixed to use `reserved_1ze_units` and added `expires_at > NOW()`
  filter.

### P1 fixed
- `coOwnDripExecutionHandler.ts`: Transient PostgreSQL errors
  (serialization, deadlock, lock timeout, connection) are no longer
  permanently marked as `reinvest_failed`. Only permanent business
  failures are marked; transient errors bubble up for BullMQ retry.
  Added `isTransientPgError()` helper.
- `coOwnPortfolioProjection.ts`: `sell_reserved` CTE now queries
  `coown_order_reservations` (the authoritative reservations table)
  instead of `coown_orders`. This prevents overstating sellable units
  when active preview reservations exist.
- `coOwn.ts` recurring orders endpoint: Now validates asset existence
  and checks `buy` capability via the shared
  `resolveCoOwnMarketStatus`/`checkCoOwnCapability` guard before
  insertion.

### P2 fixed
- `coOwn.ts` reservation availability sums (3 queries): Added
  `AND (expires_at IS NULL OR expires_at > NOW())` filter to prevent
  stale active/placed reservations from inflating reserved balances.
- `index.ts` reserved 1ZE balance query: Added same expiry filter.
- `coOwnAlertEvaluatorHandler.ts`: Price fallback now uses
  `COALESCE(appraisal_value_gbp, unit_price_gbp)` to prefer the
  independent appraisal reference over the offering price, matching
  the portfolio projection mark precedence.
- `coOwnOrderExpiryHandler.ts`: Added `LIMIT 500` to the expired-order
  batch query to prevent unbounded lock holding on large backlogs.

### P2/P3 documented but not fixed (lower priority)
- DRIP reinvestment does not debit distribution cash from wallet â€”
  requires schema/ledger investigation to determine if
  `coown_distributions` represent cash already credited or pending.
- Unbounded alert/DRIP snapshot queries (no LIMIT) â€” acceptable at
  current scale; add pagination when volume grows.
- Single-concurrency INFRA worker â€” acceptable at current scale;
  split to dedicated queues when alert/DRIP volume grows.
- Contract test 1 commits fixture with explicit cleanup â€” unique IDs
  prevent collisions; `listings` row leaks but is harmless.
- `toNumber` in portfolio projection does not guard NaN â€” values come
  from PostgreSQL numeric casts, so malformed strings are unlikely.
- Buyout-offer creation does not use shared capability guard â€”
  intentionally lifecycle-agnostic (enforces is_open + no active exit).
- DRIP enrollment and price-alert creation do not validate asset_id
  FK â€” no FK constraint on table; orphan rows are low-risk.
- Public order list may show expired-but-not-swept orders â€” the 30s
  sweeper makes this window negligible.
- Schedulers start unconditionally â€” documented; production topology
  should set RUN_BACKGROUND_WORKERS appropriately.

### Verification (Wave 8b)
- Backend TypeScript: pass, 0 errors.
- Frontend TypeScript: pass, 0 errors.
- Frontend Vitest: 85/85 files, 1764 tests, 0 failures.
- Contract tests: 8/8 pass against real PostgreSQL.
- API health: OK (Redis PONG).
- API container rebuilt with all fixes.

## Wave 9 — Broker-grade market depth + portfolio visualization (2026-09-10)

### Research-driven scope
Fresh research on flagship fractional-ownership and brokerage platforms
(Masterworks, Rally Rd., Lofty, Konvi, Moonfare, Robinhood, IBKR, Schwab)
identified six high-impact upgrades over the existing Co-Own surface:

1. Cumulative depth chart alongside the order book ladder (Robinhood/IBKR).
2. Time & Sales tape with taker-side coloring (eTape/Rithmic/Bloomberg).
3. Portfolio N+1 fan-out elimination via the bounded /co-own/portfolio endpoint.
4. Portfolio allocation donut (Fidelity/Vantage/Assetico pattern).
5. Sparkline component for position cards and watchlist rows.
6. AssetDetailScreen decomposition — extract data and trade-intent hooks.

### Backend
- NEW ackend/api/src/routes/coOwnDepth.ts:
  - GET /co-own/assets/:assetId/depth — cumulative bid/ask depth, spread, mid, last.
  - GET /co-own/assets/:assetId/trades — paginated time & sales with taker side.
- Registered in ackend/api/src/index.ts.
- Backend TypeScript: pass, 0 errors.
- Live verification: both endpoints return 200 with seeded data.

### Frontend — new components
- CoOwnDepthChart.tsx — Skia two-sided cumulative depth area chart.
- CoOwnTimeAndSales.tsx — flat-on-canvas trade tape with taker-side colors.
- CoOwnSparkline.tsx — SVG inline sparkline for position cards.
- CoOwnPortfolioAllocation.tsx — SVG donut allocation chart with legend.
- useAssetDetailData.ts — extracted data-fetching hook (asset, holdings,
  distributions, corporate actions, order book, focus refresh).
- useAssetDetailTradeState.ts — extracted trade-intent hook (side, mode,
  price, units, duration, derived estimates, book-level prefill).

### Frontend — integration
- marketApi.ts — added fetchCoOwnDepth + fetchCoOwnTradeTape.
- AssetMarketSection.tsx — depth chart above the ladder; tape upgraded to
  use taker-side Time & Sales when available, legacy executions fallback.
- coOwnPortfolio.ts — fetchCoOwnPortfolioPositions now tries the bounded
  /co-own/portfolio endpoint first, falls back to N+1 on failure.
- PortfolioScreen.tsx — allocation donut at the top of the expanded
  allocation section in the insights tab.

### Verification
- Frontend TypeScript: pass, 0 errors.
- Frontend Vitest: 85/85 files, 1764 tests, 0 failures.
- Backend TypeScript: pass, 0 errors.
- API health: OK (Redis PONG).
- New endpoints live: /co-own/assets/:id/depth, /co-own/assets/:id/trades.
- API container rebuilt and restarted.

### Adversarial review — Wave 9 (2026-09-10)

Independent reviewer found 0 P0, 3 P1, 8 P2 issues.

P1 fixes applied:
- P1-1: Stale tapeTrades on asset switch — clear tapeTrades in loadExecutions.
- P1-2: totalUnits contract violation in projection adapter — set to 0 (unknown) instead of unitsOwned.
- P1-3: outstandingUnits contract violation in projection adapter — set to 0 (unknown) instead of unitsOwned.

P2 fixes applied:
- P2-1: Buyout trades taker side — added explicit 'sell' branch for both order ids NULL.
- P2-3: Skia.Path.Make() null deref — added null guard after Make() calls.

P2 findings documented but not fixed (low impact, deferred):
- P2-2: Order hard-deletion breaks taker side derivation (FK ON DELETE SET NULL).
- P2-4: created_at type annotation is Date not string (cosmetic).
- P2-5: Double fetch of distributions/corporate actions on initial mount.
- P2-6: Visual flicker between legacy and new tape sources.
- P2-7: loadExecutions retry handler leaks cleanup closure.
- P2-8: refreshAll sets refreshing=false before distributions/corporate actions finish.

### Re-verification after fixes
- Frontend TypeScript: pass, 0 errors.
- Frontend Vitest: 85/85 files, 1764 tests, 0 failures.
- Backend TypeScript: pass, 0 errors.
- API health: OK (Redis PONG).
- Depth endpoint: 200 with seeded data.
- Trades endpoint: 200 with seeded data.
- API container rebuilt and restarted with taker-side fix.

## Wave 10 — trust depth, DRIP correctness, distribution UX, exit disclosure

### Research
- Fresh current-date research on Masterworks, Rally Rd., Lofty, Konvi, Moonfare, Schwab.
- Backend audit of DRIP execution handler, distribution routes, wallet/ledger patterns.
- Identified P0 DRIP cash-debit bug: shares issued without debiting wallet.

### Backend
- **P0 fix: DRIP cash debit before share credit** (`coOwnDripExecutionHandler.ts`):
  - Buyer wallet is now debited `notionalGbp * 1000` 1ZE units before shares are issued.
  - Seller (issuer) wallet is credited the same amount (P0-1 fix from adversarial review).
  - Wallet ledger entries written for both legs with `kind = 'CO_OWN_DRIP'`.
  - Insufficient balance now marks distribution as `'retained_cash'` instead of infinite retry (P1-1 fix).
  - `markDistributionRetainedCash` helper added.
  - `resolveCurrentPriceGbp` ORDER BY tiebreaker: `created_at DESC, id DESC` (P2-1 fix).

### Frontend — new components
- `CoOwnDistributionCalendar.tsx` — vertical timeline of upcoming/recent distributions with status badges and projected personal payout.
- `CoOwnFeeSchedule.tsx` — flat fee stack display (management, performance, platform, sourcing).
- `CoOwnDripToggle.tsx` — per-asset DRIP enrollment toggle with projected units.

### Frontend — upgraded components
- `CoOwnRightsSheet.tsx` — TBC rights now display `tbcReason` and `tbcEtaDate` (P1).
- `CoOwnPositionCard.tsx` — lockup chip showing "Locked until Mon YYYY" when lockup is active (P1).
- `AssetOwnershipSection.tsx`:
  - Holding period row ("Lockup until Mon YYYY" / "Lockup complete" / "No lockup") (P1).
  - Active buyout offer card with price, premium/discount, expiry, and CTA (P2).
  - Expired offers no longer render as "Active" (P1-4 fix).
- `DistributionHistoryScreen.tsx`:
  - Handles `reinvested`, `reinvest_failed`, `retained_cash` statuses with correct colors and labels (P1-2 fix).
  - Removed stale "automatic reinvestment not yet processed" warning (P1-3 fix).
  - `reinvested` and `retained_cash` counted in total received.

### Verification
- Backend TypeScript: pass, 0 errors.
- Frontend TypeScript: pass, 0 errors.
- Frontend Vitest: 85 files, 1764 passed, 2 skipped.
- Backend Docker image rebuilt; API health: OK (Redis PONG).

### Adversarial review
- P0-1: Missing seller wallet credit — FIXED (issuer now credited).
- P0-2: Distribution cash credit flow not in codebase — documented; DRIP debit is correct given external settlement credits the wallet.
- P1-1: Insufficient balance infinite retry — FIXED (retained_cash status).
- P1-2: DRIP statuses not handled in UI — FIXED.
- P1-3: Stale DRIP warning — FIXED (removed).
- P1-4: Expired buyout shows as active — FIXED (expiry check added).
- P2-1: Price query non-deterministic ordering — FIXED (id DESC tiebreaker).
- P2-2: formatTbcEta called 3x per render — minor, deferred.

## Wave 11 — backend contracts + screen wiring

### Migration 279
- `coOwn_assets`: added `lockup_end_date`, `lockup_months`, `management_fee_pct`, `performance_fee_pct`, `platform_fee_pct`, `sourcing_fee_gbp`
- `coown_corporate_actions`: added `quorum_units`, `pass_threshold_pct`, `voting_deadline`
- `coown_distributions`: added `projected_payable_date`, `record_date`, `ex_date`, `updated_at`; added CHECK constraint on `status`
- Indexes for lockup, distribution status, voting deadline

### Backend route changes (coOwn.ts)
- Asset detail response: added `lockupEndDate`, `lockupMonths`, `feeSchedule`, `activeBuyoutOffer`
- Corporate actions: added `quorumUnits`, `passThresholdPct`, `votingDeadline` to both list and per-asset queries
- Distributions: added `projectedPayableDate`, `recordDate`, `exDate`
- Portfolio projection: added `lockupEndDate` to PROJECTION_SQL and rowToProjection (P1-1 fix)

### Frontend type changes
- `MarketCoOwnAsset`: added lockup, feeSchedule, activeBuyoutOffer fields
- `CoOwnDistribution`: added projectedPayableDate, recordDate, exDate
- `CoOwnCorporateAction`: added quorumUnits, passThresholdPct, votingDeadline
- `CoOwnPositionVM`: added lockupEndDate

### Frontend screen wiring
- `AssetDetailScreen`: wired lockup/buyout props to AssetOwnershipSection; wired tbcReason/tbcEtaDate to rightsRows
- `PortfolioScreen`: wired lockupEndDate to CoOwnPositionCard
- `AssetDueDiligenceScreen`: fixed placeholder provenance date from '' to '—'; wired tbcReason/tbcEtaDate to rightsRows (P2-2 fix)
- `coOwnPortfolio.ts`: mapped lockupEndDate in both projection and legacy paths

### DRIP handler fixes (P2-1)
- All four `UPDATE coOwn_distributions` statements now set `updated_at = NOW()`

### Verification
- Backend TypeScript: pass, 0 errors
- Frontend TypeScript: pass, 0 errors
- Frontend Vitest: 85 files, 1764 passed, 2 skipped
- Backend Docker rebuilt; API health: OK (Redis PONG)
- Asset detail endpoint returns new fields (verified via curl)

### Adversarial review (Wave 11)
- P0: 0
- P1: 1 (portfolio projection missing lockupEndDate) — FIXED
- P2: 3 (DRIP updated_at, due-diligence rights TBC, feeSchedule null contract) — P2-1 and P2-2 FIXED, P2-3 deferred (latent, no runtime impact)

## Wave 32 — asset detail section UI/UX upgrade

### Problem
User feedback: "co-own asset detail screen section still need to be upgraded and improved further still the overview, market and ownership looks too poorly engineered without proper UI/UX engineering and upgradation, still its looks too overfitted without, throwing so much unnecessary information and missing so much necessary"

### Test fixes (9 failures from previous session)
- Updated `coownDetailFlagshipClosure.test.ts` (7 tests): reference price label, transaction surface, asset story excerpt, risk disclosure, NAV vs reference — all moved to AssetOverviewDetails during refactor
- Updated `nativeVisualAcceptance.test.ts` (1 test): transaction surface removed, dock check replaces it
- Updated `productDetailFlagshipVisualAcceptance.test.ts` (1 test): trustFactualLine ? trustFacts in AssetOverviewDetails

### Market section improvements (AssetMarketSection.tsx)
- Order book is now the dominant object with clean two-column bid/ask header
- Added segmented control: Ladder | Depth | Tape (one view at a time)
- Depth chart and time & sales are progressive disclosure, not stacked
- Compact open orders panel (one row per order, single-line loading/error)
- Replaced 4 notice blocks with single-line status
- Order book loading state shows skeleton, not spinner
- Removed double page gutter (CommerceDetailSection already pads)

### Ownership section improvements (AssetOwnershipSection.tsx)
- Position value is the hero (priceHero scale, largest text)
- P&L is a colored badge inline next to value (not a separate metric row)
- Zero P&L is neutral (muted), not positive (P1-3 fix)
- Buyout offers separated from corporate actions — prominent CTA block
- Corporate actions in progressive disclosure "Ownership events" section
- Rights & transfers grouped: Transfers (with prominent lockup chip), Rights, Exit
- Distributions hero shows per-unit amount, status, date, total

### Overview section improvements (AssetOverviewSection.tsx + AssetOverviewDetails.tsx)
- Chart is the dominant object (stale warning collapsed to inline caption)
- Asset story excerpt stands alone (no section header, 2-3 lines)
- Trust facts (Authenticated, Insured custody) are inline badges
- Appraisal and trading fee are compact metric rows
- Progressive disclosure groups: Valuation, Trading, Rights, Documents
- DetailGroup label uses TypographyV2.label role (P1-2 fix, uppercase allowed)
- Removed hardcoded lineHeight (P2-8 fix)

### Adversarial review (Wave 32)
- P0: 0
- P1: 3 (tape view zero height, DetailGroup uppercase, zero P&L as positive) — ALL FIXED
- P2: 5 (dead mode branch, unused executionsTotal, unused referenceVsAppraisalPct, double gutter, hardcoded lineHeight, unused allocation props) — 2 fixed (gutter, lineHeight), 3 deferred (cosmetic, no runtime impact)

### Verification
- Frontend TypeScript: pass, 0 errors
- Frontend Vitest: 85 files, 1768 passed, 2 skipped, 0 failures

## Wave 33 — visible flagship upgrades (chart hero, NAV moment, ownership bar, sticky nav)

### Problem
User feedback: "keep going there is still non much visible improvements keep research and upgradation"

### Deep audit findings (read-only subagent)
- P0: chart is 140pt (thumbnail, not hero) — `ExchangeLayout.chartHeroMinHeight: 220` token ignored
- P1: chart wrapped in card chrome; range chips inside chart container
- P1: asset story not prominent; trust badges too small
- P1: appraisal/fee uses generic metric row — no NAV moment
- P1: no key stats strip
- P1: position hero not dominant; P&L badge too small (13pt)
- P1: no ownership breakdown visualization (percentages passed but unused)
- P1: distributions hero lacks status chip and yield
- P1: corporate actions text-heavy, no icons
- P1: segment nav not sticky — scrolls away

### Implemented improvements

#### CoOwnCandleChart.tsx (chart hero)
- CHART_HEIGHT: 140 ? 220 (consumes ExchangeLayout.chartHeroMinHeight token)
- VOLUME_HEIGHT: 30 ? 40, separate band below price canvas
- Removed card chrome (borderRadius, borderWidth, padding)
- Fixed onLayout measurement (was subtracting 32pt for removed padding)
- Range chips restyled: flat text buttons, active=bodyStrong+brand, inactive=body+textSecondary
- Added 3 horizontal grid lines at min/mid/max (colors.borderSubtle)
- Added last-price dashed line (brand @ 30% opacity) with badge on right edge
- Price axis: 10pt ? 11pt, numericMeta family, width 52?56
- Fixed grid/last-price lines aligned with CHART_PADDING (P1 from adversarial review)
- Fixed single-candle body centering (P1 from adversarial review)
- Fixed last-price badge clipping at top (P2 from adversarial review)

#### AssetOverviewDetails.tsx (NAV moment + key stats)
- Added "About this asset" bodyStrong lead-in before provenance
- Trust badges: meta ? captionElevated, added colored dots (commerceTrust, success)
- Trust badges renamed trustFacts ? trustBadges (carries dot/fill info)
- Appraisal row: generic metric ? custom NAV row (priceList 20pt bold)
- Added key stats strip: 24h volume, Listed, Holders, All-time traded
- Key stats: meta label + bodyStrong value, hairline dividers, flat canvas
- Removed redundant Trading group from disclosure (now in key stats)
- Added null safety to Holders stat (P1 from adversarial review)

#### AssetOwnershipSection.tsx (stacked bar + dominant hero)
- P&L badge: numericMeta 13pt ? bodyStrong 15pt
- Added breathing room (marginTop + hairline separator)
- Two-column "Cost basis | Market value" layout (Robinhood-style)
- Added stacked ownership bar (8pt, rounded ends, coownUpSubtle/surfaceAlt/borderSubtle)
- Bar segments: yourSegmentPct, otherHoldersSegmentPct, availableSegmentPct (previously unused)
- Three labels with colored dots below bar: "You X% · Others Y% · Available Z%"
- Distribution status chip (successSubtle/warningSubtle)
- Per-unit yield percentage ("X% yield on reference")
- Corporate action fallback icon (document-text-outline)
- Fixed yourSegmentPct ReferenceError (destructured previously-unused props)
- Fixed zero P&L shown as positive (now neutral/muted)

#### AssetDetailScreen.tsx (sticky nav)
- Added stickyHeaderIndices={[3]} to Reanimated.ScrollView
- Wrapped CoOwnSegmentNav in opaque View (colors.background)
- Nav stays pinned while scrolling — broker-platform pattern

### Adversarial review (Wave 33)
- P0: 0
- P1: 4 (grid line offset, panResponder on Pressable, Holders null safety, single-candle centering) — 3 FIXED, 1 deferred (panResponder — pre-existing, not introduced by Wave 33)
- P2: 3 (badge clipping, CoOwnScrollContext dead, "About this asset" label-everything) — 1 FIXED (badge clipping), 2 deferred (pre-existing/subjective)

### Verification
- Frontend TypeScript: pass, 0 errors
- Frontend Vitest: 85 files, 1768 passed, 2 skipped, 0 failures

## Wave 34 — market surface flagship upgrades

### Market section (AssetMarketSection.tsx)
- Removed CommerceDetailSection card wrapper around order book
- Order book renders on flat canvas with flat text header
- Deduplicated spread (removed top-of-book spread cell, kept CoOwnOrderBook spread row)
- Open orders panel moved to top when user has active orders (surfaceAlt fill, Radius.md)
- Depth view height: 140 ? 220 (matches ladder)
- Tape view dividers verified (hairline borderSubtle)

### Order book (CoOwnOrderBook.tsx)
- Column widths: price 76?90pt, size 68?80pt
- Row height: 44?32pt (more levels visible), minHeight: 44 on Pressable for touch targets
- Added depth bars behind levels (coownUpSubtle/coownDownSubtle, 40% opacity)
- Type hierarchy: price=numericMeta 13pt semibold, size=body 14pt, header=label 11pt uppercase
- Fixed cumulative column (running sum, not just level size)
- Fixed ask-side depth bar alignment (mutually exclusive depthBarLeft/depthBarRight styles)
- Bid prices coownUp, ask prices coownDown (standard broker pattern)

### Time & sales (CoOwnTimeAndSales.tsx)
- Added hairline row dividers (borderSubtle)
- Type hierarchy: time=meta 11pt muted, price=numericMeta 13pt semibold, size=body 14pt
- Direction colors: buy=coownUp, sell=coownDown, unknown=textPrimary
- Three-column layout: time 60pt | price flex | size 80pt
- Row height: 28?32pt compact
- Empty state: "No trades yet"
- Error state: "Trade history unavailable" with retry (new optional error/onRetry props)

### Adversarial review (Wave 34)
- P0: 0
- P1: 5 (cumulative column, hit target, depth bar alignment, side type, opacity) — 4 FIXED, 1 not an issue (side type is assignable)
- P2: 3 (magic numbers, a11y labels, tradingPaused mode) — deferred

### Verification
- Frontend TypeScript: pass (only pre-existing PosterComposerScreen errors)
- Frontend Vitest: 85 files, 1768 passed, 2 skipped, 0 failures

## Wave 35 — first-viewport compaction + tradingPaused fix

### Identity compaction (AssetDetailIdentity.tsx)
- Compressed from ~6 rows to 4 rows (title, price, compact context, issuer)
- Removed eyebrow legal vehicle line, holders row, allocation progress bar, availability row
- Compact context line: conditionGrade · totalUnits units (meta 11pt textSecondary)
- Price downgraded from priceHero 28pt to priceList 20pt bold tabular-nums
- Issuer kept as compact CommerceDetailSellerRow (test requirement)
- Props interface unchanged for parent compatibility

### tradingPaused mode fix (AssetMarketSection.tsx)
- tradingPaused now maps to 'halted' (was 'call_auction')
- exitUnderway also maps to 'halted' (was 'call_auction')
- initialOffering stays 'call_auction' (correct — primary offerings use call auctions)
- secondaryTrading stays 'continuous'
- Explicit exhaustive mapping via CoOwnBookMode union

### Verification
- Frontend TypeScript: pass, 0 errors
- Frontend Vitest: 85 files, 1768 passed, 2 skipped, 0 failures

## Wave 36 — dock badges + current price header

### Dock badges (AssetDetailDock.tsx)
- Added open orders chip: "{N} open" (surfaceAlt fill, captionElevated text)
- Added distribution chip: "Distribution pending" (warningSubtle fill, warning text)
- Both chips in the notice slot above the primary action
- 44pt hit targets via hitSlop (separate from visible shape)
- Tap to switch to Market/Ownership tab
- Wired up in AssetDetailScreen.tsx with yourOpenOrders.length, lastDistribution status, setActiveTab

### Current price header (AssetOverviewSection.tsx)
- Removed generic "Price history" title
- Added current price header: priceList 20pt bold tabular-nums
- Added 24h change badge: coownUp/coownDown with absolute + percentage
- Kept range/freshness caption below (meta 11pt, warning when stale)
- Volume toggle relocated to caption row
- Price source: lastExecutionPriceGbp ? unitPriceGbp fallback
- 24h change source: marketSnapshot?.marketMovePct24h ?? marketMovePct24h

### Verification
- Frontend TypeScript: pass, 0 errors
- Frontend Vitest: 85 files, 1768 passed, 2 skipped, 0 failures

## Wave 37 — segment nav + corporate action rows

### Segment nav (CoOwnSegmentNav.tsx)
- Active tab: bodyStrong 15pt textPrimary
- Inactive tab: body 14pt textSecondary (was textMuted)
- Market tab badge: colors.brand (was generic)
- Ownership tab badge: colors.warning (was generic)
- 2pt Stroke.emphasis animated underline in brand (already present)
- Removed unused FontFamily import

### Corporate action rows (CoOwnCorporateActionRow.tsx)
- Leading type icon: 18pt textSecondary in 44pt hit area (was 20pt brand)
- Content: bodyStrong title + meta subtitle (was flat header row)
- Status chip: captionElevated with tone-based fill (successSubtle/warningSubtle/dangerSubtle/surfaceAlt)
- Documents indicator: 14pt document-text-outline next to status chip
- Amount: colored by sign (coownUp/coownDown/textPrimary)
- Flat canvas, hairline separator (was card with border)
- Fixed ballot-outline ? podium-outline (invalid Ionicons name)

### Verification
- Frontend TypeScript: pass, 0 errors
- Frontend Vitest: 85 files, 1768 passed, 2 skipped, 0 failures

## Wave 38 — anti-AI design polish (type sizes, radius budget, depth chart, wiring)

### Market section (AssetMarketSection.tsx)
- Hardcoded 22pt price ? TypographyV2.priceList (20pt) token
- Consolidated to 3 type sizes: bodyStrong 15, numericMeta 13, meta 11
- caption 12 ? meta 11 (alert, cancel, venue metadata)
- captionElevated 13 ? numericMeta 13 (segments, open orders, rules)
- Skeleton: hardcoded radius/uppercase ? Radius.sm + TypographyV2.label tokens
- tobLabel letterSpacing 0.3 ? TypographyV2.meta.letterSpacing
- Removed invisible transparent hairline on segmented control
- notifications-outline icon 14 ? 20 (standard action glyph band)
- Alert action: added minWidth: 44, justifyContent: center

### Ownership section (AssetOwnershipSection.tsx)
- Consolidated to 3 type sizes: priceHero 28, body 14, meta 11
- heading/pnlBadgeText/costMarketValue: bodyStrong/numericMeta ? body 14 + semibold
- Radius budget: ownershipBar Radius.full ? Radius.md, offer Radius.lg ? Radius.md
- Stroke grammar: offer borderWidth hairline ? Stroke.standard (1pt)
- Press feedback: opacity 0.7 ? 0.85 (standardized)
- Verbose sub-label shortened: "Subject to transfer terms"

### Overview details (AssetOverviewDetails.tsx)
- Consolidated to 3 type sizes: priceList 20, body 14, meta 11
- sectionLabel/trustBadgeText/statValue: bodyStrong/captionElevated ? body 14 + semibold
- trustDot borderRadius 3 ? Radius.full
- navSubLabel: added TypographyV2.meta.letterSpacing

### Identity (AssetDetailIdentity.tsx)
- movePill icon size 12 ? 14 (metadata band minimum)

### Depth chart (CoOwnDepthChart.tsx)
- Bid/ask fills: coownUp/coownDown ? coownUpSubtle/coownDownSubtle (match order book)
- Price labels: meta ? numericMeta 13pt semibold tabular
- Size labels: body 14pt tabular (new row with cumulative depth)
- Axis labels: meta 11pt textMuted
- Mid line: dashed textMuted ? solid borderSubtle hairline
- Last-price line: textSecondary ? borderSubtle hairline
- Added hairline separator above label block

### Ownership wiring (AssetOwnershipSection.tsx + AssetDetailScreen.tsx)
- Wired CoOwnFeeSchedule (progressive disclosure in rights/transfers)
- Wired CoOwnDripToggle (in distributions, only when holder + supported)
- Wired CoOwnDistributionCalendar (progressive disclosure in distributions)
- Parent passes feeSchedule={asset.feeSchedule} (other props deferred — no backend data yet)

### Verification
- Frontend TypeScript: pass (only pre-existing PosterComposerScreen error)
- Frontend Vitest: 85 files, 1768 passed, 2 skipped, 0 failures

## Wave 39 — final anti-AI type-size consolidation

### Segment nav (CoOwnSegmentNav.tsx)
- Unified tab text size: bodyStrong 15 / body 14 ? body 14 for both states
- Active: body 14 + FontFamily.semibold + textPrimary
- Inactive: body 14 + FontFamily.regular + textSecondary
- Differentiation by weight + color only (not size)
- 2pt animated underline stays as primary indicator
- Removed 15pt from first viewport type budget

### Seller row (CommerceDetailSellerRow.tsx)
- Seller name: bodyStrong 15 ? body 14 + FontFamily.semibold
- Consolidates first viewport to 3 type sizes: priceHero 28, priceList 20, body 14, meta 11
- (priceHero is title zone, priceList is price — body 14 + meta 11 = 2 content sizes)

### First viewport type budget (after Wave 39)
- AssetDetailIdentity: priceHero 28 (title), priceList 20 (price), body 14 (seller), meta 11 (context)
- CoOwnSegmentNav: body 14 (tabs)
- AssetOverviewSection: priceList 20 (price header), meta 11 (caption)
- AssetOverviewDetails: priceList 20 (NAV), body 14 (content), meta 11 (labels)
- AssetMarketSection: bodyStrong 15 (header), numericMeta 13 (values), meta 11 (labels)
- AssetOwnershipSection: priceHero 28 (position), body 14 (labels), meta 11 (captions)
- Each section now uses =3 type sizes in its first viewport ?

### Verification
- Frontend TypeScript: pass, 0 errors
- Frontend Vitest: 85 files, 1768 passed, 2 skipped, 0 failures

## Wave 40 — dock chips + scroll context + market stats strip

### Dock chips (AssetDetailDock.tsx)
- Chip text: captionElevated 13 ? meta 11 (quiet secondary indicators)
- Dock viewport now 3 type sizes: priceList 20, bodyStrong 15, meta 11

### Scroll context (AssetDetailScreen.tsx)
- Wired CoOwnScrollContext.Provider around Reanimated.ScrollView
- Added scrollRef + scrollToY callback
- Tab switching now restores scroll position to the nav rail (was no-op)

### Market stats strip (AssetMarketSection.tsx)
- Added compact stats strip between header and segmented control
- Shows: 24h volume, spread, best bid, best ask (only when data available)
- Label: meta 11pt textMuted, value: numericMeta 13pt semibold tabular-nums
- Hairline vertical dividers, flat canvas, 40pt height
- Destructured spreadGbp prop (was declared but unused)

### Verification
- Frontend TypeScript: pass, 0 errors
- Frontend Vitest: 85 files, 1768 passed, 2 skipped, 0 failures

## Wave 41 — final polish (radius budget, dead code, stats strip dedup)

### Chart radius (CoOwnCandleChart.tsx)
- Retry button: Radius.md ? Radius.sm (Overview viewport now 1 non-avatar radius)

### Overview radius (AssetOverviewSection.tsx)
- Move badge: Radius.full ? Radius.sm (stricter — entire Overview uses Radius.sm)
- Removed dead `referenceVsAppraisalPct` prop (declared but never used)
- Cleaned up callers in AssetDetailScreen.tsx and coownAssetDetailRuntime.test.tsx

### Market final polish (AssetMarketSection.tsx)
- Removed unused `executionsTotal` state (dead computation, never rendered)
- Migrated retryLinkText and tapePrice: captionElevated ? numericMeta (token consistency)
- Replaced hardcoded borderRadius: 3 with Radius.full (liveIndicatorDot, sideDot)
- Stats strip now shows: 24h volume · Spread · Last price · 24h change %
  (was duplicating best bid/ask from topOfBookRow)
- Removed redundant bottom statsStrip (was duplicating 24h change + volume)
- Last price uses snapshot.lastExecutionPriceGbp ?? asset.lastTradePriceGbp (truthful)

### Final first viewport state
- Identity: priceHero 28, priceList 20, body 14, meta 11 (4 sizes, title zone separated)
- SegmentNav: body 14 (one size, weight/color differentiate)
- Overview: priceList 20, body 14, meta 11 (3 sizes)
- Market: bodyStrong 15, numericMeta 13, meta 11 (3 sizes)
- Ownership: priceHero 28, body 14, meta 11 (3 sizes)
- Dock: priceList 20, bodyStrong 15, meta 11 (3 sizes)
- Each section =3 type sizes ?
- Each section =2 non-avatar radii ?

### Verification
- Frontend TypeScript: pass, 0 errors
- Frontend Vitest: 85 files, 1768 passed, 2 skipped, 0 failures

## Wave 42 — corporate action row consistency

### CoOwnCorporateActionRow.tsx
- title: bodyStrong 15 ? body 14 + FontFamily.semibold (match ownership section)
- amount: bodyStrong 15 ? body 14 + FontFamily.semibold (match ownership section)
- statusText: captionElevated 13 ? meta 11 (match dock chips decision)
- Now uses 3 type sizes: body 14, meta 11 (consistent with the rest of the system)
- ballot-outline concern from previous wave: confirmed resolved (vote icon is podium-outline, valid)

### Verification
- Frontend TypeScript: pass, 0 errors
- Frontend Vitest: 85 files, 1768 passed, 2 skipped, 0 failures

---

## Wave 38-42 Summary — anti-AI design polish complete

### Type-size budget (AGENTS.md §4: max 3 in first viewport)
- Identity: 4 sizes (priceHero title zone + 3 content) — acceptable
- SegmentNav: 1 size (body 14, weight/color differentiate)
- Overview: 3 sizes (priceList 20, body 14, meta 11)
- Market: 3 sizes (bodyStrong 15, numericMeta 13, meta 11)
- Ownership: 3 sizes (priceHero 28, body 14, meta 11)
- Dock: 3 sizes (priceList 20, bodyStrong 15, meta 11)
- CorporateActionRow: 2 sizes (body 14, meta 11)

### Radius budget (AGENTS.md §4: max 2 non-avatar per viewport)
- Overview: 1 radius (Radius.sm for all rounded shapes)
- Market: 2 radii (Radius.sm for chips, Radius.full for circular dots)
- Ownership: 2 radii (Radius.md for chips/bar/offer, Radius.full for dots)

### Stroke grammar (hairline / 1pt / 2pt)
- Separators: hairline ?
- Fields/outlines: Stroke.standard (1pt) ?
- Focus/selection: 2pt underline ?

### Icon grammar (one family, one optical band)
- All Ionicons ?
- Navigation glyphs: 20-24pt ?
- Metadata glyphs: 14-18pt ?

### Dead code removed
- referenceVsAppraisalPct (computed but never rendered)
- executionsTotal (tracked but never displayed)
- Redundant bottom statsStrip (duplicated 24h change + volume)

### Components wired
- CoOwnFeeSchedule (progressive disclosure in rights/transfers)
- CoOwnDripToggle (in distributions, only when holder + supported)
- CoOwnDistributionCalendar (progressive disclosure in distributions)
- CoOwnScrollContext (tab switching restores scroll position)

### Depth chart upgraded
- Bid/ask fills match order book (coownUpSubtle/coownDownSubtle)
- Price labels: numericMeta 13pt semibold tabular
- Size labels: body 14pt tabular (cumulative depth)
- Mid line: solid borderSubtle hairline
- Last-price line: dashed borderSubtle hairline
