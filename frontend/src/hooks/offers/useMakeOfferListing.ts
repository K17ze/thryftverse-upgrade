import {
  useCallback,
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
  /** Live listing price in GBP once fetched — falls back to the route
   *  param. All money math (seed, cap, discount, summary) must read this,
   *  never the possibly-stale navigation payload. */
  livePriceGbp: number;
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
  const [offerPrice, setOfferPriceState] = useState('');
  const [listing, setListing] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const isMountedRef = useRef(true);
  // True once the user has typed/tapped an amount — the live-price reseed
  // must never stomp an in-progress edit.
  const userEditedRef = useRef(false);
  const setOfferPrice = useCallback((value: SetStateAction<string>) => {
    userEditedRef.current = true;
    setOfferPriceState(value);
  }, []);

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

  // Live listing price wins over the navigation payload — the param can be
  // stale by minutes (price drop between PDP tap and sheet submit).
  const livePriceGbp =
    listing && Number.isFinite(listing.priceGbp) && listing.priceGbp > 0
      ? listing.priceGbp
      : price;

  useEffect(() => {
    if (userEditedRef.current) return;
    // For counter-offers, default to halfway between previous offer and asking price
    const basePrice = isCounterOffer && previousOffer ? (previousOffer + livePriceGbp) / 2 : livePriceGbp;
    const defaultOffer = convertGbpToDisplayAmount(basePrice, currencyCode, fxRates);
    setOfferPriceState((Number.isFinite(defaultOffer) ? defaultOffer : basePrice).toFixed(2));
  }, [currencyCode, fxRates, livePriceGbp, isCounterOffer, previousOffer]);

  const numericOffer = parseFloat(offerPrice) || 0;
  const {
    offerGbp: numericOfferGbp,
    platformChargeGbp,
    totalGbp: total } = calculateOfferSummaryFromDisplay(numericOffer, currencyCode, fxRates);

  // Discount percentage relative to listing price — key trust signal
  // shown dynamically as the buyer adjusts their offer. Resale
  // marketplaces all show this prominently.
  const discountPct = useMemo(() => {
    if (!livePriceGbp || livePriceGbp <= 0) return null;
    const pct = ((livePriceGbp - numericOfferGbp) / livePriceGbp) * 100;
    if (pct <= 0) return null;
    return Math.round(pct);
  }, [livePriceGbp, numericOfferGbp]);

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
    livePriceGbp,
    itemImageUri };
}
