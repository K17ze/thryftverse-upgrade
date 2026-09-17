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
import { parseApiError, ApiRequestError, isRecord } from '../../lib/apiClient';
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

// Backend ONEZE_UNITS_PER_IZE — server wallet amounts arrive in integer
// units; 1000 units = 1 1ZE.
const ONEZE_UNITS_PER_IZE = 1000;

/**
 * Payment-level issue that outlives a single attempt. Distinct from
 * `orderError` (the copy) — this drives which affordance is truthful:
 *  - 'insufficient_oneze' → wallet shortfall; card/top-up is the fix, not retry
 *  - 'released'           → terminal failure cancelled the order; "Buy again"
 *                           creates a fresh order with a fresh idempotency key
 *  - 'sold'               → listing left a purchasable state; terminal
 *  - 'seller_unavailable' → SELLER_RESTRICTED; terminal
 *  - 'reserved'           → LISTING_CHECKOUT_RESERVED; transient, retry ok
 */
export type CheckoutPaymentIssue =
  | 'insufficient_oneze'
  | 'released'
  | 'sold'
  | 'seller_unavailable'
  | 'reserved';

export interface OnezeShortfall {
  /** 1ZE the order requires (converted from server units when provided). */
  requiredIze: number | null;
  /** 1ZE the buyer holds. */
  availableIze: number | null;
}

/**
 * Extracts required/available 1ZE from a WALLET_INSUFFICIENT_BALANCE
 * payload. Tolerant by design: the settled contract carries
 * `requiredOnezeUnits` (integer units) and `onezeBalance` (1ZE amount);
 * the underlying ledger error carries `attemptedDelta`/`currentBalance`
 * (integer units).
 */
function parseOnezeShortfall(error: unknown): OnezeShortfall {
  if (!(error instanceof ApiRequestError) || !isRecord(error.details)) {
    return { requiredIze: null, availableIze: null };
  }
  const d = error.details;
  const unitsToIze = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? v / ONEZE_UNITS_PER_IZE : null;
  const num = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? v : null;

  const requiredIze =
    unitsToIze(d.requiredOnezeUnits)
    ?? unitsToIze(d.requiredUnits)
    ?? num(d.requiredOneze)
    ?? (typeof d.attemptedDelta === 'number' ? unitsToIze(Math.abs(d.attemptedDelta)) : null);
  const availableIze =
    unitsToIze(d.availableOnezeUnits)
    ?? unitsToIze(d.currentBalance)
    ?? num(d.onezeBalance)
    ?? num(d.availableOneze);
  return { requiredIze, availableIze };
}

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
  /** Item verification add-on flag — persisted on the order at create/bind
   *  time and part of the order signature so toggling re-creates a stale
   *  order rather than mutating it. */
  verificationRequested: boolean;
  useBalance: boolean;
  walletBalance: number;
  useOnezePayment: boolean;
  /** Buyer's 1ZE wallet balance in 1ZE (not GBP, not wallet units). */
  onezeBalance: number;
  /** Client-side GBP→1ZE conversion of the gross total — the eligibility
   *  pre-check. The server-side `requiredOnezeUnits` overrides this once
   *  known; the wallet debit is always computed server-side. */
  onezeRequiredEstimateIze?: number;
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
  verificationRequested,
  useBalance,
  walletBalance,
  useOnezePayment,
  onezeBalance,
  onezeRequiredEstimateIze,
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
  // Payment-level issue — drives whether "Retry" is truthful or the CTA
  // must be "Buy again" / "switch to card" / nothing at all.
  const [paymentIssue, setPaymentIssue] = useState<CheckoutPaymentIssue | null>(null);
  const [onezeShortfall, setOnezeShortfall] = useState<OnezeShortfall | null>(null);
  // Server-authoritative 1ZE requirement — populated from the intent
  // response / WALLET_INSUFFICIENT_BALANCE payload. When set it gates the
  // 1ZE rail so a second insufficient attempt can't be submitted.
  const [onezeRequiredIze, setOnezeRequiredIze] = useState<number | null>(null);

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
    // Offline: the Pay CTA must not submit into a guaranteed network failure
    // — the banner communicates state; eligibility blocks the attempt.
    if (isOffline) return false;
    // Order-bound: totals come from the order, not the listing.
    const subtotalGbp = boundOrder ? boundOrder.subtotalGbp : item?.price;
    if (subtotalGbp == null) return false;
    if (isHydrating || isInteractionLocked) return false;
    if (!savedAddressId) return false;
    if (!postageOption.carrierId || !postageOption.quoteId) return false;
    const platformChargeGbp = boundOrder?.platformChargeGbp ?? calculatePlatformChargeGbp(subtotalGbp);
    const grossTotal = subtotalGbp + platformChargeGbp + postageOption.priceFromGbp;
    // Terminal payment issues disable Pay — the retry affordance lives on
    // the error card (Buy again / switch to card), not the footer.
    if (paymentIssue === 'sold' || paymentIssue === 'seller_unavailable') return false;
    // 1ZE wallet payment — no card payment method needed. The gate compares
    // like units: 1ZE balance against the server-provided requirement when
    // known, else the client-side GBP→1ZE estimate. Comparing the 1ZE
    // balance against a GBP total would silently under/over-gate.
    if (useOnezePayment) {
      const required = onezeRequiredIze ?? onezeRequiredEstimateIze;
      return required != null ? onezeBalance >= required : onezeBalance > 0;
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
  }, [userId, isOffline, item, boundOrder, boundOrderId, isHydrating, isInteractionLocked, savedAddressId, savedPaymentMethod?.id, postageOption.carrierId, postageOption.quoteId, checkoutCapabilities, savedPaymentMethod?.type, useBalance, walletBalance, postageOption.priceFromGbp, useOnezePayment, onezeBalance, onezeRequiredIze, onezeRequiredEstimateIze, paymentIssue]);

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
      // The cancel may have raced a server-side cancellation (a terminal
      // payment failure already released the order). Refetch once — a dead
      // order is already "cancelled" for our purposes, so clear the refs
      // and let the flow continue with a fresh order.
      try {
        const fresh = await getOrder(orderId);
        if (fresh?.status !== 'created') {
          createdOrderIdRef.current = null;
          createdOrderSignatureRef.current = null;
          orderIdempotencyKeyRef.current = null;
          pendingIntentIdRef.current = null;
          return true;
        }
      } catch {
        // Refetch failed — report the retryable error below.
      }
      setOrderError(
        'Your existing order could not be cancelled. Checkout details have not been changed.'
      );
      return false;
    } finally {
      setIsCancellingOrder(false);
    }
  }, [stage, queryClient, itemId, boundOrderId, item?.sellerId, refreshListings]);

  // Clears every ref bound to a dead order — a released/cancelled order can
  // never be paid again, so the next attempt must mint a fresh order and a
  // fresh idempotency key rather than reuse the corpse.
  const resetDeadOrderRefs = useCallback(() => {
    createdOrderIdRef.current = null;
    createdOrderSignatureRef.current = null;
    orderIdempotencyKeyRef.current = null;
    boundCheckoutSignatureRef.current = null;
    pendingIntentIdRef.current = null;
  }, []);

  /**
   * Terminal payment failure handling. A 'failed'/'cancelled' commerce
   * intent compensates the still-'created' order to 'cancelled' server-side
   * (commerceCheckoutLifecycle) — retrying that order is a guaranteed
   * ORDER_NOT_PAYABLE dead end. The order is refetched once to confirm:
   * dead → released state + "Buy again"; still created → retryable error.
   * Bound orders can't be recreated — their dead end is the guard state.
   */
  const handleTerminalIntentFailure = useCallback(
    async (orderId: string, attemptId: number, failureCode: string | null) => {
      let orderReleased = false;
      try {
        const fresh = await getOrder(orderId);
        orderReleased = fresh?.status !== 'created';
      } catch {
        // Refetch failed — fall through to the retryable copy below.
      }
      if (!isMountedRef.current || paymentAttemptRef.current !== attemptId) return;

      setStage('payment_failed');
      pendingIntentIdRef.current = null;

      if (failureCode === 'WALLET_INSUFFICIENT_BALANCE') {
        if (orderReleased && !boundOrderId) resetDeadOrderRefs();
        setPaymentIssue('insufficient_oneze');
        setOrderError('Not enough 1ZE for this order. Pay by card or top up your 1ZE wallet.');
        return;
      }

      if (orderReleased) {
        if (boundOrderId) {
          setBoundOrderIssue('unavailable');
        } else {
          resetDeadOrderRefs();
          setPaymentIssue('released');
          setOrderError('Payment didn’t go through — the order was released. Tap “Buy again” to try once more.');
        }
        return;
      }

      setPaymentIssue(null);
      setOrderError('Payment could not be completed. Try again.');
      showError('Payment failed', 'Payment could not be completed. Try again.');
    },
    [boundOrderId, resetDeadOrderRefs, showError]
  );

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
      quoteId: postageOption.quoteId,
      platformCharge: PLATFORM_CHARGE,
      postageFee: POSTAGE_FEE,
      walletDebit: useBalance && !boundOrderId ? Math.min(walletBalance, itemPriceGbp + PLATFORM_CHARGE + POSTAGE_FEE) : undefined,
      paymentGatewayId: useOnezePayment ? 'oneze_internal' : undefined,
      verificationRequested,
    });

    const attemptId = ++paymentAttemptRef.current;
    navigationHandledRef.current = false;

    // A 'released' issue means the previous terminal failure cancelled the
    // order — this press is a "Buy again": drop every dead-order ref so a
    // fresh order is created under a fresh idempotency key.
    if (paymentIssue === 'released') {
      resetDeadOrderRefs();
    }

    isSubmittingRef.current = true;
    setOrderError(null);
    setPaymentIssue(null);

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
          verificationRequested ? 'verified' : 'none',
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
            && (boundOrder.verificationRequested ?? false) === verificationRequested
          );
        if (!alreadyBound) {
          await completeOrderCheckout(boundOrderId, {
            addressId: savedAddressId!,
            paymentMethodId: useOnezePayment ? undefined : savedPaymentMethod?.id,
            shippingQuoteId: postageOption.quoteId!,
            shippingCarrierId: postageOption.carrierId!,
            verificationRequested,
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
          // Never send walletDebitGbp — POST /orders rejects any positive
          // value with WALLET_SPLIT_TENDER_UNSUPPORTED. The toggle is gated
          // off, but the dead path must not survive a future flag flip.
          // Item verification add-on flag (orders.verification_requested)
          verificationRequested,
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
      // POST /payments/intents with gatewayId 'oneze_internal' settles
      // synchronously: the response status is authoritative. A shortfall
      // rejects with WALLET_INSUFFICIENT_BALANCE (handled in the catch).
      // No Stripe PaymentSheet exists for this rail.
      if (useOnezePayment) {
        const onezeResult = await createOnezeCheckoutIntent(orderId);
        const intent = onezeResult.intent;

        if (
          !isMountedRef.current
          || paymentAttemptRef.current !== attemptId
        ) {
          return;
        }

        pendingIntentIdRef.current = intent.id;
        // Server-provided requirement — the eligibility gate uses this
        // exact figure for subsequent attempts rather than the estimate.
        if (typeof onezeResult.requiredOnezeUnits === 'number' && Number.isFinite(onezeResult.requiredOnezeUnits)) {
          setOnezeRequiredIze(onezeResult.requiredOnezeUnits / ONEZE_UNITS_PER_IZE);
        }
        trackFunnelStep('checkout', 'payment_submitted', { order_id: orderId, method: 'oneze' });

        const intentStatus = intent.status?.trim().toLowerCase() ?? '';

        if (intentStatus === 'succeeded') {
          setStage('payment_succeeded');
          pendingIntentIdRef.current = null;
          isSubmittingRef.current = false;
          safeMark('checkout:complete');
          track('purchase_completed', { item_id: listingId, total: itemPriceGbp + PLATFORM_CHARGE + POSTAGE_FEE, payment_method: 'oneze' });
          trackFunnelStep('checkout', 'purchase_completed', { order_id: orderId });
          handleSettlementNavigation('succeeded', orderId, attemptId);
          return;
        }

        if (intentStatus === 'failed' || intentStatus === 'cancelled') {
          await handleTerminalIntentFailure(orderId, attemptId, intent.failureCode ?? null);
          return;
        }

        // Defensive fallback — an intent that returns non-terminal (older
        // builds leave oneze_internal in requires_confirmation) is polled
        // for the authoritative outcome instead of being parked.
        setStage('awaiting_payment');
        const settlementStatus = await waitForPaymentIntentSettlement(
          intent.id,
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

        // Failed — surface the intent's failure code (insufficient balance
        // is a distinct truthful state, not a generic retry).
        let failureCode: string | null = null;
        try {
          failureCode = (await getPaymentIntentStatus(intent.id)).failureCode ?? null;
        } catch { /* keep null — generic terminal handling below */ }
        await handleTerminalIntentFailure(orderId, attemptId, failureCode);
        isSubmittingRef.current = false;
        return;
      }

      // ── Stripe card payment path ──
      const { intent, idempotent: intentReused } = await createCommercePaymentIntent({
        orderId,
        idempotencyKey: `payment_${orderId}`,
      });

      if (
        !isMountedRef.current
        || paymentAttemptRef.current !== attemptId
      ) {
        return;
      }

      pendingIntentIdRef.current = intent.id;

      // Bound-intent replay: the order already carries a payment intent
      // (one intent per order) — the server returned it instead of minting
      // a second one. Its status/gateway are authoritative: it may be
      // settled, in-flight, terminal, or on a non-Stripe rail (e.g. a
      // failed 1ZE attempt). Never assume a usable clientSecret exists.
      if (intentReused) {
        const boundStatus = intent.status?.trim().toLowerCase() ?? '';

        if (boundStatus === 'succeeded') {
          setStage('payment_succeeded');
          pendingIntentIdRef.current = null;
          isSubmittingRef.current = false;
          safeMark('checkout:complete');
          track('purchase_completed', { item_id: listingId, total: itemPriceGbp + PLATFORM_CHARGE + POSTAGE_FEE, payment_method: savedPaymentMethod?.type ?? 'wallet' });
          trackFunnelStep('checkout', 'purchase_completed', { order_id: orderId });
          handleSettlementNavigation('succeeded', orderId, attemptId);
          return;
        }

        if (boundStatus === 'failed' || boundStatus === 'cancelled') {
          await handleTerminalIntentFailure(orderId, attemptId, intent.failureCode ?? null);
          return;
        }

        if (intent.gatewayId !== 'stripe_americas') {
          // Non-Stripe bound intent (e.g. a 1ZE intent still settling):
          // there is no PaymentSheet to open — poll for the outcome.
          setStage('awaiting_payment');
          const boundSettlement = await waitForPaymentIntentSettlement(
            intent.id,
            () => isMountedRef.current && paymentAttemptRef.current === attemptId
          );

          if (boundSettlement === 'aborted') {
            return;
          }
          if (
            !isMountedRef.current
            || paymentAttemptRef.current !== attemptId
          ) {
            return;
          }
          if (boundSettlement === 'succeeded') {
            setStage('payment_succeeded');
            pendingIntentIdRef.current = null;
            isSubmittingRef.current = false;
            safeMark('checkout:complete');
            track('purchase_completed', { item_id: listingId, total: itemPriceGbp + PLATFORM_CHARGE + POSTAGE_FEE, payment_method: savedPaymentMethod?.type ?? 'wallet' });
            trackFunnelStep('checkout', 'purchase_completed', { order_id: orderId });
            handleSettlementNavigation('succeeded', orderId, attemptId);
            return;
          }
          if (boundSettlement === 'pending') {
            setStage('payment_pending');
            isSubmittingRef.current = false;
            handleSettlementNavigation('pending', orderId, attemptId);
            return;
          }
          await handleTerminalIntentFailure(orderId, attemptId, null);
          return;
        }
        // In-flight Stripe bound intent — the sheet endpoint resolves the
        // bound intent itself, so falling through re-opens its sheet.
      }

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
        intent.id,
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

      // Failed — terminal intents cancel the 'created' order server-side;
      // retrying it is a guaranteed dead end, so detect and release first.
      await handleTerminalIntentFailure(orderId, attemptId, null);
    } catch (error: unknown) {
      if (
        !isMountedRef.current
        || paymentAttemptRef.current !== attemptId
      ) {
        return;
      }

      const parsed = parseApiError(error);
      // Canonical classification — parseApiError.isNetworkError covers raw
      // fetch failures and timeouts the ad-hoc errorCode check missed.
      const isNetworkError = isOffline || parsed.isNetworkError;

      // ── Error-code switch — each server code maps to its truthful state
      // instead of collapsing into a generic retryable failure. ──
      switch (parsed.code) {
        // Seller-away pause — POST /orders rejects checkout while the
        // seller's holiday mode is active (409 SELLER_AWAY). Not a payment
        // failure: surface the pause verbatim with no retry affordance
        // (retry cannot succeed until the seller returns).
        case 'SELLER_AWAY': {
          setStage('idle');
          pendingIntentIdRef.current = null;
          const message = error instanceof Error && error.message
            ? error.message
            : 'This seller is away — checkout is paused until they return.';
          setOrderError(message);
          return;
        }
        // Seller restricted mid-checkout — terminal, no retry can succeed.
        case 'SELLER_RESTRICTED': {
          setStage('payment_failed');
          pendingIntentIdRef.current = null;
          setPaymentIssue('seller_unavailable');
          setOrderError('This seller is currently restricted — this order cannot be paid.');
          return;
        }
        // Another checkout holds the listing reservation — transient.
        case 'LISTING_CHECKOUT_RESERVED': {
          setStage('payment_failed');
          pendingIntentIdRef.current = null;
          setPaymentIssue('reserved');
          setOrderError('This item is being checked out by another buyer. Try again in a moment.');
          return;
        }
        // 1ZE wallet shortfall — required vs available come from the
        // server payload; retry on this rail is pointless until the
        // balance changes, so the state is distinct from a generic failure.
        case 'WALLET_INSUFFICIENT_BALANCE': {
          setStage('payment_failed');
          pendingIntentIdRef.current = null;
          const shortfall = parseOnezeShortfall(error);
          if (shortfall.requiredIze != null) {
            setOnezeRequiredIze(shortfall.requiredIze);
          }
          setOnezeShortfall(shortfall);
          setPaymentIssue('insufficient_oneze');
          const requiredLabel = shortfall.requiredIze != null
            ? `${Math.ceil(shortfall.requiredIze).toLocaleString()} 1ZE`
            : null;
          const availableLabel = shortfall.availableIze != null
            ? `${Math.floor(shortfall.availableIze).toLocaleString()} 1ZE`
            : null;
          setOrderError(
            requiredLabel && availableLabel
              ? `Not enough 1ZE — this order needs ${requiredLabel} and you have ${availableLabel}. Pay by card or top up your 1ZE wallet.`
              : 'Not enough 1ZE for this order. Pay by card or top up your 1ZE wallet.'
          );
          return;
        }
        // Checkout reservation lapsed — the server already cancelled the
        // order. Bound orders surface the guard state; listing checkout
        // releases so "Buy again" mints a fresh order and reservation.
        case 'CHECKOUT_RESERVATION_EXPIRED': {
          setStage('payment_failed');
          pendingIntentIdRef.current = null;
          if (boundOrderId) {
            setBoundOrderIssue('expired');
          } else {
            resetDeadOrderRefs();
            setPaymentIssue('released');
            setOrderError('Your checkout reservation expired. Tap “Buy again” to reserve the item once more.');
          }
          return;
        }
        default:
          break;
      }

      // Listing gone — 404 on create, or the 409 "cannot be purchased"
      // branch (which carries no code). Terminal: the Pay button is gated
      // off by the 'sold' issue and the copy must not offer a retry.
      if (
        (!boundOrderId && parsed.status === 404)
        || (parsed.status === 409 && /cannot be purchased/i.test(parsed.message))
      ) {
        setStage('payment_failed');
        pendingIntentIdRef.current = null;
        setPaymentIssue('sold');
        setOrderError('This item is no longer available to buy.');
        return;
      }

      // A bare 409 on the payment step is ambiguous: the order may have
      // left a payable state (paid elsewhere, cancelled) OR the payment
      // intent may already be bound — re-binding after a selection change
      // is rejected even though the order is still payable. Refetch before
      // declaring a dead end.
      if (
        parsed.status === 409
        && parsed.code !== 'SHIPPING_QUOTE_INVALID'
        && parsed.code !== 'FALLBACK_QUOTE_NOT_CHARGEABLE'
        && parsed.code !== 'CHECKOUT_DETAILS_REQUIRED'
        && parsed.code !== 'SHIPPING_QUOTE_REQUIRED'
      ) {
        const targetOrderId = boundOrderId ?? createdOrderIdRef.current;
        let stillPayable = false;
        if (targetOrderId) {
          try {
            const fresh = await getOrder(targetOrderId);
            stillPayable = fresh?.status === 'created';
          } catch {
            // Refetch failed — fall through to the retryable error below.
          }
        }
        if (!isMountedRef.current || paymentAttemptRef.current !== attemptId) return;
        setStage('payment_failed');
        pendingIntentIdRef.current = null;
        if (stillPayable) {
          // The order is still awaiting payment — only the bind was
          // rejected. Show a retryable error, not a terminal dead end.
          setOrderError('We could not update your checkout details. Try again.');
        } else if (boundOrderId) {
          setBoundOrderIssue('unavailable');
        } else {
          // The order left 'created' — released. The next press mints a
          // fresh order under a fresh idempotency key.
          resetDeadOrderRefs();
          setPaymentIssue('released');
          setOrderError('This order is no longer payable — the item was released. Tap “Buy again” to try once more.');
        }
        return;
      }

      // A 410 without a code still means the reservation lapsed.
      if (parsed.status === 410) {
        setStage('payment_failed');
        pendingIntentIdRef.current = null;
        if (boundOrderId) {
          setBoundOrderIssue('expired');
        } else {
          resetDeadOrderRefs();
          setPaymentIssue('released');
          setOrderError('Your checkout reservation expired. Tap “Buy again” to reserve the item once more.');
        }
        return;
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
        // Confirmed failed — the order may already be cancelled; release it
        // rather than offering a retry that cannot succeed.
        await handleTerminalIntentFailure(
          createdOrderIdRef.current ?? boundOrderId ?? '',
          attemptId,
          null
        );
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
    savedPaymentMethod?.type,
    showError,
    showInfo,
    handleSettlementNavigation,
    cancelStaleOrder,
    handleTerminalIntentFailure,
    resetDeadOrderRefs,
    paymentIssue,
    useBalance,
    walletBalance,
    useOnezePayment,
    verificationRequested,
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
        await handleTerminalIntentFailure(
          createdOrderIdRef.current ?? boundOrderId ?? '',
          attemptId,
          latest.failureCode ?? null
        );
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
    handleTerminalIntentFailure,
    item,
    boundOrder,
    boundOrderId,
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
              await handleTerminalIntentFailure(
                orderId ?? boundOrderId ?? '',
                attemptId,
                latest.failureCode ?? null
              );
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
  }, [handleSettlementNavigation, handleTerminalIntentFailure, boundOrderId]);

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
    paymentIssue,
    onezeShortfall,
    /** Server-authoritative 1ZE requirement when known — overrides the
     *  client estimate for display and eligibility. */
    onezeRequiredIze,
    handlePay,
    cancelStaleOrder,
    handleCheckPaymentStatus,
    createdOrderIdRef,
    discardPendingPayment,
  };
}
