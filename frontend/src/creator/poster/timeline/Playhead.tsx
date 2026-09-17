import React, { useEffect } from 'react';
import { StyleSheet, TextInput, type TextInputProps } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import { useAppTheme } from '../../../theme/ThemeContext';
import { FontFamily } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import { Motion } from '../../../theme/motionTokens';
import { useReducedMotion } from '../../../hooks/useReducedMotion';

// ───────────────────────────────────────────────────────────────────────────
// Playhead — vertical scrub line overlaid on the timeline track.
//
// A 2pt brand-colored vertical line spans the track height with a 24pt
// visible handle dot at the top. This component is PURELY VISUAL —
// pointerEvents="none" — so it never occludes clip taps, trim handles,
// slip drags, or reorder gestures on the clip row beneath it.
//
// The seek pan lives on the TimelineRuler strip above the track (the
// CapCut/Edits scrub grammar). During a ruler scrub the ruler writes the
// finger position to `scrubMsSV` on the UI thread — the line and timecode
// bubble track it 1:1 with no JS hop.
//
// Outside a scrub, the position is driven by the `positionMs` prop (the
// PlaybackClock) via shared values — no React re-render per frame during
// playback.
// ───────────────────────────────────────────────────────────────────────────

function formatTimecode(ms: number): string {
  'worklet';
  const clamped = Math.max(0, ms);
  const totalSeconds = clamped / 1000;
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  const tenths = Math.floor((clamped % 1000) / 100);
  return `${m}:${s.toString().padStart(2, '0')}.${tenths}`;
}

// Animated TextInput — the scrub timecode renders on the UI thread via
// animated props, so no runOnJS/setState per frame while dragging.
const AnimatedTimecode = Reanimated.createAnimatedComponent(TextInput);

export interface PlayheadProps {
  /** Current playhead position in ms (from the PlaybackClock). */
  positionMs: number;
  /** Total timeline duration in ms. */
  totalDurationMs: number;
  /** Measured track width in pixels. */
  trackWidth: number;
  /**
   * Ruler-scrub position in ms (>= 0 while the ruler is being dragged,
   * -1 when idle). Overrides `positionMs` for 1:1 finger tracking.
   */
  scrubMsSV?: SharedValue<number>;
}

const HIT_SIZE = 44;
const DOT_SIZE = 24;
const LINE_WIDTH = 2;
const BUBBLE_WIDTH = 64;

export const Playhead = React.memo(function Playhead({
  positionMs,
  totalDurationMs,
  trackWidth,
  scrubMsSV,
}: PlayheadProps) {
  const { colors } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const widthSV = useSharedValue(trackWidth);

  // ── UI-thread playhead position (pixels) ───────────────────────────
  const lineLeftSV = useSharedValue(0);
  const handleLeftSV = useSharedValue(0);

  // Sync from the positionMs prop — but ONLY when the user is not
  // actively scrubbing (the ruler's pan drives scrubMsSV on the UI
  // thread; the clock must not fight the finger).
  useEffect(() => {
    if (scrubMsSV && scrubMsSV.value >= 0) return;
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
  }, [positionMs, totalDurationMs, trackWidth, reducedMotion, lineLeftSV, handleLeftSV, scrubMsSV]);

  // ── Animated styles (UI thread) ────────────────────────────────────
  // During a scrub, position derives from scrubMsSV (ms → px); otherwise
  // from the prop-synced shared values.
  const lineAnimStyle = useAnimatedStyle(() => {
    const scrub = scrubMsSV ? scrubMsSV.value : -1;
    if (scrub >= 0 && totalDurationMs > 0) {
      const w = widthSV.value || trackWidth;
      const ratio = Math.max(0, Math.min(1, scrub / totalDurationMs));
      return { left: ratio * w - LINE_WIDTH / 2 };
    }
    return { left: lineLeftSV.value };
  });

  const handleAnimStyle = useAnimatedStyle(() => {
    const scrub = scrubMsSV ? scrubMsSV.value : -1;
    if (scrub >= 0 && totalDurationMs > 0) {
      const w = widthSV.value || trackWidth;
      const ratio = Math.max(0, Math.min(1, scrub / totalDurationMs));
      return { left: ratio * w - HIT_SIZE / 2 };
    }
    return { left: handleLeftSV.value };
  });

  const bubbleAnimStyle = useAnimatedStyle(() => {
    const scrub = scrubMsSV ? scrubMsSV.value : -1;
    if (scrub < 0) return { opacity: 0, left: 0 };
    const w = widthSV.value || trackWidth;
    const ratio = Math.max(0, Math.min(1, scrub / Math.max(1, totalDurationMs)));
    return {
      opacity: 1,
      left: ratio * w - BUBBLE_WIDTH / 2,
    };
  });

  // Timecode text — formatted and rendered entirely on the UI thread.
  // `text` is a native-only TextInput prop (not in the public type).
  const bubbleTextProps = useAnimatedProps<TextInputProps & { text?: string }>(() => ({
    text: formatTimecode(scrubMsSV ? Math.max(0, scrubMsSV.value) : 0),
  }));

  useEffect(() => {
    widthSV.value = trackWidth;
  }, [trackWidth, widthSV]);

  if (totalDurationMs <= 0 || trackWidth <= 0) return null;

  return (
    <Reanimated.View
      style={playheadStyles.container}
      pointerEvents="none"
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
        accessibilityHint="Drag to scrub the timeline"
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
      <Reanimated.View
        style={[
          playheadStyles.bubble,
          bubbleAnimStyle,
          { backgroundColor: colors.surface },
        ]}
      >
        <AnimatedTimecode
          style={[playheadStyles.bubbleText, { color: colors.textPrimary }]}
          animatedProps={bubbleTextProps}
          defaultValue="0:00.0"
          editable={false}
          pointerEvents="none"
        />
      </Reanimated.View>
    </Reanimated.View>
  );
});

const playheadStyles = StyleSheet.create({
  container: {
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
