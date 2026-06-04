import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { View, Text, StyleSheet, StatusBar, RefreshControl, Alert } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import NetInfo from '@react-native-community/netinfo';
import { ActiveTheme, Colors } from '../constants/colors';
import type { Conversation } from '../data/mockData';
import { RootStackParamList } from '../navigation/types';
import { Swipeable } from 'react-native-gesture-handler';
import Reanimated, { FadeInDown, useSharedValue, useAnimatedScrollHandler } from 'react-native-reanimated';
import { EmptyState } from '../components/EmptyState';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { RefreshIndicator } from '../components/RefreshIndicator';
import { useBackendData } from '../context/BackendDataContext';
import { fetchConversationsFromApi, deleteConversationOnApi } from '../services/chatApi';
import { AppSearchBar } from '../components/ui/AppSearchBar';
import { AppSegmentControl } from '../components/ui/AppSegmentControl';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useHaptic } from '../hooks/useHaptic';
import { Motion } from '../constants/motion';
import { Space, Radius, Type } from '../theme/designTokens';
import { Meta, Caption, BodyEmphasis } from '../components/ui/Text';
import { GlassCard } from '../components/ui/GlassSurface';
import { AvatarRing } from '../components/chat/AvatarRing';
import { SkeletonLoader } from '../components/SkeletonLoader';

type NavT = StackNavigationProp<RootStackParamList>;

type ConvoItem = Conversation;
type InboxSegment = 'all' | 'unread' | 'groups';

const SEGMENT_OPTIONS: Array<{ value: InboxSegment; label: string; accessibilityLabel: string }> = [
  { value: 'all', label: 'All', accessibilityLabel: 'Show all conversations' },
  { value: 'unread', label: 'Unread', accessibilityLabel: 'Filter unread conversations' },
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
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [segment, setSegment] = useState<InboxSegment>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [syncError, setSyncError] = useState('');
  const [isOffline, setIsOffline] = useState(false);
  const reducedMotionEnabled = useReducedMotion();

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

  const loadConversations = async () => {
    setSyncError('');
    setIsLoading(true);
    try {
      const remoteConversations = await fetchConversationsFromApi();
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
      const remoteConversations = await fetchConversationsFromApi();
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
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const scoped = conversations.filter((conversation) => {
      if (segment === 'unread' && !conversation.unread) return false;
      if (segment === 'groups' && conversation.type !== 'group') return false;
      if (!normalizedQuery) return true;

      const counterpartyId = conversation.participantIds?.find((id) => id !== 'me' && id !== currentUser?.id);
      const title = conversation.type === 'group'
        ? conversation.title ?? 'group chat'
        : (counterpartyId ? participantNameLookup.get(counterpartyId) ?? 'Thryft user' : 'Thryft user');

      const corpus = [
        title,
        conversation.lastMessage,
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
  }, [conversations, searchQuery, segment, currentUser?.id, participantNameLookup]);

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

  const handlePin = useCallback((id: string) => {
    haptic.medium();
    toggleConversationPinned(id);
    show('Conversation pinned', 'success');
  }, [toggleConversationPinned, show, haptic]);

  const renderRightActions = (id: string) => (
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
  );

  const renderLeftActions = (id: string) => (
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
  );

  const renderItem = ({ item, index }: { item: ConvoItem; index: number }) => {
    const isGroup = item.type === 'group';
    const counterpartyId = item.participantIds?.find((id) => id !== 'me' && id !== currentUser?.id);
    const displayTitle = isGroup
      ? item.title ?? 'Untitled Group'
      : (counterpartyId ? participantNameLookup.get(counterpartyId) ?? 'Thryft user' : 'Thryft user');

    return (
      <Reanimated.View
        entering={
          reducedMotionEnabled
            ? undefined
            : FadeInDown
              .delay(Math.min(index, Motion.list.maxStaggerItems) * Motion.list.staggerStep)
              .duration(Motion.list.enterDuration)
        }
      >
        <Swipeable
          friction={2}
          overshootLeft={false}
          overshootRight={false}
          renderRightActions={() => renderRightActions(item.id)}
          renderLeftActions={() => renderLeftActions(item.id)}
        >
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
                      <Ionicons name="people" size={20} color={Colors.textPrimary} />
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
                        displayTitle === 'Thryft user'
                          ? 'T'
                          : displayTitle.slice(0, 2).toUpperCase()
                      }
                    />
                  )}
                </View>

                <View style={styles.messageBody}>
                  <View style={styles.messageTop}>
                    <View style={styles.titleRow}>
                      <Text style={[styles.nameText, item.unread && styles.nameUnread]}>{displayTitle}</Text>
                      {item.isPinned ? <Ionicons name="pin" size={12} color={Colors.brand} style={styles.pinIcon} /> : null}
                    </View>
                    <Caption color={item.unread ? Colors.textPrimary : Colors.textMuted}>{item.lastMessageTime}</Caption>
                  </View>

                  <View style={styles.snippetRow}>
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
        </Swipeable>
      </Reanimated.View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={Colors.background} />

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
          <Ionicons name="cloud-offline-outline" size={16} color={Colors.textInverse} />
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
          <AnimatedFlashList
            data={visibleConversations}
            keyExtractor={(c: any) => c.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
            ItemSeparatorComponent={() => <View style={{ height: Space.sm + 2 }} />}
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
              <EmptyState
                icon="chatbubbles-outline"
                title={searchQuery || segment !== 'all' ? 'No matching conversations' : 'No conversations yet'}
                subtitle={searchQuery || segment !== 'all'
                  ? 'Try another keyword or filter.'
                  : 'Message a seller to start a chat.'}
                ctaLabel="Browse listings"
                onCtaPress={() => navigation.navigate('MainTabs')}
              />
            }
          />
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
    fontFamily: 'Inter_700Bold',
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
    fontFamily: 'Inter_500Medium',
    color: Colors.textMuted,
  },
  segmentChipTextActive: {
    color: Colors.textInverse,
    fontFamily: 'Inter_600SemiBold',
  },
  listContent: {
    paddingBottom: Space.xxl + 24,
    flexGrow: 1,
  },
  rowInner: {
    flexDirection: 'row',
    gap: Space.sm + 6,
    alignItems: 'center',
    paddingVertical: Space.sm + 6,
    paddingHorizontal: Space.md + 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  avatarWrap: { position: 'relative' },
  groupAvatar: {
    width: 48,
    height: 48,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
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
    fontFamily: 'Inter_500Medium',
    color: Colors.textPrimary,
    letterSpacing: Type.body.letterSpacing,
  },
  nameUnread: {
    fontFamily: 'Inter_700Bold',
  },
  pinIcon: {
    marginLeft: 2,
  },
  snippetRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: Space.sm,
  },
  snippet: {
    color: Colors.textSecondary,
    fontSize: Type.body.size,
    fontFamily: 'Inter_400Regular',
    lineHeight: Type.body.lineHeight,
    flex: 1,
  },
  snippetUnread: {
    color: Colors.textPrimary,
    fontFamily: 'Inter_500Medium',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.brand,
    marginLeft: Space.xs,
  },
  draftLabel: {
    color: Colors.brand,
    fontFamily: 'Inter_600SemiBold',
  },
  swipeDelete: {
    backgroundColor: 'rgba(255,77,77,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    width: 72,
    borderRadius: Radius.xl,
    marginLeft: Space.sm,
  },
  swipePin: {
    backgroundColor: 'rgba(212,175,55,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    width: 72,
    borderRadius: Radius.xl,
    marginRight: Space.sm,
  },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs,
    backgroundColor: Colors.textPrimary,
    paddingVertical: Space.xs + 2,
    paddingHorizontal: Space.md,
  },
  offlineBannerText: {
    color: Colors.textInverse,
    fontSize: Type.caption.size,
    fontFamily: 'Inter_500Medium',
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
    fontFamily: 'Inter_500Medium',
  },
  errorBannerRetry: {
    color: Colors.brand,
    fontSize: Type.caption.size,
    fontFamily: 'Inter_600SemiBold',
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
