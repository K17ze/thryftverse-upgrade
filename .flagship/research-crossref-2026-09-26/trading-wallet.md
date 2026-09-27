# Cross-Reference Audit — Trading & Wallet
### Co-Own fractional trading · order book · trade panel · charts · portfolio · wallet · payouts · price alerts · syndicates

**Codebase audited:** `web/src` (Next.js) — `app/co-own/**`, `app/wallet/**`, `components/coown/**`, `components/trading/**`, `components/wallet/**`, `components/syndicate/**`, `components/charts/**`, `lib/hooks/coown-queries.ts`, `lib/hooks/syndicate-queries.ts`, `lib/utils/trade.ts`, `lib/data/fixtures-coown.ts`.
**Mobile reference:** `frontend/src/components/coown/**`, `frontend/src/components/portfolio/**`.
**Data posture:** `DATA_MODE` defaults to `fixture` (`web/src/lib/api/client.ts:46`); the react-query cache is the session ledger.

---

## 1. Reference Grammar (live research, distilled)

### Robinhood
- **Order ticket:** bottom sheet; Shares↔Dollars amount-mode toggle; $1 fractional minimum; Review → submit flow; fills get a dedicated confirmation (exact filled price/qty) — "fills are not toasts."
- **Chart:** single line, range pills (1D/1W/1M/3M/1Y/ALL), drag-to-scrub crosshair that **swaps the header price** for the inspected point and deltas relative to it; green/red tint keyed to period move; after-hours band shading.
- **Alerts:** bell on the instrument page → price above/below target, plus % movement (5%/10%), 52-wk high/low, indicator alerts; frequency caps (1/hr, 3/day); push-delivered.
- **Portfolio:** total value hero, today's move + all-time return, position rows (shares, avg cost, price, value, % port), sortable; buying power separated from positions.

### Polymarket
- **Market page:** outcome chart left, order book beside it, trade ticket right (desktop); bottom-sheet ticket on mobile.
- **Order book:** Price / Size / Total(cumulative) columns, green bids / red asks, bar fill = level$ / max$; click a row → prefills limit price + flips ticket to limit; spread shown as the mid gap; "Show more" expands levels.
- **Ticket:** Buy/Sell + Yes/No pills carrying live price; market vs limit; shares or $ amount; est. avg price + shares received + potential winnings; open orders sit directly below the book, cancel via inline ×.
- **Positions:** shares held, avg price, current price, value, P&L (net), redeem when resolved.

### Kalshi (Pro)
- **Order panel:** "trader's panel, not consumer checkout" — Buy/Sell + Yes/No, Limit or Shares(market), time-in-force (GTC/EOD/IOC/custom), post-only toggle, 1-tap submit option, else **Review → Submit → Done** with queued/partial/filled outcome.
- **Price stepping:** ±1¢ steps, ±10¢ with Shift, sub-cent with Alt; AUTO mode pegs limit to touchline; snap to valid ticks; click book level prefills price+size; sell qty capped to owned with position sub-label.
- **Blotter dock:** Positions/Orders/Fills one dock; queue-position column for resting orders; inline amend (drag price pill, valid-tick ladder, warns if crossing spread); bulk cancel.
- **Portfolio:** stat strip (cash, positions value, unrealized P&L, open count); tabs open orders/positions/fill history/closed; P&L net of fees with one formula everywhere.

### StockX / GOAT
- **StockX:** "Buy Now @ lowest Ask" vs "Place Bid" dual CTA; 12-month sales-history chart filterable by date; bid/ask tables with per-price counts; Market Comparison shows spread + what price beats lowest ask; 52-wk high/low, volatility, # of sales.
- **GOAT:** simpler — last sale + basic trend, lowest ask/highest bid; no depth. StockX grammar is the benchmark.

### Coinbase Advanced Trade
- **Panels:** TradingView chart + depth chart + ladder order book + order panel + open orders; depth chart = cumulative size over price range, bid/ask walls.
- **Order types:** market, limit, stop-limit; TIF (GTC, Good-'til-Time, IOC); Post-Only; sticky form settings persisted per market (side, type, precision, interval); partial fills shown as sub-orders in Order details → Fills.
- **Ladder:** precision/aggregation selector per market; spread line mid-book.

### Synthesized honesty grammar
- Order ticket must show **est. fill, worst price, fee, total** pre-submit; slippage beyond depth flagged.
- Positions must show **avg cost, last, value, unrealized P&L**; realized ≠ proceeds.
- Balances must decompose **settled / pending / reserved**; reserve released on cancel.
- Charts need pointer crosshair **and** an AT path (keyboard scrub, data table, or text summary).
- Alerts need honest delivery semantics (device-local vs push), one-shot vs repeat, already-crossed warning.
- Empty states name the next action; halted/closed markets get their own grammar, never silently dead.

---

## 2. Our Implementation (verified, file:line)

### Trade ticket — `components/coown/asset/TradePanel.tsx`
- Side segmented buy/sell (semantic tint); order types **Market / Limit / Protected** (±1.5% band, `orderExecution.ts:25`); integer units stepper (max 20, `lib/utils/trade.ts:17`); limit prefilled to touchline until edited (`TradePanel.tsx:110-114`); book-row click prefills price+side→limit (`:100-107`, wired via `AssetDetailView.tsx:112-115`).
- **Live execution plan** from `planExecution` (`orderExecution.ts:92-197`) — walks real book levels, returns fills/resting/next book; quote card shows **Est. fill (units @ avg), Worst price, Resting remainder, Gross, Fee (1%), Total** (`TradePanel.tsx:404-449`); buy total includes fee+reserve, sell shows net.
- **Submit gate = real ledger constraints** (`:162-195`): whole units → max 20 → limit required → guest→signup wall → wallet loading → sell ≤ holdings → market must fill fully ("Only N units available on the book") → buy needs 1ZE (settled−reserved). Reason text + inline "Convert GBP" link when short.
- Position block pre-trade: units, market value, unrealized P&L+%, avg entry (`:230-268`).
- **Receipt** (`:451-539`): filled / partially filled / resting headline; units filled of total; avg fill or limit; resting remainder; fee; total; order reference; pointer to portfolio for open orders.
- Write path `useCoOwnTrading.ts:100-319`: one pass writes order row, blends avg entry in position, mutates book, prints tape + activity, updates asset snapshot, settles 1ZE (debit settled / reserve resting / credit pending on sell). **Cancel** (`:333-405`) releases buy reserve / returns sell units / removes resting depth. Live mode posts `/co-own/*`, invalidates.

### Order book — `components/coown/asset/OrderBookPanel.tsx`
- **Real depth**, not decorative: cumulative depth bars scaled to max cumulative (`:41-49`, `:79`); asks descend into spread, bids away (`:240-244`); Price/Units/Total columns; click row → ticket prefill with descriptive aria-label (`:68-76`).
- **Spread band** (`:152-223`): best bid | spread+bps+last print (tick-rule coloured) | best ask.
- Three pressed-button views: **Book / Depth / Trades** (`:34-38`, `:318-333`) — Depth = real `DepthChart` (cumulative SVG, one-sided books render, aria summary, `charts/DepthChart.tsx`) + text twin; Trades = real tape (`TradeLedger.tsx`), capped 8 rows.
- Bid/ask **imbalance strip** % under ladder (`:387-406`); level count + source shown (`:284-288`); honest empty per side and per book (`:124-142`, `:340-346`).

### Price chart — `components/coown/asset/PricePanel.tsx` + `components/charts/PriceChart.tsx`
- Line/area chart; **keyboard crosshair verified**: arrows step candles, Home/End jump, Escape clears (`PriceChart.tsx:67-84`); `role="img"` + `aria-keyshortcuts` + `tabIndex` (`:87-97`); live-region announces inspected point identical to tooltip (`:167-176`).
- Pointer crosshair + dashed crosshair line + tooltip (close + timestamp) (`:138-163`); dashed **current-price marker** + end dot (`:112-137`).
- Range pills **1D/1W/1M/ALL** (`PricePanel.tsx:27-32`); **"View as table" toggle → full OHLC table** (`:156-164`, `:196-241`); text summary line under chart (`:178-184`); details strip (bid/ask/spread/day range/24h vol — all real fields, absent when missing); venue disclosure "Issuer-run fractional market · not a public exchange" (`:150-152`).

### Portfolio — `components/coown/PortfolioView.tsx`, `PortfolioSummary.tsx`, `PositionsTable.tsx`, `OpenOrders.tsx`, `DistributionsTable.tsx`
- Summary: market value hero, all-time return £+%, **cost basis**, 24h move (£+% derived), **realized profit**, income YTD, allocation bar + legend (`PortfolioSummary.tsx:46-102`).
- Positions: sortable (name/value/P&L) dense rows — units, **avg cost**, last, value, P&L £+%, 1M sparkline (`PositionsTable.tsx`); halted positions carry lifecycle tag; empty → "No positions yet" + Browse markets (`:121-131`).
- Open orders + **order history** (terminal states persist — cancelled orders don't vanish, `OpenOrders.tsx:199-249`); two-tap cancel with release copy (`:55-58`, `:118-152`).
- Guest → sign-in wall; error → retry; per-row sparkline uses `usePriceHistory` (query layer).

### Alerts — `components/coown/alertStore.ts`, `PriceAlertsView.tsx`, `CreateAlertSheet.tsx`
- localStorage-persisted; **real on-device evaluation** on every assets snapshot (`alertStore.ts:73-89`, `useEvaluateCoOwnAlerts` mounted on hub/detail/portfolio/alerts); one-shot fire → `triggeredAt`, deactivates.
- Surface groups **Active / Triggered / Paused**; delete behind confirm sheet; honest banner: "evaluate against last-trade prices on this device… no push delivery" (`PriceAlertsView.tsx:183-187`).
- Create sheet: denomination/trigger basis/current price context rows; above/below semantic buttons; **already-in-the-money warning** ("fires on the next price check", `CreateAlertSheet.tsx:32-36`,`:120-124`).

### Wallet — `components/wallet/**`
- `WalletView.tsx`: guest gate (`:72-82`), true empty state (`:96-117`), GBP + 1ZE pockets with **pending/reserved sub-lines** ("held for open orders", `:159-165`), recent-activity preview reusing canonical `buildLedger`.
- `ledgerViewModel.ts`: running balance reconstructed backward from current available; **pending rows keep null balance** (`:97-103`); filters, month grouping, **real CSV export** (`:163-180`); `HistoryView.tsx` chips + paged load-more.
- `ConvertView.tsx` + `convertViewModel.ts`: direction chips, amount input + Max, withdrawable = settled−reserved; **quote shows principal, 100bps fee, net** pre-submit (`:381-406`); rate label + fixed `RATE_AS_OF` timestamp disclosed; receipt with new balances + reference; **hidden entirely in live mode** (no endpoint — `ConvertView.tsx:180-190`); fixture disclosure line.
- `WithdrawView.tsx`: form → confirm (fee £0, destination, "Reviewed by our team") → **staged progress** ("Reserving funds… Recording… Sending for review") → receipt w/ reference; funds earmarked at request, pending ledger entry; statuses never claim "Paid" before bank confirms (`withdrawViewModel.ts:52-83`); ETA "1–3 business days" disclosed as estimate.
- `PayoutsView.tsx`: masked last4 accounts, default mgmt, last-account removal blocked with reason; `usePayoutAccounts.ts` persists localStorage, stores last4 only.
- `WalletSheets.tsx` TopUp: **fixture-demo only — returns null in live mode** (`:42`); copy says "no money moves"; ledger entry labelled "Top-up — demo".

### Syndicates — `components/syndicate/**`, `lib/hooks/syndicate-queries.ts`
- Hub: Your syndicates / Open syndicates ranked by joinability (`SyndicateHubView.tsx:23-35`); honest phases (open/funded/executed/dissolved) degrade composer to quiet notices (`ContributionComposer.tsx:108-139`); contribution validation = pool rules (min/max/headroom/remaining) with live share% + ≈units preview (`:63-84`, `:176-191`); guest→signup wall on commit.

---

## 3. Gap Table

| Reference grammar | Ours | Status | Evidence |
|---|---|---|---|
| Est. fill / worst price / fee / total pre-submit | Quote card + `planExecution` | **MATCHED** | `TradePanel.tsx:404-449` |
| Partial-fill honesty | blocked for market ("Only N units available"); limit shows resting remainder; receipt reports filled/partial/resting | **MATCHED** | `TradePanel.tsx:181-187`, `:456-503` |
| Click book level → prefill ticket | flips to limit + price+side | **MATCHED** | `OrderBookPanel.tsx:70`, `AssetDetailView.tsx:112` |
| Book: Price/Size/Total + depth bars + spread mid | +bps + tick-rule last + imbalance strip | **MATCHED+** | `OrderBookPanel.tsx:152-223`, `:387-406` |
| Depth chart (cumulative walls) | real SVG + text twin | **MATCHED** | `charts/DepthChart.tsx` |
| Trades tape beside book | third view, real ledger | **MATCHED** | `OrderBookPanel.tsx:318-333` |
| Chart range pills | 1D/1W/1M/ALL | **MATCHED** | `PricePanel.tsx:27-32` |
| Chart crosshair (pointer) | scrub + tooltip | **MATCHED** | `PriceChart.tsx:57-63` |
| Chart AT alternative | keyboard scrub + live region + OHLC table + text summary | **MATCHED+ (exceeds refs)** | `PriceChart.tsx:67-97`, `PricePanel.tsx:156-241` |
| Candle mode / OHLC readout on crosshair | line-only; tooltip shows close+time only; `CandleChart.tsx` exists but **unused (dead code)** | **PARTIAL** | `charts/CandleChart.tsx` unreferenced |
| Header swaps to inspected point on scrub (Robinhood) | tooltip is in-chart; hero price static | **MISSING** | `PricePanel.tsx:106-114` |
| Dollars-vs-shares amount mode | units only (integer, max 20) | **MISSING** (product constraint, not UX bug) | `TradePanel.tsx:116` |
| Review→Submit→Done step | single submit → receipt | **PARTIAL** (inline live quote compensates) | `TradePanel.tsx:200-227` |
| Time-in-force / post-only / duration | mobile has GFD/GTC90; web has none | **DIVERGENT vs mobile / MISSING vs Kalshi-Coinbase** | `frontend/.../CoOwnTradeComposer.tsx` `CoOwnTicketDuration` |
| Slippage-beyond-depth flag | gate text covers market; no explicit "price impact" metric in quote | **PARTIAL** | `TradePanel.tsx:181-187`; mobile has `slippageBeyondDepth` |
| Post-trade position preview | shows current position block; no "units after / ownership% after" | **PARTIAL** | mobile `CoOwnPostTradePreview`; web `TradePanel.tsx:242-268` |
| Escrow/settlement partner disclosure on ticket | none on web | **MISSING vs mobile** | mobile `escrowPartner` prop |
| Positions: avg cost, last, value, unrealized P&L | all computed | **MATCHED** | `PositionsTable.tsx:16-24`, `PortfolioView.tsx:54-74` |
| Portfolio stat strip + allocation | value/return/cost/24h/realized/income + allocation bar | **MATCHED** | `PortfolioSummary.tsx` |
| Portfolio performance-over-time chart | none (point-in-time summary); mobile has `CoOwnPortfolioPerformanceChart` | **MISSING vs mobile** | — |
| Open orders w/ cancel + release | two-tap confirm, reserves released | **MATCHED** | `OpenOrders.tsx`, `useCoOwnTrading.ts:359-395` |
| Order history (terminal states visible) | Filled/Cancelled list | **MATCHED** | `OpenOrders.tsx:199-249` |
| Alert create: above/below target, basis shown | + in-the-money warning | **MATCHED** | `CreateAlertSheet.tsx` |
| Alert evaluation truthful | on-device vs last-trade, one-shot, no-push disclosed | **MATCHED (honest)** | `alertStore.ts:73-112` |
| Alert types beyond price-cross (%, 52wk, indicator) | none | **MISSING** (acceptable scope) | Robinhood grammar |
| Wallet pending/reserved decomposition | GBP pending + 1ZE settled/pending/reserved shown | **MATCHED** | `WalletView.tsx:145-167` |
| Withdraw: fee row, ETA, review status, masked dest | all present, staged progress | **MATCHED** | `WithdrawView.tsx` |
| Convert: rate + fee + net pre-submit | + rate timestamp + fixture disclosure | **MATCHED** | `ConvertView.tsx:371-406` |
| StockX "Buy now @ lowest ask / Place bid" dual CTA | unified ticket (market/limit) instead | **PARTIAL-equivalent** | `TradePanel.tsx` |
| Live-updating book (websocket/poll) | static snapshot per fetch; no level flash | **MISSING** | `coown-queries.ts:76-87` |
| Book depth aggregation/precision control | fixed 6 levels | **MISSING** | `OrderBookPanel.tsx:29` |
| Own resting orders marked inside book | separate "Your resting orders" list below | **PARTIAL** | `AssetDetailView.tsx:178-221` |
| Empty states (zero positions/orders/alerts/book) | named + CTA everywhere | **MATCHED** | multiple |

---

## 4. Top Caveats (fabrication / honesty risks)

1. **`realizedProfitGbp` counts gross proceeds as profit** — `useCoOwnTrading.ts:219-221` adds `max(0, fillGross − fillFee)` on sell, ignoring cost basis of units sold. Selling at a loss still books "realized profit". Portfolio "Realized profit" stat (`PortfolioSummary.tsx:73-77`) is therefore overstated. Fix: `fillGross − fillFee − (unitsSold × avgEntry)`.
2. **`GBP_RESERVED = 18.5` hardcoded** (`convertViewModel.ts:25`) renders as "Reserved for open orders" on the GBP pocket and reduces withdrawable in Convert — not derived from the actual open-orders cache. The 1ZE `reserved` figure is real (session ledger); the GBP one is fabricated.
3. **`MarketRow.tsx:5,71` imports `priceWindow` straight from fixtures** — the market-list sparkline bypasses the query layer, so it renders fixture candles even in live mode. `PositionsTable` uses `usePriceHistory` correctly; the list row doesn't.
4. **Live-mode distribution receipts fabricate ownership** — `coown-queries.ts:254-266` projects `unitsHeld: 0` and `totalGbp: totalPotGbp` (whole pot, not the viewer's share). In live mode the income table misstates what the user was paid.
5. **`PRICE_ALERT_SEED` ships two pre-existing alerts** (`fixtures-coown.ts:909-926`, loaded as initial store in `alertStore.ts:51`) — a first-run user sees alerts they never set. Disclosed only implicitly ("while you browse"); reads as someone else's data, like seeding a portfolio.
6. **Syndicate contributions never touch the wallet** — `contribute` (`syndicate-queries.ts:147-211`) records membership + GBP amounts but debits no GBP/1ZE and reserves nothing. A user can "commit" £5,000 over balance without friction. Fixture-posture consistent, but the pooled buy has no settlement hook — flag before claiming the flow is end-to-end.
7. **`CandleChart.tsx` is dead code** — no importers outside `charts/index.ts`; candle grammar exists in code but not on the surface (mobile has a line/candle mode toggle).
8. **Book is a static snapshot** — no polling/refresh cadence in fixture mode and no update flash; "live market" appearance without liveness. Kalshi/Coinbase grammar assumes streaming.
9. Minor: `todayMove` in `PortfolioSummary` = `value × movePct24h/100` (approximation of today's move); acceptable but labelled as fact. Sell-side `totalGbp` in quote = net proceeds labelled "Total" — fine but could read as gross.
10. Live-mode `placeOrder` returns `plan: null` — receipt falls back to limit/listed price honestly (`TradePanel.tsx:485-495`), but there's no server-fill confirmation read-back; receipt says "filled" from the wire order's status field alone.

---

## 5. Verdict

The web trading/wallet surface is **unusually honest for fixture-mode work**: the order book renders real depth, the ticket quotes from a real execution plan and gates on real ledger constraints, the receipt reports recorded state, alerts genuinely evaluate, withdrawals never claim "paid", and demo surfaces (top-up, convert) are gated or disclosed rather than faked. Chart accessibility (keyboard crosshair + data table + text twin) exceeds the reference apps' web grammar.

The honest divergences are concentrated in **money-math edge cases** (realized P&L counts proceeds not profit; fabricated GBP reserve), **live-mode projections** (receipt unitsHeld=0; MarketRow fixture sparkline), and **pro-trader grammar gaps** (TIF/post-only, review step, candle mode, post-trade preview, streaming book). None of these are decorative lies on screen — they're seams where the demo ledger stops short of the mobile contract's depth.
