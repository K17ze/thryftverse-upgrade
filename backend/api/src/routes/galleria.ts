import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';

type ApiError = Error & { code: string; statusCode?: number };
type CreateApiError = (code: string, message: string, details?: Record<string, unknown>) => ApiError;
type ResolveAuthenticatedUserId = (request: FastifyRequest, requestedUserId?: string) => string;

type GalleriaRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  readDb: Pool;
  createApiError: CreateApiError;
  resolveAuthenticatedUserId: ResolveAuthenticatedUserId;
};

const listCollectionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(24),
  offset: z.coerce.number().int().min(0).default(0),
});

const createCollectionSchema = z.object({
  title: z.string().trim().min(1).max(200),
  subtitle: z.string().trim().max(300).default(''),
  curatorName: z.string().trim().max(120).default(''),
  curatorAvatar: z.string().trim().max(500).default(''),
  coverImageUrl: z.string().trim().max(1000).default(''),
  description: z.string().trim().max(2000).default(''),
  theme: z.string().trim().max(80).default(''),
  status: z.enum(['draft', 'published']).default('published'),
  items: z.array(z.object({
    listingId: z.string().trim().max(120).optional(),
    mediaUrl: z.string().trim().max(1000).default(''),
    title: z.string().trim().max(200).default(''),
    caption: z.string().trim().max(500).default(''),
    valuation: z.coerce.number().min(0).default(0),
    story: z.string().trim().max(2000).default(''),
    aspectRatio: z.coerce.number().min(0.1).max(10).default(1.0),
  })).default([]),
});

type GalleriaCollectionRow = {
  id: string;
  title: string;
  curator_id: string;
  curator_name: string;
  curator_avatar: string;
  cover_image_url: string;
  description: string;
  subtitle: string;
  theme: string;
  status: string;
  created_at: string;
  published_at: string | null;
};

type GalleriaItemRow = {
  id: string;
  collection_id: string;
  listing_id: string | null;
  media_url: string;
  title: string;
  caption: string;
  valuation: string | number;
  story: string;
  aspect_ratio: string | number;
  sort_order: number;
};

function mapCollection(row: GalleriaCollectionRow, itemIds: string[]) {
  return {
    id: row.id,
    title: row.title,
    subtitle: row.subtitle,
    curator: row.curator_name || row.curator_id,
    curatorAvatar: row.curator_avatar,
    coverImage: row.cover_image_url,
    theme: row.theme,
    publishedAt: row.published_at ?? row.created_at,
    itemIds,
    isDemo: false,
  };
}

function mapItem(row: GalleriaItemRow) {
  return {
    id: row.id,
    title: row.title,
    valuation: Number(row.valuation),
    image: row.media_url,
    collection: '',
    story: row.story,
    aspectRatio: Number(row.aspect_ratio),
    isDemo: false,
    referenceKind: 'co_own' as const,
    listingId: row.listing_id ?? undefined,
  };
}

export function registerGalleriaRoutes({
  app,
  db,
  readDb,
  createApiError: _createApiError,
  resolveAuthenticatedUserId,
}: GalleriaRouteDependencies): void {
  app.get('/galleria/collections', async (request) => {
    const { limit, offset } = listCollectionsQuerySchema.parse(request.query);

    const result = await readDb.query<GalleriaCollectionRow>(
      `
        SELECT id, title, curator_id, curator_name, curator_avatar,
               cover_image_url, description, subtitle, theme, status,
               created_at, published_at
        FROM galleria_collections
        WHERE status = 'published'
        ORDER BY published_at DESC NULLS LAST, created_at DESC
        LIMIT $1 OFFSET $2
      `,
      [limit, offset]
    );

    const collectionIds = result.rows.map((r) => r.id);
    const itemsResult = collectionIds.length
      ? await readDb.query<{ collection_id: string; id: string }>(
          `SELECT collection_id, id FROM galleria_collection_items WHERE collection_id = ANY($1) ORDER BY sort_order`,
          [collectionIds]
        )
      : { rows: [] };

    const itemIdsByCollection = new Map<string, string[]>();
    for (const item of itemsResult.rows) {
      const arr = itemIdsByCollection.get(item.collection_id) ?? [];
      arr.push(item.id);
      itemIdsByCollection.set(item.collection_id, arr);
    }

    return {
      items: result.rows.map((row) =>
        mapCollection(row, itemIdsByCollection.get(row.id) ?? [])
      ),
    };
  });

  app.get<{ Params: { collectionId: string } }>(
    '/galleria/collections/:collectionId',
    async (request, reply) => {
      const { collectionId } = request.params;

      const collectionResult = await readDb.query<GalleriaCollectionRow>(
        `
          SELECT id, title, curator_id, curator_name, curator_avatar,
                 cover_image_url, description, subtitle, theme, status,
                 created_at, published_at
          FROM galleria_collections
          WHERE id = $1
          LIMIT 1
        `,
        [collectionId]
      );

      if (!collectionResult.rowCount) {
        reply.code(404);
        return { ok: false, error: 'Collection not found' };
      }

      const collection = collectionResult.rows[0];

      const itemsResult = await readDb.query<GalleriaItemRow>(
        `
          SELECT id, collection_id, listing_id, media_url, title, caption,
                 valuation, story, aspect_ratio, sort_order
          FROM galleria_collection_items
          WHERE collection_id = $1
          ORDER BY sort_order
        `,
        [collectionId]
      );

      return {
        collection: mapCollection(collection, itemsResult.rows.map((r) => r.id)),
        items: itemsResult.rows.map(mapItem),
      };
    }
  );

  app.post('/galleria/collections', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    if (request.authUser?.role !== 'admin') {
      reply.code(403);
      return { ok: false, error: 'Forbidden: admin role required' };
    }

    const parsed = createCollectionSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { ok: false, error: 'Invalid collection', details: parsed.error.flatten() };
    }

    const data = parsed.data;
    const collectionId = randomUUID();
    const now = new Date();

    await db.query(
      `
        INSERT INTO galleria_collections
          (id, title, curator_id, curator_name, curator_avatar, cover_image_url,
           description, subtitle, theme, status, created_at, published_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `,
      [
        collectionId,
        data.title,
        actorUserId,
        data.curatorName,
        data.curatorAvatar,
        data.coverImageUrl,
        data.description,
        data.subtitle,
        data.theme,
        data.status,
        now,
        data.status === 'published' ? now : null,
      ]
    );

    for (let i = 0; i < data.items.length; i++) {
      const item = data.items[i];
      await db.query(
        `
          INSERT INTO galleria_collection_items
            (id, collection_id, listing_id, media_url, title, caption,
             valuation, story, aspect_ratio, sort_order, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `,
        [
          randomUUID(),
          collectionId,
          item.listingId ?? null,
          item.mediaUrl,
          item.title,
          item.caption,
          item.valuation,
          item.story,
          item.aspectRatio,
          i,
          now,
        ]
      );
    }

    return {
      ok: true,
      id: collectionId,
    };
  });
}
