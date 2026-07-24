import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  StatusBar,
} from 'react-native';
import { StackScreenProps } from '@react-navigation/stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useAppTheme } from '../theme/ThemeContext';
import { Colors } from '../constants/colors';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { AgentIcon } from '../components/agents/AgentIcon';
import { useHaptic } from '../hooks/useHaptic';
import { Caption, BodyEmphasis, Meta } from '../components/ui/Text';

type Props = StackScreenProps<RootStackParamList, 'CustomBots'>;

export default function CustomBotsScreen({ navigation }: Props) {
  const { isDark } = useAppTheme();
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
              <Ionicons name="add" size={22} color={Colors.textPrimary} />
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
              <Ionicons name="chatbubble-ellipses-outline" size={25} color={Colors.textPrimary} />
            </View>
            <Text style={styles.emptyTitle}>Create an agent that works your way</Text>
            <Caption color={Colors.textSecondary} style={styles.emptyText}>
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
            <Caption color={Colors.textMuted} style={styles.emptyNote}>
              Agents stay private to your account until you connect them.
            </Caption>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Meta color={Colors.textMuted} style={styles.sectionLabel}>
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
            color={Colors.textPrimary}
          />
        </View>

        <View style={styles.botText}>
          <BodyEmphasis numberOfLines={1}>{bot.name}</BodyEmphasis>
          <Caption color={Colors.textMuted} numberOfLines={1}>
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
            <Ionicons name="create-outline" size={20} color={Colors.textSecondary} />
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
            <Ionicons name="trash-outline" size={20} color={Colors.danger} />
          </AnimatedPressable>
        </View>
      </View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.xxl,
    gap: Space.lg,
  },
  createBtn: {
    width: 44,
    height: 44,
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
    backgroundColor: Colors.background,
    gap: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: Space.sm,
  },
  iconWrap: {
    width: 32,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  botText: {
    flex: 1,
    justifyContent: 'center',
    gap: 2,
  },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowAction: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    alignItems: 'center',
    paddingHorizontal: Space.lg,
    paddingTop: 72,
    gap: 12,
  },
  emptyMark: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Space.sm,
  },
  emptyTitle: {
    maxWidth: 300,
    textAlign: 'center',
    color: Colors.textPrimary,
    fontSize: Type.subtitle.size,
    lineHeight: Type.subtitle.lineHeight,
    fontFamily: Typography.family.semibold,
  },
  emptyText: {
    textAlign: 'center',
    maxWidth: 310,
    fontSize: Type.captionElevated.size,
    lineHeight: 19,
  },
  createEmptyBtn: {
    backgroundColor: Colors.brand,
    paddingHorizontal: Space.md,
    paddingVertical: 12,
    borderRadius: Radius.lg,
  },
  createEmptyBtnText: {
    color: Colors.textInverse,
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
  },
  emptyNote: {
    marginTop: Space.xs,
    textAlign: 'center',
    lineHeight: 17,
  },
});
