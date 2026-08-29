import React, { useMemo } from "react";


import { TypographyV2 } from '../../theme/typography.v2';import {
  View,
  Text,
  StyleSheet } from "react-native";

import { Ionicons } from "@expo/vector-icons";

import { AnimatedPressable } from "../AnimatedPressable";

import { MarketplaceChatCard } from "./MarketplaceChatCard";
import { MessageBubble } from "./MessageBubble";
import {
  LinkPreviewCard,
  extractFirstUrl } from "./LinkPreviewCard";
import { PaymentWarningCard } from "./PaymentWarningCard";

import { useAppTheme } from "../../theme/ThemeContext";
import { Space, Radius, Control, Stroke } from "../../theme/designTokens";
import { t } from "../../i18n";
import { type SupportedCurrencyCode } from "../../constants/currencies";
import type { CurrencyDisplayMode } from "../../utils/currency";
import { useFormattedPrice } from "../../hooks/useFormattedPrice";

import {
  isFirstInCluster as isFirstInClusterHelper,
  isLastInCluster as isLastInClusterHelper } from "../../utils/messageGrouping";
import {
  isTrustedSystemMessage,
  resolveSystemMessageProvenance } from "../../utils/systemMessageProvenance";
import { containsOffPlatformPaymentPattern } from "../../utils/chatSafetyWarnings";

import {
  type Message,
  formatDateSeparator,
  formatMessageTime } from "../../hooks/chat";

export type FormatFromFiat = (
  fiatAmount: number,
  sourceCurrency?: SupportedCurrencyCode,
  options?: { displayMode?: CurrencyDisplayMode },
) => string;

export interface ChatMessageRowNavigation {
  navigate: (screen: string, params?: Record<string, unknown>) => void;
}

export interface ChatMessageRowProps {
  message: Message;
  index: number;
  messages: Message[];
  dateSeparatorIndices: Set<number>;
  unreadDividerIndex: number;
  conversationId: string | undefined;
  isGroup: boolean;
  selectionMode: boolean;
  selectedMessageIds: Set<string>;
  dismissedWarningIds: Set<string>;
  formatFromFiat: FormatFromFiat;
  navigation: ChatMessageRowNavigation;
  onAcceptOffer: (msgId: string) => void;
  onDeclineOffer: (msgId: string) => void;
  onCounterOffer: (
    msgId: string,
    offerPrice?: number,
    originalPrice?: number,
  ) => void;
  onOfferExpired: (msgId: string) => void;
  onMessageLongPress: (msg: Message) => void;
  onToggleMessageSelection: (msgId: string) => void;
  onSetReactingToMessage: (msg: Message | null) => void;
  onRetryUpload: (msgId: string) => void;
  onRetrySendMessage: (msgId: string) => void;
  onConfirmAgentDraft: (msgId: string) => void;
  onRetryAgentDraft: (msgId: string) => void;
  onScrollToMessage: (msgId: string) => void;
  onDismissWarning: (msgId: string) => void;
  isNewMessage: (id: string) => boolean;
}

export function ChatMessageRow({
  message: msg,
  index,
  messages,
  dateSeparatorIndices,
  unreadDividerIndex,
  conversationId,
  isGroup,
  selectionMode,
  selectedMessageIds,
  dismissedWarningIds,
  formatFromFiat,
  navigation,
  onAcceptOffer,
  onDeclineOffer,
  onCounterOffer,
  onOfferExpired,
  onMessageLongPress,
  onToggleMessageSelection,
  onSetReactingToMessage,
  onRetryUpload,
  onRetrySendMessage,
  onConfirmAgentDraft,
  onRetryAgentDraft,
  onScrollToMessage,
  onDismissWarning,
  isNewMessage }: ChatMessageRowProps) {
  const { colors } = useAppTheme();
  const { currencyCode } = useFormattedPrice();

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
          offer={msg.offer}
          formattedPrice={formatFromFiat(msg.offer!.price, currencyCode, {
            displayMode: "fiat" })}
          formattedOriginalPrice={formatFromFiat(
            msg.offer!.originalPrice, currencyCode,
            { displayMode: "fiat" },
          )}
          onAccept={() => onAcceptOffer(msg.id)}
          onDecline={() => onDeclineOffer(msg.id)}
          onCounter={() => onCounterOffer(msg.id, msg.offer?.price, msg.offer?.originalPrice)}
          onExpire={() => onOfferExpired(msg.id)}
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
          onLongPress={() => onMessageLongPress(msg)}
          onReactionPress={() => onSetReactingToMessage(msg)}
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
              ? () => onScrollToMessage(msg.replyToMessageId!)
              : undefined
          }
          reactions={msg.reactions}
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
                onDismissWarning(msg.id);
              }}
              onReport={() => {
                navigation.navigate("Report", {
                  type: "user",
                  targetId: msg.senderId });
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
}
