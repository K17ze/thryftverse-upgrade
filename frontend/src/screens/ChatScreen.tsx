import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AnimatedPressable } from "../components/AnimatedPressable";

import {
  View,
  Text,
  StyleSheet,
  Alert,
  Pressable,
  ActivityIndicator,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from "react-native";

import { FlashList, type FlashListRef } from "@shopify/flash-list";

import { Ionicons } from "@expo/vector-icons";

import NetInfo from "@react-native-community/netinfo";

import { AppState } from "react-native";
import {
  useSafeAreaInsets,
  SafeAreaView,
} from "react-native-safe-area-context";

import { NativeStackScreenProps } from "@react-navigation/native-stack";

import { RootStackParamList } from "../navigation/types";

import { useAppTheme } from "../theme/ThemeContext";

import { useFormattedPrice } from "../hooks/useFormattedPrice";

import { useBackendData } from "../context/BackendDataContext";

import { getListingCoverUri, isVideoUri } from "../utils/media";

import { useStore } from "../store/useStore";

import {
  fetchConversationMessagesFromApi,
  sendConversationMessageOnApi,
  deleteConversationMessageOnApi,
  fetchComposerStateFromApi,
  upsertComposerStateOnApi,
  clearComposerStateOnApi,
} from "../services/chatApi";
import { fetchPublicProfile, PublicProfileUser } from "../services/profileApi";
import { acceptListingOfferOnApi, declineListingOfferOnApi } from "../services/listingOffersApi";

import { useToast } from "../context/ToastContext";

import { useHaptic } from "../hooks/useHaptic";

import { KeyboardStickyView } from "../platform/keyboard/KeyboardProvider";

import { ChatComposerBar } from "../components/chat/ChatComposerBar";

import { TypingIndicator } from "../components/chat/TypingIndicator";

import { MessageBubble } from "../components/chat/MessageBubble";

import { MarketplaceChatCard } from "../components/chat/MarketplaceChatCard";

import { ChatTopBar } from "../components/chat/ChatTopBar";

import { ChatListingContextBar } from "../components/chat/ChatListingContextBar";

import {
  ChatActionSheet,
  ChatAction,
} from "../components/chat/ChatActionSheet";

import { AttachmentReviewSheet } from "../components/chat/AttachmentReviewSheet";

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

import { RetryState } from "../components/RetryState";
import { EmptyState } from "../components/EmptyState";

import { ChatAgentPicker } from "../components/chat/ChatAgentPicker";
import { SuggestedRepliesBar } from "../components/chat/SuggestedRepliesBar";
import { OfflineBanner } from "../components/OfflineBanner";
import {
  deployAgent as deployChatAgent,
  removeAgent as removeChatAgent,
  getDeployedAgents as getDeployedChatAgents,
  getAgentSuggestions as getChatAgentSuggestions,
  getAgentResponse as getChatAgentResponse,
  type ChatAgent,
  type SuggestedReply,
} from "../services/chatAgentsApi";

import * as Clipboard from "expo-clipboard";

import * as ImagePicker from "expo-image-picker";

import { Caption } from "../components/ui/Text";

import {
  isFirstInCluster as isFirstInClusterHelper,
  isLastInCluster as isLastInClusterHelper,
} from "../utils/messageGrouping";

import { detectChatSafetyWarning, detectComposerSafetyWarning, containsOffPlatformPaymentPattern } from "../utils/chatSafetyWarnings";
import {
  resolveComposerStack,
  isSlotVisible,
  type ComposerStackSlotState,
} from "../utils/chatComposerStack";

import {
  isTrustedSystemMessage,
  resolveSystemMessageProvenance,
} from "../utils/systemMessageProvenance";

import { t } from "../i18n";

import { requestPushPermissionOnce } from "../lib/pushPermission";

import { Space, Radius, Type, Typography, Control, Stroke } from '../theme/designTokens';
type Props = NativeStackScreenProps<RootStackParamList, "Chat">;

type MsgType =
  "text" | "offer" | "offer_declined" | "purchase_status" | "media" | "system" | "commerce_state" | "voice";

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
    offerId?: string;
    price: number;
    originalPrice: number;
    status?: "pending" | "declined" | "countered" | "accepted" | "expired" | "cancelled";
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

  voiceUri?: string;

  voiceDurationMs?: number;

  voiceWaveform?: number[];

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

  readStatus?: "sending" | "sent" | "delivered" | "read";

  /** True when this message was generated by a deployed AI agent (demo). */
  isAgent?: boolean;

  /** Ionicon name for the agent avatar glyph (only set for agent messages). */
  agentAvatar?: string;
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
  const { colors, isDark } = useAppTheme();

  const styles = useMemo(() => StyleSheet.create({
    screenRoot: {
      flex: 1,
      backgroundColor: colors.background,
    },

    selectionToolbar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      backgroundColor: colors.surfaceAlt,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },

    emptyStateWrap: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: Space.xl,
      paddingBottom: Space.xl,
    },

    messageList: {
      paddingTop: Space.sm,
      paddingBottom: Space.md,
    },

    dateWrap: {
      alignItems: "center",
      marginVertical: Space.sm,
      paddingVertical: Space.xs,
      paddingHorizontal: Space.sm,
      borderRadius: Radius.full,
      backgroundColor: colors.surfaceAlt,
      alignSelf: "center",
    },

    dateText: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.regular,
      color: colors.textMuted,
      textTransform: "uppercase",
      letterSpacing: Type.meta.letterSpacing,
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
      width: Control.icon,
      height: Control.icon,
      borderRadius: Radius.sm,
      borderWidth: Stroke.emphasis,
      borderColor: colors.border,
      backgroundColor: colors.surfaceAlt,
      alignItems: "center",
      justifyContent: "center",
      marginHorizontal: Space.sm,
    },

    checkboxActive: {
      backgroundColor: colors.brand,
      borderColor: colors.brand,
    },

    composerWrap: {
      paddingHorizontal: 0,
      paddingBottom: 0,
      paddingTop: 0,
      backgroundColor: colors.surface,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },

    undoBanner: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: colors.surfaceAlt,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      marginHorizontal: -Space.md,
      marginTop: -Space.xs,
      marginBottom: Space.xs,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
    },

    undoBannerText: {
      color: colors.textSecondary,
      fontSize: Type.meta.size,
      fontFamily: Typography.family.semibold,
    },

    undoBannerAction: {
      color: colors.brand,
      fontSize: Type.meta.size,
      fontFamily: Typography.family.semibold,
    },

    agentRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: Space.sm + Space.xs,
      paddingVertical: Space.xs,
      gap: Space.sm,
      flexWrap: 'wrap',
    },

    agentChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingHorizontal: Space.sm,
      paddingVertical: Space.xs,
      borderRadius: Radius.md,
      backgroundColor: `${colors.brand}14`,
    },

    agentChipPressed: {
      backgroundColor: colors.surfaceAlt,
    },

    agentChipText: {
      fontSize: Type.meta.size,
      color: colors.brand,
      fontFamily: Typography.family.semibold,
    },

    agentHintText: {
      fontSize: Type.meta.size,
      color: colors.textSecondary,
      fontFamily: Typography.family.medium,
    },

    addAgentBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingHorizontal: Space.sm,
      paddingVertical: Space.xs,
      borderRadius: Radius.md,
      borderWidth: Stroke.standard,
      borderColor: colors.border,
    },

    addAgentBtnPressed: {
      backgroundColor: colors.surfaceAlt,
    },

    addAgentBtnText: {
      fontSize: Type.meta.size,
      color: colors.textSecondary,
      fontFamily: Typography.family.medium,
    },

    typingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: Space.md,
      paddingVertical: Space.xs,
      gap: Space.xs,
    },

    typingText: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      color: colors.textMuted,
    },
  }), [colors]);

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
        (resolvedSenderId === "system" ? "System" : t('chat.fallbackUserName'));

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

            status: entry.offerStatus as "pending" | "declined" | "countered" | "accepted" | "expired" | "cancelled" | undefined,
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

  // AI chat agents (demo-mode service) — deployable assistants that surface
  // suggested replies and an optional agent response after the user sends.
  const [chatAgentPickerVisible, setChatAgentPickerVisible] = useState(false);
  const [deployedChatAgents, setDeployedChatAgents] = useState<ChatAgent[]>([]);
  const [chatAgentSuggestions, setChatAgentSuggestions] = useState<SuggestedReply[]>([]);

  // Per App Store / Google Play 2026 guidelines, push permission is requested
  // only after a meaningful user action — here, after the user sends their
  // first chat message. The ref guards against re-prompting within the same
  // session; requestPushPermissionOnce also persists an AsyncStorage flag so
  // the user is never re-prompted across sessions for the same trigger.
  const pushPermissionAskedRef = useRef(false);

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

  const [isVoiceRecording, setIsVoiceRecording] = useState(false);

  const [pendingAttachment, setPendingAttachment] = useState<{
    uri: string;
    mediaType: "image" | "video";
  } | null>(null);

  const [recentlyDeleted, setRecentlyDeleted] = useState<Message[]>([]);

  const undoTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrollTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

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
  // Ref guard prevents double-tap send before state update propagates (§13).
  const composerSendingRef = useRef(false);

  const [isTyping, setIsTyping] = useState(false);

  const listRef = React.useRef<FlashListRef<Message>>(null);

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

  useEffect(() => {
    setIsTyping(false);
  }, [conversationId]);

  // Auto-send offer message when arriving from MakeOfferScreen with an offerPayload
  const offerPayloadRef = useRef(routeOfferPayload);
  offerPayloadRef.current = routeOfferPayload;
  useEffect(() => {
    if (!routeOfferPayload || !conversationId) return;
    const { offerId, price, originalPrice, expiresAt, counterRound } = routeOfferPayload;
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
    // Clear the payload from route params so it doesn't re-send on re-render
    navigation.setParams({ offerPayload: undefined });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeOfferPayload, conversationId]);

  useEffect(() => {
    if (conversationId) setConversationDraft(conversationId, input);
  }, [input, conversationId, setConversationDraft]);

  // P0-7: Cross-device composer state hydration. On conversation open, fetch
  // the persisted composer state from the backend and restore draft text,
  // reply context and pending attachments so a draft started on another
  // device continues here. Only restore when the local draft is empty — we
  // never overwrite in-progress local input.
  const hydratedComposerRef = useRef<string | null>(null);
  useEffect(() => {
    if (!conversationId) return;
    hydratedComposerRef.current = null;
    let cancelled = false;
    (async () => {
      try {
        const state = await fetchComposerStateFromApi(conversationId);
        if (cancelled) return;
        hydratedComposerRef.current = conversationId;
        if (state.draftText && !input) {
          setInput(state.draftText);
        }
        if (state.replyToMessageId) {
          const replied = messages.find((m) => m.id === state.replyToMessageId);
          if (replied) setReplyTo(replied);
        }
      } catch {
        // Hydration is best-effort — a failed fetch must not block the
        // composer. The local draft store still works offline.
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  // P0-7: Debounced cross-device composer state persistence. Push the
  // current draft + reply context to the backend so it restores on other
  // devices. Debounced to 1.5s so we do not PUT on every keystroke.
  const composerPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!conversationId) return;
    if (composerPersistTimerRef.current) {
      clearTimeout(composerPersistTimerRef.current);
    }
    composerPersistTimerRef.current = setTimeout(() => {
      // Best-effort — never block UI on persistence failures.
      upsertComposerStateOnApi(conversationId, {
        draftText: input,
        replyToMessageId: replyTo?.id ?? null,
      }).catch(() => undefined);
    }, 1500);
    return () => {
      if (composerPersistTimerRef.current) {
        clearTimeout(composerPersistTimerRef.current);
      }
    };
  }, [input, replyTo, conversationId]);

  // P0-7: On unmount, flush the latest composer state synchronously-ish so
  // backgrounding the app does not lose the draft.
  useEffect(() => {
    return () => {
      if (composerPersistTimerRef.current) {
        clearTimeout(composerPersistTimerRef.current);
      }
      if (scrollTimerRef.current) {
        clearTimeout(scrollTimerRef.current);
      }
      if (undoTimerRef.current) {
        clearTimeout(undoTimerRef.current);
      }
      if (conversationId && input) {
        upsertComposerStateOnApi(conversationId, {
          draftText: input,
          replyToMessageId: replyTo?.id ?? null,
        }).catch(() => undefined);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Helper: scroll to end with cleanup safety. Clears any pending scroll
  // timer before setting a new one so we never leak timers on unmount.
  const scheduleScrollToEnd = useCallback(() => {
    if (scrollTimerRef.current) {
      clearTimeout(scrollTimerRef.current);
    }
    scrollTimerRef.current = setTimeout(() => {
      scrollTimerRef.current = null;
      listRef.current?.scrollToEnd({ animated: true });
    }, 50);
  }, []);

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

  // Sync demo AI chat agents from the chatAgentsApi service for this conversation.
  useEffect(() => {
    if (!conversationId) return;
    setDeployedChatAgents(getDeployedChatAgents(conversationId));
  }, [conversationId]);

  const handleDeployChatAgent = useCallback(
    (agent: ChatAgent) => {
      if (!conversationId) return;
      haptic.success();
      deployChatAgent(conversationId, agent.type);
      setDeployedChatAgents(getDeployedChatAgents(conversationId));
      setChatAgentPickerVisible(false);
      show(`${agent.name} connected`, "success");
      setChatAgentSuggestions(getChatAgentSuggestions(conversationId, ""));
    },
    [conversationId, haptic, show],
  );

  const handleRemoveChatAgent = useCallback(
    (agentId: string) => {
      if (!conversationId) return;
      haptic.medium();
      removeChatAgent(conversationId, agentId);
      setDeployedChatAgents(getDeployedChatAgents(conversationId));
      setChatAgentSuggestions([]);
      show("Agent removed", "info");
    },
    [conversationId, haptic, show],
  );

  const handleSelectChatAgentSuggestion = useCallback(
    (reply: SuggestedReply) => {
      haptic.selection();
      setInput(reply.text);
    },
    [haptic],
  );

  const partnerSummary = resolvedPartnerId
    ? conversation?.participantProfiles?.find((participant) => participant.id === resolvedPartnerId)
    : undefined;

  const sellerHandle = resolvedPartnerId
    ? (partnerProfile?.displayName || partnerProfile?.username || partnerSummary?.displayName || partnerSummary?.username || userLookup.get(resolvedPartnerId) || t('chat.fallbackUserName'))
    : t('chat.fallbackUserName');

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
        // FlashList may not have rendered the item yet
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
    // Ref guard: prevents double-tap before setComposerSending propagates (§13).
    if (composerSendingRef.current) return;
    composerSendingRef.current = true;

    haptic.light();

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

    scheduleScrollToEnd();

    // Contextual push permission prompt — ask once after the user sends their
    // first chat message. Best-effort; never blocks the send path.
    if (!pushPermissionAskedRef.current) {
      pushPermissionAskedRef.current = true;
      requestPushPermissionOnce('chat').catch(() => undefined);
    }

    // Performance mark: chat message send initiated.
    performance.mark("chat:send");

    sendConversationMessageOnApi(conversationId, trimmed)
      .then((serverMsg) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === localId
              ? { ...m, id: serverMsg.id, status: "sent" as const }
              : m,
          ),
        );
        // Performance mark: chat message delivered (server confirmed).
        performance.mark("chat:delivered");
      })

      .catch(() => {
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

    // P0-7: Clear the persisted cross-device composer state now that the
    // draft has been sent. Best-effort — a failed clear does not block the
    // send path; the next open will re-fetch and find an empty draft.
    clearComposerStateOnApi(conversationId).catch(() => undefined);

    // AI chat agent response (demo) — when an agent is deployed, surface a
    // mock agent reply after the user's message. The agent message is marked
    // as a system-style assistant message so it renders on the opposing side.
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
          status: "sent",
          isAgent: true,
          agentAvatar: deployedChatAgents[0]?.avatar,
        };
        pushMessage(agentMsg);
        appendToConversationStore(agentMsg, agentResponse.agentId);
        setChatAgentSuggestions(getChatAgentSuggestions(conversationId, agentResponse.content));
        scheduleScrollToEnd();
      }, 500);
    } else if (conversationId) {
      setChatAgentSuggestions(getChatAgentSuggestions(conversationId, trimmed));
    }
  };

  const handleAcceptOffer = async (msgId: string) => {
    const msg = messages.find((m) => m.id === msgId);
    const offerId = msg?.offer?.offerId;
    if (!offerId) {
      show("Cannot accept this offer — missing offer reference.", "error");
      return;
    }

    haptic.medium();

    // Optimistic update — revert on API failure so UI tells the truth (§11).
    const prevStatus = msg?.offer?.status;
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId && m.offer
          ? { ...m, offer: { ...m.offer, status: "accepted" as const } }
          : m,
      ),
    );

    try {
      await acceptListingOfferOnApi(offerId);
      const linkedItemId = routeItemId || conversation?.itemId;
      if (linkedItemId) {
        navigation.navigate("Checkout", { itemId: linkedItemId });
      } else {
        show("Offer accepted. Checkout requires a linked listing.", "info");
      }
    } catch {
      // Revert optimistic state — the offer was NOT accepted server-side.
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId && m.offer
            ? { ...m, offer: { ...m.offer, status: prevStatus ?? "pending" } }
            : m,
        ),
      );
      show("Could not accept offer. Try again.", "error");
    }
  };

  const handleDeclineOffer = async (msgId: string) => {
    const msg = messages.find((m) => m.id === msgId);
    const offerId = msg?.offer?.offerId;
    if (!offerId) {
      show("Cannot decline this offer — missing offer reference.", "error");
      return;
    }

    haptic.light();

    // Optimistic update — revert on API failure so UI tells the truth (§11).
    const prevStatus = msg?.offer?.status;
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId && m.offer
          ? { ...m, offer: { ...m.offer, status: "declined" as const } }
          : m,
      ),
    );

    try {
      await declineListingOfferOnApi(offerId);
    } catch {
      // Revert optimistic state — the offer was NOT declined server-side.
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId && m.offer
            ? { ...m, offer: { ...m.offer, status: prevStatus ?? "pending" } }
            : m,
        ),
      );
      show("Could not decline offer. Try again.", "error");
    }
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
      parentOfferId: currentMsg?.offer?.offerId,
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

    show(t('chat.messagesRestored'), "success");
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

    // Contextual push permission prompt — ask once after the user sends their
    // first media message. Best-effort; never blocks the send path.
    if (!pushPermissionAskedRef.current) {
      pushPermissionAskedRef.current = true;
      requestPushPermissionOnce('chat').catch(() => undefined);
    }
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
    scheduleScrollToEnd();
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
        // FlashList may not have rendered the item yet
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

    // Spacing tiers — tight within clusters, normal between clusters
    let spacingTop: number = Space.sm;
    if (!prevMsg) spacingTop = Space.md;
    else if (prevMsg.sender === msg.sender) spacingTop = Space.xs;
    else spacingTop = Space.md;

    // Cluster rhythm: tight bottom inside cluster, normal at cluster end
    let marginBottom: number = Space.xs;
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
        senderId: msg.senderId ?? "",
        isSystem: msg.isSystem,
        type: msg.type === "system" ? "system" : undefined,
        systemTitle: msg.systemTitle,
        text: msg.text,
        timestamp: msg.date ?? "",
      })
    ) {
      const provenance = resolveSystemMessageProvenance({
        id: msg.id,
        senderId: msg.senderId ?? "",
        isSystem: msg.isSystem,
        type: msg.type === "system" ? "system" : undefined,
        systemTitle: msg.systemTitle,
        text: msg.text,
        timestamp: msg.date ?? "",
      });
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
          accessibilityLiveRegion="polite"
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
    const isVoice = msg.type === "voice" && msg.voiceUri;
    if (!msg.text && !isMedia && !isVoice) return null;

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
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel={
              selectedMessageIds.has(msg.id)
                ? "Deselect message"
                : "Select message"
            }
            accessibilityState={{ selected: selectedMessageIds.has(msg.id) }}
          >
            {selectedMessageIds.has(msg.id) ? (
              <Ionicons name="checkmark" size={14} color={colors.textInverse} />
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
            isAgent={msg.isAgent}
            agentAvatar={msg.agentAvatar}
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
            readStatus={isMe ? msg.readStatus : undefined}
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
                          senderName: parent.senderLabel ?? t('chat.fallbackUserName'),
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
            voiceDurationMs={msg.voiceDurationMs}
            voiceWaveform={msg.voiceWaveform}
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
          {!isMedia && !isVoice &&
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
          {!isMedia && !isVoice && containsOffPlatformPaymentPattern(msg.text ?? "") && (
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
    ? (conversation?.title ?? t('chat.groupChatLabel'))
    : sellerHandle;
  const topBarSubtitle = isGroup
    ? `${conversation?.participantIds?.length ?? 0} members`
    : t('chat.marketplaceChatLabel');
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

  // Memoized FlashList callbacks — stable references avoid re-rendering the
  // whole message list when parent state that doesn't affect messages changes.
  const messageKeyExtractor = useCallback((item: Message) => item.id, []);
  const handleMessageListScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
      const isNearBottom =
        contentSize.height - contentOffset.y - layoutMeasurement.height < 150;
      setShowScrollToBottom(!isNearBottom);
    },
    [],
  );

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
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Exit selection mode"
              accessibilityHint="Closes the message selection toolbar"
            >
              <Ionicons
                name="close-outline"
                size={24}
                color={colors.textPrimary}
              />
            </AnimatedPressable>
            <Caption
              color={colors.textMuted}
              accessibilityLiveRegion="polite"
            >
              {selectedMessageIds.size} selected
            </Caption>
            <AnimatedPressable
              onPress={handleBulkDelete}
              activeOpacity={0.7}
              scaleValue={0.92}
              hapticFeedback="medium"
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityLabel="Delete selected messages"
              accessibilityRole="button"
              accessibilityHint="Permanently removes the selected messages from this conversation"
            >
              <Ionicons name="trash-outline" size={Control.icon} color={colors.danger} />
            </AnimatedPressable>
          </View>
        ) : null}

        {isSyncing ? (
          <SkeletonChatLoader count={6} />
        ) : syncError && !messages.length ? (
          <RetryState
            message="Couldn't load messages. Check your connection and try again."
            onRetry={() => void syncMessagesFromApi()}
          />
        ) : messages.length ? (
          <FlashList
            ref={listRef}
            data={messages}
            renderItem={({ item, index }) => renderMessage(item, index)}
            keyExtractor={messageKeyExtractor}
            contentContainerStyle={styles.messageList}
            showsVerticalScrollIndicator={false}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="always"
            accessibilityLiveRegion="polite"
            onScroll={handleMessageListScroll}
            scrollEventThrottle={200}
          />
        ) : (
          <View style={styles.emptyStateWrap}>
            <EmptyState
              density="compact"
              icon="chatbubble-outline"
              title="Start the conversation"
              subtitle="Send a message below to get started."
            />
          </View>
        )}

        <KeyboardStickyView offset={{ closed: Math.max(insets.bottom, Space.sm) + Space.sm, opened: Space.sm }}>
        <View
          style={[
            styles.composerWrap,
            { paddingBottom: Math.max(insets.bottom, Space.sm) + Space.sm },
          ]}
        >
          {isTyping ? (
            <View style={styles.typingRow}>
              <TypingIndicator />
              <Text style={styles.typingText}>typing...</Text>
            </View>
          ) : null}
          {/* P0-8: Composer-stack height enforcement. Multiple contextual
              banners can stack above the input bar (reply, reactions,
              offline, undo). On small devices the stack can push the input
              off-screen. The resolver keeps only the highest-priority slots
              that fit the budget so the input bar always remains usable. */}
          {(() => {
            const stackSlots: ComposerStackSlotState[] = [
              { slot: 'replyQuote', visible: !!replyTo, estimatedHeight: 56 },
              { slot: 'undoBanner', visible: recentlyDeleted.length > 0, estimatedHeight: 44 },
              { slot: 'offlineBanner', visible: isOffline, estimatedHeight: 36 },
              { slot: 'reactionPicker', visible: !!reactingToMessage, estimatedHeight: 48 },
            ];
            const resolution = resolveComposerStack(stackSlots);
            return (
              <>
                {isSlotVisible(resolution, 'replyQuote') && replyTo ? (
                  <ReplyQuote
                    senderName={replyTo.senderLabel ?? t('chat.fallbackUserName')}
                    text={replyTo.text ?? ""}
                    onClose={() => setReplyTo(null)}
                  />
                ) : null}

                {isSlotVisible(resolution, 'reactionPicker') && reactingToMessage ? (
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

                {isSlotVisible(resolution, 'offlineBanner') && isOffline && (
                  <OfflineBanner message="You are offline. Messages will be sent when you reconnect." />
                )}

                {isSlotVisible(resolution, 'undoBanner') && recentlyDeleted.length > 0 && (
                  <View style={styles.undoBanner}>
                    <Text
                      style={styles.undoBannerText}
                      accessibilityLiveRegion="polite"
                    >
                      {recentlyDeleted.length} message
                      {recentlyDeleted.length === 1 ? "" : "s"} deleted
                    </Text>
                    <AnimatedPressable
                      onPress={handleUndoDelete}
                      activeOpacity={0.7}
                      scaleValue={0.95}
                      hapticFeedback="light"
                      accessibilityRole="button"
                      accessibilityLabel="Undo message deletion"
                    >
                      <Text style={styles.undoBannerAction}>Undo</Text>
                    </AnimatedPressable>
                  </View>
                )}
              </>
            );
          })()}

          {/* AI agent suggested replies — shown above the composer when an
              agent is deployed, suggestions are available, and the user has
              not started typing (so the bar never competes with in-progress
              input). */}
          {deployedChatAgents.length > 0 &&
            chatAgentSuggestions.length > 0 &&
            input.trim().length === 0 && (
            <SuggestedRepliesBar
              suggestions={chatAgentSuggestions}
              onSelect={handleSelectChatAgentSuggestion}
            />
          )}

          {/* AI agent deployment row — quick access to deploy/remove agents.
              Shows deployed agent chips (each with the agent's avatar icon) or
              a subtle hint + "Add AI assistant" button when none are deployed. */}
          <View style={styles.agentRow}>
            {deployedChatAgents.map((agent) => (
              <Pressable
                key={agent.id}
                onPress={() => handleRemoveChatAgent(agent.id)}
                style={({ pressed }) => [
                  styles.agentChip,
                  pressed && styles.agentChipPressed,
                ]}
                accessibilityLabel={`Remove ${agent.name}`}
                accessibilityRole="button"
                accessibilityHint={`Remove ${agent.name} from this conversation`}
              >
                <Ionicons
                  name={(agent.avatar as keyof typeof Ionicons.glyphMap) || 'sparkles'}
                  size={Type.meta.size}
                  color={colors.brand}
                />
                <Text style={styles.agentChipText}>
                  {agent.name}
                </Text>
                <Ionicons
                  name="close-circle"
                  size={Type.meta.size}
                  color={colors.brand}
                />
              </Pressable>
            ))}

            {deployedChatAgents.length === 0 && (
              <Text style={styles.agentHintText}>
                AI assistants can help with search, styling, offers, and safety
              </Text>
            )}

            <Pressable
              onPress={() => setChatAgentPickerVisible(true)}
              style={({ pressed }) => [
                styles.addAgentBtn,
                pressed && styles.addAgentBtnPressed,
              ]}
              accessibilityLabel="Add AI assistant"
              accessibilityRole="button"
              accessibilityHint="Browse and deploy AI assistants into this conversation"
            >
              <Ionicons
                name="sparkles"
                size={Type.meta.size}
                color={colors.textSecondary}
              />
              <Text style={styles.addAgentBtnText}>
                {deployedChatAgents.length > 0
                  ? 'Add another assistant'
                  : 'Add AI assistant'}
              </Text>
            </Pressable>
          </View>

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

        {/* AI Chat Agent Picker — deploy AI assistants into the conversation.
            Demo mode per AGENTS.md §11 — agents use keyword-based suggestions,
            not real LLM inference. */}
        <ChatAgentPicker
          visible={chatAgentPickerVisible}
          onClose={() => setChatAgentPickerVisible(false)}
          onDeploy={handleDeployChatAgent}
          deployedAgentIds={deployedChatAgents.map((a) => a.id)}
        />

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
