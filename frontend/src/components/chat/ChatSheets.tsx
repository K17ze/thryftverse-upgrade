import React, { useCallback, useState } from "react";

import * as Clipboard from "expo-clipboard";

import { useToast } from "../../context/ToastContext";

import {
  ChatActionSheet,
  type ChatAction } from "./ChatActionSheet";
import { AttachmentReviewSheet } from "./AttachmentReviewSheet";
import { ChatAgentPicker } from "./ChatAgentPicker";
import { MessageContextMenu } from "./MessageContextMenu";
import { ForwardSheet } from "./ForwardSheet";
import { ScrollToBottomFAB } from "./ScrollToBottomFAB";
import { ConfirmationSheet } from "../ConfirmationSheet";

import {
  reportConversationOnApi,
  sendConversationMessageOnApi } from "../../services/chatApi";

import { type Message } from "../../hooks/chat";
import type { ConversationConfirmationRequest } from "../../hooks/chat/useConversationMessages";
import type { Conversation } from "../../domain";
import type { ChatAgent } from "../../services/chatAgentsApi";

export interface ChatSheetsProps {
  /** While a send is in progress the composer's spinner is the single
      feedback signal — overlay sheets are suppressed. */
  composerSending: boolean;
  conversationId: string;
  currentUserId?: string;

  // ── Attachment picker ──
  attachmentPickerVisible: boolean;
  onCloseAttachmentPicker: () => void;
  onAttachmentSelect: (action: "gallery" | "camera") => void;
  /** Linked listing context — enables the "Make an offer" rail action. */
  hasLinkedListing?: boolean;
  isSeller?: boolean;
  onMakeOffer?: () => void;

  // ── Pending attachment review ──
  pendingAttachment: { uri: string; mediaType: "image" | "video" } | null;
  onClosePendingAttachment: () => void;
  onSendPendingAttachment: (caption: string) => void;

  // ── AI agent picker ──
  chatAgentPickerVisible: boolean;
  onCloseAgentPicker: () => void;
  onOpenAgentPicker: () => void;
  onDeployAgent: (agent: ChatAgent) => void;
  deployedAgents: ChatAgent[];

  // ── Scroll-to-bottom FAB ──
  showScrollToBottom: boolean;
  unreadBelowCount: number;
  onScrollToBottom: () => void;

  // ── Message context menu ──
  contextMenuVisible: boolean;
  onCloseContextMenu: () => void;
  selectedMessage: Message | null;
  onReplyMessage: (msg: Message) => void;
  onReactToMessage: (msg: Message) => void;
  onDeleteMessage: (msg: Message) => void;
  onRetryUpload: (msgId: string) => void;
  onRetrySendMessage: (msgId: string) => void;
  onPrefillComposer: (text: string) => void;

  // ── Forward sheet ──
  conversations: Conversation[];

  // ── Conversation confirmation ──
  confirmation: ConversationConfirmationRequest | null;
  onClearConfirmation: () => void;
}

export function ChatSheets({
  composerSending,
  conversationId,
  currentUserId,
  attachmentPickerVisible,
  onCloseAttachmentPicker,
  onAttachmentSelect,
  hasLinkedListing = false,
  isSeller = false,
  onMakeOffer,
  pendingAttachment,
  onClosePendingAttachment,
  onSendPendingAttachment,
  chatAgentPickerVisible,
  onCloseAgentPicker,
  onOpenAgentPicker,
  onDeployAgent,
  deployedAgents,
  showScrollToBottom,
  unreadBelowCount,
  onScrollToBottom,
  contextMenuVisible,
  onCloseContextMenu,
  selectedMessage,
  onReplyMessage,
  onReactToMessage,
  onDeleteMessage,
  onRetryUpload,
  onRetrySendMessage,
  onPrefillComposer,
  conversations,
  confirmation,
  onClearConfirmation }: ChatSheetsProps) {
  const { show } = useToast();

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
          currentUserId,
        );
      } catch (err) {
        show("Failed to forward message", "error");
      }
    },
    [currentUserId, show],
  );

  return (
    <>
      {/* Audit: no simultaneous spinner + toast + full overlay for one
          mutation. The composer's isSending spinner is the single
          feedback signal for an in-flight send; overlay sheets are
          suppressed while a send is in progress so the user never sees
          a spinner and a full overlay at once. */}
      <ChatActionSheet
        visible={attachmentPickerVisible && !composerSending}
        onClose={onCloseAttachmentPicker}
        // No document-send path exists anywhere yet (GroupChatScreen's
        // handler is a stub that discards the file) — hide the File row
        // rather than offer a picker that silently drops the document.
        // Listing-share has no send API either; "Make an offer" does.
        hideDocument
        hideShareListing
        hasLinkedListing={hasLinkedListing}
        isSeller={isSeller}
        onSelect={(action: ChatAction) => {
          if (action === "gallery" || action === "camera") {
            onAttachmentSelect(action);
          } else if (action === "agent") {
            onOpenAgentPicker();
          } else if (action === "offer") {
            onMakeOffer?.();
          }
        }}
      />

      {pendingAttachment && !composerSending && (
        <AttachmentReviewSheet
          visible={!!pendingAttachment}
          uri={pendingAttachment.uri}
          mediaType={pendingAttachment.mediaType}
          onClose={onClosePendingAttachment}
          onSend={onSendPendingAttachment}
        />
      )}

      {/* AI Chat Agent Picker — deploy AI assistants into the conversation.
          Demo mode per AGENTS.md §11 — agents use keyword-based suggestions,
          not real LLM inference. */}
      <ChatAgentPicker
        visible={chatAgentPickerVisible && !composerSending}
        onClose={onCloseAgentPicker}
        onDeploy={onDeployAgent}
        deployedAgentIds={deployedAgents.map((a) => a.id)}
        conversationId={conversationId}
      />

      <ScrollToBottomFAB
        visible={showScrollToBottom}
        unreadCount={unreadBelowCount}
        onPress={onScrollToBottom}
      />

      <MessageContextMenu
        visible={contextMenuVisible}
        onClose={onCloseContextMenu}
        onAction={(action) => {
          if (!selectedMessage) return;
          switch (action) {
            case "copy": {
              Clipboard.setStringAsync(selectedMessage.text ?? "");
              show("Copied", "success");
              break;
            }
            case "reply":
              onReplyMessage(selectedMessage);
              break;
            case "forward":
              setForwardingMessage(selectedMessage);
              setForwardSheetVisible(true);
              break;
            case "react":
              onReactToMessage(selectedMessage);
              break;
            case "delete":
              onDeleteMessage(selectedMessage);
              break;
            case "retry":
              if (selectedMessage.uploadStatus === "failed") {
                onRetryUpload(selectedMessage.id);
              } else {
                onRetrySendMessage(selectedMessage.id);
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
              if (deployedAgents.length === 0) {
                onOpenAgentPicker();
              } else {
                const msgText = selectedMessage.text ?? "";
                const agentName = deployedAgents[0]?.name ?? "";
                onPrefillComposer(`@${agentName} ${msgText}`.trim());
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
        visible={!!confirmation}
        onDismiss={onClearConfirmation}
        title={confirmation?.title ?? ""}
        message={confirmation?.message}
        confirmLabel={confirmation?.confirmLabel}
        cancelLabel={confirmation?.cancelLabel}
        onConfirm={() => {
          const req = confirmation;
          onClearConfirmation();
          if (req) void req.onConfirm();
        }}
        onCancel={
          confirmation?.onCancel
            ? () => {
                const req = confirmation;
                onClearConfirmation();
                if (req?.onCancel) void req.onCancel();
              }
            : undefined
        }
        variant={confirmation?.variant ?? "danger"}
      />
    </>
  );
}
