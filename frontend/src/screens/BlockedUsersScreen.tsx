import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { ActiveTheme, Colors } from '../constants/colors';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { Space, Radius, Type } from '../theme/designTokens';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { Typography } from '../constants/typography';
import { EmptyState } from '../components/EmptyState';
import { MOCK_USERS } from '../data/mockData';

type Props = StackScreenProps<RootStackParamList, 'BlockedUsers'>;

export default function BlockedUsersScreen({ navigation }: Props) {
  const { show } = useToast();
  const blockedIds = useStore((s) => s.blockedUsers);
  const toggleBlocked = useStore((s) => s.toggleBlockedUser);

  const blockedUsers = useMemo(() => {
    return blockedIds
      .map((id) => MOCK_USERS.find((u) => u.id === id))
      .filter(Boolean);
  }, [blockedIds]);

  const handleUnblock = (userId: string, username: string) => {
    toggleBlocked(userId);
    show(`${username} unblocked`, 'success');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar
        barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'}
        backgroundColor={Colors.background}
      />

      <View style={styles.header}>
        <AnimatedPressable
          onPress={() => navigation.goBack()}
          style={styles.headerBack}
          scaleValue={0.92}
          hapticFeedback="light"
        >
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </AnimatedPressable>
        <Text style={styles.headerTitle}>Blocked Users</Text>
        <View style={styles.headerBack} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {blockedUsers.length === 0 ? (
          <EmptyState
            icon="shield-checkmark-outline"
            title="No blocked users"
            subtitle="When you block someone, they will appear here. You can unblock them at any time."
          />
        ) : (
          <Reanimated.View entering={FadeInDown.duration(300).delay(0)}>
            <View style={styles.rowGroup}>
              {blockedUsers.map((user, index) => (
                <View
                  key={user!.id}
                  style={[
                    styles.userRow,
                    index < blockedUsers.length - 1 && styles.userRowBorder,
                  ]}
                >
                  <View style={styles.avatar}>
                    {user!.avatar ? (
                      <AnimatedPressable
                        onPress={() =>
                          navigation.navigate('UserProfile', { userId: user!.id })
                        }
                        activeOpacity={0.85}
                        scaleValue={0.98}
                        hapticFeedback="light"
                      >
                        <View style={styles.avatarCircle}>
                          <Text style={styles.avatarInitial}>
                            {user!.username.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                      </AnimatedPressable>
                    ) : (
                      <View style={styles.avatarCircle}>
                        <Ionicons name="person" size={18} color={Colors.textMuted} />
                      </View>
                    )}
                  </View>
                  <View style={styles.userText}>
                    <Text style={styles.userName}>{user!.username}</Text>
                    <Text style={styles.userMeta}>{user!.location}</Text>
                  </View>
                  <AnimatedPressable
                    onPress={() => handleUnblock(user!.id, user!.username)}
                    activeOpacity={0.75}
                    scaleValue={0.96}
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

        <View style={{ height: Space.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 4,
  },
  headerBack: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    letterSpacing: Type.subtitle.letterSpacing,
    lineHeight: Type.subtitle.lineHeight,
  },
  scrollContent: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.xl,
  },
  rowGroup: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    marginBottom: Space.sm,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: Space.md,
    minHeight: 56,
    gap: Space.sm + 4,
  },
  userRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  avatar: {},
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    fontSize: 16,
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
    lineHeight: Type.body.lineHeight,
  },
  userMeta: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    marginTop: 2,
    letterSpacing: Type.caption.letterSpacing,
    lineHeight: Type.caption.lineHeight,
  },
  unblockBtn: {
    backgroundColor: Colors.surfaceAlt,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm - 2,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  unblockText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
    letterSpacing: Type.caption.letterSpacing,
  },
});
