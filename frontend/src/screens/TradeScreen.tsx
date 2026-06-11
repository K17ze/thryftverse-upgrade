import React from 'react';
import { View, StyleSheet, StatusBar, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { useAppTheme } from '../theme/ThemeContext';
import { Colors } from '../constants/colors';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useCurrencyContext } from '../context/CurrencyContext';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useToast } from '../context/ToastContext';
import { formatIzeAmount, toIze } from '../utils/currency';
import {
  buildTradeQuote,
  evaluateTradeSubmit,
  isTradeSubmitEnabled,
  sanitizeTradePriceInput,
  sanitizeTradeQuantityInput,
  CO_OWN_FEE_RATE,
  TradeSide,
} from '../utils/tradeFlow';
import { parseApiError } from '../lib/apiClient';
import { placeCoOwnOrder, fetchCoOwnAssetById, fetchCoOwnHoldings } from '../services/marketApi';
import { AppButton } from '../components/ui/AppButton';
import { AppInput } from '../components/ui/AppInput';
import { AppSegmentControl } from '../components/ui/AppSegmentControl';
import { AppStatusPill } from '../components/ui/AppStatusPill';
import { TradeHeader, TradeCard } from '../components/trade';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { Space, Radius } from '../theme/designTokens';
import { Motion } from '../constants/motion';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useHaptic } from '../hooks/useHaptic';
import { Meta, BodyEmphasis, Body } from '../components/ui/Text';
import { FinancialDisclosure } from '../components/FinancialDisclosure';

type NavT = StackNavigationProp<RootStackParamList>;
type RouteT = RouteProp<RootStackParamList, 'Trade'>;

const TRADE_SIDE_OPTIONS: Array<{ value: TradeSide; label: string; accessibilityLabel: string }> = [
  { value: 'buy', label: 'BUY', accessibilityLabel: 'Buy side' },
  { value: 'sell', label: 'SELL', accessibilityLabel: 'Sell side' },
];

const COMPLIANCE_BLOCK_CODES = new Set([
  'RISK_DISCLOSURE_REQUIRED', 'KYC_REQUIRED', 'KYC_LEVEL_INSUFFICIENT',
  'JURISDICTION_BLOCKED', 'JURISDICTION_RULE_MISSING', 'SANCTIONS_BLOCKED',
  'SANCTIONS_REVIEW_REQUIRED', 'TRADING_DISABLED', 'MAX_ORDER_NOTIONAL_EXCEEDED',
  'MAX_DAILY_NOTIONAL_EXCEEDED', 'MAX_OPEN_ORDERS_EXCEEDED', 'AML_BLOCKED',
]);

function isComplianceBlocked(code: string | null) {
  return !!code && COMPLIANCE_BLOCK_CODES.has(code);
}

export default function TradeScreen() {
  const navigation = useNavigation<NavT>();
  const route = useRoute<RouteT>();
  const { show } = useToast();
  const { isDark } = useAppTheme();
  const reducedMotionEnabled = useReducedMotion();

  const currentUser = useStore((state) => state.currentUser);
  const checkCoOwnEligibility = useStore((state) => state.checkCoOwnEligibility);
  const { goldRates } = useCurrencyContext();
  const { formatFromIze } = useFormattedPrice();

  const [side, setSide] = React.useState<TradeSide>(route.params?.side ?? 'buy');
  const [quantityInput, setQuantityInput] = React.useState('1');
  const [offerPriceInput, setOfferPriceInput] = React.useState('');
  const [isSubmittingOrder, setIsSubmittingOrder] = React.useState(false);

  const [asset, setAsset] = React.useState<any>(null);
  const [yourUnits, setYourUnits] = React.useState(0);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isError, setIsError] = React.useState(false);

  const tradeAssetId = route.params?.assetId;

  React.useEffect(() => {
    if (!tradeAssetId) { setIsLoading(false); setIsError(true); return; }
    let cancelled = false;
    setIsLoading(true);
    setIsError(false);

    Promise.all([
      fetchCoOwnAssetById(tradeAssetId),
      currentUser?.id ? fetchCoOwnHoldings(currentUser.id).catch(() => []) : Promise.resolve([]),
    ])
      .then(([fetchedAsset, holdings]) => {
        if (cancelled) return;
        setAsset(fetchedAsset);
        const holding = holdings.find((h) => h.assetId === tradeAssetId);
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
  }, [tradeAssetId, currentUser?.id, show]);

  const marketPrice = asset ? toIze(asset.unitPriceGbp, 'GBP', goldRates) : 0;
  const orderMode = offerPriceInput.trim().length > 0 ? 'limit' : 'market';

  const quote = React.useMemo(
    () => buildTradeQuote({ orderMode, side, quantityInput, limitPriceInput: offerPriceInput, marketPrice }),
    [marketPrice, offerPriceInput, orderMode, quantityInput, side]
  );

  const eligibility = asset ? checkCoOwnEligibility(asset.settlementMode) : { ok: false, message: 'Asset not found' };

  const canSubmit = isTradeSubmitEnabled({ assetFound: !!asset, eligibility, quote });

  const haptic = useHaptic();

  const handleSubmit = async () => {
    if (isSubmittingOrder) return;

    const decision = evaluateTradeSubmit({
      orderMode, side, quantityInput, limitPriceInput: offerPriceInput, marketPrice,
      assetFound: !!asset, eligibility, maxSellUnits: yourUnits,
    });

    if (!decision.ok) { show(decision.message, 'error'); return; }
    if (!asset) { show('Asset not found', 'error'); return; }

    const feeGbp = quote.grossValue * CO_OWN_FEE_RATE;
    const totalGbp = quote.grossValue + feeGbp;

    haptic.medium();
    navigation.navigate('TradeConfirm', {
      assetId: asset.id,
      side,
      quantity: quote.quantity,
      totalValue: quote.grossValue,
      fee: feeGbp,
      netValue: totalGbp,
      orderMode,
      limitPriceGbp: orderMode === 'limit' && quote.hasLimitPrice ? quote.limitPrice : undefined,
    });
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={Colors.background} />
        <TradeHeader title="Trade" onBack={() => navigation.goBack()} />
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
        <TradeHeader title="Trade" onBack={() => navigation.goBack()} />
        <View style={styles.emptyWrap}>
          <BodyEmphasis style={styles.emptyText}>Asset not found.</BodyEmphasis>
          <AppButton
            title="Back to Hub"
            onPress={() => navigation.navigate('CoOwnHub')}
            variant="secondary"
            style={{ marginTop: Space.md }}
          />
        </View>
      </SafeAreaView>
    );
  }

  const feeGbp = quote.grossValue * CO_OWN_FEE_RATE;
  const totalGbp = quote.grossValue + feeGbp;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={Colors.background} />

      <TradeHeader title={`Trade ${asset.id.toUpperCase()}`} onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(Motion.list.enterDuration)}>
          <AppSegmentControl
            options={TRADE_SIDE_OPTIONS}
            value={side}
            onChange={setSide}
            fullWidth
            style={styles.sideSwitcher}
          />
        </Reanimated.View>

        {!eligibility.ok && (
          <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(Motion.list.enterDuration).delay(50)}>
            <TradeCard variant="tint" style={styles.alertCard}>
              <View style={styles.alertRow}>
                <Ionicons name="warning-outline" size={16} color={Colors.danger} />
                <BodyEmphasis style={styles.alertTitle}>Trading Restricted</BodyEmphasis>
              </View>
              <Body style={styles.alertText}>{eligibility.message}</Body>
            </TradeCard>
          </Reanimated.View>
        )}

        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(Motion.list.enterDuration).delay(100)}>
          <TradeCard>
            <Meta style={styles.sectionLabel}>QUANTITY</Meta>
            <AppInput
              value={quantityInput}
              onChangeText={(v) => setQuantityInput(sanitizeTradeQuantityInput(v))}
              keyboardType="number-pad"
              placeholder="1"
              suffix="units"
              accessibilityLabel="Trade quantity"
            />
          </TradeCard>
        </Reanimated.View>

        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(Motion.list.enterDuration).delay(150)}>
          <TradeCard>
            <View style={styles.limitRow}>
              <Meta style={styles.sectionLabel}>LIMIT PRICE (OPTIONAL)</Meta>
              <AppStatusPill
                tone="neutral"
                label={orderMode === 'limit' ? 'LIMIT' : 'MARKET'}
                size="sm"
              />
            </View>
            <AppInput
              value={offerPriceInput}
              onChangeText={(v) => setOfferPriceInput(sanitizeTradePriceInput(v))}
              keyboardType="decimal-pad"
              placeholder={`Market: ${formatFromIze(marketPrice)}`}
              accessibilityLabel="Limit price"
            />
            <Meta style={styles.marketHint}>
              {orderMode === 'market'
                ? `Market price: ${formatFromIze(marketPrice)} per unit`
                : `Limit order at ${formatFromIze(quote.limitPrice ?? 0)} per unit`}
            </Meta>
          </TradeCard>
        </Reanimated.View>

        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(Motion.list.enterDuration).delay(200)}>
          <TradeCard variant="tint">
            <Meta style={styles.sectionLabel}>QUOTE</Meta>
            <View style={styles.quoteRow}>
              <Meta>Notional</Meta>
              <BodyEmphasis>{formatFromIze(toIze(quote.grossValue, 'GBP', goldRates))}</BodyEmphasis>
            </View>
            <View style={styles.quoteRow}>
              <Meta>Fee ({(CO_OWN_FEE_RATE * 100).toFixed(1)}%)</Meta>
              <Body>{formatFromIze(feeGbp)}</Body>
            </View>
            <View style={[styles.quoteRow, styles.totalRow]}>
              <BodyEmphasis>Total</BodyEmphasis>
              <BodyEmphasis style={{ color: Colors.brand }}>{formatFromIze(totalGbp)}</BodyEmphasis>
            </View>
          </TradeCard>
        </Reanimated.View>

        {yourUnits > 0 && (
          <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(Motion.list.enterDuration).delay(250)}>
            <TradeCard variant="surface">
              <Meta style={styles.sectionLabel}>YOUR POSITION</Meta>
              <View style={styles.positionRow}>
                <Meta>Units held</Meta>
                <BodyEmphasis>{yourUnits}</BodyEmphasis>
              </View>
            </TradeCard>
          </Reanimated.View>
        )}

        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(Motion.list.enterDuration).delay(300)}>
          <FinancialDisclosure />
        </Reanimated.View>

        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(Motion.list.enterDuration).delay(350)}>
          <AppButton
            title={isSubmittingOrder ? 'Submitting...' : side === 'buy' ? 'Buy Units' : 'Sell Units'}
            icon={<Ionicons name={side === 'buy' ? 'arrow-down-circle-outline' : 'arrow-up-circle-outline'} size={18} color={Colors.background} />}
            onPress={handleSubmit}
            disabled={!canSubmit || isSubmittingOrder}
            variant="primary"
            size="lg"
            style={styles.submitBtn}
            hapticFeedback="medium"
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
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.md,
  },
  emptyText: {
    color: Colors.textSecondary,
  },
  content: {
    paddingBottom: Space.xl,
  },
  sideSwitcher: {
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
  },
  alertCard: {
    borderColor: Colors.danger + '40',
  },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    marginBottom: Space.xs,
  },
  alertTitle: {
    color: Colors.danger,
  },
  alertText: {
    color: Colors.textSecondary,
  },
  sectionLabel: {
    marginBottom: Space.sm,
  },
  limitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Space.xs,
  },
  marketHint: {
    marginTop: Space.xs,
  },
  quoteRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    marginTop: Space.xs,
    paddingTop: Space.sm,
  },
  positionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  submitBtn: {
    marginHorizontal: Space.md,
    marginTop: Space.lg,
  },
});
