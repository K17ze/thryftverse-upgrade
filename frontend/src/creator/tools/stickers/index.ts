/**
 * Stickers tool — barrel exports for the creator sticker browser.
 *
 * Exposes the StickerBrowserSheet component plus the sticker taxonomy
 * (categories, definitions, types) defined in StickerCategories.
 */
export { StickerBrowserSheet, type StickerBrowserSheetProps } from './StickerBrowserSheet';
export {
  STICKER_CATEGORIES,
  type StickerDef,
  type StickerCategory,
} from './StickerCategories';
