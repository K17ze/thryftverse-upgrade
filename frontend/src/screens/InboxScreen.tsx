import React, { useState, useCallback, useMemo } from 'react';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { View, Text, StyleSheet, StatusBar, RefreshControl } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { CachedImage } from '../components/CachedImage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { ActiveTheme, Colors } from '../constants/colors';
import { MOCK_USERS, MOCK_LISTINGS } from '../data/mockData';
import type { Conversation } from '../data/mockData';
import { mockFind } from '../utils/mockGate';
import { RootStackParamList } from '../navigation/types';
import { Swipeable } from 'react-native-gesture-handler';
import Reanimated, { FadeInDown, useSharedValue, useAnimatedScrollHandler } from 'react-native-reanimated';
import { EmptyState } from '../components/EmptyState';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { RefreshIndicator } from '../components/RefreshIndicator';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useBackendData } from '../context/BackendDataContext';
import { fetchConversationsFromApi } from '../services/chatApi';
import { AppInput } from '../components/ui/AppInput';
import { AppButton } from '../components/ui/AppButton';
import { AppSegmentControl } from '../components/ui/AppSegmentControl';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useHaptic } from '../hooks/useHaptic';
import { Motion } from '../constants/motion';
import { Space, Radius, Type } from '../theme/designTokens';
import { ChatCard } from '../components/chat/ChatCard';
import { Typography } from '../constants/typography';
import { Meta, Caption, BodyEmphasis } from '../components/ui/Text';

type NavT = StackNavigationProp<RootStackParamList>;

type ConvoItem = Conversation;
type InboxSegment = 'all' | 'unread' | 'groups' | 'direct';
type ConversationSearchInsight = {
  score: number;
  matchedField: string;
  preview: string;
};

const SEGMENT_OPTIONS: Array<{ value: InboxSegment; label: string; accessibilityLabel: string }> = [
  { value: 'direct', label: 'Direct', accessibilityLabel: 'Filter direct messages' },
  { value: 'unread', label: 'Unread', accessibilityLabel: 'Filter unread conversations' },
  { value: 'groups', label: 'Groups', accessibilityLabel: 'Filter group conversations' },
  { value: 'all', label: 'All', accessibilityLabel: 'Show all conversations' },
];

export default function InboxScreen() {
  const navigation = useNavigation<NavT>();
  const { show } = useToast();
  const haptic = useHaptic();
  const { formatFromFiat } = useFormattedPrice();
  const { listings, refreshListings } = useBackendData();
  const currentUser = useStore((state) => state.currentUser);
  const conversations = useStore((state) => state.conversations);
  const upsertConversation = useStore((state) => state.upsertConversation);
  const deleteConversation = useStore((state) => state.deleteConversation);
  const archiveConversation = useStore((state) => state.archiveConversation);
  const markConversationRead = useStore((state) => state.markConversationRead);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [segment, setSegment] = useState<InboxSegment>('direct');
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

  const { visibleConversations, searchInsights } = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean);
    const nextSearchInsights = new Map<string, ConversationSearchInsight>();

    const scopedConversations = conversations.filter((conversation) => {
      if (segment === 'unread' && !conversation.unread) {
        return false;
      }

      if (segment === 'groups' && conversation.type !== 'group') {
        return false;
      }

      if (segment === 'direct' && conversation.type !== 'dm') {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const listing = listings.find((item) => item.id === conversation.itemId)
        || mockFind(MOCK_LISTINGS, (item) => item.id === conversation.itemId);
      const seller = mockFind(MOCK_USERS, (user) => user.id === conversation.sellerId);
      const counterpartyId = conversation.participantIds?.find((id) => id !== 'me' && id !== currentUser?.id);
      const title = conversation.type === 'group'
        ? conversation.title ?? 'group chat'
        : seller?.username ?? (counterpartyId ? participantNameLookup.get(counterpartyId) ?? counterpartyId : 'direct message');

      const participantLabels = (conversation.participantIds ?? [])
        .map((participantId) => participantNameLookup.get(participantId) ?? participantId)
        .join(' ');

      const messageCorpus = conversation.messages
        .slice(-14)
        .map((message) => `${message.text ?? message.systemTitle ?? ''}`)
        .join(' ');

      const candidates: Array<{ field: string; value: string; weight: number }> = [
        { field: 'title', value: title, weight: 14 },
        { field: 'last message', value: conversation.lastMessage, weight: 12 },
        { field: 'participants', value: participantLabels, weight: 10 },
        { field: 'message history', value: messageCorpus, weight: 9 },
        { field: 'listing title', value: listing?.title ?? '', weight: 8 },
        { field: 'listing brand', value: listing?.brand ?? '', weight: 6 },
        { field: 'listing category', value: `${listing?.category ?? ''} ${listing?.subcategory ?? ''}`, weight: 5 },
      ];

      let bestMatch: ConversationSearchInsight | null = null;

      for (const candidate of candidates) {
        const normalizedCandidate = candidate.value.toLowerCase();
        if (!normalizedCandidate) {
          continue;
        }

        const directMatch = normalizedCandidate.includes(normalizedQuery);
        const tokenMatch = queryTokens.length > 1 && queryTokens.every((token) => normalizedCandidate.includes(token));
        if (!directMatch && !tokenMatch) {
          continue;
        }

        const baseScore = directMatch ? candidate.weight : Math.max(candidate.weight - 2, 1);
        const score = baseScore + (tokenMatch ? queryTokens.length : 0);

        if (!bestMatch || score > bestMatch.score) {
          bestMatch = {
            score,
            matchedField: candidate.field,
            preview: candidate.value,
          };
        }
      }

      if (bestMatch) {
        nextSearchInsights.set(conversation.id, bestMatch);
        return true;
      }

      return false;
    });

    const orderedConversations = [...scopedConversations];
    orderedConversations.sort((a, b) => {
      const unreadDiff = Number(b.unread) - Number(a.unread);
      if (unreadDiff !== 0) {
        return unreadDiff;
      }

      const scoreDiff = (nextSearchInsights.get(b.id)?.score ?? 0) - (nextSearchInsights.get(a.id)?.score ?? 0);
      if (scoreDiff !== 0) {
        return scoreDiff;
      }

      return b.lastMessageTime.localeCompare(a.lastMessageTime);
    });

    return {
      visibleConversations: orderedConversations,
      searchInsights: nextSearchInsights,
    };
  }, [conversations, listings, searchQuery, segment, currentUser?.id, participantNameLookup]);

  const unreadCount = useMemo(
    () => conversations.filter((item) => item.unread).length,
    [conversations],
  );

  const groupCount = useMemo(
    () => conversations.filter((item) => item.type === 'group').length,
    [conversations],
  );

  const offerThreadCount = useMemo(
    () => conversations.filter((item) => item.messages.some((message) => message.offerPrice !== undefined)).length,
    [conversations],
  );

  const handleDelete = useCallback((id: string) => {
    haptic.medium();
    deleteConversation(id);
    show('Conversation deleted', 'error');
  }, [deleteConversation, show, haptic]);

  const handleArchive = useCallback((id: string) => {
    haptic.light();
    archiveConversation(id);
    show('Conversation archived', 'info');
  }, [archiveConversation, show, haptic]);

  const renderRightActions = (id: string) => (
    <AnimatedPressable
      style={styles.swipeDelete}
      onPress={() => handleDelete(id)}
      accessibilityLabel="Delete conversation"
      accessibilityRole="button"
      accessibilityHint="Deletes this conversation thread"
      activeOpacity={0.7}
      scaleValue={0.95}
      hapticFeedback="medium"
    >
      <Ionicons name="trash-outline" size={22} color={Colors.textInverse} />
      <Text style={styles.swipeActionText}>Delete</Text>
    </AnimatedPressable>
  );

  const renderLeftActions = (id: string) => (
    <AnimatedPressable
      style={styles.swipeArchive}
      onPress={() => handleArchive(id)}
      accessibilityLabel="Archive conversation"
      accessibilityRole="button"
      accessibilityHint="Moves this conversation to archived threads"
      activeOpacity={0.7}
      scaleValue={0.95}
      hapticFeedback="light"
    >
      <Ionicons name="archive-outline" size={22} color={Colors.textInverse} />
      <Text style={styles.swipeActionText}>Archive</Text>
    </AnimatedPressable>
  );

  const renderItem = ({ item, index }: { item: ConvoItem; index: number }) => {
    const isGroup = item.type === 'group';
    const seller = mockFind(MOCK_USERS, (u) => u.id === item.sellerId);
    const listing = listings.find((l) => l.id === item.itemId) || mockFind(MOCK_LISTINGS, (l) => l.id === item.itemId);
    const counterpartyId = item.participantIds?.find((id) => id !== 'me' && id !== currentUser?.id);
    const displayTitle = isGroup
      ? item.title ?? 'Untitled Group'
      : seller?.username ?? (counterpartyId ? participantNameLookup.get(counterpartyId) ?? counterpartyId : 'Unknown user');
    const memberCount = item.participantIds?.length ?? 0;
    const deployedBotCount = item.botIds?.length ?? 0;
    const searchInsight = searchInsights.get(item.id);

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
            style={styles.messageCard}
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
            <View style={styles.avatarWrap}>
              {isGroup ? (
                <View style={styles.groupAvatar}>
                  <Ionicons name="people" size={20} color={Colors.textPrimary} />
                </View>
              ) : (
                <>
                  <CachedImage uri={seller?.avatar ?? ''} style={styles.avatar} containerStyle={styles.avatarContainer} contentFit="cover" />
                  <View style={styles.onlineDot} />
                </>
              )}
            </View>

            <View style={styles.messageBody}>
              <View style={styles.messageTop}>
                <BodyEmphasis>{displayTitle}</BodyEmphasis>
                <Caption color={Colors.textMuted}>{item.lastMessageTime}</Caption>
              </View>

              {isGroup ? (
                <View style={styles.groupMetaRow}>
                  <Meta>{memberCount} members</Meta>
                  {deployedBotCount > 0 ? (
                    <Meta>{deployedBotCount} bot{deployedBotCount === 1 ? '' : 's'}</Meta>
                  ) : null}
                </View>
              ) : (
                <Meta>Direct message</Meta>
              )}

              {item.unread ? (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadBadgeText}>Unread</Text>
                </View>
              ) : null}

              <Text style={styles.snippet} numberOfLines={2}>{item.lastMessage}</Text>

              {searchQuery.trim().length > 0 && searchInsight ? (
                <View style={styles.searchHitRow}>
                  <Ionicons name="sparkles-outline" size={12} color={Colors.textMuted} />
                  <Caption color={Colors.textMuted} numberOfLines={1}>
                    Matched {searchInsight.matchedField}: {searchInsight.preview}
                  </Caption>
                </View>
              ) : null}

              {!isGroup && listing && (
                <View style={styles.itemPreview}>
                  <CachedImage uri={listing.images[0]} style={styles.itemThumb} containerStyle={styles.itemThumbContainer} contentFit="cover" />
                  <Caption color={Colors.textSecondary} style={styles.itemName} numberOfLines={1}>{listing.title}</Caption>
                  <BodyEmphasis>{formatFromFiat(listing.price, 'GBP', { displayMode: 'fiat' })}</BodyEmphasis>
                </View>
              )}
            </View>

            {item.unread && <View style={styles.unreadDot} />}
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
          <View style={styles.headerTitleWrap}>
            <Text style={styles.hugeTitle}>Inbox</Text>
            <Caption color={Colors.textSecondary} numberOfLines={1}>Offers, groups & buyer updates</Caption>
          </View>
          <View style={styles.headerActions}>
            <AppButton
              title="New Group"
              icon={<Ionicons name="people-outline" size={15} color={Colors.textPrimary} />}
              onPress={() => navigation.navigate('CreateGroupChat')}
              variant="secondary"
              size="sm"
              style={styles.addGroupBtn}
              titleStyle={styles.addGroupBtnText}
              iconContainerStyle={styles.addGroupIconWrap}
              accessibilityLabel="Create new group chat"
              accessibilityHint="Opens group chat creation"
            />
            <AnimatedPressable
              style={styles.policiesBtn}
              onPress={() => navigation.navigate('Settings')}
              activeOpacity={0.85}
              scaleValue={0.9}
              hapticFeedback="light"
              accessibilityLabel="Chat settings and policies"
              accessibilityRole="button"
              accessibilityHint="Opens messaging and safety settings"
            >
              <Ionicons name="shield-checkmark-outline" size={18} color={Colors.textPrimary} />
            </AnimatedPressable>
          </View>
        </View>

        <AppInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search conversations, messages, members, listings"
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Search conversations"
          accessibilityHint="Searches across conversations, participants, listings, and message history"
          inputContainerStyle={styles.searchWrap}
          inputStyle={styles.searchInput}
          prefix={<Ionicons name="search" size={18} color={Colors.textMuted} />}
          suffix={searchQuery.length > 0 ? (
            <AnimatedPressable
              onPress={() => setSearchQuery('')}
              style={styles.clearSearchBtn}
              accessibilityLabel="Clear inbox search"
              accessibilityRole="button"
              accessibilityHint="Clears search query"
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
          fullWidth
          optionStyle={styles.segmentChip}
          optionActiveStyle={styles.segmentChipActive}
          optionTextStyle={styles.segmentChipText}
          optionTextActiveStyle={styles.segmentChipTextActive}
        />

        <View style={styles.quickRail}>
          <AnimatedPressable
            style={[styles.quickChip, segment === 'unread' && styles.quickChipActive]}
            onPress={() => setSegment('unread')}
            accessibilityRole="button"
            accessibilityLabel="Show unread conversations"
            activeOpacity={0.85}
            scaleValue={0.95}
            hapticFeedback="light"
          >
            <Ionicons name="mail-unread-outline" size={14} color={segment === 'unread' ? Colors.background : Colors.textSecondary} />
            <Text style={[styles.quickChipText, segment === 'unread' && styles.quickChipTextActive]}>Unread {unreadCount}</Text>
          </AnimatedPressable>

          <AnimatedPressable
            style={styles.quickChip}
            onPress={() => setSearchQuery('offer')}
            accessibilityRole="button"
            accessibilityLabel="Find offer conversations"
            activeOpacity={0.85}
            scaleValue={0.95}
            hapticFeedback="light"
          >
            <Ionicons name="pricetag-outline" size={14} color={Colors.textSecondary} />
            <Text style={styles.quickChipText}>Offers {offerThreadCount}</Text>
          </AnimatedPressable>

          <AnimatedPressable
            style={[styles.quickChip, segment === 'groups' && styles.quickChipActive]}
            onPress={() => setSegment('groups')}
            accessibilityRole="button"
            accessibilityLabel="Show group conversations"
            activeOpacity={0.85}
            scaleValue={0.95}
            hapticFeedback="light"
          >
            <Ionicons name="people-outline" size={14} color={segment === 'groups' ? Colors.background : Colors.textSecondary} />
            <Text style={[styles.quickChipText, segment === 'groups' && styles.quickChipTextActive]}>Groups {groupCount}</Text>
          </AnimatedPressable>
        </View>

        <Caption color={Colors.textMuted}>
          {searchQuery.trim().length > 0
            ? `${visibleConversations.length} matched thread${visibleConversations.length === 1 ? '' : 's'}`
            : `${visibleConversations.length} conversation${visibleConversations.length === 1 ? '' : 's'}`}
          {' | '}
          {unreadCount} unread
        </Caption>
      </View>

      <View style={{ flex: 1 }}>
        <RefreshIndicator scrollY={scrollY} isRefreshing={refreshing} topInset={20} />

        <AnimatedFlashList
          data={visibleConversations}
          keyExtractor={(c: any) => c.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: Space.sm + 4 }} />}
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
              title={searchQuery || segment !== 'direct' ? 'No matching conversations' : 'No conversations yet'}
              subtitle={searchQuery || segment !== 'direct'
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
  container: { flex: 1, backgroundColor: Colors.background },

  header: {
    paddingHorizontal: Space.md + 2,
    paddingTop: Space.sm + 2,
    paddingBottom: Space.md + 2,
    backgroundColor: Colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  hugeTitle: {
    fontSize: Type.title.size,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    letterSpacing: Type.title.letterSpacing,
    lineHeight: Type.title.lineHeight,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Space.sm + 2,
    marginBottom: Space.md - 2,
  },
  headerTitleWrap: {
    flex: 1,
    flexShrink: 1,
    paddingRight: Space.sm,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    flexShrink: 0,
  },
  addGroupBtn: {
    borderRadius: Radius.full,
    minHeight: 38,
    paddingHorizontal: Space.sm + 6,
    borderWidth: 1,
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  addGroupIconWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'transparent',
  },
  addGroupBtnText: {
    color: Colors.textPrimary,
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: 0.2,
  },
  policiesBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchWrap: {
    height: 46,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    backgroundColor: Colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.sm + 4,
    gap: Space.sm + 2,
    marginBottom: Space.sm + 4,
  },
  searchInput: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
    paddingVertical: 0,
  },
  clearSearchBtn: {
    width: 24,
    height: 24,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },
  segmentStrip: {
    marginTop: 2,
    marginBottom: Space.sm,
  },
  segmentChip: {
    height: 34,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.sm + 6,
  },
  segmentChipActive: {
    borderColor: Colors.brand,
    backgroundColor: Colors.brand,
  },
  segmentChipText: {
    color: Colors.textSecondary,
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: 0.2,
  },
  segmentChipTextActive: {
    color: Colors.background,
  },
  quickRail: {
    flexDirection: 'row',
    gap: Space.sm,
    marginBottom: Space.sm + 2,
  },
  quickChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    height: 30,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  quickChipActive: {
    borderColor: Colors.brand,
    backgroundColor: Colors.brand,
  },
  quickChipText: {
    color: Colors.textSecondary,
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
  },
  quickChipTextActive: {
    color: Colors.background,
  },
  listContent: {
    paddingHorizontal: Space.md + 4,
    paddingBottom: Space.xxl + 24,
    flexGrow: 1,
  },

  messageCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl + 6,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Space.md,
    flexDirection: 'row',
    gap: Space.sm + 6,
    alignItems: 'flex-start',
  },
  avatarWrap: { position: 'relative' },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
  },
  avatarContainer: {
    width: 52,
    height: 52,
    borderRadius: Radius.full,
  },
  groupAvatar: {
    width: 52,
    height: 52,
    borderRadius: Radius.full,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  onlineDot: {
    position: 'absolute',
    bottom: 1,
    right: 1,
    width: 14,
    height: 14,
    borderRadius: Radius.full,
    backgroundColor: Colors.success,
    borderWidth: 3,
    borderColor: Colors.surface,
  },
  messageBody: { flex: 1 },
  messageTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
    alignItems: 'center',
  },
  unreadBadge: {
    borderRadius: Radius.sm,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
    backgroundColor: Colors.brand,
    alignSelf: 'flex-start',
    marginBottom: Space.xs + 4,
  },
  unreadBadgeText: {
    color: Colors.background,
    fontSize: 10,
    fontFamily: Typography.family.bold,
    letterSpacing: 0.7,
  },
  groupMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    marginBottom: Space.xs + 2,
  },
  snippet: {
    color: Colors.textSecondary,
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    lineHeight: Type.body.lineHeight,
    marginBottom: Space.sm + 2,
  },
  searchHitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    marginBottom: Space.sm,
  },

  itemPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Space.sm,
    gap: Space.sm + 2,
  },
  itemThumb: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
  },
  itemThumbContainer: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
  },
  itemName: {
    flex: 1,
  },

  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.brand,
    marginTop: 6,
  },

  // Swipe actions
  swipeDelete: {
    backgroundColor: Colors.danger,
    justifyContent: 'center',
    alignItems: 'center',
    width: 90,
    borderRadius: Radius.xl + 2,
    marginLeft: Space.sm,
    gap: 4,
  },
  swipeArchive: {
    backgroundColor: Colors.brand,
    justifyContent: 'center',
    alignItems: 'center',
    width: 90,
    borderRadius: Radius.xl + 2,
    marginRight: Space.sm,
    gap: 4,
  },
  swipeActionText: {
    color: Colors.textInverse,
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
  },
});
