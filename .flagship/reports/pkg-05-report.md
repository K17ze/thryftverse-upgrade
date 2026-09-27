# PKG-05 Report — Search/vector correctness: credentials, fallback corpus, ANN lineage/order, migration overflow

Repo root: `C:/Users/User/Desktop/thryftverse-upgrade` (HEAD `76c0733`, branch `feat/product-detail-contract-media-device-closure`)
Audit source: `ThryftVerse-Post-Upgrade-Audit-2026-09-20.md` Appendix C (B6, N1–N5, reindex design-risks, items-all trust gap)

## Status: CLOSED — all findings resolved; typecheck clean for owned files; 60/60 focused tests pass.

Resume-mode pass: a prior agent had landed the bulk of the implementation. This pass audited every diff against the brief, closed four remaining gaps (two missed `MEILISEARCH_KEY` readers, missing prod api-service env wiring, a dead-on-arrival Meilisearch SDK import, missing settings-task-verification tests), re-ran typecheck and all four referenced suites, and produced this report.

## Per-finding closure

| Finding | Resolution |
|---|---|
| B6 — search key env mismatch | Canonical `MEILISEARCH_KEY`, legacy `MEILISEARCH_API_KEY` accepted via `meilisearchApiKey()` (`lib/meilisearchConfig.ts:19-26`, mirrored by `config.ts:596-604`). Every reader routed through it: `searchAdapter.ts:250`, `meilisearchConfig.ts:204`, `searchSync.ts:137,187,732`, and — fixed this pass — `vectorSearch.ts:71,109` (embedder client + readiness probe still read the raw env). Compose/env aligned: root `docker-compose.yml:225` keeps `MEILISEARCH_API_KEY` (alias resolves it); `docker-compose.prod.yml` worker block declares canonical `MEILISEARCH_KEY` with `MEILISEARCH_API_KEY` fallback (`:248-252`); **this pass added the same block to the prod api service (`:206-210`)** — it had no search env at all, so the production API would have silently served only the in-memory index. `backend/api/.env.example:342` already documents `MEILISEARCH_KEY`. |
| N1 — pgvector backfill int4 overflow | `326_media_embeddings_pgvector.sql:67-70` promotes each `get_byte(...)` term `::bigint` before the `* 16777216` multiply. Companion `330_media_embeddings_bytea_codec_bigint.sql` CREATE OR REPLACEs the decoder for DBs where 326 is already applied, re-runs the `embedding_vec IS NULL` backfill predicate, stays feature-detected (no-op without pgvector/embedding_vec); down file is a deliberate no-op (reverting restores the corrupt codec). JS-side codec test mirrors the arithmetic — negative float32s decode exactly. |
| N2 — ANN mixes incompatible lineages/dimensions | `resolveServingEmbeddingLineage` (`mediaEmbeddings.ts:253-289`) picks the dominant ready `(model_id, model_version, preprocessing_version, dimensions)` tuple. `recommendations.ts` anchor SELECT pins all four params + `generated_at DESC` tiebreak; each decoded anchor is length/finite/dims-validated before seeding a query (cross-space anchors skipped); `nearestMediaEmbeddings` gained a `dimensions` filter and the call pins the full lineage. `nearestMediaEmbeddings` also rejects non-finite/zero vectors and routes non-512-dim queries to the BYTEA scan (`degradedReason: 'dimension_mismatch'`) where the per-row `row.dimensions !== query.length` check enforces comparability. |
| N3 — fallback index never receives successful writes | `MeilisearchSearchAdapter` now mirrors every index/delete into the bounded process-local fallback on BOTH success and failure (`searchAdapter.ts:321-392`), insertion-ordered with `FALLBACK_MIRROR_CAP = 10_000` eviction; mirror failures warn, never throw. `indexIntoLocalFallback` + `syncListingsToLocalFallback` (`searchSync.ts:362-406`) page `status = 'active'` rows into the fallback; the leased index.ts warmer (`:38845-38855`) primes it at boot when the shared backend is healthy, so a mid-session outage serves a coherent corpus. Tests cover write→outage→found, remote-success→outage→found, delete→outage→absent. |
| N4 — ANN rank order lost before source_rank | `mapNeighbourAssetsToListings` (`mediaEmbeddings.ts:301-341`) carries `(asset_id → best distance)` pairs through `unnest(...) WITH ORDINALITY`, aggregates `MIN(distance)` per listing, orders `best_distance ASC, MIN(ann_rank) ASC`. `recommendations.ts` accumulates best-per-asset distances across anchors, feeds the ranked ids to `array_position` so `source_rank` is the true ANN rank; misleading comment rewritten. |
| N5 — capability claims ANN from column alone | `mediaEmbeddingVectorCapability` (`mediaEmbeddings.ts:193-229`) probes `pg_indexes` for an `hnsw`/`ivfflat` index on `embedding_vec` → `'ann' | 'exact' | 'none'` (fails closed to `'none'`). `method` gains `'pgvector_exact'`; a no-index deployment reports exact scans, never ANN. |
| Reindex concurrency + task verification | `reindexListingsBlueGreen` (`searchSync.ts:729-790`) acquires `pg_try_advisory_lock(20260823, 7)` on a dedicated pool client for the whole run — admin route, hourly worker, and scripts all serialise; contention returns `reindex_in_progress` (route maps to 409 at `routes/search.ts:717`); lock released + client returned in `finally`. `pollMeilisearchTask` extracted to `meilisearchConfig.ts:32-60`; `MeiliConfigureOptions.awaitTasks` makes every `update*` settings task part of swap acceptance — `configureSearchIndex` tracks all four settings task uids and polls them (`searchSync.ts:100-145`), the typo/synonym/localized helpers poll their own task and rethrow, and the staged index configure passes `awaitTasks: true` (`searchSync.ts:858-862`) so a failed/pending settings task aborts before the swap. |
| `/search items/all` trust gap | Serving-time safety filter (`routes/search.ts:418-450, 518-536`): every index-returned id is re-checked against live listings `AND l.status = 'active'`; ids absent from the lookup (sold/paused/deleted) are dropped, never rendered — applied to both the fused `all` leg and the `items` path. Item leg always over-fetches (`limit + offset + 50`, capped 200) from offset 0 and slices after filtering so the page stays full. |

## Additional gaps closed this pass

- **Dead Meilisearch SDK import** (`meilisearchConfig.ts:180-213`, `searchAdapter.ts:274-288`): both loaders used only `mod.MeiliSearch`, but the installed `meilisearch@0.60` exports `Meilisearch` (renamed at ≥0.35 — `vectorSearch.ts` already handled both). Every `loadMeiliClient`/`initClient` call threw `MeiliSearch is not a constructor`, meaning index settings could never be applied and the adapter could never reach a real backend. Both now accept either export.
- **Settings-task verification tests**: appended to `searchReindexLease.test.ts` — `pollMeilisearchTask` resolves on `succeeded` / rejects on `failed`; `configureSearchIndex(..., { awaitTasks: true })` rejects on an unreachable backend while the fire-and-forget call still resolves (regression against the old swallow-everything contract).

## Files changed (owned scope)

| File | Change |
|---|---|
| `backend/api/src/lib/meilisearchConfig.ts` | `meilisearchApiKey()`, `pollMeilisearchTask()`, `MeiliConfigureOptions` + `awaitUpdateTask` on all three settings helpers, `Meilisearch` export fallback. |
| `backend/api/src/lib/searchAdapter.ts` | Canonical key via `meilisearchApiKey()`; success+failure fallback mirroring with 10k cap; `indexIntoLocalFallback`; `Meilisearch` export fallback. |
| `backend/api/src/lib/searchSync.ts` | Advisory-lock lease wrapping `reindexListingsBlueGreen`; settings task tracking + `awaitTasks` polling; `syncListingsToLocalFallback`; `pollMeilisearchTask` dedupe. |
| `backend/api/src/lib/mediaEmbeddings.ts` | `mediaEmbeddingVectorCapability`, `resolveServingEmbeddingLineage`, `mapNeighbourAssetsToListings`, `dimensions` filter, `pgvector_exact` method, `dimension_mismatch` degradedReason, finite/length/dims validation. |
| `backend/api/src/lib/vectorSearch.ts` | Two raw `MEILISEARCH_KEY` reads → `meilisearchApiKey()` (B6: every reader aligned). |
| `backend/api/src/routes/recommendations.ts` | Lineage-pinned anchor SELECT + neighbour filter, anchor validation, rank-preserving listing mapping. |
| `backend/api/src/routes/search.ts` | `status='active'` serving-time re-check on both items paths; stale-id drop; offset-slice-after-filter; 409 on `reindex_in_progress`. |
| `backend/api/src/index.ts` (leased ~38845-38855 only) | Fallback priming via `syncListingsToLocalFallback` when the shared backend is healthy. |
| `backend/api/src/db/migrations/326_media_embeddings_pgvector.sql` | Per-term `::bigint` promotion in the BYTEA→float4 codec. |
| `backend/api/src/db/migrations/330_media_embeddings_bytea_codec_bigint.sql` (+`_down`) | NEW: CREATE OR REPLACE corrected codec + backfill re-apply; down is a deliberate no-op. |
| `docker-compose.prod.yml` (search env lines only) | Worker + api service: `MEILISEARCH_URL`/`MEILISEARCH_KEY` (with `MEILISEARCH_API_KEY` fallback)/`MEILISEARCH_INDEX`. |
| `backend/api/src/__tests__/searchReindexLease.test.ts` | NEW: lease fail-fast/release/error paths + settings-task verification tests. |
| `backend/api/src/__tests__/{mediaEmbeddingPgvector,retrievalSourceContract,searchAdapterDegradation}.test.ts` | Extended: codec decode, capability probe, lineage resolution, ordinality join, fallback coherence, ANN contract assertions. |

## Tests run

- `npx tsc --noEmit -p tsconfig.json` (backend/api) — **0 errors in owned files**. The only repo error is `src/routes/coOwn.ts:5605` (missing `settlement` arg) — another agent's in-flight file, outside this scope.
- `node --import tsx --test src/__tests__/searchReindexLease.test.ts src/__tests__/searchAdapterDegradation.test.ts` — **15/15 pass**.
- `node --import tsx --test src/__tests__/mediaEmbeddingPgvector.test.ts src/__tests__/retrievalSourceContract.test.ts` — **45/45 pass**.
- Old-behavior regression coverage: fallback-mirror test fails against write-on-failure-only adapters; `awaitTasks` test fails against the swallow-all configure path; capability probe fails against column-presence reporting; ordinality-join and lineage-pin contract tests fail against the old `DISTINCT`/`ANY` shapes; the bigint codec test fails under int4 arithmetic (128×16777216 overflow).

## Notes / handoff

- `docker-compose.yml:225` and `backend/docker-compose.production.yml:302,421` still pass `MEILISEARCH_API_KEY` — safe (legacy alias resolves it), but standardising them to `MEILISEARCH_KEY` in a future cleanup would remove the dual-name surface.
- The advisory lock keys `(20260823, 7)` are distinct from the migration runner's pair; documented in `searchSync.ts`.
- `initClient` sets `backendReachable = true` on client construction without a connectivity probe — pre-existing wart, surfaced honestly via `retrievalInfo()`/`/search/health` only after the first failed call. Left as-is (out of findings scope).
