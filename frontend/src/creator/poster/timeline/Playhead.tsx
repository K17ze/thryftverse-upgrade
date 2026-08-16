import React, { useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSharedValue, runOnJS } from 'react-native-reanimated';
import { useAppTheme } from '../../../theme/ThemeContext';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import { useHaptic } from '../../../hooks/useHaptic';

// ───────────────────────────────────────────────────────────────────────────
// Playhead — vertical scrub line overlaid on the timeline track.
//
// A 2pt brand-colored vertical line spans the track height. A 24pt draggable
// handle sits at the top. Dragging the handle (or the line) updates onSeek
// continuously, clamped to [0, totalDurationMs]. Under reduced motion we
// skip any animated transitions — the line simply tracks the position.
// ───────────────────────────────────────────────────────────────────────────

export interface PlayheadProps {
  positionMs: number;
  totalDurationMs: number;
  trackWidth: number;
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

  const handleLayout = useCallback((e: { nativeEvent: { layout: { width: number } } }) => {
    widthSV.value = e.nativeEvent.layout.width;
  }, [widthSV]);

  const pxToMs = useCallback((px: number) => {
    if (totalDurationMs <= 0) return 0;
    const w = widthSV.value || trackWidth;
    if (w <= 0) return 0;
    return Math.max(0, Math.min(totalDurationMs, (px / w) * totalDurationMs));
  }, [totalDurationMs, trackWidth]);

  const seekGesture = React.useMemo(() =>
    Gesture.Pan()
      .onBegin((e) => {
        'worklet';
        runOnJS(haptic.selection)();
        runOnJS(onSeek)(Math.max(0, Math.min(totalDurationMs, (e.absoluteX / (widthSV.value || trackWidth)) * totalDurationMs)));
      })
      .onChange((e) => {
        'worklet';
        const w = widthSV.value || trackWidth;
        if (w <= 0) return;
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

  if (totalDurationMs <= 0 || trackWidth <= 0) return null;

  const ratio = Math.max(0, Math.min(1, positionMs / totalDurationMs));
  const left = ratio * trackWidth - HANDLE_SIZE / 2;

  return (
    <GestureDetector gesture={seekGesture}>
      <View
        style={playheadStyles.gestureZone}
        onLayout={handleLayout}
        pointerEvents="auto"
      >
        <View
          style={[
            playheadStyles.line,
            {
              left: ratio * trackWidth - LINE_WIDTH / 2,
              backgroundColor: colors.brand,
            },
          ]}
        />
        <View
          style={[
            playheadStyles.handle,
            {
              left,
              backgroundColor: colors.brand,
              borderColor: colors.surface,
            },
          ]}
          accessibilityLabel="Playhead"
          accessibilityRole="adjustable"
        />
      </View>
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
