import crypto from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { db } from '../db/pool.js';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';
import {
  resolveWorkforceToken,
  type WorkforceToken,
} from '../lib/workforceAuth.js';
import {
  authorize,
  recordAuthzDecision,
  type PolicyContext,
  type PolicyDecision,
} from '../lib/opsPolicy.js';
import {
  proposeCommand,
  approveCommand,
  cancelCommand,
  getCommand,
  listCommands,
  type CommandState,
} from '../lib/commandService.js';
import {
  createCase,
  transitionCaseState,
  assignCase,
  addEvidence,
  addNote,
  linkEntity,
  getCase,
  listCases,
  type CaseState,
} from '../lib/caseService.js';
import {
  queryAuditEvents,
  verifyAuditChain,
  logAuditAccess,
  writeAuditEvent,
  type AuditQueryFilters,
} from '../lib/immutableAudit.js';
import {
  getCaseQueue as getSafetyCaseQueue,
  getCaseWithEvidence as getSafetyCaseWithEvidence,
  recordDecision as recordSafetyDecision,
  createAppeal,
  decideAppeal,
  exportStatementsOfReasons,
  type SafetyCaseStatus,
  type SafetySlaClass,
} from '../lib/safetyCaseService.js';
import {
  exportForDsaDatabase,
  markSubmittedToDsaDb,
  generateTransparencyReport,
} from '../lib/dsaExport.js';
import {
  listRiskAssessments,
  getMissingOffences,
  isReviewOverdue,
  createRiskAssessmentRecord,
  OFCOM_PRIORITY_OFFENCES,
} from '../lib/ofcomRiskAssessment.js';

// ── Ops Console Route Registry ──────────────────────────────────────────
//
// NCSC ZTNA (May 2026): every request is explicitly authorised based on
// defined policy and contextual information. No implicit trust.
//
// NIST SP 800-63B-4 (July 2025 final): consumer JWTs are cryptographically
// rejected — workforce tokens use a separate audience ("thryftverse-ops").
//
// Deny-by-default: every route declares its required permission. The
// middleware checks the workforce token, resolves permissions, and
// evaluates policy before the handler runs.

type OpsRouteDependencies = {
  app: FastifyInstance;
};

// ── Workforce auth middleware ────────────────────────────────────────────
//
// Extracts and verifies the workforce JWT from the Authorization header.
// Consumer tokens (audience "thryftverse-app") are rejected by the
// jose verifier because the audience doesn't match "thryftverse-ops".

async function resolveOpsPrincipal(request: FastifyRequest): Promise<WorkforceToken | null> {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.slice(7);
  return resolveWorkforceToken(token);
}

// ── Permission guard ────────────────────────────────────────────────────
//
// Returns the resolved workforce token + policy decision, or sends an
// error response. Every ops route uses this guard.

async function requireOpsPermission(
  request: FastifyRequest,
  reply: FastifyReply,
  action: string,
  options?: {
    resourceType?: string;
    resourceId?: string;
    amountGbp?: number;
    caseId?: string;
    reasonCode?: string;
    incidentMode?: boolean;
  },
): Promise<{ token: WorkforceToken; decision: PolicyDecision } | null> {
  const token = await resolveOpsPrincipal(request);
  if (!token) {
    reply.code(401);
    reply.send({ ok: false, error: 'Unauthorized: valid workforce token required' });
    return null;
  }

  // Check for active break-glass session to propagate incident mode
  let incidentMode = options?.incidentMode ?? false;
  if (!incidentMode) {
    const bgResult = await db.query(
      `SELECT 1 FROM breakglass_sessions
       WHERE principal_id = $1 AND expires_at > NOW() AND reviewed_at IS NULL
       LIMIT 1`,
      [token.principal.id],
    );
    if (bgResult.rows.length > 0) {
      incidentMode = true;
    }
  }

  const ctx: PolicyContext = {
    principal: token.principal,
    session: token.session,
    permissions: token.permissions,
    grants: token.grants,
    action,
    resourceType: options?.resourceType,
    resourceId: options?.resourceId,
    legalEntity: token.principal.legalEntity,
    amountGbp: options?.amountGbp,
    caseId: options?.caseId,
    reasonCode: options?.reasonCode,
    incidentMode,
  };

  const decision = await authorize(db, ctx);

  // Record the authorization decision (for monitoring/anomaly detection)
  await recordAuthzDecision(db, decision, ctx);

  if (decision.decision === 'deny') {
    // 423 Locked signals that step-up authentication is required to proceed.
    // 403 Forbidden signals a permanent denial (insufficient permission).
    const statusCode = decision.requiresStepUp ? 423 : 403;
    reply.code(statusCode);
    reply.send({
      ok: false,
      error: decision.reason,
      requiresStepUp: decision.requiresStepUp,
      riskTier: decision.riskTier,
    });
    return null;
  }

  return { token, decision };
}

// ── Route registration ──────────────────────────────────────────────────

export const registerOpsConsoleRoutes = ({ app }: OpsRouteDependencies) => {
  // Database access uses the module-level singleton `db` from '../db/pool.js'.
  // This is consistent with other route modules in the codebase.
  if (!config.opsConsoleEnabled) {
    logger.info('[ops-console] Ops console routes disabled by OPS_CONSOLE_ENABLED config');
    return;
  }

  // ── Health / auth check ──────────────────────────────────────────────

  app.get('/ops/v1/me/effective-permissions', async (request, reply) => {
    const token = await resolveOpsPrincipal(request);
    if (!token) {
      reply.code(401);
      return { ok: false, error: 'Unauthorized' };
    }

    return {
      ok: true,
      principal: {
        id: token.principal.id,
        displayName: token.principal.displayName,
        email: token.principal.email,
        team: token.principal.team,
        region: token.principal.region,
        legalEntity: token.principal.legalEntity,
        authAssuranceLevel: token.principal.authAssuranceLevel,
      },
      session: {
        id: token.session.id,
        authAssurance: token.session.authAssurance,
        stepUpAt: token.session.stepUpAt,
        stepUpReason: token.session.stepUpReason,
        idleExpiresAt: token.session.idleExpiresAt,
        absoluteExpiresAt: token.session.absoluteExpiresAt,
      },
      permissions: token.permissions,
      grants: token.grants.map((g) => ({
        permission: g.permission,
        scope: g.scope,
        expiresAt: g.expiresAt,
      })),
    };
  });

  // ── Work queue: list cases ───────────────────────────────────────────

  app.get('/ops/v1/work-queues/:queueId/cases', async (request, reply) => {
    const guard = await requireOpsPermission(request, reply, 'cases.read');
    if (!guard) return null;

    const { queueId } = request.params as { queueId: string };
    const querySchema = z.object({
      status: z.string().optional(),
      team: z.string().optional(),
      type: z.string().optional(),
      minPriority: z.coerce.number().optional(),
      slaBreached: z.coerce.boolean().optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50),
      offset: z.coerce.number().int().min(0).default(0),
    });

    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      reply.code(400);
      return { ok: false, error: 'Invalid query', details: parsed.error.flatten() };
    }

    const statuses = parsed.data.status
      ? (parsed.data.status.split(',') as CaseState[])
      : undefined;

    // queueId determines the filter context:
    // 'my' = assigned to me, 'team' = my team, 'all' = all (permission-gated)
    const ownerId = queueId === 'my' ? guard.token.principal.id : undefined;
    const team = queueId === 'team' ? guard.token.principal.team : parsed.data.team;

    const result = await listCases(db, {
      status: statuses,
      ownerId,
      team,
      type: parsed.data.type,
      minPriority: parsed.data.minPriority,
      slaBreached: parsed.data.slaBreached,
      limit: parsed.data.limit,
      offset: parsed.data.offset,
    });

    return {
      ok: true,
      queueId,
      cases: result.cases,
      total: result.total,
      limit: parsed.data.limit,
      offset: parsed.data.offset,
    };
  });

  // ── Create a case ────────────────────────────────────────────────────

  app.post('/ops/v1/cases', async (request, reply) => {
    const guard = await requireOpsPermission(request, reply, 'cases.create');
    if (!guard) return null;

    const bodySchema = z.object({
      type: z.string().min(2).max(80),
      subject: z.string().min(2).max(240),
      description: z.string().max(2000).optional(),
      severity: z.enum(['normal', 'elevated', 'high', 'critical']).default('normal'),
      consumerHarmScore: z.number().int().min(0).max(10).default(0),
      financialValueGbp: z.number().min(0).default(0),
      source: z.string().max(80).optional(),
      sourceRef: z.string().max(255).optional(),
      isVulnerableCustomer: z.boolean().default(false),
    });

    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { ok: false, error: 'Invalid body', details: parsed.error.flatten() };
    }

    const caseRecord = await createCase(db, {
      ...parsed.data,
      principal: guard.token.principal,
      session: guard.token.session,
    });

    return { ok: true, case: caseRecord };
  });

  // ── Get a case ───────────────────────────────────────────────────────

  app.get('/ops/v1/cases/:caseId', async (request, reply) => {
    const { caseId } = request.params as { caseId: string };
    const guard = await requireOpsPermission(request, reply, 'cases.read', { caseId });
    if (!guard) return null;

    const caseRecord = await getCase(db, caseId);
    if (!caseRecord) {
      reply.code(404);
      return { ok: false, error: 'Case not found' };
    }

    return { ok: true, case: caseRecord };
  });

  // ── Assign a case ────────────────────────────────────────────────────

  app.post('/ops/v1/cases/:caseId/assign', async (request, reply) => {
    const { caseId } = request.params as { caseId: string };
    const guard = await requireOpsPermission(request, reply, 'cases.assign', { caseId });
    if (!guard) return null;

    const bodySchema = z.object({
      assigneeId: z.string().min(2).max(120),
      team: z.string().max(120).optional(),
    });
    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { ok: false, error: 'Invalid body', details: parsed.error.flatten() };
    }

    const caseRecord = await assignCase(db, {
      caseId,
      assigneeId: parsed.data.assigneeId,
      team: parsed.data.team,
      principal: guard.token.principal,
      session: guard.token.session,
    });

    return { ok: true, case: caseRecord };
  });

  // ── Transition case state ────────────────────────────────────────────

  app.post('/ops/v1/cases/:caseId/transition', async (request, reply) => {
    const { caseId } = request.params as { caseId: string };
    const guard = await requireOpsPermission(request, reply, 'cases.decide', { caseId });
    if (!guard) return null;

    const bodySchema = z.object({
      toStatus: z.enum([
        'new', 'triaged', 'assigned', 'investigating',
        'awaiting_customer', 'awaiting_provider', 'awaiting_internal',
        'ready_for_decision', 'resolved', 'closed', 'escalated',
      ]),
      reason: z.string().max(240).optional(),
    });
    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { ok: false, error: 'Invalid body', details: parsed.error.flatten() };
    }

    const caseRecord = await transitionCaseState(db, {
      caseId,
      toStatus: parsed.data.toStatus as CaseState,
      reason: parsed.data.reason,
      principal: guard.token.principal,
      session: guard.token.session,
    });

    return { ok: true, case: caseRecord };
  });

  // ── Add evidence to a case ───────────────────────────────────────────

  app.post('/ops/v1/cases/:caseId/evidence', async (request, reply) => {
    const { caseId } = request.params as { caseId: string };
    const guard = await requireOpsPermission(request, reply, 'cases.read', { caseId });
    if (!guard) return null;

    const bodySchema = z.object({
      source: z.string().min(2).max(80),
      sourceRef: z.string().max(255).optional(),
      objectRef: z.string().min(2).max(500),
      objectHash: z.string().max(64).optional(),
      objectType: z.string().max(80).optional(),
      sensitivity: z.enum(['standard', 'sensitive', 'restricted']).default('standard'),
      metadata: z.record(z.unknown()).optional(),
    });
    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { ok: false, error: 'Invalid body', details: parsed.error.flatten() };
    }

    await addEvidence(db, {
      caseId,
      ...parsed.data,
      principal: guard.token.principal,
    });

    return { ok: true };
  });

  // ── Add a note to a case ─────────────────────────────────────────────

  app.post('/ops/v1/cases/:caseId/notes', async (request, reply) => {
    const { caseId } = request.params as { caseId: string };
    const guard = await requireOpsPermission(request, reply, 'cases.read', { caseId });
    if (!guard) return null;

    const bodySchema = z.object({
      body: z.string().min(1).max(5000),
      isInternal: z.boolean().default(true),
      correctsNoteId: z.string().optional(),
    });
    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { ok: false, error: 'Invalid body', details: parsed.error.flatten() };
    }

    await addNote(db, {
      caseId,
      ...parsed.data,
      principal: guard.token.principal,
    });

    return { ok: true };
  });

  // ── Link an entity to a case ─────────────────────────────────────────

  app.post('/ops/v1/cases/:caseId/entities', async (request, reply) => {
    const { caseId } = request.params as { caseId: string };
    const guard = await requireOpsPermission(request, reply, 'cases.read', { caseId });
    if (!guard) return null;

    const bodySchema = z.object({
      entityType: z.string().min(2).max(80),
      entityId: z.string().min(2).max(255),
      relationship: z.string().max(80).default('subject'),
    });
    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { ok: false, error: 'Invalid body', details: parsed.error.flatten() };
    }

    await linkEntity(db, {
      caseId,
      ...parsed.data,
      principal: guard.token.principal,
    });

    return { ok: true };
  });

  // ── Propose a privileged command ─────────────────────────────────────
  //
  // High-impact commands return 202 with command status, not fabricated
  // synchronous success. Required headers: Idempotency-Key.

  app.post('/ops/v1/commands', async (request, reply) => {
    const bodySchema = z.object({
      commandType: z.string().min(2).max(120),
      resourceType: z.string().min(2).max(80),
      resourceId: z.string().min(2).max(255),
      expectedResourceVersion: z.string().max(255).optional(),
      idempotencyKey: z.string().min(2).max(255),
      payload: z.record(z.unknown()),
      caseId: z.string().optional(),
      reasonCode: z.string().min(2).max(120),
      freeformNote: z.string().max(2000).optional(),
      beforeSnapshot: z.unknown().optional(),
      effectPreview: z.record(z.unknown()).optional(),
      amountGbp: z.number().min(0).optional(),
      currency: z.string().max(8).default('GBP'),
      destinationFingerprint: z.string().max(64).optional(),
    });

    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { ok: false, error: 'Invalid body', details: parsed.error.flatten() };
    }

    // Determine the required permission based on command type
    const commandPermission = mapCommandTypeToPermission(parsed.data.commandType);
    if (!commandPermission) {
      reply.code(400);
      return { ok: false, error: `Unknown command type: ${parsed.data.commandType}` };
    }

    const guard = await requireOpsPermission(request, reply, commandPermission, {
      resourceType: parsed.data.resourceType,
      resourceId: parsed.data.resourceId,
      amountGbp: parsed.data.amountGbp,
      caseId: parsed.data.caseId,
      reasonCode: parsed.data.reasonCode,
    });
    if (!guard) return null;

    try {
      const { command, created } = await proposeCommand(db, {
        commandType: parsed.data.commandType,
        resourceType: parsed.data.resourceType,
        resourceId: parsed.data.resourceId,
        expectedResourceVersion: parsed.data.expectedResourceVersion,
        idempotencyKey: parsed.data.idempotencyKey,
        payload: parsed.data.payload,
        proposer: guard.token.principal,
        session: guard.token.session,
        caseId: parsed.data.caseId,
        reasonCode: parsed.data.reasonCode,
        freeformNote: parsed.data.freeformNote,
        beforeSnapshot: parsed.data.beforeSnapshot,
        effectPreview: parsed.data.effectPreview,
        riskTier: guard.decision.riskTier,
        amountGbp: parsed.data.amountGbp,
        currency: parsed.data.currency,
        destinationFingerprint: parsed.data.destinationFingerprint,
        requiredApprovalPolicy: guard.decision.requiresApproval ? 'standard' : undefined,
        requiresApproval: guard.decision.requiresApproval,
      });

      // 202 Accepted for commands that need processing
      reply.code(created ? 202 : 200);
      return {
        ok: true,
        command,
        created,
      };
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes('Separation of duty')) {
        reply.code(403);
        return { ok: false, error: message };
      }
      reply.code(500);
      return { ok: false, error: 'Failed to propose command' };
    }
  });

  // ── Get command status ───────────────────────────────────────────────
  //
  // Lost HTTP response is checked by command ID.

  app.get('/ops/v1/commands/:commandId', async (request, reply) => {
    const { commandId } = request.params as { commandId: string };
    const guard = await requireOpsPermission(request, reply, 'cases.read');
    if (!guard) return null;

    const command = await getCommand(db, commandId);
    if (!command) {
      reply.code(404);
      return { ok: false, error: 'Command not found' };
    }

    return { ok: true, command };
  });

  // ── Approve / reject a command ───────────────────────────────────────

  app.post('/ops/v1/commands/:commandId/approve', async (request, reply) => {
    const { commandId } = request.params as { commandId: string };

    // First load the command to determine what permission is needed
    const command = await getCommand(db, commandId);
    if (!command) {
      reply.code(404);
      return { ok: false, error: 'Command not found' };
    }

    const approvePermission = mapCommandTypeToApprovalPermission(command.commandType);
    if (!approvePermission) {
      reply.code(400);
      return { ok: false, error: `Cannot determine approval permission for ${command.commandType}` };
    }

    const guard = await requireOpsPermission(request, reply, approvePermission, {
      resourceType: command.resourceType,
      resourceId: command.resourceId,
      amountGbp: command.amountGbp ?? undefined,
      caseId: command.caseId ?? undefined,
    });
    if (!guard) return null;

    const bodySchema = z.object({
      decision: z.enum(['approve', 'reject']),
      decisionReason: z.string().max(240).optional(),
    });
    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { ok: false, error: 'Invalid body', details: parsed.error.flatten() };
    }

    // Determine approval role from the principal's team
    const approvalRole = guard.token.principal.team;

    try {
      const updated = await approveCommand(db, {
        commandId,
        approver: guard.token.principal,
        session: guard.token.session,
        approvalRole,
        decision: parsed.data.decision,
        decisionReason: parsed.data.decisionReason,
        requiresSeparationOfDuty: guard.decision.requiresSeparationOfDuty,
      });

      return { ok: true, command: updated };
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes('Separation of duty')) {
        reply.code(403);
        return { ok: false, error: message };
      }
      if (message.includes('not found') || message.includes('not awaiting')) {
        reply.code(409);
        return { ok: false, error: message };
      }
      reply.code(500);
      return { ok: false, error: 'Failed to approve command' };
    }
  });

  // ── Cancel a command ─────────────────────────────────────────────────

  app.post('/ops/v1/commands/:commandId/cancel', async (request, reply) => {
    const { commandId } = request.params as { commandId: string };
    const command = await getCommand(db, commandId);
    if (!command) {
      reply.code(404);
      return { ok: false, error: 'Command not found' };
    }

    // Proposer can cancel their own command, or someone with the permission
    const guard = await requireOpsPermission(request, reply,
      mapCommandTypeToPermission(command.commandType) ?? 'cases.read',
      { resourceType: command.resourceType, resourceId: command.resourceId }
    );
    if (!guard) return null;

    const bodySchema = z.object({ reason: z.string().min(2).max(240) });
    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { ok: false, error: 'Invalid body', details: parsed.error.flatten() };
    }

    const updated = await cancelCommand(db, {
      commandId,
      principal: guard.token.principal,
      session: guard.token.session,
      reason: parsed.data.reason,
    });

    return { ok: true, command: updated };
  });

  // ── List commands ────────────────────────────────────────────────────

  app.get('/ops/v1/commands', async (request, reply) => {
    const guard = await requireOpsPermission(request, reply, 'cases.read');
    if (!guard) return null;

    const querySchema = z.object({
      state: z.string().optional(),
      commandType: z.string().optional(),
      caseId: z.string().optional(),
      proposerId: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50),
      offset: z.coerce.number().int().min(0).default(0),
    });
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      reply.code(400);
      return { ok: false, error: 'Invalid query', details: parsed.error.flatten() };
    }

    const result = await listCommands(db, {
      state: parsed.data.state as CommandState | undefined,
      commandType: parsed.data.commandType,
      caseId: parsed.data.caseId,
      proposerId: parsed.data.proposerId,
      limit: parsed.data.limit,
      offset: parsed.data.offset,
    });

    return {
      ok: true,
      commands: result.commands,
      total: result.total,
      limit: parsed.data.limit,
      offset: parsed.data.offset,
    };
  });

  // ── Reveal PII (field-level, reason-bound, auto-remask) ──────────────

  app.post('/ops/v1/resources/:type/:id/reveal', async (request, reply) => {
    const { type, id } = request.params as { type: string; id: string };
    const guard = await requireOpsPermission(request, reply, 'customer.pii.reveal', {
      resourceType: type,
      resourceId: id,
    });
    if (!guard) return null;

    const bodySchema = z.object({
      fieldName: z.string().min(2).max(80),
      caseId: z.string().optional(),
      purpose: z.string().min(2).max(120),
    });
    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { ok: false, error: 'Invalid body', details: parsed.error.flatten() };
    }

    // Record the reveal in the PII reveal log
    const revealId = crypto.randomUUID();
    const remaskAt = new Date(Date.now() + config.opsPiiRevealTtlSeconds * 1000).toISOString();

    await db.query(
      `INSERT INTO pii_reveal_log (id, principal_id, session_id, case_id, entity_type, entity_id, field_name, purpose, auto_remask_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        revealId,
        guard.token.principal.id,
        guard.token.session.id,
        parsed.data.caseId ?? null,
        type,
        id,
        parsed.data.fieldName,
        parsed.data.purpose,
        remaskAt,
      ],
    );

    // Audit the reveal
    await writeAuditEvent(db, {
      principalType: 'workforce',
      principalId: guard.token.principal.id,
      workforceSessionId: guard.token.session.id,
      action: 'customer.pii.reveal',
      resourceType: type,
      resourceId: id,
      caseId: parsed.data.caseId,
      purpose: parsed.data.purpose,
      outcome: 'success',
      retentionClass: 'high_impact',
    });

    return {
      ok: true,
      revealId,
      autoRemaskAt: remaskAt,
      // The actual data fetch is handled by domain-specific routes.
      // This endpoint authorizes and logs the reveal intent.
    };
  });

  // ── Audit events query (access is itself audited) ───────────────────

  app.get('/ops/v1/audit-events', async (request, reply) => {
    const guard = await requireOpsPermission(request, reply, 'audit.read');
    if (!guard) return null;

    const querySchema = z.object({
      principalId: z.string().optional(),
      action: z.string().optional(),
      resourceType: z.string().optional(),
      resourceId: z.string().optional(),
      caseId: z.string().optional(),
      commandId: z.string().optional(),
      startDate: z.string().datetime().optional(),
      endDate: z.string().datetime().optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50),
      offset: z.coerce.number().int().min(0).default(0),
    });
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      reply.code(400);
      return { ok: false, error: 'Invalid query', details: parsed.error.flatten() };
    }

    const filters: AuditQueryFilters = {
      principalId: parsed.data.principalId,
      action: parsed.data.action,
      resourceType: parsed.data.resourceType,
      resourceId: parsed.data.resourceId,
      caseId: parsed.data.caseId,
      commandId: parsed.data.commandId,
      startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : undefined,
      endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : undefined,
      limit: parsed.data.limit,
      offset: parsed.data.offset,
    };

    const result = await queryAuditEvents(db, filters);

    // Log the audit access (access to audit is itself audited)
    await logAuditAccess(db, {
      accessorId: guard.token.principal.id,
      queryParams: request.query as Record<string, unknown>,
      resultCount: result.total,
      reasonCode: 'audit.investigation',
    });

    return {
      ok: true,
      events: result.events,
      total: result.total,
      limit: parsed.data.limit,
      offset: parsed.data.offset,
    };
  });

  // ── Audit chain verification ─────────────────────────────────────────

  app.get('/ops/v1/audit-chain/verify', async (request, reply) => {
    const guard = await requireOpsPermission(request, reply, 'audit.read');
    if (!guard) return null;

    const querySchema = z.object({
      fromSequence: z.coerce.number().int().min(1).optional(),
      toSequence: z.coerce.number().int().min(1).optional(),
    });
    const parsed = querySchema.safeParse(request.query);

    const verification = await verifyAuditChain(db, {
      fromSequence: parsed.data?.fromSequence,
      toSequence: parsed.data?.toSequence,
    });

    return { ok: true, ...verification };
  });

  // ── Break-glass session ──────────────────────────────────────────────

  app.post('/ops/v1/breakglass-sessions', async (request, reply) => {
    const guard = await requireOpsPermission(request, reply, 'incident.breakglass');
    if (!guard) return null;

    const bodySchema = z.object({
      reason: z.string().min(10).max(1000),
      permissions: z.array(z.string()).min(1),
      scope: z.record(z.unknown()).default({}),
      durationMinutes: z.number().int().min(5).max(120).default(30),
    });
    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { ok: false, error: 'Invalid body', details: parsed.error.flatten() };
    }

    const id = `bg_${crypto.randomUUID()}`;
    const expiresAt = new Date(Date.now() + parsed.data.durationMinutes * 60 * 1000).toISOString();
    const reviewRequiredBy = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // next business day

    await db.query(
      `INSERT INTO breakglass_sessions (id, principal_id, incident_commander, reason, permissions, scope, expires_at, review_required_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id,
        guard.token.principal.id,
        guard.token.principal.id,
        parsed.data.reason,
        JSON.stringify(parsed.data.permissions),
        JSON.stringify(parsed.data.scope),
        expiresAt,
        reviewRequiredBy,
      ],
    );

    await writeAuditEvent(db, {
      principalType: 'workforce',
      principalId: guard.token.principal.id,
      workforceSessionId: guard.token.session.id,
      action: 'incident.breakglass',
      resourceType: 'breakglass_session',
      resourceId: id,
      reason: parsed.data.reason,
      outcome: 'success',
      retentionClass: 'high_impact',
    });

    reply.code(201);
    return {
      ok: true,
      breakglassSession: {
        id,
        expiresAt,
        reviewRequiredBy,
        permissions: parsed.data.permissions,
      },
    };
  });

  // ── Case evidence ────────────────────────────────────────────────────
  app.get('/ops/v1/cases/:caseId/evidence', async (request, reply) => {
    const { caseId } = request.params as { caseId: string };
    const guard = await requireOpsPermission(request, reply, 'cases.read', { caseId });
    if (!guard) return null;
    const result = await db.query(
      `SELECT id, case_id, source, source_ref, object_ref, object_hash, object_type, sensitivity, is_legal_hold, metadata, added_by, created_at
       FROM ops_evidence WHERE case_id = $1 ORDER BY created_at DESC`,
      [caseId],
    );
    return { ok: true, evidence: result.rows };
  });

  // ── Case decisions ───────────────────────────────────────────────────
  app.get('/ops/v1/cases/:caseId/decisions', async (request, reply) => {
    const { caseId } = request.params as { caseId: string };
    const guard = await requireOpsPermission(request, reply, 'cases.read', { caseId });
    if (!guard) return null;
    const result = await db.query(
      `SELECT id, case_id, decision_type, outcome, reason_code, explanation, policy_id, policy_version, decision_maker, is_automated, created_at
       FROM ops_decisions WHERE case_id = $1 ORDER BY created_at DESC`,
      [caseId],
    );
    return { ok: true, decisions: result.rows };
  });

  app.post('/ops/v1/cases/:caseId/decisions', async (request, reply) => {
    const { caseId } = request.params as { caseId: string };
    const guard = await requireOpsPermission(request, reply, 'cases.decide', { caseId });
    if (!guard) return null;
    const bodySchema = z.object({
      decisionType: z.string().min(2).max(80),
      outcome: z.string().min(2).max(80),
      reasonCode: z.string().min(2).max(120),
      explanation: z.string().max(2000).optional(),
      policyId: z.string().max(80).optional(),
      policyVersion: z.string().max(40).optional(),
      isAutomated: z.boolean().default(false),
    });
    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { ok: false, error: 'Invalid body', details: parsed.error.flatten() };
    }
    const id = `dec_${crypto.randomUUID()}`;
    await db.query(
      `INSERT INTO ops_decisions (id, case_id, decision_type, outcome, reason_code, explanation, policy_id, policy_version, decision_maker, is_automated)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [id, caseId, parsed.data.decisionType, parsed.data.outcome, parsed.data.reasonCode,
       parsed.data.explanation ?? null, parsed.data.policyId ?? null, parsed.data.policyVersion ?? null,
       guard.token.principal.id, parsed.data.isAutomated],
    );
    await writeAuditEvent(db, {
      principalType: 'workforce', principalId: guard.token.principal.id,
      workforceSessionId: guard.token.session.id, action: 'case.decision',
      resourceType: 'ops_case', resourceId: caseId, caseId,
      reason: parsed.data.decisionType, outcome: 'success', retentionClass: 'high_impact',
    });
    return { ok: true, decision: { id, caseId, ...parsed.data, decisionMaker: guard.token.principal.id, createdAt: new Date().toISOString() } };
  });

  // ── Case communications ──────────────────────────────────────────────
  app.get('/ops/v1/cases/:caseId/communications', async (request, reply) => {
    const { caseId } = request.params as { caseId: string };
    const guard = await requireOpsPermission(request, reply, 'cases.read', { caseId });
    if (!guard) return null;
    const result = await db.query(
      `SELECT id, case_id, channel, direction, template_id, delivery_status, delivered_at, sent_by, created_at
       FROM ops_communications WHERE case_id = $1 ORDER BY created_at DESC`,
      [caseId],
    );
    return { ok: true, communications: result.rows };
  });

  // ── Linked cases ─────────────────────────────────────────────────────
  app.get('/ops/v1/cases/:caseId/linked-cases', async (request, reply) => {
    const { caseId } = request.params as { caseId: string };
    const guard = await requireOpsPermission(request, reply, 'cases.read', { caseId });
    if (!guard) return null;
    const result = await db.query(
      `SELECT * FROM ops_cases WHERE id = $1 AND duplicate_of_case_id IS NOT NULL
       UNION
       SELECT c.* FROM ops_cases c WHERE c.duplicate_of_case_id = $1`,
      [caseId],
    );
    return { ok: true, cases: result.rows };
  });

  // ── SLA controls ─────────────────────────────────────────────────────
  app.post('/ops/v1/cases/:caseId/sla/pause', async (request, reply) => {
    const { caseId } = request.params as { caseId: string };
    const guard = await requireOpsPermission(request, reply, 'cases.decide', { caseId });
    if (!guard) return null;
    const bodySchema = z.object({ reason: z.string().min(2).max(240) });
    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) { reply.code(400); return { ok: false, error: 'Invalid body', details: parsed.error.flatten() }; }
    await db.query(
      `UPDATE ops_cases SET sla_paused_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [caseId],
    );
    await writeAuditEvent(db, {
      principalType: 'workforce', principalId: guard.token.principal.id,
      workforceSessionId: guard.token.session.id, action: 'case.sla.pause',
      resourceType: 'ops_case', resourceId: caseId, caseId,
      reason: parsed.data.reason, outcome: 'success', retentionClass: 'standard',
    });
    const caseRow = await db.query('SELECT * FROM ops_cases WHERE id = $1', [caseId]);
    return { ok: true, case: caseRow.rows[0] };
  });

  app.post('/ops/v1/cases/:caseId/sla/resume', async (request, reply) => {
    const { caseId } = request.params as { caseId: string };
    const guard = await requireOpsPermission(request, reply, 'cases.decide', { caseId });
    if (!guard) return null;
    await db.query(
      `UPDATE ops_cases
       SET sla_total_paused_ms = sla_total_paused_ms + EXTRACT(EPOCH FROM (NOW() - sla_paused_at)) * 1000,
           sla_paused_at = NULL, updated_at = NOW()
       WHERE id = $1 AND sla_paused_at IS NOT NULL`,
      [caseId],
    );
    await writeAuditEvent(db, {
      principalType: 'workforce', principalId: guard.token.principal.id,
      workforceSessionId: guard.token.session.id, action: 'case.sla.resume',
      resourceType: 'ops_case', resourceId: caseId, caseId,
      outcome: 'success', retentionClass: 'standard',
    });
    const caseRow = await db.query('SELECT * FROM ops_cases WHERE id = $1', [caseId]);
    return { ok: true, case: caseRow.rows[0] };
  });

  // ── Safety case queue (priority tuple ordering) ──────────────────────
  app.get('/ops/v1/safety/cases', async (request, reply) => {
    const guard = await requireOpsPermission(request, reply, 'cases.read');
    if (!guard) return null;
    const querySchema = z.object({
      status: z.string().optional(),
      severity: z.coerce.number().optional(),
      slaClass: z.string().optional(),
      involvesMinor: z.coerce.boolean().optional(),
      team: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50),
      offset: z.coerce.number().int().min(0).default(0),
    });
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) { reply.code(400); return { ok: false, error: 'Invalid query', details: parsed.error.flatten() }; }
    const result = await getSafetyCaseQueue(db, {
      status: parsed.data.status?.split(',') as SafetyCaseStatus[] | undefined,
      severity: parsed.data.severity,
      sla_class: parsed.data.slaClass as SafetySlaClass | undefined,
      involves_minor: parsed.data.involvesMinor,
      team: parsed.data.team,
      limit: parsed.data.limit,
      offset: parsed.data.offset,
    });
    return { ok: true, cases: result.cases, total: result.total };
  });

  // ── Safety case with evidence ────────────────────────────────────────
  app.get('/ops/v1/safety/cases/:caseId', async (request, reply) => {
    const { caseId } = request.params as { caseId: string };
    const guard = await requireOpsPermission(request, reply, 'cases.read', { caseId });
    if (!guard) return null;
    const result = await getSafetyCaseWithEvidence(db, caseId);
    if (!result) { reply.code(404); return { ok: false, error: 'Safety case not found' }; }
    return { ok: true, ...result };
  });

  // ── Appeals ──────────────────────────────────────────────────────────
  app.get('/ops/v1/safety/appeals', async (request, reply) => {
    const guard = await requireOpsPermission(request, reply, 'cases.read');
    if (!guard) return null;
    const querySchema = z.object({
      status: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50),
      offset: z.coerce.number().int().min(0).default(0),
    });
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) { reply.code(400); return { ok: false, error: 'Invalid query', details: parsed.error.flatten() }; }
    const status = parsed.data.status?.split(',');
    const itemsResult = await db.query(
      `SELECT * FROM safety_appeals ${status ? 'WHERE status = ANY($1)' : ''} ORDER BY deadline ASC LIMIT $${status ? '2' : '1'} OFFSET $${status ? '3' : '2'}`,
      status ? [status, parsed.data.limit, parsed.data.offset] : [parsed.data.limit, parsed.data.offset],
    );
    const countResult = await db.query(
      `SELECT COUNT(*)::TEXT AS count FROM safety_appeals ${status ? 'WHERE status = ANY($1)' : ''}`,
      status ? [status] : [],
    );
    return { ok: true, appeals: itemsResult.rows, total: parseInt(countResult.rows[0]?.count ?? '0', 10) };
  });

  app.post('/ops/v1/safety/appeals/:appealId/decide', async (request, reply) => {
    const { appealId } = request.params as { appealId: string };
    const guard = await requireOpsPermission(request, reply, 'cases.decide');
    if (!guard) return null;
    const bodySchema = z.object({
      status: z.enum(['upheld', 'overturned', 'withdrawn']),
      outcomeReason: z.string().min(2).max(2000),
      remedy: z.string().max(2000).optional(),
    });
    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) { reply.code(400); return { ok: false, error: 'Invalid body', details: parsed.error.flatten() }; }
    const result = await decideAppeal(db, appealId, {
      independent_reviewer_id: guard.token.principal.id,
      status: parsed.data.status,
      outcome_reason: parsed.data.outcomeReason,
      remedy: parsed.data.remedy,
      principal: guard.token.principal,
      session: guard.token.session,
    });
    return { ok: true, appeal: result };
  });

  // ── Statements of reasons ────────────────────────────────────────────
  app.get('/ops/v1/safety/statements-of-reasons', async (request, reply) => {
    const guard = await requireOpsPermission(request, reply, 'cases.read');
    if (!guard) return null;
    const querySchema = z.object({
      dsaCategory: z.string().optional(),
      submittedToDsaDb: z.coerce.boolean().optional(),
      startDate: z.string().datetime().optional(),
      endDate: z.string().datetime().optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50),
      offset: z.coerce.number().int().min(0).default(0),
    });
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) { reply.code(400); return { ok: false, error: 'Invalid query', details: parsed.error.flatten() }; }
    const result = await exportStatementsOfReasons(db, {
      start_date: parsed.data.startDate ? new Date(parsed.data.startDate) : undefined,
      end_date: parsed.data.endDate ? new Date(parsed.data.endDate) : undefined,
      dsa_category: parsed.data.dsaCategory,
      submitted_to_dsa_db: parsed.data.submittedToDsaDb,
      limit: parsed.data.limit,
      offset: parsed.data.offset,
    });
    return { ok: true, statements: result.statements, total: result.total };
  });

  // ── DSA export ───────────────────────────────────────────────────────
  app.get('/ops/v1/safety/dsa-export', async (request, reply) => {
    const guard = await requireOpsPermission(request, reply, 'cases.read');
    if (!guard) return null;
    const querySchema = z.object({
      startDate: z.string().datetime().optional(),
      endDate: z.string().datetime().optional(),
      dsaCategory: z.string().optional(),
      submittedOnly: z.coerce.boolean().optional(),
    });
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) { reply.code(400); return { ok: false, error: 'Invalid query', details: parsed.error.flatten() }; }
    const records = await exportForDsaDatabase(db, {
      date_from: parsed.data.startDate,
      date_to: parsed.data.endDate,
      dsa_category: parsed.data.dsaCategory,
      submitted_only: parsed.data.submittedOnly,
    });
    return { ok: true, records, total: records.length };
  });

  app.post('/ops/v1/safety/dsa-export/mark-submitted', async (request, reply) => {
    const guard = await requireOpsPermission(request, reply, 'cases.decide');
    if (!guard) return null;
    const bodySchema = z.object({ statementIds: z.array(z.string()).min(1) });
    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) { reply.code(400); return { ok: false, error: 'Invalid body', details: parsed.error.flatten() }; }
    const updated = await markSubmittedToDsaDb(db, parsed.data.statementIds);
    return { ok: true, updated };
  });

  // ── DSA transparency report ──────────────────────────────────────────
  app.get('/ops/v1/safety/dsa-transparency-report', async (request, reply) => {
    const guard = await requireOpsPermission(request, reply, 'cases.read');
    if (!guard) return null;
    const querySchema = z.object({
      period_start: z.string().datetime(),
      period_end: z.string().datetime(),
    });
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) { reply.code(400); return { ok: false, error: 'Invalid query', details: parsed.error.flatten() }; }
    const report = await generateTransparencyReport(db, parsed.data.period_start, parsed.data.period_end);
    return { ok: true, report };
  });

  // ── Policy versions ──────────────────────────────────────────────────
  app.get('/ops/v1/safety/policy-versions', async (request, reply) => {
    const guard = await requireOpsPermission(request, reply, 'cases.read');
    if (!guard) return null;
    const result = await db.query('SELECT * FROM policy_versions ORDER BY effective_from DESC');
    return { ok: true, versions: result.rows };
  });

  // ── Reason codes ─────────────────────────────────────────────────────
  app.get('/ops/v1/safety/reason-codes', async (request, reply) => {
    const guard = await requireOpsPermission(request, reply, 'cases.read');
    if (!guard) return null;
    const result = await db.query(
      'SELECT code, user_facing_label, severity_class, dsa_category, uk_priority_offence FROM safety_reason_codes WHERE superseded_at IS NULL ORDER BY severity_class DESC, code',
    );
    return { ok: true, reasonCodes: result.rows };
  });

  // ── Ofcom risk assessments ───────────────────────────────────────────
  app.get('/ops/v1/safety/ofcom-risk-assessments', async (request, reply) => {
    const guard = await requireOpsPermission(request, reply, 'cases.read');
    if (!guard) return null;
    const [assessments, missing, overdue] = await Promise.all([
      listRiskAssessments(db),
      getMissingOffences(db),
      isReviewOverdue(db),
    ]);
    return { ok: true, assessments, missing, overdue };
  });

  app.post('/ops/v1/safety/ofcom-risk-assessments', async (request, reply) => {
    const guard = await requireOpsPermission(request, reply, 'cases.decide');
    if (!guard) return null;
    const bodySchema = z.object({
      offenceType: z.enum(OFCOM_PRIORITY_OFFENCES),
      riskLevel: z.enum(['low', 'medium', 'high']),
      assessmentSummary: z.string().min(10).max(5000),
      mitigationMeasures: z.record(z.unknown()).default({}),
    });
    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) { reply.code(400); return { ok: false, error: 'Invalid body', details: parsed.error.flatten() }; }
    const assessment = await createRiskAssessmentRecord(db, {
      offence_type: parsed.data.offenceType,
      risk_level: parsed.data.riskLevel,
      assessment_summary: parsed.data.assessmentSummary,
      mitigation_measures: parsed.data.mitigationMeasures,
      assessed_by: guard.token.principal.id,
    });
    reply.code(201);
    return { ok: true, assessment };
  });
};

// ── Command type → permission mapping ───────────────────────────────────

function mapCommandTypeToPermission(commandType: string): string | null {
  const map: Record<string, string> = {
    'refund.execute': 'payments.refund.propose',
    'refund.approve': 'payments.refund.approve',
    'payout.approve': 'payouts.approve.low_value',
    'payout.approve_high': 'payouts.approve.high_value',
    'payout.destination_reveal': 'payouts.destination.reveal',
    'ledger.adjust': 'ledger.adjust.propose',
    'reconciliation.break.resolve': 'reconciliation.break.resolve',
    'reconciliation.close': 'reconciliation.close',
    'order.override': 'orders.override.propose',
    'order.override_approve': 'orders.override.approve',
    'safety.enforce': 'safety.case.decide',
    'seller.review': 'seller.review',
    'auction.admin': 'auctions.admin',
    'oneze.treasury': 'oneze.treasury',
    'market.circuit_breaker': 'market.circuit_breaker',
    'dlq.replay': 'dlq.replay',
    'dlq.purge': 'dlq.purge',
    'webhook.replay': 'dlq.replay',
  };
  return map[commandType] ?? null;
}

function mapCommandTypeToApprovalPermission(commandType: string): string | null {
  const map: Record<string, string> = {
    'refund.execute': 'payments.refund.approve',
    'payout.approve': 'payouts.approve.high_value',
    'payout.approve_high': 'payouts.approve.high_value',
    'ledger.adjust': 'ledger.adjust.approve',
    'reconciliation.close': 'reconciliation.close',
    'order.override': 'orders.override.approve',
    'dlq.purge': 'dlq.purge',
    'market.circuit_breaker': 'market.circuit_breaker',
    'oneze.treasury': 'oneze.treasury',
  };
  return map[commandType] ?? mapCommandTypeToPermission(commandType);
}
