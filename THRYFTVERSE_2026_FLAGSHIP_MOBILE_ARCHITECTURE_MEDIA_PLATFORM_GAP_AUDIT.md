# THRYFTVERSE — 2026 FLAGSHIP MOBILE ARCHITECTURE, MEDIA & PLATFORM GAP AUDIT

**Repository:** `K17ze/thryftverse-upgrade`  
**Audited branch/ref:** `feat/product-detail-contract-media-device-closure`  
**Audit date:** 22 August 2026  
**Target comparison class:** Instagram, Snapchat, Pinterest, eBay-class mobile products  
**Primary concern:** whether the application has the client, native, media, backend, performance, security, data, ranking and production infrastructure needed to behave like a modern flagship app — not merely whether the UI visually resembles reference applications.

---

## 0. Executive conclusion

Thryftverse is **not an “underdeveloped TypeScript app” simply because GitHub reports ~97.8% TypeScript**. That interpretation is incorrect. A modern React Native application can legitimately contain almost all of its application source in TypeScript while relying on substantial Swift, Kotlin, Objective-C++, C++, Rust and platform code supplied by native dependencies and compiled binaries. GitHub Linguist normally measures source stored in the repository; it does not turn every native library bundled through CocoaPods, Gradle, NPM, prebuilt frameworks or transitive native packages into Swift/Kotlin percentages in your repository chart.

A particularly useful counter-example is eBay Motors: eBay publicly described its production mobile repository as **98.3% Dart and only 0.6% split across Kotlin, Java, Swift and Objective-C**. The lesson is that a cross-platform flagship app does not become flagship by intentionally inflating its native-language percentage. Native code should be introduced where platform APIs, latency, memory, codec access, GPU processing, background execution, security or reliability require it.

The current Thryftverse branch is also **not missing Skia**. It already contains `@shopify/react-native-skia 2.6.2`, VisionCamera v5, VisionCamera-Skia, Reanimated 4, Worklets, Nitro Modules and real Skia-based creator code. The creator camera uses `SkiaCamera`, real frame outputs and GPU color-matrix processing. `CreatorCanvas.tsx` and multiple cutout, filter, waveform, drawing and chart paths are Skia-backed. This is significantly more advanced than a conventional Expo-only app.

The material gap is different:

> **Thryftverse has acquired several flagship-grade client primitives, but does not yet have a complete flagship-grade media and native systems layer around them.**

The largest deficits found in this audit are:

1. **Version-contract drift:** Expo SDK 57 officially targets React Native 0.86, while the audited package pins React Native 0.85.3. This is not an aesthetic issue; it is a support-contract and upgrade hygiene problem.
2. **Native dependency closure is incomplete:** current VisionCamera v5 documentation requires `react-native-nitro-image`, and the current `SkiaCamera` documentation requires the VisionCamera Worklets integration. Those are not declared as direct dependencies in the audited frontend package.
3. **Client video composition/export is not a first-class native subsystem:** Skia is present for display and effects, but no first-class AVFoundation/VideoToolbox/Media3/MediaCodec/FFmpeg-equivalent composition/export implementation was found. Skia itself explicitly points developers to an encoder such as FFmpeg or a Skia-video solution for encoding.
4. **No serious server-side media pipeline was found:** no transcoding/ABR/HLS/DASH/CMAF/HEVC/VP9/AV1 worker implementation or FFmpeg-backed media service was found in the backend dependency surface or repository searches.
5. **Uploads are intentionally incomplete:** the code documents that true background upload is absent, multipart is disabled because backend endpoints do not exist, and large-file slicing currently passes through JS `Blob` handling. This is below Instagram/Snapchat/Pinterest media reliability.
6. **Expo CNG is not the problem, but CNG discipline is:** the app is configured as a generated-native project; therefore every native file/config must be reproducible through config plugins/modules. `app.config.js` references Android XML security/backup resources that are not tracked at their stated paths, while the TrustKit plugin still contains replacement certificate hashes and documents an external native dependency prerequisite.
7. **Offline “ready-to-render” data is underpowered:** MMKV + persisted TanStack Query are useful but not a substitute for a transactional local database/model cache for inbox, feed, drafts, media jobs, product state and offline-first synchronization at Snapchat/Pinterest complexity.
8. **Video consumption infrastructure is much thinner than flagship competitors:** there is no evidence of a shared player manager/pool, ABR ladder, viewport-aware rendition selection, rebuffer/startup telemetry, prewarming strategy, codec capability matrix or dedicated CDN media control plane.
9. **Security needs platform attestation:** certificate transport hardening exists conceptually, but App Attest/DeviceCheck and Play Integrity were not found. For a marketplace with wallets, payments, auctions, co-own and high-value actions, client integrity should become a risk signal.
10. **Performance needs production user-perceived metrics and native benchmark gates:** Sentry, Expo Observe and internal metrics are present, but the branch does not show Pinterest-style “Visually Complete” coverage, Snapchat-style open-to-camera/tail-performance tracing, Android Macrobenchmark/Baseline Profile infrastructure, or equivalent iOS native metric gates.
11. **Recommendation/search maturity is still startup-class rather than Instagram/Pinterest-class:** the backend has a recommendation service and Meilisearch, but a true large-scale candidate-generation/ranking/diversity/exploration/embedding/experiment system is not evident.
12. **Production infrastructure is respectable for an early-to-mid-stage product but not hyperscale:** Fastify/Postgres/Redis/BullMQ/MinIO/S3-style storage and WebSocket/SSE are credible foundations. They are not yet the media, event, cache, service isolation, rollout and data-plane systems of the reference apps.

### Overall audit score

These scores reflect **architecture and implementation maturity on the audited branch**, not business potential.

| Area | Current audit score | Target interpretation |
|---|---:|---|
| React Native client foundation | **8.0/10** | Strong modern base |
| UI rendering / animation primitives | **8.0/10** | Skia/Reanimated/Gesture/FlashList are strong |
| Camera capture foundation | **8.2/10** | VisionCamera v5 + Skia path is modern |
| Creator image composition | **7.4/10** | Real capability, needs authoritative render/export contract |
| Creator video composition/export | **3.5/10** | Biggest client media gap |
| Upload resilience | **4.5/10** | Real queue/retry, but background + multipart backend incomplete |
| Feed/list rendering | **7.5/10** | FlashList/expo-image usage is good |
| Video feed/playback system | **4.0/10** | Needs pooling, ABR, prefetch, telemetry, rendition control |
| Offline/local data | **4.5/10** | KV/query persistence ≠ ready-to-render local model store |
| Realtime/messaging | **6.7/10** | Real foundations, requires deeper reliability/security validation |
| Commerce/product architecture | **7.0/10** | Broad functional surface; not the primary technology deficit |
| Backend API foundation | **6.8/10** | Strong startup/scale-up stack |
| Media backend | **2.8/10** | Major missing platform |
| Recommendations/personalization | **4.2/10** | Needs dedicated retrieval/ranking platform |
| Search | **5.5/10** | Meilisearch is useful, not Pinterest/eBay search maturity |
| Mobile security / anti-abuse | **5.0/10** | Good intentions; release blockers and attestation gaps remain |
| Observability/performance engineering | **6.2/10** | Good tools, insufficient flagship metric closure |
| Test/release engineering | **6.5/10** | Better than average, needs native perf + visual-device matrix |
| Global scale/reliability platform | **4.5/10** | Appropriate early architecture, far from reference-company scale |
| **Whole-app flagship systems readiness** | **6.1/10** | Stronger than “basic RN app”; not yet Instagram/Snap/Pinterest/eBay-class |

The most efficient route is **not a React Native rewrite and not an “Expo purge.”** It is a targeted platform program: maintain React Native/Expo CNG for product UI, then build native media, transfer, security and performance modules around it, plus a proper server media plane.

---

# 1. What was audited

The review inspected the branch’s package contracts and representative implementation paths including:

- root monorepo package contract;
- `frontend/package.json` and lockfile;
- Expo app configuration and CNG config plugins;
- `frontend/App.tsx` bootstrap and observability work;
- creator canvas and camera paths;
- Skia integrations;
- VisionCamera v5 integrations;
- creator upload manager and multipart uploader;
- discovery grid and Looks Explore implementation;
- backend API package surface and backend architecture documentation;
- recent branch/merge commit history and recent UI/architecture changes;
- supplied reference screenshots covering Pinterest-like discovery/saved/profile, Instagram-like profile/settings/inbox, and eBay-like product/message flows.

Repository-wide searches were also used for the presence/absence of major implementation concepts such as:

- FFmpeg/transcoding;
- AVFoundation export / AVAssetExportSession;
- MediaCodec / VideoToolbox;
- HLS/ABR;
- Nitro Image;
- VisionCamera Worklets package;
- native background work;
- local SQL database;
- Baseline Profiles/Macrobenchmark;
- App Attest / Play Integrity;
- GraphQL;
- first-class media encoding/export services.

An absence found by code search does **not** prove no equivalent internal implementation can exist under an unrelated name. Therefore this report distinguishes “not found on audited branch” from “definitively impossible.”

---

# 2. The TypeScript percentage is not the problem

## 2.1 Why GitHub’s language chart is misleading as a quality metric

The language chart primarily answers:

> “What languages are the source files stored in this repository written in?”

It does **not** answer:

> “How much native code executes inside the final binary?”

A React Native app can import a package implemented in Swift/Kotlin/C++ and the repository can remain 98% TypeScript. CocoaPods, Gradle artifacts, native `.framework`/`.xcframework`, `.aar`, prebuilt Skia binaries, Hermes, CameraX, AVFoundation bindings and Nitro modules do not necessarily appear as application-owned Swift/Kotlin in the language chart.

Your current stack already demonstrates this:

- React Native itself contains major C++/platform code.
- Hermes is native runtime technology.
- React Native Skia ships compiled Skia native binaries.
- VisionCamera v5 is implemented with native AVFoundation/CameraX and Nitro.
- Stripe and LiveKit contain substantial native/platform implementation.
- Expo modules contain native Swift/Kotlin.
- Reanimated and Worklets move critical work outside ordinary React JS execution.

Therefore, the goal **must not be** “make the repo 20% Swift/Kotlin/C++.”

## 2.2 eBay directly disproves that rule

eBay publicly reported a production eBay Motors mobile repository with roughly:

- 98.3% Dart;
- 1.1% scripts/CI/automation;
- only 0.6% Kotlin/Java/Swift/Objective-C.

eBay’s point was precisely that native plugins should be used when required while the vast majority of product code remains shared.

That is structurally analogous to what a mature Thryftverse architecture should become: TypeScript-heavy product/domain code with deliberately chosen native systems modules.

## 2.3 What native code Thryftverse *should* own

Native source should appear when there is a concrete reason:

### iOS
Swift / Objective-C++ modules are justified for:

- background `URLSession` upload;
- AVFoundation composition/export;
- VideoToolbox hardware encode/decode control;
- Core Image / Metal effects where Skia is not the best interface;
- App Attest / DeviceCheck;
- MetricKit and OS signposts;
- custom media metadata / HDR handling;
- specialized audio session routing;
- keychain/Secure Enclave operations not represented by generic APIs.

### Android
Kotlin / C++ modules are justified for:

- WorkManager-backed background uploads;
- Media3 Transformer / MediaCodec composition/export;
- codec and HDR capability probing;
- Play Integrity;
- Baseline Profile and Macrobenchmark modules;
- foreground services where legitimately required;
- low-level camera/media integration;
- native caches or byte-range streaming readers.

### C++ / Rust
Use only when profiling/security/cross-platform low-level reuse makes them valuable:

- codec/media parser glue;
- cryptographic core;
- highly reusable image/video algorithms;
- low-latency cross-platform transforms;
- safety-critical parsers.

**There is no useful target percentage.** If a high-quality solution leaves the application 96–99% TypeScript, that is acceptable.

---

# 3. Expo: keep it, but stop treating “Expo” and “Expo Go” as the same thing

## 3.1 The common misconception

“Expo limits flagship apps” is partly based on the old managed-workflow era.

In 2026, there are three different concepts that should not be conflated:

1. **Expo Go** — intentionally constrained runtime and not suitable for arbitrary production native integration.
2. **Expo framework/libraries/tooling** — libraries, CLI, routing/build/update tooling that can be used in real native apps.
3. **Continuous Native Generation (CNG) + development builds** — generates real iOS/Android native projects and allows native modules/config plugins/custom platform code.

Expo’s own 2026 documentation explicitly states that Expo Go is not the production-grade path for custom native functionality and recommends development builds for real projects. CNG can generate native projects with arbitrary customizations.

## 3.2 Thryftverse already behaves like a native-capable Expo app

The audited frontend uses:

- Expo SDK 57;
- `expo-dev-client`;
- native third-party packages;
- VisionCamera;
- Skia;
- Nitro;
- Stripe;
- LiveKit;
- Sentry;
- CNG config plugins;
- EAS update fingerprinting and signing configuration;
- custom config plugins.

That is **not** “Expo Go app architecture.”

## 3.3 The actual CNG risk found in the branch

CNG makes native configuration reproducibility non-negotiable.

`app.config.js` references:

- `@xml/network_security_config`
- `@xml/backup_rules`
- `@xml/data_extraction_rules`

and comments point to paths under `frontend/android/app/src/main/res/xml/...`.

However, the audited branch does not track an Android native project at that path, and the custom plugin folder inspected contains TrustKit/privacy/Hermes-oriented plugins rather than an obvious plugin that creates those three Android XML resources.

This creates a **configuration truth risk**:

- If a clean EAS/prebuild creates native files and those XML resources are not generated, the build can fail or the intended policy can disappear.
- Native hardening must be validated from a **clean `expo prebuild --clean` / EAS build**, not from a developer machine that may contain previously generated files.

## 3.4 Expo recommendation

### Keep:
- Expo SDK/CNG;
- Expo CLI;
- EAS build/update if the release model benefits from it;
- expo-image;
- expo-video where it is sufficient;
- expo-file-system for ordinary file operations;
- expo-secure-store for non-specialized secrets;
- expo-notifications;
- expo-localization;
- expo-haptics;
- Expo UI where it produces correct native behavior.

### Add native modules where required:
- media export;
- background transfer;
- attestation;
- advanced performance measurement;
- codec/HDR metadata;
- specialized local database path if required.

### Consider committing `ios/` and `android/` only if:
- config-plugin complexity becomes harder to verify than native projects;
- platform teams need frequent direct Xcode/Gradle changes;
- custom build targets/extensions become numerous;
- generated project diffs are necessary in code review.

Do **not** eject merely as a prestige signal.

---

# 4. Critical dependency contract issue: Expo 57 + RN 0.85.3

The audited `frontend/package.json` contains:

- `expo ~57.0.13`
- `react-native 0.85.3`
- React 19.2.3

Expo’s current SDK matrix states:

- Expo SDK 57 → React Native 0.86
- Expo SDK 56 → React Native 0.85

The official Expo native upgrade diff similarly changes RN 0.85.3 to 0.86.0 when moving SDK 56 → 57.

## Why this matters

An Expo SDK release is tested around its target React Native version. A mismatch can create:

- native template incompatibilities;
- autolinking/codegen inconsistencies;
- New Architecture incompatibilities;
- subtly wrong package-version resolutions;
- brittle iOS Pod/Android Gradle combinations;
- harder support/debugging.

## Required action

**P0 — normalize Expo SDK 57 to its supported RN 0.86 dependency set.**

Do not jump to RN 0.87 in the production branch simply because 0.87 is the latest React Native release. RN 0.87 was released 11 August 2026; Expo’s stable SDK 57 maps to RN 0.86. Use the stable supported pair first. Evaluate 0.87 via Expo canary only in a dedicated compatibility branch.

---

# 5. Skia audit: present, real, but not yet the whole media engine

## 5.1 What is already correct

The branch includes `@shopify/react-native-skia 2.6.2`.

Skia appears in real code, not only package metadata:

- `frontend/src/creator/CreatorCanvas.tsx`
- cutout mask render/compositor paths;
- filter/LUT/effect previews;
- drawing workspace/canvas;
- color/eyedropper paths;
- audio waveform UI;
- speed-curve UI;
- charting/graphics paths;
- creator camera rendering.

`CreatorCanvas.tsx` uses actual Skia primitives such as Canvas, Path, Image, ColorMatrix, Mask and Skia objects.

This means the earlier concern “we are still not using Skia” is no longer accurate for this branch.

## 5.2 Why visual quality can still feel non-flagship with Skia installed

Skia is a rendering engine, not a design-quality guarantee.

A creator can still feel 6/10 if:

- all effects are modeled as disconnected React state instead of a coherent scene graph;
- text/transform handles lack sub-pixel precision;
- snapping/alignment guides are weak;
- gestures fight the scroll/navigation stack;
- undo/redo is not transactionally modeled;
- the preview and final exported output differ;
- video effects are preview-only;
- export blocks UI or consumes too much memory;
- layer caching is poor;
- images are re-decoded unnecessarily;
- the timeline is not sample/frame accurate;
- color management is not consistent;
- HDR/SDR behavior is not defined;
- transitions are missing;
- output encoding destroys quality.

A flagship creator needs one **authoritative composition document** and deterministic render semantics.

## 5.3 Required creator architecture

Create a single versioned composition contract:

```text
Project
 ├── canvas
 ├── duration/timeline
 ├── colorSpace / HDR policy
 ├── layers[]
 │    ├── media layer
 │    ├── text layer
 │    ├── vector/drawing layer
 │    ├── sticker/product tag
 │    ├── mask/cutout
 │    ├── adjustment/effect
 │    └── audio
 ├── keyframes
 ├── transitions
 ├── audio graph
 └── exportIntent
```

The same document should drive:

1. edit UI;
2. Skia preview;
3. playback preview;
4. thumbnail/poster generation;
5. client flatten/export;
6. server derivative generation;
7. later re-edit/remix.

If preview and export use independent ad-hoc models, visual divergence is inevitable.

---

# 6. VisionCamera audit: modern capture stack, dependency closure needs correction

The current creator camera is one of the stronger parts of the app.

It uses:

- VisionCamera v5;
- `SkiaCamera`;
- photo and video outputs;
- real device selection;
- camera permission flow;
- real GPU frame processing;
- frame disposal;
- Reanimated/Gesture handling;
- multi-capture staging;
- gallery integration;
- speed/green-screen metadata;
- zoom/torch/camera lifecycle.

The camera passes an effect frame processor to `SkiaCamera`, which means effects are not merely a React overlay.

## 6.1 Missing direct dependency: `react-native-nitro-image`

As of this audit, VisionCamera 5.2.3 documentation says VisionCamera Core is built on Nitro Modules and uses `react-native-nitro-image` for photos. It instructs developers to install:

- `react-native-nitro-modules`
- `react-native-nitro-image`

The audited package declares Nitro Modules but does not declare Nitro Image directly.

Even if it happens to be present transitively in a local install, **directly declare required peer/runtime dependencies**. Do not rely on accidental package-tree topology for a camera subsystem.

## 6.2 Verify `react-native-vision-camera-worklets`

Current `SkiaCamera` documentation also lists its Worklets integration as required alongside `react-native-worklets` and `react-native-vision-camera-skia`.

The package declares:

- `react-native-worklets`
- `react-native-vision-camera-skia`

but repository search did not find a direct `react-native-vision-camera-worklets` declaration.

Treat this as a dependency-closure verification item:

- install/direct-pin it if required by the specific installed SkiaCamera version;
- run a clean native build;
- verify no transitive dependency is masking the omission.

## 6.3 Do not put SkiaCamera everywhere

VisionCamera’s own docs distinguish ordinary `Camera` from `SkiaCamera`.

A GPU-composited Skia camera is justified for:

- real-time effects;
- masks;
- overlays that must be rendered into the camera pipeline;
- frame analysis/augmented UI.

For a capture mode that needs no frame processing, a simpler native preview can reduce processing overhead.

Use **capability-based camera surfaces**, not one heavy camera path for every mode.

---

# 7. The biggest missing client system: real video composition and export

This is the single most important architectural gap in the creator stack.

React Native Skia can expose and render video frames. Its official documentation explicitly says that to **encode** video from Skia images, use an encoder solution such as FFmpeg or a Skia-video approach.

The repository search did not find a first-class:

- FFmpeg export implementation;
- AVAssetExportSession-based exporter;
- MediaCodec exporter;
- VideoToolbox encoder path;
- Media3 Transformer composition path;
- equivalent `exportVideo`/composition service.

## 7.1 What Instagram-class media creation does differently

Meta publicly describes Instagram’s client video stage as **flattening the user’s composition into a single video file before upload**. For iPhone HDR, the device encodes HEVC Main 10 and preserves important HDR metadata; the server then creates device/network-specific derivatives including SDR, VP9 and AV1 variants at multiple bitrates.

That lifecycle is substantially more mature than “capture a file, draw effects in preview, upload original.”

## 7.2 Required iOS export architecture

Build a native Swift media module with:

- AVFoundation composition graph;
- `AVMutableComposition` / modern composition equivalents;
- AVVideoComposition/custom compositor when required;
- VideoToolbox hardware encode control for advanced paths;
- Core Image / Metal interop for effects that need it;
- audio mix;
- trim/speed/time mapping;
- frame-accurate overlays;
- orientation normalization;
- HEVC/H.264 policy;
- 10-bit/HDR preservation or explicit SDR tone-map policy;
- metadata preservation;
- deterministic thumbnail/poster frame;
- progress/cancellation;
- background-safe handoff to uploader.

Skia remains the editing/visual rendering layer; native media APIs become the final composition/encode layer.

## 7.3 Required Android export architecture

Build a Kotlin media module around:

- Jetpack Media3 Transformer for supported transformations;
- MediaCodec for lower-level hardware encoder control;
- OpenGL/Skia interop where needed;
- audio muxing/mixing;
- orientation/color/HDR capability handling;
- H.264/HEVC policy based on API/device capability;
- deterministic output validation;
- progress/cancellation.

## 7.4 FFmpeg policy

Use FFmpeg primarily in the **server media worker layer** and only on-device when a platform-native path cannot satisfy a feature.

Reasons:

- binary size;
- licensing/configuration complexity;
- hardware acceleration variability;
- battery and thermal impact;
- duplicated platform capabilities.

A proprietary flagship app may absolutely use FFmpeg, but “install FFmpeg on the phone” is not itself a flagship architecture.

---

# 8. Server media platform: major missing subsystem

The backend currently has a broad product API foundation, object upload endpoints and queues, but no first-class media processing plane was found.

For an Instagram/Snapchat/Pinterest-like app this is not optional.

## 8.1 Minimum media ingestion pipeline

```text
Client
  -> upload intent
  -> background/resumable object upload
  -> media finalize
  -> immutable source asset
  -> media-ingest event
  -> probe/validate
  -> moderation
  -> transcode/derive
  -> thumbnails/poster
  -> waveform
  -> ABR packaging
  -> CDN publish
  -> asset manifest ready
  -> feed/product becomes fully distributable
```

Do not make the API process a video synchronously.

## 8.2 Required worker capabilities

### Probe
- MIME sniffing, not extension trust;
- ffprobe/libavformat equivalent;
- dimensions/duration/frame rate;
- codec/profile/level;
- bit depth;
- rotation;
- HDR/color primaries/transfer/matrix;
- audio stream metadata;
- corruption checks.

### Image derivatives
Use `sharp`/libvips or a dedicated image service for:

- AVIF/WebP/JPEG derivatives;
- responsive sizes;
- marketplace crops;
- thumbnails;
- blur placeholders;
- orientation normalization;
- metadata stripping policy;
- quality tuning.

### Video derivatives
FFmpeg-based worker farm should produce at minimum:

- H.264/AVC compatibility versions;
- HEVC where platform/distribution policy permits;
- VP9 and/or AV1 where ROI justifies it;
- multiple resolutions;
- multiple bitrates;
- audio ladders;
- poster/preview clips;
- normalized frame rate policy.

### Streaming packaging
Add:

- HLS;
- DASH if needed;
- ideally CMAF-compatible segmented media where the delivery design supports it;
- signed/cached manifests;
- CDN edge caching.

### HDR
Decide explicitly:

- preserve HDR source;
- create SDR fallback;
- maintain mastering/content-light metadata where applicable;
- device capability negotiation;
- avoid accidental double tone-mapping.

The absence of an HDR policy is itself a quality risk on current iPhones and modern Android devices.

---

# 9. Upload subsystem: good intentions, not flagship reliability yet

`UploadManager.ts` is a meaningful implementation, not a fake progress wrapper.

It includes:

- persistent job state;
- real file size;
- MIME detection;
- real XHR byte progress;
- retries/backoff;
- idempotent queueing;
- pause/resume semantics;
- a multipart client implementation.

That is good work.

However, the code explicitly documents three limitations.

## 9.1 True background transfer is missing

The manager states that JS may be suspended in background and that true process-kill-surviving upload needs a native module.

Flagship social media creation cannot treat this as “future work.” A user should be able to publish a large video, switch apps, lock the phone, or survive memory pressure without silently losing the transfer state.

### iOS
Use background `URLSessionConfiguration` + file-based `URLSessionUploadTask`.

Apple’s API explicitly supports system-managed uploads while the app is suspended or terminated.

### Android
Use a WorkManager-backed transfer pipeline, with foreground execution only where Android’s long-running task rules require it.

The React/JS UI should observe a native persistent job, not own the transfer lifecycle.

## 9.2 Multipart exists on client but is disabled

The multipart implementation states that backend endpoints are **not yet implemented**.

Therefore:

> The app does not currently have a complete resumable multipart upload path.

Implement:

- initiate;
- part presign;
- list/status or reconciliation;
- complete;
- abort;
- expiration;
- idempotency;
- checksum;
- server-side validation.

Do not trust client ETags/state without reconciliation.

## 9.3 Current multipart chunking is memory-heavy

The client notes it uses:

`fetch(fileUri) -> Blob -> slice`

and that this loads the file into JS memory.

For large video, move byte-range reading/streaming to native code. A 500 MB creator video should not become a JS heap stress test.

## 9.4 Add upload quality policy

Each job needs:

- Wi-Fi/cellular policy;
- Low Data Mode handling;
- battery-aware retry policy;
- network handoff resilience;
- exponential backoff with jitter;
- signed URL renewal;
- file mutation/inode checks;
- checksum;
- app restart recovery;
- telemetry for start → first byte → throughput → pause → retry → finalize;
- user-visible state that cannot lie.

---

# 10. Video playback/feed infrastructure is currently below Pinterest/Instagram class

`expo-video` is useful. It is not the same thing as a complete media feed platform.

Pinterest has publicly described:

- player warming;
- ExoPlayer configuration;
- player pooling;
- cache;
- ABR optimization;
- HTTP/3;
- viewport-aware multi-video management.

Meta has dedicated video decode/render/delivery systems.

Thryftverse needs an app-level **VideoManager**, not individual screens independently mounting players.

## 10.1 Required VideoManager responsibilities

- maximum active decoders;
- one primary audible player policy;
- viewport visibility scoring;
- prewarm next media;
- release far-offscreen media;
- player pool keyed by codec/capability when useful;
- source selection from media manifest;
- thumbnail-to-first-frame transition;
- mute/autoplay/user preference;
- memory-pressure reaction;
- app background handling;
- audio focus/session management;
- picture-in-picture only where product needs it.

## 10.2 ABR

A flagship feed should not download one fixed MP4 for all devices and networks.

Build:

- server rendition ladder;
- HLS/ABR player path;
- per-device max resolution;
- viewport-size-aware rendition ceiling;
- Wi-Fi/cellular adaptation;
- throughput estimation;
- startup bitrate strategy;
- rebuffer feedback loop.

## 10.3 Metrics

Per video:

- time to first frame;
- startup failure;
- rebuffer count;
- rebuffer ratio;
- bitrate switches;
- average delivered bitrate;
- dropped frames;
- decoder errors;
- watch duration;
- exit before first frame;
- cache hit;
- bytes delivered;
- network type;
- device performance tier.

Without those metrics, video quality will regress invisibly.

---

# 11. Networking: move toward media-aware HTTP/3/CDN architecture

Snap and Pinterest have both publicly described QUIC/HTTP/3 work because mobile media traffic benefits from faster connection setup, connection migration and reduced head-of-line problems.

Do not implement a custom QUIC protocol in Thryftverse now.

Instead:

1. choose a CDN/edge provider with HTTP/3;
2. serve media from dedicated immutable CDN URLs;
3. use aggressive cache headers/content hashing;
4. keep APIs small;
5. avoid proxying media through the Fastify API;
6. use signed URLs/cookies where access control requires them;
7. verify platform client stacks negotiate HTTP/3;
8. measure TTFB and transfer reliability before/after.

A “flagship network stack” is primarily a **delivery architecture**, not a fashionable NPM package.

---

# 12. Local data: MMKV is good, but it is not your entire offline architecture

The frontend has:

- MMKV;
- AsyncStorage;
- persisted TanStack Query;
- Zustand;
- explicit offline queues in places.

These are appropriate for:

- settings;
- tiny auth/session snapshots;
- flags;
- small caches;
- UI preferences;
- lightweight state.

They are not ideal as the canonical local model database for:

- conversations/messages;
- inbox thread indexes;
- feed pages/entities;
- product snapshots;
- saved collections;
- drafts;
- creator project manifests;
- upload state;
- notification state;
- optimistic mutations;
- partial-sync cursors.

## 12.1 Add a transactional local database

Recommended first option:

### `expo-sqlite`
Use when:
- you want official Expo integration;
- SQL performance is sufficient;
- native simplicity matters.

Profile before replacing it.

### OP-SQLite / high-performance JSI SQLite
Evaluate when:
- large local datasets or sync pressure make ordinary bridge/API overhead measurable;
- you need a tighter high-throughput SQLite path.

Do not add Realm/WatermelonDB merely because they are popular. Pick one canonical local store and keep the model surface small.

## 12.2 “Ready to render” data

Snap’s rewrite lessons are relevant here: important surfaces should not perform unnecessary initialization and network work before showing useful state.

Thryftverse should be able to open:

- Inbox;
- Saved;
- Home/Discover;
- product recently viewed;
- creator drafts;

from locally valid data immediately, then reconcile in background.

## 12.3 Sync architecture

Introduce:

- entity version / server revision;
- per-domain sync cursor;
- tombstones;
- optimistic mutation log;
- conflict policy;
- idempotency keys;
- freshness budgets;
- bounded local retention;
- media cache metadata separate from model DB.

---

# 13. Feed and masonry rendering: the library choice is mostly correct

The repository contains broad `@shopify/flash-list` usage.

The Looks Explore implementation has:

- FlashList;
- two-column layout;
- deterministic varying aspect ratios;
- mixed spans;
- full-width cinematic/editorial items;
- cursor pagination;
- expo-image caching/recycling;
- low-overlay tiles.

This is directionally correct for the Pinterest/Instagram references.

## 13.1 Important distinction

`DiscoveryGrid.tsx` is still a conventional `numColumns=2` grid. That is acceptable for a product-detail “More like this” section.

Do not force editorial masonry into every commerce grid. The references show two distinct grammars:

- **Pinterest/Instagram Explore:** discovery-first, image-dominant, irregular;
- **eBay commerce recommendations:** regular, comparable, price/product information aligned.

## 13.2 Remaining client list requirements

Across large feeds:

- stable item identity;
- no index-only keys;
- recycling-safe cells;
- no entrance animation per recycled card;
- precomputed or server-provided aspect ratios;
- image downscale variants;
- viewability-driven prefetch;
- skeleton geometry matching content;
- bounded offscreen work;
- no nested same-axis virtualized lists;
- memory tests on low-end Android;
- real scroll FPS telemetry.

Recent commits show the codebase is consciously moving in this direction. That is a strength.

---

# 14. Image pipeline

`expo-image` is a good flagship-capable default. There is no need to replace it simply to appear “more native.”

What matters is the whole pipeline.

## Required server image manifest

For each image, persist:

- original width/height;
- dominant color / blur placeholder;
- orientation;
- content hash;
- moderation status;
- crop/saliency metadata;
- derivative set;
- CDN base;
- AVIF/WebP/JPEG availability.

## Required client behavior

- request pixel dimensions close to rendered size;
- prefetch hero images;
- avoid full-resolution originals in list cells;
- use recycling keys;
- crossfade only when it improves perceived quality;
- preserve image aspect before bytes arrive to avoid layout shift;
- respect device memory class;
- cancel obsolete requests.

## Advanced visual-search path

For Pinterest-like search:

- on-device lightweight embedding/object detection for immediate suggestions where useful;
- server visual embedding retrieval;
- multimodal text+image retrieval;
- category/brand/color/material signals;
- shoppable entity resolver;
- relevance + availability + safety reranking.

---

# 15. On-device ML: ML Kit is not the end state for creator intelligence

The branch contains MLKit-oriented camera capabilities. That is useful for barcode/object/basic CV tasks.

For advanced creator features such as:

- high-quality subject cutout;
- hair/edge segmentation;
- depth-aware blur;
- object relighting;
- garment segmentation;
- pose;
- smart crop;
- semantic masks;
- background replacement;

use dedicated optimized models.

Meta publicly describes deploying ExecuTorch across Instagram/WhatsApp/Facebook and moving features such as Cutouts to modern on-device model infrastructure.

## Recommended architecture

Do not make React components call models directly.

Create:

```text
OnDeviceML
 ├── capabilities()
 ├── segmentSubject()
 ├── embedImage()
 ├── detectObjects()
 ├── estimateDepth()
 └── warmModel()
```

Backends per platform can be:

- ExecuTorch;
- Core ML;
- TensorFlow Lite;
- ONNX Runtime mobile;
- vendor NNAPI/CoreML delegates.

Choose based on model toolchain and benchmark results.

The UI sees a typed result, not a framework.

## Model operations

Need:

- model version manifest;
- staged model rollout;
- download-on-demand where size requires;
- checksum/signature;
- device capability gating;
- memory budget;
- thermal/battery guard;
- fallback;
- model inference telemetry;
- rollback.

---

# 16. Recommendation system: this is one of the largest total-app gaps

A product that wants to feel like Pinterest/Instagram is fundamentally a ranking product.

A static or lightly personalized API cannot reproduce that feeling no matter how polished the UI is.

## 16.1 Minimum multi-stage architecture

```text
User/session context
       |
Candidate generation
 ├─ following/social
 ├─ collaborative
 ├─ content embedding ANN
 ├─ query/category intent
 ├─ trending/fresh
 ├─ marketplace inventory
 └─ exploration
       |
Eligibility / safety / availability
       |
Light ranker
       |
Heavy ranker
       |
Diversity & dedupe
       |
Business/safety constraints
       |
Page assembly
       |
Client feedback events
```

## 16.2 Features

- user embedding;
- session embedding;
- creator/product embeddings;
- visual/text embeddings;
- price affinity;
- brand/category affinity;
- location/shipping feasibility;
- recency;
- social proximity;
- dwell/watch;
- saves;
- hides;
- skips;
- long presses;
- product open;
- add-to-basket/watchlist;
- purchase;
- return/refund negative signal;
- report/safety negative signals.

## 16.3 Do not optimize only CTR

For Thryftverse, feed objectives should balance:

- meaningful discovery;
- save;
- purchase intent;
- creator diversity;
- seller diversity;
- novelty;
- long-term satisfaction;
- safety;
- inventory quality;
- shipping feasibility.

Pinterest’s public recommendation work emphasizes multi-objective ranking and diversity. That is a closer conceptual target than a single engagement score.

## 16.4 Infrastructure path

Early:
- Postgres/Redis + vector DB/pgvector;
- offline embedding jobs;
- simple ranking service.

Scale-up:
- dedicated feature/event pipelines;
- ANN service;
- streaming feature updates;
- model-serving tier;
- experiment framework;
- offline evaluation sets.

Do not prematurely copy “thousands of models.” Build the smallest measured multi-stage system first.

---

# 17. Search: Meilisearch is a good start, not the final visual-commerce engine

The backend uses Meilisearch. That is reasonable for early product search.

To reach Pinterest/eBay-class quality, build a search domain around it.

## Required search capabilities

- typo tolerance;
- synonyms;
- brand/entity aliases;
- structured facets;
- price/range;
- size/condition;
- location/shipping;
- category taxonomy;
- inventory freshness;
- personalization;
- vector/semantic retrieval;
- image-to-item retrieval;
- query understanding;
- query suggestions;
- spell correction;
- safe search/moderation;
- click/purchase feedback;
- zero-result recovery.

Eventually evaluate OpenSearch/Elasticsearch/Vespa or a dedicated vector/lexical architecture only if Meilisearch becomes the limiting component.

Search quality is a data/relevance problem before it is a search-engine brand problem.

---

# 18. API architecture: GraphQL is optional, BFF thinking is not

Repository search did not find GraphQL.

That is **not automatically a gap**.

Instagram/Meta uses GraphQL heavily; eBay has publicly described BFF architecture for mobile. The shared principle is:

> Mobile clients should receive payloads shaped for the screen and network they operate on, not orchestrate dozens of low-level services.

Thryftverse can achieve this using:

- REST BFF endpoints;
- GraphQL;
- typed RPC;
- screen aggregators.

## Recommendation

Keep Fastify REST if it remains clean, but introduce screen/domain aggregation contracts:

- product detail aggregate;
- home feed page;
- profile aggregate;
- inbox summary;
- creator publish bootstrap.

Avoid client waterfalls.

GraphQL is justified if:

- screen payload variation is high;
- multiple clients need flexible field selection;
- schema governance is mature;
- caching/batching are handled deliberately.

Do not add Apollo simply because Meta uses GraphQL.

---

# 19. Backend event architecture: BullMQ is useful, but establish durable domain events

The backend has Redis/BullMQ. This is a sensible scale-up queue.

Do not jump to Kafka because flagship companies use event streaming.

First implement:

## Transactional outbox

When a database mutation requires an event:

1. mutate domain state;
2. write outbox row in same DB transaction;
3. publisher emits from outbox;
4. consumer is idempotent;
5. mark/compact outbox.

Use for:

- order paid;
- listing published;
- media uploaded;
- media ready;
- message created;
- notification due;
- auction state change;
- co-own settlement;
- moderation result.

This prevents “DB committed but queue publish failed” split-brain.

## When to move beyond Redis/BullMQ

Consider Kafka/Pulsar/Redpanda/NATS JetStream when:

- multiple independent consumers need durable replay;
- event volume becomes high;
- long retention/reprocessing matters;
- analytics/ML needs the same canonical stream;
- Redis queue semantics become operationally limiting.

Architecture maturity means adding complexity when evidence justifies it.

---

# 20. Realtime and messaging

The backend exposes realtime mechanisms and the frontend includes LiveKit/WebSocket-oriented capabilities.

For eBay/Instagram/Snap-like messaging, validate these contracts explicitly:

- offline send queue;
- monotonic client sequence;
- server sequence;
- idempotent message creation;
- deduplication;
- delivery state;
- read receipt privacy policy;
- typing expiry;
- attachment upload state;
- attachment moderation;
- message edits/deletes;
- multi-device sync;
- pagination around anchor;
- local DB cache;
- reconnect backfill;
- push notification reconciliation.

## End-to-end encryption

Do not label server-side encryption as end-to-end encryption.

If Thryftverse wants Signal/WhatsApp-class E2EE, that requires a distinct cryptographic protocol and device-key architecture, such as a vetted Signal-protocol/MLS-class design. It is a product/security program, not a UI checkbox.

Marketplace support/dispute/compliance requirements can also conflict with the product implications of E2EE. Decide intentionally.

---

# 21. Security: current config shows good awareness but contains release-critical unfinished work

## 21.1 TrustKit plugin is not production-ready

The audited `withTrustKit.js` contains explicit placeholder SPKI values:

- `REPLACE_WITH_API_THRYFTVERSE_COM_SPKI_SHA256`
- backup pin placeholders;
- CDN pin placeholders.

It also documents that TrustKit must first be installed into the iOS native project through Podfile/SPM.

The plugin itself is primarily adding Info.plist configuration.

Therefore:

**Do not claim certificate pinning is production-enforced until a clean built binary proves the native framework is included and real active + backup pins validate.**

## 21.2 Android network security resources must be generated reproducibly

As described earlier, `app.config.js` references native XML resources.

Create a dedicated config plugin that:

- writes network security XML;
- writes backup rules;
- writes data extraction rules;
- validates production domains;
- rejects placeholders in production;
- adds a CI test that runs prebuild and asserts files exist.

## 21.3 Add App Attest

Apple App Attest provides a platform signal allowing the server to verify requests from legitimate app instances.

Use it selectively for:

- login risk;
- password/security changes;
- wallet load/withdraw;
- payout;
- high-value purchase;
- listing abuse-sensitive actions;
- bid/auction actions;
- suspicious automation.

Do not block unsupported devices blindly; Apple explicitly requires support checks and graceful policy.

## 21.4 Add Play Integrity

Google’s Play Integrity API can provide app/device integrity signals and is explicitly intended to fight tampering, fraud and unauthorized access.

Bind integrity verdicts to server actions, not just app startup.

## 21.5 Other security controls

- passkeys/WebAuthn where product requirements permit;
- Secure Enclave/Keystore-backed sensitive keys;
- server rate limits by identity/device/IP/risk;
- anomaly detection;
- replay-protected high-value requests;
- immutable audit logs for money/ownership changes;
- dependency/SBOM scanning;
- secret scanning;
- CSP/web hardening where relevant;
- signed OTA updates and rollback control;
- least-privilege object storage;
- signed media upload intents.

---

# 22. Payments/wallet/commercial integrity

The backend package surface includes multiple payment providers and the product has wallet/commerce/co-own/auction concepts.

Flagship maturity requires more than SDK coverage.

## Required money invariants

- never represent money in floating point;
- currency + integer minor-unit or decimal library;
- double-entry ledger for wallet-like balances;
- append-only ledger entries;
- idempotent provider webhooks;
- provider event dedupe;
- state machine for payment/payout/refund;
- reconciliation jobs;
- immutable balance derivation;
- chargeback/dispute state;
- KYC/AML rule separation;
- payout holds;
- negative balance policy;
- audit export.

For co-own or asset ownership, the legal/regulatory model must be reviewed separately from software quality. Technology cannot “bypass” financial or securities obligations.

---

# 23. Performance engineering: tools are present; measurement closure is not

The frontend already contains:

- Sentry;
- Expo Observe;
- PostHog;
- startup instrumentation;
- lazy font loading;
- route breadcrumbs;
- FlashList policy work;
- image downscaling;
- visual/test gates.

This is better than an average prototype.

`App.tsx` even documents cold-start frame skipping and moves creator-only font decode work out of the critical path.

## 23.1 Problem with generic “TTI”

The current `markInteractive` call is useful, but flagship apps need **surface-defined user-perceived completion**.

Pinterest’s current 2026 performance work calls this “Visually Complete.”

Examples for Thryftverse:

- Home: first meaningful set of media is displayed.
- Product detail: hero media + price/state + primary action are ready.
- Inbox: thread list text/avatars are ready.
- Chat: latest message window rendered and composer usable.
- Looks: first viewport images/video frames ready.
- Creator: canvas source visible and tools responsive.
- Camera: preview producing stable frames and shutter actionable.

Measure these separately.

## 23.2 Snapchat-style “camera ready”

Snap treats open-to-camera performance as a core feature.

Thryftverse should track:

- process start → JS/runtime;
- JS/runtime → navigation ready;
- navigation → camera session request;
- session request → first frame;
- first frame → controls actionable;
- p50/p90/p95/p99 by device model.

## 23.3 Android Baseline Profiles

Meta publicly reported substantial improvements from Android Baseline Profiles across apps including Instagram. Android officially recommends Macrobenchmark/Baseline Profile tooling.

Add:

- a `benchmark` native module;
- cold-start journey;
- home-scroll journey;
- inbox→chat journey;
- product-open journey;
- camera-open journey;
- creator-open journey;
- generated baseline profile per release;
- CI regression thresholds.

This is one of the highest-ROI native investments available.

## 23.4 iOS native performance

Add:

- MetricKit ingestion;
- signposts around startup/media/navigation;
- hangs;
- memory peaks;
- thermal/battery metrics;
- launch/transition XCTest metrics;
- Instruments repeatable traces for camera/creator/video.

---

# 24. Startup architecture

`App.tsx` has many providers and bootstrap responsibilities. Some are already deferred intelligently.

Snap’s architecture lessons are relevant: each feature competing for startup work eventually makes the whole app slower.

Adopt a startup budget.

## Tier 0 — must happen before first useful frame

- crash/error handler minimum;
- theme tokens necessary for first screen;
- tiny auth snapshot;
- navigation;
- minimum fonts if unavoidable.

## Tier 1 — after first frame

- analytics initialization that can defer;
- support SDK;
- non-critical config;
- creator fonts;
- update checks;
- prefetch based on likely next action.

## Tier 2 — on feature entry

- creator models;
- camera optional processors;
- LiveKit room machinery;
- heavy commerce helpers;
- large search indexes;
- rarely used SDKs.

Every provider/module should declare its startup class and measured cost.

---

# 25. App size and binary hygiene

Skia, VisionCamera, LiveKit, Stripe, Intercom, Sentry, multiple font families and ML/media components can make the binary large.

Flagship means measuring size, not avoiding native libraries.

Add CI budgets for:

- iOS download/install size;
- Android universal and split sizes;
- native library contribution;
- JS bundle;
- image/font assets;
- symbol/debug separation.

Audit fonts carefully. Creator fonts can be downloadable/on-demand if licensing/product behavior permits.

Use Android App Bundles and resource shrinking; verify ProGuard/R8 rules for Skia and native SDKs.

eBay publicly noted a measurable install-conversion penalty as APK size increased. Treat size as a product metric.

---

# 26. Testing: current work is promising, add native and visual rigor

The repo contains E2E/visual/test planning and recent commits converted pending tests into executable ownership checks.

Required production test pyramid:

## Unit/domain
- state machines;
- money;
- upload jobs;
- composition transforms;
- ranking feature logic;
- parsing.

## Component
- React Native Testing Library;
- accessibility state;
- error/loading/empty/data variants.

## Golden/visual
Your references make this essential.

Create deterministic screenshot baselines for:

- Home/Discover;
- Looks masonry;
- product detail variants;
- auction states;
- co-own states;
- profile;
- saved;
- inbox;
- chat;
- settings;
- creator canvas;
- camera permission/ready/error;
- light/dark;
- compact/large device;
- text scaling;
- RTL if supported.

eBay’s public Flutter experience is useful here: they treated screenshot/golden tests as part of production UI quality.

## Native integration
- camera capture;
- video export;
- background upload;
- notification tap;
- deep links;
- Stripe flow;
- App Attest/Play Integrity;
- local DB migration.

## Performance
- Android Macrobenchmark;
- iOS XCTest/MetricKit;
- real-device scroll/media tests.

## Chaos/failure
- kill app mid-upload;
- revoke permission mid-flow;
- 2G/packet loss;
- signed URL expires;
- server 500;
- websocket reconnect;
- payment webhook duplicate;
- media transcode fails.

---

# 27. Reference screenshot comparison

The supplied visual references can be grouped into four product grammars.

## 27.1 Pinterest references

Observed traits:

- irregular visual discovery grid;
- image is the primary navigation element;
- minimal card chrome;
- category rails/intent clusters;
- saved boards organized visually;
- content remains dense without looking like a product spreadsheet.

### Current Thryftverse direction

The updated `LooksTab` is structurally much closer to this than the previous uniform layout:

- two columns;
- variable aspect;
- occasional full-span content;
- minimal overlays;
- cursor pagination;
- expo-image.

### Remaining gap

The screen still depends on backend quality:

- rich ranking;
- content diversity;
- media variety;
- preload;
- video lifecycle;
- visually complete timing;
- saved taxonomy;
- related-item semantic quality.

Masonry alone cannot create Pinterest.

## 27.2 Instagram references

Observed traits:

- simple profile information hierarchy;
- strong media grid ownership;
- settings grouped by user intent;
- inbox row hierarchy and unread signals are restrained;
- chat keeps the content dominant and composer stable.

Recent branch commits explicitly improved:

- settings IA;
- edit-profile scope;
- inbox unread signal;
- chat contextual stack;
- profile/layout concerns.

This is evidence that current UI architecture is converging.

The remaining gap is less “which icon?” and more:

- local ready-to-render inbox;
- reliable real-time reconciliation;
- media messaging pipeline;
- push consistency;
- performance;
- E2EE policy.

## 27.3 eBay references

Observed traits:

- hero media dominates product top;
- compact price/title/state;
- clear one-primary-action hierarchy;
- commerce metadata becomes progressive disclosure;
- seller/chat transaction context is strong;
- recommended items remain regular enough to compare.

Thryftverse should keep its regular product discovery grid in these contexts. Do not turn product-detail recommendations into Pinterest Explore.

## 27.4 Reference-system conclusion

The UI should not use one universal “flagship layout.”

Maintain distinct primitives:

- **Explore Canvas** — Pinterest/Instagram media rhythm.
- **Social Profile/Inbox** — Instagram-style restrained utility.
- **Commerce Detail** — eBay-style state/action certainty.
- **Creator** — Snapchat/Instagram camera/editor performance.
- **Co-own/market** — specialized financial information density.

A flagship app feels coherent because typography, spacing, motion and navigation grammar are shared — not because every surface uses the same card shape.

---

# 28. Design system and “anti-AI” quality

Recent code changes deliberately remove decorative animations and misleading “AI” copy. That is a positive direction.

Common generated-app visual symptoms to continue eliminating:

- every section in a rounded card;
- excessive gradient/blur;
- “AI-powered” labels for deterministic filters;
- too many pills;
- icon badges everywhere;
- decorative entrance animation for static content;
- identical spacing cadence on every screen;
- repeated generic section headings;
- large explanatory copy where the platform conventions are obvious;
- fake “smart” UI without actual model capability.

Flagship UI is usually **more selective**, not more decorated.

Skia should be used where custom drawing is required, not as a blanket replacement for native text/layout.

---

# 29. Libraries / systems to ADD, KEEP, VERIFY or AVOID

## 29.1 ADD / build now — P0/P1

| Technology/system | Recommendation | Why |
|---|---|---|
| `react-native-nitro-image` | **ADD/direct-pin** | Current VisionCamera v5 requirement |
| `react-native-vision-camera-worklets` | **VERIFY + direct-pin if required** | Current SkiaCamera docs list it |
| Native iOS media module | **BUILD** | AVFoundation/VideoToolbox composition/export |
| Native Android media module | **BUILD** | Media3 Transformer/MediaCodec export |
| FFmpeg media workers | **BUILD server-side** | Transcode/derive/inspect media |
| `sharp` / libvips image worker | **ADD backend media service** | Efficient image derivatives |
| HLS/ABR packaging | **BUILD** | Flagship video delivery |
| Native background transfer module | **BUILD** | URLSession + WorkManager |
| S3 multipart backend contract | **COMPLETE** | Resumable large uploads |
| SQLite local model store | **ADD** | Inbox/feed/draft/offline ready-to-render data |
| App Attest / DeviceCheck | **ADD** | High-value anti-abuse signal |
| Play Integrity | **ADD** | Android app/device integrity |
| Android Baseline Profile module | **ADD** | Startup/scroll performance |
| Android Macrobenchmark | **ADD** | Regression measurement |
| iOS MetricKit/signposts | **ADD** | Native performance observability |
| Media capability manifest | **BUILD** | Codec/HDR/device policy |
| VideoManager/player pool | **BUILD** | Feed playback quality |
| Media CDN + HTTP/3 | **CONFIGURE** | Image/video delivery |

## 29.2 KEEP — good current choices

| Current technology | Verdict |
|---|---|
| React Native | **KEEP** |
| Expo CNG/dev builds | **KEEP** |
| React Native Skia | **KEEP / expand as composition renderer** |
| VisionCamera v5 | **KEEP** |
| Reanimated 4 | **KEEP** |
| React Native Worklets | **KEEP** |
| Gesture Handler | **KEEP** |
| FlashList 2 | **KEEP** |
| expo-image | **KEEP** |
| TanStack Query | **KEEP** |
| MMKV | **KEEP for KV, not canonical relational data** |
| Zustand | **KEEP if domain boundaries stay controlled** |
| Fastify | **KEEP** |
| PostgreSQL | **KEEP** |
| Redis | **KEEP** |
| BullMQ | **KEEP at current stage** |
| S3-compatible object storage | **KEEP** |
| Sentry | **KEEP** |
| OpenTelemetry | **KEEP / deepen** |
| PostHog | **KEEP / use for controlled experiments** |
| LiveKit | **KEEP if RTC is product-required** |
| Stripe | **KEEP** |
| Meilisearch | **KEEP until measured limits justify migration** |

## 29.3 VERIFY immediately

- SDK57/RN0.86 alignment;
- Nitro Image;
- VisionCamera Worklets dependency;
- clean CNG prebuild;
- Android XML generation;
- TrustKit native integration;
- real SPKI pins;
- OTA signing production path;
- Skia R8/ProGuard requirements;
- release build with camera + Skia + worklets;
- low-memory Android creator;
- iOS HDR capture/export behavior;
- uploader after process kill;
- media file >500 MB;
- 4K capture policy;
- HEIC/HEVC/AVIF inputs;
- corrupted media;
- device orientation metadata.

## 29.4 DO NOT add just for prestige

- Redux if Zustand/query state is already controlled;
- GraphQL if REST BFF contracts solve the problem;
- Kafka before durable event replay/volume demands it;
- Kubernetes before operational need;
- Rust simply to change GitHub language percentages;
- native navigation rewrite without measured React Navigation problem;
- a second image cache beside expo-image;
- a second animation framework unless a feature truly needs it;
- a second local database;
- “AI UI libraries” without model capability.

---

# 30. Proposed target mobile architecture

```text
┌───────────────────────────────────────────────────────────┐
│                     REACT NATIVE PRODUCT UI               │
│ Navigation / Screens / Forms / Design System / Domain UI  │
│ FlashList / expo-image / Reanimated / Gesture / Query     │
└──────────────────────┬────────────────────────────────────┘
                       │ typed interfaces
┌──────────────────────▼────────────────────────────────────┐
│                    CLIENT PLATFORM LAYER                  │
│                                                          │
│ Camera      Creator Render     VideoManager      Local DB │
│ VisionCam   Skia Scene Graph   ABR/pooling       SQLite   │
│                                                          │
│ Upload      Security           Performance       ML       │
│ BG native   Attestation        native metrics    models   │
└──────────┬──────────────┬──────────────┬──────────────────┘
           │              │              │
           ▼              ▼              ▼
┌───────────────────────────────────────────────────────────┐
│                         MOBILE BFF/API                    │
│ screen aggregates / auth / commerce / social / publish   │
└─────────────┬─────────────────────────────────────────────┘
              │ domain events
    ┌─────────▼────────┐
    │ Transactional    │
    │ Outbox / Queue   │
    └───┬─────────┬────┘
        │         │
        ▼         ▼
┌────────────┐ ┌─────────────────────┐
│ Core data  │ │ Media Platform      │
│ Postgres   │ │ probe/transcode     │
│ Redis      │ │ image derivatives   │
│ Search     │ │ ABR/package/moderate│
└────────────┘ └──────────┬──────────┘
                          ▼
                   Object Store + CDN
                          │
                          ▼
                 HLS / images / assets

              ┌────────────────────────┐
              │ Ranking / Search / ML  │
              │ candidates / embedding │
              │ rank / diversify / exp │
              └────────────────────────┘
```

---

# 31. Proposed creator media architecture

## 31.1 Edit path

```text
Camera/Gallery
   ↓
Source Asset Registry
   ↓
Composition Document
   ↓
Skia Preview Renderer
   ↕
Gesture + Tool State
   ↕
Undo/Redo Transaction Log
   ↓
Native Export Coordinator
   ├─ iOS AVFoundation/VideoToolbox
   └─ Android Media3/MediaCodec
   ↓
Flattened Upload Asset
   ↓
Native Background Multipart Uploader
```

## 31.2 Server path

```text
Original/flattened source
    ↓
Probe
    ↓
Safety/moderation
    ↓
Derivation graph
 ┌──┼───────────────┐
 ▼  ▼               ▼
img video           metadata
    ├─ H264 ladder
    ├─ HEVC/HDR
    ├─ VP9
    ├─ AV1 selected
    ├─ thumbnails
    └─ HLS/DASH/CMAF
        ↓
      CDN
```

---

# 32. Suggested native module boundaries

Avoid one giant `ThryftverseNative` module.

Use narrow contracts.

## `ThryftMediaExport`

```ts
export interface ExportRequest {
  projectId: string;
  compositionUri: string;
  width: number;
  height: number;
  fps: number;
  hdrPolicy: 'preserve' | 'tone_map_sdr' | 'sdr';
  codecPreference: 'auto' | 'h264' | 'hevc';
}

export interface ExportProgress {
  phase: 'prepare' | 'render' | 'encode' | 'mux' | 'finalize';
  fraction: number;
}

export interface ExportResult {
  fileUri: string;
  width: number;
  height: number;
  durationMs: number;
  codec: string;
  bitDepth?: number;
  colorSpace?: string;
  sizeBytes: number;
}
```

## `ThryftBackgroundTransfer`

- enqueue file;
- pause;
- resume;
- cancel;
- observe;
- recover jobs;
- reconcile multipart session.

## `ThryftIntegrity`

- capability;
- request attestation/assertion;
- platform integrity token;
- typed error.

## `ThryftPerformance`

- signpost begin/end;
- report visually complete;
- media first-frame;
- camera ready.

Keep business logic in TypeScript/backend; keep platform mechanisms native.

---

# 33. Backend service decomposition — do not over-microservice yet

Current Fastify backend can remain a modular monolith while domains are stabilized.

Recommended near-term deployables:

1. **API/BFF**
2. **worker**
3. **media worker**
4. **ML/recommendation service**
5. **key/security service**

Separate media workers earlier than ordinary domains because:

- FFmpeg/native binaries;
- CPU/GPU scheduling;
- large temporary files;
- different autoscaling profile;
- different failure patterns.

Do not split “users”, “saved”, “settings”, “profile” into separate network services just because Snap has microservices at global scale.

---

# 34. Production database evolution

Postgres remains appropriate.

Prepare for:

- PgBouncer/connection pooling;
- read replicas where measured;
- partition high-growth tables (events/messages);
- proper indexes from query plans;
- online migrations;
- backup/restore drills;
- PITR;
- logical replication if needed;
- outbox/event tables;
- immutable ledger tables;
- data retention policies.

Redis:
- cache, rate limit, ephemeral presence, BullMQ;
- do not use as source of truth for money/ownership.

Object storage:
- immutable media keys;
- lifecycle policies;
- quarantine;
- multipart orphan cleanup;
- server-side encryption;
- access logs.

---

# 35. Feature flags, experiments and safe rollout

PostHog is already present. Turn it into release discipline.

Every risky subsystem should have:

- feature flag;
- server kill switch;
- device/OS exclusions;
- cohort rollout;
- metric guardrail;
- rollback.

Especially:

- new video codec;
- HDR;
- Skia camera path;
- ML model;
- ranking model;
- background uploader;
- new product detail composition;
- payment provider route.

Snap’s current reliability program publicly emphasizes safe rollout and service-level rigor. Copy the principle, not their scale.

---

# 36. Observability architecture

Every user action crossing systems should carry a correlation ID.

Example publish trace:

```text
creator_publish_tap
  -> export_job
  -> upload_job
  -> upload_intent
  -> multipart parts
  -> media_finalize
  -> ingest_event
  -> transcode_job
  -> moderation
  -> publish_ready
  -> feed_seen
```

Capture:

- trace id;
- user/session pseudonymous ids;
- project id;
- media asset id;
- job id;
- app version;
- native build;
- device tier;
- network;
- experiment cohort.

Do not put sensitive content into telemetry.

Use OpenTelemetry server-side and align client spans/IDs where practical.

---

# 37. Accessibility and internationalization

Current app contains accessibility labels and localization tooling.

Flagship closure requires:

- Dynamic Type / font scaling policy by component, not global disabling;
- screen reader traversal;
- 44/48pt touch targets;
- reduced motion;
- contrast;
- RTL;
- pluralization;
- keyboard avoidance;
- hardware keyboard where relevant;
- accessible charts/financial state;
- creator handles that do not require precision gestures only.

The global `Text.defaultProps` in `App.tsx` currently constrains font scaling. This may protect layout, but a flagship accessibility program should test and intentionally support larger text rather than globally capping most typography to very small multipliers.

---

# 38. Important issue: “allowFontScaling: false” at app level

`App.tsx` applies global Text/TextInput defaults with `allowFontScaling: false` and small max multipliers.

This is visually convenient but is an accessibility risk.

Recommended migration:

1. restore scaling globally;
2. define typography tokens with sensible `maxFontSizeMultiplier` by semantic role;
3. allow body/form copy to scale significantly;
4. cap only highly constrained display/market data where necessary;
5. create screenshot/accessibility tests at 100%, 135%, 170%, 200%.

Flagship quality includes surviving accessibility settings without collapsing.

---

# 39. Camera/creator device matrix

Test real hardware, not simulator-only.

## iOS
- older supported iPhone;
- current base iPhone;
- Pro iPhone;
- front/back;
- ultrawide/main/tele;
- HDR on/off;
- 60/30 fps;
- low light;
- thermal state;
- background/foreground;
- storage nearly full.

## Android
- low-end 4–6 GB RAM;
- Samsung flagship;
- Pixel flagship;
- mid-range Snapdragon;
- vendor with aggressive background killing;
- CameraX quirks;
- API minimum;
- API latest;
- HEVC capable/incapable;
- 10-bit/HDR capable/incapable.

Create capability telemetry rather than hard-coding assumptions from one device.

---

# 40. Performance budgets

Establish hard budgets by device tier.

Example starting targets — these are project targets, not claims about competitors:

| Metric | High-end | Mid | Low |
|---|---:|---:|---:|
| Warm app usable | <500 ms | <750 ms | <1100 ms |
| Product hero visually complete | <800 ms | <1200 ms | <1800 ms |
| Camera first stable frame | <700 ms | <1000 ms | <1500 ms |
| Feed initial meaningful media | <900 ms | <1300 ms | <2000 ms |
| Creator interaction frame budget | 8–16 ms | 16 ms | 16–33 ms |
| Scroll jank rate | <1% | <2% | <4% |
| Video start cached | <250 ms | <400 ms | <600 ms |
| Video start network | <800 ms | <1200 ms | <1800 ms |

Tune after baseline measurement.

Track tails, not only medians.

---

# 41. Production readiness gates

A branch should not be called “flagship production ready” until all P0 gates pass.

## Native/build
- clean SDK57/RN0.86 install;
- clean CNG prebuild;
- iOS release archive;
- Android release AAB;
- no placeholder security values;
- no missing native XML;
- deterministic signing/update config.

## Creator
- deterministic image export;
- real video export;
- preview/export visual parity tests;
- process-safe upload;
- 500 MB+ media test;
- memory budget;
- cancellation/recovery.

## Media server
- source validation;
- transcode worker;
- image derivatives;
- ABR stream;
- CDN;
- failed job recovery;
- moderation gate.

## Security
- real certificate policy;
- App Attest;
- Play Integrity;
- high-value request binding;
- secrets scan;
- dependency scan.

## Performance
- Macrobenchmark/Baseline Profile;
- iOS performance tests;
- visually-complete metrics;
- camera-ready metric;
- feed/video QoE metric;
- app-size budget.

## Data
- local DB;
- offline open;
- mutation queue;
- conflict/idempotency;
- schema migration test.

## Commerce
- ledger invariants;
- payment reconciliation;
- webhook idempotency;
- refund/dispute test;
- auction state race tests.

---

# 42. Prioritized implementation roadmap

## Phase P0 — 1–2 weeks: dependency/build truth

1. Align Expo 57 → RN 0.86.
2. Run `expo install --fix`/doctor and reconcile all SDK packages.
3. Direct-pin Nitro Image.
4. Verify/direct-pin VisionCamera Worklets integration.
5. Clean prebuild both platforms.
6. Create config plugin for Android network/backup/data-extraction XML.
7. Replace TrustKit placeholders or disable enforcement until real pins exist.
8. Prove TrustKit native framework is linked.
9. Add CI `prebuild --clean` verification.
10. Add release build smoke test.

**Exit:** native build is reproducible from the repository alone.

## Phase P0 — 2–5 weeks: media export spine

1. Versioned composition document.
2. iOS export module.
3. Android export module.
4. Skia preview/export parity harness.
5. photo/video metadata contract.
6. export progress/cancel.
7. HDR/SDR policy.
8. output validation.

**Exit:** creator output is a deterministic artifact, not just a preview.

## Phase P0/P1 — 2–4 weeks: upload reliability

1. multipart backend endpoints;
2. checksum/idempotency/reconcile;
3. native iOS background upload;
4. Android WorkManager uploader;
5. native byte-range streaming;
6. process-kill recovery;
7. signed URL renewal;
8. telemetry.

**Exit:** large media can finish reliably without keeping JS alive.

## Phase P1 — 3–6 weeks: server media plane

1. dedicated media worker image;
2. ffprobe validation;
3. FFmpeg transcode graph;
4. sharp/libvips images;
5. HLS ladder;
6. CDN;
7. thumbnails;
8. moderation gate;
9. status manifest;
10. retry/DLQ.

**Exit:** viewing devices consume derivatives, not arbitrary uploader originals.

## Phase P1 — 3–5 weeks: video consumption

1. VideoManager;
2. player lifecycle/pool;
3. prewarm;
4. viewport rules;
5. HLS ABR;
6. QoE telemetry;
7. cache;
8. memory-pressure handling.

## Phase P1 — 2–4 weeks: local database/offline

1. SQLite schema;
2. feed/inbox/draft cache;
3. cursor/sync contract;
4. optimistic mutation log;
5. migrations;
6. offline/open tests.

## Phase P1 — 2–4 weeks: platform security

1. App Attest;
2. Play Integrity;
3. risk service;
4. high-value action binding;
5. rollout/false-positive handling.

## Phase P1 — 2–4 weeks: native performance

1. Macrobenchmark module;
2. Baseline Profile;
3. iOS signposts/MetricKit;
4. visually complete metrics;
5. production dashboards;
6. regression budgets.

## Phase P2 — 4–10 weeks: ranking/search intelligence

1. event taxonomy;
2. candidate sources;
3. embeddings;
4. vector retrieval;
5. ranker;
6. diversity;
7. experiments;
8. safety filters;
9. visual search;
10. model serving.

---

# 43. What *not* to do

## Do not rewrite the app into Swift + Kotlin

There is no evidence that the core UI framework is the quality bottleneck.

React Native + Skia + VisionCamera + native modules can reach the needed product quality.

A rewrite would:

- duplicate feature work;
- create platform drift;
- delay media/backend work;
- introduce new bugs;
- not automatically improve ranking/media delivery.

## Do not remove Expo blindly

The right move is:

> Expo CNG as native project generation + development builds + custom native modules.

Only abandon CNG if its configuration model becomes a measured maintenance problem.

## Do not chase language percentages

A repo can become “10% Kotlin” by adding low-value code and become worse.

## Do not install dozens of libraries

Every native package:

- increases binary size;
- increases upgrade surface;
- can block RN upgrades;
- can create startup work;
- can create memory leaks;
- adds security/supply-chain risk.

Flagship means a **smaller, deliberate platform surface**.

---

# 44. Direct answer: are major libraries/implementations missing?

**Yes — but the most important missing things are systems, not UI packages.**

### Clearly missing / incomplete enough to prioritize

- direct VisionCamera Nitro Image dependency closure;
- likely direct VisionCamera Worklets dependency closure;
- client native video export/composition;
- server FFmpeg media transcode;
- image derivative worker;
- HLS/ABR packaging;
- background native upload;
- complete multipart backend;
- native file-range upload;
- local transactional database;
- player manager/pool;
- app/device attestation;
- Baseline Profile/Macrobenchmark;
- iOS MetricKit/signpost program;
- user-perceived “visually complete” telemetry;
- mature recommendation/ranking infrastructure;
- visual-search embedding pipeline;
- CDN/media manifest/capability architecture.

### Present and should *not* be replaced casually

- Skia;
- VisionCamera;
- Reanimated;
- Gesture Handler;
- FlashList;
- expo-image;
- React Native;
- Expo CNG;
- TanStack Query;
- Zustand;
- MMKV;
- Sentry;
- PostHog;
- OpenTelemetry;
- LiveKit;
- Fastify;
- Postgres;
- Redis;
- BullMQ;
- Meilisearch at current stage.

---

# 45. Direct answer: is Expo limiting total quality?

**Not inherently.**

Expo Go would limit arbitrary native work. The audited project is using development-build/CNG-style architecture and native packages.

The real risk is using Expo APIs for workloads where the OS needs to own execution:

- long-running background upload;
- high-control video export;
- hardware codec/metadata handling;
- app attestation;
- native perf profiling.

For those, create native modules.

The target architecture is **React Native product layer + native platform layer**, not “Expo versus native.”

---

# 46. Direct answer: is TypeScript 97.8% proof that implementation is incomplete?

**No.**

The percentage is almost irrelevant to flagship status.

It becomes relevant only when you can name a missing native capability and see there is no native implementation for it.

This audit identified several such capabilities — especially video export, background transfer, attestation and native performance infrastructure — so Thryftverse *should* gain some Swift/Kotlin over time.

But the goal is capabilities, not percentages.

---

# 47. Direct answer: what is the single biggest architectural correction?

Build a **Media Platform**.

Today, Thryftverse is increasingly good at presenting/editing media.

Instagram/Snapchat/Pinterest-class apps are media systems:

- capture;
- compose;
- encode;
- upload;
- process;
- moderate;
- derive;
- distribute;
- cache;
- play;
- measure;
- rank.

The missing quality is concentrated in the middle of that lifecycle.

Once that layer exists, Skia stops being “a nice creator library” and becomes part of a coherent creation pipeline.

---

# 48. 2026 target capability matrix

Legend:

- ✅ strong/present
- 🟡 present but incomplete
- 🔴 material gap
- ⚪ optional/not mandatory now

| Capability | State | Required direction |
|---|---|---|
| React Native New Architecture-era stack | ✅ | normalize versions |
| Skia GPU UI/creator | ✅ | make authoritative scene renderer |
| VisionCamera v5 | ✅ | close direct dependencies |
| Reanimated/Worklets | ✅ | retain |
| FlashList/expo-image | ✅ | retain |
| True masonry Explore | 🟡 | client good; ranking/media depth needed |
| Native photo composition export | 🟡 | formalize |
| Native video composition/export | 🔴 | build |
| HDR-aware creator pipeline | 🔴 | build policy + implementation |
| Server image derivatives | 🔴 | media worker |
| Server video transcode | 🔴 | FFmpeg workers |
| HLS/ABR | 🔴 | add |
| Video player management | 🔴 | add |
| Native background upload | 🔴 | add |
| Multipart backend | 🔴 | complete |
| Large-file native streaming | 🔴 | add |
| Local relational DB | 🔴 | add |
| Offline ready-to-render feed/inbox | 🟡 | expand |
| WebSocket/realtime | ✅/🟡 | harden |
| RTC | ✅ | LiveKit |
| Payment providers | ✅/🟡 | reconcile/ledger audit |
| Search | 🟡 | hybrid/vector evolve |
| Visual search | 🟡 | embedding pipeline |
| Recommendation candidate/ranker stack | 🔴 | build |
| Feature flags | 🟡 | operationalize |
| OpenTelemetry/Sentry | ✅/🟡 | deepen |
| Visually-complete metrics | 🔴 | add |
| Android Baseline Profiles | 🔴 | add |
| iOS native perf instrumentation | 🔴 | add |
| App Attest | 🔴 | add |
| Play Integrity | 🔴 | add |
| Certificate pinning | 🟡/🔴 | placeholders + native linkage must close |
| Clean CNG security-resource generation | 🔴 | config plugin |
| Golden/reference UI tests | 🟡 | expand |
| Real-device perf gates | 🔴 | add |
| CDN/HTTP3 media delivery | 🟡/🔴 | formalize |
| Global event streaming | ⚪ | later, after outbox |
| GraphQL | ⚪ | optional |
| Rust core | ⚪ | only if justified |
| Full native rewrite | ⚪ | not recommended |

---

# 49. Research comparison: what to copy from each reference company

## Instagram / Meta

Copy principles:

- multi-stage client/server media lifecycle;
- hardware-aware encoding;
- multiple playback formats/renditions;
- HDR metadata correctness;
- Android Baseline Profiles;
- user-perceived navigation/performance metrics;
- on-device ML infrastructure;
- ranking as a core platform.

Do not attempt to copy Meta’s infrastructure scale.

## Snapchat

Copy principles:

- camera readiness is a product KPI;
- performance includes battery/hangs/tail latency;
- features should not all preload at startup;
- modular feature ownership;
- data sync separate from UI presentation;
- on-device media transcode before upload;
- multiple server variants;
- safe rollout/reliability discipline.

## Pinterest

Copy principles:

- “Visually Complete” user-perceived latency;
- media-dominant discovery;
- player warming/pooling;
- viewport-aware playback;
- ABR;
- HTTP/3/CDN;
- ranking diversity;
- visual embeddings/search;
- performance on every key surface.

## eBay

Copy principles:

- BFF/screen-shaped mobile APIs;
- commerce state certainty;
- modular domain boundaries;
- automated visual/screenshot testing;
- image-assisted listing creation;
- cross-platform source dominance is not a weakness;
- platform-specific plugins only where needed.

---

# 50. Final verdict

Thryftverse is in a transitional state.

It is **well beyond** the architecture of a basic Expo prototype:

- modern RN;
- Skia;
- VisionCamera;
- Worklets;
- FlashList;
- structured creator code;
- real upload queue;
- Fastify/Postgres/Redis/BullMQ backend;
- Sentry/OTel/PostHog;
- broad commerce/social surface.

But it is **not yet a Snapchat/Instagram/Pinterest/eBay-level mobile system**.

The difference is not “more screens” and not “more Kotlin.”

The difference is:

- native media export;
- native background transfer;
- server media processing;
- streaming delivery;
- ready-to-render offline data;
- player orchestration;
- real recommendation/search intelligence;
- anti-abuse attestation;
- production performance gates;
- strict build/config truth;
- global reliability discipline.

If the team implements the P0/P1 roadmap in this report, the current React Native codebase can remain the product shell. There is no architectural reason to discard it.

The correct end state is:

> **TypeScript-heavy product code, GPU/native media hot paths, native OS-owned long-running tasks, a first-class media backend, robust local data, and measured production performance.**

That is much closer to how flagship mobile engineering actually works than chasing a GitHub language ratio.

---

# Appendix A — audited repository evidence

Key branch evidence reviewed:

- `frontend/package.json`
  - Expo 57
  - RN 0.85.3
  - Skia 2.6.2
  - VisionCamera 5.2.3
  - VisionCamera Skia
  - Nitro Modules
  - Reanimated/Worklets
  - FlashList
  - TanStack Query
  - MMKV
  - expo-image/video/audio/file-system
  - LiveKit
  - Stripe
  - Sentry
  - PostHog

- `frontend/src/creator/CreatorCanvas.tsx`
  - real Skia drawing/composition primitives.

- `frontend/src/creator/CreatorCamera.tsx`
  - VisionCamera outputs
  - SkiaCamera
  - effect frame processor
  - photo/video capture
  - multi-capture.

- `frontend/src/creator/camera/useCameraEffectProcessor.ts`
  - GPU Skia color processing.

- `frontend/src/creator/core/upload/UploadManager.ts`
  - retries/idempotency/progress;
  - explicit background-transfer limitation;
  - multipart defaults disabled.

- `frontend/src/creator/core/upload/MultipartUploader.ts`
  - client multipart state machine;
  - explicit backend-endpoints-not-implemented note;
  - JS Blob file loading limitation.

- `frontend/app.config.js`
  - CNG/native config;
  - Android XML security/backup resource references;
  - ATS;
  - update signing configuration.

- `frontend/plugins/withTrustKit.js`
  - placeholder SPKI hashes;
  - prerequisite native TrustKit installation.

- `frontend/src/components/product/DiscoveryGrid.tsx`
  - conventional commerce FlashList grid.

- `frontend/src/components/explore/LooksTab.tsx`
  - mixed-span/variable-aspect discovery implementation.

- `frontend/App.tsx`
  - provider/bootstrap structure;
  - Sentry/Observe;
  - lazy creator fonts;
  - route telemetry;
  - global typography behavior.

- `backend/api/package.json`
  - Fastify;
  - Kysely/Postgres;
  - Redis/BullMQ;
  - Meilisearch;
  - S3 SDK;
  - LiveKit;
  - payments;
  - OpenTelemetry/Sentry/Prometheus.

- `backend/README.md`
  - API/domain capabilities;
  - realtime/social/commerce;
  - local-first production posture;
  - recommendation service overview.

---

# Appendix B — external research sources consulted

Primary/official or company-authored sources used for architectural comparison:

1. **Expo Documentation — SDK reference (2026)**  
   SDK 57 ↔ RN 0.86 matrix.

2. **Expo Documentation — Continuous Native Generation (2026)**  
   CNG, config plugins, native code, generated projects.

3. **Expo FAQ (2026)**  
   Expo Go limits vs development builds / native code.

4. **React Native — React Native 0.87 release, 11 Aug 2026**  
   Current RN release context.

5. **React Native Skia — Video documentation**  
   Video frames and encoding guidance.

6. **React Native Skia — Installation documentation**  
   native binaries/version requirements.

7. **VisionCamera — current v5 documentation / 5.2.3 package**  
   Nitro Modules/Nitro Image and SkiaCamera requirements.

8. **Meta Engineering — Accelerating Android apps with Baseline Profiles (2025)**  
   Facebook/Instagram performance practices.

9. **Meta Engineering — Enhancing HDR on Instagram for iOS with Dolby Vision (2025)**  
   client flattening, HEVC Main10, FFmpeg server derivatives, SDR/VP9/AV1, metadata handling.

10. **Meta Engineering — ExecuTorch across Meta apps (2025)**  
    on-device ML platform principles.

11. **Meta Engineering — Instagram Jetpack Compose adoption (2025)**  
    mixed/native framework migration under performance constraints.

12. **Snap Engineering — Performance as a Core Product Feature**  
    open-to-camera and production performance tracing.

13. **Snap Engineering — Making the Most of a Rewrite**  
    feature modularity, on-demand loading, sync/UI separation.

14. **Snap Engineering — GPU Transcoding at Scale**  
    on-device transcode + server renditions + device/network selection.

15. **Snap Engineering — QUIC at Snapchat**  
    mobile media/network latency principles.

16. **Pinterest Engineering — Performance for Everyone (Apr 2026)**  
    Visually Complete measurement.

17. **Pinterest Engineering — Improving the Player on Android**  
    player warming, configuration, pooling.

18. **Pinterest Engineering — Improving ABR Video Performance**  
    HLS/DASH adaptive delivery.

19. **Pinterest Engineering — Pinterest is now on HTTP/3**  
    CDN/client HTTP/3 for image/video/API traffic.

20. **eBay Engineering — Under the Hood of eBay Motors**  
    BFF + Flutter + on-device ML.

21. **eBay Engineering — eBay Motors: Accelerating with Flutter**  
    98.3% shared-language source, 0.6% native source; production quality lesson.

22. **eBay Engineering — Screenshot Testing with Flutter**  
    golden/visual regression strategy.

23. **Apple Developer Documentation — URLSession background configuration / upload tasks**  
    OS-owned background file transfers.

24. **Apple Developer Documentation — DeviceCheck / App Attest**  
    app-integrity assertions.

25. **Android Developers — Baseline Profiles / Macrobenchmark**  
    Android native performance regression tooling.

26. **Android Developers — Play Integrity API**  
    app/device integrity and anti-abuse.

---

# Appendix C — acceptance matrix for the next audit

A future audit should mark each item PASS only with executable evidence.

| ID | Requirement | Evidence |
|---|---|---|
| NATIVE-01 | SDK57 uses RN0.86 supported pair | package + clean build |
| NATIVE-02 | Nitro Image direct dependency | package |
| NATIVE-03 | SkiaCamera Worklets closure | package + release camera run |
| CNG-01 | clean prebuild generates Android security XML | CI artifact |
| CNG-02 | clean prebuild generates backup/data extraction rules | CI artifact |
| SEC-01 | no placeholder SPKI | scanner |
| SEC-02 | TrustKit/native pinning linked and exercised | integration test |
| SEC-03 | App Attest high-value flow | device + server test |
| SEC-04 | Play Integrity high-value flow | device + server test |
| MEDIA-01 | image composition deterministic export | golden |
| MEDIA-02 | video composition native export | real device |
| MEDIA-03 | cancel/retry export | device |
| MEDIA-04 | HDR policy | test matrix |
| UP-01 | multipart backend enabled | API contract |
| UP-02 | upload survives JS suspension | device |
| UP-03 | upload survives process kill where OS permits | device |
| UP-04 | 500MB upload bounded memory | profiling |
| SERVER-01 | ffprobe ingest | worker |
| SERVER-02 | H264 derivatives | worker |
| SERVER-03 | HLS ABR | player |
| SERVER-04 | image derivatives | CDN |
| SERVER-05 | moderation gate before distribution | integration |
| PLAY-01 | player manager controls active decoders | code/test |
| PLAY-02 | prewarm/visibility lifecycle | benchmark |
| PLAY-03 | QoE telemetry | dashboard |
| DATA-01 | local relational DB | schema |
| DATA-02 | inbox usable offline | E2E |
| DATA-03 | feed cache first paint | E2E |
| DATA-04 | drafts survive restart | E2E |
| PERF-01 | visually complete metrics | dashboard |
| PERF-02 | camera-ready metrics | dashboard |
| PERF-03 | Macrobenchmark | CI |
| PERF-04 | Baseline Profile | release AAB |
| PERF-05 | iOS MetricKit/signposts | dashboard |
| TEST-01 | reference goldens | CI |
| TEST-02 | low-end Android matrix | CI/device farm |
| TEST-03 | current iPhone matrix | CI/device farm |
| RANK-01 | candidate sources documented | architecture |
| RANK-02 | vector/semantic retrieval | service |
| RANK-03 | diversity/rerank | service |
| RANK-04 | experiment guardrails | dashboard |
| REL-01 | transactional outbox | DB + tests |
| REL-02 | queue consumer idempotency | tests |
| REL-03 | safe rollout/kill switches | release config |
| A11Y-01 | text scaling > default | screenshots |
| A11Y-02 | VoiceOver/TalkBack key flows | manual/automation |

---

# Appendix D — recommended first engineering tickets

1. **Normalize Expo 57 / RN 0.86 dependency contract**
2. **Add Nitro Image + verify VisionCamera Worklets dependencies**
3. **Create clean-CNG native-resource generation plugin**
4. **Close TrustKit real pins/linkage**
5. **Design `CompositionDocument v1`**
6. **Build iOS native video exporter**
7. **Build Android native video exporter**
8. **Implement multipart backend endpoints**
9. **Build native background uploader**
10. **Create media worker service with FFmpeg + ffprobe**
11. **Create image worker with libvips/sharp**
12. **Create HLS ABR ladder + media manifest**
13. **Create VideoManager / player QoE layer**
14. **Add SQLite local domain cache**
15. **Add App Attest + Play Integrity**
16. **Add Android Macrobenchmark + Baseline Profiles**
17. **Add iOS MetricKit/signposts**
18. **Create Visually Complete surface API**
19. **Create camera-ready metric**
20. **Create feed ranking event taxonomy**
21. **Build candidate-generation v1**
22. **Add vector/visual retrieval**
23. **Add transactional outbox**
24. **Add cross-platform golden screenshot suite**
25. **Add real-device low-memory/performance gate**

---

# Appendix E — final one-line architecture rule

**Keep TypeScript for product velocity; move only GPU/media/background/security/performance hot paths to native code; move media transformation and ranking scale to dedicated backend platforms; measure what users actually see.**
