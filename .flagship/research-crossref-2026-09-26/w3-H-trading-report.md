# W3-H Report — Trading & Wallet

**Date:** 2026-09-26 · **Branch:** feat/product-detail-contract-media-device-closure
**Scope:** `web/` co-own trading, wallet, syndicates · dept report: `trading-wallet.md`

## Status by task

| # | Task | Status | Where |
|---|------|--------|-------|
| 1 | Realized P&L = proceeds − cost basis | **DONE** | `components/trading/useCoOwnTrading.ts` — sell writes `realizedProfitGbp += fillGross − fillFee − filledUnits × avgEntryPriceGbp`. `Math.max(0,…)` removed — losing sells now book negative P&L. Cost basis is the position's blended `avgEntryPriceGbp` (already maintained on buys). Live mode: positions come from `/co-own/portfolio`; `mapCoOwnPortfolioHolding` already reports `realizedProfitGbp: 0` (unrealised-only posture) — no fabricated profit. |
| 2 | `GBP_RESERVED` hardcode | **DONE** | Constant deleted from `components/wallet/convertViewModel.ts`. `ConvertView` now uses real `data.available` for withdrawable and no longer renders a "Reserved for open orders" GBP row — orders reserve 1ZE, GBP has no hold mechanism, so 0/absent is the truth. |
| 3 | `PRICE_ALERT_SEED` | **DONE** | Seed deleted from `fixtures-coown.ts`; `alertStore` inits `alerts: []`; `PriceAlertsView` renders `hydrated ? stored : []` — fresh users get the honest empty state with the "Browse markets" affordance. |
| 4 | Live receipt projection | **DONE** | `useDistributionReceipts` live branch now fetches `fetchCoOwnPortfolio()` alongside distributions and only emits receipts for assets the viewer actually holds: `unitsHeld = position.units`, `totalGbp = unitsHeld × amountPerUnitGbp` (real numbers, no more `unitsHeld: 0` / whole-pot). Caveat: ex-date holdings aren't on the wire, so current units stand in — strictly bounded by real per-unit rate × real holding, and documented in code. |
| 5 | Syndicate settlement | **DONE** | `contribute` (now async) debits the wallet GBP pocket in fixture mode and writes a `purchase` session-ledger entry (`Syndicate commitment — {pool}`). Wallet cache is seeded via exported `fetchWallet` on cold sessions. New failure issues: `insufficient_funds` (real balance gate) and `live_unavailable`. Refund-on-release: `withdraw`/`dissolve` in `syndicateActions.ts` credit `min(commitment, session-debited stake)` — `syndicateStakeInWallet` sums debit/refund ledger entries by id prefix, so seeded memberships (never debited) release without fabricating cash. `executePool` consumes the stake as units (no wallet write needed). **Live mode:** `ContributionComposer` degrades to a read-only notice ("commitments are disabled") and `contribute` fails closed — pools are fixture-seeded even live and no `/syndicates` endpoints exist. Composer also shows `£X in wallet` and pre-flags insufficient funds. |
| 6 | MarketRow sparkline | **DONE** | `MarketRow` + `FeaturedHero` both bypassed the query layer via `priceWindow()` fixtures. Now `usePriceHistory(id,'1W')` — real `/co-own/assets/:id/price-history` endpoint in live mode; empty slot while loading (honest absence). |
| 7 | Chart parity | **DONE** | `PricePanel` gains a Line/Candles `SegmentedControl` wired to the existing `CandleChart` (was dead code). AT path preserved: keyboard-scrubbed line chart is default; candle mode keeps the OHLC "View as table" + text summary. |
| 8 | Order ticket | **DONE (partial)** | Review step added: compose → "Review order" → confirm card (market, side·type, units, limit, TIF, full quote, escrow line) → submit → receipt. Auth wall fires at review-open, same posture as before. **TIF wired**: `OrderDuration` ('day'→GFD / 'gtc'→GTC90) picker for limit orders; sent on the wire (`placeCoOwnOrder.timeInForce`), mapped back from wire responses, stamped on session orders, shown on receipt + OpenOrders rows. Dollars-mode **skipped**: contract is integer units only (max 20) — no cash-amount order shape exists. |
| 9 | Escrow disclosure | **DONE** | Disclosure line on the ticket (compose + review): "Orders settle in 1ZE — buyer funds are held in escrow until the trade settles, and seller proceeds release after settlement." Web `CoOwnAsset` has no `escrowPartner` field so no partner name is claimed. |
| 10 | Alert types | **NO-OP** | Contract only supports price-cross (above/below target); composer stays price-cross only, as allowed. |

## Files changed

- `web/src/components/trading/useCoOwnTrading.ts` — cost-basis P&L; `duration` on PlaceOrderInput/order/wire call.
- `web/src/lib/contracts/coown.ts` — additive `CoOwnOrder.duration?: OrderDuration` (optional, backward-compatible).
- `web/src/lib/api/services/coown.ts` — `timeInForce` in/out (local wire-type extension; mappers untouched).
- `web/src/components/wallet/convertViewModel.ts`, `ConvertView.tsx` — GBP_RESERVED removed.
- `web/src/components/coown/alertStore.ts`, `PriceAlertsView.tsx`, `lib/data/fixtures-coown.ts` — alert seed removed.
- `web/src/lib/hooks/coown-queries.ts` — live receipts derive from portfolio holdings.
- `web/src/lib/hooks/syndicate-queries.ts` — wallet debit on contribute, refund helpers, live gate.
- `web/src/components/syndicate/syndicateActions.ts` — wallet refunds on withdraw/dissolve (session-debited amounts only).
- `web/src/components/syndicate/ContributionComposer.tsx` — async commit, insufficient-funds + live-mode gates, wallet line.
- `web/src/components/coown/MarketRow.tsx`, `FeaturedHero.tsx` — `usePriceHistory` sparklines.
- `web/src/components/coown/asset/PricePanel.tsx` — line/candle toggle.
- `web/src/components/coown/asset/TradePanel.tsx` — review step, TIF picker, escrow line.
- `web/src/components/coown/OpenOrders.tsx` — duration shown on resting orders.
- `web/src/components/wallet/useWalletData.ts` — exported `fetchWallet` for write-path seeding.

## Tests / checks

`cd web && npx tsc --noEmit` — **zero errors in any touched file**; remaining errors are other workstreams' in-flight files (filters/search/seller/collections). `npx eslint` on all changed files — clean, no output.

## Concerns for orchestrator

- **contracts/coown.ts touched** (additive optional `duration` field) — required to carry TIF end-to-end; mappers.ts deliberately untouched (wire mapping done inside services/coown.ts).
- **components/trading, components/syndicate, contracts** were edited — the task list's stated dirs didn't match reality (`useCoOwnTrading` lives in `components/trading/`); all edits stay inside the trading/wallet/co-own slice.
- Fixture GFD semantics are declared but not enforced (session ledger has no expiry clock) — the TIF is a real wire instruction in live mode; in fixture mode the order rests for the session either way. Disclosed in code comments.
- Live receipts: `unitsHeld` is current holding, not ex-date holding — the wire carries no per-viewer entitlement; bounded projection is honest but a real receipts endpoint would be better.
- Syndicate wallet seed (£214.90 available) vs typical pool minimums (£100–500): the insufficient-funds gate is real and reachable — syn-02 (£150 min) is joinable in the demo wallet.
- `useDistributionReceipts` live now fails if `/co-own/portfolio` 401s — correct posture (error + retry) rather than fabricated receipts.
