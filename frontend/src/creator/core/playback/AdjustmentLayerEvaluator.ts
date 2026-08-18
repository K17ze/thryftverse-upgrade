/**
 * AdjustmentLayerEvaluator — evaluates adjustment layers at a given time
 * and merges their effects with clip-level effects.
 *
 * (Meta Edits August 2026 feature)
 *
 * An adjustment layer applies an effect stack across the whole timeline
 * (or a subset of clips). When rendering a clip, the caller:
 *   1. Calls getActiveAdjustmentLayers() to find enabled adjustment
 *      layers that are temporally visible at the current time.
 *   2. Calls applyAdjustmentLayersToClip() to merge the adjustment
 *      layer effects with the clip's own effects, producing a combined
 *      effect stack that the renderer evaluates.
 *
 * The merge order is: clip effects first, then adjustment layer effects.
 * This means adjustment layers act as a global grade applied on top of
 * per-clip adjustments — matching the Instagram Edits / Meta Edits
 * adjustment layer semantics.
 */
import type { CreatorLayer, EffectNode, AdjustmentLayer } from '../../composition';

// ── Types ───────────────────────────────────────────────────────────

/**
 * A clip reference for adjustment layer application. The `id` is used
 * to match against the adjustment layer's `scope.clipIds`. The
 * `effects` field is the clip's own effect stack (from its media layer
 * payload).
 */
export interface ClipForAdjustment {
  id: string;
  effects: EffectNode[];
}

// ── Active adjustment layer selection ───────────────────────────────

/**
 * Get the enabled adjustment layers from a layer list that are active
 * at the given time.
 *
 * An adjustment layer is "active" at time T if:
 *   1. It is enabled (`payload.enabled === true`).
 *   2. It is not hidden (`hidden === false`).
 *   3. If it has a timeRange, T falls within [startMs, endMs).
 *      If it has no timeRange, it is always active (timeline-wide).
 *
 * @param layers        All layers in the page/document.
 * @param currentTimeMs Current playback time (ms). Ignored if no
 *                      playback clock is active (pass 0 for static).
 * @returns Enabled, temporally-visible adjustment layers.
 */
export function getActiveAdjustmentLayers(
  layers: CreatorLayer[],
  currentTimeMs: number,
): AdjustmentLayer[] {
  return layers.filter((layer): layer is AdjustmentLayer => {
    if (layer.type !== 'adjustment') return false;
    if (!layer.payload.enabled) return false;
    if (layer.hidden) return false;
    // Temporal visibility: if the adjustment layer has a timeRange,
    // it is only active during that window.
    if (layer.timeRange) {
      const { startMs, endMs } = layer.timeRange;
      if (currentTimeMs < startMs || currentTimeMs >= endMs) {
        return false;
      }
    }
    return true;
  });
}

// ── Effect stack merging ────────────────────────────────────────────

/**
 * Check whether an adjustment layer applies to a given clip.
 *
 * - scope 'all' → applies to every clip.
 * - scope { clipIds } → applies only if the clip's id is in the list.
 */
function adjustmentAppliesToClip(
  adjustment: AdjustmentLayer,
  clipId: string,
): boolean {
  const scope = adjustment.payload.scope;
  if (scope === 'all') return true;
  return scope.clipIds.includes(clipId);
}

/**
 * Merge a clip's own effects with the effects from active adjustment
 * layers, returning the combined effect stack.
 *
 * The merge order is:
 *   [clip's own effects, adjustmentLayer1.effects, adjustmentLayer2.effects, ...]
 *
 * This means clip-level adjustments are applied first, and adjustment
 * layer effects are applied on top — matching the Instagram Edits
 * semantic where the adjustment layer is a global grade.
 *
 * Each adjustment layer's `opacity` is applied as the intensity for
 * its effect stack. The caller (renderer) uses this to interpolate
 * the adjustment layer's contribution. When opacity is 0, the
 * adjustment layer's effects are excluded entirely.
 *
 * @param clip              The clip being rendered (with its own effects).
 * @param adjustmentLayers  All active adjustment layers (from
 *                          getActiveAdjustmentLayers).
 * @param currentTimeMs     Current playback time (ms) — used for
 *                          temporal scope checks.
 * @returns The combined effect stack with opacity annotations.
 */
export function applyAdjustmentLayersToClip(
  clip: ClipForAdjustment,
  adjustmentLayers: AdjustmentLayer[],
  currentTimeMs: number,
): CombinedEffectStack {
  const segments: EffectStackSegment[] = [];

  // Segment 0: the clip's own effects (full intensity).
  if (clip.effects.length > 0) {
    segments.push({
      effects: clip.effects,
      intensity: 1,
      source: 'clip',
    });
  }

  // Subsequent segments: each applicable adjustment layer's effects,
  // scaled by the layer's opacity.
  for (const adjustment of adjustmentLayers) {
    // Re-check temporal visibility (the caller may have filtered, but
    // we double-check for safety).
    if (adjustment.timeRange) {
      const { startMs, endMs } = adjustment.timeRange;
      if (currentTimeMs < startMs || currentTimeMs >= endMs) {
        continue;
      }
    }
    if (!adjustmentAppliesToClip(adjustment, clip.id)) continue;
    if (adjustment.payload.opacity <= 0) continue;
    if (adjustment.payload.effects.length === 0) continue;

    segments.push({
      effects: adjustment.payload.effects,
      intensity: adjustment.payload.opacity,
      source: 'adjustment',
      layerId: adjustment.id,
    });
  }

  return { segments };
}

// ── Result types ────────────────────────────────────────────────────

/**
 * A single segment of the combined effect stack. Each segment has its
 * own intensity (blend opacity) that the renderer uses to interpolate
 * the effect contribution.
 */
export interface EffectStackSegment {
  /** The ordered effect nodes in this segment. */
  effects: EffectNode[];
  /** Blend intensity (0..1). 1 = full effect, 0 = no effect. */
  intensity: number;
  /** Whether this segment comes from the clip or an adjustment layer. */
  source: 'clip' | 'adjustment';
  /** The adjustment layer ID (only for 'adjustment' source). */
  layerId?: string;
}

/**
 * The combined effect stack for a clip, split into segments so the
 * renderer can apply each segment with its own intensity.
 *
 * The renderer evaluates each segment independently (via
 * evaluateCompositionEffectStack) and composites the results. For
 * color matrices, this means multiplying the matrices from each
 * segment. For blur/vignette, the maximum across segments is taken.
 */
export interface CombinedEffectStack {
  segments: EffectStackSegment[];
}

// ── Convenience: flatten to a single effect list ────────────────────

/**
 * Flatten a CombinedEffectStack into a single EffectNode[] list.
 *
 * This is a convenience for renderers that do not need per-segment
 * intensity control. When all segments have intensity 1, the flattened
 * list produces the same result as evaluating segments independently
 * and compositing.
 *
 * For segments with intensity < 1, the flattened list loses the
 * intensity information — use the segment-based API for correct
 * opacity blending.
 */
export function flattenEffectStack(stack: CombinedEffectStack): EffectNode[] {
  return stack.segments.flatMap((seg) => seg.effects);
}
