import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, Type, Typography } from '../theme/designTokens';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { ConversationManagementRow } from '../components/chat/ConversationManagementRow';

type NavT = StackNavigationProp<RootStackParamList>;

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
        <View style={styles.empty}>
          <Ionicons name="notifications-off-outline" size={25} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>
            No muted conversations
          </Text>
          <Text style={styles.emptyBody}>
            Chats you mute will appear here with their notification state.
          </Text>
        </View>
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
    empty: {
      alignItems: 'center',
      paddingHorizontal: Space.xl,
      paddingTop: 72,
    },
    emptyTitle: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
      marginTop: Space.md,
    },
    emptyBody: {
      maxWidth: 300,
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 18,
      marginTop: Space.xs,
    },
  });
}
