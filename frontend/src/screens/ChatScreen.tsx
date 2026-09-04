import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AnimatedPressable } from "../components/AnimatedPressable";

import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
  type NativeSyntheticEvent,
  type NativeScrollEvent } from "react-native";

import { FlashList } from "@shopify/flash-list";

import { Ionicons } from "@expo/vector-icons";

import {
  useSafeAreaInsets,
  SafeAreaView } from "react-native-safe-area-context";

import { NativeStackScreenProps } from "@react-navigation/native-stack";

import { RootStackParamList } from "../navigation/types";
import { openProfile } from "../navigation/openProfile";

import { useAppTheme } from "../theme/ThemeContext";

import { useFormattedPrice } from "../hooks/useFormattedPrice";

import { useBackendData } from "../context/BackendDataContext";


import { useStore } from "../store/useStore";

import {
  clearComposerStateOnApi,
  reportConversationOnApi,
  sendConversationMessageOnApi } from "../services/chatApi";
import { fetchPublicProfile, PublicProfileUser } from "../services/profileApi";

import { useToast } from "../context/ToastContext";

import { useHaptic } from "../hooks/useHaptic";
import { useA11yAudit } from "../hooks/useA11yAudit";

import { KeyboardStickyView } from "../platform/keyboard/KeyboardProvider";

import { ChatComposerBar } from "../components/chat/ChatComposerBar";

import { ChatMessageRow } from "../components/chat/ChatMessageRow";

import { ChatTopBar } from "../components/chat/ChatTopBar";

import { ChatListingContextBar } from "../components/chat/ChatListingContextBar";
import { ChatTransactionStrip } from "../components/chat/ChatTransactionStrip";

import {
  ChatActionSheet } from "../components/chat/ChatActionSheet";

import { AttachmentReviewSheet } from "../components/chat/AttachmentReviewSheet";

import { MessageContextMenu } from "../components/chat/MessageContextMenu";
import { ForwardSheet } from "../components/chat/ForwardSheet";

import { ConfirmationSheet } from "../components/ConfirmationSheet";

import { EmojiReactionsBar } from "../components/chat/EmojiReactionsBar";

import { ReplyQuote } from "../components/chat/ReplyQuote";

import { ScrollToBottomFAB } from "../components/chat/ScrollToBottomFAB";

import { SkeletonChatLoader } from "../components/chat/SkeletonChatLoader";

import { RetryState } from "../components/RetryState";
import { EmptyState } from "../components/EmptyState";

import { ChatAgentPicker } from "../components/chat/ChatAgentPicker";
import { SuggestedRepliesBar } from "../components/chat/SuggestedRepliesBar";
import { OfflineBanner } from "../components/OfflineBanner";
import {
  getAgentSuggestions as getChatAgentSuggestions,
  getAgentResponse as getChatAgentResponse } from "../services/chatAgentsApi";

import * as Clipboard from "expo-clipboard";

import { Caption } from "../components/ui/Text";

import { detectChatSafetyWarning } from "../utils/chatSafetyWarnings";
import {
  resolveComposerStack,
  isSlotVisible,
  type ComposerStackSlotState } from "../utils/chatComposerStack";

import {
  resolveContextualStack,
  type ContextualStackSlot,
  type ContextualSlotState,
  MESSAGE_LIST_MIN_HEIGHT_RATIO } from "../utils/chatContextualStack";

import {
  isFirstInCluster as isFirstInClusterHelper,
  isLastInCluster as isLastInClusterHelper } from "../utils/messageGrouping";

import {
  isTrustedSystemMessage,
  resolveSystemMessageProvenance } from "../utils/systemMessageProvenance";

import { MarketplaceChatCard } from "../components/chat/MarketplaceChatCard";
import { MessageBubble } from "../components/chat/MessageBubble";
import { LinkPreviewCard, extractFirstUrl } from "../components/chat/LinkPreviewCard";
import { ScamWarningCard } from "../components/chat/ScamWarningCard";
import { PinnedMessageBar } from "../components/chat/PinnedMessageBar";
import { SwipeableMessage } from "../components/SwipeableMessage";
import { PollMessageBubble } from "../components/chat/PollMessageBubble";
import {
  fetchPinnedMessageFromApi,
  pinMessageOnApi,
  unpinMessageOnApi,
  voteInPollOnApi,
  unvoteInPollOnApi } from "../services/chatApi";

import { t } from "../i18n";

import { Space, Radius, Control, Stroke } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';

import { useVisuallyComplete } from "../performance/visuallyComplete";

import {
  useConversationMessages,
  useConversationComposer,
  useConversationCommerce,
  useConversationAgents,
  useConversationSafety,
  useMessageSelection,
  type Message,
  DEFAULT_SELLER_QUICK_REPLIES,
  DEFAULT_BUYER_QUICK_REPLIES,
  formatDateSeparator,
  formatMessageTime } from "../hooks/chat";
import { useTypingIndicator, useChatGroupIdentityEvent } from "../services/realtimeClient";
type Props = NativeStackScreenProps<RootStackParamList, "Chat">;

export default function ChatScreen({ navigation, route }: Props) {
  const a11yRef = useRef<any>(null);
  useA11yAudit(a11yRef, 'ChatScreen');
  const { colors, isDark } = useAppTheme();
  useVisuallyComplete('Chat');

  const styles = useMemo(() => StyleSheet.create({
    screenRoot: {
      flex: 1,
      backgroundColor: colors.background },

    selectionToolbar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm - 1,
      backgroundColor: colors.surfaceAlt,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border },

    emptyStateWrap: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: Space.xl,
      paddingBottom: Space.xl },

    messageList: {
      paddingTop: Space.sm,
      paddingBottom: Space.md },

    dateWrap: {
      alignItems: "center",
      marginVertical: Space.md,
      paddingVertical: 0,
      paddingHorizontal: 0,
      alignSelf: "center" },

    dateText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textMuted,
      letterSpacing: 0.4,
      textTransform: 'uppercase' },

    statusWrap: {
      marginVertical: Space.xs,
      paddingHorizontal: Space.md,
      alignItems: "center" },

    msgRow: {
      flexDirection: "column",
      width: "100%",
      gap: Space.xs,
      paddingHorizontal: 0 },

    msgRowRight: {
      alignItems: "stretch" },

    linkPreviewWrap: {
      maxWidth: "78%",
      alignSelf: "flex-start",
      marginTop: Space.sm },

    linkPreviewWrapRight: {
      alignSelf: "flex-end" },

    selectionRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: Space.sm },

    selectionRowRight: {
      flexDirection: "row-reverse" },

    checkbox: {
      width: Control.icon,
      height: Control.icon,
      borderRadius: Radius.sm,
      borderWidth: Stroke.emphasis,
      borderColor: colors.border,
      backgroundColor: colors.surfaceAlt,
      alignItems: "center",
      justifyContent: "center",
      marginHorizontal: Space.sm },

    checkboxActive: {
      backgroundColor: colors.brand,
      borderColor: colors.brand },

    composerWrap: {
      paddingHorizontal: 0,
      paddingBottom: 0,
      paddingTop: 0,
      backgroundColor: colors.background,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border },

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
      paddingVertical: Space.sm - 1 },

    undoBannerText: {
      color: colors.textSecondary,
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily },

    undoBannerAction: {
      color: colors.brand,
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily },

    agentRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: Space.md,
      paddingVertical: Space.xs,
      gap: Space.xs + 1,
      flexWrap: 'wrap' },

    agentChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingHorizontal: Space.sm + 2,
      paddingVertical: Space.xs + 1,
      borderRadius: Radius.full,
      backgroundColor: colors.brandSubtle,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.brandBorder },

    agentChipPressed: {
      backgroundColor: colors.brandSubtle },

    agentChipText: {
      fontSize: TypographyV2.meta.size,
      color: colors.textPrimary,
      fontFamily: TypographyV2.meta.fontFamily },

    unreadDividerWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      marginVertical: Space.sm,
      paddingHorizontal: Space.md },

    unreadDividerLine: {
      flex: 1,
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.brand },

    unreadDividerBadge: {
      paddingHorizontal: Space.sm + 2,
      paddingVertical: Space.xs,
      borderRadius: Radius.full,
      backgroundColor: colors.brandSubtle },

    unreadDividerText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.brand,
      letterSpacing: 0.3,
      textTransform: 'uppercase' },

    // Conversation-level safety banner — rendered above the message list
    // as the highest-priority contextual element. Uses semantic tokens
    // only; level emphasis comes from the icon/text colour, not alpha.
    safetyBannerWrap: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Space.xs + 1,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm - 1,
      backgroundColor: colors.surfaceAlt,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderSubtle },

    safetyBannerText: {
      flex: 1,
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: TypographyV2.meta.fontFamily },

    blockBannerWrap: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Space.xs + 1,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm - 1,
      backgroundColor: colors.surfaceAlt,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderSubtle },

    blockBannerText: {
      flex: 1,
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: TypographyV2.meta.fontFamily },

    blockBannerAction: {
      fontFamily: TypographyV2.meta.fontFamily,
      fontWeight: '600' },

    // Suggested-replies wrapper — adds a dismiss control so the bar can
    // be dismissed for the current conversation session.
    suggestedRepliesWrap: {
      position: 'relative' },

    suggestedRepliesClose: {
      position: 'absolute',
      top: Space.xs - 1,
      right: Space.xs,
      width: Control.icon - 6,
      height: Control.icon - 6,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: Radius.full },

    // Message list container — flexes to fill remaining space but is
    // never squeezed below ~40% of screen height (audit requirement).
    messageListContainer: {
      flex: 1,
      minHeight: Math.floor(
        Dimensions.get('window').height * MESSAGE_LIST_MIN_HEIGHT_RATIO,
      ) } }), [colors]);

  const { conversationId, itemId: routeItemId, offerPayload: routeOfferPayload } = route.params;

  const currentUser = useStore((state) => state.currentUser);

  const conversations = useStore((state) => state.conversations);
  const blockedUsers = useStore((state) => state.blockedUsers);
  const toggleBlockedUser = useStore((state) => state.toggleBlockedUser);

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

  // ── Pinned message ──────────────────────────────────────────────────
  // Fetch the conversation's pinned message on mount and when realtime
  // pin/unpin events arrive. Only group chats support pinning.
  const [pinnedMessage, setPinnedMessage] = useState<{
    messageId: string;
    senderLabel: string;
    text: string;
  } | null>(null);

  const loadPinnedMessage = useCallback(async () => {
    if (!isGroup) return;
    try {
      const result = await fetchPinnedMessageFromApi(conversationId);
      if (result.pinned) {
        const msg = result.pinned.message as Record<string, unknown>;
        const body = typeof msg.body === 'string' ? msg.body : '';
        const senderId = msg.senderUserId as string | null;
        const senderLabel = senderId
          ? (conversations.find((c) => c.id === conversationId)?.participantIds?.includes(senderId)
            ? 'Participant'
            : 'Someone')
          : 'System';
        setPinnedMessage({
          messageId: result.pinned.messageId,
          senderLabel,
          text: body || '(media)',
        });
      } else {
        setPinnedMessage(null);
      }
    } catch {
      // Silently fail — pinned bar is non-critical.
    }
  }, [conversationId, isGroup, conversations]);

  useEffect(() => {
    void loadPinnedMessage();
  }, [loadPinnedMessage]);

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

      const sender: "me" | "other" = isCurrentUserSender ? "me" : "other";

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

          timestamp: entry.timestamp ?? entry.date ?? new Date().toISOString(),

          offer: {
            price: entry.offerPrice,

            originalPrice: entry.originalPrice,

            status: entry.offerStatus as "pending" | "declined" | "countered" | "accepted" | "expired" | "cancelled" | undefined },

          text: entry.text };
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

        timestamp: entry.timestamp ?? entry.date ?? new Date().toISOString(),

        text: entry.text ?? entry.systemTitle ?? "",

        isSystem: entry.isSystem,

        systemTitle: entry.systemTitle,

        date: entry.timestamp,

        reactions: entry.reactions?.map((r) => ({
          emoji: r.emoji,

          userIds: r.userIds,

          count: r.userIds.length,

          reactedByMe: r.userIds.includes(currentUser?.id ?? "me") })),

        mediaUri: entry.mediaUri,

        mediaType: entry.mediaType,

        uploadStatus: entry.uploadStatus };
    });
  }, [botLookup, conversation?.messages, currentUser?.id, userLookup]);

  // Early ref for composer hydration — updated after useConversationMessages
  // returns. useConversationComposer only reads this inside effects, so an
  // empty initial value is safe; by the time any effect runs the ref will
  // hold the latest messages.
  const messagesRef = useRef<Message[]>([]);

  // ─── Controller hook: composer state, attachments, search, reply ───
  // useConversationComposer owns text input, reply context, attachment picker,
  // pending attachment, voice recording toggle, reaction picker, search state,
  // and cross-device composer state hydration/persistence.
  const {
    input,
    setInput,
    setTypingInput,
    notifyStoppedTyping,
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
    handleAttachmentSelect } = useConversationComposer({
    conversationId,
    initialSearchQuery: route.params?.focusQuery,
    messagesRef,
    show,
    haptic,
    setConversationDraft });

  // ─── Controller hook: AI chat agents (demo-mode service) ───
  // useConversationAgents owns deployed agents, agent picker visibility,
  // agent suggested replies, deploy/remove/suggest handlers, and agent
  // quick replies from connected custom bots.
  const {
    chatAgentPickerVisible,
    setChatAgentPickerVisible,
    deployedChatAgents,
    chatAgentSuggestions,
    setChatAgentSuggestions,
    handleDeployChatAgent,
    handleRemoveChatAgent,
    handleSelectChatAgentSuggestion,
    agentQuickReplies } = useConversationAgents({
    conversationId,
    show,
    haptic,
    setInput });

  // ─── Controller hook: safety warnings ───
  // useConversationSafety owns composer-level safety detection, danger/
  // caution dismissal state, and per-message dismissed warning IDs.
  const {
    composerDangerWarning,
    composerCautionWarning,
    dismissedWarningIds,
    setDangerWarningDismissed,
    setCautionWarningDismissed,
    dismissMessageWarning } = useConversationSafety({ input });

  // Suggested replies are dismissible for the current conversation session.
  // Once dismissed they do not reappear until the conversation changes.
  const [suggestedRepliesDismissed, setSuggestedRepliesDismissed] = useState(false);

  const isTyping = useTypingIndicator(conversationId);

  // Real-time group identity updates — when an admin changes the group name,
  // avatar, cover, or description, merge it into the local store immediately
  // so the chat header and info screen stay current without a refetch.
  const upsertConversation = useStore((state) => state.upsertConversation);
  useChatGroupIdentityEvent(conversationId, (payload) => {
    upsertConversation({
      id: payload.conversationId,
      title: payload.title ?? undefined,
      description: payload.description ?? undefined,
      avatar: payload.avatar ?? undefined,
      coverPhoto: payload.coverPhoto ?? undefined,
    } as any);
  });

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
    sendMessage: hookSendMessage,
    sendMediaMessage,
    sendVoiceMessage,
    handleSendVoice,
    createVoiceMessage,
    handleRetryUpload,
    handleRetrySendMessage,
    createMediaMessage,
    handleSendPendingAttachment: hookSendPendingAttachment,
    handleUndoDelete,
    handleBulkDelete: hookBulkDelete,
    handleDeleteMessage,
    confirmation: conversationConfirmation,
    clearConfirmation: clearConversationConfirmation,
    dateSeparatorIndices,
    unreadDividerIndex,
    handleMessageListScroll: hookHandleMessageListScroll,
    syncMessagesFromApi } = useConversationMessages({
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
    replaceConversationMessages });

  // Update composer hydration ref with the latest messages (the ref was
  // created before useConversationComposer so the hook has a stable object;
  // effects inside the hook read .current after render, so this is safe).
  messagesRef.current = messages;

  // Track which message IDs have already been rendered so only genuinely
  // new messages (added after initial load) get the bubble enter animation.
  // On the first render where messages exist, all are marked as known so
  // historical messages never animate on mount (AGENTS.md §16). The ref is
  // updated after each render via the effect below.
  const knownMessageIdsRef = useRef<Set<string>>(new Set());
  const knownInitializedRef = useRef(false);
  if (!knownInitializedRef.current && messages.length > 0) {
    knownMessageIdsRef.current = new Set(messages.map((m) => m.id));
    knownInitializedRef.current = true;
  }
  useEffect(() => {
    if (messages.length > 0) {
      knownMessageIdsRef.current = new Set(messages.map((m) => m.id));
    }
  }, [messages]);
  const isNewMessage = useCallback(
    (id: string) => !knownMessageIdsRef.current.has(id),
    [],
  );

  // ─── Controller hook: commerce (offers, commerce events) ───
  // useConversationCommerce owns accept/decline/counter/expire offer
  // handlers with optimistic updates and API-failure revert.
  const {
    handleAcceptOffer,
    handleDeclineOffer,
    handleCounterOffer,
    handleOfferExpired } = useConversationCommerce({
    messages,
    setMessages,
    routeItemId,
    conversationItemId: conversation?.itemId,
    context: conversation?.context,
    onUpdateContext: (updatedContext) => {
      if (!conversation) return;
      upsertConversation({ ...conversation, context: updatedContext });
    },
    show,
    haptic,
    navigation });

  // ─── Controller hook: message selection ───
  // useMessageSelection owns selection mode, selected IDs, context menu
  // visibility, and enter/exit/toggle selection handlers.
  const {
    selectionMode,
    selectedMessageIds,
    contextMenuVisible,
    setContextMenuVisible,
    selectedMessage,
    setSelectedMessage,
    toggleMessageSelection,
    enterSelectionMode,
    exitSelectionMode } = useMessageSelection({ selectionMode: false });

  // ── Forward sheet state ──
  const [forwardSheetVisible, setForwardSheetVisible] = useState(false);
  const [forwardingMessage, setForwardingMessage] = useState<Message | null>(null);

  const forwardMessageToConversation = useCallback(
    async (targetConversationId: string, text: string, mediaUri?: string, mediaType?: string) => {
      try {
        const options: { type?: 'text' | 'image' | 'video'; mediaUri?: string } = {};
        if (mediaUri && mediaType) {
          options.type = mediaType === 'video' ? 'video' : 'image';
          options.mediaUri = mediaUri;
        }
        await sendConversationMessageOnApi(
          targetConversationId,
          text,
          undefined,
          undefined,
          options,
          currentUser?.id,
        );
      } catch (err) {
        show("Failed to forward message", "error");
      }
    },
    [currentUser?.id, show],
  );
  // Adapter: bind composer state to hookSendMessage's (input, replyTo, setInput, setReplyTo) signature
  const handleSend = useCallback(() => {
    notifyStoppedTyping();
    hookSendMessage(input, replyTo, setInput, setReplyTo);
  }, [hookSendMessage, input, replyTo, setInput, setReplyTo, notifyStoppedTyping]);

  // Adapter: wrap hookHandleMessageListScroll for FlashList's NativeSyntheticEvent type
  const handleMessageListScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      hookHandleMessageListScroll(e);
    },
    [hookHandleMessageListScroll],
  );

  useEffect(() => {
    // Reset new-message tracking so the new conversation's historical
    // messages do not trigger bubble enter animations.
    knownMessageIdsRef.current = new Set(messagesRef.current.map((m) => m.id));
    knownInitializedRef.current = messagesRef.current.length > 0;
  }, [conversationId]);

  // Reset per-session dismissals when the conversation changes.
  useEffect(() => {
    setSuggestedRepliesDismissed(false);
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

  // Per spec 16: "Do not stack quick replies + agent suggestions." When agent
  // suggestions are active (agent deployed, suggestions available, no input),
  // suppress quick replies so only one suggestion area is visible.
  const agentSuggestionsActive =
    deployedChatAgents.length > 0 &&
    chatAgentSuggestions.length > 0 &&
    input.trim().length === 0;

  const partnerSummary = resolvedPartnerId
    ? conversation?.participantProfiles?.find((participant) => participant.id === resolvedPartnerId)
    : undefined;

  const isPartnerBlocked = !isGroup && resolvedPartnerId
    ? blockedUsers.includes(resolvedPartnerId)
    : false;

  const handleUnblockPartner = useCallback(() => {
    if (!resolvedPartnerId) return;
    toggleBlockedUser(resolvedPartnerId);
  }, [resolvedPartnerId, toggleBlockedUser]);

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
          viewPosition: 0.5 });
      } catch {
        // FlashList may not have rendered the item yet
      }
    }
  }, [searchMatchIndex, searchMatches]);

  const handleMessageLongPress = (msg: Message) => {
    if (selectionMode) {
      toggleMessageSelection(msg.id);

      return;
    }

    setSelectedMessage(msg);

    setContextMenuVisible(true);

    haptic.medium();
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
      { sender: msg.sender ?? 'other', type: msg.type ?? 'text', date: msg.date },
      prevMsg
        ? { sender: prevMsg.sender ?? 'other', type: prevMsg.type ?? 'text', date: prevMsg.date }
        : undefined,
    );

    const clusterLast = isLastInClusterHelper(
      { sender: msg.sender ?? 'other', type: msg.type ?? 'text', date: msg.date },
      nextMsg
        ? { sender: nextMsg.sender ?? 'other', type: nextMsg.type ?? 'text', date: nextMsg.date }
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
              carrier: msg.commerceState.carrier }}
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
        timestamp: msg.date ?? "" })
    ) {
      const provenance = resolveSystemMessageProvenance({
        id: msg.id,
        senderId: msg.senderId ?? "",
        isSystem: msg.isSystem,
        type: msg.type === "system" ? "system" : undefined,
        systemTitle: msg.systemTitle,
        text: msg.text,
        timestamp: msg.date ?? "" });
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
            offer={msg.offer ? {
              price: msg.offer.price ?? msg.offer.offerPrice ?? msg.offer.amount ?? 0,
              originalPrice: msg.offer.originalPrice ?? msg.offer.price ?? msg.offer.offerPrice ?? 0,
              status: msg.offer.status,
              expiresAt: msg.offer.expiresAt,
              counterRound: msg.offer.counterRound,
            } : undefined}
            formattedPrice={formatFromFiat(msg.offer?.price ?? msg.offer?.offerPrice ?? msg.offer?.amount ?? 0, 'GBP', {
              displayMode: "fiat" })}
            formattedOriginalPrice={formatFromFiat(
              msg.offer?.originalPrice ?? msg.offer?.price ?? msg.offer?.offerPrice ?? 0, 'GBP',
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
            id={msg.id}
            conversationId={conversationId ?? ''}
            text={msg.text ?? ""}
            isMe={isMe}
            senderLabel={isGroup && !isMe ? msg.senderLabel : undefined}
            timestamp={isLastInCluster ? formatMessageTime(msg.date) : undefined}
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
            readBy={msg.readBy}
            isGroup={isGroup}
            currentUserId={currentUser?.id}
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
                      messageId: msg.id });
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
                          text: parent.text ?? "" }
                      : null;
                  })()
                : null
            }
            onReplyPress={
              msg.replyToMessageId
                ? () => scrollToMessage(msg.replyToMessageId!)
                : undefined
            }
            reactions={msg.reactions?.map(r => ({
              emoji: r.emoji,
              count: r.count ?? r.userIds.length,
              reactedByMe: r.reactedByMe ?? false,
            }))}
            mediaUri={msg.mediaUri}
            mediaType={msg.mediaType}
            uploadStatus={msg.uploadStatus}
            voiceDurationMs={msg.voiceDurationMs}
            voiceWaveform={msg.voiceWaveform}
            voiceContainer={msg.voiceContainer}
            voiceCodec={msg.voiceCodec}
            voiceModerationState={msg.voiceModerationState}
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
            isNew={isNewMessage(msg.id)}
            searchHighlight={isSearchActive ? searchQuery : undefined}
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
          {/* Server-authoritative scam warning — non-blocking inline card below the message */}
          {!isMedia && !isVoice && msg.scamWarning && (
            <View style={[isMe && styles.linkPreviewWrapRight]}>
              <ScamWarningCard
                dismissed={dismissedWarningIds.has(msg.id)}
                onDismiss={() => {
                  dismissMessageWarning(msg.id);
                }}
                isMe={isMe}
              />
            </View>
          )}
          {/* Poll message — renders the poll UI inside the bubble */}
          {msg.poll ? (
            <View style={[isMe && styles.linkPreviewWrapRight]}>
              <PollMessageBubble
                poll={msg.poll}
                isMe={isMe}
                onVote={(idx) => voteInPollOnApi(conversationId, msg.id, idx)}
                onUnvote={(idx) => unvoteInPollOnApi(conversationId, msg.id, idx)}
              />
            </View>
          ) : null}
        </View>
      </View>
    );

    if (showDateSeparator && dateLabel) {
      return (
        <View key={msg.id + "_group"}>
          {dateSeparator}
          <SwipeableMessage
            isMe={isMe}
            onReply={() => setReplyTo(msg)}
            onActions={() => handleMessageLongPress(msg)}
          >
            {bubble}
          </SwipeableMessage>
        </View>
      );
    }

    return (
      <SwipeableMessage
        key={msg.id}
        isMe={isMe}
        onReply={() => setReplyTo(msg)}
        onActions={() => handleMessageLongPress(msg)}
      >
        {bubble}
      </SwipeableMessage>
    );
  };

  const avatarUri = !isGroup
    ? conversation?.avatar ||
      (resolvedPartnerId
        ? profileMediaOverrides[resolvedPartnerId]?.avatar
        : undefined) ||
      partnerProfile?.avatar ||
      partnerSummary?.avatar ||
      null
    : conversation?.avatar ?? null;
  const topBarTitle = isGroup
    ? (conversation?.title ?? t('chat.groupChatLabel'))
    : sellerHandle;
  const topBarSubtitle = isTyping
    ? 'typing…'
    : isGroup
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

  // Conversation-level safety warning (triggered by conversation state,
  // e.g. off-platform payment requests in messages). This is distinct
  // from the real-time composer typing warnings, which stay in the
  // composer. The conversation-level warning is rendered above the
  // message list as the highest-priority contextual element.
  const conversationSafetyWarning = useMemo(() => {
    if (!conversation) return null;
    return detectChatSafetyWarning(
      conversation,
      currentUser?.id,
      conversation.messages,
    );
  }, [conversation, currentUser?.id]);

  // Screen height (stable for the session) used to budget the
  // contextual stack and guarantee the message list keeps ≥40% of the
  // screen height.
  const screenHeight = useMemo(() => Dimensions.get("window").height, []);

  // Memoized contextual-stack resolver. Determines which contextual
  // elements (safety warning, listing transaction strip, agent row,
  // suggested replies) may be visible simultaneously. When the combined
  // height would squeeze the message list below ~40% of the screen,
  // only the highest-priority elements are kept.
  const contextualStack = useMemo(() => {
    const TOP_BAR_EST = 52;
    const COMPOSER_BASE_EST = 72;
    // Reserve space for the composer-area banner stack (reply/undo/
    // offline/reaction), which has its own resolver.
    const COMPOSER_BANNER_EST = 120;
    const minMessageListHeight = Math.floor(
      screenHeight * MESSAGE_LIST_MIN_HEIGHT_RATIO,
    );
    const budget = Math.max(
      0,
      screenHeight -
        TOP_BAR_EST -
        COMPOSER_BASE_EST -
        COMPOSER_BANNER_EST -
        minMessageListHeight,
    );

    const slots: ContextualSlotState[] = [
      {
        slot: "safetyWarning",
        visible: !!conversationSafetyWarning,
        estimatedHeight: 52 },
      {
        slot: "listingTransaction",
        visible:
          !isGroup && !!linkedListing && !!linkedListing.isSold,
        estimatedHeight: 48 },
      {
        slot: "agentRow",
        visible: deployedChatAgents.length > 0,
        estimatedHeight: 36 },
      {
        slot: "suggestedReplies",
        visible:
          agentSuggestionsActive && !suggestedRepliesDismissed,
        estimatedHeight: 52 },
    ];

    return resolveContextualStack(slots, budget);
  }, [
    screenHeight,
    conversationSafetyWarning,
    isGroup,
    linkedListing,
    deployedChatAgents,
    agentSuggestionsActive,
    suggestedRepliesDismissed,
  ]);

  const isContextualSlotVisible = useCallback(
    (slot: ContextualStackSlot) => contextualStack.visible.has(slot),
    [contextualStack],
  );

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
    <SafeAreaView ref={a11yRef} testID="chat-screen" edges={["bottom"]} style={styles.screenRoot}>
      <View style={styles.screenRoot}>
        <ChatTopBar
          title={topBarTitle}
          subtitle={topBarSubtitle}
          avatarUrl={avatarUri}
          initials={topBarInitials}
          groupId={isGroup ? conversation?.id : undefined}
          variant={isGroup ? "group" : "dm"}
          isVerified={!isGroup && (partnerProfile?.identityVerified === true || partnerSummary?.identityVerified === true)}
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
                conversationId: conversation.id });
            } else if (resolvedPartnerId) {
              openProfile(navigation, resolvedPartnerId, currentUser?.id);
            } else {
              navigation.navigate("ConversationInfo", {
                conversationId: conversation.id });
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

        {/* Contextual stack — resolved by priority + height budget.
            Safety warning is the highest-priority contextual element and
            sits directly below the top bar. It is only shown when the
            conversation state triggers it (never as permanent chrome). */}
        {isContextualSlotVisible("safetyWarning") && conversationSafetyWarning ? (
          <View
            style={styles.safetyBannerWrap}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
          >
            <Ionicons
              name={
                conversationSafetyWarning.level === "danger"
                  ? "warning"
                  : conversationSafetyWarning.level === "caution"
                    ? "alert-circle-outline"
                    : "lock-closed-outline"
              }
              size={14}
              color={
                conversationSafetyWarning.level === "danger"
                  ? colors.danger
                  : conversationSafetyWarning.level === "caution"
                    ? colors.warning
                    : colors.textMuted
              }
            />
            <Text
              style={[
                styles.safetyBannerText,
                {
                  color:
                    conversationSafetyWarning.level === "danger"
                      ? colors.danger
                      : conversationSafetyWarning.level === "caution"
                        ? colors.warning
                        : colors.textSecondary },
              ]}
              numberOfLines={2}
            >
              {conversationSafetyWarning.message}
            </Text>
          </View>
        ) : null}

        {isPartnerBlocked ? (
          <View
            style={styles.blockBannerWrap}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
          >
            <Ionicons
              name="lock-closed-outline"
              size={14}
              color={colors.textMuted}
            />
            <Text
              style={[styles.blockBannerText, { color: colors.textSecondary }]}
              numberOfLines={2}
            >
              You blocked this user.{" "}
              <Text
                style={[styles.blockBannerAction, { color: colors.textPrimary }]}
                onPress={handleUnblockPartner}
              >
                Unblock to continue.
              </Text>
            </Text>
          </View>
        ) : null}

        {!isGroup && conversation?.context?.listing && (
          <ChatListingContextBar
            context={conversation.context}
            priceDisplay={formatFromFiat(
              conversation.context.listing.price,
              'GBP',
              { displayMode: "fiat" },
            )}
            onPress={() =>
              navigation.navigate("ItemDetail", {
                itemId: conversation.context!.listing!.id,
              })
            }
            onPressOrder={
              conversation.context?.order
                ? () =>
                    navigation.navigate("OrderDetail", {
                      orderId: conversation.context!.order!.id,
                    })
                : undefined
            }
          />
        )}

        {/* Transaction strip — shows order milestone + deadline + CTA.
            Only rendered when there is an active commerce state (sold
            listing with an order) and the contextual-stack budget
            admits it (priority 2, below the safety warning). */}
        {isContextualSlotVisible("listingTransaction") &&
          !isGroup &&
          linkedListing &&
          linkedListing.isSold && (
          <ChatTransactionStrip listingId={linkedListing.id} />
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

        {/* Pinned message bar — above the message list, below the top bar. */}
        {pinnedMessage ? (
          <PinnedMessageBar
            senderLabel={pinnedMessage.senderLabel}
            text={pinnedMessage.text}
            onPress={() => {
              const idx = messages.findIndex((m) => m.id === pinnedMessage.messageId);
              if (idx >= 0) listRef.current?.scrollToIndex({ index: idx, animated: true });
            }}
          />
        ) : null}

        {/* Message list — persistent. Flexes to fill remaining space but
            is never squeezed below ~40% of screen height (audit). */}
        <View style={styles.messageListContainer}>
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
              // FlashList v2 rendering tuning (LIST_RENDERING_POLICY.md §2.4).
              //
              // `inverted` is intentionally NOT applied here. The scroll
              // management is split between this screen and the
              // useConversationMessages hook (out of scope for this change):
              //   - renderMessage uses messages[index-1]/messages[index+1]
              //     for cluster detection, dateSeparatorIndices.has(index),
              //     and unreadDividerIndex === index — all keyed to the
              //     chronological array order.
              //   - The hook owns scrollToMessage / search scrollToIndex
              //     (indices into the chronological array), scrollToEnd /
              //     scrollToBottom, and handleMessageListScroll's "near
              //     bottom" detection (contentSize - offset - layout < 150),
              //     whose coordinate math flips under `inverted`.
              // Reversing the data array to satisfy `inverted` would desync
              // every one of those index/coordinate lookups. Per the task's
              // escape clause for complex scroll management, `inverted` is
              // skipped and only the tuning props are applied.
              //
              // FlashList v2 (2.0.2) does not expose the v1 props
              // `windowSize` / `maxToRenderPerBatch`. The v2-native
              // equivalents are used instead:
              //   - drawDistance (v2 default 250dp) controls how far beyond
              //     the viewport items are rendered — the v2 counterpart of
              //     `windowSize`. 1200dp gives a chat-tuned buffer (~1.5
              //     screens each side) that smooths fast scroll without
              //     over-allocating.
              //   - overrideProps.initialDrawBatchSize (v2 default 2) is the
              //     v2 counterpart of `maxToRenderPerBatch` and caps the
              //     first render batch.
              drawDistance={1200}
              overrideProps={{ initialDrawBatchSize: 6 }}
              // P0.6: Preserve scroll anchor when older messages are
              // prepended via cursor pagination. This keeps the user's
              // current viewing position stable instead of jumping to top.
              maintainVisibleContentPosition={{
                autoscrollToTopThreshold: 0 }}
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
        </View>

        <KeyboardStickyView offset={{ closed: Math.max(insets.bottom, Space.sm) + Space.sm, opened: Space.sm }}>
        <View
          style={[
            styles.composerWrap,
            { paddingBottom: Math.max(insets.bottom, Space.sm) + Space.sm },
          ]}
        >
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
                    reactions={reactingToMessage.reactions?.map(r => ({
                      emoji: r.emoji,
                      count: r.count ?? r.userIds.length,
                      reactedByMe: r.reactedByMe ?? false,
                    })) ?? []}
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
              not started typing. The contextual-stack resolver may suppress
              them (priority 4) when the height budget is tight. Dismissable
              for the current conversation session via the close control. */}
          {isContextualSlotVisible("suggestedReplies") &&
            agentSuggestionsActive && (
            <View style={styles.suggestedRepliesWrap}>
              <SuggestedRepliesBar
                suggestions={chatAgentSuggestions}
                onSelect={handleSelectChatAgentSuggestion}
                agentName={deployedChatAgents[0]?.name}
                agentAvatar={deployedChatAgents[0]?.avatar}
              />
              <Pressable
                onPress={() => {
                  haptic.light();
                  setSuggestedRepliesDismissed(true);
                }}
                style={styles.suggestedRepliesClose}
                hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
                accessibilityLabel="Dismiss suggested replies"
                accessibilityRole="button"
                accessibilityHint="Hides suggested replies for this conversation"
              >
                <Ionicons name="close" size={15} color={colors.textMuted} />
              </Pressable>
            </View>
          )}

          {/* Deployed agent indicator — a single quiet chip that consolidates
              all deployed agents. Per spec 16: "a single quiet '2 agents'
              indicator is enough." Tap to open the agent picker to manage.
              Only rendered when an agent is actually deployed (priority 3);
              the "ask AI" entry point lives in the composer's attachment
              rail, not as permanent chrome. */}
          {isContextualSlotVisible("agentRow") &&
            deployedChatAgents.length > 0 && (
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
                  name={(deployedChatAgents[0]?.avatar as keyof typeof Ionicons.glyphMap) || 'bag-handle-outline'}
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
            onChangeText={setTypingInput}
            onSend={handleSend}
            onAttachmentPress={() => setAttachmentPickerVisible(true)}
            onCameraPress={() => handleAttachmentSelect("camera")}
            onVoiceRecord={handleSendVoice}
            isVoiceRecording={isVoiceRecording}
            onVoiceRecordingChange={setIsVoiceRecording}
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
                            onPress: () => setInput(reply.message) }))
                        : DEFAULT_SELLER_QUICK_REPLIES.map((text) => ({
                            label: text,
                            onPress: () => setInput(text) }))),
                      {
                        label: "Manage replies",
                        onPress: () =>
                          navigation.navigate("ManageQuickReplies", {
                            role: "seller" }) },
                    ]
                  : [
                      ...(buyerQuickReplies.length > 0
                        ? buyerQuickReplies.slice(0, 4).map((reply) => ({
                            label: reply.title,
                            onPress: () => setInput(reply.message) }))
                        : DEFAULT_BUYER_QUICK_REPLIES.map((text) => ({
                            label: text,
                            onPress: () => setInput(text) }))),
                      {
                        label: "Manage replies",
                        onPress: () =>
                          navigation.navigate("ManageQuickReplies", {
                            role: "buyer" }) },
                    ]
                : undefined
            }
            dangerWarning={composerDangerWarning?.message}
            cautionWarning={composerCautionWarning?.message}
            onDismissDangerWarning={() => setDangerWarningDismissed(true)}
            onDismissCautionWarning={() => setCautionWarningDismissed(true)}
          />
        </View>
        </KeyboardStickyView>

        {/* Audit: no simultaneous spinner + toast + full overlay for one
            mutation. The composer's isSending spinner is the single
            feedback signal for an in-flight send; overlay sheets are
            suppressed while a send is in progress so the user never sees
            a spinner and a full overlay at once. */}
        <ChatActionSheet
          visible={attachmentPickerVisible && !composerSending}
          onClose={() => setAttachmentPickerVisible(false)}
          onSelect={(action) => {
            if (action === "gallery" || action === "camera") {
              handleAttachmentSelect(action);
            } else if (action === "agent") {
              setChatAgentPickerVisible(true);
            }
          }}
        />

        {pendingAttachment && !composerSending && (
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
          visible={chatAgentPickerVisible && !composerSending}
          onClose={() => setChatAgentPickerVisible(false)}
          onDeploy={handleDeployChatAgent}
          deployedAgentIds={deployedChatAgents.map((a) => a.id)}
          conversationId={conversationId}
        />

        <ScrollToBottomFAB
          visible={showScrollToBottom}
          unreadCount={unreadBelowCount}
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
              case "forward":
                setForwardingMessage(selectedMessage);
                setForwardSheetVisible(true);
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
              case "report": {
                const reportMessageId = selectedMessage.id;
                const reportKey = `rpt_${conversationId}_${reportMessageId}`;
                reportConversationOnApi(conversationId, 'other', undefined, reportMessageId, reportKey)
                  .then(() => {
                    show("Report submitted. Thank you.", "success");
                  })
                  .catch(() => {
                    show("Failed to submit report. Please try again.", "error");
                  });
                break;
              }
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
        />

        <ForwardSheet
          visible={forwardSheetVisible}
          conversations={conversations.filter((c) => c.id !== conversationId)}
          currentConversationId={conversationId}
          onForward={(targetConversationId) => {
            if (forwardingMessage) {
              const text = forwardingMessage.text ?? "";
              if (text) {
                forwardMessageToConversation(
                  targetConversationId,
                  text,
                  forwardingMessage.mediaUri,
                  forwardingMessage.mediaType,
                );
              }
            }
            setForwardSheetVisible(false);
            setForwardingMessage(null);
            show("Message forwarded", "success");
          }}
          onClose={() => {
            setForwardSheetVisible(false);
            setForwardingMessage(null);
          }}
        />

        <ConfirmationSheet
          visible={!!conversationConfirmation}
          onDismiss={clearConversationConfirmation}
          title={conversationConfirmation?.title ?? ""}
          message={conversationConfirmation?.message}
          confirmLabel={conversationConfirmation?.confirmLabel}
          cancelLabel={conversationConfirmation?.cancelLabel}
          onConfirm={() => {
            const req = conversationConfirmation;
            clearConversationConfirmation();
            if (req) void req.onConfirm();
          }}
          onCancel={
            conversationConfirmation?.onCancel
              ? () => {
                  const req = conversationConfirmation;
                  clearConversationConfirmation();
                  if (req?.onCancel) void req.onCancel();
                }
              : undefined
          }
          variant={conversationConfirmation?.variant ?? "danger"}
        />
      </View>
    </SafeAreaView>
  );
}
