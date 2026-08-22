import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';

type LookRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  resolveAuthenticatedUserId: (request: FastifyRequest) => string;
};

const lookIdParamsSchema = z.object({ lookId: z.string().min(2).max(120) });

const commentParamsSchema = z.object({
  lookId: z.string().min(2).max(120),
  commentId: z.string().min(2).max(120),
});

const createLookBodySchema = z.object({
  id: z.string().min(2).max(120),
  title: z.string().max(120).default(''),
  caption: z.string().max(2200).default(''),
  mediaUrl: z.string().url().min(3),
  mediaType: z.enum(['image', 'video']).default('image'),
  compositionDocument: z.unknown().optional(),
  visibility: z.enum(['public', 'followers', 'private']).default('public'),
  tags: z.array(
    z.object({
      id: z.string().min(2).max(120),
      listingId: z.string().max(120).optional(),
      label: z.string().max(200).default(''),
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
    })
  ).default([]),
  status: z.enum(['draft', 'published', 'archived']).default('published'),
});

const listLooksQuerySchema = z.object({
  creatorId: z.string().optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
  sort: z.enum(['foryou', 'following']).default('foryou'),
  cursor: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(120).default(40),
});

const patchLookBodySchema = z.object({
  title: z.string().max(120).optional(),
  caption: z.string().max(2200).optional(),
  mediaUrl: z.string().url().optional(),
  mediaType: z.enum(['image', 'video']).optional(),
  compositionDocument: z.unknown().nullable().optional(),
  visibility: z.enum(['public', 'followers', 'private']).optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
  tags: z.array(z.object({
    id: z.string().min(2).max(120),
    listingId: z.string().min(2).max(120).optional(),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    label: z.string().max(200).default(''),
  })).optional(),
});

const createCommentBodySchema = z.object({
  id: z.string().min(2).max(120),
  body: z.string().trim().min(1).max(1000),
});

type LookRow = {
  id: string;
  creator_id: string;
  title: string;
  caption: string;
  media_url: string;
  media_type: 'image' | 'video';
  composition_document: unknown | null;
  status: string;
  visibility: string;
  created_at: string;
  updated_at: string;
  creator_username: string | null;
  creator_avatar: string | null;
};

const LOOK_SELECT_COLUMNS = `
  l.id, l.creator_id, l.title, l.caption, l.media_url, l.media_type,
  l.composition_document, l.status, l.visibility,
  l.created_at, l.updated_at,
  u.username AS creator_username,
  u.avatar AS creator_avatar
`;

/**
 * Enrich a batch of look rows with tags, like/comment/save counts, and the
 * authenticated viewer's liked/saved state.
 */
async function enrichLooks(
  db: Pool,
  lookRows: LookRow[],
  viewerUserId: string | null
): Promise<Array<Record<string, unknown>>> {
  const lookIds = lookRows.map((r) => r.id);

  const tagsResult = lookIds.length
    ? await db.query<{
        look_id: string;
        id: string;
        listing_id: string | null;
        label: string;
        x: string;
        y: string;
      }>(
        `SELECT look_id, id, listing_id, label, x, y FROM look_tags WHERE look_id = ANY($1)`,
        [lookIds]
      )
    : { rows: [] };

  const tagsByLook = new Map<string, Array<Record<string, unknown>>>();
  for (const t of tagsResult.rows) {
    const arr = tagsByLook.get(t.look_id) ?? [];
    arr.push({
      id: t.id,
      listingId: t.listing_id,
      label: t.label,
      x: Number(t.x),
      y: Number(t.y),
    });
    tagsByLook.set(t.look_id, arr);
  }

  const likeCountsResult = lookIds.length
    ? await db.query<{ look_id: string; count: string }>(
        `SELECT look_id, COUNT(*)::text AS count FROM look_likes WHERE look_id = ANY($1) GROUP BY look_id`,
        [lookIds]
      )
    : { rows: [] };
  const likeCountMap = new Map<string, number>();
  for (const r of likeCountsResult.rows) {
    likeCountMap.set(r.look_id, Number(r.count));
  }

  const commentCountsResult = lookIds.length
    ? await db.query<{ look_id: string; count: string }>(
        `SELECT look_id, COUNT(*)::text AS count FROM look_comments WHERE look_id = ANY($1) GROUP BY look_id`,
        [lookIds]
      )
    : { rows: [] };
  const commentCountMap = new Map<string, number>();
  for (const r of commentCountsResult.rows) {
    commentCountMap.set(r.look_id, Number(r.count));
  }

  const saveCountsResult = lookIds.length
    ? await db.query<{ look_id: string; count: string }>(
        `SELECT look_id, COUNT(*)::text AS count FROM look_saves WHERE look_id = ANY($1) GROUP BY look_id`,
        [lookIds]
      )
    : { rows: [] };
  const saveCountMap = new Map<string, number>();
  for (const r of saveCountsResult.rows) {
    saveCountMap.set(r.look_id, Number(r.count));
  }

  let viewerLikesSet = new Set<string>();
  let viewerSavesSet = new Set<string>();
  if (viewerUserId && lookIds.length) {
    const viewerLikesResult = await db.query<{ look_id: string }>(
      `SELECT look_id FROM look_likes WHERE user_id = $1 AND look_id = ANY($2)`,
      [viewerUserId, lookIds]
    );
    viewerLikesSet = new Set(viewerLikesResult.rows.map((r) => r.look_id));

    const viewerSavesResult = await db.query<{ look_id: string }>(
      `SELECT look_id FROM look_saves WHERE user_id = $1 AND look_id = ANY($2)`,
      [viewerUserId, lookIds]
    );
    viewerSavesSet = new Set(viewerSavesResult.rows.map((r) => r.look_id));
  }

  return lookRows.map((row) => ({
    id: row.id,
    creatorId: row.creator_id,
    creator: {
      id: row.creator_id,
      username: row.creator_username,
      avatar: row.creator_avatar,
    },
    title: row.title,
    caption: row.caption,
    mediaUrl: row.media_url,
    mediaType: row.media_type,
    compositionDocument: row.composition_document,
    visibility: row.visibility,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    tags: tagsByLook.get(row.id) ?? [],
    likeCount: likeCountMap.get(row.id) ?? 0,
    commentCount: commentCountMap.get(row.id) ?? 0,
    saveCount: saveCountMap.get(row.id) ?? 0,
    likedByViewer: viewerLikesSet.has(row.id),
    savedByViewer: viewerSavesSet.has(row.id),
  }));
}

// ── Look access control ────────────────────────────────────────────

type LookAccessRow = {
  id: string;
  creator_id: string;
  status: 'draft' | 'published' | 'archived';
  visibility: 'public' | 'followers' | 'private';
};

function canViewerAccessLook(
  look: LookAccessRow,
  viewerUserId: string | null
): boolean {
  if (viewerUserId && look.creator_id === viewerUserId) {
    return true;
  }
  return look.status === 'published' && look.visibility === 'public';
}

async function getAccessibleLook(
  db: Pool,
  lookId: string,
  viewerUserId: string | null
): Promise<LookAccessRow | null> {
  const result = await db.query<LookAccessRow>(
    `SELECT id, creator_id, status, visibility FROM looks WHERE id = $1 LIMIT 1`,
    [lookId]
  );
  const row = result.rows[0];
  if (!row) return null;
  if (!canViewerAccessLook(row, viewerUserId)) return null;
  return row;
}

/**
 * Register look routes on the Fastify instance:
 *   POST   /looks                          — create a look
 *   GET    /looks                          — list looks (public/auth)
 *   GET    /looks/:lookId                  — look detail
 *   PATCH  /looks/:lookId                  — update a look (owner/admin)
 *   DELETE /looks/:lookId                  — delete a look (owner/admin)
 *   POST   /looks/:lookId/like             — like a look
 *   DELETE /looks/:lookId/like             — unlike a look
 *   POST   /looks/:lookId/save             — save a look
 *   DELETE /looks/:lookId/save             — unsave a look
 *   GET    /looks/:lookId/comments         — list comments
 *   POST   /looks/:lookId/comments         — add a comment
 *   DELETE /looks/:lookId/comments/:commentId — delete a comment (owner/admin)
 */
export const registerLookRoutes = ({ app, db, resolveAuthenticatedUserId }: LookRouteDependencies): void => {
  app.post('/looks', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const payload = createLookBodySchema.parse(request.body);

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const existing = await client.query<{ creator_id: string }>(
        `SELECT creator_id FROM looks WHERE id = $1 LIMIT 1`,
        [payload.id]
      );

      if (existing.rowCount) {
        await client.query('ROLLBACK');
        reply.code(409);
        return { ok: false, error: 'Look ID already exists' };
      }

      await client.query(
        `INSERT INTO looks (
           id, creator_id, title, caption, media_url, media_type,
           composition_document, status, visibility
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          payload.id,
          actorUserId,
          payload.title,
          payload.caption,
          payload.mediaUrl,
          payload.mediaType,
          payload.compositionDocument ?? null,
          payload.status,
          payload.visibility,
        ]
      );

      for (const tag of payload.tags) {
        const tagId = `${payload.id}_${tag.id}`;
        await client.query(
          `INSERT INTO look_tags (id, look_id, listing_id, label, x, y)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (id) DO UPDATE
           SET look_id = EXCLUDED.look_id,
               listing_id = EXCLUDED.listing_id,
               label = EXCLUDED.label,
               x = EXCLUDED.x,
               y = EXCLUDED.y`,
          [tagId, payload.id, tag.listingId ?? null, tag.label, tag.x, tag.y]
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    reply.code(201);
    return { ok: true, lookId: payload.id };
  });

  app.get('/looks', async (request) => {
    const params = listLooksQuerySchema.parse(request.query ?? {});
    const viewerUserId = request.authUser?.userId ?? null;

    const conditions: string[] = ['1 = 1'];
    const args: unknown[] = [];

    if (params.creatorId) {
      conditions.push(`l.creator_id = $${args.length + 1}`);
      args.push(params.creatorId);
    }

    if (params.sort === 'following') {
      if (!viewerUserId) {
        return { items: [], nextCursor: null };
      }
      conditions.push(`EXISTS (
        SELECT 1 FROM user_follows uf
        WHERE uf.follower_id = $${args.length + 1}
          AND uf.following_id = l.creator_id
      )`);
      args.push(viewerUserId);
    }

    if (params.cursor) {
      conditions.push(`l.created_at < $${args.length + 1}::timestamptz`);
      args.push(params.cursor);
    }

    if (params.status && params.status !== 'published') {
      if (!viewerUserId) {
        return { items: [] };
      }
      conditions.push(`l.status = $${args.length + 1}`);
      args.push(params.status);
      conditions.push(`l.creator_id = $${args.length + 1}`);
      args.push(viewerUserId);
    } else {
      conditions.push(`l.status = 'published'`);
      if (viewerUserId) {
        conditions.push(`(l.visibility = 'public' OR l.creator_id = $${args.length + 1})`);
        args.push(viewerUserId);
      } else {
        conditions.push(`l.visibility = 'public'`);
      }
    }

    if (params.creatorId && viewerUserId && params.creatorId !== viewerUserId && params.status && params.status !== 'published') {
      return { items: [] };
    }

    const looksResult = await db.query<LookRow>(
      `
        SELECT ${LOOK_SELECT_COLUMNS}
        FROM looks l
        LEFT JOIN users u ON u.id = l.creator_id
        WHERE ${conditions.join(' AND ')}
        ORDER BY l.created_at DESC
        LIMIT $${args.length + 1}
      `,
      [...args, params.limit + 1]
    );

    const hasMore = looksResult.rows.length > params.limit;
    const pageRows = hasMore ? looksResult.rows.slice(0, params.limit) : looksResult.rows;
    const items = await enrichLooks(db, pageRows, viewerUserId);
    const nextCursor = hasMore
      ? pageRows[pageRows.length - 1]?.created_at ?? null
      : null;

    return { items, nextCursor };
  });

  app.get('/looks/:lookId', async (request, reply) => {
    const { lookId } = lookIdParamsSchema.parse(request.params);
    const viewerUserId = request.authUser?.userId ?? null;

    const accessRow = await getAccessibleLook(db, lookId, viewerUserId);
    if (!accessRow) {
      reply.code(404);
      return { ok: false, error: 'Look not found' };
    }

    const lookResult = await db.query<LookRow>(
      `SELECT ${LOOK_SELECT_COLUMNS} FROM looks l LEFT JOIN users u ON u.id = l.creator_id WHERE l.id = $1 LIMIT 1`,
      [lookId]
    );

    if (!lookResult.rowCount) {
      reply.code(404);
      return { ok: false, error: 'Look not found' };
    }

    const enriched = (await enrichLooks(db, [lookResult.rows[0]], viewerUserId))[0];

    return { ok: true, look: enriched };
  });

  app.patch('/looks/:lookId', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { lookId } = lookIdParamsSchema.parse(request.params);
    const payload = patchLookBodySchema.parse(request.body);

    // Ownership check
    const existing = await db.query<{ creator_id: string }>(
      'SELECT creator_id FROM looks WHERE id = $1 LIMIT 1',
      [lookId]
    );
    if (existing.rows.length === 0) {
      return reply.code(404).send({ error: 'Look not found' });
    }
    if (existing.rows[0].creator_id !== actorUserId && request.authUser?.role !== 'admin') {
      return reply.code(403).send({ error: 'Not authorised to edit this look' });
    }

    // Build update query dynamically
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIdx = 1;

    if (payload.title !== undefined) { updates.push(`title = $${paramIdx++}`); values.push(payload.title); }
    if (payload.caption !== undefined) { updates.push(`caption = $${paramIdx++}`); values.push(payload.caption); }
    if (payload.mediaUrl !== undefined) { updates.push(`media_url = $${paramIdx++}`); values.push(payload.mediaUrl); }
    if (payload.mediaType !== undefined) { updates.push(`media_type = $${paramIdx++}`); values.push(payload.mediaType); }
    if (payload.compositionDocument !== undefined) {
      updates.push(`composition_document = $${paramIdx++}::jsonb`);
      values.push(payload.compositionDocument === null ? null : JSON.stringify(payload.compositionDocument));
    }
    if (payload.visibility !== undefined) { updates.push(`visibility = $${paramIdx++}`); values.push(payload.visibility); }
    if (payload.status !== undefined) { updates.push(`status = $${paramIdx++}`); values.push(payload.status); }
    updates.push(`updated_at = NOW()`);

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      if (updates.length > 1 || payload.tags !== undefined) {
        values.push(lookId);
        await client.query(`UPDATE looks SET ${updates.join(', ')} WHERE id = $${paramIdx}`, values);
      }

      if (payload.tags !== undefined) {
        await client.query('DELETE FROM look_tags WHERE look_id = $1', [lookId]);
        for (const tag of payload.tags) {
          await client.query(
            `INSERT INTO look_tags (id, look_id, listing_id, x, y, label)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [`${lookId}_${tag.id}`, lookId, tag.listingId ?? null, tag.x, tag.y, tag.label]
          );
        }
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    return { ok: true, lookId };
  });

  app.delete('/looks/:lookId', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { lookId } = lookIdParamsSchema.parse(request.params);

    const ownerResult = await db.query<{ creator_id: string }>(
      `SELECT creator_id FROM looks WHERE id = $1 LIMIT 1`,
      [lookId]
    );

    const owner = ownerResult.rows[0];
    if (!owner) {
      reply.code(404);
      return { ok: false, error: 'Look not found' };
    }

    if (owner.creator_id !== actorUserId && request.authUser?.role !== 'admin') {
      reply.code(403);
      return { ok: false, error: 'Forbidden' };
    }

    await db.query(`DELETE FROM looks WHERE id = $1`, [lookId]);
    return { ok: true };
  });

  // ── Look likes ─────────────────────────────────────────────────────

  app.post('/looks/:lookId/like', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { lookId } = lookIdParamsSchema.parse(request.params);

    const accessRow = await getAccessibleLook(db, lookId, actorUserId);
    if (!accessRow) {
      reply.code(404);
      return { ok: false, error: 'Look not found' };
    }

    await db.query(
      `INSERT INTO look_likes (look_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [lookId, actorUserId]
    );

    const countResult = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM look_likes WHERE look_id = $1`,
      [lookId]
    );

    return { ok: true, likeCount: Number(countResult.rows[0]?.count ?? 0), likedByViewer: true };
  });

  app.delete('/looks/:lookId/like', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { lookId } = lookIdParamsSchema.parse(request.params);

    const accessRow = await getAccessibleLook(db, lookId, actorUserId);
    if (!accessRow) {
      reply.code(404);
      return { ok: false, error: 'Look not found' };
    }

    await db.query(
      `DELETE FROM look_likes WHERE look_id = $1 AND user_id = $2`,
      [lookId, actorUserId]
    );

    const countResult = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM look_likes WHERE look_id = $1`,
      [lookId]
    );

    return { ok: true, likeCount: Number(countResult.rows[0]?.count ?? 0), likedByViewer: false };
  });

  // ── Look saves ─────────────────────────────────────────────────────

  app.post('/looks/:lookId/save', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { lookId } = lookIdParamsSchema.parse(request.params);

    const accessRow = await getAccessibleLook(db, lookId, actorUserId);
    if (!accessRow) {
      reply.code(404);
      return { ok: false, error: 'Look not found' };
    }

    await db.query(
      `INSERT INTO look_saves (look_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [lookId, actorUserId]
    );

    const countResult = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM look_saves WHERE look_id = $1`,
      [lookId]
    );

    return { ok: true, saveCount: Number(countResult.rows[0]?.count ?? 0), savedByViewer: true };
  });

  app.delete('/looks/:lookId/save', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { lookId } = lookIdParamsSchema.parse(request.params);

    const accessRow = await getAccessibleLook(db, lookId, actorUserId);
    if (!accessRow) {
      reply.code(404);
      return { ok: false, error: 'Look not found' };
    }

    await db.query(
      `DELETE FROM look_saves WHERE look_id = $1 AND user_id = $2`,
      [lookId, actorUserId]
    );

    const countResult = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM look_saves WHERE look_id = $1`,
      [lookId]
    );

    return { ok: true, saveCount: Number(countResult.rows[0]?.count ?? 0), savedByViewer: false };
  });

  // ── Look comments ──────────────────────────────────────────────────

  app.get('/looks/:lookId/comments', async (request, reply) => {
    const { lookId } = lookIdParamsSchema.parse(request.params);
    const viewerUserId = request.authUser?.userId ?? null;

    const accessRow = await getAccessibleLook(db, lookId, viewerUserId);
    if (!accessRow) {
      reply.code(404);
      return { ok: false, error: 'Look not found' };
    }

    const commentsResult = await db.query<{
      id: string;
      look_id: string;
      author_id: string;
      body: string;
      created_at: string;
      updated_at: string;
      author_username: string | null;
      author_avatar: string | null;
    }>(
      `
        SELECT c.id, c.look_id, c.author_id, c.body, c.created_at, c.updated_at,
          u.username AS author_username,
          u.avatar AS author_avatar
        FROM look_comments c
        LEFT JOIN users u ON u.id = c.author_id
        WHERE c.look_id = $1
        ORDER BY c.created_at ASC
        LIMIT 200
      `,
      [lookId]
    );

    return {
      items: commentsResult.rows.map((row) => ({
        id: row.id,
        lookId: row.look_id,
        authorId: row.author_id,
        author: {
          id: row.author_id,
          username: row.author_username,
          avatar: row.author_avatar,
        },
        body: row.body,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    };
  });

  app.post('/looks/:lookId/comments', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { lookId } = lookIdParamsSchema.parse(request.params);
    const payload = createCommentBodySchema.parse(request.body);

    const accessRow = await getAccessibleLook(db, lookId, actorUserId);
    if (!accessRow) {
      reply.code(404);
      return { ok: false, error: 'Look not found' };
    }

    await db.query(
      `INSERT INTO look_comments (id, look_id, author_id, body) VALUES ($1, $2, $3, $4)`,
      [payload.id, lookId, actorUserId, payload.body]
    );

    const commentResult = await db.query<{
      id: string;
      author_id: string;
      body: string;
      created_at: string;
      updated_at: string;
      author_username: string | null;
      author_avatar: string | null;
    }>(
      `
        SELECT c.id, c.author_id, c.body, c.created_at, c.updated_at,
          u.username AS author_username,
          u.avatar AS author_avatar
        FROM look_comments c
        LEFT JOIN users u ON u.id = c.author_id
        WHERE c.id = $1 LIMIT 1
      `,
      [payload.id]
    );

    const row = commentResult.rows[0];
    if (!row) {
      reply.code(500);
      return { ok: false, error: 'Failed to create comment' };
    }

    reply.code(201);
    return {
      ok: true,
      comment: {
        id: row.id,
        lookId,
        authorId: row.author_id,
        author: {
          id: row.author_id,
          username: row.author_username,
          avatar: row.author_avatar,
        },
        body: row.body,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    };
  });

  app.delete('/looks/:lookId/comments/:commentId', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { lookId, commentId } = commentParamsSchema.parse(request.params);

    const accessRow = await getAccessibleLook(db, lookId, actorUserId);
    if (!accessRow) {
      reply.code(404);
      return { ok: false, error: 'Look not found' };
    }

    const commentResult = await db.query<{ author_id: string }>(
      `SELECT author_id FROM look_comments WHERE id = $1 AND look_id = $2 LIMIT 1`,
      [commentId, lookId]
    );

    const comment = commentResult.rows[0];
    if (!comment) {
      reply.code(404);
      return { ok: false, error: 'Comment not found' };
    }

    if (comment.author_id !== actorUserId && request.authUser?.role !== 'admin') {
      reply.code(403);
      return { ok: false, error: 'Forbidden' };
    }

    await db.query(`DELETE FROM look_comments WHERE id = $1`, [commentId]);
    return { ok: true };
  });
};
