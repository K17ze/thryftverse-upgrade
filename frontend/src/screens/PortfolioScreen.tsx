import React from 'react';
import { View, Text, StyleSheet, StatusBar, RefreshControl, useWindowDimensions } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { useAppTheme } from '../theme/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useToast } from '../context/ToastContext';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { haptics } from '../utils/haptics';
import {
  CoOwnMarketHeader,
  CoOwnPositionCard,
  CoOwnPositionActionSheet,
  CoOwnPortfolioSkeleton,
  CoOwnStateCanvas,
  type CoOwnPositionAction,
} from '../components/coown';
import { fetchCoOwnPortfolioPositions, type CoOwnPositionVM } from '../services/coOwnPortfolio';
import { parseApiError } from '../lib/apiClient';

type NavT = StackNavigationProp<RootStackParamList>;

export default function PortfolioScreen() {
  const navigation = useNavigation<NavT>();
  const { colors, isDark } = useAppTheme();
  const currentUser = useStore((state) => state.currentUser);
  const { formatFromFiat } = useFormattedPrice();
  const { show } = useToast();
  const reducedMotionEnabled = useReducedMotion();
  const { width: screenWidth } = useWindowDimensions();

  const [positions, setPositions] = React.useState<CoOwnPositionVM[]>([]);
  const [summary, setSummary] = React.useState({
    totalValueGbp: 0,
    totalUnits: 0,
    totalUnrealizedGbp: 0,
    totalRealizedGbp: 0,
    positionCount: 0,
  });
  const [isLoading, setIsLoading] = React.useState(true);
  const [isError, setIsError] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [actionSheetAsset, setActionSheetAsset] = React.useState<CoOwnPositionVM | null>(null);

  const loadPortfolio = React.useCallback(() => {
    if (!currentUser?.id) { setIsLoading(false); return; }
    let cancelled = false;
    setIsLoading(true);
    setIsError(false);

    fetchCoOwnPortfolioPositions(currentUser.id)
      .then((result) => {
        if (cancelled) return;
        setPositions(result.positions);
        setSummary(result.summary);
      })
      .catch((err) => {
        if (cancelled) return;
        const parsed = parseApiError(err, 'Unable to load portfolio');
        show(parsed.message, 'error');
        setIsError(true);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [currentUser?.id, show]);

  React.useEffect(() => {
    const cleanup = loadPortfolio();
    return cleanup;
  }, [loadPortfolio]);

  const handleRefresh = React.useCallback(() => {
    setRefreshing(true);
    loadPortfolio();
    setTimeout(() => setRefreshing(false), 800);
  }, [loadPortfolio]);

  const handleBack = React.useCallback(() => {
    if (navigation.canGoBack()) { navigation.goBack(); return; }
    navigation.navigate('CoOwnHub');
  }, [navigation]);

  // Allocation bars — only when real positions exist
  const allocationBars = React.useMemo(() => {
    if (positions.length === 0 || summary.totalValueGbp <= 0) return [];
    return positions.map((p) => ({
      id: p.assetId,
      ratio: (p.unitsOwned * p.unitPriceGbp) / summary.totalValueGbp,
      title: p.title,
    }));
  }, [positions, summary.totalValueGbp]);

  const formatPositionStatus = (p: CoOwnPositionVM): 'open' | 'closed' | 'paused' => {
    if (!p.isOpen) return 'closed';
    return p.availableUnits > 0 ? 'open' : 'closed';
  };

  const handlePositionPress = React.useCallback((p: CoOwnPositionVM) => {
    navigation.navigate('AssetDetail', { assetId: p.assetId });
  }, [navigation]);

  const handleBuyMore = React.useCallback((p: CoOwnPositionVM) => {
    haptics.tap();
    navigation.navigate('Trade', { assetId: p.assetId, side: 'buy' });
  }, [navigation]);

  const handleSell = React.useCallback((p: CoOwnPositionVM) => {
    haptics.tap();
    navigation.navigate('Trade', { assetId: p.assetId, side: 'sell' });
  }, [navigation]);

  const handleOpenActions = React.useCallback((p: CoOwnPositionVM) => {
    haptics.tap();
    setActionSheetAsset(p);
  }, []);

  const actionSheetActions: CoOwnPositionAction[] = React.useMemo(() => {
    if (!actionSheetAsset) return [];
    const p = actionSheetAsset;
    const actions: CoOwnPositionAction[] = [
      {
        label: 'View item details',
        icon: 'cube-outline',
        onPress: () => navigation.navigate('AssetDetail', { assetId: p.assetId }),
        variant: 'primary',
      },
      {
        label: 'Buy more units',
        icon: 'add-circle-outline',
        onPress: () => navigation.navigate('Trade', { assetId: p.assetId, side: 'buy' }),
      },
    ];
    if (p.sellableUnits > 0) {
      actions.push({
        label: 'Sell units',
        icon: 'swap-horizontal-outline',
        onPress: () => navigation.navigate('Trade', { assetId: p.assetId, side: 'sell' }),
        variant: 'secondary',
      });
    }
    actions.push({
      label: 'View order history',
      icon: 'receipt-outline',
      onPress: () => navigation.navigate('CoOwnOrderHistory'),
    });
    return actions;
  }, [actionSheetAsset, navigation]);

  const renderPosition = ({ item, index }: { item: CoOwnPositionVM; index: number }) => {
    return (
      <Reanimated.View
        entering={
          reducedMotionEnabled
            ? undefined
            : FadeInDown.duration(300).delay(Math.min(index, 8) * 40)
        }
      >
        <CoOwnPositionCard
          imageUri={item.imageUrl}
          title={item.title}
          unitsOwned={item.unitsOwned}
          totalUnits={item.totalUnits}
          ownershipPct={item.ownershipPct}
          currentValueLabel={formatFromFiat(item.currentValueGbp, 'GBP')}
          avgEntryLabel={formatFromFiat(item.avgEntryPriceGbp, 'GBP')}
          unrealizedLabel={item.unrealizedPnlGbp >= 0
            ? `+${formatFromFiat(Math.abs(item.unrealizedPnlGbp), 'GBP')}`
            : `-${formatFromFiat(Math.abs(item.unrealizedPnlGbp), 'GBP')}`
          }
          realizedLabel={item.realizedPnlGbp !== 0
            ? (item.realizedPnlGbp >= 0
              ? `+${formatFromFiat(Math.abs(item.realizedPnlGbp), 'GBP')}`
              : `-${formatFromFiat(Math.abs(item.realizedPnlGbp), 'GBP')}`)
            : undefined
          }
          status={formatPositionStatus(item)}
          sellable={item.sellableUnits > 0}
          onPress={() => handlePositionPress(item)}
          onBuyMore={() => handleBuyMore(item)}
          onSell={() => handleSell(item)}
          index={index}
        />
      </Reanimated.View>
    );
  };

  // ── Loading state ──
  if (isLoading && positions.length === 0) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <CoOwnMarketHeader
          title="Portfolio"
          subtitle="Your Co-Own positions"
          onBack={handleBack}
          actions={[
            { icon: 'receipt-outline', label: 'Activity', onPress: () => navigation.navigate('CoOwnOrderHistory') },
          ]}
        />
        <CoOwnPortfolioSkeleton />
      </SafeAreaView>
    );
  }

  // ── Error state ──
  if (isError && positions.length === 0) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <CoOwnMarketHeader
          title="Portfolio"
          subtitle="Your Co-Own positions"
          onBack={handleBack}
          actions={[
            { icon: 'receipt-outline', label: 'Activity', onPress: () => navigation.navigate('CoOwnOrderHistory') },
          ]}
        />
        <CoOwnStateCanvas
          variant="error"
          actionLabel="Try again"
          onAction={loadPortfolio}
        />
      </SafeAreaView>
    );
  }

  // ── Empty state ──
  if (positions.length === 0) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <CoOwnMarketHeader
          title="Portfolio"
          subtitle="Your Co-Own positions"
          onBack={handleBack}
          actions={[
            { icon: 'receipt-outline', label: 'Activity', onPress: () => navigation.navigate('CoOwnOrderHistory') },
          ]}
        />
        <CoOwnStateCanvas
          variant="empty"
          title="No positions yet"
          subtitle="Your Co-Own portfolio will appear here once you purchase units."
          actionLabel="Browse items"
          onAction={() => { haptics.tap(); navigation.navigate('CoOwnHub'); }}
          emptyGraphicVariant="bag"
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      <CoOwnMarketHeader
        title="Portfolio"
        subtitle="Your Co-Own positions"
        onBack={handleBack}
        actions={[
          { icon: 'receipt-outline', label: 'Activity', onPress: () => navigation.navigate('CoOwnOrderHistory') },
        ]}
      />

      <FlashList
        data={positions}
        keyExtractor={(item) => item.assetId}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.textSecondary}
          />
        }
        ListHeaderComponent={
          <View>
            {/* Portfolio summary — ownership surface, not a finance dashboard */}
            <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Portfolio value</Text>
              <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>
                {formatFromFiat(summary.totalValueGbp, 'GBP')}
              </Text>

              <View style={[styles.summaryStats, { borderColor: colors.border }]}>
                <View style={styles.summaryStat}>
                  <Text style={[styles.summaryStatLabel, { color: colors.textMuted }]}>Units</Text>
                  <Text style={[styles.summaryStatValue, { color: colors.textPrimary }]}>{summary.totalUnits}</Text>
                </View>
                <View style={[styles.summaryStat, { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.border }]}>
                  <Text style={[styles.summaryStatLabel, { color: colors.textMuted }]}>Unrealised</Text>
                  <Text style={[
                    styles.summaryStatValue,
                    { color: summary.totalUnrealizedGbp >= 0 ? colors.success : colors.danger },
                  ]}>
                    {summary.totalUnrealizedGbp >= 0 ? '+' : '-'}{formatFromFiat(Math.abs(summary.totalUnrealizedGbp), 'GBP')}
                  </Text>
                </View>
                <View style={[styles.summaryStat, { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.border }]}>
                  <Text style={[styles.summaryStatLabel, { color: colors.textMuted }]}>Realised</Text>
                  <Text style={[
                    styles.summaryStatValue,
                    { color: summary.totalRealizedGbp >= 0 ? colors.success : colors.danger },
                  ]}>
                    {summary.totalRealizedGbp >= 0 ? '+' : '-'}{formatFromFiat(Math.abs(summary.totalRealizedGbp), 'GBP')}
                  </Text>
                </View>
              </View>
            </View>

            {/* Allocation bars — only when real */}
            {allocationBars.length > 0 && (
              <View style={[styles.allocationCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.allocationTitle, { color: colors.textPrimary }]}>Allocation</Text>
                <View style={styles.barsContainer}>
                  {allocationBars.map((bar) => (
                    <View key={bar.id} style={styles.barItem}>
                      <View style={styles.barHeader}>
                        <Text style={[styles.barLabel, { color: colors.textSecondary }]} numberOfLines={1}>{bar.title}</Text>
                        <Text style={[styles.barPct, { color: colors.textMuted }]}>{(bar.ratio * 100).toFixed(1)}%</Text>
                      </View>
                      <View style={[styles.barTrack, { backgroundColor: colors.surfaceAlt }]}>
                        <View style={[styles.barFill, { width: `${bar.ratio * 100}%`, backgroundColor: colors.brand }]} />
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Section header */}
            <View style={styles.sectionRow}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Your positions</Text>
              <AnimatedPressable
                onPress={() => { haptics.tap(); navigation.navigate('AssetLeaderboard'); }}
                accessibilityRole="button"
                accessibilityLabel="Open asset leaderboards"
                scaleValue={0.96}
                hapticFeedback="light"
              >
                <Text style={[styles.sectionLink, { color: colors.textSecondary }]}>Leaderboards</Text>
              </AnimatedPressable>
            </View>
          </View>
        }
        renderItem={renderPosition}
        ListFooterComponent={<View style={{ height: Space.xxl }} />}
        estimatedItemSize={220}
      />

      {/* Position action sheet */}
      <CoOwnPositionActionSheet
        visible={actionSheetAsset != null}
        onClose={() => setActionSheetAsset(null)}
        imageUri={actionSheetAsset?.imageUrl ?? null}
        title={actionSheetAsset?.title ?? ''}
        unitsOwned={actionSheetAsset?.unitsOwned ?? 0}
        ownershipPct={actionSheetAsset?.ownershipPct ?? 0}
        currentValueLabel={actionSheetAsset ? formatFromFiat(actionSheetAsset.currentValueGbp, 'GBP') : ''}
        statusLabel={actionSheetAsset ? (actionSheetAsset.isOpen ? 'Active' : 'Closed') : ''}
        actions={actionSheetActions}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: Space.md,
  },
  summaryCard: {
    borderRadius: Radius.lg,
    borderWidth: 0.5,
    padding: Space.md,
    gap: Space.sm,
    marginBottom: Space.lg,
  },
  summaryLabel: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.medium,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  summaryValue: {
    fontSize: Type.priceLarge.size,
    fontFamily: Typography.family.bold,
    letterSpacing: -0.5,
  },
  summaryStats: {
    flexDirection: 'row',
    paddingTop: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  summaryStat: {
    flex: 1,
    paddingHorizontal: Space.xs,
    alignItems: 'center',
    gap: 3,
  },
  summaryStatLabel: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.medium,
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  summaryStatValue: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.bold,
  },
  allocationCard: {
    borderRadius: Radius.lg,
    borderWidth: 0.5,
    padding: Space.md,
    gap: Space.sm,
    marginBottom: Space.lg,
  },
  allocationTitle: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: -0.3,
  },
  barsContainer: {
    gap: Space.sm,
  },
  barItem: {
    gap: 4,
  },
  barHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  barLabel: {
    flex: 1,
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
  },
  barPct: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
  },
  barTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  barFill: {
    height: 4,
    borderRadius: 2,
  },
  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Space.md,
  },
  sectionTitle: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: -0.3,
  },
  sectionLink: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
  },
});
