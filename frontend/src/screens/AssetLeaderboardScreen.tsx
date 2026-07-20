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
import { haptics } from '../utils/haptics';
import {
  CoOwnMarketHeader,
  CoOwnLeaderboardSkeleton,
  CoOwnStateCanvas,
  CoOwnOfflineBanner,
  CoOwnReconciliationBanner,
} from '../components/coown';
import { useConnectivity } from '../hooks/useConnectivity';

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

  const loadLeaderboard = React.useCallback(() => {
    let cancelled = false;
    setIsLoading(true);
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
        })));
      })
      .catch((err) => {
        if (cancelled) return;
        const parsed = parseApiError(err, 'Unable to load leaderboard');
        show(parsed.message, 'error');
        setIsError(true);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [show]);

  React.useEffect(() => {
    const cleanup = loadLeaderboard();
    return cleanup;
  }, [loadLeaderboard]);

  const handleRefresh = React.useCallback(() => {
    setRefreshing(true);
    loadLeaderboard();
    setTimeout(() => setRefreshing(false), 800);
  }, [loadLeaderboard]);

  const handleBack = React.useCallback(() => {
    if (navigation.canGoBack()) { navigation.goBack(); return; }
    navigation.navigate('Portfolio');
  }, [navigation]);

  // ── Rankings (no speculative price-move metrics) ──
  // Top by allocation: most allocated = most popular by real ownership
  const topAllocated = React.useMemo(
    () => [...assets]
      .map((a) => ({
        ...a,
        allocatedPct: a.totalUnits > 0 ? (a.totalUnits - a.availableUnits) / a.totalUnits : 0,
      }))
      .sort((a, b) => b.allocatedPct - a.allocatedPct)
      .slice(0, 5),
    [assets]
  );

  // Top by market value: totalUnits * unitPrice
  const topMarketValue = React.useMemo(
    () => [...assets]
      .map((a) => ({ ...a, marketValue: a.totalUnits * a.unitPriceGBP }))
      .sort((a, b) => b.marketValue - a.marketValue)
      .slice(0, 5),
    [assets]
  );

  // Top by holders: most co-owners
  const topHolders = React.useMemo(
    () => [...assets].sort((a, b) => b.holders - a.holders).slice(0, 5),
    [assets]
  );

  // Phase 2: Newest listings — most recently created
  const newestListings = React.useMemo(
    () => [...assets]
      .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
      .slice(0, 5),
    [assets]
  );

  const renderList = (
    title: string,
    icon: React.ComponentProps<typeof Ionicons>['name'],
    data: Array<LeaderboardAsset & { allocatedPct?: number; marketValue?: number }>,
    metric: (asset: any) => string,
    sectionIndex: number
  ) => (
    <Reanimated.View
      entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(sectionIndex * 60)}
    >
      <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.sectionHeader}>
          <Ionicons name={icon} size={16} color={colors.brand} />
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{title}</Text>
        </View>

        {data.map((asset, idx) => (
          <AnimatedPressable
            key={`${title}_${asset.id}`}
            style={[styles.row, { borderColor: colors.border }]}
            onPress={() => { haptics.tap(); navigation.navigate('AssetDetail', { assetId: asset.id }); }}
            scaleValue={0.985}
            hapticFeedback="light"
            accessibilityRole="button"
            accessibilityLabel={`Rank ${idx + 1}, ${asset.title}, ${metric(asset)}`}
          >
            <Text style={[styles.rank, { color: colors.textMuted }]}>{idx + 1}</Text>
            <CachedImage uri={asset.image} style={styles.thumb} containerStyle={styles.thumbContainer} contentFit="cover" />
            <View style={styles.rowBody}>
              <Text style={[styles.rowTitle, { color: colors.textPrimary }]} numberOfLines={1}>{asset.title}</Text>
              <Text style={[styles.rowSub, { color: colors.textSecondary }]}>{formatFromFiat(asset.unitPriceGBP, 'GBP')}</Text>
            </View>
            <Text style={[styles.metric, { color: colors.textPrimary }]}>{metric(asset)}</Text>
          </AnimatedPressable>
        ))}
      </View>
    </Reanimated.View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <CoOwnMarketHeader
          title="Leaderboards"
          subtitle="Top Co-Own items"
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
          title="Leaderboards"
          subtitle="Market activity rankings"
          onBack={handleBack}
        />
        <CoOwnStateCanvas
          variant="error"
          actionLabel="Try again"
          onAction={loadLeaderboard}
        />
      </SafeAreaView>
    );
  }

  if (assets.length === 0) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <CoOwnMarketHeader
          title="Leaderboards"
          subtitle="Top Co-Own items"
          onBack={handleBack}
        />
        <CoOwnStateCanvas
          variant="empty"
          title="No items to rank"
          subtitle="Leaderboards will appear here once Co-Own items are issued."
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
        title="Leaderboards"
        subtitle="Market activity rankings"
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
          (asset) => `${Math.round((asset.allocatedPct ?? 0) * 100)}% owned`,
          0
        )}
        {renderList(
          'Highest value',
          'cash-outline',
          topMarketValue,
          (asset) => formatFromFiat(asset.marketValue ?? 0, 'GBP', { displayMode: 'fiat' }),
          1
        )}
        {renderList(
          'Most co-owners',
          'people-outline',
          topHolders,
          (asset) => `${asset.holders} holders`,
          2
        )}
        {renderList(
          'Newest listings',
          'time-outline',
          newestListings,
          (asset) => asset.createdAt
            ? new Date(asset.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
            : '—',
          3
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
    paddingTop: Space.md,
  },
  sectionCard: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Space.md,
    marginBottom: Space.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    marginBottom: Space.sm,
  },
  sectionTitle: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: -0.3,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingVertical: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rank: {
    width: 24,
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.bold,
    textAlign: 'center',
  },
  thumbContainer: {
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  thumb: {
    width: 44,
    height: 44,
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: -0.2,
  },
  rowSub: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
  },
  metric: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.bold,
    letterSpacing: -0.2,
  },
});
