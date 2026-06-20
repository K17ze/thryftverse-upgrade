import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Space, Typography } from '../../theme/designTokens';
import { CachedImage } from '../CachedImage';

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
  role: 'buying' | 'selling';
}

const STATUS_LABELS: Record<string, string> = {
  created: 'Awaiting payment',
  paid: 'Preparing',
  shipped: 'Shipped',
  'in transit': 'In transit',
  delivered: 'Delivered',
  completed: 'Completed',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
};

const STATUS_COLORS: Record<string, string> = {
  created: Colors.textMuted,
  paid: Colors.textSecondary,
  shipped: Colors.textSecondary,
  'in transit': Colors.textSecondary,
  delivered: Colors.success,
  completed: Colors.success,
  cancelled: Colors.danger,
  refunded: Colors.danger,
};

const TERMINAL_STATUSES = new Set(['delivered', 'completed', 'cancelled', 'refunded']);

function getStatusLabel(status: string): string {
  const key = status.toLowerCase();
  return STATUS_LABELS[key] ?? key;
}

function getStatusColor(status: string): string {
  const key = status.toLowerCase();
  return STATUS_COLORS[key] ?? Colors.textSecondary;
}

function isTerminal(status: string): boolean {
  return TERMINAL_STATUSES.has(status.toLowerCase());
}

function isCancelled(status: string): boolean {
  const key = status.toLowerCase();
  return key === 'cancelled' || key === 'refunded';
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  } catch {
    return '';
  }
}

interface OrderLedgerRowProps {
  order: OrderViewModel;
  formattedTotal: string;
  onPress: () => void;
}

export function OrderLedgerRow({ order, formattedTotal, onPress }: OrderLedgerRowProps) {
  const statusLabel = getStatusLabel(order.status);
  const statusColor = getStatusColor(order.status);
  const cancelled = isCancelled(order.status);
  const terminal = isTerminal(order.status);
  const dateLabel = formatDate(order.createdAt);

  const contextVerb = order.role === 'buying' ? 'Bought' : 'Sold';
  const contextLine = dateLabel ? `${contextVerb} · ${dateLabel}` : contextVerb;

  const trackingLine = order.trackingNumber
    ? `${order.shippingProvider ? order.shippingProvider.toUpperCase() + ' · ' : ''}${order.trackingNumber}`
    : null;

  // Progress cue: Paid → Shipped → Delivered
  const statusKey = order.status.toLowerCase();
  const showProgress = !terminal && statusKey !== 'created';
  const progressStages = ['paid', 'shipped', 'delivered'];
  const currentStageIndex = progressStages.indexOf(
    statusKey === 'in transit' ? 'shipped' : statusKey
  );

  const accessibilityLabel = `${order.title}, ${statusLabel}, ${formattedTotal}, ${contextLine}${trackingLine ? `, ${trackingLine}` : ''}`;

  return (
    <Pressable
      style={styles.row}
      onPress={onPress}
      hitSlop={{ top: 4, bottom: 4 }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      {/* Thumbnail */}
      <CachedImage
        uri={order.image}
        style={styles.thumb}
        containerStyle={styles.thumbContainer}
        contentFit="cover"
      />

      {/* Content */}
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
          {cancelled ? `Cancelled · ${dateLabel}` : contextLine}
        </Text>

        {trackingLine && (
          <Text style={styles.tracking} numberOfLines={1}>
            <Ionicons name="cube-outline" size={11} color={Colors.textMuted} /> {trackingLine}
          </Text>
        )}

        {showProgress && currentStageIndex >= 0 && (
          <View style={styles.progressRow}>
            {progressStages.map((stage, i) => {
              const isCompleted = i <= currentStageIndex;
              const isCurrent = i === currentStageIndex;
              return (
                <React.Fragment key={stage}>
                  <View
                    style={[
                      styles.progressDot,
                      isCompleted && { backgroundColor: Colors.textPrimary },
                    ]}
                  />
                  {i < progressStages.length - 1 && (
                    <View
                      style={[
                        styles.progressLine,
                        i < currentStageIndex && { backgroundColor: Colors.textPrimary },
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

      {/* Chevron */}
      <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} style={styles.chevron} />
    </Pressable>
  );
}

const THUMB_SIZE = 88;

const styles = StyleSheet.create({
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
    borderRadius: 6,
    overflow: 'hidden',
  },
  thumb: {
    width: '100%',
    height: '100%',
  },
  content: {
    flex: 1,
    gap: 3,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 2,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 12,
    fontFamily: Typography.family.semibold,
    letterSpacing: 0.3,
  },
  title: {
    fontSize: 15,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
    lineHeight: 20,
  },
  total: {
    fontSize: 15,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    marginTop: 1,
  },
  context: {
    fontSize: 13,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    marginTop: 2,
  },
  tracking: {
    fontSize: 12,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    marginTop: 1,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  progressDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.border,
  },
  progressLine: {
    width: 16,
    height: 1.5,
    backgroundColor: Colors.border,
  },
  progressLabel: {
    fontSize: 11,
    fontFamily: Typography.family.medium,
    color: Colors.textSecondary,
    marginLeft: 4,
  },
  chevron: {
    marginTop: 2,
  },
});
