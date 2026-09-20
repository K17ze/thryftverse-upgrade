# Capacity Model — ThryftVerse API

Audit item **R110**. This document records the platform's capacity assumptions as
implemented in code today. Every number cited below comes from source; where no
measurement exists the figure is marked **unmeasured — assumption**.

> **Honesty clause:** there is no load-test evidence for any surface in this
> document (R46 — live load test — is open, and no k6/artillery harness exists in
> the repo). All throughput estimates are derived from concurrency limits, pool
> sizes, and code-path shape, not from observed traffic.

---

## 1. Topology (as deployed)

From `backend/docker-compose.production.yml` and `docker-compose.prod.yml`:

| Service | Runtime | Deployed limits | Role |
|---|---|---|---|
| `api` | Fastify / Node 20 | 2 CPU, 1 GB | All HTTP + WS/SSE. `RUN_API_SERVER=true`, `RUN_BACKGROUND_WORKERS=false` |
| `worker` | Same image, `src/workers/index.ts` | 1.5 CPU, 1 GB | All BullMQ workers. `RUN_BACKGROUND_WORKERS=true`, `RUN_API_SERVER=false` |
| `postgres` | Postgres 16 | 2 CPU, 1 GB; `max_connections=200`, `shared_buffers=256MB`, `log_min_duration_statement=1000` | Primary datastore |
| `pgbouncer` | edoburu/pgbouncer | transaction mode, `MAX_CLIENT_CONN=1000`, `DEFAULT_POOL_SIZE=25`, `MAX_DB_CONNECTIONS=100` | Server-side pool |
| `redis-cache` | Redis 7 | 256 MB, `allkeys-lru`, no AOF | Cache, rate limits, presence, realtime pub/sub, recs cache, SLO counters |
| `redis-queue` | Redis 7 | 256 MB, `noeviction`, AOF everysec | BullMQ broker only |
| `meilisearch` | v1.12 | 2 GB, `MEILI_MAX_INDEXING_MEMORY=2048` | Listings search index |
| `ml-service` | FastAPI (Python) | 1 CPU, 512 MB–1 GB | Heuristic ranker (`/recommendations`), price forecast, fraud shadow scoring |
| `key-service` | Node | 0.5 CPU, 256 MB | Envelope encryption keys |
| `caddy` | Caddy 2.8 | 0.5 CPU, 256 MB | TLS termination, HTTP/3 |
| `minio` / S3 | object store | — | Media originals + derivatives; uploads are presigned direct-to-S3 |
| LiveKit | external / `mock` | — | Live video rooms; `LIVE_STREAM_PROVIDER` default is `mock` (`src/lib/streaming/streamProvider.ts`) |

Two deployment modes share one codebase: the API process starts all BullMQ
workers inline unless `RUN_BACKGROUND_WORKERS=false` (`src/index.ts:38365`), and
the standalone worker process runs them without HTTP (`src/workers/index.ts:59`).

---

## 2. Capacity assumptions per hot path

### 2.1 Search (`GET /search`, autocomplete)

- **Path:** `src/lib/searchAdapter.ts` → Meilisearch (`listings` index), Redis
  result cache in `src/lib/searchCache.ts` (results 60 s TTL, autocomplete 300 s,
  hot-query detection: ≥5 hits / 300 s window, top 100 queries pre-warmed).
- **Bottleneck:** Meilisearch single node; on failure the adapter silently
  degrades to a **process-local in-memory index** per replica
  (`searchAdapter.ts:223` `fallback`, `retrievalInfo().degraded`). Replicas then
  serve divergent results — this is a correctness ceiling, not just capacity.
- **Reindex:** hourly `search_index_sync` job on `search_indexing` queue,
  concurrency 1, keyset-paginated batches of 100 rows — but `adapter.index()` is
  called **per row** (`searchSync.ts:252-263`), so a full sync issues one
  `addDocuments` HTTP call per listing. Reindex time ≈ N × per-call latency;
  unmeasured, assume it is the first sync ceiling hit as catalogue grows.
- **Scaling lever:** Meilisearch vertical RAM first; the adapter is
  interface-ready for Elasticsearch (`ElasticsearchSearchAdapter` placeholder).

### 2.2 Feed & recommendations (`/feed/home`, `/feed/discover`, `/recommendations`)

- **Path:** feed routes run 3–4 uncorrelated `readDb` queries per page with
  `overfetch = max(limit*3, 60)` (`src/routes/feed.ts:742`) then merge in
  memory; promoted placements add `fetchPromotedListingsForQuery` + fire-and-forget
  impression writes. `/recommendations` ships the full candidate set to the
  decision service (`src/routes/recommendations.ts:962-1010`).
- **Bottleneck:** (a) Postgres read queries scale with table size — cursor
  pagination helps but the overfetch factor means each page scans ≥60 rows per
  source; (b) the ml-service is a **single synchronous FastAPI process**
  (`backend/ml-service/app/main.py`) behind a 2.5 s timeout
  (`DECISION_SERVICE_TIMEOUT_MS`, `config.ts:216`) with a Redis circuit key
  (`decision:circuit:recommendations:v2`) and per-user result cache.
- **Headroom:** replica pool (`DATABASE_REPLICA_URL`, `src/db/pool.ts:58-66`)
  already splits feed reads from the primary when configured — unverified in
  compose (var is plumbed but unset by default).
- **Scaling lever:** horizontal API replicas + read replica; ml-service needs
  uvicorn workers or replicas behind the same token (stateless — safe).

### 2.3 Checkout / wallet ledger (`POST /orders`, payment intents, `applyWalletLedgerDelta`)

- **Path:** every balance mutation takes `SELECT ... FOR UPDATE` on the wallet
  row then appends `wallet_ledger` (`src/lib/walletMoneyPath.ts:23-120`).
  Order cancel/expiry paths take `FOR UPDATE` on the order row and re-check
  in-flight intents (`src/lib/commerceCheckoutLifecycle.ts`).
- **Constraint:** throughput per wallet is serialized by the row lock — fine
  (wallets are per-user). The real ceiling is **lock-hold time × pool
  occupancy**: checkout transactions hold a pooled connection for the whole
  saga. With `DATABASE_POOL_MAX=20` (10 under PgBouncer), ~20 concurrent
  checkout sagas per API replica saturate the pool; queued requests then hit
  `databasePoolConnectionTimeoutMs` (10 s default, `config.ts:101`).
- **Scaling lever:** keep provider I/O out of transactions (already the
  convention — `commerceCheckoutLifecycle.ts:93`); vertical PG; pool increase
  bounded by `max_connections=200` / PgBouncer `MAX_DB_CONNECTIONS=100`.

### 2.4 Live streaming: chat, viewer counts, live-lot bids

- **Media plane:** LiveKit WebRTC (or `mock`) — media never transits the API;
  API mints JWT tokens only (`streamProvider.ts:294`). Viewer ceilings are
  LiveKit's (`maxParticipants` per room), not ours.
- **Chat fan-out:** each message = 1 `INSERT` + 1 `publishRealtimeEvent` → Redis
  pub/sub → **every node scans its full local `clients` map per event**
  (`src/lib/realtime.ts:184`). Cost per message ≈ O(local connections), plus one
  Redis `INCR` for the topic sequence (`createEnvelope` → `getNextSequence`).
  A moderation call (`moderateListingText`, `streaming.ts:1282`) is on the
  synchronous send path — provider latency bounds chat send rate.
- **Viewer counts:** `activeViewersBySession` is an **in-memory
  `Map<sessionId, Set<userId>>`** (`src/routes/streaming.ts:279`). Counts are
  per-node: a viewer whose token was minted on node A is invisible to node B.
  Multi-replica APIs will broadcast divergent `live.viewer_count.update`s.
- **Live-lot bids:** `SELECT ... FOR UPDATE` on the `live_lots` row per bid
  (`src/routes/liveLotEngine.ts:263`, bid path ~line 505). Per-lot bid
  throughput is serialized — correct, but a hot lot funnels into one row lock;
  the 5 s `live_lot_sweep` tick (`liveLotSweepIntervalMs`) closes lots.
- **Go-live fan-out:** capped at 5,000 recipients (`streaming.ts:575`),
  one `notification_events` row + push job per recipient — a capped but real
  write burst (≤5k inserts + ≤5k queue pushes per go-live).
- **Scaling lever:** none of this horizontally partitions today — see §3.

### 2.5 Co-Own order matching (`POST /co-own/.../orders`)

- **Path:** one transaction per order: lock the asset row `FOR UPDATE`
  (`src/routes/coOwn.ts:3380`), expire stale resting orders, lock **all**
  matching resting orders `FOR UPDATE` price-ordered (`coOwn.ts:4115-4173`),
  then iterate fills in JS applying wallet/holding transfers per fill.
- **Constraint:** per-asset matching is fully serialized and lock-hold grows
  with book depth — a deep book means one tx holding dozens/hundreds of row
  locks while doing per-fill writes. Per-asset throughput ceiling ≈
  1/(match latency); depth and fills-per-order are the amplifiers.
- **Scaling lever:** partition by asset (already true — asset row is the
  serialization point); reduce lock scope by capping matched rows per tx.

### 2.6 Media uploads & pipeline

- **Path:** presigned PUT direct-to-S3 (TTL 10 min, `config.ts:197`), multipart
  for video; `POST /uploads/finalize` HEAD-verifies then enqueues
  `media_ingest` (`src/routes/uploads.ts:225`). Worker: probe → sharp
  derivatives (images) / ffmpeg + HLS packaging (video) → S3 → callback
  (`src/workers/handlers/mediaIngestHandler.ts`, `src/lib/media/pipeline.ts`).
- **Constraint:** ingest is CPU-bound at concurrency 2 on a 1.5-CPU worker
  container — video transcodes queue head-of-line behind each other. Embedding
  jobs (concurrency 2) currently write **placeholder zero-vectors**
  (`mediaEmbeddingHandler.ts:14-18`) — real model load is future GPU work.
- **Scaling lever:** horizontal worker replicas are safe (BullMQ distributes);
  size limits: 20 MB image / 100 MB video / 16 MB audio / 10 MB doc defaults
  (`config.ts:166-195`).

---

## 3. Single-node assumptions to revisit before multi-node

| # | Assumption | Location | Breakage mode |
|---|---|---|---|
| 1 | `activeViewersBySession` — in-memory viewer sets are the source of truth for counts, mute/kick enforcement | `src/routes/streaming.ts:279` | Viewer counts diverge per replica; a kicked viewer can re-enter via a token minted on another node |
| 2 | `topicEventBuffer` ring (200 events/topic) + `clients` map | `src/lib/realtime.ts:54,347` | Gap replay (`/realtime/replay`) only works if the client reconnects to the **same** node; otherwise forced full resnapshot. Cross-node delivery itself is fine (Redis pub/sub bridge) |
| 3 | In-memory degradation fallbacks: search index (`searchAdapter.ts:223`), sliding-window rate limits (`slidingWindowRateLimit.ts:82`), WS connection limits (`websocketRateLimit.ts:43`), SLO tracker (`sloTracker.ts:110`), `MockStreamProvider.streams` | cited files | Under Redis/Meili partial outage each replica enforces/serves its own state — effective limits multiply by replica count and search results diverge |
| 4 | ~26 `setInterval` schedulers run inside **every** API process (`src/index.ts:10020-10650`) | `src/index.ts` | Safe today only because every enqueue uses a time-bucketed `jobId` that BullMQ dedupes (`src/lib/queues.ts:1066-1670`). Any new scheduler added without a bucketed jobId will multiply job volume by replica count |
| 5 | LISTEN/NOTIFY clients are per-process dedicated connections | `src/lib/listenNotify.ts:9` | Each replica burns one PG connection per channel; incompatible with PgBouncer transaction mode if ever routed through it |

Wildcard `*` topic subscribers (`realtime.ts:83-95`) additionally make every
node subscribe to **all** pub/sub channels — fan-out cost is global, not local.

---

## 4. Queue / worker capacity

All queues and workers: `src/lib/queues.ts`. Broker: `redis-queue` (noeviction,
AOF). Two dedicated ioredis connections per process (queue + worker).

| Queue | Concurrency | Notes |
|---|---|---|
| `push_notifications` | 6 | attempts 4, exp backoff 2 s; quiet-hours delay ≤24 h |
| `infra_ops` | **1** | 19 job types serialized: auction/live-lot/co-own sweeps, outbox drain (every 5 s), reconciliation, DSAR, retention, trust recompute. **Any slow job stalls time-sensitive sweeps** — the reason `search_indexing` was split out (`queues.ts:207-212`). Biggest single throughput ceiling in the worker tier. |
| `media_ingest` | 2 | CPU-bound sharp/ffmpeg |
| `catalog_import` | 4 | 7 job types, network-heavy external fetches |
| `media_embedding` | 2 | placeholder vectors today; ≤50 MB downloads, 15 s timeout |
| `moderation_triage` | 2 | external moderation provider (mock default) |
| `importer_extraction` | 2 | ML extraction, advisory only |
| `agent-runs` | 4 | OpenAI calls up to `OPENAI_AGENT_TIMEOUT_MS` (30 s) each |
| `search_indexing` | 1 | full reindex, serialized deliberately |

- **DLQs:** every queue has `*-dlq`; jobs move there only after `attemptsMade >=
  maxAttempts` (`moveToDlq`, `queues.ts:469`); retention 7 days / 10k jobs.
  `src/lib/dlqMonitor.ts` exposes counts + replay.
- **Backpressure:** none on the enqueue side — producers never block. The only
  admission control is per-job `attempts`/`removeOnFail` bounds and the
  bucketed-jobId dedupe. A producer hot loop can grow queue depth unboundedly
  inside the 256 MB `noeviction` Redis — at that point **Redis OOM rejects
  writes**, stalling the whole worker tier.
- **Rate limiters:** `configureQueueRateLimits()` (`queuePriorities.ts:43`)
  declares push=100/s, email=10/s, payout=1/s, but the maps are never passed as
  BullMQ `limiter` options to any `Worker` — **declared but not enforced**.
- **Throughput levers:** raise per-queue `concurrency`; add worker replicas
  (BullMQ-safe); split `infra_ops` further (the sweep set vs. heavy jobs like
  `dsar_export`, `reconciliation_run`).

---

## 5. Datastore

- **Pools:** `DATABASE_POOL_MAX` default 20, capped to 10 when
  `PGBOUNCER_ENABLED` (`src/db/pool.ts:29-34`). `statement_timeout` 30 s,
  `query_timeout` 35 s, idle 30 s. Optional read replica pool via
  `DATABASE_REPLICA_URL`.
- **Budget check:** N api replicas × 10 (PgBouncer) + worker × 10 + LISTEN
  clients must fit `MAX_DB_CONNECTIONS=100` → **~9 pooled processes max**
  before PgBouncer queues connections. Raising `DATABASE_POOL_MAX` past the
  PgBouncer cap is silently clamped (`pool.ts:31`).
- **Partitioned tables:** `admin_audit_logs` (migration 124), `analytics_events`
  (migration 140) — monthly RANGE, ensured 3 months ahead at startup
  (`src/lib/partitionManager.ts`).
- **Growth drivers (write amplification per action):**
  - `notification_events` — 1 row per recipient per event; go-live fan-out ≤5k
    rows at once (`workerRuntime.ts:110`, `streaming.ts:575`).
  - `wallet_ledger` — 1 row per balance mutation; `orders`/`order_events` grow
    per checkout.
  - `media_embeddings` — BYTEA vectors, **no pgvector** (migration 145);
    similarity is computed in app code over fetched candidates — a
    full-table-scan-shaped workload that does not scale with row count.
  - `domain_outbox` — claimed in batches of 50 (`FOR UPDATE SKIP LOCKED`,
    `domainOutbox.ts:95`), drain every 5 s (`OUTBOX_DRAIN_INTERVAL_MS`);
    attempts ≥10 → `dead`. Max drain ≈ 10 events/s sustained.
  - `analytics_events` — per-request/interaction telemetry; partitioned but
    highest-volume writer.

---

## 6. What is NOT measured

- No load tests exist anywhere in the repo (R46 open). All RPS/latency
  statements above are inferred from concurrency limits and code shape.
- No measured: Meilisearch p95 under corpus size, feed query cost at realistic
  table sizes, chat fan-out cost per message vs. local connection count,
  `infra_ops` head-of-line delay distribution, co-own match latency vs. book
  depth, media transcode duration per asset class, end-to-end push latency.
- Container limits in compose (api 1 GB, worker 1 GB) have never been
  validated against heap working-set under load.

## 7. Watch metrics (signals that a ceiling is approaching)

Emitted by `src/lib/metrics.ts`; alert rules in `docs/grafana-alerts.yml`.

| Signal | Ceiling it predicts |
|---|---|
| `thryftverse_database_pool_connections{state="waiting"} > 0` sustained | Pool exhaustion (checkout/feed stalls, 10 s connect timeouts) |
| `thryftverse_http_request_duration_seconds` p95 | Global API saturation; `log_min_duration_statement=1000` pinpoints slow SQL |
| `thryftverse_background_jobs_total{result="failed"}` + `..._duration_seconds` per queue | Worker saturation / failing handlers; `infra_ops` queue age growth = serialization ceiling |
| BullMQ waiting-count per queue (via `dlqMonitor`/queue introspection) | Enqueue > drain; redis-queue 256 MB is the hard wall |
| `thryftverse_redis_connection_state` | Cache redis loss → rate limits fail open, presence stops, realtime pub/sub dies (multi-node delivery stops entirely) |
| `thryftverse_push_ticket_errors_total`, `push_deliveries_total` | Expo/provider throughput ceiling |
| `thryftverse_recommendation_serve_duration_seconds` + circuit key `decision:circuit:recommendations:v2` | ml-service saturation (single Python process) |
| `search.backend.degraded` log / `retrievalInfo().degraded` | Serving divergent per-replica in-memory search |
| `domain_outbox` pending age | Outbox drain (≤10/s) falling behind producers |
| WS/SSE connection count per node + `clients.size` | Fan-out scan cost; heartbeat write volume (every 25 s × clients) |
