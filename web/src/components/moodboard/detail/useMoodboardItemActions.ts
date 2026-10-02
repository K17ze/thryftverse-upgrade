import { useState } from 'react';
import { DATA_MODE } from '@/lib/api/client';
import type { useMoodboardActions } from '@/lib/hooks/moodboard-queries';
import { withItemsAdded, withoutItemIds } from '@/lib/store/moodboards';

export interface UseMoodboardItemActionsParams {
  board?: { id: string } | null;
  itemIds: string[];
  rowIdByListing: Record<string, string>;
  trackLive: (promise: Promise<void>) => Promise<void>;
  boardActions: ReturnType<typeof useMoodboardActions>;
  setBoardItems: (boardId: string, items: string[]) => void;
  show: (
    message: string,
    tone?: 'info' | 'success' | 'error',
    action?: { label: string; onPress: () => void },
  ) => void;
}

export function useMoodboardItemActions({
  board,
  itemIds,
  rowIdByListing,
  trackLive,
  boardActions,
  setBoardItems,
  show,
}: UseMoodboardItemActionsParams) {
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [importOpen, setImportOpen] = useState(false);

  const toggleSelect = (itemId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const removeWithUndo = (ids: string[]) => {
    if (!board || ids.length === 0) return;
    const orderBefore = itemIds;
    const rowIds = ids
      .map((listingId) => rowIdByListing[listingId])
      .filter((v): v is string => Boolean(v));
    if (DATA_MODE === 'live') {
      void trackLive(boardActions.removeItems(board.id, ids, rowIds))
        .then(() =>
          show(
            ids.length === 1 ? 'Removed 1 item' : `Removed ${ids.length} items`,
            'info',
            {
              label: 'Undo',
              onPress: () => {
                void trackLive(boardActions.addItems(board.id, ids)).catch(() =>
                  show("Couldn't restore them — try again", 'error'),
                );
              },
            },
          ),
        )
        .catch(() => show("Couldn't remove those — try again", 'error'));
    } else {
      setBoardItems(board.id, withoutItemIds(itemIds, new Set(ids)));
      show(
        ids.length === 1 ? 'Removed 1 item' : `Removed ${ids.length} items`,
        'info',
        { label: 'Undo', onPress: () => setBoardItems(board.id, orderBefore) },
      );
    }
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const x of ids) next.delete(x);
      return next;
    });
  };

  const removeSelected = () => {
    removeWithUndo([...selectedIds]);
    setSelectMode(false);
  };

  const addItems = (ids: string[]) => {
    if (!board) return;
    setImportOpen(false);
    if (DATA_MODE === 'live') {
      void trackLive(boardActions.addItems(board.id, ids))
        .then(() =>
          show(
            ids.length === 1 ? 'Added 1 item' : `Added ${ids.length} items`,
            'success',
          ),
        )
        .catch(() => show("Couldn't add those — try again", 'error'));
      return;
    }
    const next = withItemsAdded(itemIds, ids);
    setBoardItems(board.id, next);
    show(
      next.length === itemIds.length
        ? 'Already on this board'
        : ids.length === 1
          ? 'Added 1 item'
          : `Added ${ids.length} items`,
      'success',
    );
  };

  return {
    selectMode,
    setSelectMode,
    selectedIds,
    setSelectedIds,
    importOpen,
    setImportOpen,
    toggleSelect,
    removeWithUndo,
    removeSelected,
    addItems,
  };
}
