/**
 * VideoExportModule — Nitro HybridObject spec for on-device video export.
 *
 * This is the single source of truth for the native video export module's JS
 * interface. Nitrogen codegen consumes this `.nitro.ts` file to generate
 * `HybridVideoExportModule.swift` (AVFoundation) and
 * `HybridVideoExportModule.kt` (Media3 Transformer) bindings.
 *
 * Unlike `ThryftMediaExport` (which consumes the full CreatorDocument JSON),
 * this module operates on a flattened, single-clip `VideoExportRequest` — a
 * local file URI plus a set of deterministic edits (trim, speed, reverse,
 * freeze-frame, mute, overlays). This mirrors the flagship path used by
 * CapCut, VN and Instagram Edits: a native module driving AVFoundation
 * (iOS) + Media3 Transformer (Android) via Nitro Modules, with three
 * execution paths the native side picks between:
 *
 *   1. remux    — no edits, same codec/container → stream-copy (no re-encode).
 *   2. transcode — edits that only touch container/timing (trim, mute, speed
 *                  on a single track) → re-encode video, passthrough or
 *                  re-encode audio.
 *   3. compose  — edits that require compositing (overlays, reverse,
 *                  freeze-frame, resolution change) → full re-encode through
 *                  a composition pipeline.
 *
 * Progress is polled via `getExportProgress(sessionId)` (0..1) so the JS side
 * can drive a progress bar on its own cadence. Cancellation is via
 * `cancelExport(sessionId)`.
 *
 * Reference implementations:
 *   - react-native-video-pipeline (nightlybuildgroup)
 *   - react-native-nitro-video-editor (fullsnack-DEV)
 */
import type { HybridObject } from 'react-native-nitro-modules';

// ── Speed curve (type-only import — erased at runtime) ──────────────
// Imported from the app's creator domain so the native contract shares the
// exact same SpeedCurve shape the editor uses for variable speed ramping.
import type { SpeedCurve } from '../../../src/creator/poster/speedcurves/SpeedCurveTypes';

// ── Overlays ────────────────────────────────────────────────────────

/**
 * A text or sticker overlay burned into the output video. The shape mirrors
 * the backend's overlay layer model in `compositionRenderer.ts` (text via
 * `drawtext`/SVG, stickers via rasterised SVG → PNG composite) so the native
 * render matches the FFmpeg render pixel-for-pixel.
 *
 * Geometry is normalised 0..1 relative to the output frame, matching the
 * backend's `layerTopLeft` convention.
 */
export interface VideoTextOverlay {
  id: string;
  kind: 'text';
  /** Top-left X in normalised 0..1 output-frame space. */
  x: number;
  /** Top-left Y in normalised 0..1 output-frame space. */
  y: number;
  /** Width in normalised 0..1 output-frame space. */
  width: number;
  /** Height in normalised 0..1 output-frame space. */
  height: number;
  /** Rotation in degrees around the overlay centre. */
  rotationDeg: number;
  /** Opacity 0..1. */
  opacity: number;
  /** The text string to render. */
  text: string;
  /** Font size in output-frame pixels. */
  fontSize: number;
  /** Text fill colour (CSS hex, e.g. '#ffffff'). */
  textColor: string;
  /** Optional background colour behind the text (CSS hex). */
  backgroundColor?: string;
  /** Horizontal text alignment within the overlay box. */
  alignment?: 'left' | 'center' | 'right';
}

export interface VideoStickerOverlay {
  id: string;
  kind: 'sticker';
  /** Top-left X in normalised 0..1 output-frame space. */
  x: number;
  /** Top-left Y in normalised 0..1 output-frame space. */
  y: number;
  /** Width in normalised 0..1 output-frame space. */
  width: number;
  /** Height in normalised 0..1 output-frame space. */
  height: number;
  /** Rotation in degrees around the overlay centre. */
  rotationDeg: number;
  /** Opacity 0..1. */
  opacity: number;
  /**
   * The sticker SVG markup. Matches the backend's sticker overlay path in
   * `compositionRenderer.ts` (`buildStickerLayerSvg`), which rasterises an
   * SVG string to PNG and composites it onto the frame.
   */
  stickerSvg: string;
}

/**
 * Discriminated union of overlay kinds. Today only 'text' and 'sticker' are
 * supported — the two overlay types the backend burns in for video.
 */
export type VideoOverlay = VideoTextOverlay | VideoStickerOverlay;

// ── Request ─────────────────────────────────────────────────────────

/**
 * A single-clip video export request. The native module picks one of three
 * execution paths (remux / transcode / compose) based on which fields are
 * populated — see the module README for the decision matrix.
 */
export interface VideoExportRequest {
  /** Local file:// URI of the source video. */
  sourceUri: string;
  /** Trim window start in milliseconds. Omit for the source start. */
  trimStartMs?: number;
  /** Trim window end in milliseconds. Omit for the source end. */
  trimEndMs?: number;
  /** Constant playback speed (0.25..4). Ignored when `speedCurve` is set. */
  speed?: number;
  /** Optional variable speed curve. Takes precedence over `speed`. */
  speedCurve?: SpeedCurve;
  /** Reverse the clip playback direction. */
  reversed?: boolean;
  /** Timestamp (ms) of the frame to freeze. */
  freezeFrameMs?: number;
  /** Duration (ms) to hold the freeze frame. */
  freezeDurationMs?: number;
  /** Mute the source audio track entirely. */
  muteAudio?: boolean;
  /** Text/sticker overlays to burn into the output. */
  overlays?: VideoOverlay[];
  /** Output container. Only 'mp4' is supported today. */
  outputFormat?: 'mp4';
  /** Target output width in pixels. Omit for source-native. */
  outputWidth?: number;
  /** Target output height in pixels. Omit for source-native. */
  outputHeight?: number;
  /** Target video bitrate in kbps. Omit for platform default. */
  outputBitrateKbps?: number;
  /** Stable id for cancellation + progress polling. */
  sessionId: string;
}

// ── Result ──────────────────────────────────────────────────────────

/**
 * The rendered output. `uri` is a local file:// URI ready for upload via the
 * existing mediaUploadPipeline.
 */
export interface VideoExportResult {
  /** Local file:// URI of the rendered output. */
  uri: string;
  /** Output width in pixels. */
  width: number;
  /** Output height in pixels. */
  height: number;
  /** Output duration in milliseconds. */
  durationMs: number;
  /** Output file size in bytes. */
  sizeBytes: number;
  /** Output MIME type. Only 'video/mp4' today. */
  mimeType: 'video/mp4';
}

// ── Errors ──────────────────────────────────────────────────────────

/**
 * Discriminated union of export failures. The JS wrapper (`exportVideoViaNative`)
 * normalises native throws into this shape so callers can switch on `type`
 * without parsing error strings.
 */
export type VideoExportError =
  | { type: 'cancelled' }
  | { type: 'unsupported' }
  | { type: 'render_failed'; message: string }
  | { type: 'invalid_input'; message: string };

// ── HybridObject spec ──────────────────────────────────────────────

/**
 * Nitro HybridObject for on-device video export.
 *
 * Nitrogen codegen generates `HybridVideoExportModule.swift` (AVFoundation)
 * and `HybridVideoExportModule.kt` (Media3 Transformer) from this interface.
 */
export interface VideoExportModule
  extends HybridObject<{ ios: 'swift'; android: 'kotlin' }> {
  /**
   * Returns true only when the native module is linked and the underlying
   * platform pipeline (AVFoundation / Media3 Transformer) is available.
   * On web, Expo Go, or a build without the native module, returns false.
   */
  isAvailable(): boolean;

  /**
   * Export a video according to the request. The native side picks one of
   * three execution paths (remux / transcode / compose) based on the request
   * fields. Resolves with the rendered output's local file URI + metadata.
   *
   * Rejects with a `VideoExportError`-shaped object on failure.
   */
  exportVideo(request: VideoExportRequest): Promise<VideoExportResult>;

  /**
   * Cancel an in-progress export by session id. Aborts the native pipeline
   * (AVAssetExportSession / Media3 Transformer) and causes the corresponding
   * `exportVideo` promise to reject with `{ type: 'cancelled' }`.
   */
  cancelExport(sessionId: string): void;

  /**
   * Poll the progress of an in-progress export by session id. Returns a
   * value in 0..1. Returns 0 for an unknown / completed / cancelled session.
   */
  getExportProgress(sessionId: string): number;
}
