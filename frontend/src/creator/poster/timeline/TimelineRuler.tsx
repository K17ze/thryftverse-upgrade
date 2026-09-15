import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, { runOnJS, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { FontFamily } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import { useAppTheme } from '../../../theme/ThemeContext';
import { useHaptic } from '../../../hooks/useHaptic';
import { formatTimecode } from './TimelineTypes';

// ───────────────────────────────────────────────────────────────────────────
// TimelineRuler — a time ruler rendered above the clip track.
//
// Renders tick marks at regular intervals proportional to the timeline
// duration: every 1s for short timelines (≤ 30s), every 5s for longer
// ones. Major ticks carry a timecode label (0:00.0, 0:05.0, …). The
// design is thin and subtle — 1pt hairline ticks, meta-size tabular
// labels — so it reads as utility chrome, not a competing surface.
//
// This strip is also the scrub surface (CapCut/Edits grammar): the seek
// pan lives HERE, not on the clip track, so clip taps/trims/reorders are
// never occluded by a playhead overlay. The pan writes the scrub position
// to `scrubMsSV` on the UI thread (1:1 line tracking in Playhead) and
// commits `onSeek` throttled + on release.
// ───────────────────────────────────────────────────────────────────────────

const RULER_HEIGHT = 20;
const TICK_LINE_HEIGHT = 6;
const MIN_TICK_SPACING_PX = 36; // avoid label overlap
// Extend the touch band below the ruler into the top of the clip track so
// the scrub strip meets the 44pt target (20 + 24) without covering the
// clip row's interactive area.
const SCRUB_HIT_BOTTOM = 24;

export interface TimelineRulerProps {
  totalDurationMs: number;
  trackWidth: number;
  /** Commit seek (final + throttled ~10Hz during scrub). */
  onSeek?: (ms: number) => void;
  /**
   * UI-thread scrub position in ms (>= 0 while scrubbing, -1 when idle).
   * The Playhead reads this for 1:1 line tracking during a ruler scrub.
   */
  scrubMsSV?: SharedValue<number>;
}

export const TimelineRuler = React.memo(function TimelineRuler({
  totalDurationMs,
  trackWidth,
  onSeek,
  scrubMsSV,
}: TimelineRulerProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();

  // Pick a tick interval (in ms) that keeps labels readable. Short
  // timelines use 1s ticks; longer ones step up to 5s. We then verify
  // the pixel spacing and double the interval until labels won't overlap.
  const intervalMs = useMemo(() => {
    if (totalDurationMs <= 0 || trackWidth <= 0) return 1000;
    const baseStep = totalDurationMs <= 30_000 ? 1000 : 5000;
    const pxPerMs = trackWidth / totalDurationMs;
    let step = baseStep;
    while (step * pxPerMs < MIN_TICK_SPACING_PX && step < totalDurationMs) {
      step *= 2;
    }
    return step;
  }, [totalDurationMs, trackWidth]);

  // Seek pan — mirrors the Playhead's scrub semantics (throttled commits,
  // haptic ticks per 100ms) but drives the shared scrub value so the
  // playhead line tracks the finger 1:1 on the UI thread.
  const lastTickSV = useSharedValue(-1);
  const lastSeekTimeSV = useSharedValue(0);
  const seekGesture = useMemo(() => {
    if (!onSeek || !scrubMsSV) return null;
    return Gesture.Pan()
      .onBegin((e) => {
        'worklet';
        if (trackWidth <= 0 || totalDurationMs <= 0) return;
        const ratio = Math.max(0, Math.min(1, e.x / trackWidth));
        const ms = ratio * totalDurationMs;
        scrubMsSV.value = ms;
        lastTickSV.value = Math.round(ms / 100) * 100;
        lastSeekTimeSV.value = Date.now();
        runOnJS(haptic.selection)();
        runOnJS(onSeek)(ms);
      })
      .onChange((e) => {
        'worklet';
        if (trackWidth <= 0 || totalDurationMs <= 0) return;
        const ratio = Math.max(0, Math.min(1, e.x / trackWidth));
        const ms = ratio * totalDurationMs;
        scrubMsSV.value = ms;
        const tick = Math.round(ms / 100) * 100;
        if (tick !== lastTickSV.value) {
          lastTickSV.value = tick;
          runOnJS(haptic.selection)();
        }
        const now = Date.now();
        if (now - lastSeekTimeSV.value > 100) {
          lastSeekTimeSV.value = now;
          runOnJS(onSeek)(ms);
        }
      })
      .onFinalize((e) => {
        'worklet';
        if (trackWidth > 0 && totalDurationMs > 0) {
          const ratio = Math.max(0, Math.min(1, e.x / trackWidth));
          runOnJS(onSeek)(ratio * totalDurationMs);
        }
        scrubMsSV.value = -1;
        runOnJS(haptic.light)();
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onSeek, scrubMsSV, trackWidth, totalDurationMs, haptic]);

  if (totalDurationMs <= 0 || trackWidth <= 0) {
    return <View style={[rulerStyles.container, { height: RULER_HEIGHT }]} />;
  }

  const tickCount = Math.floor(totalDurationMs / intervalMs) + 1;
  const ticks = Array.from({ length: tickCount }, (_, i) => i * intervalMs);

  const rulerBody = (
    <Reanimated.View
      style={[
        rulerStyles.container,
        { height: RULER_HEIGHT },
      ]}
      hitSlop={{ bottom: SCRUB_HIT_BOTTOM }}
      accessibilityLabel="Timeline ruler — drag to scrub"
      accessibilityRole="adjustable"
      accessibilityValue={{ text: 'Drag horizontally to move the playhead' }}
    >
      {ticks.map((ms) => {
        const left = (ms / totalDurationMs) * trackWidth;
        return (
          <View key={ms} style={[rulerStyles.tick, { left }]} pointerEvents="none">
            <View style={[rulerStyles.tickLine, { backgroundColor: colors.textMuted }]} />
            <Text
              style={[rulerStyles.tickLabel, { color: colors.textMuted }]}
              numberOfLines={1}
            >
              {formatTimecode(ms)}
            </Text>
          </View>
        );
      })}
    </Reanimated.View>
  );

  if (!seekGesture) return rulerBody;
  return <GestureDetector gesture={seekGesture}>{rulerBody}</GestureDetector>;
});

const rulerStyles = StyleSheet.create({
  container: {
    position: 'relative',
    flexDirection: 'row',
  },
  tick: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    alignItems: 'flex-start',
  },
  tickLine: {
    width: 1,
    height: TICK_LINE_HEIGHT,
  },
  tickLabel: {
    fontFamily: FontFamily.medium,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    marginTop: 1,
    fontVariant: ['tabular-nums'],
  },
});
