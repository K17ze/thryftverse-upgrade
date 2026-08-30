import React, { useCallback, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space } from '../theme/designTokens';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { EmptyState } from '../components/EmptyState';
import { ConversationListSkeleton } from '../components/SkeletonLoader';
import { ConversationManagementRow } from '../components/chat/ConversationManagementRow';
import type { Conversation } from '../domain';
import { useToast } from '../context/ToastContext';

type NavT = NativeStackNavigationProp<RootStackParamList>;

export default function MutedConversationsScreen() {
  const navigation = useNavigation<NavT>();
  const { show } = useToast();
  const { colors } = useAppTheme();
  const conversations = useStore((s) => s.conversations);
  const conversationsLoaded = useStore((s) => s.conversationsLoaded);
  const mutedIds = useStore((s) => s.mutedConversationIds);
  const toggleMuted = useStore((s) => s.toggleMutedConversation);
  const currentUser = useStore((s) => s.currentUser);

  const mutedConversations = useMemo(() => {
    return conversations.filter((c) => mutedIds.includes(c.id));
  }, [conversations, mutedIds]);

  const styles = useMemo(() => createStyles(colors), [colors]);

  const handleUnmute = (id: string) => {
    toggleMuted(id).catch(() => {
      show('Could not unmute this conversation. Check your connection and try again.', 'error');
    });
  };

  const renderItem = useCallback(
    ({ item: convo, index }: { item: Conversation; index: number }) => (
      <ConversationManagementRow
        conversation={convo}
        currentUserId={currentUser?.id}
        onOpen={() => navigation.navigate('Chat', { conversationId: convo.id })}
        actionIcon="notifications-outline"
        actionLabel="Unmute"
        onAction={() => handleUnmute(convo.id)}
        isLast={index === mutedConversations.length - 1}
      />
    ),
    [navigation, currentUser, handleUnmute, mutedConversations]
  );

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title="Muted conversations"
          subtitle="Notifications are paused for these chats"
          onBack={() => navigation.goBack()}
        />
      }
    >
      {!conversationsLoaded ? (
        <View style={styles.skeletonWrap}>
          <ConversationListSkeleton count={5} />
        </View>
      ) : mutedConversations.length === 0 ? (
        <EmptyState
          icon="notifications-off-outline"
          title="No muted conversations"
          subtitle="You haven't muted any chats. Muted conversations will appear here."
        />
      ) : (
        <FlashList
          data={mutedConversations}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    skeletonWrap: {
      paddingTop: Space.sm,
    },
    listContent: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
  });
}
