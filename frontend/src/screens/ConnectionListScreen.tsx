import React, { useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { openProfile } from '../navigation/openProfile';
import { EmptyState } from '../components/EmptyState';
import { OfflineBanner } from '../components/OfflineBanner';
import { CachedImage } from '../components/CachedImage';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { useConnectivity } from '../hooks/useConnectivity';
import { useStore } from '../store/useStore';
import {
  useFollowersInfinite,
  useFollowingInfinite,
  useFollowMutation,
} from '../platform/server';
import { haptics } from '../utils/haptics';
import type { FollowListUser } from '../services/profileApi';

import { Typography, Radius, Type, Space, Stroke, Control } from '../theme/designTokens';

type NavT = NativeStackNavigationProp<RootStackParamList>;
type ConnectionListRouteProp = RouteProp<RootStackParamList, 'ConnectionList'>;

type ConnectionMode = 'followers' | 'following';

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export default function ConnectionListScreen() {
  const navigation = useNavigation<NavT>();
  const route = useRoute<ConnectionListRouteProp>();
  const { userId, mode } = route.params;
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { isOffline } = useConnectivity();
  const currentUser = useStore((state) => state.currentUser);
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const isFollowers = mode === 'followers';
  const query = isFollowers ? useFollowersInfinite(userId) : useFollowingInfinite(userId);

  const items: FollowListUser[] = useMemo(() => {
    const pages = query.data?.pages ?? [];
    const acc: FollowListUser[] = [];
    for (const page of pages) {
      for (const it of page.items) acc.push(it);
    }
    return acc;
  }, [query.data]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return items;
    return items.filter((u) => {
      const name = (u.displayName || '').toLowerCase();
      const handle = (u.username || '').toLowerCase();
      return name.includes(q) || handle.includes(q);
    });
  }, [items, searchQuery]);

  const isLoading = query.isLoading && items.length === 0;
  const hasError = Boolean(query.error) && items.length === 0;
  const hasNextPage = Boolean(query.hasNextPage);
  const isFetchingNextPage = query.isFetchingNextPage;

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) query.fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, query]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await query.refetch();
    } finally {
      setIsRefreshing(false);
    }
  }, [query]);

  const handleOpenProfile = useCallback(
    (id: string) => {
      openProfile(navigation, id, currentUser?.id);
    },
    [navigation, currentUser?.id]
  );

  const renderItem = useCallback(
    ({ item }: { item: FollowListUser }) => {
      const name = item.displayName || item.username || 'Thryft user';
      const initials = getInitials(name);
      const isSelf = item.id === currentUser?.id;

      return (
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => handleOpenProfile(item.id)}
          accessibilityRole="button"
          accessibilityLabel={`Open ${name}'s profile`}
        >
          <View style={styles.avatarWrap}>
            {item.avatar ? (
              <CachedImage
                uri={item.avatar}
                style={styles.avatar}
                containerStyle={{ width: 44, height: 44, borderRadius: Radius.xxl }}
                contentFit="cover"
              />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.avatarInitials}>{initials}</Text>
              </View>
            )}
          </View>
          <View style={styles.identityCol}>
            <Text style={styles.displayName} numberOfLines={1}>{name}</Text>
            {item.username ? (
              <Text style={styles.handle} numberOfLines={1}>@{item.username}</Text>
            ) : null}
          </View>
          {!isSelf ? <FollowButton userId={item.id} serverIsFollowing={item.isFollowing} colors={colors} styles={styles} /> : null}
        </Pressable>
      );
    },
    [handleOpenProfile, currentUser?.id, colors, styles]
  );

  const renderSkeletonRow = useCallback(
    ({ index }: { index: number }) => (
      <View style={styles.skeletonRow} key={`skel-${index}`}>
        <View style={styles.skeletonAvatar} />
        <View style={styles.skeletonIdentity}>
          <View style={styles.skeletonName} />
          <View style={styles.skeletonHandle} />
        </View>
      </View>
    ),
    [styles]
  );

  const title = isFollowers ? 'Followers' : 'Following';
  const searchPlaceholder = isFollowers ? 'Search followers' : 'Search following';

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title={title}
          onBack={() => navigation.goBack()}
        />
      }
      scrollEnabled={false}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
    >
      {/* Search bar */}
      <View style={styles.searchRow}>
        <View style={styles.searchInputWrap}>
          <Ionicons name="search-outline" size={16} color={colors.textMuted} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder={searchPlaceholder}
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            accessibilityLabel={searchPlaceholder}
            returnKeyType="search"
            autoCorrect={false}
          />
          {searchQuery.length > 0 ? (
            <Pressable
              onPress={() => setSearchQuery('')}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              hitSlop={8}
            >
              <Ionicons name="close-circle" size={16} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {isOffline ? (
        <OfflineBanner onRetry={() => void handleRefresh()} />
      ) : null}

      <FlatList
        data={filteredItems}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.4}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={styles.rowDivider} />}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.brand}
            colors={[colors.brand]}
          />
        }
        ListEmptyComponent={
          isLoading ? (
            <View accessibilityLabel={`Loading ${title.toLowerCase()}`}>
              {Array.from({ length: 8 }).map((_, i) => renderSkeletonRow({ index: i }))}
            </View>
          ) : hasError ? (
            <EmptyState
              density="compact"
              icon="cloud-offline-outline"
              title={`Couldn't load ${title.toLowerCase()}`}
              subtitle="Pull down to refresh and try again."
              iconColor={colors.textMuted}
              ctaLabel="Retry"
              onCtaPress={() => void query.refetch()}
            />
          ) : searchQuery.length > 0 ? (
            <EmptyState
              density="compact"
              icon="search-outline"
              title="No matches"
              subtitle={`No ${title.toLowerCase()} match "${searchQuery}".`}
              iconColor={colors.textMuted}
            />
          ) : isFollowers ? (
            <EmptyState
              density="compact"
              icon="people-outline"
              title="No followers yet"
              subtitle="When people follow this account, they will appear here."
              iconColor={colors.textMuted}
            />
          ) : (
            <EmptyState
              density="compact"
              icon="person-add-outline"
              title="Not following anyone yet"
              subtitle="Accounts this user follows will appear here."
              iconColor={colors.textMuted}
            />
          )
        }
        ListFooterComponent={
          isFetchingNextPage ? (
            <View style={styles.footerIndicator}>
              <ActivityIndicator size="small" color={colors.textMuted} />
            </View>
          ) : <View style={{ height: Space.xl }} />
        }
      />
    </FlagshipScreen>
  );
}

/** Compact follow/unfollow button for list rows. */
function FollowButton({
  userId,
  serverIsFollowing,
  colors,
  styles,
}: {
  userId: string;
  serverIsFollowing?: boolean;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}) {
  const followMutation = useFollowMutation(userId);
  const isFollowing = followMutation.variables ?? serverIsFollowing ?? false;

  const handlePress = useCallback(() => {
    haptics.tap();
    followMutation.mutate(!isFollowing);
  }, [followMutation, isFollowing]);

  return (
    <AnimatedPressable
      style={[
        styles.followBtn,
        isFollowing ? styles.followingBtn : styles.notFollowingBtn,
      ]}
      onPress={handlePress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={isFollowing ? 'Unfollow' : 'Follow'}
      disabled={followMutation.isPending}
    >
      {followMutation.isPending ? (
        <ActivityIndicator size="small" color={isFollowing ? colors.textPrimary : colors.background} />
      ) : (
        <Text style={[styles.followBtnText, isFollowing ? styles.followingBtnText : styles.notFollowingBtnText]}>
          {isFollowing ? 'Following' : 'Follow'}
        </Text>
      )}
    </AnimatedPressable>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    searchRow: {
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    searchInputWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs + 1,
      paddingHorizontal: Space.sm + 2,
      height: Control.hit - 2,
      borderRadius: Radius.lg,
      backgroundColor: colors.surfaceAlt,
      borderWidth: Stroke.hairline,
      borderColor: colors.border,
    },
    searchIcon: {
      marginLeft: -Space.xs / 2,
    },
    searchInput: {
      flex: 1,
      fontSize: Type.body.size,
      fontFamily: Typography.family.regular,
      color: colors.textPrimary,
      paddingVertical: 0,
    },
    listContent: { paddingBottom: Space.xxl + Space.xl },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.md,
      paddingVertical: Space.sm + 2,
      paddingHorizontal: Space.md,
      minHeight: Space.xxl + Space.xxl + Space.xs,
    },
    rowPressed: { opacity: 0.6 },
    rowDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: Space.md + 44 + Space.md },
    avatarWrap: {},
    avatar: { width: 44, height: 44, borderRadius: Radius.xxl },
    avatarFallback: { backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
    avatarInitials: { fontSize: Type.bodyStrong.size, fontFamily: Typography.family.bold, color: colors.textSecondary },
    identityCol: { flex: 1 },
    displayName: { fontSize: Type.bodyStrong.size, fontFamily: Typography.family.semibold, color: colors.textPrimary },
    handle: { fontSize: Type.caption.size, fontFamily: Typography.family.regular, color: colors.textSecondary, marginTop: 1 },
    followBtn: {
      minWidth: Control.hit + Space.sm,
      height: Control.hit - 4,
      borderRadius: Radius.lg,
      paddingHorizontal: Space.sm + 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    notFollowingBtn: {
      backgroundColor: colors.brand,
    },
    followingBtn: {
      backgroundColor: colors.surfaceAlt,
      borderWidth: Stroke.standard,
      borderColor: colors.border,
    },
    followBtnText: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.semibold,
    },
    notFollowingBtnText: {
      color: colors.background,
    },
    followingBtnText: {
      color: colors.textSecondary,
    },
    skeletonRow: { flexDirection: 'row', alignItems: 'center', gap: Space.md, paddingVertical: Space.sm + 2, paddingHorizontal: Space.md, minHeight: Space.xxl + Space.xxl + Space.xs },
    skeletonAvatar: { width: 44, height: 44, borderRadius: Radius.xxl, backgroundColor: colors.surfaceAlt },
    skeletonIdentity: { flex: 1, gap: Space.xs },
    skeletonName: { width: '40%', height: Type.body.size, borderRadius: Radius.sm, backgroundColor: colors.surfaceAlt },
    skeletonHandle: { width: '28%', height: Type.caption.size, borderRadius: Radius.sm, backgroundColor: colors.surfaceAlt },
    footerIndicator: { paddingVertical: Space.md, alignItems: 'center' },
  });
}
