# Task 1B Brief — Real crop in listings + real progress in the studio UI

Repo: C:\Users\User\Desktop\thryftverse-upgrade (branch feat/product-detail-contract-media-device-closure)
Stack: React Native + Expo (~57), TypeScript strict, expo-image, reanimated, vitest.

## Mission

Two defects die in this task:
1. Listing photos cannot be cropped — only rotate/flip via a small inline toolbar —
   while a full gesture-driven crop sheet (`CreatorCropSheet`) exists in the creator
   domain and a second crop implementation (`InCanvasCropOverlay`) is dead code.
2. The upload overlay shows INVENTED percentages (`STATUS_PROGRESS` hardcoded map)
   even though Wave 1A just added real byte progress (`UploadQueueItem.progress`, 0-1)
   to the queue.

## Context (read first)

- frontend/src/components/listing/ListingMediaStudio.tsx (1142 lines) — the listing
  media surface. Key areas: STATUS_PROGRESS map (~lines 40-57), UploadProgressOverlay
  (~125-193), inline transform toolbar (~325-353 and ~619-675), cover render (~515-676).
- frontend/src/creator/CreatorCropSheet.tsx (793 lines) — full-screen gesture crop
  sheet: aspect presets (line ~40), drag/pinch crop frame (~218-290), rotate (~292-300),
  focal point (~332-342), manipulator-based completion (~303-322). It has NO flip.
- frontend/src/platform/media/mediaTransforms.ts — `flipImage(uri, 'horizontal'|'vertical')`
  (~lines 125-136), `rotateImage`, `cropImage`. Reuse these; do not duplicate.
- frontend/src/services/mediaUploadQueue.ts — Wave 1A added `progress: number` (0-1,
  real transmitted bytes) to `UploadQueueItem`. Statuses unchanged:
  pending/preparing/uploading/uploaded/failed/cancelled.
- frontend/src/screens/SellScreen.tsx (~line 280) and EditListingScreen.tsx (~line 908)
  host ListingMediaStudio and pass `onTransformItem(itemId, transformedUri)`.

## Implementation

### 1. Add flip to CreatorCropSheet

- Add horizontal + vertical flip toggles to the sheet's action row (next to rotate).
  Track `flippedH`/`flippedV` booleans; apply via `flipImage` from mediaTransforms.ts
  in the same manipulate step as crop/rotate where the API allows, or as a chained
  manipulate call. Preview must reflect flip state (transform: scaleX/scaleY on the
  preview image — cheap and honest).
- Keep the existing completion contract: `onCropComplete(newUri, width, height)`.

### 2. Open the crop sheet from ListingMediaStudio

- The cover "Edit" button (currently toggling the inline transform bar) now opens
  `CreatorCropSheet` for the cover image instead. Remove the inline transform bar
  entirely (the rotate/flip buttons and `applyTransform` — the sheet supersedes it).
- On `onCropComplete`, call `onTransformItem(coverItem.id, newUri)` (existing host
  contract) and close the sheet. On close without completion, nothing changes.
- Only offer the Edit entry for local image URIs (file://, content://) — same guard
  the inline toolbar had (no videos, no remote-only items). Keep that logic.
- Import direction: check whether components/listing already imports from creator/
  anywhere (grep). If yes, import CreatorCropSheet directly. If no precedent, still
  import directly (it is a self-contained sheet component) and note the decision in
  your report. Render it at the root of ListingMediaStudio's tree.

### 3. Delete the dead crop implementation

- Confirm `InCanvasCropOverlay` has zero importers (grep the whole frontend/src).
- Delete frontend/src/creator/surfaces/InCanvasCropOverlay.tsx.
- If it has importers after all, STOP the deletion and report — do not rewire it.

### 4. Real progress in the studio overlay

- Delete the `STATUS_PROGRESS` hardcoded map and the fake percentage logic.
- `UploadProgressOverlay` receives `progress: number` (0-1, real bytes) from the item
  (via getItemStatus's queue item — thread `item.progress` through). While active:
  - thumb variant: thin determinate bar driven by real progress (no % text at 80px).
  - cover variant: bar + real percentage text.
- 'preparing' has no bytes yet — show an indeterminate treatment (subtle pulsing bar
  or the existing pulse) WITHOUT a fake number. 'pending' shows queued state only.
- uploaded/failed/cancelled states unchanged (badge/overlays already exist).
- Respect reduced motion as the current code does.

## Constraints

- TypeScript strict, no `any`, no new dependencies.
- Do NOT restructure ListingMediaStudio into multiple files (Wave 3 owns the factor);
  your changes should leave it no larger than it is today (deleting the toolbar and
  STATUS_PROGRESS offsets the additions).
- Do NOT touch: services/mediaUpload*.ts, hooks/*, UploadManager, SortablePhotoStrip,
  screens (SellScreen/EditListingScreen need no changes — the host contract is
  unchanged), useProfileMediaUpload.
- Keep all existing accessibility labels/roles for the Edit entry and progress
  (update labels where the control's meaning changed, e.g. Edit now opens the crop sheet).
- Style: match the file's existing conventions (design tokens Space/Radius/Stroke/
  TypographyV2, useHaptic, Motion tokens). No emoji, no verbose copy.

## Verification

1. `cd frontend && npm run typecheck` — must pass.
2. Scoped eslint on the touched files — must pass.
3. `npm test` (vitest) — no new failures vs baseline (7 pre-existing unrelated).
4. Grep: zero references to InCanvasCropOverlay remain; zero references to
   STATUS_PROGRESS remain.

## Report

Append your report to .flagship/sdd/task-1B-report.md and return ONLY: status
(DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED), one-line test summary, concerns.
