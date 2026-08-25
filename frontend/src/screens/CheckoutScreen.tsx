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
  RefreshControl,
} from 'react-native';
import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import {
  initPaymentSheet,
  PaymentSheetError,
  presentPaymentSheet,
} from '@stripe/stripe-react-native';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { EmptyState } from '../components/EmptyState';
import { RootStackParamList } from '../navigation/types';
import { openProfile } from '../navigation/openProfile';
import { useStore } from '../store/useStore';
import { useNotifications } from '../hooks/useNotifications';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { Motion } from '../theme/motionTokens';
import { useConnectivity } from '../hooks/useConnectivity';
import { isPaymentMethodAllowed } from '../utils/capabilityPolicy';
import { calculatePlatformChargeGbp } from '../utils/currencyAuthoringFlows';
import { useBackendData } from '../context/BackendDataContext';
import { AddCardSheet } from '../components/checkout/AddCardSheet';
import { CheckoutItemSummary } from '../components/checkout/CheckoutItemSummary';
import { CheckoutSelectionRow } from '../components/checkout/CheckoutSelectionRow';
import { CheckoutPaymentSelector } from '../components/checkout/CheckoutPaymentSelector';
import { BottomSheet } from '../components/BottomSheet';
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
import { Space, Radius, FontFamily, Stroke, Control, LetterSpacing, Elevation } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { RadiusRoleValue } from '../theme/surfaceRadiusRules';
import { createStableId } from '../utils/createStableId';
import {
  configureStripeMobile,
  getStripeReturnUrl,
} from '../platform/payments/stripeMobile';
import { t } from '../i18n';
import { useScreenCaptureProtection } from '../platform/screenCapture';
import { track, trackFunnelStep } from '../analytics';
import { DEFAULT_CURRENCY_CODE } from '../constants/currencies';

type RouteT = RouteProp<RootStackParamList, 'Checkout'>;

type CheckoutStage =
  | 'idle'
  | 'creating_order'
  | 'opening_payment'
  | 'authenticating'
  | 'awaiting_payment'
  | 'payment_succeeded'
  | 'payment_pending'
  | 'payment_failed'
  | 'unknown_outcome';

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
  label: t('checkout.postage.default.label'),
  etaLabel: t('checkout.postage.default.eta'),
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
  creating_order: 'Reviewing your order',
  opening_payment: 'Processing payment',
  authenticating: 'Confirm with your bank',
  awaiting_payment: 'Processing payment',
  payment_succeeded: 'Order confirmed',
  payment_pending: 'Payment is pending. We’ll update this order when your bank confirms it.',
  payment_failed: 'Payment didn’t go through',
  unknown_outcome: 'We’re checking your payment. Please don’t retry yet.',
};

export default function CheckoutScreen() {
  useScreenCaptureProtection();
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
    savingsBadge: { backgroundColor: `${colors.success}12` },
    savingsText: { color: colors.success },
    protectionIncludedText: { color: colors.success },
    balanceToggle: { borderColor: colors.border },
    balanceSwitch: { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
    balanceSwitchOn: { backgroundColor: colors.success, borderColor: colors.success },
    balanceKnob: { backgroundColor: colors.textMuted },
    balanceKnobOn: { backgroundColor: colors.textInverse },
    balanceLabel: { color: colors.textPrimary },
    balanceAmount: { color: colors.textMuted },
    orderErrorText: { color: colors.danger },
    hintText: { color: colors.textMuted },
    termsText: { color: colors.textMuted },
    footer: { borderTopColor: colors.border, backgroundColor: colors.background },
    payBtn: { backgroundColor: colors.brand },
    payBtnText: { color: colors.textInverse },
    payBtnSecondary: { backgroundColor: colors.surfaceAlt, borderWidth: Stroke.standard, borderColor: colors.border },
    payBtnSecondaryText: { color: colors.textPrimary },
    signedOutTitle: { color: colors.textPrimary },
    signedOutBody: { color: colors.textMuted },
    signedOutBtn: { backgroundColor: colors.brand },
    signedOutBtnText: { color: colors.textInverse },
    capabilityRetryBtn: { borderColor: colors.border, backgroundColor: colors.surface },
    capabilityRetryText: { color: colors.textPrimary },
    partialDataBanner: { borderColor: `${colors.warning}59`, backgroundColor: `${colors.warning}14` },
    partialDataMessage: { color: colors.warning },
    partialDataAction: { borderColor: `${colors.warning}80`, backgroundColor: `${colors.surfaceAlt}99` },
    partialDataActionText: { color: colors.warning },
    compactSummaryRow: { color: colors.textSecondary },
    compactSummaryValue: { color: colors.textPrimary },
    compactSummaryTotalLabel: { color: colors.textPrimary },
    compactSummaryTotalValue: { color: colors.textPrimary },
    compactSummaryDivider: { backgroundColor: colors.border },
    breakdownChevronText: { color: colors.textMuted },
    breakdownSheetTitle: { color: colors.textPrimary },
    breakdownSheetLabel: { color: colors.textSecondary },
    breakdownSheetDivider: { backgroundColor: colors.border },
    breakdownSheetTotalLabel: { color: colors.textPrimary },
    breakdownSheetTotalValue: { color: colors.textPrimary },
  }), [colors]);
  const currentUser = useStore((state) => state.currentUser);
  const savedAddress = useStore((state) => state.savedAddress);
  const saveAddress = useStore((state) => state.saveAddress);
  const clearSavedAddress = useStore((state) => state.clearSavedAddress);
  const savedPaymentMethod = useStore((state) => state.savedPaymentMethod);
  const savePaymentMethod = useStore((state) => state.savePaymentMethod);
  const clearSavedPaymentMethod = useStore((state) => state.clearSavedPaymentMethod);

  const [isHydrating, setIsHydrating] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
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
  const [breakdownSheetVisible, setBreakdownSheetVisible] = useState(false);
  const [postageOption, setPostageOption] = useState<CheckoutPostageOption>(DEFAULT_POSTAGE_OPTION);
  const [checkoutCapabilities, setCheckoutCapabilities] = useState<UserCountryCapabilities | null>(null);
  const [backendAddresses, setBackendAddresses] = useState<CommerceAddress[]>([]);
  const [backendPaymentMethods, setBackendPaymentMethods] = useState<CommercePaymentMethod[]>([]);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [capabilityError, setCapabilityError] = useState<string | null>(null);
  const [shippingError, setShippingError] = useState<string | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);
  const { showError, showInfo } = useNotifications();
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

  const isSubmitting = stage === 'creating_order' || stage === 'opening_payment' || stage === 'authenticating' || stage === 'awaiting_payment';
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

  const handleRefreshCheckout = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await hydrateCheckout();
    } finally {
      setIsRefreshing(false);
    }
  }, [hydrateCheckout]);

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
      showError('Cannot pay yet', 'Complete address and payment details before paying.');
      return;
    }

    const userId = currentUser?.id;
    if (!userId || !item) return;

    // Performance mark: checkout flow start (user confirmed payment).
    performance.mark('checkout:start');
    track('checkout_started', { item_id: item.id, total: item.price + calculatePlatformChargeGbp(item.price) + postageOption.priceFromGbp });
    trackFunnelStep('checkout', 'checkout_started', { listing_id: item.id });

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

      // Set authenticating stage — the PaymentSheet may trigger 3DS/SCA
      // challenge during presentation. This stage makes the authentication
      // step visible to the user (audit 09: canonical payment state).
      setStage('authenticating');
      trackFunnelStep('checkout', 'payment_submitted', { order_id: orderId });
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
        // Brief success state so the user sees confirmation before navigation
        // (audit 09: canonical payment state — succeeded is a visible state).
        setStage('payment_succeeded');
        pendingIntentIdRef.current = null;
        isSubmittingRef.current = false;
        // Performance mark: checkout flow complete (payment settled).
        performance.mark('checkout:complete');
        track('purchase_completed', { item_id: item.id, total: item.price + calculatePlatformChargeGbp(item.price) + postageOption.priceFromGbp, payment_method: savedPaymentMethod?.type ?? 'wallet' });
        trackFunnelStep('checkout', 'purchase_completed', { order_id: orderId });
        handleSettlementNavigation('succeeded', orderId, attemptId);
        return;
      }

      if (settlementStatus === 'pending') {
        setStage('payment_pending');
        isSubmittingRef.current = false;
        handleSettlementNavigation('pending', orderId, attemptId);
        return;
      }

      // Failed
      setStage('payment_failed');
      pendingIntentIdRef.current = null;
      setOrderError('Payment could not be completed. Try again.');
      showError('Payment failed', 'Payment could not be completed. Try again.');
    } catch (error: unknown) {
      if (
        !isMountedRef.current
        || paymentAttemptRef.current !== attemptId
      ) {
        return;
      }

      const errorCode = (error as { code?: string })?.code;
      const isNetworkError = isOffline || errorCode === 'NETWORK_ERROR' || errorCode === 'ECONNABORTED';

      if (isNetworkError && pendingIntentIdRef.current) {
        // Lost response during payment — the server may have committed.
        // Show unknown_outcome and poll for the authoritative status instead
        // of telling the user the payment failed (which invites unsafe retry).
        setStage('unknown_outcome');
        setOrderError('We are checking your payment. Please do not retry yet.');
        showInfo('Checking payment', 'We are confirming your payment status. Please do not place a new order.');
        const intentId = pendingIntentIdRef.current;
        const settlementStatus = await waitForPaymentIntentSettlement(
          intentId,
          () => isMountedRef.current && paymentAttemptRef.current === attemptId
        );
        if (
          !isMountedRef.current
          || paymentAttemptRef.current !== attemptId
        ) {
          return;
        }
        if (settlementStatus === 'succeeded') {
          setStage('payment_succeeded');
          pendingIntentIdRef.current = null;
          track('purchase_completed', { item_id: item.id, total: item.price + calculatePlatformChargeGbp(item.price) + postageOption.priceFromGbp, payment_method: savedPaymentMethod?.type ?? 'wallet' });
          handleSettlementNavigation('succeeded', createdOrderIdRef.current ?? '', attemptId);
          return;
        }
        if (settlementStatus === 'pending') {
          setStage('payment_pending');
          handleSettlementNavigation('pending', createdOrderIdRef.current ?? '', attemptId);
          return;
        }
        // Confirmed failed
        setStage('payment_failed');
        pendingIntentIdRef.current = null;
        setOrderError('Payment could not be completed. Try again.');
        showError('Payment failed', 'Payment could not be completed. Try again.');
      } else {
        setStage('payment_failed');
        const message = isNetworkError
          ? 'You appear to be offline. Check your connection and try again.'
          : (error instanceof Error ? error.message : 'Payment could not be completed. Try again.');
        setOrderError(message);
        showError('Payment failed', message);
      }
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
    showError,
    showInfo,
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
              showInfo('Cannot change selection', 'The existing order is still active.');
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
  }, [currentUser?.id, savedPaymentMethod?.id, cancelStaleOrder, savePaymentMethod]);

  // --- Delivery selection change ---
  const canChangePostage = (checkoutCapabilities?.postage.carriers.length ?? 0) > 1;
  const allowCardPayments = isPaymentMethodAllowed(checkoutCapabilities, 'card');

  // --- Payment method change press ---
  const handlePaymentPress = useCallback(() => {
    haptics.tap();
    if (!allowCardPayments && checkoutCapabilities) {
      showError('Cards unavailable', 'Cards are unavailable for your region.');
      navigation.navigate('Payments');
      return;
    }
    if (backendPaymentMethods.length > 1) {
      setPaymentSelectorVisible(true);
    } else {
      setAddCardSheetVisible(true);
    }
  }, [allowCardPayments, checkoutCapabilities, backendPaymentMethods.length, showError, navigation]);

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

  // --- Partial data state (§14) ---
  // Computed before early returns so the useMemo hook order is stable
  // regardless of which guard branch fires (Rules of Hooks).
  const addressLoaded = backendAddresses.length > 0 || !!savedAddress?.id;
  const paymentLoaded = backendPaymentMethods.length > 0 || !!savedPaymentMethod?.id;

  const partialDataPrompt = useMemo(() => {
    if (isHydrating || isInteractionLocked) return null;

    // Shipping quote failed but address + payment are ready → proceed with
    // standard (estimated) shipping. The carrier is still selected, only the
    // live quote is unavailable.
    if (shippingError && addressLoaded && paymentLoaded && !!postageOption.carrierId) {
      return {
        icon: 'cube-outline' as const,
        message: 'Shipping quote unavailable — proceeding with standard shipping.',
        action: { label: 'Try again', onPress: (): void => void hydrateCheckout() },
      };
    }

    // Address missing but payment methods loaded → prompt to add an address.
    if (!addressLoaded && paymentLoaded) {
      return {
        icon: 'location-outline' as const,
        message: 'Add a delivery address to continue.',
        action: { label: 'Add address', onPress: () => handleAddressPress() },
      };
    }

    // Payment methods missing but address loaded → prompt to add a payment method.
    if (!paymentLoaded && addressLoaded) {
      return {
        icon: 'card-outline' as const,
        message: 'Add a payment method to continue.',
        action: {
          label: 'Add payment',
          onPress: () => {
            haptics.tap();
            if (!allowCardPayments && checkoutCapabilities) {
              navigation.navigate('Payments');
              return;
            }
            if (backendPaymentMethods.length > 1) {
              setPaymentSelectorVisible(true);
            } else {
              setAddCardSheetVisible(true);
            }
          },
        },
      };
    }

    return null;
  }, [
    isHydrating,
    isInteractionLocked,
    shippingError,
    addressLoaded,
    paymentLoaded,
    postageOption.carrierId,
    hydrateCheckout,
    handleAddressPress,
    haptics,
    allowCardPayments,
    checkoutCapabilities,
    navigation,
    backendPaymentMethods.length,
  ]);

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
            <Ionicons name="close" size={22} color={colors.textPrimary} aria-hidden={true} />
          </Pressable>
          <Text style={[styles.headerTitle, t.headerTitle]} maxFontSizeMultiplier={2}>Checkout</Text>
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
            <Ionicons name="close" size={22} color={colors.textPrimary} aria-hidden={true} />
          </Pressable>
          <Text style={[styles.headerTitle, t.headerTitle]} maxFontSizeMultiplier={2}>Checkout</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.signedOutContainer}>
          <Ionicons name="lock-closed-outline" size={28} color={colors.textMuted} aria-hidden={true} />
          <Text style={[styles.signedOutTitle, t.signedOutTitle]} maxFontSizeMultiplier={2}>Sign in to checkout</Text>
          <Text style={[styles.signedOutBody, t.signedOutBody]} maxFontSizeMultiplier={2}>
            You need to be signed in to complete your purchase.
          </Text>
          <Pressable
            style={({ pressed }) => [styles.signedOutBtn, t.signedOutBtn, pressed && styles.signedOutBtnPressed]}
            onPress={() => navigation.navigate('Login')}
            accessibilityRole="button"
            accessibilityLabel="Sign in"
          >
            <Text style={[styles.signedOutBtnText, t.signedOutBtnText]} maxFontSizeMultiplier={1}>Sign in</Text>
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
            <Ionicons name="close" size={22} color={colors.textPrimary} aria-hidden={true} />
          </Pressable>
          <Text style={[styles.headerTitle, t.headerTitle]} maxFontSizeMultiplier={2}>Checkout</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.signedOutContainer}>
          <Ionicons name="person-circle-outline" size={28} color={colors.textMuted} aria-hidden={true} />
          <Text style={[styles.signedOutTitle, t.signedOutTitle]} maxFontSizeMultiplier={2}>Cannot purchase your own listing</Text>
          <Text style={[styles.signedOutBody, t.signedOutBody]} maxFontSizeMultiplier={2}>
            You cannot buy an item you listed for sale.
          </Text>
          <Pressable
            style={({ pressed }) => [styles.signedOutBtn, t.signedOutBtn, pressed && styles.signedOutBtnPressed]}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Text style={[styles.signedOutBtnText, t.signedOutBtnText]} maxFontSizeMultiplier={1}>Go back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ── Loading skeleton ──
  // Show a skeleton that matches the final layout geometry when hydrating
  // with no cached data (first load). Per AGENTS.md §14: "Skeletons should
  // resemble the final layout. Do not use a generic centred spinner."
  if (isHydrating && !savedAddress?.id && !savedPaymentMethod?.id && backendAddresses.length === 0) {
    return (
      <SafeAreaView style={[styles.container, t.container]} edges={['top']}>
        <StatusBar barStyle={!isDark ? 'dark-content' : 'light-content'} backgroundColor={colors.background} />
        <CheckoutSkeleton colors={colors} />
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

  const addressNeedsSave = savedAddress && !savedAddress.id;
  const addressSubtitle = savedAddress
    ? `${savedAddress.streetAddress}${savedAddress.apartment ? `, ${savedAddress.apartment}` : ''}\n${savedAddress.city}${savedAddress.region ? `, ${savedAddress.region}` : ''} · ${savedAddress.postalCode}\n${savedAddress.country}`
    : 'Required for delivery';

  // Whether a digital wallet (Apple Pay / Google Pay) is available as a
  // one-tap primary CTA. Per 2026 UX research: "Place Google Pay at the top
  // of the list of payment options, above manual entry fields." When a
  // wallet is available it becomes the primary CTA and the card button
  // becomes secondary ("Pay with card"), creating a clear hierarchy that
  // surfaces biometric one-tap payment before manual card entry.
  const walletAvailable = !isSubmitting && (
    (Platform.OS === 'ios' && isPaymentMethodAllowed(checkoutCapabilities, 'apple_pay'))
    || (Platform.OS === 'android' && isPaymentMethodAllowed(checkoutCapabilities, 'google_pay'))
  );

  const payLabel = isSubmitting
    ? STAGE_LABELS[stage] || 'Processing'
    : stage === 'payment_failed'
      ? 'Retry payment'
      : stage === 'payment_pending'
        ? 'Waiting for confirmation'
        : walletAvailable
          ? 'Pay with card'
          : `Pay ${formatFromFiat(TOTAL, DEFAULT_CURRENCY_CODE)}`;

  // Whether the row-level errorText should be suppressed because the partial-
  // data banner already covers that case (avoids duplicate messaging).
  const suppressAddressError = partialDataPrompt?.icon === 'location-outline';
  const suppressPaymentError = partialDataPrompt?.icon === 'card-outline';
  const suppressShippingError =
    partialDataPrompt?.icon === 'cube-outline' && !!postageOption.carrierId;

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
          <Ionicons name="close" size={22} color={colors.textPrimary} aria-hidden={true} />
        </Pressable>
        <Text style={[styles.headerTitle, t.headerTitle]} maxFontSizeMultiplier={2}>Checkout</Text>
        <View style={styles.headerSpacer} />
      </View>

      <CommerceDetailOfflineBanner isOffline={isOffline} />

      {/* Partial-data inline prompt (§14). Quiet, friendly — the checkout is
          still usable. Distinct from full error states. */}
      {partialDataPrompt ? (
        <View style={[styles.partialDataBanner, t.partialDataBanner]}>
          <Ionicons name={partialDataPrompt.icon} size={16} color={colors.warning} aria-hidden={true} />
          <Text style={[styles.partialDataMessage, t.partialDataMessage]} numberOfLines={3} maxFontSizeMultiplier={2}>
            {partialDataPrompt.message}
          </Text>
          <Pressable
            style={[styles.partialDataAction, t.partialDataAction]}
            onPress={partialDataPrompt.action.onPress}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={partialDataPrompt.action.label}
            accessibilityHint="Retry loading the missing checkout details"
          >
            <Text style={[styles.partialDataActionText, t.partialDataActionText]} maxFontSizeMultiplier={1}>{partialDataPrompt.action.label}</Text>
          </Pressable>
        </View>
      ) : null}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 300 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        accessibilityElementsHidden={addCardSheetVisible || paymentSelectorVisible}
        importantForAccessibility={addCardSheetVisible || paymentSelectorVisible ? 'no-hide-descendants' : 'auto'}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefreshCheckout}
            tintColor={colors.textMuted}
            colors={[colors.textMuted]}
          />
        }
      >
        {/* 2. Product and seller summary */}
        <View>
        <CheckoutItemSummary
          title={item.title}
          imageUrl={getListingCoverUri(item.images, '')}
          seller={{
            id: resolvedSeller.id,
            username: resolvedSeller.username,
            avatar: resolvedSeller.avatar,
          }}
          priceLabel={formatFromFiat(item.price, DEFAULT_CURRENCY_CODE)}
          onPressSeller={
            resolvedSeller.id
              ? () => { haptics.tap(); openProfile(navigation, resolvedSeller.id, currentUser?.id); }
              : undefined
          }
          onPressMessage={resolvedSeller.id ? () => { haptics.tap(); handleMessageSeller(); } : undefined}
        />

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
          errorText={suppressAddressError ? undefined : (addressError ?? undefined)}
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
          actionLabel={formatFromFiat(POSTAGE_FEE, DEFAULT_CURRENCY_CODE)}
          onPress={canChangePostage ? handleDeliveryPress : undefined}
          icon="cube-outline"
          isFilled={!!postageOption.carrierId}
          errorText={
            !postageOption.carrierId
              ? 'Shipping not available for your region'
              : suppressShippingError
                ? undefined
                : shippingError ?? undefined
          }
          accessibilityLabel={`Delivery: ${postageOption.label}, ${postageOption.etaLabel}, ${postageOption.liveQuote ? 'Live quote' : 'Estimated'}, ${formatFromFiat(POSTAGE_FEE, DEFAULT_CURRENCY_CODE)}`}
        />

        {/* 5. Payment method — unified with address/delivery row family */}
        <CheckoutSelectionRow
          label="Payment method"
          title={savedPaymentMethod ? savedPaymentMethod.label : 'No payment method'}
          subtitle={savedPaymentMethod?.details ?? undefined}
          actionLabel={savedPaymentMethod ? 'Change' : 'Add'}
          onPress={handlePaymentPress}
          icon={savedPaymentMethod?.type === 'apple_pay' ? 'logo-apple' : 'card-outline'}
          isFilled={!!savedPaymentMethod}
          warningText={
            !savedPaymentMethod && !allowCardPayments && checkoutCapabilities
              ? 'Cards unavailable in your region'
              : undefined
          }
          errorText={suppressPaymentError ? undefined : (paymentError ?? undefined)}
          accessibilityLabel={
            savedPaymentMethod
              ? `Payment method: ${savedPaymentMethod.label}${savedPaymentMethod.details ? `, ${savedPaymentMethod.details}` : ''}. Change payment method.`
              : 'Add payment method'
          }
          accessibilityHint="Add or change your payment method"
        />

        {/* Secure payment trust signal — placed inline near the payment method
            row where card-security anxiety peaks. Per 2026 UX research:
            "A 'Secure checkout' message next to the card number field is more
            effective than security badges in the footer." */}
        <View style={styles.securePaymentRow}>
          <Ionicons name="lock-closed" size={12} color={colors.success} aria-hidden={true} />
          <Text style={[styles.securePaymentText, { color: colors.success }]} maxFontSizeMultiplier={1}>
            Secure payment · card details encrypted
          </Text>
        </View>
        </View>

        {/* 5b. Buyer protection strip — the single authored trust moment,
            placed after selection rows and before the price breakdown.
            Per Design.md: "Trust information must appear before the
            irreversible payment step." The footer trust badges were removed
            to avoid duplicate trust signalling — this strip carries the
            escrow narrative; the breakdown sheet has the full policy. */}
        <View style={styles.protectionStripWrap}>
          <BuyerProtectionStrip compact />
        </View>

        {/* 6a. Balance-at-checkout toggle — kept inline so the user can
            apply wallet credit before reviewing the compact total in the
            sticky footer. */}
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
                <Text style={[styles.balanceLabel, t.balanceLabel]} maxFontSizeMultiplier={1}>Use wallet balance</Text>
                <Text style={[styles.balanceAmount, t.balanceAmount]} numberOfLines={1} maxFontSizeMultiplier={1} accessibilityLabel={`${formatFromFiat(walletBalance, DEFAULT_CURRENCY_CODE)} available`}>
                  {formatFromFiat(walletBalance, DEFAULT_CURRENCY_CODE)} available
                </Text>
              </View>
            </Pressable>
          </View>
        )}

        {useBalance && balanceApplied > 0 && (
          <View style={[styles.savingsBadge, t.savingsBadge]}>
            <Ionicons name="wallet-outline" size={12} color={colors.success} aria-hidden={true} />
            <Text style={[styles.savingsText, t.savingsText]} maxFontSizeMultiplier={1}>
              Saving {formatFromFiat(balanceApplied, DEFAULT_CURRENCY_CODE)} with wallet balance
            </Text>
          </View>
        )}

        {/* 7. Transaction feedback — canonical PaymentStateBanner (audit P0) */}
        {stage !== 'idle' ? (
          <PaymentStateBanner
            stage={stage}
            label={STAGE_LABELS[stage]}
            colors={colors}
            reducedMotion={reducedMotionEnabled}
          />
        ) : null}

        {orderError ? (
          <View style={styles.orderErrorContainer}>
            <Text style={[styles.orderErrorText, t.orderErrorText]} accessibilityLiveRegion="polite" maxFontSizeMultiplier={2}>{orderError}</Text>
            {stage === 'payment_failed' && (
              <Pressable
                style={({ pressed }) => [styles.retryBtn, t.capabilityRetryBtn, pressed && { opacity: 0.7 }]}
                onPress={() => { haptics.tap(); handlePay(); }}
                accessibilityRole="button"
                accessibilityLabel="Retry payment"
              >
                <Text style={[styles.retryBtnText, t.capabilityRetryText]} maxFontSizeMultiplier={1}>Retry payment</Text>
              </Pressable>
            )}
          </View>
        ) : null}

        {capabilityError ? (
          <View style={styles.capabilityErrorRow}>
            <Text style={[styles.hintText, t.hintText, { flex: 1 }]} maxFontSizeMultiplier={2}>
              {capabilityError}
            </Text>
            <Pressable
              style={[styles.capabilityRetryBtn, t.capabilityRetryBtn]}
              onPress={() => void hydrateCheckout()}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Try again"
              accessibilityHint="Retry loading checkout details"
            >
              <Text style={[styles.capabilityRetryText, t.capabilityRetryText]} maxFontSizeMultiplier={1}>Try again</Text>
            </Pressable>
          </View>
        ) : null}

        <Text style={[styles.termsText, t.termsText]} maxFontSizeMultiplier={2}>
          By tapping "Pay", you agree to our Terms of Sale and Privacy Policy.
        </Text>
      </ScrollView>

      {/* 8. Sticky compact order summary + trust badges + Pay footer */}
      <View style={[styles.footer, t.footer, { paddingBottom: insets.bottom > 0 ? insets.bottom : Space.md }]}>
        {/* Compact cost breakdown — inline above the CTA (2026 checkout UX) */}
        <Pressable
          style={styles.compactSummary}
          onPress={() => { haptics.tap(); setBreakdownSheetVisible(true); }}
          accessibilityRole="button"
          accessibilityLabel={`Order summary. Item ${formatFromFiat(item.price, DEFAULT_CURRENCY_CODE)}, Delivery ${formatFromFiat(POSTAGE_FEE, DEFAULT_CURRENCY_CODE)}, Buyer protection ${formatFromFiat(PLATFORM_CHARGE, DEFAULT_CURRENCY_CODE)}. Total ${formatFromFiat(TOTAL, DEFAULT_CURRENCY_CODE)}. View full breakdown.`}
          accessibilityHint="Open the full cost breakdown and returns policy"
        >
          <View style={styles.compactSummaryRow}>
            <Text style={[styles.compactSummaryLabel, t.compactSummaryRow]} maxFontSizeMultiplier={1}>Item</Text>
            <Text style={[styles.compactSummaryVal, t.compactSummaryValue]} maxFontSizeMultiplier={2}>{formatFromFiat(item.price, DEFAULT_CURRENCY_CODE)}</Text>
          </View>
          <View style={styles.compactSummaryRow}>
            <Text style={[styles.compactSummaryLabel, t.compactSummaryRow]} maxFontSizeMultiplier={1}>Delivery</Text>
            <Text style={[styles.compactSummaryVal, t.compactSummaryValue]} maxFontSizeMultiplier={2}>{formatFromFiat(POSTAGE_FEE, DEFAULT_CURRENCY_CODE)}</Text>
          </View>
          <View style={styles.compactSummaryRow}>
            <Text style={[styles.compactSummaryLabel, t.compactSummaryRow]} maxFontSizeMultiplier={1}>Buyer protection</Text>
            <Text style={[styles.compactSummaryVal, t.compactSummaryValue]} maxFontSizeMultiplier={2}>{formatFromFiat(PLATFORM_CHARGE, DEFAULT_CURRENCY_CODE)}</Text>
          </View>
          {useBalance && balanceApplied > 0 && (
            <View style={styles.compactSummaryRow}>
              <Text style={[styles.compactSummaryLabel, t.compactSummaryRow]} maxFontSizeMultiplier={1}>Wallet applied</Text>
              <Text style={[styles.compactSummaryVal, t.compactSummaryValue]} maxFontSizeMultiplier={2}>-{formatFromFiat(balanceApplied, DEFAULT_CURRENCY_CODE)}</Text>
            </View>
          )}
          <View style={[styles.compactSummaryDivider, t.compactSummaryDivider]} />
          <View style={styles.compactSummaryTotalRow}>
            <View style={styles.compactSummaryTotalLeft}>
              <Text style={[styles.compactSummaryTotalLabel, t.compactSummaryTotalLabel]} maxFontSizeMultiplier={1}>Total</Text>
              <Text
                style={[styles.compactSummaryTotalValue, t.compactSummaryTotalValue]}
                accessibilityLiveRegion="polite"
                accessibilityLabel={`Total ${formatFromFiat(TOTAL, DEFAULT_CURRENCY_CODE)}`}
                maxFontSizeMultiplier={2}
              >
                {formatFromFiat(TOTAL, DEFAULT_CURRENCY_CODE)}
              </Text>
            </View>
            <View style={styles.breakdownChevron}>
              <Text style={[styles.breakdownChevronText, t.breakdownChevronText]} maxFontSizeMultiplier={1}>View full breakdown</Text>
              <Ionicons name="chevron-up" size={16} color={colors.textMuted} aria-hidden={true} />
            </View>
          </View>
        </Pressable>

        {/* Pay button column — digital wallet buttons stacked ABOVE the card
            Pay button. Per 2026 UX research: "Reorder the payment list so
            Apple Pay sits above 'Pay with card' — a 15-25% lift in mobile
            checkout completion." The wallet button is the primary one-tap
            biometric CTA; the card button is the secondary fallback.
            The buyer-protection trust narrative is carried by the
            BuyerProtectionStrip above — no duplicate trust line here. */}
        <View style={styles.footerPayRow}>
          {/* Apple Pay as primary CTA on iOS when enabled */}
          {Platform.OS === 'ios' && isPaymentMethodAllowed(checkoutCapabilities, 'apple_pay') && !isSubmitting && (
            <Pressable
              onPress={() => { haptics.press(); handlePay(); }}
              style={({ pressed }) => [
                styles.walletBtn,
                { backgroundColor: colors.textPrimary },
                pressed && styles.payBtnPressed,
                (!checkoutEligible || isInteractionLocked) && styles.payBtnDisabled,
              ]}
              disabled={!checkoutEligible || isInteractionLocked}
              accessibilityRole="button"
              accessibilityLabel={`Pay ${formatFromFiat(TOTAL, DEFAULT_CURRENCY_CODE)} with Apple Pay`}
              accessibilityState={{ disabled: !checkoutEligible || isInteractionLocked }}
            >
              <Ionicons name="logo-apple" size={22} color={colors.textInverse} aria-hidden={true} />
              <Text style={[styles.walletBtnText, { color: colors.textInverse }]} maxFontSizeMultiplier={1}>Pay with Apple Pay</Text>
            </Pressable>
          )}

          {/* Google Pay as primary CTA on Android when enabled */}
          {Platform.OS === 'android' && isPaymentMethodAllowed(checkoutCapabilities, 'google_pay') && !isSubmitting && (
            <Pressable
              onPress={() => { haptics.press(); handlePay(); }}
              style={({ pressed }) => [
                styles.walletBtn,
                { backgroundColor: colors.textPrimary },
                pressed && styles.payBtnPressed,
                (!checkoutEligible || isInteractionLocked) && styles.payBtnDisabled,
              ]}
              disabled={!checkoutEligible || isInteractionLocked}
              accessibilityRole="button"
              accessibilityLabel={`Pay ${formatFromFiat(TOTAL, DEFAULT_CURRENCY_CODE)} with Google Pay`}
              accessibilityState={{ disabled: !checkoutEligible || isInteractionLocked }}
            >
              <Ionicons name="logo-google" size={22} color={colors.textInverse} aria-hidden={true} />
              <Text style={[styles.walletBtnText, { color: colors.textInverse }]} maxFontSizeMultiplier={1}>Pay with Google Pay</Text>
            </Pressable>
          )}

          <Pressable
            style={({ pressed }) => [
              styles.payBtn,
              walletAvailable ? t.payBtnSecondary : t.payBtn,
              (!checkoutEligible || isInteractionLocked) && styles.payBtnDisabled,
              pressed && !(!checkoutEligible || isInteractionLocked) && styles.payBtnPressed,
            ]}
            onPress={() => { haptics.press(); handlePay(); }}
            disabled={!checkoutEligible || isInteractionLocked}
            accessibilityRole="button"
            accessibilityLabel={
              walletAvailable
                ? `Pay ${formatFromFiat(TOTAL, DEFAULT_CURRENCY_CODE)} with card`
                : `Pay ${formatFromFiat(TOTAL, DEFAULT_CURRENCY_CODE)}`
            }
            accessibilityState={{
              disabled: !checkoutEligible || isInteractionLocked,
              busy: isSubmitting,
            }}
          >
            {isSubmitting ? (
              <PulsingDot color={colors.textInverse} reducedMotion={reducedMotionEnabled} />
            ) : (
              <Ionicons
                name="lock-closed"
                size={16}
                color={walletAvailable ? colors.textPrimary : colors.textInverse}
                aria-hidden={true}
              />
            )}
            <Text
              style={[
                styles.payBtnText,
                walletAvailable ? t.payBtnSecondaryText : t.payBtnText,
              ]}
              maxFontSizeMultiplier={1}
            >
              {payLabel}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Non-blocking progress overlay — keeps checkout visible (§14) */}
      {(stage === 'creating_order' || stage === 'opening_payment' || stage === 'authenticating') && (
        <CheckoutProgressOverlay
          label={STAGE_LABELS[stage]}
          colors={colors}
        />
      )}

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
      <BottomSheet
        visible={breakdownSheetVisible}
        onDismiss={() => setBreakdownSheetVisible(false)}
        snapPoint={0.6}
      >
        <View style={styles.breakdownSheetContent}>
          <Text style={[styles.breakdownSheetTitle, t.breakdownSheetTitle]}>Full breakdown</Text>
          <PriceRow label="Item" value={formatFromFiat(item.price, DEFAULT_CURRENCY_CODE)} />
          <PriceRow label="Buyer protection fee" value={formatFromFiat(PLATFORM_CHARGE, DEFAULT_CURRENCY_CODE)} />
          <PriceRow
            label={`Delivery${postageOption.liveQuote ? '' : ' (Estimated)'}`}
            value={formatFromFiat(POSTAGE_FEE, DEFAULT_CURRENCY_CODE)}
          />
          <View style={styles.protectionIncludedRow}>
            <Ionicons name="checkmark-circle" size={12} color={colors.success} aria-hidden={true} />
            <Text style={[styles.protectionIncludedText, t.protectionIncludedText]}>
              Includes buyer protection — funds held until you receive your order
            </Text>
          </View>
          {useBalance && balanceApplied > 0 && (
            <>
              <PriceRow
                label="Wallet balance applied"
                value={`-${formatFromFiat(balanceApplied, DEFAULT_CURRENCY_CODE)}`}
              />
              <View style={[styles.breakdownSheetDivider, t.breakdownSheetDivider]} />
              <PriceRow label="To pay" value={formatFromFiat(TOTAL, DEFAULT_CURRENCY_CODE)} bold />
            </>
          )}
          {!useBalance && (
            <View style={[styles.breakdownSheetDivider, t.breakdownSheetDivider]} />
          )}
          <View style={styles.breakdownSheetTotalRow}>
            <Text style={[styles.breakdownSheetTotalLabel, t.breakdownSheetTotalLabel]}>Total</Text>
            <Text style={[styles.breakdownSheetTotalValue, t.breakdownSheetTotalValue]}>
              {formatFromFiat(TOTAL, DEFAULT_CURRENCY_CODE)}
            </Text>
          </View>
          <View style={[styles.breakdownSheetDivider, t.breakdownSheetDivider]} />
          <View style={styles.breakdownSheetPolicyRow}>
            <Ionicons name="return-down-back-outline" size={16} color={colors.textMuted} aria-hidden={true} />
            <Text style={[styles.breakdownSheetPolicyText, t.breakdownSheetLabel]}>
              Returns accepted within 14 days. Refunds issued to your original payment method.
            </Text>
          </View>
        </View>
      </BottomSheet>
    </SafeAreaView>
  );
}

// ===========================================================================
// PulsingDot — replaces ActivityIndicator in buttons with a calm pulsing dot.
// Respects reduced motion (static dot when enabled).
// ===========================================================================
function PulsingDot({
  color,
  reducedMotion,
  size = 8,
}: {
  color: string;
  reducedMotion: boolean;
  size?: number;
}) {
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (reducedMotion) return;
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.3, { duration: Motion.duration.slower, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: Motion.duration.slower, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
    return () => {
      opacity.value = 1;
    };
  }, [opacity, reducedMotion]);

  const dotStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Reanimated.View
      style={[
        { width: size, height: size, borderRadius: RadiusRoleValue.pillAvatar, backgroundColor: color },
        reducedMotion ? undefined : dotStyle,
      ]}
    />
  );
}

// ===========================================================================
// PaymentStateBanner — canonical payment state component (§14, audit P0).
// Replaces the generic ActivityIndicator with a state-specific banner that
// has a colored accent bar, a pulsing dot (not spinner) for active states,
// and state-specific icons for failed/pending states.
// ===========================================================================
function PaymentStateBanner({
  stage,
  label,
  colors,
  reducedMotion,
}: {
  stage: CheckoutStage;
  label: string;
  colors: ThemeColors;
  reducedMotion: boolean;
}) {
  const dotOpacity = useSharedValue(1);

  useEffect(() => {
    if (reducedMotion || stage === 'idle') return;
    if (stage === 'creating_order' || stage === 'opening_payment' || stage === 'authenticating' || stage === 'awaiting_payment') {
      dotOpacity.value = withRepeat(
        withSequence(
          withTiming(0.3, { duration: Motion.duration.slower, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: Motion.duration.slower, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      );
    }
    return () => {
      dotOpacity.value = 1;
    };
  }, [dotOpacity, reducedMotion, stage]);

  const dotStyle = useAnimatedStyle(() => ({
    opacity: dotOpacity.value,
  }));

  const config = useMemo(() => {
    switch (stage) {
      case 'creating_order':
      case 'opening_payment':
      case 'authenticating':
      case 'awaiting_payment':
        return {
          accentColor: colors.brand,
          icon: null as React.ReactNode,
          showDot: true,
        };
      case 'payment_succeeded':
        return {
          accentColor: colors.success,
          icon: <Ionicons name="checkmark-circle" size={16} color={colors.success} aria-hidden={true} />,
          showDot: false,
        };
      case 'payment_failed':
        return {
          accentColor: colors.danger,
          icon: <Ionicons name="alert-circle" size={16} color={colors.danger} aria-hidden={true} />,
          showDot: false,
        };
      case 'payment_pending':
        return {
          accentColor: colors.textMuted,
          icon: <Ionicons name="time-outline" size={16} color={colors.textMuted} aria-hidden={true} />,
          showDot: false,
        };
      default:
        return {
          accentColor: colors.brand,
          icon: null as React.ReactNode,
          showDot: false,
        };
    }
  }, [stage, colors]);

  return (
    <View
      style={[
        paymentBannerStyles.container,
        {
          backgroundColor: `${config.accentColor}0A`,
          borderColor: `${config.accentColor}20`,
        },
      ]}
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
    >
      <View style={[paymentBannerStyles.accentBar, { backgroundColor: config.accentColor }]} />
      <View style={paymentBannerStyles.content}>
        {config.showDot ? (
          <Reanimated.View
            style={[paymentBannerStyles.dot, { backgroundColor: config.accentColor }, reducedMotion ? undefined : dotStyle]}
          />
        ) : (
          config.icon
        )}
        <Text
          style={[
            paymentBannerStyles.label,
            {
              color: stage === 'payment_failed' ? colors.danger : stage === 'payment_succeeded' ? colors.success : colors.textSecondary,
            },
          ]}
          numberOfLines={2}
        >
          {label}
        </Text>
      </View>
    </View>
  );
}

const paymentBannerStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: RadiusRoleValue.mediaThumbnail,
    borderWidth: Stroke.hairline,
    overflow: 'hidden',
    marginTop: Space.sm,
  },
  accentBar: {
    width: 3,
    flexShrink: 0,
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm + 2,
    paddingHorizontal: Space.md,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: RadiusRoleValue.pillAvatar,
    flexShrink: 0,
  },
  label: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.medium,
  },
});

// ===========================================================================
// Non-blocking progress overlay — shown during order creation / payment setup
// Keeps the checkout context visible while communicating progress (§14).
// ===========================================================================
function CheckoutProgressOverlay({
  label,
  colors,
}: {
  label: string;
  colors: ThemeColors;
}) {
  const reducedMotion = useReducedMotion();
  const progressX = useSharedValue(-1);

  useEffect(() => {
    if (reducedMotion) return;
    progressX.value = withRepeat(
      withSequence(
        withTiming(1, { duration: Motion.duration.crawl, easing: Easing.inOut(Easing.ease) }),
        withTiming(-1, { duration: 0 }),
      ),
      -1,
      false,
    );
    return () => {
      progressX.value = -1;
    };
  }, [progressX, reducedMotion]);

  const barStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progressX.value * 100 }],
  }));

  return (
    <View
      pointerEvents="none"
      style={[
        progressOverlayStyles.overlay,
        { backgroundColor: `${colors.background}F2`, borderColor: colors.border, shadowColor: colors.shadow },
      ]}
      accessibilityLabel={label}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <View style={progressOverlayStyles.row}>
        <ActivityIndicator size="small" color={colors.brand} />
        <Text style={[progressOverlayStyles.label, { color: colors.textPrimary }]} numberOfLines={1}>
          {label}
        </Text>
      </View>
      {/* Subtle indeterminate progress bar */}
      <View style={[progressOverlayStyles.track, { backgroundColor: colors.border }]}>
        <Reanimated.View
          style={[
            progressOverlayStyles.fill,
            { backgroundColor: colors.brand },
            reducedMotion ? undefined : barStyle,
          ]}
        />
      </View>
    </View>
  );
}

const progressOverlayStyles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 60,
    left: Space.md,
    right: Space.md,
    borderRadius: RadiusRoleValue.sheetDialog,
    borderWidth: Stroke.hairline,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    shadowColor: 'transparent',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    marginBottom: Space.sm,
  },
  label: {
    flex: 1,
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.medium,
  },
  track: {
    height: Space.xs - 1,
    borderRadius: RadiusRoleValue.pillAvatar,
    overflow: 'hidden',
  },
  fill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '-40%',
    width: '40%',
    borderRadius: RadiusRoleValue.pillAvatar,
  },
});

// ===========================================================================
// CheckoutSkeleton — matches the final checkout layout geometry so the
// loading-to-populated transition has no layout shift. Per AGENTS.md §14:
// "Skeletons should resemble the final layout."
// ===========================================================================
function CheckoutSkeleton({ colors }: { colors: ThemeColors }) {
  const insets = useSafeAreaInsets();
  const skeletonStyles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Space.md,
      paddingBottom: Space.sm,
      paddingTop: insets.top,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    headerTitle: {
      fontSize: TypographyV2.sectionTitle.size,
      fontFamily: FontFamily.semibold,
      color: colors.textPrimary,
    },
    headerSpacer: {
      width: Control.hit,
    },
    scrollContent: {
      paddingHorizontal: Space.md,
      paddingTop: Space.sm,
      gap: Space.md,
    },
    itemSummaryBlock: {
      flexDirection: 'row',
      gap: Space.md,
      paddingVertical: Space.sm,
    },
    skeletonImage: {
      width: 72,
      height: 72,
      borderRadius: RadiusRoleValue.mediaThumbnail,
      backgroundColor: colors.surfaceAlt,
    },
    skeletonTextCol: {
      flex: 1,
      gap: Space.xs + 2,
      paddingVertical: Space.xs,
    },
    skeletonLine: {
      height: 14,
      borderRadius: RadiusRoleValue.compactControl,
      backgroundColor: colors.surfaceAlt,
    },
    skeletonLineShort: {
      width: '60%',
    },
    skeletonLineMedium: {
      width: '80%',
    },
    skeletonRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.md,
      paddingVertical: Space.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    skeletonIcon: {
      width: 22,
      height: 22,
      borderRadius: RadiusRoleValue.pillAvatar,
      backgroundColor: colors.surfaceAlt,
    },
    skeletonRowText: {
      flex: 1,
      gap: Space.xs,
    },
    skeletonFooter: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      paddingHorizontal: Space.md,
      paddingTop: Space.sm + 2,
      paddingBottom: Math.max(insets.bottom, Space.md),
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      backgroundColor: colors.background,
      gap: Space.sm,
    },
    skeletonPayBtn: {
      height: 52,
      borderRadius: RadiusRoleValue.pillAvatar,
      backgroundColor: colors.surfaceAlt,
    },
    skeletonTotalRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: Space.xs,
    },
  }), [colors, insets.top, insets.bottom]);

  return (
    <View style={skeletonStyles.container}>
      <View style={skeletonStyles.header}>
        <View style={{ width: Control.hit, height: Control.hit, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="close" size={22} color={colors.textPrimary} aria-hidden={true} />
        </View>
        <Text style={skeletonStyles.headerTitle}>Checkout</Text>
        <View style={skeletonStyles.headerSpacer} />
      </View>
      <View style={skeletonStyles.scrollContent}>
        {/* Item summary skeleton */}
        <View style={skeletonStyles.itemSummaryBlock}>
          <View style={skeletonStyles.skeletonImage} />
          <View style={skeletonStyles.skeletonTextCol}>
            <View style={[skeletonStyles.skeletonLine, skeletonStyles.skeletonLineMedium]} />
            <View style={[skeletonStyles.skeletonLine, skeletonStyles.skeletonLineShort]} />
          </View>
        </View>
        {/* Delivery address row skeleton */}
        <View style={skeletonStyles.skeletonRow}>
          <View style={skeletonStyles.skeletonIcon} />
          <View style={skeletonStyles.skeletonRowText}>
            <View style={[skeletonStyles.skeletonLine, skeletonStyles.skeletonLineShort]} />
            <View style={[skeletonStyles.skeletonLine, { width: '90%' }]} />
          </View>
        </View>
        {/* Delivery method row skeleton */}
        <View style={skeletonStyles.skeletonRow}>
          <View style={skeletonStyles.skeletonIcon} />
          <View style={skeletonStyles.skeletonRowText}>
            <View style={[skeletonStyles.skeletonLine, skeletonStyles.skeletonLineShort]} />
            <View style={[skeletonStyles.skeletonLine, { width: '70%' }]} />
          </View>
        </View>
        {/* Payment method row skeleton */}
        <View style={skeletonStyles.skeletonRow}>
          <View style={skeletonStyles.skeletonIcon} />
          <View style={skeletonStyles.skeletonRowText}>
            <View style={[skeletonStyles.skeletonLine, skeletonStyles.skeletonLineShort]} />
            <View style={[skeletonStyles.skeletonLine, { width: '80%' }]} />
          </View>
        </View>
      </View>
      {/* Footer skeleton */}
      <View style={skeletonStyles.skeletonFooter}>
        <View style={skeletonStyles.skeletonTotalRow}>
          <View style={[skeletonStyles.skeletonLine, { width: 50 }]} />
          <View style={[skeletonStyles.skeletonLine, { width: 90 }]} />
        </View>
        <View style={skeletonStyles.skeletonPayBtn} />
      </View>
    </View>
  );
}

function PriceRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  const { colors } = useAppTheme();
  const priceStyles = useMemo(() => StyleSheet.create({
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: Space.xs + 2,
    },
    label: {
      fontSize: TypographyV2.body.size,
      fontFamily: FontFamily.regular,
      color: colors.textSecondary,
    },
    labelBold: {
      fontSize: TypographyV2.priceList.size,
      fontFamily: FontFamily.semibold,
      color: colors.textPrimary,
    },
    value: {
      fontSize: TypographyV2.body.size,
      fontFamily: FontFamily.medium,
      color: colors.textPrimary,
      fontVariant: ['tabular-nums'],
    },
    valueBold: {
      fontSize: TypographyV2.priceList.size,
      fontFamily: FontFamily.bold,
      color: colors.textPrimary,
      fontVariant: ['tabular-nums'],
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
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnPressed: {
    opacity: 0.5,
  },
  headerTitle: {
    fontSize: TypographyV2.sectionTitle.size,
    fontFamily: FontFamily.semibold,
  },
  headerSpacer: {
    width: Control.hit,
  },
  scrollContent: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
  },
  savingsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    marginTop: Space.xs,
    paddingVertical: Space.xs,
    paddingHorizontal: Space.sm,
    borderRadius: RadiusRoleValue.compactControl,
    alignSelf: 'flex-start',
  },
  savingsText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.semibold,
    fontVariant: ['tabular-nums'],
  },
  protectionStripWrap: {
    marginTop: Space.sm,
  },
  securePaymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingVertical: Space.xs,
    paddingHorizontal: Space.xs,
  },
  securePaymentText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.medium,
    lineHeight: TypographyV2.meta.lineHeight,
  },
  protectionIncludedRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.xs + 1,
    paddingTop: Space.xs + 2,
  },
  protectionIncludedText: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.regular,
    lineHeight: TypographyV2.meta.lineHeight,
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
    borderRadius: Radius.none,
    borderWidth: 0,
  },
  balanceTogglePressed: {
    opacity: 0.7,
  },
  balanceSwitch: {
    width: Space.xxl - Space.sm,
    height: Space.lg,
    borderRadius: RadiusRoleValue.pillAvatar,
    borderWidth: Stroke.standard,
    justifyContent: 'center',
    padding: Space.xs,
  },
  balanceKnob: {
    width: Control.iconCompact,
    height: Control.iconCompact,
    borderRadius: RadiusRoleValue.pillAvatar,
    alignSelf: 'flex-start',
  },
  balanceKnobOn: {
    alignSelf: 'flex-end',
  },
  balanceTextCol: {
    flex: 1,
    gap: Space.xs - 3,
  },
  balanceLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.semibold,
  },
  balanceAmount: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.regular,
    fontVariant: ['tabular-nums'],
  },
  orderErrorText: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.medium,
    paddingVertical: Space.sm,
    flex: 1,
    fontVariant: ['tabular-nums'],
  },
  orderErrorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.xs,
  },
  retryBtn: {
    paddingHorizontal: Space.sm + 2,
    paddingVertical: Space.xs + 1,
    borderRadius: RadiusRoleValue.compactControl,
    borderWidth: Stroke.standard,
    minHeight: Control.chromeCompact,
    justifyContent: 'center',
    flexShrink: 0,
  },
  retryBtnText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.semibold,
  },
  hintText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.regular,
    paddingVertical: Space.xs,
  },
  partialDataBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    marginHorizontal: Space.md,
    marginTop: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    borderRadius: RadiusRoleValue.mediaThumbnail,
    borderWidth: Stroke.hairline,
  },
  partialDataMessage: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.medium,
    fontVariant: ['tabular-nums'],
  },
  partialDataAction: {
    paddingHorizontal: Space.sm + 2,
    paddingVertical: Space.xs + 1,
    borderRadius: RadiusRoleValue.compactControl,
    borderWidth: Stroke.standard,
    minHeight: Control.chromeCompact,
    justifyContent: 'center',
  },
  partialDataActionText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.semibold,
  },
  capabilityErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.xs,
  },
  capabilityRetryBtn: {
    paddingHorizontal: Space.sm + 2,
    paddingVertical: Space.xs + 1,
    borderRadius: RadiusRoleValue.compactControl,
    borderWidth: Stroke.standard,
    minHeight: Control.chromeCompact,
    justifyContent: 'center',
  },
  capabilityRetryText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.semibold,
  },
  termsText: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.regular,
    lineHeight: TypographyV2.meta.lineHeight,
    textAlign: 'center',
    paddingTop: Space.md,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Space.md,
    paddingTop: Space.sm + 2,
    ...Elevation.floating,
  },
  compactSummary: {
    paddingVertical: Space.sm,
  },
  compactSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Space.xs + 1,
  },
  compactSummaryLabel: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    fontVariant: ['tabular-nums'],
  },
  compactSummaryVal: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.medium,
    fontVariant: ['tabular-nums'],
  },
  compactSummaryDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: Space.xs + 1,
  },
  compactSummaryTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Space.xs,
  },
  compactSummaryTotalLeft: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Space.sm,
  },
  compactSummaryTotalLabel: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: FontFamily.semibold,
    fontVariant: ['tabular-nums'],
  },
  compactSummaryTotalValue: {
    fontSize: TypographyV2.priceHero.size,
    lineHeight: TypographyV2.priceHero.lineHeight,
    fontFamily: FontFamily.bold,
    letterSpacing: TypographyV2.priceHero.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
  breakdownChevron: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  breakdownChevronText: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.regular,
  },
  footerPayRow: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: Space.sm,
    paddingTop: Space.xs,
  },
  breakdownSheetContent: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.lg,
  },
  breakdownSheetTitle: {
    fontSize: TypographyV2.sectionTitle.size,
    fontFamily: FontFamily.semibold,
    marginBottom: Space.md,
  },
  breakdownSheetDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: Space.sm,
  },
  breakdownSheetTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Space.xs,
  },
  breakdownSheetTotalLabel: {
    fontSize: TypographyV2.priceList.size,
    fontFamily: FontFamily.semibold,
    fontVariant: ['tabular-nums'],
  },
  breakdownSheetTotalValue: {
    fontSize: TypographyV2.screenTitle.size,
    fontFamily: FontFamily.bold,
    fontVariant: ['tabular-nums'],
  },
  breakdownSheetPolicyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.sm,
    paddingVertical: Space.xs,
  },
  breakdownSheetPolicyText: {
    flex: 1,
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.regular,
    lineHeight: TypographyV2.body.lineHeight,
  },
  payBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
    paddingVertical: Space.md + 2,
    paddingHorizontal: Space.lg,
    borderRadius: RadiusRoleValue.pillAvatar,
    minHeight: 56,
  },
  walletBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs + 2,
    height: 56,
    borderRadius: RadiusRoleValue.pillAvatar,
  },
  walletBtnText: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: FontFamily.semibold,
  },
  payBtnDisabled: {
    opacity: 0.5,
  },
  payBtnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  payBtnText: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: FontFamily.semibold,
    fontVariant: ['tabular-nums'],
  },
  signedOutContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.xl,
    gap: Space.md,
  },
  signedOutTitle: {
    fontSize: TypographyV2.sectionTitle.size,
    fontFamily: FontFamily.semibold,
    textAlign: 'center',
  },
  signedOutBody: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.regular,
    textAlign: 'center',
    lineHeight: TypographyV2.body.lineHeight,
  },
  signedOutBtn: {
    marginTop: Space.sm,
    paddingVertical: Space.md - 2,
    paddingHorizontal: Space.xl,
    borderRadius: RadiusRoleValue.sheetDialog,
    minHeight: Space.xxl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signedOutBtnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  signedOutBtnText: {
    fontSize: TypographyV2.priceList.size,
    fontFamily: FontFamily.semibold,
  },
});
