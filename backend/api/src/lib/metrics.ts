import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

const registry = new Registry();

collectDefaultMetrics({
  register: registry,
  prefix: 'thryftverse_',
});

const httpRequestsTotal = new Counter({
  name: 'thryftverse_http_requests_total',
  help: 'Total HTTP requests processed by the API',
  labelNames: ['method', 'route', 'status'] as const,
  registers: [registry],
});

const httpRequestDurationSeconds = new Histogram({
  name: 'thryftverse_http_request_duration_seconds',
  help: 'Request latency distribution by route',
  labelNames: ['method', 'route', 'status'] as const,
  buckets: [0.005, 0.01, 0.03, 0.06, 0.1, 0.2, 0.4, 0.8, 1.5, 3, 6, 12],
  registers: [registry],
});

const paymentTransitionsTotal = new Counter({
  name: 'thryftverse_payment_transitions_total',
  help: 'Payment intent status transitions grouped by channel and gateway',
  labelNames: ['channel', 'from', 'to', 'gateway'] as const,
  registers: [registry],
});

const auctionSettlementsTotal = new Counter({
  name: 'thryftverse_auction_settlements_total',
  help: 'Server-side auction settlement outcomes',
  labelNames: ['result'] as const,
  registers: [registry],
});

const pushDeliveriesTotal = new Counter({
  name: 'thryftverse_push_deliveries_total',
  help: 'Push delivery attempts by provider/status',
  labelNames: ['provider', 'status'] as const,
  registers: [registry],
});

const pushTicketErrorsTotal = new Counter({
  name: 'thryftverse_push_ticket_errors_total',
  help: 'Push ticket errors by provider and error code (e.g. DeviceNotRegistered)',
  labelNames: ['provider', 'error'] as const,
  registers: [registry],
});

const backgroundJobsTotal = new Counter({
  name: 'thryftverse_background_jobs_total',
  help: 'Background job executions by queue/job/result',
  labelNames: ['queue', 'job', 'result'] as const,
  registers: [registry],
});

const backgroundJobDurationSeconds = new Histogram({
  name: 'thryftverse_background_job_duration_seconds',
  help: 'Background job execution duration by queue/job',
  labelNames: ['queue', 'job'] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 120],
  registers: [registry],
});

const recommendationServesTotal = new Counter({
  name: 'thryftverse_recommendation_serves_total',
  help: 'Recommendation serves grouped by source, policy, and cold-start status',
  labelNames: ['source', 'policy_version', 'cold_start'] as const,
  registers: [registry],
});

const recommendationServeDurationSeconds = new Histogram({
  name: 'thryftverse_recommendation_serve_duration_seconds',
  help: 'Decision-service or fallback recommendation latency',
  labelNames: ['source', 'policy_version'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
});

const recommendationResults = new Histogram({
  name: 'thryftverse_recommendation_results',
  help: 'Number of recommendation results returned per serve',
  labelNames: ['source', 'policy_version'] as const,
  buckets: [0, 1, 4, 8, 12, 18, 24, 50, 100],
  registers: [registry],
});

const databasePoolConnections = new Gauge({
  name: 'thryftverse_database_pool_connections',
  help: 'Postgres pool connections grouped by pool and state',
  labelNames: ['pool', 'state'] as const,
  registers: [registry],
});

const redisConnectionState = new Gauge({
  name: 'thryftverse_redis_connection_state',
  help: 'Redis connection state (1 for connected, 0 for disconnected)',
  labelNames: ['state'] as const,
  registers: [registry],
});

const gmvTotal = new Counter({
  name: 'thryftverse_gmv_total',
  help: 'Gross merchandise value total in GBP (incremented on order completion)',
  registers: [registry],
});

const searchIndexLagSeconds = new Histogram({
  name: 'thryftverse_search_index_lag_seconds',
  help: 'Lag between a listing update (updated_at) and its search-index write reaching the labelled stage. outcome="submitted" measures enqueue-acknowledgement only (NOT visibility); outcome="completed" measures confirmed-applied lag; outcome="fallback" measures process-local fallback writes',
  labelNames: ['backend', 'outcome'] as const,
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 300],
  registers: [registry],
});

const searchSyncTotal = new Counter({
  name: 'thryftverse_search_sync_total',
  help: 'Search index sync outcomes by operation and result. The outcome label distinguishes submitted (enqueue-ack), completed (task confirmed applied), failed, and fallback (process-local index write after remote failure)',
  labelNames: ['op', 'result', 'outcome'] as const,
  registers: [registry],
});

const searchReindexLeaseTotal = new Counter({
  name: 'thryftverse_search_reindex_lease_total',
  help: 'Global search-reindex lease lifecycle outcomes. The lease is a durable fenced row in Postgres (migration 338) — safe through PgBouncer transaction pooling, unlike session advisory locks',
  labelNames: ['outcome'] as const,
  registers: [registry],
});

const aiSpendReservationsTotal = new Counter({
  name: 'thryftverse_ai_spend_reservations_total',
  help: 'AI daily-budget spend reservation lifecycle. action="reserved" counts admissions that took a reservation, "budget_blocked" admissions denied by the daily cap, "settled" completions that topped up to the real cost, "refunded" reservations returned on failure/under-estimate',
  labelNames: ['action'] as const,
  registers: [registry],
});

const listingsCreatedTotal = new Counter({
  name: 'thryftverse_listings_created_total',
  help: 'Total listings created',
  registers: [registry],
});

const ordersCompletedTotal = new Counter({
  name: 'thryftverse_orders_completed_total',
  help: 'Total orders completed (delivered)',
  registers: [registry],
});

const userSignupsTotal = new Counter({
  name: 'thryftverse_user_signups_total',
  help: 'Total user signups',
  labelNames: ['method'] as const,
  registers: [registry],
});

function normalizeRouteLabel(route: string): string {
  const trimmed = route.trim();
  if (!trimmed) {
    return 'unknown';
  }

  return trimmed
    .replace(/\/+/g, '/')
    .replace(/\/$/, '')
    .toLowerCase();
}

export function observeHttpRequest(input: {
  method: string;
  route: string;
  statusCode: number;
  durationSeconds: number;
}): void {
  const labels = {
    method: input.method.toUpperCase(),
    route: normalizeRouteLabel(input.route),
    status: String(input.statusCode),
  };

  httpRequestsTotal.inc(labels, 1);
  httpRequestDurationSeconds.observe(labels, Math.max(0, input.durationSeconds));
}

export function recordPaymentTransition(input: {
  channel: string;
  from: string;
  to: string;
  gateway: string;
}): void {
  paymentTransitionsTotal.inc(
    {
      channel: input.channel,
      from: input.from,
      to: input.to,
      gateway: input.gateway,
    },
    1
  );
}

export function recordAuctionSettlement(result: 'settled' | 'no_action' | 'failed'): void {
  auctionSettlementsTotal.inc({ result }, 1);
}

export function recordPushDelivery(input: {
  provider: string;
  status: 'sent' | 'failed' | 'queued' | 'ticketed' | 'suppressed';
}): void {
  pushDeliveriesTotal.inc(
    {
      provider: input.provider,
      status: input.status,
    },
    1
  );
}

export function recordPushTicketError(input: {
  provider: string;
  error: string;
}): void {
  pushTicketErrorsTotal.inc(
    {
      provider: input.provider,
      error: input.error,
    },
    1
  );
}

export function recordBackgroundJob(input: {
  queue: string;
  job: string;
  result: 'completed' | 'failed';
}): void {
  backgroundJobsTotal.inc(
    {
      queue: input.queue,
      job: input.job,
      result: input.result,
    },
    1
  );
}

export function recordBackgroundJobDuration(input: {
  queue: string;
  job: string;
  durationSeconds: number;
}): void {
  backgroundJobDurationSeconds.observe(
    {
      queue: input.queue,
      job: input.job,
    },
    Math.max(0, input.durationSeconds),
  );
}

export function recordRecommendationServe(input: {
  source: 'decision_service' | 'fallback';
  policyVersion: string;
  coldStart: boolean;
  durationSeconds: number;
  resultCount: number;
}): void {
  const labels = {
    source: input.source,
    policy_version: input.policyVersion,
  };
  recommendationServesTotal.inc(
    { ...labels, cold_start: String(input.coldStart) },
    1,
  );
  recommendationServeDurationSeconds.observe(
    labels,
    Math.max(0, input.durationSeconds),
  );
  recommendationResults.observe(labels, Math.max(0, input.resultCount));
}

export function observeDatabasePool(input: {
  pool: 'primary' | 'replica';
  total: number;
  idle: number;
  waiting: number;
}): void {
  databasePoolConnections.set({ pool: input.pool, state: 'total' }, input.total);
  databasePoolConnections.set({ pool: input.pool, state: 'idle' }, input.idle);
  databasePoolConnections.set({ pool: input.pool, state: 'waiting' }, input.waiting);
}

export function observeRedisConnection(connected: boolean): void {
  redisConnectionState.set({ state: 'connected' }, connected ? 1 : 0);
  redisConnectionState.set({ state: 'disconnected' }, connected ? 0 : 1);
}

export function recordGmv(amountGbp: number): void {
  gmvTotal.inc(Math.max(0, amountGbp));
}

export function recordAiSpendReservation(
  action: 'reserved' | 'budget_blocked' | 'settled' | 'refunded',
): void {
  aiSpendReservationsTotal.inc({ action });
}

export function recordListingCreated(): void {
  listingsCreatedTotal.inc(1);
}

export function recordOrderCompleted(): void {
  ordersCompletedTotal.inc(1);
}

export function recordUserSignup(method: string): void {
  userSignupsTotal.inc({ method }, 1);
}

/**
 * Outcome of a single search-index write, honestly classified (audit §4.7):
 *   submitted — the shared backend accepted the write (a Meilisearch task was
 *     enqueued). Acknowledgement is NOT visibility: the document is not
 *     searchable until the task completes.
 *   completed — the write's Meilisearch task was confirmed `succeeded`; only
 *     this outcome implies the document is actually served by the index.
 *   failed    — the write threw, or its task definitively failed/canceled.
 *   fallback  — the write landed in the process-local index because the
 *     shared backend was unavailable (per-replica, not the shared corpus).
 */
export type SearchSyncOutcome = 'submitted' | 'completed' | 'failed' | 'fallback';

/**
 * Observe the lag between a listing's `updated_at` and the moment its
 * search-index write reaches the labelled stage. `outcome="submitted"` is
 * submission lag (task enqueue ack); `outcome="completed"` is the true
 * visibility lag the freshness alert reads. The series name is unchanged so
 * existing dashboards keep working — the new `outcome` label disaggregates
 * the honest signal (R28/R91, audit §4.7).
 */
export function observeSearchIndexLag(
  backend: string,
  lagSeconds: number,
  outcome: 'submitted' | 'completed' | 'fallback' = 'submitted',
): void {
  if (!Number.isFinite(lagSeconds) || lagSeconds < 0) return;
  searchIndexLagSeconds.observe({ backend, outcome }, lagSeconds);
}

export function recordSearchSync(
  op: 'index' | 'remove',
  result: 'ok' | 'error',
  outcome: SearchSyncOutcome = result === 'error' ? 'failed' : 'submitted',
): void {
  searchSyncTotal.inc({ op, result, outcome });
}

/**
 * Record a global-reindex lease lifecycle event. `contended` means a second
 * caller skipped its run because a live lease exists — expected under
 * overlap, not an error. `heartbeat_lost`/`release_missed` mean the lease
 * row changed hands underneath this process — investigate.
 */
export function recordSearchReindexLease(
  outcome:
    | 'acquired'
    | 'contended'
    | 'acquire_error'
    | 'heartbeat_lost'
    | 'released'
    | 'release_missed'
    | 'release_error',
): void {
  searchReindexLeaseTotal.inc({ outcome });
}

export async function renderMetrics(): Promise<string> {
  return registry.metrics();
}

export function metricsContentType(): string {
  return registry.contentType;
}
