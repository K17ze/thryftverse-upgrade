import React from 'react';
import { View, StyleSheet, StatusBar } from 'react-native';
import { FlashList } from '@shopify/flash-list';
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
import { EmptyState } from '../components/EmptyState';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { Motion } from '../constants/motion';
import { useToast } from '../context/ToastContext';
import { MOCK_USERS } from '../data/mockData';
import { Space, Radius } from '../theme/designTokens';
import {
  TradeHeader,
  MetricGrid,
  CoOwnAssetCard,
} from '../components/trade';
import { Meta, BodyEmphasis, Body } from '../components/ui/Text';
import { AnimatedPressable } from '../components/AnimatedPressable';

type NavT = StackNavigationProp<RootStackParamList>;

export default function PortfolioScreen() {
  const navigation = useNavigation<NavT>();
  const customCoOwns = useStore((state) => state.customCoOwns);
  const coOwnRuntime = useStore((state) => state.coOwnRuntime);
  const currentUser = useStore((state) => state.currentUser);
  const { formatFromFiat } = useFormattedPrice();
  const { show } = useToast();
  const reducedMotionEnabled = useReducedMotion();
  const supportUser = MOCK_USERS[0];

  const baseAssets = React.useMemo(() => getCoOwnMarket(customCoOwns), [customCoOwns]);
  const marketAssets = React.useMemo(
    () => baseAssets.map((asset) => resolveAssetMarketState(asset, coOwnRuntime[asset.id])),
    [baseAssets, coOwnRuntime]
  );

  const holdings = React.useMemo(() => marketAssets.filter((asset) => asset.yourUnits > 0), [marketAssets]);

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

  const handleOpenPortfolioSupport = React.useCallback(() => {
    navigation.navigate('Chat', {
      conversationId: 'c1',
      focusQuery: 'portfolio holdings support',
      partnerUserId: supportUser.id,
    });
    show('Opening support chat for portfolio help.', 'info');
  }, [navigation, show, supportUser.id]);

  const renderHolding = ({ item, index }: { item: CoOwnAsset; index: number }) => {
    const value = item.yourUnits * item.unitPriceGBP;
    const avg = item.avgEntryPriceGBP ?? item.unitPriceGBP;
    const pnl = (item.unitPriceGBP - avg) * item.yourUnits;
    const issuerUser = MOCK_USERS.find((user) => user.id === item.issuerId);
    const issuerHandle = issuerUser?.username ?? item.issuerId;
    const canMessageIssuer = currentUser?.id !== item.issuerId;

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
        <CoOwnAssetCard
          id={item.id}
          title={item.title}
          image={item.image}
          unitPrice={formatFromFiat(item.unitPriceGBP, 'GBP')}
          marketValue={formatFromFiat(value, 'GBP', { displayMode: 'fiat' })}
          openValue={formatFromFiat(item.availableUnits * item.unitPriceGBP, 'GBP', { displayMode: 'fiat' })}
          availableUnits={item.availableUnits}
          totalUnits={item.totalUnits}
          marketMovePct24h={item.marketMovePct24h}
          issuerHandle={issuerHandle}
          issuerAvatar={issuerUser?.avatar}
          yourUnits={item.yourUnits}
          isOpen={item.isOpen}
          compact
          onPress={() => navigation.navigate('AssetDetail', { assetId: item.id })}
          onBuy={() => navigation.navigate('Trade', { assetId: item.id, side: 'buy' })}
          onSell={() => navigation.navigate('Trade', { assetId: item.id, side: 'sell' })}
          onDetails={() => navigation.navigate('AssetDetail', { assetId: item.id })}
          onMessageIssuer={() =>
            navigation.navigate('Chat', {
              conversationId: `${item.issuerId}_${item.listingId}`,
              focusQuery: issuerHandle,
              partnerUserId: item.issuerId,
            })
          }
          onViewIssuer={() => navigation.navigate('UserProfile', { userId: item.issuerId })}
          canMessageIssuer={canMessageIssuer}
        />
      </Reanimated.View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={Colors.background} />

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
          <EmptyState
            icon="wallet-outline"
            title="No holdings"
            subtitle="Your co-own portfolio will appear here once you purchase units."
            ctaLabel="Browse Assets"
            onCtaPress={() => navigation.navigate('CoOwnHub')}
          />
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
