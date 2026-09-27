# PKG-05 — Search/vector correctness: credentials, fallback corpus, ANN lineage/order, migration overflow

Repo root: C:/Users/User/Desktop/thryftverse-upgrade (HEAD 76c0733). Audit: ThryftVerse-Post-Upgrade-Audit-2026-09-20.md Appendix C.

## Findings to close

### B6 — search key env mismatch
`backend/api/src/lib/searchAdapter.ts:234-237` and `lib/meilisearchConfig.ts:117-120` read `MEILISEARCH_KEY`; root `docker-compose.prod.yml:223-225` passes `MEILISEARCH_API_KEY`. Fix ONE canonical variable name (follow whichever the rest of the codebase/env examples standardize on — check .env.example files) and align every reader + every compose/env definition. NOTE: another agent owns docker-compose.prod.yml for other sections — you may edit ONLY the search env lines (~:220-230) there.

### N1 (P1 conditional) — pgvector backfill integer overflow
`backend/api/src/db/migrations/326_media_embeddings_pgvector.sql:67-70` reconstructs float32 via `get_byte(...) * 16777216` in int4 arithmetic; high byte ≥128 (any negative float) overflows int32 before the bigint assignment. Fix: promote arithmetic to bigint BEFORE multiplication (e.g. `get_byte(...)::bigint * 16777216` per-term, then combine and convert two's-complement to signed). Keep the migration idempotent; if it's already marked applied on real DBs, ALSO provide a companion fix migration that replaces the function (CREATE OR REPLACE) so later extension installs get the corrected decoder — name it 327_* following conventions.

### N2 (P2) — ANN mixes incompatible model lineages/dimensions
`routes/recommendations.ts:960-970` picks anchor embedding without model_id/model_version/preprocessing_version/dimensions; DISTINCT ON order is nondeterministic per asset; call at :975-978 omits lineage filter. `lib/mediaEmbeddings.ts:210-227` makes lineage constraints optional. Fix: carry explicit serving lineage (model_id + version + dims) into anchor selection and neighbor filter; validate vector length + finite values; a ready non-matching anchor must be skipped, not silently compared cross-space.

### N3 (P2) — fallback index never receives successful writes
`searchAdapter.ts:300-326` writes/removes hit the local fallback only on failure; startup warmer (index.ts:38566-38589 — LEASED to you) runs once from an early snapshot. Result: healthy operation builds no fallback corpus; outage returns empty/stale. Fix: mirror successful index/delete writes into the bounded local fallback (best-effort, size-capped, same visibility predicates), and/or implement a real SQL fallback query against listings with current visibility/status predicates — pick whichever the codebase architecture supports more honestly. Recovery must also reconcile: successful remote writes keep the fallback coherent.

### N4 (P2) — ANN rank order lost before source_rank recorded
`recommendations.ts:982-1000`: `SELECT DISTINCT target_ref_id ... WHERE media_asset_id = ANY(...)` has no ORDER BY; similarIds then follow arbitrary DB order; comment claims array_position preserves rank but input order was already lost. Fix: carry (asset_id, distance) pairs, map to listings via `WITH ORDINALITY` / VALUES join preserving rank, aggregate best distance per listing, sort explicitly. Update the misleading comment.

### N5 (P2) — capability metadata claims ANN when only column exists
`mediaEmbeddings.ts:229-257` reports pgvector_ann whenever embedding_vec exists; migration catches index-creation failures so a no-index deployment still advertises ANN. Fix: probe actual index availability (pg_indexes / EXPLAIN on the serving query shape) and report `ann` vs `exact` distinctly.

## File ownership
- EXCLUSIVE: `backend/api/src/lib/searchAdapter.ts`, `backend/api/src/lib/meilisearchConfig.ts`, `backend/api/src/lib/mediaEmbeddings.ts`, `backend/api/src/lib/searchSync.ts` (only if needed for reindex lock — see below), `backend/api/src/routes/recommendations.ts`, `backend/api/src/routes/search.ts`, `backend/api/src/db/migrations/326_*` and NEW `327_*`, NEW test files.
- LEASED: `backend/api/src/index.ts` lines ~38520–38600 (scheduler + warmer only). `docker-compose.prod.yml` lines ~218–230 (MEILISEARCH env only).
- ALSO in scope (from audit design-risks): add a DB/Redis lease around the reindex orchestration in `routes/search.ts:688-701` + `searchSync.ts` so admin and scheduled reindex can't race; make settings/task completion part of swap acceptance if the code path supports checking task status.
- `/search items/all` trust gap: add a serving-time safety filter (status/visibility re-check on returned IDs) at `routes/search.ts:421-440,511-519`.

## Constraints
- No new deps. Match existing code patterns (this codebase uses pg + meilisearch client + zod).
- Tests: extend/add under `backend/api/src/__tests__/` with existing fake-db/mock-client patterns. Cover: overflow-free decode (JS-side codec test for the SQL logic is acceptable since no psql — mirror the arithmetic), lineage-filtered neighbor query shape, distance-order preservation through mapping, fallback corpus coherence (write→outage→search returns the doc; delete→outage→absent), capability probe.
- `npx tsc --noEmit -p tsconfig.json` clean for your files. No full suite. No commit.

## Report
`.flagship/reports/pkg-05-report.md`. Return: status, files changed, one-line test summary.
