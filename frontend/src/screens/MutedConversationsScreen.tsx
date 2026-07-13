import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useAppTheme } from '../theme/ThemeContext';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { FlagshipScreen, FlagshipHeader, FlagshipEmptyGraphic } from '../components/flagship';
import type { Conversation } from '../data/mockData';

type NavT = StackNavigationProp<RootStackParamList>;

export default function MutedConversationsScreen() {
  const navigation = useNavigation<NavT>();
  const { colors, isDark } = useAppTheme();
  const conversations = useStore((s) => s.conversations);
  const mutedIds = useStore((s) => s.mutedConversationIds);
  const toggleMuted = useStore((s) => s.toggleMutedConversation);
  const currentUser = useStore((s) => s.currentUser);

  const mutedConversations = useMemo(() => {
    return conversations.filter((c) => mutedIds.includes(c.id));
  }, [conversations, mutedIds]);

  const getDisplayTitle = (convo: Conversation): string => {
    if (convo.type === 'group') return convo.title ?? 'Group chat';
    const counterpartyId = convo.participantIds?.find(
      (id) => id !== 'me' && id !== currentUser?.id
    );
    return counterpartyId ? 'Thryft user' : 'Thryft user';
  };

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
        <View style={{ alignItems: 'center', paddingVertical: Space.xl * 2 }}>
          <FlagshipEmptyGraphic variant="box" size={120} />
          <Text style={{ fontSize: Type.body.size, fontFamily: Typography.family.semibold, color: colors.textPrimary, marginTop: Space.lg }}>
            No muted conversations
          </Text>
          <Text style={{ fontSize: Type.caption.size, fontFamily: Typography.family.regular, color: colors.textSecondary, textAlign: 'center', marginTop: Space.xs, paddingHorizontal: Space.lg }}>
            Muted conversations will appear here. You can unmute them at any time.
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {mutedConversations.map((convo, index) => (
            <View key={convo.id}>
              <View style={styles.row}>
                <View style={[styles.avatarFallback, { backgroundColor: colors.surfaceAlt }]}>
                  <Ionicons name="person-outline" size={16} color={colors.textMuted} />
                </View>
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {getDisplayTitle(convo)}
                  </Text>
                  <Text style={styles.rowPreview} numberOfLines={1}>
                    {convo.lastMessage}
                  </Text>
                </View>
                <AnimatedPressable
                  onPress={() => handleUnmute(convo.id)}
                  scaleValue={0.92}
                  hapticFeedback="light"
                  accessibilityLabel={`Unmute ${getDisplayTitle(convo)}`}
                  accessibilityRole="button"
                >
                  <View style={[styles.unmuteBtn, { backgroundColor: `${colors.brand}15` }]}>
                    <Ionicons name="volume-high-outline" size={14} color={colors.brand} />
                    <Text style={styles.unmuteText}>Unmute</Text>
                  </View>
                </AnimatedPressable>
              </View>
              {index < mutedConversations.length - 1 && (
                <View style={styles.listDivider} />
              )}
            </View>
          ))}
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
    gap: Space.sm + 4,
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
    letterSpacing: Type.body.letterSpacing,
  },
  rowPreview: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    marginTop: 2,
    letterSpacing: Type.caption.letterSpacing,
  },
  unmuteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Space.sm + 4,
    paddingVertical: Space.xs + 2,
    borderRadius: Radius.md,
  },
  unmuteText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.caption.letterSpacing,
  },
  listDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 40 + Space.sm + 4 + Space.md,
  },
});
