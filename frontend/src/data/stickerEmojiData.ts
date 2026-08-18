/**
 * Emoji picker data for the StickerPicker component.
 *
 * Each entry maps an emoji glyph to a list of lowercase keywords used by the
 * sticker search filter. The keywords describe common synonyms and associated
 * concepts so that searching for "fire" surfaces the 🔥 emoji, etc.
 *
 * This data is intentionally kept as a static, module-level constant so it is
 * allocated once and shared across renders of the emoji tab.
 */

/** A single emoji entry with its searchable keywords. */
export interface EmojiEntry {
  /** The emoji glyph rendered in the picker and persisted on the sticker. */
  emoji: string;
  /** Lowercase keywords used by the sticker search filter. */
  keywords: string[];
}

/**
 * The full set of emoji available in the sticker picker, with keywords for
 * search filtering. Order is preserved as the display order in the picker.
 */
export const EMOJI_DATA: EmojiEntry[] = [
  { emoji: '🔥', keywords: ['fire', 'hot', 'lit', 'flame', 'trending'] },
  { emoji: '❤️', keywords: ['heart', 'love', 'red', 'romance'] },
  { emoji: '😂', keywords: ['laugh', 'funny', 'lol', 'joy'] },
  { emoji: '😍', keywords: ['love', 'heart eyes', 'adore', 'smitten'] },
  { emoji: '👀', keywords: ['eyes', 'look', 'watch', 'see'] },
  { emoji: '✨', keywords: ['sparkle', 'shine', 'magic', 'stars'] },
  { emoji: '🎉', keywords: ['party', 'celebrate', 'confetti', 'festive'] },
  { emoji: '💯', keywords: ['hundred', 'perfect', '100', 'approval'] },
  { emoji: '🙌', keywords: ['praise', 'hands up', 'celebrate', 'yes'] },
  { emoji: '⚡', keywords: ['lightning', 'fast', 'energy', 'bolt'] },
  { emoji: '🌟', keywords: ['star', 'shine', 'bright', 'featured'] },
  { emoji: '💥', keywords: ['boom', 'explosion', 'impact', 'bang'] },
  { emoji: '🏷️', keywords: ['tag', 'label', 'price', 'sale'] },
  { emoji: '📌', keywords: ['pin', 'location', 'mark', 'save'] },
  { emoji: '🚀', keywords: ['rocket', 'launch', 'fast', 'growth'] },
  { emoji: '💎', keywords: ['diamond', 'gem', 'jewel', 'valuable'] },
  { emoji: '🛍️', keywords: ['shopping', 'bag', 'purchase', 'retail'] },
  { emoji: '👗', keywords: ['dress', 'fashion', 'clothing', 'wear'] },
  { emoji: '👟', keywords: ['shoe', 'sneaker', 'footwear', 'run'] },
  { emoji: '👜', keywords: ['bag', 'purse', 'handbag', 'accessory'] },
  { emoji: '💰', keywords: ['money', 'cash', 'profit', 'deal'] },
  { emoji: '🤑', keywords: ['money', 'rich', 'profit', 'cash'] },
  { emoji: '😍', keywords: ['love', 'heart', 'adore'] },
  { emoji: '🤩', keywords: ['excited', 'star', 'amazing', 'wow'] },
  { emoji: '😎', keywords: ['cool', 'sunglasses', 'chill', 'swag'] },
  { emoji: '🤔', keywords: ['think', 'question', 'hmm', 'wonder'] },
  { emoji: '😱', keywords: ['shock', 'scream', 'wow', 'surprised'] },
  { emoji: '😭', keywords: ['cry', 'sad', 'tears', 'emotional'] },
  { emoji: '🥺', keywords: ['pleading', 'cute', 'beg', 'sad'] },
  { emoji: '😏', keywords: ['smirk', 'smug', 'flirt', 'cheeky'] },
  { emoji: '👍', keywords: ['thumbs up', 'yes', 'approve', 'good'] },
  { emoji: '👎', keywords: ['thumbs down', 'no', 'disapprove', 'bad'] },
  { emoji: '👏', keywords: ['clap', 'applause', 'praise', 'well done'] },
  { emoji: '🤝', keywords: ['handshake', 'deal', 'agreement', 'partnership'] },
  { emoji: '✅', keywords: ['check', 'done', 'complete', 'verified'] },
  { emoji: '❌', keywords: ['cross', 'no', 'cancel', 'wrong'] },
  { emoji: '⭐', keywords: ['star', 'rating', 'review', 'favorite'] },
  { emoji: '🏆', keywords: ['trophy', 'win', 'champion', 'first'] },
  { emoji: '🎁', keywords: ['gift', 'present', 'free', 'bonus'] },
  { emoji: '🆕', keywords: ['new', 'fresh', 'latest', 'just in'] },
  { emoji: '🆓', keywords: ['free', 'no cost', 'gratis'] },
  { emoji: '💰', keywords: ['money', 'cash', 'deal', 'price'] },
  { emoji: '🏷️', keywords: ['tag', 'label', 'sale', 'price'] },
];
