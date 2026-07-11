import { fetchJson } from '../lib/apiClient';

export type PushProvider = 'expo';
export type PushPlatform = 'ios' | 'android' | 'web';

export type NotificationEventType =
  | 'order_created'
  | 'order_paid'
  | 'order_cancelled'
  | 'order_dispatched'
  | 'order_in_transit'
  | 'order_out_for_delivery'
  | 'order_delivered'
  | 'order_refunded'
  | 'resolution_opened'
  | 'resolution_status_changed'
  | 'review_received'
  | 'chat_message'
  | 'payout_processed'
  | 'refund_completed'
  | 'auction_outbid'
  | 'auction_won'
  | 'auction_ending_soon'
  | 'generic';

export type NotificationPushCategory =
  | 'messages'
  | 'offers'
  | 'wishlist'
  | 'followers'
  | 'orderUpdates'
  | 'priceDrops'
  | 'news';

export interface NotificationRoute {
  screen: string;
  params?: Record<string, unknown>;
}

interface RegisterNotificationDeviceResponse {
  ok: true;
  device: {
    id: number;
    userId: string;
    provider: PushProvider;
    platform: PushPlatform;
    token: string;
    isActive: boolean;
    appVersion: string | null;
    createdAt: string;
    lastSeenAt: string;
  };
}

interface ListNotificationDevicesResponse {
  ok: true;
  devices: Array<{
    id: number;
    provider: PushProvider;
    platform: PushPlatform;
    token: string;
    isActive: boolean;
    appVersion: string | null;
    createdAt: string;
    lastSeenAt: string;
  }>;
}

export type NotificationPriority = 'urgent' | 'normal' | 'low';

export interface NotificationEvent {
  id: string;
  userId: string;
  channel: string;
  title: string;
  body: string;
  payload: Record<string, unknown>;
  status: 'queued' | 'sent' | 'failed';
  providerMessageId: string | null;
  providerError: string | null;
  createdAt: string;
  sentAt: string | null;
  eventType: NotificationEventType;
  actorUserId: string | null;
  actorUsername: string | null;
  actorDisplayName: string | null;
  actorAvatar: string | null;
  readAt: string | null;
  imageUrl: string | null;
  route: NotificationRoute | null;
  priority?: NotificationPriority;
}

const URGENT_EVENT_TYPES: NotificationEventType[] = [
  'order_created',
  'order_paid',
  'order_dispatched',
  'order_delivered',
  'order_cancelled',
  'order_refunded',
  'resolution_opened',
  'resolution_status_changed',
  'auction_outbid',
  'auction_won',
  'payout_processed',
  'refund_completed',
];

const LOW_EVENT_TYPES: NotificationEventType[] = [
  'generic',
];

export function resolveNotificationPriority(eventType: NotificationEventType): NotificationPriority {
  if (URGENT_EVENT_TYPES.includes(eventType)) return 'urgent';
  if (LOW_EVENT_TYPES.includes(eventType)) return 'low';
  return 'normal';
}

export function resolveNotificationCategory(eventType: NotificationEventType): NotificationPushCategory | null {
  if (eventType === 'chat_message') return 'messages';
  if (eventType.startsWith('order_') || eventType === 'refund_completed' || eventType === 'payout_processed') return 'orderUpdates';
  if (eventType === 'auction_outbid' || eventType === 'auction_won' || eventType === 'auction_ending_soon') return 'priceDrops';
  if (eventType === 'review_received') return 'wishlist';
  return null;
}

interface ListNotificationEventsResponse {
  ok: true;
  items: NotificationEvent[];
  nextCursor: string | null;
}

interface UnreadCountResponse {
  ok: true;
  unreadCount: number;
}

interface GetPreferencesResponse {
  ok: true;
  preferences: Record<string, boolean>;
}

export interface RegisterNotificationDeviceInput {
  token: string;
  provider?: PushProvider;
  platform: PushPlatform;
  appVersion?: string;
  metadata?: Record<string, unknown>;
}

export async function registerNotificationDevice(input: RegisterNotificationDeviceInput) {
  const payload = await fetchJson<RegisterNotificationDeviceResponse>('/notifications/devices/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: 'expo',
      ...input,
    }),
  });

  return payload.device;
}

export async function listNotificationDevices() {
  const payload = await fetchJson<ListNotificationDevicesResponse>('/notifications/devices');
  return payload.devices;
}

export async function deactivateNotificationDevice(token: string): Promise<void> {
  await fetchJson<{ ok: true }>(`/notifications/devices/${encodeURIComponent(token)}`, {
    method: 'DELETE',
  });
}

export async function listNotificationEvents(opts?: {
  limit?: number;
  cursor?: string | null;
}): Promise<{ items: NotificationEvent[]; nextCursor: string | null }> {
  const limit = opts?.limit ?? 30;
  const cursorParam = opts?.cursor ? `&cursor=${encodeURIComponent(opts.cursor)}` : '';
  const payload = await fetchJson<ListNotificationEventsResponse>(
    `/notifications/events?limit=${limit}${cursorParam}`
  );

  return { items: payload.items, nextCursor: payload.nextCursor };
}

export async function getUnreadCount(): Promise<number> {
  const payload = await fetchJson<UnreadCountResponse>('/notifications/unread-count');
  return payload.unreadCount;
}

export async function markNotificationRead(eventId: string): Promise<void> {
  await fetchJson<{ ok: true }>(`/notifications/events/${encodeURIComponent(eventId)}/read`, {
    method: 'POST',
  });
}

export async function markAllNotificationsRead(): Promise<void> {
  await fetchJson<{ ok: true }>('/notifications/read-all', {
    method: 'POST',
  });
}

export async function getNotificationPreferences(): Promise<Record<string, boolean>> {
  const payload = await fetchJson<GetPreferencesResponse>('/notifications/preferences');
  return payload.preferences;
}

export async function updateNotificationPreferences(
  preferences: Record<string, boolean>
): Promise<void> {
  await fetchJson<{ ok: true }>('/notifications/preferences', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ preferences }),
  });
}