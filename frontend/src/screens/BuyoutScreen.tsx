import React from 'react';
import { View, StyleSheet, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { useAppTheme } from '../theme/ThemeContext';
import { Colors } from '../constants/colors';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useToast } from '../context/ToastContext';
import { parseApiError } from '../lib/apiClient';
import { createCoOwnBuyoutOffer, fetchCoOwnAssetById, fetchCoOwnHoldings } from '../services/marketApi';
import { AppButton } from '../components/ui/AppButton';
import { CachedImage } from '../components/CachedImage';
import { TradeHeader, TradeCard } from '../components/trade';
import { Space, Radius } from '../theme/designTokens';
import { Motion } from '../constants/motion';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { Meta, BodyEmphasis, Body } from '../components/ui/Text';
import { FinancialDisclosure } from '../components/FinancialDisclosure';

type RouteT = RouteProp<RootStackParamList, 'Buyout'>;
type NavT = StackNavigationProp<RootStackParamList>;

export default function BuyoutScreen() {
  const navigation = useNavigation<NavT>();
  const route = useRoute<RouteT>();
  const { show } = useToast();
  const { isDark } = useAppTheme();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const reducedMotionEnabled = useReducedMotion();
  const currentUser = useStore((state) => state.currentUser);
  const { formatFromFiat } = useFormattedPrice();

  const buyoutAssetId = route.params?.assetId;

  const [asset, setAsset] = React.useState<any>(null);
  const [sharesOwned, setSharesOwned] = React.useState(0);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isError, setIsError] = React.useState(false);

  React.useEffect(() => {
    if (!buyoutAssetId) { setIsLoading(false); setIsError(true); return; }
    let cancelled = false;
    setIsLoading(true);
    setIsError(false);

    Promise.all([
      fetchCoOwnAssetById(buyoutAssetId),
      currentUser?.id ? fetchCoOwnHoldings(currentUser.id).catch(() => []) : Promise.resolve([]),
    ])
      .then(([fetchedAsset, holdings]) => {
        if (cancelled) return;
        setAsset(fetchedAsset);
        const holding = holdings.find((h) => h.assetId === buyoutAssetId);
        setSharesOwned(holding?.unitsOwned ?? 0);
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
  }, [buyoutAssetId, currentUser?.id, show]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={Colors.background} />
        <TradeHeader title="Buyout" onBack={() => navigation.goBack()} />
        <View style={styles.emptyWrap}>
          <Meta style={styles.emptyText}>Loading asset details...</Meta>
        </View>
      </SafeAreaView>
    );
  }

  if (isError || !asset) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={Colors.background} />
        <TradeHeader title="Buyout" onBack={() => navigation.goBack()} />
        <View style={styles.emptyWrap}>
          <BodyEmphasis style={styles.emptyText}>Asset not found.</BodyEmphasis>
        </View>
      </SafeAreaView>
    );
  }

  const sharesNeeded = Math.max(0, asset.totalUnits - sharesOwned);
  const ownershipPct = asset.totalUnits > 0 ? (sharesOwned / asset.totalUnits) * 100 : 0;
  const offerPricePerShare = Number((asset.unitPriceGbp * 1.08).toFixed(2));
  const totalCost = sharesNeeded * offerPricePerShare;

  const handleBuyout = async () => {
    if (isSubmitting) return;

    // Never fabricate an actor identity. Buyout requires authentication.
    if (!currentUser?.id) {
      show('Sign in is required to initiate a buyout.', 'error');
      return;
    }

    if (sharesNeeded <= 0) {
      // Viewer already owns all units — no buyout transition is needed.
      // Do not claim a success state that implies a backend transition occurred.
      show('You already own 100% of this asset pool.', 'info');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await createCoOwnBuyoutOffer(asset.id, {
        bidderUserId: currentUser.id,
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
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={Colors.background} />

      <TradeHeader title="Buyout" onBack={() => navigation.goBack()} />

      <View style={styles.content}>
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(Motion.list.enterDuration)}>
          <CachedImage uri={asset.imageUrl ?? ''} style={styles.image} containerStyle={styles.imageContainer} contentFit="cover" />
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
          <FinancialDisclosure />
        </Reanimated.View>

        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(Motion.list.enterDuration).delay(200)}>
          <AppButton
            style={[styles.submitBtn, isSubmitting && styles.submitBtnDisabled]}
            title={isSubmitting ? 'Submitting...' : sharesNeeded > 0 ? 'Initiate Buyout' : 'You Own 100%'}
            icon={<Ionicons name="diamond-outline" size={16} color={Colors.textInverse} />}
            onPress={handleBuyout}
            disabled={isSubmitting || sharesNeeded <= 0}
            variant="primary"
            size="md"
            hapticFeedback="heavy"
            accessibilityLabel={sharesNeeded > 0 ? 'Initiate buyout' : 'You own 100 percent of this pool'}
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