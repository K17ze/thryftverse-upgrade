/**
 * Shared constants and props for the CreatorGlyph renderers.
 *
 * All glyphs share one optical system: 24×24 viewBox, 1.9 stroke width,
 * round caps and joins. See CreatorGlyph.tsx for the full spec.
 */
export const STROKE_WIDTH = 1.9;
export const STROKE_LINECAP = 'round';
export const STROKE_LINEJOIN = 'round';

export interface GlyphRenderProps {
  selected: boolean;
}
