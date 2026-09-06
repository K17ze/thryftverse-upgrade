# Task 2B Brief — Straighten + undo-safety in CreatorCropSheet

Repo: C:\Users\User\Desktop\thryftverse-upgrade. React Native + Expo ~57, expo-image-manipulator ~57, TS strict.

## Mission

The crop sheet is the app's primary photo editor but lacks straighten (no angle
correction exists anywhere in the repo) and has no recovery path for accidental
edits. Add a straighten control and make every in-sheet transform reversible.

## Context (read first)

- frontend/src/creator/CreatorCropSheet.tsx (post-Wave-1B, ~800 lines) — gesture crop
  frame (drag/pinch), aspect presets, rotate 90°, flip (added in Wave 1B), focal
  point, `manipulateAsync` completion (~303-322 area). Read the WHOLE file first —
  Wave 1B changed it (flip baked into the manipulate pipeline as flip→crop→rotate).
- frontend/src/platform/media/mediaTransforms.ts — rotateImage/flipImage/cropImage.
  expo-image-manipulator's `rotate` accepts arbitrary degrees and expands the canvas;
  `crop` then operates on the rotated canvas.
- The sheet's preview is a spring-animated crop frame over the image — understand the
  shared-value model before touching it.

## Implementation

### 1. Straighten

- Add a straighten control: a horizontal slider (-10°..+10°, step 0.5) in the sheet's
  action area, using the repo's existing slider primitive if one fits the sheet's
  visual grammar (check creator/controls/CreatorSlider.tsx — prefer it over a raw RN
  Slider). Reset-to-zero affordance on the slider (double-tap or a small reset glyph —
  match the sheet's existing control grammar).
- Preview: rotate the preview image by the angle (transform rotate) LIVE as the
  slider moves — no manipulateAsync calls during drag.
- On confirm, apply: `manipulateAsync(uri, [{ rotate: angle }, { crop: largestRect }],
  ...)` where largestRect is the largest axis-aligned rectangle of the CURRENT crop
  aspect ratio inscribed in the rotated canvas. Compute it with the standard inscribed-
  rectangle math (for rotation θ and source W×H: the max rect with aspect a has
  width = min over constraints — derive it correctly; document the formula in the
  report). If angle is 0, skip the rotate+crop entirely (bit-identical path to today).
- Straighten composes with the existing pipeline order (flip→crop→rotate). Define the
  final order as flip→straighten-rotate→crop and make the preview match it exactly.
  If composing straighten with a non-null crop rect changes the math, simplify
  honestly: apply straighten as its own manipulate pass BEFORE the crop pass (two
  manipulateAsync calls on confirm) — correctness over cleverness, and note it.

### 2. Reversibility (undo-lite, honest scope)

- Every toggle control (rotate, flip H/V) must be toggleable back — verify rotate
  currently cycles 0/90/180/270 (it does) and flip toggles (it does post-1B).
- Add a single "Reset" action that returns the sheet to its initial state (original
  image, no crop offset, ratio null, angle 0, flips off, focal center) with a light
  haptic. Place it per the sheet's existing action-row grammar.
- The sheet remains cancel-safe: closing without confirm changes nothing (existing).
- Do NOT build an undo stack/history — a reset + toggles + cancel covers the flows.

### 3. Copy cleanup (small, in-scope)

- Remove the raw numeric focal readout ("Focal point: 58%, 42%") — the reticle is the
  interface. If the sheet shows any other machine readouts, strip them too.

## Constraints

- TS strict, no `any`, no new deps. Use existing tokens (Space/Radius/Stroke/
  TypographyV2), useHaptic, Motion tokens, reduced-motion hooks as the file does.
- Do NOT touch ListingMediaStudio, SortablePhotoStrip, FocalImage (parallel task owns
  those), mediaTransforms.ts (add nothing there unless a pure helper is unavoidable —
  prefer keeping math inside the sheet), services, hooks, screens.
- Keep the file's size roughly neutral; no new abstraction layers.

## Verification

1. npm run typecheck; scoped eslint; npm test (baseline 7 pre-existing unrelated).
2. Document in the report: the inscribed-rect formula and a worked example (W=1200,
   H=1600, θ=5°, aspect 4:5), and confirm angle=0 skips all manipulation.

## Report

Append to .flagship/sdd/task-2B-report.md; return ONLY status, one-line test summary, concerns.
