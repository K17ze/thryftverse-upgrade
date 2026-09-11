import React, { useRef, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, Pressable } from 'react-native';
import { Space, Radius, Control } from '../theme/designTokens';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { EmptyState } from '../components/EmptyState';
import { OfflineBanner } from '../components/OfflineBanner';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { haptics } from '../utils/haptics';
import { useSellerAnalytics, type Period } from '../components/seller/analytics/useSellerAnalytics';
import { AnalyticsDateRangeSheet } from '../components/seller/analytics/AnalyticsDateRangeSheet';
import { ListingAnalyticsDetail } from '../components/seller/analytics/ListingAnalyticsDetail';
import { AnalyticsOverview } from '../components/seller/analytics/AnalyticsOverview';
import { AnalyticsPortfolio } from '../components/seller/analytics/AnalyticsPortfolio';
import { AnalyticsListings } from '../components/seller/analytics/AnalyticsListings';
import { AnalyticsListingScope } from '../components/seller/analytics/AnalyticsListingScope';
export type { MetricDimension, ChartViewMode } from '../components/seller/analytics/useSellerAnalytics';

/**
 * Seller Analytics Domain Architecture Specifications & Section Contracts
 */
export const SELLER_ANALYTICS_DIMENSIONS = [
  'Net Sales Trajectory',
  'Order Volume',
  'Store Traffic',
  'Conversion Trajectory',
] as const;

export const SELLER_CONVERSION_STAGES = [
  'Discovery Impressions',
  'Qualified Detail Views',
  'Vault Saves',
  'Direct Offers & Inquiries',
  'Settled Sales',
] as const;

export const SELLER_ANALYTICS_SECTIONS = {
  journey: 'Conversion journey',
  categoryMix: 'Inventory category mix',
  priceSpectrum: 'Market price spectrum',
  pricingStrategy: 'Price adjustments',
  velocity: 'Velocity opportunities',
} as const;

const PRESET_OPTIONS: { key: '7d' | '30d' | '90d'; label: string }[] = [
  { key: '7d', label: '7d' },
  { key: '30d', label: '30d' },
  { key: '90d', label: '90d' },
];

function isCustomPeriod(period: Period): period is { startDate: string; endDate: string } {
  return typeof period !== 'string';
}

function formatCustomRangeLabel(period: { startDate: string; endDate: string }): string {
  const start = new Date(period.startDate + 'T00:00:00.000Z');
  const end = new Date(period.endDate + 'T00:00:00.000Z');
  const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return `${fmt(start)} – ${fmt(end)}`;
}


export default function SellerAnalyticsScreen() {
 const model = useSellerAnalytics();
 const { a11yRef, styles, colors, navigation, selectedListingId, isLoading, isError, hasZeroListings, load, isOffline, onRefresh, partialError, isRefreshing, period, setPeriod, handleListingSelect, listings } = model;
 const [isRangeSheetVisible, setRangeSheetVisible] = useState(false);
 const customTriggerRef = useRef<View>(null);

 const isCustom = isCustomPeriod(period);
  // ── Loading state ──
  if (isLoading) {
    return (
      <FlagshipScreen
        scrollEnabled={false}
        header={<FlagshipHeader title={selectedListingId ? 'Listing Analytics' : 'Seller Analytics'} onBack={() => navigation.goBack()} />}
      >
        <View style={styles.scrollContent}>
          <View style={styles.periodRowSkeleton}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={[styles.skeletonBlock, { width: 48, height: 20 }]} />
            ))}
          </View>
          <View style={{ height: Space.md }} />
          <View style={[styles.skeletonBlock, { width: 120, height: 16 }]} />
          <View style={{ height: Space.xs }} />
          <View style={[styles.skeletonBlock, { width: 180, height: 32 }]} />
          <View style={{ height: Space.lg }} />
          <View style={[styles.skeletonBlock, { height: 210, borderRadius: Radius.md }]} />
          <View style={{ height: Space.lg }} />
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={styles.skeletonKpiRow}>
              <View style={[styles.skeletonBlock, { width: '35%', height: 16 }]} />
              <View style={{ flex: 1 }} />
              <View style={[styles.skeletonBlock, { width: 72, height: 16 }]} />
            </View>
          ))}
        </View>
      </FlagshipScreen>
    );
  }

  // ── Error state ──
  if (isError && listings.length === 0) {
    return (
      <FlagshipScreen
        scrollEnabled={false}
        header={<FlagshipHeader title={selectedListingId ? 'Listing Analytics' : 'Seller Analytics'} onBack={() => navigation.goBack()} />}
      >
        <EmptyState
          icon="cloud-offline-outline"
          iconColor={colors.danger}
          title="Couldn't load analytics"
          subtitle="Check your connection and try again."
          ctaLabel="Retry"
          onCtaPress={() => void load()}
        />
      </FlagshipScreen>
    );
  }

  // ── Empty state: 0 listings ──
  if (hasZeroListings) {
    return (
      <FlagshipScreen
        ref={a11yRef}
        header={<FlagshipHeader title="Seller Analytics" onBack={() => navigation.goBack()} />}
      >
        <EmptyState
          icon="analytics"
          title="No listings yet"
          subtitle="Start selling to see your analytics"
          ctaLabel="List an item"
          onCtaPress={() => navigation.navigate('Sell')}
        />
      </FlagshipScreen>
    );
  }

  return (
    <FlagshipScreen
      ref={a11yRef}
      header={
        <FlagshipHeader
          title={selectedListingId ? 'Listing Analytics' : 'Seller Analytics'}
          onBack={() => navigation.goBack()}
          rightAction={
            selectedListingId ? (
              <Pressable
                onPress={() => handleListingSelect(null)}
                style={styles.clearScopeButton}
                accessibilityRole="button"
                accessibilityLabel="View all store analytics"
                accessibilityHint="Returns to overall store performance overview"
                hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
              >
                <Text style={[styles.clearScopeText, { color: colors.brand }]}>Store Overview</Text>
              </Pressable>
            ) : undefined
          }
        />
      }
      scrollEnabled={false}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
    >
      {isOffline ? <OfflineBanner onRetry={() => void onRefresh()} /> : null}

      {partialError ? (
        <View style={[styles.partialBanner, { borderBottomColor: colors.border }]}>
          <Text style={[styles.partialBannerText, { color: colors.textMuted }]}>
            Some analytics could not be loaded · pull down to retry
          </Text>
        </View>
      ) : null}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
      >
        {/* ── Period Selector — segmented control with custom range ── */}
        <View style={styles.periodSegmentControl}>
          {PRESET_OPTIONS.map((opt) => {
            const isActive = period === opt.key;
            return (
              <AnimatedPressable
                key={opt.key}
                style={[styles.periodSegmentOption, isActive && styles.periodSegmentOptionActive]}
                onPress={() => {
                  haptics.tap();
                  setPeriod(opt.key);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Period: ${opt.label}`}
                accessibilityHint={`Filters analytics to the last ${opt.label}`}
                accessibilityState={{ selected: isActive }}
                hitSlop={{ top: 4, bottom: 4 }}
              >
                <Text
                  style={[
                    styles.periodSegmentText,
                    { color: isActive ? colors.textPrimary : colors.textMuted },
                    isActive && styles.periodSegmentTextActive,
                  ]}
                >
                  {opt.label}
                </Text>
              </AnimatedPressable>
            );
          })}
          <View ref={customTriggerRef} collapsable={false}>
            <AnimatedPressable
              style={[styles.periodSegmentOption, isCustom && styles.periodSegmentOptionActive]}
              onPress={() => {
                haptics.tap();
                setRangeSheetVisible(true);
              }}
              accessibilityRole="button"
              accessibilityLabel="Custom date range"
              accessibilityHint="Opens a date picker to select a custom analytics range"
              accessibilityState={{ selected: isCustom }}
              hitSlop={{ top: 4, bottom: 4 }}
            >
              <Text
                style={[
                  styles.periodSegmentText,
                  { color: isCustom ? colors.textPrimary : colors.textMuted },
                  isCustom && styles.periodSegmentTextActive,
                ]}
              >
                Custom
              </Text>
            </AnimatedPressable>
          </View>
        </View>

        {/* Active custom range label — shown only when a custom range is applied */}
        {isCustom ? (
          <Text
            style={[styles.customRangeLabel, { color: colors.textMuted }]}
            accessibilityLabel={`Custom range: ${formatCustomRangeLabel(period)}`}
            accessibilityHint="Tap Custom to change the date range"
          >
            {formatCustomRangeLabel(period)}
          </Text>
        ) : null}

        {/* ========================================================================= */}
        {/* VIEW A: SPECIFIC LISTING DEEP-DIVE                                        */}
        {/* ========================================================================= */}
        {selectedListingId ? (
<ListingAnalyticsDetail model={model} />
        ) : (
          <>
            <AnalyticsOverview model={model} />
            <AnalyticsPortfolio model={model} />
            <AnalyticsListings model={model} />
            <AnalyticsListingScope model={model} />
          </>
        )}
      </ScrollView>

      {/* ── Custom Date Range Bottom Sheet ── */}
      <AnalyticsDateRangeSheet
        visible={isRangeSheetVisible}
        onDismiss={() => setRangeSheetVisible(false)}
        onApply={(startDate, endDate) => {
          setPeriod({ startDate, endDate });
        }}
        initialStartDate={isCustom ? period.startDate : undefined}
        initialEndDate={isCustom ? period.endDate : undefined}
        triggerRef={customTriggerRef as React.RefObject<View>}
      />
    </FlagshipScreen>
  );
}
