/**
 * ColorTypes — canonical color data model for the ThryftVerse creator editor.
 *
 * Per spec 04_COLOR_SYSTEM_ZERO_GAP §1: structured RGBA is the canonical state.
 * Raw unvalidated strings should never be the internal source of truth.
 *
 * All channels are normalized to 0..1 floats in the sRGB color space.
 * Wide-gamut (Display-P3 / HDR) is deferred until editor, export, and viewer
 * all share a verified color-management path (spec §13).
 */

/**
 * The canonical color representation. All r/g/b/a channels are 0..1 floats
 * in the sRGB color space. Serialize deterministically to #RRGGBBAA when
 * a string is needed (see ColorMath.toHexString).
 */
export type CreatorColor = {
  space: 'srgb';
  /** Red channel, 0..1 */
  r: number;
  /** Green channel, 0..1 */
  g: number;
  /** Blue channel, 0..1 */
  b: number;
  /** Alpha channel, 0..1 (0 = fully transparent, 1 = fully opaque) */
  a: number;
};

/**
 * HSV (hue, saturation, value) representation used by the SV plane and
 * hue slider. Hue is 0..360, saturation and value are 0..1.
 */
export type HSV = {
  h: number;
  s: number;
  v: number;
};

/**
 * HSL (hue, saturation, lightness) representation. Hue is 0..360,
 * saturation and lightness are 0..1.
 */
export type HSL = {
  h: number;
  s: number;
  l: number;
};

/**
 * A single gradient stop. Position is 0..1 along the gradient axis.
 * Color is the canonical CreatorColor (includes alpha per stop).
 */
export type GradientStop = {
  id: string;
  position: number; // 0..1
  color: CreatorColor;
};

/**
 * Gradient definition for background fills and shape gradients.
 * Linear type is supported now; radial is a documented future extension.
 */
export type GradientDefinition = {
  type: 'linear'; // 'radial' reserved for future
  stops: GradientStop[];
  angle: number; // 0..360 degrees
};

/**
 * A recently committed color with a timestamp for ordering.
 * Persisted via AsyncStorage (see useCreatorColorHistory).
 */
export type RecentColor = {
  color: CreatorColor;
  committedAt: number; // Date.now()
};

/**
 * An entry in the project palette — a color currently used somewhere
 * in the composition document. Derived from the document, not persisted
 * independently.
 */
export type ProjectPaletteEntry = {
  color: CreatorColor;
  /** Human-readable label for where this color is used (e.g. "Text fill") */
  source: string;
};

/**
 * A color suggestion extracted from media (dominant color extraction).
 * Used by the MediaPalette and eyedropper alternative path.
 */
export type MediaPaletteEntry = {
  color: CreatorColor;
  /** Approximate population fraction (0..1) of this color in the image */
  weight: number;
};
