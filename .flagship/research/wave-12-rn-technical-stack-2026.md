# Wave 12 — RN/Expo Technical Stack Audit for Flagship Video/Photo Editor + Upload Pipeline

**Audit date:** 2026-09-11 · **Scope:** what's actually shippable on React Native/Expo in Sep 2026
**Evidence classes:** `OFFICIAL` = official docs/changelog/repo · `BLOG` = engineering blog · `COMMUNITY` = issues/PRs/community reports

## Platform baseline (matters for every subsystem)

- **Expo SDK 56** (released 2026-05-21): RN 0.85, React 19.2.3, Hermes v1 default, iOS 16.4+ / Android 7+ min, Xcode 26.4+, Node 22.13+. [OFFICIAL — expo.dev/changelog/sdk-56]
- **SDK 55+ is New Architecture only.** SDK 54 was the last Old-Arch SDK. Every library choice below must be New-Arch compatible. [OFFICIAL — expo.dev/blog/upgrading-to-sdk-56]
- SDK 57 exists (beta/early) — Expo recommends it over 55/56 for a Hermes v1 memory regression fix. [OFFICIAL — expo.dev/changelog/sdk-56]
- Nitro Modules is the 2026 substrate for high-performance native modules: `react-native-nitro-modules` 0.37.x (Aug 2026), ~2M weekly downloads. HybridObjects in C++/Swift/Kotlin, nitrogen codegen, native async/Promise + callbacks. Note **0.35.0 breaking change** (Mar 2026): Kotlin HybridObject rewrite fixing a memory leak; `bigint` → `Int64`/`UInt64` in specs; libraries must re-generate specs. [OFFICIAL — nitro.margelo.com, npm, github.com/mrousavy/nitro/releases/tag/v0.35.0]

---

## 1. VIDEO CAPTURE

### Current state
- **VisionCamera V5** is the flagship camera lib (latest ~v5.0.11). Full Nitro rewrite; ~3,000 LOC of hand-written JSI/C++ deleted; native calls ~15x faster than TurboModules, ~60x faster than ExpoModules. V4 is archived (no longer maintained). [OFFICIAL — github.com/mrousavy/react-native-vision-camera/releases/tag/v5.0.0]
- New **Constraints API** replaces the removed Formats API — you declare intent (`{ fps: 60 }`, `{ videoDynamicRange: ANY_HDR }`) and the session negotiates a supported config; `isSessionConfigSupported(...)` for upfront checks. [OFFICIAL — visioncamera.margelo.com/docs/video-hdr]
- Frame processors now run on **`react-native-worklets`** (Software Mansion), not `react-native-worklets-core`; you can mutate Reanimated shared values directly from a frame processor. Plugins are Nitro modules. `runAsync` + `runAtTargetFps` are the throttling primitives (frameProcessInterval prop gone). Budget: 33 ms @30fps, 16 ms @60fps, ~4 ms @240fps. [OFFICIAL + BLOG — visioncamera.margelo.com/docs/frame-output, reactnativerelay.com 2026 guide]
- **Multi-cam**: `createCameraSession(true)` + `supportedMultiCamDeviceCombinations` → front+back PiP capture where hardware allows. [OFFICIAL — docs/content/docs/multi-camera.mdx]
- HDR: `videoDynamicRange` constraint; 10-bit pipelines, HLG/PQ transfer functions, Apple EDR. Also RAW (DNG/ProRAW), depth streaming (LiDAR/ToF/IR), in-memory Photo objects (no temp files), Skia frame processors (`useSkiaFrameProcessor`, `DrawableFrame` — draw shaders/text directly onto frames). [OFFICIAL — visioncamera.margelo.com]

### What's possible
Real-time ML/filters at 60fps, dual-cam PiP, 4K/8K capture, 240fps slo-mo, HDR video capture, per-frame Skia drawing that lands in recorded output.

### What's NOT possible / requires native
- **Not in Expo Go** — requires dev build (CNG config plugin) or bare. [OFFICIAL]
- No video *editing* — capture only.
- expo-camera by contrast: Expo Go + web capable, photo/video capture, barcode scan, `videoBitrate`/`maxDuration`/`maxFileSize`/mirror — but **no frame processors, no HDR, no configurable FPS, no AE/AF/AWB lock, no multi-cam, no RAW, no depth**. Fine for simple capture; insufficient for an editor-grade camera. [OFFICIAL — visioncamera.margelo.com/docs/visioncamera-vs-expo-camera, docs.expo.dev/v55 camera]

### Recommended path
**VisionCamera V5** (`react-native-vision-camera` + `react-native-worklets` + `react-native-nitro-modules`) for the capture surface; keep expo-camera only if a trivial fallback capture path is needed. Skia frame processor for live filters/overlays burned into recorded video.

---

## 2. VIDEO PLAYBACK / SCRUBBING (expo-video)

### Current state (SDK 56, expo-video 56.1.x)
- `generateThumbnailsAsync(times, options)` — iOS **and** Android; generates multiple thumbnails in one call, `maxSize` option; returns native image refs usable by expo-image. (SDK 54 single-number-arg crash fixed in SDK 55, PR #42694.) [OFFICIAL — docs.expo.dev/v56 video, expo PR #31807, issue #43372]
- **Seek precision**: setting `player.currentTime` is exact-seek; `seekBy(s)` is relative and approximate (keyframe/buffer-dependent). `seekTolerance {toleranceBefore, toleranceAfter}` controls precision (default 0/0 = exact); SDK 56 adds **`ScrubbingModeOptions`/`scrubbingModeEnabled`** — pause + raise tolerance while scrubbing for performance. [OFFICIAL — docs.expo.dev video; COMMUNITY — expo discussion #33684, issue #37794/PR #37672]
- `playbackRate`: **0–16.0** float (iOS AVPlayer `defaultRate`, iOS 16+; Android ExoPlayer). [OFFICIAL — VideoPlayer.types.d.ts]
- HDR playback via `VideoRange` ('sdr'|'hlg'|'pq'); `maxResolution` cap; Android `videoChangeFrameRateStrategy` fixes adaptive-refresh displays capping the whole app at 30 Hz (Pixel 9/10); iOS `VideoAssetTransportProvider`; PiP + background audio via config plugin. Works in Expo Go. [OFFICIAL — expo-video CHANGELOG, docs]

### What's possible
Frame-accurate-enough scrubbing (exact `currentTime` seeks + thumbnails strip), speed ramp preview 0–16x, HDR-aware playback, PiP.

### What's NOT possible / requires native
- **No trim/export/transcode/composite/filters — expo-video is playback-only.** No API writes a file. [OFFICIAL — absence in v56 API surface]
- Thumbnails are in-memory image refs for display, not a disk frame-extraction pipeline.
- No multi-player sync guarantees for A/B clip preview; overlapping `VideoView`s with `contentFit="cover"` have a known Android bounds bug (workaround: `surfaceType="textureView"`). [OFFICIAL — docs known-issues]
- `seekBy` not frame-accurate — use `currentTime` for edit-point seeks.

### Recommended path
expo-video for preview + scrub UI (thumbnails via `generateThumbnailsAsync`, exact seeks via `currentTime`, scrubbing mode). For buttery timeline scrubbing at 60fps, consider Skia `useVideo` decode path instead (below) — but expo-video is the correct default player.

---

## 3. OFFSCREEN RENDERING / COMPOSITION (react-native-skia)

### Current state
- `@shopify/react-native-skia` 2.x (2.11.x current). Offscreen: **`makeOffscreenSurface(w,h)` + `drawOffscreen(surface, <jsx/>)` → `SkImage`** → `encodeToBytes()`/`encodeToBase64()` — real offscreen image export. [OFFICIAL — shopify skia docs/canvas/offscreen]
- Canvas snapshot: `canvasRef.current.makeImageSnapshot()` / `makeImageSnapshotAsync()`; **`makeImageFromView(viewRef)`** captures arbitrary RN view hierarchies to SkImage (native; web needs callback). [OFFICIAL — skia src/skia/core/Image.ts 2.11.x]
- **`useVideo(uri, {paused, seek, looping})`** → `currentFrame: SharedValue<SkImage|null>`, `currentTime`, `duration`, `framerate`, `rotation`, `size`. Frames usable anywhere a SkImage is accepted (Image, ImageShader, Atlas) — so video frames + overlays + text + shaders composite in a Canvas at display rate. [OFFICIAL — skia docs/images/video]

### What's possible
- GPU-composited preview: video frame layer + image overlays + text + shaders in one Skia scene, driven by worklets/shared values.
- Offscreen still-image export of any composition (thumbnails, poster frames, photo edits).

### What's NOT possible / requires native
- **Skia cannot encode video — no muxer/encoder.** `drawOffscreen` yields images, not an .mp4 stream.
- `useVideo` seek-while-paused does **not** refresh `currentFrame` (known limitation; workaround: `useAnimatedReaction` calling `video.seek()` + updating `currentTime`). [COMMUNITY — Shopify/react-native-skia discussion #3048]
- `useVideo` decode is a convenience path, not an export-grade frame pump — for deterministic per-frame export you need an encoder loop (see §4).
- Skia compositing alone can't carry audio.

### Recommended path
- **Preview**: Skia Canvas composition (video frame + overlays) OR expo-video + RN overlay views for simpler stacks.
- **Export with per-frame Skia drawing**: **`@azzapp/react-native-skia-video`** (actively forked as `sheunglaili/react-native-skia-video`): `useVideoCompositionPlayer` for preview + `exportVideoComposition({composition, drawFrame /*worklet*/, bitRate, frameRate, width, height, mixAudio})` — encodes composited frames to mp4, AAC audio mixing supported (PR #34, Oct 2025). Android encoder caps via `getValidEncoderConfigurations()`. [REPO — github.com/AzzappApp/react-native-skia-video]

---

## 4. NATIVE VIDEO EXPORT

### Current state — what teams actually ship in 2026
The 2026 pattern is **platform-native engines via Nitro/Expo modules, not FFmpeg**:

| Library | Engine | Notes |
|---|---|---|
| `react-native-video-pipeline` (nightlybuildgroup) | AVFoundation + Media3 Transformer, Nitro | Trim/flip/stamp/compose/synthesize/probe; 3 auto-selected paths: **remux** (passthrough), **transcode** (native overlays: CIFilter+CATextLayer / BitmapOverlay+TextOverlay), **compose** (per-frame worklet drawing, optional Skia w/ Metal blit fast path). New Arch only, iOS 13+/API 24+. |
| `react-native-media-toolkit` (thangdevalone) | AVAssetExportSession/AVMutableVideoComposition + Media3 Transformer/Presentation, Nitro | Trim/crop/rotate/compress/thumbnail/concat; passthrough trims in <1s; handles iOS HEVC concat FFmpeg's demuxer can't. |
| `expo-video-clipper` (Dr-Drake) | AVAssetExportSession + Media3 Transformer, Expo Modules | Clip + N-thumbnail strip + progress events + cancel; SDK 52+. |
| `@hortemo/expo-media3-transformer` | Media3 Transformer (Android only) | Clipping config, Presentation aspect-ratio/crop, FrameDropEffect, audio processors, encoder settings. |
| `@azzapp/react-native-skia-video` | Hardware encoders + Skia | Full per-frame composition export (see §3). |

[REPO/OFFICIAL — GitHub repos listed]

### Underlying native patterns
- **iOS**: `AVMutableComposition` (track assembly) + `AVMutableVideoComposition` + `CALayer` animationTool (overlays/text) + `AVAssetExportSession` (presets or `Passthrough` remux). Frame-level pixel work → `AVAssetReader`/`AVAssetWriter`. [OFFICIAL-adjacent — standard AVFoundation, corroborated by all libs above]
- **Android**: Media3 **Transformer** — `Composition`/`EditedMediaItemSequence`, `Presentation` (crop/scale), `BitmapOverlay`/`TextOverlay`, effects, encoder settings; auto-selects passthrough muxer when no effects. [OFFICIAL — developer.android.com Media3]
- **Progress**: KVO on export session progress (iOS), `Transformer.getProgress` polling (Android) — surfaced to JS via module events.

### FFmpeg status — verified
- **ffmpeg-kit repo archived 2025-06-23 (read-only).** Maven/CocoaPods binaries for 4.x/5.x were deleted → CI builds break; 6.x artifacts still downloadable. [OFFICIAL — github.com/arthenica/ffmpeg-kit, issue #1099]
- **Official continuation: FFmpegKitNext** (`github.com/arthenica/ffmpeg-kit-next`, ~121 stars, July 2026 README notice) — actively maintained by original author, **source-only distribution** (you build binaries), RN folder present. [OFFICIAL — repo]
- Community forks repackage 6.x binaries (e.g. `@nikhil-cephei/ffmpeg-kit-react-native` 6.0.12 full-gpl). Legal caveat from the retirement post still applies: **LGPL/GPL + codec patent exposure**. [COMMUNITY — npm]
- **ffmpeg.wasm on mobile: not viable.** ~30 MB gzipped core; needs SharedArrayBuffer/COOP+COEP headers (unavailable inside RN anyway); whole input file buffered in memory (~100–200 MB practical ceiling, mobile crashes); single-thread fallback 3–4× slower; documented thread-pool deadlocks; CPU-only encoding. Even in-browser mobile Safari is unreliable. In RN there is no supported wasm runtime path — **do not plan around it**. [BLOG — asadqi.com ffmpegwasm-in-production, clearrec.app 2026 guide, ffmpeg-micro.com]

### What's NOT possible / requires native
- No turnkey "Premiere-in-a-box" lib. Multi-track timelines with transitions/keyframed effects beyond per-frame compose still need custom native (or accept the compose-worklet path).
- HEVC/HDR passthrough edge cases differ per engine; Android passthrough cuts are keyframe-aligned only.

### Recommended path
**Primary:** a Nitro (or Expo Modules) wrapper around **AVFoundation export + Media3 Transformer** — either adopt `react-native-video-pipeline`/`react-native-media-toolkit`/`expo-video-clipper` or write a thin custom module for exact trim/crop/overlay/compress/concat needs.
**Compositor export:** `@azzapp/react-native-skia-video` when the editor needs arbitrary drawn frames.
**Avoid:** ffmpeg-kit except as last resort (licensing + dead artifacts + tens-of-MB binary); ffmpeg.wasm entirely.

---

## 5. UPLOAD PIPELINE

### Current state
- **Protocols**: `tus` (tus-js-client runs in RN with light adaptation; Supabase Storage speaks tus natively) vs **S3/R2 multipart** (parts 5 MB–5 GB, presigned URLs, ETag bookkeeping, ≤5 TB objects). S3 multipart is the right default when writing to cloud storage; tus when hitting tusd/Supabase. [BLOG — rorklab.net large-file-upload guide]
- **expo-file-system** (new API stable since SDK 54; legacy API at `expo-file-system/legacy`): `File`/`Directory` classes; `File` implements `Blob` → works directly as `expo/fetch` body. **`File.createUploadTask(url, options)`** — binary + multipart uploads, progress callbacks, `cancel()`/`AbortSignal`; `createDownloadTask` adds pause/resume via HTTP Range + `DownloadPauseState` persistence + `fromSavable()` restore. `sessionType: 'background'` (iOS) continues while suspended — but the JS UploadTask/callbacks are NOT restored after relaunch. [OFFICIAL — docs.expo.dev filesystem, expo blog "expo-file-system", expo PR #44055]
- **expo/fetch**: WinterCG-compliant; installed as **global fetch in SDK 56**; supports `File` bodies; streaming upload of FileSystem files fixed via PR #43361 (previously OOM'd >~50 MB). **No background sessions.** [OFFICIAL — docs.expo.dev/sdk/expo, expo changelog SDK 56; COMMUNITY — issue #43358]
- **RN fetch/FormData**: no `File` support, base64-bridged file bodies (slow), no request streaming — avoid for large media. [OFFICIAL — expo image-upload-example README]
- **expo-background-task** (replaces deprecated expo-background-fetch since SDK 53): WorkManager (Android, min interval **15 min**) + BGTaskScheduler (iOS, interval is a hint — ~12 h default, system-decided, physical device only). For deferred maintenance work, **not** for pushing a 1 GB upload. [OFFICIAL — docs.expo.dev background-task, expo blog goodbye-background-fetch]
- **Real background upload**: iOS background `URLSession` requires **file-on-disk body** (no streams/data), delegate API, and completion reconciles on next launch (JS is gone). Android needs a `dataSync`/`mediaProcessing` **foreground service** (typed FGS required Android 14+; Android 15 caps at 6 h/24 h, then `Service.onTimeout`; start from user gesture for full budget). [BLOG — dev.to masonwritescode RN video upload guide]
- Shipping libs: **ferrykit** (survives app kill/reboot, New Arch, reattach API), **react-native-nitro-cloud-uploader** (Nitro; S3-compatible multipart, 5 MB parts, foreground service + notifications, pause/resume/cancel), **react-native-s3-bg-uploader** (Nitro+Rust; `BGContinuedProcessingTask` on iOS 26+). [REPO — GitHub]

### What's NOT possible / requires native
- No pure-JS path survives process death. Background completion → reconcile server-side state on relaunch (multipart UploadId/ETags or tus offset HEAD).
- expo-background-task cannot be repurposed as an upload engine (interval-gated, battery-gated).
- iOS background upload APIs don't run on Simulator.

### Recommended path
**S3/R2 multipart, 5 MB+ parts, native transfer layer**: `File.createUploadTask`/expo-file-system for foreground uploads; ferrykit or nitro-cloud-uploader for kill-surviving background; backend issues presigned part URLs; persist upload session state; reconcile on relaunch. Chunking per-part ≥5 MB (S3 minimum); parallel parts where radios allow.

---

## 6. MEDIA PROCESSING (images & thumbnails)

### Current state
- **expo-image-manipulator**: `resize`/`rotate`/`flip`/`crop` (+ web-only `extent`); chainable `ImageManipulatorContext` (SharedObject) → `renderAsync()` → `saveAsync()`; JPEG/PNG/WebP output. **No** filters, blending, text, or multi-image compositing. [OFFICIAL — docs.expo.dev/v55 imagemanipulator]
- **expo-video-thumbnails**: **deprecated — removed in SDK 56**; use `expo-video`'s `generateThumbnailsAsync`. [OFFICIAL — docs.expo.dev video-thumbnails]
- Photo-level edits beyond crop/rotate: Skia offscreen (`drawOffscreen`) or Nitro image libs (e.g. react-native-nitro-image) — VisionCamera V5 photos convert via nitro-image. [OFFICIAL — skia docs, VC v5 release notes]

### On-device vs server-side FFmpeg tradeoff
- **On-device native (AVFoundation/Media3)**: free, hardware codecs, no upload roundtrip, no license issues — covers trim/crop/rotate/overlay/compress/concat/thumbnails. Default for user-authored exports.
- **On-device FFmpeg**: only when native filters genuinely can't express the op; pay LGPL/GPL + binary size + self-hosted builds.
- **Server FFmpeg**: normalization for feed consistency, exotic codecs, heavy batch, audio mastering — async post-upload job; never on the export critical path if avoidable.
- **ffmpeg.wasm**: out entirely (see §4).

### Recommended path
expo-image-manipulator for simple photo ops; Skia `drawOffscreen` for designed exports (watermarks, layouts); `generateThumbnailsAsync` for all video thumbs; native trim/compress via §4 libs; server FFmpeg only for post-upload normalization.

---

## 7. REANIMATED / GESTURE / HAPTICS

### Current state
- **Reanimated 4.x** (4.6.x latest; stable since ~early 2026): **New Arch only** (3.x abandoned for old arch); worklets split into **`react-native-worklets`** (0.12.x pairs with 4.6.x — check compat table); Babel plugin now `react-native-worklets/plugin` (auto-included in Expo templates since SDK 50); new declarative **CSS-compatible animation API** alongside worklets; `useAnimatedGestureHandler` removed (use gesture-handler hooks). Supports last 3 RN versions. [OFFICIAL — docs.swmansion.com migration-from-3.x, compatibility table, swmansion blog "Reanimated 4 Stable"]
- **Gesture Handler 3.x** (3.2.1, Aug 2026): **min RN 0.82**; `GestureDetector` + declarative `Gesture.*` + hooks API; Pressable rebuilt on Touchable; hover callbacks all platforms; AGP 9. GH 2.32+ still maintained for RN 0.84 if needed. [OFFICIAL — swmansion changelog, GH releases v3.2.0]
- **expo-haptics**: `impactAsync`/`notificationAsync`/`selectionAsync` (+ `performAndroidHapticsAsync`); SDK 56 adds web haptics (Safari). [OFFICIAL — expo changelog SDK 56]

### What's possible
UI-thread gestures driving shared values → 120 Hz editor surfaces: pinch-to-zoom canvas, timeline trim handles with spring physics (`withSpring`), snap/detent via `useDerivedValue` + haptics fired on state-change commit points (not per frame).

### Constraints
- Reanimated 4 = New Arch only; library compat must be checked per RN version.
- Frame processors (VisionCamera) and Reanimated share `react-native-worklets` — one runtime family to rule both.

### Recommended path
reanimated 4.6.x + react-native-worklets 0.12.x + gesture-handler 3.x + expo-haptics for commit-point feedback.

---

## DECISION TABLE

| Subsystem | Recommended stack | Confidence | Risk |
|---|---|---|---|
| Video capture | VisionCamera V5 + react-native-worklets + Nitro; Skia frame processor for live effects | High | Dev-build only (no Expo Go); V5 API churn vs V4 tutorials |
| Video playback/scrub | expo-video (SDK 56): currentTime exact seeks, seekTolerance, scrubbingMode, generateThumbnailsAsync | High | No editing surface — playback only; overlapping-cover Android bug |
| Composition preview | Skia Canvas + `useVideo` frames (paused-seek workaround) or expo-video + RN overlays | Med-High | `useVideo` paused-seek gap; CPU decode limits |
| Still/image export | Skia `makeOffscreenSurface`+`drawOffscreen`; makeImageFromView | High | None significant |
| Video export | Native AVFoundation + Media3 Transformer via Nitro/Expo module — `react-native-video-pipeline` / `react-native-media-toolkit` / `expo-video-clipper`; `@azzapp/react-native-skia-video` for drawn-frame compositing | Med-High | Young libs (validate maturity); Android passthrough = keyframe-aligned cuts only |
| FFmpeg | Avoid; FFmpegKitNext (source-only) or pinned 6.x fork only if unavoidable | High | Licensing (LGPL/GPL+patents); dead upstream artifacts |
| Upload | S3/R2 multipart ≥5 MB parts + expo-file-system UploadTask; ferrykit / nitro-cloud-uploader for kill-survival; backend presigned URLs + relaunch reconciliation | High | iOS bg needs file-on-disk + reconcile; Android FGS 6h/24h cap; JS callbacks die with process |
| Thumbnails | expo-video `generateThumbnailsAsync` (expo-video-thumbnails removed in SDK 56) | High | — |
| Image ops | expo-image-manipulator (crop/resize/rotate/flip); Skia for designed exports | High | No filters/text in image-manipulator |
| Animation/gesture | reanimated 4.6 + react-native-worklets 0.12 + gesture-handler 3.x + expo-haptics | High | New-Arch only; worklets version pairing must match compat table |
| Server-side | FFmpeg post-upload normalization only | High | — |

## What changed since mid-2025 (delta highlights)
1. VisionCamera V5 shipped (Nitro rewrite; Formats→Constraints; multi-cam; depth; RAW; worklets-core→react-native-worklets).
2. ffmpeg-kit archived (Jun 2025); binaries pulled; FFmpegKitNext is source-only continuation; ecosystem moved to AVFoundation/Media3-native Nitro libs (video-pipeline, media-toolkit, expo-video-clipper).
3. expo-video gained Android thumbnails, seekTolerance/scrubbing mode, HDR range, Pixel refresh-rate fix; expo-video-thumbnails deprecated→removed SDK 56.
4. expo-file-system new API stable w/ UploadTask/DownloadTask (pause/resume, background session type); expo/fetch is global fetch (SDK 56) with File-body streaming upload.
5. Reanimated 4 stable (New-Arch only; worklets split); Gesture Handler 3 (RN 0.82+).
6. SDK 55+ = New Architecture only; SDK 56 = RN 0.85/Hermes v1.
