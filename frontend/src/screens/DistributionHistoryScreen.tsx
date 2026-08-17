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
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { useAppTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { Space, Radius, Type, Typography, Control } from '../theme/designTokens';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { haptics } from '../utils/haptics';
import {
  CoOwnStateCanvas,
} from '../components/coown';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { CoOwnActivitySkeleton } from '../components/coown/CoOwnSkeletons';
import { fetchCoOwnDistributions, fetchDripEnrollments, updateDripEnrollment, type CoOwnDistribution } from '../services/marketApi';
import { formatCoOwnIze } from '../utils/currency';
import { useToast } from '../context/ToastContext';
import { Switch } from 'react-native';
import { AppButton } from '../components/ui/AppButton';

type RouteT = RouteProp<RootStackParamList, 'DistributionHistory'>;
type NavT = NativeStackNavigationProp<RootStackParamList>;

function formatDistributionAmount(minor: number): string {
  const major = minor / 100;
  return formatCoOwnIze(major);
}

function formatPerUnit(minor: number): string {
  const major = minor / 100;
  return `£${major.toFixed(2)}/unit`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function DistributionHistoryScreen() {
  const navigation = useNavigation<NavT>();
  const route = useRoute<RouteT>();
  const { colors } = useAppTheme();
  const reducedMotionEnabled = useReducedMotion();
  const filterAssetId = route.params?.assetId;
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const [distributions, setDistributions] = React.useState<CoOwnDistribution[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // DRIP enrollment state
  const { show: showToast } = useToast();
  const [dripEnrollments, setDripEnrollments] = React.useState<Record<string, boolean>>({});
  const [dripToggling, setDripToggling] = React.useState<string | null>(null);

  const loadDistributions = React.useCallback(async () => {
    try {
      setError(null);
      const [result, dripResult] = await Promise.all([
        fetchCoOwnDistributions({ assetId: filterAssetId, limit: 100 }),
        fetchDripEnrollments().catch(() => []),
      ]);
      setDistributions(result.items);
      const dripMap: Record<string, boolean> = {};
      dripResult.forEach((e) => { dripMap[e.assetId] = e.enrolled; });
      setDripEnrollments(dripMap);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load distributions');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filterAssetId]);

  React.useEffect(() => {
    void loadDistributions();
  }, [loadDistributions]);

  const handleBack = React.useCallback(() => {
    if (navigation.canGoBack()) { navigation.goBack(); return; }
    navigation.navigate('Portfolio');
  }, [navigation]);

  const handleRefresh = React.useCallback(() => {
    haptics.tap();
    setRefreshing(true);
    void loadDistributions();
  }, [loadDistributions]);

  const handleToggleDrip = React.useCallback(async (assetId: string, enrolled: boolean) => {
    setDripToggling(assetId);
    // Optimistic update
    setDripEnrollments((prev) => ({ ...prev, [assetId]: enrolled }));
    try {
      await updateDripEnrollment(assetId, enrolled);
      haptics.success();
      showToast(enrolled ? 'DRIP enabled — distributions will be reinvested' : 'DRIP disabled — distributions will be paid as cash', 'success');
    } catch {
      // Revert
      setDripEnrollments((prev) => ({ ...prev, [assetId]: !enrolled }));
      showToast('Failed to update DRIP setting', 'error');
    } finally {
      setDripToggling(null);
    }
  }, [showToast]);

  const totalReceived = distributions.reduce((sum, d) => sum + d.amountGbpMinor, 0);

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
          subtitle="When this position pays a distribution, it will appear here with the amount, record date, and payment date."
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
          <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)}>
            <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Total received</Text>
              <Text style={[styles.summaryValue, { color: colors.success }]}>
                {formatDistributionAmount(totalReceived)}
              </Text>
              <Text style={[styles.summaryCount, { color: colors.textSecondary }]}>
                {distributions.length} distribution{distributions.length !== 1 ? 's' : ''}
              </Text>
            </View>
          </Reanimated.View>

          {/* DRIP enrollment card — flagship treatment with count badge and status indicators */}
          <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)}>
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
              {/* Per-asset DRIP toggles with status indicators */}
              {Object.keys(dripEnrollments).length > 0 ? (
                <View style={[styles.dripAssetList, { borderTopColor: colors.borderSubtle }]}>
                  {Object.entries(dripEnrollments).map(([assetId, enrolled]) => (
                    <View key={assetId} style={styles.dripAssetRow}>
                      <View style={styles.dripAssetInfo}>
                        <View style={[styles.dripAssetDot, { backgroundColor: enrolled ? colors.success : colors.textMuted }]} />
                        <Text style={[styles.dripAssetName, { color: colors.textPrimary }]} numberOfLines={1}>
                          {assetId.slice(0, 20)}…
                        </Text>
                        {enrolled && (
                          <View style={[styles.dripEnrolledBadge, { backgroundColor: colors.success + '18' }]}>
                            <Text style={[styles.dripEnrolledText, { color: colors.success }]}>Active</Text>
                          </View>
                        )}
                      </View>
                      <Switch
                        value={enrolled}
                        onValueChange={(v) => void handleToggleDrip(assetId, v)}
                        disabled={dripToggling === assetId}
                        trackColor={{ false: colors.surfaceAlt, true: colors.brand }}
                        thumbColor="#fff"
                        accessibilityRole="switch"
                        accessibilityLabel={`DRIP for ${assetId}`}
                      />
                    </View>
                  ))}
                </View>
              ) : (
                <View style={styles.dripEmptyWrap}>
                  <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
                  <Text style={[styles.dripEmpty, { color: colors.textMuted }]}>
                    Enroll from an asset's distribution card to automatically reinvest future payments.
                  </Text>
                </View>
              )}
            </View>
          </Reanimated.View>

          {/* Distribution list */}
          {distributions.map((dist, idx) => (
            <Reanimated.View
              key={dist.id}
              entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(idx * 50)}
            >
              <View style={[styles.distCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.distHeader}>
                  <View style={[styles.distIcon, { backgroundColor: colors.surfaceAlt }]}>
                    <Ionicons name="cash-outline" size={18} color={colors.success} />
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
                  <View style={[styles.amountBadge, { backgroundColor: colors.success + '15' }]}>
                    <Text style={[styles.amountText, { color: colors.success }]}>
                      +{formatDistributionAmount(dist.amountGbpMinor)}
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
                    <Text style={[styles.detailValue, { color: dist.status === 'settled' ? colors.success : colors.warning }]}>
                      {dist.status.charAt(0).toUpperCase() + dist.status.slice(1)}
                    </Text>
                  </View>
                </View>
              </View>
            </Reanimated.View>
          ))}
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
    paddingBottom: Space.xxl,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryCard: {
    borderRadius: Radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Space.lg,
    alignItems: 'center',
    gap: Space.xs,
  },
  summaryLabel: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.caption.letterSpacing,
  },
  summaryValue: {
    fontSize: Type.priceLarge.size,
    fontFamily: Typography.family.bold,
    letterSpacing: Type.priceLarge.letterSpacing,
  },
  summaryCount: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.meta.letterSpacing,
  },
  distCard: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  distHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    padding: Space.md,
  },
  distIcon: {
    width: Control.chrome,
    height: Control.chrome,
    borderRadius: Radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  distHeaderText: {
    flex: 1,
  },
  distType: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.body.letterSpacing,
  },
  distDate: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    marginTop: Space.xs - 2,
    letterSpacing: Type.caption.letterSpacing,
  },
  amountBadge: {
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs + 2,
    borderRadius: Radius.md,
  },
  amountText: {
    fontSize: Type.bodyStrong.size,
    fontFamily: Typography.family.bold,
    letterSpacing: Type.bodyStrong.letterSpacing,
  },
  distDetails: {
    padding: Space.md,
    gap: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.caption.letterSpacing,
  },
  detailValue: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
    letterSpacing: Type.caption.letterSpacing,
  },
  dripCard: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Space.md,
    gap: Space.sm,
  },
  dripHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.md,
  },
  dripIcon: {
    width: Space.xl + 8,
    height: Space.xl + 8,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dripHeaderText: {
    flex: 1,
  },
  dripTitle: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.body.letterSpacing,
  },
  dripBody: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    marginTop: Space.xs - 2,
    lineHeight: Type.captionElevated.lineHeight,
  },
  dripAssetList: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Space.sm,
    gap: Space.sm + 2,
  },
  dripAssetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dripAssetInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    flex: 1,
  },
  dripAssetDot: {
    width: Space.sm,
    height: Space.sm,
    borderRadius: Radius.sm,
  },
  dripAssetName: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
    flex: 1,
  },
  dripEnrolledBadge: {
    borderRadius: Radius.full,
    paddingHorizontal: Space.xs + 2,
    paddingVertical: Space.xs - 2,
  },
  dripEnrolledText: {
    fontSize: Type.meta.size - 1,
    fontFamily: Typography.family.semibold,
  },
  dripEmptyWrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.xs,
    paddingTop: Space.xs,
  },
  dripEmpty: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.regular,
    lineHeight: Type.caption.lineHeight,
    flex: 1,
  },
});
}
