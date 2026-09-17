import { useMemo, useCallback } from 'react';
import type { ListingApiItem } from '../../services/listingsApi';
import { useStore } from '../../store/useStore';
import { useBackendData } from '../../context/BackendDataContext';
import { useSoldComps } from '../useSoldComps';
import { evaluateListingCompleteness } from '../../contracts/listingCategoryPolicy';
import { sanitizeDecimalInput } from '../../utils/currencyAuthoringFlows';
import type { ListingMediaDraftItem } from '../../utils/mediaUploadAsset';
import {
  buildEditListingPolicyValues,
  buildEditCompletenessLabel,
  buildEditRecommendedLabel,
  validateEditListingFields,
  computeEditListingHasChanges,
  computeEditDiscount,
  computePriceVsMarket,
  resolveListingStatusLabel,
  type EditListingFieldValues,
  type PriceVsMarket,
} from '../../components/listing/editListingViewModels';

interface UseEditListingDerivedParams {
  itemId: string;
  listing: ListingApiItem | null;
  values: EditListingFieldValues;
  mediaItems: ListingMediaDraftItem[];
  removedRemoteIds: string[];
  remoteMediaOrder: string[];
  initialRemoteOrder: string[];
}

/**
 * Derived state for the edit-listing screen: ownership, dirty tracking,
 * category-policy completeness + labels, field validation, discount and
 * sold-comp pricing signals, listing status label and the editing lock.
 * Pure projections over the form/media state — extracted verbatim from
 * EditListingScreen.
 */
export function useEditListingDerived({
  itemId,
  listing,
  values,
  mediaItems,
  removedRemoteIds,
  remoteMediaOrder,
  initialRemoteOrder,
}: UseEditListingDerivedParams) {
  /* ── ownership ── */
  const currentUser = useStore((s) => s.currentUser);
  const isOwner = useMemo(() => {
    if (!listing || !currentUser) return false;
    return listing.sellerId === currentUser.id;
  }, [listing, currentUser]);

  /* ── dirty state ── */
  const hasChanges = useMemo(() => computeEditListingHasChanges(listing, values, {
    hasLocalItems: mediaItems.some((m) => m.source === 'local'),
    removedRemoteIds,
    remoteMediaOrder,
    initialRemoteOrder,
  }), [listing, values, mediaItems, removedRemoteIds, remoteMediaOrder, initialRemoteOrder]);

  /* ── category-aware completeness ── */
  const completeness = useMemo(
    () => evaluateListingCompleteness(buildEditListingPolicyValues(values, mediaItems)),
    [values, mediaItems],
  );
  const completenessLabel = useMemo(() => buildEditCompletenessLabel(completeness), [completeness]);
  const recommendedLabel = useMemo(() => buildEditRecommendedLabel(completeness), [completeness]);

  /* ── validation ── */
  const validate = useCallback(
    () => validateEditListingFields(values, mediaItems.length, completeness.missingRequired),
    [values, mediaItems, completeness],
  );

  /* ── discount ── */
  const { hasDiscount, discountPercent } = useMemo(
    () => computeEditDiscount(values.price, values.originalPrice),
    [values.price, values.originalPrice],
  );

  /* ── sold comparables for pricing guidance ── */
  const { listings: backendListings } = useBackendData();
  const soldComps = useSoldComps(backendListings, values.category || undefined, values.brand || undefined, itemId);
  const numericPrice = Number(sanitizeDecimalInput(values.price));
  const hasValidPrice = Number.isFinite(numericPrice) && numericPrice > 0;
  const priceVsMarket: PriceVsMarket = useMemo(
    () => computePriceVsMarket(soldComps, numericPrice, hasValidPrice),
    [soldComps, hasValidPrice, numericPrice],
  );

  /* ── listing status label ── */
  const listingStatusLabel = useMemo(
    () => resolveListingStatusLabel(listing?.status),
    [listing],
  );

  const isEditingRestricted = listing?.status === 'sold' || listing?.status === 'deleted' || !isOwner;

  return {
    currentUser,
    isOwner,
    hasChanges,
    completeness,
    completenessLabel,
    recommendedLabel,
    validate,
    hasDiscount,
    discountPercent,
    soldComps,
    numericPrice,
    hasValidPrice,
    priceVsMarket,
    listingStatusLabel,
    isEditingRestricted };
}
