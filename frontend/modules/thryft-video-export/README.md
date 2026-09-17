# Thryft Video Export (Nitro Module)

## Overview

On-device, single-clip video export — the flagship export path used by
CapCut, VN and Instagram Edits: a native Nitro HybridObject driving
**AVFoundation** (iOS) and **Media3 Transformer** (Android).

The module ships the TypeScript spec (`VideoExportModule.nitro.ts`), the
Nitrogen-generated bindings (`nitrogen/generated/`), the JS entry point
(`src/index.ts`), and the platform implementations under `ios/` and
`android/`.

## Files

- `src/VideoExportModule.nitro.ts` — the Nitro HybridObject spec. Nitrogen
  codegen consumes this to generate the bindings under
  `nitrogen/generated/` (re-run `npx nitrogen` after spec changes).
- `src/index.ts` — JS wiring. `getVideoExportModule()` returns the HybridObject
  when linked, `null` otherwise. `exportVideo(request, onProgress)` is the
  caller-facing driver — it polls `getExportProgress` on a 250ms cadence and
  returns a `cancel()` handle. `exportVideoViaNative()` is the raw one-shot
  call. All failures normalise to `VideoExportError`.
- `ios/` — Swift implementation (AVFoundation): `HybridVideoExportModule`
  dispatches remux/transcode/compose; `VideoCompositionBuilder` builds the
  trim → freeze → speed → reverse segment pipeline; `VideoOverlayCompositor`
  burns overlays per frame via `AVVideoCompositing`.
- `android/` — Kotlin implementation (Media3 Transformer): remux via
  `MediaExtractor`/`MediaMuxer` stream-copy; transcode/compose via
  `EditedMediaItemSequence` + `SpeedChangeEffect`/`SonicAudioProcessor`,
  `OverlayEffect` for burn-in, `Presentation` for resize.
- `src/__tests__/` — graceful-fallback coverage plus driver tests for
  progress polling, cancellation and tagged-error normalisation.

## Contract

### `VideoExportModule` HybridObject

| Method | Signature | Notes |
| --- | --- | --- |
| `isAvailable` | `() => boolean` | `true` only when the native module is linked. |
| `exportVideo` | `(request: VideoExportRequest) => Promise<VideoExportResult>` | Main entry point. |
| `cancelExport` | `(sessionId: string) => void` | Aborts the in-progress export. |
| `getExportProgress` | `(sessionId: string) => number` | Polls progress (0..1). |

### `VideoExportRequest`

A flattened, single-clip request: a local file URI plus deterministic edits
(trim, speed / speed curve, reverse, freeze-frame, mute, overlays) and output
settings (format, resolution, bitrate, session id).

### `VideoOverlay`

Discriminated by `kind`:

- `'text'` — `text`, `fontSize`, `textColor`, optional `backgroundColor` /
  `alignment`. Geometry is normalised 0..1, matching the backend's overlay
  layer model in `compositionRenderer.ts`.
- `'sticker'` — `stickerImageUri` (a pre-rasterised PNG file:// URI) or
  `stickerSvg` for provenance. Neither AVFoundation nor Media3 rasterises
  SVG natively, so the JS adapter rasterises overlay layers via the Skia
  export renderer (`jsExportImage` — the same renderer the preview uses,
  guaranteeing pixel parity) and passes `stickerImageUri`.

### `VideoExportResult`

`uri` (local file:// URI), `width`, `height`, `durationMs`, `sizeBytes`,
`mimeType` (`'video/mp4'`).

### `VideoExportError`

Discriminated union:

- `{ type: 'cancelled' }` — export was cancelled via `cancelExport`.
- `{ type: 'unsupported' }` — native module not linked / platform lacks the
  pipeline.
- `{ type: 'render_failed', message }` — native pipeline error.
- `{ type: 'invalid_input', message }` — request validation failed.

## Execution Paths (native side)

The native implementation picks one of three paths based on the request fields,
mirroring the `react-native-video-pipeline` (nightlybuildgroup) pattern:

### 1. Remux (stream copy)

Used when the request has **no edits** that require decoding:

- No `trimStartMs` / `trimEndMs` (or they cover the full source).
- No `speed` / `speedCurve`, no `reversed`, no `freezeFrameMs`.
- No `overlays`.
- No `outputWidth` / `outputHeight` / `outputBitrateKbps` change.
- `muteAudio` is the only allowed flag (drops the audio track, no re-encode).

The native side stream-copies the video + audio tracks into a new MP4
container (`AVAssetExportSession` with `presetName = passthrough` on iOS;
Media3 `Transformer` with no `Effects` on Android). This is the fastest path —
no decode/encode, near-instant.

### 2. Transcode (re-encode video, passthrough/re-encode audio)

Used when the request has edits that touch **container/timing only**:

- `trimStartMs` / `trimEndMs` (clip the timeline).
- `speed` (constant) or `speedCurve` (variable) — `setpts` / `atempo` on the
  video + audio timebase.
- `muteAudio` (drop or silence the audio track).
- `outputBitrateKbps` (re-encode at a target bitrate).

No overlays, no reverse, no freeze-frame, no resolution change. The native
side re-encodes the video track (VideoToolbox on iOS, Media3 codec on Android)
and either passthroughs or re-encodes the audio track.

### 3. Compose (full re-encode through a composition pipeline)

Used when the request has edits that require **compositing**:

- `overlays` (text / sticker burn-in) — requires an overlay renderer
  composited onto each frame.
- `reversed` — requires buffering decoded frames and writing them in reverse
  order.
- `freezeFrameMs` + `freezeDurationMs` — requires inserting a held frame into
  the timeline.
- `outputWidth` / `outputHeight` — requires a resolution-scale pass.

The native side builds a composition (`AVMutableComposition` +
`AVVideoComposition` on iOS; Media3 `Composition` + `Effects` on Android),
burns overlays into each frame, and re-encodes the result. This is the slowest
path but produces a faithful render of the creator's edits.

## Native Implementation Status

**Implemented.** iOS (Swift/AVFoundation) and Android (Kotlin/Media3
Transformer) both ship under `ios/` and `android/`:

- **iOS**: `HybridVideoExportModule.swift` — session registry, serial export
  queue, three-path dispatch, `export(to:as:)` on iOS 18+ with the
  `exportAsynchronously` bridge for earlier releases.
  `VideoCompositionBuilder.swift` — segment pipeline (trim → freeze →
  speed/curve → reverse) rendered into `AVMutableComposition` via
  `insertTimeRange`/`scaleTimeRange`; freeze = single frame scaled to the
  hold duration; reverse = ~33ms chunks emitted in reverse order (audio
  dropped — chunked audio reversal would stutter). `VideoOverlayCompositor.swift`
  — `AVVideoCompositing` burn-in for text + rasterised stickers.
- **Android**: `HybridVideoExportModule.kt` — registry + dispatch.
  `VideoExportPipeline.kt` — true remux via `MediaExtractor`/`MediaMuxer`
  for the no-edit fast path; Media3 `Transformer` + `EditedMediaItemSequence`
  for transcode/compose; `MediaMetadataRetriever` frame extraction for
  freeze holds; `OverlayEffect` for burn-in; `Presentation` for resize.

### Honest limits

- **Background continuation**: the export runs on native background threads
  and survives JS teardown (progress/cancel key off `sessionId`), but if the
  OS kills the app process the export dies with it. True OS-level background
  completion would need a foreground service (Android) / background task
  assertion (iOS) — deliberately out of scope; the caller's UI should treat
  exports as foreground-lifetime jobs.
- **Bitrate**: `outputBitrateKbps` maps to preset tiers on iOS
  (`AVAssetExportSession` has no per-bitrate control); Android honours it
  through the Transformer pipeline where the encoder supports it.
- **Partial volume**: the contract carries `muteAudio` (bool). Partial
  volume/fades remain a backend-render concern.
- **Reverse + audio**: audio is dropped on reversed exports on both
  platforms (chunked reversal would stutter).
- **Multi-page / multi-media documents**: out of scope for the single-clip
  request — `mediaExportService.ts` falls back to `ThryftMediaExport` /
  the backend render for those.

## Validation status

TypeScript contract, JS wiring, adapter and driver are covered by tests +
`tsc`. The Swift/Kotlin implementations compile at the app build step
(`pod install` / Gradle sync after `expo prebuild`); on-device validation
requires a development build — there is no simulator/emulator run in this
workspace.

## Graceful Fallback

When the native module is **not** linked (web, Expo Go, or a build without
the Nitro module), the JS side degrades gracefully:

- `getVideoExportModule()` → `null`
- `isVideoExportAvailable()` → `false`
- `exportVideoViaNative(request)` → throws `{ type: 'unsupported' }`

`mediaExportService.ts` checks `isVideoExportAvailable()` from this module and,
when it is false, falls back to the **backend FFmpeg render** path
(`backend/api/src/lib/media/compositionRenderer.ts`). This keeps the existing
export behaviour unchanged for builds without the native module.
