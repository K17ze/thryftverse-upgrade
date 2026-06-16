import React from 'react';
import { View, Text, StyleSheet, ScrollView, StatusBar } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { useAppTheme } from '../theme/ThemeContext';
import { Colors } from '../constants/colors';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { EmptyState } from '../components/EmptyState';
import { AppButton } from '../components/ui/AppButton';
import { CachedImage } from '../components/CachedImage';
import { TradeHeader, TradeCard } from '../components/trade';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { Space, Radius, Typography } from '../theme/designTokens';
import { Motion } from '../constants/motion';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { Meta, BodyEmphasis, Body } from '../components/ui/Text';
import { FlagshipActionCluster } from '../components/flagship';
import { FinancialDisclosure } from '../components/FinancialDisclosure';
import { fetchCoOwnAssetById, fetchCoOwnOrderBook, fetchCoOwnHoldings } from '../services/marketApi';
import { parseApiError } from '../lib/apiClient';
import { useToast } from '../context/ToastContext';

type RouteT = RouteProp<RootStackParamList, 'AssetDetail'>;
type NavT = StackNavigationProp<RootStackParamList>;

export default function AssetDetailScreen() {
  const navigation = useNavigation<NavT>();
  const route = useRoute<RouteT>();
  const { isDark } = useAppTheme();
  const reducedMotionEnabled = useReducedMotion();
  const currentUser = useStore((state) => state.currentUser);
  const { formatFromFiat } = useFormattedPrice();
  const { show } = useToast();

  const assetId = route.params?.assetId;

  const [asset, setAsset] = React.useState<any>(null);
  const [orderBook, setOrderBook] = React.useState<{ bids: any[]; asks: any[] }>({ bids: [], asks: [] });
  const [yourUnits, setYourUnits] = React.useState(0);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isError, setIsError] = React.useState(false);

  React.useEffect(() => {
    if (!assetId) { setIsLoading(false); setIsError(true); return; }
    let cancelled = false;
    setIsLoading(true);
    setIsError(false);

    Promise.all([
      fetchCoOwnAssetById(assetId),
      fetchCoOwnOrderBook(assetId, { limit: 40 }).catch(() => ({ bids: [], asks: [] })),
      currentUser?.id ? fetchCoOwnHoldings(currentUser.id).catch(() => []) : Promise.resolve([]),
    ])
      .then(([fetchedAsset, fetchedBook, holdings]) => {
        if (cancelled) return;
        setAsset(fetchedAsset);
        setOrderBook(fetchedBook);
        const holding = holdings.find((h) => h.assetId === assetId);
        setYourUnits(holding?.unitsOwned ?? 0);
      })
      .catch((err) => {
        if (cancelled) return;
        const parsed = parseApiError(err, 'Unable to load asset');
        show(parsed.message, 'error');
        setIsError(true);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [assetId, currentUser?.id, show]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={Colors.background} />
        <TradeHeader title="Asset Detail" onBack={() => navigation.goBack()} />
        <View style={styles.centered}>
          <Meta style={styles.emptyText}>Loading asset details...</Meta>
        </View>
      </SafeAreaView>
    );
  }

  if (isError || !asset) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={Colors.background} />
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

  const deltaPct = asset.marketMovePct24h ?? 0;
  const delta = deltaPct;
  const marketValue = asset.totalUnits * asset.unitPriceGbp;
  const circulatingValue = Math.max(0, asset.totalUnits - asset.availableUnits) * asset.unitPriceGbp;
  const issuerHandle = asset.issuerId.slice(0, 12);
  const canMessageIssuer = currentUser?.id !== asset.issuerId;

  const ownerAccounts: Array<{ id: string; handle: string; role: string; units: number }> = [];
  ownerAccounts.push({
    id: `issuer_${asset.issuerId}`,
    handle: `@${issuerHandle}`,
    role: 'Issuer treasury',
    units: Math.max(0, asset.availableUnits),
  });
  if (yourUnits > 0) {
    ownerAccounts.push({
      id: 'you',
      handle: currentUser ? `@${currentUser.username}` : '@you',
      role: 'Your position',
      units: yourUnits,
    });
  }
  const allocatedUnits = ownerAccounts.reduce((sum, account) => sum + account.units, 0);
  const remainingUnits = Math.max(0, asset.totalUnits - allocatedUnits);
  if (remainingUnits > 0) {
    ownerAccounts.push({
      id: 'other_holders',
      handle: `${Math.max(0, asset.holders - (yourUnits > 0 ? 1 : 0) - 1)} other holders`,
      role: 'Co-owners',
      units: remainingUnits,
    });
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={Colors.background} />

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
          <CachedImage uri={asset.imageUrl ?? ''} style={styles.heroImage} containerStyle={styles.heroImageContainer} contentFit="cover" />
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
                <BodyEmphasis style={styles.priceValue}>{formatFromFiat(asset.unitPriceGbp, 'GBP')}</BodyEmphasis>
              </View>
              <View style={[styles.deltaPill, deltaPct >= 0 ? styles.deltaUp : styles.deltaDown]}>
                <Ionicons name={deltaPct >= 0 ? 'trending-up-outline' : 'trending-down-outline'} size={14} color={deltaPct >= 0 ? Colors.success : Colors.danger} />
                <Body style={[styles.deltaText, { color: deltaPct >= 0 ? Colors.success : Colors.danger }]}>
                  {deltaPct >= 0 ? '+' : ''}{deltaPct.toFixed(2)}%
                </Body>
              </View>
            </View>
          </TradeCard>
        </Reanimated.View>

        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(Motion.list.enterDuration).delay(200)}>
          <TradeCard>
            <Meta style={styles.sectionLabel}>PRICE HISTORY</Meta>
            <View style={styles.chartContainer}>
              <Meta style={styles.chartEmpty}>Price history is not available for this asset.</Meta>
            </View>
          </TradeCard>
        </Reanimated.View>

        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(Motion.list.enterDuration).delay(250)}>
          <TradeCard>
            <Meta style={styles.sectionLabel}>ORDER BOOK</Meta>
            <View style={styles.orderBookGrid}>
              <View style={styles.orderBookCol}>
                <Meta style={styles.orderBookHeader}>BIDS</Meta>
                {orderBook.bids.slice(0, 5).map((entry: any, i: number) => (
                  <View key={`bid-${i}`} style={styles.orderBookRow}>
                    <Body style={styles.orderBookPrice}>{formatFromFiat(entry.unitPriceGbp, 'GBP')}</Body>
                    <Meta>{entry.units}u</Meta>
                  </View>
                ))}
                {orderBook.bids.length === 0 && <Meta style={styles.orderBookEmpty}>No bids</Meta>}
              </View>
              <View style={styles.orderBookCol}>
                <Meta style={styles.orderBookHeader}>ASKS</Meta>
                {orderBook.asks.slice(0, 5).map((entry: any, i: number) => (
                  <View key={`ask-${i}`} style={styles.orderBookRow}>
                    <Body style={styles.orderBookPrice}>{formatFromFiat(entry.unitPriceGbp, 'GBP')}</Body>
                    <Meta>{entry.units}u</Meta>
                  </View>
                ))}
                {orderBook.asks.length === 0 && <Meta style={styles.orderBookEmpty}>No asks</Meta>}
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
          <FinancialDisclosure />
        </Reanimated.View>

        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(Motion.list.enterDuration).delay(400)}>
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
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: Colors.textSecondary,
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