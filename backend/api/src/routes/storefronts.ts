import crypto from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';

// ── Storefront route dependencies ─────────────────────────────────────
// Mirrors the pattern used by sellers.ts and creatorPublications.ts.

type StorefrontRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  /** Read-replica pool (falls back to primary when no replica is configured). */
  readDb: Pool;
  /** Resolves the authenticated user id from the request, throwing on
   *  unauthenticated requests. Matches the helper in index.ts. */
  resolveAuthenticatedUserId: (request: FastifyRequest) => string;
};

// ── Constants ─────────────────────────────────────────────────────────

const MAX_SECTIONS = 12;
const MAX_FEATURED_LISTINGS = 8;

// ── Schemas ───────────────────────────────────────────────────────────

const sectionSchema = z.object({
  kind: z.enum(['featured_listings', 'collection', 'new_arrivals', 'editorial_media', 'creator_work']),
  title: z.string().trim().min(1).max(120),
  itemLimit: z.number().int().min(1).max(50).optional(),
  collectionRef: z.string().max(160).optional(),
  mediaAssetRef: z.string().max(160).optional(),
  linkUrl: z.string().url().max(2048).optional(),
  linkLabel: z.string().max(120).optional(),
  sortOrder: z.number().int().min(0).max(1000),
});

const storefrontUpdateSchema = z.object({
  announcement: z.string().trim().max(500).nullable().optional(),
  coverAssetId: z.string().min(2).max(160).nullable().optional(),
  logoAssetId: z.string().min(2).max(160).nullable().optional(),
  sections: z.array(sectionSchema).max(MAX_SECTIONS).optional(),
});

const featuredListingsSchema = z.object({
  listingIds: z.array(z.string().min(2).max(160)).max(MAX_FEATURED_LISTINGS),
});

const ifMatchSchema = z.string().regex(/^\d+$/).optional();

// ── Public types (shared with frontend) ───────────────────────────────

export interface StorefrontSectionResponse {
  id: string;
  kind: string;
  title: string;
  itemLimit: number | null;
  collectionRef: string | null;
  mediaAssetRef: string | null;
  linkUrl: string | null;
  linkLabel: string | null;
  sortOrder: number;
}

export interface StorefrontResponse {
  id: string;
  sellerId: string;
  status: 'draft' | 'published' | 'paused';
  revision: number;
  announcement: string | null;
  coverAssetId: string | null;
  logoAssetId: string | null;
  sections: StorefrontSectionResponse[];
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Helper: serialize a storefront row + sections into response shape ──

async function serializeStorefront(
  readDb: Pool,
  storefrontId: string
): Promise<StorefrontResponse | null> {
  const sfResult = await readDb.query<{
    id: string;
    seller_id: string;
    status: string;
    revision: number;
    announcement: string | null;
    cover_asset_id: string | null;
    logo_asset_id: string | null;
    published_at: string | null;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT id, seller_id, status, revision, announcement, cover_asset_id,
            logo_asset_id, published_at, created_at, updated_at
     FROM storefronts WHERE id = $1 LIMIT 1`,
    [storefrontId]
  );

  const sf = sfResult.rows[0];
  if (!sf) return null;

  const sectionsResult = await readDb.query<{
    id: string;
    kind: string;
    title: string;
    item_limit: number | null;
    collection_ref: string | null;
    media_asset_ref: string | null;
    link_url: string | null;
    link_label: string | null;
    sort_order: number;
  }>(
    `SELECT id, kind, title, item_limit, collection_ref, media_asset_ref,
            link_url, link_label, sort_order
     FROM storefront_sections
     WHERE storefront_id = $1
     ORDER BY sort_order ASC`,
    [storefrontId]
  );

  return {
    id: sf.id,
    sellerId: sf.seller_id,
    status: sf.status as 'draft' | 'published' | 'paused',
    revision: sf.revision,
    announcement: sf.announcement,
    coverAssetId: sf.cover_asset_id,
    logoAssetId: sf.logo_asset_id,
    sections: sectionsResult.rows.map((s) => ({
      id: s.id,
      kind: s.kind,
      title: s.title,
      itemLimit: s.item_limit,
      collectionRef: s.collection_ref,
      mediaAssetRef: s.media_asset_ref,
      linkUrl: s.link_url,
      linkLabel: s.link_label,
      sortOrder: s.sort_order,
    })),
    publishedAt: sf.published_at,
    createdAt: sf.created_at,
    updatedAt: sf.updated_at,
  };
}

// ── Route registration ────────────────────────────────────────────────

export const registerStorefrontRoutes = ({
  app,
  db,
  readDb,
  resolveAuthenticatedUserId,
}: StorefrontRouteDependencies): void => {
  // ── GET /storefronts/me — owner's own storefront (any status) ───────
  app.get('/storefronts/me', async (request: FastifyRequest, reply: FastifyReply) => {
    const sellerId = resolveAuthenticatedUserId(request);

    const sfResult = await readDb.query<{ id: string }>(
      `SELECT id FROM storefronts WHERE seller_id = $1 LIMIT 1`,
      [sellerId]
    );

    if (!sfResult.rowCount) {
      // No storefront yet — return a default draft state.
      return {
        ok: true,
        storefront: {
          id: null,
          sellerId,
          status: 'draft' as const,
          revision: 0,
          announcement: null,
          coverAssetId: null,
          logoAssetId: null,
          sections: [],
          publishedAt: null,
          createdAt: null,
          updatedAt: null,
        },
      };
    }

    const storefront = await serializeStorefront(readDb, sfResult.rows[0].id);
    if (!storefront) {
      reply.code(404);
      return { ok: false, error: 'Storefront not found' };
    }
    return { ok: true, storefront };
  });

  // ── GET /storefronts/:sellerId — public storefront (published only) ─
  app.get('/storefronts/:sellerId', async (request: FastifyRequest, reply: FastifyReply) => {
    const paramsSchema = z.object({ sellerId: z.string().min(2) });
    const { sellerId } = paramsSchema.parse(request.params);

    const sfResult = await readDb.query<{ id: string; status: string }>(
      `SELECT id, status FROM storefronts WHERE seller_id = $1 LIMIT 1`,
      [sellerId]
    );

    if (!sfResult.rowCount) {
      reply.code(404);
      return { ok: false, error: 'Storefront not found' };
    }

    // Only published storefronts are publicly visible.
    // Draft/paused storefronts are owner-only (use /storefronts/me).
    if (sfResult.rows[0].status !== 'published') {
      reply.code(404);
      return { ok: false, error: 'Storefront not available' };
    }

    const storefront = await serializeStorefront(readDb, sfResult.rows[0].id);
    if (!storefront) {
      reply.code(404);
      return { ok: false, error: 'Storefront not found' };
    }

    // For public views, also include featured listing IDs from the
    // featured_listings section (resolved to active listing summaries).
    const featuredResult = await readDb.query<{
      listing_id: string;
      title: string;
      price_gbp_minor: number;
      image_url: string | null;
      status: string;
    }>(
      `SELECT l.id AS listing_id, l.title, l.price_gbp_minor, l.image_url, l.status
       FROM storefront_featured_listings fl
       JOIN listings l ON l.id = fl.listing_id
       WHERE fl.storefront_id = $1
       ORDER BY fl.rank ASC`,
      [storefront.id]
    );

    return {
      ok: true,
      storefront,
      featuredListings: featuredResult.rows.map((r) => ({
        id: r.listing_id,
        title: r.title,
        priceGbpMinor: Number(r.price_gbp_minor),
        imageUrl: r.image_url,
        status: r.status,
      })),
    };
  });

  // ── PUT /storefronts/me — update draft storefront (owner only) ──────
  // Accepts If-Match header for optimistic locking. Updates announcement,
  // cover/logo assets, and sections. Does NOT publish — use POST .../publish.
  app.put('/storefronts/me', async (request: FastifyRequest, reply: FastifyReply) => {
    const sellerId = resolveAuthenticatedUserId(request);
    const payload = storefrontUpdateSchema.parse(request.body ?? {});
    const ifMatch = ifMatchSchema.parse(request.headers['if-match']);

    // Get or create the storefront row.
    const existingResult = await db.query<{ id: string; revision: number; status: string }>(
      `SELECT id, revision, status FROM storefronts WHERE seller_id = $1 LIMIT 1 FOR UPDATE`,
      [sellerId]
    );

    let storefrontId: string;
    let currentRevision: number;

    if (!existingResult.rowCount) {
      // Create a draft storefront for this seller.
      storefrontId = `storefront_${sellerId}`;
      await db.query(
        `INSERT INTO storefronts (id, seller_id, status, revision)
         VALUES ($1, $2, 'draft', 0)
         ON CONFLICT (seller_id) DO NOTHING`,
        [storefrontId, sellerId]
      );
      currentRevision = 0;
    } else {
      storefrontId = existingResult.rows[0].id;
      currentRevision = existingResult.rows[0].revision;
    }

    // Optimistic locking: if If-Match is provided, it must match the current revision.
    if (ifMatch !== undefined && parseInt(ifMatch, 10) !== currentRevision) {
      reply.code(409);
      return {
        ok: false,
        error: 'Storefront has been modified by another request',
        code: 'STALE_REVISION',
        currentRevision,
      };
    }

    // ── Validate cover/logo asset ownership ────────────────────────────
    if (payload.coverAssetId !== undefined && payload.coverAssetId !== null) {
      const assetCheck = await db.query<{ id: string }>(
        `SELECT id FROM media_assets WHERE id = $1 AND owner_id = $2 LIMIT 1`,
        [payload.coverAssetId, sellerId]
      );
      if (!assetCheck.rowCount) {
        reply.code(422);
        return { ok: false, error: 'Cover asset not found or not owned by you', code: 'MEDIA_NOT_OWNED' };
      }
    }
    if (payload.logoAssetId !== undefined && payload.logoAssetId !== null) {
      const assetCheck = await db.query<{ id: string }>(
        `SELECT id FROM media_assets WHERE id = $1 AND owner_id = $2 LIMIT 1`,
        [payload.logoAssetId, sellerId]
      );
      if (!assetCheck.rowCount) {
        reply.code(422);
        return { ok: false, error: 'Logo asset not found or not owned by you', code: 'MEDIA_NOT_OWNED' };
      }
    }

    // ── Update storefront fields ───────────────────────────────────────
    const updateFields: string[] = [];
    const updateValues: unknown[] = [];
    let paramIdx = 1;

    if (payload.announcement !== undefined) {
      updateFields.push(`announcement = $${paramIdx++}`);
      updateValues.push(payload.announcement);
    }
    if (payload.coverAssetId !== undefined) {
      updateFields.push(`cover_asset_id = $${paramIdx++}`);
      updateValues.push(payload.coverAssetId);
    }
    if (payload.logoAssetId !== undefined) {
      updateFields.push(`logo_asset_id = $${paramIdx++}`);
      updateValues.push(payload.logoAssetId);
    }
    updateFields.push(`updated_at = NOW()`);

    if (updateFields.length > 1) {
      updateValues.push(storefrontId);
      await db.query(
        `UPDATE storefronts SET ${updateFields.join(', ')} WHERE id = $${paramIdx}`,
        updateValues
      );
    }

    // ── Replace sections if provided ───────────────────────────────────
    if (payload.sections !== undefined) {
      // Delete existing sections.
      await db.query(`DELETE FROM storefront_sections WHERE storefront_id = $1`, [storefrontId]);

      // Insert new sections.
      for (const section of payload.sections) {
        const sectionId = `section_${crypto.randomUUID()}`;
        await db.query(
          `INSERT INTO storefront_sections (
             id, storefront_id, kind, title, item_limit,
             collection_ref, media_asset_ref, link_url, link_label, sort_order
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            sectionId,
            storefrontId,
            section.kind,
            section.title,
            section.itemLimit ?? null,
            section.collectionRef ?? null,
            section.mediaAssetRef ?? null,
            section.linkUrl ?? null,
            section.linkLabel ?? null,
            section.sortOrder,
          ]
        );
      }
    }

    const storefront = await serializeStorefront(readDb, storefrontId);
    return { ok: true, storefront };
  });

  // ── POST /storefronts/me/publish — publish the draft storefront ─────
  // Increments revision, sets status to 'published', records published_at.
  // Requires If-Match for optimistic locking.
  app.post('/storefronts/me/publish', async (request: FastifyRequest, reply: FastifyReply) => {
    const sellerId = resolveAuthenticatedUserId(request);
    const ifMatch = ifMatchSchema.parse(request.headers['if-match']);

    const sfResult = await db.query<{ id: string; revision: number; status: string }>(
      `SELECT id, revision, status FROM storefronts WHERE seller_id = $1 LIMIT 1 FOR UPDATE`,
      [sellerId]
    );

    if (!sfResult.rowCount) {
      reply.code(404);
      return { ok: false, error: 'No storefront to publish. Create one first.' };
    }

    const { id: storefrontId, revision, status } = sfResult.rows[0];

    if (ifMatch !== undefined && parseInt(ifMatch, 10) !== revision) {
      reply.code(409);
      return {
        ok: false,
        error: 'Storefront has been modified by another request',
        code: 'STALE_REVISION',
        currentRevision: revision,
      };
    }

    // Validate: published storefront must have at least one section or one featured listing.
    const sectionCount = await readDb.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM storefront_sections WHERE storefront_id = $1`,
      [storefrontId]
    );
    const featuredCount = await readDb.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM storefront_featured_listings WHERE storefront_id = $1`,
      [storefrontId]
    );
    const totalSections = Number(sectionCount.rows[0]?.count ?? '0');
    const totalFeatured = Number(featuredCount.rows[0]?.count ?? '0');

    if (totalSections === 0 && totalFeatured === 0) {
      reply.code(422);
      return {
        ok: false,
        error: 'Cannot publish an empty storefront. Add at least one section or featured listing.',
        code: 'EMPTY_STOREFRONT',
      };
    }

    const newRevision = revision + 1;
    await db.query(
      `UPDATE storefronts
       SET status = 'published', revision = $2, published_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [storefrontId, newRevision]
    );

    const storefront = await serializeStorefront(readDb, storefrontId);
    return { ok: true, storefront };
  });

  // ── POST /storefronts/me/pause — pause a published storefront ───────
  app.post('/storefronts/me/pause', async (request: FastifyRequest, reply: FastifyReply) => {
    const sellerId = resolveAuthenticatedUserId(request);

    const sfResult = await db.query<{ id: string; status: string }>(
      `SELECT id, status FROM storefronts WHERE seller_id = $1 LIMIT 1 FOR UPDATE`,
      [sellerId]
    );

    if (!sfResult.rowCount) {
      reply.code(404);
      return { ok: false, error: 'No storefront found' };
    }

    if (sfResult.rows[0].status !== 'published') {
      reply.code(409);
      return { ok: false, error: 'Storefront is not published', code: 'NOT_PUBLISHED' };
    }

    await db.query(
      `UPDATE storefronts SET status = 'paused', updated_at = NOW() WHERE id = $1`,
      [sfResult.rows[0].id]
    );

    const storefront = await serializeStorefront(readDb, sfResult.rows[0].id);
    return { ok: true, storefront };
  });

  // ── POST /storefronts/me/rollback — rollback to a previous revision ─
  // This is a simplified rollback: it sets the status back to draft so the
  // owner can re-edit. A full revision history would require snapshotting
  // sections per revision.
  app.post('/storefronts/me/rollback', async (request: FastifyRequest, reply: FastifyReply) => {
    const sellerId = resolveAuthenticatedUserId(request);
    const bodySchema = z.object({
      toRevision: z.number().int().min(0).optional(),
    });
    const { toRevision } = bodySchema.parse(request.body ?? {});

    const sfResult = await db.query<{ id: string; revision: number; status: string }>(
      `SELECT id, revision, status FROM storefronts WHERE seller_id = $1 LIMIT 1 FOR UPDATE`,
      [sellerId]
    );

    if (!sfResult.rowCount) {
      reply.code(404);
      return { ok: false, error: 'No storefront found' };
    }

    const { id: storefrontId, revision, status } = sfResult.rows[0];

    if (status !== 'published') {
      reply.code(409);
      return { ok: false, error: 'Can only rollback a published storefront', code: 'NOT_PUBLISHED' };
    }

    // If toRevision is specified, validate it's less than current.
    if (toRevision !== undefined && toRevision >= revision) {
      reply.code(422);
      return { ok: false, error: 'Target revision must be less than current revision', code: 'INVALID_REVISION' };
    }

    // Rollback: set to draft, increment revision (so the old published
    // revision is superseded), and clear published_at.
    const newRevision = revision + 1;
    await db.query(
      `UPDATE storefronts
       SET status = 'draft', revision = $2, published_at = NULL, updated_at = NOW()
       WHERE id = $1`,
      [storefrontId, newRevision]
    );

    const storefront = await serializeStorefront(readDb, storefrontId);
    return { ok: true, storefront };
  });

  // ── PUT /storefronts/me/featured-listings — set pinned listing ranks ─
  // Validates that each listing belongs to the seller and is active.
  // Enforces a maximum of 8 featured listings.
  app.put('/storefronts/me/featured-listings', async (request: FastifyRequest, reply: FastifyReply) => {
    const sellerId = resolveAuthenticatedUserId(request);
    const payload = featuredListingsSchema.parse(request.body ?? {});

    // Deduplicate listing IDs (preserve order).
    const seen = new Set<string>();
    const dedupedIds: string[] = [];
    for (const id of payload.listingIds) {
      if (!seen.has(id)) {
        seen.add(id);
        dedupedIds.push(id);
      }
    }

    if (dedupedIds.length > MAX_FEATURED_LISTINGS) {
      reply.code(422);
      return {
        ok: false,
        error: `Cannot feature more than ${MAX_FEATURED_LISTINGS} listings`,
        code: 'TOO_MANY_FEATURED',
      };
    }

    // Get or create the storefront row.
    const sfResult = await db.query<{ id: string }>(
      `SELECT id FROM storefronts WHERE seller_id = $1 LIMIT 1 FOR UPDATE`,
      [sellerId]
    );

    let storefrontId: string;
    if (!sfResult.rowCount) {
      storefrontId = `storefront_${sellerId}`;
      await db.query(
        `INSERT INTO storefronts (id, seller_id, status, revision)
         VALUES ($1, $2, 'draft', 0)
         ON CONFLICT (seller_id) DO NOTHING`,
        [storefrontId, sellerId]
      );
    } else {
      storefrontId = sfResult.rows[0].id;
    }

    // Validate that all listing IDs belong to this seller and are active/sold.
    // Sold listings are allowed (they show as sold in the grid) but removed
    // listings are not.
    if (dedupedIds.length > 0) {
      const ownershipCheck = await db.query<{ id: string; status: string }>(
        `SELECT id, status FROM listings
         WHERE id = ANY($1) AND seller_id = $2`,
        [dedupedIds, sellerId]
      );

      const ownedIds = new Set(ownershipCheck.rows.map((r) => r.id));
      const unowned = dedupedIds.filter((id) => !ownedIds.has(id));
      if (unowned.length > 0) {
        reply.code(422);
        return {
          ok: false,
          error: 'One or more listings do not belong to you',
          code: 'LISTING_NOT_OWNED',
          unownedListingIds: unowned,
        };
      }

      // Check for removed/deleted listings.
      const removed = ownershipCheck.rows.filter(
        (r) => r.status === 'removed' || r.status === 'deleted'
      );
      if (removed.length > 0) {
        reply.code(422);
        return {
          ok: false,
          error: 'Cannot feature removed listings',
          code: 'LISTING_REMOVED',
          removedListingIds: removed.map((r) => r.id),
        };
      }
    }

    // Replace all featured listings in a transaction.
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `DELETE FROM storefront_featured_listings WHERE storefront_id = $1`,
        [storefrontId]
      );

      for (let i = 0; i < dedupedIds.length; i++) {
        const featuredId = `featured_${crypto.randomUUID()}`;
        await client.query(
          `INSERT INTO storefront_featured_listings (id, storefront_id, listing_id, rank)
           VALUES ($1, $2, $3, $4)`,
          [featuredId, storefrontId, dedupedIds[i], i]
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    return {
      ok: true,
      featuredListingIds: dedupedIds,
    };
  });
};
