// ── Scene Evaluator ─────────────────────────────────────────────────
//
// The single pure owner of scene state at a given time and viewport
// (AGENTS.md §6.3). Given a composition document, a playback time, a
// viewport size, and a render profile, it returns the resolved scene:
//
//   - visible layers (filtered by z-order, visibility, temporal bounds)
//   - per-layer transforms (position, scale, rotation, crop, opacity)
//   - per-layer effect graph (color matrix, blur, vignette, mask)
//   - interaction metadata (which stickers are interactive, their types)
//
// This is a PURE FUNCTION. No React, no side effects, no state, no shared
// values. Every renderer — edit, preview, viewer, thumbnail, export —
// calls the same evaluator so the scene is identical across surfaces.
//
// The evaluator owns (per §6.3):
//   z-order and visibility · page and clip timing · keyframe interpolation
//   · layer transforms and crop · adjustment-layer application ranges
//   · effect parameter normalization · interactive sticker semantics
//
// It does NOT own: gesture handling, selection state, chrome, or the
// actual pixel rendering (that is the renderer's job, driven by the
// evaluated scene).

import type {
  CreatorDocument,
  CreatorLayer,
  CreatorPage,
  EffectNode,
} from '../composition';
import { evaluateAllKeyframes } from '../core/playback/KeyframeEvaluator';
import {
  evaluateCompositionEffectStack,
  type EvaluatedEffect,
} from '../core/playback/EffectEvaluator';
import {
  getActiveAdjustmentLayers,
  applyAdjustmentLayersToClip,
  type CombinedEffectStack,
} from '../core/playback/AdjustmentLayerEvaluator';
import {
  isInteractiveLayer,
  getCapabilityForLayerType,
} from '../capabilities/registry';
import type { RenderProfile } from './renderProfiles';
import { isCapabilityActive } from './renderProfiles';

// ── Viewport ────────────────────────────────────────────────────────

/**
 * The pixel viewport the renderer will draw into. The evaluator uses it to
 * resolve normalized (0..1) layer coordinates into pixel rects so the
 * renderer does not repeat the math.
 */
export interface Viewport {
  width: number;
  height: number;
}

// ── Resolved transform ──────────────────────────────────────────────

/**
 * A layer's resolved transform at a given time. Coordinates are in pixels
 * relative to the viewport. `crop` is the source-asset crop rectangle in
 * normalized 0..1 space (absent when no crop is authored).
 */
export interface ResolvedTransform {
  /** Center X in pixels. */
  x: number;
  /** Center Y in pixels. */
  y: number;
  /** Width in pixels (already scaled). */
  width: number;
  /** Height in pixels (already scaled). */
  height: number;
  scale: number;
  rotationDeg: number;
  opacity: number;
  zIndex: number;
}

// ── Resolved effect graph ───────────────────────────────────────────

/**
 * The effect graph for a single layer at a given time. This is the
 * render-ready form: a single combined color matrix, blur radius, and
 * vignette amount, plus the mask reference if present.
 *
 * For video layers, this is populated ONLY when the render profile has
 * `videoEffects` active. Otherwise `applicable` is false and the renderer
 * must use the native video path without per-pixel effects.
 */
export interface ResolvedEffectGraph {
  /** Whether the effect graph should be applied by the renderer. */
  applicable: boolean;
  /** Combined 4×5 color matrix (20 numbers) or undefined if none. */
  colorMatrix?: number[];
  /** Gaussian blur radius in pixels, or undefined if none. */
  blurRadius?: number;
  /** Vignette strength 0..1, or undefined if none. */
  vignetteAmount?: number;
  /** Alpha mask URI (maskRef), or undefined if no mask. */
  maskUri?: string;
}

// ── Interaction metadata ────────────────────────────────────────────

/**
 * Interaction metadata for a layer. Only interactive sticker types
 * (vote, mention, product, look, quiz, question, etc.) carry this. Visual
 * layers (decorative, draw, gif, time, weather, adjustment) and media
 * layers do not.
 */
export interface InteractionMetadata {
  /** Whether the layer is an interactive sticker type. */
  interactive: boolean;
  /** The capability ID that gates this layer type, if any. */
  capabilityId: string | null;
  /** Whether that capability is active for the current render profile. */
  capabilityActive: boolean;
}

// ── Resolved layer ──────────────────────────────────────────────────

/**
 * A single layer resolved for rendering at a given time. This is the
 * renderer's complete input — it should not need to read the document or
 * the layer's raw payload to make a rendering decision.
 */
export interface ResolvedLayer {
  layer: CreatorLayer;
  transform: ResolvedTransform;
  effectGraph: ResolvedEffectGraph;
  interaction: InteractionMetadata;
  /**
   * For media layers: whether to render via Skia video frames. True only
   * when the layer is a video AND the profile supports skiaVideoFrames.
   * The renderer uses this to choose between the Skia video path and the
   * native VideoView fallback.
   */
  useSkiaVideoFrames: boolean;
}

// ── Resolved scene ──────────────────────────────────────────────────

export interface ResolvedScene {
  /** Visible layers sorted by zIndex ascending (back to front). */
  layers: ResolvedLayer[];
  /** The page this scene was evaluated from. */
  pageId: string;
  /** The document canvas aspect ratio (width / height). */
  aspectRatio: number;
  /** Whether the canvas background should be skipped (full-bleed media). */
  skipBackground: boolean;
  /** The render profile used to evaluate this scene. */
  profile: RenderProfile;
}

// ── Temporal visibility ──────────────────────────────────────────────

/**
 * Returns true if a layer is visible at the given time. A layer is
 * temporally visible when:
 *   - it is not hidden, AND
 *   - it has no timeRange, OR the current time falls within [start, end).
 *
 * When no playback time is provided (static contexts — Look composer,
 * thumbnail), temporal bounds are ignored.
 */
function isLayerTemporallyVisible(
  layer: CreatorLayer,
  timeMs: number | undefined,
): boolean {
  if (layer.hidden) return false;
  if (timeMs === undefined || !layer.timeRange) return true;
  return timeMs >= layer.timeRange.startMs && timeMs < layer.timeRange.endMs;
}

// ── Transform resolution ────────────────────────────────────────────

/**
 * Resolve a layer's transform at a given time, applying keyframe
 * interpolation when present and scaling normalized coordinates to the
 * viewport.
 */
function resolveTransform(
  layer: CreatorLayer,
  timeMs: number | undefined,
  viewport: Viewport,
): ResolvedTransform {
  // Keyframe interpolation — only when a playback time is provided.
  const keyframed =
    timeMs !== undefined && layer.keyframes && layer.keyframes.length > 0
      ? evaluateAllKeyframes(layer.keyframes, timeMs)
      : null;

  const scale = keyframed?.scale ?? layer.scale;
  const rotationDeg = keyframed?.rotation ?? layer.rotation;
  const xNorm = keyframed?.position !== undefined ? keyframed.position : layer.x;
  const yNorm = layer.y;

  // Opacity: layer opacity × keyframe opacity.
  let opacity = layer.opacity;
  if (keyframed?.opacity !== undefined) {
    opacity *= keyframed.opacity;
  }
  // Clamp to [0, 1].
  opacity = Math.max(0, Math.min(1, opacity));

  const width = layer.width * viewport.width * scale;
  const height = layer.height * viewport.height * scale;

  return {
    x: xNorm * viewport.width,
    y: yNorm * viewport.height,
    width,
    height,
    scale,
    rotationDeg,
    opacity,
    zIndex: layer.zIndex,
  };
}

// ── Effect graph resolution ─────────────────────────────────────────

/**
 * Resolve the effect graph for a media layer at a given time, merging the
 * clip's own effects with active adjustment layers.
 *
 * For video layers, the effect graph is only `applicable` when the render
 * profile has `videoEffects` active. For image layers, it is applicable
 * whenever there are effects or a mask.
 */
function resolveEffectGraph(
  layer: Extract<CreatorLayer, { type: 'media' }>,
  timeMs: number | undefined,
  siblingLayers: CreatorLayer[],
  profile: RenderProfile,
  compareOriginal: boolean,
): ResolvedEffectGraph {
  const maskUri = layer.maskRef;

  // Video layers: gate the entire effect graph on the videoEffects
  // capability. When hidden, the renderer must use the native VideoView
  // and no per-pixel effects are applied (§6.4 — no metadata-only effect
  // is advertised as a visible result).
  const isVideo = layer.payload.mediaType === 'video';
  if (isVideo && !profile.videoEffects) {
    return { applicable: false, maskUri };
  }

  // Compare-to-original: skip all effect evaluation so the user sees the
  // ungraded media (Lightroom long-press compare pattern).
  if (compareOriginal) {
    return { applicable: false, maskUri };
  }

  const t = timeMs ?? 0;
  const clipEffects: EffectNode[] = layer.payload.effects ?? [];

  // Resolve active adjustment layers from the sibling set.
  const adjustmentLayers = siblingLayers.length > 0
    ? getActiveAdjustmentLayers(siblingLayers, t)
    : [];

  // Fast path: no adjustment layers.
  if (adjustmentLayers.length === 0) {
    if (clipEffects.length === 0 && !maskUri) {
      return { applicable: false };
    }
    const evaluated = evaluateCompositionEffectStack(clipEffects, 1);
    return {
      applicable: true,
      colorMatrix: evaluated.colorMatrix,
      blurRadius: evaluated.blurRadius,
      vignetteAmount: evaluated.vignetteAmount,
      maskUri,
    };
  }

  // Combined path: clip effects + adjustment layer segments.
  const combined: CombinedEffectStack = applyAdjustmentLayersToClip(
    { id: layer.id, effects: clipEffects },
    adjustmentLayers,
    t,
  );

  let colorMatrix: number[] | undefined;
  let blurRadius = 0;
  let vignetteAmount = 0;
  let hasBlur = false;
  let hasVignette = false;

  for (const segment of combined.segments) {
    const segResult = evaluateCompositionEffectStack(segment.effects, segment.intensity);
    if (segResult.colorMatrix) {
      // Multiply matrices to compose the grades.
      colorMatrix = colorMatrix
        ? multiplyColorMatrices(colorMatrix, segResult.colorMatrix)
        : [...segResult.colorMatrix];
    }
    if (segResult.blurRadius !== undefined && segResult.blurRadius > 0) {
      blurRadius = Math.max(blurRadius, segResult.blurRadius);
      hasBlur = true;
    }
    if (segResult.vignetteAmount !== undefined && segResult.vignetteAmount > 0) {
      vignetteAmount += segResult.vignetteAmount;
      hasVignette = true;
    }
  }

  return {
    applicable: true,
    colorMatrix,
    blurRadius: hasBlur ? blurRadius : undefined,
    vignetteAmount: hasVignette ? Math.min(1, vignetteAmount) : undefined,
    maskUri,
  };
}

// Local matrix multiply — avoids importing the full EffectEvaluator surface
// into the evaluator's dependency graph. Identical algorithm.
function multiplyColorMatrices(a: readonly number[], b: readonly number[]): number[] {
  const result = new Array(20).fill(0);
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 5; col++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        sum += a[row * 5 + k] * b[k * 5 + col];
      }
      if (col === 4) sum += a[row * 5 + 4];
      result[row * 5 + col] = sum;
    }
  }
  return result;
}

// ── Interaction metadata resolution ─────────────────────────────────

function resolveInteraction(
  layer: CreatorLayer,
  profile: RenderProfile,
): InteractionMetadata {
  const interactive = isInteractiveLayer(layer.type);
  if (!interactive) {
    return { interactive: false, capabilityId: null, capabilityActive: false };
  }
  const capabilityId = getCapabilityForLayerType(layer.type);
  const capabilityActive = capabilityId !== null && isCapabilityActive(profile, capabilityId);
  return { interactive, capabilityId, capabilityActive };
}

// ── Full-bleed background detection ─────────────────────────────────

function hasFullBleedMediaLayer(page: CreatorPage): boolean {
  return page.layers.some(
    (l) => l.type === 'media' && !l.hidden && l.width >= 1 && l.height >= 1,
  );
}

// ── Main entry point ────────────────────────────────────────────────

export interface EvaluateSceneOptions {
  /** The composition document to evaluate. */
  document: CreatorDocument;
  /** The page to render. When omitted, the first page is used. */
  page?: CreatorPage;
  /** Current playback time in ms. Omit for static (non-temporal) contexts. */
  timeMs?: number;
  /** The pixel viewport the renderer will draw into. */
  viewport: Viewport;
  /** The render profile gating which features are live. */
  profile: RenderProfile;
  /**
   * When true, media layers render without their effect stack (the
   * Lightroom long-press compare-to-original pattern). Default false.
   */
  compareOriginal?: boolean;
}

/**
 * Evaluate the scene for a given document, time, viewport, and render
 * profile.
 *
 * Pure function: no React, no side effects, no state. The same inputs
 * always produce the same output. Safe to call inside useMemo.
 */
export function evaluateScene(options: EvaluateSceneOptions): ResolvedScene {
  const { document, timeMs, viewport, profile, compareOriginal = false } = options;
  const page = options.page ?? document.pages[0];
  if (!page) {
    return { layers: [], pageId: '', aspectRatio: document.canvas.aspectRatio, skipBackground: false, profile };
  }

  const allLayers = page.layers;
  const visibleLayers = allLayers
    .filter((l) => isLayerTemporallyVisible(l, timeMs))
    .sort((a, b) => a.zIndex - b.zIndex);

  const resolved: ResolvedLayer[] = visibleLayers.map((layer) => {
    const transform = resolveTransform(layer, timeMs, viewport);
    const interaction = resolveInteraction(layer, profile);

    // Effect graph is only meaningful for media layers.
    let effectGraph: ResolvedEffectGraph;
    let useSkiaVideoFrames = false;
    if (layer.type === 'media') {
      effectGraph = resolveEffectGraph(
        layer,
        timeMs,
        allLayers,
        profile,
        compareOriginal,
      );
      useSkiaVideoFrames =
        layer.payload.mediaType === 'video' && profile.skiaVideoFrames;
    } else {
      effectGraph = { applicable: false };
    }

    return { layer, transform, effectGraph, interaction, useSkiaVideoFrames };
  });

  return {
    layers: resolved,
    pageId: page.id,
    aspectRatio: document.canvas.aspectRatio,
    skipBackground: hasFullBleedMediaLayer(page),
    profile,
  };
}

// ── Convenience: evaluate the first visible media layer ─────────────

/**
 * Returns the first visible media layer in the resolved scene, or null.
 * Useful for thumbnails and export-still contexts that only need the
 * primary media.
 */
export function primaryMediaLayer(scene: ResolvedScene): ResolvedLayer | null {
  return scene.layers.find((rl) => rl.layer.type === 'media') ?? null;
}
