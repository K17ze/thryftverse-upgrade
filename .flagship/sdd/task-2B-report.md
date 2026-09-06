# Task 2B Report — Straighten + undo-safety in CreatorCropSheet

Status: DONE
Owner file: `frontend/src/creator/CreatorCropSheet.tsx` (only file touched; +50 lines net, 898 → 948)

## 1. Straighten

**Control** — `CreatorSlider` (the repo's existing primitive, `creator/controls/CreatorSlider.tsx`)
in a new action row below the rotate/flip/ratio row, crop mode only:
`min={-10} max={10} step={0.5} neutral={0}`, with `hapticAtNeutral` (selection tick when the
drag crosses 0) and `showNeutralTick` (2pt brand tick at zero while adjusted). No numeric
degree readout is rendered — screen readers get the value via the slider's built-in
`accessibilityValue`. Reset-to-zero affordance: a small 18pt `arrow-undo-outline` glyph
(32×32 visible, 44pt target via hitSlop) at the row's end, dimmed at 35% and disabled when
the angle is already 0 — matches the sheet's icon-button grammar, no layout shift.

**Live preview** — the preview image transform gains a second rotation entry
(`{ rotate: ${straighten}deg }` after the 90° rotate, before the flip scales), so the
composition order on screen is rotate90 → straighten → flip, mirroring the confirm pipeline
(flip → straighten-rotate → crop → rotate90; rotations commute, flips apply first in the
transform list exactly as they do in the action list). Pure React state drives it — no
`manipulateAsync` during drag.

**Confirm math (single `manipulateAsync` pass)** — actions: `[flip H?, flip V?, rotate θ,
crop(inscribed), rotate 90k?]`. expo-image-manipulator's `rotate` accepts arbitrary degrees
and expands the canvas to the rotated bounding box; the subsequent `crop` operates on that
rotated canvas, so the whole pipeline stays a **single `manipulateAsync` call** — the brief's
two-pass fallback was not needed. No changes to `mediaTransforms.ts`; the math lives in the
sheet as a module-level pure helper.

### Inscribed-rect formula

Largest axis-aligned rectangle of aspect `a = w/h` inscribed in a `W×H` source rotated by θ
(about its center; the rotated canvas shares the same center):

```
height = min( W / (a·cosθ + |sinθ|),  H / (a·|sinθ| + cosθ) )
width  = a · height
```

Derivation: a centered candidate with half-height `y` (half-width `a·y`) is inside the rotated
source iff its corners clear both edge pairs of the rotated rectangle. The rotated source's
right edge is the line `cosθ·X + sinθ·Y = W/2` and its bottom edge is
`|sinθ·X − cosθ·Y| ≤ H/2` (rotation preserves the dot product with the edge normal). The
worst corners give `y ≤ W / (2·(a·cosθ + sinθ))` and `y ≤ H / (2·(a·sinθ + cosθ))`;
`y* = min` of the two, `height = 2y*`, `width = a·height`. `|sinθ|` because the geometry
mirrors for negative angles (cos is even). Sanity check at θ=0 it collapses to the familiar
`min(W/a, H)`; at θ=90° it correctly returns the max rect of aspect `a` in the transposed
canvas. The crop origin centers the rect in the rotated bounding box
(`(W'−w)/2, (H'−h)/2` with `W' = W·cosθ + H·|sinθ|`, `H' = W·|sinθ| + H·cosθ`), clamped at 0.

**Worked example (W=1200, H=1600, θ=5°, aspect 4:5 → a=0.8):**
- cos5° = 0.996195, sin5° = 0.087156
- Constraint A (width-bound): 1200 / (0.8×0.996195 + 0.087156) = 1200 / 0.884112 = **1357.28**
- Constraint B (height-bound): 1600 / (0.8×0.087156 + 0.996195) = 1600 / 1.065920 = 1501.08
- height = min = **1357.28**, width = 0.8 × 1357.28 = **1085.82** (both ≤ source dims ✓, ratio 0.8 ✓)
- Rotated canvas: W' = 1200×0.996195 + 1600×0.087156 = 1334.88; H' = 1200×0.087156 + 1600×0.996195 = 1698.50
- Crop origin: (round(1334.88−1085.82)/2, round(1698.50−1357.28)/2) ≈ **(125, 171)**, size **1086×1357**

**angle = 0 path** — verified bit-identical to the pre-task pipeline: the straighten branch is
guarded by `straighten !== 0`, so actions remain exactly `[flip?, crop(userRect), rotate90?]`
in a single `manipulateAsync` — no rotate, no inscribed recompute, same rounding as before.

**Composition note (honest scope)** — straighten composes in ONE `manipulateAsync` pass
(flip → rotate θ → crop inscribed → rotate 90k); the two-pass fallback was not needed because
the crop operates on the rotated canvas per the brief's model. Trade-off to be aware of:
while θ ≠ 0 the output framing is the **centered** max-inscribed rect of the current crop
aspect — the user's crop offset/zoom contributes its aspect ratio only (the only correct
no-empty-corners option under expand-canvas rotation without content-aware fill). The preview
matches this exactly: while straightening, the crop frame + dim overlays render the inscribed
rect (driven directly, no spring, in lockstep), and drag/pinch are suspended
(`.enabled(straighten === 0)` on both gestures) since the frame is owned by the math; the
user's rect is restored (spring settle) the moment the angle returns to 0. Reframing flow:
zero the slider → drag/pinch → re-straighten (aspect is preserved).

## 2. Reversibility

- Rotate still cycles 0/90/180/270 (…360) — toggleable back; verified.
- Flip H/V remain toggles (post-Wave-1B) — verified.
- New **Reset** action in the footer (`Cancel | Reset | Done`, matching the footer pill
  grammar): one `haptic.light()`, restores original image rect (no crop offset), ratio null
  (+ underline indicator re-anchored to the Original tab), angle 0, flips off, focal center.
- No undo stack/history built, per brief. Cancel-safety unchanged (closing without Done
  mutates nothing; focal-mode Done still just closes).

## 3. Copy cleanup

- Removed the raw numeric focal readout (`"Focal point: 58%, 42%"`) — the reticle is the
  interface; Auto/Center buttons remain.
- Also stripped the rotate button's raw `{rotation}°` label (the other machine readout in the
  sheet): the rotate button is now icon-only with brand-color active state, exactly matching
  the flip buttons' grammar. Current angle remains announced to screen readers via the
  existing `accessibilityLabel` ("Rotate 90 degrees"). The new slider adds no readout.
- Dead styles removed (`rotateLabel`, `focalReadout`); no other machine readouts existed.

## Verification

- `npm run typecheck` — **clean** (one transient error in `FocalImage.tsx`, owned by the
  parallel task, appeared mid-run and was gone on retry; one real error found and fixed in
  my file: `SimultaneousGesture` has no `.enabled()` in this RNGH typing — enabled the source
  Pan/Pinch gestures instead).
- `npx eslint src/creator/CreatorCropSheet.tsx` — **0 errors**, 17 warnings, all pre-existing
  baseline (unused `withSequence`/`cancelAnimation` imports, max-lines-per-function, one
  exhaustive-deps on the untouched entrance effect, legacy a11y-hint warnings). My two new
  controls carry label+hint+role and add no new warnings.
- `npm test` — **7 failed / 1729 passed / 2 skipped**, exactly the documented pre-existing
  baseline: `groupChatInfoParity.test.tsx` (6) and `pricingDisplayModes.test.ts` (1) — chat
  parity and pricing snapshots, unrelated to this file.

---

## Follow-up: focal re-normalization on crop completion (Wave 2A contract gap)

**Gap** — Wave 2A wired focal persistence through the host (`onTransformItem(itemId, uri,
focalPoint)`), but the sheet emitted no focal on completion: a user who set a focal and then
cropped in the same session kept a focal that was valid 0-1 but off-target relative to the
cropped output.

**Fix** (CreatorCropSheet.tsx only) — the completion path now maps the stored focal through
the exact pipeline it applies and emits the re-normalized result via the existing contract
(`onFocalPointChange?.(finalFocal)`) immediately before `onCropComplete(...)`, so the host
persists the final focal with the crop. Focal-mode Done still just closes (no crop → no
emit). `handleCrop` now extracts the actually-applied crop geometry (`appliedCrop` — the
rounded rect, i.e. what really runs) and passes it to a pure module-level helper.

**Math** (`mapFocalToOutput`, in pipeline order):
1. **Flip** (applied first in the action list): `fx → 1 − fx` if flippedH, `fy → 1 − fy` if
   flippedV — the feature's position in the mirrored canvas, over which the source-space
   crop rect then selects.
2. **Crop**:
   - θ = 0 (user rect in source px): `fx' = (fx·W − originX) / width`,
     `fy' = (fy·H − originY) / height` — the formula from the task brief.
   - θ ≠ 0 (centered inscribed rect in the rotated canvas): the feature is rotated about
     the source center with the **signed** θ (`u·cosθ − v·sinθ + W'/2`,
     `u·sinθ + v·cosθ + H'/2`, where `W'/H'` are the straightened canvas dims from the
     inscribed-rect section above), then mapped through the inscribed rect
     (`(px' − originX) / width` etc.). Signed sinθ matters here — canvas *dimensions* use
     |sinθ| (bounding box is mirror-symmetric) but feature *positions* follow the actual
     rotation direction.
3. **Rotate 90°k** (trailing, clockwise, y-down — same convention as expo's `rotate` and
   the preview transform): k=1 → `(1 − fy, fx)`, k=2 → `(1 − fx, 1 − fy)`,
   k=3 → `(fy, 1 − fx)` (`rotatePoint90` helper).
4. **Clamp to [0,1]** — a focal that falls outside the cropped region (e.g. near a source
   edge that the inscribed rect trims) lands on the output edge rather than escaping 0-1.

**Numeric checks** (helper exercised in isolation, W=1200 H=1600):
- No edits, full-image crop: (0.25, 0.75) → (0.25, 0.75) — identity ✓
- Crop (100, 200, 600, 800), focal (0.25, 0.5) → ((300−100)/600, (800−200)/800) = (1/3, 0.75) ✓
- Same crop + rotate 90° CW → (1 − 0.75, 1/3) = (0.25, 1/3) ✓
- Flip H then crop: feature 0.25 mirrors to 0.75 → (900−100)/600 = 1.33 → clamped to 1 ✓
- Straighten 5°, full-image crop (inscribed 1086×1357 @ (125,171) in the 1334.88×1698.50
  canvas): center focal → (0.4995, 0.4998) — center stays center (sub-pixel rounding) ✓
- Straighten ±5°, focal (0,0): (+5°) → (0.0133, 0), (−5°) → (0, 0) — correct mirror-symmetric
  behavior, confirming the signed-θ handling ✓

**Verification** — `npm run typecheck` clean; `npx eslint src/creator/CreatorCropSheet.tsx`
0 errors / 17 warnings (same pre-existing baseline set, shifted line numbers only);
`npm test` 7 failed / 1729 passed / 2 skipped — the documented pre-existing unrelated
baseline (`groupChatInfoParity` 6, `pricingDisplayModes` 1).

---

## Fix round 2 — adversarial review findings

### BUG 1 (preview ≠ output) — PARTIALLY REJECTED with evidence; frame part FIXED

**The proposed transform reorder is factually wrong for this stack and was NOT applied.**
The claim "RN applies transforms left-to-right so flip runs LAST" is incorrect for RN 0.86.2
+ Reanimated 4.5.1 (both verified in the installed sources):

- `ReactCommon/react/renderer/graphics/Transform.cpp` `operator*` computes
  `result[i][j] = Σ_k rhs[i][k]·lhs[k][j]` — i.e. `A * B = B × lhs` in standard algebra
  (lines 402-433).
- `BaseViewProps::resolveTransform` folds the JS array left-to-right with that operator
  (BaseViewProps.cpp:607-610), yielding `M = op_n × … × op_1` (standard algebra).
- Matrices are row-major with translation in the last row (`Transform::Translate` writes
  matrix[12..14]) → row-vector point application `p' = p · M` → the **last array entry is
  applied to the point first** (CSS semantics). Reanimated 4.5 passes transform arrays
  through to Fabric unchanged (`src/updateProps/updateProps.ts` → `processTransform` only
  parses strings; arrays flow into the same Fabric fold).
- Mechanical simulation of the exact C++ semantics (view 100×100, origin center):
  `[rotate90, flipH]` maps the top-left corner to (100,100) = bottom-right → flips apply
  FIRST, matching the output pipeline. `[flipH, rotate90]` maps it to (0,0) — the proposed
  reorder would produce exactly the reported preview≠output symptom.

Parity check with the shipped order (source top-left feature, flip-H + rotate 90° CW):
preview position (100,100) = output focal (1,1) — **preview = output**. The current order
`[rotate(rotation), rotate(straighten), scaleX, scaleY]` is correct and now carries a
comment citing the evidence so it is not "fixed" again in the wrong direction.

**Frame overlay part — valid, FIXED.** Derived where the cropped region actually appears on
screen: the output crops rect `R_crop` from the canvas the crop action runs on (the flipped
canvas when θ=0, the straightened canvas when θ≠0); mapping that region forward through the
preview transform, the flip and the straighten cancel against the rect's defining canvas, so
the region displays at **R(rotation) only** (about the container center). Verified
concretely: source 100×100, crop = left half, flip-H, rotate 90° CW → output = the source's
right half rotated 90°; on screen that content occupies the top half; the frame inside a
`rotate(rotation)`-only wrapper at local rect (0,0,50,100) renders exactly there (an
unrotated frame would show the left half — the reported bug; a flip-included transform would
show the bottom half — also wrong).

**Fix**: the crop-mode overlay (dim strips + crop frame + grid + handles) is now wrapped in
`<Reanimated.View style={[StyleSheet.absoluteFill, cropOverlayStyle]} pointerEvents="box-none">`
with `cropOverlayStyle = transform: [{ rotate: rotateSV deg }]` — spring-synced with the
image rotation. No gesture math changes were needed: RNGH inverse-maps touch events into the
handler view's coordinate space (verified: `GestureHandlerOrchestrator.transformEventToViewCoords`
inverts each ancestor matrix, Android; UIKit `locationInView` is inherently local, iOS), so
drag/pinch translations arrive in the rotated local (= source-scaled) space and the frame
tracks the finger exactly. Zero visual change in the identity case (transform = identity).

### BUG 2 (focal coordinate space) — valid; FIXED structurally

`handleFocalTap` stored `locationX/displayW` from a tap surface in *container* space, while
`mapFocalToOutput` expects *source* space — wrong under any active transform. Fix: the
focal tap surface (Pressable + reticle) now lives **inside a wrapper carrying the full
preview transform** (`imageStyle`). RN's touch resolution is transform-aware (verified:
Android `TouchTargetHelper.getChildPoint` inverts each view's matrix "to find the true local
points"; iOS uses UIKit `locationInView`), so `locationX/Y` arrive already inverse-mapped
into the wrapper's local = **source** space — the existing `locationX/displayW` math now
stores the canonical SOURCE-space focal with no duplicated transform math, and the reticle
(positioned at source coords inside the same wrapper) renders at the transformed position of
the content feature automatically. The completion path is unchanged: `mapFocalToOutput`
consumes the source-space focal and emits the OUTPUT-space point via `onFocalPointChange`
before `onCropComplete` (host persists focal consistent with the output image). One
canonical internal space (source); in-session emits are source-space (the item's current
image is the source until confirm), the completion emit is output-space.

**Worked example (true mapping, documented per the reviewer's option B)** — flip-H + rotate
90° CW, 100×100 source, full-image crop, tap at display top-left (0,0):
- Inverse of the preview transform (un-rotate −90°, un-flip H) maps the tap to source
  **(1, 1) = bottom-right** (not bottom-left — that intermediate came from the rejected
  order premise).
- Forward check: the stored focal displays at (0,0) — exactly the tap ✓.
- Output: `mapFocalToOutput` → flip (1,1)→(0,1) → crop full → rotate 90° CW (1−fy, fx) →
  **(0,0) = output top-left**.
- Preview position of the stored focal = display top-left = output position ✓ preview = output.
- Parity check: source top-left feature → preview (100,100) / output (1,1) — identical ✓
  (the reviewer's "top-left in preview, bottom-right in output" symptom does not occur; it
  is the signature of the reorder they proposed).

### HONESTY (finding 18) — fixed

Removed the "Auto" (Auto-detect focal point) button and its `handleAutoDetectFocal` — it
only set (0.5, 0.5) while implying subject detection that does not exist. The focal-mode row
now carries only the honest "Center" reset (the reticle defaults to center). No fake
detection was added.

### Verification

- `npm run typecheck` — clean.
- `npx eslint src/creator/CreatorCropSheet.tsx` — 0 errors, 16 warnings (one BELOW the
  17-warning baseline: removing the Auto button removed its a11y-hint warning; all remaining
  are the pre-existing set).
- `npm test` — 7 failed / 1730 passed / 2 skipped: the documented pre-existing unrelated
  baseline (`groupChatInfoParity` 6, `pricingDisplayModes` 1; total test count +1 from
  concurrent work on other files).
- Numeric checks: tap→source→output worked example (above) and the preview/output parity
  check for the flip+rotate case both pass against the shipped helper code.
