'use client';

/**
 * useOwnerBoards — the single board derivation for profile and saved
 * surfaces. Sources: fixture boards (boardsForOwner), the collections
 * query cache (session-created + live /collections boards), the session
 * member's live moodboards (GET /me/moodboards — the same cache the
 * /moodboards hub reads), and web-created moodboards (boardPrefs) —
 * merged with the owner's persisted edits: moodboard titles + item
 * orders, collection item orders, board privacy/cover picks.
 *
 * Mode honesty: the persisted edit overlays are fixture-mode truth — in
 * live mode they never override a server board (the overlay reads here
 * are scoped out). Live boards resolve from the query caches; a live
 * moodboard's itemIds stay empty (the list wire carries counts/thumbs,
 * not membership) so collages fall back to the board's real cover/thumbs.
 * Reads are hydration-gated so SSR and the first client render agree
 * before localStorage truth lands — createdMoodboards included.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useCollectionEdits, type CollectionOverlay } from '@/lib/store/collectionEdits';
import { useMoodboardEdits, type MoodboardOverlay } from '@/lib/store/moodboards';
import { useHydrated } from '@/lib/store/useStore';
import { useSession } from '@/lib/session/SessionProvider';
import { DATA_MODE } from '@/lib/api/client';
import { fetchMyMoodboards } from '@/lib/api/services/social';
import { useUserCollections } from '@/lib/hooks/collections-queries';
import { boardsForOwner, type ProfileBoard } from './fixtures';
import { useBoardPrefs } from './boardPrefs';

export interface OwnerBoard extends ProfileBoard {
  /** Member-picked cover item (boardPrefs) — leads the collage. */
  coverItemId?: string | null;
  /** Live wire item count — the list wire carries counts/thumbs, not
   *  membership, so moodboard cards render this instead of
   *  itemIds.length (which stays empty for live boards). */
  itemCount?: number;
  /** Live wire item thumbs — real item media for the card collage. */
  thumbs?: string[];
}

const LIVE = DATA_MODE === 'live';
const EMPTY_MOODBOARD_EDITS: Record<string, MoodboardOverlay> = {};
const EMPTY_COLLECTION_EDITS: Record<string, CollectionOverlay> = {};

/** The session member's live moodboards — the same query key the
 *  /moodboards hub uses, so both surfaces share one cache. */
function useMyLiveMoodboards(enabled: boolean) {
  return useQuery({
    queryKey: ['moodboards', 'mine'],
    queryFn: ({ signal }) => fetchMyMoodboards(signal),
    enabled,
    staleTime: 60_000,
  });
}

export function useOwnerBoards(ownerId: string, includePrivate = false): OwnerBoard[] {
  const hydrated = useHydrated();
  const { user } = useSession();
  // Fixture-scoped overlay reads — in live mode the persisted overlays
  // never override server boards (the detail surface's optimistic mirror
  // is its own view; this grid shows server truth).
  const moodboardEdits = useMoodboardEdits((s) =>
    LIVE ? EMPTY_MOODBOARD_EDITS : s.boards,
  );
  const collectionEdits = useCollectionEdits((s) =>
    LIVE ? EMPTY_COLLECTION_EDITS : s.boards,
  );
  const boardPrefs = useBoardPrefs((s) => s.boards);
  const createdMoodboards = useBoardPrefs((s) => s.createdMoodboards);
  // The collections list only matters for the session member's own boards —
  // don't fire it for guests or when deriving someone else's profile.
  const { data: collections } = useUserCollections({ enabled: !!user });
  // Live moodboards resolve only for the session member's own profile.
  const { data: liveMoodboards } = useMyLiveMoodboards(LIVE && !!user && ownerId === user.id);

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
      // Live moodboards — the list wire carries title/cover/thumbs/counts,
      // not membership, so itemIds stay empty and cards render the wire's
      // itemCount + thumbs instead of a fabricated "0 items".
      for (const b of liveMoodboards ?? []) {
        if (byId.has(b.id)) continue;
        byId.set(b.id, {
          id: b.id,
          ownerId,
          title: b.title,
          kind: 'moodboard',
          itemIds: [],
          itemCount: b.itemCount ?? undefined,
          thumbs: b.thumbs,
          coverUri: b.coverUri || undefined,
          isPrivate: b.isPublic !== true,
          createdAt: b.createdAt,
        });
      }
    }
    // Web-created moodboards are persisted account truth — same hydration
    // gate as the edit merges below, so SSR and the first client render
    // agree before localStorage lands them.
    if (hydrated) {
      for (const b of createdMoodboards) {
        if (b.ownerId === ownerId && !byId.has(b.id)) byId.set(b.id, b);
      }
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
    liveMoodboards,
    user?.id,
  ]);
}
