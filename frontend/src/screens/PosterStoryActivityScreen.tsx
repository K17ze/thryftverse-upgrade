import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  RefreshControl,
  LayoutChangeEvent,
  AccessibilityInfo } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  type SharedValue } from 'react-native-reanimated';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { Space, Radius, Typography, Control, Stroke, LetterSpacing, Elevation } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { useHaptic } from '../hooks/useHaptic';
import { useMotionConfig } from '../hooks/useMotionConfig';
import { useReducedMotion } from '../hooks/useReducedMotion';
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
  laugh: '😂' };

const REACTION_LABELS: Record<string, string> = {
  love: 'Love',
  fire: 'Fire',
  style: 'Style',
  want: 'Want',
  wow: 'Wow',
  laugh: 'Laugh' };

type ActivityItem = ActivityData['viewers'][0] | ActivityData['reactions'][0] | ActivityData['replies'][0] | ActivityData['styleVotes'][0];

const AVATAR_SIZE = 44;

type HourlyActivity = { hour: number; count: number };

const HOUR_LABELS = ['12a', '6a', '12p', '6p'];
const HOUR_LABEL_HOURS = [0, 6, 12, 18];
const BAR_WIDTH = 4;
const BAR_GAP = 2;
const BAR_MAX_HEIGHT = 60;

function formatHourLabel(hour: number): string {
  if (hour === 0) return '12am';
  if (hour === 12) return '12pm';
  return hour < 12 ? `${hour}am` : `${hour - 12}pm`;
}

// ── Peak time bar ──────────────────────────────────────────────────────
// A single animated bar in the peak-time chart. Height grows from 0 to
// its target via the shared `progress` value (spring-animated on mount
// unless reduced motion is enabled, in which case progress starts at 1).
function PeakTimeBar({
  targetHeight,
  isPeak,
  color,
  peakColor,
  progress }: {
  targetHeight: number;
  isPeak: boolean;
  color: string;
  peakColor: string;
  progress: SharedValue<number>;
}) {
  const animatedStyle = useAnimatedStyle(() => ({
    height: progress.value * targetHeight }));

  return (
    <Reanimated.View
      style={[
        { width: BAR_WIDTH, borderRadius: BAR_WIDTH / 2, backgroundColor: isPeak ? peakColor : color },
        animatedStyle,
      ]}
    />
  );
}

// ── Peak time chart ────────────────────────────────────────────────────
// Instagram-style horizontal bar chart showing engagement activity
// (views + reactions + replies + style votes) grouped by hour of day.
// Flat canvas — no card, just padding. Peak hour(s) use antiqueGold.
function PeakTimeChart({
  data,
  colors,
  styles }: {
  data: HourlyActivity[];
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}) {
  const reducedMotion = useReducedMotion();
  const { spring } = useMotionConfig();
  const progress = useSharedValue(reducedMotion ? 1 : 0);

  useEffect(() => {
    if (!reducedMotion) {
      progress.value = withSpring(1, spring.entrance);
    }
  }, [reducedMotion, spring.entrance, progress]);

  const maxCount = Math.max(...data.map((d) => d.count), 1);
  const peakCount = Math.max(...data.map((d) => d.count));
  const peakHours = data
    .filter((d) => d.count === peakCount && peakCount > 0)
    .map((d) => d.hour);
  const peakHour = peakHours[0];

  const barColor = colors.brandSubtle; // 40% opacity
  const peakColor = colors.antiqueGold;

  return (
    <View
      style={styles.peakTimeSection}
      accessibilityLabel="Peak times chart showing when your audience is most active by hour"
    >
      <Text style={styles.peakTimeLabel}>Peak times</Text>
      <View style={styles.peakTimeBars}>
        {data.map((entry) => {
          const targetHeight = Math.max(
            entry.count > 0 ? 3 : 0,
            (entry.count / maxCount) * BAR_MAX_HEIGHT
          );
          return (
            <PeakTimeBar
              key={entry.hour}
              targetHeight={targetHeight}
              isPeak={peakHours.includes(entry.hour)}
              color={barColor}
              peakColor={peakColor}
              progress={progress}
            />
          );
        })}
      </View>
      <View style={styles.peakTimeHourLabels}>
        {HOUR_LABELS.map((label) => (
          <Text key={label} style={styles.peakTimeHourText}>
            {label}
          </Text>
        ))}
      </View>
      {peakHour !== undefined && (
        <Text style={styles.peakTimeCaption}>
          Most active at {formatHourLabel(peakHour)}
        </Text>
      )}
    </View>
  );
}

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
  const [activeTab, setActiveTab] = useState<'viewers' | 'reactions' | 'replies' | 'stickers'>('viewers');

  // ── Animated tab indicator ──
  // Spring-based underline that slides between tabs using Motion.spring.entrance.
  const tabIndicatorX = useSharedValue(0);
  const tabIndicatorW = useSharedValue(0);
  const tabLayoutsRef = useRef<Record<string, { x: number; width: number }>>({});

  const animatedIndicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tabIndicatorX.value }],
    width: tabIndicatorW.value }));

  const handleTabLayout = useCallback((key: string, e: LayoutChangeEvent) => {
    tabLayoutsRef.current[key] = {
      x: e.nativeEvent.layout.x,
      width: e.nativeEvent.layout.width };
    if (key === activeTab) {
      tabIndicatorX.value = withSpring(e.nativeEvent.layout.x, spring.entrance);
      tabIndicatorW.value = withSpring(e.nativeEvent.layout.width, spring.entrance);
    }
  }, [activeTab, spring.entrance, tabIndicatorX, tabIndicatorW]);

  const handleTabPress = useCallback((key: 'viewers' | 'reactions' | 'replies' | 'stickers') => {
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

    const stickerVoteCount = activity?.styleVotes.length ?? 0;

    return { viewerCount, reactionCount, replyCount, totalEngagement, completionRate, totalFrames, engagementRate, stickerVoteCount };
  }, [activity]);

  // ── Hourly activity distribution ──────────────────────────────────────
  // Groups all engagement events (views + reactions + replies + style votes)
  // by hour of day (0-23) for the peak-time chart.
  const hourlyActivity = useMemo<HourlyActivity[]>(() => {
    const counts = new Array(24).fill(0);
    if (activity) {
      activity.viewers.forEach((v) => {
        counts[new Date(v.latestViewedAt).getHours()] += 1;
      });
      activity.reactions.forEach((r) => {
        counts[new Date(r.createdAt).getHours()] += 1;
      });
      activity.replies.forEach((r) => {
        counts[new Date(r.createdAt).getHours()] += 1;
      });
      activity.styleVotes.forEach((s) => {
        counts[new Date(s.createdAt).getHours()] += 1;
      });
    }
    return counts.map((count, hour) => ({ hour, count }));
  }, [activity]);

  const tabs = [
    { key: 'viewers' as const, label: 'Views', count: summary.viewerCount, icon: 'eye-outline' as const },
    { key: 'reactions' as const, label: 'Reactions', count: summary.reactionCount, icon: 'heart-outline' as const },
    { key: 'replies' as const, label: 'Replies', count: summary.replyCount, icon: 'chatbubble-outline' as const },
    { key: 'stickers' as const, label: 'Stickers', count: summary.stickerVoteCount, icon: 'stats-chart-outline' as const },
  ];

  // FlashList v2 performance: memoized render functions prevent full
  // re-render of all visible activity rows on every parent state change.
  // (Audit §FlashList v2 / LIST_RENDERING_POLICY.md §3.1)
  const renderViewer = useCallback(({ item }: { item: ActivityData['viewers'][0] }) => (
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
  ), [styles, formatRelativeTime]);

  const renderReaction = useCallback(({ item }: { item: ActivityData['reactions'][0] }) => (
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
  ), [styles]);

  const renderReply = useCallback(({ item }: { item: ActivityData['replies'][0] }) => (
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
  ), [styles, formatRelativeTime]);

  // ── Sticker engagement render ────────────────────────────────────────
  // Renders style vote entries (avatar + username + selected option).
  // Poll and quiz results are aggregated in the header component below.
  const renderStyleVote = useCallback(({ item }: { item: ActivityData['styleVotes'][0] }) => (
    <View style={styles.row} accessibilityLabel={`@${item.username ?? item.userId} voted in a style vote`}>
      <View style={[styles.avatar, styles.avatarPlaceholder, styles.voteAvatar]}>
        <Ionicons name="stats-chart-outline" size={18} color={colors.textSecondary} />
      </View>
      <View style={styles.rowContent}>
        <Text style={styles.rowTitle}>@{item.username ?? item.userId}</Text>
        <Text style={styles.rowSubtitle}>voted in a style poll</Text>
      </View>
      <Text style={styles.rowTime}>
        {formatRelativeTime(item.createdAt)}
      </Text>
    </View>
  ), [styles, colors, formatRelativeTime]);

  // FlashList v2 performance: memoized renderItem dispatches to the
  // memoized render functions above, preventing full re-render of all
  // visible activity rows on every parent state change.
  const renderActivityItem = useCallback(({ item }: { item: ActivityItem; index: number }) => {
    if ('viewedFrameCount' in item) return renderViewer({ item });
    if ('reaction' in item) return renderReaction({ item });
    if ('optionId' in item && 'stickerId' in item) return renderStyleVote({ item });
    return renderReply({ item });
  }, [renderViewer, renderReaction, renderReply, renderStyleVote]);

  // ── Summary header card ──────────────────────────────────────────────
  // A compact metrics summary at the top of the
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
                <SkeletonLoader width={32} height={TypographyV2.screenTitle.size} borderRadius={Radius.sm} />
                <SkeletonLoader width={48} height={TypographyV2.meta.size} borderRadius={Radius.sm} style={{ marginTop: Space.xs - 2 }} />
              </View>
              {i < 3 && <View style={styles.summaryDivider} />}
            </React.Fragment>
          ))}
        </View>
        {/* Skeleton tab bar */}
        <View style={styles.tabBar}>
          {tabs.map((tab) => (
            <View key={tab.key} style={styles.tab}>
              <SkeletonLoader width={48} height={TypographyV2.body.size} borderRadius={Radius.sm} />
            </View>
          ))}
        </View>
        {/* Skeleton rows — 5 rows matching the row layout */}
        <View style={styles.listContent}>
          {[0, 1, 2, 3, 4].map((i) => (
            <View key={i} style={styles.row}>
              <SkeletonLoader width={AVATAR_SIZE} height={AVATAR_SIZE} borderRadius={AVATAR_SIZE / 2} />
              <View style={styles.rowContent}>
                <SkeletonLoader width="50%" height={TypographyV2.body.size} borderRadius={Radius.sm} />
                <SkeletonLoader width="70%" height={TypographyV2.meta.size} borderRadius={Radius.sm} style={{ marginTop: Space.xs - 2 }} />
              </View>
              <SkeletonLoader width={28} height={TypographyV2.meta.size} borderRadius={Radius.sm} />
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
    (activity.replies?.length ?? 0) > 0 ||
    (activity.styleVotes?.length ?? 0) > 0
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
    : activeTab === 'stickers' ? activity?.styleVotes ?? []
    : activity?.replies ?? [];

  const emptyIcon = activeTab === 'viewers' ? 'eye-outline' : activeTab === 'reactions' ? 'heart-outline' : activeTab === 'stickers' ? 'stats-chart-outline' : 'chatbubble-outline';
  const emptyLabel = activeTab === 'viewers' ? 'No views yet' : activeTab === 'reactions' ? 'No reactions yet' : activeTab === 'stickers' ? 'No sticker interactions yet' : 'No replies yet';
  const emptyHint = activeTab === 'viewers' ? 'Views will appear here once people watch your story.' : activeTab === 'reactions' ? 'Reactions will appear here as people react.' : activeTab === 'stickers' ? 'Poll votes, quiz answers, and question responses will appear here.' : 'Replies will appear here as people reply.';

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

      {hourlyActivity.some((d) => d.count > 0) && (
        <PeakTimeChart data={hourlyActivity} colors={colors} styles={styles} />
      )}

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
        renderItem={renderActivityItem}
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
                  replies: counts.replies }))
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
                            width: `${Math.min(100, (entry.total / Math.max(summary.totalEngagement, 1)) * 100)}%` },
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
      backgroundColor: colors.background },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Space.sm,
      paddingVertical: Space.sm + 2 },
    topTitle: {
      fontSize: TypographyV2.sectionTitle.size,
      fontFamily: TypographyV2.sectionTitle.fontFamily,
      color: colors.textPrimary,
      letterSpacing: TypographyV2.sectionTitle.letterSpacing },
    iconBtn: {
      width: Control.hit,
      height: Control.hit,
      borderRadius: Radius.full,
      justifyContent: 'center',
      alignItems: 'center' },
    loadingBody: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center' },
    // ── Summary header card ────────────────────────────────────────────
    summaryCard: {
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: Space.md,
      marginBottom: Space.sm,
      padding: Space.md,
      borderRadius: Radius.lg,
      backgroundColor: colors.surfaceElevated,
      ...Elevation.card },
    summaryMetric: {
      flex: 1,
      alignItems: 'center',
      gap: Space.xs - 2 },
    summaryMetricValue: {
      fontSize: TypographyV2.screenTitle.size,
      fontFamily: TypographyV2.screenTitle.fontFamily,
      color: colors.textPrimary,
      fontVariant: ['tabular-nums'] },
    summaryMetricLabel: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textMuted,
      letterSpacing: 0.5 },
    summaryDivider: {
      width: StyleSheet.hairlineWidth,
      height: Space.xl,
      backgroundColor: colors.border },
    // ── Peak time chart ──────────────────────────────────────────────────
    // Flat canvas — no card, just padding. Bars sit directly on the screen
    // background (AGENTS.md §4: no card-on-card, flat canvas default).
    peakTimeSection: {
      paddingHorizontal: Space.md,
      paddingTop: Space.sm,
      paddingBottom: Space.md,
      gap: Space.xs },
    peakTimeLabel: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      textTransform: 'uppercase',
      letterSpacing: LetterSpacing.caps + 0.38,
      color: colors.textMuted },
    peakTimeBars: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      height: BAR_MAX_HEIGHT,
      gap: BAR_GAP },
    peakTimeHourLabels: {
      flexDirection: 'row',
      justifyContent: 'space-between' },
    peakTimeHourText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textMuted },
    peakTimeCaption: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textSecondary },
    // ── Per-frame breakdown ─────────────────────────────────────────────
    frameBreakdown: {
      paddingHorizontal: Space.md,
      paddingVertical: Space.md,
      gap: Space.sm },
    frameBreakdownTitle: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5 },
    frameBreakdownRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm },
    frameBreakdownLabel: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textSecondary,
      width: 60 },
    frameBreakdownBar: {
      flex: 1,
      height: 6,
      borderRadius: Radius.sm,
      backgroundColor: colors.surfaceAlt,
      overflow: 'hidden' },
    frameBreakdownBarFill: {
      height: '100%',
      borderRadius: Radius.sm,
      backgroundColor: colors.brand },
    frameBreakdownCount: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textPrimary,
      fontVariant: ['tabular-nums'],
      minWidth: 24,
      textAlign: 'right' },
    // ── Tabs ───────────────────────────────────────────────────────────
    // Flat underline tabs — no card-on-card. Active tab gets a brand-colored
    // underline indicator; inactive tabs are plain text on the screen background.
    tabBar: {
      flexDirection: 'row',
      paddingHorizontal: Space.md,
      paddingBottom: 0,
      gap: Space.lg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border },
    tab: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingVertical: Space.sm + 2,
      borderBottomWidth: Stroke.standard,
      borderBottomColor: 'transparent' },
    tabActive: {
      borderBottomColor: colors.brand },
    tabIndicator: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      height: 3,
      backgroundColor: colors.brand,
      borderRadius: Radius.full },
    tabText: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      color: colors.textSecondary },
    tabTextActive: {
      color: colors.textPrimary },
    tabBadge: {
      backgroundColor: colors.surfaceAlt,
      borderRadius: Radius.md,
      paddingHorizontal: Space.xs + 2,
      paddingVertical: Space.xs - 3,
      minWidth: Space.md,
      alignItems: 'center' },
    tabBadgeActive: {
      backgroundColor: colors.brand },
    tabBadgeText: {
      color: colors.textSecondary,
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily },
    tabBadgeTextActive: {
      color: '#fff' },
    // ── List ───────────────────────────────────────────────────────────
    listContent: {
      paddingBottom: Space.xl },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingVertical: Space.sm,
      paddingHorizontal: Space.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderSubtle },
    avatar: {
      width: AVATAR_SIZE,
      height: AVATAR_SIZE,
      borderRadius: AVATAR_SIZE / 2,
      justifyContent: 'center',
      alignItems: 'center' },
    avatarPlaceholder: {
      backgroundColor: colors.surfaceAlt },
    voteAvatar: {
      backgroundColor: colors.surfaceAlt },
    avatarText: {
      color: colors.textSecondary,
      fontFamily: Typography.family.bold,
      fontSize: TypographyV2.body.size },
    rowContent: {
      flex: 1,
      gap: Space.xs - 2 },
    rowTitle: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      color: colors.textPrimary },
    rowSubtitle: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textSecondary },
    rowTime: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textMuted },
    reactionEmoji: {
      fontSize: 20,
      lineHeight: 24 },
    // ── Empty state ────────────────────────────────────────────────────
    emptyBody: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: Space.xxl,
      gap: Space.sm },
    emptyIconWrap: {
      width: Space.xxl + Space.sm,
      height: Space.xxl + Space.sm,
      borderRadius: Radius.full,
      backgroundColor: colors.surfaceAlt,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: Space.xs },
    emptyTitle: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      color: colors.textSecondary },
    emptyHint: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      color: colors.textMuted,
      textAlign: 'center',
      paddingHorizontal: Space.xl },
    // ── Error state ────────────────────────────────────────────────────
    errorBody: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: Space.sm,
      paddingHorizontal: Space.xl },
    errorIconWrap: {
      width: Space.xxl + Space.sm,
      height: Space.xxl + Space.sm,
      borderRadius: Radius.full,
      backgroundColor: colors.surfaceAlt,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: Space.xs },
    errorTitle: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      color: colors.textPrimary },
    errorHint: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textMuted,
      textAlign: 'center' },
    retryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs + 2,
      paddingHorizontal: Space.md + 4,
      paddingVertical: Space.sm,
      borderRadius: Radius.full,
      backgroundColor: colors.brand,
      marginTop: Space.xs },
    retryBtnText: {
      color: colors.textInverse,
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.body.size } });
}
