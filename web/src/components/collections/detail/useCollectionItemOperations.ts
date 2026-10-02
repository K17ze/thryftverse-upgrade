import { useState } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import {
  withItemsAdded,
  withoutItemIds,
} from '@/lib/store/collectionEdits';
import type { UserCollection } from '@/lib/data/fixtures-collections';
import { LIVE, USER_COLLECTIONS_KEY } from './collectionDetailTypes';

export interface UseCollectionItemOperationsParams {
  id: string;
  itemIds: string[];
  queryClient: QueryClient;
  addItemsToCollection: (id: string, items: string[]) => Promise<unknown>;
  removeItemsFromCollection: (id: string, items: string[]) => Promise<unknown>;
  setCollectionItems: (id: string, items: string[]) => void;
  show: (
    message: string,
    tone?: 'info' | 'success' | 'error',
    action?: { label: string; onPress: () => void },
  ) => void;
  setEditing: (editing: boolean) => void;
}

export function useCollectionItemOperations({
  id,
  itemIds,
  queryClient,
  addItemsToCollection,
  removeItemsFromCollection,
  setCollectionItems,
  show,
  setEditing,
}: UseCollectionItemOperationsParams) {
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [importOpen, setImportOpen] = useState(false);

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

  return {
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
  };
}
