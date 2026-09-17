import crypto from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';

// ── Saved searches — server-persisted search subscriptions ───────────────
//
// The client keeps a local cache (Zustand) for offline rendering, but this
// table is the source of truth. When a listing becomes `active`,
// `evaluateSavedSearchAlertsForListing` matches it against every
// `alerts_enabled` saved search and queues a `saved_search_match`
// notification (push-delivered by the notification pipeline when the
// user's `wishlist` preference allows it).

type QueueNotification = (input: {
  userId: string;
  title: string;
  body: string;
  payload?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  eventType?: string;
  actorUserId?: string;
  imageUrl?: string;
  route?: Record<string, unknown>;
  idempotencyKey?: string;
}) => Promise<string | null>;

type SavedSearchRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  resolveAuthenticatedUserId: (request: FastifyRequest) => string;
};

// Mirrors the client's SavedSearch['filters'] shape (store/useStore.ts).
// Extra keys pass through so future filter fields persist without a
// schema change; the matcher below only honours the fields it understands.
const savedSearchFiltersSchema = z
  .object({
    brands: z.array(z.string().min(1).max(120)).max(20).optional(),
    sizes: z.array(z.string().min(1).max(60)).max(30).optional(),
    condition: z.string().min(1).max(60).optional(),
    sort: z.string().min(1).max(60).optional(),
    minPrice: z.number().nonnegative().max(1_000_000).optional(),
    maxPrice: z.number().nonnegative().max(1_000_000).optional(),
    category: z.string().min(1).max(120).optional(),
  })
  .passthrough();

const createSavedSearchSchema = z.object({
  id: z.string().min(2).max(120).optional(),
  query: z.string().trim().min(1).max(200),
  filters: savedSearchFiltersSchema.optional(),
  alertsEnabled: z.boolean().optional(),
});

const patchSavedSearchSchema = z.object({
  alertsEnabled: z.boolean(),
});

const savedSearchParamsSchema = z.object({
  searchId: z.string().min(2).max(120),
});

type SavedSearchRow = {
  id: string;
  user_id: string;
  query: string;
  filters: Record<string, unknown>;
  alerts_enabled: boolean;
  last_notified_at: string | null;
  created_at: string;
  updated_at: string;
};

function toSavedSearchPayload(row: SavedSearchRow) {
  return {
    id: row.id,
    query: row.query,
    filters: row.filters ?? {},
    alertsEnabled: row.alerts_enabled,
    lastNotifiedAt: row.last_notified_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Canonical form for dedupe: object keys sorted, `undefined` dropped, and
 * arrays of primitives sorted — `['nike','adidas']` and
 * `['adidas','nike']` are the same filter. The dedupe key stored on the row
 * is `lower(trim(query)) + '|' + sha256(canonicalJson)`; the
 * UNIQUE(user_id, dedupe_key) index makes POST idempotent.
 */
function canonicalizeForDedupe(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value
      .map(canonicalizeForDedupe)
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }
  if (value && typeof value === 'object') {
    const sorted = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return Object.fromEntries(sorted.map(([k, v]) => [k, canonicalizeForDedupe(v)]));
  }
  return value;
}

function computeDedupeKey(query: string, filters: unknown): string {
  const canonical = JSON.stringify(canonicalizeForDedupe(filters ?? {}));
  const hash = crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
  return `${query.trim().toLowerCase()}|${hash}`;
}

// ── Matcher ──────────────────────────────────────────────────────────────
//
// Runs after a listing commits as `active`. Scans EVERY alert-enabled
// saved search in keyset-paginated batches (`WHERE id > $cursor ORDER BY
// id`): the previous `ORDER BY created_at DESC LIMIT 500` permanently
// starved every row past the cap — once 500 newer searches existed, older
// subscriptions were never evaluated again. A full paginated scan was
// chosen over a rotating bounded slice because a single activation must
// reach every matching subscriber; per-page work stays bounded and the
// deterministic per-(search, listing) idempotency key makes a mid-scan
// crash safe to re-run. The seller's own searches are excluded — you don't
// alert yourself about your own listing.

const SAVED_SEARCH_MATCH_BATCH = 500;

type ListingMatchRow = {
  id: string;
  seller_id: string;
  title: string;
  description: string | null;
  brand: string | null;
  category: string | null;
  size: string | null;
  condition: string | null;
  price_gbp: string;
};

type SavedSearchMatchRow = {
  id: string;
  user_id: string;
  query: string;
  filters: Record<string, unknown> | null;
};

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string' && v.length > 0);
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * Sizes are taxonomy values (XS–XXL, UK 6–12, 'One size') stored as a
 * single TEXT label on the listing. Normalize case and whitespace so
 * 'uk 9' matches 'UK  9', then compare for equality — substring matching
 * made 'S' match 'XS' and 'L' match 'XL'.
 */
function normalizeSizeToken(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase().replace(/\s+/g, ' ') : '';
}

/**
 * Mirrors the client-side `listingMatchesSearch` semantics in
 * useSavedSearchAlerts.ts, plus the category/price filters the client
 * stores but does not evaluate locally:
 *  - query: every whitespace token must appear in title, description,
 *    brand or category (case-insensitive substring)
 *  - brands: listing brand contains any saved brand
 *  - sizes: listing size equals any saved size after normalization
 *    (exact match — 'S' must not match 'XS', 'L' must not match 'XL')
 *  - condition: exact match unless absent/'Any'
 *  - category: normalized equality or containment either direction
 *  - minPrice/maxPrice: price_gbp within bounds
 */
export function listingMatchesSavedSearch(
  listing: ListingMatchRow,
  search: { query: string; filters: Record<string, unknown> | null },
): boolean {
  const filters = search.filters ?? {};
  const tokens = search.query.trim().toLowerCase().split(/\s+/).filter(Boolean);

  if (tokens.length > 0) {
    const haystacks = [
      listing.title,
      listing.description,
      listing.brand,
      listing.category,
    ].map((value) => (value ?? '').toLowerCase());
    const allMatch = tokens.every((token) =>
      haystacks.some((field) => field.includes(token)),
    );
    if (!allMatch) return false;
  }

  const brands = stringArray(filters.brands);
  if (brands.length > 0) {
    const listingBrand = (listing.brand ?? '').toLowerCase();
    if (!brands.some((b) => listingBrand.includes(b.toLowerCase()))) {
      return false;
    }
  }

  const sizes = stringArray(filters.sizes).map(normalizeSizeToken).filter(Boolean);
  if (sizes.length > 0) {
    const listingSize = normalizeSizeToken(listing.size);
    if (!listingSize || !sizes.includes(listingSize)) {
      return false;
    }
  }

  const condition = typeof filters.condition === 'string' ? filters.condition : null;
  if (condition && condition !== 'Any') {
    if ((listing.condition ?? '').toLowerCase() !== condition.toLowerCase()) {
      return false;
    }
  }

  const category = typeof filters.category === 'string' ? filters.category.trim().toLowerCase() : '';
  if (category) {
    const listingCategory = (listing.category ?? '').trim().toLowerCase();
    if (
      listingCategory !== category
      && !listingCategory.includes(category)
      && !category.includes(listingCategory || '\0')
    ) {
      return false;
    }
  }

  const price = Number(listing.price_gbp);
  if (Number.isFinite(price)) {
    const minPrice = numberOrUndefined(filters.minPrice);
    const maxPrice = numberOrUndefined(filters.maxPrice);
    if (minPrice !== undefined && price < minPrice) return false;
    if (maxPrice !== undefined && price > maxPrice) return false;
  }

  return true;
}

export async function evaluateSavedSearchAlertsForListing({
  db,
  listingId,
  queueNotification,
  batchSize = SAVED_SEARCH_MATCH_BATCH,
}: {
  db: Pool;
  listingId: string;
  queueNotification: QueueNotification;
  /** Page size for the subscriber scan — NOT a cap. Every alert-enabled
      search is evaluated across successive keyset pages, so no
      subscription is starved by a global LIMIT. */
  batchSize?: number;
}): Promise<{ evaluated: number; notified: number }> {
  const listingResult = await db.query<ListingMatchRow>(
    `SELECT id, seller_id, title, description, brand, category, size, condition,
            price_gbp::text
       FROM listings
      WHERE id = $1 AND status = 'active'
      LIMIT 1`,
    [listingId],
  );
  const listing = listingResult.rows[0];
  if (!listing) {
    return { evaluated: 0, notified: 0 };
  }

  let evaluated = 0;
  let notified = 0;
  let cursor = '';

  for (;;) {
    const searches = await db.query<SavedSearchMatchRow>(
      `SELECT id, user_id, query, filters
         FROM saved_searches
        WHERE alerts_enabled = TRUE
          AND user_id <> $1
          AND id > $2
        ORDER BY id ASC
        LIMIT $3`,
      [listing.seller_id, cursor, batchSize],
    );
    if (searches.rows.length === 0) break;

    // Stamp only searches whose notification event is durable — a null
    // return means the enqueue deduped into nothing or was skipped, and
    // a throw aborts the whole evaluation before any stamp is written.
    const notifiedSearchIds: string[] = [];
    for (const search of searches.rows) {
      evaluated += 1;
      if (!listingMatchesSavedSearch(listing, search)) continue;
      const eventId = await queueNotification({
        userId: search.user_id,
        title: `New match for "${search.query}"`,
        body: `${listing.title} — £${Number(listing.price_gbp).toFixed(2)}`,
        eventType: 'saved_search_match',
        payload: {
          listingId: listing.id,
          savedSearchId: search.id,
          query: search.query,
        },
        route: {
          screen: 'Browse',
          params: {
            categoryId: 'search',
            searchQuery: search.query,
            title: `Search: "${search.query}"`,
          },
        },
        idempotencyKey: `saved_search_${search.id}_${listing.id}`,
      });
      if (eventId) {
        notified += 1;
        notifiedSearchIds.push(search.id);
      }
    }

    if (notifiedSearchIds.length > 0) {
      await db.query(
        `UPDATE saved_searches
            SET last_notified_at = NOW()
          WHERE id = ANY($1::text[])`,
        [notifiedSearchIds],
      );
    }

    cursor = searches.rows[searches.rows.length - 1].id;
    if (searches.rows.length < batchSize) break;
  }

  return { evaluated, notified };
}

// ── Routes ───────────────────────────────────────────────────────────────

export const registerSavedSearchRoutes = ({
  app,
  db,
  resolveAuthenticatedUserId,
}: SavedSearchRouteDependencies): void => {
  app.get('/users/me/saved-searches', async (request) => {
    const actorUserId = resolveAuthenticatedUserId(request);

    const result = await db.query<SavedSearchRow>(
      `SELECT id, user_id, query, filters, alerts_enabled,
              last_notified_at, created_at, updated_at
         FROM saved_searches
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 200`,
      [actorUserId],
    );

    return { ok: true, searches: result.rows.map(toSavedSearchPayload) };
  });

  app.post('/users/me/saved-searches', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const payload = createSavedSearchSchema.parse(request.body);
    const filters = payload.filters ?? {};
    const dedupeKey = computeDedupeKey(payload.query, filters);
    const returning =
      `RETURNING id, user_id, query, filters, alerts_enabled,
                last_notified_at, created_at, updated_at`;

    // When the client sends an id it owns, this is a sync of an existing
    // search (e.g. re-saving the same query with updated filters — the
    // client dedupes by query and reuses the row id). Update that row in
    // place; a dedupe_key collision with a DIFFERENT row means the
    // canonical copy already exists — fall through to the upsert, which
    // returns the canonical row id for the client to adopt.
    if (payload.id) {
      const owner = await db.query<{ user_id: string }>(
        `SELECT user_id FROM saved_searches WHERE id = $1 LIMIT 1`,
        [payload.id],
      );
      if (owner.rowCount && owner.rows[0].user_id !== actorUserId) {
        reply.code(409);
        return { ok: false, error: 'Saved search ID belongs to another user' };
      }
      if (owner.rowCount) {
        try {
          const updated = await db.query<SavedSearchRow>(
            `UPDATE saved_searches
                SET query = $3, filters = $4::jsonb, dedupe_key = $5,
                    alerts_enabled = $6, updated_at = NOW()
              WHERE id = $1 AND user_id = $2
              ${returning}`,
            [
              payload.id,
              actorUserId,
              payload.query,
              JSON.stringify(filters),
              dedupeKey,
              payload.alertsEnabled ?? true,
            ],
          );
          if (updated.rowCount) {
            return { ok: true, search: toSavedSearchPayload(updated.rows[0]) };
          }
        } catch (error) {
          // 23505 = dedupe_key collides with another of the user's rows —
          // the canonical search already exists under a different id.
          // Update it exactly the way the ON CONFLICT branch below would
          // and return it so the client adopts the canonical row id.
          // Falling through to the INSERT would reuse payload.id — which
          // still exists — as the primary key → PK violation (500), not a
          // (user_id, dedupe_key) conflict the upsert can resolve.
          if ((error as { code?: string }).code !== '23505') throw error;
          const canonical = await db.query<SavedSearchRow>(
            `UPDATE saved_searches
                SET query = $3, filters = $4::jsonb,
                    alerts_enabled = $5, updated_at = NOW()
              WHERE user_id = $1 AND dedupe_key = $2
              ${returning}`,
            [
              actorUserId,
              dedupeKey,
              payload.query,
              JSON.stringify(filters),
              payload.alertsEnabled ?? true,
            ],
          );
          if (canonical.rowCount) {
            reply.code(201);
            return { ok: true, search: toSavedSearchPayload(canonical.rows[0]) };
          }
          // The colliding row vanished between the failed update and this
          // statement (concurrent delete) — nothing to adopt; surface the
          // original conflict rather than INSERT-ing over payload.id.
          throw error;
        }
      }
    }

    const result = await db.query<SavedSearchRow>(
      `INSERT INTO saved_searches (
         id, user_id, query, filters, dedupe_key, alerts_enabled
       )
       VALUES ($1, $2, $3, $4::jsonb, $5, $6)
       ON CONFLICT (user_id, dedupe_key)
       DO UPDATE SET
         query = EXCLUDED.query,
         filters = EXCLUDED.filters,
         alerts_enabled = EXCLUDED.alerts_enabled,
         updated_at = NOW()
       ${returning}`,
      [
        payload.id ?? `ssearch_${crypto.randomUUID()}`,
        actorUserId,
        payload.query,
        JSON.stringify(filters),
        dedupeKey,
        payload.alertsEnabled ?? true,
      ],
    );

    const row = result.rows[0];
    reply.code(201);
    return { ok: true, search: toSavedSearchPayload(row) };
  });

  app.patch('/users/me/saved-searches/:searchId', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { searchId } = savedSearchParamsSchema.parse(request.params);
    const payload = patchSavedSearchSchema.parse(request.body);

    const result = await db.query<SavedSearchRow>(
      `UPDATE saved_searches
          SET alerts_enabled = $3, updated_at = NOW()
        WHERE id = $1 AND user_id = $2
        RETURNING id, user_id, query, filters, alerts_enabled,
                  last_notified_at, created_at, updated_at`,
      [searchId, actorUserId, payload.alertsEnabled],
    );

    if (!result.rowCount) {
      reply.code(404);
      return { ok: false, error: 'Saved search not found' };
    }

    return { ok: true, search: toSavedSearchPayload(result.rows[0]) };
  });

  app.delete('/users/me/saved-searches/:searchId', async (request) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { searchId } = savedSearchParamsSchema.parse(request.params);

    // Idempotent like DELETE /price-alerts — deleting a row that is already
    // gone is a success, not an error.
    await db.query(
      `DELETE FROM saved_searches WHERE id = $1 AND user_id = $2`,
      [searchId, actorUserId],
    );

    return { ok: true };
  });
};
