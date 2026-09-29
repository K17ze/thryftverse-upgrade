'use client';

/**
 * Collections session state — the react-query cache doubles as the session
 * collection store in fixture mode, mirroring the mobile store's collections
 * slice. Live mode reads/writes `/collections` on the shared backend.
 *
 * Write honesty: every live mutation is optimistic with revert-on-failure —
 * the cache moves now, a failed write snaps back and the error is rethrown
 * so the caller toasts the real outcome. Nothing here swallows: a failed
 * rename/privacy/membership/delete must never read as success.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ensureCollectionResolvable,
  USER_COLLECTION_SEED,
  type UserCollection,
} from '@/lib/data/fixtures-collections';
import { patchCollectionFixture } from '@/components/profile/fixtures';
import { DATA_MODE } from '@/lib/api/client';
import * as collectionsService from '@/lib/api/services/collections';
import { useCollectionEdits, withItemsAdded, withoutItemIds } from '@/lib/store/collectionEdits';

const COLLECTIONS_KEY = ['user-collections'] as const;

const tick = (ms = 360) => new Promise((r) => setTimeout(r, ms));

function mapApiCollection(c: collectionsService.ApiCollection): UserCollection {
  return {
    id: c.id,
    name: c.name,
    description: c.description,
    isPrivate: c.isPrivate,
    itemIds: c.itemIds,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

async function fetchCollections(): Promise<UserCollection[]> {
  if (DATA_MODE === 'live') {
    const collections = await collectionsService.listCollections();
    return collections.map(mapApiCollection);
  }
  await tick();
  return USER_COLLECTION_SEED.map((c) => ({ ...c, itemIds: [...c.itemIds] }));
}

/** Session-scoped collection list — create/update persists until reload
 *  (fixture) or until the backend row changes (live). */
export function useUserCollections(opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: COLLECTIONS_KEY,
    queryFn: fetchCollections,
    enabled: opts?.enabled,
    staleTime: DATA_MODE === 'live' ? undefined : Infinity,
    gcTime: DATA_MODE === 'live' ? undefined : Infinity,
  });
}

export interface NewCollectionInput {
  name: string;
  isPrivate: boolean;
}

export interface CollectionPatch {
  name?: string;
  description?: string | null;
  isPrivate?: boolean;
}

/** Collection mutations — live mode posts to /collections with an
 *  optimistic cache mirror that reverts on failure; fixture mode mutates
 *  the cache, matching the mobile store API. */
export function useCollectionActions() {
  const queryClient = useQueryClient();

  const update = (fn: (collections: UserCollection[]) => UserCollection[]) => {
    queryClient.setQueryData<UserCollection[]>(COLLECTIONS_KEY, (old) =>
      old ? fn(old) : old,
    );
  };

  return {
    /** Create a board and return it so callers can navigate to the detail. */
    createCollection: (input: NewCollectionInput): Promise<UserCollection> | UserCollection => {
      if (DATA_MODE === 'live') {
        return collectionsService
          .createCollection({ name: input.name.trim(), isPrivate: input.isPrivate })
          .then((created) => {
            void queryClient.invalidateQueries({ queryKey: COLLECTIONS_KEY });
            return mapApiCollection(created);
          });
      }
      const now = new Date().toISOString();
      const collection: UserCollection = {
        id: `col-${Date.now().toString(36)}`,
        name: input.name.trim(),
        description: null,
        isPrivate: input.isPrivate,
        itemIds: [],
        createdAt: now,
        updatedAt: now,
      };
      update((collections) => [collection, ...collections]);
      // Keep /collection/[id] + the saved boards grid able to resolve it.
      ensureCollectionResolvable(collection);
      return collection;
    },

    /** PATCH /collections/:id — name/description/isPrivate are the writable
     *  fields. Optimistic mirror first; a failed PATCH reverts the cache and
     *  rethrows so the caller toasts the failure (never a fake success). The
     *  wire acknowledges with {ok, collectionId} — no row comes back — so
     *  the invalidated list query owns the post-write truth. */
    updateCollection: (id: string, patch: CollectionPatch): Promise<void> | void => {
      const apply = (c: UserCollection): UserCollection => ({
        ...c,
        name: patch.name !== undefined ? patch.name.trim() : c.name,
        description: patch.description !== undefined ? patch.description : c.description,
        isPrivate: patch.isPrivate !== undefined ? patch.isPrivate : c.isPrivate,
        updatedAt: new Date().toISOString(),
      });
      if (DATA_MODE === 'live') {
        const prev = queryClient.getQueryData<UserCollection[]>(COLLECTIONS_KEY);
        if (prev) {
          queryClient.setQueryData<UserCollection[]>(
            COLLECTIONS_KEY,
            prev.map((c) => (c.id === id ? apply(c) : c)),
          );
        }
        return collectionsService
          .updateCollection(id, patch)
          .then(() => {
            void queryClient.invalidateQueries({ queryKey: COLLECTIONS_KEY });
          })
          .catch((err) => {
            if (prev) queryClient.setQueryData(COLLECTIONS_KEY, prev);
            throw err;
          });
      }
      update((collections) => collections.map((c) => (c.id === id ? apply(c) : c)));
      const seed = USER_COLLECTION_SEED.find((c) => c.id === id);
      if (seed) Object.assign(seed, apply(seed));
      // The detail route + profile boards resolve through the identity
      // fixture arrays — keep them in step (same posture as delete).
      patchCollectionFixture(id, {
        title: patch.name?.trim(),
        isPrivate: patch.isPrivate,
      });
    },

    /** POST /collections/:id/items — membership add, optimistic mirror with
     *  revert. Fixture mode writes the overlay store (the persistence layer
     *  there) plus the cache mirror the hub grid reads. */
    addItems: (collectionId: string, listingIds: string[]): Promise<void> => {
      const applyAdd = (cols: UserCollection[]): UserCollection[] =>
        cols.map((c) =>
          c.id === collectionId
            ? { ...c, itemIds: withItemsAdded(c.itemIds, listingIds) }
            : c,
        );
      if (DATA_MODE === 'live') {
        const prev = queryClient.getQueryData<UserCollection[]>(COLLECTIONS_KEY);
        if (prev) queryClient.setQueryData(COLLECTIONS_KEY, applyAdd(prev));
        return Promise.all(
          listingIds.map((listingId) =>
            collectionsService.addToCollection(collectionId, listingId),
          ),
        )
          .then(() => {
            void queryClient.invalidateQueries({ queryKey: COLLECTIONS_KEY });
          })
          .catch((err) => {
            if (prev) queryClient.setQueryData(COLLECTIONS_KEY, prev);
            throw err;
          });
      }
      const edits = useCollectionEdits.getState();
      const current =
        queryClient.getQueryData<UserCollection[]>(COLLECTIONS_KEY)?.find(
          (c) => c.id === collectionId,
        )?.itemIds ?? edits.boards[collectionId]?.itemIds ?? [];
      edits.setCollectionItems(collectionId, withItemsAdded(current, listingIds));
      update(applyAdd);
      return Promise.resolve();
    },

    /** DELETE /collections/:id/items/:listingId — membership remove, same
     *  optimistic + revert grammar as addItems. */
    removeItems: (collectionId: string, listingIds: string[]): Promise<void> => {
      const drop = new Set(listingIds);
      const applyRemove = (cols: UserCollection[]): UserCollection[] =>
        cols.map((c) =>
          c.id === collectionId
            ? { ...c, itemIds: withoutItemIds(c.itemIds, drop) }
            : c,
        );
      if (DATA_MODE === 'live') {
        const prev = queryClient.getQueryData<UserCollection[]>(COLLECTIONS_KEY);
        if (prev) queryClient.setQueryData(COLLECTIONS_KEY, applyRemove(prev));
        return Promise.all(
          listingIds.map((listingId) =>
            collectionsService.removeFromCollection(collectionId, listingId),
          ),
        )
          .then(() => {
            void queryClient.invalidateQueries({ queryKey: COLLECTIONS_KEY });
          })
          .catch((err) => {
            if (prev) queryClient.setQueryData(COLLECTIONS_KEY, prev);
            throw err;
          });
      }
      const edits = useCollectionEdits.getState();
      const current =
        queryClient.getQueryData<UserCollection[]>(COLLECTIONS_KEY)?.find(
          (c) => c.id === collectionId,
        )?.itemIds ?? edits.boards[collectionId]?.itemIds ?? [];
      edits.setCollectionItems(collectionId, withoutItemIds(current, drop));
      update(applyRemove);
      return Promise.resolve();
    },

    /** DELETE /collections/:id — the cache drops the row optimistically; a
     *  failed DELETE restores it and rethrows so the caller toasts instead
     *  of faking a deletion. */
    deleteCollection: (id: string): Promise<void> => {
      if (DATA_MODE === 'live') {
        const prev = queryClient.getQueryData<UserCollection[]>(COLLECTIONS_KEY);
        if (prev) {
          queryClient.setQueryData<UserCollection[]>(
            COLLECTIONS_KEY,
            prev.filter((c) => c.id !== id),
          );
        }
        return collectionsService
          .deleteCollection(id)
          .then(() => {
            void queryClient.invalidateQueries({ queryKey: COLLECTIONS_KEY });
          })
          .catch((err) => {
            if (prev) queryClient.setQueryData(COLLECTIONS_KEY, prev);
            throw err;
          });
      }
      update((collections) => collections.filter((c) => c.id !== id));
      return Promise.resolve();
    },
  };
}
