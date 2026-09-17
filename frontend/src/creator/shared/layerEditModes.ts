/**
 * layerEditModes — shared layer-type → editor-picker-mode map.
 *
 * Layer types that have a dedicated editor → the picker mode that edits
 * them. Interactive stickers (quiz, question, countdown, …) reopen their
 * own picker in edit mode; types without an editor (decorative, gif,
 * music, adjustment) are absent — the rail gates Edit on this map so it
 * never renders a dead action.
 */

import type { CreatorLayer } from '../core/projectStore/composition';
import type { AssetPickerMode } from '../surfaces/CreatorAssetPicker';

export const LAYER_TYPE_TO_PICKER_MODE: Partial<Record<CreatorLayer['type'], AssetPickerMode>> = {
  media: 'media',
  product: 'product',
  mention: 'mention',
  look: 'look',
  vote: 'vote',
  draw: 'draw',
  quiz: 'quiz',
  question: 'question',
  emojiSlider: 'emojiSlider',
  countdown: 'countdown',
  link: 'link',
  location: 'location',
  hashtag: 'hashtag',
  time: 'time',
  weather: 'weather',
};
