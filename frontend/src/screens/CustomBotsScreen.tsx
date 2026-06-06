import React, { useMemo } from 'react';
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
import { useHaptic } from '../hooks/useHaptic';
import { Caption, BodyEmphasis, Meta } from '../components/ui/Text';

type Props = StackScreenProps<RootStackParamList, 'CustomBots'>;

export default function CustomBotsScreen({ navigation }: Props) {
  const { isDark } = useAppTheme();
  const { show } = useToast();
  const haptic = useHaptic();

  const customBots = useStore((state) => state.customBots);
  const deleteCustomBot = useStore((state) => state.deleteCustomBot);
  const isBotEnabled = useStore((state) => state.isBotEnabled);
  const toggleEnabledBot = useStore((state) => state.toggleEnabledBot);
  const conversations = useStore((state) => state.conversations);

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
          onPress: () => {
            haptic.heavy();
            deleteCustomBot(bot.id);
            show(`${bot.name} deleted`, 'info');
          },
        },
      ]
    );
  };

  const handleToggle = (botId: string, botName: string) => {
    haptic.light();
    toggleEnabledBot(botId);
    const nowEnabled = !isBotEnabled(botId);
    show(
      nowEnabled ? `${botName} enabled in account` : `${botName} disabled`,
      nowEnabled ? 'success' : 'info'
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <ScreenHeader
        title="My Bots"
        onBack={() => navigation.goBack()}
        rightAction={
          <AnimatedPressable
            onPress={() => navigation.navigate({ name: 'BotBuilder', params: {} })}
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
        {/* Info banner */}
        <View style={styles.infoBanner}>
          <Ionicons name="information-circle-outline" size={18} color={Colors.textMuted} />
          <Caption color={Colors.textMuted} style={styles.infoText}>
            Custom bots are saved locally. They cannot execute AI logic until a backend bot runtime is connected.
          </Caption>
        </View>

        {/* Active bots */}
        {active.length > 0 && (
          <Section title="ACTIVE">
            {active.map((bot) => (
              <BotRow
                key={bot.id}
                bot={bot}
                deploymentCount={getDeploymentCount(bot.id)}
                enabled={isBotEnabled(bot.id)}
                onToggle={() => handleToggle(bot.id, bot.name)}
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
                enabled={false}
                onToggle={() => {}}
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
                enabled={false}
                onToggle={() => handleToggle(bot.id, bot.name)}
                onEdit={() => navigation.navigate('BotBuilder', { botId: bot.id })}
                onDelete={() => handleDelete(bot)}
                onView={() => navigation.navigate('BotDetail', { botId: bot.id })}
              />
            ))}
          </Section>
        )}

        {customBots.length === 0 && (
          <View style={styles.empty}>
            <Ionicons name="hardware-chip-outline" size={40} color={Colors.textMuted} />
            <Caption color={Colors.textMuted} style={styles.emptyText}>
              You have not created any custom bots yet.
            </Caption>
            <AnimatedPressable
              onPress={() => navigation.navigate({ name: 'BotBuilder', params: {} })}
              activeOpacity={0.7}
              scaleValue={0.98}
              hapticFeedback="light"
              style={styles.createEmptyBtn}
            >
              <Text style={styles.createEmptyBtnText}>Create your first bot</Text>
            </AnimatedPressable>
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
  enabled,
  onToggle,
  onEdit,
  onDelete,
  onView,
}: {
  bot: { id: string; name: string; description: string; category: string; isDraft?: boolean };
  deploymentCount: number;
  enabled: boolean;
  onToggle: () => void;
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
        <View style={[styles.iconWrap, { backgroundColor: Colors.surfaceAlt }]}>
          <Ionicons
            name={
              bot.category === 'moderation'
                ? 'shield-checkmark-outline'
                : bot.category === 'commerce'
                ? 'trending-up-outline'
                : bot.category === 'safety'
                ? 'warning-outline'
                : 'flash-outline'
            }
            size={20}
            color={Colors.textPrimary}
          />
        </View>

        <View style={styles.botText}>
          <BodyEmphasis numberOfLines={1}>{bot.name}</BodyEmphasis>
          <Caption color={Colors.textMuted} numberOfLines={1}>
            {bot.isDraft ? 'Draft' : `${deploymentCount} group${deploymentCount !== 1 ? 's' : ''}`}
          </Caption>
        </View>

        <View style={styles.rowActions}>
          <AnimatedPressable
            onPress={onToggle}
            activeOpacity={0.7}
            scaleValue={0.92}
            hapticFeedback="light"
            accessibilityRole="switch"
            accessibilityLabel={enabled ? 'Disable bot' : 'Enable bot'}
          >
            <Ionicons
              name={enabled ? 'toggle' : 'toggle-outline'}
              size={26}
              color={enabled ? Colors.brand : Colors.textMuted}
            />
          </AnimatedPressable>

          <AnimatedPressable
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
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.sm,
    padding: Space.md,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.lg,
  },
  infoText: {
    flex: 1,
    lineHeight: 18,
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
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    overflow: 'hidden',
    gap: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    paddingVertical: 14,
    gap: Space.sm,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
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
    gap: Space.sm,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: Space.xxl,
    gap: Space.md,
  },
  emptyText: {
    textAlign: 'center',
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
});
