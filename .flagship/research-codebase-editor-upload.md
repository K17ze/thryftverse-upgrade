# ThryftVerse — Editor / Upload / Listing Publication Code Audit

## Scope

Repository: `C:\Users\User\Desktop\thryftverse-upgrade\frontend`

Files audited:

- `frontend/src/creator/CreatorCropSheet.tsx`
- `frontend/src/components/listing/ListingMediaStudio.tsx`
- `frontend/src/components/listing/UploadProgressRing.tsx`
- `frontend/src/services/mediaUploadQueue.ts`
- `frontend/src/creator/poster/PosterComposerScreen.tsx`
- `frontend/src/creator/tools/effects/AdjustPanel.tsx`
- `frontend/src/creator/tools/effects/EffectPresets.ts`
- `frontend/src/screens/SellScreen.tsx`
- `frontend/src/screens/EditListingScreen.tsx`
- `frontend/src/screens/AIPoweredListingScreen.tsx`
- `frontend/src/hooks/sell/useSellScreenData.ts`
- `frontend/src/hooks/sell/useSellScreenActions.ts`
- `frontend/src/hooks/sell/useSellScreenForm.ts`
- `frontend/src/hooks/sell/useListingPublishPipeline.ts`
- `frontend/src/services/listingPublication.ts`
- `frontend/src/creator/tools/MediaBrowser/MediaBrowserSheet.tsx`
- `frontend/src/components/SortablePhotoStrip.tsx`

---

## 1. Crop Editor

### 1.1 `CreatorCropSheet.tsx` (~1,019 lines)

**Responsibilities**

- Full-screen pixel-accurate crop, flip, 90° rotate, straighten, aspect-ratio presets.
- Reanimated + RNGH gesture composition (pan, pinch).
- Focal-point capture and remapping through the full manipulation pipeline.
- `expo-image-manipulator` output and `onCropComplete` callback.

**State model**

- Internal: `imageSize`, `cropRect`, `selectedRatio`, `rotation`, `flippedH/V`, `straighten`, `focalPoint`, `isProcessing`, `hasError`.
- UI: `isGestureActive` shared value, `cropXSV / cropYSV / cropWSV / cropHSV` drive the Reanimated overlay live.
- Hidden: straightened crop-rect math, `largestInscribedRect` output, `manipulateAsync` success/failure, source-space focal coordinates.

**Quality / architecture issues**

1. **Dim overlay does not move with the crop frame during a gesture.**

   Lines 636–648 render four plain `<View>` dim rectangles whose position depends on the React-state `displayCropRect`. That state is only committed inside `onEnd` (via `runOnJS(setCropRectFromSV)`), while the actual crop border, grid, and handles move on the UI thread via shared values. The result is a moving crop frame with a stationary mask until release.

   ```tsx
   <View style={[styles.scrimTop, { height: displayCropRect.top, ... }]} />
   <View style={[styles.scrimLeft, { top: displayCropRect.top, width: displayCropRect.left, ... }]} />
   <View style={[styles.scrimRight, { top: displayCropRect.top, left: displayCropRect.right, ... }]} />
   <View style={[styles.scrimBottom, { top: displayCropRect.bottom, ... }]} />
   ```

   *Recommendation:* move the four scrims into `useAnimatedStyle` and drive them from `cropXSV / cropYSV / cropWSV / cropHSV` so the darkened areas follow the live crop rectangle.

2. **Image-load error path is a single generic toast.**

   Lines 260–264 call `RNImage.getSize` and fall back to `Image.prefetch`, but any failure only calls `show("Couldn't load image", 'error')`. There is no retry, no "Open in library" recovery, and no graceful empty state.

3. **Crop confirm relies on a global `isProcessing` flag but does not guard against double-tap completion.**

   `handleConfirm` sets `isProcessing = true` (line 455), but the React state mutation is not synchronous. A second tap before re-render may launch a second `manipulateAsync` call.

4. **Focal-point remapping only handles 90° multiples.**

   `mapFocalToOutput` (lines 66–77) rounds `rotation / 90`. If the UI ever allows free rotation (e.g. straighten), this mapping would be incorrect.

**Accessibility**

- Most controls have `accessibilityLabel` and `accessibilityRole="button"` (ratio chips, rotate, flip, reset, confirm).
- The straighten slider is announced through `CreatorSlider`, but the numeric value is not exposed in the slider's `accessibilityValue` unless `CreatorSlider` does it internally.
- No live-region announcement for "crop saved" / "crop failed".

**Performance**

- `useAnimatedStyle` for the preview image and grid is driven entirely from shared values, which is good.
- The dim overlay React-state update on every `onEnd` causes a JS-thread render; converting it to Reanimated would improve pan/pinch smoothness.

---

### 1.2 `ListingMediaStudio.tsx` (~632 lines)

**Responsibilities**

- Renders cover and sortable thumbnail strip for listing media.
- Maps `ListingMediaDraftItem[]` to `UploadQueueItem` status/progress.
- Entry points for crop, retry, remove, reorder, camera/library.

**State model**

- Internal: `cropTargetId`, `cropSheetUri`, `coverSrc`, `videoPoster`.
- User-visible: `UploadProgressRing` per item, cover image, error text, add/remove/retry/Edit controls.
- Hidden: `queueItems.find(...)` per item, `resolveCropSourceUri` cache work, `FocalImage` focal points.

**Quality / architecture issues**

1. **Status coercion via type cast instead of validation.**

   Lines 56–65 convert between draft `status` and queue `state` with `as` casts. If the queue ever emits an unexpected state, the UI will silently display a mismatched progress ring.

   ```tsx
   const queueItem = queueItems.find((q) => q.id === item.id);
   const status = (queueItem?.state ?? item.status) as ItemStatus;
   ```

2. **`resolveCropSourceUri` returns the original `ph://` URI on any failure without surfacing an error.**

   Lines 86–97 catch copy errors and return the original URI. On iOS this can lead `manipulateAsync` to fail later with an opaque error.

3. **Cover video does not surface `onError` to the user.**

   Lines 373–375 pass an empty `onError` handler. A cover video that fails to load is simply blank.

4. **Focal-point-only changes in `EditListingScreen` are not persisted to the API.**

   `handleTransformItem` in `EditListingScreen.tsx` (lines 419–433) stores `focalPoint` on the local media item, but `hasChanges` and the `patchListingOnApi` call do not include focal data. The API calls (`createListingImageOnApi`, `patchListingOnApi`) do not accept focal parameters. Focal edits are silently lost on save.

5. **`queueItems.find(...)` is `O(n²)` for the strip render.**

   Each thumbnail performs a linear `queueItems.find(...)` (line 56). With 10 items this is minor, but if the queue grows it is unnecessary work.

**Accessibility**

- `SortablePhotoStrip` items are announced with position and "cover" state.
- Edit, remove, and retry controls have `accessibilityLabel`s passed from props.
- The cover video's play badge is not focusable and has no accessible pause/play action.

**Performance**

- `getItemStatus` and `getItemProgress` run inside the render body without memoization, although at 10 items this is cheap.
- `resolveCropSourceUri` creates temporary `expo-file-system` copies for iOS library URIs but does not clean stale cached copies.

---

## 2. Upload Progress UI

### 2.1 `UploadProgressRing.tsx` (~160 lines)

**Responsibilities**

- Render `preparing` indeterminate spinner, `uploading` determinate SVG ring, `uploaded` fade-out, `failed`/`cancelled` retry button.

**State model**

- Internal: `opacity`, `gone`, `progress` shared values.
- User-visible: ring / spinner / retry icon.
- Hidden: `uploaded` auto-fade timer, `pending`/`draft` are not rendered at all.

**Quality / architecture issues**

1. **`pending` and `draft` are invisible.**

   Lines 75–76 hide the ring for anything outside the active set. A user may add a photo and see no confirmation that it is queued until it enters `preparing`.

2. **The `uploaded` fade is silent to screen-reader users.**

   The ring fades after a 450 ms delay (lines 59–68) but there is no `announceForAccessibility` or live region; completion is not spoken.

3. **`gone` and `opacity` use two separate animation drivers that can drift.**

   `gone` is React state driven by `setTimeout`; `opacity` is a Reanimated shared value. If the component unmounts between the two, the next render may start with stale values.

**Accessibility**

- `progressbar` role with `accessibilityValue` is implemented for `uploading` (line 116).
- The retry `Pressable` has `accessibilityRole="button"` and an explicit `retryLabel` (line 91).

**Performance**

- The progress arc is rendered with an `AnimatedCircle` and `strokeDashoffset`. This is GPU-friendly.
- The `useEffect` that re-runs the fade when `progress` resets could be simplified to avoid a re-render per status change.

---

## 3. Upload Queue

### 3.1 `mediaUploadQueue.ts` (~728 lines)

**Responsibilities**

- Persistent, concurrent media upload queue (max 2).
- Presign → upload → finalize lifecycle.
- Cancellation, retry, offline awareness, snapshot persistence.

**State model**

- Per item: `id`, `asset`, `order`, `state`, `progress`, `attemptCount`, `publicUrl`, `finalizationId`, `error`, `retryable`, `_cancelRequested`.
- Aggregate: `items`, `inProgress`, `completedCount`, `failedCount`, `totalCount`, `running`, `internetReachable`.
- Durable: AsyncStorage snapshot every 250 ms; transient progress not saved.

**Quality / architecture issues**

1. **No byte-offset resume; all retries and restored uploads restart from zero.**

   Lines 94–100 restore in-flight `preparing`/`uploading` items as `pending` with progress zero. `retryItem` (lines 207–233) also resets `progress = 0` and the next `processItem` presigns a fresh URL and re-uploads the entire file.

2. **No error classification: all non-cancellation failures are treated as retryable.**

   Lines 715–719 set `retryable` solely from `attemptCount < MAX_RETRIES`. There is no distinction between 4xx client errors, 401/403 auth, 5xx, invalid media, presign rejection, or storage exhaustion. A 400 will be retried up to three times.

3. **`processQueue` recursion can overlap with `waitForSlot` releases.**

   `processQueue` (lines 536–565) is called recursively after every completion. If `notifySlots` releases multiple waiters quickly, more than two items could transiently start because the active-count check is not atomic.

4. **Image resize failure mutates `asset` in place.**

   Lines 455–464 replace `asset.uri` and `asset.fileSize` with the resized file. If the resize later fails, the catch reassigns back to the original. This in-place mutation can confuse any caller that still holds the original object reference.

5. **Temporary resized files are not cleaned up.**

   `resizeForUpload` writes to a cache directory. No `FileSystem.deleteAsync` is called after the upload succeeds or fails. On repeated retries this can accumulate.

6. **Finalization failure after a successful transport causes a full re-upload.**

   If `finalizeUpload` fails after the bytes are on the origin, the item is marked `failed` and the next `processItem` starts from `presignUpload` again. There is no "object already exists, just finalize again" path.

7. **Cancellation is fire-and-forget.**

   `cancelItem` sets `_cancelRequested` and calls `abort`, but it does not wait for `processItem` to reach a terminal `cancelled` state. The UI may show `cancelled` while the worker is still finalizing.

**Accessibility**

- The queue itself has no accessibility layer (it is a service file).

**Performance**

- Progress events are throttled to 100 ms per item (lines 512–519). Good.
- `getInfoAsync` and `fetch` size probes avoid loading the whole file into JS on native, but the web fallback still reads the file as a Blob.

---

## 4. Creator Composer

### 4.1 `PosterComposerScreen.tsx` (~2,200+ lines)

**Responsibilities**

- Multi-layer poster composition (text, media, stickers, product, draw).
- Effects, filters, adjustments, timeline, transitions, keyframes.
- Undo/redo, history, canvas gestures, keyboard shortcuts.

**State model**

- Very large React state: `bottomSurface`, active sheets, `document`, `activePageIndex`, `selectedLayer`, `selectedClipId`, `playbackState`, `timelineZoomScale`.
- Reanimated shared values for chrome fade, zoom, filter HUD, frame swipe, timeline pinch.
- AsyncStorage session persistence for `activePageIndex`, `selectedLayerId`, `timelineZoomScale`.

**Quality / architecture issues**

1. **Editor chrome fades to 0.05 opacity during manipulation.**

   Lines 501–506 drop most chrome to nearly invisible during any drag. This can make controls effectively undiscoverable during a gesture.

2. **Many mutually-exclusive surface states create precedence / race hazards.**

   `bottomSurface` (one of `tools | timeline | effects`) and 13 `openSheet` values are controlled separately. `handleBack` (lines 411–430) and the Escape keyboard handler close by priority, but there is no central state machine to guarantee exactly one surface is active.

3. **Session restore can race with document initialization.**

   Lines 872–934 restore AsyncStorage session inside an effect that runs when `sessionKey` changes. If document pages are still loading, the restored `selectedLayerId` or `activePageIndex` could be applied to stale data.

4. **Live filter preview is not committed until a thumbnail tap, but swiping changes the visual effect with no undo/redo entry.**

5. **Timeline clip `reorder` maps to `reorderPages` (line 1242).** This may not match user expectation for clip vs. page ordering.

**Accessibility**

- Tool groups have `accessibilityLabel` and `accessibilityHint`.
- The canvas itself is not semantically navigable; there are no accessible alternatives to pinch/drag for users using screen readers.

**Performance**

- `document.pages.flatMap` is used repeatedly inside timeline and layer handlers. For large documents this is `O(n²)` over pages and layers.
- `toolGroups` is a large `useMemo` with a very long dependencies array. Any change in any handler recreates the whole tool array.

---

### 4.2 `AdjustPanel.tsx` (~194 lines)

**Responsibilities**

- Render a `CreatorSlider` for every `ADJUST_PARAMETERS` entry.
- Separates live `onChange` from history `onCommit`.
- Supports reset and reduced-motion haptics.

**Quality / architecture issues**

1. **`onCommit` is optional, so callers can easily break undo consistency.**
2. **Displayed value is clamped while the slider receives the raw value.**
3. **`formatValue` rounds to two decimals while `step` is `0.001`.**

---

### 4.3 `EffectPresets.ts` (~326 lines)

**Quality / architecture issues**

1. **`composeAll` order may be the opposite of the documented order.**

   Lines 43–47 reduce left-to-right with `composeMatrices(outer, inner)`, meaning the *last* matrix in the argument list is applied first. The comment says "first applied first."

2. **`ADJUST_PARAMETERS` includes `sharpness` but the file only defines color matrices.**

3. **`tint` matrix scales the green channel rather than shifting green ↔ magenta.**

---

## 5. Listing Upload Surfaces

### 5.1 `SellScreen.tsx` (~1,264+ lines)

**Quality / architecture issues**

1. **Publish-stage errors are not shown in the inline error banner.**

   Lines 947–952 only render `errorMsg` when `publicationStage === 'idle'`. A publish failure sets `publicationStage` to `failed_recoverable`, so the inline `errorMsg` row is hidden.

2. **No pre-flight offline check before starting a publish.**

3. **`handleTransformItemWithFocal` is duplicated in the screen while `useSellScreenActions` owns transformations.**

4. **Quick actions remain visible only when the form is empty.**

---

### 5.2 `EditListingScreen.tsx` (~1,488 lines)

**Quality / architecture issues**

1. **Focal-point changes are not persisted (repeated).**
2. **Remote media is always initialized with `kind: 'image'`.**
3. **The save path is not idempotent.**
4. **`handlePickFromLibrary` and `handleCameraCapture` are not disabled for non-owners.**
5. **Fetch error retry code is duplicated inline.**

---

### 5.3 `AIPoweredListingScreen.tsx` (~1,501 lines)

**Quality / architecture issues**

1. **Publish flow is not idempotent and has no recovery context.**
2. **It does not reuse `executePublication`.**
3. **`shippingMethod` and `shippingPayer` are hard-coded.**
4. **No offline pre-check.**

---

### 5.4 `useSellScreenData.ts` (~343 lines)

**Quality / architecture issues**

1. **No `queue.reset()` on unmount.**
2. **Offline restoration flushes the `useOfflineQueue`, not the media queue.**
3. **`hasDraftContent` uses `price.trim()` not `numericPrice`.**

---

### 5.5 `useSellScreenActions.ts` (~429 lines)

**Quality / architecture issues**

1. **`handleTransformItem` does not support focal points.**
2. **Media validation and appending is duplicated in `handlePickFromLibrary` and `handleCameraCapture`.**
3. **`handleCameraCapture` does not respect `maxPhotos` after validation.**

---

### 5.6 `useSellScreenForm.ts` (~176 lines)

**Quality / architecture issues**

1. **Auto-clearing errors when `publishReady` becomes true can hide real issues.**
2. **`completeness` uses `photos` (string URIs), not `mediaDraftItems`.**

---

### 5.7 `useListingPublishPipeline.ts` (~255 lines)

**Quality / architecture issues**

1. **No offline short-circuit before `executePublication`.**
2. **`syncMediaFromQueue` does not preserve `focalPoint`.**
3. **The `isPublishing` guard uses both `isPublishing` state and `isPublishingRef`, but the ref reset is in `finally`.**

---

### 5.8 `listingPublication.ts` (~295 lines)

**Quality / architecture issues**

1. **The cover selection is `resolvedMedia.find((media) => media.kind === 'image')` — picks first image, not user-designated cover.**
2. **Attachment creation is sequential and not retried within the orchestrator.**
3. **Listing creation is idempotent by client ID, but `createListingImageOnApi` attachment IDs are deterministic.**
4. **`buildResolvedMedia` does not re-query `queue.getResultMap()` for every item after `queue.run()` is done.**

---

## 6. Media Browser and Picker

### 6.1 `MediaBrowserSheet.tsx` (~1,152+ lines)

**Quality / architecture issues**

1. **Video preflight rejection is silent.** Lines 766–771 return early for videos over `MAX_VIDEO_DURATION_MS` with only a haptic.
2. **The camera tile appears in every tab, including "Videos."**
3. **`FlatList` is imported but never used.** Dead code.
4. **Album list is capped at 30 albums with no "load more."**
5. **Long-press preview `Modal` has `accessibilityRole="image"` on the backdrop.**

---

### 6.2 `SortablePhotoStrip.tsx` (~254 lines)

**Quality / architecture issues**

1. **The `Pan` gesture around each item may swallow tap events from child `Pressable` controls.** No `minDistance` or `simultaneousWithExternalGesture` configuration.
2. **`withSpring` is called inside `useAnimatedStyle` for the scale transform.** Creates a new spring animation on every frame.
3. **Accessibility `moveEarlier` / `moveLater` actions do not provide haptic or visual feedback.**
4. **`key` uses `ids[index]` but the `Reanimated.View` uses `id` (the URI).** Inconsistent.

---

## 7. Cross-Cutting Recommendations

1. **Unify publish orchestration.** `AIPoweredListingScreen`, `EditListingScreen`, and `SellScreen` should all route through `listingPublication.ts`.
2. **Add a byte-offset resume strategy.** `mediaUploadQueue.ts` should negotiate with the presign backend to support `Content-Range` / `X-Goog-Resume-Offset` style resumption.
3. **Classify upload errors.** Distinguish client, auth, network, and server-finalization failures. Make `retryable` dependent on error class, not just attempt count.
4. **Make crop scrims follow the live crop rect.** Move the four `<View>` scrims in `CreatorCropSheet` to Reanimated shared-value-driven views.
5. **Make focal points durable.** Persist focal-point metadata to the backend.
6. **Coordinate offline state across queue and UI.** Add an explicit offline pre-check to `useListingPublishPipeline` and `AIPoweredListingScreen.handlePublish`.
7. **De-duplicate media validation/appending.** Extract a single `appendMediaAssets` helper.
8. **Review `SortablePhotoStrip` gesture interaction.** Add `minDistance` or `failOffset` to the pan so child pressables reliably receive taps, and move `withSpring` out of the animated style callback.
9. **Surface over-length video rejection.** Add a toast and an accessibility announcement in `MediaBrowserSheet`.
10. **Document `EffectPresets.ts` matrix order.** Either fix `composeAll` so it matches the "first applied first" comment, or update the comment and every call site.
