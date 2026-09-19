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
import { AppIcon } from '../components/common/AppIcon';
import { IconSize } from '../theme/iconTokens';
import {
  unblockUser,
  getBlockedUsers,
  type BlockedUserEntry } from '../services/profileApi';

type Props = NativeStackScreenProps<RootStackParamList, 'BlockedUsers'>;

export default function BlockedUsersScreen({ navigation }: Props) {
  const { show } = useToast();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const blockedIds = useStore((state) => state.blockedUsers);
  const removeBlockedUser = useStore((state) => state.removeBlockedUser);
  // Server entries are the source of truth for the list — the local store's
  // `blockedIds` can diverge when hydration fails, so rows render from the
  // fetched payload and the store is only used for optimistic removal.
  const [serverEntries, setServerEntries] = useState<BlockedUserEntry[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  React.useEffect(() => {
    let cancelled = false;
    setLoadError(false);
    getBlockedUsers()
      .then((entries) => {
        if (!cancelled) setServerEntries(entries);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [blockedIds, reloadToken]);

  const handleUnblock = async (userId: string) => {
    if (pendingId) return;
    setPendingId(userId);
    try {
      await unblockUser(userId);
      removeBlockedUser(userId);
      // Optimistic removal — the effect refetches on `blockedIds` change,
      // but the row should disappear immediately.
      setServerEntries((prev) => prev?.filter((e) => e.userId !== userId) ?? prev);
      show('Account unblocked', 'success');
    } catch {
      show('Could not unblock this account. Try again.', 'error');
    } finally {
      setPendingId(null);
    }
  };

  const entries = serverEntries ?? [];
  const isInitialLoading = serverEntries === null && !loadError;
  const showSearch = entries.length > 0;

  const filteredEntries = useMemo(() => {
    if (!query.trim()) return entries;
    const q = query.trim().toLowerCase();
    return entries.filter((entry) => {
      const name = (entry.displayName || entry.username || '').toLowerCase();
      const handle = (entry.username || '').toLowerCase();
      return name.includes(q) || handle.includes(q) || entry.userId.toLowerCase().includes(q);
    });
  }, [entries, query]);

  const renderRow = (entry: BlockedUserEntry, isLast: boolean) => {
    const displayName = entry.displayName || entry.username || 'Account unavailable';
    return (
      <View
        key={entry.userId}
        style={[
          styles.userRow,
          !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
        ]}
      >
        {entry.avatarUrl ? (
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
            {`@${entry.username}`}
          </Text>
        </View>

        <AnimatedPressable
          style={[styles.unblockTarget, { backgroundColor: colors.surfaceAlt }]}
          onPress={() => handleUnblock(entry.userId)}
          scaleValue={0.96}
          hapticFeedback="light"
          disabled={pendingId !== null}
          accessibilityLabel={`Unblock ${displayName}`}
          accessibilityRole="button"
          accessibilityState={{
            busy: pendingId === entry.userId,
            disabled: pendingId !== null }}
        >
          {pendingId === entry.userId ? (
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
          subtitle={entries.length > 0 ? `${entries.length} blocked` : 'Accounts that cannot contact you'}
          onBack={() => navigation.goBack()}
        />
      }
    >
      {isInitialLoading ? (
        <SettingsListSkeleton count={4} />
      ) : loadError && serverEntries === null ? (
        <EmptyState
          icon="offline"
          title="Couldn't load blocked accounts"
          subtitle="Check your connection and try again."
          ctaLabel="Retry"
          onCtaPress={() => { setServerEntries(null); setReloadToken((n) => n + 1); }}
        />
      ) : entries.length === 0 ? (
        <EmptyState
          icon="lock"
          title="You haven't blocked anyone"
          subtitle="Blocked accounts appear here."
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
                  <AppIcon name="close" size={IconSize.sm} color="textMuted" opticalCenter accessible={false} />
                </AnimatedPressable>
              )}
            </View>
          )}

          {filteredEntries.length === 0 ? (
            <EmptyState
              icon="search"
              title="No matches"
              subtitle="No blocked accounts match your search."
              density="compact"
            />
          ) : (
            <View style={[styles.list, { borderColor: colors.border }]}>
              {filteredEntries.map((entry, index) =>
                renderRow(entry, index === filteredEntries.length - 1)
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
