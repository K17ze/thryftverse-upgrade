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
import { Space, Radius, Control } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { haptics } from '../utils/haptics';
import {
  CoOwnStateCanvas } from '../components/coown';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { CoOwnActivitySkeleton } from '../components/coown/CoOwnSkeletons';
import { fetchCoOwnDistributions, fetchDripEnrollments, updateDripEnrollment, fetchCoOwnAssetById, type CoOwnDistribution } from '../services/marketApi';
import { formatCoOwnIze } from '../utils/currency';
import { useToast } from '../context/ToastContext';
import { Switch } from 'react-native';
import { AppButton } from '../components/ui/AppButton';
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
          subtitle="Distributions appear here with amount and dates."
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
          {/* Summary */}
          <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Total received (settled)</Text>
            <Text style={[styles.summaryValue, { color: colors.success }]}>
              {formatDistributionAmount(totalReceived)}
            </Text>
            <Text style={[styles.summaryCount, { color: colors.textSecondary }]}>
              {settledDistributions.length} settled distribution{settledDistributions.length !== 1 ? 's' : ''}
            </Text>
            {/* U50: Pending and reversed shown separately from the settled total */}
            {(pendingDistributions.length > 0 || reversedDistributions.length > 0) && (
              <View style={[styles.summaryBreakdown, { borderTopColor: colors.borderSubtle }]}>
                {pendingDistributions.length > 0 && (
                  <View style={styles.breakdownRow}>
                    <Text style={[styles.breakdownLabel, { color: colors.textMuted }]}>Pending</Text>
                    <Text style={[styles.breakdownValue, { color: colors.warning }]}>
                      {formatDistributionAmount(pendingTotal)}
                    </Text>
                  </View>
                )}
                {reversedDistributions.length > 0 && (
                  <View style={styles.breakdownRow}>
                    <Text style={[styles.breakdownLabel, { color: colors.textMuted }]}>Reversed</Text>
                    <Text style={[styles.breakdownValue, { color: colors.danger }]}>
                      {formatDistributionAmount(reversedTotal)}
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>

          {/* DRIP enrollment card — flagship treatment with count badge and status indicators */}
          <View style={[styles.dripCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.dripHeader}>
              <View style={[styles.dripIcon, { backgroundColor: colors.brand }]}>
                <Ionicons name="repeat" size={20} color={colors.textInverse} />
              </View>
              <View style={styles.dripHeaderText}>
                <Text style={[styles.dripTitle, { color: colors.textPrimary }]}>Dividend reinvestment</Text>
                <Text style={[styles.dripBody, { color: colors.textSecondary }]}>
                  Automatically reinvest distributions into additional units of the same asset.
                </Text>
              </View>
            </View>

            {/* U53: DRIP is now processed automatically by the backend
                worker. The previous "not yet processed" warning has been
                removed since the DRIP execution consumer is active. */}

            {/* U55: Section-level fetch error with retry — distinct from
                per-asset toggle errors. Preserves "unknown" vs "off". */}
            {dripFetchError ? (
              <View style={[styles.dripErrorWrap, { borderTopColor: colors.borderSubtle }]}>
                <View style={styles.dripErrorRow}>
                  <Ionicons name="cloud-offline-outline" size={16} color={colors.danger} />
                  <Text style={[styles.dripErrorText, { color: colors.danger }]} numberOfLines={2}>
                    {dripFetchError}
                  </Text>
                </View>
                <Pressable
                  style={({ pressed }) => [styles.dripRetryBtn, { borderColor: colors.brand }, pressed && { opacity: 0.7 }]}
                  onPress={handleRetryDrip}
                  accessibilityRole="button"
                  accessibilityLabel="Retry loading DRIP settings"
                >
                  <Text style={[styles.dripRetryText, { color: colors.brand }]}>Retry</Text>
                </Pressable>
              </View>
            ) : Object.keys(dripStates).length > 0 ? (
              /* Per-asset DRIP toggles with status indicators */
              <View style={[styles.dripAssetList, { borderTopColor: colors.borderSubtle }]}>
                {Object.entries(dripStates).map(([assetId, state]) => (
                  <View key={assetId}>
                    <View style={styles.dripAssetRow}>
                      <View style={styles.dripAssetInfo}>
                        <View style={[styles.dripAssetDot, { backgroundColor: state.enrolled ? colors.success : state.unknown ? colors.warning : colors.textMuted }]} />
                        <Text style={[styles.dripAssetName, { color: colors.textPrimary }]} numberOfLines={1}>
                          {assetTitles[assetId] ?? 'Asset'}
                        </Text>
                        {state.enrolled && (
                          <View style={[styles.dripEnrolledBadge, { backgroundColor: colors.successSubtle }]}>
                            <Text style={[styles.dripEnrolledText, { color: colors.success }]}>Active</Text>
                          </View>
                        )}
                        {/* U55: Per-asset error indicator */}
                        {state.error && (
                          <Ionicons name="alert-circle" size={14} color={colors.danger} />
                        )}
                      </View>
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
                    {state.error && (
                      <Text style={[styles.dripAssetError, { color: colors.danger }]} numberOfLines={1}>
                        {state.error}
                      </Text>
                    )}
                    {/* U55: Unknown state indicator */}
                    {state.unknown && !state.error && (
                      <Text style={[styles.dripAssetUnknown, { color: colors.textMuted }]}>
                        Enrollment status unavailable
                      </Text>
                    )}
                  </View>
                ))}
              </View>
            ) : (
              /* U54: Zero-enrollment path — show eligible holdings and provide
                  a route to enrollment through the existing distribution flow. */
              <View style={[styles.dripEmptyWrap, { borderTopColor: colors.borderSubtle }]}>
                <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
                <Text style={[styles.dripEmpty, { color: colors.textMuted }]}>
                  No DRIP enrollments yet. Eligible holdings from your distributions are shown below.
                </Text>
              </View>
            )}

            {/* U54: First enrollment path — when the user has distributions
                but zero DRIP enrollments, show eligible assets with a CTA to
                navigate to the asset detail for enrollment. */}
            {Object.keys(dripStates).length === 0 && !dripFetchError && distributions.length > 0 && (
              <View style={[styles.dripEnrollCta, { borderTopColor: colors.borderSubtle }]}>
                {Array.from(new Set(distributions.map((d) => d.assetId))).slice(0, 3).map((assetId) => (
                  <Pressable
                    key={assetId}
                    style={({ pressed }) => [styles.eligibleRow, { borderColor: colors.borderSubtle }, pressed && { opacity: 0.7 }]}
                    onPress={() => { haptics.tap(); navigation.navigate('AssetDetail', { assetId }); }}
                    accessibilityRole="button"
                    accessibilityLabel={`View ${assetTitles[assetId] ?? 'asset'} to enroll in DRIP`}
                  >
                    <View style={[styles.eligibleIcon, { backgroundColor: colors.surfaceAlt }]}>
                      <Ionicons name="cube-outline" size={16} color={colors.brand} />
                    </View>
                    <Text style={[styles.eligibleName, { color: colors.textPrimary }]} numberOfLines={1}>
                      {assetTitles[assetId] ?? 'Asset'}
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                  </Pressable>
                ))}
                <Text style={[styles.eligibleNote, { color: colors.textMuted }]}>
                  Tap an asset to view details and enable DRIP from its distribution card.
                </Text>
              </View>
            )}
          </View>

          {/* Distribution list */}
          {distributions.map((dist) => {
            // U50: Status-specific amount badge colours — settled (success),
            // pending (warning), reversed (danger), reinvested (brand/info),
            // reinvest_failed (danger), retained_cash (muted).
            const amountColor = dist.status === 'settled' ? colors.success
              : dist.status === 'reversed' ? colors.danger
              : dist.status === 'reinvested' ? colors.brand
              : dist.status === 'reinvest_failed' ? colors.danger
              : dist.status === 'retained_cash' ? colors.textSecondary
              : colors.warning;
            const amountBg = dist.status === 'settled' ? colors.successSubtle
              : dist.status === 'reversed' ? colors.dangerSubtle
              : dist.status === 'reinvested' ? (colors.brandSubtle ?? colors.surfaceAlt)
              : dist.status === 'reinvest_failed' ? colors.dangerSubtle
              : dist.status === 'retained_cash' ? colors.surfaceAlt
              : colors.warningSubtle;
            return (
            <View key={dist.id}>
              <View style={[styles.distCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.distHeader}>
                  <View style={[styles.distIcon, { backgroundColor: colors.surfaceAlt }]}>
                    <Ionicons name="cash-outline" size={18} color={amountColor} />
                  </View>
                  <View style={styles.distHeaderText}>
                    <Text style={[styles.distType, { color: colors.textPrimary }]}>
                      {dist.distributionType === 'revenue_share' ? 'Revenue share' :
                       dist.distributionType === 'dividend' ? 'Dividend' :
                       dist.distributionType.charAt(0).toUpperCase() + dist.distributionType.slice(1).replace(/_/g, ' ')}
                    </Text>
                    <Text style={[styles.distDate, { color: colors.textMuted }]}>
                      {formatDate(dist.settledAt ?? dist.createdAt)}
                    </Text>
                  </View>
                  <View style={[styles.amountBadge, { backgroundColor: amountBg }]}>
                    <Text style={[styles.amountText, { color: amountColor }]}>
                      {dist.status === 'reversed' ? '-' : dist.status === 'reinvested' || dist.status === 'retained_cash' ? '' : '+'}{formatDistributionAmount(dist.amountGbpMinor)}
                    </Text>
                  </View>
                </View>
                <View style={[styles.distDetails, { borderTopColor: colors.borderSubtle }]}>
                  <View style={styles.detailRow}>
                    <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Units at record</Text>
                    <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{dist.unitsAtRecord}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Per unit</Text>
                    <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{formatPerUnit(dist.perUnitGbpMinor)}</Text>
                  </View>
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
                </View>
              </View>
            </View>
            );
          })}

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
  summaryCard: {
    borderRadius: Radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Space.lg,
    alignItems: 'center',
    gap: Space.xs },
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
  distCard: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden' },
  distHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    padding: Space.md },
  distIcon: {
    width: Control.chrome,
    height: Control.chrome,
    borderRadius: Radius.md,
    justifyContent: 'center',
    alignItems: 'center' },
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
  amountBadge: {
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs + 2,
    borderRadius: Radius.md },
  amountText: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    fontVariant: ['tabular-nums'],
    letterSpacing: TypographyV2.bodyStrong.letterSpacing },
  distDetails: {
    padding: Space.md,
    gap: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth },
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
  dripCard: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Space.md,
    gap: Space.sm },
  dripHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.md },
  dripIcon: {
    width: Space.xl + 8,
    height: Space.xl + 8,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center' },
  dripHeaderText: {
    flex: 1 },
  dripTitle: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    letterSpacing: TypographyV2.body.letterSpacing },
  dripBody: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    marginTop: Space.xs - 2,
    lineHeight: TypographyV2.meta.lineHeight },
  dripAssetList: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Space.sm,
    gap: Space.sm + 2 },
  dripAssetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between' },
  dripAssetInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    flex: 1 },
  dripAssetDot: {
    width: Space.sm,
    height: Space.sm,
    borderRadius: Radius.sm },
  dripAssetName: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    flex: 1 },
  dripEnrolledBadge: {
    borderRadius: Radius.full,
    paddingHorizontal: Space.xs + 2,
    paddingVertical: Space.xs - 2 },
  dripEnrolledText: {
    fontSize: TypographyV2.meta.size - 1,
    fontFamily: TypographyV2.meta.fontFamily },
  dripEmptyWrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.xs,
    paddingTop: Space.xs },
  dripEmpty: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    lineHeight: TypographyV2.meta.lineHeight,
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
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Space.sm,
    gap: Space.sm },
  dripErrorRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.xs },
  dripErrorText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    lineHeight: TypographyV2.meta.lineHeight,
    flex: 1 },
  dripRetryBtn: {
    alignSelf: 'flex-start',
    paddingVertical: Space.xs,
    paddingHorizontal: Space.md,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth },
  dripRetryText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing },
  // U55: Per-asset error/unknown indicators
  dripAssetError: {
    fontSize: TypographyV2.meta.size - 1,
    fontFamily: TypographyV2.meta.fontFamily,
    marginTop: Space.xs - 2,
    paddingLeft: Space.sm + Space.sm + Space.xs },
  dripAssetUnknown: {
    fontSize: TypographyV2.meta.size - 1,
    fontFamily: TypographyV2.meta.fontFamily,
    marginTop: Space.xs - 2,
    paddingLeft: Space.sm + Space.sm + Space.xs },
  // U54: Eligible holdings CTA
  dripEnrollCta: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Space.sm,
    gap: Space.sm },
  eligibleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
    paddingHorizontal: Space.sm },
  eligibleIcon: {
    width: Space.xl,
    height: Space.xl,
    borderRadius: Radius.md,
    justifyContent: 'center',
    alignItems: 'center' },
  eligibleName: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
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
