import crypto from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Redis } from 'ioredis';
import type { Pool } from 'pg';
import { z } from 'zod';
import { recordRecommendationServe } from '../lib/metrics.js';

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
  capability_level: 'heuristic_baseline';
  trained_model: false;
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
    capability_level: z.literal('heuristic_baseline'),
    trained_model: z.literal(false),
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

const interactionSchema = z.object({
  userId: z.string().min(2),
  listingId: z.string().min(2),
  action: z.enum(['view', 'wishlist', 'purchase']),
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
});

const recommendationParamsSchema = z.object({ userId: z.string().min(2) });
const recommendationQuerySchema = z.object({
  surface: z.string().min(2).max(60).default('home_feed'),
  sessionId: z.string().min(4).max(160).optional(),
});

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
): Promise<void> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO recommendation_serves (
         request_id, user_id, policy_version, feature_schema_version,
         capability_level, source, surface, session_id, candidate_count,
         eligible_count, result_count, exploration_rate, cold_start,
         latency_ms, diagnostics, generated_at
       )
       VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
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
      ],
    );
    for (const recommendation of input.recommendations) {
      await client.query(
        `INSERT INTO recommendation_impressions (
           request_id, user_id, listing_id, position, score, policy, model,
           reason_codes, component_scores
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
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
        .del(`recommendations:v2:${userId}`)
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
    const eventKey = `analytics:${payload.event}`;
    await redis
      .multi()
      .lpush(eventKey, JSON.stringify({ ...payload, userId, ts: new Date().toISOString() }))
      .ltrim(eventKey, 0, 999)
      .exec();
    reply.code(202);
    return { ok: true };
  });

  app.get('/recommendations/:userId', async (request, reply) => {
    const { userId: requestedUserId } = recommendationParamsSchema.parse(request.params);
    const userId = resolveAuthenticatedUserId(request, requestedUserId);
    const { surface, sessionId } = recommendationQuerySchema.parse(request.query);
    const cacheKey = `recommendations:v2:${userId}`;
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
         SELECT seller_id, AVG(rating)::text AS seller_rating
         FROM order_reviews
         GROUP BY seller_id
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
      action: 'view' | 'wishlist' | 'purchase';
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

    await recordServe(db, result, userId, surface, sessionId, latencyMs);
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
      decision: {
        requestId: result.decision.request_id,
        policyVersion: result.decision.policy_version,
        featureSchemaVersion: result.decision.feature_schema_version,
        capabilityLevel: result.decision.capability_level,
        trainedModel: false,
        generatedAt: result.decision.generated_at,
        explorationRate: result.decision.exploration_rate,
        coldStart: result.decision.cold_start,
        diagnostics: result.decision.diagnostics,
      },
      items,
    };
  });
}
