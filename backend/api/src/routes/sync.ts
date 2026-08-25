import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import type { AuthenticatedUser } from '../lib/auth.js';

interface ApiError extends Error {
  code: string;
  details?: Record<string, unknown>;
  statusCode?: number;
}

type SyncRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  readDb: Pool;
  resolveAuthenticatedUserId: (request: { authUser?: AuthenticatedUser }, requestedUserId?: string) => string;
  createApiError: (code: string, message: string, details?: Record<string, unknown>) => ApiError;
};

interface SyncDelta {
  id: string;
  rev: number;
  deleted: boolean;
  data: Record<string, unknown>;
}

interface PullResponse {
  deltas: SyncDelta[];
  latestRev: number;
}

type PushResponse =
  | { status: 'applied'; rev: number }
  | { status: 'superseded'; rev: number }
  | { status: 'conflict'; rev: number; message?: string }
  | { status: 'gone' };

const ALLOWED_PULL_DOMAINS = new Set(['listing_draft', 'product']);
const ALLOWED_PUSH_ENTITY_TYPES = new Set(['listing']);

function timestampToRev(value: Date | string | null): number {
  if (!value) return 0;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

export const registerSyncRoutes = ({
  app,
  db,
  readDb,
  resolveAuthenticatedUserId,
}: SyncRouteDependencies) => {
  app.get('/sync/:domain', async (request: FastifyRequest, reply: FastifyReply) => {
    resolveAuthenticatedUserId(request);

    const paramsSchema = z.object({
      domain: z.string().min(1).max(60),
    });
    const querySchema = z.object({
      since: z.coerce.number().int().min(0).default(0),
    });

    const { domain } = paramsSchema.parse(request.params);
    const { since } = querySchema.parse(request.query);

    if (!ALLOWED_PULL_DOMAINS.has(domain)) {
      reply.code(400);
      return {
        ok: false,
        error: `Unsupported sync domain: ${domain}`,
      };
    }

    if (domain === 'listing_draft' || domain === 'product') {
      const result = await readDb.query<{
        id: string;
        seller_id: string;
        title: string;
        description: string;
        price_gbp: string;
        image_url: string | null;
        status: string;
        category: string | null;
        brand: string | null;
        size: string | null;
        condition: string | null;
        original_price_gbp: string | null;
        shipping_method: string | null;
        shipping_payer: string | null;
        updated_at: Date | string | null;
      }>(
        `SELECT id, seller_id, title, description, price_gbp::text, image_url,
                status, category, brand, size, condition,
                original_price_gbp::text, shipping_method, shipping_payer,
                updated_at
         FROM listings
         WHERE updated_at > to_timestamp($1 / 1000.0)
         ORDER BY updated_at ASC
         LIMIT 500`,
        [since],
      );

      const deltas: SyncDelta[] = result.rows.map((row) => ({
        id: row.id,
        rev: timestampToRev(row.updated_at),
        deleted: row.status === 'deleted',
        data: {
          id: row.id,
          seller_id: row.seller_id,
          title: row.title,
          description: row.description,
          price: row.price_gbp,
          image_url: row.image_url,
          status: row.status,
          category: row.category,
          brand: row.brand,
          size: row.size,
          condition: row.condition,
          original_price_gbp: row.original_price_gbp,
          shipping_method: row.shipping_method,
          shipping_payer: row.shipping_payer,
        },
      }));

      const latestRevResult = await readDb.query<{ max_rev: string | null }>(
        `SELECT EXTRACT(EPOCH FROM MAX(updated_at)) * 1000 AS max_rev FROM listings`,
      );
      const latestRev = Number(latestRevResult.rows[0]?.max_rev ?? 0);

      const response: PullResponse = { deltas, latestRev };
      return response;
    }

    reply.code(400);
    return { ok: false, error: `Unsupported sync domain: ${domain}` };
  });

  app.post('/sync/push', async (request: FastifyRequest, reply: FastifyReply) => {
    const actorUserId = resolveAuthenticatedUserId(request);

    const bodySchema = z.object({
      operationId: z.string().min(2).max(200),
      entityType: z.string().min(1).max(60),
      entityId: z.string().min(2).max(200),
      operation: z.string().min(1).max(60),
      payload: z.string(),
      baseRev: z.number().int().min(0).default(0),
    });

    const payload = bodySchema.parse(request.body);

    if (!ALLOWED_PUSH_ENTITY_TYPES.has(payload.entityType)) {
      reply.code(400);
      return {
        ok: false,
        error: `Unsupported entity type: ${payload.entityType}`,
      };
    }

    const idempotencyResult = await db.query<{
      result_status: string;
      result_rev: string;
      result_message: string | null;
    }>(
      `SELECT result_status, result_rev::text, result_message
       FROM sync_operation_idempotency
       WHERE operation_id = $1
       LIMIT 1`,
      [payload.operationId],
    );

    if (idempotencyResult.rowCount && idempotencyResult.rowCount > 0) {
      const row = idempotencyResult.rows[0];
      const cachedRev = Number(row.result_rev);
      if (row.result_status === 'applied') {
        const response: PushResponse = { status: 'applied', rev: cachedRev };
        return response;
      }
      if (row.result_status === 'superseded') {
        const response: PushResponse = { status: 'superseded', rev: cachedRev };
        return response;
      }
      if (row.result_status === 'conflict') {
        const response: PushResponse = {
          status: 'conflict',
          rev: cachedRev,
          message: row.result_message ?? undefined,
        };
        return response;
      }
      if (row.result_status === 'gone') {
        const response: PushResponse = { status: 'gone' };
        return response;
      }
    }

    if (payload.entityType === 'listing' && payload.operation === 'create') {
      let parsedBody: {
        id: string;
        sellerId: string;
        title: string;
        description: string;
        priceGbp: number;
        imageUrl?: string;
        coverFinalizationId?: string;
        status?: string;
        category?: string;
        brand?: string;
        size?: string;
        condition?: string;
        originalPriceGbp?: number;
        shippingMethod?: string;
        shippingPayer?: string;
      };
      try {
        parsedBody = JSON.parse(payload.payload);
      } catch {
        reply.code(400);
        return { ok: false, error: 'Invalid payload JSON' };
      }

      if (parsedBody.sellerId !== actorUserId) {
        reply.code(403);
        return { ok: false, error: 'Seller identity must match the authenticated user' };
      }

      const existing = await db.query<{ seller_id: string; updated_at: Date | string | null }>(
        `SELECT seller_id, updated_at FROM listings WHERE id = $1 LIMIT 1`,
        [payload.entityId],
      );

      if (existing.rowCount && existing.rowCount > 0) {
        const existingRev = timestampToRev(existing.rows[0].updated_at);
        if (existing.rows[0].seller_id !== actorUserId) {
          reply.code(409);
          return { ok: false, error: 'Listing ID belongs to another seller' };
        }
        if (payload.baseRev > 0 && existingRev > payload.baseRev) {
          await db.query(
            `INSERT INTO sync_operation_idempotency
               (operation_id, entity_type, entity_id, operation, result_status, result_rev, result_message)
             VALUES ($1, $2, $3, $4, 'conflict', $5, $6)
             ON CONFLICT (operation_id) DO NOTHING`,
            [
              payload.operationId,
              payload.entityType,
              payload.entityId,
              payload.operation,
              existingRev,
              'Server revision is newer than base revision',
            ],
          );
          const response: PushResponse = {
            status: 'conflict',
            rev: existingRev,
            message: 'Server revision is newer than base revision',
          };
          return response;
        }

        const updated = await db.query<{ updated_at: Date | string }>(
          `UPDATE listings
             SET title = $2,
                 description = $3,
                 price_gbp = $4,
                 image_url = $5,
                 status = $6,
                 category = $7,
                 brand = $8,
                 size = $9,
                 condition = $10,
                 original_price_gbp = $11,
                 shipping_method = $12,
                 shipping_payer = $13,
                 updated_at = NOW()
           WHERE id = $1 AND seller_id = $14
           RETURNING updated_at`,
          [
            payload.entityId,
            parsedBody.title,
            parsedBody.description,
            parsedBody.priceGbp,
            parsedBody.imageUrl ?? null,
            parsedBody.status ?? 'active',
            parsedBody.category ?? null,
            parsedBody.brand ?? null,
            parsedBody.size ?? null,
            parsedBody.condition ?? null,
            parsedBody.originalPriceGbp ?? null,
            parsedBody.shippingMethod ?? null,
            parsedBody.shippingPayer ?? null,
            actorUserId,
          ],
        );

        if (!updated.rowCount || updated.rowCount === 0) {
          reply.code(409);
          return { ok: false, error: 'Listing ID belongs to another seller' };
        }

        const rev = timestampToRev(updated.rows[0].updated_at);
        await db.query(
          `INSERT INTO sync_operation_idempotency
             (operation_id, entity_type, entity_id, operation, result_status, result_rev)
           VALUES ($1, $2, $3, $4, 'applied', $5)
           ON CONFLICT (operation_id) DO NOTHING`,
          [payload.operationId, payload.entityType, payload.entityId, payload.operation, rev],
        );
        const response: PushResponse = { status: 'applied', rev };
        return response;
      }

      const inserted = await db.query<{ updated_at: Date | string }>(
        `INSERT INTO listings
           (id, seller_id, title, description, price_gbp, image_url,
            status, category, brand, size, condition,
            original_price_gbp, shipping_method, shipping_payer)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         RETURNING updated_at`,
        [
          payload.entityId,
          actorUserId,
          parsedBody.title,
          parsedBody.description,
          parsedBody.priceGbp,
          parsedBody.imageUrl ?? null,
          parsedBody.status ?? 'active',
          parsedBody.category ?? null,
          parsedBody.brand ?? null,
          parsedBody.size ?? null,
          parsedBody.condition ?? null,
          parsedBody.originalPriceGbp ?? null,
          parsedBody.shippingMethod ?? null,
          parsedBody.shippingPayer ?? null,
        ],
      );

      const rev = timestampToRev(inserted.rows[0].updated_at);
      await db.query(
        `INSERT INTO sync_operation_idempotency
           (operation_id, entity_type, entity_id, operation, result_status, result_rev)
         VALUES ($1, $2, $3, $4, 'applied', $5)
         ON CONFLICT (operation_id) DO NOTHING`,
        [payload.operationId, payload.entityType, payload.entityId, payload.operation, rev],
      );
      const response: PushResponse = { status: 'applied', rev };
      return response;
    }

    reply.code(400);
    return {
      ok: false,
      error: `Unsupported operation: ${payload.operation} on ${payload.entityType}`,
    };
  });
};
