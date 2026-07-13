import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { Colors } from '../constants/colors';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { FlagshipScreen, FlagshipHeader, FlagshipEmptyGraphic } from '../components/flagship';
import type { Conversation } from '../data/mockData';

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

  const getDisplayTitle = (convo: Conversation): string => {
    if (convo.type === 'group') return convo.title ?? 'Group chat';
    const counterpartyId = convo.participantIds?.find(
      (id) => id !== 'me' && id !== currentUser?.id
    );
    return counterpartyId ? 'Thryft user' : 'Thryft user';
  };

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
        <View style={{ alignItems: 'center', paddingVertical: Space.xl * 2 }}>
          <FlagshipEmptyGraphic variant="box" size={120} />
          <Text style={{ fontSize: Type.body.size, fontFamily: Typography.family.semibold, color: Colors.textPrimary, marginTop: Space.lg }}>
            No archived conversations
          </Text>
          <Text style={{ fontSize: Type.caption.size, fontFamily: Typography.family.regular, color: Colors.textSecondary, textAlign: 'center', marginTop: Space.xs, paddingHorizontal: Space.lg }}>
            Archived conversations will appear here. You can restore or delete them at any time.
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {archivedConversations.map((convo, index) => {
            const title = getDisplayTitle(convo);
            return (
              <View key={convo.id}>
                <View style={styles.row}>
                  <View style={[styles.avatarFallback, { backgroundColor: Colors.surfaceAlt }]}>
                    <Ionicons name="person-outline" size={16} color={Colors.textMuted} />
                  </View>
                  <View style={styles.rowText}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {title}
                    </Text>
                    <Text style={styles.rowPreview} numberOfLines={1}>
                      {convo.lastMessage}
                    </Text>
                  </View>
                  <AnimatedPressable
                    onPress={() => handleRestore(convo.id)}
                    scaleValue={0.92}
                    hapticFeedback="light"
                    accessibilityLabel={`Restore ${title}`}
                    accessibilityRole="button"
                  >
                    <View style={styles.restoreBtn}>
                      <Ionicons name="arrow-undo-outline" size={14} color={Colors.brand} />
                      <Text style={styles.restoreText}>Restore</Text>
                    </View>
                  </AnimatedPressable>
                  <AnimatedPressable
                    onPress={() => handleDelete(convo.id, title)}
                    scaleValue={0.92}
                    hapticFeedback="medium"
                    accessibilityLabel={`Delete ${title}`}
                    accessibilityRole="button"
                  >
                    <View style={styles.deleteBtn}>
                      <Ionicons name="trash-outline" size={14} color={Colors.danger} />
                    </View>
                  </AnimatedPressable>
                </View>
                {index < archivedConversations.length - 1 && (
                  <View style={styles.listDivider} />
                )}
              </View>
            );
          })}
        </View>
      )}
    </FlagshipScreen>
  );
}

const styles = StyleSheet.create({
  list: {
    marginHorizontal: Space.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Space.sm + 2,
    paddingHorizontal: Space.md,
    minHeight: 56,
    gap: Space.sm,
  },
  avatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
    letterSpacing: Type.body.letterSpacing,
  },
  rowPreview: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    marginTop: 2,
    letterSpacing: Type.caption.letterSpacing,
  },
  restoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs + 2,
    borderRadius: Radius.md,
    backgroundColor: `${Colors.brand}15`,
  },
  restoreText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    color: Colors.brand,
    letterSpacing: Type.caption.letterSpacing,
  },
  deleteBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: `${Colors.danger}10`,
  },
  clearAllBtn: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    color: Colors.danger,
    letterSpacing: Type.caption.letterSpacing,
  },
  listDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginLeft: 40 + Space.sm + 4 + Space.md,
  },
});
