/**
 * Shared layer-type labelling utility for the Poster and Look composers.
 *
 * Both composers need a human-readable label for a given layer type (used
 * in the layers list and the overflow menu). The labels are identical
 * except for a handful of types that use composer-specific vocabulary:
 *
 *  - `media`   → "Media" (poster) / "Photo" (look)
 *  - `product` → "Product" (poster) / "Item" (look)
 *  - default   → "Layer" (poster) / "Object" (look)
 *
 * @module layerUtils
 */

import type { CreatorLayer } from '../composition';

/**
 * Returns a human-readable label for a creator layer type.
 *
 * @param type   The layer type to label.
 * @param context  `'poster'` or `'look'`. Controls the vocabulary for
 *                 `media`, `product`, and the default fallback. Defaults
 *                 to `'poster'` when omitted.
 */
export function layerTypeLabel(
  type: CreatorLayer['type'],
  context: 'poster' | 'look' = 'poster',
): string {
  const isLook = context === 'look';
  switch (type) {
    case 'media': return isLook ? 'Photo' : 'Media';
    case 'text': return 'Text';
    case 'product': return isLook ? 'Item' : 'Product';
    case 'mention': return 'Mention';
    case 'look': return 'Look';
    case 'vote': return 'Vote';
    case 'quiz': return 'Quiz';
    case 'question': return 'Question';
    case 'emojiSlider': return 'Slider';
    case 'countdown': return 'Countdown';
    case 'decorative': return 'Shape';
    case 'draw': return 'Drawing';
    case 'gif': return 'GIF';
    case 'music': return 'Music';
    case 'link': return 'Link';
    case 'location': return 'Location';
    case 'hashtag': return 'Hashtag';
    case 'time': return 'Time';
    case 'weather': return 'Weather';
    default: return isLook ? 'Object' : 'Layer';
  }
}
