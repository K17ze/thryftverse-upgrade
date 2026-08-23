/**
 * ThryftMediaExport — Nitro HybridObject spec for on-device video/image
 * composition + export.
 *
 * This is the single source of truth for the native export module's JS
 * interface. Nitrogen codegen consumes this `.nitro.ts` file to generate
 * `HybridThryftMediaExport.swift` (AVFoundation) and
 * `HybridThryftMediaExport.kt` (Media3 Transformer) bindings.
 *
 * Architecture:
 *   iOS 26:   AVMutableComposition (tracks/timeRanges) +
 *             AVVideoComposition (Core Image applier / custom compositor
 *             for overlay burn-in + color-matrix effects) +
 *             AVAssetExportSession.export(to:as:) (async, back-deployed).
 *             VideoToolbox hardware encode. Passthrough for untouched
 *             single-clip video; re-encode for any edit.
 *   Android:  Media3 Transformer 1.10.x +
 *             EditedMediaItem (ClippingConfiguration for trim, setSpeed) +
 *             Effects (TextOverlay/BitmapOverlay via
 *             TextureOverlayShaderProgram, color-matrix via custom GlEffect) +
 *             Composition.Builder with setHdrMode(HDR_MODE_TONE_MAP_HDR_TO_SDR_USING_OPEN_GL)
 *             for marketplace default. Poll getProgress → onProgress callback.
 *
 * The module consumes the existing CreatorDocument (composition.ts) as
 * JSON — the same document that drives the Skia/Reanimated preview in
 * CreatorCanvas.tsx. This guarantees preview-to-export parity: the
 * exported file is a faithful render of what the creator authored.
 *
 * Progress is delivered via a callback parameter (not a global event
 * emitter) so multiple concurrent exports can be tracked independently.
 * Cancellation is via cancelExport(jobId).
 */
import type { HybridObject } from 'react-native-nitro-modules';

// ── Request types ──────────────────────────────────────────────────

export interface ExportIntentRequest {
  surface: 'marketplace_feed' | 'marketplace_hd' | 'story' | 'look_card' | 'thumbnail';
  format: 'mp4' | 'png' | 'webp';
  codec: 'h264' | 'h265' | 'av1' | 'jpeg';
  /** Resolution ladder. null = source-native. */
  maxWidth: number | null;
  maxHeight: number | null;
  fps: number | null;
  bitrateBps: number | null;
  /** HDR policy: 'preserve' (keep HDR), 'tone_map_sdr' (marketplace default), 'auto'. */
  hdrPolicy: 'preserve' | 'tone_map_sdr' | 'auto';
  audioCodec: 'aac' | 'opus';
  audioBitrateBps: number;
  muteAudio: boolean;
  /** Burn overlays (text/draw/product) into the output, or keep as separate layers. */
  burnOverlays: boolean;
  /** Trim the whole composition to a sub-range (ms). */
  trimStartMs?: number;
  trimEndMs?: number;
  /** Optimise for streaming (faststart/moov-atom-front). */
  optimizeForNetworkUse: boolean;
}

// ── Result types ───────────────────────────────────────────────────

export interface ExportResult {
  /** Local file:// URI of the exported file. */
  uri: string;
  width: number;
  height: number;
  durationMs?: number;
  sizeBytes: number;
  /** Actual HDR/SDR flag of the output. */
  colorMode: 'sdr' | 'hdr10' | 'hdr10plus' | 'hlg';
  /** Actual codec used (may differ from request if device doesn't support requested codec). */
  codec: string;
}

export interface ExportCapabilities {
  supportsHevc: boolean;
  supportsAv1: boolean;
  /** HDR editing (keep HDR through the pipeline). */
  supportsHdrEditing: boolean;
  /** Tone-mapping HDR → SDR. */
  supportsToneMap: boolean;
  maxEncodeWidth: number;
  maxEncodeHeight: number;
  platform: 'ios' | 'android';
  osVersion: string;
  /** Android: Media3 Transformer version. */
  media3Version?: string;
  /** iOS: AVFoundation version string. */
  avfoundationVersion?: string;
}

export interface ThumbnailResult {
  uri: string;
  width: number;
  height: number;
}

// ── HybridObject spec ──────────────────────────────────────────────

export interface ThryftMediaExport
  extends HybridObject<{ ios: 'swift'; android: 'kotlin' }> {
  // ── Video export ──

  /**
   * Export a video from the composition document.
   *
   * @param documentJson  Serialised CreatorDocument (the single source of truth).
   * @param intent        ExportIntent (format/codec/resolution/HDR policy/trim).
   * @param jobId         Stable id for cancellation + progress routing.
   * @param onProgress    (0..1) real frame/byte progress from the native pipeline.
   * @returns ExportResult with local file URI + metadata.
   */
  exportVideo(
    documentJson: string,
    intent: ExportIntentRequest,
    jobId: string,
    onProgress?: (progress: number) => void,
  ): Promise<ExportResult>;

  // ── Image (poster/thumbnail) export ──

  /**
   * Render a single frame (or poster page) to PNG/WebP at the intent resolution.
   * Uses Skia offscreen surface on both platforms.
   *
   * @param documentJson  Serialised CreatorDocument.
   * @param pageId        Which page to render.
   * @param intent        ExportIntent (format/resolution).
   * @param jobId         Stable id for cancellation.
   * @param onProgress    (0..1) progress.
   * @returns ExportResult with local file URI.
   */
  exportImage(
    documentJson: string,
    pageId: string,
    intent: ExportIntentRequest,
    jobId: string,
    onProgress?: (progress: number) => void,
  ): Promise<ExportResult>;

  // ── Thumbnail extraction ──

  /**
   * Extract a thumbnail at a specific timestamp from the (optionally
   * pre-exported) video. Falls back to the first frame.
   */
  extractThumbnail(
    videoUri: string,
    timeMs: number,
    maxWidth: number,
  ): Promise<ThumbnailResult>;

  // ── Cancellation ──

  /** Cancel an in-progress export by jobId. Aborts the native pipeline. */
  cancelExport(jobId: string): void;

  // ── Capability probe ──

  /** Returns device encode capabilities (codecs, HDR support, max resolution). */
  getExportCapabilities(): Promise<ExportCapabilities>;
}
