'use client';

/**
 * useOwnerBoards — the single board derivation for profile and saved
 * surfaces. Sources: fixture boards (boardsForOwner), the collections
 * query cache (session-created + live /collections boards), and
 * web-created moodboards (boardPrefs) — merged with the owner's persisted
 * edits: moodboard titles + item orders, collection item orders, board
 * privacy/cover picks. Archived boards stay off the list surfaces (the
 * detail route resolves them directly). Reads are hydration-gated so SSR
 * and the first client render agree before localStorage truth lands.
 */

import { useMemo } from 'react';
import { useCollectionEdits } from '@/lib/store/collectionEdits';
import { useMoodboardEdits } from '@/lib/store/moodboards';
import { useHydrated } from '@/lib/store/useStore';
import { useSession } from '@/lib/session/SessionProvider';
import { useUserCollections } from '@/lib/hooks/collections-queries';
import { boardsForOwner, type ProfileBoard } from './fixtures';
import { useBoardPrefs } from './boardPrefs';

export interface OwnerBoard extends ProfileBoard {
  /** Member-picked cover item (boardPrefs) — leads the collage. */
  coverItemId?: string | null;
}

export function useOwnerBoards(ownerId: string, includePrivate = false): OwnerBoard[] {
  const hydrated = useHydrated();
  const { user } = useSession();
  const moodboardEdits = useMoodboardEdits((s) => s.boards);
  const collectionEdits = useCollectionEdits((s) => s.boards);
  const boardPrefs = useBoardPrefs((s) => s.boards);
  const createdMoodboards = useBoardPrefs((s) => s.createdMoodboards);
  // The collections list only matters for the session member's own boards —
  // don't fire it for guests or when deriving someone else's profile.
  const { data: collections } = useUserCollections({ enabled: !!user });

  return useMemo(() => {
    const byId = new Map<string, OwnerBoard>();
    for (const b of boardsForOwner(ownerId, includePrivate)) byId.set(b.id, b);
    // Live + session-created collections resolve through the query cache —
    // the fixture arrays only know the seeded boards.
    if (ownerId === user?.id) {
      for (const c of collections ?? []) {
        if (!byId.has(c.id)) {
          byId.set(c.id, {
            id: c.id,
            ownerId,
            title: c.name,
            kind: 'collection',
            itemIds: c.itemIds,
            isPrivate: c.isPrivate,
            createdAt: c.createdAt,
          });
        }
      }
    }
    for (const b of createdMoodboards) {
      if (b.ownerId === ownerId && !byId.has(b.id)) byId.set(b.id, b);
    }

    return [...byId.values()]
      .map((b): OwnerBoard => {
        if (!hydrated) return b;
        const pref = boardPrefs[b.id];
        let next: OwnerBoard = pref?.coverItemId
          ? { ...b, coverItemId: pref.coverItemId }
          : b;
        if (b.kind === 'moodboard') {
          const edit = moodboardEdits[b.id];
          if (edit) {
            next = { ...next, title: edit.title ?? next.title, itemIds: edit.itemIds ?? next.itemIds };
          }
        } else {
          const edit = collectionEdits[b.id];
          if (edit?.itemIds) next = { ...next, itemIds: edit.itemIds };
        }
        if (pref?.isPrivate !== undefined) next = { ...next, isPrivate: pref.isPrivate };
        return next;
      })
      .filter((b) => (hydrated && boardPrefs[b.id]?.archived ? false : includePrivate || !b.isPrivate));
  }, [
    ownerId,
    includePrivate,
    hydrated,
    moodboardEdits,
    collectionEdits,
    boardPrefs,
    createdMoodboards,
    collections,
    user?.id,
  ]);
}
