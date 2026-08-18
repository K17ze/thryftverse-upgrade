/**
 * Playback module — canonical creator media pipeline.
 *
 * This module provides the single playback clock, keyframe evaluator,
 * effect evaluator, and timeline projector that drive all temporal state
 * in the creator editor (Z3 media pipeline + Z5 timeline playback engine).
 *
 * Exports:
 *   - PlaybackClock: single source of truth for playback time
 *   - evaluateKeyframes / evaluateAllKeyframes: keyframe interpolation
 *   - evaluateEffectStack / evaluateCompositionEffectStack: effect rendering
 *   - buildAdjustmentMatrix: color matrix from adjustment values
 *   - multiplyMatrix: 4×5 color matrix multiplication
 *   - projectTimeline: composition document → canonical timeline
 *   - findActiveClip / findVisibleOverlays / computeSourceTime: timeline queries
 */

// Playback clock
export { PlaybackClock } from './PlaybackClock';
export type { PlaybackState, PlaybackListener } from './PlaybackClock';

// Keyframe evaluator
export {
  evaluateKeyframes,
  evaluateAllKeyframes,
  easeLinear,
  easeInQuad,
  easeOutQuad,
  easeInOutQuad,
  easeSpring,
  applyEasing,
} from './KeyframeEvaluator';

// Effect evaluator
export {
  evaluateEffectStack,
  evaluateCompositionEffectStack,
  buildAdjustmentMatrix,
  multiplyMatrix,
} from './EffectEvaluator';
export type { EvaluatedEffect } from './EffectEvaluator';

// Timeline projector
export {
  projectTimeline,
  findActiveClip,
  findVisibleOverlays,
  computeSourceTime,
} from './TimelineProjector';
export type {
  ProjectedClip,
  ProjectedOverlay,
  ProjectedOverlayType,
  ProjectedTimeline,
} from './TimelineProjector';
