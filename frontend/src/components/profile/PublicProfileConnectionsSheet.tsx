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
import { Colors } from '../../constants/colors';
import { Space, Typography } from '../../theme/designTokens';
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
              containerStyle={{ width: 44, height: 44, borderRadius: 22 }}
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
            style={styles.stateWrap}
            onPress={() => activeQuery.refetch()}
            accessibilityRole="button"
            accessibilityLabel="Retry loading connections"
          >
            <Ionicons name="cloud-offline-outline" size={32} color={Colors.textMuted} />
            <Text style={styles.stateTitle}>Couldn't load {segment === 'followers' ? 'followers' : 'following'}</Text>
            <Text style={styles.stateSub}>Tap to retry</Text>
          </Pressable>
        ) : items.length === 0 ? (
          <View style={styles.stateWrap}>
            <Ionicons
              name={segment === 'followers' ? 'people-outline' : 'person-add-outline'}
              size={32}
              color={Colors.textMuted}
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
                  <ActivityIndicator size="small" color={Colors.textMuted} />
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

const styles = StyleSheet.create({
  container: { paddingHorizontal: Space.md, paddingVertical: Space.sm, flex: 1 },
  title: { fontSize: 20, fontFamily: Typography.family.bold, color: Colors.textPrimary, letterSpacing: -0.4, marginBottom: Space.sm },
  // Rows ΓÇö no chevron, pressed feedback, divider rhythm
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, minHeight: 56 },
  rowPressed: { opacity: 0.6 },
  rowDivider: { height: StyleSheet.hairlineWidth, backgroundColor: Colors.border, marginLeft: 56 },
  avatarWrap: {},
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarFallback: { backgroundColor: Colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { fontSize: 15, fontFamily: Typography.family.bold, color: Colors.textSecondary },
  identityCol: { flex: 1 },
  displayName: { fontSize: 15, fontFamily: Typography.family.semibold, color: Colors.textPrimary },
  handle: { fontSize: 13, fontFamily: Typography.family.regular, color: Colors.textSecondary, marginTop: 1 },
  // Skeleton rows
  skeletonRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, minHeight: 56 },
  skeletonAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.surfaceAlt },
  skeletonIdentity: { flex: 1, gap: 4 },
  skeletonName: { width: 140, height: 14, borderRadius: 4, backgroundColor: Colors.surfaceAlt },
  skeletonHandle: { width: 100, height: 12, borderRadius: 4, backgroundColor: Colors.surfaceAlt },
  // States
  stateWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: Space.xl * 2, gap: 8, paddingHorizontal: Space.md },
  stateTitle: { fontSize: 15, fontFamily: Typography.family.semibold, color: Colors.textPrimary },
  stateSub: { fontSize: 13, fontFamily: Typography.family.regular, color: Colors.textMuted, textAlign: 'center' },
  footerIndicator: { paddingVertical: Space.md, alignItems: 'center' },
});
