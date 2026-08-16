import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Space, FontFamily } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import { RadiusRoleValue } from '../../../theme/surfaceRadiusRules';
import { useAppTheme } from '../../../theme/ThemeContext';

// ── Skia availability check (same pattern as DrawingCanvas /
//    FlagshipEmptyGraphic) ─────────────────────────────────────────────
// On web, @shopify/react-native-skia requires WithSkiaWeb setup which
// this project does not configure. The try/catch prevents a hard crash;
// we render a lightweight View-based bar fallback instead.
let skiaAvailable = false;
let SkiaImports: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('@shopify/react-native-skia');
  if (mod && mod.Canvas && mod.Skia && Platform.OS !== 'web') {
    skiaAvailable = true;
    SkiaImports = mod;
  }
} catch {
  skiaAvailable = false;
}

// ───────────────────────────────────────────────────────────────────────────
// WaveformTrack — an audio waveform visualization track.
//
// Renders a row of vertical bars representing audio amplitude. When no
// waveform samples are available, it renders an honest flat line and a
// subtle "No audio waveform" label (AGENTS.md §11 — never fake data).
// When samples are provided (0–1 normalized amplitudes), bars are drawn
// proportional to amplitude using @shopify/react-native-skia for
// GPU-accelerated rendering (with a View-based fallback on web).
// ───────────────────────────────────────────────────────────────────────────

const DEFAULT_HEIGHT = 40;
const BAR_GAP = 1; // px between bars
const MIN_BAR_WIDTH = 2;
const FLAT_LINE_HEIGHT = 1; // honest flat line when no samples

export interface WaveformTrackProps {
  /** 0–1 normalized amplitudes. When undefined/empty, an honest flat
   *  line is rendered — never fabricated bars. */
  samples?: number[];
  trackWidth: number;
  color?: string;
  height?: number;
}

export const WaveformTrack = React.memo(function WaveformTrack({
  samples,
  trackWidth,
  color,
  height = DEFAULT_HEIGHT,
}: WaveformTrackProps) {
  const { colors } = useAppTheme();
  const barColor = color ?? colors.antiqueGold;
  const hasSamples = Boolean(samples && samples.length > 0);

  // Compute bar geometry: distribute bars evenly across the track width.
  const { barWidth, barCount } = useMemo(() => {
    if (!hasSamples || trackWidth <= 0) return { barWidth: 0, barCount: 0 };
    const count = samples!.length;
    const w = Math.max(MIN_BAR_WIDTH, Math.floor((trackWidth / count) - BAR_GAP));
    return { barWidth: w, barCount: count };
  }, [hasSamples, samples, trackWidth]);

  return (
    <View
      style={[
        waveStyles.container,
        {
          height,
          backgroundColor: colors.surfaceAlt,
        },
      ]}
      accessibilityLabel={hasSamples ? 'Audio waveform track' : 'Audio waveform track, no audio waveform'}
    >
      {hasSamples && trackWidth > 0 ? (
        skiaAvailable ? (
          <SkiaWaveform
            samples={samples!}
            trackWidth={trackWidth}
            trackHeight={height}
            barWidth={barWidth}
            barCount={barCount}
            barGap={BAR_GAP}
            color={barColor}
          />
        ) : (
          <ViewWaveform
            samples={samples!}
            trackWidth={trackWidth}
            trackHeight={height}
            barWidth={barWidth}
            barGap={BAR_GAP}
            color={barColor}
          />
        )
      ) : (
        // ── Honest empty state: flat line + subtle label ──
        <View style={waveStyles.empty}>
          <View style={[waveStyles.flatLine, { backgroundColor: colors.textMuted }]} />
          <Text style={[waveStyles.emptyLabel, { color: colors.textMuted }]} numberOfLines={1}>
            No audio waveform
          </Text>
        </View>
      )}
    </View>
  );
});

// ── Skia implementation (native only) ───────────────────────────────────────
interface SkiaWaveformProps {
  samples: number[];
  trackWidth: number;
  trackHeight: number;
  barWidth: number;
  barCount: number;
  barGap: number;
  color: string;
}

function SkiaWaveform({
  samples,
  trackWidth,
  trackHeight,
  barWidth,
  barCount,
  barGap,
  color,
}: SkiaWaveformProps) {
  const { Canvas, Rect } = SkiaImports;
  const cy = trackHeight / 2;
  const step = barWidth + barGap;

  // Build the bar rects once. Each bar is centered vertically; height
  // scales with the normalized amplitude (min 1px so silence is visible).
  const bars = useMemo(() => {
    const out: { x: number; y: number; w: number; h: number }[] = [];
    for (let i = 0; i < barCount; i++) {
      const amp = Math.max(0, Math.min(1, samples[i] ?? 0));
      const h = Math.max(1, amp * (trackHeight - 2));
      const x = i * step;
      const y = cy - h / 2;
      out.push({ x, y, w: barWidth, h });
    }
    return out;
  }, [samples, barCount, step, barWidth, trackHeight, cy]);

  return (
    <Canvas style={{ width: trackWidth, height: trackHeight }}>
      {bars.map((b, i) => (
        <Rect
          key={i}
          x={b.x}
          y={b.y}
          width={b.w}
          height={b.h}
          color={color}
          rx={1}
        />
      ))}
    </Canvas>
  );
}

// ── View-based fallback (web / skia unavailable) ────────────────────────────
interface ViewWaveformProps {
  samples: number[];
  trackWidth: number;
  trackHeight: number;
  barWidth: number;
  barGap: number;
  color: string;
}

const ViewWaveform = React.memo(function ViewWaveform({
  samples,
  trackHeight,
  barWidth,
  barGap,
  color,
}: ViewWaveformProps) {
  const cy = trackHeight / 2;
  return (
    <View style={waveStyles.barsRow}>
      {samples.map((amp, i) => {
        const clamped = Math.max(0, Math.min(1, amp));
        const h = Math.max(1, clamped * (trackHeight - 2));
        return (
          <View
            key={i}
            style={{
              width: barWidth,
              height: h,
              marginTop: cy - h / 2,
              marginRight: barGap,
              backgroundColor: color,
              borderRadius: 1,
            }}
          />
        );
      })}
    </View>
  );
});

const waveStyles = StyleSheet.create({
  container: {
    position: 'relative',
    borderRadius: RadiusRoleValue.compactControl,
    overflow: 'hidden',
    paddingHorizontal: Space.xxs,
    justifyContent: 'center',
  },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    height: '100%',
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  flatLine: {
    position: 'absolute',
    left: Space.xs,
    right: Space.xs,
    height: FLAT_LINE_HEIGHT,
  },
  emptyLabel: {
    fontFamily: FontFamily.medium,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    opacity: 0.7,
  },
});
