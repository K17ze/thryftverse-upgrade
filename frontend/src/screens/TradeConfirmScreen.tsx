import React, { useState } from 'react';
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
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { placeCoOwnOrder } from '../services/marketApi';
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
  const { assetId, assetTitle, assetImageUrl, side, quantity, totalValue, fee, netValue, orderMode, limitPriceGbp } = route.params;
  const { colors, isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isCompactDock = width < 360;
  const haptic = useHaptic();
  const { show } = useToast();
  const { formatFromFiat } = useFormattedPrice();
  const currentUser = useStore((state) => state.currentUser);

  const [isSubmitting, setIsSubmitting] = useState(false);

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
  const maxReservedLabel = isBuy ? formatFromFiat(netValue, 'GBP') : `${quantity} units`;

  // Per spec 05 §3.2: market warning for illiquid assets.
  const marketWarning = 'Co-Own units are illiquid. Exit may require time or may not be possible at the quoted price.';

  const handleConfirm = async () => {
    if (isSubmitting) return;

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
        idempotencyKey: idempotencyKeyRef.current!,
      });

      if (remoteOrder.order.status === 'rejected') {
        show('Order rejected by matching engine.', 'error');
        // Definitive rejection — a genuinely new order needs a new key.
        idempotencyKeyRef.current = null;
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

  const handleCancel = () => {
    haptic.medium();
    navigation.goBack();
  };

  const handleBack = () => {
    navigation.goBack();
  };

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
            orderType={orderMode}
            units={quantity}
            unitPriceLabel={quantity > 0 ? formatFromFiat(totalValue / quantity, 'GBP') : formatFromFiat(0, 'GBP')}
            limitPriceLabel={orderMode === 'limit' && limitPriceGbp != null ? formatFromFiat(limitPriceGbp, 'GBP') : undefined}
            grossLabel={formatFromFiat(totalValue, 'GBP')}
            feeLabel={formatFromFiat(fee, 'GBP')}
            totalLabel={formatFromFiat(netValue, 'GBP')}
            totalCaption={isBuy ? 'Including 1% fee' : 'After 1% fee'}
            settlementLabel={settlementLabel}
            status="pending"
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
            disabled={isSubmitting}
            accessibilityLabel={isBuy ? 'Confirm buy order' : 'Confirm sell order'}
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