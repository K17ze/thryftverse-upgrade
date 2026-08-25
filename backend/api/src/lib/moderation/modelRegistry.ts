/**
 * Server-side moderation model registry.
 *
 * Resolves which model and version to use for a given content modality and
 * moderation purpose. Callers submit content and purpose only; the server
 * resolves the model id and version from this registry rather than accepting
 * caller-authored values (TS-13: an owner could previously supply an arbitrary
 * `modelId` / `modelVersion` when triggering triage, which made provenance
 * untrustworthy).
 *
 * In production this would be backed by a database table with an admin UI for
 * rolling out new model versions and toggling shadow mode. For now the
 * registry is an in-memory structure seeded with sensible defaults; the
 * public API mirrors what a database-backed implementation would expose so
 * the swap is a drop-in replacement.
 *
 * @packageDocumentation
 */

import { logger } from '../logger.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ContentModality =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'live_stream';

export type ModerationPurpose =
  | 'listing_scan'
  | 'message_scan'
  | 'profile_scan'
  | 'review_scan'
  | 'media_upload'
  | 'live_monitor';

/** The set of providers that the gateway can route to. */
export type RegistryProvider = 'rekognition' | 'sightengine' | 'openai_omni';

export interface ModelRegistryEntry {
  model_id: string;
  model_version: string;
  provider: RegistryProvider;
  modality: ContentModality;
  purpose: ModerationPurpose;
  is_active: boolean;
  /** Shadow mode = log the result but do not affect asset status. */
  is_shadow: boolean;
  /** ISO timestamp of when the model was activated. */
  activated_at: string;
  /** Measured precision estimate, when available. Not guessed. */
  precision_estimate?: number;
  /** Measured recall estimate, when available. Not guessed. */
  recall_estimate?: number;
}

export interface ResolvedModel {
  model_id: string;
  model_version: string;
  provider: string;
  is_shadow: boolean;
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

const DEFAULT_REGISTRY: ModelRegistryEntry[] = [
  { model_id: 'rekognition-content-moderation-v6', model_version: '6.0', provider: 'rekognition', modality: 'image', purpose: 'media_upload', is_active: true, is_shadow: false, activated_at: '2026-01-01T00:00:00Z' },
  { model_id: 'rekognition-video-moderation-v6', model_version: '6.0', provider: 'rekognition', modality: 'video', purpose: 'media_upload', is_active: true, is_shadow: false, activated_at: '2026-01-01T00:00:00Z' },
  { model_id: 'sightengine-image-v5', model_version: '5.0', provider: 'sightengine', modality: 'image', purpose: 'live_monitor', is_active: true, is_shadow: false, activated_at: '2026-01-01T00:00:00Z' },
  { model_id: 'sightengine-live-stream-v5', model_version: '5.0', provider: 'sightengine', modality: 'live_stream', purpose: 'live_monitor', is_active: true, is_shadow: false, activated_at: '2026-01-01T00:00:00Z' },
  { model_id: 'sightengine-audio-v5', model_version: '5.0', provider: 'sightengine', modality: 'audio', purpose: 'live_monitor', is_active: true, is_shadow: false, activated_at: '2026-01-01T00:00:00Z' },
  { model_id: 'openai-omni-moderation-latest', model_version: 'latest', provider: 'openai_omni', modality: 'text', purpose: 'message_scan', is_active: true, is_shadow: false, activated_at: '2026-01-01T00:00:00Z' },
  { model_id: 'openai-omni-moderation-latest', model_version: 'latest', provider: 'openai_omni', modality: 'text', purpose: 'listing_scan', is_active: true, is_shadow: false, activated_at: '2026-01-01T00:00:00Z' },
  { model_id: 'openai-omni-moderation-latest', model_version: 'latest', provider: 'openai_omni', modality: 'text', purpose: 'profile_scan', is_active: true, is_shadow: false, activated_at: '2026-01-01T00:00:00Z' },
  { model_id: 'openai-omni-moderation-latest', model_version: 'latest', provider: 'openai_omni', modality: 'text', purpose: 'review_scan', is_active: true, is_shadow: false, activated_at: '2026-01-01T00:00:00Z' },
];

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/**
 * In-memory registry state. Seeded once on module load. Mutations go through
 * the public API so the activation invariant (at most one active model per
 * modality/purpose pair) is preserved.
 */
let registry: ModelRegistryEntry[] = DEFAULT_REGISTRY.map((entry) => ({ ...entry }));

/**
 * Resolve the active model for a given content modality and purpose.
 *
 * The gateway calls this instead of trusting a caller-supplied model id, so
 * provenance is always server-authored (TS-13).
 *
 * @throws {Error} When no active model is configured for the pair. The
 *   gateway treats this as an `unavailable` outcome rather than silently
 *   falling back to a default provider.
 */
export function resolveModel(
  modality: ContentModality,
  purpose: ModerationPurpose,
): ResolvedModel {
  const match = registry.find(
    (entry) =>
      entry.modality === modality &&
      entry.purpose === purpose &&
      entry.is_active,
  );
  if (!match) {
    throw new Error(
      `No active moderation model configured for modality='${modality}' purpose='${purpose}'`,
    );
  }
  return {
    model_id: match.model_id,
    model_version: match.model_version,
    provider: match.provider,
    is_shadow: match.is_shadow,
  };
}

/**
 * List all active models, optionally filtered by modality.
 *
 * Returns a defensive copy so callers cannot mutate the registry in place.
 */
export function getActiveModels(modality?: ContentModality): ModelRegistryEntry[] {
  return registry
    .filter((entry) => entry.is_active)
    .filter((entry) => (modality ? entry.modality === modality : true))
    .map((entry) => ({ ...entry }));
}

/**
 * Register a new model in the registry.
 *
 * Newly registered models default to inactive so that an explicit
 * {@link activateModel} call is required before they can serve traffic. If the
 * entry is supplied with `is_active: true`, the activation invariant is
 * enforced: any other active model for the same modality/purpose pair is
 * deactivated first.
 *
 * @returns The entry as stored (with defaults applied).
 */
export function registerModel(entry: ModelRegistryEntry): ModelRegistryEntry {
  const stored: ModelRegistryEntry = {
    ...entry,
    is_active: entry.is_active ?? false,
    is_shadow: entry.is_shadow ?? false,
    activated_at: entry.activated_at ?? new Date().toISOString(),
  };

  if (stored.is_active) {
    // Preserve the at-most-one-active invariant for the pair.
    for (const existing of registry) {
      if (
        existing.modality === stored.modality &&
        existing.purpose === stored.purpose &&
        existing.is_active &&
        existing.model_id !== stored.model_id
      ) {
        existing.is_active = false;
      }
    }
  }

  // Replace any existing entry for the same model_id (idempotent re-register).
  registry = registry
    .filter((existing) => existing.model_id !== stored.model_id)
    .concat(stored);

  logger.info(
    {
      model_id: stored.model_id,
      model_version: stored.model_version,
      provider: stored.provider,
      modality: stored.modality,
      purpose: stored.purpose,
      is_active: stored.is_active,
      is_shadow: stored.is_shadow,
    },
    'modelRegistry.model_registered',
  );

  return { ...stored };
}

/**
 * Activate a model: set `is_active = true` and deactivate any other active
 * model that shares the same modality/purpose pair. This is the rollback
 * switch for canary model releases.
 *
 * @throws {Error} When the model id is unknown.
 */
export function activateModel(model_id: string): ModelRegistryEntry {
  const target = registry.find((entry) => entry.model_id === model_id);
  if (!target) {
    throw new Error(`Cannot activate unknown model '${model_id}'`);
  }

  for (const entry of registry) {
    if (
      entry.modality === target.modality &&
      entry.purpose === target.purpose &&
      entry.model_id !== model_id
    ) {
      entry.is_active = false;
    }
  }

  target.is_active = true;
  target.activated_at = new Date().toISOString();

  logger.info(
    { model_id, modality: target.modality, purpose: target.purpose },
    'modelRegistry.model_activated',
  );

  return { ...target };
}

/**
 * Toggle shadow mode for a model. Shadow results are logged but do not change
 * asset status, so a candidate model can be evaluated against production
 * traffic without affecting users.
 *
 * @throws {Error} When the model id is unknown.
 */
export function setShadowMode(model_id: string, is_shadow: boolean): ModelRegistryEntry {
  const target = registry.find((entry) => entry.model_id === model_id);
  if (!target) {
    throw new Error(`Cannot set shadow mode for unknown model '${model_id}'`);
  }
  target.is_shadow = is_shadow;

  logger.info(
    { model_id, is_shadow },
    'modelRegistry.shadow_mode_changed',
  );

  return { ...target };
}

/**
 * Return the full registry state for admin/audit purposes. The returned array
 * is a defensive copy so callers cannot mutate the live registry.
 */
export function getRegistrySnapshot(): ModelRegistryEntry[] {
  return registry.map((entry) => ({ ...entry }));
}

/**
 * Reset the registry to the seeded defaults. Intended for tests that mutate
 * registry state between cases.
 *
 * @internal
 */
export function resetModelRegistry(): void {
  registry = DEFAULT_REGISTRY.map((entry) => ({ ...entry }));
}
