import { fetchJson } from '../lib/apiClient';

export interface PosterApiItem {
  id: string;
  creatorId: string;
  mediaUrl: string;
  caption: string;
  textOverlay: Record<string, unknown> | null;
  backgroundColor: string | null;
  layout: string;
  status: 'draft' | 'published' | 'archived';
  expiryHours: number;
  createdAt: string;
}

export interface PosterApiResponse {
  items: PosterApiItem[];
}

export interface PosterSingleResponse {
  ok: boolean;
  poster?: PosterApiItem;
  error?: string;
}

export interface PosterCreateBody {
  id: string;
  mediaUrl: string;
  caption?: string;
  textOverlay?: Record<string, unknown>;
  backgroundColor?: string;
  layout?: string;
  status?: 'draft' | 'published' | 'archived';
  expiryHours?: number;
}

export async function createPosterOnApi(body: PosterCreateBody): Promise<{ ok: boolean; posterId: string }> {
  return fetchJson<{ ok: boolean; posterId: string }>('/posters', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function fetchPostersFromApi(options?: { creatorId?: string; status?: string; limit?: number }): Promise<PosterApiResponse> {
  const params = new URLSearchParams();
  if (options?.creatorId) params.set('creatorId', options.creatorId);
  if (options?.status) params.set('status', options.status);
  if (options?.limit) params.set('limit', String(options.limit));
  const qs = params.toString();
  return fetchJson<PosterApiResponse>(`/posters${qs ? `?${qs}` : ''}`);
}

export async function fetchPosterByIdFromApi(posterId: string): Promise<PosterSingleResponse> {
  return fetchJson<PosterSingleResponse>(`/posters/${posterId}`);
}

export async function deletePosterOnApi(posterId: string): Promise<{ ok: boolean }> {
  return fetchJson<{ ok: boolean }>(`/posters/${posterId}`, { method: 'DELETE' });
}
