import React, { useMemo } from 'react';
import { Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { useFormattedPrice } from '../../hooks/useFormattedPrice';
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
  const { currencySymbol } = useFormattedPrice();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const visual = useMemo(() => resolveAuctionVisual(event.eventType), [event.eventType]);
  const accentColor = colors[visual.accentKey] ?? colors.brand;
  const isUnread = !event.readAt;

  const objectLabel = event.objectRef?.label ?? 'this auction';
  const objectImage = event.objectRef?.imageUrl ?? event.imageUrl ?? undefined;

  // Structured bid data from the payload — never from prose text.
  const currentBid = readPayloadNumber(event.payload, 'currentBidGbp') ?? readPayloadNumber(event.payload, 'currentBid');
  const minimumNextBid = readPayloadNumber(event.payload, 'minimumNextBidGbp') ?? readPayloadNumber(event.payload, 'minimumNextBid');
  const currency = readPayloadString(event.payload, 'currency') ?? currencySymbol;

  const bidAmount = currentBid != null
    ? `${currency}${currentBid.toFixed(2)}`
    : minimumNextBid != null
      ? `${currency}${minimumNextBid.toFixed(2)}`
      : null;
  const bidPrefix = currentBid != null ? 'Current bid' : minimumNextBid != null ? 'Next bid' : null;

  // The description carries the urgency + object label only; the bid amount
  // is rendered as a dedicated tabular-figures element (the visual anchor).
  const description = `${visual.urgencyLabel} · ${objectLabel}`;

  const accessibilityLabel = `${isUnread ? 'Unread. ' : ''}${event.requiresAction ? 'Action required. ' : ''}${visual.urgencyLabel} on ${objectLabel}${bidAmount ? `. ${bidPrefix} ${bidAmount}` : ''}. ${time}. Button: ${visual.actionLabel}`;

  const leading = (
    <NotificationStatusIcon
      icon={visual.icon}
      accentColor={accentColor}
      size={24}
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
      {bidAmount ? (
        <Text style={styles.bidAmount} numberOfLines={1}>
          {bidPrefix} {bidAmount}
        </Text>
      ) : null}
    </NotificationRowBase>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    title: {
      fontSize: Type.bodyStrong.size,
      fontFamily: FontFamily.regular,
      color: colors.textSecondary,
      lineHeight: Type.bodyStrong.lineHeight,
      flexShrink: 1,
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
    bidAmount: {
      fontSize: Type.body.size,
      fontFamily: FontFamily.semibold,
      color: colors.textPrimary,
      lineHeight: Type.body.lineHeight,
      fontVariant: ['tabular-nums'],
      marginTop: Space.xs / 2,
    },
  });
}
