import React, { useMemo } from 'react';
import { Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import {
  NotificationRowBase,
  NotificationThumbnail,
  NotificationStatusIcon,
  NotificationActionButton,
} from './NotificationRowBase';
import {
  Space,
  Type,
  FontFamily,
} from '../../theme/designTokens';
import {
  readPayloadNumber,
  readPayloadString,
  type NotificationEventV2,
} from '../../services/notificationsApi';

// ---------------------------------------------------------------------------
// AuctionNotificationRow — auction lifecycle events (action-required)
// ---------------------------------------------------------------------------
// Covers: auction_outbid, auction_won, auction_ending_soon.
// Layout: urgency icon → current bid / status → object thumbnail + action button
// Action-required events show a clear primary action (e.g. "Bid again").
// ---------------------------------------------------------------------------

export interface AuctionNotificationRowProps {
  event: NotificationEventV2;
  time: string;
  aggregatedCount?: number;
  inAttentionSection?: boolean;
  onPress: () => void;
  onAction?: () => void;
}

interface AuctionVisual {
  icon: keyof typeof Ionicons.glyphMap;
  accentKey: 'danger' | 'success' | 'warning';
  urgencyLabel: string;
  actionLabel: string;
}

function resolveAuctionVisual(eventType: NotificationEventV2['eventType']): AuctionVisual {
  switch (eventType) {
    case 'auction_outbid':
      return { icon: 'trending-up-outline', accentKey: 'danger', urgencyLabel: 'Outbid', actionLabel: 'Bid again' };
    case 'auction_won':
      return { icon: 'trophy-outline', accentKey: 'success', urgencyLabel: 'Auction won', actionLabel: 'Complete purchase' };
    case 'auction_ending_soon':
      return { icon: 'time-outline', accentKey: 'warning', urgencyLabel: 'Ending soon', actionLabel: 'Place bid' };
    default:
      return { icon: 'flag-outline', accentKey: 'warning', urgencyLabel: 'Auction update', actionLabel: 'View auction' };
  }
}

export function AuctionNotificationRow({
  event,
  time,
  aggregatedCount,
  inAttentionSection = false,
  onPress,
  onAction,
}: AuctionNotificationRowProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const visual = useMemo(() => resolveAuctionVisual(event.eventType), [event.eventType]);
  const accentColor = colors[visual.accentKey] ?? colors.brand;
  const isUnread = !event.readAt;

  const objectLabel = event.objectRef?.label ?? 'this auction';
  const objectImage = event.objectRef?.imageUrl ?? event.imageUrl ?? undefined;

  // Structured bid data from the payload — never from prose text.
  const currentBid = readPayloadNumber(event.payload, 'currentBidGbp') ?? readPayloadNumber(event.payload, 'currentBid');
  const minimumNextBid = readPayloadNumber(event.payload, 'minimumNextBidGbp') ?? readPayloadNumber(event.payload, 'minimumNextBid');
  const currency = readPayloadString(event.payload, 'currency') ?? '£';

  const bidText = currentBid != null
    ? `Current bid ${currency}${currentBid.toFixed(0)}`
    : minimumNextBid != null
      ? `Next bid ${currency}${minimumNextBid.toFixed(0)}`
      : null;

  const description = bidText ? `${visual.urgencyLabel} · ${objectLabel} · ${bidText}` : `${visual.urgencyLabel} · ${objectLabel}`;

  const accessibilityLabel = `${isUnread ? 'Unread. ' : ''}${event.requiresAction ? 'Action required. ' : ''}${visual.urgencyLabel} on ${objectLabel}${bidText ? `. ${bidText}` : ''}. ${time}. Button: ${visual.actionLabel}`;

  const leading = (
    <NotificationStatusIcon
      icon={visual.icon}
      accentColor={accentColor}
      colors={colors}
      size={44}
    />
  );

  const trailing = (
    <NotificationActionButton
      label={visual.actionLabel}
      onPress={onAction ?? onPress}
      colors={colors}
      variant="primary"
    />
  );

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
        {event.title || visual.urgencyLabel}
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
      fontSize: Type.bodyLarge.size,
      fontFamily: FontFamily.regular,
      color: colors.textSecondary,
      lineHeight: Type.bodyLarge.lineHeight,
      paddingRight: Space.xxl + Space.sm,
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
