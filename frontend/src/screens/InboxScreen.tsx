import React, { useState, useCallback, useMemo } from 'react';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { View, Text, StyleSheet, StatusBar, RefreshControl } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { ActiveTheme, Colors } from '../constants/colors';
import { MOCK_USERS } from '../data/mockData';
import type { Conversation } from '../data/mockData';
import { mockFind } from '../utils/mockGate';
import { RootStackParamList } from '../navigation/types';
import { Swipeable } from 'react-native-gesture-handler';
import Reanimated, { FadeInDown, useSharedValue, useAnimatedScrollHandler } from 'react-native-reanimated';
import { EmptyState } from '../components/EmptyState';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { RefreshIndicator } from '../components/RefreshIndicator';
import { useBackendData } from '../context/BackendDataContext';
import { fetchConversationsFromApi } from '../services/chatApi';
import { AppInput } from '../components/ui/AppInput';
import { AppSegmentControl } from '../components/ui/AppSegmentControl';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useHaptic } from '../hooks/useHaptic';
import { Motion } from '../constants/motion';
import { Space, Radius, Type } from '../theme/designTokens';
import { Meta, Caption, BodyEmphasis } from '../components/ui/Text';
import { GlassCard } from '../components/ui/GlassSurface';
import { AvatarRing } from '../components/chat/AvatarRing';
import { PulseDot } from '../components/chat/PulseDot';

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
  const reducedMotionEnabled = useReducedMotion();

  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
    },
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshListings();
    try {
      const remoteConversations = await fetchConversationsFromApi();
      for (const conversation of remoteConversations) {
        upsertConversation(conversation);
      }
    } catch {
      // Keep existing local conversations when backend sync is unavailable.
    }
    setTimeout(() => setRefreshing(false), 400);
  };

  const AnimatedFlashList = Reanimated.createAnimatedComponent(FlashList);

  const participantNameLookup = useMemo(() => {
    const map = new Map<string, string>();
    for (const user of MOCK_USERS) {
      map.set(user.id, user.username);
    }
    map.set('me', currentUser?.username ?? 'you');
    if (currentUser?.id) {
      map.set(currentUser.id, currentUser.username);
    }
    return map;
  }, [currentUser?.id, currentUser?.username]);

  const visibleConversations = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const scoped = conversations.filter((conversation) => {
      if (segment === 'unread' && !conversation.unread) return false;
      if (segment === 'groups' && conversation.type !== 'group') return false;
      if (!normalizedQuery) return true;

      const seller = mockFind(MOCK_USERS, (user) => user.id === conversation.sellerId);
      const counterpartyId = conversation.participantIds?.find((id) => id !== 'me' && id !== currentUser?.id);
      const title = conversation.type === 'group'
        ? conversation.title ?? 'group chat'
        : seller?.username ?? (counterpartyId ? participantNameLookup.get(counterpartyId) ?? counterpartyId : 'direct message');

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
    deleteConversation(id);
    show('Conversation deleted', 'error');
  }, [deleteConversation, show, haptic]);

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
    const seller = mockFind(MOCK_USERS, (u) => u.id === item.sellerId);
    const counterpartyId = item.participantIds?.find((id) => id !== 'me' && id !== currentUser?.id);
    const displayTitle = isGroup
      ? item.title ?? 'Untitled Group'
      : seller?.username ?? (counterpartyId ? participantNameLookup.get(counterpartyId) ?? counterpartyId : 'Unknown user');

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
          <GlassCard intensity={30} style={styles.glassCard}>
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
              <View style={styles.cardInner}>
                <View style={styles.avatarWrap}>
                  {isGroup ? (
                    <View style={styles.groupAvatar}>
                      <Ionicons name="people" size={20} color={Colors.textPrimary} />
                    </View>
                  ) : (
                    <AvatarRing
                      uri={seller?.avatar ?? ''}
                      size={52}
                      isOnline={!isGroup}
                      isUnread={item.unread}
                      ringWidth={2}
                    />
                  )}
                </View>

                <View style={styles.messageBody}>
                  <View style={styles.messageTop}>
                    <View style={styles.titleRow}>
                      <BodyEmphasis style={item.unread ? styles.titleUnread : undefined}>{displayTitle}</BodyEmphasis>
                      {item.isPinned ? <Ionicons name="pin" size={12} color={Colors.brand} style={styles.pinIcon} /> : null}
                    </View>
                    <Caption color={item.unread ? Colors.textPrimary : Colors.textMuted}>{item.lastMessageTime}</Caption>
                  </View>

                  <View style={styles.snippetRow}>
                    <Text style={[styles.snippet, item.unread && styles.snippetUnread]} numberOfLines={2}>
                      {item.draftText ? (
                        <Text>
                          <Text style={styles.draftLabel}>Draft: </Text>
                          {item.draftText}
                        </Text>
                      ) : item.lastMessage}
                    </Text>
                    {item.unread ? <PulseDot size={8} color={Colors.brand} /> : null}
                  </View>
                </View>
              </View>
            </AnimatedPressable>
          </GlassCard>
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
              onPress={() => navigation.navigate('Settings')}
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

        <AppInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search"
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Search conversations"
          inputContainerStyle={styles.searchWrap}
          inputStyle={styles.searchInput}
          prefix={<Ionicons name="search" size={18} color={Colors.textMuted} />}
          suffix={searchQuery.length > 0 ? (
            <AnimatedPressable
              onPress={() => setSearchQuery('')}
              style={styles.clearSearchBtn}
              accessibilityLabel="Clear search"
              accessibilityRole="button"
              activeOpacity={0.7}
              scaleValue={0.9}
              hapticFeedback="light"
            >
              <Ionicons name="close" size={16} color={Colors.textSecondary} />
            </AnimatedPressable>
          ) : null}
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

      <View style={{ flex: 1 }}>
        <RefreshIndicator scrollY={scrollY} isRefreshing={refreshing} topInset={20} />

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
    backgroundColor: Colors.glassBg,
    borderWidth: 0.5,
    borderColor: Colors.glassBorder,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchWrap: {
    backgroundColor: Colors.glassBg,
    borderWidth: 0.5,
    borderColor: Colors.glassBorder,
    borderRadius: Radius.lg,
    paddingHorizontal: Space.md - 4,
    minHeight: 44,
  },
  searchInput: {
    fontSize: Type.body.size,
    color: Colors.textPrimary,
    paddingVertical: 0,
  },
  clearSearchBtn: {
    width: 24,
    height: 24,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
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
    paddingHorizontal: Space.md + 4,
    paddingBottom: Space.xxl + 24,
    flexGrow: 1,
  },
  glassCard: {
    marginVertical: 0,
  },
  cardInner: {
    flexDirection: 'row',
    gap: Space.sm + 6,
    alignItems: 'flex-start',
    padding: Space.md,
  },
  avatarWrap: { position: 'relative' },
  groupAvatar: {
    width: 52,
    height: 52,
    borderRadius: Radius.full,
    backgroundColor: Colors.glassBg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0.5,
    borderColor: Colors.glassBorder,
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
  titleUnread: {
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
  draftLabel: {
    color: Colors.brand,
    fontFamily: 'Inter_600SemiBold',
  },
  swipeDelete: {
    backgroundColor: 'rgba(255,77,77,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    width: 72,
    borderRadius: Radius.xl + 4,
    marginLeft: Space.sm,
    borderWidth: 0.5,
    borderColor: 'rgba(255,77,77,0.25)',
  },
  swipePin: {
    backgroundColor: 'rgba(212,175,55,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    width: 72,
    borderRadius: Radius.xl + 4,
    marginRight: Space.sm,
    borderWidth: 0.5,
    borderColor: 'rgba(212,175,55,0.25)',
  },
});
