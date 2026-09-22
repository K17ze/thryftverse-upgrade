import crypto from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Redis } from 'ioredis';
import type { Pool } from 'pg';
import { z } from 'zod';
import { recordRecommendationServe } from '../lib/metrics.js';
import {
  REACH_LIMITED_MULTIPLIER,
  reachExcludedSql,
  reachJoinSql,
} from '../lib/sellerReach.js';
import {
  hasMediaEmbeddingVectorColumn,
  mapNeighbourAssetsToListings,
  nearestMediaEmbeddings,
  resolveServingEmbeddingLineage,
  type NearestMediaEmbeddingsResult,
} from '../lib/mediaEmbeddings.js';
import { deserialiseEmbedding } from '../workers/handlers/mediaEmbeddingUtils.js';

// Interaction actions that mark a listing as a positive item-to-item
// retrieval anchor. Negative/weak signals (rapid_skip, not_interested,
// unsave, report_content, …) never seed similarity retrieval.
const POSITIVE_ANCHOR_ACTIONS = new Set<InteractionAction>([
  'wishlist', 'save', 'share', 'purchase',
  'qualified_detail_view', 'offer_submitted', 'add_to_basket',
  'checkout_started',
]);

// Upper bound on the merged multi-source pool — keeps the decision-service
// payload bounded even when every auxiliary source returns at cap.
const MERGED_CANDIDATE_POOL_CAP = 800;

// ── Honest item-to-item source labels (audit S5) ──────────────────────────
// The tag stamped on impressions (`candidate_source`) and reported in
// `diagnostics.retrieval_sources` must be the retrieval method that actually
// produced the hits. lib/mediaEmbeddings.ts reports 'pgvector_ann' only when
// an HNSW/IVFFlat index exists; an unindexed `embedding_vec` scan is
// 'pgvector_exact' and the bounded in-application BYTEA scan is
// 'bytea_exact_scan'. Neither must ever masquerade as ANN.
type MediaEmbeddingRetrievalMethod = NearestMediaEmbeddingsResult['method'];

const ITEM_TO_ITEM_SOURCE_BY_METHOD: Record<MediaEmbeddingRetrievalMethod, string> = {
  pgvector_ann: 'item_to_item_ann',
  pgvector_exact: 'item_to_item_exact',
  bytea_exact_scan: 'item_to_item_fallback',
};

// Capability order for mixed-method anchor fan-out. Capability is probed per
// call so all anchors normally share one method, but if they ever diverge the
// merged lineage reports the weakest method that actually ran — never the
// strongest.
const RETRIEVAL_METHOD_SEVERITY: readonly MediaEmbeddingRetrievalMethod[] = [
  'pgvector_ann',
  'pgvector_exact',
  'bytea_exact_scan',
];

export function itemToItemSourceLabel(
  methods: Iterable<MediaEmbeddingRetrievalMethod>,
): string {
  let weakest: MediaEmbeddingRetrievalMethod = 'pgvector_ann';
  for (const method of methods) {
    if (
      RETRIEVAL_METHOD_SEVERITY.indexOf(method) >
      RETRIEVAL_METHOD_SEVERITY.indexOf(weakest)
    ) {
      weakest = method;
    }
  }
  return ITEM_TO_ITEM_SOURCE_BY_METHOD[weakest];
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
  seller_response_hours: string | null;
  seller_reach_state: string;
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

// ── User-authored feed controls ─────────────────────────────────────────────
// Intent mutations (scope item/seller/brand/category) and topic-projection
// bands (more/less/excluded) are the authoritative record of what the user
// asked to see — they must shape the candidate set and the ranking, not just
// the settings screen (report §22: "Honour reset and removal in the backend
// signal pipeline, not merely in the settings screen").

const DIRECTIVE_TOKEN_PATTERN = /[a-z0-9]+/g;
const DIRECTIVE_PREFIXES = ['category', 'brand', 'size', 'condition'] as const;
type DirectiveBand = 'more' | 'less' | 'excluded';

function directiveTokensOf(text: string): string[] {
  return text.toLowerCase().match(DIRECTIVE_TOKEN_PATTERN) ?? [];
}

function candidateTokenSet(row: ListingRow): Set<string> {
  const tokens = new Set(directiveTokensOf(`${row.title} ${row.description}`));
  for (const prefix of DIRECTIVE_PREFIXES) {
    const value = prefix === 'category' ? row.category
      : prefix === 'brand' ? row.brand
      : prefix === 'size' ? row.size
      : row.condition;
    const normalized = directiveTokensOf(value ?? '').join('_');
    if (normalized) tokens.add(`${prefix}:${normalized}`);
  }
  return tokens;
}

/** Mirror of ml-service `_directive_match`: 0–1 label-vs-candidate match. */
function directiveMatchScore(label: string, candidateTokens: Set<string>): number {
  const tokens = new Set(directiveTokensOf(label));
  if (tokens.size === 0) return 0;
  const compound = [...tokens].sort().join('_');
  if (DIRECTIVE_PREFIXES.some((p) => candidateTokens.has(`${p}:${compound}`))) return 1;
  let matched = 0;
  for (const token of tokens) {
    if (
      candidateTokens.has(token)
      || DIRECTIVE_PREFIXES.some((p) => candidateTokens.has(`${p}:${token}`))
    ) {
      matched += 1;
    }
  }
  return matched / tokens.size;
}

/** ``excluded`` means never show — a decisive (compound or full-token) match. */
function isExcludedByDirective(label: string, candidateTokens: Set<string>): boolean {
  return directiveMatchScore(label, candidateTokens) >= 1;
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
      const baseScore = 0.36 * quality + 0.29 * popularity + 0.22 * freshness + 0.13 * sellerTrust;
      // Reach demotion: 'limited' sellers keep 30% of scored distribution
      // (lib/sellerReach.ts); 'suspended' rows never reach this scorer —
      // the candidate query excludes them via reachExcludedSql.
      const score = row.seller_reach_state === 'limited'
        ? baseScore * REACH_LIMITED_MULTIPLIER
        : baseScore;
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

/**
 * Candidate-pool SQL shared by every retrieval source (R19). All sources
 * apply the identical safety predicates — active status, own-listing
 * exclusion, seller reach exclusion — and differ only in extra predicate,
 * ordering, and cap, so per-source lineage stays truthful.
 */
function candidateListingsSql(
  extraPredicate: string,
  orderByClause: string,
  limit: number,
): string {
  return `WITH interaction_counts AS (
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
   ),
   -- G8: Compute median response hours per seller from chat_messages.
   -- Measures time from buyer's first message to seller's first reply.
   seller_response_times AS (
     WITH seller_convos AS (
       SELECT
         li.seller_id,
         c.id AS conversation_id,
         MIN(CASE WHEN m.sender_user_id = li.seller_id THEN m.created_at END) AS first_seller_msg,
         MIN(CASE WHEN m.sender_user_id != li.seller_id THEN m.created_at END) AS first_buyer_msg
       FROM chat_messages m
       JOIN chat_conversations c ON c.id = m.conversation_id
       JOIN listings li ON li.id = c.item_id
       WHERE m.sender_user_id IS NOT NULL
         AND m.deleted_for_everyone_at IS NULL
         AND m.created_at > NOW() - INTERVAL '30 days'
       GROUP BY li.seller_id, c.id
     )
     SELECT seller_id,
       PERCENTILE_CONT(0.5) WITHIN GROUP (
         ORDER BY EXTRACT(EPOCH FROM (first_seller_msg - first_buyer_msg)) / 3600
       )::text AS seller_response_hours
     FROM seller_convos
     WHERE first_seller_msg IS NOT NULL AND first_buyer_msg IS NOT NULL
       AND first_seller_msg > first_buyer_msg
     GROUP BY seller_id
   )
   SELECT
     l.id, l.seller_id, l.title, l.description, l.category, l.brand,
     l.size, l.condition, l.price_gbp::text, l.image_url,
     l.created_at::text,
     COALESCE(ic.interaction_count, '0') AS interaction_count,
     sr.seller_rating,
     srt.seller_response_hours,
     COALESCE(reach_u.reach_state, 'normal') AS seller_reach_state
   FROM listings l
   ${reachJoinSql('reach_u', 'l.seller_id')}
   LEFT JOIN interaction_counts ic ON ic.listing_id = l.id
   LEFT JOIN seller_ratings sr ON sr.seller_id = l.seller_id
   LEFT JOIN seller_response_times srt ON srt.seller_id = l.seller_id
   WHERE l.status = 'active' AND l.seller_id <> $1
     ${reachExcludedSql('reach_u')}
     ${extraPredicate}
   ORDER BY ${orderByClause}
   LIMIT ${Math.max(1, Math.trunc(limit))}`;
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
  sourceByListingId?: Map<string, { source: string; sourceRank: number }>,
  retrievalVersion: string = 'v1_single_source',
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
    // The pool is blended from multiple retrieval sources (R19). Each served
    // impression stamps `candidate_source` with the source that surfaced the
    // listing and `source_rank` with its position inside that source's own
    // ordering — both diverge from the final `position`/`score`, which are
    // the decision service's output. `source_score` still carries the served
    // score: per-source scores are not yet propagated through the merge.
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

    for (const recommendation of input.recommendations) {
      const selectionPropensity =
        recommendation.policy === 'explore' ? explorePropensity : exploitPropensity;
      const lineage = sourceByListingId?.get(recommendation.listing_id);
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
          lineage?.source ?? 'recent_sql_keyset',
          lineage?.sourceRank ?? recommendation.position,
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
      candidateListingsSql('', 'l.created_at DESC, l.id', 500),
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

    // ── User-authored feed controls ────────────────────────────────────────
    // Resolve the intent ledger into (a) hard candidate exclusions — muted
    // items, sellers and "never show" topics — and (b) ranking directives
    // ("show more/less like this") forwarded to the decision service. This
    // runs at the API layer so exclusions also hold on the degraded fallback
    // path and inside cached serve validation.
    let topicDirectives: { label: string; band: DirectiveBand }[] = [];
    const excludedListingIds = new Set<string>();
    const excludedSellerIds = new Set<string>();
    // Latest item-scope mutation per listing — the authoritative reversal
    // record for interaction-derived suppression (S21-03, see below).
    const latestItemMutation = new Map<
      string,
      { direction: string; createdAtMs: number }
    >();

    try {
      const bandRows = await db.query<{ topic_label: string; influence_band: string }>(
        `SELECT topic_label, influence_band
         FROM recommendation_topic_projection
         WHERE user_id = $1 AND paused = FALSE
           AND influence_band IN ('more', 'less', 'excluded')`,
        [userId],
      );
      topicDirectives = bandRows.rows.map((row) => ({
        label: row.topic_label,
        band: row.influence_band as DirectiveBand,
      }));
    } catch (error) {
      request.log.warn({ err: error, userId }, 'Topic directive read failed');
    }

    try {
      // Latest mutation per (scope, target) wins, so a later "usual"/"add"
      // reverses an earlier "exclude". Expired directives are ignored.
      const mutationRows = await db.query<{
        scope: string;
        target_id: string;
        target_label: string;
        direction: string;
        created_at: string;
      }>(
        `SELECT scope, target_id, target_label, direction, created_at
         FROM (
           SELECT scope, target_id, target_label, direction, created_at::text,
                  ROW_NUMBER() OVER (
                    PARTITION BY scope, target_id ORDER BY mutation_id DESC
                  ) AS rn
           FROM user_intent_mutations
           WHERE user_id = $1
             AND scope IN ('item', 'seller', 'brand', 'category')
             AND (expires_at IS NULL OR expires_at > now())
         ) latest
         WHERE rn = 1`,
        [userId],
      );
      for (const row of mutationRows.rows) {
        if (row.scope === 'item') {
          latestItemMutation.set(row.target_id, {
            direction: row.direction,
            createdAtMs: Date.parse(row.created_at),
          });
        }
        if (row.direction === 'exclude' || row.direction === 'remove') {
          if (row.scope === 'item') excludedListingIds.add(row.target_id);
          else if (row.scope === 'seller') excludedSellerIds.add(row.target_id);
          else topicDirectives.push({ label: row.target_label, band: 'excluded' });
        } else if (row.direction === 'less' || row.direction === 'more') {
          if (row.scope === 'brand' || row.scope === 'category' || row.scope === 'item') {
            // Item-scope 'less' ("show fewer like this" on a listing with no
            // category/brand facet) binds the directive to the item's label —
            // the bounded less-penalty then down-ranks token-similar
            // candidates instead of the mutation being a no-op ledger write.
            topicDirectives.push({ label: row.target_label, band: row.direction });
          }
        }
      }
    } catch (error) {
      request.log.warn({ err: error, userId }, 'Intent mutation read failed');
    }

    // Item-level negative feedback from the interaction stream suppresses the
    // listing immediately — it must not wait on a ledger projection.
    //
    // Reversal semantics (S21-03): the suppression is derived state and the
    // intent ledger is authoritative for the user's current item intent. The
    // mutate route already retracts committed `not_interested` rows in the
    // same transaction as a restore mutation; this read-side check is the
    // ordering backstop for a hide write that commits AFTER the restore — an
    // item stays suppressed only while its newest hide event is newer than
    // the newest restore mutation.
    //
    //   - A restore ('usual'/'add') supersedes suppression only when its
    //     mutation timestamp is >= the newest hide's. Both columns default
    //     to NOW() (transaction start), so an undo committed while the hide
    //     write was still in flight still wins — the in-flight interaction
    //     carries an earlier transaction-start clock — and ties resolve to
    //     the reversal.
    //   - 'less'/'more' are ranking adjustments, not restores — they never
    //     lift a hide.
    //   - 'report_content' is a trust-and-safety record, not feed taste: it
    //     suppresses unconditionally and is never retracted by an item-intent
    //     mutation.
    const hideAssessedListingIds = new Set<string>();
    for (const row of interactionsResult.rows) {
      if (row.action === 'report_content') {
        excludedListingIds.add(row.listing_id);
        continue;
      }
      if (row.action !== 'not_interested') continue;
      // Interactions arrive newest-first; only the latest hide event per
      // listing competes with the listing's latest intent mutation.
      if (hideAssessedListingIds.has(row.listing_id)) continue;
      hideAssessedListingIds.add(row.listing_id);
      const mutation = latestItemMutation.get(row.listing_id);
      const superseded =
        mutation !== undefined &&
        (mutation.direction === 'usual' || mutation.direction === 'add') &&
        mutation.createdAtMs >= Date.parse(row.created_at);
      if (!superseded) {
        excludedListingIds.add(row.listing_id);
      }
    }

    // ── Multi-source retrieval (R19) ─────────────────────────────────────
    // The candidate pool is blended from independent retrieval sources and
    // each listing carries truthful lineage — which source surfaced it and
    // its rank inside that source — stamped onto served impressions below.
    // Merge happens BEFORE the exclusion filter so user-authored controls
    // apply identically regardless of origin, and every auxiliary source is
    // fail-open: a failing source narrows the pool, it never fails the
    // request. Merge order is claim order — personalized sources tag the
    // listing first so a candidate surfaced by two sources reports the more
    // specific origin.
    const sourceByListingId = new Map<string, { source: string; sourceRank: number }>();
    const mergedListingRows: ListingRow[] = [];
    const sourceContributions: Record<string, number> = {};
    const mergeSource = (rows: ListingRow[], source: string): void => {
      let contributed = 0;
      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index]!;
        if (!sourceByListingId.has(row.id)) {
          sourceByListingId.set(row.id, { source, sourceRank: index });
          mergedListingRows.push(row);
          contributed += 1;
        }
      }
      sourceContributions[source] = contributed;
    };

    // item_to_item — pgvector nearest-neighbour retrieval anchored on the
    // media embeddings of listings the user recently signalled interest in.
    // Entered only when migration 326 provisioned embedding_vec; the helper
    // may still serve through an unindexed exact scan ('pgvector_exact') or —
    // when the serving lineage is not the vector(512) space — the bounded
    // BYTEA scan ('bytea_exact_scan'). The source tag and diagnostics carry
    // the method that actually ran (S5): item_to_item_ann /
    // item_to_item_exact / item_to_item_fallback — exact and fallback results
    // are never reported as ANN.
    //
    // Lineage is explicit end-to-end (audit N2): embeddings produced by
    // different (model_id, model_version, preprocessing_version, dimensions)
    // tuples are points in incomparable vector spaces — a "similarity"
    // computed across them is a fabricated rank. Anchor selection, the
    // neighbour query, and the anchor decode all pin the serving lineage
    // resolved once per request; a ready embedding from any other lineage
    // is skipped, never silently compared cross-space.
    let itemToItemRetrieval: Record<string, unknown> | null = null;
    try {
      const anchorListingIds = [...new Set(
        interactionsResult.rows
          .filter((row) => POSITIVE_ANCHOR_ACTIONS.has(row.action))
          .map((row) => row.listing_id),
      )].slice(0, 6);
      if (anchorListingIds.length > 0 && await hasMediaEmbeddingVectorColumn(db)) {
        const servingLineage = await resolveServingEmbeddingLineage(db);
        if (servingLineage) {
          const anchors = await db.query<{ embedding: Buffer; dimensions: number }>(
            `SELECT DISTINCT ON (mb.target_ref_id) me.embedding, me.dimensions
             FROM media_bindings mb
             JOIN media_embeddings me ON me.media_asset_id = mb.media_asset_id
             WHERE mb.target_type = 'listing'
               AND mb.target_ref_id = ANY($1::text[])
               AND mb.removed_at IS NULL
               AND me.status = 'ready'
               AND me.norm > 0
               AND me.model_id = $2
               AND me.model_version = $3
               AND me.preprocessing_version = $4
               AND me.dimensions = $5
             ORDER BY mb.target_ref_id, mb.sort_order, me.generated_at DESC
             LIMIT 3`,
            [
              anchorListingIds,
              servingLineage.modelId,
              servingLineage.modelVersion,
              servingLineage.preprocessingVersion,
              servingLineage.dimensions,
            ],
          );
          // (asset_id → best cosine distance) preserves neighbour rank
          // through the listing join — the same asset can neighbour several
          // anchors.
          const neighbourAssets = new Map<string, number>();
          const retrievalMethods = new Set<MediaEmbeddingRetrievalMethod>();
          const degradedReasons = new Set<string>();
          for (const anchor of anchors.rows) {
            // Anchor payloads are validated before they seed a query: a
            // corrupt or cross-space vector is skipped, never ranked.
            if (anchor.dimensions !== servingLineage.dimensions) {
              continue;
            }
            const queryEmbedding = deserialiseEmbedding(anchor.embedding);
            if (
              queryEmbedding.length !== servingLineage.dimensions ||
              !queryEmbedding.every((value) => Number.isFinite(value))
            ) {
              continue;
            }
            const nearest = await nearestMediaEmbeddings(db, {
              queryEmbedding,
              limit: 40,
              filter: {
                modelId: servingLineage.modelId,
                modelVersion: servingLineage.modelVersion,
                preprocessingVersion: servingLineage.preprocessingVersion,
                dimensions: servingLineage.dimensions,
              },
            });
            retrievalMethods.add(nearest.method);
            if (nearest.degradedReason) {
              degradedReasons.add(nearest.degradedReason);
            }
            for (const hit of nearest.hits) {
              const known = neighbourAssets.get(hit.mediaAssetId);
              if (known === undefined || hit.distance < known) {
                neighbourAssets.set(hit.mediaAssetId, hit.distance);
              }
            }
          }
          if (retrievalMethods.size > 0) {
            // Honest retrieval telemetry (S5): report the method(s) the
            // helper actually used, never an assumed ANN path. The index
            // probe behind 'pgvector_ann' proves an ANN index exists on the
            // column — i.e. ANN-capable — not that the planner chose it for
            // this query, so the diagnostic language stays at
            // "method reported by the retrieval helper".
            itemToItemRetrieval = {
              methods: [...retrievalMethods].sort(),
              source_label: itemToItemSourceLabel(retrievalMethods),
              ...(degradedReasons.size > 0
                ? { degraded_reasons: [...degradedReasons].sort() }
                : {}),
            };
          }
          if (neighbourAssets.size > 0) {
            const anchorSet = new Set(anchorListingIds);
            const similarIds = (
              await mapNeighbourAssetsToListings(db, neighbourAssets)
            )
              .map((row) => row.listingId)
              .filter((id) => !anchorSet.has(id));
            if (similarIds.length > 0) {
              // similarIds arrive ordered by best neighbour distance
              // (mapNeighbourAssetsToListings preserves the ordinality of
              // the neighbour list), so array_position ordering makes
              // source_rank inside this source the true retrieval rank.
              const i2i = await db.query<ListingRow>(
                candidateListingsSql(
                  'AND l.id = ANY($2::text[])',
                  'array_position($2::text[], l.id)',
                  150,
                ),
                [userId, similarIds],
              );
              mergeSource(i2i.rows, itemToItemSourceLabel(retrievalMethods));
            }
          }
        }
      }
    } catch (error) {
      request.log.warn({ err: error, userId }, 'item_to_item retrieval failed');
    }

    // user_affinity — listings matching the user's "show more like this"
    // directives on category/brand facets.
    const moreLabels = topicDirectives
      .filter((directive) => directive.band === 'more')
      .map((directive) => directive.label.trim().toLowerCase())
      .filter((label) => label.length > 0);
    if (moreLabels.length > 0) {
      try {
        const affinity = await db.query<ListingRow>(
          candidateListingsSql(
            `AND (LOWER(l.category) = ANY($2::text[]) OR LOWER(l.brand) = ANY($2::text[]))`,
            'l.created_at DESC, l.id',
            100,
          ),
          [userId, moreLabels],
        );
        mergeSource(affinity.rows, 'user_affinity');
      } catch (error) {
        request.log.warn({ err: error, userId }, 'user_affinity retrieval failed');
      }
    }

    // seller_followed — recent listings from sellers the user follows.
    try {
      const followed = await db.query<ListingRow>(
        candidateListingsSql(
          `AND l.seller_id IN (SELECT following_id FROM user_follows WHERE follower_id = $1)`,
          'l.created_at DESC, l.id',
          150,
        ),
        [userId],
      );
      mergeSource(followed.rows, 'seller_followed');
    } catch (error) {
      request.log.warn({ err: error, userId }, 'seller_followed retrieval failed');
    }

    // trending_30d — globally popular listings by 30-day interaction volume.
    try {
      const trending = await db.query<ListingRow>(
        candidateListingsSql(
          '',
          `COALESCE(ic.interaction_count, '0')::bigint DESC, l.created_at DESC, l.id`,
          150,
        ),
        [userId],
      );
      mergeSource(trending.rows, 'trending_30d');
    } catch (error) {
      request.log.warn({ err: error, userId }, 'trending_30d retrieval failed');
    }

    // recent_sql_keyset — the always-on recency baseline, merged last so a
    // personalized source keeps the lineage tag on shared listings.
    mergeSource(listingsResult.rows, 'recent_sql_keyset');
    if (mergedListingRows.length > MERGED_CANDIDATE_POOL_CAP) {
      mergedListingRows.length = MERGED_CANDIDATE_POOL_CAP;
    }

    const excludedTopicLabels = topicDirectives
      .filter((directive) => directive.band === 'excluded')
      .map((directive) => directive.label);
    const eligibleListingRows = mergedListingRows.filter((row) => {
      if (excludedListingIds.has(row.id)) return false;
      if (excludedSellerIds.has(row.seller_id)) return false;
      if (excludedTopicLabels.length > 0) {
        const tokens = candidateTokenSet(row);
        if (excludedTopicLabels.some((label) => isExcludedByDirective(label, tokens))) {
          return false;
        }
      }
      return true;
    });

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
        // Validate cached recs against the *eligible* set — an item the user
        // has since excluded invalidates the cached serve, not just the row.
        const activeListingIds = new Set(eligibleListingRows.map((row) => row.id));
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
          ...eligibleListingRows.map((row) => Number(row.interaction_count)),
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
            topic_directives: topicDirectives,
            candidates: eligibleListingRows.map((row) => ({
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
              seller_response_hours: row.seller_response_hours != null
                ? Number(row.seller_response_hours)
                : null,
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
        const candidateIds = new Set(eligibleListingRows.map((row) => row.id));
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
        // Reach demotion (lib/sellerReach.ts): the decision service ranks
        // without reach awareness, so the served order is adjusted here —
        // 'limited' sellers keep 30% of their score, then positions are
        // re-derived so the response order matches the served scores.
        // 'suspended' sellers never reach the service — the candidate
        // query excludes them via reachExcludedSql.
        const reachStateById = new Map(
          eligibleListingRows.map((row) => [row.id, row.seller_reach_state]),
        );
        const demotedCount = parsed.recommendations.filter(
          (item) => reachStateById.get(item.listing_id) === 'limited',
        ).length;
        const servedRecommendations = demotedCount === 0
          ? parsed.recommendations
          : parsed.recommendations
              .map((item) =>
                reachStateById.get(item.listing_id) === 'limited'
                  ? { ...item, score: Number((item.score * REACH_LIMITED_MULTIPLIER).toFixed(6)) }
                  : item,
              )
              .sort((a, b) => b.score - a.score || a.listing_id.localeCompare(b.listing_id))
              .map((item, index) => ({ ...item, position: index + 1 }));
        result = {
          source: 'decision_service',
          decision: {
            ...parsed.decision,
            diagnostics: {
              ...parsed.decision.diagnostics,
              seller_reach_demoted: demotedCount,
            },
          },
          recommendations: servedRecommendations,
        };
        try {
          await redis
            .multi()
            .set(
              cacheKey,
              JSON.stringify({ ...parsed, recommendations: servedRecommendations }),
              'EX',
              CACHE_TTL_SECONDS,
            )
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
        // The degraded baseline must honour the same exclusions — a muted
        // item resurfacing on the fallback path would break the user's trust
        // in the control.
        result = fallbackDecision(eligibleListingRows, requestId, generatedAt);
        if (circuitWasOpen) {
          result.decision.diagnostics.circuit_open = true;
        }
      }
      latencyMs = Date.now() - startedAt;
    }

    // Observability: how many candidates the user's own controls removed
    // before ranking — the honest answer to "did my feedback do anything".
    result.decision.diagnostics.user_control_suppressed =
      mergedListingRows.length - eligibleListingRows.length;
    // Retrieval-source mix actually contributing candidates this request —
    // the honest audit trail for "which source is doing the work" (R19).
    result.decision.diagnostics.retrieval_sources = sourceContributions;
    if (itemToItemRetrieval) {
      result.decision.diagnostics.item_to_item_retrieval = itemToItemRetrieval;
    }
    const retrievalVersion =
      Object.values(sourceContributions).filter((count) => count > 0).length > 1
        ? 'v2_multi_source'
        : 'v1_single_source';

    const baseServeMode =
      result.source === 'fallback' ? 'degraded_baseline' :
      result.decision.cold_start ? 'cold_start' :
      'personalized';
    const serveMode = profileMode === 'non_profiled' ? 'non_profiled' : baseServeMode;

    await recordServe(
      db, result, userId, surface, sessionId, latencyMs, dbIntentVersion,
      serveMode, sourceByListingId, retrievalVersion,
    );
    recordRecommendationServe({
      source: result.source,
      policyVersion: result.decision.policy_version,
      coldStart: result.decision.cold_start,
      durationSeconds: latencyMs / 1_000,
      resultCount: result.recommendations.length,
    });
    const listingById = new Map(eligibleListingRows.map((row) => [row.id, row]));
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

// ── Reranking & Diversity Engine ──────────────────────────────────────────

export interface RerankCandidate {
  id: string;
  sellerId: string;
  category: string;
  createdAt: string;
  sellerRating: number | null;
  sellerHasRecentDispute?: boolean;
  baseScore?: number;
}

export interface RerankUserProfile {
  purchasedCategories: Set<string>;
  savedCategories: Set<string>;
  viewedCategories: Set<string>;
}

export interface RerankResult {
  id: string;
  sellerId: string;
  score: number;
  position: number;
  componentScores: {
    base: number;
    freshness: number;
    purchaseRelevance: number;
    saveRelevance: number;
    viewRelevance: number;
    sellerTrust: number;
    badOutcomeSuppression: number;
  };
}

export function rerankCandidates(
  candidates: RerankCandidate[],
  profile: RerankUserProfile,
  options: { generatedAt: string; maxPerSellerInTop5?: number } = {
    generatedAt: new Date().toISOString(),
    maxPerSellerInTop5: 3,
  }
): RerankResult[] {
  const now = Date.parse(options.generatedAt);
  const maxSellerTop5 = options.maxPerSellerInTop5 ?? 3;

  const scored = candidates.map((c) => {
    const ageDays = Math.max(0, (now - Date.parse(c.createdAt)) / 86_400_000);
    const freshness = Math.exp(-ageDays / 28);
    const purchaseRelevance = profile.purchasedCategories.has(c.category) ? 1.0 : 0.0;
    const saveRelevance = profile.savedCategories.has(c.category) ? 1.0 : 0.0;
    const viewRelevance = profile.viewedCategories.has(c.category) ? 1.0 : 0.0;
    const sellerTrust =
      c.sellerRating == null ? 0.5 : Math.min(1, Math.max(0, c.sellerRating / 5));
    const badOutcomeSuppression = c.sellerHasRecentDispute ? 0.0 : 1.0;
    const base = c.baseScore ?? 0.5;

    const score =
      0.25 * base +
      0.20 * freshness +
      0.25 * purchaseRelevance +
      0.10 * saveRelevance +
      0.05 * viewRelevance +
      0.05 * sellerTrust +
      0.10 * badOutcomeSuppression;

    return {
      id: c.id,
      sellerId: c.sellerId,
      score: Number(score.toFixed(6)),
      position: 0,
      componentScores: {
        base: Number(base.toFixed(6)),
        freshness: Number(freshness.toFixed(6)),
        purchaseRelevance,
        saveRelevance,
        viewRelevance,
        sellerTrust: Number(sellerTrust.toFixed(6)),
        badOutcomeSuppression,
      },
    };
  });

  // Sort by score descending, tie break by id ascending for determinism
  scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  // Apply seller diversity constraint: max items per seller in top 5
  const top5: typeof scored = [];
  const remaining: typeof scored = [];
  const sellerCountInTop5 = new Map<string, number>();

  for (const item of scored) {
    const currentCount = sellerCountInTop5.get(item.sellerId) ?? 0;
    if (top5.length < 5 && currentCount < maxSellerTop5) {
      top5.push(item);
      sellerCountInTop5.set(item.sellerId, currentCount + 1);
    } else {
      remaining.push(item);
    }
  }

  // If top 5 is not full, pull from remaining in score order
  while (top5.length < 5 && remaining.length > 0) {
    top5.push(remaining.shift()!);
  }

  return [...top5, ...remaining].map((item, idx) => ({
    ...item,
    position: idx + 1,
  }));
}
