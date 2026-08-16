// ───────────────────────────────────────────────────────────────────────────
// Poster Timeline Types — genuine video timeline model for the Poster
// composer (spec: Poster timeline foundation).
//
// The legacy Poster composer used "frames" (pages) instead of a real video
// timeline. This module introduces a true timeline editor model: clips with
// trim ranges, speed, volume, and timed overlay layers, plus the operation
// vocabulary used to mutate the timeline state.
//
// Per the Zero-Gap audit (09_POSTER_TIMELINE_CAMERA_AUDIO §1), the timeline
// must be derived from canonical sequence data (PosterSequence), not from
// pages/layers with inconsistent timing semantics.
// ───────────────────────────────────────────────────────────────────────────

import type { CreatorDocument, CreatorLayer } from '../../composition';
import type { SpeedCurve } from '../speedcurves/SpeedCurveTypes';
import type { AudioConfig } from '../../tools/audio/AudioTypes';
import type { FrameTransition } from '../transitions/TransitionTypes';

export interface TimeRange {
  startMs: number;
  endMs: number;
}

/**
 * A single control point on a timeline-native speed curve. Unlike the
 * richer {@link SpeedCurve} model (which uses normalized 0..1 positions),
 * a {@link SpeedCurvePoint} anchors speed to an absolute source-media time
 * in milliseconds. This is the canonical representation used by the
 * timeline operations and the {@link SpeedCurveEvaluator}.
 */
export interface SpeedCurvePoint {
  /** Source-media time in milliseconds. */
  timeMs: number;
  /** Playback speed multiplier at this point (0.25 to 4.0). */
  speed: number;
}

/**
 * The set of transition styles supported by the timeline operations and the
 * {@link TransitionEvaluator}. This is the timeline-native subset; the
 * broader {@link ../transitions/TransitionTypes.TransitionType} includes
 * additional preset styles (zoom, flash, spin) used by the frame-preset rail.
 */
export type TransitionType = 'cut' | 'fade' | 'dissolve' | 'slide' | 'wipe';

/**
 * A transition between two clips on the timeline. Stored on the timeline
 * state and evaluated by the {@link TransitionEvaluator} during playback
 * and export.
 */
export interface Transition {
  id: string;
  fromClipId: string;
  toClipId: string;
  type: TransitionType;
  durationMs: number;
}

/**
 * A crop rectangle applied to a clip's source media. Coordinates are
 * normalized (0..1) relative to the source frame dimensions, matching the
 * Skia draw-rect contract used by the render pipeline.
 */
export interface ClipCropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PosterClip {
  id: string;
  assetId: string;
  sourceUri: string;
  /** Media kind — used by replaceClipAsset and the render pipeline. */
  mediaType?: 'image' | 'video';
  trimStartMs: number;
  trimEndMs: number;
  speed: number; // 0.25 to 4.0
  volume: number; // 0.0 to 1.0
  thumbnailUri?: string;
  /** Computed: (trimEnd - trimStart) adjusted for speed. */
  durationMs: number;
  /**
   * Variable speed curve anchored to source-media time. When present, the
   * renderer samples the curve via the {@link SpeedCurveEvaluator} to
   * compute instantaneous speed at each timeline position. The `speed`
   * field holds the average speed for duration display.
   */
  speedCurve?: SpeedCurvePoint[];
  /** Crop rectangle (normalized 0..1) applied to the source frame. */
  cropRect?: ClipCropRect;
  /** Rotation in degrees — one of 0, 90, 180, 270. */
  rotation?: number;
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
  /** Transitions between adjacent clips. Evaluated by TransitionEvaluator. */
  transitions?: Transition[];
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

// ── Canonical sequence schema (Zero-Gap audit §1) ───────────────────
// The PosterSequence is the authoritative temporal schema that replaces
// page-based derivation. It is migrated once from a page-based document
// and then serves as the single source of truth for the timeline editor,
// playback clock, and export pipeline.

/**
 * A reference to a clip in the canonical sequence. Unlike PosterClip
 * (which stores computed durationMs), PosterClipRef stores only the
 * source parameters — the duration is derived from trim + speed.
 */
export interface PosterClipRef {
  id: string;
  assetId: string;
  sourceUri: string;
  trimStartMs: number;
  trimEndMs: number;
  speed: number;
  volume: number;
  /** Variable speed curve (optional — absent for constant-speed clips). */
  speedCurve?: SpeedCurve;
  /** Reverse playback. */
  reversed?: boolean;
  /** Freeze frame timestamp (ms from clip start). */
  freezeFrameMs?: number;
  /** Freeze frame duration (ms). */
  freezeDurationMs?: number;
  /** Thumbnail URI for timeline strip display. */
  thumbnailUri?: string;
}

/**
 * A reference to an audio track in the canonical sequence.
 */
export interface AudioTrackRef {
  id: string;
  trackId: string | null;
  volume: number;
  startOffsetMs: number;
  originalVolume: number;
  fadeInMs: number;
  fadeOutMs: number;
}

/**
 * A reference to a transition between two clips in the canonical sequence.
 */
export interface TransitionRef {
  fromClipId: string;
  toClipId: string;
  presetId: string;
  durationMs: number;
}

/**
 * The canonical temporal schema for a Poster composition.
 *
 * Per the Zero-Gap audit, this replaces page-based derivation as the
 * authoritative timeline data. The timeline editor, playback clock, and
 * export pipeline all read from this sequence.
 */
export interface PosterSequence {
  clips: PosterClipRef[];
  audioTracks: AudioTrackRef[];
  transitions: TransitionRef[];
}

// ── Migration from page-based document ──────────────────────────────

/**
 * Migrate a page-based CreatorDocument into a canonical PosterSequence.
 *
 * This is a one-time migration performed when a legacy document is opened
 * in the timeline editor. Each page's media layer becomes a clip; non-media
 * layers become overlays (stored separately in the timeline state, not in
 * the sequence). Transitions between pages become TransitionRefs.
 *
 * Per the Zero-Gap audit §2, this fixes the correctness issues with the
 * legacy derivation:
 *   - Clip duration = (trimEnd - trimStart) / speed, NOT page duration
 *   - Speed curves use averageSpeed() for duration
 *   - All layers are processed (no break-after-video-layer)
 */
export function migrateDocumentToSequence(document: CreatorDocument): PosterSequence {
  const clips: PosterClipRef[] = [];
  const transitions: TransitionRef[] = [];

  for (let pageIdx = 0; pageIdx < document.pages.length; pageIdx++) {
    const page = document.pages[pageIdx];

    // Find the media layer (first visible media layer in the page)
    const mediaLayer = page.layers.find(
      (l): l is Extract<CreatorLayer, { type: 'media' }> =>
        l.type === 'media' && !l.hidden,
    );

    if (mediaLayer) {
      const payload = mediaLayer.payload;
      const trimStartMs = payload.trimStartMs ?? 0;
      const trimEndMs = payload.trimEndMs ?? (payload.videoDurationMs ?? 5000);

      clips.push({
        id: mediaLayer.id,
        assetId: mediaLayer.id,
        sourceUri: payload.mediaUri,
        trimStartMs,
        trimEndMs,
        speed: payload.speed ?? 1,
        volume: payload.volume ?? 1,
        speedCurve: payload.speedCurve as SpeedCurve | undefined,
        reversed: payload.reversed,
        freezeFrameMs: payload.freezeFrameMs,
        freezeDurationMs: payload.freezeDurationMs,
        thumbnailUri: payload.thumbnailUri,
      });
    }

    // Transition from this page to the next
    if (pageIdx < document.pages.length - 1 && page.transitionId) {
      const nextMediaLayer = document.pages[pageIdx + 1].layers.find(
        (l): l is Extract<CreatorLayer, { type: 'media' }> =>
          l.type === 'media' && !l.hidden,
      );
      if (mediaLayer && nextMediaLayer) {
        transitions.push({
          fromClipId: mediaLayer.id,
          toClipId: nextMediaLayer.id,
          presetId: page.transitionId,
          durationMs: 300, // Default transition duration
        });
      }
    }
  }

  // Audio tracks: extract from music layers across all pages
  const audioTracks: AudioTrackRef[] = [];
  for (const page of document.pages) {
    for (const layer of page.layers) {
      if (layer.type === 'music' && !layer.hidden) {
        const musicPayload = layer.payload;
        audioTracks.push({
          id: layer.id,
          trackId: musicPayload.trackId ?? null,
          volume: musicPayload.volume ?? 1,
          startOffsetMs: musicPayload.startOffsetMs ?? 0,
          originalVolume: 1,
          fadeInMs: musicPayload.fadeInMs ?? 0,
          fadeOutMs: musicPayload.fadeOutMs ?? 0,
        });
      }
    }
  }

  return {
    clips,
    audioTracks,
    transitions,
  };
}
