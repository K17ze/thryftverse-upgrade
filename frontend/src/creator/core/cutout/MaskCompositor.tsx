/**
 * MaskCompositor — Skia-based real-time mask preview and compositing.
 *
 * This module provides declarative Skia components that render the
 * cutout preview in real time: the source image is composited with an
 * alpha mask built from the user's brush strokes, so the user sees the
 * actual cutout result as they refine (Keep / Erase / Restore).
 *
 * The mask is built inline using the Skia `<Mask>` component:
 *   - A white `<Fill>` starts the mask fully opaque (everything kept).
 *   - Erase strokes use `blendMode="clear"` to punch transparency.
 *   - Keep strokes use `blendMode="srcOver"` with white to restore.
 *   Strokes are rendered in chronological order so later strokes win.
 *
 * The Skia Canvas is transparent by default, so a checkerboard rendered
 * behind it (by the caller) shows through the erased regions — giving an
 * honest WYSIWYG cutout preview without any fake "processing" state.
 *
 * No new native dependencies. Uses `@shopify/react-native-skia` only.
 */
import React, { useMemo } from 'react';
import {
  Canvas,
  Mask,
  Group,
  Fill,
  Path as SkiaPath,
  Image as SkiaImage,
  Skia,
  useImage,
  type SkPath,
  type SkImage,
} from '@shopify/react-native-skia';
import type { Point, MaskStroke } from './MaskRenderer';

// ── Path smoothing (Catmull-Rom → cubic Bézier) ─────────────────────
// Shared with MaskRenderer so the declarative preview and the offscreen
// rasterizer produce identical stroke geometry.

function smoothSkiaPath(points: Point[], tension = 0.5): SkPath {
  const path = Skia.Path.Make();
  if (points.length === 0) return path;
  if (points.length === 1) {
    path.moveTo(points[0].x, points[0].y);
    return path;
  }
  if (points.length === 2) {
    path.moveTo(points[0].x, points[0].y);
    path.lineTo(points[1].x, points[1].y);
    return path;
  }
  path.moveTo(points[0].x, points[0].y);
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const cp1x = p1.x + ((p2.x - p0.x) / 6) * tension;
    const cp1y = p1.y + ((p2.y - p0.y) / 6) * tension;
    const cp2x = p2.x - ((p3.x - p1.x) / 6) * tension;
    const cp2y = p2.y - ((p3.y - p1.y) / 6) * tension;
    path.cubicTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
  }
  return path;
}

/**
 * Build an SkPath from a list of points (Catmull-Rom smoothed).
 * Exposed for callers that need the path for overlay rendering.
 */
export function buildSkiaPath(points: Point[]): SkPath {
  return smoothSkiaPath(points);
}

// ── MaskedPreview ───────────────────────────────────────────────────

export interface MaskedPreviewProps {
  /** Source image URI (local file or asset). */
  imageUri: string;
  /** Preview width in px. */
  width: number;
  /** Preview height in px. */
  height: number;
  /** Committed brush strokes that define the mask, in chronological order. */
  strokes: MaskStroke[];
  /**
   * The live in-progress stroke points (not yet committed). Rendered as
   * a colored overlay so the user sees brush feedback at 60fps without
   * rebuilding the mask on every touch move.
   */
  livePoints: Point[];
  /** Brush mode for the live stroke: 'keep' | 'erase' | 'restore'. */
  liveMode: 'keep' | 'erase' | 'restore' | null;
  /** Brush diameter for the live stroke overlay. */
  brushSize: number;
  /** Whether to show the live stroke overlay. */
  showLiveOverlay: boolean;
}

/**
 * Render the source image masked by the committed brush strokes, with a
 * colored live-stroke overlay on top.
 *
 * Place a checkerboard View behind this component — the Skia Canvas is
 * transparent, so erased regions reveal the checkerboard underneath.
 */
export function MaskedPreview({
  imageUri,
  width,
  height,
  strokes,
  livePoints,
  liveMode,
  brushSize,
  showLiveOverlay,
}: MaskedPreviewProps) {
  // Load the source image as an SkImage via the Skia useImage hook.
  // useImage accepts a URI string and returns SkImage | null.
  const skImage = useImage(imageUri);

  // Precompute SkPaths for committed strokes (memoized on stroke count
  // and point counts so we don't rebuild paths every render).
  const strokePaths = useMemo(
    () =>
      strokes.map((s) => ({
        path: smoothSkiaPath(s.points),
        mode: s.mode,
        brushSize: s.brushSize,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [strokes],
  );

  const livePath = useMemo(
    () => (showLiveOverlay && livePoints.length > 0 ? smoothSkiaPath(livePoints) : null),
    [showLiveOverlay, livePoints],
  );

  // Live stroke overlay colour: green = keep/restore, red = erase.
  const liveColor = liveMode === 'erase' ? '#FF3B30' : '#34C759';

  if (width <= 0 || height <= 0) return null;

  return (
    <Canvas style={{ width, height }}>
      {/* Alpha mask: white = keep, transparent = erase.
          The Mask component renders its children through the mask's
          alpha channel, so erased regions become transparent and the
          caller's checkerboard shows through. */}
      <Mask
        mode="alpha"
        mask={
          <Group>
            {/* Start fully opaque (everything kept). */}
            <Fill color="white" />
            {/* Render strokes in chronological order. */}
            {strokePaths.map((s, i) =>
              s.mode === 'erase' ? (
                <SkiaPath
                  key={`s${i}`}
                  path={s.path}
                  start={0}
                  end={1}
                  style="stroke"
                  color="black"
                  blendMode="clear"
                  strokeWidth={s.brushSize}
                  strokeCap="round"
                  strokeJoin="round"
                />
              ) : (
                <SkiaPath
                  key={`s${i}`}
                  path={s.path}
                  start={0}
                  end={1}
                  style="stroke"
                  color="white"
                  blendMode="srcOver"
                  strokeWidth={s.brushSize}
                  strokeCap="round"
                  strokeJoin="round"
                />
              ),
            )}
          </Group>
        }
      >
        {/* The source image, revealed only where the mask is opaque. */}
        {skImage && (
          <SkiaImage
            image={skImage}
            x={0}
            y={0}
            width={width}
            height={height}
            fit="contain"
          />
        )}
      </Mask>

      {/* Live in-progress stroke overlay (coloured, semi-transparent).
          Rendered on top of the masked image for 60fps brush feedback
          without rebuilding the mask mid-stroke. */}
      {showLiveOverlay && livePath && liveMode && (
        <SkiaPath
          path={livePath}
          start={0}
          end={1}
          style="stroke"
          color={liveColor}
          strokeWidth={brushSize}
          strokeCap="round"
          strokeJoin="round"
          opacity={0.5}
        />
      )}
    </Canvas>
  );
}

// ── MaskedPreviewFromImage ──────────────────────────────────────────
// Variant that accepts a pre-loaded SkImage (for future canvas
// integration where the image is already in GPU memory).

export interface MaskedPreviewFromImageProps {
  image: SkImage | null;
  width: number;
  height: number;
  strokes: MaskStroke[];
}

/**
 * Render a pre-loaded SkImage masked by committed strokes (no live
 * overlay). Intended for the CreatorCanvas compositing phase where the
 * mask is finalised.
 */
export function MaskedPreviewFromImage({
  image,
  width,
  height,
  strokes,
}: MaskedPreviewFromImageProps) {
  const strokePaths = useMemo(
    () =>
      strokes.map((s) => ({
        path: smoothSkiaPath(s.points),
        mode: s.mode,
        brushSize: s.brushSize,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [strokes],
  );

  if (width <= 0 || height <= 0 || !image) return null;

  return (
    <Canvas style={{ width, height }}>
      <Mask
        mode="alpha"
        mask={
          <Group>
            <Fill color="white" />
            {strokePaths.map((s, i) =>
              s.mode === 'erase' ? (
                <SkiaPath
                  key={`s${i}`}
                  path={s.path}
                  start={0}
                  end={1}
                  style="stroke"
                  color="black"
                  blendMode="clear"
                  strokeWidth={s.brushSize}
                  strokeCap="round"
                  strokeJoin="round"
                />
              ) : (
                <SkiaPath
                  key={`s${i}`}
                  path={s.path}
                  start={0}
                  end={1}
                  style="stroke"
                  color="white"
                  blendMode="srcOver"
                  strokeWidth={s.brushSize}
                  strokeCap="round"
                  strokeJoin="round"
                />
              ),
            )}
          </Group>
        }
      >
        <SkiaImage image={image} x={0} y={0} width={width} height={height} fit="contain" />
      </Mask>
    </Canvas>
  );
}
