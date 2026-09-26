/**
 * Web collections service — mirrors frontend/src/services/collectionsApi.ts.
 * Server-authoritative boards: itemIds come back resolved from the backend.
 */

import { fetchJson } from '../http';

export interface ApiCollection {
  id: string;
  name: string;
  description: string | null;
  isPrivate: boolean;
  itemIds: string[];
  coverImageUrl?: string | null;
  itemCount?: number;
  createdAt: string;
  updatedAt: string;
}

interface ListCollectionsResponse {
  ok: boolean;
  collections: ApiCollection[];
}

interface GetCollectionResponse {
  ok: boolean;
  collection: ApiCollection;
}

export async function listCollections(signal?: AbortSignal): Promise<ApiCollection[]> {
  const res = await fetchJson<ListCollectionsResponse>('/collections', undefined, { signal });
  return res.collections;
}

export async function getCollection(
  collectionId: string,
  signal?: AbortSignal,
): Promise<ApiCollection | null> {
  const res = await fetchJson<GetCollectionResponse>(
    `/collections/${encodeURIComponent(collectionId)}`,
    undefined,
    { signal },
  );
  return res.ok ? res.collection : null;
}

export async function createCollection(input: {
  name: string;
  description?: string;
  isPrivate?: boolean;
}): Promise<ApiCollection> {
  const res = await fetchJson<{ ok: true; collection: ApiCollection }>('/collections', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: input.name,
      description: input.description,
      isPrivate: input.isPrivate ?? false,
    }),
  });
  return res.collection;
}

export async function updateCollection(
  collectionId: string,
  patch: { name?: string; description?: string; isPrivate?: boolean },
): Promise<ApiCollection> {
  const res = await fetchJson<{ ok: true; collection: ApiCollection }>(
    `/collections/${encodeURIComponent(collectionId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    },
  );
  return res.collection;
}

export async function deleteCollection(collectionId: string): Promise<void> {
  await fetchJson(`/collections/${encodeURIComponent(collectionId)}`, { method: 'DELETE' });
}

export async function addToCollection(collectionId: string, listingId: string): Promise<void> {
  await fetchJson(`/collections/${encodeURIComponent(collectionId)}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ listingId }),
  });
}

export async function removeFromCollection(collectionId: string, listingId: string): Promise<void> {
  await fetchJson(
    `/collections/${encodeURIComponent(collectionId)}/items/${encodeURIComponent(listingId)}`,
    { method: 'DELETE' },
  );
}
