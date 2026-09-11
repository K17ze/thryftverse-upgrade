# Wave 11 — Reference Implementation Research (online, current)

Date: 2026-05-20
Campaign: ThryftVerse creator/editor/upload flagship upgrade
Author: Senior SWE roleplay (20yr FAANG mobile + fullstack)
Sources: Snap Lens Studio docs, Instagram Stories platform docs, CapCut/VN
editor reviews, AVFoundation/Media3 tutorials, React Native Skia offscreen
docs, react-native-video-pipeline / react-native-nitro-video-editor /
react-native-media-compositor / react-native-view-recorder READMEs,
WWDC23 "Build robust and resumable file transfers", beefed.ai background
upload guide.

This document records what flagship mobile creator/editor/upload stacks
actually do in 2025-2026 and translates each finding into an actionable
upgrade target for ThryftVerse. Anti-AI design policy is enforced: every
finding must map to a real capability, not a cosmetic one.

## 1. Snapchat / Lens Studio — multi-camera, multi-layer render pipeline

### What they do
- A Lens has multiple Cameras, each rendering a set of Layers into a
  Render Target. Multiple cameras can share a Render Target — fewer
  Render Targets = better performance.
- `Scene Config` panel distinguishes **Live Target** (what the user sees
  in the live camera) from **Capture Target** (what is actually recorded
  into the Snap). This is the architectural answer to "preview vs export
  parity" — they are two output targets of the same render graph, not two
  separate code paths.
- Cascaded render passes: each effect renders into its own Render Target,
  then that Render Target is the input to the next effect's camera. The
  order of render passes is fixed by metadata describing which AR
  generators apply per pass. This is the "ping-pong render pass" pattern
  from the Snap post-capture editing patent (US 12272014).
- A `feature layer` declares the effect graph; a `render pipeline layer`
  does color conversion (YUV→RGB) between pixel buffers; a `render pass
  layer` runs each pass. This three-layer separation is the clean
  architecture for a multi-effect pipeline.

### Upgrade targets for ThryftVerse
- **T11-1 (P1): Preview/export parity contract.** Today the JS Skia
  export path and the backend FFmpeg path are two separate renderers
  with two separate filter implementations. We should formalize a
  single composition→render contract and document which effects each
  renderer supports, so preview, JS export, and backend render all
  produce the same pixels for the same composition. (We already inline
  the same 10 filter matrices in three places — that is the contract;
  it needs a test that proves they agree.)
- **T11-2 (P2): Render Target split for preview vs capture.** The
  composition model already separates "preview" (expo-video forward play)
  from "export" (FFmpeg trim/speed/overlays). We should add a
  `RenderTarget` enum (`preview` | `capture`) to the composition
  contract so a future native renderer can use the same graph for both
  with different output targets, matching Snap's pattern.

## 2. Instagram Stories — background + sticker layer, segmented upload

### What they do
- The story composer is architecturally **two layers**: a background
  layer (photo / video / solid color / gradient) and a sticker layer
  (image sticker the user can move/scale). This is the minimum viable
  composition; everything else (text, draw, polls) is a sticker variant.
- **Segmented upload**: stories are split into ≤15s segments, uploaded
  out-of-order with zero-copy slicing (no re-encode per segment), and
  the server merges segment metadata. This is the durability primitive
  that lets a 60s story survive a network drop.
- **Offline draft + retry**: drafts persist across app restarts;
  WorkManager (Android) / background URLSession (iOS) retries on
  failure respecting OS battery modes. The draft is the source of
  truth, not the in-memory editor state.
- **Ephemeral expiry**: client cache eviction syncs with server TTL;
  stale content is never shown.

### Upgrade targets for ThryftVerse
- **T11-3 (P1): Durable upload contract.** Our upload manager is
  in-process JS. A flagship upload must survive process death. The
  contract is: persist upload metadata (file path, checksum, uploadId,
  offset, chunkSize, retry count, last error) to a small on-device
  store; hand the actual transfer to a native background session
  (URLSession background / WorkManager); reconcile on app relaunch.
  This is a large change — for Wave 11 we add the **persisted upload
  metadata** layer and a **reconciliation hook** so the JS manager can
  recover after a restart even before the native session lands.
- **T11-4 (P2): Segment-aware upload for long video.** A composition
  with a long video should be uploadable in segments so a drop does not
  waste the whole transfer. This is deferred until the native
  background uploader lands; for now we document the contract.

## 3. CapCut / VN — timeline-first direct manipulation

### What they do
- **Document is the source of truth.** Edits produce a new document
  state; the renderer derives frames from the state. (CapCut, VN, and
  the "Design a Mobile Video Editor" interview all agree on this.)
- **Render pipeline**: Decoder → YUV→RGB on GPU → per-clip effect
  shaders → composition (overlay tracks, alpha blending) → output
  (preview to screen, export to file). Preview runs at 30+ fps on
  lower-res proxies; export is offline, full quality, cancellable but
  **not resumable** (each export is from scratch).
- **VN's flagship timeline features**: frame-accurate timeline with up
  to 30x zoom, picture-in-picture layers, masks, keyframe animation,
  curve-based speed ramps, beat editing, direct voice-over recording,
  filters, imported LUTs, transitions, non-destructive drafts with
  undo/redo. Multi-track audio with fade-in/out.
- **CapCut vs VN**: CapCut is trend/template-driven (fast, social-
  native); VN is manual, clean timeline editing (more control, less
  template pressure). Both export watermark-free on the free tier.
- **Memory budget**: video frames are heavy; release behind the
  playhead. Thermal throttling: detect and reduce preview quality
  automatically. Battery: avoid running heavy ML continuously.

### Upgrade targets for ThryftVerse
- **T11-5 (P1): Frame-accurate timeline zoom.** Our timeline is a
  fixed scale. VN's 30x zoom is the flagship bar — pinch to zoom the
  timeline so a single clip fills the track, then pinch out to see the
  whole story. This is a direct manipulation upgrade.
- **T11-6 (P1): Playhead-frame release / proxy preview.** Our preview
  loads the source video at full resolution. Flagship editors use
  lower-res proxies for preview and full-res only for export. We
  should at minimum document the contract and gate the preview
  resolution by a `previewQuality` setting.
- **T11-7 (P2): Non-destructive draft autosave.** We have quick-save
  and back→save-draft, but no autosave-on-idle. VN's "non-destructive
  drafts with undo/redo" implies the draft is always recoverable. We
  should autosave after a debounce when the document is dirty and the
  user is idle, so a crash never loses work.

## 4. AVFoundation + Media3 Transformer — the native render path

### What they do
- **iOS**: AVFoundation + Core Image / Metal. A chained CIFilter graph
  delivers 1080p30 on an A14 at 5-10 ms/frame. Metal is only needed
  above ~20 effects or 4K60. `AVMutableVideoComposition +
  AVVideoCompositing` routes every output frame through your code
  before display or export.
- **Android**: MediaCodec + OpenGL ES / Vulkan. Media3 Transformer is
  the modern API (replaces the legacy MediaCodec/SurfaceTexture stack).
  Effects and transitions are composable pipeline stages, not
  monolithic render passes — each effect is standalone and unit
  testable in isolation.
- **Three execution paths** (react-native-video-pipeline pattern):
  *Remux* (passthrough copy — no re-encode), *transcode* (native hot
  loop with native overlays), and *compose* (per-frame worklet
  drawing). The cheapest path that satisfies the spec is selected
  automatically.
- **Skia-free by default**: static image/text overlays use CIFilter +
  CATextLayer (iOS) and Media3 BitmapOverlay + TextOverlay (Android).
  Skia is an *optional* peer only for the per-frame compose worklet
  path.

### Upgrade targets for ThryftVerse
- **T11-8 (P0): Native video export via AVFoundation/Media3.** Our
  video export is currently FFmpeg-only on the backend and "deferred"
  on the client. The flagship path is a native Nitro module driving
  AVFoundation (iOS) + Media3 Transformer (Android). This is the
  single biggest gap vs CapCut/VN. We cannot ship a flagship editor
  without it. For Wave 11 we add the **contract** (a Nitro module
  spec) and the **JS-side wiring** so the native module can land in a
  follow-up without touching the editor. (Native Swift/Kotlin code
  still requires Xcode/Android Studio and is out of scope for this
  JS-focused session, but the contract + JS wiring is in scope.)
- **T11-9 (P1): Cheapest-path export selection.** Even with FFmpeg,
  we should pick the cheapest path: if the composition is trim-only or
  mute-only, use `-c copy` remux; only transcode when speed/filters/
  overlays actually changed. This is a real perf win and a flagship
  pattern.

## 5. React Native Skia — offscreen rendering, video frames

### What they do
- `makeOffscreenSurface(width, height)` + `drawOffscreen(surface,
  <Jsx />)` renders Skia drawings offscreen. `image.encodeToBytes()`
  exports PNG/JPEG. This is the JS export path we already use.
- `useVideo(source, { seek, paused, looping })` loads video frames as
  SkImage shared values. **Known limitation**: when the video is
  paused and you seek, `currentFrame` does not update reliably — there
  is a documented workaround using `useAnimatedReaction` to call
  `video?.seek(value)` and then `setFrame(video, currentFrame)`. This
  is exactly the "preview does not reflect reverse/freeze" problem we
  already documented truthfully.
- `makeNonTextureImage()` is required on the snapshot to avoid
  crossing threads (texture is created on the UI thread).
- **react-native-view-recorder** records a specific view (including
  Skia canvases) with AVAssetWriter (iOS) / MediaCodec (Android),
  hardware-accelerated, HEVC support, ~90KB native code. This is a
  viable alternative to a full Nitro video pipeline for the "record
  the preview as-is" use case.

### Upgrade targets for ThryftVerse
- **T11-10 (P1): Skia `useVideo` for freeze-frame preview.** Today we
  tell the user "preview does not hold the frame; freeze is applied on
  export." With Skia's `useVideo` + the seek workaround we can show
  the actual frozen frame in preview by seeking to the freeze
  timestamp and pausing. This makes the preview truthful for freeze
  without faking reverse. (Reverse still cannot be previewed —
  expo-video cannot play backward — but freeze can.)
- **T11-11 (P2): react-native-view-recorder as a fallback export
  path.** If the native Nitro video pipeline is not yet linked, we can
  record the preview view (Skia canvas + expo-video) directly to a
  file. This is not pixel-perfect (it captures the preview resolution,
  not the source resolution) but it is a real export, not a fake one.
  Documented as a fallback tier below the native Nitro path.

## 6. Durable background uploads — URLSession / WorkManager

### What they do
- **iOS**: background `URLSession` hands transfers to a system daemon
  so they continue while the app is suspended. The system relaunches
  the app to deliver events via
  `application(_:handleEventsForBackgroundURLSession:completionHandler:)`.
  Must upload from a file on disk (data/stream bodies are not
  supported in background sessions). `waitsForConnectivity = true`,
  `allowsExpensiveNetworkAccess = false` to respect metered networks.
- **Android**: `WorkManager` is the persistent API for deferrable,
  guaranteed work. It persists requests across reboots, provides
  `Constraints` for network/battery/storage, and built-in backoff.
  Android 14+ requires a `dataSync` foreground service type; Android
  15 caps `dataSync` at 6 hours per 24 hours.
- **Idempotent upload API**: the server returns an upload ID/offset;
  the client does not rely on system-level "resume data" for uploads
  (that exists for downloads, not reliably for uploads). Persist
  upload metadata (file path, checksum, uploadId, offset, chunkSize,
  retry count, last error) to a small on-device DB so restarts can
  reconstruct state.
- **TUS protocol** (tus.io) is the open HTTP standard for resumable
  uploads; S3/R2 Multipart Upload is the cloud-native equivalent.

### Upgrade targets for ThryftVerse
- **T11-12 (P1): Persisted upload metadata.** Even before the native
  background session lands, we should persist every queued upload's
  metadata to a small on-device store (MMKV / SQLite) so a restart
  can reconstruct the queue and retry. This is the durability
  primitive that survives process death.
- **T11-13 (P2): TUS or S3 Multipart for the server side.** The
  backend should expose a resumable upload endpoint (TUS or S3
  Multipart) so the client can resume after a drop. Documented
  contract; implementation deferred.

## 7. Summary — Wave 11 upgrade targets, prioritized

| ID | Target | Priority | Scope (this session) |
|----|--------|----------|----------------------|
| T11-1 | Preview/export parity contract + cross-renderer filter agreement test | P1 | Yes — add a test that proves the 3 inlined filter matrices agree |
| T11-2 | RenderTarget enum (preview vs capture) in composition contract | P2 | Document only |
| T11-3 | Persisted upload metadata (survives process death) | P1 | Yes — MMKV/SQLite store + reconciliation hook |
| T11-4 | Segment-aware upload for long video | P2 | Document only |
| T11-5 | Frame-accurate timeline zoom (pinch to zoom) | P1 | Yes — Reanimated pinch gesture on the timeline |
| T11-6 | Playhead-frame release / proxy preview | P1 | Document + gate preview by `previewQuality` |
| T11-7 | Non-destructive draft autosave (idle debounce) | P2 | Yes — small autosave hook |
| T11-8 | Native video export contract (Nitro spec + JS wiring) | P0 | Yes — contract + JS wiring; native code deferred |
| T11-9 | Cheapest-path FFmpeg export (remux when possible) | P1 | Yes — backend `isCompositionNonTrivial` already exists; extend to pick remux vs transcode |
| T11-10 | Skia `useVideo` for truthful freeze-frame preview | P1 | Yes — replace the "preview does not hold" label with an actual frozen frame |
| T11-11 | react-native-view-recorder as fallback export | P2 | Document only |
| T11-12 | Persisted upload metadata (same as T11-3) | P1 | (merged) |
| T11-13 | TUS / S3 Multipart resumable upload endpoint | P2 | Document only |

### In-scope for Wave 11 implementation (this session)
1. **T11-1** — cross-renderer filter agreement test (frontend + backend)
2. **T11-3** — persisted upload metadata store + reconciliation hook
3. **T11-5** — frame-accurate timeline pinch-zoom
4. **T11-7** — idle-debounce draft autosave
5. **T11-8** — native video export contract (Nitro spec + JS wiring; no native code)
6. **T11-9** — cheapest-path FFmpeg export (remux when trim/mute only)
7. **T11-10** — truthful freeze-frame preview via Skia `useVideo`

### Out-of-scope (documented only)
- T11-2, T11-4, T11-6, T11-11, T11-13

### Anti-AI design check
Every in-scope target maps to a real capability, not a cosmetic one:
- T11-1: a test that proves renderers agree (real correctness)
- T11-3: uploads survive process death (real durability)
- T11-5: pinch to zoom the timeline (real direct manipulation)
- T11-7: autosave so a crash never loses work (real safety)
- T11-8: a contract so native video export can land (real capability gap)
- T11-9: remux instead of transcode (real perf win)
- T11-10: show the actual frozen frame (real preview truthfulness)

No fake progress, no fake AI, no decorative flagship styling.
