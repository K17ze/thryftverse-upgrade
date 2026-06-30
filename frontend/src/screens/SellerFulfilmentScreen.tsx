import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { ActiveTheme, Colors } from '../constants/colors';
import { Space, Typography } from '../theme/designTokens';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { getOrder, shipOrder, type CommerceOrder } from '../services/commerceApi';
import { parseApiError } from '../lib/apiClient';
import { CachedImage } from '../components/CachedImage';
import { normaliseOrderStatus, humaniseStatus } from '../components/orders/orderCapabilities';

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

  const { orderId } = route.params;

  const [order, setOrder] = useState<CommerceOrder | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isShipping, setIsShipping] = useState(false);

  const [trackingNumber, setTrackingNumber] = useState('');
  const [shippingProvider, setShippingProvider] = useState('');
  const [showCarrierDropdown, setShowCarrierDropdown] = useState(false);

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

  if (isLoading) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={Colors.background} />
        <View style={[styles.header, { paddingTop: insets.top }]}>
          <Pressable style={styles.headerBtn} onPress={() => navigation.goBack()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityRole="button" accessibilityLabel="Go back">
            <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>Dispatch</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.textSecondary} />
          <Text style={styles.loadingText}>Loading order…</Text>
        </View>
      </View>
    );
  }

  if (loadError || !order) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={Colors.background} />
        <View style={[styles.header, { paddingTop: insets.top }]}>
          <Pressable style={styles.headerBtn} onPress={() => navigation.goBack()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityRole="button" accessibilityLabel="Go back">
            <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>Dispatch</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.errorContainer}>
          <Ionicons name="cloud-offline-outline" size={36} color={Colors.textMuted} />
          <Text style={styles.errorTitle}>Order could not be loaded</Text>
          <Pressable style={styles.retryBtn} onPress={() => { setLoadError(null); setIsLoading(true); void fetchOrder(); }} accessibilityRole="button" accessibilityLabel="Retry">
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (!isSeller) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={Colors.background} />
        <View style={[styles.header, { paddingTop: insets.top }]}>
          <Pressable style={styles.headerBtn} onPress={() => navigation.goBack()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityRole="button" accessibilityLabel="Go back">
            <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>Dispatch</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.errorContainer}>
          <Ionicons name="lock-closed-outline" size={36} color={Colors.textMuted} />
          <Text style={styles.errorTitle}>Only the seller can dispatch this order</Text>
        </View>
      </View>
    );
  }

  const shortOrderId = order.id.slice(0, 8).toUpperCase();
  const statusLabel = humaniseStatus(order.status);

  return (
    <View style={styles.container}>
      <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={Colors.background} />

      <View style={[styles.header, { paddingTop: insets.top }]}>
        <Pressable style={styles.headerBtn} onPress={() => navigation.goBack()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Dispatch item</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 100 + insets.bottom }]}
      >
        <View style={styles.orderSummary}>
          <Text style={styles.orderNumber}>ORDER #{shortOrderId}</Text>
          <Text style={styles.statusLabel}>{statusLabel}</Text>
        </View>

        <View style={styles.itemCard}>
          {order.listingImageUrl ? (
            <CachedImage uri={order.listingImageUrl} style={styles.itemImage} contentFit="cover" />
          ) : (
            <View style={[styles.itemImage, styles.itemImagePlaceholder]}>
              <Ionicons name="image-outline" size={24} color={Colors.textMuted} />
            </View>
          )}
          <View style={styles.itemInfo}>
            <Text style={styles.itemTitle} numberOfLines={2}>{order.listingTitle || 'Ordered item'}</Text>
            <Text style={styles.itemTotal}>{formatFromFiat(order.totalGbp, 'GBP', { displayMode: 'fiat' })}</Text>
          </View>
        </View>

        <View style={styles.sectionDivider} />

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
          <Ionicons name={showCarrierDropdown ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.textMuted} />
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
                  <Ionicons name="checkmark" size={16} color={Colors.brand} />
                )}
              </Pressable>
            ))}
          </View>
        )}

        <Text style={styles.inputLabel}>Tracking number</Text>
        <TextInput
          style={styles.textInput}
          placeholder="Enter tracking number (optional)"
          placeholderTextColor={Colors.textMuted}
          value={trackingNumber}
          onChangeText={setTrackingNumber}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Tracking number"
        />

        <Text style={styles.hintText}>
          You can mark the order as shipped without tracking details and add them later.
        </Text>

        {!canShip && (
          <View style={styles.warningBanner}>
            <Ionicons name="alert-circle-outline" size={16} color={Colors.danger} />
            <Text style={styles.warningText}>
              This order cannot be dispatched from its current status ({statusLabel}).
            </Text>
          </View>
        )}
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
              <ActivityIndicator size="small" color={Colors.textInverse} />
            ) : (
              <Text style={styles.shipBtnText}>Mark as shipped</Text>
            )}
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingBottom: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  headerBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  headerSpacer: {
    width: 44,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.md,
  },
  loadingText: {
    fontSize: 14,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.xl,
    gap: Space.md,
  },
  errorTitle: {
    fontSize: 18,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  retryBtn: {
    paddingVertical: 14,
    paddingHorizontal: Space.xl,
    borderRadius: 10,
    backgroundColor: Colors.brand,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryBtnText: {
    fontSize: 16,
    fontFamily: Typography.family.semibold,
    color: Colors.textInverse,
  },
  scrollContent: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
  },
  orderSummary: {
    paddingVertical: Space.sm,
    gap: 4,
  },
  orderNumber: {
    fontSize: 12,
    fontFamily: Typography.family.semibold,
    color: Colors.textMuted,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  statusLabel: {
    fontSize: 22,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
  },
  itemCard: {
    flexDirection: 'row',
    gap: Space.md,
    paddingVertical: Space.sm,
  },
  itemImage: {
    width: 64,
    height: 80,
    borderRadius: 6,
  },
  itemImagePlaceholder: {
    backgroundColor: Colors.surface,
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
    color: Colors.textPrimary,
    lineHeight: 20,
  },
  itemTotal: {
    fontSize: 15,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
  },
  sectionDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginVertical: Space.sm,
  },
  sectionLabel: {
    fontSize: 13,
    fontFamily: Typography.family.semibold,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: Space.sm,
  },
  inputLabel: {
    fontSize: 14,
    fontFamily: Typography.family.medium,
    color: Colors.textSecondary,
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
    backgroundColor: Colors.surface,
    minHeight: 48,
  },
  carrierSelectorText: {
    fontSize: 15,
    fontFamily: Typography.family.regular,
    color: Colors.textPrimary,
  },
  placeholderText: {
    color: Colors.textMuted,
  },
  carrierDropdown: {
    marginTop: 4,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
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
    color: Colors.textSecondary,
  },
  carrierOptionTextActive: {
    color: Colors.textPrimary,
    fontFamily: Typography.family.semibold,
  },
  textInput: {
    paddingHorizontal: Space.md,
    height: 48,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    fontSize: 15,
    fontFamily: Typography.family.regular,
    color: Colors.textPrimary,
    minHeight: 48,
  },
  hintText: {
    fontSize: 13,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    marginTop: Space.xs,
    lineHeight: 18,
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: Space.md,
    padding: Space.sm,
    borderRadius: 8,
    backgroundColor: Colors.surface,
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    fontFamily: Typography.family.regular,
    color: Colors.danger,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    backgroundColor: Colors.background,
  },
  shipBtn: {
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: Colors.brand,
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
    color: Colors.textInverse,
  },
});
