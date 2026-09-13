import React, { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
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
import { AppIcon } from '../components/common/AppIcon';
import { IconSize } from '../theme/iconTokens';
import {
  unrestrictUser,
  getRestrictedUsers,
  type RestrictedUserEntry } from '../services/profileApi';

type Props = NativeStackScreenProps<RootStackParamList, 'RestrictedAccounts'>;

export default function RestrictedAccountsScreen({ navigation }: Props) {
  const { show } = useToast();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const restrictedIds = useStore((state) => state.restrictedUsers);
  const removeRestrictedUser = useStore((state) => state.removeRestrictedUser);
  const [serverEntries, setServerEntries] = useState<RestrictedUserEntry[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  React.useEffect(() => {
    let cancelled = false;
    setLoadingProfiles(true);
    getRestrictedUsers()
      .then((entries) => {
        if (!cancelled) setServerEntries(entries);
      })
      .catch(() => {
        if (!cancelled) setServerEntries([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingProfiles(false);
      });
    return () => {
      cancelled = true;
    };
  }, [restrictedIds]);

  const handleUnrestrict = async (userId: string) => {
    if (pendingId) return;
    setPendingId(userId);
    try {
      await unrestrictUser(userId);
      removeRestrictedUser(userId);
      show('Account unrestricted', 'success');
    } catch {
      show('Could not unrestrict this account. Try again.', 'error');
    } finally {
      setPendingId(null);
    }
  };

  const showSearch = restrictedIds.length > 0;

  const filteredIds = useMemo(() => {
    if (!query.trim()) return restrictedIds;
    const q = query.trim().toLowerCase();
    return restrictedIds.filter((userId) => {
      const entry = serverEntries.find((e) => e.id === userId);
      const name = (entry?.displayName || entry?.username || '').toLowerCase();
      const handle = (entry?.username || '').toLowerCase();
      return name.includes(q) || handle.includes(q) || userId.toLowerCase().includes(q);
    });
  }, [restrictedIds, serverEntries, query]);

  const renderRow = (userId: string, isLast: boolean) => {
    const entry = serverEntries.find((e) => e.id === userId);
    const displayName = entry?.displayName || entry?.username || 'Account unavailable';
    return (
      <View
        key={userId}
        style={[
          styles.userRow,
          !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
        ]}
      >
        {entry?.avatarUrl ? (
          <CachedImage
            uri={entry.avatarUrl}
            style={styles.avatar}
            containerStyle={styles.avatar}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.avatarFallback, { backgroundColor: colors.surfaceAlt }]}>
            <AppIcon name="profile" size={IconSize.sm} color="textMuted" opticalCenter accessible={false} />
          </View>
        )}

        <View style={styles.userText}>
          <Text style={[styles.userName, { color: colors.textPrimary }]} numberOfLines={1}>
            {displayName}
          </Text>
          <Text style={[styles.userMeta, { color: colors.textMuted }]} numberOfLines={1}>
            {entry?.username ? `@${entry.username}` : 'Profile details could not be loaded'}
          </Text>
        </View>

        <AnimatedPressable
          style={[styles.unblockTarget, { backgroundColor: colors.surfaceAlt }]}
          onPress={() => handleUnrestrict(userId)}
          scaleValue={0.96}
          hapticFeedback="light"
          disabled={pendingId !== null}
          accessibilityLabel={`Unrestrict ${displayName}`}
          accessibilityRole="button"
          accessibilityState={{
            busy: pendingId === userId,
            disabled: pendingId !== null }}
        >
          {pendingId === userId ? (
            <ActivityIndicator size="small" color={colors.textPrimary} />
          ) : (
            <Text style={[styles.unblockText, { color: colors.textPrimary }]}>Unrestrict</Text>
          )}
        </AnimatedPressable>
      </View>
    );
  };

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title="Restricted accounts"
          subtitle={restrictedIds.length > 0 ? `${restrictedIds.length} restricted` : 'Their messages go to your requests'}
          onBack={() => navigation.goBack()}
        />
      }
    >
      {restrictedIds.length === 0 ? (
        <EmptyState
          icon="lock"
          title="You haven't restricted anyone"
          subtitle="Restricted accounts appear here."
        />
      ) : (
        <>
          {showSearch && (
            <View style={styles.searchRow}>
              <AppIcon name="search" size={IconSize.sm} color="textMuted" opticalCenter accessible={false} />
              <TextInput
                style={styles.searchInput}
                value={query}
                onChangeText={setQuery}
                placeholder="Search restricted accounts"
                placeholderTextColor={colors.textMuted}
                accessibilityLabel="Search restricted accounts"
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
                  <AppIcon name="close" size={IconSize.sm} color="textMuted" opticalCenter accessible={false} />
                </AnimatedPressable>
              )}
            </View>
          )}

          {loadingProfiles && serverEntries.length === 0 ? (
            <SettingsListSkeleton count={Math.min(restrictedIds.length, 4)} />
          ) : filteredIds.length === 0 ? (
            <EmptyState
              icon="search"
              title="No matches"
              subtitle="No restricted accounts match your search."
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
