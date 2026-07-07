import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useBackendData } from '../context/BackendDataContext';
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
      });
    }
    return items;
  }, [conversations, currentUser?.id, profileMediaOverrides, listings]);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return recentContacts;
    const q = searchQuery.trim().toLowerCase();
    return recentContacts.filter((c) => c.name.toLowerCase().includes(q));
  }, [recentContacts, searchQuery]);

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

  const handlePress = (contact: ContactItem) => {
    haptic.light();
    if (contact.conversationId) {
      navigation.navigate('Chat', { conversationId: contact.conversationId });
    }
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
        ) : (
          <Caption color={Colors.textMuted}>
            {item.conversationId ? 'Existing conversation' : 'New message'}
          </Caption>
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
          placeholder="Search contacts"
          value={searchQuery}
          onChangeText={setSearchQuery}
          containerStyle={styles.searchBar}
          inputProps={{ autoCapitalize: 'none', autoCorrect: false, accessibilityLabel: 'Search contacts' }}
        />
      </View>

      {!isSearching && (
        <View style={styles.quickActions}>
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
              <View style={[styles.quickActionIcon, { backgroundColor: Colors.brand + '14' }]}>
                <Ionicons name="mail-unread-outline" size={20} color={Colors.brand} />
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

          <AnimatedPressable
            style={styles.quickActionRow}
            onPress={() => navigation.navigate('Browse', { categoryId: 'all', title: 'Browse' })}
            activeOpacity={0.85}
            scaleValue={0.98}
            hapticFeedback="light"
            accessibilityLabel="Start from a listing"
            accessibilityHint="Browse marketplace to find a seller to message"
            accessibilityRole="button"
          >
            <View style={[styles.quickActionIcon, { backgroundColor: Colors.surfaceAlt }]}>
              <Ionicons name="pricetag-outline" size={20} color={Colors.textSecondary} />
            </View>
            <View style={styles.quickActionBody}>
              <BodyEmphasis numberOfLines={1}>Start from a listing</BodyEmphasis>
              <Caption color={Colors.textMuted} numberOfLines={1}>Browse marketplace to find a seller</Caption>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
          </AnimatedPressable>

          <AnimatedPressable
            style={styles.quickActionRow}
            onPress={() => navigation.navigate('ChatSettings')}
            activeOpacity={0.85}
            scaleValue={0.98}
            hapticFeedback="light"
            accessibilityLabel="Message settings"
            accessibilityRole="button"
          >
            <View style={[styles.quickActionIcon, { backgroundColor: Colors.surfaceAlt }]}>
              <Ionicons name="settings-outline" size={20} color={Colors.textSecondary} />
            </View>
            <View style={styles.quickActionBody}>
              <BodyEmphasis numberOfLines={1}>Message settings</BodyEmphasis>
              <Caption color={Colors.textMuted} numberOfLines={1}>Privacy, automation, quick replies</Caption>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
          </AnimatedPressable>
        </View>
      )}

      {hasContacts ? (
        <View style={{ flex: 1 }}>
          {!isSearching && (
            <View style={styles.sectionLabelWrap}>
              <Meta color={Colors.textMuted}>RECENT CONTACTS</Meta>
            </View>
          )}
          {isSearching && filtered.length === 0 ? (
            <EmptyState
              icon="search-outline"
              title="No local contacts found"
              subtitle="No contacts match your search."
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
            subtitle="Start browsing or messaging sellers to build your contact list."
            ctaLabel="Browse listings"
            onCtaPress={() => navigation.navigate('Browse', { categoryId: 'all', title: 'Browse' })}
          />
        ) : (
          <EmptyState
            icon="search-outline"
            title="No local contacts found"
            subtitle="No contacts match your search."
            ctaLabel="Browse listings"
            onCtaPress={() => navigation.navigate('Browse', { categoryId: 'all', title: 'Browse' })}
          />
        )
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
