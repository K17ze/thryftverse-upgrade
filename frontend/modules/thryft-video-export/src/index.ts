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
 * The native implementations live in `ios/` (AVFoundation) and `android/`
 * (Media3 Transformer); the generated bindings live in `nitrogen/generated/`.
 */
import { NitroModules } from 'react-native-nitro-modules';

import type { VideoExportModule } from './VideoExportModule.nitro';
import type {
  VideoExportRequest,
  VideoExportResult,
  VideoExportError,
  VideoOverlay,
  VideoOverlayKind,
  VideoTextAlignment,
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
const ERROR_TAGS = new Set([
  'cancelled',
  'unsupported',
  'render_failed',
  'invalid_input',
]);

function toVideoExportError(error: unknown): VideoExportError {
  // Already a shaped VideoExportError (e.g. re-thrown from a guard).
  if (
    error !== null &&
    typeof error === 'object' &&
    'type' in error &&
    typeof (error as { type: unknown }).type === 'string'
  ) {
    const type = (error as { type: string }).type;
    if (ERROR_TAGS.has(type)) {
      return error as VideoExportError;
    }
  }

  const message =
    error instanceof Error ? error.message : String(error);

  // The native implementations (VideoExportError.swift /
  // VideoExportError.kt) prefix every failure with the union tag —
  // `"{code}:{detail}"`. Recover it before falling back to heuristics.
  const prefixMatch = /^(\w+):\s?(.*)$/s.exec(message);
  if (prefixMatch && ERROR_TAGS.has(prefixMatch[1])) {
    const type = prefixMatch[1] as VideoExportError['type'];
    const detail = prefixMatch[2];
    if (type === 'cancelled') return { type: 'cancelled' };
    if (type === 'unsupported') return { type: 'unsupported' };
    return { type, message: detail };
  }

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

/** Poll cadence for `exportVideo`'s progress reporting. */
const PROGRESS_POLL_MS = 250;

/**
 * Export a video via the native module with progress + cancellation
 * plumbing — the caller-facing API over the raw HybridObject surface.
 *
 * - `onProgress` receives the real 0..1 progress polled from the native
 *   pipeline (`getExportProgress`) on a 250ms cadence.
 * - The returned handle's `cancel()` aborts the native pipeline; the
 *   promise rejects with `{ type: 'cancelled' }`.
 * - Cancellation and progress are keyed off `sessionId` inside the native
 *   module, so the job survives JS teardown of this handle.
 */
export function exportVideo(
  request: VideoExportRequest,
  onProgress?: (progress: number) => void,
): { promise: Promise<VideoExportResult>; cancel: () => void } {
  const module = getVideoExportModule();
  if (!module) {
    return {
      promise: Promise.reject({ type: 'unsupported' } satisfies VideoExportError),
      cancel: () => {},
    };
  }

  let settled = false;
  let cancelled = false;
  let poller: ReturnType<typeof setInterval> | null = null;

  const stopPolling = () => {
    if (poller !== null) {
      clearInterval(poller);
      poller = null;
    }
  };

  if (onProgress) {
    poller = setInterval(() => {
      if (settled || cancelled) return;
      try {
        onProgress(module.getExportProgress(request.sessionId));
      } catch {
        // A progress read must never crash the export.
      }
    }, PROGRESS_POLL_MS);
  }

  const promise = exportVideoViaNative(request)
    .then((result) => {
      // Report honest completion — the native session is already
      // unregistered at this point, so `getExportProgress` would read 0.
      if (onProgress && !cancelled) onProgress(1);
      return result;
    })
    .finally(() => {
      settled = true;
      stopPolling();
    });

  return {
    promise,
    cancel: () => {
      cancelled = true;
      stopPolling();
      try {
        module.cancelExport(request.sessionId);
      } catch {
        // Idempotent — a missing/completed session is a no-op natively.
      }
    },
  };
}

/**
 * Cancel an in-progress export by session id. Prefer the `cancel` handle
 * returned by `exportVideo`; this is for callers that only hold the id.
 */
export function cancelVideoExport(sessionId: string): void {
  const module = getVideoExportModule();
  if (!module) return;
  try {
    module.cancelExport(sessionId);
  } catch {
    // no-op — cancellation is idempotent.
  }
}

// Re-export the types and the HybridObject interface for consumers.
export type {
  VideoExportModule,
  VideoExportRequest,
  VideoExportResult,
  VideoExportError,
  VideoOverlay,
  VideoOverlayKind,
  VideoTextAlignment,
  VideoTextOverlay,
  VideoStickerOverlay,
} from './VideoExportModule.nitro';
