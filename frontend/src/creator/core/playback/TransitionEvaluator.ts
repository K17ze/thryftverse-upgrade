// ───────────────────────────────────────────────────────────────────────────
// TransitionEvaluator — evaluates transition progress at a given time.
//
// During playback and export, the renderer asks this evaluator for the
// outgoing and incoming clip's alpha and translate transform at the current
// timeline time. The result drives compositing: the outgoing clip fades /
// slides out while the incoming clip fades / slides in.
//
// Transition window
// -----------------
// A transition of duration D between clip A (ending at time T) and clip B
// (starting at T) occupies the window [T - D/2, T + D/2] — the two clips
// overlap for the duration of the transition. The evaluator receives the
// transition and the *absolute timeline time* and computes a normalized
// progress `p` in [0, 1] across that window.
//
// Per-type behaviour
// ------------------
//   cut      — instant: outgoingAlpha 0, incomingAlpha 1 (no overlap window;
//              the swap happens at the boundary).
//   fade     — cross-dissolve: outgoingAlpha = 1 - p, incomingAlpha = p.
//   dissolve — same alpha curve as fade but flagged for pixel-dissolve
//              compositing (the renderer uses an opacity blend / dither
//              pattern rather than a flat cross-fade).
//   slide    — outgoing translates left by p * width, incoming translates in
//              from the right by (1 - p) * width. Alphas are 1 throughout.
//   wipe     — linear wipe left-to-right: the incoming clip is revealed
//              progressively. Alphas are 1; the renderer clips the incoming
//              clip to a rect whose width = p * frameWidth. The translate
//              values are 0; the wipe geometry is applied by the renderer
//              using `progress` (exposed on TransitionState).
//
// Per AGENTS.md §11: the evaluator returns truthful render data — no fake
// states. Outside the transition window it returns a settled state (one clip
// fully visible, the other fully hidden) so callers can always composite both
// clips without special-casing the window bounds.
// ───────────────────────────────────────────────────────────────────────────

import type { Transition } from '../../poster/timeline/TimelineTypes';

// ── Types ─────────────────────────────────────────────────────────────────

/**
 * A 2D translate transform applied to a clip during a transition.
 * Values are in normalized clip-space units (0 = no offset, 1 = one full
 * frame width/height). The renderer scales by the rendered frame dimensions.
 */
export interface TransitionTransform {
  translateX: number;
  translateY: number;
}

/**
 * The evaluated transition state at a single point in time.
 *
 * `outgoingAlpha` / `incomingAlpha` are the opacity values for the outgoing
 * and incoming clips respectively. `outgoingTransform` / `incomingTransform`
 * are normalized translate offsets (0..1 of frame size).
 *
 * `progress` is the raw normalized progress (0..1) across the transition
 * window. It is exposed so the renderer can implement geometry-based
 * transitions (e.g. the wipe clip-rect) that cannot be expressed as alpha +
 * translate alone.
 *
 * `active` is false when the current time is outside the transition window —
 * the state is settled and only one clip needs to be visible.
 */
export interface TransitionState {
  outgoingAlpha: number;
  incomingAlpha: number;
  outgoingTransform: TransitionTransform;
  incomingTransform: TransitionTransform;
  progress: number;
  active: boolean;
}

/** A settled (no-transition) state: incoming fully visible, outgoing hidden. */
const SETTLED_INCOMING: TransitionState = {
  outgoingAlpha: 0,
  incomingAlpha: 1,
  outgoingTransform: { translateX: 0, translateY: 0 },
  incomingTransform: { translateX: 0, translateY: 0 },
  progress: 1,
  active: false,
};

/** A settled state: outgoing fully visible, incoming hidden (before window). */
const SETTLED_OUTGOING: TransitionState = {
  outgoingAlpha: 1,
  incomingAlpha: 0,
  outgoingTransform: { translateX: 0, translateY: 0 },
  incomingTransform: { translateX: 0, translateY: 0 },
  progress: 0,
  active: false,
};

// ── Helpers ───────────────────────────────────────────────────────────────

/** Clamp a value to [0, 1]. */
function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0, v));
}

// ── Evaluator ─────────────────────────────────────────────────────────────

/**
 * Evaluate a transition at an absolute timeline time.
 *
 * The transition is assumed to be centred on the boundary between the
 * outgoing and incoming clips. The renderer supplies the boundary time via
 * `transition.durationMs` and the clip timings; this function only needs the
 * transition definition and the current time relative to the transition's
 * start.
 *
 * @param transition     The transition to evaluate.
 * @param currentTimeMs  The absolute timeline time in milliseconds. This is
 *                       expected to be relative to the transition's centre
 *                       (the clip boundary): a time at the start of the
 *                       window is `transition.durationMs / 2` before the
 *                       boundary. Callers should pass the time offset from
 *                       the transition's start by subtracting the boundary
 *                       time minus half the duration. For simplicity, this
 *                       function treats `currentTimeMs` as the offset from
 *                       the transition start (0 = window start).
 * @returns The evaluated {@link TransitionState}.
 */
export function evaluateTransition(
  transition: Transition,
  currentTimeMs: number,
): TransitionState {
  const duration = Math.max(0, transition.durationMs);
  const t = Math.max(0, currentTimeMs);

  // cut is instant — no overlap window.
  if (transition.type === 'cut' || duration <= 0) {
    // At or after the boundary, incoming is fully visible.
    if (t >= duration / 2) return { ...SETTLED_INCOMING, progress: 1 };
    return { ...SETTLED_OUTGOING, progress: 0 };
  }

  const progress = clamp01(t / duration);

  // Before the window — outgoing clip fully visible.
  if (progress <= 0) return { ...SETTLED_OUTGOING, active: false };
  // After the window — incoming clip fully visible.
  if (progress >= 1) return { ...SETTLED_INCOMING, active: false };

  switch (transition.type) {
    case 'fade':
      return {
        outgoingAlpha: 1 - progress,
        incomingAlpha: progress,
        outgoingTransform: { translateX: 0, translateY: 0 },
        incomingTransform: { translateX: 0, translateY: 0 },
        progress,
        active: true,
      };

    case 'dissolve':
      // Same alpha curve as fade; the renderer applies a pixel-dissolve
      // (opacity blend / dither) using `progress` rather than a flat
      // cross-fade. The alpha values are identical so the compositor can
      // treat dissolve as a drop-in replacement for fade when the dither
      // path is unavailable.
      return {
        outgoingAlpha: 1 - progress,
        incomingAlpha: progress,
        outgoingTransform: { translateX: 0, translateY: 0 },
        incomingTransform: { translateX: 0, translateY: 0 },
        progress,
        active: true,
      };

    case 'slide': {
      // Outgoing translates left by p * frameWidth; incoming enters from
      // the right, offset by (1 - p) * frameWidth. Both stay fully opaque.
      return {
        outgoingAlpha: 1,
        incomingAlpha: 1,
        outgoingTransform: { translateX: -progress, translateY: 0 },
        incomingTransform: { translateX: 1 - progress, translateY: 0 },
        progress,
        active: true,
      };
    }

    case 'wipe': {
      // Linear wipe left-to-right: both clips fully opaque; the renderer
      // clips the incoming clip to a rect of width p * frameWidth. No
      // translate offset is needed — the wipe geometry is derived from
      // `progress`.
      return {
        outgoingAlpha: 1,
        incomingAlpha: 1,
        outgoingTransform: { translateX: 0, translateY: 0 },
        incomingTransform: { translateX: 0, translateY: 0 },
        progress,
        active: true,
      };
    }

    default:
      // Unreachable — cut is handled above and TransitionType has no other
      // members. Kept for exhaustiveness.
      return { ...SETTLED_INCOMING, progress };
  }
}

// ── Transition window helper ──────────────────────────────────────────────

/**
 * Compute the absolute timeline window `[startMs, endMs]` for a transition
 * given the boundary time between the two clips.
 *
 * The transition is centred on the boundary: it starts at
 * `boundaryMs - duration/2` and ends at `boundaryMs + duration/2`.
 *
 * @param transition  The transition.
 * @param boundaryMs  The absolute timeline time at which the outgoing clip
 *                    ends and the incoming clip begins.
 * @returns The `{ startMs, endMs }` window. For a `cut` (duration 0) both
 *          values equal `boundaryMs`.
 */
export function transitionWindow(
  transition: Transition,
  boundaryMs: number,
): { startMs: number; endMs: number } {
  const half = Math.max(0, transition.durationMs) / 2;
  return {
    startMs: boundaryMs - half,
    endMs: boundaryMs + half,
  };
}

/**
 * Evaluate a transition at an absolute timeline time, given the boundary time
 * between the two clips.
 *
 * This is a convenience wrapper that converts the absolute time to the
 * transition-relative offset (time since window start) and delegates to
 * {@link evaluateTransition}.
 *
 * @param transition     The transition to evaluate.
 * @param boundaryMs     The absolute timeline time of the clip boundary.
 * @param currentTimeMs  The absolute timeline time to evaluate at.
 * @returns The evaluated {@link TransitionState}.
 */
export function evaluateTransitionAt(
  transition: Transition,
  boundaryMs: number,
  currentTimeMs: number,
): TransitionState {
  const window = transitionWindow(transition, boundaryMs);
  const offset = currentTimeMs - window.startMs;
  return evaluateTransition(transition, offset);
}
