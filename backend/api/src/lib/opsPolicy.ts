import crypto from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { WorkforceToken } from './workforceAuth.js';
import { hasRecentStepUp, type WorkforceSession } from './workforceAuth.js';
import { logger } from './logger.js';

// ── Policy engine ───────────────────────────────────────────────────────
//
// NCSC ZTNA (May 2026): policy engine evaluates signals about identity,
// device posture, and behaviour. No single signal is perfect — combining
// signals increases assurance and reduces reliance on any single control.
//
// Deny-by-default. Policy is evaluated server-side on every read and
// command. UI hiding is usability, not security.
//
// admin:* is prohibited in human entitlements.

export interface PolicyContext {
  principal: WorkforceToken['principal'];
  session: WorkforceSession;
  permissions: string[];
  grants: WorkforceToken['grants'];
  // Request context
  action: string;
  resourceType?: string;
  resourceId?: string;
  legalEntity?: string;
  amountGbp?: number;
  caseId?: string;
  reasonCode?: string;
  incidentMode?: boolean;
}

export interface PolicyDecision {
  decision: 'permit' | 'deny';
  reason: string;
  requiresStepUp: boolean;
  requiresApproval: boolean;
  requiresSeparationOfDuty: boolean;
  riskTier: string;
  matchedGrants: string[];
  policyVersion: string;
}

const POLICY_VERSION = '2026.08.25.v1';

// ── Permission metadata (loaded from DB, cached in memory) ──────────────

interface PermissionMeta {
  action: string;
  riskTier: string;
  requiresStepUp: boolean;
  requiresApproval: boolean;
  requiresSeparationOfDuty: boolean;
}

let permissionMetaCache: Map<string, PermissionMeta> | null = null;
let permissionMetaCacheAt = 0;
const PERMISSION_META_TTL_MS = 60_000; // 1 minute

async function loadPermissionMeta(db: Pool): Promise<Map<string, PermissionMeta>> {
  if (permissionMetaCache && Date.now() - permissionMetaCacheAt < PERMISSION_META_TTL_MS) {
    return permissionMetaCache;
  }

  const result = await db.query<{
    action: string;
    risk_tier: string;
    requires_step_up: boolean;
    requires_approval: boolean;
    requires_separation_of_duty: boolean;
  }>(`SELECT action, risk_tier, requires_step_up, requires_approval, requires_separation_of_duty FROM workforce_permissions`);

  const map = new Map<string, PermissionMeta>();
  for (const row of result.rows) {
    map.set(row.action, {
      action: row.action,
      riskTier: row.risk_tier,
      requiresStepUp: row.requires_step_up,
      requiresApproval: row.requires_approval,
      requiresSeparationOfDuty: row.requires_separation_of_duty,
    });
  }

  permissionMetaCache = map;
  permissionMetaCacheAt = Date.now();
  return map;
}

// ── Core authorization check ────────────────────────────────────────────

export async function authorize(
  db: Pool,
  ctx: PolicyContext,
): Promise<PolicyDecision> {
  const meta = await loadPermissionMeta(db);
  const permMeta = meta.get(ctx.action);

  // Deny-by-default: unknown permission
  if (!permMeta) {
    return denyDecision(`Unknown permission: ${ctx.action}`, ctx);
  }

  // Check if principal has this permission in active grants
  const matchedGrants = ctx.grants.filter((g) => g.permission === ctx.action);

  if (matchedGrants.length === 0) {
    return denyDecision(`No active grant for ${ctx.action}`, ctx);
  }

  // Check scope constraints (legal entity, region, amount limits)
  for (const grant of matchedGrants) {
    if (!checkScope(grant.scope, ctx)) {
      continue;
    }
    // Grant is valid and scope matches — proceed to step-up/approval checks
    return evaluateConditions(permMeta, ctx, matchedGrants.map((g) => g.permission));
  }

  return denyDecision(`No grant with matching scope for ${ctx.action}`, ctx);
}

function checkScope(scope: Record<string, unknown>, ctx: PolicyContext): boolean {
  // Legal entity constraint
  if (scope.legal_entity && scope.legal_entity !== ctx.legalEntity && scope.legal_entity !== '*') {
    return false;
  }

  // Region constraint
  if (scope.region && scope.region !== ctx.principal.region && scope.region !== '*') {
    return false;
  }

  // Amount limit
  if (scope.max_amount_gbp && ctx.amountGbp !== undefined) {
    const maxAmount = Number(scope.max_amount_gbp);
    if (!isNaN(maxAmount) && ctx.amountGbp > maxAmount) {
      return false;
    }
  }

  // Resource type constraint
  if (scope.resource_types && Array.isArray(scope.resource_types)) {
    if (ctx.resourceType && !scope.resource_types.includes(ctx.resourceType)) {
      return false;
    }
  }

  return true;
}

function evaluateConditions(
  meta: PermissionMeta,
  ctx: PolicyContext,
  matchedGrants: string[],
): PolicyDecision {
  // Step-up check
  if (meta.requiresStepUp && !hasRecentStepUp(ctx.session)) {
    return {
      decision: 'deny',
      reason: `Step-up authentication required for ${ctx.action}`,
      requiresStepUp: true,
      requiresApproval: meta.requiresApproval,
      requiresSeparationOfDuty: meta.requiresSeparationOfDuty,
      riskTier: meta.riskTier,
      matchedGrants,
      policyVersion: POLICY_VERSION,
    };
  }

  // AAL check — high/critical risk requires AAL2+ (phishing-resistant)
  if ((meta.riskTier === 'high' || meta.riskTier === 'critical') && ctx.session.authAssurance < 2) {
    return {
      decision: 'deny',
      reason: `AAL2+ (phishing-resistant MFA) required for ${ctx.action}`,
      requiresStepUp: meta.requiresStepUp,
      requiresApproval: meta.requiresApproval,
      requiresSeparationOfDuty: meta.requiresSeparationOfDuty,
      riskTier: meta.riskTier,
      matchedGrants,
      policyVersion: POLICY_VERSION,
    };
  }

  // Device posture check — high/critical risk requires managed device
  if ((meta.riskTier === 'high' || meta.riskTier === 'critical') && !ctx.principal.managedDeviceId) {
    return {
      decision: 'deny',
      reason: `Managed device required for ${ctx.action}`,
      requiresStepUp: meta.requiresStepUp,
      requiresApproval: meta.requiresApproval,
      requiresSeparationOfDuty: meta.requiresSeparationOfDuty,
      riskTier: meta.riskTier,
      matchedGrants,
      policyVersion: POLICY_VERSION,
    };
  }

  // Incident mode bypass — incident commander can bypass approval in incident mode
  if (ctx.incidentMode && ctx.permissions.includes('incident.kill_switch')) {
    return {
      decision: 'permit',
      reason: 'Permitted in incident mode',
      requiresStepUp: meta.requiresStepUp,
      requiresApproval: false,
      requiresSeparationOfDuty: false,
      riskTier: meta.riskTier,
      matchedGrants,
      policyVersion: POLICY_VERSION,
    };
  }

  return {
    decision: 'permit',
    reason: 'Permitted',
    requiresStepUp: meta.requiresStepUp,
    requiresApproval: meta.requiresApproval,
    requiresSeparationOfDuty: meta.requiresSeparationOfDuty,
    riskTier: meta.riskTier,
    matchedGrants,
    policyVersion: POLICY_VERSION,
  };
}

function denyDecision(reason: string, ctx: PolicyContext): PolicyDecision {
  return {
    decision: 'deny',
    reason,
    requiresStepUp: false,
    requiresApproval: false,
    requiresSeparationOfDuty: false,
    riskTier: 'standard',
    matchedGrants: [],
    policyVersion: POLICY_VERSION,
  };
}

// ── Record authorization decision ───────────────────────────────────────

export async function recordAuthzDecision(
  db: Pool | PoolClient,
  decision: PolicyDecision,
  ctx: PolicyContext,
): Promise<void> {
  try {
    await db.query(
      `
        INSERT INTO authorization_decisions (
          id, principal_id, session_id, permission, resource_type, resource_id,
          decision, policy_version, matched_grants, denial_reason,
          step_up_required, incident_mode
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `,
      [
        crypto.randomUUID(),
        ctx.principal.id,
        ctx.session.id,
        ctx.action,
        ctx.resourceType ?? null,
        ctx.resourceId ?? null,
        decision.decision,
        decision.policyVersion,
        JSON.stringify(decision.matchedGrants),
        decision.decision === 'deny' ? decision.reason : null,
        decision.requiresStepUp,
        ctx.incidentMode ?? false,
      ],
    );
  } catch (err) {
    // Don't block on decision log failure, but warn
    // (the immutable audit chain is the fail-closed path)
    logger.warn(
      { err: (err as Error).message, principalId: ctx.principal.id, action: ctx.action },
      '[opsPolicy] failed to record authz decision',
    );
  }
}
