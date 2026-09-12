/**
 * renderedViewDocument — adapt a stored composition document for viewer
 * playback when the backend baked the page into a rendered artifact.
 *
 * The publish pipeline stores two URLs per frame: `media_url` (the
 * canonical artifact — a flattened image or an FFmpeg-rendered video with
 * trim/speed/reverse/freeze/curves/overlays/filters burned in) and
 * `source_media_url` (the verified original upload). The composition
 * document stored on the story still references the *source* media, so a
 * viewer that plays `payload.mediaUri` directly would show the unedited
 * source — ignoring every authored edit the render pipeline applied.
 *
 * `pageWithRenderedMedia` rewrites the page so the canvas plays the baked
 * artifact as its media layer:
 *
 * - The first visible media layer's payload is replaced with the rendered
 *   URL; all baked edit fields (trim, speed, curve, reverse, freeze,
 *   fades, filters, focal crop) are cleared — re-applying them would
 *   double-apply what the artifact already contains.
 * - Static overlay layers that the renderer draws into the artifact
 *   (text, draw, gif, decorative, countdown, location, hashtag,
 *   adjustment) are dropped — keeping them would double-draw.
 * - Layers that require live behavior keep rendering: interactive
 *   stickers (vote, quiz, question, emojiSlider, link, product, look),
 *   dynamic data stickers (mention, time, weather), and music. Their
 *   baked static copy sits underneath the live layer at the same authored
 *   geometry — the live layer covers it and stays tappable.
 */
import type { CreatorLayer, CreatorPage } from './composition';

/** Layer types that must stay live in the viewer — they carry taps,
 *  live data, or audio the baked artifact cannot provide. */
const LIVE_VIEW_LAYER_TYPES = new Set<CreatorLayer['type']>([
  'vote',
  'quiz',
  'question',
  'emojiSlider',
  'link',
  'product',
  'look',
  'music',
  'mention',
  'time',
  'weather',
]);

/**
 * Return a view-mode page whose primary media is the rendered artifact.
 *
 * @param page             The authored page from the stored document.
 * @param renderedUrl      The frame's published `media_url` (baked render).
 * @param renderedMediaType The artifact's media type ('video' for mp4 renders).
 */
export function pageWithRenderedMedia(
  page: CreatorPage,
  renderedUrl: string,
  renderedMediaType: 'image' | 'video',
): CreatorPage {
  let primaryReplaced = false;
  const layers: CreatorLayer[] = [];

  for (const layer of page.layers) {
    if (layer.type === 'media') {
      if (!primaryReplaced && !layer.hidden) {
        primaryReplaced = true;
        layers.push({
          ...layer,
          // The artifact is a full-canvas render — identity geometry.
          x: 0.5,
          y: 0.5,
          width: 1,
          height: 1,
          scale: 1,
          rotation: 0,
          opacity: 1,
          // Every baked behavior must not re-apply.
          keyframes: undefined,
          pin: undefined,
          maskRef: undefined,
          timeRange: undefined,
          clipId: undefined,
          payload: {
            mediaUri: renderedUrl,
            mediaType: renderedMediaType,
            contentFit: 'cover',
            opacity: 1,
          },
        });
      } else {
        // Additional media layers are not baked by the renderer — keep
        // them verbatim so nothing authored is silently dropped.
        layers.push(layer);
      }
      continue;
    }
    if (LIVE_VIEW_LAYER_TYPES.has(layer.type)) {
      layers.push(layer);
    }
    // Baked static overlays (text, draw, gif, decorative, countdown,
    // location, hashtag, adjustment) are already in the artifact.
  }

  return { ...page, layers };
}
