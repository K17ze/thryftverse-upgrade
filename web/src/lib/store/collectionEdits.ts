'use client';

/**
 * Collection edits — persisted owner overlay for the /collection/[id]
 * manage surface, mirroring lib/store/moodboards.ts exactly: fixture
 * collections (COLLECTIONS + PROFILE_COLLECTIONS) stay read-only source
 * truth; every web edit lands here keyed by collection id as the full
 * effective itemIds order (add / remove / reorder). The list transforms
 * themselves are the moodboard helpers — one order grammar, reused.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { DATA_MODE } from '@/lib/api/client';

export interface CollectionOverlay {
  /** Effective ordered listing ids once edited; absent = fixture order. */
  itemIds?: string[];
  /** Renamed collection title — mirrors PATCH /collections/:id {name}. */
  title?: string;
  /** Description override — null clears, absent = fixture description. */
  description?: string | null;
}

interface CollectionEditsState {
  boards: Record<string, CollectionOverlay>;
  setCollectionItems: (collectionId: string, itemIds: string[]) => void;
  setCollectionMeta: (
    collectionId: string,
    meta: { title?: string; description?: string | null },
  ) => void;
}

export const useCollectionEdits = create<CollectionEditsState>()(
  persist(
    (set) => ({
      boards: {},
      setCollectionItems: (collectionId, itemIds) =>
        set((s) => ({
          boards: {
            ...s.boards,
            [collectionId]: { ...s.boards[collectionId], itemIds },
          },
        })),
      setCollectionMeta: (collectionId, meta) =>
        set((s) => ({
          boards: {
            ...s.boards,
            [collectionId]: { ...s.boards[collectionId], ...meta },
          },
        })),
    }),
    {
      name: 'thryftverse.web.collectionEdits',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ boards: s.boards }),
    },
  ),
);

// Order helpers live in the moodboards store — reuse keeps one grammar.
export {
  withoutItemIds,
  movedItem,
  itemMovedBefore,
  withItemsAdded,
} from './moodboards';

/**
 * Fixture-scoped overlay read — in live mode `/collections` is the truth
 * and membership/meta writes go through `useCollectionActions` (real
 * endpoints with revert), so the persisted overlay must never override a
 * live collection. Use this instead of `s.boards[id]` at merge sites.
 */
export function useCollectionOverlay(
  collectionId: string | null | undefined,
): CollectionOverlay | undefined {
  return useCollectionEdits((s) =>
    DATA_MODE === 'live' || !collectionId ? undefined : s.boards[collectionId],
  );
}
