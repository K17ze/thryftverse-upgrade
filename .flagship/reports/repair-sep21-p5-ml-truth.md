# Repair — Sep-21 Audit P5: ML/vendor truthfulness & operational gaps

Scope owned: `backend/api/src/lib/costTelemetry.ts`,
`backend/api/src/lib/aiUsage.ts`, `backend/api/src/lib/metrics.ts`,
`backend/api/src/config.ts`, `backend/api/src/routes/bots.ts`,
`backend/api/src/botRuntime/index.ts`, `backend/ml-service/app/main.py`,
`backend/ml-service/README.md`,
`backend/api/src/lib/mediaEmbeddings.ts`,
`backend/api/src/workers/handlers/mediaEmbedding{Handler,Utils}.ts`,
`backend/api/src/support/vendorAdapter.ts`,
`backend/api/src/workers/handlers/vendorSyncHandler.ts`,
`backend/api/src/lib/queues.ts`, `backend/api/src/workers/index.ts`,
`backend/api/src/index.ts`, `frontend/src/services/costTelemetryApi.ts`,
plus the owned `src/__tests__/` files. `routes/recommendations.ts` was NOT
touched (ownership boundary).

Status: **DONE** — `npx tsc --noEmit` clean; focused node:test green
(80/80 owned-scope files: aiUsageBudget 7, costTelemetry 6,
vendorSyncHandler 11, mediaEmbeddingPgvector + mediaEmbeddingStatus 56);
infraOps 3/3; focused vitest 78/78 (mediaContract, mediaPipeline,
vectorSearchIntegration, visualSearchRoute); ml-service
`python -m unittest discover -s tests -v` 12/12. Full node:test suite
1520/1524 — the 4 failures are in other lanes' owned files
(auctionPaymentSettlement, postgresRestoreGuard ×3,
backendWorkflowClosure upload-finalization timeout under no-Redis env);
none touch this repair's files.

## Per-finding status

1. **Cost telemetry units — FIXED.** `costMinor` emitted raw micro-USD for
   USD ledgers; now `costMicrosUsd` carries the micros and `costMinor` is
   reserved for true ISO-4217 minor units (GBP pence for promotions).
2. **AI budget admission — FIXED.** `RESERVE_AI_QUOTA_SCRIPT` now does an
   atomic check-and-reserve (INCRBY on the daily bucket inside the same
   Lua eval); `recordAiUsageEvent` settles the delta (top-up/refund) onto
   the reservation's own bucket. 20-request burst test: 3 admitted,
   17 budget-blocked at $1.00 cap with $0.30 reservations.
3. **ML health honesty — FIXED.** `/health` and `/shadow/status` report
   `capability_level ∈ {heuristic_baseline, shadow_loaded, serving_champion}`
   driven by `champion.is_trained` + `shadow_loaded`; a loaded shadow can
   never be reported as the serving champion, and `trained_models` is only
   true when a trained model IS the champion. 503-on-missing-production-
   token guards unchanged.
4. **Embedding promotion governance — FIXED.** `resolveServingEmbeddingLineage`
   LEFT JOINs `model_artifacts` (migration 144, scoped `task='visual_search'`,
   full model_id+model_version+preprocessing_version identity): blocked/
   retired artifacts are excluded outright; an `active` (approved)
   artifact outranks every unapproved lineage regardless of coverage.
5. **Vendor delivery wiring — DRAIN WIRED; NO PRODUCER EXISTS.**
   `claimVendorOutboxBatch` (FOR UPDATE SKIP LOCKED claim + stale-lease
   reclaim back to pending, or skipped at the attempt ceiling) now drives
   `processVendorSyncJob`; the `vendor_sync` job is registered on the infra
   queue in `queues.ts` with a dynamic-import fallback, wired in both the
   standalone worker (`workers/index.ts`) and the inline worker set
   (`index.ts`), plus a 30s `startVendorSyncScheduler` backstop.
   **Limitation:** no real producer call site exists — `enqueueVendorEvent`
   is defined but invoked nowhere in support case/conversation/handoff
   services. The drain is live and correct; when the first real event
   source lands it calls `enqueueVendorEvent` + `enqueueVendorSyncJob`.
   (Adjacent gap, unchanged: `support_vendor_inbox` also has no registered
   drain — out of this finding's scope but worth flagging.)
6. **Placeholder embeddings — FIXED.** `embeddingServingStatus(placeholder,
   norm)` is the single write-side status arbiter: zero/NaN/∞ norm or a
   placeholder flag can never produce `status='ready'`, and the handler
   stamps `quality_flags.placeholder`/`zero_norm` + logs
   `mediaEmbedding.zero_norm_forced_placeholder` when the norm guard
   overrides an unflagged degenerate vector. Serving predicates
   (`status='ready' AND norm>0`) already held in migrations 181/326 and in
   `nearestMediaEmbeddings`; regression tests pin both layers.

## Detail

### F1 — costMinor scale

`tokenCostSpec` mapped `cost_microusd` into both `costUsd` and `costMinor`,
mislabeling micros by four orders of magnitude (1 USD minor = 10,000
micros). `DomainCostTelemetry` gained `costMicrosUsd` (raw ledger micros);
`costMinor` is now null for USD domains and still carries GBP pence for
`promotions`. Frontend type updated; `costMinor` has no rendering consumer
— the only reader was the type declaration itself.

### F2 — AI budget reservation

- Lua: `dailySpend + reservation > budget → reject` happens BEFORE the
  rate-limit checks and the INCRBY, so a burst cannot all pass on stale
  recorded spend. Negative drift is clamped (`math.max(0, …)`).
- Reservation size: `AI_SPEND_RESERVATION_MICROUSD` env override, else
  derived from configured pricing over 8,192 nominal input tokens +
  `OPENAI_AGENT_MAX_OUTPUT_TOKENS`. Returns 0 when pricing is unconfigured
  (no meaningful cost to reserve; the cap is inert anyway).
- Settlement in `recordAiUsageEvent`: `delta = actual − reserved` on
  success, `−reserved` on failure, nothing when no reservation was held
  (legacy callers unchanged). Settlement targets `spendKey` captured at
  admission — midnight-rollover requests reconcile to the booking day.
- Crash between admission and settlement leaks at most one reservation per
  request until the 48h bucket TTL — bounded over-count, never under-count.
- Metric: `thryftverse_ai_spend_reservations_total{action=reserved|
  budget_blocked|settled|refunded}`.

### F3 — health honesty

`_serving_state(registry)`: `serving_champion` iff `champion.is_trained`,
`shadow_loaded` iff a ready challenger is attached, else
`heuristic_baseline`. `/health` also exposes `serving_champion_model_id`,
`..._version`, `..._trained`. `/shadow/status` gained the same fields.
README corrected (it documented `trained_model` on shadow load). The
`capability_level` enum consumers in `routes/recommendations.ts` and
`schemas.py` describe the DECISION payload (`decision.capability_level`,
unchanged) — no consumer parses `/health`'s field.

### F4 — promotion governance

One statement: ready+norm>0 lineages LEFT JOIN `model_artifacts` on
`model_id+model_version+preprocessing_version` AND `task='visual_search'`
(scoped so a colliding model_id registered for fraud_scoring cannot govern
visual-search lineage; PK is (model_id, model_version) so ≤1 row joins).
`ma.status IN ('blocked','retired')` rows are excluded in WHERE; ORDER BY
`CASE WHEN ma.status='active' THEN 0 ELSE 1 END` makes the promoted
champion beat any higher-coverage unapproved lineage; coverage/`latest_at`
ordering is unchanged within a governance tier. Ungoverned lineages
(candidate/shadow/no registry row) remain eligible below the champion so a
first-ever (never-registered) lineage is not locked out. Test pins the SQL
contract (join keys, exclusion set, ordering).

### F5 — vendor drain

- `claimVendorOutboxBatch(db, vendor, limit, {staleLeaseMs, maxAttempts})`:
  (1) reclaim UPDATE — expired `delivering` leases (COALESCE
  `last_attempt_at, updated_at` older than the lease window) return to
  `pending` consuming an attempt, or dead-letter to `skipped` at the
  ceiling; (2) claim — one `UPDATE ... FROM (SELECT ... FOR UPDATE SKIP
  LOCKED) ... RETURNING` sets `delivering` + lease stamp. `attempts`
  counts failed deliveries + reclaimed leases; the handler dead-letters at
  `attempts >= 5` without calling the vendor.
- `processVendorSyncJob` uses the claim (no more select-then-mark race).
- Queue: `VendorSyncJobData` on `InfraJobData`, `vendor_sync` dispatch in
  the infra worker (dynamic-import fallback so the handler resolves even
  if an inline worker set omits it), `enqueueVendorSyncJob(vendorName)`
  with a 30s-bucketed jobId dedupe.
- Schedulers: `startVendorSyncScheduler` enqueues drains for
  `SUPPORT_VENDOR_NAMES` (`intercom`, `zendesk`) every 30s in both run
  modes; `stopVendorSyncScheduler` on shutdown.
- Producer reality: `enqueueVendorEvent` has zero call sites — verified by
  grep across `src/support/*Service.ts` and routes. Not fabricated; the
  adapter docstring now documents the producer contract
  (enqueueVendorEvent → optional enqueueVendorSyncJob kick; scheduler is
  the backstop).

### F6 — zero-norm guard

`embeddingServingStatus(placeholder, norm)` → `'placeholder'` unless a
non-placeholder vector has finite norm > 0. Both INSERT paths (BYTEA-only
and pgvector dual-write) store this status; the unsafe ternary is gone
(asserted absent in the source). `nearestMediaEmbeddings`,
`resolveServingEmbeddingLineage`, the serving views, and
`recommendations.ts` anchor reads all predicate `status='ready' AND
norm>0`, so the write guard and the read filter are now mutually
reinforcing — a zero vector can neither be written ready nor served.

## Commands run

- `cd backend/api && npx tsc --noEmit` — clean.
- `node --import tsx --test` on aiUsageBudget, costTelemetry,
  vendorSyncHandler, mediaEmbeddingPgvector, mediaEmbeddingStatus,
  infraOps — 83 pass / 0 fail.
- `npx vitest run` mediaContract, mediaPipeline, vectorSearchIntegration,
  visualSearchRoute — 78 pass / 0 fail.
- `npm test` (full node:test, 114 files) — 1520 pass / 4 fail, all
  failures outside this lane's owned files (see Status).
- `cd backend/ml-service && python -m unittest discover -s tests -v` —
  12/12 (installed fastapi/uvicorn/numpy/pydantic/httpx locally to run;
  lightgbm intentionally absent — loader fails closed).
