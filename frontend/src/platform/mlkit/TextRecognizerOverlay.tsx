/**
 * TextRecognizerOverlay — Skia-rendered camera overlay for recognized text.
 *
 * Draws bounding boxes around recognized text blocks on top of the camera
 * preview, with the recognized text rendered above each block. Uses
 * @shopify/react-native-skia for 60 FPS GPU rendering.
 *
 * Coordinate mapping:
 *   Text block corner points are normalized to 0..1 relative to the source
 *   frame. The overlay scales them to `cameraViewSize` pixels.
 *
 * @example
 * ```tsx
 * <TextRecognizerOverlay blocks={blocks} cameraViewSize={{ width, height }} />
 * ```
 */
import React, { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { Canvas, Rect, Text as SkiaText, useFont, Group } from '@shopify/react-native-skia';
import { useAppTheme } from '../../theme/ThemeContext';
import { Stroke } from '../../theme/designTokens';
import type { TextBlock } from './types';

// ── Props ──────────────────────────────────────────────────────────

export interface TextRecognizerOverlayProps {
  /** Recognized text blocks with normalized corner points (0..1). */
  blocks: TextBlock[];
  /** Camera view dimensions in pixels for scaling normalized coordinates. */
  cameraViewSize: { width: number; height: number };
}

// ── Helpers ────────────────────────────────────────────────────────

/** Computed bounding box from normalized corner points, scaled to view. */
interface ScaledTextBounds {
  left: number;
  top: number;
  width: number;
  height: number;
  text: string;
}

/** Truncate text for display above the bounding box. */
function truncate(text: string, maxLen: number): string {
  const trimmed = text.trim().replace(/\n/g, ' ');
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen)}\u2026`;
}

/**
 * Compute axis-aligned bounding boxes from text block corner points.
 * Corner points are normalized (0..1); the result is scaled to view pixels.
 */
function computeTextBounds(
  blocks: TextBlock[],
  viewW: number,
  viewH: number,
): ScaledTextBounds[] {
  return blocks
    .filter((b) => b.cornerPoints.length >= 2 && b.text.trim().length > 0)
    .map((b) => {
      const pts = b.cornerPoints;
      const xs = pts.map((p) => p.x * viewW);
      const ys = pts.map((p) => p.y * viewH);
      const left = Math.min(...xs);
      const top = Math.min(...ys);
      const right = Math.max(...xs);
      const bottom = Math.max(...ys);
      return {
        left,
        top,
        width: right - left,
        height: bottom - top,
        text: truncate(b.text, 40),
      };
    });
}

// ── Component ──────────────────────────────────────────────────────

export function TextRecognizerOverlay({
  blocks,
  cameraViewSize,
}: TextRecognizerOverlayProps): React.JSX.Element {
  const { colors } = useAppTheme();
  const font = useFont(null, 10);

  const bounds = useMemo(
    () => computeTextBounds(blocks, cameraViewSize.width, cameraViewSize.height),
    [blocks, cameraViewSize.width, cameraViewSize.height],
  );

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      {bounds.map((b, i) => (
        <Group key={`text-${i}-${b.text.slice(0, 12)}`}>
          {/* Bounding box outline */}
          <Rect
            x={b.left}
            y={b.top}
            width={b.width}
            height={b.height}
            style="stroke"
            color={colors.discovery}
            strokeWidth={Stroke.standard}
          />
          {/* Recognized text label above the bounding box */}
          {font && b.text.length > 0 && (
            <SkiaText
              x={b.left}
              y={Math.max(b.top - 3, 10)}
              font={font}
              text={b.text}
              color={colors.discovery}
            />
          )}
        </Group>
      ))}
    </Canvas>
  );
}
