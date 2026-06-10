import React, { useState, useCallback, useMemo, useEffect } from 'react';

import { AnimatedPressable } from '../components/AnimatedPressable';

import { View, Text, StyleSheet, StatusBar, RefreshControl, Alert } from 'react-native';

import { FlashList } from '@shopify/flash-list';

import { SafeAreaView } from 'react-native-safe-area-context';

import { Ionicons } from '@expo/vector-icons';

import { useNavigation } from '@react-navigation/native';

import { StackNavigationProp } from '@react-navigation/stack';

import NetInfo from '@react-native-community/netinfo';

import { Colors } from '../constants/colors';

import { Typography } from '../theme/designTokens';

import { useAppTheme } from '../theme/ThemeContext';

import type { Conversation } from '../data/mockData';

import { RootStackParamList } from '../navigation/types';

import { Swipeable } from 'react-native-gesture-handler';

import Reanimated, { useSharedValue, useAnimatedScrollHandler, FadeInDown } from 'react-native-reanimated';

import { EmptyState } from '../components/EmptyState';

import { useStore } from '../store/useStore';

import { useToast } from '../context/ToastContext';

import { RefreshIndicator } from '../components/RefreshIndicator';

import { useBackendData } from '../context/BackendDataContext';

import { fetchConversationsFromApi, deleteConversationOnApi } from '../services/chatApi';

import { AppSearchBar } from '../components/ui/AppSearchBar';

import { AppSegmentControl } from '../components/ui/AppSegmentControl';

import { useHaptic } from '../hooks/useHaptic';

import { Space, Radius, Type, Elevation } from '../theme/designTokens';

import { Meta, Caption, BodyEmphasis } from '../components/ui/Text';

import { AvatarRing } from '../components/chat/AvatarRing';

import { SkeletonLoader } from '../components/SkeletonLoader';



type NavT = StackNavigationProp<RootStackParamList>;



type ConvoItem = Conversation;

type InboxSegment = 'all' | 'unread' | 'requests' | 'archived' | 'groups';



const SEGMENT_OPTIONS: Array<{ value: InboxSegment; label: string; accessibilityLabel: string }> = [

  { value: 'all', label: 'All', accessibilityLabel: 'Show all conversations' },

  { value: 'unread', label: 'Unread', accessibilityLabel: 'Filter unread conversations' },

  { value: 'requests', label: 'Requests', accessibilityLabel: 'Filter message requests' },

  { value: 'archived', label: 'Archived', accessibilityLabel: 'Filter archived conversations' },

  { value: 'groups', label: 'Groups', accessibilityLabel: 'Filter group conversations' },

];



export default function InboxScreen() {

  const navigation = useNavigation<NavT>();

  const { show } = useToast();

  const haptic = useHaptic();

  const { refreshListings } = useBackendData();

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

  const { isDark } = useAppTheme();

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

    setTimeout(() => setRefreshing(false), 400);

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



    const requestRow = (

      <View style={styles.rowInner}>

        <View style={styles.avatarWrap}>

          <AvatarRing

            uri={

              item.avatar

              ?? (counterpartyId ? profileMediaOverrides[counterpartyId]?.avatar ?? undefined : undefined)

            }

            size={48}

            isUnread

            ringWidth={2}

            fallbackInitials={

              safeDisplayTitle === 'Thryft user'

                ? 'T'

                : safeDisplayTitle.slice(0, 2).toUpperCase()

            }

          />

        </View>

        <View style={styles.messageBody}>

          <View style={styles.messageTop}>

            <Text style={[styles.nameText, styles.nameUnread]}>{displayTitle}</Text>

            <Caption color={Colors.textMuted}>{item.lastMessageTime}</Caption>

          </View>

          <Caption color={Colors.textSecondary} numberOfLines={1}>{item.lastMessage}</Caption>

          <View style={styles.requestActions}>

            <AnimatedPressable

              style={styles.requestBtnDecline}

              onPress={() => handleDeclineRequest(item.id)}

              activeOpacity={0.85}

              scaleValue={0.96}

              hapticFeedback="light"

            >

              <Text style={styles.requestBtnDeclineText}>Decline</Text>

            </AnimatedPressable>

            <AnimatedPressable

              style={styles.requestBtnAccept}

              onPress={() => handleAcceptRequest(item.id)}

              activeOpacity={0.85}

              scaleValue={0.96}

              hapticFeedback="medium"

            >

              <Text style={styles.requestBtnAcceptText}>Accept</Text>

            </AnimatedPressable>

          </View>

        </View>

      </View>

    );



    const conversationRow = (

      <AnimatedPressable

        onPress={() => {

          markConversationRead(item.id);

          navigation.navigate('Chat', {

            conversationId: item.id,

            focusQuery: searchQuery.trim() || undefined,

          });

        }}

        activeOpacity={0.85}

        scaleValue={0.98}

        hapticFeedback="light"

        accessibilityLabel={`${displayTitle}${item.unread ? ', unread' : ''}, ${item.lastMessage}`}

        accessibilityRole="button"

        accessibilityHint="Opens the conversation thread"

      >

        <View style={styles.rowInner}>

          <View style={styles.avatarWrap}>

            {isGroup ? (

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

                uri={

                  item.avatar

                  ?? (counterpartyId ? profileMediaOverrides[counterpartyId]?.avatar ?? undefined : undefined)

                }

                size={48}

                isUnread={item.unread}

                ringWidth={2}

                fallbackInitials={

                  safeDisplayTitle === 'Thryft user'

                    ? 'T'

                    : safeDisplayTitle.slice(0, 2).toUpperCase()

                }

              />

            )}

          </View>



          <View style={styles.messageBody}>

            <View style={styles.messageTop}>

              <View style={styles.titleRow}>

                <Text style={[styles.nameText, item.unread && styles.nameUnread]}>{displayTitle}</Text>

                {item.isPinned ? <Ionicons name="pin" size={12} color={Colors.brand} style={styles.pinIcon} /> : null}

                {mutedIds.includes(item.id) ? <Ionicons name="volume-mute" size={12} color={Colors.textMuted} style={styles.pinIcon} /> : null}

              </View>

              <Caption color={item.unread ? Colors.textPrimary : Colors.textMuted}>{item.lastMessageTime}</Caption>

            </View>



            <View style={styles.snippetRow}>

              {isGroup && (

                <Caption color={Colors.textMuted} style={styles.memberCount}>

                  {item.participantIds?.length ?? 0} members

                </Caption>

              )}

              <Text style={[styles.snippet, item.unread && styles.snippetUnread]} numberOfLines={1}>

                {item.draftText ? (

                  <Text>

                    <Text style={styles.draftLabel}>Draft: </Text>

                    {item.draftText}

                  </Text>

                ) : item.lastMessage}

              </Text>

              {item.unread ? <View style={styles.unreadDot} /> : null}

            </View>

          </View>

        </View>

      </AnimatedPressable>

    );



    return (

      <View>

        {isRequest ? (

          requestRow

        ) : (

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

      </View>

    );

  };



  return (

    <SafeAreaView style={styles.container} edges={['top']}>

      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={Colors.background} />



      <View style={styles.header}>

        <View style={styles.headerRow}>

          <Text style={styles.title}>Inbox</Text>

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

              <Ionicons name="people-outline" size={20} color={Colors.textPrimary} />

            </AnimatedPressable>

            <AnimatedPressable

              style={styles.iconBtn}

              onPress={() => navigation.navigate('ChatSettings')}

              activeOpacity={0.7}

              scaleValue={0.9}

              hapticFeedback="light"

              accessibilityLabel="Settings"

              accessibilityRole="button"

            >

              <Ionicons name="cog-outline" size={20} color={Colors.textPrimary} />

            </AnimatedPressable>

          </View>

        </View>



        <AppSearchBar

          placeholder="Search"

          value={searchQuery}

          onChangeText={setSearchQuery}

          containerStyle={styles.searchWrap}

          inputProps={{

            autoCapitalize: 'none',

            autoCorrect: false,

            accessibilityLabel: 'Search conversations',

          }}

        />



        <AppSegmentControl

          style={styles.segmentStrip}

          options={SEGMENT_OPTIONS}

          value={segment}

          onChange={setSegment}

          optionStyle={styles.segmentChip}

          optionActiveStyle={styles.segmentChipActive}

          optionTextStyle={styles.segmentChipText}

          optionTextActiveStyle={styles.segmentChipTextActive}

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

                <SkeletonLoader width={52} height={52} borderRadius={Radius.full} />

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

              <Reanimated.View entering={FadeInDown.duration(300)} style={styles.requestsBanner}>

                <AnimatedPressable

                  onPress={() => navigation.navigate('MessageRequests')}

                  activeOpacity={0.7}

                  scaleValue={0.98}

                  hapticFeedback="light"

                  accessibilityLabel={`${messageRequests.length} message requests`}

                  accessibilityRole="button"

                >

                  <View style={styles.requestsBannerInner}>

                    <View style={styles.requestsBadge}>

                      <Text style={styles.requestsBadgeText}>{messageRequests.length}</Text>

                    </View>

                    <Text style={styles.requestsBannerText}>Message requests</Text>

                    <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />

                  </View>

                </AnimatedPressable>

              </Reanimated.View>

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

  container: {

    flex: 1,

    backgroundColor: Colors.background,

  },

  header: {

    paddingHorizontal: Space.md + 4,

    paddingTop: Space.sm,

    paddingBottom: Space.sm + 4,

    gap: Space.sm + 4,

  },

  headerRow: {

    flexDirection: 'row',

    alignItems: 'center',

    justifyContent: 'space-between',

  },

  title: {

    fontSize: Type.title.size,

    fontFamily: Typography.family.bold,

    color: Colors.textPrimary,

    letterSpacing: -0.3,

  },

  headerActions: {

    flexDirection: 'row',

    gap: Space.sm + 2,

  },

  iconBtn: {

    width: 40,

    height: 40,

    borderRadius: Radius.full,

    backgroundColor: Colors.surfaceAlt,

    justifyContent: 'center',

    alignItems: 'center',

  },

  searchWrap: {

    backgroundColor: Colors.surfaceAlt,

    borderRadius: Radius.full,

    paddingHorizontal: Space.md,

    minHeight: 44,

  },

  segmentStrip: {

    marginTop: Space.xs,

  },

  segmentChip: {

    paddingVertical: Space.sm - 2,

    paddingHorizontal: Space.md,

    borderRadius: Radius.full,

    backgroundColor: 'transparent',

  },

  segmentChipActive: {

    backgroundColor: Colors.brand,

  },

  segmentChipText: {

    fontSize: Type.caption.size,

    fontFamily: Typography.family.medium,

    color: Colors.textMuted,

  },

  segmentChipTextActive: {

    color: Colors.textInverse,

    fontFamily: Typography.family.semibold,

  },

  listContent: {

    paddingBottom: Space.xxl + 24,

    flexGrow: 1,

    paddingTop: Space.sm,

  },

  rowInner: {

    flexDirection: 'row',

    gap: Space.sm + 6,

    alignItems: 'center',

    paddingVertical: Space.md,

    paddingHorizontal: Space.md,

    backgroundColor: Colors.surface,

    borderRadius: Radius.lg,

    marginHorizontal: Space.md,

    marginVertical: 4,

    ...Elevation.subtle,

  },

  avatarWrap: { position: 'relative' },

  groupAvatar: {

    width: 48,

    height: 48,

    borderRadius: Radius.full,

    backgroundColor: Colors.surfaceAlt,

    alignItems: 'center',

    justifyContent: 'center',

    position: 'relative',

  },

  groupAvatarText: {

    fontSize: 15,

    fontFamily: Typography.family.bold,

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

  messageBody: { flex: 1 },

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

    fontFamily: Typography.family.medium,

    color: Colors.textPrimary,

    letterSpacing: Type.body.letterSpacing,

  },

  nameUnread: {

    fontFamily: Typography.family.bold,

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

    fontSize: 11,

    backgroundColor: Colors.surfaceAlt,

    paddingHorizontal: 6,

    paddingVertical: 1,

    borderRadius: Radius.sm,

    overflow: 'hidden',

  },

  snippet: {

    color: Colors.textSecondary,

    fontSize: Type.caption.size,

    fontFamily: Typography.family.regular,

    lineHeight: Type.caption.lineHeight,

    flex: 1,

  },

  snippetUnread: {

    color: Colors.textPrimary,

    fontFamily: Typography.family.medium,

  },

  unreadDot: {

    minWidth: 20,

    height: 20,

    borderRadius: 10,

    backgroundColor: Colors.textPrimary,

    marginLeft: Space.xs,

    alignItems: 'center',

    justifyContent: 'center',

    paddingHorizontal: 6,

  },

  draftLabel: {

    color: Colors.brand,

    fontFamily: Typography.family.semibold,

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

    backgroundColor: 'rgba(255,77,77,0.12)',

    justifyContent: 'center',

    alignItems: 'center',

    width: 72,

    borderRadius: Radius.xl,

  },

  swipePin: {

    backgroundColor: Colors.surfaceAlt,

    justifyContent: 'center',

    alignItems: 'center',

    width: 72,

    borderRadius: Radius.xl,

  },

  swipeArchive: {

    backgroundColor: 'rgba(59,130,246,0.12)',

    justifyContent: 'center',

    alignItems: 'center',

    width: 72,

    borderRadius: Radius.xl,

  },

  swipeMute: {

    backgroundColor: 'rgba(107,114,128,0.12)',

    justifyContent: 'center',

    alignItems: 'center',

    width: 72,

    borderRadius: Radius.xl,

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

    fontFamily: Typography.family.semibold,

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

  requestsBannerInner: {

    flexDirection: 'row',

    alignItems: 'center',

    gap: Space.sm,

    paddingVertical: 12,

    paddingHorizontal: Space.md,

    backgroundColor: Colors.surface,

    borderRadius: Radius.lg,

    ...Elevation.subtle,

  },

  requestsBadge: {

    width: 24,

    height: 24,

    borderRadius: 12,

    backgroundColor: Colors.textPrimary,

    justifyContent: 'center',

    alignItems: 'center',

  },

  requestsBadgeText: {

    fontSize: 12,

    fontFamily: Typography.family.bold,

    color: Colors.background,

  },

  requestsBannerText: {

    flex: 1,

    fontSize: Type.body.size,

    fontFamily: Typography.family.medium,

    color: Colors.textPrimary,

    letterSpacing: Type.body.letterSpacing,

  },

  requestBtnAcceptText: {

    fontSize: Type.caption.size,

    fontFamily: Typography.family.semibold,

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

    fontFamily: Typography.family.medium,

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

    fontFamily: Typography.family.medium,

  },

  errorBannerRetry: {

    color: Colors.brand,

    fontSize: Type.caption.size,

    fontFamily: Typography.family.semibold,

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

