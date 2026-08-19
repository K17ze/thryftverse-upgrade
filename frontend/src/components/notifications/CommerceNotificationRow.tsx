import React, { useMemo } from 'react';
import { Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import {
  NotificationRowBase,
  NotificationThumbnail,
  NotificationStatusIcon,
} from './NotificationRowBase';
import {
  Type,
  FontFamily,
} from '../../theme/designTokens';
import type { NotificationEventV2 } from '../../services/notificationsApi';

// ---------------------------------------------------------------------------
// CommerceNotificationRow — order lifecycle events
// ---------------------------------------------------------------------------
// Covers: order_created, order_paid, order_dispatched, order_in_transit,
// order_out_for_delivery, order_delivered, order_cancelled, order_refunded.
// Layout: order status icon → status text + object label → object thumbnail
// ---------------------------------------------------------------------------

export interface CommerceNotificationRowProps {
  event: NotificationEventV2;
  time: string;
  aggregatedCount?: number;
  inAttentionSection?: boolean;
  onPress: () => void;
}

interface CommerceVisual {
  icon: keyof typeof Ionicons.glyphMap;
  accentKey: 'success' | 'warning' | 'danger' | 'brand' | 'commerceTrust';
  statusLabel: string;
}

function resolveCommerceVisual(eventType: NotificationEventV2['eventType']): CommerceVisual {
  switch (eventType) {
    case 'order_created':
      return { icon: 'bag-outline', accentKey: 'brand', statusLabel: 'New order' };
    case 'order_paid':
      return { icon: 'card-outline', accentKey: 'success', statusLabel: 'Paid' };
    case 'order_dispatched':
      return { icon: 'cube-outline', accentKey: 'commerceTrust', statusLabel: 'Dispatched' };
    case 'order_in_transit':
      return { icon: 'airplane-outline', accentKey: 'commerceTrust', statusLabel: 'In transit' };
    case 'order_out_for_delivery':
      return { icon: 'bicycle-outline', accentKey: 'warning', statusLabel: 'Out for delivery' };
    case 'order_delivered':
      return { icon: 'checkmark-circle-outline', accentKey: 'success', statusLabel: 'Delivered' };
    case 'order_cancelled':
      return { icon: 'close-circle-outline', accentKey: 'danger', statusLabel: 'Cancelled' };
    case 'order_refunded':
      return { icon: 'cash-outline', accentKey: 'warning', statusLabel: 'Refunded' };
    default:
      return { icon: 'bag-outline', accentKey: 'brand', statusLabel: 'Order update' };
  }
}

export function CommerceNotificationRow({
  event,
  time,
  aggregatedCount,
  inAttentionSection = false,
  onPress,
}: CommerceNotificationRowProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const visual = useMemo(() => resolveCommerceVisual(event.eventType), [event.eventType]);
  const accentColor = colors[visual.accentKey] ?? colors.brand;
  const isUnread = !event.readAt;

  const objectLabel = event.objectRef?.label ?? 'your order';
  const objectImage = event.objectRef?.imageUrl ?? event.imageUrl ?? undefined;

  const description = `${visual.statusLabel} · ${objectLabel}`;
  const accessibilityLabel = `${isUnread ? 'Unread. ' : ''}${visual.statusLabel}. ${objectLabel}. ${time}`;

  const leading = (
    <NotificationStatusIcon
      icon={visual.icon}
      accentColor={accentColor}
      colors={colors}
      size={44}
    />
  );

  const trailing = event.objectRef ? (
    <NotificationThumbnail
      uri={objectImage}
      fallbackIcon="cube-outline"
      size={40}
      colors={colors}
    />
  ) : undefined;

  return (
    <NotificationRowBase
      event={event}
      time={time}
      aggregatedCount={aggregatedCount}
      inAttentionSection={inAttentionSection}
      onPress={onPress}
      leading={leading}
      trailing={trailing}
      accessibilityLabel={accessibilityLabel}
    >
      <Text style={[styles.title, isUnread && styles.titleUnread]} numberOfLines={1}>
        {event.title || visual.statusLabel}
      </Text>
      <Text style={styles.body} numberOfLines={2}>
        {description}
      </Text>
    </NotificationRowBase>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    title: {
      fontSize: Type.body.size,
      fontFamily: FontFamily.regular,
      color: colors.textSecondary,
      lineHeight: Type.body.lineHeight,
    },
    titleUnread: {
      color: colors.textPrimary,
      fontFamily: FontFamily.semibold,
    },
    body: {
      fontSize: Type.body.size,
      fontFamily: FontFamily.regular,
      color: colors.textSecondary,
      lineHeight: Type.body.lineHeight,
    },
  });
}
