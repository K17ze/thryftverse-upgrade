import crypto from 'node:crypto';
import type { Pool } from 'pg';
import { logger } from './logger.js';

// ── Ofcom risk assessment records ────────────────────────────────────────
//
// Implements the risk assessment record-keeping obligations under the UK
// Online Safety Act, following Ofcom's Risk Assessment Guidance V2.0
// (June 2026). In-scope services must assess and record risk for each of
// the 18 priority offences, review within 3 months of launch and before
// significant product changes, and keep the assessment current.
//
// The `ofcom_risk_assessments` table is created lazily by `ensureSchema`
// so the service is self-contained in environments where migration 171
// has not yet been applied. The table is idempotent.

/** The 18 priority offences under Ofcom V2.0 (June 2026). */
export const OFCOM_PRIORITY_OFFENCES = [
  'terrorism',
  'extreme_sexual_violence',
  'rape_and_serious_sexual_offences',
  'child_sexual_abuse',
  'child_sexual_exploitation',
  'online_grooming',
  'sexual_exploitation_of_children',
  'encouraging_or_assisting_suicide',
  'suicide_and_self_harm',
  'cyberflashing',
  'extreme_pornography',
  'revenge_porn',
  'hate_crime',
  'harassment',
  'fraud',
  'controlled_drugs',
  'weapons_offences',
  'people_smuggling',
] as const;

export type OfcomOffenceType = (typeof OFCOM_PRIORITY_OFFENCES)[number];

export type OfcomRiskLevel = 'low' | 'medium' | 'high';

/**
 * Distinguishes the two Ofcom risk assessment obligations under the UK
 * Online Safety Act:
 *  - `illegal_content`: Section 9 illegal content risk assessment
 *  - `children`: Section 11 children's risk assessment (services likely
 *    to be accessed by children)
 */
export type OfcomAssessmentType = 'illegal_content' | 'children';

/** Input for creating a risk assessment record. */
export interface RiskAssessmentInput {
  offence_type: OfcomOffenceType;
  risk_level: OfcomRiskLevel;
  assessment_summary: string;
  mitigation_measures: Record<string, unknown>;
  assessed_by: string;
  assessment_date?: Date;
  /** When the next review is due. Defaults to +3 months per Ofcom guidance. */
  next_review_date?: Date;
  /** Section 9 (illegal content) or Section 11 (children). Defaults to `illegal_content`. */
  assessment_type?: OfcomAssessmentType;
}

/** A persisted risk assessment record. */
export interface RiskAssessmentRecord {
  id: string;
  offence_type: string;
  risk_level: OfcomRiskLevel;
  assessment_summary: string;
  mitigation_measures: Record<string, unknown>;
  assessed_by: string;
  assessment_date: string;
  next_review_date: string | null;
  created_at: string;
  assessment_type: OfcomAssessmentType;
}

/** Overall compliance status for the Ofcom risk assessment obligation. */
export interface RiskAssessmentStatus {
  exists: boolean;
  lastReviewedAt: string | null;
  overdueForReview: boolean;
  coveredOffences: string[];
  missingOffences: string[];
}

/** A single offence row in the compliance dashboard summary. */
export interface OffenceSummary {
  offence_type: string;
  risk_level: OfcomRiskLevel | null;
  last_assessment_date: string | null;
  next_review_date: string | null;
  review_overdue: boolean;
}

/** Full summary across all 18 priority offences. */
export interface RiskAssessmentSummary {
  total_offences: number;
  assessed: number;
  missing: number;
  overdue: number;
  by_risk_level: { low: number; medium: number; high: number };
  offences: OffenceSummary[];
}

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS ofcom_risk_assessments (
    id TEXT PRIMARY KEY,
    offence_type TEXT NOT NULL,
    risk_level TEXT NOT NULL CHECK (risk_level IN ('low','medium','high')),
    assessment_summary TEXT NOT NULL,
    mitigation_measures JSONB NOT NULL DEFAULT '{}'::jsonb,
    assessed_by TEXT NOT NULL,
    assessment_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    next_review_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(offence_type, assessment_date)
  );

  CREATE INDEX IF NOT EXISTS idx_ofcom_risk_assessments_offence
    ON ofcom_risk_assessments (offence_type, assessment_date DESC);
  CREATE INDEX IF NOT EXISTS idx_ofcom_risk_assessments_review
    ON ofcom_risk_assessments (next_review_date)
    WHERE next_review_date IS NOT NULL;
`;

// ── Schema bootstrap ─────────────────────────────────────────────────────

export async function ensureSchema(db: Pool): Promise<void> {
  await db.query(CREATE_TABLE_SQL);
  await db.query(
    `ALTER TABLE ofcom_risk_assessments
       ADD COLUMN IF NOT EXISTS assessment_type TEXT NOT NULL DEFAULT 'illegal_content'
       CHECK (assessment_type IN ('illegal_content', 'children'))`,
  );
}

// ── Check whether a risk assessment exists and is current ────────────────

export async function getRiskAssessmentStatus(db: Pool): Promise<RiskAssessmentStatus> {
  await ensureSchema(db);

  const latestResult = await db.query<{
    offence_type: string;
    latest_date: string;
    next_review_date: string | null;
  }>(
    `
      SELECT DISTINCT ON (offence_type)
        offence_type,
        assessment_date AS latest_date,
        next_review_date
      FROM ofcom_risk_assessments
      ORDER BY offence_type, assessment_date DESC
    `,
  );

  const covered = latestResult.rows.map((r) => r.offence_type);
  const coveredSet = new Set(covered);
  const missing = OFCOM_PRIORITY_OFFENCES.filter((o) => !coveredSet.has(o));

  const lastReviewedRow = latestResult.rows.reduce<string | null>((acc, r) => {
    if (acc === null || r.latest_date > acc) return r.latest_date;
    return acc;
  }, null);

  const now = new Date().toISOString();
  const overdueForReview =
    missing.length > 0 ||
    latestResult.rows.some(
      (r) => r.next_review_date !== null && r.next_review_date <= now,
    );

  return {
    exists: covered.length > 0,
    lastReviewedAt: lastReviewedRow,
    overdueForReview,
    coveredOffences: covered,
    missingOffences: missing,
  };
}

// ── Create a risk assessment record ──────────────────────────────────────

export async function createRiskAssessmentRecord(
  db: Pool,
  input: RiskAssessmentInput,
): Promise<RiskAssessmentRecord> {
  await ensureSchema(db);

  if (!OFCOM_PRIORITY_OFFENCES.includes(input.offence_type)) {
    throw new Error(
      `createRiskAssessmentRecord: offence_type "${input.offence_type}" is not one of the 18 Ofcom priority offences`,
    );
  }

  const id = `ofcom_ra_${crypto.randomUUID()}`;
  const assessmentDate = input.assessment_date ?? new Date();
  const nextReviewDate =
    input.next_review_date ?? defaultNextReviewDate(assessmentDate);

  await db.query(
    `
      INSERT INTO ofcom_risk_assessments (
        id, offence_type, risk_level, assessment_summary,
        mitigation_measures, assessed_by, assessment_date, next_review_date,
        assessment_type
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `,
    [
      id,
      input.offence_type,
      input.risk_level,
      input.assessment_summary,
      JSON.stringify(input.mitigation_measures),
      input.assessed_by,
      assessmentDate.toISOString(),
      nextReviewDate.toISOString(),
      input.assessment_type ?? 'illegal_content',
    ],
  );

  logger.info(
    {
      id,
      offence_type: input.offence_type,
      risk_level: input.risk_level,
      next_review_date: nextReviewDate.toISOString(),
    },
    'ofcomRiskAssessment.createRiskAssessmentRecord: record created',
  );

  const record = await getRiskAssessmentRecord(db, id);
  return record!;
}

// ── List the latest assessment for each offence type ──────────────────────

export async function listRiskAssessments(db: Pool): Promise<RiskAssessmentRecord[]> {
  await ensureSchema(db);

  const result = await db.query(
    `
      SELECT DISTINCT ON (offence_type)
        id, offence_type, risk_level, assessment_summary,
        mitigation_measures, assessed_by, assessment_date,
        next_review_date, created_at, assessment_type
      FROM ofcom_risk_assessments
      ORDER BY offence_type, assessment_date DESC
    `,
  );

  return result.rows.map(mapRiskAssessmentRow);
}

// ── Return priority offences with no assessment record ────────────────────

export async function getMissingOffences(db: Pool): Promise<readonly OfcomOffenceType[]> {
  await ensureSchema(db);

  const result = await db.query<{ offence_type: string }>(
    `SELECT DISTINCT offence_type FROM ofcom_risk_assessments`,
  );
  const assessedSet = new Set(result.rows.map((r) => r.offence_type));

  return OFCOM_PRIORITY_OFFENCES.filter((o) => !assessedSet.has(o));
}

// ── Check whether any assessment is overdue for review ───────────────────

export async function isReviewOverdue(db: Pool): Promise<boolean> {
  await ensureSchema(db);

  const now = new Date().toISOString();

  // Any existing assessment whose next_review_date has passed.
  const overdueResult = await db.query<{ count: string }>(
    `
      SELECT COUNT(*)::TEXT AS count
      FROM ofcom_risk_assessments
      WHERE next_review_date IS NOT NULL
        AND next_review_date <= $1
    `,
    [now],
  );
  if (parseInt(overdueResult.rows[0]?.count ?? '0', 10) > 0) {
    return true;
  }

  // Any required offence with no assessment at all.
  const missing = await getMissingOffences(db);
  return missing.length > 0;
}

// ── Generate a compliance dashboard summary across all 18 offences ───────

export async function generateRiskAssessmentSummary(
  db: Pool,
): Promise<RiskAssessmentSummary> {
  await ensureSchema(db);

  const latest = await listRiskAssessments(db);
  const latestByOffence = new Map<string, RiskAssessmentRecord>();
  for (const record of latest) {
    latestByOffence.set(record.offence_type, record);
  }

  const now = new Date().toISOString();
  const offences: OffenceSummary[] = OFCOM_PRIORITY_OFFENCES.map((offence) => {
    const record = latestByOffence.get(offence);
    if (!record) {
      return {
        offence_type: offence,
        risk_level: null,
        last_assessment_date: null,
        next_review_date: null,
        review_overdue: true,
      };
    }
    return {
      offence_type: offence,
      risk_level: record.risk_level,
      last_assessment_date: record.assessment_date,
      next_review_date: record.next_review_date,
      review_overdue:
        record.next_review_date !== null && record.next_review_date <= now,
    };
  });

  const assessed = offences.filter((o) => o.risk_level !== null).length;
  const missing = offences.length - assessed;
  const overdue = offences.filter((o) => o.review_overdue).length;

  const by_risk_level = { low: 0, medium: 0, high: 0 };
  for (const o of offences) {
    if (o.risk_level === 'low') by_risk_level.low += 1;
    else if (o.risk_level === 'medium') by_risk_level.medium += 1;
    else if (o.risk_level === 'high') by_risk_level.high += 1;
  }

  return {
    total_offences: OFCOM_PRIORITY_OFFENCES.length,
    assessed,
    missing,
    overdue,
    by_risk_level,
    offences,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────

async function getRiskAssessmentRecord(
  db: Pool,
  id: string,
): Promise<RiskAssessmentRecord | null> {
  const result = await db.query(
    `
      SELECT id, offence_type, risk_level, assessment_summary,
             mitigation_measures, assessed_by, assessment_date,
             next_review_date, created_at, assessment_type
      FROM ofcom_risk_assessments
      WHERE id = $1
      LIMIT 1
    `,
    [id],
  );
  return result.rows[0] ? mapRiskAssessmentRow(result.rows[0]) : null;
}

function mapRiskAssessmentRow(row: Record<string, unknown>): RiskAssessmentRecord {
  const mitigation = row.mitigation_measures;
  let mitigation_measures: Record<string, unknown>;
  if (mitigation && typeof mitigation === 'object' && !Array.isArray(mitigation)) {
    mitigation_measures = mitigation as Record<string, unknown>;
  } else if (typeof mitigation === 'string') {
    try {
      mitigation_measures = JSON.parse(mitigation) as Record<string, unknown>;
    } catch {
      mitigation_measures = {};
    }
  } else {
    mitigation_measures = {};
  }

  return {
    id: row.id as string,
    offence_type: row.offence_type as string,
    risk_level: row.risk_level as OfcomRiskLevel,
    assessment_summary: row.assessment_summary as string,
    mitigation_measures,
    assessed_by: row.assessed_by as string,
    assessment_date: row.assessment_date as string,
    next_review_date: (row.next_review_date as string) ?? null,
    created_at: row.created_at as string,
    assessment_type: (row.assessment_type as OfcomAssessmentType) ?? 'illegal_content',
  };
}

/**
 * Ofcom requires review within 3 months of launch and before significant
 * product changes. We default the next review to 3 months after the
 * assessment date unless the caller provides an explicit value.
 */
function defaultNextReviewDate(assessmentDate: Date): Date {
  const next = new Date(assessmentDate);
  next.setMonth(next.getMonth() + 3);
  return next;
}

// ── Section 11: Children's risk assessment ────────────────────────────────
//
// The UK Online Safety Act Section 11 requires a separate children's risk
// assessment for services likely to be accessed by children. The assessment
// evaluates the likelihood of children encountering harmful content across
// defined age groups and risk factors, and records mitigation measures.

/** Risk factor categories for the Section 11 children's assessment. */
export const CHILDREN_RISK_FACTORS = [
  'content_that_ENCOURAGES_RISK_TAKING_BEHAVIOUR',
  'content_that_PROMOTES_EATING_DISORDERS',
  'content_that_DEPICTS_SEXUAL_MATERIAL',
  'content_that_DEPICTS_VIOLENCE',
  'content_that_PROMOTES_SELF_HARM',
  'content_that_PROMOTES_DRUG_USE',
  'content_that_PROMOTES_ALCOHOL_USE',
  'content_that_CONTAINS_GROOMING_BEHAVIOUR',
] as const;

export interface ChildrenRiskFactor {
  factor: string;
  likelihood: 'low' | 'medium' | 'high';
  impact: 'low' | 'medium' | 'high';
  mitigation: string;
}

/**
 * Create a Section 11 children's risk assessment record. The risk factors
 * and age groups are stored in `mitigation_measures`; the overall risk level
 * is derived from the factor likelihood/impact ratings.
 */
export async function createChildrenRiskAssessment(
  db: Pool,
  input: {
    assessed_by: string;
    age_groups: string[]; // e.g. ['0-5', '6-12', '13-17']
    risk_factors: ChildrenRiskFactor[];
    overall_summary: string;
    next_review_date?: Date;
  },
): Promise<RiskAssessmentRecord> {
  return createRiskAssessmentRecord(db, {
    offence_type: 'child_sexual_abuse',
    risk_level: computeOverallRiskLevel(input.risk_factors),
    assessment_summary: input.overall_summary,
    mitigation_measures: {
      age_groups: input.age_groups,
      risk_factors: input.risk_factors,
    },
    assessed_by: input.assessed_by,
    assessment_type: 'children',
    next_review_date: input.next_review_date,
  });
}

/** Derive the overall risk level from the individual factor ratings. */
function computeOverallRiskLevel(factors: ChildrenRiskFactor[]): OfcomRiskLevel {
  const highCount = factors.filter((f) => f.likelihood === 'high' || f.impact === 'high').length;
  const mediumCount = factors.filter((f) => f.likelihood === 'medium' || f.impact === 'medium').length;
  if (highCount > 0) return 'high';
  if (mediumCount > 2) return 'high';
  if (mediumCount > 0) return 'medium';
  return 'low';
}

/** List all Section 11 children's risk assessments, newest first. */
export async function listChildrenRiskAssessments(db: Pool): Promise<RiskAssessmentRecord[]> {
  await ensureSchema(db);
  const result = await db.query(
    `SELECT * FROM ofcom_risk_assessments WHERE assessment_type = 'children' ORDER BY assessment_date DESC`,
  );
  return result.rows.map(mapRiskAssessmentRow);
}
