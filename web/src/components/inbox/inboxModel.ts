'use client';

/**
 * inboxModel — shared inbox derivations, ported from mobile
 * components/inbox/inboxViewModels.ts + the store's appendConversationMessage
 * preview grammar. One source so the row, the sheet and the thread agree.
 */

import type { Conversation, Message } from '@/lib/contracts/domain';
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
export function mosaicMembers(c: Conversation): MosaicMember[] {
  const profiles = c.participantProfiles ?? [];
  const others = profiles.filter((p) => p.id !== 'me');
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
 *  - system        → its title/body verbatim
 *  - offer         → "You sent an offer · £32" / "{name} sent an offer · £32" / "Offer · £32"
 *  - image         → "📷 Photo" (sender-prefixed in groups)
 *  - video         → "🎥 Video" (sender-prefixed in groups)
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

  if (isSystem(m)) return m.systemTitle ?? m.text ?? c.lastMessage;

  const group = isGroupConversation(c);
  const mine = isMine(m);
  const who = mine ? 'You' : group ? senderHandleFor(c, m.senderId) : null;

  // A live offer card previews as an offer; a decline record is commerce
  // prose, so it falls through to its text / the declined label below.
  if (isOffer(m) && m.type !== 'offer_declined') {
    const amount = formatPrice(m.offerPrice);
    const label = amount ? `an offer · ${amount}` : 'an offer';
    return who ? `${who} sent ${label}` : amount ? `Offer · ${amount}` : 'Offer';
  }
  if (m.mediaUri || m.mediaType) {
    const noun = m.mediaType === 'video' ? '🎥 Video' : '📷 Photo';
    return who && group ? `${who}: ${noun}` : noun;
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
 */
export function formatInboxTimestamp(value: string): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const now = new Date();
  const diffMin = Math.floor((now.getTime() - d.getTime()) / 60_000);
  if (diffMin < 1) return 'now';
  if (diffMin < 60) return `${diffMin}m`;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDay = Math.round((today.getTime() - day.getTime()) / 86_400_000);
  if (diffDay <= 0) return `${Math.floor(diffMin / 60)}h`;
  if (diffDay === 1) return 'Yesterday';
  if (diffDay < 7) return `${diffDay}d`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
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
