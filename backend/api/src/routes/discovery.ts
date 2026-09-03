import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import type { RetrievalMeta } from '../lib/retrievalMeta.js';
import type {
  DiscoveryEntity,
  DiscoveryFilters,
  DiscoveryMode,
  DiscoveryPage,
  DiscoverySort,
  ServeMode,
} from '../domain/discoveryContracts.js';

type ApiError = Error & { code: string; statusCode?: number };
type CreateApiError = (code: string, message: string, details?: Record<string, unknown>) => ApiError;
type ResolveAuthenticatedUserId = (request: FastifyRequest, requestedUserId?: string) => string;

type DiscoveryRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  readDb: Pool;
  createApiError: CreateApiError;
  resolveAuthenticatedUserId: ResolveAuthenticatedUserId;
};

const POLICY_VERSION = 'discovery-v1';
const SEARCH_POLICY_VERSION = 'discovery-search-postgres-v1.0';

const DISCOVERY_MODES = ['ambient', 'explicit', 'category', 'editorial', 'visual'] as const;
const DISCOVERY_SORTS = [
  'relevance', 'recent', 'price_asc', 'price_desc', 'most_liked', 'ending_soon',
] as const;

const createSessionSchema = z.object({
  entryPoint: z.string().trim().min(1).max(60).default('home'),
  mode: z.enum(DISCOVERY_MODES).default('explicit'),
  actorId: z.string().min(2).optional(),
  anonymousId: z.string().min(2).optional(),
});

const searchSchema = z.object({
  query: z.string().trim().min(1).max(120),
  filters: z.object({
    category: z.string().min(1).optional(),
    condition: z.string().min(1).optional(),
    size: z.string().min(1).optional(),
    brand: z.string().min(1).optional(),
    minPrice: z.number().min(0).optional(),
    maxPrice: z.number().min(0).optional(),
    sustainableOnly: z.boolean().optional(),
  }).optional(),
  sort: z.enum(DISCOVERY_SORTS).default('relevance'),
  limit: z.number().int().min(1).max(100).default(24),
  cursor: z.string().optional(),
});

type SessionRow = {
  id: string;
  actor_id: string | null;
  anonymous_id: string | null;
  entry_point: string;
  mode: string;
  raw_query: string;
  normalized_query: string;
  vertical: string;
  serve_mode: string;
  policy_version: string;
  consent_version: string;
  intent_version: number;
  created_at: string;
  expires_at: string;
};

type DiscoveryListingRow = {
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
  seller_username: string | null;
  rank_score: string;
  sustainability_grade: string | null;
};

function qualityScore(row: Pick<DiscoveryListingRow, 'image_url' | 'description' | 'category' | 'brand' | 'size' | 'condition'>): number {
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

function encodeCursor(sortValue: string | number, id: string): string {
  return Buffer.from(JSON.stringify({ sortValue, id })).toString('base64');
}

function decodeCursor(cursor: string): { sortValue: string | number; id: string } | null {
  try {
    const decoded = JSON.parse(Buffer.from(cursor, 'base64').toString('utf-8'));
    if (typeof decoded.sortValue !== 'string' && typeof decoded.sortValue !== 'number') return null;
    if (typeof decoded.id !== 'string') return null;
    return { sortValue: decoded.sortValue, id: decoded.id };
  } catch {
    return null;
  }
}

async function resolveServeMode(
  db: Pool,
  actorId: string | null,
): Promise<ServeMode> {
  if (!actorId) return 'cold_start';
  const result = await db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM interactions WHERE user_id = $1`,
    [actorId],
  );
  const count = Number(result.rows[0]?.count ?? 0);
  return count === 0 ? 'cold_start' : 'personalized';
}

function buildFilterClause(
  filters: DiscoveryFilters | undefined,
  startIdx: number,
): { clause: string; args: unknown[]; nextIdx: number } {
  const conditions: string[] = [];
  const args: unknown[] = [];
  let idx = startIdx;

  if (filters?.category) {
    conditions.push(`l.category = $${idx++}`);
    args.push(filters.category);
  }
  if (filters?.condition) {
    conditions.push(`l.condition = $${idx++}`);
    args.push(filters.condition);
  }
  if (filters?.size) {
    conditions.push(`l.size = $${idx++}`);
    args.push(filters.size);
  }
  if (filters?.brand) {
    conditions.push(`l.brand ILIKE $${idx++}`);
    args.push(`%${filters.brand}%`);
  }
  if (filters?.minPrice !== undefined) {
    conditions.push(`l.price_gbp >= $${idx++}`);
    args.push(filters.minPrice);
  }
  if (filters?.maxPrice !== undefined) {
    conditions.push(`l.price_gbp <= $${idx++}`);
    args.push(filters.maxPrice);
  }
  if (filters?.sustainableOnly) {
    conditions.push(`l.sustainability_grade IN ('A', 'B')`);
  }

  return {
    clause: conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '',
    args,
    nextIdx: idx,
  };
}

function scoreAndRank(
  rows: DiscoveryListingRow[],
  sort: DiscoverySort,
  generatedAt: string,
  filters: DiscoveryFilters | undefined,
): DiscoveryEntity[] {
  const maximumInteractions = Math.max(1, ...rows.map((row) => Number(row.interaction_count)));
  const now = Date.parse(generatedAt);

  const scored = rows.map((row) => {
    const titleRelevance = Math.min(1, Number(row.rank_score));
    const ageDays = Math.max(0, (now - Date.parse(row.created_at)) / 86_400_000);
    const recency = Math.exp(-ageDays / 28);
    const popularity = Math.log1p(Number(row.interaction_count)) / Math.log1p(maximumInteractions);
    const quality = qualityScore(row);
    const sellerTrust = row.seller_rating == null
      ? 0.5
      : Math.min(1, Math.max(0, Number(row.seller_rating) / 5));

    const structuredMatchRatio = computeStructuredMatchRatio(row, filters);
    const score = 0.40 * titleRelevance
      + 0.20 * popularity
      + 0.15 * recency
      + 0.15 * quality
      + 0.10 * sellerTrust;

    const reasonCodes: string[] = [];
    if (titleRelevance > 0.3) reasonCodes.push('title_relevance');
    if (popularity > 0.5) reasonCodes.push('popular');
    if (recency > 0.7) reasonCodes.push('recent');
    if (quality > 0.7) reasonCodes.push('high_quality');
    if (structuredMatchRatio > 0) reasonCodes.push('filter_match');
    if (sellerTrust > 0.7) reasonCodes.push('trusted_seller');
    if (reasonCodes.length === 0) reasonCodes.push('relevance');

    return {
      row,
      score: Number(Math.min(1, Math.max(0, score)).toFixed(6)),
      componentScores: {
        title_relevance: Number(titleRelevance.toFixed(6)),
        popularity: Number(popularity.toFixed(6)),
        recency: Number(recency.toFixed(6)),
        quality: Number(quality.toFixed(6)),
        seller_trust: Number(sellerTrust.toFixed(6)),
      },
      reasonCodes,
    };
  });

  const sorted = scored.sort((a, b) => {
    if (sort === 'recent') {
      return Date.parse(b.row.created_at) - Date.parse(a.row.created_at)
        || a.row.id.localeCompare(b.row.id);
    }
    if (sort === 'price_asc') {
      return Number(a.row.price_gbp) - Number(b.row.price_gbp)
        || a.row.id.localeCompare(b.row.id);
    }
    if (sort === 'price_desc') {
      return Number(b.row.price_gbp) - Number(a.row.price_gbp)
        || a.row.id.localeCompare(b.row.id);
    }
    return b.score - a.score || a.row.id.localeCompare(b.row.id);
  });

  return sorted.map((item, index) => ({
    entityType: 'listing' as const,
    id: item.row.id,
    score: item.score,
    rank: index + 1,
    title: item.row.title,
    brand: item.row.brand,
    category: item.row.category,
    condition: item.row.condition,
    size: item.row.size,
    price: Number(item.row.price_gbp),
    currency: 'GBP',
    imageUrl: item.row.image_url,
    createdAt: item.row.created_at,
    sellerId: item.row.seller_id,
    sellerUsername: item.row.seller_username,
    sellerRating: item.row.seller_rating == null ? null : Number(item.row.seller_rating),
    reasonCodes: item.reasonCodes,
    componentScores: item.componentScores,
  }));
}

function computeStructuredMatchRatio(
  row: DiscoveryListingRow,
  filters: DiscoveryFilters | undefined,
): number {
  if (!filters) return 0;
  let matches = 0;
  let total = 0;
  if (filters.brand) {
    total++;
    if (row.brand && row.brand.toLowerCase() === filters.brand.toLowerCase()) matches++;
  }
  if (filters.category) {
    total++;
    if (row.category && row.category.toLowerCase() === filters.category.toLowerCase()) matches++;
  }
  if (filters.condition) {
    total++;
    if (row.condition && row.condition.toLowerCase() === filters.condition.toLowerCase()) matches++;
  }
  if (filters.size) {
    total++;
    if (row.size && row.size.toLowerCase() === filters.size.toLowerCase()) matches++;
  }
  if (total === 0) return 0;
  return matches / total;
}

function cursorPredicate(
  sort: DiscoverySort,
  cursorData: { sortValue: string | number; id: string },
  idx: number,
): { clause: string; args: unknown[]; nextIdx: number } {
  if (sort === 'price_asc') {
    return {
      clause: `(l.price_gbp, l.id) > ($${idx}, $${idx + 1})`,
      args: [cursorData.sortValue, cursorData.id],
      nextIdx: idx + 2,
    };
  }
  if (sort === 'price_desc') {
    return {
      clause: `(l.price_gbp, l.id) < ($${idx}, $${idx + 1})`,
      args: [cursorData.sortValue, cursorData.id],
      nextIdx: idx + 2,
    };
  }
  if (sort === 'recent') {
    return {
      clause: `(l.created_at, l.id) < ($${idx}, $${idx + 1})`,
      args: [cursorData.sortValue, cursorData.id],
      nextIdx: idx + 2,
    };
  }
  return { clause: '', args: [], nextIdx: idx };
}

export function registerDiscoveryRoutes({
  app,
  db,
  readDb,
  createApiError,
  resolveAuthenticatedUserId,
}: DiscoveryRouteDependencies): void {
  app.post('/v1/discovery/sessions', async (request, reply) => {
    const payload = createSessionSchema.parse(request.body);
    const actorId = payload.actorId
      ? resolveAuthenticatedUserId(request, payload.actorId)
      : request.authUser?.userId ?? null;

    const serveMode = await resolveServeMode(db, actorId);
    const sessionId = randomUUID();
    const now = new Date();

    await db.query(
      `INSERT INTO discovery_sessions (
         id, actor_id, anonymous_id, entry_point, mode,
         raw_query, normalized_query, vertical, serve_mode,
         policy_version, consent_version, intent_version
       )
       VALUES ($1, $2, $3, $4, $5, '', '', 'all', $6, $7, '', 1)`,
      [
        sessionId,
        actorId,
        payload.anonymousId ?? null,
        payload.entryPoint,
        payload.mode,
        serveMode,
        POLICY_VERSION,
      ],
    );

    reply.code(201);
    return {
      id: sessionId,
      mode: payload.mode,
      serveMode,
      policyVersion: POLICY_VERSION,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 86_400_000).toISOString(),
    };
  });

  app.post('/v1/discovery/sessions/:id/search', async (request, reply) => {
    const { id: sessionId } = z.object({ id: z.string().min(1) }).parse(request.params);
    const payload = searchSchema.parse(request.body);

    const sessionResult = await readDb.query<SessionRow>(
      `SELECT id, actor_id, anonymous_id, entry_point, mode, raw_query,
              normalized_query, vertical, serve_mode, policy_version,
              consent_version, intent_version, created_at::text, expires_at::text
       FROM discovery_sessions
       WHERE id = $1 AND expires_at > NOW()`,
      [sessionId],
    );

    if (!sessionResult.rowCount) {
      throw createApiError('DISCOVERY_SESSION_NOT_FOUND', 'Discovery session does not exist or has expired', {
        sessionId,
      });
    }

    const session = sessionResult.rows[0];
    const serveMode = session.serve_mode as ServeMode;
    const generatedAt = new Date().toISOString();
    const requestId = `discovery_${randomUUID()}`;

    const normalizedQuery = payload.query.trim();
    const filters = payload.filters;
    const sort = payload.sort;
    const limit = payload.limit;

    const filterResult = buildFilterClause(filters, 2);
    const cursorData = payload.cursor ? decodeCursor(payload.cursor) : null;
    const cursorResult = cursorData
      ? cursorPredicate(sort, cursorData, filterResult.nextIdx)
      : { clause: '', args: [] as unknown[], nextIdx: filterResult.nextIdx };

    const fetchLimit = limit + 1;
    const limitIdx = cursorResult.nextIdx;

    const ftsQuery = `
      WITH interaction_counts AS (
        SELECT listing_id, COUNT(*)::text AS interaction_count
        FROM interactions
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY listing_id
      ),
      seller_ratings AS (
        SELECT seller_id, NULL::text AS seller_rating
        FROM (SELECT DISTINCT seller_id FROM listings WHERE seller_id IS NOT NULL) s
      )
      SELECT
        l.id, l.seller_id, l.title, l.description, l.category, l.brand,
        l.size, l.condition, l.price_gbp::text, l.image_url,
        l.created_at::text,
        COALESCE(ic.interaction_count, '0') AS interaction_count,
        sr.seller_rating,
        u.username AS seller_username,
        ts_rank_cd(l.search_vector, websearch_to_tsquery('simple', $1))::text AS rank_score,
        l.sustainability_grade
      FROM listings l
      LEFT JOIN interaction_counts ic ON ic.listing_id = l.id
      LEFT JOIN seller_ratings sr ON sr.seller_id = l.seller_id
      LEFT JOIN users u ON u.id = l.seller_id
      WHERE l.status = 'active'
        AND (
          l.search_vector @@ websearch_to_tsquery('simple', $1)
          OR POSITION(lower($1) IN lower(COALESCE(l.brand, ''))) > 0
          OR POSITION(lower($1) IN lower(COALESCE(l.category, ''))) > 0
          OR POSITION(lower($1) IN lower(COALESCE(l.size, ''))) > 0
          OR POSITION(lower($1) IN lower(COALESCE(l.condition, ''))) > 0
        )
        ${filterResult.clause}
        ${cursorResult.clause}
      ORDER BY ts_rank_cd(l.search_vector, websearch_to_tsquery('simple', $1)) DESC, l.created_at DESC, l.id
      LIMIT $${limitIdx} OFFSET $${limitIdx + 1}
    `;

    const ftsResult = await readDb.query<DiscoveryListingRow>(
      ftsQuery,
      [normalizedQuery, ...filterResult.args, ...cursorResult.args, fetchLimit, 0],
    );

    let rows = ftsResult.rows;
    let appliedRelaxations: string[] = [];
    let retrievalMeta: RetrievalMeta = {
      method: 'lexical',
      embedderConfigured: false,
      searchEngineVersion: SEARCH_POLICY_VERSION,
    };

    if (rows.length === 0) {
      const ilikeQuery = `
        WITH interaction_counts AS (
          SELECT listing_id, COUNT(*)::text AS interaction_count
          FROM interactions
          WHERE created_at >= NOW() - INTERVAL '30 days'
          GROUP BY listing_id
        ),
        seller_ratings AS (
          SELECT seller_id, NULL::text AS seller_rating
          FROM (SELECT DISTINCT seller_id FROM listings WHERE seller_id IS NOT NULL) s
        )
        SELECT
          l.id, l.seller_id, l.title, l.description, l.category, l.brand,
          l.size, l.condition, l.price_gbp::text, l.image_url,
          l.created_at::text,
          COALESCE(ic.interaction_count, '0') AS interaction_count,
          sr.seller_rating,
          u.username AS seller_username,
          '0'::text AS rank_score,
          l.sustainability_grade
        FROM listings l
        LEFT JOIN interaction_counts ic ON ic.listing_id = l.id
        LEFT JOIN seller_ratings sr ON sr.seller_id = l.seller_id
        LEFT JOIN users u ON u.id = l.seller_id
        WHERE l.status = 'active'
          AND (
            POSITION(lower($1) IN lower(l.title)) > 0
            OR POSITION(lower($1) IN lower(l.description)) > 0
            OR POSITION(lower($1) IN lower(COALESCE(l.brand, ''))) > 0
            OR POSITION(lower($1) IN lower(COALESCE(l.category, ''))) > 0
            OR POSITION(lower($1) IN lower(COALESCE(l.size, ''))) > 0
            OR POSITION(lower($1) IN lower(COALESCE(l.condition, ''))) > 0
          )
          ${filterResult.clause}
          ${cursorResult.clause}
        ORDER BY l.created_at DESC, l.id
        LIMIT $${limitIdx} OFFSET $${limitIdx + 1}
      `;

      const ilikeResult = await readDb.query<DiscoveryListingRow>(
        ilikeQuery,
        [normalizedQuery, ...filterResult.args, ...cursorResult.args, fetchLimit, 0],
      );
      rows = ilikeResult.rows;
      appliedRelaxations = ['fts_no_matches_ilike_fallback'];
      retrievalMeta = {
        method: 'lexical',
        fallbackReason: 'fts_no_matches_ilike_fallback',
        embedderConfigured: false,
        searchEngineVersion: SEARCH_POLICY_VERSION,
      };
    }

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const entities = scoreAndRank(pageRows, sort, generatedAt, filters);

    const lastEntity = entities[entities.length - 1];
    let cursor: string | null = null;
    if (hasMore && lastEntity) {
      const sortValue = sort === 'price_asc' || sort === 'price_desc'
        ? lastEntity.price
        : lastEntity.createdAt;
      cursor = encodeCursor(sortValue, lastEntity.id);
    }

    const totalRelation: DiscoveryPage['totalRelation'] = hasMore ? 'lower_bound' : 'exact';

    const page: DiscoveryPage = {
      sessionId,
      requestId,
      serveMode,
      totalRelation,
      entities,
      cursor,
      retrievalMeta,
      appliedRelaxations,
      generatedAt,
    };

    void db.query(
      `UPDATE discovery_sessions
       SET raw_query = $2, normalized_query = $3
       WHERE id = $1`,
      [sessionId, payload.query, normalizedQuery],
    ).catch((error) => {
      request.log.warn(
        { err: error, sessionId },
        'Discovery session query update failed — non-fatal',
      );
    });

    reply.code(200);
    return page;
  });
}
