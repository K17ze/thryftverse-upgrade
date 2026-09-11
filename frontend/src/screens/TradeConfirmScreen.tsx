import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps, NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useAppTheme } from '../theme/ThemeContext';
import { Space } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { RadiusRoleValue } from '../theme/surfaceRadiusRules';
import { AppButton } from '../components/ui/AppButton';
import { HoldToSubmitButton } from '../components/ui/HoldToSubmitButton';
import { useHaptic } from '../hooks/useHaptic';
import { useBreakpoint } from '../hooks/useBreakpoint';
import { useToast } from '../context/ToastContext';
import { cancelCoOwnOrderReservation, placeCoOwnOrder, lookupCoOwnOrderByIdempotencyKey, fetchCoOwnAssetById } from '../services/marketApi';
import { parseApiError } from '../lib/apiClient';
import { useStore } from '../store/useStore';
import { makeStableId } from '../utils/createStableId';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import {
  CoOwnTradeReceipt,
  CoOwnStickyActionDock,
  CoOwnRiskDisclosure,
} from '../components/coown';
import { useScreenCaptureProtection } from '../platform/screenCapture';
import { useInvalidateCoOwnAsset } from '../platform/server';
import { track } from '../analytics/track';


type Props = NativeStackScreenProps<RootStackParamList, 'TradeConfirm'>;

// CoOwnOrderHistory is typed as `undefined` in the shared RootStackParamList
// (navigation/types.ts — owned by another team). The history screen reads
// orderId / assetId / idempotencyKey from route.params at runtime to
// highlight the just-submitted order. Widen the route locally so this
// screen can pass those params type-safely without editing the shared types.
type OrderHistoryHighlightParams = {
  orderId?: string;
  assetId?: string;
  idempotencyKey?: string;
};
type LocalStackParamList = Omit<RootStackParamList, 'CoOwnOrderHistory'> & {
  CoOwnOrderHistory: OrderHistoryHighlightParams | undefined;
};

// Phase 2.5: the shared RootStackParamList ('TradeConfirm') is owned by
// another team and does not yet declare `ticketDuration`. Widen the route
// params locally so the duration forwarded from TradeScreen can be read
// type-safely without editing the shared navigation types.
type TradeConfirmRouteParams = RootStackParamList['TradeConfirm'] & {
  ticketDuration?: 'GFD' | 'GTC90';
  feeRate?: number;
};

export default function TradeConfirmScreen({ navigation, route }: Props) {
  useScreenCaptureProtection();
  const {
    assetId,
    assetTitle,
    assetImageUrl,
    side,
    quantity,
    totalValue,
    fee,
    netValue,
    orderMode,
    ticketOrderType,
    // P0.1: backend order type for protected_market
    backendOrderType,
    limitPriceGbp,
    protectionPriceGbp,
    averageFillPriceGbp,
    worstPriceGbp,
    estimatedFilledUnits,
    estimatedRemainingUnits,
    reservationId,
    reservationExpiresAt,
    previewValidUntil,
    maxReserved1ze,
    marketDataTimestamp,
    feeRate: routeFeeRate,
    // Phase 2.5: duration (GFD / GTC90) forwarded from TradeScreen
    ticketDuration,
  } = (route.params as TradeConfirmRouteParams) ?? {};
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { isVeryCompact: isCompactDock } = useBreakpoint();
  const haptic = useHaptic();
  const { show } = useToast();
  const currentUser = useStore((state) => state.currentUser);
  const invalidateCoOwnAsset = useInvalidateCoOwnAsset();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isReleasing, setIsReleasing] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());
  const [quoteChanged, setQuoteChanged] = useState(false);
  const reservationPlacedRef = React.useRef(false);
  const reservationReleasedRef = React.useRef(false);

  // Idempotency key per spec 10 §1: generated once per order attempt and reused
  // across retries so a network retry cannot post a duplicate order. A truly
  // new order only happens when the user navigates back to TradeScreen and
  // re-confirms, which mounts a fresh instance of this screen (fresh key).
  const idempotencyKeyRef = React.useRef<string | null>(null);
  if (!idempotencyKeyRef.current) {
    idempotencyKeyRef.current = `${currentUser?.id ?? 'anon'}-${assetId}-${side}-${makeStableId('key')}`;
  }

  const isBuy = side === 'buy';
  const feeRate = routeFeeRate ?? 0.01;
  // 1ZE is the canonical settlement unit. GBP is a secondary reference.
  const settlementLabel = '1ZE';

  // Land the user on the order history with the submitted order highlighted
  // (orderId) and a route back to the asset (assetId). The history screen
  // reads these from route.params at runtime; the shared nav types are
  // widened locally (see LocalStackParamList above) so this stays type-safe.
  const orderHistoryNav = navigation as unknown as NativeStackNavigationProp<
    LocalStackParamList,
    'TradeConfirm'
  >;
  const goOrderHistory = (params: OrderHistoryHighlightParams) => {
    // Invalidate cached asset/orderBook/holdings so the order history screen
    // and any returning asset-detail view show fresh data after the trade.
    if (assetId) {
      invalidateCoOwnAsset(assetId, currentUser?.id);
    }
    orderHistoryNav.navigate('CoOwnOrderHistory', params);
  };

  // Hold-to-submit threshold: orders > 5,000 1ZE OR > 5% of public float.
  // We don't have public float in route params, so use total value as proxy.
  // 1ZE ≈ 1 GBP for threshold purposes (conservative).
  const requireHold = netValue > 5000;

  // Per spec 05 §3.2: receipt must show max reserved (full obligation).
  // For buys: total including fee. For sells: units being sold.
  const format1ze = React.useCallback((value: number) => (
    `${value.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 1ZE`
  ), []);
  const maxReservedLabel = isBuy ? format1ze(maxReserved1ze) : `${quantity} units`;
  // U30: Protection price label for protected_market orders (max buy / min sell).
  const protectionPriceLabel = protectionPriceGbp != null && protectionPriceGbp > 0
    ? format1ze(protectionPriceGbp)
    : undefined;
  // U30: Duration label with human-readable expiry for resting limit orders.
  const durationLabel = ticketOrderType === 'limit'
    ? (ticketDuration === 'GTC90' ? 'GTC · 90 days' : 'GFD · end of day')
    : undefined;
  const reservationExpiryMs = Date.parse(reservationExpiresAt);
  const previewExpiryMs = Date.parse(previewValidUntil);
  const validUntilMs = Math.min(reservationExpiryMs, previewExpiryMs);
  const secondsRemaining = Number.isFinite(validUntilMs)
    ? Math.max(0, Math.ceil((validUntilMs - nowMs) / 1000))
    : 0;
  const isExpired = secondsRemaining <= 0;

  useEffect(() => {
    const interval = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  // U31/U32: Revalidate the reserved price against the live market before
  // commitment. If the market has moved beyond the protection band since the
  // reservation was made, the quote has changed and the user must return to
  // the ticket for a fresh preview rather than committing a stale price.
  useEffect(() => {
    if (!assetId) return;
    let cancelled = false;
    const reservedPrice = protectionPriceGbp ?? limitPriceGbp ?? 0;
    if (reservedPrice <= 0) return;
    fetchCoOwnAssetById(assetId)
      .then((fetchedAsset) => {
        if (cancelled) return;
        const currentPrice = isBuy
          ? (fetchedAsset.bestAskGbp ?? fetchedAsset.unitPriceGbp)
          : (fetchedAsset.bestBidGbp ?? fetchedAsset.unitPriceGbp);
        if (!currentPrice || currentPrice <= 0) return;
        const delta = Math.abs(currentPrice - reservedPrice) / reservedPrice;
        if (delta > 0.02) {
          setQuoteChanged(true);
        }
      })
      .catch(() => {
        // If we cannot fetch the live price, the reservation expiry timer
        // still guards against stale quotes. Do not block on a fetch failure.
      });
    return () => { cancelled = true; };
  }, [assetId, isBuy, limitPriceGbp, protectionPriceGbp]);

  const releaseReservation = React.useCallback(async () => {
    if (reservationPlacedRef.current || reservationReleasedRef.current) return;
    reservationReleasedRef.current = true;
    try {
      await cancelCoOwnOrderReservation(assetId, reservationId);
    } catch {
      reservationReleasedRef.current = false;
    }
  }, [assetId, reservationId]);

  useEffect(() => () => {
    if (!reservationPlacedRef.current && !reservationReleasedRef.current) {
      void cancelCoOwnOrderReservation(assetId, reservationId);
    }
  }, [assetId, reservationId]);

  // Per spec 05 §3.2: market warning for illiquid assets.
  const marketWarning = 'Co-Own units are illiquid. Exit may require time or may not be possible at the quoted price.';

  const handleConfirm = async () => {
    if (isSubmitting) return;

    if (isExpired) {
      show('This quote expired. Return to refresh the live market preview.', 'info');
      return;
    }

    // U32: Do not auto-submit when the quote has changed since the reservation.
    // The user must return to the ticket for a fresh preview before committing.
    if (quoteChanged) {
      show('Quote changed since reservation. Return to review the updated price.', 'info');
      return;
    }

    if (!currentUser?.id) {
      show('Sign in is required to place an order.', 'error');
      return;
    }

    haptic.heavy();
    setIsSubmitting(true);

    try {
      // Reuse the same idempotency key for this order attempt on every retry
      // (spec 10 §1) — a replayed command must return the original result,
      // never post a duplicate order.
      // P0.1: Send protected_market with maxPriceGbp/minPriceGbp instead of
      // market + limitPriceGbp (which the backend rejects as contract-invalid).
      const effectiveBackendOrderType = backendOrderType ?? (ticketOrderType === 'protected_instant' ? 'protected_market' : orderMode);
      const remoteOrder = await placeCoOwnOrder(assetId, {
        userId: currentUser.id,
        side,
        units: quantity,
        orderType: effectiveBackendOrderType,
        ...(effectiveBackendOrderType === 'protected_market'
          ? (side === 'buy'
            ? { maxPriceGbp: protectionPriceGbp ?? limitPriceGbp }
            : { minPriceGbp: protectionPriceGbp ?? limitPriceGbp })
          : { limitPriceGbp }),
        reservationId,
        idempotencyKey: idempotencyKeyRef.current!,
        // Phase 2.5: forward the duration selector so the backend can set
        // the order's lifetime (GFD = end of day, GTC90 = 90 days).
        timeInForce: ticketDuration,
      });

      reservationPlacedRef.current = true;

      if (remoteOrder.order.status === 'rejected') {
        // U32: Rejection — show the engine's reason so the user knows why.
        const rejectReason = remoteOrder.order.remainingUnits != null && remoteOrder.order.remainingUnits > 0
          ? `Order rejected by matching engine. ${remoteOrder.order.remainingUnits} units unfilled.`
          : 'Order rejected by matching engine.';
        show(rejectReason, 'error');
        // Definitive rejection — a genuinely new order needs a new key.
        idempotencyKeyRef.current = null;
        reservationPlacedRef.current = false;
        await releaseReservation();
        return;
      }
      // U32: Distinguish immediate fill, resting balance, and partial fill
      // with explicit quantities so the user knows the exact outcome.
      if (remoteOrder.order.status === 'filled') {
        const filledQty = remoteOrder.order.filledUnits ?? quantity;
        show(`Filled immediately: ${filledQty} units executed.`, 'success');
      } else if (remoteOrder.order.status === 'partially_filled') {
        const filledQty = remoteOrder.order.filledUnits ?? 0;
        const restingQty = remoteOrder.order.remainingUnits ?? (quantity - filledQty);
        show(`Partial fill: ${filledQty} units filled, ${restingQty} units resting on the book.`, 'info');
      } else {
        // 'open' — the full quantity is resting on the order book.
        const restingQty = remoteOrder.order.remainingUnits ?? quantity;
        show(`Resting order: ${restingQty} units placed on the order book.`, 'info');
      }
      if (remoteOrder.aml?.alertId) show('Trade is flagged for AML review.', 'info');
      // Keep telemetry aligned with the server outcome. An open or partially
      // filled order is a placement, not an execution.
      if (remoteOrder.order.status === 'filled') {
        track('coown_order_filled', {
          asset_id: assetId,
          order_id: String(remoteOrder.order.id),
          units: quantity,
          price_gbp: remoteOrder.order.unitPriceGbp,
        });
      } else {
        track('coown_order_placed', {
          asset_id: assetId,
          side,
          units: quantity,
          price_gbp: remoteOrder.order.unitPriceGbp,
        });
      }
      // The order ledger is the source of truth for open, partial and filled
      // states. Land there so the user can see the server-confirmed outcome,
      // highlighted on the specific order — with assetId retained so the
      // history screen can offer a route back to the asset.
      goOrderHistory({ orderId: String(remoteOrder.order.id), assetId });
    } catch (error) {
      const parsedError = parseApiError(error, 'Unable to submit order');
      if (!parsedError.isNetworkError) {
        show(parsedError.message, parsedError.status && parsedError.status >= 500 ? 'error' : 'info');
        // Non-network failure at this point is treated as recoverable-but-distinct
        // by the backend's own idempotency dedup; keep the key so a user retry
        // after fixing the cause (e.g. re-authenticating) still dedupes correctly.
      } else {
        // P0.7: Network error — the request may or may not have reached the
        // server. Attempt to look up the result by idempotency key before
        // telling the user the result is unknown.
        try {
          const lookup = await lookupCoOwnOrderByIdempotencyKey(
            assetId,
            idempotencyKeyRef.current!,
          );
          if (lookup.status === 'acknowledged') {
            // The idempotency lookup returned the server's actual order
            // status. Mirror that status instead of treating acknowledgement
            // as execution.
            if (lookup.order.status === 'rejected') {
              show('Order rejected by matching engine.', 'error');
            } else if (lookup.order.status === 'filled') {
              show('Filled immediately. Check order history for details.', 'success');
            } else if (lookup.order.status === 'partially_filled') {
              show('Partial fill. Remaining units are resting on the book.', 'info');
            } else {
              show('Resting order placed on the server order book.', 'info');
            }
            goOrderHistory({ orderId: String(lookup.order.id), assetId });
            return;
          }
          if (lookup.status === 'processing') {
            show('Result not confirmed. Check order history before trying again.', 'info');
            // Outcome unknown — pass the idempotency key so the history screen
            // can locate the order once the server finishes processing it.
            goOrderHistory({ idempotencyKey: idempotencyKeyRef.current!, assetId });
            return;
          }
          // safe_to_retry — no record found, keep the key for safe retry
          show('Order was not placed. Please retry.', 'error');
        } catch {
          // Lookup itself failed — keep the key so retry is a safe no-op
          show('Trading engine unavailable. Retry once connection is restored.', 'error');
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (isReleasing) return;
    setIsReleasing(true);
    await releaseReservation();
    setIsReleasing(false);
    navigation.goBack();
  };

  const handleBack = handleCancel;

  return (
    <FlagshipScreen
      scrollEnabled={false}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
      header={
        <FlagshipHeader
          title="Confirm order"
          subtitle={isBuy ? 'Review your buy' : 'Review your sell'}
          onBack={handleBack}
        />
      }
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, Space.md) + (isCompactDock ? 180 : 132) },
        ]}
      >
        {/* Trade receipt — product identity, order details, totals */}
        <CoOwnTradeReceipt
          imageUri={assetImageUrl}
          title={assetTitle ?? 'Co-Own asset'}
          side={side}
          orderType={ticketOrderType}
          units={quantity}
          filledUnits={estimatedFilledUnits}
          remainingUnits={estimatedRemainingUnits}
          unitPriceLabel={quantity > 0 ? format1ze(totalValue / quantity) : format1ze(0)}
          limitPriceLabel={format1ze(limitPriceGbp)}
          protectionPriceLabel={protectionPriceLabel}
          durationLabel={durationLabel}
          avgFillPriceLabel={averageFillPriceGbp > 0 ? format1ze(averageFillPriceGbp) : 'No immediate fill'}
          worstPriceLabel={worstPriceGbp > 0 ? format1ze(worstPriceGbp) : 'No immediate fill'}
          grossLabel={format1ze(totalValue)}
          feeLabel={format1ze(fee)}
          totalLabel={format1ze(netValue)}
          totalCaption={isBuy
            ? `Including ${(feeRate * 100).toFixed(2).replace(/\.00$/, '')}% fee`
            : `After ${(feeRate * 100).toFixed(2).replace(/\.00$/, '')}% fee`}
          settlementLabel={settlementLabel}
          status="pending"
          timestamp={marketDataTimestamp
            ? `Quote ${secondsRemaining}s · market ${new Date(marketDataTimestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
            : `Quote ${secondsRemaining}s · primary allocation price`}
          maxReservedLabel={maxReservedLabel}
          marketWarning={marketWarning}
          localFiatLabel={`Reference: £${netValue.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} GBP`}
          localFiatSource="Settlement in 1ZE"
        />

        {/* Remainder behavior — plain-language summary of what happens to
            unfilled units, so the user knows the outcome before confirming. */}
        <View style={[styles.remainderCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.remainderHeader, { color: colors.textMuted }]}>
            {ticketOrderType === 'limit' ? 'Resting order' : 'Immediate order'}
          </Text>
          <Text style={[styles.remainderText, { color: colors.textSecondary }]}>
            {ticketOrderType === 'limit'
              ? `${isBuy ? 'Buy' : 'Sell'} ${quantity} units at your limit or ${isBuy ? 'lower' : 'higher'}. The order stays open until filled or expired.`
              : `${isBuy ? 'Buy' : 'Sell'} up to ${quantity} units within your price limit. Any unfilled amount is canceled.`}
          </Text>
        </View>

        {/* U32: Quote changed notice — the market has moved beyond the
            protection band since the reservation was made. The user must
            return to the ticket for a fresh preview before committing. */}
        {quoteChanged && !isExpired && (
          <View style={[styles.quoteChangedCard, { backgroundColor: colors.warningSubtle, borderColor: colors.warningBorder }]}>
            <Text style={[styles.remainderHeader, { color: colors.warning }]}>
              Quote changed
            </Text>
            <Text style={[styles.remainderText, { color: colors.textSecondary }]}>
              The live market price has moved since this quote was reserved. Return to the ticket to review the updated price before confirming.
            </Text>
          </View>
        )}

        {/* Risk disclosure */}
        <View style={styles.riskWrap}>
          <CoOwnRiskDisclosure />
        </View>
      </ScrollView>

      {/* Sticky action dock — confirm / cancel */}
      <CoOwnStickyActionDock>
        <View style={[styles.dockRow, isCompactDock && styles.dockRowCompact]}>
          <AppButton
            title="Cancel"
            variant="secondary"
            size="lg"
            style={[styles.cancelBtn, isCompactDock && styles.cancelBtnCompact]}
            onPress={handleCancel}
            hapticFeedback="medium"
            accessibilityLabel="Cancel order"
          />
          <HoldToSubmitButton
            requireHold={requireHold}
            title={isBuy ? 'Confirm buy' : 'Confirm sell'}
            iconName={isBuy ? 'arrow-up-circle-outline' : 'arrow-down-circle-outline'}
            onSubmit={handleConfirm}
            disabled={isSubmitting || isReleasing || isExpired || quoteChanged}
            accessibilityLabel={isExpired
              ? 'Quote expired. Return to refresh.'
              : quoteChanged
                ? 'Quote changed. Return to review the updated price.'
                : `${isBuy ? 'Confirm buy order' : 'Confirm sell order'}. Quote expires in ${secondsRemaining} seconds.`}
          />
        </View>
      </CoOwnStickyActionDock>
    </FlagshipScreen>
  );
}

const styles = StyleSheet.create({
  // ── Content padding — 24pt top for calm breathing room ──
  // Per spec 11_COOWN: "24pt between sections." The confirmation surface
  // should feel calm and deliberate — this is the final decision point.
  content: {
    paddingHorizontal: Space.md,
    paddingTop: Space.lg,
  },
  // ── Risk disclosure — 32pt from the receipt for clear separation ──
  // Per spec 11_COOWN: "Financial disclosures should be reachable before
  // order confirmation." The risk disclosure is visually separated from
  // the receipt to ensure the user reviews it before confirming.
  riskWrap: {
    marginTop: Space.xl,
  },
  // ── Remainder card — plain-language fill behavior before confirmation ──
  // Mirrors the receipt card grammar (hairline border, surface fill) so it
  // reads as part of the review surface, not a decorative alert.
  remainderCard: {
    marginTop: Space.lg,
    borderRadius: RadiusRoleValue.sheetDialog,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Space.md,
    gap: Space.xs,
  },
  remainderHeader: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.label.letterSpacing,
    textTransform: 'uppercase',
  },
  remainderText: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight + 2,
    fontFamily: TypographyV2.body.fontFamily,
    letterSpacing: TypographyV2.body.letterSpacing,
  },
  // ── Quote changed card — warning surface when the market has moved ──
  // Mirrors the remainder card grammar but uses warning semantic colors
  // so it reads as a distinct, actionable notice — not a decorative alert.
  quoteChangedCard: {
    marginTop: Space.lg,
    borderRadius: RadiusRoleValue.sheetDialog,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Space.md,
    gap: Space.xs,
  },
  // ── Dock row — calm, professional confirm/cancel actions ──
  // Per spec 11_COOWN: "Buy/sell action is impossible to confuse."
  // Cancel is secondary (quiet), Confirm is primary (dominant).
  // 8pt gap between buttons. Compact mode stacks vertically.
  dockRow: {
    width: '100%',
    minWidth: 0,
    flexDirection: 'row',
    gap: Space.sm,
  },
  dockRowCompact: {
    flexDirection: 'column-reverse',
  },
  cancelBtn: {
    flex: 1,
    minWidth: 0,
  },
  cancelBtnCompact: {
    flex: 0,
    width: '100%',
  },
  confirmBtn: {
    flex: 1.5,
    minWidth: 0,
  },
  confirmBtnCompact: {
    flex: 0,
    width: '100%',
  },
});
