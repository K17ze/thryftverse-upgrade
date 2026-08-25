import { logger } from './logger.js';

// ── DSA Transparency Database API submission client ──────────────────────
//
// Submits statements of reasons to the European Commission's DSA
// Transparency Database (https://transparency.dsa.ec.europa.eu). The API
// accepts batches of up to 100 statements per request, uses Bearer-token
// authentication, and returns 422 for statements whose PUID already exists
// (idempotent re-submission).
//
// This client is intentionally resilient: it batches, retries server errors
// and network failures with exponential backoff, and treats duplicate-PUID
// 422 responses as success so that re-submission after a partial failure is
// safe.

const DSA_DB_BASE_URL = 'https://transparency.dsa.ec.europa.eu/api/v1';
const DSA_DB_BATCH_SIZE = 100;
const DSA_DB_TIMEOUT_MS = 30_000;
const DSA_DB_MAX_RETRIES = 3;

export interface DsaSubmissionResult {
  puid: string;
  success: boolean;
  error?: string;
  submittedAt: string;
}

export interface DsaBatchSubmissionResult {
  total: number;
  succeeded: number;
  failed: number;
  results: DsaSubmissionResult[];
}

/**
 * Submit a batch of statements to the DSA Transparency Database.
 *
 * Handles batching (100 statements per request), retries with exponential
 * backoff on 5xx and network errors, and duplicate-PUID detection: a 422
 * response indicates the PUID was already submitted, which is treated as
 * success so that re-submission after a partial failure is idempotent.
 *
 * When `options.dryRun` is set, no HTTP calls are made and every statement is
 * reported as successful — useful for pre-flight validation in the ops
 * console before a real submission.
 */
export async function submitToDsaDatabase(
  statements: Array<Record<string, unknown>>,
  options?: { dryRun?: boolean },
): Promise<DsaBatchSubmissionResult> {
  const token = process.env.DSA_DB_API_TOKEN;
  if (!token && !options?.dryRun) {
    throw new Error(
      'DSA_DB_API_TOKEN is not configured. Cannot submit to DSA Transparency Database.',
    );
  }

  const results: DsaSubmissionResult[] = [];
  const batches = chunk(statements, DSA_DB_BATCH_SIZE);

  for (const batch of batches) {
    for (let attempt = 0; attempt < DSA_DB_MAX_RETRIES; attempt++) {
      try {
        if (options?.dryRun) {
          for (const stmt of batch) {
            results.push({
              puid: stmt.puid as string,
              success: true,
              submittedAt: new Date().toISOString(),
            });
          }
          break;
        }

        const response = await fetchWithTimeout(
          `${DSA_DB_BASE_URL}/statement`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ statements: batch }),
          },
          DSA_DB_TIMEOUT_MS,
        );

        if (response.status === 200 || response.status === 201) {
          const body = (await response.json()) as {
            results: Array<{ puid: string; status: string }>;
          };
          for (const r of body.results) {
            results.push({
              puid: r.puid,
              success: true,
              submittedAt: new Date().toISOString(),
            });
          }
          break;
        } else if (response.status === 422) {
          // Duplicate PUID — already submitted. Treat as success so that
          // re-submission after a partial failure is idempotent.
          const body = (await response.json()) as {
            errors: Array<{ puid: string; message: string }>;
          };
          for (const err of body.errors) {
            results.push({
              puid: err.puid,
              success: true,
              error: 'Already submitted (duplicate PUID)',
              submittedAt: new Date().toISOString(),
            });
          }
          break;
        } else if (response.status >= 500 && attempt < DSA_DB_MAX_RETRIES - 1) {
          const delay = Math.pow(2, attempt) * 1000;
          logger.warn(
            { status: response.status, delay, attempt },
            'dsaSubmissionClient: server error, retrying',
          );
          await sleep(delay);
          continue;
        } else {
          const body = await response.text();
          for (const stmt of batch) {
            results.push({
              puid: stmt.puid as string,
              success: false,
              error: `HTTP ${response.status}: ${body}`,
              submittedAt: new Date().toISOString(),
            });
          }
          break;
        }
      } catch (error) {
        if (attempt < DSA_DB_MAX_RETRIES - 1) {
          const delay = Math.pow(2, attempt) * 1000;
          logger.warn(
            { error, delay, attempt },
            'dsaSubmissionClient: network error, retrying',
          );
          await sleep(delay);
          continue;
        }
        for (const stmt of batch) {
          results.push({
            puid: stmt.puid as string,
            success: false,
            error: (error as Error).message,
            submittedAt: new Date().toISOString(),
          });
        }
        break;
      }
    }
  }

  return {
    total: statements.length,
    succeeded: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    results,
  };
}

/**
 * Check whether a PUID already exists in the DSA Transparency Database.
 *
 * GET /api/v1/statement/existing-puid/<PUID> returns 200 when the PUID is
 * already present. This is a best-effort check: on any error the function
 * returns `false` so that the caller still attempts submission (the POST
 * endpoint handles duplicates idempotently via 422).
 */
export async function checkPuidExists(puid: string): Promise<boolean> {
  const token = process.env.DSA_DB_API_TOKEN;
  if (!token) return false;

  try {
    const response = await fetchWithTimeout(
      `${DSA_DB_BASE_URL}/statement/existing-puid/${encodeURIComponent(puid)}`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      },
      DSA_DB_TIMEOUT_MS,
    );
    return response.status === 200;
  } catch {
    return false;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
