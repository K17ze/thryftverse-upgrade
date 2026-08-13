/**
 * Motion tokens for ThryftVerse — the single global motion contract.
 *
 * Inspired by Linear's 120-180ms spring-based precision, Instagram's
 * physics-based motion that mimics human movement, and the 2026 flagship
 * timing rules in AGENTS.md §27.2:
 *
 *   50–100ms  instant feedback (button press highlight)
 *   100–200ms simple state change (toggle, checkbox, icon swap)
 *   200–300ms standard transition (page slide, sheet appear, tab switch)
 *   300–500ms complex transition (layout rearrangement, shared element)
 *   500ms+    elaborate animation (onboarding, celebratory moments)
 *
 * Principles (AGENTS.md §17):
 * - Motion as feedback, not decoration
 * - Spring-based, not ease-in-out
 * - 120-180ms for state changes (fast enough to feel responsive, slow enough to perceive)
 * - Nothing snaps, everything settles
 * - Reduced motion collapses to instant / simple fade (see useMotionConfig)
 *
 * No local "magic" values unless interaction physics require them and are
 * documented. Standardized transitions (audit §Motion architecture):
 *   - FadeInDown for list items
 *   - slide for sheets
 *   - spring for interactive feedback
 */
import { Easing } from 'react-native-reanimated';

export const Motion = {
  duration: {
    instant: 0,
    /** 80ms — instant feedback (button press highlight). AGENTS §27.2. */
    touch: 80,
    /** 120ms — Quick feedback (tap, press). */
    fast: 120,
    /** 180ms — Standard state change (sheet open, tab switch). */
    normal: 180,
    /** 280ms — Larger transitions (screen push, modal). */
    slow: 280,
    /** 400ms — Emphasis moments (success animation). */
    slower: 400,
    /** 600ms — Hero/page transitions, elaborate onboarding moments. */
    crawl: 600,
  },

  // Spring configs (Reanimated 4 compatible).
  // Flagship range per AGENTS §27.3: damping 12–18, stiffness 120–280, mass 0.8–1.0.
  // Lower damping = more bounce. Higher stiffness = snappier.
  // Semantic presets per audit: tap, settle, sheet, reorder, success.
  // Do not create a bespoke spring per screen.
  spring: {
    // Quick tap feedback — snappy, settles fast
    tap: { damping: 18, stiffness: 280, mass: 0.8 },
    // Gentle press — slightly softer
    press: { damping: 15, stiffness: 200, mass: 0.9 },
    // Settle — layout settle after drag/reorder, controlled with minimal overshoot
    settle: { damping: 24, stiffness: 240, mass: 0.9 },
    // Sheet/modal entrance — smooth, confident
    sheet: { damping: 22, stiffness: 180, mass: 1.0 },
    // Entrance — generic entrance (alias for sheet, kept for backward compat)
    entrance: { damping: 22, stiffness: 180, mass: 1.0 },
    // Reorder — list reordering, controlled with slight liveliness
    reorder: { damping: 20, stiffness: 220, mass: 0.9 },
    // Card lift — playful but controlled
    lift: { damping: 16, stiffness: 160, mass: 1.0 },
    // Success celebration — bouncy, rare and brief
    success: { damping: 12, stiffness: 120, mass: 1.0 },
    // Shared element transition — smooth, no overshoot
    sharedElement: { damping: 26, stiffness: 200, mass: 1.0 },
    // Urgent attention pulse — unread indicators, alerts (tight, lively)
    urgency: { damping: 14, stiffness: 220, mass: 0.9 },
    // Segment indicator slide — controlled, no overshoot (tab rail, segmented controls)
    indicator: { damping: 24, stiffness: 240, mass: 0.9 },
    // Bounce-free content crossfade/slide — used for mode changes and directional slides
    glide: { damping: 28, stiffness: 260, mass: 1.0 },
  },

  // Easing curves (for non-spring animations). Reanimated Easing functions.
  easing: {
    // Standard ease — for opacity fades
    smooth: Easing.inOut(Easing.ease),
    // Entrance — decelerate into rest
    entrance: Easing.out(Easing.cubic),
    // Exit — accelerate away
    exit: Easing.in(Easing.cubic),
    // Gentle ease-out for content reveals (slightly softer than entrance)
    easeOut: Easing.out(Easing.quad),
    // Sharp ease-in-out for icon swaps / state morphs
    crisp: Easing.inOut(Easing.cubic),
  },

  // Stagger delays for list entrance (AGENTS §17: do not animate every
  // historical item on initial load — cap cascades to the first viewport).
  stagger: {
    fast: 40,     // 40ms between items — quick cascade
    normal: 60,   // 60ms — standard cascade
    slow: 100,    // 100ms — dramatic cascade
    // Maximum number of items to stagger on initial mount. Items beyond this
    // appear instantly so long lists do not animate their entire history
    // (AGENTS §16: "Do not animate every historical item on initial load").
    maxItems: 8,
  },

  // ── Standardized transition presets ──────────────────────────────────────
  // The audit (§Motion architecture) calls for one global motion contract with
  // standardized transitions: FadeInDown for list items, slide for sheets,
  // spring for interactive feedback. These presets give every surface a
  // consistent entrance language without per-screen "magic" values.
  transitions: {
    /** List item entrance — FadeInDown. Used for feed/list rows. */
    listItem: {
      duration: 220,
      delay: 0,
      translateY: 8,
      easing: 'entrance' as const,
    },
    /** Sheet entrance — slide up + fade. Used for bottom sheets, modals. */
    sheet: {
      duration: 280,
      translateY: 24,
      easing: 'entrance' as const,
    },
    /** Tab content crossfade — directional slide + fade. */
    tabSwitch: {
      duration: 200,
      translateX: 12,
      easing: 'crisp' as const,
    },
    /** Mode/content crossfade — pure opacity, no travel. */
    crossfade: {
      duration: 180,
      easing: 'smooth' as const,
    },
    /** Media load crossfade — opacity only, never pop (Design.md §Component A). */
    mediaLoad: {
      duration: 250,
      easing: 'smooth' as const,
    },
  },

  // ── Gesture thresholds (audit §Gesture matrix) ───────────────────────────
  // Canonical thresholds so each media/editor screen does not invent its own.
  gestures: {
    /** Minimum horizontal pan distance before a swipe is recognised. */
    panThreshold: 8,
    /** Distance before a vertical dismiss drag is committed. */
    dismissThreshold: 100,
    /** Long-press time before a reveal/peek fires. */
    longPressMs: 350,
    /** Double-tap window for like / zoom. */
    doubleTapMs: 280,
    /** Pinch zoom below this factor snaps back to min. */
    pinchMinSnap: 1,
    /** Max zoom for standard media stages (detail surfaces may override). */
    pinchMaxDefault: 4,
  },
} as const;

/**
 * Critically-damped spring — settles instantly with no visible travel.
 * Used for every spring config when reduced motion is enabled.
 * Exported so custom springs can opt into the same reduced-motion fallback.
 */
export const REDUCED_SPRING = { damping: 100, stiffness: 1000, mass: 1.0 } as const;

/**
 * Instant timing config for reduced-motion fallbacks of timing-based animations.
 */
export const REDUCED_TIMING = { duration: 0 } as const;
