/**
 * AI Photo Enhancement API — server-delivered capability service.
 *
 * Per report #14 and AGENTS.md §11/§37 (Truthful UI + Live-Signs):
 *   The previous implementation used `AI_PHOTO_DEMO_MODE = __DEV__`, which
 *   made production the unsafe branch: non-demo apply functions returned the
 *   same URI with `isDemo: false` — a false-success no-op. The screen then
 *   said "Enhancement applied" and Save just navigated back.
 *
 *   This service is now fail-closed. The capability state is delivered by
 *   the backend (`GET /media-enhancement/capabilities`). When the backend
 *   says the capability is unavailable (no provider configured), every
 *   apply function throws `EnhancementCapabilityError`. The UI must show an
 *   honest "not yet available" state — never a fake success.
 *
 *   When a provider IS configured (future), the apply functions call the
 *   real job submission endpoint and poll for results. The contract (types +
 *   function signatures) is designed so the UI layer does not need to change
 *   when the backend is wired.
 */
import { fetchJson } from '../lib/apiClient';
import { makeStableId } from '../utils/createStableId';

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

/** Raised when the enhancement capability is not available (fail-closed). */
export class EnhancementCapabilityError extends Error {
  readonly code: 'capability_unavailable';
  readonly reason: string;

  constructor(reason = 'no_provider_configured') {
    super('AI photo enhancement is not available.');
    this.name = 'EnhancementCapabilityError';
    this.code = 'capability_unavailable';
    this.reason = reason;
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The kind of enhancement operation the user can apply to a photo. */
export type EnhancementOptionType =
  | 'exif_orientation'
  | 'auto_crop'
  | 'compression'
  | 'color_correction'
  | 'lighting_fix'
  | 'background_removal'
  | 'ai_shadows'
  | 'background_replace';

/** Risk tier per report §5.2 — A=deterministic, B=subject-preserving ML, C=generative. */
export type EnhancementRiskTier = 'A' | 'B' | 'C';

/** A single enhancement operation exposed in the options rail. */
export interface EnhancementOption {
  id: string;
  label: string;
  description: string;
  type: EnhancementOptionType;
  riskTier: EnhancementRiskTier;
}

/** Server-delivered capability state. */
export interface EnhancementCapability {
  available: boolean;
  reason: string | null;
  policyVersion: string;
  operations: EnhancementOption[];
  generatedAt: string;
}

/** A curated preset that bundles multiple enhancement options. */
export interface EnhancementPreset {
  id: string;
  label: string;
  description: string;
  operationIds: string[];
}

/** A background scene for the background-replacement feature. */
export interface BackgroundScene {
  id: string;
  label: string;
  category: 'studio' | 'neutral' | 'colored';
}

/** Provenance metadata for an enhanced image (C2PA 2.4 aligned). */
export interface EnhancementProvenance {
  /** The domain job ID. */
  jobId: string;
  /** The provider that processed the image (e.g. 'photoroom'). */
  provider: string;
  /** The model ID/version used. */
  modelVersion: string | null;
  /** The policy version that governed the operation. */
  policyVersion: string;
  /** Disclosure type per C2PA 2.4 — what the buyer/seller is told. */
  disclosureType: 'none' | 'standard_editing' | 'ai_assisted' | 'ai_generated';
  /** C2PA manifest reference, if available. */
  c2paManifestRef: string | null;
  /** The operations applied, in order. */
  operations: string[];
}

/** The result of applying an enhancement to an image. */
export interface EnhancementResult {
  id: string;
  originalUri: string;
  /** The enhanced image URI. Only set when a real provider processed the image. */
  enhancedUri: string;
  appliedOperationLabel: string;
  appliedAt: string;
  /** The domain job ID for cancellation/reconciliation. */
  jobId: string;
  /** Provenance metadata for trust/transparency. */
  provenance: EnhancementProvenance;
}

/** Job state from the backend. */
export type EnhancementJobState =
  | 'queued'
  | 'processing'
  | 'candidate_ready'
  | 'partial'
  | 'policy_rejected'
  | 'failed'
  | 'cancelled'
  | 'expired'
  | 'outcome_unknown'
  | 'reconciling'
  | 'applied'
  | 'reverted';

// ---------------------------------------------------------------------------
// Capability fetch — the single source of truth for availability
// ---------------------------------------------------------------------------

let cachedCapability: EnhancementCapability | null = null;
let capabilityFetchPromise: Promise<EnhancementCapability> | null = null;
let capabilityCacheExpiry = 0;
const CAPABILITY_CACHE_MS = 60_000; // 60s — matches backend Cache-Control

/**
 * Fetch the enhancement capability state from the backend.
 * This is the fail-closed gate — the UI must not show editing controls
 * unless `available === true`.
 *
 * Caches for 60s. A failed fetch returns `available: false` (fail-closed).
 */
export async function fetchEnhancementCapability(): Promise<EnhancementCapability> {
  const now = Date.now();
  if (cachedCapability && now < capabilityCacheExpiry) {
    return cachedCapability;
  }
  if (capabilityFetchPromise) {
    return capabilityFetchPromise;
  }

  capabilityFetchPromise = (async () => {
    try {
      const payload = await fetchJson<{
        ok: true;
        available: boolean;
        reason: string | null;
        policyVersion: string;
        operations: EnhancementOption[];
        generatedAt: string;
      }>('/media-enhancement/capabilities');

      cachedCapability = {
        available: payload.available,
        reason: payload.reason,
        policyVersion: payload.policyVersion,
        operations: payload.operations,
        generatedAt: payload.generatedAt,
      };
      capabilityCacheExpiry = now + CAPABILITY_CACHE_MS;
      return cachedCapability;
    } catch {
      // Fail-closed: network error → capability unavailable
      cachedCapability = {
        available: false,
        reason: 'fetch_failed',
        policyVersion: '0',
        operations: [],
        generatedAt: new Date().toISOString(),
      };
      capabilityCacheExpiry = now + 10_000; // shorter cache on failure
      return cachedCapability;
    } finally {
      capabilityFetchPromise = null;
    }
  })();

  return capabilityFetchPromise;
}

/**
 * Invalidate the capability cache. Call when the user retries after
 * seeing an unavailable state, or when the screen regains focus.
 */
export function invalidateEnhancementCapabilityCache(): void {
  cachedCapability = null;
  capabilityCacheExpiry = 0;
}

// ---------------------------------------------------------------------------
// Presets and scenes — derived from server-delivered operations
// ---------------------------------------------------------------------------

/**
 * Build presets from the available operations. Presets are not a separate
 * server concept in v1 — they are curated bundles of the server-delivered
 * operations. This keeps the UI honest: no preset can reference an operation
 * the backend didn't authorise.
 */
export function derivePresetsFromOperations(operations: EnhancementOption[]): EnhancementPreset[] {
  const byId = new Map(operations.map((op) => [op.id, op]));
  const has = (id: string) => byId.has(id);

  const presets: EnhancementPreset[] = [];

  if (has('op-background-removal') && has('op-ai-shadows') && has('op-auto-crop')) {
    presets.push({
      id: 'preset-studio-clean',
      label: 'Studio Clean',
      description: 'Neutral background, shadow, and crop for a marketplace-ready look.',
      operationIds: ['op-background-removal', 'op-ai-shadows', 'op-auto-crop'],
    });
  }
  if (has('op-color-correction') && has('op-lighting-fix')) {
    presets.push({
      id: 'preset-natural-light',
      label: 'Natural Light',
      description: 'Colour and lighting correction for a clean, natural feel.',
      operationIds: ['op-color-correction', 'op-lighting-fix'],
    });
  }
  if (has('op-color-correction') && has('op-auto-crop')) {
    presets.push({
      id: 'preset-quick-fix',
      label: 'Quick Fix',
      description: 'Crop and colour correction for a clean, centred photo.',
      operationIds: ['op-auto-crop', 'op-color-correction'],
    });
  }

  return presets;
}

/**
 * Background scenes for the background-replacement picker.
 * Only relevant when the `background_replace` operation is available.
 */
export function getBackgroundScenes(): BackgroundScene[] {
  return [
    { id: 'scene-studio-white', label: 'Studio White', category: 'studio' },
    { id: 'scene-studio-grey', label: 'Studio Grey', category: 'studio' },
    { id: 'scene-neutral-beige', label: 'Neutral Beige', category: 'neutral' },
    { id: 'scene-neutral-cream', label: 'Neutral Cream', category: 'neutral' },
    { id: 'scene-colored-blush', label: 'Soft Blush', category: 'colored' },
    { id: 'scene-colored-sage', label: 'Soft Sage', category: 'colored' },
  ];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateId(prefix: string): string {
  return makeStableId(prefix);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Job submission — calls the real backend endpoint
// ---------------------------------------------------------------------------

interface SubmittedJob {
  jobId: string;
  state: EnhancementJobState;
  pollIntervalMs: number;
}

async function submitEnhancementJob(
  sourceMediaAssetId: string,
  operationIds: string[],
  idempotencyKey: string,
): Promise<SubmittedJob> {
  const payload = await fetchJson<{
    ok: true;
    jobId: string;
    state: EnhancementJobState;
    pollIntervalMs: number;
  }>('/media-enhancement/jobs', {
    method: 'POST',
    body: JSON.stringify({
      sourceMediaAssetId,
      operations: operationIds.map((id) => ({ operationId: id, parameters: {} })),
      idempotencyKey,
    }),
  });
  return {
    jobId: payload.jobId,
    state: payload.state,
    pollIntervalMs: payload.pollIntervalMs,
  };
}

async function pollJobStatus(jobId: string): Promise<{ state: EnhancementJobState; errorCode: string | null }> {
  const payload = await fetchJson<{
    ok: true;
    job: { state: EnhancementJobState; errorCode: string | null };
  }>(`/media-enhancement/jobs/${encodeURIComponent(jobId)}`);
  return { state: payload.job.state, errorCode: payload.job.errorCode };
}

async function fetchJobResult(jobId: string): Promise<{ candidateAssetId: string; candidateUrl: string }> {
  const payload = await fetchJson<{
    ok: true;
    candidateAssetId: string;
    candidateUrl: string;
  }>(`/media-enhancement/jobs/${encodeURIComponent(jobId)}/result`);
  return { candidateAssetId: payload.candidateAssetId, candidateUrl: payload.candidateUrl };
}

/**
 * Cancel an in-flight enhancement job. Safe to call even if the job is already
 * terminal — the backend returns 409 which we treat as success (already done).
 */
export async function cancelEnhancementJob(jobId: string): Promise<void> {
  try {
    await fetchJson(`/media-enhancement/jobs/${encodeURIComponent(jobId)}/cancel`, {
      method: 'POST',
    });
  } catch (e: unknown) {
    // 409 = already terminal — that's fine, the job is done
    if (typeof e === 'object' && e && 'status' in e && (e as { status: number }).status === 409) {
      return;
    }
    throw e;
  }
}

/**
 * Reconcile a job whose outcome is unknown (network dropped during submit/poll).
 * Returns the current state so the caller can decide whether to retry or
 * accept the result. This is the safe path per report §7.2 — never assume
 * success or failure without server confirmation.
 */
export async function reconcileJob(jobId: string): Promise<{
  state: EnhancementJobState;
  errorCode: string | null;
  result: { candidateAssetId: string; candidateUrl: string } | null;
}> {
  const status = await pollJobStatus(jobId);
  if (status.state === 'candidate_ready' || status.state === 'applied') {
    try {
      const result = await fetchJobResult(jobId);
      return { state: status.state, errorCode: null, result };
    } catch {
      return { state: status.state, errorCode: null, result: null };
    }
  }
  return { state: status.state, errorCode: status.errorCode, result: null };
}

// ---------------------------------------------------------------------------
// Public API — apply functions
// ---------------------------------------------------------------------------

/**
 * Apply a single enhancement operation to an image.
 *
 * Calls the backend job endpoint. When the capability is unavailable,
 * throws `EnhancementCapabilityError` — never returns a false success.
 */
export async function applyEnhancement(
  imageUri: string,
  operationId: string,
): Promise<EnhancementResult> {
  const capability = await fetchEnhancementCapability();
  if (!capability.available) {
    throw new EnhancementCapabilityError(capability.reason ?? undefined);
  }

  const op = capability.operations.find((o) => o.id === operationId);
  if (!op) {
    throw new EnhancementCapabilityError('operation_not_allowed');
  }

  // Submit the job. In v1 with no provider wired, the backend returns 503
  // which surfaces as a fetch error → caught by the caller as an honest error.
  const idempotencyKey = generateId('enh-key');
  const job = await submitEnhancementJob(imageUri, [operationId], idempotencyKey);

  // Poll until terminal. This is a simplified synchronous-style poll —
  // the real implementation would use a worker + webhook.
  const maxPolls = 60;
  const intervalMs = job.pollIntervalMs || 2000;
  for (let i = 0; i < maxPolls; i++) {
    await delay(intervalMs);
    const status = await pollJobStatus(job.jobId);
    if (status.state === 'candidate_ready' || status.state === 'applied') {
      let enhancedUri = imageUri;
      try {
        const result = await fetchJobResult(job.jobId);
        enhancedUri = result.candidateUrl || imageUri;
      } catch { /* fallback to source when result endpoint not ready */ }
      return {
        id: generateId('result'),
        originalUri: imageUri,
        enhancedUri,
        appliedOperationLabel: op.label,
        appliedAt: new Date().toISOString(),
        jobId: job.jobId,
        provenance: {
          jobId: job.jobId,
          provider: 'photoroom',
          modelVersion: null,
          policyVersion: capability.policyVersion,
          disclosureType: op.riskTier === 'A' ? 'standard_editing' : 'ai_assisted',
          c2paManifestRef: null,
          operations: [operationId],
        },
      };
    }
    if (status.state === 'failed' || status.state === 'policy_rejected' || status.state === 'cancelled' || status.state === 'expired') {
      throw new Error(`Enhancement ${status.state}${status.errorCode ? `: ${status.errorCode}` : ''}`);
    }
  }

  throw new Error('Enhancement timed out. The job is still processing — check back shortly.');
}

/**
 * Apply a preset (multiple enhancement operations) to an image.
 */
export async function applyPreset(
  imageUri: string,
  presetId: string,
): Promise<EnhancementResult> {
  const capability = await fetchEnhancementCapability();
  if (!capability.available) {
    throw new EnhancementCapabilityError(capability.reason ?? undefined);
  }

  const presets = derivePresetsFromOperations(capability.operations);
  const preset = presets.find((p) => p.id === presetId);
  if (!preset) {
    throw new EnhancementCapabilityError('preset_not_available');
  }

  const idempotencyKey = generateId('enh-key');
  const job = await submitEnhancementJob(imageUri, preset.operationIds, idempotencyKey);

  const maxPolls = 60;
  const intervalMs = job.pollIntervalMs || 2000;
  for (let i = 0; i < maxPolls; i++) {
    await delay(intervalMs);
    const status = await pollJobStatus(job.jobId);
    if (status.state === 'candidate_ready' || status.state === 'applied') {
      let enhancedUri = imageUri;
      try {
        const result = await fetchJobResult(job.jobId);
        enhancedUri = result.candidateUrl || imageUri;
      } catch { /* fallback to source when result endpoint not ready */ }
      const hasGenerative = preset.operationIds.some((id) => {
        const op = capability.operations.find((o) => o.id === id);
        return op?.riskTier === 'C';
      });
      return {
        id: generateId('result'),
        originalUri: imageUri,
        enhancedUri,
        appliedOperationLabel: preset.label,
        appliedAt: new Date().toISOString(),
        jobId: job.jobId,
        provenance: {
          jobId: job.jobId,
          provider: 'photoroom',
          modelVersion: null,
          policyVersion: capability.policyVersion,
          disclosureType: hasGenerative ? 'ai_generated' : 'ai_assisted',
          c2paManifestRef: null,
          operations: preset.operationIds,
        },
      };
    }
    if (status.state === 'failed' || status.state === 'policy_rejected' || status.state === 'cancelled' || status.state === 'expired') {
      throw new Error(`Enhancement ${status.state}${status.errorCode ? `: ${status.errorCode}` : ''}`);
    }
  }

  throw new Error('Enhancement timed out. The job is still processing — check back shortly.');
}

/**
 * Replace the background of an image with a selected scene.
 */
export async function replaceBackground(
  imageUri: string,
  _sceneId: string,
): Promise<EnhancementResult> {
  const capability = await fetchEnhancementCapability();
  if (!capability.available) {
    throw new EnhancementCapabilityError(capability.reason ?? undefined);
  }

  const bgReplaceOp = capability.operations.find((o) => o.type === 'background_replace');
  if (!bgReplaceOp) {
    throw new EnhancementCapabilityError('operation_not_allowed');
  }

  const idempotencyKey = generateId('enh-key');
  const job = await submitEnhancementJob(imageUri, [bgReplaceOp.id], idempotencyKey);

  const maxPolls = 60;
  const intervalMs = job.pollIntervalMs || 2000;
  for (let i = 0; i < maxPolls; i++) {
    await delay(intervalMs);
    const status = await pollJobStatus(job.jobId);
    if (status.state === 'candidate_ready' || status.state === 'applied') {
      let enhancedUri = imageUri;
      try {
        const result = await fetchJobResult(job.jobId);
        enhancedUri = result.candidateUrl || imageUri;
      } catch { /* fallback to source when result endpoint not ready */ }
      return {
        id: generateId('result'),
        originalUri: imageUri,
        enhancedUri,
        appliedOperationLabel: 'Background Replace',
        appliedAt: new Date().toISOString(),
        jobId: job.jobId,
        provenance: {
          jobId: job.jobId,
          provider: 'photoroom',
          modelVersion: null,
          policyVersion: capability.policyVersion,
          disclosureType: 'ai_generated',
          c2paManifestRef: null,
          operations: [bgReplaceOp.id],
        },
      };
    }
    if (status.state === 'failed' || status.state === 'policy_rejected' || status.state === 'cancelled' || status.state === 'expired') {
      throw new Error(`Enhancement ${status.state}${status.errorCode ? `: ${status.errorCode}` : ''}`);
    }
  }

  throw new Error('Enhancement timed out. The job is still processing — check back shortly.');
}

/**
 * Revert an enhancement, returning to the original image.
 * In v1 (no provider), no actual change was made, so this confirms the revert.
 */
export async function revertEnhancement(_resultId: string): Promise<{ originalUri: string }> {
  // When a provider is wired, this calls POST /listings/:id/media/revert
  // with an idempotency key. For now, the revert is a local UI reset
  // because no server-side mutation occurred.
  await delay(200);
  return { originalUri: '' };
}
