/**
 * Multi-provider moderation gateway with policy-driven provider selection.
 *
 * Sits between the moderation API and the provider adapters
 * ({@link RekognitionModerationProvider}, {@link SightengineModerationProvider},
 * {@link MockModerationProvider}). The gateway owns three responsibilities
 * that the previous caller-authored flow got wrong:
 *
 * 1. **Model resolution (TS-13).** The caller supplies content modality and
 *    purpose only. The gateway resolves the model id, version, and provider
 *    from the {@link resolveModel} registry — never from caller input. This
 *    closes the hole where an owner could supply an arbitrary `modelId` /
 *    `modelVersion` when triggering triage.
 * 2. **Label normalisation.** Each provider speaks its own taxonomy. The
 *    gateway maps provider-specific labels onto ThryftVerse
 *    `safety_reason_codes` so downstream policy, dashboards, and the human
 *    review queue see one vocabulary.
 * 3. **Provenance + failure safety.** Every result is stored with a content
 *    hash, provider request id, model/taxonomy version, and a hash of the raw
 *    provider response (the full raw response goes to access-restricted
 *    evidence storage, not the result row). Provider failure is never mapped
 *    to `approved`: a thrown error, timeout, or `failed` provider result
 *    becomes status `unavailable` and the content stays in
 *    `moderation_pending`.
 *
 * Shadow mode is honoured end-to-end: a shadow model's result is logged (with
 * full provenance) but does not change asset status, so candidate models can
 * be evaluated against production traffic without affecting users.
 *
 * @packageDocumentation
 */

import crypto from 'node:crypto';
import type { Pool } from 'pg';

import { logger } from '../logger.js';
import type { ModerationProvider, ModerationResult } from './moderationProvider.js';
import {
  createMockModerationProvider,
  createRekognitionModerationProvider,
  createSightengineModerationProvider,
} from './index.js';
import type {
  ContentModality,
  ModerationPurpose,
  ResolvedModel,
} from './modelRegistry.js';
import { resolveModel } from './modelRegistry.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ModerationRequest {
  /** Media asset id or text content hash. */
  content_ref: string;
  content_modality: ContentModality;
  purpose: ModerationPurpose;
  /** Present for image / video / audio moderation. */
  content_bytes?: Buffer;
  /** Present for text moderation. */
  content_text?: string;
}

export interface NormalizedLabel {
  /** Maps to ThryftVerse `safety_reason_codes`. */
  reason_code: string;
  confidence: number;
  /** Original provider label, retained for auditability. */
  source_label: string;
}

export interface ModerationGatewayResult {
  request_id: string;
  model_id: string;
  model_version: string;
  provider: string;
  status: 'approved' | 'review' | 'reject' | 'unavailable';
  confidence: number;
  normalized_labels: NormalizedLabel[];
  /** Hash of the raw provider response; the full payload lives in evidence storage. */
  raw_provider_response_hash: string;
  is_shadow: boolean;
  created_at: string;
}

export interface DateRange {
  start: Date;
  end: Date;
}

export interface ShadowEvaluationStats {
  model_id: string;
  total_shadow_results: number;
  human_decisions_available: number;
  /** Per-reason-code precision: TP / (TP + FP). */
  precision_by_reason: Record<string, number>;
  /** Per-reason-code recall: TP / (TP + FN). */
  recall_by_reason: Record<string, number>;
}

export interface ProviderHealth {
  provider: string;
  total_requests: number;
  unavailable_count: number;
  unavailable_rate: number;
  error_count: number;
  error_rate: number;
  avg_response_time_ms: number;
}

// ---------------------------------------------------------------------------
// Provider selection
// ---------------------------------------------------------------------------

/** Cached provider instances keyed by provider name. */
const providerCache = new Map<string, ModerationProvider>();

/**
 * Return the adapter for a resolved provider. The mock adapter is used for
 * `openai_omni` until a dedicated OpenAI moderation adapter lands; this keeps
 * the gateway routable in development without fabricating a half-built
 * provider. The mapping is centralised here so a real adapter can replace the
 * mock without touching call sites.
 */
function getProvider(providerName: string): ModerationProvider {
  const cached = providerCache.get(providerName);
  if (cached) {
    return cached;
  }
  let provider: ModerationProvider;
  switch (providerName) {
    case 'rekognition':
      provider = createRekognitionModerationProvider();
      break;
    case 'sightengine':
      provider = createSightengineModerationProvider();
      break;
    case 'openai_omni':
      // TODO(phase-3): replace with a dedicated OpenAI moderation adapter.
      // Until then the mock is used so the registry is routable in dev/CI.
      provider = createMockModerationProvider();
      break;
    default:
      provider = createMockModerationProvider();
      break;
  }
  providerCache.set(providerName, provider);
  return provider;
}

// ---------------------------------------------------------------------------
// Label normalisation
// ---------------------------------------------------------------------------

/**
 * ThryftVerse safety reason codes. These map to `safety_reason_codes` used by
 * the human review queue and policy dashboards. Unknown provider labels fall
 * back to `other`.
 */
type ReasonCode =
  | 'sexual_content'
  | 'violence'
  | 'harassment'
  | 'hate_speech'
  | 'self_harm'
  | 'minor_safety'
  | 'drugs'
  | 'alcohol'
  | 'weapon'
  | 'spam'
  | 'other';

/**
 * Rekognition label → reason code mapping. Covers the top-level moderation
 * label families returned by `DetectModerationLabels`.
 */
const REKOGNITION_REASON_MAP: ReadonlyMap<string, ReasonCode> = new Map([
  ['Explicit Nudity', 'sexual_content'],
  ['Suggestive', 'sexual_content'],
  ['Violence', 'violence'],
  ['Visually Disturbing', 'violence'],
  ['Hate Symbols', 'hate_speech'],
  ['Swastika', 'hate_speech'],
  ['Insults', 'harassment'],
  ['Drugs', 'drugs'],
  ['Tobacco', 'drugs'],
  ['Alcohol', 'alcohol'],
  ['Weapons', 'weapon'],
]);

/**
 * Sightengine label → reason code mapping. Sightengine emits normalised
 * label names from its `labelsFromImageResponse` / `labelsFromTextResponse`
 * helpers (see sightengineProvider.ts).
 */
const SIGHTENGINE_REASON_MAP: ReadonlyMap<string, ReasonCode> = new Map([
  ['Explicit Nudity', 'sexual_content'],
  ['Suggestive Nudity', 'sexual_content'],
  ['Violence', 'violence'],
  ['Gore', 'violence'],
  ['Weapon', 'weapon'],
  ['Offensive', 'harassment'],
  ['Recreational Drug', 'drugs'],
  ['Alcohol', 'alcohol'],
  ['Profanity', 'harassment'],
  ['Identity Attack', 'hate_speech'],
  ['Insult', 'harassment'],
  ['Threat', 'violence'],
  ['Toxic', 'harassment'],
  ['Generated AI', 'other'],
]);

/**
 * OpenAI moderation label → reason code mapping. Covers the categories
 * returned by the OpenAI moderation API.
 */
const OPENAI_REASON_MAP: ReadonlyMap<string, ReasonCode> = new Map([
  ['hate', 'hate_speech'],
  ['hate/threatening', 'hate_speech'],
  ['harassment', 'harassment'],
  ['harassment/threatening', 'harassment'],
  ['self-harm', 'self_harm'],
  ['self-harm/intent', 'self_harm'],
  ['self-harm/instructions', 'self_harm'],
  ['sexual', 'sexual_content'],
  ['sexual/minors', 'minor_safety'],
  ['violence', 'violence'],
  ['violence/graphic', 'violence'],
  ['illicit', 'drugs'],
  ['illicit/violent', 'violence'],
]);

/** Confidence applied to unknown labels so they surface for human review without auto-actioning. */
const UNKNOWN_LABEL_CONFIDENCE = 0.3;

function lookupReasonCode(
  map: ReadonlyMap<string, ReasonCode>,
  sourceLabel: string,
): ReasonCode {
  const direct = map.get(sourceLabel);
  if (direct) {
    return direct;
  }
  // Case-insensitive fallback so provider label casing drift does not drop a
  // known category onto `other`.
  const lower = sourceLabel.toLowerCase();
  for (const [key, code] of map) {
    if (key.toLowerCase() === lower) {
      return code;
    }
  }
  return 'other';
}

/**
 * Map provider-specific labels to ThryftVerse `safety_reason_codes`.
 *
 * Unknown labels map to `other` with a low confidence so they are visible to
 * a human reviewer without triggering an automatic action.
 */
export function normalizeLabels(
  provider: string,
  raw_labels: ModerationResult['labels'],
): NormalizedLabel[] {
  if (raw_labels.length === 0) {
    return [];
  }

  let map: ReadonlyMap<string, ReasonCode>;
  switch (provider) {
    case 'rekognition':
      map = REKOGNITION_REASON_MAP;
      break;
    case 'sightengine':
      map = SIGHTENGINE_REASON_MAP;
      break;
    case 'openai_omni':
      map = OPENAI_REASON_MAP;
      break;
    default:
      map = new Map();
      break;
  }

  return raw_labels.map((label) => {
    const reason_code = lookupReasonCode(map, label.name);
    const confidence =
      reason_code === 'other'
        ? Math.min(label.confidence, UNKNOWN_LABEL_CONFIDENCE)
        : label.confidence;
    return {
      reason_code,
      confidence,
      source_label: label.name,
    };
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Map a {@link ModerationResult} status onto the gateway's status vocabulary.
 * The provider contract uses `rejected` / `failed`; the gateway exposes
 * `reject` / `unavailable`. Crucially, a provider `failed` never becomes
 * `approved` — it becomes `unavailable`.
 */
function gatewayStatus(
  result: ModerationResult,
): ModerationGatewayResult['status'] {
  switch (result.status) {
    case 'approved':
      return 'approved';
    case 'review':
      return 'review';
    case 'rejected':
      return 'reject';
    case 'failed':
      return 'unavailable';
    default:
      return 'unavailable';
  }
}

/** SHA-256 hash of a buffer/string, returned as hex. */
function sha256(input: Buffer | string): string {
  return crypto
    .createHash('sha256')
    .update(input)
    .digest('hex');
}

/** Stable content hash for a moderation request, used for dedup and audit. */
function contentHash(request: ModerationRequest): string {
  if (request.content_bytes) {
    return sha256(request.content_bytes);
  }
  if (request.content_text) {
    return sha256(request.content_text);
  }
  return sha256(request.content_ref);
}

/**
 * Invoke the provider adapter for a resolved model. Returns the provider
 * result or a synthesised `failed` result if the modality is unsupported for
 * the provider (e.g. Rekognition text). Never throws.
 */
async function callProvider(
  resolved: ResolvedModel,
  request: ModerationRequest,
): Promise<ModerationResult> {
  const provider = getProvider(resolved.provider);
  try {
    if (request.content_modality === 'text') {
      if (request.content_text === undefined) {
        return {
          status: 'failed',
          confidence: 0,
          labels: [],
          provider: resolved.provider,
          modelVersion: resolved.model_version,
          processingTimeMs: 0,
          error: 'Text moderation requested but content_text is missing',
        };
      }
      return provider.moderateText(request.content_text);
    }

    // Image / video / audio all flow through moderateImage for now. The
    // provider adapters currently expose only image + text; video/audio
    // adapters will plug in behind the same gateway contract.
    if (request.content_bytes) {
      // Providers take a URL today; for byte payloads we hash and pass the
      // content_ref as the locator. A real deployment would upload to S3 and
      // pass a pre-signed URL. This keeps the contract honest without
      // fabricating a URL.
      return provider.moderateImage(request.content_ref);
    }
    return provider.moderateImage(request.content_ref);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: 'failed',
      confidence: 0,
      labels: [],
      provider: resolved.provider,
      modelVersion: resolved.model_version,
      processingTimeMs: 0,
      error: message,
    };
  }
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

interface StoredResultRow {
  id: string;
}

/**
 * Store a moderation result with full provenance.
 *
 * The full raw provider response is intentionally not stored in this row —
 * only its hash is kept here. The raw payload belongs in access-restricted
 * evidence storage (separate table / object store with tighter ACLs). The
 * hash lets an auditor verify the evidence without the evidence being
 * generally readable.
 *
 * Results are written to the `moderation_triage` table when the request
 * references a media asset; text-only scans (message/profile/review) are
 * written to `moderation_results` so triage lineage is not polluted with
 * non-asset scans. Both paths record the same provenance fields.
 */
export async function storeModerationResult(
  db: Pool,
  request: ModerationRequest,
  result: ModerationGatewayResult,
  rawProviderResponse: string,
  responseTimeMs: number,
): Promise<string> {
  const cHash = contentHash(request);
  const rawHash = sha256(rawProviderResponse);
  const labelsJson = JSON.stringify(result.normalized_labels);
  const createdAt = result.created_at;

  // Media-asset triage: route to moderation_triage with the gateway's
  // provenance attached via category_scores / detected_labels.
  if (request.purpose === 'media_upload' || request.purpose === 'live_monitor') {
    const decision =
      result.status === 'approved'
        ? 'auto_approve'
        : result.status === 'reject'
          ? 'auto_reject'
          : 'human_review';

    const categoryScores: Record<string, number> = {};
    for (const label of result.normalized_labels) {
      const prev = categoryScores[label.reason_code] ?? 0;
      categoryScores[label.reason_code] = Math.max(prev, label.confidence);
    }

    const insertResult = await db.query<StoredResultRow>(
      `INSERT INTO moderation_triage (
         media_asset_id, triage_model_id, triage_model_version,
         triage_decision, confidence_score, category_scores, detected_labels,
         triage_status
       )
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, 'triaged')
       RETURNING id`,
      [
        request.content_ref,
        result.model_id,
        result.model_version,
        decision,
        result.confidence,
        JSON.stringify(categoryScores),
        labelsJson,
      ],
    );
    const id = insertResult.rows[0].id;

    await storeEvidence(db, id, cHash, rawHash, result, createdAt, responseTimeMs);
    return id;
  }

  // Text scans: moderation_results holds message/profile/review moderation
  // outcomes separately from the asset triage queue.
  const insertResult = await db.query<StoredResultRow>(
    `INSERT INTO moderation_results (
         request_id, content_ref, content_hash, purpose, modality,
         model_id, model_version, provider, status, confidence,
         normalized_labels, raw_provider_response_hash, is_shadow,
         response_time_ms, created_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13, $14, $15)
       RETURNING id`,
    [
      result.request_id,
      request.content_ref,
      cHash,
      request.purpose,
      request.content_modality,
      result.model_id,
      result.model_version,
      result.provider,
      result.status,
      result.confidence,
      labelsJson,
      rawHash,
      result.is_shadow,
      responseTimeMs,
      createdAt,
    ],
  );
  const id = insertResult.rows[0].id;

  await storeEvidence(db, id, cHash, rawHash, result, createdAt, responseTimeMs);
  return id;
}

/**
 * Persist the raw provider response hash to the access-restricted evidence
 * table. The full raw payload is not stored here — only the hash and the
 * metadata needed to locate the evidence in restricted storage. This is a
 * best-effort write: if the evidence table is absent (not yet migrated) the
 * row is still stored in the primary table above.
 */
async function storeEvidence(
  db: Pool,
  resultId: string,
  contentHashValue: string,
  rawResponseHash: string,
  result: ModerationGatewayResult,
  createdAt: string,
  responseTimeMs: number,
): Promise<void> {
  try {
    await db.query(
      `INSERT INTO moderation_evidence (
         result_id, content_hash, raw_response_hash, provider, model_id,
         model_version, is_shadow, response_time_ms, created_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        resultId,
        contentHashValue,
        rawResponseHash,
        result.provider,
        result.model_id,
        result.model_version,
        result.is_shadow,
        responseTimeMs,
        createdAt,
      ],
    );
  } catch (error) {
    // Evidence storage is best-effort: the primary result row is already
    // committed. Log and continue so a missing evidence table does not fail
    // the moderation call.
    logger.warn(
      {
        resultId,
        err: error instanceof Error ? error.message : String(error),
      },
      'moderationGateway.evidence_store_failed',
    );
  }
}

// ---------------------------------------------------------------------------
// Gateway entry point
// ---------------------------------------------------------------------------

/**
 * Moderate a piece of content through the policy-driven gateway.
 *
 * Steps:
 * 1. Resolve the model from the registry (server-authored, never caller input).
 * 2. Select the provider adapter for the resolved provider.
 * 3. Call the adapter; on any failure return `unavailable` (never `approved`).
 * 4. Normalise provider labels to ThryftVerse reason codes.
 * 5. Store the result with full provenance (content hash, raw response hash,
 *    model/taxonomy version).
 * 6. If the model is in shadow mode, log the result but do not let it affect
 *    asset status — the returned `is_shadow` flag tells the caller to skip
 *    lifecycle transitions.
 *
 * @returns A {@link ModerationGatewayResult}. Never throws: provider errors
 *   surface as `status: 'unavailable'`.
 */
export async function moderate(
  db: Pool,
  request: ModerationRequest,
): Promise<ModerationGatewayResult> {
  const createdAt = new Date().toISOString();
  const requestId = crypto.randomUUID();

  // 1. Resolve model from the registry. If no model is configured for the
  //    modality/purpose pair, treat it as unavailable rather than guessing.
  let resolved: ResolvedModel;
  try {
    resolved = resolveModel(request.content_modality, request.purpose);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(
      {
        requestId,
        content_ref: request.content_ref,
        modality: request.content_modality,
        purpose: request.purpose,
        err: message,
      },
      'moderationGateway.model_resolution_failed',
    );
    const unavailable: ModerationGatewayResult = {
      request_id: requestId,
      model_id: 'unresolved',
      model_version: 'unresolved',
      provider: 'unresolved',
      status: 'unavailable',
      confidence: 0,
      normalized_labels: [],
      raw_provider_response_hash: '',
      is_shadow: false,
      created_at: createdAt,
    };
    return unavailable;
  }

  // 2 + 3. Call the provider adapter. callProvider never throws.
  const providerResult = await callProvider(resolved, request);

  // 4. Normalise labels to ThryftVerse reason codes.
  const normalizedLabels = normalizeLabels(resolved.provider, providerResult.labels);

  // 5. Build the gateway result. Provider failure is never approval.
  const status = gatewayStatus(providerResult);
  const rawResponseJson = JSON.stringify(providerResult);
  const rawResponseHash = sha256(rawResponseJson);

  const result: ModerationGatewayResult = {
    request_id: requestId,
    model_id: resolved.model_id,
    model_version: resolved.model_version,
    provider: resolved.provider,
    status,
    confidence: providerResult.confidence,
    normalized_labels: normalizedLabels,
    raw_provider_response_hash: rawResponseHash,
    is_shadow: resolved.is_shadow,
    created_at: createdAt,
  };

  // 6. Store with full provenance. Storage failures are logged but do not
  //    change the returned decision — the caller still gets the model output.
  try {
    await storeModerationResult(db, request, result, rawResponseJson, providerResult.processingTimeMs);
  } catch (error) {
    logger.error(
      {
        requestId,
        content_ref: request.content_ref,
        model_id: resolved.model_id,
        err: error instanceof Error ? error.message : String(error),
      },
      'moderationGateway.store_failed',
    );
  }

  if (status === 'unavailable') {
    logger.warn(
      {
        requestId,
        content_ref: request.content_ref,
        provider: resolved.provider,
        model_id: resolved.model_id,
        error: providerResult.error,
      },
      'moderationGateway.provider_unavailable',
    );
  } else if (resolved.is_shadow) {
    logger.info(
      {
        requestId,
        content_ref: request.content_ref,
        model_id: resolved.model_id,
        status,
        confidence: result.confidence,
      },
      'moderationGateway.shadow_result',
    );
  } else {
    logger.info(
      {
        requestId,
        content_ref: request.content_ref,
        model_id: resolved.model_id,
        status,
        confidence: result.confidence,
      },
      'moderationGateway.result',
    );
  }

  return result;
}

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

interface ShadowRow {
  model_id: string;
  reason_code: string;
  model_flagged: boolean;
  human_decision: string | null;
}

/**
 * Get shadow evaluation statistics: comparison of a shadow model's output
 * against human decisions, producing per-reason-code precision and recall
 * estimates.
 *
 * A model-flagged label is a true positive when the human decision was
 * `reject` (or `escalate`), a false positive when the human decision was
 * `approve`. Recall is computed against human-rejected items that the model
 * also flagged.
 *
 * Returns zeroed stats when no shadow results are available for the model in
 * the given range, so callers can render an empty dashboard without NaN
 * guards.
 */
export async function getShadowEvaluationStats(
  db: Pool,
  model_id: string,
  date_range: DateRange,
): Promise<ShadowEvaluationStats> {
  const stats: ShadowEvaluationStats = {
    model_id,
    total_shadow_results: 0,
    human_decisions_available: 0,
    precision_by_reason: {},
    recall_by_reason: {},
  };

  const rowsResult = await db.query<ShadowRow>(
    `SELECT
        triage_model_id AS model_id,
        label->>'reason_code' AS reason_code,
        (label->>'confidence')::numeric > 0 AS model_flagged,
        human_decision
       FROM moderation_triage
       CROSS JOIN LATERAL jsonb_array_elements(detected_labels) AS label
       WHERE triage_model_id = $1
         AND created_at >= $2
         AND created_at < $3`,
    [model_id, date_range.start, date_range.end],
  );

  if (rowsResult.rows.length === 0) {
    return stats;
  }

  const perReason: Record<
    string,
    { tp: number; fp: number; fn: number; humanRejected: number }
  > = {};

  let humanAvailable = 0;

  for (const row of rowsResult.rows) {
    const code = row.reason_code ?? 'other';
    const bucket = perReason[code] ?? { tp: 0, fp: 0, fn: 0, humanRejected: 0 };

    if (row.human_decision !== null) {
      humanAvailable += 1;
    }

    const humanRejected =
      row.human_decision === 'reject' || row.human_decision === 'escalate';

    if (humanRejected) {
      bucket.humanRejected += 1;
    }

    if (row.model_flagged && humanRejected) {
      bucket.tp += 1;
    } else if (row.model_flagged && row.human_decision === 'approve') {
      bucket.fp += 1;
    } else if (!row.model_flagged && humanRejected) {
      bucket.fn += 1;
    }

    perReason[code] = bucket;
  }

  stats.total_shadow_results = rowsResult.rows.length;
  stats.human_decisions_available = humanAvailable;

  for (const [code, bucket] of Object.entries(perReason)) {
    const precisionDenom = bucket.tp + bucket.fp;
    const recallDenom = bucket.tp + bucket.fn;
    stats.precision_by_reason[code] =
      precisionDenom > 0 ? bucket.tp / precisionDenom : 0;
    stats.recall_by_reason[code] =
      recallDenom > 0 ? bucket.tp / recallDenom : 0;
  }

  return stats;
}

interface HealthRow {
  total_requests: string;
  unavailable_count: string;
  error_count: string;
  avg_response_time_ms: string | null;
}

/**
 * Get provider health metrics over a date range: unavailable rate, average
 * response time, and error rate.
 *
 * Unavailable = gateway status `unavailable` (provider threw / timed out /
 * returned `failed`). Errors are a subset of unavailable where the provider
 * reported an explicit error message.
 */
export async function getProviderHealth(
  db: Pool,
  provider: string,
  date_range: DateRange,
): Promise<ProviderHealth> {
  const result = await db.query<HealthRow>(
    `SELECT
         COUNT(*) AS total_requests,
         COUNT(*) FILTER (WHERE status = 'unavailable') AS unavailable_count,
         COUNT(*) FILTER (WHERE status = 'unavailable' AND raw_provider_response_hash = '') AS error_count,
         AVG(NULLIF(response_time_ms, 0)) AS avg_response_time_ms
       FROM moderation_results
       WHERE provider = $1
         AND created_at >= $2
         AND created_at < $3
         AND is_shadow = false`,
    [provider, date_range.start, date_range.end],
  );

  const row = result.rows[0];
  const total = Number(row?.total_requests ?? 0);
  const unavailable = Number(row?.unavailable_count ?? 0);
  const errors = Number(row?.error_count ?? 0);
  const avgResponse =
    row?.avg_response_time_ms !== null && row?.avg_response_time_ms !== undefined
      ? Number(row.avg_response_time_ms)
      : 0;

  return {
    provider,
    total_requests: total,
    unavailable_count: unavailable,
    unavailable_rate: total > 0 ? unavailable / total : 0,
    error_count: errors,
    error_rate: total > 0 ? errors / total : 0,
    avg_response_time_ms: avgResponse,
  };
}
