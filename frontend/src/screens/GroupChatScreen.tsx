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
import { ChatComposerBar } from '../components/chat/ChatComposerBar';
import { ChatActionSheet } from '../components/chat/ChatActionSheet';
import { AttachmentReviewSheet } from '../components/chat/AttachmentReviewSheet';
import { DocumentReviewSheet } from '../components/chat/DocumentReviewSheet';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { Caption, BodyEmphasis } from '../components/ui/Text';
import { SkeletonChatLoader } from '../components/chat/SkeletonChatLoader';
import { MessageContextMenu, type MessageAction } from '../components/chat/MessageContextMenu';
import { EmojiReactionsBar, type EmojiReaction } from '../components/chat/EmojiReactionsBar';
import { ReplyQuote } from '../components/chat/ReplyQuote';
import { ConfirmationSheet } from '../components/ConfirmationSheet';
import * as Clipboard from 'expo-clipboard';

import { fetchGroupSettingsFromApi, reportConversationOnApi } from '../services/chatApi';
import {
  useTypingIndicator,
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
  reactions: { emoji: string; count: number; reactedByMe: boolean }[] | undefined,
): EmojiReaction[] | undefined {
  if (!reactions || reactions.length === 0) return undefined;
  return reactions.map((r) => ({
    emoji: r.emoji,
    count: r.count,
    reactedByMe: r.reactedByMe }));
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
        documentUri: entry.documentUri,
        documentName: entry.documentName,
        documentMimeType: entry.documentMimeType,
        reactions: entry.reactions?.map((r) => ({
          emoji: r.emoji,
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
    handleSendPendingDocument: hookSendPendingDocument,
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
  // P0.13: Replaces the false self-typing indicator. useTypingIndicator
  // subscribes to chat.typing.update events and auto-clears after 4s.
  const remoteTyping = useTypingIndicator(groupId);

  // Voice recording state — owned at screen level so the recorder survives
  // composer re-renders while recording (report 19).
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);

  // ─── Send adapter ───────────────────────────────────────────────────
  const handleSend = useCallback(() => {
    if (sendPermission !== 'allowed') return;
    const trimmed = input.trim();
    if (!trimmed) return;
    hookSendMessage(trimmed, replyTo, setTypingInput, setReplyTo);
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
      hookSendPendingDocument(caption, pendingDocument, setPendingDocument);
    },
    [hookSendPendingDocument, pendingDocument, setPendingDocument],
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
            mediaUri={item.mediaUri}
            mediaType={item.mediaType}
            documentUri={item.documentUri}
            documentName={item.documentName}
            documentMimeType={item.documentMimeType}
          />
        </View>
      );
    },
    [styles.messageRow, messages, handleMessageLongPress, dateSeparatorIndices, colors, setReactingToMessage],
  );

  const keyExtractor = useCallback((item: Message) => item.id, []);

  const memberCount = conversation?.participantIds?.length ?? 0;
  const headerSubtitle = remoteTyping
    ? 'typing…'
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

              <ChatComposerBar
                value={input}
                onChangeText={setTypingInput}
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
    permissionNotice: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      minHeight: Control.hit,
      paddingHorizontal: Space.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderSubtle },
    permissionNoticeText: {
      flex: 1 } });
