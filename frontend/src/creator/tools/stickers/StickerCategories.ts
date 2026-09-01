/**
 * StickerCategories — sticker category + definition types and curated data.
 *
 * Extracted from CreatorAssetPicker's monolithic StickerTray (spec
 * 07_MEDIA_TOOLCHAIN). Defines the sticker taxonomy used by
 * StickerBrowserSheet.
 *
 * Categories:
 *   - Emoji:       emoji stickers (rendered as text glyphs)
 *   - Shapes:      decorative geometric shapes
 *   - Arrows:      directional arrows
 *   - Symbols:     punctuation / typographic symbols
 *   - Decorative:  ornamental stickers (stars, hearts, gems)
 *   - Interactive: poll / quiz / question / mention / location / hashtag / link
 *
 * Interactive stickers are gated by the capability registry — only
 * stickers whose backend, viewer, and editor capabilities are all
 * 'supported' are visible. This prevents offering a tool whose
 * interaction the backend cannot persist or serve.
 */
import type { Ionicons } from '@expo/vector-icons';
import { isCapabilitySupported, getCapabilityForLayerType } from '../../capabilities/registry';

// ── Types ─────────────────────────────────────────────────────────────
export interface StickerDef {
  id: string;
  name: string;
  /** For emoji stickers — rendered as a text glyph. */
  emoji?: string;
  /** For icon-based stickers — Ionicons glyph name. */
  iconRef?: React.ComponentProps<typeof Ionicons>['name'];
  category: string;
  /**
   * Optional description shown in search results / accessibility label.
   */
  description?: string;
  /**
   * Interactive stickers (poll/quiz/question/mention/location/hashtag/link)
   * require a configuration step after selection. When `interactive` is true
   * the browser sheet calls onStickerSelect and expects the caller to open
   * the relevant configuration picker.
   */
  interactive?: boolean;
  /**
   * For interactive stickers, the picker mode to route to after selection.
   * Mirrors AssetPickerMode values used by CreatorAssetPicker.
   */
  pickerMode?: string;
}

export interface StickerCategory {
  id: string;
  name: string;
  /** Ionicons glyph name for the category tab. */
  icon: React.ComponentProps<typeof Ionicons>['name'];
  stickers: StickerDef[];
}

// ── Curated sticker catalog ───────────────────────────────────────────
// The 'auto' category is a placeholder entry — its stickers are populated
// dynamically at runtime by AutoStickers.ts based on media analysis.
export const AUTO_STICKER_CATEGORY: StickerCategory = {
  id: 'auto',
  name: 'Auto',
  icon: 'bulb-outline',
  stickers: [],
};

// ── Picker mode → layer type mapping ──────────────────────────────────
// Maps the sticker pickerMode to the composition layer type it creates.
// Used by the capability registry filter to hide stickers whose backend
// support is not verified.
const PICKER_MODE_TO_LAYER_TYPE: Record<string, string> = {
  vote: 'vote',
  quiz: 'quiz',
  question: 'question',
  mention: 'mention',
  product: 'product',
  look: 'look',
  location: 'location',
  hashtag: 'hashtag',
  link: 'link',
  emojiSlider: 'emojiSlider',
  countdown: 'countdown',
  music: 'music',
  gif: 'gif',
  time: 'time',
  weather: 'weather',
};

export const STICKER_CATEGORIES: StickerCategory[] = [
  AUTO_STICKER_CATEGORY,
  {
    id: 'emoji',
    name: 'Emoji',
    icon: 'happy-outline',
    stickers: [
      { id: 'emoji-heart-eyes', name: 'Heart Eyes', emoji: '😍', category: 'emoji' },
      { id: 'emoji-fire', name: 'Fire', emoji: '🔥', category: 'emoji' },
      { id: 'emoji-sparkle', name: 'Sparkle', emoji: '✨', category: 'emoji' },
      { id: 'emoji-heart', name: 'Heart', emoji: '❤️', category: 'emoji' },
      { id: 'emoji-party', name: 'Party', emoji: '🎉', category: 'emoji' },
      { id: 'emoji-star', name: 'Star', emoji: '⭐', category: 'emoji' },
      { id: 'emoji-thumbs-up', name: 'Thumbs Up', emoji: '👍', category: 'emoji' },
      { id: 'emoji-100', name: '100', emoji: '💯', category: 'emoji' },
      { id: 'emoji-clap', name: 'Clap', emoji: '👏', category: 'emoji' },
      { id: 'emoji-crown', name: 'Crown', emoji: '👑', category: 'emoji' },
      { id: 'emoji-rocket', name: 'Rocket', emoji: '🚀', category: 'emoji' },
      { id: 'emoji-diamond', name: 'Diamond', emoji: '💎', category: 'emoji' },
    ],
  },
  {
    id: 'shapes',
    name: 'Shapes',
    icon: 'shapes-outline',
    stickers: [
      { id: 'shape-circle', name: 'Circle', iconRef: 'ellipse-outline', category: 'shapes' },
      { id: 'shape-square', name: 'Square', iconRef: 'square-outline', category: 'shapes' },
      { id: 'shape-triangle', name: 'Triangle', iconRef: 'triangle-outline', category: 'shapes' },
      { id: 'shape-star', name: 'Star', iconRef: 'star-outline', category: 'shapes' },
      { id: 'shape-heart', name: 'Heart', iconRef: 'heart-outline', category: 'shapes' },
      { id: 'shape-hexagon', name: 'Hexagon', iconRef: 'stop-outline', category: 'shapes' },
    ],
  },
  {
    id: 'arrows',
    name: 'Arrows',
    icon: 'arrow-up-outline',
    stickers: [
      { id: 'arrow-up', name: 'Up', iconRef: 'arrow-up', category: 'arrows' },
      { id: 'arrow-down', name: 'Down', iconRef: 'arrow-down', category: 'arrows' },
      { id: 'arrow-left', name: 'Left', iconRef: 'arrow-back', category: 'arrows' },
      { id: 'arrow-right', name: 'Right', iconRef: 'arrow-forward', category: 'arrows' },
      { id: 'arrow-up-right', name: 'Up Right', iconRef: 'arrow-up-right-box', category: 'arrows' },
      { id: 'arrow-down-right', name: 'Down Right', iconRef: 'arrow-down-right-box', category: 'arrows' },
    ],
  },
  {
    id: 'symbols',
    name: 'Symbols',
    icon: 'bag-handle-outline',
    stickers: [
      { id: 'symbol-check', name: 'Check', iconRef: 'checkmark-circle-outline', category: 'symbols' },
      { id: 'symbol-cross', name: 'Cross', iconRef: 'close-circle-outline', category: 'symbols' },
      { id: 'symbol-question', name: 'Question', iconRef: 'help-circle-outline', category: 'symbols' },
      { id: 'symbol-exclaim', name: 'Exclaim', iconRef: 'alert-circle-outline', category: 'symbols' },
      { id: 'symbol-info', name: 'Info', iconRef: 'information-circle-outline', category: 'symbols' },
      { id: 'symbol-at', name: 'At', iconRef: 'at-outline', category: 'symbols' },
    ],
  },
  {
    id: 'decorative',
    name: 'Decorative',
    icon: 'shapes-outline',
    stickers: [
      { id: 'deco-sparkles', name: 'Sparkles', iconRef: 'star-outline', category: 'decorative' },
      { id: 'deco-flower', name: 'Flower', iconRef: 'flower-outline', category: 'decorative' },
      { id: 'deco-ribbon', name: 'Ribbon', iconRef: 'gift-outline', category: 'decorative' },
      { id: 'deco-gem', name: 'Gem', iconRef: 'diamond-outline', category: 'decorative' },
      { id: 'deco-bow', name: 'Bow', iconRef: 'ribbon-outline', category: 'decorative' },
    ],
  },
  {
    id: 'interactive',
    name: 'Interactive',
    icon: 'stats-chart-outline',
    // Interactive stickers are filtered by the capability registry.
    // Only stickers whose backend, viewer, and editor capabilities are
    // all 'supported' are visible. Supported: poll, item, look, mention.
    // Unsupported (hidden): quiz, question, location, hashtag, link —
    // the backend has no sticker type for them and the viewer cannot
    // render their interactions.
    stickers: ([
      { id: 'poll', name: 'Poll', iconRef: 'stats-chart-outline', category: 'interactive', description: '2-option vote', interactive: true, pickerMode: 'vote' },
      { id: 'product', name: 'Item', iconRef: 'bag-handle-outline', category: 'interactive', description: 'Tag a listing', interactive: true, pickerMode: 'product' },
      { id: 'look', name: 'Look', iconRef: 'shirt-outline', category: 'interactive', description: 'Tag a look', interactive: true, pickerMode: 'look' },
      { id: 'quiz', name: 'Quiz', iconRef: 'help-circle-outline', category: 'interactive', description: 'Trivia with answer', interactive: true, pickerMode: 'quiz' },
      { id: 'question', name: 'Ask', iconRef: 'chatbubble-outline', category: 'interactive', description: 'Open Q&A', interactive: true, pickerMode: 'question' },
      { id: 'mention', name: '@Mention', iconRef: 'at-outline', category: 'interactive', description: 'Tag a user', interactive: true, pickerMode: 'mention' },
      { id: 'location', name: 'Location', iconRef: 'location-outline', category: 'interactive', description: 'Tag a place', interactive: true, pickerMode: 'location' },
      { id: 'hashtag', name: 'Hashtag', iconRef: 'bag-handle-outline', category: 'interactive', description: 'Topic tag', interactive: true, pickerMode: 'hashtag' },
      { id: 'link', name: 'Link', iconRef: 'link-outline', category: 'interactive', description: 'Clickable URL', interactive: true, pickerMode: 'link' },
    ] as StickerDef[]).filter((s) => {
      // Map pickerMode to the layer type it creates, then check capability.
      // Non-interactive stickers (emoji, shapes, etc.) are always visible.
      if (!s.interactive || !s.pickerMode) return true;
      const layerType = PICKER_MODE_TO_LAYER_TYPE[s.pickerMode];
      if (!layerType) return true;
      const capId = getCapabilityForLayerType(layerType);
      if (!capId) return true;
      return isCapabilitySupported(capId);
    }),
  },
];
