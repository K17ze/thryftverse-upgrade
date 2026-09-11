# Task 1 Brief — Rebuild CreatorCropSheet as a full-screen direct-manipulation crop stage

## Context

You are upgrading the photo crop editor of a React Native (Expo SDK 57, RN 0.81+) marketplace app. The current `CreatorCropSheet` is a bottom-sheet-style overlay where the user configures a crop frame and taps "Done" to apply. The product owner rejected it as "pure bot-made": too much chrome, an explicit configure-then-apply boundary, a Crop/Focal mode toggle, and a cramped preview.

The competitor standard (iOS Photos, VSCO, Lightroom Mobile, Instagram — verified 2026) is a **full-screen direct-manipulation stage**: the image fills a dark canvas, the crop frame is overlaid live, the user drags corners / pans / pinches directly, ratio presets sit in a compact bottom row, and a single Done commits. Research source: Apple HIG, VSCO Adjust docs, Lightroom mobile docs (all accessed 2026-06).

## Your job

Rewrite `frontend/src/creator/CreatorCropSheet.tsx` as a full-screen crop stage. The file is currently 1,156 lines. Target ≤ 650 lines. Factor sub-components into the same file (or `frontend/src/creator/crop/` if a piece exceeds ~200 lines): the geometry math MUST be preserved exactly.

## PRESERVE EXACTLY (do not touch the math)

The existing transform pipeline is verified correct against RN 0.86 transform semantics and expo-image-manipulator semantics. Copy these functions verbatim from the current file (lines 41–120):
- `ASPECT_PRESETS` (you may trim the preset list — see below)
- `largestInscribedRect`
- `rotatePoint90`
- `mapFocalToOutput`
- The `imageStyle` transform composition comment and order (flip → straighten-rotate → trailing 90° rotate; RN composes last-entry-first — the comment at lines 568–582 explains why; keep that comment)
- The `handleCrop` confirm pipeline order: flips → rotate(straighten) → crop → rotate(90°k) → focal mapping (lines 441–517)
- The gesture math for pan/pinch of the crop frame (lines 288–366), including the cropOverlayStyle rotation trick (lines 584–592)

## New interaction model

1. **Full-screen stage, not a sheet.** When `visible`, render an absolute-fill view with `colors.background` (near-black in dark, white in light — use `colors.background`). No bottom-sheet chrome, no drag handle, no title row with a centered mode toggle.
2. **Top bar** (safe-area aware): close (X) icon button left; "Reset" text button appears only when state is dirty (any of ratio/rotation/flips/straighten/focal/crop-rect differs from open state); "Done" primary pill button right (brand background, textInverse label). While processing, Done shows a small ActivityIndicator and disables.
3. **Media area**: the image centered, fit within the stage minus top bar and bottom controls. The existing live transform preview (flip → straighten → 90° steps) applies. Outside-crop dimming: 4 overlay views around the crop rect (keep existing approach), using `rgba(0,0,0,0.55)`.
4. **Crop frame**: 4 corner handles (L-shaped strokes, 2pt, white/scrimTextPrimary, 44pt hit targets via hitSlop — visible glyph ~20pt), hairline border, rule-of-thirds grid that is INVISIBLE at rest and fades to 0.35 opacity only while a gesture is active (pan/pinch/straighten-drag), fades out 400ms after gesture end. Remove the always-on grid.
5. **Focal point**: REMOVE the Crop/Focal mode toggle entirely. Instead: a small focal reticle (double-ring, 20pt visible) rendered inside the crop frame, draggable via its own pan gesture (conflict-resolve: focal drag wins when touch starts within 24pt of the reticle; otherwise the crop frame pan takes it). Tap-to-set on the image also moves it. The reticle uses `colors.brand` when draggable-active. Keep `onFocalPointChange` semantics identical (emitted before onCropComplete).
6. **Ratio presets**: one horizontal chip row directly under the media: `Original · 1:1 · 4:5 · 3:4 · 9:16 · 16:9` (drop 2:3 and 3:4 to reduce noise — Original, 1:1, 4:5, 3:4, 9:16, 16:9). Selected chip: filled `colors.surfaceElevated` background + textPrimary text; unselected: transparent + scrimTextSecondary. No animated underline indicator — delete that machinery (ratioTabLayouts, ratioUnderlineXSV/WSV, ratioUnderlineStyle).
7. **Tool row** (single row, below ratios): rotate-90 (icon), flip-H, flip-V, straighten toggle (icon `construct-outline` or similar — when active, shows the straighten slider row and hides nothing else). Active/selected tools tint `colors.brand`. Straighten slider row appears only when the straighten tool is active; it shows a live numeric readout (`${value.toFixed(1)}°`) that the user can read while sliding; pan/pinch crop gestures REMAIN ENABLED while straightening (remove the `.enabled(straighten === 0)` disabling).
8. **Stage background**: `colors.background` (near-black dark / white light). The image letterboxes centered. No `colors.surface` sheet panel at all.
9. **Entrance**: fade+scale-in 220ms (opacity 0→1, scale 0.98→1) on the whole stage; backdrop is unnecessary (full-screen). Respect `useReducedMotion` (instant).
10. **Processing**: on Done, dim the stage slightly and show a centered small spinner; keep the composed preview visible (never blank).

## Constraints (AGENTS.md binding)

- No emojis as icons. One icon family (AppIcon / Ionicons) per region.
- Max two radius sizes in the viewport (chips Radius.sm/md; stage is full-bleed).
- 44pt hit targets; visible glyphs 20–24pt.
- No coaching copy, no labels explaining the obvious, no badges.
- All user-visible strings via `t()` from `useAppTranslation` — check the `creator`/`listing` namespaces in `frontend/src/i18n/locales/en.json` for existing keys; add missing keys under `creator.crop.*` (e.g. `done`, `reset`, `cancel`, `straighten`, `rotate`, `flipHorizontal`, `flipVertical`, `focal`). English values: Done, Reset, Cancel, Straighten, Rotate, Flip, Focal point. Do NOT rewrite the whole en.json — surgical edit only (the file has been corrupted before by whole-file rewrites; use a targeted node script or the edit tool on the JSON text).
- Typecheck + ESLint must pass: `cd frontend && node ./node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` and `node ./node_modules/eslint/bin/eslint.js src/creator/CreatorCropSheet.tsx`.
- Keep the exported component name and props interface EXACTLY: `CreatorCropSheet({ visible, imageUri, onClose, onCropComplete, focalPoint?, onFocalPointChange? })`. Consumers (ListingMediaStudio) must not need changes.
- Do not touch any other file except `frontend/src/i18n/locales/en.json` (surgical key additions) and the new optional `frontend/src/creator/crop/` directory.

## Acceptance tests

1. `npx tsc --noEmit` passes (whole repo — pre-existing errors in TradeConfirmScreen.tsx are baseline; your file must add none).
2. ESLint on the file: 0 errors.
3. The component renders nothing when `visible=false` and unmounts cleanly.
4. Gesture math: crop frame drag clamps inside image bounds; pinch keeps aspect when a ratio is locked; straighten ±10° in 0.5° steps with haptic on 0-crossing (existing behavior — preserve).
5. `handleCrop` output pipeline unchanged: flips → straighten-rotate → crop → rotate-90k, focal mapped via mapFocalToOutput.

## Report

Write your full report to `.flagship/sdd/task-1-report.md` (what you built, decisions, test evidence with command output). Return only: status (DONE/DONE_WITH_CONCERNS/NEEDS_CONTEXT/BLOCKED), files changed, one-line test summary, concerns.
