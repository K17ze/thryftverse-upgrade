import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  runOnJS,
  withSpring,
} from 'react-native-reanimated';
import { useAppTheme } from '../../../theme/ThemeContext';
import { FontFamily } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import { Motion } from '../../../theme/motionTokens';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import { useHaptic } from '../../../hooks/useHaptic';

// ───────────────────────────────────────────────────────────────────────────
// Playhead — vertical scrub line overlaid on the timeline track.
//
// A 2pt brand-colored vertical line spans the track height. A 24pt visible
// dot sits at the top inside a 44pt transparent hit target. Dragging the
// handle (or the line) updates the shared value directly on the UI thread
// for 1:1 tracking. onSeek fires on gesture end (or throttled to ~10Hz)
// so the JS-side playback clock is not poked every frame.
//
// The playhead position is driven by a Reanimated shared value so the line
// and handle move on the UI thread — no React re-render per frame during
// playback. The shared value is synced from the `positionMs` prop only
// when the user is NOT actively scrubbing (so the clock doesn't fight the
// finger). Under reduced motion we skip animated transitions.
// ───────────────────────────────────────────────────────────────────────────

function formatTimecode(ms: number): string {
  const clamped = Math.max(0, ms);
  const totalSeconds = clamped / 1000;
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  const tenths = Math.floor((clamped % 1000) / 100);
  return `${m}:${s.toString().padStart(2, '0')}.${tenths}`;
}

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

const HIT_SIZE = 44;
const DOT_SIZE = 24;
const LINE_WIDTH = 2;
const BUBBLE_WIDTH = 64;

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
  const [isDragging, setIsDragging] = useState(false);
  const [bubbleMs, setBubbleMs] = useState(0);
  const lastTickSV = useSharedValue(-1);
  // Tracks whether the user is actively scrubbing — when true, the
  // positionMs prop sync is suppressed so the clock doesn't fight the
  // finger.
  const isScrubbingSV = useSharedValue(false);
  // Throttle: last time (ms) onSeek was called during a scrub.
  const lastSeekTimeSV = useSharedValue(0);

  // ── UI-thread playhead position (pixels) ───────────────────────────
  // The shared value stores the pixel position of the playhead. It is
  // updated from the positionMs prop (driven by the PlaybackClock) and
  // rendered via animated styles on the UI thread — no React re-render
  // per frame during playback.
  const lineLeftSV = useSharedValue(0);
  const handleLeftSV = useSharedValue(0);

  // Sync the shared values whenever positionMs, totalDurationMs, or
  // trackWidth changes — but ONLY when the user is not actively
  // scrubbing. During a scrub the shared value is driven directly from
  // the gesture (e.absoluteX), so we must not overwrite it with the
  // stale clock position.
  useEffect(() => {
    if (isScrubbingSV.value) return;
    if (totalDurationMs <= 0 || trackWidth <= 0) {
      lineLeftSV.value = 0;
      handleLeftSV.value = -HIT_SIZE / 2;
      return;
    }
    const ratio = Math.max(0, Math.min(1, positionMs / totalDurationMs));
    const lineLeft = ratio * trackWidth - LINE_WIDTH / 2;
    const handleLeft = ratio * trackWidth - HIT_SIZE / 2;
    // During playback the clock advances the playhead by small frame deltas
    // (< 5px). Setting the shared value directly avoids a 40ms animation per
    // frame, which would lag behind the audio. Only discrete jumps (seek /
    // scrub) use the snapTo spring.
    const isPlaybackFrame = Math.abs(lineLeft - lineLeftSV.value) < 5;
    if (isPlaybackFrame || reducedMotion) {
      lineLeftSV.value = lineLeft;
      handleLeftSV.value = handleLeft;
    } else {
      lineLeftSV.value = withSpring(lineLeft, Motion.spring.snapTo);
      handleLeftSV.value = withSpring(handleLeft, Motion.spring.snapTo);
    }
  }, [positionMs, totalDurationMs, trackWidth, reducedMotion, lineLeftSV, handleLeftSV, isScrubbingSV]);

  const handleLayout = useCallback((e: { nativeEvent: { layout: { width: number } } }) => {
    widthSV.value = e.nativeEvent.layout.width;
  }, [widthSV]);

  // Helper: compute ms from absolute X, clamped to the timeline range.
  // Lives on the UI thread (worklet) so the playhead tracks 1:1.
  const seekGesture = React.useMemo(() =>
    Gesture.Pan()
      .onBegin((e) => {
        'worklet';
        const w = widthSV.value || trackWidth;
        if (w <= 0 || totalDurationMs <= 0) return;
        isScrubbingSV.value = true;
        const ratio = Math.max(0, Math.min(1, e.absoluteX / w));
        const ms = ratio * totalDurationMs;
        const lineLeft = ratio * w - LINE_WIDTH / 2;
        const handleLeft = ratio * w - HIT_SIZE / 2;
        // Drive the visual position directly — 1:1 with the finger.
        lineLeftSV.value = lineLeft;
        handleLeftSV.value = handleLeft;
        lastTickSV.value = Math.round(ms / 100) * 100;
        runOnJS(setBubbleMs)(ms);
        runOnJS(setIsDragging)(true);
        runOnJS(haptic.selection)();
        runOnJS(onSeek)(ms);
        lastSeekTimeSV.value = Date.now();
      })
      .onChange((e) => {
        'worklet';
        const w = widthSV.value || trackWidth;
        if (w <= 0 || totalDurationMs <= 0) return;
        const ratio = Math.max(0, Math.min(1, e.absoluteX / w));
        const ms = ratio * totalDurationMs;
        const lineLeft = ratio * w - LINE_WIDTH / 2;
        const handleLeft = ratio * w - HIT_SIZE / 2;
        // 1:1 visual on the UI thread.
        lineLeftSV.value = lineLeft;
        handleLeftSV.value = handleLeft;
        const tick = Math.round(ms / 100) * 100;
        if (tick !== lastTickSV.value) {
          lastTickSV.value = tick;
          runOnJS(haptic.selection)();
        }
        runOnJS(setBubbleMs)(ms);
        // Throttle onSeek to ~10Hz during scrub to avoid flooding the
        // playback clock. The final seek fires on onEnd.
        const now = Date.now();
        if (now - lastSeekTimeSV.value > 100) {
          lastSeekTimeSV.value = now;
          runOnJS(onSeek)(ms);
        }
      })
      .onEnd((e) => {
        'worklet';
        const w = widthSV.value || trackWidth;
        if (w > 0 && totalDurationMs > 0) {
          const ratio = Math.max(0, Math.min(1, e.absoluteX / w));
          const ms = ratio * totalDurationMs;
          // Final committed seek.
          runOnJS(onSeek)(ms);
        }
        isScrubbingSV.value = false;
        runOnJS(setIsDragging)(false);
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

  const bubbleAnimStyle = useAnimatedStyle(() => ({
    left: lineLeftSV.value + LINE_WIDTH / 2 - BUBBLE_WIDTH / 2,
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
            playheadStyles.handleHit,
            handleAnimStyle,
          ]}
          accessibilityLabel="Playhead"
          accessibilityRole="adjustable"
          accessibilityValue={{ text: formatTimecode(positionMs) }}
          accessibilityLiveRegion="polite"
        >
          <Reanimated.View
            style={[
              playheadStyles.handleDot,
              { backgroundColor: colors.brand, borderColor: colors.surface },
            ]}
          />
        </Reanimated.View>
        {isDragging && (
          <Reanimated.View
            style={[
              playheadStyles.bubble,
              bubbleAnimStyle,
              { backgroundColor: colors.surface },
            ]}
            pointerEvents="none"
          >
            <Text style={[playheadStyles.bubbleText, { color: colors.textPrimary }]}>
              {formatTimecode(bubbleMs)}
            </Text>
          </Reanimated.View>
        )}
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
  handleHit: {
    position: 'absolute',
    top: 0,
    width: HIT_SIZE,
    height: HIT_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  handleDot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    borderWidth: 2,
  },
  bubble: {
    position: 'absolute',
    top: -30,
    width: BUBBLE_WIDTH,
    height: 22,
    borderRadius: 6,
    paddingHorizontal: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bubbleText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.semibold,
  },
});
