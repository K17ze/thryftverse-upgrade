/**
 * Account-takeover (ATO) state machine service for ThryftVerse.
 *
 * Implements the containment and recovery path identified as the principal
 * ATO blocker by the fraud/scams/ATO flagship analysis (2026-08-25).
 * Migration 155 introduced the `account_compromise_cases` table and the
 * `protected_change_history` table; this module is the domain owner that
 * drives the state machine and enforces selective, reversible containment.
 *
 * ## State machine
 *
 * ```
 *   NORMAL -> SUSPECTED -> CONTAINED -> RECOVERY_IN_PROGRESS
 *          -> RESTORED_MONITORED -> CLOSED_GENUINE | CLOSED_COMPROMISED
 *
 *   Any state -> ESCALATED when money/order loss, identity conflict or
 *   operator risk exists.
 * ```
 *
 * `NORMAL` is the implicit resting state represented on `users.account_risk_state`
 * as `'normal'` with no active case row. The remaining states are persisted
 * both on the user row (`account_risk_state`) and on the
 * `account_compromise_cases` row (`state`).
 *
 * ## Containment invariants (from the analysis report)
 *
 * - Revoke suspicious sessions first; preserve a known-good session where safe.
 * - Freeze payout-destination changes and withdrawals, NOT browsing, evidence
 *   collection or support access.
 * - Preserve old email, phone and payout values with reversible change history.
 * - Notify the previously established channel, never only the newly changed one.
 * - Provide "This wasn't me" using signed, single-purpose, short-lived recovery
 *   tokens (handled by the auth/recovery layer; this service records the method).
 * - Require recent strong authentication before removing passkeys/MFA or changing
 *   recovery methods (enforced by the auth layer via risk decisions).
 * - Keep a cooling period after restoration; a recovered login cannot immediately
 *   drain funds.
 *
 * ## Design principles (AGENTS.md §11 — Truthful, anti-AI design policy)
 *
 * - Every state transition is recorded as an append-only case event.
 * - Containment is selective and reversible — never a blanket account lock.
 * - Non-critical persistence failures are logged but do not throw, so a
 *   degraded audit trail never blocks a safety-critical containment action.
 * - Token hashes are never exposed by query operations.
 */

import crypto from 'node:crypto';
import { db } from '../db/pool.js';
import { addCaseEvent, createRiskCase } from './riskDecision.js';
import { encryptJsonPayload, decryptJsonPayload } from './keyService.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The ATO state machine states. These mirror the CHECK constraint on
 * `account_compromise_cases.state` plus the implicit `normal` resting state
 * stored only on `users.account_risk_state`.
 */
export type AccountCompromiseState =
  | 'normal'
  | 'suspected'
  | 'contained'
  | 'recovery_in_progress'
  | 'restored_monitored'
  | 'closed_genuine'
  | 'closed_compromised'
  | 'escalated';

/**
 * How the compromise was detected. Mirrors the CHECK constraint on
 * `account_compromise_cases.detected_by`.
 */
export type CompromiseDetectionSource =
  | 'unusual_session'
  | 'unusual_recovery'
  | 'protected_field_change'
  | 'payout_destination_change'
  | 'user_report'
  | 'operator_review'
  | 'provider_alert'
  | 'graph_link';

/**
 * The recovery method used to restore the account. Mirrors the CHECK
 * constraint on `account_compromise_cases.recovery_method`.
 */
export type RecoveryMethod =
  | 'trusted_channel'
  | 'identity_reproof'
  | 'manual_recovery'
  | 'passkey_reauth';

/**
 * The confirmed outcome of a closed compromise case. Mirrors the CHECK
 * constraint on `account_compromise_cases.outcome_label`.
 */
export type CompromiseOutcomeLabel =
  | 'confirmed_ato'
  | 'false_positive'
  | 'insufficient_evidence';

/**
 * Protected fields that are recorded in `protected_change_history`. Mirrors
 * the CHECK constraint on `protected_change_history.field_name`.
 */
export type ProtectedFieldName =
  | 'email'
  | 'phone'
  | 'password'
  | 'payout_destination'
  | 'recovery_email'
  | 'recovery_phone'
  | 'mfa_method'
  | 'passkey';

/**
 * Optional structured logger. Matches the loose shape used by
 * `riskDecision.ts` so callers can pass the same logger instance.
 */
export interface AtoLogger {
  warn?: (obj: unknown, msg: string) => void;
  info?: (obj: unknown, msg: string) => void;
}

/**
 * A row from `account_compromise_cases`.
 */
export interface AccountCompromiseCase {
  caseId: string;
  userId: string;
  riskCaseId: string | null;
  state: AccountCompromiseState;
  detectedBy: CompromiseDetectionSource;
  detectedAt: string;
  detectionSignals: unknown[];
  sessionsRevokedAt: string | null;
  sessionsRevokedCount: number | null;
  preservedSessionId: string | null;
  payoutHoldActive: boolean;
  withdrawalHoldActive: boolean;
  protectedChangeHoldActive: boolean;
  recoveryMethod: RecoveryMethod | null;
  recoveryStartedAt: string | null;
  recoveryCompletedAt: string | null;
  recoveryProof: Record<string, unknown>;
  cooldownUntil: string | null;
  monitoredUntil: string | null;
  outcomeLabel: CompromiseOutcomeLabel | null;
  lossExposureMinor: number;
  lossExposureCurrency: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

/**
 * A redacted session inventory entry. Token hashes are never included.
 */
export interface SessionInventoryEntry {
  sessionId: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  lastSeenAt: string;
  isCurrent: boolean;
  isRevoked: boolean;
}

/**
 * A recorded protected-field change from `protected_change_history`.
 */
export interface ProtectedChangeRecord {
  id: string;
  userId: string;
  fieldName: ProtectedFieldName;
  oldValueHash: string;
  newValueHash: string;
  changedAt: string;
  changedBySessionId: string | null;
  changedByIp: string | null;
  riskDecisionId: string | null;
  compromiseCaseId: string | null;
  rolledBackAt: string | null;
  rolledBackBy: string | null;
  rollbackReason: string | null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Map a snake_case database row from `account_compromise_cases` to the
 * camel-shaped `AccountCompromiseCase` interface.
 */
function mapCompromiseCaseRow(row: Record<string, unknown>): AccountCompromiseCase {
  return {
    caseId: row.case_id as string,
    userId: row.user_id as string,
    riskCaseId: (row.risk_case_id as string | null) ?? null,
    state: row.state as AccountCompromiseState,
    detectedBy: row.detected_by as CompromiseDetectionSource,
    detectedAt: row.detected_at as string,
    detectionSignals: row.detection_signals as unknown[],
    sessionsRevokedAt: (row.sessions_revoked_at as string | null) ?? null,
    sessionsRevokedCount: (row.sessions_revoked_count as number | null) ?? null,
    preservedSessionId: (row.preserved_session_id as string | null) ?? null,
    payoutHoldActive: row.payout_hold_active as boolean,
    withdrawalHoldActive: row.withdrawal_hold_active as boolean,
    protectedChangeHoldActive: row.protected_change_hold_active as boolean,
    recoveryMethod: (row.recovery_method as RecoveryMethod | null) ?? null,
    recoveryStartedAt: (row.recovery_started_at as string | null) ?? null,
    recoveryCompletedAt: (row.recovery_completed_at as string | null) ?? null,
    recoveryProof: (row.recovery_proof as Record<string, unknown>) ?? {},
    cooldownUntil: (row.cooldown_until as string | null) ?? null,
    monitoredUntil: (row.monitored_until as string | null) ?? null,
    outcomeLabel: (row.outcome_label as CompromiseOutcomeLabel | null) ?? null,
    lossExposureMinor: Number(row.loss_exposure_minor ?? 0),
    lossExposureCurrency: (row.loss_exposure_currency as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    closedAt: (row.closed_at as string | null) ?? null,
  };
}

/**
 * Map a snake_case database row from `protected_change_history` to the
 * camel-shaped `ProtectedChangeRecord` interface.
 */
function mapProtectedChangeRow(row: Record<string, unknown>): ProtectedChangeRecord {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    fieldName: row.field_name as ProtectedFieldName,
    oldValueHash: row.old_value_hash as string,
    newValueHash: row.new_value_hash as string,
    changedAt: row.changed_at as string,
    changedBySessionId: (row.changed_by_session_id as string | null) ?? null,
    changedByIp: (row.changed_by_ip as string | null) ?? null,
    riskDecisionId: (row.risk_decision_id as string | null) ?? null,
    compromiseCaseId: (row.compromise_case_id as string | null) ?? null,
    rolledBackAt: (row.rolled_back_at as string | null) ?? null,
    rolledBackBy: (row.rolled_back_by as string | null) ?? null,
    rollbackReason: (row.rollback_reason as string | null) ?? null,
  };
}

/**
 * SHA-256 hash of a protected-field value. Used for the `old_value_hash` and
 * `new_value_hash` columns so values can be compared without storing raw
 * values.
 */
function hashProtectedValue(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/**
 * Fetch a compromise case and assert it exists. Used by mutating functions
 * that have just inserted or updated a case row and need to return the
 * refreshed shape. Throws if the case vanished between the mutation and the
 * read — this should be impossible under normal operation.
 */
async function requireCompromiseCase(caseId: string): Promise<AccountCompromiseCase> {
  const caseRow = await getCompromiseCase(caseId);
  if (!caseRow) {
    throw new Error(`ATO case not found after mutation: ${caseId}`);
  }
  return caseRow;
}

/**
 * Record a state transition as an append-only case event on both the
 * `account_compromise_cases` case and the linked `risk_cases` case. Failures
 * are logged but never thrown — a degraded audit trail must not block a
 * safety-critical containment action.
 */
async function recordStateTransition(
  caseId: string,
  riskCaseId: string | null,
  fromState: AccountCompromiseState | null,
  toState: AccountCompromiseState,
  actorId: string,
  actorType: 'operator' | 'system' | 'user' | 'provider',
  reasonCode: string,
  reasonText: string,
  metadata: Record<string, unknown>,
  logger?: AtoLogger,
): Promise<void> {
  const eventPayload = {
    caseId,
    eventType: 'status_changed' as const,
    actorId,
    actorType,
    reasonCode,
    reasonText,
    fromStatus: fromState ?? undefined,
    toStatus: toState,
    metadata,
  };

  try {
    await addCaseEvent(db, eventPayload);
  } catch (err) {
    logger?.warn?.({ err, caseId, toState }, 'Failed to record ATO case event on risk_cases');
  }

  if (riskCaseId) {
    try {
      await addCaseEvent(db, { ...eventPayload, caseId: riskCaseId });
    } catch (err) {
      logger?.warn?.({ err, riskCaseId, toState }, 'Failed to record ATO case event on linked risk case');
    }
  }
}

// ---------------------------------------------------------------------------
// Containment operations
// ---------------------------------------------------------------------------

/**
 * Declare an account compromise: create an `account_compromise_cases` row in
 * the `suspected` state, link it to a durable `risk_cases` case, and set
 * `users.account_risk_state` to `'contained'`.
 *
 * This is the entry point of the containment path. It does NOT revoke
 * sessions or freeze money movement by itself — call `revokeSuspiciousSessions`,
 * `holdMoneyMovement` and `holdProtectedChanges` afterwards to apply
 * selective containment.
 *
 * @returns the newly created compromise case.
 */
export async function declareCompromise(
  input: {
    userId: string;
    detectedBy: CompromiseDetectionSource;
    detectionSignals?: Array<{ ruleId: string; description: string; weight: number; observedValue: string | number | boolean }>;
    lossExposureMinor?: number;
    lossExposureCurrency?: string;
    actorId?: string;
    reasonText?: string;
  },
  logger?: AtoLogger,
): Promise<AccountCompromiseCase> {
  const caseId = `ato_${crypto.randomUUID()}`;
  const actorId = input.actorId ?? 'system';
  const detectionSignals = input.detectionSignals ?? [];

  // 1. Create the linked durable risk case for queue management and SLA.
  let riskCaseId: string | null = null;
  try {
    const riskCase = await createRiskCase(db, {
      caseType: 'account_takeover',
      subjectRefs: [input.userId],
      lossExposureMinor: input.lossExposureMinor ?? 0,
      lossExposureCurrency: input.lossExposureCurrency,
      ownerTeam: 'trust_and_safety',
    });
    riskCaseId = riskCase.caseId;
  } catch (err) {
    logger?.warn?.({ err, userId: input.userId }, 'Failed to create linked risk case for ATO');
  }

  // 2. Insert the compromise case row in the 'suspected' state.
  await db.query(
    `INSERT INTO account_compromise_cases (
       case_id, user_id, risk_case_id, state, detected_by,
       detection_signals, loss_exposure_minor, loss_exposure_currency
     )
     VALUES ($1, $2, $3, 'suspected', $4, $5, $6, $7)`,
    [
      caseId,
      input.userId,
      riskCaseId,
      input.detectedBy,
      JSON.stringify(detectionSignals),
      input.lossExposureMinor ?? 0,
      input.lossExposureCurrency ?? null,
    ],
  );

  // 3. Set the user's account_risk_state to 'contained' and link the case.
  await db.query(
    `UPDATE users
     SET account_risk_state = 'contained',
         compromise_case_id = $2
     WHERE id = $1`,
    [input.userId, caseId],
  );

  // 4. Record the state transition events.
  await recordStateTransition(
    caseId,
    riskCaseId,
    null,
    'suspected',
    actorId,
    actorId === 'system' ? 'system' : 'operator',
    'ato_declared',
    input.reasonText ?? `Compromise declared: ${input.detectedBy}`,
    { detectedBy: input.detectedBy, detectionSignals },
    logger,
  );

  return requireCompromiseCase(caseId);
}

/**
 * Revoke suspicious sessions for a user, preserving a known-good session
 * where it is safe to do so.
 *
 * Containment invariant: revoke suspicious sessions first, but preserve a
 * known-good session so the genuine user can still reach the recovery flow.
 * If no known-good session is provided, ALL sessions are revoked — the user
 * must re-authenticate through the recovery path.
 *
 * Records the count of revoked sessions and the preserved session id on the
 * compromise case.
 *
 * @returns the number of sessions revoked.
 */
export async function revokeSuspiciousSessions(
  caseId: string,
  input: {
    preserveSessionId?: string;
    actorId?: string;
  },
  logger?: AtoLogger,
): Promise<number> {
  const actorId = input.actorId ?? 'system';
  const preserveSessionId = input.preserveSessionId ?? null;

  // Fetch the case to get the user id.
  const caseRow = await getCompromiseCase(caseId);
  if (!caseRow) {
    throw new Error(`ATO case not found: ${caseId}`);
  }

  // Count sessions that will be revoked.
  const countResult = preserveSessionId
    ? await db.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM user_sessions
         WHERE user_id = $1 AND id <> $2 AND revoked_at IS NULL`,
        [caseRow.userId, preserveSessionId],
      )
    : await db.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM user_sessions
         WHERE user_id = $1 AND revoked_at IS NULL`,
        [caseRow.userId],
      );

  const revokedCount = countResult.rows[0]?.count ?? 0;

  // Revoke user_sessions (and cascade to refresh_tokens via the auth layer).
  if (preserveSessionId) {
    await db.query(
      `UPDATE user_sessions
       SET revoked_at = NOW()
       WHERE user_id = $1 AND id <> $2 AND revoked_at IS NULL`,
      [caseRow.userId, preserveSessionId],
    );
    await db.query(
      `UPDATE refresh_tokens
       SET revoked_at = NOW()
       WHERE user_id = $1 AND session_id <> $2 AND revoked_at IS NULL`,
      [caseRow.userId, preserveSessionId],
    );
  } else {
    await db.query(
      `UPDATE user_sessions
       SET revoked_at = NOW()
       WHERE user_id = $1 AND revoked_at IS NULL`,
      [caseRow.userId],
    );
    await db.query(
      `UPDATE refresh_tokens
       SET revoked_at = NOW()
       WHERE user_id = $1 AND revoked_at IS NULL`,
      [caseRow.userId],
    );
  }

  // Record the revocation on the compromise case.
  await db.query(
    `UPDATE account_compromise_cases
     SET sessions_revoked_at = NOW(),
         sessions_revoked_count = $2,
         preserved_session_id = $3
     WHERE case_id = $1`,
    [caseId, revokedCount, preserveSessionId],
  );

  await recordStateTransition(
    caseId,
    caseRow.riskCaseId,
    caseRow.state,
    caseRow.state,
    actorId,
    actorId === 'system' ? 'system' : 'operator',
    'sessions_revoked',
    `Revoked ${revokedCount} suspicious session(s)`,
    { revokedCount, preservedSessionId: preserveSessionId },
    logger,
  );

  return revokedCount;
}

/**
 * Hold money movement by setting `payout_change_cooldown_until` and
 * `withdrawal_hold_until` on the user row.
 *
 * Containment invariant: freeze payout-destination changes and withdrawals,
 * NOT browsing, evidence collection or support access. The hold duration
 * defaults to 72 hours, giving operators time to investigate without
 * permanently locking the account.
 *
 * @returns the timestamps the holds are active until.
 */
export async function holdMoneyMovement(
  caseId: string,
  input?: {
    holdHours?: number;
    actorId?: string;
  },
  logger?: AtoLogger,
): Promise<{ payoutChangeCooldownUntil: string; withdrawalHoldUntil: string }> {
  const actorId = input?.actorId ?? 'system';
  const holdHours = input?.holdHours ?? 72;
  const holdUntil = new Date(Date.now() + holdHours * 60 * 60 * 1000).toISOString();

  const caseRow = await getCompromiseCase(caseId);
  if (!caseRow) {
    throw new Error(`ATO case not found: ${caseId}`);
  }

  await db.query(
    `UPDATE users
     SET payout_change_cooldown_until = $2,
         withdrawal_hold_until = $2
     WHERE id = $1`,
    [caseRow.userId, holdUntil],
  );

  await db.query(
    `UPDATE account_compromise_cases
     SET payout_hold_active = TRUE,
         withdrawal_hold_active = TRUE
     WHERE case_id = $1`,
    [caseId],
  );

  await recordStateTransition(
    caseId,
    caseRow.riskCaseId,
    caseRow.state,
    caseRow.state,
    actorId,
    actorId === 'system' ? 'system' : 'operator',
    'money_movement_held',
    `Payout changes and withdrawals held until ${holdUntil}`,
    { holdUntil, holdHours },
    logger,
  );

  return { payoutChangeCooldownUntil: holdUntil, withdrawalHoldUntil: holdUntil };
}

/**
 * Hold protected-field changes by setting `protected_change_hold_active` on
 * the compromise case.
 *
 * Containment invariant: protected fields (email, phone, password, payout
 * destination, recovery methods, MFA, passkeys) cannot be changed while the
 * hold is active. Browsing and support access remain available.
 */
export async function holdProtectedChanges(
  caseId: string,
  input?: { actorId?: string },
  logger?: AtoLogger,
): Promise<void> {
  const actorId = input?.actorId ?? 'system';
  const caseRow = await getCompromiseCase(caseId);
  if (!caseRow) {
    throw new Error(`ATO case not found: ${caseId}`);
  }

  await db.query(
    `UPDATE account_compromise_cases
     SET protected_change_hold_active = TRUE
     WHERE case_id = $1`,
    [caseId],
  );

  await recordStateTransition(
    caseId,
    caseRow.riskCaseId,
    caseRow.state,
    caseRow.state,
    actorId,
    actorId === 'system' ? 'system' : 'operator',
    'protected_changes_held',
    'Protected-field changes held',
    {},
    logger,
  );
}

// ---------------------------------------------------------------------------
// Recovery operations
// ---------------------------------------------------------------------------

/**
 * Start the recovery flow: transition the case to `recovery_in_progress`
 * and record the recovery method.
 *
 * The recovery method determines how the genuine user proves ownership:
 * - `trusted_channel` — notification to a previously established channel.
 * - `identity_reproof` — full identity verification (Persona/Onfido).
 * - `manual_recovery` — operator-assisted recovery with evidence.
 * - `passkey_reauth` — re-authentication with an existing passkey.
 */
export async function startRecovery(
  caseId: string,
  input: {
    recoveryMethod: RecoveryMethod;
    actorId?: string;
    reasonText?: string;
  },
  logger?: AtoLogger,
): Promise<AccountCompromiseCase> {
  const actorId = input.actorId ?? 'system';
  const caseRow = await getCompromiseCase(caseId);
  if (!caseRow) {
    throw new Error(`ATO case not found: ${caseId}`);
  }

  const fromState = caseRow.state;
  const toState: AccountCompromiseState = 'recovery_in_progress';

  await db.query(
    `UPDATE account_compromise_cases
     SET state = $2,
         recovery_method = $3,
         recovery_started_at = NOW()
     WHERE case_id = $1`,
    [caseId, toState, input.recoveryMethod],
  );

  await db.query(
    `UPDATE users SET account_risk_state = $2 WHERE id = $1`,
    [caseRow.userId, toState],
  );

  await recordStateTransition(
    caseId,
    caseRow.riskCaseId,
    fromState,
    toState,
    actorId,
    actorId === 'system' ? 'system' : 'operator',
    'recovery_started',
    input.reasonText ?? `Recovery started via ${input.recoveryMethod}`,
    { recoveryMethod: input.recoveryMethod },
    logger,
  );

  return requireCompromiseCase(caseId);
}

/**
 * Complete the recovery flow: transition the case to `restored_monitored`,
 * set a cooldown period (24h default) during which protected changes remain
 * blocked, and set a monitoring window (30 days default) during which the
 * account is watched for recurrence.
 *
 * Containment invariant: a recovered login cannot immediately drain funds.
 * The cooldown prevents a recovered session from changing payout destinations
 * or withdrawing until the cooling period elapses.
 */
export async function completeRecovery(
  caseId: string,
  input: {
    recoveryProof?: Record<string, unknown>;
    cooldownHours?: number;
    monitoredDays?: number;
    actorId?: string;
    reasonText?: string;
  },
  logger?: AtoLogger,
): Promise<AccountCompromiseCase> {
  const actorId = input.actorId ?? 'system';
  const caseRow = await getCompromiseCase(caseId);
  if (!caseRow) {
    throw new Error(`ATO case not found: ${caseId}`);
  }

  const fromState = caseRow.state;
  const toState: AccountCompromiseState = 'restored_monitored';
  const cooldownHours = input.cooldownHours ?? 24;
  const monitoredDays = input.monitoredDays ?? 30;
  const cooldownUntil = new Date(Date.now() + cooldownHours * 60 * 60 * 1000).toISOString();
  const monitoredUntil = new Date(Date.now() + monitoredDays * 24 * 60 * 60 * 1000).toISOString();
  const recoveryProof = input.recoveryProof ?? {};

  await db.query(
    `UPDATE account_compromise_cases
     SET state = $2,
         recovery_completed_at = NOW(),
         recovery_proof = $3,
         cooldown_until = $4,
         monitored_until = $5,
         payout_hold_active = FALSE,
         withdrawal_hold_active = FALSE,
         protected_change_hold_active = FALSE
     WHERE case_id = $1`,
    [caseId, toState, JSON.stringify(recoveryProof), cooldownUntil, monitoredUntil],
  );

  // Set the user cooldown so the auth/payout layer can enforce it, but clear
  // the blanket holds — the cooling period is the selective replacement.
  await db.query(
    `UPDATE users
     SET account_risk_state = $2,
         payout_change_cooldown_until = $3,
         withdrawal_hold_until = NULL
     WHERE id = $1`,
    [caseRow.userId, toState, cooldownUntil],
  );

  await recordStateTransition(
    caseId,
    caseRow.riskCaseId,
    fromState,
    toState,
    actorId,
    actorId === 'system' ? 'system' : 'operator',
    'recovery_completed',
    input.reasonText ?? 'Recovery completed; account restored under monitoring',
    { cooldownUntil, monitoredUntil, recoveryProof },
    logger,
  );

  return requireCompromiseCase(caseId);
}

/**
 * Reverse an unauthorized protected-field change using the
 * `protected_change_history` record.
 *
 * For fields stored directly on the `users` table (`email`, `phone`,
 * `password`), the old value is decrypted and restored. For fields owned by
 * other services (`payout_destination`, `recovery_email`, `recovery_phone`,
 * `mfa_method`, `passkey`), the old value is decrypted and returned so the
 * owning service can apply the reversal within its own transaction boundary —
 * this service does not directly write payout accounts or MFA factors.
 *
 * @returns the decrypted old value and whether it was applied directly.
 */
export async function rollbackProtectedChange(
  historyId: string,
  input: {
    actorId: string;
    reasonText: string;
  },
  logger?: AtoLogger,
): Promise<{ oldValue: string; appliedDirectly: boolean; fieldName: ProtectedFieldName }> {
  // 1. Fetch the history row.
  const result = await db.query<Record<string, unknown>>(
    `SELECT id, user_id, field_name, old_value_hash, new_value_hash,
            old_value_encrypted, changed_at, compromise_case_id
     FROM protected_change_history
     WHERE id = $1 AND rolled_back_at IS NULL`,
    [historyId],
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error(`Protected change not found or already rolled back: ${historyId}`);
  }

  const fieldName = row.field_name as ProtectedFieldName;
  const userId = row.user_id as string;
  const oldValueEncrypted = (row.old_value_encrypted as string | null) ?? null;
  const compromiseCaseId = (row.compromise_case_id as string | null) ?? null;

  if (!oldValueEncrypted) {
    throw new Error(`No encrypted old value stored for protected change ${historyId}; cannot roll back`);
  }

  // 2. Decrypt the old value.
  const aad = `protected_change:${userId}:${fieldName}:${row.changed_at as string}`;
  const oldValue = await decryptJsonPayload<string>(oldValueEncrypted, aad);

  // 3. Apply the reversal for direct user-column fields.
  const directColumnFields: ReadonlySet<ProtectedFieldName> = new Set([
    'email',
    'phone',
    'password',
  ]);

  let appliedDirectly = false;
  if (directColumnFields.has(fieldName)) {
    const column = fieldName === 'password' ? 'password_hash' : fieldName;
    await db.query(
      `UPDATE users SET ${column} = $2 WHERE id = $1`,
      [userId, oldValue],
    );
    appliedDirectly = true;
  }

  // 4. Mark the history row as rolled back.
  await db.query(
    `UPDATE protected_change_history
     SET rolled_back_at = NOW(),
         rolled_back_by = $2,
         rollback_reason = $3
     WHERE id = $1`,
    [historyId, input.actorId, input.reasonText],
  );

  // 5. Record a case event if linked to a compromise case.
  if (compromiseCaseId) {
    const caseRow = await getCompromiseCase(compromiseCaseId).catch(() => null);
    await recordStateTransition(
      compromiseCaseId,
      caseRow?.riskCaseId ?? null,
      caseRow?.state ?? null,
      caseRow?.state ?? 'contained',
      input.actorId,
      'operator',
      'protected_change_rolled_back',
      `Rolled back ${fieldName} change (${input.reasonText})`,
      { historyId, fieldName, appliedDirectly },
      logger,
    );
  }

  return { oldValue, appliedDirectly, fieldName };
}

// ---------------------------------------------------------------------------
// Closure operations
// ---------------------------------------------------------------------------

/**
 * Close a compromise case with a confirmed outcome.
 *
 * - `closed_genuine` — the activity was legitimate (false positive). The
 *   user's `account_risk_state` is cleared to `'normal'`.
 * - `closed_compromised` — the account was confirmed compromised. The user's
 *   `account_risk_state` is kept as `'closed_compromised'` so the account
 *   remains banned pending operator action.
 *
 * All holds and cooldowns are cleared for genuine closures. For compromised
 * closures, the holds remain in force — the account is banned.
 */
export async function closeCase(
  caseId: string,
  input: {
    outcome: 'genuine' | 'compromised';
    outcomeLabel: CompromiseOutcomeLabel;
    actorId: string;
    reasonText?: string;
  },
  logger?: AtoLogger,
): Promise<AccountCompromiseCase> {
  const caseRow = await getCompromiseCase(caseId);
  if (!caseRow) {
    throw new Error(`ATO case not found: ${caseId}`);
  }

  const fromState = caseRow.state;
  const toState: AccountCompromiseState =
    input.outcome === 'genuine' ? 'closed_genuine' : 'closed_compromised';

  await db.query(
    `UPDATE account_compromise_cases
     SET state = $2,
         outcome_label = $3,
         closed_at = NOW()
     WHERE case_id = $1`,
    [caseId, toState, input.outcomeLabel],
  );

  if (input.outcome === 'genuine') {
    // Clear all holds and restore the user to normal.
    await db.query(
      `UPDATE users
       SET account_risk_state = 'normal',
           compromise_case_id = NULL,
           payout_change_cooldown_until = NULL,
           withdrawal_hold_until = NULL
       WHERE id = $1`,
      [caseRow.userId],
    );
  } else {
    // Keep the account in the closed_compromised state (ban).
    await db.query(
      `UPDATE users
       SET account_risk_state = 'closed_compromised',
           compromise_case_id = NULL
       WHERE id = $1`,
      [caseRow.userId],
    );
  }

  await recordStateTransition(
    caseId,
    caseRow.riskCaseId,
    fromState,
    toState,
    input.actorId,
    'operator',
    'case_closed',
    input.reasonText ?? `Case closed as ${input.outcome} (${input.outcomeLabel})`,
    { outcome: input.outcome, outcomeLabel: input.outcomeLabel },
    logger,
  );

  return requireCompromiseCase(caseId);
}

/**
 * Escalate a compromise case. Any state can transition to `escalated` when
 * money/order loss, identity conflict or operator risk exists. The user's
 * `account_risk_state` is set to `'contained'` to ensure holds remain in
 * force during escalation.
 */
export async function escalateCase(
  caseId: string,
  input: {
    actorId: string;
    reasonCode: string;
    reasonText: string;
  },
  logger?: AtoLogger,
): Promise<AccountCompromiseCase> {
  const caseRow = await getCompromiseCase(caseId);
  if (!caseRow) {
    throw new Error(`ATO case not found: ${caseId}`);
  }

  const fromState = caseRow.state;
  const toState: AccountCompromiseState = 'escalated';

  await db.query(
    `UPDATE account_compromise_cases
     SET state = $2
     WHERE case_id = $1`,
    [caseId, toState],
  );

  await db.query(
    `UPDATE users SET account_risk_state = 'contained' WHERE id = $1`,
    [caseRow.userId],
  );

  await recordStateTransition(
    caseId,
    caseRow.riskCaseId,
    fromState,
    toState,
    input.actorId,
    'operator',
    input.reasonCode,
    input.reasonText,
    { escalatedFrom: fromState },
    logger,
  );

  return requireCompromiseCase(caseId);
}

// ---------------------------------------------------------------------------
// Protected change recording
// ---------------------------------------------------------------------------

/**
 * Record a protected-field change with old/new value hashes and an encrypted
 * old value for potential rollback.
 *
 * The old value is encrypted via the key service so it can be decrypted and
 * restored if the change is later judged unauthorized. The new value is
 * hashed (not encrypted) — it is only needed for comparison, not restoration.
 *
 * If encryption fails, the change is still recorded with a null
 * `old_value_encrypted` — rollback will not be possible for that change, but
 * the audit trail is preserved. This is a non-critical failure.
 *
 * @returns the history row id.
 */
export async function recordProtectedChange(
  input: {
    userId: string;
    fieldName: ProtectedFieldName;
    oldValue: string;
    newValue: string;
    changedBySessionId?: string;
    changedByIp?: string;
    riskDecisionId?: string;
    compromiseCaseId?: string;
  },
  logger?: AtoLogger,
): Promise<{ historyId: string }> {
  const oldValueHash = hashProtectedValue(input.oldValue);
  const newValueHash = hashProtectedValue(input.newValue);

  // Encrypt the old value for potential rollback.
  let oldValueEncrypted: string | null = null;
  try {
    const aad = `protected_change:${input.userId}:${input.fieldName}:${new Date().toISOString()}`;
    const encrypted = await encryptJsonPayload('profile', input.oldValue, aad);
    oldValueEncrypted = encrypted.ciphertext;
  } catch (err) {
    logger?.warn?.(
      { err, userId: input.userId, fieldName: input.fieldName },
      'Failed to encrypt old protected value; rollback will not be possible for this change',
    );
  }

  const result = await db.query<{ id: string }>(
    `INSERT INTO protected_change_history (
       user_id, field_name, old_value_hash, new_value_hash,
       old_value_encrypted, changed_by_session_id, changed_by_ip,
       risk_decision_id, compromise_case_id
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [
      input.userId,
      input.fieldName,
      oldValueHash,
      newValueHash,
      oldValueEncrypted,
      input.changedBySessionId ?? null,
      input.changedByIp ?? null,
      input.riskDecisionId ?? null,
      input.compromiseCaseId ?? null,
    ],
  );

  return { historyId: result.rows[0].id };
}

// ---------------------------------------------------------------------------
// Query operations
// ---------------------------------------------------------------------------

/**
 * Get the active compromise case for a user (the most recent case that is
 * not in a closed state). Returns `null` if the user has no active case.
 */
export async function getActiveCompromiseCase(
  userId: string,
): Promise<AccountCompromiseCase | null> {
  const result = await db.query<Record<string, unknown>>(
    `SELECT * FROM account_compromise_cases
     WHERE user_id = $1 AND state NOT IN ('closed_genuine', 'closed_compromised')
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId],
  );

  if (!result.rowCount || result.rowCount === 0) {
    return null;
  }

  return mapCompromiseCaseRow(result.rows[0]);
}

/**
 * Get a specific compromise case by its `case_id`. Returns `null` if not found.
 */
export async function getCompromiseCase(
  caseId: string,
): Promise<AccountCompromiseCase | null> {
  const result = await db.query<Record<string, unknown>>(
    `SELECT * FROM account_compromise_cases WHERE case_id = $1`,
    [caseId],
  );

  if (!result.rowCount || result.rowCount === 0) {
    return null;
  }

  return mapCompromiseCaseRow(result.rows[0]);
}

/**
 * Get a redacted session inventory for a user from the `user_sessions` table.
 *
 * Returns `session_id`, `user_agent`, `ip_address`, `created_at`,
 * `last_seen_at`, `is_current` and `is_revoked` for each session. Token
 * hashes are NEVER exposed — this function does not join to `refresh_tokens`
 * and never returns token-related columns.
 *
 * @param userId   the user whose sessions to inventory.
 * @param currentSessionId  the session id of the caller, marked as `is_current`.
 */
export async function getSessionInventory(
  userId: string,
  currentSessionId?: string,
): Promise<SessionInventoryEntry[]> {
  const result = await db.query<Record<string, unknown>>(
    `SELECT
       id AS session_id,
       user_agent,
       ip_address,
       created_at,
       last_seen_at,
       revoked_at
     FROM user_sessions
     WHERE user_id = $1
     ORDER BY last_seen_at DESC`,
    [userId],
  );

  return result.rows.map((row) => ({
    sessionId: row.session_id as string,
    userAgent: (row.user_agent as string | null) ?? null,
    ipAddress: (row.ip_address as string | null) ?? null,
    createdAt: row.created_at as string,
    lastSeenAt: row.last_seen_at as string,
    isCurrent: currentSessionId != null && row.session_id === currentSessionId,
    isRevoked: row.revoked_at != null,
  }));
}
