import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, Typography, Type } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';
import { OrderStatusStepper, OrderStepperStage } from '../orders/OrderStatusStepper';
import { formatShortDateTime } from '../../utils/dateFormat';

// ── Types ────────────────────────────────────────────────────────────────────

export type CommerceStateType =
  | 'order_placed'
  | 'payment_confirmed'
  | 'order_shipped'
  | 'order_in_transit'
  | 'order_delivered'
  | 'order_cancelled'
  | 'order_refunded';

export interface CommerceStateCardProps {
  type: CommerceStateType;
  orderId: string;
  orderShortId?: string;
  itemTitle?: string;
  itemImage?: string | null;
  trackingNumber?: string | null;
  carrier?: string | null;
  /** Optional ISO timestamp for when this state event occurred */
  timestamp?: string | null;
  onPress?: () => void;
}

// ── Config ───────────────────────────────────────────────────────────────────

interface StateConfig {
  title: string;
  subtitle: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  iconColor: string;
  iconBg: string;
  stage?: OrderStepperStage;
  isFailure?: boolean;
  failureLabel?: string;
  nextStep?: string;
}

function getStateConfig(type: CommerceStateType, colors: ThemeColors): StateConfig {
  switch (type) {
    case 'order_placed':
      return {
        title: 'Order placed',
        subtitle: 'The seller has been notified.',
        icon: 'receipt-outline',
        iconColor: colors.brand,
        iconBg: `${colors.brand}15`,
        stage: 'placed',
        nextStep: 'Awaiting payment confirmation',
      };
    case 'payment_confirmed':
      return {
        title: 'Payment confirmed',
        subtitle: 'Your payment has been processed.',
        icon: 'checkmark-circle-outline',
        iconColor: colors.success,
        iconBg: `${colors.success}15`,
        stage: 'paid',
        nextStep: 'Seller preparing for dispatch',
      };
    case 'order_shipped':
      return {
        title: 'Order shipped',
        subtitle: 'The parcel has been dispatched.',
        icon: 'cube-outline',
        iconColor: colors.brand,
        iconBg: `${colors.brand}15`,
        stage: 'shipped',
        nextStep: 'In carrier transit',
      };
    case 'order_in_transit':
      return {
        title: 'In transit',
        subtitle: 'Your parcel is on the way.',
        icon: 'car-outline',
        iconColor: colors.brand,
        iconBg: `${colors.brand}15`,
        stage: 'in_transit',
        nextStep: 'Out for delivery',
      };
    case 'order_delivered':
      return {
        title: 'Delivered',
        subtitle: 'Delivery has been confirmed.',
        icon: 'checkmark-done-circle-outline',
        iconColor: colors.success,
        iconBg: `${colors.success}15`,
        stage: 'delivered',
      };
    case 'order_cancelled':
      return {
        title: 'Order cancelled',
        subtitle: 'This order has been cancelled.',
        icon: 'close-circle-outline',
        iconColor: colors.danger,
        iconBg: `${colors.danger}15`,
        isFailure: true,
        failureLabel: 'Cancelled',
      };
    case 'order_refunded':
      return {
        title: 'Refunded',
        subtitle: 'Your payment has been refunded.',
        icon: 'cash-outline',
        iconColor: colors.danger,
        iconBg: `${colors.danger}15`,
        isFailure: true,
        failureLabel: 'Refunded',
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
  timestamp,
  onPress,
}: CommerceStateCardProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const config = useMemo(() => getStateConfig(type, colors), [type, colors]);

  const formattedTimestamp = useMemo(() => {
    if (!timestamp) return null;
    const formatted = formatShortDateTime(timestamp);
    return formatted || null;
  }, [timestamp]);

  return (
    <AnimatedPressable
      style={[
        styles.container,
        { borderColor: colors.border, borderLeftColor: config.iconColor },
      ]}
      onPress={onPress}
      activeOpacity={0.85}
      scaleValue={0.98}
      hapticFeedback="light"
      accessibilityRole="button"
      accessibilityLabel={`${config.title}. ${config.subtitle}. ${orderShortId ? `Order ${orderShortId}.` : ''}${formattedTimestamp ? ` ${formattedTimestamp}.` : ''} Tap to view order details.`}
    >
      {/* Header row */}
      <View style={styles.headerRow}>
        <View style={[styles.headerIcon, { backgroundColor: config.iconBg }]}>
          <Ionicons name={config.icon} size={16} color={config.iconColor} />
        </View>
        <View style={styles.headerBody}>
          <Text style={styles.title} numberOfLines={1}>{config.title}</Text>
          <Text style={styles.subtitle} numberOfLines={1}>{config.subtitle}</Text>
        </View>
        {formattedTimestamp ? (
          <Text style={styles.timestamp} numberOfLines={1}>
            {formattedTimestamp}
          </Text>
        ) : (
          <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
        )}
      </View>

      {/* Item preview */}
      {(itemTitle || itemImage) && (
        <View style={styles.itemRow}>
          {itemImage ? (
            <CachedImage uri={itemImage} style={styles.itemImage} contentFit="cover" />
          ) : (
            <View style={[styles.itemImage, styles.itemImageFallback]}>
              <Ionicons name="shirt-outline" size={14} color={colors.textMuted} />
            </View>
          )}
          <Text style={styles.itemTitle} numberOfLines={2}>{itemTitle ?? 'Item'}</Text>
        </View>
      )}

      {/* Visual stepper */}
      {config.stage && (
        <OrderStatusStepper
          currentStage={config.stage}
          isFailure={config.isFailure}
          failureLabel={config.failureLabel}
        />
      )}

      {/* Next step hint — what happens next in the lifecycle */}
      {config.nextStep && !config.isFailure ? (
        <View style={styles.nextStepRow}>
          <Ionicons name="hourglass-outline" size={11} color={colors.textMuted} />
          <Text style={styles.nextStepText} numberOfLines={1}>
            Next: {config.nextStep}
          </Text>
        </View>
      ) : null}

      {/* Tracking info */}
      {(trackingNumber || carrier) && (
        <View style={styles.trackingRow}>
          <Ionicons name="location-outline" size={12} color={colors.textMuted} />
          <Text style={styles.trackingText} numberOfLines={1}>
            {carrier ? `${carrier}` : ''}
            {carrier && trackingNumber ? ' · ' : ''}
            {trackingNumber ? trackingNumber : ''}
          </Text>
        </View>
      )}

      {/* Order ID footer */}
      <View style={styles.footerRow}>
        <Text style={styles.orderIdText}>
          {orderShortId ? `Order #${orderShortId}` : `Order ${orderId.slice(0, 8)}`}
        </Text>
        <Text style={styles.viewDetailsText}>View details</Text>
      </View>
    </AnimatedPressable>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: 3,
    backgroundColor: colors.surface,
    padding: Space.md,
    gap: Space.sm,
    maxWidth: 320,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  headerIcon: {
    width: 32,
    height: 32,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headerBody: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: Type.captionElevated.size,
    fontFamily: Typography.family.regular,
    color: colors.textSecondary,
  },
  timestamp: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.regular,
    color: colors.textMuted,
    flexShrink: 0,
    maxWidth: 80,
    textAlign: 'right',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: Radius.md,
    padding: Space.sm,
  },
  itemImage: {
    width: 40,
    height: 40,
    borderRadius: Radius.sm,
    flexShrink: 0,
  },
  itemImageFallback: {
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemTitle: {
    flex: 1,
    fontSize: Type.captionElevated.size,
    fontFamily: Typography.family.medium,
    color: colors.textPrimary,
    lineHeight: 17,
  },
  trackingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  trackingText: {
    flex: 1,
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: colors.textMuted,
    letterSpacing: 0.1,
  },
  nextStepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: Space.xs,
  },
  nextStepText: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.medium,
    color: colors.textSecondary,
    letterSpacing: 0.1,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Space.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  orderIdText: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.medium,
    color: colors.textMuted,
    letterSpacing: 0.3,
  },
  viewDetailsText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    color: colors.brand,
  },
});
