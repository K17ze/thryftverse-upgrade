import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useBackendData } from '../context/BackendDataContext';
import { searchUsers, UserSearchResult } from '../services/profileApi';
import { createDmConversationOnApi } from '../services/chatApi';
import { getAvailableAgents, deployAgent, type ChatAgent } from '../services/chatAgentsApi';
import { useAppTheme } from '../theme/ThemeContext';
import { Space, Radius, Type, TypeStyles, Typography, Control } from '../theme/designTokens';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { useHaptic } from '../hooks/useHaptic';
import { CachedImage } from '../components/CachedImage';
import { AppSearchBar } from '../components/ui/AppSearchBar';
import { Caption, BodyEmphasis, Meta } from '../components/ui/Text';
import { EmptyState } from '../components/EmptyState';
import { ChatAgentPicker } from '../components/chat/ChatAgentPicker';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';

type Props = NativeStackScreenProps<RootStackParamList, 'NewMessage'>;

interface ContactItem {
  userId: string;
  name: string;
  avatar?: string;
  conversationId?: string;
  listingTitle?: string;
  listingId?: string;
  isExisting?: boolean;
}

export default function NewMessageScreen({ navigation, route }: Props) {
  const { colors, isDark } = useAppTheme();

  const styles = useMemo(() => StyleSheet.create({
    searchWrap: {
      paddingHorizontal: Space.md,
      paddingTop: Space.sm,
      paddingBottom: Space.sm,
    },
    searchBar: {
      backgroundColor: colors.surfaceAlt,
      borderRadius: Radius.full,
      minHeight: Control.hit,
    },
    quickActions: {
      paddingHorizontal: Space.md,
      paddingBottom: Space.md,
      gap: Space.sm,
    },
    quickActionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm + 2,
      paddingVertical: Space.sm + 2,
      paddingHorizontal: Space.sm + 2,
      borderRadius: Radius.lg,
      backgroundColor: colors.surfaceAlt,
    },
    quickActionIcon: {
      width: Control.hit,
      height: Control.hit,
      borderRadius: Radius.full,
      justifyContent: 'center',
      alignItems: 'center',
    },
    quickActionBody: {
      flex: 1,
      gap: Space.xs / 4,
    },
    quickActionBadge: {
      minWidth: Space.sm + 4,
      height: Space.sm + 4,
      borderRadius: Radius.lg,
      backgroundColor: colors.brand,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: Space.xs + 2,
    },
    quickActionBadgeText: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.bold,
      color: colors.textInverse,
    },
    searchingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
    },
    sectionLabelWrap: {
      paddingHorizontal: Space.md,
      paddingBottom: Space.xs,
    },
    listContent: {
      paddingHorizontal: Space.md,
      paddingBottom: Space.xxl,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm + 6,
      paddingVertical: Space.md,
      paddingHorizontal: Space.md,
      marginHorizontal: -Space.md,
      borderRadius: Radius.lg,
    },
    contactAvatar: {
      width: Space.xl + Space.xl + 4,
      height: Space.xl + Space.xl + 4,
      borderRadius: Radius.full,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.surfaceAlt,
      overflow: 'hidden',
    },
    contactAvatarImage: {
      width: Space.xl + Space.xl + 4,
      height: Space.xl + Space.xl + 4,
      borderRadius: Radius.full,
    },
    contactAvatarText: {
      fontSize: Type.bodyEmphasis.size,
      fontFamily: TypeStyles.title.fontFamily,
      color: colors.textPrimary,
    },
    rowBody: {
      flex: 1,
      gap: Space.xs / 2,
    },
    separator: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginHorizontal: -Space.md,
    },
  }), [colors]);

  const { show } = useToast();
  const haptic = useHaptic();

  const conversations = useStore((state) => state.conversations);
  const upsertConversation = useStore((state) => state.upsertConversation);
  const preselectedUserId = route.params?.preselectedUserId;
  const preselectedDisplayName = route.params?.preselectedDisplayName;
  const currentUser = useStore((state) => state.currentUser);
  const profileMediaOverrides = useStore((state) => state.profileMediaOverrides);
  const messageRequests = useStore((state) => state.messageRequests);
  const { listings } = useBackendData();

  const [searchQuery, setSearchQuery] = useState('');
  const [remoteResults, setRemoteResults] = useState<UserSearchResult[]>([]);
  const [isSearchingRemote, setIsSearchingRemote] = useState(false);
  const [agentPickerVisible, setAgentPickerVisible] = useState(false);
  const availableAgents = useMemo(() => getAvailableAgents(), []);

  // Start a direct chat with an AI agent. Creates a local demo conversation
  // (AGENTS.md §11 — truthful: the agent is demo-mode, clearly labelled).
  const handleStartAgentChat = useCallback((agent: ChatAgent) => {
    haptic.light();
    const conversationId = `agent_dm_${agent.id}`;
    // Deploy the agent via the chatAgentsApi so ChatScreen picks it up
    // and generates suggestions/responses for this conversation.
    deployAgent(conversationId, agent.type);
    const existing = conversations.find((c) => c.id === conversationId);
    if (existing) {
      navigation.navigate('Chat', { conversationId, partnerUserId: agent.id });
      setAgentPickerVisible(false);
      return;
    }
    const now = new Date().toISOString();
    upsertConversation({
      id: conversationId,
      type: 'dm',
      title: agent.name,
      avatar: undefined,
      participantIds: [currentUser?.id ?? 'me', agent.id],
      participantProfiles: [
        { id: agent.id, username: agent.name, displayName: agent.name },
      ],
      botIds: [agent.id],
      lastMessage: `Chat with ${agent.name} — demo mode`,
      lastMessageTime: now,
      unread: false,
      messages: [{
        id: `agent_intro_${Date.now()}`,
        senderId: agent.id,
        text: `Hi! I'm ${agent.name}, your AI ${agent.type.replace('_', ' ')}. I'm running in demo mode — I can suggest replies and help with ${agent.capabilities.join(', ').toLowerCase()}. What can I help you with?`,
        timestamp: now,
        isRead: true,
        botId: agent.id,
        isDemo: true,
      } as any],
    });
    navigation.navigate('Chat', { conversationId, partnerUserId: agent.id });
    setAgentPickerVisible(false);
  }, [conversations, currentUser?.id, haptic, navigation, upsertConversation]);

  const recentContacts = useMemo<ContactItem[]>(() => {
    const seen = new Set<string>();
    const items: ContactItem[] = [];

    for (const convo of conversations) {
      if (convo.type === 'group') continue;
      const partnerId = convo.participantIds?.find(
        (id) => id !== 'me' && id !== currentUser?.id
      );
      if (!partnerId || seen.has(partnerId)) continue;
      seen.add(partnerId);
      const name = convo.title ?? 'Thryft user';
      const linkedListing = convo.itemId
        ? listings.find((l) => l.id === convo.itemId)
        : undefined;

      items.push({
        userId: partnerId,
        name,
        avatar:
          convo.avatar ?? profileMediaOverrides[partnerId]?.avatar ?? undefined,
        conversationId: convo.id,
        listingTitle: linkedListing?.title,
        listingId: linkedListing?.id,
        isExisting: true,
      });
    }
    return items;
  }, [conversations, currentUser?.id, profileMediaOverrides, listings]);

  // ── Remote user search via API ──
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (trimmed.length < 2) {
      setRemoteResults([]);
      setIsSearchingRemote(false);
      return;
    }

    setIsSearchingRemote(true);
    let cancelled = false;
    const timer = setTimeout(() => {
      searchUsers(trimmed, 20)
        .then((results) => {
          if (cancelled) return;
          const filtered = results.filter((r) => r.id !== currentUser?.id);
          setRemoteResults(filtered);
        })
        .catch(() => {
          if (cancelled) return;
          setRemoteResults([]);
        })
        .finally(() => {
          if (!cancelled) setIsSearchingRemote(false);
        });
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery, currentUser?.id]);

  // Merge recent contacts (filtered by query) with remote search results
  const filtered = useMemo(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) return recentContacts;

    const q = trimmed.toLowerCase();
    const localMatches = recentContacts.filter((c) =>
      c.name.toLowerCase().includes(q)
    );
    const localIds = new Set(localMatches.map((c) => c.userId));

    const remoteItems: ContactItem[] = remoteResults
      .filter((r) => !localIds.has(r.id))
      .map((r) => {
        const existing = recentContacts.find((c) => c.userId === r.id);
        return {
          userId: r.id,
          name: r.displayName ?? r.username,
          avatar: r.avatar ?? undefined,
          conversationId: existing?.conversationId,
          isExisting: !!existing,
        };
      });

    return [...localMatches, ...remoteItems];
  }, [recentContacts, searchQuery, remoteResults]);

  React.useEffect(() => {
    if (!preselectedUserId) return;
    const existing = recentContacts.find((c) => c.userId === preselectedUserId);
    if (existing?.conversationId) {
      navigation.navigate('Chat', { conversationId: existing.conversationId, partnerUserId: preselectedUserId });
      return;
    }
    if (preselectedDisplayName) {
      createDmConversationOnApi({ recipientUserId: preselectedUserId })
        .then((conversation) => {
          navigation.navigate('Chat', { conversationId: conversation.id, partnerUserId: preselectedUserId });
        })
        .catch(() => {
          show(`Could not start a conversation with ${preselectedDisplayName}. Try again.`, 'error');
        });
    }
  }, [preselectedUserId, preselectedDisplayName, recentContacts, navigation, show]);

  const handlePress = async (contact: ContactItem) => {
    haptic.light();
    if (contact.conversationId) {
      navigation.navigate('Chat', { conversationId: contact.conversationId });
      return;
    }
    try {
      const conversation = await createDmConversationOnApi({
        recipientUserId: contact.userId,
        itemId: contact.listingId,
      });
      navigation.navigate('Chat', { conversationId: conversation.id, partnerUserId: contact.userId });
    } catch {
      show('Could not start conversation. Try again.', 'error');
    }
  };

  const renderItem = ({ item }: { item: ContactItem }) => (
    <AnimatedPressable
      style={styles.row}
      onPress={() => handlePress(item)}
      activeOpacity={0.85}
      scaleValue={0.98}
      hapticFeedback="light"
      accessibilityLabel={item.isExisting ? `Open conversation with ${item.name}` : `${item.name} — no conversation yet`}
      accessibilityRole="button"
    >
      <View style={styles.contactAvatar}>
        {item.avatar ? (
          <CachedImage uri={item.avatar} style={styles.contactAvatarImage} contentFit="cover" />
        ) : (
          <Text style={styles.contactAvatarText}>
            {item.name.slice(0, 2).toUpperCase()}
          </Text>
        )}
      </View>
      <View style={styles.rowBody}>
        <BodyEmphasis numberOfLines={1}>{item.name}</BodyEmphasis>
        {item.listingTitle ? (
          <Caption color={colors.textMuted} numberOfLines={1}>
            {item.listingTitle}
          </Caption>
        ) : item.isExisting ? (
          <Caption color={colors.textMuted}>Existing conversation</Caption>
        ) : (
          <Caption color={colors.textMuted}>No conversation yet — message from a listing</Caption>
        )}
      </View>
      <Ionicons
        name={item.isExisting ? 'chevron-forward' : 'pricetag-outline'}
        size={18}
        color={colors.textMuted}
      />
    </AnimatedPressable>
  );

  const hasContacts = filtered.length > 0;
  const isSearching = searchQuery.trim().length > 0;

  return (
    <FlagshipScreen header={<FlagshipHeader title="New Message" onBack={() => navigation.goBack()} />} scrollEnabled={false}>
      <View style={styles.searchWrap}>
        <AppSearchBar
          placeholder="Search by name or username"
          value={searchQuery}
          onChangeText={setSearchQuery}
          containerStyle={styles.searchBar}
          inputProps={{ autoCapitalize: 'none', autoCorrect: false, accessibilityLabel: 'Search users by name or username' }}
        />
      </View>

      {!isSearching && (
        <View style={styles.quickActions}>
          {/* Start group chat */}
          <AnimatedPressable
            style={styles.quickActionRow}
            onPress={() => navigation.navigate('CreateGroupChat')}
            activeOpacity={0.85}
            scaleValue={0.98}
            hapticFeedback="light"
            accessibilityLabel="Start group chat"
            accessibilityHint="Create a new group conversation with multiple people"
            accessibilityRole="button"
          >
            <View style={[styles.quickActionIcon, { backgroundColor: colors.brand + '14' }]}>
              <Ionicons name="people-outline" size={20} color={colors.brand} />
            </View>
            <View style={styles.quickActionBody}>
              <BodyEmphasis numberOfLines={1}>Start group chat</BodyEmphasis>
              <Caption color={colors.textMuted} numberOfLines={1}>Create a group with multiple people</Caption>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </AnimatedPressable>

          {/* Chat with AI assistant — deploy a demo AI agent into a direct chat */}
          <AnimatedPressable
            style={styles.quickActionRow}
            onPress={() => {
              haptic.light();
              setAgentPickerVisible(true);
            }}
            activeOpacity={0.85}
            scaleValue={0.98}
            hapticFeedback="light"
            accessibilityLabel="Chat with AI assistant"
            accessibilityHint="Start a conversation with an AI shopping, styling, or negotiation assistant"
            accessibilityRole="button"
          >
            <View style={[styles.quickActionIcon, { backgroundColor: colors.brand + '14' }]}>
              <Ionicons name="sparkles-outline" size={20} color={colors.brand} />
            </View>
            <View style={styles.quickActionBody}>
              <BodyEmphasis numberOfLines={1}>Chat with AI assistant</BodyEmphasis>
              <Caption color={colors.textMuted} numberOfLines={1}>Shop Scout, Style Muse, Deal Maker & more</Caption>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </AnimatedPressable>

          {/* Message requests (only if there are any) */}
          {messageRequests.length > 0 && (
            <AnimatedPressable
              style={styles.quickActionRow}
              onPress={() => navigation.navigate('MessageRequests')}
              activeOpacity={0.85}
              scaleValue={0.98}
              hapticFeedback="light"
              accessibilityLabel={`${messageRequests.length} message requests`}
              accessibilityRole="button"
            >
              <View style={[styles.quickActionIcon, { backgroundColor: colors.surfaceAlt }]}>
                <Ionicons name="mail-unread-outline" size={20} color={colors.textSecondary} />
              </View>
              <View style={styles.quickActionBody}>
                <BodyEmphasis numberOfLines={1}>Message requests</BodyEmphasis>
                <Caption color={colors.textMuted} numberOfLines={1}>{messageRequests.length} pending</Caption>
              </View>
              <View style={styles.quickActionBadge}>
                <Text style={styles.quickActionBadgeText}>{messageRequests.length}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </AnimatedPressable>
          )}
        </View>
      )}

      {/* Search loading indicator */}
      {isSearching && isSearchingRemote && (
        <View style={styles.searchingRow}>
          <ActivityIndicator size="small" color={colors.brand} />
          <Caption color={colors.textMuted}>Searching users…</Caption>
        </View>
      )}

      {hasContacts ? (
        <View style={{ flex: 1 }}>
          {!isSearching && (
            <View style={styles.sectionLabelWrap}>
              <Meta color={colors.textMuted}>RECENT CONTACTS</Meta>
            </View>
          )}
          {isSearching && !isSearchingRemote && filtered.length === 0 ? (
            <EmptyState
              icon="search-outline"
              title="No users found"
              subtitle="Try a different name or username."
              ctaLabel="Browse listings"
              onCtaPress={() => navigation.navigate('Browse', { categoryId: 'all', title: 'Browse' })}
            />
          ) : (
            <FlashList
              data={filtered}
              keyExtractor={(c) => c.userId}
              renderItem={renderItem}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
            />
          )}
        </View>
      ) : (
        !isSearching ? (
          <EmptyState
            icon="people-outline"
            title="No recent contacts yet"
            subtitle="Start a group chat, or message a seller from one of their listings to build your contact list."
            ctaLabel="Start group chat"
            onCtaPress={() => navigation.navigate('CreateGroupChat')}
          />
        ) : !isSearchingRemote ? (
          <EmptyState
            icon="search-outline"
            title="No users found"
            subtitle="Try a different name or username."
            ctaLabel="Browse listings"
            onCtaPress={() => navigation.navigate('Browse', { categoryId: 'all', title: 'Browse' })}
          />
        ) : null
      )}

      {/* AI Agent Picker — choose an AI assistant to start a direct chat with */}
      <ChatAgentPicker
        visible={agentPickerVisible}
        onClose={() => setAgentPickerVisible(false)}
        onDeploy={handleStartAgentChat}
        deployedAgentIds={[]}
      />
    </FlagshipScreen>
  );
}
