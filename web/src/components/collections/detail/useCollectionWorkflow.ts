'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/Toast';
import { useShare } from '@/components/profile/useShare';
import {
  COLLECTIONS,
  PROFILE_COLLECTIONS,
  listingsForIds,
} from '@/components/profile/fixtures';
import { useBoardPrefs } from '@/components/profile/boardPrefs';
import { useCollectionActions } from '@/lib/hooks/collections-queries';
import { useSellerListings, useUser } from '@/lib/hooks/queries';
import { useSession } from '@/lib/session/SessionProvider';
import { useHydrated, useStore } from '@/lib/store/useStore';
import {
  useCollectionEdits,
  useCollectionOverlay,
} from '@/lib/store/collectionEdits';
import * as collectionsService from '@/lib/api/services/collections';
import { fetchListingById } from '@/lib/api/services/listings';
import {
  mapListingToDiscoverySummary,
  type DiscoveryFeedUnit,
  type DiscoveryListingSummary,
} from '@/lib/contracts/domain';
import {
  LIVE,
  type ResolvedCollection,
} from './collectionDetailTypes';
import { useCollectionResolution } from './useCollectionResolution';
import { useCollectionItemOperations } from './useCollectionItemOperations';

export type { ResolvedCollection };

export function useCollectionWorkflow() {
  const params = useParams();
  const router = useRouter();
  const { show } = useToast();
  const share = useShare();
  const { user: me, sessionLoading } = useSession();
  const hydrated = useHydrated();
  const queryClient = useQueryClient();

  const id = String(params.id ?? '');
  const isCloset = id.startsWith('closet-');
  const closetId = isCloset ? id.slice('closet-'.length) : '';

  const boardPref = useBoardPrefs((s) => s.boards[id]);
  const setBoardCover = useBoardPrefs((s) => s.setCover);
  const setBoardArchived = useBoardPrefs((s) => s.setArchived);
  const setBoardPrivate = useBoardPrefs((s) => s.setPrivate);

  const {
    updateCollection,
    addItems: addItemsToCollection,
    removeItems: removeItemsFromCollection,
    deleteCollection: deleteCollectionAction,
  } = useCollectionActions();

  const {
    data: closetOwner,
    isLoading: ownerLoading,
    isError: ownerError,
    refetch: refetchOwner,
  } = useUser(closetId);
  const {
    data: closetItems,
    isLoading: closetItemsLoading,
    isError: itemsError,
    refetch: refetchItems,
  } = useSellerListings(closetId);

  const boardQuery = useQuery({
    queryKey: ['collection', id],
    queryFn: ({ signal }) => collectionsService.getCollection(id, signal),
    enabled: LIVE && !isCloset && Boolean(me),
    retry: false,
  });

  const loading =
    (isCloset && (ownerLoading || closetItemsLoading)) ||
    (LIVE && !isCloset && (sessionLoading || (Boolean(me) && boardQuery.isLoading)));

  const overlay = useCollectionOverlay(id);
  const setCollectionItems = useCollectionEdits((s) => s.setCollectionItems);
  const setCollectionMeta = useCollectionEdits((s) => s.setCollectionMeta);
  const edits = hydrated ? overlay : undefined;

  const {
    resolved,
    itemIds,
    coverItemId,
    heroThumbs,
    showHero,
  } = useCollectionResolution({
    id,
    isCloset,
    me,
    hydrated,
    queryClient,
    boardPref,
    closetOwner,
    closetItems,
    loading,
    boardQueryData: boardQuery.data,
    edits,
  });

  const boardItemsQuery = useQuery({
    queryKey: ['collection-items', id, itemIds.join(',')],
    queryFn: async ({ signal }) => {
      const resolvedListings = await Promise.all(
        itemIds.map((lid) => fetchListingById(lid, signal).catch(() => null)),
      );
      return resolvedListings.filter((l): l is NonNullable<typeof l> => l !== null);
    },
    enabled: LIVE && !isCloset && itemIds.length > 0,
    staleTime: 60_000,
  });

  const items = useMemo(() => {
    if (isCloset) return closetItems ?? [];
    if (LIVE) return boardItemsQuery.data ?? [];
    return listingsForIds(itemIds);
  }, [isCloset, closetItems, itemIds, boardItemsQuery.data]);

  const summaries = useMemo<DiscoveryListingSummary[]>(
    () => items.map(mapListingToDiscoverySummary),
    [items],
  );

  const units = useMemo<DiscoveryFeedUnit[]>(
    () =>
      summaries.map((l) => ({
        type: 'listing',
        id: `col-${id}-${l.id}`,
        listing: l,
      })),
    [summaries, id],
  );

  const [editing, setEditing] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [coverOpen, setCoverOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const {
    selectMode,
    setSelectMode,
    selectedIds,
    setSelectedIds,
    importOpen,
    setImportOpen,
    commitItems,
    stopEditing,
    toggleSelect,
    removeWithUndo,
    removeSelected,
    addItems,
  } = useCollectionItemOperations({
    id,
    itemIds,
    queryClient,
    addItemsToCollection,
    removeItemsFromCollection,
    setCollectionItems,
    show,
    setEditing,
  });

  const wishlist = useStore((s) => s.wishlist);
  const saved = useStore((s) => s.saved);
  const pool = useMemo(() => {
    const onBoard = new Set(itemIds);
    return [...new Set([...saved, ...wishlist])].filter((x) => !onBoard.has(x));
  }, [saved, wishlist, itemIds]);

  const candidatesQuery = useQuery({
    queryKey: ['collection-candidates', id, pool.join(',')],
    queryFn: async ({ signal }) => {
      const rows = await Promise.all(
        pool.map((lid) => fetchListingById(lid, signal).catch(() => null)),
      );
      return rows
        .filter((l): l is NonNullable<typeof l> => l !== null)
        .map(mapListingToDiscoverySummary);
    },
    enabled: LIVE && importOpen && pool.length > 0,
    staleTime: 60_000,
  });
  const candidates = useMemo<DiscoveryListingSummary[]>(() => {
    if (LIVE) return candidatesQuery.data ?? [];
    return listingsForIds(pool).map(mapListingToDiscoverySummary);
  }, [pool, candidatesQuery.data]);

  const shareCollection = () => {
    if (!resolved) return;
    share({
      url: `${window.location.origin}/collection/${id}`,
      title: resolved.title,
      copiedLabel: 'Collection link copied',
    });
  };

  const deleteCollection = async () => {
    try {
      await deleteCollectionAction(id);
    } catch {
      show("Couldn't delete the collection — try again", 'error');
      return;
    }
    if (!LIVE) {
      for (const arr of [COLLECTIONS, PROFILE_COLLECTIONS]) {
        const i = arr.findIndex((c) => c.id === id);
        if (i >= 0) arr.splice(i, 1);
      }
    }
    show('Collection deleted', 'info');
    router.push('/collections');
  };

  const togglePrivacy = () => {
    if (!resolved) return;
    const next = !resolved.isPrivate;
    setOptionsOpen(false);
    void (async () => {
      try {
        await updateCollection(id, { isPrivate: next });
      } catch {
        show("Couldn't update privacy — try again", 'error');
        return;
      }
      setBoardPrivate(id, next);
      show(next ? 'Board is now private' : 'Board is now public', 'info');
    })();
  };

  const saveDetails = async (next: {
    title: string;
    description: string | null;
    isPrivate: boolean;
  }) => {
    await updateCollection(id, {
      name: next.title,
      description: next.description,
      isPrivate: next.isPrivate,
    });
    setCollectionMeta(id, { title: next.title, description: next.description });
    setBoardPrivate(id, next.isPrivate);
    void queryClient.invalidateQueries({ queryKey: ['collection', id] });
  };

  const isEditing = (resolved?.editable ?? false) && editing;
  const viewerOwns = !!me && resolved?.ownerId === me.id;
  const archived = hydrated && boardPref?.archived === true;

  return {
    id,
    isCloset,
    loading,
    ownerError,
    itemsError,
    refetchOwner,
    refetchItems,
    boardQuery,
    resolved,
    viewerOwns,
    isEditing,
    editing,
    setEditing,
    selectMode,
    setSelectMode,
    selectedIds,
    toggleSelect,
    removeSelected,
    itemIds,
    items,
    summaries,
    units,
    heroThumbs,
    showHero,
    archived,
    importOpen,
    setImportOpen,
    optionsOpen,
    setOptionsOpen,
    coverOpen,
    setCoverOpen,
    detailsOpen,
    setDetailsOpen,
    confirmDelete,
    setConfirmDelete,
    candidates,
    candidatesLoading: candidatesQuery.isLoading,
    shareCollection,
    deleteCollection,
    commitItems,
    stopEditing,
    removeWithUndo,
    addItems,
    togglePrivacy,
    saveDetails,
    show,
    coverItemId,
    setSelectedIds,
    setBoardCover,
    setBoardArchived,
  };
}
