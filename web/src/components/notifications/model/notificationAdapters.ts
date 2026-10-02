import type { AppNotification, NotificationEntry, NotificationKind } from '@/lib/contracts/domain';
import { LISTINGS, MY_LISTINGS } from '@/lib/data/fixtures';
import type { NotificationRowModel } from './notificationTypes';

export const LEGACY_KIND: Record<AppNotification['type'], NotificationKind> = {
  favourite: 'like',
  offer: 'offer',
  order: 'order',
  follow: 'follow',
  new_item: 'new_item',
  system: 'system',
};

/** Photo-id key — strips the size query so a 200w notification thumb can
 *  match the 800w listing cover it was derived from. */
export function unsplashKey(uri: string | undefined): string | null {
  if (!uri) return null;
  const match = /photo-[^?&]+/.exec(uri);
  return match ? match[0] : null;
}

/** Find the listing whose images include this notification thumbnail. */
export function listingForImage(uri: string | undefined) {
  const key = unsplashKey(uri);
  if (!key) return undefined;
  return [...LISTINGS, ...MY_LISTINGS].find((l) =>
    l.images.some((img) => unsplashKey(img) === key),
  );
}

/**
 * Deep-link a legacy notification — the AppNotification contract carries
 * no route, so the surface is derived from the type: offers → /offers,
 * orders → /orders, follows → the actor's profile, item events → the
 * listing whose cover matches the thumbnail.
 */
export function legacyHref(n: AppNotification): string | undefined {
  switch (n.type) {
    case 'offer':
      return '/offers';
    case 'order':
      return '/orders';
    case 'follow': {
      const actor = n.text.split(' ')[0]?.replace(/^@/, '');
      return actor ? `/u/${actor}` : undefined;
    }
    case 'favourite':
    case 'new_item': {
      const listing = listingForImage(n.itemImage);
      return listing ? `/item/${listing.id}` : '/explore';
    }
    case 'system':
      return '/explore';
    default:
      return undefined;
  }
}

/** Adapt a legacy AppNotification into the unified row model. */
export function fromLegacyNotification(n: AppNotification): NotificationRowModel {
  const href = legacyHref(n);
  return {
    id: n.id,
    kind: LEGACY_KIND[n.type] ?? 'system',
    text: n.text,
    time: n.time,
    image: n.itemImage,
    isActor: n.type === 'follow',
    href,
    unread: false, // legacy rows carry no read cursor — treat as read
    // No Follow back: AppNotification carries no actor id, and resolving
    // one through the fixture directory was a live-mode lie.
  };
}

/** Adapt a NotificationEntry (already in row shape). The service may
 *  attach actionability meta (NotificationEntryWithAction) — read it
 *  through the declared optional fields, never fabricate it. */
export function fromNotificationEntry(n: NotificationEntry): NotificationRowModel {
  const actioned = n as NotificationEntry & {
    requiresAction?: boolean;
    actionLabel?: string;
  };
  return {
    id: n.id,
    kind: n.kind,
    text: n.text,
    time: n.time,
    image: n.image,
    isActor: n.isActor === true,
    href: n.href,
    unread: n.unread === true,
    // Wire actorUserId — never a fixture lookup; absent means the event
    // carried no actor and the Follow back stays hidden.
    actorId: n.kind === 'follow' ? n.actorUserId : undefined,
    requiresAction: actioned.requiresAction === true,
    actionLabel: actioned.actionLabel,
    aggregatedIds: n.aggregatedIds,
    aggregatedUnreadIds: n.aggregatedUnreadIds,
    aggregatedCount: n.aggregatedCount,
    createdAt: n.createdAt,
  };
}
