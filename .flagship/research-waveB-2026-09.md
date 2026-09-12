# Research Wave B — Creator/Editor/Upload Tech Benchmark
**Date:** September 2026
**Scope:** Benchmark current state of mobile creator editing + upload tech for a React Native + Expo video editor.

---

## 1. Instagram Edits (standalone, 2026)

| Capability | How it works (current) | Adopt for RN? | Sources |
|---|---|---|---|
| **Timeline / precision** | Single-frame, clip-level timeline with trim, split, reorder, drag handles; main track can target visual, audio, or both. | Benchmark, not adopt. RN has no drop-in Edits library; replicate with native trim + timeline UI. | creators.instagram.com/blog/workflow-editing, creators.instagram.com/blog/edits-video-creation-app |
| **Keyframes** | Position, rotation, scale keyframes on clips/overlays. | Plan for an animation/keyframes layer if parity desired. | creators.instagram.com/edits |
| **Speed / freeze / reverse** | Record at 0.3x–3x; editing speed changes; standalone Freeze Frame tool; reverse clip. | Adopt speed maps + freeze via native AVFoundation/Media3; reverse is a transcode effect. | ishort.pro/instagram-edits-app.html, marketing4ecommerce.net/en/new-features-in-edits/ |
| **Transitions / effects** | AI Story Transitions, Cinematic Effects, 11+ visual effects (March 2026); overlay templates, clip lock, item-to-item alignment (Aug 2026). | Prioritize cut/crossfade first. | creators.instagram.com/blog/workflow-editing/ |
| **Auto-captions** | Auto generate + bilingual translation (15+ languages, July 2026); animated caption highlighting. | Server ASR or on-device speech/ML; no off-the-shelf RN caption animator. | fonearena.com/blog/486573 |
| **Export specs** | Up to 4K no watermark; 15-minute export added Aug 2026 (iOS only). | Target H.264/HEVC, 1080p–4K, 24/30/60 fps. | play.google.com/store/apps/details/Edits_an_Instagram_app |
| **Cloud drafts / versions** | Folders, saved text styles, multiple project versions, collaboration drafts. | JSON edit metadata + raw assets; don't pass raw video through JS. | creators.instagram.com/blog/workflow-editing/ |

**Changed since mid-2026:** Aug 2026 added 15-minute iOS export, folders, saved text styles, overlay templates + clip lock; July 2026 added bilingual captions.

---

## 2. Snapchat Editor (2026)

| Capability | How it works (current) | Adopt for RN? | Sources |
|---|---|---|---|
| **Timeline mode** | Multi-clip timeline in Director Mode: trim, split, duplicate, replace, speed, volume, crop/rotate, delete, reorder. Audio/text separate layers; video/photos single track. | Adopt simple multi-clip + layered audio/text pattern. | help.snapchat.com/hc/en-us/articles/41614255962132, /8132871831828 |
| **Sounds sync** | Quick Cut auto-picks a Sounds track and beat-syncs selected clips; Sounds Sync for Camera Roll (iOS expanding, Android coming). | Beat-sync via audio BPM/clip cut points — later phase. | newsroom.snap.com/snap-quick-cut, /sounds-recommendations-sync |
| **Reverse / speed** | Reverse filter; speed 2x/3x/slow in Timeline; third-party docs report 0.25x–4x. | Reverse via re-encode; speed via time-stretch or re-encode. | help.snapchat.com/hc/en-us/articles/41614255962132 |
| **Quick Cut auto-edits** | Lens-powered auto-select/trim/sync from Memories/Camera Roll. | "Auto montage" as a later phase. | newsroom.snap.com/snap-quick-cut |

**Changed since mid-2026:** Quick Cut live on iOS; Sounds Sync for Camera Roll expanding; Timeline Editor moved into Director Mode.

---

## 3. Expo / React Native Video Stack (Sept 2026)

| Capability | Status | Adopt for RN? | Sources |
|---|---|---|---|
| **expo-video** | `expo-video@57.0.2` (SDK 57, June 30 2026; canary 58). `generateThumbnailsAsync(times, {maxWidth, maxHeight})` stable on iOS+Android. | Playback/thumbnails only — not an editing/export engine. | docs.expo.dev/versions/latest/sdk/video |
| **Frame-accurate trim/seek** | `expo-video` seek is keyframe-approximate. | Native pipeline: `react-native-video-trim`, `react-native-lossless-trim` (Android keyframe-bound), `react-native-video-pipeline`. | github.com/maitrungduc1410/react-native-video-trim, github.com/nightlybuildgroup/react-native-video-pipeline |
| **expo-file-system uploads** | `File.createUploadTask()` / `File.upload()` (SharedObject, SDK 56+): binary/multipart, progress, cancellation; iOS background. | In-process uploads; pair with native background uploader or TUS/S3 multipart for large video (background promises not restored after process death). | docs.expo.dev/versions/unversioned/sdk/filesystem, expo PR 44055 |
| **Nitro Modules** | `react-native-nitro-modules@0.37.0` (Aug 2026). JSI, type-safe; enables `react-native-video-pipeline`, `react-native-nitro-video-editor`, `react-native-media-toolkit`. | **Adopt** — current path for performant native video work without FFmpeg. | npmjs.com/package/react-native-nitro-modules, github.com/P-James/react-native-media-toolkit |
| **New Architecture** | Expo SDK 55+/RN 0.83+ New Arch only; SDK 57 ships RN 0.86. | Target SDK 57 / RN 0.86 + New Arch; avoid legacy-only media libs. | expo.dev/changelog/sdk-57 |

---

## 4. Upload Architecture (2026)

| Capability | How it works | Adopt for RN? | Sources |
|---|---|---|---|
| **TUS resumable** | Resumable HTTP upload; TUSKit / tus-android-client / tus-js-client / `react-native-tus` (Nitro). | If custom backend needs resumability or Supabase Storage. | github.com/tus/TUSKit, github.com/zarifnazmi/react-native-tus |
| **S3 multipart** | Pre-signed part URLs; 5 MB min part; ~3 parallel on cellular; complete/abort server-side. | **Best for direct-to-cloud** large videos. Part-level retry + completion call (already implemented). | docs.aws.amazon.com/AmazonS3/latest/userguide/mpuoverview.html |
| **iOS background** | `NSURLSession` background upload from file on disk; system relaunches app on completion; delegate API. | Required for reliable iOS large-video upload; never `fetch`/`expo/fetch`. | alicinaroglu.dev/background-urlsession |
| **Android background** | User-Initiated Data Transfer Job for immediate user-triggered uploads; WorkManager for deferrable; Foreground Service 6h cap (Android 15). | Native module or Expo SharedObject; persist state in SQLite/MMKV. | developer.android.com/develop/background-work |

**Changed since mid-2026:** Android 15 caps dataSync/mediaProcessing at 6h/24h; new `UploadTask` API replaces legacy `uploadAsync`; TUS/S3 multipart dominant over naive `fetch`.

---

## 5. FFmpeg vs Native Transcoding (2026)

| Capability | Status | Adopt for RN? | Sources |
|---|---|---|---|
| **FFmpeg in RN** | `ffmpeg-kit-react-native` retired (archived 2023, binaries 404); GPL/patent risk. | **Do not adopt** — FFmpeg EOL in RN ecosystem. (Our FFmpeg usage is server-side backend, unaffected.) | dev.to/specvista/ffmpeg-kit-react-native-is-dead |
| **Native iOS** | Hardware H.264/HEVC via `AVAssetExportSession`, `AVMutableVideoComposition`, VideoToolbox. | iOS export/composition. | github.com/nightlybuildgroup/react-native-video-pipeline |
| **Native Android** | Hardware H.264/HEVC via MediaCodec, `Media3 Transformer` for trim/crop/overlay/text. | Android export/composition. | github.com/P-James/react-native-media-toolkit |
| **Compression** | `expo-image-and-video-compressor` (managed Expo); `react-native-compressor` (bare/dev-client). | expo-image-and-video-compressor for zero-config compression. | npmjs.com/package/expo-image-and-video-compressor |
| **Full editor pipeline** | `react-native-video-pipeline` (remux→transcode→compose, Nitro, no FFmpeg); `react-native-nitro-video-editor`; `react-native-media-toolkit` (trim/crop/compress/thumbnails/overlays). | **Best current practice for client-side export.** | github.com/fullsnack-DEV/react-native-nitro-video-editor |

---

## Top 5 Actionable Findings

1. **Client-side FFmpeg is dead; native pipelines won.** Backend FFmpeg (our render path) is unaffected, but any future on-device export should use AVFoundation/Media3 via Nitro (`react-native-video-pipeline` / `react-native-media-toolkit`), not ffmpeg-kit.
2. **`expo-video` = playback + `generateThumbnailsAsync`, not editing.** Already aligned — thumbnails via expo-video, edits via server render.
3. **New Architecture target:** SDK 57 / RN 0.86. Media libs require it.
4. **Large-video upload:** native background session (iOS NSURLSession background, Android UIDT/WorkManager) + persisted state + S3 multipart resume. Our durable job store + multipart already implements the resume half; native background session is the remaining gap.
5. **Competitive bar (2026):** auto-captions, beat-sync sounds, project versions/folders, overlay templates + clip lock, 15-min 4K export. Ship native-backed timeline first (done), then layer AI/sync.
