/**
 * Barrel exports for the creator text editor system.
 *
 * Extracted from CreatorAssetPicker's monolithic TextPicker (spec 07_MEDIA_TOOLCHAIN).
 *
 * Usage:
 *   import { TextEditorSheet, FontChooserRail, TEXT_STYLE_PRESETS } from '@/creator/tools/text';
 *
 *   <TextEditorSheet
 *     visible={visible}
 *     onClose={() => setVisible(false)}
 *     initialText={layer?.payload.text ?? ''}
 *     initialStyle={layer?.payload}
 *     onConfirm={(text, style) => { ... }}
 *   />
 */
export { TextEditorSheet } from './TextEditorSheet';
export type { TextEditorSheetProps } from './TextEditorSheet';

export { FontChooserRail } from './FontChooserRail';
export type { FontChooserRailProps } from './FontChooserRail';

export {
  TEXT_STYLE_PRESETS,
  DEFAULT_TEXT_STYLE,
  getPresetById,
  resolvePreviewStyle,
  type TextStylePreset,
  type TextStyleCategory,
  type TextStyleConfig,
} from './textStylePresets';

// ── Font Registry (spec 06_TEXT_TYPOGRAPHY §2) ───────────────────────
export {
  CURATED_FONTS,
  getFontById,
  getDefaultFont,
  resolveFontPreviewStyle,
  getFontsByCategory,
  type FontArchetype,
  type FontCategory,
} from './FontRegistry';
