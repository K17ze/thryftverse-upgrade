# Creator Department — Engineering Deviation Research Report

**Date:** 2026-09-10
**Scope:** Creator/editor/upload department vs Snapchat & Instagram flagship quality
**Method:** Live online research + deep codebase audit + package ecosystem survey
**Sources:** Snapchat Newsroom, Meta Newsroom, Instagram Creators blog, Snap Developer docs, Expo docs, npm/GitHub (2025-2026)

---

## Executive Summary

ThryftVerse's creator department is **structurally over-built but depth-incomplete**. It has 230+ files, a custom Nitro export module, Skia + Reanimated + Gesture Handler, timeline operations, keyframe animation, speed curves, audio mixing, LUTs, drawing, captions, stickers, and a publish pipeline. The infrastructure is more capable than what Instagram Reels or Snapchat Quick Cut offer to casual creators.

But the **engineering quality deviates from flagship patterns** in specific, fixable ways:

1. **Monolithic kitchen-sink screens** — PosterComposerScreen (3,716 lines), LookComposerScreen (2,313 lines) — 9x and 5.8x the AGENTS.md 400-line budget. 82 hooks in a single component.
2. **Crop model deviates from Instagram** — pinch resizes the crop frame, not the image inside it. Instagram's signature behavior is pinch-to-zoom the *image* within a fixed crop frame.
3. **Focal points are captured but silently dropped** — CreatorCropSheet computes and emits focal points, but `createListingImageOnApi` and `patchListingOnApi` never send `focalX`/`focalY` despite the backend contract having those fields.
4. **No byte-offset resumable uploads** — the queue snapshots state but can't resume from a byte offset. Large video uploads restart from zero on interruption.
5. **AIPoweredListingScreen bypasses unified publish** — reimplements upload/create/attach with no recovery context, no offline pre-check via the shared pipeline.
6. **No per-destination safe-zone simulation** — generic overlay only, no Story/feed/grid device preview.
7. **InstantCut is layout-based, not beat-synced** — Snapchat Quick Cut generates audio-synced video; ThryftVerse's InstantCut picks a 2D grid layout.
8. **No scrub-state persistence** — timeline position is lost on composer re-launch.
9. **Timeline reorder not wired** — ClipThumb trims but drag-to-reorder is only in the listing flow, not the composer timeline.
10. **No draft autosave recovery** — Instagram Edits and Reels persist drafts; ThryftVerse's creator drafts exist but recovery is incomplete.

---

## 1. Crop Model Deviation (P0)

### What Instagram does
Instagram's crop is **image-centric**: the crop frame is a fixed aspect-ratio window. The user pinch-zooms and pans the *image* within that window. The crop frame stays still; the image moves. This is the signature behavior every user expects from a mobile crop editor.

### What ThryftVerse does
`CreatorCropSheet.tsx` (lines 293-322) uses pinch to **resize the crop frame** itself, not to zoom the image. The pan gesture (lines 265-284) moves the crop frame within the image bounds. The image is static.

```ts
// CreatorCropSheet.tsx:297-318 — pinch resizes the FRAME, not the image
const pinchGesture = Gesture.Pinch()
  .onUpdate((e) => {
    const rawH = Math.max(40, pinchStartH.value / e.scale);
    const clampedH = Math.min(maxH, rawH);
    const clampedW = Math.min(imageSize.width, clampedH * aspect);
    cropWSV.value = clampedW;  // frame width changes
    cropHSV.value = clampedH;  // frame height changes
  });
```

### The gap
- Pinch-to-zoom the image within a fixed crop frame is the expected behavior.
- ThryftVerse's model is "adjust the window" not "adjust the view through the window."
- This makes the crop feel like a document editor, not a photo editor.

### Recommendation
Add an **image zoom/pan model** alongside the existing crop frame model:
- Introduce `imageZoomSV` and `imagePanXSV`/`imagePanYSV` shared values.
- Pinch gesture updates `imageZoomSV` (clamped 1x-4x), not `cropWSV`/`cropHSV`.
- Pan gesture (when zoomed > 1) moves the image, not the frame.
- The crop frame stays at the selected aspect ratio.
- On crop commit, apply the zoom/pan offset to the crop rectangle calculation.
- Reference: `react-native-zoom-toolkit`'s `CropZoom` component implements exactly this pattern.

### Severity: P0 — this is the single highest-impact crop quality fix.

---

## 2. Focal Point Persistence Gap (P0)

### What happens now
1. `CreatorCropSheet.tsx` captures focal taps (line 494-499) and computes `finalFocal` via `mapFocalToOutput` (line 477).
2. `onFocalPointChange?.(finalFocal)` is emitted before `onCropComplete`.
3. `ListingMediaStudio.tsx` receives the focal point via `handleFocalChange` (line 266-269) and passes it to `onTransformItem`.
4. `useSellScreenActions.ts` `handleTransformItem` (line 296-308) updates the draft item's `focalPoint`.
5. **But**: `listingPublication.ts` (line 274-283) calls `createListingImageOnApi` without `focalX`/`focalY`.
6. **And**: `EditListingScreen.tsx` (lines 601-608) calls `createListingImageOnApi` without `focalX`/`focalY`.

### The backend contract
`listingsApi.ts` `createListingImageOnApi` (lines 680-681) accepts `focalX` and `focalY` parameters. The fields exist but are never populated.

### The fix
Wire `focalX`/`focalY` from draft items into both `listingPublication.ts` and `EditListingScreen.tsx` save paths.

### Severity: P0 — user work is silently lost.

---

## 3. Monolithic Screen Architecture (P1)

### PosterComposerScreen.tsx — 3,716 lines
- `PosterComposerInner` function: lines 136-3330 (3,195 lines in one function)
- 82 hooks (useState/useRef/useMemo/useCallback)
- 13+ useState calls for sheet visibility, layer editing, playback, selection, etc.
- Handles: canvas, layers, timeline, audio, captions, effects, drawing, text, stickers, cutout, templates, preview, publish, safe zones, accessibility, keyboard, focus, entry crossfade

### LookComposerScreen.tsx — 2,313 lines
- Similar monolithic pattern for the Look composer

### AGENTS.md §4 violation
> Do not build monolithic kitchen-sink screens. If a screen exceeds 400 lines or attempts to combine more than 3 distinct sub-domains, it must be factored into domain-isolated components.

### Recommendation
Factor into domain-isolated hooks and components:
- `usePosterTimelineState` — clip selection, trim, split, reorder
- `usePosterPlayback` — playback state, scrub, play/pause
- `usePosterLayers` — layer selection, z-order, transform
- `usePosterSheets` — sheet visibility orchestration
- `usePosterCanvas` — canvas gesture, chrome fade, safe zones
- `PosterToolbar` — tool dock as a separate component
- `PosterTimelineRail` — timeline track as a separate component

### Severity: P1 — not a user-visible bug, but blocks future quality work and creates maintenance risk.

---

## 4. Upload Pipeline Gaps (P0/P1)

### What Instagram/Meta does
- Two-host split: `graph.facebook.com` for metadata, `rupload.facebook.com` for bytes
- Byte-offset resume via `offset` header
- Server-provided `retriable` flag on every error
- Explicit `uploading_phase` vs `processing_phase` status

### What ThryftVerse does
- Presigned PUT + backend finalization (not Meta's rupload protocol)
- `mediaUploadQueue.ts` has real byte progress, retry classification, finalize-only retry, durable snapshots
- `isRetryableUploadError` classifies 4xx as non-retryable, 5xx/network as retryable
- No byte-offset resume — interruptions restart from zero
- No server-provided `retriable` flag — client infers from HTTP status

### Gaps
1. **No byte-offset resume** (P0 for large videos) — requires backend `Content-Range`/Tus support
2. **No server-provided retryability** (P1) — client infers, may retry non-retryable errors
3. **AIPoweredListingScreen bypasses `executePublication`** (P1) — reimplements upload/create/attach with no recovery context

### Recommendation
- **Frontend-only**: Route `AIPoweredListingScreen.handlePublish` through `executePublication`
- **Backend contract**: Add `Content-Range` support to the presigned PUT endpoint for byte-offset resume
- **Backend contract**: Add `retriable: boolean` to error responses

---

## 5. Safe Zone & Device Simulation (P1)

### What Snapchat Lens Studio does
- Safe Render regions for areas Snapchat UI will cover
- Device simulator that previews at different resolutions
- Toggle Snapchat UI on/off in preview

### What ThryftVerse does
- `SafeZoneOverlay.tsx` renders generic top/bottom reserved bands
- `PosterComposerScreen.tsx` toggles safe-zone display
- No per-destination simulation (Story 9:16 vs feed 4:5 vs grid square)

### Recommendation
Add a **destination preview mode** to the crop sheet and composer:
- Story (9:16) — safe zones for top/bottom UI
- Feed (4:5) — safe zones for engagement chrome
- Grid (1:1) — no safe zones, but preview the crop
- Marketplace PDP (3:4) — safe zones for price/CTA overlay

### Severity: P1

---

## 6. InstantCut vs Quick Cut (P1)

### What Snapchat Quick Cut does
- Select clips → auto-generate beat-synced video with music
- Swap tracks, re-sync, add Lenses
- Hand off to Timeline Editor for detail work

### What ThryftVerse does
- `InstantCutSheet.tsx` calls `autoCompose()` which picks a 2D grid layout
- No audio analysis, no beat sync, no video composition

### Recommendation
- Expand `autoCompose` to support beat-aware clip timing
- Add audio track selection
- Generate a preview video, not just a layout
- This is a P1 product gap, not just an engineering gap

### Severity: P1

---

## 7. Timeline Editor Gaps (P1/P2)

### What Snapchat Timeline Editor does
- Inline trim handles with direct manipulation
- Split, duplicate, replace, speed, volume
- Press-and-hold reorder clips
- Text/sticker layers dragged to control timing
- Scrub-state persistence across sessions

### What ThryftVerse does
- `ClipThumb.tsx` has inline trim handles with Reanimated shared values ✓
- `TimelineOperations.ts` has trim, split, duplicate, replace, speed ✓
- `WaveformTrack.tsx` renders audio waveforms ✓
- **No drag-to-reorder in the timeline** — only in the listing flow
- **No scrub-state persistence** — position lost on re-launch
- **No press-and-hold reorder** for clips

### Recommendation
- Add drag-to-reorder to the timeline track (reuse `SortablePhotoStrip` gesture model)
- Persist scrub position and selected clip ID in the creator draft
- Add press-and-hold reorder with haptic feedback

### Severity: P1 for reorder, P2 for scrub persistence

---

## 8. Draft Autosave & Recovery (P1)

### What Instagram Edits/Reels does
- Non-destructive draft/project model
- Draft autosave with recovery on app re-launch
- Project management (multiple drafts)

### What ThryftVerse does
- `drafts.ts` exists (10KB) with draft persistence
- `useCreatorPublishWorkflow.ts` (50KB) manages the publish workflow
- Recovery is incomplete — no autosave timer, no crash recovery prompt

### Recommendation
- Add autosave timer (every 30s or on state change)
- Show recovery prompt on composer launch if a draft exists
- Support multiple drafts (project list)

### Severity: P1

---

## 9. Package Ecosystem Opportunities

### Already excellent
- `@shopify/react-native-skia` — GPU filters, LUTs, real-time preview
- `react-native-reanimated` + `react-native-gesture-handler` — gesture-driven editing
- `expo-image-manipulator` — image transforms
- `expo-video` — thumbnails and metadata
- `expo-audio` — recording and playback
- Custom `thryft-media-export` Nitro module — AVFoundation/Media3 export with HDR

### Worth evaluating
| Package | Use Case | Risk |
|---------|----------|------|
| `react-native-zoom-toolkit` | `CropZoom` for Instagram-style image zoom crop | Low — 375 stars, v5.0.1, Reanimated-native |
| `react-native-lossless-trim` | Passthrough video trim (no re-encode) | Low — Expo module, no FFmpeg |
| `@simform_solutions/react-native-audio-waveform` | Reliable waveform extraction | Low — 8k weekly downloads, MIT |
| `expo-color-space-plugin` | DisplayP3 on iOS | Low — one config-plugin line |
| `@dariyd/react-native-image-filters` | GPU filters (Metal/Core Image) | Medium — immature, low adoption |

### Not recommended
- `react-native-image-crop-picker` — redundant with `expo-image-picker`, no live crop
- `react-native-fast-image` — redundant with `expo-image` + CDN downscaling
- `react-native-GPUImage` — dead, last pushed 2022
- Commercial SDKs (IMG.LY, videoeditorsdk) — licensing cost, lock-in

---

## 10. Cross-Cutting Findings

### Already strong (do not regress)
- `mediaUploadQueue.ts` — real byte progress, retry classification, finalize-only retry, durable snapshots, connectivity awareness, destroy() on unmount
- `UploadProgressRing.tsx` — pending/queued state, offline label, completion announcement, reduced-motion
- `CreatorCropSheet.tsx` — animated scrims, double-tap guard, image-load retry, focal-point mapping, aspect presets
- `CachedImage.tsx` — CDN-aware downscaling, focal-aware contentPosition, blurhash
- `SortablePhotoStrip.tsx` — minDistance, activeOffset, scaleSV, reduced-motion
- `thryft-media-export` — Nitro + AVFoundation + Media3 + HDR + progress + cancellation

### Persistent gaps (priority-ordered)
1. **P0**: Focal points dropped in save paths (frontend-only fix, backend ready)
2. **P0**: Crop pinch resizes frame, not image (Instagram deviation)
3. **P0**: No byte-offset resumable uploads (backend contract needed)
4. **P1**: AIPoweredListingScreen bypasses `executePublication`
5. **P1**: Monolithic screens (PosterComposer 3,716 lines, LookComposer 2,313 lines)
6. **P1**: No per-destination safe-zone simulation
7. **P1**: InstantCut is layout-based, not beat-synced
8. **P1**: No timeline drag-to-reorder
9. **P1**: No draft autosave recovery
10. **P2**: No scrub-state persistence
11. **P2**: No Snapchat Creative Kit integration
12. **P2**: No post-publish carousel reorder

---

## Implementation Priority

### Wave 1 (P0 — frontend-only, immediate)
1. Wire `focalX`/`focalY` into `createListingImageOnApi` and `patchListingOnApi`
2. Add image zoom/pan model to `CreatorCropSheet` (pinch zooms image, not frame)
3. Route `AIPoweredListingScreen` through `executePublication`

### Wave 2 (P1 — frontend, this session)
4. Add per-destination safe-zone preview to crop sheet
5. Add drag-to-reorder to timeline track
6. Add draft autosave timer and recovery prompt
7. Begin factoring `PosterComposerScreen` into domain hooks

### Wave 3 (P1/P2 — backend + frontend)
8. Byte-offset resumable uploads (backend contract)
9. Server-provided `retriable` flag (backend contract)
10. Expand InstantCut to beat-aware composition
11. Scrub-state persistence
12. Snapchat Creative Kit integration (if distribution strategy requires)
