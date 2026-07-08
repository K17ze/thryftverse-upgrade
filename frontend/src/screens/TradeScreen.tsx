import React from 'react';
import { View, Text, StyleSheet, StatusBar, ScrollView, useWindowDimensions, KeyboardAvoidingView, Platform, Keyboard } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { useAppTheme } from '../theme/ThemeContext';
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
import { AnimatedPressable } from '../components/AnimatedPressable';
import { Space, Radius, Type, Typography, DockConstants } from '../theme/designTokens';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useHaptic } from '../hooks/useHaptic';
import { haptics } from '../utils/haptics';
import {
  CoOwnMarketHeader,
  CoOwnTradeComposer,
  CoOwnTradeSkeleton,
  CoOwnStateCanvas,
  CoOwnStickyActionDock,
  CoOwnRiskDisclosure,
} from '../components/coown';

type NavT = StackNavigationProp<RootStackParamList>;
type RouteT = RouteProp<RootStackParamList, 'Trade'>;

const TRADE_SIDE_OPTIONS: Array<{ value: TradeSide; label: string; accessibilityLabel: string }> = [
  { value: 'buy', label: 'Buy', accessibilityLabel: 'Buy side' },
  { value: 'sell', label: 'Sell', accessibilityLabel: 'Sell side' },
];

export default function TradeScreen() {
  const navigation = useNavigation<NavT>();
  const route = useRoute<RouteT>();
  const { colors, isDark } = useAppTheme();
  const { show } = useToast();
  const reducedMotionEnabled = useReducedMotion();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const isCompact = screenWidth < 360;
  const scrollBottomPadding = Math.max(insets.bottom, Space.md) + DockConstants.singleActionHeight;

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

  const handleBack = React.useCallback(() => {
    if (navigation.canGoBack()) { navigation.goBack(); return; }
    navigation.navigate('AssetDetail', { assetId: tradeAssetId ?? '' });
  }, [navigation, tradeAssetId]);

  // ── Loading state ──
  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <CoOwnMarketHeader
          title="Trade"
          subtitle="Buy or sell Co-Own units"
          onBack={handleBack}
        />
        <CoOwnTradeSkeleton />
      </SafeAreaView>
    );
  }

  // ── Error state ──
  if (isError || !asset) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <CoOwnMarketHeader
          title="Trade"
          subtitle="Buy or sell Co-Own units"
          onBack={handleBack}
        />
        <CoOwnStateCanvas
          variant="error"
          title="Item not found"
          subtitle="This Co-Own item may have been delisted."
          actionLabel="Back to Co-Own"
          onAction={() => navigation.navigate('CoOwnHub')}
        />
      </SafeAreaView>
    );
  }

  const availableUnits = Math.max(0, asset.availableUnits);
  const sellableUnits = side === 'sell' ? yourUnits : availableUnits;
  const maxUnits = side === 'sell' ? yourUnits : availableUnits;
  const settlementLabel = asset.settlementMode === 'GBP' ? 'GBP' : asset.settlementMode === 'TVUSD' ? 'TVUSD' : 'GBP + TVUSD';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      <CoOwnMarketHeader
        title={side === 'buy' ? 'Buy units' : 'Sell units'}
        subtitle={asset.title}
        onBack={handleBack}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: scrollBottomPadding }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={Keyboard.dismiss}
      >
        {/* Buy/Sell selector */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)}>
          <AppSegmentControl
            options={TRADE_SIDE_OPTIONS}
            value={side}
            onChange={(v) => { setSide(v); haptics.selection(); }}
            fullWidth
            style={styles.sideSwitcher}
          />
        </Reanimated.View>

        {/* Compliance alert */}
        {!eligibility.ok && (
          <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(60)}>
            <View style={[styles.alertCard, { backgroundColor: colors.danger + '12', borderColor: colors.danger + '40' }]}>
              <View style={styles.alertRow}>
                <Ionicons name="warning-outline" size={16} color={colors.danger} />
                <Text style={[styles.alertTitle, { color: colors.danger }]}>Trading restricted</Text>
              </View>
              <Text style={[styles.alertText, { color: colors.textSecondary }]}>{eligibility.message}</Text>
            </View>
          </Reanimated.View>
        )}

        {/* Trade composer — product identity, availability, quote */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(80)}>
          <CoOwnTradeComposer
            imageUri={asset.imageUrl}
            title={asset.title}
            side={side}
            mode={orderMode}
            units={quote.quantity}
            unitPriceLabel={formatFromFiat(marketPrice, 'GBP')}
            grossLabel={formatFromFiat(quote.grossValue, 'GBP')}
            feeLabel={formatFromFiat(quote.fee, 'GBP')}
            totalLabel={formatFromFiat(quote.netValue, 'GBP')}
            totalCaption={side === 'buy' ? 'Including 1% fee' : 'After 1% fee'}
            settlementLabel={settlementLabel}
            availableUnits={availableUnits}
            sellableUnits={yourUnits}
            maxUnits={maxUnits}
          />
        </Reanimated.View>

        {/* Quantity selector */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(120)}>
          <View style={[styles.inputCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Quantity</Text>
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
                onPress={() => { haptics.tap(); setQuantityInput(String(maxUnits)); }}
                accessibilityRole="button"
                accessibilityLabel={`Set quantity to maximum ${maxUnits} units`}
                scaleValue={0.96}
                hapticFeedback="light"
              >
                <Text style={[styles.maxLink, { color: colors.textSecondary }]}>Max: {maxUnits}</Text>
              </AnimatedPressable>
            )}
          </View>
        </Reanimated.View>

        {/* Limit price (optional) */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(160)}>
          <View style={[styles.inputCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.limitRow}>
              <Text style={[styles.inputLabel, { color: colors.textMuted }]} numberOfLines={1}>Limit price (optional)</Text>
              <View style={[styles.modePill, { backgroundColor: orderMode === 'limit' ? colors.brand : colors.surfaceAlt }]}>
                <Text style={[styles.modePillText, { color: orderMode === 'limit' ? colors.background : colors.textSecondary }]} numberOfLines={1}>
                  {orderMode === 'limit' ? 'LIMIT' : 'MARKET'}
                </Text>
              </View>
            </View>
            <AppInput
              value={offerPriceInput}
              onChangeText={(v) => setOfferPriceInput(sanitizeTradePriceInput(v))}
              keyboardType="decimal-pad"
              placeholder={`Market: ${formatFromFiat(marketPrice, 'GBP')}`}
              accessibilityLabel="Limit price"
            />
            <Text style={[styles.marketHint, { color: colors.textMuted }]} numberOfLines={2}>
              {orderMode === 'market'
                ? `Market price: ${formatFromFiat(marketPrice, 'GBP')} per unit`
                : `Limit order at ${formatFromFiat(quote.limitPrice ?? 0, 'GBP')} per unit`}
            </Text>
          </View>
        </Reanimated.View>

        {/* Risk disclosure */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(200)}>
          <CoOwnRiskDisclosure />
        </Reanimated.View>
      </ScrollView>
      </KeyboardAvoidingView>

      {/* Sticky action dock */}
      <CoOwnStickyActionDock>
        <AppButton
          title="Review order"
          icon={<Ionicons name="arrow-forward" size={18} color={colors.background} />}
          onPress={handleSubmit}
          disabled={!canSubmit || isSubmittingOrder}
          variant="primary"
          size="lg"
          hapticFeedback="medium"
          accessibilityLabel={`Review ${side} order`}
          style={styles.submitBtn}
        />
      </CoOwnStickyActionDock>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
  },
  sideSwitcher: {
    marginBottom: Space.md,
  },
  alertCard: {
    borderRadius: Radius.lg,
    padding: Space.md,
    borderWidth: 1,
    marginBottom: Space.md,
  },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    marginBottom: Space.xs,
    minWidth: 0,
    flexShrink: 1,
  },
  alertTitle: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
    flexShrink: 1,
    minWidth: 0,
  },
  alertText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    lineHeight: 20,
  },
  inputCard: {
    borderRadius: Radius.lg,
    borderWidth: 0.5,
    padding: Space.md,
    gap: Space.sm,
    marginBottom: Space.md,
  },
  inputLabel: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.medium,
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  limitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minWidth: 0,
    gap: Space.sm,
  },
  modePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
    flexShrink: 0,
  },
  modePillText: {
    fontSize: 10,
    fontFamily: Typography.family.bold,
    letterSpacing: 0.4,
  },
  maxLink: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    alignSelf: 'flex-start',
  },
  marketHint: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
  },
  submitBtn: {
    flex: 1,
  },
});
