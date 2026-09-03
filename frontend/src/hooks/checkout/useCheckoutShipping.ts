import { useState, useCallback, useEffect } from 'react';
import {
  listUserAddresses,
  getShippingQuote,
  type CommerceAddress,
} from '../../services/commerceApi';
import {
  type CheckoutPostageOption,
  DEFAULT_POSTAGE_OPTION,
  UNAVAILABLE_REGION_POSTAGE_OPTION,
  toEtaLabelFromRange,
} from '../../utils/checkoutFlow';

export interface UseCheckoutShippingOptions {
  currentUserId?: string;
  itemId: string;
  itemPrice?: number;
  primaryCarrierId?: string;
  savedAddress?: CommerceAddress | null;
  onSelectAddress: (address: CommerceAddress) => void;
  onClearAddress: () => void;
}

export function useCheckoutShipping({
  currentUserId,
  itemId,
  itemPrice = 0,
  primaryCarrierId,
  savedAddress,
  onSelectAddress,
}: UseCheckoutShippingOptions) {
  const [backendAddresses, setBackendAddresses] = useState<CommerceAddress[]>([]);
  const [postageOption, setPostageOption] =
    useState<CheckoutPostageOption>(DEFAULT_POSTAGE_OPTION);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [shippingError, setShippingError] = useState<string | null>(null);
  const [isShippingLoading, setIsShippingLoading] = useState(false);

  // Load user addresses
  const loadAddresses = useCallback(async () => {
    if (!currentUserId) return;
    try {
      setAddressError(null);
      const addrs = await listUserAddresses(currentUserId);
      setBackendAddresses(addrs);

      if (!savedAddress && addrs.length > 0) {
        const defaultAddr = addrs.find((a) => a.isDefault) ?? addrs[0];
        if (defaultAddr) onSelectAddress(defaultAddr);
      }
    } catch {
      setAddressError('Failed to load saved addresses');
    }
  }, [currentUserId, savedAddress, onSelectAddress]);

  // Fetch shipping quote when address or item changes
  const fetchShipping = useCallback(
    async (address: CommerceAddress) => {
      if (!currentUserId || !address?.id) return;
      setIsShippingLoading(true);
      setShippingError(null);
      try {
        const quoteResponse = await getShippingQuote({
          buyerId: currentUserId,
          listingId: itemId,
          addressId: address.id,
          destinationPostcode: address.postalCode,
          preferredCarrierId: primaryCarrierId,
          declaredValueGbp: itemPrice,
        });

        const selectedQuote =
          quoteResponse.recommendedQuote ?? quoteResponse.quotes?.[0];

        if (selectedQuote) {
          setPostageOption({
            quoteId: selectedQuote.quoteId,
            carrierId: selectedQuote.carrierId,
            label: selectedQuote.label,
            etaLabel: toEtaLabelFromRange(
              selectedQuote.etaMinDays,
              selectedQuote.etaMaxDays
            ),
            priceFromGbp: selectedQuote.priceFromGbp,
            liveQuote: selectedQuote.live,
            tracking: selectedQuote.tracking,
          });
        } else {
          setPostageOption(UNAVAILABLE_REGION_POSTAGE_OPTION);
          setShippingError('Shipping is not available for this delivery address');
        }
      } catch {
        setPostageOption(DEFAULT_POSTAGE_OPTION);
        setShippingError('Could not calculate real-time shipping rate');
      } finally {
        setIsShippingLoading(false);
      }
    },
    [currentUserId, itemId, itemPrice, primaryCarrierId]
  );

  useEffect(() => {
    loadAddresses();
  }, [loadAddresses]);

  useEffect(() => {
    if (savedAddress) {
      fetchShipping(savedAddress);
    }
  }, [savedAddress, fetchShipping]);

  return {
    backendAddresses,
    postageOption,
    setPostageOption,
    addressError,
    shippingError,
    isShippingLoading,
    loadAddresses,
    fetchShipping,
  };
}
