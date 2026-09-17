// ── Shared layer-geometry constants + worklet math ────────────────
// Single source of truth for the numeric contracts shared by the layer
// renderer, the selection handles, and the alignment-guide overlay.
// Extracted from CreatorCanvas.tsx — values are unchanged.

export const RAD_TO_DEG = 180 / Math.PI;
export const KEYFRAME_SEEK_JUMP_MS = 120;

export const SNAP_THRESHOLD = 0.02;
export const SAFE_MARGIN = 0.05;
export const ROTATION_SNAP_DEG = 15;
export const SMART_GUIDE_THRESHOLD_PX = 4;
// Drag-to-trash: normalized y (0–1) past which the bottom trash zone activates.
export const TRASH_ZONE_THRESHOLD = 0.85;

export function normaliseDegrees(deg: number): number {
  'worklet';
  let result = deg % 360;
  if (result < 0) result += 360;
  return result;
}
