'use client';

/**
 * chat-realtime — the web SSE twin of the native realtimeClient chat
 * subscriptions (frontend/src/services/realtimeClient.ts). The backend's
 * WS route requires a Bearer header browser WebSocket can't send, so the
 * transport is the SSE twin (/realtime/stream?topics=…) over fetch — the
 * same grammar useCoOwnOrderBookStream established.
 *
 * Two subscription surfaces:
 *
 *   useConversationRealtime — one open thread: `chat.conversation:{id}`
 *     (+ `presence.user:{peer}` for DMs). Handles the full emitted
 *     vocabulary — message created/deleted/edited, reactions, save-state,
 *     pin/unpin, read receipts, poll votes, membership and group events —
 *     merging into the react-query caches the REST hooks own, with
 *     invalidation for anything structural. A seq gap or a dropped
 *     connection resyncs via invalidation (the backend's gap → resnapshot
 *     contract), never trusting deltas across a break.
 *
 *   useInboxRealtime — the conversation list: `chat.user:{userId}` (new-DM
 *     / new-group / added-to-group signals can never arrive on a
 *     per-conversation topic the client doesn't know) plus the loaded
 *     conversations' topics so row previews and unread badges move live.
 *     The REST poll in useConversations stays the fallback baseline.
 *
 *   useNotificationRealtime — app-wide `notifications.user:{userId}`.
 *
 * Transport: every surface registers its topics with ONE module-level
 * stream manager — the backend endpoint is already multiplexed
 * (/realtime/stream?topics=a,b,c), so the app-wide notification feed,
 * the inbox topics and the open-thread topics ride a single connection
 * instead of one fetch-stream per hook (on /inbox/[id] that collapsed
 * 3 concurrent streams into 1). Subscribing again on a topic set already
 * covered is free; frames are delivered only to subscribers of their
 * topic, so each hook sees exactly what its own dedicated stream would
 * have delivered.
 *
 * Guests and fixture mode never connect — REST stays the only truth there.
 */

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { DATA_MODE } from '@/lib/api/client';
import { getApiBaseUrl, getAuthSession } from '@/lib/api/http';
import {
  realtimePayloadToWebMessage,
  type MessageWithSaveState,
} from '@/lib/api/services/chat';
import { useSessionIdentity } from '@/lib/session/SessionProvider';
import { useHydrated } from '@/lib/store/useStore';
import type { Conversation, Message } from '@/lib/contracts/domain';
import { useConversations } from './queries';

export interface ChatRealtimeEnvelope {
  topic?: string;
  type?: string;
  payload?: Record<string, unknown>;
  seq?: number;
}

const CONVERSATION_KEY = (id: string, userKey: string) =>
  ['conversation', id, userKey] as const;
const PRESENCE_KEY = (id: string) => ['conversation-presence', id] as const;

function isMine(m: Message, viewerId: string): boolean {
  return m.sender === 'me' || (viewerId !== '' && m.senderId === viewerId);
}

// ── Pure message patchers — the per-event merge grammar ──────────────────

/** scope='everyone' tombstone — payload fields are stripped, never kept
 *  in a hidden state the UI could leak (mirrors chat-queries toTombstone). */
export function tombstoneMessage(m: Message): Message {
  return {
    ...m,
    isDeleted: true,
    text: undefined,
    mediaUri: undefined,
    mediaType: undefined,
    posterUri: undefined,
    voiceUri: undefined,
    voiceWaveform: undefined,
    documentUri: undefined,
    documentName: undefined,
    documentMimeType: undefined,
    reactions: undefined,
    offerPrice: undefined,
    originalPrice: undefined,
    listing: undefined,
    itemImage: undefined,
  };
}

/** chat.reaction.added / chat.reaction.removed — maintain the userIds set
 *  truthfully (the REST serializer's shape), deriving count/reactedByMe. */
export function applyReactionEvent(
  m: Message,
  emoji: string,
  userId: string,
  added: boolean,
  viewerId: string,
): Message {
  const reactions = [...(m.reactions ?? [])];
  const idx = reactions.findIndex((r) => r.emoji === emoji);
  const bucket = idx >= 0 ? reactions[idx] : undefined;
  const userIds = new Set(bucket?.userIds ?? []);
  if (added) userIds.add(userId);
  else userIds.delete(userId);
  if (userIds.size === 0) {
    if (idx >= 0) reactions.splice(idx, 1);
  } else {
    const next = {
      emoji,
      userIds: [...userIds],
      count: userIds.size,
      reactedByMe: viewerId !== '' && userIds.has(viewerId),
    };
    if (idx >= 0) reactions[idx] = next;
    else reactions.push(next);
  }
  return { ...m, reactions };
}

/** chat.message.saved / chat.message.unsaved — the payload carries the
 *  full post-change savedBy set; apply it verbatim (negotiated persistence
 *  is shared state, identical on both sides). */
export function applySaveEvent(
  m: Message,
  savedBy: string[] | undefined,
  savedAt: string | null | undefined,
): MessageWithSaveState {
  const target = m as MessageWithSaveState;
  return {
    ...target,
    savedBy: savedBy ?? [],
    savedAt: savedAt ?? undefined,
  };
}

/** chat.message.read — another participant's receipt flips the viewer's
 *  own messages to 'read'. `messageIds` receipts mark exactly those;
 *  cursor/readAt receipts mark every own message at-or-before the read
 *  stamp. Sending/pending rows are skipped (no server timestamp). */
export function applyReadEvent(
  m: Message,
  readerId: string,
  readAt: string | undefined,
  messageIds: ReadonlySet<string> | null,
  viewerId: string,
): Message {
  if (!isMine(m, viewerId) || m.readStatus === 'sending' || m.readStatus === 'read') {
    return m;
  }
  if (messageIds) {
    return messageIds.has(m.id) ? { ...m, readStatus: 'read' } : m;
  }
  const readAtMs = readAt ? new Date(readAt).getTime() : NaN;
  const msgMs = new Date(m.timestamp).getTime();
  if (!Number.isNaN(readAtMs) && !Number.isNaN(msgMs) && msgMs <= readAtMs) {
    return { ...m, readStatus: 'read' };
  }
  return m;
}

/** Apply `fn` to one message inside the conversation cache entry. `fn`
 *  returning null removes the row (delete-for-me). */
function patchCachedMessage(
  qc: ReturnType<typeof useQueryClient>,
  conversationId: string,
  userKey: string,
  messageId: string,
  fn: (m: Message) => Message | null,
) {
  qc.setQueryData<Conversation | null>(
    CONVERSATION_KEY(conversationId, userKey),
    (old) =>
      old
        ? {
            ...old,
            messages: old.messages
              .map((m) => (m.id === messageId ? fn(m) : m))
              .filter((m): m is Message => m !== null),
          }
        : old,
  );
}

/**
 * Inbox-row merge for a new incoming message — the native
 * upsertConversation grammar: append to the row's message list (deduped),
 * refresh lastMessage/lastMessageTime, bump unread unless the viewer sent
 * it, the row is already counted, or the thread is currently open (the
 * open thread's own mark-read owns that conversation's badge).
 */
export function mergeIncomingIntoRow(
  c: Conversation,
  m: Message,
  viewerId: string,
  openConversationId?: string,
): Conversation {
  const alreadyStored = c.messages.some((x) => x.id === m.id);
  const mine = isMine(m, viewerId);
  return {
    ...c,
    lastMessage: m.text || c.lastMessage,
    lastMessageTime: m.timestamp || c.lastMessageTime,
    messages: alreadyStored ? c.messages : [...c.messages, m],
    unread: mine || c.id === openConversationId ? c.unread : true,
    unreadCount:
      mine || alreadyStored || c.id === openConversationId
        ? (c.unreadCount ?? 0)
        : (c.unreadCount ?? 0) + 1,
  };
}

// ── Shared SSE pump ──────────────────────────────────────────────────────

interface StreamSubscriber {
  /** The topic set this subscriber asked for — frames are delivered only
   *  to subscribers of their topic, so a shared connection changes
   *  nothing about what each hook observes. */
  topics: ReadonlySet<string>;
  onEvent: (event: ChatRealtimeEnvelope) => void;
  onResync?: () => void;
}

/**
 * Module-level stream registry. `/realtime/stream` accepts an arbitrary
 * topic list, so instead of one connection per hook the union of every
 * active subscription's topics rides a SINGLE connection.
 *
 * Lifecycle:
 *   - subscribe → recompute the union; connect cold, or debounce a
 *     reconnect when the union moved under a live stream. The debounce
 *     (~150ms) coalesces StrictMode double-mounts and inbox-list churn
 *     (up to 40 `chat.conversation:*` topics can change in one commit)
 *     into one re-subscribe.
 *   - reconnect — drop or deliberate — resyncs EVERY subscriber: SSE has
 *     no replay, and the abort→connect window is a blind spot the caches
 *     must not trust. A mid-stream seq gap resyncs only the subscribers
 *     of the gapped topic (seq is per-topic server-side).
 *   - last unsubscribe → abort + clear; next subscribe cold-starts.
 *   - 401/403 is terminal (a revoked token won't heal on backoff) until
 *     the subscription set changes — a new login's fresh token deserves
 *     a fresh attempt.
 */
const streamSubscribers = new Set<StreamSubscriber>();
let streamController: AbortController | null = null;
let streamRetryTimer: ReturnType<typeof setTimeout> | null = null;
let streamResubscribeTimer: ReturnType<typeof setTimeout> | null = null;
/** Supersede token — bumped on every connect/teardown so a superseded
 *  pump can never resync or schedule retries after its death. */
let streamGeneration = 0;
let streamAttempt = 0;
let streamTerminal = false;
/** Set when a deliberate reconnect (topic churn under a live stream) is
 *  pending — the abort→connect window is a blind spot, so a resync is
 *  owed once the replacement stream is live. */
let streamPendingResync = false;
/** The desired union key the live (or next) connection must carry. */
let streamTopicsKey = '';
/** Per-topic seq watermarks — backend getNextSequence is per-topic. */
const streamLastSeq = new Map<string, number>();

function subscribedTopicsKey(): string {
  const all = new Set<string>();
  for (const sub of streamSubscribers) {
    for (const t of sub.topics) all.add(t);
  }
  return [...all].sort().join(',');
}

function resyncAll() {
  for (const sub of streamSubscribers) {
    try {
      sub.onResync?.();
    } catch {
      // A resync handler must never kill the pump loop.
    }
  }
}

function resyncTopic(topic: string) {
  for (const sub of streamSubscribers) {
    if (!topic || sub.topics.has(topic)) {
      try {
        sub.onResync?.();
      } catch {
        // Same isolation as resyncAll.
      }
    }
  }
}

function dispatchStreamEvent(event: ChatRealtimeEnvelope) {
  const topic = typeof event.topic === 'string' ? event.topic : '';
  if (typeof event.seq === 'number' && topic) {
    const last = streamLastSeq.get(topic) ?? 0;
    if (last > 0 && event.seq > last + 1) {
      // Missed events — resnapshot the topic's subscribers first, then
      // still apply this frame: it was published post-commit, so the
      // refetch lands it anyway.
      resyncTopic(topic);
    }
    streamLastSeq.set(topic, Math.max(last, event.seq));
  }
  for (const sub of streamSubscribers) {
    // Topic-scoped delivery — a shared connection must not hand a
    // subscriber frames it never asked for (handlers guard too, but
    // scoping here keeps each hook's contract identical to a dedicated
    // stream). Untopiced frames go to everyone, matching the old
    // per-connection behaviour.
    if (topic && !sub.topics.has(topic)) continue;
    try {
      sub.onEvent(event);
    } catch {
      // A handler must never kill the pump — the next frame still lands.
    }
  }
}

async function connectStream() {
  const generation = ++streamGeneration;
  const stale = () => generation !== streamGeneration;
  const topicKey = streamTopicsKey;
  if (!topicKey || streamTerminal || DATA_MODE !== 'live') return;

  const controller = new AbortController();
  streamController = controller;
  try {
    const session = await getAuthSession();
    if (stale()) return;
    if (!session?.accessToken) throw new Error('no token');
    const url = `${getApiBaseUrl()}/realtime/stream?topics=${encodeURIComponent(topicKey)}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
      signal: controller.signal,
    });
    if (response.status === 401 || response.status === 403) {
      // Auth gate is terminal — retrying cannot change it. REST polls
      // stay the baseline until the subscription set changes.
      streamTerminal = true;
      return;
    }
    if (!response.ok || !response.body) {
      throw new Error(`stream failed (${response.status})`);
    }
    streamAttempt = 0;
    if (streamPendingResync) {
      // Stream is live again after a deliberate teardown — anything that
      // landed in the blind window is only reachable via a resnapshot.
      streamPendingResync = false;
      resyncAll();
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let dataLines: string[] = [];
    const flush = () => {
      if (dataLines.length === 0) return;
      try {
        dispatchStreamEvent(JSON.parse(dataLines.join('\n')) as ChatRealtimeEnvelope);
      } catch {
        // Malformed frame — drop it; a missed seq still resyncs.
      }
      dataLines = [];
    };
    for (;;) {
      const { done, value } = await reader.read();
      if (done || stale()) break;
      buffer += decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).replace(/\r$/, '');
        buffer = buffer.slice(newline + 1);
        if (line === '') flush();
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
        // `event:`/`id:`/comment (heartbeat) lines need no handling.
      }
    }
  } catch {
    // Aborted intentionally or network drop — handled below.
  } finally {
    if (streamController === controller) streamController = null;
  }

  if (stale() || streamTerminal) return;
  // The gap between connections may have lost events — resnapshot.
  streamLastSeq.clear();
  resyncAll();
  const delayMs = Math.min(1000 * 2 ** streamAttempt, 15_000);
  streamAttempt += 1;
  streamRetryTimer = setTimeout(() => {
    streamRetryTimer = null;
    if (generation === streamGeneration) void connectStream();
  }, delayMs);
}

function teardownStream() {
  streamGeneration += 1;
  streamController?.abort();
  streamController = null;
  if (streamRetryTimer) {
    clearTimeout(streamRetryTimer);
    streamRetryTimer = null;
  }
  streamAttempt = 0;
  streamLastSeq.clear();
}

/**
 * Reconcile the live connection with the current subscription union —
 * called after every subscribe/unsubscribe.
 */
function syncStream() {
  const nextKey = subscribedTopicsKey();
  if (nextKey === streamTopicsKey) return; // union unchanged — nothing to do
  streamTopicsKey = nextKey;
  // The membership moved — a new subscriber may carry a fresh token, so
  // a terminal auth gate gets one more honest attempt.
  streamTerminal = false;
  if (streamResubscribeTimer) {
    clearTimeout(streamResubscribeTimer);
    streamResubscribeTimer = null;
  }
  if (!nextKey) {
    // Empty union — keep the stream hot briefly rather than tearing down
    // on the spot. StrictMode's mount→unmount→mount and route transitions
    // (inbox unmounts, thread mounts a beat later) re-subscribe inside
    // the window and cancel the teardown entirely — zero reconnect churn.
    streamResubscribeTimer = setTimeout(() => {
      streamResubscribeTimer = null;
      teardownStream();
    }, 150);
    return;
  }
  if (!streamController) {
    // Cold start (or mid-backoff) — connect now, no debounce.
    void connectStream();
    return;
  }
  // Topic churn under a live stream — debounce so mount/unmount bursts
  // and inbox-list updates collapse into one reconnect instead of a
  // connect/abort/connect thrash. The deliberate teardown's stale() exit
  // skips the drop-path resync, so flag it owed: frames lost in the
  // abort→connect window are recovered by resyncAll() once the new
  // stream is live.
  streamPendingResync = true;
  streamResubscribeTimer = setTimeout(() => {
    streamResubscribeTimer = null;
    teardownStream();
    void connectStream();
  }, 150);
}

/**
 * Subscribe to a set of realtime topics over the SSE endpoint. Events
 * dispatch to `onEvent`; a per-topic seq gap or a dropped connection fires
 * `onResync` so callers resnapshot rather than trust state across a break.
 * 401/403 is terminal (a revoked token won't heal on backoff); everything
 * else reconnects with capped exponential backoff.
 *
 * The subscription registers with the shared stream manager — callers
 * never own a connection, so N mounted realtime hooks cost ONE stream.
 */
export function useChatRealtime({
  topics,
  enabled,
  onEvent,
  onResync,
}: {
  topics: Array<string | null | undefined>;
  enabled: boolean;
  onEvent: (event: ChatRealtimeEnvelope) => void;
  onResync?: () => void;
}) {
  const topicsKey = topics
    .filter((t): t is string => typeof t === 'string' && t.length > 0)
    .sort()
    .join(',');
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const onResyncRef = useRef(onResync);
  onResyncRef.current = onResync;

  useEffect(() => {
    if (DATA_MODE !== 'live' || !enabled || !topicsKey) return;
    const subscriber: StreamSubscriber = {
      topics: new Set(topicsKey.split(',')),
      onEvent: (event) => onEventRef.current(event),
      onResync: () => onResyncRef.current?.(),
    };
    streamSubscribers.add(subscriber);
    syncStream();
    return () => {
      streamSubscribers.delete(subscriber);
      syncStream();
    };
  }, [topicsKey, enabled]);
}

// ── Conversation thread ──────────────────────────────────────────────────

export interface ConversationRealtimeOptions {
  conversationId: string;
  /** The signed-in viewer — own events are handled (multi-device sync) or
   *  filtered (typing self-echo) per the native grammar. */
  viewerId: string;
  /** DM counterparty — subscribing `presence.user:{peer}` requires a DM
   *  channel server-side; groups carry no presence topic. */
  peerUserId?: string | null;
  enabled: boolean;
  /**
   * A `chat.message.created` whose clientMessageId matches an in-flight
   * optimistic send — the caller drops the pending bubble (the mapped
   * server copy is appended to the cache in the same beat).
   */
  onServerEcho?: (clientMessageId: string, message: Message) => void;
  /** pin/unpin landed — the caller refetches the pinned bar. */
  onPinChanged?: () => void;
  /** Patch a message inside paged older-history state so events apply
   *  below the fetched window too (same fn as the thread actions use). */
  patchOlder?: (id: string, fn: (m: Message) => Message | null) => void;
}

/**
 * The open thread's realtime surface — returns the counterparty typing
 * set and keeps the conversation/inbox caches honest off the emitted
 * event vocabulary. Typing entries auto-expire (4s per typer) and clear
 * across a reconnect so a missed isTyping=false can't stick.
 */
export function useConversationRealtime({
  conversationId,
  viewerId,
  peerUserId,
  enabled,
  onServerEcho,
  onPinChanged,
  patchOlder,
}: ConversationRealtimeOptions): { typingUserIds: string[] } {
  const qc = useQueryClient();
  const userKey = viewerId || 'guest';
  const [typingIds, setTypingIds] = useState<string[]>([]);
  const clearTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const onServerEchoRef = useRef(onServerEcho);
  onServerEchoRef.current = onServerEcho;
  const onPinChangedRef = useRef(onPinChanged);
  onPinChangedRef.current = onPinChanged;
  const patchOlderRef = useRef(patchOlder);
  patchOlderRef.current = patchOlder;

  const markTyping = (userId: string, isTyping: boolean) => {
    if (!userId || userId === viewerId) return;
    const existing = clearTimers.current.get(userId);
    if (existing) clearTimeout(existing);
    if (isTyping) {
      setTypingIds((prev) => (prev.includes(userId) ? prev : [...prev, userId]));
      clearTimers.current.set(
        userId,
        setTimeout(() => {
          setTypingIds((prev) => prev.filter((id) => id !== userId));
          clearTimers.current.delete(userId);
        }, 4000),
      );
    } else {
      clearTimers.current.delete(userId);
      setTypingIds((prev) => prev.filter((id) => id !== userId));
    }
  };

  const clearAllTyping = () => {
    for (const t of clearTimers.current.values()) clearTimeout(t);
    clearTimers.current.clear();
    setTypingIds([]);
  };

  const invalidateThread = () => {
    void qc.invalidateQueries({ queryKey: ['conversation', conversationId] });
    void qc.invalidateQueries({ queryKey: ['conversations'] });
  };

  /** Patch the message everywhere it can live — page-1 cache + older pages. */
  const patchMessage = (messageId: string, fn: (m: Message) => Message | null) => {
    patchCachedMessage(qc, conversationId, userKey, messageId, fn);
    patchOlderRef.current?.(messageId, fn);
  };

  const handleEvent = (event: ChatRealtimeEnvelope) => {
    const payload = event.payload ?? {};
    const eventConversationId =
      typeof payload.conversationId === 'string' ? payload.conversationId : '';
    // Events on this stream can only be for this conversation (the topic
    // is scoped) or the peer's presence topic — guard anyway.
    const forThisThread = !eventConversationId || eventConversationId === conversationId;

    switch (event.type) {
      case 'chat.typing.update': {
        if (!forThisThread || typeof payload.userId !== 'string') return;
        markTyping(payload.userId, payload.isTyping === true);
        return;
      }
      case 'presence.update': {
        if (typeof payload.userId !== 'string') return;
        // Keep the REST snapshot's cache honest — a transition event is
        // fresher than the last poll and carries the same shape.
        qc.setQueryData(PRESENCE_KEY(conversationId), () => ({
          userId: payload.userId as string,
          isOnline: payload.isOnline === true,
          lastSeenAt: typeof payload.lastSeenAt === 'string' ? payload.lastSeenAt : null,
        }));
        return;
      }
      case 'chat.message.created': {
        if (!forThisThread) return;
        const mapped = realtimePayloadToWebMessage(payload, viewerId);
        if (!mapped) {
          invalidateThread();
          return;
        }
        const cmid =
          typeof payload.clientMessageId === 'string' ? payload.clientMessageId : '';
        const ownEcho = Boolean(cmid) && payload.senderUserId === viewerId;
        if (ownEcho && cmid) onServerEchoRef.current?.(cmid, mapped);
        // Append to the thread cache (deduped by id — the REST refetch or
        // an own-send reconcile may have landed it already).
        qc.setQueryData<Conversation | null>(
          CONVERSATION_KEY(conversationId, userKey),
          (old) =>
            old && !old.messages.some((m) => m.id === mapped.id)
              ? { ...old, messages: [...old.messages, mapped] }
              : old,
        );
        // Inbox row — preview + unread, same grammar as the inbox stream.
        qc.setQueriesData<Conversation[]>(
          { queryKey: ['conversations'] },
          (old) =>
            old?.map((c) =>
              c.id === conversationId
                ? mergeIncomingIntoRow(c, mapped, viewerId, conversationId)
                : c,
            ),
        );
        return;
      }
      case 'chat.message.deleted': {
        const messageId = typeof payload.messageId === 'string' ? payload.messageId : '';
        if (!forThisThread || !messageId) return;
        if (payload.scope === 'everyone') {
          patchMessage(messageId, (m) => tombstoneMessage(m));
        } else if (payload.scope === 'me') {
          // Per-user removal — only the actor's own view changes; on a
          // second device of the actor's the row drops too, otherwise the
          // event means nothing to this client.
          if (payload.actorUserId === viewerId) {
            patchMessage(messageId, () => null);
          }
          return;
        }
        invalidateThread();
        return;
      }
      case 'chat.message.edited': {
        const messageId = typeof payload.messageId === 'string' ? payload.messageId : '';
        if (!forThisThread || !messageId) return;
        const body = typeof payload.body === 'string' ? payload.body : undefined;
        if (body === undefined) {
          invalidateThread();
          return;
        }
        patchMessage(messageId, (m) => ({ ...m, text: body, isEdited: true }));
        return;
      }
      case 'chat.reaction.added':
      case 'chat.reaction.removed': {
        const messageId = typeof payload.messageId === 'string' ? payload.messageId : '';
        const userId = typeof payload.userId === 'string' ? payload.userId : '';
        const emoji = typeof payload.emoji === 'string' ? payload.emoji : '';
        if (!forThisThread || !messageId || !userId || !emoji) return;
        patchMessage(messageId, (m) =>
          applyReactionEvent(m, emoji, userId, event.type === 'chat.reaction.added', viewerId),
        );
        return;
      }
      case 'chat.message.saved':
      case 'chat.message.unsaved': {
        const messageId = typeof payload.messageId === 'string' ? payload.messageId : '';
        if (!forThisThread || !messageId) return;
        const savedBy = Array.isArray(payload.savedBy)
          ? payload.savedBy.filter((x): x is string => typeof x === 'string')
          : [];
        const savedAt = typeof payload.savedAt === 'string' ? payload.savedAt : null;
        patchMessage(messageId, (m) => applySaveEvent(m, savedBy, savedAt));
        return;
      }
      case 'chat.message.pinned':
      case 'chat.message.unpinned': {
        if (!forThisThread) return;
        onPinChangedRef.current?.();
        return;
      }
      case 'chat.message.read': {
        const readerId = typeof payload.userId === 'string' ? payload.userId : '';
        if (!readerId) return;
        if (readerId === viewerId) {
          // Multi-device read sync — this thread was read on another
          // device; clear the unread state here without a refetch.
          qc.setQueriesData<Conversation[]>({ queryKey: ['conversations'] }, (old) =>
            old?.map((c) =>
              c.id === conversationId ? { ...c, unread: false, unreadCount: 0 } : c,
            ),
          );
          qc.setQueryData<Conversation | null>(
            CONVERSATION_KEY(conversationId, userKey),
            (old) => (old ? { ...old, unread: false, unreadCount: 0 } : old),
          );
          return;
        }
        const messageIds = Array.isArray(payload.messageIds)
          ? new Set(payload.messageIds.filter((x): x is string => typeof x === 'string'))
          : null;
        const readAt = typeof payload.readAt === 'string' ? payload.readAt : undefined;
        const applyRead = (m: Message) =>
          applyReadEvent(m, readerId, readAt, messageIds, viewerId);
        qc.setQueryData<Conversation | null>(
          CONVERSATION_KEY(conversationId, userKey),
          (old) => (old ? { ...old, messages: old.messages.map(applyRead) } : old),
        );
        // patchOlder applies fn per id — the read window spans many
        // messages, so a targeted patch can't reach them; the 15s poll /
        // next invalidation reconciles older pages' read state.
        return;
      }
      case 'chat.poll.voted': {
        if (!forThisThread) return;
        const messageId = typeof payload.messageId === 'string' ? payload.messageId : '';
        const voteCounts = Array.isArray(payload.voteCounts)
          ? payload.voteCounts.filter((n): n is number => typeof n === 'number')
          : null;
        if (!messageId || !voteCounts) {
          invalidateThread();
          return;
        }
        // Patch counts in place — every member converges without a
        // refetch. `myVotes` moves only when the broadcast identifies
        // the voter as the viewer (non-anonymous polls carry
        // voterVotes; anonymous broadcasts strip identity, and the
        // voter's own HTTP response already rewrote their myVotes).
        const voterIsViewer =
          typeof payload.userId === 'string' && payload.userId === viewerId;
        const voterVotes = Array.isArray(payload.voterVotes)
          ? payload.voterVotes.filter((n): n is number => typeof n === 'number')
          : null;
        const applyPoll = (m: Message): Message =>
          m.poll
            ? {
                ...m,
                poll: {
                  ...m.poll,
                  voteCounts,
                  ...(voterIsViewer && voterVotes ? { myVotes: voterVotes } : {}),
                },
              }
            : m;
        qc.setQueryData<Conversation | null>(
          CONVERSATION_KEY(conversationId, userKey),
          (old) =>
            old
              ? {
                  ...old,
                  messages: old.messages.map((m) =>
                    m.id === messageId ? applyPoll(m) : m,
                  ),
                }
              : old,
        );
        // The paged history window isn't reachable by targeted patch —
        // if the message isn't in the current cache it converges on the
        // next invalidation/refetch anyway.
        return;
      }
      case 'chat.group.identity.updated': {
        if (!forThisThread) return;
        const merge = (c: Conversation): Conversation => ({
          ...c,
          title: typeof payload.title === 'string' ? payload.title : c.title,
          participantName:
            typeof payload.title === 'string' ? payload.title : c.participantName,
          description:
            typeof payload.description === 'string' ? payload.description : c.description,
          avatar: typeof payload.avatar === 'string' ? payload.avatar : c.avatar,
          coverPhoto:
            typeof payload.coverPhoto === 'string' ? payload.coverPhoto : c.coverPhoto,
        });
        qc.setQueryData<Conversation | null>(
          CONVERSATION_KEY(conversationId, userKey),
          (old) => (old ? merge(old) : old),
        );
        qc.setQueriesData<Conversation[]>({ queryKey: ['conversations'] }, (old) =>
          old?.map((c) => (c.id === conversationId ? merge(c) : c)),
        );
        invalidateThread();
        return;
      }
      default: {
        // Member add/remove/leave, role and ownership changes, group
        // settings, invite lifecycle, bot deploys, archive/report markers,
        // dm/group creation — the row or membership set moved; refetch.
        if (typeof event.type === 'string' && event.type.startsWith('chat.')) {
          invalidateThread();
        }
      }
    }
  };

  useChatRealtime({
    topics: [
      conversationId ? `chat.conversation:${conversationId}` : null,
      peerUserId ? `presence.user:${peerUserId}` : null,
    ],
    enabled,
    onEvent: handleEvent,
    onResync: () => {
      // Reconnect/gap — a missed isTyping=false would stick the indicator,
      // and any message event may have been lost; clear + resnapshot.
      clearAllTyping();
      invalidateThread();
    },
  });

  // Clear typing state when the thread switches or the stream disables.
  useEffect(() => {
    if (!enabled) clearAllTyping();
  }, [enabled, conversationId]);

  return { typingUserIds: typingIds };
}

// ── Inbox list ───────────────────────────────────────────────────────────

/** Cap the per-conversation topic fan-out — the most recent rows carry
 *  the live previews; deeper rows converge on the REST poll cadence. */
const INBOX_TOPIC_CAP = 40;

/**
 * The inbox's realtime surface — `chat.user:{userId}` carries the
 * signals that can never arrive on a known conversation topic (a new DM,
 * a new group, being added to a group), and the loaded conversations'
 * topics keep row previews/unread live. `openConversationId` is the
 * thread currently on screen — its badge is owned by the thread's own
 * mark-read, so arrivals there never bump the row.
 */
export function useInboxRealtime(openConversationId?: string) {
  const qc = useQueryClient();
  const { user, isGuest } = useSessionIdentity();
  const hydrated = useHydrated();
  const viewerId = user?.id ?? '';
  const { data: conversations } = useConversations();
  const openRef = useRef(openConversationId);
  openRef.current = openConversationId;

  const conversationTopics = (conversations ?? [])
    .slice(0, INBOX_TOPIC_CAP)
    .map((c) => `chat.conversation:${c.id}`);

  const invalidateInbox = () => {
    void qc.invalidateQueries({ queryKey: ['conversations'] });
  };

  const handleEvent = (event: ChatRealtimeEnvelope) => {
    const payload = event.payload ?? {};
    const conversationId =
      typeof payload.conversationId === 'string' ? payload.conversationId : '';

    switch (event.type) {
      case 'chat.dm.created':
      case 'chat.group.created':
      case 'chat.member.added': {
        // The member.added variant lands here only when the viewer was the
        // added member — either way a thread this client may not know
        // exists just appeared; refetch the list.
        invalidateInbox();
        return;
      }
      case 'chat.member.removed':
      case 'chat.member.left': {
        // The removed member's own topic subscription is revoked
        // server-side on delivery, but the event arrives first — when the
        // viewer was the member removed, the row must leave the list.
        const removedId =
          typeof payload.memberUserId === 'string'
            ? payload.memberUserId
            : typeof payload.actorUserId === 'string'
              ? payload.actorUserId
              : '';
        if (event.type === 'chat.member.left' || removedId === viewerId) {
          invalidateInbox();
        }
        return;
      }
      case 'chat.message.created': {
        if (!conversationId) return;
        const mapped = realtimePayloadToWebMessage(payload, viewerId);
        qc.setQueriesData<Conversation[]>({ queryKey: ['conversations'] }, (old) => {
          if (!old) return old;
          if (!old.some((c) => c.id === conversationId)) return old;
          return old.map((c) =>
            c.id === conversationId
              ? mapped
                ? mergeIncomingIntoRow(c, mapped, viewerId, openRef.current)
                : c
              : c,
          );
        });
        if (!mapped) invalidateInbox();
        return;
      }
      case 'chat.message.deleted': {
        if (!conversationId) return;
        const messageId = typeof payload.messageId === 'string' ? payload.messageId : '';
        if (!messageId) return;
        // The row preview derives from the last message — patch the row's
        // copy so a deleted tail never keeps previewing the removed body.
        qc.setQueriesData<Conversation[]>({ queryKey: ['conversations'] }, (old) =>
          old?.map((c) =>
            c.id === conversationId
              ? {
                  ...c,
                  messages:
                    payload.scope === 'everyone'
                      ? c.messages.map((m) =>
                          m.id === messageId ? tombstoneMessage(m) : m,
                        )
                      : payload.actorUserId === viewerId
                        ? c.messages.filter((m) => m.id !== messageId)
                        : c.messages,
                }
              : c,
          ),
        );
        return;
      }
      case 'chat.message.edited': {
        if (!conversationId) return;
        const messageId = typeof payload.messageId === 'string' ? payload.messageId : '';
        const body = typeof payload.body === 'string' ? payload.body : undefined;
        if (!messageId || body === undefined) return;
        qc.setQueriesData<Conversation[]>({ queryKey: ['conversations'] }, (old) =>
          old?.map((c) =>
            c.id === conversationId
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === messageId ? { ...m, text: body, isEdited: true } : m,
                  ),
                }
              : c,
          ),
        );
        return;
      }
      case 'chat.message.read': {
        // Self-read on another device — clear the row badge locally.
        if (payload.userId === viewerId && conversationId) {
          qc.setQueriesData<Conversation[]>({ queryKey: ['conversations'] }, (old) =>
            old?.map((c) =>
              c.id === conversationId ? { ...c, unread: false, unreadCount: 0 } : c,
            ),
          );
        }
        return;
      }
      case 'chat.group.identity.updated': {
        if (!conversationId) return;
        qc.setQueriesData<Conversation[]>({ queryKey: ['conversations'] }, (old) =>
          old?.map((c) =>
            c.id === conversationId
              ? {
                  ...c,
                  title: typeof payload.title === 'string' ? payload.title : c.title,
                  participantName:
                    typeof payload.title === 'string' ? payload.title : c.participantName,
                  avatar:
                    typeof payload.avatar === 'string' ? payload.avatar : c.avatar,
                }
              : c,
          ),
        );
        return;
      }
      default: {
        // Typing, presence, reactions, saves, pins, polls — no inbox-row
        // surface; ignore. Membership/invite/group lifecycle rows refetch.
        if (
          typeof event.type === 'string' &&
          /^(chat\.(member|group|invite|conversation)\.|chat\.bot\.)/.test(event.type)
        ) {
          invalidateInbox();
        }
      }
    }
  };

  useChatRealtime({
    topics: [viewerId ? `chat.user:${viewerId}` : null, ...conversationTopics],
    enabled: hydrated && !isGuest && Boolean(viewerId),
    onEvent: handleEvent,
    onResync: invalidateInbox,
  });
}

// ── Notification feed ────────────────────────────────────────────────────

/**
 * `notifications.user:{userId}` — every feed-visible event the worker
 * publishes arrives as `notification.queued` (workerRuntime.ts: a
 * quiet-hours-deferred event is still feed-visible now, `deferredUntil`
 * just suppresses the push banner — there is no push banner on web at
 * all, so the feed/badge are the whole surface). The subscription keeps
 * the header unread badge and the notifications feed live; REST stays
 * the baseline and a seq gap resyncs both. In-app-only events publish
 * too — the feed is where they live, so no distinction is needed.
 */
export function useNotificationRealtime() {
  const qc = useQueryClient();
  const { user, isGuest } = useSessionIdentity();
  const hydrated = useHydrated();
  const viewerId = user?.id ?? '';

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['notifications'] });
    void qc.invalidateQueries({ queryKey: ['notification-feed'] });
  };

  useChatRealtime({
    topics: [viewerId ? `notifications.user:${viewerId}` : null],
    enabled: hydrated && !isGuest && Boolean(viewerId),
    onEvent: (event) => {
      if (event.type === 'notification.queued') invalidate();
    },
    onResync: invalidate,
  });
}
