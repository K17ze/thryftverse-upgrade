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

import { Colors } from '../constants/colors';

import { Space, Radius, Type, TypeStyles, Elevation } from '../theme/designTokens';

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



export default function NewMessageScreen({ navigation, route }: Props) {

  const { show } = useToast();

  const haptic = useHaptic();



  const conversations = useStore((state) => state.conversations);

    const preselectedUserId = route.params?.preselectedUserId;

  const preselectedDisplayName = route.params?.preselectedDisplayName;

  const currentUser = useStore((state) => state.currentUser);

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
        <Caption color={Colors.textMuted}>
          {item.conversationId ? 'Existing conversation' : 'New message'}
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
    paddingHorizontal: Space.md,
    marginHorizontal: -Space.md,
    borderRadius: Radius.lg,
  },

  avatarRing: {

    width: 50,

    height: 50,

    borderRadius: Radius.full,

    borderWidth: 2,

    borderColor: Colors.border,

    padding: 2,

    justifyContent: 'center',

    alignItems: 'center',

    overflow: 'hidden',

  },

  avatarImage: {

    width: 42,

    height: 42,

    borderRadius: Radius.full,

  },

  avatarText: {

    fontSize: 15,

    fontFamily: TypeStyles.title.fontFamily,

    color: Colors.textPrimary,

  },
  contactAvatar: {
    width: 52,
    height: 52,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    backgroundColor: Colors.surfaceAlt,
  },
  contactAvatarImage: {
    width: 52,
    height: 52,
    borderRadius: Radius.full,
  },
  contactAvatarText: {
    fontSize: 16,
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

    marginLeft: 64,

  },

});

