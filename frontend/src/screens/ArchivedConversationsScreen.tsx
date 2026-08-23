import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Type, Typography, Space } from '../theme/designTokens';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { EmptyState } from '../components/EmptyState';
import { ConversationListSkeleton } from '../components/SkeletonLoader';
import { ConversationManagementRow } from '../components/chat/ConversationManagementRow';
import { deleteConversationOnApi } from '../services/chatApi';

type NavT = NativeStackNavigationProp<RootStackParamList>;

export default function ArchivedConversationsScreen() {
  const navigation = useNavigation<NavT>();
  const { show } = useToast();
  const { colors } = useAppTheme();
  const conversations = useStore((s) => s.conversations);
  const conversationsLoaded = useStore((s) => s.conversationsLoaded);
  const archivedIds = useStore((s) => s.archivedConversationIds);
  const toggleArchived = useStore((s) => s.toggleArchivedConversation);
  const deleteConversation = useStore((s) => s.deleteConversation);
  const currentUser = useStore((s) => s.currentUser);

  const styles = useMemo(() => createStyles(colors), [colors]);

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
          onPress: async () => {
            try {
              await deleteConversationOnApi(id);
              deleteConversation(id);
              show('Conversation deleted', 'info');
            } catch {
              show('Could not delete this conversation. Check your connection and try again.', 'error');
            }
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
          onPress: async () => {
            let failedCount = 0;
            await Promise.all(
              archivedConversations.map(async (c) => {
                try {
                  await deleteConversationOnApi(c.id);
                  deleteConversation(c.id);
                } catch {
                  failedCount++;
                }
              })
            );
            if (failedCount > 0) {
              show(`${archivedConversations.length - failedCount} deleted · ${failedCount} failed`, 'error');
            } else {
              show('Archive cleared', 'info');
            }
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
      {!conversationsLoaded ? (
        <View style={styles.skeletonWrap}>
          <ConversationListSkeleton count={5} />
        </View>
      ) : archivedConversations.length === 0 ? (
        <EmptyState
          icon="archive-outline"
          title="No archived conversations"
          subtitle="Conversations you archive stay out of your inbox without being deleted."
          ctaLabel="Browse conversations"
          onCtaPress={() => navigation.goBack()}
        />
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

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    skeletonWrap: {
      paddingTop: Space.sm,
    },
    list: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    clearAllBtn: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.semibold,
      color: colors.danger,
      letterSpacing: Type.caption.letterSpacing,
    },
  });
}
