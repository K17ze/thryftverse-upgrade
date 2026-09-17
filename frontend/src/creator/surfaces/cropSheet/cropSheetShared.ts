/**
 * cropSheetShared — constants, types and pure math for CreatorCropSheet.
 *
 * Extracted verbatim from CreatorCropSheet.tsx; consumed by the sheet
 * orchestrator and the extracted components/hooks under cropSheet/.
 */

/** Destination surface for safe-zone preview (see SAFE_ZONES). */
export type CropDestination = 'story' | 'reels' | 'feed' | 'marketplace';

// ── Aspect ratio presets (Instagram/Snapchat-grade) ────────────────
export const ASPECT_PRESETS = [
  { label: 'Original', ratio: null as number | null },
  { label: '1:1', ratio: 1 },
  { label: '4:5', ratio: 4 / 5 },
  { label: '3:4', ratio: 3 / 4 },
  { label: '9:16', ratio: 9 / 16 },
  { label: '16:9', ratio: 16 / 9 },
];

// ── Straighten math ─────────────────────────────────────────────────
// Largest axis-aligned rectangle of aspect `a` (w/h) inscribed in a W×H
// rectangle rotated by θ. A centered candidate with half-height y (half-width
// a·y) stays inside the rotated source iff its corners clear both edge pairs,
// which gives y ≤ W / (2·(a·cosθ + sinθ)) and y ≤ H / (2·(a·sinθ + cosθ)).
// sin uses |·| — the geometry mirrors for negative angles.
export function largestInscribedRect(
  srcW: number,
  srcH: number,
  aspect: number,
  thetaRad: number ): { width: number; height: number } {
  const cos = Math.cos(thetaRad);
  const sin = Math.abs(Math.sin(thetaRad));
  const height = Math.min(srcW / (aspect * cos + sin), srcH / (aspect * sin + cos));
  return { width: aspect * height, height };
}

// ── Focal re-normalization ──────────────────────────────────────────
// Rotates a normalized point for a clockwise 90°k image rotation (y-down
// coordinates — same convention as expo's rotate and the preview transform).
export function rotatePoint90(
  p: { x: number; y: number },
  quarterTurns: number ): { x: number; y: number } {
  switch ((quarterTurns % 4 + 4) % 4) {
    case 1: return { x: 1 - p.y, y: p.x };
    case 2: return { x: 1 - p.x, y: 1 - p.y };
    case 3: return { x: p.y, y: 1 - p.x };
    default: return p;
  }
}

// Maps the stored focal point through the exact confirm pipeline (flip →
// straighten-rotate → crop → rotate 90°k) so it stays on-target relative to
// the OUTPUT image. `crop` is the rect actually applied in the canvas the
// crop runs in (user rect in source space, or the centered inscribed rect in
// the rotated canvas); `rotatedW/H` are the straightened canvas dimensions
// (0 when straighten is inactive). Clamped to [0,1] — a focal outside the
// cropped region lands on the output edge.
export function mapFocalToOutput(
  focal: { x: number; y: number },
  srcW: number,
  srcH: number,
  flippedH: boolean,
  flippedV: boolean,
  straightenDeg: number,
  crop: { originX: number; originY: number; width: number; height: number },
  rotatedW: number,
  rotatedH: number,
  rotation: number ): { x: number; y: number } {
  let fx = flippedH ? 1 - focal.x : focal.x;
  let fy = flippedV ? 1 - focal.y : focal.y;
  if (straightenDeg !== 0) {
    // Signed sinθ — the feature position follows the actual rotation.
    const theta = (straightenDeg * Math.PI) / 180;
    const sin = Math.sin(theta);
    const cos = Math.cos(theta);
    const u = fx * srcW - srcW / 2;
    const v = fy * srcH - srcH / 2;
    fx = (u * cos - v * sin + rotatedW / 2 - crop.originX) / crop.width;
    fy = (u * sin + v * cos + rotatedH / 2 - crop.originY) / crop.height;
  } else {
    fx = (fx * srcW - crop.originX) / crop.width;
    fy = (fy * srcH - crop.originY) / crop.height;
  }
  const turned = rotatePoint90({ x: fx, y: fy }, Math.round(rotation / 90));
  return {
    x: Math.min(1, Math.max(0, turned.x)),
    y: Math.min(1, Math.max(0, turned.y)) };
}

/** One undoable crop-sheet edit state (see the undo history block). */
export interface CropEditSnapshot {
  cropRect: { x: number; y: number; width: number; height: number };
  rotation: number;
  flippedH: boolean;
  flippedV: boolean;
  straighten: number;
  selectedRatio: number | null;
  imageZoom: number;
  imagePanX: number;
  imagePanY: number;
}

// ── Safe-zone definitions ───────────────────────────────────────────
// Each destination has platform UI that obscures portions of the media.
// Values are fractions of the crop frame (0–1) from the top/left.
// These are the documented platform chrome regions, not arbitrary
// decorative overlays.
export const SAFE_ZONES: Record<CropDestination, {
  // Each region is a top/bottom/left/right band (fraction of frame).
  // `top` covers from 0 to `top`; `bottom` covers from `bottom` to 1; etc.
  bands: { top?: number; bottom?: number; left?: number; right?: number };
  label: string;
}> = {
  // Story: header (avatar + timestamp) ~12%, reply bar ~10%.
  story: { bands: { top: 0.12, bottom: 0.78 }, label: 'Story' },
  // Reels: header ~10%, caption + audio + actions ~22%.
  reels: { bands: { top: 0.10, bottom: 0.78 }, label: 'Reels' },
  // Feed: minimal header ~8%, caption ~12%.
  feed: { bands: { top: 0.08, bottom: 0.88 }, label: 'Feed' },
  // Marketplace: title/price bar ~15%, no bottom chrome.
  marketplace: { bands: { top: 0.15 }, label: 'Marketplace' },
};
