import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { AppState, Platform } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import {
  initPaymentSheet,
  PaymentSheetError,
  presentPaymentSheet,
} from '@stripe/stripe-react-native';
import { queryKeys } from '../../platform/server/queryKeys';
import { useBackendData } from '../../context/BackendDataContext';
import { useConnectivity } from '../useConnectivity';
import { useNotifications } from '../useNotifications';
import { isPaymentMethodAllowed } from '../../utils/capabilityPolicy';
import type { UserCountryCapabilities } from '../../services/capabilitiesApi';
import {
  createCommercePaymentIntent,
  createOnezeCheckoutIntent,
  createStripeOrderSheet,
  createOrder,
  completeOrderCheckout,
  cancelOrder,
  getOrder,
  getPaymentIntentStatus,
  type CommerceOrder,
} from '../../services/commerceApi';
import { parseApiError } from '../../lib/apiClient';
import { waitForPaymentIntentSettlement } from '../../services/checkoutPaymentIntent';
import {
  type CheckoutStage,
  type CheckoutPostageOption,
  buildOrderSignature,
} from '../../utils/checkoutFlow';
import { calculatePlatformChargeGbp } from '../../utils/currencyAuthoringFlows';
import { createStableId } from '../../utils/createStableId';
import {
  configureStripeMobile,
  getStripeReturnUrl,
} from '../../platform/payments/stripeMobile';
import { track, trackFunnelStep } from '../../analytics';
import { haptics } from '../../utils/haptics';
import type { Listing } from '../../domain';

const safeMark = (name: string) => {
  if (typeof performance !== 'undefined' && typeof performance.mark === 'function') {
    performance.mark(name);
  }
};

// The store's SavedPaymentMethod shape is not exported — this structural
// type mirrors the fields the payment flow reads.
type SavedPaymentMethodInput = {
  id?: number;
  type: 'card' | 'bank_account' | 'apple_pay' | 'google_pay';
  label: string;
  details?: string;
  isDefault?: boolean;
};

export interface UseCheckoutPaymentFlowOptions {
  itemId: string;
  item: Listing | undefined;
  /** Order-bound checkout: resume this existing order instead of creating
   *  one. The order is the target — never cancelled as "stale". */
  boundOrderId?: string;
  /** Listing-checkout reservation id for the bound order (analytics). */
  boundReservationId?: string;
  /** The hydrated bound order — required for eligibility when bound. */
  boundOrder?: CommerceOrder | null;
  userId: string | undefined;
  isHydrating: boolean;
  savedAddressId: number | undefined;
  savedPaymentMethod: SavedPaymentMethodInput | null;
  checkoutCapabilities: UserCountryCapabilities | null;
  postageOption: CheckoutPostageOption;
  useBalance: boolean;
  walletBalance: number;
  useOnezePayment: boolean;
  onezeBalance: number;
  setHasAttemptedPay: (value: boolean) => void;
}

/**
 * useCheckoutPaymentFlow — owns the checkout payment state machine: the
 * stage transitions, order idempotency refs, payment-intent settlement
 * polling, stale-order cancellation and the resume/reconciliation effects.
 * The screen keeps the selection state (address, payment method, postage)
 * and passes the derived eligibility in; this hook returns the stage plus
 * the pay/cancel/status actions the UI binds to.
 */
export function useCheckoutPaymentFlow({
  itemId,
  item,
  boundOrderId,
  boundReservationId,
  boundOrder,
  userId,
  isHydrating,
  savedAddressId,
  savedPaymentMethod,
  checkoutCapabilities,
  postageOption,
  useBalance,
  walletBalance,
  useOnezePayment,
  onezeBalance,
  setHasAttemptedPay,
}: UseCheckoutPaymentFlowOptions) {
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const { refreshListings } = useBackendData();
  const { isOffline } = useConnectivity();
  const { showError, showInfo } = useNotifications();

  const [stage, setStage] = useState<CheckoutStage>('idle');
  const [isCancellingOrder, setIsCancellingOrder] = useState(false);
  const [isCheckingPaymentStatus, setIsCheckingPaymentStatus] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  // Order-bound dead end: set when the server reports the bound order's
  // reservation expired or the order left a payable state mid-attempt.
  const [boundOrderIssue, setBoundOrderIssue] = useState<'expired' | 'unavailable' | null>(null);

  const createdOrderIdRef = useRef<string | null>(null);
  const createdOrderSignatureRef = useRef<string | null>(null);
  const orderIdempotencyKeyRef = useRef<string | null>(null);
  // Selections last bound to the order via completeOrderCheckout — lets a
  // retry skip re-binding (a bound payment intent makes re-binding a 409).
  const boundCheckoutSignatureRef = useRef<string | null>(null);
  const pendingIntentIdRef = useRef<string | null>(null);
  const isSubmittingRef = useRef(false);
  const isCheckingStatusRef = useRef(false);
  const appStateRef = useRef(AppState.currentState);
  const isMountedRef = useRef(true);
  const paymentAttemptRef = useRef(0);
  const navigationHandledRef = useRef(false);
  const stageRef = useRef<CheckoutStage>(stage);
  useEffect(() => { stageRef.current = stage; }, [stage]);

  const isSubmitting = stage === 'creating_order' || stage === 'opening_payment' || stage === 'authenticating' || stage === 'awaiting_payment';
  // unknown_outcome locks checkout interactions: the intent may already be
  // committed server-side, so the Pay button must stay disabled until
  // reconciliation resolves (audit F11).
  const isInteractionLocked = isSubmitting || isCancellingOrder || stage === 'unknown_outcome';

  // --- Eligibility ---
  const checkoutEligible = useMemo(() => {
    if (!userId) return false;
    // Order-bound: totals come from the order, not the listing.
    const subtotalGbp = boundOrder ? boundOrder.subtotalGbp : item?.price;
    if (subtotalGbp == null) return false;
    if (isHydrating || isInteractionLocked) return false;
    if (!savedAddressId) return false;
    if (!postageOption.carrierId || !postageOption.quoteId) return false;
    const platformChargeGbp = boundOrder?.platformChargeGbp ?? calculatePlatformChargeGbp(subtotalGbp);
    const grossTotal = subtotalGbp + platformChargeGbp + postageOption.priceFromGbp;
    // 1ZE wallet payment — no card payment method needed, just check balance
    if (useOnezePayment) {
      return onezeBalance >= grossTotal;
    }
    // If balance covers the full total, payment method is not required.
    // (Order-bound checkout has no split-tender endpoint — wallet balance
    // cannot be applied there.)
    const balanceCoversFull = !boundOrderId && useBalance && walletBalance >= grossTotal;
    if (!balanceCoversFull) {
      if (!savedPaymentMethod?.id) return false;
      if (!isPaymentMethodAllowed(checkoutCapabilities, savedPaymentMethod.type)) return false;
    }
    return true;
  }, [userId, item, boundOrder, boundOrderId, isHydrating, isInteractionLocked, savedAddressId, savedPaymentMethod?.id, postageOption.carrierId, postageOption.quoteId, checkoutCapabilities, savedPaymentMethod?.type, useBalance, walletBalance, postageOption.priceFromGbp, useOnezePayment, onezeBalance]);

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

      // The order exists server-side in both settlement outcomes — the
      // listing is now sold/reserved. Propagate to every surface that
      // displays it: the cached listing detail, the seller's listings
      // pages, and the discovery feed store.
      const settledListingId = boundOrder?.listingId ?? itemId;
      void queryClient.invalidateQueries({ queryKey: queryKeys.listing.detail(settledListingId) });
      const sellerId = boundOrder?.sellerId ?? item?.sellerId;
      if (sellerId) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.user.listingsAll(sellerId) });
      }
      void refreshListings();

      if (result === 'succeeded') {
        navigation.replace('Success', { orderId });
      } else {
        navigation.replace('OrderDetail', { orderId });
      }
    },
    [navigation, queryClient, refreshListings, itemId, boundOrder?.listingId, boundOrder?.sellerId, item?.sellerId]
  );

  useFocusEffect(
    useCallback(() => {
      return () => {
        if (!navigationHandledRef.current) {
          track('checkout_abandoned', { item_id: boundOrder?.listingId ?? itemId, stage: stageRef.current });
        }
      };
    }, [itemId, boundOrder?.listingId])
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

    // Order-bound checkout: the provided order IS the checkout target, never
    // a stale order — selection changes are re-bound at pay time via
    // completeOrderCheckout instead of cancelling + recreating.
    if (boundOrderId && orderId === boundOrderId) {
      return true;
    }

    setIsCancellingOrder(true);
    setOrderError(null);

    try {
      await cancelOrder(orderId);

      createdOrderIdRef.current = null;
      createdOrderSignatureRef.current = null;
      orderIdempotencyKeyRef.current = null;
      pendingIntentIdRef.current = null;

      // The cancelled order released its hold on the listing — invalidate
      // the cached detail, the seller's listings, and the feed so no
      // surface keeps showing a stale reserved/sold state.
      void queryClient.invalidateQueries({ queryKey: queryKeys.listing.detail(itemId) });
      if (item?.sellerId) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.user.listingsAll(item.sellerId) });
      }
      void refreshListings();

      return true;
    } catch {
      setOrderError(
        'Your existing order could not be cancelled. Checkout details have not been changed.'
      );
      return false;
    } finally {
      setIsCancellingOrder(false);
    }
  }, [stage, queryClient, itemId, boundOrderId, item?.sellerId, refreshListings]);

  // --- Handle Pay ---
  const handlePay = useCallback(async () => {
    if (isSubmittingRef.current) return;
    if (!checkoutEligible) {
      setHasAttemptedPay(true);
      showError('Cannot pay yet', 'Complete address and payment details before paying.');
      return;
    }

    if (!userId) return;
    // Order-bound checkout needs the hydrated order; listing checkout needs
    // the listing. Never proceed on a missing source of truth.
    if (boundOrderId ? !boundOrder : !item) return;

    const listingId = boundOrder?.listingId ?? item?.id ?? itemId;
    // The order's stored totals are authoritative when bound — the listing
    // still shows the pre-offer list price.
    const itemPriceGbp = boundOrder?.subtotalGbp ?? item?.price ?? 0;
    const PLATFORM_CHARGE = boundOrder?.platformChargeGbp ?? calculatePlatformChargeGbp(itemPriceGbp);
    const POSTAGE_FEE = postageOption.priceFromGbp;

    // Performance mark: checkout flow start (user confirmed payment).
    safeMark('checkout:start');
    track('checkout_started', {
      item_id: listingId,
      total: itemPriceGbp + PLATFORM_CHARGE + POSTAGE_FEE,
      ...(boundReservationId ? { reservation_id: boundReservationId } : {}),
    });
    trackFunnelStep('checkout', 'checkout_started', { listing_id: listingId });

    const signature = buildOrderSignature({
      buyerId: userId,
      listingId,
      addressId: savedAddressId,
      paymentMethodId: useOnezePayment ? undefined : savedPaymentMethod?.id,
      carrierId: postageOption.carrierId ?? undefined,
      platformCharge: PLATFORM_CHARGE,
      postageFee: POSTAGE_FEE,
      walletDebit: useBalance && !boundOrderId ? Math.min(walletBalance, itemPriceGbp + PLATFORM_CHARGE + POSTAGE_FEE) : undefined,
      paymentGatewayId: useOnezePayment ? 'oneze_internal' : undefined,
    });

    const attemptId = ++paymentAttemptRef.current;
    navigationHandledRef.current = false;

    isSubmittingRef.current = true;
    setOrderError(null);

    try {
      let orderId: string;

      // Order-bound branch — the order already exists at the accepted-offer
      // price. Skip createOrder and the stale-order cancel entirely: bind the
      // buyer's current selections to the order (PATCH /orders/:id/checkout),
      // which is also the server's authoritative expiry/payability check.
      if (boundOrderId && boundOrder) {
        setStage('creating_order');
        const boundSignature = [
          boundOrderId,
          savedAddressId ?? 'none',
          useOnezePayment ? 'oneze_internal' : savedPaymentMethod?.id ?? 'none',
          postageOption.carrierId ?? 'none',
          postageOption.quoteId ?? 'none',
        ].join('|');
        // Skip re-binding when the order already carries these selections —
        // required for the retry-after-cancelled-sheet path, where a bound
        // payment intent makes the PATCH a 409.
        const alreadyBound =
          boundCheckoutSignatureRef.current === boundSignature
          || (
            boundOrder.addressId != null
            && boundOrder.addressId === savedAddressId
            && boundOrder.shippingCarrierId === (postageOption.carrierId ?? null)
            && boundOrder.postageFeeGbp === POSTAGE_FEE
            && (boundOrder.paymentMethodId ?? null)
              === (useOnezePayment ? null : savedPaymentMethod?.id ?? null)
          );
        if (!alreadyBound) {
          await completeOrderCheckout(boundOrderId, {
            addressId: savedAddressId!,
            paymentMethodId: useOnezePayment ? undefined : savedPaymentMethod?.id,
            shippingQuoteId: postageOption.quoteId!,
            shippingCarrierId: postageOption.carrierId!,
          });

          if (
            !isMountedRef.current
            || paymentAttemptRef.current !== attemptId
          ) {
            return;
          }

          boundCheckoutSignatureRef.current = boundSignature;
        }

        orderId = boundOrderId;
        createdOrderIdRef.current = orderId;
      // Reuse existing order if signature matches
      } else if (
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
          listingId,
          idempotencyKey: orderIdempotencyKeyRef.current,
          shippingQuoteId: postageOption.quoteId!,
          addressId: savedAddressId,
          paymentMethodId: useOnezePayment ? undefined : savedPaymentMethod?.id,
          paymentGatewayId: useOnezePayment ? 'oneze_internal' : undefined,
          platformChargeGbp: PLATFORM_CHARGE,
          buyerProtectionFeeGbp: PLATFORM_CHARGE,
          postageFeeGbp: POSTAGE_FEE,
          shippingCarrierId: postageOption.carrierId ?? undefined,
          // Pass wallet balance debit so the backend can apply split-tender
          walletDebitGbp: useBalance && !boundOrderId ? Math.min(walletBalance, itemPriceGbp + PLATFORM_CHARGE + POSTAGE_FEE) : undefined,
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

      // ── 1ZE wallet payment path ──
      // When the buyer selects 1ZE, we create a oneze_internal payment
      // intent. The backend debits the 1ZE wallet atomically and settles
      // inline — no Stripe PaymentSheet is needed. The intent returns
      // already 'succeeded', so we go straight to settlement polling.
      if (useOnezePayment) {
        const intent = await createOnezeCheckoutIntent(orderId);

        if (
          !isMountedRef.current
          || paymentAttemptRef.current !== attemptId
        ) {
          return;
        }

        pendingIntentIdRef.current = intent.intentId;
        trackFunnelStep('checkout', 'payment_submitted', { order_id: orderId, method: 'oneze' });

        // Poll for settlement (the intent should already be 'succeeded')
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
          setStage('payment_succeeded');
          pendingIntentIdRef.current = null;
          isSubmittingRef.current = false;
          safeMark('checkout:complete');
          track('purchase_completed', { item_id: listingId, total: itemPriceGbp + PLATFORM_CHARGE + POSTAGE_FEE, payment_method: 'oneze' });
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
        setOrderError('1ZE payment could not be completed. Try again.');
        showError('Payment failed', '1ZE payment could not be completed. Try again.');
        isSubmittingRef.current = false;
        return;
      }

      // ── Stripe card payment path ──
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
        safeMark('checkout:complete');
        track('purchase_completed', { item_id: listingId, total: itemPriceGbp + PLATFORM_CHARGE + POSTAGE_FEE, payment_method: savedPaymentMethod?.type ?? 'wallet' });
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

      // Order-bound dead ends — surface honestly instead of a generic
      // payment failure. The server cancels the order when the checkout
      // reservation lapses (410 / CHECKOUT_RESERVATION_EXPIRED). A bare 409
      // is ambiguous: the order may have left a payable state (paid
      // elsewhere, cancelled) OR the payment intent may already be bound —
      // re-binding after a selection change is rejected even though the
      // order is still payable. Refetch before declaring a dead end.
      if (boundOrderId) {
        const parsed = parseApiError(error);
        if (parsed.code === 'CHECKOUT_RESERVATION_EXPIRED' || parsed.status === 410) {
          setStage('payment_failed');
          pendingIntentIdRef.current = null;
          setBoundOrderIssue('expired');
          return;
        }
        if (
          parsed.status === 409
          && parsed.code !== 'SHIPPING_QUOTE_INVALID'
          && parsed.code !== 'FALLBACK_QUOTE_NOT_CHARGEABLE'
          && parsed.code !== 'CHECKOUT_DETAILS_REQUIRED'
        ) {
          let stillPayable = false;
          try {
            const fresh = await getOrder(boundOrderId);
            stillPayable = fresh?.status === 'created';
          } catch {
            // Refetch failed — fall through to the retryable error below.
          }
          if (!isMountedRef.current || paymentAttemptRef.current !== attemptId) return;
          setStage('payment_failed');
          pendingIntentIdRef.current = null;
          if (stillPayable) {
            // The order is still awaiting payment — only the re-bind was
            // rejected. Show a retryable error, not a terminal dead end.
            setOrderError('We could not update your checkout details. Try again.');
          } else {
            setBoundOrderIssue('unavailable');
          }
          return;
        }
      }

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
          track('purchase_completed', { item_id: listingId, total: itemPriceGbp + PLATFORM_CHARGE + POSTAGE_FEE, payment_method: savedPaymentMethod?.type ?? 'wallet' });
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
    userId,
    item,
    boundOrderId,
    boundOrder,
    boundReservationId,
    postageOption.carrierId,
    postageOption.priceFromGbp,
    postageOption.quoteId,
    savedAddressId,
    savedPaymentMethod?.id,
    showError,
    showInfo,
    handleSettlementNavigation,
    cancelStaleOrder,
    useBalance,
    walletBalance,
    useOnezePayment,
    setHasAttemptedPay,
  ]);

  // --- Manual payment-status check (unknown_outcome recovery, audit F11) ---
  // A single authoritative status fetch — NOT a retry. Blindly re-submitting
  // here could double-charge: the original intent may already be committed
  // server-side. The reconciliation poll from the original attempt keeps
  // running in the background; this gives the user an explicit, safe way to
  // ask "what happened?" while they wait.
  const handleCheckPaymentStatus = useCallback(async () => {
    const intentId = pendingIntentIdRef.current;
    if (!intentId || isCheckingStatusRef.current) return;

    haptics.tap();
    isCheckingStatusRef.current = true;
    setIsCheckingPaymentStatus(true);
    const attemptId = paymentAttemptRef.current;

    try {
      const latest = await getPaymentIntentStatus(intentId);
      if (!isMountedRef.current || paymentAttemptRef.current !== attemptId) {
        return;
      }
      const status = latest.status.trim().toLowerCase();
      if (status === 'succeeded') {
        setStage('payment_succeeded');
        pendingIntentIdRef.current = null;
        const statusItemId = boundOrder?.listingId ?? item?.id;
        if (statusItemId) {
          const statusSubtotal = boundOrder?.subtotalGbp ?? item?.price ?? 0;
          track('purchase_completed', {
            item_id: statusItemId,
            total: statusSubtotal
              + (boundOrder?.platformChargeGbp ?? calculatePlatformChargeGbp(statusSubtotal))
              + postageOption.priceFromGbp,
            payment_method: savedPaymentMethod?.type ?? 'wallet',
          });
        }
        handleSettlementNavigation('succeeded', createdOrderIdRef.current ?? '', attemptId);
      } else if (status === 'failed' || status === 'cancelled') {
        setStage('payment_failed');
        pendingIntentIdRef.current = null;
        setOrderError('Payment could not be completed. Try again.');
        showError('Payment failed', 'Payment could not be completed. Try again.');
      } else {
        // Still in flight at the gateway — keep the unknown_outcome banner.
        showInfo('Still checking', 'Your bank has not confirmed the payment yet. Please do not retry.');
      }
    } catch {
      if (isMountedRef.current && paymentAttemptRef.current === attemptId) {
        showInfo('Still checking', 'We could not confirm the payment yet. We will keep checking.');
      }
    } finally {
      isCheckingStatusRef.current = false;
      if (isMountedRef.current) {
        setIsCheckingPaymentStatus(false);
      }
    }
  }, [
    handleSettlementNavigation,
    item,
    boundOrder,
    postageOption.priceFromGbp,
    savedPaymentMethod?.type,
    showError,
    showInfo,
  ]);

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

  // Invalidates the in-flight payment attempt and clears the pending intent —
  // used by the close-confirmation flow when the user leaves mid-payment.
  const discardPendingPayment = useCallback(() => {
    paymentAttemptRef.current += 1;
    pendingIntentIdRef.current = null;
  }, []);

  return {
    stage,
    isSubmitting,
    isInteractionLocked,
    checkoutEligible,
    isCancellingOrder,
    isCheckingPaymentStatus,
    orderError,
    setOrderError,
    boundOrderIssue,
    handlePay,
    cancelStaleOrder,
    handleCheckPaymentStatus,
    createdOrderIdRef,
    discardPendingPayment,
  };
}
