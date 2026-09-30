'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/Toast';
import { useShare } from '@/components/profile/useShare';
import {
  COLLECTIONS,
  PROFILE_COLLECTIONS,
  collectionById,
  listingsForIds,
} from '@/components/profile/fixtures';
import { useBoardCoverThumbs } from '@/components/profile/boardMedia';
import { useBoardPrefs } from '@/components/profile/boardPrefs';
import { useCollectionActions } from '@/lib/hooks/collections-queries';
import { useSellerListings, useUser } from '@/lib/hooks/queries';
import { useSession } from '@/lib/session/SessionProvider';
import { useHydrated, useStore } from '@/lib/store/useStore';
import {
  itemMovedBefore,
  movedItem,
  useCollectionEdits,
  useCollectionOverlay,
  withItemsAdded,
  withoutItemIds,
} from '@/lib/store/collectionEdits';
import {
  USER_COLLECTION_SEED,
  type UserCollection,
} from '@/lib/data/fixtures-collections';
import { userById } from '@/lib/data/fixtures';
import { DATA_MODE } from '@/lib/api/client';
import * as collectionsService from '@/lib/api/services/collections';
import { fetchListingById } from '@/lib/api/services/listings';
import {
  mapListingToDiscoverySummary,
  type DiscoveryFeedUnit,
  type DiscoveryListingSummary,
  type User,
} from '@/lib/contracts/domain';
import { timeAgo } from '@/lib/utils/format';

const USER_COLLECTIONS_KEY = ['user-collections'] as const;
const LIVE = DATA_MODE === 'live';
const EMPTY_IDS: string[] = [];

export interface ResolvedCollection {
  id: string;
  title: string;
  itemIds: string[];
  owner?: User | null;
  ownerId?: string;
  isPrivate?: boolean;
  description?: string | null;
  meta?: string;
  editable: boolean;
}

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

  const resolved = useMemo<ResolvedCollection | null>(() => {
    if (isCloset) {
      if (loading || !closetOwner) return null;
      return {
        id,
        title: `${closetOwner.username}'s closet`,
        itemIds: (closetItems ?? []).map((l) => l.id),
        owner: closetOwner,
        editable: false,
      };
    }
    if (LIVE) {
      const board = boardQuery.data;
      if (!board || !me) return null;
      return {
        id,
        title: edits?.title ?? board.name,
        description:
          edits && 'description' in edits ? edits.description : board.description,
        itemIds: [...board.itemIds],
        owner: me,
        ownerId: me.id,
        isPrivate:
          (hydrated ? boardPref?.isPrivate : undefined) ?? board.isPrivate,
        meta: board.updatedAt ? `Updated ${timeAgo(board.updatedAt)}` : undefined,
        editable: true,
      };
    }
    const c = collectionById(id);
    if (!c) return null;
    const ownerId = 'ownerId' in c ? c.ownerId : 'me';
    const uc = (
      queryClient.getQueryData<UserCollection[]>(USER_COLLECTIONS_KEY) ??
      USER_COLLECTION_SEED
    ).find((x) => x.id === c.id);
    const isPrivate =
      (hydrated ? boardPref?.isPrivate : undefined) ??
      ('isPrivate' in c ? c.isPrivate : undefined) ??
      uc?.isPrivate ??
      false;
    return {
      id,
      title: edits?.title ?? c.title,
      description:
        edits && 'description' in edits ? edits.description : uc?.description ?? null,
      itemIds: [...c.itemIds],
      owner: ownerId && ownerId !== 'me' ? userById(ownerId) : undefined,
      ownerId,
      isPrivate,
      meta: c.createdAt ? `Updated ${timeAgo(c.createdAt)}` : undefined,
      editable: !!me && ownerId === me.id,
    };
  }, [
    id,
    isCloset,
    loading,
    closetOwner,
    closetItems,
    me,
    queryClient,
    hydrated,
    boardPref?.isPrivate,
    edits,
    boardQuery.data,
  ]);

  const itemIds = useMemo(
    () => edits?.itemIds ?? resolved?.itemIds ?? [],
    [edits?.itemIds, resolved],
  );

  const coverItemId = hydrated ? boardPref?.coverItemId : undefined;
  const heroThumbs = useBoardCoverThumbs(
    isCloset ? EMPTY_IDS : itemIds,
    4,
    undefined,
    coverItemId,
  );

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
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [importOpen, setImportOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [coverOpen, setCoverOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

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

  const commitItems = async (next: string[]): Promise<boolean> => {
    const before = new Set(itemIds);
    const after = new Set(next);
    const added = next.filter((x) => !before.has(x));
    const removed = itemIds.filter((x) => !after.has(x));
    try {
      if (added.length > 0) await addItemsToCollection(id, added);
      if (removed.length > 0) await removeItemsFromCollection(id, removed);
      if (added.length === 0 && removed.length === 0) {
        if (!LIVE) {
          setCollectionItems(id, next);
          queryClient.setQueryData<UserCollection[]>(USER_COLLECTIONS_KEY, (old) =>
            old?.map((c) => (c.id === id ? { ...c, itemIds: [...next] } : c)),
          );
        }
      } else if (!LIVE) {
        setCollectionItems(id, next);
        queryClient.setQueryData<UserCollection[]>(USER_COLLECTIONS_KEY, (old) =>
          old?.map((c) => (c.id === id ? { ...c, itemIds: [...next] } : c)),
        );
      } else {
        void queryClient.invalidateQueries({ queryKey: ['collection', id] });
      }
      return true;
    } catch {
      show("Couldn't update this collection — try again", 'error');
      return false;
    }
  };

  const stopEditing = () => {
    setEditing(false);
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const toggleSelect = (itemId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const removeWithUndo = (ids: string[]) => {
    if (ids.length === 0) return;
    const orderBefore = itemIds;
    const next = withoutItemIds(itemIds, new Set(ids));
    setSelectedIds((prev) => {
      const cleared = new Set(prev);
      for (const x of ids) cleared.delete(x);
      return cleared;
    });
    void (async () => {
      const ok = await commitItems(next);
      if (!ok) return;
      show(
        ids.length === 1 ? 'Removed 1 item' : `Removed ${ids.length} items`,
        'info',
        { label: 'Undo', onPress: () => void commitItems(orderBefore) },
      );
    })();
  };

  const removeSelected = () => {
    removeWithUndo([...selectedIds]);
    setSelectMode(false);
  };

  const addItems = (ids: string[]) => {
    setImportOpen(false);
    const fresh = ids.filter((x) => !itemIds.includes(x));
    if (fresh.length === 0) {
      show('Already in this collection', 'info');
      return;
    }
    void (async () => {
      const ok = await commitItems(withItemsAdded(itemIds, fresh));
      if (ok) {
        show(
          fresh.length === 1 ? 'Added 1 item' : `Added ${fresh.length} items`,
          'success',
        );
      }
    })();
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
  const showHero = !isCloset && heroThumbs.length > 0;

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
    setBoardCover,
    setBoardArchived,
  };
}
