import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, Type, Typography } from '../../theme/designTokens';
import { CachedImage } from '../CachedImage';
import { CoOwnNumericText } from '../ui/CoOwnNumericText';
import { CoOwnDepthPreview } from './CoOwnDepthPreview';

export type CoOwnTradeSide = 'buy' | 'sell';
export type CoOwnTradeMode = 'market' | 'limit';

/** Phase 2.5: exchange-grade order type. */
export type CoOwnTicketOrderType = 'protected_instant' | 'limit';

/** Phase 2.5: duration for resting orders. */
export type CoOwnTicketDuration = 'GFD' | 'GTC90';

/** Phase 2.5: estimated fill from walking the book. */
export interface CoOwnFillEstimate {
  avgFillPrice: number;
  worstPrice: number;
  unitsFilled: number;
  slippageBeyondDepth: boolean;
  gross: number;
}

/** Phase 2.5: depth context for the impact preview. */
export interface CoOwnDepthContext {
  orderUnits: number;
  depthUnits: number;
  slippageBeyondDepth: boolean;
  midPrice: number;
}

/** Phase 2.5: post-trade position preview. */
export interface CoOwnPostTradePreview {
  unitsAfter: number;
  ownershipPct: number;
  outstandingUnits: number;
}

export interface CoOwnTradeComposerProps {
  imageUri?: string | null;
  title: string;
  side: CoOwnTradeSide;
  mode: CoOwnTradeMode;
  units: number;
  unitPriceLabel: string;
  grossLabel: React.ReactNode;
  feeLabel: React.ReactNode;
  totalLabel: React.ReactNode;
  totalCaption: string;
  settlementLabel: string;
  availableUnits: number;
  sellableUnits: number;
  maxUnits: number;
  // ── Phase 2.5: exchange-grade additions (all optional — fail closed) ──
  /** Order type: protected_instant or limit. */
  orderType?: CoOwnTicketOrderType;
  /** Protection/limit price per unit. */
  protectionPrice?: number;
  /** Reservation breakdown from computeReservation(). */
  reservation?: {
    totalReserve1ZE: number;
    totalReserveUnits: number;
  };
  /** Estimated fill from walking the book. */
  fillEstimate?: CoOwnFillEstimate;
  /** Depth context for impact preview. */
  depthContext?: CoOwnDepthContext;
  /** Duration for resting orders. */
  duration?: CoOwnTicketDuration;
  /** Post-trade position preview. */
  postTradePreview?: CoOwnPostTradePreview;
  /** Rights version badge. */
  rightsVersion?: string;
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
  orderType,
  protectionPrice,
  reservation,
  fillEstimate,
  depthContext,
  duration,
  postTradePreview,
  rightsVersion,
}: CoOwnTradeComposerProps) {
  const { colors } = useAppTheme();
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const isBuy = side === 'buy';
  const maxForSide = isBuy ? Math.min(availableUnits, maxUnits) : sellableUnits;

  // Reservation line text — from computeReservation() (client-side estimate).
  // Labelled as an estimate, not an authoritative server reservation, per
  // spec 10 §1: the actual reservation is confirmed by the backend at order
  // submission, not by this local calculation.
  const reservationLine = reservation
    ? isBuy
      ? `Est. ${reservation.totalReserve1ZE.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 1ZE required (confirmed at review)`
      : `Est. ${reservation.totalReserveUnits} units to sell (confirmed at review)`
    : null;

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
          <Text style={[styles.productPrice, { color: colors.textSecondary }]} numberOfLines={1}>{unitPriceLabel} / unit</Text>
        </View>
        <View style={[styles.sidePill, { backgroundColor: isBuy ? colors.success + '22' : colors.danger + '22' }]}>
          <Text style={[styles.sideText, { color: isBuy ? colors.success : colors.danger }]} numberOfLines={1}>
            {isBuy ? 'BUY' : 'SELL'}
          </Text>
        </View>
      </View>

      {/* Availability */}
      <View style={[styles.availRow, { borderColor: colors.border }]}>
        <View style={styles.availItem}>
          <Text style={[styles.availLabel, { color: colors.textMuted }]} numberOfLines={1}>
            {isBuy ? 'Available units' : 'Your units'}
          </Text>
          <Text style={[styles.availValue, { color: colors.textPrimary }]} numberOfLines={1}>
            {isBuy ? availableUnits : sellableUnits}
          </Text>
        </View>
        <View style={[styles.availItem, { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.border }]}>
          <Text style={[styles.availLabel, { color: colors.textMuted }]} numberOfLines={1}>Max per order</Text>
          <Text style={[styles.availValue, { color: colors.textPrimary }]} numberOfLines={1}>{maxForSide}</Text>
        </View>
      </View>

      {/* Quote summary */}
      <View style={[styles.quoteCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.quoteRow}>
          <Text style={[styles.quoteLabel, { color: colors.textSecondary }]} numberOfLines={1}>
            {units} units × {unitPriceLabel}
          </Text>
          <View style={styles.quoteValueWrap}>{grossLabel}</View>
        </View>
        <View style={[styles.quoteRow, { borderColor: colors.border }]}>
          <Text style={[styles.quoteLabel, { color: colors.textMuted }]} numberOfLines={1}>Fee (1%)</Text>
          <View style={styles.quoteValueWrap}>{feeLabel}</View>
        </View>
        <View style={[styles.totalRow, { borderColor: colors.border }]}>
          <View style={styles.totalLabelWrap}>
            <Text style={[styles.totalLabel, { color: colors.textPrimary }]} numberOfLines={1}>
              {isBuy ? 'Total cost' : 'Net proceeds'}
            </Text>
            <Text style={[styles.totalCaption, { color: colors.textMuted }]} numberOfLines={1}>{totalCaption}</Text>
          </View>
          <View style={styles.totalValueWrap}>{totalLabel}</View>
        </View>

        {/* Reservation line — from computeReservation() */}
        {reservationLine && (
          <View style={[styles.reservationRow, { borderColor: colors.border }]}>
            <Ionicons name="lock-closed-outline" size={13} color={colors.textMuted} />
            <Text style={[styles.reservationText, { color: colors.textSecondary }]} numberOfLines={2}>
              {reservationLine}
            </Text>
          </View>
        )}
      </View>

      {/* Expandable details — progressive disclosure */}
      {(fillEstimate || depthContext || duration || postTradePreview) && (
        <Pressable
          style={[styles.detailsToggle, { borderColor: colors.border }]}
          onPress={() => setDetailsExpanded((prev) => !prev)}
          accessibilityRole="button"
          accessibilityLabel={detailsExpanded ? 'Collapse details' : 'Expand details'}
          accessibilityState={{ expanded: detailsExpanded }}
        >
          <Text style={[styles.detailsToggleText, { color: colors.textSecondary }]}>
            Details
          </Text>
          <Ionicons
            name={detailsExpanded ? 'chevron-up-outline' : 'chevron-down-outline'}
            size={16}
            color={colors.textSecondary}
          />
        </Pressable>
      )}

      {detailsExpanded && (
        <View style={[styles.detailsSection, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {/* Estimated fill + depth impact are computed from a deterministic
              illustrative book (Phase 2.5 — no live order book exists yet).
              Label honestly so this cannot be mistaken for real market depth. */}
          {(fillEstimate || depthContext) && (
            <View style={styles.illustrativeNoteWrap}>
              <Text style={[styles.illustrativeNote, { color: colors.textMuted }]}>
                Illustrative — not live market data. Actual fill depends on the real order book at execution.
              </Text>
            </View>
          )}

          {/* Estimated fill */}
          {fillEstimate && (
            <View style={styles.detailBlock}>
              <Text style={[styles.detailHeader, { color: colors.textMuted }]}>Estimated fill (illustrative)</Text>
              <DetailRow label="Avg fill price" value={`${fillEstimate.avgFillPrice.toFixed(2)} 1ZE`} colors={colors} />
              <DetailRow label="Worst price" value={`${fillEstimate.worstPrice.toFixed(2)} 1ZE`} colors={colors} />
              <DetailRow label="Units" value={String(fillEstimate.unitsFilled)} colors={colors} />
              <DetailRow label="Gross" value={fillEstimate.gross.toFixed(2)} colors={colors} />
              <DetailRow label="Fee (1%)" value={feeLabel} colors={colors} />
              <DetailRow label="Total" value={totalLabel} colors={colors} emphasis />
            </View>
          )}

          {/* Depth impact */}
          {depthContext && (
            <View style={styles.detailBlock}>
              <CoOwnDepthPreview
                orderUnits={depthContext.orderUnits}
                depthUnits={depthContext.depthUnits}
                slippageBeyondDepth={depthContext.slippageBeyondDepth}
                midPrice={depthContext.midPrice}
              />
            </View>
          )}

          {/* Duration */}
          {duration && (
            <View style={styles.detailBlock}>
              <Text style={[styles.detailHeader, { color: colors.textMuted }]}>Duration</Text>
              <View style={styles.durationRow}>
                <View style={[styles.durationChip, { backgroundColor: duration === 'GFD' ? colors.brand : colors.surfaceAlt }]}>
                  <Text style={[styles.durationText, { color: duration === 'GFD' ? colors.background : colors.textSecondary }]}>
                    GFD
                  </Text>
                </View>
                <View style={[styles.durationChip, { backgroundColor: duration === 'GTC90' ? colors.brand : colors.surfaceAlt }]}>
                  <Text style={[styles.durationText, { color: duration === 'GTC90' ? colors.background : colors.textSecondary }]}>
                    GTC 90d
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* After this order */}
          {postTradePreview && (
            <View style={styles.detailBlock}>
              <Text style={[styles.detailHeader, { color: colors.textMuted }]}>After this order</Text>
              <Text style={[styles.postTradeText, { color: colors.textPrimary }]}>
                {postTradePreview.unitsAfter} units · {postTradePreview.ownershipPct.toFixed(2)}% of outstanding
              </Text>
              <Text style={[styles.postTradeDenom, { color: colors.textMuted }]}>
                {postTradePreview.outstandingUnits.toLocaleString('en-GB')} outstanding
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Settlement + rights version */}
      <View style={styles.footerRow}>
        <View style={styles.settlementRow}>
          <Ionicons name="card-outline" size={14} color={colors.textMuted} />
          <Text style={[styles.settlementText, { color: colors.textSecondary }]} numberOfLines={1}>
            Settlement: {settlementLabel}
          </Text>
        </View>
        {rightsVersion && (
          <View style={[styles.rightsChip, { backgroundColor: colors.surfaceAlt }]}>
            <Text style={[styles.rightsChipText, { color: colors.textMuted }]} numberOfLines={1}>
              {rightsVersion}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

/** A detail row — label on left, value on right. */
function DetailRow({
  label,
  value,
  colors,
  emphasis,
}: {
  label: string;
  value: React.ReactNode;
  colors: ReturnType<typeof useAppTheme>['colors'];
  emphasis?: boolean;
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={[styles.detailRowLabel, { color: colors.textMuted }]}>{label}</Text>
      {typeof value === 'string' || typeof value === 'number' ? (
        <Text
          style={[
            styles.detailRowValue,
            { color: emphasis ? colors.textPrimary : colors.textSecondary },
            emphasis && { fontFamily: Typography.family.bold },
          ]}
          numberOfLines={1}
        >
          {value}
        </Text>
      ) : (
        <View style={styles.detailRowValueWrap}>{value}</View>
      )}
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
    borderWidth: StyleSheet.hairlineWidth,
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
    minWidth: 0,
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
    borderWidth: StyleSheet.hairlineWidth,
    padding: Space.md,
    gap: Space.sm,
  },
  quoteRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Space.sm,
  },
  quoteLabel: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    flexShrink: 1,
    minWidth: 0,
  },
  quoteValue: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
    flexShrink: 0,
    fontVariant: ['tabular-nums'],
  },
  quoteValueWrap: {
    flexShrink: 0,
    alignItems: 'flex-end',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: Space.sm,
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
  totalValueWrap: {
    flexShrink: 0,
    alignItems: 'flex-end',
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
  // ── Phase 2.5: reservation row ──
  reservationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingTop: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: Space.sm,
  },
  reservationText: {
    flex: 1,
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.medium,
    letterSpacing: Type.body.letterSpacing,
  },
  // ── Phase 2.5: details toggle + section ──
  detailsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    minHeight: 44,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  detailsToggleText: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.medium,
    letterSpacing: Type.body.letterSpacing,
  },
  detailsSection: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Space.md,
    gap: Space.md,
  },
  detailBlock: {
    gap: Space.xs,
  },
  illustrativeNoteWrap: {
    paddingBottom: 2,
  },
  illustrativeNote: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.regular,
    fontStyle: 'italic',
  },
  detailHeader: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.metaElevated.letterSpacing,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 22,
    gap: Space.md,
  },
  detailRowLabel: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.body.letterSpacing,
  },
  detailRowValue: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.body.letterSpacing,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  detailRowValueWrap: {
    alignItems: 'flex-end',
  },
  durationRow: {
    flexDirection: 'row',
    gap: Space.sm,
  },
  durationChip: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs + 2,
    borderRadius: Radius.full,
  },
  durationText: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.meta.letterSpacing,
  },
  postTradeText: {
    fontSize: Type.bodyEmphasis.size,
    lineHeight: Type.bodyEmphasis.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.bodyEmphasis.letterSpacing,
  },
  postTradeDenom: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.meta.letterSpacing,
  },
  // ── Phase 2.5: footer row ──
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.sm,
  },
  rightsChip: {
    paddingHorizontal: Space.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  rightsChipText: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.medium,
    letterSpacing: Type.meta.letterSpacing,
  },
});
