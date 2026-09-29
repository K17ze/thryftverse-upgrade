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
  /** Whole-set per-filter totals keyed by the native buckets
   *  (all/unread/order/new_item/review/price/auction) — always present,
   *  so tab badges stay truthful past page one. */
  filterCounts?: Record<string, number>;
  /** Total matches for the active filter — only present when a filter
   *  param was sent. */
  filteredCount?: number;
}

/**
 * Actionable-event meta — the mobile registry's `requiresAction` subset,
 * resolved server-side fields only: `eventType` drives the flag (the
 * V2 registry is client-side on native too — porting the same table),
 * `route` resolves the deep link, and the label grammar mirrors
 * resolveCardActionLabel. An actionable event whose route doesn't
 * resolve gets the flag but no fabricated label.
 */
export interface NotificationActionMeta {
  /** This event waits on the viewer (dispatch breach, counter-offer,
   *  outbid…). Feeds the "Needs attention" section. */
  requiresAction?: boolean;
  /** Quiet in-row affordance label — only when a route resolves. */
  actionLabel?: string;
}

export type NotificationEntryWithAction = NotificationEntry & NotificationActionMeta;

/** Registry subset carrying requiresAction: true (notificationsApi.ts). */
const ACTIONABLE_EVENT_TYPES: ReadonlySet<string> = new Set([
  'order_dispatch_sla_breach',
  'resolution_opened',
  'auction_outbid',
  'auction_won',
  'auction_ending_soon',
  'offer_created',
  'offer_countered',
  'offer_accepted',
  'dispatch_extension_proposed',
  'scheduled_publication_blocked',
  'scheduled_publication_failed',
  'support.information_requested',
]);

/** Route names the shared mapper doesn't know — web-equivalent targets.
 *  Reads `screen` (the real emit shape) with `name` as legacy fallback. */
function fallbackHref(route: NotificationEventApi['route']): string | undefined {
  const name = (route?.screen ?? route?.name)?.toLowerCase();
  if (!name) return undefined;
  if (name === 'sellerfulfilment') return '/seller-hub/fulfilment';
  if (name === 'offers') return '/offers';
  if (name === 'orders') return '/orders';
  if (name === 'support' || name === 'supportticket') return '/support';
  return undefined;
}

/** Action label grammar — ported from mobile resolveCardActionLabel:
 *  route-aware first (a dispatch breach routed to fulfilment reads
 *  "Dispatch now"), then per-event-type, defaulting to 'View'. */
function actionLabelFor(
  eventType: string | undefined,
  route: NotificationEventApi['route'],
): string {
  if ((route?.screen ?? route?.name)?.toLowerCase() === 'sellerfulfilment')
    return 'Dispatch now';
  switch (eventType) {
    case 'dispatch_extension_proposed':
      return 'Respond';
    case 'offer_created':
    case 'offer_countered':
      return 'Review offer';
    case 'offer_accepted':
      return 'Complete checkout';
    case 'support.information_requested':
      return 'Reply';
    case 'scheduled_publication_blocked':
    case 'scheduled_publication_failed':
      return 'Review';
    case 'resolution_opened':
      return 'Respond';
    default:
      return 'View';
  }
}

/** Enrich a mapped entry with actionability + a resolved route fallback. */
function withNotificationAction(
  entry: NotificationEntry,
  event: NotificationEventApi,
): NotificationEntryWithAction {
  const href = entry.href ?? fallbackHref(event.route);
  // The V2 wire already computes requiresAction server-side — the local
  // table is the fallback for rows written before the field existed.
  const requiresAction =
    event.requiresAction === true ||
    ACTIONABLE_EVENT_TYPES.has(event.eventType ?? '');
  const out: NotificationEntryWithAction = {
    ...(href ? { ...entry, href } : entry),
    // Wire actor identity — the in-row Follow back resolves the id
    // directly, never through a directory/fixture lookup.
    actorUserId: event.actorUserId ?? undefined,
    actorUsername: event.actorUsername ?? undefined,
  };
  if (requiresAction) {
    out.requiresAction = true;
    if (href) out.actionLabel = actionLabelFor(event.eventType, event.route);
  }
  return out;
}

export interface NotificationPage {
  entries: NotificationEntryWithAction[];
  items: AppNotification[];
  nextCursor: string | null;
  unreadCount: number;
  /** Whole-set per-filter totals — present on every live response. */
  filterCounts?: Record<string, number>;
  /** Total matches under the active filter — only present when a filter
   *  param was sent. */
  filteredCount?: number;
}

export async function fetchNotificationEvents(
  params: {
    cursor?: string;
    limit?: number;
    /** Server-side filter — the concrete event types the page must match
     *  (the FILTER_EVENT_TYPES bucket for the active UI filter; sent as
     *  the comma-separated `eventType` param). */
    eventTypes?: readonly string[];
    /** Server-side unread filter — restricts to read_at IS NULL. */
    unread?: boolean;
  } = {},
  signal?: AbortSignal,
): Promise<NotificationPage> {
  const usp = new URLSearchParams();
  if (params.cursor) usp.set('cursor', params.cursor);
  if (params.limit) usp.set('limit', String(params.limit));
  if (params.eventTypes?.length) usp.set('eventType', params.eventTypes.join(','));
  if (params.unread) usp.set('unread', 'true');
  const qs = usp.toString() ? `?${usp.toString()}` : '';
  const payload = await fetchJson<NotificationListResponse>(
    `/notifications/events${qs}`,
    undefined,
    { signal },
  );
  const items = payload.items ?? [];
  return {
    entries: items.map((e) => withNotificationAction(mapNotificationEventToEntry(e), e)),
    items: items.map(mapNotificationEventToAppNotification),
    nextCursor: payload.nextCursor ?? null,
    unreadCount: payload.unreadCount ?? 0,
    filterCounts: payload.filterCounts,
    filteredCount: payload.filteredCount,
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

/** Dismiss a notification — DELETE /notifications/events/:id (the mobile
 *  swipe-to-clear edge; the row is gone for good server-side). */
export async function dismissNotification(id: string): Promise<void> {
  await fetchJson(`/notifications/events/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

// ── Preferences — GET/PUT /notifications/preferences ────────────────────────
// Mirrors notificationsApi.ts getNotificationPreferences /
// updateNotificationPreferences. The route upserts each written slice —
// omitted fields are untouched, and a category outside the wire vocabulary
// is rejected (400 INVALID_PREFERENCE_CATEGORY).

/** Wire push categories — the server's vocabulary (backend
 *  NOTIFICATION_PUSH_CATEGORIES). The web matrix's finer keys fold onto
 *  these before a write. */
export type NotificationPushCategory =
  | 'messages'
  | 'offers'
  | 'wishlist'
  | 'followers'
  | 'orderUpdates'
  | 'priceDrops'
  | 'auctionAlerts'
  | 'news';

/** Lock-screen preview policy — the zod enum verbatim. */
export type NotificationPreviewPolicy = 'full' | 'sender_only' | 'hidden';

/** User-level quiet window — wall-clock hours (0–23) in `timezone`. */
export interface NotificationQuietHours {
  enabled: boolean;
  startHour: number;
  endHour: number;
  timezone?: string;
}

/** Resolved projection of GET /notifications/preferences. */
export interface NotificationPreferences {
  /** Per-category on/off — the GET emits every wire category. */
  preferences: Partial<Record<NotificationPushCategory, boolean>>;
  /** Quiet window — null when the user has never written one. */
  quietHours: NotificationQuietHours | null;
  /** Scalar user-level policy; the server reports a mixed per-category
   *  posture as 'sender_only'. */
  previewPolicy: NotificationPreviewPolicy | null;
}

/** PUT body — every field optional so one slice can persist alone
 *  (the route's hasWrites check only needs one present). */
export interface NotificationPreferencesUpdate {
  preferences?: Partial<Record<NotificationPushCategory, boolean>>;
  /** `null` clears the stored window. */
  quietHours?: NotificationQuietHours | null;
  /** Scalar applies uniformly to every category — the single-toggle form;
   *  the record form sets categories individually. */
  previewPolicy?:
    | NotificationPreviewPolicy
    | Partial<Record<NotificationPushCategory, NotificationPreviewPolicy>>;
}

interface NotificationPreferencesResponse {
  ok: boolean;
  preferences?: Record<string, boolean>;
  previewPolicies?: Record<string, string>;
  previewPolicy?: string;
  quietHours?: {
    enabled?: boolean;
    startHour?: number;
    endHour?: number;
    /** Legacy/alternate hour fields — same acceptance set as the zod
     *  schema (hour int or "HH:mm"). */
    start?: number | string;
    end?: number | string;
    timezone?: string;
  } | null;
}

const PREVIEW_POLICIES: ReadonlySet<string> = new Set([
  'full',
  'sender_only',
  'hidden',
]);

/** Hour-of-day from either accepted wire form — int or "HH:mm". */
function quietHourValue(value: number | string | undefined): number | undefined {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value >= 0 && value <= 23 ? value : undefined;
  }
  if (typeof value === 'string') {
    const hour = Number.parseInt(value.split(':')[0], 10);
    return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : undefined;
  }
  return undefined;
}

/** GET /notifications/preferences — the account's push posture:
 *  per-category toggles, the user-level quiet window, and the
 *  lock-screen preview policy. */
export async function fetchNotificationPreferences(
  signal?: AbortSignal,
): Promise<NotificationPreferences> {
  const payload = await fetchJson<NotificationPreferencesResponse>(
    '/notifications/preferences',
    undefined,
    { signal },
  );
  const quiet = payload.quietHours;
  const startHour = quietHourValue(quiet?.startHour ?? quiet?.start);
  const endHour = quietHourValue(quiet?.endHour ?? quiet?.end);
  return {
    preferences: (payload.preferences ?? {}) as NotificationPreferences['preferences'],
    quietHours:
      quiet &&
      typeof quiet.enabled === 'boolean' &&
      startHour !== undefined &&
      endHour !== undefined
        ? {
            enabled: quiet.enabled,
            startHour,
            endHour,
            ...(typeof quiet.timezone === 'string' ? { timezone: quiet.timezone } : {}),
          }
        : null,
    previewPolicy:
      payload.previewPolicy && PREVIEW_POLICIES.has(payload.previewPolicy)
        ? (payload.previewPolicy as NotificationPreviewPolicy)
        : null,
  };
}

/** PUT /notifications/preferences — upserts each written field;
 *  omitted slices stay as the server holds them. */
export async function updateNotificationPreferences(
  update: NotificationPreferencesUpdate,
): Promise<void> {
  await fetchJson<{ ok: boolean }>('/notifications/preferences', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(update),
  });
}
