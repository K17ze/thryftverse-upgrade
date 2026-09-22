# Repair — Sep-21 Audit P3: Search platform (S2 lease, §4.7 telemetry, catch-up cap)

Scope owned: `backend/api/src/lib/searchSync.ts`, `backend/api/src/lib/searchAdapter.ts`
(write-outcome exposure only), `backend/api/src/lib/metrics.ts`,
`backend/api/docs/grafana-alerts.yml`, `backend/api/docs/METRIC_DICTIONARY.md`,
`backend/api/src/db/migrations/338_search_reindex_lease{,_down}.sql`,
`backend/api/src/__tests__/searchReindexLease.test.ts`.

Status: **complete** — `npx tsc --noEmit` clean, focused node:test file green (10/10),
adjacent search suites green (23/23: searchAdapterDegradation, searchPublicVisibility,
searchScoped). Not committed.

---

## Finding S2 (P1) — session advisory lock through transaction-pool PgBouncer

**Defect:** `reindexListingsBlueGreen` held `pg_try_advisory_lock` on a checked-out
`dbPool.connect()` client for the whole run. Production routes all DB traffic through
PgBouncer `POOL_MODE=transaction` (root `docker-compose.yml:58`), where a node client
does not pin a server session — the lock could leak onto a pooled backend or unlock on
a different session, and the unlock boolean was ignored.

**Fix — durable fenced lease** (`search_reindex_lease`, migration
`338_search_reindex_lease.sql` + `_down.sql`):

- Schema: `name TEXT PRIMARY KEY, holder TEXT, fence BIGINT, acquired_at, expires_at`.
- **Acquire** (`acquireReindexLease`, `searchSync.ts:566`): ONE atomic
  `INSERT ... ON CONFLICT (name) DO UPDATE ... WHERE expires_at < now() OR holder = $2
  RETURNING fence` — correct under transaction pooling because the statement is its own
  transaction; no session affinity is ever required. `holder` is `pid{n}-{uuid}` per
  attempt. `rowCount=0` → `reindex_in_progress` (route still maps to 409); DB error →
  `reindex_lock_unavailable` with a migration-338 hint. The run NEVER proceeds
  unprotected.
- **Heartbeat** (`renewReindexLease`): `UPDATE ... WHERE name AND holder AND fence`
  every `leaseHeartbeatMs` (default 30s; clamped below TTL/2), TTL default 5 min.
  `rowCount=0` = definitive loss → `leaseState.lost`, `heartbeat_lost` metric; a query
  error is transient and only stales `lastConfirmedAt`.
- **Pre-swap guard** (`assertLeaseHeld`, invoked before `swapIndexes` and before the
  catch-up replay): aborts with `reindex_lease_lost` / `reindex_lease_unconfirmed`
  when the lease changed hands or heartbeats have not confirmed ownership within the
  TTL — a stale/competing run can never repoint the live index.
- **Release** (`releaseReindexLease`): `DELETE ... WHERE name AND holder AND fence`
  with `rowCount` verified; 0 rows = lease already expired/re-acquired (warn +
  `release_missed`), never a competitor's row. Crash recovery is via `expires_at`.
- New metric `thryftverse_search_reindex_lease_total{outcome}` records
  acquired/contended/acquire_error/heartbeat_lost/released/release_missed/release_error;
  `SearchReindexLeaseLost` alert added.

## Finding §4.7 — freshness telemetry measured submission, not visibility

**Defect:** `syncSingleListing` recorded `ok` + lag immediately after
`adapter.index()` — which resolves at Meilisearch TASK SUBMISSION, or via the
process-local fallback after remote failure. The lag histogram was a submission
metric mislabeled as visibility.

**Fix — honest outcome dimension, same series names:**

- `SearchAdapter.index/remove` now return `SearchIndexWriteResult`
  (`{ outcome: 'remote'|'local', taskUid? }`); `addDocuments`/`deleteDocument` taskUids
  are propagated. In-memory/placeholder adapters return `local` truthfully.
- `thryftverse_search_index_lag_seconds` gains an `outcome` label:
  `submitted` (enqueue ack — kept, honestly named), `completed` (true visibility lag,
  measured when the task confirms), `fallback` (local write). Metric name unchanged so
  existing dashboards keep working.
- `thryftverse_search_sync_total` gains `outcome ∈ submitted|completed|failed|fallback`
  while retaining `result` for backwards compatibility.
- `confirmIndexWrite` (`searchSync.ts:553`) polls `/tasks/{taskUid}` detached
  (10s budget, never blocks request paths — callers `void` it), records `completed`
  + visibility lag on success, `failed` on terminal task failure, re-reads the task
  once on poll failure so a timed-out poll on a succeeded task still counts as
  completed; unconfirmed tasks stay `submitted`.
- `grafana-alerts.yml`: `SearchIndexStale` now reads `outcome="completed"`; new
  `SearchIndexWriteStalled` (submitted≫completed for 15m — a stalled task queue can no
  longer hide behind submission metrics) and `SearchSyncFallbackActive` (sustained
  fallback writes). `METRIC_DICTIONARY.md` §7 documents all label semantics.

## Finding — post-swap catch-up capped at 1000 rows

**Defect:** `syncListingsChangedSince` ran a single `LIMIT 1000` query and warned —
a change window >1000 rows silently left the swapped index incomplete.

**Fix — keyset pagination to convergence** (`searchSync.ts:866`, now exported for
tests): pages `(updated_at, id) > (cursor)` in 500-row batches until a short page
signals convergence; logs progress per page. Safety bound `CATCH_UP_MAX_BATCHES=500`
(250k rows) — on breach it returns `complete: false` and logs an **error**; the run
reports `catchUpComplete: false` on `BlueGreenReindexResult` instead of truncating
silently. Mid-pagination query failure also returns `complete: false`.

## Files changed

- `backend/api/src/db/migrations/338_search_reindex_lease.sql` / `_down.sql` (new)
- `backend/api/src/lib/searchSync.ts` — lease helpers + acquire/heartbeat/guard/release,
  `confirmIndexWrite`, paginated catch-up, `catchUpComplete` on result
- `backend/api/src/lib/searchAdapter.ts` — `SearchIndexWriteResult`, taskUid propagation
- `backend/api/src/lib/metrics.ts` — `outcome` labels on both search series,
  `thryftverse_search_reindex_lease_total`, `recordSearchReindexLease`
- `backend/api/docs/grafana-alerts.yml` — #9 reads completed lag; +9b/9c/11 alerts
- `backend/api/docs/METRIC_DICTIONARY.md` — §7 rows rewritten for honest semantics
- `backend/api/src/__tests__/searchReindexLease.test.ts` — rewritten for the lease SQL
  contract + catch-up pagination

## Tests

`searchReindexLease.test.ts`: **10/10 pass** — contention fail-fast, single-statement
atomic acquire contract (expired-or-same-holder predicate, `fence+1`, RETURNING),
holder+fence-matched release, heartbeat renewal mid-run, acquisition-error refusal,
lease-loss non-crash, catch-up keyset convergence (502 rows across 2 pages), and
incomplete-not-truncated on mid-pagination failure.

**Residual:** fake-pool tests assert the SQL/behaviour contract; they cannot prove
pool topology. Live acceptance still requires two concurrent admin/scheduled reindexes
through the deployed transaction-pool PgBouncer, holder-crash/expiry recovery, and a
>1000-row change window against real Meilisearch.
