import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AgentIcon } from '../components/agents/AgentIcon';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { ChatInfoRow, ChatInfoSection } from '../components/chat/ChatInfoSection';
import { AppButton } from '../components/ui/AppButton';
import { Caption } from '../components/ui/Text';
import { ConfirmationSheet } from '../components/ConfirmationSheet';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { useToast } from '../context/ToastContext';
import { useHaptic } from '../hooks/useHaptic';
import { RootStackParamList } from '../navigation/types';
import {
  deployBotToConversationOnApi,
  undeployBotFromConversationOnApi,
} from '../services/chatApi';
import { useStore } from '../store/useStore';
import { Radius, Space, Type, Typography, Control } from '../theme/designTokens';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';

type Props = NativeStackScreenProps<RootStackParamList, 'BotDetail'>;

export default function BotDetailScreen({ navigation, route }: Props) {
  const { botId, conversationId } = route.params;
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { show } = useToast();
  const haptic = useHaptic();
  const bots = useStore((state) => state.availableChatBots);
  const customBots = useStore((state) => state.customBots);
  const conversations = useStore((state) => state.conversations);
  const deployBotToConversation = useStore((state) => state.deployBotToConversation);
  const undeployBotFromConversation = useStore((state) => state.undeployBotFromConversation);
  const botVersions = useStore((state) => state.botVersions);
  const loadBotVersions = useStore((state) => state.loadBotVersions);
  const rollbackBot = useStore((state) => state.rollbackBot);
  const runPlayground = useStore((state) => state.runPlayground);
  const clearPlayground = useStore((state) => state.clearPlayground);
  const playgroundLoading = useStore((state) => state.playgroundLoading);
  const [isDeploying, setIsDeploying] = useState(false);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [rollingBackId, setRollingBackId] = useState<string | null>(null);

  // Playground — local conversation transcript used as context for subsequent
  // test messages. Each turn is appended so the agent sees prior turns.
  type PlaygroundTurn = {
    role: 'user' | 'assistant';
    content: string;
    usage?: { inputTokens: number; outputTokens: number; totalTokens: number } | null;
    confidence?: number | null;
  };
  const [playgroundMessage, setPlaygroundMessage] = useState('');
  const [playgroundTurns, setPlaygroundTurns] = useState<PlaygroundTurn[]>([]);
  const [playgroundError, setPlaygroundError] = useState<string | null>(null);
  const [confirmSheet, setConfirmSheet] = useState<{
    visible: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    onConfirm: () => void;
    variant?: 'default' | 'danger';
  }>({ visible: false, title: '', message: '', onConfirm: () => {} });
  const scrollRef = useRef<ScrollView>(null);

  const handleRunPlayground = async () => {
    const trimmed = playgroundMessage.trim();
    if (!trimmed || playgroundLoading) return;
    setPlaygroundError(null);
    const context = playgroundTurns.map((t) => ({ role: t.role, content: t.content }));
    // Optimistically show the user's message immediately.
    setPlaygroundTurns((prev) => [...prev, { role: 'user', content: trimmed }]);
    setPlaygroundMessage('');
    try {
      await runPlayground(botId, trimmed, context);
      const result = useStore.getState().playgroundResult;
      if (result) {
        setPlaygroundTurns((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: result.response,
            usage: result.usage,
            confidence: result.confidence,
          },
        ]);
        // Scroll to bottom after the response arrives.
        requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
      }
    } catch {
      setPlaygroundError('Test failed. Check your provider connection and try again.');
      // Remove the optimistic user message on failure so the transcript stays truthful.
      setPlaygroundTurns((prev) => {
        if (prev.length === 0) return prev;
        const last = prev[prev.length - 1];
        if (last.role === 'user' && last.content === trimmed) {
          return prev.slice(0, -1);
        }
        return prev;
      });
    }
  };

  const handleClearPlayground = () => {
    setPlaygroundTurns([]);
    setPlaygroundMessage('');
    setPlaygroundError(null);
    clearPlayground();
  };

  const allBots = useMemo(() => [...bots, ...customBots], [bots, customBots]);
  const bot = useMemo(() => allBots.find((item) => item.id === botId), [allBots, botId]);
  const connectedToCurrentChat = useMemo(() => {
    if (!conversationId) return false;
    return conversations
      .find((conversation) => conversation.id === conversationId)
      ?.botIds?.includes(botId) ?? false;
  }, [conversations, conversationId, botId]);
  const connectedGroups = useMemo(
    () =>
      conversations.filter(
        (conversation) =>
          conversation.type === 'group' && conversation.botIds?.includes(botId)
      ),
    [conversations, botId]
  );

  const versions = botVersions[botId];
  useEffect(() => {
    let cancelled = false;
    setVersionsLoading(true);
    (async () => {
      await loadBotVersions(botId);
      if (!cancelled) setVersionsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [botId, loadBotVersions]);

  const handleRollback = (versionId: string, versionNumber: number) => {
    setConfirmSheet({
      visible: true,
      title: 'Roll back agent?',
      message: `This restores the agent to version ${versionNumber}. The current configuration will be replaced.`,
      confirmLabel: 'Roll back',
      variant: 'danger',
      onConfirm: async () => {
        setConfirmSheet((s) => ({ ...s, visible: false }));
        setRollingBackId(versionId);
        try {
          await rollbackBot(botId, versionId);
          haptic.medium();
          show(`Restored to version ${versionNumber}`, 'success');
        } catch {
          show('Could not roll back. Try again.', 'error');
        } finally {
          setRollingBackId(null);
        }
      },
    });
  };

  if (!bot) {
    return (
      <FlagshipScreen
        scrollEnabled={false}
        contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
        header={
          <FlagshipHeader title="Agent details" onBack={() => navigation.goBack()} />
        }
      >
        <View style={styles.center}>
          <Caption color={colors.textMuted}>Agent not found</Caption>
        </View>
      </FlagshipScreen>
    );
  }

  const isCustomAgent = bot.type === 'custom';
  const statusLabel =
    bot.runtimeReady === false
      ? 'Provider setup needed'
      : bot.isDraft
        ? 'Draft'
        : bot.status === 'available'
          ? 'Ready'
          : bot.status === 'local-only'
            ? 'Limited runtime'
            : 'Setup required';
  const invocation =
    bot.agentConfig?.triggerMode === 'mention'
      ? `@${bot.slug}`
      : bot.agentConfig?.triggerMode === 'always'
        ? 'Every message'
        : bot.commandHint;
  const contextLabels = [
    bot.category === 'moderation' ? 'Group chats' : undefined,
    bot.category === 'commerce' ? 'Marketplace chats' : undefined,
    bot.category === 'safety' ? 'All supported chats' : undefined,
    bot.category === 'assistant' ? 'Direct and group chats' : undefined,
    bot.category === 'automation' ? 'Group chats' : undefined,
  ].filter(Boolean) as string[];

  const connect = async () => {
    if (!conversationId) return;
    setIsDeploying(true);
    try {
      await deployBotToConversationOnApi(conversationId, botId);
      deployBotToConversation(conversationId, botId);
      haptic.success();
      show(`${bot.name} connected`, 'success');
      navigation.goBack();
    } catch {
      show('Failed to connect agent. Try again.', 'error');
    } finally {
      setIsDeploying(false);
    }
  };

  const remove = () => {
    if (!conversationId) return;
    setConfirmSheet({
      visible: true,
      title: 'Remove agent?',
      message: `${bot.name} will stop responding in this chat.`,
      confirmLabel: 'Remove',
      variant: 'danger',
      onConfirm: async () => {
        setConfirmSheet((s) => ({ ...s, visible: false }));
        setIsDeploying(true);
        try {
          await undeployBotFromConversationOnApi(conversationId, botId);
          undeployBotFromConversation(conversationId, botId);
          haptic.medium();
          show(`${bot.name} removed`, 'info');
          navigation.goBack();
        } catch {
          show('Failed to remove agent. Try again.', 'error');
        } finally {
          setIsDeploying(false);
        }
      },
    });
  };

  return (
    <FlagshipScreen
      scrollEnabled={false}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
      header={
        <FlagshipHeader
          title="Agent details"
          onBack={() => navigation.goBack()}
          rightAction={
            isCustomAgent ? (
              <AnimatedPressable
                onPress={() => navigation.navigate('BotBuilder', { botId: bot.id })}
                style={styles.headerAction}
                activeOpacity={0.68}
                scaleValue={0.92}
                hapticFeedback="light"
                accessibilityRole="button"
                accessibilityLabel="Edit agent"
              >
                <Ionicons name="create-outline" size={21} color={colors.textPrimary} />
              </AnimatedPressable>
            ) : undefined
          }
        />
      }
    >
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.identity}>
          <View style={styles.identityIcon}>
            <AgentIcon
              category={bot.category}
              name={bot.name}
              size={25}
              color={colors.textPrimary}
            />
          </View>
          <View style={styles.identityCopy}>
            <Text style={styles.agentName} numberOfLines={1}>
              {bot.name}
            </Text>
            <Text style={styles.identityMeta}>
              {bot.category} · {isCustomAgent ? 'Your agent' : 'ThryftVerse agent'} · {statusLabel}
            </Text>
          </View>
        </View>

        <Text style={styles.description}>{bot.description}</Text>

        <ChatInfoSection title="HOW IT JOINS">
          <ChatInfoRow
            icon={bot.agentConfig?.triggerMode === 'mention' ? 'at' : 'terminal-outline'}
            label={invocation}
            subtitle={
              bot.agentConfig?.triggerMode === 'always'
                ? 'Responds automatically to messages in connected chats'
                : 'Use this in a connected chat to invoke the agent'
            }
          />
        </ChatInfoSection>

        {bot.agentConfig ? (
          <ChatInfoSection title="VOICE & QUALITY">
            <ChatInfoRow icon="server-outline" label="Model" detail={bot.agentConfig.model} />
            <ChatInfoRow icon="chatbox-outline" label="Voice" detail={bot.agentConfig.tone} />
            <ChatInfoRow
              icon="reader-outline"
              label="Conversation context"
              detail={`${bot.agentConfig.historyLimit} messages`}
            />
            {bot.runtimeReady === false ? (
              <ChatInfoRow
                icon="alert-circle-outline"
                label="Runtime unavailable"
                subtitle={bot.runtimeReadinessReason || 'The AI provider is not configured.'}
              />
            ) : null}
          </ChatInfoSection>
        ) : null}

        <ChatInfoSection title="ACCESS">
          {bot.permissions.length > 0 ? (
            bot.permissions.map((permission) => (
              <ChatInfoRow
                key={permission}
                icon="checkmark-circle-outline"
                label={permission.replace(/_/g, ' ')}
              />
            ))
          ) : (
            <ChatInfoRow
              icon="lock-closed-outline"
              label="No additional access"
              subtitle="This agent does not request special permissions"
            />
          )}
          <ChatInfoRow
            icon="chatbubbles-outline"
            label="Supported conversations"
            detail={contextLabels.join(', ') || 'All chat contexts'}
          />
        </ChatInfoSection>

        {connectedGroups.length > 0 ? (
          <ChatInfoSection title="CONNECTED CHATS">
            {connectedGroups.map((group) => (
              <ChatInfoRow
                key={group.id}
                icon="people-outline"
                label={group.title || 'Untitled group'}
                detail={`${group.participantIds?.length || 0} members`}
              />
            ))}
          </ChatInfoSection>
        ) : null}

        {isCustomAgent && bot.runtimeMode === 'ai' ? (
          <View style={styles.playgroundSection}>
            <View style={styles.playgroundHeader}>
              <Text style={styles.playgroundTitle}>Playground</Text>
              {playgroundTurns.length > 0 ? (
                <AnimatedPressable
                  onPress={handleClearPlayground}
                  style={styles.clearButton}
                  activeOpacity={0.68}
                  scaleValue={0.96}
                  hapticFeedback="light"
                  accessibilityRole="button"
                  accessibilityLabel="Clear playground"
                >
                  <Text style={styles.clearText}>Clear</Text>
                </AnimatedPressable>
              ) : null}
            </View>

            {playgroundTurns.length > 0 ? (
              <ScrollView
                ref={scrollRef}
                style={styles.transcript}
                contentContainerStyle={styles.transcriptContent}
                showsVerticalScrollIndicator={false}
                scrollEnabled={false}
              >
                {playgroundTurns.map((turn, index) => {
                  const isUser = turn.role === 'user';
                  return (
                    <View
                      key={`${index}-${turn.role}`}
                      style={isUser ? styles.bubbleMeWrap : styles.bubbleAgentWrap}
                    >
                      <View style={isUser ? styles.bubbleMe : styles.bubbleAgent}>
                        <Text style={isUser ? styles.bubbleMeText : styles.bubbleAgentText}>
                          {turn.content}
                        </Text>
                      </View>
                      {!isUser ? (
                        <View style={styles.bubbleMeta}>
                          {turn.usage ? (
                            <Text style={styles.bubbleMetaText}>
                              {turn.usage.totalTokens} tokens
                              {turn.usage.inputTokens || turn.usage.outputTokens
                                ? ` · ${turn.usage.inputTokens} in / ${turn.usage.outputTokens} out`
                                : ''}
                            </Text>
                          ) : null}
                          {turn.confidence != null ? (
                            <Text style={styles.bubbleMetaText}>
                              Confidence: {turn.confidence.toFixed(2)}
                            </Text>
                          ) : null}
                        </View>
                      ) : null}
                    </View>
                  );
                })}
                {playgroundLoading ? (
                  <View style={styles.runningRow}>
                    <ActivityIndicator size="small" color={colors.textSecondary} />
                    <Text style={styles.runningText}>Running…</Text>
                  </View>
                ) : null}
              </ScrollView>
            ) : null}

            {playgroundError ? (
              <View style={styles.playgroundError}>
                <Ionicons name="alert-circle-outline" size={15} color={colors.danger} />
                <Text style={styles.playgroundErrorText}>{playgroundError}</Text>
              </View>
            ) : null}

            <View style={styles.composer}>
              <TextInput
                style={styles.composerInput}
                value={playgroundMessage}
                onChangeText={setPlaygroundMessage}
                placeholder="Test message"
                placeholderTextColor={colors.textMuted}
                multiline
                editable={!playgroundLoading}
                returnKeyType="send"
                blurOnSubmit={false}
              />
              <AnimatedPressable
                onPress={handleRunPlayground}
                style={[
                  styles.sendButton,
                  (!playgroundMessage.trim() || playgroundLoading) && styles.sendButtonDisabled,
                ]}
                activeOpacity={0.68}
                scaleValue={0.92}
                hapticFeedback="light"
                accessibilityRole="button"
                accessibilityLabel="Run test"
                disabled={!playgroundMessage.trim() || playgroundLoading}
              >
                {playgroundLoading ? (
                  <ActivityIndicator size="small" color={colors.textPrimary} />
                ) : (
                  <Ionicons name="send" size={17} color={colors.textPrimary} />
                )}
              </AnimatedPressable>
            </View>
          </View>
        ) : null}

        {isCustomAgent ? (
          <View style={styles.versionsSection}>
            <Text style={styles.versionsTitle}>Versions</Text>
            {versionsLoading ? (
              <View style={styles.versionsLoading}>
                <ActivityIndicator size="small" color={colors.textSecondary} />
                <Text style={styles.versionsLoadingText}>Loading versions…</Text>
              </View>
            ) : !versions || versions.length === 0 ? (
              <Text style={styles.versionsEmpty}>
                No published versions yet. Publish from the editor to create one.
              </Text>
            ) : (
              <View style={styles.versionList}>
                {versions.map((version, index) => (
                  <View key={version.id}>
                    <View style={styles.versionRow}>
                      <View style={styles.versionCopy}>
                        <Text style={styles.versionNumber}>
                          Version {version.versionNumber}
                        </Text>
                        <Text style={styles.versionDate}>
                          {new Date(version.createdAt).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </Text>
                        {version.publishNotes ? (
                          <Text style={styles.versionNotes} numberOfLines={2}>
                            {version.publishNotes}
                          </Text>
                        ) : null}
                      </View>
                      <AnimatedPressable
                        onPress={() => handleRollback(version.id, version.versionNumber)}
                        style={styles.rollbackButton}
                        activeOpacity={0.68}
                        scaleValue={0.96}
                        hapticFeedback="light"
                        accessibilityRole="button"
                        accessibilityLabel={`Roll back to version ${version.versionNumber}`}
                        disabled={rollingBackId === version.id}
                      >
                        {rollingBackId === version.id ? (
                          <ActivityIndicator size="small" color={colors.textPrimary} />
                        ) : (
                          <Text style={styles.rollbackText}>Roll back</Text>
                        )}
                      </AnimatedPressable>
                    </View>
                    {index < versions.length - 1 ? (
                      <View style={styles.versionDivider} />
                    ) : null}
                  </View>
                ))}
              </View>
            )}
          </View>
        ) : null}

        {conversationId ? (
          <View style={styles.chatAction}>
            <AppButton
              title={connectedToCurrentChat ? 'Remove from chat' : 'Connect to chat'}
              variant={connectedToCurrentChat ? 'secondary' : 'primary'}
              size="md"
              align="center"
              onPress={connectedToCurrentChat ? remove : connect}
              loading={isDeploying}
              disabled={bot.isDraft || bot.runtimeReady === false}
            />
          </View>
        ) : null}
      </ScrollView>
      <ConfirmationSheet
        visible={confirmSheet.visible}
        onDismiss={() => setConfirmSheet((s) => ({ ...s, visible: false }))}
        title={confirmSheet.title}
        message={confirmSheet.message}
        confirmLabel={confirmSheet.confirmLabel ?? 'Confirm'}
        variant={confirmSheet.variant ?? 'danger'}
        onConfirm={confirmSheet.onConfirm}
      />
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAction: {
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.xxl,
    gap: Space.lg,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm + Space.xs,
    paddingTop: Space.sm,
  },
  identityIcon: {
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityCopy: {
    flex: 1,
    gap: Space.xs / 2,
  },
  agentName: {
    color: colors.textPrimary,
    fontFamily: Typography.family.bold,
    fontSize: Type.title.size,
    letterSpacing: Type.title.letterSpacing,
  },
  identityMeta: {
    color: colors.textMuted,
    fontFamily: Typography.family.regular,
    fontSize: Type.caption.size,
    textTransform: 'capitalize',
  },
  description: {
    color: colors.textSecondary,
    fontFamily: Typography.family.regular,
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight + 2,
  },
  chatAction: {
    marginTop: Space.xs,
  },
  versionsSection: {
    gap: Space.sm,
  },
  versionsTitle: {
    color: colors.textPrimary,
    fontFamily: Typography.family.semibold,
    fontSize: Type.bodyStrong.size,
  },
  versionsLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.xs,
  },
  versionsLoadingText: {
    color: colors.textSecondary,
    fontFamily: Typography.family.regular,
    fontSize: Type.caption.size,
  },
  versionsEmpty: {
    color: colors.textMuted,
    fontFamily: Typography.family.regular,
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
  },
  versionList: {},
  versionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm,
    minHeight: Control.hit,
  },
  versionCopy: {
    flex: 1,
    gap: Space.xs / 2,
  },
  versionNumber: {
    color: colors.textPrimary,
    fontFamily: Typography.family.semibold,
    fontSize: Type.body.size,
  },
  versionDate: {
    color: colors.textMuted,
    fontFamily: Typography.family.regular,
    fontSize: Type.caption.size,
  },
  versionNotes: {
    color: colors.textSecondary,
    fontFamily: Typography.family.regular,
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
  },
  rollbackButton: {
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    minHeight: Control.icon,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rollbackText: {
    color: colors.textPrimary,
    fontFamily: Typography.family.medium,
    fontSize: Type.caption.size,
  },
  versionDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  // Playground
  playgroundSection: {
    gap: Space.sm,
  },
  playgroundHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  playgroundTitle: {
    color: colors.textPrimary,
    fontFamily: Typography.family.semibold,
    fontSize: Type.bodyStrong.size,
  },
  clearButton: {
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    minHeight: Control.icon,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearText: {
    color: colors.textSecondary,
    fontFamily: Typography.family.medium,
    fontSize: Type.caption.size,
  },
  transcript: {
    maxHeight: 280,
  },
  transcriptContent: {
    gap: Space.sm,
    paddingBottom: Space.xs,
  },
  bubbleMeWrap: {
    alignSelf: 'flex-end',
    maxWidth: '82%',
    gap: Space.xs / 2,
  },
  bubbleAgentWrap: {
    alignSelf: 'flex-start',
    maxWidth: '82%',
    gap: Space.xs / 2,
  },
  bubbleMe: {
    backgroundColor: colors.brand,
    borderRadius: Radius.chat,
    borderTopRightRadius: Radius.sm,
    paddingHorizontal: Space.sm + 2,
    paddingVertical: Space.sm - 1,
  },
  bubbleAgent: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: Radius.chat,
    borderTopLeftRadius: Radius.sm,
    paddingHorizontal: Space.sm + 2,
    paddingVertical: Space.sm - 1,
  },
  bubbleMeText: {
    color: colors.textPrimary,
    fontFamily: Typography.family.regular,
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight + 2,
    letterSpacing: Type.body.letterSpacing,
  },
  bubbleAgentText: {
    color: colors.textPrimary,
    fontFamily: Typography.family.regular,
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight + 2,
    letterSpacing: Type.body.letterSpacing,
  },
  bubbleMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.xs,
    paddingLeft: Space.xs,
  },
  bubbleMetaText: {
    color: colors.textMuted,
    fontFamily: Typography.family.regular,
    fontSize: Type.meta.size,
    letterSpacing: Type.meta.letterSpacing,
  },
  runningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingLeft: Space.xs,
    paddingVertical: Space.xs / 2,
  },
  runningText: {
    color: colors.textSecondary,
    fontFamily: Typography.family.regular,
    fontSize: Type.caption.size,
  },
  playgroundError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingVertical: Space.xs,
  },
  playgroundErrorText: {
    color: colors.danger,
    fontFamily: Typography.family.regular,
    fontSize: Type.caption.size,
    flex: 1,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Space.sm,
    paddingTop: Space.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  composerInput: {
    flex: 1,
    color: colors.textPrimary,
    fontFamily: Typography.family.regular,
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight + 2,
    minHeight: Control.hit,
    maxHeight: 120,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.sm - 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: Radius.lg,
    backgroundColor: colors.surfaceAlt,
    textAlignVertical: 'top',
  },
  sendButton: {
    width: Control.hit,
    height: Control.hit,
    borderRadius: Radius.full,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
  });
}
