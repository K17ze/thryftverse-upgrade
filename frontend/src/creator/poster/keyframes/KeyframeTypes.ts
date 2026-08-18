/**
 * KeyframeTypes — per-layer animation keyframe model for the Poster composer.
 *
 * A keyframe pins a single animatable property of a layer to a numeric value
 * at a specific time. The composer interpolates between keyframes on the same
 * (layerId, property) track using the keyframe's easing curve.
 *
 * Properties are intentionally numeric-only so the interpolation math stays
 * uniform; colour and text animations are handled by separate systems.
 *
 * Design references:
 *   - AGENTS.md §17: easing options follow the standard motion vocabulary;
 *     `spring` is reserved for spatial continuity (position/scale).
 */

export type KeyframeProperty = 'position' | 'scale' | 'rotation' | 'opacity';

export type KeyframeEasing = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'spring';

export interface Keyframe {
  /** Stable unique id. */
  id: string;
  /** The layer this keyframe animates. */
  layerId: string;
  /** The property being animated. */
  property: KeyframeProperty;
  /** Time offset from the start of the layer's timeline, in milliseconds. */
  timeMs: number;
  /** Target value at this keyframe. Numeric (e.g. scale 1.0, opacity 0–1). */
  value: number;
  /** Interpolation curve from the previous keyframe to this one. */
  easing: KeyframeEasing;
}

/**
 * A sorted sequence of keyframes for a single (layer, property) pair. The
 * editor groups keyframes into tracks for rendering and interpolation.
 */
export interface KeyframeTrack {
  layerId: string;
  property: KeyframeProperty;
  keyframes: Keyframe[];
}

/** Default easing for newly created keyframes. */
export const DEFAULT_KEYFRAME_EASING: KeyframeEasing = 'ease-in-out';

/** Human-readable labels for the property selector. */
export const KEYFRAME_PROPERTY_LABELS: Record<KeyframeProperty, string> = {
  position: 'Position',
  scale: 'Scale',
  rotation: 'Rotation',
  opacity: 'Opacity',
};

/** Human-readable labels for the easing selector. */
export const KEYFRAME_EASING_LABELS: Record<KeyframeEasing, string> = {
  linear: 'Linear',
  'ease-in': 'Ease In',
  'ease-out': 'Ease Out',
  'ease-in-out': 'Ease In Out',
  spring: 'Spring',
};
