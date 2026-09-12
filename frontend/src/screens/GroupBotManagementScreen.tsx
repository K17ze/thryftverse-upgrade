import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { AgentIcon } from '../components/agents/AgentIcon';
import { AppIcon } from '../components/common/AppIcon';
import { IconSize } from '../theme/iconTokens';
import {
  FlagshipHeader,
  FlagshipScreen,
  FlagshipState,
  SkeletonBlock,
  SkeletonCircle } from '../components/flagship';
import { EmptyState } from '../components/EmptyState';
import { ConfirmationSheet } from '../components/ConfirmationSheet';
import { BodyEmphasis, Caption, Meta } from '../components/ui/Text';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { useToast } from '../context/ToastContext';
import { useHaptic } from '../hooks/useHaptic';
import { useConnectivity } from '../hooks/useConnectivity';
import { RootStackParamList } from '../navigation/types';
import {
  deployBotToConversationOnApi,
  undeployBotFromConversationOnApi } from '../services/chatApi';
import {
  fetchConversationDeploymentsFromApi,
  fetchCustomBotsFromApi,
  fetchSystemBotsFromApi } from '../services/botsApi';
import type { ConversationBotDeployment } from '../domain';
import { useStore } from '../store/useStore';
import { Space, Radius, Control } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';

type Props = NativeStackScreenProps<RootStackParamList, 'GroupBotManagement'>;

type AgentRowModel = {
  id: string;
  name: string;
  category: string;
  status: string;
  description: string;
  commandHint: string;
  type?: 'system' | 'custom';
};

export default function GroupBotManagementScreen({ navigation, route }: Props) {
  const { conversationId } = route.params;
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { show } = useToast();
  const haptic = useHaptic();
  const conversations = useStore((state) => state.conversations);
  const bots = useStore((state) => state.availableChatBots);
  const customBots = useStore((state) => state.customBots);
  const deployBotToConversation = useStore((state) => state.deployBotToConversation);
  const undeployBotFromConversation = useStore((state) => state.undeployBotFromConversation);
  const { isOffline } = useConnectivity();
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [deployments, setDeployments] = useState<ConversationBotDeployment[]>([]);
  const [pendingBotId, setPendingBotId] = useState<string | null>(null);
  const [confirmSheet, setConfirmSheet] = useState<{
    visible: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    onConfirm: () => void;
    variant?: 'default' | 'danger';
  }>({ visible: false, title: '', message: '', onConfirm: () => {} });

  // Load the real bot catalogue + this conversation's deployments. The
  // store's loader swallows errors, so fetch directly for honest
  // error + retry, then write results back into the store.
  const refresh = useCallback(async () => {
    setIsLoading(true);
    setLoadError(false);
    try {
      const [system, custom, convDeployments] = await Promise.all([
        fetchSystemBotsFromApi(),
        fetchCustomBotsFromApi(),
        fetchConversationDeploymentsFromApi(conversationId),
      ]);
      useStore.setState((s) => ({
        availableChatBots: system,
        customBots: custom,
        conversationDeployments: {
          ...s.conversationDeployments,
          [conversationId]: convDeployments } }));
      setDeployments(convDeployments);
    } catch {
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const conversation = useMemo(
    () => conversations.find((item) => item.id === conversationId),
    [conversations, conversationId]
  );
  // Deployed = server-reported installs ∪ locally tracked botIds.
  const deployedBotIds = useMemo(
    () =>
      Array.from(
        new Set([
          ...(conversation?.botIds ?? []),
          ...deployments.map((d) => d.botId),
        ])
      ),
    [conversation?.botIds, deployments]
  );
  const allBots = useMemo(() => [...bots, ...customBots], [bots, customBots]);
  const deployedBots = useMemo(
    () => allBots.filter((bot) => deployedBotIds.includes(bot.id)),
    [allBots, deployedBotIds]
  );
  const availableToDeploy = useMemo(
    () =>
      allBots.filter(
        (bot) =>
          !deployedBotIds.includes(bot.id) &&
          !bot.isDraft &&
          !bot.isDisabled &&
          bot.status !== 'backend-required' &&
          bot.runtimeReady !== false
      ),
    [allBots, deployedBotIds]
  );

  const handleRemove = (botId: string, botName: string) => {
    setConfirmSheet({
      visible: true,
      title: 'Remove agent?',
      message: `${botName} will stop responding in this chat.`,
      confirmLabel: 'Remove',
      variant: 'danger',
      onConfirm: async () => {
        setConfirmSheet((s) => ({ ...s, visible: false }));
        haptic.medium();
        setPendingBotId(botId);
        try {
          await undeployBotFromConversationOnApi(conversationId, botId);
          undeployBotFromConversation(conversationId, botId);
          fetchConversationDeploymentsFromApi(conversationId)
            .then(setDeployments)
            .catch(() => undefined);
          show(`${botName} removed`, 'info');
        } catch {
          show('Failed to remove agent. Try again.', 'error');
        } finally {
          setPendingBotId(null);
        }
      } });
  };

  const handleDeploy = async (botId: string) => {
    haptic.success();
    setPendingBotId(botId);
    try {
      await deployBotToConversationOnApi(conversationId, botId);
      deployBotToConversation(conversationId, botId);
      fetchConversationDeploymentsFromApi(conversationId)
        .then(setDeployments)
        .catch(() => undefined);
      show('Agent connected', 'success');
    } catch {
      show('Failed to connect agent. Try again.', 'error');
    } finally {
      setPendingBotId(null);
    }
  };

  const renderAgent = (bot: AgentRowModel, deployed: boolean) => (
    <AgentRow
      key={bot.id}
      bot={bot}
      deployed={deployed}
      pending={pendingBotId === bot.id}
      onRemove={() => handleRemove(bot.id, bot.name)}
      onDeploy={() => handleDeploy(bot.id)}
      onView={() => navigation.navigate('BotDetail', { botId: bot.id, conversationId })}
    />
  );

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title="Chat agents"
          onBack={() => navigation.goBack()}
          rightAction={
            <AnimatedPressable
              onPress={() => navigation.navigate('CustomBots')}
              activeOpacity={0.7}
              scaleValue={0.92}
              hapticFeedback="light"
              accessibilityRole="button"
              accessibilityLabel="Your agents"
            >
              <View style={styles.headerAction}>
                <AppIcon name="profile" size={IconSize.md} color="textPrimary" opticalCenter accessible={false} />
              </View>
            </AnimatedPressable>
          }
        />
      }
      scrollEnabled={false}
    >
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {isLoading ? (
          <View>
            {[0, 1, 2].map((i) => (
              <View key={i} style={styles.skeletonRow}>
                <SkeletonCircle size={Space.xl + Space.xs} />
                <View style={styles.skeletonCopy}>
                  <SkeletonBlock width="50%" height={13} />
                  <SkeletonBlock width="75%" height={11} style={{ marginTop: Space.xs / 2 }} />
                  <SkeletonBlock width="60%" height={11} style={{ marginTop: Space.xs / 2 }} />
                </View>
                <SkeletonBlock width={Control.hit} height={Control.hit} radius={Radius.full} />
              </View>
            ))}
          </View>
        ) : loadError ? (
          <FlagshipState
            variant={isOffline ? 'offline' : 'error'}
            title={isOffline ? "You're offline" : "Couldn't load agents"}
            subtitle={
              isOffline
                ? 'Reconnect to manage chat agents.'
                : 'Check your connection and try again.'
            }
            actionLabel="Try again"
            onAction={() => void refresh()}
          />
        ) : (
          <>
        {deployedBots.length > 0 && (
          <AgentSection
            title="CONNECTED TO THIS CHAT"
            agents={deployedBots}
            renderAgent={(bot) => renderAgent(bot, true)}
          />
        )}

        {availableToDeploy.length > 0 && (
          <AgentSection
            title="AVAILABLE TO CONNECT"
            agents={availableToDeploy}
            renderAgent={(bot) => renderAgent(bot, false)}
          />
        )}

        {deployedBots.length === 0 && availableToDeploy.length === 0 && (
          <EmptyState
            icon="bulb-outline"
            title="No agents configured"
            subtitle="No agents are ready to connect."
          />
        )}
          </>
        )}
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

function AgentSection({
  title,
  agents,
  renderAgent }: {
  title: string;
  agents: AgentRowModel[];
  renderAgent: (bot: AgentRowModel) => React.ReactNode;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.section}>
      <Meta color={colors.textMuted} style={styles.sectionLabel}>
        {title}
      </Meta>
      <View>
        {agents.map((bot, index) => (
          <View key={bot.id}>
            {renderAgent(bot)}
            {index < agents.length - 1 && <View style={styles.divider} />}
          </View>
        ))}
      </View>
    </View>
  );
}

function AgentRow({
  bot,
  deployed,
  pending,
  onRemove,
  onDeploy,
  onView }: {
  bot: AgentRowModel;
  deployed: boolean;
  pending: boolean;
  onRemove: () => void;
  onDeploy: () => void;
  onView: () => void;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const statusLabel =
    bot.status === 'available'
      ? 'Ready'
      : bot.status === 'local-only'
        ? 'Limited runtime'
        : 'Setup required';

  return (
    <AnimatedPressable
      onPress={onView}
      activeOpacity={0.7}
      scaleValue={0.985}
      hapticFeedback="light"
      accessibilityRole="button"
      accessibilityLabel={`View ${bot.name}`}
    >
      <View style={styles.agentRow}>
        <View style={styles.agentIcon}>
          <AgentIcon
            category={bot.category}
            name={bot.name}
            size={21}
            color={colors.textPrimary}
          />
        </View>

        <View style={styles.agentText}>
          <BodyEmphasis numberOfLines={1}>{bot.name}</BodyEmphasis>
          <Caption color={colors.textMuted} numberOfLines={1}>
            {bot.description}
          </Caption>
          <View style={styles.detailLine}>
            <Caption
              color={deployed ? colors.textPrimary : colors.textMuted}
              style={styles.detailText}
              numberOfLines={1}
            >
              {deployed ? bot.commandHint : bot.type === 'custom' ? 'Your agent' : 'ThryftVerse agent'}
            </Caption>
            <View style={styles.metaDot} />
            <Caption color={colors.textMuted} style={styles.statusText} numberOfLines={1}>
              {statusLabel}
            </Caption>
          </View>
        </View>

        {pending ? (
          <View style={styles.rowAction}>
            <ActivityIndicator size="small" color={colors.textMuted} />
          </View>
        ) : (
          <AnimatedPressable
            onPress={deployed ? onRemove : onDeploy}
            activeOpacity={0.7}
            scaleValue={0.92}
            hapticFeedback={deployed ? 'medium' : 'light'}
            accessibilityRole="button"
            accessibilityLabel={`${deployed ? 'Remove' : 'Connect'} ${bot.name}`}
          >
            <View style={styles.rowAction}>
              <AppIcon
                name={deployed ? 'remove' : 'plus'}
                size={deployed ? IconSize.sm : IconSize.md}
                color={deployed ? 'danger' : 'textPrimary'}
                opticalCenter
                accessible={false}
              />
            </View>
          </AnimatedPressable>
        )}
      </View>
    </AnimatedPressable>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  content: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.xxl,
    gap: Space.lg },
  section: {
    gap: Space.sm },
  sectionLabel: {
    fontSize: TypographyV2.meta.size,
    letterSpacing: TypographyV2.meta.letterSpacing },
  agentRow: {
    minHeight: Space.xxl + Space.xxl + Space.xxl + 10,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Space.smMd,
    gap: Space.smMd },
  agentIcon: {
    width: Space.xl + Space.xs,
    height: Control.hit,
    justifyContent: 'center',
    alignItems: 'center' },
  agentText: {
    flex: 1,
    justifyContent: 'center',
    gap: Space.xs / 2 },
  detailLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    marginTop: Space.xs / 2 },
  detailText: {
    fontSize: TypographyV2.meta.size,
    flexShrink: 1 },
  metaDot: {
    width: Space.xs / 2 - 1,
    height: Space.xs / 2 - 1,
    borderRadius: Radius.sm,
    backgroundColor: colors.textMuted },
  statusText: {
    fontSize: TypographyV2.meta.size,
    flexShrink: 0 },
  rowAction: {
    width: Control.hit,
    height: Control.hit,
    justifyContent: 'center',
    alignItems: 'center' },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingVertical: Space.md },
  skeletonCopy: {
    flex: 1 },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: Control.hit },
  headerAction: {
    width: Control.hit,
    height: Control.hit,
    justifyContent: 'center',
    alignItems: 'center' } });
}
