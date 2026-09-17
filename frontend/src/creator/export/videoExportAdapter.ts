/**
 * videoExportAdapter — flattens a single-video-clip CreatorDocument page
 * into a `VideoExportRequest` for the `thryft-video-export` Nitro module
 * (AVFoundation / Media3 Transformer).
 *
 * Parity strategy for overlays: rather than shipping an SVG rasteriser
 * natively, the adapter rasterises ALL non-media overlay layers into one
 * transparent PNG at output resolution via the existing Skia export
 * renderer (`jsExportImage`) — the same renderer the preview uses, so the
 * burned-in pixels are identical to what the creator authored. The PNG is
 * passed as a single full-frame `sticker` overlay.
 *
 * Scope guardrails (returns null → caller falls back to the backend
 * render path):
 *   - more than one page
 *   - more than one media layer, or a non-video media layer
 *   - a remote (http/https) source — the native pipeline needs a local
 *     file; remote sources must go through the backend render
 *   - no Skia overlay rasterisation AND layers that can't go through the
 *     native text-overlay path
 */
import type {
  VideoExportRequest,
  VideoOverlay,
} from '../../../modules/thryft-video-export/src';
import {
  isJsExportAvailable,
  jsExportImage,
  type ExportIntentRequest,
} from '../../../modules/thryft-media-export/src';
import type { CreatorDocument } from '../core/projectStore/composition';

/** Overlay rasterise intent — transparent PNG at the output resolution. */
function overlayIntent(width: number, height: number): ExportIntentRequest {
  return {
    surface: 'marketplace_feed',
    format: 'png',
    codec: 'jpeg',
    maxWidth: width,
    maxHeight: height,
    fps: null,
    bitrateBps: null,
    hdrPolicy: 'tone_map_sdr',
    audioCodec: 'aac',
    audioBitrateBps: 0,
    muteAudio: true,
    burnOverlays: true,
    optimizeForNetworkUse: false,
  };
}

function isLocalFileUri(uri: string): boolean {
  return uri.startsWith('file://') || uri.startsWith('/');
}

/**
 * Every visible non-media layer is an overlay. The Skia rasteriser draws
 * exactly what the preview draws — including music/visual chips — so the
 * PNG burn-in matches the authored frame. Music's *audio* is out of scope
 * for the single-clip path (audio mixdown stays with the backend render).
 */

/**
 * Build a `VideoExportRequest` for a document whose exportable content is
 * a single video clip. Returns null when the document doesn't qualify —
 * the caller falls back to the backend render path.
 *
 * @param document   The composition document.
 * @param pageId     The page to export (multi-page documents return null).
 * @param output     Output resolution (pixels).
 * @param sessionId  Stable id for cancellation + progress polling.
 */
export async function buildSingleClipVideoRequest(
  document: CreatorDocument,
  pageId: string,
  output: { width: number; height: number },
  sessionId: string,
): Promise<VideoExportRequest | null> {
  const page = document.pages.find((p) => p.id === pageId);
  if (!page) return null;

  const visibleLayers = page.layers.filter((l) => !l.hidden);
  const mediaLayers = visibleLayers.filter((l) => l.type === 'media');
  if (mediaLayers.length !== 1) return null;

  const mediaLayer = mediaLayers[0];
  if (mediaLayer.type !== 'media') return null;
  const media = mediaLayer.payload;
  if (media.mediaType !== 'video') return null;
  if (!isLocalFileUri(media.mediaUri)) return null;

  // Honour-authored-edits guard: the single-clip contract carries a mute
  // flag and geometry, not a mixdown or an effects graph. If the clip has
  // authored partial volume, fades, filters, focal-point reframing, or an
  // effects recipe, the native path would silently drop them — return
  // null so the caller falls back to the backend render at full fidelity.
  const volume = media.volume ?? 1;
  const hasUnsupportedAudio = (volume > 0 && volume < 1)
    || (media.fadeInMs ?? 0) > 0
    || (media.fadeOutMs ?? 0) > 0;
  const hasUnsupportedVideo =
    (media.effects?.length ?? 0) > 0
    || media.filterId != null
    || media.focalPoint != null;
  if (hasUnsupportedAudio || hasUnsupportedVideo) return null;

  // Overlay layers: every visible layer except the media layer itself.
  const overlayLayers = visibleLayers.filter(
    (l) => l.id !== mediaLayer.id && l.type !== 'media',
  );

  const overlays: VideoOverlay[] = [];
  if (overlayLayers.length > 0) {
    if (!isJsExportAvailable()) {
      // Without Skia the only native overlay path is text — and even that
      // only covers plain text layers. Anything else can't be represented;
      // return null so the backend render handles full fidelity.
      const allText = overlayLayers.every((l) => l.type === 'text');
      if (!allText) return null;
      for (const layer of overlayLayers) {
        if (layer.type !== 'text') continue;
        const p = layer.payload;
        overlays.push({
          id: layer.id,
          kind: 'text',
          // Layer model stores centre-x/centre-y; the overlay contract is
          // top-left normalised. Scale multiplies the authored box.
          x: layer.x - (layer.width * layer.scale) / 2,
          y: layer.y - (layer.height * layer.scale) / 2,
          width: layer.width * layer.scale,
          height: layer.height * layer.scale,
          rotationDeg: layer.rotation,
          opacity: layer.opacity * (p.opacity ?? 1),
          text: p.text ?? '',
          // fontSize is authored against a 1080-wide reference canvas —
          // scale to the output frame (matches compositionRenderer.ts:
          // `fontSizeRaw * (canvasWidth / 1080)`).
          fontSize: p.fontSize != null
            ? Math.round(p.fontSize * (output.width / 1080))
            : Math.round(layer.height * layer.scale * output.height * 0.7),
          textColor: p.textColor ?? '#ffffff',
          backgroundColor: p.backgroundColor,
          alignment: p.alignment === 'justify' ? 'center' : p.alignment,
        });
      }
    } else {
      // Rasterise the overlay stack to a transparent PNG via the Skia
      // export renderer — same code path as the preview, so the burn-in
      // matches pixel-for-pixel.
      const overlayDocument: CreatorDocument = {
        ...document,
        canvas: {
          ...document.canvas,
          background: { type: 'color', value: 'transparent' },
        },
        pages: [
          {
            ...page,
            layers: page.layers.filter(
              (l) => !l.hidden && l.id !== mediaLayer.id && l.type !== 'media',
            ),
          },
        ],
      };
      const result = await jsExportImage(
        JSON.stringify(overlayDocument),
        page.id,
        overlayIntent(output.width, output.height),
        `overlay-${sessionId}`,
      );
      if (result?.uri) {
        overlays.push({
          id: `${mediaLayer.id}-overlays`,
          kind: 'sticker',
          x: 0,
          y: 0,
          width: 1,
          height: 1,
          rotationDeg: 0,
          opacity: 1,
          stickerImageUri: result.uri,
        });
      }
    }
  }

  return {
    sourceUri: media.mediaUri,
    trimStartMs: media.trimStartMs,
    trimEndMs: media.trimEndMs,
    speed: media.speed,
    speedCurve: media.speedCurve,
    reversed: media.reversed,
    freezeFrameMs: media.freezeFrameMs,
    freezeDurationMs: media.freezeDurationMs,
    // The contract carries a mute flag, not a volume scalar — partial
    // volume is a mixdown concern the backend render handles.
    muteAudio: volume === 0,
    overlays: overlays.length > 0 ? overlays : undefined,
    outputFormat: 'mp4',
    outputWidth: output.width,
    outputHeight: output.height,
    sessionId,
  };
}
