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
 * ── Three motion tiers (2026 Apple HIG + AGENTS.md §27.2) ──────────────
 *
 *   instant   (0ms)     — no visible motion; reduced-motion fallback.
 *   micro     (100–200) — interactive state feedback: button presses,
 *                         toggles, icon swaps, list item reveals.
 *   deliberate(250–400) — structural transitions: sheet presentations,
 *                         tab switches, screen pushes, modal entrances.
 *
 * Nothing above 400ms except rare celebratory/onboarding moments (crawl).
 *
 * ── Easing curves ──────────────────────────────────────────────────────
 *
 *   ease-out  → entries (decelerate into rest) — elements arriving.
 *   ease-in   → exits (accelerate away) — elements leaving.
 *   ease-in-out → state changes (symmetric) — toggles, morphs, crossfades.
 *
 * ── Motion discipline (AGENTS.md §17) ──────────────────────────────────
 *
 *   - Motion as feedback, not decoration.
 *   - No motion on static content — only on interactive state changes.
 *   - Spring-based for interactive feedback; timing for entrances/exits.
 *   - 120-180ms for state changes (fast enough to feel responsive, slow
 *     enough to perceive).
 *   - Nothing snaps, everything settles.
 *   - Reduced motion collapses to instant / simple fade (see useMotionConfig
 *     and useReducedMotion). Every animated surface must branch on
 *     useReducedMotion() or consume useMotionConfig().
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
    /** 120ms — Editor: snap-to-guide settle. */
    snapToGuide: 120,
    /** 180ms — Editor: layer selection lift. */
    layerLift: 180,
    /** 200ms — Editor: bottom-surface rail swap. */
    railSwap: 200,
    /** 150ms — Editor: trash-zone removal. */
    deleteDismiss: 150,
  },

  // ── Motion tiers (2026 Apple HIG) ─────────────────────────────────────
  // Semantic grouping of durations into the three canonical tiers so
  // callers can reference a tier instead of a magic number. Each tier
  // maps to a duration band; reduced-motion collapses all to `instant`.
  tier: {
    /** 0ms — no visible motion. Reduced-motion fallback for all tiers. */
    instant: 0,
    /** 120ms — micro feedback: button presses, toggles, icon swaps. */
    micro: 120,
    /** 280ms — deliberate transition: sheet, tab switch, screen push. */
    deliberate: 280,
  } as const,

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
    // Flagship sheet entrance — faster settle, zero float.
    // Calibrated to iOS 26 sheet physics (~damping ratio 0.9, ~400ms settle).
    // Use for editor sheets that must feel premium (SheetContainer, effects sheets).
    sheetFlagship: { damping: 30, stiffness: 400, mass: 1.0 },
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
    // Editor: snap-to-guide "safe-rack" settle — stiff, minimal overshoot
    snapTo: { damping: 12, stiffness: 300, mass: 0.9 },
    // Editor: layer becomes selected — slight lift
    layerLift: { damping: 16, stiffness: 220, mass: 0.9 },
    // Editor: bottom-surface rail swap — smooth, not bouncy
    railSwap: { damping: 20, stiffness: 200, mass: 0.8 },
    // Editor: trash-zone removal — fast, decisive
    deleteDismiss: { damping: 10, stiffness: 320, mass: 0.8 },
  },

  // Easing curves (for non-spring animations). Reanimated Easing functions.
  // 2026 Apple HIG: ease-out for entries, ease-in for exits, ease-in-out
  // for state changes. Never apply motion to static content — only to
  // interactive state changes (AGENTS.md §17).
  easing: {
    // Standard ease — for opacity fades
    smooth: Easing.inOut(Easing.ease),
    // Entrance — decelerate into rest (ease-out)
    entrance: Easing.out(Easing.cubic),
    // Exit — accelerate away (ease-in)
    exit: Easing.in(Easing.cubic),
    // Gentle ease-out for content reveals (slightly softer than entrance)
    easeOut: Easing.out(Easing.quad),
    // Sharp ease-in-out for icon swaps / state morphs
    crisp: Easing.inOut(Easing.cubic),
  },

  // ── Interaction → tier + easing mapping ─────────────────────────────────
  // The canonical assignment of motion tier and easing curve to each
  // interaction type. Callers should reference these instead of inventing
  // per-screen values. Every entry is an interactive state change —
  // static content never animates (AGENTS.md §17).
  mapping: {
    /** Button press — micro tier, spring (interactive feedback). */
    buttonPress: { tier: 'micro' as const, easing: 'spring' as const },
    /** Sheet presentation — deliberate tier, ease-out (entry). */
    sheetPresentation: { tier: 'deliberate' as const, easing: 'entrance' as const },
    /** Sheet dismissal — deliberate tier, ease-in (exit). */
    sheetDismissal: { tier: 'deliberate' as const, easing: 'exit' as const },
    /** Tab switch — deliberate tier, ease-in-out (state change). */
    tabSwitch: { tier: 'deliberate' as const, easing: 'crisp' as const },
    /** List item reveal — micro tier, ease-out (entry). */
    listItemReveal: { tier: 'micro' as const, easing: 'entrance' as const },
    /** Toggle / icon swap — micro tier, ease-in-out (state change). */
    toggle: { tier: 'micro' as const, easing: 'crisp' as const },
    /** Modal entrance — deliberate tier, ease-out (entry). */
    modalEntrance: { tier: 'deliberate' as const, easing: 'entrance' as const },
    /** Screen push — deliberate tier, ease-out (entry). */
    screenPush: { tier: 'deliberate' as const, easing: 'entrance' as const },
  } as const,

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
    /** Shimmer sweep — continuous skeleton shimmer loop. ≤600ms per audit M6.
     *  Reduced-motion collapses this to a static placeholder (no animation). */
    shimmer: {
      duration: 600,
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

/**
 * Interaction intensity hierarchy (S0–S4). Semantic layer tying motion + haptics
 * to interaction significance so the two are choreographed from one source.
 */
export const InteractionIntensity = {
  S0: 0, // invisible — filter chip toggle, sort — no haptic, silent state change
  S1: 1, // visual only — like/save/favorite — icon swap, no haptic
  S2: 2, // visual + subtle haptic — add-to-cart, send, confirm selection — light impact
  S3: 3, // dedicated success — publish listing, publish look — success surface + haptic
  S4: 4, // celebratory — rare, first-ever publish, milestone
} as const;

export type InteractionIntensityLevel =
  (typeof InteractionIntensity)[keyof typeof InteractionIntensity];

/**
 * Maps an interaction intensity level to its spring config.
 * S0 → no animation (instant). S4 reuses `success` but callers should extend
 * the duration for the celebratory register.
 */
export function intensityToSpring(
  level: InteractionIntensityLevel,
): Readonly<{ damping: number; stiffness: number; mass: number }> | null {
  switch (level) {
    case InteractionIntensity.S0:
      return null;
    case InteractionIntensity.S1:
      return Motion.spring.tap;
    case InteractionIntensity.S2:
      return Motion.spring.press;
    case InteractionIntensity.S3:
      return Motion.spring.success;
    case InteractionIntensity.S4:
      return Motion.spring.success;
    default:
      return null;
  }
}

/**
 * Editor interaction → intensity mapping. Ties editor gestures to the S0–S4
 * hierarchy so motion and haptics are selected from one contract.
 */
export const editorInteractionIntensity = {
  filterChipToggle: InteractionIntensity.S0,
  sortChange: InteractionIntensity.S0,
  likeSave: InteractionIntensity.S1,
  addToCollection: InteractionIntensity.S1,
  confirmSelection: InteractionIntensity.S2,
  send: InteractionIntensity.S2,
  layerAdd: InteractionIntensity.S2,
  layerSelect: InteractionIntensity.S2,
  snapToGuide: InteractionIntensity.S2,
  zOrderChange: InteractionIntensity.S2,
  deleteLayer: InteractionIntensity.S3,
  publishLook: InteractionIntensity.S3,
  publishPoster: InteractionIntensity.S3,
  firstPublish: InteractionIntensity.S4,
} as const;
