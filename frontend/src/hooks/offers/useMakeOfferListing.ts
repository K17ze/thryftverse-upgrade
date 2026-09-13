import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction } from 'react';
import { fetchListingByIdFromApi } from '../../services/listingsApi';
import {
  calculateOfferSummaryFromDisplay,
  convertGbpToDisplayAmount } from '../../utils/currencyAuthoringFlows';
import { useCurrencyContext } from '../../context/CurrencyContext';
import { useToast } from '../../context/ToastContext';
import { t } from '../../i18n';

export interface MakeOfferListingResult {
  listing: any;
  isLoading: boolean;
  offerPrice: string;
  setOfferPrice: Dispatch<SetStateAction<string>>;
  isMountedRef: MutableRefObject<boolean>;
  numericOffer: number;
  numericOfferGbp: number;
  platformChargeGbp: number;
  total: number;
  discountPct: number | null;
  itemImageUri: string | undefined;
}

/**
 * Listing + offer-amount state for MakeOfferScreen: fetches the listing,
 * seeds the default offer amount (midpoint between the previous offer and
 * asking price for counters), and derives the GBP summary + discount
 * percentage shown live while the buyer edits the amount.
 */
export function useMakeOfferListing(params: {
  itemId: string;
  price: number;
  isCounterOffer: boolean;
  previousOffer: number | undefined;
}): MakeOfferListingResult {
  const { itemId, price, isCounterOffer, previousOffer } = params;
  const { currencyCode, fxRates } = useCurrencyContext();
  const { show } = useToast();
  const [offerPrice, setOfferPrice] = useState('');
  const [listing, setListing] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    fetchListingByIdFromApi(itemId)
      .then((res) => {
        if (!mounted) return;
        if (res.ok && res.listing) setListing(res.listing);
      })
      .catch(() => { if (mounted) show(t('makeOffer.toast.couldNotLoadListing'), 'error'); })
      .finally(() => { if (mounted) setIsLoading(false); });
    return () => { mounted = false; };
  }, [itemId, show]);

  useEffect(() => {
    // For counter-offers, default to halfway between previous offer and asking price
    const basePrice = isCounterOffer && previousOffer ? (previousOffer + price) / 2 : price;
    const defaultOffer = convertGbpToDisplayAmount(basePrice, currencyCode, fxRates);
    setOfferPrice((Number.isFinite(defaultOffer) ? defaultOffer : basePrice).toFixed(2));
  }, [currencyCode, fxRates, price, isCounterOffer, previousOffer]);

  const numericOffer = parseFloat(offerPrice) || 0;
  const {
    offerGbp: numericOfferGbp,
    platformChargeGbp,
    totalGbp: total } = calculateOfferSummaryFromDisplay(numericOffer, currencyCode, fxRates);

  // Discount percentage relative to listing price — key trust signal
  // shown dynamically as the buyer adjusts their offer. Resale
  // marketplaces all show this prominently.
  const discountPct = useMemo(() => {
    if (!price || price <= 0) return null;
    const pct = ((price - numericOfferGbp) / price) * 100;
    if (pct <= 0) return null;
    return Math.round(pct);
  }, [price, numericOfferGbp]);

  // Item image — use listing image if available, fall back to icon
  const itemImageUri = listing?.images?.[0] ?? listing?.imageUrl;

  return {
    listing,
    isLoading,
    offerPrice,
    setOfferPrice,
    isMountedRef,
    numericOffer,
    numericOfferGbp,
    platformChargeGbp,
    total,
    discountPct,
    itemImageUri };
}
