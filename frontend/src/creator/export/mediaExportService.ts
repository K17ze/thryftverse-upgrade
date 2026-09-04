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
 * When the native module is NOT linked (Expo Go, web), the service
 * gracefully degrades — `isExportAvailable()` returns false and the
 * publish flow falls back to uploading the source media directly.
 */
import {
  isMediaExportAvailable,
  getMediaExport,
  type ExportIntentRequest,
  type ExportResult,
} from '../../../modules/thryft-media-export/src';
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
  return isMediaExportAvailable();
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
  const module = getMediaExport();
  if (!module) return null;

  const intent = options?.quality === 'hd'
    ? { ...LOOK_CARD_INTENT, maxWidth: 1920, maxHeight: 2400 }
    : LOOK_CARD_INTENT;

  const jobId = `export-img-${document.id}-${Date.now()}`;
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
  const module = getMediaExport();
  if (!module) return null;

  const jobId = `export-thumb-${document.id}-${Date.now()}`;
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

/**
 * Cancel an in-progress export by job ID.
 */
export function cancelExport(jobId: string): void {
  const module = getMediaExport();
  if (!module) return;
  module.cancelExport(jobId);
}
