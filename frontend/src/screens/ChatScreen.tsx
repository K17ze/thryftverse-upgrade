import React, { useEffect, useMemo, useRef, useState } from "react";

import { AnimatedPressable } from "../components/AnimatedPressable";

import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Alert,
  Pressable,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";

import NetInfo from "@react-native-community/netinfo";

import { AppState } from "react-native";
import {
  useSafeAreaInsets,
  SafeAreaView,
} from "react-native-safe-area-context";

import { StackScreenProps } from "@react-navigation/stack";

import { RootStackParamList } from "../navigation/types";

import { Colors } from "../constants/colors";

import { TypeStyles } from "../theme/designTokens";

import { useFormattedPrice } from "../hooks/useFormattedPrice";

import { useBackendData } from "../context/BackendDataContext";

import { getListingCoverUri, isVideoUri } from "../utils/media";

import { useStore } from "../store/useStore";

import {
  fetchConversationMessagesFromApi,
  sendConversationMessageOnApi,
  deleteConversationMessageOnApi,
} from "../services/chatApi";
import { fetchPublicProfile, PublicProfileUser } from "../services/profileApi";

import { useToast } from "../context/ToastContext";

import { useHaptic } from "../hooks/useHaptic";

import { KeyboardStickyView } from "../platform/keyboard/KeyboardProvider";

import { ChatComposerBar } from "../components/chat/ChatComposerBar";

import { MessageBubble } from "../components/chat/MessageBubble";

import { MarketplaceChatCard } from "../components/chat/MarketplaceChatCard";

import { ChatTopBar } from "../components/chat/ChatTopBar";

import { ChatListingContextBar } from "../components/chat/ChatListingContextBar";

import {
  ChatActionSheet,
  ChatAction,
} from "../components/chat/ChatActionSheet";

import { AttachmentReviewSheet } from "../components/chat/AttachmentReviewSheet";

import { Space, Radius, Type } from "../theme/designTokens";

import { MessageContextMenu } from "../components/chat/MessageContextMenu";

import { EmojiReactionsBar } from "../components/chat/EmojiReactionsBar";

import { ReplyQuote } from "../components/chat/ReplyQuote";

import { ScrollToBottomFAB } from "../components/chat/ScrollToBottomFAB";

import {
  LinkPreviewCard,
  extractFirstUrl,
} from "../components/chat/LinkPreviewCard";
import { PaymentWarningCard } from "../components/chat/PaymentWarningCard";

import { SkeletonChatLoader } from "../components/chat/SkeletonChatLoader";

import * as Clipboard from "expo-clipboard";

import * as ImagePicker from "expo-image-picker";

import { Caption } from "../components/ui/Text";

import {
  isFirstInCluster as isFirstInClusterHelper,
  isLastInCluster as isLastInClusterHelper,
} from "../utils/messageGrouping";

import { detectChatSafetyWarning, detectComposerSafetyWarning, containsOffPlatformPaymentPattern } from "../utils/chatSafetyWarnings";

import {
  isTrustedSystemMessage,
  resolveSystemMessageProvenance,
} from "../utils/systemMessageProvenance";

type Props = StackScreenProps<RootStackParamList, "Chat">;

type MsgType =
  "text" | "offer" | "offer_declined" | "purchase_status" | "media" | "system" | "commerce_state";

interface Message {
  id: string;

  type: MsgType;

  sender: "me" | "them";

  senderId?: string;

  senderLabel?: string;

  text?: string;

  isSystem?: boolean;

  systemTitle?: string;

  offer?: {
    price: number;
    originalPrice: number;
    status?: "pending" | "declined" | "countered" | "accepted" | "expired";
    /** ISO date string when the offer expires */
    expiresAt?: string;
    /** Counter-offer chain depth (0 = initial, 1 = first counter, etc.) */
    counterRound?: number;
  };

  date?: string;

  replyToMessageId?: string;

  reactions?: Array<{ emoji: string; count: number; reactedByMe: boolean }>;

  mediaUri?: string;

  mediaType?: "image" | "video";

  commerceState?: {
    stateType: "order_placed" | "payment_confirmed" | "order_shipped" | "order_in_transit" | "order_delivered" | "order_cancelled" | "order_refunded";
    orderId: string;
    orderShortId?: string;
    itemTitle?: string;
    itemImage?: string | null;
    trackingNumber?: string | null;
    carrier?: string | null;
  };

  uploadStatus?: "uploading" | "failed" | "sent";

  status?: "sending" | "sent" | "failed";
}

const INITIAL_MESSAGES: Message[] = [];

// Context-aware default quick replies shown when user hasn't configured custom ones
const DEFAULT_SELLER_QUICK_REPLIES = [
  "Thanks for your interest!",
  "Yes, it's still available.",
  "I can ship within 2 business days.",
  "Any questions about the item?",
];

const DEFAULT_BUYER_QUICK_REPLIES = [
  "Is this still available?",
  "Can I make an offer?",
  "What's your best price?",
  "Could you share more photos?",
];

function parseMessageDate(dateStr: string): Date | null {
  const legacyMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/);
  const d = legacyMatch
    ? new Date(
        Number(legacyMatch[3]),
        Number(legacyMatch[2]) - 1,
        Number(legacyMatch[1]),
        Number(legacyMatch[4] ?? 12),
        Number(legacyMatch[5] ?? 0),
      )
    : new Date(dateStr);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDateSeparator(dateStr: string): string | null {
  const d = parseMessageDate(dateStr);
  if (!d) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const input = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((today.getTime() - input.getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) {
    return d.toLocaleDateString(undefined, { weekday: "short" });
  }
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function formatMessageTime(dateStr?: string): string | undefined {
  if (!dateStr) return undefined;
  const hasExplicitTime = /T\d{2}:\d{2}|\b\d{1,2}:\d{2}\b/.test(dateStr);
  if (!hasExplicitTime) return undefined;
  const d = parseMessageDate(dateStr);
  if (!d) return undefined;
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export default function ChatScreen({ navigation, route }: Props) {
  const { conversationId, itemId: routeItemId, offerPayload: routeOfferPayload } = route.params;

  const currentUser = useStore((state) => state.currentUser);

  const conversations = useStore((state) => state.conversations);

  const bots = useStore((state) => state.availableChatBots);
  const customBots = useStore((state) => state.customBots);

  const appendConversationMessage = useStore(
    (state) => state.appendConversationMessage,
  );

  const replaceConversationMessages = useStore(
    (state) => state.replaceConversationMessages,
  );

  const markConversationRead = useStore((state) => state.markConversationRead);

  const setConversationDraft = useStore((state) => state.setConversationDraft);

  const addMessageReaction = useStore((state) => state.addMessageReaction);

  const { show } = useToast();

  const haptic = useHaptic();

  const insets = useSafeAreaInsets();

  const { listings } = useBackendData();

  const sellerQuickReplies = useStore((state) => state.sellerQuickReplies);
  const buyerQuickReplies = useStore((state) => state.buyerQuickReplies);

  const conversation = useMemo(
    () => conversations.find((item) => item.id === conversationId),

    [conversationId, conversations],
  );

  const isGroup = conversation?.type === "group";

  const botLookup = useMemo(() => {
    const map = new Map<string, string>();

    for (const bot of [...bots, ...customBots]) {
      map.set(bot.id, bot.name);
    }

    return map;
  }, [bots, customBots]);

  const userLookup = useMemo(() => {
    const map = new Map<string, string>();

    map.set("me", currentUser?.username ?? "you");

    if (currentUser?.id) {
      map.set(currentUser.id, currentUser.username);
    }

    for (const participant of conversation?.participantProfiles ?? []) {
      map.set(participant.id, participant.displayName || participant.username);
    }

    return map;
  }, [conversation?.participantProfiles, currentUser?.id, currentUser?.username]);

  const profileMediaOverrides = useStore(
    (state) => state.profileMediaOverrides,
  );

  const hydratedMessages = useMemo<Message[]>(() => {
    if (!conversation?.messages.length) {
      return [];
    }

    return conversation.messages.map((entry) => {
      const resolvedSenderId = entry.senderId;

      const isCurrentUserSender =
        resolvedSenderId === "me" || resolvedSenderId === currentUser?.id;

      const sender: "me" | "them" = isCurrentUserSender ? "me" : "them";

      const senderLabel =
        botLookup.get(resolvedSenderId) ??
        userLookup.get(resolvedSenderId) ??
        (resolvedSenderId === "system" ? "System" : "Thryft user");

      if (entry.offerPrice !== undefined && entry.originalPrice !== undefined) {
        return {
          id: entry.id,

          type: "offer",

          sender,

          senderId: resolvedSenderId,

          senderLabel,

          offer: {
            price: entry.offerPrice,

            originalPrice: entry.originalPrice,

            status: entry.offerStatus,
          },

          text: entry.text,
        };
      }

      return {
        id: entry.id,

        type:
          entry.isSystem || entry.type === "system"
            ? "system"
            : entry.mediaUri
              ? "media"
              : "text",

        sender,

        senderId: resolvedSenderId,

        senderLabel,

        text: entry.text ?? entry.systemTitle ?? "",

        isSystem: entry.isSystem,

        systemTitle: entry.systemTitle,

        date: entry.timestamp,

        reactions: entry.reactions?.map((r) => ({
          emoji: r.emoji,

          count: r.userIds.length,

          reactedByMe: r.userIds.includes(currentUser?.id ?? "me"),
        })),

        mediaUri: entry.mediaUri,

        mediaType: entry.mediaType,

        uploadStatus: entry.uploadStatus,
      };
    });
  }, [botLookup, conversation?.messages, currentUser?.id, userLookup]);

  const [messages, setMessages] = useState<Message[]>(hydratedMessages);

  const [input, setInput] = useState("");
  const [dangerWarningDismissed, setDangerWarningDismissed] = useState(false);
  const [cautionWarningDismissed, setCautionWarningDismissed] = useState(false);

  // Real-time composer safety detection — re-evaluates as the user types
  const composerSafetyWarning = React.useMemo(() => {
    if (dangerWarningDismissed && cautionWarningDismissed) return null;
    const detected = detectComposerSafetyWarning(input);
    if (!detected) return null;
    if (detected.level === 'danger' && dangerWarningDismissed) return null;
    if (detected.level === 'caution' && cautionWarningDismissed) return null;
    return detected;
  }, [input, dangerWarningDismissed, cautionWarningDismissed]);

  const composerDangerWarning = composerSafetyWarning?.level === 'danger' ? composerSafetyWarning : null;
  const composerCautionWarning = composerSafetyWarning?.level === 'caution' ? composerSafetyWarning : null;

  // Reset dismissal when the text changes enough to clear the pattern
  React.useEffect(() => {
    const detected = detectComposerSafetyWarning(input);
    if (!detected) {
      if (dangerWarningDismissed) setDangerWarningDismissed(false);
      if (cautionWarningDismissed) setCautionWarningDismissed(false);
    }
  }, [input, dangerWarningDismissed, cautionWarningDismissed]);

  const [contextMenuVisible, setContextMenuVisible] = useState(false);

  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);

  // Messages that have been toggled to show a translated view
  const [translatedMessageIds, setTranslatedMessageIds] = useState<Set<string>>(new Set());

  // Messages where the off-platform payment warning has been dismissed
  const [dismissedWarningIds, setDismissedWarningIds] = useState<Set<string>>(new Set());

  const [replyTo, setReplyTo] = useState<Message | null>(null);

  const [reactingToMessage, setReactingToMessage] = useState<Message | null>(
    null,
  );

  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  const [selectionMode, setSelectionMode] = useState(false);

  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(
    new Set(),
  );

  const [isSyncing, setIsSyncing] = useState(false);

  const [syncError, setSyncError] = useState(false);

  const [attachmentPickerVisible, setAttachmentPickerVisible] = useState(false);

  const [pendingAttachment, setPendingAttachment] = useState<{
    uri: string;
    mediaType: "image" | "video";
  } | null>(null);

  const [recentlyDeleted, setRecentlyDeleted] = useState<Message[]>([]);

  const undoTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const deleteApiStatusRef = useRef<"pending" | "success" | "error">("pending");

  const wasOfflineRef = useRef(false);

  const [searchQuery, setSearchQuery] = useState(
    route.params?.focusQuery ?? "",
  );

  const [searchMatchIndex, setSearchMatchIndex] = useState(0);

  const [isSearchActive, setIsSearchActive] = useState(
    !!route.params?.focusQuery,
  );

  const [isOffline, setIsOffline] = useState(false);

  const [composerSending, setComposerSending] = useState(false);

  const listRef = React.useRef<FlatList>(null);

  const { formatFromFiat } = useFormattedPrice();

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(
      (state: { isConnected: boolean | null }) => {
        const isNowOffline = !state.isConnected;

        setIsOffline(isNowOffline);

        // Reconcile on reconnect

        if (wasOfflineRef.current && !isNowOffline) {
          void syncMessagesFromApi();
        }

        wasOfflineRef.current = isNowOffline;
      },
    );

    return () => unsubscribe();
  }, []);

  const syncMessagesFromApi = async () => {
    if (!conversationId) return;

    setIsSyncing(true);

    setSyncError(false);

    try {
      const syncedMessages =
        await fetchConversationMessagesFromApi(conversationId);

      if (!syncedMessages.length) return;

      replaceConversationMessages(conversationId, syncedMessages);
    } catch {
      setSyncError(true);
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    const handleAppStateChange = (nextAppState: string) => {
      if (nextAppState === "active") {
        void syncMessagesFromApi();
      }
    };

    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange,
    );

    return () => subscription.remove();
  }, [conversationId]);

  useEffect(() => {
    setMessages(hydratedMessages);
  }, [hydratedMessages]);

  useEffect(() => {
    if (conversationId) markConversationRead(conversationId);
  }, [conversationId, markConversationRead]);

  // Auto-send offer message when arriving from MakeOfferScreen with an offerPayload
  const offerPayloadRef = useRef(routeOfferPayload);
  offerPayloadRef.current = routeOfferPayload;
  useEffect(() => {
    if (!routeOfferPayload || !conversationId) return;
    const { price, originalPrice, expiresAt, counterRound } = routeOfferPayload;
    const localId = `offer_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const offerMsg: Message = {
      id: localId,
      type: "offer",
      sender: "me",
      senderLabel: currentUser?.username ?? "you",
      text: counterRound > 0
        ? `Counter-offer: ${formatFromFiat(price, "GBP")}`
        : `Offer: ${formatFromFiat(price, "GBP")}`,
      offer: {
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
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    // Clear the payload from route params so it doesn't re-send on re-render
    navigation.setParams({ offerPayload: undefined } as any);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeOfferPayload, conversationId]);

  useEffect(() => {
    if (conversationId) setConversationDraft(conversationId, input);
  }, [input, conversationId, setConversationDraft]);

  const resolvedPartnerId = useMemo(() => {
    if (isGroup) return null;

    if (route.params?.partnerUserId) return route.params.partnerUserId;

    if (conversation?.sellerId) return conversation.sellerId;

    return (
      conversation?.participantIds?.find(
        (id) => id !== "me" && id !== currentUser?.id,
      ) ?? null
    );
  }, [
    conversation?.participantIds,
    conversation?.sellerId,
    currentUser?.id,
    isGroup,
    route.params?.partnerUserId,
  ]);

  const [partnerProfile, setPartnerProfile] = useState<PublicProfileUser | null>(null);

  useEffect(() => {
    let active = true;
    setPartnerProfile(null);
    if (!resolvedPartnerId) return () => { active = false; };
    fetchPublicProfile(resolvedPartnerId)
      .then((profile) => {
        if (active) setPartnerProfile(profile);
      })
      .catch(() => {
        // The conversation remains usable when a public profile is unavailable.
      });
    return () => {
      active = false;
    };
  }, [resolvedPartnerId]);

  const deployedBotIds = conversation?.botIds ?? [];
  const connectedAgents = useMemo(
    () =>
      customBots.filter(
        (bot) => deployedBotIds.includes(bot.id) && bot.runtimeMode === "ai",
      ),
    [customBots, deployedBotIds],
  );
  const agentQuickReplies = useMemo(
    () =>
      connectedAgents.slice(0, 3).map((agent) => {
        const starter = agent.agentConfig?.starterPrompts[0] ?? "";
        const invocation =
          agent.agentConfig?.triggerMode === "always"
            ? starter
            : agent.agentConfig?.triggerMode === "command"
              ? `${agent.commandHint}${starter ? ` ${starter}` : ""}`
              : `@${agent.slug}${starter ? ` ${starter}` : ""}`;
        return {
          label: starter || `Ask ${agent.name}`,
          onPress: () => setInput(invocation),
        };
      }),
    [connectedAgents],
  );

  const partnerSummary = resolvedPartnerId
    ? conversation?.participantProfiles?.find((participant) => participant.id === resolvedPartnerId)
    : undefined;

  const sellerHandle = resolvedPartnerId
    ? (partnerProfile?.displayName || partnerProfile?.username || partnerSummary?.displayName || partnerSummary?.username || userLookup.get(resolvedPartnerId) || "Thryft user")
    : "Thryft user";

  const searchMatches = useMemo(() => {
    const q = String(searchQuery ?? "")
      .trim()
      .toLowerCase();

    if (!q) return [];

    return messages

      .map((m, idx) => ({ msg: m, idx }))

      .filter(({ msg }) =>
        String(msg.text ?? "")
          .toLowerCase()
          .includes(q),
      );
  }, [messages, searchQuery]);

  useEffect(() => {
    if (searchMatches.length > 0 && listRef.current) {
      const targetIndex =
        searchMatches[Math.min(searchMatchIndex, searchMatches.length - 1)]
          ?.idx ?? 0;

      try {
        listRef.current.scrollToIndex({
          index: targetIndex,
          animated: true,
          viewPosition: 0.5,
        });
      } catch {
        // FlatList may not have rendered the item yet
      }
    }
  }, [searchMatchIndex, searchMatches]);

  const pushMessage = (next: Message) => {
    setMessages((prev) => [...prev, next]);
  };

  const appendToConversationStore = (
    next: Message,
    senderIdOverride?: string,
  ) => {
    if (!conversationId) return;
    appendConversationMessage(conversationId, {
      id: next.id,

      senderId:
        senderIdOverride ??
        (next.sender === "me" ? (currentUser?.id ?? "me") : "system"),

      text: next.text,

      offerPrice: next.offer?.price,

      originalPrice: next.offer?.originalPrice,

      offerStatus:
        next.offer?.status === "countered" ? "pending" : next.offer?.status,

      isSystem: senderIdOverride === "system",

      timestamp: "just now",

      type:
        next.type === "offer"
          ? "offer"
          : next.type === "media"
            ? "text"
            : "text",

      sender: next.sender === "me" ? "me" : "other",

      mediaUri: next.mediaUri,

      mediaType: next.mediaType,

      uploadStatus: next.uploadStatus,
    });
  };

  const sendMessage = () => {
    const trimmed = input.trim();

    if (!trimmed || !conversationId) return;

    // Send-time safety nudge — if the message contains off-platform payment
    // patterns, show a warning toast (but still allow sending).
    if (containsOffPlatformPaymentPattern(trimmed)) {
      show(
        "Reminder: Keep payments in Thryftverse to stay protected by Buyer Protection.",
        "error",
      );
    }

    setComposerSending(true);

    const localId =
      String(Date.now()) + "_" + Math.random().toString(36).slice(2, 7);

    const outgoing: Message = {
      id: localId,

      type: "text",

      sender: "me",

      senderLabel: currentUser?.username ?? "you",

      text: trimmed,

      status: "sending",
    };

    if (replyTo) {
      outgoing.replyToMessageId = replyTo.id;
    }

    pushMessage(outgoing);

    appendToConversationStore(outgoing, currentUser?.id ?? "me");

    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);

    sendConversationMessageOnApi(conversationId, trimmed)
      .then((serverMsg) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === localId
              ? { ...m, id: serverMsg.id, status: "sent" as const }
              : m,
          ),
        );
      })

      .catch(() => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === localId ? { ...m, status: "failed" as const } : m,
          ),
        );

        show("Message failed to send. Tap to retry.", "error");
      })

      .finally(() => setComposerSending(false));

    setInput("");

    setReplyTo(null);
  };

  const handleAcceptOffer = (msgId: string) => {
    haptic.medium();

    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId && m.offer
          ? { ...m, offer: { ...m.offer, status: "accepted" as const } }
          : m,
      ),
    );

    const linkedItemId = routeItemId || conversation?.itemId;

    if (linkedItemId) {
      navigation.navigate("Checkout", { itemId: linkedItemId });
    } else {
      show("Offer accepted. Checkout requires a linked listing.", "info");
    }
  };

  const handleDeclineOffer = (msgId: string) => {
    haptic.light();

    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId && m.offer
          ? { ...m, offer: { ...m.offer, status: "declined" as const } }
          : m,
      ),
    );
  };

  const handleCounterOffer = (msgId: string, offerPrice?: number, originalPrice?: number) => {
    haptic.medium();
    const linkedItemId = routeItemId || conversation?.itemId;
    if (!linkedItemId) {
      show("Cannot counter without a linked listing.", "info");
      return;
    }
    // Find the current offer to pass the counter round
    const currentMsg = messages.find((m) => m.id === msgId);
    const currentRound = currentMsg?.offer?.counterRound ?? 0;
    // Navigate to MakeOfferScreen with counter-offer context
    navigation.navigate("MakeOffer", {
      itemId: linkedItemId,
      price: originalPrice ?? 0,
      title: "Item",
      counterOffer: true,
      previousOffer: offerPrice ?? 0,
      counterRound: currentRound + 1,
    });
  };

  const handleOfferExpired = (msgId: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId && m.offer && m.offer.status === "pending"
          ? { ...m, offer: { ...m.offer, status: "expired" as const } }
          : m,
      ),
    );
  };

  const handleMessageLongPress = (msg: Message) => {
    if (selectionMode) {
      toggleMessageSelection(msg.id);

      return;
    }

    setSelectedMessage(msg);

    setContextMenuVisible(true);

    haptic.medium();
  };

  const toggleMessageSelection = (msgId: string) => {
    setSelectedMessageIds((prev) => {
      const next = new Set(prev);

      if (next.has(msgId)) next.delete(msgId);
      else next.add(msgId);

      if (next.size === 0) setSelectionMode(false);

      return next;
    });
  };

  const enterSelectionMode = (msgId: string) => {
    setSelectionMode(true);

    setSelectedMessageIds(new Set([msgId]));
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);

    setSelectedMessageIds(new Set());
  };

  const scheduleUndoClear = () => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);

    undoTimerRef.current = setTimeout(() => setRecentlyDeleted([]), 5000);
  };

  const handleUndoDelete = () => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);

    if (deleteApiStatusRef.current === "success") {
      show(
        "Messages were deleted on the server and cannot be restored.",
        "info",
      );

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

    show("Messages restored", "success");
  };

  const handleBulkDelete = () => {
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
                toDelete.map((m) =>
                  deleteConversationMessageOnApi(conversationId, m.id),
                ),
              );

              deleteApiStatusRef.current = "success";
            } catch {
              deleteApiStatusRef.current = "error";

              show(
                "Some messages may not have been deleted on the server.",
                "error",
              );
            }
          },
        },
      ],
    );
  };

  const handleDeleteMessage = (msg: Message) => {
    Alert.alert(
      "Delete message?",

      "This message will be removed.",

      [
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

              show(
                "Message deleted locally. It may still be visible to others.",
                "info",
              );
            }
          },
        },
      ],
    );
  };

  const scrollToBottom = () => {
    listRef.current?.scrollToEnd({ animated: true });

    setShowScrollToBottom(false);
  };

  const sendMediaMessage = (
    msgId: string,
    uri: string,
    mediaType: "image" | "video",
  ) => {
    if (!conversationId) return;
    sendConversationMessageOnApi(conversationId, "", {
      mediaUri: uri,

      mediaType,
    })
      .then((serverMsg) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId
              ? { ...m, id: serverMsg.id, uploadStatus: "sent" as const }
              : m,
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
  };

  const handleRetryUpload = (msgId: string) => {
    const msg = messages.find((m) => m.id === msgId);

    if (!msg?.mediaUri || !msg.mediaType) return;

    if (msg.uploadStatus === "uploading") return; // Guard against in-flight retry spam

    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId ? { ...m, uploadStatus: "uploading" as const } : m,
      ),
    );

    sendMediaMessage(msgId, msg.mediaUri, msg.mediaType);

    haptic.light();
  };

  const handleRetrySendMessage = (msgId: string) => {
    const msg = messages.find((m) => m.id === msgId);

    if (!msg?.text || msg.status === "sending" || !conversationId) return;

    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId ? { ...m, status: "sending" as const } : m,
      ),
    );

    sendConversationMessageOnApi(conversationId, msg.text)
      .then((serverMsg) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId
              ? { ...m, id: serverMsg.id, status: "sent" as const }
              : m,
          ),
        );
      })

      .catch(() => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId ? { ...m, status: "failed" as const } : m,
          ),
        );

        show("Message failed to send. Tap to retry.", "error");
      });

    haptic.light();
  };

  const createMediaMessage = (uri: string): Message => {
    const mediaType = isVideoUri(uri) ? "video" : "image";

    return {
      id:
        String(Date.now()) +
        "_" +
        mediaType +
        "_" +
        Math.random().toString(36).slice(2, 7),

      type: "media",

      sender: "me",

      senderLabel: currentUser?.username ?? "you",

      text: "",

      mediaUri: uri,

      mediaType,

      uploadStatus: "uploading",
    };
  };

  const handleAttachmentSelect = async (type: ChatAction) => {
    if (type === "gallery") {
      try {
        const permission =
          await ImagePicker.requestMediaLibraryPermissionsAsync();

        if (!permission.granted) {
          show("Allow gallery access to upload media.", "error");
          return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.All,

          allowsMultipleSelection: false,

          quality: 0.9,
        });

        if (!result.canceled && result.assets?.[0]?.uri) {
          const uri = result.assets[0].uri;

          const mediaType = isVideoUri(uri) ? "video" : "image";

          setPendingAttachment({ uri, mediaType });

          haptic.light();
        }
      } catch {
        show("Could not open gallery.", "error");
      }
    } else if (type === "camera") {
      try {
        const permission = await ImagePicker.requestCameraPermissionsAsync();

        if (!permission.granted) {
          show("Allow camera access to capture media.", "error");
          return;
        }

        const result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.All,

          quality: 0.9,
        });

        if (!result.canceled && result.assets?.[0]?.uri) {
          const uri = result.assets[0].uri;

          const mediaType = isVideoUri(uri) ? "video" : "image";

          setPendingAttachment({ uri, mediaType });

          haptic.light();
        }
      } catch {
        show("Could not open camera.", "error");
      }
    }
  };

  const handleSendPendingAttachment = (caption: string) => {
    if (!pendingAttachment) return;
    const { uri, mediaType } = pendingAttachment;
    const outgoing = createMediaMessage(uri);
    if (caption) {
      outgoing.text = caption;
    }
    pushMessage(outgoing);
    appendToConversationStore(outgoing, currentUser?.id ?? "me");
    haptic.success();
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    sendMediaMessage(outgoing.id, uri, mediaType);
    setPendingAttachment(null);
  };

  const mediaTypeLabel = (t: "image" | "video") =>
    t === "video" ? "Video" : "Photo";

  // Date separator computation: show a date pill when the day changes between consecutive messages
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

  const scrollToMessage = (messageId: string) => {
    const idx = messages.findIndex((m) => m.id === messageId);
    if (idx >= 0 && listRef.current) {
      try {
        listRef.current.scrollToIndex({
          index: idx,
          animated: true,
          viewPosition: 0.5,
        });
      } catch {
        // FlatList may not have rendered the item yet
      }
    }
  };

  const renderMessage = (msg: Message, index: number) => {
    const prevMsg = messages[index - 1];
    const nextMsg = messages[index + 1];

    const clusterFirst = isFirstInClusterHelper(
      { sender: msg.sender, type: msg.type, date: msg.date },
      prevMsg
        ? { sender: prevMsg.sender, type: prevMsg.type, date: prevMsg.date }
        : undefined,
    );

    const clusterLast = isLastInClusterHelper(
      { sender: msg.sender, type: msg.type, date: msg.date },
      nextMsg
        ? { sender: nextMsg.sender, type: nextMsg.type, date: nextMsg.date }
        : undefined,
    );

    const isFirstInCluster = clusterFirst;
    const isLastInCluster = clusterLast;

    // Spacing tiers (8px base grid)
    let spacingTop: number = Space.sm;
    if (!prevMsg) spacingTop = Space.md;
    else if (prevMsg.sender === msg.sender) spacingTop = 2;
    else spacingTop = Space.md;

    // Cluster rhythm: tight bottom inside cluster, normal at cluster end
    let marginBottom: number = 2;
    if (isLastInCluster) marginBottom = Space.sm;

    const showDateSeparator = dateSeparatorIndices.has(index);
    const dateLabel = msg.date ? formatDateSeparator(msg.date) : null;

    const dateSeparator =
      showDateSeparator && dateLabel ? (
        <View style={styles.dateWrap}>
          <Text style={styles.dateText}>{dateLabel}</Text>
        </View>
      ) : null;

    // Purchase status message — inline centered event
    if (msg.type === "purchase_status") {
      const content = (
        <View key={msg.id} style={styles.statusWrap}>
          <MarketplaceChatCard type="purchase_status" text={msg.text} />
        </View>
      );
      return dateSeparator ? (
        <View key={msg.id + "_group"}>
          {dateSeparator}
          {content}
        </View>
      ) : (
        content
      );
    }

    // Commerce state card — rich order status with tracking
    if (msg.type === "commerce_state" && msg.commerceState) {
      const content = (
        <View
          key={msg.id}
          style={[
            styles.msgRow,
            { marginTop: spacingTop, marginBottom },
          ]}
        >
          <MarketplaceChatCard
            type="commerce_state"
            commerceState={{
              type: msg.commerceState.stateType,
              orderId: msg.commerceState.orderId,
              orderShortId: msg.commerceState.orderShortId,
              itemTitle: msg.commerceState.itemTitle,
              itemImage: msg.commerceState.itemImage,
              trackingNumber: msg.commerceState.trackingNumber,
              carrier: msg.commerceState.carrier,
            }}
            onViewOrder={() => {
              navigation.navigate("OrderDetail", { orderId: msg.commerceState!.orderId });
            }}
          />
        </View>
      );
      return dateSeparator ? (
        <View key={msg.id + "_group"}>
          {dateSeparator}
          {content}
        </View>
      ) : (
        content
      );
    }

    // System message — only render trusted styling if provenance is verified
    if (
      (msg.type === "system" || msg.isSystem) &&
      msg.senderId &&
      isTrustedSystemMessage({
        id: msg.id,
        senderId: msg.senderId,
        isSystem: msg.isSystem,
        type: msg.type === "system" ? "system" : undefined,
        systemTitle: msg.systemTitle,
        text: msg.text,
        timestamp: msg.date ?? "",
      } as any)
    ) {
      const provenance = resolveSystemMessageProvenance({
        id: msg.id,
        senderId: msg.senderId,
        isSystem: msg.isSystem,
        type: msg.type === "system" ? "system" : undefined,
        systemTitle: msg.systemTitle,
        text: msg.text,
        timestamp: msg.date ?? "",
      } as any);
      const content = (
        <View key={msg.id} style={styles.statusWrap}>
          <MarketplaceChatCard
            type="system"
            systemTitle={msg.systemTitle}
            text={msg.text}
            systemVerified={provenance.isProtected}
          />
        </View>
      );
      return dateSeparator ? (
        <View key={msg.id + "_group"}>
          {dateSeparator}
          {content}
        </View>
      ) : (
        content
      );
    }

    // Offer message — use MarketplaceChatCard
    if (msg.type === "offer" || msg.type === "offer_declined") {
      const isMe = msg.sender === "me";
      const content = (
        <View
          key={msg.id}
          style={[
            styles.msgRow,
            isMe && styles.msgRowRight,
            { marginTop: spacingTop, marginBottom },
          ]}
        >
          <MarketplaceChatCard
            type="offer"
            isMe={isMe}
            senderLabel={isGroup && !isMe ? msg.senderLabel : undefined}
            offer={msg.offer}
            formattedPrice={formatFromFiat(msg.offer!.price, "GBP", {
              displayMode: "fiat",
            })}
            formattedOriginalPrice={formatFromFiat(
              msg.offer!.originalPrice,
              "GBP",
              { displayMode: "fiat" },
            )}
            onAccept={() => handleAcceptOffer(msg.id)}
            onDecline={() => handleDeclineOffer(msg.id)}
            onCounter={() => handleCounterOffer(msg.id, msg.offer?.price, msg.offer?.originalPrice)}
            onExpire={() => handleOfferExpired(msg.id)}
          />
        </View>
      );
      return dateSeparator ? (
        <View key={msg.id + "_group"}>
          {dateSeparator}
          {content}
        </View>
      ) : (
        content
      );
    }

    const isMe = msg.sender === "me";
    const isMedia = msg.type === "media" && msg.mediaUri;
    if (!msg.text && !isMedia) return null;

    const bubble = (
      <View style={[styles.selectionRow, isMe && styles.selectionRowRight]}>
        {selectionMode ? (
          <AnimatedPressable
            style={[
              styles.checkbox,
              selectedMessageIds.has(msg.id) && styles.checkboxActive,
            ]}
            onPress={() => toggleMessageSelection(msg.id)}
            activeOpacity={0.7}
            hapticFeedback="light"
          >
            {selectedMessageIds.has(msg.id) ? (
              <Ionicons name="checkmark" size={14} color={Colors.textInverse} />
            ) : null}
          </AnimatedPressable>
        ) : null}
        <View
          key={msg.id}
          style={[
            styles.msgRow,
            isMe && styles.msgRowRight,
            { marginTop: spacingTop, marginBottom },
          ]}
        >
          <MessageBubble
            text={msg.text ?? ""}
            isMe={isMe}
            senderLabel={isGroup && !isMe ? msg.senderLabel : undefined}
            timestamp={isLastInCluster ? formatMessageTime(msg.date) : undefined}
            isTranslated={translatedMessageIds.has(msg.id)}
            status={
              isMe
                ? msg.status === "sending"
                  ? "sending"
                  : msg.status === "failed"
                    ? "failed"
                    : msg.uploadStatus === "uploading"
                      ? "sending"
                      : msg.uploadStatus === "failed"
                        ? "failed"
                        : "sent"
                : undefined
            }
            onLongPress={() => handleMessageLongPress(msg)}
            onReactionPress={() => setReactingToMessage(msg)}
            onMediaPress={
              msg.mediaUri
                ? () => {
                    const uri = msg.mediaUri!;
                    navigation.navigate("ChatMediaPreview", {
                      mediaUri: uri,
                      mediaType: msg.mediaType ?? "image",
                      senderLabel: msg.senderLabel,
                      timestamp: msg.date,
                      messageId: msg.id,
                    });
                  }
                : undefined
            }
            replyTo={
              msg.replyToMessageId
                ? (() => {
                    const parent = messages.find(
                      (m) => m.id === msg.replyToMessageId,
                    );
                    return parent
                      ? {
                          senderName: parent.senderLabel ?? "Thryft user",
                          text: parent.text ?? "",
                        }
                      : null;
                  })()
                : null
            }
            onReplyPress={
              msg.replyToMessageId
                ? () => scrollToMessage(msg.replyToMessageId!)
                : undefined
            }
            reactions={msg.reactions}
            mediaUri={msg.mediaUri}
            mediaType={msg.mediaType}
            uploadStatus={msg.uploadStatus}
            onRetry={
              msg.uploadStatus === "failed"
                ? () => handleRetryUpload(msg.id)
                : msg.status === "failed"
                  ? () => handleRetrySendMessage(msg.id)
                  : undefined
            }
            isFirstInCluster={isFirstInCluster}
            isLastInCluster={isLastInCluster}
            showAvatar={!isMe && isFirstInCluster}
          />
          {!isMedia &&
            (() => {
              const url = extractFirstUrl(msg.text ?? "");
              return url ? (
                <View
                  style={[
                    styles.linkPreviewWrap,
                    isMe && styles.linkPreviewWrapRight,
                  ]}
                >
                  <LinkPreviewCard url={url} />
                </View>
              ) : null;
            })()}
          {/* Off-platform payment warning — non-blocking inline card below the message */}
          {!isMedia && containsOffPlatformPaymentPattern(msg.text ?? "") && (
            <View style={[isMe && styles.linkPreviewWrapRight]}>
              <PaymentWarningCard
                dismissed={dismissedWarningIds.has(msg.id)}
                onDismiss={() => {
                  setDismissedWarningIds((prev) => {
                    const next = new Set(prev);
                    next.add(msg.id);
                    return next;
                  });
                }}
                onReport={() => {
                  navigation.navigate("Report", {
                    type: "user",
                    targetId: msg.senderId,
                  });
                }}
                isMe={isMe}
              />
            </View>
          )}
        </View>
      </View>
    );

    if (showDateSeparator && dateLabel) {
      return (
        <View key={msg.id + "_group"}>
          {dateSeparator}
          {bubble}
        </View>
      );
    }

    return bubble;
  };

  const avatarUri = !isGroup
    ? conversation?.avatar ||
      (resolvedPartnerId
        ? profileMediaOverrides[resolvedPartnerId]?.avatar
        : undefined) ||
      partnerProfile?.avatar ||
      partnerSummary?.avatar ||
      null
    : null;
  const topBarTitle = isGroup
    ? (conversation?.title ?? "Group chat")
    : sellerHandle;
  const topBarSubtitle = isGroup
    ? `${conversation?.participantIds?.length ?? 0} members`
    : "Marketplace chat";
  const topBarInitials = isGroup
    ? (conversation?.title
        ?.split(" ")
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase() ?? "G")
    : sellerHandle.slice(0, 2).toUpperCase();

  const linkedListing = useMemo(() => {
    const itemId = routeItemId ?? conversation?.itemId;
    if (!itemId) return null;
    return listings.find((l) => l.id === itemId) ?? null;
  }, [routeItemId, conversation?.itemId, listings]);

  return (
    <SafeAreaView edges={["bottom"]} style={styles.screenRoot}>
      <View style={styles.screenRoot}>
        <ChatTopBar
          title={topBarTitle}
          subtitle={topBarSubtitle}
          avatarUrl={avatarUri}
          initials={topBarInitials}
          variant={isGroup ? "group" : "dm"}
          isVerified={!isGroup && (partnerProfile?.emailVerified === true || partnerSummary?.emailVerified === true)}
          onBack={() => navigation.goBack()}
          onSearch={() => {
            if (isSearchActive) {
              setIsSearchActive(false);
              setSearchQuery("");
            } else {
              setIsSearchActive(true);
            }
          }}
          onInfo={() => {
            if (!conversation) return;
            navigation.navigate(
              isGroup ? "GroupChatInfo" : "ConversationInfo",
              { conversationId: conversation.id },
            );
          }}
          onTitlePress={() => {
            if (!conversation) return;
            if (isGroup) {
              navigation.navigate("GroupChatInfo", {
                conversationId: conversation.id,
              });
            } else if (resolvedPartnerId) {
              navigation.navigate("UserProfile", { userId: resolvedPartnerId });
            } else {
              navigation.navigate("ConversationInfo", {
                conversationId: conversation.id,
              });
            }
          }}
          isSearchActive={isSearchActive}
          searchValue={searchQuery}
          onSearchValueChange={(q: string) => {
            setSearchQuery(q);
            setSearchMatchIndex(0);
          }}
          searchResultLabel={
            searchMatches.length > 0
              ? `${searchMatchIndex + 1}/${searchMatches.length}`
              : undefined
          }
          onPreviousResult={() =>
            setSearchMatchIndex((i) => Math.max(0, i - 1))
          }
          onNextResult={() =>
            setSearchMatchIndex((i) =>
              Math.min(searchMatches.length - 1, i + 1),
            )
          }
          onCloseSearch={() => {
            setIsSearchActive(false);
            setSearchQuery("");
          }}
        />

        {!isGroup && linkedListing && (
          <ChatListingContextBar
            thumbnailUri={getListingCoverUri(linkedListing.images, "")}
            title={linkedListing.title}
            price={formatFromFiat(linkedListing.price, "GBP", {
              displayMode: "fiat",
            })}
            availability={linkedListing.isSold ? "Sold" : "Available"}
            primaryActionLabel={
              linkedListing.isSold
                ? "View item"
                : linkedListing.sellerId === currentUser?.id
                  ? "Manage"
                  : "Buy now"
            }
            primaryActionIcon={
              linkedListing.isSold
                ? "eye-outline"
                : linkedListing.sellerId === currentUser?.id
                  ? "settings-outline"
                  : "bag-handle-outline"
            }
            onPrimaryAction={
              linkedListing.isSold
                ? () =>
                    navigation.navigate("ItemDetail", {
                      itemId: linkedListing.id,
                    })
                : linkedListing.sellerId === currentUser?.id
                  ? () =>
                      navigation.navigate("ManageListing", {
                        itemId: linkedListing.id,
                      })
                  : () =>
                      navigation.navigate("Checkout", {
                        itemId: linkedListing.id,
                      })
            }
            secondaryActionLabel={
              linkedListing.isSold ? undefined : "View item"
            }
            secondaryActionIcon="eye-outline"
            onSecondaryAction={
              linkedListing.isSold
                ? undefined
                : () =>
                    navigation.navigate("ItemDetail", {
                      itemId: linkedListing.id,
                    })
            }
            onTitlePress={() =>
              navigation.navigate("ItemDetail", { itemId: linkedListing.id })
            }
            defaultCollapsed
          />
        )}

        {selectionMode ? (
          <View style={styles.selectionToolbar}>
            <AnimatedPressable
              onPress={exitSelectionMode}
              activeOpacity={0.7}
              scaleValue={0.92}
              hapticFeedback="light"
            >
              <Ionicons
                name="close-outline"
                size={24}
                color={Colors.textPrimary}
              />
            </AnimatedPressable>
            <Caption color={Colors.textMuted}>
              {selectedMessageIds.size} selected
            </Caption>
            <AnimatedPressable
              onPress={handleBulkDelete}
              activeOpacity={0.7}
              scaleValue={0.92}
              hapticFeedback="medium"
              accessibilityLabel="Delete selected"
            >
              <Ionicons name="trash-outline" size={22} color={Colors.danger} />
            </AnimatedPressable>
          </View>
        ) : null}

        {isSyncing ? (
          <SkeletonChatLoader count={6} />
        ) : syncError && !messages.length ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyGlyph}>
              <Ionicons
                name="cloud-offline-outline"
                size={40}
                color={Colors.textMuted}
              />
            </View>
            <Text style={styles.emptyTitle}>Couldn't load messages</Text>
            <Text style={styles.emptyBody}>
              Check your connection and try again.
            </Text>
            <Pressable
              onPress={() => void syncMessagesFromApi()}
              style={styles.retryBtn}
              accessibilityRole="button"
              accessibilityLabel="Retry loading messages"
            >
              <Ionicons name="refresh" size={16} color={Colors.textInverse} />
              <Text style={styles.retryBtnText}>Retry</Text>
            </Pressable>
          </View>
        ) : messages.length ? (
          <FlatList
            ref={listRef}
            data={messages}
            renderItem={({ item, index }) => renderMessage(item, index)}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.messageList}
            showsVerticalScrollIndicator={false}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="always"
            onScroll={(e) => {
              const { contentOffset, contentSize, layoutMeasurement } =
                e.nativeEvent;
              const isNearBottom =
                contentSize.height -
                  contentOffset.y -
                  layoutMeasurement.height <
                150;
              setShowScrollToBottom(!isNearBottom);
            }}
            scrollEventThrottle={200}
          />
        ) : (
          <View style={styles.emptyState}>
            <View style={styles.emptyGlyph}>
              <Ionicons
                name="chatbubbles-outline"
                size={26}
                color={Colors.textMuted}
              />
            </View>
            <Text style={styles.emptyTitle}>Start the conversation</Text>
            <Text style={styles.emptyBody}>
              Send a message, photo, or make an offer to get started.
            </Text>
          </View>
        )}

        <KeyboardStickyView offset={{ closed: Math.max(insets.bottom, Space.sm) + 8, opened: 8 }}>
        <View
          style={[
            styles.composerWrap,
            { paddingBottom: Math.max(insets.bottom, Space.sm) + 8 },
          ]}
        >
          {replyTo ? (
            <ReplyQuote
              senderName={replyTo.senderLabel ?? "Thryft user"}
              text={replyTo.text ?? ""}
              onClose={() => setReplyTo(null)}
            />
          ) : null}

          {reactingToMessage ? (
            <EmojiReactionsBar
              reactions={reactingToMessage.reactions ?? []}
              onReact={(emoji) => {
                if (reactingToMessage && conversationId) {
                  addMessageReaction(
                    conversationId,
                    reactingToMessage.id,
                    emoji,
                  );
                }
                setReactingToMessage(null);
              }}
            />
          ) : null}

          {isOffline && (
            <View style={styles.offlineBanner}>
              <Ionicons
                name="cloud-offline-outline"
                size={16}
                color={Colors.textSecondary}
              />
              <Text style={styles.offlineBannerText}>
                You are offline. Messages will be sent when you reconnect.
              </Text>
            </View>
          )}

          {recentlyDeleted.length > 0 && (
            <View style={styles.undoBanner}>
              <Text style={styles.undoBannerText}>
                {recentlyDeleted.length} message
                {recentlyDeleted.length === 1 ? "" : "s"} deleted
              </Text>
              <AnimatedPressable
                onPress={handleUndoDelete}
                activeOpacity={0.7}
                scaleValue={0.95}
                hapticFeedback="light"
                accessibilityLabel="Undo message deletion"
              >
                <Text style={styles.undoBannerAction}>Undo</Text>
              </AnimatedPressable>
            </View>
          )}

          <ChatComposerBar
            value={input}
            onChangeText={setInput}
            onSend={sendMessage}
            onAttachmentPress={() => setAttachmentPickerVisible(true)}
            onCameraPress={() => handleAttachmentSelect("camera")}
            placeholder="Message..."
            isSending={composerSending}
            quickReplies={
              agentQuickReplies.length > 0
                ? agentQuickReplies
                : linkedListing
                ? linkedListing.sellerId === currentUser?.id
                  ? [
                      ...(sellerQuickReplies.length > 0
                        ? sellerQuickReplies.slice(0, 4).map((text) => ({
                            label:
                              text.length > 30 ? text.slice(0, 28) + "…" : text,
                            onPress: () => setInput(text),
                          }))
                        : DEFAULT_SELLER_QUICK_REPLIES.map((text) => ({
                            label: text,
                            onPress: () => setInput(text),
                          }))),
                      {
                        label: "Manage replies",
                        onPress: () =>
                          navigation.navigate("ManageQuickReplies", {
                            role: "seller",
                          }),
                      },
                    ]
                  : [
                      ...(buyerQuickReplies.length > 0
                        ? buyerQuickReplies.slice(0, 4).map((text) => ({
                            label:
                              text.length > 30 ? text.slice(0, 28) + "…" : text,
                            onPress: () => setInput(text),
                          }))
                        : DEFAULT_BUYER_QUICK_REPLIES.map((text) => ({
                            label: text,
                            onPress: () => setInput(text),
                          }))),
                      {
                        label: "Manage replies",
                        onPress: () =>
                          navigation.navigate("ManageQuickReplies", {
                            role: "buyer",
                          }),
                      },
                    ]
                : undefined
            }
            safetyWarning={
              conversation
                ? detectChatSafetyWarning(
                    conversation,
                    currentUser?.id,
                    conversation.messages,
                  )?.message
                : undefined
            }
            dangerWarning={composerDangerWarning?.message}
            cautionWarning={composerCautionWarning?.message}
            onDismissDangerWarning={() => setDangerWarningDismissed(true)}
            onDismissCautionWarning={() => setCautionWarningDismissed(true)}
          />
        </View>
        </KeyboardStickyView>

        <ChatActionSheet
          visible={attachmentPickerVisible}
          onClose={() => setAttachmentPickerVisible(false)}
          onSelect={(action) => {
            if (action === "gallery" || action === "camera") {
              handleAttachmentSelect(action);
            }
          }}
        />

        {pendingAttachment && (
          <AttachmentReviewSheet
            visible={!!pendingAttachment}
            uri={pendingAttachment.uri}
            mediaType={pendingAttachment.mediaType}
            onClose={() => setPendingAttachment(null)}
            onSend={handleSendPendingAttachment}
          />
        )}

        <ScrollToBottomFAB
          visible={showScrollToBottom}
          onPress={scrollToBottom}
        />

        <MessageContextMenu
          visible={contextMenuVisible}
          onClose={() => setContextMenuVisible(false)}
          onAction={(action) => {
            if (!selectedMessage) return;
            switch (action) {
              case "copy": {
                Clipboard.setStringAsync(selectedMessage.text ?? "");
                show("Copied", "success");
                break;
              }
              case "reply":
                setReplyTo(selectedMessage);
                break;
              case "react":
                setReactingToMessage(selectedMessage);
                break;
              case "delete":
                handleDeleteMessage(selectedMessage);
                break;
              case "retry":
                if (selectedMessage.uploadStatus === "failed") {
                  handleRetryUpload(selectedMessage.id);
                } else {
                  handleRetrySendMessage(selectedMessage.id);
                }
                break;
              case "report":
                show("Report submitted. Thank you.", "success");
                break;
              case "translate": {
                setTranslatedMessageIds((prev) => {
                  const next = new Set(prev);
                  if (next.has(selectedMessage.id)) {
                    next.delete(selectedMessage.id);
                  } else {
                    next.add(selectedMessage.id);
                    show("Showing translated message. Tap 'Show original' to revert.", "info");
                  }
                  return next;
                });
                break;
              }
              default:
                break;
            }
          }}
          messageText={selectedMessage?.text ?? undefined}
          isOwnMessage={selectedMessage?.sender === "me"}
          isFailed={
            selectedMessage?.status === "failed" ||
            selectedMessage?.uploadStatus === "failed"
          }
          isTranslated={selectedMessage ? translatedMessageIds.has(selectedMessage.id) : false}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screenRoot: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  selectionToolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    backgroundColor: Colors.surfaceAlt,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },

  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Space.xs + 2,
    paddingHorizontal: Space.xl,
    paddingBottom: Space.xl,
  },

  emptyGlyph: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Space.sm,
    width: 56,
    height: 56,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceAlt,
  },

  emptyTitle: {
    fontSize: Type.subtitle.size,
    fontFamily: TypeStyles.title.fontFamily,
    color: Colors.textPrimary,
    textAlign: "center",
    letterSpacing: Type.subtitle.letterSpacing,
  },

  emptyBody: {
    fontSize: Type.caption.size,
    fontFamily: TypeStyles.body.fontFamily,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: Type.caption.lineHeight,
    marginTop: Space.xs,
  },

  messageList: {
    paddingTop: Space.sm,
    paddingBottom: Space.md,
  },

  dateWrap: {
    alignItems: "center",
    marginVertical: Space.sm + 2,
    paddingVertical: 3,
    paddingHorizontal: Space.sm,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceAlt,
    alignSelf: "center",
  },

  dateText: {
    fontSize: Type.meta.size,
    fontFamily: TypeStyles.body.fontFamily,
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  statusWrap: {
    marginVertical: Space.xs,
    paddingHorizontal: Space.md,
    alignItems: "center",
  },

  msgRow: {
    flexDirection: "column",
    width: "100%",
    gap: Space.xs,
    paddingHorizontal: 0,
  },

  msgRowRight: {
    alignItems: "stretch",
  },

  linkPreviewWrap: {
    maxWidth: "78%",
    alignSelf: "flex-start",
    marginTop: Space.xs,
  },

  linkPreviewWrapRight: {
    alignSelf: "flex-end",
  },

  selectionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Space.sm,
  },

  selectionRowRight: {
    flexDirection: "row-reverse",
  },

  checkbox: {
    width: 22,
    height: 22,
    borderRadius: Radius.sm,
    borderWidth: 2,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: Space.sm,
  },

  checkboxActive: {
    backgroundColor: Colors.brand,
    borderColor: Colors.brand,
  },

  composerWrap: {
    paddingHorizontal: 0,
    paddingBottom: 0,
    paddingTop: 0,
    backgroundColor: Colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },

  undoBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.surfaceAlt,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    marginHorizontal: -Space.md,
    marginTop: -Space.xs,
    marginBottom: Space.xs,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },

  undoBannerText: {
    color: Colors.textSecondary,
    fontSize: Type.caption.size,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
  },

  undoBannerAction: {
    color: Colors.brand,
    fontSize: Type.caption.size,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
  },

  offlineBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Space.xs,
    backgroundColor: `${Colors.textMuted}10`,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    marginHorizontal: -Space.md,
    marginTop: -Space.xs,
    marginBottom: Space.xs,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
  },

  offlineBannerText: {
    color: Colors.textSecondary,
    fontSize: Type.caption.size,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
  },

  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.xs,
    backgroundColor: Colors.brand,
    paddingHorizontal: Space.md + 4,
    paddingVertical: Space.sm + 2,
    borderRadius: Radius.lg,
    marginTop: Space.sm,
  },

  retryBtnText: {
    color: Colors.textInverse,
    fontSize: Type.bodyEmphasis.size,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
  },
});
