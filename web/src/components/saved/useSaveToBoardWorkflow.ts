'use client';

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/Toast';
import { useOwnerBoards, type OwnerBoard } from '@/components/profile/useOwnerBoards';
import { useBoardPrefs } from '@/components/profile/boardPrefs';
import { useCollectionEdits, withItemsAdded, withoutItemIds } from '@/lib/store/collectionEdits';
import { useMoodboardEdits } from '@/lib/store/moodboards';
import { useCollectionActions } from '@/lib/hooks/collections-queries';
import { useMoodboardActions } from '@/lib/hooks/moodboard-queries';
import { DATA_MODE } from '@/lib/api/client';
import { fetchMoodboard } from '@/lib/api/services/social';
import { useHydrated } from '@/lib/store/useStore';
import { useSession } from '@/lib/session/SessionProvider';
import type { UserCollection } from '@/lib/data/fixtures-collections';

const USER_COLLECTIONS_KEY = ['user-collections'] as const;
const LIVE = DATA_MODE === 'live';

export function useSaveToBoardWorkflow(
  itemId: string | null,
  onClose: () => void,
) {
  const { show } = useToast();
  const { user, isGuest } = useSession();
  const hydrated = useHydrated();
  const queryClient = useQueryClient();
  const overlays = useCollectionEdits((s) => s.boards);
  const setCollectionItems = useCollectionEdits((s) => s.setCollectionItems);
  const setBoardItems = useMoodboardEdits((s) => s.setBoardItems);
  const { createCollection, addItems, removeItems } = useCollectionActions();
  const {
    addItems: addMoodItems,
    removeItems: removeMoodItems,
  } = useMoodboardActions();
  const recents = useBoardPrefs((s) => s.recents);
  const markRecent = useBoardPrefs((s) => s.markRecent);

  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [creatingBusy, setCreatingBusy] = useState(false);

  const boards = useOwnerBoards(user?.id ?? '', true);

  const moodboardIds = useMemo(
    () => (LIVE ? boards.filter((b) => b.kind === 'moodboard').map((b) => b.id) : []),
    [boards],
  );
  const moodboardKey = useMemo(() => moodboardIds.join('\n'), [moodboardIds]);
  const moodboardDetails = useQuery({
    queryKey: ['moodboard-details', moodboardKey],
    enabled: LIVE && moodboardIds.length > 0,
    queryFn: async () => {
      const results = await Promise.allSettled(
        moodboardIds.map((id) => fetchMoodboard(id)),
      );
      const map: Record<
        string,
        { listingIds: string[]; rowIdByListingId: Record<string, string> }
      > = {};
      results.forEach((r, i) => {
        const wire = r.status === 'fulfilled' ? r.value : null;
        if (!wire) return;
        const listingIds: string[] = [];
        const rowIdByListingId: Record<string, string> = {};
        for (const item of wire.items) {
          if (item.listingId) {
            listingIds.push(item.listingId);
            rowIdByListingId[item.listingId] = item.id;
          }
        }
        map[moodboardIds[i]] = { listingIds, rowIdByListingId };
      });
      return map;
    },
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? boards.filter((b) => b.title.toLowerCase().includes(q)) : boards;
  }, [boards, query]);

  const recentBoards = useMemo(
    () =>
      query.trim()
        ? []
        : recents
            .map((id) => filtered.find((b) => b.id === id))
            .filter((b): b is OwnerBoard => !!b),
    [recents, filtered, query],
  );
  const restBoards = useMemo(
    () => filtered.filter((b) => !recentBoards.includes(b)),
    [filtered, recentBoards],
  );

  const collectionItems = (boardId: string, fallback: string[]): string[] => {
    const cached = queryClient
      .getQueryData<UserCollection[]>(USER_COLLECTIONS_KEY)
      ?.find((c) => c.id === boardId)?.itemIds;
    if (LIVE) return cached ?? fallback;
    return overlays[boardId]?.itemIds ?? cached ?? fallback;
  };

  const isOnBoard = (board: OwnerBoard): boolean => {
    if (!itemId) return false;
    if (board.kind === 'moodboard' && LIVE) {
      return moodboardDetails.data?.[board.id]?.listingIds.includes(itemId) ?? false;
    }
    const current =
      board.kind === 'collection'
        ? collectionItems(board.id, board.itemIds)
        : board.itemIds;
    return current.includes(itemId);
  };

  const toggle = async (board: OwnerBoard) => {
    if (!itemId) return;
    markRecent(board.id);
    const wasOn = isOnBoard(board);
    const savedLabel = `Saved to “${board.title}”`;
    const removedLabel = `Removed from “${board.title}”`;

    if (LIVE) {
      try {
        if (board.kind === 'collection') {
          if (wasOn) await removeItems(board.id, [itemId]);
          else await addItems(board.id, [itemId]);
        } else {
          const rowId = moodboardDetails.data?.[board.id]?.rowIdByListingId[itemId];
          if (wasOn && rowId) await removeMoodItems(board.id, [itemId], [rowId]);
          else if (!wasOn) await addMoodItems(board.id, [itemId]);
          else {
            show('Board still loading — try again in a moment', 'info');
            return;
          }
        }
        void queryClient.invalidateQueries({ queryKey: ['moodboard-details', moodboardKey] });
        show(wasOn ? removedLabel : savedLabel, 'info');
      } catch {
        show(`Couldn't update “${board.title}” — try again`, 'error');
      }
      return;
    }

    const current =
      board.kind === 'collection'
        ? collectionItems(board.id, board.itemIds)
        : board.itemIds;
    const onBoard = current.includes(itemId);
    const next = onBoard
      ? withoutItemIds(current, new Set([itemId]))
      : withItemsAdded(current, [itemId]);

    if (board.kind === 'collection') {
      setCollectionItems(board.id, next);
      queryClient.setQueryData<UserCollection[]>(USER_COLLECTIONS_KEY, (old) =>
        old?.map((c) => (c.id === board.id ? { ...c, itemIds: [...next] } : c)),
      );
    } else {
      setBoardItems(board.id, next);
    }
    show(onBoard ? removedLabel : savedLabel, 'info');
  };

  const createBoard = async () => {
    const name = newTitle.trim();
    if (!name || creatingBusy) return;
    setCreatingBusy(true);
    try {
      const created = await createCollection({ name, isPrivate: false });
      if (itemId) {
        if (LIVE) {
          await addItems(created.id, [itemId]);
        } else {
          setCollectionItems(created.id, [itemId]);
          queryClient.setQueryData<UserCollection[]>(USER_COLLECTIONS_KEY, (old) =>
            old?.map((c) => (c.id === created.id ? { ...c, itemIds: [itemId] } : c)),
          );
        }
      }
      markRecent(created.id);
      show(`Saved to “${created.name}”`, 'success');
      setCreating(false);
      setNewTitle('');
    } catch {
      show('Could not create the board', 'error');
    } finally {
      setCreatingBusy(false);
    }
  };

  const close = () => {
    setQuery('');
    setCreating(false);
    setNewTitle('');
    onClose();
  };

  return {
    user,
    isGuest,
    hydrated,
    query,
    setQuery,
    creating,
    setCreating,
    newTitle,
    setNewTitle,
    creatingBusy,
    filtered,
    recentBoards,
    restBoards,
    collectionItems,
    isOnBoard,
    moodboardDetails,
    toggle,
    createBoard,
    close,
  };
}
