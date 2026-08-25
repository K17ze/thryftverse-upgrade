import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import { Space, FontFamily, Radius } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import { RadiusRoleValue } from '../../../theme/surfaceRadiusRules';
import { useAppTheme } from '../../../theme/ThemeContext';
import { extractWaveform } from '../../core/audio';

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
  /** 0–1 normalized amplitudes. When provided, these are rendered directly.
   *  When undefined and `audioUri` is provided, the component extracts
   *  the waveform asynchronously. When both are absent, an honest flat
   *  line is rendered — never fabricated bars. */
  samples?: number[];
  /** Audio file URI for real waveform extraction. When provided and
   *  `samples` is absent, the component extracts the waveform on mount
   *  and when the URI changes. Results are cached by the extractor. */
  audioUri?: string;
  /** Number of bars to extract when using `audioUri` (default 100). */
  barCount?: number;
  trackWidth: number;
  color?: string;
  height?: number;
}

export const WaveformTrack = React.memo(function WaveformTrack({
  samples: providedSamples,
  audioUri,
  barCount = 100,
  trackWidth,
  color,
  height = DEFAULT_HEIGHT,
}: WaveformTrackProps) {
  const { colors } = useAppTheme();
  const barColor = color ?? colors.antiqueGold;

  // ── Async waveform extraction state ──
  const [extractedSamples, setExtractedSamples] = useState<number[] | undefined>(undefined);
  const [isExtracting, setIsExtracting] = useState(false);

  useEffect(() => {
    // If samples are provided directly, skip extraction.
    if (providedSamples) {
      setExtractedSamples(undefined);
      setIsExtracting(false);
      return;
    }
    if (!audioUri) {
      setExtractedSamples(undefined);
      setIsExtracting(false);
      return;
    }

    let cancelled = false;
    setIsExtracting(true);

    extractWaveform(audioUri, barCount)
      .then((data) => {
        if (!cancelled) {
          setExtractedSamples(data.samples);
          setIsExtracting(false);
        }
      })
      .catch(() => {
        // extractWaveform already logs a warning and returns a flat fallback,
        // but guard against unexpected rejections.
        if (!cancelled) {
          setExtractedSamples(undefined);
          setIsExtracting(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [audioUri, barCount, providedSamples]);

  // Use provided samples, then extracted samples, then nothing.
  const effectiveSamples = providedSamples ?? extractedSamples;
  const hasSamples = Boolean(effectiveSamples && effectiveSamples.length > 0);

  // Compute bar geometry: distribute bars evenly across the track width.
  const { barWidth, computedBarCount } = useMemo(() => {
    if (!hasSamples || trackWidth <= 0) return { barWidth: 0, computedBarCount: 0 };
    const count = effectiveSamples!.length;
    const w = Math.max(MIN_BAR_WIDTH, Math.floor((trackWidth / count) - BAR_GAP));
    return { barWidth: w, computedBarCount: count };
  }, [hasSamples, effectiveSamples, trackWidth]);

  return (
    <View
      style={[
        waveStyles.container,
        {
          height,
          backgroundColor: colors.surfaceAlt,
        },
      ]}
      accessibilityLabel={
        isExtracting
          ? 'Audio waveform track, extracting waveform'
          : hasSamples
            ? 'Audio waveform track'
            : 'Audio waveform track, no audio waveform'
      }
    >
      {isExtracting ? (
        // ── Loading state: small spinner while extracting ──
        <View style={waveStyles.loading}>
          <ActivityIndicator size="small" color={colors.textMuted} />
        </View>
      ) : hasSamples && trackWidth > 0 ? (
        skiaAvailable ? (
          <SkiaWaveform
            samples={effectiveSamples!}
            trackWidth={trackWidth}
            trackHeight={height}
            barWidth={barWidth}
            barCount={computedBarCount}
            barGap={BAR_GAP}
            color={barColor}
          />
        ) : (
          <ViewWaveform
            samples={effectiveSamples!}
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
              borderRadius: Radius.none,
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
  loading: {
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
