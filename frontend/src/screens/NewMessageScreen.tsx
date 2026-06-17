import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useAppTheme } from '../theme/ThemeContext';
import { Colors } from '../constants/colors';
import { Space, Radius, Type, Typography, Elevation } from '../theme/designTokens';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { useHaptic } from '../hooks/useHaptic';
import { CachedImage } from '../components/CachedImage';
import { AppSearchBar } from '../components/ui/AppSearchBar';
import { Caption, BodyEmphasis } from '../components/ui/Text';
import { EmptyState } from '../components/EmptyState';

type Props = StackScreenProps<RootStackParamList, 'NewMessage'>;

interface ContactItem {
  userId: string;
  name: string;
  avatar?: string;
  conversationId?: string;
}

export default function NewMessageScreen({ navigation }: Props) {
  const { show } = useToast();
  const haptic = useHaptic();
  const { isDark } = useAppTheme();

  const conversations = useStore((state) => state.conversations);
  const currentUser = useStore((state) => state.currentUser);
  const upsertConversation = useStore((state) => state.upsertConversation);
  const profileMediaOverrides = useStore((state) => state.profileMediaOverrides);

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

      items.push({
        userId: partnerId,
        name,
        avatar:
          convo.avatar ?? profileMediaOverrides[partnerId]?.avatar ?? undefined,
        conversationId: convo.id,
      });
    }
    return items;
  }, [conversations, currentUser?.id, profileMediaOverrides]);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return recentContacts;
    const q = searchQuery.trim().toLowerCase();
    return recentContacts.filter((c) => c.name.toLowerCase().includes(q));
  }, [recentContacts, searchQuery]);

  const handlePress = (contact: ContactItem) => {
    haptic.light();
    if (contact.conversationId) {
      navigation.navigate('Chat', { conversationId: contact.conversationId });
      return;
    }
    // Create a new direct conversation
    const newConvoId = `dm_${currentUser?.id ?? 'me'}_${contact.userId}`;
    upsertConversation({
      id: newConvoId,
      type: 'dm',
      participantIds: ['me', contact.userId],
      lastMessage: '',
      lastMessageTime: new Date().toISOString(),
      unread: false,
      messages: [],
    });
    navigation.navigate('Chat', { conversationId: newConvoId, partnerUserId: contact.userId });
  };

  const renderItem = ({ item, index }: { item: ContactItem; index: number }) => (
    <AnimatedPressable
      style={styles.row}
      onPress={() => handlePress(item)}
      activeOpacity={0.85}
      scaleValue={0.98}
      hapticFeedback="light"
      accessibilityLabel={`Message ${item.name}`}
      accessibilityRole="button"
    >
      <View style={styles.avatar}>
        {item.avatar ? (
          <CachedImage uri={item.avatar} style={styles.avatarImage} contentFit="cover" />
        ) : (
          <Text style={styles.avatarText}>
            {item.name.slice(0, 2).toUpperCase()}
          </Text>
        )}
      </View>
      <View style={styles.rowBody}>
        <BodyEmphasis numberOfLines={1}>{item.name}</BodyEmphasis>
        <Caption color={Colors.textMuted}>
          {item.conversationId ? 'Existing conversation' : 'Start new conversation'}
        </Caption>
      </View>
      <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
    </AnimatedPressable>
  );

  return (
    <FlagshipScreen
      header={<FlagshipHeader title="New Message" onBack={() => navigation.goBack()} />}
      scrollEnabled={false}
    >
      <View style={styles.searchWrap}>
        <AppSearchBar
          placeholder="Search contacts"
          value={searchQuery}
          onChangeText={setSearchQuery}
          containerStyle={styles.searchBar}
          inputProps={{ autoCapitalize: 'none', autoCorrect: false }}
        />
      </View>

      {filtered.length === 0 ? (
        <EmptyState
          icon="people-outline"
          title={searchQuery.trim() ? 'No contacts found' : 'No recent contacts'}
          subtitle={
            searchQuery.trim()
              ? 'Try a different search term.'
              : 'Start browsing or messaging sellers to build your contact list.'
          }
          ctaLabel={searchQuery.trim() ? 'Clear search' : 'Browse listings'}
          onCtaPress={() =>
            searchQuery.trim() ? setSearchQuery('') : navigation.navigate('Browse', { categoryId: 'all', title: 'Browse' })
          }
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
  listContent: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.xxl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm + 6,
    paddingVertical: Space.md,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: 48,
    height: 48,
    borderRadius: Radius.full,
  },
  avatarText: {
    fontSize: 15,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginLeft: 64,
  },
});
