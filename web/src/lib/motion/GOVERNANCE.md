# Motion governance (web)

Port of the mobile motion contract (`frontend/src/theme/MOTION_GRAMMAR.md`,
`motionTokens.ts`, `motionPresets.ts`) for the web app. `MOTION` in
`tokens.ts` is the single source of truth for durations and easings.

## The rules

1. **Three tiers only.** `instant` (0), `micro` (~120ms), `deliberate`
   (~200–280ms). Nothing above 400ms except rare hero/page transitions.
2. **Motion as feedback, not decoration.** Only interactive state changes
   animate — press, toggle, sheet, tab, list reveal, media load. Static
   content never animates; mount animations are capped to one viewport
   (`MOTION.stagger.maxItems = 8`).
3. **Easing direction.** Entries ease out, exits ease in, state changes
   are symmetric. Never the reverse.
4. **Reduced motion collapses everything to instant.** The global
   `prefers-reduced-motion` block in `globals.css` owns this for CSS;
   `useReducedMotion()`/`prefersReducedMotion()` cover JS-driven motion.
   Do not add a second reduced-motion implementation.
5. **Use tokens, not magic numbers.** A new raw duration or bezier in a
   component is a bug unless the comment justifies the physics.

## What does NOT exist here (by explicit product decision)

- No confetti, lottie, particles, or celebration primitives.
- No CSS spring physics on web — timing functions only. The mobile spring
  table stays in `frontend/` for parity audits.
- No `InteractionIntensity.S4` primitive — the level exists for parity but
  there is no celebratory animation to back it; surfaces should treat S4
  as S3 until a designed moment exists.

## Existing utilities already in globals.css

`pressable` (120ms), `fade-in`, `sheet-enter`, `toast-enter`/
`toast-exit`, `media-zoom`, `skeleton` shimmer. These are
the sanctioned vocabulary — reach for them before adding new keyframes.
