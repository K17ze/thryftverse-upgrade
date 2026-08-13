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
} from 'react-native';
import { FlashList, type ListRenderItem, type FlashListRef } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import { RootStackParamList } from '../navigation/types';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { useStore } from '../store/useStore';
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

import {
  deployAgent,
  removeAgent,
  getDeployedAgents,
  getAgentSuggestions,
  getAgentResponse,
  type ChatAgent,
  type SuggestedReply,
} from '../services/chatAgentsApi';
import type { Message as ConversationMessage } from '../data/mockData';

type Props = NativeStackScreenProps<RootStackParamList, 'GroupChat'>;

type LoadState = 'loading' | 'ready' | 'error';

interface GroupMessage {
  id: string;
  text: string;
  senderId: string;
  senderLabel: string;
  isMe: boolean;
  timestamp: string;
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

  const listRef = useRef<FlashListRef<GroupMessage>>(null);

  // Resolve messages from the store conversation (if present).
  useEffect(() => {
    if (!conversation) {
      // Allow a brief loading window; if still missing, show error state.
      const timer = setTimeout(() => setLoadState('error'), 600);
      return () => clearTimeout(timer);
    }
    const mapped: GroupMessage[] = (conversation.messages ?? [])
      .filter((m) => !m.isSystem)
      .map((m) => ({
        id: m.id,
        text: m.text ?? '',
        senderId: m.senderId,
        senderLabel:
          conversation.participantProfiles?.find((p) => p.id === m.senderId)?.displayName ??
          conversation.participantProfiles?.find((p) => p.id === m.senderId)?.username ??
          'Member',
        isMe: m.senderId === currentUser?.id,
        timestamp: m.timestamp,
      }));
    setMessages(mapped);
    setLoadState('ready');
  }, [conversation, currentUser?.id]);

  // Sync deployed agents from the demo service on mount.
  useEffect(() => {
    setDeployedAgents(getDeployedAgents(groupId));
  }, [groupId]);

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

    const localId = `g_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const outgoing: GroupMessage = {
      id: localId,
      text: trimmed,
      senderId: currentUser?.id ?? 'me',
      senderLabel: currentUser?.username ?? 'you',
      isMe: true,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, outgoing]);
    setInput('');

    // Persist into the store conversation so it survives navigation.
    if (conversation) {
      const storeMessage: ConversationMessage = {
        id: localId,
        senderId: currentUser?.id ?? 'me',
        text: trimmed,
        timestamp: outgoing.timestamp,
        type: 'text',
        sender: 'me',
      };
      appendConversationMessage(conversation.id, storeMessage);
    }

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
        setSending(false);
      }, 500);
    } else {
      setSending(false);
    }

    refreshSuggestions(trimmed);
  }, [input, haptic, currentUser, conversation, appendConversationMessage, deployedAgents, groupId, refreshSuggestions]);

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

  const renderMessage: ListRenderItem<GroupMessage> = useCallback(
    ({ item, index }) => {
      const prev = messages[index - 1];
      const next = messages[index + 1];
      const isFirstInCluster = !prev || prev.senderId !== item.senderId;
      const isLastInCluster = !next || next.senderId !== item.senderId;
      const isAgent = deployedAgents.some((agent) => agent.id === item.senderId);
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
          />
        </View>
      );
    },
    [deployedAgents, styles.messageRow],
  );

  const keyExtractor = useCallback((item: GroupMessage) => item.id, []);

  const headerSubtitle = `${memberCount} members${deployedAgents.length > 0 ? ` · ${deployedAgents.length} AI` : ''}`;

  return (
    <SafeAreaView edges={['bottom']} style={styles.screenRoot}>
      <View style={styles.screenRoot}>
        <ChatTopBar
          title={groupName}
          subtitle={headerSubtitle}
          variant="group"
          onBack={() => navigation.goBack()}
          onInfo={() => setInfoVisible(true)}
          onTitlePress={() => setInfoVisible(true)}
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
          <View style={styles.centerState}>
            <ActivityIndicator size="small" color={colors.textMuted} />
            <Caption color={colors.textMuted} style={styles.stateCaption}>
              Loading conversation…
            </Caption>
          </View>
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
              {deployedAgents.length > 0 && suggestions.length > 0 && input.trim().length === 0 && (
                <SuggestedRepliesBar suggestions={suggestions} onSelect={handleSelectSuggestion} />
              )}

              <ChatComposerBar
                value={input}
                onChangeText={setInput}
                onSend={handleSend}
                onAttachmentPress={() => {
                  haptic.light();
                  // Media sharing in group chats is not yet available —
                  // truthful per AGENTS.md §11. The attachment glyph stays
                  // as a transparent 44pt target but does not fabricate
                  // functionality.
                }}
                onCameraPress={() => {
                  haptic.light();
                }}
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

        <GroupInfoModal
          visible={infoVisible}
          onClose={() => setInfoVisible(false)}
          groupName={groupName}
          memberProfiles={memberProfiles}
          memberCount={memberCount}
          deployedAgents={deployedAgents}
          onLeaveGroup={() => {
            setInfoVisible(false);
            haptic.warning();
            show('Left group', 'info');
            navigation.goBack();
          }}
          onManageAgents={() => {
            setInfoVisible(false);
            setAgentPickerVisible(true);
          }}
        />
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
  onLeaveGroup,
  onManageAgents,
}: {
  visible: boolean;
  onClose: () => void;
  groupName: string;
  memberProfiles: Array<{ id: string; username: string; displayName?: string | null; avatar?: string | null }>;
  memberCount: number;
  deployedAgents: ChatAgent[];
  onLeaveGroup: () => void;
  onManageAgents: () => void;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.surface }]}
          onPress={(e) => e.stopPropagation()}
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
            style={[styles.leaveBtn, { borderColor: colors.danger }]}
            onPress={onLeaveGroup}
            accessibilityRole="button"
            accessibilityLabel="Leave group"
            accessibilityHint="Removes you from this group conversation"
          >
            <Text style={[styles.leaveBtnText, { color: colors.danger }]}>Leave group</Text>
          </Pressable>

          <Pressable
            style={[styles.cancelBtn, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close group info"
          >
            <Text style={[styles.cancelText, { color: colors.textPrimary }]}>Close</Text>
          </Pressable>
        </Pressable>
      </Pressable>
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
      letterSpacing: Type.metaElevated.letterSpacing,
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
