import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, Type, Typography } from '../../theme/designTokens';
import { CachedImage } from '../CachedImage';

export type CoOwnReceiptStatus = 'pending' | 'open' | 'partially_filled' | 'filled' | 'cancelled' | 'rejected' | 'expired';

export interface CoOwnTradeReceiptProps {
  imageUri?: string | null;
  title: string;
  orderId?: string | number;
  side: 'buy' | 'sell';
  orderType: 'market' | 'limit';
  units: number;
  filledUnits?: number;
  remainingUnits?: number;
  unitPriceLabel: string;
  limitPriceLabel?: string;
  grossLabel: string;
  feeLabel: string;
  totalLabel: string;
  totalCaption: string;
  settlementLabel: string;
  status: CoOwnReceiptStatus;
  timestamp?: string;
}

const STATUS_CONFIG: Record<CoOwnReceiptStatus, { label: string; icon: string; positive: boolean }> = {
  pending: { label: 'Pending', icon: 'time-outline', positive: false },
  open: { label: 'Open', icon: 'hourglass-outline', positive: true },
  partially_filled: { label: 'Partially filled', icon: 'swap-horizontal-outline', positive: true },
  filled: { label: 'Filled', icon: 'checkmark-circle', positive: true },
  cancelled: { label: 'Cancelled', icon: 'close-circle', positive: false },
  rejected: { label: 'Rejected', icon: 'alert-circle', positive: false },
  expired: { label: 'Expired', icon: 'time-outline', positive: false },
};

export function CoOwnTradeReceipt({
  imageUri,
  title,
  orderId,
  side,
  orderType,
  units,
  filledUnits,
  remainingUnits,
  unitPriceLabel,
  limitPriceLabel,
  grossLabel,
  feeLabel,
  totalLabel,
  totalCaption,
  settlementLabel,
  status,
  timestamp,
}: CoOwnTradeReceiptProps) {
  const { colors } = useAppTheme();
  const isBuy = side === 'buy';
  const statusCfg = STATUS_CONFIG[status];
  const statusColor = statusCfg.positive ? colors.success : colors.textSecondary;

  return (
    <View style={styles.wrap}>
      {/* Status header */}
      <View style={styles.statusHeader}>
        <View style={[styles.statusIconWrap, { backgroundColor: statusColor + '22' }]}>
          <Ionicons name={statusCfg.icon as any} size={28} color={statusColor} />
        </View>
        <Text style={[styles.statusTitle, { color: colors.textPrimary }]}>{statusCfg.label}</Text>
        {timestamp ? (
          <Text style={[styles.timestamp, { color: colors.textMuted }]}>{timestamp}</Text>
        ) : null}
      </View>

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
          <View style={styles.productMeta}>
            <View style={[styles.sidePill, { backgroundColor: isBuy ? colors.success + '22' : colors.danger + '22' }]}>
              <Text style={[styles.sideText, { color: isBuy ? colors.success : colors.danger }]}>
                {isBuy ? 'BUY' : 'SELL'}
              </Text>
            </View>
            <Text style={[styles.orderType, { color: colors.textSecondary }]}>
              {orderType === 'limit' ? 'Limit order' : 'Market order'}
            </Text>
          </View>
        </View>
      </View>

      {/* Receipt details */}
      <View style={[styles.receiptCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={[styles.receiptRow, { borderColor: colors.border }]}>
          <Text style={[styles.receiptLabel, { color: colors.textMuted }]}>Units</Text>
          <Text style={[styles.receiptValue, { color: colors.textPrimary }]}>{units}</Text>
        </View>
        {filledUnits != null ? (
          <View style={[styles.receiptRow, { borderColor: colors.border }]}>
            <Text style={[styles.receiptLabel, { color: colors.textMuted }]}>Filled</Text>
            <Text style={[styles.receiptValue, { color: colors.textPrimary }]}>{filledUnits}</Text>
          </View>
        ) : null}
        {remainingUnits != null ? (
          <View style={[styles.receiptRow, { borderColor: colors.border }]}>
            <Text style={[styles.receiptLabel, { color: colors.textMuted }]}>Remaining</Text>
            <Text style={[styles.receiptValue, { color: colors.textPrimary }]}>{remainingUnits}</Text>
          </View>
        ) : null}
        <View style={[styles.receiptRow, { borderColor: colors.border }]}>
          <Text style={[styles.receiptLabel, { color: colors.textMuted }]}>Unit price</Text>
          <Text style={[styles.receiptValue, { color: colors.textPrimary }]}>{unitPriceLabel}</Text>
        </View>
        {orderType === 'limit' && limitPriceLabel ? (
          <View style={[styles.receiptRow, { borderColor: colors.border }]}>
            <Text style={[styles.receiptLabel, { color: colors.textMuted }]}>Limit price</Text>
            <Text style={[styles.receiptValue, { color: colors.textPrimary }]}>{limitPriceLabel}</Text>
          </View>
        ) : null}
        <View style={[styles.receiptRow, { borderColor: colors.border }]}>
          <Text style={[styles.receiptLabel, { color: colors.textMuted }]}>Gross</Text>
          <Text style={[styles.receiptValue, { color: colors.textPrimary }]}>{grossLabel}</Text>
        </View>
        <View style={[styles.receiptRow, { borderColor: colors.border }]}>
          <Text style={[styles.receiptLabel, { color: colors.textMuted }]}>Fee</Text>
          <Text style={[styles.receiptValue, { color: colors.textSecondary }]}>{feeLabel}</Text>
        </View>
        <View style={[styles.receiptRow, { borderColor: colors.border }]}>
          <Text style={[styles.receiptLabel, { color: colors.textMuted }]}>Settlement</Text>
          <Text style={[styles.receiptValue, { color: colors.textSecondary }]}>{settlementLabel}</Text>
        </View>
        {orderId != null ? (
          <View style={[styles.receiptRow, { borderColor: colors.border }]}>
            <Text style={[styles.receiptLabel, { color: colors.textMuted }]}>Order ID</Text>
            <Text style={[styles.receiptValue, { color: colors.textMuted }]}>#{orderId}</Text>
          </View>
        ) : null}
        <View style={styles.totalRow}>
          <View>
            <Text style={[styles.totalLabel, { color: colors.textPrimary }]}>
              {isBuy ? 'Total cost' : 'Net proceeds'}
            </Text>
            <Text style={[styles.totalCaption, { color: colors.textMuted }]}>{totalCaption}</Text>
          </View>
          <Text style={[styles.totalValue, { color: colors.textPrimary }]}>{totalLabel}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: Space.md,
  },
  statusHeader: {
    alignItems: 'center',
    gap: Space.xs,
    paddingVertical: Space.md,
  },
  statusIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Space.xs,
  },
  statusTitle: {
    fontSize: Type.title.size,
    fontFamily: Typography.family.bold,
    letterSpacing: -0.5,
  },
  timestamp: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
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
    gap: Space.xs,
  },
  productTitle: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
    lineHeight: 20,
    letterSpacing: -0.2,
  },
  productMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  sidePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  sideText: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.bold,
    letterSpacing: 0.5,
  },
  orderType: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
  },
  receiptCard: {
    borderRadius: Radius.lg,
    borderWidth: 0.5,
    padding: Space.md,
    gap: 0,
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  receiptLabel: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
  },
  receiptValue: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Space.md,
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
});
