import type { Conversation, Message } from '@/lib/contracts/domain';
import { isVideoUri } from '@/lib/utils/media';
import { senderLabelFor } from '../inboxModel';

export interface SharedMediaItem {
  id: string;
  uri: string;
  isVideo: boolean;
  senderLabel: string;
  timestamp?: string;
}

export const isLocalUri = (uri: string) =>
  uri.startsWith('blob:') || uri.startsWith('data:');

export function isMine(m: Message): boolean {
  return m.sender === 'me' || m.senderId === 'me';
}

/**
 * sharedMediaItemFor — one Message → SharedMediaItem mapping for every
 * media surface (the info grid and the inline thread lightbox share it,
 * so a deleted message's payload can't survive in either).
 */
export function sharedMediaItemFor(
  c: Conversation,
  m: Message,
): SharedMediaItem | null {
  if (m.isDeleted) return null;
  if (!m.mediaUri) return null;
  return {
    id: m.id,
    uri: m.mediaUri,
    isVideo: m.mediaType === 'video' || isVideoUri(m.mediaUri),
    senderLabel: isMine(m) ? 'You' : senderLabelFor(c, m.senderId),
    timestamp: m.timestamp,
  };
}

export function sharedMediaItemsFor(c: Conversation): SharedMediaItem[] {
  return (c.messages ?? [])
    .map((m) => sharedMediaItemFor(c, m))
    .filter((x): x is SharedMediaItem => x !== null);
}

export function formatStamp(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
