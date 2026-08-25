import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { createConsumerAppeal } from '../lib/safetyCaseService.js';

type AppealsRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  createApiError: (code: string, message: string, details?: Record<string, unknown>) => Error;
  resolveAuthenticatedUserId: (request: FastifyRequest) => string;
};

// ── Zod schemas ──────────────────────────────────────────────────────────

const createAppealBodySchema = z.object({
  decisionId: z.string().trim().min(4).max(120),
  grounds: z.string().trim().min(1).max(5000),
  evidence_uris: z.array(z.string().url()).max(10).optional(),
});

// DSA Article 20 — complaints must be accepted within 6 months of the
// decision being communicated to the affected user.
const COMPLAINT_WINDOW_MS = 6 * 30 * 24 * 60 * 60 * 1000;

// ── Route registration ───────────────────────────────────────────────────

export const registerAppealsRoutes = ({
  app,
  db,
  createApiError,
  resolveAuthenticatedUserId,
}: AppealsRouteDependencies) => {
  // ── POST /appeals — user-facing appeal submission ──────────────────────
  //
  // Consumer auth (not workforce). Creates a safety_appeal record linked to
  // the decision, verified to affect the authenticated user.
  app.post('/appeals', async (request, reply) => {
    const userId = resolveAuthenticatedUserId(request);

    const parsed = createAppealBodySchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return {
        ok: false,
        error: 'Invalid appeal submission',
        code: 'APPEAL_VALIDATION_ERROR',
        details: parsed.error.flatten(),
      };
    }

    const { decisionId, grounds, evidence_uris } = parsed.data;

    // Verify the decision exists and affects the authenticated user.
    // The affected user is resolved via statements_of_reasons (the DSA
    // record that names the user whose content was restricted). If no
    // statement of reasons exists yet, fall back to the notice subject_id
    // through the case → notice chain.
    const sorResult = await db.query<{ affected_user_id: string }>(
      `SELECT affected_user_id FROM statements_of_reasons WHERE decision_id = $1 LIMIT 1`,
      [decisionId],
    );

    let affectedUserId = sorResult.rows[0]?.affected_user_id ?? null;

    if (!affectedUserId) {
      const noticeResult = await db.query<{ subject_id: string }>(
        `
          SELECT sn.subject_id
          FROM safety_decisions sd
          JOIN safety_cases sc ON sc.id = sd.case_id
          JOIN safety_notices sn ON sn.id = sc.notice_id
          WHERE sd.id = $1
          LIMIT 1
        `,
        [decisionId],
      );
      affectedUserId = noticeResult.rows[0]?.subject_id ?? null;
    }

    if (!affectedUserId) {
      reply.code(404);
      return {
        ok: false,
        error: 'Decision not found',
        code: 'DECISION_NOT_FOUND',
      };
    }

    if (affectedUserId !== userId) {
      reply.code(403);
      return {
        ok: false,
        error: 'You can only appeal decisions that affect your own account',
        code: 'APPEAL_NOT_AUTHORIZED',
      };
    }

    // Check the 6-month complaint window (DSA Article 20).
    const decisionResult = await db.query<{ decided_at: string }>(
      `SELECT decided_at FROM safety_decisions WHERE id = $1 LIMIT 1`,
      [decisionId],
    );

    const decidedAt = decisionResult.rows[0]?.decided_at;
    if (!decidedAt) {
      reply.code(404);
      return {
        ok: false,
        error: 'Decision not found',
        code: 'DECISION_NOT_FOUND',
      };
    }

    const elapsedMs = Date.now() - new Date(decidedAt).getTime();
    if (elapsedMs > COMPLAINT_WINDOW_MS) {
      reply.code(409);
      return {
        ok: false,
        error: 'The 6-month complaint window for this decision has expired',
        code: 'APPEAL_WINDOW_EXPIRED',
      };
    }

    // Check for an existing appeal on this decision by the same user to
    // prevent duplicate submissions.
    const existingResult = await db.query<{ id: string }>(
      `SELECT id FROM safety_appeals WHERE decision_id = $1 AND appellant_id = $2 AND status IN ('submitted', 'under_review') LIMIT 1`,
      [decisionId, userId],
    );

    if (existingResult.rows[0]) {
      reply.code(409);
      return {
        ok: false,
        error: 'An appeal for this decision is already under review',
        code: 'APPEAL_ALREADY_EXISTS',
        appealId: existingResult.rows[0].id,
      };
    }

    try {
      const appeal = await createConsumerAppeal(db, decisionId, {
        appellant_id: userId,
        grounds,
        new_evidence_ids: evidence_uris,
      });

      reply.code(201);
      return { ok: true, appealId: appeal.id };
    } catch {
      throw createApiError('APPEAL_SUBMISSION_FAILED', 'Could not submit appeal');
    }
  });

  // ── GET /appeals/:decisionId — fetch decision summary for the appeal form
  //
  // Returns a user-facing summary of the decision so the appeal screen can
  // show what was decided without exposing internal case data.
  app.get('/appeals/:decisionId', async (request, reply) => {
    const userId = resolveAuthenticatedUserId(request);

    const paramsSchema = z.object({
      decisionId: z.string().trim().min(4).max(120),
    });
    const parsed = paramsSchema.safeParse(request.params);
    if (!parsed.success) {
      reply.code(400);
      return { ok: false, error: 'Invalid decision ID', code: 'VALIDATION_ERROR' };
    }

    const { decisionId } = parsed.data;

    const result = await db.query<{
      decision: string;
      user_reason_code: string;
      internal_reason: string;
      decided_at: string;
      duration_kind: string;
      duration_until: string | null;
      affected_user_id: string;
    }>(
      `
        SELECT
          sd.decision,
          sd.user_reason_code,
          sd.internal_reason,
          sd.decided_at,
          sd.duration_kind,
          sd.duration_until,
          sor.affected_user_id
        FROM safety_decisions sd
        LEFT JOIN statements_of_reasons sor ON sor.decision_id = sd.id
        WHERE sd.id = $1
        LIMIT 1
      `,
      [decisionId],
    );

    const row = result.rows[0];
    if (!row || !row.affected_user_id) {
      reply.code(404);
      return { ok: false, error: 'Decision not found', code: 'DECISION_NOT_FOUND' };
    }

    if (row.affected_user_id !== userId) {
      reply.code(403);
      return {
        ok: false,
        error: 'You can only view decisions that affect your own account',
        code: 'APPEAL_NOT_AUTHORIZED',
      };
    }

    const elapsedMs = Date.now() - new Date(row.decided_at).getTime();
    const withinWindow = elapsedMs <= COMPLAINT_WINDOW_MS;

    return {
      ok: true,
      decision: {
        id: decisionId,
        decision: row.decision,
        userReasonCode: row.user_reason_code,
        summary: row.internal_reason,
        decidedAt: row.decided_at,
        durationKind: row.duration_kind,
        durationUntil: row.duration_until,
        withinComplaintWindow: withinWindow,
      },
    };
  });
};
