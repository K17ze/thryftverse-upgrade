// ── Temporal visibility & keyframe evaluation ──────────────────────
// Extracted verbatim from CreatorCanvas.tsx's LayerRenderer.
//
// CRITICAL — two time bases are deliberately separate:
//   `timeMs`         — ABSOLUTE timeline ms; drives `timeRange`
//                      temporal visibility (TimelineProjector contract).
//   `keyframeTimeMs` — CLIP-RELATIVE ms (`clipTimeMs`); keyframes are
//                      authored against clip-local time, so keyframe
//                      evaluation uses this base. Do NOT merge them —
//                      using the absolute clock for keyframes pins
//                      layers on page 2+ at their final keyframed state
//                      for the whole clip.
import { useEffect, useMemo, useRef } from 'react';
import {
  withTiming,
  withSpring,
  type SharedValue } from 'react-native-reanimated';
import type { CreatorLayer } from '../../core/projectStore/composition';
import type { PlaybackClock } from '../../core/playback/PlaybackClock';
import { evaluateKeyframes } from '../../core/playback/KeyframeEvaluator';
import { keyframeEasingToReanimated, type KeyframeEasing } from '../../poster/keyframes/KeyframeTypes';
import { Motion } from '../../../theme/motionTokens';
import type { useMotionConfig } from '../../../hooks/useMotionConfig';
import { KEYFRAME_SEEK_JUMP_MS } from './layerGeometry';

export type KeyframedValues = Partial<Record<'position' | 'scale' | 'rotation' | 'opacity', number>>;

export interface LayerTemporalPlaybackParams {
  layer: CreatorLayer;
  /** Playback clock — drives temporal visibility, keyframes, video play/pause/seek. */
  playbackClock?: PlaybackClock | null;
  /** Current playback time (ms) — absolute timeline clock, used for
   *  temporal visibility (`layer.timeRange` is absolute). */
  currentTimeMs?: number;
  /** Clip-relative playback time (ms) — keyframes are authored against
   *  clip-local time, so keyframe evaluation uses this base. */
  clipTimeMs?: number;
  canvasWidth: number;
  canvasHeight: number;
  reducedMotion: boolean;
  spring: ReturnType<typeof useMotionConfig>['spring'];
  translateX: SharedValue<number>;
  scaleSV: SharedValue<number>;
  rotationSV: SharedValue<number>;
}

export function useLayerTemporalPlayback({
  layer,
  playbackClock,
  currentTimeMs,
  clipTimeMs,
  canvasWidth,
  canvasHeight,
  reducedMotion,
  spring,
  translateX,
  scaleSV,
  rotationSV }: LayerTemporalPlaybackParams) {
  // When a playback clock is provided, layers with a timeRange are only
  // visible during that time window. Layers with keyframes have their
  // position/scale/rotation/opacity interpolated at the current time.
  const hasPlaybackClock = !!playbackClock;
  const timeMs = currentTimeMs ?? 0;
  // Keyframes are authored in clip-relative ms — global timeline time would
  // pin layers on page 2+ at their final keyframed state for the whole clip.
  const keyframeTimeMs = clipTimeMs ?? timeMs;

  // Temporal visibility: if the layer has a timeRange and we have a clock,
  // check whether the current time is within the range.
  const isTemporallyVisible = useMemo(() => {
    if (!hasPlaybackClock) return true;
    if (!layer.timeRange) return true;
    return timeMs >= layer.timeRange.startMs && timeMs < layer.timeRange.endMs;
  }, [hasPlaybackClock, layer.timeRange, timeMs]);

  // Keyframe evaluation: if the layer has keyframes and we have a clock,
  // compute the interpolated values at the current time.
  const keyframeValues = useMemo(() => {
    if (!hasPlaybackClock || !layer.keyframes || layer.keyframes.length === 0) return null;
    const result: KeyframedValues = {};
    const props: Array<'position' | 'scale' | 'rotation' | 'opacity'> = ['position', 'scale', 'rotation', 'opacity'];
    for (const prop of props) {
      const val = evaluateKeyframes(layer.keyframes!, keyframeTimeMs, prop);
      if (val !== null) result[prop] = val;
    }
    return Object.keys(result).length > 0 ? result : null;
  }, [hasPlaybackClock, layer.keyframes, keyframeTimeMs]);

  // Declared easing of the active keyframe segment per property (the
  // outgoing keyframe's easing, matching the evaluator's contract). Null
  // outside an active segment (holds before the first / after the last
  // keyframe have no easing to honour).
  const activeKeyframeEasings = useMemo(() => {
    if (!hasPlaybackClock || !layer.keyframes || layer.keyframes.length === 0) return null;
    const result: Partial<Record<'position' | 'scale' | 'rotation' | 'opacity', KeyframeEasing>> = {};
    const props: Array<'position' | 'scale' | 'rotation' | 'opacity'> = ['position', 'scale', 'rotation', 'opacity'];
    for (const prop of props) {
      const track = layer.keyframes.filter((k) => k.property === prop).sort((a, b) => a.timeMs - b.timeMs);
      if (track.length < 2) continue;
      if (keyframeTimeMs <= track[0].timeMs || keyframeTimeMs >= track[track.length - 1].timeMs) continue;
      const after = track.find((k) => k.timeMs >= keyframeTimeMs);
      if (after) result[prop] = after.easing;
    }
    return Object.keys(result).length > 0 ? result : null;
  }, [hasPlaybackClock, layer.keyframes, keyframeTimeMs]);

  // Apply keyframe values to shared values when in playback mode
  const lastKeyframeTimeRef = useRef<number | null>(null);
  useEffect(() => {
    if (!hasPlaybackClock || !keyframeValues) return;
    const prevTimeMs = lastKeyframeTimeRef.current;
    lastKeyframeTimeRef.current = timeMs;
    const isSeekJump = prevTimeMs !== null && Math.abs(timeMs - prevTimeMs) > KEYFRAME_SEEK_JUMP_MS;
    const applyKeyframed = (sv: SharedValue<number>, target: number, easing: KeyframeEasing | undefined) => {
      if (!isSeekJump || reducedMotion || !easing) {
        sv.value = target;
        return;
      }
      const mapped = keyframeEasingToReanimated(easing);
      sv.value = mapped
        ? withTiming(target, { duration: Motion.duration.fast, easing: mapped })
        : withSpring(target, spring.settle);
    };
    if (keyframeValues.position !== undefined) {
      // Position keyframes drive the center position (normalized 0-1)
      // The keyframe value is interpreted as a normalized position
      applyKeyframed(translateX, keyframeValues.position * canvasWidth, activeKeyframeEasings?.position);
    }
    if (keyframeValues.scale !== undefined) {
      applyKeyframed(scaleSV, keyframeValues.scale, activeKeyframeEasings?.scale);
    }
    if (keyframeValues.rotation !== undefined) {
      applyKeyframed(rotationSV, keyframeValues.rotation, activeKeyframeEasings?.rotation);
    }
  }, [hasPlaybackClock, keyframeValues, activeKeyframeEasings, timeMs, canvasWidth, canvasHeight, reducedMotion, spring, translateX, scaleSV, rotationSV]);

  // Compute effective opacity (layer opacity * keyframe opacity * temporal visibility)
  const effectiveOpacity = useMemo(() => {
    let opacity = layer.opacity;
    if (keyframeValues?.opacity !== undefined) {
      opacity *= keyframeValues.opacity;
    }
    if (hasPlaybackClock && !isTemporallyVisible) {
      opacity = 0;
    }
    return opacity;
  }, [layer.opacity, keyframeValues, hasPlaybackClock, isTemporallyVisible]);

  return { effectiveOpacity, keyframeValues };
}
