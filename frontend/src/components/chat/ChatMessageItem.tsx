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
  /** Buyer exit on a seller-authored offer (decline is seller-only). */
  onCancelOffer: (msgId: string) => void;
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
  onCancelOffer,
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

    tombstone: {
      flexDirection: "row",
      alignItems: "center",
      gap: Space.xs,
      maxWidth: "78%",
      paddingHorizontal: Space.smMd,
      paddingVertical: Space.sm - 1,
      borderRadius: Radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: colors.surfaceAlt },

    tombstoneMe: {
      alignSelf: "flex-end" },

    tombstoneThem: {
      alignSelf: "flex-start" },

    tombstoneText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textMuted,
      fontStyle: "italic" } }), [colors]);

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

  // Unread divider — "New messages" banner above the first unread
  // incoming message. The index is resolved upstream from a snapshotted
  // message id (useUnreadDividerAnchor), so cursor-pagination prepends
  // keep it anchored to the same message. Index 0 is a valid anchor: a
  // fully-unread conversation still shows the banner at the top.
  const showUnreadDivider = unreadDividerIndex === index && index >= 0;
  const unreadDivider = showUnreadDivider ? <UnreadMessagesDivider /> : null;

  // Both separators may land on the same index (a day boundary that is
  // also the read boundary) — the date pill labels the section, the
  // unread banner hugs the first unread message.
  const separatorBlock =
    dateSeparator || unreadDivider ? (
      <>
        {dateSeparator}
        {unreadDivider}
      </>
    ) : null;

  const isMe = msg.sender === "me";

  // Deleted-for-everyone messages keep a legible tombstone — the row must
  // not silently vanish, and special-type branches (commerce cards, media)
  // must not keep rendering actions for deleted payloads. A save placed
  // before the delete can still be retracted: while the actor has a save
  // row on this tombstone, long-press opens a reduced menu (Unsave only).
  if (msg.isDeleted) {
    const canUnsaveTombstone = Boolean(
      currentUserId && msg.savedBy?.includes(currentUserId),
    );
    const tombstoneBody = (
      <View
        style={[
          styles.tombstone,
          isMe ? styles.tombstoneMe : styles.tombstoneThem,
          { marginTop: spacingTop, marginBottom },
        ]}
        accessibilityLabel={t('messaging.conversation.messageDeleted')}
      >
        <Ionicons name="close-circle-outline" size={14} color={colors.textMuted} />
        <Text style={styles.tombstoneText}>
          {isMe
            ? t('messaging.conversation.youDeletedMessage')
            : t('messaging.conversation.messageDeleted')}
        </Text>
      </View>
    );
    const tombstone = canUnsaveTombstone ? (
      <AnimatedPressable
        key={msg.id}
        onLongPress={() => handleLongPress(msg)}
        disableAnimation
        accessibilityLabel={t('messaging.conversation.messageDeleted')}
      >
        {tombstoneBody}
      </AnimatedPressable>
    ) : (
      <View key={msg.id}>{tombstoneBody}</View>
    );
    return separatorBlock ? (
      <View key={msg.id + "_group"}>
        {separatorBlock}
        {tombstone}
      </View>
    ) : (
      tombstone
    );
  }

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
        onCancelOffer={onCancelOffer}
        onCounterOffer={onCounterOffer}
        onOfferExpired={onOfferExpired}
      />
    );
    return separatorBlock ? (
      <View key={msg.id + "_group"}>
        {separatorBlock}
        {content}
      </View>
    ) : (
      content
    );
  }

  const isMedia = msg.type === "media" && msg.mediaUri;
  const isVoice = msg.type === "voice" && msg.voiceUri;
  const isPoll = Boolean(msg.poll);
  const isDocument = msg.type === "document" && Boolean(msg.documentUri ?? msg.mediaUri);
  if (!msg.text && !isMedia && !isVoice && !isPoll && !isDocument) return null;

  // A poll-only message has no bubble chrome — the poll card IS the
  // content. Rendering MessageBubble would draw an empty pill above it.
  const hasBubbleContent = Boolean(msg.text) || isMedia || isVoice || isDocument;

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
        {hasBubbleContent ? (
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
                  : msg.status === "reconciling"
                    ? "reconciling"
                    : msg.uploadStatus === "uploading"
                      ? "sending"
                      : msg.uploadStatus === "failed"
                        ? "failed"
                        : "sent"
              : msg.isAgent && (msg.status === "sending" || msg.status === "failed")
                ? msg.status
                : undefined
          }
          // While reconciling, a stale 'sent' readStatus must not override
          // the honest pending glyph — the server has not confirmed the row.
          readStatus={
            isMe && msg.status !== "reconciling" ? msg.readStatus : undefined
          }
          readBy={msg.readBy}
          isEdited={msg.isEdited === true}
          isSaved={msg.isSavedInChat === true}
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
                        // A deleted parent must not render an empty preview —
                        // show the tombstone label instead.
                        text: parent.isDeleted
                          ? t('messaging.conversation.messageDeleted')
                          : parent.text ?? "" }
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
          posterUri={msg.posterUri}
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
          documentUri={msg.documentUri}
          documentName={msg.documentName}
          documentMimeType={msg.documentMimeType}
        />
        ) : null}
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

  if (separatorBlock) {
    return (
      <View key={msg.id + "_group"}>
        {separatorBlock}
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

/**
 * "New messages" banner — the read/unread boundary marker rendered above
 * the first unread incoming message. Exported so GroupChatScreen (which
 * renders its own rows, not ChatMessageItem) shares the same grammar.
 */
export function UnreadMessagesDivider() {
  const { colors } = useAppTheme();
  return (
    <View
      style={dividerStyles.wrap}
      accessibilityLabel="New messages"
      accessibilityRole="text"
    >
      <View style={[dividerStyles.line, { backgroundColor: colors.brand }]} />
      <View style={[dividerStyles.badge, { backgroundColor: colors.brandSubtle }]}>
        <Text style={[dividerStyles.text, { color: colors.brand }]}>
          New messages
        </Text>
      </View>
      <View style={[dividerStyles.line, { backgroundColor: colors.brand }]} />
    </View>
  );
}

const dividerStyles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    marginVertical: Space.sm,
    paddingHorizontal: Space.md },
  line: {
    flex: 1,
    height: StyleSheet.hairlineWidth },
  badge: {
    paddingHorizontal: Space.sm + 2,
    paddingVertical: Space.xs,
    borderRadius: Radius.full },
  text: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: 0.3,
    textTransform: 'uppercase' } });
