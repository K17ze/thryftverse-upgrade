/**
 * useConversationMessages — message list state, loading, sending, retry, pagination.
 *
 * Owns:
 * - The hydrated message list (local state synced from the store + API)
 * - API sync (fetch, replace) and sync error/loading state
 * - Sending text messages (optimistic → server confirm → failed)
 * - Sending media messages (optimistic → upload → sent/failed)
 * - Retry for failed text and failed upload
 * - Delete (single + bulk) with undo window
 * - Offer auto-send from route params
 * - Push permission prompt after first send
 * - Date separators and unread divider computation
 * - Scroll helpers (scheduleScrollToEnd, scrollToMessage, scrollToBottom)
 *
 * Per spec 16: Human messages dominate; commerce system events use quiet event
 * cards; agent output is a participant with explicit runtime state.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import NetInfo from "@react-native-community/netinfo";
import { AppState } from "react-native";

import { type FlashListRef } from "@shopify/flash-list";

import { useStore } from "../../store/useStore";
import type { Message as ConversationMessage } from '../../domain';
import {
  fetchConversationMessagesFromApi,
  sendConversationMessageOnApi,
  deleteConversationMessageOnApi,
  editConversationMessageOnApi,
  mapApiMessageToConversationMessage,
} from "../../services/chatApi";
import { uploadMedia } from "../../services/mediaUpload";
import { enqueueChatMessage, drainChatOutbox } from "../../services/chatOutbox";
import {
  useChatMessageEvent,
  useChatMessageDeletedEvent,
  useChatMessageEditedEvent,
  useChatReactionEvent,
  useChatReadReceiptEvent,
  realtimePayloadToMessage,
  chatConversationTopic,
  type ChatMessageCreatedPayload,
} from "../../services/realtimeClient";
import { useRealtimeResnapshot } from "../../platform/realtime";
import { requestPushPermissionWithSoftAsk } from "../../lib/pushPermission";
import { containsOffPlatformPaymentPattern } from "../../utils/chatSafetyWarnings";
import { isVideoUri } from "../../utils/media";
import { makeStableId, createStableId } from "../../utils/createStableId";
import { t } from "../../i18n";

/** P2-03: Edit window — must match the backend default (15 minutes). Used
 *  only for frontend UX (hiding the edit action after the window closes);
 *  the backend enforces it authoritatively. */
const MESSAGE_EDIT_WINDOW_MS = 15 * 60 * 1000;
import type { SuggestedReply } from "../../services/chatAgentsApi";
import type { SupportedCurrencyCode } from "../../constants/currencies";
import { DEFAULT_CURRENCY_CODE } from '../../constants/currencies';
import type { CurrencyDisplayMode } from "../../utils/currency";

import type { Message } from "./types";
import { INITIAL_MESSAGES, parseMessageDate } from "./types";

interface UseConversationMessagesOptions {
  conversationId: string | undefined;
  routeItemId?: string;
  routeOfferPayload?: {
    offerId?: string;
    price: number;
    originalPrice: number;
    expiresAt?: string;
    counterRound?: number;
  } | undefined;
  currentUser?: { id?: string; username?: string } | null;
  hydratedMessages: Message[];
  formatFromFiat: (amount: number, currency?: SupportedCurrencyCode, opts?: { displayMode?: CurrencyDisplayMode }) => string;
  show: (msg: string, type: "success" | "error" | "info") => void;
  haptic: { light: () => void; medium: () => void; success: () => void; selection: () => void };
  onOfferSent: (conversationId: string) => void;
  clearComposerState: (conversationId: string) => Promise<void>;
  deployedChatAgents: { length: number; 0?: { name?: string; avatar?: string } };
  getChatAgentResponse: (
    conversationId: string,
    text: string,
  ) => { id: string; agentId: string; content: string };
  getChatAgentSuggestions: (
    conversationId: string,
    text: string,
  ) => SuggestedReply[];
  setChatAgentSuggestionsExternal: (
    suggestions: SuggestedReply[],
  ) => void;
  navigation: {
    setParams: (params: Record<string, unknown>) => void;
    navigate: (screen: string, params?: Record<string, unknown>) => void;
  };
  isGroup: boolean;
  conversationUnread?: boolean;
  markConversationRead: (id: string) => void;
  appendConversationMessage: (
    conversationId: string,
    message: ConversationMessage,
  ) => void;
  replaceConversationMessages: (
    conversationId: string,
    messages: ConversationMessage[],
  ) => void;
}

/**
 * A confirmation request emitted by the hook for the calling screen to
 * render via `<ConfirmationSheet>`. Hooks cannot render UI, so they expose
 * a request object and the screen binds it to the sheet.
 *
 * `onCancel` is optional: when present it is invoked by the sheet's cancel
 * button (used for the "delete for me" secondary action in the
 * delete-for-everyone flow); backdrop dismiss always aborts without action.
 */
export interface ConversationConfirmationRequest {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  variant: 'default' | 'danger';
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void | Promise<void>;
}

export function useConversationMessages({
  conversationId,
  routeOfferPayload,
  currentUser,
  hydratedMessages,
  formatFromFiat,
  show,
  haptic,
  onOfferSent,
  clearComposerState,
  deployedChatAgents,
  getChatAgentResponse,
  getChatAgentSuggestions,
  setChatAgentSuggestionsExternal,
  navigation,
  conversationUnread,
  markConversationRead,
  appendConversationMessage,
  replaceConversationMessages,
}: UseConversationMessagesOptions) {
  const [messages, setMessages] = useState<Message[]>(hydratedMessages);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  // P0.6: Cursor-based pagination state. oldestCursor is used to fetch
  // older history incrementally; newestCursor is used to detect gaps.
  const [oldestCursor, setOldestCursor] = useState<string | undefined>(undefined);
  const [newestCursor, setNewestCursor] = useState<string | undefined>(undefined);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [hasMoreOlder, setHasMoreOlder] = useState(true);
  const [recentlyDeleted, setRecentlyDeleted] = useState<Message[]>([]);
  const [confirmation, setConfirmation] = useState<ConversationConfirmationRequest | null>(null);
  const clearConfirmation = useCallback(() => setConfirmation(null), []);
  const [composerSending, setComposerSending] = useState(false);
  // P2-03: The id of the message currently being edited inline. When set,
  // ChatMessageRow replaces that message's bubble with a TextInput.
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);

  // Ref mirror of the local message list so async callbacks (e.g.
  // confirmAgentDraft) can read the latest messages without re-subscribing.
  const messagesRef = useRef<Message[]>(messages);
  messagesRef.current = messages;

  const listRef = React.useRef<FlashListRef<Message>>(null);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deleteApiStatusRef = useRef<"pending" | "success" | "error">("pending");
  const wasOfflineRef = useRef(false);
  const wasUnreadOnOpenRef = useRef(false);
  const composerSendingRef = useRef(false);
  const pushPermissionAskedRef = useRef(false);

  // Tracks how many messages the user has seen when last at the bottom.
  // When the user scrolls up, new messages arriving increment the unread
  // count shown on the scroll-to-bottom FAB (Instagram/WhatsApp pattern).
  const seenMessageCountRef = useRef(0);

  // Sync local messages when hydrated store messages change.
  // Guard against setting the same array reference — prevents an
  // infinite loop when the parent passes a stable reference but the
  // effect fires due to other state changes causing a re-render.
  const lastHydratedRef = useRef<typeof hydratedMessages | null>(null);
  useEffect(() => {
    if (lastHydratedRef.current !== hydratedMessages) {
      lastHydratedRef.current = hydratedMessages;
      setMessages(hydratedMessages);
    }
  }, [hydratedMessages]);

  // NetInfo listener — offline state + reconcile on reconnect
  const syncMessagesFromApi = useCallback(async () => {
    if (!conversationId) return;
    setIsSyncing(true);
    setSyncError(false);
    try {
      const { messages: apiMessages, oldestCursor: oc, newestCursor: nc } = await fetchConversationMessagesFromApi(conversationId);
      if (!apiMessages.length) return;
      const syncedMessages = apiMessages.map(mapApiMessageToConversationMessage);
      replaceConversationMessages(conversationId, syncedMessages);
      // P0.6: Capture cursors for incremental pagination.
      setOldestCursor(oc);
      setNewestCursor(nc);
      setHasMoreOlder(Boolean(oc));
    } catch {
      setSyncError(true);
    } finally {
      setIsSyncing(false);
    }
  }, [conversationId, replaceConversationMessages]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(
      (state: { isConnected: boolean | null }) => {
        const isNowOffline = !state.isConnected;
        setIsOffline(isNowOffline);
        if (wasOfflineRef.current && !isNowOffline) {
          void syncMessagesFromApi();
        }
        wasOfflineRef.current = isNowOffline;
      },
    );
    return () => unsubscribe();
  }, [syncMessagesFromApi]);

  // P0.6: Incremental older-history load using the oldestCursor. Prepends
  // older messages to the list without losing scroll position. The caller
  // (onScroll handler) is responsible for preserving the visual anchor.
  const loadOlderMessages = useCallback(async () => {
    if (!conversationId || !oldestCursor || !hasMoreOlder || isLoadingOlder) return;
    setIsLoadingOlder(true);
    try {
      const { messages: olderMessages, oldestCursor: oc } = await fetchConversationMessagesFromApi(
        conversationId,
        { before: oldestCursor },
      );
      if (!olderMessages.length) {
        setHasMoreOlder(false);
        return;
      }
      const mapped = olderMessages.map(mapApiMessageToConversationMessage) as Message[];
      setMessages((prev) => {
        // Dedup by id — if a resnapshot already loaded some of these.
        const existingIds = new Set(prev.map((m) => m.id));
        const deduped = mapped.filter((m) => !existingIds.has(m.id));
        return [...deduped, ...prev];
      });
      setOldestCursor(oc);
      setHasMoreOlder(Boolean(oc));
    } catch {
      // Silently fail — the user can retry by scrolling up again.
    } finally {
      setIsLoadingOlder(false);
    }
  }, [conversationId, oldestCursor, hasMoreOlder, isLoadingOlder]);

  // AppState listener — sync on foreground
  useEffect(() => {
    const handleAppStateChange = (nextAppState: string) => {
      if (nextAppState === "active") {
        void syncMessagesFromApi();
      }
    };
    const subscription = AppState.addEventListener("change", handleAppStateChange);
    return () => subscription.remove();
  }, [conversationId, syncMessagesFromApi]);

  // Mark conversation read on open + capture initial unread state
  useEffect(() => {
    if (conversationId) {
      wasUnreadOnOpenRef.current = !!conversationUnread;
      markConversationRead(conversationId);
    }
  }, [conversationId, markConversationRead, conversationUnread]);

  // Auto-send offer message when arriving from MakeOfferScreen with an offerPayload
  const offerPayloadRef = useRef(routeOfferPayload);
  offerPayloadRef.current = routeOfferPayload;
  useEffect(() => {
    if (!routeOfferPayload || !conversationId) return;
    const { offerId, price, originalPrice, expiresAt, counterRound } = routeOfferPayload;
    const localId = makeStableId('offer', 7);
    const offerMsg: Message = {
      id: localId,
      type: "offer",
      sender: "me",
      senderLabel: currentUser?.username ?? "you",
      text:
        (counterRound ?? 0) > 0
          ? `Counter-offer: ${formatFromFiat(price, DEFAULT_CURRENCY_CODE)}`
          : `Offer: ${formatFromFiat(price, DEFAULT_CURRENCY_CODE)}`,
      offer: {
        offerId,
        price,
        originalPrice,
        status: "pending",
        expiresAt,
        counterRound,
      },
      status: "sent",
    };
    pushMessage(offerMsg);
    appendToConversationStore(offerMsg, currentUser?.id ?? "me");
    scheduleScrollToEnd();
    navigation.setParams({ offerPayload: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeOfferPayload, conversationId]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    };
  }, []);

  const scheduleScrollToEnd = useCallback(() => {
    if (scrollTimerRef.current) {
      clearTimeout(scrollTimerRef.current);
    }
    scrollTimerRef.current = setTimeout(() => {
      scrollTimerRef.current = null;
      listRef.current?.scrollToEnd({ animated: true });
    }, 50);
  }, []);

  const pushMessage = useCallback((next: Message) => {
    setMessages((prev) => [...prev, next]);
  }, []);

  // Realtime subscription — append incoming messages live.
  // useChatMessageEvent subscribes to the conversation's topic and invokes
  // the handler for each `chat.message.created` event. The handler is held
  // in a ref by the hook so a fresh closure is captured every render without
  // re-subscribing.
  useChatMessageEvent(
    conversationId,
    useCallback(
      (payload: ChatMessageCreatedPayload) => {
        // P0.1: Deduplicate by BOTH server id AND clientMessageId. The
        // realtime event can arrive before the HTTP response, and the
        // optimistic message has a local id (not the server id). If the
        // realtime payload includes clientMessageId, match against the
        // optimistic message's clientMessageId to reconcile instead of
        // appending a duplicate.
        if (messagesRef.current.some((m) => m.id === payload.id)) return;

        // P0.1: If the realtime payload has a clientMessageId, check if we
        // already have an optimistic message with that clientMessageId. If so,
        // reconcile it (update id + status) instead of appending.
        if (payload.clientMessageId) {
          const optimistic = messagesRef.current.find(
            (m) => m.clientMessageId === payload.clientMessageId,
          );
          if (optimistic) {
            setMessages((prev) =>
              prev.map((m) =>
                m.clientMessageId === payload.clientMessageId
                  ? { ...m, id: payload.id, status: "sent" as const }
                  : m,
              ),
            );
            return;
          }
        }

        const domainMessage = realtimePayloadToMessage(payload, currentUser?.id);

        // Map the domain Message into the local chat Message shape used by
        // this hook's UI state.
        const localMessage: Message = {
          id: domainMessage.id,
          type:
            domainMessage.type === "system"
              ? "system"
              : domainMessage.mediaType
                ? "media"
                : "text",
          sender: domainMessage.sender === "me" ? "me" : "them",
          senderId: domainMessage.senderId,
          text: domainMessage.text,
          isSystem: domainMessage.isSystem,
          systemTitle: domainMessage.systemTitle,
          date: domainMessage.timestamp,
          mediaUri: domainMessage.mediaUri,
          mediaType: domainMessage.mediaType,
          status: "sent",
          replyToMessageId: domainMessage.replyToMessageId,
        };

        setMessages((prev) => [...prev, localMessage]);

        // Persist into the conversation store so the inbox preview and
        // hydration stay in sync.
        if (conversationId) {
          appendConversationMessage(conversationId, domainMessage);
        }

        scheduleScrollToEnd();
      },
      [conversationId, currentUser?.id, appendConversationMessage, scheduleScrollToEnd],
    ),
  );

  // P0.9: Consume delete realtime events — remove the message from the local
  // list when the server confirms a delete (for-me or for-everyone). This
  // handles second-device state and optimistic reconciliation.
  useChatMessageDeletedEvent(
    conversationId,
    useCallback(
      (event: { messageId: string; scope: 'me' | 'everyone'; deletedBy: string }) => {
        setMessages((prev) => prev.filter((m) => m.id !== event.messageId));
      },
      [],
    ),
  );

  // P2-03: Consume edit realtime events — reconcile the edited body and the
  // "Edited" label when another participant (or this user's second device)
  // edits a message. Skips the optimistic edit the editor already applied.
  useChatMessageEditedEvent(
    conversationId,
    useCallback(
      (event: {
        messageId: string;
        body: string;
        editVersion: number;
        editedAt: string | null;
        editedBy: string;
      }) => {
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== event.messageId) return m;
            // Skip if we already have a newer or equal revision (optimistic
            // edit applied locally before the realtime echo arrived).
            if ((m.editVersion ?? 0) >= event.editVersion) return m;
            return {
              ...m,
              text: event.body,
              isEdited: true,
              editedAt: event.editedAt,
              editVersion: event.editVersion,
            };
          }),
        );
      },
      [],
    ),
  );

  // P0.9: Consume reaction realtime events — update the local message's
  // reactions when another participant adds or removes a reaction.
  useChatReactionEvent(
    conversationId,
    useCallback(
      (event: { messageId: string; emoji: string; userId: string; action: 'added' | 'removed' }) => {
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== event.messageId) return m;
            const reactions = [...(m.reactions ?? [])];
            const idx = reactions.findIndex((r) => r.emoji === event.emoji);
            const isMe = event.userId === currentUser?.id;
            if (event.action === 'added') {
              if (idx >= 0) {
                reactions[idx] = {
                  ...reactions[idx],
                  count: reactions[idx].count + 1,
                  reactedByMe: reactions[idx].reactedByMe || isMe,
                };
              } else {
                reactions.push({ emoji: event.emoji, count: 1, reactedByMe: isMe });
              }
            } else {
              if (idx >= 0) {
                const nextCount = reactions[idx].count - 1;
                if (nextCount <= 0) {
                  reactions.splice(idx, 1);
                } else {
                  reactions[idx] = {
                    ...reactions[idx],
                    count: nextCount,
                    reactedByMe: reactions[idx].reactedByMe && !isMe ? true : !isMe && reactions[idx].reactedByMe,
                  };
                }
              }
            }
            return { ...m, reactions };
          }),
        );
      },
      [currentUser?.id],
    ),
  );

  // P0.9: Consume read receipt realtime events — when another participant
  // reads the conversation, mark all of our messages sent before the read
  // cursor as "read". This closes the second-device read-state gap.
  useChatReadReceiptEvent(
    conversationId,
    useCallback(
      (event: { userId: string; readAt: string }) => {
        if (event.userId === currentUser?.id) return; // ignore our own read
        const readAtTime = new Date(event.readAt).getTime();
        setMessages((prev) =>
          prev.map((m) => {
            if (m.sender !== 'me') return m;
            const msgTime = m.date ? new Date(m.date).getTime() : 0;
            if (msgTime <= readAtTime && m.readStatus !== 'read') {
              return { ...m, readStatus: 'read' as const };
            }
            return m;
          }),
        );
      },
      [currentUser?.id],
    ),
  );

  // Realtime resnapshot — when the bridge signals that canonical state for
  // this conversation should be refetched (e.g. after a gap was replayed),
  // re-sync the full message list from the API.
  const needsResnapshot = useRealtimeResnapshot(
    conversationId ? chatConversationTopic(conversationId) : "",
  );
  useEffect(() => {
    if (needsResnapshot) {
      void syncMessagesFromApi();
    }
  }, [needsResnapshot, syncMessagesFromApi]);

  // P0.14: Drain the chat outbox on mount — in case messages were queued
  // while offline and the user is now opening the conversation.
  useEffect(() => {
    void drainChatOutbox().catch(() => undefined);
  }, []);

  // NOTE: confirmAgentDraft is defined after `appendToConversationStore`
  // below, because it performs the canonical server send and only then
  // inserts the confirmed message into the conversation store.

  const appendToConversationStore = useCallback(
    (next: Message, senderIdOverride?: string) => {
      if (!conversationId) return;
      appendConversationMessage(conversationId, {
        id: next.id,
        senderId:
          senderIdOverride ?? (next.sender === "me" ? (currentUser?.id ?? "me") : "system"),
        text: next.text,
        offerPrice: next.offer?.price,
        originalPrice: next.offer?.originalPrice,
        offerStatus: next.offer?.status === "countered" ? "pending" : next.offer?.status,
        isSystem: senderIdOverride === "system",
        timestamp: "just now",
        type:
          next.type === "offer" ? "offer" : next.type === "media" ? "text" : "text",
        sender: next.sender === "me" ? "me" : "other",
        mediaUri: next.mediaUri,
        mediaType: next.mediaType,
        uploadStatus: next.uploadStatus,
      });
    },
    [conversationId, appendConversationMessage, currentUser?.id],
  );

  // Per spec 16: agent drafts are ephemeral local state. Confirming a draft
  // performs the canonical server send exactly once; only on server success
  // does the message enter the conversation store with status "sent". On
  // failure the draft is marked "failed" with a retry affordance.
  const confirmAgentDraft = useCallback(
    async (messageId: string) => {
      const draftMsg = messagesRef.current.find(
        (m) => m.id === messageId && m.isAgent && (m.status === "draft" || m.status === "failed"),
      );
      if (!draftMsg || !conversationId) return;

      // Mark as sending while the server request is in flight.
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, status: "sending" as const } : m,
        ),
      );
      haptic.light();

      try {
        // Canonical server send — exactly once. The agent identity is
        // preserved via metadata so the backend can attribute the message.
        // P0-MSG-2: reuse the draft's clientMessageId so a retry after a
        // dropped response replays the original message instead of
        // duplicating it.
        const clientMessageId = draftMsg.clientMessageId ?? createStableId('cmsg');
        const serverMsg = await sendConversationMessageOnApi(
          conversationId,
          draftMsg.text ?? "",
          { agentId: draftMsg.senderId },
          clientMessageId,
        );

        // Replace the local draft with the server-confirmed message.
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? { ...m, id: serverMsg.id, status: "sent" as const }
              : m,
          ),
        );

        // NOW insert into the conversation store — only after the server
        // confirms. The draft was never in the store, so this is the first
        // and only store insertion.
        appendToConversationStore(
          { ...draftMsg, id: serverMsg.id, status: "sent" },
          draftMsg.senderId,
        );
      } catch {
        // Mark as failed with retry affordance. Retry reuses the same
        // clientMessageId so it is idempotent (P0-MSG-2).
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId ? { ...m, status: "failed" as const } : m,
          ),
        );
        show("Failed to send agent draft. Tap to retry.", "error");
      }
    },
    [conversationId, haptic, show, appendToConversationStore],
  );

  // Retry handler for failed agent drafts — re-invokes confirmAgentDraft,
  // which re-attempts the canonical server send.
  const retryAgentDraft = useCallback(
    (messageId: string) => {
      void confirmAgentDraft(messageId);
    },
    [confirmAgentDraft],
  );

  const sendMessage = useCallback(
    (input: string, replyTo: Message | null, setInput: (v: string) => void, setReplyTo: (m: Message | null) => void) => {
      const trimmed = input.trim();
      if (!trimmed || !conversationId) return;
      if (composerSendingRef.current) return;
      composerSendingRef.current = true;

      haptic.light();

      if (containsOffPlatformPaymentPattern(trimmed)) {
        show(
          "Reminder: Keep payments in Thryftverse to stay protected by Buyer Protection.",
          "error",
        );
      }

      setComposerSending(true);

      const localId = makeStableId('msg', 7);
      // P0-MSG-2: stable clientMessageId generated BEFORE the first send and
      // reused on every retry. The backend deduplicates on
      // (conversation_id, sender_user_id, client_message_id) and replays the
      // original message, so a dropped response followed by retry cannot
      // create a duplicate row.
      const clientMessageId = createStableId('cmsg');
      const outgoing: Message = {
        id: localId,
        type: "text",
        sender: "me",
        senderLabel: currentUser?.username ?? "you",
        text: trimmed,
        status: "sending",
        clientMessageId,
      };

      if (replyTo) {
        outgoing.replyToMessageId = replyTo.id;
      }

      pushMessage(outgoing);
      appendToConversationStore(outgoing, currentUser?.id ?? "me");
      scheduleScrollToEnd();

      if (!pushPermissionAskedRef.current) {
        pushPermissionAskedRef.current = true;
        requestPushPermissionWithSoftAsk("chat").catch(() => undefined);
      }

      performance.mark("chat:send");

      sendConversationMessageOnApi(conversationId, trimmed, undefined, clientMessageId, {
        replyToMessageId: replyTo?.id,
      })
        .then((serverMsg) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === localId ? { ...m, id: serverMsg.id, status: "sent" as const } : m,
            ),
          );
          performance.mark("chat:delivered");
        })
        .catch(() => {
          // P0.2: A dropped response is an UNKNOWN outcome, not a known
          // failure. The server may have accepted the message. Mark as
          // "reconciling" — the user sees a quiet pending state, not a
          // failure. The next sync or realtime event will reconcile via
          // clientMessageId. Only after a retry attempt also fails do we
          // show "failed".
          setMessages((prev) =>
            prev.map((m) =>
              m.id === localId ? { ...m, status: "reconciling" as const } : m,
            ),
          );
          // P0.14: Persist to the durable outbox so the message is flushed
          // automatically when connectivity returns. The clientMessageId
          // ensures idempotent replay — the server will return the original
          // message if the send actually succeeded, or create it now.
          enqueueChatMessage({
            conversationId,
            clientMessageId,
            text: trimmed,
            replyToMessageId: replyTo?.id,
          }).catch(() => undefined);
        })
        .finally(() => {
          composerSendingRef.current = false;
          setComposerSending(false);
        });

      setInput("");
      setReplyTo(null);

      clearComposerState(conversationId).catch(() => undefined);

      // P0.15/anti-AI policy: Demo agent auto-injection removed from production.
      // The report (§8.9) states: "never inject mock AI replies into production
      // history." Agent drafts that auto-appear after every user message are
      // mock output. When a real agent runtime exists, it will be invoked
      // explicitly by the user, not auto-injected after every send.
    },
    [
      conversationId,
      haptic,
      show,
      pushMessage,
      appendToConversationStore,
      scheduleScrollToEnd,
      clearComposerState,
      currentUser?.username,
      currentUser?.id,
    ],
  );

  const sendMediaMessage = useCallback(
    async (msgId: string, uri: string, mediaType: "image" | "video", caption?: string, existingCanonicalUrl?: string) => {
      if (!conversationId) return;
      // P0-MSG-2: stable clientMessageId for idempotent media send/retry.
      const clientMessageId = createStableId('cmsg');

      // P0.7: If a canonical URL from a previous successful upload already
      // exists (retry scenario), reuse it — do NOT re-upload. Re-uploading
      // would create duplicate media_assets rows and waste bandwidth. The
      // canonical URL is immutable once finalized.
      let canonicalUrl: string;
      if (existingCanonicalUrl && existingCanonicalUrl.startsWith('http')) {
        canonicalUrl = existingCanonicalUrl;
      } else {
        // P0.4: Upload via the canonical media platform BEFORE sending the
        // message. The raw file:/// URI is only valid on the sender's device.
        // uploadMedia() does presign → PUT → finalize → returns a canonical
        // publicUrl that recipients and second devices can read.
        try {
          const uploaded = await uploadMedia(uri, 'uploads');
          canonicalUrl = uploaded.publicUrl;
        } catch {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === msgId ? { ...m, uploadStatus: "failed" as const } : m,
            ),
          );
          show("Upload failed. Tap media to retry.", "error");
          return;
        }
      }

      // P0-MSG-1: send a discriminated media payload with the CANONICAL URL
      // (not the local file:/// URI). The canonical URL is readable by all
      // devices and recipients.
      sendConversationMessageOnApi(
        conversationId,
        caption ?? "",
        { mediaUri: canonicalUrl, mediaType },
        clientMessageId,
        { type: mediaType, mediaUri: canonicalUrl },
      )
        .then((serverMsg) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === msgId ? { ...m, id: serverMsg.id, uploadStatus: "sent" as const, mediaUri: canonicalUrl } : m,
            ),
          );
        })
        .catch(() => {
          // P0.4: The upload succeeded but the message send response was
          // dropped — this is an UNKNOWN outcome, not a known failure. The
          // server may have created the message. Enter reconciling state and
          // enqueue to the durable outbox so the drain can replay with the
          // same clientMessageId (server dedups) and canonical URL (no
          // re-upload needed).
          setMessages((prev) =>
            prev.map((m) =>
              m.id === msgId ? { ...m, status: "reconciling" as const, uploadStatus: "sent" as const, mediaUri: canonicalUrl } : m,
            ),
          );
          enqueueChatMessage({
            conversationId,
            clientMessageId,
            text: caption ?? "",
            metadata: { mediaUri: canonicalUrl, type: mediaType },
          }).catch(() => undefined);
        });

      if (!pushPermissionAskedRef.current) {
        pushPermissionAskedRef.current = true;
        requestPushPermissionWithSoftAsk("chat").catch(() => undefined);
      }
    },
    [conversationId, show],
  );

  // ---------------------------------------------------------------------------
  // Voice messages — report 19. Recording preview → presign → PUT → finalize
  // → voice send with idempotent clientMessageId. Unknown-outcome sends use
  // the durable outbox, just like media and text.
  // ---------------------------------------------------------------------------
  const sendVoiceMessage = useCallback(
    async (msgId: string, draft: { uri: string; fileName: string; contentType: string; durationMs: number; sizeBytes: number }, existingCanonicalUrl?: string) => {
      if (!conversationId) return;
      const clientMessageId = createStableId('cmsg');

      let canonicalUrl: string;
      if (existingCanonicalUrl && existingCanonicalUrl.startsWith('http')) {
        canonicalUrl = existingCanonicalUrl;
      } else {
        try {
          const uploaded = await uploadMedia(draft.uri, 'voice');
          canonicalUrl = uploaded.publicUrl;
        } catch {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === msgId ? { ...m, uploadStatus: "failed" as const } : m,
            ),
          );
          show("Voice upload failed. Tap voice message to retry.", "error");
          return;
        }
      }

      const voiceMetadata = {
        durationMs: draft.durationMs,
        bytes: draft.sizeBytes,
        container: 'm4a' as const,
        codec: 'aac' as const,
      };

      sendConversationMessageOnApi(
        conversationId,
        '',
        { mediaUri: canonicalUrl, mediaType: 'voice' as const, ...voiceMetadata },
        clientMessageId,
        { type: 'voice' as const, mediaUri: canonicalUrl },
      )
        .then((serverMsg) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === msgId ? { ...m, id: serverMsg.id, uploadStatus: "sent" as const, voiceUri: canonicalUrl } : m,
            ),
          );
        })
        .catch(() => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === msgId ? { ...m, status: "reconciling" as const, uploadStatus: "sent" as const, voiceUri: canonicalUrl } : m,
            ),
          );
          enqueueChatMessage({
            conversationId,
            clientMessageId,
            text: '',
            metadata: { mediaUri: canonicalUrl, type: 'voice', ...voiceMetadata },
          }).catch(() => undefined);
        });
    },
    [conversationId, show],
  );

  const createVoiceMessage = useCallback(
    (draft: { uri: string; fileName: string; contentType: string; durationMs: number; sizeBytes: number }): Message => {
      return {
        id: makeStableId('msg_voice', 7),
        type: 'voice',
        sender: 'me',
        senderLabel: currentUser?.username ?? 'you',
        text: '',
        voiceUri: draft.uri,
        voiceDurationMs: draft.durationMs,
        voiceContainer: 'm4a',
        voiceCodec: 'aac',
        uploadStatus: 'uploading',
      };
    },
    [currentUser?.username],
  );

  const handleSendVoice = useCallback(
    async (draft: { uri: string; fileName: string; contentType: string; durationMs: number; sizeBytes: number }) => {
      if (!conversationId) return;
      const outgoing = createVoiceMessage(draft);
      pushMessage(outgoing);
      appendToConversationStore(outgoing, currentUser?.id ?? 'me');
      haptic.success();
      scheduleScrollToEnd();
      sendVoiceMessage(outgoing.id, draft);
    },
    [conversationId, createVoiceMessage, pushMessage, appendToConversationStore, currentUser?.id, haptic, scheduleScrollToEnd, sendVoiceMessage],
  );

  const handleRetryUpload = useCallback(
    (msgId: string) => {
      setMessages((prev) => {
        const msg = prev.find((m) => m.id === msgId);
        if (!msg || msg.uploadStatus === "uploading") return prev;

        if (msg.type === 'voice' && msg.voiceUri && msg.voiceDurationMs) {
          // Voice retry: reuse the canonical URL if already uploaded, or
          // re-upload the local draft if still a file:// URI.
          const alreadyUploaded = msg.voiceUri.startsWith('http');
          setTimeout(() => {
            void sendVoiceMessage(
              msgId,
              {
                uri: alreadyUploaded ? msg.voiceUri! : msg.voiceUri!,
                fileName: `voice_retry_${Date.now()}.m4a`,
                contentType: 'audio/m4a',
                durationMs: msg.voiceDurationMs!,
                sizeBytes: 0,
              },
              alreadyUploaded ? msg.voiceUri : undefined,
            );
          }, 0);
          return prev.map((m) =>
            m.id === msgId ? { ...m, uploadStatus: "uploading" as const } : m,
          );
        }

        if (!msg.mediaUri || !msg.mediaType) return prev;
        // P0.7: If the media was already uploaded (canonical URL exists),
        // pass it so sendMediaMessage skips re-upload and only retries the
        // message send with the same clientMessageId.
        const alreadyUploaded = msg.mediaUri.startsWith('http');
        if (msg.mediaType === 'document') {
          setTimeout(
            () => void sendDocumentMessage(
              msgId,
              msg.mediaUri!,
              msg.documentName ?? 'File',
              msg.documentMimeType,
              msg.text || undefined,
              alreadyUploaded ? msg.mediaUri : undefined,
            ),
            0,
          );
        } else {
          setTimeout(
            () => void sendMediaMessage(
              msgId,
              msg.mediaUri!,
              msg.mediaType as "image" | "video",
              msg.text || undefined,
              alreadyUploaded ? msg.mediaUri : undefined,
            ),
            0,
          );
        }
        return prev.map((m) =>
          m.id === msgId ? { ...m, uploadStatus: "uploading" as const } : m,
        );
      });
      haptic.light();
    },
    [sendMediaMessage, sendVoiceMessage, haptic],
  );

  const handleRetrySendMessage = useCallback(
    (msgId: string) => {
      if (!conversationId) return;
      setMessages((prev) => {
        const msg = prev.find((m) => m.id === msgId);
        if (!msg?.text || msg.status === "sending") return prev;
        // P0-MSG-2: reuse the same clientMessageId so the backend replays the
        // original message if the previous request actually succeeded.
        const clientMessageId = msg.clientMessageId ?? createStableId('cmsg');
        // Trigger send after state update
        setTimeout(() => {
          sendConversationMessageOnApi(conversationId, msg.text!, undefined, clientMessageId)
            .then((serverMsg) => {
              setMessages((p) =>
                p.map((m) =>
                  m.id === msgId
                    ? { ...m, id: serverMsg.id, status: "sent" as const }
                    : m,
                ),
              );
            })
            .catch(() => {
              setMessages((p) =>
                p.map((m) =>
                  m.id === msgId ? { ...m, status: "failed" as const } : m,
                ),
              );
              show("Message failed to send. Tap to retry.", "error");
            });
        }, 0);
        return prev.map((m) =>
          m.id === msgId
            ? { ...m, status: "sending" as const, clientMessageId }
            : m,
        );
      });
      haptic.light();
    },
    [conversationId, show, haptic],
  );

  const createMediaMessage = useCallback(
    (uri: string): Message => {
      const mediaType = isVideoUri(uri) ? "video" : "image";
      return {
        id: makeStableId(`msg_${mediaType}`, 7),
        type: "media",
        sender: "me",
        senderLabel: currentUser?.username ?? "you",
        text: "",
        mediaUri: uri,
        mediaType,
        uploadStatus: "uploading",
      };
    },
    [currentUser?.username],
  );

  const handleSendPendingAttachment = useCallback(
    (
      caption: string,
      pendingAttachment: { uri: string; mediaType: "image" | "video" } | null,
      setPendingAttachment: (v: null) => void,
    ) => {
      if (!pendingAttachment) return;
      const { uri, mediaType } = pendingAttachment;
      const outgoing = createMediaMessage(uri);
      if (caption) {
        outgoing.text = caption;
      }
      pushMessage(outgoing);
      appendToConversationStore(outgoing, currentUser?.id ?? "me");
      haptic.success();
      scheduleScrollToEnd();
      void sendMediaMessage(outgoing.id, uri, mediaType, outgoing.text || undefined);
      setPendingAttachment(null);
    },
    [createMediaMessage, pushMessage, appendToConversationStore, currentUser?.id, haptic, scheduleScrollToEnd, sendMediaMessage],
  );

  // ── Document message send ───────────────────────────────────────────
  // Documents (PDF, ZIP, etc.) are uploaded via the same media platform,
  // then sent as type: 'document' with documentName/documentMimeType in
  // metadata. The backend stores them in chat_message_attachments with
  // kind='document'.
  const sendDocumentMessage = useCallback(
    async (msgId: string, uri: string, fileName: string, mimeType?: string, caption?: string, existingCanonicalUrl?: string) => {
      if (!conversationId) return;
      const clientMessageId = createStableId('cmsg');

      let canonicalUrl: string;
      if (existingCanonicalUrl && existingCanonicalUrl.startsWith('http')) {
        canonicalUrl = existingCanonicalUrl;
      } else {
        try {
          const uploaded = await uploadMedia(uri, 'uploads');
          canonicalUrl = uploaded.publicUrl;
        } catch {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === msgId ? { ...m, uploadStatus: "failed" as const } : m,
            ),
          );
          show("Upload failed. Tap to retry.", "error");
          return;
        }
      }

      sendConversationMessageOnApi(
        conversationId,
        caption ?? "",
        { documentUri: canonicalUrl, documentName: fileName, documentMimeType: mimeType, mediaUri: canonicalUrl, mediaType: 'document' },
        clientMessageId,
        { type: 'document', mediaUri: canonicalUrl },
      )
        .then((serverMsg) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === msgId ? { ...m, id: serverMsg.id, uploadStatus: "sent" as const, documentUri: canonicalUrl } : m,
            ),
          );
        })
        .catch(() => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === msgId ? { ...m, status: "reconciling" as const, uploadStatus: "sent" as const, documentUri: canonicalUrl } : m,
            ),
          );
          enqueueChatMessage({
            conversationId,
            text: caption ?? "",
            metadata: { documentUri: canonicalUrl, documentName: fileName, documentMimeType: mimeType, mediaUri: canonicalUrl, mediaType: 'document' },
            clientMessageId,
            type: 'document',
            mediaUri: canonicalUrl,
          });
        });
    },
    [conversationId, setMessages, show],
  );

  const createDocumentMessage = useCallback(
    (uri: string, fileName: string, mimeType?: string): Message => {
      return {
        id: makeStableId('msg_doc', 7),
        type: "media",
        sender: "me",
        senderLabel: currentUser?.username ?? "you",
        text: "",
        mediaUri: uri,
        mediaType: "image",
        uploadStatus: "uploading",
        documentUri: uri,
        documentName: fileName,
        documentMimeType: mimeType,
      };
    },
    [currentUser?.username],
  );

  const handleSendPendingDocument = useCallback(
    (
      caption: string,
      pendingDocument: { uri: string; name: string; mimeType?: string } | null,
      setPendingDocument: (v: null) => void,
    ) => {
      if (!pendingDocument) return;
      const { uri, name, mimeType } = pendingDocument;
      const outgoing = createDocumentMessage(uri, name, mimeType);
      if (caption) {
        outgoing.text = caption;
      }
      pushMessage(outgoing);
      appendToConversationStore(outgoing, currentUser?.id ?? "me");
      haptic.success();
      scheduleScrollToEnd();
      void sendDocumentMessage(outgoing.id, uri, name, mimeType, outgoing.text || undefined);
      setPendingDocument(null);
    },
    [createDocumentMessage, pushMessage, appendToConversationStore, currentUser?.id, haptic, scheduleScrollToEnd, sendDocumentMessage],
  );

  const scheduleUndoClear = useCallback(() => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = setTimeout(() => setRecentlyDeleted([]), 5000);
  }, []);

  const handleUndoDelete = useCallback(() => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    if (deleteApiStatusRef.current === "success") {
      show("Messages were deleted on the server and cannot be restored.", "info");
      setRecentlyDeleted([]);
      return;
    }
    setMessages((prev) => {
      const restored = [...recentlyDeleted];
      const all = [...prev, ...restored];
      all.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
      return all;
    });
    setRecentlyDeleted([]);
    show(t("chat.messagesRestored"), "success");
  }, [recentlyDeleted, show]);

  const handleBulkDelete = useCallback(
    (selectedMessageIds: Set<string>, exitSelectionMode: () => void) => {
      const idsToDelete = new Set(selectedMessageIds);
      const toDelete = messages.filter((m) => idsToDelete.has(m.id));
      if (toDelete.length === 0) {
        exitSelectionMode();
        return;
      }
      setConfirmation({
        title: "Delete messages?",
        message: `This will remove ${toDelete.length} message${toDelete.length === 1 ? "" : "s"}.`,
        confirmLabel: "Delete",
        cancelLabel: "Cancel",
        variant: "danger",
        onConfirm: async () => {
          haptic.medium();
          deleteApiStatusRef.current = "pending";
          setRecentlyDeleted(toDelete);
          setMessages((prev) => prev.filter((m) => !idsToDelete.has(m.id)));
          exitSelectionMode();
          scheduleUndoClear();
          try {
            if (!conversationId) throw new Error("No conversation");
            await Promise.all(
              toDelete.map((m) => deleteConversationMessageOnApi(conversationId, m.id, 'me')),
            );
            deleteApiStatusRef.current = "success";
          } catch {
            deleteApiStatusRef.current = "error";
            show("Some messages may not have been deleted on the server.", "error");
          }
        },
      });
    },
    [messages, conversationId, haptic, show, scheduleUndoClear],
  );

  const handleDeleteMessage = useCallback(
    (msg: Message) => {
      const isOwnMessage = msg.sender === "me";
      const messageAgeMs = msg.date ? Date.now() - new Date(msg.date).getTime() : Infinity;
      const withinDeleteWindow = messageAgeMs < 24 * 60 * 60 * 1000;
      const canDeleteForEveryone = isOwnMessage && withinDeleteWindow;

      const performDelete = async (scope: 'me' | 'everyone') => {
        haptic.medium();
        deleteApiStatusRef.current = "pending";
        setRecentlyDeleted([msg]);
        setMessages((prev) => prev.filter((m) => m.id !== msg.id));
        scheduleUndoClear();
        try {
          if (!conversationId) throw new Error("No conversation");
          await deleteConversationMessageOnApi(conversationId, msg.id, scope);
          deleteApiStatusRef.current = "success";
        } catch {
          deleteApiStatusRef.current = "error";
          show(scope === 'everyone'
            ? "Delete failed. The message may still be visible to others."
            : "Message deleted locally. It may still be visible to others.", "info");
        }
      };

      if (canDeleteForEveryone) {
        // Two real actions (delete for everyone / delete for me) plus an
        // implicit abort via backdrop dismiss. The destructive option is
        // the confirm button; the less-destructive option is the cancel
        // button. Labels make both actions explicit so neither reads as a
        // plain "cancel".
        setConfirmation({
          title: "Delete message?",
          message: "Choose how to delete this message.",
          confirmLabel: "Delete for everyone",
          cancelLabel: "Delete for me",
          variant: "danger",
          onConfirm: () => performDelete('everyone'),
          onCancel: () => performDelete('me'),
        });
      } else {
        setConfirmation({
          title: "Delete message?",
          message: "This message will be removed for you.",
          confirmLabel: "Delete",
          cancelLabel: "Cancel",
          variant: "danger",
          onConfirm: () => performDelete('me'),
        });
      }
    },
    [conversationId, haptic, show, scheduleUndoClear],
  );

  // P2-03: Inline message editing. The hook owns the editing message id so
  // ChatMessageRow can swap the bubble for a TextInput. `saveEdit` applies an
  // optimistic update (new text + isEdited label), calls the API, and reverts
  // to the prior text on failure. The realtime echo is reconciled by
  // `useChatMessageEditedEvent` above (skipped when the optimistic revision
  // already matches).
  const startEdit = useCallback((msg: Message) => {
    setEditingMessageId(msg.id);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingMessageId(null);
  }, []);

  const saveEdit = useCallback(
    async (messageId: string, newText: string) => {
      const trimmed = newText.trim();
      const target = messagesRef.current.find((m) => m.id === messageId);
      if (!target || !conversationId) {
        setEditingMessageId(null);
        return;
      }
      if (!trimmed || trimmed === (target.text ?? "")) {
        // No-op edit — just close the editor.
        setEditingMessageId(null);
        return;
      }

      const previousText = target.text;
      const previousEditVersion = target.editVersion ?? 0;
      const nextEditVersion = previousEditVersion + 1;

      // Optimistic update — apply the new text and "Edited" label immediately.
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? {
                ...m,
                text: trimmed,
                isEdited: true,
                editedAt: new Date().toISOString(),
                editVersion: nextEditVersion,
              }
            : m,
        ),
      );
      setEditingMessageId(null);
      haptic.light();

      try {
        await editConversationMessageOnApi(conversationId, messageId, trimmed);
        // The realtime echo reconciles editVersion/editedAt from the server.
        // No further local mutation needed.
      } catch {
        // Revert to the pre-edit state.
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? {
                  ...m,
                  text: previousText,
                  isEdited: previousEditVersion > 0,
                  editedAt: m.editedAt,
                  editVersion: previousEditVersion,
                }
              : m,
          ),
        );
        show("Failed to edit message. Please try again.", "error");
      }
    },
    [conversationId, haptic, show],
  );

  // When the user is at the bottom, record the seen message count so
  // unread messages arriving while scrolled up can be counted for the
  // scroll-to-bottom FAB badge (Instagram/WhatsApp pattern).
  useEffect(() => {
    if (!showScrollToBottom) {
      seenMessageCountRef.current = messages.length;
    }
  }, [messages.length, showScrollToBottom]);

  const unreadBelowCount = showScrollToBottom
    ? Math.max(0, messages.length - seenMessageCountRef.current)
    : 0;

  const scrollToBottom = useCallback(() => {
    listRef.current?.scrollToEnd({ animated: true });
    setShowScrollToBottom(false);
    seenMessageCountRef.current = messagesRef.current.length;
  }, []);

  const scrollToMessage = useCallback((messageId: string) => {
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === messageId);
      if (idx >= 0 && listRef.current) {
        try {
          listRef.current.scrollToIndex({
            index: idx,
            animated: true,
            viewPosition: 0.5,
          });
        } catch {
          // FlashList may not have rendered the item yet
        }
      }
      return prev;
    });
  }, []);

  // Date separator computation
  const dateSeparatorIndices = useMemo(() => {
    const indices = new Set<number>();
    const extractDate = (d?: string) => {
      if (!d) return "";
      const parsed = parseMessageDate(d);
      if (!parsed) return d;
      return `${parsed.getFullYear()}-${parsed.getMonth()}-${parsed.getDate()}`;
    };
    for (let i = 0; i < messages.length; i++) {
      if (i === 0) {
        indices.add(i);
        continue;
      }
      const prevDate = extractDate(messages[i - 1]?.date);
      const currDate = extractDate(messages[i]?.date);
      if (currDate && prevDate && currDate !== prevDate) {
        indices.add(i);
      }
    }
    return indices;
  }, [messages]);

  // Unread divider
  const unreadDividerIndex = useMemo(() => {
    if (!wasUnreadOnOpenRef.current) return -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].sender === "them" && !messages[i].isSystem) {
        return i;
      }
    }
    return -1;
  }, [messages]);

  const handleMessageListScroll = useCallback(
    (e: { nativeEvent: { contentOffset: { y: number }; contentSize: { height: number }; layoutMeasurement: { height: number } } }) => {
      const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
      const isNearBottom =
        contentSize.height - contentOffset.y - layoutMeasurement.height < 150;
      setShowScrollToBottom(!isNearBottom);
      // P0.6: Trigger incremental history load when the user scrolls near
      // the top. The FlashList's maintainVisibleContentPosition or the
      // screen's scroll-anchor logic preserves the visual position.
      if (contentOffset.y < 100 && hasMoreOlder && !isLoadingOlder) {
        void loadOlderMessages();
      }
    },
    [hasMoreOlder, isLoadingOlder, loadOlderMessages],
  );

  return {
    messages,
    setMessages,
    isSyncing,
    syncError,
    isOffline,
    showScrollToBottom,
    setShowScrollToBottom,
    unreadBelowCount,
    recentlyDeleted,
    composerSending,
    listRef,
    scheduleScrollToEnd,
    scrollToBottom,
    scrollToMessage,
    pushMessage,
    appendToConversationStore,
    confirmAgentDraft,
    retryAgentDraft,
    sendMessage,
    sendMediaMessage,
    sendVoiceMessage,
    handleSendVoice,
    createVoiceMessage,
    handleRetryUpload,
    handleRetrySendMessage,
    createMediaMessage,
    handleSendPendingAttachment,
    sendDocumentMessage,
    createDocumentMessage,
    handleSendPendingDocument,
    handleUndoDelete,
    handleBulkDelete,
    handleDeleteMessage,
    editingMessageId,
    startEdit,
    cancelEdit,
    saveEdit,
    confirmation,
    clearConfirmation,
    dateSeparatorIndices,
    unreadDividerIndex,
    handleMessageListScroll,
    syncMessagesFromApi,
    loadOlderMessages,
    isLoadingOlder,
    hasMoreOlder,
  };
}
