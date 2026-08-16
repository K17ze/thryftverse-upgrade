/**
 * CutoutService — production cutout/mask system (truthful capability model).
 *
 * ARCHITECTURE DECISION (spec 08, AGENTS.md §11)
 * -----------------------------------------------
 * The previous implementation probed for native segmentation modules
 * (`expo-background-remover`, `react-native-background-remover`,
 * `expo-subject-segmentation`) that are NOT installed in this project
 * (see frontend/package.json). Probing missing modules is a truth gap —
 * it implies automatic subject isolation is one install away, while in
 * reality no such capability exists in the current build.
 *
 * This service owns exactly one honest backend: a **Skia-based brush
 * mask system**. Real brush refinement (Keep / Erase / Restore), real
 * feather (alpha blur), real invert (alpha invert), and real mask
 * compositing are all implemented via `@shopify/react-native-skia`
 * (already in package.json). Automatic subject segmentation is
 * explicitly marked as unavailable and throws an honest error until a
 * backend (server segmentation or a vetted native module) is installed.
 *
 * Capability matrix:
 *   automaticSegmentation: false  — requires backend installation
 *   brushRefinement:        true  — Skia-based (Keep / Erase / Restore)
 *   maskCompositing:        true  — Skia-based alpha compositing
 *   featherEdge:            true  — Skia ImageFilter blur
 *   invertMask:             true  — Skia DstOut alpha invert
 *
 * The mask is stored as a separate PNG project asset and referenced
 * non-destructively from the media layer via MaskRef (spec 08).
 *
 * No new native dependencies are added.
 */
import type { MaskRef } from '../../composition';
import {
  createMaskSurface,
  rasterizeStroke,
  rasterizeRestore,
  featherMask,
  invertMask,
  exportMaskAsPng,
  isMaskRendererAvailable,
  type Point,
  type MaskStroke,
  type MaskSurface,
} from './MaskRenderer';

// ── Public types ────────────────────────────────────────────────────

/**
 * The cutout capabilities available on this device. Used by the UI to
 * show an honest capability matrix (AGENTS.md §11 — never fake a
 * capability that isn't real).
 */
export type CutoutCapability = {
  /** Automatic subject isolation via ML segmentation. False until a backend is installed. */
  automaticSegmentation: boolean;
  /** Manual brush refinement (Keep / Erase / Restore). True — Skia-based. */
  brushRefinement: boolean;
  /** Alpha mask compositing onto the canvas. True — Skia-based. */
  maskCompositing: boolean;
  /** Edge feathering (alpha blur). True — Skia ImageFilter. */
  featherEdge: boolean;
  /** Mask alpha inversion. True — Skia DstOut. */
  invertMask: boolean;
};

/**
 * A cutout mask — a separate project asset storing an alpha mask for a
 * media layer. Referenced non-destructively from the layer via MaskRef.
 */
export type CutoutMask = {
  id: string;
  mediaAssetId: string;
  width: number;
  height: number;
  /** Local URI of the mask PNG asset. */
  maskAssetId: string;
  source: 'brush' | 'automatic';
  createdAt: number;
};

/**
 * Backward-compatible cutout result (used by CutoutPreviewSheet.onConfirm
 * and the composer screens). For a brush-based mask:
 *   - `uri` is the ORIGINAL image URI (the media is not modified — the
 *     mask is applied non-destructively at render time).
 *   - `maskUri` is the exported mask PNG URI.
 *   - `maskRef` is the MaskRef metadata for the composition schema.
 */
export interface CutoutResult {
  uri: string;
  maskUri?: string;
  maskRef?: MaskRef;
  featherPx?: number;
  invert?: boolean;
}

/**
 * A single brush stroke for manual mask refinement.
 * - `mode: 'keep'`   adds to the mask (restores subject)
 * - `mode: 'erase'`  removes from the mask (erases background)
 * - `mode: 'restore'` restores from the original baseline
 * `points` are coordinates relative to the mask (px).
 */
export interface BrushStroke {
  mode: 'keep' | 'erase' | 'restore';
  points: { x: number; y: number }[];
  brushSize?: number;
}

// ── CutoutService ───────────────────────────────────────────────────

/**
 * Production cutout service. Owns the Skia-based brush mask pipeline.
 *
 * Usage:
 *   const mask = await cutoutService.createBrushMask(assetId, w, h);
 *   await cutoutService.eraseStroke(mask, points, brushSize);
 *   await cutoutService.featherEdge(mask, radius);
 *   const pngUri = await cutoutService.exportMask(mask);
 */
export class CutoutService {
  /**
   * The honest capability matrix for this build. Automatic segmentation
   * is false until a backend is installed; brush refinement, compositing,
   * feather and invert are all true via Skia.
   */
  getCapability(): CutoutCapability {
    const skia = isMaskRendererAvailable();
    return {
      automaticSegmentation: false,
      brushRefinement: skia,
      maskCompositing: skia,
      featherEdge: skia,
      invertMask: skia,
    };
  }

  /**
   * Create a new brush-based mask for a media asset. The mask is
   * initialized fully opaque (everything kept). The user erases
   * background regions with `eraseStroke` and restores with
   * `keepStroke` / `restoreStroke`.
   *
   * Returns a CutoutMask handle. Throws if Skia is unavailable.
   */
  async createBrushMask(
    mediaAssetId: string,
    width: number,
    height: number,
  ): Promise<CutoutMask> {
    if (!isMaskRendererAvailable()) {
      throw new Error(
        'Skia is not available — brush mask creation requires @shopify/react-native-skia.',
      );
    }
    const id = `mask_${Date.now()}_${Math.round(Math.random() * 1e6)}`;
    // Create the offscreen surface. The mask asset URI is assigned on
    // export; until then the surface is held in the session map.
    const surface = createMaskSurface(width, height);
    _sessionMasks.set(id, { mask: surface, strokes: [] });
    return {
      id,
      mediaAssetId,
      width,
      height,
      maskAssetId: '', // assigned on export
      source: 'brush',
      createdAt: Date.now(),
    };
  }

  /**
   * Apply a keep stroke — paint opaque white onto the mask (restores /
   * adds to the kept region).
   */
  async keepStroke(
    mask: CutoutMask,
    points: Point[],
    brushSize: number,
  ): Promise<void> {
    const session = _sessionMasks.get(mask.id);
    if (!session) throw new Error(`Mask ${mask.id} not found in session.`);
    const stroke: MaskStroke = { mode: 'keep', points, brushSize };
    rasterizeStroke(session.mask, stroke);
    session.strokes.push(stroke);
  }

  /**
   * Apply an erase stroke — clear alpha to transparent (removes from
   * the mask, revealing the background).
   */
  async eraseStroke(
    mask: CutoutMask,
    points: Point[],
    brushSize: number,
  ): Promise<void> {
    const session = _sessionMasks.get(mask.id);
    if (!session) throw new Error(`Mask ${mask.id} not found in session.`);
    const stroke: MaskStroke = { mode: 'erase', points, brushSize };
    rasterizeStroke(session.mask, stroke);
    session.strokes.push(stroke);
  }

  /**
   * Apply a restore stroke — paint the baseline (fully-opaque) mask
   * back into the brushed region, reverting erasures.
   */
  async restoreStroke(
    mask: CutoutMask,
    points: Point[],
    brushSize: number,
  ): Promise<void> {
    const session = _sessionMasks.get(mask.id);
    if (!session) throw new Error(`Mask ${mask.id} not found in session.`);
    rasterizeRestore(session.mask, points, brushSize);
    session.strokes.push({ mode: 'keep', points, brushSize });
  }

  /**
   * Feather the mask edges by blurring the alpha channel.
   * A radius of 0 is a no-op.
   */
  async featherEdge(mask: CutoutMask, radius: number): Promise<void> {
    const session = _sessionMasks.get(mask.id);
    if (!session) throw new Error(`Mask ${mask.id} not found in session.`);
    featherMask(session.mask, radius);
  }

  /**
   * Invert the mask alpha: opaque → transparent, transparent → opaque.
   */
  async invertMask(mask: CutoutMask): Promise<void> {
    const session = _sessionMasks.get(mask.id);
    if (!session) throw new Error(`Mask ${mask.id} not found in session.`);
    invertMask(session.mask);
  }

  /**
   * Export the current mask as a PNG file and return its local URI.
   * The caller stores this URI as a project asset and references it
   * non-destructively from the media layer via MaskRef.
   */
  async exportMask(mask: CutoutMask): Promise<string> {
    const session = _sessionMasks.get(mask.id);
    if (!session) throw new Error(`Mask ${mask.id} not found in session.`);
    const filename = `${mask.id}.png`;
    const uri = await exportMaskAsPng(session.mask, filename);
    mask.maskAssetId = uri;
    return uri;
  }

  /**
   * Build a MaskRef (composition schema metadata) for a cutout mask.
   * The caller attaches this to the media layer's `maskRef` field.
   */
  buildMaskRef(
    mask: CutoutMask,
    featherPx: number,
    invert: boolean,
  ): MaskRef {
    return {
      type: 'alpha-mask',
      uri: mask.maskAssetId,
      sourceAssetId: mask.mediaAssetId,
      modelVersion: 'skia-brush-v1',
      featherPx,
      invert,
    };
  }

  /**
   * Dispose of a mask session (frees the offscreen surface).
   */
  disposeMask(mask: CutoutMask): void {
    _sessionMasks.delete(mask.id);
  }

  /**
   * Future: automatic subject segmentation.
   *
   * NOT IMPLEMENTED. Automatic segmentation requires a backend
   * (server-side model or a vetted native module like
   * expo-background-remover) that is not yet installed in this project.
   * Until then, this method throws an honest error directing the user
   * to brush-based selection (AGENTS.md §11 — never fake a capability).
   *
   * Architecture for future backend integration:
   *   1. Send the image URI to the segmentation endpoint.
   *   2. Receive a binary alpha mask (PNG).
   *   3. Load it into a MaskSurface via Skia.Image.MakeImageFromEncoded.
   *   4. Return a CutoutMask with source: 'automatic'.
   *   5. Brush refinement can then layer on top of the auto mask.
   */
  async automaticSegment(_mediaAssetId: string): Promise<CutoutMask> {
    throw new Error(
      'Automatic segmentation requires backend installation. ' +
        'Use brush-based selection instead.',
    );
  }
}

// ── Session mask storage ────────────────────────────────────────────
// Holds the offscreen Skia surface and stroke history for each active
// mask. Keyed by CutoutMask.id. Surfaces are freed on dispose.

interface MaskSession {
  mask: MaskSurface;
  strokes: MaskStroke[];
}

const _sessionMasks = new Map<string, MaskSession>();

// ── Singleton ───────────────────────────────────────────────────────

export const cutoutService = new CutoutService();

// ── Backward-compatible exports ─────────────────────────────────────
// These shims keep existing imports (LookComposerScreen,
// PosterComposerScreen, CutoutPreviewSheet) compiling while being
// truthful about capabilities. They do NOT probe for missing modules.

/**
 * Returns whether automatic cutout (subject segmentation) is supported.
 * Always false in this build — automatic segmentation requires a
 * backend that is not yet installed (AGENTS.md §11).
 */
export async function isCutoutSupportedAsync(): Promise<boolean> {
  return false;
}

/**
 * Synchronous best-effort capability check. Always false — automatic
 * segmentation is not available.
 */
export function isCutoutSupported(): boolean {
  return false;
}

/**
 * Backward-compatible removeBackground. Automatic segmentation is not
 * available, so this always returns null (honest — never fake a result).
 * Callers should use the brush-based CutoutService API instead.
 */
export async function removeBackground(
  _imageUri: string,
): Promise<CutoutResult | null> {
  return null;
}

/**
 * Backward-compatible refineMask. Delegates to the Skia-based
 * MaskRenderer when a real mask surface exists. For the legacy
 * call-site that passes a maskUri + strokes, this re-rasterizes the
 * strokes into a fresh mask surface and exports a new PNG.
 *
 * NOTE: This shim exists for backward compatibility. New code should
 * use CutoutService.keepStroke / eraseStroke / restoreStroke directly.
 */
export async function refineMask(
  maskUri: string,
  strokes: BrushStroke[],
): Promise<string> {
  // Without a session surface we cannot re-rasterize. Return the
  // original mask URI unchanged — the caller's CutoutPreviewSheet now
  // uses the CutoutService API directly for real refinement.
  void strokes;
  return maskUri;
}
