import React, { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, Radius, Typography, Control } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { CachedImage } from '../components/CachedImage';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { EmptyState } from '../components/EmptyState';
import { SettingsListSkeleton } from '../components/skeletons/SettingsListSkeleton';
import {
  fetchPublicProfile,
  unblockUser,
  type PublicProfileUser } from '../services/profileApi';

type Props = NativeStackScreenProps<RootStackParamList, 'BlockedUsers'>;

export default function BlockedUsersScreen({ navigation }: Props) {
  const { show } = useToast();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const blockedIds = useStore((state) => state.blockedUsers);
  const toggleBlocked = useStore((state) => state.toggleBlockedUser);
  const [profiles, setProfiles] = useState<Record<string, PublicProfileUser | null>>({});
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [query, setQuery] = useState('');

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

  const showSearch = blockedIds.length > 0;

  const filteredIds = useMemo(() => {
    if (!query.trim()) return blockedIds;
    const q = query.trim().toLowerCase();
    return blockedIds.filter((userId) => {
      const p = profiles[userId];
      const name = (p?.displayName || p?.username || '').toLowerCase();
      const handle = (p?.username || '').toLowerCase();
      return name.includes(q) || handle.includes(q) || userId.toLowerCase().includes(q);
    });
  }, [blockedIds, profiles, query]);

  const renderRow = (userId: string, isLast: boolean) => {
    const profile = profiles[userId];
    const displayName = profile?.displayName || profile?.username || 'Account unavailable';
    return (
      <View
        key={userId}
        style={[
          styles.userRow,
          !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
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
            <Ionicons name="person-outline" size={18} color={colors.textMuted} />
          </View>
        )}

        <View style={styles.userText}>
          <Text style={[styles.userName, { color: colors.textPrimary }]} numberOfLines={1}>
            {displayName}
          </Text>
          <Text style={[styles.userMeta, { color: colors.textMuted }]} numberOfLines={1}>
            {profile?.username ? `@${profile.username}` : 'Profile details could not be loaded'}
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
            disabled: pendingId !== null }}
        >
          {pendingId === userId ? (
            <ActivityIndicator size="small" color={colors.textPrimary} />
          ) : (
            <Text style={[styles.unblockText, { color: colors.textPrimary }]}>Unblock</Text>
          )}
        </AnimatedPressable>
      </View>
    );
  };

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title="Blocked accounts"
          subtitle={blockedIds.length > 0 ? `${blockedIds.length} blocked` : 'Accounts that cannot contact you'}
          onBack={() => navigation.goBack()}
        />
      }
    >
      {blockedIds.length === 0 ? (
        <EmptyState
          icon="shield-checkmark-outline"
          title="You haven't blocked anyone"
          subtitle="Blocked accounts appear here."
        />
      ) : (
        <>
          {showSearch && (
            <View style={styles.searchRow}>
              <Ionicons name="search-outline" size={16} color={colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                value={query}
                onChangeText={setQuery}
                placeholder="Search blocked accounts"
                placeholderTextColor={colors.textMuted}
                accessibilityLabel="Search blocked accounts"
              />
              {query.length > 0 && (
                <AnimatedPressable
                  onPress={() => setQuery('')}
                  scaleValue={0.9}
                  hapticFeedback="light"
                  accessibilityLabel="Clear search"
                  accessibilityRole="button"
                  style={styles.clearBtn}
                >
                  <Ionicons name="close-circle" size={16} color={colors.textMuted} />
                </AnimatedPressable>
              )}
            </View>
          )}

          {loadingProfiles && Object.keys(profiles).length === 0 ? (
            <SettingsListSkeleton count={Math.min(blockedIds.length, 4)} />
          ) : filteredIds.length === 0 ? (
            <EmptyState
              icon="search-outline"
              title="No matches"
              subtitle="No blocked accounts match your search."
              density="compact"
            />
          ) : (
            <View style={[styles.list, { borderColor: colors.border }]}>
              {filteredIds.map((userId, index) =>
                renderRow(userId, index === filteredIds.length - 1)
              )}
            </View>
          )}
        </>
      )}
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      backgroundColor: colors.surfaceAlt,
      borderRadius: Radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      paddingHorizontal: Space.md,
      paddingVertical: Space.xs + 2,
      marginBottom: Space.md },
    searchInput: {
      flex: 1,
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      color: colors.textPrimary,
      minHeight: Control.chrome,
      paddingVertical: 0 },
    clearBtn: {
      width: Control.chromeCompact,
      height: Control.chromeCompact,
      alignItems: 'center',
      justifyContent: 'center' },
    list: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth },
    userRow: {
      minHeight: Control.hit + Space.lg,
      marginLeft: Space.md,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm + Space.xs },
    avatar: {
      width: Space.xxl - 2,
      height: Space.xxl - 2,
      borderRadius: Radius.xxl },
    avatarFallback: {
      width: Space.xxl - 2,
      height: Space.xxl - 2,
      borderRadius: Radius.xxl,
      alignItems: 'center',
      justifyContent: 'center' },
    userText: {
      minWidth: 0,
      flex: 1 },
    userName: {
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.body.size },
    userMeta: {
      fontFamily: Typography.family.regular,
      fontSize: TypographyV2.meta.size,
      marginTop: Space.xs - 1 },
    unblockTarget: {
      minWidth: 76,
      minHeight: Control.chrome,
      paddingHorizontal: Space.sm + Space.xs,
      marginRight: Space.md,
      borderRadius: Radius.full,
      alignItems: 'center',
      justifyContent: 'center' },
    unblockText: {
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.meta.size } });
}
