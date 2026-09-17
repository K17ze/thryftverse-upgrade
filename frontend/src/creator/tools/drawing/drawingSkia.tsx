/**
 * drawingSkia — Skia availability guard and GPU stroke renderers for the
 * drawing workspace.
 *
 * Extracted from DrawingWorkspace.tsx (pure extraction, zero behavior change):
 *   - `skiaAvailable` module flag + retry probe
 *   - Catmull-Rom spline → Skia path smoothing
 *   - `StrokePath` memoized per-brush Skia renderer
 */
import React from 'react';
import {
  Group,
  Path as SkiaPath,
  Paint as SkiaPaint,
  Skia,
} from '@shopify/react-native-skia';
import type { DerivedValue } from 'react-native-reanimated';
import type { Stroke } from './DrawingTypes';

// ─────────────────────────────────────────────────────────────────────────────
// Skia availability guard
// ─────────────────────────────────────────────────────────────────────────────
export let skiaAvailable = false;

/** Probes the Skia native module and refreshes `skiaAvailable`. */
export function probeSkiaAvailability(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const SkiaModule = require('@shopify/react-native-skia');
    skiaAvailable = !!(SkiaModule && SkiaModule.Canvas && SkiaModule.Skia);
  } catch {
    skiaAvailable = false;
  }
  return skiaAvailable;
}

probeSkiaAvailability();

// ─────────────────────────────────────────────────────────────────────────────
// Catmull-Rom spline → Skia Path (GPU-smoothed strokes)
// ─────────────────────────────────────────────────────────────────────────────
export type SkPath = ReturnType<typeof Skia.Path.Make>;

/**
 * Catmull-Rom spline → Skia path. Carries the 'worklet' directive so the
 * live-stroke pipeline can run it inside a useDerivedValue on the UI thread
 * (Skia.Path.Make is a JSI host function — safe in worklets). Still callable
 * from JS unchanged.
 */
export function smoothPathToSkia(points: { x: number; y: number }[], tension = 0.5): SkPath | null {
  'worklet';
  if (!skiaAvailable || points.length === 0) return null;
  const path = Skia.Path.Make();
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

// ─────────────────────────────────────────────────────────────────────────────
// Single-stroke Skia renderer (memoized)
// ─────────────────────────────────────────────────────────────────────────────
interface StrokePathProps {
  stroke: Stroke;
  keyPrefix: string;
}

export const StrokePath = React.memo(function StrokePath({ stroke, keyPrefix }: StrokePathProps) {
  if (!skiaAvailable) return null;

  const userOpacity = stroke.opacity ?? 1;

  if (stroke.brushType === 'eraser') {
    const path = smoothPathToSkia(stroke.points);
    if (!path) return null;
    return (
      <SkiaPath
        key={`${keyPrefix}_${stroke.id}`}
        path={path}
        style="stroke"
        strokeCap="round"
        strokeJoin="round"
        strokeWidth={stroke.size * 2}
      >
        <SkiaPaint color="#000000" blendMode="dstOut" opacity={1} />
      </SkiaPath>
    );
  }

  // Emoji brush: stamps render in the RN-Text overlay above the canvas
  // (shared deterministic layout — preview/replay/export identical, and
  // no Skia emoji-font dependency that returns null on Android).
  if (stroke.brushType === 'emoji') {
    return null;
  }

  const path = smoothPathToSkia(stroke.points);
  if (!path) return null;

  if (stroke.brushType === 'highlighter') {
    return (
      <SkiaPath
        key={`${keyPrefix}_${stroke.id}`}
        path={path}
        style="stroke"
        strokeCap="butt"
        strokeJoin="round"
        strokeWidth={stroke.size * 1.8}
      >
        <SkiaPaint color={stroke.color} blendMode="multiply" opacity={0.3 * userOpacity} />
      </SkiaPath>
    );
  }

  if (stroke.brushType === 'neon') {
    return (
      <Group key={`${keyPrefix}_${stroke.id}`} blendMode="plus">
        <SkiaPath path={path} style="stroke" strokeCap="round" strokeJoin="round" strokeWidth={stroke.size * 3}>
          <SkiaPaint color={stroke.color} blendMode="plus" opacity={0.15 * userOpacity} />
        </SkiaPath>
        <SkiaPath path={path} style="stroke" strokeCap="round" strokeJoin="round" strokeWidth={stroke.size * 2}>
          <SkiaPaint color={stroke.color} blendMode="plus" opacity={0.3 * userOpacity} />
        </SkiaPath>
        <SkiaPath path={path} style="stroke" strokeCap="round" strokeJoin="round" strokeWidth={stroke.size}>
          <SkiaPaint color={stroke.color} blendMode="srcOver" opacity={1 * userOpacity} />
        </SkiaPath>
      </Group>
    );
  }

  if (stroke.brushType === 'marker') {
    return (
      <SkiaPath
        key={`${keyPrefix}_${stroke.id}`}
        path={path}
        style="stroke"
        strokeCap="round"
        strokeJoin="round"
        strokeWidth={stroke.size * 1.25}
      >
        <SkiaPaint color={stroke.color} blendMode="srcOver" opacity={0.6 * userOpacity} />
      </SkiaPath>
    );
  }

  // pen — solid, full opacity
  return (
    <SkiaPath
      key={`${keyPrefix}_${stroke.id}`}
      path={path}
      style="stroke"
      strokeCap="round"
      strokeJoin="round"
      strokeWidth={stroke.size}
    >
      <SkiaPaint color={stroke.color} blendMode="srcOver" opacity={userOpacity} />
    </SkiaPath>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Live stroke — UI-thread derived path, zero React re-renders mid-stroke
// ─────────────────────────────────────────────────────────────────────────────
interface LiveStrokePathProps {
  /** Fixed brush meta for the in-progress stroke (set once at gesture begin). */
  meta: Stroke;
  /** Derived Skia path rebuilt on the UI thread as points accumulate. */
  path: DerivedValue<SkPath>;
}

/**
 * Renders the in-progress stroke from a UI-thread derived path — mirrors
 * StrokePath's per-brush paint structure exactly so live preview and the
 * committed stroke are pixel-identical. Emoji strokes return null (stamps
 * render through the RN-Text overlay driven by JS state).
 */
export function LiveStrokePath({ meta, path }: LiveStrokePathProps) {
  if (!skiaAvailable) return null;

  const userOpacity = meta.opacity ?? 1;

  if (meta.brushType === 'eraser') {
    return (
      <SkiaPath
        path={path}
        style="stroke"
        strokeCap="round"
        strokeJoin="round"
        strokeWidth={meta.size * 2}
      >
        <SkiaPaint color="#000000" blendMode="dstOut" opacity={1} />
      </SkiaPath>
    );
  }

  if (meta.brushType === 'emoji') {
    return null;
  }

  if (meta.brushType === 'highlighter') {
    return (
      <SkiaPath
        path={path}
        style="stroke"
        strokeCap="butt"
        strokeJoin="round"
        strokeWidth={meta.size * 1.8}
      >
        <SkiaPaint color={meta.color} blendMode="multiply" opacity={0.3 * userOpacity} />
      </SkiaPath>
    );
  }

  if (meta.brushType === 'neon') {
    return (
      <Group blendMode="plus">
        <SkiaPath path={path} style="stroke" strokeCap="round" strokeJoin="round" strokeWidth={meta.size * 3}>
          <SkiaPaint color={meta.color} blendMode="plus" opacity={0.15 * userOpacity} />
        </SkiaPath>
        <SkiaPath path={path} style="stroke" strokeCap="round" strokeJoin="round" strokeWidth={meta.size * 2}>
          <SkiaPaint color={meta.color} blendMode="plus" opacity={0.3 * userOpacity} />
        </SkiaPath>
        <SkiaPath path={path} style="stroke" strokeCap="round" strokeJoin="round" strokeWidth={meta.size}>
          <SkiaPaint color={meta.color} blendMode="srcOver" opacity={1 * userOpacity} />
        </SkiaPath>
      </Group>
    );
  }

  if (meta.brushType === 'marker') {
    return (
      <SkiaPath
        path={path}
        style="stroke"
        strokeCap="round"
        strokeJoin="round"
        strokeWidth={meta.size * 1.25}
      >
        <SkiaPaint color={meta.color} blendMode="srcOver" opacity={0.6 * userOpacity} />
      </SkiaPath>
    );
  }

  // pen — solid, full opacity
  return (
    <SkiaPath
      path={path}
      style="stroke"
      strokeCap="round"
      strokeJoin="round"
      strokeWidth={meta.size}
    >
      <SkiaPaint color={meta.color} blendMode="srcOver" opacity={userOpacity} />
    </SkiaPath>
  );
}
