import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { View, Text, StyleSheet, RefreshControl } from 'react-native';
import { CachedImage } from '../components/CachedImage';
import { ConfirmationSheet } from '../components/ConfirmationSheet';
import { ActionSheet } from '../components/sheets';
import { FlashList, type FlashListProps, type FlashListRef } from '@shopify/flash-list';
import { AppIcon } from '../components/common/AppIcon';
import { useNavigation, useScrollToTop, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import NetInfo from '@react-native-community/netinfo';
import { useAppTheme } from '../theme/ThemeContext';
import type { Conversation } from '../domain';
import { RootStackParamList } from '../navigation/types';
import { SwipeableRow } from '../components/SwipeableRow';
import Reanimated, { useSharedValue, useAnimatedScrollHandler } from 'react-native-reanimated';
import { EmptyState } from '../components/EmptyState';
import { StateCopyView } from '../components/flagship';
import { useStore } from '../store/useStore';
import { useNotifications } from '../hooks/useNotifications';
import { RefreshIndicator } from '../components/RefreshIndicator';
import { useBackendData } from '../context/BackendDataContext';
import { fetchConversationsFromApi, deleteConversationOnApi } from '../services/chatApi';
import { useInboxMessageEvent, useInboxGroupIdentityEvent, realtimePayloadToMessage } from '../services/realtimeClient';
import { AppSearchBar } from '../components/ui/AppSearchBar';
import { useHaptic } from '../hooks/useHaptic';
import { Caption } from '../components/ui/Text';
import { AvatarRing } from '../components/chat/AvatarRing';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { InboxConversationRow } from '../components/chat/InboxConversationRow';
import { OfflineBanner } from '../components/OfflineBanner';
import { MessagingSegmentRail, MessagingSegment } from '../components/chat/MessagingSegmentRail';
import { classifyConversation } from '../utils/conversationClassification';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { Space, Control, Stroke, FontFamily } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { RadiusRoleValue } from '../theme/surfaceRadiusRules';
import { useVisuallyComplete } from '../performance/visuallyComplete';
import { colorForId, initialsFromName } from '../utils/avatarColor';
type NavT = NativeStackNavigationProp<RootStackParamList>;
type InboxRoute = RouteProp<RootStackParamList, 'Inbox'>;
type ConvoItem = Conversation;
type InboxSegment = MessagingSegment | 'unread' | 'archived' | 'groups';

const AnimatedFlashList = Reanimated.createAnimatedComponent(FlashList) as unknown as React.ComponentClass<FlashListProps<Conversation>>;

function ListingContextThumbnail({ itemId }: { itemId: string }) {
  const { colors } = useAppTheme();
  const { listings } = useBackendData();
  const listing = useMemo(() => listings.find((l) => l.id === itemId), [listings, itemId]);
  const listingThemed = useMemo(() => ({
    contextThumb: { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
  }), [colors]);
  if (!listing?.images?.[0]) {
    return (
      <View style={[styles.contextThumb, listingThemed.contextThumb]}>
        <AppIcon name="pricetag" size={14} color={colors.textMuted} />
      </View>
    );
  }
  return (
    <CachedImage
      uri={listing.images[0]}
      style={styles.contextThumbImage}
      containerStyle={[styles.contextThumb, listingThemed.contextThumb]}
      contentFit="cover"
    />
  );
}

export default function InboxScreen() {
  const { colors, isDark } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const navigation = useNavigation<NavT>();
  const route = useRoute<InboxRoute>();
  const filterItemId = route.params?.filterItemId;
  const { showSuccess, showInfo, showError } = useNotifications();
  const haptic = useHaptic();
  const { refreshListings, listings } = useBackendData();
  const currentUser = useStore((state) => state.currentUser);
  const conversations = useStore((state) => state.conversations);
  const upsertConversation = useStore((state) => state.upsertConversation);
  const deleteConversation = useStore((state) => state.deleteConversation);
  const toggleConversationPinned = useStore((state) => state.toggleConversationPinned);
  const markConversationRead = useStore((state) => state.markConversationRead);
  const toggleConversationUnread = useStore((state) => state.toggleConversationUnread);
  const toggleMutedConversation = useStore((state) => state.toggleMutedConversation);
  const toggleArchivedConversation = useStore((state) => state.toggleArchivedConversation);
  const archivedIds = useStore((state) => state.archivedConversationIds);
  useVisuallyComplete('Inbox');
  const mutedIds = useStore((state) => state.mutedConversationIds);
  const messageRequests = useStore((state) => state.messageRequests);
  const acceptMessageRequest = useStore((state) => state.acceptMessageRequest);
  const declineMessageRequest = useStore((state) => state.declineMessageRequest);
  const markConversationsLoaded = useStore((state) => state.markConversationsLoaded);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [segment, setSegment] = useState<InboxSegment>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [syncError, setSyncError] = useState('');
  const [isOffline, setIsOffline] = useState(false);
  // Search is behind an icon in the first viewport — expands on tap.
  const [searchVisible, setSearchVisible] = useState(false);
  // Additional classifiers (Requests, Unread, Archived, Groups) are behind
  // a filter icon — expands on tap to show secondary scope chips.
  const [filterExpanded, setFilterExpanded] = useState(false);
  const [confirmSheet, setConfirmSheet] = useState<{
    visible: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    onConfirm: () => void;
    variant?: 'default' | 'danger';
  }>({ visible: false, title: '', message: '', onConfirm: () => {} });
  const [actionSheet, setActionSheet] = useState<{
    visible: boolean;
    conversationId: string;
    isMuted: boolean;
    isPinned: boolean;
  }>({ visible: false, conversationId: '', isMuted: false, isPinned: false });
  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      if (!reducedMotion) {
        scrollY.value = e.contentOffset.y;
      }
    },
  });
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOffline(!state.isConnected);
    });
    return () => unsubscribe();
  }, []);
  const loadBotsFromApi = useStore((state) => state.loadBotsFromApi);
  const loadConversations = async () => {
    setSyncError('');
    setIsLoading(true);
    try {
      const [remoteConversations] = await Promise.all([
        fetchConversationsFromApi(),
        loadBotsFromApi(),
      ]);
      for (const conversation of remoteConversations) {
        upsertConversation(conversation);
      }
    } catch (error) {
      setSyncError((error as Error).message || 'Unable to load conversations.');
    } finally {
      setIsLoading(false);
      markConversationsLoaded();
    }
  };
  useEffect(() => {
    void loadConversations();
  }, []);

  // Realtime subscription — live-update inbox rows when new messages arrive
  // on any loaded conversation. useInboxMessageEvent subscribes to every
  // conversation topic currently in the store and reconciles as the list
  // changes.
  useInboxMessageEvent(
    useCallback(
      (payload) => {
        const existing = conversations.find((c) => c.id === payload.conversationId);
        const domainMessage = realtimePayloadToMessage(payload, currentUser?.id);

        // If the conversation isn't in the local store yet, reload the full
        // inbox so the new thread appears.
        if (!existing) {
          void loadConversations();
          return;
        }

        // Skip messages the current user just sent — the sending surface
        // already optimistically updated the row.
        const isOwnMessage = Boolean(
          currentUser?.id && payload.senderType === 'user' && payload.senderUserId === currentUser.id,
        );

        // Deduplicate — the store may already hold this message after an
        // optimistic send or a prior realtime event.
        const alreadyStored = existing.messages.some((m) => m.id === domainMessage.id);

        const nextLastMessage =
          domainMessage.text ??
          (domainMessage.mediaType === 'image'
            ? '📷 Photo'
            : domainMessage.mediaType === 'video'
              ? '🎥 Video'
              : domainMessage.systemTitle) ??
          'New message';

        upsertConversation({
          ...existing,
          lastMessage: nextLastMessage,
          lastMessageTime: domainMessage.timestamp,
          unread: isOwnMessage ? existing.unread : true,
          messages: alreadyStored ? existing.messages : [...existing.messages, domainMessage],
        });
      },
      [conversations, currentUser?.id, upsertConversation],
    ),
  );

  // Realtime group identity updates — when an admin changes the group name,
  // avatar, cover, or description, merge it into the inbox store so the row
  // title and avatar stay current without a manual refetch.
  useInboxGroupIdentityEvent(
    useCallback(
      (payload) => {
        const existing = conversations.find((c) => c.id === payload.conversationId);
        if (!existing) return;
        upsertConversation({
          ...existing,
          title: payload.title ?? existing.title,
          description: payload.description ?? existing.description,
          avatar: payload.avatar !== undefined ? (payload.avatar ?? undefined) : existing.avatar,
          coverPhoto: payload.coverPhoto !== undefined ? (payload.coverPhoto ?? undefined) : existing.coverPhoto,
        });
      },
      [conversations, upsertConversation],
    ),
  );

  const handleRefresh = async () => {
    haptic.patterns.refresh();
    setRefreshing(true);
    setSyncError('');
    await refreshListings();
    try {
      const [remoteConversations] = await Promise.all([
        fetchConversationsFromApi(),
        loadBotsFromApi(),
      ]);
      for (const conversation of remoteConversations) {
        upsertConversation(conversation);
      }
    } catch (error) {
      setSyncError((error as Error).message || 'Unable to refresh conversations.');
    }
    setRefreshing(false);
  };
  const listRef = useRef<FlashListRef<Conversation>>(null);
  useScrollToTop(listRef);
  const t = useMemo(() => ({
    screenRoot: { backgroundColor: colors.background },
    headerTitle: { color: colors.textPrimary },
    iconBtn: { backgroundColor: 'transparent' },
    newMessageBtn: { backgroundColor: colors.textPrimary },
    newMessageBtnText: { color: colors.textInverse },
    searchWrap: { backgroundColor: colors.surfaceAlt },
    rowSeparator: { backgroundColor: colors.border },
    groupAvatar: { backgroundColor: colors.surfaceAlt },
    groupAvatarText: { color: colors.textPrimary },
    botIndicator: { backgroundColor: colors.surface, borderColor: colors.border },
    nameText: { color: colors.textPrimary },
    snippet: { color: colors.textSecondary },
    unreadPill: { backgroundColor: colors.textPrimary },
    unreadPillText: { color: colors.textInverse },
    requestRowAccent: { borderLeftColor: colors.brand, backgroundColor: colors.brandSubtle },
    requestBtnDecline: { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
    requestBtnDeclineText: { color: colors.textPrimary },
    requestBtnAccept: { backgroundColor: colors.brand },
    requestsAvatar: { backgroundColor: colors.brandSubtle },
    requestsBadge: { backgroundColor: colors.textPrimary },
    requestsBadgeText: { color: colors.textInverse },
    requestsBannerText: { color: colors.textPrimary },
    requestsBannerSub: { color: colors.textMuted },
    requestBtnAcceptText: { color: colors.textInverse },
    errorBanner: { backgroundColor: colors.dangerSubtle, borderBottomColor: colors.border },
    errorBannerTitle: { color: colors.danger },
    errorBannerSub: { color: colors.textMuted },
    errorBannerRetry: { color: colors.brand },
    filterChipSecondary: { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
    filterChipSecondaryActive: { backgroundColor: colors.textPrimary, borderColor: colors.textPrimary },
    filterChipSecondaryText: { color: colors.textSecondary },
    filterChipSecondaryTextActive: { color: colors.textInverse },
    filterDot: { backgroundColor: colors.brand },
  }), [colors]);
  const participantNameLookup = useMemo(() => {
    const map = new Map<string, string>();
    map.set('me', currentUser?.username ?? 'you');
    if (currentUser?.id) {
      map.set(currentUser.id, currentUser.username);
    }
    for (const conversation of conversations) {
      for (const participant of conversation.participantProfiles ?? []) {
        map.set(participant.id, participant.displayName || participant.username);
      }
    }
    return map;
  }, [conversations, currentUser?.id, currentUser?.username]);
  const profileMediaOverrides = useStore((s) => s.profileMediaOverrides);
  const visibleConversations = useMemo(() => {
    const normalizedQuery = String(searchQuery ?? '').trim().toLowerCase();
    const scoped = conversations.filter((conversation) => {
      // Listing-scoped view (from ManageListingScreen "View questions"):
      // restrict to conversations about this listing only.
      if (filterItemId && conversation.itemId !== filterItemId) return false;
      const isArchived = archivedIds.includes(conversation.id);
      const isRequest = messageRequests.includes(conversation.id);
      if (segment === 'unread' && !conversation.unread) return false;
      if (segment === 'groups' && conversation.type !== 'group') return false;
      if (segment === 'buying' && !classifyConversation(conversation, currentUser?.id).isBuying) return false;
      if (segment === 'selling' && !classifyConversation(conversation, currentUser?.id).isSelling) return false;
      if (segment === 'requests') return isRequest;
      if (segment === 'archived') return isArchived;

      // In 'all', hide requests and archived from main inbox

      if (segment === 'all' && (isArchived || isRequest)) return false;
      if (!normalizedQuery) return true;
      const counterpartyId = conversation.participantIds?.find((id) => id !== 'me' && id !== currentUser?.id);
      const title = conversation.type === 'group'
        ? conversation.title ?? 'group chat'
        : (counterpartyId ? participantNameLookup.get(counterpartyId) ?? 'Thryft user' : 'Thryft user');
      const corpus = [
        title,
        conversation.lastMessage ?? '',
        ...conversation.messages.slice(-10).map((m) => m.text ?? m.systemTitle ?? ''),
      ].join(' ').toLowerCase();
      return corpus.includes(normalizedQuery);
    });
    const ordered = [...scoped];
    ordered.sort((a, b) => {
      const pinDiff = Number(b.isPinned) - Number(a.isPinned);
      if (pinDiff !== 0) return pinDiff;
      const unreadDiff = Number(b.unread) - Number(a.unread);
      if (unreadDiff !== 0) return unreadDiff;
      return b.lastMessageTime.localeCompare(a.lastMessageTime);
    });
    return ordered;
  }, [conversations, searchQuery, segment, currentUser?.id, participantNameLookup, archivedIds, messageRequests, filterItemId]);
  const unreadCount = useMemo(() => visibleConversations.filter((c) => c.unread).length, [visibleConversations]);
  const buyingUnreadCount = useMemo(
    () => conversations.filter(
      (c) => !archivedIds.includes(c.id) && !messageRequests.includes(c.id) && c.unread && classifyConversation(c, currentUser?.id).isBuying
    ).length,
    [conversations, archivedIds, messageRequests, currentUser?.id]
  );
  const sellingUnreadCount = useMemo(
    () => conversations.filter(
      (c) => !archivedIds.includes(c.id) && !messageRequests.includes(c.id) && c.unread && classifyConversation(c, currentUser?.id).isSelling
    ).length,
    [conversations, archivedIds, messageRequests, currentUser?.id]
  );
  const handleDelete = useCallback((id: string) => {
    haptic.medium();
    setConfirmSheet({
      visible: true,
      title: 'Remove from inbox?',
      message: 'This conversation will be hidden from your inbox. The other participant keeps their copy.',
      confirmLabel: 'Remove',
      variant: 'danger',
      onConfirm: async () => {
        setConfirmSheet((s) => ({ ...s, visible: false }));
        const previous = conversations.find((c) => c.id === id);
        deleteConversation(id);
        showError('Conversation removed', 'This conversation was removed from your inbox.');
        try {
          await deleteConversationOnApi(id, 'me');
        } catch {
          showError('Delete failed', 'Failed to delete on server. Restoring conversation.');
          if (previous) {
            upsertConversation(previous);
          }
        }
      },
    });
  }, [conversations, deleteConversation, upsertConversation, showError, haptic]);
  const handleMute = useCallback((id: string) => {
    haptic.light();
    const nowMuted = !mutedIds.includes(id);
    toggleMutedConversation(id)
      .then(() => {
        showInfo(nowMuted ? 'Conversation muted' : 'Conversation unmuted');
      })
      .catch(() => {
        showError('Action failed', 'Could not update mute status. Check your connection and try again.');
      });
  }, [toggleMutedConversation, mutedIds, showInfo, showError, haptic]);
  const handleArchive = useCallback((id: string) => {
    haptic.light();
    const nowArchived = !archivedIds.includes(id);
    toggleArchivedConversation(id)
      .then(() => {
        showInfo(nowArchived ? 'Conversation archived' : 'Conversation unarchived');
      })
      .catch(() => {
        showError('Action failed', 'Could not update archive status. Check your connection and try again.');
      });
  }, [toggleArchivedConversation, archivedIds, showInfo, showError, haptic]);
  const handleAcceptRequest = useCallback((id: string) => {
    haptic.medium();
    acceptMessageRequest(id)
      .then(() => {
        showSuccess('Request accepted', 'Message request accepted.');
      })
      .catch(() => {
        showError('Action failed', 'Could not accept this request. Check your connection and try again.');
      });
  }, [acceptMessageRequest, showSuccess, showError, haptic]);
  const handleDeclineRequest = useCallback((id: string) => {
    haptic.medium();
    declineMessageRequest(id)
      .then(() => {
        showInfo('Request declined', 'Message request declined.');
      })
      .catch(() => {
        showError('Action failed', 'Could not decline this request. Check your connection and try again.');
      });
  }, [declineMessageRequest, showInfo, showError, haptic]);
  const handlePin = useCallback((id: string) => {
    haptic.medium();
    toggleConversationPinned(id);
    showSuccess('Pinned', 'Conversation pinned.');
  }, [toggleConversationPinned, showSuccess, haptic]);
  const handleToggleRead = useCallback((id: string) => {
    const convo = conversations.find((c) => c.id === id);
    const willMarkUnread = convo ? !convo.unread : false;
    haptic.light();
    toggleConversationUnread(id);
    showInfo(willMarkUnread ? 'Marked unread' : 'Marked read', willMarkUnread ? 'Conversation marked as unread' : 'Conversation marked as read');
  }, [conversations, toggleConversationUnread, showInfo, haptic]);

  // Long-press quick actions: an ActionSheet exposing mute, pin, and
  // delete. Preserves the capabilities previously surfaced via the old
  // multi-button swipe panels (AGENTS.md §8: preserve working functionality).
  const handleQuickActions = useCallback((id: string) => {
    const convo = conversations.find((c) => c.id === id);
    const isMuted = mutedIds.includes(id);
    const isPinned = !!convo?.isPinned;
    haptic.medium();
    setActionSheet({ visible: true, conversationId: id, isMuted, isPinned });
  }, [conversations, mutedIds, haptic]);

  // FlashList v2 performance: memoized renderItem prevents full re-render of
  // all visible conversation rows on every parent state change.
  // (Audit §FlashList v2 / LIST_RENDERING_POLICY.md §3.1)
  const renderItem = useCallback(({ item, index }: { item: ConvoItem; index: number }) => {
    const isGroup = item.type === 'group';
    const counterpartyId = item.participantIds?.find((id) => id !== 'me' && id !== currentUser?.id);
    const displayTitle = isGroup
      ? item.title ?? 'Untitled Group'
      : (counterpartyId ? participantNameLookup.get(counterpartyId) ?? 'Thryft user' : 'Thryft user');
    const safeDisplayTitle = String(displayTitle ?? 'Thryft user');
    const isRequest = messageRequests.includes(item.id);
    const isMuted = mutedIds.includes(item.id);
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
          <View style={[styles.botIndicator, t.botIndicator]}>
            <AppIcon name="sparkles" size={14} color={colors.brand} />
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
              <Caption color={colors.textMuted}>{item.lastMessageTime}</Caption>
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
                onPress={() => handleDeclineRequest(item.id)}
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
                onPress={() => handleAcceptRequest(item.id)}
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
    const conversationRow = (
      <InboxConversationRow
        displayTitle={safeDisplayTitle}
        lastMessage={item.lastMessage ?? ''}
        lastMessageTime={item.lastMessageTime}
        unread={!!item.unread}
        unreadCount={item.unread ? item.messages.filter(m => m.sender !== 'me' && !m.isSystem).length : undefined}
        isPinned={!!item.isPinned}
        isMuted={isMuted}
        isGroup={isGroup}
        memberCount={isGroup ? item.participantIds?.length : undefined}
        draftText={item.draftText}
        itemId={item.itemId}
        itemThumbUri={item.itemId ? (() => {
          const listing = listings.find((l) => l.id === item.itemId);
          return listing?.images?.[0] ?? null;
        })() : undefined}
        listingContextThumb={item.itemId ? <ListingContextThumbnail itemId={item.itemId} /> : undefined}
        avatarElement={avatarEl}
        onPress={() => {
          markConversationRead(item.id);
          navigation.navigate('Chat', {
            conversationId: item.id,
            focusQuery: searchQuery.trim() || undefined,
          });
        }}
        onLongPress={() => handleQuickActions(item.id)}
        testID={index === 0 ? 'golden-inbox-first-conversation' : undefined}
      />
    );
    return (
      <View>
        {isRequest ? requestRow : (
          <SwipeableRow
            accessibilityLabel={safeDisplayTitle}
            accessibilityHint="Opens the conversation thread. Swipe right to mark read or unread, swipe left to archive, long press for quick actions"
            leftAction={{
              icon: 'checkmark-done-outline',
              label: item.unread ? 'Mark unread' : 'Mark read',
              onPress: () => handleToggleRead(item.id),
              color: colors.brand,
            }}
            rightAction={{
              icon: 'archive-outline',
              label: 'Archive',
              onPress: () => handleArchive(item.id),
              color: colors.surfaceAlt,
            }}
          >
            {conversationRow}
          </SwipeableRow>
        )}
        {!isRequest && <View style={[styles.rowSeparator, t.rowSeparator]} />}
      </View>
    );
  }, [
    currentUser,
    participantNameLookup,
    messageRequests,
    mutedIds,
    profileMediaOverrides,
    styles,
    t,
    colors,
    listings,
    searchQuery,
    markConversationRead,
    navigation,
    handleQuickActions,
    handleDeclineRequest,
    handleAcceptRequest,
    handleToggleRead,
    handleArchive,
  ]);
  return (
    <SafeAreaView testID="inbox-screen" edges={['top']} style={[styles.screenRoot, t.screenRoot]}>
      <View style={styles.compactHeader}>
        <Text style={[styles.headerTitle, t.headerTitle]}>Inbox</Text>
        <View style={styles.headerActions}>
          <AnimatedPressable
            style={[styles.iconBtn, t.iconBtn]}
            onPress={() => {
              setSearchVisible((v) => !v);
              if (searchVisible) setSearchQuery('');
            }}
            activeOpacity={0.7}
            scaleValue={0.95}
            hapticFeedback="light"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityLabel="Search messages"
            accessibilityHint="Opens the search bar to find conversations"
            accessibilityRole="button"
          >
            <AppIcon
              name="search"
              focused={searchVisible}
              size={20}
              color={searchVisible ? colors.brand : colors.textSecondary}
            />
          </AnimatedPressable>
          <AnimatedPressable
            style={[styles.iconBtn, t.iconBtn]}
            onPress={() => setFilterExpanded((v) => !v)}
            activeOpacity={0.7}
            scaleValue={0.95}
            hapticFeedback="light"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityLabel="More filters"
            accessibilityHint="Shows additional filters: unread, archived, groups"
            accessibilityRole="button"
          >
            <AppIcon
              name="options"
              focused={filterExpanded}
              size={20}
              color={filterExpanded || ['unread', 'archived', 'groups'].includes(segment) ? colors.brand : colors.textSecondary}
            />
            {['unread', 'archived', 'groups'].includes(segment) && !filterExpanded ? (
              <View style={[styles.filterDot, t.filterDot]} />
            ) : null}
          </AnimatedPressable>
          <AnimatedPressable
            style={[styles.iconBtn, t.iconBtn]}
            onPress={() => navigation.navigate('ChatSettings')}
            activeOpacity={0.7}
            scaleValue={0.95}
            hapticFeedback="light"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityLabel="Message settings"
            accessibilityHint="Opens privacy, automation, and quick reply settings"
            accessibilityRole="button"
          >
            <AppIcon name="settings" size={20} color={colors.textSecondary} />
          </AnimatedPressable>
          <AnimatedPressable
            style={[styles.newMessageBtn, t.newMessageBtn]}
            onPress={() => navigation.navigate('NewMessage')}
            activeOpacity={0.7}
            scaleValue={0.95}
            hapticFeedback="light"
            accessibilityLabel="New message"
            accessibilityRole="button"
          >
            <AppIcon name="edit" size={18} color={colors.textInverse} />
            <Text style={[styles.newMessageBtnText, t.newMessageBtnText]}>New</Text>
          </AnimatedPressable>
        </View>
      </View>
      <View style={styles.header}>
        {searchVisible && (
          <AppSearchBar
            placeholder="Search messages"
            value={searchQuery}
            onChangeText={setSearchQuery}
            containerStyle={[styles.searchWrap, t.searchWrap]}
            inputProps={{
              autoCapitalize: 'none',
              autoCorrect: false,
              accessibilityLabel: 'Search conversations',
            }}
          />
        )}
        <MessagingSegmentRail
          active={segment === 'all' || segment === 'buying' || segment === 'selling' || segment === 'requests' ? segment : 'all'}
          onChange={(s) => setSegment(s)}
          requestCount={messageRequests.length}
          buyingCount={buyingUnreadCount}
          sellingCount={sellingUnreadCount}
        />
        {filterExpanded && (
          <View style={styles.filterChips}>
            {([
              { key: 'unread' as const, label: 'Unread', badge: unreadCount },
              { key: 'archived' as const, label: 'Archived', badge: archivedIds.length },
              { key: 'groups' as const, label: 'Groups', badge: conversations.filter(c => c.type === 'group').length },
            ]).map((chip) => {
              const isActive = segment === chip.key;
              return (
                <AnimatedPressable
                  key={chip.key}
                  style={[
                    styles.filterChip,
                    t.filterChipSecondary,
                    isActive && t.filterChipSecondaryActive,
                  ]}
                  onPress={() => {
                    haptic.light();
                    setSegment(chip.key);
                    setFilterExpanded(false);
                  }}
                  activeOpacity={0.85}
                  scaleValue={0.96}
                  hapticFeedback="light"
                  accessibilityRole="tab"
                  accessibilityState={{ selected: isActive }}
                  accessibilityLabel={`${chip.label} filter${chip.badge ? `, ${chip.badge} pending` : ''}`}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      t.filterChipSecondaryText,
                      isActive && t.filterChipSecondaryTextActive,
                    ]}
                    numberOfLines={1}
                  >
                    {chip.label}
                  </Text>
                  {(chip.badge ?? 0) > 1 ? (
                    <View style={[styles.unreadPill, t.unreadPill, isActive && { backgroundColor: `${colors.textInverse}30` /* TODO: no textInverseSubtle token available */ }]}>
                      <Text style={[styles.unreadPillText, t.unreadPillText, isActive && { color: colors.textInverse }]}>
                        {chip.badge! > 99 ? '99+' : chip.badge}
                      </Text>
                    </View>
                  ) : null}
                </AnimatedPressable>
              );
            })}
          </View>
        )}
      </View>
      {filterItemId && (
        <View style={[styles.itemFilterBanner, { backgroundColor: colors.surfaceAlt, borderBottomColor: colors.border }]}>
          <AppIcon name="tag" size={14} color={colors.brand} />
          <Text style={[styles.itemFilterBannerText, { color: colors.textSecondary }]} numberOfLines={1}>
            Questions about this listing
          </Text>
          <AnimatedPressable
            onPress={() => navigation.setParams({ filterItemId: undefined })}
            activeOpacity={0.7}
            scaleValue={0.95}
            hapticFeedback="light"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Clear listing filter"
          >
            <Text style={[styles.itemFilterBannerClear, { color: colors.brand }]}>All</Text>
          </AnimatedPressable>
        </View>
      )}
      {isOffline && (
        <OfflineBanner message="You are offline" />
      )}
      {!!syncError && (
        <View style={[styles.errorBanner, t.errorBanner]}>
          <AppIcon name="alert" size={16} color={colors.danger} />
          <View style={styles.errorBannerCopy}>
            <Text style={[styles.errorBannerTitle, t.errorBannerTitle]}>Couldn't sync messages</Text>
            <Text style={[styles.errorBannerSub, t.errorBannerSub]}>Check your connection or retry.</Text>
          </View>
          <AnimatedPressable
            onPress={() => void loadConversations()}
            activeOpacity={0.7}
            scaleValue={0.95}
            hapticFeedback="light"
            accessibilityLabel="Retry loading conversations"
            style={styles.errorBannerRetryBtn}
          >
            <Text style={[styles.errorBannerRetry, t.errorBannerRetry]}>Retry</Text>
          </AnimatedPressable>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <RefreshIndicator scrollY={scrollY} isRefreshing={refreshing} topInset={20} />
        {isLoading && !visibleConversations.length ? (
          <View style={styles.skeletonList}>
            {Array.from({ length: 6 }).map((_, i) => (
              <View key={i} style={styles.skeletonRow}>
                <SkeletonLoader width={40} height={40} borderRadius={RadiusRoleValue.pillAvatar} />
                <View style={styles.skeletonText}>
                  <SkeletonLoader width="70%" height={16} borderRadius={RadiusRoleValue.compactControl} />
                  <SkeletonLoader width="40%" height={14} borderRadius={RadiusRoleValue.compactControl} />
                </View>
              </View>
            ))}
          </View>
        ) : (
          <>
            {segment === 'all' && messageRequests.length > 0 && !filterExpanded && (
              <View style={styles.requestsBanner}>
                <AnimatedPressable
                  onPress={() => navigation.navigate('MessageRequests')}
                  activeOpacity={0.85}
                  scaleValue={0.98}
                  hapticFeedback="light"
                  accessibilityLabel={`${messageRequests.length} message requests`}
                  accessibilityRole="button"
                  style={styles.requestsBannerTap}
                >
                  <View style={[styles.requestsAvatar, t.requestsAvatar]}>
                    <AppIcon name="mailUnread" size={18} color={colors.brand} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.requestsBannerText, t.requestsBannerText]}>Message Requests</Text>
                    <Text style={[styles.requestsBannerSub, t.requestsBannerSub]}>
                      {messageRequests.length} pending {messageRequests.length === 1 ? 'request' : 'requests'}
                    </Text>
                  </View>
                  <View style={[styles.requestsBadge, t.requestsBadge]}>
                    <Text style={[styles.requestsBadgeText, t.requestsBadgeText]}>{messageRequests.length}</Text>
                  </View>
                  <AppIcon name="forward" size={16} color={colors.textMuted} />
                </AnimatedPressable>
              </View>
            )}
            <AnimatedFlashList
              ref={listRef as unknown as React.Ref<React.Component<FlashListProps<Conversation>>>}
              data={visibleConversations}
              keyExtractor={(c: Conversation) => c.id}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.listContent}
              renderItem={renderItem}
              onScroll={scrollHandler}
              scrollEventThrottle={16}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={handleRefresh}
                  tintColor="transparent"
                  colors={['transparent']}
                  progressBackgroundColor="transparent"
                />
              }
              ListEmptyComponent={
                (() => {
                  if (searchQuery.trim()) {
                    return (
                      <StateCopyView
                        state="emptyFiltered"
                        copyKey="conversations"
                        onRetry={() => setSearchQuery('')}
                      />
                    );
                  }
                  switch (segment) {
                    case 'unread':
                      return (
                        <EmptyState
                          icon="mail-open-outline"
                          title="No unread messages"
                          subtitle="You're all caught up."
                          ctaLabel="View all"
                          onCtaPress={() => setSegment('all')}
                        />
                      );
                    case 'requests':
                      return (
                        <EmptyState
                          icon="mail-unread-outline"
                          title="No message requests"
                          subtitle="Requests from people you don't follow will appear here."
                          ctaLabel="View all"
                          onCtaPress={() => setSegment('all')}
                        />
                      );
                    case 'archived':
                      return (
                        <EmptyState
                          icon="archive-outline"
                          title="No archived conversations"
                          subtitle="Archived chats will appear here."
                          ctaLabel="View all"
                          onCtaPress={() => setSegment('all')}
                        />
                      );
                    case 'groups':
                      return (
                        <EmptyState
                          icon="people-outline"
                          title="No groups yet"
                          subtitle="Create a group to chat with multiple people."
                          ctaLabel="Create group"
                          onCtaPress={() => navigation.navigate('CreateGroupChat')}
                        />
                      );
                    case 'buying':
                      return (
                        <EmptyState
                          icon="cart-outline"
                          title="No buying conversations"
                          subtitle="When you message a seller about a listing, it'll appear here."
                          ctaLabel="Browse listings"
                          onCtaPress={() => navigation.navigate('MainTabs')}
                        />
                      );
                    case 'selling':
                      return (
                        <EmptyState
                          icon="chatbubbles-outline"
                          title="No selling conversations"
                          ctaLabel="View all"
                          onCtaPress={() => setSegment('all')}
                        />
                      );
                    default:
                      return (
                        <StateCopyView
                          state="empty"
                          copyKey="conversations"
                          emptyCtaLabel="Browse listings"
                          onEmptyCta={() => navigation.navigate('MainTabs')}
                        />
                      );
                  }
                })()
              }
            />
          </>
        )}
      </View>
      <ConfirmationSheet
        visible={confirmSheet.visible}
        onDismiss={() => setConfirmSheet((s) => ({ ...s, visible: false }))}
        title={confirmSheet.title}
        message={confirmSheet.message}
        confirmLabel={confirmSheet.confirmLabel ?? 'Confirm'}
        variant={confirmSheet.variant ?? 'default'}
        onConfirm={confirmSheet.onConfirm}
      />
      <ActionSheet
        visible={actionSheet.visible}
        onDismiss={() => setActionSheet((s) => ({ ...s, visible: false }))}
        snapPoint={0.36}
      >
        <View style={styles.actionSheetBody}>
          <Text style={[styles.actionSheetTitle, { color: colors.textPrimary }]}>
            Conversation
          </Text>
          <View style={styles.actionSheetList}>
            <AnimatedPressable
              style={[styles.actionSheetRow, { backgroundColor: colors.surfaceAlt }]}
              onPress={() => {
                const id = actionSheet.conversationId;
                setActionSheet((s) => ({ ...s, visible: false }));
                handleMute(id);
              }}
              activeOpacity={0.7}
              scaleValue={0.98}
              hapticFeedback="light"
              accessibilityRole="button"
              accessibilityLabel={actionSheet.isMuted ? 'Unmute conversation' : 'Mute conversation'}
            >
              <AppIcon
                name={actionSheet.isMuted ? 'notifications' : 'notificationsOff'}
                size={22}
                color={colors.brand}
              />
              <Text style={[styles.actionSheetRowLabel, { color: colors.textPrimary }]}>
                {actionSheet.isMuted ? 'Unmute' : 'Mute'}
              </Text>
            </AnimatedPressable>
            <AnimatedPressable
              style={[styles.actionSheetRow, { backgroundColor: colors.surfaceAlt }]}
              onPress={() => {
                const id = actionSheet.conversationId;
                setActionSheet((s) => ({ ...s, visible: false }));
                handlePin(id);
              }}
              activeOpacity={0.7}
              scaleValue={0.98}
              hapticFeedback="light"
              accessibilityRole="button"
              accessibilityLabel={actionSheet.isPinned ? 'Unpin conversation' : 'Pin conversation'}
            >
              <AppIcon
                name="pin"
                focused={!actionSheet.isPinned}
                size={22}
                color={colors.brand}
              />
              <Text style={[styles.actionSheetRowLabel, { color: colors.textPrimary }]}>
                {actionSheet.isPinned ? 'Unpin' : 'Pin'}
              </Text>
            </AnimatedPressable>
            <AnimatedPressable
              style={[styles.actionSheetRow, { backgroundColor: colors.surfaceAlt }]}
              onPress={() => {
                const id = actionSheet.conversationId;
                setActionSheet((s) => ({ ...s, visible: false }));
                handleDelete(id);
              }}
              activeOpacity={0.7}
              scaleValue={0.98}
              hapticFeedback="medium"
              accessibilityRole="button"
              accessibilityLabel="Delete conversation"
            >
              <AppIcon name="trash" size={22} color={colors.danger} />
              <Text style={[styles.actionSheetRowLabel, { color: colors.danger }]}>
                Delete
              </Text>
            </AnimatedPressable>
          </View>
          <AnimatedPressable
            style={[styles.actionSheetCancelBtn, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
            onPress={() => setActionSheet((s) => ({ ...s, visible: false }))}
            activeOpacity={0.7}
            scaleValue={0.98}
            hapticFeedback="light"
            accessibilityRole="button"
            accessibilityLabel="Cancel"
          >
            <Text style={[styles.actionSheetCancelText, { color: colors.textPrimary }]}>
              Cancel
            </Text>
          </AnimatedPressable>
        </View>
      </ActionSheet>
    </SafeAreaView>
    );
}

const styles = StyleSheet.create({
  screenRoot: {
    flex: 1,
  },
  compactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.xs / 2,
  },
  header: {
    paddingHorizontal: Space.md,
    paddingTop: Space.xs + 2,
    paddingBottom: 0,
    gap: Space.sm,
  },
  headerTitle: {
    fontSize: TypographyV2.screenTitle.size,
    fontFamily: FontFamily.bold,
    letterSpacing: TypographyV2.screenTitle.letterSpacing,
    lineHeight: TypographyV2.screenTitle.lineHeight,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  iconBtn: {
    width: Space.xxl,
    height: Space.xxl,
    borderRadius: RadiusRoleValue.pillAvatar,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterDot: {
    position: 'absolute',
    top: Space.xs,
    right: Space.xs,
    width: Space.xs,
    height: Space.xs,
    borderRadius: RadiusRoleValue.pillAvatar,
  },
  newMessageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    borderRadius: RadiusRoleValue.pillAvatar,
  },
  newMessageBtnText: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.semibold,
  },
  searchWrap: {
    borderRadius: RadiusRoleValue.pillAvatar,
    paddingHorizontal: Space.md,
    minHeight: Space.xxl,
  },
  filterChips: {
    flexDirection: 'row',
    gap: Space.sm,
    paddingTop: Space.xs,
    paddingBottom: Space.xs,
  },
  filterChip: {
    paddingVertical: Space.xs + 1,
    paddingHorizontal: Space.sm + Space.xs,
    borderRadius: RadiusRoleValue.pillAvatar,
    borderWidth: StyleSheet.hairlineWidth,
  },
  filterChipText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.semibold,
  },
  listContent: {
    paddingBottom: Space.xxl + 24,
    flexGrow: 1,
    paddingTop: Space.xs + 2,
  },
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
  unreadPill: {
    borderRadius: RadiusRoleValue.compactControl,
    paddingHorizontal: Space.xs + 2,
    paddingVertical: Space.xs / 2,
    marginLeft: Space.xs,
  },
  unreadPillText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.semibold,
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
  requestsBanner: {
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
  },
  requestsBannerTap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm + 2,
    paddingHorizontal: Space.md,
  },
  requestsAvatar: {
    width: Control.chrome,
    height: Control.chrome,
    borderRadius: RadiusRoleValue.pillAvatar,
    justifyContent: 'center',
    alignItems: 'center',
  },
  requestsBadge: {
    width: Space.lg,
    height: Space.lg,
    borderRadius: RadiusRoleValue.compactControl,
    justifyContent: 'center',
    alignItems: 'center',
  },
  requestsBadgeText: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.bold,
  },
  requestsBannerText: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.body.letterSpacing,
  },
  requestsBannerSub: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.regular,
    marginTop: Space.xs / 2,
  },
  requestBtnAcceptText: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.semibold,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  itemFilterBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  itemFilterBannerText: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.semibold,
    minWidth: 0,
  },
  itemFilterBannerClear: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.semibold,
  },
  errorBannerCopy: {
    flex: 1,
    gap: Space.xs / 4,
  },
  errorBannerTitle: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.semibold,
  },
  errorBannerSub: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.regular,
  },
  errorBannerRetryBtn: {
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
  },
  errorBannerRetry: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.semibold,
  },
  skeletonList: {
    paddingHorizontal: Space.md + 4,
    paddingTop: Space.md,
    gap: Space.md,
  },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm + 6,
  },
  skeletonText: {
    flex: 1,
    gap: Space.xs + 2,
  },
  actionSheetBody: {
    gap: Space.md,
    paddingBottom: Space.lg,
  },
  actionSheetTitle: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.body.letterSpacing,
  },
  actionSheetList: {
    gap: Space.sm,
  },
  actionSheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.smMd,
    paddingVertical: Space.sm + 2,
    paddingHorizontal: Space.sm + 2,
    borderRadius: RadiusRoleValue.compactControl,
  },
  actionSheetRowLabel: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.semibold,
  },
  actionSheetCancelBtn: {
    borderRadius: RadiusRoleValue.compactControl,
    paddingVertical: Space.md,
    alignItems: 'center',
    marginTop: Space.xs,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 44,
    justifyContent: 'center',
  },
  actionSheetCancelText: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.semibold,
  },
});