// Chaos smoke harness — the R109 drill vehicle.
//
// Verifies the degradation claims documented in docs/CAPACITY_MODEL.md against
// an ALREADY-RUNNING API. This is not a unit test and never touches infra
// itself: a script cannot reach the docker socket portably, so every scenario
// prints the kill/restore commands for the operator to run, and the script
// asserts only the POST-kill HTTP truth.
//
// Every assertion below is backed by a real code path — the citations are in
// each scenario and in docs/CHAOS_RUNBOOK.md. Nothing here asserts hoped-for
// behaviour; where the code fails closed, the expectation is fail-closed.
//
// Usage:
//   node scripts/chaos-smoke.mjs --probe                 reachability report, always exit 0
//   node scripts/chaos-smoke.mjs --list                  print scenario drill plan
//   node scripts/chaos-smoke.mjs --scenario redis-down   assert post-kill state
//   node scripts/chaos-smoke.mjs --all                   assert every scenario
//   node scripts/chaos-smoke.mjs --scenario X --json     machine-readable report
//   node scripts/chaos-smoke.mjs --all --allow-skips     credential-gated checks may be skipped
//
// Skips are honest non-verification: when a credential-gated check is skipped
// the scenario verdict is INCOMPLETE and the run exits non-zero — a drill
// report that never exercised the authenticated paths is not green. Pass
// --allow-skips only when deliberately running a reduced drill.
//
// Env:
//   CHAOS_API_BASE_URL          default http://localhost:4000
//   CHAOS_TIMEOUT_MS            per-request timeout, default 15000 (Redis-backed
//                               rate limits take seconds to fail after a kill)
//   CHAOS_BEARER_TOKEN          consumer access token — unlocks /health/ready,
//                               /health/live and /recommendations/:userId
//                               (those routes are NOT in the public route table,
//                               src/index.ts:1374 isPublicRoute)
//   CHAOS_USER_ID               user id matching CHAOS_BEARER_TOKEN — required
//                               for the /recommendations/:userId probe
//   CHAOS_SECURITY_ADMIN_TOKEN  x-security-admin-token — unlocks /health/deep
//   CHAOS_EXPECT_DEGRADED_MS    settle hint only; the script does not sleep —
//                               wait after killing before asserting

const DEFAULT_BASE_URL = process.env.CHAOS_API_BASE_URL ?? 'http://localhost:4000';
const DEFAULT_TIMEOUT_MS = Number(process.env.CHAOS_TIMEOUT_MS) || 15_000;

// ── HTTP plumbing ───────────────────────────────────────────────────────────

async function probe(ctx, { method = 'GET', path, headers = {}, payload, timeoutMs }) {
  const url = `${ctx.baseUrl}${path}`;
  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      method,
      headers,
      body: payload,
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs ?? ctx.timeoutMs),
    });
    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      // Non-JSON body — status is still evidence.
    }
    return { reachable: true, status: response.status, ms: Date.now() - startedAt, json, text: text.slice(0, 400) };
  } catch (error) {
    const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    return {
      reachable: false,
      status: null,
      ms: Date.now() - startedAt,
      json: null,
      error: timedOut ? `timeout after ${timeoutMs ?? ctx.timeoutMs}ms` : String(error?.cause?.code ?? error?.message ?? error),
    };
  }
}

function authHeaders(ctx) {
  return ctx.bearerToken ? { authorization: `Bearer ${ctx.bearerToken}` } : {};
}

function adminHeaders(ctx) {
  return ctx.securityAdminToken ? { 'x-security-admin-token': ctx.securityAdminToken } : {};
}

// ── Check evaluation ────────────────────────────────────────────────────────
//
// A check declares: request shape, acceptable statuses, an optional body
// predicate, and an optional credential requirement. 'skip' (not 'fail') is
// the verdict when a required credential is absent — a skipped check is an
// honest "not verified", never a fabricated pass.

async function runCheck(ctx, check) {
  if (check.requires === 'bearer' && !ctx.bearerToken) {
    return { label: check.label, verdict: 'skip', reason: 'requires CHAOS_BEARER_TOKEN', expected: check.expected };
  }
  if (check.requires === 'admin' && !ctx.securityAdminToken) {
    return { label: check.label, verdict: 'skip', reason: 'requires CHAOS_SECURITY_ADMIN_TOKEN', expected: check.expected };
  }
  if (check.requires === 'bearer+user' && !(ctx.bearerToken && ctx.userId)) {
    return { label: check.label, verdict: 'skip', reason: 'requires CHAOS_BEARER_TOKEN and CHAOS_USER_ID', expected: check.expected };
  }

  const headers = { ...(check.headers ?? {}) };
  if (check.auth === 'bearer') Object.assign(headers, authHeaders(ctx));
  if (check.auth === 'admin') Object.assign(headers, adminHeaders(ctx));

  const path = typeof check.path === 'function' ? check.path(ctx) : check.path;
  const res = await probe(ctx, { method: check.method, path, headers, payload: check.payload, timeoutMs: check.timeoutMs });

  if (!res.reachable) {
    return {
      label: check.label,
      verdict: check.expectUnreachable ? 'pass' : 'fail',
      expected: check.expected,
      observed: `unreachable: ${res.error}`,
      ms: res.ms,
    };
  }

  if (check.statuses && !check.statuses.includes(res.status)) {
    return {
      label: check.label,
      verdict: 'fail',
      expected: check.expected,
      observed: `HTTP ${res.status} — ${res.text ?? ''}`.slice(0, 300),
      ms: res.ms,
    };
  }

  if (check.body) {
    const verdict = check.body(res.json, res);
    if (verdict !== true) {
      return {
        label: check.label,
        verdict: 'fail',
        expected: check.expected,
        observed: `HTTP ${res.status} — ${typeof verdict === 'string' ? verdict : 'body predicate failed'} :: ${res.text ?? ''}`.slice(0, 300),
        ms: res.ms,
      };
    }
  }

  return {
    label: check.label,
    verdict: 'pass',
    expected: check.expected,
    observed: `HTTP ${res.status}`,
    ms: res.ms,
  };
}

// Body predicates ─────────────────────────────────────────────────────────────

const isDegradedSearch = (json) =>
  json && (json.degraded === true || json.retrievalMeta?.degraded === true || json.retrievalMeta?.backend === 'in_memory')
    ? true
    : 'expected degraded:true or backend in_memory';

// ── Scenario definitions ────────────────────────────────────────────────────
//
// kill/restore are DOCUMENTED commands for the operator — the script never
// executes them. Dev service names are from docker-compose.yml; prod names
// from backend/docker-compose.production.yml.

const SCENARIOS = [
  {
    name: 'redis-down',
    title: 'Redis cache loss (rate limits, presence, realtime pub/sub, search cache)',
    kill: 'docker compose stop redis   # prod: docker compose -f backend/docker-compose.production.yml stop redis-cache',
    restore: 'docker compose start redis   # prod: ... start redis-cache',
    truth:
      'FAIL-CLOSED on the request path. The global @fastify/rate-limit store ' +
      '(src/index.ts:638, redis client src/lib/redis.ts with maxRetriesPerRequest:3) ' +
      'has no skipOnError, so the onRequest hook throws and EVERY rate-limited route ' +
      'returns 5xx — including /health/ready and webhooks. The comment at ' +
      'src/index.ts:636 claims webhook routes are exempt via `rateLimit: false`, but ' +
      'no such route config exists — verified absent. The per-feature fallbacks that ' +
      'do degrade (slidingWindowRateLimit.ts:82 in-memory fixed window, ' +
      'websocketRateLimit.ts:43 in-memory map, presenceRegistry never-throws, ' +
      'realtime.ts:607 publish .catch → local-only delivery) sit behind the global ' +
      'limiter and never get a chance to serve. Expect: process alive, all routes 5xx.',
    checks: [
      {
        label: 'GET /health fails (redis.ping throws — and the rate-limit hook throws first)',
        path: '/health',
        statuses: [500, 502, 503],
        expected: '5xx — process alive but every rate-limited route fails',
      },
      {
        label: 'GET /health/ready fails — rate-limit onRequest runs before auth and before the readiness handler',
        path: '/health/ready',
        statuses: [500, 502, 503],
        expected: '5xx — readiness cannot report checks.redis=down because the global limiter fails first',
      },
      {
        label: 'GET /search still answers over HTTP (process alive), but fails closed',
        path: '/search?q=chaos',
        statuses: [500, 502, 503],
        expected: '5xx — searchCache/autocomplete Redis reads are unguarded and the global limiter already threw',
      },
      {
        label: 'POST /webhooks/stripe fails closed too — the documented rateLimit:false exemption is not wired',
        path: '/webhooks/stripe',
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        payload: '{}',
        statuses: [500, 502, 503],
        expected: '5xx — proves webhooks share the global limiter (src/index.ts:636 comment is stale)',
      },
      {
        label: 'process still listening — responses are deterministic HTTP 5xx, not connection refused',
        path: '/health',
        statuses: [500, 502, 503],
        expected: 'an HTTP response of any 5xx proves the Fastify process survived',
      },
    ],
  },
  {
    name: 'postgres-down',
    title: 'Postgres loss (primary datastore — api reads via pgbouncer in dev)',
    kill: 'docker compose stop postgres   # prod: docker compose -f backend/docker-compose.production.yml stop postgres',
    restore: 'docker compose start postgres   # prod: ... start postgres',
    truth:
      'FAIL-CLOSED on data paths, honestly reported by readiness. /health ' +
      '(src/routes/health.ts:43) throws on SELECT NOW() → 5xx. /health/ready ' +
      '(health.ts:59) reports checks.database=down + HTTP 503 when the ' +
      'rate-limiter (Redis) is still up. DB-backed public routes 500 ' +
      '(/feed/home catches → "Failed to fetch home feed", feed.ts:505; ' +
      '/feed/trending has no catch → 500). Anonymous item search survives: ' +
      'the /search items scope (search.ts:504-545) hits only the search ' +
      'adapter — no DB — so it stays 200; scope=all adds postgres ILIKE legs ' +
      'for people/boards (search.ts:81) and fails.',
    checks: [
      {
        label: 'GET /health fails — db.query SELECT NOW() throws',
        path: '/health',
        statuses: [500, 502, 503],
        expected: '5xx',
      },
      {
        label: 'GET /health/ready reports database down (503 + checks.database)',
        path: '/health/ready',
        auth: 'bearer',
        requires: 'bearer',
        statuses: [503],
        body: (json) => (json?.checks?.database === 'down' ? true : `expected checks.database=down, got ${JSON.stringify(json?.checks)}`),
        expected: '503 with checks.database="down" (health.ts:67-70)',
      },
      {
        label: 'GET /health/live stays 200 — liveness checks no dependencies (health.ts:56)',
        path: '/health/live',
        auth: 'bearer',
        requires: 'bearer',
        statuses: [200],
        body: (json) => (json?.ok === true ? true : 'expected ok:true'),
        expected: '200 — process alive, dependency-free',
      },
      {
        label: 'GET /feed/home fails — 3–4 readDb queries per page (feed.ts:505 catch → 500)',
        path: '/feed/home',
        statuses: [500, 502, 503],
        body: (json) => (json === null || json?.ok === false || typeof json?.error === 'string' ? true : 'expected ok:false error body'),
        expected: '5xx with ok:false',
      },
      {
        label: 'GET /search?scope=items still 200 — adapter-only path, no DB for anonymous viewers',
        path: '/search?q=chaos&scope=items',
        statuses: [200],
        body: (json) => (json?.ok === true ? true : `expected ok:true, got ${res_preview(json)}`),
        expected: '200 — Meilisearch/in-memory serves item search without Postgres (search.ts:504)',
      },
      {
        label: 'GET /search?scope=all fails — people/boards are postgres ILIKE legs (search.ts:81-102)',
        path: '/search?q=chaos&scope=all',
        statuses: [500, 502, 503],
        expected: '5xx — fused scope requires Postgres',
      },
      {
        label: 'POST /webhooks/stripe fails — paymentTablesAvailable() runs an unguarded SELECT (index.ts:2623)',
        path: '/webhooks/stripe',
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        payload: '{}',
        statuses: [500, 502, 503],
        expected: '5xx — settlement intake cannot run without Postgres',
      },
    ],
  },
  {
    name: 'meilisearch-down',
    title: 'Meilisearch loss (listings search index)',
    kill: 'docker compose stop meilisearch   # prod: docker compose -f backend/docker-compose.production.yml stop meilisearch',
    restore: 'docker compose start meilisearch   # prod: ... start meilisearch — then run npm run search:sync to rebuild the index',
    truth:
      'DEGRADES, does not fail. MeilisearchSearchAdapter marks the backend ' +
      'unreachable and serves the process-local in-memory index ' +
      '(searchAdapter.ts:284 markBackendDown, :330-356 search fallback). ' +
      'Responses stay 200 but disclose the truth: retrievalMeta.backend ' +
      'flips to in_memory and retrievalMeta.degraded=true ' +
      '(searchAdapter.ts:412-420, search.ts:524-530). /search/health returns ' +
      '503 with degraded:true (search.ts:573-587). /health/ready reports ' +
      'checks.search=degraded but stays 200 — degraded still answers ' +
      '(health.ts:81-96). Results are now per-replica and can diverge ' +
      '(CAPACITY_MODEL.md §3 row 3).',
    checks: [
      {
        label: 'GET /search/health reports degraded — 503 {ok:false, degraded:true}',
        path: '/search/health',
        statuses: [503],
        body: (json) => (json?.ok === false && json?.degraded === true ? true : `expected ok:false degraded:true, got ${JSON.stringify(json)}`),
        expected: '503 with degraded:true and backend in_memory (search.ts:573)',
      },
      {
        label: 'GET /search keeps serving 200 with retrievalMeta.degraded disclosed',
        path: '/search?q=chaos',
        statuses: [200],
        body: isDegradedSearch,
        expected: '200, retrievalMeta.degraded:true / backend in_memory — never a hidden fallback',
      },
      {
        label: 'GET /search/autocomplete keeps serving 200 via in-memory fallback',
        path: '/search/autocomplete?q=ch',
        statuses: [200],
        body: (json) => (json?.ok === true && Array.isArray(json?.suggestions) ? true : 'expected ok:true suggestions[]'),
        expected: '200 — adapter.autocomplete falls back (searchAdapter.ts:365-391)',
      },
      {
        label: 'GET /health/ready stays 200 with checks.search=degraded — degraded does not fail readiness',
        path: '/health/ready',
        auth: 'bearer',
        requires: 'bearer',
        statuses: [200],
        body: (json) => (json?.checks?.search === 'degraded' ? true : `expected checks.search=degraded, got ${JSON.stringify(json?.checks)}`),
        expected: '200, checks.search=degraded (health.ts:81-96)',
      },
      {
        label: 'GET /search/listings unaffected — postgres trigram path never touches Meilisearch',
        path: '/search/listings?q=chaos',
        statuses: [200],
        expected: '200 — computeSearchResults is readDb pg_trgm (searchExtended.ts:539-639)',
      },
    ],
  },
  {
    name: 'ml-service-down',
    title: 'ML/decision service loss (feed ranking, recommendations)',
    kill: 'docker compose stop ml-service   # prod: docker compose -f backend/docker-compose.production.yml stop ml-service',
    restore: 'docker compose start ml-service   # prod: ... start ml-service',
    truth:
      'DEGRADES to a deterministic baseline on /recommendations only. Feed ' +
      'routes never call the ml-service — /feed/home and /feed/discover are ' +
      'pure Postgres (feed.ts:277+, :722+) and stay 200. ' +
      'GET /recommendations/:userId calls the decision service behind a ' +
      '2.5s timeout (config.ts:216-221) plus a Redis circuit ' +
      '(decision:circuit:recommendations:v2 — opens after 5 failures/60s, ' +
      'recommendations.ts:18-20, :948-956, :1087-1103). On failure it serves ' +
      'fallbackDecision() — source:"fallback", model ' +
      '"fallback_quality_recency_v2", serveMode "degraded_baseline", ' +
      'diagnostics.decision_service_unavailable:true ' +
      '(recommendations.ts:251-315, :1114-1131). /health/deep reports ' +
      'checks.ml=error (health.ts:207-217). ml-service is NOT in ' +
      '/health/ready — readiness stays green during this outage.',
    checks: [
      {
        label: 'GET /feed/home stays 200 — the feed never calls the decision service',
        path: '/feed/home',
        statuses: [200],
        expected: '200 — feed.ts has no decision-service fetch',
      },
      {
        label: 'GET /feed/discover stays 200 — pure Postgres readDb queries',
        path: '/feed/discover',
        statuses: [200],
        expected: '200',
      },
      {
        label: 'GET /recommendations/:userId serves the honest fallback (source:fallback, degraded_baseline)',
        path: (ctx) => `/recommendations/${ctx.userId ?? ''}`,
        auth: 'bearer',
        requires: 'bearer+user',
        statuses: [200],
        body: (json) =>
          json?.source === 'fallback' || json?.serveMode === 'degraded_baseline' || json?.decision?.diagnostics?.decision_service_unavailable === true
            ? true
            : `expected fallback evidence, got ${JSON.stringify(json).slice(0, 200)}`,
        expected: '200 source=fallback serveMode=degraded_baseline (recommendations.ts:1114-1131)',
      },
      {
        label: 'GET /health/deep reports checks.ml=error (security-admin token)',
        path: '/health/deep',
        auth: 'admin',
        requires: 'admin',
        statuses: [503],
        body: (json) => (json?.checks?.ml === 'error' ? true : `expected checks.ml=error, got ${JSON.stringify(json?.checks)}`),
        expected: '503 with checks.ml=error (health.ts:207-217)',
      },
      {
        label: 'GET /health/ready still 200 — ml-service is not a readiness dependency (honest gap)',
        path: '/health/ready',
        auth: 'bearer',
        requires: 'bearer',
        statuses: [200],
        expected: '200 — readiness does not cover ml-service; documented gap',
      },
    ],
  },
  {
    name: 'redis-queue-down',
    title: 'Queue broker loss (BullMQ redis-queue — prod topology only)',
    kill: 'docker compose -f backend/docker-compose.production.yml stop redis-queue   # dev compose has one redis for cache+queue — there this scenario is identical to redis-down',
    restore: 'docker compose -f backend/docker-compose.production.yml start redis-queue',
    truth:
      'INVISIBLE TO HEALTH, stalls enqueue paths. queueConnection uses ' +
      'maxRetriesPerRequest:null (queues.ts:319-323) so BullMQ commands ' +
      'buffer instead of failing — enqueue callers hang until request ' +
      'timeout rather than erroring. No health endpoint probes ' +
      'redis-queue (health.ts checks cache redis only), so readiness stays ' +
      'green while pushes/sweeps/ingest silently stop draining. ' +
      'CAPACITY_MODEL.md §4 documents the absent enqueue-side backpressure. ' +
      'Expect: reads fine, readiness green, queue depth grows.',
    checks: [
      {
        label: 'GET /health stays 200 — queue broker is not a health dependency (documented gap)',
        path: '/health',
        statuses: [200],
        body: (json) => (json?.ok === true ? true : 'expected ok:true'),
        expected: '200 — /health checks primary redis only (health.ts:43-53)',
      },
      {
        label: 'GET /health/ready stays 200 — broker loss invisible to readiness (documented gap)',
        path: '/health/ready',
        auth: 'bearer',
        requires: 'bearer',
        statuses: [200],
        expected: '200 — readiness has no redis-queue check (health.ts:59-107)',
      },
      {
        label: 'GET /search keeps serving — reads do not traverse the queue broker',
        path: '/search?q=chaos',
        statuses: [200],
        expected: '200',
      },
      {
        label: 'GET /feed/home keeps serving — reads do not traverse the queue broker',
        path: '/feed/home',
        statuses: [200],
        expected: '200',
      },
    ],
  },
  {
    name: 'provider-down',
    title: 'Payment provider egress loss (Stripe/Mollie/Razorpay APIs unreachable)',
    kill:
      'External SaaS — inject egress failure instead of a container stop. ' +
      'Compose option: add `extra_hosts: ["api.stripe.com:127.0.0.1", "api.mollie.com:127.0.0.1", "api.razorpay.com:127.0.0.1"]` ' +
      'to the api service via a local override file and `docker compose up -d api`. ' +
      'Staging/prod option: firewall/proxy egress deny for the provider domains.',
    restore: 'Remove the override/firewall rule and `docker compose up -d api` again.',
    truth:
      'INBOUND WEBHOOKS KEEP VERIFYING — signature checks are local crypto, ' +
      'not provider API calls. Stripe: stripe.webhooks.constructEvent ' +
      '(paymentProviders.ts:774) → bad signature still returns 401, and a ' +
      'real signed event would still settle. Mollie: the post-signature ' +
      'payments.get() lookup is wrapped in try/catch and degrades to payload ' +
      'status (paymentProviders.ts:535-548). OUTBOUND calls (intent ' +
      'creation, payout submission) have no circuit breaker — they fail per ' +
      'request with 5xx; reconciliation via webhooks is unaffected. ' +
      'PAYOUTS_PAUSED_REDIS_KEY (index.ts:958) is an ops halt flag, not ' +
      'provider-awareness.',
    checks: [
      {
        label: 'POST /webhooks/stripe with a bad signature still returns 401 — verification is local',
        path: '/webhooks/stripe',
        method: 'POST',
        headers: { 'content-type': 'application/json', 'stripe-signature': 't=0,v1=bad' },
        payload: '{}',
        statuses: [401],
        body: (json) => (json?.ok === false ? true : `expected ok:false, got ${JSON.stringify(json)}`),
        expected: '401 — constructEvent is local HMAC, provider reachability irrelevant (paymentProviders.ts:759-829)',
      },
      {
        label: 'POST /webhooks/mollie with a bad signature still returns 401',
        path: '/webhooks/mollie',
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-mollie-signature': 'sha256=bad' },
        payload: '{"id":"tr_chaos"}',
        statuses: [401, 503],
        expected: '401 when a webhook secret is configured — local HMAC; 503 acceptable if payment tables/migrations missing',
      },
      {
        label: 'GET /health/ready unaffected — provider egress is not a readiness dependency',
        path: '/health/ready',
        auth: 'bearer',
        requires: 'bearer',
        statuses: [200],
        expected: '200 — providers are intentionally absent from readiness (health.ts:59-107)',
      },
      {
        label: 'GET /health stays 200 — provider outage does not take the API down',
        path: '/health',
        statuses: [200],
        expected: '200',
      },
    ],
  },
];

function res_preview(json) {
  return JSON.stringify(json)?.slice(0, 200);
}

// ── Probe mode ──────────────────────────────────────────────────────────────
//
// Honest reachability snapshot — never fails. Reports what the running API
// actually answers so the operator can see which backends are up before or
// after injecting a fault.

async function runProbe(ctx) {
  const endpoints = [
    { name: 'aggregate health', method: 'GET', path: '/health' },
    { name: 'liveness', method: 'GET', path: '/health/live', auth: 'bearer' },
    { name: 'readiness', method: 'GET', path: '/health/ready', auth: 'bearer' },
    { name: 'deep health', method: 'GET', path: '/health/deep', auth: 'admin' },
    { name: 'search backend health', method: 'GET', path: '/search/health' },
    { name: 'search (items)', method: 'GET', path: '/search?q=probe' },
    { name: 'search (fused all)', method: 'GET', path: '/search?q=probe&scope=all' },
    { name: 'search listings (pg_trgm)', method: 'GET', path: '/search/listings?q=probe' },
    { name: 'autocomplete', method: 'GET', path: '/search/autocomplete?q=pr' },
    { name: 'home feed', method: 'GET', path: '/feed/home' },
    { name: 'trending feed', method: 'GET', path: '/feed/trending' },
    { name: 'discover feed', method: 'GET', path: '/feed/discover' },
    {
      name: 'stripe webhook receiver',
      method: 'POST',
      path: '/webhooks/stripe',
      headers: { 'content-type': 'application/json' },
      payload: '{}',
    },
  ];
  if (ctx.bearerToken && ctx.userId) {
    endpoints.push({ name: 'recommendations', method: 'GET', path: `/recommendations/${ctx.userId}`, auth: 'bearer' });
  }

  const results = [];
  for (const ep of endpoints) {
    const headers = { ...(ep.headers ?? {}) };
    if (ep.auth === 'bearer') Object.assign(headers, authHeaders(ctx));
    if (ep.auth === 'admin') Object.assign(headers, adminHeaders(ctx));
    const res = await probe(ctx, { ...ep, headers });
    const row = {
      endpoint: `${ep.method} ${ep.path}`,
      name: ep.name,
      reachable: res.reachable,
      status: res.status,
      ms: res.ms,
    };
    if (res.error) row.error = res.error;
    if (res.json?.checks) row.checks = res.json.checks;
    if (res.json && Object.hasOwn(res.json, 'degraded')) row.degraded = res.json.degraded;
    if (res.json?.retrievalMeta) row.retrievalMeta = res.json.retrievalMeta;
    if (res.json?.serveMode) row.serveMode = res.json.serveMode;
    if (res.json?.source) row.source = res.json.source;
    if (res.status === 401 || res.status === 403) {
      row.note = 'auth-gated — set CHAOS_BEARER_TOKEN / CHAOS_SECURITY_ADMIN_TOKEN to probe deeper';
    }
    results.push(row);
  }

  return {
    ok: true,
    mode: 'probe',
    baseUrl: ctx.baseUrl,
    credentials: {
      bearer: Boolean(ctx.bearerToken),
      userId: Boolean(ctx.userId),
      securityAdmin: Boolean(ctx.securityAdminToken),
    },
    endpoints: results,
    generatedAt: new Date().toISOString(),
  };
}

// ── Scenario mode ───────────────────────────────────────────────────────────

async function runScenario(ctx, scenario) {
  const checks = [];
  for (const check of scenario.checks) {
    checks.push(await runCheck(ctx, check));
  }
  const failed = checks.filter((c) => c.verdict === 'fail');
  const skipped = checks.filter((c) => c.verdict === 'skip');
  return {
    name: scenario.name,
    title: scenario.title,
    // PASS means "behaved exactly as the code says it should" — including
    // fail-closed truths. SKIP is honest non-verification, never a pass:
    // skipped credential-gated checks make the scenario INCOMPLETE (fails
    // the run) unless --allow-skips was explicitly passed.
    verdict:
      failed.length > 0
        ? 'FAIL'
        : skipped.length > 0 && !ctx.allowSkips
          ? 'INCOMPLETE'
          : 'PASS',
    kill: scenario.kill,
    restore: scenario.restore,
    documentedTruth: scenario.truth,
    counts: { pass: checks.length - failed.length - skipped.length, fail: failed.length, skip: skipped.length },
    checks,
  };
}

function printHumanReport(report) {
  if (report.mode === 'probe') {
    console.log(`\nchaos probe — ${report.baseUrl}`);
    console.log(`credentials: bearer=${report.credentials.bearer} userId=${report.credentials.userId} securityAdmin=${report.credentials.securityAdmin}`);
    console.log('');
    for (const ep of report.endpoints) {
      const status = ep.reachable ? `HTTP ${ep.status}` : `UNREACHABLE (${ep.error})`;
      console.log(`  ${status.padEnd(14)} ${ep.endpoint.padEnd(46)} ${ep.name}${ep.note ? ` — ${ep.note}` : ''}`);
      if (ep.checks) console.log(`                   checks: ${JSON.stringify(ep.checks)}`);
      if (ep.degraded !== undefined) console.log(`                   degraded: ${ep.degraded}`);
      if (ep.retrievalMeta) console.log(`                   retrievalMeta: ${JSON.stringify(ep.retrievalMeta)}`);
      if (ep.serveMode) console.log(`                   serveMode: ${ep.serveMode}`);
      if (ep.source) console.log(`                   source: ${ep.source}`);
    }
    console.log('');
    return;
  }

  for (const scenario of report.scenarios) {
    console.log(`\n[${scenario.verdict}] ${scenario.name} — ${scenario.title}`);
    console.log(`  pass=${scenario.counts.pass} fail=${scenario.counts.fail} skip=${scenario.counts.skip}`);
    for (const check of scenario.checks) {
      const mark = check.verdict === 'pass' ? 'ok  ' : check.verdict === 'skip' ? 'skip' : 'FAIL';
      console.log(`  ${mark} ${check.label}`);
      console.log(`       expected: ${check.expected}`);
      if (check.observed) console.log(`       observed: ${check.observed} (${check.ms ?? '?'}ms)`);
      if (check.reason) console.log(`       reason:   ${check.reason}`);
    }
  }
  console.log('');
}

// ── Entry ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const jsonMode = args.includes('--json');
  const probeMode = args.includes('--probe');
  const listMode = args.includes('--list');
  const allMode = args.includes('--all');
  const scenarioIdx = args.indexOf('--scenario');
  const baseIdx = args.indexOf('--base-url');
  const timeoutIdx = args.indexOf('--timeout');

  const ctx = {
    baseUrl: (baseIdx >= 0 ? args[baseIdx + 1] : DEFAULT_BASE_URL).replace(/\/+$/, ''),
    timeoutMs: timeoutIdx >= 0 ? Number(args[timeoutIdx + 1]) : DEFAULT_TIMEOUT_MS,
    bearerToken: process.env.CHAOS_BEARER_TOKEN ?? null,
    userId: process.env.CHAOS_USER_ID ?? null,
    securityAdminToken: process.env.CHAOS_SECURITY_ADMIN_TOKEN ?? null,
    allowSkips: args.includes('--allow-skips'),
  };

  if (listMode || (!probeMode && !allMode && scenarioIdx < 0)) {
    const report = {
      ok: true,
      mode: 'list',
      note: 'Kill commands are for the operator — this script never touches infra. Run --scenario <name> AFTER the kill step, --json for machine-readable output.',
      scenarios: SCENARIOS.map((s) => ({ name: s.name, title: s.title, kill: s.kill, restore: s.restore, truth: s.truth })),
      generatedAt: new Date().toISOString(),
    };
    if (jsonMode) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      for (const s of report.scenarios) {
        console.log(`\n${s.name} — ${s.title}`);
        console.log(`  kill:    ${s.kill}`);
        console.log(`  restore: ${s.restore}`);
        console.log(`  truth:   ${s.truth}`);
      }
      console.log('');
    }
    return;
  }

  if (probeMode) {
    const report = await runProbe(ctx);
    if (jsonMode) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      printHumanReport(report);
    }
    return; // probe is a report — always exit 0
  }

  const selected = allMode
    ? SCENARIOS
    : SCENARIOS.filter((s) => s.name === args[scenarioIdx + 1]);
  if (selected.length === 0) {
    throw new Error(`unknown scenario '${args[scenarioIdx + 1]}' — run --list for names`);
  }

  const report = {
    ok: true,
    mode: 'scenario',
    baseUrl: ctx.baseUrl,
    allowSkips: ctx.allowSkips,
    scenarios: [],
    generatedAt: new Date().toISOString(),
  };
  for (const scenario of selected) {
    const result = await runScenario(ctx, scenario);
    report.scenarios.push(result);
    if (result.verdict !== 'PASS') report.ok = false;
  }

  if (jsonMode) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHumanReport(report);
  }

  // exitCode (not process.exit): a forced exit while undici keep-alive
  // sockets are still closing trips a libuv assertion on some platforms —
  // the report would print but the process would crash instead of exiting
  // cleanly non-zero. Setting exitCode lets the loop drain and still
  // yields a non-zero status for the drill gate.
  if (!report.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('[chaos:smoke] failed', error);
  process.exitCode = 1;
});
