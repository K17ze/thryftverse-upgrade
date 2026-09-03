/**
 * Semantic motion presets — the documented grammar in code form.
 *
 * This module is the practical companion to `MOTION_GRAMMAR.md`. It maps each
 * semantic motion family (press feedback, sheet present, list reveal, …) to a
 * duration family + easing curve + reduced-motion duration, drawn from the
 * single source of truth in `motionTokens.ts` (`Motion`).
 *
 * Why this exists (audit §Motion architecture / P2-14):
 *   - Motion lacked one documented grammar → inconsistency / decorative motion.
 *   - Screens were inventing bespoke spring constants and magic durations.
 *   - This module gives every surface a named preset so no screen needs to
 *     reach for a raw number or hand-rolled spring.
 *
 * Rules (see MOTION_GRAMMAR.md):
 *   1. Three duration families only: Instant, Prompt, Continuity.
 *   2. One reduced-motion policy: opacity-only crossfade at 0–150ms.
 *   3. No bespoke spring constants per screen — use `SPRING` here or
 *      `Motion.spring.*`. The only spring in the grammar is press feedback;
 *      everything else is timing-based.
 *   4. Every preset declares: duration, easing, reduced-motion duration.
 *
 * Usage:
 *   const preset = MOTION_PRESETS.sheetPresent;
 *   const duration = useMotionDuration(preset);
 *   opacity.value = withTiming(1, { duration, easing: preset.easing });
 */
import { type EasingFunction } from 'react-native-reanimated';
import { Motion } from './motionTokens';
import { useReducedMotion } from '../hooks/useReducedMotion';

// ── Duration families ───────────────────────────────────────────────────────
// Three canonical families. Values are sourced from `Motion.duration` /
// `Motion.tier` so there is one source of truth for raw numbers.
export const DURATION = {
  /** Instant (100–200ms) — press feedback, tap state, toggle. Reduced-motion: 0ms. */
  instant: Motion.duration.normal, // 180ms
  /** Prompt (200–350ms) — sheet present/dismiss, modal, section reveal. Reduced-motion: 100ms. */
  prompt: Motion.duration.slow, // 280ms
  /** Continuity (350–600ms) — shared element, hero expand, screen push w/ media. Reduced-motion: 150ms. */
  continuity: Motion.duration.slower, // 400ms
} as const;

// ── Easing curves ───────────────────────────────────────────────────────────
// Re-exported from the single source of truth so callers do not import two
// easing definitions. `decelerated` is the canonical entrance curve for the
// grammar (bezier-style ease-out); `easeOut` is the quick state-change curve.
export const EASING: Record<'decelerated' | 'easeOut' | 'standard', EasingFunction> = {
  decelerated: Motion.easing.entrance, // ease-out (entries)
  easeOut: Motion.easing.easeOut, // gentle ease-out (state changes)
  standard: Motion.easing.crisp, // ease-in-out (toggles / morphs)
} as const;

// ── Spring configs ──────────────────────────────────────────────────────────
// The grammar allows exactly one spring family: press feedback. Everything
// else is timing-based. Re-exported from `Motion.spring` so there is no
// second set of constants. Use `Motion.spring.*` directly for the rare
// editor/gesture cases that still need physics; do not invent new ones.
export const SPRING = {
  /** Press feedback — snappy, settles fast. The only spring in the grammar. */
  press: Motion.spring.press,
  /** Tap feedback — even snappier, for icon swaps / like. */
  tap: Motion.spring.tap,
} as const;

// ── Preset type ─────────────────────────────────────────────────────────────
export interface MotionPreset {
  /** Full-motion duration (ms). */
  duration: number;
  /** Easing curve for timing-based animation. */
  easing: EasingFunction;
  /** Reduced-motion duration (ms). Opacity-only crossfade, 0–150ms. */
  reducedMotionDuration: number;
}

// ── Semantic motion families ────────────────────────────────────────────────
// Each preset corresponds to a family in MOTION_GRAMMAR.md. Callers should
// reference `MOTION_PRESETS.<family>` instead of inventing per-screen values.
export const MOTION_PRESETS = {
  /** 1. Press feedback — touch down/up. Instant family, spring. */
  pressFeedback: {
    duration: DURATION.instant,
    easing: EASING.easeOut,
    reducedMotionDuration: 0,
  },
  /** 2. Sheet present — bottom sheet entrance. Prompt family. */
  sheetPresent: {
    duration: DURATION.prompt,
    easing: EASING.decelerated,
    reducedMotionDuration: 100,
  },
  /** 3. Modal push — modal screen entrance. Prompt family. */
  modalPush: {
    duration: DURATION.prompt,
    easing: EASING.decelerated,
    reducedMotionDuration: 100,
  },
  /** 4. List item reveal — scroll-into-view / data load. Prompt family. */
  listReveal: {
    duration: DURATION.prompt,
    easing: EASING.decelerated,
    reducedMotionDuration: 100,
  },
  /** 5. Media hero expand — shared element / full-screen viewer. Continuity family. */
  mediaExpand: {
    duration: DURATION.continuity,
    easing: EASING.decelerated,
    reducedMotionDuration: 150,
  },
  /** 6. State transition — loading → content crossfade. Prompt family. */
  stateTransition: {
    duration: DURATION.prompt,
    easing: EASING.decelerated,
    reducedMotionDuration: 100,
  },
  /** 7. Send/receive message — chat bubble entrance. Instant family. */
  messageSend: {
    duration: DURATION.instant,
    easing: EASING.easeOut,
    reducedMotionDuration: 0,
  },
  /** 8. Filter/sort change — list opacity pulse, no layout shift. Instant family. */
  filterChange: {
    duration: DURATION.instant,
    easing: EASING.easeOut,
    reducedMotionDuration: 0,
  },
  /** 9. Tab switch — content crossfade + indicator slide. Instant family. */
  tabSwitch: {
    duration: DURATION.instant,
    easing: EASING.easeOut,
    reducedMotionDuration: 0,
  },
  /** 10. Pull to refresh — spinner (Instant) + content settle (Prompt). */
  pullRefreshSpinner: {
    duration: DURATION.instant,
    easing: EASING.easeOut,
    reducedMotionDuration: 0,
  },
  pullRefreshSettle: {
    duration: DURATION.prompt,
    easing: EASING.decelerated,
    reducedMotionDuration: 0,
  },
} as const satisfies Record<string, MotionPreset>;

// ── Hook ────────────────────────────────────────────────────────────────────
/**
 * Returns the duration to use for a preset, taking the user's reduced-motion
 * preference into account. Pair with `preset.easing` for `withTiming`, or use
 * `SPRING.press` directly for press feedback (springs collapse via
 * `useMotionConfig()` when reduced motion is on).
 *
 * @example
 *   const preset = MOTION_PRESETS.sheetPresent;
 *   const duration = useMotionDuration(preset);
 *   opacity.value = withTiming(1, { duration, easing: preset.easing });
 */
export function useMotionDuration(preset: MotionPreset): number {
  const reducedMotion = useReducedMotion();
  return reducedMotion ? preset.reducedMotionDuration : preset.duration;
}
