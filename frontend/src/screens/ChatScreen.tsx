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

import { FlashList } from "@shopify/flash-list";

import { Ionicons } from "@expo/vector-icons";

import {
  useSafeAreaInsets,
  SafeAreaView,
} from "react-native-safe-area-context";

import { NativeStackScreenProps } from "@react-navigation/native-stack";

import { RootStackParamList } from "../navigation/types";
import { openProfile } from "../navigation/openProfile";

import { useAppTheme } from "../theme/ThemeContext";

import { useFormattedPrice } from "../hooks/useFormattedPrice";

import { useBackendData } from "../context/BackendDataContext";

import { getListingCoverUri } from "../utils/media";
import { makeStableId } from "../utils/createStableId";

import { useStore } from "../store/useStore";

import {
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

import { Space, Radius, Type, Typography, Control, Stroke } from '../theme/designTokens';

import {
  useConversationMessages,
  useConversationComposer,
  type Message,
  formatDateSeparator,
  formatMessageTime,
  DEFAULT_SELLER_QUICK_REPLIES,
  DEFAULT_BUYER_QUICK_REPLIES,
} from "../hooks/chat";
type Props = NativeStackScreenProps<RootStackParamList, "Chat">;

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
      paddingVertical: Space.sm - 1,
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
      marginVertical: Space.md,
      paddingVertical: 0,
      paddingHorizontal: 0,
      alignSelf: "center",
    },

    dateText: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.medium,
      color: colors.textMuted,
      letterSpacing: 0.4,
      textTransform: 'uppercase',
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
      marginTop: Space.sm,
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
      backgroundColor: colors.background,
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
      marginHorizontal: 0,
      marginTop: 0,
      marginBottom: 0,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm - 1,
    },

    undoBannerText: {
      color: colors.textSecondary,
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
    },

    undoBannerAction: {
      color: colors.brand,
      fontSize: Type.caption.size,
      fontFamily: Typography.family.semibold,
    },

    agentRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: Space.md,
      paddingVertical: Space.xs,
      gap: Space.xs + 1,
      flexWrap: 'wrap',
    },

    agentChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingHorizontal: Space.sm + 2,
      paddingVertical: Space.xs + 1,
      borderRadius: Radius.full,
      backgroundColor: `${colors.brand}0D`,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: `${colors.brand}26`,
    },

    agentChipPressed: {
      backgroundColor: `${colors.brand}14`,
    },

    agentChipText: {
      fontSize: Type.meta.size,
      color: colors.textPrimary,
      fontFamily: Typography.family.semibold,
    },

    typingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: Space.md,
      paddingVertical: Space.xs,
      gap: Space.xs + 1,
    },

    typingText: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      color: colors.textMuted,
    },

    unreadDividerWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      marginVertical: Space.sm,
      paddingHorizontal: Space.md,
    },

    unreadDividerLine: {
      flex: 1,
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.brand,
    },

    unreadDividerBadge: {
      paddingHorizontal: Space.sm + 2,
      paddingVertical: Space.xs,
      borderRadius: Radius.full,
      backgroundColor: `${colors.brand}14`,
    },

    unreadDividerText: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.semibold,
      color: colors.brand,
      letterSpacing: 0.3,
      textTransform: 'uppercase',
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

  const [dangerWarningDismissed, setDangerWarningDismissed] = useState(false);
  const [cautionWarningDismissed, setCautionWarningDismissed] = useState(false);

  // AI chat agents (demo-mode service) — deployable assistants that surface
  // suggested replies and an optional agent response after the user sends.
  const [chatAgentPickerVisible, setChatAgentPickerVisible] = useState(false);
  const [deployedChatAgents, setDeployedChatAgents] = useState<ChatAgent[]>([]);
  const [chatAgentSuggestions, setChatAgentSuggestions] = useState<SuggestedReply[]>([]);

  const [contextMenuVisible, setContextMenuVisible] = useState(false);

  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);

  // Messages that have been toggled to show a translated view
  const [translatedMessageIds, setTranslatedMessageIds] = useState<Set<string>>(new Set());

  // Messages where the off-platform payment warning has been dismissed
  const [dismissedWarningIds, setDismissedWarningIds] = useState<Set<string>>(new Set());

  const [selectionMode, setSelectionMode] = useState(false);

  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(
    new Set(),
  );

  const [isTyping, setIsTyping] = useState(false);

  const { formatFromFiat } = useFormattedPrice();

  // ─── Controller hook: message list state, sync, send, retry, delete ───
  // useConversationMessages owns the message list, API sync, sending, retry,
  // delete (with undo), offer auto-send, date separators, scroll helpers.
  // ChatScreen retains composer state, selection, safety, agents, and rendering.
  const {
    messages,
    setMessages,
    isSyncing,
    syncError,
    isOffline,
    showScrollToBottom,
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
    sendMessage: hookSendMessage,
    sendMediaMessage,
    handleRetryUpload,
    handleRetrySendMessage,
    createMediaMessage,
    handleSendPendingAttachment: hookSendPendingAttachment,
    handleUndoDelete,
    handleBulkDelete: hookBulkDelete,
    handleDeleteMessage,
    dateSeparatorIndices,
    unreadDividerIndex,
    handleMessageListScroll: hookHandleMessageListScroll,
    syncMessagesFromApi,
  } = useConversationMessages({
    conversationId,
    routeOfferPayload,
    currentUser,
    hydratedMessages,
    formatFromFiat,
    show,
    haptic,
    onOfferSent: () => {},
    clearComposerState: clearComposerStateOnApi,
    deployedChatAgents,
    getChatAgentResponse,
    getChatAgentSuggestions,
    setChatAgentSuggestionsExternal: setChatAgentSuggestions,
    navigation,
    isGroup,
    conversationUnread: conversation?.unread,
    markConversationRead,
    appendConversationMessage,
    replaceConversationMessages,
  });

  // ─── Controller hook: composer state, attachments, search, reply ───
  // useConversationComposer owns text input, reply context, attachment picker,
  // pending attachment, voice recording toggle, reaction picker, search state,
  // and cross-device composer state hydration/persistence.
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const {
    input,
    setInput,
    replyTo,
    setReplyTo,
    attachmentPickerVisible,
    setAttachmentPickerVisible,
    isVoiceRecording,
    setIsVoiceRecording,
    pendingAttachment,
    setPendingAttachment,
    reactingToMessage,
    setReactingToMessage,
    searchQuery,
    setSearchQuery,
    searchMatchIndex,
    setSearchMatchIndex,
    isSearchActive,
    setIsSearchActive,
    handleAttachmentSelect,
  } = useConversationComposer({
    conversationId,
    initialSearchQuery: route.params?.focusQuery,
    messagesRef,
    show,
    haptic,
    setConversationDraft,
  });

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

  // Adapter: bind composer state to hookSendMessage's (input, replyTo, setInput, setReplyTo) signature
  const handleSend = useCallback(() => {
    hookSendMessage(input, replyTo, setInput, setReplyTo);
  }, [hookSendMessage, input, replyTo, setInput, setReplyTo]);

  // Adapter: wrap hookHandleMessageListScroll for FlashList's NativeSyntheticEvent type
  const handleMessageListScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      hookHandleMessageListScroll(e);
    },
    [hookHandleMessageListScroll],
  );

  useEffect(() => {
    setIsTyping(false);
  }, [conversationId]);

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

  // Per spec 16: "Do not stack quick replies + agent suggestions." When agent
  // suggestions are active (agent deployed, suggestions available, no input),
  // suppress quick replies so only one suggestion area is visible.
  const agentSuggestionsActive =
    deployedChatAgents.length > 0 &&
    chatAgentSuggestions.length > 0 &&
    input.trim().length === 0;

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

  // Adapter: bind selection state to hookBulkDelete's (selectedMessageIds, exitSelectionMode) signature
  const handleBulkDelete = useCallback(() => {
    hookBulkDelete(selectedMessageIds, exitSelectionMode);
  }, [hookBulkDelete, selectedMessageIds]);

  // Adapter: bind pending attachment state to hookSendPendingAttachment's (caption, pendingAttachment, setPendingAttachment) signature
  const handleSendPendingAttachment = useCallback(
    (caption: string) => {
      hookSendPendingAttachment(caption, pendingAttachment, setPendingAttachment);
    },
    [hookSendPendingAttachment, pendingAttachment, setPendingAttachment],
  );

  const mediaTypeLabel = (t: "image" | "video") =>
    t === "video" ? "Video" : "Photo";

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

    // Spacing tiers — 8pt within clusters, 12pt between clusters (AGENTS.md §4)
    let spacingTop: number = Space.smMd;
    if (!prevMsg) spacingTop = Space.md;
    else if (prevMsg.sender === msg.sender) spacingTop = Space.sm;
    else spacingTop = Space.smMd;

    // Cluster rhythm: tight bottom inside cluster, normal at cluster end
    let marginBottom: number = Space.sm;
    if (isLastInCluster) marginBottom = Space.smMd;

    const showDateSeparator = dateSeparatorIndices.has(index);
    const dateLabel = msg.date ? formatDateSeparator(msg.date) : null;

    const dateSeparator =
      showDateSeparator && dateLabel ? (
        <View style={styles.dateWrap}>
          <Text style={styles.dateText}>{dateLabel}</Text>
        </View>
      ) : null;

    // Unread divider — "New messages" separator between read and unread
    const showUnreadDivider = unreadDividerIndex === index && unreadDividerIndex > 0;
    const unreadDivider = showUnreadDivider ? (
      <View style={styles.unreadDividerWrap}>
        <View style={styles.unreadDividerLine} />
        <View style={styles.unreadDividerBadge}>
          <Text style={styles.unreadDividerText}>New messages</Text>
        </View>
        <View style={styles.unreadDividerLine} />
      </View>
    ) : null;

    const separator = unreadDivider ?? dateSeparator;

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
            isDraft={msg.isAgent && msg.status === "draft"}
            onConfirmDraft={
              msg.isAgent && msg.status === "draft"
                ? () => confirmAgentDraft(msg.id)
                : undefined
            }
            onRetryDraft={
              msg.isAgent && msg.status === "failed"
                ? () => retryAgentDraft(msg.id)
                : undefined
            }
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
                : msg.isAgent && (msg.status === "sending" || msg.status === "failed")
                  ? msg.status
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
                : msg.status === "failed" && !msg.isAgent
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

  // FlashList v2 performance: memoized renderItem prevents full re-render of
  // all visible messages on every parent state change (e.g. input text, agent
  // panel toggle). renderMessage closes over many component-scope values, so
  // we use a ref to always call the latest version while keeping a stable
  // callback reference for FlashList's cell recycling.
  // (Audit §FlashList v2 / LIST_RENDERING_POLICY.md §3.1)
  const renderMessageRef = useRef(renderMessage);
  renderMessageRef.current = renderMessage;
  const renderMessageItem = useCallback(
    ({ item, index }: { item: Message; index: number }) =>
      renderMessageRef.current(item, index),
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
              openProfile(navigation, resolvedPartnerId, currentUser?.id);
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
            renderItem={renderMessageItem}
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
              <Text style={styles.typingText}>typing…</Text>
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
              not started typing. When agent suggestions are active, quick
              replies are suppressed so only one suggestion area shows. */}
          {agentSuggestionsActive && (
            <SuggestedRepliesBar
              suggestions={chatAgentSuggestions}
              onSelect={handleSelectChatAgentSuggestion}
              agentName={deployedChatAgents[0]?.name}
              agentAvatar={deployedChatAgents[0]?.avatar}
            />
          )}

          {/* Deployed agent indicator — a single quiet chip that consolidates
              all deployed agents. Per spec 16: "a single quiet '2 agents'
              indicator is enough." Tap to open the agent picker to manage. */}
          {deployedChatAgents.length > 0 && (
            <View style={styles.agentRow}>
              <Pressable
                onPress={() => setChatAgentPickerVisible(true)}
                style={({ pressed }) => [
                  styles.agentChip,
                  pressed && styles.agentChipPressed,
                ]}
                accessibilityLabel={
                  deployedChatAgents.length === 1
                    ? `${deployedChatAgents[0].name} is active. Tap to manage agents.`
                    : `${deployedChatAgents.length} agents are active. Tap to manage agents.`
                }
                accessibilityRole="button"
                accessibilityHint="Open agent management"
              >
                <Ionicons
                  name={(deployedChatAgents[0]?.avatar as keyof typeof Ionicons.glyphMap) || 'cube-outline'}
                  size={13}
                  color={colors.brand}
                />
                <Text style={[styles.agentChipText, { color: colors.brand }]}>
                  {deployedChatAgents.length === 1
                    ? `${deployedChatAgents[0].name} active`
                    : `${deployedChatAgents.length} agents active`}
                </Text>
              </Pressable>
            </View>
          )}

          <ChatComposerBar
            value={input}
            onChangeText={setInput}
            onSend={handleSend}
            onAttachmentPress={() => setAttachmentPickerVisible(true)}
            onCameraPress={() => handleAttachmentSelect("camera")}
            placeholder="Message..."
            isSending={composerSending}
            quickReplies={
              // Chat stays quiet by default — quick replies only appear when
              // the conversation is empty to help start it, then recede once
              // there are messages. Agent suggestions take precedence.
              agentSuggestionsActive || messages.length > 0
                ? undefined
                : agentQuickReplies.length > 0
                ? agentQuickReplies
                : linkedListing
                ? linkedListing.sellerId === currentUser?.id
                  ? [
                      ...(sellerQuickReplies.length > 0
                        ? sellerQuickReplies.slice(0, 4).map((reply) => ({
                            label: reply.title,
                            onPress: () => setInput(reply.message),
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
                        ? buyerQuickReplies.slice(0, 4).map((reply) => ({
                            label: reply.title,
                            onPress: () => setInput(reply.message),
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
            } else if (action === "agent") {
              setChatAgentPickerVisible(true);
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
              case "askAgent": {
                // Spec 16: long press message → Ask agent about this.
                // Pre-fill the composer with the message text so the user can
                // direct an agent to analyse it. If no agent is deployed yet,
                // open the agent picker so they can deploy one first.
                if (deployedChatAgents.length === 0) {
                  setChatAgentPickerVisible(true);
                } else {
                  const msgText = selectedMessage.text ?? "";
                  const agentName = deployedChatAgents[0]?.name ?? "";
                  setInput(`@${agentName} ${msgText}`.trim());
                }
                break;
              }
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
