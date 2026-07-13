import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { Colors } from '../constants/colors';
import { Space, Radius, Type , Typography  } from '../theme/designTokens';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { FlagshipEmptyGraphic, FlagshipScreen, FlagshipHeader } from '../components/flagship';

type Props = StackScreenProps<RootStackParamList, 'BlockedUsers'>;

export default function BlockedUsersScreen({ navigation }: Props) {
  const { show } = useToast();
  const blockedIds = useStore((s) => s.blockedUsers);
  const toggleBlocked = useStore((s) => s.toggleBlockedUser);

  const handleUnblock = (userId: string) => {
    toggleBlocked(userId);
    show('User unblocked', 'success');
  };

  return (
    <FlagshipScreen header={<FlagshipHeader title="Blocked Users" subtitle="Accounts you have restricted" onBack={() => navigation.goBack()} />}>
      {blockedIds.length === 0 ? (
        <View style={{ alignItems: 'center', paddingVertical: Space.xl * 2 }}>
          <FlagshipEmptyGraphic variant="box" size={120} />
          <Text style={{ fontSize: Type.body.size, fontFamily: Typography.family.semibold, color: Colors.textPrimary, marginTop: Space.lg }}>No blocked accounts</Text>
          <Text style={{ fontSize: Type.caption.size, fontFamily: Typography.family.regular, color: Colors.textSecondary, textAlign: 'center', marginTop: Space.xs, paddingHorizontal: Space.lg }}>When you block someone, they will appear here. You can unblock them at any time.</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {blockedIds.map((userId, index) => (
            <View key={userId}>
              <View style={styles.userRow}>
                <View style={[styles.avatarFallback, { backgroundColor: Colors.surfaceAlt }]}>
                  <Ionicons name="person-outline" size={16} color={Colors.textMuted} />
                </View>
                <View style={styles.userText}>
                  <Text style={styles.userName}>Blocked user</Text>
                  <Text style={styles.userId}>ID: {userId}</Text>
                </View>
                <AnimatedPressable
                  onPress={() => handleUnblock(userId)}
                  scaleValue={0.92}
                  hapticFeedback="light"
                >
                  <View style={styles.unblockBtn}>
                    <Text style={styles.unblockText}>Unblock</Text>
                  </View>
                </AnimatedPressable>
              </View>
              {index < blockedIds.length - 1 && (
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
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Space.md - 2,
    paddingHorizontal: Space.md,
    minHeight: 56,
    gap: Space.sm + 4,
  },
  userText: {
    flex: 1,
  },
  userName: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
    color: Colors.textPrimary,
    letterSpacing: Type.body.letterSpacing,
  },
  userId: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    marginTop: 2,
    letterSpacing: Type.caption.letterSpacing,
  },
  unblockBtn: {
    paddingHorizontal: Space.sm + 4,
    paddingVertical: Space.xs + 2,
    borderRadius: Radius.md,
    backgroundColor: Colors.danger + '15',
  },
  unblockText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    color: Colors.danger,
    letterSpacing: Type.caption.letterSpacing,
  },
  list: {
    marginHorizontal: Space.md,
  },
  avatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginLeft: 40 + Space.sm + 4 + Space.md,
  },
});