import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  FlatList,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeSheet } from '../../platform/native';
import { CachedImage } from '../CachedImage';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Typography, Radius, Type } from '../../theme/designTokens';
import { SegmentedControl } from './ProfileTabRail';
import { useFollowersInfinite, useFollowingInfinite } from '../../platform/server';
import type { FollowListUser } from '../../services/profileApi';

type Segment = 'followers' | 'following';

interface PublicProfileConnectionsSheetProps {
  visible: boolean;
  onDismiss: () => void;
  userId: string | null | undefined;
  initialSegment: Segment;
  followerCount: number;
  followingCount: number;
  onOpenProfile: (userId: string) => void;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export function PublicProfileConnectionsSheet({
  visible,
  onDismiss,
  userId,
  initialSegment,
  followerCount,
  followingCount,
  onOpenProfile,
}: PublicProfileConnectionsSheetProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const { width: screenWidth } = useWindowDimensions();
  const [segment, setSegment] = useState<Segment>(initialSegment);

  useEffect(() => {
    if (visible) setSegment(initialSegment);
  }, [visible, initialSegment]);

  const followersQuery = useFollowersInfinite(segment === 'followers' ? userId : null);
  const followingQuery = useFollowingInfinite(segment === 'following' ? userId : null);
  const activeQuery = segment === 'followers' ? followersQuery : followingQuery;

  const items: FollowListUser[] = useMemo(() => {
    const pages = activeQuery.data?.pages ?? [];
    const acc: FollowListUser[] = [];
    for (const page of pages) {
      for (const it of page.items) acc.push(it);
    }
    return acc;
  }, [activeQuery.data]);

  const isLoading = activeQuery.isLoading && items.length === 0;
  const hasError = Boolean(activeQuery.error) && items.length === 0;
  const hasNextPage = Boolean(activeQuery.hasNextPage);
  const isFetchingNextPage = activeQuery.isFetchingNextPage;

  const handleLoadMore = () => {
    if (hasNextPage && !isFetchingNextPage) activeQuery.fetchNextPage();
  };

  const handleOpenProfile = (id: string) => {
    // Dismiss before navigation without visible flicker
    onDismiss();
    onOpenProfile(id);
  };

  const renderItem = ({ item }: { item: FollowListUser }) => {
    const name = item.displayName || item.username || 'Thryft user';
    const initials = getInitials(name);
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
      </Pressable>
    );
  };

  const renderSkeletonRow = ({ index }: { index: number }) => (
    <View style={styles.skeletonRow} key={`skel-${index}`}>
      <View style={styles.skeletonAvatar} />
      <View style={styles.skeletonIdentity}>
        <View style={styles.skeletonName} />
        <View style={styles.skeletonHandle} />
      </View>
    </View>
  );

  return (
    <NativeSheet
      visible={visible}
      onDismiss={onDismiss}
      snapPoints={[{ fraction: 0.75 }]}
    >
      <View style={styles.container}>
        {/* One title ΓÇö "Connections" */}
        <Text style={styles.title}>Connections</Text>

        {/* Animated segment indicator ΓÇö same system as the main profile */}
        <SegmentedControl
          segments={[
            { key: 'followers', label: `Followers ${followerCount}` },
            { key: 'following', label: `Following ${followingCount}` },
          ]}
          activeKey={segment}
          onChange={(k) => setSegment(k as Segment)}
        />

        {isLoading ? (
          <FlatList
            data={Array.from({ length: 8 })}
            keyExtractor={(_, i) => `skel-${i}`}
            renderItem={renderSkeletonRow}
            contentContainerStyle={{ paddingBottom: Space.xl }}
            showsVerticalScrollIndicator={false}
            key="skeleton-list"
          />
        ) : hasError ? (
          <Pressable
            style={({ pressed }) => [styles.stateWrap, pressed && { opacity: 0.6 }]}
            onPress={() => activeQuery.refetch()}
            accessibilityRole="button"
            accessibilityLabel="Retry loading connections"
          >
            <Ionicons name="cloud-offline-outline" size={32} color={colors.textMuted} />
            <Text style={styles.stateTitle}>Couldn't load {segment === 'followers' ? 'followers' : 'following'}</Text>
            <Text style={styles.stateSub}>Tap to retry</Text>
          </Pressable>
        ) : items.length === 0 ? (
          <View style={styles.stateWrap}>
            <Ionicons
              name={segment === 'followers' ? 'people-outline' : 'person-add-outline'}
              size={32}
              color={colors.textMuted}
            />
            <Text style={styles.stateTitle}>
              {segment === 'followers' ? 'No followers yet' : 'Not following anyone'}
            </Text>
            <Text style={styles.stateSub}>
              {segment === 'followers'
                ? 'When people follow this account, they will appear here.'
                : 'Accounts this user follows will appear here.'}
            </Text>
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.4}
            ListFooterComponent={
              isFetchingNextPage ? (
                <View style={styles.footerIndicator}>
                  <ActivityIndicator size="small" color={colors.textMuted} />
                </View>
              ) : <View style={{ height: Space.xl }} />
            }
            contentContainerStyle={{ paddingBottom: Space.xl, paddingTop: Space.sm }}
            showsVerticalScrollIndicator={false}
            key={`conn-${segment}`}
            ItemSeparatorComponent={() => <View style={styles.rowDivider} />}
          />
        )}
      </View>
    </NativeSheet>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: { paddingHorizontal: Space.md, paddingVertical: Space.sm, flex: 1 },
  title: { fontSize: Type.priceList.size, fontFamily: Typography.family.bold, color: colors.textPrimary, letterSpacing: -0.4, marginBottom: Space.sm },
  // Rows ΓÇö no chevron, pressed feedback, divider rhythm
  row: { flexDirection: 'row', alignItems: 'center', gap: Space.md, paddingVertical: Space.sm + 2, minHeight: Space.xxl + Space.xxl + Space.xs },
  rowPressed: { opacity: 0.6 },
  rowDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 56 },
  avatarWrap: {},
  avatar: { width: 44, height: 44, borderRadius: Radius.xxl },
  avatarFallback: { backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { fontSize: Type.bodyStrong.size, fontFamily: Typography.family.bold, color: colors.textSecondary },
  identityCol: { flex: 1 },
  displayName: { fontSize: Type.bodyStrong.size, fontFamily: Typography.family.semibold, color: colors.textPrimary },
  handle: { fontSize: Type.caption.size, fontFamily: Typography.family.regular, color: colors.textSecondary, marginTop: 1 },
  // Skeleton rows
  skeletonRow: { flexDirection: 'row', alignItems: 'center', gap: Space.md, paddingVertical: Space.sm + 2, minHeight: Space.xxl + Space.xxl + Space.xs },
  skeletonAvatar: { width: Space.xl + Space.smMd, height: Space.xl + Space.smMd, borderRadius: Radius.xxl, backgroundColor: colors.surfaceAlt },
  skeletonIdentity: { flex: 1, gap: Space.xs },
  skeletonName: { width: Space.xxl + Space.xxl + Space.xs + Space.xs, height: Type.body.size, borderRadius: Radius.sm, backgroundColor: colors.surfaceAlt },
  skeletonHandle: { width: Space.xxl + Space.xxl - Space.xs, height: Type.caption.size, borderRadius: Radius.sm, backgroundColor: colors.surfaceAlt },
  // States
  stateWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: Space.xl * 2, gap: Space.sm, paddingHorizontal: Space.md },
  stateTitle: { fontSize: Type.bodyStrong.size, fontFamily: Typography.family.semibold, color: colors.textPrimary },
  stateSub: { fontSize: Type.caption.size, fontFamily: Typography.family.regular, color: colors.textMuted, textAlign: 'center' },
  footerIndicator: { paddingVertical: Space.md, alignItems: 'center' },
  });
}
