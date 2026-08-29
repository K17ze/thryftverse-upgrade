import React, { memo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, Control } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { CachedImage } from '../CachedImage';
import {
  normaliseOrderStatus,
  humaniseStatus,
  getStatusColor,
  isTerminalStatus,
  isCancelledStatus,
  getNextActionHint,
  needsAction,
  type OrderRole,
} from './orderCapabilities';
import { formatShortDate } from '../../utils/dateFormat';

export interface OrderViewModel {
  id: string;
  listingId: string;
  title: string;
  image: string;
  totalGbp: number;
  status: string;
  createdAt: string;
  trackingNumber: string | null;
  shippingProvider: string | null;
  role: OrderRole;
  counterpartyUsername: string | null;
  /** Ship-by deadline (ISO 8601) — shown as an urgent badge when present. */
  shipByDate?: string | null;
  /** The exact service the buyer paid for (from the immutable snapshot). */
  serviceName?: string | null;
}


interface OrderLedgerRowProps {
  order: OrderViewModel;
  formattedTotal: string;
  onPress: () => void;
}

function OrderLedgerRowImpl({ order, formattedTotal, onPress }: OrderLedgerRowProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const statusLabel = humaniseStatus(order.status);
  const statusColor = getStatusColor(order.status, colors);
  const cancelled = isCancelledStatus(order.status);
  const terminal = isTerminalStatus(order.status);
  const dateLabel = formatShortDate(order.createdAt);
  const nextAction = getNextActionHint(order.status, order.role);
  const isNeedsAction = needsAction(order.status, order.role);

  // Ship-by deadline urgency (seller view, paid status)
  const shipByDaysLeft = order.shipByDate
    ? Math.ceil((new Date(order.shipByDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
    : null;
  const shipByOverdue = shipByDaysLeft != null && shipByDaysLeft < 0;
  const shipByUrgent = shipByDaysLeft != null && shipByDaysLeft >= 0 && shipByDaysLeft <= 1;
  const showDeadlineBadge = isNeedsAction && order.role === 'seller' && order.shipByDate;

  const contextVerb = order.role === 'buyer' ? 'Bought' : 'Sold';
  const counterpartyLabel = order.counterpartyUsername
    ? `@${order.counterpartyUsername}`
    : null;
  const contextParts = [contextVerb];
  if (counterpartyLabel) contextParts.push(counterpartyLabel);
  if (dateLabel) contextParts.push(dateLabel);
  const contextLine = contextParts.join(' · ');

  const trackingLine = order.trackingNumber
    ? `${order.shippingProvider ? order.shippingProvider.toUpperCase() + ' · ' : ''}${order.trackingNumber}`
    : null;

  const statusKey = normaliseOrderStatus(order.status);
  const ACTIVE_PROGRESS_STATUSES = new Set(['paid', 'shipped', 'in transit']);
  const showProgress = !terminal && statusKey !== 'created' && ACTIVE_PROGRESS_STATUSES.has(statusKey);
  const progressStages = ['paid', 'shipped', 'delivered'];
  const currentStageIndex = progressStages.indexOf(
    statusKey === 'in transit' ? 'shipped' : statusKey
  );

  // Short order number for scannable reference — first 8 chars uppercased
  const shortOrderNumber = order.id.slice(0, 8).toUpperCase();

  const accessibilityLabel = `Order ${shortOrderNumber}, ${order.title}, ${statusLabel}, ${formattedTotal}, ${contextLine}${trackingLine ? `, ${trackingLine}` : ''}${nextAction ? `, Next: ${nextAction}` : ''}${showDeadlineBadge ? `, Ship by ${formatShortDate(order.shipByDate!)}` : ''}`;

  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed, isNeedsAction && styles.rowNeedsAction]}
      onPress={onPress}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <CachedImage
        uri={order.image}
        style={styles.thumb}
        containerStyle={styles.thumbContainer}
        contentFit="cover"
      />

      <View style={styles.content}>
        {/* Top row: status badge + order number */}
        <View style={styles.topRow}>
          <View style={[styles.statusBadge, { backgroundColor: `${statusColor}15` /* TODO: replace with subtle token once statusColor is resolved */ }]}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusText, { color: statusColor }]} numberOfLines={1}>
              {statusLabel}
            </Text>
          </View>
          <Text style={styles.orderNumber}>#{shortOrderNumber}</Text>
        </View>

        {/* Item title */}
        <Text style={styles.title} numberOfLines={2}>{order.title}</Text>

        {/* Bottom row: context (verb · counterparty · date) + total */}
        <View style={styles.bottomRow}>
          <Text style={styles.context} numberOfLines={1}>
            {cancelled ? (dateLabel ? `Cancelled · ${dateLabel}` : 'Cancelled') : contextLine}
          </Text>
          <Text style={styles.total}>{formattedTotal}</Text>
        </View>

        {trackingLine && (
          <Text style={styles.tracking} numberOfLines={1}>
            <Ionicons name="cube-outline" size={11} color={colors.textMuted} /> {trackingLine}
          </Text>
        )}

        {/* Deadline badge — shown for seller needs-action orders with a ship-by date */}
        {showDeadlineBadge && (
          <View style={[
            styles.deadlineBadge,
            shipByOverdue
              ? { backgroundColor: colors.dangerSubtle, borderColor: colors.dangerBorder }
              : shipByUrgent
                ? { backgroundColor: colors.warningSubtle, borderColor: colors.warningBorder }
                : { backgroundColor: colors.brandSubtle, borderColor: colors.border },
          ]}>
            <Ionicons
              name={shipByOverdue ? 'alert-circle' : 'time-outline'}
              size={12}
              color={shipByOverdue ? colors.danger : shipByUrgent ? colors.warning : colors.textSecondary}
            />
            <Text style={[
              styles.deadlineText,
              { color: shipByOverdue ? colors.danger : shipByUrgent ? colors.warning : colors.textSecondary },
            ]}>
              {shipByOverdue
                ? 'Overdue — dispatch now'
                : shipByUrgent && shipByDaysLeft === 0
                  ? 'Dispatch today'
                  : shipByUrgent
                    ? `Ship tomorrow (${formatShortDate(order.shipByDate!)})`
                    : `Ship by ${formatShortDate(order.shipByDate!)}`}
            </Text>
          </View>
        )}

        {/* Next action — contextual CTA hint */}
        {nextAction && !terminal && (
          <View style={styles.nextActionRow}>
            <Ionicons name="arrow-forward-circle-outline" size={12} color={colors.brand} />
            <Text style={styles.nextActionText}>{nextAction}</Text>
          </View>
        )}

        {showProgress && currentStageIndex >= 0 && (
          <View style={styles.progressRow}>
            {progressStages.map((stage, i) => {
              const isCompleted = i <= currentStageIndex;
              return (
                <React.Fragment key={stage}>
                  <View
                    style={[
                      styles.progressDot,
                      isCompleted && { backgroundColor: colors.textPrimary },
                    ]}
                  />
                  {i < progressStages.length - 1 && (
                    <View
                      style={[
                        styles.progressLine,
                        i < currentStageIndex && { backgroundColor: colors.textPrimary },
                      ]}
                    />
                  )}
                </React.Fragment>
              );
            })}
            <Text style={styles.progressLabel}>
              {progressStages[currentStageIndex].charAt(0).toUpperCase() + progressStages[currentStageIndex].slice(1)}
            </Text>
          </View>
        )}
      </View>

      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} style={styles.chevron} />
    </Pressable>
  );
}

export const OrderLedgerRow = memo(OrderLedgerRowImpl);

const THUMB_SIZE = 80;

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: Space.md,
    paddingHorizontal: Space.md,
    minHeight: 76,
    gap: Space.md,
  },
  rowPressed: {
    opacity: 0.7,
  },
  rowNeedsAction: {
    // Subtle left accent for needs-action rows — the eye finds urgent work first
    borderLeftWidth: 3,
    borderLeftColor: colors.brand,
    paddingLeft: Space.md - 3,
  },
  thumbContainer: {
    width: THUMB_SIZE,
    height: THUMB_SIZE * 1.25,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  thumb: {
    width: '100%',
    height: '100%',
  },
  content: {
    flex: 1,
    gap: Space.xs / 2 + 1,
  },
  // Top row: status badge (left) + order number (right)
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.sm,
    marginBottom: Space.xs / 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: Radius.sm,
  },
  statusText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  // Order number — monospace-feel reference, muted
  orderNumber: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  title: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    color: colors.textPrimary,
    lineHeight: 20,
  },
  // Bottom row: context (left) + total (right) — scannable financial summary
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.sm,
    marginTop: 2,
  },
  total: {
    fontSize: TypographyV2.priceList.size,
    lineHeight: TypographyV2.priceList.lineHeight,
    fontFamily: TypographyV2.priceList.fontFamily,
    letterSpacing: TypographyV2.priceList.letterSpacing,
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  context: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    color: colors.textMuted,
  },
  tracking: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    color: colors.textMuted,
    marginTop: 1,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    marginTop: Space.xs + 2,
  },
  progressDot: {
    width: 6,
    height: 6,
    borderRadius: Radius.sm,
    backgroundColor: colors.border,
  },
  progressLine: {
    width: 16,
    height: 1.5,
    backgroundColor: colors.border,
  },
  progressLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textSecondary,
    marginLeft: Space.xs,
  },
  chevron: {
    marginTop: 2,
  },
  nextActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    marginTop: Space.xs,
  },
  nextActionText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    color: colors.brand,
  },
  // Deadline badge — urgent ship-by indicator for seller needs-action rows
  deadlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs / 2 + 1,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: Space.xs,
    alignSelf: 'flex-start',
  },
  deadlineText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
});
