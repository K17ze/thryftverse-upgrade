/**
 * Governed ML promotion gate for the ThryftVerse fraud detection system.
 *
 * The rule-based engine is the champion (primary decision system). A shadow
 * ML model scores in parallel via `fraud_scoring_ledger` for offline
 * comparison. This module implements the governance layer that determines
 * whether the shadow model is safe to promote to primary.
 *
 * Design principles (AGENTS.md §11 — Truthful, anti-AI design policy):
 * - The ML model is NEVER auto-promoted. A human operator must review the
 *   metrics and explicitly approve via `recordPromotionDecision`.
 * - The gate is conservative: the false-negative gate (< 2%) is the hardest
 *   because missing fraud is catastrophic — over-flagging is recoverable,
 *   missed fraud is not.
 * - All decisions are immutable and auditable (append-only
 *   `ml_promotion_decisions` table).
 * - The metrics computation is transparent and reproducible — every metric
 *   is derived from real, observable labels and ledger rows, never
 *   fabricated.
 * - Type-safe, no `any`.
 *
 * Data sources:
 * - `risk_labels` — confirmed outcome labels (ground truth) linked to
 *   `risk_decisions` via `decision_id`.
 * - `risk_decisions` — the rule engine's authoritative decision
 *   (recommended_action / owner_decision).
 * - `fraud_scoring_ledger` — the shadow model's score and decision for the
 *   same event, joined via `event_id`.
 */

import crypto from 'node:crypto';
import type { Pool, QueryResult } from 'pg';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Metrics captured for a promotion decision. Every field is derived from
 * real, observable data — never fabricated.
 */
export interface PromotionMetrics {
  /** Number of shadow decisions evaluated (shadow was available). */
  totalShadowDecisions: number;
  /** % of shadow decisions that agree with the rule engine's action (0-100). */
  agreementRate: number;
  /**
   * % of labeled-legitimate cases where the shadow model flagged as
   * deny/quarantine/manual_review (0-100). Over-flagging legitimate users.
   */
  falsePositiveRate: number;
  /**
   * % of labeled-confirmed-fraud/ATO cases where the shadow model allowed
   * (0-100). Missing fraud — the critical safety metric.
   */
  falseNegativeRate: number;
  /** Precision of the shadow model on labeled data (0-1). */
  precision: number;
  /** Recall of the shadow model on labeled data (0-1). */
  recall: number;
  /** Brier score calibration metric (lower is better, 0-1). */
  calibrationError: number;
  /** Timestamp the metrics were computed. */
  evaluatedAt: string;
}

/**
 * The result of a gate evaluation. `canPromote` is true only when every
 * gate passes. `blockingReasons` lists every failed gate; `warnings` lists
 * non-blocking concerns.
 */
export interface PromotionGateResult {
  canPromote: boolean;
  /** Empty when canPromote is true. Each entry names a failed gate. */
  blockingReasons: string[];
  /** Non-blocking concerns (e.g. low sample margin, borderline metric). */
  warnings: string[];
  metrics: PromotionMetrics;
  evaluatedAt: string;
}

/**
 * The decision an operator records after reviewing the gate result.
 * The ML model is only promoted when an operator explicitly chooses
 * 'promote'.
 */
export type PromotionDecision = 'promote' | 'hold' | 'reject';

/**
 * Input for recording a promotion decision. Creates an immutable audit
 * trail row in `ml_promotion_decisions`.
 */
export interface RecordPromotionDecisionInput {
  metrics: PromotionMetrics;
  gateResult: PromotionGateResult;
  decision: PromotionDecision;
  operatorId: string;
  justification: string;
}

/**
 * A persisted promotion decision row from `ml_promotion_decisions`.
 */
export interface PromotionDecisionRecord {
  id: string;
  metrics: PromotionMetrics;
  gateResult: PromotionGateResult;
  decision: PromotionDecision;
  operatorId: string;
  justification: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Gate thresholds
// ---------------------------------------------------------------------------

/**
 * Configurable gate thresholds. Defaults are conservative — the
 * false-negative gate is the hardest because missing fraud is catastrophic.
 */
export interface PromotionGateOptions {
  /** Evaluation window in days (default: 30). */
  windowDays?: number;
  /** Minimum labeled decisions required (default: 1000). */
  minSampleSize?: number;
  /** Minimum agreement rate with rule engine, 0-100 (default: 85). */
  minAgreementRate?: number;
  /** Maximum false-negative rate, 0-100 (default: 2). */
  maxFalseNegativeRate?: number;
  /** Maximum false-positive rate, 0-100 (default: 15). */
  maxFalsePositiveRate?: number;
  /** Minimum precision, 0-1 (default: 0.7). */
  minPrecision?: number;
  /** Minimum recall, 0-1 (default: 0.8). */
  minRecall?: number;
  /** Maximum Brier score (default: 0.15). */
  maxCalibrationError?: number;
}

const DEFAULT_OPTIONS: Required<PromotionGateOptions> = {
  windowDays: 30,
  minSampleSize: 1000,
  minAgreementRate: 85,
  maxFalseNegativeRate: 2,
  maxFalsePositiveRate: 15,
  minPrecision: 0.7,
  minRecall: 0.8,
  maxCalibrationError: 0.15,
};

// ---------------------------------------------------------------------------
// Internal row type for the metrics query
// ---------------------------------------------------------------------------

interface MetricsRow {
  label: string;
  shadow_decision: string | null;
  shadow_score: string | null;
  rule_engine_action: string | null;
  rule_owner_decision: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Classify a shadow decision into a risk band comparable to the rule
 * engine's action.
 *
 * Shadow decisions (from fraud_scoring_ledger):
 *   auto_approve → low (allow)
 *   review       → medium (step_up / manual_review)
 *   auto_block   → high (deny / quarantine)
 */
function shadowDecisionBand(
  decision: string | null,
): 'low' | 'medium' | 'high' | 'unknown' {
  if (decision === 'auto_approve') return 'low';
  if (decision === 'review') return 'medium';
  if (decision === 'auto_block') return 'high';
  return 'unknown';
}

/**
 * Classify a rule engine action into a risk band comparable to the shadow
 * model's decision.
 *
 * Rule engine actions (from risk_decisions):
 *   allow / allow_with_limits        → low
 *   step_up / delay / manual_review  → medium
 *   quarantine / deny                 → high
 */
function ruleActionBand(action: string | null): 'low' | 'medium' | 'high' | 'unknown' {
  if (action === null) return 'unknown';
  if (action === 'allow' || action === 'allow_with_limits') return 'low';
  if (action === 'step_up' || action === 'delay' || action === 'manual_review') return 'medium';
  if (action === 'quarantine' || action === 'deny') return 'high';
  return 'unknown';
}

/**
 * Whether the shadow model's decision "allowed" the event (low band).
 * Used for false-negative computation — the model missed real fraud.
 */
function shadowAllowed(decision: string | null): boolean {
  return shadowDecisionBand(decision) === 'low';
}

/**
 * Whether the shadow model's decision "flagged" the event (medium/high band).
 * Used for false-positive computation — the model over-flagged a legitimate
 * user.
 */
function shadowFlagged(decision: string | null): boolean {
  const band = shadowDecisionBand(decision);
  return band === 'medium' || band === 'high';
}

/**
 * Ground-truth label is confirmed fraud or ATO.
 */
function isConfirmedFraud(label: string): boolean {
  return label === 'confirmed_fraud' || label === 'confirmed_ato';
}

/**
 * Ground-truth label is legitimate (true negative).
 */
function isLegitimate(label: string): boolean {
  return label === 'legitimate' || label === 'false_positive';
}

// ---------------------------------------------------------------------------
// evaluatePromotionGate
// ---------------------------------------------------------------------------

/**
 * Evaluate the ML promotion gate by querying labeled data and computing
 * metrics over a configurable time window.
 *
 * The query joins `risk_labels` with `risk_decisions` (rule engine's
 * decision) and `fraud_scoring_ledger` (shadow model's score/decision) to
 * compare the shadow model's recommendation against both the rule engine
 * and the confirmed ground-truth label.
 *
 * All gates must pass for `canPromote = true`. The ML model is never
 * auto-promoted — this function only computes the gate result. A human
 * operator must call `recordPromotionDecision` to act on it.
 */
export async function evaluatePromotionGate(
  db: Pool,
  options?: PromotionGateOptions,
): Promise<PromotionGateResult> {
  const opts: Required<PromotionGateOptions> = { ...DEFAULT_OPTIONS, ...options };
  const evaluatedAt = new Date().toISOString();

  // Join risk_labels → risk_decisions (rule engine) → fraud_scoring_ledger
  // (shadow model) over the configured window. Only rows where the shadow
  // model was available (shadow_decision IS NOT NULL) are counted as shadow
  // decisions. Labels are the ground truth.
  const result: QueryResult<MetricsRow> = await db.query(
    `SELECT
       rl.label              AS label,
       fsl.shadow_decision   AS shadow_decision,
       fsl.shadow_score      AS shadow_score,
       rd.recommended_action AS rule_engine_action,
       rd.owner_decision     AS rule_owner_decision
     FROM risk_labels rl
     JOIN risk_decisions rd ON rl.decision_id = rd.decision_id
     JOIN fraud_scoring_ledger fsl ON fsl.event_id = rd.event_id
     WHERE rl.created_at >= NOW() - ($1 || ' days')::INTERVAL
       AND fsl.shadow_decision IS NOT NULL
       AND rl.label IN (
         'confirmed_fraud', 'confirmed_ato',
         'confirmed_scam_victim', 'policy_abuse',
         'legitimate', 'false_positive', 'user_cancelled'
       )`,
    [String(opts.windowDays)],
  );

  const rows = result.rows;
  const totalShadowDecisions = rows.length;

  // -----------------------------------------------------------------------
  // Compute metrics
  // -----------------------------------------------------------------------

  // Agreement rate: shadow band == rule engine band
  let agreements = 0;
  for (const row of rows) {
    const shadowBand = shadowDecisionBand(row.shadow_decision);
    const ruleBand = ruleActionBand(row.rule_owner_decision ?? row.rule_engine_action);
    if (shadowBand !== 'unknown' && ruleBand !== 'unknown' && shadowBand === ruleBand) {
      agreements++;
    }
  }
  const agreementRate =
    totalShadowDecisions > 0 ? (agreements / totalShadowDecisions) * 100 : 0;

  // False negative rate: confirmed fraud/ATO that the shadow model allowed
  const confirmedFraudRows = rows.filter((r) => isConfirmedFraud(r.label));
  const falseNegatives = confirmedFraudRows.filter((r) => shadowAllowed(r.shadow_decision)).length;
  const falseNegativeRate =
    confirmedFraudRows.length > 0
      ? (falseNegatives / confirmedFraudRows.length) * 100
      : 0;

  // False positive rate: labeled legitimate that the shadow model flagged
  const legitimateRows = rows.filter((r) => isLegitimate(r.label));
  const falsePositives = legitimateRows.filter((r) => shadowFlagged(r.shadow_decision)).length;
  const falsePositiveRate =
    legitimateRows.length > 0
      ? (falsePositives / legitimateRows.length) * 100
      : 0;

  // Precision & recall (binary: fraud vs not-fraud)
  // TP = confirmed fraud/ATO that the shadow model flagged
  // FP = legitimate that the shadow model flagged
  // FN = confirmed fraud/ATO that the shadow model allowed
  const truePositives = confirmedFraudRows.filter((r) => shadowFlagged(r.shadow_decision)).length;
  const precision =
    truePositives + falsePositives > 0
      ? truePositives / (truePositives + falsePositives)
      : 0;
  const recall =
    truePositives + falseNegatives > 0
      ? truePositives / (truePositives + falseNegatives)
      : 0;

  // Calibration: Brier score = mean((shadow_score - outcome)^2)
  // outcome = 1 for confirmed fraud/ATO, 0 for legitimate
  const calibrationRows = rows.filter(
    (r) => r.shadow_score !== null && (isConfirmedFraud(r.label) || isLegitimate(r.label)),
  );
  let brierSum = 0;
  for (const row of calibrationRows) {
    const score = Number(row.shadow_score);
    const outcome = isConfirmedFraud(row.label) ? 1 : 0;
    brierSum += (score - outcome) ** 2;
  }
  const calibrationError =
    calibrationRows.length > 0 ? brierSum / calibrationRows.length : 1;

  const metrics: PromotionMetrics = {
    totalShadowDecisions,
    agreementRate,
    falsePositiveRate,
    falseNegativeRate,
    precision,
    recall,
    calibrationError,
    evaluatedAt,
  };

  // -----------------------------------------------------------------------
  // Apply gates
  // -----------------------------------------------------------------------

  const blockingReasons: string[] = [];
  const warnings: string[] = [];

  // Minimum sample size
  if (totalShadowDecisions < opts.minSampleSize) {
    blockingReasons.push(
      `Minimum sample size not met: ${totalShadowDecisions} labeled shadow decisions (required: ${opts.minSampleSize})`,
    );
  }

  // Agreement rate
  if (agreementRate < opts.minAgreementRate) {
    blockingReasons.push(
      `Agreement rate ${agreementRate.toFixed(2)}% below required ${opts.minAgreementRate}%`,
    );
  }

  // False negative rate (critical safety gate)
  if (falseNegativeRate >= opts.maxFalseNegativeRate) {
    blockingReasons.push(
      `False negative rate ${falseNegativeRate.toFixed(2)}% at or above maximum ${opts.maxFalseNegativeRate}% (critical safety gate — missing fraud is catastrophic)`,
    );
  }

  // False positive rate
  if (falsePositiveRate >= opts.maxFalsePositiveRate) {
    blockingReasons.push(
      `False positive rate ${falsePositiveRate.toFixed(2)}% at or above maximum ${opts.maxFalsePositiveRate}%`,
    );
  }

  // Precision
  if (precision < opts.minPrecision) {
    blockingReasons.push(
      `Precision ${precision.toFixed(4)} below required ${opts.minPrecision}`,
    );
  }

  // Recall
  if (recall < opts.minRecall) {
    blockingReasons.push(
      `Recall ${recall.toFixed(4)} below required ${opts.minRecall}`,
    );
  }

  // Calibration (Brier score)
  if (calibrationError >= opts.maxCalibrationError) {
    blockingReasons.push(
      `Calibration error (Brier score) ${calibrationError.toFixed(4)} at or above maximum ${opts.maxCalibrationError}`,
    );
  }

  // Non-blocking warnings
  if (totalShadowDecisions > 0 && totalShadowDecisions < opts.minSampleSize * 1.5) {
    warnings.push(
      `Sample size (${totalShadowDecisions}) is within 50% of the minimum threshold — collect more data for a stable decision`,
    );
  }
  if (agreementRate >= opts.minAgreementRate && agreementRate < opts.minAgreementRate + 5) {
    warnings.push(
      `Agreement rate (${agreementRate.toFixed(2)}%) is within 5% of the threshold — monitor for drift`,
    );
  }
  if (falseNegativeRate >= opts.maxFalseNegativeRate * 0.5 && falseNegativeRate < opts.maxFalseNegativeRate) {
    warnings.push(
      `False negative rate (${falseNegativeRate.toFixed(2)}%) is above 50% of the maximum — approaching the critical safety limit`,
    );
  }
  if (calibrationRows.length === 0) {
    warnings.push(
      'No rows with both a shadow score and a fraud/legitimate label were available for calibration — Brier score defaulted to 1.0',
    );
  }

  return {
    canPromote: blockingReasons.length === 0,
    blockingReasons,
    warnings,
    metrics,
    evaluatedAt,
  };
}

// ---------------------------------------------------------------------------
// recordPromotionDecision
// ---------------------------------------------------------------------------

/**
 * Record a promotion decision in the immutable `ml_promotion_decisions`
 * audit table. This is the ONLY way the ML model can be promoted — a human
 * operator must explicitly choose 'promote' after reviewing the gate
 * result.
 *
 * The row is append-only; it is never updated or deleted. This creates an
 * immutable audit trail for ML governance.
 */
export async function recordPromotionDecision(
  db: Pool,
  input: RecordPromotionDecisionInput,
): Promise<{ decisionId: string; createdAt: string }> {
  const decisionId = `ml_promo_${crypto.randomUUID()}`;
  const createdAt = new Date().toISOString();

  await db.query(
    `INSERT INTO ml_promotion_decisions
       (decision_id, metrics_json, gate_result_json, decision, operator_id, justification)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      decisionId,
      JSON.stringify(input.metrics),
      JSON.stringify(input.gateResult),
      input.decision,
      input.operatorId,
      input.justification,
    ],
  );

  return { decisionId, createdAt };
}

// ---------------------------------------------------------------------------
// getLatestPromotionDecision
// ---------------------------------------------------------------------------

/**
 * Return the most recent promotion decision, or null if none exists.
 */
export async function getLatestPromotionDecision(
  db: Pool,
): Promise<PromotionDecisionRecord | null> {
  const result = await db.query(
    `SELECT decision_id, metrics_json, gate_result_json, decision,
            operator_id, justification, created_at
     FROM ml_promotion_decisions
     ORDER BY created_at DESC
     LIMIT 1`,
  );

  if (!result.rowCount || result.rowCount === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    id: row.decision_id,
    metrics: typeof row.metrics_json === 'string'
      ? (JSON.parse(row.metrics_json) as PromotionMetrics)
      : (row.metrics_json as PromotionMetrics),
    gateResult: typeof row.gate_result_json === 'string'
      ? (JSON.parse(row.gate_result_json) as PromotionGateResult)
      : (row.gate_result_json as PromotionGateResult),
    decision: row.decision as PromotionDecision,
    operatorId: row.operator_id,
    justification: row.justification,
    createdAt: row.created_at,
  };
}
