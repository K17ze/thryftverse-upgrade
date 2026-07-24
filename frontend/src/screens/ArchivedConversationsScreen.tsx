import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { Colors } from '../constants/colors';
import { Space, Type, Typography } from '../theme/designTokens';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { ConversationManagementRow } from '../components/chat/ConversationManagementRow';

type NavT = StackNavigationProp<RootStackParamList>;

export default function ArchivedConversationsScreen() {
  const navigation = useNavigation<NavT>();
  const { show } = useToast();
  const conversations = useStore((s) => s.conversations);
  const archivedIds = useStore((s) => s.archivedConversationIds);
  const toggleArchived = useStore((s) => s.toggleArchivedConversation);
  const deleteConversation = useStore((s) => s.deleteConversation);
  const currentUser = useStore((s) => s.currentUser);

  const archivedConversations = useMemo(() => {
    return conversations.filter((c) => archivedIds.includes(c.id));
  }, [conversations, archivedIds]);

  const handleRestore = (id: string) => {
    toggleArchived(id);
    show('Conversation restored to inbox', 'success');
  };

  const handleDelete = (id: string, title: string) => {
    Alert.alert(
      'Delete conversation?',
      `"${title}" will be permanently removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteConversation(id);
            show('Conversation deleted', 'info');
          },
        },
      ]
    );
  };

  const handleClearAll = () => {
    if (archivedConversations.length === 0) return;
    Alert.alert(
      'Clear all archived?',
      'All archived conversations will be permanently deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear all',
          style: 'destructive',
          onPress: () => {
            archivedConversations.forEach((c) => deleteConversation(c.id));
            show('Archive cleared', 'info');
          },
        },
      ]
    );
  };

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title="Archived conversations"
          subtitle="Restored conversations return to your inbox"
          onBack={() => navigation.goBack()}
          rightAction={
            archivedConversations.length > 0 ? (
              <AnimatedPressable
                onPress={handleClearAll}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                hapticFeedback="medium"
                accessibilityLabel="Clear all archived conversations"
                accessibilityRole="button"
              >
                <Text style={styles.clearAllBtn}>Clear all</Text>
              </AnimatedPressable>
            ) : undefined
          }
        />
      }
    >
      {archivedConversations.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="archive-outline" size={25} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>
            No archived conversations
          </Text>
          <Text style={styles.emptyBody}>
            Conversations you archive stay out of your inbox without being deleted.
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {archivedConversations.map((convo, index) => {
            return (
              <ConversationManagementRow
                key={convo.id}
                conversation={convo}
                currentUserId={currentUser?.id}
                onOpen={() => navigation.navigate('Chat', { conversationId: convo.id })}
                actionIcon="arrow-undo-outline"
                actionLabel="Restore"
                onAction={() => handleRestore(convo.id)}
                secondaryActionIcon="trash-outline"
                secondaryActionLabel="Delete"
                onSecondaryAction={() =>
                  handleDelete(
                    convo.id,
                    convo.type === 'group'
                      ? convo.title || 'Group conversation'
                      : convo.participantProfiles?.find(
                          (profile) => profile.id !== currentUser?.id && profile.id !== 'me'
                        )?.displayName ||
                        convo.participantProfiles?.find(
                          (profile) => profile.id !== currentUser?.id && profile.id !== 'me'
                        )?.username ||
                        'Conversation'
                  )
                }
                secondaryDestructive
                isLast={index === archivedConversations.length - 1}
              />
            );
          })}
        </View>
      )}
    </FlagshipScreen>
  );
}

const styles = StyleSheet.create({
  list: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  empty: {
    alignItems: 'center',
    paddingHorizontal: Space.xl,
    paddingTop: 72,
  },
  emptyTitle: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
    marginTop: Space.md,
  },
  emptyBody: {
    maxWidth: 300,
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: Space.xs,
  },
  clearAllBtn: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    color: Colors.danger,
    letterSpacing: Type.caption.letterSpacing,
  },
});
