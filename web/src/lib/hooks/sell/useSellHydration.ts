'use client';

/**
 * useSellHydration — manages target resolution for ?edit=<id> and ?draft=<id>
 * routes in SellFlow, as well as inventory retrieval for the edit picker.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { User } from '@/lib/contracts/domain';
import { DATA_MODE } from '@/lib/api/client';
import * as listingsService from '@/lib/api/services/listings';
import { MY_LISTINGS } from '@/lib/data/fixtures';
import { sellerDraftById } from '@/lib/data/fixtures-seller';
import { useMyListings } from '@/lib/hooks/queries';
import { useImportDrafts } from '@/components/catalogimport/useImportDrafts';

interface UseSellHydrationOptions {
  editId: string | null;
  draftParam: string | null;
  user: User | null;
  sessionLoading: boolean;
}

export function useSellHydration({
  editId,
  draftParam,
  user,
  sessionLoading,
}: UseSellHydrationOptions) {
  const importDrafts = useImportDrafts();
  const myListings = useMyListings();

  const editQuery = useQuery({
    queryKey: ['sell-edit-listing', editId],
    queryFn: ({ signal }) => listingsService.fetchListingById(editId ?? '', signal),
    enabled: DATA_MODE === 'live' && Boolean(editId),
  });

  const liveEditing = useMemo(() => {
    const listing = editQuery.data;
    if (!listing) return null;
    const terminal =
      listing.status === 'sold' ||
      listing.status === 'deleted' ||
      listing.status === 'removed' ||
      listing.isSold === true;
    if (terminal) return null;
    return user && listing.sellerId === user.id ? listing : null;
  }, [editQuery.data, user]);

  const editing = useMemo(() => {
    if (!editId) return null;
    if (DATA_MODE === 'live') return liveEditing;
    return (
      MY_LISTINGS.find((l) => l.id === editId && !l.isSold && l.status !== 'sold') ?? null
    );
  }, [editId, liveEditing]);

  const editLoading = Boolean(
    editId && DATA_MODE === 'live' && (editQuery.isLoading || sessionLoading),
  );
  const editNotFound = Boolean(editId && !editing && !editLoading);

  const draftListing = useMemo(() => {
    if (!draftParam || editId) return null;
    return (
      sellerDraftById(draftParam) ??
      (importDrafts.data ?? []).find((d) => d.id === draftParam) ??
      null
    );
  }, [draftParam, editId, importDrafts.data]);

  const draftLoading = Boolean(draftParam && !draftListing && importDrafts.isLoading);
  const draftNotFound = Boolean(draftParam && !draftListing && !importDrafts.isLoading);

  const ownListings = useMemo(
    () =>
      (DATA_MODE === 'live' ? (myListings.data ?? []) : (myListings.data ?? MY_LISTINGS)).filter(
        (l) => !l.isSold && l.status !== 'sold' && l.status !== 'deleted',
      ),
    [myListings.data],
  );

  return {
    editing,
    editLoading,
    editNotFound,
    draftListing,
    draftLoading,
    draftNotFound,
    ownListings,
    importDrafts,
  };
}
