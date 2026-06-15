import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { StackScreenProps } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useAppTheme } from '../theme/ThemeContext';
import { Colors } from '../constants/colors';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { useHaptic } from '../hooks/useHaptic';
import { Caption, BodyEmphasis } from '../components/ui/Text';

type Props = StackScreenProps<RootStackParamList, 'GroupMembers'>;

export default function GroupMembersScreen({ navigation, route }: Props) {
  const { conversationId } = route.params;
  const { isDark } = useAppTheme();
  const haptic = useHaptic();

  const conversations = useStore((state) => state.conversations);
  const currentUser = useStore((state) => state.currentUser);

  const conversation = useMemo(
    () => conversations.find((c) => c.id === conversationId),
    [conversations, conversationId]
  );

  const members = useMemo(() => {
    const ids = conversation?.participantIds ?? [];
    return ids.map((id) => ({
      id,
      name: id === currentUser?.id ? 'You' : 'Member',
      isMe: id === currentUser?.id,
    }));
  }, [conversation, currentUser?.id]);

  if (!conversation || conversation.type !== 'group') {
    return (
      <FlagshipScreen header={<FlagshipHeader title="Members" onBack={() => navigation.goBack()} />} scrollEnabled={false}>
        <View style={styles.center}>
          <Caption color={Colors.textMuted}>Group not found</Caption>
        </View>
      </FlagshipScreen>
    );
  }

  return (
    <FlagshipScreen header={<FlagshipHeader title="Members" subtitle={`${members.length} total`} onBack={() => navigation.goBack()} />} scrollEnabled={false}>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {/* Add member — honest disabled state */}
        <AnimatedPressable
          onPress={() => {
            haptic.light();
            // Future: open member picker when backend supports it
          }}
          activeOpacity={0.7}
          scaleValue={0.98}
          hapticFeedback="light"
          style={styles.addMemberRow}
          accessibilityRole="button"
          accessibilityLabel="Add member"
          accessibilityHint="Member addition requires backend support"
        >
          <View style={[styles.addIcon, { backgroundColor: Colors.surfaceAlt }]}>
            <Ionicons name="add" size={20} color={Colors.textMuted} />
          </View>
          <BodyEmphasis style={{ color: Colors.textMuted }}>Add members</BodyEmphasis>
          <Caption color={Colors.textMuted} style={styles.comingSoonPill}>Not available</Caption>
        </AnimatedPressable>

        {/* Member list */}
        <View style={styles.listCard}>
          {members.map((member, index) => (
            <View key={member.id}>
              <View style={styles.memberRow}>
                <View style={[styles.memberAvatar, { backgroundColor: Colors.surfaceAlt }]}>
                  <Text style={styles.memberAvatarText}>
                    {member.isMe ? 'You' : 'M'}
                  </Text>
                </View>
                <View style={styles.memberText}>
                  <BodyEmphasis>{member.name}</BodyEmphasis>
                  {member.isMe && (
                    <Caption color={Colors.textMuted}>Group creator</Caption>
                  )}
                </View>
                {/* Remove — honest disabled state */}
                {!member.isMe && (
                  <AnimatedPressable
                    onPress={() => {
                      haptic.light();
                      // Future: remove member when backend supports it
                    }}
                    activeOpacity={0.7}
                    scaleValue={0.92}
                    hapticFeedback="light"
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${member.name}`}
                    accessibilityHint="Member removal requires backend support"
                  >
                    <Ionicons name="remove-circle-outline" size={22} color={Colors.textMuted} />
                  </AnimatedPressable>
                )}
              </View>
              {index < members.length - 1 && (
                <View style={styles.divider} />
              )}
            </View>
          ))}
        </View>
      </ScrollView>
    </FlagshipScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.xxl,
    gap: Space.md,
  },
  addMemberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: 12,
  },
  addIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  comingSoonPill: {
    marginLeft: 'auto',
    backgroundColor: Colors.surfaceAlt,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.sm,
    overflow: 'hidden',
    fontSize: 11,
  },
  listCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    paddingVertical: 12,
    gap: Space.sm,
  },
  memberAvatar: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  memberAvatarText: {
    fontSize: 13,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
  },
  memberText: {
    flex: 1,
    justifyContent: 'center',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginLeft: Space.md + 40 + Space.sm,
  },
});
