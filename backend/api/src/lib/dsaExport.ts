import crypto from 'node:crypto';
import type { Pool } from 'pg';
import { logger } from './logger.js';

// ── DSA statement-of-reasons export ──────────────────────────────────────
//
// Implements the harmonised transparency reporting obligations under the EU
// Digital Services Act (Implementing Regulation (EU) 2025/... , July 2025).
// Each moderation decision that restricts availability of content, monetisation,
// or account access must be recorded as a "statement of reasons" and submitted
// to the DSA Transparency Database in a harmonised schema.
//
// The source tables `statements_of_reasons` and `safety_decisions` are created
// in migration 172. This service is read/write against those tables and never
// invents columns that do not exist in the schema.

/** A single statement of reasons mapped to the DSA Transparency Database schema. */
export interface DsaStatementRecord {
  /** Platform-unique identifier for the statement. */
  puid: string;
  /** Array of enum strings, e.g. ["DECISION_VISIBILITY_CONTENT_DISABLED"]. */
  decision_visibility: string[];
  /** Enum string, e.g. "DECISION_MONETARY_TERMINATION" or "". */
  decision_monetary: string;
  /** Enum string, e.g. "DECISION_PROVISION_TOTAL_SUSPENSION" or "". */
  decision_provision: string;
  /** Enum string, e.g. "DECISION_ACCOUNT_SUSPENDED" or "". */
  decision_account: string;
  /** "DECISION_GROUND_ILLEGAL_CONTENT" or "DECISION_GROUND_INCOMPATIBLE_CONTENT". */
  decision_ground: string;
  /** Array of enum strings, e.g. ["CONTENT_TYPE_IMAGE", "CONTENT_TYPE_TEXT"]. */
  content_type: string[];
  /** The DSA content category (harmonised taxonomy). */
  category: string;
  /** ISO-3166-1 alpha-2 codes describing the territorial scope of the decision. */
  territorial_scope: string[];
  /** ISO 639-1 content language code. */
  content_language: string;
  /** Factual description of the content and the grounds for the decision. */
  decision_facts: string;
  /** Enum: SOURCE_TRUSTED_FLAGGER, SOURCE_NOTICE, etc. */
  source_type: string;
  /** "Yes" or "No". */
  automated_detection: string;
  /** "AUTOMATED_DECISION_FULLY" | "AUTOMATED_DECISION_PARTIALLY" | "AUTOMATED_DECISION_NOT_AUTOMATED". */
  automated_decision: string;
  /** ISO-8601 timestamp marking when the statement was created. */
  created_at: string;
}

/** Filters accepted by {@link exportForDsaDatabase}. */
export interface DsaExportFilters {
  date_from?: string;
  date_to?: string;
  dsa_category?: string;
  /** When true, return only statements already submitted to the DSA DB. */
  submitted_only?: boolean;
  /** Optional row cap (default 500, max 5000). */
  limit?: number;
}

/** Result of validating a statement against DSA requirements. */
export interface DsaValidationResult {
  valid: boolean;
  errors: string[];
}

/** Aggregated submission statistics for a reporting window. */
export interface DsaSubmissionStats {
  total: number;
  submitted: number;
  pending: number;
  submission_success_rate: number;
  by_category: Record<string, number>;
  by_decision_type: {
    visibility: number;
    mandatory: number;
    provision: number;
    account: number;
  };
  by_automation: {
    automated: number;
    human: number;
  };
}

/** Transparency report summary for a reporting period. */
export interface DsaTransparencyReport {
  period_start: string;
  period_end: string;
  total_cases: number;
  decisions_by_type: {
    visibility: number;
    mandatory: number;
    provision: number;
    account: number;
  };
  automation_rate: number;
  average_time_to_decision_hours: number | null;
  appeal_rate: number;
  overturn_rate: number;
  by_content_category: Record<string, number>;
}

// ── Export statements matching the DSA Transparency Database schema ──────

export async function exportForDsaDatabase(
  db: Pool,
  filters: DsaExportFilters,
): Promise<DsaStatementRecord[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (filters.date_from) {
    conditions.push(`sor.created_at >= $${paramIndex}`);
    params.push(filters.date_from);
    paramIndex += 1;
  }
  if (filters.date_to) {
    conditions.push(`sor.created_at <= $${paramIndex}`);
    params.push(filters.date_to);
    paramIndex += 1;
  }
  if (filters.dsa_category) {
    conditions.push(`sor.dsa_category = $${paramIndex}`);
    params.push(filters.dsa_category);
    paramIndex += 1;
  }
  if (filters.submitted_only) {
    conditions.push(`sor.submitted_to_dsa_db = TRUE`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = Math.min(Math.max(filters.limit ?? 500, 1), 5000);

  const result = await db.query(
    `
      SELECT
        sor.id,
        sor.puid,
        sor.decision_visibility,
        sor.decision_monetary,
        sor.decision_provision,
        sor.decision_account,
        sor.decision_ground,
        sor.content_type,
        sor.territorial_scope,
        sor.content_language,
        sor.facts,
        sor.automated_means,
        sor.source,
        sor.dsa_category,
        sor.created_at
      FROM statements_of_reasons sor
      ${where}
      ORDER BY sor.created_at ASC
      LIMIT $${paramIndex}
    `,
    [...params, limit],
  );

  return result.rows.map(mapDsaStatementRow);
}

// ── Mark statements as submitted to the DSA Transparency Database ────────

export async function markSubmittedToDsaDb(
  db: Pool,
  statement_ids: string[],
  submitted_at: Date = new Date(),
): Promise<number> {
  if (statement_ids.length === 0) {
    return 0;
  }

  const placeholders = statement_ids.map((_, i) => `$${i + 2}`).join(', ');
  const result = await db.query(
    `
      UPDATE statements_of_reasons
      SET submitted_to_dsa_db = TRUE,
          submitted_at = $1
      WHERE id IN (${placeholders})
    `,
    [submitted_at.toISOString(), ...statement_ids],
  );

  const updated = result.rowCount ?? 0;
  logger.info(
    { updated, total: statement_ids.length },
    'dsaExport.markSubmittedToDsaDb: marked statements as submitted',
  );
  return updated;
}

// ── Submission statistics for transparency reporting ─────────────────────

export async function getSubmissionStats(
  db: Pool,
  date_from: string,
  date_to: string,
): Promise<DsaSubmissionStats> {
  const totalResult = await db.query<{ total: string }>(
    `
      SELECT COUNT(*)::TEXT AS total
      FROM statements_of_reasons
      WHERE created_at >= $1 AND created_at <= $2
    `,
    [date_from, date_to],
  );
  const total = parseInt(totalResult.rows[0]?.total ?? '0', 10);

  const submittedResult = await db.query<{ submitted: string }>(
    `
      SELECT COUNT(*)::TEXT AS submitted
      FROM statements_of_reasons
      WHERE created_at >= $1 AND created_at <= $2
        AND submitted_to_dsa_db = TRUE
    `,
    [date_from, date_to],
  );
  const submitted = parseInt(submittedResult.rows[0]?.submitted ?? '0', 10);

  const categoryResult = await db.query<{ dsa_category: string; count: string }>(
    `
      SELECT dsa_category, COUNT(*)::TEXT AS count
      FROM statements_of_reasons
      WHERE created_at >= $1 AND created_at <= $2
      GROUP BY dsa_category
    `,
    [date_from, date_to],
  );
  const by_category: Record<string, number> = {};
  for (const row of categoryResult.rows) {
    by_category[row.dsa_category] = parseInt(row.count, 10);
  }

  const decisionResult = await db.query<{
    decision_visibility: boolean;
    decision_monetary: boolean;
    decision_provision: boolean;
    decision_account: boolean;
    count: string;
  }>(
    `
      SELECT
        decision_visibility,
        decision_monetary,
        decision_provision,
        decision_account,
        COUNT(*)::TEXT AS count
      FROM statements_of_reasons
      WHERE created_at >= $1 AND created_at <= $2
      GROUP BY decision_visibility, decision_monetary, decision_provision, decision_account
    `,
    [date_from, date_to],
  );

  let visibility = 0;
  let mandatory = 0;
  let provision = 0;
  let account = 0;
  for (const row of decisionResult.rows) {
    const count = parseInt(row.count, 10);
    if (row.decision_visibility) visibility += count;
    if (row.decision_monetary) mandatory += count;
    if (row.decision_provision) provision += count;
    if (row.decision_account) account += count;
  }

  const automationResult = await db.query<{ automated_means: boolean; count: string }>(
    `
      SELECT automated_means, COUNT(*)::TEXT AS count
      FROM statements_of_reasons
      WHERE created_at >= $1 AND created_at <= $2
      GROUP BY automated_means
    `,
    [date_from, date_to],
  );
  let automated = 0;
  let human = 0;
  for (const row of automationResult.rows) {
    const count = parseInt(row.count, 10);
    if (row.automated_means) automated += count;
    else human += count;
  }

  return {
    total,
    submitted,
    pending: total - submitted,
    submission_success_rate: total > 0 ? submitted / total : 0,
    by_category,
    by_decision_type: { visibility, mandatory, provision, account },
    by_automation: { automated, human },
  };
}

// ── Validate a statement record against DSA requirements ─────────────────

export function validateDsaRecord(record: Partial<DsaStatementRecord>): DsaValidationResult {
  const errors: string[] = [];

  if (!record.puid || record.puid.trim() === '') {
    errors.push('puid is required');
  }

  const hasDecisionType =
    (record.decision_visibility !== undefined && record.decision_visibility.length > 0) ||
    (record.decision_monetary !== undefined && record.decision_monetary !== '') ||
    (record.decision_provision !== undefined && record.decision_provision !== '') ||
    (record.decision_account !== undefined && record.decision_account !== '');
  if (!hasDecisionType) {
    errors.push('at least one decision type must be set');
  }

  if (!record.territorial_scope || record.territorial_scope.length === 0) {
    errors.push('territorial_scope must be a non-empty array');
  }

  if (!record.decision_facts || record.decision_facts.trim() === '') {
    errors.push('decision_facts is required');
  }

  if (!record.source_type || record.source_type.trim() === '') {
    errors.push('source_type is required');
  }

  if (!record.category || record.category.trim() === '') {
    errors.push('category is required');
  }

  return { valid: errors.length === 0, errors };
}

// ── Generate a transparency report summary for a reporting period ────────

export async function generateTransparencyReport(
  db: Pool,
  period_start: string,
  period_end: string,
): Promise<DsaTransparencyReport> {
  // Total statements of reasons in the period.
  const totalResult = await db.query<{ total: string }>(
    `
      SELECT COUNT(*)::TEXT AS total
      FROM statements_of_reasons
      WHERE created_at >= $1 AND created_at <= $2
    `,
    [period_start, period_end],
  );
  const total_cases = parseInt(totalResult.rows[0]?.total ?? '0', 10);

  // Decisions by type — a single statement may set multiple flags.
  const decisionResult = await db.query<{
    decision_visibility: boolean;
    decision_monetary: boolean;
    decision_provision: boolean;
    decision_account: boolean;
    count: string;
  }>(
    `
      SELECT
        decision_visibility,
        decision_monetary,
        decision_provision,
        decision_account,
        COUNT(*)::TEXT AS count
      FROM statements_of_reasons
      WHERE created_at >= $1 AND created_at <= $2
      GROUP BY decision_visibility, decision_monetary, decision_provision, decision_account
    `,
    [period_start, period_end],
  );

  let visibility = 0;
  let mandatory = 0;
  let provision = 0;
  let account = 0;
  for (const row of decisionResult.rows) {
    const count = parseInt(row.count, 10);
    if (row.decision_visibility) visibility += count;
    if (row.decision_monetary) mandatory += count;
    if (row.decision_provision) provision += count;
    if (row.decision_account) account += count;
  }

  // Automation rate.
  const automationResult = await db.query<{ automated: string; total: string }>(
    `
      SELECT
        COUNT(*) FILTER (WHERE automated_means = TRUE)::TEXT AS automated,
        COUNT(*)::TEXT AS total
      FROM statements_of_reasons
      WHERE created_at >= $1 AND created_at <= $2
    `,
    [period_start, period_end],
  );
  const automatedCount = parseInt(automationResult.rows[0]?.automated ?? '0', 10);
  const automationTotal = parseInt(automationResult.rows[0]?.total ?? '0', 10);
  const automation_rate = automationTotal > 0 ? automatedCount / automationTotal : 0;

  // Average time-to-decision: from the underlying safety decision's case
  // creation to the statement's created_at. We join through safety_decisions
  // to safety_cases to compute the elapsed hours.
  const avgTimeResult = await db.query<{ avg_hours: string | null }>(
    `
      SELECT AVG(EXTRACT(EPOCH FROM (sd.created_at - sc.created_at)) / 3600)::TEXT AS avg_hours
      FROM safety_decisions sd
      JOIN safety_cases sc ON sc.id = sd.case_id
      JOIN statements_of_reasons sor ON sor.decision_id = sd.id
      WHERE sor.created_at >= $1 AND sor.created_at <= $2
    `,
    [period_start, period_end],
  );
  const avg_hours_raw = avgTimeResult.rows[0]?.avg_hours;
  const average_time_to_decision_hours =
    avg_hours_raw !== null && avg_hours_raw !== undefined
      ? Math.round(parseFloat(avg_hours_raw) * 100) / 100
      : null;

  // Appeal and overturn rates from safety_appeals joined to safety_decisions
  // via decision_id. A single LEFT JOIN lets us count total decisions,
  // appealed decisions, and overturned decisions in one pass.
  const appealResult = await db.query<{
    total_decisions: string;
    appealed: string;
    overturned: string;
  }>(
    `
      SELECT
        COUNT(*)::TEXT AS total_decisions,
        COUNT(sa.id)::TEXT AS appealed,
        COUNT(sa.id) FILTER (WHERE sa.status = 'overturned')::TEXT AS overturned
      FROM safety_decisions sd
      JOIN statements_of_reasons sor ON sor.decision_id = sd.id
      LEFT JOIN safety_appeals sa ON sa.decision_id = sd.id
      WHERE sor.created_at >= $1 AND sor.created_at <= $2
    `,
    [period_start, period_end],
  );
  const totalDecisions = parseInt(appealResult.rows[0]?.total_decisions ?? '0', 10);
  const appealedCount = parseInt(appealResult.rows[0]?.appealed ?? '0', 10);
  const overturnedCount = parseInt(appealResult.rows[0]?.overturned ?? '0', 10);
  const appeal_rate = totalDecisions > 0 ? appealedCount / totalDecisions : 0;
  const overturn_rate = appealedCount > 0 ? overturnedCount / appealedCount : 0;

  // By content category.
  const categoryResult = await db.query<{ dsa_category: string; count: string }>(
    `
      SELECT dsa_category, COUNT(*)::TEXT AS count
      FROM statements_of_reasons
      WHERE created_at >= $1 AND created_at <= $2
      GROUP BY dsa_category
    `,
    [period_start, period_end],
  );
  const by_content_category: Record<string, number> = {};
  for (const row of categoryResult.rows) {
    by_content_category[row.dsa_category] = parseInt(row.count, 10);
  }

  return {
    period_start,
    period_end,
    total_cases,
    decisions_by_type: { visibility, mandatory, provision, account },
    automation_rate,
    average_time_to_decision_hours,
    appeal_rate,
    overturn_rate,
    by_content_category,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────

function mapDsaStatementRow(row: Record<string, unknown>): DsaStatementRecord {
  const territorialScope = row.territorial_scope;
  let territorial_scope: string[];
  if (Array.isArray(territorialScope)) {
    territorial_scope = territorialScope as string[];
  } else if (typeof territorialScope === 'string') {
    // Postgres array literal fallback if the driver did not parse it.
    territorial_scope = parsePgArray(territorialScope);
  } else {
    territorial_scope = [];
  }

  const contentTypeRaw = row.content_type;
  let content_type: string[];
  if (Array.isArray(contentTypeRaw)) {
    content_type = contentTypeRaw as string[];
  } else if (typeof contentTypeRaw === 'string') {
    content_type = parsePgArray(contentTypeRaw);
  } else {
    content_type = ['CONTENT_TYPE_TEXT'];
  }

  return {
    puid: row.puid as string,
    decision_visibility: row.decision_visibility
      ? ['DECISION_VISIBILITY_CONTENT_DISABLED']
      : ['DECISION_VISIBILITY_CONTENT_REMOVED'],
    decision_monetary: row.decision_monetary ? 'DECISION_MONETARY_TERMINATION' : '',
    decision_provision: row.decision_provision ? 'DECISION_PROVISION_TOTAL_SUSPENSION' : '',
    decision_account: row.decision_account ? 'DECISION_ACCOUNT_SUSPENDED' : '',
    decision_ground: (row.decision_ground as string) ?? 'DECISION_GROUND_INCOMPATIBLE_CONTENT',
    content_type,
    category: row.dsa_category as string,
    territorial_scope,
    content_language: (row.content_language as string) ?? 'en',
    decision_facts: row.facts as string,
    source_type: mapSourceType(row.source as string),
    automated_detection: row.automated_means ? 'Yes' : 'No',
    automated_decision: row.automated_means
      ? 'AUTOMATED_DECISION_FULLY'
      : 'AUTOMATED_DECISION_NOT_AUTOMATED',
    created_at: row.created_at as string,
  };
}

/**
 * Map an internal source identifier to the DSA Transparency Database
 * `source_type` enum value.
 */
function mapSourceType(source: string): string {
  const map: Record<string, string> = {
    trusted_notifier: 'SOURCE_TRUSTED_FLAGGER',
    law_enforcement: 'SOURCE_LAW_ENFORCEMENT',
    notice: 'SOURCE_NOTICE',
    automated: 'SOURCE_AUTOMATED_DETECTION',
  };
  return map[source ?? ''] ?? 'SOURCE_NOTICE';
}

/**
 * Parse a Postgres text-array literal (e.g. `{GB,US,DE}`) into a JS array.
 * Only used as a fallback when the driver returns the array as a raw string.
 */
function parsePgArray(literal: string): string[] {
  if (!literal.startsWith('{') || !literal.endsWith('}')) {
    return [literal];
  }
  const inner = literal.slice(1, -1);
  if (inner === '') {
    return [];
  }
  return inner.split(',');
}
