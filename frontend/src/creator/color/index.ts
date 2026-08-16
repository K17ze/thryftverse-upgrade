/**
 * Color module — barrel export for the ThryftVerse creator color system.
 *
 * Per spec 04_COLOR_SYSTEM_ZERO_GAP §14, this module provides the
 * shared professional color engine for all creator tools:
 * - Text fill/background/stroke/shadow
 * - Drawing pen/marker/highlighter/neon
 * - Shape fill/stroke
 * - Background solid/gradient
 * - Sticker themes
 *
 * Usage:
 *   import { CreatorColorPicker, useCreatorColorHistory, CreatorColor } from '../color';
 */

// ── Types ────────────────────────────────────────────────────────────
export type {
  CreatorColor,
  HSV,
  HSL,
  GradientStop,
  GradientDefinition,
  RecentColor,
  ProjectPaletteEntry,
  MediaPaletteEntry,
} from './ColorTypes';

// ── Math ─────────────────────────────────────────────────────────────
export {
  normalize,
  colorsEqual,
  rgbToHsv,
  hsvToRgb,
  rgbToHsl,
  hslToRgb,
  lerpColor,
  withAlpha,
  toHexString,
  toHexRGB,
  fromHexString,
  relativeLuminance,
  contrastRatio,
  meetsWCAGAA,
  meetsWCAGAAA,
  rgb255,
  rgba,
  toRgbaString,
  TRANSPARENT,
  BLACK,
  WHITE,
} from './ColorMath';

// ── Parser ───────────────────────────────────────────────────────────
export {
  isValidHex,
  sanitizeHexInput,
  normalizeHexString,
  parseHexToColor,
  colorToHex,
  colorToHexDisplay,
} from './ColorParser';

// ── Hooks ────────────────────────────────────────────────────────────
export { useCreatorColorHistory } from './useCreatorColorHistory';

// ── Media palette ────────────────────────────────────────────────────
export { extractMediaPalette, fallbackPalette } from './MediaPalette';

// ── UI components ────────────────────────────────────────────────────
export { CreatorColorPicker } from './CreatorColorPicker';
export type { CreatorColorPickerProps } from './CreatorColorPicker';
export { SVPlane } from './SVPlane';
export { HueSlider } from './HueSlider';
export { AlphaSlider } from './AlphaSlider';
export { HexColorField } from './HexColorField';
export { NumericColorFields } from './NumericColorFields';
export { Eyedropper } from './Eyedropper';
export { RecentColors } from './RecentColors';
export { ProjectPalette } from './ProjectPalette';
export { GradientEditor } from './GradientEditor';
