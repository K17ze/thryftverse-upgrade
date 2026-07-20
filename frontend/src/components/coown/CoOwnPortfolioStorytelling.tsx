/**
 * CoOwnPortfolioStorytelling — premium-of-last/NAV explanation card.
 *
 * The truth-telling line that stops users reading a market premium
 * as an appraisal gain. Explains the difference between market price
 * (last trade) and fundamental value (NAV), and what the premium
 * means.
 *
 * Source §3.4, §7.5, §11.7.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, Type, Typography } from '../../theme/designTokens';

export interface CoOwnPortfolioStorytellingProps {
  /** Premium of last/NAV percentage (positive = market above NAV). */
  premiumPct: number | null;
  /** Last price label. */
  lastPriceLabel?: string;
  /** NAV per unit label. */
  navPerUnitLabel?: string;
  /** NAV valuation date. */
  navValuedAt?: string;
  /** Mark source label (e.g. "Last trade"). */
  markSourceLabel?: string;
  /** Mark age label (e.g. "3h ago"). */
  markAgeLabel?: string;
  /** Whether the mark is stale (>24h). */
  isStaleMark?: boolean;
  /** Compact variant — for inline use in position cards. */
  compact?: boolean;
}

export function CoOwnPortfolioStorytelling({
  premiumPct,
  lastPriceLabel,
  navPerUnitLabel,
  navValuedAt,
  markSourceLabel,
  markAgeLabel,
  isStaleMark,
  compact,
}: CoOwnPortfolioStorytellingProps) {
  const { colors } = useAppTheme();

  const hasPremium = premiumPct != null;
  const isPositivePremium = (premiumPct ?? 0) > 0;
  const isNegativePremium = (premiumPct ?? 0) < 0;

  // Explanation text based on premium direction
  const explanation = !hasPremium
    ? 'Market price and fundamental value (NAV) are not yet available for comparison.'
    : isPositivePremium
      ? `The market is trading ${Math.abs(premiumPct!).toFixed(1)}% above the latest independent valuation (NAV). This premium reflects market demand — it is not an appraisal gain. The NAV is the fundamental value; the last trade price is what the market is currently paying.`
      : isNegativePremium
        ? `The market is trading ${Math.abs(premiumPct!).toFixed(1)}% below the latest independent valuation (NAV). This discount may reflect thin liquidity or near-term uncertainty — it is not a loss in fundamental value.`
        : `The market is trading in line with the latest independent valuation (NAV).`;

  return (
    <View style={[
      styles.container,
      { backgroundColor: colors.surface, borderColor: colors.border },
      compact && styles.containerCompact,
    ]}>
      {/* Header */}
      <View style={styles.headerRow}>
        <Ionicons name="information-circle-outline" size={14} color={colors.textMuted} />
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
          Market price vs fundamental value
        </Text>
      </View>

      {/* Comparison row */}
      {(lastPriceLabel || navPerUnitLabel) && (
        <View style={styles.comparisonRow}>
          {lastPriceLabel && (
            <View style={styles.comparisonItem}>
              <Text style={[styles.comparisonLabel, { color: colors.textMuted }]} numberOfLines={1}>
                Last trade
              </Text>
              <Text style={[styles.comparisonValue, { color: colors.textPrimary }]} numberOfLines={1}>
                {lastPriceLabel}
              </Text>
              {markAgeLabel && (
                <Text style={[styles.comparisonAge, { color: isStaleMark ? colors.warning : colors.textMuted }]} numberOfLines={1}>
                  {markSourceLabel ? `${markSourceLabel} · ` : ''}{markAgeLabel}
                </Text>
              )}
            </View>
          )}
          {navPerUnitLabel && (
            <View style={styles.comparisonItem}>
              <Text style={[styles.comparisonLabel, { color: colors.textMuted }]} numberOfLines={1}>
                NAV/unit
              </Text>
              <Text style={[styles.comparisonValue, { color: colors.textPrimary }]} numberOfLines={1}>
                {navPerUnitLabel}
              </Text>
              {navValuedAt && (
                <Text style={[styles.comparisonAge, { color: colors.textMuted }]} numberOfLines={1}>
                  valued {navValuedAt}
                </Text>
              )}
            </View>
          )}
        </View>
      )}

      {/* Premium badge */}
      {hasPremium && (
        <View style={[
          styles.premiumBadge,
          {
            backgroundColor: isPositivePremium
              ? colors.success + '12'
              : isNegativePremium
                ? colors.danger + '12'
                : colors.surfaceAlt,
            borderColor: isPositivePremium
              ? colors.success + '40'
              : isNegativePremium
                ? colors.danger + '40'
                : colors.border,
          },
        ]}>
          <Text style={[
            styles.premiumLabel,
            { color: colors.textMuted },
          ]}>
            Premium last/NAV
          </Text>
          <Text style={[
            styles.premiumValue,
            {
              color: isPositivePremium
                ? colors.success
                : isNegativePremium
                  ? colors.danger
                  : colors.textSecondary,
            },
          ]}>
            {isPositivePremium ? '+' : ''}{premiumPct!.toFixed(1)}%
          </Text>
          <Text style={[styles.premiumGlyph, {
            color: isPositivePremium ? colors.success : isNegativePremium ? colors.danger : colors.textSecondary,
          }]}>
            {isPositivePremium ? '▲' : isNegativePremium ? '▼' : '−'}
          </Text>
        </View>
      )}

      {/* Explanation */}
      <Text style={[styles.explanation, { color: colors.textSecondary }]}>
        {explanation}
      </Text>

      {/* Stale mark warning */}
      {isStaleMark && (
        <View style={[styles.staleWarning, { backgroundColor: colors.warning + '12' }]}>
          <Ionicons name="time-outline" size={12} color={colors.warning} />
          <Text style={[styles.staleWarningText, { color: colors.warning }]}>
            Mark is stale ({markAgeLabel}). The last trade was more than 24h ago — treat the price with caution.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Space.md,
    gap: Space.sm,
  },
  containerCompact: {
    padding: Space.sm,
    gap: Space.xs,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  headerTitle: {
    fontSize: Type.bodyEmphasis.size,
    lineHeight: Type.bodyEmphasis.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.bodyEmphasis.letterSpacing,
  },
  comparisonRow: {
    flexDirection: 'row',
    gap: Space.md,
  },
  comparisonItem: {
    flex: 1,
    gap: 2,
  },
  comparisonLabel: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.medium,
    letterSpacing: Type.metaElevated.letterSpacing,
    textTransform: 'uppercase',
  },
  comparisonValue: {
    fontSize: Type.bodyEmphasis.size,
    lineHeight: Type.bodyEmphasis.lineHeight,
    fontFamily: Typography.family.bold,
    letterSpacing: Type.bodyEmphasis.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
  comparisonAge: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.meta.letterSpacing,
  },
  premiumBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs + 2,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  premiumLabel: {
    flex: 1,
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.meta.letterSpacing,
  },
  premiumValue: {
    fontSize: Type.bodyEmphasis.size,
    lineHeight: Type.bodyEmphasis.lineHeight,
    fontFamily: Typography.family.bold,
    letterSpacing: Type.bodyEmphasis.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
  premiumGlyph: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.bold,
  },
  explanation: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight + 2,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.caption.letterSpacing,
  },
  staleWarning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.xs,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs + 2,
    borderRadius: Radius.sm,
  },
  staleWarningText: {
    flex: 1,
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight + 1,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.meta.letterSpacing,
  },
});

export default CoOwnPortfolioStorytelling;
