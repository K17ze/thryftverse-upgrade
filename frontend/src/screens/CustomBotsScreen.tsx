import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, Radius, Control } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import {
  FlagshipScreen,
  FlagshipHeader,
  FlagshipState,
  SkeletonBlock,
  SkeletonCircle } from '../components/flagship';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { AgentIcon } from '../components/agents/AgentIcon';
import { AppIcon } from '../components/common/AppIcon';
import { IconSize } from '../theme/iconTokens';
import { fetchCustomBotsFromApi } from '../services/botsApi';
import { useConnectivity } from '../hooks/useConnectivity';
import { useHaptic } from '../hooks/useHaptic';
import { Caption, BodyEmphasis, Meta } from '../components/ui/Text';
import { ConfirmationSheet } from '../components/ConfirmationSheet';

type Props = NativeStackScreenProps<RootStackParamList, 'CustomBots'>;

export default function CustomBotsScreen({ navigation }: Props) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { show } = useToast();
  const haptic = useHaptic();

  const customBots = useStore((state) => state.customBots);
  const deleteCustomBot = useStore((state) => state.deleteCustomBot);
  const conversations = useStore((state) => state.conversations);
  const { isOffline } = useConnectivity();

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmSheet, setConfirmSheet] = useState<{
    visible: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    confirmLabel?: string;
    variant?: 'default' | 'danger';
  }>({ visible: false, title: '', message: '', onConfirm: () => {} });

  // The store's loadBotsFromApi swallows fetch errors, so this screen fetches
  // directly to keep an honest error + retry state, then writes the result
  // back into the store so the rest of the app stays in sync.
  const refresh = useCallback(async () => {
    setIsLoading(true);
    setLoadError(false);
    try {
      const items = await fetchCustomBotsFromApi();
      useStore.setState({ customBots: items });
    } catch {
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const active = useMemo(() => customBots.filter((b) => !b.isDraft && !b.isDisabled), [customBots]);
  const drafts = useMemo(() => customBots.filter((b) => b.isDraft), [customBots]);
  const disabled = useMemo(() => customBots.filter((b) => b.isDisabled), [customBots]);

  const getDeploymentCount = (botId: string) =>
    conversations.filter((c) => c.botIds?.includes(botId)).length;

  const handleDelete = (bot: { id: string; name: string }) => {
    setConfirmSheet({
      visible: true,
      title: 'Delete agent?',
      message: `${bot.name} will be permanently deleted and removed from all groups.`,
      confirmLabel: 'Delete',
      variant: 'danger',
      onConfirm: async () => {
        haptic.heavy();
        setDeletingId(bot.id);
        try {
          await deleteCustomBot(bot.id);
          show(`${bot.name} deleted`, 'info');
        } catch {
          show('Failed to delete agent', 'error');
        } finally {
          setDeletingId(null);
        }
      } });
  };

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title="Your agents"
          onBack={() => navigation.goBack()}
          rightAction={
            <AnimatedPressable
              onPress={() => navigation.navigate('BotBuilder', {})}
              activeOpacity={0.7}
              scaleValue={0.92}
              hapticFeedback="light"
              accessibilityRole="button"
              accessibilityLabel="Create agent"
            >
              <View style={styles.createBtn}>
                <AppIcon name="plus" size={IconSize.lg} color="textPrimary" opticalCenter accessible={false} />
              </View>
            </AnimatedPressable>
          }
        />
      }
      scrollEnabled={false}
    >
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {isOffline && customBots.length > 0 ? (
          <Text style={[styles.offlineNote, { color: colors.textMuted }]}>
            Offline — showing last loaded agents.
          </Text>
        ) : null}

        {/* Active bots */}
        {active.length > 0 && (
          <Section title="PUBLISHED">
            {active.map((bot) => (
              <BotRow
                key={bot.id}
                bot={bot}
                deploymentCount={getDeploymentCount(bot.id)}
                onEdit={() => navigation.navigate('BotBuilder', { botId: bot.id })}
                onDelete={() => handleDelete(bot)}
                onView={() => navigation.navigate('BotDetail', { botId: bot.id })}
              />
            ))}
          </Section>
        )}

        {/* Draft bots */}
        {drafts.length > 0 && (
          <Section title="DRAFTS">
            {drafts.map((bot) => (
              <BotRow
                key={bot.id}
                bot={bot}
                deploymentCount={0}
                onEdit={() => navigation.navigate('BotBuilder', { botId: bot.id })}
                onDelete={() => handleDelete(bot)}
                onView={() => navigation.navigate('BotDetail', { botId: bot.id })}
              />
            ))}
          </Section>
        )}

        {/* Disabled bots */}
        {disabled.length > 0 && (
          <Section title="DISABLED">
            {disabled.map((bot) => (
              <BotRow
                key={bot.id}
                bot={bot}
                deploymentCount={getDeploymentCount(bot.id)}
                onEdit={() => navigation.navigate('BotBuilder', { botId: bot.id })}
                onDelete={() => handleDelete(bot)}
                onView={() => navigation.navigate('BotDetail', { botId: bot.id })}
              />
            ))}
          </Section>
        )}

        {isLoading && customBots.length === 0 && (
          <View style={styles.loadingContainer}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={styles.skeletonRow}>
                <SkeletonCircle size={Space.xl + Space.xs} />
                <View style={styles.skeletonCopy}>
                  <SkeletonBlock width="55%" height={13} />
                  <SkeletonBlock width="60%" height={11} />
                </View>
              </View>
            ))}
          </View>
        )}

        {!isLoading && loadError && customBots.length === 0 && (
          <FlagshipState
            variant={isOffline ? 'offline' : 'error'}
            title={isOffline ? "You're offline" : "Couldn't load your agents"}
            subtitle={
              isOffline
                ? 'Reconnect to see your agents.'
                : 'Check your connection and try again.'
            }
            actionLabel="Try again"
            onAction={() => void refresh()}
            style={styles.stateWrap}
          />
        )}

        {!isLoading && !loadError && customBots.length === 0 && (
          <View style={styles.empty}>
            <View style={styles.emptyMark}>
              <AppIcon name="chatbubble-ellipses-outline" size={IconSize.lg} color="textPrimary" opticalCenter accessible={false} />
            </View>
            <Text style={styles.emptyTitle}>Create an agent that works your way</Text>
            <Caption color={colors.textSecondary} style={styles.emptyText}>
              Give it a specialty, clear boundaries, and the context it needs. You decide when it joins a chat.
            </Caption>
            <AnimatedPressable
              onPress={() => navigation.navigate('BotBuilder', {})}
              activeOpacity={0.7}
              scaleValue={0.98}
              hapticFeedback="light"
              style={styles.createEmptyBtn}
            >
              <Text style={styles.createEmptyBtnText}>Create your first agent</Text>
            </AnimatedPressable>
            <Caption color={colors.textMuted} style={styles.emptyNote}>
              Agents stay private to your account until you connect them.
            </Caption>
          </View>
        )}
      </ScrollView>

      <ConfirmationSheet
        visible={confirmSheet.visible}
        onDismiss={() => setConfirmSheet((prev) => ({ ...prev, visible: false }))}
        title={confirmSheet.title}
        message={confirmSheet.message}
        confirmLabel={confirmSheet.confirmLabel ?? 'Confirm'}
        variant={confirmSheet.variant ?? 'default'}
        onConfirm={confirmSheet.onConfirm}
      />
    </FlagshipScreen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const items = React.Children.toArray(children);
  return (
    <View style={styles.section}>
      <Meta color={colors.textMuted} style={styles.sectionLabel}>
        {title}
      </Meta>
      <View>
        {items.map((child, index) => (
          <React.Fragment key={index}>
            {child}
            {index < items.length - 1 ? <View style={styles.rowDivider} /> : null}
          </React.Fragment>
        ))}
      </View>
    </View>
  );
}

function BotRow({
  bot,
  deploymentCount,
  onEdit,
  onDelete,
  onView }: {
  bot: { id: string; name: string; description: string; category: string; isDraft?: boolean; runtimeReady?: boolean; agentConfig?: { model: string } };
  deploymentCount: number;
  onEdit: () => void;
  onDelete: () => void;
  onView: () => void;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <AnimatedPressable
      onPress={onView}
      activeOpacity={0.7}
      scaleValue={0.98}
      hapticFeedback="light"
      accessibilityRole="button"
      accessibilityLabel={`View ${bot.name}`}
    >
      <View style={styles.row}>
        <AgentIcon
          category={bot.category}
          name={bot.name}
          size={21}
          color={colors.textPrimary}
        />

        <View style={styles.botText}>
          <BodyEmphasis numberOfLines={1}>{bot.name}</BodyEmphasis>
          <Caption color={colors.textMuted} numberOfLines={1}>
            {bot.isDraft
              ? 'Draft'
              : bot.runtimeReady === false
                ? 'Provider setup needed'
                : `${deploymentCount} chat${deploymentCount !== 1 ? 's' : ''} · ${bot.agentConfig?.model ?? 'AI'}`}
          </Caption>
        </View>

        <View style={styles.rowActions}>
          <AnimatedPressable
            style={styles.rowAction}
            onPress={onEdit}
            activeOpacity={0.7}
            scaleValue={0.92}
            hapticFeedback="light"
            accessibilityRole="button"
            accessibilityLabel="Edit agent"
          >
            <AppIcon name="edit" size={IconSize.md} color="textSecondary" opticalCenter accessible={false} />
          </AnimatedPressable>

          <AnimatedPressable
            style={styles.rowAction}
            onPress={onDelete}
            activeOpacity={0.7}
            scaleValue={0.92}
            hapticFeedback="light"
            accessibilityRole="button"
            accessibilityLabel="Delete agent"
          >
            <AppIcon name="trash" size={IconSize.md} color="danger" opticalCenter accessible={false} />
          </AnimatedPressable>
        </View>
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
  createBtn: {
    width: Control.hit,
    height: Control.hit,
    justifyContent: 'center',
    alignItems: 'center' },
  section: {
    gap: Space.sm },
  sectionLabel: {
    fontSize: TypographyV2.meta.size,
    letterSpacing: TypographyV2.meta.letterSpacing,
    marginLeft: Space.xs },
  offlineNote: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: Space.xl + Space.xs + Space.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Space.sm + 2,
    minHeight: Control.hit,
    gap: Space.sm },
  loadingContainer: {
    gap: Space.md,
    paddingTop: Space.md },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm + 2 },
  skeletonCopy: {
    flex: 1,
    gap: Space.xs },
  stateWrap: {
    paddingTop: Space.xxl },
  botText: {
    flex: 1,
    justifyContent: 'center',
    gap: Space.xs / 2 },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center' },
  rowAction: {
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center' },
  empty: {
    alignItems: 'center',
    paddingHorizontal: Space.lg,
    paddingTop: Space.xxl + Space.xxl + Space.xxl - 24,
    gap: Space.smMd },
  emptyMark: {
    width: Space.xl + Space.xl - 4,
    height: Space.xl + Space.xl - 4,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Space.sm },
  emptyTitle: {
    maxWidth: Space.xxl + Space.xxl + Space.xxl + Space.xxl + Space.xxl + Space.xxl + Space.xxl + Space.xxl + Space.xxl + Space.xxl + Space.xxl + Space.xxl + Space.xl - 4,
    textAlign: 'center',
    color: colors.textPrimary,
    fontSize: TypographyV2.sectionTitle.size,
    lineHeight: TypographyV2.sectionTitle.lineHeight,
    fontFamily: TypographyV2.sectionTitle.fontFamily },
  emptyText: {
    textAlign: 'center',
    maxWidth: Space.xxl * 6 + Space.lg - 2,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight + 1 },
  createEmptyBtn: {
    backgroundColor: colors.brand,
    paddingHorizontal: Space.md,
    paddingVertical: Space.smMd,
    borderRadius: Radius.lg },
  createEmptyBtnText: {
    color: colors.textInverse,
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily },
  emptyNote: {
    marginTop: Space.xs,
    textAlign: 'center',
    lineHeight: TypographyV2.meta.lineHeight + 1 } });
}
