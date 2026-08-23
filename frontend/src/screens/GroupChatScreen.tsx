/**
 * GroupChatScreen — dedicated multi-user group chat surface (group buying,
 * co-own coordination, seller broadcasts).
 *
 * Reuses the existing chat primitives (ChatTopBar, MessageBubble,
 * ChatComposerBar) and adds:
 *  - AI agent deployment via ChatAgentPicker
 *  - SuggestedRepliesBar above the input when an agent is active
 *  - Group info modal (members, settings, leave group)
 *  - Loading / empty / error states
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
  Modal,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { FlashList, type ListRenderItem, type FlashListRef } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import { RootStackParamList } from '../navigation/types';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { useStore } from '../store/useStore';
import { makeStableId, createStableId } from '../utils/createStableId';
import { useHaptic } from '../hooks/useHaptic';
import { useToast } from '../context/ToastContext';
import { KeyboardStickyView } from '../platform/keyboard/KeyboardProvider';
import { Space, Radius, Type, TypeStyles, Control } from '../theme/designTokens';

import { ChatTopBar } from '../components/chat/ChatTopBar';
import { MessageBubble } from '../components/chat/MessageBubble';
import { ChatComposerBar } from '../components/chat/ChatComposerBar';
import { ChatAgentPicker } from '../components/chat/ChatAgentPicker';
import { SuggestedRepliesBar } from '../components/chat/SuggestedRepliesBar';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { Caption, Body, BodyEmphasis, Meta } from '../components/ui/Text';
import { SkeletonChatLoader } from '../components/chat/SkeletonChatLoader';
import { TypingIndicator } from '../components/chat/TypingIndicator';
import { MessageContextMenu, type MessageAction } from '../components/chat/MessageContextMenu';
import { EmojiReactionsBar, type EmojiReaction } from '../components/chat/EmojiReactionsBar';
import { ReplyQuote } from '../components/chat/ReplyQuote';
import * as Clipboard from 'expo-clipboard';

import {
  deployAgent,
  removeAgent,
  getDeployedAgents,
  getAgentSuggestions,
  getAgentResponse,
  type ChatAgent,
  type SuggestedReply,
} from '../services/chatAgentsApi';
import {
  deleteConversationOnApi,
  leaveGroupOnApi,
  sendConversationMessageOnApi,
  fetchConversationMessagesFromApi,
  setTypingStatus,
  deleteConversationMessageOnApi,
} from '../services/chatApi';
import { useChatMessageEvent, realtimePayloadToMessage } from '../services/realtimeClient';
import type { Message as ConversationMessage } from '../domain';

type Props = NativeStackScreenProps<RootStackParamList, 'GroupChat'>;

type LoadState = 'loading' | 'ready' | 'error';

/** Map domain MessageReaction[] to the EmojiReaction shape MessageBubble /
 *  EmojiReactionsBar consume. `currentUserId` decides reactedByMe. */
function toEmojiReactions(
  reactions: { emoji: string; userIds: string[] }[] | undefined,
  currentUserId: string,
): EmojiReaction[] | undefined {
  if (!reactions || reactions.length === 0) return undefined;
  return reactions.map((r) => ({
    emoji: r.emoji,
    count: r.userIds.length,
    reactedByMe: r.userIds.includes(currentUserId),
  }));
}

interface GroupMessage {
  id: string;
  text: string;
  senderId: string;
  senderLabel: string;
  isMe: boolean;
  timestamp: string;
  reactions?: EmojiReaction[];
  replyToMessageId?: string;
}

export default function GroupChatScreen({ navigation, route }: Props) {
  const { groupId, groupName } = route.params;
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const haptic = useHaptic();
  const { show } = useToast();

  const conversations = useStore((state) => state.conversations);
  const currentUser = useStore((state) => state.currentUser);
  const appendConversationMessage = useStore((state) => state.appendConversationMessage);
  const deleteConversation = useStore((state) => state.deleteConversation);
  const addMessageReaction = useStore((state) => state.addMessageReaction);
  const removeMessageReaction = useStore((state) => state.removeMessageReaction);

  const conversation = useMemo(
    () => conversations.find((item) => item.id === groupId),
    [conversations, groupId],
  );

  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [infoVisible, setInfoVisible] = useState(false);
  const [agentPickerVisible, setAgentPickerVisible] = useState(false);
  const [deployedAgents, setDeployedAgents] = useState<ChatAgent[]>([]);
  const [suggestions, setSuggestions] = useState<SuggestedReply[]>([]);
  const [isLeaving, setIsLeaving] = useState(false);

  // Long-press context menu, emoji reactions, and reply-to state — mirror
  // the ChatScreen wiring so group messages behave like DMs.
  const [contextMenuVisible, setContextMenuVisible] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<GroupMessage | null>(null);
  const [reactingToMessage, setReactingToMessage] = useState<GroupMessage | null>(null);
  const [replyTo, setReplyTo] = useState<GroupMessage | null>(null);

  // Typing publisher — debounced "started typing" (1s) and auto-clear after
  // 3s of inactivity. Publishes to the backend via setTypingStatus so other
  // participants' clients can light up a typing indicator once realtime
  // push is wired. The local isTyping flag also drives the header subtitle.
  const [isTyping, setIsTyping] = useState(false);
  const typingStartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const listRef = useRef<FlashListRef<GroupMessage>>(null);

  // Resolve messages from the store conversation (if present) and fetch
  // the latest messages from the backend so the screen reflects real state.
  useEffect(() => {
    if (!conversation) {
      const timer = setTimeout(() => setLoadState('error'), 600);
      return () => clearTimeout(timer);
    }
    const conv = conversation; // non-optional capture for async closure
    let cancelled = false;

    async function loadFromApi() {
      try {
        const apiMessages = await fetchConversationMessagesFromApi(groupId);
        if (cancelled) return;
        const mapped: GroupMessage[] = apiMessages
          .filter((m) => !m.isSystem)
          .map((m) => ({
            id: m.id,
            text: m.text ?? '',
            senderId: m.senderId,
            senderLabel:
              conv.participantProfiles?.find((p) => p.id === m.senderId)?.displayName ??
              conv.participantProfiles?.find((p) => p.id === m.senderId)?.username ??
              'Member',
            isMe: m.senderId === currentUser?.id,
            timestamp: m.timestamp,
            reactions: toEmojiReactions(m.reactions, currentUser?.id ?? 'me'),
            replyToMessageId: m.replyToMessageId,
          }));
        setMessages(mapped);
        setLoadState('ready');
      } catch {
        if (cancelled) return;
        const storeMapped: GroupMessage[] = (conv.messages ?? [])
          .filter((m) => !m.isSystem)
          .map((m) => ({
            id: m.id,
            text: m.text ?? '',
            senderId: m.senderId,
            senderLabel:
              conv.participantProfiles?.find((p) => p.id === m.senderId)?.displayName ??
              conv.participantProfiles?.find((p) => p.id === m.senderId)?.username ??
              'Member',
            isMe: m.senderId === currentUser?.id,
            timestamp: m.timestamp,
            reactions: toEmojiReactions(m.reactions, currentUser?.id ?? 'me'),
            replyToMessageId: m.replyToMessageId,
          }));
        setMessages(storeMapped);
        setLoadState('ready');
      }
    }

    void loadFromApi();
    return () => { cancelled = true; };
  }, [conversation, currentUser?.id, groupId]);

  // Sync deployed agents from the demo service on mount.
  useEffect(() => {
    setDeployedAgents(getDeployedAgents(groupId));
  }, [groupId]);

  // Realtime subscription — append incoming group messages live.
  // useChatMessageEvent subscribes to the group's conversation topic and
  // invokes the handler for each `chat.message.created` event. The handler
  // deduplicates by id, maps the payload to the GroupMessage shape, and
  // appends to both local state and the conversation store.
  useChatMessageEvent(
    groupId,
    useCallback(
      (payload) => {
        // Deduplicate — the server may replay events after a reconnect and
        // the optimistic local send already inserted by id.
        setMessages((prev) => {
          if (prev.some((m) => m.id === payload.id)) return prev;

          const domainMessage = realtimePayloadToMessage(payload, currentUser?.id);
          const senderProfile = conversation?.participantProfiles?.find(
            (p) => p.id === domainMessage.senderId,
          );
          const groupMessage: GroupMessage = {
            id: domainMessage.id,
            text: domainMessage.text ?? '',
            senderId: domainMessage.senderId,
            senderLabel:
              senderProfile?.displayName ??
              senderProfile?.username ??
              'Member',
            isMe: Boolean(currentUser?.id && domainMessage.senderId === currentUser.id),
            timestamp: domainMessage.timestamp,
          };

          // Persist into the conversation store so the inbox preview and
          // hydration stay in sync.
          if (conversation) {
            appendConversationMessage(conversation.id, domainMessage);
          }

          return [...prev, groupMessage];
        });
      },
      [conversation, currentUser?.id, appendConversationMessage],
    ),
  );

  // Publish typing state to the backend whenever it transitions. The
  // backend fans the event out to other participants via the conversation's
  // realtime topic; receiving clients light up a typing indicator.
  useEffect(() => {
    setTypingStatus(groupId, isTyping).catch(() => undefined);
  }, [groupId, isTyping]);

  // Composer input wrapper — debounces "started typing" (1s) and auto-clears
  // "stopped typing" after 3s of inactivity, matching the DM composer hook.
  const handleInputChange = useCallback((value: string) => {
    setInput(value);
    if (typingStopTimerRef.current) {
      clearTimeout(typingStopTimerRef.current);
      typingStopTimerRef.current = null;
    }
    if (value.length > 0) {
      if (!typingStartTimerRef.current) {
        typingStartTimerRef.current = setTimeout(() => {
          typingStartTimerRef.current = null;
          setIsTyping(true);
        }, 1000);
      }
    } else {
      if (typingStartTimerRef.current) {
        clearTimeout(typingStartTimerRef.current);
        typingStartTimerRef.current = null;
      }
      setIsTyping(false);
    }
  }, []);

  // Immediate stop — used by the send path so the indicator clears the
  // moment a message is sent, not 3s later.
  const notifyStoppedTyping = useCallback(() => {
    if (typingStartTimerRef.current) {
      clearTimeout(typingStartTimerRef.current);
      typingStartTimerRef.current = null;
    }
    if (typingStopTimerRef.current) {
      clearTimeout(typingStopTimerRef.current);
      typingStopTimerRef.current = null;
    }
    setIsTyping(false);
  }, []);

  // Clear typing timers on unmount.
  useEffect(() => {
    return () => {
      if (typingStartTimerRef.current) clearTimeout(typingStartTimerRef.current);
      if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
    };
  }, []);

  const memberCount = conversation?.participantIds?.length ?? 0;
  const memberProfiles = conversation?.participantProfiles ?? [];

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      try {
        listRef.current?.scrollToEnd({ animated: true });
      } catch {
        /* list may not have laid out yet */
      }
    });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages.length, scrollToBottom]);

  const refreshSuggestions = useCallback(
    (lastMessage: string) => {
      const next = getAgentSuggestions(groupId, lastMessage);
      setSuggestions(next);
    },
    [groupId],
  );

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed) return;

    setSending(true);
    haptic.light();
    notifyStoppedTyping();

    const repliedToId = replyTo?.id;
    const localId = makeStableId('g', 7);
    // P0-MSG-2: stable clientMessageId so a retried send replays the original
    // server message instead of duplicating it.
    const clientMessageId = createStableId('cmsg');
    const optimistic: GroupMessage = {
      id: localId,
      text: trimmed,
      senderId: currentUser?.id ?? 'me',
      senderLabel: currentUser?.username ?? 'you',
      isMe: true,
      timestamp: new Date().toISOString(),
      replyToMessageId: repliedToId,
    };

    // Optimistic update — show the message immediately.
    setMessages((prev) => [...prev, optimistic]);
    setInput('');
    setReplyTo(null);

    // Send to backend. On success, replace the optimistic message with
    // the server-confirmed one. On failure, show a toast and remove the
    // optimistic message so the user knows it wasn't sent.
    const conversationId = conversation?.id ?? groupId;
    sendConversationMessageOnApi(conversationId, trimmed, undefined, clientMessageId)
      .then((serverMessage) => {
        setMessages((prev) =>
          prev.map((m) => (m.id === localId ? {
            ...m,
            id: serverMessage.id,
            timestamp: serverMessage.timestamp,
          } : m)),
        );
        if (conversation) {
          const storeMessage: ConversationMessage = {
            id: serverMessage.id,
            senderId: currentUser?.id ?? 'me',
            text: trimmed,
            timestamp: serverMessage.timestamp,
            type: 'text',
            sender: 'me',
          };
          appendConversationMessage(conversation.id, storeMessage);
        }
        setSending(false);

        // If an agent is deployed, surface an agent response (demo).
        if (deployedAgents.length > 0) {
          setTimeout(() => {
            const agentResponse = getAgentResponse(groupId, trimmed);
            if (!agentResponse.content) return;
            const agentMsg: GroupMessage = {
              id: agentResponse.id,
              text: agentResponse.content,
              senderId: agentResponse.agentId,
              senderLabel: deployedAgents[0]?.name ?? 'AI Agent',
              isMe: false,
              timestamp: agentResponse.createdAt,
            };
            setMessages((prev) => [...prev, agentMsg]);
            refreshSuggestions(agentResponse.content);
          }, 500);
        }
      })
      .catch(() => {
        // Remove the optimistic message — the send failed.
        setMessages((prev) => prev.filter((m) => m.id !== localId));
        show('Failed to send message. Please try again.', 'error');
        setSending(false);
      });

    refreshSuggestions(trimmed);
  }, [input, haptic, currentUser, conversation, appendConversationMessage, deployedAgents, groupId, refreshSuggestions, show, notifyStoppedTyping, replyTo]);

  const handleSelectSuggestion = useCallback(
    (reply: SuggestedReply) => {
      haptic.selection();
      setInput(reply.text);
    },
    [haptic],
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

  // Long-press opens the context menu for the tapped message.
  const handleMessageLongPress = useCallback((msg: GroupMessage) => {
    haptic.medium();
    setSelectedMessage(msg);
    setContextMenuVisible(true);
  }, [haptic]);

  // Context menu action dispatch — reply, copy, react, delete, report.
  // Forward is not yet supported by the shared MessageContextMenu component.
  const handleContextAction = useCallback((action: MessageAction) => {
    if (!selectedMessage) return;
    switch (action) {
      case 'reply':
        setReplyTo(selectedMessage);
        break;
      case 'copy':
        Clipboard.setStringAsync(selectedMessage.text);
        show('Copied', 'success');
        break;
      case 'react':
        setReactingToMessage(selectedMessage);
        break;
      case 'delete': {
        const targetId = selectedMessage.id;
        setMessages((prev) => prev.filter((m) => m.id !== targetId));
        const conversationId = conversation?.id ?? groupId;
        deleteConversationMessageOnApi(conversationId, targetId).catch(() => undefined);
        haptic.warning();
        show('Message deleted', 'info');
        break;
      }
      case 'report':
        show('Reported for review', 'info');
        break;
      default:
        break;
    }
  }, [selectedMessage, conversation, groupId, haptic, show]);

  // Emoji reaction toggle — add or remove based on reactedByMe. Updates
  // both the conversation store and local message state so the bubble
  // reaction chips reflect the change immediately.
  const handleReact = useCallback((emoji: string) => {
    const msg = reactingToMessage;
    if (!msg) return;
    const conversationId = conversation?.id ?? groupId;
    const existing = msg.reactions?.find((r) => r.emoji === emoji);
    if (existing?.reactedByMe) {
      removeMessageReaction(conversationId, msg.id, emoji);
    } else {
      addMessageReaction(conversationId, msg.id, emoji);
    }
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== msg.id) return m;
        const reactions = [...(m.reactions ?? [])];
        const idx = reactions.findIndex((r) => r.emoji === emoji);
        if (idx >= 0) {
          const r = reactions[idx];
          if (r.reactedByMe) {
            const nextCount = r.count - 1;
            if (nextCount <= 0) {
              reactions.splice(idx, 1);
            } else {
              reactions[idx] = { ...r, count: nextCount, reactedByMe: false };
            }
          } else {
            reactions[idx] = { ...r, count: r.count + 1, reactedByMe: true };
          }
        } else {
          reactions.push({ emoji, count: 1, reactedByMe: true });
        }
        return { ...m, reactions };
      }),
    );
    setReactingToMessage(null);
    haptic.light();
  }, [reactingToMessage, conversation, groupId, addMessageReaction, removeMessageReaction, haptic]);

  const renderMessage: ListRenderItem<GroupMessage> = useCallback(
    ({ item, index }) => {
      const prev = messages[index - 1];
      const next = messages[index + 1];
      const isFirstInCluster = !prev || prev.senderId !== item.senderId;
      const isLastInCluster = !next || next.senderId !== item.senderId;
      const isAgent = deployedAgents.some((agent) => agent.id === item.senderId);
      // Resolve the replied-to message for the in-bubble quote.
      const replyParent = item.replyToMessageId
        ? messages.find((m) => m.id === item.replyToMessageId)
        : undefined;
      return (
        <View style={styles.messageRow}>
          <MessageBubble
            text={item.text}
            isMe={item.isMe}
            senderLabel={isAgent ? `${item.senderLabel} · AI` : item.senderLabel}
            timestamp={item.timestamp}
            isFirstInCluster={isFirstInCluster}
            isLastInCluster={isLastInCluster}
            showAvatar={!item.isMe && isLastInCluster}
            reactions={item.reactions}
            replyTo={
              replyParent
                ? { senderName: replyParent.senderLabel, text: replyParent.text }
                : null
            }
            onLongPress={() => handleMessageLongPress(item)}
            onReactionPress={() => setReactingToMessage(item)}
          />
        </View>
      );
    },
    [deployedAgents, styles.messageRow, messages, handleMessageLongPress],
  );

  const keyExtractor = useCallback((item: GroupMessage) => item.id, []);

  // Header subtitle — shows "typing…" while the current user is composing.
  // Other-members typing will replace this once realtime typing push is wired.
  const headerSubtitle = isTyping
    ? 'typing…'
    : `${memberCount} members${deployedAgents.length > 0 ? ` · ${deployedAgents.length} AI` : ''}`;

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

        {/* AI agent chips — one per deployed agent, tap to remove.
            Mirrors the ChatScreen chip pattern: avatar glyph + name + close. */}
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
                    { backgroundColor: pressed ? colors.surface : `${colors.brand}14` },
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

        {loadState === 'loading' && (
          <SkeletonChatLoader count={6} />
        )}

        {loadState === 'error' && (
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
              onPress={() => {
                setLoadState('loading');
                setTimeout(() => setLoadState(conversation ? 'ready' : 'error'), 400);
              }}
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

        {loadState === 'ready' && (
          <>
            <FlashList
              ref={listRef}
              data={messages}
              keyExtractor={keyExtractor}
              renderItem={renderMessage}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              onContentSizeChange={scrollToBottom}
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
            />

            <KeyboardStickyView style={styles.composerWrap}>
              {replyTo ? (
                <ReplyQuote
                  senderName={replyTo.senderLabel}
                  text={replyTo.text}
                  onClose={() => setReplyTo(null)}
                  style={styles.replyQuote}
                />
              ) : null}

              {reactingToMessage ? (
                <EmojiReactionsBar
                  reactions={reactingToMessage.reactions ?? []}
                  onReact={handleReact}
                  style={styles.reactionsBar}
                />
              ) : null}

              {isTyping ? (
                <View style={styles.typingRow}>
                  <TypingIndicator dotColor={colors.textMuted} dotSize={6} />
                  <Caption color={colors.textMuted}>typing…</Caption>
                </View>
              ) : null}

              {deployedAgents.length > 0 && suggestions.length > 0 && input.trim().length === 0 && (
                <SuggestedRepliesBar suggestions={suggestions} onSelect={handleSelectSuggestion} />
              )}

              <ChatComposerBar
                value={input}
                onChangeText={handleInputChange}
                onSend={handleSend}
                placeholder="Message the group…"
                isSending={sending}
              />

              {/* Add AI Agent entry point — sits as a subtle action above the input row */}
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
        />

        <MessageContextMenu
          visible={contextMenuVisible}
          onClose={() => setContextMenuVisible(false)}
          onAction={handleContextAction}
          messageText={selectedMessage?.text}
          isOwnMessage={selectedMessage?.isMe}
        />

        {/* GroupInfoModal retired — group info now lives in the dedicated
            GroupChatInfoScreen (tabbed Members / Media / Settings surface).
            The modal component is retained below for reference but no longer rendered. */}
        {/*
        <GroupInfoModal
          visible={infoVisible}
          onClose={() => setInfoVisible(false)}
          groupName={groupName}
          memberProfiles={memberProfiles}
          memberCount={memberCount}
          deployedAgents={deployedAgents}
          isLeaving={isLeaving}
          onLeaveGroup={() => {
            Alert.alert(
              'Leave group?',
              "You'll no longer receive messages from this group.",
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Leave group',
                  style: 'destructive',
                  onPress: async () => {
                    if (!currentUser?.id) {
                      show('Could not leave group. Try again.', 'error');
                      return;
                    }
                    haptic.warning();
                    setIsLeaving(true);
                    try {
                      await leaveGroupOnApi(groupId, currentUser.id);
                      deleteConversation(groupId);
                      setInfoVisible(false);
                      show('Left group', 'info');
                      navigation.goBack();
                    } catch {
                      show('Could not leave group. Try again.', 'error');
                    } finally {
                      setIsLeaving(false);
                    }
                  },
                },
              ],
            );
          }}
          onManageAgents={() => {
            setInfoVisible(false);
            setAgentPickerVisible(true);
          }}
        />
        */}
      </View>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Group info modal — members, settings, leave group
// ---------------------------------------------------------------------------
function GroupInfoModal({
  visible,
  onClose,
  groupName,
  memberProfiles,
  memberCount,
  deployedAgents,
  isLeaving,
  onLeaveGroup,
  onManageAgents,
}: {
  visible: boolean;
  onClose: () => void;
  groupName: string;
  memberProfiles: Array<{ id: string; username: string; displayName?: string | null; avatar?: string | null }>;
  memberCount: number;
  deployedAgents: ChatAgent[];
  isLeaving: boolean;
  onLeaveGroup: () => void;
  onManageAgents: () => void;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[styles.sheet, { backgroundColor: colors.surface }]}
          accessibilityLabel="Group info sheet"
        >
          <View style={[styles.handle, { backgroundColor: colors.border }]} />

          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]} numberOfLines={1}>
              {groupName}
            </Text>
            <Text style={[styles.modalSubtitle, { color: colors.textMuted }]}>
              {memberCount} member{memberCount === 1 ? '' : 's'}
            </Text>
          </View>

          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent} showsVerticalScrollIndicator={false}>
            {deployedAgents.length > 0 && (
              <View style={styles.modalSection}>
                <Meta color={colors.textMuted} style={styles.sectionLabel}>
                  AI AGENTS
                </Meta>
                {deployedAgents.map((agent) => (
                  <View key={agent.id} style={[styles.memberRow, { backgroundColor: colors.surfaceAlt }]}>
                    <View style={[styles.memberIcon, { backgroundColor: `${colors.brand}14` }]}>
                      <Ionicons name={agent.avatar as keyof typeof Ionicons.glyphMap} size={18} color={colors.brand} />
                    </View>
                    <View style={styles.memberText}>
                      <BodyEmphasis numberOfLines={1}>{agent.name}</BodyEmphasis>
                      <Caption color={colors.textMuted} numberOfLines={1}>{agent.description}</Caption>
                    </View>
                  </View>
                ))}
                <AnimatedPressable
                  style={[styles.manageAgentsBtn, { borderColor: colors.border }]}
                  onPress={onManageAgents}
                  activeOpacity={0.7}
                  scaleValue={0.97}
                  hapticFeedback="light"
                  accessibilityRole="button"
                  accessibilityLabel="Manage AI agents"
                >
                  <Text style={[styles.manageAgentsText, { color: colors.textPrimary }]}>Manage AI agents</Text>
                </AnimatedPressable>
              </View>
            )}

            <View style={styles.modalSection}>
              <Meta color={colors.textMuted} style={styles.sectionLabel}>
                MEMBERS
              </Meta>
              {memberProfiles.length === 0 ? (
                <Caption color={colors.textMuted} style={styles.emptyMembers}>
                  Member list unavailable
                </Caption>
              ) : (
                memberProfiles.map((member) => (
                  <View key={member.id} style={[styles.memberRow, { backgroundColor: colors.surfaceAlt }]}>
                    <View style={[styles.memberIcon, { backgroundColor: colors.surface }]}>
                      <Ionicons name="person" size={16} color={colors.textSecondary} />
                    </View>
                    <View style={styles.memberText}>
                      <BodyEmphasis numberOfLines={1}>
                        {member.displayName ?? member.username}
                      </BodyEmphasis>
                      <Caption color={colors.textMuted} numberOfLines={1}>@{member.username}</Caption>
                    </View>
                  </View>
                ))
              )}
            </View>
          </ScrollView>

          <Pressable
            style={[styles.leaveBtn, { borderColor: colors.danger }, isLeaving && styles.leaveBtnDisabled]}
            onPress={onLeaveGroup}
            disabled={isLeaving}
            accessibilityRole="button"
            accessibilityLabel="Leave group"
            accessibilityHint="Removes you from this group conversation"
            accessibilityState={{ disabled: isLeaving }}
          >
            {isLeaving ? (
              <ActivityIndicator size="small" color={colors.danger} />
            ) : (
              <Text style={[styles.leaveBtnText, { color: colors.danger }]}>Leave group</Text>
            )}
          </Pressable>

          <Pressable
            style={[styles.cancelBtn, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close group info"
          >
            <Text style={[styles.cancelText, { color: colors.textPrimary }]}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    screenRoot: {
      flex: 1,
      backgroundColor: colors.background,
    },
    agentChipsRow: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      paddingVertical: Space.xs,
    },
    agentChipsContent: {
      paddingHorizontal: Space.md,
      gap: Space.xs,
      alignItems: 'center',
    },
    agentChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingHorizontal: Space.sm,
      paddingVertical: Space.xs,
      borderRadius: Radius.lg,
    },
    agentChipText: {
      fontSize: Type.meta.size,
      lineHeight: Type.meta.lineHeight,
      fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    },
    centerState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: Space.xs + 2,
      paddingHorizontal: Space.xl,
      paddingBottom: Space.xl,
    },
    stateTitle: {
      textAlign: 'center',
    },
    stateCaption: {
      textAlign: 'center',
    },
    retryBtn: {
      paddingHorizontal: Space.lg,
      paddingVertical: Space.sm,
      borderRadius: Radius.md,
      minHeight: Control.hit,
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: Space.xs,
    },
    retryBtnText: {
      fontSize: Type.body.size,
      lineHeight: Type.body.lineHeight,
      fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    },
    listContent: {
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      flexGrow: 1,
    },
    messageRow: {
      marginVertical: 2,
    },
    composerWrap: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    replyQuote: {
      marginHorizontal: Space.md,
      marginTop: Space.sm,
    },
    reactionsBar: {
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
    },
    typingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingHorizontal: Space.md,
      paddingVertical: Space.xs,
    },
    addAgentContainer: {
      alignItems: 'center',
      paddingVertical: Space.sm,
      paddingBottom: Space.md,
    },
    addAgentRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Space.xs,
      paddingVertical: Space.xs,
    },
    addAgentText: {
      fontSize: Type.caption.size,
      lineHeight: Type.caption.lineHeight,
      fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    },
    addAgentDescription: {
      textAlign: 'center',
      marginTop: Space.xs,
      paddingHorizontal: Space.lg,
    },
    overlay: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: 'flex-end',
    },
    sheet: {
      borderTopLeftRadius: Radius.xl,
      borderTopRightRadius: Radius.xl,
      paddingHorizontal: Space.md,
      paddingTop: Space.sm,
      paddingBottom: Space.xxl,
      gap: Space.md,
      maxHeight: '85%',
    },
    handle: {
      width: Control.chrome,
      height: Space.xs,
      borderRadius: Radius.full,
      alignSelf: 'center',
      marginBottom: Space.sm,
    },
    modalHeader: {
      marginBottom: Space.xs,
    },
    modalTitle: {
      fontSize: Type.subtitle.size,
      lineHeight: Type.subtitle.lineHeight,
      fontFamily: TypeStyles.bodyEmphasis.fontFamily,
      letterSpacing: Type.subtitle.letterSpacing,
    },
    modalSubtitle: {
      fontSize: Type.caption.size,
      lineHeight: Type.caption.lineHeight,
      fontFamily: TypeStyles.body.fontFamily,
      marginTop: Space.xs / 2,
    },
    modalScroll: {
      flexGrow: 0,
    },
    modalScrollContent: {
      gap: Space.md,
    },
    modalSection: {
      gap: Space.sm,
    },
    sectionLabel: {
      letterSpacing: Type.label.letterSpacing,
    },
    memberRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingVertical: Space.sm,
      paddingHorizontal: Space.sm + 2,
      borderRadius: Radius.lg,
    },
    memberIcon: {
      width: Control.chrome,
      height: Control.chrome,
      borderRadius: Radius.full,
      justifyContent: 'center',
      alignItems: 'center',
    },
    memberText: {
      flex: 1,
      gap: Space.xs / 4,
    },
    emptyMembers: {
      paddingVertical: Space.sm,
    },
    manageAgentsBtn: {
      borderRadius: Radius.lg,
      paddingVertical: Space.sm + 2,
      alignItems: 'center',
      borderWidth: StyleSheet.hairlineWidth,
      minHeight: Control.hit,
      justifyContent: 'center',
    },
    manageAgentsText: {
      fontSize: Type.body.size,
      lineHeight: Type.body.lineHeight,
      fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    },
    leaveBtn: {
      borderRadius: Radius.lg,
      paddingVertical: Space.md + 2,
      alignItems: 'center',
      borderWidth: StyleSheet.hairlineWidth,
      minHeight: Control.hit,
      justifyContent: 'center',
    },
    leaveBtnDisabled: {
      opacity: 0.6,
    },
    leaveBtnText: {
      fontSize: Type.body.size,
      lineHeight: Type.body.lineHeight,
      fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    },
    cancelBtn: {
      borderRadius: Radius.lg,
      paddingVertical: Space.md + 2,
      alignItems: 'center',
      borderWidth: StyleSheet.hairlineWidth,
      minHeight: Control.hit,
      justifyContent: 'center',
    },
    cancelText: {
      fontSize: Type.body.size,
      lineHeight: Type.body.lineHeight,
      fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    },
  });
