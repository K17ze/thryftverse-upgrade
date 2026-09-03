/**
 * useChatScreenActions — screen-level action orchestration for ChatScreen.
 *
 * Owns:
 * - Send adapter (binds composer input/replyTo to the messages hook's send)
 * - Scroll adapter (wraps the messages hook's scroll handler for FlashList)
 * - Message long press (context menu vs selection toggle)
 * - Bulk delete adapter (binds selected IDs to the messages hook's bulk delete)
 * - Pending attachment send adapter
 * - Context menu action handler (copy, reply, edit, react, delete, retry, report, askAgent)
 * - Quick replies computation (seller/buyer/agent quick replies for the composer)
 * - Reaction handler (addMessageReaction + close reaction picker)
 * - Media type label helper
 *
 * This hook is called after all controller hooks (useConversationMessages,
 * useConversationComposer, useConversationAgents, useConversationSafety,
 * useMessageSelection, useConversationCommerce) so it can bind their
 * outputs into screen-level action handlers.
 */

import { useCallback, useMemo } from "react";

import type { NativeSyntheticEvent, NativeScrollEvent } from "react-native";

import * as Clipboard from "expo-clipboard";

import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/types";

import { reportConversationOnApi } from "../../services/chatApi";
import type { ChatAgent } from "../../services/chatAgentsApi";
import type { Listing } from "../../services/listingsApi";

import type { Message } from "./types";
import {
  DEFAULT_SELLER_QUICK_REPLIES,
  DEFAULT_BUYER_QUICK_REPLIES,
} from "./types";

type ChatNav = NativeStackNavigationProp<RootStackParamList, "Chat">;

export interface UseChatScreenActionsOptions {
  // ── Conversation context ──
  conversationId: string | undefined;
  navigation: ChatNav;

  // ── Current user ──
  currentUser: { id?: string; username?: string } | null;

  // ── Linked listing ──
  linkedListing: Listing | null;

  // ── Shared services ──
  show: (msg: string, type: "success" | "error" | "info") => void;
  haptic: {
    light: () => void;
    medium: () => void;
    success: () => void;
    selection: () => void;
  };

  // ── Store actions ──
  addMessageReaction: (
    conversationId: string,
    messageId: string,
    emoji: string,
  ) => void;

  // ── Composer outputs ──
  input: string;
  setInput: (v: string) => void;
  replyTo: Message | null;
  setReplyTo: (msg: Message | null) => void;
  notifyStoppedTyping: () => void;
  pendingAttachment: { uri: string; mediaType: "image" | "video" } | null;
  setPendingAttachment: (
    attachment: { uri: string; mediaType: "image" | "video" } | null,
  ) => void;
  reactingToMessage: Message | null;
  setReactingToMessage: (msg: Message | null) => void;

  // ── Agents outputs ──
  deployedChatAgents: ChatAgent[];
  setChatAgentPickerVisible: (visible: boolean) => void;

  // ── Messages hook outputs ──
  sendMessage: (
    text: string,
    replyTo: Message | null,
    setInput: (v: string) => void,
    setReplyTo: (msg: Message | null) => void,
  ) => void;
  handleSendPendingAttachment: (
    caption: string,
    pendingAttachment: { uri: string; mediaType: "image" | "video" } | null,
    setPendingAttachment: (
      attachment: { uri: string; mediaType: "image" | "video" } | null,
    ) => void,
  ) => void;
  handleMessageListScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  handleRetryUpload: (msgId: string) => void;
  handleRetrySendMessage: (msgId: string) => void;
  handleDeleteMessage: (msg: Message) => void;
  startEdit: (msg: Message) => void;
  handleBulkDelete: (
    selectedMessageIds: Set<string>,
    exitSelectionMode: () => void,
  ) => void;

  // ── Selection outputs ──
  selectionMode: boolean;
  selectedMessageIds: Set<string>;
  toggleMessageSelection: (msgId: string) => void;
  setSelectedMessage: (msg: Message | null) => void;
  setContextMenuVisible: (visible: boolean) => void;
  exitSelectionMode: () => void;

  // ── Quick replies (store) ──
  sellerQuickReplies: { id: string; title: string; message: string }[];
  buyerQuickReplies: { id: string; title: string; message: string }[];

  // ── Agent quick replies ──
  agentQuickReplies: { label: string; onPress: () => void }[];

  // ── Agent suggestions active flag ──
  agentSuggestionsActive: boolean;

  // ── Messages (for quick replies visibility check) ──
  messages: Message[];
}

export interface UseChatScreenActionsResult {
  handleSend: () => void;
  handleMessageListScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  handleMessageLongPress: (msg: Message) => void;
  handleBulkDelete: () => void;
  handleSendPendingAttachment: (caption: string) => void;
  handleContextMenuAction: (action: string, selectedMessage: Message | null) => void;
  handleReaction: (emoji: string) => void;
  mediaTypeLabel: (t: "image" | "video") => string;
  quickReplies: { label: string; onPress: () => void }[] | undefined;
}

export function useChatScreenActions({
  conversationId,
  navigation,
  currentUser,
  linkedListing,
  show,
  haptic,
  addMessageReaction,
  input,
  setInput,
  replyTo,
  setReplyTo,
  notifyStoppedTyping,
  pendingAttachment,
  setPendingAttachment,
  reactingToMessage,
  setReactingToMessage,
  deployedChatAgents,
  setChatAgentPickerVisible,
  sendMessage: hookSendMessage,
  handleSendPendingAttachment: hookSendPendingAttachment,
  handleMessageListScroll: hookHandleMessageListScroll,
  handleRetryUpload,
  handleRetrySendMessage,
  handleDeleteMessage,
  startEdit,
  handleBulkDelete: hookBulkDelete,
  selectionMode,
  selectedMessageIds,
  toggleMessageSelection,
  setSelectedMessage,
  setContextMenuVisible,
  exitSelectionMode,
  sellerQuickReplies,
  buyerQuickReplies,
  agentQuickReplies,
  agentSuggestionsActive,
  messages,
}: UseChatScreenActionsOptions): UseChatScreenActionsResult {
  // ── Send adapter ──
  const handleSend = useCallback(() => {
    notifyStoppedTyping();
    hookSendMessage(input, replyTo, setInput, setReplyTo);
  }, [hookSendMessage, input, replyTo, setInput, setReplyTo, notifyStoppedTyping]);

  // ── Scroll adapter ──
  const handleMessageListScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      hookHandleMessageListScroll(e);
    },
    [hookHandleMessageListScroll],
  );

  // ── Message long press ──
  const handleMessageLongPress = useCallback(
    (msg: Message) => {
      if (selectionMode) {
        toggleMessageSelection(msg.id);
        return;
      }
      setSelectedMessage(msg);
      setContextMenuVisible(true);
      haptic.medium();
    },
    [selectionMode, toggleMessageSelection, setSelectedMessage, setContextMenuVisible, haptic],
  );

  // ── Bulk delete adapter ──
  const handleBulkDelete = useCallback(() => {
    hookBulkDelete(selectedMessageIds, exitSelectionMode);
  }, [hookBulkDelete, selectedMessageIds, exitSelectionMode]);

  // ── Pending attachment send adapter ──
  const handleSendPendingAttachment = useCallback(
    (caption: string) => {
      hookSendPendingAttachment(caption, pendingAttachment, setPendingAttachment);
    },
    [hookSendPendingAttachment, pendingAttachment, setPendingAttachment],
  );

  // ── Media type label ──
  const mediaTypeLabel = useCallback(
    (t: "image" | "video") => (t === "video" ? "Video" : "Photo"),
    [],
  );

  // ── Reaction handler ──
  const handleReaction = useCallback(
    (emoji: string) => {
      if (reactingToMessage && conversationId) {
        addMessageReaction(conversationId, reactingToMessage.id, emoji);
      }
      setReactingToMessage(null);
    },
    [reactingToMessage, conversationId, addMessageReaction, setReactingToMessage],
  );

  // ── Context menu action handler ──
  const handleContextMenuAction = useCallback(
    (action: string, selectedMessage: Message | null) => {
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
        case "edit":
          startEdit(selectedMessage);
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
          reportConversationOnApi(conversationId ?? "", "other", undefined, reportMessageId, reportKey)
            .then(() => {
              show("Report submitted. Thank you.", "success");
            })
            .catch(() => {
              show("Failed to submit report. Please try again.", "error");
            });
          break;
        }
        case "askAgent": {
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
    },
    [
      conversationId,
      deployedChatAgents,
      show,
      setReplyTo,
      startEdit,
      setReactingToMessage,
      handleDeleteMessage,
      handleRetryUpload,
      handleRetrySendMessage,
      setChatAgentPickerVisible,
      setInput,
    ],
  );

  // ── Quick replies computation ──
  const quickReplies = useMemo(() => {
    // Chat stays quiet by default — quick replies only appear when
    // the conversation is empty to help start it, then recede once
    // there are messages. Agent suggestions take precedence.
    if (agentSuggestionsActive || messages.length > 0) {
      return undefined;
    }
    if (agentQuickReplies.length > 0) {
      return agentQuickReplies;
    }
    if (!linkedListing) {
      return undefined;
    }
    if (linkedListing.sellerId === currentUser?.id) {
      return [
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
            navigation.navigate("ManageQuickReplies", { role: "seller" }),
        },
      ];
    }
    return [
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
          navigation.navigate("ManageQuickReplies", { role: "buyer" }),
      },
    ];
  }, [
    agentSuggestionsActive,
    messages.length,
    agentQuickReplies,
    linkedListing,
    currentUser?.id,
    sellerQuickReplies,
    buyerQuickReplies,
    setInput,
    navigation,
  ]);

  return {
    handleSend,
    handleMessageListScroll,
    handleMessageLongPress,
    handleBulkDelete,
    handleSendPendingAttachment,
    handleContextMenuAction,
    handleReaction,
    mediaTypeLabel,
    quickReplies,
  };
}
