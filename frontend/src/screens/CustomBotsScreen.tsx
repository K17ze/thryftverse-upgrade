import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  StatusBar,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, Radius, Type, Typography, Control } from '../theme/designTokens';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { AgentIcon } from '../components/agents/AgentIcon';
import { useHaptic } from '../hooks/useHaptic';
import { Caption, BodyEmphasis, Meta } from '../components/ui/Text';

type Props = NativeStackScreenProps<RootStackParamList, 'CustomBots'>;

export default function CustomBotsScreen({ navigation }: Props) {
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { show } = useToast();
  const haptic = useHaptic();

  const customBots = useStore((state) => state.customBots);
  const deleteCustomBot = useStore((state) => state.deleteCustomBot);
  const loadBotsFromApi = useStore((state) => state.loadBotsFromApi);
  const conversations = useStore((state) => state.conversations);

  const [isLoading, setIsLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    loadBotsFromApi().finally(() => {
      if (!cancelled) setIsLoading(false);
    });
    return () => { cancelled = true; };
  }, [loadBotsFromApi]);

  const active = useMemo(() => customBots.filter((b) => !b.isDraft && !b.isDisabled), [customBots]);
  const drafts = useMemo(() => customBots.filter((b) => b.isDraft), [customBots]);
  const disabled = useMemo(() => customBots.filter((b) => b.isDisabled), [customBots]);

  const getDeploymentCount = (botId: string) =>
    conversations.filter((c) => c.botIds?.includes(botId)).length;

  const handleDelete = (bot: { id: string; name: string }) => {
    Alert.alert(
      'Delete bot?',
      `${bot.name} will be permanently deleted and removed from all groups.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            haptic.heavy();
            setDeletingId(bot.id);
            try {
              await deleteCustomBot(bot.id);
              show(`${bot.name} deleted`, 'info');
            } catch {
              show('Failed to delete bot', 'error');
            } finally {
              setDeletingId(null);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <ScreenHeader
        title="My agents"
        onBack={() => navigation.goBack()}
        rightAction={
          <AnimatedPressable
            onPress={() => navigation.navigate('BotBuilder', {})}
            activeOpacity={0.7}
            scaleValue={0.92}
            hapticFeedback="light"
            accessibilityRole="button"
            accessibilityLabel="Create bot"
          >
            <View style={styles.createBtn}>
              <Ionicons name="add" size={22} color={colors.textPrimary} />
            </View>
          </AnimatedPressable>
        }
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
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

        {customBots.length === 0 && (
          <View style={styles.empty}>
            <View style={styles.emptyMark}>
              <Ionicons name="chatbubble-ellipses-outline" size={25} color={colors.textPrimary} />
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
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.section}>
      <Meta color={colors.textMuted} style={styles.sectionLabel}>
        {title}
      </Meta>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function BotRow({
  bot,
  deploymentCount,
  onEdit,
  onDelete,
  onView,
}: {
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
        <View style={styles.iconWrap}>
          <AgentIcon
            category={bot.category}
            name={bot.name}
            size={21}
            color={colors.textPrimary}
          />
        </View>

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
            accessibilityLabel="Edit bot"
          >
            <Ionicons name="create-outline" size={20} color={colors.textSecondary} />
          </AnimatedPressable>

          <AnimatedPressable
            style={styles.rowAction}
            onPress={onDelete}
            activeOpacity={0.7}
            scaleValue={0.92}
            hapticFeedback="light"
            accessibilityRole="button"
            accessibilityLabel="Delete bot"
          >
            <Ionicons name="trash-outline" size={20} color={colors.danger} />
          </AnimatedPressable>
        </View>
      </View>
    </AnimatedPressable>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.xxl,
    gap: Space.lg,
  },
  createBtn: {
    width: Control.hit,
    height: Control.hit,
    justifyContent: 'center',
    alignItems: 'center',
  },
  section: {
    gap: Space.sm,
  },
  sectionLabel: {
    fontSize: Type.meta.size,
    letterSpacing: Type.meta.letterSpacing,
    marginLeft: Space.xs,
  },
  card: {
    backgroundColor: colors.background,
    gap: Space.xs / 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Space.sm + 2,
    gap: Space.sm,
  },
  iconWrap: {
    width: Space.xl + Space.xs,
    height: Control.hit,
    justifyContent: 'center',
    alignItems: 'center',
  },
  botText: {
    flex: 1,
    justifyContent: 'center',
    gap: Space.xs / 2,
  },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowAction: {
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    alignItems: 'center',
    paddingHorizontal: Space.lg,
    paddingTop: Space.xxl + Space.xxl + Space.xxl - 24,
    gap: Space.sm + 4,
  },
  emptyMark: {
    width: Space.xl + Space.xl - 4,
    height: Space.xl + Space.xl - 4,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Space.sm,
  },
  emptyTitle: {
    maxWidth: Space.xxl + Space.xxl + Space.xxl + Space.xxl + Space.xxl + Space.xxl + Space.xxl + Space.xxl + Space.xxl + Space.xxl + Space.xxl + Space.xxl + Space.xl - 4,
    textAlign: 'center',
    color: colors.textPrimary,
    fontSize: Type.subtitle.size,
    lineHeight: Type.subtitle.lineHeight,
    fontFamily: Typography.family.semibold,
  },
  emptyText: {
    textAlign: 'center',
    maxWidth: Space.xxl * 6 + Space.lg - 2,
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight + 1,
  },
  createEmptyBtn: {
    backgroundColor: colors.brand,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 4,
    borderRadius: Radius.lg,
  },
  createEmptyBtnText: {
    color: colors.textInverse,
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
  },
  emptyNote: {
    marginTop: Space.xs,
    textAlign: 'center',
    lineHeight: Type.caption.lineHeight + 1,
  },
  });
}
