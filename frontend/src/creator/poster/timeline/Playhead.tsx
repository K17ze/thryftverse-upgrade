import React, { useCallback, useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  runOnJS,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useAppTheme } from '../../../theme/ThemeContext';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import { useHaptic } from '../../../hooks/useHaptic';

// ───────────────────────────────────────────────────────────────────────────
// Playhead — vertical scrub line overlaid on the timeline track.
//
// A 2pt brand-colored vertical line spans the track height. A 24pt draggable
// handle sits at the top. Dragging the handle (or the line) updates onSeek
// continuously, clamped to [0, totalDurationMs].
//
// The playhead position is driven by a Reanimated shared value so the line
// and handle move on the UI thread — no React re-render per frame during
// playback. The shared value is synced from the `positionMs` prop (which
// comes from the PlaybackClock) via a useEffect that updates it on every
// clock emission. Under reduced motion we skip animated transitions.
// ───────────────────────────────────────────────────────────────────────────

export interface PlayheadProps {
  /** Current playhead position in ms (from the PlaybackClock). */
  positionMs: number;
  /** Total timeline duration in ms. */
  totalDurationMs: number;
  /** Measured track width in pixels. */
  trackWidth: number;
  /** Called when the user drags the playhead. Wired to playbackClock.seek(ms). */
  onSeek: (ms: number) => void;
}

const HANDLE_SIZE = 24;
const LINE_WIDTH = 2;

export const Playhead = React.memo(function Playhead({
  positionMs,
  totalDurationMs,
  trackWidth,
  onSeek,
}: PlayheadProps) {
  const { colors } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const haptic = useHaptic();
  const widthSV = useSharedValue(trackWidth);

  // ── UI-thread playhead position (pixels) ───────────────────────────
  // The shared value stores the pixel position of the playhead. It is
  // updated from the positionMs prop (driven by the PlaybackClock) and
  // rendered via animated styles on the UI thread — no React re-render
  // per frame during playback.
  const lineLeftSV = useSharedValue(0);
  const handleLeftSV = useSharedValue(0);

  // Sync the shared values whenever positionMs, totalDurationMs, or
  // trackWidth changes. During playback the clock emits at ~60fps; each
  // emission updates positionMs, which flows into this effect and sets
  // the shared value. The animated styles read the shared value on the
  // UI thread, so the playhead moves smoothly without React re-renders.
  useEffect(() => {
    if (totalDurationMs <= 0 || trackWidth <= 0) {
      lineLeftSV.value = 0;
      handleLeftSV.value = -HANDLE_SIZE / 2;
      return;
    }
    const ratio = Math.max(0, Math.min(1, positionMs / totalDurationMs));
    const lineLeft = ratio * trackWidth - LINE_WIDTH / 2;
    const handleLeft = ratio * trackWidth - HANDLE_SIZE / 2;
    if (reducedMotion) {
      lineLeftSV.value = lineLeft;
      handleLeftSV.value = handleLeft;
    } else {
      // Smooth interpolation for non-playback position changes (seek, scrub).
      // During playback the clock updates at 60fps so the timing is
      // effectively instant — this just smooths discrete jumps.
      lineLeftSV.value = withTiming(lineLeft, {
        duration: 80,
        easing: Easing.out(Easing.ease),
      });
      handleLeftSV.value = withTiming(handleLeft, {
        duration: 80,
        easing: Easing.out(Easing.ease),
      });
    }
  }, [positionMs, totalDurationMs, trackWidth, reducedMotion, lineLeftSV, handleLeftSV]);

  const handleLayout = useCallback((e: { nativeEvent: { layout: { width: number } } }) => {
    widthSV.value = e.nativeEvent.layout.width;
  }, [widthSV]);

  const seekGesture = React.useMemo(() =>
    Gesture.Pan()
      .onBegin((e) => {
        'worklet';
        runOnJS(haptic.selection)();
        const w = widthSV.value || trackWidth;
        if (w <= 0 || totalDurationMs <= 0) return;
        const ms = Math.max(0, Math.min(totalDurationMs, (e.absoluteX / w) * totalDurationMs));
        runOnJS(onSeek)(ms);
      })
      .onChange((e) => {
        'worklet';
        const w = widthSV.value || trackWidth;
        if (w <= 0 || totalDurationMs <= 0) return;
        const ms = Math.max(0, Math.min(totalDurationMs, (e.absoluteX / w) * totalDurationMs));
        runOnJS(onSeek)(ms);
      })
      .onEnd(() => {
        'worklet';
        runOnJS(haptic.light)();
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [totalDurationMs, trackWidth, onSeek, haptic]
  );

  // ── Animated styles (UI thread) ────────────────────────────────────
  const lineAnimStyle = useAnimatedStyle(() => ({
    left: lineLeftSV.value,
  }));

  const handleAnimStyle = useAnimatedStyle(() => ({
    left: handleLeftSV.value,
  }));

  if (totalDurationMs <= 0 || trackWidth <= 0) return null;

  return (
    <GestureDetector gesture={seekGesture}>
      <Reanimated.View
        style={playheadStyles.gestureZone}
        onLayout={handleLayout}
        pointerEvents="auto"
      >
        <Reanimated.View
          style={[
            playheadStyles.line,
            lineAnimStyle,
            { backgroundColor: colors.brand },
          ]}
        />
        <Reanimated.View
          style={[
            playheadStyles.handle,
            handleAnimStyle,
            { backgroundColor: colors.brand, borderColor: colors.surface },
          ]}
          accessibilityLabel="Playhead"
          accessibilityRole="adjustable"
        />
      </Reanimated.View>
    </GestureDetector>
  );
});

const playheadStyles = StyleSheet.create({
  gestureZone: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  line: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: LINE_WIDTH,
  },
  handle: {
    position: 'absolute',
    top: 0,
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
    borderRadius: HANDLE_SIZE / 2,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
