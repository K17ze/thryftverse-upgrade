import type { Pool } from 'pg';
import { logger } from './logger.js';
import { queueUserNotification } from './workerRuntime.js';
import type { SafetyDecision } from './safetyCaseService.js';

// ── Safety outcome notifications ─────────────────────────────────────────
//
// When a moderator records a decision on a safety case, the original reporter
// is owed an outcome notification. This closes the loop promised on the report
// confirmation screen ("We'll review and let you know the outcome").
//
// Notifications are persisted to the canonical notification_events table and
// surface in the user's notification centre. Delivery is best-effort: a
// notification failure never rolls back a decision.

export interface OutcomeNotificationInput {
  caseId: string;
  reporterId: string | null;
  decision: SafetyDecision;
  reasonCode: string;
  automatedMeans: boolean;
}

/**
 * Send an outcome notification to the reporter when a decision is recorded.
 * Best-effort: if the insert fails, the decision still stands.
 */
export async function sendOutcomeNotification(
  db: Pool,
  input: OutcomeNotificationInput,
): Promise<void> {
  if (!input.reporterId) return; // anonymous report — no one to notify

  try {
    // Route through the canonical pipeline — push job, realtime publish,
    // preference bookkeeping — instead of a bare in_app insert that could
    // never deliver. safety_outcome is a critical event type: the reporter
    // is owed the outcome, so it pushes even if the news toggle is off.
    await queueUserNotification({
      userId: input.reporterId,
      title: notificationTitle(input.decision),
      body: notificationBody(input.decision, input.reasonCode),
      eventType: 'safety_outcome',
      payload: {
        caseId: input.caseId,
        decision: input.decision,
        reasonCode: input.reasonCode,
      },
      metadata: { source: 'safety', automated: input.automatedMeans },
      idempotencyKey: `safety_outcome:${input.caseId}`,
      forcePush: true,
    });
  } catch (error) {
    // Best-effort: log and continue. The decision is already committed.
    logger.warn(
      { error, caseId: input.caseId },
      'safetyNotifications: failed to persist outcome notification',
    );
  }
}

export interface BuyerRemovalNotificationInput {
  caseId: string;
  orderId: string;
  buyerId: string;
  listingId: string;
  reasonCode: string;
  automatedMeans: boolean;
}

/**
 * Notify a buyer that an item they ordered was removed/quarantined for a
 * safety or prohibited-items violation (R87 — DSA illegal-item buyer
 * notice). The reporter is not the only affected party: a buyer holding
 * an open order on a removed listing is owed the same closure.
 *
 * One notification per affected order, deduped on
 * notification_events (user_id, idempotency_key) — the key is derived
 * from (case, order) so a re-recorded outcome or a repeated enforcement
 * execution can never double-notify.
 *
 * The copy is deliberately factual: the outcome path does NOT cancel or
 * refund the order, so the notice points at the order/support flow rather
 * than promising an action that never happens.
 *
 * Best-effort like the reporter notice: a failure never rolls back the
 * outcome that triggered it.
 */
export async function sendBuyerRemovalNotification(
  db: Pool,
  input: BuyerRemovalNotificationInput,
): Promise<void> {
  try {
    await queueUserNotification({
      userId: input.buyerId,
      title: 'Item removed',
      body: 'An item you purchased was removed from sale after a safety review found it breached our prohibited-items policy. Your order is affected — open it to contact support about a refund.',
      eventType: 'safety_outcome',
      payload: {
        caseId: input.caseId,
        listingId: input.listingId,
        orderId: input.orderId,
        reasonCode: input.reasonCode,
      },
      route: { screen: 'OrderDetail', params: { orderId: input.orderId } },
      metadata: { source: 'safety', automated: input.automatedMeans },
      idempotencyKey: `safety_buyer_removal:${input.caseId}:${input.orderId}`,
      forcePush: true,
    });
  } catch (error) {
    // Best-effort: log and continue. The outcome is already committed.
    logger.warn(
      { error, caseId: input.caseId, orderId: input.orderId },
      'safetyNotifications: failed to persist buyer removal notification',
    );
  }
}

function notificationTitle(decision: SafetyDecision): string {
  switch (decision) {
    case 'no_violation':
      return 'Report reviewed';
    case 'restrict':
      return 'Action taken';
    case 'emergency_hold':
      return 'Content held';
    case 'escalate':
      return 'Report escalated';
    default:
      return 'Report reviewed';
  }
}

function notificationBody(decision: SafetyDecision, reasonCode: string): string {
  if (decision === 'no_violation') {
    return 'We reviewed your report. No policy violation was found.';
  }
  const reason = reasonCode.replace(/_/g, ' ');
  return `We reviewed your report and took action (${reason}).`;
}
