'use client';

import { useCallback, useMemo, useState } from 'react';
import type { Conversation, Message } from '@/lib/contracts/domain';
import { MESSAGE_EDIT_WINDOW_MS } from '@/lib/hooks/chat-queries';
import { sharedMediaItemFor, type SharedMediaItem } from '../SharedMediaGrid';
import {
  groupByDay,
  isMine,
  isSystem,
  isOffer,
} from './ChatStreamUtils';

interface UseChatMessageFeedOptions {
  conversation?: Conversation | null;
  historyOlder: Message[];
  pending: Message[];
  query: string;
  pin: { messageId: string; message?: Message } | null;
  composerOpen: boolean;
  receiptsEnabled: boolean;
  senderNameFor: (m: Message) => string;
  previewTextFor: (m: Message) => string;
  msgMenu: { id: string; x: number; y: number } | null;
}

/**
 * Message feed indexing and presentation workflow:
 *  - Deterministic deduplication across paged history, live query, and optimistic cache
 *  - Client search query filtering
 *  - Temporal day grouping (sticky headers)
 *  - Action capabilities (replyable, actionable, editable within 15m window)
 *  - Shared media carousel extraction
 */
export function useChatMessageFeed({
  conversation,
  historyOlder,
  pending,
  query,
  pin,
  composerOpen,
  receiptsEnabled,
  senderNameFor,
  previewTextFor,
  msgMenu,
}: UseChatMessageFeedOptions) {
  const [mediaIndex, setMediaIndex] = useState<number | null>(null);

  const messages = useMemo(() => {
    const merged: Message[] = [];
    const indexById = new Map<string, number>();
    for (const m of [...historyOlder, ...(conversation?.messages ?? []), ...pending]) {
      const at = indexById.get(m.id);
      if (at === undefined) {
        indexById.set(m.id, merged.length);
        merged.push(m);
      } else {
        merged[at] = m;
      }
    }
    return merged;
  }, [historyOlder, conversation?.messages, pending]);

  const mediaItems = useMemo<SharedMediaItem[]>(
    () =>
      conversation
        ? messages
            .map((m) => sharedMediaItemFor(conversation, m))
            .filter((x): x is SharedMediaItem => x !== null)
        : [],
    [conversation, messages],
  );

  const openMediaFor = useCallback(
    (m: Message) => {
      const at = mediaItems.findIndex((it) => it.id === m.id);
      if (at >= 0) setMediaIndex(at);
    },
    [mediaItems],
  );

  const searchQuery = query.trim();
  const matches = useMemo(() => {
    if (!searchQuery) return messages;
    const needle = searchQuery.toLowerCase();
    return messages.filter(
      (m) =>
        !m.isDeleted &&
        (m.text ?? m.systemTitle ?? '').toLowerCase().includes(needle),
    );
  }, [messages, searchQuery]);

  const messageById = useMemo(
    () => new Map(messages.map((m) => [m.id, m])),
    [messages],
  );

  const replyInfoFor = useCallback(
    (m: Message): { senderName: string; text: string } | undefined => {
      if (!m.replyToMessageId) return undefined;
      const parent = messageById.get(m.replyToMessageId);
      if (!parent) return undefined;
      return {
        senderName: senderNameFor(parent),
        text: previewTextFor(parent),
      };
    },
    [messageById, senderNameFor, previewTextFor],
  );

  const pinnedView = useMemo(() => {
    if (!pin) return null;
    const m = messageById.get(pin.messageId) ?? pin.message;
    if (!m || m.isDeleted) return null;
    return {
      messageId: pin.messageId,
      senderLabel: senderNameFor(m),
      text: previewTextFor(m),
    };
  }, [pin, messageById, senderNameFor, previewTextFor]);

  const groups = useMemo(() => groupByDay(matches), [matches]);
  const lastMine = [...messages].reverse().find(isMine);
  const lastMineReadId =
    receiptsEnabled && lastMine?.readStatus === 'read' ? lastMine.id : undefined;

  const replyable = useCallback(
    (m: Message) =>
      composerOpen && !isSystem(m) && !m.isDeleted && !m.id.startsWith('opt-'),
    [composerOpen],
  );

  const actionable = useCallback(
    (m: Message) =>
      !isSystem(m) && !m.isDeleted && !m.id.startsWith('opt-'),
    [],
  );

  const editable = useCallback(
    (m: Message) =>
      isMine(m) &&
      actionable(m) &&
      Boolean(m.text) &&
      !m.mediaUri &&
      !isOffer(m) &&
      m.type !== 'listing_share' &&
      m.type !== 'voice' &&
      m.type !== 'document' &&
      !Number.isNaN(Date.parse(m.timestamp)) &&
      Date.now() - Date.parse(m.timestamp) >= 0 &&
      Date.now() - Date.parse(m.timestamp) < MESSAGE_EDIT_WINDOW_MS,
    [actionable],
  );

  const menuMessage = msgMenu
    ? messages.find((mm) => mm.id === msgMenu.id)
    : undefined;

  return {
    messages,
    mediaItems,
    mediaIndex,
    setMediaIndex,
    openMediaFor,
    searchQuery,
    matches,
    messageById,
    replyInfoFor,
    pinnedView,
    groups,
    lastMineReadId,
    replyable,
    actionable,
    editable,
    menuMessage,
  };
}
