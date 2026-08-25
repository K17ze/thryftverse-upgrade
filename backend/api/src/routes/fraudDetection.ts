/**
 * Fraud detection API routes.
 *
 * Exposes endpoints for checking events, retrieving risk scores and
 * signals (admin-only), querying user-safe intervention state, submitting
 * user-facing fraud reports, and managing the durable risk case system.
 *
 * Anti-AI design policy (AGENTS.md §11 — Truthful, anti-AI design policy):
 * - User-facing endpoints return user-safe state, not internal scores/signals.
 * - No surveillance-like device details exposed to users.
 * - Admin endpoints are clearly separated from user endpoints.
 * - The simulation endpoint is clearly labeled as simulation, not production.
 *
 * Routes:
 * - POST /fraud/simulate                    — audited simulation (admin-only)
 * - POST /fraud/check                       — deprecated alias → /fraud/simulate
 * - GET  /fraud/score/:userId               — numeric risk score (admin-only)
 * - GET  /fraud/signals/:userId             — raw risk signals (admin-only)
 * - GET  /fraud/intervention-state/:userId  — user-safe state (user: own only; admin: any)
 * - POST /fraud/report                      — user-facing fraud report (authenticated)
 * - GET  /fraud/cases                       — list risk cases (admin-only, paginated)
 * - GET  /fraud/cases/:caseId               — single case with events (admin-only)
 * - POST /fraud/cases/:caseId/events        — add a case event (admin-only)
 * - GET  /fraud/cases/:caseId/evidence      — list evidence bindings (admin-only)
 * - POST /fraud/labels                      — record confirmed outcome label (admin-only)
 * - GET  /fraud/overrides                   — list active overrides (admin-only)
 * - POST /fraud/overrides                   — create scoped expiring override (admin-only)
 * - POST /fraud/overrides/:overrideId/revoke — revoke an override (admin-only)
 * - GET  /fraud/ml/promotion-status         — evaluate ML promotion gate (admin-only)
 * - POST /fraud/ml/promotion-decision       — record ML promotion decision (admin-only)
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import { z } from 'zod';
import {
  checkFraud,
  getUserRiskProfile,
  getUserRiskSignals,
  submitFraudReport,
  type FraudEventType,
  type VelocityLimits,
  DEFAULT_VELOCITY_LIMITS,
} from '../lib/fraudDetection.js';
import {
  getUserSafeInterventionState,
  createRiskCase,
  addCaseEvent,
  recordRiskLabel,
  createRiskOverride,
  getActiveOverrides,
  revokeRiskOverride,
  type RiskAction,
  type RiskCaseType,
  type RiskLabel,
} from '../lib/riskDecision.js';
import {
  evaluatePromotionGate,
  recordPromotionDecision,
  getLatestPromotionDecision,
  type PromotionGateOptions,
  type PromotionDecision,
} from '../lib/mlPromotionGate.js';

export interface FraudRouteDependencies {
  app: FastifyInstance;
  db: Pool;
  redis: Redis;
}

const checkEventSchema = z.object({
  eventType: z.enum(['signup', 'listing', 'message', 'transaction']),
  userId: z.string().min(2).max(120).optional(),
  email: z.string().email().max(320).optional(),
  accountAgeSeconds: z.number().min(0).optional(),
  amountGbp: z.number().min(0).optional(),
  headers: z.record(z.string()).optional(),
  ip: z.string().min(1).max(80),
  velocityOverrides: z
    .object({
      accountCreationMax: z.number().int().min(1).optional(),
      listingCreationMax: z.number().int().min(1).optional(),
      messageMax: z.number().int().min(1).optional(),
      loginAttemptMax: z.number().int().min(1).optional(),
      windowSeconds: z.number().int().min(60).optional(),
    })
    .optional(),
});

const reportSchema = z.object({
  reportedUserId: z.string().min(2).max(120),
  eventType: z.enum(['signup', 'listing', 'message', 'transaction']),
  reason: z.string().trim().min(3).max(500),
  details: z.string().max(2000).optional(),
  referenceId: z.string().min(2).max(120).optional(),
});

const userIdParamsSchema = z.object({
  userId: z.string().min(2).max(120),
});

const caseIdParamsSchema = z.object({
  caseId: z.string().min(2).max(120),
});

const overrideIdParamsSchema = z.object({
  overrideId: z.string().min(2).max(120),
});

const caseListQuerySchema = z.object({
  status: z
    .enum(['open', 'in_review', 'on_hold', 'resolved', 'closed', 'escalated'])
    .optional(),
  case_type: z
    .enum([
      'account_takeover',
      'live_scam_phishing',
      'payout_withdrawal',
      'payment_card',
      'seller_listing_integrity',
      'auction_collusion',
      'returns_refunds',
      'operator_abuse',
      'user_fraud_report',
    ])
    .optional(),
  priority: z.enum(['low', 'normal', 'high', 'critical']).optional(),
  assigned_to: z.string().min(1).max(120).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const caseEventSchema = z.object({
  eventType: z.enum([
    'status_changed',
    'assigned',
    'evidence_added',
    'action_taken',
    'note_added',
    'escalated',
    'resolved',
    'closed',
    'reopened',
    'sla_breached',
    'legal_hold_toggled',
  ]),
  reasonCode: z.string().trim().min(1).max(120).optional(),
  reasonText: z.string().trim().min(1).max(1000).optional(),
  fromStatus: z.string().trim().min(1).max(60).optional(),
  toStatus: z.string().trim().min(1).max(60).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const labelSchema = z.object({
  eventId: z.string().min(2).max(120).optional(),
  decisionId: z.string().min(2).max(120).optional(),
  caseId: z.string().min(2).max(120).optional(),
  label: z.enum([
    'confirmed_fraud',
    'confirmed_ato',
    'confirmed_scam_victim',
    'policy_abuse',
    'legitimate',
    'false_positive',
    'user_cancelled',
    'insufficient_evidence',
    'provider_pending',
    'dispute_pending',
    'appeal_pending',
    'reversed_on_appeal',
  ]),
  labelSource: z.enum([
    'provider_chargeback',
    'case_review',
    'user_confirmation',
    'law_enforcement',
    'rule_proxy',
    'operator_review',
  ]),
  confidence: z.number().min(0).max(1).optional(),
  reviewerId: z.string().min(1).max(120).optional(),
  reversalOfLabelId: z.string().min(1).max(120).optional(),
});

const overrideListQuerySchema = z.object({
  scopeType: z
    .enum([
      'user',
      'device',
      'ip_range',
      'listing',
      'payment_instrument',
      'payout_destination',
      'event_type',
    ])
    .optional(),
  scopeRef: z.string().min(1).max(120).optional(),
});

const overrideCreateSchema = z.object({
  scopeType: z.enum([
    'user',
    'device',
    'ip_range',
    'listing',
    'payment_instrument',
    'payout_destination',
    'event_type',
  ]),
  scopeRef: z.string().min(1).max(120),
  actionOverride: z.enum([
    'allow',
    'allow_with_limits',
    'step_up',
    'manual_review',
    'deny',
  ]),
  reason: z.string().trim().min(3).max(500),
  expiresAt: z.string().min(1).max(60),
});

const overrideRevokeSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

const promotionStatusQuerySchema = z.object({
  windowDays: z.coerce.number().int().min(1).max(365).optional(),
  minSampleSize: z.coerce.number().int().min(1).optional(),
  minAgreementRate: z.coerce.number().min(0).max(100).optional(),
  maxFalseNegativeRate: z.coerce.number().min(0).max(100).optional(),
  maxFalsePositiveRate: z.coerce.number().min(0).max(100).optional(),
  minPrecision: z.coerce.number().min(0).max(1).optional(),
  minRecall: z.coerce.number().min(0).max(1).optional(),
  maxCalibrationError: z.coerce.number().min(0).max(1).optional(),
});

const promotionDecisionSchema = z.object({
  decision: z.enum(['promote', 'hold', 'reject']),
  justification: z.string().trim().min(3).max(2000),
  metrics: z.object({
    totalShadowDecisions: z.number().int().min(0),
    agreementRate: z.number().min(0).max(100),
    falsePositiveRate: z.number().min(0).max(100),
    falseNegativeRate: z.number().min(0).max(100),
    precision: z.number().min(0).max(1),
    recall: z.number().min(0).max(1),
    calibrationError: z.number().min(0).max(1),
    evaluatedAt: z.string().min(1),
  }),
  gateResult: z.object({
    canPromote: z.boolean(),
    blockingReasons: z.array(z.string()),
    warnings: z.array(z.string()),
    metrics: z.object({
      totalShadowDecisions: z.number().int().min(0),
      agreementRate: z.number().min(0).max(100),
      falsePositiveRate: z.number().min(0).max(100),
      falseNegativeRate: z.number().min(0).max(100),
      precision: z.number().min(0).max(1),
      recall: z.number().min(0).max(1),
      calibrationError: z.number().min(0).max(1),
      evaluatedAt: z.string().min(1),
    }),
    evaluatedAt: z.string().min(1),
  }),
});

const unauthorized = (reply: FastifyReply) => {
  reply.code(401);
  return { ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' };
};

const forbidden = (reply: FastifyReply) => {
  reply.code(403);
  return { ok: false, error: 'Forbidden', code: 'FORBIDDEN' };
};

const notFound = (reply: FastifyReply) => {
  reply.code(404);
  return { ok: false, error: 'Not found', code: 'NOT_FOUND' };
};

export const registerFraudDetectionRoutes = ({
  app,
  db,
  redis,
}: FraudRouteDependencies) => {
  /**
   * POST /fraud/simulate
   *
   * Audited simulation endpoint. Admin-only.
   *
   * This is a SIMULATOR, not trustworthy production decision input. It accepts
   * caller-supplied IP, headers and velocity overrides so operators can replay
   * scenarios and explore what the rule engine would have decided under
   * different conditions. Production risk decisions derive context server-side
   * (real request IP, real headers, configured velocity limits) and forbid
   * overrides — they go through evaluateRisk() in riskDecision.ts, not here.
   *
   * Every simulation call is logged for audit.
   *
   * Returns the full risk assessment with explainable signals.
   */
  app.post(
    '/fraud/simulate',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authUser = request.authUser;
      if (!authUser) {
        return unauthorized(reply);
      }
      if (authUser.role !== 'admin') {
        return forbidden(reply);
      }

      const payload = checkEventSchema.parse(request.body ?? {});

      // Audit log — every simulation call is recorded.
      request.log.info(
        {
          audit: true,
          eventType: 'fraud.simulate',
          actorId: authUser.userId,
          simulatedEventType: payload.eventType,
          simulatedUserId: payload.userId,
          simulatedIp: payload.ip,
          hasVelocityOverrides: Boolean(payload.velocityOverrides),
        },
        'fraud simulation invoked',
      );

      // Merge request headers with any explicitly provided headers
      const requestHeaders: Record<string, string | string[] | undefined> = {};
      for (const [key, value] of Object.entries(request.headers)) {
        requestHeaders[key] = value;
      }
      if (payload.headers) {
        for (const [key, value] of Object.entries(payload.headers)) {
          if (!requestHeaders[key.toLowerCase()]) {
            requestHeaders[key.toLowerCase()] = value;
          }
        }
      }

      const limits: VelocityLimits = {
        ...DEFAULT_VELOCITY_LIMITS,
        ...payload.velocityOverrides,
      };

      const result = await checkFraud(
        redis,
        {
          eventType: payload.eventType as FraudEventType,
          userId: payload.userId,
          email: payload.email,
          accountAgeSeconds: payload.accountAgeSeconds,
          amountGbp: payload.amountGbp,
          headers: requestHeaders,
          ip: payload.ip,
          velocityOverrides: payload.velocityOverrides,
        },
        limits
      );

      return {
        ok: true,
        simulation: true,
        result: {
          eventId: result.eventId,
          eventType: result.eventType,
          userId: result.userId,
          deviceFingerprint: result.deviceFingerprint,
          ipAddress: result.ipAddress,
          evaluationStatus: result.evaluationStatus,
          riskScore: result.riskScore,
          riskLevel: result.riskLevel,
          action: result.action,
          policyAction: result.policyAction,
          reasonCode: result.reasonCode,
          signals: result.signals,
          checkedAt: result.checkedAt,
        },
      };
    },
  );

  /**
   * POST /fraud/check
   *
   * DEPRECATED alias for POST /fraud/simulate. Redirects (307 Temporary
   * Redirect, preserving method and body) to /fraud/simulate. Use
   * /fraud/simulate directly — this alias will be removed in a future
   * release.
   */
  app.post('/fraud/check', async (request: FastifyRequest, reply: FastifyReply) => {
    reply
      .code(307)
      .header('Deprecation', 'true')
      .header('Location', '/fraud/simulate');
    return { ok: false, code: 'DEPRECATED', error: 'Use POST /fraud/simulate' };
  });

  /**
   * GET /fraud/score/:userId
   *
   * Get the current numeric risk score and profile for a user.
   * ADMIN-ONLY. Regular users must use GET /fraud/intervention-state/:userId
   * for a user-safe view of their account state. Exposing numeric scores,
   * risk levels, device fingerprints and event counts to regular users is
   * evasion-sensitive and was removed (FR-11).
   */
  app.get(
    '/fraud/score/:userId',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authUser = request.authUser;
      if (!authUser) {
        return unauthorized(reply);
      }
      if (authUser.role !== 'admin') {
        return forbidden(reply);
      }

      const { userId } = userIdParamsSchema.parse(request.params);

      const profile = await getUserRiskProfile(redis, userId);

      if (!profile) {
        return {
          ok: true,
          profile: null,
          message: 'No fraud checks have been recorded for this user',
        };
      }

      return {
        ok: true,
        profile: {
          userId: profile.userId,
          currentScore: profile.currentScore,
          riskLevel: profile.riskLevel,
          lastCheckedAt: profile.lastCheckedAt,
          eventCount: profile.eventCount,
          deviceFingerprints: profile.deviceFingerprints,
        },
      };
    },
  );

  /**
   * GET /fraud/signals/:userId
   *
   * Get the aggregated raw risk signals for a user from recent fraud checks.
   * ADMIN-ONLY. Regular users must use GET /fraud/intervention-state/:userId.
   * Raw signals expose internal rule IDs and weights that are evasion-
   * sensitive and were removed from user-facing access (FR-11).
   */
  app.get(
    '/fraud/signals/:userId',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authUser = request.authUser;
      if (!authUser) {
        return unauthorized(reply);
      }
      if (authUser.role !== 'admin') {
        return forbidden(reply);
      }

      const { userId } = userIdParamsSchema.parse(request.params);

      const signals = await getUserRiskSignals(redis, userId);

      return {
        ok: true,
        userId,
        signals,
      };
    },
  );

  /**
   * GET /fraud/intervention-state/me
   *
   * Convenience alias — returns the authenticated user's own intervention
   * state. This is the primary endpoint the mobile app calls (no need to
   * know the userId ahead of time). Registered BEFORE /:userId so /me is
   * not captured as a userId param.
   */
  app.get('/fraud/intervention-state/me', async (request: FastifyRequest, reply: FastifyReply) => {
    const authUser = request.authUser;
    if (!authUser) {
      return unauthorized(reply);
    }

    const state = await getUserSafeInterventionState(db, authUser.userId);

    return {
      ok: true,
      state,
    };
  });

  /**
   * GET /fraud/intervention-state/:userId
   *
   * Get the user-safe intervention state for a user. This replaces the old
   * /fraud/score/:userId and /fraud/signals/:userId endpoints for regular
   * users (FR-11). Regular users can query their OWN state only; admins can
   * query any user.
   *
   * Returns: state, reasonFamily (plain-language), nextAction (label + route),
   * supportRoute, impactedCapabilities. NEVER numeric scores, model labels,
   * device fingerprints or internal signal/rule IDs.
   */
  app.get(
    '/fraud/intervention-state/:userId',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authUser = request.authUser;
      if (!authUser) {
        return unauthorized(reply);
      }

      const { userId } = userIdParamsSchema.parse(request.params);

      if (authUser.role !== 'admin' && userId !== authUser.userId) {
        return forbidden(reply);
      }

      const state = await getUserSafeInterventionState(db, userId);

      return {
        ok: true,
        userId,
        state,
      };
    },
  );

  /**
   * POST /fraud/report
   *
   * Submit a user-facing fraud report. Any authenticated user can report
   * another user for fraudulent activity. The source of truth is now a
   * durable PostgreSQL case (createRiskCase); the legacy Redis-backed
   * submitFraudReport() is kept as a fallback/cache. The response returns
   * a case_id that the user can reference in support conversations.
   */
  app.post('/fraud/report', async (request: FastifyRequest, reply: FastifyReply) => {
    const authUser = request.authUser;
    if (!authUser) {
      return unauthorized(reply);
    }

    const payload = reportSchema.parse(request.body ?? {});

    if (payload.reportedUserId === authUser.userId) {
      reply.code(400);
      return { ok: false, error: 'Cannot report yourself', code: 'SELF_REPORT' };
    }

    // Source of truth: durable PostgreSQL case.
    const caseRecord = await createRiskCase(db, {
      caseType: 'user_fraud_report' as RiskCaseType,
      subjectRefs: [payload.reportedUserId],
      metadata: {
        reporterUserId: authUser.userId,
        eventType: payload.eventType,
        reason: payload.reason,
        details: payload.details,
        referenceId: payload.referenceId,
      },
    });

    // Record the reporter context as a case event.
    await addCaseEvent(db, {
      caseId: caseRecord.caseId,
      eventType: 'note_added',
      actorId: authUser.userId,
      actorType: 'user',
      reasonText: payload.reason,
      metadata: {
        reportedUserId: payload.reportedUserId,
        eventType: payload.eventType,
        details: payload.details,
        referenceId: payload.referenceId,
      },
    });

    // Fallback/cache: keep the Redis-backed report for backward compatibility.
    let redisReportId: string | null = null;
    try {
      const redisResult = await submitFraudReport(redis, {
        reporterUserId: authUser.userId,
        reportedUserId: payload.reportedUserId,
        eventType: payload.eventType as FraudEventType,
        reason: payload.reason,
        details: payload.details,
        referenceId: payload.referenceId,
      });
      redisReportId = redisResult.reportId;
    } catch (err) {
      request.log.warn(
        { err, caseId: caseRecord.caseId },
        'Redis fraud report fallback failed; PostgreSQL case is source of truth',
      );
    }

    reply.code(201);
    return {
      ok: true,
      case_id: caseRecord.caseId,
      reportId: redisReportId,
      status: 'open',
      createdAt: caseRecord.createdAt,
    };
  });

  // -------------------------------------------------------------------------
  // Admin: durable case system
  // -------------------------------------------------------------------------

  /**
   * GET /fraud/cases
   *
   * List risk cases with optional filters. ADMIN-ONLY. Returns paginated
   * results. Filters: status, case_type, priority, assigned_to.
   */
  app.get('/fraud/cases', async (request: FastifyRequest, reply: FastifyReply) => {
    const authUser = request.authUser;
    if (!authUser) {
      return unauthorized(reply);
    }
    if (authUser.role !== 'admin') {
      return forbidden(reply);
    }

    const query = caseListQuerySchema.parse(request.query ?? {});

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (query.status) {
      conditions.push(`status = $${paramIndex++}`);
      params.push(query.status);
    }
    if (query.case_type) {
      conditions.push(`case_type = $${paramIndex++}`);
      params.push(query.case_type);
    }
    if (query.priority) {
      conditions.push(`priority = $${paramIndex++}`);
      params.push(query.priority);
    }
    if (query.assigned_to) {
      conditions.push(`assigned_to = $${paramIndex++}`);
      params.push(query.assigned_to);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await db.query(
      `SELECT COUNT(*)::int AS total FROM risk_cases ${whereClause}`,
      params,
    );
    const total: number =
      countResult.rowCount && countResult.rowCount > 0
        ? countResult.rows[0].total
        : 0;

    params.push(query.limit);
    params.push(query.offset);
    const result = await db.query(
      `SELECT case_id, case_type, status, priority, priority_score,
         loss_exposure_minor, loss_exposure_currency, owner_team, assigned_to,
         subject_refs, sla_due_at, sla_breach_at, legal_hold, created_at,
         updated_at, closed_at
       FROM risk_cases
       ${whereClause}
       ORDER BY
         CASE status WHEN 'open' THEN 0 WHEN 'in_review' THEN 1 WHEN 'on_hold' THEN 2
              WHEN 'escalated' THEN 3 WHEN 'resolved' THEN 4 WHEN 'closed' THEN 5 END,
         priority DESC, created_at ASC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      params,
    );

    return {
      ok: true,
      total,
      limit: query.limit,
      offset: query.offset,
      cases: result.rows.map((row) => ({
        caseId: row.case_id,
        caseType: row.case_type,
        status: row.status,
        priority: row.priority,
        priorityScore: Number(row.priority_score),
        lossExposureMinor: Number(row.loss_exposure_minor),
        lossExposureCurrency: row.loss_exposure_currency,
        ownerTeam: row.owner_team,
        assignedTo: row.assigned_to,
        subjectRefs: row.subject_refs,
        slaDueAt: row.sla_due_at,
        slaBreachAt: row.sla_breach_at,
        legalHold: row.legal_hold,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        closedAt: row.closed_at,
      })),
    };
  });

  /**
   * GET /fraud/cases/:caseId
   *
   * Get a single risk case with its append-only event history. ADMIN-ONLY.
   */
  app.get(
    '/fraud/cases/:caseId',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authUser = request.authUser;
      if (!authUser) {
        return unauthorized(reply);
      }
      if (authUser.role !== 'admin') {
        return forbidden(reply);
      }

      const { caseId } = caseIdParamsSchema.parse(request.params);

      const caseResult = await db.query(
        `SELECT case_id, case_type, status, priority, priority_score,
           loss_exposure_minor, loss_exposure_currency, owner_team, assigned_to,
           subject_refs, sla_policy_ref, sla_due_at, sla_breach_at,
           linked_case_ids, legal_hold, retention_expires_at, created_at,
           updated_at, closed_at
         FROM risk_cases WHERE case_id = $1`,
        [caseId],
      );

      if (!caseResult.rowCount || caseResult.rowCount === 0) {
        return notFound(reply);
      }

      const eventsResult = await db.query(
        `SELECT event_type, actor_id, actor_type, reason_code, reason_text,
           from_status, to_status, metadata, created_at
         FROM risk_case_events
         WHERE case_id = $1
         ORDER BY created_at ASC`,
        [caseId],
      );

      const row = caseResult.rows[0];
      return {
        ok: true,
        case: {
          caseId: row.case_id,
          caseType: row.case_type,
          status: row.status,
          priority: row.priority,
          priorityScore: Number(row.priority_score),
          lossExposureMinor: Number(row.loss_exposure_minor),
          lossExposureCurrency: row.loss_exposure_currency,
          ownerTeam: row.owner_team,
          assignedTo: row.assigned_to,
          subjectRefs: row.subject_refs,
          slaPolicyRef: row.sla_policy_ref,
          slaDueAt: row.sla_due_at,
          slaBreachAt: row.sla_breach_at,
          linkedCaseIds: row.linked_case_ids,
          legalHold: row.legal_hold,
          retentionExpiresAt: row.retention_expires_at,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          closedAt: row.closed_at,
        },
        events: eventsResult.rows.map((e) => ({
          eventType: e.event_type,
          actorId: e.actor_id,
          actorType: e.actor_type,
          reasonCode: e.reason_code,
          reasonText: e.reason_text,
          fromStatus: e.from_status,
          toStatus: e.to_status,
          metadata: e.metadata,
          createdAt: e.created_at,
        })),
      };
    },
  );

  /**
   * POST /fraud/cases/:caseId/events
   *
   * Add an append-only event to a risk case (status change, assignment,
   * note, escalation, etc.). ADMIN-ONLY. The actor is the admin operator.
   */
  app.post(
    '/fraud/cases/:caseId/events',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authUser = request.authUser;
      if (!authUser) {
        return unauthorized(reply);
      }
      if (authUser.role !== 'admin') {
        return forbidden(reply);
      }

      const { caseId } = caseIdParamsSchema.parse(request.params);
      const payload = caseEventSchema.parse(request.body ?? {});

      // Verify the case exists.
      const exists = await db.query(
        `SELECT 1 FROM risk_cases WHERE case_id = $1`,
        [caseId],
      );
      if (!exists.rowCount || exists.rowCount === 0) {
        return notFound(reply);
      }

      await addCaseEvent(db, {
        caseId,
        eventType: payload.eventType,
        actorId: authUser.userId,
        actorType: 'operator',
        reasonCode: payload.reasonCode,
        reasonText: payload.reasonText,
        fromStatus: payload.fromStatus,
        toStatus: payload.toStatus,
        metadata: payload.metadata,
      });

      reply.code(201);
      return { ok: true, caseId, eventType: payload.eventType };
    },
  );

  /**
   * GET /fraud/cases/:caseId/evidence
   *
   * List evidence bindings for a case. ADMIN-ONLY. Returns references to
   * stored evidence objects (screenshots, logs, provider records) with
   * checksums — never raw PAN, bank credentials or identity documents.
   */
  app.get(
    '/fraud/cases/:caseId/evidence',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authUser = request.authUser;
      if (!authUser) {
        return unauthorized(reply);
      }
      if (authUser.role !== 'admin') {
        return forbidden(reply);
      }

      const { caseId } = caseIdParamsSchema.parse(request.params);

      const result = await db.query(
        `SELECT id, event_id, evidence_type, storage_ref, checksum_sha256,
           source, captured_at, retention_expires_at, legal_hold, metadata
         FROM risk_evidence_bindings
         WHERE case_id = $1
         ORDER BY captured_at DESC`,
        [caseId],
      );

      return {
        ok: true,
        caseId,
        evidence: result.rows.map((row) => ({
          id: row.id,
          eventId: row.event_id,
          evidenceType: row.evidence_type,
          storageRef: row.storage_ref,
          checksumSha256: row.checksum_sha256,
          source: row.source,
          capturedAt: row.captured_at,
          retentionExpiresAt: row.retention_expires_at,
          legalHold: row.legal_hold,
          metadata: row.metadata,
        })),
      };
    },
  );

  /**
   * POST /fraud/labels
   *
   * Record a confirmed outcome label for model calibration. ADMIN-ONLY.
   * Unresolved queue state is never a negative training label — only
   * confirmed outcomes are labeled.
   */
  app.post('/fraud/labels', async (request: FastifyRequest, reply: FastifyReply) => {
    const authUser = request.authUser;
    if (!authUser) {
      return unauthorized(reply);
    }
    if (authUser.role !== 'admin') {
      return forbidden(reply);
    }

    const payload = labelSchema.parse(request.body ?? {});

    await recordRiskLabel(db, {
      eventId: payload.eventId,
      decisionId: payload.decisionId,
      caseId: payload.caseId,
      label: payload.label as RiskLabel,
      labelSource: payload.labelSource,
      confidence: payload.confidence,
      reviewerId: payload.reviewerId ?? authUser.userId,
      reversalOfLabelId: payload.reversalOfLabelId,
    });

    reply.code(201);
    return { ok: true, label: payload.label, labelSource: payload.labelSource };
  });

  // -------------------------------------------------------------------------
  // Admin: risk overrides
  // -------------------------------------------------------------------------

  /**
   * GET /fraud/overrides
   *
   * List active risk overrides for a scope. ADMIN-ONLY. Expired or revoked
   * overrides are inert and not returned.
   */
  app.get(
    '/fraud/overrides',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authUser = request.authUser;
      if (!authUser) {
        return unauthorized(reply);
      }
      if (authUser.role !== 'admin') {
        return forbidden(reply);
      }

      const query = overrideListQuerySchema.parse(request.query ?? {});

      if (!query.scopeType || !query.scopeRef) {
        // No scope filter: list all active overrides.
        const result = await db.query(
          `SELECT override_id, scope_type, scope_ref, action_override, reason,
             approver_id, created_at, expires_at, usage_count, last_used_at
           FROM risk_overrides
           WHERE revoked_at IS NULL AND expires_at > NOW()
           ORDER BY expires_at ASC`,
        );
        return {
          ok: true,
          overrides: result.rows.map((row) => ({
            overrideId: row.override_id,
            scopeType: row.scope_type,
            scopeRef: row.scope_ref,
            actionOverride: row.action_override,
            reason: row.reason,
            approverId: row.approver_id,
            createdAt: row.created_at,
            expiresAt: row.expires_at,
            usageCount: row.usage_count,
            lastUsedAt: row.last_used_at,
          })),
        };
      }

      const overrides = await getActiveOverrides(
        db,
        query.scopeType,
        query.scopeRef,
      );

      return {
        ok: true,
        scopeType: query.scopeType,
        scopeRef: query.scopeRef,
        overrides: overrides.map((o) => ({
          overrideId: o.overrideId,
          actionOverride: o.actionOverride as RiskAction,
          reason: o.reason,
          expiresAt: o.expiresAt,
        })),
      };
    },
  );

  /**
   * POST /fraud/overrides
   *
   * Create a scoped, expiring risk override. ADMIN-ONLY. Never permanent —
   * every override has a reason, approver, expiry and usage tracking.
   */
  app.post(
    '/fraud/overrides',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authUser = request.authUser;
      if (!authUser) {
        return unauthorized(reply);
      }
      if (authUser.role !== 'admin') {
        return forbidden(reply);
      }

      const payload = overrideCreateSchema.parse(request.body ?? {});

      const { overrideId } = await createRiskOverride(db, {
        scopeType: payload.scopeType,
        scopeRef: payload.scopeRef,
        actionOverride: payload.actionOverride as RiskAction,
        reason: payload.reason,
        approverId: authUser.userId,
        expiresAt: payload.expiresAt,
      });

      reply.code(201);
      return { ok: true, overrideId, expiresAt: payload.expiresAt };
    },
  );

  /**
   * POST /fraud/overrides/:overrideId/revoke
   *
   * Revoke a risk override. ADMIN-ONLY. Records who revoked it and why.
   */
  app.post(
    '/fraud/overrides/:overrideId/revoke',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authUser = request.authUser;
      if (!authUser) {
        return unauthorized(reply);
      }
      if (authUser.role !== 'admin') {
        return forbidden(reply);
      }

      const { overrideId } = overrideIdParamsSchema.parse(request.params);
      const payload = overrideRevokeSchema.parse(request.body ?? {});

      await revokeRiskOverride(db, {
        overrideId,
        revokedBy: authUser.userId,
        reason: payload.reason,
      });

      return { ok: true, overrideId, revoked: true };
    },
  );

  // -------------------------------------------------------------------------
  // Admin: ML promotion governance
  // -------------------------------------------------------------------------

  /**
   * GET /fraud/ml/promotion-status
   *
   * Evaluate the ML promotion gate and return the current metrics, gate
   * result, and the most recent operator decision. ADMIN-ONLY.
   *
   * The ML model is NEVER auto-promoted. This endpoint computes the gate
   * result transparently so an operator can review the metrics before
   * recording a decision via POST /fraud/ml/promotion-decision.
   *
   * Query parameters allow overriding the default gate thresholds
   * (windowDays, minSampleSize, etc.) for what-if analysis.
   */
  app.get(
    '/fraud/ml/promotion-status',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authUser = request.authUser;
      if (!authUser) {
        return unauthorized(reply);
      }
      if (authUser.role !== 'admin') {
        return forbidden(reply);
      }

      const query = promotionStatusQuerySchema.parse(request.query ?? {});

      const gateOptions: PromotionGateOptions = {};
      if (query.windowDays !== undefined) gateOptions.windowDays = query.windowDays;
      if (query.minSampleSize !== undefined) gateOptions.minSampleSize = query.minSampleSize;
      if (query.minAgreementRate !== undefined) gateOptions.minAgreementRate = query.minAgreementRate;
      if (query.maxFalseNegativeRate !== undefined) gateOptions.maxFalseNegativeRate = query.maxFalseNegativeRate;
      if (query.maxFalsePositiveRate !== undefined) gateOptions.maxFalsePositiveRate = query.maxFalsePositiveRate;
      if (query.minPrecision !== undefined) gateOptions.minPrecision = query.minPrecision;
      if (query.minRecall !== undefined) gateOptions.minRecall = query.minRecall;
      if (query.maxCalibrationError !== undefined) gateOptions.maxCalibrationError = query.maxCalibrationError;

      const gateResult = await evaluatePromotionGate(db, gateOptions);
      const latestDecision = await getLatestPromotionDecision(db);

      return {
        ok: true,
        gateResult,
        latestDecision: latestDecision
          ? {
              id: latestDecision.id,
              decision: latestDecision.decision,
              operatorId: latestDecision.operatorId,
              justification: latestDecision.justification,
              createdAt: latestDecision.createdAt,
              metrics: latestDecision.metrics,
            }
          : null,
      };
    },
  );

  /**
   * POST /fraud/ml/promotion-decision
   *
   * Record a promotion decision in the immutable audit trail. ADMIN-ONLY.
   *
   * The operator provides the decision (promote/hold/reject) and a
   * justification. The metrics and gate result from the most recent
   * GET /fraud/ml/promotion-status call are included as a snapshot so the
   * decision can be reconstructed exactly as it was at evaluation time.
   *
   * The ML model is only promoted when an operator explicitly chooses
   * 'promote'. This is the ONLY path to promotion — there is no
   * auto-promotion.
   */
  app.post(
    '/fraud/ml/promotion-decision',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authUser = request.authUser;
      if (!authUser) {
        return unauthorized(reply);
      }
      if (authUser.role !== 'admin') {
        return forbidden(reply);
      }

      const payload = promotionDecisionSchema.parse(request.body ?? {});

      const { decisionId, createdAt } = await recordPromotionDecision(db, {
        metrics: payload.metrics,
        gateResult: payload.gateResult,
        decision: payload.decision as PromotionDecision,
        operatorId: authUser.userId,
        justification: payload.justification,
      });

      reply.code(201);
      return {
        ok: true,
        decisionId,
        decision: payload.decision,
        createdAt,
      };
    },
  );
};
