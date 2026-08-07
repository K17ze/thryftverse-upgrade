import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  RefreshControl,
  LayoutChangeEvent,
  AccessibilityInfo,
} from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { Space, Radius, Type, Typography, Control, Stroke } from '../theme/designTokens';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { useHaptic } from '../hooks/useHaptic';
import { useMotionConfig } from '../hooks/useMotionConfig';
import { useToast } from '../context/ToastContext';
import { fetchPosterStoryActivity } from '../services/postersApi';
import type { PosterStoryActivity as ActivityData } from '../services/postersApi';
import { CachedImage } from '../components/CachedImage';

type Props = NativeStackScreenProps<RootStackParamList, 'PosterStoryActivity'>;

// Native emoji for reactions — matches the viewer's reaction bar.
const REACTION_EMOJI: Record<string, string> = {
  love: '❤️',
  fire: '🔥',
  style: '✨',
  want: '🛍️',
  wow: '😮',
  laugh: '😂',
};

const REACTION_LABELS: Record<string, string> = {
  love: 'Love',
  fire: 'Fire',
  style: 'Style',
  want: 'Want',
  wow: 'Wow',
  laugh: 'Laugh',
};

type ActivityItem = ActivityData['viewers'][0] | ActivityData['reactions'][0] | ActivityData['replies'][0];

const AVATAR_SIZE = 44;

export default function PosterStoryActivityScreen({ navigation, route }: Props) {
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { show } = useToast();
  const haptic = useHaptic();
  const { spring } = useMotionConfig();
  const storyId = route.params.storyId;

  const [activity, setActivity] = useState<ActivityData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [activeTab, setActiveTab] = useState<'viewers' | 'reactions' | 'replies'>('viewers');

  // ── Animated tab indicator ──
  // Spring-based underline that slides between tabs using Motion.spring.entrance.
  const tabIndicatorX = useSharedValue(0);
  const tabIndicatorW = useSharedValue(0);
  const tabLayoutsRef = useRef<Record<string, { x: number; width: number }>>({});

  const animatedIndicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tabIndicatorX.value }],
    width: tabIndicatorW.value,
  }));

  const handleTabLayout = useCallback((key: string, e: LayoutChangeEvent) => {
    tabLayoutsRef.current[key] = {
      x: e.nativeEvent.layout.x,
      width: e.nativeEvent.layout.width,
    };
    if (key === activeTab) {
      tabIndicatorX.value = withSpring(e.nativeEvent.layout.x, spring.entrance);
      tabIndicatorW.value = withSpring(e.nativeEvent.layout.width, spring.entrance);
    }
  }, [activeTab, spring.entrance, tabIndicatorX, tabIndicatorW]);

  const handleTabPress = useCallback((key: 'viewers' | 'reactions' | 'replies') => {
    haptic.selection();
    setActiveTab(key);
    AccessibilityInfo.announceForAccessibility(`Showing ${key}`);
    const layout = tabLayoutsRef.current[key];
    if (layout) {
      tabIndicatorX.value = withSpring(layout.x, spring.entrance);
      tabIndicatorW.value = withSpring(layout.width, spring.entrance);
    }
  }, [haptic, spring.entrance, tabIndicatorX, tabIndicatorW]);

  const loadActivity = useCallback(async (isRefresh = false) => {
    if (isRefresh) setIsRefreshing(true);
    else setIsLoading(true);
    try {
      const data = await fetchPosterStoryActivity(storyId);
      setActivity(data);
      setLoadError(false);
    } catch {
      setLoadError(true);
      if (!isRefresh) show('Could not load activity', 'error');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [storyId, show]);

  useEffect(() => {
    loadActivity();
  }, [loadActivity]);

  // Summary metrics for the header card
  const summary = useMemo(() => {
    const viewerCount = activity?.viewers.length ?? 0;
    const reactionCount = activity?.reactions.length ?? 0;
    const replyCount = activity?.replies.length ?? 0;
    const totalEngagement = reactionCount + replyCount;

    // Completion rate: percentage of viewers who viewed all frames.
    // Total frame count is inferred from the max viewedFrameCount across viewers.
    const maxFramesViewed = activity?.viewers.reduce(
      (max, v) => Math.max(max, v.viewedFrameCount), 0
    ) ?? 0;
    const totalFrames = maxFramesViewed || 1;
    const completedViewers = activity?.viewers.filter(
      (v) => v.viewedFrameCount >= totalFrames
    ).length ?? 0;
    const completionRate = viewerCount > 0
      ? Math.round((completedViewers / viewerCount) * 100)
      : 0;

    // Engagement rate: (reactions + replies) / viewers * 100
    const engagementRate = viewerCount > 0
      ? Math.round((totalEngagement / viewerCount) * 1000) / 10 // 1 decimal place
      : 0;

    return { viewerCount, reactionCount, replyCount, totalEngagement, completionRate, totalFrames, engagementRate };
  }, [activity]);

  const tabs = [
    { key: 'viewers' as const, label: 'Views', count: summary.viewerCount, icon: 'eye-outline' as const },
    { key: 'reactions' as const, label: 'Reactions', count: summary.reactionCount, icon: 'heart-outline' as const },
    { key: 'replies' as const, label: 'Replies', count: summary.replyCount, icon: 'chatbubble-outline' as const },
  ];

  const renderViewer = ({ item }: { item: ActivityData['viewers'][0] }) => (
    <View style={styles.row} accessibilityLabel={`@${item.username ?? item.userId} viewed ${item.viewedFrameCount} frame${item.viewedFrameCount !== 1 ? 's' : ''}`}>
      {item.avatar ? (
        <CachedImage
          uri={item.avatar}
          style={styles.avatar}
          containerStyle={{ borderRadius: Radius.full, overflow: 'hidden' }}
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
          {item.viewedFrameCount} frame{item.viewedFrameCount !== 1 ? 's' : ''} viewed
        </Text>
      </View>
      <Text style={styles.rowTime}>
        {formatRelativeTime(item.latestViewedAt)}
      </Text>
    </View>
  );

  const renderReaction = ({ item }: { item: ActivityData['reactions'][0] }) => (
    <View style={styles.row} accessibilityLabel={`@${item.username ?? item.userId} reacted ${REACTION_LABELS[item.reaction] ?? item.reaction}`}>
      {item.avatar ? (
        <CachedImage
          uri={item.avatar}
          style={styles.avatar}
          containerStyle={{ borderRadius: Radius.full, overflow: 'hidden' }}
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
      <Text style={styles.reactionEmoji}>{REACTION_EMOJI[item.reaction] ?? '👍'}</Text>
    </View>
  );

  const renderReply = ({ item }: { item: ActivityData['replies'][0] }) => (
    <View style={styles.row} accessibilityLabel={`@${item.authorUsername ?? item.authorId} replied: ${item.body}`}>
      {item.authorAvatar ? (
        <CachedImage
          uri={item.authorAvatar}
          style={styles.avatar}
          containerStyle={{ borderRadius: Radius.full, overflow: 'hidden' }}
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
        {formatRelativeTime(item.createdAt)}
      </Text>
    </View>
  );

  // ── Summary header card ──────────────────────────────────────────────
  // Instagram/Snapchat pattern: a compact metrics summary at the top of the
  // activity screen showing total views, reactions, replies, and completion
  // rate at a glance.
  const renderSummaryHeader = () => {
    if (!activity) return null;
    return (
      <View style={styles.summaryCard} accessibilityLabel={`Story summary: ${summary.viewerCount} viewers, ${summary.reactionCount} reactions, ${summary.replyCount} replies, ${summary.engagementRate}% engagement rate, ${summary.completionRate}% completion`}>
        <View style={styles.summaryMetric}>
          <Text style={styles.summaryMetricValue}>{summary.viewerCount}</Text>
          <Text style={styles.summaryMetricLabel}>Viewers</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryMetric}>
          <Text style={styles.summaryMetricValue}>{summary.reactionCount}</Text>
          <Text style={styles.summaryMetricLabel}>Reactions</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryMetric}>
          <Text style={styles.summaryMetricValue}>{summary.replyCount}</Text>
          <Text style={styles.summaryMetricLabel}>Replies</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryMetric}>
          <Text style={styles.summaryMetricValue}>{summary.engagementRate}%</Text>
          <Text style={styles.summaryMetricLabel}>Engagement</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryMetric}>
          <Text style={styles.summaryMetricValue}>{summary.completionRate}%</Text>
          <Text style={styles.summaryMetricLabel}>Completion</Text>
        </View>
      </View>
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <View style={styles.topBar}>
          <AnimatedPressable
            onPress={() => navigation.goBack()}
            style={styles.iconBtn}
            activeOpacity={0.7}
            scaleValue={0.97}
            hapticFeedback="light"
            accessibilityLabel="Back"
            accessibilityHint="Returns to the previous screen"
            accessibilityRole="button"
          >
            <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
          </AnimatedPressable>
          <Text style={styles.topTitle}>Story Activity</Text>
          <View style={styles.iconBtn} />
        </View>
        {/* Skeleton summary card */}
        <View style={styles.summaryCard}>
          {[0, 1, 2, 3].map((i) => (
            <React.Fragment key={i}>
              <View style={styles.summaryMetric}>
                <SkeletonLoader width={32} height={Type.title.size} borderRadius={Radius.sm} />
                <SkeletonLoader width={48} height={Type.caption.size} borderRadius={Radius.sm} style={{ marginTop: Space.xs - 2 }} />
              </View>
              {i < 3 && <View style={styles.summaryDivider} />}
            </React.Fragment>
          ))}
        </View>
        {/* Skeleton tab bar */}
        <View style={styles.tabBar}>
          {tabs.map((tab) => (
            <View key={tab.key} style={styles.tab}>
              <SkeletonLoader width={48} height={Type.body.size} borderRadius={Radius.sm} />
            </View>
          ))}
        </View>
        {/* Skeleton rows — 5 rows matching the row layout */}
        <View style={styles.listContent}>
          {[0, 1, 2, 3, 4].map((i) => (
            <View key={i} style={styles.row}>
              <SkeletonLoader width={AVATAR_SIZE} height={AVATAR_SIZE} borderRadius={AVATAR_SIZE / 2} />
              <View style={styles.rowContent}>
                <SkeletonLoader width="50%" height={Type.body.size} borderRadius={Radius.sm} />
                <SkeletonLoader width="70%" height={Type.caption.size} borderRadius={Radius.sm} style={{ marginTop: Space.xs - 2 }} />
              </View>
              <SkeletonLoader width={28} height={Type.caption.size} borderRadius={Radius.sm} />
            </View>
          ))}
        </View>
      </SafeAreaView>
    );
  }

  if (loadError && !activity) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <View style={styles.topBar}>
          <AnimatedPressable
            onPress={() => navigation.goBack()}
            style={styles.iconBtn}
            activeOpacity={0.7}
            scaleValue={0.97}
            hapticFeedback="light"
            accessibilityLabel="Back"
            accessibilityHint="Returns to the previous screen"
            accessibilityRole="button"
          >
            <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
          </AnimatedPressable>
          <Text style={styles.topTitle}>Story Activity</Text>
          <View style={styles.iconBtn} />
        </View>
        <View style={styles.errorBody}>
          <View style={styles.errorIconWrap}>
            <Ionicons name="cloud-offline-outline" size={36} color={colors.textMuted} />
          </View>
          <Text style={styles.errorTitle}>Could not load activity</Text>
          <Text style={styles.errorHint}>Check your connection and try again.</Text>
          <AnimatedPressable
            onPress={() => loadActivity()}
            style={styles.retryBtn}
            activeOpacity={0.8}
            scaleValue={0.97}
            hapticFeedback="light"
            accessibilityLabel="Refresh activity"
            accessibilityHint="Reloads story activity data"
            accessibilityRole="button"
          >
            <Ionicons name="refresh-outline" size={18} color={colors.textInverse} />
            <Text style={styles.retryBtnText}>Try again</Text>
          </AnimatedPressable>
        </View>
      </SafeAreaView>
    );
  }

  // ── Full empty state: activity loaded but completely empty ──
  const hasAnyActivity = activity && (
    (activity.viewers?.length ?? 0) > 0 ||
    (activity.reactions?.length ?? 0) > 0 ||
    (activity.replies?.length ?? 0) > 0
  );

  if (activity && !hasAnyActivity) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <View style={styles.topBar}>
          <AnimatedPressable
            onPress={() => navigation.goBack()}
            style={styles.iconBtn}
            activeOpacity={0.7}
            scaleValue={0.97}
            hapticFeedback="light"
            accessibilityLabel="Back"
            accessibilityHint="Returns to the previous screen"
            accessibilityRole="button"
          >
            <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
          </AnimatedPressable>
          <Text style={styles.topTitle}>Story Activity</Text>
          <View style={styles.iconBtn} />
        </View>
        <View style={styles.emptyBody}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="bar-chart-outline" size={56} color={colors.textMuted} />
          </View>
          <Text style={styles.emptyTitle}>No activity yet</Text>
          <Text style={styles.emptyHint}>When people view and interact with your story, you'll see them here.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const currentData: ActivityItem[] = activeTab === 'viewers' ? activity?.viewers ?? []
    : activeTab === 'reactions' ? activity?.reactions ?? []
    : activity?.replies ?? [];

  const emptyIcon = activeTab === 'viewers' ? 'eye-outline' : activeTab === 'reactions' ? 'heart-outline' : 'chatbubble-outline';
  const emptyLabel = activeTab === 'viewers' ? 'No views yet' : activeTab === 'reactions' ? 'No reactions yet' : 'No replies yet';
  const emptyHint = activeTab === 'viewers' ? 'Views will appear here once people watch your story.' : activeTab === 'reactions' ? 'Reactions will appear here as people react.' : 'Replies will appear here as people reply.';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View style={styles.topBar}>
        <AnimatedPressable
          onPress={() => navigation.goBack()}
          style={styles.iconBtn}
          activeOpacity={0.7}
          scaleValue={0.97}
          hapticFeedback="light"
          accessibilityLabel="Back"
          accessibilityHint="Returns to the previous screen"
          accessibilityRole="button"
        >
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </AnimatedPressable>
        <Text style={styles.topTitle}>Story Activity</Text>
        <View style={styles.iconBtn} />
      </View>

      {renderSummaryHeader()}

      <View style={styles.tabBar}>
        {tabs.map((tab) => (
          <AnimatedPressable
            key={tab.key}
            onPress={() => handleTabPress(tab.key)}
            onLayout={(e) => handleTabLayout(tab.key, e)}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            scaleValue={0.97}
            hapticFeedback="selection"
            activeOpacity={0.85}
            accessibilityLabel={`${tab.label} (${tab.count})`}
            accessibilityHint={`Switches to ${tab.label} view`}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === tab.key }}
          >
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
              {tab.label}
            </Text>
            {tab.count > 0 && (
              <View style={[styles.tabBadge, activeTab === tab.key && styles.tabBadgeActive]}>
                <Text style={[styles.tabBadgeText, activeTab === tab.key && styles.tabBadgeTextActive]}>
                  {tab.count}
                </Text>
              </View>
            )}
          </AnimatedPressable>
        ))}
        {/* Animated spring-based tab indicator */}
        <Reanimated.View style={[styles.tabIndicator, animatedIndicatorStyle]} pointerEvents="none" />
      </View>

      <FlashList
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
        ListHeaderComponent={
          activity && (summary.reactionCount > 0 || summary.replyCount > 0) ? (
            <View style={styles.frameBreakdown}>
              <Text style={styles.frameBreakdownTitle}>Per-frame engagement</Text>
              {/* Combine reactions and replies by frameId for a unified view */}
              {Object.entries(
                [...activity.reactions, ...activity.replies].reduce<Record<string, { reactions: number; replies: number }>>((acc, item) => {
                  const fid = 'frameId' in item ? item.frameId : '';
                  if (!acc[fid]) acc[fid] = { reactions: 0, replies: 0 };
                  if ('reaction' in item) acc[fid].reactions += 1;
                  else acc[fid].replies += 1;
                  return acc;
                }, {})
              )
                .map(([frameId, counts]) => ({
                  frameId,
                  total: counts.reactions + counts.replies,
                  reactions: counts.reactions,
                  replies: counts.replies,
                }))
                .sort((a, b) => b.total - a.total)
                .slice(0, 5)
                .map((entry, i) => (
                  <View key={entry.frameId} style={styles.frameBreakdownRow}>
                    <Text style={styles.frameBreakdownLabel}>Frame {i + 1}</Text>
                    <View style={styles.frameBreakdownBar}>
                      <View
                        style={[
                          styles.frameBreakdownBarFill,
                          {
                            width: `${Math.min(100, (entry.total / Math.max(summary.totalEngagement, 1)) * 100)}%`,
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.frameBreakdownCount}>{entry.total}</Text>
                  </View>
                ))}
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.emptyBody}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name={emptyIcon} size={56} color={colors.textMuted} />
            </View>
            <Text style={styles.emptyTitle}>{emptyLabel}</Text>
            <Text style={styles.emptyHint}>{emptyHint}</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────
function formatRelativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMin = Math.max(0, Math.floor((now - then) / 60000));
  if (diffMin < 1) return 'now';
  if (diffMin < 60) return `${diffMin}m`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
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
      paddingVertical: Space.sm + 2,
    },
    topTitle: {
      fontSize: Type.subtitle.size,
      fontFamily: Typography.family.bold,
      color: colors.textPrimary,
      letterSpacing: Type.subtitle.letterSpacing,
    },
    iconBtn: {
      width: Control.hit,
      height: Control.hit,
      borderRadius: Radius.full,
      justifyContent: 'center',
      alignItems: 'center',
    },
    loadingBody: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    // ── Summary header card ────────────────────────────────────────────
    summaryCard: {
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: Space.md,
      marginBottom: Space.sm,
      padding: Space.md,
      borderRadius: Radius.lg,
      backgroundColor: colors.surfaceElevated,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 8,
      elevation: 2,
    },
    summaryMetric: {
      flex: 1,
      alignItems: 'center',
      gap: Space.xs - 2,
    },
    summaryMetricValue: {
      fontSize: Type.title.size,
      fontFamily: Typography.family.bold,
      color: colors.textPrimary,
      fontVariant: ['tabular-nums'],
    },
    summaryMetricLabel: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.medium,
      color: colors.textMuted,
      letterSpacing: 0.5,
    },
    summaryDivider: {
      width: StyleSheet.hairlineWidth,
      height: Space.xl,
      backgroundColor: colors.border,
    },
    // ── Per-frame breakdown ─────────────────────────────────────────────
    frameBreakdown: {
      paddingHorizontal: Space.md,
      paddingVertical: Space.md,
      gap: Space.sm,
    },
    frameBreakdownTitle: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.semibold,
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    frameBreakdownRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
    },
    frameBreakdownLabel: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.medium,
      color: colors.textSecondary,
      width: 60,
    },
    frameBreakdownBar: {
      flex: 1,
      height: 6,
      borderRadius: Radius.sm,
      backgroundColor: colors.surfaceAlt,
      overflow: 'hidden',
    },
    frameBreakdownBarFill: {
      height: '100%',
      borderRadius: Radius.sm,
      backgroundColor: colors.brand,
    },
    frameBreakdownCount: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.bold,
      color: colors.textPrimary,
      fontVariant: ['tabular-nums'],
      minWidth: 24,
      textAlign: 'right',
    },
    // ── Tabs ───────────────────────────────────────────────────────────
    // Flat underline tabs — no card-on-card. Active tab gets a brand-colored
    // underline indicator; inactive tabs are plain text on the screen background.
    tabBar: {
      flexDirection: 'row',
      paddingHorizontal: Space.md,
      paddingBottom: 0,
      gap: Space.lg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    tab: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingVertical: Space.sm + 2,
      borderBottomWidth: Stroke.standard,
      borderBottomColor: 'transparent',
    },
    tabActive: {
      borderBottomColor: colors.brand,
    },
    tabIndicator: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      height: 3,
      backgroundColor: colors.brand,
      borderRadius: 1.5,
    },
    tabText: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.semibold,
      color: colors.textSecondary,
    },
    tabTextActive: {
      color: colors.textPrimary,
    },
    tabBadge: {
      backgroundColor: colors.surfaceAlt,
      borderRadius: Radius.md,
      paddingHorizontal: Space.xs + 2,
      paddingVertical: Space.xs - 3,
      minWidth: Space.md,
      alignItems: 'center',
    },
    tabBadgeActive: {
      backgroundColor: colors.brand,
    },
    tabBadgeText: {
      color: colors.textSecondary,
      fontSize: Type.meta.size,
      fontFamily: Typography.family.bold,
    },
    tabBadgeTextActive: {
      color: '#fff',
    },
    // ── List ───────────────────────────────────────────────────────────
    listContent: {
      paddingBottom: Space.xl,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingVertical: Space.sm,
      paddingHorizontal: Space.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderSubtle,
    },
    avatar: {
      width: AVATAR_SIZE,
      height: AVATAR_SIZE,
      borderRadius: AVATAR_SIZE / 2,
      justifyContent: 'center',
      alignItems: 'center',
    },
    avatarPlaceholder: {
      backgroundColor: colors.surfaceAlt,
    },
    avatarText: {
      color: colors.textSecondary,
      fontFamily: Typography.family.bold,
      fontSize: Type.bodyLarge.size,
    },
    rowContent: {
      flex: 1,
      gap: Space.xs - 2,
    },
    rowTitle: {
      fontSize: Type.bodyEmphasis.size,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
    },
    rowSubtitle: {
      fontSize: Type.captionElevated.size,
      fontFamily: Typography.family.regular,
      color: colors.textSecondary,
    },
    rowTime: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.medium,
      color: colors.textMuted,
    },
    reactionEmoji: {
      fontSize: 20,
      lineHeight: 24,
    },
    // ── Empty state ────────────────────────────────────────────────────
    emptyBody: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: Space.xxl,
      gap: Space.sm,
    },
    emptyIconWrap: {
      width: Space.xxl + Space.sm,
      height: Space.xxl + Space.sm,
      borderRadius: Radius.full,
      backgroundColor: colors.surfaceAlt,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: Space.xs,
    },
    emptyTitle: {
      fontSize: Type.bodyLarge.size,
      fontFamily: Typography.family.semibold,
      color: colors.textSecondary,
    },
    emptyHint: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.regular,
      color: colors.textMuted,
      textAlign: 'center',
      paddingHorizontal: Space.xl,
    },
    // ── Error state ────────────────────────────────────────────────────
    errorBody: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: Space.sm,
      paddingHorizontal: Space.xl,
    },
    errorIconWrap: {
      width: Space.xxl + Space.sm,
      height: Space.xxl + Space.sm,
      borderRadius: Radius.full,
      backgroundColor: colors.surfaceAlt,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: Space.xs,
    },
    errorTitle: {
      fontSize: Type.bodyEmphasis.size,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
    },
    errorHint: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      color: colors.textMuted,
      textAlign: 'center',
    },
    retryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs + 2,
      paddingHorizontal: Space.md + 4,
      paddingVertical: Space.sm,
      borderRadius: Radius.full,
      backgroundColor: colors.brand,
      marginTop: Space.xs,
    },
    retryBtnText: {
      color: colors.textInverse,
      fontFamily: Typography.family.semibold,
      fontSize: Type.body.size,
    },
  });
}
