import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, Type, Typography } from '../../theme/designTokens';
import { CachedImage } from '../CachedImage';

export type CoOwnTradeSide = 'buy' | 'sell';
export type CoOwnTradeMode = 'market' | 'limit';

export interface CoOwnTradeComposerProps {
  imageUri?: string | null;
  title: string;
  side: CoOwnTradeSide;
  mode: CoOwnTradeMode;
  units: number;
  unitPriceLabel: string;
  grossLabel: string;
  feeLabel: string;
  totalLabel: string;
  totalCaption: string;
  settlementLabel: string;
  availableUnits: number;
  sellableUnits: number;
  maxUnits: number;
}

export function CoOwnTradeComposer({
  imageUri,
  title,
  side,
  mode,
  units,
  unitPriceLabel,
  grossLabel,
  feeLabel,
  totalLabel,
  totalCaption,
  settlementLabel,
  availableUnits,
  sellableUnits,
  maxUnits,
}: CoOwnTradeComposerProps) {
  const { colors } = useAppTheme();
  const isBuy = side === 'buy';
  const maxForSide = isBuy ? Math.min(availableUnits, maxUnits) : sellableUnits;

  return (
    <View style={styles.wrap}>
      {/* Product identity */}
      <View style={[styles.productCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.imageWrap}>
          {imageUri ? (
            <CachedImage uri={imageUri} style={styles.image} contentFit="cover" transition={250} />
          ) : (
            <View style={[styles.image, styles.imageFallback, { backgroundColor: colors.surfaceAlt }]}>
              <Ionicons name="cube-outline" size={20} color={colors.textMuted} />
            </View>
          )}
        </View>
        <View style={styles.productBody}>
          <Text style={[styles.productTitle, { color: colors.textPrimary }]} numberOfLines={2}>{title}</Text>
          <Text style={[styles.productPrice, { color: colors.textSecondary }]}>{unitPriceLabel} / unit</Text>
        </View>
        <View style={[styles.sidePill, { backgroundColor: isBuy ? colors.success + '22' : colors.danger + '22' }]}>
          <Text style={[styles.sideText, { color: isBuy ? colors.success : colors.danger }]}>
            {isBuy ? 'BUY' : 'SELL'}
          </Text>
        </View>
      </View>

      {/* Availability */}
      <View style={[styles.availRow, { borderColor: colors.border }]}>
        <View style={styles.availItem}>
          <Text style={[styles.availLabel, { color: colors.textMuted }]}>
            {isBuy ? 'Available units' : 'Your units'}
          </Text>
          <Text style={[styles.availValue, { color: colors.textPrimary }]}>
            {isBuy ? availableUnits : sellableUnits}
          </Text>
        </View>
        <View style={[styles.availItem, { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.border }]}>
          <Text style={[styles.availLabel, { color: colors.textMuted }]}>Max per order</Text>
          <Text style={[styles.availValue, { color: colors.textPrimary }]}>{maxForSide}</Text>
        </View>
      </View>

      {/* Quote summary */}
      <View style={[styles.quoteCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.quoteRow}>
          <Text style={[styles.quoteLabel, { color: colors.textSecondary }]}>
            {units} units × {unitPriceLabel}
          </Text>
          <Text style={[styles.quoteValue, { color: colors.textPrimary }]}>{grossLabel}</Text>
        </View>
        <View style={[styles.quoteRow, { borderColor: colors.border }]}>
          <Text style={[styles.quoteLabel, { color: colors.textMuted }]}>Fee (1%)</Text>
          <Text style={[styles.quoteValue, { color: colors.textSecondary }]}>{feeLabel}</Text>
        </View>
        <View style={[styles.totalRow, { borderColor: colors.border }]}>
          <View>
            <Text style={[styles.totalLabel, { color: colors.textPrimary }]}>
              {isBuy ? 'Total cost' : 'Net proceeds'}
            </Text>
            <Text style={[styles.totalCaption, { color: colors.textMuted }]}>{totalCaption}</Text>
          </View>
          <Text style={[styles.totalValue, { color: colors.textPrimary }]}>{totalLabel}</Text>
        </View>
      </View>

      {/* Settlement */}
      <View style={styles.settlementRow}>
        <Ionicons name="card-outline" size={14} color={colors.textMuted} />
        <Text style={[styles.settlementText, { color: colors.textSecondary }]}>
          Settlement: {settlementLabel}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: Space.md,
  },
  productCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    borderRadius: Radius.lg,
    borderWidth: 0.5,
    padding: Space.md,
  },
  imageWrap: {
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  image: {
    width: 56,
    height: 56,
  },
  imageFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  productBody: {
    flex: 1,
    gap: 3,
  },
  productTitle: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
    lineHeight: 20,
    letterSpacing: -0.2,
  },
  productPrice: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
  },
  sidePill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.full,
  },
  sideText: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.bold,
    letterSpacing: 0.5,
  },
  availRow: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: Space.sm,
  },
  availItem: {
    flex: 1,
    paddingHorizontal: Space.xs,
    alignItems: 'center',
    gap: 3,
  },
  availLabel: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.medium,
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  availValue: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.bold,
  },
  quoteCard: {
    borderRadius: Radius.lg,
    borderWidth: 0.5,
    padding: Space.md,
    gap: Space.sm,
  },
  quoteRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  quoteLabel: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
  },
  quoteValue: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  totalLabel: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.bold,
  },
  totalCaption: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.regular,
    marginTop: 2,
  },
  totalValue: {
    fontSize: Type.priceLarge.size,
    fontFamily: Typography.family.bold,
    letterSpacing: -0.5,
  },
  settlementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  settlementText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
  },
});
