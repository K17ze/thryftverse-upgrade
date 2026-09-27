/**
 * Web notifications service — mirrors frontend/src/services/notificationsApi.ts.
 * `/notifications/events` returns structured NotificationEvent rows —
 * semantics come from `eventType`/route, never parsed from display text.
 */

import { fetchJson } from '../http';
import {
  mapNotificationEventToAppNotification,
  mapNotificationEventToEntry,
  type NotificationEventApi,
} from '../mappers';
import type { AppNotification, NotificationEntry } from '@/lib/contracts/domain';

interface NotificationListResponse {
  ok: boolean;
  items: NotificationEventApi[];
  nextCursor: string | null;
  unreadCount?: number;
  filterCounts?: Record<string, number>;
}

export interface NotificationPage {
  entries: NotificationEntry[];
  items: AppNotification[];
  nextCursor: string | null;
  unreadCount: number;
}

export async function fetchNotificationEvents(
  params: { cursor?: string; limit?: number } = {},
  signal?: AbortSignal,
): Promise<NotificationPage> {
  const usp = new URLSearchParams();
  if (params.cursor) usp.set('cursor', params.cursor);
  if (params.limit) usp.set('limit', String(params.limit));
  const qs = usp.toString() ? `?${usp.toString()}` : '';
  const payload = await fetchJson<NotificationListResponse>(
    `/notifications/events${qs}`,
    undefined,
    { signal },
  );
  const items = payload.items ?? [];
  return {
    entries: items.map(mapNotificationEventToEntry),
    items: items.map(mapNotificationEventToAppNotification),
    nextCursor: payload.nextCursor ?? null,
    unreadCount: payload.unreadCount ?? 0,
  };
}

export async function fetchUnreadNotificationCount(signal?: AbortSignal): Promise<number> {
  const payload = await fetchJson<{ ok: boolean; count?: number; unreadCount?: number }>(
    '/notifications/unread-count',
    undefined,
    { signal },
  );
  return payload.unreadCount ?? payload.count ?? 0;
}

export async function markNotificationRead(id: string): Promise<void> {
  await fetchJson(`/notifications/events/${encodeURIComponent(id)}/read`, {
    method: 'POST',
  });
}

export async function markAllNotificationsRead(): Promise<void> {
  await fetchJson('/notifications/read-all', { method: 'POST' });
}
