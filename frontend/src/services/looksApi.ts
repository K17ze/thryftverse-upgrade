import { fetchJson } from '../lib/apiClient';

export interface LookTagApiItem {
  id: string;
  listingId: string | null;
  label: string;
  x: number;
  y: number;
}

export interface LookApiItem {
  id: string;
  creatorId: string;
  title: string;
  mediaUrl: string;
  status: 'draft' | 'published' | 'archived';
  createdAt: string;
  tags: LookTagApiItem[];
}

export interface LookApiResponse {
  items: LookApiItem[];
}

export interface LookSingleResponse {
  ok: boolean;
  look?: LookApiItem;
  error?: string;
}

export interface LookCreateTag {
  id: string;
  listingId?: string;
  label: string;
  x: number;
  y: number;
}

export interface LookCreateBody {
  id: string;
  title: string;
  mediaUrl: string;
  tags?: LookCreateTag[];
  status?: 'draft' | 'published' | 'archived';
}

export async function createLookOnApi(body: LookCreateBody): Promise<{ ok: boolean; lookId: string }> {
  return fetchJson<{ ok: boolean; lookId: string }>('/looks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function fetchLooksFromApi(options?: { creatorId?: string; status?: string; limit?: number }): Promise<LookApiResponse> {
  const params = new URLSearchParams();
  if (options?.creatorId) params.set('creatorId', options.creatorId);
  if (options?.status) params.set('status', options.status);
  if (options?.limit) params.set('limit', String(options.limit));
  const qs = params.toString();
  return fetchJson<LookApiResponse>(`/looks${qs ? `?${qs}` : ''}`);
}

export async function fetchLookByIdFromApi(lookId: string): Promise<LookSingleResponse> {
  return fetchJson<LookSingleResponse>(`/looks/${lookId}`);
}

export async function deleteLookOnApi(lookId: string): Promise<{ ok: boolean }> {
  return fetchJson<{ ok: boolean }>(`/looks/${lookId}`, { method: 'DELETE' });
}