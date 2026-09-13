import React, { useMemo } from "react";

import { View, Text, StyleSheet, Pressable } from "react-native";

import { Ionicons } from "@expo/vector-icons";

import { AnimatedPressable } from "../AnimatedPressable";

import { useAppTheme } from "../../theme/ThemeContext";
import { Space, Radius, Control } from "../../theme/designTokens";
import { TypographyV2 } from "../../theme/typography.v2";

import { t } from "../../i18n";

import { KeyboardStickyView } from "../../platform/keyboard/KeyboardProvider";

import { ChatComposerBar } from "./ChatComposerBar";
import { ReplyQuote } from "./ReplyQuote";
import { EmojiReactionsBar } from "./EmojiReactionsBar";
import { SuggestedRepliesBar } from "./SuggestedRepliesBar";
import { OfflineBanner } from "../OfflineBanner";

import {
  resolveComposerStack,
  isSlotVisible,
  type ComposerStackSlotState } from "../../utils/chatComposerStack";

import {
  type Message,
  DEFAULT_SELLER_QUICK_REPLIES,
  DEFAULT_BUYER_QUICK_REPLIES } from "../../hooks/chat";
import type { QuickReply } from "../../store/useStore";
import type { ChatAgent, SuggestedReply } from "../../services/chatAgentsApi";

export interface ChatComposerProps {
  /** Safe-area bottom inset — pads the closed composer and its keyboard offset. */
  bottomInset: number;

  // ── Composer bar ──
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  onAttachmentPress: () => void;
  onCameraPress: () => void;
  onVoiceRecord: (draft: {
    uri: string;
    fileName: string;
    contentType: string;
    durationMs: number;
    sizeBytes: number;
  }) => void;
  isVoiceRecording: boolean;
  onVoiceRecordingChange: (recording: boolean) => void;
  isSending: boolean;
  dangerWarning?: string;
  cautionWarning?: string;
  onDismissDangerWarning: () => void;
  onDismissCautionWarning: () => void;

  // ── Quick replies ──
  /** True when agent suggestions are active or messages exist — quick replies recede. */
  quickRepliesSuppressed: boolean;
  agentQuickReplies: { label: string; onPress: () => void }[];
  /** Which role's quick replies to show — null when no listing is linked. */
  quickReplyRole: "seller" | "buyer" | null;
  sellerQuickReplies: QuickReply[];
  buyerQuickReplies: QuickReply[];
  onSelectReply: (text: string) => void;
  onManageReplies: (role: "seller" | "buyer") => void;

  // ── Composer banner stack (reply / reaction / offline / undo) ──
  replyTo: Message | null;
  onCloseReply: () => void;
  reactingToMessage: Message | null;
  onReact: (emoji: string) => void;
  isOffline: boolean;
  recentlyDeletedCount: number;
  onUndoDelete: () => void;

  // ── Agent suggested replies ──
  showSuggestedReplies: boolean;
  agentSuggestions: SuggestedReply[];
  onSelectSuggestion: (reply: SuggestedReply) => void;
  agentName?: string;
  agentAvatar?: string;
  onDismissSuggestedReplies: () => void;

  // ── Deployed agent indicator chip ──
  showAgentRow: boolean;
  deployedAgents: ChatAgent[];
  onOpenAgentPicker: () => void;
}

export function ChatComposer({
  bottomInset,
  value,
  onChangeText,
  onSend,
  onAttachmentPress,
  onCameraPress,
  onVoiceRecord,
  isVoiceRecording,
  onVoiceRecordingChange,
  isSending,
  dangerWarning,
  cautionWarning,
  onDismissDangerWarning,
  onDismissCautionWarning,
  quickRepliesSuppressed,
  agentQuickReplies,
  quickReplyRole,
  sellerQuickReplies,
  buyerQuickReplies,
  onSelectReply,
  onManageReplies,
  replyTo,
  onCloseReply,
  reactingToMessage,
  onReact,
  isOffline,
  recentlyDeletedCount,
  onUndoDelete,
  showSuggestedReplies,
  agentSuggestions,
  onSelectSuggestion,
  agentName,
  agentAvatar,
  onDismissSuggestedReplies,
  showAgentRow,
  deployedAgents,
  onOpenAgentPicker }: ChatComposerProps) {
  const { colors } = useAppTheme();

  const styles = useMemo(() => StyleSheet.create({
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
      borderRadius: Radius.full } }), [colors]);

  return (
    <KeyboardStickyView offset={{ closed: Math.max(bottomInset, Space.sm) + Space.sm, opened: Space.sm }}>
    <View
      style={[
        styles.composerWrap,
        { paddingBottom: Math.max(bottomInset, Space.sm) + Space.sm },
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
          { slot: 'undoBanner', visible: recentlyDeletedCount > 0, estimatedHeight: 44 },
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
                onClose={onCloseReply}
              />
            ) : null}

            {isSlotVisible(resolution, 'reactionPicker') && reactingToMessage ? (
              <EmojiReactionsBar
                reactions={reactingToMessage.reactions?.map(r => ({
                  emoji: r.emoji,
                  count: r.count ?? r.userIds.length,
                  reactedByMe: r.reactedByMe ?? false,
                })) ?? []}
                onReact={onReact}
              />
            ) : null}

            {isSlotVisible(resolution, 'offlineBanner') && isOffline && (
              <OfflineBanner message="You are offline. Messages will be sent when you reconnect." />
            )}

            {isSlotVisible(resolution, 'undoBanner') && recentlyDeletedCount > 0 && (
              <View style={styles.undoBanner}>
                <Text
                  style={styles.undoBannerText}
                  accessibilityLiveRegion="polite"
                 maxFontSizeMultiplier={2}>
                  {recentlyDeletedCount} message
                  {recentlyDeletedCount === 1 ? "" : "s"} deleted
                </Text>
                <AnimatedPressable
                  onPress={onUndoDelete}
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
      {showSuggestedReplies && (
        <View style={styles.suggestedRepliesWrap}>
          <SuggestedRepliesBar
            suggestions={agentSuggestions}
            onSelect={onSelectSuggestion}
            agentName={agentName}
            agentAvatar={agentAvatar}
          />
          <Pressable
            onPress={onDismissSuggestedReplies}
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
      {showAgentRow && (
        <View style={styles.agentRow}>
          <AnimatedPressable
            onPress={onOpenAgentPicker}
            style={styles.agentChip}
            accessibilityLabel={
              deployedAgents.length === 1
                ? `${deployedAgents[0].name} is active. Tap to manage agents.`
                : `${deployedAgents.length} agents are active. Tap to manage agents.`
            }
            accessibilityRole="button"
            accessibilityHint="Open agent management"
          >
            <Ionicons
              name={(deployedAgents[0]?.avatar as keyof typeof Ionicons.glyphMap) || 'bag-handle-outline'}
              size={13}
              color={colors.brand}
            />
            <Text style={[styles.agentChipText, { color: colors.brand }]} maxFontSizeMultiplier={2}>
              {deployedAgents.length === 1
                ? `${deployedAgents[0].name} active`
                : `${deployedAgents.length} agents active`}
            </Text>
          </AnimatedPressable>
        </View>
      )}

      <ChatComposerBar
        value={value}
        onChangeText={onChangeText}
        onSend={onSend}
        onAttachmentPress={onAttachmentPress}
        onCameraPress={onCameraPress}
        onVoiceRecord={onVoiceRecord}
        isVoiceRecording={isVoiceRecording}
        onVoiceRecordingChange={onVoiceRecordingChange}
        placeholder="Message..."
        isSending={isSending}
        quickReplies={
          // Chat stays quiet by default — quick replies only appear when
          // the conversation is empty to help start it, then recede once
          // there are messages. Agent suggestions take precedence.
          quickRepliesSuppressed
            ? undefined
            : agentQuickReplies.length > 0
            ? agentQuickReplies
            : quickReplyRole
            ? quickReplyRole === "seller"
              ? [
                  ...(sellerQuickReplies.length > 0
                    ? sellerQuickReplies.slice(0, 4).map((reply) => ({
                        label: reply.title,
                        onPress: () => onSelectReply(reply.message) }))
                    : DEFAULT_SELLER_QUICK_REPLIES.map((text) => ({
                        label: text,
                        onPress: () => onSelectReply(text) }))),
                  {
                    label: "Manage replies",
                    onPress: () => onManageReplies("seller") },
                ]
              : [
                  ...(buyerQuickReplies.length > 0
                    ? buyerQuickReplies.slice(0, 4).map((reply) => ({
                        label: reply.title,
                        onPress: () => onSelectReply(reply.message) }))
                    : DEFAULT_BUYER_QUICK_REPLIES.map((text) => ({
                        label: text,
                        onPress: () => onSelectReply(text) }))),
                  {
                    label: "Manage replies",
                    onPress: () => onManageReplies("buyer") },
                ]
            : undefined
        }
        dangerWarning={dangerWarning}
        cautionWarning={cautionWarning}
        onDismissDangerWarning={onDismissDangerWarning}
        onDismissCautionWarning={onDismissCautionWarning}
      />
    </View>
    </KeyboardStickyView>
  );
}
