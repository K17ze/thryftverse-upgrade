import { fetchJson } from '../lib/apiClient';

// ── Creator Analytics API ───────────────────────────────────────────
// Wraps the backend /creator/analytics/* endpoints for creator-side
// performance tracking (views, likes, saves, engagement, timeline).

export type CreatorAnalyticsEventType =
  | 'view'
  | 'like'
  | 'save'
  | 'comment'
  | 'share'
  | 'product_click'
  | 'profile_visit';

export type CreatorContentType = 'poster' | 'look' | 'story';

export interface CreatorAnalyticsEventBody {
  contentType: CreatorContentType;
  contentId: string;
  eventType: CreatorAnalyticsEventType;
  viewerId?: string;
  metadata?: Record<string, unknown>;
}

export interface CreatorAnalyticsSummary {
  views: number;
  likes: number;
  saves: number;
  comments: number;
  shares: number;
  productClicks: number;
  profileVisits: number;
  engagementRate: number;
}

export interface CreatorAnalyticsTimelinePoint {
  date: string;
  views: number;
  likes: number;
  saves: number;
  comments: number;
  shares: number;
  productClicks: number;
  profileVisits: number;
  engagementRate: number;
}

export interface CreatorAnalyticsTimelineResponse {
  points: CreatorAnalyticsTimelinePoint[];
}

export async function logCreatorEvent(body: CreatorAnalyticsEventBody): Promise<{ ok: boolean }> {
  return fetchJson<{ ok: boolean }>('/creator/analytics/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function fetchCreatorAnalyticsSummary(options?: {
  contentType?: CreatorContentType;
  contentId?: string;
}): Promise<CreatorAnalyticsSummary> {
  const params = new URLSearchParams();
  if (options?.contentType) params.set('contentType', options.contentType);
  if (options?.contentId) params.set('contentId', options.contentId);
  const qs = params.toString();
  return fetchJson<CreatorAnalyticsSummary>(`/creator/analytics/summary${qs ? `?${qs}` : ''}`);
}

export async function fetchCreatorAnalyticsTimeline(options?: {
  days?: number;
  contentType?: CreatorContentType;
  contentId?: string;
}): Promise<CreatorAnalyticsTimelineResponse> {
  const params = new URLSearchParams();
  if (options?.days) params.set('days', String(options.days));
  if (options?.contentType) params.set('contentType', options.contentType);
  if (options?.contentId) params.set('contentId', options.contentId);
  const qs = params.toString();
  return fetchJson<CreatorAnalyticsTimelineResponse>(`/creator/analytics/timeline${qs ? `?${qs}` : ''}`);
}
