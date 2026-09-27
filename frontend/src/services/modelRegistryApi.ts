/**
 * Model Registry API — model artifact lineage (backend migration 144).
 *
 * Wraps the admin REST surface under `/admin/model-artifacts/*` using the
 * shared `fetchJson` client from `lib/apiClient` (base URL resolution,
 * auth token injection/refresh, timeout, retry, structured errors).
 *
 * Every endpoint is admin-gated server-side: requests carry the caller's
 * bearer token and the backend rejects non-admin callers with FORBIDDEN.
 * This module only declares the typed request/response shapes.
 */

import { fetchJson, ApiRequestError, parseApiError } from '../lib/apiClient';

// ─────────────────────────────────────────────────────────────────────────────
// DTO types — mirror backend/api/src/routes/modelArtifacts.ts exactly
// ─────────────────────────────────────────────────────────────────────────────

export type ModelArtifactTask =
  | 'recommendation_ranking'
  | 'visual_search'
  | 'catalogue_import'
  | 'fraud_scoring'
  | 'moderation_triage';

export type ModelArtifactStatus =
  | 'candidate'
  | 'shadow'
  | 'active'
  | 'retired'
  | 'blocked';

export type ModelArtifactCriticality = 'low' | 'medium' | 'high';

export interface ModelArtifactDTO {
  modelId: string;
  modelVersion: string;
  task: ModelArtifactTask;
  owner: string;
  criticality: ModelArtifactCriticality;
  artifactUri: string;
  artifactSha256: string;
  containerDigest: string | null;
  trainingCodeCommit: string;
  trainingDatasetManifest: string;
  featureSchemaVersion: string;
  preprocessingVersion: string;
  frameworkRuntime: string;
  evaluationReportUri: string | null;
  modelCardUri: string | null;
  approvalActor: string | null;
  approvedAt: string | null;
  status: ModelArtifactStatus;
  rollbackModelVersion: string | null;
  retentionDeletionMetadata: Record<string, unknown>;
  createdAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Request shapes
// ─────────────────────────────────────────────────────────────────────────────

export interface ListModelArtifactsParams {
  status?: ModelArtifactStatus;
  task?: ModelArtifactTask;
  owner?: string;
  /** 1–200, server default 50. */
  limit?: number;
  /** ≥ 0, server default 0. */
  offset?: number;
}

export interface RegisterModelArtifactInput {
  modelId: string;
  modelVersion: string;
  task: ModelArtifactTask;
  owner: string;
  criticality: ModelArtifactCriticality;
  artifactUri: string;
  /** 64-char lowercase hex SHA-256 of the artifact binary. */
  artifactSha256: string;
  containerDigest?: string;
  trainingCodeCommit: string;
  trainingDatasetManifest: string;
  featureSchemaVersion: string;
  preprocessingVersion: string;
  frameworkRuntime: string;
  evaluationReportUri?: string;
  modelCardUri?: string;
  rollbackModelVersion?: string;
  retentionDeletionMetadata?: Record<string, unknown>;
}

export interface TransitionModelArtifactInput {
  status: ModelArtifactStatus;
  /** Required by the server when promoting to 'active'. */
  approvalActor?: string;
  /** Optional explicit rollback target recorded at promotion time. */
  rollbackModelVersion?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Response envelopes
// ─────────────────────────────────────────────────────────────────────────────

interface ListArtifactsResponse {
  ok: boolean;
  artifacts: ModelArtifactDTO[];
  limit: number;
  offset: number;
}

interface SingleArtifactResponse {
  ok: boolean;
  artifact: ModelArtifactDTO;
}

// ─────────────────────────────────────────────────────────────────────────────
// Typed error
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Raised when a model-registry endpoint returns a non-2xx response. Wraps the
 * shared `ApiRequestError` with a friendly message so screens can render it
 * directly without re-parsing the payload.
 */
export class ModelRegistryError extends Error {
  readonly status: number | undefined;
  readonly code: string | null;
  readonly isNetworkError: boolean;

  constructor(cause: unknown, fallback = 'Model registry request failed') {
    const parsed = parseApiError(cause, fallback);
    super(parsed.message);
    this.name = 'ModelRegistryError';
    this.status = parsed.status;
    this.code = parsed.code;
    this.isNetworkError = parsed.isNetworkError;
  }
}

function toError(cause: unknown): ModelRegistryError {
  if (cause instanceof ModelRegistryError) return cause;
  return new ModelRegistryError(cause);
}

function artifactPath(modelId: string, modelVersion: string): string {
  return `/admin/model-artifacts/${encodeURIComponent(modelId)}/${encodeURIComponent(modelVersion)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Endpoints
// ─────────────────────────────────────────────────────────────────────────────

export interface FetchModelArtifactsResult {
  artifacts: ModelArtifactDTO[];
  limit: number;
  offset: number;
}

/** GET /admin/model-artifacts — list artifacts with optional filters. */
export async function fetchModelArtifacts(
  params?: ListModelArtifactsParams
): Promise<FetchModelArtifactsResult> {
  try {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.task) query.set('task', params.task);
    if (params?.owner) query.set('owner', params.owner);
    if (params?.limit !== undefined) query.set('limit', String(params.limit));
    if (params?.offset !== undefined) query.set('offset', String(params.offset));
    const qs = query.toString();
    const payload = await fetchJson<ListArtifactsResponse>(
      `/admin/model-artifacts${qs ? `?${qs}` : ''}`
    );
    return {
      artifacts: Array.isArray(payload.artifacts) ? payload.artifacts : [],
      limit: payload.limit,
      offset: payload.offset,
    };
  } catch (cause) {
    throw toError(cause);
  }
}

/** GET /admin/model-artifacts/:modelId/:modelVersion — fetch one artifact. */
export async function fetchModelArtifact(
  modelId: string,
  modelVersion: string
): Promise<ModelArtifactDTO> {
  try {
    const payload = await fetchJson<SingleArtifactResponse>(
      artifactPath(modelId, modelVersion)
    );
    return payload.artifact;
  } catch (cause) {
    throw toError(cause);
  }
}

/** POST /admin/model-artifacts — register a new artifact (201). */
export async function registerModelArtifact(
  input: RegisterModelArtifactInput
): Promise<ModelArtifactDTO> {
  try {
    const payload = await fetchJson<SingleArtifactResponse>('/admin/model-artifacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    return payload.artifact;
  } catch (cause) {
    throw toError(cause);
  }
}

/**
 * PATCH /admin/model-artifacts/:modelId/:modelVersion/status — lifecycle
 * transition (promote to shadow/active, retire, block). Promoting to 'active'
 * requires `approvalActor`; the server retires the previously active version
 * for the same task and records it as the rollback target.
 */
export async function transitionModelArtifactStatus(
  modelId: string,
  modelVersion: string,
  input: TransitionModelArtifactInput
): Promise<ModelArtifactDTO> {
  try {
    const payload = await fetchJson<SingleArtifactResponse>(
      `${artifactPath(modelId, modelVersion)}/status`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }
    );
    return payload.artifact;
  } catch (cause) {
    throw toError(cause);
  }
}

// Re-export the shared error type so callers can import everything from one
// module without reaching into `lib/apiClient` directly.
export { ApiRequestError };
