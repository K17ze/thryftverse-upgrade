import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { getOrder, shipOrder, type CommerceOrder } from '../services/commerceApi';
import { parseApiError } from '../lib/apiClient';
import { fetchJson } from '../lib/apiClient';
import { CachedImage } from '../components/CachedImage';
import { normaliseOrderStatus, humaniseStatus } from '../components/orders/orderCapabilities';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { FlagshipScreen, FlagshipHeader, FlagshipState } from '../components/flagship';

type SellerFulfilmentRoute = RouteProp<{ SellerFulfilment: { orderId: string } }, 'SellerFulfilment'>;

const haptics = {
  tap: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  heavyPress: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy),
};

const COMMON_CARRIERS = [
  'Royal Mail',
  'DPD',
  'Evri',
  'Yodel',
  'UPS',
  'DHL',
  'FedEx',
  'Manual',
];

export default function SellerFulfilmentScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<SellerFulfilmentRoute>();
  const { formatFromFiat } = useFormattedPrice();
  const { show } = useToast();
  const currentUser = useStore((state) => state.currentUser);
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const { orderId } = route.params;

  const [order, setOrder] = useState<CommerceOrder | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isShipping, setIsShipping] = useState(false);

  const [trackingNumber, setTrackingNumber] = useState('');
  const [shippingProvider, setShippingProvider] = useState('');
  const [showCarrierDropdown, setShowCarrierDropdown] = useState(false);
  const [isGeneratingLabel, setIsGeneratingLabel] = useState(false);
  const [generatedLabelUrl, setGeneratedLabelUrl] = useState<string | null>(null);

  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  const fetchOrder = useCallback(async () => {
    try {
      const fetched = await getOrder(orderId);
      if (!isMountedRef.current) return;
      setOrder(fetched);
      setLoadError(null);

      if (fetched.trackingNumber) setTrackingNumber(fetched.trackingNumber);
      if (fetched.shippingProvider) setShippingProvider(fetched.shippingProvider);
    } catch (error) {
      if (!isMountedRef.current) return;
      setLoadError('Order could not be loaded. Check your connection and try again.');
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    void fetchOrder();
  }, [fetchOrder]);

  const isSeller = currentUser?.id === order?.sellerId;
  const canShip = isSeller && normaliseOrderStatus(order?.status ?? '') === 'paid';

  const handleShip = useCallback(async () => {
    if (!canShip || isShipping) return;
    setIsShipping(true);
    haptics.heavyPress();
    try {
      await shipOrder(orderId, {
        trackingNumber: trackingNumber.trim() || undefined,
        shippingProvider: shippingProvider.trim() || undefined,
      });
      show('Order marked as shipped', 'success');
      navigation.goBack();
    } catch (error) {
      show(parseApiError(error).message, 'error');
    } finally {
      if (isMountedRef.current) setIsShipping(false);
    }
  }, [canShip, isShipping, orderId, trackingNumber, shippingProvider, show, navigation]);

  const handleGenerateLabel = useCallback(async () => {
    if (isGeneratingLabel) return;
    setIsGeneratingLabel(true);
    haptics.tap();
    try {
      // Request label generation from backend
      const res = await fetchJson<{ shippingLabelUrl?: string; trackingNumber?: string }>(
        `/orders/${orderId}/shipping-label`,
        { method: 'POST', body: JSON.stringify({ carrier: shippingProvider || 'Royal Mail' }) }
      );
      if (res.shippingLabelUrl) {
        setGeneratedLabelUrl(res.shippingLabelUrl);
        show('Shipping label generated. Tap to print.', 'success');
      }
      if (res.trackingNumber && !trackingNumber) {
        setTrackingNumber(res.trackingNumber);
      }
    } catch {
      // Backend endpoint not available — show truthful message
      show('Label generation requires carrier integration. Enter tracking manually.', 'info');
    } finally {
      if (isMountedRef.current) setIsGeneratingLabel(false);
    }
  }, [isGeneratingLabel, orderId, shippingProvider, trackingNumber, show]);

  if (isLoading) {
    return (
      <FlagshipScreen header={<FlagshipHeader title="Dispatch" onBack={() => navigation.goBack()} />}>
        <FlagshipState variant="loading" />
      </FlagshipScreen>
    );
  }

  if (loadError || !order) {
    return (
      <FlagshipScreen header={<FlagshipHeader title="Dispatch" onBack={() => navigation.goBack()} />}>
        <FlagshipState
          variant="error"
          icon="cloud-offline-outline"
          title="Order could not be loaded"
          actionLabel="Retry"
          onAction={() => { setLoadError(null); setIsLoading(true); void fetchOrder(); }}
        />
      </FlagshipScreen>
    );
  }

  if (!isSeller) {
    return (
      <FlagshipScreen header={<FlagshipHeader title="Dispatch" onBack={() => navigation.goBack()} />}>
        <FlagshipState
          variant="empty"
          icon="lock-closed-outline"
          title="Only the seller can dispatch this order"
        />
      </FlagshipScreen>
    );
  }

  const shortOrderId = order.id.slice(0, 8).toUpperCase();
  const statusLabel = humaniseStatus(order.status);

  return (
    <FlagshipScreen
      header={<FlagshipHeader title="Dispatch item" onBack={() => navigation.goBack()} />}
      scrollEnabled={false}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 100 + insets.bottom }]}
      >
        {/* Hero summary — order status */}
        <Reanimated.View entering={FadeInDown.duration(300)}>
          <View style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.heroRow}>
              <View style={[styles.heroIcon, { backgroundColor: colors.brand }]}>
                <Ionicons name="cube" size={18} color={colors.textInverse} />
              </View>
              <View style={styles.heroText}>
                <Text style={[styles.heroTitle, { color: colors.textPrimary }]}>ORDER #{shortOrderId}</Text>
                <Text style={[styles.heroSubtitle, { color: colors.textSecondary }]}>{statusLabel}</Text>
              </View>
            </View>
          </View>
        </Reanimated.View>

        <Reanimated.View entering={FadeInDown.duration(300).delay(60)}>
        <View style={styles.itemCard}>
          {order.listingImageUrl ? (
            <CachedImage uri={order.listingImageUrl} style={styles.itemImage} contentFit="cover" />
          ) : (
            <View style={[styles.itemImage, styles.itemImagePlaceholder]}>
              <Ionicons name="image-outline" size={24} color={colors.textMuted} />
            </View>
          )}
          <View style={styles.itemInfo}>
            <Text style={styles.itemTitle} numberOfLines={2}>{order.listingTitle || 'Ordered item'}</Text>
            <Text style={styles.itemTotal}>{formatFromFiat(order.totalGbp, 'GBP', { displayMode: 'fiat' })}</Text>
          </View>
        </View>
        </Reanimated.View>

        <View style={styles.sectionDivider} />

        {/* Seller-side escrow narrative — when funds are held */}
        <Reanimated.View entering={FadeInDown.duration(300).delay(120)}>
        {(() => {
          const normalised = normaliseOrderStatus(order.status);
          const isHeld = normalised === 'paid' || normalised === 'shipped' || normalised === 'in transit' || normalised === 'out for delivery';
          if (!isHeld) return null;
          const shippedAt = order.shippedAt ? new Date(order.shippedAt).getTime() : null;
          const autoReleaseMs = 14 * 24 * 60 * 60 * 1000;
          const releaseTime = shippedAt ? shippedAt + autoReleaseMs : null;
          const now = Date.now();
          const daysLeft = releaseTime ? Math.ceil((releaseTime - now) / (24 * 60 * 60 * 1000)) : null;
          return (
            <View style={styles.escrowBanner}>
              <View style={styles.escrowIconWrap}>
                <Ionicons name="lock-closed" size={14} color={colors.success} />
              </View>
              <View style={styles.escrowTextWrap}>
                <Text style={styles.escrowTitle}>Funds held in escrow</Text>
                <Text style={styles.escrowSub}>
                  {normalised === 'paid'
                    ? 'Buyer\'s payment is safely held. Dispatch your item to start the release countdown.'
                    : 'Buyer\'s payment is held until they confirm receipt.'}
                </Text>
                {daysLeft != null && daysLeft > 0 && (
                  <Text style={styles.escrowCountdown}>
                    Auto-releases to you in {daysLeft} day{daysLeft === 1 ? '' : 's'} if the buyer doesn't act
                  </Text>
                )}
              </View>
            </View>
          );
        })()}
        </Reanimated.View>

        <View style={styles.sectionDivider} />

        <Reanimated.View entering={FadeInDown.duration(300).delay(180)}>
        <Text style={styles.sectionLabel}>Shipping details</Text>

        <Text style={styles.inputLabel}>Carrier</Text>
        <Pressable
          style={styles.carrierSelector}
          onPress={() => { haptics.tap(); setShowCarrierDropdown(!showCarrierDropdown); }}
          accessibilityRole="button"
          accessibilityLabel="Select carrier"
        >
          <Text style={[styles.carrierSelectorText, !shippingProvider && styles.placeholderText]}>
            {shippingProvider || 'Select carrier (optional)'}
          </Text>
          <Ionicons name={showCarrierDropdown ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
        </Pressable>

        {showCarrierDropdown && (
          <View style={styles.carrierDropdown}>
            {COMMON_CARRIERS.map((carrier) => (
              <Pressable
                key={carrier}
                style={styles.carrierOption}
                onPress={() => {
                  haptics.tap();
                  setShippingProvider(carrier);
                  setShowCarrierDropdown(false);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Select ${carrier}`}
              >
                <Text style={[
                  styles.carrierOptionText,
                  shippingProvider === carrier && styles.carrierOptionTextActive,
                ]}>
                  {carrier}
                </Text>
                {shippingProvider === carrier && (
                  <Ionicons name="checkmark" size={16} color={colors.brand} />
                )}
              </Pressable>
            ))}
          </View>
        )}

        <Text style={styles.inputLabel}>Tracking number</Text>
        <TextInput
          style={styles.textInput}
          placeholder="Enter tracking number (optional)"
          placeholderTextColor={colors.textMuted}
          value={trackingNumber}
          onChangeText={setTrackingNumber}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Tracking number"
        />

        {/* Generate shipping label */}
        {canShip && (
          <View style={styles.labelSection}>
            <Pressable
              style={[styles.generateLabelBtn, isGeneratingLabel && styles.generateLabelBtnDisabled]}
              onPress={handleGenerateLabel}
              disabled={isGeneratingLabel}
              accessibilityRole="button"
              accessibilityLabel="Generate shipping label"
            >
              {isGeneratingLabel ? (
                <ActivityIndicator size="small" color={colors.brand} />
              ) : (
                <>
                  <Ionicons name="document-text-outline" size={18} color={colors.brand} />
                  <Text style={styles.generateLabelBtnText}>
                    {generatedLabelUrl ? 'Regenerate label' : 'Generate shipping label'}
                  </Text>
                </>
              )}
            </Pressable>

            {generatedLabelUrl && (
              <Pressable
                style={styles.printLabelBtn}
                onPress={() => {
                  haptics.tap();
                  navigation.navigate('ChatMediaPreview', {
                    mediaUri: generatedLabelUrl,
                    mediaType: 'image',
                    senderLabel: 'Shipping label',
                  });
                }}
                accessibilityRole="button"
                accessibilityLabel="View and print shipping label"
              >
                <Ionicons name="print-outline" size={18} color={colors.textPrimary} />
                <Text style={styles.printLabelBtnText}>View & print label</Text>
              </Pressable>
            )}
          </View>
        )}

        <Text style={styles.hintText}>
          You can mark the order as shipped without tracking details and add them later.
        </Text>

        {!canShip && (
          <View style={styles.warningBanner}>
            <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
            <Text style={styles.warningText}>
              This order cannot be dispatched from its current status ({statusLabel}).
            </Text>
          </View>
        )}
        </Reanimated.View>
      </ScrollView>

      {canShip && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + Space.md }]}>
          <Pressable
            style={[styles.shipBtn, isShipping && styles.shipBtnDisabled]}
            onPress={() => {
              haptics.heavyPress();
              Alert.alert(
                'Mark as shipped?',
                trackingNumber.trim()
                  ? `The order will be marked as shipped with tracking number ${trackingNumber.trim()}.`
                  : 'The order will be marked as shipped without tracking details. You can add tracking information later.',
                [
                  { text: 'Not yet', style: 'cancel' },
                  { text: 'Mark shipped', style: 'destructive', onPress: handleShip },
                ]
              );
            }}
            disabled={isShipping}
            accessibilityRole="button"
            accessibilityLabel="Mark order as shipped"
          >
            {isShipping ? (
              <ActivityIndicator size="small" color={colors.textInverse} />
            ) : (
              <Text style={styles.shipBtnText}>Mark as shipped</Text>
            )}
          </Pressable>
        </View>
      )}
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  heroCard: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Space.md,
    marginBottom: Space.md,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
  },
  heroIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroText: { flex: 1 },
  heroTitle: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  heroSubtitle: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.bold,
    marginTop: 2,
  },
  scrollContent: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
  },
  itemCard: {
    flexDirection: 'row',
    gap: Space.md,
    paddingVertical: Space.sm,
  },
  itemImage: {
    width: 64,
    height: 80,
    borderRadius: Radius.sm,
  },
  itemImagePlaceholder: {
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemInfo: {
    flex: 1,
    gap: 4,
    justifyContent: 'center',
  },
  itemTitle: {
    fontSize: 15,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
    lineHeight: 20,
  },
  itemTotal: {
    fontSize: 15,
    fontFamily: Typography.family.bold,
    color: colors.textPrimary,
  },
  sectionDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: Space.sm,
  },
  escrowBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    borderRadius: 12,
    backgroundColor: `${colors.success}08`,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: `${colors.success}25`,
  },
  escrowIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: `${colors.success}15`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  escrowTextWrap: {
    flex: 1,
    gap: 2,
  },
  escrowTitle: {
    fontSize: 13,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
  },
  escrowSub: {
    fontSize: 12,
    fontFamily: Typography.family.regular,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  escrowCountdown: {
    fontSize: 11,
    fontFamily: Typography.family.medium,
    color: colors.textMuted,
    marginTop: 2,
  },
  sectionLabel: {
    fontSize: 13,
    fontFamily: Typography.family.semibold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: Space.sm,
  },
  inputLabel: {
    fontSize: 14,
    fontFamily: Typography.family.medium,
    color: colors.textSecondary,
    marginBottom: 6,
    marginTop: Space.sm,
  },
  carrierSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    height: 48,
    borderRadius: 10,
    backgroundColor: colors.surface,
    minHeight: 48,
  },
  carrierSelectorText: {
    fontSize: 15,
    fontFamily: Typography.family.regular,
    color: colors.textPrimary,
  },
  placeholderText: {
    color: colors.textMuted,
  },
  carrierDropdown: {
    marginTop: 4,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  carrierOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: 14,
    minHeight: 44,
  },
  carrierOptionText: {
    fontSize: 15,
    fontFamily: Typography.family.regular,
    color: colors.textSecondary,
  },
  carrierOptionTextActive: {
    color: colors.textPrimary,
    fontFamily: Typography.family.semibold,
  },
  textInput: {
    paddingHorizontal: Space.md,
    height: 48,
    borderRadius: 10,
    backgroundColor: colors.surface,
    fontSize: 15,
    fontFamily: Typography.family.regular,
    color: colors.textPrimary,
    minHeight: 48,
  },
  hintText: {
    fontSize: 13,
    fontFamily: Typography.family.regular,
    color: colors.textMuted,
    marginTop: Space.xs,
    lineHeight: 18,
  },
  labelSection: {
    marginTop: Space.md,
    gap: Space.sm,
  },
  generateLabelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: Space.sm + 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.brand,
    backgroundColor: `${colors.brand}08`,
  },
  generateLabelBtnDisabled: {
    opacity: 0.6,
  },
  generateLabelBtnText: {
    fontSize: 14,
    fontFamily: Typography.family.semibold,
    color: colors.brand,
  },
  printLabelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: Space.sm + 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  printLabelBtnText: {
    fontSize: 14,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: Space.md,
    padding: Space.sm,
    borderRadius: 8,
    backgroundColor: colors.surface,
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    fontFamily: Typography.family.regular,
    color: colors.danger,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  shipBtn: {
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  shipBtnDisabled: {
    opacity: 0.6,
  },
  shipBtnText: {
    fontSize: 16,
    fontFamily: Typography.family.bold,
    color: colors.textInverse,
  },
  });
}
