import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Control, Stroke, FontFamily } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { RadiusRoleValue } from '../../theme/surfaceRadiusRules';
import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';
import { SwipeableRow } from '../SwipeableRow';
import { Caption } from '../ui/Text';
import { AvatarRing } from '../chat/AvatarRing';
import { InboxConversationRow } from '../chat/InboxConversationRow';
import { useBackendData } from '../../context/BackendDataContext';
import type { Conversation } from '../../domain';
import { colorForId, initialsFromName } from '../../utils/avatarColor';
import { formatInboxTimestamp, deriveInboxDeliveryStatus } from './inboxViewModels';

function ListingContextThumbnail({ itemId }: { itemId: string }) {
  const { colors } = useAppTheme();
  const { listings } = useBackendData();
  const listing = useMemo(() => listings.find((l) => l.id === itemId), [listings, itemId]);
  const listingThemed = useMemo(() => ({
    contextThumb: { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
  }), [colors]);
  if (!listing?.images?.[0]) {
    return (
      <View style={[styles.contextThumb, listingThemed.contextThumb]} accessible={false} importantForAccessibility="no-hide-descendants">
        <Ionicons name="bag-handle-outline" size={14} color={colors.textMuted} />
      </View>
    );
  }
  return (
    <View accessible={false} importantForAccessibility="no-hide-descendants">
      <CachedImage
        uri={listing.images[0]}
        style={styles.contextThumbImage}
        containerStyle={[styles.contextThumb, listingThemed.contextThumb]}
        contentFit="cover"
      />
    </View>
  );
}

export interface InboxRowProps {
  item: Conversation;
  index: number;
  currentUserId?: string;
  participantNameLookup: Map<string, string>;
  isRequest: boolean;
  isMuted: boolean;
  profileMediaOverrides: Record<string, { avatar: string | null; cover: string | null }>;
  itemThumbUri?: string | null;
  onOpenConversation: (conversationId: string) => void;
  onQuickActions: (conversationId: string) => void;
  onToggleRead: (conversationId: string) => void;
  onArchive: (conversationId: string) => void;
  onAcceptRequest: (conversationId: string) => void;
  onDeclineRequest: (conversationId: string) => void;
}

function InboxRowBase({
  item,
  index,
  currentUserId,
  participantNameLookup,
  isRequest,
  isMuted,
  profileMediaOverrides,
  itemThumbUri,
  onOpenConversation,
  onQuickActions,
  onToggleRead,
  onArchive,
  onAcceptRequest,
  onDeclineRequest,
}: InboxRowProps) {
  const { colors } = useAppTheme();
  const t = useMemo(() => ({
    rowSeparator: { backgroundColor: colors.border },
    groupAvatar: { backgroundColor: colors.surfaceAlt },
    groupAvatarText: { color: colors.textPrimary },
    botIndicator: { backgroundColor: colors.surface, borderColor: colors.border },
    nameText: { color: colors.textPrimary },
    snippet: { color: colors.textSecondary },
    requestRowAccent: { borderLeftColor: colors.brand, backgroundColor: colors.brandSubtle },
    requestBtnDecline: { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
    requestBtnDeclineText: { color: colors.textPrimary },
    requestBtnAccept: { backgroundColor: colors.brand },
    requestBtnAcceptText: { color: colors.textInverse },
  }), [colors]);

  const isGroup = item.type === 'group';
  const counterpartyId = item.participantIds?.find((id) => id !== 'me' && id !== currentUserId);
  const displayTitle = isGroup
    ? item.title ?? 'Untitled Group'
    : (counterpartyId ? participantNameLookup.get(counterpartyId) ?? 'Thryft user' : 'Thryft user');
  const safeDisplayTitle = String(displayTitle ?? 'Thryft user');
  const counterpartySummary = counterpartyId
    ? item.participantProfiles?.find((participant) => participant.id === counterpartyId)
    : undefined;
  const avatarEl = isGroup ? (
    <View style={[styles.groupAvatar, t.groupAvatar, !item.avatar && { backgroundColor: colorForId(item.id) }]}>
      {item.avatar ? (
        <CachedImage
          uri={item.avatar}
          style={styles.groupAvatarImage}
          contentFit="cover"
        />
      ) : (
        <Text style={[styles.groupAvatarText, t.groupAvatarText, !item.avatar && { color: colors.textInverse }]}>
          {initialsFromName(item.title)}
        </Text>
      )}
      {(item.botIds?.length ?? 0) > 0 && (
        <View style={[styles.botIndicator, t.botIndicator]} accessible={false} importantForAccessibility="no-hide-descendants">
          <Ionicons name="bulb-outline" size={14} color={colors.brand} />
        </View>
      )}
    </View>
  ) : (
    <AvatarRing
      uri={item.avatar ?? (counterpartyId ? profileMediaOverrides[counterpartyId]?.avatar ?? counterpartySummary?.avatar ?? undefined : undefined)}
      size={44}
      isUnread={item.unread}
          ringWidth={2}
      fallbackInitials={safeDisplayTitle === 'Thryft user' ? 'T' : safeDisplayTitle.slice(0, 2).toUpperCase()}
    />
  );
  const requestRow = (
    <View style={[styles.requestRowAccent, t.requestRowAccent]}>
      <View style={styles.requestRowInner}>
        {avatarEl}
        <View style={styles.messageBody}>
          <View style={styles.messageTop}>
            <Text style={[styles.nameText, t.nameText, styles.nameUnread]}>{displayTitle}</Text>
            <Caption color={colors.textMuted}>{formatInboxTimestamp(item.lastMessageTime)}</Caption>
          </View>
          <Text style={[styles.snippet, t.snippet]} numberOfLines={1}>{item.lastMessage}</Text>
          {item.itemId && (
            <View style={styles.requestListingContext}>
              <ListingContextThumbnail itemId={item.itemId} />
              <Text style={[styles.requestListingText, { color: colors.textSecondary }]}>About a listing</Text>
            </View>
          )}
          <View style={styles.requestActions}>
            <AnimatedPressable
              style={[styles.requestBtnDecline, t.requestBtnDecline]}
              onPress={() => onDeclineRequest(item.id)}
              activeOpacity={0.85}
              scaleValue={0.96}
              hapticFeedback="light"
              accessibilityLabel="Decline message request"
              accessibilityRole="button"
            >
              <Text style={[styles.requestBtnDeclineText, t.requestBtnDeclineText]}>Decline</Text>
            </AnimatedPressable>
            <AnimatedPressable
              style={[styles.requestBtnAccept, t.requestBtnAccept]}
              onPress={() => onAcceptRequest(item.id)}
              activeOpacity={0.85}
              scaleValue={0.96}
              hapticFeedback="medium"
              accessibilityLabel="Accept message request"
              accessibilityRole="button"
            >
              <Text style={[styles.requestBtnAcceptText, t.requestBtnAcceptText]}>Accept</Text>
            </AnimatedPressable>
          </View>
        </View>
      </View>
    </View>
  );
  // Delivery state is derived from the last stored message only — a
  // conversation fresh from the list endpoint carries a synthetic preview
  // message (sender 'system'), which yields no glyph. After a thread visit
  // or an optimistic send the real message is present and its status /
  // readStatus drives the check-clock-alert glyph truthfully.
  const lastStoredMessage = item.messages.length
    ? item.messages[item.messages.length - 1]
    : undefined;
  const conversationRow = (
    <InboxConversationRow
      displayTitle={safeDisplayTitle}
      lastMessage={item.lastMessage ?? ''}
      lastMessageTime={formatInboxTimestamp(item.lastMessageTime)}
      unread={!!item.unread}
      // No truthful unread count exists client-side (the list payload has
      // no per-message read cursor), so render the plain unread dot rather
      // than fabricate a number from message history length.
      unreadCount={undefined}
      deliveryStatus={deriveInboxDeliveryStatus(lastStoredMessage)}
      isPinned={!!item.isPinned}
      isMuted={isMuted}
      isGroup={isGroup}
      memberCount={isGroup ? item.participantIds?.length : undefined}
      draftText={item.draftText}
      itemId={item.itemId}
      itemThumbUri={itemThumbUri}
      avatarElement={avatarEl}
      onPress={() => onOpenConversation(item.id)}
      onLongPress={() => onQuickActions(item.id)}
      testID={index === 0 ? 'golden-inbox-first-conversation' : undefined}
    />
  );
  return (
    <View>
      {isRequest ? requestRow : (
        <SwipeableRow
          accessibilityLabel={safeDisplayTitle}
          accessibilityHint="Opens the conversation thread. Swipe right to mark read or unread, swipe left to archive, long press for quick actions"
          // The same handlers the inner row uses — the row is a single
          // grouped accessibility element, so activate/longpress and the
          // swipe actions are dispatched through SwipeableRow's
          // accessibilityActions. Touches that land on the inner
          // pressable still resolve to it first (responder negotiation).
          onPress={() => onOpenConversation(item.id)}
          onLongPress={() => onQuickActions(item.id)}
          leftAction={{
            icon: 'checkmark-done-outline',
            label: item.unread ? 'Mark read' : 'Mark unread',
            onPress: () => onToggleRead(item.id),
            color: colors.brand,
          }}
          rightAction={{
            icon: 'archive-outline',
            label: 'Archive',
            onPress: () => onArchive(item.id),
            color: colors.surfaceAlt,
          }}
        >
          {conversationRow}
        </SwipeableRow>
      )}
      {!isRequest && <View style={[styles.rowSeparator, t.rowSeparator]} />}
    </View>
  );
}

export const InboxRow = React.memo(InboxRowBase);

const styles = StyleSheet.create({
  rowSeparator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: Space.md + 40 + Space.sm + 2,
    marginRight: Space.md,
  },
  groupAvatar: {
    width: 40,
    height: 40,
    borderRadius: RadiusRoleValue.pillAvatar,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  groupAvatarImage: {
    width: 40,
    height: 40,
    borderRadius: RadiusRoleValue.pillAvatar,
  },
  groupAvatarText: {
    fontSize: TypographyV2.sectionTitle.size,
    fontFamily: FontFamily.bold,
  },
  botIndicator: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: Control.iconCompact,
    height: Control.iconCompact,
    borderRadius: RadiusRoleValue.pillAvatar,
    borderWidth: Stroke.emphasis,
    justifyContent: 'center',
    alignItems: 'center',
  },
  messageBody: { flex: 1, justifyContent: 'center', gap: Space.xs / 2 },
  messageTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Space.xs,
    alignItems: 'center',
  },
  nameText: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.body.letterSpacing,
  },
  nameUnread: {
    fontFamily: FontFamily.bold,
  },
  snippet: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.regular,
    lineHeight: TypographyV2.body.lineHeight,
    flex: 1,
  },
  contextThumb: {
    width: Space.lg + Space.xs,
    height: Space.lg + Space.xs,
    borderRadius: RadiusRoleValue.compactControl,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  contextThumbImage: {
    width: Space.lg + Space.xs,
    height: Space.lg + Space.xs,
  },
  requestListingContext: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    marginTop: Space.xs,
  },
  requestListingText: {
    fontFamily: FontFamily.semibold,
  },
  requestRowAccent: {
    borderLeftWidth: 3,
    marginHorizontal: Space.md,
    marginVertical: Space.xs,
    borderRadius: RadiusRoleValue.mediaThumbnail,
  },
  requestRowInner: {
    flexDirection: 'row',
    gap: Space.sm,
    alignItems: 'center',
    paddingVertical: Space.sm + 2,
    paddingHorizontal: Space.md,
    paddingLeft: Space.md - 2,
    minHeight: 68,
  },
  requestActions: {
    flexDirection: 'row',
    gap: Space.sm,
    marginTop: Space.sm,
  },
  requestBtnDecline: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Space.sm + 2,
    borderRadius: RadiusRoleValue.compactControl,
    borderWidth: StyleSheet.hairlineWidth,
  },
  requestBtnDeclineText: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.semibold,
  },
  requestBtnAccept: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Space.sm + 2,
    borderRadius: RadiusRoleValue.compactControl,
  },
  requestBtnAcceptText: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.semibold,
  },
});
