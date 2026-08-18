import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { useSharedValue, useAnimatedStyle, withTiming, withDelay, Easing, interpolate } from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import {
  Space,
  Radius,
  Type,
  Typography,
  Control,
  LetterSpacing,
} from '../theme/designTokens';
import { RootStackParamList } from '../navigation/types';
import { FlagshipScreen, FlagshipHeader, FlagshipState } from '../components/flagship';
import { EmptyState } from '../components/EmptyState';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { CommerceDetailOfflineBanner } from '../components/commerce/detail/CommerceDetailOfflineBanner';
import { useConnectivity } from '../hooks/useConnectivity';
import { useHaptic } from '../hooks/useHaptic';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { Motion } from '../theme/motionTokens';
import {
  fetchCreatorAnalyticsSummary,
  fetchCreatorAnalyticsTimeline,
  type CreatorAnalyticsSummary,
  type CreatorAnalyticsTimelinePoint,
} from '../services/creatorAnalyticsApi';

type NavT = NativeStackNavigationProp<RootStackParamList>;

type PeriodKey = '7d' | '30d' | '90d';

const PERIOD_DAYS: Record<PeriodKey, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

// Enable LayoutAnimation for period-switch transitions on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ── Helpers ──────────────────────────────────────────────────────────
function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(n);
}

function formatRate(n: number): string {
  return `${n.toFixed(1)}%`;
}

function formatDelta(n: number): string {
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}%`;
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

// ── Derived types ─────────────────────────────────────────────────────
interface MetricCard {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: string;
  delta: number | null;
}

interface EngagementBar {
  label: string;
  count: number;
  pct: number;
  colorKey: 'brand' | 'success' | 'warning' | 'textSecondary';
}

interface TopContentItem {
  id: string;
  title: string;
  date: string;
  views: number;
  engagementRate: number;
  rank: number;
}

// ── Main screen ───────────────────────────────────────────────────────
export default function CreatorAnalyticsDashboardScreen() {
  const { colors } = useAppTheme();
  const navigation = useNavigation<NavT>();
  const haptic = useHaptic();
  const { isOffline } = useConnectivity();
  const reducedMotionEnabled = useReducedMotion();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [period, setPeriod] = useState<PeriodKey>('30d');
  const [summary, setSummary] = useState<CreatorAnalyticsSummary | null>(null);
  const [previousSummary, setPreviousSummary] = useState<CreatorAnalyticsSummary | null>(null);
  const [timeline, setTimeline] = useState<CreatorAnalyticsTimelinePoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const load = useCallback(async (selectedPeriod: PeriodKey) => {
    setError(null);
    const days = PERIOD_DAYS[selectedPeriod];
    try {
      const [summaryRes, timelineRes] = await Promise.all([
        fetchCreatorAnalyticsSummary(),
        fetchCreatorAnalyticsTimeline({ days }),
      ]);
      if (!mountedRef.current) return;
      setSummary(summaryRes);
      setTimeline(timelineRes.points ?? []);

      // Derive a "previous period" summary from the first half of the timeline
      // so we can show honest deltas without a second API call. If the timeline
      // is too short, deltas are simply omitted (null) — never fabricated.
      const points = timelineRes.points ?? [];
      if (points.length >= 4) {
        const mid = Math.floor(points.length / 2);
        const prevSlice = points.slice(0, mid);
        const prev: CreatorAnalyticsSummary = {
          views: 0, likes: 0, saves: 0, comments: 0, shares: 0,
          productClicks: 0, profileVisits: 0, engagementRate: 0,
        };
        for (const p of prevSlice) {
          prev.views += p.views;
          prev.likes += p.likes;
          prev.saves += p.saves;
          prev.comments += p.comments;
          prev.shares += p.shares;
          prev.productClicks += p.productClicks;
          prev.profileVisits += p.profileVisits;
        }
        const prevEng = prev.views > 0
          ? ((prev.likes + prev.saves + prev.comments + prev.shares) / prev.views) * 100
          : 0;
        prev.engagementRate = prevEng;
        setPreviousSummary(prev);
      } else {
        setPreviousSummary(null);
      }
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : 'Unable to load analytics');
      setSummary(null);
      setTimeline([]);
      setPreviousSummary(null);
    }
  }, []);

  useEffect(() => {
    setIsLoading(true);
    load(period).finally(() => { if (mountedRef.current) setIsLoading(false); });
  }, [load, period]);

  const onRefresh = async () => {
    setIsRefreshing(true);
    await load(period);
    setIsRefreshing(false);
  };

  const onSelectPeriod = (next: PeriodKey) => {
    if (next === period) return;
    haptic.selection();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setPeriod(next);
  };

  // ── Derived: metric cards ───────────────────────────────────────────
  const metrics = useMemo<MetricCard[]>(() => {
    if (!summary) return [];
    const deltaFor = (current: number, prev: number | undefined): number | null => {
      if (prev === undefined || prev === 0) return null;
      return ((current - prev) / prev) * 100;
    };
    return [
      {
        icon: 'eye-outline',
        label: 'Total Views',
        value: formatCount(summary.views),
        delta: deltaFor(summary.views, previousSummary?.views ?? undefined),
      },
      {
        icon: 'heart-outline',
        label: 'Engagement Rate',
        value: formatRate(summary.engagementRate),
        delta: deltaFor(summary.engagementRate, previousSummary?.engagementRate ?? undefined),
      },
      {
        icon: 'person-outline',
        label: 'Profile Visits',
        value: formatCount(summary.profileVisits),
        delta: deltaFor(summary.profileVisits, previousSummary?.profileVisits ?? undefined),
      },
      {
        icon: 'bag-outline',
        label: 'Product Clicks',
        value: formatCount(summary.productClicks),
        delta: deltaFor(summary.productClicks, previousSummary?.productClicks ?? undefined),
      },
    ];
  }, [summary, previousSummary]);

  // ── Derived: engagement breakdown ───────────────────────────────────
  const engagementBars = useMemo<EngagementBar[]>(() => {
    if (!summary) return [];
    const total = summary.likes + summary.saves + summary.comments + summary.shares;
    const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);
    return [
      { label: 'Likes', count: summary.likes, pct: pct(summary.likes), colorKey: 'brand' },
      { label: 'Saves', count: summary.saves, pct: pct(summary.saves), colorKey: 'success' },
      { label: 'Comments', count: summary.comments, pct: pct(summary.comments), colorKey: 'warning' },
      { label: 'Shares', count: summary.shares, pct: pct(summary.shares), colorKey: 'textSecondary' },
    ];
  }, [summary]);

  // ── Derived: top content (from timeline points, honest derivation) ─
  const topContent = useMemo<TopContentItem[]>(() => {
    if (timeline.length === 0) return [];
    // The timeline gives daily aggregates, not per-content. We surface the
    // highest-view days as "top performing periods" — honestly labelled by
    // date. This avoids fabricating per-content IDs the API does not return.
    const sorted = [...timeline]
      .sort((a, b) => b.views - a.views)
      .slice(0, 5);
    return sorted.map((p, i) => ({
      id: p.date,
      title: shortDate(p.date),
      date: p.date,
      views: p.views,
      engagementRate: p.engagementRate,
      rank: i + 1,
    }));
  }, [timeline]);

  // ── Empty detection (honest: all zeros) ─────────────────────────────
  const isEmpty = useMemo(() => {
    if (!summary) return false;
    return (
      summary.views === 0 &&
      summary.likes === 0 &&
      summary.saves === 0 &&
      summary.comments === 0 &&
      summary.shares === 0 &&
      summary.productClicks === 0 &&
      summary.profileVisits === 0
    );
  }, [summary]);

  // ── Period selector ─────────────────────────────────────────────────
  const periodSelector = (
    <View style={styles.periodRow}>
      {(['7d', '30d', '90d'] as PeriodKey[]).map((key) => {
        const active = key === period;
        return (
          <AnimatedPressable
            key={key}
            style={[
              styles.periodChip,
              active && { backgroundColor: colors.textPrimary },
            ]}
            onPress={() => onSelectPeriod(key)}
            accessibilityRole="button"
            accessibilityLabel={`Show last ${PERIOD_DAYS[key]} days`}
            accessibilityState={{ selected: active }}
            hapticFeedback="selection"
            scaleValue={0.94}
          >
            <Text
              style={[
                styles.periodChipText,
                { color: active ? colors.background : colors.textSecondary },
              ]}
            >
              {key}
            </Text>
          </AnimatedPressable>
        );
      })}
    </View>
  );

  // ── Loading skeleton ────────────────────────────────────────────────
  if (isLoading) {
    return (
      <FlagshipScreen
        header={
          <FlagshipHeader
            title="Analytics"
            onBack={() => navigation.goBack()}
            rightAction={periodSelector}
          />
        }
        scrollEnabled={false}
        contentStyle={{ paddingHorizontal: Space.md, paddingTop: Space.md }}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <AnalyticsSkeleton colors={colors} />
        </ScrollView>
      </FlagshipScreen>
    );
  }

  // ── Error state ─────────────────────────────────────────────────────
  if (error && !summary) {
    return (
      <FlagshipScreen
        header={
          <FlagshipHeader
            title="Analytics"
            onBack={() => navigation.goBack()}
            rightAction={periodSelector}
          />
        }
        scrollEnabled={false}
        contentStyle={{ paddingHorizontal: Space.md, paddingTop: Space.md }}
      >
        {isOffline ? <CommerceDetailOfflineBanner isOffline /> : null}
        <FlagshipState
          variant="error"
          title="Couldn't load analytics"
          subtitle={error}
          actionLabel="Retry"
          onAction={() => { haptic.light(); load(period); }}
        />
      </FlagshipScreen>
    );
  }

  // ── Empty state (honest zeros) ──────────────────────────────────────
  if (isEmpty) {
    return (
      <FlagshipScreen
        header={
          <FlagshipHeader
            title="Analytics"
            onBack={() => navigation.goBack()}
            rightAction={periodSelector}
          />
        }
        scrollEnabled={false}
        contentStyle={{ paddingHorizontal: Space.md, paddingTop: Space.md }}
      >
        {isOffline ? <CommerceDetailOfflineBanner isOffline /> : null}
        <EmptyState
          icon="bar-chart-outline"
          title="No analytics data yet"
          subtitle="Publish content to see insights. Views, engagement and profile visits will appear here once your content is live."
          ctaLabel="Create content"
          onCtaPress={() => { haptic.light(); navigation.navigate('CreateCamera', { mode: 'poster' }); }}
        />
      </FlagshipScreen>
    );
  }

  // ── Populated state ─────────────────────────────────────────────────
  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title="Analytics"
          onBack={() => navigation.goBack()}
          rightAction={periodSelector}
        />
      }
      scrollEnabled={false}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
    >
      {isOffline ? (
        <View style={styles.bannerWrap}>
          <CommerceDetailOfflineBanner isOffline />
        </View>
      ) : null}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.brand} />
        }
      >
        {/* ── 1. SUMMARY METRICS — 2x2 grid, dominant ─────────────── */}
        <View
          style={styles.metricsGrid}
        >
          {metrics.map((m, i) => (
            <MetricTile
              key={m.label}
              metric={m}
              colors={colors}
              index={i}
              reducedMotion={reducedMotionEnabled}
            />
          ))}
        </View>

        {/* ── 2. ENGAGEMENT BREAKDOWN — horizontal bars ───────────── */}
        <View
          style={styles.section}
        >
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              Engagement breakdown
            </Text>
            <Text style={[styles.sectionCaption, { color: colors.textMuted }]}>
              Last {PERIOD_DAYS[period]} days
            </Text>
          </View>
          <View style={styles.breakdownWrap}>
            {engagementBars.map((bar, i) => (
              <EngagementBarRow
                key={bar.label}
                bar={bar}
                colors={colors}
                index={i}
                reducedMotion={reducedMotionEnabled}
              />
            ))}
          </View>
        </View>

        {/* ── 3. TIMELINE — daily views bar chart ─────────────────── */}
        <View
          style={styles.section}
        >
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              Views over time
            </Text>
            <Text style={[styles.sectionCaption, { color: colors.textMuted }]}>
              {timeline.length} day{timeline.length === 1 ? '' : 's'}
            </Text>
          </View>
          <TimelineChart
            points={timeline}
            colors={colors}
            reducedMotion={reducedMotionEnabled}
          />
        </View>

        {/* ── 4. TOP CONTENT — derived from timeline ──────────────── */}
        <View
          style={styles.section}
        >
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              Top performing days
            </Text>
          </View>
          {topContent.length > 0 ? (
            <View style={styles.topList}>
              {topContent.map((item) => (
                <TopContentRow
                  key={item.id}
                  item={item}
                  colors={colors}
                />
              ))}
            </View>
          ) : (
            <Text style={[styles.inlineEmpty, { color: colors.textMuted }]}>
              No timeline data for this period.
            </Text>
          )}
        </View>

        <View style={{ height: Space.xl }} />
      </ScrollView>
    </FlagshipScreen>
  );
}

// ── Metric tile ───────────────────────────────────────────────────────
function MetricTile({
  metric,
  colors,
  index,
  reducedMotion,
}: {
  metric: MetricCard;
  colors: ThemeColors;
  index: number;
  reducedMotion: boolean;
}) {
  const styles = useMemo(() => createMetricTileStyles(colors), [colors]);
  const progress = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) {
      progress.value = 1;
    } else {
      progress.value = withDelay(index * 60, withTiming(1, { duration: Motion.duration.slower, easing: Easing.out(Easing.cubic) }));
    }
  }, [progress, index, reducedMotion]);

  const valueStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0, 1]),
    transform: [{ translateY: interpolate(progress.value, [0, 1], [6, 0]) }],
  }));

  const hasDelta = metric.delta !== null && metric.delta !== 0;
  const deltaUp = (metric.delta ?? 0) > 0;
  const deltaColor = deltaUp ? colors.success : colors.danger;
  const deltaIcon: React.ComponentProps<typeof Ionicons>['name'] = deltaUp
    ? 'arrow-up'
    : 'arrow-down';

  return (
    <View style={styles.tile}>
      <View style={styles.tileTop}>
        <View style={[styles.tileIcon, { backgroundColor: colors.surfaceAlt }]}>
          <Ionicons name={metric.icon} size={18} color={colors.textPrimary} />
        </View>
        {hasDelta ? (
          <View style={styles.deltaRow}>
            <Ionicons name={deltaIcon} size={11} color={deltaColor} />
            <Text style={[styles.deltaText, { color: deltaColor }]}>
              {formatDelta(metric.delta ?? 0)}
            </Text>
          </View>
        ) : null}
      </View>
      <Reanimated.Text style={[styles.tileValue, { color: colors.textPrimary }, valueStyle]}>
        {metric.value}
      </Reanimated.Text>
      <Text style={[styles.tileLabel, { color: colors.textSecondary }]}>
        {metric.label}
      </Text>
    </View>
  );
}

// ── Engagement bar row ────────────────────────────────────────────────
function EngagementBarRow({
  bar,
  colors,
  index,
  reducedMotion,
}: {
  bar: EngagementBar;
  colors: ThemeColors;
  index: number;
  reducedMotion: boolean;
}) {
  const styles = useMemo(() => createEngagementStyles(colors), [colors]);
  const width = useSharedValue(0);

  const barColor =
    bar.colorKey === 'brand' ? colors.brand :
    bar.colorKey === 'success' ? colors.success :
    bar.colorKey === 'warning' ? colors.warning :
    colors.textSecondary;

  useEffect(() => {
    if (reducedMotion) {
      width.value = bar.pct;
    } else {
      width.value = withDelay(index * 80 + 120, withTiming(bar.pct, { duration: Motion.duration.crawl, easing: Easing.out(Easing.cubic) }));
    }
  }, [width, bar.pct, index, reducedMotion]);

  const barStyle = useAnimatedStyle(() => ({
    width: `${interpolate(width.value, [0, 100], [0, 100])}%`,
  }));

  return (
    <View style={styles.barRow}>
      <View style={styles.barLabelRow}>
        <Text style={[styles.barLabel, { color: colors.textPrimary }]}>{bar.label}</Text>
        <View style={styles.barMetaRow}>
          <Text style={[styles.barCount, { color: colors.textSecondary }]}>
            {formatCount(bar.count)}
          </Text>
          <Text style={[styles.barPct, { color: colors.textMuted }]}>
            {bar.pct.toFixed(1)}%
          </Text>
        </View>
      </View>
      <View style={[styles.barTrack, { backgroundColor: colors.surfaceAlt }]}>
        <Reanimated.View style={[styles.barFill, { backgroundColor: barColor }, barStyle]} />
      </View>
    </View>
  );
}

// ── Timeline chart (View-based bar chart) ─────────────────────────────
function TimelineChart({
  points,
  colors,
  reducedMotion,
}: {
  points: CreatorAnalyticsTimelinePoint[];
  colors: ThemeColors;
  reducedMotion: boolean;
}) {
  const styles = useMemo(() => createTimelineStyles(colors), [colors]);
  const progress = useSharedValue(0);

  const maxViews = useMemo(() => {
    if (points.length === 0) return 0;
    return Math.max(...points.map((p) => p.views), 1);
  }, [points]);

  useEffect(() => {
    if (reducedMotion) {
      progress.value = 1;
    } else {
      progress.value = withTiming(1, { duration: Motion.duration.crawl, easing: Easing.out(Easing.cubic) });
    }
  }, [progress, reducedMotion, points.length]);

  // Choose a label interval so labels don't collide. For 7d: every day,
  // 30d: every ~5th, 90d: every ~15th.
  const labelInterval = useMemo(() => {
    if (points.length <= 7) return 1;
    if (points.length <= 30) return Math.ceil(points.length / 6);
    return Math.ceil(points.length / 6);
  }, [points.length]);

  if (points.length === 0) {
    return (
      <Text style={[styles.inlineEmpty, { color: colors.textMuted }]}>
        No timeline data for this period.
      </Text>
    );
  }

  return (
    <View style={styles.chartWrap}>
      <View style={styles.chartBars}>
        {points.map((p, i) => {
          const heightPct = maxViews > 0 ? (p.views / maxViews) * 100 : 0;
          const showLabel = i % labelInterval === 0 || i === points.length - 1;
          return (
            <TimelineBar
              key={p.date}
              heightPct={heightPct}
              showLabel={showLabel}
              label={shortDate(p.date)}
              colors={colors}
              index={i}
              reducedMotion={reducedMotion}
            />
          );
        })}
      </View>
      {/* Baseline */}
      <View style={[styles.baseline, { backgroundColor: colors.border }]} />
    </View>
  );
}

function TimelineBar({
  heightPct,
  showLabel,
  label,
  colors,
  index,
  reducedMotion,
}: {
  heightPct: number;
  showLabel: boolean;
  label: string;
  colors: ThemeColors;
  index: number;
  reducedMotion: boolean;
}) {
  const styles = useMemo(() => createTimelineStyles(colors), [colors]);
  const height = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) {
      height.value = heightPct;
    } else {
      height.value = withDelay(
        Math.min(index * 12, 400),
        withTiming(heightPct, { duration: Motion.duration.crawl, easing: Easing.out(Easing.cubic) })
      );
    }
  }, [height, heightPct, index, reducedMotion]);

  const barStyle = useAnimatedStyle(() => ({
    height: `${interpolate(height.value, [0, 100], [0, 100])}%`,
  }));

  return (
    <View style={styles.barCol}>
      <View style={styles.barColumnTrack}>
        <Reanimated.View
          style={[styles.timelineBar, { backgroundColor: colors.textPrimary }, barStyle]}
        />
      </View>
      {showLabel ? (
        <Text style={[styles.barColLabel, { color: colors.textMuted }]} numberOfLines={1}>
          {label}
        </Text>
      ) : (
        <View style={styles.barColLabelPlaceholder} />
      )}
    </View>
  );
}

// ── Top content row ───────────────────────────────────────────────────
function TopContentRow({
  item,
  colors,
}: {
  item: TopContentItem;
  colors: ThemeColors;
}) {
  const styles = useMemo(() => createTopContentStyles(colors), [colors]);
  return (
    <View style={[styles.row, { borderBottomColor: colors.border }]}>
      <View style={[styles.rankBadge, { backgroundColor: colors.surfaceAlt }]}>
        <Text style={[styles.rankText, { color: colors.textPrimary }]}>{item.rank}</Text>
      </View>
      <View style={styles.rowInfo}>
        <Text style={[styles.rowTitle, { color: colors.textPrimary }]} numberOfLines={1}>
          {item.title}
        </Text>
        <View style={styles.rowMeta}>
          <Ionicons name="eye-outline" size={12} color={colors.textMuted} />
          <Text style={[styles.rowMetaText, { color: colors.textMuted }]}>
            {formatCount(item.views)} views
          </Text>
          <Text style={[styles.rowDot, { color: colors.border }]}>·</Text>
          <Text style={[styles.rowMetaText, { color: colors.textMuted }]}>
            {formatRate(item.engagementRate)} engagement
          </Text>
        </View>
      </View>
    </View>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────
function AnalyticsSkeleton({ colors }: { colors: ThemeColors }) {
  const styles = useMemo(() => createSkeletonStyles(colors), [colors]);
  return (
    <View>
      <View style={styles.metricsGrid}>
        {Array.from({ length: 4 }).map((_, i) => (
          <View key={i} style={styles.metricTile}>
            <View style={styles.skelRow}>
              <SkeletonLoader width={32} height={32} borderRadius={Radius.full} />
              <SkeletonLoader width={48} height={12} />
            </View>
            <SkeletonLoader width="70%" height={28} style={{ marginTop: Space.sm }} />
            <SkeletonLoader width="50%" height={12} style={{ marginTop: Space.xs }} />
          </View>
        ))}
      </View>
      <View style={{ height: Space.lg }} />
      <SkeletonLoader width="60%" height={18} />
      <View style={{ height: Space.sm }} />
      {Array.from({ length: 4 }).map((_, i) => (
        <View key={i} style={styles.skelBarRow}>
          <SkeletonLoader width="40%" height={14} />
          <SkeletonLoader width="100%" height={10} borderRadius={Radius.full} style={{ marginTop: Space.xs }} />
        </View>
      ))}
      <View style={{ height: Space.lg }} />
      <SkeletonLoader width="50%" height={18} />
      <View style={{ height: Space.sm }} />
      <SkeletonLoader width="100%" height={120} borderRadius={Radius.md} />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────
function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    scrollContent: {
      paddingHorizontal: Space.md,
      paddingTop: Space.sm,
      paddingBottom: Space.xl,
    },
    bannerWrap: {
      paddingHorizontal: Space.md,
      paddingTop: Space.sm,
    },
    periodRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs - 2,
      backgroundColor: colors.surfaceAlt,
      borderRadius: Radius.full,
      padding: Space.xs - 2,
    },
    periodChip: {
      paddingHorizontal: Space.sm + Space.xs,
      paddingVertical: Space.xs + 1,
      borderRadius: Radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: Space.lg + Space.xs,
      minWidth: Control.chrome + Space.xs,
    },
    periodChipText: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.semibold,
      letterSpacing: LetterSpacing.wide,
    },
    metricsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Space.sm,
    },
    section: {
      marginTop: Space.lg,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      marginBottom: Space.sm,
    },
    sectionTitle: {
      fontSize: Type.subtitle.size,
      fontFamily: Typography.family.semibold,
      letterSpacing: Type.subtitle.letterSpacing,
    },
    sectionCaption: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
    },
    breakdownWrap: {
      gap: Space.sm + 2,
    },
    topList: {
      // flat list with hairline separators
    },
    inlineEmpty: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.regular,
      paddingVertical: Space.md,
    },
  });
}

function createMetricTileStyles(colors: ThemeColors) {
  return StyleSheet.create({
    tile: {
      flex: 1,
      minWidth: '48%',
      paddingVertical: Space.md,
      paddingHorizontal: Space.md,
      gap: Space.xs,
    },
    tileTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    tileIcon: {
      width: Control.chromeCompact,
      height: Control.chromeCompact,
      borderRadius: Radius.full,
      alignItems: 'center',
      justifyContent: 'center',
    },
    deltaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs - 2,
    },
    deltaText: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.semibold,
      letterSpacing: Type.caption.letterSpacing,
      fontVariant: ['tabular-nums'] as any,
    },
    tileValue: {
      fontSize: Type.priceHero.size,
      fontFamily: Typography.family.bold,
      lineHeight: Type.priceHero.lineHeight,
      letterSpacing: Type.priceHero.letterSpacing,
      fontVariant: ['tabular-nums'] as any,
    },
    tileLabel: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      letterSpacing: Type.caption.letterSpacing,
    },
  });
}

function createEngagementStyles(colors: ThemeColors) {
  return StyleSheet.create({
    barRow: {
      gap: Space.xs + 2,
    },
    barLabelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    barLabel: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.medium,
      letterSpacing: Type.body.letterSpacing,
    },
    barMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
    },
    barCount: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.semibold,
      fontVariant: ['tabular-nums'] as any,
    },
    barPct: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.regular,
      fontVariant: ['tabular-nums'] as any,
    },
    barTrack: {
      height: Space.sm,
      borderRadius: Radius.full,
      overflow: 'hidden',
    },
    barFill: {
      height: '100%',
      borderRadius: Radius.full,
    },
  });
}

function createTimelineStyles(colors: ThemeColors) {
  return StyleSheet.create({
    chartWrap: {
      // container
    },
    chartBars: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      height: 140,
      gap: Space.xs - 2,
      paddingBottom: Space.xs - 2,
    },
    barCol: {
      flex: 1,
      alignItems: 'center',
      gap: Space.xs,
    },
    barColumnTrack: {
      flex: 1,
      width: '100%',
      justifyContent: 'flex-end',
      alignItems: 'center',
    },
    timelineBar: {
      width: '70%',
      maxWidth: Space.sm + 2,
      borderRadius: Radius.sm,
      minHeight: Space.xs - 2,
    },
    barColLabel: {
      fontSize: Type.meta.size - 2,
      fontFamily: Typography.family.regular,
      letterSpacing: LetterSpacing.normal,
      textAlign: 'center',
    },
    barColLabelPlaceholder: {
      height: Space.sm + Space.xs,
    },
    baseline: {
      height: StyleSheet.hairlineWidth,
      width: '100%',
      marginTop: 0,
    },
    inlineEmpty: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.regular,
      paddingVertical: Space.md,
    },
  });
}

function createTopContentStyles(colors: ThemeColors) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingVertical: Space.sm + 2,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    rankBadge: {
      width: Control.icon + Space.xs,
      height: Control.icon + Space.xs,
      borderRadius: Radius.full,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rankText: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.semibold,
      fontVariant: ['tabular-nums'] as any,
    },
    rowInfo: {
      flex: 1,
      gap: Space.xs - 1,
    },
    rowTitle: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.semibold,
      letterSpacing: Type.body.letterSpacing,
    },
    rowMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
    },
    rowMetaText: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.regular,
      letterSpacing: Type.caption.letterSpacing,
    },
    rowDot: {
      fontSize: Type.meta.size - 1,
    },
  });
}

function createSkeletonStyles(colors: ThemeColors) {
  return StyleSheet.create({
    metricsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Space.sm,
    },
    metricTile: {
      flex: 1,
      minWidth: '48%',
      paddingVertical: Space.md,
      paddingHorizontal: Space.md,
    },
    skelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    skelBarRow: {
      marginTop: Space.sm,
    },
  });
}
