import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  Linking,
  Platform,
  Pressable,
  AppState,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ActiveTheme, Colors } from '../constants/colors';
import { EmptyState } from '../components/EmptyState';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { isPaymentMethodAllowed } from '../utils/capabilityPolicy';
import { calculatePlatformChargeGbp } from '../utils/currencyAuthoringFlows';
import { useBackendData } from '../context/BackendDataContext';
import { AddCardSheet } from '../components/checkout/AddCardSheet';
import { CheckoutItemSummary } from '../components/checkout/CheckoutItemSummary';
import { CheckoutSelectionRow } from '../components/checkout/CheckoutSelectionRow';
import { CheckoutPaymentSelector } from '../components/checkout/CheckoutPaymentSelector';
import {
  createCommercePaymentIntent,
  createOrder,
  cancelOrder,
  getPaymentIntentStatus,
  getShippingQuote,
  listUserAddresses,
  listUserPaymentMethods,
  CommerceAddress,
  CommercePaymentMethod,
} from '../services/commerceApi';
import { CapabilityCarrier, getUserCountryCapabilities, UserCountryCapabilities } from '../services/capabilitiesApi';
import { CachedImage } from '../components/CachedImage';
import { haptics } from '../utils/haptics';
import { getListingCoverUri } from '../utils/media';
import { Space, Typography } from '../theme/designTokens';

type RouteT = RouteProp<RootStackParamList, 'Checkout'>;

type CheckoutStage =
  | 'idle'
  | 'creating_order'
  | 'opening_payment'
  | 'awaiting_payment'
  | 'payment_pending'
  | 'payment_failed';

interface CheckoutPostageOption {
  carrierId: string | null;
  label: string;
  etaLabel: string;
  priceFromGbp: number;
  liveQuote: boolean;
  tracking: boolean;
}

const DEFAULT_POSTAGE_OPTION: CheckoutPostageOption = {
  carrierId: null,
  label: 'Standard shipping',
  etaLabel: '2-3 working days',
  priceFromGbp: 2.89,
  liveQuote: false,
  tracking: false,
};

const UNAVAILABLE_REGION_POSTAGE_OPTION: CheckoutPostageOption = {
  carrierId: null,
  label: 'Shipping not available for your region',
  etaLabel: 'Unavailable',
  priceFromGbp: 0,
  liveQuote: false,
  tracking: false,
};

function toEtaLabelFromRange(etaMinDays: number, etaMaxDays: number): string {
  if (etaMinDays === etaMaxDays) {
    return `${etaMinDays} working day${etaMinDays === 1 ? '' : 's'}`;
  }
  return `${etaMinDays}-${etaMaxDays} working days`;
}

function toEtaLabel(carrier: CapabilityCarrier): string {
  return toEtaLabelFromRange(carrier.etaMinDays, carrier.etaMaxDays);
}

const PAYMENT_INTENT_POLL_ATTEMPTS = 12;
const PAYMENT_INTENT_POLL_INTERVAL_MS = 1_500;

type CheckoutPaymentSettlementStatus = 'succeeded' | 'failed' | 'pending';

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForPaymentIntentSettlement(
  intentId: string
): Promise<CheckoutPaymentSettlementStatus> {
  for (let attempt = 0; attempt < PAYMENT_INTENT_POLL_ATTEMPTS; attempt += 1) {
    try {
      const latestIntent = await getPaymentIntentStatus(intentId);
      const normalizedStatus = latestIntent.status.trim().toLowerCase();

      if (normalizedStatus === 'succeeded') {
        return 'succeeded';
      }

      if (normalizedStatus === 'failed' || normalizedStatus === 'cancelled') {
        return 'failed';
      }
    } catch {
      // Continue polling until timeout to absorb transient API/network failures.
    }

    if (attempt < PAYMENT_INTENT_POLL_ATTEMPTS - 1) {
      await wait(PAYMENT_INTENT_POLL_INTERVAL_MS);
    }
  }

  return 'pending';
}

function buildOrderSignature(params: {
  buyerId: string;
  listingId: string;
  addressId?: number;
  paymentMethodId?: number;
  carrierId?: string;
  platformCharge: number;
  postageFee: number;
}): string {
  return [
    params.buyerId,
    params.listingId,
    params.addressId ?? 'none',
    params.paymentMethodId ?? 'none',
    params.carrierId ?? 'none',
    params.platformCharge.toFixed(2),
    params.postageFee.toFixed(2),
  ].join('|');
}

const STAGE_LABELS: Record<CheckoutStage, string> = {
  idle: '',
  creating_order: 'Creating your order…',
  opening_payment: 'Opening secure payment…',
  awaiting_payment: 'Waiting for payment confirmation…',
  payment_pending: 'Payment is still pending.',
  payment_failed: 'Payment failed. Try again.',
};

export default function CheckoutScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<RouteT>();
  const { itemId } = route.params;
  const { listings } = useBackendData();
  const currentUser = useStore((state) => state.currentUser);
  const savedAddress = useStore((state) => state.savedAddress);
  const saveAddress = useStore((state) => state.saveAddress);
  const savedPaymentMethod = useStore((state) => state.savedPaymentMethod);
  const savePaymentMethod = useStore((state) => state.savePaymentMethod);

  const [isHydrating, setIsHydrating] = useState(false);
  const [stage, setStage] = useState<CheckoutStage>('idle');
  const [addCardSheetVisible, setAddCardSheetVisible] = useState(false);
  const [paymentSelectorVisible, setPaymentSelectorVisible] = useState(false);
  const [postageOption, setPostageOption] = useState<CheckoutPostageOption>(DEFAULT_POSTAGE_OPTION);
  const [checkoutCapabilities, setCheckoutCapabilities] = useState<UserCountryCapabilities | null>(null);
  const [backendAddresses, setBackendAddresses] = useState<CommerceAddress[]>([]);
  const [backendPaymentMethods, setBackendPaymentMethods] = useState<CommercePaymentMethod[]>([]);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [capabilityError, setCapabilityError] = useState<string | null>(null);
  const [shippingError, setShippingError] = useState<string | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);
  const { show } = useToast();
  const { formatFromFiat } = useFormattedPrice();

  const createdOrderIdRef = useRef<string | null>(null);
  const createdOrderSignatureRef = useRef<string | null>(null);
  const pendingIntentIdRef = useRef<string | null>(null);
  const isSubmittingRef = useRef(false);
  const appStateRef = useRef(AppState.currentState);

  const item = listings.find((l) => l.id === itemId);

  const isSubmitting = stage === 'creating_order' || stage === 'opening_payment' || stage === 'awaiting_payment';

  // --- Eligibility ---
  const checkoutEligible = useMemo(() => {
    if (!currentUser?.id || !item) return false;
    if (isHydrating || isSubmitting) return false;
    if (!savedAddress?.id) return false;
    if (!savedPaymentMethod?.id) return false;
    if (!postageOption.carrierId) return false;
    if (!isPaymentMethodAllowed(checkoutCapabilities, savedPaymentMethod.type)) return false;
    return true;
  }, [currentUser?.id, item, isHydrating, isSubmitting, savedAddress?.id, savedPaymentMethod?.id, postageOption.carrierId, checkoutCapabilities, savedPaymentMethod?.type]);

  // --- Hydration ---
  const hydrateCheckout = useCallback(async () => {
    const userId = currentUser?.id;
    if (!userId || !item) return;

    setIsHydrating(true);
    setAddressError(null);
    setPaymentError(null);
    setCapabilityError(null);
    setShippingError(null);

    try {
      const [addresses, paymentMethods, capabilities] = await Promise.all([
        listUserAddresses(userId).catch(() => [] as CommerceAddress[]),
        listUserPaymentMethods(userId).catch(() => [] as CommercePaymentMethod[]),
        getUserCountryCapabilities(userId).catch(() => null as UserCountryCapabilities | null),
      ]);

      setBackendAddresses(addresses);
      setBackendPaymentMethods(paymentMethods);

      if (capabilities) {
        setCheckoutCapabilities(capabilities);
      } else {
        setCapabilityError('Could not verify payment capabilities for your region.');
      }

      // Address hydration priority
      if (addresses.length > 0) {
        const matchingAddr = savedAddress?.id
          ? addresses.find((a) => a.id === savedAddress.id)
          : null;
        const preferred = matchingAddr ?? addresses.find((a) => a.isDefault) ?? addresses[0];
        saveAddress({
          id: preferred.id,
          name: preferred.name,
          streetAddress: preferred.streetAddress,
          apartment: preferred.apartment,
          city: preferred.city,
          region: preferred.region,
          postalCode: preferred.postalCode,
          countryCode: preferred.countryCode,
          country: preferred.country,
          isDefault: preferred.isDefault,
        });
      }

      // Payment hydration priority
      if (paymentMethods.length > 0) {
        const matchingPm = savedPaymentMethod?.id
          ? paymentMethods.find((pm) => pm.id === savedPaymentMethod.id)
          : null;
        const preferredPm = matchingPm ?? paymentMethods.find((pm) => pm.isDefault) ?? paymentMethods[0];
        savePaymentMethod({
          id: preferredPm.id,
          type: preferredPm.type,
          label: preferredPm.label,
          details: preferredPm.details ?? undefined,
          isDefault: preferredPm.isDefault,
        });
      } else if (savedPaymentMethod?.id) {
        const stillExists = paymentMethods.find((pm) => pm.id === savedPaymentMethod.id);
        if (!stillExists) {
          savePaymentMethod(null as any);
        }
      }

      // Shipping quote
      if (capabilities) {
        const primaryCarrier = capabilities.postage.carriers[0];
        if (!primaryCarrier) {
          setPostageOption(UNAVAILABLE_REGION_POSTAGE_OPTION);
        } else {
          const fallbackOption: CheckoutPostageOption = {
            carrierId: primaryCarrier.id,
            label: primaryCarrier.label,
            etaLabel: toEtaLabel(primaryCarrier),
            priceFromGbp: primaryCarrier.priceFromGbp,
            liveQuote: false,
            tracking: primaryCarrier.tracking,
          };
          setPostageOption(fallbackOption);

          const addrForQuote = savedAddress?.id
            ? addresses.find((a) => a.id === savedAddress.id)
            : addresses.find((a) => a.isDefault) ?? addresses[0];

          if (addrForQuote?.id || savedAddress?.postalCode) {
            try {
              const quoteResponse = await getShippingQuote({
                buyerId: userId,
                listingId: item.id,
                addressId: addrForQuote?.id ?? savedAddress?.id,
                destinationPostcode: addrForQuote?.postalCode ?? savedAddress?.postalCode,
                preferredCarrierId: primaryCarrier.id,
                declaredValueGbp: item.price,
              });

              const selectedQuote = quoteResponse.recommendedQuote ?? quoteResponse.quotes[0];
              if (selectedQuote) {
                setPostageOption({
                  carrierId: selectedQuote.carrierId,
                  label: selectedQuote.label,
                  etaLabel: toEtaLabelFromRange(selectedQuote.etaMinDays, selectedQuote.etaMaxDays),
                  priceFromGbp: selectedQuote.priceFromGbp,
                  liveQuote: selectedQuote.live,
                  tracking: selectedQuote.tracking,
                });
              }
            } catch {
              setShippingError('Could not get a live shipping quote. Showing estimated pricing.');
            }
          }
        }
      }
    } catch {
      // Keep local state if backend is unavailable
    } finally {
      setIsHydrating(false);
    }
  }, [currentUser?.id, item, savedAddress?.id, savedAddress?.postalCode, saveAddress, savePaymentMethod, savedPaymentMethod?.id]);

  useEffect(() => {
    void hydrateCheckout();
  }, [hydrateCheckout]);

  // Re-fetch on focus (returning from AddressForm)
  useFocusEffect(
    useCallback(() => {
      if (currentUser?.id && item) {
        void hydrateCheckout();
      }
    }, [currentUser?.id, item, hydrateCheckout])
  );

  // --- App resume handling ---
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (
        appStateRef.current.match(/inactive|background/) &&
        nextAppState === 'active' &&
        pendingIntentIdRef.current
      ) {
        void (async () => {
          try {
            const intentId = pendingIntentIdRef.current;
            if (!intentId) return;
            const latest = await getPaymentIntentStatus(intentId);
            const status = latest.status.trim().toLowerCase();
            if (status === 'succeeded' && createdOrderIdRef.current) {
              setStage('idle');
              pendingIntentIdRef.current = null;
              navigation.replace('Success', { orderId: createdOrderIdRef.current });
            } else if (status === 'failed' || status === 'cancelled') {
              setStage('payment_failed');
              pendingIntentIdRef.current = null;
            }
          } catch {
            // Keep pending state
          }
        })();
      }
      appStateRef.current = nextAppState;
    });

    return () => subscription.remove();
  }, [navigation]);

  // --- Cancel stale order on selection change ---
  const cancelStaleOrder = useCallback(async () => {
    if (!createdOrderIdRef.current) return;
    if (stage === 'awaiting_payment' || stage === 'opening_payment') return;

    const orderId = createdOrderIdRef.current;
    createdOrderIdRef.current = null;
    createdOrderSignatureRef.current = null;

    try {
      await cancelOrder(orderId);
    } catch {
      // Non-critical: order may already be cancelled or paid
    }
  }, [stage]);

  // --- Handle Pay ---
  const handlePay = useCallback(async () => {
    if (isSubmittingRef.current) return;
    if (!checkoutEligible) {
      show('Complete address and payment details before paying.', 'error');
      return;
    }

    const userId = currentUser?.id;
    if (!userId || !item) return;

    const PLATFORM_CHARGE = calculatePlatformChargeGbp(item.price);
    const POSTAGE_FEE = postageOption.priceFromGbp;

    const signature = buildOrderSignature({
      buyerId: userId,
      listingId: item.id,
      addressId: savedAddress?.id,
      paymentMethodId: savedPaymentMethod?.id,
      carrierId: postageOption.carrierId ?? undefined,
      platformCharge: PLATFORM_CHARGE,
      postageFee: POSTAGE_FEE,
    });

    isSubmittingRef.current = true;
    setOrderError(null);

    try {
      let orderId: string;

      // Reuse existing order if signature matches
      if (
        createdOrderIdRef.current &&
        createdOrderSignatureRef.current === signature
      ) {
        orderId = createdOrderIdRef.current;
      } else {
        // Cancel any stale order first
        if (createdOrderIdRef.current) {
          await cancelStaleOrder();
        }

        setStage('creating_order');
        const order = await createOrder({
          buyerId: userId,
          listingId: item.id,
          addressId: savedAddress?.id,
          paymentMethodId: savedPaymentMethod?.id,
          platformChargeGbp: PLATFORM_CHARGE,
          postageFeeGbp: POSTAGE_FEE,
          shippingCarrierId: postageOption.carrierId ?? undefined,
        });

        orderId = order.id;
        createdOrderIdRef.current = orderId;
        createdOrderSignatureRef.current = signature;
      }

      // Create payment intent
      setStage('opening_payment');
      const intent = await createCommercePaymentIntent({ orderId });
      pendingIntentIdRef.current = intent.intentId;

      if (intent.nextActionUrl) {
        try {
          const supported = await Linking.canOpenURL(intent.nextActionUrl);
          if (!supported) {
            setStage('payment_failed');
            setOrderError('Unable to open payment page. Please try again.');
            show('Unable to open payment action URL.', 'error');
            isSubmittingRef.current = false;
            return;
          }
          await Linking.openURL(intent.nextActionUrl);
          show('Complete authentication in browser, then return.', 'info');
        } catch {
          setStage('payment_failed');
          setOrderError('Could not open payment page. Please try again.');
          show('Could not open payment page. Please try again.', 'error');
          isSubmittingRef.current = false;
          return;
        }
      }

      // Poll for settlement
      setStage('awaiting_payment');
      const settlementStatus = await waitForPaymentIntentSettlement(intent.intentId);

      if (settlementStatus === 'succeeded') {
        show('Payment completed', 'success');
        pendingIntentIdRef.current = null;
        isSubmittingRef.current = false;
        navigation.replace('Success', { orderId });
        return;
      }

      if (settlementStatus === 'pending') {
        setStage('payment_pending');
        show('Payment is processing. We will update your order shortly.', 'info');
        isSubmittingRef.current = false;
        navigation.replace('OrderDetail', { orderId });
        return;
      }

      // Failed
      setStage('payment_failed');
      setOrderError('Payment could not be completed. Please try again.');
      show('Payment could not be completed. Please try again.', 'error');
    } catch (error: any) {
      setStage('payment_failed');
      const message = error?.message ?? 'Payment could not be completed. Please try again.';
      setOrderError(message);
      show(message, 'error');
    } finally {
      isSubmittingRef.current = false;
    }
  }, [
    checkoutEligible,
    currentUser?.id,
    item,
    postageOption.carrierId,
    postageOption.priceFromGbp,
    savedAddress?.id,
    savedPaymentMethod?.id,
    show,
    navigation,
    cancelStaleOrder,
  ]);

  // --- Close handler ---
  const handleClose = useCallback(() => {
    if (isSubmitting) {
      Alert.alert(
        'Payment in progress',
        'A payment is currently being processed. Are you sure you want to leave?',
        [
          { text: 'Stay', style: 'cancel' },
          { text: 'Leave', style: 'destructive', onPress: () => navigation.goBack() },
        ]
      );
      return;
    }
    navigation.goBack();
  }, [isSubmitting, navigation]);

  // --- Message seller ---
  const handleMessageSeller = useCallback(() => {
    if (!item) return;
    const sellerId = item.sellerId ?? item.seller?.id ?? '';
    if (!sellerId) return;
    navigation.navigate('Chat', {
      conversationId: `checkout_${sellerId}_${item.id}`,
      focusQuery: item.title,
      partnerUserId: sellerId,
    });
  }, [item, navigation]);

  // --- Self-purchase check ---
  const isSelfPurchase = useMemo(() => {
    if (!item || !currentUser?.id) return false;
    const sellerId = item.sellerId ?? item.seller?.id;
    return sellerId === currentUser.id;
  }, [item, currentUser?.id]);

  // --- Render ---

  if (!item) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={Colors.background} />
        <View style={[styles.header, { paddingTop: insets.top }]}>
          <Pressable
            style={styles.closeBtn}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={24} color={Colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>Checkout</Text>
          <View style={styles.headerSpacer} />
        </View>
        <EmptyState
          icon="cube-outline"
          title="Item unavailable"
          subtitle="This listing can no longer be purchased."
          ctaLabel="Go back"
          onCtaPress={() => navigation.goBack()}
        />
      </SafeAreaView>
    );
  }

  if (!currentUser) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={Colors.background} />
        <View style={[styles.header, { paddingTop: insets.top }]}>
          <Pressable
            style={styles.closeBtn}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={24} color={Colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>Checkout</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.signedOutContainer}>
          <Ionicons name="lock-closed-outline" size={36} color={Colors.textMuted} />
          <Text style={styles.signedOutTitle}>Sign in to checkout</Text>
          <Text style={styles.signedOutBody}>
            You need to be signed in to complete your purchase.
          </Text>
          <Pressable
            style={styles.signedOutBtn}
            onPress={() => navigation.navigate('Login')}
            accessibilityRole="button"
            accessibilityLabel="Sign in"
          >
            <Text style={styles.signedOutBtnText}>Sign in</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (isSelfPurchase) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={Colors.background} />
        <View style={[styles.header, { paddingTop: insets.top }]}>
          <Pressable
            style={styles.closeBtn}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={24} color={Colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>Checkout</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.signedOutContainer}>
          <Ionicons name="person-circle-outline" size={36} color={Colors.textMuted} />
          <Text style={styles.signedOutTitle}>Cannot purchase your own listing</Text>
          <Text style={styles.signedOutBody}>
            You cannot buy an item you listed for sale.
          </Text>
          <Pressable
            style={styles.signedOutBtn}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Text style={styles.signedOutBtnText}>Go back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const resolvedSeller = item.seller ?? {
    id: item.sellerId ?? '',
    username: null,
    avatar: null,
    rating: null,
    reviewCount: null,
    location: null,
  };

  const PLATFORM_CHARGE = calculatePlatformChargeGbp(item.price);
  const POSTAGE_FEE = postageOption.priceFromGbp;
  const TOTAL = item.price + PLATFORM_CHARGE + POSTAGE_FEE;

  const allowCardPayments = isPaymentMethodAllowed(checkoutCapabilities, 'card');

  const addressNeedsSave = savedAddress && !savedAddress.id;
  const addressSubtitle = savedAddress
    ? `${savedAddress.streetAddress}${savedAddress.apartment ? `, ${savedAddress.apartment}` : ''}\n${savedAddress.city}${savedAddress.region ? `, ${savedAddress.region}` : ''} · ${savedAddress.postalCode}\n${savedAddress.country}`
    : 'Required for delivery';

  const payLabel = isSubmitting
    ? STAGE_LABELS[stage] || 'Processing…'
    : stage === 'payment_failed'
      ? 'Retry payment'
      : stage === 'payment_pending'
        ? 'Waiting for confirmation…'
        : 'Pay securely';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={Colors.background} />

      {/* 1. Compact close header */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <Pressable
          style={styles.closeBtn}
          onPress={handleClose}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Close checkout"
        >
          <Ionicons name="close" size={24} color={Colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Checkout</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 120 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* 2. Product and seller summary */}
        <CheckoutItemSummary
          title={item.title}
          imageUrl={getListingCoverUri(item.images, '')}
          seller={{
            id: resolvedSeller.id,
            username: resolvedSeller.username,
            avatar: resolvedSeller.avatar,
          }}
          priceLabel={formatFromFiat(item.price, 'GBP')}
          onPressSeller={
            resolvedSeller.id
              ? () => { haptics.tap(); navigation.navigate('UserProfile', { userId: resolvedSeller.id }); }
              : undefined
          }
          onPressMessage={resolvedSeller.id ? () => { haptics.tap(); handleMessageSeller(); } : undefined}
        />

        <View style={styles.sectionDivider} />

        {/* 3. Delivery address */}
        <CheckoutSelectionRow
          label="Delivery address"
          title={savedAddress ? savedAddress.name : 'No address'}
          subtitle={addressSubtitle}
          actionLabel={savedAddress ? 'Change' : 'Add'}
          onPress={() => {
            haptics.tap();
            navigation.navigate('AddressForm', {
              mode: savedAddress ? 'edit' : 'add',
              source: 'checkout',
            });
          }}
          warningText={addressNeedsSave ? 'Needs saving before payment' : undefined}
          errorText={addressError ?? undefined}
          accessibilityLabel={
            savedAddress
              ? `Delivery address: ${savedAddress.name}, ${savedAddress.streetAddress}, ${savedAddress.city}, ${savedAddress.postalCode}, ${savedAddress.country}`
              : 'Add delivery address'
          }
          accessibilityHint="Opens address form to add or edit your delivery address"
        />

        {/* 4. Delivery method */}
        <CheckoutSelectionRow
          label="Delivery"
          title={postageOption.label}
          subtitle={`${postageOption.etaLabel}${postageOption.liveQuote ? '' : ' (Estimated)'}${postageOption.tracking ? ' · Tracking' : ''}`}
          actionLabel={formatFromFiat(POSTAGE_FEE, 'GBP')}
          onPress={() => {
            if ((checkoutCapabilities?.postage.carriers.length ?? 0) > 1) {
              haptics.tap();
              navigation.navigate('Postage');
            }
          }}
          errorText={
            !postageOption.carrierId
              ? 'Shipping not available for your region'
              : shippingError ?? undefined
          }
          accessibilityLabel={`Delivery: ${postageOption.label}, ${postageOption.etaLabel}, ${postageOption.liveQuote ? 'Live quote' : 'Estimated'}, ${formatFromFiat(POSTAGE_FEE, 'GBP')}`}
        />

        {/* 5. Payment method */}
        <CheckoutSelectionRow
          label="Payment"
          title={
            savedPaymentMethod
              ? savedPaymentMethod.label
              : allowCardPayments
                ? 'Add payment method'
                : 'No payment method'
          }
          subtitle={
            !allowCardPayments && checkoutCapabilities
              ? 'Cards unavailable in your region'
              : savedPaymentMethod?.details
                ? savedPaymentMethod.details
                : savedPaymentMethod
                  ? undefined
                  : 'Required before payment'
          }
          actionLabel={savedPaymentMethod ? 'Change' : 'Add'}
          onPress={() => {
            haptics.tap();
            if (!allowCardPayments && checkoutCapabilities) {
              show('Cards are unavailable for your region.', 'error');
              navigation.navigate('Payments');
              return;
            }
            if (backendPaymentMethods.length > 1) {
              setPaymentSelectorVisible(true);
            } else {
              setAddCardSheetVisible(true);
            }
          }}
          errorText={paymentError ?? undefined}
          accessibilityLabel={
            savedPaymentMethod
              ? `Payment method: ${savedPaymentMethod.label}${savedPaymentMethod.details ? `, ${savedPaymentMethod.details}` : ''}`
              : 'Add payment method'
          }
          accessibilityHint="Add or change your payment method"
        />

        <View style={styles.sectionDivider} />

        {/* 6. Price breakdown */}
        <View style={styles.priceBreakdown}>
          <PriceRow label="Item" value={formatFromFiat(item.price, 'GBP')} />
          <PriceRow label="Platform charge" value={formatFromFiat(PLATFORM_CHARGE, 'GBP')} />
          <PriceRow
            label={`Delivery${postageOption.liveQuote ? '' : ' (Estimated)'}`}
            value={formatFromFiat(POSTAGE_FEE, 'GBP')}
          />
          <View style={styles.priceDivider} />
          <PriceRow label="Total" value={formatFromFiat(TOTAL, 'GBP')} bold />
        </View>

        {/* 7. Transaction feedback */}
        {stage !== 'idle' ? (
          <View style={styles.feedbackRow}>
            {isSubmitting ? (
              <ActivityIndicator size="small" color={Colors.brand} />
            ) : stage === 'payment_failed' ? (
              <Ionicons name="alert-circle" size={16} color={Colors.danger} />
            ) : stage === 'payment_pending' ? (
              <Ionicons name="time-outline" size={16} color={Colors.textMuted} />
            ) : null}
            <Text
              style={[
                styles.feedbackText,
                stage === 'payment_failed' && styles.feedbackTextError,
              ]}
            >
              {STAGE_LABELS[stage]}
            </Text>
          </View>
        ) : null}

        {orderError ? (
          <Text style={styles.orderErrorText}>{orderError}</Text>
        ) : null}

        {capabilityError ? (
          <Text style={styles.hintText}>{capabilityError}</Text>
        ) : null}

        <Text style={styles.termsText}>
          By tapping "Pay", you agree to our Terms of Sale and Privacy Policy.
        </Text>
      </ScrollView>

      {/* 8. Sticky total + Pay footer */}
      <View style={[styles.footer, { paddingBottom: insets.bottom > 0 ? insets.bottom : 16 }]}>
        <View style={styles.footerTotalCol}>
          <Text style={styles.footerTotalLabel}>Total</Text>
          <Text style={styles.footerTotalPrice}>{formatFromFiat(TOTAL, 'GBP')}</Text>
        </View>
        <Pressable
          style={[
            styles.payBtn,
            (!checkoutEligible || isSubmitting) && styles.payBtnDisabled,
          ]}
          onPress={() => { haptics.press(); handlePay(); }}
          disabled={!checkoutEligible || isSubmitting}
          accessibilityRole="button"
          accessibilityLabel={`Pay ${formatFromFiat(TOTAL, 'GBP')} securely`}
          accessibilityState={{
            disabled: !checkoutEligible || isSubmitting,
            busy: isSubmitting,
          }}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color={Colors.textInverse} />
          ) : null}
          <Text style={styles.payBtnText}>{payLabel}</Text>
        </Pressable>
      </View>

      {/* Sheets */}
      <AddCardSheet
        visible={addCardSheetVisible}
        onDismiss={() => setAddCardSheetVisible(false)}
        onSuccess={() => {
          if (currentUser?.id) {
            void (async () => {
              try {
                const methods = await listUserPaymentMethods(currentUser.id);
                setBackendPaymentMethods(methods);
                const preferred = methods.find((pm) => pm.isDefault) ?? methods[0];
                if (preferred) {
                  savePaymentMethod({
                    id: preferred.id,
                    type: preferred.type,
                    label: preferred.label,
                    details: preferred.details ?? undefined,
                    isDefault: preferred.isDefault,
                  });
                }
              } catch {
                // Keep current state
              }
            })();
          }
        }}
      />
      <CheckoutPaymentSelector
        visible={paymentSelectorVisible}
        onDismiss={() => setPaymentSelectorVisible(false)}
        methods={backendPaymentMethods}
        selectedId={savedPaymentMethod?.id}
        onSelect={(method) => {
          haptics.tap();
          savePaymentMethod({
            id: method.id,
            type: method.type,
            label: method.label,
            details: method.details ?? undefined,
            isDefault: method.isDefault,
          });
          void cancelStaleOrder();
        }}
      />
    </SafeAreaView>
  );
}

function PriceRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={priceStyles.row}>
      <Text style={[priceStyles.label, bold && priceStyles.labelBold]}>{label}</Text>
      <Text style={[priceStyles.value, bold && priceStyles.valueBold]}>{value}</Text>
    </View>
  );
}

const priceStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  label: {
    fontSize: 14,
    fontFamily: Typography.family.regular,
    color: Colors.textSecondary,
  },
  labelBold: {
    fontSize: 16,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  value: {
    fontSize: 14,
    fontFamily: Typography.family.medium,
    color: Colors.textPrimary,
  },
  valueBold: {
    fontSize: 18,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
  },
});

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
  closeBtn: {
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
  scrollContent: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
  },
  sectionDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginVertical: Space.sm,
  },
  priceBreakdown: {
    paddingVertical: Space.sm,
  },
  priceDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginVertical: Space.sm,
  },
  feedbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.md,
  },
  feedbackText: {
    fontSize: 14,
    fontFamily: Typography.family.medium,
    color: Colors.textSecondary,
  },
  feedbackTextError: {
    color: Colors.danger,
  },
  orderErrorText: {
    fontSize: 14,
    fontFamily: Typography.family.medium,
    color: Colors.danger,
    paddingVertical: Space.sm,
  },
  hintText: {
    fontSize: 13,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    paddingVertical: Space.xs,
  },
  termsText: {
    fontSize: 12,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    lineHeight: 18,
    textAlign: 'center',
    paddingTop: Space.md,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    backgroundColor: Colors.background,
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
  },
  footerTotalCol: {
    flex: 1,
  },
  footerTotalLabel: {
    fontSize: 13,
    fontFamily: Typography.family.regular,
    color: Colors.textSecondary,
  },
  footerTotalPrice: {
    fontSize: 22,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
  },
  payBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
    minWidth: 180,
    paddingVertical: 14,
    paddingHorizontal: Space.lg,
    borderRadius: 10,
    backgroundColor: Colors.brand,
    minHeight: 48,
  },
  payBtnDisabled: {
    opacity: 0.5,
  },
  payBtnText: {
    fontSize: 16,
    fontFamily: Typography.family.semibold,
    color: Colors.textInverse,
  },
  signedOutContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.xl,
    gap: Space.md,
  },
  signedOutTitle: {
    fontSize: 18,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  signedOutBody: {
    fontSize: 14,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  signedOutBtn: {
    marginTop: Space.sm,
    paddingVertical: 14,
    paddingHorizontal: Space.xl,
    borderRadius: 10,
    backgroundColor: Colors.brand,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signedOutBtnText: {
    fontSize: 16,
    fontFamily: Typography.family.semibold,
    color: Colors.textInverse,
  },
});
