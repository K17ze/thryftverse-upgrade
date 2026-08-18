import React from 'react';
import { View, Text, StyleSheet, Keyboard } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppTheme } from '../theme/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import {
  buildTradeQuote,
  evaluateTradeSubmit,
  isTradeSubmitEnabled,
  getTradeSubmitDisabledReason,
  sanitizeTradePriceInput,
  sanitizeTradeQuantityInput,
  CO_OWN_FEE_RATE,
  TradeSide,
  computeReservation,
  estimateFill,
  computeDepthWithinBand,
  DEFAULT_FEE_SCHEDULE,
} from '../utils/tradeFlow';
import { parseApiError } from '../lib/apiClient';
import {
  fetchCoOwnAssetById,
  fetchCoOwnHoldings,
  fetchCoOwnOrderBook,
  previewCoOwnOrder,
  reserveCoOwnOrder,
  type CoOwnOrderBookSnapshot,
} from '../services/marketApi';
import { AppButton } from '../components/ui/AppButton';
import { AppInput } from '../components/ui/AppInput';
import { AppSegmentControl } from '../components/ui/AppSegmentControl';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { Space, FontFamily, DockConstants, LetterSpacing, Numeric } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { RadiusRoleValue } from '../theme/surfaceRadiusRules';
import { useHaptic } from '../hooks/useHaptic';
import { useBreakpoint } from '../hooks/useBreakpoint';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import {
  CoOwnTradeComposer,
  CoOwnTradeSkeleton,
  CoOwnStateCanvas,
  CoOwnStickyActionDock,
  CoOwnRiskDisclosure,
  CoOwnConciergeCTA,
  CoOwnOfflineBanner,
  CoOwnReconciliationBanner,
  CoOwnValueStrip,
  CANONICAL_RIGHTS_LABELS,
  type CoOwnRightsRow,
  type CoOwnTicketOrderType,
  type CoOwnTicketDuration,
} from '../components/coown';
import { CoOwnNumericText } from '../components/ui/CoOwnNumericText';
import { KeyboardAwareScrollView } from '../platform/keyboard/KeyboardProvider';
import { useConnectivity } from '../hooks/useConnectivity';
import { formatCoOwnIze } from '../utils/currency';

type NavT = NativeStackNavigationProp<RootStackParamList>;
type RouteT = RouteProp<RootStackParamList, 'Trade'>;

const TRADE_SIDE_OPTIONS: Array<{ value: TradeSide; label: string; accessibilityLabel: string }> = [
  { value: 'buy', label: 'Buy', accessibilityLabel: 'Buy side' },
  { value: 'sell', label: 'Sell', accessibilityLabel: 'Sell side' },
];

// Phase 2.5: order-type selector options
const ORDER_TYPE_OPTIONS: Array<{ value: CoOwnTicketOrderType; label: string; accessibilityLabel: string }> = [
  { value: 'protected_instant', label: 'Protected instant', accessibilityLabel: 'Protected instant — marketable limit with visible protection price' },
  { value: 'limit', label: 'Limit', accessibilityLabel: 'Limit — resting order' },
];

export default function TradeScreen() {
  const navigation = useNavigation<NavT>();
  const route = useRoute<RouteT>();
  const { colors } = useAppTheme();
  const { show } = useToast();
  const insets = useSafeAreaInsets();
  const { isVeryCompact: isCompact } = useBreakpoint();
  const scrollBottomPadding = Math.max(insets.bottom, Space.md) + DockConstants.singleActionHeight;
  const { isOffline } = useConnectivity();

  const currentUser = useStore((state) => state.currentUser);
  const checkCoOwnEligibility = useStore((state) => state.checkCoOwnEligibility);

  const [side, setSide] = React.useState<TradeSide>(route.params?.side ?? 'buy');
  const [quantityInput, setQuantityInput] = React.useState('1');
  const [offerPriceInput, setOfferPriceInput] = React.useState(
    route.params?.limitPrice ? String(route.params.limitPrice) : ''
  );
  const [isSubmittingOrder, setIsSubmittingOrder] = React.useState(false);
  // Phase 2.5: exchange-grade order type + duration
  const [ticketOrderType, setTicketOrderType] = React.useState<CoOwnTicketOrderType>('protected_instant');
  const [ticketDuration, setTicketDuration] = React.useState<CoOwnTicketDuration>('GFD');

  const [asset, setAsset] = React.useState<any>(null);
  const [yourUnits, setYourUnits] = React.useState(0);
  const [orderBook, setOrderBook] = React.useState<CoOwnOrderBookSnapshot | null>(null);
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
      fetchCoOwnOrderBook(tradeAssetId, { limit: 40 }),
    ])
      .then(([fetchedAsset, holdings, fetchedOrderBook]) => {
        if (cancelled) return;
        setAsset(fetchedAsset);
        setOrderBook(fetchedOrderBook);
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
  const orderMode = 'limit' as const;
  const bestBid = orderBook?.bids[0]?.unitPriceGbp ?? 0;
  const bestAsk = orderBook?.asks[0]?.unitPriceGbp ?? 0;
  const protectedReferencePrice = side === 'buy' ? bestAsk : bestBid;
  const protectedLimitPrice = protectedReferencePrice > 0
    ? Number((protectedReferencePrice * (side === 'buy' ? 1.02 : 0.98)).toFixed(4))
    : 0;
  const enteredLimitPrice = Number(offerPriceInput);
  const effectiveLimitPrice = ticketOrderType === 'protected_instant'
    ? protectedLimitPrice
    : Number.isFinite(enteredLimitPrice) ? enteredLimitPrice : 0;

  // Spec 10 §9.3: "TBC only for prelaunch preview; blocks trading on live."
  // If any rights row is TBC, trading is blocked — even if navigated directly.
  const hasIncompleteRights = React.useMemo(() => {
    if (!asset) return false;
    const rightsRows = CANONICAL_RIGHTS_LABELS.map((label) => {
      const row = (asset.rightsRows as CoOwnRightsRow[] | undefined)?.find((r) => r.label === label);
      return row ?? { label, answer: 'To be confirmed', isTbc: true };
    });
    return rightsRows.some((r) => r.isTbc);
  }, [asset]);

  const quote = React.useMemo(
    () => buildTradeQuote({
      orderMode,
      side,
      quantityInput,
      limitPriceInput: effectiveLimitPrice > 0 ? String(effectiveLimitPrice) : '',
      marketPrice,
    }),
    [effectiveLimitPrice, marketPrice, quantityInput, side]
  );

  const visibleBook = React.useMemo(() => ({
    bids: (orderBook?.bids ?? []).map((level) => ({ price: level.unitPriceGbp, size: level.units })),
    asks: (orderBook?.asks ?? []).map((level) => ({ price: level.unitPriceGbp, size: level.units })),
  }), [orderBook]);

  const protectionPrice = quote.hasLimitPrice ? quote.limitPrice : 0;

  const reservation = React.useMemo(
    () => computeReservation(side, quote.quantity, protectionPrice, DEFAULT_FEE_SCHEDULE, 0),
    [side, quote.quantity, protectionPrice]
  );

  const fillEstimate = React.useMemo(
    () => estimateFill(side, quote.quantity, visibleBook),
    [side, quote.quantity, visibleBook]
  );

  const depthContext = React.useMemo(() => {
    const { depthUnits, midPrice } = computeDepthWithinBand(side, visibleBook);
    return {
      orderUnits: quote.quantity,
      depthUnits,
      slippageBeyondDepth: fillEstimate.slippageBeyondDepth,
      midPrice,
    };
  }, [side, visibleBook, quote.quantity, fillEstimate.slippageBeyondDepth]);

  const postTradePreview = React.useMemo(() => {
    const unitsAfter = side === 'buy' ? yourUnits + quote.quantity : yourUnits - quote.quantity;
    const outstandingUnits = asset?.totalUnits ?? 0;
    const ownershipPct = outstandingUnits > 0 ? (unitsAfter / outstandingUnits) * 100 : 0;
    return { unitsAfter, ownershipPct, outstandingUnits };
  }, [side, quote.quantity, yourUnits, asset?.totalUnits]);

  const eligibility = asset ? checkCoOwnEligibility(asset.settlementMode) : { ok: false, message: 'Asset not found' };
  const marketIsAuthoritative = orderBook?.source === 'live'
    && orderBook.reconciliationState === 'reconciled'
    && Boolean(orderBook.serverTimestamp);
  const canSubmit = isTradeSubmitEnabled({ assetFound: !!asset, eligibility, quote })
    && !hasIncompleteRights
    && marketIsAuthoritative
    && !isOffline;
  const submitDisabledReason = React.useMemo(() => {
    const tradeReason = getTradeSubmitDisabledReason({ assetFound: !!asset, eligibility, quote, hasIncompleteRights });
    if (tradeReason) return tradeReason;
    if (isOffline) return 'Reconnect to review this order';
    if (orderBook?.source !== 'live') return 'Live market data is unavailable';
    if (orderBook.reconciliationState !== 'reconciled') return 'Market reconciliation is in progress';
    if (!orderBook.serverTimestamp) return 'Market timestamp is unavailable';
    return null;
  }, [asset, eligibility, hasIncompleteRights, isOffline, orderBook, quote]);

  // Thin market: no opposite side → substitute "Review order" with "Request quote"
  const isThinMarket = (side === 'buy' && visibleBook.asks.length === 0)
    || (side === 'sell' && visibleBook.bids.length === 0);

  const haptic = useHaptic();

  const handleSubmit = async () => {
    if (isSubmittingOrder) return;

    const decision = evaluateTradeSubmit({
      orderMode, side, quantityInput, limitPriceInput: String(effectiveLimitPrice), marketPrice,
      assetFound: !!asset, eligibility, maxSellUnits: yourUnits,
    });

    if (!decision.ok) { show(decision.message, 'error'); return; }
    if (!asset) { show('Asset not found', 'error'); return; }

    if (!currentUser?.id) { show('Sign in is required to trade.', 'error'); return; }
    if (!marketIsAuthoritative || !orderBook) {
      show('Live market data is unavailable. Trading remains paused.', 'error');
      return;
    }

    setIsSubmittingOrder(true);
    try {
      const command = {
        userId: currentUser.id,
        side,
        units: quote.quantity,
        orderType: orderMode,
        limitPriceGbp: effectiveLimitPrice,
      } as const;
      const previewResponse = await previewCoOwnOrder(asset.id, command);
      const preview = previewResponse.preview;
      if (!preview.eligibility.allowed) {
        show(preview.eligibility.message || 'This order is not eligible.', 'error');
        return;
      }
      const reservationResponse = await reserveCoOwnOrder(asset.id, {
        ...command,
        idempotencyKey: `reserve_${currentUser.id}_${asset.id}_${Date.now()}`,
      });
      const reserved = reservationResponse.reservation;
      haptic.medium();
      navigation.navigate('TradeConfirm', {
        assetId: asset.id,
        assetTitle: asset.title,
        assetImageUrl: asset.imageUrl,
        side,
        quantity: quote.quantity,
        totalValue: preview.estimatedFill.grossNotional,
        fee: preview.fee,
        netValue: preview.total,
        orderMode,
        ticketOrderType,
        limitPriceGbp: effectiveLimitPrice,
        averageFillPriceGbp: preview.estimatedFill.avgFillPrice,
        worstPriceGbp: preview.estimatedFill.worstPrice,
        estimatedFilledUnits: preview.estimatedFill.filledUnits,
        estimatedRemainingUnits: preview.estimatedFill.remainingUnits,
        reservationId: reserved.id,
        reservationExpiresAt: reserved.expiresAt,
        previewValidUntil: preview.validUntil,
        maxReserved1ze: reserved.reserved1zeMg / 1000,
        marketDataTimestamp: orderBook.serverTimestamp,
      });
    } catch (error) {
      const parsed = parseApiError(error, 'Unable to prepare this order');
      show(parsed.message, 'error');
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  const handleBack = React.useCallback(() => {
    if (navigation.canGoBack()) { navigation.goBack(); return; }
    navigation.navigate('AssetDetail', { assetId: tradeAssetId ?? '' });
  }, [navigation, tradeAssetId]);

  // ── Loading state ──
  if (isLoading) {
    return (
      <FlagshipScreen
        scrollEnabled={false}
        contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
        header={
          <FlagshipHeader
            title="Trade"
            subtitle="Buy or sell Co-Own units"
            onBack={handleBack}
          />
        }
      >
        <CoOwnTradeSkeleton />
      </FlagshipScreen>
    );
  }

  // ── Error state ──
  if (isError || !asset) {
    return (
      <FlagshipScreen
        scrollEnabled={false}
        contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
        header={
          <FlagshipHeader
            title="Trade"
            subtitle="Buy or sell Co-Own units"
            onBack={handleBack}
          />
        }
      >
        <CoOwnStateCanvas
          variant="error"
          title="Item not found"
          subtitle="This Co-Own item may have been delisted."
          actionLabel="Back to Co-Own"
          onAction={() => navigation.navigate('CoOwnHub')}
        />
      </FlagshipScreen>
    );
  }

  const executableUnits = side === 'buy'
    ? visibleBook.asks.reduce((total, level) => total + level.size, 0)
    : visibleBook.bids.reduce((total, level) => total + level.size, 0);
  const maxUnits = side === 'sell' ? Math.min(yourUnits, executableUnits || yourUnits) : executableUnits;
  // 1ZE is the canonical settlement unit. GBP/TVUSD are secondary references.
  const settlementLabel = '1ZE';

  return (
    <FlagshipScreen
      scrollEnabled={false}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
      header={
        <FlagshipHeader
          title={side === 'buy' ? 'Buy units' : 'Sell units'}
          subtitle={asset.title}
          onBack={handleBack}
        />
      }
    >
      <CoOwnOfflineBanner isOffline={isOffline} />
      <CoOwnReconciliationBanner
        isActive={Boolean(orderBook && orderBook.reconciliationState !== 'reconciled')}
      />

      {/* Compact value strip — spec 03 §3.2: last/bid/ask/spread one line */}
      <CoOwnValueStrip
        last={{ price: asset.unitPriceGbp, ageSeconds: null }}
        nav={asset.appraisalValue && asset.totalUnits > 0 ? {
          pricePerUnit: asset.appraisalValue / asset.totalUnits,
          valuedAt: asset.appraisalValuedAt ?? '—',
          method: asset.appraisalMethod ?? '—',
        } : undefined}
        premiumPct={asset.appraisalValue && asset.totalUnits > 0
          ? ((asset.unitPriceGbp - (asset.appraisalValue / asset.totalUnits)) / (asset.appraisalValue / asset.totalUnits)) * 100
          : null}
      />

      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingBottom: scrollBottomPadding }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        onScrollBeginDrag={Keyboard.dismiss}
      >
        {/* Buy/Sell selector */}
        <View>
          <AppSegmentControl
            options={TRADE_SIDE_OPTIONS}
            value={side}
            onChange={setSide}
            fullWidth
            style={styles.sideSwitcher}
          />
        </View>

        {/* Compliance alert */}
        {!eligibility.ok && (
          <View>
            <View style={[styles.alertCard, { backgroundColor: colors.danger + '12', borderColor: colors.danger + '40' }]}>
              <View style={styles.alertRow}>
                <Ionicons name="warning-outline" size={16} color={colors.danger} />
                <Text style={[styles.alertTitle, { color: colors.danger }]}>Trading restricted</Text>
              </View>
              <Text style={[styles.alertText, { color: colors.textSecondary }]}>{eligibility.message}</Text>
            </View>
          </View>
        )}

        {/* Rights incomplete alert — spec 10 §9.3: TBC blocks trading on live instruments */}
        {hasIncompleteRights && (
          <View>
            <View style={[styles.alertCard, { backgroundColor: colors.warning + '12', borderColor: colors.warning + '40' }]}>
              <View style={styles.alertRow}>
                <Ionicons name="document-text-outline" size={16} color={colors.warning} />
                <Text style={[styles.alertTitle, { color: colors.warning }]}>Rights incomplete</Text>
              </View>
              <Text style={[styles.alertText, { color: colors.textSecondary }]}>
                This instrument has rights rows marked "To be confirmed". Trading is blocked until all rights are confirmed.
              </Text>
              {/* WS5: surface TBC reason and ETA when the backend provides them. */}
              {asset?.rights?.tbcReason ? (
                <Text style={[styles.alertText, { color: colors.textSecondary, marginTop: Space.xs }]}>
                  Reason: {asset.rights.tbcReason}
                </Text>
              ) : null}
              {asset?.rights?.tbcEtaDate ? (
                <Text style={[styles.alertText, { color: colors.textSecondary, marginTop: Space.xs }]}>
                  Expected by {new Date(asset.rights.tbcEtaDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                </Text>
              ) : (
                <Text style={[styles.alertText, { color: colors.textMuted, marginTop: Space.xs }]}>
                  No confirmation date available.
                </Text>
              )}
            </View>
          </View>
        )}

        <View style={[
          styles.illustrativeBanner,
          {
            backgroundColor: marketIsAuthoritative ? colors.success + '10' : colors.warning + '12',
            borderColor: marketIsAuthoritative ? colors.success + '35' : colors.warning + '40',
          },
        ]}>
          <Ionicons
            name={marketIsAuthoritative ? 'pulse-outline' : 'pause-circle-outline'}
            size={14}
            color={marketIsAuthoritative ? colors.success : colors.warning}
          />
          <Text style={[styles.illustrativeBannerText, { color: colors.textSecondary }]} numberOfLines={3}>
            {marketIsAuthoritative
              ? `Live order book · snapshot ${orderBook?.snapshotSequence ?? 0}. A server preview and reservation are required before confirmation.`
              : 'Trading paused. Displayed depth may be a development fallback and is never treated as an executable quote.'}
          </Text>
        </View>

        {/* Trade composer — product identity, availability, quote, reservation, expandable details */}
        <View>
          <CoOwnTradeComposer
            imageUri={asset.imageUrl}
            title={asset.title}
            side={side}
            mode={orderMode}
            units={quote.quantity}
            unitPriceLabel={formatCoOwnIze(marketPrice)}
            grossLabel={<CoOwnNumericText value={quote.grossValue} unit="1ZE" size="priceList" align="right" showUnit={false} />}
            feeLabel={<CoOwnNumericText value={quote.fee} unit="1ZE" size="priceList" align="right" showUnit={false} />}
            totalLabel={<CoOwnNumericText value={quote.netValue} unit="1ZE" size="priceLarge" align="right" showUnit={false} />}
            totalCaption={side === 'buy' ? 'Including 1% fee' : 'After 1% fee'}
            settlementLabel={settlementLabel}
            escrowPartner={asset?.escrowPartner ?? null}
            escrowTermsUrl={asset?.escrowTermsUrl ?? null}
            settlementEtaHours={asset?.settlementEtaHours ?? null}
            availableUnits={executableUnits}
            sellableUnits={yourUnits}
            maxUnits={maxUnits}
            orderType={ticketOrderType}
            protectionPrice={protectionPrice}
            reservation={{
              totalReserve1ZE: reservation.totalReserve1ZE,
              totalReserveUnits: reservation.totalReserveUnits,
            }}
            fillEstimate={{
              avgFillPrice: fillEstimate.avgFillPrice,
              worstPrice: fillEstimate.worstPrice,
              unitsFilled: fillEstimate.unitsFilled,
              slippageBeyondDepth: fillEstimate.slippageBeyondDepth,
              gross: fillEstimate.gross,
            }}
            depthContext={depthContext}
            duration={ticketDuration}
            postTradePreview={postTradePreview}
            rightsVersion={asset.rightsVersion ?? undefined}
          />
        </View>

        {/* ── Unified order ticket ──
            One surface containing: order type, quantity, limit price, duration,
            and market context. Previously these were separate cards forcing the
            user to move between editable fields and the calculated result. */}
        <View>
          <View style={[styles.ticketCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {/* Order type */}
            <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Order type</Text>
            <AppSegmentControl
              options={ORDER_TYPE_OPTIONS}
              value={ticketOrderType}
              onChange={setTicketOrderType}
              fullWidth
            />
            <Text style={[styles.marketHint, { color: colors.textMuted }]} numberOfLines={2}>
              {ticketOrderType === 'protected_instant'
                ? 'Marketable limit with visible protection price. Never uncapped in an illiquid asset.'
                : 'Resting order. Queued until matched at your limit price.'}
            </Text>

            <View style={[styles.ticketDivider, { backgroundColor: colors.border }]} />

            {/* Quantity + availability context */}
            <View style={styles.ticketRow}>
              <View style={styles.ticketFieldWrap}>
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
                    onPress={() => setQuantityInput(String(maxUnits))}
                    accessibilityRole="button"
                    accessibilityLabel={`Set quantity to maximum ${maxUnits} units`}
                    scaleValue={0.96}
                    hapticFeedback="light"
                  >
                    <Text style={[styles.maxLink, { color: colors.textSecondary }]}>Max: {maxUnits}</Text>
                  </AnimatedPressable>
                )}
              </View>
              <View style={styles.ticketContextCol}>
                <View style={styles.contextItem}>
                  <Text style={[styles.contextLabel, { color: colors.textMuted }]}>Executable</Text>
                  <Text style={[styles.contextValue, { color: colors.textPrimary }]}>
                    {executableUnits}
                  </Text>
                </View>
                <View style={styles.contextItem}>
                  <Text style={[styles.contextLabel, { color: colors.textMuted }]}>You own</Text>
                  <Text style={[styles.contextValue, { color: yourUnits > 0 ? colors.brand : colors.textPrimary }]}>
                    {yourUnits}
                  </Text>
                </View>
                <View style={styles.contextItem}>
                  <Text style={[styles.contextLabel, { color: colors.textMuted }]}>Fee</Text>
                  <Text style={[styles.contextValue, { color: colors.textPrimary }]}>1%</Text>
                </View>
              </View>
            </View>

            <View style={[styles.ticketDivider, { backgroundColor: colors.border }]} />

            {/* Every order is capped: protected instant is a marketable limit. */}
            <View style={styles.limitRow}>
              <Text style={[styles.inputLabel, { color: colors.textMuted }]} numberOfLines={1}>
                {ticketOrderType === 'protected_instant' ? 'Protection price' : 'Limit price'}
              </Text>
              <View style={[styles.modePill, { backgroundColor: colors.brand }]}>
                <Text style={[styles.modePillText, { color: colors.background }]} numberOfLines={1}>
                  CAPPED
                </Text>
              </View>
            </View>
            <AppInput
              value={ticketOrderType === 'protected_instant'
                ? (protectedLimitPrice > 0 ? String(protectedLimitPrice) : '')
                : offerPriceInput}
              onChangeText={(v) => setOfferPriceInput(sanitizeTradePriceInput(v))}
              keyboardType="decimal-pad"
              placeholder={ticketOrderType === 'protected_instant' ? 'Waiting for live ask or bid' : 'Enter limit price'}
              editable={ticketOrderType === 'limit'}
              accessibilityLabel={ticketOrderType === 'protected_instant' ? 'Protected maximum price' : 'Limit price'}
            />
            <Text style={[styles.marketHint, { color: colors.textMuted }]} numberOfLines={2}>
              {ticketOrderType === 'protected_instant'
                ? (protectedLimitPrice > 0
                  ? `Never executes beyond ${protectedLimitPrice.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 1ZE per unit.`
                  : 'A protected order needs a live opposite-side quote.')
                : `Rests until matched at ${effectiveLimitPrice.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 1ZE or better.`}
            </Text>

            {/* Duration — only for limit orders */}
            {ticketOrderType === 'limit' && (
              <>
                <View style={[styles.ticketDivider, { backgroundColor: colors.border }]} />
                <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Duration</Text>
                <View style={styles.durationRow}>
                  <AnimatedPressable
                    onPress={() => setTicketDuration('GFD')}
                    style={[
                      styles.durationChip,
                      {
                        backgroundColor: ticketDuration === 'GFD' ? colors.brand : colors.surfaceAlt,
                        borderColor: colors.border,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Good for day"
                    accessibilityState={{ selected: ticketDuration === 'GFD' }}
                    scaleValue={0.96}
                    hapticFeedback="light"
                  >
                    <Text style={[styles.durationText, { color: ticketDuration === 'GFD' ? colors.background : colors.textSecondary }]}>
                      GFD
                    </Text>
                  </AnimatedPressable>
                  <AnimatedPressable
                    onPress={() => setTicketDuration('GTC90')}
                    style={[
                      styles.durationChip,
                      {
                        backgroundColor: ticketDuration === 'GTC90' ? colors.brand : colors.surfaceAlt,
                        borderColor: colors.border,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Good till cancelled, 90 days"
                    accessibilityState={{ selected: ticketDuration === 'GTC90' }}
                    scaleValue={0.96}
                    hapticFeedback="light"
                  >
                    <Text style={[styles.durationText, { color: ticketDuration === 'GTC90' ? colors.background : colors.textSecondary }]}>
                      GTC 90d
                    </Text>
                  </AnimatedPressable>
                </View>
              </>
            )}
          </View>
        </View>

        {/* Phase 6: Concierge CTA — shown when the market is thin (no opposite side) */}
        {visibleBook.asks.length === 0 && side === 'buy' && (
          <View>
            <CoOwnConciergeCTA
              reason="no_opposite_side"
              assetTitle={asset?.title}
              onRequestQuote={() => navigation.navigate('HelpSupport')}
              onContactConcierge={() => navigation.navigate('HelpSupport')}
            />
          </View>
        )}
        {visibleBook.bids.length === 0 && side === 'sell' && (
          <View>
            <CoOwnConciergeCTA
              reason="no_opposite_side"
              assetTitle={asset?.title}
              onRequestQuote={() => navigation.navigate('HelpSupport')}
              onContactConcierge={() => navigation.navigate('HelpSupport')}
            />
          </View>
        )}

        {/* Risk disclosure */}
        <View>
          <CoOwnRiskDisclosure />
        </View>
      </KeyboardAwareScrollView>

      {/* Sticky action dock — thin-market substitution per spec §05 */}
      <CoOwnStickyActionDock>
        {isThinMarket ? (
          <View style={styles.thinMarketDock}>
            <AppButton
              title="Contact concierge"
              icon={<Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.background} />}
              onPress={() => navigation.navigate('HelpSupport')}
              variant="primary"
              size="lg"
              hapticFeedback="medium"
              accessibilityLabel="Contact concierge for thin market assistance"
              style={styles.submitBtn}
            />
          </View>
        ) : (
          <View style={styles.submitDockWrap}>
            <AppButton
              title="Review order"
              icon={<Ionicons name="arrow-forward" size={18} color={colors.background} />}
              onPress={handleSubmit}
              disabled={!canSubmit || isSubmittingOrder}
              variant="primary"
              size="lg"
              hapticFeedback="medium"
              accessibilityLabel={`Review ${side} order${submitDisabledReason ? ` — ${submitDisabledReason}` : ''}`}
              style={styles.submitBtn}
            />
            {!canSubmit && submitDisabledReason && (
              <Text style={[styles.submitDisabledReason, { color: colors.textMuted }]} numberOfLines={1}>
                {submitDisabledReason}
              </Text>
            )}
          </View>
        )}
      </CoOwnStickyActionDock>
    </FlagshipScreen>
  );
}

const styles = StyleSheet.create({
  // ── Content padding — 24pt top for calm breathing room ──
  // Per spec 11_COOWN: "24pt between sections." The trade surface should
  // feel calm and deliberate, not cramped.
  content: {
    paddingHorizontal: Space.md,
    paddingTop: Space.lg,
  },
  // ── Buy/Sell selector — 24pt section spacing after ──
  sideSwitcher: {
    marginBottom: Space.lg,
  },
  // ── Alert card — calm, professional warning surface ──
  // Per spec 11_COOWN: "Clean, calm, trustworthy." Alert uses subtle
  // semantic background, not aggressive red. 24pt section spacing.
  alertCard: {
    borderRadius: RadiusRoleValue.sheetDialog,
    padding: Space.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: Space.lg,
  },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    marginBottom: Space.xs,
    minWidth: 0,
    flexShrink: 1,
  },
  // Alert title uses bodyEmphasis (15/21/600) for clear hierarchy.
  alertTitle: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing,
    flexShrink: 1,
    minWidth: 0,
  },
  // Alert text uses body (14/20/400) for readable explanation.
  alertText: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.body.letterSpacing,
  },
  // ── Illustrative banner — calm market status indicator ──
  // Per spec 11_COOWN: "Calm presentation." Subtle background, not aggressive.
  // Uses semantic colors (success/warning) only for status truth.
  // 24pt section spacing after.
  illustrativeBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    borderRadius: RadiusRoleValue.mediaThumbnail,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: Space.lg,
  },
  illustrativeBannerText: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  // ── Unified order ticket — the one dominant panel ──
  // Per AGENTS.md §4: one dominant non-media panel above the fold.
  // Per spec 11_COOWN: "One-dimensional decision surface." Calm, clear,
  // trustworthy. 24pt section spacing. Generous internal padding (24pt).
  // Hairline border, not heavy chrome.
  ticketCard: {
    borderRadius: RadiusRoleValue.sheetDialog,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Space.lg,
    gap: Space.md,
    marginBottom: Space.lg,
  },
  // ── Ticket divider — hairline separator between sections ──
  // Per AGENTS.md stroke grammar: separators are hairline.
  ticketDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: Space.sm,
  },
  ticketRow: {
    flexDirection: 'row',
    gap: Space.md,
  },
  ticketFieldWrap: {
    flex: 1,
    gap: Space.xs,
  },
  // ── Context column — compact market context beside quantity ──
  // Per spec 11_COOWN: "Calm, clear, professional." Context values use
  // Numeric.numericMeta (13/18/600) with tabular-nums for stable alignment.
  ticketContextCol: {
    width: Space.xxl * 2 + Space.xs,
    gap: Space.sm,
    paddingTop: Space.sm,
  },
  contextItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  // Context labels use captionElevated for quiet hierarchy.
  contextLabel: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  // Context values use numericMeta with tabular-nums — per spec 11_COOWN:
  // "Monetary and unit quantities never change width erratically."
  contextValue: {
    fontSize: Numeric.numericMeta.size,
    lineHeight: Numeric.numericMeta.lineHeight,
    fontFamily: FontFamily.semibold,
    letterSpacing: Numeric.numericMeta.letterSpacing,
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
  },
  // ── Input labels — captionElevated for quiet, professional hierarchy ──
  // Per Design.md: "Labels: Type.captionElevated."
  inputLabel: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  // ── Limit row — label + capped pill ──
  limitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minWidth: 0,
    gap: Space.sm,
  },
  // Capped pill — semantic truth, not decoration. Shows the order is
  // price-protected, which is a material fact for the user.
  modePill: {
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
    borderRadius: RadiusRoleValue.pillAvatar,
    flexShrink: 0,
  },
  modePillText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.bold,
    letterSpacing: LetterSpacing.wide + 0.28,
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
  },
  // Max link — quiet, professional quick-fill action. Tabular-nums.
  maxLink: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.meta.letterSpacing,
    alignSelf: 'flex-start',
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
  },
  // Market hint — calm, professional explanation text.
  marketHint: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  submitBtn: {
    flex: 1,
  },
  submitDockWrap: {
    width: '100%',
    gap: Space.xs,
  },
  // ── Submit disabled reason — calm, professional feedback ──
  // Per spec 11_COOWN: "Financial error never resolves via toast alone."
  // Shows the reason inline below the button.
  submitDisabledReason: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.meta.letterSpacing,
    textAlign: 'center',
  },
  thinMarketDock: {
    width: '100%',
  },
  // ── Duration selector — calm, professional chips ──
  // Per spec 11_COOWN: "Clean, calm, trustworthy." Selected state uses
  // colors.brand fill, unselected uses surfaceAlt. Tabular-nums for text.
  durationRow: {
    flexDirection: 'row',
    gap: Space.sm,
  },
  durationChip: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    borderRadius: RadiusRoleValue.pillAvatar,
    borderWidth: StyleSheet.hairlineWidth,
  },
  durationText: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.body.letterSpacing,
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
  },
});
