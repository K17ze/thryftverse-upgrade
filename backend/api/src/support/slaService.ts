// SLA tracking service for support cases.
//
// Computes per-case deadlines from the active SLA policy and tracks them in
// `support_sla_records`. The SLA clock can be paused (when awaiting customer
// input) and resumed. Breach detection compares each non-null deadline
// against the current time, respecting the paused state.
//
// The `support_sla_policies` table (migration 151) stores targets in seconds:
//   first_response_seconds, next_response_seconds, resolution_seconds.
// The `support_sla_records` table (migration 153) stores absolute deadlines
// as TIMESTAMPTZ plus pause/resume and breach metadata.
//
// Per the research report: "Do not show 'usually within two hours' unless
// computed from the eligible queue and current staffing policy." The queue
// summary returned by `getQueueSlaSummary` is the only source of SLA timing
// statistics — no hard-coded response-time promises live outside this module.

import crypto from 'node:crypto';
import type { Pool } from 'pg';
import { logger } from '../lib/logger.js';
import type { CasePriority } from './contracts.js';

// ── Row types (snake_case, matches DB) ──

interface SlaPolicyRow {
  id: string;
  name: string;
  issue_type: string | null;
  priority: CasePriority | null;
  first_response_seconds: number;
  next_response_seconds: number | null;
  resolution_seconds: number | null;
  is_active: boolean;
}

interface SlaRecordRow {
  id: string;
  case_id: string;
  policy_id: string;
  first_response_due_at: string | null;
  next_response_due_at: string | null;
  resolution_due_at: string | null;
  paused_reason: string | null;
  paused_at: string | null;
  breached_at: string | null;
  created_at: string;
  updated_at: string;
}

// ── Domain shape (camelCase) ──

export interface SlaRecord {
  id: string;
  caseId: string;
  policyId: string;
  firstResponseDueAt: string | null;
  nextResponseDueAt: string | null;
  resolutionDueAt: string | null;
  pausedReason: string | null;
  pausedAt: string | null;
  breachedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SlaBreachStatus {
  caseId: string;
  breached: boolean;
  firstResponseBreached: boolean;
  nextResponseBreached: boolean;
  resolutionBreached: boolean;
  breachedAt: string | null;
}

export interface QueueSlaSummary {
  team: string;
  totalCases: number;
  breachedCount: number;
  atRiskCount: number;
  pausedCount: number;
  activeCount: number;
  // Cases whose first-response deadline has not yet been met. This is the
  // eligible queue from which any "expected response time" must be derived.
  awaitingFirstResponse: number;
}

// ── Serializers ──

function serializeSlaRecord(row: SlaRecordRow): SlaRecord {
  return {
    id: row.id,
    caseId: row.case_id,
    policyId: row.policy_id,
    firstResponseDueAt: row.first_response_due_at,
    nextResponseDueAt: row.next_response_due_at,
    resolutionDueAt: row.resolution_due_at,
    pausedReason: row.paused_reason,
    pausedAt: row.paused_at,
    breachedAt: row.breached_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── Helpers ──

function addSeconds(base: Date, seconds: number | null | undefined): Date | null {
  if (seconds === null || seconds === undefined || seconds <= 0) {
    return null;
  }
  return new Date(base.getTime() + seconds * 1000);
}

/**
 * Resolves the best-matching active SLA policy for a case. Selection order:
 *   1. issue_type + priority exact match
 *   2. issue_type match (any priority)
 *   3. priority match (any issue_type)
 *   4. global default (issue_type IS NULL AND priority IS NULL)
 * Returns null if no active policy exists.
 */
async function resolveSlaPolicy(
  db: Pool,
  issueType: string,
  priority: CasePriority,
): Promise<SlaPolicyRow | null> {
  // 1. Exact issue_type + priority
  let result = await db.query<SlaPolicyRow>(
    `
      SELECT id, name, issue_type, priority, first_response_seconds,
             next_response_seconds, resolution_seconds, is_active
      FROM support_sla_policies
      WHERE is_active = TRUE AND issue_type = $1 AND priority = $2
      ORDER BY updated_at DESC
      LIMIT 1
    `,
    [issueType, priority],
  );
  if (result.rows.length > 0) {
    return result.rows[0];
  }

  // 2. issue_type only
  result = await db.query<SlaPolicyRow>(
    `
      SELECT id, name, issue_type, priority, first_response_seconds,
             next_response_seconds, resolution_seconds, is_active
      FROM support_sla_policies
      WHERE is_active = TRUE AND issue_type = $1 AND priority IS NULL
      ORDER BY updated_at DESC
      LIMIT 1
    `,
    [issueType],
  );
  if (result.rows.length > 0) {
    return result.rows[0];
  }

  // 3. priority only
  result = await db.query<SlaPolicyRow>(
    `
      SELECT id, name, issue_type, priority, first_response_seconds,
             next_response_seconds, resolution_seconds, is_active
      FROM support_sla_policies
      WHERE is_active = TRUE AND issue_type IS NULL AND priority = $1
      ORDER BY updated_at DESC
      LIMIT 1
    `,
    [priority],
  );
  if (result.rows.length > 0) {
    return result.rows[0];
  }

  // 4. Global default
  result = await db.query<SlaPolicyRow>(
    `
      SELECT id, name, issue_type, priority, first_response_seconds,
             next_response_seconds, resolution_seconds, is_active
      FROM support_sla_policies
      WHERE is_active = TRUE AND issue_type IS NULL AND priority IS NULL
      ORDER BY updated_at DESC
      LIMIT 1
    `,
  );
  if (result.rows.length > 0) {
    return result.rows[0];
  }

  return null;
}

/**
 * Fetches the issue_type and priority for a case, needed to resolve the SLA
 * policy when the caller does not supply a policyId.
 */
async function getCaseMeta(
  db: Pool,
  caseId: string,
): Promise<{ issueType: string; priority: CasePriority } | null> {
  const result = await db.query<{ issue_type: string; priority: CasePriority }>(
    `SELECT issue_type, priority FROM support_cases WHERE id = $1`,
    [caseId],
  );
  if (result.rows.length === 0) {
    return null;
  }
  return {
    issueType: result.rows[0].issue_type,
    priority: result.rows[0].priority,
  };
}

// ── Public API ──

/**
 * Creates an SLA record for a case. If `policyId` is not supplied, the
 * best-matching active policy is resolved from the case's issue_type and
 * priority. Deadlines are computed as absolute timestamps from the policy's
 * seconds-based targets. If no policy can be resolved, no record is created
 * and null is returned — the case proceeds without SLA tracking.
 */
export async function createSlaRecord(
  db: Pool,
  caseId: string,
  policyId?: string,
): Promise<SlaRecord | null> {
  let resolvedPolicyId = policyId ?? null;

  if (!resolvedPolicyId) {
    const caseMeta = await getCaseMeta(db, caseId);
    if (!caseMeta) {
      logger.warn({ caseId }, '[slaService] case not found, cannot resolve SLA policy');
      return null;
    }
    const policy = await resolveSlaPolicy(db, caseMeta.issueType, caseMeta.priority);
    if (!policy) {
      logger.info({ caseId }, '[slaService] no active SLA policy matched, skipping SLA record');
      return null;
    }
    resolvedPolicyId = policy.id;
  }

  // Fetch the policy to compute deadlines.
  const policyResult = await db.query<SlaPolicyRow>(
    `
      SELECT id, name, issue_type, priority, first_response_seconds,
             next_response_seconds, resolution_seconds, is_active
      FROM support_sla_policies
      WHERE id = $1
    `,
    [resolvedPolicyId],
  );
  if (policyResult.rows.length === 0) {
    logger.warn({ policyId: resolvedPolicyId }, '[slaService] SLA policy not found');
    return null;
  }

  const policy = policyResult.rows[0];
  const now = new Date();
  const firstResponseDueAt = addSeconds(now, policy.first_response_seconds);
  const nextResponseDueAt = addSeconds(now, policy.next_response_seconds);
  const resolutionDueAt = addSeconds(now, policy.resolution_seconds);

  const id = `sla_${crypto.randomUUID()}`;

  const result = await db.query<SlaRecordRow>(
    `
      INSERT INTO support_sla_records
        (id, case_id, policy_id, first_response_due_at,
         next_response_due_at, resolution_due_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (case_id) DO UPDATE
        SET policy_id = EXCLUDED.policy_id,
            first_response_due_at = EXCLUDED.first_response_due_at,
            next_response_due_at = EXCLUDED.next_response_due_at,
            resolution_due_at = EXCLUDED.resolution_due_at,
            paused_reason = NULL,
            paused_at = NULL,
            breached_at = NULL,
            updated_at = NOW()
      RETURNING id, case_id, policy_id, first_response_due_at,
                next_response_due_at, resolution_due_at, paused_reason,
                paused_at, breached_at, created_at, updated_at
    `,
    [
      id,
      caseId,
      resolvedPolicyId,
      firstResponseDueAt?.toISOString() ?? null,
      nextResponseDueAt?.toISOString() ?? null,
      resolutionDueAt?.toISOString() ?? null,
    ],
  );

  logger.info(
    { caseId, policyId: resolvedPolicyId },
    '[slaService] SLA record created',
  );

  return serializeSlaRecord(result.rows[0]);
}

/**
 * Returns the SLA record for a case, or null if none exists.
 */
export async function getSlaRecord(db: Pool, caseId: string): Promise<SlaRecord | null> {
  const result = await db.query<SlaRecordRow>(
    `
      SELECT id, case_id, policy_id, first_response_due_at,
             next_response_due_at, resolution_due_at, paused_reason,
             paused_at, breached_at, created_at, updated_at
      FROM support_sla_records
      WHERE case_id = $1
    `,
    [caseId],
  );
  if (result.rows.length === 0) {
    return null;
  }
  return serializeSlaRecord(result.rows[0]);
}

/**
 * Checks whether any SLA target for a case has been breached. A target is
 * breached when its deadline has passed AND the SLA clock is not currently
 * paused. If a breach is detected and the record does not already have a
 * `breached_at` timestamp, it is set to NOW().
 *
 * Returns the breach status; `breached` is true if any target is breached.
 */
export async function checkSlaBreach(db: Pool, caseId: string): Promise<SlaBreachStatus> {
  const record = await getSlaRecord(db, caseId);
  if (!record) {
    return {
      caseId,
      breached: false,
      firstResponseBreached: false,
      nextResponseBreached: false,
      resolutionBreached: false,
      breachedAt: null,
    };
  }

  // When paused, the clock is stopped — no new breaches are declared.
  const isPaused = record.pausedAt !== null;

  const now = Date.now();
  const firstResponseBreached =
    !isPaused &&
    record.firstResponseDueAt !== null &&
    now > new Date(record.firstResponseDueAt).getTime();
  const nextResponseBreached =
    !isPaused &&
    record.nextResponseDueAt !== null &&
    now > new Date(record.nextResponseDueAt).getTime();
  const resolutionBreached =
    !isPaused &&
    record.resolutionDueAt !== null &&
    now > new Date(record.resolutionDueAt).getTime();

  const breached = firstResponseBreached || nextResponseBreached || resolutionBreached;

  if (breached && !record.breachedAt) {
    await db.query(
      `
        UPDATE support_sla_records
        SET breached_at = NOW(), updated_at = NOW()
        WHERE case_id = $1 AND breached_at IS NULL
      `,
      [caseId],
    );
    logger.warn({ caseId }, '[slaService] SLA breach detected');
  }

  return {
    caseId,
    breached,
    firstResponseBreached,
    nextResponseBreached,
    resolutionBreached,
    breachedAt: record.breachedAt,
  };
}

/**
 * Pauses the SLA clock for a case. This is used when the case transitions to
 * `awaiting_customer` — the response timer should not count time the customer
 * is expected to act. A reason must be supplied for auditability. If the
 * clock is already paused, this is a no-op.
 */
export async function pauseSla(db: Pool, caseId: string, reason: string): Promise<void> {
  await db.query(
    `
      UPDATE support_sla_records
      SET paused_reason = $2,
          paused_at = COALESCE(paused_at, NOW()),
          updated_at = NOW()
      WHERE case_id = $1
    `,
    [caseId, reason],
  );
  logger.info({ caseId, reason }, '[slaService] SLA clock paused');
}

/**
 * Resumes the SLA clock for a case. When resuming, the deadlines are shifted
 * forward by the duration the clock was paused, so the customer-perceived
 * response window is preserved. If the clock is not paused, this is a no-op.
 */
export async function resumeSla(db: Pool, caseId: string): Promise<void> {
  // Only act if the clock is currently paused.
  const record = await getSlaRecord(db, caseId);
  if (!record || record.pausedAt === null) {
    return;
  }

  const pausedAt = new Date(record.pausedAt).getTime();
  const pauseDurationMs = Date.now() - pausedAt;

  await db.query(
    `
      UPDATE support_sla_records
      SET first_response_due_at = CASE
            WHEN first_response_due_at IS NOT NULL
            THEN first_response_due_at + ($2 || ' microseconds')::INTERVAL
            ELSE first_response_due_at END,
          next_response_due_at = CASE
            WHEN next_response_due_at IS NOT NULL
            THEN next_response_due_at + ($2 || ' microseconds')::INTERVAL
            ELSE next_response_due_at END,
          resolution_due_at = CASE
            WHEN resolution_due_at IS NOT NULL
            THEN resolution_due_at + ($2 || ' microseconds')::INTERVAL
            ELSE resolution_due_at END,
          paused_reason = NULL,
          paused_at = NULL,
          updated_at = NOW()
      WHERE case_id = $1 AND paused_at IS NOT NULL
    `,
    [caseId, String(pauseDurationMs * 1000)],
  );

  logger.info({ caseId }, '[slaService] SLA clock resumed');
}

/**
 * Returns aggregate SLA statistics for a queue (team). This is the only
 * computed source of SLA timing information — it must be used instead of
 * hard-coded response-time promises. "At risk" is defined as a non-paused
 * record whose earliest non-null deadline is within 1 hour of breach.
 */
export async function getQueueSlaSummary(
  db: Pool,
  team: string,
): Promise<QueueSlaSummary> {
  const result = await db.query<{
    total_cases: string;
    breached_count: string;
    at_risk_count: string;
    paused_count: string;
    active_count: string;
    awaiting_first_response: string;
  }>(
    `
      WITH sla_for_team AS (
        SELECT
          sr.id,
          sr.case_id,
          sr.first_response_due_at,
          sr.next_response_due_at,
          sr.resolution_due_at,
          sr.paused_at,
          sr.breached_at,
          sc.assigned_team
        FROM support_sla_records sr
        JOIN support_cases sc ON sc.id = sr.case_id
        WHERE sc.assigned_team = $1
      )
      SELECT
        COUNT(*)::TEXT AS total_cases,
        COUNT(*) FILTER (WHERE breached_at IS NOT NULL)::TEXT AS breached_count,
        COUNT(*) FILTER (
          WHERE breached_at IS NULL
            AND paused_at IS NULL
            AND (
              LEAST(
                COALESCE(first_response_due_at, 'infinity'::timestamptz),
                COALESCE(next_response_due_at, 'infinity'::timestamptz),
                COALESCE(resolution_due_at, 'infinity'::timestamptz)
              ) < NOW() + INTERVAL '1 hour'
            )
        )::TEXT AS at_risk_count,
        COUNT(*) FILTER (WHERE paused_at IS NOT NULL)::TEXT AS paused_count,
        COUNT(*) FILTER (WHERE paused_at IS NULL AND breached_at IS NULL)::TEXT AS active_count,
        COUNT(*) FILTER (
          WHERE first_response_due_at IS NOT NULL
            AND breached_at IS NULL
        )::TEXT AS awaiting_first_response
      FROM sla_for_team
    `,
    [team],
  );

  const row = result.rows[0];
  return {
    team,
    totalCases: Number(row.total_cases),
    breachedCount: Number(row.breached_count),
    atRiskCount: Number(row.at_risk_count),
    pausedCount: Number(row.paused_count),
    activeCount: Number(row.active_count),
    awaitingFirstResponse: Number(row.awaiting_first_response),
  };
}

/**
 * Checks all active SLA records for breaches. Returns a list of breach
 * statuses for records that are newly breached (breached_at was null and is
 * now set). Optionally filtered by team.
 */
export async function checkAllSlaBreaches(
  db: Pool,
  team?: string,
): Promise<SlaBreachStatus[]> {
  // Find all non-paused, non-breached SLA records for active cases.
  const recordsResult = await db.query<{ case_id: string }>(
    `
      SELECT sr.case_id
      FROM support_sla_records sr
      JOIN support_cases sc ON sc.id = sr.case_id
      WHERE sr.paused_at IS NULL
        AND sr.breached_at IS NULL
        AND sc.operational_state NOT IN ('resolved', 'closed')
        ${team ? 'AND sc.assigned_team = $2' : ''}
    `,
    team ? [team] : [],
  );

  const newlyBreached: SlaBreachStatus[] = [];

  for (const row of recordsResult.rows) {
    const status = await checkSlaBreach(db, row.case_id);
    if (status.breached) {
      newlyBreached.push(status);
    }
  }

  return newlyBreached;
}

export { logger };
