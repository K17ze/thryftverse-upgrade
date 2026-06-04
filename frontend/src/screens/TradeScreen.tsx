import React from 'react';
import { View, StyleSheet, StatusBar, ScrollView } from 'react-native';
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
import { placeCoOwnOrder } from '../services/marketApi';
import { AppButton } from '../components/ui/AppButton';
import { GlassCard } from '../components/ui/GlassSurface';
import { AppInput } from '../components/ui/AppInput';
import { AppSegmentControl } from '../components/ui/AppSegmentControl';
import { AppStatusPill } from '../components/ui/AppStatusPill';
import { TradeHeader, TradeCard } from '../components/trade';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { Space, Radius } from '../theme/designTokens';
import { Motion } from '../constants/motion';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { Meta, BodyEmphasis, Body } from '../components/ui/Text';

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
  const reducedMotionEnabled = useReducedMotion();

  const customCoOwns = useStore((state) => state.customCoOwns);
  const coOwnRuntime = useStore((state) => state.coOwnRuntime);
  const currentUser = useStore((state) => state.currentUser);
  const checkCoOwnEligibility = useStore((state) => state.checkCoOwnEligibility);
  const { goldRates } = useCurrencyContext();
  const { formatFromIze } = useFormattedPrice();

  const [side, setSide] = React.useState<TradeSide>(route.params?.side ?? 'buy');
  const [quantityInput, setQuantityInput] = React.useState('1');
  const [offerPriceInput, setOfferPriceInput] = React.useState('');
  const [isSubmittingOrder, setIsSubmittingOrder] = React.useState(false);

  const baseAssets = React.useMemo(() => getCoOwnMarket(customCoOwns), [customCoOwns]);
  const marketAssets = React.useMemo(
    () => baseAssets.map((asset) => resolveAssetMarketState(asset, coOwnRuntime[asset.id])),
    [baseAssets, coOwnRuntime]
  );

  const tradeAssetId = route.params?.assetId;
  const asset = tradeAssetId ? marketAssets.find((item) => item.id === tradeAssetId) : undefined;
  const marketPrice = asset ? toIze(asset.unitPriceGBP, 'GBP', goldRates) : 0;
  const orderMode = offerPriceInput.trim().length > 0 ? 'limit' : 'market';

  const quote = React.useMemo(
    () => buildTradeQuote({ orderMode, side, quantityInput, limitPriceInput: offerPriceInput, marketPrice }),
    [marketPrice, offerPriceInput, orderMode, quantityInput, side]
  );

  const eligibility = asset ? checkCoOwnEligibility(asset.settlementMode) : { ok: false, message: 'Asset not found' };

  const canSubmit = isTradeSubmitEnabled({ assetFound: !!asset, eligibility, quote });

  const handleSubmit = async () => {
    if (isSubmittingOrder) return;

    const decision = evaluateTradeSubmit({
      orderMode, side, quantityInput, limitPriceInput: offerPriceInput, marketPrice,
      assetFound: !!asset, eligibility, maxSellUnits: asset?.yourUnits ?? 0,
    });

    if (!decision.ok) { show(decision.message, 'error'); return; }
    const expectedQueue = decision.kind === 'queue';
    if (!asset) { show('Asset not found', 'error'); return; }

    setIsSubmittingOrder(true);
    try {
      const actingUserId = currentUser?.id ?? 'u1';
      let remoteOrder: Awaited<ReturnType<typeof placeCoOwnOrder>> | null = null;

      try {
        remoteOrder = await placeCoOwnOrder(asset.id, {
          userId: actingUserId, side, units: quote.quantity,
          orderType: orderMode,
          limitPriceGbp: orderMode === 'limit' && quote.hasLimitPrice ? quote.limitPrice : undefined,
        });
      } catch (error) {
        const parsedError = parseApiError(error, 'Unable to submit order');
        if (!parsedError.isNetworkError) {
          if (isComplianceBlocked(parsedError.code)) { show(parsedError.message, 'error'); return; }
          show(parsedError.message, parsedError.status && parsedError.status >= 500 ? 'error' : 'info');
          return;
        }
        show('Trading engine unavailable. Please retry once connection is restored.', 'error');
        return;
      }

      if (remoteOrder) {
        if (remoteOrder.order.status === 'rejected') { show('Order rejected by matching engine.', 'error'); return; }
        if (remoteOrder.order.status === 'open' || remoteOrder.order.status === 'partially_filled' || expectedQueue) {
          show('Offer placed on the server order book.', 'info');
        } else {
          show('Order executed on CO-OWN engine.', 'success');
        }
        if (remoteOrder.aml?.alertId) show('Trade is flagged for AML review.', 'info');
        navigation.goBack();
      }
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  if (!asset) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={Colors.background} />
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
      <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={Colors.background} />

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

        {asset.yourUnits > 0 && (
          <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(Motion.list.enterDuration).delay(250)}>
            <TradeCard variant="surface">
              <Meta style={styles.sectionLabel}>YOUR POSITION</Meta>
              <View style={styles.positionRow}>
                <Meta>Units held</Meta>
                <BodyEmphasis>{asset.yourUnits}</BodyEmphasis>
              </View>
              <View style={styles.positionRow}>
                <Meta>Avg entry</Meta>
                <Body>{formatFromIze(toIze(asset.avgEntryPriceGBP ?? asset.unitPriceGBP, 'GBP', goldRates))}</Body>
              </View>
            </TradeCard>
          </Reanimated.View>
        )}

        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(Motion.list.enterDuration).delay(300)}>
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
