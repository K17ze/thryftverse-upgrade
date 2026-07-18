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

  const isBuy = side === 'buy';
  const settlementLabel = 'GBP';

  // Hold-to-submit threshold: orders > 5,000 1ZE OR > 5% of public float.
  // We don't have public float in route params, so use total value as proxy.
  // 1ZE ≈ 1 GBP for threshold purposes (conservative).
  const requireHold = netValue > 5000;

  const handleConfirm = async () => {
    if (isSubmitting) return;

    if (!currentUser?.id) {
      show('Sign in is required to place an order.', 'error');
      return;
    }

    haptic.heavy();
    setIsSubmitting(true);

    try {
      // Generate a client-side idempotency key per spec 10 §1.
      // This prevents duplicate order submissions on network retry.
      const idempotencyKey = `${currentUser.id}-${assetId}-${side}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const remoteOrder = await placeCoOwnOrder(assetId, {
        userId: currentUser.id,
        side,
        units: quantity,
        orderType: orderMode,
        limitPriceGbp,
        idempotencyKey,
      });

      if (remoteOrder.order.status === 'rejected') {
        show('Order rejected by matching engine.', 'error');
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
      } else {
        show('Trading engine unavailable. Please retry once connection is restored.', 'error');
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