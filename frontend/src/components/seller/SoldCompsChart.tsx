import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

export interface SoldCompsChartProps {
  /** Minimum sold price in the comparable set (fiat units, e.g. GBP) */
  minPrice: number | null;
  /** Median sold price */
  medianPrice: number | null;
  /** Maximum sold price */
  maxPrice: number | null;
  /** Number of sold items in the comparable set */
  sampleSize: number;
  /** Median days to sell across the comparable set */
  medianDaysToSell?: number | null;
  /** Current listing price (fiat units) — marked on the range bar */
  currentPrice: number | null;
  /** Formatted price strings — caller controls formatting so the chart
   *  never fabricates currency presentation. */
  formatPrice: (value: number) => string;
}

/**
 * Sold Comparables Chart — compact price-range visualisation.
 *
 * Composition (flat, no card-on-card):
 *   range bar (min ── median ── max) with current-price marker →
 *   label row (min / median / max) →
 *   footer (sample size + median days to sell)
 *
 * Per AGENTS.md §4 anti-AI design:
 * - One stroke grammar (hairline track, 2pt markers for emphasis)
 * - No decorative illustrations; the bar IS the object
 * - No card chrome — flat on the canvas
 * - When data is insufficient, show an honest empty state, never a
 *   fabricated range
 */
export function SoldCompsChart({
  minPrice,
  medianPrice,
  maxPrice,
  sampleSize,
  medianDaysToSell,
  currentPrice,
  formatPrice,
}: SoldCompsChartProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  // ── Honest empty state: not enough comparables to draw a range ──
  // Per AGENTS.md §11: never present fabricated guidance as authoritative.
  const hasComps =
    sampleSize >= 2 &&
    minPrice != null &&
    maxPrice != null &&
    maxPrice > minPrice;

  if (!hasComps) {
    return (
      <View
        style={styles.container}
        accessibilityRole="summary"
        accessibilityLabel="Sold comparables: insufficient data"
      >
        <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>
          No sold comparables yet
        </Text>
        <Text style={[styles.emptyHint, { color: colors.textMuted }]}>
          {sampleSize === 0
            ? "Similar items haven't sold recently"
            : 'Only one comparable sale — more data needed'}
        </Text>
      </View>
    );
  }

  const range = maxPrice - minPrice;

  // Position helpers (0–1 across the range)
  const medianPos =
    medianPrice != null ? Math.min(1, Math.max(0, (medianPrice - minPrice) / range)) : null;
  const currentPos =
    currentPrice != null
      ? Math.min(1.05, Math.max(-0.05, (currentPrice - minPrice) / range))
      : null;

  // Current price positioning relative to the range
  let positioningText: string | null = null;
  if (currentPrice != null) {
    if (currentPrice < minPrice) positioningText = 'Below range';
    else if (currentPrice > maxPrice) positioningText = 'Above range';
    else positioningText = 'In range';
  }

  const a11yParts: string[] = [
    `${sampleSize} sold comparables`,
    `Min ${formatPrice(minPrice)}`,
  ];
  if (medianPrice != null) a11yParts.push(`Median ${formatPrice(medianPrice)}`);
  a11yParts.push(`Max ${formatPrice(maxPrice)}`);
  if (currentPrice != null && positioningText) {
    a11yParts.push(`Your price ${formatPrice(currentPrice)}, ${positioningText}`);
  }
  if (medianDaysToSell != null) {
    a11yParts.push(`Median ${medianDaysToSell} days to sell`);
  }

  return (
    <View
      style={styles.container}
      accessibilityRole="summary"
      accessibilityLabel={a11yParts.join(', ')}
    >
      {/* Range bar — the dominant object */}
      <View
        style={styles.rangeBar}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {/* Track */}
        <View style={[styles.rangeTrack, { backgroundColor: colors.surfaceAlt }]} />

        {/* Min tick */}
        <View style={[styles.rangeTick, styles.rangeTickMin, { backgroundColor: colors.textMuted }]} />

        {/* Max tick */}
        <View style={[styles.rangeTick, styles.rangeTickMax, { backgroundColor: colors.textMuted }]} />

        {/* Median marker — emphasised */}
        {medianPos != null ? (
          <View
            style={[
              styles.rangeMedian,
              { left: `${Math.round(medianPos * 100)}%`, backgroundColor: colors.brand },
            ]}
          />
        ) : null}

        {/* Current price marker — distinct from median (hollow ring) */}
        {currentPos != null ? (
          <View
            style={[
              styles.rangeCurrent,
              { left: `${Math.round(currentPos * 100)}%`, borderColor: colors.textPrimary },
            ]}
          />
        ) : null}
      </View>

      {/* Legend row — current / median markers */}
      {currentPos != null || medianPos != null ? (
        <View style={styles.legendRow}>
          {currentPos != null ? (
            <View style={styles.legendItem}>
              <View style={[styles.legendSwatch, styles.legendSwatchCurrent, { borderColor: colors.textPrimary }]} />
              <Text style={[styles.legendText, { color: colors.textSecondary }]}>Your price</Text>
            </View>
          ) : null}
          {medianPos != null ? (
            <View style={styles.legendItem}>
              <View style={[styles.legendSwatch, { backgroundColor: colors.brand }]} />
              <Text style={[styles.legendText, { color: colors.textSecondary }]}>Median sold</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {/* Price labels — min / median / max */}
      <View style={styles.priceRow}>
        <Text style={[styles.priceLabel, { color: colors.textMuted }]}>
          {formatPrice(minPrice)}
        </Text>
        {medianPrice != null ? (
          <Text style={[styles.priceMedian, { color: colors.textPrimary }]}>
            {formatPrice(medianPrice)}
          </Text>
        ) : <View style={{ flex: 1 }} />}
        <Text style={[styles.priceLabel, { color: colors.textMuted, textAlign: 'right' }]}>
          {formatPrice(maxPrice)}
        </Text>
      </View>

      {/* Footer — sample size + days to sell */}
      <View style={styles.footerRow}>
        <Text style={[styles.footerText, { color: colors.textMuted }]}>
          {sampleSize} {sampleSize === 1 ? 'sale' : 'sales'}
        </Text>
        {positioningText ? (
          <Text style={[styles.footerText, { color: colors.textSecondary }]}>
            {positioningText}
          </Text>
        ) : null}
        {medianDaysToSell != null ? (
          <Text style={[styles.footerText, { color: colors.textMuted }]}>
            ~{Math.round(medianDaysToSell)}d to sell
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      paddingVertical: Space.sm + 2,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderSubtle,
    },
    // ── Empty state ──
    emptyTitle: {
      fontSize: TypographyV2.body.size,
      lineHeight: TypographyV2.body.lineHeight,
      fontFamily: TypographyV2.body.fontFamily,
    },
    emptyHint: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: TypographyV2.meta.fontFamily,
      marginTop: 2,
    },
    // ── Range bar ──
    rangeBar: {
      position: 'relative',
      height: 24,
      justifyContent: 'center',
    },
    rangeTrack: {
      position: 'absolute',
      left: 0,
      right: 0,
      height: 3,
      borderRadius: Radius.full,
    },
    rangeTick: {
      position: 'absolute',
      width: 2,
      height: 10,
      borderRadius: 1,
      top: 7,
    },
    rangeTickMin: {
      left: 0,
    },
    rangeTickMax: {
      right: 0,
    },
    rangeMedian: {
      position: 'absolute',
      width: 3,
      height: 16,
      borderRadius: 1.5,
      top: 4,
      marginLeft: -1.5,
    },
    rangeCurrent: {
      position: 'absolute',
      width: 12,
      height: 12,
      borderRadius: Radius.full,
      borderWidth: 2,
      backgroundColor: 'transparent',
      top: 6,
      marginLeft: -6,
    },
    // ── Legend ──
    legendRow: {
      flexDirection: 'row',
      gap: Space.md,
      marginTop: Space.xs,
    },
    legendItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
    },
    legendSwatch: {
      width: 10,
      height: 10,
      borderRadius: Radius.sm,
    },
    legendSwatchCurrent: {
      width: 12,
      height: 12,
      borderRadius: Radius.full,
      borderWidth: 2,
      backgroundColor: 'transparent',
    },
    legendText: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: TypographyV2.meta.fontFamily,
    },
    // ── Price labels ──
    priceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: Space.xs,
    },
    priceLabel: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: TypographyV2.meta.fontFamily,
      fontVariant: ['tabular-nums'] as ['tabular-nums'],
      flex: 1,
    },
    priceMedian: {
      fontSize: TypographyV2.bodyStrong.size,
      lineHeight: TypographyV2.bodyStrong.lineHeight,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      fontVariant: ['tabular-nums'] as ['tabular-nums'],
      textAlign: 'center',
      flex: 1,
    },
    // ── Footer ──
    footerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      marginTop: Space.xs,
    },
    footerText: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: TypographyV2.meta.fontFamily,
      fontVariant: ['tabular-nums'] as ['tabular-nums'],
    },
  });
}
