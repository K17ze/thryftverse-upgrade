import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, FontFamily } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { RadiusRoleValue } from '../../theme/surfaceRadiusRules';
import { CoOwnNumericText } from '../ui/CoOwnNumericText';
import { formatCoOwnIze } from '../../utils/currency';
import type { CoOwnPositionVM } from '../../services/coOwnPortfolio';

// ── Types ────────────────────────────────────────────────────────────────────

export interface CoOwnPortfolioPerformanceChartProps {
  positions: CoOwnPositionVM[];
  /** Current marked value: sum of (currentPriceGbp * unitsOwned). */
  totalValueGbp: number;
  /** Total cost basis: sum of (avgEntryPriceGbp * unitsOwned). */
  totalCostBasisGbp: number;
  /** Realised P&L across all positions, if available. */
  totalRealizedGbp?: number;
  /** When true, holdings data could not be loaded (error state). */
  unavailable?: boolean;
}

// ── Component ────────────────────────────────────────────────────────────────

/**
 * CoOwnPortfolioPerformanceChart — an honest cost-vs-value comparison.
 *
 * This is NOT a time-series chart. Historical valuations and transaction
 * records are not yet available from the backend, so fabricating a
 * performance line would mislead the user. Instead we show what they paid
 * (cost basis) and what it is worth now (marked value), with the unrealised
 * and realised P&L derived from those two honest numbers.
 */
export function CoOwnPortfolioPerformanceChart({
  positions,
  totalValueGbp,
  totalCostBasisGbp,
  totalRealizedGbp = 0,
  unavailable = false,
}: CoOwnPortfolioPerformanceChartProps) {
  const { colors } = useAppTheme();

  const unrealizedGbp = totalValueGbp - totalCostBasisGbp;
  const unrealizedPct = useMemo(
    () => (totalCostBasisGbp > 0 ? (unrealizedGbp / totalCostBasisGbp) * 100 : 0),
    [unrealizedGbp, totalCostBasisGbp],
  );
  const isUp = unrealizedGbp >= 0;
  const pnlColor = isUp ? colors.coownUp : colors.coownDown;

  // ── Error state: holdings unavailable ──
  if (unavailable) {
    return (
      <View style={[styles.container, { borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Cost vs value</Text>
        <Text style={[styles.stateText, { color: colors.textMuted }]}>Portfolio unavailable</Text>
      </View>
    );
  }

  // ── Empty state: no positions ──
  if (positions.length === 0) {
    return (
      <View style={[styles.container, { borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Cost vs value</Text>
        <Text style={[styles.stateText, { color: colors.textMuted }]}>No positions yet</Text>
      </View>
    );
  }

  // Comparison bars: cost basis vs current value, scaled to the larger one.
  const maxValue = Math.max(totalCostBasisGbp, totalValueGbp, 1);
  const costRatio = Math.max(0, Math.min(1, totalCostBasisGbp / maxValue));
  const valueRatio = Math.max(0, Math.min(1, totalValueGbp / maxValue));

  const a11ySummary =
    `Cost basis ${formatCoOwnIze(totalCostBasisGbp)}, ` +
    `current value ${formatCoOwnIze(totalValueGbp)}, ` +
    `unrealised ${unrealizedGbp >= 0 ? 'up' : 'down'} ${Math.abs(unrealizedPct).toFixed(1)} percent` +
    (totalRealizedGbp !== 0 ? `, realised ${formatCoOwnIze(totalRealizedGbp)}` : '') +
    '.';

  return (
    <View
      style={[styles.container, { borderBottomColor: colors.border }]}
      accessibilityLabel={a11ySummary}
      accessibilityRole="summary"
    >
      <Text style={[styles.title, { color: colors.textPrimary }]}>Cost vs value</Text>

      {/* ── Horizontal comparison bars ──
          Two bars on a shared scale: what you paid vs what it's worth now.
          No fabricated time axis — just the two honest numbers. */}
      <View style={styles.barsWrap}>
        <View style={styles.barRow}>
          <Text style={[styles.barLabel, { color: colors.textMuted }]} numberOfLines={1}>Cost</Text>
          <View style={[styles.barTrack, { backgroundColor: colors.surfaceAlt }]}>
            <View
              style={[styles.barFill, { width: `${costRatio * 100}%`, backgroundColor: colors.textSecondary }]}
            />
          </View>
          <Text style={[styles.barValue, { color: colors.textPrimary }]}>
            {formatCoOwnIze(totalCostBasisGbp)}
          </Text>
        </View>
        <View style={styles.barRow}>
          <Text style={[styles.barLabel, { color: colors.textMuted }]} numberOfLines={1}>Value</Text>
          <View style={[styles.barTrack, { backgroundColor: colors.surfaceAlt }]}>
            <View
              style={[styles.barFill, { width: `${valueRatio * 100}%`, backgroundColor: pnlColor }]}
            />
          </View>
          <Text style={[styles.barValue, { color: colors.textPrimary }]}>
            {formatCoOwnIze(totalValueGbp)}
          </Text>
        </View>
      </View>

      {/* ── P&L rows — flat hairline rows, not a tile grid ── */}
      <View style={styles.pnlRows}>
        <View style={[styles.pnlRow, { borderBottomColor: colors.border }]}>
          <Text style={[styles.pnlLabel, { color: colors.textSecondary }]} numberOfLines={1}>Unrealised</Text>
          <View style={styles.pnlRight}>
            <CoOwnNumericText
              value={unrealizedPct}
              unit="pct"
              size="mono"
              signed
              showGlyph={false}
              color={pnlColor}
            />
            <CoOwnNumericText
              value={unrealizedGbp}
              unit="1ZE"
              size="price"
              signed
              showUnit={false}
              showGlyph={false}
              color={pnlColor}
            />
          </View>
        </View>
        {totalRealizedGbp !== 0 && (
          <View style={[styles.pnlRow, { borderBottomColor: colors.border }]}>
            <Text style={[styles.pnlLabel, { color: colors.textSecondary }]} numberOfLines={1}>Realised</Text>
            <CoOwnNumericText
              value={totalRealizedGbp}
              unit="1ZE"
              size="price"
              signed
              showUnit={false}
              showGlyph={false}
              color={totalRealizedGbp >= 0 ? colors.coownUp : colors.coownDown}
            />
          </View>
        )}
      </View>

      {/* U42: This is cost-vs-value, not historical performance. Historical
          returns require valuation records and cash flows from the backend.
          Until those exist, this note makes the limitation explicit rather
          than implying a time-series return. */}
      <Text style={[styles.historicalNote, { color: colors.textMuted }]} numberOfLines={2}>
        Historical performance requires valuation records
      </Text>
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
  barsWrap: {
    gap: Space.sm + 2,
    marginBottom: Space.md,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  barLabel: {
    width: 40,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  barTrack: {
    flex: 1,
    height: Space.xs,
    borderRadius: RadiusRoleValue.compactControl,
    overflow: 'hidden',
  },
  barFill: {
    height: Space.xs,
    borderRadius: RadiusRoleValue.compactControl,
  },
  barValue: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.meta.letterSpacing,
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
  },
  pnlRows: {
    gap: 0,
  },
  pnlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Space.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pnlLabel: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: TypographyV2.body.fontFamily,
  },
  pnlRight: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Space.sm,
  },
  // U42: Historical performance limitation note
  historicalNote: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    marginTop: Space.sm,
  },
});
