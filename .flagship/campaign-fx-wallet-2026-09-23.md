# Campaign — Wallet Exchange Layer (FX / multi-currency / cross-border)

Date: 2026-09-23
Objective: audit payment + integration layer; reach Wise/Revolut/Niyo-Global-class
wallet exchange foundation (multi-currency balances, live FX, fiat↔fiat conversion,
quote locks, cross-border beneficiary foundation).

## Verified workspace facts (main agent, direct evidence)

- `wallets` (migration 015): one row/user; `oneze_balance_units` (1ZE token,
  USD-anchored at par 1 1ZE = $1.00) + `fiat_balance_minor` + **single**
  `fiat_currency CHAR(3)`. → single-currency fiat wallet.
- `wallet_ledger`: append-only, kind taxonomy, `balance_after`, `tx_id`.
- `payout_corridors` (migration 015): rail/min/max/spread_bps/network_fee/SLA —
  seeded INR→razorpay, EUR→mollie, etc. Cross-border payout CORRIDOR model
  exists, beneficiary model TBD.
- `oneze_internal_fx_rates`: seeded static rates (migration 220, 8 USD pairs).
- Live FX sync EXISTS: `syncOnezeInternalFxRatesFromProvider` (index.ts:11167),
  provider `https://api.exchangerate.host/latest`, env-gated
  `ONEZE_FX_SYNC_ENABLED` (default **false**, config.ts:578), interval 24h,
  only syncs currencies in active 1ZE pricing profiles (~8), writes direct +
  inverse pairs, source `external_fx_provider`. No TTL/staleness contract,
  no quote-lock, no spread applied at rate level (spread at fee level).
- `resolveInternalFxRate` (pricingEngine.ts:494): direct → inverse lookup,
  JS `number` math (float), throws on missing pair. No cross-via-USD.
- `money.ts`: solid BigInt minor-unit primitive, ~45 ISO-4217 currencies,
  `convertMoneyByDecimalRate` BigInt path exists.
- Seller settlement ledger (`ledger_accounts`/`ledger_entries`,
  `/users/:userId/wallet/balances` index.ts:20073): hardcoded GBP
  (`amount_gbp`, `subtotal_gbp`).
- Convert surface today: `POST /wallet/convert-1ze-to-fiat` (1ZE→fiat only),
  `GET /wallet/1ze/fx-quote`. No fiat↔fiat.
- Fees: load 200bps / withdraw 200bps / convert 150bps.

## Research tracks dispatched

- cf8f7156 backend money-domain archaeology
- effd4d57 frontend wallet/payments archaeology
- f4cf0c05 FX/cross-border capability audit
- 4254d4fa live competitor + rails research (Wise/Revolut/Niyo/Exness/FXCM)

## Execution log

- Wave 1 DONE: T1 migration 340 (+down) — implementer caught stale spec
  (source_type CHECK live list is migration-301's 12 values, not 005's 4;
  Ruling: used live list — literal spec would have dropped 8 live values).
- Wave 1 DONE: T2+T7 fxEngine.ts + walletMoneyPath multi-currency
  (fiatCurrency param, wallet_currency_balances pockets, legacy mirror).
  typecheck clean, 33/33 existing tests pass.
- Wave 1 DONE: T3 beneficiaries.ts (IBAN MOD-97, BIC, IFSC, ABA, sort code).
- Wave 2 DONE: routes/fxWallet.ts (13 endpoints, 1329 lines, tsc clean);
  index.ts — sync→all registry currencies + fx_rates ticks + 5min default +
  enabled; resolveOnezeFiatFxRate gross-rate fix (kills silent 2% double-fee);
  4 FIAT delta sites threaded with fiatCurrency; routes registered 13618.
- Wave 3 DONE: T9 — fxEngine.test.ts (29) + beneficiaries.test.ts (22), 51/51
  pass; T8 — fxApi.ts, WalletExchangeScreen.tsx (~1170), WalletCurrencyBalances,
  WalletScreen mount, nav+linking+en.json walletFx namespace. Frontend tsc clean.
- Verification: backend tsc --noEmit = 0 errors project-wide (self-run).
  Full suite: 1621/1624 (2 pre-existing fails, unrelated: searchReindexLease
  regex + upload-finalization timeout). Redis/Postgres not running locally —
  integration layer untested by env, flagged.
- Rulings: (1) migration uses live 301 source_type list not stale 005 spec;
  (2) sync sources registry from money_currency_registry DB table (mig 079)
  not CURRENCY_EXPONENTS import — kept, better single-source;
  (3) fee = source-currency carve-out, ledger metadata + platform
  revenue_fx/fx_clearing posting, no separate FX_FEE leg.
- Wave 4 adversarial review DONE (agent 4f897ecc, full-diff scope):
  VERDICT: money core survives — no double-spend, negative balance, or
  cross-user breach found; atomicity/locking/constraint safety verified.
  But NOT production-ready: economic controls had holes.
  Found: C1 stale/seed rates executable (no freshness gate — seeded
    USD→INR 83.33 exploitable ~+54% pairs, no velocity caps to bound it);
  H1 /transfers bypasses 'redeem' compliance gate (p2p_send weaker);
  H2 velocity limits dead (amountUsd never passed);
  H3 transfer-path executions skip revenue_fx ledger posting;
  H4 down-migration hard-fails post-live + destroys pocket balances;
  M1 ops halt doesn't cover new paths + registry.enabled dead;
  M2 error boundary leaks raw pg errors as 409s;
  M3 admin rate override shadowed by stale ticks;
  M4 transfer principal invisible to books while PROCESSING (documented —
    internal_ledger rail honest-by-design until adapter ships);
  M5 PG timestamptz::text breaks Hermes + execute not idempotent;
  M6 idempotency replay skips payload-hash check;
  L-series: lock-order inversion risk, sync lacks advisory lock + fetch
    inside tx, dead config (fxQuoteTtlSeconds/fxSpreadBps), dead sweep,
    wrong status codes, frontend exponent map, clock-skew refetch loop.
- Orchestrator self-review ALSO found + FIXED (before review returned):
  workerRuntime.ts stale duplicate applyWalletLedgerDelta omitted
  wallet_ledger.currency → live 1ZE mint/withdrawal-settle would throw
  23502 post-migration. Delegated to canonical walletMoneyPath impl;
  orphaned loadWalletForUpdate removed; tsc clean; 51/51 tests green.
- Repair wave DONE:
  * Backend (8eed43a2, self-verified by orchestrator): all 17 findings
    addressed. C1 → createFxQuote rejects stale w/ FX_RATE_STALE 503,
    allowStaleRate escape hatch via config.fxAllowStaleQuotes, rate_stale
    persisted+serialized. M3 → freshest-of-two-stores rate resolution.
    H1 → redeem gate on transfer quoteId branch. H2 → amountUsd/currency
    context on both capability calls. H3 → revenue leg on transfers +
    made idempotent (replay-safe). M2 → ApiError boundary requires
    numeric statusCode (pg/system errors → real 500). M5 → ISO
    timestamps end-to-end + executeFxQuote replays stored execution.
    M6 → request_hash on fx_quotes+transfers, IDEMPOTENCY_KEY_REUSED.
    M1 → assertFxOperationsNotHalted dep on 3 handlers, registry.enabled
    filter, beneficiary currency via normalizeCurrencyCode. L3 → config
    wired. L4 → expireStaleFxQuotes in sync tx. L5 → correct status
    codes (503/403/404/410/400/409). L2 → provider fetch outside tx +
    pg_try_advisory_xact_lock('oneze_fx_sync'). L1 → ensureWallet
    lock=false on non-mutating paths; transfers derive wallet from
    execution. H4 → down-mig one-way-boundary header + NOT EXISTS
    guarded account deletes (both FK cols).
  * Frontend (e1e17c68): assertFxOk status=409 (no fake network errors),
    full ISO exponent map (16 zero-dp, 7 three-dp), executed-quote
    resync via getFxQuote on NOT_OPEN/EXPIRED, auto-refetch cap=3 with
    reset on live quote, parseServerTimestamp handles ISO + PG text.
- Verification (orchestrator-run): backend tsc --noEmit = 0 errors;
  frontend tsc = 0 (agent); fxEngine+beneficiaries = 57/57 pass;
  lib sweep 169/169 (agent); earlier full-suite 1621/1624 w/ 2
  pre-existing fails (searchReindexLease regex, upload-finalization
  timeout); Redis/Postgres absent locally → integration layer untested.
- OPS REQUIREMENT: with C1 fail-closed, deployments WITHOUT a working
  FX provider key will refuse quotes (503 FX_RATE_STALE) instead of
  quoting on 2024 seed rates. Correct behavior; requires
  ONEZE_FX_PROVIDER_API_KEY (or FX_ALLOW_STALE_QUOTES=true override)
  in production.
- Remaining documented gaps (P1+): real payout rail adapter (transfers
  stay PROCESSING honestly — rail_ref NULL), transfer principal
  platform-side ledger_entries (M4), index.ts's own getApiError copy
  same pg-leak pattern (pre-existing, out of scope), IBAN↔country
  cross-check, beneficiary revalidation endpoint, provider failover.

## Gap registry (draft — updated as reports land)

| ID | Gap | Evidence | Sev |
|----|-----|----------|-----|
| FX-01 | Single-currency fiat wallet — cannot hold USD+EUR+INR simultaneously | migration 015 wallets.fiat_currency CHAR(3) | P0 |
| FX-02 | FX sync off by default, daily cadence, corridor-currencies only | config.ts:578-583, index.ts:11167 | P1 |
| FX-03 | No fiat↔fiat conversion — only 1ZE↔fiat | index.ts:22355 convert-1ze-to-fiat | P0 |
| FX-04 | No FX quote entity with TTL / guaranteed-rate window | no fx_quotes table found | P0 |
| FX-05 | Rate math in float (number), not BigInt decimal | pricingEngine.ts:51,494+ | P1 |
| FX-06 | No public /fx/rates surface for clients to display live rates | route audit | P1 |
| FX-07 | No beneficiary/remittance model for cross-border P2P/bank send | TBD | P1 |
| FX-08 | Seller ledger hardcoded GBP | index.ts:20088-20102 | P2 |
| FX-09 | No rate-staleness guard or freshness contract to clients | resolveInternalFxRate | P1 |
| FX-10 | Exotic pair resolution: only direct/inverse, no USD-cross path | pricingEngine.ts:494-554 | P2 |
| FX-11 | BUG: `CONVERT_FROM_1ZE` absent from wallet_ledger kind CHECK → 23514 crash on real PG | index.ts:22615 vs migration 324 | P0 |
| FX-12 | Dead `fx_rates` table (created 015:137, zero code refs) | grep | P3 |
| FX-13 | Rail execution fake: `executeReservedWithdrawal` synthesizes rail_ref, no provider payout call | index.ts:4542 | P1 |
| FX-14 | No beneficiary schema (IBAN/SWIFT/IFSC/routing); payout_destination is free JSONB | 015:164 | P1 |
| FX-15 | Quote lock exists for mint+withdraw (60s TTL) but NOT convert; no reusable fx_quotes entity | config.ts:592-594 | P0 |
| FX-16 | `ensureWallet` silently ignores requested currency on existing wallet | index.ts:3217-3248 | P1 |
| FX-17 | Live sync covers only ~8 at-par corridor currencies, not the 45-currency registry | index.ts:11186-11203 | P1 |
| FX-18 | Wise integration exists but only platform revenue sweep, not user-facing | index.ts:10995-11045 | P2 |
| FX-19 | No rate alerts / rate history (fx_rates dead; price_alerts is listings-only) | migrations 015/060 | P2 |
| FX-20 | Remittance compliance: no purpose codes / LRS / corridor reporting | grep zero hits | P2 |
| FX-21 | Frontend: 9 display currencies, static fallback rates, convert screen is 1ZE→fiat only | currencies.ts, WalletConvertScreen | P1 |
