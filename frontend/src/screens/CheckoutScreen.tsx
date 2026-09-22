import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  Platform,
  RefreshControl,
  AccessibilityInfo,
  findNodeHandle,
} from 'react-native';
import { useA11yAudit } from '../hooks/useA11yAudit';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../theme/ThemeContext';
import { EmptyState } from '../components/EmptyState';
import { RootStackParamList } from '../navigation/types';
import { openProfile } from '../navigation/openProfile';
import { useStore } from '../store/useStore';
import { createDmConversationOnApi } from '../services/chatApi';
import { useNotifications } from '../hooks/useNotifications';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useConnectivity } from '../hooks/useConnectivity';
import { isPaymentMethodAllowed } from '../utils/capabilityPolicy';
import { calculatePlatformChargeGbp } from '../utils/currencyAuthoringFlows';
import { useBackendData } from '../context/BackendDataContext';
import { PaymentStateBanner } from '../components/checkout/PaymentStateBanner';
import { CheckoutProgressOverlay } from '../components/checkout/CheckoutProgressOverlay';
import { CheckoutSkeleton } from '../components/checkout/CheckoutSkeleton';
import { CheckoutHeader } from '../components/checkout/CheckoutHeader';
import { CheckoutGuardScaffold } from '../components/checkout/CheckoutGuardScaffold';
import { CheckoutGuardState } from '../components/checkout/CheckoutGuardState';
import { CheckoutProgressDots } from '../components/checkout/CheckoutProgressDots';
import { CheckoutPartialDataBanner } from '../components/checkout/CheckoutPartialDataBanner';
import { CheckoutSelectionSection } from '../components/checkout/CheckoutSelectionSection';
import { CheckoutBalanceSection } from '../components/checkout/CheckoutBalanceSection';
import { CheckoutVerificationSection } from '../components/checkout/CheckoutVerificationSection';
import { CheckoutOrderError } from '../components/checkout/CheckoutOrderError';
import { CheckoutCapabilityError } from '../components/checkout/CheckoutCapabilityError';
import { CheckoutFooter } from '../components/checkout/CheckoutFooter';
import { CheckoutSheets } from '../components/checkout/CheckoutSheets';
import { isPlatformPaySupported } from '@stripe/stripe-react-native';
import { STAGE_LABELS } from '../utils/checkoutFlow';
import { CommerceDetailOfflineBanner } from '../components/commerce/detail';
import { BuyerProtectionStrip } from '../components/product';
import { haptics } from '../utils/haptics';
import { getListingCoverUri } from '../utils/media';
import { Space, FontFamily } from '../theme/designTokens';
import { TypographyV2, MAX_FONT_SCALE } from '../theme/typography.v2';
import { useCheckoutData } from '../hooks/checkout/useCheckoutData';
import { toIze } from '../utils/currency';
import { useCheckoutHydration } from '../hooks/checkout/useCheckoutHydration';
import { useCheckoutPaymentFlow } from '../hooks/checkout/useCheckoutPaymentFlow';
import { useCheckoutSelectionActions } from '../hooks/checkout/useCheckoutSelectionActions';
import { useSellerTrust } from '../platform/product/useListingQueries';
import { formatShortDate } from '../utils/dateFormat';
import {
  buildPartialDataPrompt,
  computeCheckoutRowErrors,
  computeCheckoutStepCompletion,
  getCheckoutAddressSubtitle,
  getCheckoutPayLabel,
} from '../components/checkout/checkoutViewModels';
import { useScreenCaptureProtection } from '../platform/screenCapture';

type RouteT = RouteProp<RootStackParamList, 'Checkout'>;

// POST /orders rejects walletDebitGbp > 0 (WALLET_SPLIT_TENDER_UNSUPPORTED)
// — keep the balance-at-checkout section off until the order contract
// supports split tender. Full-order 1ZE payment stays available via the
// payment-method option.
const CHECKOUT_SPLIT_TENDER_ENABLED = false;

export default function CheckoutScreen() {
  const a11yRef = useRef<any>(null);
  useA11yAudit(a11yRef, 'CheckoutScreen');
  useScreenCaptureProtection();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<RouteT>();
  const { itemId, orderId, reservationId } = route.params ?? {};
  const { colors, isDark } = useAppTheme();
  const reducedMotionEnabled = useReducedMotion();
  const { isOffline } = useConnectivity();
  const { listings } = useBackendData();

  // Theme-aware color overrides for the static styles. The static
  // StyleSheet contains only non-color properties; colors are applied
  // via this themed proxy so the screen is fully dark-mode compatible.
  const t = useMemo(() => ({
    container: { backgroundColor: colors.background },
    termsText: { color: colors.textMuted },
  }), [colors]);
  const currentUser = useStore((state) => state.currentUser);
  const savedAddress = useStore((state) => state.savedAddress);
  const saveAddress = useStore((state) => state.saveAddress);
  const clearSavedAddress = useStore((state) => state.clearSavedAddress);
  const savedPaymentMethod = useStore((state) => state.savedPaymentMethod);
  const savePaymentMethod = useStore((state) => state.savePaymentMethod);
  const clearSavedPaymentMethod = useStore((state) => state.clearSavedPaymentMethod);
  const upsertConversation = useStore((state) => state.upsertConversation);

  // Measured footer height drives the scroll padding so large-text checkout
  // (200% dynamic type — S21-01) never hides content behind the sticky
  // summary/pay column. 0 = not yet measured; falls back to the legacy inset.
  const [footerHeight, setFooterHeight] = useState(0);
  const [addCardSheetVisible, setAddCardSheetVisible] = useState(false);
  const [paymentSelectorVisible, setPaymentSelectorVisible] = useState(false);
  const [deliverySelectorVisible, setDeliverySelectorVisible] = useState(false);
  const [breakdownSheetVisible, setBreakdownSheetVisible] = useState(false);
  // Item verification add-on — a request flag on the order (no fee; the
  // backend exposes no verification price). For order-bound checkout the
  // stored order flag is the source of truth (hydrated below).
  const [verificationRequested, setVerificationRequested] = useState(false);
  const { showError } = useNotifications();
  const { formatFromFiat, fxRates } = useFormattedPrice();

  const item = listings.find((l) => l.id === itemId);

  const {
    isHydrating,
    isRefreshing,
    boundOrder,
    boundOrderLoadFailed,
    boundOrderNotPayable,
    backendAddresses,
    backendPaymentMethods,
    setBackendPaymentMethods,
    addressError,
    paymentError,
    setPaymentError,
    shippingError,
    capabilityError,
    checkoutCapabilities,
    postageOption,
    setPostageOption,
    shippingQuotes,
    hydrateCheckout,
    handleRefreshCheckout,
  } = useCheckoutHydration({
    itemId,
    orderId,
    item,
    userId: currentUser?.id,
    savedAddressId: savedAddress?.id,
    savedAddressPostcode: savedAddress?.postalCode,
    savedPaymentMethodId: savedPaymentMethod?.id,
    saveAddress,
    clearSavedAddress,
    savePaymentMethod,
    clearSavedPaymentMethod,
  });

  // Wallet balance for balance-at-checkout toggle.
  // useOnezePayment — when true, the buyer pays the full order total
  // directly from their 1ZE wallet via the oneze_internal gateway.
  const {
    walletBalance,
    onezeBalance,
    useBalance,
    setUseBalance,
    useOnezePayment,
    setUseOnezePayment,
    balanceLoading,
    balanceError,
    reloadBalance,
  } = useCheckoutData({
    currentUserId: currentUser?.id,
    item,
    postagePriceGbp: postageOption.priceFromGbp,
  });

  // Inline validation — set when the user taps Pay but fields are missing.
  // Errors clear automatically as fields become valid (computed from state).
  const [hasAttemptedPay, setHasAttemptedPay] = useState(false);

  // 1ZE requirement estimate — the same GBP→1ZE conversion the wallet
  // debit applies (at-par via the FX bridge). The server-provided
  // `onezeRequiredIze` overrides this once an intent response carries it.
  const estimatedGrossGbp = (boundOrder?.subtotalGbp ?? item?.price ?? 0)
    + (boundOrder?.platformChargeGbp ?? calculatePlatformChargeGbp(boundOrder?.subtotalGbp ?? item?.price ?? 0))
    + postageOption.priceFromGbp;
  const onezeRequiredEstimate = useMemo(
    () => toIze(estimatedGrossGbp, 'GBP', fxRates),
    [estimatedGrossGbp, fxRates]
  );

  const {
    stage,
    isSubmitting,
    isInteractionLocked,
    checkoutEligible,
    isCheckingPaymentStatus,
    orderError,
    boundOrderIssue,
    paymentIssue,
    onezeRequiredIze,
    handlePay,
    platformPayEligible,
    handlePlatformPay,
    cancelStaleOrder,
    handleCheckPaymentStatus,
    createdOrderIdRef,
    discardPendingPayment,
  } = useCheckoutPaymentFlow({
    itemId: itemId ?? '',
    item,
    boundOrderId: orderId,
    boundReservationId: reservationId,
    boundOrder,
    userId: currentUser?.id,
    isHydrating,
    savedAddressId: savedAddress?.id,
    savedPaymentMethod,
    checkoutCapabilities,
    postageOption,
    verificationRequested,
    useBalance,
    walletBalance,
    useOnezePayment,
    onezeBalance,
    onezeRequiredEstimateIze: onezeRequiredEstimate,
    setHasAttemptedPay,
  });

  // Order-bound checkout: hydrate the stored verification flag once the
  // bound order arrives. Local toggles win afterwards — boundOrder only
  // changes on refetch.
  const boundOrderVerification = boundOrder?.verificationRequested;
  useEffect(() => {
    if (boundOrderVerification != null) {
      setVerificationRequested(boundOrderVerification);
    }
  }, [boundOrderVerification]);

  // --- Item verification add-on toggle ---
  // Same selection-change contract as address/payment/delivery: clear
  // inline validation and cancel a stale in-flight order before the flag
  // is committed (the flag is part of the order signature).
  const handleVerificationToggle = useCallback(async () => {
    if (isInteractionLocked) return;
    haptics.tap();
    setHasAttemptedPay(false);
    if (createdOrderIdRef.current) {
      const cancelled = await cancelStaleOrder();
      if (!cancelled) return;
    }
    setVerificationRequested((v) => !v);
  }, [isInteractionLocked, createdOrderIdRef, cancelStaleOrder]);

  const [confirmSheet, setConfirmSheet] = useState<{
    visible: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    cancelLabel: string;
    onConfirm: () => void;
    variant: 'default' | 'danger';
  }>({ visible: false, title: '', message: '', confirmLabel: 'Confirm', cancelLabel: 'Cancel', onConfirm: () => {}, variant: 'default' });

  // --- Delivery selection change ---
  // The selector opens when more than one persisted server quote exists —
  // capability carriers alone aren't selectable (they carry no quoteId the
  // order route requires).
  const canChangePostage = shippingQuotes.length > 1;
  const allowCardPayments = isPaymentMethodAllowed(checkoutCapabilities, 'card');

  // Selection-change actions: each clears inline validation, cancels any
  // stale in-flight order, then navigates or opens a sheet.
  const {
    isSelectingPayment,
    handleAddressPress,
    handleSelectPaymentMethod,
    handleAddCardSuccess,
    handlePaymentPress,
    handleDeliveryPress,
    handleSelectDeliveryOption,
  } = useCheckoutSelectionActions({
    userId: currentUser?.id,
    savedAddress,
    savedPaymentMethodId: savedPaymentMethod?.id,
    canChangePostage,
    allowCardPayments,
    hasCapabilities: !!checkoutCapabilities,
    paymentMethodsCount: backendPaymentMethods.length,
    createdOrderIdRef,
    cancelStaleOrder,
    savePaymentMethod,
    setBackendPaymentMethods,
    setPaymentError,
    setHasAttemptedPay,
    setPaymentSelectorVisible,
    setAddCardSheetVisible,
    setDeliverySelectorVisible,
    setPostageOption,
    selectedQuoteId: postageOption.quoteId,
  });

  // Order-bound checkout (accepted offer / resumed order): the order is the
  // source of truth for price — the listing is paused server-side after a
  // seller accepts, so feed-cached fields only fill presentation gaps the
  // order snapshot lacks (title, media). orderId wins over itemId when both
  // route params are present.
  const orderListing = boundOrder ? listings.find((l) => l.id === boundOrder.listingId) : undefined;
  const displayItem = useMemo(() => {
    if (!orderId) return item;
    if (!boundOrder) return undefined;
    return {
      id: boundOrder.listingId,
      title: boundOrder.listingTitle || orderListing?.title || 'Ordered item',
      images: orderListing?.images ?? (boundOrder.listingImageUrl ? [boundOrder.listingImageUrl] : []),
      price: boundOrder.subtotalGbp,
      sellerId: boundOrder.sellerId,
      seller: boundOrder.seller ?? orderListing?.seller ?? null,
    };
  }, [orderId, item, boundOrder, orderListing]);

  // --- Close handler ---
  const handleClose = useCallback(() => {
    if (isSubmitting || stage === 'unknown_outcome') {
      setConfirmSheet({
        visible: true,
        title: 'Payment in progress',
        message: 'Payment confirmation may still complete after you leave. Check your Orders before trying again.',
        confirmLabel: 'Leave',
        cancelLabel: 'Stay',
        onConfirm: () => {
          discardPendingPayment();
          navigation.goBack();
        },
        variant: 'danger',
      });
      return;
    }
    navigation.goBack();
  }, [isSubmitting, stage, navigation, discardPendingPayment]);

  // --- Message seller ---
  const handleMessageSeller = useCallback(async () => {
    if (!displayItem) return;
    const sellerId = displayItem.sellerId || displayItem.seller?.id || '';
    if (!sellerId) return;
    try {
      const conversation = await createDmConversationOnApi({
        recipientUserId: sellerId,
        itemId: displayItem.id,
      });
      upsertConversation(conversation);
      navigation.navigate('Chat', {
        conversationId: conversation.id,
        focusQuery: displayItem.title,
        partnerUserId: sellerId,
        itemId: displayItem.id,
      });
    } catch {
      showError('Could not start conversation. Try again.');
    }
  }, [displayItem, navigation, upsertConversation, showError]);

  // --- Self-purchase check ---
  const isSelfPurchase = useMemo(() => {
    if (!displayItem || !currentUser?.id) return false;
    const sellerId = displayItem.sellerId || displayItem.seller?.id;
    return sellerId === currentUser.id;
  }, [displayItem, currentUser?.id]);

  // --- Seller holiday mode ---
  // POST /orders hard-rejects checkout for an effectively-away seller
  // (409 SELLER_AWAY) — the trust query mirrors that state so the buyer
  // is told up front instead of discovering it after pressing Pay.
  // Order-bound checkout (paying for an accepted offer created before
  // the seller went away) is NOT blocked: the order already exists and
  // its dispatch deadline shifts to after the seller's return — the
  // delivery row carries that expectation instead of a hard guard.
  const checkoutSellerId = displayItem?.sellerId || displayItem?.seller?.id || undefined;
  const { data: checkoutSellerTrust } = useSellerTrust(checkoutSellerId);
  const sellerAway = checkoutSellerTrust?.holidayMode === true;
  const sellerBackLabel = sellerAway && checkoutSellerTrust?.holidayModeUntil
    ? formatShortDate(checkoutSellerTrust.holidayModeUntil)
    : null;

  // --- Partial data state (§14) ---
  // Computed before early returns so the useMemo hook order is stable
  // regardless of which guard branch fires (Rules of Hooks).
  const addressLoaded = backendAddresses.length > 0 || !!savedAddress?.id;
  const paymentLoaded = backendPaymentMethods.length > 0 || !!savedPaymentMethod?.id;

  const partialDataPrompt = useMemo(() => buildPartialDataPrompt({
    isHydrating,
    isInteractionLocked,
    shippingError,
    addressLoaded,
    paymentLoaded,
    hasCarrier: !!postageOption.carrierId,
    onRetryHydrate: () => void hydrateCheckout(),
    onAddAddress: () => handleAddressPress(),
    onAddPayment: () => {
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
  }), [
    isHydrating,
    isInteractionLocked,
    shippingError,
    addressLoaded,
    paymentLoaded,
    postageOption.carrierId,
    hydrateCheckout,
    handleAddressPress,
    allowCardPayments,
    checkoutCapabilities,
    navigation,
    backendPaymentMethods.length,
  ]);

  // Accessibility: payment/order errors must take screen-reader focus — the
  // error card sits mid-scroll and a screen reader would otherwise miss the
  // failure entirely. Focus moves to the error text (the announcement is the
  // fallback for platforms where focus fails). Sheets announce their own
  // title+message on open — and BottomSheet moves focus to sheet content via
  // useModalFocusManagement — so the modal context switch is explicit
  // (audit P3-15).
  const orderErrorRef = useRef<Text>(null);
  useEffect(() => {
    if (orderError) {
      AccessibilityInfo.announceForAccessibility(orderError);
      const node = findNodeHandle(orderErrorRef.current);
      if (node) {
        AccessibilityInfo.setAccessibilityFocus(node);
      }
    }
  }, [orderError]);

  useEffect(() => {
    if (confirmSheet.visible && confirmSheet.title) {
      AccessibilityInfo.announceForAccessibility(`${confirmSheet.title}. ${confirmSheet.message}`);
    }
  }, [confirmSheet.visible, confirmSheet.title, confirmSheet.message]);

  // Device-level platform-pay support — queried once on mount. Lives above
  // every early return: hooks must run unconditionally.
  const [platformPaySupported, setPlatformPaySupported] = useState(false);
  useEffect(() => {
    let cancelled = false;
    // Web/SSR-safe: the shim resolves false where the native module is absent.
    void isPlatformPaySupported()
      .then((supported) => {
        if (!cancelled) setPlatformPaySupported(supported === true);
      })
      .catch(() => {
        if (!cancelled) setPlatformPaySupported(false);
      });
    return () => { cancelled = true; };
  }, []);

  // --- Render ---

  // Order-bound guards resolve before any listing-derived state: the order
  // is the source of truth and its listing may be paused (buyer-invisible).
  if (orderId && !currentUser) {
    // Hydration is gated on userId — a signed-out buyer can never load the
    // bound order, so show the sign-in guard instead of an endless skeleton.
    return (
      <CheckoutGuardScaffold onClose={() => navigation.goBack()} closeAccessibilityLabel="Close">
        <CheckoutGuardState
          icon="lock-closed-outline"
          title="Sign in to checkout"
          body="You need to be signed in to complete your purchase."
          ctaLabel="Sign in"
          onCtaPress={() => navigation.navigate('Login')}
        />
      </CheckoutGuardScaffold>
    );
  }

  if (orderId && (boundOrderNotPayable || boundOrderIssue)) {
    const deadEnd = boundOrderIssue === 'expired'
      ? {
          icon: 'time-outline' as const,
          title: 'This offer reservation has expired',
          body: 'The time to pay for your accepted offer has passed. Ask the seller to send a new offer.',
        }
      : {
          icon: 'alert-circle-outline' as const,
          title: 'This order is no longer awaiting payment',
          body: 'It may already be paid, cancelled, or have a payment in progress.',
        };
    return (
      <CheckoutGuardScaffold onClose={() => navigation.goBack()} closeAccessibilityLabel="Close">
        <CheckoutGuardState
          icon={deadEnd.icon}
          title={deadEnd.title}
          body={deadEnd.body}
          ctaLabel="Go back"
          onCtaPress={() => navigation.goBack()}
        />
      </CheckoutGuardScaffold>
    );
  }

  if (orderId && boundOrderLoadFailed) {
    return (
      <CheckoutGuardScaffold onClose={() => navigation.goBack()} closeAccessibilityLabel="Close">
        <CheckoutGuardState
          icon="cloud-offline-outline"
          title="This order could not be loaded"
          body="Check your connection and try again."
          ctaLabel="Try again"
          onCtaPress={() => void hydrateCheckout()}
        />
      </CheckoutGuardScaffold>
    );
  }

  if (!displayItem) {
    // Order-bound: the order fetch is still in flight — keep the skeleton
    // geometry rather than flashing an "unavailable" state.
    if (orderId) {
      return (
        <SafeAreaView style={[styles.container, t.container]} edges={['top']}>
          <StatusBar barStyle={!isDark ? 'dark-content' : 'light-content'} backgroundColor={colors.background} />
          <CheckoutSkeleton colors={colors} />
        </SafeAreaView>
      );
    }
    return (
      <CheckoutGuardScaffold onClose={() => navigation.goBack()} closeAccessibilityLabel="Close">
        <EmptyState
          icon="warning-outline"
          title="Item unavailable"
          subtitle="This listing can no longer be purchased."
          ctaLabel="Go back"
          onCtaPress={() => navigation.goBack()}
        />
      </CheckoutGuardScaffold>
    );
  }

  if (!currentUser) {
    return (
      <CheckoutGuardScaffold onClose={() => navigation.goBack()} closeAccessibilityLabel="Close">
        <CheckoutGuardState
          icon="lock-closed-outline"
          title="Sign in to checkout"
          body="You need to be signed in to complete your purchase."
          ctaLabel="Sign in"
          onCtaPress={() => navigation.navigate('Login')}
        />
      </CheckoutGuardScaffold>
    );
  }

  if (isSelfPurchase) {
    return (
      <CheckoutGuardScaffold onClose={() => navigation.goBack()} closeAccessibilityLabel="Close">
        <CheckoutGuardState
          icon="person-circle-outline"
          title="Cannot purchase your own listing"
          body="You cannot buy an item you listed for sale."
          ctaLabel="Go back"
          onCtaPress={() => navigation.goBack()}
        />
      </CheckoutGuardScaffold>
    );
  }

  // Seller away — a new order cannot be created (409 SELLER_AWAY), so
  // the whole checkout surface is a factual pause state rather than a
  // Pay button that can only fail. The return date is shown only when
  // the seller published one. Order-bound checkout skips this guard:
  // the order already exists and remains payable.
  if (sellerAway && !orderId) {
    return (
      <CheckoutGuardScaffold onClose={() => navigation.goBack()} closeAccessibilityLabel="Close">
        <CheckoutGuardState
          icon="sunny-outline"
          title="Seller away"
          body={
            sellerBackLabel
              ? `This seller's shop is paused until ${sellerBackLabel}. Check back then.`
              : "This seller's shop is paused while they are away. Check back later."
          }
          ctaLabel="Go back"
          onCtaPress={() => navigation.goBack()}
        />
      </CheckoutGuardScaffold>
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

  const resolvedSeller = displayItem.seller ?? {
    id: displayItem.sellerId || '',
    username: null,
    avatar: null,
    rating: null,
    reviewCount: null,
    location: null,
  };

  // The bound order's stored platform charge is authoritative; the listing
  // path derives it from the item price as before.
  const PLATFORM_CHARGE = boundOrder?.platformChargeGbp ?? calculatePlatformChargeGbp(displayItem.price);
  const POSTAGE_FEE = postageOption.priceFromGbp;
  // Money source of truth: a bound order's subtotal is the server-locked
  // price (e.g. an accepted offer), not the listing's current price —
  // displaying displayItem.price here would misquote the order total.
  const orderSubtotal = boundOrder?.subtotalGbp ?? displayItem.price;
  const GROSS_TOTAL = orderSubtotal + PLATFORM_CHARGE + POSTAGE_FEE;
  // Wallet split-tender has no order-bound endpoint — hide the toggle and
  // never subtract balance from an order-bound total.
  const balanceApplied = useBalance && !orderId ? Math.min(walletBalance, GROSS_TOTAL) : 0;
  const TOTAL = Math.max(0, GROSS_TOTAL - balanceApplied);

  const addressNeedsSave = savedAddress && !savedAddress.id;
  const addressSubtitle = getCheckoutAddressSubtitle(savedAddress);

  // Whether a digital wallet (Apple Pay / Google Pay) is available as a
  // one-tap primary CTA. Per 2026 UX research: "Place Google Pay at the top
  // of the list of payment options, above manual entry fields." When a
  // wallet is available it becomes the primary CTA and the card button
  // becomes secondary ("Pay with card"), creating a clear hierarchy that
  // surfaces biometric one-tap payment before manual card entry.
  //
  // The capability flag says the merchant/gateway allows the tender — the
  // device check says this device can actually present it (a card in
  // Wallet, Google Pay provisioned). A capability-only "Pay with Apple Pay"
  // CTA on an unprovisioned device is a false promise — gate on both.
  // The capability check FAILS CLOSED (explicit `false` fallback): when the
  // capability fetch failed, checkoutCapabilities is null and the branded
  // tender CTA must not render next to the "could not verify payment
  // capabilities" banner — an affordance the surface can't back.
  const walletAvailable = !isSubmitting && platformPaySupported && (
    (Platform.OS === 'ios' && isPaymentMethodAllowed(checkoutCapabilities, 'apple_pay', false))
    || (Platform.OS === 'android' && isPaymentMethodAllowed(checkoutCapabilities, 'google_pay', false))
  );

  const payLabel = getCheckoutPayLabel({
    stage,
    isSubmitting,
    useOnezePayment,
    onezeRequiredIze: onezeRequiredIze ?? onezeRequiredEstimate,
    orderReleased: paymentIssue === 'released',
    walletAvailable,
    formattedTotal: formatFromFiat(TOTAL, 'GBP'),
  });

  const { deliveryStepComplete, paymentStepComplete, reviewStepComplete } =
    computeCheckoutStepCompletion({
      hasSavedAddressId: !!savedAddress?.id,
      hasCarrier: !!postageOption.carrierId,
      useOnezePayment,
      onezeBalance,
      onezeRequiredIze: onezeRequiredIze ?? onezeRequiredEstimate,
      grossTotal: GROSS_TOTAL,
      savedPaymentMethod,
      checkoutCapabilities,
      // Order-bound checkout has no split-tender — the wallet toggle is
      // hidden and must not mark the payment step complete.
      useBalance: useBalance && !orderId,
      walletBalance,
      checkoutEligible,
    });

  const {
    suppressAddressError,
    suppressPaymentError,
    suppressShippingError,
    inlineAddressError,
    inlinePaymentError,
  } = computeCheckoutRowErrors({
    partialDataIcon: partialDataPrompt?.icon,
    hasCarrier: !!postageOption.carrierId,
    hasAttemptedPay,
    hasSavedAddressId: !!savedAddress?.id,
    paymentStepComplete,
    useOnezePayment,
    hasSavedPaymentMethodId: !!savedPaymentMethod?.id,
  });

  // When any sheet is open, everything behind it (header, scroll content,
  // pay footer) is hidden from screen readers — not just the ScrollView —
  // so TalkBack cannot reach Pay while a sheet covers it (audit M2). The
  // sheets stay OUTSIDE this container: BottomSheet renders in-tree, so
  // hiding an ancestor would hide the sheet itself.
  const anySheetVisible = addCardSheetVisible || paymentSelectorVisible || deliverySelectorVisible || breakdownSheetVisible || confirmSheet.visible;

  return (
    <SafeAreaView ref={a11yRef} style={[styles.container, t.container]} edges={['top']}>
      <StatusBar barStyle={!isDark ? 'dark-content' : 'light-content'} backgroundColor={colors.background} />

      <View
        style={styles.a11yContentWrap}
        accessibilityElementsHidden={anySheetVisible}
        importantForAccessibility={anySheetVisible ? 'no-hide-descendants' : 'auto'}
      >
      {/* 1. Compact close header */}
      <CheckoutHeader onClose={handleClose} closeAccessibilityLabel="Close checkout" />

      <CommerceDetailOfflineBanner isOffline={isOffline} />

      {/* 1a. Compact progress indicator — three logical sections shown as a
          thin dot row. Reduces anxiety by making the checkout scope visible
          at a glance (2026 UX research). No large stepper — just dots and
          labels, sober and informational. */}
      <CheckoutProgressDots
        deliveryComplete={deliveryStepComplete}
        paymentComplete={paymentStepComplete}
        reviewComplete={reviewStepComplete}
      />

      {/* Partial-data inline prompt (§14). Quiet, friendly — the checkout is
          still usable. Distinct from full error states. */}
      {partialDataPrompt ? (
        <CheckoutPartialDataBanner
          icon={partialDataPrompt.icon}
          message={partialDataPrompt.message}
          actionLabel={partialDataPrompt.action.label}
          onAction={partialDataPrompt.action.onPress}
        />
      ) : null}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: (footerHeight > 0 ? footerHeight + Space.md : 300) + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefreshCheckout}
            tintColor={colors.textMuted}
            colors={[colors.textMuted]}
          />
        }
      >
        {/* 2–5. Product/seller summary + delivery/payment selection rows */}
        <CheckoutSelectionSection
          title={displayItem.title}
          imageUrl={getListingCoverUri(displayItem.images, '')}
          seller={{
            id: resolvedSeller.id,
            username: resolvedSeller.username,
            avatar: resolvedSeller.avatar,
          }}
          priceLabel={formatFromFiat(displayItem.price, 'GBP')}
          onPressSeller={
            resolvedSeller.id
              ? () => { haptics.tap(); openProfile(navigation, resolvedSeller.id, currentUser?.id); }
              : undefined
          }
          onPressMessage={resolvedSeller.id ? () => { haptics.tap(); handleMessageSeller(); } : undefined}
          addressRow={{
            label: 'Delivery address',
            title: savedAddress ? savedAddress.name : 'No address',
            subtitle: addressSubtitle,
            actionLabel: savedAddress ? 'Change' : 'Add',
            onPress: handleAddressPress,
            icon: 'location-outline',
            isFilled: !!savedAddress,
            warningText: addressNeedsSave ? 'Needs saving before payment' : undefined,
            errorText: suppressAddressError ? undefined : (inlineAddressError ?? addressError ?? undefined),
            accessibilityLabel: savedAddress
              ? `Delivery address: ${savedAddress.name}, ${savedAddress.streetAddress}, ${savedAddress.city}, ${savedAddress.postalCode}, ${savedAddress.country}`
              : 'Add delivery address',
            accessibilityHint: 'Opens address form to add or edit your delivery address',
          }}
          deliveryRow={{
            label: 'Delivery',
            title: postageOption.label,
            subtitle: `${postageOption.etaLabel}${postageOption.liveQuote ? '' : ' (Estimated)'}${postageOption.tracking ? ' · Tracking' : ''}`,
            actionLabel: formatFromFiat(POSTAGE_FEE, 'GBP'),
            onPress: canChangePostage ? handleDeliveryPress : undefined,
            icon: 'car-outline',
            isFilled: !!postageOption.carrierId,
            // Order-bound checkout for an away seller: the order stays
            // payable but dispatch waits for the seller's return — the
            // ETA label still describes transit time, so the away shift
            // is stated here rather than baked into a fabricated date.
            warningText: sellerAway
              ? sellerBackLabel
                ? `Seller away until ${sellerBackLabel} — ships after they return`
                : 'Seller away — ships after they return'
              : undefined,
            errorText: !postageOption.carrierId
              ? 'Shipping not available for your region'
              : suppressShippingError
                ? undefined
                : shippingError ?? undefined,
            accessibilityLabel: `Delivery: ${postageOption.label}, ${postageOption.etaLabel}, ${postageOption.liveQuote ? 'Live quote' : 'Estimated'}, ${formatFromFiat(POSTAGE_FEE, 'GBP')}`,
            accessibilityHint: canChangePostage ? 'Change delivery method and carrier' : undefined,
          }}
          paymentRow={{
            label: 'Payment method',
            title: useOnezePayment
              ? '1ZE Wallet'
              : savedPaymentMethod
                ? savedPaymentMethod.label
                : 'No payment method',
            subtitle: useOnezePayment
              ? `${onezeBalance.toLocaleString(undefined, { maximumFractionDigits: 0 })} 1ZE available`
              : savedPaymentMethod?.details ?? undefined,
            actionLabel: useOnezePayment ? 'Card' : savedPaymentMethod ? 'Change' : 'Add',
            onPress: useOnezePayment
              ? () => { haptics.tap(); setUseOnezePayment(false); setHasAttemptedPay(false); }
              : handlePaymentPress,
            icon: useOnezePayment ? 'wallet-outline' : (savedPaymentMethod?.type === 'apple_pay' ? 'logo-apple' : 'card-outline'),
            isFilled: useOnezePayment || !!savedPaymentMethod,
            warningText:
              !useOnezePayment && !savedPaymentMethod && !allowCardPayments && checkoutCapabilities
                ? 'Cards unavailable in your region'
                : undefined,
            errorText: suppressPaymentError ? undefined : (inlinePaymentError ?? paymentError ?? undefined),
            accessibilityLabel: useOnezePayment
              ? `1ZE Wallet payment, ${onezeBalance.toLocaleString()} 1ZE available. Switch to card payment.`
              : savedPaymentMethod
                ? `Payment method: ${savedPaymentMethod.label}${savedPaymentMethod.details ? `, ${savedPaymentMethod.details}` : ''}. Change payment method.`
                : 'Add payment method',
            accessibilityHint: 'Add or change your payment method',
          }}
          onezeOption={onezeBalance > 0 && !balanceLoading && !useOnezePayment
            ? {
                onezeBalance,
                // 1ZE-denominated requirement — the option renders this as
                // "N 1ZE needed", so it must be a 1ZE amount, not GBP.
                neededAmount: onezeRequiredIze ?? onezeRequiredEstimate,
                onPress: () => { haptics.tap(); setUseOnezePayment(true); setHasAttemptedPay(false); if (useBalance) setUseBalance(false); },
              }
            : undefined}
        />

        {/* Balance load failure — the position fetch failed, so the 1ZE
            option and wallet toggle stay hidden rather than rendering
            fabricated zeros. An inline error + retry takes their place. */}
        {balanceError ? (
          <CheckoutCapabilityError
            message={balanceError}
            onRetry={reloadBalance}
          />
        ) : null}

        {/* 5aa. Item verification add-on — a request flag on the order, no
            charge (the backend exposes no verification price). Rendered
            with the selection-adjacent toggles so it reads as part of the
            checkout configuration, not a marketing upsell. */}
        <CheckoutVerificationSection
          visible
          enabled={verificationRequested}
          onToggle={() => void handleVerificationToggle()}
        />

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
            sticky footer. Hidden when 1ZE payment is selected (1ZE is the
            full payment source, no split-tender needed). Gated off
            entirely until the order contract supports split tender —
            POST /orders rejects walletDebitGbp > 0 with
            WALLET_SPLIT_TENDER_UNSUPPORTED, so an offered toggle would be
            a guaranteed-failure dead path. */}
        {CHECKOUT_SPLIT_TENDER_ENABLED ? (
          <CheckoutBalanceSection
            visible={walletBalance > 0 && !balanceLoading && !useOnezePayment && !orderId}
            useBalance={useBalance}
            balanceLabel={formatFromFiat(walletBalance, 'GBP')}
            savingsAmount={useBalance && balanceApplied > 0 ? formatFromFiat(balanceApplied, 'GBP') : undefined}
            onToggle={() => {
              haptics.tap();
              setUseBalance((v) => !v);
              setHasAttemptedPay(false);
            }}
          />
        ) : null}

        {/* 7. Transaction feedback — canonical PaymentStateBanner (audit P0) */}
        {stage !== 'idle' ? (
          <PaymentStateBanner
            stage={stage}
            label={STAGE_LABELS[stage]}
            colors={colors}
            reducedMotion={reducedMotionEnabled}
            actionLabel={
              stage === 'unknown_outcome'
                ? isCheckingPaymentStatus
                  ? 'Checking…'
                  : 'Check payment status'
                : undefined
            }
            onAction={stage === 'unknown_outcome' ? handleCheckPaymentStatus : undefined}
            actionDisabled={isCheckingPaymentStatus}
          />
        ) : null}

        {orderError ? (
          <CheckoutOrderError
            ref={orderErrorRef}
            message={orderError}
            // Terminal issues never offer a retry that cannot succeed —
            // 'sold'/'seller_unavailable' get no action; 'released' gets a
            // "Buy again" that mints a fresh order; an insufficient 1ZE
            // balance gets the card switch, not a doomed wallet retry.
            showRetry={
              stage === 'payment_failed'
              && paymentIssue !== 'sold'
              && paymentIssue !== 'seller_unavailable'
              && !(paymentIssue === 'insufficient_oneze' && !useOnezePayment)
            }
            onRetry={
              paymentIssue === 'insufficient_oneze'
                ? () => { haptics.tap(); setUseOnezePayment(false); setHasAttemptedPay(false); }
                : handlePay
            }
            retryLabel={
              paymentIssue === 'released'
                ? 'Buy again'
                : paymentIssue === 'insufficient_oneze'
                  ? 'Pay by card'
                  : 'Retry payment'
            }
          />
        ) : null}

        {capabilityError ? (
          <CheckoutCapabilityError
            message={capabilityError}
            onRetry={() => void hydrateCheckout()}
          />
        ) : null}

        <Text style={[styles.termsText, t.termsText]} maxFontSizeMultiplier={MAX_FONT_SCALE.content}>
          By tapping "Pay", you agree to our Terms of Sale and Privacy Policy.
        </Text>
      </ScrollView>

      {/* 8. Sticky compact order summary + trust badges + Pay footer */}
      <CheckoutFooter
        itemLabel={formatFromFiat(displayItem.price, 'GBP')}
        deliveryLabel={formatFromFiat(POSTAGE_FEE, 'GBP')}
        protectionLabel={formatFromFiat(PLATFORM_CHARGE, 'GBP')}
        verificationLabel={verificationRequested ? 'Free' : undefined}
        walletAppliedLabel={useBalance && balanceApplied > 0 ? formatFromFiat(balanceApplied, 'GBP') : undefined}
        totalLabel={formatFromFiat(TOTAL, 'GBP')}
        onPressSummary={() => setBreakdownSheetVisible(true)}
        payLabel={payLabel}
        payDisabled={!checkoutEligible || isInteractionLocked}
        isSubmitting={isSubmitting}
        walletAvailable={walletAvailable}
        // Branded tender CTAs fail closed: unverified capabilities (null
        // after a failed fetch) mean no wallet button — never a promise the
        // surface can't back (P2).
        showApplePay={Platform.OS === 'ios' && platformPaySupported && isPaymentMethodAllowed(checkoutCapabilities, 'apple_pay', false) && !isSubmitting}
        showGooglePay={Platform.OS === 'android' && platformPaySupported && isPaymentMethodAllowed(checkoutCapabilities, 'google_pay', false) && !isSubmitting}
        onPay={handlePay}
        onWalletPay={handlePlatformPay}
        walletPayDisabled={!platformPayEligible || isInteractionLocked}
        reducedMotion={reducedMotionEnabled}
        onHeightChange={setFooterHeight}
      />

      {/* Non-blocking progress overlay — keeps checkout visible (§14) */}
      {(stage === 'creating_order' || stage === 'opening_payment' || stage === 'authenticating') && (
        <CheckoutProgressOverlay
          label={STAGE_LABELS[stage]}
          colors={colors}
        />
      )}
      </View>

      {/* Sheets */}
      <CheckoutSheets
        addCardSheetVisible={addCardSheetVisible}
        onDismissAddCard={() => setAddCardSheetVisible(false)}
        onAddCardSuccess={handleAddCardSuccess}
        paymentSelectorVisible={paymentSelectorVisible}
        onDismissPaymentSelector={() => setPaymentSelectorVisible(false)}
        paymentMethods={backendPaymentMethods}
        selectedPaymentMethodId={savedPaymentMethod?.id}
        onSelectPaymentMethod={handleSelectPaymentMethod}
        isSelectingPayment={isSelectingPayment}
        onShowAddCard={() => {
          setPaymentSelectorVisible(false);
          setAddCardSheetVisible(true);
        }}
        deliverySelectorVisible={deliverySelectorVisible}
        onDismissDeliverySelector={() => setDeliverySelectorVisible(false)}
        shippingQuotes={shippingQuotes}
        selectedQuoteId={postageOption.quoteId}
        onSelectDeliveryOption={(quote) => void handleSelectDeliveryOption(quote)}
        breakdownSheetVisible={breakdownSheetVisible}
        onDismissBreakdown={() => setBreakdownSheetVisible(false)}
        breakdown={{
          itemLabel: formatFromFiat(displayItem.price, 'GBP'),
          protectionLabel: formatFromFiat(PLATFORM_CHARGE, 'GBP'),
          deliveryRowLabel: `Delivery${postageOption.liveQuote ? '' : ' (Estimated)'}`,
          deliveryLabel: formatFromFiat(POSTAGE_FEE, 'GBP'),
          verificationLabel: verificationRequested ? 'Free' : undefined,
          walletAppliedLabel: useBalance && balanceApplied > 0 ? formatFromFiat(balanceApplied, 'GBP') : undefined,
          useBalance,
          totalLabel: formatFromFiat(TOTAL, 'GBP'),
        }}
        confirmSheet={confirmSheet}
        onDismissConfirm={() => setConfirmSheet((prev) => ({ ...prev, visible: false }))}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // Wraps all behind-the-sheet content so one accessibilityElementsHidden
  // flag covers header, scroll view and pay footer. flex:1 keeps the
  // geometry identical to the screen root it fills.
  a11yContentWrap: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
  },
  protectionStripWrap: {
    marginTop: Space.sm,
  },
  termsText: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.regular,
    lineHeight: TypographyV2.meta.lineHeight,
    textAlign: 'center',
    paddingTop: Space.md,
  },
});
