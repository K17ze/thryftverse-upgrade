import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, Stroke, FontFamily } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';
import { OrderStatusStepper, OrderStepperStage } from '../orders/OrderStatusStepper';
import { formatShortDateTime } from '../../utils/dateFormat';
import { useAppTranslation } from '../../i18n/useAppTranslation';
import { useFormattedPrice } from '../../hooks/useFormattedPrice';

// ── Types ────────────────────────────────────────────────────────────────────

export type CommerceStateType =
  | 'order_placed'
  | 'payment_confirmed'
  | 'label_created'
  | 'order_shipped'
  | 'order_in_transit'
  | 'order_delivered'
  | 'delivery_confirm_prompt'
  | 'feedback_prompt'
  | 'extension_requested'
  | 'order_cancelled'
  | 'order_refunded'
  | 'order_partially_refunded';

export interface CommerceStateCardProps {
  type: CommerceStateType;
  orderId: string;
  orderShortId?: string;
  itemTitle?: string;
  itemImage?: string | null;
  trackingNumber?: string | null;
  carrier?: string | null;
  /** Dispatch-extension proposal snapshot (extension_requested cards). */
  extensionDays?: number;
  proposedShipBy?: string | null;
  /** Refund amount (GBP) on refund cards — read from card metadata. */
  refundedAmountGbp?: number;
  /** Optional ISO timestamp for when this state event occurred */
  timestamp?: string | null;
  onPress?: () => void;
}

// ── Config ───────────────────────────────────────────────────────────────────

interface StateConfig {
  title: string;
  subtitle: string;
  badgeLabel?: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  iconColor: string;
  stage?: OrderStepperStage;
  isFailure?: boolean;
  failureLabel?: string;
  nextStep?: string;
  /** Footer action label — prompt states get a verb, not "View details". */
  ctaLabel?: string;
}

function getStateConfig(
  type: CommerceStateType,
  colors: ThemeColors,
  t: (key: string, params?: Record<string, unknown>) => string,
  extensionDays?: number,
  proposedShipBy?: string | null,
  refundAmountLabel?: string | null
): StateConfig {
  switch (type) {
    case 'order_placed':
      return {
        title: t('orders.placed'),
        subtitle: t('orders.placedBody'),
        badgeLabel: 'PLACED',
        icon: 'receipt-outline',
        iconColor: colors.brand,
        stage: 'placed',
        nextStep: 'Awaiting payment confirmation',
      };
    case 'payment_confirmed':
      return {
        title: t('orders.paymentConfirmed'),
        subtitle: t('orders.paymentConfirmedBody'),
        badgeLabel: 'PAID',
        icon: 'checkmark-circle-outline',
        iconColor: colors.success,
        stage: 'paid',
        nextStep: 'Seller preparing for dispatch',
      };
    case 'order_shipped':
      return {
        title: t('orders.shipped'),
        subtitle: t('orders.shippedBody'),
        badgeLabel: 'DISPATCHED',
        icon: 'car-outline',
        iconColor: colors.brand,
        stage: 'shipped',
        nextStep: 'In carrier transit',
      };
    case 'order_in_transit':
      return {
        title: t('orders.inTransit'),
        subtitle: t('orders.inTransitBody'),
        badgeLabel: 'IN TRANSIT',
        icon: 'airplane-outline',
        iconColor: colors.brand,
        stage: 'in_transit',
        nextStep: 'Out for delivery',
      };
    case 'order_delivered':
      return {
        title: t('orders.delivered'),
        subtitle: t('orders.deliveredBody'),
        badgeLabel: 'DELIVERED',
        icon: 'checkmark-done-circle-outline',
        iconColor: colors.success,
        stage: 'delivered',
      };
    case 'label_created':
      return {
        title: t('orders.labelCreated'),
        subtitle: t('orders.labelCreatedBody'),
        badgeLabel: 'LABEL',
        icon: 'pricetag-outline',
        iconColor: colors.brand,
        stage: 'paid',
        nextStep: 'Seller dispatching',
      };
    case 'delivery_confirm_prompt':
      return {
        title: t('orders.confirmReceipt'),
        subtitle: t('orders.confirmReceiptBody'),
        badgeLabel: 'ACTION NEEDED',
        icon: 'cube-outline',
        iconColor: colors.warning,
        stage: 'delivered',
        ctaLabel: t('orders.confirmReceiptCta'),
      };
    case 'feedback_prompt':
      return {
        title: t('orders.leaveFeedback'),
        subtitle: t('orders.leaveFeedbackBody'),
        badgeLabel: 'REVIEW',
        icon: 'star-outline',
        iconColor: colors.warning,
        stage: 'delivered',
        ctaLabel: t('orders.leaveFeedbackCta'),
      };
    case 'extension_requested': {
      const shipByLabel = proposedShipBy ? formatShortDateTime(proposedShipBy) : '';
      return {
        title: t('orders.extensionRequested'),
        subtitle: extensionDays != null
          ? t('orders.extensionRequestedBody', { count: extensionDays })
          : t('orders.extensionRequestedBodyGeneric'),
        badgeLabel: 'REQUEST',
        icon: 'time-outline',
        iconColor: colors.brand,
        stage: 'paid',
        nextStep: shipByLabel
          ? t('orders.extensionNewDeadline', { date: shipByLabel })
          : 'Awaiting your response',
        ctaLabel: t('orders.reviewRequestCta'),
      };
    }
    case 'order_cancelled':
      return {
        title: t('orders.cancelled'),
        subtitle: t('orders.cancelledBody'),
        badgeLabel: 'CANCELLED',
        icon: 'close-circle-outline',
        iconColor: colors.danger,
        isFailure: true,
        failureLabel: 'Cancelled',
      };
    case 'order_refunded':
      return {
        title: t('orders.refunded'),
        subtitle: t('orders.refundedBody'),
        badgeLabel: 'REFUNDED',
        icon: 'cash-outline',
        iconColor: colors.danger,
        isFailure: true,
        failureLabel: 'Refunded',
      };
    case 'order_partially_refunded':
      return {
        title: t('orders.partiallyRefunded'),
        subtitle: refundAmountLabel
          ? t('orders.partiallyRefundedBody', { amount: refundAmountLabel })
          : t('orders.partiallyRefundedBodyGeneric'),
        badgeLabel: 'PARTIAL REFUND',
        icon: 'cash-outline',
        iconColor: colors.warning,
      };
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export function CommerceStateCard({
  type,
  orderId,
  orderShortId,
  itemTitle,
  itemImage,
  trackingNumber,
  carrier,
  extensionDays,
  proposedShipBy,
  refundedAmountGbp,
  timestamp,
  onPress,
}: CommerceStateCardProps) {
  const { colors } = useAppTheme();
  const { t } = useAppTranslation('messaging');
  const { formatFromFiat } = useFormattedPrice();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const refundAmountLabel = refundedAmountGbp != null
    ? formatFromFiat(refundedAmountGbp, 'GBP', { displayMode: 'fiat' })
    : null;
  const config = useMemo(
    () => getStateConfig(type, colors, t, extensionDays, proposedShipBy, refundAmountLabel),
    [type, colors, t, extensionDays, proposedShipBy, refundAmountLabel]
  );

  const formattedTimestamp = useMemo(() => {
    if (!timestamp) return null;
    const formatted = formatShortDateTime(timestamp);
    return formatted || null;
  }, [timestamp]);

  const displayOrderTag = orderShortId ? `#${orderShortId}` : `#${orderId.slice(0, 8).toUpperCase()}`;

  return (
    <AnimatedPressable
      style={styles.container}
      onPress={onPress}
      activeOpacity={0.88}
      scaleValue={0.98}
      hapticFeedback="light"
      accessibilityRole="button"
      accessibilityLabel={`${config.title}. ${config.subtitle}. Order ${displayOrderTag}.${formattedTimestamp ? ` ${formattedTimestamp}.` : ''} Tap to view order details.`}
    >
      {/* Top Header Row — Icon squircle, Title & Status Pill */}
      <View style={styles.headerRow}>
        <View style={[styles.iconSquircle, { backgroundColor: colors.surfaceAlt }]}>
          <Ionicons name={config.icon} size={18} color={config.iconColor} />
        </View>
        <View style={styles.headerBody}>
          <View style={styles.titleLine}>
            <Text style={styles.title} numberOfLines={1}>{config.title}</Text>
            {config.badgeLabel && (
              <View style={[styles.statusBadge, { backgroundColor: `${config.iconColor}15` }]}>
                <Text style={[styles.statusBadgeText, { color: config.iconColor }]}>
                  {config.badgeLabel}
                </Text>
              </View>
            )}
          </View>
          <Text style={styles.subtitle} numberOfLines={1}>{config.subtitle}</Text>
        </View>
        {formattedTimestamp ? (
          <Text style={styles.timestamp} numberOfLines={1}>
            {formattedTimestamp}
          </Text>
        ) : null}
      </View>

      {/* Item preview row */}
      {(itemTitle || itemImage) && (
        <View style={styles.itemRow}>
          {itemImage ? (
            <CachedImage uri={itemImage} style={styles.itemImage} contentFit="cover" />
          ) : (
            <View style={[styles.itemImage, styles.itemImageFallback]}>
              <Ionicons name="shirt-outline" size={16} color={colors.textMuted} />
            </View>
          )}
          <View style={styles.itemInfo}>
            <Text style={styles.itemTitle} numberOfLines={1}>{itemTitle ?? 'Order Item'}</Text>
            <Text style={styles.orderIdTag}>{displayOrderTag}</Text>
          </View>
        </View>
      )}

      {/* Visual Stepper */}
      {config.stage && (
        <View style={styles.stepperWrap}>
          <OrderStatusStepper
            currentStage={config.stage}
            isFailure={config.isFailure}
            failureLabel={config.failureLabel}
          />
        </View>
      )}

      {/* Carrier & Tracking Chip */}
      {(trackingNumber || carrier) && (
        <View style={styles.trackingChip}>
          <Ionicons name="cube-outline" size={13} color={colors.textSecondary} />
          <Text style={styles.trackingText} numberOfLines={1}>
            {carrier ? `${carrier.toUpperCase()}` : 'TRACKED'}
            {trackingNumber ? ` · ${trackingNumber}` : ''}
          </Text>
        </View>
      )}

      {/* Next Step Guidance */}
      {config.nextStep && !config.isFailure && (
        <View style={styles.nextStepRow}>
          <Ionicons name="time-outline" size={12} color={colors.textMuted} />
          <Text style={styles.nextStepText} numberOfLines={1}>
            Next: {config.nextStep}
          </Text>
        </View>
      )}

      {/* Footer CTA Action */}
      <View style={styles.footerRow}>
        <Text style={styles.viewDetailsText}>{config.ctaLabel ?? t('orders.viewDetails')}</Text>
        <Ionicons name="arrow-forward" size={13} color={colors.brand} />
      </View>
    </AnimatedPressable>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      borderRadius: Radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSubtle,
      backgroundColor: colors.surface,
      padding: Space.md,
      gap: Space.sm + 1,
      width: '100%',
      maxWidth: 340,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
    },
    iconSquircle: {
      width: 36,
      height: 36,
      borderRadius: Radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    headerBody: {
      flex: 1,
      gap: 1,
    },
    titleLine: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    title: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      color: colors.textPrimary,
      letterSpacing: -0.2,
    },
    statusBadge: {
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: Radius.sm,
    },
    statusBadgeText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.bold,
      letterSpacing: 0.6,
    },
    subtitle: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textSecondary,
    },
    timestamp: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textMuted,
      flexShrink: 0,
      textAlign: 'right',
    },
    itemRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      backgroundColor: colors.surfaceAlt,
      borderRadius: Radius.md,
      padding: Space.xs + 2,
    },
    itemImage: {
      width: 44,
      height: 44,
      borderRadius: Radius.sm + 2,
      flexShrink: 0,
    },
    itemImageFallback: {
      backgroundColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    itemInfo: {
      flex: 1,
      gap: 2,
    },
    itemTitle: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.medium,
      color: colors.textPrimary,
    },
    orderIdTag: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textMuted,
      letterSpacing: 0.2,
    },
    stepperWrap: {
      paddingVertical: Space.xs,
    },
    trackingChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.surfaceAlt,
      paddingHorizontal: Space.sm,
      paddingVertical: Space.xs,
      borderRadius: Radius.sm,
      alignSelf: 'flex-start',
    },
    trackingText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.medium,
      color: colors.textSecondary,
      letterSpacing: 0.3,
    },
    nextStepRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    nextStepText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textSecondary,
      letterSpacing: 0.1,
    },
    footerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: Space.xs,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.borderSubtle,
    },
    viewDetailsText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.semibold,
      color: colors.brand,
    },
  });
