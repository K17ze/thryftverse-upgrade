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
import { Alert } from "react-native";

import { type FlashListRef } from "@shopify/flash-list";

import { useStore } from "../../store/useStore";
import type { Message as ConversationMessage } from '../../domain';
import {
  fetchConversationMessagesFromApi,
  sendConversationMessageOnApi,
  deleteConversationMessageOnApi,
} from "../../services/chatApi";
import {
  useChatMessageEvent,
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
import type { SuggestedReply } from "../../services/chatAgentsApi";
import type { SupportedCurrencyCode } from "../../constants/currencies";
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
  const [recentlyDeleted, setRecentlyDeleted] = useState<Message[]>([]);
  const [composerSending, setComposerSending] = useState(false);

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

  // Sync local messages when hydrated store messages change
  useEffect(() => {
    setMessages(hydratedMessages);
  }, [hydratedMessages]);

  // NetInfo listener — offline state + reconcile on reconnect
  const syncMessagesFromApi = useCallback(async () => {
    if (!conversationId) return;
    setIsSyncing(true);
    setSyncError(false);
    try {
      const syncedMessages = await fetchConversationMessagesFromApi(conversationId);
      if (!syncedMessages.length) return;
      replaceConversationMessages(conversationId, syncedMessages);
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
          ? `Counter-offer: ${formatFromFiat(price, "GBP")}`
          : `Offer: ${formatFromFiat(price, "GBP")}`,
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
        // Deduplicate by message id — the server may replay events after a
        // reconnect, and the optimistic local send also inserts by id.
        if (messagesRef.current.some((m) => m.id === payload.id)) return;

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

      sendConversationMessageOnApi(conversationId, trimmed, undefined, clientMessageId)
        .then((serverMsg) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === localId ? { ...m, id: serverMsg.id, status: "sent" as const } : m,
            ),
          );
          performance.mark("chat:delivered");
        })
        .catch(() => {
          // The response was lost (network error or non-2xx). The message may
          // or may not have been created server-side. Mark as failed so the
          // user can retry; retry reuses the same clientMessageId, so even if
          // the original request succeeded, the retry replays the original
          // message instead of duplicating it (idempotent replay).
          setMessages((prev) =>
            prev.map((m) =>
              m.id === localId ? { ...m, status: "failed" as const } : m,
            ),
          );
          show("Message failed to send. Tap to retry.", "error");
        })
        .finally(() => {
          composerSendingRef.current = false;
          setComposerSending(false);
        });

      setInput("");
      setReplyTo(null);

      clearComposerState(conversationId).catch(() => undefined);

      // AI chat agent response (demo)
      if (deployedChatAgents.length > 0 && conversationId) {
        setTimeout(() => {
          const agentResponse = getChatAgentResponse(conversationId, trimmed);
          if (!agentResponse.content) return;
          const agentMsg: Message = {
            id: agentResponse.id,
            type: "text",
            sender: "them",
            senderId: agentResponse.agentId,
            senderLabel: `${deployedChatAgents[0]?.name ?? "AI Agent"} · AI`,
            text: agentResponse.content,
            // Per spec 16: agent drafts are not sent messages. They enter the
            // history only after the user confirms them via confirmAgentDraft,
            // which performs the canonical server send and only then inserts
            // the message into the conversation store. The draft is ephemeral
            // local state so the user can review it before it is committed.
            status: "draft",
            isAgent: true,
            agentAvatar: deployedChatAgents[0]?.avatar,
            // P0-MSG-2: assign the clientMessageId up front so confirmAgentDraft
            // can reuse it on retry for idempotent replay.
            clientMessageId: createStableId('cmsg'),
          };
          pushMessage(agentMsg);
          setChatAgentSuggestionsExternal(
            getChatAgentSuggestions(conversationId, agentResponse.content),
          );
          scheduleScrollToEnd();
        }, 500);
      } else if (conversationId) {
        setChatAgentSuggestionsExternal(getChatAgentSuggestions(conversationId, trimmed));
      }
    },
    [
      conversationId,
      haptic,
      show,
      pushMessage,
      appendToConversationStore,
      scheduleScrollToEnd,
      clearComposerState,
      deployedChatAgents,
      getChatAgentResponse,
      getChatAgentSuggestions,
      setChatAgentSuggestionsExternal,
      currentUser?.username,
      currentUser?.id,
    ],
  );

  const sendMediaMessage = useCallback(
    (msgId: string, uri: string, mediaType: "image" | "video", caption?: string) => {
      if (!conversationId) return;
      // P0-MSG-2: stable clientMessageId for idempotent media send/retry.
      const clientMessageId = createStableId('cmsg');
      // P0-MSG-1: send a discriminated media payload so the backend schema
      // accepts the message. `type` makes text optional; the mediaUri is
      // forwarded both at the top level (for validation) and inside
      // metadata (for the read path / realtime mapping).
      sendConversationMessageOnApi(
        conversationId,
        caption ?? "",
        { mediaUri: uri, mediaType },
        clientMessageId,
        { type: mediaType, mediaUri: uri },
      )
        .then((serverMsg) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === msgId ? { ...m, id: serverMsg.id, uploadStatus: "sent" as const } : m,
            ),
          );
        })
        .catch(() => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === msgId ? { ...m, uploadStatus: "failed" as const } : m,
            ),
          );
          show("Upload failed. Tap media to retry.", "error");
        });

      if (!pushPermissionAskedRef.current) {
        pushPermissionAskedRef.current = true;
        requestPushPermissionWithSoftAsk("chat").catch(() => undefined);
      }
    },
    [conversationId, show],
  );

  const handleRetryUpload = useCallback(
    (msgId: string) => {
      setMessages((prev) => {
        const msg = prev.find((m) => m.id === msgId);
        if (!msg?.mediaUri || !msg.mediaType) return prev;
        if (msg.uploadStatus === "uploading") return prev;
        // Trigger upload after state update. Forward any caption text so a
        // retried media send preserves the user's original caption.
        setTimeout(
          () => sendMediaMessage(msgId, msg.mediaUri!, msg.mediaType!, msg.text || undefined),
          0,
        );
        return prev.map((m) =>
          m.id === msgId ? { ...m, uploadStatus: "uploading" as const } : m,
        );
      });
      haptic.light();
    },
    [sendMediaMessage, haptic],
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
      sendMediaMessage(outgoing.id, uri, mediaType, outgoing.text || undefined);
      setPendingAttachment(null);
    },
    [createMediaMessage, pushMessage, appendToConversationStore, currentUser?.id, haptic, scheduleScrollToEnd, sendMediaMessage],
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
      Alert.alert(
        "Delete messages?",
        `This will remove ${toDelete.length} message${toDelete.length === 1 ? "" : "s"}.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              haptic.medium();
              deleteApiStatusRef.current = "pending";
              setRecentlyDeleted(toDelete);
              setMessages((prev) => prev.filter((m) => !idsToDelete.has(m.id)));
              exitSelectionMode();
              scheduleUndoClear();
              try {
                if (!conversationId) throw new Error("No conversation");
                await Promise.all(
                  toDelete.map((m) => deleteConversationMessageOnApi(conversationId, m.id)),
                );
                deleteApiStatusRef.current = "success";
              } catch {
                deleteApiStatusRef.current = "error";
                show("Some messages may not have been deleted on the server.", "error");
              }
            },
          },
        ],
      );
    },
    [messages, conversationId, haptic, show, scheduleUndoClear],
  );

  const handleDeleteMessage = useCallback(
    (msg: Message) => {
      Alert.alert("Delete message?", "This message will be removed.", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            haptic.medium();
            deleteApiStatusRef.current = "pending";
            setRecentlyDeleted([msg]);
            setMessages((prev) => prev.filter((m) => m.id !== msg.id));
            scheduleUndoClear();
            try {
              if (!conversationId) throw new Error("No conversation");
              await deleteConversationMessageOnApi(conversationId, msg.id);
              deleteApiStatusRef.current = "success";
            } catch {
              deleteApiStatusRef.current = "error";
              show("Message deleted locally. It may still be visible to others.", "info");
            }
          },
        },
      ]);
    },
    [conversationId, haptic, show, scheduleUndoClear],
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
    },
    [],
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
    handleRetryUpload,
    handleRetrySendMessage,
    createMediaMessage,
    handleSendPendingAttachment,
    handleUndoDelete,
    handleBulkDelete,
    handleDeleteMessage,
    dateSeparatorIndices,
    unreadDividerIndex,
    handleMessageListScroll,
    syncMessagesFromApi,
  };
}
