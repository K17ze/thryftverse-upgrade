# Chaos Runbook — ThryftVerse API

Audit item **R109** (scheduled failure-injection). Companion doc to
`CAPACITY_MODEL.md` (R110): that document records what each dependency does
when it dies; this runbook is the drill that proves it against a running
deployment.

The harness is `scripts/chaos-smoke.mjs`. It is deliberately dumb: **it never
touches infrastructure**. A Node script cannot reach the Docker socket
portably, so the kill/restore commands are printed for the operator to run by
hand (or via cron/CI-with-docker), and the script asserts only the post-kill
HTTP truth. A `PASS` means "the system behaved exactly as the code says it
should" — including fail-closed truths. A `SKIP` is honest non-verification
(e.g. a credential was not supplied); it never counts as a pass.

> **Honesty clause:** every expected behaviour below is cited to source. Where
> the code does something uncomfortable — the global rate limiter failing
> closed, queue-broker loss being invisible to readiness — the drill asserts
> the real behaviour and this runbook names it. No fabricated pass criteria.

## Setup

```bash
cd backend/api

# Target a running API (default http://localhost:4000)
export CHAOS_API_BASE_URL=http://localhost:4000

# Optional credentials — unlock the deeper checks:
export CHAOS_BEARER_TOKEN=<consumer access token>   # /health/ready, /health/live, /recommendations/:userId
export CHAOS_USER_ID=<user id matching the token>
export CHAOS_SECURITY_ADMIN_TOKEN=<API_SECURITY_ADMIN_TOKEN>  # /health/deep
export CHAOS_TIMEOUT_MS=15000                        # per-request ceiling
```

Why credentials matter: `/health/ready` and `/health/live` are **not** in the
public route table (`src/index.ts:1374 isPublicRoute` lists only `GET /health`
and `GET /health/deep`), so unauthenticated calls return 401 — the harness
reports this honestly and marks credential-gated checks `skip` rather than
fail. `/health/deep` is gated by `x-security-admin-token`
(`src/index.ts:894 ensureSecurityAdminAccess`).

## Commands

```bash
node scripts/chaos-smoke.mjs --probe                 # reachability report, always exit 0
node scripts/chaos-smoke.mjs --list                  # print the drill plan
node scripts/chaos-smoke.mjs --scenario <name>       # assert post-kill state, exit 0/1
node scripts/chaos-smoke.mjs --all                   # every scenario's assertions
node scripts/chaos-smoke.mjs --scenario X --json     # machine-readable report
npm run chaos:smoke -- --probe                       # same via npm script
```

`--probe` is safe to run any time and exits 0 regardless — it is a reporter,
not a gate. `--scenario` is the drill step and exits 1 on any failed check.

## The drill, per scenario

Run order per scenario: **(1)** `node scripts/chaos-smoke.mjs --probe` to
record the healthy baseline → **(2)** run the kill command → **(3)** wait
~10 s for client retry/backoff to notice → **(4)** `node scripts/chaos-smoke.mjs
--scenario <name>` → **(5)** run the restore command → **(6)** `--probe` again
and confirm recovery. Attach the `--json` output to the audit evidence trail.

Service names below are from the root `docker-compose.yml` (dev) and
`backend/docker-compose.production.yml` (prod). In dev, one `redis` container
serves cache AND queue (`REDIS_QUEUE_URL` falls back to `REDIS_URL`,
`src/config.ts:123`); the `redis-queue-down` scenario only exists as a
separate fault in the prod topology.

### 1. `redis-down` — cache Redis loss

```bash
docker compose stop redis            # dev — also takes the queue broker with it
docker compose start redis           # restore
# prod: docker compose -f backend/docker-compose.production.yml stop redis-cache
```

**Expected truth — FAIL-CLOSED.** The global `@fastify/rate-limit` is
registered with the Redis store and **no `skipOnError`**
(`src/index.ts:638-677`); its `onRequest` hook runs before auth and before
every handler, so when Redis dies the store's `incr` errors and **every
rate-limited route returns 5xx** — including `/health/ready` and webhooks.

Two stale claims this drill exposes:

- The comment at `src/index.ts:636` says webhook routes are exempt via
  `rateLimit: false` — **no such route config exists**; the drill asserts
  webhooks 5xx too.
- `CAPACITY_MODEL.md` §7 says "rate limits fail open" on cache-Redis loss —
  true only for the library fallbacks (`slidingWindowRateLimit.ts:82`,
  `websocketRateLimit.ts:43`, `presenceRegistry.ts` never-throws,
  `realtime.ts:607` publish `.catch` → local-only delivery), none of which
  rescue the HTTP request path.

**PASS looks like:** process still listening; `/health`, `/health/ready`,
`/search`, and `POST /webhooks/stripe` all return deterministic 5xx (not
connection-refused, not hangs). Restore → probe returns to 200s.

### 2. `postgres-down` — primary datastore loss

```bash
docker compose stop postgres         # dev — api reaches pg via pgbouncer
docker compose start postgres
# prod: ... stop postgres
```

**Expected truth — FAIL-CLOSED on data paths, honestly reported.**

- `GET /health` → 5xx (`SELECT NOW()` throws, `src/routes/health.ts:43`).
- `GET /health/ready` → **503** with `checks.database="down"`
  (`health.ts:63-70`) — requires `CHAOS_BEARER_TOKEN`.
- `GET /health/live` → **200** — liveness checks no dependencies
  (`health.ts:56`); requires `CHAOS_BEARER_TOKEN`.
- `GET /feed/home` → 500 `{ok:false,"error":"Failed to fetch home feed"}`
  (catch at `feed.ts:505`). `/feed/trending` has no catch → 500.
- `GET /search?scope=items` → **stays 200** — anonymous item search hits only
  the search adapter, no DB (`search.ts:504-545`). `scope=all` adds postgres
  ILIKE legs for people/boards (`search.ts:81`) → 500.
- `POST /webhooks/stripe` → 5xx — `paymentTablesAvailable()` runs an
  unguarded `SELECT` first (`index.ts:2623`).

**PASS looks like:** readiness flips to 503/`database:down` while liveness
and adapter-served search stay up.

### 3. `meilisearch-down` — search index loss

```bash
docker compose stop meilisearch
docker compose start meilisearch
npm run search:sync                  # after restore — rebuild the index
# prod: ... stop meilisearch / start meilisearch
```

**Expected truth — DEGRADES, never hard-fails, and discloses it.**

`MeilisearchSearchAdapter` marks the backend unreachable and serves the
process-local in-memory index (`searchAdapter.ts:284 markBackendDown`,
`:330-356`). The degradation is always on the wire:

- `GET /search/health` → **503** `{ok:false, degraded:true,
  backend:"in_memory"}` (`search.ts:573-587`).
- `GET /search?q=…` → **200** with `retrievalMeta.degraded:true`,
  `backend:"in_memory"` (`searchAdapter.ts:412-420`, `search.ts:524-530`).
- `GET /search/autocomplete` → 200 via fallback (`searchAdapter.ts:365-391`).
- `GET /health/ready` → stays **200** with `checks.search="degraded"` —
  degraded still answers, so it does not fail readiness (`health.ts:81-96`).
- `GET /search/listings` → 200 — the `pg_trgm` path never touches Meilisearch
  (`searchExtended.ts:539-639`).

Caveat to record in the drill notes: fallback results are per-replica and
diverge across nodes (`CAPACITY_MODEL.md` §3 row 3); the in-memory index only
contains listings indexed since process start.

### 4. `ml-service-down` — decision service loss

```bash
docker compose stop ml-service
docker compose start ml-service
# prod: ... stop ml-service / start ml-service
```

**Expected truth — feed unaffected; recommendations degrade to a named
baseline.**

- `GET /feed/home`, `/feed/discover` → **200** — feed routes are pure
  Postgres and never call the ml-service (`feed.ts:277+`, `:722+`).
- `GET /recommendations/:userId` → **200** `source:"fallback"`,
  `serveMode:"degraded_baseline"`, model `fallback_quality_recency_v2`,
  `diagnostics.decision_service_unavailable:true`
  (`recommendations.ts:251-315`, `:1114-1131`). Requires
  `CHAOS_BEARER_TOKEN` + `CHAOS_USER_ID`; first call waits out the 2.5 s
  `DECISION_SERVICE_TIMEOUT_MS` (`config.ts:216-221`).
- Redis circuit: after 5 failures/60 s the key
  `decision:circuit:recommendations:v2` opens for 30 s
  (`recommendations.ts:18-20`, `:1087-1103`) and subsequent responses add
  `diagnostics.circuit_open:true`.
- `GET /health/deep` → 503 with `checks.ml="error"` (`health.ts:207-217`);
  requires `CHAOS_SECURITY_ADMIN_TOKEN`.
- `GET /health/ready` → stays 200 — **ml-service is not a readiness
  dependency** (documented gap).

**PASS looks like:** public feeds green, personalized surface degrades with
the fallback contract visible in the response body.

### 5. `redis-queue-down` — BullMQ broker loss (prod topology)

```bash
docker compose -f backend/docker-compose.production.yml stop redis-queue
docker compose -f backend/docker-compose.production.yml start redis-queue
```

**Expected truth — invisible to health, stalls enqueue paths.**
`queueConnection` uses `maxRetriesPerRequest:null` (`queues.ts:319-323`), so
BullMQ commands **buffer instead of failing** — enqueue callers hang until
their request times out rather than erroring cleanly. No health endpoint
probes redis-queue, so `/health` and `/health/ready` stay green while
push/sweep/ingest jobs silently stop draining (CAPACITY_MODEL.md §4 notes the
absent enqueue-side backpressure).

**PASS looks like:** reads (`/search`, `/feed/home`) stay 200, health stays
200 — and the operator records queue-depth growth from worker logs /
`dlqMonitor` as the actual signal. This scenario is primarily a reminder that
broker health needs a metric (`thryftverse_redis_connection_state` covers
cache redis only), not an HTTP gate.

### 6. `provider-down` — payment provider egress loss

Providers are external SaaS — inject egress failure, don't stop a container:

```bash
# Local/compose: blackhole the provider domains on the api service.
# Write a throwaway override file:
cat > /tmp/chaos-provider-blackhole.yml <<'EOF'
services:
  api:
    extra_hosts:
      - "api.stripe.com:127.0.0.1"
      - "api.mollie.com:127.0.0.1"
      - "api.razorpay.com:127.0.0.1"
EOF
docker compose -f docker-compose.yml -f /tmp/chaos-provider-blackhole.yml up -d api
# restore:
docker compose up -d api
```

In staging/prod, use an egress firewall deny on the provider domains instead.

**Expected truth — inbound webhooks keep verifying; outbound calls fail.**

- `POST /webhooks/stripe` with a bad signature → **401** — Stripe
  verification is local `constructEvent` HMAC
  (`paymentProviders.ts:759-829`), no provider call. A genuinely signed event
  would still settle.
- `POST /webhooks/mollie` → **401** with a webhook secret configured —
  local HMAC. Mollie's post-signature `payments.get()` enrichment is
  `try/catch`-guarded and degrades to payload status
  (`paymentProviders.ts:535-548`).
- Outbound calls (payment-intent creation, payout submission) have **no
  circuit breaker** — they fail per-request with 5xx; this is asserted only
  through authenticated flows when credentials are supplied.
- `GET /health`, `/health/ready` → 200 — provider egress is not a readiness
  dependency.

## Cadence & scheduling (audit intent)

R109 asks for **scheduled** failure-injection. Honest status of that today:

- **CI cannot inject failures.** There is no docker-compose-in-CI job in this
  repo that can stop a backing service while the API runs, and the harness
  intentionally has no infra access. Wiring fault injection into CI requires
  either a compose-based integration stage or a chaos sidecar (toxiproxy) —
  neither exists yet.
- **This runbook is the drill vehicle until then.** Recommended cadence:
  - **`--probe` weekly** against staging (cron or a scheduled pipeline step —
    it exits 0 and emits JSON for the evidence trail).
  - **Full scenario pass monthly** against staging, rotating the on-call
    operator, one scenario per window — never overlapping kills.
  - **After any change** to `src/lib/redis.ts`, the rate-limit registration
    (`index.ts:638`), `searchAdapter.ts`, `recommendations.ts` circuit logic,
    or `health.ts` — re-run the affected scenario before shipping.
- Record results: `node scripts/chaos-smoke.mjs --scenario <name> --json >
  chaos-<name>-$(date +%F).json` — the JSON report is the audit artifact.

## Known gaps this drill documents (do not "fix" the assertions — fix the code)

1. **Cache-Redis loss is total**, not graceful: add `skipOnError` to the
   global limiter and a `try/catch` around `userRateLimitHook`'s `redis.eval`
   (`index.ts:706`) if fail-open is the desired posture — then update this
   scenario's assertions.
2. **No readiness coverage** for `redis-queue` or `ml-service` — both degrade
   silently; only `/health/deep` sees ml.
3. **Webhook rate-limit exemption claimed but not wired** (`index.ts:636`
   comment vs. absent `rateLimit: false` configs).
4. `slidingWindowRateLimit.ts` (in-memory fixed-window fallback) is a library
   export with **no call site** today — its degrade path is real but dormant.
