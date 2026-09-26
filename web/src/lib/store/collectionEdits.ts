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

export interface CollectionOverlay {
  /** Effective ordered listing ids once edited; absent = fixture order. */
  itemIds?: string[];
}

interface CollectionEditsState {
  boards: Record<string, CollectionOverlay>;
  setCollectionItems: (collectionId: string, itemIds: string[]) => void;
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
