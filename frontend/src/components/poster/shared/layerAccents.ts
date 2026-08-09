/**
 * Layer accent colors — shared across the poster/creator surfaces.
 *
 * Premium selection visuals use distinct accent colors per layer category:
 *   text → blue, sticker → purple, drawing → green, image → orange.
 *
 * Subtle but distinguishable, matching the CreatorLayersSheet type icons.
 * Extracted from CreatorCanvas.tsx and CreatorLayersSheet.tsx so that the
 * poster composition surface, the creator canvas, and the layers sheet all
 * share one source of truth for layer-type accent colouring.
 */
import type { CreatorLayer, LayerType } from '../../../creator/composition';

// ── Accent colour constants ──────────────────────────────────────────
/** Text layers — blue. */
export const ACCENT_TEXT = '#3B82F6';
/** Sticker-type layers — purple. */
export const ACCENT_STICKER = '#8B5CF6';
/** Drawing layers — green. */
export const ACCENT_DRAWING = '#10B981';
/** Image / media / gif layers — orange. */
export const ACCENT_IMAGE = '#F59E0B';

/**
 * Returns the accent colour for a given layer type.
 *
 * Sticker-type layers (decorative, product, mention, look, vote, quiz,
 * question, emojiSlider, countdown, music, link, location, hashtag, time,
 * weather) all share the purple accent. Media and gif share the orange
 * accent. Draw uses green. Text uses blue. Unknown types fall back to the
 * text accent so the UI never renders an unstyled selection ring.
 */
export function getLayerAccentColor(type: CreatorLayer['type']): string {
  switch (type) {
    case 'text':
      return ACCENT_TEXT;
    case 'draw':
      return ACCENT_DRAWING;
    case 'media':
    case 'gif':
      return ACCENT_IMAGE;
    // All sticker-type layers share the purple accent
    case 'decorative':
    case 'product':
    case 'mention':
    case 'look':
    case 'vote':
    case 'quiz':
    case 'question':
    case 'emojiSlider':
    case 'countdown':
    case 'music':
    case 'link':
    case 'location':
    case 'hashtag':
    case 'time':
    case 'weather':
      return ACCENT_STICKER;
    default:
      return ACCENT_TEXT;
  }
}

/**
 * Maps a layer type to a human-readable category label for context menus,
 * selection announcements, and the layers sheet.
 */
export function getLayerCategoryLabel(type: CreatorLayer['type']): string {
  switch (type) {
    case 'text':
      return 'Text';
    case 'draw':
      return 'Drawing';
    case 'media':
      return 'Image';
    case 'gif':
      return 'GIF';
    default:
      return 'Sticker';
  }
}

/**
 * The full ordered list of layer types, useful for iteration and lookups.
 * Mirrors the discriminated union in composition.ts.
 */
export const LAYER_TYPES: readonly LayerType[] = [
  'media',
  'text',
  'product',
  'mention',
  'look',
  'vote',
  'quiz',
  'question',
  'emojiSlider',
  'countdown',
  'decorative',
  'draw',
  'gif',
  'music',
  'link',
  'location',
  'hashtag',
  'time',
  'weather',
] as const;
