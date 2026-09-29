'use client';

/**
 * inboxModel — shared inbox derivations, ported from mobile
 * components/inbox/inboxViewModels.ts + the store's appendConversationMessage
 * preview grammar. One source so the row, the sheet and the thread agree.
 */

import type { Conversation, Message } from '@/lib/contracts/domain';
import { listingById } from '@/lib/data/fixtures';
import { marketplaceMeta } from '@/lib/api/services/chat';
import { DATA_MODE } from '@/lib/api/client';
import { formatPrice } from '@/lib/utils/format';
import type { MosaicMember } from './GroupAvatarMosaic';

// ── Group / DM identity ──────────────────────────────────────────────────

export function isGroupConversation(c: Conversation): boolean {
  return c.type === 'group';
}

/** Display title — group title for groups, counterparty name for DMs. */
export function conversationTitle(c: Conversation): string {
  if (isGroupConversation(c)) return c.title ?? c.participantName ?? 'Group chat';
  return c.participantName;
}

/** Member count including the viewer — the mobile "N members" subtitle. */
export function memberCount(c: Conversation): number {
  return c.participantIds?.length ?? c.participantProfiles?.length ?? 0;
}

/** Mosaic members — everyone except the viewer (mobile selects others). */
export function mosaicMembers(c: Conversation, viewerId = 'me'): MosaicMember[] {
  const profiles = c.participantProfiles ?? [];
  const others = profiles.filter((p) => p.id !== viewerId);
  if (others.length > 0) {
    return others.map((p) => ({
      id: p.id,
      displayName: p.displayName ?? p.username,
      avatar: p.avatar,
    }));
  }
  // Legacy/edge: a group with no profiles still shows the counterparty.
  return c.participantId
    ? [{ id: c.participantId, displayName: c.participantName, avatar: c.participantAvatar }]
    : [];
}

/** Sender display label for a group bubble — displayName ?? username. */
export function senderLabelFor(c: Conversation, senderId: string): string {
  const p = c.participantProfiles?.find((x) => x.id === senderId);
  return p?.displayName ?? p?.username ?? 'Member';
}

/**
 * Preview-line handle for a group sender — displayName when the profile
 * carries one, else the @username (the "@marie: text" row grammar).
 * Bubble sender labels stay plain names; only the list preview uses
 * handles, where the name has to scan against many threads.
 */
export function senderHandleFor(c: Conversation, senderId: string): string {
  const p = c.participantProfiles?.find((x) => x.id === senderId);
  if (p?.displayName) return p.displayName;
  if (p?.username) return `@${p.username}`;
  return senderLabelFor(c, senderId);
}

/** Avatar + label for a group sender — the cluster-trailing face next to
 *  an incoming run (mobile ChatMessageItem avatar-recurrence grammar). */
export function senderAvatarFor(
  c: Conversation,
  senderId: string,
): { name: string; avatar?: string } {
  const p = c.participantProfiles?.find((x) => x.id === senderId);
  return {
    name: p?.displayName ?? p?.username ?? 'Member',
    avatar: p?.avatar ?? undefined,
  };
}

// ── Marketplace role — Buying / Selling segment grammar ──────────────────

/**
 * The native segment classification (useInboxFilters +
 * conversationClassification): group threads are their own rail,
 * marketplace threads split Buying / Selling on the viewer's relation to
 * the context listing, and plain DMs stay "general" — they only surface
 * under All, never under a commerce segment.
 *
 * Web's proven seller signal, in order: the fixture listing's sellerId
 * (fixtures resolve through the catalog), then the live payload's
 * `marketplace.ownerId` (the native `sellerId ?? ownerId` proxy the chat
 * service attaches). A marketplace thread with no resolvable owner reads
 * as Buying — the same default native takes when sellerId is absent
 * (isSelling false → isBuying true). Non-marketplace threads never claim
 * a side they can't prove.
 */
export type ConversationRole = 'buying' | 'selling' | 'group' | 'general';

export function conversationRole(
  c: Conversation,
  viewerId: string,
): ConversationRole {
  if (isGroupConversation(c)) return 'group';
  const meta = marketplaceMeta(c);
  const listingId = c.listing?.id ?? meta.itemId ?? meta.listingId;
  const isMarketplace = Boolean(listingId);
  if (!isMarketplace) return 'general';
  // Fixture catalogue lookups only apply to fixture ids — a live listing
  // id colliding with a catalogue id would attribute the thread to the
  // wrong member. Live threads carry the seller proxy on the wire
  // (marketplace.ownerId); when it's absent the thread stays Buying —
  // the same default native takes when sellerId is absent.
  const sellerId =
    (DATA_MODE === 'fixture' && listingId
      ? listingById(listingId)?.sellerId
      : undefined) ?? meta.ownerId;
  const isSelling = !!sellerId && (sellerId === viewerId || sellerId === 'me');
  return isSelling ? 'selling' : 'buying';
}

// ── Last-message preview grammar ─────────────────────────────────────────

export type InboxDeliveryStatus = 'sending' | 'sent' | 'delivered' | 'read';

function isMine(m: Message): boolean {
  return m.sender === 'me' || m.senderId === 'me';
}

function isSystem(m: Message): boolean {
  return m.isSystem === true || m.type === 'system' || m.sender === 'system';
}

function isOffer(m: Message): boolean {
  return m.type === 'offer' || m.offerPrice != null;
}

/**
 * Per-kind preview for the last message — derived from the stored message
 * so the row never claims a state it can't prove and never leaks a raw
 * type name:
 *  - deleted       → tombstone label, never the original payload
 *  - system        → its title/body verbatim
 *  - offer         → "You sent an offer · £32" / "{name} sent an offer · £32" / "Offer · £32"
 *  - image         → "Photo" (sender-prefixed in groups)
 *  - video         → "Video" (sender-prefixed in groups)
 *  - voice         → "Voice message" (sender-prefixed in groups)
 *  - document      → "Document" / "{name}" (sender-prefixed in groups)
 *  - offer_declined→ "Offer declined · £32" (its text wins when present)
 *  - listing_share → "Shared a listing · {title}"
 *  - purchase_status / commerce_state → text, else systemTitle/authored preview
 *  - text          → the body; group senders get a "{@handle}: " prefix
 * Falls back to the authored lastMessage when the thread has no stored
 * messages yet (fresh list fetch / just-created conversation).
 */
export function lastMessagePreview(c: Conversation): string {
  const m = c.messages.length ? c.messages[c.messages.length - 1] : undefined;
  if (!m) return c.lastMessage ?? '';

  const group = isGroupConversation(c);
  const mine = isMine(m);
  const who = mine ? 'You' : group ? senderHandleFor(c, m.senderId) : null;

  // A deleted-for-everyone message previews as the tombstone label — the
  // row must never leak the original body, offer or media caption.
  if (m.isDeleted) {
    return mine ? 'You deleted a message' : group ? `${who}: deleted a message` : 'This message was deleted';
  }

  if (isSystem(m)) return m.systemTitle ?? m.text ?? c.lastMessage;

  // A live offer card previews as an offer; a decline record is commerce
  // prose, so it falls through to its text / the declined label below.
  if (isOffer(m) && m.type !== 'offer_declined') {
    const amount = formatPrice(m.offerPrice);
    const label = amount ? `an offer · ${amount}` : 'an offer';
    return who ? `${who} sent ${label}` : amount ? `Offer · ${amount}` : 'Offer';
  }
  if (m.mediaUri || m.mediaType) {
    const noun = m.mediaType === 'video' ? 'Video' : 'Photo';
    return who && group ? `${who}: ${noun}` : noun;
  }
  if (m.type === 'voice' || m.voiceUri) {
    return who && group ? `${who}: Voice message` : 'Voice message';
  }
  if (m.type === 'document' || m.documentUri) {
    const label = m.documentName ?? 'Document';
    return who && group ? `${who}: ${label}` : label;
  }
  if (m.text) return who && group ? `${who}: ${m.text}` : m.text;

  // Textless kinds — honest labels per contract type, never the type name.
  if (m.type === 'offer_declined') {
    return m.offerPrice != null
      ? `Offer declined · ${formatPrice(m.offerPrice)}`
      : 'Offer declined';
  }
  if (m.type === 'listing_share') {
    const label = m.listing?.title
      ? `Shared a listing · ${m.listing.title}`
      : 'Shared a listing';
    return who && group ? `${who}: ${label}` : label;
  }
  return m.systemTitle ?? c.lastMessage ?? '';
}

/**
 * Row timestamp — authored compact labels ('2m', 'now', 'Yesterday') pass
 * through untouched; parseable timestamps (live API ISO strings) render in
 * the same compact grammar: 'now' / 'Nm' / 'Nh' / 'Yesterday' / 'Nd' / short
 * date. Mirrors mobile formatInboxTimestamp — never a raw ISO in the list.
 *
 * Day boundaries and the absolute branch are computed in UTC: the server
 * and the client must agree on the same instant's label or hydration
 * drifts (their local calendars can differ by a day). Relative minutes
 * stay epoch arithmetic — timezone-free by construction.
 */
export function formatInboxTimestamp(value: string): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const now = Date.now();
  const diffMin = Math.floor((now - d.getTime()) / 60_000);
  if (diffMin < 1) return 'now';
  if (diffMin < 60) return `${diffMin}m`;
  const utcDay = (t: number) => Math.floor(t / 86_400_000);
  const diffDay = utcDay(now) - utcDay(d.getTime());
  if (diffDay <= 0) return `${Math.floor(diffMin / 60)}h`;
  if (diffDay === 1) return 'Yesterday';
  if (diffDay < 7) return `${diffDay}d`;
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

/**
 * Delivery status of the user's own last message — check / double-check /
 * clock glyph before the preview. Undefined when the last message isn't
 * ours or carries no receipt — the row shows no glyph rather than claiming
 * a state it can't prove (mirrors deriveInboxDeliveryStatus).
 */
export function deriveDeliveryStatus(c: Conversation): InboxDeliveryStatus | undefined {
  const m = c.messages.length ? c.messages[c.messages.length - 1] : undefined;
  if (!m || !isMine(m)) return undefined;
  return m.readStatus ?? 'sent';
}
