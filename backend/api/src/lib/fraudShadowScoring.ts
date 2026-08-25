/**
 * Fraud shadow scoring service.
 *
 * Wraps the shadow ML fraud model (served by the ml-service) and logs both
 * the rule-engine and shadow scores to `fraud_scoring_ledger` for offline
 * comparison and calibration.
 *
 * Design (AGENTS.md §11 — Truthful, §10 — No black-box AI claims):
 * - The shadow score NEVER affects the user-facing fraud decision. The rule
 *   engine remains the champion until the shadow model is promoted via the
 *   model artifact registry (migration 144).
 * - If the shadow model is unavailable (ml-service down, no model loaded,
 *   timeout), `agreement = 'shadow_unavailable'` and the shadow fields are
 *   null. This is the honest placeholder — no fabricated scores.
 * - All scores are logged for audit and offline evaluation.
 * - The shadow call is non-blocking and best-effort: if it fails, the rule
 *   engine result stands unchanged.
 *
 * 2026 fraud ML best practices (researched August 2026):
 * - Shadow deployment is the standard first step for fraud models whose
 *   failure mode is expensive (DoorDash dark-shipping, Stripe Radar).
 * - Gradient boosted trees (LightGBM/XGBoost) are the production baseline
 *   for tabular fraud features, with 2-10ms p95 latency.
 * - Feature engineering from rule-engine signals preserves explainability
 *   and lets champion and shadow share the same feature space.
 * - Probability calibration (isotonic regression) is applied post-training
 *   so shadow scores behave like probabilities for threshold tuning.
 */

import type { Pool } from 'pg';
import { config } from '../config.js';
import type {
  FraudCheckResult,
  FraudEventType,
  FraudRiskLevel,
  FraudAction,
  FraudSignal,
  VelocityCounts,
} from './fraudDetection.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ShadowDecision = 'auto_approve' | 'review' | 'auto_block';
export type Agreement =
  | 'agree'
  | 'disagree_rule_higher'
  | 'disagree_shadow_higher'
  | 'shadow_unavailable';

export interface ShadowScoreResult {
  score: number | null;
  decision: ShadowDecision;
  confidence: number | null;
  modelId: string | null;
  modelVersion: string | null;
  features: Record<string, number>;
  reason: string | null;
}

export interface ShadowScoreInput {
  eventId: string;
  eventType: FraudEventType;
  userId: string | null;
  ruleEngineScore: number | null;
  riskLevel: FraudRiskLevel;
  action: FraudAction | null;
  signals: FraudSignal[];
  velocity: VelocityCounts;
  accountAgeSeconds: number;
  amountGbp: number;
  deviceMultipleAccounts: number;
}

export interface ScoreComparisonSummary {
  windowHours: number;
  totalChecks: number;
  agreeCount: number;
  disagreeRuleHigherCount: number;
  disagreeShadowHigherCount: number;
  shadowUnavailableCount: number;
  agreementRate: number;
  ruleEngineScoreDistribution: {
    low: number;
    medium: number;
    high: number;
    unknown: number;
  };
  shadowScoreDistribution: {
    autoApprove: number;
    review: number;
    autoBlock: number;
    unavailable: number;
  };
  averageScoreDelta: number | null;
}

export interface DisagreementRow {
  id: string;
  eventId: string;
  eventType: FraudEventType;
  userId: string | null;
  ruleEngineScore: number | null;
  ruleEngineLevel: FraudRiskLevel;
  ruleEngineAction: FraudAction | null;
  shadowScore: number | null;
  shadowDecision: ShadowDecision | null;
  scoreDelta: number | null;
  agreement: Agreement;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Shadow scoring service
// ---------------------------------------------------------------------------

/**
 * Calls the shadow fraud model via the ml-service and logs both scores.
 *
 * The ml-service has the model loader infrastructure from Phase 2c. If no
 * shadow model is loaded there, it returns an honest placeholder.
 */
export class FraudShadowScoringService {
  private readonly db: Pool;
  private readonly mlServiceUrl: string;
  private readonly mlServiceToken: string;
  private readonly timeoutMs: number;

  constructor(opts: {
    db: Pool;
    mlServiceUrl?: string;
    mlServiceToken?: string;
    timeoutMs?: number;
  }) {
    this.db = opts.db;
    this.mlServiceUrl = opts.mlServiceUrl ?? config.decisionServiceUrl;
    this.mlServiceToken = opts.mlServiceToken ?? config.decisionServiceToken;
    this.timeoutMs = opts.timeoutMs ?? config.fraudShadowTimeoutMs;
  }

  /**
   * Call the shadow fraud model via the ml-service.
   *
   * Returns the shadow score + decision. If the ml-service is unreachable,
   * no model is loaded, or the call times out, returns an honest
   * unavailable result — never a fabricated score.
   */
  async scoreShadow(input: ShadowScoreInput): Promise<ShadowScoreResult> {
    const payload = {
      event_id: input.eventId,
      event_type: input.eventType,
      user_id: input.userId,
      rule_engine_score: input.ruleEngineScore ?? 0,
      rule_engine_level: input.riskLevel,
      rule_engine_action: input.action,
      signals: input.signals,
      velocity: input.velocity,
      account_age_seconds: input.accountAgeSeconds,
      amount_gbp: input.amountGbp,
      device_multiple_accounts: input.deviceMultipleAccounts,
    };

    try {
      const response = await fetch(`${this.mlServiceUrl}/fraud/score`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-decision-service-token': this.mlServiceToken,
        },
        signal: AbortSignal.timeout(this.timeoutMs),
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        return unavailableResult(
          extractFeatures(input),
          `ml_service_http_${response.status}`,
        );
      }

      const body = (await response.json()) as {
        score: number | null;
        decision: ShadowDecision;
        confidence: number | null;
        model_id: string | null;
        model_version: string | null;
        features: Record<string, number>;
        reason: string | null;
      };

      return {
        score: body.score,
        decision: body.decision,
        confidence: body.confidence,
        modelId: body.model_id,
        modelVersion: body.model_version,
        features: body.features ?? extractFeatures(input),
        reason: body.reason ?? null,
      };
    } catch (error) {
      // Network error, timeout, or JSON parse failure — honest unavailable.
      return unavailableResult(extractFeatures(input), 'ml_service_unreachable');
    }
  }

  /**
   * Log both the rule-engine and shadow scores to `fraud_scoring_ledger`.
   *
   * This is the durable record that enables offline comparison, calibration,
   * and eventual champion promotion.
   */
  async logScoreComparison(
    eventId: string,
    eventType: FraudEventType,
    userId: string | null,
    ruleEngineResult: FraudCheckResult,
    shadowResult: ShadowScoreResult,
    input: ShadowScoreInput,
  ): Promise<void> {
    const agreement = computeAgreement(
      ruleEngineResult.riskScore,
      shadowResult.score,
      shadowResult.reason,
    );

    const scoreDelta =
      shadowResult.score !== null && ruleEngineResult.riskScore !== null
        ? Number((shadowResult.score * 100 - ruleEngineResult.riskScore).toFixed(4))
        : null;

    try {
      await this.db.query(
        `INSERT INTO fraud_scoring_ledger (
           event_id, event_type, user_id,
           rule_engine_score, rule_engine_level, rule_engine_action,
           rule_engine_signals,
           shadow_model_id, shadow_model_version,
           shadow_score, shadow_decision, shadow_confidence, shadow_features,
           score_delta, agreement, served_decision
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12, $13::jsonb, $14, $15, 'rule_engine')`,
        [
          eventId,
          eventType,
          userId,
          ruleEngineResult.riskScore,
          ruleEngineResult.riskLevel,
          ruleEngineResult.action,
          JSON.stringify(ruleEngineResult.signals),
          shadowResult.modelId,
          shadowResult.modelVersion,
          shadowResult.score,
          shadowResult.reason ? null : shadowResult.decision,
          shadowResult.confidence,
          JSON.stringify(shadowResult.features),
          scoreDelta,
          agreement,
        ],
      );
    } catch {
      // Logging is best-effort — a ledger write failure must not break the
      // fraud check flow. The rule engine result stands regardless.
    }
  }

  /**
   * Return aggregate comparison stats over a time window.
   *
   * Enables offline agreement analysis and score distribution comparison.
   */
  async getScoreComparisonSummary(
    windowHours: number = 24,
  ): Promise<ScoreComparisonSummary> {
    const result = await this.db.query<{
      total_checks: string;
      agree_count: string;
      disagree_rule_higher_count: string;
      disagree_shadow_higher_count: string;
      shadow_unavailable_count: string;
      low_count: string;
      medium_count: string;
      high_count: string;
      unknown_count: string;
      auto_approve_count: string;
      review_count: string;
      auto_block_count: string;
      shadow_unavailable_dec_count: string;
      avg_delta: string | null;
    }>(
      `SELECT
         COUNT(*) AS total_checks,
         COUNT(*) FILTER (WHERE agreement = 'agree') AS agree_count,
         COUNT(*) FILTER (WHERE agreement = 'disagree_rule_higher') AS disagree_rule_higher_count,
         COUNT(*) FILTER (WHERE agreement = 'disagree_shadow_higher') AS disagree_shadow_higher_count,
         COUNT(*) FILTER (WHERE agreement = 'shadow_unavailable') AS shadow_unavailable_count,
         COUNT(*) FILTER (WHERE rule_engine_level = 'low') AS low_count,
         COUNT(*) FILTER (WHERE rule_engine_level = 'medium') AS medium_count,
         COUNT(*) FILTER (WHERE rule_engine_level = 'high') AS high_count,
         COUNT(*) FILTER (WHERE rule_engine_level = 'unknown') AS unknown_count,
         COUNT(*) FILTER (WHERE shadow_decision = 'auto_approve') AS auto_approve_count,
         COUNT(*) FILTER (WHERE shadow_decision = 'review') AS review_count,
         COUNT(*) FILTER (WHERE shadow_decision = 'auto_block') AS auto_block_count,
         COUNT(*) FILTER (WHERE shadow_decision IS NULL) AS shadow_unavailable_dec_count,
         AVG(score_delta) AS avg_delta
       FROM fraud_scoring_ledger
       WHERE created_at >= NOW() - ($1::int || ' hours')::interval`,
      [windowHours],
    );

    const row = result.rows[0];
    const total = Number(row?.total_checks ?? 0);
    const agree = Number(row?.agree_count ?? 0);

    return {
      windowHours,
      totalChecks: total,
      agreeCount: agree,
      disagreeRuleHigherCount: Number(row?.disagree_rule_higher_count ?? 0),
      disagreeShadowHigherCount: Number(row?.disagree_shadow_higher_count ?? 0),
      shadowUnavailableCount: Number(row?.shadow_unavailable_count ?? 0),
      agreementRate: total > 0 ? Number((agree / total).toFixed(4)) : 0,
      ruleEngineScoreDistribution: {
        low: Number(row?.low_count ?? 0),
        medium: Number(row?.medium_count ?? 0),
        high: Number(row?.high_count ?? 0),
        unknown: Number(row?.unknown_count ?? 0),
      },
      shadowScoreDistribution: {
        autoApprove: Number(row?.auto_approve_count ?? 0),
        review: Number(row?.review_count ?? 0),
        autoBlock: Number(row?.auto_block_count ?? 0),
        unavailable: Number(row?.shadow_unavailable_dec_count ?? 0),
      },
      averageScoreDelta:
        row?.avg_delta !== null && row?.avg_delta !== undefined
          ? Number(row.avg_delta)
          : null,
    };
  }

  /**
   * Return cases where the rule engine and shadow model disagreed, for
   * manual review and offline analysis.
   */
  async getDisagreements(
    limit: number = 50,
    offset: number = 0,
  ): Promise<{ rows: DisagreementRow[]; total: number }> {
    const countResult = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) AS count
       FROM fraud_scoring_ledger
       WHERE agreement IN ('disagree_rule_higher', 'disagree_shadow_higher')`,
    );
    const total = Number(countResult.rows[0]?.count ?? 0);

    const result = await this.db.query<{
      id: string;
      event_id: string;
      event_type: FraudEventType;
      user_id: string | null;
      rule_engine_score: number | null;
      rule_engine_level: FraudRiskLevel;
      rule_engine_action: FraudAction | null;
      shadow_score: string | null;
      shadow_decision: ShadowDecision | null;
      score_delta: string | null;
      agreement: Agreement;
      created_at: Date;
    }>(
      `SELECT id, event_id, event_type, user_id,
              rule_engine_score, rule_engine_level, rule_engine_action,
              shadow_score, shadow_decision, score_delta, agreement, created_at
       FROM fraud_scoring_ledger
       WHERE agreement IN ('disagree_rule_higher', 'disagree_shadow_higher')
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    );

    return {
      total,
      rows: result.rows.map((row) => ({
        id: row.id,
        eventId: row.event_id,
        eventType: row.event_type,
        userId: row.user_id,
        ruleEngineScore: row.rule_engine_score,
        ruleEngineLevel: row.rule_engine_level,
        ruleEngineAction: row.rule_engine_action,
        shadowScore: row.shadow_score !== null ? Number(row.shadow_score) : null,
        shadowDecision: row.shadow_decision,
        scoreDelta: row.score_delta !== null ? Number(row.score_delta) : null,
        agreement: row.agreement,
        createdAt: row.created_at.toISOString(),
      })),
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function unavailableResult(
  features: Record<string, number>,
  reason: string,
): ShadowScoreResult {
  return {
    score: null,
    decision: 'review',
    confidence: null,
    modelId: null,
    modelVersion: null,
    features,
    reason,
  };
}

/**
 * Extract the feature vector from the rule-engine result, mirroring the
 * ml-service's `extract_fraud_features`. This is used as a fallback when
 * the ml-service is unreachable so the ledger still records the features.
 */
function extractFeatures(input: ShadowScoreInput): Record<string, number> {
  const signalRuleIds = new Set(
    input.signals.map((s) => s.ruleId),
  );
  return {
    rule_engine_score: input.ruleEngineScore ?? 0,
    signal_count: input.signals.length,
    velocity_account_creation: input.velocity.accountCreation,
    velocity_listing_creation: input.velocity.listingCreation,
    velocity_message: input.velocity.message,
    velocity_login_attempt: input.velocity.loginAttempt,
    account_age_seconds: Math.max(-1, input.accountAgeSeconds),
    amount_gbp: Math.max(0, input.amountGbp),
    ip_blacklisted: signalRuleIds.has('ip.blacklist') ? 1 : 0,
    disposable_email: signalRuleIds.has('email.disposable_domain') ? 1 : 0,
    new_account: input.accountAgeSeconds >= 0 && input.accountAgeSeconds < 86400 ? 1 : 0,
    missing_user_agent: signalRuleIds.has('behavioral.missing_user_agent') ? 1 : 0,
    device_multiple_accounts: input.deviceMultipleAccounts,
    high_value_new_account: signalRuleIds.has('transaction.high_value_new_account') ? 1 : 0,
  };
}

/**
 * Compute the agreement classification between the rule engine and shadow.
 *
 * - agree: both paths reach the same risk band (within 15 points).
 * - disagree_rule_higher: rule engine is more suspicious than the shadow.
 * - disagree_shadow_higher: shadow is more suspicious than the rule engine.
 * - shadow_unavailable: no shadow score (model not loaded or call failed).
 */
function computeAgreement(
  ruleEngineScore: number | null,
  shadowScore: number | null,
  shadowReason: string | null,
): Agreement {
  if (shadowScore === null || shadowReason !== null) {
    return 'shadow_unavailable';
  }
  if (ruleEngineScore === null) {
    // Rule engine was unavailable but shadow scored — treat as disagree
    // since we can't compare. This is an edge case that should be rare.
    return 'disagree_shadow_higher';
  }
  const shadowScore100 = shadowScore * 100;
  const delta = shadowScore100 - ruleEngineScore;
  if (Math.abs(delta) < 15) {
    return 'agree';
  }
  return delta > 0 ? 'disagree_shadow_higher' : 'disagree_rule_higher';
}
