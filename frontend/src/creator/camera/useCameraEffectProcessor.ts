/**
 * useCameraEffectProcessor — real-time GPU camera preview effects via Skia.
 *
 * Wires the selected CameraEffectId to a `SkiaCamera` `onFrame` callback that
 * applies the effect's ColorMatrix to every camera frame on the GPU.
 * This is the flagship real-time preview path — the user sees the effect
 * live on the viewfinder before capture, not just post-capture.
 *
 * Architecture (VisionCamera V5 + Skia):
 *   - `SkiaCamera` calls `onFrame(frame, render)` on every Frame
 *   - `render(({ canvas, frameTexture }) => ...)` draws the frame via Skia
 *   - The paint carries a ColorFilter.MakeMatrix built from the effect's matrix
 *   - When effect is 'none', the frame is drawn without a paint (zero overhead)
 *   - `frame.dispose()` frees the GPU buffer after rendering
 *
 * Performance:
 *   - The onFrame callback runs as a worklet on the Camera Thread — no
 *     thread-hop, no serialization. A 4K YUV frame is ~33MB; the GPU
 *     handles the color matrix in a single pass.
 *   - The paint is memoized via useMemo and only recreated when the
 *     effect changes, so the worklet closure captures a stable reference.
 *
 * Per AGENTS.md §11: truthful UI — the effect is applied in real-time,
 * not "coming soon". The post-capture path remains as a fallback for
 * devices where the Skia frame processor is unavailable.
 */
import { useCallback, useMemo } from 'react';
import { Skia } from '@shopify/react-native-skia';
import type { Frame } from 'react-native-vision-camera';
import type { SkiaOnFrameState } from 'react-native-vision-camera-skia';
import type { CameraEffectId } from './CameraEffectBar';
import { resolveColorMatrix } from '../../components/poster/filters/filterConfig';
import type { ImageFilter } from '../../components/poster/filters/filterConfig';

/** The onFrame callback type expected by SkiaCamera. */
export type SkiaOnFrameCallback = (
  frame: Frame,
  render: (onDraw: (state: SkiaOnFrameState) => void) => void,
) => void;

// ── Effect → ImageFilter mapping ────────────────────────────────────
// CameraEffectId uses a subset of the filter system's names. Map each
// camera effect to the corresponding ImageFilter for matrix resolution.
const EFFECT_TO_FILTER: Record<CameraEffectId, ImageFilter> = {
  none: 'normal',
  vintage: 'vintage',
  noir: 'noir',
  vivid: 'vivid',
  warm: 'warm',
  cool: 'cool',
  fade: 'fade',
};

// Identity matrix — no color change. Used when effect is 'none' to
// avoid any GPU work (the frame is drawn without a paint).
const IDENTITY_MATRIX = [
  1, 0, 0, 0, 0,
  0, 1, 0, 0, 0,
  0, 0, 1, 0, 0,
  0, 0, 0, 1, 0,
];

// ── Hook ────────────────────────────────────────────────────────────

/**
 * Creates an `onFrame` callback for `SkiaCamera` that applies the selected
 * camera effect to the live preview in real-time.
 *
 * @param effectId The currently selected camera effect.
 * @returns An `onFrame` callback to pass to `SkiaCamera`'s `onFrame` prop.
 */
export function useCameraEffectProcessor(effectId: CameraEffectId): SkiaOnFrameCallback {
  // Resolve the ColorMatrix for the selected effect at full intensity.
  // The matrix is memoized — it only changes when the effect changes.
  const colorMatrix = useMemo(() => {
    if (effectId === 'none') return IDENTITY_MATRIX;
    const filter = EFFECT_TO_FILTER[effectId] ?? 'normal';
    return resolveColorMatrix(filter, 1);
  }, [effectId]);

  // Create the Skia Paint with the ColorFilter. Memoized so the worklet
  // closure captures a stable reference — recreating the paint on every
  // render would cause the onFrame callback to be recreated.
  const paint = useMemo(() => {
    if (effectId === 'none') return null;
    const p = Skia.Paint();
    p.setColorFilter(Skia.ColorFilter.MakeMatrix(colorMatrix));
    return p;
  }, [effectId, colorMatrix]);

  // Build the onFrame callback. This is a worklet — it runs on the Camera
  // Thread. When effect is 'none', we draw without a paint (zero overhead).
  // When an effect is active, we draw through the color matrix paint.
  return useCallback<SkiaOnFrameCallback>(
    (frame, render) => {
      'worklet';
      if (paint) {
        render(({ canvas, frameTexture }) => {
          canvas.drawImage(frameTexture, 0, 0, paint);
        });
      } else {
        render(({ canvas, frameTexture }) => {
          canvas.drawImage(frameTexture, 0, 0);
        });
      }
      frame.dispose();
    },
    [paint],
  );
}
