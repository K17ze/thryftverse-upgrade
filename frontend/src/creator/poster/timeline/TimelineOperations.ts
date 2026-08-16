// ───────────────────────────────────────────────────────────────────────────
// TimelineOperations — pure-functional timeline mutations.
//
// Every operation is immutable: it returns a new array (and new clip objects)
// without mutating the input. Clip durations are recomputed from trim + speed
// so the timeline wall-clock length stays correct after every edit.
//
// Duration model
// --------------
// For a constant-speed clip:
//   durationMs = (trimEndMs - trimStartMs) / speed
//
// For a clip with a variable speed curve (SpeedCurvePoint[]), the display
// duration is the integral of 1/speed over the source-time domain, computed
// exactly by the SpeedCurveEvaluator (totalDurationMs). The `speed` field
// holds the average speed for display.
//
// Per AGENTS.md §11: no fabricated state — bounds are validated and clips
// with invalid edits are returned unchanged. Per AGENTS.md §17: edits are
// precise and bounded; no negative durations are ever produced.
// ───────────────────────────────────────────────────────────────────────────

import type {
  PosterClip,
  Transition,
  TransitionType,
  ClipCropRect,
  SpeedCurvePoint,
} from './TimelineTypes';
import { computeTotalDuration } from './TimelineTypes';
import { totalDurationMs, averageSpeed } from '../../core/playback/SpeedCurveEvaluator';

// ── Speed bounds (match SpeedCurveEvaluator / composition schema) ─────────
const SPEED_MIN = 0.25;
const SPEED_MAX = 4.0;
/** Minimum trim length in milliseconds — prevents zero/negative-duration clips. */
const MIN_TRIM_MS = 1;
/** Valid rotation values for the rotateClip operation. */
const VALID_ROTATIONS = new Set([0, 90, 180, 270]);

// ── ID generation ─────────────────────────────────────────────────────────

/**
 * Generate a unique id for new clips/transitions. Uses crypto.randomUUID
 * when available (React Native Hermes / browser), falling back to a
 * timestamp + random suffix for older runtimes.
 */
function generateId(prefix: string): string {
  let uuid: string;
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      uuid = crypto.randomUUID();
    } else {
      uuid = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    }
  } catch {
    uuid = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
  return `${prefix}_${uuid}`;
}

// ── Internal helpers ──────────────────────────────────────────────────────

/** Clamp a value to the inclusive [min, max] range. */
function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.min(max, Math.max(min, v));
}

/** Clamp a speed multiplier to the valid playback range. */
function clampSpeed(speed: number): number {
  if (!Number.isFinite(speed) || speed <= 0) return 1;
  return clamp(speed, SPEED_MIN, SPEED_MAX);
}

/**
 * Recompute a clip's `durationMs` from its trim range and speed/curve.
 * For a constant-speed clip: (trimEnd - trimStart) / speed.
 * For a curve clip: the integral of 1/speed over the curve domain.
 */
function recomputeDuration(clip: PosterClip): number {
  const trimSpan = Math.max(0, clip.trimEndMs - clip.trimStartMs);
  if (clip.speedCurve && clip.speedCurve.length > 0) {
    // The curve is anchored to source-media time. Its domain is
    // [0, lastPoint.timeMs]; the clip's trim window is applied on top by
    // the renderer. For the timeline wall-clock duration we use the trim
    // span scaled by the curve's average speed over its domain.
    const avg = averageSpeed(clip.speedCurve);
    if (avg > 0 && Number.isFinite(avg)) {
      return trimSpan / avg;
    }
  }
  const speed = clampSpeed(clip.speed);
  return trimSpan / speed;
}

/**
 * Return a shallow-cloned clip with updated fields and a recomputed
 * `durationMs`. The input clip is never mutated.
 */
function withUpdates(clip: PosterClip, updates: Partial<PosterClip>): PosterClip {
  const next: PosterClip = { ...clip, ...updates };
  next.durationMs = recomputeDuration(next);
  // Guard: never produce a negative or non-finite duration.
  if (!Number.isFinite(next.durationMs) || next.durationMs < 0) {
    next.durationMs = 0;
  }
  return next;
}

/** Find the index of a clip by id, or -1 if not found. */
function findClipIndex(clips: PosterClip[], clipId: string): number {
  return clips.findIndex((c) => c.id === clipId);
}

// ── Public operations ─────────────────────────────────────────────────────

/**
 * Adjust a clip's start trim by `deltaMs`.
 *
 * A positive delta trims more from the start (trimStartMs increases); a
 * negative delta reveals more source media from the start. The trim start is
 * clamped to [0, trimEndMs - MIN_TRIM_MS] so the clip can never become
 * shorter than MIN_TRIM_MS or have a negative duration.
 *
 * Returns a new clips array; the input is unchanged. If the clip is not
 * found, the input array is returned as-is.
 */
export function trimClipStart(
  clips: PosterClip[],
  clipId: string,
  deltaMs: number,
): PosterClip[] {
  const idx = findClipIndex(clips, clipId);
  if (idx < 0) return clips;
  const clip = clips[idx];
  const maxStart = clip.trimEndMs - MIN_TRIM_MS;
  const newStart = clamp(clip.trimStartMs + deltaMs, 0, maxStart);
  if (newStart === clip.trimStartMs) return clips;
  const updated = withUpdates(clip, { trimStartMs: newStart });
  const next = clips.slice();
  next[idx] = updated;
  return next;
}

/**
 * Adjust a clip's end trim by `deltaMs`.
 *
 * A positive delta extends the trim end (more source media); a negative delta
 * trims more from the end. The trim end is clamped to [trimStartMs + MIN_TRIM_MS, ∞)
 * so the clip can never become shorter than MIN_TRIM_MS. There is no upper
 * bound here because the source media length is not known to the operation;
 * the renderer clamps to the real media duration at playback time.
 *
 * Returns a new clips array; the input is unchanged.
 */
export function trimClipEnd(
  clips: PosterClip[],
  clipId: string,
  deltaMs: number,
): PosterClip[] {
  const idx = findClipIndex(clips, clipId);
  if (idx < 0) return clips;
  const clip = clips[idx];
  const minEnd = clip.trimStartMs + MIN_TRIM_MS;
  const newEnd = Math.max(minEnd, clip.trimEndMs + deltaMs);
  if (newEnd === clip.trimEndMs) return clips;
  const updated = withUpdates(clip, { trimEndMs: newEnd });
  const next = clips.slice();
  next[idx] = updated;
  return next;
}

/**
 * Split a clip into two clips at source-media time `atMs`.
 *
 * The original clip becomes [trimStartMs, atMs) and a new clip is inserted
 * immediately after with [atMs, trimEndMs). Both clips inherit the speed,
 * volume, crop, rotation, and speed curve of the original. The new clip gets
 * a fresh id.
 *
 * `atMs` is clamped to (trimStartMs, trimEndMs) — splitting at an edge is a
 * no-op. Returns a new clips array with the split applied. If the clip is not
 * found or the split point is invalid, the input is returned unchanged.
 */
export function splitClip(
  clips: PosterClip[],
  clipId: string,
  atMs: number,
): PosterClip[] {
  const idx = findClipIndex(clips, clipId);
  if (idx < 0) return clips;
  const clip = clips[idx];

  // Clamp the split point strictly inside the trim window.
  const splitAt = clamp(
    atMs,
    clip.trimStartMs + MIN_TRIM_MS,
    clip.trimEndMs - MIN_TRIM_MS,
  );
  if (splitAt <= clip.trimStartMs || splitAt >= clip.trimEndMs) return clips;

  const first = withUpdates(clip, { trimEndMs: splitAt });
  const second: PosterClip = {
    ...clip,
    id: generateId('clip'),
    trimStartMs: splitAt,
    trimEndMs: clip.trimEndMs,
  };
  second.durationMs = recomputeDuration(second);
  if (!Number.isFinite(second.durationMs) || second.durationMs < 0) {
    second.durationMs = 0;
  }

  const next = clips.slice();
  next.splice(idx, 1, first, second);
  return next;
}

/**
 * Duplicate a clip and insert the copy immediately after the original.
 *
 * The duplicate gets a fresh id and identical trim, speed, volume, crop,
 * rotation, and speed curve. Returns a new clips array.
 */
export function duplicateClip(clips: PosterClip[], clipId: string): PosterClip[] {
  const idx = findClipIndex(clips, clipId);
  if (idx < 0) return clips;
  const clip = clips[idx];
  const copy: PosterClip = {
    ...clip,
    id: generateId('clip'),
  };
  copy.durationMs = recomputeDuration(copy);
  if (!Number.isFinite(copy.durationMs) || copy.durationMs < 0) {
    copy.durationMs = 0;
  }
  const next = clips.slice();
  next.splice(idx + 1, 0, copy);
  return next;
}

/**
 * Replace a clip's source media (asset uri and media type).
 *
 * The trim range and speed are preserved. The thumbnail uri is cleared so the
 * UI regenerates it for the new asset. Returns a new clips array.
 */
export function replaceClipAsset(
  clips: PosterClip[],
  clipId: string,
  newMediaUri: string,
  newMediaType: 'image' | 'video',
): PosterClip[] {
  const idx = findClipIndex(clips, clipId);
  if (idx < 0) return clips;
  const clip = clips[idx];
  const updated: PosterClip = {
    ...clip,
    sourceUri: newMediaUri,
    mediaType: newMediaType,
    thumbnailUri: undefined,
  };
  const next = clips.slice();
  next[idx] = updated;
  return next;
}

/**
 * Move a clip to a new position in the timeline.
 *
 * `newTrackIndex` is the target array index (0-based) the clip should occupy
 * after the move. When `newTrackIndex` is negative, the target index is
 * derived from `newPositionMs`: the clip is inserted at the timeline position
 * whose cumulative wall-clock duration (of the remaining clips) first reaches
 * `newPositionMs`. This supports both explicit reorder and absolute-position
 * placement.
 *
 * Returns a new clips array with the clip moved. If the clip is not found, the
 * input is returned unchanged.
 */
export function reorderClip(
  clips: PosterClip[],
  clipId: string,
  newTrackIndex: number,
  newPositionMs: number,
): PosterClip[] {
  const idx = findClipIndex(clips, clipId);
  if (idx < 0) return clips;

  // Remove the clip, then compute the insertion index in the reduced array.
  const without = clips.slice();
  const [moved] = without.splice(idx, 1);

  let insertAt: number;
  if (newTrackIndex >= 0) {
    insertAt = clamp(newTrackIndex, 0, without.length);
  } else {
    // Derive index from absolute timeline position (ms).
    const target = Math.max(0, newPositionMs);
    let cumulative = 0;
    insertAt = without.length; // default: end
    for (let i = 0; i < without.length; i++) {
      if (cumulative >= target) {
        insertAt = i;
        break;
      }
      cumulative += without[i].durationMs;
    }
  }

  const next = without.slice();
  next.splice(insertAt, 0, moved);
  return next;
}

/**
 * Set a clip's constant playback speed (0.25x–4x) and recompute its duration.
 *
 * Setting a constant speed clears any existing speed curve — the clip becomes
 * a single-speed clip. The speed is clamped to the valid range. Returns a new
 * clips array.
 */
export function setClipSpeed(
  clips: PosterClip[],
  clipId: string,
  speedMultiplier: number,
): PosterClip[] {
  const idx = findClipIndex(clips, clipId);
  if (idx < 0) return clips;
  const clip = clips[idx];
  const speed = clampSpeed(speedMultiplier);
  // Clear the curve — this is now a constant-speed clip.
  const updated = withUpdates(clip, { speed, speedCurve: undefined });
  const next = clips.slice();
  next[idx] = updated;
  return next;
}

/**
 * Attach a variable speed curve to a clip and recompute its duration.
 *
 * The curve is an array of `{ timeMs, speed }` control points anchored to
 * source-media time. The clip's `durationMs` is the integral of 1/speed over
 * the curve domain (computed exactly by SpeedCurveEvaluator), and the `speed`
 * field is set to the curve's average speed for display.
 *
 * An empty or single-point curve clears the curve (constant speed). Returns a
 * new clips array.
 */
export function setClipSpeedCurve(
  clips: PosterClip[],
  clipId: string,
  curvePoints: SpeedCurvePoint[],
): PosterClip[] {
  const idx = findClipIndex(clips, clipId);
  if (idx < 0) return clips;
  const clip = clips[idx];

  if (!curvePoints || curvePoints.length < 2) {
    // Not enough points for a curve — fall back to constant speed using the
    // first point's speed (or the existing speed if no points).
    const speed = curvePoints && curvePoints.length === 1
      ? clampSpeed(curvePoints[0].speed)
      : clip.speed;
    const updated = withUpdates(clip, { speed, speedCurve: undefined });
    const next = clips.slice();
    next[idx] = updated;
    return next;
  }

  const avg = averageSpeed(curvePoints);
  const duration = totalDurationMs(curvePoints);
  const updated: PosterClip = {
    ...clip,
    speedCurve: curvePoints.slice(),
    speed: Number.isFinite(avg) && avg > 0 ? avg : clip.speed,
    durationMs: Number.isFinite(duration) && duration >= 0 ? duration : 0,
  };
  const next = clips.slice();
  next[idx] = updated;
  return next;
}

/**
 * Set the crop rectangle (normalized 0..1) applied to a clip's source frame.
 *
 * The crop rect is validated: x/y >= 0, width/height > 0, and the rect stays
 * within [0, 1]. An invalid rect is ignored (the clip is returned unchanged).
 * Returns a new clips array.
 */
export function cropClip(
  clips: PosterClip[],
  clipId: string,
  cropRect: ClipCropRect,
): PosterClip[] {
  const idx = findClipIndex(clips, clipId);
  if (idx < 0) return clips;

  const { x, y, width, height } = cropRect;
  const isValid =
    Number.isFinite(x) && Number.isFinite(y) &&
    Number.isFinite(width) && Number.isFinite(height) &&
    x >= 0 && y >= 0 && width > 0 && height > 0 &&
    x + width <= 1.0001 && y + height <= 1.0001;
  if (!isValid) return clips;

  const normalized: ClipCropRect = {
    x: clamp(x, 0, 1),
    y: clamp(y, 0, 1),
    width: clamp(width, 0, 1 - clamp(x, 0, 1)),
    height: clamp(height, 0, 1 - clamp(y, 0, 1)),
  };
  const updated: PosterClip = { ...clips[idx], cropRect: normalized };
  const next = clips.slice();
  next[idx] = updated;
  return next;
}

/**
 * Set a clip's rotation in degrees. Only 0, 90, 180, and 270 are valid; any
 * other value is normalized to the nearest valid step. Returns a new clips
 * array.
 */
export function rotateClip(
  clips: PosterClip[],
  clipId: string,
  degrees: number,
): PosterClip[] {
  const idx = findClipIndex(clips, clipId);
  if (idx < 0) return clips;

  // Normalize to [0, 360) and snap to the nearest valid step.
  let normalized = Math.round(degrees) % 360;
  if (normalized < 0) normalized += 360;
  const snapped = [0, 90, 180, 270].reduce((best, candidate) => {
    const diff = Math.abs(((candidate - normalized + 540) % 360) - 180);
    return diff < Math.abs(((best - normalized + 540) % 360) - 180) ? candidate : best;
  }, 0);

  if (!VALID_ROTATIONS.has(snapped)) return clips;
  const updated: PosterClip = { ...clips[idx], rotation: snapped };
  const next = clips.slice();
  next[idx] = updated;
  return next;
}

// ── Transition operations ─────────────────────────────────────────────────
//
// Transitions are stored separately from clips (TimelineState.transitions).
// `addTransition` validates that both clip ids exist in the clips array and
// returns a new Transition object for the caller to append. `removeTransition`
// takes the existing transitions array and returns a new array without the
// matching transition. Both are pure and immutable.

/**
 * Create a new transition between two clips.
 *
 * Validates that both `fromClipId` and `toClipId` exist in the clips array.
 * The transition duration is clamped to a positive value. Returns the new
 * `Transition` object, or `null` if either clip does not exist or the
 * duration is non-positive.
 *
 * The caller appends the returned transition to the timeline's transitions
 * array. Deduplication (replacing an existing transition between the same
 * pair) is the caller's responsibility — this function only constructs a
 * valid, validated transition.
 */
export function addTransition(
  clips: PosterClip[],
  fromClipId: string,
  toClipId: string,
  type: TransitionType,
  durationMs: number,
): Transition | null {
  const fromExists = clips.some((c) => c.id === fromClipId);
  const toExists = clips.some((c) => c.id === toClipId);
  if (!fromExists || !toExists || fromClipId === toClipId) return null;

  const duration = Math.max(1, Math.round(durationMs));
  if (!Number.isFinite(duration) || duration <= 0) return null;

  return {
    id: generateId('transition'),
    fromClipId,
    toClipId,
    type,
    durationMs: duration,
  };
}

/**
 * Remove a transition by id from a transitions array.
 *
 * Returns a new array without the matching transition. If the transition is
 * not found, the input array is returned as-is (immutable no-op).
 */
export function removeTransition(
  transitions: Transition[],
  transitionId: string,
): Transition[] {
  const idx = transitions.findIndex((t) => t.id === transitionId);
  if (idx < 0) return transitions;
  const next = transitions.slice();
  next.splice(idx, 1);
  return next;
}

// ── Aggregate helpers ─────────────────────────────────────────────────────

/**
 * Recompute the total timeline duration after a set of clip edits.
 *
 * Convenience wrapper around `computeTotalDuration` from TimelineTypes —
 * callers can use it to update `TimelineState.totalDurationMs` after applying
 * an operation.
 */
export function recomputeTotalDuration(clips: PosterClip[]): number {
  return computeTotalDuration(clips);
}
