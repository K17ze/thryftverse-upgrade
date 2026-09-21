# Backend Review — Adversarial Verification

**Date:** 2026-02-25
**Workspace root:** `C:/Users/User/Desktop/thryftverse-upgrade`
**Git root:** `C:/Users/User/Desktop/thryftverse-upgrade`
**Remote:** `https://github.com/K17ze/thryftverse-upgrade.git`
**Branch:** `feat/product-detail-contract-media-device-closure`
**HEAD:** `76c0733f8fca7424ad5bfb51c81d2a71a36e866f`
**Execution mode:** read-only review (no source files modified)

Scope: search fallback/ANN/reindex, moderation transport and gates, notification contracts, outbox/lifecycle behaviour, and the eight new regression tests. Comments and test names were treated as claims, not evidence.

---

## Verdict

**PASS-WITH-FINDINGS**

The campaign's core fixes are genuine under inspection: the local fallback mirror is primed at boot on both the healthy-shared-backend and degraded paths, mirrored on both write success and failure, and bounded at 10,000 documents; degraded mode is disclosed via `retrievalMeta`/`serveMode`/`/search/health`; the blue/green reindex is a real swap with a cross-process advisory lease, awaited settings tasks, and staged-index verification; the moderation gate is fail-closed across every write path found (upsert, PATCH, Seller Hub batch, Q&A); the ANN SQL preserves source rank; and the outbox producer/drain contracts are aligned with activation-scoped deduplication and nullable `tradeId`/`markSource`.

Three P1 defects remain: a non-public-status indexing divergence that leaks through `/search/semantic` and `/search/autocomplete`, a public detail-read bypass for `risk_pending` listings, and frontend notification contract drift for the five new event types.

No P0 findings.

---

## P1 — Must fix

### P1-1. `syncSingleListing` indexes `draft`/`paused` documents; `/search/semantic` and `/search/autocomplete` have no `status='active'` safety net

Indexing-side divergence:

- `backend/api/src/lib/searchSync.ts:247-256` — `syncListingsToSearchIndex` (full sync) selects `WHERE status = 'active'`.
- `backend/api/src/lib/searchSync.ts:373-383` — `syncListingsToLocalFallback` (boot priming) selects `WHERE status = 'active'` — the comment at 360-363 states the fallback "can never expose a listing the primary index would not".
- `backend/api/src/lib/searchSync.ts:318-329` — `syncSingleListing` removes only `deleted`/`sold` and indexes everything else: `draft`, `paused`, and `risk_pending` all land in Meilisearch AND the mirrored fallback (`searchAdapter.ts:365-380` mirrors every write).
- Callers explicitly evict `risk_pending` (`index.ts:17315-17316`, `19106-19107`) but route every other status — including `draft`/`paused` — into `syncSingleListing` (`index.ts:17317-17318`, `19108-19109`). So draft/paused docs accumulate in both indexes, diverging from the `status='active'` corpus the full sync and priming use.

Read-side coverage is partial:

- `/search` items leg: `routes/search.ts:518-535` re-checks every hit `WHERE id = ANY($1) AND status = 'active'` unconditionally — safe.
- `/search?scope=all`: `routes/search.ts:423-436` — same unconditional `l.status = 'active'` — safe.
- `/search/semantic`: `routes/search.ts:665-677` re-checks only `seller_id` for block filtering — **no status predicate** (`SELECT id, seller_id FROM listings WHERE id = ANY($1)`, line 667), and the filter even passes hits whose row no longer exists (`!sellerId || !excluded…`, line 674). `semanticSearch` itself adds no `status` filter either — `vectorSearch.ts:204-213` builds `searchOpts.filter` solely from caller-supplied filters. A `draft`/`paused` document indexed via `syncSingleListing` is returned publicly by hybrid search and by its lexical fallback path.
- `/search/autocomplete`: `routes/search.ts:577-580` — `adapter.autocomplete(q, limit)` with no re-check at all; non-public titles can surface as suggestions.
- `risk_pending` docs are guarded only by best-effort `void … .catch(() => {})` evictions (P2-3); a lost eviction leaves held, unreviewed text reachable through these same two routes.

**Fix:** make `syncSingleListing` match the corpus predicate (remove or skip non-`active` statuses rather than indexing them), and add the same `status = 'active'` re-check the lexical routes apply to `/search/semantic` and a status filter to autocomplete.

### P1-2. `GET /listings/:listingId` serves `risk_pending` listings publicly

- `backend/api/src/index.ts:17406-17413` — `NON_PUBLIC_STATUSES = new Set(['draft','paused','deleted'])`; `risk_pending` is absent, so a moderation-held listing's full title, description, price and seller are returned `200` to any unauthenticated viewer.
- This contradicts the hold contract written in the same file: `index.ts:16959-16966` ("the existing operator-visible hold every public surface already excludes") and `index.ts:18811-18815` ("the same operator-visible hold … excluded from every public surface that filters status='active'"). The detail endpoint is a public surface that gates by blocklist rather than `status='active'`, so the hold leaks through it.
- Impact: quarantined-for-review text remains servable via direct URL (shared links, seller-hub preview, previously indexed pages) while under review — the exact content the gate exists to hold.

**Fix:** add `risk_pending` to `NON_PUBLIC_STATUSES`, or invert the gate to an allowlist of `active`/`sold`.

### P1-3. Frontend notification contract has drifted from the five new backend event types

Backend is fully aligned — this is a backend-correct/frontend-stale drift:

- Registered: `backend/api/src/lib/notificationEventRegistry.ts` and `index.ts:9424-9440` include `order_delivery_failed`, `order_parcel_lost`, `order_parcel_damaged`, `coown_price_alert_triggered`, `coown_drip_receipt`; push-category maps in `index.ts` and `lib/workerHelpers.ts` cover them via `order_*`/`coown_*` prefixes; producers and the drain emit literal strings (`coOwnDripExecutionHandler.ts:596`, `outboxDrainHandler.ts:989-1100`).
- `frontend/src/services/notificationsApi.ts:6-59` — the `NotificationEventType` union ends at `generic`; the five types are absent, so no typed consumer can reference them.
- `frontend/src/components/notifications/notificationViewModels.ts:103-157` — `EVENT_TYPE_CARD_MAP` lacks the five; they degrade to `generic` via `EVENT_TYPE_CARD_MAP[v2Event.eventType] ?? 'generic'`.
- `frontend/src/components/notifications/notificationViewModels.ts:436-474` — `FILTER_EVENT_TYPES` omits them, so they are invisible in every filter bucket a user can select.
- `frontend/src/services/inAppNotificationsApi.ts` has a prefix fallback (`order_*` → order, else info) so items render — nothing is dropped — but typed titles/bodies/actions, card presentation and filtering all silently treat the new events as unknown.

Classified P1 because "registered" for a notification event means end-to-end; the shipped contract emits five user-visible events that no frontend code path can target.

**Fix:** extend `NotificationEventType`, `EVENT_TYPE_CARD_MAP` and `FILTER_EVENT_TYPES` with the five types (`order_*` → order updates; `coown_*` → the co-own bucket), mirroring the backend prefix mapping.

---

## P2 — Should fix

### P2-1. Degradation disclosure is per-request only — no staleness signal

`routes/search.ts:482-505, 537-546, 597-602, 615-624` attach `retrievalMeta`/`serveMode`/`degraded` to `/search`, `/search/items`, `/search/semantic`, `/search/health` and `/search/readiness` — degraded/fallback serving IS disclosed honestly. But nothing exposes corpus age (`lastSyncedAt` or equivalent): a fallback mirror primed hours ago is indistinguishable from a fresh one. `/search/autocomplete` (`578-580`) attaches no `retrievalMeta` at all, so a degraded autocomplete is invisible to clients.

### P2-2. `fromInMemoryResult` fabricates `status: 'active'` in returned documents

`searchAdapter.ts:140-156` — fallback hits are mapped back with `status: 'active'` hardcoded regardless of the mirrored document's real status. Combined with P1-1 (non-active docs can be mirrored), the fallback response asserts a status it did not verify — a small truthfulness defect in a surface the campaign specifically hardened for honest reporting.

### P2-3. Hold-eviction and post-commit side effects swallow failures silently

- `index.ts:17315-17318, 19106-19109` — `void removeListingFromIndex(id).catch(() => {})` / `void syncSingleListing(…).catch(() => {})`: the *hold-eviction* calls log nothing on failure, unlike neighbouring catch blocks that `request.log.error`. A permanently failing eviction leaves a `risk_pending` listing indexed (reachable via P1-1 routes) until the next full sync, with no trace.
- `index.ts:17236-17245` (saved-search alerts), `17264-17271` (outbox drain enqueue), `listingPatch.ts:410+` (post-commit sync) are also fire-and-forget but at least log; the pattern is individually defensible (durable state commits first) — the silent ones on the safety-critical eviction path are not.

### P2-4. Reindex lock-probe failure returns a misleading `reindex_lock_unavailable` → 500

`searchSync.ts:743-774` — contention correctly yields `reindex_in_progress` → the route maps it to `409` (`routes/search.ts:716-720`). A *database error* during `pg_try_advisory_lock` yields `reindex_lock_unavailable` → `500`, which is honest enough, but a transient DB blip and genuine contention are indistinguishable to operators beyond the string. Minor; the lock itself is released in `finally` on every path (`786-796`) — verified.

### P2-5. Test-suite caveats

All eight requested tests exist and exercise production code:

- **Genuine regression tests** — `coOwnAlertLifecycle.test.ts`, `coOwnOutboxDrain.test.ts`, `coOwnDripSettlement.test.ts`, `walletMoneyPathReservations.test.ts`, `mollieWebhookFailClosed.test.ts`, `auctionPaymentSettlement.test.ts`: fake DBs model transactions/locks/commits; they assert behaviour the pre-fix code demonstrably lacked (activation-scoped dedup keys, nullable `tradeId`/`markSource` parse, retained-cash copy with spendable/required evidence, reservation-aware spendability, fail-closed webhook retrieval, provider-verified settlement). These would fail against the old implementation.
- **Partially source-inspection** — `searchReindexLease.test.ts:446-473` asserts route source ordering for browse-read safety rather than driving requests; catches structural regressions, not wiring. `moderationImportSafety.test.ts` counts `listingTextGateAction(` call sites (≥4 required; verified at `index.ts:16947, 17834, 17913, 18825` + `listingPatch.ts:260`) and unit-tests the gate function — proves presence and mapping, not per-route runtime behaviour; the four call sites were manually verified fail-closed in this review.
- **Coverage gaps** — no test covers P1-1 (semantic/autocomplete status leak), P1-2 (`risk_pending` detail read), or P1-3 (frontend contract drift — invisible to backend tests by construction).

---

## Verified-good areas (no findings)

- **Fallback priming & cap:** boot probe `index.ts:39174-39212` — `in_memory`/degraded backend warms via `syncListingsToSearchIndex`; healthy shared backend primes via `syncListingsToLocalFallback` (`39198-39207`). `searchAdapter.ts:365-380` mirrors every write into the fallback on BOTH success and failure paths; `FALLBACK_MIRROR_CAP = 10_000` with oldest-first eviction (`244-246, 333-339`). Priming corpus is `status='active'` (`searchSync.ts:379`). Degraded state surfaces via `retrievalInfo().backend='in_memory' + degraded` (`searchAdapter.ts:295-306`, route `retrievalMeta`/`serveMode`, `/search/health` 503 semantics `597-602`).
- **SDK compat:** `searchAdapter.ts:274-286` and `vectorSearch.ts` resolve `mod?.MeiliSearch ?? mod?.Meilisearch` — compatible with `meilisearch@0.60`'s renamed export; no other construction sites exist.
- **ANN ordering & capability:** `mediaEmbeddings.ts:305-318` — `unnest($1::text[], $2::float8[]) WITH ORDINALITY`, `MIN(n.distance) AS best_distance`, `ORDER BY best_distance ASC, MIN(n.ann_rank) ASC` — duplicate assets collapse to best distance, ANN rank is the deterministic tie-break. `mediaEmbeddingVectorCapability` (`194-226`) reports `'ann'` only when `pg_indexes` shows a real `USING hnsw`/`USING ivfflat` index on `embedding_vec`; `'exact'` without one; `'none'` without the column or on probe error — fails closed.
- **Reindex:** `searchSync.ts:740-796` — dedicated-client `pg_try_advisory_lock(20260823, 7)`, `reindex_in_progress` result on contention → route `409` (`search.ts:719`), unlock in `finally`. `configureSearchIndex(staged, {awaitTasks:true})` polls every settings task and rethrows on failure/timeout (`searchSync.ts:100-143, 162-165`; `meilisearchConfig.ts` `pollMeilisearchTask` throws on failed/timeout); staged stats settle-check, doc-count tolerance, embedder verification, atomic `swapIndexes`, catch-up sync, `swapped:false` on every failure (`searchSync.ts:859-1005`).
- **Moderation gate:** `listingTextGateAction` maps rejected→block, review/failed→hold. Upsert: block→422, hold+active→`risk_pending` + post-commit index eviction (`index.ts:16946-16978, 17315-17318`); saved-search alerts gated on `effectiveStatus==='active'` (`17232-17246`). PATCH: merged text re-moderated on text edit OR activation; hold→`risk_pending` + live-lot cancellation with `lot.cancelled` events (`18816-18900`); eviction post-commit (`19106-19109`). `listingPatch.ts:245-317` applies the same gate to Seller Hub field patches; batch lifecycle commands route through `executeListingCommand`'s risk gate (`sellerHub.ts:1255-1324`). Q&A: question block→422 / hold→`moderation_state='quarantined'` (`17833-17862`); answer same → `answer_moderation_state` (`17912-17943`). Every public reader filters `moderation_state='visible'`/`answer_moderation_state='visible'` with an author-visible carve-out (`17691-17717` qa-summary, `17745-17803` list, detail counts `17431-17462`); migration 332 adds the columns and enum.
- **Outbox:** claim ≤50 `FOR UPDATE SKIP LOCKED`, complete-on-success, `failDomainOutboxEvent` on error (`outboxDrainHandler.ts:1107-1122`). Alert event: dedup/idempotency `coown_price_alert:{id}:{activationSeq}`, nullable `tradeId`, `markSource` end-to-end (`coOwnAlertEvaluatorHandler.ts:180-258` ↔ drain `989-1041`; migration 331 `activation_seq`). DRIP: dedup `coown_drip_receipt:{distributionId}`, payload schema identical producer↔drain (`coOwnDripExecutionHandler.ts:578-616` ↔ drain `1047-1100`); status transition + receipt in ONE transaction including the standalone failure-marker path guarded by `status='settled'` (`653-680`); retained-cash carries spendable/required evidence and never claims a cash credit; transient pg errors retry, permanent ones mark `reinvest_failed` (`507-541`); issuer wallet verified before buyer debit (`297-311`).
- **Notification backend registry:** all five events in `notificationEventRegistry.ts`, `NOTIFICATION_EVENT_TYPES` (`index.ts:9424-9440`), both push-category maps (`index.ts`, `workerHelpers.ts`) via `order_*`/`coown_*` prefixes; drain emits literal types.

---

## Commands run

- `pwd`, `git rev-parse --show-toplevel`, `git remote -v`, `git branch --show-current`, `git rev-parse HEAD`, `git status --short` — workspace verified (112 modified files on the feature branch, consistent with an in-flight campaign; none modified by this review).
- Reads/greps across `backend/api/src/{index.ts, routes/{search.ts, sellerHub.ts}, lib/{searchAdapter.ts, searchSync.ts, meilisearchConfig.ts, vectorSearch.ts, mediaEmbeddings.ts, listingPatch.ts, moderation/moderationService.ts, notificationEventRegistry.ts}, workers/handlers/{outboxDrainHandler.ts, coOwnAlertEvaluatorHandler.ts, coOwnDripExecutionHandler.ts}}`, migrations 326/331/332, the eight test files, and `frontend/src/services/{notificationsApi.ts, inAppNotificationsApi.ts}` + `frontend/src/components/notifications/notificationViewModels.ts`.

No files were edited.
