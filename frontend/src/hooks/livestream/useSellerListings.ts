/**
 * useSellerListings — the seller's real active listings plus the ordered
 * lot selection for the broadcast setup phase.
 *
 * Owns:
 * - Active-listings load (real listingsApi — no demo lots)
 * - Selection toggle with order preserved by selection sequence
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useHaptic } from '../useHaptic';
import { fetchUserListingsFromApi, type ListingApiItem } from '../../services/listingsApi';

export function useSellerListings(userId: string | undefined) {
  const haptic = useHaptic();

  const [listings, setListings] = useState<ListingApiItem[] | null>(null);
  const [listingsLoading, setListingsLoading] = useState(true);
  const [listingsError, setListingsError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // ── Load the seller's active listings for lot selection ──
  const loadListings = useCallback(async () => {
    if (!userId) {
      setListings([]);
      setListingsLoading(false);
      return;
    }
    setListingsLoading(true);
    setListingsError(null);
    try {
      const res = await fetchUserListingsFromApi(userId, { status: 'active', limit: 50 });
      setListings(res.items ?? []);
    } catch (e) {
      setListingsError(e instanceof Error ? e.message : 'Could not load your listings');
    } finally {
      setListingsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadListings();
  }, [loadListings]);

  const toggleListing = useCallback((listingId: string) => {
    haptic.selection();
    setSelectedIds((prev) =>
      prev.includes(listingId) ? prev.filter((id) => id !== listingId) : [...prev, listingId]);
  }, [haptic]);

  const selectedListings = useMemo(
    () => (listings ?? []).filter((l) => selectedIds.includes(l.id)),
    [listings, selectedIds],
  );

  return {
    listings,
    listingsLoading,
    listingsError,
    loadListings,
    selectedIds,
    selectedListings,
    toggleListing };
}
