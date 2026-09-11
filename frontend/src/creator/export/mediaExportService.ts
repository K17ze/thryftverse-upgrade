/**
 * mediaExportService — bridges the ThryftMediaExport native module to the
 * creator publish flow.
 *
 * When the native module is linked (custom dev client), this service:
 *   1. Renders the CreatorDocument to a local file via Skia (image) or
 *      AVFoundation/Media3 (video).
 *   2. Returns the local file URI for upload via the existing
 *      mediaUploadPipeline.
 *
 * When the native module is NOT linked but Skia IS available, the service
 * falls back to `jsExportImage` — a pure-JS offscreen Skia renderer that
 * handles image compositions (poster/look frames) with overlays burned in.
 * Video export remains behind the native module gate.
 *
 * When neither path is available (web, Expo Go without Skia), the service
 * returns null and the publish flow falls back to uploading source media.
 */
import {
  isMediaExportAvailable,
  isJsExportAvailable,
  getMediaExport,
  jsExportImage,
  type ExportIntentRequest,
  type ExportResult,
} from '../../../modules/thryft-media-export/src';
// Native single-clip video export module (Nitro HybridObject contract + JS
// wiring). The native implementation (AVFoundation / Media3 Transformer) is
// DEFERRED — this import is safe because the module's JS side degrades
// gracefully: `isThryftVideoExportAvailable()` returns false when the native
// HybridObject is not linked, preserving the existing fallback behaviour.
import {
  isVideoExportAvailable as isThryftVideoExportAvailable,
} from '../../../modules/thryft-video-export/src';
import type { CreatorDocument } from '../composition';

// ── Intent presets ───────────────────────────────────────────────────

const MARKETPLACE_FEED_INTENT: ExportIntentRequest = {
  surface: 'marketplace_feed',
  format: 'mp4',
  codec: 'h264',
  maxWidth: 1080,
  maxHeight: 1350,
  fps: 30,
  bitrateBps: 4_000_000,
  hdrPolicy: 'tone_map_sdr',
  audioCodec: 'aac',
  audioBitrateBps: 128_000,
  muteAudio: false,
  burnOverlays: true,
  optimizeForNetworkUse: true,
};

const MARKETPLACE_HD_INTENT: ExportIntentRequest = {
  surface: 'marketplace_hd',
  format: 'mp4',
  codec: 'h265',
  maxWidth: 1920,
  maxHeight: 1080,
  fps: 30,
  bitrateBps: 8_000_000,
  hdrPolicy: 'preserve',
  audioCodec: 'aac',
  audioBitrateBps: 192_000,
  muteAudio: false,
  burnOverlays: true,
  optimizeForNetworkUse: true,
};

const THUMBNAIL_INTENT: ExportIntentRequest = {
  surface: 'thumbnail',
  format: 'webp',
  codec: 'jpeg',
  maxWidth: 1080,
  maxHeight: 1350,
  fps: null,
  bitrateBps: null,
  hdrPolicy: 'tone_map_sdr',
  audioCodec: 'aac',
  audioBitrateBps: 0,
  muteAudio: true,
  burnOverlays: true,
  optimizeForNetworkUse: true,
};

const LOOK_CARD_INTENT: ExportIntentRequest = {
  surface: 'look_card',
  format: 'png',
  codec: 'jpeg',
  maxWidth: 1080,
  maxHeight: 1350,
  fps: null,
  bitrateBps: null,
  hdrPolicy: 'tone_map_sdr',
  audioCodec: 'aac',
  audioBitrateBps: 0,
  muteAudio: true,
  burnOverlays: true,
  optimizeForNetworkUse: true,
};

// ── Public API ───────────────────────────────────────────────────────

export function isExportAvailable(): boolean {
  // Module-level probe: true if either the native Nitro module
  // (video + image) or the JS Skia fallback (image only) is available.
  //
  // This does NOT account for the content being exported — the JS Skia
  // path cannot render video sources. Prefer the content-aware helpers
  // `isImageExportAvailable(document, pageId)` and
  // `isVideoExportAvailable()` whenever the caller has document/page
  // context. This function remains as a coarse module-level probe for
  // callers that have no content context yet (e.g. deciding whether to
  // show an export button at all).
  return isMediaExportAvailable();
}

/**
 * Returns true if only the JS Skia fallback is available (native module
 * not linked). Used by callers that need to distinguish the two paths —
 * e.g. to show "image export only" vs "full video export" in the UI.
 */
export function isJsExportOnly(): boolean {
  return !getMediaExport() && isJsExportAvailable();
}

/**
 * Returns true if a video composition can be exported. The JS Skia
 * fallback cannot render video sources — it produces a blank PNG
 * (background only) for a video page. Video export requires the native
 * Nitro module (AVFoundation on iOS / Media3 Transformer on Android).
 *
 * Use this instead of `isExportAvailable()` whenever the caller knows it
 * is dealing with video content.
 */
export function isVideoExportAvailable(): boolean {
  // Only a native module can export video. The JS Skia path has no
  // video decoder — jsExportImage loads media via Skia.Data.fromURI which
  // only decodes still images.
  //
  // Two native paths are wired:
  //   1. ThryftMediaExport (full CreatorDocument → AVFoundation/Media3).
  //   2. ThryftVideoExport (single-clip VideoExportRequest → AVFoundation/
  //      Media3) — the flagship Nitro module. Its native implementation is
  //      DEFERRED; until it is linked `isThryftVideoExportAvailable()`
  //      returns false and this collapses to the ThryftMediaExport check,
  //      preserving the existing behaviour.
  return getMediaExport() !== null || isThryftVideoExportAvailable();
}

/**
 * Returns true if an image composition can be exported for the given
 * page. This is content-aware: the native module can export any page
 * (image or video → image snapshot), while the JS Skia fallback can only
 * render pages whose primary media is an image (or pages with no media
 * at all — text/decorative-only compositions render the background +
 * overlays correctly).
 *
 * Use this instead of `isExportAvailable()` whenever the caller has the
 * document + page context. It prevents the JS fallback from
 * over-reporting availability for video pages, which would produce a
 * blank PNG (background only) because `jsExportImage` cannot decode a
 * video source.
 *
 * @param document  The composition document.
 * @param pageId    The page to check. If omitted, the first page is used.
 */
export function isImageExportAvailable(
  document: CreatorDocument,
  pageId?: string,
): boolean {
  // Native module handles all content types.
  if (getMediaExport() !== null) return true;

  // JS Skia fallback — only available for image content.
  if (!isJsExportAvailable()) return false;

  const page = pageId
    ? document.pages.find((p) => p.id === pageId)
    : document.pages[0];
  if (!page) return false;

  // A page with no media layers (text/decorative only) renders fine via
  // the JS path — there is no video source to fail to decode.
  const mediaLayers = page.layers.filter((l) => l.type === 'media');
  if (mediaLayers.length === 0) return true;

  // If ANY media layer on the page is video, the JS Skia path cannot
  // render it — Skia.Data.fromURI only decodes still images, so a video
  // source produces a null SkImage and the layer is skipped (blank).
  return mediaLayers.every(
    (l) => l.type === 'media' && l.payload.mediaType !== 'video',
  );
}

export interface ExportOptions {
  /** Quality tier for the export. */
  quality: 'feed' | 'hd';
  /** Called with progress 0..1 during export. */
  onProgress?: (progress: number) => void;
}

export interface ExportedImageResult {
  uri: string;
  width: number;
  height: number;
  sizeBytes: number;
}

/**
 * Export a single page (poster/look) to an image file via Skia offscreen
 * surface. Returns the local file URI.
 *
 * Falls back to null if the native module is not available — the caller
 * should use the source media directly in that case.
 */
export async function exportDocumentImage(
  document: CreatorDocument,
  pageId: string,
  options?: ExportOptions,
): Promise<ExportedImageResult | null> {
  const intent = options?.quality === 'hd'
    ? { ...LOOK_CARD_INTENT, maxWidth: 1920, maxHeight: 2400 }
    : LOOK_CARD_INTENT;

  const jobId = `export-img-${document.id}-${Date.now()}`;

  // ── Native path (preferred — full filter + video pipeline) ──
  const module = getMediaExport();
  if (module) {
    const result: ExportResult = await module.exportImage(
      JSON.stringify(document),
      pageId,
      intent,
      jobId,
      options?.onProgress,
    );
    return {
      uri: result.uri,
      width: result.width,
      height: result.height,
      sizeBytes: result.sizeBytes,
    };
  }

  // ── JS Skia fallback (image compositions only) ──
  if (isJsExportAvailable()) {
    const result = await jsExportImage(
      JSON.stringify(document),
      pageId,
      intent,
      jobId,
      options?.onProgress,
    );
    return {
      uri: result.uri,
      width: result.width,
      height: result.height,
      sizeBytes: result.sizeBytes,
    };
  }

  return null;
}

/**
 * Export a video composition to an MP4 file via AVFoundation (iOS) or
 * Media3 Transformer (Android). Returns the local file URI.
 *
 * Falls back to null if the native module is not available.
 */
export async function exportDocumentVideo(
  document: CreatorDocument,
  options?: ExportOptions,
): Promise<ExportedImageResult | null> {
  const module = getMediaExport();
  if (!module) return null;

  const intent = options?.quality === 'hd' ? MARKETPLACE_HD_INTENT : MARKETPLACE_FEED_INTENT;
  const jobId = `export-vid-${document.id}-${Date.now()}`;
  const result: ExportResult = await module.exportVideo(
    JSON.stringify(document),
    intent,
    jobId,
    options?.onProgress,
  );

  return {
    uri: result.uri,
    width: result.width,
    height: result.height,
    sizeBytes: result.sizeBytes,
  };
}

/**
 * Export a thumbnail from the composition. Used for feed previews and
 * look cards.
 */
export async function exportThumbnail(
  document: CreatorDocument,
  pageId: string,
  onProgress?: (progress: number) => void,
): Promise<ExportedImageResult | null> {
  const jobId = `export-thumb-${document.id}-${Date.now()}`;

  // ── Native path ──
  const module = getMediaExport();
  if (module) {
    const result: ExportResult = await module.exportImage(
      JSON.stringify(document),
      pageId,
      THUMBNAIL_INTENT,
      jobId,
      onProgress,
    );
    return {
      uri: result.uri,
      width: result.width,
      height: result.height,
      sizeBytes: result.sizeBytes,
    };
  }

  // ── JS Skia fallback ──
  if (isJsExportAvailable()) {
    const result = await jsExportImage(
      JSON.stringify(document),
      pageId,
      THUMBNAIL_INTENT,
      jobId,
      onProgress,
    );
    return {
      uri: result.uri,
      width: result.width,
      height: result.height,
      sizeBytes: result.sizeBytes,
    };
  }

  return null;
}

/**
 * Cancel an in-progress export by job ID.
 */
export function cancelExport(jobId: string): void {
  const module = getMediaExport();
  if (!module) return;
  module.cancelExport(jobId);
}
