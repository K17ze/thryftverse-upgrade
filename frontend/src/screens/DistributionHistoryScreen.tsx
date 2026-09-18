/**
 * DistributionHistoryScreen — view distribution history across positions.
 *
 * Spec 10 §7.1: distributions are first-class timeline entries. This screen
 * aggregates distribution events from the user's positions via the backend
 * /co-own/distributions endpoint. Per AGENTS.md §11, the backend is
 * authoritative — this screen shows real data with proper loading/error/empty
 * states.
 */

import React from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { useAppTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { Space, Radius } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { haptics } from '../utils/haptics';
import {
  CoOwnStateCanvas } from '../components/coown';
import { CoOwnDistributionCalendar } from '../components/coown/CoOwnDistributionCalendar';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { CoOwnActivitySkeleton } from '../components/coown/CoOwnSkeletons';
import { fetchCoOwnDistributions, fetchDripEnrollments, updateDripEnrollment, fetchCoOwnAssetById, type CoOwnDistribution } from '../services/marketApi';
import { formatCoOwnIze } from '../utils/currency';
import { useToast } from '../context/ToastContext';
import { Switch } from 'react-native';
import { useScreenCaptureProtection } from '../platform/screenCapture';
import { useFormattedPrice } from '../hooks/useFormattedPrice';

type RouteT = RouteProp<RootStackParamList, 'DistributionHistory'>;
type NavT = NativeStackNavigationProp<RootStackParamList>;

/** U55: Per-asset DRIP enrollment state. Distinguishes fetch failure
 * ('unknown') from explicitly-not-enrolled ('off'), and tracks per-asset
 * pending and error states instead of a single scalar. */
interface DripAssetState {
  /** Whether the user is enrolled in DRIP for this asset. */
  enrolled: boolean;
  /** Whether the enrollment status is unknown (fetch failed). */
  unknown: boolean;
  /** Whether a toggle is in progress for this specific asset. */
  pending: boolean;
  /** Error message from the last toggle attempt, null when clean. */
  error: string | null;
}

function formatDistributionAmount(minor: number): string {
  const major = minor / 100;
  return formatCoOwnIze(major);
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function DistributionHistoryScreen() {
  useScreenCaptureProtection();
  const navigation = useNavigation<NavT>();
  const route = useRoute<RouteT>();
  const { colors } = useAppTheme();
  const filterAssetId = route.params?.assetId;
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const { formatFromFiat } = useFormattedPrice();

  const formatPerUnit = React.useCallback(
    (minor: number) => `${formatFromFiat(minor / 100)}/unit`,
    [formatFromFiat]
  );

  const [distributions, setDistributions] = React.useState<CoOwnDistribution[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [assetTitles, setAssetTitles] = React.useState<Record<string, string>>({});

  // U50: Pagination — backend supports cursor-based pagination; track
  // nextCursor so the user can load beyond the first 100 rows.
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);
  const [loadingMore, setLoadingMore] = React.useState(false);

  // DRIP enrollment state
  const { show: showToast } = useToast();
  // U55: Per-asset enrollment state with unknown/pending/error tracking.
  const [dripStates, setDripStates] = React.useState<Record<string, DripAssetState>>({});
  // U55: Section-level fetch error — distinct from per-asset toggle errors.
  const [dripFetchError, setDripFetchError] = React.useState<string | null>(null);

  const loadDistributions = React.useCallback(async () => {
    try {
      setError(null);
      const [result, dripResult] = await Promise.all([
        fetchCoOwnDistributions({ assetId: filterAssetId, limit: 100 }),
        fetchDripEnrollments().catch((err): [] => {
          // U55: Preserve the fetch error instead of silently treating
          // failure as "no enrollments" (which is indistinguishable from
          // explicitly-not-enrolled).
          setDripFetchError(err instanceof Error ? err.message : 'Failed to load DRIP settings');
          return [];
        }),
      ]);
      setDistributions(result.items);
      setNextCursor(result.nextCursor);

      // U55: Build per-asset state. Assets from a successful fetch are
      // 'loaded' (enrolled or off). When the fetch failed, all assets
      // derived from distributions are marked 'unknown'.
      const dripMap: Record<string, DripAssetState> = {};
      const dripFailed = dripResult.length === 0 && dripFetchError !== null;
      // Collect asset IDs from both distributions and enrollments
      const allAssetIds = new Set<string>();
      result.items.forEach((d) => allAssetIds.add(d.assetId));
      dripResult.forEach((e) => allAssetIds.add(e.assetId));
      allAssetIds.forEach((id) => {
        dripMap[id] = { enrolled: false, unknown: dripFailed, pending: false, error: null };
      });
      dripResult.forEach((e) => {
        dripMap[e.assetId] = { enrolled: e.enrolled, unknown: false, pending: false, error: null };
      });
      setDripStates(dripMap);
      if (dripResult.length > 0) {
        setDripFetchError(null);
      }

      // Fetch asset titles for all unique assetIds so we never expose raw IDs.
      const uniqueAssetIds = new Set<string>();
      result.items.forEach((d) => uniqueAssetIds.add(d.assetId));
      dripResult.forEach((e) => uniqueAssetIds.add(e.assetId));
      const titleEntries = await Promise.all(
        Array.from(uniqueAssetIds).map(async (id) => {
          try {
            const asset = await fetchCoOwnAssetById(id);
            return [id, asset.title] as const;
          } catch {
            return [id, ''] as const;
          }
        })
      );
      const titleMap: Record<string, string> = {};
      titleEntries.forEach(([id, title]) => { if (title) titleMap[id] = title; });
      setAssetTitles(titleMap);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load distributions');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filterAssetId, dripFetchError]);

  React.useEffect(() => {
    void loadDistributions();
  }, [loadDistributions]);

  // U55: Cross-screen consistency — reload DRIP enrollments when the
  // screen regains focus so changes made elsewhere (e.g. AssetDetail)
  // are reflected without a manual pull-to-refresh.
  useFocusEffect(
    React.useCallback(() => {
      // Only refetch DRIP state on focus if we already have data (avoid
      // double-fetch on initial mount — loadDistributions handles that).
      if (!loading) {
        void loadDistributions();
      }
    }, [loadDistributions, loading])
  );

  // U50: Load more distributions via cursor pagination.
  const handleLoadMore = React.useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const result = await fetchCoOwnDistributions({ assetId: filterAssetId, limit: 100, cursor: nextCursor });
      setDistributions((prev) => [...prev, ...result.items]);
      setNextCursor(result.nextCursor);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load more', 'error');
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore, filterAssetId, showToast]);

  const handleBack = React.useCallback(() => {
    if (navigation.canGoBack()) { navigation.goBack(); return; }
    navigation.navigate('CoOwnHub');
  }, [navigation]);

  const handleRefresh = React.useCallback(() => {
    haptics.tap();
    setRefreshing(true);
    void loadDistributions();
  }, [loadDistributions]);

  // U55: Section-level retry for DRIP enrollment fetch failures.
  const handleRetryDrip = React.useCallback(() => {
    haptics.tap();
    setDripFetchError(null);
    void loadDistributions();
  }, [loadDistributions]);

  const handleToggleDrip = React.useCallback(async (assetId: string, enrolled: boolean) => {
    // U55: Per-asset pending state instead of a single scalar.
    setDripStates((prev) => ({
      ...prev,
      [assetId]: { ...(prev[assetId] ?? { enrolled: false, unknown: false, pending: false, error: null }), pending: true, error: null },
    }));
    // Optimistic update
    setDripStates((prev) => ({
      ...prev,
      [assetId]: { ...(prev[assetId] ?? { enrolled: false, unknown: false, pending: false, error: null }), enrolled },
    }));
    try {
      await updateDripEnrollment(assetId, enrolled);
      haptics.success();
      showToast(enrolled ? 'DRIP enabled — distributions will be reinvested' : 'DRIP disabled — distributions will be paid as cash', 'success');
      setDripStates((prev) => ({
        ...prev,
        [assetId]: { ...(prev[assetId] ?? { enrolled: false, unknown: false, pending: false, error: null }), pending: false, error: null },
      }));
    } catch (err) {
      // Revert
      setDripStates((prev) => ({
        ...prev,
        [assetId]: {
          ...(prev[assetId] ?? { enrolled: false, unknown: false, pending: false, error: null }),
          enrolled: !enrolled,
          pending: false,
          error: err instanceof Error ? err.message : 'Failed to update DRIP setting',
        },
      }));
      showToast('Failed to update DRIP setting', 'error');
    }
  }, [showToast]);

  // U50: Settled-only aggregate for the headline total. Pending and
  // reversed distributions are shown separately so the user can see
  // what is confirmed versus in-flight or reversed. Reinvested and
  // retained_cash distributions are settled-equivalent (the cash was
  // received) and counted in the total.
  const settledDistributions = distributions.filter(
    (d) => d.status === 'settled' || d.status === 'reinvested' || d.status === 'retained_cash',
  );
  const pendingDistributions = distributions.filter((d) => d.status === 'pending');
  const reversedDistributions = distributions.filter((d) => d.status === 'reversed');
  const totalReceived = settledDistributions.reduce((sum, d) => sum + d.amountGbpMinor, 0);
  const pendingTotal = pendingDistributions.reduce((sum, d) => sum + d.amountGbpMinor, 0);
  const reversedTotal = reversedDistributions.reduce((sum, d) => sum + d.amountGbpMinor, 0);

  // Upcoming — the forward-looking slice of the same fetched list. This
  // section replaces the asset-detail "Distribution calendar" disclosure:
  // one canonical timeline lives here, not two duplicate rows upstream.
  const upcomingEntries = React.useMemo(
    () => distributions
      .filter((d) => d.status === 'scheduled')
      .map((d) => ({
        id: d.id,
        date: d.projectedPayableDate ?? d.createdAt,
        perUnitGbp: d.perUnitGbpMinor != null ? d.perUnitGbpMinor / 100 : 0,
        totalPoolGbp: d.amountGbpMinor != null ? d.amountGbpMinor / 100 : 0,
        status: 'scheduled' as const,
        recordDate: d.recordDate ?? null,
        exDate: d.exDate ?? null,
        payableDate: d.projectedPayableDate ?? null,
      })),
    [distributions],
  );

  // Ledger rows collapse to one line each — detail (reference, dates,
  // proceeds waterfall) expands in place on tap.
  const [expandedIds, setExpandedIds] = React.useState<ReadonlySet<string>>(new Set());
  const toggleExpanded = React.useCallback((id: string) => {
    haptics.tap();
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  }, []);

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title="Distributions"
          subtitle={filterAssetId ? 'For this position' : 'All positions'}
          onBack={handleBack}
        />
      }
      scrollEnabled={false}
    >
      {loading ? (
        <View style={styles.loadingContainer}>
          <CoOwnActivitySkeleton />
        </View>
      ) : error ? (
        <CoOwnStateCanvas
          variant="error"
          title="Couldn't load distributions"
          subtitle={error}
          actionLabel="Retry"
          onAction={() => { haptics.tap(); setLoading(true); void loadDistributions(); }}
        />
      ) : distributions.length === 0 ? (
        <CoOwnStateCanvas
          variant="empty"
          title="No distributions yet"
          subtitle="Payouts from assets you hold appear here."
          actionLabel="Back to portfolio"
          onAction={() => { haptics.tap(); handleBack(); }}
        />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.textSecondary}
            />
          }
        >
          {/* Total — typographic hero on canvas. The number is the
              object; no card, no icon, no badge chrome. */}
          <View style={styles.section}>
            <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Total received</Text>
            <Text style={[styles.summaryValue, { color: colors.successText }]}>
              {formatDistributionAmount(totalReceived)}
            </Text>
            <Text style={[styles.summaryCount, { color: colors.textSecondary }]}>
              {settledDistributions.length} settled distribution{settledDistributions.length !== 1 ? 's' : ''}
            </Text>
            {/* U50: Pending and reversed shown separately from the settled total */}
            {pendingDistributions.length > 0 || reversedDistributions.length > 0 ? (
              <View style={styles.summaryBreakdown}>
                {pendingDistributions.length > 0 && (
                  <View style={[styles.breakdownRow, { borderTopColor: colors.borderSubtle }]}>
                    <Text style={[styles.breakdownLabel, { color: colors.textMuted }]}>Pending</Text>
                    <Text style={[styles.breakdownValue, { color: colors.warningText }]}>
                      {formatDistributionAmount(pendingTotal)}
                    </Text>
                  </View>
                )}
                {reversedDistributions.length > 0 && (
                  <View style={[styles.breakdownRow, { borderTopColor: colors.borderSubtle }]}>
                    <Text style={[styles.breakdownLabel, { color: colors.textMuted }]}>Reversed</Text>
                    <Text style={[styles.breakdownValue, { color: colors.dangerText }]}>
                      {formatDistributionAmount(reversedTotal)}
                    </Text>
                  </View>
                )}
              </View>
            ) : null}
          </View>

          {/* Upcoming — scheduled distributions, the forward-looking half
              of the timeline. Replaces the asset-detail calendar
              disclosure: this screen is the single canonical schedule. */}
          {upcomingEntries.length > 0 ? (
            <View style={[styles.section, styles.sectionSeparated, { borderTopColor: colors.borderSubtle }]}>
              <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                Upcoming
              </Text>
              <CoOwnDistributionCalendar entries={upcomingEntries} maxEntries={4} />
            </View>
          ) : null}

          {/* Dividend reinvestment — flat section: state rows with
              switches, hairline-separated. */}
          <View style={[styles.section, styles.sectionSeparated, { borderTopColor: colors.borderSubtle }]}>
            <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              Dividend reinvestment
            </Text>
            <Text style={[styles.sectionBody, { color: colors.textSecondary }]}>
              Automatically reinvest distributions into additional units of the same asset.
            </Text>

            {/* U55: Section-level fetch error with retry — distinct from
                per-asset toggle errors. Preserves "unknown" vs "off". */}
            {dripFetchError ? (
              <View style={styles.dripErrorWrap}>
                <Text style={[styles.dripErrorText, { color: colors.dangerText }]} numberOfLines={2}>
                  {dripFetchError}
                </Text>
                <Pressable
                  style={({ pressed }) => pressed && { opacity: 0.6 }}
                  onPress={handleRetryDrip}
                  accessibilityRole="button"
                  accessibilityLabel="Retry loading DRIP settings"
                >
                  <Text style={[styles.dripRetryText, { color: colors.brand }]}>Retry</Text>
                </Pressable>
              </View>
            ) : Object.keys(dripStates).length > 0 ? (
              <View>
                {Object.entries(dripStates).map(([assetId, state], index) => (
                  <View key={assetId} style={index > 0 ? [styles.rowSeparated, { borderTopColor: colors.borderSubtle }] : undefined}>
                    <View style={styles.dripAssetRow}>
                      <Text style={[styles.dripAssetName, { color: colors.textPrimary }]} numberOfLines={1}>
                        {assetTitles[assetId] ?? 'Asset'}
                      </Text>
                      {state.error ? (
                        <Ionicons name="alert-circle" size={14} color={colors.dangerText} />
                      ) : null}
                      <Switch
                        value={state.enrolled}
                        onValueChange={(v) => void handleToggleDrip(assetId, v)}
                        disabled={state.pending}
                        trackColor={{ false: colors.surfaceAlt, true: colors.brand }}
                        thumbColor={colors.surfaceElevated}
                        accessibilityRole="switch"
                        accessibilityLabel={`DRIP for ${assetTitles[assetId] ?? 'asset'}`}
                      />
                    </View>
                    {/* U55: Per-asset error message */}
                    {state.error ? (
                      <Text style={[styles.dripAssetError, { color: colors.dangerText }]} numberOfLines={1}>
                        {state.error}
                      </Text>
                    ) : null}
                    {/* U55: Unknown state indicator */}
                    {state.unknown && !state.error ? (
                      <Text style={[styles.dripAssetUnknown, { color: colors.textMuted }]}>
                        Enrollment status unavailable
                      </Text>
                    ) : null}
                  </View>
                ))}
              </View>
            ) : (
              <Text style={[styles.sectionBody, { color: colors.textMuted }]}>
                No DRIP enrollments yet.
              </Text>
            )}

            {/* U54: First enrollment path — eligible assets as plain
                disclosure rows into the asset detail enrollment flow. */}
            {Object.keys(dripStates).length === 0 && !dripFetchError && distributions.length > 0 && (
              <View>
                {Array.from(new Set(distributions.map((d) => d.assetId))).slice(0, 3).map((assetId, index) => (
                  <Pressable
                    key={assetId}
                    style={({ pressed }) => [
                      styles.eligibleRow,
                      index > 0 && styles.rowSeparated,
                      { borderTopColor: colors.borderSubtle },
                      pressed && { opacity: 0.6 },
                    ]}
                    onPress={() => { haptics.tap(); navigation.navigate('AssetDetail', { assetId }); }}
                    accessibilityRole="button"
                    accessibilityLabel={`View ${assetTitles[assetId] ?? 'asset'} to enroll in DRIP`}
                  >
                    <Text style={[styles.eligibleName, { color: colors.textPrimary }]} numberOfLines={1}>
                      {assetTitles[assetId] ?? 'Asset'}
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                  </Pressable>
                ))}
                <Text style={[styles.eligibleNote, { color: colors.textMuted }]}>
                  Enable DRIP from an asset's distribution card.
                </Text>
              </View>
            )}
          </View>

          {/* History — one-line ledger rows that expand in place for
              reference, dates and the proceeds waterfall. */}
          <View style={[styles.section, styles.sectionSeparated, { borderTopColor: colors.borderSubtle }]}>
            <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              History
            </Text>
            {distributions.map((dist, index) => {
              // U50: Status-specific amount colours — settled (success),
              // pending (warning), reversed (danger), reinvested (brand),
              // reinvest_failed (danger), retained_cash (muted).
              const amountColor = dist.status === 'settled' ? colors.successText
                : dist.status === 'reversed' ? colors.dangerText
                : dist.status === 'reinvested' ? colors.brand
                : dist.status === 'reinvest_failed' ? colors.dangerText
                : dist.status === 'retained_cash' ? colors.textSecondary
                : colors.warningText;
              const typeLabel = dist.distributionType === 'revenue_share' ? 'Revenue share'
                : dist.distributionType === 'dividend' ? 'Dividend'
                : dist.distributionType.charAt(0).toUpperCase() + dist.distributionType.slice(1).replace(/_/g, ' ');
              const expanded = expandedIds.has(dist.id);
              const amountLabel = `${dist.status === 'reversed' ? '−' : dist.status === 'reinvested' || dist.status === 'retained_cash' ? '' : '+'}${formatDistributionAmount(dist.amountGbpMinor)}`;
              return (
                <View key={dist.id} style={index > 0 ? [styles.rowSeparated, { borderTopColor: colors.borderSubtle }] : undefined}>
                  <Pressable
                    onPress={() => toggleExpanded(dist.id)}
                    accessibilityRole="button"
                    accessibilityState={{ expanded }}
                    accessibilityLabel={`${typeLabel}, ${formatDate(dist.settledAt ?? dist.createdAt)}, ${amountLabel}`}
                    style={({ pressed }) => [styles.distRow, pressed && { opacity: 0.6 }]}
                  >
                    <View style={styles.distHeaderText}>
                      <Text style={[styles.distType, { color: colors.textPrimary }]} numberOfLines={1}>
                        {typeLabel}
                      </Text>
                      <Text style={[styles.distDate, { color: colors.textMuted }]} numberOfLines={1}>
                        {[formatDate(dist.settledAt ?? dist.createdAt), assetTitles[dist.assetId]].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                    <Text style={[styles.amountText, { color: amountColor }]}>{amountLabel}</Text>
                    <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
                  </Pressable>
                  {expanded ? (
                    <View style={styles.distDetails}>
                  {dist.reference && (
                    <View style={styles.detailRow}>
                      <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Reference</Text>
                      <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{dist.reference}</Text>
                    </View>
                  )}
                  <View style={styles.detailRow}>
                    <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Status</Text>
                    <Text style={[styles.detailValue, { color: amountColor }]}>
                      {dist.status === 'reinvested' ? 'Reinvested'
                        : dist.status === 'reinvest_failed' ? 'Reinvest failed'
                        : dist.status === 'retained_cash' ? 'Retained as cash'
                        : dist.status.charAt(0).toUpperCase() + dist.status.slice(1)}
                    </Text>
                  </View>
                  {/* Record / ex / payable dates — rendered only when the
                      payload carries them; never fabricated. */}
                  {dist.recordDate && (
                    <View style={styles.detailRow}>
                      <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Record date</Text>
                      <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{formatDate(dist.recordDate)}</Text>
                    </View>
                  )}
                  {dist.exDate && (
                    <View style={styles.detailRow}>
                      <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Ex date</Text>
                      <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{formatDate(dist.exDate)}</Text>
                    </View>
                  )}
                  {dist.projectedPayableDate && (
                    <View style={styles.detailRow}>
                      <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Payable</Text>
                      <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{formatDate(dist.projectedPayableDate)}</Text>
                    </View>
                  )}
                  {/* Proceeds waterfall — honest partial waterfall built only
                      from fields the contract actually carries
                      (amountGbpMinor, perUnitGbpMinor, unitsAtRecord). The
                      payload has no separate cost/fee lines, so none are
                      invented — the note below says so. */}
                  <View style={[styles.waterfall, { borderTopColor: colors.borderSubtle }]}>
                    <Text style={[styles.waterfallTitle, { color: colors.textMuted }]}>Proceeds</Text>
                    <View style={styles.detailRow}>
                      <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Gross distribution</Text>
                      <Text style={[styles.detailValue, { color: colors.textPrimary }]}>
                        {formatDistributionAmount(dist.amountGbpMinor)}
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Per unit</Text>
                      <Text style={[styles.detailValue, { color: colors.textPrimary }]}>
                        {formatPerUnit(dist.perUnitGbpMinor)}
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Your units at record</Text>
                      <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{dist.unitsAtRecord}</Text>
                    </View>
                    <View style={[styles.detailRow, styles.waterfallNet, { borderTopColor: colors.borderSubtle }]}>
                      <Text style={[styles.detailLabel, { color: colors.textPrimary }]}>
                        {dist.status === 'pending' ? 'Projected to you'
                          : dist.status === 'reversed' ? 'Paid (later reversed)'
                          : 'You received'}
                      </Text>
                      <Text style={[styles.detailValue, { color: amountColor }]}>
                        {formatDistributionAmount(dist.amountGbpMinor)}
                      </Text>
                    </View>
                    <Text style={[styles.waterfallNote, { color: colors.textMuted }]}>
                      Costs and fees are not itemised for this distribution.
                    </Text>
                  </View>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>

          {/* U50: Load more — cursor pagination beyond the first 100 rows */}
          {nextCursor && (
            <Pressable
              style={({ pressed }) => [styles.loadMoreBtn, { borderColor: colors.border }, pressed && { opacity: 0.7 }]}
              onPress={handleLoadMore}
              disabled={loadingMore}
              accessibilityRole="button"
              accessibilityLabel="Load more distributions"
            >
              {loadingMore ? (
                <ActivityIndicator size="small" color={colors.brand} />
              ) : (
                <Text style={[styles.loadMoreText, { color: colors.brand }]}>Load more</Text>
              )}
            </Pressable>
          )}
        </ScrollView>
      )}
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  content: {
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
    gap: Space.sm,
    paddingBottom: Space.xxl },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center' },
  // Flat sections — typography and hairlines carry the hierarchy.
  section: {
    gap: Space.xs },
  sectionSeparated: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Space.md,
    marginTop: Space.xs },
  sectionTitle: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing },
  sectionBody: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    lineHeight: TypographyV2.meta.lineHeight },
  rowSeparated: {
    borderTopWidth: StyleSheet.hairlineWidth },
  summaryLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing },
  summaryValue: {
    fontSize: TypographyV2.priceHero.size,
    fontFamily: TypographyV2.priceHero.fontFamily,
    fontVariant: ['tabular-nums'],
    letterSpacing: TypographyV2.priceHero.letterSpacing },
  summaryCount: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing },
  distRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm + 2,
    minHeight: 44 },
  distHeaderText: {
    flex: 1 },
  distType: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    letterSpacing: TypographyV2.body.letterSpacing },
  distDate: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    marginTop: Space.xs - 2,
    letterSpacing: TypographyV2.meta.letterSpacing },
  amountText: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    fontVariant: ['tabular-nums'],
    letterSpacing: TypographyV2.bodyStrong.letterSpacing },
  distDetails: {
    paddingBottom: Space.sm,
    gap: Space.sm },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center' },
  detailLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing },
  detailValue: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    fontVariant: ['tabular-nums'],
    letterSpacing: TypographyV2.meta.letterSpacing },
  // Proceeds waterfall — gross → per-unit → units → received
  waterfall: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Space.sm,
    gap: Space.sm },
  waterfallTitle: {
    fontSize: TypographyV2.meta.size - 1,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    textTransform: 'uppercase' },
  waterfallNet: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Space.sm },
  waterfallNote: {
    fontSize: TypographyV2.meta.size - 1,
    fontFamily: TypographyV2.meta.fontFamily,
    lineHeight: TypographyV2.meta.lineHeight },
  dripAssetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.sm,
    paddingVertical: Space.sm },
  dripAssetName: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    flex: 1 },
  // U50: Summary breakdown for pending/reversed
  summaryBreakdown: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Space.sm,
    marginTop: Space.xs,
    width: '100%',
    gap: Space.xs },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center' },
  breakdownLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing },
  breakdownValue: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    fontVariant: ['tabular-nums'],
    letterSpacing: TypographyV2.meta.letterSpacing },
  // U55: DRIP section error + retry
  dripErrorWrap: {
    gap: Space.xs },
  dripErrorText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    lineHeight: TypographyV2.meta.lineHeight },
  dripRetryText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing },
  // U55: Per-asset error/unknown indicators
  dripAssetError: {
    fontSize: TypographyV2.meta.size - 1,
    fontFamily: TypographyV2.meta.fontFamily,
    marginTop: Space.xs - 2 },
  dripAssetUnknown: {
    fontSize: TypographyV2.meta.size - 1,
    fontFamily: TypographyV2.meta.fontFamily,
    marginTop: Space.xs - 2 },
  // U54: Eligible holdings — plain disclosure rows
  eligibleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm + 2,
    minHeight: 44 },
  eligibleName: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    flex: 1 },
  eligibleNote: {
    fontSize: TypographyV2.meta.size - 1,
    fontFamily: TypographyV2.meta.fontFamily,
    lineHeight: TypographyV2.meta.lineHeight },
  // U50: Load more button
  loadMoreBtn: {
    paddingVertical: Space.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.lg },
  loadMoreText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    letterSpacing: TypographyV2.body.letterSpacing } });
}
