'use client';

/**
 * useCheckoutDeliveryState — live vs fixture quote resolution, per-parcel
 * quote matching, and reactive effective delivery derivation.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Listing, Address, CommerceOrder } from '@/lib/contracts/domain';
import type { SellerGroup } from '@/lib/data/fixtures';
import {
  PARCEL_DELIVERY_QUOTES,
  defaultParcelQuote,
  type CheckoutDeliveryQuote,
} from '@/lib/data/fixtures-checkout';
import {
  parcelSellerCovered,
  type DeliverySelection,
} from './checkoutViewModel';
import type { ParcelDeliveryVm } from './DeliveryPicker';
import { DATA_MODE } from '@/lib/api/client';
import * as checkoutService from '@/lib/api/services/checkout';

interface UseCheckoutDeliveryStateOptions {
  items: Listing[];
  groups: SellerGroup[];
  user: { id: string } | null;
  selectedAddress: Address | null;
  liveAddressNumericId: number;
  boundOrder?: CommerceOrder | null;
  delivery: DeliverySelection;
}

export function useCheckoutDeliveryState({
  items,
  groups,
  user,
  selectedAddress,
  liveAddressNumericId,
  boundOrder,
  delivery,
}: UseCheckoutDeliveryStateOptions) {
  const [quoteRefreshKey, setQuoteRefreshKey] = useState(0);
  const [liveQuotes, setLiveQuotes] = useState<Record<string, CheckoutDeliveryQuote[]>>({});

  useEffect(() => {
    if (
      DATA_MODE !== 'live' ||
      !user?.id ||
      !selectedAddress ||
      !Number.isFinite(liveAddressNumericId)
    ) {
      setLiveQuotes({});
      return;
    }
    const addressNum = liveAddressNumericId;
    const destinationPostcode = selectedAddress.postcode;
    let cancelled = false;

    const run = async () => {
      const next: Record<string, CheckoutDeliveryQuote[]> = {};
      await Promise.all(
        items.map(async (item) => {
          try {
            const res = await checkoutService.fetchCheckoutShippingQuote({
              buyerId: user.id,
              listingId: item.id,
              sellerId: item.sellerId,
              addressId: addressNum,
              destinationPostcode,
              preferredCarrierId: boundOrder
                ? (boundOrder.shippingCarrierId ??
                  boundOrder.fulfilmentSnapshot?.carrierId ??
                  undefined)
                : undefined,
              declaredValueGbp:
                boundOrder && item.id === boundOrder.listingId
                  ? (boundOrder.subtotalGbp ?? undefined)
                  : item.price > 0
                    ? item.price
                    : undefined,
            });
            if (res.ok && res.quotes.length > 0) {
              next[item.id] = res.quotes.map((q) => ({
                quoteId: q.quoteId ?? '',
                carrierId: q.carrierId,
                serviceName: q.label,
                priceFromGbp: q.priceFromGbp,
                etaMinDays: q.etaMinDays,
                etaMaxDays: q.etaMaxDays,
                tracking: q.tracking,
                live: q.live,
              }));
            }
          } catch {
            // Quote fetch failed — parcel keeps default option and Pay stays off
          }
        }),
      );
      if (!cancelled) setLiveQuotes(next);
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [items, user?.id, selectedAddress, liveAddressNumericId, quoteRefreshKey, boundOrder]);

  const liveParcelQuote = useCallback(
    (group: SellerGroup): CheckoutDeliveryQuote | null => {
      const list = liveQuotes[group.items[0]?.id ?? ''] ?? [];
      const wantedCarrier = delivery[group.sellerId]?.carrierId;
      return (
        list.find((q) => q.quoteId && q.carrierId === wantedCarrier) ??
        list.find((q) => q.quoteId) ??
        null
      );
    },
    [liveQuotes, delivery],
  );

  const parcels = useMemo<ParcelDeliveryVm[]>(
    () =>
      groups.map((group, i) => {
        const covered = parcelSellerCovered(group);
        const quotes = covered
          ? []
          : DATA_MODE === 'live'
            ? liveQuotes[group.items[0]?.id ?? ''] ?? [defaultParcelQuote()]
            : PARCEL_DELIVERY_QUOTES;
        const selected = covered
          ? null
          : DATA_MODE === 'live'
            ? (liveParcelQuote(group) ?? quotes[0] ?? defaultParcelQuote())
            : (delivery[group.sellerId] ?? quotes[0] ?? defaultParcelQuote());
        return {
          sellerId: group.sellerId,
          sellerName: group.seller?.username ?? null,
          index: i + 1,
          count: groups.length,
          sellerCovered: covered,
          quotes,
          selected,
        };
      }),
    [groups, delivery, liveQuotes, liveParcelQuote],
  );

  const effectiveDelivery = useMemo<DeliverySelection>(() => {
    if (DATA_MODE !== 'live') return delivery;
    const out: DeliverySelection = {};
    for (const group of groups) {
      const q = liveParcelQuote(group);
      if (q) out[group.sellerId] = q;
    }
    return out;
  }, [delivery, groups, liveParcelQuote]);

  const liveQuotesReady =
    DATA_MODE !== 'live' ||
    (!!selectedAddress &&
      Number.isFinite(liveAddressNumericId) &&
      parcels.every(
        (p) => p.sellerCovered || (p.selected?.live === true && !!p.selected.quoteId),
      ));

  return {
    quoteRefreshKey,
    setQuoteRefreshKey,
    liveQuotes,
    liveParcelQuote,
    parcels,
    effectiveDelivery,
    liveQuotesReady,
  };
}
