import React, { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, Radius, Type, Typography, Control } from '../theme/designTokens';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { CachedImage } from '../components/CachedImage';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { EmptyState } from '../components/EmptyState';
import { SettingsListSkeleton } from '../components/skeletons/SettingsListSkeleton';
import { useReducedMotion } from '../hooks/useReducedMotion';
import {
  fetchPublicProfile,
  unblockUser,
  type PublicProfileUser,
} from '../services/profileApi';

type Props = NativeStackScreenProps<RootStackParamList, 'BlockedUsers'>;

export default function BlockedUsersScreen({ navigation }: Props) {
  const { show } = useToast();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const blockedIds = useStore((state) => state.blockedUsers);
  const toggleBlocked = useStore((state) => state.toggleBlockedUser);
  const reducedMotionEnabled = useReducedMotion();
  const [profiles, setProfiles] = React.useState<
    Record<string, PublicProfileUser | null>
  >({});
  const [loadingProfiles, setLoadingProfiles] = React.useState(false);
  const [pendingId, setPendingId] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    if (blockedIds.length === 0) {
      setProfiles({});
      return;
    }

    setLoadingProfiles(true);
    Promise.all(
      blockedIds.map(async (userId) => {
        try {
          return [userId, await fetchPublicProfile(userId)] as const;
        } catch {
          return [userId, null] as const;
        }
      })
    )
      .then((entries) => {
        if (!cancelled) setProfiles(Object.fromEntries(entries));
      })
      .finally(() => {
        if (!cancelled) setLoadingProfiles(false);
      });

    return () => {
      cancelled = true;
    };
  }, [blockedIds]);

  const handleUnblock = async (userId: string) => {
    if (pendingId) return;
    setPendingId(userId);
    try {
      await unblockUser(userId);
      toggleBlocked(userId);
      show('Account unblocked', 'success');
    } catch {
      show('Could not unblock this account. Try again.', 'error');
    } finally {
      setPendingId(null);
    }
  };

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title="Blocked accounts"
          subtitle="Accounts that cannot contact you"
          onBack={() => navigation.goBack()}
        />
      }
    >
      {/* Hero summary */}
      <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)}>
        <View style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.heroRow}>
            <View style={[styles.heroIcon, { backgroundColor: blockedIds.length > 0 ? colors.danger : colors.success }]}>
              <Ionicons name={blockedIds.length > 0 ? 'ban' : 'shield-checkmark'} size={20} color={colors.textInverse} />
            </View>
            <View style={styles.heroText}>
              <Text style={[styles.heroTitle, { color: colors.textPrimary }]}>
                {blockedIds.length === 0 ? 'No blocked accounts' : `${blockedIds.length} blocked`}
              </Text>
              <Text style={[styles.heroSubtitle, { color: colors.textSecondary }]}>
                {blockedIds.length === 0
                  ? 'Your account is open to everyone'
                  : 'These accounts cannot message or find you'}
              </Text>
            </View>
          </View>
        </View>
      </Reanimated.View>

      {blockedIds.length === 0 ? (
        <EmptyState
          icon="shield-checkmark-outline"
          title="No blocked accounts"
          subtitle="Accounts you block will appear here and will not be able to contact you."
        />
      ) : loadingProfiles && Object.keys(profiles).length === 0 ? (
        <SettingsListSkeleton count={3} />
      ) : (
        <View style={[styles.list, { borderColor: colors.border }]}>
          {blockedIds.map((userId, index) => {
            const profile = profiles[userId];
            const displayName =
              profile?.displayName || profile?.username || 'Account unavailable';

            return (
              <View
                key={userId}
                style={[
                  styles.userRow,
                  index < blockedIds.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                ]}
              >
                {profile?.avatar ? (
                  <CachedImage
                    uri={profile.avatar}
                    style={styles.avatar}
                    containerStyle={styles.avatar}
                    contentFit="cover"
                  />
                ) : (
                  <View style={[styles.avatarFallback, { backgroundColor: colors.surfaceAlt }]}>
                    <Ionicons
                      name="person-outline"
                      size={18}
                      color={colors.textMuted}
                    />
                  </View>
                )}

                <View style={styles.userText}>
                  <Text style={[styles.userName, { color: colors.textPrimary }]} numberOfLines={1}>
                    {displayName}
                  </Text>
                  <Text style={[styles.userMeta, { color: colors.textMuted }]} numberOfLines={1}>
                    {profile?.username
                      ? `@${profile.username}`
                      : 'Profile details could not be loaded'}
                  </Text>
                </View>

                <AnimatedPressable
                  style={[styles.unblockTarget, { backgroundColor: colors.surfaceAlt }]}
                  onPress={() => handleUnblock(userId)}
                  scaleValue={0.96}
                  hapticFeedback="light"
                  disabled={pendingId !== null}
                  accessibilityLabel={`Unblock ${displayName}`}
                  accessibilityRole="button"
                  accessibilityState={{
                    busy: pendingId === userId,
                    disabled: pendingId !== null,
                  }}
                >
                  {pendingId === userId ? (
                    <ActivityIndicator
                      size="small"
                      color={colors.textPrimary}
                    />
                  ) : (
                    <Text style={[styles.unblockText, { color: colors.textPrimary }]}>Unblock</Text>
                  )}
                </AnimatedPressable>
              </View>
            );
          })}
        </View>
      )}
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    heroCard: {
      borderRadius: Radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      padding: Space.md,
      marginBottom: Space.md,
    },
    heroRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.md,
    },
    heroIcon: {
      width: Space.xl + Space.sm,
      height: Space.xl + Space.sm,
      borderRadius: Radius.full,
      justifyContent: 'center',
      alignItems: 'center',
    },
    heroText: { flex: 1 },
    heroTitle: {
      fontSize: Type.bodyEmphasis.size,
      fontFamily: Typography.family.semibold,
      letterSpacing: Type.body.letterSpacing,
    },
    heroSubtitle: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      marginTop: Space.xs / 2,
    },
    list: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    userRow: {
      minHeight: Space.xxl + Space.lg + 2,
      marginLeft: Space.md,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm + Space.xs,
    },
    avatar: {
      width: Space.xxl - 2,
      height: Space.xxl - 2,
      borderRadius: Radius.xxl,
    },
    avatarFallback: {
      width: Space.xxl - 2,
      height: Space.xxl - 2,
      borderRadius: Radius.xxl,
      alignItems: 'center',
      justifyContent: 'center',
    },
    userText: {
      minWidth: 0,
      flex: 1,
    },
    userName: {
      fontFamily: Typography.family.semibold,
      fontSize: Type.body.size,
    },
    userMeta: {
      fontFamily: Typography.family.regular,
      fontSize: Type.caption.size,
      marginTop: Space.xs - 1,
    },
    unblockTarget: {
      minWidth: 76,
      minHeight: Control.chrome,
      paddingHorizontal: Space.sm + Space.xs,
      marginRight: Space.md,
      borderRadius: Radius.full,
      alignItems: 'center',
      justifyContent: 'center',
    },
    unblockText: {
      fontFamily: Typography.family.semibold,
      fontSize: Type.caption.size,
    },
  });
}
