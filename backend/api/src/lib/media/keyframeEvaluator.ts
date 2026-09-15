/**
 * keyframeEvaluator — backend port of the frontend KeyframeEvaluator
 * (frontend/src/creator/core/playback/KeyframeEvaluator.ts).
 *
 * The two evaluators MUST stay mathematically identical: the preview
 * interpolates keyframes per rendered frame, and the export path samples
 * this evaluator at the output frame rate — sampling at frame times makes
 * a staircase expression frame-exact with the preview.
 *
 * The sampled values are emitted as FFmpeg `between(t,…)` staircase
 * expressions by {@link samplesToStaircaseExpr} so authored animations
 * (position, scale, rotation, opacity) are burned into exported video.
 */

export interface ParsedKeyframe {
  id: string;
  layerId: string;
  property: 'position' | 'scale' | 'rotation' | 'opacity';
  /** Time offset from the start of the layer's clip timeline, in ms. */
  timeMs: number;
  value: number;
  easing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'spring';
}

// ── Easing functions (verbatim port of the frontend evaluator) ───────

function easeLinear(t: number): number {
  return t;
}

function easeInQuad(t: number): number {
  return t * t;
}

function easeOutQuad(t: number): number {
  return t * (2 - t);
}

function easeInOutQuad(t: number): number {
  if (t < 0.5) return 2 * t * t;
  return -1 + (4 - 2 * t) * t;
}

function easeSpring(
  t: number,
  config: { stiffness?: number; damping?: number; mass?: number } = {},
): number {
  const stiffness = config.stiffness ?? 180;
  const damping = config.damping ?? 22;
  const mass = config.mass ?? 1.0;
  const omega0 = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  if (zeta >= 1) {
    return 1 - (1 + omega0 * t) * Math.exp(-omega0 * t);
  }
  const omegaD = omega0 * Math.sqrt(1 - zeta * zeta);
  const env = Math.exp(-zeta * omega0 * t);
  const cosTerm = Math.cos(omegaD * t);
  const sinTerm = (zeta * omega0 / omegaD) * Math.sin(omegaD * t);
  return 1 - env * (cosTerm + sinTerm);
}

function applyEasing(easing: ParsedKeyframe['easing'], t: number): number {
  switch (easing) {
    case 'linear': return easeLinear(t);
    case 'ease-in': return easeInQuad(t);
    case 'ease-out': return easeOutQuad(t);
    case 'ease-in-out': return easeInOutQuad(t);
    case 'spring': return easeSpring(t);
    default: return easeLinear(t);
  }
}

// ── Evaluation ───────────────────────────────────────────────────────

/**
 * Evaluate a single-property keyframe track at `timeMs`. Mirrors the
 * frontend evaluator exactly: before the first keyframe returns the first
 * value, after the last holds the last value, and between keyframes
 * interpolates with the outgoing (after) keyframe's easing.
 */
export function evaluateKeyframes(
  keyframes: ParsedKeyframe[],
  timeMs: number,
  property: ParsedKeyframe['property'],
): number | null {
  if (!keyframes || keyframes.length === 0) return null;
  const track = keyframes.filter((k) => k.property === property);
  if (track.length === 0) return null;

  const sorted = track.length > 1 && track[0].timeMs > track[track.length - 1].timeMs
    ? [...track].sort((a, b) => a.timeMs - b.timeMs)
    : track;

  if (timeMs <= sorted[0].timeMs) return sorted[0].value;
  const last = sorted[sorted.length - 1];
  if (timeMs >= last.timeMs) return last.value;

  let before = sorted[0];
  let after = sorted[sorted.length - 1];
  for (let i = 0; i < sorted.length - 1; i++) {
    if (timeMs >= sorted[i].timeMs && timeMs <= sorted[i + 1].timeMs) {
      before = sorted[i];
      after = sorted[i + 1];
      break;
    }
  }
  if (before.id === after.id) return before.value;

  const segmentDuration = after.timeMs - before.timeMs;
  if (segmentDuration <= 0) return before.value;
  const t = (timeMs - before.timeMs) / segmentDuration;
  const easedT = applyEasing(after.easing, Math.max(0, Math.min(1, t)));
  return before.value + (after.value - before.value) * easedT;
}

/**
 * True when the layer carries at least one keyframe — drives render-path
 * classification and the animated-overlay split.
 */
export function layerHasKeyframes(keyframes: ParsedKeyframe[] | undefined): boolean {
  return Array.isArray(keyframes) && keyframes.length > 0;
}

/**
 * Sample one property track once per output frame. `fps` is the output
 * frame rate and `durationMs` the output clip duration; the returned array
 * has one value per frame (frame n evaluated at t = n / fps).
 */
export function samplePropertyTrack(
  keyframes: ParsedKeyframe[],
  property: ParsedKeyframe['property'],
  fps: number,
  durationMs: number,
): number[] | null {
  const track = keyframes.filter((k) => k.property === property);
  if (track.length === 0 || fps <= 0 || durationMs <= 0) return null;
  const frames = Math.max(1, Math.ceil((durationMs / 1000) * fps));
  const samples: number[] = new Array<number>(frames);
  for (let n = 0; n < frames; n++) {
    const v = evaluateKeyframes(track, (n * 1000) / fps, property);
    samples[n] = v ?? 0;
  }
  return samples;
}

// ── FFmpeg expression generation ─────────────────────────────────────

/**
 * Escape a numeric FFmpeg expression fragment for embedding inside a
 * single-quoted filter value (single quotes are escaped for the filter
 * parser's quoting level).
 */
function fmtNum(v: number): string {
  // 4 decimals ≈ sub-pixel/sub-degree precision — enough for authored motion.
  return Number.isFinite(v) ? v.toFixed(4) : '0';
}

/**
 * Emit a piecewise expression over output time `t` (seconds) that returns
 * samples[n] while frame n is current. Consecutive identical samples are
 * collapsed into a single `between` range so constant holds produce tiny
 * expressions. Falls back to the last value outside all ranges.
 */
export function samplesToStaircaseExpr(samples: number[], fps: number): string {
  if (samples.length === 0) return '0';
  if (fps <= 0) return fmtNum(samples[0]);

  // Collapse runs of identical samples into [startSec, endSec) ranges.
  const runs: Array<{ startSec: number; endSec: number; value: number }> = [];
  let runStart = 0;
  for (let i = 1; i <= samples.length; i++) {
    if (i === samples.length || samples[i] !== samples[runStart]) {
      runs.push({
        startSec: runStart / fps,
        endSec: i / fps,
        value: samples[runStart],
      });
      runStart = i;
    }
  }
  if (runs.length === 1) return fmtNum(runs[0].value);

  // Nested if-chain: last run becomes the fallback so the tail holds.
  let expr = fmtNum(runs[runs.length - 1].value);
  for (let i = runs.length - 2; i >= 0; i--) {
    const r = runs[i];
    expr = `if(between(t,${fmtNum(r.startSec)},${fmtNum(r.endSec)}),${fmtNum(r.value)},${expr})`;
  }
  return expr;
}

/**
 * Defensive parse of the raw `keyframes` array on a serialized layer —
 * unknown/malformed entries are dropped rather than failing the render.
 */
export function parseKeyframes(raw: unknown): ParsedKeyframe[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: ParsedKeyframe[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const k = item as Record<string, unknown>;
    const property = k['property'];
    const timeMs = k['timeMs'];
    const value = k['value'];
    if (
      property !== 'position' && property !== 'scale'
      && property !== 'rotation' && property !== 'opacity'
    ) continue;
    if (typeof timeMs !== 'number' || !Number.isFinite(timeMs) || timeMs < 0) continue;
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    const easing = k['easing'];
    out.push({
      id: typeof k['id'] === 'string' ? k['id'] : `kf_${out.length}`,
      layerId: typeof k['layerId'] === 'string' ? k['layerId'] : '',
      property,
      timeMs,
      value,
      easing:
        easing === 'linear' || easing === 'ease-in' || easing === 'ease-out'
        || easing === 'ease-in-out' || easing === 'spring'
          ? easing
          : 'ease-in-out',
    });
  }
  return out.length > 0 ? out : undefined;
}
