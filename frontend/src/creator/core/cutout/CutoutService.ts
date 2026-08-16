/**
 * CutoutService — capability-detected segmentation abstraction.
 *
 * Per spec 07_MEDIA_TOOLCHAIN §7, true cutout requires:
 *   1. segmentation
 *   2. mask preview
 *   3. edge refinement
 *   4. store alpha mask
 *   5. GPU compose
 *   6. only flatten at export/share preview
 *
 * This service provides a capability-detected graceful approach:
 *   - It attempts to dynamically import a native background-removal
 *     module (e.g. expo-background-remover) at runtime.
 *   - If the native module is available, it uses it for true subject
 *     segmentation (iOS 17+ Vision Framework, Android ML Kit).
 *   - If the native module is NOT available, it returns null so the
 *     caller can show an honest "not available on this device" message
 *     (AGENTS.md §11 — never fake a cutout success).
 *
 * No new npm dependencies are added. The dynamic import is wrapped in
 * try/catch so a missing or broken native module never crashes the app.
 */

import type { MaskRef } from '../../composition';

// ── Public types ────────────────────────────────────────────────────

/**
 * Result of a successful background removal / segmentation.
 * - `uri`: local URI of the resulting PNG with transparency
 * - `maskUri`: optional local URI of the standalone alpha mask
 * - `maskRef`: optional MaskRef metadata for the composition schema
 * - `featherPx`: edge feathering in pixels (0 = hard edge). Mirrors
 *   `MaskRef.featherPx` so callers can read it without unwrapping maskRef.
 * - `invert`: invert the mask (subject ↔ background). Mirrors
 *   `MaskRef.invert` for the same reason.
 */
export interface CutoutResult {
  uri: string;
  maskUri?: string;
  maskRef?: MaskRef;
  featherPx?: number;
  invert?: boolean;
}

/**
 * A single brush stroke from manual mask refinement.
 * - `mode: 'keep'` adds to the mask (restores subject) — green brush
 * - `mode: 'erase'` removes from the mask (erases background) — red brush
 * - `points` are coordinates relative to the preview frame (px)
 */
export interface BrushStroke {
  mode: 'keep' | 'erase';
  points: { x: number; y: number }[];
}

/**
 * Interface that any segmentation backend must implement.
 * A native module conforming to this shape can be dynamically imported
 * and used by CutoutService.
 */
export interface BackgroundRemoverModule {
  /**
   * Remove the background from an image, returning a PNG with
   * transparency. Returns null if the operation cannot be performed
   * (e.g. unsupported image format, model unavailable).
   */
  removeBackground(imageUri: string): Promise<{ uri: string; maskUri?: string } | null>;
  /**
   * Returns true if the native segmentation backend is available on
   * this device (e.g. iOS 17+ Vision Framework, Android ML Kit).
   */
  isAvailable?(): boolean;
}

// ── Capability detection ────────────────────────────────────────────

let _nativeModuleCache: BackgroundRemoverModule | null | undefined | false = undefined;

/**
 * Attempt to dynamically import a native background-removal module.
 *
 * We try several known module names so that whichever (if any) is
 * installed and linked will be picked up. The import is wrapped in
 * try/catch — a missing or broken native module never crashes the app.
 *
 * The result is cached for the session: once we know the module is
 * unavailable, we don't re-attempt the import on every call.
 */
async function loadNativeRemover(): Promise<BackgroundRemoverModule | null> {
  if (_nativeModuleCache === false) return null;
  if (_nativeModuleCache !== undefined) return _nativeModuleCache;

  const candidateModules = [
    'expo-background-remover',
    'react-native-background-remover',
    'expo-subject-segmentation',
  ];

  for (const modName of candidateModules) {
    try {
      // Dynamic import — wrapped in try/catch. If the module is not
      // installed or the native binary is not linked, this throws and
      // we move to the next candidate.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = await import(/* webpackIgnore: true */ modName);
      const candidate = mod?.default ?? mod;
      if (candidate && typeof candidate.removeBackground === 'function') {
        // If the module exposes an isAvailable() check, honour it.
        if (typeof candidate.isAvailable === 'function' && !candidate.isAvailable()) {
          continue;
        }
        _nativeModuleCache = candidate as BackgroundRemoverModule;
        return _nativeModuleCache;
      }
    } catch {
      // Module not installed or native binary not linked — try next.
      continue;
    }
  }

  _nativeModuleCache = false;
  return null;
}

/**
 * Returns true if a native segmentation backend is available on this
 * device. This is synchronous best-effort: it returns the cached result
 * of a previous `loadNativeRemover()` call. On first call before any
 * async probe has run, it returns false (conservative — don't claim a
 * capability we haven't verified).
 *
 * Callers that can tolerate an async check should use
 * `isCutoutSupportedAsync()` instead.
 */
export function isCutoutSupported(): boolean {
  return _nativeModuleCache != null && _nativeModuleCache !== false;
}

/**
 * Async variant — probes the native module and returns whether cutout
 * is supported on this device. Use this when the caller can await
 * (e.g. before opening the preview sheet).
 */
export async function isCutoutSupportedAsync(): Promise<boolean> {
  const mod = await loadNativeRemover();
  return mod !== null;
}

// ── Segmentation ────────────────────────────────────────────────────

/**
 * Remove the background from an image using the native segmentation
 * backend (if available).
 *
 * Returns a CutoutResult with the transparent PNG URI and optional
 * alpha mask metadata, or `null` if cutout is not available on this
 * device. The caller MUST handle the null case honestly — never fake
 * a cutout success (AGENTS.md §11).
 *
 * Per spec 07 §7, this performs true segmentation (not a trace
 * bounding box). The pipeline is:
 *   1. segmentation (native model)
 *   2. mask preview (caller renders the result)
 *   3. edge refinement (native model handles feathering)
 *   4. store alpha mask (caller writes maskRef to the composition)
 *   5. GPU compose (caller composites with transparency)
 *   6. only flatten at export/share preview
 */
export async function removeBackground(
  imageUri: string,
): Promise<CutoutResult | null> {
  const mod = await loadNativeRemover();
  if (!mod) return null;

  try {
    const result = await mod.removeBackground(imageUri);
    if (!result) return null;

    // Build MaskRef metadata for the composition schema. The caller
    // is responsible for registering the mask in the asset registry
    // and storing the maskRef id on the layer.
    const maskRef: MaskRef = {
      type: 'alpha-mask',
      uri: result.maskUri ?? result.uri,
      sourceAssetId: imageUri,
      modelVersion: 'native-segmentation-v1',
    };

    return {
      uri: result.uri,
      maskUri: result.maskUri,
      maskRef,
    };
  } catch {
    // The native module threw — treat as unavailable. Do not fake a
    // result (AGENTS.md §11).
    return null;
  }
}

// ── Edge refinement ────────────────────────────────────────────────

/**
 * Refine an existing mask using manual brush strokes.
 *
 * NOTE: True pixel-level mask refinement requires a native module that
 * can rasterize brush strokes into the alpha channel (e.g. a Skia-based
 * mask compositor or a native Vision / Core Image pass). That native
 * dependency is not yet wired in this build. This stub returns the
 * original mask URI unchanged so the caller can still commit the
 * auto-segmentation result — the visible stroke overlay rendered by
 * CutoutPreviewSheet is the honest representation of the user's
 * refinement intent until the native rasterizer is available
 * (AGENTS.md §11 — never fake a refinement that didn't happen).
 *
 * @param maskUri  URI of the current alpha mask to refine.
 * @param _strokes Brush strokes collected from the refine canvas.
 * @returns        The refined mask URI (currently the original unchanged).
 */
export async function refineMask(
  maskUri: string,
  _strokes: BrushStroke[],
): Promise<string> {
  // TODO(native): rasterize `_strokes` into the alpha mask via a native
  // Skia / Core Image module and return the new mask URI. Until then,
  // return the original mask unchanged.
  return maskUri;
}
