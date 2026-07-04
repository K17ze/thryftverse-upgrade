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
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useToast } from '../context/ToastContext';
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
import { fetchCoOwnAssetById, fetchCoOwnHoldings } from '../services/marketApi';
import { AppButton } from '../components/ui/AppButton';
import { AppInput } from '../components/ui/AppInput';
import { AppSegmentControl } from '../components/ui/AppSegmentControl';
import { AppStatusPill } from '../components/ui/AppStatusPill';
import { TradeHeader } from '../components/trade';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { Space, Radius, Typography } from '../theme/designTokens';
import { Motion } from '../constants/motion';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useHaptic } from '../hooks/useHaptic';
import { Meta, BodyEmphasis, Body } from '../components/ui/Text';
import { FinancialDisclosure } from '../components/FinancialDisclosure';
import { CachedImage } from '../components/CachedImage';

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
  const { formatFromFiat } = useFormattedPrice();

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

  const marketPrice = asset ? asset.unitPriceGbp : 0;
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

    haptic.medium();
    navigation.navigate('TradeConfirm', {
      assetId: asset.id,
      assetTitle: asset.title,
      assetImageUrl: asset.imageUrl,
      side,
      quantity: quote.quantity,
      totalValue: quote.grossValue,
      fee: quote.fee,
      netValue: quote.netValue,
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

  const availableUnits = Math.max(0, asset.availableUnits);
  const sellableUnits = side === 'sell' ? yourUnits : availableUnits;
  const maxUnits = side === 'sell' ? yourUnits : availableUnits;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={Colors.background} />

      <TradeHeader title={side === 'buy' ? 'Buy units' : 'Sell units'} onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* ── Product identity ── */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(Motion.list.enterDuration)}>
          <View style={styles.productCard}>
            {asset.imageUrl ? (
              <CachedImage uri={asset.imageUrl} style={styles.productImage} contentFit="cover" />
            ) : (
              <View style={[styles.productImage, styles.productImageFallback]}>
                <Ionicons name="cube-outline" size={24} color={Colors.textMuted} />
              </View>
            )}
            <View style={styles.productInfo}>
              <BodyEmphasis style={styles.productTitle} numberOfLines={2}>{asset.title}</BodyEmphasis>
              <View style={styles.productPriceRow}>
                <Meta style={styles.productPriceLabel}>Unit price</Meta>
                <BodyEmphasis style={styles.productPriceValue}>{formatFromFiat(asset.unitPriceGbp, 'GBP')}</BodyEmphasis>
              </View>
              <View style={styles.productPriceRow}>
                <Meta style={styles.productPriceLabel}>Settlement</Meta>
                <Meta style={styles.productPriceValue}>{asset.settlementMode}</Meta>
              </View>
            </View>
          </View>
        </Reanimated.View>

        {/* ── Buy/Sell selector ── */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(Motion.list.enterDuration).delay(50)}>
          <AppSegmentControl
            options={TRADE_SIDE_OPTIONS}
            value={side}
            onChange={setSide}
            fullWidth
            style={styles.sideSwitcher}
          />
        </Reanimated.View>

        {/* ── Compliance alert ── */}
        {!eligibility.ok && (
          <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(Motion.list.enterDuration).delay(60)}>
            <View style={styles.alertCard}>
              <View style={styles.alertRow}>
                <Ionicons name="warning-outline" size={16} color={Colors.danger} />
                <BodyEmphasis style={styles.alertTitle}>Trading Restricted</BodyEmphasis>
              </View>
              <Body style={styles.alertText}>{eligibility.message}</Body>
            </View>
          </Reanimated.View>
        )}

        {/* ── Available/sellable units ── */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(Motion.list.enterDuration).delay(80)}>
          <View style={styles.availabilityCard}>
            <View style={styles.availabilityRow}>
              <Meta style={styles.availabilityLabel}>
                {side === 'buy' ? 'Available units' : 'Your units'}
              </Meta>
              <BodyEmphasis style={styles.availabilityValue}>
                {side === 'buy' ? availableUnits : yourUnits} / {asset.totalUnits}
              </BodyEmphasis>
            </View>
            {side === 'sell' && yourUnits === 0 && (
              <Body style={styles.availabilityHint}>
                You do not hold any units in this Co-Own.
              </Body>
            )}
            {side === 'buy' && availableUnits === 0 && (
              <Body style={styles.availabilityHint}>
                All units are allocated. Check the secondary market for sell offers.
              </Body>
            )}
          </View>
        </Reanimated.View>

        {/* ── Unit selector ── */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(Motion.list.enterDuration).delay(100)}>
          <View style={styles.sectionCard}>
            <Meta style={styles.sectionLabel}>Quantity</Meta>
            <AppInput
              value={quantityInput}
              onChangeText={(v) => setQuantityInput(sanitizeTradeQuantityInput(v))}
              keyboardType="number-pad"
              placeholder="1"
              suffix="units"
              accessibilityLabel="Trade quantity"
            />
            {maxUnits > 0 && (
              <AnimatedPressable
                onPress={() => setQuantityInput(String(maxUnits))}
                accessibilityRole="button"
                accessibilityLabel={`Set quantity to maximum ${maxUnits} units`}
              >
                <Meta style={styles.maxLink}>Max: {maxUnits}</Meta>
              </AnimatedPressable>
            )}
          </View>
        </Reanimated.View>

        {/* ── Limit price (optional) ── */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(Motion.list.enterDuration).delay(150)}>
          <View style={styles.sectionCard}>
            <View style={styles.limitRow}>
              <Meta style={styles.sectionLabel}>Limit price (optional)</Meta>
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
              placeholder={`Market: ${formatFromFiat(marketPrice, 'GBP')}`}
              accessibilityLabel="Limit price"
            />
            <Meta style={styles.marketHint}>
              {orderMode === 'market'
                ? `Market price: ${formatFromFiat(marketPrice, 'GBP')} per unit`
                : `Limit order at ${formatFromFiat(quote.limitPrice ?? 0, 'GBP')} per unit`}
            </Meta>
          </View>
        </Reanimated.View>

        {/* ── Quote summary ── */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(Motion.list.enterDuration).delay(200)}>
          <View style={styles.quoteCard}>
            <Meta style={styles.sectionLabel}>Summary</Meta>
            <View style={styles.quoteRow}>
              <Meta>{side === 'buy' ? 'Gross cost' : 'Gross proceeds'}</Meta>
              <BodyEmphasis>{formatFromFiat(quote.grossValue, 'GBP')}</BodyEmphasis>
            </View>
            <View style={styles.quoteRow}>
              <Meta>Fee ({(CO_OWN_FEE_RATE * 100).toFixed(1)}%)</Meta>
              <Body>{formatFromFiat(quote.fee, 'GBP')}</Body>
            </View>
            <View style={[styles.quoteRow, styles.totalRow]}>
              <BodyEmphasis>{side === 'buy' ? 'Total cost' : 'Net proceeds'}</BodyEmphasis>
              <BodyEmphasis style={{ color: Colors.brand }}>{formatFromFiat(quote.netValue, 'GBP')}</BodyEmphasis>
            </View>
          </View>
        </Reanimated.View>

        {/* ── Risk disclosure ── */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(Motion.list.enterDuration).delay(250)}>
          <FinancialDisclosure />
        </Reanimated.View>

        {/* ── Review action ── */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(Motion.list.enterDuration).delay(300)}>
          <AppButton
            title="Review order"
            icon={<Ionicons name="arrow-forward" size={18} color={Colors.background} />}
            onPress={handleSubmit}
            disabled={!canSubmit || isSubmittingOrder}
            variant="primary"
            size="lg"
            style={styles.submitBtn}
            hapticFeedback="medium"
            accessibilityLabel={`Review ${side} order`}
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
    paddingBottom: Space.xxl,
  },
  // Product identity
  productCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Space.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  productImage: {
    width: 64,
    height: 64,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceAlt,
  },
  productImageFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  productInfo: {
    flex: 1,
    gap: 4,
  },
  productTitle: {
    fontSize: 15,
    lineHeight: 20,
  },
  productPriceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  productPriceLabel: {
    color: Colors.textSecondary,
  },
  productPriceValue: {
    color: Colors.textPrimary,
  },
  // Side switcher
  sideSwitcher: {
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
  },
  // Alert
  alertCard: {
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Space.md,
    borderWidth: 1,
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
  // Availability
  availabilityCard: {
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Space.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  availabilityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  availabilityLabel: {
    color: Colors.textSecondary,
  },
  availabilityValue: {
    fontSize: 16,
  },
  availabilityHint: {
    color: Colors.textMuted,
    marginTop: Space.xs,
    fontSize: 13,
  },
  // Section card
  sectionCard: {
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Space.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sectionLabel: {
    marginBottom: Space.sm,
    color: Colors.textSecondary,
  },
  limitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Space.sm,
  },
  marketHint: {
    marginTop: Space.xs,
    color: Colors.textMuted,
  },
  maxLink: {
    color: Colors.brand,
    marginTop: Space.xs,
    fontWeight: '600',
  },
  // Quote
  quoteCard: {
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Space.md,
    borderWidth: 1,
    borderColor: Colors.border,
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
  // Submit
  submitBtn: {
    marginHorizontal: Space.md,
    marginTop: Space.lg,
  },
});
