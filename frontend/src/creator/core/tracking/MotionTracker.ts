/**
 * MotionTracker — pure-JS motion tracking foundation for sticker pin/tracking.
 *
 * This module implements a basic normalized-cross-correlation (NCC) point
 * tracker. Given two grayscale frames and a point in the first frame, it
 * estimates where the same physical point appears in the second frame by
 * searching a small window around the original location and finding the
 * position with the highest NCC score.
 *
 * ── Algorithm ──
 *
 * 1. Extract a 15×15 pixel **template** patch centered on `anchorPoint` in
 *    `fromFrame`.
 * 2. For every candidate offset (dx, dy) within a configurable search
 *    radius, extract a 15×15 patch from `toFrame` at
 *    (anchorPoint.x + dx, anchorPoint.y + dy).
 * 3. Compute the normalized cross-correlation between the template and each
 *    candidate patch. NCC is invariant to brightness and contrast changes,
 *    making it robust to exposure shifts between frames.
 * 4. Return the offset with the highest NCC score. The confidence is the
 *    NCC value itself (0..1), where 1 is a perfect match.
 *
 * ── Limitations (truthful) ──
 *
 * This is a **basic correlation-based tracker**, not an ML-based tracker.
 * It has known limitations:
 *
 *   - **No occlusion handling.** If the tracked point becomes occluded
 *     (hidden) in `toFrame`, the tracker will drift to whatever looks most
 *     similar, with low confidence.
 *   - **No rotation/scale invariance.** The template patch is matched
 *     verbatim — if the object rotates or changes scale between frames,
 *     the NCC score drops and tracking fails.
 *   - **No sub-pixel refinement.** The result is snapped to the nearest
 *     pixel. Sub-pixel interpolation (parabolic peak fit) would improve
 *     precision but is not implemented here.
 *   - **Performance.** This is a pure-JavaScript implementation. For a
 *     15×15 window with a search radius of 7, each `trackPoint` call
 *     evaluates 225 candidate patches, each requiring 225 pixel reads —
 *     ~50k operations per point per frame. This is acceptable for offline
 *     tracking (e.g. analyzing a short clip after capture) but **not
 *     real-time** on most devices. For real-time tracking, a native ML
 *     module (e.g. Lucas-Kanade optical flow via Vision framework) should
 *     be wired in via a TurboModule.
 *   - **Edge handling.** Patches near frame borders are clamped to the
 *     frame boundary, which can reduce accuracy for points near edges.
 *
 * ── Usage ──
 *
 * This module provides the tracking algorithm and API. It accepts raw
 * grayscale frame data (Uint8Array of intensity values, row-major). Frame
 * data can be sourced from:
 *   - A native frame-processor module (when available)
 *   - A Skia image snapshot (readPixels)
 *   - A decoded video frame (offline, post-capture)
 *
 * The {@link StickerPinTracker} can optionally use this module for
 * motion-based tracking: instead of relying solely on keyframe transforms,
 * it can call `trackSequence` with actual frame data to follow a point
 * through real camera motion.
 *
 * Per spec 07_MEDIA_TOOLCHAIN and AGENTS.md §11 (truthful UI): this is a
 * real, working algorithm — not a stub. The limitations are documented
 * above and in the function-level JSDoc.
 */

// ── Types ─────────────────────────────────────────────────────────────

/**
 * A grayscale frame — a row-major Uint8Array of pixel intensity values
 * (0..255), plus its width and height in pixels. The array length must
 * equal `width * height`.
 */
export interface GrayFrame {
  /** Pixel intensity values, 0..255, row-major (y * width + x). */
  data: Uint8Array;
  width: number;
  height: number;
}

/** A 2D point in pixel coordinates. */
export interface Point {
  x: number;
  y: number;
}

/** The result of tracking a single point between two frames. */
export interface TrackedPoint {
  /** Estimated position of the point in `toFrame` (pixel coords). */
  x: number;
  y: number;
  /**
   * Confidence score 0..1 — the normalized cross-correlation value at the
   * best match position. Values above ~0.7 indicate a strong match; below
   * ~0.4 the track is unreliable and the caller should treat it as lost.
   */
  confidence: number;
}

// ── Constants ─────────────────────────────────────────────────────────

/** Half-size of the template/candidate patch. Full patch = 15×15. */
const PATCH_HALF = 7;
/** Full patch dimension (PATCH_HALF * 2 + 1). */
const PATCH_SIZE = PATCH_HALF * 2 + 1; // 15
/** Number of pixels in a patch. */
const PATCH_AREA = PATCH_SIZE * PATCH_SIZE; // 225

/**
 * Default search radius (pixels). The tracker searches a square region
 * from -SEARCH_RADIUS to +SEARCH_RADIUS in both x and y. With radius 7,
 * the search grid is 15×15 = 225 candidate positions.
 */
export const DEFAULT_SEARCH_RADIUS = 7;

// ── Helpers ───────────────────────────────────────────────────────────

/**
 * Clamp an integer to the range [min, max].
 */
function clampI(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * Safely read a pixel from a grayscale frame, clamping coordinates to the
 * frame boundary. This handles edge patches by replicating border pixels.
 */
function samplePixel(frame: GrayFrame, x: number, y: number): number {
  const cx = clampI(Math.round(x), 0, frame.width - 1);
  const cy = clampI(Math.round(y), 0, frame.height - 1);
  return frame.data[cy * frame.width + cx]!;
}

/**
 * Compute the mean (average) of an array of values.
 */
function mean(values: number[], count: number): number {
  let sum = 0;
  for (let i = 0; i < count; i++) {
    sum += values[i]!;
  }
  return sum / count;
}

// ── Core: Normalized Cross-Correlation ────────────────────────────────

/**
 * Compute the normalized cross-correlation (NCC) between a template patch
 * (from `fromFrame`) and a candidate patch (from `toFrame`) centered at
 * the given candidate position.
 *
 * NCC = Σ((t - t̄)(c - c̄)) / √(Σ(t - t̄)² · Σ(c - c̄)²)
 *
 * where t is the template, c is the candidate, and t̄ / c̄ are their means.
 * NCC ranges from -1 (anti-correlated) to +1 (perfect match). We clamp
 * the result to [0, 1] since negative correlations are not meaningful for
 * point tracking.
 *
 * If the candidate patch has zero variance (uniform color), NCC is
 * undefined; we return 0 (no match).
 *
 * @param fromFrame  The source frame containing the template.
 * @param toFrame    The target frame to search.
 * @param templateCx Template center x in `fromFrame` pixel coords.
 * @param templateCy Template center y in `fromFrame` pixel coords.
 * @param candCx     Candidate center x in `toFrame` pixel coords.
 * @param candCy     Candidate center y in `toFrame` pixel coords.
 * @returns NCC score clamped to [0, 1].
 */
function normalizedCrossCorrelation(
  fromFrame: GrayFrame,
  toFrame: GrayFrame,
  templateCx: number,
  templateCy: number,
  candCx: number,
  candCy: number,
): number {
  // Collect template and candidate pixel values, and compute their means.
  const tVals: number[] = new Array(PATCH_AREA);
  const cVals: number[] = new Array(PATCH_AREA);
  let idx = 0;
  for (let dy = -PATCH_HALF; dy <= PATCH_HALF; dy++) {
    for (let dx = -PATCH_HALF; dx <= PATCH_HALF; dx++) {
      tVals[idx] = samplePixel(fromFrame, templateCx + dx, templateCy + dy);
      cVals[idx] = samplePixel(toFrame, candCx + dx, candCy + dy);
      idx++;
    }
  }

  const tMean = mean(tVals, PATCH_AREA);
  const cMean = mean(cVals, PATCH_AREA);

  // Compute numerator (cross-covariance) and denominators (variances).
  let numerator = 0;
  let tVarSum = 0;
  let cVarSum = 0;
  for (let i = 0; i < PATCH_AREA; i++) {
    const tDiff = tVals[i]! - tMean;
    const cDiff = cVals[i]! - cMean;
    numerator += tDiff * cDiff;
    tVarSum += tDiff * tDiff;
    cVarSum += cDiff * cDiff;
  }

  const denominator = Math.sqrt(tVarSum * cVarSum);
  if (denominator === 0) return 0; // Zero-variance patch — no match

  const ncc = numerator / denominator;
  // Clamp to [0, 1] — negative NCC is not meaningful for point tracking.
  return Math.max(0, Math.min(1, ncc));
}

// ── Public API ────────────────────────────────────────────────────────

/**
 * Track a single point from `fromFrame` to `toFrame`.
 *
 * Given a point (`anchorPoint`) in `fromFrame` (pixel coordinates), this
 * function searches a square region around that position in `toFrame` and
 * returns the estimated new position with a confidence score.
 *
 * The search region is `[-searchRadius, +searchRadius]` in both x and y.
 * The candidate with the highest normalized cross-correlation is returned.
 *
 * @param fromFrame    The first frame (contains the anchor point).
 * @param toFrame      The second frame (search target).
 * @param anchorPoint  The point to track, in `fromFrame` pixel coords.
 * @param searchRadius Search radius in pixels (default 7 → 15×15 grid).
 * @returns The estimated position in `toFrame` and a confidence score.
 *         If the anchor point is outside `fromFrame` bounds, returns the
 *         original point with confidence 0.
 *
 * @example
 * ```ts
 * const result = trackPoint(frame1, frame2, { x: 200, y: 150 });
 * if (result.confidence > 0.7) {
 *   // High-confidence track — update sticker position
 *   sticker.x = result.x / frame2.width;
 *   sticker.y = result.y / frame2.height;
 * }
 * ```
 */
export function trackPoint(
  fromFrame: GrayFrame,
  toFrame: GrayFrame,
  anchorPoint: Point,
  searchRadius: number = DEFAULT_SEARCH_RADIUS,
): TrackedPoint {
  // Validate that the anchor point is within the source frame.
  if (
    anchorPoint.x < 0 ||
    anchorPoint.x >= fromFrame.width ||
    anchorPoint.y < 0 ||
    anchorPoint.y >= fromFrame.height
  ) {
    return { x: anchorPoint.x, y: anchorPoint.y, confidence: 0 };
  }

  let bestX = anchorPoint.x;
  let bestY = anchorPoint.y;
  let bestScore = -1;

  // Search the square region around the anchor point in `toFrame`.
  for (let dy = -searchRadius; dy <= searchRadius; dy++) {
    for (let dx = -searchRadius; dx <= searchRadius; dx++) {
      const candX = anchorPoint.x + dx;
      const candY = anchorPoint.y + dy;

      // Skip candidates that fall outside the target frame entirely.
      if (
        candX < 0 ||
        candX >= toFrame.width ||
        candY < 0 ||
        candY >= toFrame.height
      ) {
        continue;
      }

      const score = normalizedCrossCorrelation(
        fromFrame,
        toFrame,
        anchorPoint.x,
        anchorPoint.y,
        candX,
        candY,
      );

      if (score > bestScore) {
        bestScore = score;
        bestX = candX;
        bestY = candY;
      }
    }
  }

  return {
    x: bestX,
    y: bestY,
    confidence: Math.max(0, bestScore),
  };
}

/**
 * Track a point across a sequence of frames.
 *
 * Starting from `initialPoint` in `frames[0]`, this function tracks the
 * point through each subsequent frame using {@link trackPoint}. The result
 * is an array of tracked positions (one per frame) with confidence scores.
 *
 * The first entry is the initial point with confidence 1 (it is the
 * reference). Each subsequent entry is the tracked position in that frame.
 *
 * If tracking confidence drops below `minConfidence` at any frame, the
 * tracker stops updating the search center and subsequent frames use the
 * last high-confidence position as the anchor. This prevents drift
 * cascading after a lost track. The low-confidence positions are still
 * returned (with their actual confidence) so the caller can decide whether
 * to use or discard them.
 *
 * @param frames        The sequence of grayscale frames to track through.
 *                     Must have at least 1 frame.
 * @param initialPoint  The point to track, in `frames[0]` pixel coords.
 * @param searchRadius  Search radius in pixels (default 7).
 * @param minConfidence Minimum confidence to continue updating the anchor
 *                     (default 0.4). Below this, the tracker holds the
 *                     last confident position.
 * @returns Array of tracked positions, one per frame. Length === frames.length.
 *
 * @example
 * ```ts
 * const positions = trackSequence(frames, { x: 200, y: 150 });
 * // positions[0] = { x: 200, y: 150, confidence: 1 }
 * // positions[1] = { x: 203, y: 148, confidence: 0.82 }
 * // positions[2] = { x: 207, y: 145, confidence: 0.75 }
 * // ...
 * ```
 */
export function trackSequence(
  frames: GrayFrame[],
  initialPoint: Point,
  searchRadius: number = DEFAULT_SEARCH_RADIUS,
  minConfidence: number = 0.4,
): TrackedPoint[] {
  if (frames.length === 0) return [];

  const results: TrackedPoint[] = new Array(frames.length);

  // First frame: the initial point is the reference (confidence 1).
  results[0] = { x: initialPoint.x, y: initialPoint.y, confidence: 1 };

  // The anchor for the next search starts as the initial point. When
  // confidence drops below the threshold, we hold the last confident
  // position to prevent drift.
  let lastConfidentX = initialPoint.x;
  let lastConfidentY = initialPoint.y;

  for (let i = 1; i < frames.length; i++) {
    const tracked = trackPoint(
      frames[i - 1]!,
      frames[i]!,
      { x: lastConfidentX, y: lastConfidentY },
      searchRadius,
    );

    results[i] = tracked;

    if (tracked.confidence >= minConfidence) {
      // Update the anchor for the next frame.
      lastConfidentX = tracked.x;
      lastConfidentY = tracked.y;
    }
    // If confidence is below threshold, keep the last confident position
    // as the anchor for the next search. The low-confidence result is
    // still recorded so the caller can see the tracker's best guess.
  }

  return results;
}

// ── Utility: RGB → Grayscale conversion ───────────────────────────────

/**
 * Convert an RGBA frame (4 bytes per pixel, row-major) to a grayscale
 * {@link GrayFrame} using the standard luminance weights:
 *
 *   Y = 0.299·R + 0.587·G + 0.114·B
 *
 * This is provided as a convenience for callers that have RGBA data (e.g.
 * from a Skia `readPixels` call or a native frame processor). The alpha
 * channel is ignored.
 *
 * @param rgba    RGBA pixel data, 4 bytes per pixel, row-major.
 * @param width   Frame width in pixels.
 * @param height  Frame height in pixels.
 * @returns A grayscale frame suitable for {@link trackPoint} / {@link trackSequence}.
 */
export function rgbaToGray(rgba: Uint8Array, width: number, height: number): GrayFrame {
  const gray = new Uint8Array(width * height);
  for (let i = 0, j = 0; i < gray.length; i++, j += 4) {
    const r = rgba[j]!;
    const g = rgba[j + 1]!;
    const b = rgba[j + 2]!;
    gray[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }
  return { data: gray, width, height };
}
