import React from 'react';
import { View, StyleSheet, StatusBar } from 'react-native';
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
import { Space, Radius } from '../theme/designTokens';
import {
  TradeHeader,
  MetricGrid,
} from '../components/trade';
import { Meta, BodyEmphasis } from '../components/ui/Text';
import { FlagshipAssetCard, FlagshipEmptyGraphic } from '../components/flagship';
import { AnimatedPressable } from '../components/AnimatedPressable';
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

  React.useEffect(() => {
    if (!currentUser?.id) { setIsLoading(false); return; }
    let cancelled = false;
    setIsLoading(true);

    Promise.all([
      listCoOwnAssets({ limit: 120 }),
      fetchCoOwnHoldings(currentUser.id).catch(() => []),
    ])
      .then(([assets, userHoldings]) => {
        if (cancelled) return;
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
      })
      .catch((err) => {
        if (cancelled) return;
        const parsed = parseApiError(err, 'Unable to load portfolio');
        show(parsed.message, 'error');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [currentUser?.id, show]);

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
      >
        <FlagshipAssetCard
          imageUri={item.image}
          name={item.title}
          unitPrice={formatFromFiat(item.unitPriceGBP, 'GBP')}
          yourUnits={item.yourUnits}
          totalUnits={item.totalUnits}
          status={item.isOpen ? 'active' : 'paused'}
          onPress={() => navigation.navigate('AssetDetail', { assetId: item.id })}
          onAction={() => navigation.navigate('Trade', { assetId: item.id, side: 'buy' })}
          actionLabel="Trade"
          index={index}
        />
      </Reanimated.View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={Colors.background} />

      <TradeHeader
        title="Portfolio"
        onBack={() => navigation.goBack()}
        rightAction={
          <Ionicons
            name="receipt-outline"
            size={20}
            color={Colors.textPrimary}
            onPress={() => navigation.navigate('CoOwnOrderHistory')}
          />
        }
      />

      <FlashList
        data={holdings}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View>
            <MetricGrid
              metrics={[
                { label: 'Total Value', value: formatFromFiat(totalValue, 'GBP', { displayMode: 'fiat' }) },
                { label: 'Unrealized P&L', value: `${unrealized >= 0 ? '+' : ''}${formatFromFiat(Math.abs(unrealized), 'GBP', { displayMode: 'fiat' })}`, tone: unrealized >= 0 ? 'positive' : 'negative' },
                { label: 'Realized P&L', value: `${realized >= 0 ? '+' : ''}${formatFromFiat(Math.abs(realized), 'GBP', { displayMode: 'fiat' })}`, tone: realized >= 0 ? 'positive' : 'negative' },
              ]}
              columns={3}
            />

            <View style={styles.sectionRow}>
              <Meta style={styles.sectionLabel}>HOLDINGS</Meta>
              <AnimatedPressable
                style={styles.sectionLinkWrap}
                onPress={() => navigation.navigate('AssetLeaderboard')}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Open asset leaderboards"
                accessibilityHint="Shows top performing co-own assets"
              >
                <Meta style={styles.sectionLink}>Leaderboards</Meta>
              </AnimatedPressable>
            </View>

            {portfolioBars.length > 0 && (
              <View style={styles.allocationWrap}>
                <Meta style={styles.sectionLabel}>ALLOCATION</Meta>
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
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={{ padding: Space.lg }}>
              <Meta style={{ textAlign: 'center', color: Colors.textMuted }}>Loading portfolio...</Meta>
            </View>
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
  listContent: {
    paddingBottom: Space.xl,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
    marginTop: Space.sm,
  },
  sectionLinkWrap: {
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  sectionLink: {
    color: Colors.brand,
  },
  allocationWrap: {
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Space.md,
  },
  sectionLabel: {
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
});