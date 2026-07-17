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
  // ── Phase 2.5: exchange-grade additions (all optional — fail closed) ──
  /** Prominent max-reserved amount (full obligation from computeReservation). */
  maxReservedLabel?: string;
  /** Estimated average fill price. */
  avgFillPriceLabel?: string;
  /** Worst price the order would execute at. */
  worstPriceLabel?: string;
  /** Post-trade position: units after + ownership % of outstanding. */
  postTradeUnits?: number;
  postTradeOwnershipPct?: number;
  postTradeOutstanding?: number;
  /** Local-fiat indication. */
  localFiatLabel?: string;
  localFiatSource?: string;
  /** Market & liquidity warning. */
  marketWarning?: string;
  /** Disclosure version. */
  rightsVersion?: string;
  /** Vehicle name for plain-language explanation. */
  vehicleName?: string;
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
  maxReservedLabel,
  avgFillPriceLabel,
  worstPriceLabel,
  postTradeUnits,
  postTradeOwnershipPct,
  postTradeOutstanding,
  localFiatLabel,
  localFiatSource,
  marketWarning,
  rightsVersion,
  vehicleName,
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
        <Text style={[styles.statusTitle, { color: colors.textPrimary }]} numberOfLines={1}>{statusCfg.label}</Text>
        {timestamp ? (
          <Text style={[styles.timestamp, { color: colors.textMuted }]} numberOfLines={1}>{timestamp}</Text>
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
              <Text style={[styles.sideText, { color: isBuy ? colors.success : colors.danger }]} numberOfLines={1}>
                {isBuy ? 'BUY' : 'SELL'}
              </Text>
            </View>
            <Text style={[styles.orderType, { color: colors.textSecondary }]} numberOfLines={1}>
              {orderType === 'limit' ? 'Limit order' : 'Protected instant'}
            </Text>
          </View>
        </View>
      </View>

      {/* Receipt details */}
      <View style={[styles.receiptCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={[styles.receiptRow, { borderColor: colors.border }]}>
          <Text style={[styles.receiptLabel, { color: colors.textMuted }]} numberOfLines={1}>Side</Text>
          <Text style={[styles.receiptValue, { color: colors.textPrimary }]} numberOfLines={1}>
            {isBuy ? 'BUY' : 'SELL'}
          </Text>
        </View>
        <View style={[styles.receiptRow, { borderColor: colors.border }]}>
          <Text style={[styles.receiptLabel, { color: colors.textMuted }]} numberOfLines={1}>Order type</Text>
          <Text style={[styles.receiptValue, { color: colors.textPrimary }]} numberOfLines={1}>
            {orderType === 'limit' ? 'Limit' : 'Protected instant'}
            {orderType === 'limit' && limitPriceLabel ? ` (${limitPriceLabel})` : ''}
          </Text>
        </View>
        <View style={[styles.receiptRow, { borderColor: colors.border }]}>
          <Text style={[styles.receiptLabel, { color: colors.textMuted }]} numberOfLines={1}>Units</Text>
          <Text style={[styles.receiptValue, { color: colors.textPrimary }]} numberOfLines={1}>{units}</Text>
        </View>
        {filledUnits != null ? (
          <View style={[styles.receiptRow, { borderColor: colors.border }]}>
            <Text style={[styles.receiptLabel, { color: colors.textMuted }]} numberOfLines={1}>Filled</Text>
            <Text style={[styles.receiptValue, { color: colors.textPrimary }]} numberOfLines={1}>{filledUnits}</Text>
          </View>
        ) : null}
        {remainingUnits != null ? (
          <View style={[styles.receiptRow, { borderColor: colors.border }]}>
            <Text style={[styles.receiptLabel, { color: colors.textMuted }]} numberOfLines={1}>Remaining</Text>
            <Text style={[styles.receiptValue, { color: colors.textPrimary }]} numberOfLines={1}>{remainingUnits}</Text>
          </View>
        ) : null}
        {avgFillPriceLabel && (
          <View style={[styles.receiptRow, { borderColor: colors.border }]}>
            <Text style={[styles.receiptLabel, { color: colors.textMuted }]} numberOfLines={1}>Avg fill est.</Text>
            <Text style={[styles.receiptValue, { color: colors.textPrimary }]} numberOfLines={1}>{avgFillPriceLabel}</Text>
          </View>
        )}
        {worstPriceLabel && (
          <View style={[styles.receiptRow, { borderColor: colors.border }]}>
            <Text style={[styles.receiptLabel, { color: colors.textMuted }]} numberOfLines={1}>Worst price</Text>
            <Text style={[styles.receiptValue, { color: colors.textPrimary }]} numberOfLines={1}>{worstPriceLabel}</Text>
          </View>
        )}
        <View style={[styles.receiptRow, { borderColor: colors.border }]}>
          <Text style={[styles.receiptLabel, { color: colors.textMuted }]} numberOfLines={1}>Gross</Text>
          <Text style={[styles.receiptValue, { color: colors.textPrimary }]} numberOfLines={1}>{grossLabel}</Text>
        </View>
        <View style={[styles.receiptRow, { borderColor: colors.border }]}>
          <Text style={[styles.receiptLabel, { color: colors.textMuted }]} numberOfLines={1}>Fee</Text>
          <Text style={[styles.receiptValue, { color: colors.textSecondary }]} numberOfLines={1}>{feeLabel}</Text>
        </View>
        <View style={[styles.receiptRow, { borderColor: colors.border }]}>
          <Text style={[styles.receiptLabel, { color: colors.textMuted }]} numberOfLines={1}>Settlement</Text>
          <Text style={[styles.receiptValue, { color: colors.textSecondary }]} numberOfLines={1}>{settlementLabel}</Text>
        </View>
        {orderId != null ? (
          <View style={[styles.receiptRow, { borderColor: colors.border }]}>
            <Text style={[styles.receiptLabel, { color: colors.textMuted }]} numberOfLines={1}>Order ID</Text>
            <Text style={[styles.receiptValue, { color: colors.textMuted }]} numberOfLines={1}>#{orderId}</Text>
          </View>
        ) : null}
        <View style={styles.totalRow}>
          <View style={styles.totalLabelWrap}>
            <Text style={[styles.totalLabel, { color: colors.textPrimary }]} numberOfLines={1}>
              {isBuy ? 'Total cost' : 'Net proceeds'}
            </Text>
            <Text style={[styles.totalCaption, { color: colors.textMuted }]} numberOfLines={1}>{totalCaption}</Text>
          </View>
          <Text style={[styles.totalValue, { color: colors.textPrimary }]} numberOfLines={1}>{totalLabel}</Text>
        </View>

        {/* Max reserved — prominent (full obligation from computeReservation) */}
        {maxReservedLabel && (
          <View style={[styles.maxReservedRow, { backgroundColor: colors.brand + '12', borderColor: colors.brand + '40' }]}>
            <Ionicons name="lock-closed" size={14} color={colors.brand} />
            <Text style={[styles.maxReservedLabel, { color: colors.textMuted }]} numberOfLines={1}>
              {isBuy ? 'MAX 1ZE RESERVED' : 'UNITS RESERVED'}
            </Text>
            <Text style={[styles.maxReservedValue, { color: colors.textPrimary }]} numberOfLines={1}>
              {maxReservedLabel}
            </Text>
          </View>
        )}
      </View>

      {/* Plain language — what you will own */}
      {postTradeUnits != null && (
        <View style={[styles.plainLanguageCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.plainLanguageHeader, { color: colors.textMuted }]}>Plain language</Text>
          <Text style={[styles.plainLanguageText, { color: colors.textSecondary }]}>
            You will {isBuy ? 'own' : 'hold'} {postTradeUnits} units
            {postTradeOwnershipPct != null && ` (${postTradeOwnershipPct.toFixed(2)}% of outstanding)`}
            {postTradeOutstanding != null && ` of ${postTradeOutstanding.toLocaleString('en-GB')}`}
            {vehicleName ? `, settled in 1ZE. This is a beneficial interest in ${vehicleName}, not title to the underlying asset.` : '.'}
          </Text>
        </View>
      )}

      {/* Local-fiat indication */}
      {localFiatLabel && (
        <View style={styles.localFiatRow}>
          <Ionicons name="cash-outline" size={13} color={colors.textMuted} />
          <Text style={[styles.localFiatText, { color: colors.textSecondary }]} numberOfLines={1}>
            {localFiatLabel}
            {localFiatSource ? ` · ${localFiatSource}` : ''}
          </Text>
        </View>
      )}

      {/* Market & liquidity warning */}
      {marketWarning && (
        <View style={[styles.warningCard, { backgroundColor: colors.warning + '12', borderColor: colors.warning + '40' }]}>
          <View style={styles.warningRow}>
            <Ionicons name="warning-outline" size={14} color={colors.warning} />
            <Text style={[styles.warningTitle, { color: colors.warning }]}>Market & liquidity</Text>
          </View>
          <Text style={[styles.warningText, { color: colors.textSecondary }]}>
            {marketWarning}
          </Text>
        </View>
      )}

      {/* Disclosure */}
      {rightsVersion && (
        <View style={styles.disclosureRow}>
          <Ionicons name="document-text-outline" size={13} color={colors.textMuted} />
          <Text style={[styles.disclosureText, { color: colors.textMuted }]} numberOfLines={1}>
            {rightsVersion} · accepted
          </Text>
        </View>
      )}
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
    minWidth: 0,
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
    gap: Space.md,
  },
  receiptLabel: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    flexShrink: 1,
    minWidth: 0,
  },
  receiptValue: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
    flexShrink: 0,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Space.md,
    gap: Space.md,
  },
  totalLabel: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.bold,
    flexShrink: 1,
    minWidth: 0,
  },
  totalLabelWrap: {
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
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
    flexShrink: 0,
    fontVariant: ['tabular-nums'],
  },
  // ── Phase 2.5: max reserved row ──
  maxReservedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    marginTop: Space.sm,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.sm,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  maxReservedLabel: {
    flex: 1,
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.metaElevated.letterSpacing,
    textTransform: 'uppercase',
  },
  maxReservedValue: {
    fontSize: Type.bodyEmphasis.size,
    lineHeight: Type.bodyEmphasis.lineHeight,
    fontFamily: Typography.family.bold,
    letterSpacing: Type.bodyEmphasis.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
  // ── Phase 2.5: plain language card ──
  plainLanguageCard: {
    borderRadius: Radius.lg,
    borderWidth: 0.5,
    padding: Space.md,
    gap: Space.xs,
  },
  plainLanguageHeader: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.metaElevated.letterSpacing,
    textTransform: 'uppercase',
  },
  plainLanguageText: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight + 2,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.body.letterSpacing,
  },
  // ── Phase 2.5: local-fiat row ──
  localFiatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  localFiatText: {
    flex: 1,
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.caption.letterSpacing,
  },
  // ── Phase 2.5: market warning card ──
  warningCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Space.md,
    gap: Space.xs,
  },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  warningTitle: {
    fontSize: Type.bodyEmphasis.size,
    lineHeight: Type.bodyEmphasis.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.bodyEmphasis.letterSpacing,
  },
  warningText: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight + 2,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.body.letterSpacing,
  },
  // ── Phase 2.5: disclosure row ──
  disclosureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  disclosureText: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.caption.letterSpacing,
  },
});
