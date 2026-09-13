import React, { useMemo, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  Platform,
  UIManager } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppTheme } from '../theme/ThemeContext';
import { Space } from '../theme/designTokens';
import { RootStackParamList } from '../navigation/types';
import { FlagshipScreen, FlagshipHeader, FlagshipState } from '../components/flagship';
import { EmptyState } from '../components/EmptyState';
import { OfflineBanner } from '../components/OfflineBanner';
import { useConnectivity } from '../hooks/useConnectivity';
import { useHaptic } from '../hooks/useHaptic';
import { useA11yAudit } from '../hooks/useA11yAudit';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import type { ContentRankingItem } from '../services/creatorAnalyticsApi';
import {
  useCreatorAnalyticsDashboard,
  useCreatorPayout } from '../hooks/creatoranalytics';
import {
  CreatorAnalyticsPeriodSelector,
  CreatorAnalyticsFreshnessStrip,
  CreatorAnalyticsHero,
  CreatorAnalyticsMetrics,
  CreatorAnalyticsChart,
  CreatorAnalyticsTopContent,
  CreatorAnalyticsEarnings,
  CreatorAnalyticsSkeleton,
  createCreatorAnalyticsStyles,
  formatDateRange } from '../components/creatoranalytics';

type NavT = NativeStackNavigationProp<RootStackParamList>;

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ── Main screen ───────────────────────────────────────────────────────
export default function CreatorAnalyticsDashboardScreen() {
  const a11yRef = useRef<any>(null);
  useA11yAudit(a11yRef, 'CreatorAnalyticsDashboardScreen');
  const { colors } = useAppTheme();
  const navigation = useNavigation<NavT>();
  const haptic = useHaptic();
  const { isOffline } = useConnectivity();
  const { currencyCode } = useFormattedPrice();
  const styles = useMemo(() => createCreatorAnalyticsStyles(colors), [colors]);

  const {
    period,
    summary,
    timeline,
    ranking,
    earnings,
    isLoading,
    isRefreshing,
    partialError,
    fatalError,
    isEmpty,
    chartData,
    chartA11ySummary,
    heroThumbnail,
    load,
    onRefresh,
    onSelectPeriod,
    setEarnings } = useCreatorAnalyticsDashboard();

  const { isPayoutLoading, payoutError, onPayout } = useCreatorPayout(setEarnings);

  const onPressContentItem = (item: ContentRankingItem) => {
    // Navigate to content detail — looks have a detail screen,
    // posters use the story viewer.
    if (item.contentType === 'look') {
      navigation.navigate('LookDetail', { lookId: item.contentId });
    } else if (item.contentType === 'poster') {
      navigation.navigate('PosterViewer', { storyId: item.contentId });
    }
  };

  // ── Period selector: hairline tabs ──────────────────────────────────
  const periodSelector = (
    <CreatorAnalyticsPeriodSelector period={period} onSelectPeriod={onSelectPeriod} />
  );

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
          <CreatorAnalyticsSkeleton />
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
        <CreatorAnalyticsFreshnessStrip summary={summary} />

        {/* ── 2. PERFORMANCE HERO — media-anchored ─────────────────── */}
        <CreatorAnalyticsHero views={s.views} heroThumbnail={heroThumbnail} />

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
        <CreatorAnalyticsMetrics summary={s} />

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
        <CreatorAnalyticsChart
          data={chartData}
          hasTimeline={timeline !== null}
          accessibilitySummary={chartA11ySummary}
        />

        {/* ── 8. TOP CONTENT — real thumbnails as colour ───────────── */}
        <CreatorAnalyticsTopContent ranking={ranking} onPressItem={onPressContentItem} />

        {/* ── 9. EARNINGS — flat ledger, not a dashboard card ──────── */}
        <CreatorAnalyticsEarnings
          earnings={earnings}
          currencyCode={currencyCode}
          isPayoutLoading={isPayoutLoading}
          payoutError={payoutError}
          onPayout={onPayout}
        />

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
