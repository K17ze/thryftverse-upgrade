'use client';

/**
 * useCheckoutPaymentExecution — handles live vs fixture checkout order creation,
 * idempotency, order-bound resume re-binding, payment intent settlement, and bag cleanup.
 */

import { useRef, useState } from 'react';
import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import type { QueryClient } from '@tanstack/react-query';
import type { Listing, Address, CommerceOrder } from '@/lib/contracts/domain';
import type { CheckoutDeliveryQuote } from '@/lib/data/fixtures-checkout';
import type { ParcelDeliveryVm } from './DeliveryPicker';
import type { CheckoutPayStage } from './CheckoutProgress';
import { DATA_MODE } from '@/lib/api/client';
import * as commerceService from '@/lib/api/services/commerce';
import * as checkoutService from '@/lib/api/services/checkout';
import { parseApiError } from '@/lib/api/http';
import { intentSettlement, waitForPaymentSettlement } from '@/lib/commerce/payments';
import { recordOrder } from '@/lib/data/fixtures-commerce';

interface UseCheckoutPaymentExecutionOptions {
  canPay: boolean;
  items: Listing[];
  parcels: ParcelDeliveryVm[];
  liveQuotes: Record<string, CheckoutDeliveryQuote[]>;
  selectedAddress: Address | null;
  liveAddressNumericId: number;
  paymentId: string | null;
  useOneze: boolean;
  onezeRequired: number;
  verification: boolean;
  boundOrder?: CommerceOrder | null;
  user: { id: string } | null;
  itemId: string | null;
  removeFromBag: (id: string) => void;
  qc: QueryClient;
  router: AppRouterInstance;
  debitOnezePocket: (amount: number) => void;
}

export function useCheckoutPaymentExecution({
  canPay,
  items,
  parcels,
  liveQuotes,
  selectedAddress,
  liveAddressNumericId,
  paymentId,
  useOneze,
  onezeRequired,
  verification,
  boundOrder,
  user,
  itemId,
  removeFromBag,
  qc,
  router,
  debitOnezePocket,
}: UseCheckoutPaymentExecutionOptions) {
  const [payStage, setPayStage] = useState<CheckoutPayStage | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [payError, setPayError] = useState<string | null>(null);
  const idemRef = useRef<string | null>(null);

  const deliveryChoices = () => {
    const out: Record<string, { carrierId: string; serviceName: string; priceGbp: number }> = {};
    for (const parcel of parcels) {
      const q = parcel.selected;
      if (!parcel.sellerCovered && q) {
        out[parcel.sellerId] = {
          carrierId: q.carrierId,
          serviceName: q.serviceName,
          priceGbp: q.priceFromGbp,
        };
      }
    }
    return out;
  };

  const handlePay = async () => {
    if (!canPay) return;
    setPayError(null);

    if (DATA_MODE === 'live') {
      try {
        const buyerId = user?.id;
        if (!buyerId) throw new Error('not signed in');
        setPayStage('creating_order');

        idemRef.current ??= `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        if (!Number.isFinite(liveAddressNumericId)) {
          throw new Error('a saved delivery address is required');
        }
        const orderAddressId = liveAddressNumericId;
        const numericPaymentId =
          !useOneze && paymentId && Number.isFinite(Number(paymentId))
            ? Number(paymentId)
            : undefined;

        // Order-bound resume
        if (boundOrder) {
          const boundItem = items[0];
          const boundParcel = parcels[0];
          if (!boundItem || !boundParcel) throw new Error('order item unavailable');
          const wantedCarrier = boundParcel.selected?.carrierId;
          const cached = liveQuotes[boundItem.id] ?? [];
          let bound: { quoteId: string; carrierId: string } | null =
            cached.find((q) => q.quoteId && q.carrierId === wantedCarrier) ??
            cached.find((q) => q.quoteId) ??
            null;

          const postageFee = boundParcel.sellerCovered
            ? 0
            : (boundParcel.selected?.priceFromGbp ?? 0);
          const carrierForOrder = boundParcel.sellerCovered
            ? (boundOrder.shippingCarrierId ?? null)
            : (wantedCarrier ?? null);
          const alreadyBound =
            boundOrder.addressId != null &&
            boundOrder.addressId === orderAddressId &&
            (boundOrder.shippingCarrierId ?? null) === carrierForOrder &&
            boundOrder.postageFeeGbp === postageFee &&
            (boundOrder.paymentMethodId ?? null) === (numericPaymentId ?? null) &&
            (boundOrder.verificationRequested ?? false) === verification;

          if (!alreadyBound) {
            if (!bound) {
              const res = await checkoutService.fetchCheckoutShippingQuote({
                buyerId,
                listingId: boundItem.id,
                sellerId: boundItem.sellerId,
                addressId: orderAddressId,
                destinationPostcode: selectedAddress?.postcode,
                preferredCarrierId: wantedCarrier,
                declaredValueGbp: boundOrder.subtotalGbp ?? undefined,
              });
              const fresh =
                res.quotes.find((q) => q.quoteId && q.carrierId === wantedCarrier) ??
                (res.recommendedQuote?.quoteId ? res.recommendedQuote : null) ??
                res.quotes.find((q) => q.quoteId) ??
                null;
              bound =
                fresh?.quoteId && fresh.carrierId
                  ? { quoteId: fresh.quoteId, carrierId: fresh.carrierId }
                  : null;
            }
            if (!bound?.quoteId) throw new Error('no shipping quote');
            await commerceService.completeOrderCheckout(boundOrder.id, {
              addressId: orderAddressId,
              paymentMethodId: numericPaymentId,
              shippingQuoteId: bound.quoteId,
              shippingCarrierId: bound.carrierId,
              verificationRequested: verification,
            });
          }

          setPayStage('opening_payment');
          const intent = await commerceService.createCommercePaymentIntent({
            orderId: boundOrder.id,
            idempotencyKey: useOneze
              ? `oneze_payment_${boundOrder.id}`
              : `web-pay-${boundOrder.id}-${idemRef.current}`,
            gatewayId: useOneze ? 'oneze_internal' : undefined,
          });
          const immediate = intentSettlement(intent.status);
          const outcome =
            immediate === 'open' ? await waitForPaymentSettlement(intent.id) : immediate;
          void qc.invalidateQueries({ queryKey: ['orders'] });
          void qc.invalidateQueries({ queryKey: ['order', boundOrder.id] });

          if (outcome === 'succeeded') {
            setOrderId(boundOrder.id);
            return;
          }
          if (outcome === 'pending') {
            router.replace(`/orders/${boundOrder.id}`);
            return;
          }
          setPayError(
            'Payment could not be completed — try again, or finish it in the app.',
          );
          setPayStage(null);
          return;
        }

        // Multi-item / standard buy now
        const created: string[] = [];
        const settled: string[] = [];
        const pendingOrders: string[] = [];
        const failed: string[] = [];

        for (const item of items) {
          try {
            const parcel = parcels.find((p) => p.sellerId === item.sellerId);
            const wantedCarrier = parcel?.selected?.carrierId;
            const cached = liveQuotes[item.id] ?? [];
            let bound: { quoteId: string; carrierId: string } | null =
              cached.find((q) => q.quoteId && q.carrierId === wantedCarrier) ??
              cached.find((q) => q.quoteId) ??
              null;
            if (!bound) {
              const res = await checkoutService.fetchCheckoutShippingQuote({
                buyerId,
                listingId: item.id,
                sellerId: item.sellerId,
                addressId: orderAddressId,
                destinationPostcode: selectedAddress?.postcode,
                preferredCarrierId: wantedCarrier,
                declaredValueGbp: item.price > 0 ? item.price : undefined,
              });
              const fresh =
                res.quotes.find((q) => q.quoteId && q.carrierId === wantedCarrier) ??
                (res.recommendedQuote?.quoteId ? res.recommendedQuote : null) ??
                res.quotes.find((q) => q.quoteId) ??
                null;
              bound =
                fresh?.quoteId && fresh.carrierId
                  ? { quoteId: fresh.quoteId, carrierId: fresh.carrierId }
                  : null;
            }
            if (!bound) throw new Error('no shipping quote');
            const { orderId: id } = await checkoutService.createCheckoutOrder({
              listingId: item.id,
              buyerId,
              idempotencyKey: `web-${item.id}-${idemRef.current}`,
              addressId: orderAddressId,
              paymentMethodId: numericPaymentId,
              shippingQuoteId: bound.quoteId,
              shippingCarrierId: bound.carrierId,
              paymentGatewayId: useOneze ? 'oneze_internal' : undefined,
              verificationRequested: verification || undefined,
            });
            created.push(id);
            if (!itemId) removeFromBag(item.id);

            try {
              setPayStage('opening_payment');
              const intent = await commerceService.createCommercePaymentIntent({
                orderId: id,
                idempotencyKey: useOneze
                  ? `oneze_payment_${id}`
                  : `web-pay-${id}-${idemRef.current}`,
                gatewayId: useOneze ? 'oneze_internal' : undefined,
              });
              const immediate = intentSettlement(intent.status);
              const outcome =
                immediate === 'open' ? await waitForPaymentSettlement(intent.id) : immediate;
              if (outcome === 'succeeded') settled.push(id);
              else if (outcome === 'failed') failed.push(item.title);
              else pendingOrders.push(id);
            } catch {
              pendingOrders.push(id);
            }
          } catch {
            failed.push(item.title);
          }
        }

        if (created.length > 0) {
          void qc.invalidateQueries({ queryKey: ['orders'] });
          void qc.invalidateQueries({ queryKey: ['listing'] });
          void qc.invalidateQueries({ queryKey: ['listings'] });
        }
        if (failed.length === 0 && pendingOrders.length === 0 && settled.length > 0) {
          setOrderId(settled[0]!);
          return;
        }
        if (pendingOrders.length > 0 && failed.length === 0) {
          void qc.invalidateQueries({ queryKey: ['order'] });
          router.replace(`/orders/${pendingOrders[0]!}`);
          return;
        }
        if (created.length > 0) {
          const notes: string[] = [];
          if (failed.length > 0) {
            notes.push(
              `${failed.length === 1 ? 'One item' : `${failed.length} items`} couldn't be completed — ${failed.join(', ')}.`,
            );
          }
          if (pendingOrders.length > 0) {
            notes.push('Some orders were created but payment is still pending — check your orders.');
          }
          setPayError(notes.join(' '));
        } else {
          setPayError('Payment could not be completed — no order was placed. Check your payment method and try again.');
        }
        setPayStage(null);
        return;
      } catch (error) {
        setPayError(
          parseApiError(
            error,
            'Payment could not be completed — check your payment method and try again.',
          ).message,
        );
        setPayStage(null);
        return;
      }
    }

    // Fixture Mode
    setPayStage('creating_order');
    await new Promise((r) => setTimeout(r, 350));
    setPayStage('opening_payment');
    await new Promise((r) => setTimeout(r, 350));

    const orders = recordOrder(items, {
      delivery: deliveryChoices(),
      verificationRequested: verification,
    });
    if (useOneze) debitOnezePocket(onezeRequired);

    void qc.invalidateQueries({ queryKey: ['orders'] });
    void qc.invalidateQueries({ queryKey: ['listing'] });
    void qc.invalidateQueries({ queryKey: ['listings'] });
    void qc.invalidateQueries({ queryKey: ['feed'] });
    if (!itemId) items.forEach((l) => removeFromBag(l.id));
    setPayStage(null);
    setOrderId(orders[0]?.id ?? null);
  };

  return {
    payStage,
    orderId,
    payError,
    handlePay,
  };
}
