import crypto from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Redis } from 'ioredis';
import type { Pool } from 'pg';
import { z } from 'zod';
import { recordRecommendationServe } from '../lib/metrics.js';

export interface RerankCandidate {
  id: string;
  sellerId: string;
  category: string | null;
  createdAt: string;
  sellerRating: number | null;
  sellerHasRecentDispute: boolean;
  baseScore: number;
}

export interface RerankUserProfile {
  purchasedCategories: Set<string>;
  savedCategories: Set<string>;
  viewedCategories: Set<string>;
}

export interface RerankedCandidate extends RerankCandidate {
  score: number;
  position: number;
  componentScores: {
    baseScore: number;
    sellerQuality: number;
    freshness: number;
    purchaseRelevance: number;
    savedRelevance: number;
    viewedRelevance: number;
    badOutcomeSuppression: number;
  };
}

/** Deterministic, explainable baseline used when the decision service is unavailable. */
export function rerankCandidates(
  candidates: RerankCandidate[],
  profile: RerankUserProfile,
  options: { generatedAt: string },
): RerankedCandidate[] {
  const generatedAt = Date.parse(options.generatedAt);
  const scored = candidates.map((candidate) => {
    const ageDays = Math.max(0, (generatedAt - Date.parse(candidate.createdAt)) / 86_400_000);
    const freshness = Math.max(0, Math.min(1, 1 - ageDays / 90));
    const sellerQuality = candidate.sellerRating == null ? 0.5 : Math.max(0, Math.min(1, candidate.sellerRating / 5));
    const purchaseRelevance = profile.purchasedCategories.has(candidate.category ?? '') ? 1 : 0;
    const savedRelevance = profile.savedCategories.has(candidate.category ?? '') ? 1 : 0;
    const viewedRelevance = profile.viewedCategories.has(candidate.category ?? '') ? 1 : 0;
    const badOutcomeSuppression = candidate.sellerHasRecentDispute ? 0 : 1;
    const score = Math.max(0, Math.min(1,
      candidate.baseScore * 0.45
      + sellerQuality * 0.15
      + freshness * 0.1
      + purchaseRelevance * 0.15
      + savedRelevance * 0.08
      + viewedRelevance * 0.07,
    )) * (candidate.sellerHasRecentDispute ? 0.35 : 1);
    return {
      ...candidate,
      score,
      componentScores: { baseScore: candidate.baseScore, sellerQuality, freshness, purchaseRelevance, savedRelevance, viewedRelevance, badOutcomeSuppression },
    };
  });
  scored.sort((a, b) => b.score - a.score || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const result: RerankedCandidate[] = [];
  const sellerCounts = new Map<string, number>();
  const pending = [...scored];
  while (pending.length > 0) {
    const nextIndex = pending.findIndex((candidate) => (sellerCounts.get(candidate.sellerId) ?? 0) < 3);
    const index = nextIndex === -1 ? 0 : nextIndex;
    const [candidate] = pending.splice(index, 1);
    sellerCounts.set(candidate.sellerId, (sellerCounts.get(candidate.sellerId) ?? 0) + 1);
    result.push({ ...candidate, position: result.length + 1 });
  }
  return result;
}

const POLICY_VERSION = 'recommendation-heuristic-v2.0';
const FALLBACK_POLICY_VERSION = 'recommendation-fallback-v2.0';
const FEATURE_SCHEMA_VERSION = 'recommendation-features-v2';
const FALLBACK_FEATURE_SCHEMA_VERSION = 'recommendation-fallback-features-v2';
const CACHE_TTL_SECONDS = 60;
const CIRCUIT_FAILURE_WINDOW_SECONDS = 60;
const CIRCUIT_OPEN_SECONDS = 30;
const CIRCUIT_FAILURE_THRESHOLD = 5;

type RouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  redis: Redis;
  decisionServiceUrl: string;
  decisionServiceTimeoutMs: number;
  decisionServiceToken: string;
  resolveAuthenticatedUserId: (
    request: FastifyRequest,
    requestedUserId?: string,
  ) => string;
};

type ListingRow = {
  id: string;
  seller_id: string;
  title: string;
  description: string;
  category: string | null;
  brand: string | null;
  size: string | null;
  condition: string | null;
  price_gbp: string;
  image_url: string | null;
  created_at: string;
  interaction_count: string;
  seller_rating: string | null;
};

type DecisionRecommendation = {
  listing_id: string;
  score: number;
  model: string;
  policy: 'exploit' | 'explore';
  position: number;
  reason_codes: string[];
  component_scores: Record<string, number>;
};

type DecisionMetadata = {
  request_id: string;
  policy_version: string;
  feature_schema_version: string;
  capability_level: 'heuristic_baseline' | 'trained_model';
  trained_model: boolean;
  generated_at: string;
  candidate_count: number;
  eligible_count: number;
  result_count: number;
  exploration_rate: number;
  cold_start: boolean;
  diagnostics: Record<string, unknown>;
};

type DecisionResult = {
  source: 'decision_service' | 'fallback';
  decision: DecisionMetadata;
  recommendations: DecisionRecommendation[];
};

const decisionResponseSchema = z.object({
  decision: z.object({
    request_id: z.string().min(8),
    policy_version: z.string().min(2),
    feature_schema_version: z.string().min(2),
    capability_level: z.enum(['heuristic_baseline', 'trained_model']),
    trained_model: z.boolean(),
    generated_at: z.string().datetime({ offset: true }),
    candidate_count: z.number().int().nonnegative(),
    eligible_count: z.number().int().nonnegative(),
    result_count: z.number().int().nonnegative(),
    exploration_rate: z.number().min(0).max(1),
    cold_start: z.boolean(),
    diagnostics: z.record(z.unknown()),
  }),
  recommendations: z.array(
    z.object({
      listing_id: z.string().min(2),
      score: z.number().min(0).max(1),
      model: z.string().min(2),
      policy: z.enum(['exploit', 'explore']),
      position: z.number().int().positive(),
      reason_codes: z.array(z.string().min(1)).max(8),
      component_scores: z.record(z.number().min(0).max(1)),
    }),
  ),
});

const INTERACTION_ACTIONS = [
  'view', 'wishlist', 'purchase',
  'qualified_detail_view', 'rapid_skip',
  'save', 'unsave', 'share',
  'follow_seller', 'unfollow_seller', 'open_seller_profile',
  'offer_started', 'offer_submitted', 'message_seller_started',
  'add_to_basket', 'checkout_started',
  'not_interested', 'show_fewer', 'report_content',
] as const;
type InteractionAction = (typeof INTERACTION_ACTIONS)[number];

const interactionSchema = z.object({
  userId: z.string().min(2),
  listingId: z.string().min(2),
  action: z.enum(INTERACTION_ACTIONS),
  strength: z.number().positive().max(20).default(1),
  requestId: z.string().min(8).max(120).optional(),
  position: z.number().int().positive().max(100).optional(),
  model: z.string().min(2).max(120).optional(),
  policyVersion: z.string().min(2).max(120).optional(),
  idempotencyKey: z.string().min(8).max(160),
  surface: z.string().min(2).max(60).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const analyticsSchema = z.object({
  event: z.string().min(1).max(100),
  listingId: z.string().optional(),
  sectionKey: z.string().optional(),
  position: z.number().int().optional(),
  reasonCode: z.string().optional(),
  personalised: z.boolean().optional(),
  sessionId: z.string().optional(),
  surface: z.string().min(2).max(50).optional(),
});

const ANALYTICS_ENVELOPE_VERSION = '1.0';

const recommendationParamsSchema = z.object({ userId: z.string().min(2) });
const recommendationQuerySchema = z.object({
  surface: z.string().min(2).max(60).default('home_feed'),
  sessionId: z.string().min(4).max(160).optional(),
});

const impressionConfirmationSchema = z.object({
  requestId: z.string().min(8).max(120),
  entries: z
    .array(
      z.object({
        listingId: z.string().min(2).max(120),
        status: z.enum(['rendered', 'viewable']),
        viewability: z.record(z.unknown()).optional(),
      }),
    )
    .min(1)
    .max(100),
});

function intentEpochKey(userId: string): string {
  return `recommendations:intent:${userId}`;
}

async function resolveIntentEpoch(
  redis: Redis,
  userId: string,
  log: { warn: (info: Record<string, unknown>, msg: string) => void },
): Promise<string> {
  try {
    const epoch = await redis.get(intentEpochKey(userId));
    return epoch ?? '0';
  } catch (error) {
    log.warn({ err: error }, 'Recommendation intent epoch unavailable');
    return '0';
  }
}

function qualityScore(row: ListingRow): number {
  const fields = [
    row.image_url,
    row.description.length >= 40 ? row.description : null,
    row.category,
    row.brand,
    row.size,
    row.condition,
  ];
  return Number((0.35 + fields.filter(Boolean).length * (0.65 / fields.length)).toFixed(6));
}

function fallbackDecision(
  rows: ListingRow[],
  requestId: string,
  generatedAt: string,
): DecisionResult {
  const maximumInteractions = Math.max(
    1,
    ...rows.map((row) => Number(row.interaction_count)),
  );
  const now = Date.parse(generatedAt);
  const recommendations = rows
    .map((row) => {
      const ageDays = Math.max(0, (now - Date.parse(row.created_at)) / 86_400_000);
      const freshness = Math.exp(-ageDays / 28);
      const popularity = Math.log1p(Number(row.interaction_count))
        / Math.log1p(maximumInteractions);
      const quality = qualityScore(row);
      const sellerTrust = row.seller_rating == null
        ? 0.5
        : Math.min(1, Math.max(0, Number(row.seller_rating) / 5));
      const score = 0.36 * quality + 0.29 * popularity + 0.22 * freshness + 0.13 * sellerTrust;
      return {
        listing_id: row.id,
        score: Number(Math.min(1, Math.max(0, score)).toFixed(6)),
        model: 'fallback_quality_recency_v2',
        policy: 'exploit' as const,
        position: 0,
        reason_codes: ['decision_service_unavailable', 'listing_quality'],
        component_scores: {
          quality: Number(quality.toFixed(6)),
          popularity: Number(popularity.toFixed(6)),
          freshness: Number(freshness.toFixed(6)),
          seller_trust: Number(sellerTrust.toFixed(6)),
        },
      };
    })
    .sort((left, right) => right.score - left.score || left.listing_id.localeCompare(right.listing_id))
    .slice(0, 24)
    .map((item, index) => ({ ...item, position: index + 1 }));

  return {
    source: 'fallback',
    decision: {
      request_id: requestId,
      policy_version: FALLBACK_POLICY_VERSION,
      feature_schema_version: FALLBACK_FEATURE_SCHEMA_VERSION,
      capability_level: 'heuristic_baseline',
      trained_model: false,
      generated_at: generatedAt,
      candidate_count: rows.length,
      eligible_count: rows.length,
      result_count: recommendations.length,
      exploration_rate: 0,
      cold_start: true,
      diagnostics: { decision_service_unavailable: true },
    },
    recommendations,
  };
}

async function recordServe(
  db: Pool,
  input: DecisionResult,
  userId: string,
  surface: string,
  sessionId: string | undefined,
  latencyMs: number,
  intentVersion: number = 0,
  serveMode: string = 'personalized',
): Promise<void> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO recommendation_serves (
         request_id, user_id, policy_version, feature_schema_version,
         capability_level, source, surface, session_id, candidate_count,
         eligible_count, result_count, exploration_rate, cold_start,
         latency_ms, diagnostics, generated_at, intent_version, serve_mode
       )
       VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
       )`,
      [
        input.decision.request_id,
        userId,
        input.decision.policy_version,
        input.decision.feature_schema_version,
        input.decision.capability_level,
        input.source,
        surface,
        sessionId ?? null,
        input.decision.candidate_count,
        input.decision.eligible_count,
        input.decision.result_count,
        input.decision.exploration_rate,
        input.decision.cold_start,
        latencyMs,
        input.decision.diagnostics,
        input.decision.generated_at,
        intentVersion,
        serveMode,
      ],
    );
    // Candidate-source lineage and selection propensity (migration 142).
    //
    // The current heuristic baseline retrieves every candidate from a single
    // SQL keyset over recent active listings, so all rows share one source.
    // source_rank mirrors the final position and source_score mirrors the
    // served score because there is no separate retrieval stage yet. As the
    // retrieval funnel matures into multiple sources (text_hybrid, visual,
    // item_to_item, user_affinity, …) these fields will diverge from the final
    // rank/score and carry the source's own ordering.
    //
    // selection_propensity is the IPW key for unbiased off-policy evaluation.
    // For the deterministic-novelty exploration policy: exploit candidates are
    // selected with probability (1 - exploration_rate) and explore candidates
    // share the exploration mass evenly (exploration_rate / result_count).
    // This is an approximation — exact propensity logging is refined as the
    // retrieval funnel matures. While exploration_rate is 0 (fallback path),
    // exploit propensity collapses to 1, which is honest for a deterministic
    // fallback and is the correct IPW weight only under a deterministic
    // logging policy assumption (documented limitation).
    const explorationRate = input.decision.exploration_rate;
    const resultCount = Math.max(1, input.decision.result_count);
    const explorePropensity = explorationRate / resultCount;
    const exploitPropensity = 1 - explorationRate;
    const candidateSource = 'recent_sql_keyset';
    const retrievalVersion = 'v1';

    for (const recommendation of input.recommendations) {
      const selectionPropensity =
        recommendation.policy === 'explore' ? explorePropensity : exploitPropensity;
      await client.query(
        `INSERT INTO recommendation_impressions (
           request_id, user_id, listing_id, position, score, policy, model,
           reason_codes, component_scores, status,
           candidate_source, source_rank, source_score, retrieval_version,
           selection_propensity
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'served', $10, $11, $12, $13, $14)`,
        [
          input.decision.request_id,
          userId,
          recommendation.listing_id,
          recommendation.position,
          recommendation.score,
          recommendation.policy,
          recommendation.model,
          recommendation.reason_codes,
          recommendation.component_scores,
          candidateSource,
          recommendation.position,
          recommendation.score,
          retrievalVersion,
          Number(selectionPropensity.toFixed(6)),
        ],
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export function registerRecommendationRoutes({
  app,
  db,
  redis,
  decisionServiceUrl,
  decisionServiceTimeoutMs,
  decisionServiceToken,
  resolveAuthenticatedUserId,
}: RouteDependencies): void {
  app.post('/interactions', async (request, reply) => {
    const payload = interactionSchema.parse(request.body);
    const userId = resolveAuthenticatedUserId(request, payload.userId);

    let attribution: {
      score: number | null;
      policy: 'exploit' | 'explore' | null;
      position: number | null;
      model: string | null;
      policyVersion: string | null;
    } = {
      score: null,
      policy: null,
      position: null,
      model: null,
      policyVersion: null,
    };
    if (payload.requestId) {
      const impression = await db.query<{
        score: string;
        policy: 'exploit' | 'explore';
        position: number;
        model: string;
        policy_version: string;
      }>(
        `SELECT
           ri.score::text, ri.policy, ri.position, ri.model, rs.policy_version
         FROM recommendation_impressions ri
         INNER JOIN recommendation_serves rs ON rs.request_id = ri.request_id
         WHERE ri.request_id = $1
           AND ri.user_id = $2
           AND ri.listing_id = $3
         LIMIT 1`,
        [payload.requestId, userId, payload.listingId],
      );
      if (!impression.rowCount) {
        reply.code(422);
        return { ok: false, error: 'Recommendation attribution does not match this user and listing' };
      }
      const row = impression.rows[0];
      attribution = {
        score: Number(row.score),
        policy: row.policy,
        position: row.position,
        model: row.model,
        policyVersion: row.policy_version,
      };
    }

    const client = await db.connect();
    let inserted = false;
    try {
      await client.query('BEGIN');
      const interaction = await client.query<{ id: string }>(
        `INSERT INTO interactions (
           user_id, listing_id, action, strength, idempotency_key, request_id,
           position, policy_version, metadata
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT DO NOTHING
         RETURNING id::text`,
        [
          userId,
          payload.listingId,
          payload.action,
          payload.strength,
          payload.idempotencyKey,
          payload.requestId ?? null,
          attribution.position,
          attribution.policyVersion,
          payload.metadata ?? {},
        ],
      );
      inserted = Boolean(interaction.rowCount);
      if (inserted && payload.requestId) {
        await client.query(
          `INSERT INTO recommendation_feedback (
             user_id, listing_id, action, served_score, served_policy, surface,
             request_id, position, model, policy_version, idempotency_key, metadata
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            userId,
            payload.listingId,
            payload.action,
            attribution.score,
            attribution.policy,
            payload.surface ?? null,
            payload.requestId,
            attribution.position,
            attribution.model,
            attribution.policyVersion,
            payload.idempotencyKey,
            payload.metadata ?? {},
          ],
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    if (!inserted) {
      return { ok: true, deduplicated: true };
    }

    try {
      await redis
        .multi()
        .lpush(
          `events:user:${userId}`,
          JSON.stringify({
            listingId: payload.listingId,
            action: payload.action,
            strength: payload.strength,
            requestId: payload.requestId,
            ts: new Date().toISOString(),
          }),
        )
        .ltrim(`events:user:${userId}`, 0, 199)
        .incr(intentEpochKey(userId))
        .exec();
    } catch (error) {
      request.log.warn(
        { err: error, userId, listingId: payload.listingId },
        'Interaction persisted but recommendation cache invalidation was unavailable',
      );
    }

    reply.code(201);
    return { ok: true, deduplicated: false };
  });

  app.post('/analytics/events', async (request, reply) => {
    const payload = analyticsSchema.parse(request.body);
    const userId = request.authUser?.userId ?? null;
    const eventTime = new Date().toISOString();

    // ────────────────────────────────────────────────────────────────────
    // Operational telemetry — Redis capped list (last 1000 entries).
    // This is NOT a durable training data source. It exists for real-time
    // operational dashboards and ad-hoc inspection. Data is evicted as the
    // list grows beyond 1000 entries (LTRIM). The durable record is the
    // Postgres analytics_events table written below.
    // ────────────────────────────────────────────────────────────────────
    const eventKey = `analytics:${payload.event}`;
    try {
      await redis
        .multi()
        .lpush(eventKey, JSON.stringify({ ...payload, userId, ts: eventTime }))
        .ltrim(eventKey, 0, 999)
        .exec();
    } catch (error) {
      request.log.warn(
        { err: error, event: payload.event },
        'Analytics operational telemetry (Redis) write failed — non-fatal',
      );
    }

    // ────────────────────────────────────────────────────────────────────
    // Durable training ledger — Postgres append-only analytics_events
    // table. Fire-and-forget: the response is not blocked and a failure
    // here does not fail the analytics request (analytics is best-effort).
    // The canonical event envelope (§5.1) is used so downstream ML
    // feature pipelines and batch export jobs read from a single
    // durable source of truth.
    // ────────────────────────────────────────────────────────────────────
    const properties: Record<string, unknown> = {};
    if (payload.listingId !== undefined) properties.listing_id = payload.listingId;
    if (payload.sectionKey !== undefined) properties.section_key = payload.sectionKey;
    if (payload.position !== undefined) properties.position = payload.position;
    if (payload.reasonCode !== undefined) properties.reason_code = payload.reasonCode;
    if (payload.personalised !== undefined) properties.personalised = payload.personalised;

    void db
      .query(
        `INSERT INTO analytics_events (
           event_name, schema_version, event_time, actor_user_id,
           session_id, request_id, surface, properties
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
        [
          payload.event,
          ANALYTICS_ENVELOPE_VERSION,
          eventTime,
          userId,
          payload.sessionId ?? null,
          request.id,
          payload.surface ?? null,
          JSON.stringify(properties),
        ],
      )
      .catch((error) => {
        request.log.error(
          { err: error, event: payload.event, userId },
          'Analytics durable write (Postgres analytics_events) failed — non-fatal, event may be lost',
        );
      });

    reply.code(202);
    return { ok: true };
  });

  // Client-confirmed recommendation exposure. A row written at response time is
  // only a serve candidate; the client must confirm that the cell rendered and
  // crossed a viewability threshold before training treats it as an impression.
  // Status only advances forward (served -> rendered -> viewable).
  app.post('/recommendations/impressions', async (request, reply) => {
    const payload = impressionConfirmationSchema.parse(request.body);
    const userId = resolveAuthenticatedUserId(request);
    const now = new Date().toISOString();
    const client = await db.connect();
    let updated = 0;
    try {
      await client.query('BEGIN');
      for (const entry of payload.entries) {
        const result = await client.query<{ status: string }>(
          `UPDATE recommendation_impressions
             SET status = $1,
                 rendered_at = COALESCE(
                   rendered_at,
                   CASE WHEN $1 IN ('rendered','viewable') THEN $2 END
                 ),
                 viewable_at = COALESCE(
                   viewable_at,
                   CASE WHEN $1 = 'viewable' THEN $2 END
                 ),
                 viewability = COALESCE($3, viewability)
           WHERE request_id = $4
             AND user_id = $5
             AND listing_id = $6
             AND (CASE status
                    WHEN 'served' THEN 0
                    WHEN 'rendered' THEN 1
                    WHEN 'viewable' THEN 2
                  END) <= (CASE $1
                             WHEN 'rendered' THEN 1
                             WHEN 'viewable' THEN 2
                           END)
           RETURNING status`,
          [
            entry.status,
            now,
            entry.viewability ?? null,
            payload.requestId,
            userId,
            entry.listingId,
            entry.status,
          ],
        );
        updated += result.rowCount ?? 0;
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    reply.code(updated ? 200 : 404);
    return { ok: updated > 0, updated };
  });

  app.get('/recommendations/:userId', async (request, reply) => {
    const { userId: requestedUserId } = recommendationParamsSchema.parse(request.params);
    const userId = resolveAuthenticatedUserId(request, requestedUserId);
    const { surface, sessionId } = recommendationQuerySchema.parse(request.query);
    const intentEpoch = await resolveIntentEpoch(redis, userId, request.log);
    const cacheKey = `recommendations:v2:${userId}:${surface}:${POLICY_VERSION}:${intentEpoch}`;

    let dbIntentVersion = 0;
    let profileMode = 'personalized';
    try {
      const intentRow = await db.query<{ intent_version: string; profile_mode: string }>(
        'SELECT intent_version, profile_mode FROM user_intent_versions WHERE user_id = $1',
        [userId],
      );
      if (intentRow.rows.length > 0) {
        dbIntentVersion = Number(intentRow.rows[0].intent_version);
        profileMode = intentRow.rows[0].profile_mode;
      }
    } catch (error) {
      request.log.warn({ err: error, userId }, 'Intent version read failed');
    }
    const generatedAt = new Date().toISOString();
    const requestId = `rec_${crypto.randomUUID()}`;

    const listingsResult = await db.query<ListingRow>(
      `WITH interaction_counts AS (
         SELECT listing_id, COUNT(*)::text AS interaction_count
         FROM interactions
         WHERE created_at >= NOW() - INTERVAL '30 days'
         GROUP BY listing_id
       ),
       seller_ratings AS (
         -- Reputation feature is in shadow mode (Phase 0 contract-truth repair).
         -- Raw AVG/5 was an unsafe trust signal: one 5-star review produced a
         -- perfect 1.0 trust score while a new seller got 0.5, creating
         -- incumbent bias and a gaming surface. Until a calibrated Bayesian
         -- feature with fairness guardrails is shadow-tested, all sellers
         -- receive a neutral 0.5 so ranking is driven by other features only.
         SELECT seller_id, NULL::text AS seller_rating
         FROM (SELECT DISTINCT seller_id FROM listings WHERE seller_id IS NOT NULL) s
       )
       SELECT
         l.id, l.seller_id, l.title, l.description, l.category, l.brand,
         l.size, l.condition, l.price_gbp::text, l.image_url,
         l.created_at::text,
         COALESCE(ic.interaction_count, '0') AS interaction_count,
         sr.seller_rating
       FROM listings l
       LEFT JOIN interaction_counts ic ON ic.listing_id = l.id
       LEFT JOIN seller_ratings sr ON sr.seller_id = l.seller_id
       WHERE l.status = 'active' AND l.seller_id <> $1
       ORDER BY l.created_at DESC, l.id
       LIMIT 500`,
      [userId],
    );

    const interactionsResult = await db.query<{
      listing_id: string;
      action: InteractionAction;
      strength: string;
      created_at: string;
      title: string;
      description: string;
      category: string | null;
      brand: string | null;
      size: string | null;
      condition: string | null;
      price_gbp: string;
    }>(
      `SELECT
         i.listing_id, i.action, i.strength::text, i.created_at::text,
         l.title, l.description, l.category, l.brand, l.size, l.condition,
         l.price_gbp::text
       FROM interactions i
       INNER JOIN listings l ON l.id = i.listing_id
       WHERE i.user_id = $1
       ORDER BY i.created_at DESC
       LIMIT 200`,
      [userId],
    );

    let cached: string | null = null;
    try {
      cached = await redis.get(cacheKey);
    } catch (error) {
      request.log.warn({ err: error }, 'Recommendation cache read unavailable');
    }
    let usedCache = false;
    let result!: DecisionResult;
    let latencyMs = 0;
    if (cached) {
      try {
        const cachedResult = decisionResponseSchema.parse(JSON.parse(cached));
        const activeListingIds = new Set(listingsResult.rows.map((row) => row.id));
        if (cachedResult.recommendations.every((item) => activeListingIds.has(item.listing_id))) {
          usedCache = true;
          result = {
            source: 'decision_service',
            decision: {
              ...cachedResult.decision,
              request_id: requestId,
              generated_at: generatedAt,
              diagnostics: { ...cachedResult.decision.diagnostics, cache_hit: true },
            },
            recommendations: cachedResult.recommendations,
          };
        } else {
          cached = null;
        }
      } catch (error) {
        request.log.warn({ err: error }, 'Discarding invalid recommendation cache entry');
        cached = null;
      }
      if (!cached) {
        try {
          await redis.del(cacheKey);
        } catch (error) {
          request.log.warn({ err: error }, 'Recommendation cache eviction unavailable');
        }
      }
    }
    if (!cached) {
      const startedAt = Date.now();
      let circuitWasOpen = false;
      try {
        try {
          circuitWasOpen = Boolean(await redis.get('decision:circuit:recommendations:v2'));
        } catch (error) {
          request.log.warn({ err: error }, 'Decision circuit state unavailable');
        }
        if (circuitWasOpen) {
          throw new Error('Decision service circuit is open');
        }
        const maximumInteractions = Math.max(
          1,
          ...listingsResult.rows.map((row) => Number(row.interaction_count)),
        );
        const response = await fetch(`${decisionServiceUrl}/recommendations`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-decision-service-token': decisionServiceToken,
          },
          signal: AbortSignal.timeout(decisionServiceTimeoutMs),
          body: JSON.stringify({
            user_id: userId,
            request_id: requestId,
            as_of: generatedAt,
            result_limit: 24,
            candidates: listingsResult.rows.map((row) => ({
              listing_id: row.id,
              seller_id: row.seller_id,
              title: row.title,
              description: row.description,
              category: row.category ?? '',
              brand: row.brand ?? '',
              size: row.size ?? '',
              condition: row.condition ?? '',
              price_gbp: Number(row.price_gbp),
              created_at: row.created_at,
              quality_score: qualityScore(row),
              popularity_score: Math.log1p(Number(row.interaction_count))
                / Math.log1p(maximumInteractions),
              seller_trust_score: row.seller_rating == null
                ? 0.5
                : Math.min(1, Math.max(0, Number(row.seller_rating) / 5)),
              available: true,
            })),
            recent_interactions: interactionsResult.rows.map((row) => ({
              listing_id: row.listing_id,
              action: row.action,
              strength: Number(row.strength),
              created_at: row.created_at,
              title: row.title,
              description: row.description,
              category: row.category ?? '',
              brand: row.brand ?? '',
              size: row.size ?? '',
              condition: row.condition ?? '',
              price_gbp: Number(row.price_gbp),
            })),
          }),
        });
        if (!response.ok) {
          throw new Error(`Decision service returned HTTP ${response.status}`);
        }
        const parsed = decisionResponseSchema.parse(await response.json());
        if (
          parsed.decision.policy_version !== POLICY_VERSION
          || parsed.decision.feature_schema_version !== FEATURE_SCHEMA_VERSION
        ) {
          throw new Error('Decision service returned an unsupported policy contract');
        }
        const candidateIds = new Set(listingsResult.rows.map((row) => row.id));
        const recommendationIds = new Set(
          parsed.recommendations.map((item) => item.listing_id),
        );
        const recommendationPositions = new Set(
          parsed.recommendations.map((item) => item.position),
        );
        if (
          parsed.decision.result_count !== parsed.recommendations.length
          || recommendationIds.size !== parsed.recommendations.length
          || recommendationPositions.size !== parsed.recommendations.length
          || parsed.recommendations.some((item) => !candidateIds.has(item.listing_id))
        ) {
          throw new Error('Decision service returned an invalid candidate or position set');
        }
        result = {
          source: 'decision_service',
          decision: parsed.decision,
          recommendations: parsed.recommendations,
        };
        try {
          await redis
            .multi()
            .set(cacheKey, JSON.stringify(parsed), 'EX', CACHE_TTL_SECONDS)
            .del('decision:failures:recommendations:v2')
            .del('decision:circuit:recommendations:v2')
            .exec();
        } catch (error) {
          request.log.warn({ err: error }, 'Recommendation cache write unavailable');
        }
      } catch (error) {
        request.log.warn({ err: error }, 'Recommendation decision service unavailable');
        if (!circuitWasOpen) {
          try {
            const failures = await redis.incr('decision:failures:recommendations:v2');
            if (failures === 1) {
              await redis.expire(
                'decision:failures:recommendations:v2',
                CIRCUIT_FAILURE_WINDOW_SECONDS,
              );
            }
            if (failures >= CIRCUIT_FAILURE_THRESHOLD) {
              await redis.set(
                'decision:circuit:recommendations:v2',
                'open',
                'EX',
                CIRCUIT_OPEN_SECONDS,
              );
            }
          } catch (circuitError) {
            request.log.warn(
              { err: circuitError },
              'Decision circuit failure could not be recorded',
            );
          }
        }
        result = fallbackDecision(listingsResult.rows, requestId, generatedAt);
        if (circuitWasOpen) {
          result.decision.diagnostics.circuit_open = true;
        }
      }
      latencyMs = Date.now() - startedAt;
    }

    const baseServeMode =
      result.source === 'fallback' ? 'degraded_baseline' :
      result.decision.cold_start ? 'cold_start' :
      'personalized';
    const serveMode = profileMode === 'non_profiled' ? 'non_profiled' : baseServeMode;

    await recordServe(db, result, userId, surface, sessionId, latencyMs, dbIntentVersion, serveMode);
    recordRecommendationServe({
      source: result.source,
      policyVersion: result.decision.policy_version,
      coldStart: result.decision.cold_start,
      durationSeconds: latencyMs / 1_000,
      resultCount: result.recommendations.length,
    });
    const listingById = new Map(listingsResult.rows.map((row) => [row.id, row]));
    const items = result.recommendations.flatMap((recommendation) => {
      const listing = listingById.get(recommendation.listing_id);
      return listing
        ? [{
            score: recommendation.score,
            model: recommendation.model,
            policy: recommendation.policy,
            position: recommendation.position,
            reasonCodes: recommendation.reason_codes,
            componentScores: recommendation.component_scores,
            listing,
          }]
        : [];
    });

    return {
      source: usedCache ? 'cache' : result.source,
      serveMode,
      intentVersion: dbIntentVersion,
      decision: {
        requestId: result.decision.request_id,
        policyVersion: result.decision.policy_version,
        featureSchemaVersion: result.decision.feature_schema_version,
        capabilityLevel: result.decision.capability_level,
        trainedModel: result.decision.trained_model,
        generatedAt: result.decision.generated_at,
        explorationRate: result.decision.exploration_rate,
        coldStart: result.decision.cold_start,
        diagnostics: result.decision.diagnostics,
      },
      items,
    };
  });
}
