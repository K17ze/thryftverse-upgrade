import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';

type ApiError = Error & { code: string; statusCode?: number };
type CreateApiError = (code: string, message: string, details?: Record<string, unknown>) => ApiError;
type ResolveAuthenticatedUserId = (request: FastifyRequest, requestedUserId?: string) => string;
type EnsureUserExists = (userId: string) => Promise<void>;

type MoodboardRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  createApiError: CreateApiError;
  resolveAuthenticatedUserId: ResolveAuthenticatedUserId;
  ensureUserExists: EnsureUserExists;
};

const listMoodboardsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(24),
  offset: z.coerce.number().int().min(0).default(0),
  q: z.string().trim().max(120).optional(),
  theme: z.string().trim().max(80).optional(),
});

const createMoodboardSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).default(''),
  visibility: z.enum(['public', 'private']).default('public'),
  coverImageUrl: z.string().trim().max(1000).default(''),
  theme: z.string().trim().max(80).default('theme-linen'),
});

const updateMoodboardSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).optional(),
  visibility: z.enum(['public', 'private']).optional(),
  coverImageUrl: z.string().trim().max(1000).optional(),
  theme: z.string().trim().max(80).optional(),
});

const addItemSchema = z.object({
  listingId: z.string().trim().max(120).optional(),
  mediaUrl: z.string().trim().max(1000).default(''),
  mediaFinalizationId: z.string().trim().max(120).optional(),
  title: z.string().trim().max(200).default(''),
  priceGbp: z.coerce.number().min(0).default(0),
  caption: z.string().trim().max(500).default(''),
  positionX: z.coerce.number().min(0).max(1).default(0.5),
  positionY: z.coerce.number().min(0).max(1).default(0.5),
  rotation: z.coerce.number().default(0),
  scale: z.coerce.number().min(0.1).max(10).default(1.0),
});

const updateItemPositionSchema = z.object({
  positionX: z.coerce.number().min(0).max(1).optional(),
  positionY: z.coerce.number().min(0).max(1).optional(),
  rotation: z.coerce.number().optional(),
  scale: z.coerce.number().min(0.1).max(10).optional(),
});

const reorderItemSchema = z.object({
  direction: z.enum(['front', 'back']),
});

type MoodboardRow = {
  id: string;
  creator_id: string;
  title: string;
  description: string;
  visibility: string;
  cover_image_url: string;
  theme: string;
  created_at: string;
  updated_at: string;
  curator_name: string | null;
  curator_avatar: string | null;
};

type MoodboardItemRow = {
  id: string;
  moodboard_id: string;
  listing_id: string | null;
  media_url: string;
  title: string;
  price_gbp: string | number;
  caption: string;
  position_x: string | number;
  position_y: string | number;
  rotation: string | number;
  scale: string | number;
  sort_order: number;
  created_at: string;
};

function mapItem(row: MoodboardItemRow) {
  return {
    id: row.id,
    listingId: row.listing_id ?? '',
    imageUri: row.media_url,
    title: row.title,
    price: Number(row.price_gbp),
    position: {
      x: Number(row.position_x),
      y: Number(row.position_y),
      scale: Number(row.scale),
      rotation: Number(row.rotation),
    },
    addedAt: row.created_at,
    isDemo: false,
  };
}

function mapMoodboard(
  row: MoodboardRow,
  items: ReturnType<typeof mapItem>[],
) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    curator: row.curator_name ?? row.creator_id,
    curatorAvatar: row.curator_avatar ?? '',
    items,
    coverImage: row.cover_image_url,
    isPublic: row.visibility === 'public',
    theme: row.theme,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isDemo: false,
  };
}

export function registerMoodboardRoutes({
  app,
  db,
  createApiError: _createApiError,
  resolveAuthenticatedUserId,
  ensureUserExists,
}: MoodboardRouteDependencies): void {
  app.get('/moodboards', async (request) => {
    const { limit, offset, q, theme } = listMoodboardsQuerySchema.parse(request.query);

    const params: Array<string | number> = [];
    let whereClause = `WHERE m.visibility = 'public'`;
    if (q) {
      params.push(`%${q}%`);
      whereClause += ` AND (m.title ILIKE $${params.length} OR m.description ILIKE $${params.length})`;
    }
    if (theme) {
      params.push(theme);
      whereClause += ` AND m.theme = $${params.length}`;
    }
    params.push(limit, offset);

    const result = await db.query<MoodboardRow>(
      `
        SELECT m.id, m.creator_id, m.title, m.description, m.visibility,
               m.cover_image_url, m.theme, m.created_at, m.updated_at,
               u.display_name AS curator_name, u.avatar AS curator_avatar
        FROM moodboards m
        LEFT JOIN users u ON u.id = m.creator_id
        ${whereClause}
        ORDER BY m.updated_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}
      `,
      params
    );

    const moodboardIds = result.rows.map((r) => r.id);
    const itemsResult = moodboardIds.length
      ? await db.query<MoodboardItemRow>(
          `SELECT id, moodboard_id, listing_id, media_url, title, price_gbp, caption,
                  position_x, position_y, rotation, scale, sort_order, created_at
           FROM moodboard_items
           WHERE moodboard_id = ANY($1)
           ORDER BY sort_order`,
          [moodboardIds]
        )
      : { rows: [] };

    const itemsByMoodboard = new Map<string, ReturnType<typeof mapItem>[]>();
    for (const itemRow of itemsResult.rows) {
      const arr = itemsByMoodboard.get(itemRow.moodboard_id) ?? [];
      arr.push(mapItem(itemRow));
      itemsByMoodboard.set(itemRow.moodboard_id, arr);
    }

    return {
      items: result.rows.map((row) =>
        mapMoodboard(row, itemsByMoodboard.get(row.id) ?? [])
      ),
    };
  });

  app.get<{ Params: { moodboardId: string } }>(
    '/moodboards/:moodboardId',
    async (request, reply) => {
      const { moodboardId } = request.params;
      const viewerUserId = request.authUser?.userId ?? null;

      const result = await db.query<MoodboardRow>(
        `
          SELECT m.id, m.creator_id, m.title, m.description, m.visibility,
                 m.cover_image_url, m.theme, m.created_at, m.updated_at,
                 u.display_name AS curator_name, u.avatar AS curator_avatar
          FROM moodboards m
          LEFT JOIN users u ON u.id = m.creator_id
          WHERE m.id = $1
          LIMIT 1
        `,
        [moodboardId]
      );

      if (!result.rowCount) {
        reply.code(404);
        return { ok: false, error: 'Moodboard not found' };
      }

      const moodboard = result.rows[0];
      if (moodboard.visibility === 'private' && moodboard.creator_id !== viewerUserId) {
        reply.code(404);
        return { ok: false, error: 'Moodboard not found' };
      }

      const itemsResult = await db.query<MoodboardItemRow>(
        `SELECT id, moodboard_id, listing_id, media_url, title, price_gbp, caption,
                position_x, position_y, rotation, scale, sort_order, created_at
         FROM moodboard_items
         WHERE moodboard_id = $1
         ORDER BY sort_order`,
        [moodboardId]
      );

      return mapMoodboard(moodboard, itemsResult.rows.map(mapItem));
    }
  );

  app.post('/moodboards', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    await ensureUserExists(actorUserId);

    const parsed = createMoodboardSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { ok: false, error: 'Invalid moodboard', details: parsed.error.flatten() };
    }

    const data = parsed.data;
    const id = randomUUID();
    const now = new Date();

    await db.query(
      `INSERT INTO moodboards (id, creator_id, title, description, visibility, cover_image_url, theme, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)`,
      [id, actorUserId, data.title, data.description, data.visibility, data.coverImageUrl, data.theme, now]
    );

    const result = await db.query<MoodboardRow>(
      `SELECT m.id, m.creator_id, m.title, m.description, m.visibility,
              m.cover_image_url, m.theme, m.created_at, m.updated_at,
              u.display_name AS curator_name, u.avatar AS curator_avatar
       FROM moodboards m
       LEFT JOIN users u ON u.id = m.creator_id
       WHERE m.id = $1`,
      [id]
    );

    return mapMoodboard(result.rows[0], []);
  });

  app.patch<{ Params: { moodboardId: string } }>(
    '/moodboards/:moodboardId',
    async (request, reply) => {
      const actorUserId = resolveAuthenticatedUserId(request);
      const { moodboardId } = request.params;

      const ownerResult = await db.query<{ creator_id: string }>(
        `SELECT creator_id FROM moodboards WHERE id = $1`,
        [moodboardId]
      );

      if (!ownerResult.rowCount) {
        reply.code(404);
        return { ok: false, error: 'Moodboard not found' };
      }

      if (ownerResult.rows[0].creator_id !== actorUserId && request.authUser?.role !== 'admin') {
        reply.code(403);
        return { ok: false, error: 'Forbidden: not the moodboard owner' };
      }

      const parsed = updateMoodboardSchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return { ok: false, error: 'Invalid update', details: parsed.error.flatten() };
      }

      const data = parsed.data;
      const sets: string[] = [];
      const params: Array<string | number> = [];
      let paramIdx = 1;

      if (data.title !== undefined) { sets.push(`title = $${paramIdx++}`); params.push(data.title); }
      if (data.description !== undefined) { sets.push(`description = $${paramIdx++}`); params.push(data.description); }
      if (data.visibility !== undefined) { sets.push(`visibility = $${paramIdx++}`); params.push(data.visibility); }
      if (data.coverImageUrl !== undefined) { sets.push(`cover_image_url = $${paramIdx++}`); params.push(data.coverImageUrl); }
      if (data.theme !== undefined) { sets.push(`theme = $${paramIdx++}`); params.push(data.theme); }
      sets.push(`updated_at = NOW()`);

      params.push(moodboardId);
      await db.query(
        `UPDATE moodboards SET ${sets.join(', ')} WHERE id = $${paramIdx}`,
        params
      );

      const result = await db.query<MoodboardRow>(
        `SELECT m.id, m.creator_id, m.title, m.description, m.visibility,
                m.cover_image_url, m.theme, m.created_at, m.updated_at,
                u.display_name AS curator_name, u.avatar AS curator_avatar
         FROM moodboards m
         LEFT JOIN users u ON u.id = m.creator_id
         WHERE m.id = $1`,
        [moodboardId]
      );

      const itemsResult = await db.query<MoodboardItemRow>(
        `SELECT id, moodboard_id, listing_id, media_url, title, price_gbp, caption,
                position_x, position_y, rotation, scale, sort_order, created_at
         FROM moodboard_items
         WHERE moodboard_id = $1
         ORDER BY sort_order`,
        [moodboardId]
      );

      return mapMoodboard(result.rows[0], itemsResult.rows.map(mapItem));
    }
  );

  app.delete<{ Params: { moodboardId: string } }>(
    '/moodboards/:moodboardId',
    async (request, reply) => {
      const actorUserId = resolveAuthenticatedUserId(request);
      const { moodboardId } = request.params;

      const ownerResult = await db.query<{ creator_id: string }>(
        `SELECT creator_id FROM moodboards WHERE id = $1`,
        [moodboardId]
      );

      if (!ownerResult.rowCount) {
        reply.code(404);
        return { ok: false, error: 'Moodboard not found' };
      }

      if (ownerResult.rows[0].creator_id !== actorUserId && request.authUser?.role !== 'admin') {
        reply.code(403);
        return { ok: false, error: 'Forbidden: not the moodboard owner' };
      }

      await db.query(`DELETE FROM moodboards WHERE id = $1`, [moodboardId]);
      return { ok: true };
    }
  );

  app.post<{ Params: { moodboardId: string } }>(
    '/moodboards/:moodboardId/items',
    async (request, reply) => {
      const actorUserId = resolveAuthenticatedUserId(request);
      const { moodboardId } = request.params;

      const ownerResult = await db.query<{ creator_id: string }>(
        `SELECT creator_id FROM moodboards WHERE id = $1`,
        [moodboardId]
      );

      if (!ownerResult.rowCount) {
        reply.code(404);
        return { ok: false, error: 'Moodboard not found' };
      }

      if (ownerResult.rows[0].creator_id !== actorUserId && request.authUser?.role !== 'admin') {
        reply.code(403);
        return { ok: false, error: 'Forbidden: not the moodboard owner' };
      }

      const parsed = addItemSchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return { ok: false, error: 'Invalid item', details: parsed.error.flatten() };
      }

      const data = parsed.data;
      const itemId = randomUUID();
      const now = new Date();

      let resolvedMediaUrl = data.mediaUrl;

      if (data.mediaFinalizationId) {
        const finalization = await db.query<{
          owner_id: string;
          status: string;
          public_url: string;
        }>(
          `SELECT owner_id, status, public_url
           FROM upload_finalizations
           WHERE id = $1
           LIMIT 1`,
          [data.mediaFinalizationId]
        );
        const receipt = finalization.rows[0];
        if (
          !receipt
          || receipt.owner_id !== actorUserId
          || receipt.status !== 'finalized'
        ) {
          reply.code(422);
          return {
            ok: false,
            error: 'Media finalization receipt could not be verified',
            code: 'MEDIA_RECEIPT_MISMATCH',
          };
        }
        resolvedMediaUrl = receipt.public_url;
      } else if (!data.listingId) {
        reply.code(400);
        return { ok: false, error: 'mediaFinalizationId or listingId required' };
      }

      const sortOrderResult = await db.query<{ max_sort: string | number | null }>(
        `SELECT COALESCE(MAX(sort_order), -1) AS max_sort FROM moodboard_items WHERE moodboard_id = $1`,
        [moodboardId]
      );
      const sortOrder = Number(sortOrderResult.rows[0].max_sort) + 1;

      await db.query(
        `INSERT INTO moodboard_items
          (id, moodboard_id, listing_id, media_url, title, price_gbp, caption,
           position_x, position_y, rotation, scale, sort_order, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          itemId,
          moodboardId,
          data.listingId ?? null,
          resolvedMediaUrl,
          data.title,
          data.priceGbp,
          data.caption,
          data.positionX,
          data.positionY,
          data.rotation,
          data.scale,
          sortOrder,
          now,
        ]
      );

      if (resolvedMediaUrl) {
        // If no cover image is set on the moodboard, use the first item's media.
        await db.query(
          `UPDATE moodboards SET cover_image_url = $1, updated_at = NOW()
           WHERE id = $2 AND (cover_image_url = '' OR cover_image_url IS NULL)`,
          [resolvedMediaUrl, moodboardId]
        );
      }

      const itemResult = await db.query<MoodboardItemRow>(
        `SELECT id, moodboard_id, listing_id, media_url, title, price_gbp, caption,
                position_x, position_y, rotation, scale, sort_order, created_at
         FROM moodboard_items WHERE id = $1`,
        [itemId]
      );

      return mapItem(itemResult.rows[0]);
    }
  );

  app.delete<{ Params: { moodboardId: string; itemId: string } }>(
    '/moodboards/:moodboardId/items/:itemId',
    async (request, reply) => {
      const actorUserId = resolveAuthenticatedUserId(request);
      const { moodboardId, itemId } = request.params;

      const ownerResult = await db.query<{ creator_id: string }>(
        `SELECT creator_id FROM moodboards WHERE id = $1`,
        [moodboardId]
      );

      if (!ownerResult.rowCount) {
        reply.code(404);
        return { ok: false, error: 'Moodboard not found' };
      }

      if (ownerResult.rows[0].creator_id !== actorUserId && request.authUser?.role !== 'admin') {
        reply.code(403);
        return { ok: false, error: 'Forbidden: not the moodboard owner' };
      }

      const result = await db.query(
        `DELETE FROM moodboard_items WHERE id = $1 AND moodboard_id = $2`,
        [itemId, moodboardId]
      );

      if (!result.rowCount) {
        reply.code(404);
        return { ok: false, error: 'Item not found' };
      }

      await db.query(`UPDATE moodboards SET updated_at = NOW() WHERE id = $1`, [moodboardId]);
      return { ok: true };
    }
  );

  // ── PATCH /moodboards/:moodboardId/items/:itemId — update item position ──
  app.patch<{ Params: { moodboardId: string; itemId: string } }>(
    '/moodboards/:moodboardId/items/:itemId',
    async (request, reply) => {
      const actorUserId = resolveAuthenticatedUserId(request);
      const { moodboardId, itemId } = request.params;

      const ownerResult = await db.query<{ creator_id: string }>(
        `SELECT creator_id FROM moodboards WHERE id = $1`,
        [moodboardId]
      );

      if (!ownerResult.rowCount) {
        reply.code(404);
        return { ok: false, error: 'Moodboard not found' };
      }

      if (ownerResult.rows[0].creator_id !== actorUserId && request.authUser?.role !== 'admin') {
        reply.code(403);
        return { ok: false, error: 'Forbidden: not the moodboard owner' };
      }

      const parsed = updateItemPositionSchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return { ok: false, error: 'Invalid position', details: parsed.error.flatten() };
      }

      const data = parsed.data;
      const sets: string[] = [];
      const args: (string | number)[] = [];
      let argIdx = 1;

      if (data.positionX !== undefined) { sets.push(`position_x = $${argIdx++}`); args.push(data.positionX); }
      if (data.positionY !== undefined) { sets.push(`position_y = $${argIdx++}`); args.push(data.positionY); }
      if (data.rotation !== undefined) { sets.push(`rotation = $${argIdx++}`); args.push(data.rotation); }
      if (data.scale !== undefined) { sets.push(`scale = $${argIdx++}`); args.push(data.scale); }

      if (sets.length === 0) {
        reply.code(400);
        return { ok: false, error: 'No position fields provided' };
      }

      args.push(moodboardId, itemId);
      const result = await db.query(
        `UPDATE moodboard_items SET ${sets.join(', ')} WHERE moodboard_id = $${argIdx++} AND id = $${argIdx++}`,
        args
      );

      if (!result.rowCount) {
        reply.code(404);
        return { ok: false, error: 'Item not found' };
      }

      await db.query(`UPDATE moodboards SET updated_at = NOW() WHERE id = $1`, [moodboardId]);
      return { ok: true };
    }
  );

  // ── PATCH /moodboards/:moodboardId/items/:itemId/reorder — reorder item layer ──
  app.patch<{ Params: { moodboardId: string; itemId: string } }>(
    '/moodboards/:moodboardId/items/:itemId/reorder',
    async (request, reply) => {
      const actorUserId = resolveAuthenticatedUserId(request);
      const { moodboardId, itemId } = request.params;

      const ownerResult = await db.query<{ creator_id: string }>(
        `SELECT creator_id FROM moodboards WHERE id = $1`,
        [moodboardId]
      );

      if (!ownerResult.rowCount) {
        reply.code(404);
        return { ok: false, error: 'Moodboard not found' };
      }

      if (ownerResult.rows[0].creator_id !== actorUserId && request.authUser?.role !== 'admin') {
        reply.code(403);
        return { ok: false, error: 'Forbidden: not the moodboard owner' };
      }

      const parsed = reorderItemSchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return { ok: false, error: 'Invalid direction', details: parsed.error.flatten() };
      }

      const { direction } = parsed.data;

      if (direction === 'front') {
        const maxResult = await db.query<{ max_sort: string | number | null }>(
          `SELECT COALESCE(MAX(sort_order), -1) AS max_sort FROM moodboard_items WHERE moodboard_id = $1`,
          [moodboardId]
        );
        const newSort = Number(maxResult.rows[0].max_sort) + 1;
        await db.query(
          `UPDATE moodboard_items SET sort_order = $1 WHERE id = $2 AND moodboard_id = $3`,
          [newSort, itemId, moodboardId]
        );
      } else {
        const minResult = await db.query<{ min_sort: string | number | null }>(
          `SELECT COALESCE(MIN(sort_order), 0) AS min_sort FROM moodboard_items WHERE moodboard_id = $1`,
          [moodboardId]
        );
        const newSort = Number(minResult.rows[0].min_sort) - 1;
        await db.query(
          `UPDATE moodboard_items SET sort_order = $1 WHERE id = $2 AND moodboard_id = $3`,
          [newSort, itemId, moodboardId]
        );
      }

      await db.query(`UPDATE moodboards SET updated_at = NOW() WHERE id = $1`, [moodboardId]);
      return { ok: true };
    }
  );
}
