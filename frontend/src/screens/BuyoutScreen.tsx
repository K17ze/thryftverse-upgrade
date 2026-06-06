import React from 'react';
import { View, StyleSheet, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { ActiveTheme, Colors } from '../constants/colors';
import { RootStackParamList } from '../navigation/types';
import { getCoOwnMarket } from '../data/tradeHub';
import { useStore } from '../store/useStore';
import { resolveAssetMarketState } from '../data/mockSyndicateData';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useToast } from '../context/ToastContext';
import { parseApiError } from '../lib/apiClient';
import { createCoOwnBuyoutOffer } from '../services/marketApi';
import { AppButton } from '../components/ui/AppButton';
import { CachedImage } from '../components/CachedImage';
import { TradeHeader, TradeCard } from '../components/trade';
import { Space, Radius } from '../theme/designTokens';
import { Motion } from '../constants/motion';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { Meta, BodyEmphasis, Body } from '../components/ui/Text';

type RouteT = RouteProp<RootStackParamList, 'Buyout'>;
type NavT = StackNavigationProp<RootStackParamList>;

export default function BuyoutScreen() {
  const navigation = useNavigation<NavT>();
  const route = useRoute<RouteT>();
  const { show } = useToast();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const reducedMotionEnabled = useReducedMotion();

  const customCoOwns = useStore((state) => state.customCoOwns);
  const coOwnRuntime = useStore((state) => state.coOwnRuntime);
  const currentUser = useStore((state) => state.currentUser);
  const { formatFromFiat } = useFormattedPrice();

  const baseAssets = React.useMemo(() => getCoOwnMarket(customCoOwns), [customCoOwns]);
  const marketAssets = React.useMemo(
    () => baseAssets.map((asset) => resolveAssetMarketState(asset, coOwnRuntime[asset.id])),
    [baseAssets, coOwnRuntime]
  );

  const buyoutAssetId = route.params?.assetId;
  const asset = buyoutAssetId ? marketAssets.find((item) => item.id === buyoutAssetId) : undefined;

  if (!asset) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={Colors.background} />
        <TradeHeader title="Buyout" onBack={() => navigation.goBack()} />
        <View style={styles.emptyWrap}>
          <BodyEmphasis style={styles.emptyText}>Asset not found.</BodyEmphasis>
        </View>
      </SafeAreaView>
    );
  }

  const sharesOwned = asset.yourUnits;
  const sharesNeeded = Math.max(0, asset.totalUnits - sharesOwned);
  const ownershipPct = asset.totalUnits > 0 ? (sharesOwned / asset.totalUnits) * 100 : 0;
  const offerPricePerShare = Number((asset.unitPriceGBP * 1.08).toFixed(2));
  const totalCost = sharesNeeded * offerPricePerShare;

  const handleBuyout = async () => {
    if (isSubmitting) return;
    if (sharesNeeded <= 0) {
      show('You already control 100% of this asset pool.', 'success');
      navigation.navigate('AssetDetail', { assetId: asset.id });
      return;
    }

    setIsSubmitting(true);
    try {
      const bidderUserId = currentUser?.id ?? 'u1';
      const response = await createCoOwnBuyoutOffer(asset.id, {
        bidderUserId,
        offerPriceGbp: offerPricePerShare,
        targetUnits: sharesNeeded,
        expiresInHours: 24,
        metadata: { source: 'buyout_screen' },
      });

      show('Buyout offer submitted. Track progress in order history.', 'success');
      if (response.aml?.alertId) show('Buyout offer is flagged for AML review.', 'info');
      navigation.navigate('CoOwnOrderHistory');
    } catch (error) {
      const parsedError = parseApiError(error, 'Unable to submit buyout offer');
      if (parsedError.isNetworkError) {
        show('Network unavailable. Could not submit buyout offer.', 'error');
      } else {
        show(parsedError.message, 'error');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={Colors.background} />

      <TradeHeader title="Buyout" onBack={() => navigation.goBack()} />

      <View style={styles.content}>
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(Motion.list.enterDuration)}>
          <CachedImage uri={asset.image} style={styles.image} containerStyle={styles.imageContainer} contentFit="cover" />
        </Reanimated.View>

        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(Motion.list.enterDuration).delay(50)}>
          <BodyEmphasis style={styles.title}>{asset.title}</BodyEmphasis>
        </Reanimated.View>

        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(Motion.list.enterDuration).delay(100)}>
          <TradeCard>
            <View style={styles.row}>
              <Meta>Owned shares</Meta>
              <BodyEmphasis>{sharesOwned} / {asset.totalUnits}</BodyEmphasis>
            </View>
            <View style={styles.row}>
              <Meta>Ownership</Meta>
              <BodyEmphasis>{ownershipPct.toFixed(2)}%</BodyEmphasis>
            </View>
            <View style={styles.row}>
              <Meta>Remaining shares</Meta>
              <BodyEmphasis>{sharesNeeded}</BodyEmphasis>
            </View>
            <View style={styles.row}>
              <Meta>Buyout offer/share</Meta>
              <BodyEmphasis>{formatFromFiat(offerPricePerShare, 'GBP', { displayMode: 'fiat' })}</BodyEmphasis>
            </View>
            <View style={[styles.row, styles.totalRow]}>
              <BodyEmphasis>Estimated buyout total</BodyEmphasis>
              <BodyEmphasis style={{ color: Colors.brand }}>{formatFromFiat(totalCost, 'GBP')}</BodyEmphasis>
            </View>
          </TradeCard>
        </Reanimated.View>

        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(Motion.list.enterDuration).delay(150)}>
          <AppButton
            style={[styles.submitBtn, isSubmitting && styles.submitBtnDisabled]}
            title={isSubmitting ? 'Submitting...' : sharesNeeded > 0 ? 'Initiate Buyout' : 'Claim Full Ownership'}
            icon={<Ionicons name="diamond-outline" size={16} color={Colors.textInverse} />}
            onPress={handleBuyout}
            disabled={isSubmitting}
            variant="primary"
            size="md"
            hapticFeedback="heavy"
            accessibilityLabel={sharesNeeded > 0 ? 'Initiate buyout' : 'Claim full ownership'}
          />
        </Reanimated.View>

        <Meta style={styles.footNote}>
          Buyout requests are routed to the order ledger so you can monitor acceptance and settlement status.
        </Meta>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: Colors.textSecondary,
  },
  content: {
    paddingHorizontal: Space.md,
    paddingTop: 4,
  },
  imageContainer: {
    width: '100%',
    height: 220,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    marginBottom: Space.sm,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  title: {
    marginBottom: Space.sm,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    marginTop: Space.xs,
    paddingTop: Space.sm,
  },
  submitBtn: {
    marginTop: Space.lg,
  },
  submitBtnDisabled: {
    opacity: 0.52,
  },
  footNote: {
    marginTop: Space.md,
    textAlign: 'center',
  },
});
