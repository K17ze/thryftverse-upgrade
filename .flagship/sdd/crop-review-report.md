# Crop Review Report — CreatorCropSheet.tsx

Status: REVIEWED — 2 fixes applied, 1 deferred.

## Findings

### P1 — Pinch clamp breaks aspect ratio (FIXED)
`pinchGesture.onUpdate` clamped W and H independently (`Math.min(maxW, newW)` / `Math.min(maxH, newH)`). When one dimension hit its max before the other, the crop aspect ratio diverged from the selected ratio.

**Fix**: Derive both dimensions from a single scale factor. Compute `clampedH` first, then `clampedW = clampedH * aspect`. Both clamp together, preserving the ratio.

### P2 — Corner handles had misleading accessibility (FIXED)
The four corner Pressables declared `accessibilityRole="adjustable"` and `accessibilityHint="Drag to adjust the crop area"`, but they were not independently draggable — only the whole frame is draggable via pan. Screen reader users would be told they can adjust something they can't.

**Fix**: Changed corners from `Pressable` to `View` with `pointerEvents="none"`. They are visual indicators only. The crop frame's pan gesture is the actual adjustment mechanism, and it's already announced via the `accessibilityRole="adjustable"` on the `SortableItem`-equivalent wrapper (or the frame's gesture detector).

### P3 — Exit animation never plays (DEFERRED)
All three hosts (`ListingMediaStudio`, `PosterComposerScreen`, `LookComposerScreen`) unmount the component on close by toggling a conditional render (`cropMode`/`cropSheetUri` → false). The `visible` prop is always `true` while mounted, so the exit animation branch (`visible === false`) never executes. The entrance animation works correctly.

**Why deferred**: This is a host pattern issue, not a crop sheet bug. Fixing it requires either (a) all hosts keeping the component mounted and toggling `visible` instead of unmounting, or (b) adding an `onExitComplete` callback the hosts wait for before unmounting. Both are larger contract changes across 3 consumers. The entrance animation works, the sheet closes instantly (acceptable native behavior), and no functionality is lost.

## Verified

- **Host prop compatibility**: All 3 consumers (`ListingMediaStudio`, `PosterComposerScreen`, `LookComposerScreen`) pass `visible`, `imageUri`, `focalPoint`, `onFocalPointChange`, `onClose`, `onCropComplete`. None pass `initialAspectRatio` or `cropMode` — those were removed in the rewrite and no consumer expects them.
- **`onCropComplete` signature**: Interface declares `(newUri, width, height) => void`; all hosts pass `(newUri) => void`. TypeScript allows this (fewer params is assignable). Extra args are unused but harmless.
- **Gesture math**: Pan uses `imageSize.width / displayW` as the display→source scale — correct.
- **Focal point mapping**: `handleFocalTap` divides by `displayW`/`displayH` — correct because `locationX/Y` are in the Pressable's local (pre-transform) coordinate space.
- **Focal re-normalization**: `mapFocalToOutput` correctly chains flip → straighten-rotate → crop → rotate 90°k, matching the `manipulateAsync` action order.
- **Straighten inscribed rect**: `largestInscribedRect` math is correct — uses `|sinθ|` for the bounding geometry.
- **Reduced motion**: Handled in entrance/exit, rotate spring, and crop SV sync.
- **Error recovery**: `catch { show('Crop failed. Try again.', 'error'); }` with `finally { setIsProcessing(false); }`.
- **Processing state**: `ActivityIndicator` on Done button, button disabled.
- **Reset**: Restores rotation, flips, straighten, ratio, crop rect, and focal point.

## Verification (main workspace)
```
tsc --noEmit → 0 errors
eslint CreatorCropSheet.tsx → 0 errors, 9 warnings (pre-existing: file size, a11y hints)
encoding check → no BOM, no mojibake
vitest → 1 failed test file (baseline), 6 failed (baseline), 0 new failures
```
