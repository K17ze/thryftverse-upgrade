import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { useAppTheme } from '../theme/ThemeContext';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { AppButton } from '../components/ui/AppButton';
import { HoldToSubmitButton } from '../components/ui/HoldToSubmitButton';
import { useHaptic } from '../hooks/useHaptic';
import { useToast } from '../context/ToastContext';
import { cancelCoOwnOrderReservation, placeCoOwnOrder } from '../services/marketApi';
import { parseApiError } from '../lib/apiClient';
import { useStore } from '../store/useStore';
import {
  CoOwnMarketHeader,
  CoOwnTradeReceipt,
  CoOwnStickyActionDock,
  CoOwnRiskDisclosure,
} from '../components/coown';

type Props = StackScreenProps<RootStackParamList, 'TradeConfirm'>;

export default function TradeConfirmScreen({ navigation, route }: Props) {
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
    limitPriceGbp,
    averageFillPriceGbp,
    worstPriceGbp,
    estimatedFilledUnits,
    estimatedRemainingUnits,
    reservationId,
    reservationExpiresAt,
    previewValidUntil,
    maxReserved1ze,
    marketDataTimestamp,
  } = route.params;
  const { colors, isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isCompactDock = width < 360;
  const haptic = useHaptic();
  const { show } = useToast();
  const currentUser = useStore((state) => state.currentUser);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isReleasing, setIsReleasing] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());
  const reservationPlacedRef = React.useRef(false);
  const reservationReleasedRef = React.useRef(false);

  // Idempotency key per spec 10 §1: generated once per order attempt and reused
  // across retries so a network retry cannot post a duplicate order. A truly
  // new order only happens when the user navigates back to TradeScreen and
  // re-confirms, which mounts a fresh instance of this screen (fresh key).
  const idempotencyKeyRef = React.useRef<string | null>(null);
  if (!idempotencyKeyRef.current) {
    idempotencyKeyRef.current = `${currentUser?.id ?? 'anon'}-${assetId}-${side}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  const isBuy = side === 'buy';
  // 1ZE is the canonical settlement unit. GBP is a secondary reference.
  const settlementLabel = '1ZE';

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
      const remoteOrder = await placeCoOwnOrder(assetId, {
        userId: currentUser.id,
        side,
        units: quantity,
        orderType: orderMode,
        limitPriceGbp,
        reservationId,
        idempotencyKey: idempotencyKeyRef.current!,
      });

      reservationPlacedRef.current = true;

      if (remoteOrder.order.status === 'rejected') {
        show('Order rejected by matching engine.', 'error');
        // Definitive rejection — a genuinely new order needs a new key.
        idempotencyKeyRef.current = null;
        reservationPlacedRef.current = false;
        await releaseReservation();
        return;
      }
      if (remoteOrder.order.status === 'open' || remoteOrder.order.status === 'partially_filled') {
        show('Offer placed on the server order book.', 'info');
      } else {
        show('Order executed on CO-OWN engine.', 'success');
      }
      if (remoteOrder.aml?.alertId) show('Trade is flagged for AML review.', 'info');
      navigation.navigate('CoOwnHub');
    } catch (error) {
      const parsedError = parseApiError(error, 'Unable to submit order');
      if (!parsedError.isNetworkError) {
        show(parsedError.message, parsedError.status && parsedError.status >= 500 ? 'error' : 'info');
        // Non-network failure at this point is treated as recoverable-but-distinct
        // by the backend's own idempotency dedup; keep the key so a user retry
        // after fixing the cause (e.g. re-authenticating) still dedupes correctly.
      } else {
        show('Trading engine unavailable. Please retry once connection is restored.', 'error');
        // Network error: the request may or may not have reached the server.
        // Keep the same key so retry is a safe no-op/duplicate-return, not a new order.
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
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      <CoOwnMarketHeader
        title="Confirm order"
        subtitle={isBuy ? 'Review your buy' : 'Review your sell'}
        onBack={handleBack}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, Space.md) + (isCompactDock ? 180 : 132) },
        ]}
      >
        {/* Trade receipt — product identity, order details, totals */}
        <Reanimated.View entering={FadeInDown.duration(300).delay(40)}>
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
            avgFillPriceLabel={averageFillPriceGbp > 0 ? format1ze(averageFillPriceGbp) : 'No immediate fill'}
            worstPriceLabel={worstPriceGbp > 0 ? format1ze(worstPriceGbp) : 'No immediate fill'}
            grossLabel={format1ze(totalValue)}
            feeLabel={format1ze(fee)}
            totalLabel={format1ze(netValue)}
            totalCaption={isBuy ? 'Including 1% fee' : 'After 1% fee'}
            settlementLabel={settlementLabel}
            status="pending"
            timestamp={`Quote ${secondsRemaining}s · market ${new Date(marketDataTimestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`}
            maxReservedLabel={maxReservedLabel}
            marketWarning={marketWarning}
          />
        </Reanimated.View>

        {/* Risk disclosure */}
        <Reanimated.View entering={FadeInDown.duration(300).delay(120)} style={styles.riskWrap}>
          <CoOwnRiskDisclosure />
        </Reanimated.View>
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
            disabled={isSubmitting || isReleasing || isExpired}
            accessibilityLabel={isExpired
              ? 'Quote expired. Return to refresh.'
              : `${isBuy ? 'Confirm buy order' : 'Confirm sell order'}. Quote expires in ${secondsRemaining} seconds.`}
          />
        </View>
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
  riskWrap: {
    marginTop: Space.lg,
  },
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
