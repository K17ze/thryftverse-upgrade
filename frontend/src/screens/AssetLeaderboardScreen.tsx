import React from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { useAppTheme } from '../theme/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { CachedImage } from '../components/CachedImage';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { listCoOwnAssets } from '../services/marketApi';
import { parseApiError } from '../lib/apiClient';
import { useToast } from '../context/ToastContext';
import {
  CoOwnMarketHeader,
  CoOwnLeaderboardSkeleton,
  CoOwnStateCanvas,
  CoOwnOfflineBanner,
  CoOwnReconciliationBanner,
} from '../components/coown';
import { useConnectivity } from '../hooks/useConnectivity';
import { formatCoOwnIze } from '../utils/currency';

type NavT = StackNavigationProp<RootStackParamList>;

interface LeaderboardAsset {
  id: string;
  title: string;
  image: string;
  totalUnits: number;
  availableUnits: number;
  unitPriceGBP: number;
  holders: number;
  isOpen: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function AssetLeaderboardScreen() {
  const navigation = useNavigation<NavT>();
  const { colors, isDark } = useAppTheme();
  const { formatFromFiat } = useFormattedPrice();
  const { show } = useToast();
  const reducedMotionEnabled = useReducedMotion();
  const { isOffline } = useConnectivity();

  const [assets, setAssets] = React.useState<LeaderboardAsset[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isError, setIsError] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);

  const loadLeaderboard = React.useCallback((mode: 'initial' | 'refresh' = 'initial') => {
    let cancelled = false;
    if (mode === 'refresh') setRefreshing(true);
    else setIsLoading(true);
    setIsError(false);

    listCoOwnAssets({ limit: 120 })
      .then((items) => {
        if (cancelled) return;
        setAssets(items.map((item) => ({
          id: item.id,
          title: item.title,
          image: item.imageUrl ?? '',
          totalUnits: item.totalUnits,
          availableUnits: item.availableUnits,
          unitPriceGBP: item.unitPriceGbp,
          holders: item.holders,
          isOpen: item.isOpen,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
        })));
      })
      .catch((err) => {
        if (cancelled) return;
        const parsed = parseApiError(err, 'Unable to load leaderboard');
        show(parsed.message, 'error');
        setIsError(true);
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
          setRefreshing(false);
        }
      });

    return () => { cancelled = true; };
  }, [show]);

  React.useEffect(() => {
    const cleanup = loadLeaderboard();
    return cleanup;
  }, [loadLeaderboard]);

  const handleRefresh = React.useCallback(() => {
    loadLeaderboard('refresh');
  }, [loadLeaderboard]);

  const handleBack = React.useCallback(() => {
    if (navigation.canGoBack()) { navigation.goBack(); return; }
    navigation.navigate('Portfolio');
  }, [navigation]);

  // ── Rankings (no speculative price-move metrics) ──
  // Top by allocation: most allocated = most popular by real ownership
  const mostAvailable = React.useMemo(
    () => [...assets]
      .filter((asset) => asset.isOpen && asset.availableUnits > 0)
      .sort((a, b) => b.availableUnits - a.availableUnits)
      .slice(0, 5),
    [assets]
  );

  const topAllocated = React.useMemo(
    () => [...assets]
      .map((asset) => ({
        ...asset,
        allocatedPct: asset.totalUnits > 0
          ? (asset.totalUnits - asset.availableUnits) / asset.totalUnits
          : 0,
      }))
      .sort((a, b) => b.allocatedPct - a.allocatedPct)
      .slice(0, 5),
    [assets]
  );

  const newestListings = React.useMemo(
    () => [...assets]
      .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
      .slice(0, 5),
    [assets]
  );

  const format1ze = React.useCallback(
    (value1ze: number) => formatCoOwnIze(value1ze),
    []
  );

  const renderList = (
    title: string,
    icon: React.ComponentProps<typeof Ionicons>['name'],
    data: Array<LeaderboardAsset & { allocatedPct?: number }>,
    metric: (asset: LeaderboardAsset & { allocatedPct?: number }) => { primary: string; secondary: string },
    sectionIndex: number
  ) => data.length > 0 ? (
    <Reanimated.View
      entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(sectionIndex * 60)}
    >
      <View style={[styles.section, sectionIndex > 0 && styles.sectionSeparated, sectionIndex > 0 && { borderTopColor: colors.border }]}>
        <View style={styles.sectionHeader}>
          <View style={[styles.sectionIcon, { backgroundColor: colors.surfaceAlt }]}>
            <Ionicons name={icon} size={15} color={colors.textSecondary} />
          </View>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.25}>{title}</Text>
        </View>

        {data.map((asset, idx) => {
          const metricValue = metric(asset);
          return (
            <AnimatedPressable
              key={`${title}_${asset.id}`}
              style={[styles.row, { borderColor: colors.border }, idx === data.length - 1 && styles.lastRow]}
              onPress={() => navigation.navigate('AssetDetail', { assetId: asset.id })}
              scaleValue={0.985}
              hapticFeedback="light"
              accessibilityRole="button"
              accessibilityLabel={`${title}, rank ${idx + 1}, ${asset.title}, ${metricValue.primary}, ${metricValue.secondary}`}
            >
              <Text style={[styles.rank, { color: colors.textMuted }]} maxFontSizeMultiplier={1.2}>{idx + 1}</Text>
              <CachedImage
                uri={asset.image}
                style={styles.thumb}
                containerStyle={styles.thumbContainer}
                contentFit="cover"
                emptyLabel={asset.title}
                emptyIcon="diamond-outline"
              />
              <View style={styles.rowBody}>
                <Text style={[styles.rowTitle, { color: colors.textPrimary }]} numberOfLines={1} maxFontSizeMultiplier={1.25}>{asset.title}</Text>
                <View style={styles.priceRow}>
                  <Text style={[styles.rowPrice, { color: colors.textSecondary }]} numberOfLines={1} maxFontSizeMultiplier={1.2}>{format1ze(asset.unitPriceGBP)}</Text>
                  <Text style={[styles.rowSub, { color: colors.textMuted }]} numberOfLines={1} maxFontSizeMultiplier={1.2}>{formatFromFiat(asset.unitPriceGBP, 'GBP', { displayMode: 'fiat' })}</Text>
                </View>
              </View>
              <View style={styles.metricGroup}>
                <Text style={[styles.metric, { color: colors.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.78} maxFontSizeMultiplier={1.2}>{metricValue.primary}</Text>
                <Text style={[styles.metricLabel, { color: colors.textMuted }]} numberOfLines={1} maxFontSizeMultiplier={1.2}>{metricValue.secondary}</Text>
              </View>
            </AnimatedPressable>
          );
        })}
      </View>
    </Reanimated.View>
  ) : null;

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <CoOwnMarketHeader
          title="Market overview"
          subtitle="Issued supply and recency"
          onBack={handleBack}
        />
        <CoOwnLeaderboardSkeleton />
      </SafeAreaView>
    );
  }

  if (isError && assets.length === 0) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <CoOwnMarketHeader
          title="Market overview"
          subtitle="Issued supply and recency"
          onBack={handleBack}
        />
        <CoOwnStateCanvas
          variant="error"
          actionLabel="Try again"
          onAction={() => loadLeaderboard()}
        />
      </SafeAreaView>
    );
  }

  if (assets.length === 0) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <CoOwnMarketHeader
          title="Market overview"
          subtitle="Issued supply and recency"
          onBack={handleBack}
        />
        <CoOwnStateCanvas
          variant="empty"
          title="No market overview yet"
          subtitle="Supply and issue rankings appear after real instruments are issued."
          actionLabel="Browse items"
          onAction={() => navigation.navigate('CoOwnHub')}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      <CoOwnMarketHeader
        title="Market overview"
        subtitle="Issued supply and recency"
        onBack={handleBack}
      />

      <CoOwnOfflineBanner isOffline={isOffline} />
      <CoOwnReconciliationBanner isActive={false} />

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
        {renderList(
          'Most allocated',
          'pie-chart-outline',
          topAllocated,
          (asset) => ({ primary: `${Math.round((asset.allocatedPct ?? 0) * 100)}%`, secondary: 'units allocated' }),
          0
        )}
        {renderList(
          'Available supply',
          'layers-outline',
          mostAvailable,
          (asset) => ({ primary: `${asset.availableUnits}/${asset.totalUnits}`, secondary: 'units available' }),
          1
        )}
        {renderList(
          'New issues',
          'time-outline',
          newestListings,
          (asset) => ({
            primary: asset.createdAt
              ? new Date(asset.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
              : '—',
            secondary: 'issue date',
          }),
          2
        )}
        <View style={{ height: Space.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Space.md,
    paddingTop: Space.xs,
  },
  section: {
    paddingVertical: Space.lg,
  },
  sectionSeparated: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    marginBottom: Space.sm,
  },
  sectionIcon: {
    width: 32,
    height: 32,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: -0.3,
  },
  row: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  lastRow: {
    borderBottomWidth: 0,
  },
  rank: {
    width: 20,
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.semibold,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  thumbContainer: {
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  thumb: {
    width: 52,
    height: 52,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowTitle: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: -0.2,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Space.xs,
    minWidth: 0,
  },
  rowPrice: {
    flexShrink: 1,
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.semibold,
    fontVariant: ['tabular-nums'],
  },
  rowSub: {
    flexShrink: 1,
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.regular,
    fontVariant: ['tabular-nums'],
  },
  metricGroup: {
    maxWidth: 112,
    minWidth: 76,
    alignItems: 'flex-end',
    gap: 1,
  },
  metric: {
    fontSize: Type.bodyEmphasis.size,
    lineHeight: Type.bodyEmphasis.lineHeight,
    fontFamily: Typography.family.bold,
    letterSpacing: -0.2,
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
    maxWidth: '100%',
  },
  metricLabel: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.medium,
    textAlign: 'right',
  },
});
