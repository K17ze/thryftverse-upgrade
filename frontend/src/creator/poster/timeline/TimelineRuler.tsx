import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FontFamily } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import { useAppTheme } from '../../../theme/ThemeContext';
import { formatTimecode } from './TimelineTypes';

// ───────────────────────────────────────────────────────────────────────────
// TimelineRuler — a time ruler rendered above the clip track.
//
// Renders tick marks at regular intervals proportional to the timeline
// duration: every 1s for short timelines (≤ 30s), every 5s for longer
// ones. Major ticks carry a timecode label (0:00.0, 0:05.0, …). The
// design is thin and subtle — 1pt hairline ticks, meta-size tabular
// labels — so it reads as utility chrome, not a competing surface.
// ───────────────────────────────────────────────────────────────────────────

const RULER_HEIGHT = 20;
const TICK_LINE_HEIGHT = 6;
const MIN_TICK_SPACING_PX = 36; // avoid label overlap

export interface TimelineRulerProps {
  totalDurationMs: number;
  trackWidth: number;
}

export const TimelineRuler = React.memo(function TimelineRuler({
  totalDurationMs,
  trackWidth,
}: TimelineRulerProps) {
  const { colors } = useAppTheme();

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

  if (totalDurationMs <= 0 || trackWidth <= 0) {
    return <View style={[rulerStyles.container, { height: RULER_HEIGHT }]} />;
  }

  const tickCount = Math.floor(totalDurationMs / intervalMs) + 1;
  const ticks = Array.from({ length: tickCount }, (_, i) => i * intervalMs);

  return (
    <View
      style={[
        rulerStyles.container,
        { height: RULER_HEIGHT },
      ]}
      accessibilityLabel="Timeline ruler"
      accessibilityRole="adjustable"
    >
      {ticks.map((ms) => {
        const left = (ms / totalDurationMs) * trackWidth;
        return (
          <View key={ms} style={[rulerStyles.tick, { left }]}>
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
    </View>
  );
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
