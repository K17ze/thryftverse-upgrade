/**
 * GroupChatScreen — multi-user group chat surface (group buying,
 * co-own coordination, seller broadcasts).
 *
 * Wave 0 convergence: this screen now uses the SAME controller hooks as
 * ChatScreen — useConversationMessages + useConversationComposer — so group
 * chat inherits clientMessageId reconciliation, durable outbox, reconciling
 * state, delete-with-undo, cursor pagination, offline/foreground resync,
 * realtime event consumption, and server-driven typing indicators.
 *
 * The route params carry { groupId, groupName }. The conversation is looked
 * up from the store by id; if it isn't found the screen renders a truthful
 * error state rather than fabricating one (AGENTS.md §11).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView } from 'react-native';
import { FlashList, type ListRenderItem } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import { RootStackParamList } from '../navigation/types';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { useStore } from '../store/useStore';
import { useHaptic } from '../hooks/useHaptic';
import { useToast } from '../context/ToastContext';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { KeyboardStickyView } from '../platform/keyboard/KeyboardProvider';
import { Space, Radius, TypeStyles, Control } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';

import { ChatTopBar } from '../components/chat/ChatTopBar';
import { MessageBubble } from '../components/chat/MessageBubble';
import { ChatComposerBar } from '../components/chat/ChatComposerBar';
import { ChatAgentPicker } from '../components/chat/ChatAgentPicker';
import { SuggestedRepliesBar } from '../components/chat/SuggestedRepliesBar';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { Caption, BodyEmphasis } from '../components/ui/Text';
import { SkeletonChatLoader } from '../components/chat/SkeletonChatLoader';
import { MessageContextMenu, type MessageAction } from '../components/chat/MessageContextMenu';
import { EmojiReactionsBar, type EmojiReaction } from '../components/chat/EmojiReactionsBar';
import { ReplyQuote } from '../components/chat/ReplyQuote';
import * as Clipboard from 'expo-clipboard';

import {
  deployAgent,
  removeAgent,
  getDeployedAgents,
  getAgentSuggestions,
  type ChatAgent,
  type SuggestedReply } from '../services/chatAgentsApi';
import { reportConversationOnApi } from '../services/chatApi';
import { useTypingIndicator } from '../services/realtimeClient';

import {
  useConversationMessages,
  useConversationComposer,
  type Message,
  formatDateSeparator,
  formatMessageTime } from '../hooks/chat';

type Props = NativeStackScreenProps<RootStackParamList, 'GroupChat'>;

function toEmojiReactions(
  reactions: { emoji: string; count: number; reactedByMe: boolean }[] | undefined,
): EmojiReaction[] | undefined {
  if (!reactions || reactions.length === 0) return undefined;
  return reactions.map((r) => ({
    emoji: r.emoji,
    count: r.count,
    reactedByMe: r.reactedByMe }));
}

export default function GroupChatScreen({ navigation, route }: Props) {
  const { groupId, groupName } = route.params;
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const haptic = useHaptic();
  const { show } = useToast();
  const { formatFromFiat } = useFormattedPrice();

  const conversations = useStore((state) => state.conversations);
  const currentUser = useStore((state) => state.currentUser);
  const appendConversationMessage = useStore((state) => state.appendConversationMessage);
  const replaceConversationMessages = useStore((state) => state.replaceConversationMessages);
  const markConversationRead = useStore((state) => state.markConversationRead);
  const setConversationDraft = useStore((state) => state.setConversationDraft);
  const addMessageReaction = useStore((state) => state.addMessageReaction);
  const removeMessageReaction = useStore((state) => state.removeMessageReaction);

  const conversation = useMemo(
    () => conversations.find((item) => item.id === groupId),
    [conversations, groupId],
  );

  const conversationId = conversation?.id ?? groupId;

  // ─── Hydrated messages from store ───────────────────────────────────
  const hydratedMessages = useMemo<Message[]>(() => {
    if (!conversation?.messages.length) return [];
    return conversation.messages.map((entry) => {
      const isCurrentUserSender =
        entry.senderId === 'me' || entry.senderId === currentUser?.id;
      const sender: 'me' | 'them' = isCurrentUserSender ? 'me' : 'them';
      const senderLabel =
        conversation.participantProfiles?.find((p) => p.id === entry.senderId)?.displayName ??
        conversation.participantProfiles?.find((p) => p.id === entry.senderId)?.username ??
        'Member';
      return {
        id: entry.id,
        type: entry.isSystem || entry.type === 'system' ? 'system' : entry.mediaUri ? 'media' : 'text',
        sender,
        senderId: entry.senderId,
        senderLabel,
        text: entry.text ?? entry.systemTitle ?? '',
        isSystem: entry.isSystem,
        systemTitle: entry.systemTitle,
        date: entry.timestamp,
        mediaUri: entry.mediaUri,
        mediaType: entry.mediaType,
        reactions: entry.reactions?.map((r) => ({
          emoji: r.emoji,
          count: r.userIds.length,
          reactedByMe: r.userIds.includes(currentUser?.id ?? 'me') })),
        replyToMessageId: entry.replyToMessageId };
    });
  }, [conversation, currentUser?.id]);

  // ─── AI agents (demo service) ───────────────────────────────────────
  const [agentPickerVisible, setAgentPickerVisible] = useState(false);
  const [deployedAgents, setDeployedAgents] = useState<ChatAgent[]>([]);
  const [suggestions, setSuggestions] = useState<SuggestedReply[]>([]);

  useEffect(() => {
    setDeployedAgents(getDeployedAgents(groupId));
  }, [groupId]);

  const refreshSuggestions = useCallback(
    (lastMessage: string) => {
      const next = getAgentSuggestions(groupId, lastMessage);
      setSuggestions(next);
    },
    [groupId],
  );

  // ─── Controller hook: message list, sync, send, retry, delete ───────
  const {
    messages,
    isSyncing,
    syncError,
    listRef,
    scheduleScrollToEnd,
    recentlyDeleted,
    composerSending,
    sendMessage: hookSendMessage,
    sendVoiceMessage,
    handleSendVoice,
    handleDeleteMessage,
    handleUndoDelete,
    dateSeparatorIndices,
    handleMessageListScroll: hookHandleMessageListScroll,
    syncMessagesFromApi } = useConversationMessages({
    conversationId,
    currentUser,
    hydratedMessages,
    formatFromFiat,
    show,
    haptic,
    onOfferSent: () => {},
    clearComposerState: async () => {},
    deployedChatAgents: deployedAgents,
    getChatAgentResponse: () => ({ id: '', agentId: '', content: '' }),
    getChatAgentSuggestions: () => [],
    setChatAgentSuggestionsExternal: () => {},
    navigation,
    isGroup: true,
    conversationUnread: conversation?.unread,
    markConversationRead,
    appendConversationMessage,
    replaceConversationMessages });

  // ─── Controller hook: composer state, typing, reply ─────────────────
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const {
    input,
    setTypingInput,
    notifyStoppedTyping,
    replyTo,
    setReplyTo,
    reactingToMessage,
    setReactingToMessage } = useConversationComposer({
    conversationId,
    messagesRef,
    show,
    haptic,
    setConversationDraft });

  // ─── Server-driven typing indicator (other participants only) ──────
  // P0.13: Replaces the false self-typing indicator. useTypingIndicator
  // subscribes to chat.typing.update events and auto-clears after 4s.
  const remoteTyping = useTypingIndicator(groupId);

  // Voice recording state — owned at screen level so the recorder survives
  // composer re-renders while recording (report 19).
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);

  // ─── Send adapter ───────────────────────────────────────────────────
  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed) return;
    hookSendMessage(trimmed, replyTo, setTypingInput, setReplyTo);
    notifyStoppedTyping();
    refreshSuggestions(trimmed);
  }, [input, hookSendMessage, replyTo, setTypingInput, setReplyTo, notifyStoppedTyping, refreshSuggestions]);

  // ─── Agent management ───────────────────────────────────────────────
  const handleSelectSuggestion = useCallback(
    (reply: SuggestedReply) => {
      haptic.selection();
      setTypingInput(reply.text);
    },
    [haptic, setTypingInput],
  );

  const handleDeployAgent = useCallback(
    (agent: ChatAgent) => {
      haptic.success();
      deployAgent(groupId, agent.type);
      setDeployedAgents(getDeployedAgents(groupId));
      setAgentPickerVisible(false);
      show(`${agent.name} connected`, 'success');
      refreshSuggestions('');
    },
    [groupId, haptic, refreshSuggestions, show],
  );

  const handleRemoveAgent = useCallback(
    (agentId: string) => {
      haptic.medium();
      removeAgent(groupId, agentId);
      setDeployedAgents(getDeployedAgents(groupId));
      setSuggestions([]);
      show('Agent removed', 'info');
    },
    [groupId, haptic, show],
  );

  // ─── Context menu + reactions ───────────────────────────────────────
  const [contextMenuVisible, setContextMenuVisible] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);

  const handleMessageLongPress = useCallback((msg: Message) => {
    haptic.medium();
    setSelectedMessage(msg);
    setContextMenuVisible(true);
  }, [haptic]);

  const handleContextAction = useCallback((action: MessageAction) => {
    if (!selectedMessage) return;
    switch (action) {
      case 'reply':
        setReplyTo(selectedMessage);
        break;
      case 'copy':
        Clipboard.setStringAsync(selectedMessage.text ?? '');
        show('Copied', 'success');
        break;
      case 'react':
        setReactingToMessage(selectedMessage);
        break;
      case 'delete':
        handleDeleteMessage(selectedMessage);
        break;
      case 'report': {
        const reportKey = `rpt_${conversationId}_${selectedMessage.id}`;
        reportConversationOnApi(conversationId, 'other', undefined, selectedMessage.id, reportKey)
          .then(() => show('Report submitted. Thank you.', 'success'))
          .catch(() => show('Failed to submit report. Please try again.', 'error'));
        break;
      }
      default:
        break;
    }
    setContextMenuVisible(false);
  }, [selectedMessage, conversationId, show, handleDeleteMessage, setReplyTo, setReactingToMessage]);

  const handleReact = useCallback((emoji: string) => {
    const msg = reactingToMessage;
    if (!msg) return;
    const existing = msg.reactions?.find((r) => r.emoji === emoji);
    if (existing?.reactedByMe) {
      removeMessageReaction(conversationId, msg.id, emoji);
    } else {
      addMessageReaction(conversationId, msg.id, emoji);
    }
    setReactingToMessage(null);
    haptic.light();
  }, [reactingToMessage, conversationId, addMessageReaction, removeMessageReaction, haptic, setReactingToMessage]);

  // ─── Message rendering ──────────────────────────────────────────────
  const renderMessage: ListRenderItem<Message> = useCallback(
    ({ item, index }) => {
      const prev = messages[index - 1];
      const next = messages[index + 1];
      const isFirstInCluster = !prev || prev.senderId !== item.senderId;
      const isLastInCluster = !next || next.senderId !== item.senderId;
      const isAgent = deployedAgents.some((agent) => agent.id === item.senderId);
      const replyParent = item.replyToMessageId
        ? messages.find((m) => m.id === item.replyToMessageId)
        : undefined;

      const dateSep = dateSeparatorIndices.has(index)
        ? formatDateSeparator(item.date ?? '')
        : null;
      const time = formatMessageTime(item.date);

      return (
        <View style={styles.messageRow}>
          {dateSep ? (
            <View style={styles.dateSeparator}>
              <View style={[styles.dateSeparatorLine, { backgroundColor: colors.borderSubtle }]} />
              <Caption color={colors.textMuted} style={styles.dateSeparatorText}>{dateSep}</Caption>
              <View style={[styles.dateSeparatorLine, { backgroundColor: colors.borderSubtle }]} />
            </View>
          ) : null}
          <MessageBubble
            id={item.id}
            conversationId={conversationId}
            text={item.text ?? ''}
            isMe={item.sender === 'me'}
            senderLabel={isAgent ? `${item.senderLabel ?? 'Member'} · AI` : item.senderLabel}
            timestamp={time}
            isFirstInCluster={isFirstInCluster}
            isLastInCluster={isLastInCluster}
            showAvatar={item.sender === 'them' && isFirstInCluster}
            reactions={toEmojiReactions(item.reactions)}
            replyTo={
              replyParent
                ? { senderName: replyParent.senderLabel ?? 'Member', text: replyParent.text ?? '' }
                : null
            }
            onLongPress={() => handleMessageLongPress(item)}
            onReactionPress={() => setReactingToMessage(item)}
          />
        </View>
      );
    },
    [deployedAgents, styles.messageRow, messages, handleMessageLongPress, dateSeparatorIndices, colors, setReactingToMessage],
  );

  const keyExtractor = useCallback((item: Message) => item.id, []);

  const memberCount = conversation?.participantIds?.length ?? 0;
  const headerSubtitle = remoteTyping
    ? 'typing…'
    : `${memberCount} members${deployedAgents.length > 0 ? ` · ${deployedAgents.length} AI` : ''}`;

  // ─── Loading / error states ─────────────────────────────────────────
  const showLoading = isSyncing && messages.length === 0;
  const showError = syncError && messages.length === 0;

  return (
    <SafeAreaView edges={['bottom']} style={styles.screenRoot}>
      <View style={styles.screenRoot}>
        <ChatTopBar
          title={groupName}
          subtitle={headerSubtitle}
          variant="group"
          onBack={() => navigation.goBack()}
          onInfo={() => navigation.navigate('GroupChatInfo', { conversationId: groupId })}
          onTitlePress={() => navigation.navigate('GroupChatInfo', { conversationId: groupId })}
        />

        {/* AI agent chips */}
        {deployedAgents.length > 0 && (
          <View
            style={[
              styles.agentChipsRow,
              { backgroundColor: colors.surfaceAlt, borderBottomColor: colors.borderSubtle },
            ]}
          >
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.agentChipsContent}
            >
              {deployedAgents.map((agent) => (
                <Pressable
                  key={agent.id}
                  hitSlop={4}
                  onPress={() => handleRemoveAgent(agent.id)}
                  style={({ pressed }) => [
                    styles.agentChip,
                    { backgroundColor: pressed ? colors.surface : colors.brandSubtle },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${agent.name} agent`}
                  accessibilityHint="Removes this AI agent from the group chat"
                >
                  <Ionicons
                    name={agent.avatar as keyof typeof Ionicons.glyphMap}
                    size={12}
                    color={colors.brand}
                  />
                  <Text style={[styles.agentChipText, { color: colors.brand }]} numberOfLines={1}>
                    {agent.name}
                  </Text>
                  <Ionicons name="close-circle" size={12} color={colors.brand} />
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        {showLoading && <SkeletonChatLoader count={6} />}

        {showError && (
          <View style={styles.centerState}>
            <Ionicons name="alert-circle-outline" size={28} color={colors.textMuted} />
            <BodyEmphasis color={colors.textPrimary} style={styles.stateTitle}>
              Conversation unavailable
            </BodyEmphasis>
            <Caption color={colors.textMuted} style={styles.stateCaption}>
              This group could not be loaded.
            </Caption>
            <AnimatedPressable
              style={[styles.retryBtn, { backgroundColor: colors.brand }]}
              onPress={() => void syncMessagesFromApi()}
              activeOpacity={0.7}
              scaleValue={0.96}
              hapticFeedback="light"
              accessibilityRole="button"
              accessibilityLabel="Retry loading conversation"
            >
              <Text style={[styles.retryBtnText, { color: colors.textInverse }]}>Retry</Text>
            </AnimatedPressable>
          </View>
        )}

        {!showLoading && !showError && (
          <>
            <FlashList
              ref={listRef}
              data={messages}
              keyExtractor={keyExtractor}
              renderItem={renderMessage}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              onScroll={hookHandleMessageListScroll}
              onContentSizeChange={scheduleScrollToEnd}
              ListEmptyComponent={
                <View style={styles.centerState}>
                  <Ionicons name="chatbubbles-outline" size={30} color={colors.textMuted} />
                  <BodyEmphasis color={colors.textPrimary} style={styles.stateTitle}>
                    No messages yet
                  </BodyEmphasis>
                  <Caption color={colors.textMuted} style={styles.stateCaption}>
                    Start the conversation
                  </Caption>
                </View>
              }
              // P0.6: Preserve scroll anchor when older messages are
              // prepended via cursor pagination.
              maintainVisibleContentPosition={{
                autoscrollToTopThreshold: 0 }}
            />

            <KeyboardStickyView style={styles.composerWrap}>
              {recentlyDeleted.length > 0 && (
                <Pressable
                  style={styles.undoBanner}
                  onPress={handleUndoDelete}
                  accessibilityRole="button"
                  accessibilityLabel="Undo delete"
                >
                  <Caption color={colors.textInverse}>Message deleted · Undo</Caption>
                </Pressable>
              )}

              {replyTo ? (
                <ReplyQuote
                  senderName={replyTo.senderLabel ?? 'Member'}
                  text={replyTo.text ?? ''}
                  onClose={() => setReplyTo(null)}
                  style={styles.replyQuote}
                />
              ) : null}

              {reactingToMessage ? (
                <EmojiReactionsBar
                  reactions={toEmojiReactions(reactingToMessage.reactions) ?? []}
                  onReact={handleReact}
                  style={styles.reactionsBar}
                />
              ) : null}

              {remoteTyping ? (
                <View style={styles.typingRow}>
                  <Caption color={colors.textMuted}>Someone is typing…</Caption>
                </View>
              ) : null}

              {deployedAgents.length > 0 && suggestions.length > 0 && input.trim().length === 0 && (
                <SuggestedRepliesBar suggestions={suggestions} onSelect={handleSelectSuggestion} />
              )}

              <ChatComposerBar
                value={input}
                onChangeText={setTypingInput}
                onSend={handleSend}
                onVoiceRecord={handleSendVoice}
                isVoiceRecording={isVoiceRecording}
                onVoiceRecordingChange={setIsVoiceRecording}
                placeholder="Message the group…"
                isSending={composerSending}
              />

              <View style={styles.addAgentContainer}>
                <AnimatedPressable
                  style={styles.addAgentRow}
                  onPress={() => setAgentPickerVisible(true)}
                  activeOpacity={0.7}
                  scaleValue={0.98}
                  hapticFeedback="light"
                  accessibilityRole="button"
                  accessibilityLabel="Add AI Agent to this group"
                  accessibilityHint="Opens the AI agent picker"
                >
                  <Ionicons name="person-add-outline" size={15} color={colors.brand} />
                  <Text style={[styles.addAgentText, { color: colors.brand }]}>
                    {deployedAgents.length > 0 ? 'Manage AI agents' : 'Add AI agent'}
                  </Text>
                </AnimatedPressable>
                <Caption color={colors.textMuted} style={styles.addAgentDescription}>
                  Deploy AI assistants for group moderation, styling, or shopping help
                </Caption>
              </View>
            </KeyboardStickyView>
          </>
        )}

        <ChatAgentPicker
          visible={agentPickerVisible}
          onClose={() => setAgentPickerVisible(false)}
          onDeploy={handleDeployAgent}
          deployedAgentIds={deployedAgents.map((agent) => agent.id)}
          conversationId={conversationId}
        />

        <MessageContextMenu
          visible={contextMenuVisible}
          onClose={() => setContextMenuVisible(false)}
          onAction={handleContextAction}
          messageText={selectedMessage?.text}
          isOwnMessage={selectedMessage?.sender === 'me'}
        />
      </View>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    screenRoot: {
      flex: 1,
      backgroundColor: colors.background },
    agentChipsRow: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      paddingVertical: Space.xs },
    agentChipsContent: {
      paddingHorizontal: Space.md,
      gap: Space.xs,
      alignItems: 'center' },
    agentChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingHorizontal: Space.sm,
      paddingVertical: Space.xs,
      borderRadius: Radius.lg },
    agentChipText: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: TypeStyles.bodyEmphasis.fontFamily },
    centerState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: Space.xs + 2,
      paddingHorizontal: Space.xl,
      paddingBottom: Space.xl },
    stateTitle: {
      textAlign: 'center' },
    stateCaption: {
      textAlign: 'center' },
    retryBtn: {
      paddingHorizontal: Space.lg,
      paddingVertical: Space.sm,
      borderRadius: Radius.md,
      minHeight: Control.hit,
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: Space.xs },
    retryBtnText: {
      fontSize: TypographyV2.body.size,
      lineHeight: TypographyV2.body.lineHeight,
      fontFamily: TypeStyles.bodyEmphasis.fontFamily },
    listContent: {
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      flexGrow: 1 },
    messageRow: {
      marginVertical: 2 },
    dateSeparator: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingVertical: Space.sm },
    dateSeparatorLine: {
      flex: 1,
      height: StyleSheet.hairlineWidth },
    dateSeparatorText: {
      textAlign: 'center' },
    composerWrap: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border },
    undoBanner: {
      backgroundColor: colors.brand,
      paddingHorizontal: Space.md,
      paddingVertical: Space.xs,
      alignItems: 'center' },
    replyQuote: {
      marginHorizontal: Space.md,
      marginTop: Space.sm },
    reactionsBar: {
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm },
    typingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingHorizontal: Space.md,
      paddingVertical: Space.xs },
    addAgentContainer: {
      alignItems: 'center',
      paddingVertical: Space.sm,
      paddingBottom: Space.md },
    addAgentRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Space.xs,
      paddingVertical: Space.xs },
    addAgentText: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: TypeStyles.bodyEmphasis.fontFamily },
    addAgentDescription: {
      textAlign: 'center',
      marginTop: Space.xs,
      paddingHorizontal: Space.lg } });
