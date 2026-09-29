'use client';

/**
 * Chat queries beyond the read-only hooks in queries.ts — message
 * history pagination and the message-level write paths (reactions,
 * edit, delete) that wire the endpoints chatApi already exposes.
 *
 *  - `useMessageHistory` keeps the pages fetched with `before=oldestCursor`
 *    outside the conversation query cache: the 15s thread poll rewrites
 *    page 1 and would silently drop prepended history if it lived there.
 *    Seeding adopts the envelope's oldestCursor/hasMore only until the
 *    first page loads — after that the tail cursor is authoritative
 *    (mobile useConversationMessages parity).
 *  - `useThreadActions` runs the per-message mutations. Live mode writes
 *    optimistically into the conversation cache (and any paged history)
 *    then posts the edge, reverting both on failure. Fixture mode
 *    mutates the CONVERSATIONS module dataset — the store grammar every
 *    other inbox write uses — then re-issues fresh references.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DATA_MODE } from '@/lib/api/client';
import * as chatService from '@/lib/api/services/chat';
import { appendFixtureMessage, CONVERSATIONS } from '@/lib/data/fixtures';
import { isLocalMediaUri } from '@/lib/utils/media';
import { useSession } from '@/lib/session/SessionProvider';
import { useQuickReplies, type QuickReply } from '@/lib/store/quickReplies';
import { useHydrated } from '@/lib/store/useStore';
import { useToast } from '@/components/ui/Toast';
import type { Conversation, Message } from '@/lib/contracts/domain';

/** Sender-only edit window the backend enforces (chatApi.ts P2-03). */
export const MESSAGE_EDIT_WINDOW_MS = 15 * 60 * 1000;

/** The quick-react set — the mobile MessageContextMenu default row. */
export const QUICK_REACTIONS = ['❤️', '👍', '😂', '😮', '😢', '🔥'] as const;

/** The extended set behind the row's "+" expander — the mobile
 *  EmojiReactionsBar EXTENDED_EMOJIS list, ported verbatim. */
export const EXTENDED_REACTIONS = [
  '😍', '🥰', '😎', '🤔', '🙌', '👏',
  '🙏', '💯', '🎉', '👀', '😊', '😅',
  '😡', '💔', '🙊', '🤷', '💸', '🛒',
] as const;

/** Pure reaction toggle — add/remove the viewer on an emoji bucket. */
export function toggleReactionOnMessage(
  m: Message,
  emoji: string,
  viewerId: string,
): Message {
  const reactions = [...(m.reactions ?? [])];
  const idx = reactions.findIndex((r) => r.emoji === emoji);
  if (idx >= 0) {
    const r = reactions[idx];
    const mine = r.reactedByMe === true || r.userIds.includes(viewerId);
    if (mine) {
      const userIds = r.userIds.filter((id) => id !== viewerId);
      if (userIds.length === 0) reactions.splice(idx, 1);
      else reactions[idx] = { ...r, userIds, count: userIds.length, reactedByMe: false };
    } else {
      const userIds = [...r.userIds, viewerId];
      reactions[idx] = { ...r, userIds, count: userIds.length, reactedByMe: true };
    }
  } else {
    reactions.push({ emoji, userIds: [viewerId], count: 1, reactedByMe: true });
  }
  return { ...m, reactions };
}

/** Tombstone shape for delete-for-everyone — the payload fields are
 *  stripped, never kept in a hidden state the UI could leak. */
function toTombstone(m: Message): Message {
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

// ── Older-history pagination ─────────────────────────────────────────────

export interface MessageHistory {
  /** Older messages, ascending — prepend before conversation.messages. */
  older: Message[];
  hasMore: boolean;
  loading: boolean;
  /** True after a failed page fetch — the affordance offers a retry. */
  error: boolean;
  /** Fetch the next older page (no-op unless live, cursored, idle). */
  loadOlder: () => void;
  /**
   * Apply a per-message update inside the paged history (reactions,
   * edits, tombstones land there too). `fn` returning null removes the
   * message (delete-for-me). Returns a restore closure for write revert.
   */
  patchOlder: (id: string, fn: (m: Message) => Message | null) => () => void;
}

function applyToOlder(
  older: Message[],
  id: string,
  fn: (m: Message) => Message | null,
): Message[] {
  const idx = older.findIndex((m) => m.id === id);
  if (idx < 0) return older;
  const next = fn(older[idx]);
  const out = [...older];
  if (next) out[idx] = next;
  else out.splice(idx, 1);
  return out;
}

export function useMessageHistory(
  conversationId: string,
  conversation: Conversation | null | undefined,
): MessageHistory {
  const { user } = useSession();
  interface HistoryState {
    cid: string;
    older: Message[];
    oldestCursor?: string;
    hasMore: boolean;
    loading: boolean;
    error: boolean;
  }
  const fresh = (): HistoryState => ({
    cid: conversationId,
    older: [],
    hasMore: false,
    loading: false,
    error: false,
  });
  const [state, setState] = useState<HistoryState>(fresh);
  // Render-time reset — switching threads starts a clean history window.
  if (state.cid !== conversationId) setState(fresh());
  const stateRef = useRef(state);
  stateRef.current = state;

  // Adopt page-1's envelope until the viewer pages back — afterwards the
  // tail cursor is the truth (adopting a new page-1 cursor would refetch
  // the span already loaded).
  const meta = chatService.messageHistoryMeta(conversation);
  useEffect(() => {
    if (DATA_MODE !== 'live') return;
    setState((s) =>
      s.cid === conversationId && s.older.length === 0 && !s.loading
        ? {
            ...s,
            oldestCursor: meta.oldestCursor,
            hasMore: meta.hasMore ?? Boolean(meta.oldestCursor),
          }
        : s,
    );
  }, [conversationId, meta.oldestCursor, meta.hasMore]);

  const loadOlder = useCallback(() => {
    const s = stateRef.current;
    if (DATA_MODE !== 'live' || s.loading || !s.hasMore || !s.oldestCursor) return;
    const cursor = s.oldestCursor;
    setState((prev) => ({ ...prev, loading: true, error: false }));
    chatService
      .fetchConversationMessagesPage(conversationId, user?.id, { before: cursor })
      .then((page) => {
        setState((prev) => {
          if (prev.cid !== conversationId) return prev;
          const seen = new Set(prev.older.map((m) => m.id));
          const freshRows = page.messages.filter((m) => !seen.has(m.id));
          return {
            ...prev,
            loading: false,
            older: [...prev.older, ...freshRows],
            oldestCursor: page.oldestCursor ?? prev.oldestCursor,
            hasMore:
              page.hasMore ??
              (page.messages.length > 0 ? Boolean(page.oldestCursor) : false),
          };
        });
      })
      .catch(() => {
        setState((prev) =>
          prev.cid === conversationId ? { ...prev, loading: false, error: true } : prev,
        );
      });
  }, [conversationId, user?.id]);

  const patchOlder = useCallback(
    (id: string, fn: (m: Message) => Message | null) => {
      const prior = stateRef.current.older;
      const priorIndex = prior.findIndex((m) => m.id === id);
      if (priorIndex < 0) return () => {};
      const priorMessage = prior[priorIndex];
      setState((s) => ({ ...s, older: applyToOlder(s.older, id, fn) }));
      // Scoped revert — patch this one message back (re-inserting at its
      // old slot if the write removed it) instead of restoring the whole
      // page snapshot, which would stomp other in-flight writes.
      return () =>
        setState((s) => {
          const at = s.older.findIndex((m) => m.id === id);
          const older = [...s.older];
          if (at >= 0) older[at] = priorMessage;
          else older.splice(Math.min(priorIndex, older.length), 0, priorMessage);
          return { ...s, older };
        });
    },
    [],
  );

  return {
    older: state.older,
    hasMore: state.hasMore,
    loading: state.loading,
    error: state.error,
    loadOlder,
    patchOlder,
  };
}

// ── Message actions (react / edit / delete) ──────────────────────────────

export interface ThreadActions {
  /** Toggle the viewer's reaction on a message — add or remove. */
  toggleReaction: (message: Message, emoji: string) => void;
  /** Whether the viewer has already reacted with this emoji. */
  hasReacted: (message: Message, emoji: string) => boolean;
  /** Edit an own message's text (server enforces the window). */
  editMessage: (messageId: string, text: string) => void;
  /** scope 'everyone' tombstones for all; 'me' removes the local copy. */
  deleteMessage: (messageId: string, scope: 'me' | 'everyone') => void;
  /** Save / unsave a message in chat — the negotiated-persistence edge
   *  (mobile saveMessageInChatOnApi); the savedBy set is shared state. */
  toggleSave: (message: Message) => void;
  /** Whether the message is saved in chat — either party's save counts. */
  isSaved: (message: Message) => boolean;
  /** Whether the viewer personally saved it — drives the menu label. */
  isSavedByMe: (message: Message) => boolean;
}

export function useThreadActions(
  conversationId: string,
  patchOlder: (id: string, fn: (m: Message) => Message | null) => () => void,
): ThreadActions {
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useSession();
  const viewerId = user?.id ?? '';
  const userKey = user?.id ?? 'guest';

  /**
   * One write path for all three message mutations. Applies `fn` to the
   * fixture record (fixture mode) or the conversation cache + paged
   * history (live mode, optimistically) and returns a revert closure.
   */
  const applyMessageUpdate = useCallback(
    (messageId: string, fn: (m: Message) => Message | null) => {
      const cacheKey = ['conversation', conversationId, userKey];
      const revertOlder = patchOlder(messageId, fn);
      if (DATA_MODE === 'live') {
        // Snapshot only this message's prior state — the revert patches
        // that entity back in place rather than restoring a
        // whole-conversation snapshot, so other in-flight optimistic
        // writes to the same thread survive a failure.
        const before = qc.getQueryData<Conversation | null>(cacheKey);
        const prevIndex = before
          ? before.messages.findIndex((m) => m.id === messageId)
          : -1;
        const prevMessage =
          before && prevIndex >= 0 ? before.messages[prevIndex] : undefined;
        qc.setQueryData<Conversation | null>(cacheKey, (old) =>
          old
            ? {
                ...old,
                messages: old.messages
                  .map((m) => (m.id === messageId ? fn(m) : m))
                  .filter((m): m is Message => m !== null),
              }
            : old,
        );
        return () => {
          qc.setQueryData<Conversation | null>(cacheKey, (old) => {
            if (!old) return old;
            const at = old.messages.findIndex((m) => m.id === messageId);
            if (prevMessage === undefined) {
              // The write introduced the row — drop it; absent already,
              // there's nothing to do.
              return at < 0
                ? old
                : { ...old, messages: old.messages.filter((m) => m.id !== messageId) };
            }
            if (at >= 0) {
              return {
                ...old,
                messages: old.messages.map((m) =>
                  m.id === messageId ? prevMessage : m,
                ),
              };
            }
            // The write removed the row (delete-for-me) — restore it at
            // its old slot without disturbing the rest of the stream.
            const messages = [...old.messages];
            messages.splice(Math.min(prevIndex, messages.length), 0, prevMessage);
            return { ...old, messages };
          });
          revertOlder();
        };
      }
      // Fixture mode — mutate the module dataset (the store grammar), then
      // re-issue fresh references so subscribers re-render the change.
      const convo = CONVERSATIONS.find((c) => c.id === conversationId);
      if (convo) {
        const idx = convo.messages.findIndex((m) => m.id === messageId);
        if (idx >= 0) {
          const next = fn(convo.messages[idx]);
          if (next) convo.messages[idx] = next;
          else convo.messages.splice(idx, 1);
        }
      }
      qc.setQueryData<Conversation | null>(cacheKey, (old) =>
        old ? { ...old, messages: [...old.messages] } : old,
      );
      return () => {};
    },
    [qc, conversationId, userKey, patchOlder],
  );

  const invalidateInbox = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['conversations'] });
  }, [qc]);

  const hasReacted = useCallback(
    (message: Message, emoji: string) =>
      (message.reactions ?? []).some(
        (r) =>
          r.emoji === emoji &&
          (r.reactedByMe === true || (viewerId ? r.userIds.includes(viewerId) : false)),
      ),
    [viewerId],
  );

  const toggleReaction = useCallback(
    (message: Message, emoji: string) => {
      if (!viewerId || message.id.startsWith('opt-')) return;
      const removing = hasReacted(message, emoji);
      const revert = applyMessageUpdate(message.id, (m) =>
        toggleReactionOnMessage(m, emoji, viewerId),
      );
      if (DATA_MODE === 'live') {
        const call = removing
          ? chatService.removeMessageReaction(conversationId, message.id, emoji)
          : chatService.addMessageReaction(conversationId, message.id, emoji);
        call.catch(() => {
          revert();
          toast.show("Couldn't update the reaction — try again", 'error');
        });
      }
    },
    [viewerId, hasReacted, applyMessageUpdate, conversationId, toast],
  );

  const editMessage = useCallback(
    (messageId: string, text: string) => {
      const trimmed = text.trim();
      if (!viewerId || !trimmed) return;
      const revert = applyMessageUpdate(messageId, (m) => ({
        ...m,
        text: trimmed,
        isEdited: true,
      }));
      if (DATA_MODE === 'live') {
        chatService
          .editChatMessage(conversationId, messageId, trimmed, viewerId)
          .then(() => {
            void qc.invalidateQueries({ queryKey: ['conversation', conversationId] });
            invalidateInbox();
          })
          .catch(() => {
            revert();
            toast.show("Couldn't edit the message — the edit window may have passed", 'error');
          });
      }
    },
    [viewerId, applyMessageUpdate, conversationId, qc, invalidateInbox, toast],
  );

  const isSaved = useCallback(
    (message: Message) => (chatService.messageSaveState(message).savedBy ?? []).length > 0,
    [],
  );

  const isSavedByMe = useCallback(
    (message: Message) =>
      Boolean(viewerId) &&
      (chatService.messageSaveState(message).savedBy ?? []).includes(viewerId),
    [viewerId],
  );

  const toggleSave = useCallback(
    (message: Message) => {
      if (!viewerId || message.id.startsWith('opt-')) return;
      const saved = isSavedByMe(message);
      const revert = applyMessageUpdate(message.id, (m) => {
        const prior = chatService.messageSaveState(m).savedBy ?? [];
        const savedBy = saved
          ? prior.filter((id) => id !== viewerId)
          : [...prior, viewerId];
        return {
          ...m,
          savedBy,
          // savedAt stamps the first save; a fully-unsaved message drops it.
          savedAt: savedBy.length > 0 ? (chatService.messageSaveState(m).savedAt ?? new Date().toISOString()) : undefined,
        } as Message;
      });
      if (DATA_MODE === 'live') {
        const call = saved
          ? chatService.unsaveChatMessage(conversationId, message.id)
          : chatService.saveChatMessage(conversationId, message.id);
        call.catch(() => {
          revert();
          toast.show(
            saved ? "Couldn't remove the save — try again" : "Couldn't save the message — try again",
            'error',
          );
        });
        return;
      }
      // Fixture mode — the module mutation already landed; a quiet ack.
      toast.show(saved ? 'Removed from saved in chat' : 'Saved in chat', 'info');
    },
    [viewerId, isSavedByMe, applyMessageUpdate, conversationId, toast],
  );

  const deleteMessage = useCallback(
    (messageId: string, scope: 'me' | 'everyone') => {
      if (!viewerId) return;
      const revert = applyMessageUpdate(messageId, (m) =>
        scope === 'everyone' ? toTombstone(m) : null,
      );
      if (DATA_MODE === 'live') {
        chatService
          .deleteChatMessage(conversationId, messageId, scope)
          .then(() => {
            invalidateInbox();
          })
          .catch(() => {
            revert();
            toast.show(
              scope === 'everyone'
                ? "Couldn't delete the message for everyone — try again"
                : "Couldn't delete the message — try again",
              'error',
            );
          });
        return;
      }
      invalidateInbox();
      toast.show(scope === 'everyone' ? 'Message deleted' : 'Message removed', 'info');
    },
    [viewerId, applyMessageUpdate, conversationId, invalidateInbox, toast],
  );

  return { toggleReaction, hasReacted, editMessage, deleteMessage, toggleSave, isSaved, isSavedByMe };
}

// ── Forwarding ───────────────────────────────────────────────────────────

/**
 * The send payload a message forwards as — the web send contract
 * (sendChatMessage) carries text + image/video/document/voice, so only
 * those kinds forward faithfully. Offers, listing shares, system rows
 * and tombstones are gated out (mobile's canForward grammar): forwarding
 * them would silently drop the payload. Local blob:/data: picks can't be
 * re-sent in live mode (the File is gone — no upload path), so a live
 * message whose only payload is a local URI is not forwardable; the same
 * message in fixture mode forwards fine since blob URIs resolve locally.
 */
export function forwardPayloadFor(
  m: Message,
): chatService.SendChatMessageApiInput | null {
  if (m.isDeleted || m.isSystem || m.type === 'system' || m.sender === 'system') return null;
  if (
    m.type === 'offer' ||
    m.type === 'offer_declined' ||
    m.offerPrice != null ||
    m.type === 'listing_share'
  ) {
    return null;
  }
  const uri = (u?: string) =>
    u && (DATA_MODE !== 'live' || !isLocalMediaUri(u)) ? u : undefined;

  if (m.type === 'document' || m.documentUri) {
    const mediaUri = uri(m.documentUri);
    return mediaUri
      ? {
          text: m.text,
          mediaUri,
          mediaType: 'document',
          documentName: m.documentName,
          documentMimeType: m.documentMimeType,
        }
      : null;
  }
  if (m.type === 'voice' || m.voiceUri) {
    const mediaUri = uri(m.voiceUri);
    return mediaUri
      ? {
          text: m.text,
          mediaUri,
          mediaType: 'voice',
          voiceDurationMs: m.voiceDurationMs,
          voiceWaveform: m.voiceWaveform,
        }
      : null;
  }
  if (m.mediaUri) {
    const mediaUri = uri(m.mediaUri);
    if (mediaUri) {
      return {
        text: m.text,
        mediaUri,
        mediaType: m.mediaType === 'video' ? 'video' : 'image',
      };
    }
    // Local-only media can't cross the wire — the caption alone still can.
    return m.text ? { text: m.text } : null;
  }
  return m.text ? { text: m.text } : null;
}

/** Whether the actions menu may offer Forward for this message. */
export function forwardableMessage(m: Message): boolean {
  return !m.id.startsWith('opt-') && forwardPayloadFor(m) !== null;
}

/**
 * useForwardMessage — the client-side forward write. There is no forward
 * endpoint; forwarding re-sends the message's payload into the chosen
 * conversation through the normal send edge (live) or the fixture append
 * grammar, then refreshes the target thread + inbox caches.
 */
export function useForwardMessage() {
  const qc = useQueryClient();
  const { user } = useSession();
  const userKey = user?.id ?? 'guest';

  return useCallback(
    async (targetId: string, m: Message): Promise<void> => {
      const payload = forwardPayloadFor(m);
      if (!payload) throw new Error('This message cannot be forwarded');
      if (DATA_MODE === 'live') {
        await chatService.sendChatMessage(targetId, payload, user?.id);
        void qc.invalidateQueries({ queryKey: ['conversation', targetId] });
        void qc.invalidateQueries({ queryKey: ['conversations'] });
        return;
      }
      if (!user) throw new Error('Sign in to forward messages');
      // Same narrowing the fixture send path applies — document/voice ride
      // their own uri fields + type tag; mediaType is image|video only.
      const isDoc = payload.mediaType === 'document';
      const isVoice = payload.mediaType === 'voice';
      const forwarded: Message = {
        id: `local-${Date.now()}`,
        senderId: user.id,
        sender: 'me',
        text: payload.text,
        mediaUri: !isDoc && !isVoice ? payload.mediaUri : undefined,
        mediaType:
          payload.mediaType === 'image' || payload.mediaType === 'video'
            ? payload.mediaType
            : undefined,
        documentUri: isDoc ? payload.mediaUri : undefined,
        documentName: isDoc ? payload.documentName : undefined,
        documentMimeType: isDoc ? payload.documentMimeType : undefined,
        voiceUri: isVoice ? payload.mediaUri : undefined,
        voiceDurationMs: isVoice ? payload.voiceDurationMs : undefined,
        voiceWaveform: isVoice ? payload.voiceWaveform : undefined,
        type: isDoc ? 'document' : isVoice ? 'voice' : payload.mediaUri ? 'media' : 'text',
        timestamp: new Date().toISOString(),
        readStatus: 'sent',
      };
      if (!appendFixtureMessage(targetId, forwarded)) {
        throw new Error('Conversation not found');
      }
      qc.setQueryData<Conversation | null>(
        ['conversation', targetId, userKey],
        (old) => (old ? { ...old, messages: [...old.messages] } : old),
      );
      qc.setQueryData<Conversation[]>(['conversations', userKey], (old) =>
        old ? [...old] : old,
      );
      void qc.invalidateQueries({ queryKey: ['conversation', targetId] });
      void qc.invalidateQueries({ queryKey: ['conversations'] });
    },
    [qc, user, userKey],
  );
}

// ── Pinned message — one pin per conversation, group admins/owners only ──

/** Fixture pin state — session-local map (fixture writes mutate module
 *  data elsewhere in this codebase; there is no fixture pin column). */
const fixturePins = new Map<string, string>();

export interface PinnedMessage {
  messageId: string;
  /** The pinned message payload — live responses carry the serialized
   *  row; fixture lookups resolve from the loaded thread instead. */
  message?: Message;
}

/**
 * usePinnedMessage — the mobile usePinnedMessage port. Live mode reads
 * GET /chat/conversations/:id/pinned-message (silent-fail: the bar is
 * non-critical, mirrors mobile). `tick` is the convergence trigger — the
 * caller passes the polled conversation object so other admins' pins
 * arrive on the same cadence the thread refetches (the web has no
 * realtime topic; mobile's chat.message.pinned events map to the poll).
 * DMs and guests never hold a pin (the backend only permits group
 * admin/owner writes).
 */
export function usePinnedMessage(
  conversationId: string,
  isGroup: boolean,
  enabled: boolean,
  tick?: unknown,
) {
  const { user } = useSession();
  const [pin, setPin] = useState<PinnedMessage | null>(null);

  const refresh = useCallback(() => {
    if (!isGroup || !enabled) {
      setPin(null);
      return;
    }
    if (DATA_MODE === 'live') {
      chatService
        .fetchPinnedMessage(conversationId, user?.id)
        .then((res) => setPin(res ? { messageId: res.messageId, message: res.message } : null))
        .catch(() => {
          // Pinned bar is non-critical — keep the prior state on failure.
        });
      return;
    }
    const id = fixturePins.get(conversationId);
    setPin(id ? { messageId : id } : null);
  }, [conversationId, isGroup, enabled, user?.id]);

  useEffect(() => {
    refresh();
  }, [refresh, tick]);

  return { pin, refresh };
}

/** Pin / unpin write — POST/DELETE /messages/:id/pin live, the session
 *  pin map in fixture mode. The caller gates on group admin/owner and
 *  owns the toast; resolves false when the write was rejected. */
export async function writePinnedMessage(
  conversationId: string,
  messageId: string,
  pinned: boolean,
): Promise<boolean> {
  if (DATA_MODE === 'live') {
    try {
      if (pinned) await chatService.unpinChatMessage(conversationId, messageId);
      else await chatService.pinChatMessage(conversationId, messageId);
      return true;
    } catch {
      return false;
    }
  }
  if (pinned) fixturePins.delete(conversationId);
  else fixturePins.set(conversationId, messageId);
  return true;
}

/** Message report — the mobile ChatSheets grammar: a fixed 'other'
 *  reason with the message id as the evidence reference and a
 *  deterministic idempotency key. The web report surface (ReportSheet)
 *  is the listing/user support-ticket flow — the chat report endpoint is
 *  a distinct write, so the message action hits it directly. Fixture
 *  mode has no report store; resolve false so the caller can say so
 *  rather than fake a submission. */
export async function reportChatMessage(
  conversationId: string,
  messageId: string,
): Promise<boolean> {
  if (DATA_MODE !== 'live') return false;
  try {
    await chatService.reportConversation(conversationId, {
      reason: 'other',
      messageId,
      idempotencyKey: `rpt_${conversationId}_${messageId}`,
    });
    return true;
  } catch {
    return false;
  }
}

// ── Quick replies — /chat/quick-replies in live mode, local store else ─────

/**
 * Quick replies — the Composer's bolt-menu source and the seller-hub
 * manage surface read the same list.
 *
 * Live + signed in: GET /chat/quick-replies is the truth (the web
 * view-model maps the server's `body` onto the Composer's `message`
 * field — consumption shape unchanged). Live + guest and fixture mode:
 * the persisted local store stays the path — replies are a device-local
 * convenience there, never a fake "synced" claim. While the live session
 * is still resolving, the hook reports loading rather than flashing the
 * local store ahead of the account's own replies.
 */
export function useQuickRepliesData(): {
  replies: QuickReply[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  /** True when reads/writes go to /chat/quick-replies. */
  serverBacked: boolean;
} {
  const { user, sessionLoading } = useSession();
  const hydrated = useHydrated();
  const localReplies = useQuickReplies((s) => s.replies);
  const serverBacked = DATA_MODE === 'live' && Boolean(user?.id);

  const query = useQuery({
    queryKey: ['quick-replies', DATA_MODE, user?.id],
    queryFn: async (): Promise<QuickReply[]> => {
      const items = await chatService.fetchQuickReplies();
      return items.map((r) => ({ id: r.id, title: r.title, message: r.body }));
    },
    enabled: serverBacked,
    staleTime: 30_000,
  });

  if (DATA_MODE === 'live' && sessionLoading) {
    return {
      replies: [],
      isLoading: true,
      isError: false,
      refetch: () => void query.refetch(),
      serverBacked: false,
    };
  }
  if (serverBacked) {
    return {
      replies: query.data ?? [],
      isLoading: query.isLoading,
      isError: query.isError,
      refetch: () => void query.refetch(),
      serverBacked: true,
    };
  }
  return {
    replies: localReplies,
    isLoading: !hydrated,
    isError: false,
    refetch: () => {},
    serverBacked: false,
  };
}

/**
 * Quick-reply writes — the seller-hub manage surface's add/edit/delete.
 * Server-backed sessions hit POST/PUT/DELETE /chat/quick-replies and
 * invalidate the query; the local store stays the fixture/guest path.
 * These are plain async fns (not useMutation) so the caller owns pending
 * state and honest failure toasts — a rejected write must surface, never
 * pretend to land.
 */
export function useQuickReplyMutations(): {
  serverBacked: boolean;
  add: (input: { title: string; message: string }) => Promise<void>;
  update: (id: string, input: { title: string; message: string }) => Promise<void>;
  remove: (id: string) => Promise<void>;
} {
  const qc = useQueryClient();
  const { user } = useSession();
  const serverBacked = DATA_MODE === 'live' && Boolean(user?.id);

  return {
    serverBacked,
    add: async (input) => {
      if (serverBacked) {
        // The seller-hub surface owns this list — new replies file under
        // the seller role, matching the mobile manage screen.
        await chatService.createQuickReply({
          role: 'seller',
          title: input.title,
          body: input.message,
        });
        await qc.invalidateQueries({ queryKey: ['quick-replies'] });
        return;
      }
      useQuickReplies.getState().add(input);
    },
    update: async (id, input) => {
      if (serverBacked) {
        await chatService.updateQuickReply(id, {
          title: input.title,
          body: input.message,
        });
        await qc.invalidateQueries({ queryKey: ['quick-replies'] });
        return;
      }
      useQuickReplies.getState().update(id, input);
    },
    remove: async (id) => {
      if (serverBacked) {
        await chatService.deleteQuickReply(id);
        await qc.invalidateQueries({ queryKey: ['quick-replies'] });
        return;
      }
      useQuickReplies.getState().remove(id);
    },
  };
}
