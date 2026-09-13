import { useCallback, useMemo, useState } from 'react';
import { useHaptic } from '../useHaptic';
import { useToast } from '../../context/ToastContext';
import { useAppTranslation } from '../../i18n/useAppTranslation';
import { parseApiError } from '../../lib/apiClient';
import { setFeaturedListings } from '../../services/storefrontApi';
import type { Listing } from '../../domain';
import type { ShopRailItem } from '../../components/profile/ShopRail';
import { MAX_FEATURED } from './constants';
import { orderOwnedListings, toShopRailItems } from '../../components/myprofile/myProfileViewModels';

/**
 * G4: Profile grid drag-reorder. Sellers can pin/unpin listings to their shop
 * grid, reorder pinned listings, and save the order to the backend via
 * setFeaturedListings. Extracted from MyProfileScreen — ordering semantics,
 * haptics, toasts and save/discard flow are verbatim.
 */
export function useMyProfileReorder(listings: Listing[], profileUserId: string | null) {
  const { show } = useToast();
  const haptic = useHaptic();
  const { t: tt } = useAppTranslation('myProfile');

  const [isReorderMode, setIsReorderMode] = useState(false);
  const [overrideFeaturedIds, setOverrideFeaturedIds] = useState<string[] | null>(null);
  const [isSavingReorder, setIsSavingReorder] = useState(false);

  // Pinned/featured listings appear first in the Shop grid (2026 pattern).
  // When an override order is active (reorder mode), sort by the override
  // rank; otherwise fall back to the backend `featured` flag with a stable
  // sort that preserves backend ordering for non-featured items.
  const allOwnedListings = useMemo(
    () => orderOwnedListings(listings, profileUserId, overrideFeaturedIds),
    [listings, profileUserId, overrideFeaturedIds],
  );

  // When overrideFeaturedIds is set, featured state is derived from the
  // override array; otherwise it falls back to the backend `featured` flag.
  const isItemFeatured = useCallback(
    (id: string, defaultFeatured: boolean | null | undefined): boolean => {
      if (overrideFeaturedIds) return overrideFeaturedIds.includes(id);
      return defaultFeatured === true;
    },
    [overrideFeaturedIds],
  );

  // Returns the 1-based rank position of a featured item, or 0 if not featured.
  const getItemFeaturedRank = useCallback(
    (id: string, defaultFeatured: boolean | null | undefined): number => {
      if (overrideFeaturedIds) {
        const idx = overrideFeaturedIds.indexOf(id);
        return idx === -1 ? 0 : idx + 1;
      }
      return defaultFeatured === true ? 1 : 0;
    },
    [overrideFeaturedIds],
  );

  const handleTogglePin = useCallback(
    (listingId: string) => {
      haptic.light();
      const current = overrideFeaturedIds
        ?? allOwnedListings.filter((l) => l.featured === true).map((l) => l.id);
      if (current.includes(listingId)) {
        setOverrideFeaturedIds(current.filter((id) => id !== listingId));
        show(tt('listings.unpinned'), 'success');
      } else {
        if (current.length >= MAX_FEATURED) {
          haptic.medium();
          show(tt('listings.featuredMaxReached'), 'error');
          return;
        }
        setOverrideFeaturedIds([...current, listingId]);
        show(tt('listings.pinned'), 'success');
      }
    },
    [overrideFeaturedIds, allOwnedListings, haptic, show, tt],
  );

  const handleShiftFeatured = useCallback(
    (listingId: string, direction: -1 | 1) => {
      if (!overrideFeaturedIds) return;
      const idx = overrideFeaturedIds.indexOf(listingId);
      if (idx === -1) return;
      const target = idx + direction;
      if (target < 0 || target >= overrideFeaturedIds.length) return;
      haptic.light();
      const next = [...overrideFeaturedIds];
      [next[idx], next[target]] = [next[target], next[idx]];
      setOverrideFeaturedIds(next);
    },
    [overrideFeaturedIds, haptic],
  );

  const handleSaveReorder = useCallback(async () => {
    if (!overrideFeaturedIds) {
      setIsReorderMode(false);
      return;
    }
    setIsSavingReorder(true);
    try {
      await setFeaturedListings(overrideFeaturedIds);
      haptic.light();
      show(tt('listings.orderSaved'), 'success');
      setOverrideFeaturedIds(null);
      setIsReorderMode(false);
    } catch (err) {
      const parsed = parseApiError(err, tt('listings.orderSaveFailed'));
      show(parsed.message, 'error');
    } finally {
      setIsSavingReorder(false);
    }
  }, [overrideFeaturedIds, haptic, show, tt]);

  const handleToggleReorderMode = useCallback(() => {
    if (isReorderMode) {
      // Exit without saving — discard override.
      haptic.light();
      setOverrideFeaturedIds(null);
      setIsReorderMode(false);
    } else {
      haptic.light();
      // Seed override from current featured state so shifts are visible.
      const currentFeatured = allOwnedListings
        .filter((l) => l.featured === true)
        .map((l) => l.id);
      setOverrideFeaturedIds(currentFeatured.length > 0 ? currentFeatured : []);
      setIsReorderMode(true);
    }
  }, [isReorderMode, allOwnedListings, haptic]);

  // Curated shop window — featured listings for the ShopRail. The rail renders
  // only when featured items exist (ShopRail returns null for empty input),
  // keeping the first viewport truthful — no fabricated placeholder content.
  const shopRailItems = useMemo<ShopRailItem[]>(
    () => toShopRailItems(allOwnedListings, isItemFeatured),
    [allOwnedListings, isItemFeatured],
  );

  return {
    allOwnedListings,
    shopRailItems,
    isReorderMode,
    isSavingReorder,
    isItemFeatured,
    getItemFeaturedRank,
    handleTogglePin,
    handleShiftFeatured,
    handleSaveReorder,
    handleToggleReorderMode,
  };
}
