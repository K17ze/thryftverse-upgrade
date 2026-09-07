# Task 1B Report — Real crop in listings + real progress in the studio UI

Status: **DONE**
Branch: `feat/product-detail-contract-media-device-closure` (changes left uncommitted in working tree)
Owner files touched: `frontend/src/components/listing/ListingMediaStudio.tsx`, `frontend/src/creator/CreatorCropSheet.tsx`, deleted `frontend/src/creator/surfaces/InCanvasCropOverlay.tsx`.

## 1. Flip added to CreatorCropSheet

- Added `flippedH` / `flippedV` toggle state and `handleFlipH` / `handleFlipV` handlers (`haptic.selection()` + toggle).
- Two icon toggle buttons (`swap-horizontal-outline` / `swap-vertical-outline`) added to the crop-mode action row next to Rotate. 44pt targets, icon-only visible shape, `accessibilityState.selected` + brand-tinted glyph when active.
- Preview honesty: `imageStyle` now composes `scaleX` / `scaleY` (-1 when flipped) with the existing rotate transform — cheap, no animation, per brief.
- Pipeline order in `handleCrop` is **flip → crop → rotate**: flip is applied first so the crop rect (defined in source-image space, matching the mirrored preview) selects what the user actually sees; rotate stays last, preserving the existing semantics. This also fixed the pre-existing `actions: any[]` → typed `Action[]` (no `any`).
- Completion contract unchanged: `onCropComplete(newUri, width, height)` then `onClose()`.

## 2. CreatorCropSheet opened from ListingMediaStudio

- Cover "Edit" button now opens `CreatorCropSheet` for the cover image (`cropSheetOpen` state). The inline rotate/flip toolbar, `applyTransform`, `transformOpen`/`transformBusy` state, and the `transformBar`/`transformBtn`/`transformBtnText` styles are deleted, along with the now-unused `ActivityIndicator`, `rotateImage`, `flipImage`, `cropImage`, `MediaTransformResult` imports and the pre-existing unused `UploadQueueItemState` import.
- Guard preserved and centralized in `canEditCover`: `onTransformItem` present, cover exists, not a video, status not failed/cancelled, and URI is local (`file://` / `content://`) — same guard the inline toolbar had.
- `onCropComplete` → `handleCropComplete` calls the existing host contract `onTransformItem(coverItem.id, newUri)` + `haptic.success()`, then the sheet closes itself. Close without completing changes nothing.
- Accessibility label updated to the new meaning: `"Crop cover photo"` (was `"Edit photo"` / `"Close edit tools"` toggle).
- **Import direction decision:** grep found precedent — `components/listing/ListingCameraSheet.tsx` already imports `CreatorCamera` from `creator/`, and `components/poster/*` imports `CreatorCamera`/`composition`. So `CreatorCropSheet` is imported directly (`import { CreatorCropSheet } from '../../creator/CreatorCropSheet'`). The sheet is mounted conditionally (`{cropSheetOpen && <CreatorCropSheet visible …>}`) at the root of the component tree — same mounting pattern as the existing consumers in `PosterComposerScreen` and `LookComposerScreen`, which also gives a fresh crop session (rotation/flip reset) per open.

## 3. Dead InCanvasCropOverlay deleted

- Grep across the whole repo: all references were inside `frontend/src/creator/surfaces/InCanvasCropOverlay.tsx` itself — **zero importers**. Deleted via `git rm`. Remaining hits are docs only (`.flagship/` briefs/reports, a historical docs report). No barrel file referenced it.

## 4. Real byte progress in the studio overlay

- `STATUS_PROGRESS` hardcoded map deleted (zero references remain in source).
- New `getItemProgress(item, queueItems)` helper threads the Wave-1A `UploadQueueItem.progress` (0-1, real transmitted bytes) into both `UploadProgressOverlay` call sites (thumb + cover).
- `UploadProgressOverlay` now takes `progress: number`:
  - `uploading`: thin determinate bar chases real byte progress (`withTiming` fast, so ~10/s queue emits render as one smooth bar). Cover variant additionally shows the real percentage text; thumb variant stays bar-only (no % text at 80px).
  - `preparing`: no bytes yet — subtle indeterminate bar sweep (0.3→0.65 width, `withRepeat`), **no fabricated number**. Reduced motion: no fill; the label carries the state.
  - `pending`: queued label only — bar hidden entirely.
  - `uploaded` / `failed` / `cancelled`: unchanged (existing badge/overlays; overlay still returns null for non-active statuses).
  - The overlay pulse effect is now status-driven only, split from the progress-chase effect, so byte ticks (~10/s) never restart the opacity pulse. Reduced-motion behavior preserved.

## Constraints check

- TypeScript strict, no `any` (removed the one `any[]` in touched code), no new dependencies.
- `ListingMediaStudio.tsx`: 1142 → **1106 lines** (smaller; toolbar + STATUS_PROGRESS deletion offsets additions). Not restructured.
- Untouched: services/mediaUpload*.ts, hooks/*, UploadManager, SortablePhotoStrip, SellScreen/EditListingScreen, useProfileMediaUpload.
- Design tokens / conventions kept: Space/Radius/Stroke/TypographyV2, `useHaptic`, Motion tokens, no emoji, no verbose copy.

## Verification

1. `npm run typecheck` — **pass** (exit 0).
2. Scoped eslint on both touched files — **pass** (0 errors; 58 warnings, all pre-existing classes verified against HEAD: i18next literal strings, a11y-hint, max-lines, exhaustive-deps, and two unused imports that existed at HEAD — one of which, `UploadQueueItemState`, was cleaned since its import line was already being rewritten).
3. `npm test` (vitest) — **7 failed | 1729 passed | 2 skipped**, exactly the pre-existing baseline: 6 in `groupChatInfoParity.test.tsx` + 1 in `pricingDisplayModes.test.ts` (chat-screen string assertions and a pricing-copy snapshot — unrelated to media/upload). No new failures.
4. Grep: zero `InCanvasCropOverlay` and zero `STATUS_PROGRESS` references remain in `frontend/src`.

## Notes / concerns

- None blocking. Minor observation: `CreatorCropSheet`'s crop frame does not rotate with the preview image (pre-existing quirk, out of scope); flip was made honest within the existing crop-rect-in-image-space semantics.
