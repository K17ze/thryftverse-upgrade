/**
 * DrawingTypes — shared type definitions for the drawing workspace.
 *
 * Per spec 07_MEDIA_TOOLCHAIN: freehand strokes with brush types
 * (pen, marker, highlighter, neon, eraser, emoji). Points are normalized
 * 0–1 relative to the drawing canvas bounds, so a drawing can be rendered
 * at any resolution.
 */

export type BrushType = 'pen' | 'marker' | 'highlighter' | 'neon' | 'eraser' | 'emoji';

/**
 * Emoji brush configuration. Each stamp is an emoji glyph rendered as text
 * on the Skia canvas at the configured size, spaced `spacing` px apart
 * along the drag path (Snapchat emoji-brush parity).
 */
export interface EmojiBrushConfig {
  /** The emoji character to stamp (e.g. "🔥"). */
  emoji: string;
  /** Render size of each emoji stamp in px. */
  size: number;
  /** Distance between consecutive stamps in px. */
  spacing: number;
  /**
   * Rotation variation per stamp in degrees. 0 = fixed upright;
   * >0 = random rotation within ±rotation degrees.
   */
  rotation: number;
  /** Random position offset 0–1 as a fraction of stamp size. */
  jitter: number;
}

export interface Stroke {
  id: string;
  brushType: BrushType;
  color: string;
  size: number;
  /** User-controlled opacity 0–1 (multiplied with brush-specific opacity). */
  opacity?: number;
  points: { x: number; y: number }[];
  /** Emoji brush config — present only when brushType === 'emoji'. */
  emojiConfig?: EmojiBrushConfig;
}

export interface DrawingDocument {
  strokes: Stroke[];
  width: number;
  height: number;
}
