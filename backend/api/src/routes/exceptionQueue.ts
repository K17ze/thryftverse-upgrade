/**
 * Exception queue — Gate 13 admin/operator REST routes.
 *
 * Provides infrastructure for tracking exceptional events that need human
 * attention: failed refunds with 'unknown' status, stuck returns, escrow
 * release blocks, webhook failures, etc. Every exception has a named owner
 * (team/user), a server-derived SLO deadline, and severity-based escalation.
 *
 * Routes:
 *   POST /exception-queue                       — create an exception entry
 *   GET  /exception-queue                       — list exceptions with filters
 *   GET  /exception-queue/slo-breaches          — list SLO-breached exceptions
 *   GET  /exception-queue/:exceptionId          — fetch a single exception
 *   POST /exception-queue/:exceptionId/assign   — assign to a team/user
 *   POST /exception-queue/:exceptionId/resolve  — resolve an exception
 *   POST /exception-queue/:exceptionId/escalate — escalate an exception
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';

interface ExceptionQueueRouteDependencies {
  app: FastifyInstance;
  db: Pool;
  resolveAuthenticatedUserId: (request: FastifyRequest) => string | null;
}

type Severity = 'p0' | 'p1' | 'p2' | 'p3';

const SLO_RESOLUTION_HOURS: Record<Severity, number> = {
  p0: 4,
  p1: 24,
  p2: 72,
  p3: 168,
};

export function computeSloDeadline(severity: Severity): Date {
  const now = new Date();
  const hours = SLO_RESOLUTION_HOURS[severity];
  return new Date(now.getTime() + hours * 60 * 60 * 1000);
}

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const severitySchema = z.enum(['p0', 'p1', 'p2', 'p3']);

const createBodySchema = z.object({
  entityType: z.string().trim().min(1).max(80),
  entityId: z.string().trim().min(1).max(120),
  eventType: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(2000),
  severity: severitySchema.default('p2'),
  metadata: z.record(z.unknown()).default({}),
  ownerTeam: z.string().trim().min(1).max(80).optional(),
});

const listQuerySchema = z.object({
  status: z.string().trim().max(40).optional(),
  severity: severitySchema.optional(),
  ownerTeam: z.string().trim().max(80).optional(),
  entityType: z.string().trim().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const exceptionIdParamSchema = z.object({
  exceptionId: z.string().trim().min(3).max(80),
});

const assignBodySchema = z.object({
  ownerTeam: z.string().trim().min(1).max(80),
  ownerUserId: z.string().trim().min(1).max(120).optional(),
});

const resolveBodySchema = z.object({
  resolutionNotes: z.string().trim().min(1).max(4000),
});

const escalateBodySchema = z.object({
  reason: z.string().trim().min(1).max(2000),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureOperator(request: FastifyRequest, reply: FastifyReply): boolean {
  const authUser = request.authUser;
  if (!authUser) {
    reply.code(401);
    return false;
  }
  const role = authUser.role as string;
  if (role !== 'admin' && role !== 'operator') {
    reply.code(403);
    return false;
  }
  return true;
}

interface ExceptionRow {
  id: string;
  entity_type: string;
  entity_id: string;
  event_type: string;
  description: string;
  metadata: unknown;
  severity: string;
  slo_deadline_at: string | null;
  owner_team: string;
  owner_user_id: string | null;
  assigned_at: string | null;
  status: string;
  resolution_notes: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  escalated_at: string | null;
  escalation_reason: string | null;
  created_at: string;
  updated_at: string;
}

function mapRowToDto(row: ExceptionRow) {
  const now = Date.now();
  const sloDeadlineMs = row.slo_deadline_at ? new Date(row.slo_deadline_at).getTime() : null;
  const breached = sloDeadlineMs !== null && sloDeadlineMs < now;
  const unowned = row.owner_team === 'unowned' && !row.owner_user_id;
  return {
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    eventType: row.event_type,
    description: row.description,
    metadata: row.metadata,
    severity: row.severity,
    sloDeadlineAt: row.slo_deadline_at,
    sloBreached: breached,
    ownerTeam: row.owner_team,
    ownerUserId: row.owner_user_id,
    assignedAt: row.assigned_at,
    status: row.status,
    resolutionNotes: row.resolution_notes,
    resolvedAt: row.resolved_at,
    resolvedBy: row.resolved_by,
    escalatedAt: row.escalated_at,
    escalationReason: row.escalation_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    unownedP0BeyondSlo:
      row.severity === 'p0' && unowned && breached,
  };
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export function registerExceptionQueueRoutes({
  app,
  db,
  resolveAuthenticatedUserId,
}: ExceptionQueueRouteDependencies) {
  // POST /exception-queue — create an exception entry
  app.post('/exception-queue', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!ensureOperator(request, reply)) {
      return { ok: false, error: 'Admin or operator access required', code: 'FORBIDDEN' };
    }
    const actorUserId = resolveAuthenticatedUserId(request);
    if (!actorUserId) {
      reply.code(401);
      return { ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' };
    }

    const parsed = createBodySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      reply.code(400);
      return { ok: false, error: 'Invalid body', details: parsed.error.flatten() };
    }

    const body = parsed.data;
    const sloDeadlineAt = computeSloDeadline(body.severity);
    const ownerTeam = body.ownerTeam ?? 'unowned';

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query<{ id: string; slo_deadline_at: string }>(
        `INSERT INTO exception_queue
           (entity_type, entity_id, event_type, description, metadata,
            severity, slo_deadline_at, owner_team, status)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, 'open')
         RETURNING id, slo_deadline_at`,
        [
          body.entityType,
          body.entityId,
          body.eventType,
          body.description,
          JSON.stringify(body.metadata),
          body.severity,
          sloDeadlineAt,
          ownerTeam,
        ],
      );

      await client.query('COMMIT');

      return {
        ok: true,
        exceptionId: result.rows[0].id,
        sloDeadlineAt: result.rows[0].slo_deadline_at,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      request.log.error({ err: error }, 'exception-queue create failed');
      reply.code(500);
      return { ok: false, error: 'Internal server error' };
    } finally {
      client.release();
    }
  });

  // GET /exception-queue/slo-breaches — list SLO-breached exceptions
  // Registered before the parametric :exceptionId route to avoid conflicts.
  app.get('/exception-queue/slo-breaches', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!ensureOperator(request, reply)) {
      return { ok: false, error: 'Admin or operator access required', code: 'FORBIDDEN' };
    }
    const actorUserId = resolveAuthenticatedUserId(request);
    if (!actorUserId) {
      reply.code(401);
      return { ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' };
    }

    try {
      const result = await db.query<ExceptionRow>(
        `SELECT * FROM exception_queue
         WHERE slo_deadline_at < NOW()
           AND status NOT IN ('resolved', 'wont_fix')
         ORDER BY severity ASC, slo_deadline_at ASC`,
      );

      const rows = result.rows.map(mapRowToDto);
      const grouped: Record<string, typeof rows> = { p0: [], p1: [], p2: [], p3: [] };
      for (const row of rows) {
        const sev = row.severity as Severity;
        if (grouped[sev]) {
          grouped[sev].push(row);
        }
      }

      const unownedP0BeyondSlo = rows.filter((r) => r.unownedP0BeyondSlo);

      return {
        ok: true,
        count: rows.length,
        breached: rows,
        groupedBySeverity: grouped,
        unownedP0BeyondSloCount: unownedP0BeyondSlo.length,
        unownedP0BeyondSlo,
      };
    } catch (error) {
      request.log.error({ err: error }, 'exception-queue slo-breaches query failed');
      reply.code(500);
      return { ok: false, error: 'Internal server error' };
    }
  });

  // GET /exception-queue — list exceptions with filters
  app.get('/exception-queue', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!ensureOperator(request, reply)) {
      return { ok: false, error: 'Admin or operator access required', code: 'FORBIDDEN' };
    }
    const actorUserId = resolveAuthenticatedUserId(request);
    if (!actorUserId) {
      reply.code(401);
      return { ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' };
    }

    const parsed = listQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      reply.code(400);
      return { ok: false, error: 'Invalid query parameters', details: parsed.error.flatten() };
    }

    const filters = parsed.data;
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (filters.status) {
      conditions.push(`status = $${paramIdx++}`);
      params.push(filters.status);
    }
    if (filters.severity) {
      conditions.push(`severity = $${paramIdx++}`);
      params.push(filters.severity);
    }
    if (filters.ownerTeam) {
      conditions.push(`owner_team = $${paramIdx++}`);
      params.push(filters.ownerTeam);
    }
    if (filters.entityType) {
      conditions.push(`entity_type = $${paramIdx++}`);
      params.push(filters.entityType);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    try {
      const countResult = await db.query<{ count: string }>(
        `SELECT COUNT(*)::TEXT AS count FROM exception_queue ${whereClause}`,
        params,
      );

      const listResult = await db.query<ExceptionRow>(
        `SELECT * FROM exception_queue ${whereClause}
         ORDER BY severity ASC, created_at DESC
         LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
        [...params, filters.limit, filters.offset],
      );

      const rows = listResult.rows.map(mapRowToDto);

      return {
        ok: true,
        exceptions: rows,
        total: Number(countResult.rows[0]?.count ?? 0),
        limit: filters.limit,
        offset: filters.offset,
      };
    } catch (error) {
      request.log.error({ err: error }, 'exception-queue list query failed');
      reply.code(500);
      return { ok: false, error: 'Internal server error' };
    }
  });

  // GET /exception-queue/:exceptionId — fetch a single exception
  app.get('/exception-queue/:exceptionId', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!ensureOperator(request, reply)) {
      return { ok: false, error: 'Admin or operator access required', code: 'FORBIDDEN' };
    }
    const actorUserId = resolveAuthenticatedUserId(request);
    if (!actorUserId) {
      reply.code(401);
      return { ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' };
    }

    const paramParsed = exceptionIdParamSchema.safeParse(request.params ?? {});
    if (!paramParsed.success) {
      reply.code(400);
      return { ok: false, error: 'Invalid exceptionId parameter' };
    }

    try {
      const result = await db.query<ExceptionRow>(
        'SELECT * FROM exception_queue WHERE id = $1 LIMIT 1',
        [paramParsed.data.exceptionId],
      );

      if (result.rowCount === 0) {
        reply.code(404);
        return { ok: false, error: 'Exception not found' };
      }

      return { ok: true, exception: mapRowToDto(result.rows[0]) };
    } catch (error) {
      request.log.error({ err: error }, 'exception-queue fetch failed');
      reply.code(500);
      return { ok: false, error: 'Internal server error' };
    }
  });

  // POST /exception-queue/:exceptionId/assign — assign to a team/user
  app.post('/exception-queue/:exceptionId/assign', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!ensureOperator(request, reply)) {
      return { ok: false, error: 'Admin or operator access required', code: 'FORBIDDEN' };
    }
    const actorUserId = resolveAuthenticatedUserId(request);
    if (!actorUserId) {
      reply.code(401);
      return { ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' };
    }

    const paramParsed = exceptionIdParamSchema.safeParse(request.params ?? {});
    if (!paramParsed.success) {
      reply.code(400);
      return { ok: false, error: 'Invalid exceptionId parameter' };
    }

    const bodyParsed = assignBodySchema.safeParse(request.body ?? {});
    if (!bodyParsed.success) {
      reply.code(400);
      return { ok: false, error: 'Invalid body', details: bodyParsed.error.flatten() };
    }

    const body = bodyParsed.data;
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query<ExceptionRow>(
        `UPDATE exception_queue
            SET owner_team = $2,
                owner_user_id = $3,
                status = 'acknowledged',
                assigned_at = NOW(),
                updated_at = NOW()
          WHERE id = $1
          RETURNING *`,
        [paramParsed.data.exceptionId, body.ownerTeam, body.ownerUserId ?? null],
      );

      if (result.rowCount === 0) {
        await client.query('ROLLBACK');
        reply.code(404);
        return { ok: false, error: 'Exception not found' };
      }

      await client.query('COMMIT');

      return { ok: true, exception: mapRowToDto(result.rows[0]) };
    } catch (error) {
      await client.query('ROLLBACK');
      request.log.error({ err: error }, 'exception-queue assign failed');
      reply.code(500);
      return { ok: false, error: 'Internal server error' };
    } finally {
      client.release();
    }
  });

  // POST /exception-queue/:exceptionId/resolve — resolve an exception
  app.post('/exception-queue/:exceptionId/resolve', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!ensureOperator(request, reply)) {
      return { ok: false, error: 'Admin or operator access required', code: 'FORBIDDEN' };
    }
    const actorUserId = resolveAuthenticatedUserId(request);
    if (!actorUserId) {
      reply.code(401);
      return { ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' };
    }

    const paramParsed = exceptionIdParamSchema.safeParse(request.params ?? {});
    if (!paramParsed.success) {
      reply.code(400);
      return { ok: false, error: 'Invalid exceptionId parameter' };
    }

    const bodyParsed = resolveBodySchema.safeParse(request.body ?? {});
    if (!bodyParsed.success) {
      reply.code(400);
      return { ok: false, error: 'Invalid body', details: bodyParsed.error.flatten() };
    }

    const body = bodyParsed.data;
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query<ExceptionRow>(
        `UPDATE exception_queue
            SET status = 'resolved',
                resolution_notes = $2,
                resolved_at = NOW(),
                resolved_by = $3,
                updated_at = NOW()
          WHERE id = $1
          RETURNING *`,
        [paramParsed.data.exceptionId, body.resolutionNotes, actorUserId],
      );

      if (result.rowCount === 0) {
        await client.query('ROLLBACK');
        reply.code(404);
        return { ok: false, error: 'Exception not found' };
      }

      await client.query('COMMIT');

      return { ok: true, exception: mapRowToDto(result.rows[0]) };
    } catch (error) {
      await client.query('ROLLBACK');
      request.log.error({ err: error }, 'exception-queue resolve failed');
      reply.code(500);
      return { ok: false, error: 'Internal server error' };
    } finally {
      client.release();
    }
  });

  // POST /exception-queue/:exceptionId/escalate — escalate an exception
  app.post('/exception-queue/:exceptionId/escalate', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!ensureOperator(request, reply)) {
      return { ok: false, error: 'Admin or operator access required', code: 'FORBIDDEN' };
    }
    const actorUserId = resolveAuthenticatedUserId(request);
    if (!actorUserId) {
      reply.code(401);
      return { ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' };
    }

    const paramParsed = exceptionIdParamSchema.safeParse(request.params ?? {});
    if (!paramParsed.success) {
      reply.code(400);
      return { ok: false, error: 'Invalid exceptionId parameter' };
    }

    const bodyParsed = escalateBodySchema.safeParse(request.body ?? {});
    if (!bodyParsed.success) {
      reply.code(400);
      return { ok: false, error: 'Invalid body', details: bodyParsed.error.flatten() };
    }

    const body = bodyParsed.data;
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query<ExceptionRow>(
        `UPDATE exception_queue
            SET escalated_at = NOW(),
                escalation_reason = $2,
                updated_at = NOW()
          WHERE id = $1
          RETURNING *`,
        [paramParsed.data.exceptionId, body.reason],
      );

      if (result.rowCount === 0) {
        await client.query('ROLLBACK');
        reply.code(404);
        return { ok: false, error: 'Exception not found' };
      }

      await client.query('COMMIT');

      return { ok: true, exception: mapRowToDto(result.rows[0]) };
    } catch (error) {
      await client.query('ROLLBACK');
      request.log.error({ err: error }, 'exception-queue escalate failed');
      reply.code(500);
      return { ok: false, error: 'Internal server error' };
    } finally {
      client.release();
    }
  });
}
