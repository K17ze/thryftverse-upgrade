/**
 * VideoExportModule — JS entry point.
 *
 * Wraps the Nitro HybridObject with a graceful fallback when the native
 * module is not linked (Expo Go, web, or during development before
 * Nitrogen codegen has run).
 *
 * When the native module IS linked, `NitroModules.createHybridObject()`
 * returns the singleton instance backed by AVFoundation (iOS) / Media3
 * Transformer (Android). When it is NOT linked, `getVideoExportModule()`
 * returns null and `isVideoExportAvailable()` returns false — the caller
 * (mediaExportService.ts) falls back to the backend FFmpeg render path.
 *
 * The native implementation is deferred — this file ships the contract +
 * JS wiring so the native module can land in a follow-up without touching
 * the editor.
 */
import { NitroModules } from 'react-native-nitro-modules';

import type { VideoExportModule } from './VideoExportModule.nitro';
import type {
  VideoExportRequest,
  VideoExportResult,
  VideoExportError,
  VideoOverlay,
  VideoTextOverlay,
  VideoStickerOverlay,
} from './VideoExportModule.nitro';

const MODULE_NAME = 'VideoExportModule';

let cachedInstance: VideoExportModule | null = null;
let availabilityChecked = false;
let isAvailable = false;

/**
 * Probe whether the native `VideoExportModule` HybridObject is registered.
 * `NitroModules.hasHybridObject()` throws when the Nitro runtime itself is
 * not installed (web, Expo Go), so the probe is wrapped in a try/catch —
 * any failure degrades to "not available" rather than crashing at import.
 */
function checkAvailability(): boolean {
  if (availabilityChecked) return isAvailable;
  availabilityChecked = true;
  try {
    if (!NitroModules.hasHybridObject(MODULE_NAME)) {
      isAvailable = false;
      return isAvailable;
    }
    cachedInstance = NitroModules.createHybridObject<VideoExportModule>(
      MODULE_NAME,
    );
    isAvailable = true;
  } catch {
    isAvailable = false;
    cachedInstance = null;
  }
  return isAvailable;
}

/**
 * Get the `VideoExportModule` HybridObject instance, or null if the native
 * module is not linked. Use this to gate UI that offers native video export.
 */
export function getVideoExportModule(): VideoExportModule | null {
  return checkAvailability() ? cachedInstance : null;
}

/**
 * Returns true when the native video export module is linked and available.
 * When false, the caller should fall back to the backend FFmpeg render path.
 */
export function isVideoExportAvailable(): boolean {
  return getVideoExportModule() !== null;
}

/**
 * Normalise a native rejection into a `VideoExportError`. Native code throws
 * plain `Error` instances (or Nitro wraps them); we coerce the known shapes
 * into the discriminated union so callers can `switch (err.type)`.
 */
function toVideoExportError(error: unknown): VideoExportError {
  // Already a shaped VideoExportError (e.g. re-thrown from a guard).
  if (
    error !== null &&
    typeof error === 'object' &&
    'type' in error &&
    typeof (error as { type: unknown }).type === 'string'
  ) {
    const type = (error as { type: string }).type;
    if (
      type === 'cancelled' ||
      type === 'unsupported' ||
      type === 'render_failed' ||
      type === 'invalid_input'
    ) {
      return error as VideoExportError;
    }
  }

  const message =
    error instanceof Error ? error.message : String(error);

  // Heuristic: cancellation messages from AVFoundation / Media3 mention
  // "cancel" or "abort".
  if (/cancel|abort/i.test(message)) {
    return { type: 'cancelled' };
  }

  return { type: 'render_failed', message };
}

/**
 * Export a video via the native module. Wraps the native `exportVideo` call
 * and rejects with a `VideoExportError` on failure.
 *
 * Throws `{ type: 'unsupported' }` when the native module is not linked —
 * the caller should fall back to the backend FFmpeg render path.
 */
export async function exportVideoViaNative(
  request: VideoExportRequest,
): Promise<VideoExportResult> {
  const module = getVideoExportModule();
  if (!module) {
    throw { type: 'unsupported' } satisfies VideoExportError;
  }
  try {
    return await module.exportVideo(request);
  } catch (error) {
    throw toVideoExportError(error);
  }
}

// Re-export the types and the HybridObject interface for consumers.
export type {
  VideoExportModule,
  VideoExportRequest,
  VideoExportResult,
  VideoExportError,
  VideoOverlay,
  VideoTextOverlay,
  VideoStickerOverlay,
} from './VideoExportModule.nitro';
