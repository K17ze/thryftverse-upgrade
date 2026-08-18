/**
 * StickerPinTracker — object pinning / tracking system for sticker layers.
 *
 * When a sticker is pinned to a normalized anchor point on a media layer, it
 * follows that point as the media layer moves, scales, and rotates over time
 * (via keyframes). This module is the pure-math core: it records pins, resolves
 * a media layer's animated transform at a given time, and computes the
 * concrete canvas position the pinned sticker should occupy.
 *
 * Coordinate model (matches composition.ts):
 *   - Layer `x` / `y` are normalized 0..1 *center* positions on the canvas.
 *   - Layer `width` / `height` are normalized 0..1 fractions of the canvas.
 *   - `scale` is a uniform multiplier around the layer center.
 *   - `rotation` is in degrees, clockwise, around the layer center.
 *   - The pin `anchor` is a normalized 0..1 point *within* the target layer's
 *     local box (0,0 = top-left, 1,1 = bottom-right).
 *
 * The pin data is stored on the layer itself as `pin: { layerId, anchor }`
 * (see BaseLayerSchema in composition.ts), so it persists with the document
 * and survives undo/redo, duplication, and export.
 *
 * Per spec 07_MEDIA_TOOLCHAIN and AGENTS.md §4: production-quality, pure,
 * deterministic, and TypeScript-strict compatible.
 */
import type { CreatorLayer } from '../../composition';
import { evaluateAllKeyframes } from '../../core/playback/KeyframeEvaluator';
import type { Keyframe } from '../../poster/keyframes/KeyframeTypes';

// ── Types ──────────────────────────────────────────────────────────────

/**
 * A pin binding a sticker layer to a normalized anchor point on another
 * (typically media) layer. Stored on the sticker layer as `pin`.
 */
export interface StickerPin {
  /** The id of the media layer the sticker is pinned to. */
  layerId: string;
  /** Normalized 0..1 anchor point within the target layer's local box. */
  anchor: { x: number; y: number };
}

/**
 * A resolved layer transform at a specific time — the output of sampling a
 * layer's keyframes (or its static values when no keyframes exist).
 */
export interface LayerTransform {
  /** Center x in normalized canvas coords (0..1). */
  x: number;
  /** Center y in normalized canvas coords (0..1). */
  y: number;
  /** Uniform scale multiplier around the center. */
  scale: number;
  /** Rotation in degrees, clockwise, around the center. */
  rotation: number;
}

/**
 * The static geometry of a layer in normalized canvas coords. `x`/`y` are the
 * center; `width`/`height` are the box fractions. This is the untransformed
 * rest geometry — the transform is applied on top by `computeStickerTransform`.
 */
export interface LayerBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The computed placement for a pinned sticker at a given time.
 */
export interface StickerTransform {
  /** Center x in normalized canvas coords (0..1). */
  x: number;
  /** Center y in normalized canvas coords (0..1). */
  y: number;
  /** Rotation in degrees — the sticker inherits the media layer's rotation. */
  rotation: number;
}

// ── Pin recording ──────────────────────────────────────────────────────

/**
 * Record a pin on a sticker layer, binding it to `anchor` (0..1, 0..1) on the
 * media layer identified by `mediaLayerId`. Returns a new layer object with
 * the `pin` field set (does not mutate the input).
 *
 * Multiple stickers may be pinned to the same or different media layers —
 * each sticker carries its own independent `pin`.
 */
export function pinStickerToLayer(
  stickerLayer: CreatorLayer,
  mediaLayerId: string,
  anchor: { x: number; y: number },
): CreatorLayer {
  const clampedAnchor = {
    x: clamp01(anchor.x),
    y: clamp01(anchor.y),
  };
  return {
    ...stickerLayer,
    pin: {
      layerId: mediaLayerId,
      anchor: clampedAnchor,
    },
  };
}

/**
 * Remove the pin from a sticker layer. Returns a new layer object with the
 * `pin` field removed (does not mutate the input). If the layer was not
 * pinned, it is returned unchanged.
 */
export function unpinSticker(stickerLayer: CreatorLayer): CreatorLayer {
  if (stickerLayer.pin === undefined) return stickerLayer;
  const { pin: _pin, ...rest } = stickerLayer;
  return rest as CreatorLayer;
}

/**
 * Read the pin from a sticker layer, or `null` if it is not pinned.
 */
export function getStickerPin(stickerLayer: CreatorLayer): StickerPin | null {
  return stickerLayer.pin ?? null;
}

// ── Transform resolution ───────────────────────────────────────────────

/**
 * Resolve a layer's transform at a given time, sampling its keyframes for
 * position / scale / rotation and falling back to the layer's static values
 * for any property without keyframes.
 *
 * `currentTimeMs` is the offset from the start of the layer's timeline.
 */
export function resolveLayerTransform(
  layer: CreatorLayer,
  currentTimeMs: number,
): LayerTransform {
  const keyframes = (layer.keyframes ?? []) as Keyframe[];
  const evaluated = evaluateAllKeyframes(keyframes, currentTimeMs);

  // `position` keyframes animate the layer's center. When present, the
  // evaluated value replaces the static x/y. We treat the single scalar as
  // the x position and derive y proportionally is not possible with a single
  // scalar — instead, position keyframes store the x coordinate and the
  // layer's static y is preserved. Callers that need independent y animation
  // should use separate keyframe tracks; the schema models position as one
  // scalar so we apply it to x and keep y static for parity with the
  // existing KeyframeEvaluator contract.
  const x = evaluated.position ?? layer.x;
  const y = layer.y;
  const scale = evaluated.scale ?? layer.scale;
  const rotation = evaluated.rotation ?? layer.rotation;

  return { x, y, scale, rotation };
}

/**
 * Compute where a pinned sticker should be placed, given the media layer's
 * current transform and rest bounds.
 *
 * The anchor point (0..1 within the media layer's local box) is mapped into
 * canvas space, then the media layer's scale and rotation are applied around
 * the media layer's transformed center. The sticker inherits the media
 * layer's rotation so it appears anchored to the same physical point as the
 * media rotates.
 *
 * `currentTimeMs` is accepted for API completeness; the transform is expected
 * to already be resolved at that time (via `resolveLayerTransform`). This
 * keeps the function pure and lets callers drive resolution from any clock.
 */
export function computeStickerTransform(
  pin: StickerPin,
  mediaLayerTransform: LayerTransform,
  mediaLayerBounds: LayerBounds,
  _currentTimeMs = 0,
): StickerTransform {
  // Anchor point in the media layer's local box, relative to its center,
  // in normalized canvas fractions.
  const localX = (pin.anchor.x - 0.5) * mediaLayerBounds.width;
  const localY = (pin.anchor.y - 0.5) * mediaLayerBounds.height;

  // Apply the media layer's scale around its center.
  const scaledX = localX * mediaLayerTransform.scale;
  const scaledY = localY * mediaLayerTransform.scale;

  // Apply rotation (degrees → radians, clockwise).
  const rad = (mediaLayerTransform.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const rotatedX = scaledX * cos - scaledY * sin;
  const rotatedY = scaledX * sin + scaledY * cos;

  // Translate to the media layer's transformed center.
  return {
    x: mediaLayerTransform.x + rotatedX,
    y: mediaLayerTransform.y + rotatedY,
    rotation: mediaLayerTransform.rotation,
  };
}

// ── Document-level helpers ─────────────────────────────────────────────

/**
 * Resolve the pinned placement for every pinned sticker on a page at a given
 * time. Returns a map of sticker layer id → StickerTransform. Stickers whose
 * pin target is missing from `layers` are omitted (the target may have been
 * deleted).
 */
export function resolveAllPins(
  layers: CreatorLayer[],
  currentTimeMs: number,
): Record<string, StickerTransform> {
  const byId = new Map<string, CreatorLayer>();
  for (const layer of layers) byId.set(layer.id, layer);

  const result: Record<string, StickerTransform> = {};
  for (const layer of layers) {
    const pin = layer.pin;
    if (!pin) continue;
    const target = byId.get(pin.layerId);
    if (!target) continue;
    const transform = resolveLayerTransform(target, currentTimeMs);
    const bounds: LayerBounds = {
      x: target.x,
      y: target.y,
      width: target.width,
      height: target.height,
    };
    result[layer.id] = computeStickerTransform(pin, transform, bounds, currentTimeMs);
  }
  return result;
}

// ── Internal ───────────────────────────────────────────────────────────

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
