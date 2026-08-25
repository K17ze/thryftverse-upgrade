/**
 * Authoritative risk decision system for ThryftVerse.
 *
 * Implements the decision/enforcement separation contract from the
 * fraud/scams/ATO flagship analysis (2026-08-25). The risk engine produces
 * evidence and a recommendation; the domain owner converts it into an
 * enforceable decision under a versioned policy and records execution.
 *
 * This module replaces the conflated recommendation/decision/execution model
 * that FR-13 identified as the principal defect. Three distinct columns:
 *   recommended_action — what the risk engine suggests (advisory)
 *   owner_decision     — what the domain owner decided under policy
 *   execution_status   — what actually happened (executed / not_executed /
 *                        superseded / outcome_unknown)
 *
 * The expanded event taxonomy (FR-07) covers every risky mutation surface:
 * auth, listings, messaging, payments, payouts, returns, auctions, co-own
 * and operator actions.
 *
 * Design principles (AGENTS.md §11 — Truthful, anti-AI design policy):
 * - Every decision is derived from real, observable signals — never fabricated.
 * - Unavailable evaluations never collapse to low risk.
 * - The risk service never directly writes accounts, listings or balances.
 * - Idempotent retries return the same valid decision or an explicit superseding
 *   decision.
 *
 * 2026 research context:
 * - NCSC CYBERUK 2026: passkeys recommended over traditional MFA.
 * - NHIMG July 2026: passkeys as step-up controls on payout/reroute/recovery,
 *   not just login. Stolen sessions bypass login-only passkeys.
 * - PSR PS25/5: APP scam reimbursement, 5 business days, £85K max, durable
 *   case records mandatory.
 * - Stripe Radar: 3DS → Allow → Block → Review priority; account-level
 *   payout pause.
 */

import crypto from 'node:crypto';
import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import {
  checkFraudNonBlocking,
  type FraudCheckResult,
  type FraudCheckInput,
  type VelocityLimits,
} from './fraudDetection.js';

// ---------------------------------------------------------------------------
// Expanded event taxonomy (FR-07)
// ---------------------------------------------------------------------------

/**
 * Every risky mutation surface in ThryftVerse. The old taxonomy had only
 * `signup | listing | message | transaction`. This expanded set covers
 * login, recovery, protected-field changes, payments, payouts, withdrawals,
 * returns, refunds, auctions, co-own transfers and operator actions.
 */
export type RiskEventType =
  | 'auth.signup.attempted'
  | 'auth.login.attempted'
  | 'auth.recovery.completed'
  | 'auth.protected_field.change'
  | 'auth.session.created'
  | 'listing.publish.requested'
  | 'listing.edit.requested'
  | 'chat.message.send'
  | 'chat.link.shared'
  | 'payment.intent.create'
  | 'payment.intent.confirm'
  | 'payout.destination.change'
  | 'payout.release.requested'
  | 'withdrawal.requested'
  | 'return.requested'
  | 'refund.requested'
  | 'auction.bid'
  | 'auction.buy_now'
  | 'coown.order'
  | 'coown.transfer'
  | 'operator.privileged_action'
  | 'fraud.report.submitted';

/**
 * The owner service that owns the mutation and is responsible for enforcing
 * the decision inside its transaction boundary.
 */
export type OwnerService =
  | 'auth'
  | 'listings'
  | 'messaging'
  | 'payments'
  | 'payouts'
  | 'orders'
  | 'auctions'
  | 'coown'
  | 'admin';

/**
 * Map an expanded event type to its owner service.
 */
export function ownerServiceForEventType(eventType: RiskEventType): OwnerService {
  if (eventType.startsWith('auth.')) return 'auth';
  if (eventType.startsWith('listing.')) return 'listings';
  if (eventType.startsWith('chat.')) return 'messaging';
  if (eventType.startsWith('payment.')) return 'payments';
  if (eventType.startsWith('payout.')) return 'payouts';
  if (eventType.startsWith('withdrawal.')) return 'payouts';
  if (eventType.startsWith('return.') || eventType.startsWith('refund.')) return 'orders';
  if (eventType.startsWith('auction.')) return 'auctions';
  if (eventType.startsWith('coown.')) return 'coown';
  if (eventType.startsWith('operator.')) return 'admin';
  return 'admin';
}

/**
 * Map an expanded event type to the legacy FraudEventType for the rule
 * engine. The rule engine still uses the 4-type taxonomy internally; the
 * new system wraps it and adds the authoritative decision layer on top.
 */
export function toLegacyEventType(
  eventType: RiskEventType,
): 'signup' | 'listing' | 'message' | 'transaction' {
  if (eventType === 'auth.signup.attempted') return 'signup';
  if (eventType.startsWith('listing.')) return 'listing';
  if (eventType.startsWith('chat.')) return 'message';
  // All money-movement and other events map to transaction for the rule engine
  return 'transaction';
}

// ---------------------------------------------------------------------------
// Authoritative decision contract (FR-13)
// ---------------------------------------------------------------------------

/**
 * The seven possible risk actions. These are the same for both the
 * recommendation and the owner decision, but they are never conflated.
 */
export type RiskAction =
  | 'allow'
  | 'allow_with_limits'
  | 'step_up'
  | 'delay'
  | 'quarantine'
  | 'manual_review'
  | 'deny';

/**
 * Obligations that the owner must enforce as part of the decision.
 * These are structured, not free-text, so they can be machine-enforced.
 */
export type RiskObligation =
  | { type: 'require_factor'; factor: 'passkey' | 'totp' | 'provider_3ds' }
  | { type: 'cooldown'; until: string }
  | { type: 'amount_cap'; amountMinor: number; currency: string }
  | { type: 'case'; queue: string };

/**
 * The authoritative risk decision. This is what the domain owner receives
 * and must enforce inside its transaction boundary.
 */
export interface RiskDecision {
  decisionId: string;
  eventId: string;
  eventType: RiskEventType;
  subjectRef: string;
  actionRef: string | null;
  // Recommendation from the risk engine
  recommendedAction: RiskAction;
  recommendedReasonCodes: string[];
  riskScore: number | null;
  riskLevel: 'low' | 'medium' | 'high' | 'unknown';
  signals: RiskSignal[];
  // Owner decision under a versioned policy
  ownerDecision: RiskAction;
  ownerReasonCodes: string[];
  policyVersion: string;
  rulesetVersion: string;
  modelVersion: string | null;
  // Evaluation metadata
  evaluationStatus: 'complete' | 'degraded' | 'unavailable';
  validUntil: string;
  obligations: RiskObligation[];
  evidenceDigest: string;
  createdAt: string;
}

/**
 * A risk signal — same shape as FraudSignal but exported from the new
 * contract so callers don't need to import from the legacy module.
 */
export interface RiskSignal {
  ruleId: string;
  description: string;
  weight: number;
  observedValue: string | number | boolean;
}

/**
 * Execution status for a risk decision.
 */
export type ExecutionStatus = 'executed' | 'not_executed' | 'superseded' | 'outcome_unknown';

// ---------------------------------------------------------------------------
// Policy envelope
// ---------------------------------------------------------------------------

/**
 * A versioned policy for a specific event type. The policy defines how the
 * owner converts a recommendation into an enforceable decision.
 *
 * Policies are table-tested and version-pinned. Rollout is audit-only →
 * 1% → 10% → 50% → 100% with latency, loss, friction and appeal guardrails.
 */
export interface RiskPolicy {
  policyVersion: string;
  eventType: RiskEventType;
  // Map evaluation status + risk level to an owner decision
  decide: (input: {
    recommendedAction: RiskAction;
    riskLevel: 'low' | 'medium' | 'high' | 'unknown';
    evaluationStatus: 'complete' | 'degraded' | 'unavailable';
    amountMinor?: number;
  }) => {
    action: RiskAction;
    reasonCodes: string[];
    obligations: RiskObligation[];
  };
}

/**
 * Default policy: the owner accepts the recommendation when the evaluation
 * completed, and fails safe (step_up or manual_review) when unavailable.
 *
 * Unavailable evaluations NEVER collapse to allow. This is the core
 * invariant from AGENTS.md §11 — truthful contracts.
 */
export function defaultPolicy(eventType: RiskEventType): RiskPolicy {
  const policyVersion = `default.${eventType}.v1`;

  const decide: RiskPolicy['decide'] = ({ recommendedAction, riskLevel, evaluationStatus, amountMinor }) => {
    // Unavailable → fail safe based on event criticality
    if (evaluationStatus === 'unavailable') {
      if (eventType.startsWith('payment.') || eventType.startsWith('payout.') || eventType.startsWith('withdrawal.')) {
        return {
          action: 'manual_review',
          reasonCodes: ['risk_service_unavailable', 'money_movement_hold'],
          obligations: [{ type: 'case', queue: 'payout_withdrawal' }],
        };
      }
      if (eventType.startsWith('auth.')) {
        return {
          action: 'step_up',
          reasonCodes: ['risk_service_unavailable', 'auth_step_up'],
          obligations: [{ type: 'require_factor', factor: 'totp' }],
        };
      }
      return {
        action: 'manual_review',
        reasonCodes: ['risk_service_unavailable'],
        obligations: [],
      };
    }

    // Complete/degraded → accept recommendation with obligations
    const obligations: RiskObligation[] = [];

    if (recommendedAction === 'step_up') {
      // Step-up for money movement requires 3DS; for auth requires passkey/totp
      if (eventType.startsWith('payment.')) {
        obligations.push({ type: 'require_factor', factor: 'provider_3ds' });
      } else if (eventType.startsWith('auth.')) {
        obligations.push({ type: 'require_factor', factor: 'passkey' });
      }
    }

    if (recommendedAction === 'delay' && eventType.startsWith('payout.')) {
      const cooldownUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      obligations.push({ type: 'cooldown', until: cooldownUntil });
    }

    if (riskLevel === 'high' && amountMinor && amountMinor > 0) {
      obligations.push({ type: 'case', queue: queueForEventType(eventType) });
    }

    return {
      action: recommendedAction,
      reasonCodes: [],
      obligations,
    };
  };

  return { policyVersion, eventType, decide };
}

/**
 * Map an event type to its review queue.
 */
function queueForEventType(eventType: RiskEventType): string {
  if (eventType.startsWith('auth.')) return 'account_takeover';
  if (eventType.startsWith('chat.')) return 'live_scam_phishing';
  if (eventType.startsWith('payout.') || eventType.startsWith('withdrawal.')) return 'payout_withdrawal';
  if (eventType.startsWith('payment.')) return 'payment_card';
  if (eventType.startsWith('listing.')) return 'seller_listing_integrity';
  if (eventType.startsWith('auction.')) return 'auction_collusion';
  if (eventType.startsWith('return.') || eventType.startsWith('refund.')) return 'returns_refunds';
  if (eventType.startsWith('coown.')) return 'auction_collusion';
  if (eventType.startsWith('operator.')) return 'operator_abuse';
  return 'seller_listing_integrity';
}

// ---------------------------------------------------------------------------
// Decision service
// ---------------------------------------------------------------------------

export interface RiskDecisionInput {
  eventType: RiskEventType;
  subjectRef: string;
  actionRef?: string;
  amountMinor?: number;
  currency?: string;
  jurisdiction?: string;
  dedupeKey?: string;
  // Request context for the rule engine
  headers: Record<string, string | string[] | undefined>;
  ip: string;
  userId?: string | null;
  email?: string;
  accountAgeSeconds?: number;
  // Velocity limits override
  velocityOverrides?: Partial<VelocityLimits>;
  // Context metadata (non-sensitive)
  context?: Record<string, unknown>;
}

export interface RiskDecisionServiceDependencies {
  db: Pool;
  redis: Redis;
  logger?: { warn?: (obj: unknown, msg: string) => void; info?: (obj: unknown, msg: string) => void };
  shadowService?: {
    scoreShadow(input: unknown): Promise<unknown>;
    logScoreComparison(
      eventId: string,
      eventType: string,
      userId: string | null,
      ruleEngineResult: FraudCheckResult,
      shadowResult: unknown,
      input: unknown,
    ): Promise<void>;
  } | null;
  policies?: Map<RiskEventType, RiskPolicy>;
  /**
   * FR-09: Governed IP reputation provider. When configured, the decision
   * service queries it for every evaluation and merges the verdict into the
   * risk signals. Defaults to `noOpIpReputationProvider` (returns `unknown`,
   * never fabricates a clean verdict).
   */
  ipReputationProvider?: IpReputationProvider;
}

/**
 * Compute the evidence digest — a SHA-256 of the evidence bundle that the
 * decision was based on. This lets an auditor verify that a decision was
 * made on the evidence claimed, not fabricated after the fact.
 */
function computeEvidenceDigest(input: {
  eventType: RiskEventType;
  subjectRef: string;
  actionRef: string | null;
  signals: RiskSignal[];
  riskScore: number | null;
  headers: Record<string, string | string[] | undefined>;
  ip: string;
}): string {
  const bundle = JSON.stringify({
    eventType: input.eventType,
    subjectRef: input.subjectRef,
    actionRef: input.actionRef,
    signals: input.signals.map((s) => ({ ruleId: s.ruleId, weight: s.weight })),
    riskScore: input.riskScore,
    ipHash: crypto.createHash('sha256').update(input.ip).digest('hex').slice(0, 16),
  });
  return crypto.createHash('sha256').update(bundle).digest('hex');
}

/**
 * Map a FraudAction from the rule engine to a RiskAction.
 */
function fraudActionToRiskAction(
  action: 'allow' | 'flag' | 'block' | null,
  riskLevel: 'low' | 'medium' | 'high' | 'unknown',
): RiskAction {
  if (action === 'block') return 'deny';
  if (action === 'flag') return 'manual_review';
  if (riskLevel === 'medium') return 'step_up';
  return 'allow';
}

/**
 * Evaluate a risk event and produce an authoritative decision.
 *
 * This is the primary entry point. It:
 * 1. Records the immutable risk event in PostgreSQL.
 * 2. Calls the rule engine (via checkFraudNonBlocking) for the recommendation.
 * 3. Applies the versioned policy to convert the recommendation into an
 *    owner decision with obligations.
 * 4. Persists the decision with the separated recommendation/owner/execution
 *    model.
 * 5. Returns the decision to the caller, who must enforce it inside their
 *    transaction boundary.
 *
 * The caller is responsible for:
 * - Calling this BEFORE the mutation (not after).
 * - Enforcing the ownerDecision inside their transaction.
 * - Recording the execution status via recordExecution().
 */
export async function evaluateRisk(
  deps: RiskDecisionServiceDependencies,
  input: RiskDecisionInput,
): Promise<RiskDecision> {
  const { db, redis, logger, shadowService } = deps;
  const ownerService = ownerServiceForEventType(input.eventType);
  const policy = deps.policies?.get(input.eventType) ?? defaultPolicy(input.eventType);

  // 1. Record the immutable risk event
  const eventId = `risk_${crypto.randomUUID()}`;
  try {
    await db.query(
      `INSERT INTO risk_events (event_id, event_type, owner_service, subject_ref, action_ref,
         amount_minor, currency, jurisdiction, dedupe_key, context)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        eventId,
        input.eventType,
        ownerService,
        input.subjectRef,
        input.actionRef ?? null,
        input.amountMinor ?? null,
        input.currency ?? null,
        input.jurisdiction ?? null,
        input.dedupeKey ?? null,
        JSON.stringify(input.context ?? {}),
      ],
    );
  } catch (err) {
    // If the event can't be recorded, we still evaluate — but log it.
    // The decision is still authoritative; the event log is for audit.
    logger?.warn?.({ err, eventId, eventType: input.eventType }, 'Failed to record risk event');
  }

  // 2. Call the rule engine for the recommendation
  const legacyInput: FraudCheckInput = {
    eventType: toLegacyEventType(input.eventType),
    userId: input.userId,
    email: input.email,
    headers: input.headers,
    ip: input.ip,
    accountAgeSeconds: input.accountAgeSeconds,
    amountGbp: input.currency === 'GBP' && input.amountMinor
      ? input.amountMinor / 100
      : undefined,
    velocityOverrides: input.velocityOverrides,
  };

  const ruleResult = await checkFraudNonBlocking(
    redis,
    legacyInput,
    undefined,
    logger,
    shadowService,
  );

  // 3. Map the rule engine result to the new contract
  const recommendedAction: RiskAction = ruleResult.evaluationStatus === 'unavailable'
    ? 'manual_review'
    : fraudActionToRiskAction(ruleResult.action, ruleResult.riskLevel);

  const signals: RiskSignal[] = ruleResult.signals.map((s) => ({
    ruleId: s.ruleId,
    description: s.description,
    weight: s.weight,
    observedValue: s.observedValue,
  }));

  // FR-09: Query the governed IP reputation provider and merge verdict
  // signals. When no provider is configured (noOp), the verdict is `unknown`
  // and produces no signals — the system never fabricates a clean reputation.
  const ipProvider = deps.ipReputationProvider ?? noOpIpReputationProvider;
  let ipSignalsAdded = false;
  if (input.ip && ipProvider.name !== 'noop') {
    try {
      const ipVerdict = await ipProvider.query(input.ip);
      const ipSignals = ipReputationToSignals(ipVerdict);
      if (ipSignals.length > 0) {
        signals.push(...ipSignals);
        ipSignalsAdded = true;
      }
    } catch (err) {
      // Provider failures never break the decision — log and continue.
      logger?.warn?.({ err, ip: input.ip, provider: ipProvider.name }, 'IP reputation provider query failed');
    }
  }

  // Recompute the recommended action if IP signals changed the picture.
  // The rule engine's score didn't include IP reputation; we merge it now.
  let finalRiskScore = ruleResult.riskScore;
  let finalRiskLevel = ruleResult.riskLevel;
  let finalRecommendedAction = recommendedAction;
  if (ipSignalsAdded && finalRiskScore !== null) {
    const ipWeightSum = signals
      .filter((s) => s.ruleId.startsWith('ip.'))
      .reduce((sum, s) => sum + s.weight, 0);
    finalRiskScore = Math.min(100, finalRiskScore + ipWeightSum);
    finalRiskLevel = finalRiskScore >= 70 ? 'high' : finalRiskScore >= 30 ? 'medium' : 'low';
    finalRecommendedAction = finalRiskLevel === 'high'
      ? 'deny'
      : finalRiskLevel === 'medium'
        ? 'step_up'
        : 'allow';
  }

  const recommendedReasonCodes: string[] = ruleResult.reasonCode
    ? [ruleResult.reasonCode]
    : signals.map((s) => s.ruleId);

  // 4. Apply the versioned policy
  // Map the legacy evaluation status to the new contract. 'error' (malformed
  // input / programming error) is treated as 'unavailable' for policy
  // purposes — the failover policy handles it safely.
  const mappedEvaluationStatus: 'complete' | 'degraded' | 'unavailable' =
    ruleResult.evaluationStatus === 'completed' ? 'complete' : 'unavailable';
  const policyResult = policy.decide({
    recommendedAction: finalRecommendedAction,
    riskLevel: finalRiskLevel,
    evaluationStatus: mappedEvaluationStatus,
    amountMinor: input.amountMinor,
  });

  // 5. Compute evidence digest
  const evidenceDigest = computeEvidenceDigest({
    eventType: input.eventType,
    subjectRef: input.subjectRef,
    actionRef: input.actionRef ?? null,
    signals,
    riskScore: finalRiskScore,
    headers: input.headers,
    ip: input.ip,
  });

  const decisionId = `risk_decision_${crypto.randomUUID()}`;
  const validUntil = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5-minute validity

  const decision: RiskDecision = {
    decisionId,
    eventId,
    eventType: input.eventType,
    subjectRef: input.subjectRef,
    actionRef: input.actionRef ?? null,
    recommendedAction: finalRecommendedAction,
    recommendedReasonCodes,
    riskScore: finalRiskScore,
    riskLevel: finalRiskLevel,
    signals,
    ownerDecision: policyResult.action,
    ownerReasonCodes: policyResult.reasonCodes,
    policyVersion: policy.policyVersion,
    rulesetVersion: 'rules.v1',
    modelVersion: null,
    evaluationStatus: mappedEvaluationStatus,
    validUntil,
    obligations: policyResult.obligations,
    evidenceDigest,
    createdAt: new Date().toISOString(),
  };

  // 6. Persist the decision
  try {
    await db.query(
      `INSERT INTO risk_decisions (decision_id, event_id, recommended_action, recommended_reason_codes,
         risk_score, risk_level, signals, owner_decision, owner_reason_codes, policy_version,
         ruleset_version, model_version, evaluation_status, valid_until, obligations, evidence_digest)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [
        decisionId,
        eventId,
        decision.recommendedAction,
        decision.recommendedReasonCodes,
        decision.riskScore,
        decision.riskLevel,
        JSON.stringify(decision.signals),
        decision.ownerDecision,
        decision.ownerReasonCodes,
        decision.policyVersion,
        decision.rulesetVersion,
        decision.modelVersion,
        decision.evaluationStatus,
        validUntil,
        JSON.stringify(decision.obligations),
        decision.evidenceDigest,
      ],
    );
  } catch (err) {
    logger?.warn?.({ err, decisionId, eventId }, 'Failed to persist risk decision');
  }

  return decision;
}

/**
 * Record the execution status of a risk decision.
 *
 * The domain owner calls this after attempting to enforce the decision
 * inside their transaction boundary. This completes the
 * recommendation/decision/execution separation (FR-13).
 */
export async function recordExecution(
  db: Pool,
  input: {
    decisionId: string;
    ownerService: OwnerService;
    executionStatus: ExecutionStatus;
    domainEntityType?: string;
    domainEntityId?: string;
    domainEntityVersion?: string;
    reconciliationRef?: string;
  },
): Promise<void> {
  await db.query(
    `INSERT INTO risk_executions (decision_id, owner_service, execution_status,
       domain_entity_type, domain_entity_id, domain_entity_version,
       reconciliation_ref, reconciliation_status, executed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7,
       CASE WHEN $3 = 'outcome_unknown' THEN 'pending' ELSE 'not_required' END,
       CASE WHEN $3 = 'executed' THEN NOW() ELSE NULL END)`,
    [
      input.decisionId,
      input.ownerService,
      input.executionStatus,
      input.domainEntityType ?? null,
      input.domainEntityId ?? null,
      input.domainEntityVersion ?? null,
      input.reconciliationRef ?? null,
    ],
  );
}

/**
 * Reconcile an outcome_unknown execution. Called when the provider response
 * was lost and the system needs to check the actual result.
 */
export async function reconcileExecution(
  db: Pool,
  executionId: string,
  result: {
    executionStatus: ExecutionStatus;
    reconciliationStatus: 'confirmed' | 'failed';
  },
): Promise<void> {
  await db.query(
    `UPDATE risk_executions
     SET execution_status = $2,
         reconciliation_status = $3,
         reconciled_at = NOW(),
         executed_at = CASE WHEN $2 = 'executed' THEN NOW() ELSE executed_at END
     WHERE id = $1`,
    [executionId, result.executionStatus, result.reconciliationStatus],
  );
}

// ---------------------------------------------------------------------------
// Durable case management (FR-10 — replaces Redis-backed fraud reports)
// ---------------------------------------------------------------------------

export interface RiskCaseInput {
  caseType: RiskCaseType;
  subjectRefs: string[];
  lossExposureMinor?: number;
  lossExposureCurrency?: string;
  ownerTeam?: string;
  linkedCaseIds?: string[];
  metadata?: Record<string, unknown>;
}

export type RiskCaseType =
  | 'account_takeover'
  | 'live_scam_phishing'
  | 'payout_withdrawal'
  | 'payment_card'
  | 'seller_listing_integrity'
  | 'auction_collusion'
  | 'returns_refunds'
  | 'operator_abuse'
  | 'user_fraud_report';

/**
 * Create a durable risk case in PostgreSQL. This replaces the Redis-backed
 * fraud report (FR-10) with a case that has append-only event history,
 * evidence bindings, SLA tracking and legal-hold support.
 */
export async function createRiskCase(
  db: Pool,
  input: RiskCaseInput,
): Promise<{ caseId: string; createdAt: string }> {
  const caseId = `risk_case_${crypto.randomUUID()}`;
  const createdAt = new Date().toISOString();

  await db.query(
    `INSERT INTO risk_cases (case_id, case_type, status, priority, subject_refs,
       loss_exposure_minor, loss_exposure_currency, owner_team, linked_case_ids)
     VALUES ($1, $2, 'open', 'normal', $3, $4, $5, $6, $7)`,
    [
      caseId,
      input.caseType,
      input.subjectRefs,
      input.lossExposureMinor ?? 0,
      input.lossExposureCurrency ?? null,
      input.ownerTeam ?? null,
      input.linkedCaseIds ?? [],
    ],
  );

  // Record the creation event
  await db.query(
    `INSERT INTO risk_case_events (case_id, event_type, actor_id, actor_type, reason_text, to_status)
     VALUES ($1, 'created', 'system', 'system', 'Case created', 'open')`,
    [caseId],
  );

  return { caseId, createdAt };
}

/**
 * Add an event to a risk case. Append-only — never mutates existing events.
 */
export async function addCaseEvent(
  db: Pool,
  input: {
    caseId: string;
    eventType: 'status_changed' | 'assigned' | 'evidence_added' | 'action_taken' | 'note_added' | 'escalated' | 'resolved' | 'closed' | 'reopened' | 'sla_breached' | 'legal_hold_toggled';
    actorId: string;
    actorType: 'operator' | 'system' | 'user' | 'provider';
    reasonCode?: string;
    reasonText?: string;
    fromStatus?: string;
    toStatus?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await db.query(
    `INSERT INTO risk_case_events (case_id, event_type, actor_id, actor_type,
       reason_code, reason_text, from_status, to_status, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      input.caseId,
      input.eventType,
      input.actorId,
      input.actorType,
      input.reasonCode ?? null,
      input.reasonText ?? null,
      input.fromStatus ?? null,
      input.toStatus ?? null,
      JSON.stringify(input.metadata ?? {}),
    ],
  );

  // Update case status if this is a status change
  if (input.eventType === 'status_changed' && input.toStatus) {
    await db.query(
      `UPDATE risk_cases SET status = $2, closed_at = CASE WHEN $2 IN ('resolved', 'closed') THEN NOW() ELSE closed_at END WHERE case_id = $1`,
      [input.caseId, input.toStatus],
    );
  }
}

/**
 * Bind evidence to a risk case. The evidence object is stored in object
 * storage; this table records the binding with a checksum for integrity.
 */
export async function bindEvidence(
  db: Pool,
  input: {
    caseId: string;
    eventId?: string;
    evidenceType: 'screenshot' | 'log_entry' | 'provider_record' | 'message_content' | 'transaction_record' | 'session_record' | 'device_record' | 'user_statement' | 'external_report';
    storageRef: string;
    checksumSha256: string;
    source: 'user' | 'operator' | 'system' | 'provider' | 'law_enforcement';
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await db.query(
    `INSERT INTO risk_evidence_bindings (case_id, event_id, evidence_type, storage_ref,
       checksum_sha256, source, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      input.caseId,
      input.eventId ?? null,
      input.evidenceType,
      input.storageRef,
      input.checksumSha256,
      input.source,
      JSON.stringify(input.metadata ?? {}),
    ],
  );

  // Record the evidence addition as a case event
  await addCaseEvent(db, {
    caseId: input.caseId,
    eventType: 'evidence_added',
    actorId: input.source,
    actorType: input.source === 'user' ? 'user' : input.source === 'provider' ? 'provider' : 'operator',
    reasonText: `Evidence added: ${input.evidenceType}`,
    metadata: { storageRef: input.storageRef, evidenceType: input.evidenceType },
  });
}

// ---------------------------------------------------------------------------
// Entity link graph (FR-06)
// ---------------------------------------------------------------------------

export interface EntityLinkInput {
  nodeAType: 'account' | 'device' | 'payment_instrument' | 'payout_destination' | 'address' | 'media' | 'listing' | 'session' | 'passkey';
  nodeARef: string;
  nodeBType: 'account' | 'device' | 'payment_instrument' | 'payout_destination' | 'address' | 'media' | 'listing' | 'session' | 'passkey';
  nodeBRef: string;
  linkType: 'owns' | 'used_by' | 'shares_device' | 'shares_ip' | 'shares_payment_instrument' | 'shares_payout_destination' | 'shares_address' | 'linked_listing' | 'counterparty' | 'recovered_from' | 'superseded_by';
  linkSource: 'signup' | 'login' | 'transaction' | 'payout' | 'listing' | 'message' | 'recovery' | 'operator_link' | 'graph_inference';
  confidence?: number;
  legalBasis?: string;
}

/**
 * Record an entity link in the tokenised graph. If the same link already
 * exists, update the last_seen_at timestamp instead of creating a duplicate.
 */
export async function recordEntityLink(
  db: Pool,
  input: EntityLinkInput,
): Promise<void> {
  await db.query(
    `INSERT INTO entity_links (node_a_type, node_a_ref, node_b_type, node_b_ref,
       link_type, link_source, confidence, legal_basis, last_seen_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
     ON CONFLICT DO NOTHING`,
    [
      input.nodeAType,
      input.nodeARef,
      input.nodeBType,
      input.nodeBRef,
      input.linkType,
      input.linkSource,
      input.confidence ?? 1.0,
      input.legalBasis ?? null,
    ],
  );

  // Update last_seen_at for existing link
  await db.query(
    `UPDATE entity_links SET last_seen_at = NOW()
     WHERE node_a_type = $1 AND node_a_ref = $2
       AND node_b_type = $3 AND node_b_ref = $4
       AND link_type = $5 AND review_state = 'active'`,
    [input.nodeAType, input.nodeARef, input.nodeBType, input.nodeBRef, input.linkType],
  );
}

/**
 * Get all links for a node (either direction).
 */
export async function getEntityLinks(
  db: Pool,
  nodeType: string,
  nodeRef: string,
): Promise<Array<{
  id: string;
  otherType: string;
  otherRef: string;
  linkType: string;
  confidence: number;
  reviewState: string;
  lastSeenAt: string;
}>> {
  const result = await db.query(
    `SELECT
       id,
       CASE WHEN node_a_type = $1 AND node_a_ref = $2 THEN node_b_type ELSE node_a_type END AS other_type,
       CASE WHEN node_a_type = $1 AND node_a_ref = $2 THEN node_b_ref ELSE node_a_ref END AS other_ref,
       link_type, confidence, review_state, last_seen_at
     FROM entity_links
     WHERE (node_a_type = $1 AND node_a_ref = $2)
        OR (node_b_type = $1 AND node_b_ref = $2)
     ORDER BY last_seen_at DESC`,
    [nodeType, nodeRef],
  );
  return result.rows.map((r) => ({
    id: r.id,
    otherType: r.other_type,
    otherRef: r.other_ref,
    linkType: r.link_type,
    confidence: Number(r.confidence),
    reviewState: r.review_state,
    lastSeenAt: r.last_seen_at,
  }));
}

// ---------------------------------------------------------------------------
// IP reputation adapter (FR-09 — governed provider interface)
// ---------------------------------------------------------------------------

/**
 * FR-09: The old `IP_BLACKLIST` in fraudDetection.ts was an empty Set with a
 * comment saying "left empty so we never fabricate reputation data." That's
 * honest but useless — it means the IP reputation rule never fires.
 *
 * The fix is not to hardcode a list (which goes stale within hours) but to
 * define a governed provider interface that production wires to a real
 * threat-intel feed (e.g. Spur, MaxMind GeoIP2, IPQS, or an internal
 * denylist managed by the trust & safety team). The provider is injected
 * into `evaluateRisk` via dependencies, so the decision system never
 * depends on a static list.
 *
 * Anti-fabrication invariant (AGENTS.md §11): the `NoOpIpReputationProvider`
 * returns `unknown` for every query — it never fabricates a "clean" reputation.
 * A "clean" reputation can only come from a real provider that has data.
 */
export interface IpReputationVerdict {
  /** Overall risk classification from the provider. */
  risk: 'clean' | 'low' | 'medium' | 'high' | 'blocklisted' | 'unknown';
  /** Whether the IP is a known proxy/VPN/Tor exit node. */
  isProxy: boolean | null;
  /** Whether the IP is a known Tor exit node. */
  isTor: boolean | null;
  /** ISO-3166 country code, or null if unknown. */
  countryCode: string | null;
  /** ASN number (e.g. AS13335), or null if unknown. */
  asn: string | null;
  /** Hosting/datacenter IP (vs residential/mobile). */
  isDatacenter: boolean | null;
  /** Provider-specific raw response, kept for audit. Never exposed to users. */
  raw: Record<string, unknown>;
}

/**
 * Governed IP reputation provider. Production wires a real implementation
 * (Spur, MaxMind, IPQS, internal feed). Tests and dev use `noOpIpReputationProvider`.
 */
export interface IpReputationProvider {
  /** Provider name for audit logging (e.g. "spur", "maxmind", "internal"). */
  readonly name: string;
  /** Query reputation for an IP address. Must be idempotent and side-effect-free. */
  query(ip: string): Promise<IpReputationVerdict>;
}

/**
 * Default no-op provider. Returns `unknown` for every field — never
 * fabricates a "clean" verdict. This is the honest default when no
 * threat-intel feed is configured.
 */
export const noOpIpReputationProvider: IpReputationProvider = {
  name: 'noop',
  async query(): Promise<IpReputationVerdict> {
    return {
      risk: 'unknown',
      isProxy: null,
      isTor: null,
      countryCode: null,
      asn: null,
      isDatacenter: null,
      raw: {},
    };
  },
};

/**
 * Convert an IP reputation verdict to risk signals for the rule engine.
 * Only fires on non-`unknown` verdicts — a `unknown` verdict produces no
 * signal, which is the correct behaviour when no provider is configured.
 */
export function ipReputationToSignals(verdict: IpReputationVerdict): RiskSignal[] {
  const signals: RiskSignal[] = [];

  if (verdict.risk === 'blocklisted') {
    signals.push({
      ruleId: 'ip.reputation.blocklisted',
      description: 'IP address is on a blocklist from the reputation provider',
      weight: 60,
      observedValue: verdict.risk,
    });
  } else if (verdict.risk === 'high') {
    signals.push({
      ruleId: 'ip.reputation.high',
      description: 'IP address has a high-risk reputation score',
      weight: 40,
      observedValue: verdict.risk,
    });
  } else if (verdict.risk === 'medium') {
    signals.push({
      ruleId: 'ip.reputation.medium',
      description: 'IP address has a medium-risk reputation score',
      weight: 20,
      observedValue: verdict.risk,
    });
  }

  if (verdict.isTor === true) {
    signals.push({
      ruleId: 'ip.tor_exit_node',
      description: 'IP address is a known Tor exit node',
      weight: 35,
      observedValue: true,
    });
  }

  if (verdict.isProxy === true) {
    signals.push({
      ruleId: 'ip.proxy',
      description: 'IP address is a known proxy/VPN endpoint',
      weight: 15,
      observedValue: true,
    });
  }

  if (verdict.isDatacenter === true) {
    signals.push({
      ruleId: 'ip.datacenter',
      description: 'IP address belongs to a hosting/datacenter range, not residential',
      weight: 10,
      observedValue: true,
    });
  }

  return signals;
}

// ---------------------------------------------------------------------------
// Risk labels (confirmed outcomes for model calibration)
// ---------------------------------------------------------------------------

export type RiskLabel =
  | 'confirmed_fraud' | 'confirmed_ato' | 'confirmed_scam_victim' | 'policy_abuse'
  | 'legitimate' | 'false_positive' | 'user_cancelled'
  | 'insufficient_evidence' | 'provider_pending' | 'dispute_pending' | 'appeal_pending'
  | 'reversed_on_appeal';

/**
 * Record a confirmed outcome label. Unresolved queue state is never a
 * negative training label — only confirmed outcomes are labeled.
 */
export async function recordRiskLabel(
  db: Pool,
  input: {
    eventId?: string;
    decisionId?: string;
    caseId?: string;
    label: RiskLabel;
    labelSource: 'provider_chargeback' | 'case_review' | 'user_confirmation' | 'law_enforcement' | 'rule_proxy' | 'operator_review';
    confidence?: number;
    reviewerId?: string;
    reversalOfLabelId?: string;
  },
): Promise<void> {
  const maturityDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7-day maturity
  await db.query(
    `INSERT INTO risk_labels (event_id, decision_id, case_id, label, label_source,
       maturity_date, confidence, reviewer_id, reversal_of_label_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      input.eventId ?? null,
      input.decisionId ?? null,
      input.caseId ?? null,
      input.label,
      input.labelSource,
      maturityDate,
      input.confidence ?? 1.0,
      input.reviewerId ?? null,
      input.reversalOfLabelId ?? null,
    ],
  );
}

// ---------------------------------------------------------------------------
// Risk overrides (scoped, expiring, audited)
// ---------------------------------------------------------------------------

/**
 * Create a scoped, expiring risk override. Never permanent — every override
 * has a reason, approver, expiry and usage tracking.
 */
export async function createRiskOverride(
  db: Pool,
  input: {
    scopeType: 'user' | 'device' | 'ip_range' | 'listing' | 'payment_instrument' | 'payout_destination' | 'event_type';
    scopeRef: string;
    actionOverride: RiskAction;
    reason: string;
    approverId: string;
    expiresAt: string;
  },
): Promise<{ overrideId: string }> {
  const overrideId = `risk_override_${crypto.randomUUID()}`;
  await db.query(
    `INSERT INTO risk_overrides (override_id, scope_type, scope_ref, action_override,
       reason, approver_id, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      overrideId,
      input.scopeType,
      input.scopeRef,
      input.actionOverride,
      input.reason,
      input.approverId,
      input.expiresAt,
    ],
  );
  return { overrideId };
}

/**
 * Get active overrides for a scope. Expired or revoked overrides are inert.
 */
export async function getActiveOverrides(
  db: Pool,
  scopeType: string,
  scopeRef: string,
): Promise<Array<{
  overrideId: string;
  actionOverride: RiskAction;
  reason: string;
  expiresAt: string;
}>> {
  const result = await db.query(
    `SELECT override_id, action_override, reason, expires_at
     FROM risk_overrides
     WHERE scope_type = $1 AND scope_ref = $2
       AND revoked_at IS NULL AND expires_at > NOW()
     ORDER BY expires_at ASC`,
    [scopeType, scopeRef],
  );
  return result.rows.map((r) => ({
    overrideId: r.override_id,
    actionOverride: r.action_override,
    reason: r.reason,
    expiresAt: r.expires_at,
  }));
}

/**
 * Revoke a risk override.
 */
export async function revokeRiskOverride(
  db: Pool,
  input: { overrideId: string; revokedBy: string; reason: string },
): Promise<void> {
  await db.query(
    `UPDATE risk_overrides SET revoked_at = NOW(), revoked_by = $2, revoked_reason = $3
     WHERE override_id = $1 AND revoked_at IS NULL`,
    [input.overrideId, input.revokedBy, input.reason],
  );
}

// ---------------------------------------------------------------------------
// User-safe intervention state (FR-11 — replaces user-facing score/signal)
// ---------------------------------------------------------------------------

/**
 * User-safe intervention state. This is what users see instead of numeric
 * risk scores, raw signals and device hashes (FR-11).
 *
 * The user receives:
 * - intervention state (what is happening to their account)
 * - reason family (plain-language, not internal taxonomy)
 * - next action (what they can do)
 * - appeal/support route
 *
 * They NEVER see:
 * - numeric risk scores
 * - model labels
 * - surveillance-like device details
 * - internal signal/rule IDs
 */
export interface UserSafeInterventionState {
  state: 'normal' | 'verification_required' | 'review_in_progress' | 'account_secured' | 'access_limited';
  reasonFamily: string;  // plain-language, never internal taxonomy
  nextAction: {
    label: string;
    route: string;
  };
  supportRoute: string;
  impactedCapabilities: string[];  // e.g. ['payout_changes', 'withdrawals']
}

/**
 * Get the user-safe intervention state for a user. This replaces the old
 * /fraud/score/:userId and /fraud/signals/:userId endpoints that exposed
 * internal risk scores and device hashes to regular users (FR-11).
 */
export async function getUserSafeInterventionState(
  db: Pool,
  userId: string,
): Promise<UserSafeInterventionState> {
  // Check for active compromise case
  const compromiseResult = await db.query(
    `SELECT state FROM account_compromise_cases
     WHERE user_id = $1 AND state NOT IN ('closed_genuine', 'closed_compromised')
     ORDER BY created_at DESC LIMIT 1`,
    [userId],
  );

  if (compromiseResult.rowCount && compromiseResult.rowCount > 0) {
    const state = compromiseResult.rows[0].state;
    if (state === 'contained' || state === 'recovery_in_progress') {
      return {
        state: 'access_limited',
        reasonFamily: 'We detected unusual activity on your account and are keeping it safe.',
        nextAction: {
          label: 'Secure your account',
          route: '/account-security/recovery',
        },
        supportRoute: '/support',
        impactedCapabilities: ['payout_changes', 'withdrawals', 'protected_field_changes'],
      };
    }
    if (state === 'restored_monitored') {
      return {
        state: 'account_secured',
        reasonFamily: 'Your account was secured after unusual activity. Some actions are temporarily limited.',
        nextAction: {
          label: 'Review recent access',
          route: '/account-security/sessions',
        },
        supportRoute: '/support',
        impactedCapabilities: ['payout_changes'],
      };
    }
  }

  // Check for active payout/withdrawal holds
  const userResult = await db.query(
    `SELECT payout_change_cooldown_until, withdrawal_hold_until FROM users WHERE id = $1`,
    [userId],
  );

  if (userResult.rowCount && userResult.rowCount > 0) {
    const user = userResult.rows[0];
    const now = new Date();
    const impacted: string[] = [];

    if (user.payout_change_cooldown_until && new Date(user.payout_change_cooldown_until) > now) {
      impacted.push('payout_changes');
    }
    if (user.withdrawal_hold_until && new Date(user.withdrawal_hold_until) > now) {
      impacted.push('withdrawals');
    }

    if (impacted.length > 0) {
      return {
        state: 'review_in_progress',
        reasonFamily: 'Some account actions are temporarily limited for your security.',
        nextAction: {
          label: 'Review details',
          route: '/account-security',
        },
        supportRoute: '/support',
        impactedCapabilities: impacted,
      };
    }
  }

  // Check for active risk cases
  const caseResult = await db.query(
    `SELECT case_type FROM risk_cases
     WHERE $1 = ANY(subject_refs) AND status IN ('open', 'in_review', 'on_hold')
     LIMIT 1`,
    [userId],
  );

  if (caseResult.rowCount && caseResult.rowCount > 0) {
    return {
      state: 'review_in_progress',
      reasonFamily: 'We are reviewing some activity on your account.',
      nextAction: {
        label: 'View details',
        route: '/account-security',
      },
      supportRoute: '/support',
      impactedCapabilities: [],
    };
  }

  return {
    state: 'normal',
    reasonFamily: '',
    nextAction: { label: '', route: '' },
    supportRoute: '/support',
    impactedCapabilities: [],
  };
}
