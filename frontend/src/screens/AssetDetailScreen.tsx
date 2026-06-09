import React from 'react';
import { View, Text, StyleSheet, ScrollView, StatusBar } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { ActiveTheme, Colors } from '../constants/colors';
import { RootStackParamList } from '../navigation/types';
import { getCoOwnMarket, getUserLabel } from '../data/tradeHub';
import { useStore } from '../store/useStore';
import { resolveAssetMarketState, getOrderBookSnapshot, getPriceSeries, ChartRange } from '../data/mockSyndicateData';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { EmptyState } from '../components/EmptyState';
import { AppButton } from '../components/ui/AppButton';
import { AppSegmentControl } from '../components/ui/AppSegmentControl';
import { CachedImage } from '../components/CachedImage';
import { TradeHeader, TradeCard } from '../components/trade';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { Space, Radius, Typography } from '../theme/designTokens';
import { Motion } from '../constants/motion';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { Meta, BodyEmphasis, Body } from '../components/ui/Text';
import { FlagshipActionCluster } from '../components/flagship';

type RouteT = RouteProp<RootStackParamList, 'AssetDetail'>;
type NavT = StackNavigationProp<RootStackParamList>;

const RANGE_OPTIONS: ChartRange[] = ['1H', '1D', '1W', '1M', 'ALL'];
const RANGE_SEGMENT_OPTIONS: Array<{ value: ChartRange; label: string; accessibilityLabel: string }> =
  RANGE_OPTIONS.map((option) => ({
    value: option,
    label: option,
    accessibilityLabel: `Set chart range to ${option}`,
  }));

export default function AssetDetailScreen() {
  const navigation = useNavigation<NavT>();
  const route = useRoute<RouteT>();
  const insets = useSafeAreaInsets();
  const reducedMotionEnabled = useReducedMotion();

  const customCoOwns = useStore((state) => state.customCoOwns);
  const coOwnRuntime = useStore((state) => state.coOwnRuntime);
  const currentUser = useStore((state) => state.currentUser);
  const { formatFromFiat } = useFormattedPrice();

  const [range, setRange] = React.useState<ChartRange>('1D');

  const baseAssets = React.useMemo(() => getCoOwnMarket(customCoOwns), [customCoOwns]);
  const marketAssets = React.useMemo(
    () => baseAssets.map((asset) => resolveAssetMarketState(asset, coOwnRuntime[asset.id])),
    [baseAssets, coOwnRuntime]
  );

  const assetId = route.params?.assetId;
  const asset = assetId ? marketAssets.find((item) => item.id === assetId) : undefined;

  const series = React.useMemo(() => (asset ? getPriceSeries(asset.id, range) : []), [asset, range]);
  const orderBook = React.useMemo(() => (asset ? getOrderBookSnapshot(asset.id) : []), [asset]);

  const chartPoints = React.useMemo(() => {
    if (series.length === 0) return [];
    const sampleSize = 28;
    const step = Math.max(1, Math.floor(series.length / sampleSize));
    const closes = series.filter((_, idx) => idx % step === 0).map((point) => point.close);
    const min = Math.min(...closes);
    const max = Math.max(...closes);
    const spread = max - min || 1;
    return closes.map((close) => ({ value: close, level: (close - min) / spread }));
  }, [series]);

  const currentPoint = series[series.length - 1];
  const previousPoint = series[series.length - 2] ?? currentPoint;
  const delta = currentPoint && previousPoint ? currentPoint.close - previousPoint.close : 0;
  const deltaPct = previousPoint && previousPoint.close > 0 ? (delta / previousPoint.close) * 100 : 0;

  if (!asset) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={Colors.background} />
        <TradeHeader title="Asset Detail" onBack={() => navigation.goBack()} />
        <EmptyState
          icon="analytics-outline"
          title="Asset not found"
          subtitle="This co-own may have been delisted or does not exist yet."
          ctaLabel="Back to hub"
          onCtaPress={() => navigation.navigate('CoOwnHub')}
        />
      </SafeAreaView>
    );
  }

  const bids = orderBook.filter((entry) => entry.side === 'bid').sort((a, b) => b.price - a.price);
  const asks = orderBook.filter((entry) => entry.side === 'ask').sort((a, b) => a.price - b.price);
  const marketValue = asset.totalUnits * asset.unitPriceGBP;
  const circulatingValue = Math.max(0, asset.totalUnits - asset.availableUnits) * asset.unitPriceGBP;

  const issuerHandle = getUserLabel(asset.issuerId).replace(/^@/, 'seller');
  const canMessageIssuer = currentUser?.id !== asset.issuerId;

  const ownerAccounts: Array<{ id: string; handle: string; role: string; units: number }> = [];
  ownerAccounts.push({
    id: `issuer_${asset.issuerId}`,
    handle: getUserLabel(asset.issuerId),
    role: 'Issuer treasury',
    units: Math.max(0, asset.availableUnits),
  });
  if (asset.yourUnits > 0) {
    ownerAccounts.push({
      id: 'you',
      handle: currentUser ? `@${currentUser.username}` : '@you',
      role: 'Your position',
      units: asset.yourUnits,
    });
  }
  const allocatedUnits = ownerAccounts.reduce((sum, account) => sum + account.units, 0);
  const remainingUnits = Math.max(0, asset.totalUnits - allocatedUnits);
  if (remainingUnits > 0) {
    ownerAccounts.push({
      id: 'other_holders',
      handle: `${Math.max(0, asset.holders - (asset.yourUnits > 0 ? 1 : 0) - 1)} other holders`,
      role: 'Co-owners',
      units: remainingUnits,
    });
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={Colors.background} />

      <TradeHeader
        title="Asset Detail"
        onBack={() => navigation.goBack()}
        rightAction={
          <AnimatedPressable
            style={styles.iconBtn}
            onPress={() => navigation.navigate('CoOwnOrderHistory')}
            accessibilityRole="button"
            accessibilityLabel="View order history"
          >
            <Ionicons name="time-outline" size={20} color={Colors.textPrimary} />
          </AnimatedPressable>
        }
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(Motion.list.enterDuration)}>
          <CachedImage uri={asset.image} style={styles.heroImage} containerStyle={styles.heroImageContainer} contentFit="cover" />
        </Reanimated.View>

        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(Motion.list.enterDuration).delay(50)}>
          <BodyEmphasis style={styles.assetTitle}>{asset.title}</BodyEmphasis>
          <Meta style={styles.assetSub}>{asset.totalUnits} units · {asset.settlementMode} settlement</Meta>
        </Reanimated.View>

        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(Motion.list.enterDuration).delay(100)}>
          <View style={styles.issuerActionRow}>
            <AnimatedPressable
              style={styles.issuerChip}
              onPress={() => navigation.navigate('UserProfile', { userId: asset.issuerId })}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={`Open @${issuerHandle} profile`}
            >
              <View style={[styles.issuerAvatarContainer, { backgroundColor: Colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }]}>
                <Text style={{ fontSize: 12, fontFamily: Typography.family.bold, color: Colors.textPrimary }}>
                  {issuerHandle.slice(0, 1).toUpperCase()}
                </Text>
              </View>
              <BodyEmphasis style={styles.issuerHandle}>@{issuerHandle}</BodyEmphasis>
              <Meta style={styles.issuerRole}>Issuer</Meta>
            </AnimatedPressable>

            <AnimatedPressable
              style={[styles.messageBtn, !canMessageIssuer && styles.messageBtnDisabled]}
              onPress={() => {
                if (!canMessageIssuer) return;
                navigation.navigate('Chat', {
                  conversationId: `${asset.issuerId}_${asset.listingId}`,
                  focusQuery: issuerHandle,
                  partnerUserId: asset.issuerId,
                });
              }}
              disabled={!canMessageIssuer}
              activeOpacity={0.85}
              accessibilityRole="button"
            >
              <Ionicons name={canMessageIssuer ? 'chatbubble-outline' : 'checkmark'} size={16} color={Colors.textPrimary} />
            </AnimatedPressable>
          </View>
        </Reanimated.View>

        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(Motion.list.enterDuration).delay(150)}>
          <TradeCard>
            <View style={styles.priceRow}>
              <View>
                <Meta>Current Price</Meta>
                <BodyEmphasis style={styles.priceValue}>{formatFromFiat(asset.unitPriceGBP, 'GBP')}</BodyEmphasis>
              </View>
              <View style={[styles.deltaPill, delta >= 0 ? styles.deltaUp : styles.deltaDown]}>
                <Ionicons name={delta >= 0 ? 'trending-up-outline' : 'trending-down-outline'} size={14} color={delta >= 0 ? Colors.success : Colors.danger} />
                <Body style={[styles.deltaText, { color: delta >= 0 ? Colors.success : Colors.danger }]}>
                  {delta >= 0 ? '+' : ''}{deltaPct.toFixed(2)}%
                </Body>
              </View>
            </View>
          </TradeCard>
        </Reanimated.View>

        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(Motion.list.enterDuration).delay(200)}>
          <TradeCard>
            <Meta style={styles.sectionLabel}>PRICE CHART</Meta>
            <AppSegmentControl
              options={RANGE_SEGMENT_OPTIONS}
              value={range}
              onChange={setRange}
              style={styles.rangeControl}
            />
            <View style={styles.chartContainer}>
              {chartPoints.length === 0 ? (
                <Meta style={styles.chartEmpty}>No price data available.</Meta>
              ) : (
                <View style={styles.chartBarRow}>
                  {chartPoints.map((point, idx) => (
                    <View
                      key={idx}
                      style={[
                        styles.chartBar,
                        {
                          height: `${Math.max(10, point.level * 100)}%`,
                          backgroundColor: point.value >= (chartPoints[0]?.value ?? 0) ? Colors.success : Colors.danger,
                        },
                      ]}
                    />
                  ))}
                </View>
              )}
            </View>
          </TradeCard>
        </Reanimated.View>

        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(Motion.list.enterDuration).delay(250)}>
          <TradeCard>
            <Meta style={styles.sectionLabel}>ORDER BOOK</Meta>
            <View style={styles.orderBookGrid}>
              <View style={styles.orderBookCol}>
                <Meta style={styles.orderBookHeader}>BIDS</Meta>
                {bids.slice(0, 5).map((entry, i) => (
                  <View key={`bid-${i}`} style={styles.orderBookRow}>
                    <Body style={styles.orderBookPrice}>{formatFromFiat(entry.price, 'GBP')}</Body>
                    <Meta>{entry.quantity}u</Meta>
                  </View>
                ))}
                {bids.length === 0 && <Meta style={styles.orderBookEmpty}>No bids</Meta>}
              </View>
              <View style={styles.orderBookCol}>
                <Meta style={styles.orderBookHeader}>ASKS</Meta>
                {asks.slice(0, 5).map((entry, i) => (
                  <View key={`ask-${i}`} style={styles.orderBookRow}>
                    <Body style={styles.orderBookPrice}>{formatFromFiat(entry.price, 'GBP')}</Body>
                    <Meta>{entry.quantity}u</Meta>
                  </View>
                ))}
                {asks.length === 0 && <Meta style={styles.orderBookEmpty}>No asks</Meta>}
              </View>
            </View>
          </TradeCard>
        </Reanimated.View>

        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(Motion.list.enterDuration).delay(300)}>
          <TradeCard>
            <Meta style={styles.sectionLabel}>OWNERSHIP BREAKDOWN</Meta>
            {ownerAccounts.map((account) => (
              <View key={account.id} style={styles.ownerRow}>
                <View style={styles.ownerInfo}>
                  <BodyEmphasis style={styles.ownerHandle} numberOfLines={1}>{account.handle}</BodyEmphasis>
                  <Meta style={styles.ownerRole}>{account.role}</Meta>
                </View>
                <BodyEmphasis style={styles.ownerUnits}>{account.units}u</BodyEmphasis>
              </View>
            ))}
            <View style={[styles.ownerRow, styles.totalRow]}>
              <BodyEmphasis>Total</BodyEmphasis>
              <BodyEmphasis>{asset.totalUnits}u</BodyEmphasis>
            </View>
          </TradeCard>
        </Reanimated.View>

        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(Motion.list.enterDuration).delay(350)}>
          <FlagshipActionCluster
            layout="row"
            actions={[
              {
                label: 'Trade',
                onPress: () => navigation.navigate('Trade', { assetId: asset.id, side: 'buy' }),
                variant: 'primary',
              },
              {
                label: 'Buyout',
                onPress: () => navigation.navigate('Buyout', { assetId: asset.id }),
                variant: 'secondary',
              },
            ]}
          />
          <FlagshipActionCluster
            actions={[
              {
                label: 'Report Issue',
                onPress: () => navigation.navigate('CoOwnIssue', { assetId: asset.id }),
                variant: 'secondary',
              },
            ]}
          />
        </Reanimated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.xl,
  },
  heroImageContainer: {
    width: '100%',
    height: 240,
    borderRadius: Radius.lg,
    marginBottom: Space.md,
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  assetTitle: {
    marginBottom: 4,
  },
  assetSub: {
    marginBottom: Space.md,
  },
  issuerActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Space.md,
    gap: Space.sm,
  },
  issuerChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.sm,
  },
  issuerAvatarContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  issuerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  issuerHandle: {
    flex: 1,
  },
  issuerRole: {
    marginLeft: 'auto',
  },
  messageBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageBtnDisabled: {
    opacity: 0.4,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  priceValue: {
    marginTop: 4,
    color: Colors.brand,
  },
  deltaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: Radius.full,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  deltaUp: {
    backgroundColor: Colors.success + '12',
    borderColor: Colors.success + '30',
  },
  deltaDown: {
    backgroundColor: Colors.danger + '12',
    borderColor: Colors.danger + '30',
  },
  deltaText: {
    fontSize: 12,
  },
  sectionLabel: {
    marginBottom: Space.sm,
  },
  rangeControl: {
    marginBottom: Space.sm,
  },
  chartContainer: {
    height: 120,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Space.sm,
  },
  chartEmpty: {
    color: Colors.textMuted,
  },
  chartBarRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    width: '100%',
    height: '80%',
    gap: 2,
  },
  chartBar: {
    flex: 1,
    borderRadius: 2,
    minWidth: 4,
  },
  orderBookGrid: {
    flexDirection: 'row',
    gap: Space.md,
  },
  orderBookCol: {
    flex: 1,
  },
  orderBookHeader: {
    marginBottom: Space.sm,
    textAlign: 'center',
  },
  orderBookRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  orderBookPrice: {
    fontVariant: ['tabular-nums'],
  },
  orderBookEmpty: {
    textAlign: 'center',
    color: Colors.textMuted,
    marginTop: Space.sm,
  },
  ownerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  ownerInfo: {
    flex: 1,
  },
  ownerHandle: {
    marginBottom: 2,
  },
  ownerRole: {},
  ownerUnits: {
    fontVariant: ['tabular-nums'],
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    marginTop: Space.xs,
    paddingTop: Space.sm,
  },
  actionRow: {
    flexDirection: 'row',
    gap: Space.sm,
    marginTop: Space.md,
  },
  actionBtn: {
    flex: 1,
  },
});
