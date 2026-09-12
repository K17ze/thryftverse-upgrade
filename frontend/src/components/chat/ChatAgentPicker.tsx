/**
 * ChatAgentPicker — bottom sheet for adding an AI agent to a conversation.
 * Mirrors the ChatActionSheet presentation pattern (Modal, fade,
 * bottom-anchored sheet) so the chat surface stays consistent.
 *
 * Data is always real (AGENTS.md §11 — no fabricated agents):
 *  - Deployable agents come from the backend bot catalogue
 *    (GET /bots/system + GET /bots) via the store.
 *  - Already-deployed agents come from
 *    GET /chat/conversations/:conversationId/bots.
 *  - When `conversationId` is provided, "Choose" performs the real deploy
 *    (POST /chat/conversations/:conversationId/bots/:botId/deploy) and then
 *    notifies the parent via `onDeploy` for any additional bookkeeping.
 *    The notify call is wrapped — legacy handlers that still use the demo
 *    registry must not mask a completed deploy.
 *
 * States: loading skeleton matching row geometry, error + retry, empty,
 * populated. No demo catalogue, no mock agents.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { Space, Radius, Control } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { AnimatedPressable } from '../AnimatedPressable';
import { AppIcon } from '../common/AppIcon';
import { IconSize } from '../../theme/iconTokens';
import { SkeletonBlock, SkeletonCircle } from '../flagship';
import { AgentIcon } from '../agents/AgentIcon';
import type { ChatAgent } from '../../services/chatAgentsApi';
import type { ChatBot, ConversationBotDeployment } from '../../domain';
import {
  fetchSystemBotsFromApi,
  fetchCustomBotsFromApi,
  fetchConversationDeploymentsFromApi,
} from '../../services/botsApi';
import { deployBotToConversationOnApi } from '../../services/chatApi';
import { useStore } from '../../store/useStore';
import { useToast } from '../../context/ToastContext';
import { useHaptic } from '../../hooks/useHaptic';

// Stable empty array reference for Zustand selector fallbacks.
// Returning `[]` inline in a useStore selector creates a new array on
// every call, which useSyncExternalStore interprets as a state change,
// causing an infinite re-render loop (Maximum update depth exceeded).
const EMPTY_DEPLOYMENTS: ConversationBotDeployment[] = [];

interface ChatAgentPickerProps {
  visible: boolean;
  onClose: () => void;
  /**
   * Notified after a successful deploy (or invoked as the sole handler when
   * no `conversationId` is provided). Receives the chosen agent mapped to
   * the legacy ChatAgent shape for backward compatibility.
   */
  onDeploy: (agent: ChatAgent) => void;
  /** Ids already deployed — rendered as "Added" (disabled) state. */
  deployedAgentIds?: string[];
  /** Conversation the agent will be deployed into. */
  conversationId?: string;
}

/** A deployable bot: published, not disabled, and runnable in this environment. */
function isDeployable(bot: ChatBot): boolean {
  return (
    !bot.isDraft &&
    !bot.isDisabled &&
    bot.status !== 'backend-required' &&
    bot.runtimeReady !== false
  );
}

/** Map a real backend bot to the ChatAgent shape consumed by onDeploy. */
function botToAgent(bot: ChatBot): ChatAgent {
  return {
    id: bot.id,
    type: 'custom',
    name: bot.name,
    avatar: bot.icon ?? 'bulb-outline',
    description: bot.description || bot.commandHint,
    capabilities: bot.permissions,
    isDemo: false,
    isCustom: bot.type === 'custom',
  };
}

export function ChatAgentPicker({
  visible,
  onClose,
  onDeploy,
  deployedAgentIds = [],
  conversationId }: ChatAgentPickerProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { show } = useToast();
  const haptic = useHaptic();

  const systemBots = useStore((s) => s.availableChatBots);
  const customBots = useStore((s) => s.customBots);
  const deployBotToConversation = useStore((s) => s.deployBotToConversation);
  const deployments = useStore((s) =>
    conversationId ? s.conversationDeployments[conversationId] ?? EMPTY_DEPLOYMENTS : EMPTY_DEPLOYMENTS,
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [pendingBotId, setPendingBotId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [system, custom, conversationDeployments] = await Promise.all([
        fetchSystemBotsFromApi(),
        fetchCustomBotsFromApi(),
        conversationId
          ? fetchConversationDeploymentsFromApi(conversationId)
          : Promise.resolve(EMPTY_DEPLOYMENTS),
      ]);
      useStore.setState((s) => ({
        availableChatBots: system,
        customBots: custom,
        conversationDeployments: conversationId
          ? { ...s.conversationDeployments, [conversationId]: conversationDeployments }
          : s.conversationDeployments,
      }));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    if (!visible) return;
    void load();
  }, [visible, load]);

  const deployedSet = useMemo(
    () =>
      new Set([
        ...deployedAgentIds,
        ...deployments.map((d) => d.botId),
      ]),
    [deployedAgentIds, deployments],
  );

  const agents = useMemo(
    () => [...systemBots, ...customBots].filter(isDeployable),
    [systemBots, customBots],
  );

  const handleChoose = async (bot: ChatBot) => {
    haptic.light();
    const agent = botToAgent(bot);

    // Without a target conversation the parent owns what "choose" means.
    if (!conversationId) {
      try {
        onDeploy(agent);
      } finally {
        onClose();
      }
      return;
    }

    setPendingBotId(bot.id);
    try {
      await deployBotToConversationOnApi(conversationId, bot.id);
      deployBotToConversation(conversationId, bot.id);
      // Refresh deployment state so the "Added" marker stays truthful.
      fetchConversationDeploymentsFromApi(conversationId)
        .then((items) =>
          useStore.setState((s) => ({
            conversationDeployments: { ...s.conversationDeployments, [conversationId]: items },
          })),
        )
        .catch(() => undefined);
      show(`${bot.name} connected`, 'success');
      haptic.success();
      // Legacy handlers may still use the demo registry — a throwing
      // callback must not mask a completed deploy.
      try {
        onDeploy(agent);
      } catch {
        // Parent bookkeeping is best-effort only.
      }
      onClose();
    } catch {
      show('Could not connect agent. Try again.', 'error');
      haptic.medium();
    } finally {
      setPendingBotId(null);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" accessibilityRole="button" />
        <View
          style={[styles.sheet, { backgroundColor: colors.surface }]}
          accessibilityLabel="Add AI Agent sheet"
        >
          <View style={[styles.handle, { backgroundColor: colors.border }]} />

          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Add AI Agent</Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>
              Connect an assistant to help in this chat
            </Text>
          </View>

          {loading ? (
            <View style={styles.listContent}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={styles.skeletonRow}>
                  <SkeletonCircle size={Control.hit} />
                  <View style={styles.skeletonCopy}>
                    <SkeletonBlock width="45%" height={13} />
                    <SkeletonBlock width="70%" height={11} style={{ marginTop: Space.xs / 2 }} />
                  </View>
                  <SkeletonBlock width={72} height={Control.hit} radius={Radius.full} />
                </View>
              ))}
            </View>
          ) : error ? (
            <EmptyState
              icon="cloud-offline-outline"
              title="Couldn't load agents"
              body="Check your connection and try again."
              actionLabel="Retry"
              onAction={() => void load()}
            />
          ) : agents.length > 0 ? (
            <ScrollView
              style={styles.list}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            >
              {agents.map((bot) => {
                const isDeployed = deployedSet.has(bot.id);
                return (
                  <AgentRow
                    key={bot.id}
                    bot={bot}
                    deployed={isDeployed}
                    pending={pendingBotId === bot.id}
                    onAdd={() => void handleChoose(bot)}
                  />
                );
              })}
            </ScrollView>
          ) : (
            <EmptyState
              icon="chatbubble-ellipses-outline"
              title="No agents available"
              body="Create an agent in Agent Studio to connect it here."
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

function AgentRow({
  bot,
  deployed,
  pending,
  onAdd }: {
  bot: ChatBot;
  deployed: boolean;
  pending: boolean;
  onAdd: () => void;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={[styles.row, { borderBottomColor: colors.borderSubtle }]}>
      <View style={styles.iconTarget}>
        <AgentIcon category={bot.category} name={bot.name} size={22} color={colors.brand} />
      </View>

      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, { color: colors.textPrimary }]} numberOfLines={1}>
          {bot.name}
        </Text>
        <Text style={[styles.rowDescription, { color: colors.textMuted }]} numberOfLines={1}>
          {bot.description || bot.commandHint}
        </Text>
      </View>

      <AnimatedPressable
        style={[styles.addBtn, { backgroundColor: deployed ? colors.surface : colors.brand }]}
        onPress={onAdd}
        disabled={deployed || pending}
        activeOpacity={0.7}
        scaleValue={deployed ? 1 : 0.94}
        hapticFeedback={deployed ? undefined : 'light'}
        accessibilityRole="button"
        accessibilityLabel={deployed ? `${bot.name} already added` : `Add ${bot.name} agent`}
        accessibilityHint={bot.description}
        accessibilityState={deployed ? { disabled: true } : undefined}
      >
        {pending ? (
          <ActivityIndicator size="small" color={colors.textInverse} />
        ) : (
          <Text
            style={[styles.addBtnText, { color: deployed ? colors.textMuted : colors.textInverse }]}
          >
            {deployed ? 'Added' : 'Choose'}
          </Text>
        )}
      </AnimatedPressable>
    </View>
  );
}

function EmptyState({
  icon,
  title,
  body,
  actionLabel,
  onAction }: {
  icon: string;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.emptyState}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.surfaceAlt }]}>
        <AppIcon name={icon} size={IconSize.lg} color="textMuted" opticalCenter accessible={false} />
      </View>
      <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>{title}</Text>
      <Text style={[styles.emptyBody, { color: colors.textMuted }]}>{body}</Text>
      {actionLabel && onAction ? (
        <AnimatedPressable
          style={[styles.retryBtn, { backgroundColor: colors.brand }]}
          onPress={onAction}
          activeOpacity={0.7}
          scaleValue={0.94}
          hapticFeedback="light"
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
        >
          <Text style={[styles.retryBtnText, { color: colors.textInverse }]}>{actionLabel}</Text>
        </AnimatedPressable>
      ) : null}
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: 'flex-end' },
    sheet: {
      borderTopLeftRadius: Radius.xl,
      borderTopRightRadius: Radius.xl,
      paddingHorizontal: Space.md,
      paddingTop: Space.sm,
      paddingBottom: Space.xxl,
      gap: Space.sm,
      maxHeight: '85%' },
    handle: {
      width: 36,
      height: 4,
      borderRadius: Radius.full,
      alignSelf: 'center',
      marginBottom: Space.sm },
    header: {
      marginBottom: Space.xs },
    title: {
      fontSize: TypographyV2.sectionTitle.size,
      lineHeight: TypographyV2.sectionTitle.lineHeight,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      letterSpacing: TypographyV2.sectionTitle.letterSpacing },
    subtitle: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: TypographyV2.body.fontFamily,
      marginTop: 2 },
    list: {
      flexGrow: 0 },
    listContent: {
      paddingBottom: Space.xs },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      minHeight: 68,
      paddingVertical: Space.sm,
      borderBottomWidth: StyleSheet.hairlineWidth },
    iconTarget: {
      width: Control.hit,
      height: Control.hit,
      justifyContent: 'center',
      alignItems: 'center' },
    rowText: {
      flex: 1,
      gap: 1 },
    rowLabel: {
      fontSize: TypographyV2.body.size,
      lineHeight: TypographyV2.body.lineHeight,
      fontFamily: TypographyV2.bodyStrong.fontFamily },
    rowDescription: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: TypographyV2.body.fontFamily },
    addBtn: {
      paddingHorizontal: Space.smMd,
      borderRadius: Radius.full,
      minWidth: 72,
      minHeight: Control.hit,
      justifyContent: 'center',
      alignItems: 'center' },
    addBtnText: {
      fontSize: TypographyV2.body.size,
      lineHeight: TypographyV2.body.lineHeight,
      fontFamily: TypographyV2.bodyStrong.fontFamily },
    skeletonRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      minHeight: 68,
      paddingVertical: Space.sm },
    skeletonCopy: {
      flex: 1 },
    emptyState: {
      alignItems: 'center',
      paddingVertical: Space.xl,
      paddingHorizontal: Space.md,
      gap: Space.sm },
    emptyIcon: {
      width: Space.xxl,
      height: Space.xxl,
      borderRadius: Radius.full,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: Space.xs },
    emptyTitle: {
      fontSize: TypographyV2.sectionTitle.size,
      lineHeight: TypographyV2.sectionTitle.lineHeight,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      letterSpacing: TypographyV2.sectionTitle.letterSpacing },
    emptyBody: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight + 2,
      fontFamily: TypographyV2.body.fontFamily,
      textAlign: 'center' },
    retryBtn: {
      paddingHorizontal: Space.md,
      paddingVertical: Space.xs,
      borderRadius: Radius.full,
      minHeight: Control.hit,
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: Space.xs },
    retryBtnText: {
      fontSize: TypographyV2.body.size,
      lineHeight: TypographyV2.body.lineHeight,
      fontFamily: TypographyV2.bodyStrong.fontFamily } });
