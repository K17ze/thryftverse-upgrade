import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useBackendData } from '../context/BackendDataContext';
import { searchUsers, UserSearchResult } from '../services/profileApi';
import { Colors } from '../constants/colors';
import { Space, Radius, Type, TypeStyles, Typography } from '../theme/designTokens';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { useHaptic } from '../hooks/useHaptic';
import { CachedImage } from '../components/CachedImage';
import { AppSearchBar } from '../components/ui/AppSearchBar';
import { Caption, BodyEmphasis, Meta } from '../components/ui/Text';
import { EmptyState } from '../components/EmptyState';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';

type Props = StackScreenProps<RootStackParamList, 'NewMessage'>;

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
  const { show } = useToast();
  const haptic = useHaptic();

  const conversations = useStore((state) => state.conversations);
  const preselectedUserId = route.params?.preselectedUserId;
  const preselectedDisplayName = route.params?.preselectedDisplayName;
  const currentUser = useStore((state) => state.currentUser);
  const profileMediaOverrides = useStore((state) => state.profileMediaOverrides);
  const messageRequests = useStore((state) => state.messageRequests);
  const { listings } = useBackendData();

  const [searchQuery, setSearchQuery] = useState('');
  const [remoteResults, setRemoteResults] = useState<UserSearchResult[]>([]);
  const [isSearchingRemote, setIsSearchingRemote] = useState(false);

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
      show(`You don't have a conversation with ${preselectedDisplayName} yet. Message them from one of their listings to start one.`, 'info');
    }
  }, [preselectedUserId, preselectedDisplayName, recentContacts, navigation, show]);

  const upsertConversation = useStore((state) => state.upsertConversation);

  const handlePress = (contact: ContactItem) => {
    haptic.light();
    if (contact.conversationId) {
      navigation.navigate('Chat', { conversationId: contact.conversationId });
      return;
    }
    // Create a local placeholder conversation so ChatScreen has a valid ID
    const sortedIds = [currentUser?.id ?? 'me', contact.userId].sort();
    const newConvoId = `dm_${sortedIds[0]}_${sortedIds[1]}`;
    upsertConversation({
      id: newConvoId,
      type: 'dm',
      title: contact.name,
      avatar: contact.avatar,
      participantIds: [currentUser?.id ?? 'me', contact.userId],
      lastMessage: '',
      lastMessageTime: new Date().toISOString(),
      unread: false,
      messages: [],
    });
    navigation.navigate('Chat', {
      conversationId: newConvoId,
      partnerUserId: contact.userId,
    });
  };

  const renderItem = ({ item }: { item: ContactItem }) => (
    <AnimatedPressable
      style={styles.row}
      onPress={() => handlePress(item)}
      activeOpacity={0.85}
      scaleValue={0.98}
      hapticFeedback="light"
      accessibilityLabel={`Message ${item.name}`}
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
          <Caption color={Colors.textMuted} numberOfLines={1}>
            {item.listingTitle}
          </Caption>
        ) : item.isExisting ? (
          <Caption color={Colors.textMuted}>Existing conversation</Caption>
        ) : (
          <Caption color={Colors.brand}>Tap to start chatting</Caption>
        )}
      </View>
      <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
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
            <View style={[styles.quickActionIcon, { backgroundColor: Colors.brand + '14' }]}>
              <Ionicons name="people-outline" size={20} color={Colors.brand} />
            </View>
            <View style={styles.quickActionBody}>
              <BodyEmphasis numberOfLines={1}>Start group chat</BodyEmphasis>
              <Caption color={Colors.textMuted} numberOfLines={1}>Create a group with multiple people</Caption>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
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
              <View style={[styles.quickActionIcon, { backgroundColor: Colors.surfaceAlt }]}>
                <Ionicons name="mail-unread-outline" size={20} color={Colors.textSecondary} />
              </View>
              <View style={styles.quickActionBody}>
                <BodyEmphasis numberOfLines={1}>Message requests</BodyEmphasis>
                <Caption color={Colors.textMuted} numberOfLines={1}>{messageRequests.length} pending</Caption>
              </View>
              <View style={styles.quickActionBadge}>
                <Text style={styles.quickActionBadgeText}>{messageRequests.length}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
            </AnimatedPressable>
          )}
        </View>
      )}

      {/* Search loading indicator */}
      {isSearching && isSearchingRemote && (
        <View style={styles.searchingRow}>
          <ActivityIndicator size="small" color={Colors.brand} />
          <Caption color={Colors.textMuted}>Searching users…</Caption>
        </View>
      )}

      {hasContacts ? (
        <View style={{ flex: 1 }}>
          {!isSearching && (
            <View style={styles.sectionLabelWrap}>
              <Meta color={Colors.textMuted}>RECENT CONTACTS</Meta>
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
            subtitle="Search for someone by name, or start a group chat to invite multiple people."
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
    </FlagshipScreen>
  );
}

const styles = StyleSheet.create({
  searchWrap: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.sm,
  },
  searchBar: {
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.full,
    minHeight: 44,
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
    backgroundColor: Colors.surfaceAlt,
  },
  quickActionIcon: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickActionBody: {
    flex: 1,
    gap: 1,
  },
  quickActionBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.brand,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  quickActionBadgeText: {
    fontSize: 11,
    fontFamily: Typography.family.bold,
    color: Colors.textInverse,
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
    width: 52,
    height: 52,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.surfaceAlt,
    overflow: 'hidden',
  },
  contactAvatarImage: {
    width: 52,
    height: 52,
    borderRadius: Radius.full,
  },
  contactAvatarText: {
    fontSize: 15,
    fontFamily: TypeStyles.title.fontFamily,
    color: Colors.textPrimary,
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginHorizontal: -Space.md,
  },
});
