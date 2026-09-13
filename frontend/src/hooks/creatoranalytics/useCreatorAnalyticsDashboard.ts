import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { LayoutAnimation } from 'react-native';
import type { ChartPoint } from '../../components/charts/types';
import { useHaptic } from '../useHaptic';
import { useReducedMotion } from '../useReducedMotion';
import {
  fetchAnalyticsSummary,
  fetchAnalyticsTimeline,
  fetchContentRanking,
  fetchEarningsSummary,
  type AnalyticsSummary,
  type AnalyticsTimeline,
  type ContentRankingResponse,
  type EarningsSummary } from '../../services/creatorAnalyticsApi';
import type { PeriodKey } from '../../components/creatoranalytics/creatorAnalyticsTypes';
import { shortDate } from '../../components/creatoranalytics/creatorAnalyticsFormat';

// Data + period state for the creator analytics dashboard. Summary is
// critical (fatal on failure); timeline, ranking, and earnings are
// non-critical and degrade to a partial-error banner.
export function useCreatorAnalyticsDashboard() {
  const haptic = useHaptic();
  const reducedMotion = useReducedMotion();

  const [period, setPeriod] = useState<PeriodKey>('30d');
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [timeline, setTimeline] = useState<AnalyticsTimeline | null>(null);
  const [ranking, setRanking] = useState<ContentRankingResponse | null>(null);
  const [earnings, setEarnings] = useState<EarningsSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [partialError, setPartialError] = useState<string | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);
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

  return {
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
    setEarnings };
}
