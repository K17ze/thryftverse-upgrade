# Known Gaps — Co-Own Surfaces

This file documents backend gaps identified during the Co-Own surface-to-system
review. The frontend surfaces these limitations to the user rather than
implying functionality that does not exist.

## U51: Co-Own Price Alert Evaluator / Delivery Consumer

**Status:** Implemented (B12 worker + delivery wiring completed).

**What exists:**
- CRUD endpoints for Co-Own price alerts (`GET/POST/DELETE/PATCH /co-own/price-alerts`).
- Periodic evaluator `evaluateCoOwnPriceAlerts`
  (`src/workers/handlers/coOwnAlertEvaluatorHandler.ts`), scheduled every 60s
  (`config.coOwnAlertEvaluatorIntervalMs`), running in both the standalone
  worker runtime and the in-process worker (`RUN_BACKGROUND_WORKERS`).
- Per-alert transaction with `FOR UPDATE` re-lock, crossing evaluation
  against the last **settled** `coown_trades` price (with `id DESC`
  tiebreaker) or the asset reference price, `active=FALSE` +
  `triggered_at` flip, and a `coown_price_alert_triggered` domain outbox
  event carrying `tradeId` — the authoritative execution reference.
- Outbox delivery: `coown_price_alert_triggered` is consumed by the domain
  outbox drain (`outboxDrainHandler.ts`) → `queueUserNotification` with a
  per-alert idempotency key, registered in `notificationEventRegistry`
  (push category `orderUpdates` via the `coown_` prefix).
- Re-arm semantics: `PATCH /co-own/price-alerts/:id` clears `triggered_at`
  when re-activating so a re-enabled alert is evaluated again.

**Remaining limitations:**
- Evaluation is polling-based (60s sweep), not per-trade event-driven.
  `applyCoOwnTransfer` does not emit a `coown.trade_settled` domain event;
  adding `RETURNING id` + outbox append in that transaction would enable
  immediate evaluation.
- Alerts are one-shot per arming (one trigger per activation), not per
  crossing — re-arming after a trigger requires explicit reactivation.
- `distribution`-settlement production still originates outside the API
  (see U53 note on upstream settlement).

## U53: DRIP Execution Consumer

**Status:** Implemented (B12 worker + receipt wiring completed).

**What exists:**
- DRIP enrollment endpoints (`GET /co-own/drip/enrollments`,
  `POST /co-own/drip/enroll`); enrollment persists per user+asset.
- Periodic execution consumer `processCoOwnDripReinvestment`
  (`src/workers/handlers/coOwnDripExecutionHandler.ts`), scheduled every
  300s (`config.coOwnDripExecutionIntervalMs`), running in both worker
  runtimes.
- Idempotent execution: each distribution is locked `FOR UPDATE` and only
  `status='settled'` rows are processed; outcomes are `reinvested`,
  `retained_cash`, or `reinvest_failed` with a durable `reference`.
- Execution semantics: buys whole units from the asset's `available_units`
  issuance pool at last settled trade price (else reference price),
  respects the 20-unit holding cap, debits the recipient's 1ZE wallet and
  credits the issuer, writes `wallet_ledger` rows with the deterministic
  tx id `coown_drip_{distribution_id}`, records a settled `coown_trades`
  row, and updates holdings/holder counts atomically.
- Durable receipt: `coown_drip_receipt` domain outbox event is appended in
  the same commit as the outcome transition (reinvested / retained_cash /
  reinvest_failed) and delivered to the user via the outbox drain +
  notification pipeline. Insufficient balance resolves to `retained_cash`
  rather than infinite retry; transient PG errors (serialization,
  deadlock, lock timeout, connection) are left for BullMQ retry.

**Remaining limitations:**
- Distribution settlement itself is produced outside the API — nothing in
  this codebase inserts or settles `coown_distributions` rows, and no API
  path credits the recipient's wallet with distribution cash. The
  consumer's wallet debit assumes that external credit; insufficient
  balance correctly resolves to `retained_cash`.
- Polling cadence (300s) rather than per-distribution event subscription.
- `reinvest_failed` distributions are terminal — there is no operator
  requeue path.
