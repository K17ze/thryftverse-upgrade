# Research Ledger — Asset Detail flagship upgrade (2026-09-07)

## Kalshi market detail screen — feature inventory
Method: live web_search against docs.kalshi.com, help.kalshi.com, pro.kalshi.com, third-party analyses. No direct screenshots available (webfetch unavailable in research sandbox).

Key findings (PRIMARY DOCUMENTATION unless noted):
- Market schema exposes: ticker, title/subtitle, status lifecycle (active/closed/determined/finalized/disputed), open/close/expiration times, settlement_timer_seconds, yes/no bid/ask + sizes, last_price, previous price (24h change), volume_fp, volume_24h_fp, open_interest_fp, dollar_volume, rules_primary/secondary, result, settlement_sources (event metadata).
- Chart: step-line price, volume histogram, range selector (LIVE/1H/3H/6H/1D/1W/1M/ALL), candlestick API (1m/1h/1d), stats line (volume + open interest) above chart.
- Order book: bid/ask ladder, spread, click-to-prefill, queue position (Pro), view modes.
- Ticket: limit/market, TIF (GTC/EOD/IOC/custom), tick stepping, est. cost + max payout + fee, position-aware sell cap.
- Trust: CFTC badge, fee schedule link, rulebook PDF, named settlement source, risk disclaimer in ticket.

Top-15 must-haves (Kalshi): top-of-book w/ size, depth ladder, countdown + lifecycle, resolution rules + named source, ticket w/ cost+payout+fee, limit+market+TIF, position summary on screen, chart w/ volume, trades tape, trust badges, click-to-prefill + tick validation, related markets, real-time status, price alerts, exit triggers.

## Polymarket event/market page — feature inventory
Method: live web_search against docs.polymarket.com, help.polymarket.com, event-page snippets.

Key findings (PRIMARY DOCUMENTATION unless noted):
- MarketPrices: bestBid, bestAsk, lastTradePrice, spread, oneDayPriceChange.
- MarketMetrics: liquidity, volume24hr. OrderBook: bids/asks levels, minOrderSize, tickSize, hash.
- Chart: probability line, range selector 1H/6H/1D/1W/1M/ALL, crosshair, multi-outcome overlay, live WS updates.
- Book: bid/ask ladder with Price/Size/Total + depth bar, best bid/ask + spread, last trade fallback, click-to-fill limit price, open orders below book.
- Ticket: buy/sell + outcome + market/limit, FOK/FAK/GTC/GTD, unit-explicit amount input (USDC for buys, shares for sells), quick-size presets, tick-snapped price, est. shares/fill/slippage, payout + fee preview.
- Stats: volume (total + 24h), liquidity, best bid/ask/spread, 1h/24h/7d/30d change, open interest, holders count, fee rate.
- Rules: resolution source (named + link), end date, edge-case prose, UMA oracle disclosure, propose-resolution status.
- Position: badge on outcome row, positions accordion (shares/avg/current/P&L), close button.
- Activity: recent trades feed, comments, top holders, open orders w/ cancel.
- Trust: UMA oracle, condition ID, resolution source link, volume/liquidity/OI stats, audit link.

## Repo audit — current Asset Detail state
Full audit in subagent transcript. Key facts:
- Screen: 23 blocks; Overview/Market/Ownership tabs; sticky dock state machine; 8 sheets/modals.
- Data returned by backend but NOT displayed: marketMovePct24h, volume24hGbp, bestBid/AskGbp + depths, connectionStatus, staleMarkDays, marketAuditEvents, trustAuditEvents, listingTier, settlementEtaHours, escrowPartner, safeguarding partner, legalVehicleType/Jurisdiction, custodyPolicyRef/coverage, authenticityVerifiedAt, appraisalStaleDays, recourse fields, issuerJurisdiction, totalTradedValueGbp.
- Dead endpoints (backend exists, no UI consumer): /price-history (never called), /executions (dead via unused CoOwnPriceChart), /holdings aggregate, /settlements, /recurring-orders, /policy, asset orders list.
- MISSING backend routes (frontend 404s): GET /co-own/distributions, GET /co-own/corporate-actions, GET /co-own/assets/:assetId/corporate-actions, /co-own/watchlist (3 verbs), recourse/verification-demand (4 routes).
- Dead UI: showVolume state never settable; 6 expansion props declared but ignored; hasActiveOrders hard-coded false; hasUnclaimedDistributions = "any distribution exists" (misleading); 4 legacy components exported but never imported.
- Navigation gaps: Buyout, CorporateActionDetail, CoOwnPriceAlerts, Portfolio, AssetLeaderboard not linked from Asset Detail; 6 co-own screens missing deep links.

## Gap registry (this wave)
| ID | Gap | Severity | Action |
|----|-----|----------|--------|
| AD-1 | 24h change + volume not displayed | P1 | Stats strip in Market tab |
| AD-2 | Price history endpoint never called; range selector decorative | P0 | Wire fetchCoOwnPriceHistory w/ range→interval map + volume |
| AD-3 | Execution tape missing (only last trade) | P1 | Tape from /executions (last 8) |
| AD-4 | GET /co-own/distributions missing | P0 | Backend route |
| AD-5 | Corporate-actions routes missing | P0 | Backend routes + Ownership preview |
| AD-6 | hasActiveOrders hard-coded false | P1 | Wire to open-orders query |
| AD-7 | hasUnclaimedDistributions misleading | P1 | Status-based check |
| AD-8 | Buyout unreachable from Asset Detail | P1 | Disclosure row |
| AD-9 | Dead props/legacy components | P2 | Cleanup |
| AD-10 | Price alerts management unreachable | P2 | Overflow row |

Deferred (documented, not in this wave): comments/social feed, top-holders list, TP/SL exit triggers, multi-outcome event grouping, chart click-to-prefill, deep links for 6 screens, supply-sheet data population.
