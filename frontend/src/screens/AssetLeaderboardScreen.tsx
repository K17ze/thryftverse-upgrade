import React from 'react';
import { View, StyleSheet, StatusBar, ScrollView } from 'react-native';
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
import { useReducedMotion } from '../hooks/useReducedMotion';
import { Motion } from '../constants/motion';
import { Space, Radius } from '../theme/designTokens';
import { TradeHeader, TradeCard } from '../components/trade';
import { CachedImage } from '../components/CachedImage';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { Meta, BodyEmphasis } from '../components/ui/Text';
import { listCoOwnAssets } from '../services/marketApi';
import { parseApiError } from '../lib/apiClient';
import { useToast } from '../context/ToastContext';

type NavT = StackNavigationProp<RootStackParamList>;

export default function AssetLeaderboardScreen() {
  const navigation = useNavigation<NavT>();
  const { isDark } = useAppTheme();
  const { formatFromFiat } = useFormattedPrice();
  const { show } = useToast();
  const reducedMotionEnabled = useReducedMotion();

  const [assets, setAssets] = React.useState<any[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
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
          unitPriceStable: item.unitPriceStable,
          settlementMode: item.settlementMode,
          issuerId: item.issuerId,
          marketMovePct24h: item.marketMovePct24h,
          holders: item.holders,
          volume24hGBP: item.volume24hGbp,
          isOpen: item.isOpen,
        })));
      })
      .catch((err) => {
        if (cancelled) return;
        const parsed = parseApiError(err, 'Unable to load leaderboard');
        show(parsed.message, 'error');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, [show]);

  const topMovers = React.useMemo(() => [...assets].sort((a, b) => b.marketMovePct24h - a.marketMovePct24h).slice(0, 5), [assets]);
  const topMarketValue = React.useMemo(
    () => [...assets].sort((a, b) => b.totalUnits * b.unitPriceGBP - a.totalUnits * a.unitPriceGBP).slice(0, 5),
    [assets]
  );
  const topHolders = React.useMemo(() => [...assets].sort((a, b) => b.holders - a.holders).slice(0, 5), [assets]);

  const renderList = (
    title: string,
    icon: keyof typeof Ionicons.glyphMap,
    data: any[],
    metric: (asset: any) => string,
    sectionIndex: number
  ) => (
    <Reanimated.View
      entering={
        reducedMotionEnabled
          ? undefined
          : FadeInDown
              .duration(Motion.list.enterDuration)
              .delay(sectionIndex * Motion.list.staggerStep)
      }
    >
      <TradeCard style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <Ionicons name={icon} size={16} color={Colors.brand} />
          <BodyEmphasis style={styles.sectionTitle}>{title}</BodyEmphasis>
        </View>

        {data.map((asset, idx) => (
          <Reanimated.View
            key={`${title}_${asset.id}`}
            entering={
              reducedMotionEnabled
                ? undefined
                : FadeInDown
                    .duration(Motion.list.enterDuration)
                    .delay(Math.min(idx, Motion.list.maxStaggerItems) * Motion.list.staggerStep)
            }
          >
            <AnimatedPressable
              style={styles.row}
              activeOpacity={0.92}
              onPress={() => navigation.navigate('AssetDetail', { assetId: asset.id })}
              disableAnimation={false}
              scaleValue={0.985}
            >
              <BodyEmphasis style={styles.rank}>{idx + 1}</BodyEmphasis>
              <CachedImage uri={asset.image} style={styles.thumb} containerStyle={styles.thumbContainer} contentFit="cover" />
              <View style={styles.rowBody}>
                <BodyEmphasis style={styles.rowTitle} numberOfLines={1}>{asset.title}</BodyEmphasis>
                <Meta style={styles.rowSub}>{formatFromFiat(asset.unitPriceGBP, 'GBP')}</Meta>
              </View>
              <BodyEmphasis style={styles.metric}>{metric(asset)}</BodyEmphasis>
            </AnimatedPressable>
          </Reanimated.View>
        ))}
      </TradeCard>
    </Reanimated.View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={Colors.background} />

      <TradeHeader title="Asset Leaderboard" onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {isLoading ? (
          <View style={styles.centered}>
            <Meta style={styles.emptyText}>Loading leaderboard...</Meta>
          </View>
        ) : (
          <>
            {renderList('Top Movers', 'trending-up-outline', topMovers, (asset) => `${asset.marketMovePct24h >= 0 ? '+' : ''}${asset.marketMovePct24h.toFixed(1)}%`, 0)}
            {renderList('Top Market Value', 'pulse-outline', topMarketValue, (asset) => formatFromFiat(asset.totalUnits * asset.unitPriceGBP, 'GBP', { displayMode: 'fiat' }), 1)}
            {renderList('Most Held', 'people-outline', topHolders, (asset) => `${asset.holders} holders`, 2)}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.xl,
    gap: Space.sm,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: Colors.textSecondary,
  },
  sectionCard: {
    padding: Space.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    marginBottom: Space.xs,
  },
  sectionTitle: {},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Space.xs,
    gap: Space.sm,
  },
  rank: {
    width: 18,
    color: Colors.textMuted,
  },
  thumbContainer: {
    width: 34,
    height: 34,
    borderRadius: Radius.md,
  },
  thumb: {
    width: '100%',
    height: '100%',
  },
  rowBody: {
    flex: 1,
  },
  rowTitle: {
    marginBottom: 2,
  },
  rowSub: {},
  metric: {
    color: Colors.brand,
  },
});