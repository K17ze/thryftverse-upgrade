/**
 * BarcodeScannerOverlay — Skia-rendered camera overlay for detected barcodes.
 *
 * Draws animated bounding boxes around detected barcodes on top of the camera
 * preview. Uses @shopify/react-native-skia for 60 FPS GPU rendering — no RN
 * Views, no bridge hops. Reanimated SharedValues drive the fade in/out
 * animation directly on the Skia render thread.
 *
 * Coordinate mapping:
 *   Barcode corner points are normalized to 0..1 relative to the source
 *   frame. The overlay scales them to `cameraViewSize` pixels. This is
 *   accurate when the camera preview fills the view at the same aspect
 *   ratio as the frame (the common full-screen case).
 *
 * @example
 * ```tsx
 * <BarcodeScannerOverlay barcodes={barcodes} cameraViewSize={{ width, height }} />
 * ```
 */
import React, { useEffect, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { Canvas, Rect, Text as SkiaText, useFont, Group } from '@shopify/react-native-skia';
import { useSharedValue, withTiming, Easing } from 'react-native-reanimated';
import { useAppTheme } from '../../theme/ThemeContext';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { Stroke } from '../../theme/designTokens';
import type { Barcode, Point } from './types';

// ── Props ──────────────────────────────────────────────────────────

export interface BarcodeScannerOverlayProps {
  /** Detected barcodes with normalized corner points (0..1). */
  barcodes: Barcode[];
  /** Camera view dimensions in pixels for scaling normalized coordinates. */
  cameraViewSize: { width: number; height: number };
}

// ── Helpers ────────────────────────────────────────────────────────

/** Computed bounding box from normalized corner points, scaled to view. */
interface ScaledBounds {
  left: number;
  top: number;
  width: number;
  height: number;
  text: string;
}

/**
 * Compute the axis-aligned bounding box from corner points.
 * Corner points are normalized (0..1); the result is scaled to view pixels.
 */
function computeBounds(barcodes: Barcode[], viewW: number, viewH: number): ScaledBounds[] {
  return barcodes
    .filter((b) => b.cornerPoints.length >= 2)
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
        text: b.value,
      };
    });
}

// ── Component ──────────────────────────────────────────────────────

export function BarcodeScannerOverlay({
  barcodes,
  cameraViewSize,
}: BarcodeScannerOverlayProps): React.JSX.Element {
  const { colors } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const font = useFont(null, 11);

  // Reanimated SharedValue for opacity — drives the Skia render thread
  // directly. Fades in when barcodes appear, fades out when lost.
  const opacity = useSharedValue(0);

  useEffect(() => {
    const target = barcodes.length > 0 ? 1 : 0;
    opacity.value = reducedMotion
      ? target
      : withTiming(target, {
          duration: 250,
          easing: Easing.out(Easing.ease),
        });
  }, [barcodes.length, opacity, reducedMotion]);

  const bounds = useMemo(
    () => computeBounds(barcodes, cameraViewSize.width, cameraViewSize.height),
    [barcodes, cameraViewSize.width, cameraViewSize.height],
  );

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      <Group opacity={opacity}>
        {bounds.map((b, i) => (
          <Group key={`barcode-${i}-${b.text}`}>
            {/* Bounding box outline */}
            <Rect
              x={b.left}
              y={b.top}
              width={b.width}
              height={b.height}
              style="stroke"
              color={colors.brand}
              strokeWidth={Stroke.emphasis}
            />
            {/* Barcode value label above the bounding box */}
            {font && b.text.length > 0 && (
              <SkiaText
                x={b.left}
                y={Math.max(b.top - 4, 12)}
                font={font}
                text={b.text}
                color={colors.brand}
              />
            )}
          </Group>
        ))}
      </Group>
    </Canvas>
  );
}
