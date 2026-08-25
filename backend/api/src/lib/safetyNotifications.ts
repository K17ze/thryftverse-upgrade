import crypto from 'node:crypto';
import type { Pool } from 'pg';
import { logger } from './logger.js';
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
    const eventId = `notif_${crypto.randomUUID()}`;
    const idempotencyKey = `safety_outcome:${input.caseId}`;

    await db.query(
      `INSERT INTO notification_events (
         id, user_id, channel, title, body, payload, status, metadata,
         event_type, idempotency_key
       ) VALUES ($1, $2, 'in_app', $3, $4, $5::jsonb, 'sent', $6::jsonb, 'safety_outcome', $7)
       ON CONFLICT (user_id, idempotency_key)
       WHERE idempotency_key IS NOT NULL
       DO NOTHING`,
      [
        eventId,
        input.reporterId,
        notificationTitle(input.decision),
        notificationBody(input.decision, input.reasonCode),
        JSON.stringify({
          caseId: input.caseId,
          decision: input.decision,
          reasonCode: input.reasonCode,
        }),
        JSON.stringify({ source: 'safety', automated: input.automatedMeans }),
        idempotencyKey,
      ],
    );
  } catch (error) {
    // Best-effort: log and continue. The decision is already committed.
    logger.warn(
      { error, caseId: input.caseId },
      'safetyNotifications: failed to persist outcome notification',
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
