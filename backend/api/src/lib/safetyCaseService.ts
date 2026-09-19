import crypto from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { writeAuditEvent } from './immutableAudit.js';
import { logger } from './logger.js';
import { hasNcmecReport, submitNcmecReport } from './ncmecReporting.js';
import type { WorkforcePrincipal, WorkforceSession } from './workforceAuth.js';
import { sendOutcomeNotification } from './safetyNotifications.js';
import {
  getSellerReach,
  restoreSellerReach,
  setSellerReach,
  type ReachActor,
  type SellerReachSnapshot,
} from './sellerReach.js';
import { cancelBiddableLiveLotsForListing } from './listingCommandService.js';

// ── Safety case service ─────────────────────────────────────────────────
//
// Canonical trust & safety case graph: notices → cases → evidence →
// decisions → statements of reasons → enforcement → appeals → audit.
//
// Every state-changing operation writes a safety_audit_event within the same
// transaction as the domain write (fail-closed). The priority tuple replaces
// the old confidence-ascending queue ordering (TS-15): harm, vulnerability,
// virality and legal deadlines outrank model uncertainty.
//
// DSA Article 20 requires a free internal complaint path; appeals default to
// a 15-day deadline and must be decided by an independent reviewer.

export type SafetyCaseStatus =
  | 'open'
  | 'under_review'
  | 'decision_pending'
  | 'enforcement_pending'
  | 'closed'
  | 'appealed'
  | 'reopened';

export type SafetyDecision = 'no_violation' | 'restrict' | 'escalate' | 'emergency_hold';
export type SafetyUrgency = 'normal' | 'elevated' | 'emergency';
export type SafetySlaClass = 'standard' | 'priority' | 'emergency';
export type AppealStatus = 'submitted' | 'under_review' | 'upheld' | 'overturned' | 'withdrawn';
export type EnforcementStatus = 'pending' | 'executed' | 'failed' | 'reversed';

export type SafetyNoticeBasis = 'terms' | 'illegal_content' | 'unsure';
export type SafetySubjectType =
  | 'user'
  | 'listing'
  | 'message'
  | 'conversation'
  | 'media'
  | 'auction'
  | 'live_session';

export type EnforcementActionType =
  | 'content_removal'
  | 'visibility_restriction'
  | 'feature_limit'
  | 'warning'
  | 'account_restriction'
  | 'account_suspension'
  | 'emergency_hold'
  | 'monetary_restriction';

// ── Records ─────────────────────────────────────────────────────────────

export interface SafetyReasonCode {
  code: string;
  dsaCategory: string | null;
  ukPriorityOffence: string | null;
  severityClass: number;
  userFacingLabel: string;
  isIllegalContent: boolean;
  requiresLegalReview: boolean;
  effectiveFrom: string;
  supersededAt: string | null;
}

export interface SafetyNoticeRecord {
  id: string;
  idempotencyKey: string;
  reporterId: string | null;
  subjectType: SafetySubjectType;
  subjectId: string;
  subjectSnapshot: Record<string, unknown>;
  basis: SafetyNoticeBasis;
  reasonCode: string;
  jurisdiction: string | null;
  urgency: SafetyUrgency;
  allegation: string | null;
  reporterStatus: string | null;
  acknowledgementState: string;
  createdAt: string;
}

export interface SafetyCaseRecord {
  id: string;
  noticeId: string | null;
  ownerTeam: string | null;
  severity: number;
  involvesMinor: boolean;
  involvesVulnerableUser: boolean;
  viralityScore: number;
  exposureCount: number;
  slaClass: SafetySlaClass;
  slaDeadline: string | null;
  status: SafetyCaseStatus;
  linkedCaseIds: string[];
  policyVersionId: string | null;
  jurisdiction: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

export interface SafetyCaseEvidenceRecord {
  id: string;
  caseId: string;
  mediaAssetId: string | null;
  evidenceHash: Buffer;
  source: string;
  accessClass: string;
  retentionClass: string;
  chainOfCustody: Record<string, unknown>[];
  createdAt: string;
}

export interface SafetyDecisionRecord {
  id: string;
  caseId: string;
  decision: SafetyDecision;
  policyRuleId: string;
  policyVersionId: string;
  evidenceIds: string[];
  territorialScope: string[];
  durationKind: 'permanent' | 'temporary';
  durationUntil: string | null;
  userReasonCode: string;
  internalReason: string;
  automatedMeans: boolean;
  modelId: string | null;
  modelVersion: string | null;
  modelConfidence: number | null;
  humanReviewerId: string | null;
  decidedAt: string;
}

export interface EnforcementActionRecord {
  id: string;
  decisionId: string;
  actionType: EnforcementActionType;
  targetType: string;
  targetId: string;
  scope: Record<string, unknown>;
  executedAt: string | null;
  reversedAt: string | null;
  reversedBy: string | null;
  reversalReason: string | null;
  status: EnforcementStatus;
}

export interface StatementOfReasonsRecord {
  id: string;
  decisionId: string;
  affectedUserId: string;
  decisionVisibility: boolean;
  decisionMandatory: boolean;
  decisionProvision: boolean;
  decisionAccount: boolean;
  territorialScope: string[];
  duration: string;
  facts: string;
  automatedMeans: boolean;
  source: string;
  puid: string;
  dsaCategory: string;
  userNotificationState: string;
  submittedToDsaDb: boolean;
  submittedAt: string | null;
  createdAt: string;
}

export interface SafetyAppealRecord {
  id: string;
  decisionId: string;
  appellantId: string;
  grounds: string;
  newEvidenceIds: string[];
  independentReviewerId: string | null;
  deadline: string;
  status: AppealStatus;
  outcomeReason: string | null;
  remedy: string | null;
  createdAt: string;
  decidedAt: string | null;
}

export interface SafetyAuditEventRecord {
  id: string;
  caseId: string | null;
  actorId: string | null;
  eventType: string;
  eventData: Record<string, unknown>;
  createdAt: string;
}

// ── Priority tuple (§7.1) ───────────────────────────────────────────────

export interface PriorityTuple {
  emergencyOrLegalDeadline: boolean;
  involvesMinorOrVulnerable: boolean;
  credibleImminentHarm: number;
  exposureVirality: number;
  severityClass: number;
  trustedNotifier: boolean;
  repeatOffenderOrLinkedCases: number;
  oldestDueTime: string | null;
  sortKey: string;
}

// ── Complete case view ──────────────────────────────────────────────────

export interface CaseWithEvidence {
  caseRecord: SafetyCaseRecord;
  notice: SafetyNoticeRecord | null;
  evidence: SafetyCaseEvidenceRecord[];
  decisions: SafetyDecisionRecord[];
  statements: StatementOfReasonsRecord[];
  appeals: SafetyAppealRecord[];
  enforcementActions: EnforcementActionRecord[];
  auditEvents: SafetyAuditEventRecord[];
}

// ── Create a safety notice ──────────────────────────────────────────────
//
// Idempotent on (reporter_id, idempotency_key): retries return the original
// persisted row instead of a fabricated ID (fixes TS-06).

export async function createSafetyNotice(
  db: Pool | PoolClient,
  input: {
    reporter_id: string | null;
    subject_type: SafetySubjectType;
    subject_id: string;
    subject_snapshot: Record<string, unknown>;
    basis: SafetyNoticeBasis;
    reason_code: string;
    jurisdiction?: string;
    urgency?: SafetyUrgency;
    allegation?: string;
    reporter_status?: string;
    idempotency_key: string;
  },
): Promise<SafetyNoticeRecord> {
  const noticeId = `sn_${crypto.randomUUID()}`;
  const urgency = input.urgency ?? 'normal';

  const result = await db.query(
    `
      INSERT INTO safety_notices (
        id, idempotency_key, reporter_id, subject_type, subject_id,
        subject_snapshot, basis, reason_code, jurisdiction, urgency,
        allegation, reporter_status, acknowledgement_state
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10,
        $11, $12, 'pending'
      )
      ON CONFLICT (reporter_id, idempotency_key) DO UPDATE
        SET acknowledgement_state = safety_notices.acknowledgement_state
      RETURNING *
    `,
    [
      noticeId,
      input.idempotency_key,
      input.reporter_id,
      input.subject_type,
      input.subject_id,
      JSON.stringify(input.subject_snapshot),
      input.basis,
      input.reason_code,
      input.jurisdiction ?? null,
      urgency,
      input.allegation ?? null,
      input.reporter_status ?? null,
    ],
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error('[safetyCaseService] createSafetyNotice returned no row');
  }

  logger.info(
    { noticeId: row.id, reasonCode: input.reason_code, urgency },
    '[safetyCaseService] safety notice created',
  );

  return mapNoticeRow(row);
}

// ── Consumer report intake bridge ──────────────────────────────────────
//
// The consumer-facing report endpoints (user / listing / conversation)
// historically wrote a row into their own report table and stopped: the
// report never entered the trust & safety case graph, so no notice, no
// triage SLA and no reporter outcome ever existed. recordConsumerReport
// persists the domain report row AND its safety notice in a single
// transaction so a report can never exist without entering the pipeline.
//
// Dedup: the notice's idempotency key is derived deterministically from
// the report row id (`<kind>_report:<reportId>`), so a retried submission
// of an already-persisted report (conversation_reports carries a client
// idempotency key) returns the original notice instead of double-filing.

export type ConsumerReportKind =
  | 'user'
  | 'listing'
  | 'conversation'
  | 'live_chat'
  | 'ugc';

// Maps the mobile report vocabularies onto the seeded safety_reason_codes
// taxonomy (migration 172). The user/listing enums are already 1:1 with
// the taxonomy; the chat enum uses aliases resolved here. Unknown values
// degrade to 'other' so a taxonomy rename can never drop a report.
const CONSUMER_REPORT_REASON_MAP: Record<string, string> = {
  spam: 'spam',
  inappropriate: 'inappropriate',
  counterfeit: 'counterfeit',
  unresponsive: 'unresponsive',
  harassment: 'harassment',
  off_platform: 'off_platform',
  hate_speech: 'hate_speech',
  prohibited: 'prohibited',
  scam: 'scam',
  misinformation: 'misinformation',
  privacy: 'privacy',
  impersonation: 'impersonation',
  minor_safety: 'minor_safety',
  other: 'other',
  // chat report enum aliases
  scam_fraud: 'scam',
  inappropriate_content: 'inappropriate',
  off_platform_payment: 'off_platform',
};

export function mapConsumerReportReasonToSafetyCode(reason: string): string {
  return CONSUMER_REPORT_REASON_MAP[reason] ?? 'other';
}

export function consumerReportNoticeIdempotencyKey(
  kind: ConsumerReportKind,
  reportId: string,
): string {
  return `${kind}_report:${reportId}`;
}

// Reason codes seeded with is_illegal_content = TRUE (migration 172 seed):
// the reporter is alleging illegal content rather than a ToS breach, so the
// notice basis is 'illegal_content'. Everything else is a terms allegation.
const ILLEGAL_CONTENT_REASON_CODES = new Set([
  'hate_speech',
  'prohibited',
  'scam',
  'minor_safety',
  'cyberflashing',
]);

// Urgency mirrors the seed's severity_class so the SLA class computed at
// case-open matches the reporter's chosen category: severity 4 → emergency,
// severity 3 → elevated, everything else normal.
const EMERGENCY_REASON_CODES = new Set(['minor_safety']);
const ELEVATED_REASON_CODES = new Set(['hate_speech', 'prohibited', 'scam']);

export async function recordConsumerReport(
  db: Pool,
  input: {
    kind: ConsumerReportKind;
    reportId: string;
    reporterId: string;
    subjectId: string;
    reason: string;
    details?: string | null;
    evidenceMessageId?: string | null;
    idempotencyKey?: string | null;
    subjectSnapshot?: Record<string, unknown>;
  },
): Promise<{
  reportId: string;
  noticeId: string;
  duplicated: boolean;
  /**
   * Present when the report's severity>=3 reason code triggered the
   * auto-limit policy: the automated case/decision and the executed
   * visibility_restriction action that set the subject's
   * reach_state='limited' pending operator review.
   */
  autoEnforcement: {
    caseId: string;
    decisionId: string;
    actionId: string | null;
    applied: boolean;
    skipReason?: string;
  } | null;
}> {
  const reasonCode = mapConsumerReportReasonToSafetyCode(input.reason);
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    let effectiveReportId = input.reportId;
    let duplicated = false;

    switch (input.kind) {
      case 'user': {
        // Client idempotency (migration 294): dedupe on
        // (reporter_id, idempotency_key) — same contract as
        // conversation_reports below. A retried submission resolves the
        // original report id so the notice keys to a persisted row.
        const insertResult = await client.query<{ id: string }>(
          `INSERT INTO user_reports (id, reporter_id, reported_id, reason, details, created_at, updated_at, idempotency_key)
           VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), $6)
           ON CONFLICT (reporter_id, idempotency_key) WHERE idempotency_key IS NOT NULL
           DO NOTHING
           RETURNING id`,
          [input.reportId, input.reporterId, input.subjectId, input.reason, input.details ?? null, input.idempotencyKey ?? null],
        );
        if (insertResult.rowCount && insertResult.rowCount > 0) {
          effectiveReportId = insertResult.rows[0].id;
        } else {
          duplicated = true;
          if (input.idempotencyKey) {
            const existing = await client.query<{ id: string }>(
              `SELECT id FROM user_reports WHERE reporter_id = $1 AND idempotency_key = $2 LIMIT 1`,
              [input.reporterId, input.idempotencyKey],
            );
            if (existing.rows[0]) {
              effectiveReportId = existing.rows[0].id;
            }
          }
        }
        break;
      }
      case 'listing': {
        const insertResult = await client.query<{ id: string }>(
          `INSERT INTO listing_reports (id, reporter_id, listing_id, reason, details, idempotency_key)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (reporter_id, idempotency_key) WHERE idempotency_key IS NOT NULL
           DO NOTHING
           RETURNING id`,
          [input.reportId, input.reporterId, input.subjectId, input.reason, input.details ?? null, input.idempotencyKey ?? null],
        );
        if (insertResult.rowCount && insertResult.rowCount > 0) {
          effectiveReportId = insertResult.rows[0].id;
        } else {
          duplicated = true;
          if (input.idempotencyKey) {
            const existing = await client.query<{ id: string }>(
              `SELECT id FROM listing_reports WHERE reporter_id = $1 AND idempotency_key = $2 LIMIT 1`,
              [input.reporterId, input.idempotencyKey],
            );
            if (existing.rows[0]) {
              effectiveReportId = existing.rows[0].id;
            }
          }
        }
        break;
      }
      case 'conversation': {
        const insertResult = await client.query<{ id: string }>(
          `INSERT INTO conversation_reports (id, conversation_id, reporter_user_id, reason, details, message_id, status, created_at, idempotency_key)
           VALUES ($1, $2, $3, $4, $5, $6, 'submitted', NOW(), $7)
           ON CONFLICT (idempotency_key) DO NOTHING
           RETURNING id`,
          [
            input.reportId,
            input.subjectId,
            input.reporterId,
            input.reason,
            input.details ?? null,
            input.evidenceMessageId ?? null,
            input.idempotencyKey ?? null,
          ],
        );
        if (insertResult.rowCount && insertResult.rowCount > 0) {
          effectiveReportId = insertResult.rows[0].id;
        } else {
          // Idempotent retry: resolve the original report row so the notice
          // dedupes on the same derived key rather than keying a notice to a
          // report id that was never persisted.
          duplicated = true;
          if (input.idempotencyKey) {
            const existing = await client.query<{ id: string }>(
              `SELECT id FROM conversation_reports WHERE idempotency_key = $1 LIMIT 1`,
              [input.idempotencyKey],
            );
            if (existing.rows[0]) {
              effectiveReportId = existing.rows[0].id;
            }
          }
        }
        break;
      }
      case 'live_chat': {
        // subjectId is the live_shopping_chat_messages.id; session and
        // author ids travel in the subject snapshot passed by the route.
        const snapshot = input.subjectSnapshot ?? {};
        const insertResult = await client.query<{ id: string }>(
          `INSERT INTO live_chat_reports
             (id, session_id, message_id, author_user_id, reporter_user_id,
              reason, details, status, created_at, updated_at, idempotency_key)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'submitted', NOW(), NOW(), $8)
           ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL
           DO NOTHING
           RETURNING id`,
          [
            input.reportId,
            String(snapshot.sessionId ?? ''),
            input.evidenceMessageId ?? input.subjectId,
            String(snapshot.authorUserId ?? ''),
            input.reporterId,
            input.reason,
            input.details ?? null,
            input.idempotencyKey ?? null,
          ],
        );
        if (insertResult.rowCount && insertResult.rowCount > 0) {
          effectiveReportId = insertResult.rows[0].id;
        } else {
          duplicated = true;
          if (input.idempotencyKey) {
            const existing = await client.query<{ id: string }>(
              `SELECT id FROM live_chat_reports WHERE idempotency_key = $1 LIMIT 1`,
              [input.idempotencyKey],
            );
            if (existing.rows[0]) {
              effectiveReportId = existing.rows[0].id;
            }
          }
        }
        break;
      }
      case 'ugc': {
        // Polymorphic UGC report — the concrete surface type
        // (look / look_comment / poster / moodboard_comment / listing_qa)
        // and the author id travel in the subject snapshot.
        const snapshot = input.subjectSnapshot ?? {};
        const insertResult = await client.query<{ id: string }>(
          `INSERT INTO ugc_reports
             (id, subject_type, subject_id, author_user_id, reporter_user_id,
              reason, details, status, created_at, updated_at, idempotency_key)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'submitted', NOW(), NOW(), $8)
           ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL
           DO NOTHING
           RETURNING id`,
          [
            input.reportId,
            String(snapshot.subjectType ?? ''),
            input.subjectId,
            String(snapshot.authorUserId ?? ''),
            input.reporterId,
            input.reason,
            input.details ?? null,
            input.idempotencyKey ?? null,
          ],
        );
        if (insertResult.rowCount && insertResult.rowCount > 0) {
          effectiveReportId = insertResult.rows[0].id;
        } else {
          duplicated = true;
          if (input.idempotencyKey) {
            const existing = await client.query<{ id: string }>(
              `SELECT id FROM ugc_reports WHERE idempotency_key = $1 LIMIT 1`,
              [input.idempotencyKey],
            );
            if (existing.rows[0]) {
              effectiveReportId = existing.rows[0].id;
            }
          }
        }
        break;
      }
    }

    const notice = await createSafetyNotice(client, {
      reporter_id: input.reporterId,
      // 'live_chat' report rows key the live_chat_reports table, but the
      // notice's subject_type CHECK allows 'message' — a live chat report's
      // subject is the reported message. UGC reports map onto the closest
      // allowed type: posts/looks are 'media', comment-like text is 'message'.
      subject_type:
        input.kind === 'live_chat'
          ? 'message'
          : input.kind === 'ugc'
            ? ['look', 'poster'].includes(String(input.subjectSnapshot?.subjectType))
              ? 'media'
              : 'message'
            : input.kind,
      subject_id: input.subjectId,
      subject_snapshot: {
        reportId: effectiveReportId,
        reportReason: input.reason,
        evidenceMessageId: input.evidenceMessageId ?? null,
        ...(input.subjectSnapshot ?? {}),
      },
      basis: ILLEGAL_CONTENT_REASON_CODES.has(reasonCode) ? 'illegal_content' : 'terms',
      reason_code: reasonCode,
      urgency: EMERGENCY_REASON_CODES.has(reasonCode)
        ? 'emergency'
        : ELEVATED_REASON_CODES.has(reasonCode)
          ? 'elevated'
          : 'normal',
      allegation: input.details ?? undefined,
      idempotency_key: consumerReportNoticeIdempotencyKey(input.kind, effectiveReportId),
    });

    // Auto-limit on high-severity signals (user-approved policy): a
    // severity>=3 report materialises the rest of the pipeline in the same
    // transaction — an automated case + 'restrict' decision + an executed
    // visibility_restriction that sets the subject's reach_state='limited'
    // pending operator review. Reversal is truthful (the action's scope
    // stores the prior reach snapshot) via reverseEnforcement/decideAppeal.
    // Runs inside the report transaction so a failed enforcement can never
    // leave a report silently filed with no reach effect — fail-closed.
    const autoEnforcement = duplicated
      ? null
      : await maybeAutoLimitReachForNotice(client, {
          noticeId: notice.id,
          // For UGC the enforcement target is the content author, resolved
          // by the route at report time — the polymorphic subject id itself
          // has no single owner table to look up.
          subjectType: input.kind === 'ugc' ? 'user' : input.kind,
          subjectId:
            input.kind === 'ugc'
              ? String(input.subjectSnapshot?.authorUserId ?? input.subjectId)
              : input.subjectId,
          reasonCode,
          urgency: EMERGENCY_REASON_CODES.has(reasonCode)
            ? 'emergency'
            : ELEVATED_REASON_CODES.has(reasonCode)
              ? 'elevated'
              : 'normal',
        });

    await client.query('COMMIT');
    return {
      reportId: effectiveReportId,
      noticeId: notice.id,
      duplicated,
      autoEnforcement,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ── Open a case from a notice ───────────────────────────────────────────

export async function openSafetyCase(
  db: Pool,
  noticeId: string,
  input: {
    owner_team?: string;
    jurisdiction?: string;
    policy_version_id?: string;
    involves_vulnerable_user?: boolean;
    virality_score?: number;
    exposure_count?: number;
    linked_case_ids?: string[];
    principal: WorkforcePrincipal;
    session: WorkforceSession;
  },
): Promise<SafetyCaseRecord> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const noticeResult = await client.query<{
      reason_code: string;
      urgency: SafetyUrgency;
      reporter_status: string | null;
      jurisdiction: string | null;
    }>(
      `SELECT reason_code, urgency, reporter_status, jurisdiction FROM safety_notices WHERE id = $1 FOR UPDATE`,
      [noticeId],
    );

    const notice = noticeResult.rows[0];
    if (!notice) {
      throw new Error('Safety notice not found');
    }

    const reasonResult = await client.query<{
      severity_class: number;
      is_illegal_content: boolean;
      requires_legal_review: boolean;
      uk_priority_offence: string | null;
    }>(
      `SELECT severity_class, is_illegal_content, requires_legal_review, uk_priority_offence FROM safety_reason_codes WHERE code = $1 AND superseded_at IS NULL`,
      [notice.reason_code],
    );

    const reason = reasonResult.rows[0];
    if (!reason) {
      throw new Error(`Unknown reason code: ${notice.reason_code}`);
    }

    const severity = reason.severity_class;
    const involvesMinor =
      reason.uk_priority_offence?.includes('child') === true ||
      reason.uk_priority_offence?.includes('minor') === true ||
      notice.reason_code === 'minor_safety';
    const slaClass = computeSlaClass(notice.urgency, severity, involvesMinor);
    const slaDeadline = computeSlaDeadline(slaClass);
    const caseId = `sc_${crypto.randomUUID()}`;

    const insertResult = await client.query(
      `
        INSERT INTO safety_cases (
          id, notice_id, owner_team, severity, involves_minor, involves_vulnerable_user,
          virality_score, exposure_count, sla_class, sla_deadline, status,
          linked_case_ids, policy_version_id, jurisdiction
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, 'open',
          $11, $12, $13
        )
        RETURNING *
      `,
      [
        caseId,
        noticeId,
        input.owner_team ?? input.principal.team,
        severity,
        involvesMinor,
        input.involves_vulnerable_user ?? false,
        input.virality_score ?? 0,
        input.exposure_count ?? 0,
        slaClass,
        slaDeadline?.toISOString() ?? null,
        input.linked_case_ids ?? [],
        input.policy_version_id ?? null,
        input.jurisdiction ?? notice.jurisdiction ?? null,
      ],
    );

    const caseRow = insertResult.rows[0];

    await writeSafetyAuditEvent(client, {
      caseId,
      actorId: input.principal.id,
      eventType: 'case.opened',
      eventData: {
        noticeId,
        reasonCode: notice.reason_code,
        severity,
        slaClass,
        involvesMinor,
      },
      principal: input.principal,
      session: input.session,
    });

    await client.query('COMMIT');
    return mapCaseRow(caseRow);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ── Priority tuple (§7.1) ───────────────────────────────────────────────
//
// Replaces the confidence-ascending queue order (TS-15). Harm, vulnerability,
// virality and legal deadlines outrank model uncertainty.

export function computePriorityTuple(caseData: {
  slaClass: SafetySlaClass;
  slaDeadline: string | null;
  involvesMinor: boolean;
  involvesVulnerableUser: boolean;
  viralityScore: number;
  exposureCount: number;
  severity: number;
  reporterStatus: string | null;
  linkedCaseIds: string[];
}): PriorityTuple {
  const emergencyOrLegalDeadline =
    caseData.slaClass === 'emergency' || caseData.slaClass === 'priority';
  const involvesMinorOrVulnerable = caseData.involvesMinor || caseData.involvesVulnerableUser;
  const credibleImminentHarm = computeImminentHarm(caseData.severity, caseData.slaClass);
  const exposureVirality = Math.min(
    100,
    Math.round(caseData.viralityScore * 0.6 + caseData.exposureCount * 0.4),
  );
  const severityClass = caseData.severity;
  const trustedNotifier =
    caseData.reporterStatus === 'trusted_flagger' || caseData.reporterStatus === 'law_enforcement';
  const repeatOffenderOrLinkedCases = caseData.linkedCaseIds.length;
  const oldestDueTime = caseData.slaDeadline;

  // Sort key encodes the ordering: emergency DESC, minor DESC, harm DESC,
  // virality DESC, severity DESC, trusted DESC, linked DESC, due_time ASC.
  // Pad numerics so lexicographic comparison matches numeric ordering.
  const dueSort = oldestDueTime ?? '9999-12-31T23:59:59Z';
  const sortKey = [
    emergencyOrLegalDeadline ? '1' : '0',
    involvesMinorOrVulnerable ? '1' : '0',
    String(credibleImminentHarm).padStart(2, '0'),
    String(exposureVirality).padStart(3, '0'),
    String(severityClass).padStart(2, '0'),
    trustedNotifier ? '1' : '0',
    String(repeatOffenderOrLinkedCases).padStart(4, '0'),
    dueSort,
  ].join('|');

  return {
    emergencyOrLegalDeadline,
    involvesMinorOrVulnerable,
    credibleImminentHarm,
    exposureVirality,
    severityClass,
    trustedNotifier,
    repeatOffenderOrLinkedCases,
    oldestDueTime,
    sortKey,
  };
}

// ── Record a policy-bound decision ──────────────────────────────────────

export async function recordDecision(
  db: Pool,
  caseId: string,
  input: {
    decision: SafetyDecision;
    policy_rule_id: string;
    policy_version_id: string;
    evidence_ids: string[];
    territorial_scope?: string[];
    duration_kind: 'permanent' | 'temporary';
    duration_until?: string;
    user_reason_code: string;
    internal_reason: string;
    automated_means?: boolean;
    model_id?: string;
    model_version?: string;
    model_confidence?: number;
    human_reviewer_id?: string;
    principal: WorkforcePrincipal;
    session: WorkforceSession;
  },
): Promise<SafetyDecisionRecord> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const decisionId = `sdec_${crypto.randomUUID()}`;
    const automatedMeans = input.automated_means ?? false;

    const result = await client.query(
      `
        INSERT INTO safety_decisions (
          id, case_id, decision, policy_rule_id, policy_version_id, evidence_ids,
          territorial_scope, duration_kind, duration_until, user_reason_code,
          internal_reason, automated_means, model_id, model_version, model_confidence,
          human_reviewer_id
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10,
          $11, $12, $13, $14, $15,
          $16
        )
        RETURNING *
      `,
      [
        decisionId,
        caseId,
        input.decision,
        input.policy_rule_id,
        input.policy_version_id,
        input.evidence_ids,
        input.territorial_scope ?? [],
        input.duration_kind,
        input.duration_until ?? null,
        input.user_reason_code,
        input.internal_reason,
        automatedMeans,
        input.model_id ?? null,
        input.model_version ?? null,
        input.model_confidence ?? null,
        input.human_reviewer_id ?? null,
      ],
    );

    // Advance case state based on the decision
    const nextStatus: SafetyCaseStatus =
      input.decision === 'restrict' || input.decision === 'emergency_hold'
        ? 'enforcement_pending'
        : input.decision === 'escalate'
          ? 'under_review'
          : 'closed';

    const closeClause = nextStatus === 'closed' ? ', closed_at = NOW()' : '';
    await client.query(
      `UPDATE safety_cases SET status = $2, updated_at = NOW()${closeClause} WHERE id = $1`,
      [caseId, nextStatus],
    );

    // Auto-limit (user-approved policy): a restrictive decision on a
    // severity>=3 case immediately suppresses the subject's reach —
    // reach_state='limited' pending review — by creating and executing a
    // visibility_restriction enforcement action against the resolved
    // subject user. The prior reach snapshot is stored in the action's
    // scope so reverseEnforcement / an overturned appeal restores it
    // truthfully. Never downgrades an existing 'suspended' state.
    if (input.decision === 'restrict' || input.decision === 'emergency_hold') {
      const subjectResult = await client.query<{
        severity: number;
        subject_type: string | null;
        subject_id: string | null;
      }>(
        `SELECT sc.severity, sn.subject_type, sn.subject_id
         FROM safety_cases sc
         LEFT JOIN safety_notices sn ON sn.id = sc.notice_id
         WHERE sc.id = $1`,
        [caseId],
      );
      const subject = subjectResult.rows[0];
      if (
        subject
        && subject.severity >= AUTO_REACH_LIMIT_SEVERITY
        && subject.subject_id
      ) {
        const targetUserId = await resolveSubjectUserId(
          client,
          subject.subject_type,
          subject.subject_id,
        );
        if (targetUserId) {
          await autoLimitSellerReach(client, {
            caseId,
            decisionId,
            userId: targetUserId,
            reasonCode: input.user_reason_code,
            actor: {
              principalType: 'workforce',
              principalId: input.principal.id,
              workforceSessionId: input.session.id,
            },
          });
        }
      }
    }

    await writeSafetyAuditEvent(client, {
      caseId,
      actorId: input.principal.id,
      eventType: 'decision.recorded',
      eventData: {
        decisionId,
        decision: input.decision,
        policyRuleId: input.policy_rule_id,
        policyVersionId: input.policy_version_id,
        automatedMeans,
        modelId: input.model_id ?? null,
        humanReviewerId: input.human_reviewer_id ?? null,
      },
      principal: input.principal,
      session: input.session,
    });

    await client.query('COMMIT');

    // If CSAM is involved, automatically submit an NCMEC CyberTipline report
    // (18 U.S.C. § 2258A). The submission is fire-and-forget: it must never
    // block or fail the decision. A duplicate check prevents re-reporting a
    // case that has already been submitted.
    maybeReportToNcmec(db, caseId, input).catch((e) =>
      logger.error({ caseId, error: e }, '[safetyCaseService] NCMEC report trigger failed'),
    );

    // Best-effort outcome notification to the reporter. The decision is
    // already committed — a notification failure must never roll it back.
    notifyReporterOfOutcome(db, caseId, input).catch((e) =>
      logger.warn({ caseId, error: e }, '[safetyCaseService] outcome notification failed'),
    );

    return mapDecisionRow(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ── NCMEC CyberTipline trigger ──────────────────────────────────────────
//
// CSAM detection imposes a statutory reporting obligation under 18 U.S.C.
// § 2258A. When a decision's reason code indicates child sexual abuse
// material (or minor safety more broadly), an NCMEC report is submitted
// automatically. The check is intentionally broad — `minor_safety`, `csam`,
// and `child` substrings all qualify — so a taxonomy rename does not silently
// drop a statutory report. The submission itself is best-effort with
// alerting (see ncmecReporting.ts).

function isCsamReasonCode(reasonCode: string): boolean {
  const lower = reasonCode.toLowerCase();
  return (
    lower === 'minor_safety' ||
    lower.includes('csam') ||
    lower.includes('child')
  );
}

async function maybeReportToNcmec(
  db: Pool,
  caseId: string,
  input: {
    user_reason_code: string;
    automated_means?: boolean;
    human_reviewer_id?: string;
    principal: WorkforcePrincipal;
  },
): Promise<void> {
  if (!isCsamReasonCode(input.user_reason_code)) {
    return;
  }

  const alreadyReported = await hasNcmecReport(db, caseId);
  if (alreadyReported) {
    return;
  }

  // Resolve the notice to obtain the reporter id, subject id, and a content
  // locator. The case→notice join is the canonical source for these fields.
  const caseResult = await db.query<{ notice_id: string | null }>(
    `SELECT notice_id FROM safety_cases WHERE id = $1`,
    [caseId],
  );
  const noticeId = caseResult.rows[0]?.notice_id ?? null;

  let reporterId: string | null = null;
  let subjectId = caseId;
  let contentUrl = '';
  let contentHash = '';

  if (noticeId) {
    const noticeResult = await db.query<{
      reporter_id: string | null;
      subject_id: string;
      subject_type: string;
    }>(`SELECT reporter_id, subject_id, subject_type FROM safety_notices WHERE id = $1`, [
      noticeId,
    ]);
    const notice = noticeResult.rows[0];
    if (notice) {
      reporterId = notice.reporter_id;
      subjectId = notice.subject_id;
      contentUrl = `${process.env.APP_URL?.trim() ?? ''}/safety/case/${caseId}`;
      contentHash = crypto
        .createHash('sha256')
        .update(`${caseId}:${notice.subject_id}:${input.user_reason_code}`)
        .digest('hex');
    }
  }

  const moderatorId = input.human_reviewer_id ?? input.principal.id;

  submitNcmecReport(db, {
    caseId,
    reporterId,
    subjectId,
    contentUrl,
    contentHash,
    detectedCategories: [input.user_reason_code],
    detectionMethod: input.automated_means ? 'automated' : 'human_review',
    moderatorId,
    incidentDate: new Date().toISOString(),
  }).catch((e) =>
    logger.error(
      { caseId, error: e },
      '[safetyCaseService] NCMEC report submission failed',
    ),
  );
}

// ── Reporter outcome notification ────────────────────────────────────────
//
// Resolves the reporter from the case's notice and dispatches an outcome
// notification. Anonymous reports (null reporter_id) produce no notification.

async function notifyReporterOfOutcome(
  db: Pool,
  caseId: string,
  input: {
    decision: SafetyDecision;
    user_reason_code: string;
    automated_means?: boolean;
  },
): Promise<void> {
  const caseResult = await db.query<{ notice_id: string | null }>(
    `SELECT notice_id FROM safety_cases WHERE id = $1`,
    [caseId],
  );
  const noticeId = caseResult.rows[0]?.notice_id ?? null;
  if (!noticeId) return;

  const noticeResult = await db.query<{ reporter_id: string | null }>(
    `SELECT reporter_id FROM safety_notices WHERE id = $1`,
    [noticeId],
  );
  const reporterId = noticeResult.rows[0]?.reporter_id ?? null;

  await sendOutcomeNotification(db, {
    caseId,
    reporterId,
    decision: input.decision,
    reasonCode: input.user_reason_code,
    automatedMeans: input.automated_means ?? false,
  });
}

// ── Generate a DSA-compatible statement of reasons ──────────────────────

export async function generateStatementOfReasons(
  db: Pool,
  decisionId: string,
): Promise<StatementOfReasonsRecord> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const decisionResult = await client.query<{
      case_id: string;
      decision: SafetyDecision;
      territorial_scope: string[];
      duration_kind: string;
      duration_until: string | null;
      user_reason_code: string;
      internal_reason: string;
      automated_means: boolean;
    }>(`SELECT * FROM safety_decisions WHERE id = $1 FOR UPDATE`, [decisionId]);

    const decision = decisionResult.rows[0];
    if (!decision) {
      throw new Error('Decision not found');
    }

    const caseResult = await client.query<{
      notice_id: string | null;
    }>(`SELECT notice_id FROM safety_cases WHERE id = $1`, [decision.case_id]);

    const caseRow = caseResult.rows[0];
    let affectedUserId: string | null = null;
    let source = 'notice';

    if (caseRow?.notice_id) {
      const noticeResult = await client.query<{
        reporter_id: string | null;
        subject_type: string;
        subject_id: string | null;
        reason_code: string;
        reporter_status: string | null;
      }>(`SELECT * FROM safety_notices WHERE id = $1`, [caseRow.notice_id]);

      const notice = noticeResult.rows[0];
      if (notice) {
        // DSA statement of reasons must go to the affected user (the person
        // whose content was restricted), not the reporter.
        affectedUserId = notice.subject_id;
        source =
          notice.reporter_status === 'trusted_flagger'
            ? 'trusted_flagger'
            : notice.reporter_status === 'law_enforcement'
              ? 'law_enforcement'
              : 'notice';
      }
    }

    if (!affectedUserId) {
      throw new Error(
        '[safetyCaseService] generateStatementOfReasons: cannot generate a statement of reasons without an affected user (subject_id is null)',
      );
    }

    const reasonResult = await client.query<{
      dsa_category: string | null;
    }>(
      `SELECT dsa_category FROM safety_reason_codes WHERE code = $1`,
      [decision.user_reason_code],
    );
    const dsaCategory = reasonResult.rows[0]?.dsa_category ?? 'other';

    const {
      decisionVisibility,
      decisionMandatory,
      decisionProvision,
      decisionAccount,
    } = mapDecisionToDsaTypes(decision.decision);

    const duration = decision.duration_kind === 'permanent'
      ? 'permanent'
      : decision.duration_until ?? 'temporary';

    const puid = `sor_${decisionId}`;
    const statementId = `sor_${crypto.randomUUID()}`;

    const result = await client.query(
      `
        INSERT INTO statements_of_reasons (
          id, decision_id, affected_user_id,
          decision_visibility, decision_mandatory, decision_provision, decision_account,
          territorial_scope, duration, facts, automated_means, source,
          puid, dsa_category, user_notification_state, submitted_to_dsa_db
        ) VALUES (
          $1, $2, $3,
          $4, $5, $6, $7,
          $8, $9, $10, $11, $12,
          $13, $14, 'pending', false
        )
        RETURNING *
      `,
      [
        statementId,
        decisionId,
        affectedUserId,
        decisionVisibility,
        decisionMandatory,
        decisionProvision,
        decisionAccount,
        decision.territorial_scope,
        duration,
        decision.internal_reason,
        decision.automated_means,
        source,
        puid,
        dsaCategory,
      ],
    );

    await client.query('COMMIT');
    return mapStatementRow(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ── Create an enforcement action ────────────────────────────────────────

export async function createEnforcementAction(
  db: Pool,
  decisionId: string,
  input: {
    action_type: EnforcementActionType;
    target_type: string;
    target_id: string;
    scope?: Record<string, unknown>;
  },
): Promise<EnforcementActionRecord> {
  const actionId = `enf_${crypto.randomUUID()}`;
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `
        INSERT INTO enforcement_actions (
          id, decision_id, action_type, target_type, target_id, scope, status
        ) VALUES (
          $1, $2, $3, $4, $5, $6, 'pending'
        )
        RETURNING *
      `,
      [
        actionId,
        decisionId,
        input.action_type,
        input.target_type,
        input.target_id,
        JSON.stringify(input.scope ?? {}),
      ],
    );

    await client.query('COMMIT');
    return mapEnforcementRow(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ── Bind evidence media assets to a case ────────────────────────────────
//
// Inserts one safety_case_evidence row per item inside a single transaction
// so partial evidence binding is never persisted.

export async function addEvidenceToCase(
  db: Pool,
  caseId: string,
  evidence: Array<{
    source: string;
    sourceRef?: string;
    objectType: string;
    objectRef: string;
    objectHash?: string;
    sensitivity?: 'standard' | 'sensitive' | 'restricted';
  }>,
): Promise<void> {
  if (evidence.length === 0) return;
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    for (const item of evidence) {
      const id = `ev_${crypto.randomUUID()}`;
      await client.query(
        `INSERT INTO safety_case_evidence (id, case_id, source, source_ref, object_type, object_ref, object_hash, sensitivity)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [id, caseId, item.source, item.sourceRef ?? null, item.objectType, item.objectRef, item.objectHash ?? null, item.sensitivity ?? 'standard'],
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// ── Visibility-restriction effects (the executor that isn't a ledger) ───
//
// enforcement_actions used to be write-only: executeEnforcement flipped
// status to 'executed' and nothing in the product changed. These helpers
// apply and revert the real distribution effect inside the enforcement
// transaction:
//
//   target_type 'user'    → users.reach_state (scope.state:
//                           'limited' | 'suspended', default 'limited')
//   target_type 'listing' → listings.status = 'risk_pending'
//                           (dead state since migration 157 — excluded from
//                           every active-only serving query)
//
// The prior state is stored in the action's `scope` so reversal is
// truthful, and the merge-back UPDATE keeps scope as the single record of
// what was applied and what to restore.

/** Severity at or above which the auto-limit policy fires. */
const AUTO_REACH_LIMIT_SEVERITY = 3;

/** The policy version recorded on automated decisions. */
const AUTO_DECISION_POLICY_RULE = 'auto.reach_limit.severity_gte_3';

interface EnforcementActionRow {
  id: string;
  action_type: string;
  target_type: string;
  target_id: string;
  scope: Record<string, unknown>;
}

/**
 * Resolve a notice/case subject to the user whose reach it controls.
 * 'user' subjects are direct; 'listing' subjects resolve to the seller.
 * Other subject types (message/conversation/media/auction/live_session)
 * have no single accountable user resolvable here — returns null so the
 * caller skips rather than guessing.
 */
async function resolveSubjectUserId(
  client: PoolClient,
  subjectType: string | null,
  subjectId: string,
): Promise<string | null> {
  if (subjectType === 'user') {
    return subjectId;
  }
  if (subjectType === 'listing') {
    const listingResult = await client.query<{ seller_id: string }>(
      `SELECT seller_id FROM listings WHERE id = $1 LIMIT 1`,
      [subjectId],
    );
    return listingResult.rows[0]?.seller_id ?? null;
  }
  if (subjectType === 'live_chat') {
    // The subject is the reported message — the enforcement target is its
    // author.
    const messageResult = await client.query<{ user_id: string }>(
      `SELECT user_id FROM live_shopping_chat_messages WHERE id = $1 LIMIT 1`,
      [subjectId],
    );
    return messageResult.rows[0]?.user_id ?? null;
  }
  return null;
}

/**
 * Apply the distribution effect of a visibility_restriction action and
 * return the scope merged with `applied` + `prior` bookkeeping. The caller
 * persists the returned scope on the action row in the same transaction.
 */
async function applyVisibilityRestrictionEffect(
  client: PoolClient,
  action: EnforcementActionRow,
  actor: ReachActor,
): Promise<Record<string, unknown>> {
  const scope: Record<string, unknown> = { ...(action.scope ?? {}) };

  if (action.target_type === 'user') {
    const desired: Exclude<SellerReachSnapshot['state'], 'normal'> =
      scope.state === 'suspended' ? 'suspended' : 'limited';
    const reason =
      typeof scope.reason === 'string' && scope.reason.length > 0
        ? scope.reason
        : `visibility_restriction ${action.id}`;
    // Locks the user row and returns the prior snapshot for the ledger.
    const prior = await setSellerReach(client, {
      userId: action.target_id,
      state: desired,
      reason,
      actor,
    });
    scope.state = desired;
    scope.applied = { kind: 'user_reach', state: desired };
    scope.prior = prior;
    return scope;
  }

  if (action.target_type === 'listing') {
    const listingResult = await client.query<{ status: string }>(
      `SELECT status FROM listings WHERE id = $1 LIMIT 1 FOR UPDATE`,
      [action.target_id],
    );
    const priorStatus = listingResult.rows[0]?.status ?? null;
    scope.prior = { listing_status: priorStatus };
    if (priorStatus === null) {
      scope.applied = { kind: 'listing_visibility', applied: false, note: 'listing_not_found' };
      return scope;
    }
    if (priorStatus === 'risk_pending') {
      scope.applied = { kind: 'listing_visibility', applied: false, note: 'already_held' };
      return scope;
    }
    if (priorStatus === 'sold' || priorStatus === 'deleted') {
      // Terminal lifecycle states are never resurrected into a hold.
      scope.applied = {
        kind: 'listing_visibility',
        applied: false,
        note: `terminal_${priorStatus}`,
      };
      return scope;
    }
    await client.query(
      `UPDATE listings SET status = 'risk_pending', updated_at = NOW() WHERE id = $1`,
      [action.target_id],
    );
    // A held listing must not leave biddable live lots behind — bids would
    // keep landing on lots settlement can never complete (settlement
    // rejects 'risk_pending', leaving the lot to loop in failedLots).
    // Cancel every non-terminal lot in the same transaction.
    const cancelledLots = await cancelBiddableLiveLotsForListing(client, {
      listingId: action.target_id,
      actorId: actor.principalId,
      reason: `visibility_restriction:${action.id}`,
    });
    scope.applied = {
      kind: 'listing_visibility',
      applied: true,
      to: 'risk_pending',
      live_lots_cancelled: cancelledLots.length,
    };
    return scope;
  }

  // Other target types have no reach executor yet — the ledger records the
  // intent and scope records that no distribution effect was applied, so
  // the row never claims an effect it did not produce.
  scope.applied = { kind: 'none', note: `unsupported_target:${action.target_type}` };
  return scope;
}

/**
 * Revert the distribution effect of an executed visibility_restriction
 * action, restoring the prior snapshot recorded in `scope.prior`. Guarded:
 * a user/listing whose state changed since the action executed (e.g. an
 * operator escalated reach to 'suspended', or a held listing was sold) is
 * never clobbered — the skip is recorded in scope.reversal instead.
 */
async function revertVisibilityRestrictionEffect(
  client: PoolClient,
  action: EnforcementActionRow,
  actor: ReachActor,
): Promise<Record<string, unknown>> {
  const scope: Record<string, unknown> = { ...(action.scope ?? {}) };
  const applied = scope.applied as
    | { kind?: string; applied?: boolean; state?: string; to?: string }
    | undefined;
  const prior = scope.prior as Record<string, unknown> | undefined;

  if (action.target_type === 'user' && applied?.kind === 'user_reach' && prior) {
    const current = await getSellerReach(client, action.target_id, { forUpdate: true });
    if (current && current.state === applied.state) {
      const priorSnapshot: SellerReachSnapshot = {
        state:
          prior.state === 'limited' || prior.state === 'suspended'
            ? prior.state
            : 'normal',
        reason: (prior.reason as string | null) ?? null,
        setAt: (prior.setAt as string | null) ?? null,
      };
      await restoreSellerReach(client, {
        userId: action.target_id,
        prior: priorSnapshot,
        reason: `reversal of enforcement action ${action.id}`,
        actor,
      });
      scope.reversal = { restored: true, to: priorSnapshot.state };
    } else {
      scope.reversal = {
        restored: false,
        note: 'state_changed_since_apply',
        current: current?.state ?? 'user_not_found',
      };
    }
    return scope;
  }

  if (action.target_type === 'listing' && applied?.kind === 'listing_visibility' && prior) {
    const priorStatus = typeof prior.listing_status === 'string' ? prior.listing_status : null;
    const listingResult = await client.query<{ status: string }>(
      `SELECT status FROM listings WHERE id = $1 LIMIT 1 FOR UPDATE`,
      [action.target_id],
    );
    const currentStatus = listingResult.rows[0]?.status ?? null;
    if (applied.applied === true && currentStatus === 'risk_pending' && priorStatus) {
      // Restore pause provenance too (migration 305): a 'paused' landing
      // keeps whatever source the row carried into the hold — COALESCE
      // keeps an existing 'checkout_reservation'/'auction' provenance and
      // falls back to 'seller' when there was none.
      await client.query(
        `UPDATE listings
            SET status = $2,
                pause_source = CASE WHEN $2 = 'paused' THEN COALESCE(pause_source, 'seller') ELSE NULL END,
                updated_at = NOW()
          WHERE id = $1`,
        [action.target_id, priorStatus],
      );
      scope.reversal = { restored: true, to: priorStatus };
    } else {
      scope.reversal = {
        restored: false,
        note: 'status_changed_since_apply',
        current: currentStatus,
      };
    }
    return scope;
  }

  scope.reversal = { restored: false, note: 'no_effect_recorded' };
  return scope;
}

/**
 * Create AND execute a `visibility_restriction` action limiting a user's
 * reach. Used by the auto-limit policy — the executor executes immediately,
 * so "pending review" is expressed as scope.pending_review on an already-
 * executed, fully reversible action. Returns applied=false (with a
 * skipReason recorded on a case audit event) when the user is already
 * restricted — a 'suspended' user is never downgraded to 'limited'.
 */
async function autoLimitSellerReach(
  client: PoolClient,
  input: {
    caseId: string | null;
    decisionId: string;
    userId: string;
    reasonCode: string;
    actor: ReachActor;
  },
): Promise<{ actionId: string | null; applied: boolean; skipReason?: string }> {
  const current = await getSellerReach(client, input.userId, { forUpdate: true });
  if (!current) {
    return { actionId: null, applied: false, skipReason: 'user_not_found' };
  }
  if (current.state !== 'normal') {
    await client.query(
      `INSERT INTO safety_audit_events (id, case_id, actor_id, event_type, event_data)
       VALUES ($1, $2, NULL, 'enforcement.auto_limit_skipped', $3)`,
      [
        crypto.randomUUID(),
        input.caseId,
        JSON.stringify({
          decisionId: input.decisionId,
          userId: input.userId,
          reasonCode: input.reasonCode,
          reason: `reach_state_${current.state}`,
        }),
      ],
    );
    return { actionId: null, applied: false, skipReason: `reach_state_${current.state}` };
  }

  const actionId = `enf_${crypto.randomUUID()}`;
  const baseScope = {
    state: 'limited',
    auto: true,
    pending_review: true,
    reasonCode: input.reasonCode,
  };
  await client.query(
    `INSERT INTO enforcement_actions (id, decision_id, action_type, target_type, target_id, scope, status)
     VALUES ($1, $2, 'visibility_restriction', 'user', $3, $4, 'pending')`,
    [actionId, input.decisionId, input.userId, JSON.stringify(baseScope)],
  );

  const reason = `auto-limit: severity>=${AUTO_REACH_LIMIT_SEVERITY} signal (${input.reasonCode}) pending operator review`;
  const prior = await setSellerReach(client, {
    userId: input.userId,
    state: 'limited',
    reason,
    actor: { ...input.actor, caseId: input.caseId },
  });

  const mergedScope = {
    ...baseScope,
    reason,
    applied: { kind: 'user_reach', state: 'limited' },
    prior,
  };
  await client.query(
    `UPDATE enforcement_actions
     SET status = 'executed', executed_at = NOW(), scope = $2
     WHERE id = $1`,
    [actionId, JSON.stringify(mergedScope)],
  );

  // actor_id references users(id): a fully automated application records
  // NULL; an operator-driven decision records the deciding principal.
  await client.query(
    `INSERT INTO safety_audit_events (id, case_id, actor_id, event_type, event_data)
     VALUES ($1, $2, $3, 'enforcement.auto_executed', $4)`,
    [
      crypto.randomUUID(),
      input.caseId,
      input.actor.principalId,
      JSON.stringify({
        actionId,
        decisionId: input.decisionId,
        actionType: 'visibility_restriction',
        targetType: 'user',
        targetId: input.userId,
        state: 'limited',
        auto: true,
        actorType: input.actor.principalType,
      }),
    ],
  );

  return { actionId, applied: true };
}

/**
 * Auto-limit trigger for the live intake path. A severity>=3 consumer
 * report materialises the rest of the safety pipeline in one transaction:
 * an automated case (status 'enforcement_pending' — the queue item an
 * operator reviews), an automated 'restrict' decision under the current
 * policy version, and — when the subject resolves to a user whose reach is
 * 'normal' — an executed visibility_restriction that sets
 * reach_state='limited'. Returns null when the signal is below threshold
 * or the subject has no resolvable user.
 */
async function maybeAutoLimitReachForNotice(
  client: PoolClient,
  input: {
    noticeId: string;
    subjectType: ConsumerReportKind;
    subjectId: string;
    reasonCode: string;
    urgency: SafetyUrgency;
  },
): Promise<{
  caseId: string;
  decisionId: string;
  actionId: string | null;
  applied: boolean;
  skipReason?: string;
} | null> {
  const reasonResult = await client.query<{
    severity_class: number;
    uk_priority_offence: string | null;
  }>(
    `SELECT severity_class, uk_priority_offence
     FROM safety_reason_codes
     WHERE code = $1 AND superseded_at IS NULL`,
    [input.reasonCode],
  );
  const reason = reasonResult.rows[0];
  if (!reason || reason.severity_class < AUTO_REACH_LIMIT_SEVERITY) {
    return null;
  }

  const userId = await resolveSubjectUserId(client, input.subjectType, input.subjectId);
  if (!userId) {
    return null;
  }

  // The decision must cite a policy version in force; without one the
  // enforcement chain cannot be built — skip rather than fabricate a
  // policy row (the report itself still persists).
  const policyResult = await client.query<{ id: string }>(
    `SELECT id FROM policy_versions
     WHERE effective_until IS NULL
     ORDER BY effective_from DESC
     LIMIT 1`,
  );
  const policyVersionId = policyResult.rows[0]?.id ?? null;
  if (!policyVersionId) {
    return null;
  }

  const severity = reason.severity_class;
  const involvesMinor =
    reason.uk_priority_offence?.includes('child') === true ||
    reason.uk_priority_offence?.includes('minor') === true ||
    input.reasonCode === 'minor_safety';
  const slaClass = computeSlaClass(input.urgency, severity, involvesMinor);
  const slaDeadline = computeSlaDeadline(slaClass);

  const caseId = `sc_${crypto.randomUUID()}`;
  await client.query(
    `INSERT INTO safety_cases (
       id, notice_id, owner_team, severity, involves_minor, involves_vulnerable_user,
       virality_score, exposure_count, sla_class, sla_deadline, status,
       linked_case_ids, policy_version_id, jurisdiction
     ) VALUES (
       $1, $2, 'trust_safety', $3, $4, FALSE,
       0, 0, $5, $6, 'enforcement_pending',
       '{}', $7, NULL
     )`,
    [caseId, input.noticeId, severity, involvesMinor, slaClass, slaDeadline, policyVersionId],
  );

  const decisionId = `sdec_${crypto.randomUUID()}`;
  await client.query(
    `INSERT INTO safety_decisions (
       id, case_id, decision, policy_rule_id, policy_version_id, evidence_ids,
       territorial_scope, duration_kind, duration_until, user_reason_code,
       internal_reason, automated_means
     ) VALUES (
       $1, $2, 'restrict', $3, $4, '{}',
       '{}', 'temporary', NULL, $5,
       $6, TRUE
     )`,
    [
      decisionId,
      caseId,
      AUTO_DECISION_POLICY_RULE,
      policyVersionId,
      input.reasonCode,
      `Automated reach limit: ${input.subjectType} report '${input.reasonCode}' (severity ${severity}) — distribution suppressed pending operator review`,
    ],
  );

  const actor: ReachActor = { principalType: 'system', principalId: null };
  const limitResult = await autoLimitSellerReach(client, {
    caseId,
    decisionId,
    userId,
    reasonCode: input.reasonCode,
    actor,
  });

  await client.query(
    `INSERT INTO safety_audit_events (id, case_id, actor_id, event_type, event_data)
     VALUES ($1, $2, NULL, 'case.auto_opened', $3)`,
    [
      crypto.randomUUID(),
      caseId,
      JSON.stringify({
        noticeId: input.noticeId,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        reasonCode: input.reasonCode,
        severity,
        decisionId,
        enforcementActionId: limitResult.actionId,
        applied: limitResult.applied,
        skipReason: limitResult.skipReason ?? null,
      }),
    ],
  );

  return {
    caseId,
    decisionId,
    actionId: limitResult.actionId,
    applied: limitResult.applied,
    skipReason: limitResult.skipReason,
  };
}

// ── Execute a pending enforcement action ────────────────────────────────

export async function executeEnforcement(
  db: Pool,
  actionId: string,
  principal: WorkforcePrincipal,
  session: WorkforceSession,
): Promise<EnforcementActionRecord> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // Lock the pending action first. The real-world effect is applied
    // BEFORE the ledger flip so a failed effect rolls the whole
    // transaction back and the action stays 'pending' rather than lying
    // about being executed.
    const pendingResult = await client.query(
      `SELECT * FROM enforcement_actions WHERE id = $1 AND status = 'pending' FOR UPDATE`,
      [actionId],
    );
    const pending = pendingResult.rows[0];
    if (!pending) {
      throw new Error('Enforcement action not found or not pending');
    }

    let mergedScope: Record<string, unknown> =
      (pending.scope as Record<string, unknown>) ?? {};
    if (pending.action_type === 'visibility_restriction') {
      mergedScope = await applyVisibilityRestrictionEffect(client, pending, {
        principalType: 'workforce',
        principalId: principal.id,
        workforceSessionId: session.id,
      });
    }

    const result = await client.query(
      `
        UPDATE enforcement_actions
        SET status = 'executed', executed_at = NOW(), scope = $2
        WHERE id = $1 AND status = 'pending'
        RETURNING *
      `,
      [actionId, JSON.stringify(mergedScope)],
    );

    const action = result.rows[0];
    const decisionResult = await client.query<{ case_id: string }>(
      `SELECT case_id FROM safety_decisions WHERE id = $1`,
      [action.decision_id],
    );

    await writeSafetyAuditEvent(client, {
      caseId: decisionResult.rows[0]?.case_id ?? null,
      actorId: principal.id,
      eventType: 'enforcement.executed',
      eventData: {
        actionId,
        decisionId: action.decision_id,
        actionType: action.action_type,
        targetType: action.target_type,
        targetId: action.target_id,
      },
      principal,
      session,
    });

    await client.query('COMMIT');
    return mapEnforcementRow(action);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ── Reverse an executed enforcement action ──────────────────────────────

export async function reverseEnforcement(
  db: Pool,
  actionId: string,
  reason: string,
  principal: WorkforcePrincipal,
  session: WorkforceSession,
): Promise<EnforcementActionRecord> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // Lock the executed action; revert its real-world effect inside the
    // same transaction so the ledger never claims a reversal that did not
    // happen.
    const executedResult = await client.query(
      `SELECT * FROM enforcement_actions WHERE id = $1 AND status = 'executed' FOR UPDATE`,
      [actionId],
    );
    const executed = executedResult.rows[0];
    if (!executed) {
      throw new Error('Enforcement action not found or not executed');
    }

    let mergedScope: Record<string, unknown> =
      (executed.scope as Record<string, unknown>) ?? {};
    if (executed.action_type === 'visibility_restriction') {
      mergedScope = await revertVisibilityRestrictionEffect(client, executed, {
        principalType: 'workforce',
        principalId: principal.id,
        workforceSessionId: session.id,
      });
    }

    const result = await client.query(
      `
        UPDATE enforcement_actions
        SET status = 'reversed', reversed_at = NOW(), reversed_by = $2, reversal_reason = $3,
            scope = $4
        WHERE id = $1 AND status = 'executed'
        RETURNING *
      `,
      [actionId, principal.id, reason, JSON.stringify(mergedScope)],
    );

    const action = result.rows[0];
    const decisionResult = await client.query<{ case_id: string }>(
      `SELECT case_id FROM safety_decisions WHERE id = $1`,
      [action.decision_id],
    );

    await writeSafetyAuditEvent(client, {
      caseId: decisionResult.rows[0]?.case_id ?? null,
      actorId: principal.id,
      eventType: 'enforcement.reversed',
      eventData: {
        actionId,
        decisionId: action.decision_id,
        reversalReason: reason,
      },
      principal,
      session,
    });

    await client.query('COMMIT');
    return mapEnforcementRow(action);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ── Create an appeal ────────────────────────────────────────────────────
//
// DSA Article 20 requires a free internal complaint path. The deadline
// defaults to 15 days from creation.

export async function createAppeal(
  db: Pool,
  decisionId: string,
  input: {
    appellant_id: string;
    grounds: string;
    new_evidence_ids?: string[];
    deadline_days?: number;
    principal: WorkforcePrincipal;
    session: WorkforceSession;
  },
): Promise<SafetyAppealRecord> {
  const appealId = `sap_${crypto.randomUUID()}`;
  const deadlineDays = input.deadline_days ?? 15;
  const deadline = new Date(Date.now() + deadlineDays * 24 * 3600 * 1000);

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `
        INSERT INTO safety_appeals (
          id, decision_id, appellant_id, grounds, new_evidence_ids,
          deadline, status
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, 'submitted'
        )
        RETURNING *
      `,
      [
        appealId,
        decisionId,
        input.appellant_id,
        input.grounds,
        input.new_evidence_ids ?? [],
        deadline.toISOString(),
      ],
    );

    const decisionResult = await client.query<{ case_id: string }>(
      `SELECT case_id FROM safety_decisions WHERE id = $1`,
      [decisionId],
    );
    const caseId = decisionResult.rows[0]?.case_id ?? null;

    if (caseId) {
      await client.query(
        `UPDATE safety_cases SET status = 'appealed', updated_at = NOW() WHERE id = $1`,
        [caseId],
      );
    }

    await writeSafetyAuditEvent(client, {
      caseId,
      actorId: input.principal.id,
      eventType: 'appeal.submitted',
      eventData: {
        appealId,
        decisionId,
        appellantId: input.appellant_id,
        deadline: deadline.toISOString(),
      },
      principal: input.principal,
      session: input.session,
    });

    await client.query('COMMIT');
    return mapAppealRow(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ── Create a consumer-submitted appeal ──────────────────────────────────
//
// DSA Article 20 requires a free, easy-to-access internal complaint path.
// Unlike `createAppeal` (which requires a workforce principal/session for
// operator-initiated appeals), this variant is called from the consumer API
// and records the audit event with principalType 'consumer'.

export async function createConsumerAppeal(
  db: Pool,
  decisionId: string,
  input: {
    appellant_id: string;
    grounds: string;
    new_evidence_ids?: string[];
    deadline_days?: number;
  },
): Promise<SafetyAppealRecord> {
  const appealId = `sap_${crypto.randomUUID()}`;
  const deadlineDays = input.deadline_days ?? 15;
  const deadline = new Date(Date.now() + deadlineDays * 24 * 3600 * 1000);

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `
        INSERT INTO safety_appeals (
          id, decision_id, appellant_id, grounds, new_evidence_ids,
          deadline, status
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, 'submitted'
        )
        RETURNING *
      `,
      [
        appealId,
        decisionId,
        input.appellant_id,
        input.grounds,
        input.new_evidence_ids ?? [],
        deadline.toISOString(),
      ],
    );

    const decisionResult = await client.query<{ case_id: string }>(
      `SELECT case_id FROM safety_decisions WHERE id = $1`,
      [decisionId],
    );
    const caseId = decisionResult.rows[0]?.case_id ?? null;

    if (caseId) {
      await client.query(
        `UPDATE safety_cases SET status = 'appealed', updated_at = NOW() WHERE id = $1`,
        [caseId],
      );
    }

    await client.query(
      `
        INSERT INTO safety_audit_events (id, case_id, actor_id, event_type, event_data)
        VALUES ($1, $2, $3, $4, $5)
      `,
      [
        crypto.randomUUID(),
        caseId,
        input.appellant_id,
        'appeal.submitted',
        JSON.stringify({
          appealId,
          decisionId,
          appellantId: input.appellant_id,
          source: 'consumer',
          deadline: deadline.toISOString(),
        }),
      ],
    );

    await writeAuditEvent(client, {
      principalType: 'consumer',
      principalId: input.appellant_id,
      action: 'appeal.submitted',
      resourceType: 'safety_case',
      resourceId: caseId ?? undefined,
      caseId: caseId ?? undefined,
      reason: 'Consumer-submitted appeal (DSA Article 20)',
      outcome: 'success',
      retentionClass: 'standard',
    });

    await client.query('COMMIT');
    return mapAppealRow(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ── Decide an appeal ────────────────────────────────────────────────────
//
// An overturned appeal triggers enforcement reversal for every executed
// action tied to the decision.

export async function decideAppeal(
  db: Pool,
  appealId: string,
  input: {
    independent_reviewer_id: string;
    status: 'upheld' | 'overturned' | 'withdrawn';
    outcome_reason: string;
    remedy?: string;
    principal: WorkforcePrincipal;
    session: WorkforceSession;
  },
): Promise<SafetyAppealRecord> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `
        UPDATE safety_appeals
        SET independent_reviewer_id = $2, status = $3, outcome_reason = $4,
            remedy = $5, decided_at = NOW()
        WHERE id = $1 AND status IN ('submitted', 'under_review')
        RETURNING *
      `,
      [
        appealId,
        input.independent_reviewer_id,
        input.status,
        input.outcome_reason,
        input.remedy ?? null,
      ],
    );

    if (!result.rows[0]) {
      throw new Error('Appeal not found or already decided');
    }

    const appeal = result.rows[0];
    const decisionResult = await client.query<{ case_id: string }>(
      `SELECT case_id FROM safety_decisions WHERE id = $1`,
      [appeal.decision_id],
    );
    const caseId = decisionResult.rows[0]?.case_id ?? null;

    // Overturned → reverse every executed enforcement action for the
    // decision. This is the appeal-driven reversal path: the real-world
    // effect (reach state / listing hold) is reverted in the same
    // transaction as the ledger flip, restoring the prior snapshot stored
    // in the action's scope at execute time.
    if (input.status === 'overturned') {
      const enforcementResult = await client.query<{
        id: string;
        action_type: string;
        target_type: string;
        target_id: string;
        scope: Record<string, unknown>;
      }>(
        `SELECT * FROM enforcement_actions WHERE decision_id = $1 AND status = 'executed' FOR UPDATE`,
        [appeal.decision_id],
      );

      for (const row of enforcementResult.rows) {
        let mergedScope = row.scope ?? {};
        if (row.action_type === 'visibility_restriction') {
          mergedScope = await revertVisibilityRestrictionEffect(client, row, {
            principalType: 'workforce',
            principalId: input.independent_reviewer_id,
            workforceSessionId: input.session.id,
            caseId,
          });
        }
        await client.query(
          `
            UPDATE enforcement_actions
            SET status = 'reversed', reversed_at = NOW(), reversed_by = $2,
                reversal_reason = $3, scope = $4
            WHERE id = $1 AND status = 'executed'
          `,
          [
            row.id,
            input.independent_reviewer_id,
            `Appeal overturned: ${input.outcome_reason}`,
            JSON.stringify(mergedScope),
          ],
        );
      }

      if (caseId) {
        await client.query(
          `UPDATE safety_cases SET status = 'reopened', updated_at = NOW(), closed_at = NULL WHERE id = $1`,
          [caseId],
        );
      }
    } else if (input.status === 'upheld' && caseId) {
      await client.query(
        `UPDATE safety_cases SET status = 'closed', updated_at = NOW() WHERE id = $1`,
        [caseId],
      );
    }

    await writeSafetyAuditEvent(client, {
      caseId,
      actorId: input.principal.id,
      eventType: 'appeal.decided',
      eventData: {
        appealId,
        decisionId: appeal.decision_id,
        status: input.status,
        independentReviewerId: input.independent_reviewer_id,
        outcomeReason: input.outcome_reason,
        remedy: input.remedy ?? null,
      },
      principal: input.principal,
      session: input.session,
    });

    await client.query('COMMIT');
    return mapAppealRow(appeal);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ── Case queue ordered by priority tuple ────────────────────────────────
//
// Replaces the confidence-ascending ordering (TS-15). Filters narrow the
// queue; the priority tuple decides who gets helped first.

export async function getCaseQueue(
  db: Pool,
  filters: {
    status?: SafetyCaseStatus[];
    severity?: number;
    sla_class?: SafetySlaClass;
    involves_minor?: boolean;
    team?: string;
    limit?: number;
    offset?: number;
  },
): Promise<{ cases: Array<SafetyCaseRecord & { priorityTuple: PriorityTuple }>; total: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (filters.status && filters.status.length > 0) {
    const placeholders = filters.status.map((_, i) => `$${paramIndex + i}`).join(', ');
    conditions.push(`sc.status IN (${placeholders})`);
    params.push(...filters.status);
    paramIndex += filters.status.length;
  }
  if (filters.severity !== undefined) {
    conditions.push(`sc.severity >= $${paramIndex}`);
    params.push(filters.severity);
    paramIndex += 1;
  }
  if (filters.sla_class) {
    conditions.push(`sc.sla_class = $${paramIndex}`);
    params.push(filters.sla_class);
    paramIndex += 1;
  }
  if (filters.involves_minor !== undefined) {
    conditions.push(`sc.involves_minor = $${paramIndex}`);
    params.push(filters.involves_minor);
    paramIndex += 1;
  }
  if (filters.team) {
    conditions.push(`sc.owner_team = $${paramIndex}`);
    params.push(filters.team);
    paramIndex += 1;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
  const offset = Math.max(filters.offset ?? 0, 0);

  const countResult = await db.query<{ count: string }>(
    `SELECT COUNT(*)::TEXT AS count FROM safety_cases sc ${where}`,
    params,
  );
  const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

  const dataResult = await db.query(
    `
      SELECT
        sc.*,
        sn.reporter_status,
        sn.urgency AS notice_urgency
      FROM safety_cases sc
      LEFT JOIN safety_notices sn ON sn.id = sc.notice_id
      ${where}
      ORDER BY
        -- emergency: SLA class emergency first
        (sc.sla_class = 'emergency') DESC,
        -- minor: involves_minor first
        sc.involves_minor DESC,
        -- harm: severity class from reason code (higher = more harmful)
        sc.severity DESC,
        -- virality: higher score first
        sc.virality_score DESC,
        -- severity: higher first (redundant with harm but kept for spec compliance)
        sc.severity DESC,
        -- trusted: trusted notifier first (join to notice)
        (sn.reporter_status IN ('trusted_flagger', 'law_enforcement')) DESC,
        -- linked: more linked cases first
        COALESCE(array_length(sc.linked_case_ids, 1), 0) DESC,
        -- due_time: earliest deadline first
        sc.sla_deadline ASC NULLS LAST
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `,
    [...params, limit, offset],
  );

  const cases = dataResult.rows.map((row) => {
    const caseRecord = mapCaseRow(row);
    const tuple = computePriorityTuple({
      slaClass: caseRecord.slaClass,
      slaDeadline: caseRecord.slaDeadline,
      involvesMinor: caseRecord.involvesMinor,
      involvesVulnerableUser: caseRecord.involvesVulnerableUser,
      viralityScore: caseRecord.viralityScore,
      exposureCount: caseRecord.exposureCount,
      severity: caseRecord.severity,
      reporterStatus: (row.reporter_status as string | null) ?? null,
      linkedCaseIds: caseRecord.linkedCaseIds,
    });
    return { ...caseRecord, priorityTuple: tuple };
  });

  return { cases, total };
}

// ── Get a case with all related data ────────────────────────────────────

export async function getCaseWithEvidence(
  db: Pool,
  caseId: string,
): Promise<CaseWithEvidence | null> {
  const caseResult = await db.query(`SELECT * FROM safety_cases WHERE id = $1 LIMIT 1`, [caseId]);
  if (!caseResult.rows[0]) {
    return null;
  }
  const caseRecord = mapCaseRow(caseResult.rows[0]);

  const noticeResult = await db.query(
    `SELECT * FROM safety_notices WHERE id = $1 LIMIT 1`,
    [caseRecord.noticeId],
  );
  const notice = noticeResult.rows[0] ? mapNoticeRow(noticeResult.rows[0]) : null;

  const evidenceResult = await db.query(
    `SELECT * FROM safety_case_evidence WHERE case_id = $1 ORDER BY created_at ASC`,
    [caseId],
  );
  const evidence = evidenceResult.rows.map(mapEvidenceRow);

  const decisionsResult = await db.query(
    `SELECT * FROM safety_decisions WHERE case_id = $1 ORDER BY decided_at ASC`,
    [caseId],
  );
  const decisions = decisionsResult.rows.map(mapDecisionRow);

  const decisionIds = decisions.map((d) => d.id);
  let statements: StatementOfReasonsRecord[] = [];
  let appeals: SafetyAppealRecord[] = [];
  let enforcementActions: EnforcementActionRecord[] = [];

  if (decisionIds.length > 0) {
    const statementsResult = await db.query(
      `SELECT * FROM statements_of_reasons WHERE decision_id = ANY($1::text[]) ORDER BY created_at ASC`,
      [decisionIds],
    );
    statements = statementsResult.rows.map(mapStatementRow);

    const appealsResult = await db.query(
      `SELECT * FROM safety_appeals WHERE decision_id = ANY($1::text[]) ORDER BY created_at ASC`,
      [decisionIds],
    );
    appeals = appealsResult.rows.map(mapAppealRow);

    const enforcementResult = await db.query(
      `SELECT * FROM enforcement_actions WHERE decision_id = ANY($1::text[]) ORDER BY executed_at ASC NULLS LAST`,
      [decisionIds],
    );
    enforcementActions = enforcementResult.rows.map(mapEnforcementRow);
  }

  const auditResult = await db.query(
    `SELECT * FROM safety_audit_events WHERE case_id = $1 ORDER BY created_at ASC`,
    [caseId],
  );
  const auditEvents = auditResult.rows.map(mapAuditRow);

  return {
    caseRecord,
    notice,
    evidence,
    decisions,
    statements,
    appeals,
    enforcementActions,
    auditEvents,
  };
}

// ── Export statements of reasons for DSA Transparency Database ──────────

export async function exportStatementsOfReasons(
  db: Pool,
  filters: {
    start_date?: Date;
    end_date?: Date;
    dsa_category?: string;
    submitted_to_dsa_db?: boolean;
    limit?: number;
    offset?: number;
  },
): Promise<{ statements: StatementOfReasonsRecord[]; total: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (filters.start_date) {
    conditions.push(`sor.created_at >= $${paramIndex}`);
    params.push(filters.start_date.toISOString());
    paramIndex += 1;
  }
  if (filters.end_date) {
    conditions.push(`sor.created_at <= $${paramIndex}`);
    params.push(filters.end_date.toISOString());
    paramIndex += 1;
  }
  if (filters.dsa_category) {
    conditions.push(`sor.dsa_category = $${paramIndex}`);
    params.push(filters.dsa_category);
    paramIndex += 1;
  }
  if (filters.submitted_to_dsa_db !== undefined) {
    conditions.push(`sor.submitted_to_dsa_db = $${paramIndex}`);
    params.push(filters.submitted_to_dsa_db);
    paramIndex += 1;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = Math.min(Math.max(filters.limit ?? 100, 1), 500);
  const offset = Math.max(filters.offset ?? 0, 0);

  const countResult = await db.query<{ count: string }>(
    `SELECT COUNT(*)::TEXT AS count FROM statements_of_reasons sor ${where}`,
    params,
  );
  const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

  const dataResult = await db.query(
    `
      SELECT sor.*
      FROM statements_of_reasons sor
      ${where}
      ORDER BY sor.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `,
    [...params, limit, offset],
  );

  return {
    statements: dataResult.rows.map(mapStatementRow),
    total,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────

function computeSlaClass(
  urgency: SafetyUrgency,
  severity: number,
  involvesMinor: boolean,
): SafetySlaClass {
  if (urgency === 'emergency' || severity >= 4 || involvesMinor) {
    return 'emergency';
  }
  if (urgency === 'elevated' || severity >= 3) {
    return 'priority';
  }
  return 'standard';
}

function computeSlaDeadline(slaClass: SafetySlaClass): Date | null {
  const now = Date.now();
  if (slaClass === 'emergency') {
    return new Date(now + 4 * 3600 * 1000);
  }
  if (slaClass === 'priority') {
    return new Date(now + 24 * 3600 * 1000);
  }
  return new Date(now + 72 * 3600 * 1000);
}

function computeImminentHarm(severity: number, slaClass: SafetySlaClass): number {
  if (slaClass === 'emergency' && severity >= 4) return 3;
  if (slaClass === 'emergency') return 2;
  if (severity >= 4) return 2;
  if (severity >= 3) return 1;
  return 0;
}

function mapDecisionToDsaTypes(decision: SafetyDecision): {
  decisionVisibility: boolean;
  decisionMandatory: boolean;
  decisionProvision: boolean;
  decisionAccount: boolean;
} {
  switch (decision) {
    case 'restrict':
      // A restrict decision may touch any combination; default to visibility
      // restriction. The operator refines via enforcement actions.
      return {
        decisionVisibility: true,
        decisionMandatory: false,
        decisionProvision: false,
        decisionAccount: false,
      };
    case 'emergency_hold':
      return {
        decisionVisibility: true,
        decisionMandatory: false,
        decisionProvision: true,
        decisionAccount: false,
      };
    case 'escalate':
    case 'no_violation':
    default:
      return {
        decisionVisibility: false,
        decisionMandatory: false,
        decisionProvision: false,
        decisionAccount: false,
      };
  }
}

// Writes a safety_audit_event row AND an immutable audit chain entry within
// the same transaction. The safety_audit_events table is the case-scoped
// trail; immutable_audit_events is the global tamper-evident chain.
async function writeSafetyAuditEvent(
  client: PoolClient,
  input: {
    caseId: string | null;
    actorId: string;
    eventType: string;
    eventData: Record<string, unknown>;
    principal: WorkforcePrincipal;
    session: WorkforceSession;
  },
): Promise<void> {
  await client.query(
    `
      INSERT INTO safety_audit_events (id, case_id, actor_id, event_type, event_data)
      VALUES ($1, $2, $3, $4, $5)
    `,
    [
      crypto.randomUUID(),
      input.caseId,
      input.actorId,
      input.eventType,
      JSON.stringify(input.eventData),
    ],
  );

  await writeAuditEvent(client, {
    principalType: 'workforce',
    principalId: input.principal.id,
    workforceSessionId: input.session.id,
    action: input.eventType,
    resourceType: 'safety_case',
    resourceId: input.caseId ?? undefined,
    caseId: input.caseId ?? undefined,
    reason: input.eventType,
    outcome: 'success',
    retentionClass: 'standard',
  });
}

// ── Row mappers ─────────────────────────────────────────────────────────

function mapNoticeRow(row: Record<string, unknown>): SafetyNoticeRecord {
  return {
    id: row.id as string,
    idempotencyKey: row.idempotency_key as string,
    reporterId: (row.reporter_id as string) ?? null,
    subjectType: row.subject_type as SafetySubjectType,
    subjectId: row.subject_id as string,
    subjectSnapshot: (row.subject_snapshot as Record<string, unknown>) ?? {},
    basis: row.basis as SafetyNoticeBasis,
    reasonCode: row.reason_code as string,
    jurisdiction: (row.jurisdiction as string) ?? null,
    urgency: row.urgency as SafetyUrgency,
    allegation: (row.allegation as string) ?? null,
    reporterStatus: (row.reporter_status as string) ?? null,
    acknowledgementState: row.acknowledgement_state as string,
    createdAt: row.created_at as string,
  };
}

function mapCaseRow(row: Record<string, unknown>): SafetyCaseRecord {
  return {
    id: row.id as string,
    noticeId: (row.notice_id as string) ?? null,
    ownerTeam: (row.owner_team as string) ?? null,
    severity: row.severity as number,
    involvesMinor: row.involves_minor as boolean,
    involvesVulnerableUser: row.involves_vulnerable_user as boolean,
    viralityScore: row.virality_score as number,
    exposureCount: row.exposure_count as number,
    slaClass: row.sla_class as SafetySlaClass,
    slaDeadline: (row.sla_deadline as string) ?? null,
    status: row.status as SafetyCaseStatus,
    linkedCaseIds: (row.linked_case_ids as string[]) ?? [],
    policyVersionId: (row.policy_version_id as string) ?? null,
    jurisdiction: (row.jurisdiction as string) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    closedAt: (row.closed_at as string) ?? null,
  };
}

function mapEvidenceRow(row: Record<string, unknown>): SafetyCaseEvidenceRecord {
  return {
    id: row.id as string,
    caseId: row.case_id as string,
    mediaAssetId: (row.media_asset_id as string) ?? null,
    evidenceHash: row.evidence_hash as Buffer,
    source: row.source as string,
    accessClass: row.access_class as string,
    retentionClass: row.retention_class as string,
    chainOfCustody: (row.chain_of_custody as Record<string, unknown>[]) ?? [],
    createdAt: row.created_at as string,
  };
}

function mapDecisionRow(row: Record<string, unknown>): SafetyDecisionRecord {
  return {
    id: row.id as string,
    caseId: row.case_id as string,
    decision: row.decision as SafetyDecision,
    policyRuleId: row.policy_rule_id as string,
    policyVersionId: row.policy_version_id as string,
    evidenceIds: (row.evidence_ids as string[]) ?? [],
    territorialScope: (row.territorial_scope as string[]) ?? [],
    durationKind: row.duration_kind as 'permanent' | 'temporary',
    durationUntil: (row.duration_until as string) ?? null,
    userReasonCode: row.user_reason_code as string,
    internalReason: row.internal_reason as string,
    automatedMeans: row.automated_means as boolean,
    modelId: (row.model_id as string) ?? null,
    modelVersion: (row.model_version as string) ?? null,
    modelConfidence: (row.model_confidence as number) ?? null,
    humanReviewerId: (row.human_reviewer_id as string) ?? null,
    decidedAt: row.decided_at as string,
  };
}

function mapEnforcementRow(row: Record<string, unknown>): EnforcementActionRecord {
  return {
    id: row.id as string,
    decisionId: row.decision_id as string,
    actionType: row.action_type as EnforcementActionType,
    targetType: row.target_type as string,
    targetId: row.target_id as string,
    scope: (row.scope as Record<string, unknown>) ?? {},
    executedAt: (row.executed_at as string) ?? null,
    reversedAt: (row.reversed_at as string) ?? null,
    reversedBy: (row.reversed_by as string) ?? null,
    reversalReason: (row.reversal_reason as string) ?? null,
    status: row.status as EnforcementStatus,
  };
}

function mapStatementRow(row: Record<string, unknown>): StatementOfReasonsRecord {
  return {
    id: row.id as string,
    decisionId: row.decision_id as string,
    affectedUserId: row.affected_user_id as string,
    decisionVisibility: row.decision_visibility as boolean,
    decisionMandatory: row.decision_mandatory as boolean,
    decisionProvision: row.decision_provision as boolean,
    decisionAccount: row.decision_account as boolean,
    territorialScope: (row.territorial_scope as string[]) ?? [],
    duration: row.duration as string,
    facts: row.facts as string,
    automatedMeans: row.automated_means as boolean,
    source: row.source as string,
    puid: row.puid as string,
    dsaCategory: row.dsa_category as string,
    userNotificationState: row.user_notification_state as string,
    submittedToDsaDb: row.submitted_to_dsa_db as boolean,
    submittedAt: (row.submitted_at as string) ?? null,
    createdAt: row.created_at as string,
  };
}

function mapAppealRow(row: Record<string, unknown>): SafetyAppealRecord {
  return {
    id: row.id as string,
    decisionId: row.decision_id as string,
    appellantId: row.appellant_id as string,
    grounds: row.grounds as string,
    newEvidenceIds: (row.new_evidence_ids as string[]) ?? [],
    independentReviewerId: (row.independent_reviewer_id as string) ?? null,
    deadline: row.deadline as string,
    status: row.status as AppealStatus,
    outcomeReason: (row.outcome_reason as string) ?? null,
    remedy: (row.remedy as string) ?? null,
    createdAt: row.created_at as string,
    decidedAt: (row.decided_at as string) ?? null,
  };
}

function mapAuditRow(row: Record<string, unknown>): SafetyAuditEventRecord {
  return {
    id: row.id as string,
    caseId: (row.case_id as string) ?? null,
    actorId: (row.actor_id as string) ?? null,
    eventType: row.event_type as string,
    eventData: (row.event_data as Record<string, unknown>) ?? {},
    createdAt: row.created_at as string,
  };
}
