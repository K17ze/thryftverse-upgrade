/**
 * cutoutSheetShared — types and constants for CreatorCutoutSheet.
 *
 * Extracted verbatim from CreatorCutoutSheet.tsx; consumed by the sheet
 * orchestrator and the extracted components/hooks under cutoutSheet/.
 */

export type Tool = 'scissors' | 'eraser';

export interface Point { x: number; y: number; }

// A committed stroke. Scissors strokes add to the trace; eraser strokes
// remove traced points near the stroke — the honest semantic for a
// trace-and-crop tool (the output is a bounding box, so "erase" refines
// the trace rather than masking pixels).
export type PathEntry = { points: Point[]; mode: 'keep' | 'erase' };

// Radius in display px around an erase stroke that removes traced points.
export const ERASE_RADIUS = 18;
