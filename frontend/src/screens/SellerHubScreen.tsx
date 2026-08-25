import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppTheme } from '../theme/ThemeContext';
import { Space, Type, Typography, Radius, Control } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { RootStackParamList } from '../navigation/types';

import { AppButton } from '../components/ui/AppButton';
import { AnimatedPressable } from '../components/AnimatedPressable';
import {
  FlagshipScreen,
  FlagshipHeader,
  FlagshipState,
  FlagshipFormSection,
  FlagshipNavigationRow,
  FlagshipMetricLine,
} from '../components/flagship';
import { CachedImage } from '../components/CachedImage';
import { useStore } from '../store/useStore';
import { useSellerTrust } from '../platform/product';
import { fetchUserListingsFromApi, ListingApiItem } from '../services/listingsApi';
import { fetchImportBatches, type BatchSummaryDTO, type CatalogSource } from '../services/catalogImportApi';
import { haptics } from '../utils/haptics';
import { OfflineBanner } from '../components/OfflineBanner';
import { track } from '../analytics';
import { t } from '../i18n';


type NavT = NativeStackNavigationProp<RootStackParamList>;

// Task / attention item -- derived only from real listing + trust data.
// No fabricated order/offer/payout counts. Each item maps to a real screen.
interface TaskItem {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  subtitle: string;
  onPress: () => void;
  accessibilityLabel: string;
}

// Recent activity item -- derived from real listing timestamps.
// Only shows listings with a meaningful recent state change.
interface ActivityItem {
  id: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  iconColor: string;
  title: string;
  subtitle: string;
  imageUrl?: string | null;
  onPress: () => void;
}

// ── Catalogue import helpers (blueprint §5.1) ──
// Maps a batch's source + status to the human-readable label shown in the
// Seller Hub "Catalogue imports" section. Only batches that are in-progress
// or recently finished are surfaced — stale completed batches fall away.
const IMPORT_SOURCE_LABEL: Record<CatalogSource, string> = {
  ebay: 'eBay import',
  seller_package: 'Catalogue upload',
  depop: 'Depop import',
  vinted: 'Vinted import',
};

const IN_PROGRESS_STATES: ReadonlySet<string> = new Set([
  'created', 'discovering', 'hydrating', 'ingesting_media', 'normalising',
  'publishing', 'paused_rate_limit', 'paused_reauth', 'failed_recoverable',
  'cancelling',
]);

function importBatchStatusText(batch: BatchSummaryDTO): string {
  if (IN_PROGRESS_STATES.has(batch.status)) return 'In progress';
  if (batch.status === 'awaiting_seller' || batch.status === 'awaiting_operator') {
    return `${batch.readyCount} ready to review`;
  }
  if (batch.status === 'completed') return `${batch.publishedCount} live`;
  if (batch.status === 'approved') return 'Approved · publishing';
  if (batch.status === 'cancelled') return 'Cancelled';
  return batch.status;
}

// ── Dashboard card primitive ──
// Flat, no card chrome. Icon + value + label. Uses typography hierarchy
// per AGENTS.md §4: hierarchy from typography and alignment, not boxes.
function DashboardCard({
  icon,
  value,
  label,
  tone,
  onPress,
  accessibilityLabel,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  value: string;
  label: string;
  tone?: 'success' | 'brand' | 'default';
  onPress?: () => void;
  accessibilityLabel: string;
}) {
  const { colors } = useAppTheme();
  const color = tone === 'success' ? colors.success : tone === 'brand' ? colors.brand : colors.textPrimary;

  const content = (
    <View style={styles.dashCardInner}>
      <Ionicons name={icon} size={18} color={color} />
      <Text style={[styles.dashCardValue, { color: colors.textPrimary }]} numberOfLines={1}>{value}</Text>
      <Text style={[styles.dashCardLabel, { color: colors.textMuted }]} numberOfLines={1}>{label}</Text>
    </View>
  );

  if (onPress) {
    return (
      <AnimatedPressable
        style={styles.dashCard}
        onPress={() => { haptics.tap(); onPress(); }}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
      >
        {content}
      </AnimatedPressable>
    );
  }

  return <View style={styles.dashCard}>{content}</View>;
}

export default function SellerHubScreen() {
  const { colors } = useAppTheme();
  const navigation = useNavigation<NavT>();
  const currentUser = useStore((s) => s.currentUser);
  const { data: sellerTrust } = useSellerTrust(currentUser?.id);

  const [listings, setListings] = useState<ListingApiItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);

  // Catalogue import batches — past and in-progress (blueprint §5.1).
  const [importBatches, setImportBatches] = useState<BatchSummaryDTO[]>([]);

  const load = useCallback(async () => {
    if (!currentUser?.id) return;
    try {
      const res = await fetchUserListingsFromApi(currentUser.id, { limit: 100 });
      setListings(res.items);
      setLoadError(false);
    } catch {
      // Show a truthful error state rather than masking as empty
      // (AGENTS.md S11: truthful UI; S14: complete state coverage).
      setLoadError(true);
    }
    // Fetch catalogue import batches in parallel — failures are non-fatal
    // (the section simply omits itself when unavailable).
    fetchImportBatches()
      .then((batches) => { setImportBatches(batches); })
      .catch(() => { /* non-fatal — section hides gracefully */ });
  }, [currentUser?.id]);

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    load().finally(() => { if (mounted) setIsLoading(false); });
    return () => { mounted = false; };
  }, [load]);

  useEffect(() => { track('seller_dashboard_viewed'); }, []);

  const onRefresh = async () => {
    setIsRefreshing(true);
    await load();
    setIsRefreshing(false);
  };

  // Honest inventory metrics -- computed from real listing data.
  // "Listed value" is the sum of active listing asking prices, NOT revenue.
  // There is no backend payout/balance aggregate, so we do not show one.
  const metrics = useMemo(() => {
    const active = listings.filter((l) => l.status === 'active');
    const sold = listings.filter((l) => l.status === 'sold');
    const paused = listings.filter((l) => l.status === 'paused');
    const drafts = listings.filter((l) => l.status === 'draft');
    const totalActiveValue = active.reduce((sum, l) => sum + l.priceGbp, 0);
    const totalViews = listings.reduce((sum, l) => sum + (l.engagement?.views ?? 0), 0);
    return {
      activeCount: active.length,
      soldCount: sold.length,
      pausedCount: paused.length,
      draftCount: drafts.length,
      total: listings.length,
      totalActiveValue,
      totalViews,
    };
  }, [listings]);

  // "Needs you" tasks -- only items derivable from real listing + trust data.
  // Per audit 10: "seller home surfaces what needs attention." We do not
  // fabricate ship/offer tasks because no order/offer data source exists here.
  const tasks = useMemo<TaskItem[]>(() => {
    const items: TaskItem[] = [];

    if (metrics.draftCount > 0) {
      items.push({
        icon: 'document-text-outline',
        title: `Complete ${metrics.draftCount} draft listing${metrics.draftCount === 1 ? '' : 's'}`,
        subtitle: 'Finish and publish to make them live',
        onPress: () => navigation.navigate('InventoryManagement'),
        accessibilityLabel: `${metrics.draftCount} draft listings to complete`,
      });
    }

    const missingDetails = listings.filter(
      (l) =>
        l.status === 'active' &&
        (!l.brand || !l.size || !l.condition || !l.category || l.images.length === 0),
    );
    if (missingDetails.length > 0) {
      items.push({
        icon: 'create-outline',
        title: `${missingDetails.length} listing${missingDetails.length === 1 ? '' : 's'} missing details`,
        subtitle: 'Add brand, size, condition or photos',
        onPress: () => navigation.navigate('InventoryManagement'),
        accessibilityLabel: `${missingDetails.length} listings missing details`,
      });
    }

    const unanswered = listings.filter(
      (l) => l.engagement && l.engagement.questionCount > l.engagement.answeredQuestionCount,
    );
    if (unanswered.length > 0) {
      items.push({
        icon: 'chatbubble-ellipses-outline',
        title: `${unanswered.length} listing${unanswered.length === 1 ? '' : 's'} with buyer questions`,
        subtitle: 'Reply to keep buyers engaged',
        onPress: () => navigation.navigate('Inbox'),
        accessibilityLabel: `${unanswered.length} listings with unanswered buyer questions`,
      });
    }

    if (metrics.pausedCount > 0) {
      items.push({
        icon: 'pause-outline',
        title: `Review ${metrics.pausedCount} paused listing${metrics.pausedCount === 1 ? '' : 's'}`,
        subtitle: 'Resume or relist when ready',
        onPress: () => navigation.navigate('MyListings'),
        accessibilityLabel: `${metrics.pausedCount} paused listings to review`,
      });
    }

    if (sellerTrust && !sellerTrust.verified) {
      items.push({
        icon: 'shield-checkmark-outline',
        title: 'Get verified to sell',
        subtitle: 'Build buyer trust with a verified badge',
        onPress: () => navigation.navigate('KYCVerification'),
        accessibilityLabel: 'Complete identity verification',
      });
    }

    return items;
  }, [listings, metrics, sellerTrust, navigation]);

  // ── Recent activity feed ──
  // Derived from real listing data: recently created, sold, or paused listings.
  // Sorted by createdAt descending. Shows at most 4 items.
  // Only includes listings with a real timestamp.
  const recentActivity = useMemo<ActivityItem[]>(() => {
    const now = Date.now();
    const ninetyDaysAgo = now - 90 * 24 * 60 * 60 * 1000;
    return listings
      .filter((l) => {
        const created = new Date(l.createdAt).getTime();
        return !Number.isNaN(created) && created > ninetyDaysAgo;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 4)
      .map((l) => {
        const isSold = l.status === 'sold';
        const isPaused = l.status === 'paused';
        return {
          id: l.id,
          icon: isSold ? 'checkmark-circle' : isPaused ? 'pause-circle' : 'pricetag',
          iconColor: isSold ? colors.success : isPaused ? colors.warning : colors.brand,
          title: l.title,
          subtitle: isSold
            ? `Sold · £${l.priceGbp.toFixed(2)}`
            : isPaused
              ? 'Paused'
              : `Listed · £${l.priceGbp.toFixed(2)}`,
          imageUrl: l.imageUrl ?? l.images?.[0] ?? null,
          onPress: () => navigation.navigate('ManageListing', { itemId: l.id }),
        };
      });
  }, [listings, colors, navigation]);

  // ── Catalogue import batches visible in the Hub (blueprint §5.1) ──
  // Show in-progress batches first, then recently completed/cancelled ones
  // (within 30 days). Stale terminal batches are dropped to keep the section
  // honest and uncluttered.
  const visibleImportBatches = useMemo(() => {
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    return importBatches
      .filter((b) => {
        if (IN_PROGRESS_STATES.has(b.status) || b.status === 'awaiting_seller' || b.status === 'awaiting_operator' || b.status === 'approved') {
          return true;
        }
        const updated = new Date(b.updatedAt).getTime();
        return !Number.isNaN(updated) && updated > thirtyDaysAgo;
      })
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 4);
  }, [importBatches]);

  const isVerified = sellerTrust?.verified === true;
  const hasListings = metrics.total > 0;
  const isNewSeller = !hasListings && !sellerTrust?.completedSales;

  // ── Performance metrics from sellerTrust (real backend data) ──
  const hasPerformanceData = !!(
    sellerTrust?.responseRate != null ||
    sellerTrust?.dispatchTimeLabel != null ||
    sellerTrust?.responseTimeLabel != null
  );

  if (isLoading) {
    return (
      <FlagshipScreen
        header={<FlagshipHeader title="Seller Hub" onBack={() => navigation.goBack()} />}
      >
        <FlagshipState variant="loading" />
      </FlagshipScreen>
    );
  }

  if (loadError) {
    return (
      <FlagshipScreen
        header={<FlagshipHeader title="Seller Hub" onBack={() => navigation.goBack()} />}
      >
        <FlagshipState
          variant="error"
          title="Couldn't load your shop"
          subtitle="Check your connection and try again."
          actionLabel="Retry"
          onAction={() => {
            setLoadError(false);
            setIsLoading(true);
            load().finally(() => setIsLoading(false));
          }}
        />
      </FlagshipScreen>
    );
  }

  return (
    <FlagshipScreen
      header={<FlagshipHeader title="Seller Hub" onBack={() => navigation.goBack()} />}
      scrollEnabled={false}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
    >
      <OfflineBanner onRetry={() => void onRefresh()} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
      >
        {/* ── Verification status indicator ──
            Prominent when not verified; subtle when verified.
            Per research: verification status indicator on seller dashboard. */}
        {!isVerified && (
          <Pressable
            style={({ pressed }) => [
              styles.verificationBanner,
              { backgroundColor: colors.warningSubtle, borderColor: colors.warningBorder },
              pressed && { opacity: 0.7 },
            ]}
            onPress={() => { haptics.tap(); navigation.navigate('KYCVerification'); }}
            accessibilityRole="button"
            accessibilityLabel="Get verified to build buyer trust"
            accessibilityHint="Opens the identity verification flow"
          >
            <Ionicons name="shield-checkmark-outline" size={18} color={colors.warning} />
            <View style={styles.verificationBannerText}>
              <Text style={[styles.verificationBannerTitle, { color: colors.textPrimary }]}>
                Get verified
              </Text>
              <Text style={[styles.verificationBannerSub, { color: colors.textSecondary }]}>
                Build buyer trust with a verified badge
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </Pressable>
        )}

        {/* ── Dashboard cards (2×2 grid) ──
            Per research: Active listings, Sales, Views, Earnings.
            Per AGENTS.md §4: flat, no card chrome. Uses typography hierarchy.
            "Listed value" is honest: sum of active asking prices, NOT revenue.
            No backend payout aggregate exists, so we label it truthfully. */}
        <View style={styles.dashGrid}>
          <DashboardCard
            icon="pricetag-outline"
            value={String(metrics.activeCount)}
            label="Active"
            tone="success"
            onPress={() => navigation.navigate('MyListings')}
            accessibilityLabel={`${metrics.activeCount} active listings`}
          />
          <DashboardCard
            icon="checkmark-done"
            value={String(metrics.soldCount)}
            label="Sold"
            tone="brand"
            onPress={() => navigation.navigate('MyListings')}
            accessibilityLabel={`${metrics.soldCount} sold listings`}
          />
          <DashboardCard
            icon="eye-outline"
            value={metrics.totalViews > 999 ? `${(metrics.totalViews / 1000).toFixed(1)}k` : String(metrics.totalViews)}
            label="Views"
            onPress={() => navigation.navigate('SellerAnalytics')}
            accessibilityLabel={`${metrics.totalViews} total views across all listings`}
          />
          <DashboardCard
            icon="cash-outline"
            value={`£${metrics.totalActiveValue.toFixed(0)}`}
            label="Listed value"
            onPress={() => navigation.navigate('SellerAnalytics')}
            accessibilityLabel={`£${metrics.totalActiveValue.toFixed(2)} total listed value`}
          />
        </View>

        {/* ── Quick actions row ──
            Per research: Add listing, View orders, Message buyers.
            Transparent 44pt targets with 20–24pt glyphs (AGENTS.md §4). */}
        <View style={styles.quickActionsRow}>
          <AnimatedPressable
            style={styles.quickAction}
            onPress={() => { haptics.tap(); navigation.navigate('Sell'); }}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Add a new listing"
            accessibilityHint="Opens the listing creation form"
          >
            <Ionicons name="add-circle-outline" size={22} color={colors.brand} />
            <Text style={[styles.quickActionLabel, { color: colors.textSecondary }]}>Add listing</Text>
          </AnimatedPressable>
          <AnimatedPressable
            style={styles.quickAction}
            onPress={() => { haptics.tap(); navigation.navigate('MyOrders'); }}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="View orders"
            accessibilityHint="Opens your orders"
          >
            <Ionicons name="receipt-outline" size={22} color={colors.brand} />
            <Text style={[styles.quickActionLabel, { color: colors.textSecondary }]}>Orders</Text>
          </AnimatedPressable>
          <AnimatedPressable
            style={styles.quickAction}
            onPress={() => { haptics.tap(); navigation.navigate('Inbox'); }}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Message buyers"
            accessibilityHint="Opens your inbox"
          >
            <Ionicons name="chatbubble-ellipses-outline" size={22} color={colors.brand} />
            <Text style={[styles.quickActionLabel, { color: colors.textSecondary }]}>Messages</Text>
          </AnimatedPressable>
        </View>

        {/* ── Needs you -- task-first, only real derivable tasks ── */}
        <FlagshipFormSection variant="flat" title="Needs you">
          {tasks.length > 0 ? (
            tasks.map((task) => (
              <FlagshipNavigationRow
                key={task.title}
                title={task.title}
                subtitle={task.subtitle}
                icon={task.icon}
                onPress={task.onPress}
                accessibilityLabel={task.accessibilityLabel}
              />
            ))
          ) : (
            <View style={styles.allCaughtUp}>
              <Text style={[styles.allCaughtUpText, { color: colors.textMuted }]} maxFontSizeMultiplier={1.3}>
                You're all caught up
              </Text>
            </View>
          )}
        </FlagshipFormSection>

        {/* ── Catalogue imports (blueprint §5.1) ──
            Past and in-progress import batches. Flat rows matching the
            existing FlagshipNavigationRow pattern — no card wrapping.
            When no batches exist, a single restrained "Import a shop" row
            serves as the entry point. */}
        <FlagshipFormSection variant="flat" title="Catalogue imports">
          {visibleImportBatches.length > 0 ? (
            visibleImportBatches.map((batch) => (
              <FlagshipNavigationRow
                key={batch.id}
                title={IMPORT_SOURCE_LABEL[batch.source] ?? 'Catalogue import'}
                subtitle={importBatchStatusText(batch)}
                icon="cube-outline"
                onPress={() => navigation.navigate('CatalogImportProgress', { batchId: batch.id })}
                accessibilityLabel={`${IMPORT_SOURCE_LABEL[batch.source] ?? 'Catalogue import'}, ${importBatchStatusText(batch)}`}
                accessibilityHint="Opens the import progress screen"
              />
            ))
          ) : (
            <FlagshipNavigationRow
              title="Import a shop"
              subtitle="Bring your existing listings from eBay or a file"
              icon="cube-outline"
              onPress={() => navigation.navigate('CatalogImportStart')}
              accessibilityLabel="Import a shop"
              accessibilityHint="Start a catalogue import from eBay or a file"
            />
          )}
        </FlagshipFormSection>

        {/* ── Recent activity feed ──
            Derived from real listing timestamps. Shows recently created,
            sold, or paused listings. Flat rows with thumbnail + status. */}
        {recentActivity.length > 0 && (
          <FlagshipFormSection variant="flat" title="Recent activity">
            {recentActivity.map((item) => (
              <Pressable
                key={item.id}
                style={({ pressed }) => [styles.activityRow, pressed && { opacity: 0.6 }]}
                onPress={() => { haptics.tap(); item.onPress(); }}
                accessibilityRole="button"
                accessibilityLabel={`${item.title}, ${item.subtitle}`}
                accessibilityHint="Opens listing management"
              >
                {item.imageUrl ? (
                  <CachedImage
                    uri={item.imageUrl}
                    style={styles.activityThumb}
                    containerStyle={styles.activityThumbWrap}
                    contentFit="cover"
                  />
                ) : (
                  <View style={[styles.activityThumbWrap, { backgroundColor: colors.surfaceAlt }]}>
                    <Ionicons name="pricetag-outline" size={16} color={colors.textMuted} />
                  </View>
                )}
                <View style={styles.activityInfo}>
                  <Text style={[styles.activityTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <View style={styles.activityMetaRow}>
                    <Ionicons name={item.icon} size={12} color={item.iconColor} />
                    <Text style={[styles.activityMeta, { color: colors.textSecondary }]} numberOfLines={1}>
                      {item.subtitle}
                    </Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </Pressable>
            ))}
          </FlagshipFormSection>
        )}

        {/* ── Performance metrics ──
            From real sellerTrust backend data: response rate, dispatch time.
            Only shows when the backend provides these fields. */}
        {hasPerformanceData && (
          <FlagshipFormSection variant="flat" title="Performance">
            {sellerTrust?.responseRate != null && (
              <FlagshipMetricLine
                label="Response rate"
                value={`${Math.round(sellerTrust.responseRate)}%`}
                success={sellerTrust.responseRate >= 80}
              />
            )}
            {sellerTrust?.responseTimeLabel && (
              <FlagshipMetricLine
                label="Response time"
                value={sellerTrust.responseTimeLabel}
                separated
              />
            )}
            {sellerTrust?.dispatchTimeLabel && (
              <FlagshipMetricLine
                label="Dispatch time"
                value={sellerTrust.dispatchTimeLabel}
                separated
              />
            )}
            {sellerTrust?.rating != null && sellerTrust.rating > 0 && (
              <FlagshipMetricLine
                label="Seller rating"
                value={`${sellerTrust.rating.toFixed(1)}`}
                subLabel={sellerTrust.reviewCount ? `${sellerTrust.reviewCount} review${sellerTrust.reviewCount === 1 ? '' : 's'}` : undefined}
                separated
              />
            )}
          </FlagshipFormSection>
        )}

        {/* ── New seller guidance ──
            Per research: seller tips/guidance if new seller.
            Only shows when the seller has no listings and no completed sales. */}
        {isNewSeller && (
          <View style={styles.newSellerCard}>
            <View style={styles.newSellerHeader}>
              <Ionicons name="bulb-outline" size={16} color={colors.brand} />
              <Text style={[styles.newSellerTitle, { color: colors.textPrimary }]}>
                New to selling?
              </Text>
            </View>
            <View style={styles.newSellerTipRow}>
              <Ionicons name="camera-outline" size={14} color={colors.textMuted} />
              <Text style={[styles.newSellerTip, { color: colors.textSecondary }]}>
                Start with a clear photo — it's the first thing buyers see
              </Text>
            </View>
            <View style={styles.newSellerTipRow}>
              <Ionicons name="pricetag-outline" size={14} color={colors.textMuted} />
              <Text style={[styles.newSellerTip, { color: colors.textSecondary }]}>
                Price competitively — check similar sold items for guidance
              </Text>
            </View>
            <View style={styles.newSellerTipRow}>
              <Ionicons name="chatbubble-outline" size={14} color={colors.textMuted} />
              <Text style={[styles.newSellerTip, { color: colors.textSecondary }]}>
                Respond quickly to buyer questions to build trust
              </Text>
            </View>
          </View>
        )}

        {/* Create listing -- primary action */}
        <View style={styles.ctaWrap}>
          <AppButton
            title="Create listing"
            icon={<Ionicons name="add-circle-outline" size={18} color={colors.background} />}
            variant="primary"
            size="lg"
            onPress={() => navigation.navigate('Sell')}
            accessibilityLabel="Create a new listing"
            hapticFeedback="light"
          />
        </View>

        {/* Inventory -- flat metric lines + manage row */}
        <FlagshipFormSection variant="flat" title="Inventory">
          <FlagshipMetricLine label="Active" value={String(metrics.activeCount)} />
          <FlagshipMetricLine label="Draft" value={String(metrics.draftCount)} separated />
          <FlagshipMetricLine label="Sold" value={String(metrics.soldCount)} separated />
          <FlagshipMetricLine label="Paused" value={String(metrics.pausedCount)} separated />
          <FlagshipNavigationRow
            title="Manage listings"
            subtitle="Active, draft, sold and paused"
            icon="list-outline"
            onPress={() => navigation.navigate('MyListings')}
            accessibilityLabel="Manage all your listings"
            accessibilityHint="Opens your listings"
          />
          <FlagshipNavigationRow
            title="Inventory dashboard"
            subtitle="Filters and bulk actions"
            icon="grid-outline"
            onPress={() => navigation.navigate('InventoryManagement')}
            accessibilityLabel="Open inventory management dashboard"
            accessibilityHint="Opens the inventory management screen"
          />
        </FlagshipFormSection>

        {/* Store -- only real destinations.
            Storefront / Shipping policies omitted: no real screens exist. */}
        <FlagshipFormSection variant="flat" title="Store">
          <FlagshipNavigationRow
            title="Analytics"
            subtitle="Views, sales and engagement"
            icon="bar-chart-outline"
            onPress={() => navigation.navigate('SellerAnalytics')}
            accessibilityLabel="View seller analytics"
            accessibilityHint="Opens the seller analytics dashboard"
          />
          <FlagshipNavigationRow
            title="Auctions"
            subtitle="Auction listings"
            icon="trophy-outline"
            onPress={() => navigation.navigate('SellerAuctionCentre')}
            accessibilityLabel="Auctions"
            accessibilityHint="Opens the seller auction centre"
          />
        </FlagshipFormSection>

        {/* Account -- payouts + verification */}
        <FlagshipFormSection variant="flat" title="Account">
          <FlagshipNavigationRow
            title="Payouts"
            subtitle="Wallet and earnings"
            icon="wallet-outline"
            onPress={() => navigation.navigate('Wallet')}
            accessibilityLabel="Payouts and wallet"
            accessibilityHint="Opens your wallet"
          />
          <FlagshipNavigationRow
            title="Verification"
            subtitle={isVerified ? 'Verified' : 'ID and seller standards'}
            icon="shield-checkmark-outline"
            iconColor={isVerified ? colors.success : undefined}
            onPress={() => navigation.navigate('Verification')}
            accessibilityLabel="Verification status"
            accessibilityHint="Opens verification settings"
          />
        </FlagshipFormSection>
      </ScrollView>
    </FlagshipScreen>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 0,
    paddingTop: Space.sm,
    paddingBottom: Space.xxl,
  },

  /* ── Verification banner ── */
  verificationBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + Space.xs,
    marginHorizontal: Space.md,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: Space.sm,
  },
  verificationBannerText: {
    flex: 1,
    gap: Space.xxs,
  },
  verificationBannerTitle: {
    fontSize: Type.bodyStrong.size,
    fontFamily: Typography.family.semibold,
    lineHeight: Type.bodyStrong.lineHeight,
  },
  verificationBannerSub: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    lineHeight: Type.caption.lineHeight,
  },

  /* ── Dashboard cards (2×2 grid) ── */
  dashGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: Space.md,
    gap: Space.sm,
  },
  dashCard: {
    width: '48%',
    flexGrow: 1,
  },
  dashCardInner: {
    gap: Space.xs - 2,
    paddingVertical: Space.sm,
  },

  dashCardValue: {
    fontSize: Type.priceList.size,
    fontFamily: Typography.family.bold,
    lineHeight: Type.priceList.lineHeight,
    fontVariant: ['tabular-nums'],
  },
  dashCardLabel: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.caption.letterSpacing,
  },

  /* ── Quick actions row ── */
  quickActionsRow: {
    flexDirection: 'row',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    gap: Space.xs,
  },
  quickAction: {
    flex: 1,
    alignItems: 'center',
    gap: Space.xs - 2,
    paddingVertical: Space.sm,
  },
  quickActionLabel: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
  },

  /* ── Recent activity ── */
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.md,
    minHeight: Control.hit + Space.xs,
  },
  activityThumbWrap: {
    width: Space.xl + Space.sm,
    height: Space.xl + Space.sm,
    borderRadius: Radius.sm,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityThumb: {
    width: Space.xl + Space.sm,
    height: Space.xl + Space.sm,
  },
  activityInfo: {
    flex: 1,
    gap: Space.xxs,
  },
  activityTitle: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    lineHeight: Type.body.lineHeight,
  },
  activityMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs - 1,
  },
  activityMeta: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    lineHeight: Type.caption.lineHeight,
  },

  /* ── New seller guidance ── */
  newSellerCard: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
    marginHorizontal: Space.md,
    gap: Space.sm,
  },
  newSellerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    marginBottom: Space.xs - 2,
  },
  newSellerTitle: {
    fontSize: Type.bodyStrong.size,
    fontFamily: Typography.family.semibold,
    lineHeight: Type.bodyStrong.lineHeight,
  },
  newSellerTipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.sm,
  },
  newSellerTip: {
    flex: 1,
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    lineHeight: Type.caption.lineHeight + Space.xxs,
  },

  /* "All caught up" muted line -- replaces the needs-attention list
     when no real tasks are derivable from listing data. */
  allCaughtUp: {
    paddingVertical: Space.sm,
    paddingHorizontal: Space.md,
  },
  allCaughtUpText: {
    fontSize: TypographyV2.body.size,
    fontFamily: Typography.family.regular,
    letterSpacing: TypographyV2.body.letterSpacing,
    lineHeight: TypographyV2.body.lineHeight,
  },

  /* Create listing CTA -- primary button, wrapped for horizontal inset
     because the flat primitives own their own padding. */
  ctaWrap: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.lg,
  },
});
