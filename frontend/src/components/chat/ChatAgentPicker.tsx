/**
 * ChatAgentPicker — bottom sheet for selecting an AI agent to deploy into a
 * conversation. Mirrors the ChatActionSheet presentation pattern (Modal,
 * fade, bottom-anchored sheet) so the chat surface stays consistent.
 *
 * Two modes:
 *  - `__DEV__`: demo catalogue (chatAgentsApi) — mock agents that suggest
 *    keyword-based replies. A subtle "Demo assistants" indicator is shown.
 *  - production (`!__DEV__`): real backend deployment state fetched from
 *    GET /chat/conversations/:conversationId/bots via the store. Shows
 *    loading, error, empty and populated states truthfully — no fabricated
 *    agents.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Space, Radius, TypeStyles } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { AnimatedPressable } from '../AnimatedPressable';
import { getAvailableAgents, type ChatAgent } from '../../services/chatAgentsApi';
import { useStore } from '../../store/useStore';
import type { ConversationBotDeployment } from '../../domain';

interface ChatAgentPickerProps {
  visible: boolean;
  onClose: () => void;
  onDeploy: (agent: ChatAgent) => void;
  /** Ids already deployed — rendered as "Added" (disabled) state. */
  deployedAgentIds?: string[];
  /** Conversation whose real backend deployment state should be shown in production. */
  conversationId?: string;
}

export function ChatAgentPicker({
  visible,
  onClose,
  onDeploy,
  deployedAgentIds = [],
  conversationId }: ChatAgentPickerProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const demoAgents = useMemo(() => (__DEV__ ? getAvailableAgents() : []), []);
  const deployedSet = useMemo(() => new Set(deployedAgentIds), [deployedAgentIds]);

  // Real backend deployment state (production only).
  const loadConversationDeployments = useStore((s) => s.loadConversationDeployments);
  const deployments = useStore((s) =>
    conversationId ? s.conversationDeployments[conversationId] ?? [] : [],
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!visible || __DEV__ || !conversationId) return;
    let cancelled = false;
    setLoading(true);
    setError(false);
    loadConversationDeployments(conversationId)
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, conversationId, loadConversationDeployments]);

  const productionAgents = useMemo<ChatAgent[]>(
    () => (!__DEV__ ? deployments.map(deploymentToAgent) : []),
    [deployments],
  );

  const agents = __DEV__ ? demoAgents : productionAgents;

  const handleRetry = () => {
    if (!conversationId) return;
    setLoading(true);
    setError(false);
    loadConversationDeployments(conversationId)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
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

          {__DEV__ ? (
            <View style={styles.demoNotice}>
              <Ionicons name="flask-outline" size={15} color={colors.textMuted} />
              <Text style={[styles.demoText, { color: colors.textMuted }]}>
                Demo assistants suggest mock replies
              </Text>
            </View>
          ) : null}

          {__DEV__ ? (
            agents.length > 0 ? (
              <ScrollView
                style={styles.list}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
              >
                {agents.map((agent) => {
                  const isDeployed = deployedSet.has(agent.id);
                  return (
                    <AgentRow
                      key={agent.id}
                      agent={agent}
                      deployed={isDeployed}
                      onAdd={() => onDeploy(agent)}
                    />
                  );
                })}
              </ScrollView>
            ) : (
              <EmptyState
                icon="chatbubble-ellipses-outline"
                title="No agents available"
                body="Create an agent from the Agents screen to get started."
              />
            )
          ) : loading ? (
            <View style={styles.loadingState}>
              <ActivityIndicator size="small" color={colors.brand} />
              <Text style={[styles.loadingText, { color: colors.textMuted }]}>
                Loading deployed agents…
              </Text>
            </View>
          ) : error ? (
            <EmptyState
              icon="cloud-offline-outline"
              title="Couldn't load agents"
              body="We couldn't reach the server. Pull to try again."
              actionLabel="Retry"
              onAction={handleRetry}
            />
          ) : agents.length > 0 ? (
            <ScrollView
              style={styles.list}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            >
              {agents.map((agent) => {
                const isDeployed = deployedSet.has(agent.id);
                return (
                  <AgentRow
                    key={agent.id}
                    agent={agent}
                    deployed={isDeployed}
                    onAdd={() => onDeploy(agent)}
                  />
                );
              })}
            </ScrollView>
          ) : (
            <EmptyState
              icon="chatbubble-ellipses-outline"
              title="No agents deployed"
              body="Install an agent into this conversation from the Agents screen."
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

/** Map a real backend deployment to the ChatAgent shape consumed by onDeploy. */
function deploymentToAgent(d: ConversationBotDeployment): ChatAgent {
  return {
    id: d.botId,
    type: 'custom',
    name: d.botName,
    avatar: 'sparkles-outline',
    description: d.commandHint,
    capabilities: d.permissionsSnapshot,
    isDemo: false };
}

function AgentRow({
  agent,
  deployed,
  onAdd }: {
  agent: ChatAgent;
  deployed: boolean;
  onAdd: () => void;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={[styles.row, { borderBottomColor: colors.borderSubtle }]}>
      <View style={styles.iconTarget}>
        <Ionicons
          name={agent.avatar as keyof typeof Ionicons.glyphMap}
          size={22}
          color={colors.brand}
        />
      </View>

      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, { color: colors.textPrimary }]} numberOfLines={1}>
          {agent.name}
        </Text>
        <Text style={[styles.rowDescription, { color: colors.textMuted }]} numberOfLines={1}>
          {agent.description}
        </Text>
      </View>

      <AnimatedPressable
        style={[styles.addBtn, { backgroundColor: deployed ? colors.surface : colors.brand }]}
        onPress={onAdd}
        disabled={deployed}
        activeOpacity={0.7}
        scaleValue={deployed ? 1 : 0.94}
        hapticFeedback={deployed ? undefined : 'light'}
        accessibilityRole="button"
        accessibilityLabel={deployed ? `${agent.name} already added` : `Add ${agent.name} agent`}
        accessibilityHint={agent.description}
        accessibilityState={deployed ? { disabled: true } : undefined}
      >
        <Text
          style={[styles.addBtnText, { color: deployed ? colors.textMuted : colors.textInverse }]}
        >
          {deployed ? 'Added' : 'Choose'}
        </Text>
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
  icon: keyof typeof Ionicons.glyphMap;
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
        <Ionicons name={icon} size={26} color={colors.textMuted} />
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
      fontFamily: TypeStyles.bodyEmphasis.fontFamily,
      letterSpacing: TypographyV2.sectionTitle.letterSpacing },
    subtitle: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: TypeStyles.body.fontFamily,
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
      width: 44,
      height: 44,
      justifyContent: 'center',
      alignItems: 'center' },
    rowText: {
      flex: 1,
      gap: 1 },
    rowLabel: {
      fontSize: TypographyV2.body.size,
      lineHeight: TypographyV2.body.lineHeight,
      fontFamily: TypeStyles.bodyEmphasis.fontFamily },
    rowDescription: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: TypeStyles.body.fontFamily },
    addBtn: {
      paddingHorizontal: Space.smMd,
      borderRadius: Radius.full,
      minWidth: 72,
      minHeight: 44,
      justifyContent: 'center',
      alignItems: 'center' },
    addBtnText: {
      fontSize: TypographyV2.body.size,
      lineHeight: TypographyV2.body.lineHeight,
      fontFamily: TypeStyles.bodyEmphasis.fontFamily },
    demoNotice: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      minHeight: 32 },
    demoText: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: TypeStyles.body.fontFamily },
    loadingState: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Space.sm,
      paddingVertical: Space.xl },
    loadingText: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: TypeStyles.body.fontFamily },
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
      fontFamily: TypeStyles.bodyEmphasis.fontFamily,
      letterSpacing: TypographyV2.sectionTitle.letterSpacing },
    emptyBody: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight + 2,
      fontFamily: TypeStyles.body.fontFamily,
      textAlign: 'center' },
    retryBtn: {
      paddingHorizontal: Space.md,
      paddingVertical: Space.xs,
      borderRadius: Radius.full,
      minHeight: 44,
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: Space.xs },
    retryBtnText: {
      fontSize: TypographyV2.body.size,
      lineHeight: TypographyV2.body.lineHeight,
      fontFamily: TypeStyles.bodyEmphasis.fontFamily } });
