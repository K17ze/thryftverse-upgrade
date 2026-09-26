'use client';

/**
 * ConversationRow — port of mobile InboxConversationRow.
 * DM: 40px avatar + online dot, name + verified, one-line preview (bold
 * when unread), timestamp, unread badge, 40px listing thumb on the right.
 * Group: 2×2 member mosaic (or group photo), group title, "{n} members"
 * label ahead of the preview — no presence dot, no verified badge.
 * The preview follows the per-kind grammar ("You sent an offer · £32",
 * "📷 Photo") and a delivery glyph leads it when the last message is ours.
 * Flat row, no card chrome — hairlines come from the parent list.
 */

import Link from 'next/link';
import type { Conversation } from '@/lib/contracts/domain';
import { Avatar } from '@/components/ui/Avatar';
import { AppImage } from '@/components/ui/AppImage';
import { Icon } from '@/components/ui/Icon';
import { GroupAvatarMosaic } from './GroupAvatarMosaic';
import { useInboxPrefs } from '@/lib/store/inboxPrefs';
import { useHydrated } from '@/lib/store/useStore';
import {
  conversationTitle,
  deriveDeliveryStatus,
  formatInboxTimestamp,
  isGroupConversation,
  lastMessagePreview,
  memberCount,
  mosaicMembers,
  type InboxDeliveryStatus,
} from './inboxModel';

/** Delivery glyph — one small status mark before the preview, matching the
 *  thread's receipt grammar (check / double-check / clock). */
function DeliveryGlyph({ status }: { status: InboxDeliveryStatus }) {
  if (status === 'sending') {
    return <Icon name="clock" size={12} className="shrink-0 text-text-muted" aria-label="Sending" />;
  }
  if (status === 'read') {
    return (
      <span className="inline-flex shrink-0 text-brand" aria-label="Read">
        <Icon name="check" size={13} />
        <Icon name="check" size={13} className="-ml-2.5" />
      </span>
    );
  }
  // sent + delivered — muted single/double check
  return (
    <span className="inline-flex shrink-0 text-text-muted" aria-label={status === 'delivered' ? 'Delivered' : 'Sent'}>
      <Icon name="check" size={13} />
      {status === 'delivered' ? <Icon name="check" size={13} className="-ml-2.5" /> : null}
    </span>
  );
}

interface ConversationRowProps {
  conversation: Conversation;
  active?: boolean;
}

export function ConversationRow({ conversation: c, active }: ConversationRowProps) {
  const group = isGroupConversation(c);
  const title = conversationTitle(c);
  const preview = lastMessagePreview(c);
  const delivery = deriveDeliveryStatus(c);
  const count = group ? memberCount(c) : 0;
  const unreadCount = c.unread ? (c.unreadCount ?? 0) : 0;
  const hydrated = useHydrated();
  const mutedIds = useInboxPrefs((s) => s.mutedIds);
  const muted = hydrated && mutedIds.includes(c.id);
  // Muted threads keep the row but lose the badge and bold — the preview
  // is still there when you open it (Instagram's muted-chat grammar).
  const unread = c.unread && !muted;

  return (
    <Link
      href={`/inbox/${c.id}`}
      aria-current={active ? 'page' : undefined}
      aria-label={`${title}${group && count ? `, group, ${count} members` : ''}${unread ? ', unread' : ''}`}
      className={`pressable flex items-center gap-3 px-4 py-3 ${
        active ? 'bg-surface-alt' : 'hover:bg-row-pressed'
      }`}
    >
      <div className="relative shrink-0">
        {group ? (
          <GroupAvatarMosaic
            members={mosaicMembers(c)}
            size={40}
            groupPhoto={c.avatar}
            fallbackName={title}
            groupId={c.id}
          />
        ) : (
          <>
            <Avatar src={c.participantAvatar} name={c.participantName} size={40} />
            {c.isOnline ? (
              <span
                className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-success-text ring-2 ring-background"
                aria-label="Online"
              />
            ) : null}
          </>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1">
            <span
              className={`clamp-1 text-body-emphasis text-text-primary ${
                unread ? 'font-bold' : 'font-semibold'
              }`}
            >
              {title}
            </span>
            {!group && c.participantVerified ? (
              <Icon name="verified" filled size={13} className="shrink-0 text-commerce-trust" />
            ) : null}
            {muted ? (
              <Icon name="notificationsOff" size={13} className="shrink-0 text-text-muted" aria-label="Muted" />
            ) : null}
          </span>
          <span
            className={`tnum shrink-0 text-meta ${
              unread ? 'font-semibold text-text-primary' : 'text-text-muted'
            }`}
          >
            {formatInboxTimestamp(c.lastMessageTime)}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5">
          {group && count > 0 ? (
            <span className="shrink-0 text-meta font-semibold text-text-muted">
              {count} {count === 1 ? 'member' : 'members'}
            </span>
          ) : null}
          {delivery ? <DeliveryGlyph status={delivery} /> : null}
          <span
            className={`clamp-1 flex-1 text-body ${
              unread ? 'font-semibold text-text-primary' : 'text-text-secondary'
            }`}
          >
            {preview}
          </span>
          {unread ? (
            <span
              className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-brand px-1 text-micro font-semibold text-text-inverse"
              aria-label={unreadCount > 1 ? `${unreadCount} unread` : 'Unread'}
            >
              {unreadCount > 1 ? (unreadCount > 99 ? '99+' : unreadCount) : null}
            </span>
          ) : null}
        </div>
      </div>

      {c.listing?.image ? (
        <AppImage
          src={c.listing.image}
          alt={c.listing.title}
          sizes="40px"
          className="h-10 w-10 shrink-0 rounded-md"
          fallbackIcon="bag"
        />
      ) : null}
    </Link>
  );
}
