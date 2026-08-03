import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  Platform,
  Pressable,
  AppState,
  Alert,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import {
  initPaymentSheet,
  PaymentSheetError,
  presentPaymentSheet,
} from '@stripe/stripe-react-native';
import { useAppTheme } from '../theme/ThemeContext';
import { EmptyState } from '../components/EmptyState';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useConnectivity } from '../hooks/useConnectivity';
import { isPaymentMethodAllowed } from '../utils/capabilityPolicy';
import { calculatePlatformChargeGbp } from '../utils/currencyAuthoringFlows';
import { useBackendData } from '../context/BackendDataContext';
import { AddCardSheet } from '../components/checkout/AddCardSheet';
import { CheckoutItemSummary } from '../components/checkout/CheckoutItemSummary';
import { CheckoutSelectionRow } from '../components/checkout/CheckoutSelectionRow';
import { CheckoutPaymentSelector } from '../components/checkout/CheckoutPaymentSelector';
import {
  createCommercePaymentIntent,
  createStripeOrderSheet,
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
import { CommerceDetailOfflineBanner } from '../components/commerce/detail';
import { BuyerProtectionStrip } from '../components/product';
import { getIzePosition } from '../services/walletApi';
import { haptics } from '../utils/haptics';
import { getListingCoverUri } from '../utils/media';
import { Space, Typography, Radius, Stroke } from '../theme/designTokens';
import { createStableId } from '../utils/createStableId';
import {
  configureStripeMobile,
  getStripeReturnUrl,
} from '../platform/payments/stripeMobile';

type RouteT = RouteProp<RootStackParamList, 'Checkout'>;

type CheckoutStage =
  | 'idle'
  | 'creating_order'
  | 'opening_payment'
  | 'awaiting_payment'
  | 'payment_pending'
  | 'payment_failed';

interface CheckoutPostageOption {
  quoteId: string | null;
  carrierId: string | null;
  label: string;
  etaLabel: string;
  priceFromGbp: number;
  liveQuote: boolean;
  tracking: boolean;
}

const DEFAULT_POSTAGE_OPTION: CheckoutPostageOption = {
  quoteId: null,
  carrierId: null,
  label: 'Standard shipping',
  etaLabel: '2-3 working days',
  priceFromGbp: 2.89,
  liveQuote: false,
  tracking: false,
};

const UNAVAILABLE_REGION_POSTAGE_OPTION: CheckoutPostageOption = {
  quoteId: null,
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
// Extended polling for 3DS/SCA re-authentication: up to 5 minutes.
const PAYMENT_INTENT_SCA_POLL_ATTEMPTS = 100;
const PAYMENT_INTENT_SCA_POLL_INTERVAL_MS = 3_000;

type CheckoutPaymentSettlementStatus = 'succeeded' | 'failed' | 'pending' | 'aborted';

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForPaymentIntentSettlement(
  intentId: string,
  shouldContinue: () => boolean
): Promise<CheckoutPaymentSettlementStatus> {
  let maxAttempts = PAYMENT_INTENT_POLL_ATTEMPTS;
  let intervalMs = PAYMENT_INTENT_POLL_INTERVAL_MS;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (!shouldContinue()) {
      return 'aborted';
    }

    try {
      const latestIntent = await getPaymentIntentStatus(intentId);
      const normalizedStatus = latestIntent.status.trim().toLowerCase();

      if (normalizedStatus === 'succeeded') {
        return 'succeeded';
      }

      if (normalizedStatus === 'failed' || normalizedStatus === 'cancelled') {
        return 'failed';
      }

      // ── 3DS/SCA re-authentication ─────────────────────────────────────
      // When the intent requires action (e.g., 3DS challenge), extend the
      // polling window and open the next_action_url for the user to
      // authenticate with their bank.
      if (normalizedStatus === 'requires_action' || normalizedStatus === 'requires_confirmation') {
        const nextActionUrl = (latestIntent as { nextActionUrl?: string | null }).nextActionUrl;
        if (nextActionUrl) {
          // Open the bank's 3DS authentication page in the device browser.
          try {
            await Linking.openURL(nextActionUrl);
          } catch {
            // Linking may fail on some platforms; the user can also
            // complete auth in the PaymentSheet.
          }
        }
        // Switch to extended polling (5 min) to allow time for 3DS.
        maxAttempts = PAYMENT_INTENT_SCA_POLL_ATTEMPTS;
        intervalMs = PAYMENT_INTENT_SCA_POLL_INTERVAL_MS;
      }
    } catch {
      // Continue polling until timeout to absorb transient API/network failures.
    }

    if (!shouldContinue()) {
      return 'aborted';
    }

    if (attempt < maxAttempts - 1) {
      await wait(intervalMs);
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
  walletDebit?: number;
}): string {
  return [
    params.buyerId,
    params.listingId,
    params.addressId ?? 'none',
    params.paymentMethodId ?? 'none',
    params.carrierId ?? 'none',
    params.platformCharge.toFixed(2),
    params.postageFee.toFixed(2),
    params.walletDebit?.toFixed(2) ?? 'none',
  ].join('|');
}

const STAGE_LABELS: Record<CheckoutStage, string> = {
  idle: '',
  creating_order: 'Creating your order…',
  opening_payment: 'Preparing payment…',
  awaiting_payment: 'Confirming payment…',
  payment_pending: 'Payment is still pending.',
  payment_failed: 'Payment failed. Try again.',
};

export default function CheckoutScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<RouteT>();
  const { itemId } = route.params;
  const { colors, isDark } = useAppTheme();
  const reducedMotionEnabled = useReducedMotion();
  const { isOffline } = useConnectivity();
  const { listings } = useBackendData();

  // Theme-aware color overrides for the static styles. The static
  // StyleSheet contains only non-color properties; colors are applied
  // via this themed proxy so the screen is fully dark-mode compatible.
  const t = useMemo(() => ({
    container: { backgroundColor: colors.background },
    header: { borderBottomColor: colors.border },
    headerTitle: { color: colors.textPrimary },
    sectionDivider: { backgroundColor: colors.border },
    priceBreakdownCard: {},
    priceBreakdownTitle: { color: colors.textMuted },
    priceDivider: { backgroundColor: colors.border },
    savingsBadge: { backgroundColor: `${colors.success}12` },
    savingsText: { color: colors.success },
    protectionIncludedText: { color: colors.success },
    balanceToggle: { backgroundColor: colors.surface, borderColor: colors.border },
    balanceSwitch: { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
    balanceSwitchOn: { backgroundColor: colors.success, borderColor: colors.success },
    balanceKnob: { backgroundColor: colors.textMuted },
    balanceKnobOn: { backgroundColor: colors.textInverse },
    balanceLabel: { color: colors.textPrimary },
    balanceAmount: { color: colors.textMuted },
    feedbackText: { color: colors.textSecondary },
    feedbackTextError: { color: colors.danger },
    orderErrorText: { color: colors.danger },
    hintText: { color: colors.textMuted },
    termsText: { color: colors.textMuted },
    footer: { borderTopColor: colors.border, backgroundColor: colors.background },
    footerTotalLabel: { color: colors.textSecondary },
    footerTotalPrice: { color: colors.textPrimary },
    payBtn: { backgroundColor: colors.brand },
    payBtnText: { color: colors.textInverse },
    signedOutTitle: { color: colors.textPrimary },
    signedOutBody: { color: colors.textMuted },
    signedOutBtn: { backgroundColor: colors.brand },
    signedOutBtnText: { color: colors.textInverse },
  }), [colors]);
  const currentUser = useStore((state) => state.currentUser);
  const savedAddress = useStore((state) => state.savedAddress);
  const saveAddress = useStore((state) => state.saveAddress);
  const clearSavedAddress = useStore((state) => state.clearSavedAddress);
  const savedPaymentMethod = useStore((state) => state.savedPaymentMethod);
  const savePaymentMethod = useStore((state) => state.savePaymentMethod);
  const clearSavedPaymentMethod = useStore((state) => state.clearSavedPaymentMethod);

  const [isHydrating, setIsHydrating] = useState(false);
  const [isCancellingOrder, setIsCancellingOrder] = useState(false);
  const [isSelectingPayment, setIsSelectingPayment] = useState(false);

  // Wallet balance for balance-at-checkout toggle
  const [walletBalance, setWalletBalance] = useState(0);
  const [useBalance, setUseBalance] = useState(false);
  const [balanceLoading, setBalanceLoading] = useState(false);

  // Fetch wallet balance on mount
  useEffect(() => {
    if (!currentUser?.id) return;
    let cancelled = false;
    setBalanceLoading(true);
    getIzePosition(currentUser.id, 'GBP')
      .then((position) => {
        if (!cancelled) setWalletBalance(position.balances.userFiatValue);
      })
      .catch(() => {
        if (!cancelled) setWalletBalance(0);
      })
      .finally(() => {
        if (!cancelled) setBalanceLoading(false);
      });
    return () => { cancelled = true; };
  }, [currentUser?.id]);
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
  const orderIdempotencyKeyRef = useRef<string | null>(null);
  const pendingIntentIdRef = useRef<string | null>(null);
  const isSubmittingRef = useRef(false);
  const appStateRef = useRef(AppState.currentState);
  const isMountedRef = useRef(true);
  const paymentAttemptRef = useRef(0);
  const navigationHandledRef = useRef(false);

  const item = listings.find((l) => l.id === itemId);

  const isSubmitting = stage === 'creating_order' || stage === 'opening_payment' || stage === 'awaiting_payment';
  const isInteractionLocked = isSubmitting || isCancellingOrder;

  // --- Eligibility ---
  const checkoutEligible = useMemo(() => {
    if (!currentUser?.id || !item) return false;
    if (isHydrating || isInteractionLocked) return false;
    if (!savedAddress?.id) return false;
    if (!postageOption.carrierId || !postageOption.quoteId) return false;
    // If balance covers the full total, payment method is not required
    const grossTotal = item.price + calculatePlatformChargeGbp(item.price) + postageOption.priceFromGbp;
    const balanceCoversFull = useBalance && walletBalance >= grossTotal;
    if (!balanceCoversFull) {
      if (!savedPaymentMethod?.id) return false;
      if (!isPaymentMethodAllowed(checkoutCapabilities, savedPaymentMethod.type)) return false;
    }
    return true;
  }, [currentUser?.id, item, isHydrating, isInteractionLocked, savedAddress?.id, savedPaymentMethod?.id, postageOption.carrierId, postageOption.quoteId, checkoutCapabilities, savedPaymentMethod?.type, useBalance, walletBalance, postageOption.priceFromGbp]);

  // --- Mount / unmount ---
  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      paymentAttemptRef.current += 1;
    };
  }, []);

  // --- Single settlement navigation helper ---
  const handleSettlementNavigation = useCallback(
    (
      result: 'succeeded' | 'pending',
      orderId: string,
      attemptId?: number
    ) => {
      if (navigationHandledRef.current) {
        return;
      }

      if (!isMountedRef.current) {
        return;
      }

      if (
        attemptId !== undefined &&
        paymentAttemptRef.current !== attemptId
      ) {
        return;
      }

      navigationHandledRef.current = true;

      if (result === 'succeeded') {
        navigation.replace('Success', { orderId });
      } else {
        navigation.replace('OrderDetail', { orderId });
      }
    },
    [navigation]
  );

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
      const [
        addressResult,
        paymentResult,
        capabilityResult,
      ] = await Promise.allSettled([
        listUserAddresses(userId),
        listUserPaymentMethods(userId),
        getUserCountryCapabilities(userId),
      ]);

      // --- Address result ---
      let addresses: CommerceAddress[] = [];
      if (addressResult.status === 'fulfilled') {
        addresses = addressResult.value;
        setBackendAddresses(addresses);

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
        } else {
          // Backend has no addresses
          if (savedAddress?.id) {
            clearSavedAddress();
          }
          // Local-only address without ID is retained; Pay stays disabled
        }
      } else {
        // Address request failed — preserve existing local address
        setAddressError('Delivery addresses could not be refreshed.');
      }

      // --- Payment result ---
      let paymentMethods: CommercePaymentMethod[] = [];
      if (paymentResult.status === 'fulfilled') {
        paymentMethods = paymentResult.value;
        setBackendPaymentMethods(paymentMethods);

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
        } else {
          // Backend has no payment methods
          if (savedPaymentMethod?.id) {
            clearSavedPaymentMethod();
          }
        }
      } else {
        // Payment request failed — preserve existing selected payment method
        setPaymentError('Payment methods could not be refreshed.');
      }

      // --- Capability result ---
      let capabilities: UserCountryCapabilities | null = null;
      if (capabilityResult.status === 'fulfilled') {
        capabilities = capabilityResult.value;
        if (capabilities) {
          setCheckoutCapabilities(capabilities);
        } else {
          setCapabilityError('Could not verify payment capabilities for your region.');
        }
      } else {
        setCapabilityError('Could not verify payment capabilities for your region.');
      }

      // --- Shipping quote ---
      if (capabilities) {
        const primaryCarrier = capabilities.postage.carriers[0];
        if (!primaryCarrier) {
          setPostageOption(UNAVAILABLE_REGION_POSTAGE_OPTION);
        } else {
          const fallbackOption: CheckoutPostageOption = {
            quoteId: null,
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
                  quoteId: selectedQuote.quoteId,
                  carrierId: selectedQuote.carrierId,
                  label: selectedQuote.label,
                  etaLabel: toEtaLabelFromRange(selectedQuote.etaMinDays, selectedQuote.etaMaxDays),
                  priceFromGbp: selectedQuote.priceFromGbp,
                  liveQuote: selectedQuote.live,
                  tracking: selectedQuote.tracking,
                });
              }
            } catch {
              setShippingError('A current shipping quote is unavailable. Refresh before paying.');
            }
          }
        }
      }
    } catch {
      // Keep local state if backend is unavailable
    } finally {
      setIsHydrating(false);
    }
  }, [currentUser?.id, item, savedAddress?.id, savedAddress?.postalCode, saveAddress, clearSavedAddress, savePaymentMethod, clearSavedPaymentMethod, savedPaymentMethod?.id]);

  // Single focus-based hydration — no duplicate mount effect
  useFocusEffect(
    useCallback(() => {
      void hydrateCheckout();
    }, [hydrateCheckout])
  );

  // --- Cancel stale order (result-bearing) ---
  const cancelStaleOrder = useCallback(async (): Promise<boolean> => {
    const orderId = createdOrderIdRef.current;

    if (!orderId) {
      return true;
    }

    if (
      stage === 'opening_payment'
      || stage === 'awaiting_payment'
    ) {
      setOrderError(
        'Payment is already in progress. Wait for confirmation before changing checkout details.'
      );
      return false;
    }

    setIsCancellingOrder(true);
    setOrderError(null);

    try {
      await cancelOrder(orderId);

      createdOrderIdRef.current = null;
      createdOrderSignatureRef.current = null;
      orderIdempotencyKeyRef.current = null;
      pendingIntentIdRef.current = null;

      return true;
    } catch {
      setOrderError(
        'Your existing order could not be cancelled. Checkout details have not been changed.'
      );
      return false;
    } finally {
      setIsCancellingOrder(false);
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
      walletDebit: useBalance ? Math.min(walletBalance, item.price + PLATFORM_CHARGE + POSTAGE_FEE) : undefined,
    });

    const attemptId = ++paymentAttemptRef.current;
    navigationHandledRef.current = false;

    isSubmittingRef.current = true;
    setOrderError(null);

    try {
      let orderId: string;

      // Reuse existing order if signature matches
      if (
        createdOrderIdRef.current
        && createdOrderSignatureRef.current === signature
      ) {
        orderId = createdOrderIdRef.current;
      } else {
        // Cancel any stale order first
        if (
          createdOrderIdRef.current
          && createdOrderSignatureRef.current !== signature
        ) {
          const cancelled = await cancelStaleOrder();

          if (!cancelled) {
            setStage('payment_failed');
            isSubmittingRef.current = false;
            return;
          }
        }

        if (
          !isMountedRef.current
          || paymentAttemptRef.current !== attemptId
        ) {
          return;
        }

        setStage('creating_order');
        if (!orderIdempotencyKeyRef.current) {
          orderIdempotencyKeyRef.current = createStableId('order');
        }
        const order = await createOrder({
          buyerId: userId,
          listingId: item.id,
          idempotencyKey: orderIdempotencyKeyRef.current,
          shippingQuoteId: postageOption.quoteId!,
          addressId: savedAddress?.id,
          paymentMethodId: savedPaymentMethod?.id,
          platformChargeGbp: PLATFORM_CHARGE,
          buyerProtectionFeeGbp: PLATFORM_CHARGE,
          postageFeeGbp: POSTAGE_FEE,
          shippingCarrierId: postageOption.carrierId ?? undefined,
          // Pass wallet balance debit so the backend can apply split-tender
          walletDebitGbp: useBalance ? Math.min(walletBalance, item.price + PLATFORM_CHARGE + POSTAGE_FEE) : undefined,
        });

        if (
          !isMountedRef.current
          || paymentAttemptRef.current !== attemptId
        ) {
          return;
        }

        orderId = order.id;
        createdOrderIdRef.current = orderId;
        createdOrderSignatureRef.current = signature;
      }

      // Create payment intent
      setStage('opening_payment');
      const intent = await createCommercePaymentIntent({
        orderId,
        idempotencyKey: `payment_${orderId}`,
      });

      if (
        !isMountedRef.current
        || paymentAttemptRef.current !== attemptId
      ) {
        return;
      }

      pendingIntentIdRef.current = intent.intentId;

      const sheet = await createStripeOrderSheet(orderId);
      await configureStripeMobile(sheet.publishableKey);
      const { error: sheetInitializationError } = await initPaymentSheet({
        merchantDisplayName: sheet.merchantDisplayName,
        customerId: sheet.customerId,
        customerSessionClientSecret: sheet.customerSessionClientSecret,
        paymentIntentClientSecret: sheet.paymentIntentClientSecret,
        returnURL: getStripeReturnUrl(),
        allowsDelayedPaymentMethods: false,
        applePay:
          sheet.applePayEnabled && Platform.OS === 'ios'
            ? { merchantCountryCode: sheet.merchantCountryCode }
            : undefined,
        googlePay:
          sheet.googlePayEnabled && Platform.OS === 'android'
            ? {
                merchantCountryCode: sheet.merchantCountryCode,
                currencyCode: sheet.currency,
                testEnv: sheet.publishableKey.startsWith('pk_test_'),
              }
            : undefined,
      });
      if (sheetInitializationError) {
        throw new Error(sheetInitializationError.message);
      }

      const { error: sheetPresentationError } = await presentPaymentSheet();
      if (sheetPresentationError?.code === PaymentSheetError.Canceled) {
        setStage('idle');
        setOrderError(null);
        pendingIntentIdRef.current = null;
        isSubmittingRef.current = false;
        return;
      }
      if (sheetPresentationError) {
        throw new Error(sheetPresentationError.message);
      }

      if (
        !isMountedRef.current
        || paymentAttemptRef.current !== attemptId
      ) {
        return;
      }

      // Poll for settlement
      setStage('awaiting_payment');
      const settlementStatus = await waitForPaymentIntentSettlement(
        intent.intentId,
        () => isMountedRef.current && paymentAttemptRef.current === attemptId
      );

      if (settlementStatus === 'aborted') {
        return;
      }

      if (
        !isMountedRef.current
        || paymentAttemptRef.current !== attemptId
      ) {
        return;
      }

      if (settlementStatus === 'succeeded') {
        show('Payment completed', 'success');
        pendingIntentIdRef.current = null;
        isSubmittingRef.current = false;
        handleSettlementNavigation('succeeded', orderId, attemptId);
        return;
      }

      if (settlementStatus === 'pending') {
        setStage('payment_pending');
        show('Payment is processing. We will update your order shortly.', 'info');
        isSubmittingRef.current = false;
        handleSettlementNavigation('pending', orderId, attemptId);
        return;
      }

      // Failed
      setStage('payment_failed');
      pendingIntentIdRef.current = null;
      setOrderError('Payment could not be completed. Please try again.');
      show('Payment could not be completed. Please try again.', 'error');
    } catch (error: any) {
      if (
        !isMountedRef.current
        || paymentAttemptRef.current !== attemptId
      ) {
        return;
      }

      setStage('payment_failed');
      const isNetworkError = isOffline || error?.code === 'NETWORK_ERROR' || error?.code === 'ECONNABORTED';
      const message = isNetworkError
        ? 'You appear to be offline. Check your connection and try again.'
        : error?.message ?? 'Payment could not be completed. Please try again.';
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
    handleSettlementNavigation,
    cancelStaleOrder,
    useBalance,
    walletBalance,
  ]);

  // --- Address selection change ---
  const handleAddressPress = useCallback(async () => {
    haptics.tap();

    if (createdOrderIdRef.current) {
      const cancelled = await cancelStaleOrder();
      if (!cancelled) {
        return;
      }
    }

    navigation.navigate('AddressForm', {
      mode: savedAddress ? 'edit' : 'add',
      source: 'checkout',
    });
  }, [cancelStaleOrder, navigation, savedAddress]);

  // --- Payment selection change ---
  const handleSelectPaymentMethod = useCallback(async (
    method: CommercePaymentMethod
  ) => {
    if (method.id === savedPaymentMethod?.id) {
      setPaymentSelectorVisible(false);
      return;
    }

    if (createdOrderIdRef.current) {
      setIsSelectingPayment(true);
      const cancelled = await cancelStaleOrder();
      setIsSelectingPayment(false);

      if (!cancelled) {
        return;
      }
    }

    savePaymentMethod({
      id: method.id,
      type: method.type,
      label: method.label,
      details: method.details ?? undefined,
      isDefault: method.isDefault,
    });

    setPaymentSelectorVisible(false);
  }, [savedPaymentMethod?.id, cancelStaleOrder, savePaymentMethod]);

  // --- Add-card success handler ---
  const handleAddCardSuccess = useCallback(async () => {
    if (!currentUser?.id) return;

    try {
      const methods = await listUserPaymentMethods(currentUser.id);
      setBackendPaymentMethods(methods);

      const preferred = methods.find((pm) => pm.isDefault) ?? methods[0];

      if (preferred) {
        if (preferred.id !== savedPaymentMethod?.id) {
          if (createdOrderIdRef.current) {
            const cancelled = await cancelStaleOrder();
            if (!cancelled) {
              show('Checkout selection could not be changed. The existing order is still active.', 'info');
              return;
            }
          }

          savePaymentMethod({
            id: preferred.id,
            type: preferred.type,
            label: preferred.label,
            details: preferred.details ?? undefined,
            isDefault: preferred.isDefault,
          });
        }
      }
    } catch {
      setPaymentError('Payment methods could not be refreshed after adding card.');
    }
  }, [currentUser?.id, savedPaymentMethod?.id, cancelStaleOrder, savePaymentMethod, show]);

  // --- Delivery selection change ---
  const canChangePostage = (checkoutCapabilities?.postage.carriers.length ?? 0) > 1;

  const handleDeliveryPress = useCallback(async () => {
    if (!canChangePostage) return;

    haptics.tap();

    if (createdOrderIdRef.current) {
      const cancelled = await cancelStaleOrder();
      if (!cancelled) {
        return;
      }
    }

    navigation.navigate('Postage');
  }, [canChangePostage, cancelStaleOrder, navigation]);

  // --- Close handler ---
  const handleClose = useCallback(() => {
    if (isSubmitting) {
      Alert.alert(
        'Payment in progress',
        'Payment confirmation may still complete after you leave. Check your Orders before trying again.',
        [
          { text: 'Stay', style: 'cancel' },
          {
            text: 'Leave',
            style: 'destructive',
            onPress: () => {
              paymentAttemptRef.current += 1;
              pendingIntentIdRef.current = null;
              navigation.goBack();
            },
          },
        ]
      );
      return;
    }
    navigation.goBack();
  }, [isSubmitting, navigation]);

  // --- AppState resume handling ---
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (
        appStateRef.current.match(/inactive|background/) &&
        nextAppState === 'active' &&
        pendingIntentIdRef.current
      ) {
        const intentId = pendingIntentIdRef.current;
        const orderId = createdOrderIdRef.current;
        const attemptId = paymentAttemptRef.current;

        void (async () => {
          try {
            const latest = await getPaymentIntentStatus(intentId);
            const status = latest.status.trim().toLowerCase();

            if (
              !isMountedRef.current
              || paymentAttemptRef.current !== attemptId
            ) {
              return;
            }

            if (status === 'succeeded' && orderId) {
              pendingIntentIdRef.current = null;
              handleSettlementNavigation('succeeded', orderId, attemptId);
            } else if (status === 'failed' || status === 'cancelled') {
              pendingIntentIdRef.current = null;
              setStage('payment_failed');
            }
            // Pending: keep pending feedback, do not navigate twice
          } catch {
            // Keep pending state
          }
        })();
      }
      appStateRef.current = nextAppState;
    });

    return () => subscription.remove();
  }, [handleSettlementNavigation]);

  // --- Message seller ---
  const handleMessageSeller = useCallback(() => {
    if (!item) return;
    const sellerId = item.sellerId ?? item.seller?.id ?? '';
    if (!sellerId) return;
    navigation.navigate('Chat', {
      conversationId: `checkout_${sellerId}_${item.id}`,
      focusQuery: item.title,
      partnerUserId: sellerId,
      itemId: item.id,
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
      <SafeAreaView style={[styles.container, t.container]} edges={['top']}>
        <StatusBar barStyle={!isDark ? 'dark-content' : 'light-content'} backgroundColor={colors.background} />
        <View style={[styles.header, t.header, { paddingTop: insets.top }]}>
          <Pressable
            style={({ pressed }) => [styles.closeBtn, pressed && styles.closeBtnPressed]}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </Pressable>
          <Text style={[styles.headerTitle, t.headerTitle]}>Checkout</Text>
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
      <SafeAreaView style={[styles.container, t.container]} edges={['top']}>
        <StatusBar barStyle={!isDark ? 'dark-content' : 'light-content'} backgroundColor={colors.background} />
        <View style={[styles.header, t.header, { paddingTop: insets.top }]}>
          <Pressable
            style={({ pressed }) => [styles.closeBtn, pressed && styles.closeBtnPressed]}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </Pressable>
          <Text style={[styles.headerTitle, t.headerTitle]}>Checkout</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.signedOutContainer}>
          <Ionicons name="lock-closed-outline" size={36} color={colors.textMuted} />
          <Text style={[styles.signedOutTitle, t.signedOutTitle]}>Sign in to checkout</Text>
          <Text style={[styles.signedOutBody, t.signedOutBody]}>
            You need to be signed in to complete your purchase.
          </Text>
          <Pressable
            style={({ pressed }) => [styles.signedOutBtn, t.signedOutBtn, pressed && styles.signedOutBtnPressed]}
            onPress={() => navigation.navigate('Login')}
            accessibilityRole="button"
            accessibilityLabel="Sign in"
          >
            <Text style={[styles.signedOutBtnText, t.signedOutBtnText]}>Sign in</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (isSelfPurchase) {
    return (
      <SafeAreaView style={[styles.container, t.container]} edges={['top']}>
        <StatusBar barStyle={!isDark ? 'dark-content' : 'light-content'} backgroundColor={colors.background} />
        <View style={[styles.header, t.header, { paddingTop: insets.top }]}>
          <Pressable
            style={({ pressed }) => [styles.closeBtn, pressed && styles.closeBtnPressed]}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </Pressable>
          <Text style={[styles.headerTitle, t.headerTitle]}>Checkout</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.signedOutContainer}>
          <Ionicons name="person-circle-outline" size={36} color={colors.textMuted} />
          <Text style={[styles.signedOutTitle, t.signedOutTitle]}>Cannot purchase your own listing</Text>
          <Text style={[styles.signedOutBody, t.signedOutBody]}>
            You cannot buy an item you listed for sale.
          </Text>
          <Pressable
            style={({ pressed }) => [styles.signedOutBtn, t.signedOutBtn, pressed && styles.signedOutBtnPressed]}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Text style={[styles.signedOutBtnText, t.signedOutBtnText]}>Go back</Text>
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
  const GROSS_TOTAL = item.price + PLATFORM_CHARGE + POSTAGE_FEE;
  const balanceApplied = useBalance ? Math.min(walletBalance, GROSS_TOTAL) : 0;
  const TOTAL = Math.max(0, GROSS_TOTAL - balanceApplied);

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
        : `Pay ${formatFromFiat(TOTAL, 'GBP')}`;

  return (
    <SafeAreaView style={[styles.container, t.container]} edges={['top']}>
      <StatusBar barStyle={!isDark ? 'dark-content' : 'light-content'} backgroundColor={colors.background} />

      {/* 1. Compact close header */}
      <View style={[styles.header, t.header, { paddingTop: insets.top }]}>
        <Pressable
          style={({ pressed }) => [styles.closeBtn, pressed && styles.closeBtnPressed]}
          onPress={handleClose}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Close checkout"
        >
          <Ionicons name="close" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, t.headerTitle]}>Checkout</Text>
        <View style={styles.headerSpacer} />
      </View>

      <CommerceDetailOfflineBanner isOffline={isOffline} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 120 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* 2. Product and seller summary */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)}>
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

        <View style={[styles.sectionDivider, t.sectionDivider]} />

        {/* 3. Delivery address */}
        <CheckoutSelectionRow
          label="Delivery address"
          title={savedAddress ? savedAddress.name : 'No address'}
          subtitle={addressSubtitle}
          actionLabel={savedAddress ? 'Change' : 'Add'}
          onPress={handleAddressPress}
          icon="location-outline"
          isFilled={!!savedAddress}
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
          onPress={canChangePostage ? handleDeliveryPress : undefined}
          icon="cube-outline"
          isFilled={!!postageOption.carrierId}
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
          icon="card-outline"
          isFilled={!!savedPaymentMethod}
          errorText={paymentError ?? undefined}
          accessibilityLabel={
            savedPaymentMethod
              ? `Payment method: ${savedPaymentMethod.label}${savedPaymentMethod.details ? `, ${savedPaymentMethod.details}` : ''}`
              : 'Add payment method'
          }
          accessibilityHint="Add or change your payment method"
        />
        </Reanimated.View>

        <View style={[styles.sectionDivider, t.sectionDivider]} />

        {/* 5b. Buyer protection strip — BEFORE price breakdown per Design.md:
            "Trust information must appear before the irreversible payment step."
            2026 research (Baymard): trust badges near the payment CTA lift
            conversion up to 32% vs footer placement. Placing this above the
            order summary ensures the user sees escrow protection before
            reviewing costs and tapping Pay. */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(60)}>
        <View style={styles.protectionStripWrap}>
          <BuyerProtectionStrip compact />
        </View>
        </Reanimated.View>

        {/* 6. Price breakdown */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(120)}>
        <View style={[styles.priceBreakdownCard, t.priceBreakdownCard]}>
          <View style={styles.priceBreakdownHeader}>
            <Ionicons name="receipt-outline" size={14} color={colors.textMuted} />
            <Text style={[styles.priceBreakdownTitle, t.priceBreakdownTitle]}>Order summary</Text>
          </View>
          <PriceRow label="Item" value={formatFromFiat(item.price, 'GBP')} />
          <PriceRow label="Platform charge" value={formatFromFiat(PLATFORM_CHARGE, 'GBP')} />
          <PriceRow
            label={`Delivery${postageOption.liveQuote ? '' : ' (Estimated)'}`}
            value={formatFromFiat(POSTAGE_FEE, 'GBP')}
          />
          <View style={styles.protectionIncludedRow}>
            <Ionicons name="shield-checkmark-outline" size={12} color={colors.success} />
            <Text style={[styles.protectionIncludedText, t.protectionIncludedText]}>
              Includes buyer protection — funds held in escrow until you confirm
            </Text>
          </View>
          <View style={[styles.priceDivider, t.priceDivider]} />
          <PriceRow label="Total" value={formatFromFiat(GROSS_TOTAL, 'GBP')} bold />

          {/* 6a. Balance-at-checkout toggle */}
          {walletBalance > 0 && !balanceLoading && (
            <View style={styles.balanceRow}>
              <Pressable
                style={({ pressed }) => [styles.balanceToggle, t.balanceToggle, pressed && styles.balanceTogglePressed]}
                onPress={() => {
                  haptics.tap();
                  setUseBalance((v) => !v);
                }}
                accessibilityRole="switch"
                accessibilityLabel="Use wallet balance"
                accessibilityState={{ checked: useBalance }}
              >
                <View style={[styles.balanceSwitch, t.balanceSwitch, useBalance && t.balanceSwitchOn]}>
                  <View style={[styles.balanceKnob, t.balanceKnob, useBalance && t.balanceKnobOn]} />
                </View>
                <View style={styles.balanceTextCol}>
                  <Text style={[styles.balanceLabel, t.balanceLabel]}>Use wallet balance</Text>
                  <Text style={[styles.balanceAmount, t.balanceAmount]} numberOfLines={1}>
                    {formatFromFiat(walletBalance, 'GBP')} available
                  </Text>
                </View>
              </Pressable>
            </View>
          )}

          {useBalance && balanceApplied > 0 && (
            <>
              <PriceRow
                label="Wallet balance applied"
                value={`-${formatFromFiat(balanceApplied, 'GBP')}`}
              />
              <View style={[styles.priceDivider, t.priceDivider]} />
              <PriceRow label="To pay" value={formatFromFiat(TOTAL, 'GBP')} bold />
              <View style={[styles.savingsBadge, t.savingsBadge]}>
                <Ionicons name="wallet-outline" size={11} color={colors.success} />
                <Text style={[styles.savingsText, t.savingsText]}>
                  Saving {formatFromFiat(balanceApplied, 'GBP')} with wallet balance
                </Text>
              </View>
            </>
          )}
        </View>
        </Reanimated.View>

        {/* 7. Transaction feedback */}
        {stage !== 'idle' ? (
          <View style={styles.feedbackRow}>
            {isSubmitting ? (
              <ActivityIndicator size="small" color={colors.brand} />
            ) : stage === 'payment_failed' ? (
              <Ionicons name="alert-circle" size={16} color={colors.danger} />
            ) : stage === 'payment_pending' ? (
              <Ionicons name="time-outline" size={16} color={colors.textMuted} />
            ) : null}
            <Text
              style={[
                styles.feedbackText,
                t.feedbackText,
                stage === 'payment_failed' && t.feedbackTextError,
              ]}
            >
              {STAGE_LABELS[stage]}
            </Text>
          </View>
        ) : null}

        {orderError ? (
          <Text style={[styles.orderErrorText, t.orderErrorText]}>{orderError}</Text>
        ) : null}

        {capabilityError ? (
          <Text style={[styles.hintText, t.hintText]}>{capabilityError}</Text>
        ) : null}

        <Text style={[styles.termsText, t.termsText]}>
          By tapping "Pay", you agree to our Terms of Sale and Privacy Policy.
        </Text>
      </ScrollView>

      {/* 8. Sticky total + Pay footer */}
      <View style={[styles.footer, t.footer, { paddingBottom: insets.bottom > 0 ? insets.bottom : 16 }]}>
        <View style={styles.footerTotalCol}>
          <Text style={[styles.footerTotalLabel, t.footerTotalLabel]}>Total</Text>
          <Text style={[styles.footerTotalPrice, t.footerTotalPrice]}>{formatFromFiat(TOTAL, 'GBP')}</Text>
        </View>

        {/* Apple Pay as primary CTA on iOS when enabled */}
        {Platform.OS === 'ios' && isPaymentMethodAllowed(checkoutCapabilities, 'apple_pay') && !isSubmitting && (
          <Pressable
            onPress={() => { haptics.press(); handlePay(); }}
            style={({ pressed }) => [
              styles.applePayBtn,
              pressed && styles.payBtnPressed,
              (!checkoutEligible || isInteractionLocked) && styles.payBtnDisabled,
            ]}
            disabled={!checkoutEligible || isInteractionLocked}
            accessibilityRole="button"
            accessibilityLabel={`Pay ${formatFromFiat(TOTAL, 'GBP')} with Apple Pay`}
            accessibilityState={{ disabled: !checkoutEligible || isInteractionLocked }}
          >
            <Ionicons name="logo-apple" size={18} color={colors.textInverse} />
            <Text style={styles.applePayBtnText}>Pay</Text>
          </Pressable>
        )}

        <Pressable
          style={({ pressed }) => [
            styles.payBtn,
            t.payBtn,
            (!checkoutEligible || isInteractionLocked) && styles.payBtnDisabled,
            pressed && !(!checkoutEligible || isInteractionLocked) && styles.payBtnPressed,
          ]}
          onPress={() => { haptics.press(); handlePay(); }}
          disabled={!checkoutEligible || isInteractionLocked}
          accessibilityRole="button"
          accessibilityLabel={`Pay ${formatFromFiat(TOTAL, 'GBP')}`}
          accessibilityState={{
            disabled: !checkoutEligible || isInteractionLocked,
            busy: isSubmitting,
          }}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color={colors.textInverse} />
          ) : (
            <Ionicons name="lock-closed" size={16} color={colors.textInverse} />
          )}
          <Text style={[styles.payBtnText, t.payBtnText]}>{payLabel}</Text>
        </Pressable>
      </View>

      {/* Sheets */}
      <AddCardSheet
        visible={addCardSheetVisible}
        onDismiss={() => setAddCardSheetVisible(false)}
        onSuccess={handleAddCardSuccess}
      />
      <CheckoutPaymentSelector
        visible={paymentSelectorVisible}
        onDismiss={() => setPaymentSelectorVisible(false)}
        methods={backendPaymentMethods}
        selectedId={savedPaymentMethod?.id}
        onSelect={handleSelectPaymentMethod}
        isSelecting={isSelectingPayment}
        onAddCard={() => {
          setPaymentSelectorVisible(false);
          setAddCardSheetVisible(true);
        }}
      />
    </SafeAreaView>
  );
}

function PriceRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  const { colors } = useAppTheme();
  const priceStyles = useMemo(() => StyleSheet.create({
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 6,
    },
    label: {
      fontSize: 14,
      fontFamily: Typography.family.regular,
      color: colors.textSecondary,
    },
    labelBold: {
      fontSize: 16,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
    },
    value: {
      fontSize: 14,
      fontFamily: Typography.family.medium,
      color: colors.textPrimary,
      fontVariant: ['tabular-nums'] as any,
    },
    valueBold: {
      fontSize: 18,
      fontFamily: Typography.family.bold,
      color: colors.textPrimary,
      fontVariant: ['tabular-nums'] as any,
    },
  }), [colors]);

  return (
    <View style={priceStyles.row}>
      <Text style={[priceStyles.label, bold && priceStyles.labelBold]}>{label}</Text>
      <Text style={[priceStyles.value, bold && priceStyles.valueBold]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingBottom: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  closeBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnPressed: {
    opacity: 0.5,
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: Typography.family.semibold,
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
    marginVertical: Space.sm,
  },
  priceBreakdownCard: {
    paddingVertical: Space.md,
    paddingHorizontal: Space.md,
    marginTop: Space.sm,
  },
  priceBreakdownHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    marginBottom: Space.sm + 2,
  },
  priceBreakdownTitle: {
    fontSize: 11,
    fontFamily: Typography.family.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  priceDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: Space.sm,
  },
  savingsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    marginTop: Space.xs,
    paddingVertical: Space.xs,
    paddingHorizontal: Space.sm,
    borderRadius: Radius.sm,
    alignSelf: 'flex-start',
  },
  savingsText: {
    fontSize: 11,
    fontFamily: Typography.family.semibold,
  },
  protectionStripWrap: {
    marginTop: Space.sm,
  },
  protectionIncludedRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 5,
    paddingTop: 6,
  },
  protectionIncludedText: {
    flex: 1,
    fontSize: 11,
    fontFamily: Typography.family.regular,
    lineHeight: 15,
  },
  balanceRow: {
    marginTop: Space.sm,
  },
  balanceToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm + 2,
    paddingVertical: Space.sm + 2,
    paddingHorizontal: Space.md,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  balanceTogglePressed: {
    opacity: 0.7,
  },
  balanceSwitch: {
    width: 40,
    height: 24,
    borderRadius: Radius.full,
    borderWidth: Stroke.standard,
    justifyContent: 'center',
    padding: 2,
  },
  balanceKnob: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignSelf: 'flex-start',
  },
  balanceKnobOn: {
    alignSelf: 'flex-end',
  },
  balanceTextCol: {
    flex: 1,
    gap: 1,
  },
  balanceLabel: {
    fontSize: 13,
    fontFamily: Typography.family.semibold,
  },
  balanceAmount: {
    fontSize: 12,
    fontFamily: Typography.family.regular,
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
  },
  orderErrorText: {
    fontSize: 14,
    fontFamily: Typography.family.medium,
    paddingVertical: Space.sm,
  },
  hintText: {
    fontSize: 13,
    fontFamily: Typography.family.regular,
    paddingVertical: Space.xs,
  },
  termsText: {
    fontSize: 12,
    fontFamily: Typography.family.regular,
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
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
  },
  footerTotalCol: {
    flex: 1,
  },
  footerTotalLabel: {
    fontSize: 13,
    fontFamily: Typography.family.regular,
  },
  footerTotalPrice: {
    fontSize: 22,
    fontFamily: Typography.family.bold,
  },
  payBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
    minWidth: 180,
    paddingVertical: Space.md + 2,
    paddingHorizontal: Space.lg,
    borderRadius: Radius.md,
    minHeight: 48,
  },
  applePayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs,
    minWidth: 140,
    height: 48,
    borderRadius: Radius.md,
    backgroundColor: '#000000',
    marginBottom: Space.xs,
  },
  applePayBtnText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '600',
  },
  payBtnDisabled: {
    opacity: 0.5,
  },
  payBtnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  payBtnText: {
    fontSize: 16,
    fontFamily: Typography.family.semibold,
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
    textAlign: 'center',
  },
  signedOutBody: {
    fontSize: 14,
    fontFamily: Typography.family.regular,
    textAlign: 'center',
    lineHeight: 20,
  },
  signedOutBtn: {
    marginTop: Space.sm,
    paddingVertical: 14,
    paddingHorizontal: Space.xl,
    borderRadius: 10,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signedOutBtnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  signedOutBtnText: {
    fontSize: 16,
    fontFamily: Typography.family.semibold,
  },
});
