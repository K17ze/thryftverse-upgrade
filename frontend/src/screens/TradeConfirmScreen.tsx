import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  ScrollView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { useAppTheme } from '../theme/ThemeContext';
import { Colors } from '../constants/colors';
import { Space, Radius, Type, Typography, Elevation } from '../theme/designTokens';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { AppButton } from '../components/ui/AppButton';
import { useHaptic } from '../hooks/useHaptic';
import { useToast } from '../context/ToastContext';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { PremiumStatusPill } from '../components/ui/PremiumStatusPill';
import { Meta, BodyEmphasis, Caption } from '../components/ui/Text';
import { placeCoOwnOrder } from '../services/marketApi';
import { parseApiError } from '../lib/apiClient';
import { useStore } from '../store/useStore';
import { CachedImage } from '../components/CachedImage';

type Props = StackScreenProps<RootStackParamList, 'TradeConfirm'>;

export default function TradeConfirmScreen({ navigation, route }: Props) {
  const { assetId, assetTitle, assetImageUrl, side, quantity, totalValue, fee, netValue, orderMode, limitPriceGbp } = route.params;
  const { isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const haptic = useHaptic();
  const { show } = useToast();
  const { formatFromFiat } = useFormattedPrice();
  const currentUser = useStore((state) => state.currentUser);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const isBuy = side === 'buy';

  const handleConfirm = async () => {
    if (isSubmitting) return;

    // Never fabricate an actor identity. If the user is not authenticated,
    // block the submission honestly rather than falling back to a fake ID.
    if (!currentUser?.id) {
      show('Sign in is required to place an order.', 'error');
      return;
    }

    haptic.heavy();
    setIsSubmitting(true);

    try {
      const remoteOrder = await placeCoOwnOrder(assetId, {
        userId: currentUser.id,
        side,
        units: quantity,
        orderType: orderMode,
        limitPriceGbp,
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

  const assetName = assetTitle ?? 'Co-Own asset';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <ScreenHeader title="Confirm Order" onBack={handleCancel} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {/* Asset summary */}
        <Reanimated.View entering={FadeInDown.duration(300).delay(40)} style={styles.assetCard}>
          <View style={styles.assetIconWrap}>
            {assetImageUrl ? (
              <CachedImage uri={assetImageUrl} style={styles.assetImage} contentFit="cover" />
            ) : (
              <Ionicons name="cube-outline" size={28} color={Colors.brand} />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <BodyEmphasis style={styles.assetName}>{assetName}</BodyEmphasis>
            <Caption color={Colors.textMuted}>Co-own position</Caption>
          </View>
          <PremiumStatusPill
            tone={isBuy ? 'success' : 'error'}
            label={isBuy ? 'BUY' : 'SELL'}
            icon={isBuy ? 'arrow-up-outline' : 'arrow-down-outline'}
          />
        </Reanimated.View>

        {/* Order summary */}
        <Reanimated.View entering={FadeInDown.duration(300).delay(80)} style={styles.summaryCard}>
          <Meta color={Colors.textMuted} style={styles.sectionLabel}>ORDER SUMMARY</Meta>

          <View style={styles.summaryRow}>
            <Caption color={Colors.textMuted}>Side</Caption>
            <Text style={[styles.summaryValue, isBuy ? styles.buyText : styles.sellText]}>
              {isBuy ? 'Buy' : 'Sell'}
            </Text>
          </View>

          <View style={styles.summaryRow}>
            <Caption color={Colors.textMuted}>Order type</Caption>
            <Text style={styles.summaryValue}>
              {orderMode === 'limit' ? 'Limit' : 'Market'}
            </Text>
          </View>

          {orderMode === 'limit' && limitPriceGbp != null && (
            <View style={styles.summaryRow}>
              <Caption color={Colors.textMuted}>Limit price</Caption>
              <Text style={styles.summaryValue}>{formatFromFiat(limitPriceGbp, 'GBP')}</Text>
            </View>
          )}

          <View style={styles.summaryRow}>
            <Caption color={Colors.textMuted}>Quantity</Caption>
            <Text style={styles.summaryValue}>{quantity} units</Text>
          </View>

          <View style={styles.summaryRow}>
            <Caption color={Colors.textMuted}>{isBuy ? 'Gross cost' : 'Gross proceeds'}</Caption>
            <Text style={styles.summaryValue}>{formatFromFiat(totalValue, 'GBP')}</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.summaryRow}>
            <Caption color={Colors.textMuted}>Platform fee</Caption>
            <Text style={styles.summaryValue}>{formatFromFiat(fee, 'GBP')}</Text>
          </View>

          <View style={styles.summaryRow}>
            <Caption color={Colors.textMuted}>{isBuy ? 'Total cost' : 'Net proceeds'}</Caption>
            <Text style={[styles.summaryValue, styles.netValue]}>
              {formatFromFiat(netValue, 'GBP')}
            </Text>
          </View>
        </Reanimated.View>

        {/* Risk disclosure */}
        <Reanimated.View entering={FadeInDown.duration(300).delay(120)} style={styles.riskCard}>
          <Ionicons name="warning-outline" size={20} color={Colors.textMuted} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.riskTitle}>Risk disclosure</Text>
            <Caption color={Colors.textMuted} style={styles.riskSub}>
              Co-own assets carry market risk. Prices can go up or down. Past performance does not guarantee future returns. Only invest what you can afford to lose.
            </Caption>
          </View>
        </Reanimated.View>

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Bottom actions */}
      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <AppButton
          title="Cancel"
          variant="secondary"
          size="lg"
          style={{ flex: 1 }}
          onPress={handleCancel}
        />
        <AppButton
          title={isBuy ? 'Confirm Buy' : 'Confirm Sell'}
          variant="primary"
          size="lg"
          style={{ flex: 1 }}
          onPress={handleConfirm}
          disabled={isSubmitting}
          hapticFeedback="heavy"
          icon={
            <Ionicons
              name={isBuy ? 'arrow-up-circle-outline' : 'arrow-down-circle-outline'}
              size={16}
              color={Colors.background}
            />
          }
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.xl,
    gap: Space.lg,
  },
  assetCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Space.lg,
    ...Elevation.subtle,
  },
  assetIconWrap: {
    width: 52,
    height: 52,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  assetImage: {
    width: 52,
    height: 52,
  },
  assetName: {
    fontSize: Type.title.size,
    color: Colors.textPrimary,
  },
  sectionLabel: {
    letterSpacing: 1.2,
    marginBottom: Space.sm,
  },
  summaryCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Space.lg,
    ...Elevation.subtle,
    gap: Space.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  summaryValue: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  buyText: {
    color: Colors.success,
  },
  sellText: {
    color: Colors.danger,
  },
  netValue: {
    fontSize: Type.price.size,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginVertical: Space.sm,
  },
  riskCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.lg,
    padding: Space.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  riskTitle: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  riskSub: {
    marginTop: 4,
    lineHeight: Type.caption.lineHeight + 2,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
    paddingBottom: Space.lg,
    backgroundColor: Colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
});