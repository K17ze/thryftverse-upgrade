import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { View, Text, StyleSheet, RefreshControl, Alert } from 'react-native';
import { CachedImage } from '../components/CachedImage';
import { FlashList, type FlashListProps } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useScrollToTop } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import NetInfo from '@react-native-community/netinfo';
import { useAppTheme } from '../theme/ThemeContext';
import type { Conversation } from '../data/mockData';
import { RootStackParamList } from '../navigation/types';
import { SwipeableRow } from '../components/SwipeableRow';
import Reanimated, { useSharedValue, useAnimatedScrollHandler } from 'react-native-reanimated';
import { EmptyState } from '../components/EmptyState';
import { useStore } from '../store/useStore';
import { useNotifications } from '../hooks/useNotifications';
import { RefreshIndicator } from '../components/RefreshIndicator';
import { useBackendData } from '../context/BackendDataContext';
import { fetchConversationsFromApi, deleteConversationOnApi } from '../services/chatApi';
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
type NavT = NativeStackNavigationProp<RootStackParamList>;
type ConvoItem = Conversation;
type InboxSegment = MessagingSegment | 'unread' | 'archived' | 'groups';

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
        <Ionicons name="pricetag-outline" size={14} color={colors.textMuted} />
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
  const mutedIds = useStore((state) => state.mutedConversationIds);
  const messageRequests = useStore((state) => state.messageRequests);
  const acceptMessageRequest = useStore((state) => state.acceptMessageRequest);
  const declineMessageRequest = useStore((state) => state.declineMessageRequest);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [segment, setSegment] = useState<InboxSegment>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [syncError, setSyncError] = useState('');
  const [isOffline, setIsOffline] = useState(false);
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
    }
  };
  useEffect(() => {
    void loadConversations();
  }, []);
  const handleRefresh = async () => {
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
  const AnimatedFlashList = Reanimated.createAnimatedComponent(FlashList) as unknown as React.ComponentClass<FlashListProps<Conversation>>;
  const listRef = useRef<any>(null);
  useScrollToTop(listRef);
  const t = useMemo(() => ({
    screenRoot: { backgroundColor: colors.background },
    headerTitle: { color: colors.textPrimary },
    headerSubtitle: { color: colors.textMuted },
    iconBtn: { backgroundColor: 'transparent' },
    newMessageBtn: { backgroundColor: colors.textPrimary },
    newMessageBtnText: { color: colors.textInverse },
    searchWrap: { backgroundColor: colors.surfaceAlt },
    filterChip: { backgroundColor: 'transparent', borderColor: colors.border },
    filterChipActive: { backgroundColor: colors.textPrimary, borderColor: colors.textPrimary },
    filterChipText: { color: colors.textSecondary },
    filterChipTextActive: { color: colors.textInverse },
    rowSeparator: { backgroundColor: colors.border },
    groupAvatar: { backgroundColor: colors.surfaceAlt },
    groupAvatarText: { color: colors.textPrimary },
    botIndicator: { backgroundColor: colors.surface, borderColor: colors.border },
    nameText: { color: colors.textPrimary },
    memberCount: { color: colors.textMuted },
    snippet: { color: colors.textSecondary },
    snippetUnread: { color: colors.textPrimary },
    unreadDot: { backgroundColor: colors.textPrimary },
    unreadPill: { backgroundColor: colors.textPrimary },
    unreadPillText: { color: colors.textInverse },
    timeUnread: { color: colors.textPrimary },
    contextThumb: { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
    draftBadge: { backgroundColor: `${colors.brand}1A` },
    draftBadgeText: { color: colors.brand },
    rowInnerUnread: { backgroundColor: `${colors.brand}06` },
    swipeDelete: { backgroundColor: `${colors.danger}1F` },
    swipePin: { backgroundColor: `${colors.brand}14` },
    swipeArchive: { backgroundColor: `${colors.brand}14` },
    swipeMute: { backgroundColor: `${colors.textMuted}1F` },
    requestRowSurface: { backgroundColor: colors.surface },
    requestRowAccent: { borderLeftColor: colors.brand, backgroundColor: `${colors.brand}06` },
    requestBtnDecline: { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
    requestBtnDeclineText: { color: colors.textPrimary },
    requestBtnAccept: { backgroundColor: colors.brand },
    requestsAvatar: { backgroundColor: `${colors.brand}12` },
    requestsBannerInner: { backgroundColor: colors.surface },
    requestsBadge: { backgroundColor: colors.textPrimary },
    requestsBadgeText: { color: colors.textInverse },
    requestsIconWrap: { backgroundColor: colors.surfaceAlt },
    requestsBannerText: { color: colors.textPrimary },
    requestsBannerSub: { color: colors.textMuted },
    requestBtnAcceptText: { color: colors.textInverse },
    errorBanner: { backgroundColor: `${colors.danger}14`, borderBottomColor: colors.border },
    errorBannerTitle: { color: colors.danger },
    errorBannerSub: { color: colors.textMuted },
    errorBannerRetry: { color: colors.brand },
    needsActionChip: { backgroundColor: `${colors.brand}0F`, borderColor: `${colors.brand}30` },
    needsActionText: { color: colors.brand },
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
  }, [conversations, searchQuery, segment, currentUser?.id, participantNameLookup, archivedIds, messageRequests]);
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
    Alert.alert(
      'Delete conversation?',
      'This conversation will be removed from your inbox.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const previous = conversations.find((c) => c.id === id);
            deleteConversation(id);
            showError('Conversation deleted', 'This conversation was removed from your inbox.');
            try {
              await deleteConversationOnApi(id);
            } catch {
              showError('Delete failed', 'Failed to delete on server. Restoring conversation.');
              if (previous) {
                upsertConversation(previous);
              }
            }
          },
        },
      ]
    );
  }, [conversations, deleteConversation, upsertConversation, showError, haptic]);
  const handleMute = useCallback((id: string) => {
    haptic.light();
    toggleMutedConversation(id);
    const nowMuted = !mutedIds.includes(id);
    showInfo(nowMuted ? 'Conversation muted' : 'Conversation unmuted');
  }, [toggleMutedConversation, mutedIds, showInfo, haptic]);
  const handleArchive = useCallback((id: string) => {
    haptic.light();
    toggleArchivedConversation(id);
    const nowArchived = !archivedIds.includes(id);
    showInfo(nowArchived ? 'Conversation archived' : 'Conversation unarchived');
  }, [toggleArchivedConversation, archivedIds, showInfo, haptic]);
  const handleAcceptRequest = useCallback((id: string) => {
    haptic.medium();
    acceptMessageRequest(id);
    showSuccess('Request accepted', 'Message request accepted.');
  }, [acceptMessageRequest, showSuccess, haptic]);
  const handleDeclineRequest = useCallback((id: string) => {
    haptic.medium();
    declineMessageRequest(id);
    showInfo('Request declined', 'Message request declined.');
  }, [declineMessageRequest, showInfo, haptic]);
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

  // Long-press quick actions: a native alert sheet exposing mute, pin, and
  // delete. Preserves the capabilities previously surfaced via the old
  // multi-button swipe panels (AGENTS.md §8: preserve working functionality).
  const handleQuickActions = useCallback((id: string) => {
    const convo = conversations.find((c) => c.id === id);
    const isMuted = mutedIds.includes(id);
    const isPinned = !!convo?.isPinned;
    Alert.alert(
      'Conversation',
      undefined,
      [
        {
          text: isMuted ? 'Unmute' : 'Mute',
          onPress: () => handleMute(id),
        },
        {
          text: isPinned ? 'Unpin' : 'Pin',
          onPress: () => handlePin(id),
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => handleDelete(id),
        },
        { text: 'Cancel', style: 'cancel' },
      ],
      { cancelable: true }
    );
  }, [conversations, mutedIds, handleMute, handlePin, handleDelete]);

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
      <View style={[styles.groupAvatar, t.groupAvatar]}>
        <Text style={[styles.groupAvatarText, t.groupAvatarText]}>
          {item.title?.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase() ?? 'G'}
        </Text>
        {(item.botIds?.length ?? 0) > 0 && (
          <View style={[styles.botIndicator, t.botIndicator]}>
            <Ionicons name="hardware-chip-outline" size={14} color={colors.brand} />
          </View>
        )}
      </View>
    ) : (
      <AvatarRing
        uri={item.avatar ?? (counterpartyId ? profileMediaOverrides[counterpartyId]?.avatar ?? counterpartySummary?.avatar ?? undefined : undefined)}
        size={56}
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
    <SafeAreaView edges={['top']} style={[styles.screenRoot, t.screenRoot]}>
      <View style={styles.compactHeader}>
        <Text style={[styles.headerTitle, t.headerTitle]}>Inbox</Text>
        <View style={styles.headerActions}>
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
            <Ionicons name="settings-outline" size={20} color={colors.textSecondary} />
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
            <Ionicons name="create-outline" size={18} color={colors.textInverse} />
            <Text style={[styles.newMessageBtnText, t.newMessageBtnText]}>New</Text>
          </AnimatedPressable>
        </View>
      </View>
      <View style={styles.header}>
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
        <MessagingSegmentRail
          active={segment === 'unread' || segment === 'archived' || segment === 'groups' ? 'all' : segment}
          onChange={(s) => setSegment(s)}
          requestCount={messageRequests.length}
          buyingCount={buyingUnreadCount}
          sellingCount={sellingUnreadCount}
        />
      </View>
      {isOffline && (
        <OfflineBanner message="You are offline" />
      )}
      {!!syncError && (
        <View style={[styles.errorBanner, t.errorBanner]}>
          <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
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
                <SkeletonLoader width={56} height={56} borderRadius={RadiusRoleValue.pillAvatar} />
                <View style={styles.skeletonText}>
                  <SkeletonLoader width="70%" height={16} borderRadius={RadiusRoleValue.compactControl} />
                  <SkeletonLoader width="40%" height={14} borderRadius={RadiusRoleValue.compactControl} />
                </View>
              </View>
            ))}
          </View>
        ) : (
          <>
            {segment === 'all' && messageRequests.length > 0 && (
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
                    <Ionicons name="mail-unread-outline" size={18} color={colors.brand} />
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
                  <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                </AnimatedPressable>
              </View>
            )}
            <AnimatedFlashList
              ref={listRef}
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
                      <EmptyState
                        icon="search-outline"
                        title="No matching conversations"
                        subtitle="Try another keyword or filter."
                        ctaLabel="Clear search"
                        onCtaPress={() => setSearchQuery('')}
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
                          icon="pricetag-outline"
                          title="No selling conversations"
                          subtitle="When buyers message you about your listings, they'll appear here."
                          ctaLabel="View all"
                          onCtaPress={() => setSegment('all')}
                        />
                      );
                    default:
                      return (
                        <EmptyState
                          icon="chatbubbles-outline"
                          title="No conversations yet"
                          subtitle="Start chatting with a seller to see your messages here."
                          ctaLabel="Browse listings"
                          onCtaPress={() => navigation.navigate('MainTabs')}
                        />
                      );
                  }
                })()
              }
            />
          </>
        )}
      </View>
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
  headerTitleBlock: {
    gap: Space.xs / 2,
    marginBottom: Space.xs,
  },
  headerTitle: {
    fontSize: TypographyV2.screenTitle.size,
    fontFamily: FontFamily.bold,
    letterSpacing: TypographyV2.screenTitle.letterSpacing,
    lineHeight: TypographyV2.screenTitle.lineHeight,
  },
  headerSubtitle: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.regular,
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
  filterChipActive: {
  },
  filterChipText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.semibold,
  },
  filterChipTextActive: {
    fontFamily: FontFamily.semibold,
  },
  listContent: {
    paddingBottom: Space.xxl + 24,
    flexGrow: 1,
    paddingTop: Space.xs + 2,
  },
  rowInner: {
    flexDirection: 'row',
    gap: Space.md - 4,
    alignItems: 'flex-start',
    paddingVertical: Space.md - 2,
    paddingHorizontal: Space.md,
  },
  rowSeparator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: Space.xxl + Space.lg,
    marginRight: Space.md,
  },
  avatarWrap: { position: 'relative' },
  groupAvatar: {
    width: Space.xxl + Space.sm,
    height: Space.xxl + Space.sm,
    borderRadius: RadiusRoleValue.pillAvatar,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  nameText: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.body.letterSpacing,
  },
  nameUnread: {
    fontFamily: FontFamily.bold,
  },
  pinIcon: {
    marginLeft: Space.xs / 2,
  },
  snippetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  memberCount: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.semibold,
  },
  snippet: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.regular,
    lineHeight: TypographyV2.body.lineHeight,
    flex: 1,
  },
  snippetUnread: {
    fontFamily: FontFamily.semibold,
  },
  unreadDot: {
    width: Space.sm,
    height: Space.sm,
    borderRadius: RadiusRoleValue.compactControl,
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
  timeUnread: {
    fontFamily: FontFamily.semibold,
  },
  rowMeta: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: Space.xs,
    minWidth: Space.xxl,
    paddingLeft: Space.xs,
  },
  rowMetaBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
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
  snippetWithBadge: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  draftBadge: {
    paddingHorizontal: Space.sm - 2,
    paddingVertical: Space.xs / 2,
    borderRadius: RadiusRoleValue.compactControl,
  },
  draftBadgeText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.semibold,
  },
  rowInnerUnread: {
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
  swipeRightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  swipeLeftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  swipeDelete: {
    justifyContent: 'center',
    alignItems: 'center',
    width: Space.xxl + Space.lg,
    borderRadius: RadiusRoleValue.compactControl,
    flex: 1,
  },
  swipePin: {
    justifyContent: 'center',
    alignItems: 'center',
    width: Space.xxl + Space.lg,
    borderRadius: RadiusRoleValue.compactControl,
    flex: 1,
  },
  swipeArchive: {
    justifyContent: 'center',
    alignItems: 'center',
    width: Space.xxl + Space.lg,
    borderRadius: RadiusRoleValue.compactControl,
    flex: 1,
  },
  swipeMute: {
    justifyContent: 'center',
    alignItems: 'center',
    width: Space.xxl + Space.lg,
    borderRadius: RadiusRoleValue.compactControl,
    flex: 1,
  },
  requestRowSurface: {
    borderRadius: RadiusRoleValue.sheetDialog,
    marginHorizontal: Space.md,
    marginVertical: Space.xs,
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
  requestsAvatarStack: {
    flexDirection: 'row',
  },
  requestsAvatar: {
    width: Control.chrome,
    height: Control.chrome,
    borderRadius: RadiusRoleValue.pillAvatar,
    justifyContent: 'center',
    alignItems: 'center',
  },
  requestsBannerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm + Space.xs,
    paddingHorizontal: Space.md,
    borderRadius: RadiusRoleValue.sheetDialog,
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
  requestsIconWrap: {
    width: Space.xxl,
    height: Space.xxl,
    borderRadius: RadiusRoleValue.pillAvatar,
    justifyContent: 'center',
    alignItems: 'center',
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
});