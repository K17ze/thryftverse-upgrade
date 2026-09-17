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
  StyleSheet,
  Pressable } from 'react-native';
import { FlashList, type ListRenderItem } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import { RootStackParamList } from '../navigation/types';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { useChatPreferences } from '../hooks/useChatPreferences';
import { chatThemeBackground } from '../services/chatPreferencesApi';
import { useStore } from '../store/useStore';
import { track } from '../analytics';
import { t } from '../i18n';
import { useHaptic } from '../hooks/useHaptic';
import { useToast } from '../context/ToastContext';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { KeyboardStickyView } from '../platform/keyboard/KeyboardProvider';
import { Space, Control, Radius } from '../theme/designTokens';


import { ChatTopBar } from '../components/chat/ChatTopBar';
import { GroupDescriptionBar } from '../components/chat/GroupDescriptionBar';
import { FlagshipState } from '../components/flagship';
import { AppIcon } from '../components/common/AppIcon';
import { MessageBubble } from '../components/chat/MessageBubble';
import { SwipeableMessage } from '../components/SwipeableMessage';
import { ChatComposerBar } from '../components/chat/ChatComposerBar';
import { ChatActionSheet } from '../components/chat/ChatActionSheet';
import { AttachmentReviewSheet } from '../components/chat/AttachmentReviewSheet';
import { DocumentReviewSheet } from '../components/chat/DocumentReviewSheet';
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

import { fetchGroupSettingsFromApi, pinMessageOnApi, reportConversationOnApi, unpinMessageOnApi } from '../services/chatApi';
import { forwardMessageToConversation, isForwardableMessage } from '../components/chat/forwardMessage';
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
  usePinnedMessage,
  useUnreadDividerAnchor,
  type Message,
  formatDateSeparator,
  formatMessageTime,
  parseMessageDate } from '../hooks/chat';
import { UnreadMessagesDivider } from '../components/chat/ChatMessageItem';
import { PinnedMessageBar } from '../components/chat/PinnedMessageBar';

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
  const { groupId, groupName, initialSearch } = route.params ?? {};
  const { colors, isDark } = useAppTheme();
  const chatPreferences = useChatPreferences(groupId);
  const chatBackground = chatThemeBackground(chatPreferences.query.data?.theme, isDark, colors.background);
  const styles = useMemo(() => createStyles(colors), [colors]);
  const haptic = useHaptic();
  const { show } = useToast();
  const { formatFromFiat } = useFormattedPrice();

  const [isSearchActive, setIsSearchActive] = useState(Boolean(initialSearch));
  const [searchQuery, setSearchQuery] = useState('');

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

  // Pin — real pin/unpin endpoints; backend permits group admins/owners
  // only, so the context-menu action is gated on role.
  const canPinMessage = currentRole === 'owner' || currentRole === 'admin';
  const { pinnedMessage, refresh: refreshPinnedMessage } = usePinnedMessage(
    conversationId,
    true,
    conversations,
  );

  const handlePinMessage = useCallback(
    (msg: Message) => {
      if (!conversationId || !canPinMessage) return;
      const isPinned = pinnedMessage?.messageId === msg.id;
      const request = isPinned
        ? unpinMessageOnApi(conversationId, msg.id)
        : pinMessageOnApi(conversationId, msg.id);
      request
        .then(() => {
          refreshPinnedMessage();
          show(isPinned ? 'Message unpinned' : 'Message pinned', 'success');
        })
        .catch(() =>
          show(
            isPinned
              ? 'Failed to unpin message. Please try again.'
              : 'Failed to pin message. Please try again.',
            'error',
          ),
        );
    },
    [conversationId, canPinMessage, pinnedMessage?.messageId, refreshPinnedMessage, show],
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
      const senderLabel =
        conversation.participantProfiles?.find((p) => p.id === entry.senderId)?.displayName ??
        conversation.participantProfiles?.find((p) => p.id === entry.senderId)?.username ??
        'Member';
      return { ...entry, senderLabel };
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
    editMessage: hookEditMessage,
    toggleSaveInChat,
    sendVoiceMessage,
    handleSendVoice,
    handleDeleteMessage,
    handleUndoDelete,
    handleSendPendingAttachment: hookSendPendingAttachment,
    handleSendPendingDocument: hookSendPendingDocument,
    confirmation: conversationConfirmation,
    clearConfirmation: clearConversationConfirmation,
    unreadDividerIndex,
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
    setInput,
    setTypingInput,
    notifyStoppedTyping,
    replyTo,
    setReplyTo,
    editingMessage,
    setEditingMessage,
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
    if (editingMessage) {
      hookEditMessage(editingMessage.id, trimmed);
      setInput('');
      setEditingMessage(null);
      setMentionQuery(null);
      notifyStoppedTyping();
      return;
    }
    hookSendMessage(trimmed, replyTo, setTypingInput, setReplyTo);
    setMentionQuery(null);
    notifyStoppedTyping();
    if (conversationId) {
      track('message_sent', { conversation_id: conversationId, message_type: 'text' });
    }
  }, [input, hookSendMessage, hookEditMessage, replyTo, setTypingInput, setInput, setReplyTo, editingMessage, setEditingMessage, notifyStoppedTyping, sendPermission, conversationId]);

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
    () => {
      hookSendPendingDocument(pendingDocument, setPendingDocument);
    },
    [hookSendPendingDocument, pendingDocument, setPendingDocument],
  );

  // ─── Context menu + reactions ───────────────────────────────────────
  const [contextMenuVisible, setContextMenuVisible] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [descriptionDismissed, setDescriptionDismissed] = useState(false);
  const [forwardSheetVisible, setForwardSheetVisible] = useState(false);
  const [forwardingMessage, setForwardingMessage] = useState<Message | null>(null);

  // ── @mention suggestion state ──
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const cursorPositionRef = useRef(0);

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
    const query = extractMentionAtCursor(text, cursorPositionRef.current);
    setMentionQuery(query);
  }, [setTypingInput]);

  const handleMentionSelect = useCallback((candidate: MentionCandidate | { id: 'all'; displayName: string }) => {
    const handle = candidate.id === 'all' ? 'all' : (candidate as MentionCandidate).username ?? candidate.displayName;
    const currentInput = input;
    const cursor = cursorPositionRef.current;
    const beforeCursor = currentInput.substring(0, cursor);
    const atIdx = beforeCursor.lastIndexOf('@');
    if (atIdx === -1) return;
    const before = currentInput.substring(0, atIdx);
    const after = currentInput.substring(cursor);
    const newText = `${before}@${handle} ${after}`;
    setTypingInput(newText);
    setMentionQuery(null);
    haptic.selection();
  }, [input, setTypingInput, haptic]);

  // Reset dismissed state when switching groups
  useEffect(() => {
    setDescriptionDismissed(false);
  }, [groupId]);

  const handleMessageLongPress = useCallback((msg: Message) => {
    haptic.medium();
    setSelectedMessage(msg);
    setContextMenuVisible(true);
  }, [haptic]);

  // P2-03: mirror the backend edit window — sender's own text messages,
  // not deleted, within 15 minutes of send.
  const MESSAGE_EDIT_WINDOW_MS = 15 * 60 * 1000;
  const canEditSelectedMessage = Boolean(
    selectedMessage &&
      selectedMessage.sender === 'me' &&
      !selectedMessage.isDeleted &&
      Boolean(selectedMessage.text?.trim()) &&
      selectedMessage.status !== 'failed' &&
      selectedMessage.status !== 'sending' &&
      selectedMessage.status !== 'reconciling' &&
      Date.now() - new Date(selectedMessage.timestamp).getTime() < MESSAGE_EDIT_WINDOW_MS,
  );

  // Save in chat — confirmed, non-system messages may be saved by any
  // participant; in-flight/failed messages have no server row yet. Deleted
  // tombstones stay eligible only while the actor still has a save to
  // retract — the backend permits unsave on tombstones.
  const selectedMessageSavedByMe = Boolean(
    currentUser?.id && selectedMessage?.savedBy?.includes(currentUser.id),
  );
  const canSaveSelectedMessage = Boolean(
    selectedMessage &&
      !selectedMessage.isSystem &&
      selectedMessage.status !== 'sending' &&
      selectedMessage.status !== 'failed' &&
      selectedMessage.status !== 'reconciling' &&
      selectedMessage.status !== 'draft' &&
      (!selectedMessage.isDeleted || selectedMessageSavedByMe),
  );

  // Forward is only honest for payloads we can re-send faithfully —
  // offers, polls, documents and commerce cards have no cross-thread
  // send path, so the context menu must not offer it.
  const canForwardSelectedMessage = isForwardableMessage(selectedMessage);

  const handleContextAction = useCallback((action: MessageAction) => {
    if (!selectedMessage) return;
    switch (action) {
      case 'reply':
        setReplyTo(selectedMessage);
        break;
      case 'edit':
        setReplyTo(null);
        setEditingMessage(selectedMessage);
        setInput(selectedMessage.text ?? '');
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
      case 'save':
        toggleSaveInChat(selectedMessage);
        break;
      case 'pin':
        handlePinMessage(selectedMessage);
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
  }, [selectedMessage, conversationId, show, handleDeleteMessage, toggleSaveInChat, handlePinMessage, setReplyTo, setEditingMessage, setInput, setReactingToMessage, setForwardingMessage, setForwardSheetVisible, currentUser?.id]);

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
  // "New messages" divider — anchored to the first unread message id so
  // pagination prepends (and the search filter below) never move it.
  const { messageId: firstUnreadMessageId } = useUnreadDividerAnchor(
    conversationId,
    messages,
    unreadDividerIndex,
  );

  const displayMessages = useMemo(() => {
    if (!isSearchActive || !searchQuery.trim()) return messages;
    const q = searchQuery.trim().toLowerCase();
    // Search the full message payload — text/caption, poll question and
    // poll options — so media-with-caption and polls aren't silently
    // invisible to search.
    return messages.filter((m) => {
      const haystacks = [m.text, m.poll?.question, ...(m.poll?.options ?? [])];
      return haystacks.some((h) => (h ?? '').toLowerCase().includes(q));
    });
  }, [messages, isSearchActive, searchQuery]);

  // Date separators must key off the displayed list — when search filters
  // messages, indices into the full `messages` array no longer align with
  // `displayMessages`, so the hook-provided set would render dividers on
  // the wrong rows.
  const displayDateSeparators = useMemo(() => {
    const indices = new Set<number>();
    const dayKey = (d?: string) => {
      if (!d) return '';
      const parsed = parseMessageDate(d);
      if (!parsed) return d;
      return `${parsed.getFullYear()}-${parsed.getMonth()}-${parsed.getDate()}`;
    };
    for (let i = 0; i < displayMessages.length; i++) {
      if (i === 0) {
        indices.add(i);
        continue;
      }
      const prev = dayKey(displayMessages[i - 1]?.date);
      const curr = dayKey(displayMessages[i]?.date);
      if (curr && prev && curr !== prev) {
        indices.add(i);
      }
    }
    return indices;
  }, [displayMessages]);

  const renderMessage: ListRenderItem<Message> = useCallback(
    ({ item, index }) => {
      // Cluster + separator lookups key off `displayMessages` — the array
      // actually rendered — so the search filter can't desync them.
      const prev = displayMessages[index - 1];
      const next = displayMessages[index + 1];
      const isFirstInCluster = !prev || prev.senderId !== item.senderId;
      const isLastInCluster = !next || next.senderId !== item.senderId;
      const isAgent = item.isAgent === true;
      const replyParent = item.replyToMessageId
        ? messages.find((m) => m.id === item.replyToMessageId)
        : undefined;

      const dateSep = displayDateSeparators.has(index)
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
          {item.id === firstUnreadMessageId ? <UnreadMessagesDivider /> : null}
          {item.isDeleted ? (
            (() => {
              // A save placed before delete-for-everyone can still be
              // retracted — long-press opens a reduced menu (Unsave only)
              // while the actor still has a save row on this tombstone.
              const canUnsaveTombstone = Boolean(
                currentUser?.id && item.savedBy?.includes(currentUser.id),
              );
              const tombstoneBody = (
                <View
                  style={[
                    styles.tombstone,
                    item.sender === 'me' ? styles.tombstoneMe : styles.tombstoneThem,
                  ]}
                  accessibilityLabel={t('messaging.conversation.messageDeleted')}
                >
                  <AppIcon name="close-circle-outline" size="sm" color="textMuted" accessible={false} />
                  <Caption color={colors.textMuted} style={styles.tombstoneText}>
                    {item.sender === 'me'
                      ? t('messaging.conversation.youDeletedMessage')
                      : t('messaging.conversation.messageDeleted')}
                  </Caption>
                </View>
              );
              return canUnsaveTombstone ? (
                <Pressable onLongPress={() => handleMessageLongPress(item)}>
                  {tombstoneBody}
                </Pressable>
              ) : (
                tombstoneBody
              );
            })()
          ) : (
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
              isEdited={item.isEdited === true}
              isSaved={item.isSavedInChat === true}
            />
          </SwipeableMessage>
          )}
        </View>
      );
    },
    [styles.messageRow, messages, displayMessages, displayDateSeparators, firstUnreadMessageId, handleMessageLongPress, colors, setReactingToMessage, setReplyTo, currentUser?.id],
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
          isSearchActive={isSearchActive}
          searchValue={searchQuery}
          onSearchValueChange={setSearchQuery}
          onCloseSearch={() => {
            setIsSearchActive(false);
            setSearchQuery('');
          }}
          onSearch={() => setIsSearchActive(true)}
          onBack={() => navigation.goBack()}
          onInfo={() => navigation.navigate('GroupChatInfo', { conversationId: groupId })}
          onTitlePress={() => navigation.navigate('GroupChatInfo', { conversationId: groupId })}
        />

        {showLoading && <SkeletonChatLoader count={6} />}

        {showError && (
          <FlagshipState
            variant="error"
            title="Conversation unavailable"
            subtitle="This group could not be loaded."
            actionLabel="Retry"
            onAction={() => void syncMessagesFromApi()}
          />
        )}

        {!showLoading && !showError && (
          <>
            {conversation?.description && !descriptionDismissed ? (
              <GroupDescriptionBar
                description={conversation.description}
                onDismiss={() => setDescriptionDismissed(true)}
                onPress={() =>
                  navigation.navigate('GroupChatInfo', { conversationId: groupId })
                }
              />
            ) : null}
            {pinnedMessage ? (
              <PinnedMessageBar
                senderLabel={pinnedMessage.senderLabel}
                text={pinnedMessage.text}
                onPress={() => {
                  const idx = displayMessages.findIndex(
                    (m) => m.id === pinnedMessage.messageId,
                  );
                  if (idx >= 0) {
                    listRef.current?.scrollToIndex({ index: idx, animated: true });
                  }
                }}
              />
            ) : null}
            <FlashList
              style={{ backgroundColor: chatBackground }}
              ref={listRef}
              data={displayMessages}
              keyExtractor={keyExtractor}
              renderItem={renderMessage}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              onScroll={hookHandleMessageListScroll}
              onContentSizeChange={scheduleScrollToEnd}
              ListEmptyComponent={
                <View style={styles.centerState}>
                  <AppIcon
                    name={isSearchActive && searchQuery.trim() ? 'search' : 'inbox'}
                    size="hero"
                    color="textMuted"
                    accessible={false}
                  />
                  <BodyEmphasis color={colors.textPrimary} style={styles.stateTitle}>
                    {isSearchActive && searchQuery.trim()
                      ? 'No matching messages'
                      : 'No messages yet'}
                  </BodyEmphasis>
                  <Caption color={colors.textMuted} style={styles.stateCaption}>
                    {isSearchActive && searchQuery.trim()
                      ? `Nothing matches “${searchQuery.trim()}”.`
                      : 'Start the conversation'}
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

              {editingMessage ? (
                <ReplyQuote
                  senderName={t('messaging.conversation.editMessage')}
                  text={editingMessage.text ?? ''}
                  onClose={() => {
                    setEditingMessage(null);
                    setInput('');
                  }}
                  style={styles.replyQuote}
                />
              ) : replyTo ? (
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
                  <AppIcon
                    name={sendPermission === 'restricted' ? 'lock' : 'cloud-offline-outline'}
                    size="sm"
                    color="textMuted"
                    accessible={false}
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
                onSelectionChange={(e) => {
                  cursorPositionRef.current = e.nativeEvent.selection.end;
                }}
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
          hideDocument
          onSelect={(action) => {
            if (action === "gallery" || action === "camera" || action === "location") {
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
          canEdit={canEditSelectedMessage}
          canSave={canSaveSelectedMessage}
          isSaved={selectedMessageSavedByMe}
          isDeleted={selectedMessage?.isDeleted === true}
          canForward={canForwardSelectedMessage}
          canPin={canPinMessage}
          isPinned={Boolean(
            selectedMessage && pinnedMessage?.messageId === selectedMessage.id,
          )}
        />

        <ForwardSheet
          visible={forwardSheetVisible}
          conversations={conversations.filter((c) => c.id !== conversationId)}
          currentConversationId={conversationId}
          onForward={(targetConversationId) => {
            const msg = forwardingMessage;
            setForwardSheetVisible(false);
            setForwardingMessage(null);
            if (!msg) return;
            // Defence in depth: never claim success for a payload we
            // can't deliver — media/voice/listing/text are preserved,
            // everything else is refused outright.
            if (!isForwardableMessage(msg)) {
              show("This message can't be forwarded", 'error');
              return;
            }
            forwardMessageToConversation(targetConversationId, msg, currentUser?.id)
              .then(() => show('Message forwarded', 'success'))
              .catch(() => show('Failed to forward message', 'error'));
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
    tombstone: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      maxWidth: '78%',
      paddingHorizontal: Space.smMd,
      paddingVertical: Space.sm - 1,
      borderRadius: Radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: colors.surfaceAlt },
    tombstoneMe: {
      alignSelf: 'flex-end' },
    tombstoneThem: {
      alignSelf: 'flex-start' },
    tombstoneText: {
      fontStyle: 'italic' },
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
  });
