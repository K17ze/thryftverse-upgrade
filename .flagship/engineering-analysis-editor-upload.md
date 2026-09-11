# Editor & Upload Department — Senior Engineering Analysis

## Preamble

This is not a feature checklist. It is a code-informed assessment of implementation depth and quality in ThryftVerse's editor and upload surfaces, written from the perspective of a senior mobile architect who has shipped production apps at scale. Every finding cites specific code paths and failure scenarios. Every comparison to Instagram or Snapchat is grounded in primary documentation or direct observation, not assumption.

The analysis distinguishes between:
- **Defects** — things that are wrong and will fail users.
- **Depth gaps** — things that work but communicate less than the underlying state model knows.
- **Deliberate constraints** — things that are intentionally limited for marketplace context.
- **Backend contract limitations** — things the frontend cannot fix alone.

---

## 1. Crop Editor — `CreatorCropSheet.tsx`

### What works

The crop sheet has unusually deep transform logic for a React Native app. Pan and pinch are composed with `Gesture.Simultaneous`, pan clamps to source bounds, pinch preserves aspect ratio by coupling width and height, straightening uses largest-inscribed-rectangle math to avoid empty rotated corners, and focal points are stored in source-image space and remapped through the transform pipeline. This is more sophisticated than what Instagram's feed crop editor does — Instagram locks the ratio and only allows pinch/pan within the frame, no rotation, no straightening, no focal points.

### What's broken

**P0: The dim overlay is frozen during gestures.**

Lines 636–648 render four `<View>` scrims whose positions are driven by React state (`displayCropRect`), but that state is only committed in `onEnd` via `runOnJS(setCropRectFromSV)`. The crop border, grid, and handles move on the UI thread through shared values. The result: while dragging or pinching, the crop frame moves but the darkened area stays at its last committed position. The user sees a moving crop rectangle with a stale shadow.

This is a direct-manipulation defect. Instagram's crop preview re-renders continuously during the gesture — the dimmed area follows the frame in real time. ThryftVerse's crop sheet breaks the fundamental contract of live preview: what you see during the gesture is what you get on release.

Fix: drive the four scrims from `useAnimatedStyle` reading `cropXSV / cropYSV / cropWSV / cropHSV`, same as the crop border.

**P1: No double-tap guard on confirm.**

`handleConfirm` sets `isProcessing = true` (line 455), but React state updates are asynchronous. A fast double-tap can fire two `manipulateAsync` calls before the state guard takes effect. On lower-end Android devices where JS thread contention is higher, this is a real scenario — and it produces two output files, one of which is orphaned.

Fix: use a `useRef` guard that's set synchronously before the async call, not React state.

**P2: Image-load failure is a dead end.**

Lines 260–264 catch `getSize` failure and show a generic toast. No retry, no fallback to a different source, no "open in library" recovery. If the image URI is stale (e.g. a `ph://` asset that was deleted from the library), the user is stuck on a loading state with a toast that disappears.

**P2: Focal-point remapping only handles 90° multiples.**

`mapFocalToOutput` (lines 66–77) rounds `rotation / 90`. Straightening adds fractional rotation, but the focal point is mapped as if rotation is always a multiple of 90°. If a user straightens by 3° and sets a focal point, the focal point will be slightly off in the output. This is a silent quality degradation, not a crash.

### What's a deliberate constraint (not a defect)

- Straightening range is limited to ±10°. This is tighter than general image editors but appropriate for marketplace product photos — wider rotation produces larger crop loss and empty corners. Instagram doesn't expose straightening at all in feed crop. This is fine.
- No free rotation. Product photos should be level. Instagram agrees.

### Comparison to competitors

Instagram's crop is simpler but more polished in its interaction: the dim overlay follows the frame live, the grid is transient (gesture-only), and the preview is continuous. ThryftVerse has more transform depth (rotation, straightening, focal points) but less interaction polish (frozen scrims, no double-tap guard). The engineering is there; the last-mile UI thread synchronization is not.

---

## 2. Upload Progress UI — `UploadProgressRing.tsx`

### What works

The ring correctly distinguishes `preparing` (indeterminate spinner), `uploading` (determinate SVG arc with real byte progress), `uploaded` (fade-out), `failed` (retry button), and `cancelled` (retry button). Progress is based on real transmitted bytes, not fabricated. The `progressbar` accessibility role with `accessibilityValue` is implemented for the uploading state. This is honest engineering.

### What's a depth gap

**P1: `pending` and `draft` states are invisible.**

Lines 75–76 return `null` for anything outside `{preparing, uploading, uploaded, failed, cancelled}`. When a user adds a photo, it enters `pending` state and the ring shows nothing. The user has no confirmation that their photo was accepted into the queue until it starts preparing. Instagram shows a queued state on the post itself — a subtle "Waiting" indicator. ThryftVerse's queue model is richer than its UI communicates.

Fix: render a subtle static outline or a small "queued" indicator for `pending` state. Not a spinner — that would lie about activity. A static ring or a dimmed thumbnail border communicates "accepted, waiting" without fabricating progress.

**P2: Upload completion is silent to screen readers.**

The ring fades out after 450ms (lines 59–68) but there is no `announceForAccessibility` call. A VoiceOver/TalkBack user has no audible signal that their upload completed. The visual fade is invisible to them.

Fix: call `AccessibilityInfo.announceForAccessibility('Upload complete')` (localized) when the uploaded state is entered.

**P2: No offline/paused state communication.**

The queue pauses when `internetReachable` is false, but the progress ring has no "paused" or "will resume" state. The user sees a frozen progress bar with no explanation. Instagram's inferred UX shows a "Waiting for connection" state on queued posts. The queue has the state (`internetReachable`); the UI doesn't surface it.

Fix: when `internetReachable` is false and an item is `uploading` or `pending`, show a "Waiting for connection" label below the ring. Not a separate state machine — just a conditional label driven by the existing connectivity value.

**P2: No aggregate progress.**

The queue exposes `completedCount`, `failedCount`, and `totalCount`, but the listing surface shows only per-item rings. A seller uploading 8 photos sees 8 individual progress rings with no summary. Instagram shows both per-file status and aggregate queue progress. For a marketplace listing with multiple photos, aggregate progress ("3 of 8 uploaded") reduces anxiety during batch uploads.

Fix: add a compact aggregate progress line above or below the photo strip when `totalCount > 1` and not all items are terminal. This is a label, not a card or a badge — keep it flat.

---

## 3. Upload Queue — `mediaUploadQueue.ts`

### What works

The queue is the strongest piece of engineering in the department. It has:
- Concurrency limit of 2 with `waitForSlot` serialization.
- Three retry attempts with attempt tracking.
- Durable AsyncStorage snapshots with debounced persistence (250ms).
- Snapshot hydration on app restart.
- Restoration of interrupted `preparing`/`uploading` items to `pending`.
- Network awareness through NetInfo.
- Abort controllers for cancellation.
- Progress throttling at 100ms per item.
- Retry-all and retry-item operations.
- Reordering support.

This is a more complete state model than what Instagram exposes publicly. The `UploadQueueItemState` type (`pending | preparing | uploading | uploaded | failed | cancelled`) maps cleanly to the states Instagram's resumable upload API tracks (`uploading_phase` + `processing_phase` + `status_code`).

### What's broken or missing

**P1: No error classification — all failures are blindly retried.**

Lines 715–719 set `retryable` solely from `attemptCount < MAX_RETRIES`. A 400 Bad Request (invalid media format) will be retried three times. A 401 Unauthorized will be retried three times. A 403 Forbidden will be retried three times. Instagram's API carries `debug_info.retriable: bool` on every error response — the server explicitly tells the client whether retry is safe. ThryftVerse's queue doesn't classify errors at all.

This wastes bandwidth on mobile networks and delays user-facing failure feedback. A 400 should fail immediately with "Unsupported format", not retry silently for 30 seconds.

Fix: classify errors by HTTP status and error type. `retryable = (status >= 500 || status === 0 || isNetworkError) && attemptCount < MAX_RETRIES`. 4xx errors are not retryable. Auth errors should surface immediately, not retry.

**P1: No byte-offset resume — all retries restart from zero.**

Lines 94–100 restore in-flight items as `pending` with `progress = 0`. `retryItem` (lines 207–233) also resets `progress = 0` and the next `processItem` presigns a fresh URL and re-uploads the entire file. Instagram's `rupload` endpoint supports `offset` — the client queries `bytes_transferred` and resumes from that byte position.

This is a backend contract limitation as much as a frontend issue. Without server-side support for `Content-Range` or a resumable upload protocol (S3 multipart, GCS resumable, Tus), the frontend cannot resume from a byte offset. However, the queue should at minimum:
1. Not re-presign if the upload URL is still valid (presign URLs typically have a TTL).
2. Not re-upload if the finalization failed after bytes were transferred (the object exists on the origin; only the finalize call needs retrying).

Fix (frontend-only): separate finalization failure from transport failure. If `finalizeUpload` fails after a successful PUT, mark the item as `needs_finalization` (not `failed`) and retry only the finalize call, not the full upload.

**P2: Temporary resized files are never cleaned up.**

`resizeForUpload` writes to a cache directory. No `FileSystem.deleteAsync` is called after upload success or failure. On repeated retries, resized copies accumulate in the cache. Over a session with multiple listing uploads, this can consume hundreds of MB.

Fix: delete the resized file in a `finally` block after the upload completes or fails.

**P2: Cancellation is fire-and-forget.**

`cancelItem` sets `_cancelRequested` and calls `abort`, but doesn't wait for `processItem` to reach a terminal `cancelled` state. The UI may show `cancelled` while the worker is still in the upload loop. If the user immediately retries, the old worker and the new worker may both be running.

Fix: await the cancellation before allowing retry, or use a generation counter to invalidate stale workers.

**P2: `processQueue` recursion can transiently exceed the concurrency limit.**

`processQueue` (lines 536–565) is called recursively after every completion. If `notifySlots` releases multiple waiters quickly, the active-count check is not atomic — more than two items could transiently start. The `waitForSlot` guard provides some serialization, but the flow is subtle and error-prone under contention.

Fix: use a simple `isProcessing` flag or a mutex to serialize `processQueue` calls.

---

## 4. Listing Upload Surfaces

### What's broken

**P0: Focal-point edits are silently lost on save.**

`handleTransformItem` in `EditListingScreen.tsx` (lines 419–433) stores `focalPoint` on the local media item, but `hasChanges` and `patchListingOnApi` never send focal data. The API calls (`createListingImageOnApi`, `patchListingOnApi`) don't accept focal parameters. A seller carefully positions the focal point on their cover photo, saves, and the focal point is gone.

This is a full-stack defect. The frontend captures the focal point, the crop sheet computes it, the remapping is correct — but the backend contract doesn't carry it, and the save path doesn't attempt to send it. The user's work is silently discarded.

Fix: this requires a backend contract change (add `focalX` / `focalY` to the attachment API) and a frontend save-path update. If the backend isn't ready, at minimum show a warning that focal points are not saved with edits. Do not silently drop the data.

**P1: `AIPoweredListingScreen` duplicates the entire publish pipeline.**

`handlePublish` (lines 315–423) implements its own upload → create → attach flow instead of calling `executePublication` from `listingPublication.ts`. This means:
- No recovery context (`recoveryRef`).
- No idempotent retry — a failed publish after `createListingOnApi` succeeds will re-upload all media and attempt to create a new listing with a new ID on retry.
- Divergent error handling from the main publish path.
- Hard-coded `shippingMethod: 'standard'` and `shippingPayer: 'buyer'` with no UI.

This is an architecture defect. Three screens (`SellScreen`, `EditListingScreen`, `AIPoweredListingScreen`) each implement their own publish orchestration with different levels of recovery support. `listingPublication.ts` was built to be the unified orchestrator, but `AIPoweredListingScreen` bypasses it.

Fix: route `AIPoweredListingScreen.handlePublish` through `executePublication`. This is a refactor, not a new feature — the orchestrator already exists.

**P1: No offline pre-check before publish.**

`useListingPublishPipeline.handlePublish` and `AIPoweredListingScreen.handlePublish` both enter the upload/create/attach flow without checking `isOffline`. The user taps Publish, sees `isPublishing` become true, and then waits for the queue to fail through `failed_recoverable`. Instagram's inferred UX queues offline posts and auto-publishes on reconnect. ThryftVerse's queue has network awareness, but the publish pipeline doesn't use it as a pre-check.

Fix: if `isOffline` is true when the user taps Publish, show an immediate "You're offline. Your listing will be published when you reconnect" message and queue the publish for auto-flush on reconnect. Do not enter the publish flow and wait for it to fail.

**P1: Publish-stage errors are hidden from the inline error banner.**

`SellScreen.tsx` lines 947–952 only render `errorMsg` when `publicationStage === 'idle'`. A publish failure sets `publicationStage` to `failed_recoverable`, which hides the inline error. The user must rely on the footer to communicate the error — but the footer may not be visible if the user has scrolled up.

Fix: render publish errors in the inline error banner regardless of `publicationStage`, or add a sticky error banner that persists until dismissed.

**P2: Remote media is always initialized as `kind: 'image'`.**

`EditListingScreen.tsx` lines 217–224 hard-code `kind: 'image'` when building items from API media. If the listing has a video, the UI will misclassify it and may not render the video player correctly.

Fix: read `kind` from the API response, defaulting to `'image'` only if the field is absent.

**P2: Cover selection picks the first image, not the user-designated cover.**

`listingPublication.ts` line 201: `resolvedMedia.find((media) => media.kind === 'image')`. If the first media item is a video and the first image is the third item, the wrong cover is used. The user may have designated a specific cover through reordering, but the orchestrator ignores that and picks the first image.

Fix: use the first item in the resolved media array (which reflects the user's ordering), regardless of kind. If the first item is a video, use its poster frame or the first image after it.

---

## 5. Media Browser and Sortable Photo Strip

### What's broken

**P1: `SortablePhotoStrip` pan gesture swallows taps from child controls.**

`SortableItem` wraps the entire thumbnail in a `GestureDetector` with a `Pan` gesture (lines 126–149). There is no `minDistance` or `simultaneousWithExternalGesture` configuration. The edit, remove, and retry `Pressable` components inside the thumbnail may not receive taps on Android or iOS if the pan gesture activates first — even a 1px finger movement can activate the pan.

This is a real interaction defect. Users trying to tap "edit" or "retry" on a thumbnail may accidentally start a drag instead. Instagram's carousel reorder uses long-press to distinguish drag from tap — a pattern that avoids this conflict entirely.

Fix: set `minDistance(8)` or `minPointers(2)` on the pan gesture, or use `Gesture.LongPress()` to activate drag mode. Alternatively, use `simultaneousWithExternalGesture` to allow tap handlers to fire alongside the pan detector.

**P2: `withSpring` called inside `useAnimatedStyle`.**

Lines 158–160 of `SortablePhotoStrip.tsx` call `withSpring` inside the animated style worklet. This creates a new spring animation on every frame, which is not the recommended Reanimated pattern. It should use a separate `scaleSV` shared value updated in `onBegin`/`onEnd` callbacks.

Fix: extract scale to a shared value and animate it in gesture callbacks, not inside the style worklet.

**P2: Video preflight rejection is silent.**

`MediaBrowserSheet.tsx` lines 766–771 reject videos over `MAX_VIDEO_DURATION_MS` with only a haptic. No toast, no banner, no accessibility announcement. The user selects a video, feels a vibration, and nothing happens. They don't know why.

Fix: show a localized toast ("Video is too long. Maximum 60 seconds.") and announce it for accessibility.

---

## 6. Creator Composer (context, not primary focus)

The creator composer (`PosterComposerScreen.tsx`) is significantly deeper than what listing media editing needs. It has multi-layer composition, timeline, keyframes, effects, drawing, audio, and video editing. This is the right architecture — the creator surface is a superset of the listing surface, and listing media editing should borrow patterns, not features.

The main quality issue in the composer is chrome fade: lines 501–506 drop chrome to 0.05 opacity during manipulation, which makes controls effectively invisible during gestures. This is a discoverability defect, but it's in the creator surface, not the listing surface. It should be fixed but is lower priority than the listing upload defects above.

---

## Gap Registry — Prioritized

| ID | Severity | Area | Finding | Fix scope |
|----|----------|------|---------|-----------|
| E1 | P0 | Crop | Dim overlay frozen during gestures | `CreatorCropSheet.tsx` — move scrims to animated styles |
| E2 | P0 | Listing | Focal-point edits silently lost on save | Full-stack — backend contract + frontend save path |
| E3 | P1 | Crop | No double-tap guard on confirm | `CreatorCropSheet.tsx` — useRef guard |
| E4 | P1 | Upload | No error classification — blind retry on 4xx | `mediaUploadQueue.ts` — classify by HTTP status |
| E5 | P1 | Upload | Finalization failure causes full re-upload | `mediaUploadQueue.ts` — separate finalize retry |
| E6 | P1 | Upload | `pending`/`draft` states invisible in UI | `UploadProgressRing.tsx` — render queued indicator |
| E7 | P1 | Upload | No offline/paused state communication | `UploadProgressRing.tsx` + connectivity prop |
| E8 | P1 | Listing | `AIPoweredListingScreen` bypasses unified publish | Route through `executePublication` |
| E9 | P1 | Listing | No offline pre-check before publish | Pipeline hooks — short-circuit on `isOffline` |
| E10 | P1 | Listing | Publish errors hidden from inline banner | `SellScreen.tsx` — render errors regardless of stage |
| E11 | P1 | Strip | Pan gesture swallows child taps | `SortablePhotoStrip.tsx` — `minDistance` or long-press |
| E12 | P2 | Upload | Temp resized files never cleaned up | `mediaUploadQueue.ts` — `finally` cleanup |
| E13 | P2 | Upload | Cancellation is fire-and-forget | `mediaUploadQueue.ts` — await or generation counter |
| E14 | P2 | Upload | Upload completion silent to screen readers | `UploadProgressRing.tsx` — `announceForAccessibility` |
| E15 | P2 | Upload | No aggregate progress for multi-photo | Listing surface — compact "3 of 8" label |
| E16 | P2 | Listing | Remote media hardcoded as `kind: 'image'` | `EditListingScreen.tsx` — read from API |
| E17 | P2 | Listing | Cover selection ignores user ordering | `listingPublication.ts` — use first item, not first image |
| E18 | P2 | Media | Video rejection silent in picker | `MediaBrowserSheet.tsx` — toast + a11y announce |
| E19 | P2 | Strip | `withSpring` inside `useAnimatedStyle` | `SortablePhotoStrip.tsx` — extract to shared value |
| E20 | P2 | Crop | Image-load failure is a dead end | `CreatorCropSheet.tsx` — retry + recovery |
| E21 | P2 | Effects | `composeAll` order may contradict comment | `EffectPresets.ts` — verify and fix or document |

## Implementation Priorities

**Wave 1 — P0 defects (must fix):**
- E1: Crop scrim animation
- E2: Focal-point persistence (frontend portion — warn if backend not ready)

**Wave 2 — P1 defects (should fix):**
- E3: Double-tap guard
- E4: Error classification
- E5: Finalization retry separation
- E6: Pending state visibility
- E7: Offline/paused communication
- E8: AI listing publish unification
- E9: Offline pre-check
- E10: Publish error visibility
- E11: Sortable strip gesture fix

**Wave 3 — P2 defects (nice to fix):**
- E12–E21: cleanup, a11y, edge cases

## What NOT to do

- Do not add new features (filters, AI editing, trim controls) to the listing editor just because Instagram/Snapchat has them. The listing editor's job is truthful product media, not creative expression.
- Do not add seller coaching, tips, or quality meters. The user rejected these.
- Do not add decorative chrome (cards, pills, badges, shadows) to the upload progress UI. The ring is the right primitive — extend its state coverage, don't wrap it in a card.
- Do not attempt byte-offset resume without backend support. It requires a resumable upload protocol on the server side. The frontend can prepare for it (track bytes, separate finalize retry), but cannot implement it alone.
- Do not change the straightening range. ±10° is appropriate for marketplace product photos.
