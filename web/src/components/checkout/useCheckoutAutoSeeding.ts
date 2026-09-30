'use client';

/**
 * useCheckoutAutoSeeding — handles initial instrument seeding from user defaults
 * or order-bound resume state (address, payment method, parcel carrier, verification).
 */

import { useEffect } from 'react';
import type { Address, PaymentMethod, CommerceOrder } from '@/lib/contracts/domain';
import type { DeliverySelection } from './checkoutViewModel';
import { paymentMethodExpired } from './SelectionList';
import { DATA_MODE } from '@/lib/api/client';

interface UseCheckoutAutoSeedingOptions {
  instrumentsReady: boolean;
  addresses: Address[];
  defaultAddress: Address | null;
  paymentMethods: PaymentMethod[];
  boundOrder?: CommerceOrder | null;
  setAddressId: React.Dispatch<React.SetStateAction<string | null>>;
  setPaymentId: React.Dispatch<React.SetStateAction<string | null>>;
  setDelivery: React.Dispatch<React.SetStateAction<DeliverySelection>>;
  setVerificationRequested: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useCheckoutAutoSeeding({
  instrumentsReady,
  addresses,
  defaultAddress,
  paymentMethods,
  boundOrder,
  setAddressId,
  setPaymentId,
  setDelivery,
  setVerificationRequested,
}: UseCheckoutAutoSeedingOptions) {
  useEffect(() => {
    if (!instrumentsReady) return;
    const boundAddressId =
      boundOrder?.addressId != null
        ? (addresses.find((a) => a.id === String(boundOrder.addressId))?.id ?? null)
        : null;

    setAddressId((id) => {
      if (id && addresses.some((a) => a.id === id)) {
        const autoSeed = defaultAddress?.id ?? addresses[0]?.id ?? null;
        return boundAddressId && id === autoSeed ? boundAddressId : id;
      }
      return boundAddressId ?? defaultAddress?.id ?? addresses[0]?.id ?? null;
    });

    if (DATA_MODE !== 'live') {
      setPaymentId((id) =>
        id && paymentMethods.some((p) => p.id === id && !paymentMethodExpired(p))
          ? id
          : (paymentMethods.find((p) => p.isDefault && !paymentMethodExpired(p))?.id ??
            paymentMethods.find((p) => !paymentMethodExpired(p))?.id ??
            null),
      );
    }
  }, [instrumentsReady, addresses, paymentMethods, defaultAddress, boundOrder, setAddressId, setPaymentId]);

  useEffect(() => {
    if (!boundOrder) return;
    setVerificationRequested(boundOrder.verificationRequested === true);
    const boundCarrier =
      boundOrder.shippingCarrierId ?? boundOrder.fulfilmentSnapshot?.carrierId ?? null;
    if (!boundCarrier) return;

    setDelivery((prev) =>
      prev[boundOrder.sellerId]
        ? prev
        : {
            ...prev,
            [boundOrder.sellerId]: {
              quoteId: '',
              carrierId: boundCarrier,
              serviceName: boundOrder.fulfilmentSnapshot?.serviceName ?? '',
              priceFromGbp: boundOrder.postageFeeGbp ?? 0,
              etaMinDays: 0,
              etaMaxDays: 0,
              tracking: false,
              live: false,
            },
          },
    );
  }, [boundOrder, setVerificationRequested, setDelivery]);
}
