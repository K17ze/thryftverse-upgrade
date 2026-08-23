import crypto from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';

type PosterRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  resolveAuthenticatedUserId: (request: FastifyRequest) => string;
};

const posterIdParamsSchema = z.object({ posterId: z.string().min(2).max(120) });

const tagParamsSchema = z.object({
  posterId: z.string().min(2).max(120),
  tagId: z.string().min(2).max(120),
});

const createPosterBodySchema = z.object({
  id: z.string().min(2).max(120),
  mediaUrl: z.string().url().min(3).optional(),
  mediaFinalizationId: z.string().trim().max(120).optional(),
  caption: z.string().max(2200).default(''),
  textOverlay: z.record(z.unknown()).optional(),
  backgroundColor: z.string().max(30).optional(),
  layout: z.string().max(30).default('single'),
  status: z.enum(['draft', 'published', 'archived']).default('published'),
  expiryHours: z.number().int().min(1).max(720).default(24),
});

const listPostersQuerySchema = z.object({
  creatorId: z.string().optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
  limit: z.coerce.number().int().min(1).max(120).default(40),
});

const createTagBodySchema = z.object({
  id: z.string().min(2).max(120).optional(),
  listingId: z.string().max(120).optional(),
  label: z.string().max(200).default(''),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});

type PosterRow = {
  id: string;
  creator_id: string;
  media_url: string;
  caption: string;
  text_overlay: string | null;
  background_color: string | null;
  layout: string;
  status: string;
  expiry_hours: number;
  created_at: string;
};

const mapPosterRow = (row: PosterRow) => ({
  id: row.id,
  creatorId: row.creator_id,
  mediaUrl: row.media_url,
  caption: row.caption,
  textOverlay: row.text_overlay
    ? (typeof row.text_overlay === 'string' ? JSON.parse(row.text_overlay) : row.text_overlay)
    : null,
  backgroundColor: row.background_color,
  layout: row.layout,
  status: row.status,
  expiryHours: row.expiry_hours,
  createdAt: row.created_at,
});

const POSTER_SELECT_COLUMNS = `
  id, creator_id, media_url, caption, text_overlay, background_color, layout, status, expiry_hours, created_at
`;

/**
 * Register poster routes on the Fastify instance:
 *   POST   /posters                              — create/upsert a poster
 *   GET    /posters                              — list posters
 *   GET    /posters/:posterId                    — poster detail
 *   DELETE /posters/:posterId                    — delete a poster (owner/admin)
 *   POST   /posters/:posterId/tags               — add a product tag
 *   GET    /posters/:posterId/tags               — list product tags
 *   DELETE /posters/:posterId/tags/:tagId        — remove a product tag (owner/admin)
 *   POST   /posters/:posterId/tags/:tagId/click  — record a product tag click (public)
 */
export const registerPosterRoutes = ({ app, db, resolveAuthenticatedUserId }: PosterRouteDependencies): void => {
  app.post('/posters', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const payload = createPosterBodySchema.parse(request.body);

    let mediaUrl = payload.mediaUrl;

    if (payload.mediaFinalizationId) {
      const finalization = await db.query<{
        owner_id: string;
        status: string;
        public_url: string;
      }>(
        `SELECT owner_id, status, public_url
         FROM upload_finalizations
         WHERE id = $1
         LIMIT 1`,
        [payload.mediaFinalizationId]
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
      mediaUrl = receipt.public_url;
    } else {
      console.warn(
        '[posters] DEPRECATION: POST /posters called without mediaFinalizationId — relying on client-supplied mediaUrl'
      );
    }

    if (!mediaUrl) {
      reply.code(400);
      return { ok: false, error: 'mediaUrl or mediaFinalizationId required' };
    }

    await db.query(
      `
        INSERT INTO posters (id, creator_id, media_url, caption, text_overlay, background_color, layout, status, expiry_hours)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (id) DO UPDATE
        SET media_url = EXCLUDED.media_url,
            caption = EXCLUDED.caption,
            text_overlay = EXCLUDED.text_overlay,
            background_color = EXCLUDED.background_color,
            layout = EXCLUDED.layout,
            status = EXCLUDED.status,
            expiry_hours = EXCLUDED.expiry_hours
      `,
      [
        payload.id,
        actorUserId,
        mediaUrl,
        payload.caption,
        payload.textOverlay ? JSON.stringify(payload.textOverlay) : null,
        payload.backgroundColor ?? null,
        payload.layout,
        payload.status,
        payload.expiryHours,
      ]
    );

    reply.code(201);
    return { ok: true, posterId: payload.id };
  });

  app.get('/posters', async (request) => {
    const params = listPostersQuerySchema.parse(request.query ?? {});

    const conditions: string[] = ['1 = 1'];
    const args: unknown[] = [];

    if (params.creatorId) {
      conditions.push(`creator_id = $${args.length + 1}`);
      args.push(params.creatorId);
    }

    if (params.status) {
      conditions.push(`status = $${args.length + 1}`);
      args.push(params.status);
    }

    const result = await db.query<PosterRow>(
      `
        SELECT ${POSTER_SELECT_COLUMNS}
        FROM posters
        WHERE ${conditions.join(' AND ')}
        ORDER BY created_at DESC
        LIMIT $${args.length + 1}
      `,
      [...args, params.limit]
    );

    return {
      items: result.rows.map(mapPosterRow),
    };
  });

  app.get('/posters/:posterId', async (request, reply) => {
    const { posterId } = posterIdParamsSchema.parse(request.params);

    const result = await db.query<PosterRow>(
      `
        SELECT ${POSTER_SELECT_COLUMNS}
        FROM posters
        WHERE id = $1
        LIMIT 1
      `,
      [posterId]
    );

    if (!result.rowCount) {
      reply.code(404);
      return { ok: false, error: 'Poster not found' };
    }

    return {
      ok: true,
      poster: mapPosterRow(result.rows[0]),
    };
  });

  app.delete('/posters/:posterId', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { posterId } = posterIdParamsSchema.parse(request.params);

    const ownerResult = await db.query<{ creator_id: string }>(
      `SELECT creator_id FROM posters WHERE id = $1 LIMIT 1`,
      [posterId]
    );

    const owner = ownerResult.rows[0];
    if (!owner) {
      reply.code(404);
      return { ok: false, error: 'Poster not found' };
    }

    if (owner.creator_id !== actorUserId && request.authUser?.role !== 'admin') {
      reply.code(403);
      return { ok: false, error: 'Forbidden' };
    }

    await db.query(`DELETE FROM posters WHERE id = $1`, [posterId]);
    return { ok: true };
  });

  // ── Poster product tags (shoppable pins) ────────────────────────────────

  // POST /posters/:posterId/tags — add a product tag to a poster
  app.post('/posters/:posterId/tags', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { posterId } = posterIdParamsSchema.parse(request.params);
    const payload = createTagBodySchema.parse(request.body);

    const ownerResult = await db.query<{ creator_id: string }>(
      `SELECT creator_id FROM posters WHERE id = $1 LIMIT 1`,
      [posterId]
    );
    if (!ownerResult.rowCount) {
      reply.code(404);
      return { ok: false, error: 'Poster not found' };
    }
    if (ownerResult.rows[0].creator_id !== actorUserId && request.authUser?.role !== 'admin') {
      reply.code(403);
      return { ok: false, error: 'Forbidden' };
    }

    const tagId = payload.id ?? `${posterId}_tag_${crypto.randomUUID()}`;
    await db.query(
      `INSERT INTO poster_tags (id, poster_id, listing_id, label, x, y)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE
       SET poster_id = EXCLUDED.poster_id,
           listing_id = EXCLUDED.listing_id,
           label = EXCLUDED.label,
           x = EXCLUDED.x,
           y = EXCLUDED.y`,
      [tagId, posterId, payload.listingId ?? null, payload.label, payload.x, payload.y]
    );

    reply.code(201);
    return { ok: true, tagId };
  });

  // GET /posters/:posterId/tags — list product tags for a poster
  app.get('/posters/:posterId/tags', async (request) => {
    const { posterId } = posterIdParamsSchema.parse(request.params);

    const result = await db.query<{
      id: string;
      poster_id: string;
      listing_id: string | null;
      label: string;
      x: string;
      y: string;
      click_count: number;
      last_clicked_at: string | null;
      created_at: string;
    }>(
      `SELECT id, poster_id, listing_id, label, x, y, click_count, last_clicked_at, created_at
       FROM poster_tags
       WHERE poster_id = $1
       ORDER BY created_at ASC`,
      [posterId]
    );

    return {
      items: result.rows.map((row) => ({
        id: row.id,
        posterId: row.poster_id,
        listingId: row.listing_id,
        label: row.label,
        x: Number(row.x),
        y: Number(row.y),
        clickCount: row.click_count,
        lastClickedAt: row.last_clicked_at,
        createdAt: row.created_at,
      })),
    };
  });

  // DELETE /posters/:posterId/tags/:tagId — remove a product tag
  app.delete('/posters/:posterId/tags/:tagId', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { posterId, tagId } = tagParamsSchema.parse(request.params);

    const ownerResult = await db.query<{ creator_id: string }>(
      `SELECT creator_id FROM posters WHERE id = $1 LIMIT 1`,
      [posterId]
    );
    if (!ownerResult.rowCount) {
      reply.code(404);
      return { ok: false, error: 'Poster not found' };
    }
    if (ownerResult.rows[0].creator_id !== actorUserId && request.authUser?.role !== 'admin') {
      reply.code(403);
      return { ok: false, error: 'Forbidden' };
    }

    await db.query(`DELETE FROM poster_tags WHERE id = $1 AND poster_id = $2`, [tagId, posterId]);
    return { ok: true };
  });

  // POST /posters/:posterId/tags/:tagId/click — record a product tag click (public)
  app.post('/posters/:posterId/tags/:tagId/click', async (request, reply) => {
    const { posterId, tagId } = tagParamsSchema.parse(request.params);

    const result = await db.query(
      `UPDATE poster_tags
       SET click_count = click_count + 1,
           last_clicked_at = NOW()
       WHERE id = $1 AND poster_id = $2
       RETURNING id`,
      [tagId, posterId]
    );

    if (!result.rowCount) {
      reply.code(404);
      return { ok: false, error: 'Tag not found' };
    }

    return { ok: true };
  });
};
