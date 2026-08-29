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
  Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import {
  Space,
  Radius,
  FontFamily,
  Numeric } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { RootStackParamList } from '../navigation/types';
import { FlagshipScreen, FlagshipHeader, FlagshipState, FlagshipMetricLine } from '../components/flagship';
import { EmptyState } from '../components/EmptyState';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { OfflineBanner } from '../components/OfflineBanner';
import { CachedImage } from '../components/CachedImage';
import { BarChart } from '../components/charts/BarChart';
import type { ChartPoint } from '../components/charts/types';
import { useConnectivity } from '../hooks/useConnectivity';
import { useHaptic } from '../hooks/useHaptic';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useA11yAudit } from '../hooks/useA11yAudit';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { formatFiatAmount } from '../utils/currency';
import type { SupportedCurrencyCode } from '../constants/currencies';
import {
  fetchAnalyticsSummary,
  fetchAnalyticsTimeline,
  fetchContentRanking,
  fetchEarningsSummary,
  requestPayout,
  type AnalyticsSummary,
  type AnalyticsTimeline,
  type ContentRankingResponse,
  type AnalyticsPeriod,
  type Completeness,
  type EarningsSummary } from '../services/creatorAnalyticsApi';

type NavT = NativeStackNavigationProp<RootStackParamList>;

type PeriodKey = AnalyticsPeriod;

const PERIOD_LABELS: Record<PeriodKey, string> = {
  '7d': '7 days',
  '30d': '30 days',
  '90d': '90 days' };

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ── Helpers ──────────────────────────────────────────────────────────
function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(n);
}

function formatRate(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

function formatDelta(changeRatio: number | null): string {
  if (changeRatio === null) return '';
  const pct = changeRatio * 100;
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}

function formatMoney(minor: number, currencyCode: SupportedCurrencyCode): string {
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  const major = abs / 100;
  return `${sign}${formatFiatAmount(major, currencyCode)}`;
}

function shortDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function formatDateRange(range: { start: string; endExclusive: string }): string {
  const s = new Date(range.start);
  const e = new Date(range.endExclusive);
  e.setUTCDate(e.getUTCDate() - 1); // endExclusive is exclusive — display the last included day
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  return `${fmt(s)} – ${fmt(e)}`;
}

function completenessLabel(c: Completeness): string {
  switch (c) {
    case 'complete': return 'Up to date';
    case 'provisional': return 'Provisional';
    case 'delayed': return 'Delayed';
    case 'unavailable': return 'No data yet';
  }
}

function completenessColor(c: Completeness, colors: ThemeColors): string {
  switch (c) {
    case 'complete': return colors.success;
    case 'provisional': return colors.warning;
    case 'delayed': return colors.warning;
    case 'unavailable': return colors.textMuted;
  }
}

function entryTypeLabel(t: string): string {
  switch (t) {
    case 'estimated': return 'Estimated';
    case 'earned': return 'Earned';
    case 'held': return 'Held';
    case 'adjustment': return 'Adjustment';
    case 'refund_reversal': return 'Refund';
    case 'chargeback_reversal': return 'Chargeback';
    case 'payout': return 'Payout';
    default: return t;
  }
}

// ── Main screen ───────────────────────────────────────────────────────
export default function CreatorAnalyticsDashboardScreen() {
  const a11yRef = useRef<any>(null);
  useA11yAudit(a11yRef, 'CreatorAnalyticsDashboardScreen');
  const { colors } = useAppTheme();
  const navigation = useNavigation<NavT>();
  const haptic = useHaptic();
  const reducedMotion = useReducedMotion();
  const { isOffline } = useConnectivity();
  const { currencyCode } = useFormattedPrice();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [period, setPeriod] = useState<PeriodKey>('30d');
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [timeline, setTimeline] = useState<AnalyticsTimeline | null>(null);
  const [ranking, setRanking] = useState<ContentRankingResponse | null>(null);
  const [earnings, setEarnings] = useState<EarningsSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [partialError, setPartialError] = useState<string | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [isPayoutLoading, setIsPayoutLoading] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const load = useCallback(async (selectedPeriod: PeriodKey) => {
    setFatalError(null);
    setPartialError(null);

    let summaryResult: AnalyticsSummary | null = null;
    let timelineResult: AnalyticsTimeline | null = null;
    let rankingResult: ContentRankingResponse | null = null;
    let earningsResult: EarningsSummary | null = null;
    let hadPartialError = false;

    // Summary is critical — if it fails, show fatal error.
    try {
      summaryResult = await fetchAnalyticsSummary({ period: selectedPeriod });
    } catch (err) {
      if (!mountedRef.current) return;
      setFatalError(err instanceof Error ? err.message : 'Unable to load analytics');
      setSummary(null);
      setTimeline(null);
      setRanking(null);
      setEarnings(null);
      return;
    }

    // Timeline, ranking, and earnings are non-critical — partial failure is OK.
    try {
      timelineResult = await fetchAnalyticsTimeline({ period: selectedPeriod });
    } catch {
      hadPartialError = true;
    }
    try {
      rankingResult = await fetchContentRanking({ period: selectedPeriod, limit: 10 });
    } catch {
      hadPartialError = true;
    }
    try {
      earningsResult = await fetchEarningsSummary();
    } catch {
      hadPartialError = true;
    }

    if (!mountedRef.current) return;
    setSummary(summaryResult);
    setTimeline(timelineResult);
    setRanking(rankingResult);
    setEarnings(earningsResult);
    setPartialError(hadPartialError ? 'Some details could not be loaded.' : null);
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
    if (!reducedMotion) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    setPeriod(next);
  };

  const onPayout = useCallback(async () => {
    if (isPayoutLoading) return;
    haptic.light();
    setIsPayoutLoading(true);
    try {
      await requestPayout('wallet', `manual_${Date.now()}`);
      // Reload earnings after successful payout
      const fresh = await fetchEarningsSummary();
      if (mountedRef.current) setEarnings(fresh);
    } catch {
      // Silently fail — the user can retry. No alert spam.
    } finally {
      if (mountedRef.current) setIsPayoutLoading(false);
    }
  }, [haptic, isPayoutLoading]);

  // ── Derived: chart data ─────────────────────────────────────────────
  const chartData = useMemo<ChartPoint[]>(() => {
    if (!timeline) return [];
    return timeline.points.map((p) => ({
      x: shortDate(p.date),
      y: p.views }));
  }, [timeline]);

  // ── Derived: chart accessibility summary for screen readers ────────
  // The Skia canvas is invisible to VoiceOver/TalkBack, so we expose a
  // textual summary via the BarChart's accessibilityLabel (WCAG 1.1.1).
  const chartA11ySummary = useMemo(() => {
    if (chartData.length === 0) return 'No views in this period';
    const total = chartData.reduce((sum, p) => sum + p.y, 0);
    const peak = chartData.reduce((best, p) => (p.y > best.y ? p : best), chartData[0]);
    return `Views over ${chartData.length} ${chartData.length === 1 ? 'day' : 'days'}, peak ${peak.y} on ${peak.x}, total ${total}`;
  }, [chartData]);

  // ── Derived: hero thumbnail (top content) ───────────────────────────
  const heroThumbnail = useMemo(() => {
    if (!ranking || ranking.items.length === 0) return null;
    return ranking.items[0].thumbnailUrl;
  }, [ranking]);

  // ── Empty detection ─────────────────────────────────────────────────
  const isEmpty = useMemo(() => {
    if (!summary) return false;
    return summary.summary.views.value === 0 &&
      summary.summary.likes.value === 0 &&
      summary.summary.saves.value === 0 &&
      summary.summary.comments.value === 0 &&
      summary.summary.shares.value === 0 &&
      summary.summary.productClicks.value === 0;
  }, [summary]);

  // ── Period selector: hairline tabs ──────────────────────────────────
  const periodSelector = (
    <View style={styles.periodRow}>
      {(['7d', '30d', '90d'] as PeriodKey[]).map((key) => {
        const active = key === period;
        return (
          <Pressable
            key={key}
            onPress={() => onSelectPeriod(key)}
            style={styles.periodTab}
            accessibilityRole="button"
            accessibilityLabel={`Show last ${PERIOD_LABELS[key]}`}
            accessibilityState={{ selected: active }}
            hitSlop={4}
          >
            <Text
              style={[
                styles.periodTabText,
                { color: active ? colors.textPrimary : colors.textMuted },
              ]}
            >
              {key}
            </Text>
            {active && (
              <View style={[styles.periodTabIndicator, { backgroundColor: colors.textPrimary }]} />
            )}
          </Pressable>
        );
      })}
    </View>
  );

  // ── Data freshness strip ────────────────────────────────────────────
  const freshnessStrip = useMemo(() => {
    if (!summary) return null;
    const c = summary.completeness;
    const color = completenessColor(c, colors);
    return (
      <View style={styles.freshnessRow}>
        <View style={[styles.freshnessDot, { backgroundColor: color }]} />
        <Text style={[styles.freshnessText, { color: colors.textMuted }]}>
          {completenessLabel(c)}
        </Text>
        {/* Always show watermark — even when complete */}
        <Text style={[styles.freshnessWatermark, { color: colors.textMuted }]}>
          · updated {new Date(summary.watermark).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
        </Text>
      </View>
    );
  }, [summary, colors]);

  // ── Loading state ───────────────────────────────────────────────────
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

  // ── Fatal error state ───────────────────────────────────────────────
  if (fatalError && !summary) {
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
        {isOffline ? <OfflineBanner onRetry={() => load(period)} /> : null}
        <FlagshipState
          variant="error"
          title="Couldn't load analytics"
          subtitle={isOffline ? undefined : fatalError}
          actionLabel={isOffline ? undefined : 'Retry'}
          onAction={isOffline ? undefined : () => { haptic.light(); load(period); }}
        />
      </FlagshipScreen>
    );
  }

  // ── Empty state ─────────────────────────────────────────────────────
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
        {isOffline ? <OfflineBanner onRetry={() => load(period)} /> : null}
        <EmptyState
          icon="bar-chart-outline"
          title="No analytics data yet"
          subtitle="Publish content to see insights."
          ctaLabel="Create content"
          onCtaPress={() => { haptic.light(); navigation.navigate('CreatorStudio', { type: 'poster', openEntry: true }); }}
        />
      </FlagshipScreen>
    );
  }

  // ── Populated state ─────────────────────────────────────────────────
  const currentSummary = summary;
  if (!currentSummary) return null;

  const s = currentSummary.summary;
  const viewsDelta = formatDelta(s.views.changeRatio);
  const viewsUp = s.views.changeRatio !== null && s.views.changeRatio > 0;

  return (
    <FlagshipScreen
      ref={a11yRef}
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
          <OfflineBanner onRetry={() => load(period)} />
        </View>
      ) : null}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.brand} />
        }
      >
        {/* ── 1. DATA FRESHNESS ────────────────────────────────────── */}
        {freshnessStrip}

        {/* ── 2. PERFORMANCE HERO — media-anchored ─────────────────── */}
        <View style={styles.heroWrap}>
          {heroThumbnail ? (
            <View style={styles.heroMediaWrap}>
              <CachedImage
                uri={heroThumbnail}
                style={styles.heroMedia}
                contentFit="cover"
                transition={200}
                priority="high"
              />
              <LinearGradient
                colors={['rgba(0,0,0,0.15)', 'rgba(0,0,0,0.55)']}
                locations={[0.2, 1.0]}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.heroOverlay}>
                <Text style={styles.heroLabel}>
                  Views
                </Text>
                <View style={styles.heroRow}>
                  <Text style={styles.heroValue}>
                    {formatCount(s.views.value)}
                  </Text>
                  {viewsDelta ? (
                    <View style={[
                      styles.heroDelta,
                      { backgroundColor: viewsUp ? colors.scrimDeltaPositive : colors.scrimDeltaNegative },
                    ]}>
                      <Ionicons
                        name={viewsUp ? 'arrow-up' : 'arrow-down'}
                        size={11}
                        color={colors.scrimTextPrimary}
                      />
                      <Text style={styles.heroDeltaText}>
                        {viewsDelta}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </View>
          ) : (
            <>
              <Text style={[styles.heroLabel, { color: colors.textSecondary }]}>
                Views
              </Text>
              <View style={styles.heroRow}>
                <Text style={[styles.heroValue, { color: colors.textPrimary }]}>
                  {formatCount(s.views.value)}
                </Text>
                {viewsDelta ? (
                  <View style={[
                    styles.heroDelta,
                    { backgroundColor: viewsUp ? colors.successSubtle : colors.dangerSubtle },
                  ]}>
                    <Ionicons
                      name={viewsUp ? 'arrow-up' : 'arrow-down'}
                      size={11}
                      color={viewsUp ? colors.success : colors.danger}
                    />
                    <Text style={[
                      styles.heroDeltaText,
                      { color: viewsUp ? colors.success : colors.danger },
                    ]}>
                      {viewsDelta}
                    </Text>
                  </View>
                ) : null}
              </View>
            </>
          )}
        </View>

        {/* ── 3. COMPARISON CONTEXT — single line, not per-metric ──── */}
        <Text style={[styles.comparisonContext, { color: colors.textMuted }]}>
          {formatDateRange(currentSummary.range)} vs {formatDateRange(currentSummary.comparisonRange)}
        </Text>

        {/* ── 4. SUPPRESSED DIMENSIONS — inline callout ─────────────── */}
        {currentSummary.suppressedDimensions.length > 0 && (
          <View style={styles.suppressedCallout}>
            <Ionicons name="information-circle-outline" size={13} color={colors.textMuted} />
            <Text style={[styles.suppressedText, { color: colors.textMuted }]}>
              {currentSummary.suppressedDimensions.map(d => `${d.dimension}: ${d.reason}`).join(' · ')}
            </Text>
          </View>
        )}

        {/* ── 5. SECONDARY METRICS — flat lines, no cards ──────────── */}
        <View style={styles.metricsSection}>
          <FlagshipMetricLine
            label="Engagement rate"
            value={formatRate(s.engagementRate.value)}
            separated
          />
          <FlagshipMetricLine
            label="Profile visits"
            value={formatCount(s.profileVisits.value)}
            separated
          />
          <FlagshipMetricLine
            label="Product clicks"
            value={formatCount(s.productClicks.value)}
            separated
          />
          <FlagshipMetricLine
            label="Likes"
            value={formatCount(s.likes.value)}
            separated
          />
          <FlagshipMetricLine
            label="Saves"
            value={formatCount(s.saves.value)}
            separated
          />
          <FlagshipMetricLine
            label="Comments"
            value={formatCount(s.comments.value)}
            separated
          />
          <FlagshipMetricLine
            label="Shares"
            value={formatCount(s.shares.value)}
            separated
          />
        </View>

        {/* ── 6. PARTIAL ERROR BANNER ──────────────────────────────── */}
        {partialError ? (
          <View style={[styles.partialBanner, { backgroundColor: colors.warningSubtle }]}>
            <Ionicons name="alert-circle-outline" size={14} color={colors.warning} />
            <Text style={[styles.partialText, { color: colors.textSecondary }]}>
              {partialError}
            </Text>
          </View>
        ) : null}

        {/* ── 7. TREND CHART ───────────────────────────────────────── */}
        <View style={styles.chartSection}>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
            Views over time
          </Text>
          <BarChart
            data={chartData}
            height={180}
            barColor={colors.brand}
            loading={false}
            error={timeline ? null : 'Chart unavailable'}
            emptyMessage="No views in this period"
            valueFormat={formatCount}
            accessibilitySummary={chartA11ySummary}
          />
        </View>

        {/* ── 8. TOP CONTENT — real thumbnails as colour ───────────── */}
        {ranking && ranking.items.length > 0 ? (
          <View style={styles.contentSection}>
            <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
              Top content
            </Text>
            {ranking.items.map((item, i) => (
              <Pressable
                key={`${item.contentType}:${item.contentId}`}
                onPress={() => {
                  // Navigate to content detail — looks have a detail screen,
                  // posters use the story viewer.
                  if (item.contentType === 'look') {
                    navigation.navigate('LookDetail', { lookId: item.contentId });
                  } else if (item.contentType === 'poster') {
                    navigation.navigate('PosterViewer', { storyId: item.contentId });
                  }
                }}
                style={({ pressed }) => [
                  styles.contentRowPress,
                  pressed && { opacity: 0.6 },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Open ${item.title}`}
              >
                <ContentRankingRow
                  item={item}
                  rank={i + 1}
                  colors={colors}
                  isLast={i === ranking.items.length - 1}
                />
              </Pressable>
            ))}
          </View>
        ) : null}

        {/* ── 9. EARNINGS — flat ledger, not a dashboard card ──────── */}
        {earnings ? (
          <View style={styles.earningsSection}>
            <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
              Earnings
            </Text>

            {/* Available balance — the dominant figure */}
            <FlagshipMetricLine
              label="Available"
              value={formatMoney(earnings.available.amountMinor, currencyCode)}
              emphasis
              separated
            />
            <FlagshipMetricLine
              label="Estimated"
              value={formatMoney(earnings.estimated.amountMinor, currencyCode)}
              separated
            />
            <FlagshipMetricLine
              label="Finalized"
              value={formatMoney(earnings.finalized.amountMinor, currencyCode)}
              separated
            />
            <FlagshipMetricLine
              label="Paid"
              value={formatMoney(earnings.paid.amountMinor, currencyCode)}
              separated
            />

            {/* Payout action — only if there's available balance */}
            {earnings.available.amountMinor > 0 && (
              <AnimatedPressable
                onPress={onPayout}
                style={[styles.payoutButton, { backgroundColor: colors.brand }]}
                hapticFeedback="light"
                scaleValue={0.97}
                disabled={isPayoutLoading}
                accessibilityRole="button"
                accessibilityLabel="Request payout"
              >
                <Text style={styles.payoutButtonText}>
                  {isPayoutLoading ? 'Processing…' : 'Request payout'}
                </Text>
              </AnimatedPressable>
            )}

            {/* Recent entries — last 5 */}
            {earnings.recentEntries.length > 0 && (
              <View style={styles.earningsEntries}>
                <Text style={[styles.entriesLabel, { color: colors.textMuted }]}>
                  Recent
                </Text>
                {earnings.recentEntries.slice(0, 5).map((entry) => (
                  <View
                    key={entry.id}
                    style={[styles.entryRow, { borderBottomColor: colors.border }]}
                  >
                    <View style={styles.entryInfo}>
                      <Text style={[styles.entryType, { color: colors.textPrimary }]}>
                        {entryTypeLabel(entry.entryType)}
                      </Text>
                      {entry.description && (
                        <Text style={[styles.entryDesc, { color: colors.textMuted }]} numberOfLines={1}>
                          {entry.description}
                        </Text>
                      )}
                    </View>
                    <Text
                      style={[
                        styles.entryAmount,
                        { color: entry.amountMinor < 0 ? colors.danger : colors.textPrimary },
                      ]}
                    >
                      {formatMoney(entry.amountMinor, currencyCode)}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        ) : null}

        {/* ── 10. DATA QUALITY FOOTER ──────────────────────────────── */}
        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: colors.textMuted }]}>
            {currentSummary.metricVersion}
          </Text>
        </View>

        <View style={{ height: Space.xl }} />
      </ScrollView>
    </FlagshipScreen>
  );
}

// ── Content ranking row ────────────────────────────────────────────────
function ContentRankingRow({
  item,
  rank,
  colors,
  isLast }: {
  item: ContentRankingResponse['items'][number];
  rank: number;
  colors: ThemeColors;
  isLast: boolean;
}) {
  const styles = useMemo(() => createContentRowStyles(colors), [colors]);
  return (
    <View style={[styles.row, !isLast && { borderBottomColor: colors.border }]}>
      <Text style={[styles.rank, { color: colors.textMuted }]}>
        {rank}
      </Text>
      <View style={styles.thumbWrap}>
        {item.thumbnailUrl ? (
          <CachedImage
            uri={item.thumbnailUrl}
            style={styles.thumb}
            contentFit="cover"
            transition={200}
            priority="normal"
          />
        ) : (
          <View style={[styles.thumb, styles.thumbFallback]}>
            <Ionicons
              name={item.contentType === 'look' ? 'shirt-outline' : 'image-outline'}
              size={18}
              color={colors.textMuted}
            />
          </View>
        )}
      </View>
      <View style={styles.info}>
        <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
          {item.title}
        </Text>
        <View style={styles.meta}>
          <Text style={[styles.metaText, { color: colors.textMuted }]}>
            {formatCount(item.views)} views
          </Text>
          <Text style={[styles.metaDot, { color: colors.border }]}>·</Text>
          <Text style={[styles.metaText, { color: colors.textMuted }]}>
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
      {/* Freshness strip placeholder */}
      <SkeletonLoader width={140} height={14} />

      {/* Hero placeholder — matches media-anchored hero height */}
      <View style={{ height: Space.md }} />
      <SkeletonLoader width="100%" height={140} borderRadius={Radius.md} />

      {/* Comparison context */}
      <View style={{ height: Space.sm }} />
      <SkeletonLoader width={180} height={12} />

      {/* Metric lines placeholder — 7 rows to match populated state */}
      <View style={{ height: Space.lg }} />
      {Array.from({ length: 7 }).map((_, i) => (
        <View key={i} style={styles.skelMetricRow}>
          <SkeletonLoader width="40%" height={14} />
          <SkeletonLoader width={60} height={16} />
        </View>
      ))}

      {/* Chart placeholder */}
      <View style={{ height: Space.lg }} />
      <SkeletonLoader width={80} height={14} />
      <View style={{ height: Space.sm }} />
      <SkeletonLoader width="100%" height={180} borderRadius={Radius.lg} />

      {/* Content ranking placeholder */}
      <View style={{ height: Space.lg }} />
      <SkeletonLoader width={70} height={14} />
      <View style={{ height: Space.sm }} />
      {Array.from({ length: 3 }).map((_, i) => (
        <View key={i} style={styles.skelContentRow}>
          <SkeletonLoader width={48} height={48} borderRadius={Radius.sm} />
          <View style={styles.skelContentInfo}>
            <SkeletonLoader width="60%" height={14} />
            <SkeletonLoader width="40%" height={12} style={{ marginTop: Space.xs }} />
          </View>
        </View>
      ))}

      {/* Earnings placeholder */}
      <View style={{ height: Space.lg }} />
      <SkeletonLoader width={60} height={14} />
      <View style={{ height: Space.sm }} />
      {Array.from({ length: 4 }).map((_, i) => (
        <View key={i} style={styles.skelMetricRow}>
          <SkeletonLoader width="35%" height={14} />
          <SkeletonLoader width={70} height={16} />
        </View>
      ))}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────
function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    scrollContent: {
      paddingHorizontal: Space.md,
      paddingTop: Space.sm,
      paddingBottom: Space.xl },
    bannerWrap: {
      paddingHorizontal: Space.md,
      paddingTop: Space.sm },
    // ── Period selector: hairline tabs ──
    periodRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm + Space.xs },
    periodTab: {
      alignItems: 'center',
      paddingVertical: Space.xs,
      paddingHorizontal: Space.xxs },
    periodTabText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.semibold,
      letterSpacing: 0.3 },
    periodTabIndicator: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      height: 2,
      borderRadius: 1 },
    // ── Freshness ──
    freshnessRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingVertical: Space.xs },
    freshnessDot: {
      width: 6,
      height: 6,
      borderRadius: Radius.full },
    freshnessText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.medium },
    freshnessWatermark: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.regular },
    // ── Hero ──
    heroWrap: {
      paddingTop: Space.md,
      paddingBottom: Space.sm },
    heroMediaWrap: {
      position: 'relative',
      height: 140,
      borderRadius: Radius.md,
      overflow: 'hidden' },
    heroMedia: {
      width: '100%',
      height: 140 },
    heroOverlay: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      padding: Space.md },
    heroLabel: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.medium,
      letterSpacing: TypographyV2.meta.letterSpacing,
      color: colors.scrimTextSecondary },
    heroRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: Space.sm,
      marginTop: Space.xs },
    heroValue: {
      ...Numeric.priceList,
      fontSize: TypographyV2.priceHero.size,
      lineHeight: TypographyV2.priceHero.lineHeight,
      letterSpacing: TypographyV2.priceHero.letterSpacing,
      fontFamily: FontFamily.bold,
      color: colors.scrimTextPrimary },
    heroDelta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs - 2,
      paddingHorizontal: Space.xs + 1,
      paddingVertical: Space.xs - 1,
      borderRadius: Radius.full },
    heroDeltaText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.semibold,
      letterSpacing: 0.2,
      color: colors.scrimTextPrimary },
    // ── Comparison context ──
    comparisonContext: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.regular,
      paddingVertical: Space.xs },
    // ── Suppressed dimensions ──
    suppressedCallout: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingVertical: Space.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      marginTop: Space.xs },
    suppressedText: {
      flex: 1,
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.regular },
    // ── Metrics ──
    metricsSection: {
      marginTop: Space.sm },
    // ── Partial error ──
    partialBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs + 1,
      paddingHorizontal: Space.sm + Space.xs,
      paddingVertical: Space.sm,
      borderRadius: Radius.sm,
      marginTop: Space.md },
    partialText: {
      flex: 1,
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.medium,
      lineHeight: TypographyV2.meta.lineHeight },
    // ── Chart ──
    chartSection: {
      marginTop: Space.lg },
    // ── Content ranking ──
    contentSection: {
      marginTop: Space.lg },
    contentRowPress: {
      marginLeft: -Space.xs },
    sectionLabel: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.medium,
      letterSpacing: TypographyV2.meta.letterSpacing,
      marginBottom: Space.sm },
    // ── Earnings ──
    earningsSection: {
      marginTop: Space.xl },
    payoutButton: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: Space.sm + 2,
      borderRadius: Radius.sm,
      marginTop: Space.md,
      minHeight: 48 },
    payoutButtonText: {
      fontSize: TypographyV2.body.size,
      fontFamily: FontFamily.semibold,
      color: colors.textInverse },
    earningsEntries: {
      marginTop: Space.lg },
    entriesLabel: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.medium,
      marginBottom: Space.sm },
    entryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: Space.sm,
      borderBottomWidth: StyleSheet.hairlineWidth },
    entryInfo: {
      flex: 1,
      gap: Space.xxs },
    entryType: {
      fontSize: TypographyV2.body.size,
      fontFamily: FontFamily.semibold,
      letterSpacing: TypographyV2.body.letterSpacing },
    entryDesc: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.regular },
    entryAmount: {
      ...Numeric.numericMeta,
      fontSize: TypographyV2.body.size,
      fontFamily: FontFamily.semibold },
    // ── Footer ──
    footer: {
      marginTop: Space.xl,
      gap: Space.xxs },
    footerText: {
      fontSize: TypographyV2.meta.size - 1,
      fontFamily: FontFamily.regular } });
}

function createContentRowStyles(colors: ThemeColors) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingVertical: Space.sm + 2,
      borderBottomWidth: StyleSheet.hairlineWidth },
    rank: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.semibold,
      width: 20,
      textAlign: 'center',
      ...Numeric.numericMeta },
    thumbWrap: {
      width: 48,
      height: 48 },
    thumb: {
      width: 48,
      height: 48,
      borderRadius: Radius.sm },
    thumbFallback: {
      alignItems: 'center',
      justifyContent: 'center' },
    info: {
      flex: 1,
      gap: Space.xs - 1 },
    title: {
      fontSize: TypographyV2.body.size,
      fontFamily: FontFamily.semibold,
      letterSpacing: TypographyV2.body.letterSpacing },
    meta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs },
    metaText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.regular,
      letterSpacing: TypographyV2.meta.letterSpacing },
    metaDot: {
      fontSize: TypographyV2.meta.size - 1 } });
}

function createSkeletonStyles(colors: ThemeColors) {
  return StyleSheet.create({
    skelMetricRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: Space.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border },
    skelContentRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingVertical: Space.sm + 2 },
    skelContentInfo: {
      flex: 1 } });
}
