import { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  getOrder,
  getShippingQuote,
  listUserAddresses,
  listUserPaymentMethods,
  type CommerceAddress,
  type CommerceOrder,
  type CommercePaymentMethod,
} from '../../services/commerceApi';
import {
  getUserCountryCapabilities,
  type UserCountryCapabilities,
} from '../../services/capabilitiesApi';
import {
  type CheckoutPostageOption,
  DEFAULT_POSTAGE_OPTION,
  UNAVAILABLE_REGION_POSTAGE_OPTION,
  toEtaLabelFromRange,
  toEtaLabel,
} from '../../utils/checkoutFlow';
import { useCheckoutCapabilities } from './useCheckoutCapabilities';
import type { Listing } from '../../domain';

// Store's SavedAddress/SavedPaymentMethod shapes are not exported — these
// structural types mirror the exact fields hydrateCheckout writes back.
type SaveAddressInput = {
  id?: number;
  name: string;
  streetAddress: string;
  apartment?: string;
  city: string;
  region?: string;
  postalCode: string;
  countryCode: string;
  country: string;
  isDefault?: boolean;
};

type SavePaymentMethodInput = {
  id?: number;
  type: 'card' | 'bank_account' | 'apple_pay' | 'google_pay';
  label: string;
  details?: string;
  isDefault?: boolean;
};

export interface UseCheckoutHydrationOptions {
  itemId?: string;
  /**
   * Order-bound checkout: when set, an existing order (e.g. created by an
   * accepted offer) is fetched and used as the source of truth for listing
   * id and totals — the listing itself may be paused and not buyer-visible.
   */
  orderId?: string;
  item: Listing | undefined;
  userId: string | undefined;
  savedAddressId: number | undefined;
  savedAddressPostcode: string | undefined;
  savedPaymentMethodId: number | undefined;
  saveAddress: (address: SaveAddressInput) => void;
  clearSavedAddress: () => void;
  savePaymentMethod: (paymentMethod: SavePaymentMethodInput) => void;
  clearSavedPaymentMethod: () => void;
}

/**
 * useCheckoutHydration — owns the checkout data-loading pipeline: the
 * parallel address/payment/capability fetch, the shipping quote that
 * follows it, the backend lists, the derived postage option, and the
 * focus-based refresh lifecycle. Selection state (the saved address /
 * payment method in the store) stays with the caller; this hook writes
 * back through the provided store actions.
 */
export function useCheckoutHydration({
  itemId,
  orderId,
  item,
  userId,
  savedAddressId,
  savedAddressPostcode,
  savedPaymentMethodId,
  saveAddress,
  clearSavedAddress,
  savePaymentMethod,
  clearSavedPaymentMethod,
}: UseCheckoutHydrationOptions) {
  const {
    checkoutCapabilities,
    setCheckoutCapabilities,
    capabilityError,
    setCapabilityError,
  } = useCheckoutCapabilities(itemId ?? '');
  const [isHydrating, setIsHydrating] = useState(false);
  // Order-bound checkout state — populated only when `orderId` is passed.
  const [boundOrder, setBoundOrder] = useState<CommerceOrder | null>(null);
  const [boundOrderLoadFailed, setBoundOrderLoadFailed] = useState(false);
  const [boundOrderNotPayable, setBoundOrderNotPayable] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [backendAddresses, setBackendAddresses] = useState<CommerceAddress[]>([]);
  const [backendPaymentMethods, setBackendPaymentMethods] = useState<CommercePaymentMethod[]>([]);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [shippingError, setShippingError] = useState<string | null>(null);
  const [postageOption, setPostageOption] = useState<CheckoutPostageOption>(DEFAULT_POSTAGE_OPTION);

  // --- Hydration ---
  const hydrateCheckout = useCallback(async () => {
    if (!userId || (!orderId && !item)) return;

    setIsHydrating(true);
    setAddressError(null);
    setPaymentError(null);
    setCapabilityError(null);
    setShippingError(null);

    try {
      // Order-bound branch — fetch the authoritative order first. The listing
      // is paused by offer-acceptance (buyer gets 403 on /listings/:id), so
      // nothing about this checkout may be derived from the listing.
      let boundOrderRow: CommerceOrder | null = null;
      if (orderId) {
        try {
          boundOrderRow = await getOrder(orderId);
          setBoundOrder(boundOrderRow);
          setBoundOrderLoadFailed(false);
        } catch {
          setBoundOrder(null);
          setBoundOrderLoadFailed(true);
          return;
        }
        // Only 'created' orders can still be paid; anything else (paid,
        // cancelled, shipped…) is a dead end the screen must surface.
        const payable = boundOrderRow.status === 'created';
        setBoundOrderNotPayable(!payable);
        if (!payable) return;
      }

      // The order's stored listing/totals win over the param listing — never
      // fabricate prices from the listing when an orderId is given.
      const quoteListingId = boundOrderRow?.listingId ?? item?.id;
      const declaredValueGbp = boundOrderRow?.subtotalGbp ?? item?.price;
      // Resume fidelity: an already-bound order carries the buyer's earlier
      // address/payment selections — prefer them over store defaults.
      const preferredAddressId = boundOrderRow?.addressId ?? savedAddressId;
      const preferredPaymentMethodId = boundOrderRow?.paymentMethodId ?? savedPaymentMethodId;

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
          const matchingAddr = preferredAddressId
            ? addresses.find((a) => a.id === preferredAddressId)
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
          if (savedAddressId) {
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
          const matchingPm = preferredPaymentMethodId
            ? paymentMethods.find((pm) => pm.id === preferredPaymentMethodId)
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
          if (savedPaymentMethodId) {
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

          const addrForQuote = preferredAddressId
            ? addresses.find((a) => a.id === preferredAddressId)
            : addresses.find((a) => a.isDefault) ?? addresses[0];

          if (quoteListingId && (addrForQuote?.id || savedAddressPostcode)) {
            try {
              const quoteResponse = await getShippingQuote({
                buyerId: userId,
                listingId: quoteListingId,
                addressId: addrForQuote?.id ?? preferredAddressId,
                destinationPostcode: addrForQuote?.postalCode ?? savedAddressPostcode,
                preferredCarrierId: primaryCarrier.id,
                declaredValueGbp,
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
  }, [userId, orderId, item, savedAddressId, savedAddressPostcode, saveAddress, clearSavedAddress, savePaymentMethod, clearSavedPaymentMethod, savedPaymentMethodId, setCheckoutCapabilities, setCapabilityError]);

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

  return {
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
    hydrateCheckout,
    handleRefreshCheckout,
  };
}
