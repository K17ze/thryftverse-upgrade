import { useCallback, useMemo } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import { useSharedValue, runOnJS, type SharedValue } from 'react-native-reanimated';

// ───────────────────────────────────────────────────────────────────────────
// useTimelineZoom — owns the poster timeline's pinch-to-zoom factor.
//
// The zoom factor is a Reanimated SharedValue so the pinch updates it on the
// UI thread for 1:1 tracking (no React re-render per frame). A committed
// copy is pushed to the caller via `onCommit` on gesture end (and on each
// imperative step) so the parent can re-layout the scroll content width and
// persist the zoom across sessions.
//
// Range: 1.0 (fit whole story) → 30.0 (a single clip fills the track for
// frame-accurate trimming), matching the flagship editors (VN, CapCut).
// ───────────────────────────────────────────────────────────────────────────

export const TIMELINE_ZOOM_MIN = 1.0;
export const TIMELINE_ZOOM_MAX = 30.0;

export interface UseTimelineZoomOptions {
  /** Initial zoom factor (defaults to 1.0 = fit). */
  initialZoom?: number;
  /** Minimum zoom (defaults to 1.0). */
  minZoom?: number;
  /** Maximum zoom (defaults to 30.0). */
  maxZoom?: number;
  /** Fired with the committed zoom factor on gesture end / imperative step. */
  onCommit?: (zoom: number) => void;
  /** Fired when a pinch begins (e.g. to reveal a zoom indicator overlay). */
  onPinchStart?: () => void;
  /** Fired when a pinch ends (e.g. to fade a zoom indicator overlay). */
  onPinchEnd?: () => void;
}

export interface UseTimelineZoomResult {
  /** Live zoom factor (UI thread). 1.0 = fit, up to `maxZoom`. */
  zoomSV: SharedValue<number>;
  /** Pinch gesture config — attach to the timeline scroll container. */
  pinchGesture: ReturnType<typeof Gesture.Pinch>;
  /** Step the zoom up by 2x (clamped to `maxZoom`). */
  zoomIn: () => void;
  /** Step the zoom down by 1/2x (clamped to `minZoom`). */
  zoomOut: () => void;
  /** Reset the zoom to `minZoom` (1.0 = fit). */
  resetZoom: () => void;
}

const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));

/**
 * Owns the timeline zoom SharedValue + pinch gesture and exposes imperative
 * zoom-in / zoom-out / reset helpers. The SharedValue survives re-renders, so
 * the zoom factor persists for the life of the component without React state.
 */
export function useTimelineZoom(
  options: UseTimelineZoomOptions = {},
): UseTimelineZoomResult {
  const {
    initialZoom = TIMELINE_ZOOM_MIN,
    minZoom = TIMELINE_ZOOM_MIN,
    maxZoom = TIMELINE_ZOOM_MAX,
    onCommit,
    onPinchStart,
    onPinchEnd,
  } = options;

  const zoomSV = useSharedValue(initialZoom);
  // Captures the zoom factor at pinch start so the change is relative to the
  // factor at gesture begin (not the last intermediate frame).
  const pinchBaseSV = useSharedValue(initialZoom);

  const pinchGesture = useMemo(
    () =>
      Gesture.Pinch()
        .onBegin(() => {
          'worklet';
          pinchBaseSV.value = zoomSV.value;
          if (onPinchStart) runOnJS(onPinchStart)();
        })
        .onChange((e) => {
          'worklet';
          zoomSV.value = Math.max(
            minZoom,
            Math.min(maxZoom, pinchBaseSV.value * e.scale),
          );
        })
        .onEnd(() => {
          'worklet';
          const committed = zoomSV.value;
          if (onCommit) runOnJS(onCommit)(committed);
          if (onPinchEnd) runOnJS(onPinchEnd)();
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onCommit, onPinchStart, onPinchEnd, minZoom, maxZoom],
  );

  const zoomIn = useCallback(() => {
    const next = clamp(zoomSV.value * 2, minZoom, maxZoom);
    zoomSV.value = next;
    onCommit?.(next);
  }, [zoomSV, onCommit, minZoom, maxZoom]);

  const zoomOut = useCallback(() => {
    const next = clamp(zoomSV.value / 2, minZoom, maxZoom);
    zoomSV.value = next;
    onCommit?.(next);
  }, [zoomSV, onCommit, minZoom, maxZoom]);

  const resetZoom = useCallback(() => {
    zoomSV.value = minZoom;
    onCommit?.(minZoom);
  }, [zoomSV, onCommit, minZoom]);

  return { zoomSV, pinchGesture, zoomIn, zoomOut, resetZoom };
}
