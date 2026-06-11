import { fetchJson } from '../lib/apiClient';

export interface Collection {
  id: string;
  name: string;
  description: string | null;
  isPrivate: boolean;
  itemIds: string[];
  createdAt: string;
  updatedAt: string;
}

interface CreateCollectionResponse {
  ok: true;
  collection: Collection;
}

interface ListCollectionsResponse {
  ok: true;
  collections: Collection[];
}

interface GetCollectionResponse {
  ok: true;
  collection: Collection;
}

export async function createCollection(
  name: string,
  description?: string,
  isPrivate?: boolean
): Promise<Collection> {
  const res = await fetchJson<CreateCollectionResponse>('/collections', {
    method: 'POST',
    body: JSON.stringify({ name, description, isPrivate: isPrivate ?? false }),
  });
  return res.collection;
}

export async function listCollections(): Promise<Collection[]> {
  const res = await fetchJson<ListCollectionsResponse>('/collections');
  return res.collections;
}

export async function getCollection(collectionId: string): Promise<Collection> {
  const res = await fetchJson<GetCollectionResponse>(`/collections/${collectionId}`);
  return res.collection;
}

export async function addListingToCollection(collectionId: string, listingId: string): Promise<void> {
  await fetchJson<{ ok: true }>(`/collections/${collectionId}/items`, {
    method: 'POST',
    body: JSON.stringify({ listingId }),
  });
}

export async function removeListingFromCollection(collectionId: string, listingId: string): Promise<void> {
  await fetchJson<{ ok: true }>(`/collections/${collectionId}/items/${listingId}`, {
    method: 'DELETE',
  });
}

export async function updateCollection(
  collectionId: string,
  fields: { name?: string; description?: string | null; isPrivate?: boolean }
): Promise<{ ok: true; collectionId: string }> {
  return fetchJson<{ ok: true; collectionId: string }>(`/collections/${collectionId}`, {
    method: 'PATCH',
    body: JSON.stringify(fields),
  });
}

export async function deleteCollectionOnApi(collectionId: string): Promise<{ ok: true; collectionId: string }> {
  return fetchJson<{ ok: true; collectionId: string }>(`/collections/${collectionId}`, {
    method: 'DELETE',
  });
}
