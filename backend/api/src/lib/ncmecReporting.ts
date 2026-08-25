import type { Pool } from 'pg';

import { logger } from './logger.js';

// ── NCMEC CyberTipline reporting ─────────────────────────────────────────
//
// For US operations, detection of CSAM (child sexual abuse material) imposes a
// statutory reporting obligation under 18 U.S.C. § 2258A. Electronic Service
// Providers must submit reports to the NCMEC CyberTipline. Reports are
// submitted via the NCMEC ESP Portal API with a registered account (Basic
// auth). See https://www.missingkids.org/gethelpnow/cybertipline.
//
// Submission is best-effort with alerting: a failure is logged at error level
// so on-call can retry manually. The call is fire-and-forget from the
// decision path — it must never block enforcement.

const NCMEC_API_URL = 'https://report.cybertip.org/ispcr/api';
const NCMEC_TIMEOUT_MS = 30_000;

export interface NcmecReportInput {
  caseId: string;
  reporterId: string | null;
  subjectId: string;
  contentUrl: string;
  contentHash: string;
  detectedCategories: string[];
  detectionMethod: 'automated' | 'human_review';
  moderatorId: string;
  incidentDate: string; // ISO datetime
}

export interface NcmecReportResult {
  reportId: string | null;
  success: boolean;
  error?: string;
  submittedAt: string;
}

/**
 * Submit a CyberTipline report to NCMEC for CSAM content.
 *
 * This is a statutory obligation under 18 U.S.C. § 2258A. Best-effort with
 * alerting: if submission fails, an alert must be raised (logged at error
 * level). The caller should invoke this fire-and-forget so it never blocks
 * the enforcement decision.
 */
export async function submitNcmecReport(
  db: Pool,
  input: NcmecReportInput,
): Promise<NcmecReportResult> {
  const username = process.env.NCMEC_USERNAME;
  const password = process.env.NCMEC_PASSWORD;

  if (!username || !password) {
    logger.error(
      { caseId: input.caseId },
      'ncmecReporting: NCMEC credentials not configured. CSAM report cannot be submitted.',
    );
    return {
      reportId: null,
      success: false,
      error: 'NCMEC credentials not configured',
      submittedAt: new Date().toISOString(),
    };
  }

  try {
    const report = buildNcmecReport(input);
    const response = await fetchWithTimeout(
      `${NCMEC_API_URL}/submit`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
          'Content-Type': 'application/xml',
        },
        body: report,
      },
      NCMEC_TIMEOUT_MS,
    );

    if (response.status === 200 || response.status === 201) {
      const body = await response.text();
      const reportId = parseNcmecReportId(body);

      // Record the report in the database.
      await db.query(
        `INSERT INTO ncmec_reports (id, case_id, ncmec_report_id, submitted_by, submitted_at, status)
         VALUES ($1, $2, $3, $4, NOW(), 'submitted')
         ON CONFLICT DO NOTHING`,
        [`ncmec_${input.caseId}_${Date.now()}`, input.caseId, reportId, input.moderatorId],
      );

      logger.info(
        { caseId: input.caseId, ncmecReportId: reportId },
        'ncmecReporting: CSAM report submitted to NCMEC',
      );

      return {
        reportId,
        success: true,
        submittedAt: new Date().toISOString(),
      };
    }

    logger.error(
      { caseId: input.caseId, status: response.status },
      'ncmecReporting: NCMEC submission failed',
    );
    return {
      reportId: null,
      success: false,
      error: `NCMEC API returned ${response.status}`,
      submittedAt: new Date().toISOString(),
    };
  } catch (error) {
    logger.error({ caseId: input.caseId, error }, 'ncmecReporting: NCMEC submission error');
    return {
      reportId: null,
      success: false,
      error: error instanceof Error ? error.message : String(error),
      submittedAt: new Date().toISOString(),
    };
  }
}

/**
 * Check if a case has already been reported to NCMEC.
 */
export async function hasNcmecReport(db: Pool, caseId: string): Promise<boolean> {
  const result = await db.query('SELECT 1 FROM ncmec_reports WHERE case_id = $1 LIMIT 1', [caseId]);
  return result.rows.length > 0;
}

// ── Helpers ─────────────────────────────────────────────────────────────

function buildNcmecReport(input: NcmecReportInput): string {
  // NCMEC CyberTipline XML report format.
  // See: https://www.missingkids.org/gethelpnow/cybertipline
  return `<?xml version="1.0" encoding="UTF-8"?>
<report>
  <incidentType>Child Pornography (CP)</incidentType>
  <incidentDate>${input.incidentDate}</incidentDate>
  <reporter>
    <reportingEntityType>Electronic Service Provider</reportingEntityType>
    <reportingEntityId>${process.env.NCMEC_ORG_ID ?? ''}</reportingEntityId>
  </reporter>
  <subject>
    <subjectId>${input.subjectId}</subjectId>
  </subject>
  <url>${input.contentUrl}</url>
  <fileHash>${input.contentHash}</fileHash>
  <detectionMethod>${input.detectionMethod}</detectionMethod>
  <categories>${input.detectedCategories.join(',')}</categories>
  <caseId>${input.caseId}</caseId>
</report>`;
}

function parseNcmecReportId(xml: string): string | null {
  const match = xml.match(/<reportId>([^<]+)<\/reportId>/);
  return match?.[1] ?? null;
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}
