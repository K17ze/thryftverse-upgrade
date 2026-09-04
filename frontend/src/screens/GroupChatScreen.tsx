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
  Pressable } from 'react-native';
import { FlashList, type ListRenderItem } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import { RootStackParamList } from '../navigation/types';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { useStore } from '../store/useStore';
import { track } from '../analytics';
import { useHaptic } from '../hooks/useHaptic';
import { useToast } from '../context/ToastContext';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { KeyboardStickyView } from '../platform/keyboard/KeyboardProvider';
import { Space, Radius, TypeStyles, Control } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';

import { ChatTopBar } from '../components/chat/ChatTopBar';
import { MessageBubble } from '../components/chat/MessageBubble';
import { SwipeableMessage } from '../components/SwipeableMessage';
import { ChatComposerBar } from '../components/chat/ChatComposerBar';
import { ChatActionSheet } from '../components/chat/ChatActionSheet';
import { AttachmentReviewSheet } from '../components/chat/AttachmentReviewSheet';
import { DocumentReviewSheet } from '../components/chat/DocumentReviewSheet';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { Caption, BodyEmphasis } from '../components/ui/Text';
import { TypingIndicator } from '../components/chat/TypingIndicator';
import { SkeletonChatLoader } from '../components/chat/SkeletonChatLoader';
import { MessageContextMenu, type MessageAction } from '../components/chat/MessageContextMenu';
import { ForwardSheet } from '../components/chat/ForwardSheet';
import { MentionSuggestionPicker, type MentionCandidate } from '../components/chat/MentionSuggestionPicker';
import { extractMentionAtCursor } from '../utils/mentionParser';
import { EmojiReactionsBar, type EmojiReaction } from '../components/chat/EmojiReactionsBar';
import { ReplyQuote } from '../components/chat/ReplyQuote';
import { ConfirmationSheet } from '../components/ConfirmationSheet';
import * as Clipboard from 'expo-clipboard';

import { fetchGroupSettingsFromApi, reportConversationOnApi, sendConversationMessageOnApi } from '../services/chatApi';
import {
  useTypingIndicator,
  useTypingUsers,
  useChatGroupIdentityEvent,
  useChatGroupSettingsEvent,
  useChatGroupMembershipEvent,
} from '../services/realtimeClient';

import {
  useConversationMessages,
  useConversationComposer,
  type Message,
  formatDateSeparator,
  formatMessageTime } from '../hooks/chat';

type Props = NativeStackScreenProps<RootStackParamList, 'GroupChat'>;

function toEmojiReactions(
  reactions: { emoji: string; count?: number; reactedByMe?: boolean; userIds: string[] }[] | undefined,
): EmojiReaction[] | undefined {
  if (!reactions || reactions.length === 0) return undefined;
  return reactions.map((r) => ({
    emoji: r.emoji,
    count: r.count ?? r.userIds.length,
    reactedByMe: r.reactedByMe ?? false }));
}

export default function GroupChatScreen({ navigation, route }: Props) {
  const { groupId, groupName } = route.params ?? {};
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
  const upsertConversation = useStore((state) => state.upsertConversation);
  const reconcileGroupMembershipEvent = useStore((state) => state.reconcileGroupMembershipEvent);

  const conversation = useMemo(
    () => conversations.find((item) => item.id === groupId),
    [conversations, groupId],
  );

  const conversationId = conversation?.id ?? groupId;
  const currentRole = currentUser?.id ? conversation?.memberRoles?.[currentUser.id] : undefined;
  const isGroupManager = Boolean(
    currentUser?.id
    && (conversation?.ownerId === currentUser.id || currentRole === 'owner' || currentRole === 'admin'),
  );
  const [sendPermission, setSendPermission] = useState<'loading' | 'allowed' | 'restricted' | 'unavailable'>(
    isGroupManager ? 'allowed' : 'loading',
  );

  useEffect(() => {
    let active = true;
    if (isGroupManager) {
      setSendPermission('allowed');
      return () => {
        active = false;
      };
    }
    setSendPermission('loading');
    fetchGroupSettingsFromApi(conversationId)
      .then((snapshot) => {
        if (!active) return;
        setSendPermission(snapshot.capabilities.canSendMessages ? 'allowed' : 'restricted');
      })
      .catch(() => {
        if (active) setSendPermission('unavailable');
      });
    return () => {
      active = false;
    };
  }, [conversationId, isGroupManager]);

  useChatGroupSettingsEvent(conversationId, (payload) => {
    setSendPermission(
      isGroupManager || payload.settings.sendMessages === 'everyone'
        ? 'allowed'
        : 'restricted',
    );
  });

  useChatGroupMembershipEvent(conversationId, (event) => {
    const removedUserId = event.type === 'chat.member.removed'
      ? event.payload.memberUserId
      : event.type === 'chat.member.left'
        ? event.payload.actorUserId
        : null;
    reconcileGroupMembershipEvent(event);
    if (removedUserId === currentUser?.id) {
      navigation.reset({ index: 0, routes: [{ name: 'MainTabs', params: { screen: 'Inbox' } }] });
    }
  });

  // Real-time group identity updates — merge avatar/cover/name changes
  // from other admins into the local store so the header stays current.
  useChatGroupIdentityEvent(conversationId, (payload) => {
    if (!conversation) return;
    upsertConversation({
      ...conversation,
      id: payload.conversationId,
      title: payload.title ?? conversation.title,
      description: payload.description ?? conversation.description,
      avatar: payload.avatar !== undefined ? (payload.avatar ?? undefined) : conversation.avatar,
      coverPhoto: payload.coverPhoto !== undefined ? (payload.coverPhoto ?? undefined) : conversation.coverPhoto,
    });
  });

  // ─── Hydrated messages from store ───────────────────────────────────
  const hydratedMessages = useMemo<Message[]>(() => {
    if (!conversation?.messages.length) return [];
    return conversation.messages.map((entry) => {
      const isCurrentUserSender =
        entry.senderId === 'me' || entry.senderId === currentUser?.id;
      const sender: 'me' | 'other' = isCurrentUserSender ? 'me' : 'other';
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
        timestamp: entry.timestamp ?? entry.date ?? new Date().toISOString(),
        text: entry.text ?? entry.systemTitle ?? '',
        isSystem: entry.isSystem,
        systemTitle: entry.systemTitle,
        date: entry.timestamp,
        mediaUri: entry.mediaUri,
        mediaType: entry.mediaType,
        documentUri: entry.documentUri,
        documentName: entry.documentName,
        documentMimeType: entry.documentMimeType,
        reactions: entry.reactions?.map((r) => ({
          emoji: r.emoji,
          userIds: r.userIds,
          count: r.userIds.length,
          reactedByMe: r.userIds.includes(currentUser?.id ?? 'me') })),
        replyToMessageId: entry.replyToMessageId };
    });
  }, [conversation, currentUser?.id]);

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
    handleSendPendingAttachment: hookSendPendingAttachment,
    confirmation: conversationConfirmation,
    clearConfirmation: clearConversationConfirmation,
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
    deployedChatAgents: [],
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
    setReactingToMessage,
    attachmentPickerVisible,
    setAttachmentPickerVisible,
    pendingAttachment,
    setPendingAttachment,
    pendingDocument,
    setPendingDocument,
    handleAttachmentSelect } = useConversationComposer({
    conversationId,
    messagesRef,
    show,
    haptic,
    setConversationDraft });

  // ─── Server-driven typing indicator (other participants only) ──────
  // P0.13: Replaces the false self-typing indicator. useTypingUsers
  // subscribes to chat.typing.update events and exposes the set of
  // typing user IDs so we can show named typing ("Alice is typing…")
  // instead of the generic "Someone is typing…".
  const { typingUserIds, isTyping: remoteTyping } = useTypingUsers(groupId);

  // Resolve typing user IDs to display names from participant profiles.
  const typingDisplayNames = useMemo(() => {
    return typingUserIds
      .filter((id) => id !== currentUser?.id)
      .map((id) => {
        const profile = conversation?.participantProfiles?.find((p) => p.id === id);
        return profile?.displayName ?? profile?.username ?? 'Someone';
      });
  }, [typingUserIds, conversation?.participantProfiles, currentUser?.id]);

  const typingLabel = useMemo(() => {
    const names = typingDisplayNames;
    if (names.length === 0) return null;
    if (names.length === 1) return `${names[0]} is typing…`;
    if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
    return `${names.length} people are typing…`;
  }, [typingDisplayNames]);

  // Voice recording state — owned at screen level so the recorder survives
  // composer re-renders while recording (report 19).
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);

  // ─── Send adapter ───────────────────────────────────────────────────
  const handleSend = useCallback(() => {
    if (sendPermission !== 'allowed') return;
    const trimmed = input.trim();
    if (!trimmed) return;
    hookSendMessage(trimmed, replyTo, setTypingInput, setReplyTo);
    setMentionQuery(null);
    notifyStoppedTyping();
    if (conversationId) {
      track('message_sent', { conversation_id: conversationId, message_type: 'text' });
    }
  }, [input, hookSendMessage, replyTo, setTypingInput, setReplyTo, notifyStoppedTyping, sendPermission, conversationId]);

  // ─── Attachment send adapters ───────────────────────────────────────
  const handleSendPendingAttachment = useCallback(
    (caption: string) => {
      hookSendPendingAttachment(caption, pendingAttachment, setPendingAttachment);
      if (pendingAttachment && conversationId) {
        track('message_sent', { conversation_id: conversationId, message_type: pendingAttachment.mediaType });
      }
    },
    [hookSendPendingAttachment, pendingAttachment, setPendingAttachment, conversationId],
  );

  const handleSendPendingDocument = useCallback(
    (caption: string) => {
      if (!pendingDocument) return;
      hookSendMessage(caption || pendingDocument.name, null, () => {}, () => {});
      setPendingDocument(null);
    },
    [hookSendMessage, pendingDocument, setPendingDocument],
  );

  // ─── Context menu + reactions ───────────────────────────────────────
  const [contextMenuVisible, setContextMenuVisible] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [descriptionDismissed, setDescriptionDismissed] = useState(false);
  const [forwardSheetVisible, setForwardSheetVisible] = useState(false);
  const [forwardingMessage, setForwardingMessage] = useState<Message | null>(null);

  // ── @mention suggestion state ──
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [cursorPosition, setCursorPosition] = useState(0);

  // Build mention candidates from participant profiles
  const mentionCandidates = useMemo<MentionCandidate[]>(() => {
    return (conversation?.participantProfiles ?? [])
      .filter((p) => p.id !== currentUser?.id)
      .map((p) => ({
        id: p.id,
        displayName: p.displayName ?? p.username ?? 'Member',
        username: p.username,
        role: conversation?.memberRoles?.[p.id],
      }));
  }, [conversation?.participantProfiles, conversation?.memberRoles, currentUser?.id]);

  // Detect @mention being typed
  const handleInputChange = useCallback((text: string) => {
    setTypingInput(text);
    const query = extractMentionAtCursor(text, text.length);
    setMentionQuery(query);
  }, [setTypingInput]);

  const handleMentionSelect = useCallback((candidate: MentionCandidate | { id: 'all'; displayName: string }) => {
    const handle = candidate.displayName;
    const currentInput = input;
    // Find the last @ and replace the partial mention
    const atIdx = currentInput.lastIndexOf('@');
    if (atIdx === -1) return;
    const before = currentInput.substring(0, atIdx);
    const after = currentInput.substring(atIdx + 1 + (mentionQuery?.length ?? 0));
    const newText = `${before}@${handle} ${after}`;
    setTypingInput(newText);
    setMentionQuery(null);
    haptic.selection();
  }, [input, mentionQuery, setTypingInput, haptic]);

  // Reset dismissed state when switching groups
  useEffect(() => {
    setDescriptionDismissed(false);
  }, [groupId]);

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
      case 'forward':
        // Forward in group chat — open forward sheet
        setForwardingMessage(selectedMessage);
        setForwardSheetVisible(true);
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
  }, [selectedMessage, conversationId, show, handleDeleteMessage, setReplyTo, setReactingToMessage, setForwardingMessage, setForwardSheetVisible, currentUser?.id]);

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
      const isAgent = item.isAgent === true;
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
          <SwipeableMessage
            isMe={item.sender === 'me'}
            onReply={() => setReplyTo(item)}
            onActions={() => handleMessageLongPress(item)}
          >
            <MessageBubble
              id={item.id}
              conversationId={conversationId}
              text={item.text ?? ''}
              isMe={item.sender === 'me'}
              senderLabel={isAgent ? `${item.senderLabel ?? 'Member'} · AI` : item.senderLabel}
              timestamp={time}
              isFirstInCluster={isFirstInCluster}
              isLastInCluster={isLastInCluster}
              showAvatar={item.sender === 'other' && isFirstInCluster}
              reactions={toEmojiReactions(item.reactions)}
              replyTo={
                replyParent
                  ? { senderName: replyParent.senderLabel ?? 'Member', text: replyParent.text ?? '' }
                  : null
              }
              onLongPress={() => handleMessageLongPress(item)}
              onReactionPress={() => setReactingToMessage(item)}
              mediaUri={item.mediaUri}
              mediaType={item.mediaType}
              documentUri={item.documentUri}
              documentName={item.documentName}
              documentMimeType={item.documentMimeType}
            />
          </SwipeableMessage>
        </View>
      );
    },
    [styles.messageRow, messages, handleMessageLongPress, dateSeparatorIndices, colors, setReactingToMessage, setReplyTo],
  );

  const keyExtractor = useCallback((item: Message) => item.id, []);

  const memberCount = conversation?.participantIds?.length ?? 0;
  const headerSubtitle = remoteTyping && typingLabel
    ? typingLabel
    : `${memberCount} members`;

  // ─── Loading / error states ─────────────────────────────────────────
  const showLoading = isSyncing && messages.length === 0;
  const showError = syncError && messages.length === 0;

  return (
    <SafeAreaView edges={['bottom']} style={styles.screenRoot}>
      <View style={styles.screenRoot}>
        <ChatTopBar
          title={conversation?.title ?? groupName}
          subtitle={headerSubtitle}
          avatarUrl={conversation?.avatar ?? null}
          groupId={groupId}
          variant="group"
          onBack={() => navigation.goBack()}
          onInfo={() => navigation.navigate('GroupChatInfo', { conversationId: groupId })}
          onTitlePress={() => navigation.navigate('GroupChatInfo', { conversationId: groupId })}
        />

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
            {conversation?.description && !descriptionDismissed ? (
              <View style={styles.descriptionBar}>
                <View style={styles.descriptionContent}>
                  <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
                  <Text style={styles.descriptionText} numberOfLines={2}>
                    {conversation.description}
                  </Text>
                </View>
                <Pressable
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  onPress={() => setDescriptionDismissed(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Dismiss group description"
                >
                  <Ionicons name="close" size={16} color={colors.textMuted} />
                </Pressable>
              </View>
            ) : null}
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

              {remoteTyping && typingLabel ? (
                <View style={styles.typingRow}>
                  <TypingIndicator dotColor={colors.textMuted} dotSize={5} />
                  <Caption color={colors.textMuted} style={styles.typingText}>{typingLabel}</Caption>
                </View>
              ) : null}

              {sendPermission !== 'allowed' ? (
                <View style={styles.permissionNotice} accessibilityRole="text">
                  <Ionicons
                    name={sendPermission === 'restricted' ? 'lock-closed-outline' : 'cloud-offline-outline'}
                    size={16}
                    color={colors.textMuted}
                  />
                  <Caption color={colors.textMuted} style={styles.permissionNoticeText}>
                    {sendPermission === 'loading'
                      ? 'Checking group permissions…'
                      : sendPermission === 'restricted'
                        ? 'Only admins can send messages in this group.'
                        : 'Messaging permissions are unavailable. Try reopening the group.'}
                  </Caption>
                </View>
              ) : null}

              <MentionSuggestionPicker
                visible={mentionQuery !== null}
                query={mentionQuery ?? ''}
                candidates={mentionCandidates}
                canMentionAll={isGroupManager}
                memberCount={conversation?.participantIds?.length ?? 0}
                onSelect={handleMentionSelect}
              />

              <ChatComposerBar
                value={input}
                onChangeText={handleInputChange}
                onSend={handleSend}
                onAttachmentPress={() => setAttachmentPickerVisible(true)}
                onCameraPress={() => handleAttachmentSelect("camera")}
                onVoiceRecord={handleSendVoice}
                isVoiceRecording={isVoiceRecording}
                onVoiceRecordingChange={setIsVoiceRecording}
                placeholder="Message the group…"
                isSending={composerSending}
                disabled={sendPermission !== 'allowed'}
              />
            </KeyboardStickyView>
          </>
        )}

        <ChatActionSheet
          visible={attachmentPickerVisible && !composerSending}
          onClose={() => setAttachmentPickerVisible(false)}
          onSelect={(action) => {
            if (action === "gallery" || action === "camera" || action === "document" || action === "location") {
              handleAttachmentSelect(action);
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

        {pendingDocument && !composerSending && (
          <DocumentReviewSheet
            visible={!!pendingDocument}
            fileName={pendingDocument.name}
            mimeType={pendingDocument.mimeType}
            onClose={() => setPendingDocument(null)}
            onSend={handleSendPendingDocument}
          />
        )}

        <MessageContextMenu
          visible={contextMenuVisible}
          onClose={() => setContextMenuVisible(false)}
          onAction={handleContextAction}
          messageText={selectedMessage?.text}
          isOwnMessage={selectedMessage?.sender === 'me'}
        />

        <ForwardSheet
          visible={forwardSheetVisible}
          conversations={conversations.filter((c) => c.id !== conversationId)}
          currentConversationId={conversationId}
          onForward={(targetConversationId) => {
            if (forwardingMessage) {
              const text = forwardingMessage.text ?? '';
              if (text) {
                sendConversationMessageOnApi(
                  targetConversationId,
                  text,
                  undefined,
                  undefined,
                  undefined,
                  currentUser?.id,
                ).catch(() => show('Failed to forward message', 'error'));
              }
            }
            setForwardSheetVisible(false);
            setForwardingMessage(null);
            show('Message forwarded', 'success');
          }}
          onClose={() => {
            setForwardSheetVisible(false);
            setForwardingMessage(null);
          }}
        />

        <ConfirmationSheet
          visible={!!conversationConfirmation}
          onDismiss={clearConversationConfirmation}
          title={conversationConfirmation?.title ?? ''}
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
          variant={conversationConfirmation?.variant ?? 'danger'}
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
    typingText: {
      letterSpacing: 0.1,
    },
    permissionNotice: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      minHeight: Control.hit,
      paddingHorizontal: Space.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderSubtle },
    permissionNoticeText: {
      flex: 1 },
    descriptionBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      backgroundColor: colors.surfaceElevated,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderSubtle,
    },
    descriptionContent: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Space.xs,
      flex: 1,
    },
    descriptionText: {
      flex: 1,
      fontSize: 13,
      lineHeight: 18,
      color: colors.textSecondary,
    },
  });
