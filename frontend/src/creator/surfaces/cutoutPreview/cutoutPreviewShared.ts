/**
 * cutoutPreviewShared — constants and types for CutoutPreviewSheet.
 *
 * Extracted verbatim from CutoutPreviewSheet.tsx; consumed by the sheet
 * orchestrator and the extracted components under cutoutPreview/.
 */
import { Ionicons } from '@expo/vector-icons';

// ── Brush colours ──────────────────────────────────────────────────
// Green = keep (add to mask), red = erase (remove from mask).
export const BRUSH_RADIUS = 18;

// ── Brush mode ids ─────────────────────────────────────────────────
export type BrushMode = 'keep-person' | 'keep-object' | 'erase';
export type ModeId = BrushMode | 'restore';

// ── Checkerboard pattern for transparency preview ──────────────────
// A 2-tone checkerboard so the user can see transparent regions in the
// cutout result. Rendered as a repeating grid of squares.
export const CHECKER_SIZE = 16;

export type ModeButton = { id: ModeId; label: string; icon: keyof typeof Ionicons.glyphMap };
