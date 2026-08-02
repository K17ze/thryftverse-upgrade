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
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { useAppTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { haptics } from '../utils/haptics';
import {
  CoOwnMarketHeader,
  CoOwnStateCanvas,
} from '../components/coown';
import { fetchCoOwnDistributions, type CoOwnDistribution } from '../services/marketApi';
import { formatCoOwnIze } from '../utils/currency';

type RouteT = RouteProp<RootStackParamList, 'DistributionHistory'>;
type NavT = StackNavigationProp<RootStackParamList>;

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
  const { colors, isDark } = useAppTheme();
  const reducedMotionEnabled = useReducedMotion();
  const filterAssetId = route.params?.assetId;
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const [distributions, setDistributions] = React.useState<CoOwnDistribution[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const loadDistributions = React.useCallback(async () => {
    try {
      setError(null);
      const result = await fetchCoOwnDistributions({
        assetId: filterAssetId,
        limit: 100,
      });
      setDistributions(result.items);
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

  const totalReceived = distributions.reduce((sum, d) => sum + d.amountGbpMinor, 0);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      <CoOwnMarketHeader
        title="Distributions"
        subtitle={filterAssetId ? 'For this position' : 'All positions'}
        onBack={handleBack}
      />

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.brand} />
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
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: { flex: 1 },
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
    width: 36,
    height: 36,
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
    marginTop: 2,
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
});
}
