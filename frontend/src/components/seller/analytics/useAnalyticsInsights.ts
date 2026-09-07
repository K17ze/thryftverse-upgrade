import { useMemo, useCallback } from 'react';
import type { ThemeColors } from '../../../theme/ThemeContext';
import type { ListingApiItem } from '../../../services/listingsApi';
import type { SellerAnalytics, DailyBreakdownPoint, TopPerformerListing, NeedsAttentionListing } from '../../../services/commerceApi';
import type { ChartPoint, ChartSeries } from '../../charts';
import type { useFormattedPrice } from '../../../hooks/useFormattedPrice';
import type { MetricDimension, Period } from './useSellerAnalytics';

interface Input {
 listings: ListingApiItem[]; selectedListingId: string | null; analytics: SellerAnalytics | null; period: Period; activeDimension: MetricDimension;
 dailyBreakdown: DailyBreakdownPoint[]; topPerformersData: TopPerformerListing[]; needsAttentionData: NeedsAttentionListing[]; colors: ThemeColors;
 formatFromFiat: ReturnType<typeof useFormattedPrice>['formatFromFiat'];
}
export function useAnalyticsInsights({ listings, selectedListingId, analytics, period, activeDimension, dailyBreakdown, topPerformersData, needsAttentionData, colors, formatFromFiat }: Input) {
  // ── Selected listing meta ──
  const currentListingItem = useMemo(() => {
    if (!selectedListingId) return null;
    return listings.find((l) => l.id === selectedListingId) ?? null;
  }, [listings, selectedListingId]);

  // ── Metric Calculations ──
  const heroLabel = useMemo(() => {
    if (!analytics) return 'Revenue';
    if (analytics.netSalesGbpMinor != null && analytics.completeness === 'complete') {
      return 'Net sales';
    }
    return 'Revenue';
  }, [analytics]);

  const heroValue = useMemo<number | null>(() => {
    if (!analytics) return null;
    if (analytics.netSalesGbpMinor != null && analytics.completeness === 'complete') {
      return analytics.netSalesGbpMinor / 100;
    }
    return analytics.revenueGbpMinor / 100;
  }, [analytics]);

  const itemsSold = analytics?.itemsSold ?? null;
  const totalViews = analytics?.totalViews ?? null;
  const activeListings = analytics?.activeListings ?? null;
  const avgRating = analytics?.avgRating ?? null;
  const reviewCount = analytics?.reviewCount ?? 0;

  const avgOrderValue = useMemo<number | null>(() => {
    if (heroValue == null || itemsSold == null || itemsSold === 0) return null;
    return heroValue / itemsSold;
  }, [heroValue, itemsSold]);

  const conversionRate = useMemo<number | null>(() => {
    if (!analytics || totalViews == null || itemsSold == null) return null;
    return totalViews > 0 ? (itemsSold / totalViews) * 100 : null;
  }, [analytics, totalViews, itemsSold]);

  // ── Period-over-period deltas ──
  const deltaPct = useCallback((current: number, previous: number): number | null => {
    if (previous <= 0) return null;
    const pct = ((current - previous) / previous) * 100;
    return Math.min(Math.max(Math.round(pct * 10) / 10, -999), 999);
  }, []);

  const revenueDelta = useMemo(() => {
    if (!analytics?.comparison) return null;
    const useNet = analytics.netSalesGbpMinor != null;
    const current = useNet ? analytics.netSalesGbpMinor! : analytics.revenueGbpMinor;
    const previous = useNet
      ? analytics.comparison.netSalesGbpMinor ?? analytics.comparison.revenueGbpMinor
      : analytics.comparison.revenueGbpMinor;
    return deltaPct(current, previous);
  }, [analytics, deltaPct]);

  const itemsSoldDelta = useMemo(() => {
    if (!analytics?.comparison) return null;
    return deltaPct(analytics.itemsSold, analytics.comparison.itemsSold);
  }, [analytics, deltaPct]);

  const viewsDelta = useMemo(() => {
    if (!analytics?.comparison) return null;
    return deltaPct(analytics.totalViews, analytics.comparison.totalViews);
  }, [analytics, deltaPct]);

  const prevRevenueGbp = useMemo(() => {
    if (!analytics?.comparison) return null;
    const val = analytics.comparison.netSalesGbpMinor ?? analytics.comparison.revenueGbpMinor;
    return val != null ? val / 100 : null;
  }, [analytics]);

  const periodDays = period === '7d' ? 7 : period === '90d' ? 90 : 30;
  const periodLabel = period === '7d' ? '7 days' : period === '30d' ? '30 days' : '90 days';

  const formatDayLabel = (date: string): string => {
    const d = new Date(`${date}T00:00:00`);
    return isNaN(d.getTime()) ? date : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  };

  // ── Multi-Dimension Chart Data ──
  const dimensionChartData = useMemo(() => {
    if (!analytics?.trend?.current || analytics.trend.current.length === 0) {
      return { currentPoints: [], prevPoints: [], peakText: null, avgText: null, valueFormat: (v: number) => String(v) };
    }

    const hasDaily = dailyBreakdown.length > 0;
    const dailyMap = new Map<string, DailyBreakdownPoint>(dailyBreakdown.map((d) => [d.date, d]));

    let currentPoints: ChartPoint[] = [];
    let prevPoints: ChartPoint[] = [];
    let peakText: string | null = null;
    let avgText: string | null = null;
    let valueFormat: (v: number) => string = (v) => String(Math.round(v));

    if (activeDimension === 'sales') {
      currentPoints = analytics.trend.current.map((d) => ({
        x: formatDayLabel(d.date),
        y: Math.max(0, Math.round(d.value / 100)),
      }));
      prevPoints = (analytics.trend.previous ?? []).map((d) => ({
        x: formatDayLabel(d.date),
        y: Math.max(0, Math.round(d.value / 100)),
      }));
      valueFormat = (v) => `£${Math.round(v)}`;

      const maxPoint = currentPoints.reduce((max, p) => (p.y > max.y ? p : max), { x: '', y: 0 });
      if (maxPoint.y > 0) {
        peakText = `Peak: £${maxPoint.y} (${maxPoint.x})`;
      }
      if (heroValue != null && heroValue > 0) {
        avgText = `Avg: £${Math.round(heroValue / periodDays)}/day`;
      }
    } else if (activeDimension === 'orders') {
      if (!hasDaily) {
        return { currentPoints: [], prevPoints: [], peakText: null, avgText: null, valueFormat: (v: number) => String(Math.round(v)) };
      }
      currentPoints = dailyBreakdown.map((d) => ({
        x: formatDayLabel(d.date),
        y: d.sales,
      }));
      valueFormat = (v) => `${Math.round(v)}`;
      const maxPoint = currentPoints.reduce((max, p) => (p.y > max.y ? p : max), { x: '', y: 0 });
      if (maxPoint.y > 0) {
        peakText = `Peak: ${Math.round(maxPoint.y)} ${maxPoint.y === 1 ? 'order' : 'orders'} (${maxPoint.x})`;
      }
      if (itemsSold != null && itemsSold > 0) {
        avgText = `Avg: ${(itemsSold / periodDays).toFixed(1)}/day`;
      }
    } else if (activeDimension === 'views') {
      if (!hasDaily) {
        return { currentPoints: [], prevPoints: [], peakText: null, avgText: null, valueFormat: (v: number) => String(Math.round(v)) };
      }
      currentPoints = dailyBreakdown.map((d) => ({
        x: formatDayLabel(d.date),
        y: d.views,
      }));
      valueFormat = (v) => `${Math.round(v)}`;
      const maxPoint = currentPoints.reduce((max, p) => (p.y > max.y ? p : max), { x: '', y: 0 });
      if (maxPoint.y > 0) {
        peakText = `Peak: ${Math.round(maxPoint.y)} views (${maxPoint.x})`;
      }
      if (totalViews != null && totalViews > 0) {
        avgText = `Avg: ${Math.round(totalViews / periodDays)} views/day`;
      }
    } else if (activeDimension === 'conversion') {
      if (!hasDaily) {
        return { currentPoints: [], prevPoints: [], peakText: null, avgText: null, valueFormat: (v: number) => `${v.toFixed(1)}%` };
      }
      currentPoints = analytics.trend.current.map((d) => {
        const dailyItem = dailyMap.get(d.date);
        if (!dailyItem) return { x: formatDayLabel(d.date), y: 0 };
        const dayViews = dailyItem.views;
        const dayOrders = dailyItem.sales;
        const rate = dayViews > 0 ? (dayOrders / dayViews) * 100 : 0;
        return {
          x: formatDayLabel(d.date),
          y: Math.min(100, Math.round(rate * 10) / 10),
        };
      });
      valueFormat = (v) => `${v.toFixed(1)}%`;
      if (conversionRate != null) {
        peakText = `Store Avg: ${conversionRate.toFixed(1)}%`;
        avgText = `${itemsSold ?? 0} orders / ${totalViews ?? 0} views`;
      }
    }

    return { currentPoints, prevPoints, peakText, avgText, valueFormat };
  }, [analytics, dailyBreakdown, activeDimension, periodDays, heroValue, itemsSold, totalViews, conversionRate]);

  const chartSeries = useMemo<ChartSeries[]>(() => {
    if (dimensionChartData.currentPoints.length === 0) return [];
    return [
      { label: `This ${periodLabel}`, color: colors.brand, data: dimensionChartData.currentPoints },
      ...(dimensionChartData.prevPoints.length > 0
        ? [{ label: `Previous ${periodLabel}`, color: colors.textMuted, data: dimensionChartData.prevPoints }]
        : []),
    ];
  }, [dimensionChartData, periodLabel, colors]);

  // ── Sales sparkline (hero) — real daily net-sales values from the trend series.
  // Y values only, in major units; empty when no daily data exists (never fabricated).
  const salesSparklineValues = useMemo<number[]>(() => {
    const trend = analytics?.trend?.current;
    if (!trend || trend.length === 0) return [];
    return trend.map((d) => Math.max(0, Math.round(d.value / 100)));
  }, [analytics]);

  // ── Category & Portfolio Mix ──
  const categoryMix = useMemo(() => {
    if (listings.length === 0) return [];
    const map = new Map<string, { count: number; totalGbp: number }>();
    let totalStoreValue = 0;
    for (const item of listings) {
      const cat = item.category || 'Uncategorized';
      const price = item.priceGbp || 0;
      totalStoreValue += price;
      const existing = map.get(cat) || { count: 0, totalGbp: 0 };
      map.set(cat, { count: existing.count + 1, totalGbp: existing.totalGbp + price });
    }
    const colorPalette = [colors.brand, colors.textSecondary, colors.textMuted, colors.success];
    return Array.from(map.entries())
      .map(([category, stats], i) => ({
        category,
        count: stats.count,
        totalGbp: stats.totalGbp,
        pct: totalStoreValue > 0 ? Math.max(2, Math.round((stats.totalGbp / totalStoreValue) * 100)) : 0,
        color: colorPalette[i % colorPalette.length],
      }))
      .sort((a, b) => b.totalGbp - a.totalGbp);
  }, [listings, colors]);

  // ── Conversion Funnel Pipeline ──
  const funnelPipeline = useMemo(() => {
    if (!analytics?.funnel) return null;
    const f = analytics.funnel;
    const stages = [
      { id: 'impressions', label: 'Discovery Impressions', value: f.impressions },
      { id: 'views', label: 'Qualified Detail Views', value: f.views },
      { id: 'saves', label: 'Vault Saves', value: f.saves },
      { id: 'offers', label: 'Direct Offers & Inquiries', value: f.offers },
      { id: 'purchases', label: 'Settled Sales', value: f.purchases },
    ];
    return { stages };
  }, [analytics]);

  // ── Enriched Top Performers ──
  const topPerformers = useMemo(() => {
    const listingMap = new Map(listings.map((l) => [l.id, l]));
    return topPerformersData.map((t) => {
      const listing = listingMap.get(t.id);
      return {
        id: t.id,
        title: t.title,
        price: t.priceGbpMinor / 100,
        views: t.viewsCount,
        likes: t.likesCount,
        status: t.status,
        imageUrl: listing?.imageUrl ?? listing?.images?.[0] ?? null,
      };
    });
  }, [listings, topPerformersData]);

  // ── Enriched Needs Attention ──
  const needsAttention = useMemo(() => {
    const listingMap = new Map(listings.map((l) => [l.id, l]));
    return needsAttentionData.map((a) => {
      const listing = listingMap.get(a.listingId);
      return {
        id: a.listingId,
        title: a.title,
        price: a.priceGbp,
        views: a.views,
        likes: a.likes,
        offers: a.offerCount,
        status: a.status,
        reason: a.reason,
        imageUrl: a.coverImageUrl ?? listing?.imageUrl ?? listing?.images?.[0] ?? null,
      };
    });
  }, [listings, needsAttentionData]);


  // ── Funnel Bottleneck & Conversion Levers (Shopify 2026 Mobile Model) ──
  const funnelBottleneck = useMemo<{
    stageFrom: string;
    stageTo: string;
    dropOffPct: number;
    recommendation: string;
  } | null>(() => {
    if (!funnelPipeline || funnelPipeline.stages.length < 2) return null;
    let maxDrop = -1;
    let result: { stageFrom: string; stageTo: string; dropOffPct: number; recommendation: string } | null = null;
    for (let i = 1; i < funnelPipeline.stages.length; i++) {
      const prev = funnelPipeline.stages[i - 1].value;
      const curr = funnelPipeline.stages[i].value;
      if (prev > 0) {
        const dropPct = Math.round(((prev - curr) / prev) * 100);
        if (dropPct > maxDrop && dropPct > 30) {
          maxDrop = dropPct;
          const recs: Record<string, string> = {
            views: 'Optimize cover photos and titles to lift discovery click-through',
            saves: 'Benchmark asking price against market median to drive vault saves',
            offers: 'Promote to likers or set an offer floor to encourage inquiries',
            purchases: 'Accelerate dispatch SLAs to convert offers into settled sales',
          };
          result = {
            stageFrom: funnelPipeline.stages[i - 1].label,
            stageTo: funnelPipeline.stages[i].label,
            dropOffPct: dropPct,
            recommendation: recs[funnelPipeline.stages[i].id] ?? 'Optimize listing details and pricing',
          };
        }
      }
    }
    return result;
  }, [funnelPipeline]);

  const peerConversionBenchmark = 3.2; // Top 20% second-hand archival peer benchmark
  const aovValue = analytics?.aovGbpMinor != null ? analytics.aovGbpMinor / 100 : avgOrderValue;
  const repeatBuyerRate = analytics?.repeatBuyerPct ?? null;

 return { currentListingItem, heroLabel, heroValue, itemsSold, totalViews, activeListings, avgRating, reviewCount, avgOrderValue, aovValue, repeatBuyerRate, conversionRate, peerConversionBenchmark, funnelBottleneck, deltaPct, revenueDelta, itemsSoldDelta, viewsDelta, prevRevenueGbp, periodDays, periodLabel, dimensionChartData, chartSeries, salesSparklineValues, categoryMix, funnelPipeline, topPerformers, needsAttention };
}
