import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Space, FontFamily } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { useAppTheme } from '../../theme/ThemeContext';
import { formatCoOwnIze } from '../../utils/currency';

/**
 * Holder position summary — quiet ownership display with P&L.
 * Shows "Your position", average entry, units owned, percentage,
 * and unrealized P&L when available.
 * Extracted verbatim from AssetDetailScreen; behaviour unchanged.
 */
export interface HolderPositionSummaryProps {
  yourUnits: number;
  viewerPct: number;
  avgEntryPriceGbp: number | null;
  unrealizedPnlGbp: number | null;
  unrealizedPnlPct: number | null;
}

export function HolderPositionSummary({
  yourUnits,
  viewerPct,
  avgEntryPriceGbp,
  unrealizedPnlGbp,
  unrealizedPnlPct,
}: HolderPositionSummaryProps) {
  const { colors } = useAppTheme();

  return (
    <View style={styles.holderPositionSummary}>
      <View style={styles.holderPositionLeft}>
        <Text style={[styles.holderPositionText, { color: colors.textSecondary }]}>
          Your position
        </Text>
        {avgEntryPriceGbp != null && (
          <Text style={[styles.holderPositionText, { color: colors.textSecondary }]}>
            Avg. entry {formatCoOwnIze(avgEntryPriceGbp)}
          </Text>
        )}
      </View>
      <View style={styles.holderPositionRight}>
        <Text style={[styles.holderPositionText, { color: colors.textSecondary, textAlign: 'right' }]}>
          You own {yourUnits} units · {viewerPct.toFixed(1)}%
        </Text>
        {unrealizedPnlGbp != null && unrealizedPnlPct != null ? (
          <Text style={[
            styles.holderPositionText,
            {
              color: unrealizedPnlGbp >= 0 ? colors.coownUp : colors.coownDown,
              textAlign: 'right',
              fontFamily: FontFamily.semibold,
            },
          ]}>
            {unrealizedPnlGbp >= 0 ? '+' : ''}{formatCoOwnIze(unrealizedPnlGbp)} ({unrealizedPnlPct >= 0 ? '+' : ''}{unrealizedPnlPct.toFixed(1)}%)
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  holderPositionSummary: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Space.md,
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.md,
  },
  holderPositionLeft: {
    gap: 2,
    flexShrink: 1,
  },
  holderPositionRight: {
    gap: 2,
    flexShrink: 1,
    alignItems: 'flex-end',
  },
  holderPositionText: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: FontFamily.medium,
    letterSpacing: TypographyV2.body.letterSpacing,
  },
});
