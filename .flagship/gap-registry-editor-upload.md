# Editor & Upload Department — Gap Registry (2026-09-06)

Audit basis: two parallel read-only subagent audits (upload pipeline engineering + editor UI/UX),
plus current-date web research (Expo background upload guidance, expo-video deprecations).

## Department map

- Listing upload flow: SellScreen.tsx / EditListingScreen.tsx -> ListingMediaStudio.tsx -> MediaUploadQueue (legacy) -> mediaUpload.ts (fetch PUT)
- Creator editor: CreatorCropSheet.tsx, CreatorAssetPicker.tsx, effects/adjustments/LUT, PosterComposerScreen timeline
- Durable upload: creator/core/upload/* (UploadManager, MultipartUploader, UploadJobStore) — creator flow only
- Profile: ProfileMediaEditor.tsx + useProfileMediaUpload.ts (direct uploadMedia, no queue)

## P0 — flagship blockers

### EU-P0-1 Fake upload progress on the main listing surface
- Evidence: ListingMediaStudio.tsx:50-57 STATUS_PROGRESS hardcoded (pending 0.1 / preparing 0.3 / uploading 0.65).
  mediaUpload.ts:149-155 uses fetch PUT — no onprogress exists in the legacy path.
- Impact: The single most-used commerce flow shows invented percentages. Users distrust the wait.
- Fix: Route listing uploads through XHR with upload.onprogress (pattern already proven in
  UploadManager.ts:743-805) and feed real bytes into the overlay.

### EU-P0-2 Two crop systems, one dead, neither reaches listings
- Evidence: CreatorCropSheet.tsx (destructive pixel crop, gesture-driven) vs InCanvasCropOverlay.tsx
  (non-destructive, zero importers = dead code). ListingMediaStudio wires only rotate/flip (lines 325-349,
  619-673); mediaTransforms.ts cropImage/cropToAspectRatio have no UI call sites.
- Impact: Users cannot crop listing photos at all — rotate/flip only. Inconsistent editor story across surfaces.
- Fix: Delete or adopt InCanvasCropOverlay; open CreatorCropSheet (crop+flip) from ListingMediaStudio cover Edit.

## P1 — materially below flagship

### EU-P1-1 Legacy queue is not durable / not offline-aware / weak cancel
- Evidence: mediaUploadQueue.ts in-memory only (:47-53); fails immediately offline (:414-427);
  cancelItem sets a flag but fetch is not aborted (:136-150, :372-395); no jitter in backoff (mediaUpload.ts:99).
- Fix: Unify on durable UploadManager (AsyncStorage jobs, AbortController, jittered backoff, multipart >10MB)
  for listings + profile; wire NetInfo pause/resume (UploadManager has no NetInfo listener today).

### EU-P1-2 Focal point ignored by all ExpoImage/Video preview paths
- Evidence: Set in CreatorCropSheet.tsx:332-342; honored only in Skia path (CreatorCanvas.tsx:1658-1669);
  ListingMediaStudio.tsx:530-537 and SortablePhotoStrip.tsx:212 use contentFit="cover" with no focal handling.
- Impact: Faces/subjects get cropped off-center despite user intent.

### EU-P1-3 Video trim trapped in poster composer; no video thumbnail generation
- Evidence: Trim only in PosterComposerScreen.tsx:1080-1204; CreatorAssetPicker only rejects >60s (:773-798);
  no expo-video usage for thumbnails (mediaTransforms.ts:261-275 is image-only).
- Note: expo-video-thumbnails is deprecated (SDK 56 removal) — use expo-video generateThumbnailsAsync.

### EU-P1-4 No straighten; flip missing from crop sheet; vertical flip unreachable
- Evidence: grep straighten = 0 hits; CreatorCropSheet has no flip; mediaTransforms.ts:125-136 supports
  vertical flip with no UI.

### EU-P1-5 Editor flows lack undo/recovery
- Evidence: CreatorCropSheet has only isProcessing + error toast (:303-329); no undo in crop/effects;
  PosterComposerScreen has keyboard undo only.

## P2 — design-language defects (the "bot-made" tells)

### EU-P2-1 Radius budget violated in one viewport
- ListingMediaStudio mixes Radius.xxl / .lg / .sm / .full in one screen (:742, :810, :838, :849, :860, :873);
  SortablePhotoStrip mixes .xl / .lg (:240, :254, :266). Charter budget: max 2 non-avatar radii per viewport.

### EU-P2-2 Mixed icon families in the same region
- Ionicons (CreatorAssetPicker.tsx:898, ListingMediaStudio.tsx:631, CreatorCropSheet.tsx:541) +
  AppGlyph coolicons (CreatorAssetPicker.tsx:843,1040) + AppIcon (LUTBrowserSheet.tsx:153) side by side.

### EU-P2-3 Stroke drift
- ListingMediaStudio.tsx:965 hardcodes borderWidth: 2 instead of Stroke.emphasis; family mixes 0.5/1/2 arbitrarily.

### EU-P2-4 Badge clutter on cover (label-everything disease)
- COVER + VIDEO + count badges + remove + edit stacked on one cover (ListingMediaStudio.tsx:803-842);
  every thumbnail carries number badge + cover pill + 15pt shadow (SortablePhotoStrip.tsx:221-245).

### EU-P2-5 Placeholder-grade empty state
- Dashed box + icon wrap + three lines of copy (ListingMediaStudio.tsx:736-752, :364-370) reads as scaffold,
  not authored surface. Verbose hint copy ("Well-lit photos from multiple angles sell faster").

### EU-P2-6 Raw numeric focal readout
- CreatorCropSheet.tsx:596 shows "Focal point: 58%, 42%" — machine output in a consumer UI.

## Research sources

- expo.dev/blog/faster-more-reliable-video-uploads-with-expo-modules — native background upload + S3 multipart
  is Expo's current recommended architecture (accessed 2026-09-06)
- docs.expo.dev/versions/latest/sdk/video-thumbnails/ — expo-video-thumbnails deprecated, use expo-video
  generateThumbnailsAsync (accessed 2026-09-06)
- rorklab.net multipart/TUS guide — iOS background execution limits, chunked resume patterns (secondary)
