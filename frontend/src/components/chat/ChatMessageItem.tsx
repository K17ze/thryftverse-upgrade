import React, { useMemo } from "react";

import {
  View,
  Text,
  StyleSheet } from "react-native";

import { Ionicons } from "@expo/vector-icons";

import { AnimatedPressable } from "../AnimatedPressable";

import { useAppTheme } from "../../theme/ThemeContext";
import { useHaptic } from "../../hooks/useHaptic";
import { Space, Radius, Control, Stroke } from "../../theme/designTokens";
import { TypographyV2 } from "../../theme/typography.v2";

import { t } from "../../i18n";

import {
  isFirstInCluster as isFirstInClusterHelper,
  isLastInCluster as isLastInClusterHelper } from "../../utils/messageGrouping";

import { MessageBubble } from "./MessageBubble";
import { LinkPreviewCard, extractFirstUrl } from "./LinkPreviewCard";
import { ScamWarningCard } from "./ScamWarningCard";
import { PollMessageBubble } from "./PollMessageBubble";
import { SwipeableMessage } from "../SwipeableMessage";
import {
  ChatCommerceCard,
  isChatCommerceCardMessage,
  type ChatFormatPrice } from "./ChatCommerceCard";

import {
  voteInPollOnApi,
  unvoteInPollOnApi } from "../../services/chatApi";

import {
  type Message,
  formatDateSeparator,
  formatMessageTime } from "../../hooks/chat";

import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/types";

export type ChatMessageItemNavigation = NativeStackNavigationProp<
  RootStackParamList,
  "Chat"
>;

export interface ChatMessageItemProps {
  message: Message;
  index: number;
  messages: Message[];
  dateSeparatorIndices: Set<number>;
  unreadDividerIndex: number;
  conversationId: string;
  isGroup: boolean;
  currentUserId?: string;
  selectionMode: boolean;
  selectedMessageIds: Set<string>;
  dismissedWarningIds: Set<string>;
  isSearchActive: boolean;
  searchQuery: string;
  formatFromFiat: ChatFormatPrice;
  navigation: ChatMessageItemNavigation;
  isNewMessage: (id: string) => boolean;
  onAcceptOffer: (msgId: string) => void;
  onDeclineOffer: (msgId: string) => void;
  onCounterOffer: (
    msgId: string,
    offerPrice?: number,
    originalPrice?: number,
  ) => void;
  onOfferExpired: (msgId: string) => void;
  /** Long-press outside selection mode — opens the message context menu. */
  onOpenContextMenu: (msg: Message) => void;
  onToggleMessageSelection: (msgId: string) => void;
  onReactionPress: (msg: Message) => void;
  onSwipeReply: (msg: Message) => void;
  /** Scroll to a message by id (reply-quote tap). */
  onReplyPress: (msgId: string) => void;
  onConfirmAgentDraft: (msgId: string) => void;
  onRetryAgentDraft: (msgId: string) => void;
  onRetryUpload: (msgId: string) => void;
  onRetrySendMessage: (msgId: string) => void;
  onDismissWarning: (msgId: string) => void;
}

export function ChatMessageItem({
  message: msg,
  index,
  messages,
  dateSeparatorIndices,
  unreadDividerIndex,
  conversationId,
  isGroup,
  currentUserId,
  selectionMode,
  selectedMessageIds,
  dismissedWarningIds,
  isSearchActive,
  searchQuery,
  formatFromFiat,
  navigation,
  isNewMessage,
  onAcceptOffer,
  onDeclineOffer,
  onCounterOffer,
  onOfferExpired,
  onOpenContextMenu,
  onToggleMessageSelection,
  onReactionPress,
  onSwipeReply,
  onReplyPress,
  onConfirmAgentDraft,
  onRetryAgentDraft,
  onRetryUpload,
  onRetrySendMessage,
  onDismissWarning }: ChatMessageItemProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();

  const handleLongPress = (m: Message) => {
    if (selectionMode) {
      onToggleMessageSelection(m.id);

      return;
    }

    onOpenContextMenu(m);

    haptic.medium();
  };

  const styles = useMemo(() => StyleSheet.create({
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
      textTransform: 'uppercase' } }), [colors]);

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

  if (isChatCommerceCardMessage(msg)) {
    const content = (
      <ChatCommerceCard
        key={msg.id}
        message={msg}
        spacingTop={spacingTop}
        marginBottom={marginBottom}
        isGroup={isGroup}
        formatFromFiat={formatFromFiat}
        navigation={navigation}
        onAcceptOffer={onAcceptOffer}
        onDeclineOffer={onDeclineOffer}
        onCounterOffer={onCounterOffer}
        onOfferExpired={onOfferExpired}
      />
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
          onPress={() => onToggleMessageSelection(msg.id)}
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
              ? () => onConfirmAgentDraft(msg.id)
              : undefined
          }
          onRetryDraft={
            msg.isAgent && msg.status === "failed"
              ? () => onRetryAgentDraft(msg.id)
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
          currentUserId={currentUserId}
          onLongPress={() => handleLongPress(msg)}
          onReactionPress={() => onReactionPress(msg)}
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
              ? () => onReplyPress(msg.replyToMessageId!)
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
              ? () => onRetryUpload(msg.id)
              : msg.status === "failed" && !msg.isAgent
                ? () => onRetrySendMessage(msg.id)
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
                onDismissWarning(msg.id);
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
          onReply={() => onSwipeReply(msg)}
          onActions={() => handleLongPress(msg)}
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
      onReply={() => onSwipeReply(msg)}
      onActions={() => handleLongPress(msg)}
    >
      {bubble}
    </SwipeableMessage>
  );
}
