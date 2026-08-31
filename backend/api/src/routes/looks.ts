import crypto from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { config } from '../config.js';
import { validateCompositionDocument } from '../lib/compositionValidation.js';

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
  mediaFinalizationId: z.string().min(2).max(160).optional(),
  mediaAssetId: z.string().min(2).max(160).optional(),
  mediaType: z.enum(['image', 'video']).default('image'),
  mediaUrls: z.array(
    z.object({
      url: z.string().url(),
      mediaType: z.enum(['image', 'video']).default('image'),
      mediaFinalizationId: z.string().optional(),
      mediaAssetId: z.string().optional(),
    })
  ).max(10).optional(),
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
  mediaFinalizationId: z.string().min(2).max(160).optional(),
  mediaAssetId: z.string().min(2).max(160).optional(),
  mediaType: z.enum(['image', 'video']).optional(),
  mediaUrls: z.array(
    z.object({
      url: z.string().url(),
      mediaType: z.enum(['image', 'video']).default('image'),
      mediaFinalizationId: z.string().optional(),
      mediaAssetId: z.string().optional(),
    })
  ).max(10).optional(),
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
  parentId: z.string().min(2).max(120).optional(),
});

type VerifiedLookMedia = {
  finalizationId: string;
  mediaAssetId: string | null;
  resolvedUrl: string;
};

type LookMediaVerification =
  | { ok: true; media: VerifiedLookMedia }
  | {
      ok: false;
      status: 409 | 422;
      error: string;
      code: 'MEDIA_FINALIZATION_REQUIRED' | 'MEDIA_RECEIPT_MISMATCH' | 'MEDIA_NOT_PUBLISHED';
      mediaStatus?: string;
    };

async function verifyLookMedia(
  client: PoolClient,
  input: {
    actorUserId: string;
    lookId: string;
    mediaUrl: string;
    mediaType: 'image' | 'video';
    mediaFinalizationId?: string;
    mediaAssetId?: string;
  },
): Promise<LookMediaVerification> {
  if (!input.mediaFinalizationId) {
    return {
      ok: false,
      status: 422,
      error: 'Verified upload finalization is required',
      code: 'MEDIA_FINALIZATION_REQUIRED',
    };
  }

  const verified = await client.query<{
    id: string;
    owner_id: string;
    public_url: string;
    folder: string;
    content_type: string;
    status: string;
    scope: string;
    scope_ref_id: string | null;
    media_asset_id: string | null;
    media_asset_status: string | null;
    canonical_url: string | null;
  }>(
    `SELECT finalization.id, finalization.owner_id,
            finalization.public_url, finalization.folder,
            finalization.content_type, finalization.status,
            finalization.scope, finalization.scope_ref_id,
            finalization.media_asset_id,
            asset.status AS media_asset_status,
            asset.canonical_url
     FROM upload_finalizations finalization
     LEFT JOIN media_assets asset ON asset.id = finalization.media_asset_id
     WHERE finalization.id = $1
     LIMIT 1
     FOR UPDATE OF finalization`,
    [input.mediaFinalizationId],
  );
  const receipt = verified.rows[0];
  const expectedContentPrefix = input.mediaType === 'video' ? 'video/' : 'image/';
  const suppliedUrlMatches = receipt
    && (receipt.public_url === input.mediaUrl || receipt.canonical_url === input.mediaUrl);
  const suppliedAssetMatches = !input.mediaAssetId
    || receipt?.media_asset_id === input.mediaAssetId;
  const scopeMatches = !receipt?.scope_ref_id || receipt.scope_ref_id === input.lookId;

  if (
    !receipt
    || receipt.owner_id !== input.actorUserId
    || receipt.status !== 'finalized'
    || receipt.folder !== 'looks'
    || receipt.scope !== 'look'
    || !receipt.content_type.startsWith(expectedContentPrefix)
    || !suppliedUrlMatches
    || !suppliedAssetMatches
    || !scopeMatches
  ) {
    return {
      ok: false,
      status: 422,
      error: 'Primary media does not match its verified upload',
      code: 'MEDIA_RECEIPT_MISMATCH',
    };
  }

  if (
    config.mediaPublicationGateEnabled
    && (receipt.media_asset_status !== 'published' || !receipt.canonical_url)
  ) {
    return {
      ok: false,
      status: 409,
      error: 'Primary media is still processing or under review',
      code: 'MEDIA_NOT_PUBLISHED',
      mediaStatus: receipt.media_asset_status ?? 'missing',
    };
  }

  return {
    ok: true,
    media: {
      finalizationId: receipt.id,
      mediaAssetId: receipt.media_asset_status === 'published'
        ? receipt.media_asset_id
        : null,
      resolvedUrl: config.mediaPublicationGateEnabled
        ? receipt.canonical_url!
        : (receipt.canonical_url ?? receipt.public_url),
    },
  };
}

async function bindLookMedia(
  client: PoolClient,
  input: { actorUserId: string; lookId: string; media: VerifiedLookMedia },
): Promise<void> {
  await client.query(
    `UPDATE upload_finalizations
     SET scope = 'look', scope_ref_id = $2, updated_at = NOW()
     WHERE id = $1`,
    [input.media.finalizationId, input.lookId],
  );

  await client.query(
    `UPDATE media_bindings
     SET removed_at = NOW()
     WHERE target_type = 'look'
       AND target_ref_id = $1
       AND role = 'cover'
       AND removed_at IS NULL
       AND ($2::text IS NULL OR media_asset_id <> $2)`,
    [input.lookId, input.media.mediaAssetId],
  );

  if (!input.media.mediaAssetId) return;
  await client.query(
    `INSERT INTO media_bindings (
       id, media_asset_id, owner_id, target_type,
       target_ref_id, role, sort_order
     )
     VALUES ($1, $2, $3, 'look', $4, 'cover', 0)
     ON CONFLICT (media_asset_id, target_type, target_ref_id, role)
     DO UPDATE SET removed_at = NULL, sort_order = EXCLUDED.sort_order`,
    [
      `mbind_${crypto.randomUUID()}`,
      input.media.mediaAssetId,
      input.actorUserId,
      input.lookId,
    ],
  );
}

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
  creator_verified: boolean | null;
  source_look_id: string | null;
};

const LOOK_SELECT_COLUMNS = `
  l.id, l.creator_id, l.title, l.caption, l.media_url, l.media_type,
  l.composition_document, l.status, l.visibility,
  l.created_at, l.updated_at, l.source_look_id,
  u.username AS creator_username,
  u.avatar AS creator_avatar,
  EXISTS (
    SELECT 1 FROM seller_trust_evidence ste
    WHERE ste.seller_id = l.creator_id
      AND ste.code IN ('identity_checked', 'trader_verified')
      AND (ste.expires_at IS NULL OR ste.expires_at > NOW())
  ) AS creator_verified
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

  // Batch-fetch carousel media (additional slides beyond the primary media_url).
  const carouselMediaResult = lookIds.length
    ? await db.query<{
        look_id: string;
        media_url: string;
        media_type: 'image' | 'video';
      }>(
        `SELECT look_id, media_url, media_type
         FROM look_media
         WHERE look_id = ANY($1)
         ORDER BY look_id, position ASC`,
        [lookIds]
      )
    : { rows: [] };
  const carouselMediaByLook = new Map<string, Array<{ url: string; mediaType: 'image' | 'video' }>>();
  for (const m of carouselMediaResult.rows) {
    const arr = carouselMediaByLook.get(m.look_id) ?? [];
    arr.push({ url: m.media_url, mediaType: m.media_type });
    carouselMediaByLook.set(m.look_id, arr);
  }

  // Batch-fetch source look creator info for repost attribution.
  const sourceLookIds = lookRows
    .map((r) => r.source_look_id)
    .filter((id): id is string => id !== null && id !== undefined);
  const sourceLookMap = new Map<string, { creatorId: string; creatorUsername: string | null; creatorAvatar: string | null }>();
  if (sourceLookIds.length) {
    const sourceResult = await db.query<{
      id: string;
      creator_id: string;
      creator_username: string | null;
      creator_avatar: string | null;
    }>(
      `SELECT l.id, l.creator_id,
              u.username AS creator_username,
              u.avatar AS creator_avatar
       FROM looks l
       LEFT JOIN users u ON u.id = l.creator_id
       WHERE l.id = ANY($1)`,
      [sourceLookIds]
    );
    for (const r of sourceResult.rows) {
      sourceLookMap.set(r.id, {
        creatorId: r.creator_id,
        creatorUsername: r.creator_username,
        creatorAvatar: r.creator_avatar,
      });
    }
  }

  return lookRows.map((row) => ({
    id: row.id,
    creatorId: row.creator_id,
    creator: {
      id: row.creator_id,
      username: row.creator_username,
      avatar: row.creator_avatar,
      verified: Boolean(row.creator_verified),
    },
    title: row.title,
    caption: row.caption,
    mediaUrl: row.media_url,
    mediaType: row.media_type,
    mediaUrls: carouselMediaByLook.get(row.id) ?? [],
    compositionDocument: row.composition_document,
    visibility: row.visibility,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sourceLookId: row.source_look_id,
    ...(row.source_look_id && sourceLookMap.has(row.source_look_id)
      ? { sourceLook: sourceLookMap.get(row.source_look_id) }
      : {}),
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
 *   POST   /looks/:lookId/repost           — repost a look (attribution preserved)
 *   GET    /looks/:lookId/related          — list related looks (tag overlap)
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
    const payloadHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(payload))
      .digest('hex');

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [payload.id]);

      const existing = await client.query<{
        creator_id: string;
        publication_payload_hash: string | null;
      }>(
        `SELECT creator_id, publication_payload_hash
         FROM looks
         WHERE id = $1
         LIMIT 1
         FOR UPDATE`,
        [payload.id]
      );

      if (existing.rowCount) {
        const row = existing.rows[0];
        if (
          row.creator_id === actorUserId
          && row.publication_payload_hash === payloadHash
        ) {
          await client.query('COMMIT');
          reply.code(200);
          return { ok: true, lookId: payload.id, replayed: true };
        }
        await client.query('ROLLBACK');
        reply.code(409);
        return {
          ok: false,
          error: row.creator_id === actorUserId
            ? 'Publication key was already used with different content'
            : 'Look ID belongs to another creator',
          code: 'IDEMPOTENCY_CONFLICT',
        };
      }

      const mediaVerification = await verifyLookMedia(client, {
        actorUserId,
        lookId: payload.id,
        mediaUrl: payload.mediaUrl,
        mediaType: payload.mediaType,
        mediaFinalizationId: payload.mediaFinalizationId,
        mediaAssetId: payload.mediaAssetId,
      });
      if (!mediaVerification.ok) {
        await client.query('ROLLBACK');
        reply.code(mediaVerification.status);
        return {
          ok: false,
          error: mediaVerification.error,
          code: mediaVerification.code,
          ...(mediaVerification.mediaStatus
            ? { mediaStatus: mediaVerification.mediaStatus }
            : {}),
        };
      }

      // Validate the composition document envelope (version, type, id)
      // before persisting. The body is stored as opaque JSONB for WYSIWYG
      // rendering, but the envelope must match the publication context.
      const compositionValidation = validateCompositionDocument(
        payload.compositionDocument,
        { type: 'look', id: payload.id },
      );
      if (!compositionValidation.ok) {
        await client.query('ROLLBACK');
        reply.code(422);
        return {
          ok: false,
          error: compositionValidation.error,
          code: compositionValidation.code,
        };
      }

      await client.query(
        `INSERT INTO looks (
           id, creator_id, title, caption, media_url, media_type,
           composition_document, status, visibility,
           upload_finalization_id, media_asset_id, publication_payload_hash
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          payload.id,
          actorUserId,
          payload.title,
          payload.caption,
          mediaVerification.media.resolvedUrl,
          payload.mediaType,
          payload.compositionDocument ?? null,
          payload.status,
          payload.visibility,
          mediaVerification.media.finalizationId,
          mediaVerification.media.mediaAssetId,
          payloadHash,
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

      await bindLookMedia(client, {
        actorUserId,
        lookId: payload.id,
        media: mediaVerification.media,
      });

      // Insert carousel slides (positions 1..N; position 0 is the primary media_url).
      if (payload.mediaUrls && payload.mediaUrls.length) {
        const totalSlides = 1 + payload.mediaUrls.length;
        if (totalSlides > 10) {
          await client.query('ROLLBACK');
          reply.code(422);
          return {
            ok: false,
            error: 'A look may have at most 10 media slides (1 primary + 9 carousel)',
            code: 'TOO_MANY_MEDIA_SLIDES',
          };
        }

        for (let i = 0; i < payload.mediaUrls.length; i++) {
          const slide = payload.mediaUrls[i];
          const position = i + 1;
          let resolvedUrl = slide.url;
          let mediaAssetId = slide.mediaAssetId ?? null;

          if (slide.mediaFinalizationId) {
            const slideVerification = await verifyLookMedia(client, {
              actorUserId,
              lookId: payload.id,
              mediaUrl: slide.url,
              mediaType: slide.mediaType,
              mediaFinalizationId: slide.mediaFinalizationId,
              mediaAssetId: slide.mediaAssetId,
            });
            if (!slideVerification.ok) {
              await client.query('ROLLBACK');
              reply.code(slideVerification.status);
              return {
                ok: false,
                error: slideVerification.error,
                code: slideVerification.code,
                ...(slideVerification.mediaStatus
                  ? { mediaStatus: slideVerification.mediaStatus }
                  : {}),
              };
            }
            resolvedUrl = slideVerification.media.resolvedUrl;
            mediaAssetId = slideVerification.media.mediaAssetId;
          }

          await client.query(
            `INSERT INTO look_media (
               id, look_id, media_url, media_type, position,
               media_finalization_id, media_asset_id
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              `lmedia_${crypto.randomUUID()}`,
              payload.id,
              resolvedUrl,
              slide.mediaType,
              position,
              slide.mediaFinalizationId ?? null,
              mediaAssetId,
            ]
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

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const existing = await client.query<{
        creator_id: string;
        media_url: string;
        media_type: 'image' | 'video';
      }>(
        `SELECT creator_id, media_url, media_type
         FROM looks
         WHERE id = $1
         LIMIT 1
         FOR UPDATE`,
        [lookId],
      );
      if (existing.rows.length === 0) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'Look not found' });
      }
      if (existing.rows[0].creator_id !== actorUserId && request.authUser?.role !== 'admin') {
        await client.query('ROLLBACK');
        return reply.code(403).send({ error: 'Not authorised to edit this look' });
      }

      let verifiedMedia: VerifiedLookMedia | null = null;
      const primaryMediaChanged = (
        payload.mediaUrl !== undefined
        && payload.mediaUrl !== existing.rows[0].media_url
      ) || (
        payload.mediaType !== undefined
        && payload.mediaType !== existing.rows[0].media_type
      ) || payload.mediaFinalizationId !== undefined
        || payload.mediaAssetId !== undefined;
      if (primaryMediaChanged) {
        const mediaVerification = await verifyLookMedia(client, {
          actorUserId,
          lookId,
          mediaUrl: payload.mediaUrl ?? existing.rows[0].media_url,
          mediaType: payload.mediaType ?? existing.rows[0].media_type,
          mediaFinalizationId: payload.mediaFinalizationId,
          mediaAssetId: payload.mediaAssetId,
        });
        if (!mediaVerification.ok) {
          await client.query('ROLLBACK');
          return reply.code(mediaVerification.status).send({
            error: mediaVerification.error,
            code: mediaVerification.code,
            ...(mediaVerification.mediaStatus
              ? { mediaStatus: mediaVerification.mediaStatus }
              : {}),
          });
        }
        verifiedMedia = mediaVerification.media;
      }

      // Build the update only after media ownership and lifecycle checks pass.
      const updates: string[] = [];
      const values: unknown[] = [];
      let paramIdx = 1;
      if (payload.title !== undefined) { updates.push(`title = $${paramIdx++}`); values.push(payload.title); }
      if (payload.caption !== undefined) { updates.push(`caption = $${paramIdx++}`); values.push(payload.caption); }
      if (verifiedMedia) {
        updates.push(`media_url = $${paramIdx++}`); values.push(verifiedMedia.resolvedUrl);
        updates.push(`upload_finalization_id = $${paramIdx++}`); values.push(verifiedMedia.finalizationId);
        updates.push(`media_asset_id = $${paramIdx++}`); values.push(verifiedMedia.mediaAssetId);
      }
      if (payload.mediaType !== undefined) { updates.push(`media_type = $${paramIdx++}`); values.push(payload.mediaType); }
      if (payload.compositionDocument !== undefined) {
        // Validate the composition document envelope on update too.
        if (payload.compositionDocument !== null) {
          const compositionValidation = validateCompositionDocument(
            payload.compositionDocument,
            { type: 'look', id: lookId },
          );
          if (!compositionValidation.ok) {
            await client.query('ROLLBACK');
            return reply.code(422).send({
              error: compositionValidation.error,
              code: compositionValidation.code,
            });
          }
        }
        updates.push(`composition_document = $${paramIdx++}::jsonb`);
        values.push(payload.compositionDocument === null ? null : JSON.stringify(payload.compositionDocument));
      }
      if (payload.visibility !== undefined) { updates.push(`visibility = $${paramIdx++}`); values.push(payload.visibility); }
      if (payload.status !== undefined) { updates.push(`status = $${paramIdx++}`); values.push(payload.status); }
      // A later edit means the original create payload is no longer an exact
      // representation of this row; fail closed if that create is replayed.
      updates.push('publication_payload_hash = NULL');
      updates.push('updated_at = NOW()');

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
      if (verifiedMedia) {
        await bindLookMedia(client, { actorUserId, lookId, media: verifiedMedia });
      }

      // Replace carousel slides when provided. Existing rows are deleted and
      // re-inserted so the position sequence stays contiguous. Only entries
      // carrying a mediaFinalizationId are verified (others are treated as
      // already-published URLs, e.g. copied during a repost).
      if (payload.mediaUrls !== undefined) {
        const totalSlides = 1 + payload.mediaUrls.length;
        if (totalSlides > 10) {
          await client.query('ROLLBACK');
          return reply.code(422).send({
            error: 'A look may have at most 10 media slides (1 primary + 9 carousel)',
            code: 'TOO_MANY_MEDIA_SLIDES',
          });
        }

        await client.query('DELETE FROM look_media WHERE look_id = $1', [lookId]);

        for (let i = 0; i < payload.mediaUrls.length; i++) {
          const slide = payload.mediaUrls[i];
          const position = i + 1;
          let resolvedUrl = slide.url;
          let mediaAssetId = slide.mediaAssetId ?? null;

          if (slide.mediaFinalizationId) {
            const slideVerification = await verifyLookMedia(client, {
              actorUserId,
              lookId,
              mediaUrl: slide.url,
              mediaType: slide.mediaType,
              mediaFinalizationId: slide.mediaFinalizationId,
              mediaAssetId: slide.mediaAssetId,
            });
            if (!slideVerification.ok) {
              await client.query('ROLLBACK');
              return reply.code(slideVerification.status).send({
                error: slideVerification.error,
                code: slideVerification.code,
                ...(slideVerification.mediaStatus
                  ? { mediaStatus: slideVerification.mediaStatus }
                  : {}),
              });
            }
            resolvedUrl = slideVerification.media.resolvedUrl;
            mediaAssetId = slideVerification.media.mediaAssetId;
          }

          await client.query(
            `INSERT INTO look_media (
               id, look_id, media_url, media_type, position,
               media_finalization_id, media_asset_id
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              `lmedia_${crypto.randomUUID()}`,
              lookId,
              resolvedUrl,
              slide.mediaType,
              position,
              slide.mediaFinalizationId ?? null,
              mediaAssetId,
            ]
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

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const ownerResult = await client.query<{ creator_id: string }>(
        `SELECT creator_id FROM looks WHERE id = $1 LIMIT 1 FOR UPDATE`,
        [lookId],
      );

      const owner = ownerResult.rows[0];
      if (!owner) {
        await client.query('ROLLBACK');
        reply.code(404);
        return { ok: false, error: 'Look not found' };
      }

      if (owner.creator_id !== actorUserId && request.authUser?.role !== 'admin') {
        await client.query('ROLLBACK');
        reply.code(403);
        return { ok: false, error: 'Forbidden' };
      }

      await client.query(
        `UPDATE media_bindings
         SET removed_at = NOW()
         WHERE target_type = 'look'
           AND target_ref_id = $1
           AND removed_at IS NULL`,
        [lookId],
      );
      await client.query(`DELETE FROM looks WHERE id = $1`, [lookId]);
      await client.query('COMMIT');
      return { ok: true };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  // ── Look repost ────────────────────────────────────────────────────

  app.post('/looks/:lookId/repost', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { lookId } = lookIdParamsSchema.parse(request.params);

    // 1. Fetch the source look (must be published + public)
    const accessRow = await getAccessibleLook(db, lookId, actorUserId);
    if (!accessRow) {
      reply.code(404);
      return { ok: false, error: 'Look not found' };
    }

    // 2. Fetch the full source look data
    const sourceResult = await db.query<LookRow>(
      `SELECT ${LOOK_SELECT_COLUMNS} FROM looks l LEFT JOIN users u ON u.id = l.creator_id WHERE l.id = $1 LIMIT 1`,
      [lookId]
    );
    if (!sourceResult.rowCount) {
      reply.code(404);
      return { ok: false, error: 'Look not found' };
    }
    const source = sourceResult.rows[0];

    // 3. Prevent self-repost
    if (source.creator_id === actorUserId) {
      reply.code(422);
      return { ok: false, error: 'Cannot repost your own look' };
    }

    // 4. Generate a new look ID
    const newLookId = `repost_${crypto.randomUUID()}`;

    // 5. Create the repost — copies media, tags, composition, but NOT media verification
    //    (the media is already verified from the original). Sets source_look_id for attribution.
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `INSERT INTO looks (
          id, creator_id, title, caption, media_url, media_type,
          composition_document, status, visibility,
          source_look_id, reposted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'published', 'public', $8, NOW())`,
        [
          newLookId,
          actorUserId,
          source.title,
          source.caption,
          source.media_url,
          source.media_type,
          source.composition_document,
          lookId,
        ]
      );

      // Copy tags from the source look
      const tagsResult = await client.query<{ id: string; listing_id: string | null; label: string; x: string; y: string }>(
        `SELECT id, listing_id, label, x, y FROM look_tags WHERE look_id = $1`,
        [lookId]
      );
      for (const tag of tagsResult.rows) {
        const newTagId = `${newLookId}_${tag.id.replace(`${lookId}_`, '')}`;
        await client.query(
          `INSERT INTO look_tags (id, look_id, listing_id, label, x, y)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (id) DO NOTHING`,
          [newTagId, newLookId, tag.listing_id, tag.label, Number(tag.x), Number(tag.y)]
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
    return { ok: true, lookId: newLookId };
  });

  // ── Related looks ──────────────────────────────────────────────────

  app.get('/looks/:lookId/related', async (request) => {
    const { lookId } = lookIdParamsSchema.parse(request.params);
    const viewerUserId = request.authUser?.userId ?? null;
    const query = z.object({
      cursor: z.string().datetime().optional(),
      limit: z.coerce.number().int().min(1).max(60).default(24),
    }).parse(request.query ?? {});

    // 1. Get the source look's tag listing_ids
    const sourceTags = await db.query<{ listing_id: string | null }>(
      `SELECT listing_id FROM look_tags WHERE look_id = $1 AND listing_id IS NOT NULL`,
      [lookId]
    );
    const sourceListingIds = sourceTags.rows.map(r => r.listing_id).filter(Boolean) as string[];

    // 2. Get the source look's creator (to exclude)
    const sourceLook = await db.query<{ creator_id: string }>(
      `SELECT creator_id FROM looks WHERE id = $1 LIMIT 1`,
      [lookId]
    );
    const sourceCreatorId = sourceLook.rows[0]?.creator_id;

    const conditions: string[] = [
      `l.status = 'published'`,
      `l.id <> $1`,
    ];
    const args: unknown[] = [lookId];
    let argIdx = 2;

    if (sourceCreatorId) {
      conditions.push(`l.creator_id <> $${argIdx++}`);
      args.push(sourceCreatorId);
    }

    if (viewerUserId) {
      conditions.push(`(l.visibility = 'public' OR l.creator_id = $${argIdx++})`);
      args.push(viewerUserId);
    } else {
      conditions.push(`l.visibility = 'public'`);
    }

    if (query.cursor) {
      conditions.push(`l.created_at < $${argIdx++}::timestamptz`);
      args.push(query.cursor);
    }

    let orderBy = 'l.created_at DESC';
    let relatedSelect = '';

    if (sourceListingIds.length > 0) {
      // Tag overlap ranking — looks sharing more tagged listings rank higher
      relatedSelect = `
        LEFT JOIN (
          SELECT look_id, COUNT(*) AS overlap_count
          FROM look_tags
          WHERE listing_id = ANY($${argIdx}::text[])
          GROUP BY look_id
        ) overlap ON overlap.look_id = l.id
      `;
      args.push(sourceListingIds);
      orderBy = 'COALESCE(overlap.overlap_count, 0) DESC, l.created_at DESC';
    }

    const looksResult = await db.query<LookRow>(
      `
      SELECT ${LOOK_SELECT_COLUMNS}
      FROM looks l
      LEFT JOIN users u ON u.id = l.creator_id
      ${relatedSelect}
      WHERE ${conditions.join(' AND ')}
      ORDER BY ${orderBy}
      LIMIT $${argIdx}
      `,
      [...args, query.limit + 1]
    );

    const hasMore = looksResult.rows.length > query.limit;
    const pageRows = hasMore ? looksResult.rows.slice(0, query.limit) : looksResult.rows;
    const items = await enrichLooks(db, pageRows, viewerUserId);
    const nextCursor = hasMore
      ? pageRows[pageRows.length - 1]?.created_at ?? null
      : null;

    return { items, nextCursor };
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
      parent_id: string | null;
      body: string;
      created_at: string;
      updated_at: string;
      author_username: string | null;
      author_avatar: string | null;
      like_count: string;
      reply_count: string;
      liked_by_viewer: boolean;
    }>(
      `
        SELECT c.id, c.look_id, c.author_id, c.parent_id, c.body, c.created_at, c.updated_at,
          u.username AS author_username,
          u.avatar AS author_avatar,
          COALESCE(lc.like_count, '0') AS like_count,
          COALESCE(rc.reply_count, '0') AS reply_count,
          COALESCE(lv.liked, false) AS liked_by_viewer
        FROM look_comments c
        LEFT JOIN users u ON u.id = c.author_id
        LEFT JOIN (
          SELECT comment_id, COUNT(*)::text AS like_count
          FROM look_comment_likes GROUP BY comment_id
        ) lc ON lc.comment_id = c.id
        LEFT JOIN (
          SELECT parent_id, COUNT(*)::text AS reply_count
          FROM look_comments WHERE parent_id IS NOT NULL GROUP BY parent_id
        ) rc ON rc.parent_id = c.id
        LEFT JOIN (
          SELECT comment_id, true AS liked
          FROM look_comment_likes WHERE user_id = $2
        ) lv ON lv.comment_id = c.id
        WHERE c.look_id = $1
        ORDER BY c.parent_id NULLS FIRST, c.created_at ASC
        LIMIT 500
      `,
      [lookId, viewerUserId]
    );

    return {
      items: commentsResult.rows.map((row) => ({
        id: row.id,
        lookId: row.look_id,
        authorId: row.author_id,
        parentId: row.parent_id,
        author: {
          id: row.author_id,
          username: row.author_username,
          avatar: row.author_avatar,
        },
        body: row.body,
        likeCount: Number(row.like_count),
        likedByViewer: row.liked_by_viewer,
        replyCount: Number(row.reply_count),
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

    // Validate parentId if provided: must be a root comment on the same look
    let resolvedParentId: string | null = null;
    if (payload.parentId) {
      const parentResult = await db.query<{ id: string; parent_id: string | null }>(
        `SELECT id, parent_id FROM look_comments WHERE id = $1 AND look_id = $2 LIMIT 1`,
        [payload.parentId, lookId]
      );
      const parent = parentResult.rows[0];
      if (!parent) {
        reply.code(404);
        return { ok: false, error: 'Parent comment not found' };
      }
      // Flatten replies-to-replies to the root (Instagram 2-level model)
      resolvedParentId = parent.parent_id ?? parent.id;
    }

    await db.query(
      `INSERT INTO look_comments (id, look_id, author_id, body, parent_id) VALUES ($1, $2, $3, $4, $5)`,
      [payload.id, lookId, actorUserId, payload.body, resolvedParentId]
    );

    const commentResult = await db.query<{
      id: string;
      author_id: string;
      parent_id: string | null;
      body: string;
      created_at: string;
      updated_at: string;
      author_username: string | null;
      author_avatar: string | null;
    }>(
      `
        SELECT c.id, c.author_id, c.parent_id, c.body, c.created_at, c.updated_at,
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

    // Update parent's reply count if this is a reply
    if (resolvedParentId) {
      await db.query(
        `UPDATE look_comments SET updated_at = NOW() WHERE id = $1`,
        [resolvedParentId]
      );
    }

    reply.code(201);
    return {
      ok: true,
      comment: {
        id: row.id,
        lookId,
        authorId: row.author_id,
        parentId: row.parent_id,
        author: {
          id: row.author_id,
          username: row.author_username,
          avatar: row.author_avatar,
        },
        body: row.body,
        likeCount: 0,
        likedByViewer: false,
        replyCount: 0,
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

  // ── Comment likes ───────────────────────────────────────────────────

  app.post('/looks/:lookId/comments/:commentId/like', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { lookId, commentId } = commentParamsSchema.parse(request.params);

    const accessRow = await getAccessibleLook(db, lookId, actorUserId);
    if (!accessRow) {
      reply.code(404);
      return { ok: false, error: 'Look not found' };
    }

    const commentResult = await db.query<{ id: string }>(
      `SELECT id FROM look_comments WHERE id = $1 AND look_id = $2 LIMIT 1`,
      [commentId, lookId]
    );
    if (!commentResult.rows[0]) {
      reply.code(404);
      return { ok: false, error: 'Comment not found' };
    }

    await db.query(
      `INSERT INTO look_comment_likes (comment_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [commentId, actorUserId]
    );

    const countResult = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM look_comment_likes WHERE comment_id = $1`,
      [commentId]
    );

    return { ok: true, likeCount: Number(countResult.rows[0]?.count ?? 0), likedByViewer: true };
  });

  app.delete('/looks/:lookId/comments/:commentId/like', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { lookId, commentId } = commentParamsSchema.parse(request.params);

    const accessRow = await getAccessibleLook(db, lookId, actorUserId);
    if (!accessRow) {
      reply.code(404);
      return { ok: false, error: 'Look not found' };
    }

    await db.query(
      `DELETE FROM look_comment_likes WHERE comment_id = $1 AND user_id = $2`,
      [commentId, actorUserId]
    );

    const countResult = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM look_comment_likes WHERE comment_id = $1`,
      [commentId]
    );

    return { ok: true, likeCount: Number(countResult.rows[0]?.count ?? 0), likedByViewer: false };
  });
};
