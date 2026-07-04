import React from 'react';
import { View, Text, StyleSheet, StatusBar, RefreshControl } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { useAppTheme } from '../theme/ThemeContext';
import { Colors } from '../constants/colors';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { EmptyState } from '../components/EmptyState';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { Motion } from '../constants/motion';
import { useToast } from '../context/ToastContext';
import { Space, Radius, Typography, Type } from '../theme/designTokens';
import { Meta, BodyEmphasis, Body } from '../components/ui/Text';
import { FlagshipEmptyGraphic } from '../components/flagship';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { CoOwnDiscoveryCard } from '../components/coown';
import { listCoOwnAssets, fetchCoOwnHoldings } from '../services/marketApi';
import { parseApiError } from '../lib/apiClient';

type NavT = StackNavigationProp<RootStackParamList>;

export default function PortfolioScreen() {
  const navigation = useNavigation<NavT>();
  const { isDark } = useAppTheme();
  const currentUser = useStore((state) => state.currentUser);
  const { formatFromFiat } = useFormattedPrice();
  const { show } = useToast();
  const reducedMotionEnabled = useReducedMotion();

  const [holdings, setHoldings] = React.useState<any[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isError, setIsError] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);

  const loadPortfolio = React.useCallback(async () => {
    if (!currentUser?.id) { setIsLoading(false); return; }
    setIsLoading(true);
    setIsError(false);

    try {
      const [assets, userHoldings] = await Promise.all([
        listCoOwnAssets({ limit: 120 }),
        fetchCoOwnHoldings(currentUser.id).catch(() => []),
      ]);
      const holdingMap = new Map<string, { units: number; avgEntry: number; realized: number }>();
      for (const h of userHoldings) {
        holdingMap.set(h.assetId, { units: h.unitsOwned, avgEntry: h.avgEntryPriceGbp, realized: h.realizedPnlGbp });
      }
      const merged = assets
        .filter((a) => (holdingMap.get(a.id)?.units ?? 0) > 0)
        .map((a) => {
          const h = holdingMap.get(a.id);
          return {
            id: a.id,
            title: a.title,
            image: a.imageUrl ?? '',
            totalUnits: a.totalUnits,
            availableUnits: a.availableUnits,
            unitPriceGBP: a.unitPriceGbp,
            unitPriceStable: a.unitPriceStable,
            settlementMode: a.settlementMode,
            issuerId: a.issuerId,
            marketMovePct24h: a.marketMovePct24h,
            holders: a.holders,
            volume24hGBP: a.volume24hGbp,
            isOpen: a.isOpen,
            yourUnits: h?.units ?? 0,
            avgEntryPriceGBP: h?.avgEntry,
            realizedProfitGBP: h?.realized,
          };
        });
      setHoldings(merged);
    } catch (err) {
      const parsed = parseApiError(err, 'Unable to load portfolio');
      show(parsed.message, 'error');
      setIsError(true);
    } finally {
      setIsLoading(false);
    }
  }, [currentUser?.id, show]);

  React.useEffect(() => { void loadPortfolio(); }, [loadPortfolio]);

  const handleRefresh = React.useCallback(async () => {
    setRefreshing(true);
    await loadPortfolio();
    setRefreshing(false);
  }, [loadPortfolio]);

  const totalValue = React.useMemo(
    () => holdings.reduce((sum, asset) => sum + asset.yourUnits * asset.unitPriceGBP, 0),
    [holdings]
  );

  const unrealized = React.useMemo(() => {
    return holdings.reduce((sum, asset) => {
      const avg = asset.avgEntryPriceGBP ?? asset.unitPriceGBP;
      return sum + (asset.unitPriceGBP - avg) * asset.yourUnits;
    }, 0);
  }, [holdings]);

  const realized = React.useMemo(
    () => holdings.reduce((sum, asset) => sum + (asset.realizedProfitGBP ?? 0), 0),
    [holdings]
  );

  const totalUnits = React.useMemo(
    () => holdings.reduce((sum, asset) => sum + asset.yourUnits, 0),
    [holdings]
  );

  const portfolioBars = React.useMemo(() => {
    if (holdings.length === 0 || totalValue <= 0) return [];
    return holdings.map((asset) => ({
      id: asset.id,
      ratio: (asset.yourUnits * asset.unitPriceGBP) / totalValue,
      title: asset.title,
    }));
  }, [holdings, totalValue]);

  const renderHolding = ({ item, index }: { item: any; index: number }) => {
    return (
      <Reanimated.View
        entering={
          reducedMotionEnabled
            ? undefined
            : FadeInDown
                .duration(Motion.list.enterDuration)
                .delay(Math.min(index, Motion.list.maxStaggerItems) * Motion.list.staggerStep)
        }
        style={styles.holdingCardWrap}
      >
        <CoOwnDiscoveryCard
          imageUri={item.image}
          title={item.title}
          unitPrice={formatFromFiat(item.unitPriceGBP, 'GBP')}
          availableUnits={item.availableUnits}
          totalUnits={item.totalUnits}
          status={item.isOpen ? (item.availableUnits > 0 ? 'open' : 'closed') : 'paused'}
          onPress={() => navigation.navigate('AssetDetail', { assetId: item.id })}
          index={index}
        />
      </Reanimated.View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={Colors.background} />

      {/* Editorial header */}
      <View style={styles.header}>
        <AnimatedPressable
          onPress={() => navigation.goBack()}
          style={styles.headerBackBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </AnimatedPressable>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle} numberOfLines={1}>Portfolio</Text>
          <Text style={styles.headerContext} numberOfLines={1}>Your Co-Own positions</Text>
        </View>
        <AnimatedPressable
          onPress={() => navigation.navigate('CoOwnOrderHistory')}
          style={styles.headerBackBtn}
          accessibilityRole="button"
          accessibilityLabel="Order history"
        >
          <Ionicons name="receipt-outline" size={22} color={Colors.textPrimary} />
        </AnimatedPressable>
      </View>

      <FlashList
        data={holdings}
        keyExtractor={(item) => item.id}
        numColumns={2}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.textSecondary}
          />
        }
        ListHeaderComponent={
          <View>
            {/* Portfolio summary card */}
            <View style={styles.summaryCard}>
              <Meta style={styles.summaryLabel}>PORTFOLIO VALUE</Meta>
              <Text style={styles.summaryValue}>
                {formatFromFiat(totalValue, 'GBP', { displayMode: 'fiat' })}
              </Text>
              <View style={styles.summaryStats}>
                <View style={styles.summaryStat}>
                  <Meta style={styles.summaryStatLabel}>Units</Meta>
                  <BodyEmphasis style={styles.summaryStatValue}>{totalUnits}</BodyEmphasis>
                </View>
                <View style={styles.summaryStatDivider} />
                <View style={styles.summaryStat}>
                  <Meta style={styles.summaryStatLabel}>Unrealized</Meta>
                  <BodyEmphasis style={[styles.summaryStatValue, unrealized >= 0 ? styles.positive : styles.negative]}>
                    {unrealized >= 0 ? '+' : ''}{formatFromFiat(Math.abs(unrealized), 'GBP', { displayMode: 'fiat' })}
                  </BodyEmphasis>
                </View>
                <View style={styles.summaryStatDivider} />
                <View style={styles.summaryStat}>
                  <Meta style={styles.summaryStatLabel}>Realized</Meta>
                  <BodyEmphasis style={[styles.summaryStatValue, realized >= 0 ? styles.positive : styles.negative]}>
                    {realized >= 0 ? '+' : ''}{formatFromFiat(Math.abs(realized), 'GBP', { displayMode: 'fiat' })}
                  </BodyEmphasis>
                </View>
              </View>
            </View>

            {/* Allocation */}
            {portfolioBars.length > 0 && (
              <View style={styles.allocationCard}>
                <Meta style={styles.allocationLabel}>ALLOCATION</Meta>
                <View style={styles.barsContainer}>
                  {portfolioBars.map((bar) => (
                    <View key={bar.id} style={styles.barItem}>
                      <View style={styles.barTrack}>
                        <View style={[styles.barFill, { width: `${bar.ratio * 100}%` }]} />
                      </View>
                      <Meta style={styles.barLabel} numberOfLines={1}>{bar.title}</Meta>
                      <Meta style={styles.barPct}>{(bar.ratio * 100).toFixed(1)}%</Meta>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Section header */}
            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>Holdings</Text>
              <AnimatedPressable
                style={styles.sectionLinkWrap}
                onPress={() => navigation.navigate('AssetLeaderboard')}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Open asset leaderboards"
              >
                <Meta style={styles.sectionLink}>Leaderboards</Meta>
              </AnimatedPressable>
            </View>
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.loadingWrap}>
              <View style={styles.skeletonSummary} />
              <View style={styles.skeletonRow}>
                <View style={styles.skeletonCard} />
                <View style={styles.skeletonCard} />
              </View>
            </View>
          ) : isError ? (
            <EmptyState
              graphic={<FlagshipEmptyGraphic variant="bag" size={120} />}
              title="Unable to load"
              subtitle="Pull down to retry, or check your connection."
            />
          ) : (
            <EmptyState
              graphic={<FlagshipEmptyGraphic variant="bag" size={120} />}
              title="No holdings"
              subtitle="Your co-own portfolio will appear here once you purchase units."
              ctaLabel="Browse Assets"
              onCtaPress={() => navigation.navigate('CoOwnHub')}
            />
          )
        }
        renderItem={renderHolding}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    gap: Space.xs,
  },
  headerBackBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    letterSpacing: -0.6,
  },
  headerContext: {
    fontSize: 13,
    fontFamily: Typography.family.regular,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  // Summary card
  summaryCard: {
    marginHorizontal: Space.md,
    marginBottom: Space.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Space.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  summaryLabel: {
    color: Colors.textMuted,
    marginBottom: Space.xs,
  },
  summaryValue: {
    fontSize: 32,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    letterSpacing: -0.8,
    marginBottom: Space.md,
  },
  summaryStats: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryStat: {
    flex: 1,
    gap: 2,
  },
  summaryStatDivider: {
    width: 1,
    height: 32,
    backgroundColor: Colors.border,
    marginHorizontal: Space.sm,
  },
  summaryStatLabel: {
    color: Colors.textMuted,
  },
  summaryStatValue: {
    fontSize: 15,
  },
  positive: {
    color: Colors.success,
  },
  negative: {
    color: Colors.danger,
  },
  // Allocation
  allocationCard: {
    marginHorizontal: Space.md,
    marginBottom: Space.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Space.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  allocationLabel: {
    color: Colors.textMuted,
    marginBottom: Space.sm,
  },
  barsContainer: {
    gap: Space.sm,
  },
  barItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  barTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.surfaceAlt,
  },
  barFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.brand,
  },
  barLabel: {
    width: 80,
  },
  barPct: {
    width: 40,
    textAlign: 'right',
  },
  // Section
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    marginBottom: Space.sm,
    marginTop: Space.xs,
  },
  sectionTitle: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    letterSpacing: -0.3,
  },
  sectionLinkWrap: {
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  sectionLink: {
    color: Colors.brand,
  },
  // List
  listContent: {
    paddingBottom: Space.xl,
  },
  holdingCardWrap: {
    flex: 1,
    paddingHorizontal: Space.sm / 2,
    marginBottom: Space.sm,
  },
  // Loading
  loadingWrap: {
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
  },
  skeletonSummary: {
    width: '100%',
    height: 140,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    marginBottom: Space.md,
  },
  skeletonRow: {
    flexDirection: 'row',
    gap: Space.sm,
  },
  skeletonCard: {
    flex: 1,
    height: 280,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
  },
});
