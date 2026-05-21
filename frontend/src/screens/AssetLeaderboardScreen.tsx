import React from 'react';
import { View, StyleSheet, StatusBar, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { ActiveTheme, Colors } from '../constants/colors';
import { RootStackParamList } from '../navigation/types';
import { getCoOwnMarket, CoOwnAsset } from '../data/tradeHub';
import { useStore } from '../store/useStore';
import { resolveAssetMarketState } from '../data/mockSyndicateData';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { Motion } from '../constants/motion';
import { Space, Radius } from '../theme/designTokens';
import { TradeHeader, TradeCard } from '../components/trade';
import { CachedImage } from '../components/CachedImage';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { Meta, BodyEmphasis } from '../components/ui/Text';

type NavT = StackNavigationProp<RootStackParamList>;

export default function AssetLeaderboardScreen() {
  const navigation = useNavigation<NavT>();
  const customCoOwns = useStore((state) => state.customCoOwns);
  const coOwnRuntime = useStore((state) => state.coOwnRuntime);
  const { formatFromFiat } = useFormattedPrice();
  const reducedMotionEnabled = useReducedMotion();

  const baseAssets = React.useMemo(() => getCoOwnMarket(customCoOwns), [customCoOwns]);
  const marketAssets = React.useMemo(
    () => baseAssets.map((asset) => resolveAssetMarketState(asset, coOwnRuntime[asset.id])),
    [baseAssets, coOwnRuntime]
  );

  const topMovers = React.useMemo(() => [...marketAssets].sort((a, b) => b.marketMovePct24h - a.marketMovePct24h).slice(0, 5), [marketAssets]);
  const topMarketValue = React.useMemo(
    () => [...marketAssets].sort((a, b) => b.totalUnits * b.unitPriceGBP - a.totalUnits * a.unitPriceGBP).slice(0, 5),
    [marketAssets]
  );
  const topHolders = React.useMemo(() => [...marketAssets].sort((a, b) => b.holders - a.holders).slice(0, 5), [marketAssets]);

  const renderList = (title: string, icon: keyof typeof Ionicons.glyphMap, data: CoOwnAsset[], metric: (asset: CoOwnAsset) => string) => (
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
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={Colors.background} />

      <TradeHeader title="Asset Leaderboard" onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {renderList('Top Movers', 'trending-up-outline', topMovers, (asset) => `${asset.marketMovePct24h >= 0 ? '+' : ''}${asset.marketMovePct24h.toFixed(1)}%`)}
        {renderList('Top Market Value', 'pulse-outline', topMarketValue, (asset) => formatFromFiat(asset.totalUnits * asset.unitPriceGBP, 'GBP', { displayMode: 'fiat' }))}
        {renderList('Most Held', 'people-outline', topHolders, (asset) => `${asset.holders} holders`)}
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
  sectionCard: {
    padding: Space.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 7,
  },
  sectionTitle: {},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    gap: 9,
  },
  rank: {
    width: 18,
    color: Colors.textMuted,
  },
  thumbContainer: {
    width: 34,
    height: 34,
    borderRadius: 9,
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
