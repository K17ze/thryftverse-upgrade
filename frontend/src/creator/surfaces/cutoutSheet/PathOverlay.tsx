/**
 * PathOverlay — renders a traced path as a semi-transparent fill for
 * CreatorCutoutSheet. Skia path when available — a single GPU stroke
 * instead of one View per point. Extracted verbatim from
 * CreatorCutoutSheet.tsx.
 */
import React, { useMemo } from 'react';
import { View } from 'react-native';
import { Path as SkiaPath } from '@shopify/react-native-skia';
import { Radius } from '../../../theme/designTokens';
import { skiaAvailable, smoothPathToSkia } from '../../tools/drawing/drawingSkia';
import type { Point } from './cutoutSheetShared';

// ── Path overlay component (renders traced path as semi-transparent fill) ──
export function PathOverlay({ path, color, opacity }: { path: Point[]; color: string; opacity: number }) {
  // Skia path when available — a single GPU stroke instead of one View per
  // point (a 200-pt trace previously mounted 200 overlapping Views).
  const skPath = useMemo(
    () => (skiaAvailable ? smoothPathToSkia(path) : null),
    [path],
  );
  if (skPath) {
    return (
      <SkiaPath
        path={skPath}
        style="stroke"
        strokeCap="round"
        strokeJoin="round"
        strokeWidth={40}
        color={color}
        opacity={opacity}
      />
    );
  }
  if (!skiaAvailable && path.length >= 2) {
    return (
      <>
        {path.map((p, i) => (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: p.x - 20,
              top: p.y - 20,
              width: 40,
              height: 40,
              borderRadius: Radius.xxl,
              backgroundColor: color,
              opacity }}
          />
        ))}
      </>
    );
  }
  return null;
}
