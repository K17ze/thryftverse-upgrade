import React, { useState, useCallback, useMemo, useEffect } from 'react';

import { AnimatedPressable } from '../components/AnimatedPressable';

import { View, Text, StyleSheet, RefreshControl, Alert } from 'react-native';
import { CachedImage } from '../components/CachedImage';

import { FlashList } from '@shopify/flash-list';


import { Ionicons } from '@expo/vector-icons';

import { useNavigation } from '@react-navigation/native';

import { StackNavigationProp } from '@react-navigation/stack';

import NetInfo from '@react-native-community/netinfo';

import { Colors } from '../constants/colors';

import { TypeStyles } from '../theme/designTokens';

import type { Conversation } from '../data/mockData';

import { RootStackParamList } from '../navigation/types';

import { Swipeable } from 'react-native-gesture-handler';

import Reanimated, { useSharedValue, useAnimatedScrollHandler } from 'react-native-reanimated';

import { EmptyState } from '../components/EmptyState';

import { useStore } from '../store/useStore';

import { useToast } from '../context/ToastContext';

import { RefreshIndicator } from '../components/RefreshIndicator';

import { useBackendData } from '../context/BackendDataContext';

import { fetchConversationsFromApi, deleteConversationOnApi } from '../services/chatApi';

import { AppSearchBar } from '../components/ui/AppSearchBar';

import { useHaptic } from '../hooks/useHaptic';

import { Space, Radius, Type } from '../theme/designTokens';

import { Caption } from '../components/ui/Text';

import { AvatarRing } from '../components/chat/AvatarRing';

import { SkeletonLoader } from '../components/SkeletonLoader';

import { InboxConversationRow } from '../components/chat/InboxConversationRow';

import { MessagingSegmentRail, MessagingSegment } from '../components/chat/MessagingSegmentRail';

import { SafeAreaView } from 'react-native-safe-area-context';



type NavT = StackNavigationProp<RootStackParamList>;



type ConvoItem = Conversation;

type InboxSegment = MessagingSegment | 'unread' | 'archived';

function ListingContextThumbnail({ itemId }: { itemId: string }) {
  const { listings } = useBackendData();
  const listing = useMemo(() => listings.find((l) => l.id === itemId), [listings, itemId]);
  if (!listing?.images?.[0]) {
    return (
      <View style={styles.contextThumb}>
        <Ionicons name="pricetag-outline" size={14} color={Colors.textMuted} />
      </View>
    );
  }
  return (
    <CachedImage
      uri={listing.images[0]}
      style={styles.contextThumbImage}
      containerStyle={styles.contextThumb}
      contentFit="cover"
    />
  );
}

export default function InboxScreen() {

  const navigation = useNavigation<NavT>();

  const { show } = useToast();

  const haptic = useHaptic();

  const { refreshListings, listings } = useBackendData();

  const currentUser = useStore((state) => state.currentUser);

  const conversations = useStore((state) => state.conversations);

  const upsertConversation = useStore((state) => state.upsertConversation);

  const deleteConversation = useStore((state) => state.deleteConversation);

  const toggleConversationPinned = useStore((state) => state.toggleConversationPinned);

  const markConversationRead = useStore((state) => state.markConversationRead);

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

      scrollY.value = e.contentOffset.y;

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



  const AnimatedFlashList = Reanimated.createAnimatedComponent(FlashList);



  const participantNameLookup = useMemo(() => {

    const map = new Map<string, string>();



    map.set('me', currentUser?.username ?? 'you');

    if (currentUser?.id) {

      map.set(currentUser.id, currentUser.username);

    }

    return map;

  }, [currentUser?.id, currentUser?.username]);



  const profileMediaOverrides = useStore((s) => s.profileMediaOverrides);



  const visibleConversations = useMemo(() => {

    const normalizedQuery = String(searchQuery ?? '').trim().toLowerCase();

    const scoped = conversations.filter((conversation) => {

      const isArchived = archivedIds.includes(conversation.id);

      const isRequest = messageRequests.includes(conversation.id);



      if (segment === 'unread' && !conversation.unread) return false;

      if (segment === 'groups' && conversation.type !== 'group') return false;

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

            show('Conversation deleted', 'error');

            try {

              await deleteConversationOnApi(id);

            } catch {

              show('Failed to delete on server. Restoring conversation.', 'error');

              if (previous) {

                upsertConversation(previous);

              }

            }

          },

        },

      ]

    );

  }, [conversations, deleteConversation, upsertConversation, show, haptic]);



  const handleMute = useCallback((id: string) => {

    haptic.light();

    toggleMutedConversation(id);

    const nowMuted = !mutedIds.includes(id);

    show(nowMuted ? 'Conversation muted' : 'Conversation unmuted', 'info');

  }, [toggleMutedConversation, mutedIds, show, haptic]);



  const handleArchive = useCallback((id: string) => {

    haptic.light();

    toggleArchivedConversation(id);

    const nowArchived = !archivedIds.includes(id);

    show(nowArchived ? 'Conversation archived' : 'Conversation unarchived', 'info');

  }, [toggleArchivedConversation, archivedIds, show, haptic]);



  const handleAcceptRequest = useCallback((id: string) => {

    haptic.medium();

    acceptMessageRequest(id);

    show('Message request accepted', 'success');

  }, [acceptMessageRequest, show, haptic]);



  const handleDeclineRequest = useCallback((id: string) => {

    haptic.medium();

    declineMessageRequest(id);

    show('Message request declined', 'info');

  }, [declineMessageRequest, show, haptic]);



  const handlePin = useCallback((id: string) => {

    haptic.medium();

    toggleConversationPinned(id);

    show('Conversation pinned', 'success');

  }, [toggleConversationPinned, show, haptic]);



  const renderRightActions = (id: string) => (

    <View style={styles.swipeRightGroup}>

      <AnimatedPressable

        style={styles.swipeArchive}

        onPress={() => handleArchive(id)}

        accessibilityLabel="Archive conversation"

        accessibilityRole="button"

        activeOpacity={0.7}

        scaleValue={0.95}

        hapticFeedback="light"

      >

        <Ionicons name="archive-outline" size={20} color={Colors.brand} />

      </AnimatedPressable>

      <AnimatedPressable

        style={styles.swipeDelete}

        onPress={() => handleDelete(id)}

        accessibilityLabel="Delete conversation"

        accessibilityRole="button"

        activeOpacity={0.7}

        scaleValue={0.95}

        hapticFeedback="medium"

      >

        <Ionicons name="trash-outline" size={20} color={Colors.danger} />

      </AnimatedPressable>

    </View>

  );



  const renderLeftActions = (id: string) => (

    <View style={styles.swipeLeftGroup}>

      <AnimatedPressable

        style={styles.swipeMute}

        onPress={() => handleMute(id)}

        accessibilityLabel="Mute conversation"

        accessibilityRole="button"

        activeOpacity={0.7}

        scaleValue={0.95}

        hapticFeedback="light"

      >

        <Ionicons name={mutedIds.includes(id) ? 'volume-high-outline' : 'volume-mute-outline'} size={20} color={Colors.textPrimary} />

      </AnimatedPressable>

      <AnimatedPressable

        style={styles.swipePin}

        onPress={() => handlePin(id)}

        accessibilityLabel="Pin conversation"

        accessibilityRole="button"

        activeOpacity={0.7}

        scaleValue={0.95}

        hapticFeedback="light"

      >

        <Ionicons name="pin-outline" size={20} color={Colors.brand} />

      </AnimatedPressable>

    </View>

  );



  const renderItem = ({ item, index }: { item: ConvoItem; index: number }) => {
    const isGroup = item.type === 'group';
    const counterpartyId = item.participantIds?.find((id) => id !== 'me' && id !== currentUser?.id);
    const displayTitle = isGroup
      ? item.title ?? 'Untitled Group'
      : (counterpartyId ? participantNameLookup.get(counterpartyId) ?? 'Thryft user' : 'Thryft user');
    const safeDisplayTitle = String(displayTitle ?? 'Thryft user');
    const isRequest = messageRequests.includes(item.id);
    const isMuted = mutedIds.includes(item.id);

    const avatarEl = isGroup ? (
      <View style={styles.groupAvatar}>
        <Text style={styles.groupAvatarText}>
          {item.title?.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase() ?? 'G'}
        </Text>
        {(item.botIds?.length ?? 0) > 0 && (
          <View style={styles.botIndicator}>
            <Ionicons name="hardware-chip-outline" size={10} color={Colors.brand} />
          </View>
        )}
      </View>
    ) : (
          <AvatarRing
        uri={item.avatar ?? (counterpartyId ? profileMediaOverrides[counterpartyId]?.avatar ?? undefined : undefined)}
        size={56}
        isUnread={item.unread}
            ringWidth={2}
        fallbackInitials={safeDisplayTitle === 'Thryft user' ? 'T' : safeDisplayTitle.slice(0, 2).toUpperCase()}
      />
    );

    const requestRow = (
      <View style={styles.requestRowAccent}>
        <View style={styles.requestRowInner}>
          {avatarEl}
          <View style={styles.messageBody}>
            <View style={styles.messageTop}>
              <Text style={[styles.nameText, styles.nameUnread]}>{displayTitle}</Text>
              <Caption color={Colors.textMuted}>{item.lastMessageTime}</Caption>
            </View>
            <Caption color={Colors.textSecondary} numberOfLines={1}>{item.lastMessage}</Caption>
            {item.itemId && (
              <View style={styles.requestListingContext}>
                <ListingContextThumbnail itemId={item.itemId} />
                <Caption color={Colors.textSecondary} style={styles.requestListingText}>About a listing</Caption>
              </View>
            )}
            <View style={styles.requestActions}>
              <AnimatedPressable
                style={styles.requestBtnDecline}
                onPress={() => handleDeclineRequest(item.id)}
                activeOpacity={0.85}
                scaleValue={0.96}
                hapticFeedback="light"
                accessibilityLabel="Decline message request"
                accessibilityRole="button"
              >
                <Text style={styles.requestBtnDeclineText}>Decline</Text>
              </AnimatedPressable>
              <AnimatedPressable
                style={styles.requestBtnAccept}
                onPress={() => handleAcceptRequest(item.id)}
                activeOpacity={0.85}
                scaleValue={0.96}
                hapticFeedback="medium"
                accessibilityLabel="Accept message request"
                accessibilityRole="button"
              >
                <Text style={styles.requestBtnAcceptText}>Accept</Text>
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
      />
    );

    return (
      <View>
        {isRequest ? requestRow : (
          <Swipeable
            friction={2}
            overshootLeft={false}
            overshootRight={false}
            renderRightActions={() => renderRightActions(item.id)}
            renderLeftActions={() => renderLeftActions(item.id)}
          >
            {conversationRow}
          </Swipeable>
        )}
        {!isRequest && <View style={styles.rowSeparator} />}
      </View>
    );
  };



  return (

    <SafeAreaView edges={['top']} style={styles.screenRoot}>



      <View style={styles.compactHeader}>

        <Text style={styles.headerTitle}>Inbox</Text>

        <View style={styles.headerActions}>

          <AnimatedPressable

            style={styles.iconBtn}

            onPress={() => navigation.navigate('CreateGroupChat')}

            activeOpacity={0.7}

            scaleValue={0.9}

            hapticFeedback="light"

            accessibilityLabel="Create new group chat"

            accessibilityRole="button"

          >

            <Ionicons name="people-outline" size={20} color={Colors.textSecondary} />

          </AnimatedPressable>

          <AnimatedPressable

            style={styles.newMessageBtn}

            onPress={() => navigation.navigate('NewMessage')}

            activeOpacity={0.7}

            scaleValue={0.95}

            hapticFeedback="light"

            accessibilityLabel="New message"

            accessibilityRole="button"

          >

            <Ionicons name="create-outline" size={18} color={Colors.textInverse} />

            <Text style={styles.newMessageBtnText}>New</Text>

          </AnimatedPressable>

        </View>

      </View>



      <View style={styles.header}>

        <AppSearchBar

          placeholder="Search messages"

          value={searchQuery}

          onChangeText={setSearchQuery}

          containerStyle={styles.searchWrap}

          inputProps={{

            autoCapitalize: 'none',

            autoCorrect: false,

            accessibilityLabel: 'Search conversations',

          }}

        />

        <MessagingSegmentRail

          active={segment === 'unread' || segment === 'archived' ? 'all' : segment}

          onChange={(s) => setSegment(s)}

          requestCount={messageRequests.length}

        />

      </View>



      {isOffline && (

        <View style={styles.offlineBanner}>

          <Ionicons name="cloud-offline-outline" size={16} color={Colors.textSecondary} />

          <Text style={styles.offlineBannerText}>You are offline</Text>

        </View>

      )}



      {!!syncError && (

        <View style={styles.errorBanner}>

          <Ionicons name="alert-circle-outline" size={18} color={Colors.danger} />

          <Text style={styles.errorBannerText}>{syncError}</Text>

          <AnimatedPressable

            onPress={() => void loadConversations()}

            activeOpacity={0.7}

            scaleValue={0.95}

            hapticFeedback="light"

            accessibilityLabel="Retry loading conversations"

          >

            <Text style={styles.errorBannerRetry}>Retry</Text>

          </AnimatedPressable>

        </View>

      )}



      <View style={{ flex: 1 }}>

        <RefreshIndicator scrollY={scrollY} isRefreshing={refreshing} topInset={20} />



        {isLoading && !visibleConversations.length ? (

          <View style={styles.skeletonList}>

            {Array.from({ length: 6 }).map((_, i) => (

              <View key={i} style={styles.skeletonRow}>

                <SkeletonLoader width={56} height={56} borderRadius={Radius.full} />

                <View style={styles.skeletonText}>

                  <SkeletonLoader width="70%" height={16} borderRadius={Radius.sm} />

                  <SkeletonLoader width="40%" height={14} borderRadius={Radius.sm} />

                </View>

              </View>

            ))}

          </View>

        ) : (

          <>

            {segment === 'all' && messageRequests.length > 0 && (

              <View style={styles.requestsBanner}>
                <View style={styles.requestsBannerRule} />
                <AnimatedPressable
                  onPress={() => navigation.navigate('MessageRequests')}
                  activeOpacity={0.85}
                  scaleValue={0.98}
                  hapticFeedback="light"
                  accessibilityLabel={`${messageRequests.length} message requests`}
                  accessibilityRole="button"
                  style={styles.requestsBannerTap}
                >
                  <View style={styles.requestsAvatarStack}>
                    <View style={styles.requestsAvatar}>
                      <Ionicons name="mail-unread-outline" size={16} color={Colors.brand} />
                    </View>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.requestsBannerText}>Requests</Text>
                    <Text style={styles.requestsBannerSub}>{messageRequests.length} pending</Text>
                  </View>
                  <View style={styles.requestsBadge}>
                    <Text style={styles.requestsBadgeText}>{messageRequests.length}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                </AnimatedPressable>
              </View>

            )}

            <AnimatedFlashList

            data={visibleConversations}

            keyExtractor={(c: any) => c.id}

            showsVerticalScrollIndicator={false}

            contentContainerStyle={styles.listContent}

            renderItem={renderItem as any}

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

                  default:

                    return (

                      <EmptyState

                        icon="chatbubbles-outline"

                        title="No conversations yet"

                        subtitle="Message a seller to start a chat."

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
    backgroundColor: Colors.background,
  },

  compactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.xs,
  },

  header: {

    paddingHorizontal: Space.md,

    paddingTop: Space.sm,

    paddingBottom: Space.sm,

    gap: Space.sm,

  },

  headerTitleBlock: {

    gap: 2,

    marginBottom: Space.xs,

  },

  headerTitle: {

    fontSize: Type.title.size,

    fontFamily: TypeStyles.title.fontFamily,

    color: Colors.textPrimary,

    letterSpacing: Type.title.letterSpacing,

    lineHeight: Type.title.lineHeight,

  },

  headerSubtitle: {

    fontSize: Type.caption.size,

    fontFamily: TypeStyles.body.fontFamily,

    color: Colors.textMuted,

  },

  headerActions: {

    flexDirection: 'row',

    alignItems: 'center',

    gap: Space.sm,

  },

  iconBtn: {

    width: 40,

    height: 40,

    borderRadius: Radius.full,

    backgroundColor: Colors.surfaceAlt,

    justifyContent: 'center',

    alignItems: 'center',

  },

  newMessageBtn: {

    flexDirection: 'row',

    alignItems: 'center',

    gap: Space.xs,

    paddingHorizontal: Space.md,

    paddingVertical: 10,

    borderRadius: Radius.full,

    backgroundColor: Colors.textPrimary,

  },

  newMessageBtnText: {

    fontSize: Type.caption.size,

    fontFamily: TypeStyles.bodyEmphasis.fontFamily,

    color: Colors.textInverse,

  },

  searchWrap: {

    backgroundColor: Colors.surfaceAlt,

    borderRadius: Radius.full,

    paddingHorizontal: Space.md,

    minHeight: 40,

  },

  filterChips: {
    flexDirection: 'row',
    gap: Space.sm,
    paddingTop: Space.xs,
    paddingBottom: Space.xs,
  },
  filterChip: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  filterChipActive: {
    backgroundColor: Colors.textPrimary,
    borderColor: Colors.textPrimary,
  },
  filterChipText: {
    fontSize: Type.meta.size,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    color: Colors.textSecondary,
  },
  filterChipTextActive: {
    color: Colors.textInverse,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
  },

  listContent: {

    paddingBottom: Space.xxl + 24,

    flexGrow: 1,

    paddingTop: Space.sm,

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

    backgroundColor: Colors.border,

    marginLeft: 72,

    marginRight: Space.md,

  },

  avatarWrap: { position: 'relative' },

  groupAvatar: {

    width: 56,

    height: 56,

    borderRadius: Radius.full,

    backgroundColor: Colors.surfaceAlt,

    alignItems: 'center',

    justifyContent: 'center',

    position: 'relative',

  },

  groupAvatarText: {

    fontSize: Type.subtitle.size,

    fontFamily: TypeStyles.title.fontFamily,

    color: Colors.textPrimary,

  },

  botIndicator: {

    position: 'absolute',

    bottom: -2,

    right: -2,

    width: 18,

    height: 18,

    borderRadius: Radius.full,

    backgroundColor: Colors.surface,

    borderWidth: 1.5,

    borderColor: Colors.border,

    justifyContent: 'center',

    alignItems: 'center',

  },

  messageBody: { flex: 1, justifyContent: 'center', gap: 2 },

  messageTop: {

    flexDirection: 'row',

    justifyContent: 'space-between',

    marginBottom: 4,

    alignItems: 'center',

  },

  titleRow: {

    flexDirection: 'row',

    alignItems: 'center',

    gap: Space.xs,

  },

  nameText: {

    fontSize: Type.body.size,

    fontFamily: TypeStyles.bodyEmphasis.fontFamily,

    color: Colors.textPrimary,

    letterSpacing: Type.body.letterSpacing,

  },

  nameUnread: {

    fontFamily: TypeStyles.title.fontFamily,

  },

  pinIcon: {

    marginLeft: 2,

  },

  snippetRow: {

    flexDirection: 'row',

    alignItems: 'center',

    gap: Space.sm,

  },

  memberCount: {

    fontSize: Type.meta.size,

    fontFamily: TypeStyles.bodyEmphasis.fontFamily,

    color: Colors.textMuted,

  },

  snippet: {

    color: Colors.textSecondary,

    fontSize: Type.caption.size,

    fontFamily: TypeStyles.body.fontFamily,

    lineHeight: Type.caption.lineHeight,

    flex: 1,

  },

  snippetUnread: {

    color: Colors.textPrimary,

    fontFamily: TypeStyles.bodyEmphasis.fontFamily,

  },

  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.textPrimary,
  },
  unreadPill: {
    backgroundColor: Colors.textPrimary,
    borderRadius: Radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: Space.xs,
  },
  unreadPillText: {
    fontSize: 10,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    color: Colors.textInverse,
  },
  timeUnread: {
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    color: Colors.textPrimary,
  },
  rowMeta: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: Space.xs,
    minWidth: 40,
    paddingLeft: Space.xs,
  },
  rowMetaBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  contextThumb: {
    width: 28,
    height: 28,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  contextThumbImage: {
    width: 28,
    height: 28,
  },

  snippetWithBadge: {

    flex: 1,

    flexDirection: 'row',

    alignItems: 'center',

    gap: Space.sm,

  },

  draftBadge: {

    backgroundColor: `${Colors.brand}1A`,

    paddingHorizontal: Space.sm - 2,

    paddingVertical: 2,

    borderRadius: Radius.sm,

  },

  draftBadgeText: {

    fontSize: Type.meta.size,

    fontFamily: TypeStyles.bodyEmphasis.fontFamily,

    color: Colors.brand,

  },

  rowInnerUnread: {
    backgroundColor: `${Colors.brand}06`,
  },
  requestListingContext: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    marginTop: Space.xs,
  },
  requestListingText: {
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
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

    backgroundColor: `${Colors.danger}1F`,

    justifyContent: 'center',

    alignItems: 'center',

    width: 72,

    borderRadius: Radius.md,

    flex: 1,

  },

  swipePin: {

    backgroundColor: `${Colors.brand}14`,

    justifyContent: 'center',

    alignItems: 'center',

    width: 72,

    borderRadius: Radius.md,

    flex: 1,

  },

  swipeArchive: {

    backgroundColor: `${Colors.brand}14`,

    justifyContent: 'center',

    alignItems: 'center',

    width: 72,

    borderRadius: Radius.md,

    flex: 1,

  },

  swipeMute: {

    backgroundColor: `${Colors.textMuted}1F`,

    justifyContent: 'center',

    alignItems: 'center',

    width: 72,

    borderRadius: Radius.md,

    flex: 1,

  },

  requestRowSurface: {

    backgroundColor: Colors.surface,

    borderRadius: Radius.lg,

    marginHorizontal: Space.md,

    marginVertical: Space.xs,

  },
  requestRowAccent: {
    borderLeftWidth: 3,
    borderLeftColor: Colors.brand,
    backgroundColor: `${Colors.brand}06`,
    marginHorizontal: Space.md,
    marginVertical: Space.xs,
    borderRadius: Radius.sm,
  },
  requestRowInner: {
    flexDirection: 'row',
    gap: Space.md - 4,
    alignItems: 'center',
    paddingVertical: Space.sm,
    paddingHorizontal: Space.md,
    paddingLeft: Space.md - 2,
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

    paddingVertical: 10,

    borderRadius: Radius.md,

    backgroundColor: Colors.surfaceAlt,

    borderWidth: StyleSheet.hairlineWidth,

    borderColor: Colors.border,

  },

  requestBtnDeclineText: {

    fontSize: Type.caption.size,

    fontFamily: TypeStyles.bodyEmphasis.fontFamily,

    color: Colors.textPrimary,

  },

  requestBtnAccept: {

    flex: 1,

    alignItems: 'center',

    justifyContent: 'center',

    paddingVertical: 10,

    borderRadius: Radius.md,

    backgroundColor: Colors.brand,

  },

  requestsBanner: {

    marginHorizontal: Space.md,

    marginBottom: Space.sm,

  },
  requestsBannerRule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginBottom: Space.sm,
    marginHorizontal: Space.md,
  },
  requestsBannerTap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: 10,
    paddingHorizontal: Space.md,
  },
  requestsAvatarStack: {
    flexDirection: 'row',
  },
  requestsAvatar: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    backgroundColor: `${Colors.brand}12`,
    justifyContent: 'center',
    alignItems: 'center',
  },

  requestsBannerInner: {

    flexDirection: 'row',

    alignItems: 'center',

    gap: Space.sm,

    paddingVertical: 12,

    paddingHorizontal: Space.md,

    backgroundColor: Colors.surface,

    borderRadius: Radius.lg,

  },

  requestsBadge: {

    width: 24,

    height: 24,

    borderRadius: Radius.md,

    backgroundColor: Colors.textPrimary,

    justifyContent: 'center',

    alignItems: 'center',

  },

  requestsBadgeText: {

    fontSize: Type.caption.size,

    fontFamily: TypeStyles.title.fontFamily,

    color: Colors.textInverse,

  },

  requestsIconWrap: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
  },
  requestsBannerText: {
    fontSize: Type.body.size,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    color: Colors.textPrimary,
    letterSpacing: Type.body.letterSpacing,
  },
  requestsBannerSub: {
    fontSize: Type.caption.size,
    fontFamily: TypeStyles.body.fontFamily,
    color: Colors.textMuted,
    marginTop: 2,
  },

  requestBtnAcceptText: {

    fontSize: Type.caption.size,

    fontFamily: TypeStyles.bodyEmphasis.fontFamily,

    color: Colors.textInverse,

  },

  offlineBanner: {

    flexDirection: 'row',

    alignItems: 'center',

    justifyContent: 'center',

    gap: Space.xs,

    backgroundColor: Colors.surfaceAlt,

    borderBottomWidth: StyleSheet.hairlineWidth,

    borderBottomColor: Colors.border,

    paddingVertical: Space.xs + 2,

    paddingHorizontal: Space.md,

  },

  offlineBannerText: {

    color: Colors.textSecondary,

    fontSize: Type.caption.size,

    fontFamily: TypeStyles.bodyEmphasis.fontFamily,

  },

  errorBanner: {

    flexDirection: 'row',

    alignItems: 'center',

    gap: Space.sm,

    backgroundColor: Colors.surfaceAlt,

    paddingVertical: Space.sm,

    paddingHorizontal: Space.md,

    borderBottomWidth: StyleSheet.hairlineWidth,

    borderBottomColor: Colors.border,

  },

  errorBannerText: {

    flex: 1,

    color: Colors.danger,

    fontSize: Type.caption.size,

    fontFamily: TypeStyles.bodyEmphasis.fontFamily,

  },

  errorBannerRetry: {

    color: Colors.brand,

    fontSize: Type.caption.size,

    fontFamily: TypeStyles.bodyEmphasis.fontFamily,

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