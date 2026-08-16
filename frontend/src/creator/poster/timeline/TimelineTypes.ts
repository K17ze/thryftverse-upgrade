// ───────────────────────────────────────────────────────────────────────────
// Poster Timeline Types — genuine video timeline model for the Poster
// composer (spec: Poster timeline foundation).
//
// The legacy Poster composer used "frames" (pages) instead of a real video
// timeline. This module introduces a true timeline editor model: clips with
// trim ranges, speed, volume, and timed overlay layers, plus the operation
// vocabulary used to mutate the timeline state.
// ───────────────────────────────────────────────────────────────────────────

export interface TimeRange {
  startMs: number;
  endMs: number;
}

export interface PosterClip {
  id: string;
  assetId: string;
  sourceUri: string;
  trimStartMs: number;
  trimEndMs: number;
  speed: number; // 0.25 to 4.0
  volume: number; // 0.0 to 1.0
  thumbnailUri?: string;
  /** Computed: (trimEnd - trimStart) adjusted for speed. */
  durationMs: number;
}

export interface OverlayLayer {
  id: string;
  type: 'text' | 'sticker' | 'product' | 'music' | 'drawing';
  timeRange: TimeRange;
  label: string;
  color?: string;
}

export interface TimelineState {
  clips: PosterClip[];
  overlays: OverlayLayer[];
  playheadMs: number;
  totalDurationMs: number;
  isPlaying: boolean;
}

export type TimelineOperation =
  | { type: 'trim'; clipId: string; edge: 'start' | 'end'; deltaMs: number }
  | { type: 'split'; clipId: string; atMs: number }
  | { type: 'delete'; clipId: string }
  | { type: 'duplicate'; clipId: string }
  | { type: 'reorder'; fromIndex: number; toIndex: number }
  | { type: 'replace'; clipId: string; newAssetId: string; newUri: string }
  | { type: 'speed'; clipId: string; speed: number }
  | { type: 'volume'; clipId: string; volume: number }
  | { type: 'moveOverlay'; overlayId: string; timeRange: TimeRange }
  | { type: 'seek'; ms: number }
  | { type: 'play' }
  | { type: 'pause' };

/**
 * Sum of all clip durations (already speed-adjusted). This is the timeline
 * wall-clock length — the value the playhead scrubs against.
 */
export function computeTotalDuration(clips: PosterClip[]): number {
  return clips.reduce((sum, c) => sum + c.durationMs, 0);
}

/**
 * Formats a millisecond offset as `m:ss.t` (tenths). Used for timecode
 * readouts in the timeline toolbar and playhead label.
 */
export function formatTimecode(ms: number): string {
  const totalSeconds = ms / 1000;
  const seconds = Math.floor(totalSeconds);
  const tenths = Math.floor((totalSeconds - seconds) * 10);
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${String(secs).padStart(2, '0')}.${tenths}`;
}
