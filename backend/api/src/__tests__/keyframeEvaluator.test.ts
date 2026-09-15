import { describe, it, expect } from 'vitest';
import {
  evaluateKeyframes,
  layerHasKeyframes,
  parseKeyframes,
  samplePropertyTrack,
  samplesToStaircaseExpr,
  type ParsedKeyframe,
} from '../lib/media/keyframeEvaluator.js';

// ---------------------------------------------------------------------------
// These tests pin the backend port to the frontend evaluator's semantics
// (frontend/src/creator/core/playback/KeyframeEvaluator.ts): first-value hold
// before the first keyframe, last-value hold after the last, per-segment
// easing taken from the outgoing (after) keyframe.
// ---------------------------------------------------------------------------

function kf(
  timeMs: number,
  value: number,
  property: ParsedKeyframe['property'] = 'position',
  easing: ParsedKeyframe['easing'] = 'linear',
): ParsedKeyframe {
  return { id: `k${timeMs}`, layerId: 'l1', property, timeMs, value, easing };
}

describe('evaluateKeyframes', () => {
  it('returns null for an empty or missing track', () => {
    expect(evaluateKeyframes([], 0, 'position')).toBeNull();
    expect(evaluateKeyframes([kf(0, 0.5, 'scale')], 0, 'position')).toBeNull();
  });

  it('holds the first value before the first keyframe', () => {
    const track = [kf(1000, 0.3), kf(2000, 0.7)];
    expect(evaluateKeyframes(track, 0, 'position')).toBe(0.3);
    expect(evaluateKeyframes(track, 999, 'position')).toBe(0.3);
  });

  it('holds the last value after the last keyframe', () => {
    const track = [kf(1000, 0.3), kf(2000, 0.7)];
    expect(evaluateKeyframes(track, 2000, 'position')).toBe(0.7);
    expect(evaluateKeyframes(track, 99999, 'position')).toBe(0.7);
  });

  it('interpolates linearly between keyframes', () => {
    const track = [kf(0, 0), kf(1000, 1)];
    expect(evaluateKeyframes(track, 500, 'position')).toBeCloseTo(0.5, 6);
  });

  it('applies the outgoing keyframe easing (ease-in bends early values)', () => {
    const track = [kf(0, 0), kf(1000, 1, 'position', 'ease-in')];
    // ease-in quad: t² — at t=0.5 → 0.25, not 0.5.
    expect(evaluateKeyframes(track, 500, 'position')).toBeCloseTo(0.25, 6);
  });

  it('ease-out quad is the mirror of ease-in', () => {
    const track = [kf(0, 0), kf(1000, 1, 'position', 'ease-out')];
    // t(2−t) at t=0.5 → 0.75.
    expect(evaluateKeyframes(track, 500, 'position')).toBeCloseTo(0.75, 6);
  });

  it('spring easings converge to the destination value', () => {
    const track = [kf(0, 0), kf(1000, 1, 'position', 'spring')];
    expect(evaluateKeyframes(track, 999, 'position')).toBeGreaterThan(0.8);
    expect(evaluateKeyframes(track, 1000, 'position')).toBe(1);
  });

  it('handles unsorted input by sorting on timeMs', () => {
    const track = [kf(2000, 0.7), kf(1000, 0.3)];
    expect(evaluateKeyframes(track, 500, 'position')).toBe(0.3);
    expect(evaluateKeyframes(track, 2500, 'position')).toBe(0.7);
  });

  it('degenerate zero-duration segment resolves to the first keyframe hold', () => {
    const track = [kf(500, 0.2), kf(500, 0.8)];
    // t == first.timeMs hits the before-first hold; t inside the collapsed
    // segment hits the segmentDuration<=0 guard returning `before`.
    expect(evaluateKeyframes(track, 500, 'position')).toBe(0.2);
    expect(evaluateKeyframes(track, 501, 'position')).toBe(0.8);
  });
});

describe('parseKeyframes', () => {
  it('drops malformed entries but keeps valid ones', () => {
    const parsed = parseKeyframes([
      { id: 'a', layerId: 'l', property: 'position', timeMs: 0, value: 0.5, easing: 'linear' },
      { property: 'bogus', timeMs: 0, value: 1, easing: 'linear' },
      { property: 'scale', timeMs: 'nope', value: 1, easing: 'linear' },
      { property: 'scale', timeMs: 100, value: NaN, easing: 'linear' },
      { property: 'scale', timeMs: -5, value: 1, easing: 'linear' },
    ]);
    expect(parsed).toHaveLength(1);
    expect(parsed![0]!.property).toBe('position');
  });

  it('returns undefined for empty or non-array input', () => {
    expect(parseKeyframes(undefined)).toBeUndefined();
    expect(parseKeyframes([])).toBeUndefined();
    expect(parseKeyframes('keyframes')).toBeUndefined();
    expect(parseKeyframes([{ property: 'bogus' }])).toBeUndefined();
  });

  it('defaults unknown easing to ease-in-out', () => {
    const parsed = parseKeyframes([
      { property: 'opacity', timeMs: 0, value: 1, easing: 'cubic-bezier' },
    ]);
    expect(parsed![0]!.easing).toBe('ease-in-out');
  });
});

describe('layerHasKeyframes', () => {
  it('is true only for a non-empty parsed array', () => {
    expect(layerHasKeyframes(undefined)).toBe(false);
    expect(layerHasKeyframes([])).toBe(false);
    expect(layerHasKeyframes([kf(0, 1)])).toBe(true);
  });
});

describe('samplePropertyTrack', () => {
  it('emits one sample per output frame at t = n/fps', () => {
    // 30fps × 1s → 30 samples; linear 0→1 over the full second.
    const samples = samplePropertyTrack(
      [kf(0, 0), kf(1000, 1)],
      'position',
      30,
      1000,
    );
    expect(samples).not.toBeNull();
    expect(samples!.length).toBe(30);
    expect(samples![0]).toBe(0);
    expect(samples![15]).toBeCloseTo(0.5, 2);
    // Last frame sits at t = 967ms — inside the segment, near the end.
    expect(samples![29]).toBeCloseTo(0.967, 2);
  });

  it('returns null when the track or timing is empty', () => {
    expect(samplePropertyTrack([kf(0, 1)], 'scale', 30, 1000)).toBeNull();
    expect(samplePropertyTrack([kf(0, 1, 'scale')], 'scale', 0, 1000)).toBeNull();
    expect(samplePropertyTrack([kf(0, 1, 'scale')], 'scale', 30, 0)).toBeNull();
  });
});

describe('samplesToStaircaseExpr', () => {
  it('collapses constant samples into a single literal', () => {
    expect(samplesToStaircaseExpr([0.5, 0.5, 0.5], 30)).toBe('0.5000');
  });

  it('emits a between() staircase for changing runs', () => {
    // Two runs: 0 for frames 0–29 (t<1s), then 1.
    const expr = samplesToStaircaseExpr(
      [...new Array(30).fill(0), ...new Array(30).fill(1)],
      30,
    );
    expect(expr).toBe('if(between(t,0.0000,1.0000),0.0000,1.0000)');
  });

  it('nests runs so the tail value is the fallback', () => {
    const expr = samplesToStaircaseExpr([0, 0.5, 1], 1);
    // 1fps: three 1-second runs → innermost fallback is the last value.
    expect(expr).toBe(
      'if(between(t,0.0000,1.0000),0.0000,' +
      'if(between(t,1.0000,2.0000),0.5000,1.0000))',
    );
  });
});
