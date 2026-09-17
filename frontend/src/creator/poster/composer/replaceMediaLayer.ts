/**
 * replaceMediaLayer — pure "replace media" merge for the Poster composer.
 *
 * Extracted from PosterComposerScreen's `handlePickerAddLayer` (pure
 * extraction — no behavioral change). When the asset picker is in replace
 * mode, the incoming layer is a brand-new layer with default trim/speed/
 * volume; this merge preserves the existing layer's id and authored
 * properties so a media swap never discards editing work.
 */
import type { CreatorLayer } from '../../core/projectStore/composition';

/**
 * The media-layer variant of the CreatorLayer union — callers narrow with
 * `layer.type === 'media'` before invoking this merge.
 */
type MediaLayer = Extract<CreatorLayer, { type: 'media' }>;

/**
 * Builds the replacement layer for a media swap: keeps the existing
 * layer's id, trim, speed, volume, effects, zIndex and other authored
 * fields; updates only the media source (uri, type, duration). Returns a
 * full CreatorLayer ready for `updateLayer(id, layer, 'Replace clip media')`.
 */
export function buildReplacedMediaLayer(
  editingLayer: MediaLayer,
  layer: MediaLayer,
): CreatorLayer {
  // Replace mode: preserve the existing layer's id, trim, speed, volume,
  // effects, zIndex, and other authored properties. Only the media
  // source (uri, type, duration) should change. Without this, the
  // picker's brand-new layer (with default trim/speed/volume) would
  // silently discard all the user's editing work.
  // Clamp the preserved trim window to the replacement media's
  // duration. A replace can bring in shorter media ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â keeping a
  // trimEndMs past the new duration would stretch the projected
  // clip beyond real source content.
  const newVideoDuration = layer.payload.mediaType === 'video'
    ? (layer.payload.videoDurationMs ?? undefined)
    : undefined;
  let trimStartMs = editingLayer.payload.trimStartMs;
  let trimEndMs = editingLayer.payload.trimEndMs;
  if (newVideoDuration != null && newVideoDuration > 0) {
    if (trimStartMs != null && trimStartMs >= newVideoDuration) {
      trimStartMs = 0;
    }
    if (trimEndMs != null && trimEndMs > newVideoDuration) {
      trimEndMs = newVideoDuration;
    }
    if (trimStartMs != null && trimEndMs != null && trimEndMs <= trimStartMs) {
      trimStartMs = 0;
      trimEndMs = newVideoDuration;
    }
  } else if (layer.payload.mediaType !== 'video') {
    // Replacing with a still image — source-window and playback fields
    // are meaningless; clear them so playback treats this as a static
    // page with the authored hold duration.
    trimStartMs = undefined;
    trimEndMs = undefined;
  }
  // freezeFrameMs is a timestamp into the OLD media's source — the same
  // ms in the replacement is a different frame entirely. Clear it; the
  // user re-sets the freeze on the new media if they still want one.
  const freezeCleared = layer.payload.mediaUri !== editingLayer.payload.mediaUri;
  const isStillImage = layer.payload.mediaType !== 'video';
  const preserved: CreatorLayer = {
    ...editingLayer,
    // Keep the original id so selection and timeline stay valid.
    id: editingLayer.id,
    payload: {
      ...editingLayer.payload,
      // Update only the media source fields.
      mediaUri: layer.payload.mediaUri,
      mediaType: layer.payload.mediaType,
      videoDurationMs: layer.payload.videoDurationMs,
      trimStartMs,
      trimEndMs,
      freezeFrameMs: freezeCleared ? undefined : editingLayer.payload.freezeFrameMs,
      freezeDurationMs: freezeCleared ? undefined : editingLayer.payload.freezeDurationMs,
      // Playback-only fields are inert on a still — clear them so they
      // don't silently resurrect if the layer is relinked to video later.
      speed: isStillImage ? undefined : editingLayer.payload.speed,
      speedCurve: isStillImage ? undefined : editingLayer.payload.speedCurve,
      reversed: isStillImage ? undefined : editingLayer.payload.reversed,
      volume: isStillImage ? undefined : editingLayer.payload.volume,
      fadeInMs: isStillImage ? undefined : editingLayer.payload.fadeInMs,
      fadeOutMs: isStillImage ? undefined : editingLayer.payload.fadeOutMs,
      // Stale upload receipts belong to the replaced media — clear
      // them so publish re-uploads/re-finalizes the new source
      // rather than binding the old receipt to a different URL.
      mediaFinalizationId: undefined,
      mediaAssetId: undefined,
      thumbnailFinalizationId: undefined,
      thumbnailMediaAssetId: undefined,
      // Clear the thumbnail so it regenerates for the new media.
      thumbnailUri: undefined,
    },
  };
  return preserved;
}
