import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
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
import { Caption, BodyEmphasis, Meta } from '../components/ui/Text';

type Props = StackScreenProps<RootStackParamList, 'GroupMembers'>;

type MemberRole = 'owner' | 'admin' | 'member';

export default function GroupMembersScreen({ navigation, route }: Props) {
  const { conversationId } = route.params;
  const { isDark } = useAppTheme();
  const haptic = useHaptic();

  const conversations = useStore((state) => state.conversations);
  const currentUser = useStore((state) => state.currentUser);
  const participantNameLookup = useStore((state) => (state as any).participantNameLookup as Map<string, string> | undefined);

  const [searchQuery, setSearchQuery] = useState('');

  const conversation = useMemo(
    () => conversations.find((c) => c.id === conversationId),
    [conversations, conversationId]
  );

  // Determine roles: creator is owner, others are members (admins not yet supported by backend)
  const members = useMemo(() => {
    const ids = conversation?.participantIds ?? [];
    const creatorId = (conversation as any)?.creatorId ?? ids[0];
    return ids.map((id) => {
      const name = id === currentUser?.id
        ? 'You'
        : participantNameLookup?.get(id) ?? `User ${id.slice(-6)}`;
      const role: MemberRole = id === creatorId ? 'owner' : 'member';
      return {
        id,
        name,
        isMe: id === currentUser?.id,
        role,
      };
    });
  }, [conversation, currentUser?.id, participantNameLookup]);

  const filteredMembers = useMemo(() => {
    if (!searchQuery.trim()) return members;
    const q = searchQuery.toLowerCase();
    return members.filter((m) => m.name.toLowerCase().includes(q));
  }, [members, searchQuery]);

  if (!conversation || conversation.type !== 'group') {
    return (
      <FlagshipScreen header={<FlagshipHeader title="Members" onBack={() => navigation.goBack()} />} scrollEnabled={false}>
        <View style={styles.center}>
          <Caption color={Colors.textMuted}>Group not found</Caption>
        </View>
      </FlagshipScreen>
    );
  }

  const roleBadge = (role: MemberRole) => {
    const colors = {
      owner: { bg: `${Colors.brand}15`, text: Colors.brand },
      admin: { bg: `${Colors.textPrimary}15`, text: Colors.textPrimary },
      member: { bg: Colors.surfaceAlt, text: Colors.textMuted },
    };
    const labels = { owner: 'Owner', admin: 'Admin', member: 'Member' };
    return (
      <View style={[styles.roleBadge, { backgroundColor: colors[role].bg }]}>
        <Caption style={[styles.roleBadgeText, { color: colors[role].text }]}>{labels[role]}</Caption>
      </View>
    );
  };

  return (
    <FlagshipScreen header={<FlagshipHeader title="Members" subtitle={`${members.length} total`} onBack={() => navigation.goBack()} />} scrollEnabled={false}>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {/* Search */}
        <View style={styles.searchRow}>
          <Ionicons name="search-outline" size={18} color={Colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search members..."
            placeholderTextColor={Colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel="Search members"
          />
          {searchQuery.length > 0 && (
            <AnimatedPressable
              onPress={() => setSearchQuery('')}
              activeOpacity={0.7}
              scaleValue={0.9}
              hapticFeedback="light"
            >
              <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
            </AnimatedPressable>
          )}
        </View>

        {/* Member list */}
        {filteredMembers.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Ionicons name="people-outline" size={32} color={Colors.textMuted} />
            <Caption color={Colors.textMuted} style={styles.emptyText}>No members match your search.</Caption>
          </View>
        ) : (
          <View style={styles.listCard}>
            {filteredMembers.map((member, index) => (
              <View key={member.id}>
                <AnimatedPressable
                  onPress={() => navigation.navigate('UserProfile', { userId: member.id })}
                  activeOpacity={0.85}
                  scaleValue={0.98}
                  hapticFeedback="light"
                  accessibilityRole="button"
                  accessibilityLabel={`View ${member.name} profile`}
                  style={styles.memberRow}
                >
                  <View style={[styles.memberAvatar, { backgroundColor: Colors.surfaceAlt }]}>
                    <Text style={styles.memberAvatarText}>
                      {member.name.slice(0, 2).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.memberText}>
                    <View style={styles.nameRow}>
                      <BodyEmphasis>{member.name}</BodyEmphasis>
                      {roleBadge(member.role)}
                    </View>
                    {member.role === 'owner' && (
                      <Caption color={Colors.textMuted}>{member.isMe ? 'You · Group creator' : 'Group creator'}</Caption>
                    )}
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
                </AnimatedPressable>
                {index < filteredMembers.length - 1 && (
                  <View style={styles.divider} />
                )}
              </View>
            ))}
          </View>
        )}
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
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.sm + 4,
    paddingVertical: Space.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    marginBottom: Space.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    color: Colors.textPrimary,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  roleBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  roleBadgeText: {
    fontSize: 10,
    fontFamily: Typography.family.semibold,
  },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Space.xl,
    gap: Space.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  emptyText: {
    textAlign: 'center',
  },
});