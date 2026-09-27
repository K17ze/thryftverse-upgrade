/**
 * Motion tokens for web — the single global motion contract.
 *
 * Port of frontend/src/theme/motionTokens.ts + motionPresets.ts, adapted:
 * Reanimated spring configs don't exist on web — CSS transitions are
 * timing-based, so the web grammar keeps the same three tiers and easing
 * direction rules, expressed as CSS values. The spring table is retained
 * as documentation of the mobile physics for parity audits, not as an
 * API surfaces should consume.
 *
 * Timing bands (AGENTS.md §27.2):
 *   50–100ms  instant feedback (press highlight)
 *   100–200ms simple state change (toggle, icon swap)
 *   200–300ms standard transition (sheet, tab switch)
 *   300–500ms complex transition (layout, shared element)
 *   500ms+    rare — onboarding only, never decoration
 *
 * Easing direction rules (2026 HIG):
 *   entries       → ease-out  (decelerate into rest)
 *   exits         → ease-in   (accelerate away)
 *   state changes → ease-in-out (symmetric: toggles, morphs, crossfades)
 *
 * Governance: see GOVERNANCE.md. Reduced motion collapses every tier to
 * instant — the global prefers-reduced-motion squash in globals.css owns
 * that; do not re-implement per component.
 *
 * No confetti, lottie, or celebration primitives exist in this module by
 * explicit product decision — do not add them.
 */
export const MOTION = {
  /** Duration scale (ms) — mirrors mobile Motion.duration. */
  duration: {
    /** 0 — no visible motion; the reduced-motion target for every tier. */
    instant: 0,
    /** 80 — press-down feedback. */
    touch: 80,
    /** 160 — press release (slower than press-down for asymmetric feel). */
    pressRelease: 160,
    /** 120 — quick state feedback (tap, toggle). */
    fast: 120,
    /** 180 — standard state change (tab switch, toast). */
    normal: 180,
    /** 280 — structural transition (sheet, modal, screen push). */
    slow: 280,
    /** 400 — emphasis moments only. */
    slower: 400,
    /** 600 — hero/page transitions; rare. */
    crawl: 600,
  },

  /** The three canonical tiers — reference these, not raw numbers. */
  tier: {
    instant: 0,
    micro: 120,
    deliberate: 280,
  },

  /**
   * Easing curves as CSS cubic-bezier values — approximations of the
   * Reanimated Easing functions used on mobile:
   *   entrance ≈ Easing.out(cubic)   — entries decelerate into rest
   *   exit     ≈ Easing.in(cubic)    — exits accelerate away
   *   crisp    ≈ Easing.inOut(cubic) — symmetric state changes
   *   smooth   ≈ Easing.inOut(ease)  — opacity fades
   *   standard — the shared app curve already on --ease-standard
   */
  easing: {
    entrance: 'cubic-bezier(0.215, 0.61, 0.355, 1)',
    exit: 'cubic-bezier(0.55, 0.055, 0.675, 0.19)',
    crisp: 'cubic-bezier(0.645, 0.045, 0.355, 1)',
    smooth: 'cubic-bezier(0.42, 0, 0.58, 1)',
    standard: 'cubic-bezier(0.2, 0, 0, 1)',
  },

  /** Stagger budget for list entrances — cap cascades to one viewport. */
  stagger: {
    fast: 40,
    normal: 60,
    slow: 100,
    /** Items beyond this appear instantly — never animate history. */
    maxItems: 8,
  },

  /** Standardized transition presets (mobile Motion.transitions port). */
  transitions: {
    listItem: { duration: 220, translateY: 8, easing: 'entrance' },
    sheet: { duration: 280, translateY: 24, easing: 'entrance' },
    tabSwitch: { duration: 200, translateX: 12, easing: 'crisp' },
    crossfade: { duration: 180, easing: 'smooth' },
    mediaLoad: { duration: 250, easing: 'smooth' },
    shimmer: { duration: 600, easing: 'smooth' },
  },

  /** Gesture thresholds — canonical so surfaces don't invent their own. */
  gestures: {
    panThreshold: 8,
    dismissThreshold: 100,
    longPressMs: 350,
    doubleTapMs: 280,
  },
} as const;

export type MotionTier = keyof typeof MOTION.tier;
export type MotionEasing = keyof typeof MOTION.easing;

/**
 * Interaction intensity hierarchy (S0–S4) — semantic layer tying motion to
 * interaction significance, ported from mobile InteractionIntensity.
 * On web S2+ carries no haptic; the tier only modulates duration choice.
 */
export const InteractionIntensity = {
  S0: 0, // invisible — filter chip toggle, sort; silent state change
  S1: 1, // visual only — like/save; icon swap at micro tier
  S2: 2, // committed action — add-to-bag, send; micro tier + press feedback
  S3: 3, // dedicated success surface — publish; deliberate tier
  S4: 4, // rare milestone — kept for parity; no celebration primitive exists
} as const;

export type InteractionIntensityLevel =
  (typeof InteractionIntensity)[keyof typeof InteractionIntensity];

/**
 * Reduced-motion policy — the global `prefers-reduced-motion` block in
 * globals.css collapses all animation/transition durations to ~0. CSS
 * consumers get this free. JS consumers (e.g. rAF-driven) must check:
 *
 *   const reduced = useReducedMotion(); // or matchMedia inline
 *   const d = reduced ? 0 : MOTION.duration.normal;
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return (
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
    document.documentElement.classList.contains('reduce-motion')
  );
}
