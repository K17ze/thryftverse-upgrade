/**
 * Motion tokens for ThryftVerse.
 *
 * Inspired by Linear's 120-180ms spring-based precision and Instagram's
 * physics-based motion that mimics human movement.
 *
 * Principles:
 * - Motion as feedback, not decoration
 * - Spring-based, not ease-in-out
 * - 120-180ms for state changes (fast enough to feel responsive, slow enough to perceive)
 * - Nothing snaps, everything settles
 */

export const Motion = {
  duration: {
    instant: 0,
    fast: 120,      // Quick feedback (tap, press)
    normal: 180,    // Standard state change (sheet open, tab switch)
    slow: 280,      // Larger transitions (screen push, modal)
    slower: 400,    // Emphasis moments (success animation)
  },

  // Spring configs (Reanimated 4 compatible)
  spring: {
    // Quick tap feedback — snappy, settles fast
    tap: { damping: 18, stiffness: 280, mass: 0.8 },
    // Gentle press — slightly softer
    press: { damping: 15, stiffness: 200, mass: 0.9 },
    // Sheet/modal entrance — smooth, confident
    entrance: { damping: 22, stiffness: 180, mass: 1.0 },
    // Card lift — playful but controlled
    lift: { damping: 16, stiffness: 160, mass: 1.0 },
    // Success celebration — bouncy
    success: { damping: 12, stiffness: 120, mass: 1.0 },
    // Shared element transition — smooth, no overshoot
    sharedElement: { damping: 26, stiffness: 200, mass: 1.0 },
    // Urgent attention pulse — unread indicators, alerts (tight, lively)
    urgency: { damping: 14, stiffness: 220, mass: 0.9 },
  },

  // Easing curves (for non-spring animations)
  easing: {
    // Standard ease — for opacity fades
    smooth: 'easeInOut',
    // Entrance — decelerate into rest
    entrance: 'easeOutCubic',
    // Exit — accelerate away
    exit: 'easeInCubic',
  },

  // Stagger delays for list entrance
  stagger: {
    fast: 40,     // 40ms between items — quick cascade
    normal: 60,   // 60ms — standard cascade
    slow: 100,    // 100ms — dramatic cascade
  },
} as const;
