/**
 * posterGestures — pure gesture factories for the Poster composer.
 *
 * Extracted from PosterComposerScreen (pure extraction — no behavioral
 * change). Each factory builds a RNGH gesture whose worklets run on the
 * UI thread; the parent still owns the shared values and wraps each call
 * in `useMemo` with the original dependency array.
 */
import { Gesture, type PanGesture, type PinchGesture } from 'react-native-gesture-handler';
import { runOnJS, type SharedValue } from 'react-native-reanimated';

// ── Timeline pinch-to-zoom (CapCut parity) ───────────────────────────

export interface PosterTimelinePinchGestureInput {
  /** Scale captured at pinch begin (UI thread). */
  pinchBaseScaleSV: SharedValue<number>;
  /** Live preview scale during the pinch (UI thread). */
  timelineScaleSV: SharedValue<number>;
  /** Shows the zoom indicator (JS thread). */
  showZoomIndicator: () => void;
  /** Fades the zoom indicator after commit (JS thread). */
  fadeZoomIndicator: () => void;
  /** Commits the pinch scale to React state on gesture end. */
  setTimelineZoomScale: (scale: number) => void;
}

/**
 * Pinch activates instantly by default (two fingers down → gesture
 * begins) and coexists with the ScrollView's one-finger horizontal pan —
 * pinch is a distinct two-finger gesture so the two never compete.
 */
export function buildTimelinePinchGesture({
  pinchBaseScaleSV,
  timelineScaleSV,
  showZoomIndicator,
  fadeZoomIndicator,
  setTimelineZoomScale,
}: PosterTimelinePinchGestureInput): PinchGesture {
  return Gesture.Pinch()
    .onBegin(() => {
      'worklet';
      pinchBaseScaleSV.value = timelineScaleSV.value;
      runOnJS(showZoomIndicator)();
    })
    .onChange((e) => {
      'worklet';
      const next = pinchBaseScaleSV.value * e.scale;
      timelineScaleSV.value = Math.max(0.5, Math.min(4, next));
    })
    .onEnd(() => {
      'worklet';
      runOnJS(setTimelineZoomScale)(timelineScaleSV.value);
      runOnJS(fadeZoomIndicator)();
    });
}

// ── Frame swipe / swipe-to-filter ────────────────────────────────────

export interface PosterFrameSwipeGestureInput {
  /** Gesture start X (UI thread). */
  frameSwipeStartXSV: SharedValue<number>;
  /** Gesture start Y (UI thread). */
  frameSwipeStartYSV: SharedValue<number>;
  /** Directional lock (UI thread): null until the gesture commits. */
  frameSwipeLockedDirSV: SharedValue<'horizontal' | 'vertical' | null>;
  /** Viewport width — the swipe threshold is 18% of it. */
  screenWidth: number;
  /** Multi-frame → swipe navigates frames; single → swipe cycles filters. */
  hasMultipleFrames: boolean;
  activePageIndex: number;
  /** Canonical page-change handler (JS thread). */
  goToPage: (index: number) => void;
  /** Cycles live photo filters (JS thread). */
  cycleFilter: (direction: 'next' | 'prev') => void;
}

export function buildFrameSwipeGesture({
  frameSwipeStartXSV,
  frameSwipeStartYSV,
  frameSwipeLockedDirSV,
  screenWidth,
  hasMultipleFrames,
  activePageIndex,
  goToPage,
  cycleFilter,
}: PosterFrameSwipeGestureInput): PanGesture {
  const DIRECTION_LOCK_THRESHOLD = 10;
  return Gesture.Pan()
    .onBegin((e) => {
      'worklet';
      frameSwipeStartXSV.value = e.x;
      frameSwipeStartYSV.value = e.y;
      frameSwipeLockedDirSV.value = null;
    })
    .onUpdate((e) => {
      'worklet';
      // Directional lock: once the gesture commits to horizontal or
      // vertical, stay locked. This prevents diagonal jitter from
      // triggering frame swipe when the user is trying to interact
      // with a layer (which starts inside the selected object's bounds
      // and is handled by the canvas gesture, not this one).
      if (frameSwipeLockedDirSV.value === null) {
        const dx = Math.abs(e.absoluteX - frameSwipeStartXSV.value);
        const dy = Math.abs(e.absoluteY - frameSwipeStartYSV.value);
        if (dx > DIRECTION_LOCK_THRESHOLD || dy > DIRECTION_LOCK_THRESHOLD) {
          frameSwipeLockedDirSV.value = dx > dy ? 'horizontal' : 'vertical';
        }
      }
    })
    .onEnd((e) => {
      'worklet';
      // Only trigger frame swipe for horizontal-dominant gestures.
      // Vertical gestures (scroll, layer drag) are ignored.
      if (frameSwipeLockedDirSV.value !== 'horizontal') return;
      const dx = e.x - frameSwipeStartXSV.value;
      const threshold = screenWidth * 0.18;
      if (Math.abs(dx) < threshold) return;
      if (hasMultipleFrames) {
        if (dx < 0) {
          // Swipe left ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ next frame
          runOnJS(goToPage)(activePageIndex + 1);
        } else {
          // Swipe right ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ prev frame
          runOnJS(goToPage)(activePageIndex - 1);
        }
      } else {
        // Single-frame story/poster: swipe-to-filter (Instagram/Snapchat flagship pattern)
        runOnJS(cycleFilter)(dx < 0 ? 'next' : 'prev');
      }
    });
}
