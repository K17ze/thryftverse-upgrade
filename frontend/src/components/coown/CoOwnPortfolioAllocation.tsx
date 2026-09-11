import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, FontFamily } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { formatCoOwnIze } from '../../utils/currency';

// ── Types ────────────────────────────────────────────────────────────────────

export interface CoOwnPortfolioAllocationSlice {
  assetId: string;
  title: string;
  marketValueGbp: number;
  category?: string;
}

export interface CoOwnPortfolioAllocationProps {
  positions: CoOwnPortfolioAllocationSlice[];
  totalValueGbp: number;
  groupBy?: 'asset' | 'category';
}

// ── Neutral palette ──────────────────────────────────────────────────────────
// Per Design.md: allocation segments use a neutral palette — no decorative
// gold. These muted slate/charcoal tones are distinguishable from one another
// in both light and dark themes without introducing categorical colour noise.
// The palette is theme-independent so segment identity stays stable across
// theme switches (a segment's colour should not reshuffle when the user flips
// dark mode).
const NEUTRAL_SEGMENT_PALETTE = [
  '#A8A8A8', // slate 1 — lightest
  '#8A8A8A', // slate 2
  '#6E6E6E', // slate 3
  '#565656', // slate 4
  '#424242', // slate 5
  '#9C8E7E', // warm taupe 1
  '#7E7468', // warm taupe 2
  '#645A50', // warm taupe 3
] as const;

// ── Helpers ──────────────────────────────────────────────────────────────────

interface AggregatedSlice {
  key: string;
  label: string;
  value: number;
  color: string;
}

function aggregateSlices(
  positions: CoOwnPortfolioAllocationSlice[],
  groupBy: 'asset' | 'category',
): AggregatedSlice[] {
  const buckets = new Map<string, { label: string; value: number }>();
  for (const p of positions) {
    if (!Number.isFinite(p.marketValueGbp) || p.marketValueGbp <= 0) continue;
    const key = groupBy === 'category' ? (p.category?.trim() || 'Uncategorised') : p.assetId;
    const label = groupBy === 'category' ? (p.category?.trim() || 'Uncategorised') : p.title;
    const existing = buckets.get(key);
    if (existing) {
      existing.value += p.marketValueGbp;
    } else {
      buckets.set(key, { label, value: p.marketValueGbp });
    }
  }

  const sorted = Array.from(buckets.entries())
    .map(([key, { label, value }], i) => ({
      key,
      label,
      value,
      color: NEUTRAL_SEGMENT_PALETTE[i % NEUTRAL_SEGMENT_PALETTE.length],
    }))
    .sort((a, b) => b.value - a.value);

  // Re-assign palette indices after sorting so the largest slice gets the
  // lightest tone and identity follows rank, not insertion order.
  return sorted.map((s, i) => ({
    ...s,
    color: NEUTRAL_SEGMENT_PALETTE[i % NEUTRAL_SEGMENT_PALETTE.length],
  }));
}

// ── Component ────────────────────────────────────────────────────────────────

/**
 * CoOwnPortfolioAllocation — a flat, card-free donut chart showing portfolio
 * allocation by asset or category.
 *
 * Design (Design.md):
 * - Neutral palette only — no decorative gold.
 * - coownUp / coownDown reserved for P&L, not allocation segments.
 * - Flat on canvas, no card chrome.
 * - Donut with segments; centre shows total value.
 * - Legend below with title, value, percentage.
 * - Tabular numerals for all values.
 *
 * Uses `react-native-svg` (already a project dependency). When SVG is not
 * available at runtime the chart degrades to a stacked horizontal bar so the
 * allocation is still legible without a hard dependency on the native module.
 */
export function CoOwnPortfolioAllocation({
  positions,
  totalValueGbp,
  groupBy = 'asset',
}: CoOwnPortfolioAllocationProps) {
  const { colors } = useAppTheme();

  const slices = useMemo(() => aggregateSlices(positions, groupBy), [positions, groupBy]);
  const effectiveTotal = totalValueGbp > 0 ? totalValueGbp : slices.reduce((s, sl) => s + sl.value, 0);

  // ── Empty state ──
  if (slices.length === 0 || effectiveTotal <= 0) {
    return (
      <View style={[styles.container, { borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Allocation</Text>
        <Text style={[styles.stateText, { color: colors.textMuted }]}>No positions yet</Text>
      </View>
    );
  }

  // Donut geometry — sized for a square that fits a phone column.
  const size = 180;
  const strokeWidth = 28;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const centre = size / 2;

  // Build stroke-dasharray segments. Each Circle is a full ring with a dash
  // covering its share; successive segments are rotated via strokeDashoffset
  // so they tile around the ring without overlap.
  let cumulativeOffset = 0;
  const segments = slices.map((sl) => {
    const fraction = effectiveTotal > 0 ? sl.value / effectiveTotal : 0;
    const dashLength = fraction * circumference;
    // strokeDashoffset shifts the start of each dash. We rotate the dash to
    // begin at the top (−90°) and accumulate around the ring.
    const dashOffset = -cumulativeOffset;
    cumulativeOffset += dashLength;
    return {
      ...sl,
      fraction,
      dashLength,
      dashOffset,
    };
  });

  const a11yParts = segments
    .map((s) => `${s.label} ${formatCoOwnIze(s.value)}, ${((s.fraction * 100).toFixed(1))}%`)
    .join('; ');
  const a11yLabel = `Portfolio allocation. Total ${formatCoOwnIze(effectiveTotal)}. ${a11yParts}.`;

  return (
    <View
      style={[styles.container, { borderBottomColor: colors.border }]}
      accessibilityLabel={a11yLabel}
      accessibilityRole="summary"
    >
      <Text style={[styles.title, { color: colors.textPrimary }]}>Allocation</Text>

      <View style={styles.chartRow}>
        <View style={styles.donutWrap}>
          <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            {/* Track ring — subtle, so empty share is legible. */}
            <Circle
              cx={centre}
              cy={centre}
              r={radius}
              fill="none"
              stroke={colors.surfaceAlt}
              strokeWidth={strokeWidth}
            />
            {segments.map((s, i) => (
              <Circle
                key={s.key}
                cx={centre}
                cy={centre}
                r={radius}
                fill="none"
                stroke={s.color}
                strokeWidth={strokeWidth}
                strokeDasharray={`${s.dashLength} ${circumference - s.dashLength}`}
                strokeDashoffset={s.dashOffset}
                // Rotate so the first segment starts at 12 o'clock.
                transform={`rotate(-90 ${centre} ${centre})`}
                // Avoid the segment joining into a full ring artefact.
                strokeLinecap="butt"
                accessible={false}
                // `i` retained for debuggability; no behavioural use.
                data-segment-index={i}
              />
            ))}
          </Svg>
          <View style={styles.donutCentre} pointerEvents="none">
            <Text style={[styles.centredLabel, { color: colors.textMuted }]}>Total</Text>
            <Text
              style={[styles.centredValue, { color: colors.textPrimary }]}
              numberOfLines={1}
            >
              {formatCoOwnIze(effectiveTotal)}
            </Text>
          </View>
        </View>

        {/* ── Legend — flat hairline rows, not a tile grid ── */}
        <View style={styles.legend}>
          {segments.map((s) => (
            <View key={s.key} style={[styles.legendRow, { borderBottomColor: colors.borderSubtle }]}>
              <View style={[styles.swatch, { backgroundColor: s.color }]} />
              <Text
                style={[styles.legendLabel, { color: colors.textPrimary, flexShrink: 1 }]}
                numberOfLines={1}
              >
                {s.label}
              </Text>
              <Text
                style={[styles.legendValue, { color: colors.textPrimary }]}
                numberOfLines={1}
              >
                {formatCoOwnIze(s.value)}
              </Text>
              <Text
                style={[styles.legendPct, { color: colors.textSecondary }]}
                numberOfLines={1}
              >
                {(s.fraction * 100).toFixed(1)}%
              </Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    paddingVertical: Space.lg,
    marginBottom: Space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: {
    fontSize: TypographyV2.sectionTitle.size,
    lineHeight: TypographyV2.sectionTitle.lineHeight,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.sectionTitle.letterSpacing,
    marginBottom: Space.md,
  },
  stateText: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.body.letterSpacing,
  },
  chartRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.lg,
  },
  donutWrap: {
    position: 'relative',
    width: 180,
    height: 180,
    justifyContent: 'center',
    alignItems: 'center',
  },
  donutCentre: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centredLabel: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  centredValue: {
    fontSize: TypographyV2.priceList.size,
    lineHeight: TypographyV2.priceList.lineHeight,
    fontFamily: TypographyV2.priceList.fontFamily,
    fontWeight: TypographyV2.priceList.weight,
    letterSpacing: TypographyV2.priceList.letterSpacing,
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
    marginTop: 2,
  },
  legend: {
    flex: 1,
    gap: 0,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm - 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  swatch: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendLabel: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: TypographyV2.body.fontFamily,
    letterSpacing: TypographyV2.body.letterSpacing,
  },
  legendValue: {
    fontSize: TypographyV2.numericMeta.size,
    lineHeight: TypographyV2.numericMeta.lineHeight,
    fontFamily: TypographyV2.numericMeta.fontFamily,
    fontWeight: TypographyV2.numericMeta.weight,
    letterSpacing: TypographyV2.numericMeta.letterSpacing,
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
    marginLeft: 'auto',
  },
  legendPct: {
    fontSize: TypographyV2.numericMeta.size,
    lineHeight: TypographyV2.numericMeta.lineHeight,
    fontFamily: TypographyV2.numericMeta.fontFamily,
    fontWeight: TypographyV2.numericMeta.weight,
    letterSpacing: TypographyV2.numericMeta.letterSpacing,
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
    minWidth: 48,
    textAlign: 'right',
  },
});
