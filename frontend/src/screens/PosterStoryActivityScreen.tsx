import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  FlatList,
  ActivityIndicator,
  Pressable,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { useToast } from '../context/ToastContext';
import { fetchPosterStoryActivity } from '../services/postersApi';
import type { PosterStoryActivity as ActivityData } from '../services/postersApi';
import { CachedImage } from '../components/CachedImage';

type Props = StackScreenProps<RootStackParamList, 'PosterStoryActivity'>;

const REACTION_LABELS: Record<string, string> = {
  love: 'Love',
  fire: 'Fire',
  style: 'Style',
  want: 'Want',
  wow: 'Wow',
  laugh: 'Laugh',
};

type ActivityItem = ActivityData['viewers'][0] | ActivityData['reactions'][0] | ActivityData['replies'][0];

export default function PosterStoryActivityScreen({ navigation, route }: Props) {
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { show } = useToast();
  const storyId = route.params.storyId;

  const [activity, setActivity] = useState<ActivityData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'viewers' | 'reactions' | 'replies'>('viewers');

  const loadActivity = useCallback(async (isRefresh = false) => {
    if (isRefresh) setIsRefreshing(true);
    else setIsLoading(true);
    try {
      const data = await fetchPosterStoryActivity(storyId);
      setActivity(data);
    } catch {
      show('Could not load activity', 'error');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [storyId, show]);

  useEffect(() => {
    loadActivity();
  }, [loadActivity]);

  const tabs = [
    { key: 'viewers' as const, label: 'Views', count: activity?.viewers.length ?? 0 },
    { key: 'reactions' as const, label: 'Reactions', count: activity?.reactions.length ?? 0 },
    { key: 'replies' as const, label: 'Replies', count: activity?.replies.length ?? 0 },
  ];

  const renderViewer = ({ item }: { item: ActivityData['viewers'][0] }) => (
    <View style={styles.row}>
      {item.avatar ? (
        <CachedImage
          uri={item.avatar}
          style={styles.avatar}
          containerStyle={{ borderRadius: 20, overflow: 'hidden' }}
          contentFit="cover"
        />
      ) : (
        <View style={[styles.avatar, styles.avatarPlaceholder]}>
          <Text style={styles.avatarText}>{item.username?.[0]?.toUpperCase() ?? '?'}</Text>
        </View>
      )}
      <View style={styles.rowContent}>
        <Text style={styles.rowTitle}>@{item.username ?? item.userId}</Text>
        <Text style={styles.rowSubtitle}>
          Viewed {item.viewedFrameCount} frame{item.viewedFrameCount !== 1 ? 's' : ''}
        </Text>
      </View>
      <Text style={styles.rowTime}>
        {new Date(item.latestViewedAt).toLocaleDateString(undefined, { hour: 'numeric', minute: '2-digit' })}
      </Text>
    </View>
  );

  const renderReaction = ({ item }: { item: ActivityData['reactions'][0] }) => (
    <View style={styles.row}>
      {item.avatar ? (
        <CachedImage
          uri={item.avatar}
          style={styles.avatar}
          containerStyle={{ borderRadius: 20, overflow: 'hidden' }}
          contentFit="cover"
        />
      ) : (
        <View style={[styles.avatar, styles.avatarPlaceholder]}>
          <Text style={styles.avatarText}>{item.username?.[0]?.toUpperCase() ?? '?'}</Text>
        </View>
      )}
      <View style={styles.rowContent}>
        <Text style={styles.rowTitle}>@{item.username ?? item.userId}</Text>
        <Text style={styles.rowSubtitle}>reacted {REACTION_LABELS[item.reaction] ?? item.reaction}</Text>
      </View>
      <Text style={styles.rowTime}>
        {new Date(item.createdAt).toLocaleDateString(undefined, { hour: 'numeric', minute: '2-digit' })}
      </Text>
    </View>
  );

  const renderReply = ({ item }: { item: ActivityData['replies'][0] }) => (
    <View style={styles.row}>
      {item.authorAvatar ? (
        <CachedImage
          uri={item.authorAvatar}
          style={styles.avatar}
          containerStyle={{ borderRadius: 20, overflow: 'hidden' }}
          contentFit="cover"
        />
      ) : (
        <View style={[styles.avatar, styles.avatarPlaceholder]}>
          <Text style={styles.avatarText}>{item.authorUsername?.[0]?.toUpperCase() ?? '?'}</Text>
        </View>
      )}
      <View style={styles.rowContent}>
        <Text style={styles.rowTitle}>@{item.authorUsername ?? item.authorId}</Text>
        <Text style={styles.rowSubtitle} numberOfLines={2}>{item.body}</Text>
      </View>
      <Text style={styles.rowTime}>
        {new Date(item.createdAt).toLocaleDateString(undefined, { hour: 'numeric', minute: '2-digit' })}
      </Text>
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <View style={styles.topBar}>
          <AnimatedPressable onPress={() => navigation.goBack()} style={styles.iconBtn} activeOpacity={0.7} scaleValue={0.9} hapticFeedback="light">
            <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
          </AnimatedPressable>
          <Text style={styles.topTitle}>Story Activity</Text>
          <View style={styles.iconBtn} />
        </View>
        <View style={styles.loadingBody}>
          <ActivityIndicator size="large" color={colors.brand} />
        </View>
      </SafeAreaView>
    );
  }

  const currentData: ActivityItem[] = activeTab === 'viewers' ? activity?.viewers ?? []
    : activeTab === 'reactions' ? activity?.reactions ?? []
    : activity?.replies ?? [];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View style={styles.topBar}>
        <AnimatedPressable
          onPress={() => navigation.goBack()}
          style={styles.iconBtn}
          activeOpacity={0.7}
          scaleValue={0.9}
          hapticFeedback="light"
        >
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </AnimatedPressable>
        <Text style={styles.topTitle}>Story Activity</Text>
        <View style={styles.iconBtn} />
      </View>

      <View style={styles.tabBar}>
        {tabs.map((tab) => (
          <Pressable
            key={tab.key}
            onPress={() => setActiveTab(tab.key)}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            accessibilityLabel={`${tab.label} (${tab.count})`}
            accessibilityRole="button"
          >
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
              {tab.label}
            </Text>
            {tab.count > 0 && (
              <View style={styles.tabBadge}>
                <Text style={styles.tabBadgeText}>{tab.count}</Text>
              </View>
            )}
          </Pressable>
        ))}
      </View>

      <FlatList
        data={currentData}
        keyExtractor={(item: ActivityItem) => {
          if ('id' in item) return item.id;
          return item.userId;
        }}
        renderItem={({ item }: { item: ActivityItem; index: number }) => {
          if ('viewedFrameCount' in item) return renderViewer({ item });
          if ('reaction' in item) return renderReaction({ item });
          return renderReply({ item });
        }}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => loadActivity(true)}
            tintColor={colors.brand}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyBody}>
            <Ionicons name="people-outline" size={40} color={colors.textMuted} />
            <Text style={styles.emptyText}>No {activeTab} yet</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Space.sm,
      paddingVertical: 10,
    },
    topTitle: {
      fontSize: Type.subtitle.size,
      fontFamily: Typography.family.bold,
      color: colors.textPrimary,
      letterSpacing: Type.subtitle.letterSpacing,
    },
    iconBtn: {
      width: 44,
      height: 44,
      borderRadius: Radius.full,
      justifyContent: 'center',
      alignItems: 'center',
    },
    loadingBody: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    tabBar: {
      flexDirection: 'row',
      paddingHorizontal: Space.md,
      paddingBottom: Space.sm,
      gap: Space.sm,
    },
    tab: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      paddingVertical: 8,
      borderRadius: Radius.md,
      backgroundColor: colors.surfaceAlt,
    },
    tabActive: {
      backgroundColor: colors.brand,
    },
    tabText: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.semibold,
      color: colors.textSecondary,
    },
    tabTextActive: {
      color: '#fff',
    },
    tabBadge: {
      backgroundColor: 'rgba(255,255,255,0.25)',
      borderRadius: 8,
      paddingHorizontal: 6,
      paddingVertical: 1,
      minWidth: 16,
      alignItems: 'center',
    },
    tabBadgeText: {
      color: '#fff',
      fontSize: 10,
      fontFamily: Typography.family.bold,
    },
    listContent: {
      paddingHorizontal: Space.md,
      paddingBottom: Space.xl,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingVertical: Space.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      justifyContent: 'center',
      alignItems: 'center',
    },
    avatarPlaceholder: {
      backgroundColor: colors.surfaceAlt,
    },
    avatarText: {
      color: colors.textSecondary,
      fontFamily: Typography.family.bold,
      fontSize: 16,
    },
    rowContent: {
      flex: 1,
      gap: 2,
    },
    rowTitle: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
    },
    rowSubtitle: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      color: colors.textSecondary,
    },
    rowTime: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      color: colors.textMuted,
    },
    emptyBody: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: Space.xxl,
      gap: Space.md,
    },
    emptyText: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.medium,
      color: colors.textMuted,
    },
  });
}
