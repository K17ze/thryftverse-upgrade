/**
 * Media enhancement service — web port of the mobile
 * `services/aiPhotoEnhancementApi.ts` contract, backed by the same backend
 * routes (`/media-enhancement/*`).
 *
 * Fail-closed by design: `GET /media-enhancement/capabilities` is the single
 * source of truth. When no provider is configured the backend returns
 * `available: false` and job submission returns 503 — the UI must show an
 * honest "not yet available" state, never a fake success.
 */

import { fetchJson } from '../http';

/** Raised when the enhancement capability is not available (fail-closed). */
export class EnhancementCapabilityError extends Error {
  readonly code = 'capability_unavailable' as const;
  readonly reason: string;

  constructor(reason = 'no_provider_configured') {
    super('AI photo enhancement is not available.');
    this.name = 'EnhancementCapabilityError';
    this.reason = reason;
  }
}

export type EnhancementOptionType =
  | 'exif_orientation'
  | 'auto_crop'
  | 'compression'
  | 'color_correction'
  | 'lighting_fix'
  | 'background_removal'
  | 'ai_shadows'
  | 'background_replace';

/** Risk tier — A=deterministic, B=subject-preserving ML, C=generative. */
export type EnhancementRiskTier = 'A' | 'B' | 'C';

export interface EnhancementOption {
  id: string;
  label: string;
  description: string;
  type: EnhancementOptionType;
  riskTier: EnhancementRiskTier;
}

export interface EnhancementCapability {
  available: boolean;
  reason: string | null;
  policyVersion: string;
  operations: EnhancementOption[];
  generatedAt: string;
}

export interface EnhancementPreset {
  id: string;
  label: string;
  description: string;
  operationIds: string[];
}

export interface BackgroundScene {
  id: string;
  label: string;
  category: 'studio' | 'neutral' | 'colored';
}

/** Provenance metadata for an enhanced image (C2PA 2.4 aligned). */
export interface EnhancementProvenance {
  jobId: string;
  provider: string;
  modelVersion: string | null;
  policyVersion: string;
  disclosureType: 'none' | 'standard_editing' | 'ai_assisted' | 'ai_generated';
  c2paManifestRef: string | null;
  operations: string[];
}

export interface EnhancementResult {
  originalUri: string;
  /** Enhanced image URL — only set when a real provider produced output. */
  enhancedUri: string;
  appliedOperationLabel: string;
  jobId: string;
  provenance: EnhancementProvenance;
}

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

export function disclosureLabel(type: EnhancementProvenance['disclosureType']): string {
  switch (type) {
    case 'standard_editing':
      return 'Standard editing';
    case 'ai_assisted':
      return 'AI-assisted edit';
    case 'ai_generated':
      return 'AI-generated content';
    default:
      return 'Unedited';
  }
}

// ---------------------------------------------------------------------------
// Capability fetch — fail-closed, cached 60s like the backend Cache-Control
// ---------------------------------------------------------------------------

let cachedCapability: EnhancementCapability | null = null;
let capabilityFetchPromise: Promise<EnhancementCapability> | null = null;
let capabilityCacheExpiry = 0;
const CAPABILITY_CACHE_MS = 60_000;

/**
 * Fetch the enhancement capability state. Any failure resolves to
 * `available: false` — callers never have to catch to stay honest.
 */
export async function fetchEnhancementCapability(): Promise<EnhancementCapability> {
  const now = Date.now();
  if (cachedCapability && now < capabilityCacheExpiry) return cachedCapability;
  if (capabilityFetchPromise) return capabilityFetchPromise;

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
        operations: payload.operations ?? [],
        generatedAt: payload.generatedAt,
      };
      capabilityCacheExpiry = Date.now() + CAPABILITY_CACHE_MS;
      return cachedCapability;
    } catch {
      cachedCapability = {
        available: false,
        reason: 'fetch_failed',
        policyVersion: '0',
        operations: [],
        generatedAt: new Date().toISOString(),
      };
      capabilityCacheExpiry = Date.now() + 10_000;
      return cachedCapability;
    } finally {
      capabilityFetchPromise = null;
    }
  })();

  return capabilityFetchPromise;
}

export function invalidateEnhancementCapabilityCache(): void {
  cachedCapability = null;
  capabilityCacheExpiry = 0;
}

// ---------------------------------------------------------------------------
// Presets + scenes — derived from server-delivered operations so no preset
// can reference an operation the backend didn't authorise.
// ---------------------------------------------------------------------------

export function derivePresetsFromOperations(
  operations: EnhancementOption[],
): EnhancementPreset[] {
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

/** Background scenes — only relevant when `background_replace` is allowed. */
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
// Job submission — the real backend endpoints
// ---------------------------------------------------------------------------

interface SubmittedJob {
  jobId: string;
  state: EnhancementJobState;
  pollIntervalMs: number;
}

function generateId(prefix: string): string {
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${rand}`;
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
    headers: { 'Content-Type': 'application/json' },
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

async function pollJobStatus(
  jobId: string,
): Promise<{ state: EnhancementJobState; errorCode: string | null }> {
  const payload = await fetchJson<{
    ok: true;
    job: { state: EnhancementJobState; errorCode: string | null };
  }>(`/media-enhancement/jobs/${encodeURIComponent(jobId)}`);
  return { state: payload.job.state, errorCode: payload.job.errorCode };
}

async function fetchJobResult(
  jobId: string,
): Promise<{ candidateAssetId: string; candidateUrl: string }> {
  const payload = await fetchJson<{
    ok: true;
    candidateAssetId: string;
    candidateUrl: string;
  }>(`/media-enhancement/jobs/${encodeURIComponent(jobId)}/result`);
  return {
    candidateAssetId: payload.candidateAssetId,
    candidateUrl: payload.candidateUrl,
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const TERMINAL_FAILURES: ReadonlySet<EnhancementJobState> = new Set([
  'failed',
  'policy_rejected',
  'cancelled',
  'expired',
]);

/**
 * Run one submitted job to a candidate — shared by operation, preset and
 * background paths. Resolves with the candidate URL + provenance inputs, or
 * throws on terminal failure / timeout. Never fabricates a result.
 */
async function runJobToCandidate(input: {
  imageUri: string;
  operationIds: string[];
  label: string;
  disclosure: EnhancementProvenance['disclosureType'];
  policyVersion: string;
}): Promise<EnhancementResult> {
  const job = await submitEnhancementJob(
    input.imageUri,
    input.operationIds,
    generateId('enh-key'),
  );
  const maxPolls = 60;
  const intervalMs = job.pollIntervalMs || 2000;
  for (let i = 0; i < maxPolls; i++) {
    await delay(intervalMs);
    const status = await pollJobStatus(job.jobId);
    if (status.state === 'candidate_ready' || status.state === 'applied') {
      let enhancedUri = input.imageUri;
      try {
        const result = await fetchJobResult(job.jobId);
        enhancedUri = result.candidateUrl || input.imageUri;
      } catch {
        /* result endpoint not ready — keep the source reference */
      }
      return {
        originalUri: input.imageUri,
        enhancedUri,
        appliedOperationLabel: input.label,
        jobId: job.jobId,
        provenance: {
          jobId: job.jobId,
          provider: 'photoroom',
          modelVersion: null,
          policyVersion: input.policyVersion,
          disclosureType: input.disclosure,
          c2paManifestRef: null,
          operations: input.operationIds,
        },
      };
    }
    if (TERMINAL_FAILURES.has(status.state)) {
      throw new Error(
        `Enhancement ${status.state}${status.errorCode ? `: ${status.errorCode}` : ''}`,
      );
    }
  }
  throw new Error(
    'Enhancement timed out. The job is still processing — check back shortly.',
  );
}

/** Apply a single capability-listed operation to an image. */
export async function applyEnhancement(
  imageUri: string,
  operationId: string,
): Promise<EnhancementResult> {
  const capability = await fetchEnhancementCapability();
  if (!capability.available) {
    throw new EnhancementCapabilityError(capability.reason ?? undefined);
  }
  const op = capability.operations.find((o) => o.id === operationId);
  if (!op) throw new EnhancementCapabilityError('operation_not_allowed');
  return runJobToCandidate({
    imageUri,
    operationIds: [operationId],
    label: op.label,
    disclosure: op.riskTier === 'A' ? 'standard_editing' : 'ai_assisted',
    policyVersion: capability.policyVersion,
  });
}

/** Apply a curated preset — a bundle of capability-listed operations. */
export async function applyPreset(
  imageUri: string,
  presetId: string,
): Promise<EnhancementResult> {
  const capability = await fetchEnhancementCapability();
  if (!capability.available) {
    throw new EnhancementCapabilityError(capability.reason ?? undefined);
  }
  const preset = derivePresetsFromOperations(capability.operations).find(
    (p) => p.id === presetId,
  );
  if (!preset) throw new EnhancementCapabilityError('preset_not_available');
  const hasGenerative = preset.operationIds.some(
    (id) => capability.operations.find((o) => o.id === id)?.riskTier === 'C',
  );
  return runJobToCandidate({
    imageUri,
    operationIds: preset.operationIds,
    label: preset.label,
    disclosure: hasGenerative ? 'ai_generated' : 'ai_assisted',
    policyVersion: capability.policyVersion,
  });
}

/** Replace the background with a curated scene (generative operation). */
export async function replaceBackground(
  imageUri: string,
  sceneId: string,
): Promise<EnhancementResult> {
  const capability = await fetchEnhancementCapability();
  if (!capability.available) {
    throw new EnhancementCapabilityError(capability.reason ?? undefined);
  }
  const bgReplaceOp = capability.operations.find(
    (o) => o.type === 'background_replace',
  );
  if (!bgReplaceOp) throw new EnhancementCapabilityError('operation_not_allowed');
  const scene = getBackgroundScenes().find((s) => s.id === sceneId);
  return runJobToCandidate({
    imageUri,
    operationIds: [bgReplaceOp.id],
    label: scene ? `Background — ${scene.label}` : 'Background replace',
    disclosure: 'ai_generated',
    policyVersion: capability.policyVersion,
  });
}
