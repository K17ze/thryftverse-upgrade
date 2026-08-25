import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';

type CreatorRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  createApiError: (code: string, message: string, details?: Record<string, unknown>) => Error;
  resolveAuthenticatedUserId: (request: FastifyRequest, requestedUserId?: string) => string;
};

const ANALYTICS_CONTENT_TYPES = new Set(['look', 'poster', 'story', 'document']);
const ANALYTICS_EVENT_TYPES = new Set([
  'view', 'like', 'save', 'comment', 'share', 'product_click', 'profile_visit',
]);

export const registerCreatorRoutes = ({
  app,
  db,
  createApiError,
  resolveAuthenticatedUserId,
}: CreatorRouteDependencies) => {
  // POST /creator/analytics/events — log an analytics event
  app.post('/creator/analytics/events', async (request: FastifyRequest, reply: FastifyReply) => {
    const actorUserId = resolveAuthenticatedUserId(request);

    const bodySchema = z.object({
      content_type: z.string(),
      content_id: z.string().min(1).max(200),
      event_type: z.string(),
      metadata: z.record(z.unknown()).optional(),
    });
    const payload = bodySchema.parse(request.body);

    if (!ANALYTICS_CONTENT_TYPES.has(payload.content_type)) {
      throw createApiError('ANALYTICS_CONTENT_TYPE_INVALID', 'Invalid content_type');
    }
    if (!ANALYTICS_EVENT_TYPES.has(payload.event_type)) {
      throw createApiError('ANALYTICS_EVENT_TYPE_INVALID', 'Invalid event_type');
    }

    const result = await db.query<{ id: string }>(
      `INSERT INTO creator_analytics_events (creator_id, content_type, content_id, event_type, viewer_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
      [
        actorUserId,
        payload.content_type,
        payload.content_id,
        payload.event_type,
        actorUserId,
        JSON.stringify(payload.metadata ?? {}),
      ]
    );

    reply.code(201);
    return { ok: true, eventId: result.rows[0].id };
  });

  // GET /creator/analytics/summary — overall stats for the authenticated creator
  app.get('/creator/analytics/summary', async (request: FastifyRequest) => {
    const actorUserId = resolveAuthenticatedUserId(request);

    const result = await db.query<{
      views: string;
      likes: string;
      saves: string;
      comments: string;
      shares: string;
      product_clicks: string;
      profile_visits: string;
    }>(
      `SELECT
       COUNT(*) FILTER (WHERE event_type = 'view')          AS views,
       COUNT(*) FILTER (WHERE event_type = 'like')          AS likes,
       COUNT(*) FILTER (WHERE event_type = 'save')          AS saves,
       COUNT(*) FILTER (WHERE event_type = 'comment')       AS comments,
       COUNT(*) FILTER (WHERE event_type = 'share')         AS shares,
       COUNT(*) FILTER (WHERE event_type = 'product_click') AS product_clicks,
       COUNT(*) FILTER (WHERE event_type = 'profile_visit') AS profile_visits
     FROM creator_analytics_events
     WHERE creator_id = $1`,
      [actorUserId]
    );

    const row = result.rows[0] ?? {};
    const views = Number(row.views ?? 0);
    const engagement =
      Number(row.likes ?? 0) +
      Number(row.saves ?? 0) +
      Number(row.comments ?? 0) +
      Number(row.shares ?? 0) +
      Number(row.product_clicks ?? 0);

    return {
      views,
      likes: Number(row.likes ?? 0),
      saves: Number(row.saves ?? 0),
      comments: Number(row.comments ?? 0),
      shares: Number(row.shares ?? 0),
      productClicks: Number(row.product_clicks ?? 0),
      profileVisits: Number(row.profile_visits ?? 0),
      engagementRate: views > 0 ? Number((engagement / views).toFixed(4)) : 0,
    };
  });

  // GET /creator/analytics/timeline — daily time-series for the authenticated creator
  app.get('/creator/analytics/timeline', async (request: FastifyRequest) => {
    const actorUserId = resolveAuthenticatedUserId(request);

    const querySchema = z.object({
      days: z.coerce.number().int().min(1).max(365).default(30),
    });
    const { days } = querySchema.parse(request.query ?? {});

    const result = await db.query<{
      date: string;
      views: string;
      likes: string;
      saves: string;
      comments: string;
      shares: string;
      product_clicks: string;
      profile_visits: string;
    }>(
      `SELECT
       date_trunc('day', created_at)::date AS date,
       COUNT(*) FILTER (WHERE event_type = 'view')          AS views,
       COUNT(*) FILTER (WHERE event_type = 'like')          AS likes,
       COUNT(*) FILTER (WHERE event_type = 'save')          AS saves,
       COUNT(*) FILTER (WHERE event_type = 'comment')       AS comments,
       COUNT(*) FILTER (WHERE event_type = 'share')         AS shares,
       COUNT(*) FILTER (WHERE event_type = 'product_click') AS product_clicks,
       COUNT(*) FILTER (WHERE event_type = 'profile_visit') AS profile_visits
     FROM creator_analytics_events
     WHERE creator_id = $1
       AND created_at >= NOW() - ($2 || ' days')::INTERVAL
     GROUP BY date_trunc('day', created_at)::date
     ORDER BY date ASC`,
      [actorUserId, days]
    );

    return {
      items: result.rows.map((row) => ({
        date: row.date,
        views: Number(row.views),
        likes: Number(row.likes),
        saves: Number(row.saves),
        comments: Number(row.comments),
        shares: Number(row.shares),
        productClicks: Number(row.product_clicks),
        profileVisits: Number(row.profile_visits),
      })),
    };
  });

  // PATCH /creator/documents/:documentId/schedule — set or clear scheduled_for
  app.patch('/creator/documents/:documentId/schedule', async (request: FastifyRequest, reply: FastifyReply) => {
    const actorUserId = resolveAuthenticatedUserId(request);

    const paramsSchema = z.object({ documentId: z.string().min(2).max(120) });
    const { documentId } = paramsSchema.parse(request.params);

    const bodySchema = z.object({
      scheduled_for: z.string().datetime().nullable(),
    });
    const { scheduled_for } = bodySchema.parse(request.body);

    const ownerResult = await db.query<{ creator_id: string }>(
      `SELECT creator_id FROM creator_documents WHERE id = $1 LIMIT 1`,
      [documentId]
    );
    if (!ownerResult.rowCount) {
      reply.code(404);
      return { ok: false, error: 'Document not found' };
    }
    if (ownerResult.rows[0].creator_id !== actorUserId && request.authUser?.role !== 'admin') {
      reply.code(403);
      return { ok: false, error: 'Forbidden' };
    }

    await db.query(
      `UPDATE creator_documents SET scheduled_for = $2 WHERE id = $1`,
      [documentId, scheduled_for ? new Date(scheduled_for).toISOString() : null]
    );

    return { ok: true, scheduledFor: scheduled_for };
  });
};
