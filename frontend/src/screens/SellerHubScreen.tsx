import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, RefreshControl, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, Radius, Control, FontFamily } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { RootStackParamList, ROOT_STACK_ROUTES, type RootStackRouteName } from '../navigation/types';
import { openProfile } from '../navigation/openProfile';

import { AnimatedPressable } from '../components/AnimatedPressable';
import {
  FlagshipScreen,
  FlagshipHeader,
  FlagshipState,
  FlagshipFormSection,
  FlagshipNavigationRow,
  FlagshipMetricLine,
  TaskQueueScreen,
} from '../components/flagship';
import { CachedImage } from '../components/CachedImage';
import { useStore } from '../store/useStore';
import { useSellerTrust } from '../platform/product';
import {
  fetchSellerHubOverview,
  type SellerHubOverview,
  type SellerHubTask,
  type SellerHubTaskType,
} from '../services/sellerHubApi';
import { fetchImportBatches, type BatchSummaryDTO, type CatalogSource } from '../services/catalogImportApi';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { haptics } from '../utils/haptics';
import { OfflineBanner } from '../components/OfflineBanner';
import { track } from '../analytics';
import { AppIcon } from '../components/common/AppIcon';
import { IconSize, type SemanticIconName } from '../theme/iconTokens';

type NavT = NativeStackNavigationProp<RootStackParamList>;

// ── Task icon metadata per task type ──
const TASK_ICON: Record<SellerHubTaskType, SemanticIconName | React.ComponentProps<typeof Ionicons>['name']> = {
  ship_order: 'car-outline',
  respond_offer: 'chat',
  listing_issue: 'edit',
  catalogue_awaiting: 'download',
  payout_hold: 'wallet',
};

function formatDueAt(dueAt: string | null): string | null {
  if (!dueAt) return null;
  const due = new Date(dueAt);
  if (isNaN(due.getTime())) return null;
  const now = new Date();
  const diffMs = due.getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  if (diffHours < 0) return 'Overdue';
  if (diffHours < 24) return `Due in ${Math.ceil(diffHours)}h`;
  const diffDays = Math.ceil(diffHours / 24);
  return `Due in ${diffDays}d`;
}

// ── Catalogue import helpers (blueprint §5.1) ──
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

export default function SellerHubScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<NavT>();
  const currentUser = useStore((s) => s.currentUser);
  const { data: sellerTrust } = useSellerTrust(currentUser?.id);
  const { formatFromFiat } = useFormattedPrice();

  const formatMoney = useCallback((value: number): string => {
    const formatted = formatFromFiat(value, 'GBP');
    if (value < 1000) return formatted;
    const match = formatted.match(/^(\D*)([\d,.]+)(.*)$/);
    if (!match) return formatted;
    const prefix = match[1];
    const num = parseFloat(match[2].replace(/,/g, ''));
    const suffix = match[3];
    if (!Number.isFinite(num) || num < 1000) return formatted;
    const compact = num / 1000;
    const compactStr = compact >= 100 ? compact.toFixed(0) : compact.toFixed(1);
    return `${prefix}${compactStr}k${suffix}`;
  }, [formatFromFiat]);

  const [overview, setOverview] = useState<SellerHubOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);

  // Catalogue import batches — past and in-progress (blueprint §5.1).
  const [importBatches, setImportBatches] = useState<BatchSummaryDTO[]>([]);

  const load = useCallback(async () => {
    if (!currentUser?.id) return;
    try {
      const [hubOverview, batches] = await Promise.all([
        fetchSellerHubOverview(),
        fetchImportBatches().catch(() => [] as BatchSummaryDTO[]),
      ]);
      setOverview(hubOverview);
      setImportBatches(batches);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
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
  const hasListings = (overview?.inventory.active ?? 0) + (overview?.inventory.drafts ?? 0) + (overview?.inventory.sold ?? 0) + (overview?.inventory.paused ?? 0) > 0;
  const isNewSeller = !hasListings && !sellerTrust?.completedSales;

  const allTaskSourcesFresh = useMemo(() => {
    if (!overview) return false;
    const ordersFresh = overview.freshness.orders?.state === 'fresh';
    const offersFresh = overview.freshness.offers?.state === 'fresh';
    const listingsFresh = overview.freshness.listings?.state === 'fresh';
    return ordersFresh && offersFresh && listingsFresh;
  }, [overview]);

  if (isLoading) {
    return (
      <FlagshipScreen
        header={<FlagshipHeader title="Seller Hub" onBack={() => navigation.goBack()} />}
      >
        <FlagshipState variant="loading" />
      </FlagshipScreen>
    );
  }

  if (loadError && !overview) {
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

  if (!overview) {
    return (
      <FlagshipScreen
        header={<FlagshipHeader title="Seller Hub" onBack={() => navigation.goBack()} />}
      >
        <FlagshipState variant="error" />
      </FlagshipScreen>
    );
  }

  const { topTask, tasks, money, inventory, businessPulse } = overview;

  const navigateToTask = (task: SellerHubTask) => {
    haptics.tap();
    const route = task.actionRoute as string;
    if (ROOT_STACK_ROUTES.includes(route as RootStackRouteName)) {
      (navigation.navigate as (screen: string) => void)(route);
    }
  };

  const pendingOrdersCount = tasks.filter((t) => t.type === 'ship_order').reduce((sum, t) => sum + t.count, 0);

  const renderTrend = (pct: number | null | undefined): string | undefined => {
    if (pct == null || !Number.isFinite(pct)) return undefined;
    if (Math.abs(pct) < 0.5) return '— flat vs prev 30d';
    const arrow = pct > 0 ? '▲' : '▼';
    return `${arrow} ${Math.abs(Math.round(pct))}% vs prev 30d`;
  };

  return (
    <TaskQueueScreen
      testID="seller-hub-screen"
      header={<FlagshipHeader title="Seller Hub" onBack={() => navigation.goBack()} />}
      banner={<OfflineBanner onRetry={() => void onRefresh()} />}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
      contentContainerStyle={{ paddingHorizontal: 0 }}
      urgentTask={
        <View style={styles.heroWrapper}>
          {/* ── Shop identity bar ── */}
          <View style={styles.shopIdentityBar}>
            <View style={styles.shopAvatarWrap}>
              {currentUser?.avatar ? (
                <CachedImage uri={currentUser.avatar} style={styles.shopAvatar} contentFit="cover" />
              ) : (
                <View style={[styles.shopAvatar, { backgroundColor: colors.surfaceAlt }]}>
                  <Text style={styles.shopAvatarInitials}>
                    {(currentUser?.displayName || currentUser?.username || 'S').slice(0, 2).toUpperCase()}
                  </Text>
                </View>
              )}
            </View>
            <View style={styles.shopInfo}>
              <View style={styles.shopTitleRow}>
                <Text style={styles.shopTitle} numberOfLines={1}>
                  {currentUser?.displayName || currentUser?.username || 'My Shop'}
                </Text>
                {isVerified && (
                  <View style={styles.verifiedMerchantBadge}>
                    <Ionicons name="checkmark-circle" size={13} color={colors.brand} />
                    <Text style={styles.verifiedMerchantText}>Verified</Text>
                  </View>
                )}
              </View>
              <Text style={styles.shopSub}>
                {sellerTrust?.rating ? `${sellerTrust.rating.toFixed(1)} ★ rating` : 'Active Seller'}
                {sellerTrust?.completedSales ? ` · ${sellerTrust.completedSales} sales` : ''}
              </Text>
            </View>
            <AnimatedPressable
              style={styles.viewShopBtn}
              onPress={() => {
                if (currentUser?.id) {
                  openProfile(navigation, currentUser.id, currentUser.id);
                }
              }}
              activeOpacity={0.7}
              scaleValue={0.96}
              hapticFeedback="light"
              accessibilityRole="button"
              accessibilityLabel="View public storefront"
            >
              <Ionicons name="storefront-outline" size={15} color={colors.textPrimary} />
              <Text style={styles.viewShopBtnText}>Store</Text>
            </AnimatedPressable>
          </View>

          {/* ── Executive Financial Summary Hero Card ── */}
          {money && (
            <View style={styles.financialHeroCard}>
              <View style={styles.financialHeroTop}>
                <View style={styles.financialHeroNetCol}>
                  <Text style={styles.financialHeroNetLabel}>30-Day Net Sales</Text>
                  <Text style={styles.financialHeroNetValue}>
                    {formatMoney(businessPulse?.netSalesGbp ?? 0)}
                  </Text>
                </View>
                {businessPulse?.netSalesPrevPeriodPct != null && (
                  <View
                    style={[
                      styles.financialHeroTrendPill,
                      {
                        backgroundColor:
                          (businessPulse.netSalesPrevPeriodPct ?? 0) >= 0 ? colors.brandSubtle : colors.dangerSubtle,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.financialHeroTrendText,
                        { color: (businessPulse.netSalesPrevPeriodPct ?? 0) >= 0 ? colors.brand : colors.danger },
                      ]}
                    >
                      {renderTrend(businessPulse.netSalesPrevPeriodPct)}
                    </Text>
                  </View>
                )}
              </View>

              <View style={styles.financialHeroDivider} />

              <View style={styles.financialBalancesGrid}>
                <View style={styles.financialBalanceItem}>
                  <Text style={styles.financialBalanceLabel}>Available Payout</Text>
                  <Text style={styles.financialBalanceValue}>{formatMoney(money.availableGbp)}</Text>
                  <AnimatedPressable
                    style={styles.financialWithdrawBtn}
                    onPress={() => {
                      haptics.tap();
                      navigation.navigate('Wallet');
                    }}
                    activeOpacity={0.7}
                    scaleValue={0.96}
                    hapticFeedback="light"
                    accessibilityRole="button"
                    accessibilityLabel="Manage payouts in wallet"
                  >
                    <Text style={styles.financialWithdrawText}>Wallet</Text>
                    <Ionicons name="arrow-forward" size={11} color={colors.brand} />
                  </AnimatedPressable>
                </View>

                <View style={styles.financialBalanceItem}>
                  <View style={styles.balanceLabelWithIcon}>
                    <Ionicons name="shield-checkmark" size={12} color={colors.textMuted} />
                    <Text style={styles.financialBalanceLabel}>In Escrow</Text>
                  </View>
                  <Text style={styles.financialBalanceMutedValue}>{formatMoney(money.processingGbp)}</Text>
                  <Text style={styles.financialBalanceSub}>Releases on delivery</Text>
                </View>

                {money.heldGbp > 0 && (
                  <View style={styles.financialBalanceItem}>
                    <Text style={styles.financialBalanceLabel}>Reserved</Text>
                    <Text style={styles.financialBalanceMutedValue}>{formatMoney(money.heldGbp)}</Text>
                    <Text style={styles.financialBalanceSub}>Rolling reserve</Text>
                  </View>
                )}
              </View>

              {money.nextPayoutAt && (
                <View style={styles.nextPayoutScheduleRow}>
                  <Ionicons name="calendar-outline" size={13} color={colors.brand} />
                  <Text style={styles.nextPayoutScheduleText}>
                    Next automated transfer: {new Date(money.nextPayoutAt).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* ── KYC Verification Prompt (if unverified) ── */}
          {!isVerified && (
            <Pressable
              style={({ pressed }) => [
                styles.verificationBanner,
                { backgroundColor: colors.warningSubtle },
                pressed && { opacity: 0.7 },
              ]}
              onPress={() => {
                haptics.tap();
                navigation.navigate('KYCVerification');
              }}
              accessibilityRole="button"
              accessibilityLabel="Get verified to build buyer trust"
            >
              <AppIcon name="verified" size={IconSize.sm} color="warning" opticalCenter accessible={false} />
              <View style={styles.verificationBannerText}>
                <Text style={[styles.verificationBannerTitle, { color: colors.textPrimary }]}>
                  Unlock Verified Seller Status
                </Text>
                <Text style={[styles.verificationBannerSub, { color: colors.textSecondary }]}>
                  Build instant buyer trust and unlock instant payouts
                </Text>
              </View>
              <AppIcon name="forward" size={IconSize.xs} color="textMuted" opticalCenter accessible={false} />
            </Pressable>
          )}

          {/* ── Dominant Top Task (if present) ── */}
          {topTask && (
            <Pressable
              style={({ pressed }) => [
                styles.topTaskRow,
                { backgroundColor: topTask.priority === 'critical' ? colors.dangerSubtle : colors.surfaceAlt },
                pressed && { opacity: 0.7 },
              ]}
              onPress={() => navigateToTask(topTask)}
              accessibilityRole="button"
              accessibilityLabel={`${topTask.actionLabel}, ${topTask.count} items`}
            >
              <View style={styles.topTaskIconWrap}>
                <AppIcon
                  name={TASK_ICON[topTask.type]}
                  size={IconSize.lg}
                  color={topTask.priority === 'critical' ? 'danger' : 'brand'}
                  opticalCenter
                  accessible={false}
                />
              </View>
              <View style={styles.topTaskContent}>
                <Text style={[styles.topTaskTitle, { color: colors.textPrimary }]} numberOfLines={2}>
                  {topTask.count > 1 ? `${topTask.count} ${topTask.actionLabel.toLowerCase()}` : topTask.actionLabel}
                </Text>
                {(() => {
                  const dueLabel = formatDueAt(topTask.dueAt);
                  if (dueLabel) {
                    return (
                      <Text
                        style={[
                          styles.topTaskDue,
                          { color: dueLabel === 'Overdue' ? colors.danger : colors.textMuted },
                        ]}
                        numberOfLines={1}
                      >
                        {dueLabel}
                      </Text>
                    );
                  }
                  if (topTask.consequence?.kind === 'money' && topTask.consequence.amountGbp) {
                    return (
                      <Text style={[styles.topTaskDue, { color: colors.textMuted }]} numberOfLines={1}>
                        {formatMoney(topTask.consequence.amountGbp)} at stake
                      </Text>
                    );
                  }
                  return null;
                })()}
              </View>
              <AppIcon name="forward" size={IconSize.sm} color="textMuted" opticalCenter accessible={false} />
            </Pressable>
          )}

          {/* ── "All caught up" positive state ── */}
          {tasks.length === 0 && allTaskSourcesFresh && (
            <View style={styles.allCaughtUp}>
              <AppIcon name="checkmark-circle" focused size={IconSize.md} color="success" opticalCenter accessible={false} />
              <Text style={[styles.allCaughtUpText, { color: colors.textMuted }]}>
                All fulfillment and buyer inquiries are up to date
              </Text>
            </View>
          )}

          {tasks.length === 0 && !allTaskSourcesFresh && (
            <View style={styles.partialNotice}>
              <AppIcon name="offline" size={IconSize.sm} color="textMuted" opticalCenter accessible={false} />
              <Text style={[styles.partialNoticeText, { color: colors.textMuted }]}>
                Some data sources are currently synchronising. Pull to refresh.
              </Text>
            </View>
          )}
        </View>
      }
    >
      {/* ── Operational Quick Launch Bar ── */}
      <View style={styles.quickLaunchGrid}>
        <AnimatedPressable
          style={[styles.quickLaunchTile, styles.quickLaunchPrimaryTile]}
          onPress={() => navigation.navigate('Sell')}
          activeOpacity={0.8}
          scaleValue={0.97}
          hapticFeedback="medium"
          accessibilityRole="button"
          accessibilityLabel="List new item"
        >
          <Ionicons name="add-circle" size={20} color={colors.textInverse} />
          <Text style={styles.quickLaunchPrimaryText}>List Item</Text>
        </AnimatedPressable>

        <AnimatedPressable
          style={styles.quickLaunchTile}
          onPress={() => navigation.navigate('MyOrders')}
          activeOpacity={0.8}
          scaleValue={0.97}
          hapticFeedback="light"
          accessibilityRole="button"
          accessibilityLabel="Ship orders"
        >
          <Ionicons name="cube-outline" size={19} color={colors.brand} />
          <Text style={styles.quickLaunchText}>Orders</Text>
          {pendingOrdersCount > 0 && (
            <View style={styles.quickLaunchBadge}>
              <Text style={styles.quickLaunchBadgeText}>{pendingOrdersCount}</Text>
            </View>
          )}
        </AnimatedPressable>

        <AnimatedPressable
          style={styles.quickLaunchTile}
          onPress={() => navigation.navigate('SellerAnalytics')}
          activeOpacity={0.8}
          scaleValue={0.97}
          hapticFeedback="light"
          accessibilityRole="button"
          accessibilityLabel="View seller analytics"
        >
          <Ionicons name="bar-chart-outline" size={19} color={colors.brand} />
          <Text style={styles.quickLaunchText}>Analytics</Text>
        </AnimatedPressable>

        <AnimatedPressable
          style={styles.quickLaunchTile}
          onPress={() => navigation.navigate('InventoryManagement')}
          activeOpacity={0.8}
          scaleValue={0.97}
          hapticFeedback="light"
          accessibilityRole="button"
          accessibilityLabel="Manage inventory"
        >
          <Ionicons name="grid-outline" size={19} color={colors.brand} />
          <Text style={styles.quickLaunchText}>Inventory</Text>
        </AnimatedPressable>
      </View>

      {/* ── Order fulfillment pipeline ── */}
      <View style={styles.pipelineSection}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionHeaderTitle}>Order fulfillment</Text>
          <AnimatedPressable
            onPress={() => navigation.navigate('MyOrders')}
            activeOpacity={0.7}
            scaleValue={0.96}
            hapticFeedback="light"
            accessibilityRole="button"
            accessibilityLabel="View all orders"
          >
            <Text style={styles.sectionHeaderAction}>View all</Text>
          </AnimatedPressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pipelineRail}>
          <AnimatedPressable
            style={[styles.pipelineCard, styles.pipelineCardFirst, pendingOrdersCount > 0 && styles.pipelineCardActive]}
            onPress={() => navigation.navigate('MyOrders')}
            activeOpacity={0.7}
            scaleValue={0.96}
            hapticFeedback="light"
          >
            <View style={styles.pipelineCardHeader}>
              <Text style={[styles.pipelineCardCount, pendingOrdersCount > 0 && styles.pipelineCardCountActive]}>
                {pendingOrdersCount}
              </Text>
              {pendingOrdersCount > 0 && (
                <View style={styles.pipelineUrgentPill}>
                  <Text style={styles.pipelineUrgentPillText}>Ship now</Text>
                </View>
              )}
            </View>
            <Text style={styles.pipelineCardLabel}>Awaiting Dispatch</Text>
          </AnimatedPressable>

          <AnimatedPressable
            style={styles.pipelineCard}
            onPress={() => navigation.navigate('MyOrders')}
            activeOpacity={0.7}
            scaleValue={0.96}
            hapticFeedback="light"
          >
            <Text style={styles.pipelineCardCount}>
              {businessPulse?.orders ?? 0}
            </Text>
            <Text style={styles.pipelineCardLabel}>Orders (30d)</Text>
          </AnimatedPressable>

          <AnimatedPressable
            style={styles.pipelineCard}
            onPress={() => navigation.navigate('MyListings', { type: 'standard' })}
            activeOpacity={0.7}
            scaleValue={0.96}
            hapticFeedback="light"
          >
            <Text style={styles.pipelineCardCount}>{inventory.sold}</Text>
            <Text style={styles.pipelineCardLabel}>Sold Items</Text>
          </AnimatedPressable>
        </ScrollView>
      </View>

      {/* ── Inventory Health & Optimizer ── */}
      <View style={styles.inventoryHealthSection}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionHeaderTitle}>Inventory health</Text>
          <AnimatedPressable
            onPress={() => navigation.navigate('MyListings')}
            activeOpacity={0.7}
            scaleValue={0.96}
            hapticFeedback="light"
          >
            <Text style={styles.sectionHeaderAction}>{inventory.active} live items</Text>
          </AnimatedPressable>
        </View>

        <View style={styles.healthInsightCard}>
          <View style={styles.healthInsightHeader}>
            <Ionicons name="sparkles" size={15} color={colors.brand} />
            <Text style={styles.healthInsightTitle}>Storefront Optimization</Text>
          </View>
          <Text style={styles.healthInsightCopy}>
            {inventory.drafts > 0
              ? `You have ${inventory.drafts} draft${inventory.drafts === 1 ? '' : 's'} waiting. Finish pricing and publish to receive offers.`
              : 'Benchmark your asking prices with real sold comparables to accelerate seller velocity.'}
          </Text>
          <View style={styles.healthStatsRow}>
            <View style={styles.healthStatCol}>
              <Text style={styles.healthStatVal}>{inventory.active}</Text>
              <Text style={styles.healthStatLbl}>Active</Text>
            </View>
            <View style={styles.healthStatCol}>
              <Text style={styles.healthStatVal}>{inventory.drafts}</Text>
              <Text style={styles.healthStatLbl}>Drafts</Text>
            </View>
            <View style={styles.healthStatCol}>
              <Text style={styles.healthStatVal}>{inventory.sold}</Text>
              <Text style={styles.healthStatLbl}>Sold</Text>
            </View>
            <View style={styles.healthStatCol}>
              <Text style={styles.healthStatVal}>{formatMoney(inventory.listedValueGbp)}</Text>
              <Text style={styles.healthStatLbl}>Asking Value</Text>
            </View>
          </View>
        </View>
      </View>

      {/* ── Seller Standards & Trust Scorecard ── */}
      <View style={styles.trustScorecardSection}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionHeaderTitle}>Seller standards</Text>
        </View>

        <View style={styles.scorecardGrid}>
          <View style={[styles.scorecardItem, styles.scorecardItemFirst]}>
            <Text style={styles.scorecardValue}>
              {sellerTrust?.dispatchTimeLabel ?? '—'}
            </Text>
            <Text style={styles.scorecardLabel}>Dispatch Speed</Text>
            <Text style={styles.scorecardTarget}>Target: ≤ 24h</Text>
          </View>

          <View style={styles.scorecardItem}>
            <Text style={styles.scorecardValue}>
              {sellerTrust?.responseTimeLabel ?? '—'}
            </Text>
            <Text style={styles.scorecardLabel}>Inquiry Reply</Text>
            <Text style={styles.scorecardTarget}>Target: ≤ 2h</Text>
          </View>

          <View style={styles.scorecardItem}>
            <Text style={styles.scorecardValue}>
              {sellerTrust?.rating ? `${sellerTrust.rating.toFixed(1)} ★` : '—'}
            </Text>
            <Text style={styles.scorecardLabel}>Buyer Feedback</Text>
            <Text style={styles.scorecardTarget}>Target: ≥ 4.8</Text>
          </View>
        </View>
      </View>

      {/* ── Tasks List (Secondary actions) ── */}
      {tasks.length > 0 && (
        <FlagshipFormSection variant="flat" title="Action items">
          {tasks.map((task) => {
            const dueLabel = formatDueAt(task.dueAt);
            const subtitleParts: string[] = [];
            if (dueLabel) subtitleParts.push(dueLabel);
            if (task.consequence?.kind === 'money' && task.consequence.amountGbp) {
              subtitleParts.push(`${formatMoney(task.consequence.amountGbp)} at stake`);
            } else if (task.consequence?.kind === 'trust') {
              subtitleParts.push('Affects seller rating');
            } else if (task.consequence?.kind === 'listing') {
              subtitleParts.push('Missing required details');
            }
            return (
              <FlagshipNavigationRow
                key={task.id}
                title={task.count > 1 ? `${task.count} ${task.actionLabel.toLowerCase()}` : task.actionLabel}
                subtitle={subtitleParts.join(' · ') || undefined}
                icon={TASK_ICON[task.type]}
                iconColor={task.priority === 'critical' ? colors.danger : undefined}
                onPress={() => navigateToTask(task)}
                accessibilityLabel={`${task.actionLabel}, ${task.count} items${dueLabel ? `, ${dueLabel}` : ''}`}
              />
            );
          })}
        </FlagshipFormSection>
      )}

      {/* ── Business pulse — 30-day settled order breakdown ── */}
      {businessPulse && businessPulse.orders > 0 && (
        <FlagshipFormSection variant="flat" title="Revenue breakdown (30d)">
          <FlagshipMetricLine
            label="Gross sales"
            value={formatMoney(businessPulse.grossSalesGbp)}
            subLabel={`${businessPulse.orders} order${businessPulse.orders === 1 ? '' : 's'}${renderTrend(businessPulse.ordersPrevPeriodPct) ? ` · ${renderTrend(businessPulse.ordersPrevPeriodPct)}` : ''}`}
          />
          {businessPulse.refundsGbp > 0 && (
            <FlagshipMetricLine
              label="Refunds"
              value={`-${formatMoney(businessPulse.refundsGbp)}`}
              danger
              separated
            />
          )}
          {businessPulse.feesGbp > 0 && (
            <FlagshipMetricLine
              label="Platform fees"
              value={`-${formatMoney(businessPulse.feesGbp)}`}
              muted
              separated
            />
          )}
          <FlagshipMetricLine
            label="Net payout volume"
            value={formatMoney(businessPulse.netSalesGbp)}
            subLabel={renderTrend(businessPulse.netSalesPrevPeriodPct)}
            success={businessPulse.netSalesGbp > 0}
            emphasis
            separated
          />
          {businessPulse.completeness === 'partial' && (
            <Text style={[styles.partialLabel, { color: colors.textMuted }]}>
              Fee and refund data may be incomplete
            </Text>
          )}
          <FlagshipNavigationRow
            title="Interactive charts & products"
            subtitle="Victory Native GPU analytics"
            icon="analytics"
            onPress={() => navigation.navigate('SellerAnalytics')}
            accessibilityLabel="Open seller analytics"
          />
        </FlagshipFormSection>
      )}

      {/* ── Catalogue imports ── */}
      <FlagshipFormSection variant="flat" title="Catalogue imports">
        {visibleImportBatches.length > 0 ? (
          visibleImportBatches.map((batch) => (
            <FlagshipNavigationRow
              key={batch.id}
              title={IMPORT_SOURCE_LABEL[batch.source] ?? 'Catalogue import'}
              subtitle={importBatchStatusText(batch)}
              icon="download"
              onPress={() => navigation.navigate('CatalogImportProgress', { batchId: batch.id })}
              accessibilityLabel={`${IMPORT_SOURCE_LABEL[batch.source] ?? 'Catalogue import'}, ${importBatchStatusText(batch)}`}
            />
          ))
        ) : (
          <FlagshipNavigationRow
            title="Import existing inventory"
            subtitle="Sync from eBay, Depop or CSV package"
            icon="download"
            onPress={() => navigation.navigate('CatalogImportStart')}
            accessibilityLabel="Import inventory"
          />
        )}
      </FlagshipFormSection>

      {/* ── Store & Account Management ── */}
      <FlagshipFormSection variant="flat" title="Store management">
        <FlagshipNavigationRow
          title="Auction centre"
          subtitle="Live drops and scheduled auctions"
          icon="hammer"
          onPress={() => navigation.navigate('SellerAuctionCentre')}
          accessibilityLabel="Auctions"
        />
        <FlagshipNavigationRow
          title="Payouts & wallet"
          subtitle="Bank accounts and balances"
          icon="wallet"
          onPress={() => navigation.navigate('Wallet')}
          accessibilityLabel="Payouts and wallet"
        />
        <FlagshipNavigationRow
          title="Identity verification"
          subtitle={isVerified ? 'Verified seller' : 'KYC required'}
          icon={isVerified ? 'checkmark-circle' : 'profile'}
          iconColor={isVerified ? colors.success : undefined}
          onPress={() => navigation.navigate('Verification')}
          accessibilityLabel="Verification status"
        />
        <FlagshipNavigationRow
          title="Export store data"
          subtitle="CSV of orders, fees and inventory"
          icon="download"
          onPress={() => navigation.navigate('DataExport')}
          accessibilityLabel="Export store data"
        />
      </FlagshipFormSection>

      {/* New seller guidance */}
      {isNewSeller && (
        <View style={styles.newSellerCard}>
          <View style={styles.newSellerHeader}>
            <AppIcon name="storefront-outline" size={IconSize.sm} color="brand" opticalCenter accessible={false} />
            <Text style={[styles.newSellerTitle, { color: colors.textPrimary }]}>
              New seller playbook
            </Text>
          </View>
          <View style={styles.newSellerTipRow}>
            <AppIcon name="camera" size={IconSize.xs} color="textMuted" opticalCenter accessible={false} />
            <Text style={[styles.newSellerTip, { color: colors.textSecondary }]}>
              High-resolution, well-lit photos help buyers assess items and make offers with confidence.
            </Text>
          </View>
          <View style={styles.newSellerTipRow}>
            <AppIcon name="cash-outline" size={IconSize.xs} color="textMuted" opticalCenter accessible={false} />
            <Text style={[styles.newSellerTip, { color: colors.textSecondary }]}>
              Check sold market comparables before pricing your items.
            </Text>
          </View>
          <View style={styles.newSellerTipRow}>
            <AppIcon name="chat" size={IconSize.xs} color="textMuted" opticalCenter accessible={false} />
            <Text style={[styles.newSellerTip, { color: colors.textSecondary }]}>
              Responding to buyer offers within 1 hour significantly increases conversion.
            </Text>
          </View>
        </View>
      )}

      {/* Bottom padding */}
      <View style={{ height: Space.xxl }} />
    </TaskQueueScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    heroWrapper: {
      paddingBottom: Space.xs,
    },
    /* ── Shop identity bar ── */
    shopIdentityBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingHorizontal: Space.md,
      paddingTop: Space.xs,
      paddingBottom: Space.sm,
    },
    shopAvatarWrap: {
      width: 44,
      height: 44,
      borderRadius: Radius.full,
      overflow: 'hidden',
    },
    shopAvatar: {
      width: 44,
      height: 44,
      borderRadius: Radius.full,
      alignItems: 'center',
      justifyContent: 'center',
    },
    shopAvatarInitials: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: FontFamily.bold,
      color: colors.textPrimary,
    },
    shopInfo: {
      flex: 1,
      gap: 2,
    },
    shopTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
    },
    shopTitle: {
      fontSize: TypographyV2.itemTitle.size,
      fontFamily: FontFamily.bold,
      color: colors.textPrimary,
    },
    verifiedMerchantBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      backgroundColor: colors.brandSubtle,
      paddingHorizontal: Space.xs + 2,
      paddingVertical: 1,
      borderRadius: Radius.full,
    },
    verifiedMerchantText: {
      fontSize: TypographyV2.caption.size,
      fontFamily: FontFamily.semibold,
      color: colors.brand,
    },
    shopSub: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.regular,
      color: colors.textMuted,
    },
    viewShopBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: Space.sm,
      paddingVertical: Space.xs,
    },
    viewShopBtnText: {
      fontSize: TypographyV2.caption.size,
      fontFamily: FontFamily.semibold,
      color: colors.textPrimary,
    },

    /* ── Executive Financial Summary Hero Card ── */
    financialHeroCard: {
      marginHorizontal: Space.md,
      backgroundColor: colors.surfaceAlt,
      borderRadius: Radius.xl,
      padding: Space.md,
      marginBottom: Space.sm,
      gap: Space.sm,
    },
    financialHeroTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
    },
    financialHeroNetCol: {
      gap: 2,
    },
    financialHeroNetLabel: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.regular,
      color: colors.textMuted,
    },
    financialHeroNetValue: {
      fontSize: TypographyV2.hero.size,
      fontFamily: FontFamily.bold,
      color: colors.textPrimary,
      lineHeight: TypographyV2.hero.lineHeight,
      letterSpacing: TypographyV2.hero.letterSpacing,
    },
    financialHeroTrendPill: {
      paddingHorizontal: Space.sm,
      paddingVertical: 4,
      borderRadius: Radius.full,
      alignSelf: 'flex-start',
    },
    financialHeroTrendText: {
      fontSize: TypographyV2.caption.size,
      fontFamily: FontFamily.semibold,
    },
    financialHeroDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginVertical: Space.xxs,
    },
    financialBalancesGrid: {
      flexDirection: 'row',
      gap: Space.md,
    },
    financialBalanceItem: {
      flex: 1,
      gap: 2,
    },
    financialBalanceLabel: {
      fontSize: TypographyV2.caption.size,
      fontFamily: FontFamily.regular,
      color: colors.textMuted,
    },
    balanceLabelWithIcon: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    financialBalanceValue: {
      fontSize: TypographyV2.bodyStrong.size + 1,
      fontFamily: FontFamily.bold,
      color: colors.textPrimary,
    },
    financialBalanceMutedValue: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: FontFamily.semibold,
      color: colors.textSecondary,
    },
    financialBalanceSub: {
      fontSize: 11,
      fontFamily: FontFamily.regular,
      color: colors.textMuted,
    },
    financialWithdrawBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      marginTop: 2,
    },
    financialWithdrawText: {
      fontSize: TypographyV2.caption.size,
      fontFamily: FontFamily.semibold,
      color: colors.brand,
    },
    nextPayoutScheduleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingTop: Space.xs,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    nextPayoutScheduleText: {
      fontSize: TypographyV2.caption.size,
      fontFamily: FontFamily.regular,
      color: colors.textSecondary,
    },

    /* ── Operational Quick Launch Bar ── */
    quickLaunchGrid: {
      flexDirection: 'row',
      gap: Space.xs + 2,
      paddingHorizontal: Space.md,
      marginVertical: Space.xs,
    },
    quickLaunchTile: {
      flex: 1,
      paddingVertical: Space.sm + 2,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      position: 'relative',
    },
    quickLaunchPrimaryTile: {
      backgroundColor: colors.brand,
      borderRadius: Radius.lg,
    },
    quickLaunchPrimaryText: {
      fontSize: TypographyV2.caption.size,
      fontFamily: FontFamily.semibold,
      color: colors.textInverse,
    },
    quickLaunchText: {
      fontSize: TypographyV2.caption.size,
      fontFamily: FontFamily.semibold,
      color: colors.textPrimary,
    },
    quickLaunchBadge: {
      position: 'absolute',
      top: 4,
      right: 4,
      backgroundColor: colors.danger,
      paddingHorizontal: 5,
      paddingVertical: 1,
      borderRadius: Radius.full,
    },
    quickLaunchBadgeText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.bold,
      color: colors.textInverse,
    },

    /* ── Section headers ── */
    sectionHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Space.md,
      marginBottom: Space.xs + 2,
      marginTop: Space.sm,
    },
    sectionHeaderTitle: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: FontFamily.semibold,
      color: colors.textPrimary,
    },
    sectionHeaderAction: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.semibold,
      color: colors.brand,
    },

    /* ── Pipeline Rail ── */
    pipelineSection: {
      marginVertical: Space.xs,
    },
    pipelineRail: {
      paddingHorizontal: Space.md,
      gap: Space.sm,
    },
    pipelineCard: {
      paddingVertical: Space.sm,
      paddingHorizontal: Space.md,
      minWidth: 120,
      gap: 4,
      borderLeftWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    pipelineCardActive: {
      borderColor: colors.warning,
    },
    pipelineCardFirst: {
      borderLeftWidth: 0,
      paddingLeft: 0,
    },
    pipelineCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    pipelineCardCount: {
      fontSize: TypographyV2.itemTitle.size,
      fontFamily: FontFamily.bold,
      color: colors.textPrimary,
    },
    pipelineCardCountActive: {
      color: colors.warning,
    },
    pipelineUrgentPill: {
      backgroundColor: colors.warningSubtle,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: Radius.full,
    },
    pipelineUrgentPillText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.bold,
      color: colors.warning,
    },
    pipelineCardLabel: {
      fontSize: TypographyV2.caption.size,
      fontFamily: FontFamily.regular,
      color: colors.textMuted,
    },

    /* ── Inventory Health ── */
    inventoryHealthSection: {
      marginVertical: Space.xs,
    },
    healthInsightCard: {
      marginHorizontal: Space.md,
      gap: Space.sm,
    },
    healthInsightHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
    },
    healthInsightTitle: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.semibold,
      color: colors.brand,
    },
    healthInsightCopy: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.regular,
      color: colors.textSecondary,
      lineHeight: TypographyV2.meta.lineHeight,
    },
    healthStatsRow: {
      flexDirection: 'row',
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      paddingTop: Space.sm,
      marginTop: Space.xs,
    },
    healthStatCol: {
      flex: 1,
      alignItems: 'center',
      gap: 2,
    },
    healthStatVal: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: FontFamily.bold,
      color: colors.textPrimary,
    },
    healthStatLbl: {
      fontSize: TypographyV2.caption.size,
      fontFamily: FontFamily.regular,
      color: colors.textMuted,
    },

    /* ── Seller Standards Scorecard ── */
    trustScorecardSection: {
      marginVertical: Space.xs,
    },
    scorecardGrid: {
      flexDirection: 'row',
      marginHorizontal: Space.md,
      paddingVertical: Space.sm,
    },
    scorecardItem: {
      flex: 1,
      alignItems: 'center',
      gap: 2,
      borderLeftWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    scorecardItemFirst: {
      borderLeftWidth: 0,
    },
    scorecardValue: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: FontFamily.bold,
      color: colors.textPrimary,
    },
    scorecardLabel: {
      fontSize: TypographyV2.caption.size,
      fontFamily: FontFamily.regular,
      color: colors.textMuted,
    },
    scorecardTarget: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.semibold,
      color: colors.brand,
      marginTop: 2,
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
      marginBottom: Space.sm,
    },
    verificationBannerText: {
      flex: 1,
      gap: Space.xxs,
    },
    verificationBannerTitle: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      lineHeight: TypographyV2.bodyStrong.lineHeight,
    },
    verificationBannerSub: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      lineHeight: TypographyV2.meta.lineHeight,
    },

    /* ── Top task ── */
    topTaskRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingHorizontal: Space.md,
      paddingVertical: Space.md,
      marginHorizontal: Space.md,
      borderRadius: Radius.lg,
      marginBottom: Space.sm,
      minHeight: Control.hit + Space.sm,
    },
    topTaskIconWrap: {
      width: Control.hit,
      height: Control.hit,
      alignItems: 'center',
      justifyContent: 'center',
    },
    topTaskContent: {
      flex: 1,
      gap: Space.xxs,
    },
    topTaskTitle: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      lineHeight: TypographyV2.bodyStrong.lineHeight,
    },
    topTaskDue: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      lineHeight: TypographyV2.meta.lineHeight,
    },

    /* ── All caught up ── */
    allCaughtUp: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingVertical: Space.md,
      paddingHorizontal: Space.md,
    },
    allCaughtUpText: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      letterSpacing: TypographyV2.body.letterSpacing,
      lineHeight: TypographyV2.body.lineHeight,
    },

    /* ── Partial data notice ── */
    partialNotice: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingVertical: Space.md,
      paddingHorizontal: Space.md,
    },
    partialNoticeText: {
      flex: 1,
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      lineHeight: TypographyV2.meta.lineHeight,
    },

    partialLabel: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      paddingHorizontal: Space.md,
      paddingBottom: Space.sm,
      letterSpacing: TypographyV2.meta.letterSpacing,
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
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      lineHeight: TypographyV2.bodyStrong.lineHeight,
    },
    newSellerTipRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Space.sm,
    },
    newSellerTip: {
      flex: 1,
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      lineHeight: TypographyV2.meta.lineHeight + Space.xxs,
    },
  });
}
