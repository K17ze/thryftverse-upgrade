import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Space, FontFamily, Numeric } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { useAppTheme } from '../../theme/ThemeContext';
import { formatCoOwnIze } from '../../utils/currency';

/**
 * Market book row — best bid / lowest ask summary inside the
 * market details transaction surface. Tabular numerals, aligned
 * values, restrained colour (no green/red pill per row).
 * Extracted verbatim from AssetDetailScreen; behaviour unchanged.
 */
export interface MarketBookRowProps {
  bestBid: { unitPriceGbp: number; units: number | null | undefined } | null;
  bestAsk: { unitPriceGbp: number; units: number | null | undefined } | null;
}

export function MarketBookRow({ bestBid, bestAsk }: MarketBookRowProps) {
  const { colors } = useAppTheme();

  return (
    <View style={[styles.marketBookRow, { borderTopColor: colors.border }]}>
      <View style={styles.marketBookSide}>
        <Text style={[styles.marketBookLabel, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.4}>Highest bid</Text>
        <Text style={[styles.marketBookValue, { color: colors.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82} maxFontSizeMultiplier={1.3}>
          {bestBid?.unitPriceGbp != null ? `${formatCoOwnIze(bestBid.unitPriceGbp)} × ${bestBid.units ?? 0}` : 'No bid'}
        </Text>
      </View>
      <View style={[styles.marketBookDivider, { backgroundColor: colors.border }]} />
      <View style={styles.marketBookSide}>
        <Text style={[styles.marketBookLabel, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.4}>Lowest ask</Text>
        <Text style={[styles.marketBookValue, { color: colors.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82} maxFontSizeMultiplier={1.3}>
          {bestAsk?.unitPriceGbp != null ? `${formatCoOwnIze(bestAsk.unitPriceGbp)} × ${bestAsk.units ?? 0}` : 'No ask'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  marketBookRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: Space.lg,
    paddingTop: Space.lg,
  },
  marketBookSide: {
    flex: 1,
    gap: Space.xs,
  },
  marketBookDivider: {
    width: StyleSheet.hairlineWidth,
    marginHorizontal: Space.sm,
  },
  marketBookLabel: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  marketBookValue: {
    fontSize: Numeric.priceList.size,
    lineHeight: Numeric.priceList.lineHeight,
    fontFamily: FontFamily.bold,
    letterSpacing: Numeric.priceList.letterSpacing,
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
  },
});
