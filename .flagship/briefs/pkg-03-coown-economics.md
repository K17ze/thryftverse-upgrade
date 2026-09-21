# PKG-03 — Co-Own economics: FX, segments, lockup, DRIP atomicity, alert lifecycle

Repo root: C:/Users/User/Desktop/thryftverse-upgrade (HEAD 76c0733). Audit: ThryftVerse-Post-Upgrade-Audit-2026-09-20.md Appendix A.

## Findings to close

### FIN-02 (High) — currency conversion unsound
`backend/api/src/routes/coOwn.ts:654-655` converts GBP notional to 1ZE via ×1000 (milli-GBP assumption). DRIP `workers/handlers/coOwnDripExecutionHandler.ts:247-258` retains the same assumption. Wallet pricing is USD-anchored (`lib/pricingEngine.ts:1-8,567-578`; migration `db/migrations/217_atpar_pricing_engine.sql:20-29`). Determine the ACTUAL unit contract (read pricingEngine + migrations + wallet ledger conventions) and implement one versioned quote/conversion path shared by trade and DRIP — explicit currency pair, rate version, rounding rule.

### FIN-05 (High) — trading/DRIP bypass segment accounting
`coOwn.ts:694-749` and `coOwnDripExecutionHandler.ts:288-342` mutate wallets/ledger directly without segment accounting. index.ts:3254-3321 leaves surplus segments intact and repairs deficits as purchased units — purchased/earned provenance diverges after trading. Route every balance change through the segment-aware primitive so purchased/earned segments stay consistent.

### FIN-06 (High) — DRIP conditional issuer credit → unbalanced ledger
`coOwnDripExecutionHandler.ts:320-346`: credits issuer only `if (issuerWallet)`, then creates settled trade/holdings. Missing issuer wallet leaves buyer debit committed with no issuer/suspense credit. Fix: missing counteraccount must roll back the whole distribution leg OR post to an explicit suspense account — never an unbalanced settled state.

### FIN-07 (High) — lockup not enforced
`coOwn.ts:863-890` capability lookup selects only is_open/available_units + exit/halt. Lockup serialized at :6279-6280 but never enforced on execution paths. Enforce lockup server-side on every trade/transfer entry: read the lockup record, reject with a clear error while locked.

### SEP20-FIN-11 (Medium) — alert event schema rejects null tradeId
Evaluator `workers/handlers/coOwnAlertEvaluatorHandler.ts:109-143` returns tradeId:null for appraisal-price alerts; drain schema `workers/handlers/outboxDrainHandler.ts:989-998` declares `tradeId: z.string().optional()` — Zod rejects legitimate null before notification; alert already deactivated+marked triggered in evaluator tx (:194-232), so retries never deliver. Fix: agree nullable execution reference (e.g. `tradeId: z.string().nullable().optional()`) and disclose mark provenance in the notification copy.

### SEP20-FIN-12 (Medium) — re-armed alerts cannot emit second notification
PATCH `coOwn.ts:1014-1024` clears triggered_at on reactivate; evaluator dedups by lifetime alert ID (:212-213); `lib/domainOutbox.ts:73-79` conflict returns the old event; notification dedup uses lifetime alert ID (outboxDrainHandler.ts:1016). Fix: introduce a persistent activation sequence/UUID (column on the alert, incremented on re-arm) carried into outbox event ID + notification dedup key. Exactly-once per activation preserved.

### SEP20-FIN-13 (Medium) — DRIP failure receipt not atomic
Catch path calls `markDistributionFailedStandalone` (:463-466); helper does pool UPDATE status='reinvest_failed' (:588-596) and SEPARATE `emitDripReceiptEvent` (:598-600) — two autocommit ops. Crash between → terminal failed distribution with no receipt, never repaired. Fix: wrap failure transition + outbox append in one connection/transaction.

### SEP20-FIN-14 (Medium) — retained-cash receipt claims cash that doesn't exist
DRIP marks `retained_cash` when `balanceUnits < dripDebit1zeUnits` (:270-285); drain text claims "Distribution paid as cash"/"stays in your balance as cash" (outboxDrainHandler.ts:1040-1050) with no cash credit. Fix copy to state the true state — "not reinvested" vs "credited and available" — citing actual ledger evidence; if funding is unverified, say so.

## File ownership
- EXCLUSIVE: `backend/api/src/routes/coOwn.ts`, `backend/api/src/workers/handlers/coOwnDripExecutionHandler.ts`, `backend/api/src/workers/handlers/coOwnAlertEvaluatorHandler.ts`, `backend/api/src/workers/handlers/outboxDrainHandler.ts` (only the ~980-1080 alert/DRIP region unless you find same-file helpers), `backend/api/src/lib/domainOutbox.ts`, `backend/api/src/lib/pricingEngine.ts` (extend, don't rewrite), any NEW test/migration files.
- LEASED index.ts region: ~3254–3321 (segment repair path) only.
- New migration needed? Create next-numbered file in `backend/api/src/db/migrations/` following existing naming; keep it additive/idempotent.

## Constraints
- No new deps. Reuse walletMoneyPath's reservation-aware primitive IF it exists after your read (another agent is building it — design for its interface but do not block on it: keep your own correct reservation check if integrating would couple you to in-flight work; note the seam in your report).
- Tests under `backend/api/src/__tests__/` with existing fake-db patterns: missing issuer wallet → no unbalanced settled state; re-arm → second delivered alert with distinct trigger record; null-tradeId event passes schema and notifies; fault between UPDATE and event append → atomic rollback; lockup rejects server-side; segment parity after a trade and a DRIP.
- `npx tsc --noEmit -p tsconfig.json` clean for your files. Do NOT run full suite. Do NOT commit.

## Report
`.flagship/reports/pkg-03-report.md`. Return: status, files changed, one-line test summary.
