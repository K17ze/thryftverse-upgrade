import React, { memo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Typography, Radius, Type } from '../../theme/designTokens';
import { CachedImage } from '../CachedImage';
import {
  normaliseOrderStatus,
  humaniseStatus,
  getStatusColor,
  isTerminalStatus,
  isCancelledStatus,
  getNextActionHint,
  type OrderRole,
} from './orderCapabilities';

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
}

function formatDate(iso: string): string {
  const timestamp = Date.parse(iso);
  if (!Number.isFinite(timestamp)) return '';
  return new Date(timestamp).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
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
  const statusColor = getStatusColor(order.status, colors.textMuted);
  const cancelled = isCancelledStatus(order.status);
  const terminal = isTerminalStatus(order.status);
  const dateLabel = formatDate(order.createdAt);
  const nextAction = getNextActionHint(order.status, order.role);

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

  const accessibilityLabel = `${order.title}, ${statusLabel}, ${formattedTotal}, ${contextLine}${trackingLine ? `, ${trackingLine}` : ''}${nextAction ? `, Next: ${nextAction}` : ''}`;

  return (
    <Pressable
      style={styles.row}
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
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusText, { color: statusColor }]} numberOfLines={1}>
            {statusLabel}
          </Text>
        </View>

        <Text style={styles.title} numberOfLines={2}>{order.title}</Text>

        <Text style={styles.total}>{formattedTotal}</Text>

        <Text style={styles.context} numberOfLines={1}>
          {cancelled ? (dateLabel ? `Cancelled · ${dateLabel}` : 'Cancelled') : contextLine}
        </Text>

        {trackingLine && (
          <Text style={styles.tracking} numberOfLines={1}>
            <Ionicons name="cube-outline" size={11} color={colors.textMuted} /> {trackingLine}
          </Text>
        )}

        {nextAction && (
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

const THUMB_SIZE = 88;

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: Space.md,
    paddingHorizontal: Space.md,
    minHeight: 44,
    gap: Space.md,
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
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 1,
    marginBottom: Space.xs / 2,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: Radius.sm,
  },
  statusText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: 0.3,
  },
  title: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
    lineHeight: 20,
  },
  total: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.bold,
    color: colors.textPrimary,
    marginTop: 1,
  },
  context: {
    fontSize: Type.captionElevated.size,
    fontFamily: Typography.family.regular,
    color: colors.textMuted,
    marginTop: 2,
  },
  tracking: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
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
    fontSize: Type.meta.size,
    fontFamily: Typography.family.medium,
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
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
    color: colors.brand,
  },
});
