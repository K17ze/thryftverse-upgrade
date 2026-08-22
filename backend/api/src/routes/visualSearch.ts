import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';

type VisualSearchRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  /** Read-replica pool (falls back to primary when no replica is configured). */
  readDb: Pool;
};

const visualSearchBodySchema = z.object({
  imageUrl: z.string().optional(),
  imageBase64: z.string().optional(),
  query: z.string().trim().max(120).optional(),
  category: z.string().optional(),
  brand: z.string().optional(),
  size: z.string().optional(),
  condition: z.string().optional(),
  minPrice: z.coerce.number().nonnegative().optional(),
  maxPrice: z.coerce.number().nonnegative().optional(),
  sort: z.enum(['newest', 'price_asc', 'price_desc']).optional().default('newest'),
  limit: z.coerce.number().int().min(1).max(100).optional().default(48),
});

/**
 * Register the visual-search route on the Fastify instance:
 *   POST /visual-search — image-based product search (hybrid filter implementation)
 *
 * Visual Search — honest hybrid implementation.
 * Image-similarity ML is not deployed. Instead we run a real filtered query
 * (category + brand + price + description text) over active listings, reusing
 * the same row shape as GET /listings. The response carries visualMatching=false
 * so the frontend can label results truthfully ("Similar by category, brand &
 * description") rather than claiming AI image matching.
 */
export const registerVisualSearchRoutes = ({ app, db, readDb }: VisualSearchRouteDependencies): void => {
  app.post('/visual-search', async (request: FastifyRequest, reply: FastifyReply) => {
    const payload = visualSearchBodySchema.parse(request.body ?? {});

    // Telemetry: keep logging requests for future ML training/integration.
    if (payload.imageUrl) {
      try {
        await db.query(
          `INSERT INTO visual_search_requests (id, image_url, created_at) VALUES ($1, $2, NOW()) ON CONFLICT DO NOTHING`,
          [`vs_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, payload.imageUrl]
        );
      } catch {
        // Telemetry is best-effort; never fail the request on it.
      }
    }

    const conditions: string[] = ["l.status = 'active'"];
    const args: unknown[] = [];

    if (payload.category) {
      conditions.push(`l.category = $${args.length + 1}`);
      args.push(payload.category);
    }
    if (payload.brand) {
      conditions.push(`l.brand ILIKE $${args.length + 1}`);
      args.push(`%${payload.brand}%`);
    }
    if (payload.size) {
      conditions.push(`l.size ILIKE $${args.length + 1}`);
      args.push(`%${payload.size}%`);
    }
    if (payload.condition) {
      conditions.push(`l.condition ILIKE $${args.length + 1}`);
      args.push(`%${payload.condition}%`);
    }
    if (payload.minPrice !== undefined) {
      conditions.push(`l.price_gbp >= $${args.length + 1}`);
      args.push(payload.minPrice);
    }
    if (payload.maxPrice !== undefined) {
      conditions.push(`l.price_gbp <= $${args.length + 1}`);
      args.push(payload.maxPrice);
    }
    if (payload.query) {
      conditions.push(`(l.title ILIKE $${args.length + 1} OR l.description ILIKE $${args.length + 1} OR l.brand ILIKE $${args.length + 1})`);
      args.push(`%${payload.query}%`);
    }

    const orderBy =
      payload.sort === 'price_asc'
        ? 'l.price_gbp ASC, l.id ASC'
        : payload.sort === 'price_desc'
          ? 'l.price_gbp DESC, l.id DESC'
          : 'l.created_at DESC, l.id DESC';

    const result = await readDb.query<{
      id: string;
      seller_id: string;
      title: string;
      description: string;
      price_gbp: number | string;
      image_url: string | null;
      status: string;
      category: string | null;
      brand: string | null;
      size: string | null;
      condition: string | null;
      original_price_gbp: number | string | null;
      created_at: string;
      seller_username: string | null;
    }>(
      `
        SELECT
          l.id, l.seller_id, l.title, l.description, l.price_gbp, l.image_url,
          l.status, l.category, l.brand, l.size, l.condition, l.original_price_gbp, l.created_at,
          u.username AS seller_username
        FROM listings l
        LEFT JOIN users u ON u.id = l.seller_id
        WHERE ${conditions.join(' AND ')}
        ORDER BY ${orderBy}
        LIMIT $${args.length + 1}
      `,
      [...args, payload.limit]
    );

    const listingIds = result.rows.map((r) => r.id);
    const imagesResult = listingIds.length
      ? await readDb.query<{ listing_id: string; image_url: string; sort_order: number }>(
          `SELECT listing_id, image_url, sort_order FROM listing_images WHERE listing_id = ANY($1) ORDER BY sort_order`,
          [listingIds]
        )
      : { rows: [] };

    const imagesByListing = new Map<string, string[]>();
    for (const img of imagesResult.rows) {
      const arr = imagesByListing.get(img.listing_id) ?? [];
      arr.push(img.image_url);
      imagesByListing.set(img.listing_id, arr);
    }

    reply.code(200);
    return {
      ok: true,
      runtimeAvailable: true,
      // Truthful flag: results are filter-based, not ML image-similarity.
      visualMatching: false,
      note: 'Results are matched by category, brand, and description.',
      items: result.rows.map((row) => ({
        id: row.id,
        sellerId: row.seller_id,
        title: row.title,
        description: row.description,
        priceGbp: Number(row.price_gbp),
        imageUrl: row.image_url,
        images: imagesByListing.get(row.id) ?? (row.image_url ? [row.image_url] : []),
        status: row.status,
        category: row.category,
        brand: row.brand,
        size: row.size,
        condition: row.condition,
        originalPriceGbp: row.original_price_gbp === null ? null : Number(row.original_price_gbp),
        createdAt: row.created_at,
        seller: row.seller_username
          ? {
              id: row.seller_id,
              username: row.seller_username,
              avatar: null,
              rating: null,
              reviewCount: null,
              location: null,
            }
          : null,
      })),
    };
  });
};
