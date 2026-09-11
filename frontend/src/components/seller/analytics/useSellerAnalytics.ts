import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppTheme } from '../../../theme/ThemeContext';
import { RootStackParamList } from '../../../navigation/types';
import { useStore } from '../../../store/useStore';
import { fetchUserListingsFromApi, ListingApiItem } from '../../../services/listingsApi';
import {
  fetchSellerAnalytics,
  fetchTopPerformers,
  fetchNeedsAttention,
  fetchListingAnalytics,
  fetchDailyBreakdown,
  type SellerAnalytics,
  type TopPerformerListing,
  type NeedsAttentionListing,
  type ListingAnalyticsData,
  type DailyBreakdownPoint,
  type AnalyticsPeriod,
} from '../../../services/commerceApi';
import { useConnectivity } from '../../../hooks/useConnectivity';
import { haptics } from '../../../utils/haptics';
import { track } from '../../../analytics';
import { useFormattedPrice } from '../../../hooks/useFormattedPrice';
import { useA11yAudit } from '../../../hooks/useA11yAudit';

type NavT = NativeStackNavigationProp<RootStackParamList>;
type SellerAnalyticsRoute = RouteProp<RootStackParamList, 'SellerAnalytics'>;

export type Period = AnalyticsPeriod;
export type MetricDimension = 'sales' | 'orders' | 'views' | 'conversion';
export type ChartViewMode = 'bar' | 'line';

/**
 * Custom date range validation result.
 * Returns null when valid, or an error message describing the problem.
 */
export function validateCustomRange(startDate: string, endDate: string): string | null {
  const start = new Date(startDate + 'T00:00:00.000Z');
  const end = new Date(endDate + 'T00:00:00.000Z');
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return 'Enter valid dates';
  }
  const today = new Date();
  today.setUTCHours(23, 59, 59, 999);
  if (start > today || end > today) {
    return 'Dates cannot be in the future';
  }
  const diffDays = (end.getTime() - start.getTime()) / 86400000;
  if (diffDays < 0) {
    return 'Start must be before end';
  }
  if (diffDays > 365) {
    return 'Range cannot exceed 365 days';
  }
  return null;
}

import { createAnalyticsStyles as createStyles } from './analyticsStyles';
import { useAnalyticsInsights } from './useAnalyticsInsights';

export function useSellerAnalytics() {
  const a11yRef = useRef<any>(null);
  useA11yAudit(a11yRef, 'SellerAnalyticsScreen');
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<NavT>();
  const route = useRoute<SellerAnalyticsRoute>();
  const currentUser = useStore((s) => s.currentUser);
  const { isOffline } = useConnectivity();
  const { formatFromFiat, currencyCode } = useFormattedPrice();

  // ── Listing context ──
  const routeListingId = route.params?.listingId;
  const [selectedListingId, setSelectedListingId] = useState<string | null>(routeListingId ?? null);

  const [listings, setListings] = useState<ListingApiItem[]>([]);
  const [analytics, setAnalytics] = useState<SellerAnalytics | null>(null);
  const [topPerformersData, setTopPerformersData] = useState<TopPerformerListing[]>([]);
  const [needsAttentionData, setNeedsAttentionData] = useState<NeedsAttentionListing[]>([]);
  const [listingAnalytics, setListingAnalytics] = useState<ListingAnalyticsData | null>(null);
  const [dailyBreakdown, setDailyBreakdown] = useState<DailyBreakdownPoint[]>([]);

  const [period, setPeriod] = useState<Period>('30d');
  const [activeDimension, setActiveDimension] = useState<MetricDimension>('sales');
  const [chartViewMode, setChartViewMode] = useState<ChartViewMode>('bar');

  const [isLoading, setIsLoading] = useState(true);
  const [isListingLoading, setIsListingLoading] = useState(false);
  const [listingError, setListingError] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isError, setIsError] = useState(false);
  const [partialError, setPartialError] = useState(false);

  useEffect(() => {
    if (route.params?.listingId && route.params.listingId !== selectedListingId) {
      setSelectedListingId(route.params.listingId);
    }
  }, [route.params?.listingId, selectedListingId]);

  const loadGeneralAnalytics = useCallback(async () => {
    if (!currentUser?.id) return;
    try {
      setPartialError(false);
      // Track which sources failed so we can distinguish a genuine empty
      // result from a fetch failure. Previously, .catch(() => []) made
      // failed top-performers / attention / daily queries look identical
      // to "no data" — the UI would silently backfill from local listings
      // instead of showing an error state.
      let hadPartialFailure = false;
      const [listingsRes, analyticsData, topData, attentionData, dailyData] = await Promise.all([
        fetchUserListingsFromApi(currentUser.id, { limit: 100 }),
        fetchSellerAnalytics(currentUser.id, period).catch(() => { hadPartialFailure = true; return null; }),
        fetchTopPerformers(currentUser.id, 10, period).catch(() => { hadPartialFailure = true; return []; }),
        fetchNeedsAttention(currentUser.id, 5, period).catch(() => { hadPartialFailure = true; return []; }),
        fetchDailyBreakdown(currentUser.id, period).catch(() => { hadPartialFailure = true; return []; }),
      ]);
      setListings(listingsRes.items);
      if (analyticsData) {
        setAnalytics(analyticsData);
      } else {
        hadPartialFailure = true;
      }
      setTopPerformersData(topData);
      setNeedsAttentionData(attentionData);
      setDailyBreakdown(dailyData);
      setPartialError(hadPartialFailure);
      setIsError(false);
    } catch {
      setIsError(true);
    }
  }, [currentUser?.id, period]);

  const loadListingAnalytics = useCallback(async (listingId: string) => {
    if (!currentUser?.id) return;
    setIsListingLoading(true);
    setListingError(false);
    try {
      const data = await fetchListingAnalytics(currentUser.id, listingId, period);
      setListingAnalytics(data);
    } catch {
      setListingAnalytics(null);
      setListingError(true);
    } finally {
      setIsListingLoading(false);
    }
  }, [currentUser?.id, period]);

  const load = useCallback(async () => {
    await loadGeneralAnalytics();
    // Listing analytics are fetched by the selectedListingId effect below —
    // no duplicate call here.
  }, [loadGeneralAnalytics]);

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    load().finally(() => {
      if (mounted) setIsLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [load]);

  useEffect(() => {
    if (selectedListingId) {
      void loadListingAnalytics(selectedListingId);
    } else {
      setListingAnalytics(null);
    }
  }, [selectedListingId, loadListingAnalytics]);

  useEffect(() => {
    track('seller_dashboard_viewed', { scopedListingId: selectedListingId ?? undefined });
  }, [selectedListingId]);

  const onRefresh = async () => {
    setIsRefreshing(true);
    await load();
    setIsRefreshing(false);
  };

  const insights = useAnalyticsInsights({ listings, selectedListingId, analytics, period, activeDimension, dailyBreakdown, topPerformersData, needsAttentionData, colors, formatFromFiat });
  const hasZeroListings = listings.length === 0 && !isLoading && !isError;

  const handleListingSelect = (id: string | null) => {
    haptics.selection();
    setSelectedListingId(id);
  };

  const handleDimensionChange = (dim: MetricDimension) => {
    haptics.selection();
    setActiveDimension(dim);
  };

  return { a11yRef, colors, styles, navigation, currentUser, isOffline, formatFromFiat, currencyCode, selectedListingId, listings, analytics, listingAnalytics, period, setPeriod, activeDimension, chartViewMode, setChartViewMode, isLoading, isListingLoading, listingError, isRefreshing, isError, partialError, loadListingAnalytics, load, onRefresh, hasZeroListings, handleListingSelect, handleDimensionChange, ...insights };
}
export type SellerAnalyticsModel = ReturnType<typeof useSellerAnalytics>;
