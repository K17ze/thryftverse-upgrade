import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppTheme } from '../theme/ThemeContext';
import { Space, Radius, Control } from '../theme/designTokens';
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
  FlagshipMetricLine } from '../components/flagship';
import { CachedImage } from '../components/CachedImage';
import { useStore } from '../store/useStore';
import { useSellerTrust } from '../platform/product';
import {
  fetchSellerHubOverview,
  type SellerHubOverview,
  type SellerHubTask,
  type SellerHubTaskType } from '../services/sellerHubApi';
import { fetchImportBatches, type BatchSummaryDTO, type CatalogSource } from '../services/catalogImportApi';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { haptics } from '../utils/haptics';
import { OfflineBanner } from '../components/OfflineBanner';
import { track } from '../analytics';
import { AppIcon } from '../components/common/AppIcon';
import { IconSize, type SemanticIconName } from '../theme/iconTokens';


type NavT = NativeStackNavigationProp<RootStackParamList>;

// ── Task metadata: icon, label, route per task type ──
// Single source of truth for how each task type renders. No branching
// scattered across the screen — one map, one grammar.
const TASK_META: Record<SellerHubTaskType, {
  icon: SemanticIconName | React.ComponentProps<typeof Ionicons>['name'];
  route: keyof RootStackParamList;
}> = {
  ship_order: { icon: 'car-outline', route: 'MyOrders' },
  respond_offer: { icon: 'chat', route: 'Inbox' },
  listing_issue: { icon: 'edit', route: 'InventoryManagement' },
  catalogue_awaiting: { icon: 'download', route: 'CatalogImportProgress' },
  payout_hold: { icon: 'wallet', route: 'Wallet' } };

function formatDueAt(dueAt: string | null): string | null {
  if (!dueAt) return null;
  const due = new Date(dueAt);
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
  vinted: 'Vinted import' };

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
  const navigation = useNavigation<NavT>();
  const currentUser = useStore((s) => s.currentUser);
  const { data: sellerTrust } = useSellerTrust(currentUser?.id);
  const { formatFromFiat, currencyCode } = useFormattedPrice();

  const formatMoney = useCallback((value: number): string => {
    if (value >= 1000) {
      return `${formatFromFiat(value, currencyCode, { displayMode: 'fiat', minimumFractionDigits: 1 })}k`;
    }
    return formatFromFiat(value, currencyCode, { displayMode: 'fiat', minimumFractionDigits: 0 });
  }, [formatFromFiat, currencyCode]);

  const [overview, setOverview] = useState<SellerHubOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);

  // Catalogue import batches — past and in-progress (blueprint §5.1).
  const [importBatches, setImportBatches] = useState<BatchSummaryDTO[]>([]);

  const load = useCallback(async () => {
    if (!currentUser?.id) return;
    try {
      const hubOverview = await fetchSellerHubOverview();
      setOverview(hubOverview);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
    // Fetch catalogue import batches in parallel — failures are non-fatal.
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

  // ── Catalogue import batches visible in the Hub ──
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

  // ── Freshness: determine if all critical sources are fresh ──
  // Per Report 17 P0: "You're all caught up" must only show when ALL task
  // sources are fresh. If orders or offers are unavailable, we cannot
  // truthfully claim the seller has no tasks.
  const allTaskSourcesFresh = useMemo(() => {
    if (!overview) return false;
    const ordersFresh = overview.freshness.orders?.state === 'fresh';
    const offersFresh = overview.freshness.offers?.state === 'fresh';
    const listingsFresh = overview.freshness.listings?.state === 'fresh';
    return ordersFresh && offersFresh && listingsFresh;
  }, [overview]);

  // ── Loading state ──
  if (isLoading) {
    return (
      <FlagshipScreen
        header={<FlagshipHeader title="Seller Hub" onBack={() => navigation.goBack()} />}
      >
        <FlagshipState variant="loading" />
      </FlagshipScreen>
    );
  }

  // ── Error state ──
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

  // ── Navigate to task route ──
  const navigateToTask = (task: SellerHubTask) => {
    haptics.tap();
    const meta = TASK_META[task.type];
    navigation.navigate(meta.route as any);
  };

  return (
    <FlagshipScreen
      testID="seller-hub-screen"
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
        {/* ════════════════════════════════════════════════════════════════
            FIRST VIEWPORT — task-first, money second
            Per Report 17 §6.1: one critical task if real, then money posture,
            then drill-down. Not a 2×2 grid of KPI cards.
            ════════════════════════════════════════════════════════════════ */}

        {/* ── Verification status — only when it gates a real capability ── */}
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
            <AppIcon name="verified" size={IconSize.sm} color="warning" opticalCenter accessible={false} />
            <View style={styles.verificationBannerText}>
              <Text style={[styles.verificationBannerTitle, { color: colors.textPrimary }]}>
                Get verified
              </Text>
              <Text style={[styles.verificationBannerSub, { color: colors.textSecondary }]}>
                Build buyer trust with a verified badge
              </Text>
            </View>
            <AppIcon name="forward" size={IconSize.xs} color="textMuted" opticalCenter accessible={false} />
          </Pressable>
        )}

        {/* ── Top task — the dominant first-viewport object ──
            Per Report 17 §6.1: "one critical task, only if real".
            This is the single most important thing the seller must do.
            Flat, no card chrome — the task IS the content. */}
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
            accessibilityHint={`Opens ${topTask.actionLabel}`}
          >
            <View style={styles.topTaskIconWrap}>
              <AppIcon
                name={TASK_META[topTask.type].icon}
                size={IconSize.lg}
                color={topTask.priority === 'critical' ? 'danger' : 'brand'}
                opticalCenter
                accessible={false}
              />
            </View>
            <View style={styles.topTaskContent}>
              <Text style={[styles.topTaskTitle, { color: colors.textPrimary }]} numberOfLines={2}>
                {topTask.count > 1
                  ? `${topTask.count} ${topTask.actionLabel.toLowerCase()}`
                  : topTask.actionLabel}
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

        {/* ── Money posture — available, processing, held ──
            Per Report 17 §6.1: "{currencySymbol}428 available {currencySymbol}91 processing {currencySymbol}35 held"
            Flat metric lines, not cards. One line per state.
            Asking-price inventory value is NOT shown here — it's not money. */}
        {money && (
          <View style={styles.moneySection}>
            <FlagshipMetricLine
              label="Available"
              value={formatMoney(money.availableGbp)}
              subLabel={money.nextPayoutAt ? `Next payout ${new Date(money.nextPayoutAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : undefined}
              emphasis
            />
            <FlagshipMetricLine
              label="Processing"
              value={formatMoney(money.processingGbp)}
              subLabel="Pending escrow release"
              separated
            />
            {money.heldGbp > 0 && (
              <FlagshipMetricLine
                label="Held in reserve"
                value={formatMoney(money.heldGbp)}
                subLabel="Rolling reserve"
                separated
              />
            )}
          </View>
        )}

        {/* ── Tasks — flat rows, one per task type ──
            Per Report 17 §6.2: "Flat task rows with item identity, due
            time and consequence." No card wrapping. */}
        {tasks.length > 0 && (
          <FlagshipFormSection variant="flat" title="Needs you">
            {tasks.map((task) => {
              const meta = TASK_META[task.type];
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
                  title={task.count > 1
                    ? `${task.count} ${task.actionLabel.toLowerCase()}`
                    : task.actionLabel}
                  subtitle={subtitleParts.join(' · ') || undefined}
                  icon={meta.icon}
                  iconColor={task.priority === 'critical' ? colors.danger : undefined}
                  onPress={() => navigateToTask(task)}
                  accessibilityLabel={`${task.actionLabel}, ${task.count} items${dueLabel ? `, ${dueLabel}` : ''}`}
                />
              );
            })}
          </FlagshipFormSection>
        )}

        {/* ── "All caught up" — ONLY when all task sources are fresh ──
            Per Report 17 P0: suppress false "all caught up" when
            order/offer sources aren't checked. This only renders when
            the freshness matrix confirms all sources are fresh AND
            there are no tasks. */}
        {tasks.length === 0 && allTaskSourcesFresh && (
          <View style={styles.allCaughtUp}>
            <AppIcon name="checkmark-circle" focused size={IconSize.md} color="success" opticalCenter accessible={false} />
            <Text style={[styles.allCaughtUpText, { color: colors.textMuted }]} maxFontSizeMultiplier={1.3}>
              You're all caught up
            </Text>
          </View>
        )}

        {/* ── Partial data notice — when some sources are unavailable ──
            Per Report 17 §6.4: "Keep available modules; identify failed
            source and slice retry." Truthful labelling, not silent merge. */}
        {tasks.length === 0 && !allTaskSourcesFresh && (
          <View style={styles.partialNotice}>
            <AppIcon name="offline" size={IconSize.sm} color="textMuted" opticalCenter accessible={false} />
            <Text style={[styles.partialNoticeText, { color: colors.textMuted }]} maxFontSizeMultiplier={1.3}>
              Some data is unavailable. Pull to refresh.
            </Text>
          </View>
        )}

        {/* ── Business pulse — 30-day settled order facts ──
            Per Report 17 P0: revenue from settled orders, not asking price.
            Shows gross sales, refunds, fees, net — the real money story. */}
        {businessPulse && businessPulse.orders > 0 && (
          <FlagshipFormSection variant="flat" title="Last 30 days">
            <FlagshipMetricLine
              label="Gross sales"
              value={formatMoney(businessPulse.grossSalesGbp)}
              subLabel={`${businessPulse.orders} order${businessPulse.orders === 1 ? '' : 's'}`}
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
                label="Fees"
                value={`-${formatMoney(businessPulse.feesGbp)}`}
                muted
                separated
              />
            )}
            <FlagshipMetricLine
              label="Net sales"
              value={formatMoney(businessPulse.netSalesGbp)}
              success={businessPulse.netSalesGbp > 0}
              emphasis
              separated
            />
            {businessPulse.completeness === 'partial' && (
              <Text style={[styles.partialLabel, { color: colors.textMuted }]}>
                Fee and refund data may be incomplete
              </Text>
            )}
          </FlagshipFormSection>
        )}

        {/* ── Catalogue imports (blueprint §5.1) ── */}
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
                accessibilityHint="Opens the import progress screen"
              />
            ))
          ) : (
            <FlagshipNavigationRow
              title="Import a shop"
              subtitle="Bring your existing listings from eBay or a file"
              icon="download"
              onPress={() => navigation.navigate('CatalogImportStart')}
              accessibilityLabel="Import a shop"
              accessibilityHint="Start a catalogue import from eBay or a file"
            />
          )}
        </FlagshipFormSection>

        {/* ── New seller guidance ──
            Only shows when the seller has no listings and no completed sales.
            Restrained — one heading, three tips, no decorative chrome. */}
        {isNewSeller && (
          <View style={styles.newSellerCard}>
            <View style={styles.newSellerHeader}>
              <AppIcon name="storefront-outline" size={IconSize.sm} color="brand" opticalCenter accessible={false} />
              <Text style={[styles.newSellerTitle, { color: colors.textPrimary }]}>
                New to selling?
              </Text>
            </View>
            <View style={styles.newSellerTipRow}>
              <AppIcon name="camera" size={IconSize.xs} color="textMuted" opticalCenter accessible={false} />
              <Text style={[styles.newSellerTip, { color: colors.textSecondary }]}>
                Start with a clear photo — it's the first thing buyers see
              </Text>
            </View>
            <View style={styles.newSellerTipRow}>
              <AppIcon name="cash-outline" size={IconSize.xs} color="textMuted" opticalCenter accessible={false} />
              <Text style={[styles.newSellerTip, { color: colors.textSecondary }]}>
                Price competitively — check similar sold items for guidance
              </Text>
            </View>
            <View style={styles.newSellerTipRow}>
              <AppIcon name="chat" size={IconSize.xs} color="textMuted" opticalCenter accessible={false} />
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
            icon={<AppIcon name="plus" size={IconSize.sm} color={colors.background} opticalCenter accessible={false} />}
            variant="primary"
            size="lg"
            onPress={() => navigation.navigate('Sell')}
            accessibilityLabel="Create a new listing"
            hapticFeedback="light"
          />
        </View>

        {/* ── Inventory — flat metric lines from server aggregate ──
            Per Report 17: counts are uncapped (server-side COUNT, not
            on-device reduction over 100 listings). Listed value is
            asking price, labelled honestly — NOT revenue. */}
        <FlagshipFormSection variant="flat" title="Inventory">
          <FlagshipMetricLine label="Active" value={String(inventory.active)} />
          <FlagshipMetricLine label="Draft" value={String(inventory.drafts)} separated />
          <FlagshipMetricLine label="Sold" value={String(inventory.sold)} separated />
          <FlagshipMetricLine label="Paused" value={String(inventory.paused)} separated />
          <FlagshipMetricLine
            label="Listed value"
            value={formatMoney(inventory.listedValueGbp)}
            subLabel="Asking price, not revenue"
            separated
          />
          <FlagshipNavigationRow
            title="Manage listings"
            subtitle="Active, draft, sold and paused"
            icon="list"
            onPress={() => navigation.navigate('MyListings')}
            accessibilityLabel="Manage all your listings"
            accessibilityHint="Opens your listings"
          />
          <FlagshipNavigationRow
            title="Inventory dashboard"
            subtitle="Filters and bulk actions"
            icon="grid"
            onPress={() => navigation.navigate('InventoryManagement')}
            accessibilityLabel="Open inventory management dashboard"
            accessibilityHint="Opens the inventory management screen"
          />
        </FlagshipFormSection>

        {/* Store -- only real destinations. */}
        <FlagshipFormSection variant="flat" title="Store">
          <FlagshipNavigationRow
            title="Analytics"
            subtitle="Views, sales and engagement"
            icon="analytics"
            onPress={() => navigation.navigate('SellerAnalytics')}
            accessibilityLabel="View seller analytics"
            accessibilityHint="Opens the seller analytics dashboard"
          />
          <FlagshipNavigationRow
            title="Auctions"
            subtitle="Auction listings"
            icon="hammer"
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
            icon="wallet"
            onPress={() => navigation.navigate('Wallet')}
            accessibilityLabel="Payouts and wallet"
            accessibilityHint="Opens your wallet"
          />
          <FlagshipNavigationRow
            title="Verification"
            subtitle={isVerified ? 'Verified' : 'ID and seller standards'}
            icon={isVerified ? 'checkmark-circle' : 'profile'}
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
    paddingBottom: Space.xxl },

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
    marginBottom: Space.sm },
  verificationBannerText: {
    flex: 1,
    gap: Space.xxs },
  verificationBannerTitle: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    lineHeight: TypographyV2.bodyStrong.lineHeight },
  verificationBannerSub: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    lineHeight: TypographyV2.meta.lineHeight },

  /* ── Top task — dominant first-viewport object ── */
  topTaskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
    marginHorizontal: Space.md,
    borderRadius: Radius.lg,
    marginBottom: Space.sm,
    minHeight: Control.hit + Space.sm },
  topTaskIconWrap: {
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center' },
  topTaskContent: {
    flex: 1,
    gap: Space.xxs },
  topTaskTitle: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    lineHeight: TypographyV2.bodyStrong.lineHeight },
  topTaskDue: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    lineHeight: TypographyV2.meta.lineHeight },

  /* ── Money section ── */
  moneySection: {
    marginBottom: Space.sm },

  /* ── "All caught up" — only when all sources fresh ── */
  allCaughtUp: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.md,
    paddingHorizontal: Space.md },
  allCaughtUpText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    letterSpacing: TypographyV2.body.letterSpacing,
    lineHeight: TypographyV2.body.lineHeight },

  /* ── Partial data notice ── */
  partialNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingVertical: Space.md,
    paddingHorizontal: Space.md },
  partialNoticeText: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    lineHeight: TypographyV2.meta.lineHeight },

  /* ── Partial label for business pulse ── */
  partialLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    paddingHorizontal: Space.md,
    paddingBottom: Space.sm,
    letterSpacing: TypographyV2.meta.letterSpacing },

  /* ── New seller guidance ── */
  newSellerCard: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
    marginHorizontal: Space.md,
    gap: Space.sm },
  newSellerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    marginBottom: Space.xs - 2 },
  newSellerTitle: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    lineHeight: TypographyV2.bodyStrong.lineHeight },
  newSellerTipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.sm },
  newSellerTip: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    lineHeight: TypographyV2.meta.lineHeight + Space.xxs },

  /* Create listing CTA */
  ctaWrap: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.lg } });
