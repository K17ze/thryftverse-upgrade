'use client';

/**
 * Collections session state — the react-query cache doubles as the session
 * collection store in fixture mode, mirroring the mobile store's collections
 * slice. Live mode reads/writes `/collections` on the shared backend.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ensureCollectionResolvable,
  USER_COLLECTION_SEED,
  type UserCollection,
} from '@/lib/data/fixtures-collections';
import { DATA_MODE } from '@/lib/api/client';
import * as collectionsService from '@/lib/api/services/collections';

const COLLECTIONS_KEY = ['user-collections'] as const;

const tick = (ms = 360) => new Promise((r) => setTimeout(r, ms));

async function fetchCollections(): Promise<UserCollection[]> {
  if (DATA_MODE === 'live') {
    const collections = await collectionsService.listCollections();
    return collections.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      isPrivate: c.isPrivate,
      itemIds: c.itemIds,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));
  }
  await tick();
  return USER_COLLECTION_SEED.map((c) => ({ ...c, itemIds: [...c.itemIds] }));
}

/** Session-scoped collection list — create/update persists until reload
 *  (fixture) or until the backend row changes (live). */
export function useUserCollections() {
  return useQuery({
    queryKey: COLLECTIONS_KEY,
    queryFn: fetchCollections,
    staleTime: DATA_MODE === 'live' ? undefined : Infinity,
    gcTime: DATA_MODE === 'live' ? undefined : Infinity,
  });
}

export interface NewCollectionInput {
  name: string;
  isPrivate: boolean;
}

/** Collection mutations — live mode posts to /collections and invalidates;
 *  fixture mode mutates the cache, matching the mobile store API. */
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
            return {
              id: created.id,
              name: created.name,
              description: created.description,
              isPrivate: created.isPrivate,
              itemIds: created.itemIds,
              createdAt: created.createdAt,
              updatedAt: created.updatedAt,
            };
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
  };
}
