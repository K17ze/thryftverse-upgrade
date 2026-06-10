import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { Colors } from '../constants/colors';
import { Space, Radius, Type , Typography  } from '../theme/designTokens';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { FlagshipEmptyGraphic } from '../components/flagship';
import { SettingsPage } from '../components/settings/SettingsPage';

type Props = StackScreenProps<RootStackParamList, 'BlockedUsers'>;

export default function BlockedUsersScreenV2({ navigation }: Props) {
  const { show } = useToast();
  const blockedIds = useStore((s) => s.blockedUsers);
  const toggleBlocked = useStore((s) => s.toggleBlockedUser);

  const handleUnblock = (userId: string) => {
    toggleBlocked(userId);
    show('User unblocked', 'success');
  };

  const deterministicInitials = useMemo(() => {
    return (id: string) => {
      const hash = id.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
      const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      return letters[hash % 26] + letters[(hash * 7) % 26];
    };
  }, []);

  return (
    <SettingsPage title="Blocked Users" onBack={() => navigation.goBack()}>
      {blockedIds.length === 0 ? (
        <View style={{ alignItems: 'center', paddingVertical: Space.xl * 2 }}>
          <FlagshipEmptyGraphic variant="box" size={120} />
          <Text style={{ fontSize: Type.body.size, fontFamily: Typography.family.semibold, color: Colors.textPrimary, marginTop: Space.lg }}>No blocked users</Text>
          <Text style={{ fontSize: Type.caption.size, fontFamily: Typography.family.regular, color: Colors.textSecondary, textAlign: 'center', marginTop: Space.xs, paddingHorizontal: Space.lg }}>When you block someone, they will appear here. You can unblock them at any time.</Text>
        </View>
      ) : (
        <Reanimated.View entering={FadeInDown.duration(300).delay(0)}>
          <View style={styles.card}>
            {blockedIds.map((userId, index) => (
              <View
                key={userId}
                style={[
                  styles.userRow,
                  index < blockedIds.length - 1 && styles.userRowBorder,
                ]}
              >
                <View style={styles.avatarCircle}>
                  <Text style={styles.avatarInitial}>{deterministicInitials(userId)}</Text>
                </View>
                <View style={styles.userText}>
                  <Text style={styles.userName}>User {userId.slice(-6)}</Text>
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
            ))}
          </View>
        </Reanimated.View>
      )}
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    marginHorizontal: Space.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Space.md - 2,
    paddingHorizontal: Space.md,
    minHeight: 56,
    gap: Space.sm + 4,
  },
  userRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    fontSize: 14,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
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
});
