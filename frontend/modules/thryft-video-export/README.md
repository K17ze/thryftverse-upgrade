# Thryft Video Export (Nitro Module — Contract + JS Wiring)

## Overview

This module defines the **Nitro HybridObject contract** and **JS-side wiring**
for on-device, single-clip video export. It is the flagship export path used by
CapCut, VN and Instagram Edits: a native module driving **AVFoundation** (iOS)
and **Media3 Transformer** (Android) via Nitro Modules.

This package ships **only** the TypeScript spec (`VideoExportModule.nitro.ts`)
and the JS entry point (`src/index.ts`). The native Swift/Kotlin implementation
is **deferred** — it lands in a follow-up that consumes this contract via
Nitrogen codegen, without touching the editor.

## Files

- `src/VideoExportModule.nitro.ts` — the Nitro HybridObject spec. Nitrogen
  codegen consumes this to generate `HybridVideoExportModule.swift`
  (AVFoundation) and `HybridVideoExportModule.kt` (Media3 Transformer).
- `src/index.ts` — JS wiring. `getVideoExportModule()` returns the HybridObject
  when linked, `null` otherwise. `exportVideoViaNative()` wraps the native call
  and throws a `VideoExportError` on failure.
- `src/__tests__/VideoExportModule.test.ts` — verifies the graceful fallback
  (module not linked → `isVideoExportAvailable()` is false,
  `exportVideoViaNative` throws `{ type: 'unsupported' }`).

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
- `'sticker'` — `stickerSvg` (the SVG markup), matching the backend's sticker
  overlay path (`buildStickerLayerSvg` → rasterise → composite).

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

**Deferred.** The native Swift (AVFoundation) and Kotlin (Media3 Transformer)
implementations are out of scope for this JS-focused session — they require
Xcode / Android Studio and Nitrogen codegen. This package ships the contract
+ JS wiring so the native module can land in a follow-up **without touching
the editor**: once the native HybridObject is registered under the name
`VideoExportModule`, `getVideoExportModule()` returns it automatically and the
existing `mediaExportService.ts` wiring picks it up.

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
