import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeSheet } from '../../platform/native';
import { CachedImage } from '../CachedImage';
import { Colors } from '../../constants/colors';
import { Space, Typography, Radius } from '../../theme/designTokens';
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

export function PublicProfileConnectionsSheet({
  visible,
  onDismiss,
  userId,
  initialSegment,
  followerCount,
  followingCount,
  onOpenProfile,
}: PublicProfileConnectionsSheetProps) {
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

  const count = segment === 'followers' ? followerCount : followingCount;
  const isLoading = activeQuery.isLoading && items.length === 0;
  const hasNextPage = Boolean(activeQuery.hasNextPage);
  const isFetchingNextPage = activeQuery.isFetchingNextPage;

  const handleLoadMore = () => {
    if (hasNextPage && !isFetchingNextPage) activeQuery.fetchNextPage();
  };

  const renderItem = ({ item }: { item: FollowListUser }) => {
    const name = item.displayName || item.username || 'Thryft user';
    return (
      <Pressable
        style={styles.row}
        onPress={() => {
          onDismiss();
          onOpenProfile(item.id);
        }}
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
              <Ionicons name="person" size={18} color={Colors.textMuted} />
            </View>
          )}
        </View>
        <View style={styles.identityCol}>
          <Text style={styles.displayName} numberOfLines={1}>{name}</Text>
          <Text style={styles.handle} numberOfLines={1}>@{item.username}</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
      </Pressable>
    );
  };

  return (
    <NativeSheet
      visible={visible}
      onDismiss={onDismiss}
      snapPoints={[{ fraction: 0.75 }]}
    >
      <View style={styles.container}>
        <Text style={styles.title}>
          {segment === 'followers' ? 'Followers' : 'Following'}
          <Text style={styles.titleCount}> · {count}</Text>
        </Text>

        <View style={styles.segmentRail}>
          <Pressable
            style={[styles.segment, segment === 'followers' && styles.segmentActive]}
            onPress={() => setSegment('followers')}
            accessibilityRole="tab"
            accessibilityState={{ selected: segment === 'followers' }}
            accessibilityLabel={`Followers, ${followerCount}`}
          >
            <Text style={[styles.segmentLabel, segment === 'followers' && styles.segmentLabelActive]}>
              Followers
            </Text>
            {segment === 'followers' ? <View style={styles.segmentUnderline} /> : null}
          </Pressable>
          <Pressable
            style={[styles.segment, segment === 'following' && styles.segmentActive]}
            onPress={() => setSegment('following')}
            accessibilityRole="tab"
            accessibilityState={{ selected: segment === 'following' }}
            accessibilityLabel={`Following, ${followingCount}`}
          >
            <Text style={[styles.segmentLabel, segment === 'following' && styles.segmentLabelActive]}>
              Following
            </Text>
            {segment === 'following' ? <View style={styles.segmentUnderline} /> : null}
          </Pressable>
        </View>

        {isLoading ? (
          <View style={styles.stateWrap}>
            <ActivityIndicator size="large" color={Colors.brand} />
          </View>
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
            contentContainerStyle={{ paddingBottom: Space.xl }}
            showsVerticalScrollIndicator={false}
            key={`conn-${segment}`}
          />
        )}
      </View>
    </NativeSheet>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    flex: 1,
  },
  title: {
    fontSize: 20,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    letterSpacing: -0.4,
    marginBottom: Space.sm,
  },
  titleCount: {
    fontSize: 15,
    fontFamily: Typography.family.regular,
    color: Colors.textSecondary,
  },
  segmentRail: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
    marginBottom: Space.sm,
  },
  segment: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentActive: {},
  segmentLabel: {
    fontSize: 14,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
  },
  segmentLabelActive: {
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
  },
  segmentUnderline: {
    position: 'absolute',
    bottom: 0,
    left: '30%',
    right: '30%',
    height: 2,
    backgroundColor: Colors.textPrimary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    minHeight: 56,
  },
  avatarWrap: {},
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarFallback: {
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityCol: {
    flex: 1,
  },
  displayName: {
    fontSize: 15,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
    letterSpacing: -0.2,
  },
  handle: {
    fontSize: 13,
    fontFamily: Typography.family.regular,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  stateWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Space.xl * 2,
    gap: 8,
    paddingHorizontal: Space.md,
  },
  stateTitle: {
    fontSize: 15,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  stateSub: {
    fontSize: 13,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  footerIndicator: {
    paddingVertical: Space.md,
    alignItems: 'center',
  },
});
