'use client';

/**
 * ChatStreamUtils — date separators, cluster clustering logic,
 * message type classifiers, and the "New messages" divider.
 */

import type { Message } from '@/lib/contracts/domain';

/**
 * Date-divider label — 'Today', 'Yesterday', weekday name, or 'Wed, 24 Sep'.
 */
export function dayLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((today.getTime() - day.getTime()) / 86_400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) {
    return d.toLocaleDateString('en-GB', { weekday: 'short' });
  }
  return d.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export interface MessageGroup {
  key: string;
  label: string;
  messages: Message[];
}

export function groupByDay(messages: Message[]): MessageGroup[] {
  const groups: MessageGroup[] = [];
  for (const m of messages) {
    const key = Number.isNaN(new Date(m.timestamp).getTime())
      ? ''
      : new Date(m.timestamp).toDateString();
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.messages.push(m);
    } else {
      groups.push({
        key,
        label: key ? dayLabel(m.timestamp) : '',
        messages: [m],
      });
    }
  }
  return groups;
}

// Live offers render as cards; an 'offer_declined' record is commerce prose
// and falls through to the text bubble, same as the row preview.
export function isOffer(m: Message): boolean {
  return (
    m.type === 'offer' ||
    (m.offerPrice != null && m.type !== 'offer_declined')
  );
}

export function isMine(m: Message): boolean {
  return m.sender === 'me' || m.senderId === 'me';
}

export function isSystem(m: Message): boolean {
  return (
    m.isSystem === true || m.type === 'system' || m.sender === 'system'
  );
}

/**
 * Same-sender run test — system rows and tombstones break a cluster.
 */
export function sameRun(a: Message, b: Message): boolean {
  return (
    !isSystem(a) &&
    !isSystem(b) &&
    !a.isDeleted &&
    !b.isDeleted &&
    a.senderId === b.senderId &&
    isMine(a) === isMine(b)
  );
}

/**
 * "New messages" divider — brand hairlines flanking a quiet pill.
 */
export function NewMessagesDivider() {
  return (
    <div
      role="separator"
      className="my-3 flex items-center gap-2"
      aria-label="New messages"
    >
      <span className="h-px flex-1 bg-brand" aria-hidden />
      <span className="rounded-full bg-brand-subtle px-2.5 py-1 text-meta font-semibold text-brand">
        New messages
      </span>
      <span className="h-px flex-1 bg-brand" aria-hidden />
    </div>
  );
}
