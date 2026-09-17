import { describe, it, expect } from 'vitest';
import { slipClip } from '../timeline/TimelineOperations';
import type { PosterClip } from '../timeline/TimelineTypes';

function makeClip(overrides: Partial<PosterClip> = {}): PosterClip {
  return {
    id: 'clip-1',
    assetId: 'asset-1',
    sourceUri: 'file:///video.mp4',
    mediaType: 'video',
    trimStartMs: 1000,
    trimEndMs: 3000,
    sourceDurationMs: 10000,
    speed: 1,
    volume: 1,
    durationMs: 2000,
    ...overrides,
  };
}

describe('slipClip', () => {
  it('shifts the source window by deltaMs while preserving duration', () => {
    const clips = [makeClip()];
    const next = slipClip(clips, 'clip-1', 500);
    expect(next[0].trimStartMs).toBe(1500);
    expect(next[0].trimEndMs).toBe(3500);
    expect(next[0].durationMs).toBe(2000);
    expect(clips[0].trimStartMs).toBe(1000); // input untouched
  });

  it('clamps the window at the source start', () => {
    const next = slipClip([makeClip()], 'clip-1', -5000);
    expect(next[0].trimStartMs).toBe(0);
    expect(next[0].trimEndMs).toBe(2000);
  });

  it('clamps the window at the source duration', () => {
    const next = slipClip([makeClip()], 'clip-1', 90000);
    expect(next[0].trimStartMs).toBe(8000);
    expect(next[0].trimEndMs).toBe(10000);
  });

  it('returns the same array when the window cannot move', () => {
    const clips = [makeClip({ trimStartMs: 0, trimEndMs: 10000 })];
    expect(slipClip(clips, 'clip-1', 500)).toBe(clips);
    expect(slipClip(clips, 'clip-1', -500)).toBe(clips);
  });

  it('returns the same array for an unknown clip', () => {
    const clips = [makeClip()];
    expect(slipClip(clips, 'missing', 500)).toBe(clips);
  });

  it('blocks forward slip when source duration is unknown', () => {
    // No sourceDurationMs → upper bound is the current trim end.
    const clips = [makeClip({ sourceDurationMs: undefined })];
    const next = slipClip(clips, 'clip-1', 500);
    expect(next).toBe(clips);
    // Backward slip is still allowed.
    const back = slipClip(clips, 'clip-1', -400);
    expect(back[0].trimStartMs).toBe(600);
    expect(back[0].trimEndMs).toBe(2600);
  });

  it('keeps wall-clock duration invariant under non-1x speed', () => {
    const clips = [makeClip({ speed: 2, durationMs: 1000 })];
    const next = slipClip(clips, 'clip-1', 500);
    // 2000ms source window at 2x = 1000ms wall-clock, unchanged by slip.
    expect(next[0].durationMs).toBe(1000);
    expect(next[0].trimEndMs - next[0].trimStartMs).toBe(2000);
  });
});
