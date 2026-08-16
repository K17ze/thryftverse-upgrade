/**
 * DrawingTypes — shared type definitions for the drawing workspace.
 *
 * Per spec 07_MEDIA_TOOLCHAIN: freehand strokes with brush types
 * (pen, marker, highlighter, neon, eraser). Points are normalized 0–1
 * relative to the drawing canvas bounds, so a drawing can be rendered
 * at any resolution.
 */

export type BrushType = 'pen' | 'marker' | 'highlighter' | 'neon' | 'eraser';

export interface Stroke {
  id: string;
  brushType: BrushType;
  color: string;
  size: number;
  points: { x: number; y: number }[];
}

export interface DrawingDocument {
  strokes: Stroke[];
  width: number;
  height: number;
}
