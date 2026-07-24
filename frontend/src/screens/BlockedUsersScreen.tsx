import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { Colors } from '../constants/colors';
import { Space, Type, Typography } from '../theme/designTokens';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { CachedImage } from '../components/CachedImage';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import {
  fetchPublicProfile,
  unblockUser,
  type PublicProfileUser,
} from '../services/profileApi';

type Props = StackScreenProps<RootStackParamList, 'BlockedUsers'>;

export default function BlockedUsersScreen({ navigation }: Props) {
  const { show } = useToast();
  const blockedIds = useStore((state) => state.blockedUsers);
  const toggleBlocked = useStore((state) => state.toggleBlockedUser);
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
      {blockedIds.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons
            name="shield-checkmark-outline"
            size={25}
            color={Colors.textMuted}
          />
          <Text style={styles.emptyTitle}>No blocked accounts</Text>
          <Text style={styles.emptyBody}>
            Accounts you block will appear here and will not be able to
            contact you.
          </Text>
        </View>
      ) : loadingProfiles && Object.keys(profiles).length === 0 ? (
        <View style={styles.loading}>
          <ActivityIndicator size="small" color={Colors.textMuted} />
          <Text style={styles.loadingText}>Loading blocked accounts</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {blockedIds.map((userId, index) => {
            const profile = profiles[userId];
            const displayName =
              profile?.displayName || profile?.username || 'Account unavailable';

            return (
              <View
                key={userId}
                style={[
                  styles.userRow,
                  index < blockedIds.length - 1 && styles.divider,
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
                  <View style={styles.avatarFallback}>
                    <Ionicons
                      name="person-outline"
                      size={18}
                      color={Colors.textMuted}
                    />
                  </View>
                )}

                <View style={styles.userText}>
                  <Text style={styles.userName} numberOfLines={1}>
                    {displayName}
                  </Text>
                  <Text style={styles.userMeta} numberOfLines={1}>
                    {profile?.username
                      ? `@${profile.username}`
                      : 'Profile details could not be loaded'}
                  </Text>
                </View>

                <AnimatedPressable
                  style={styles.unblockTarget}
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
                      color={Colors.textPrimary}
                    />
                  ) : (
                    <Text style={styles.unblockText}>Unblock</Text>
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

const styles = StyleSheet.create({
  list: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  userRow: {
    minHeight: 74,
    marginLeft: Space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  divider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
  },
  avatarFallback: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceAlt,
  },
  userText: {
    minWidth: 0,
    flex: 1,
  },
  userName: {
    color: Colors.textPrimary,
    fontFamily: Typography.family.semibold,
    fontSize: 14,
  },
  userMeta: {
    color: Colors.textMuted,
    fontFamily: Typography.family.regular,
    fontSize: 12,
    marginTop: 3,
  },
  unblockTarget: {
    minWidth: 76,
    minHeight: 52,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unblockText: {
    color: Colors.textPrimary,
    fontFamily: Typography.family.semibold,
    fontSize: 12,
  },
  empty: {
    alignItems: 'center',
    paddingHorizontal: Space.xl,
    paddingTop: 72,
  },
  emptyTitle: {
    marginTop: Space.md,
    color: Colors.textPrimary,
    fontFamily: Typography.family.semibold,
    fontSize: Type.body.size,
  },
  emptyBody: {
    maxWidth: 300,
    marginTop: Space.xs,
    color: Colors.textMuted,
    fontFamily: Typography.family.regular,
    fontSize: Type.caption.size,
    lineHeight: 18,
    textAlign: 'center',
  },
  loading: {
    minHeight: 160,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
  },
  loadingText: {
    color: Colors.textMuted,
    fontFamily: Typography.family.regular,
    fontSize: Type.caption.size,
  },
});
