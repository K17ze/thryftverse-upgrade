import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { queryAuditLogs } from '../lib/auditLog.js';

type AdminAuditRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  createApiError: (code: string, message: string, details?: Record<string, unknown>) => Error;
  resolveAuthenticatedUserId: (request: FastifyRequest) => string;
};

const querySchema = z.object({
  adminUserId: z.string().trim().max(120).optional(),
  action: z.string().trim().max(60).optional(),
  resourceType: z.string().trim().max(80).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

function ensureAdmin(request: FastifyRequest, createApiError: AdminAuditRouteDependencies['createApiError']): void {
  if (!request.authUser || request.authUser.role !== 'admin') {
    throw createApiError('FORBIDDEN', 'Admin access required');
  }
}

/**
 * Registers admin audit log query routes. All routes require admin
 * authentication. Exposes a paginated query endpoint and an aggregate
 * stats endpoint (actions per day, top admins, top actions).
 */
export const registerAdminAuditRoutes = ({
  app,
  db,
  createApiError,
  resolveAuthenticatedUserId,
}: AdminAuditRouteDependencies) => {
  app.get('/admin/audit-logs', async (request, reply) => {
    ensureAdmin(request, createApiError);
    resolveAuthenticatedUserId(request);

    const parsed = querySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      reply.code(400);
      return { ok: false, error: 'Invalid query parameters', details: parsed.error.flatten() };
    }

    const filters = parsed.data;
    const result = await queryAuditLogs(db, {
      adminUserId: filters.adminUserId,
      action: filters.action,
      resourceType: filters.resourceType,
      startDate: filters.startDate ? new Date(filters.startDate) : undefined,
      endDate: filters.endDate ? new Date(filters.endDate) : undefined,
      limit: filters.limit,
      offset: filters.offset,
    });

    return {
      ok: true,
      entries: result.entries,
      total: result.total,
      limit: filters.limit,
      offset: filters.offset,
    };
  });

  app.get('/admin/audit-logs/stats', async (request, reply) => {
    ensureAdmin(request, createApiError);
    resolveAuthenticatedUserId(request);

    const statsQuery = request.query as { days?: string };
    const days = Math.min(Math.max(Number(statsQuery.days ?? '7') || 7, 1), 90);

    const actionsPerDay = await db.query<{ day: string; action: string; count: string }>(
      `
        SELECT DATE(created_at) AS day, action, COUNT(*)::TEXT AS count
        FROM admin_audit_logs
        WHERE created_at >= NOW() - ($1 || ' days')::INTERVAL
        GROUP BY day, action
        ORDER BY day DESC, count DESC
      `,
      [String(days)],
    );

    const topAdmins = await db.query<{ admin_user_id: string; count: string }>(
      `
        SELECT admin_user_id, COUNT(*)::TEXT AS count
        FROM admin_audit_logs
        WHERE created_at >= NOW() - ($1 || ' days')::INTERVAL
        GROUP BY admin_user_id
        ORDER BY count DESC
        LIMIT 20
      `,
      [String(days)],
    );

    const topActions = await db.query<{ action: string; count: string }>(
      `
        SELECT action, COUNT(*)::TEXT AS count
        FROM admin_audit_logs
        WHERE created_at >= NOW() - ($1 || ' days')::INTERVAL
        GROUP BY action
        ORDER BY count DESC
        LIMIT 20
      `,
      [String(days)],
    );

    return {
      ok: true,
      days,
      actionsPerDay: actionsPerDay.rows.map((row) => ({
        day: row.day,
        action: row.action,
        count: parseInt(row.count, 10),
      })),
      topAdmins: topAdmins.rows.map((row) => ({
        adminUserId: row.admin_user_id,
        count: parseInt(row.count, 10),
      })),
      topActions: topActions.rows.map((row) => ({
        action: row.action,
        count: parseInt(row.count, 10),
      })),
    };
  });
};
