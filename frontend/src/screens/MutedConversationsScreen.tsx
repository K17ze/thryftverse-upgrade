import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { EmptyState } from '../components/EmptyState';
import { ConversationManagementRow } from '../components/chat/ConversationManagementRow';

type NavT = NativeStackNavigationProp<RootStackParamList>;

export default function MutedConversationsScreen() {
  const navigation = useNavigation<NavT>();
  const { colors } = useAppTheme();
  const conversations = useStore((s) => s.conversations);
  const mutedIds = useStore((s) => s.mutedConversationIds);
  const toggleMuted = useStore((s) => s.toggleMutedConversation);
  const currentUser = useStore((s) => s.currentUser);

  const mutedConversations = useMemo(() => {
    return conversations.filter((c) => mutedIds.includes(c.id));
  }, [conversations, mutedIds]);

  const styles = useMemo(() => createStyles(colors), [colors]);

  const handleUnmute = (id: string) => {
    toggleMuted(id);
  };

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
      {mutedConversations.length === 0 ? (
        <EmptyState
          icon="notifications-off-outline"
          title="No muted conversations"
          subtitle="You haven't muted any chats. Muted conversations will appear here."
        />
      ) : (
        <View style={styles.list}>
          {mutedConversations.map((convo, index) => (
            <ConversationManagementRow
              key={convo.id}
              conversation={convo}
              currentUserId={currentUser?.id}
              onOpen={() => navigation.navigate('Chat', { conversationId: convo.id })}
              actionIcon="notifications-outline"
              actionLabel="Unmute"
              onAction={() => handleUnmute(convo.id)}
              isLast={index === mutedConversations.length - 1}
            />
          ))}
        </View>
      )}
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    list: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
  });
}
