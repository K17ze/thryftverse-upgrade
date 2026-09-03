import { useMemo, useEffect } from 'react';
import { sanitizeDecimalInput } from '../../utils/currencyAuthoringFlows';
import {
  evaluatePriceVsMarket,
  computeDiscount,
  type PriceVsMarket,
} from '../../utils/sellScreenLogic';
import {
  evaluateListingCompleteness,
  type ListingFieldValues,
  type ListingFieldKey,
  type ListingCompletenessResult,
} from '../../contracts/listingCategoryPolicy';
import type { SoldCompsResult } from '../useSoldComps';
import type { useSellFormState } from './useSellFormState';

type FormValues = ReturnType<typeof useSellFormState>['values'];

export interface SellScreenFormParams {
  values: FormValues;
  photos: string[];
  soldComps: SoldCompsResult;
  errors: Record<string, string>;
  errorMsg: string | null;
  setErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setErrorMsg: React.Dispatch<React.SetStateAction<string | null>>;
}

export interface SellScreenFormResult {
  hasBasePhotos: boolean;
  hasRequiredDetails: boolean;
  hasDescription: boolean;
  numericPrice: number;
  hasValidPrice: boolean;
  numericStartingBid: number;
  hasValidStartingBid: boolean;
  parsedShareCount: number;
  hasValidShareCount: boolean;
  parsedSharePrice: number;
  hasValidSharePrice: boolean;
  coOwnFinancialReady: boolean;
  coOwnAuthReady: boolean;
  priceVsMarket: PriceVsMarket;
  completeness: ListingCompletenessResult;
  publishReady: boolean;
  completenessLabel: string;
  recommendedLabel: string | null;
  hasDiscount: boolean;
  discountPercent: number;
}

/**
 * Owns the validation/computed-value domain for the sell screen: field-level
 * validity flags, category-aware completeness evaluation, publish-readiness
 * derivation, price-vs-market guidance, discount preview, and the effect that
 * auto-clears errors once the listing becomes publish-ready. The screen and
 * actions hook consume these computed values so neither duplicates the logic.
 */
export function useSellScreenForm(params: SellScreenFormParams): SellScreenFormResult {
  const { values, photos, soldComps, errors, errorMsg, setErrors, setErrorMsg } = params;
  const {
    title, desc, price, originalPrice, category, brand, size, condition,
    shippingMethod, shippingPayer, listingMode, shareCountInput, sharePriceInput,
    authPhotos, startingBid,
  } = values;

  /* -- validation computed -- */
  const hasBasePhotos = photos.length > 0;
  const hasRequiredDetails = Boolean(title.trim() && category && size && condition);
  const hasDescription = desc.trim().length >= 10;
  const numericPrice = Number(sanitizeDecimalInput(price));
  const hasValidPrice = Number.isFinite(numericPrice) && numericPrice > 0;
  const numericStartingBid = Number(sanitizeDecimalInput(startingBid));
  const hasValidStartingBid = Number.isFinite(numericStartingBid) && numericStartingBid > 0;
  const parsedShareCount = Math.floor(Number(shareCountInput));
  const hasValidShareCount = Number.isFinite(parsedShareCount) && parsedShareCount > 0;
  const parsedSharePrice = Number(sanitizeDecimalInput(sharePriceInput));
  const hasValidSharePrice = Number.isFinite(parsedSharePrice) && parsedSharePrice > 0;
  const coOwnFinancialReady = listingMode !== 'co_own' || (hasValidShareCount && hasValidSharePrice);
  const coOwnAuthReady = listingMode !== 'co_own' || authPhotos.length > 0;

  const priceVsMarket = useMemo(() => {
    return evaluatePriceVsMarket(soldComps.hasComps, hasValidPrice, numericPrice, soldComps.minPrice, soldComps.maxPrice);
  }, [soldComps, hasValidPrice, numericPrice]);

  // ── Category-aware completeness (Phase 5 WP7) ──
  // Truthful completeness indicators based on the category policy, not
  // universal brand/size assumptions. Brandless vintage and sizeless home
  // goods are valid when the policy says so.
  const completeness = useMemo(() => {
    const fieldValues: ListingFieldValues = {
      title: title.trim() || null,
      description: desc.trim() || null,
      price: numericPrice > 0 ? numericPrice : null,
      category: category || null,
      brand: brand || null,
      size: size || null,
      condition: condition || null,
      images: photos.length > 0 ? photos : null,
      shippingMethod: shippingMethod || null,
      shippingPayer: shippingPayer || null,
    };
    return evaluateListingCompleteness(fieldValues);
  }, [title, desc, numericPrice, category, brand, size, condition, photos, shippingMethod, shippingPayer]);

  const publishReady = useMemo(() => {
    // Category-aware: use the policy's canActivate as the base floor,
    // then add mode-specific financial requirements.
    if (!completeness.canActivate) return false;
    if (!hasDescription) return false;
    if (listingMode === 'auction') return hasValidStartingBid;
    if (listingMode === 'co_own') return hasValidPrice && coOwnFinancialReady && coOwnAuthReady;
    return hasValidPrice;
  }, [completeness, hasDescription, listingMode, hasValidPrice, hasValidStartingBid, coOwnFinancialReady, coOwnAuthReady]);

  // Human-readable field labels for the completeness indicator
  const fieldLabelMap: Record<ListingFieldKey, string> = {
    title: 'title',
    description: 'description',
    price: 'price',
    category: 'category',
    subcategory: 'subcategory',
    brand: 'brand',
    size: 'size',
    condition: 'condition',
    images: 'photos',
    shippingMethod: 'shipping method',
    shippingPayer: 'shipping payer',
  };

  const completenessLabel = useMemo(() => completeness.canActivate
    ? 'Ready to publish'
    : `Missing: ${completeness.missingRequired.map((f) => fieldLabelMap[f]).join(', ')}`,
    [completeness.canActivate, completeness.missingRequired, fieldLabelMap]);

  const recommendedLabel = useMemo(() => completeness.missingRecommended.length > 0
    ? `Suggested: ${completeness.missingRecommended.map((f) => fieldLabelMap[f]).join(', ')}`
    : null,
    [completeness.missingRecommended, fieldLabelMap]);

  const { hasDiscount, discountPercent } = useMemo(
    () => computeDiscount(originalPrice, price),
    [originalPrice, price],
  );

  // Auto-clear errors once the listing becomes publish-ready.
  useEffect(() => {
    if (publishReady && (errorMsg || Object.keys(errors).length > 0)) {
      setErrorMsg(null);
      setErrors({});
    }
  }, [publishReady, errorMsg, errors, setErrorMsg, setErrors]);

  return {
    hasBasePhotos,
    hasRequiredDetails,
    hasDescription,
    numericPrice,
    hasValidPrice,
    numericStartingBid,
    hasValidStartingBid,
    parsedShareCount,
    hasValidShareCount,
    parsedSharePrice,
    hasValidSharePrice,
    coOwnFinancialReady,
    coOwnAuthReady,
    priceVsMarket,
    completeness,
    publishReady,
    completenessLabel,
    recommendedLabel,
    hasDiscount,
    discountPercent,
  };
}
