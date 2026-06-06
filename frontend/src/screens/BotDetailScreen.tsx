import React, { useMemo, useState } from 'react';
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
import { AppButton } from '../components/ui/AppButton';

type Props = StackScreenProps<RootStackParamList, 'BotDetail'>;

export default function BotDetailScreen({ navigation, route }: Props) {
  const { botId, conversationId } = route.params;
  const { isDark } = useAppTheme();
  const { show } = useToast();
  const haptic = useHaptic();

  const bots = useStore((state) => state.availableChatBots);
  const conversations = useStore((state) => state.conversations);
  const deployBotToConversation = useStore((state) => state.deployBotToConversation);
  const undeployBotFromConversation = useStore((state) => state.undeployBotFromConversation);
  const isBotEnabled = useStore((state) => state.isBotEnabled);
  const toggleEnabledBot = useStore((state) => state.toggleEnabledBot);

  const bot = useMemo(() => bots.find((b) => b.id === botId), [bots, botId]);

  const isDeployedInGroup = useMemo(() => {
    if (!conversationId) return false;
    const convo = conversations.find((c) => c.id === conversationId);
    return convo?.botIds?.includes(botId) ?? false;
  }, [conversations, conversationId, botId]);

  const [isToggling, setIsToggling] = useState(false);

  if (!bot) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <ScreenHeader title="Bot" onBack={() => navigation.goBack()} />
        <View style={styles.center}>
          <Caption color={Colors.textMuted}>Bot not found</Caption>
        </View>
      </SafeAreaView>
    );
  }

  const statusLabel =
    bot.status === 'available'
      ? 'Available'
      : bot.status === 'local-only'
      ? 'Local-only'
      : 'Backend required';

  const statusColor =
    bot.status === 'available'
      ? Colors.brand
      : bot.status === 'local-only'
      ? Colors.textSecondary
      : Colors.textMuted;

  const handleDeploy = () => {
    if (!conversationId) return;
    haptic.success();
    deployBotToConversation(conversationId, botId);
    show(`${bot.name} deployed to group`, 'success');
    navigation.goBack();
  };

  const handleRemove = () => {
    if (!conversationId) return;
    Alert.alert(
      'Remove bot?',
      `${bot.name} will stop responding in this group.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            haptic.medium();
            undeployBotFromConversation(conversationId, botId);
            show(`${bot.name} removed`, 'info');
            navigation.goBack();
          },
        },
      ]
    );
  };

  const handleToggleGlobal = () => {
    setIsToggling(true);
    haptic.light();
    toggleEnabledBot(botId);
    const nowEnabled = !isBotEnabled(botId);
    show(
      nowEnabled ? 'Bot enabled in your account' : 'Bot disabled',
      nowEnabled ? 'success' : 'info'
    );
    setTimeout(() => setIsToggling(false), 300);
  };

  const categoryLabel =
    bot.category === 'moderation'
      ? 'Moderation'
      : bot.category === 'commerce'
      ? 'Commerce'
      : bot.category === 'safety'
      ? 'Safety'
      : bot.category === 'automation'
      ? 'Automation'
      : bot.category === 'styling'
      ? 'Styling'
      : 'Assistant';

  const contextLabels = [
    bot.category === 'moderation' ? 'Group' : undefined,
    bot.category === 'commerce' ? 'Marketplace' : undefined,
    bot.category === 'safety' ? 'All chats' : undefined,
    bot.category === 'assistant' ? 'DM / Group' : undefined,
    bot.category === 'automation' ? 'Group' : undefined,
  ].filter(Boolean) as string[];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <ScreenHeader title="Bot Details" onBack={() => navigation.goBack()} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {/* Identity */}
        <View style={styles.identity}>
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
              size={32}
              color={Colors.textPrimary}
            />
          </View>
          <BodyEmphasis style={styles.botName}>{bot.name}</BodyEmphasis>
          <Caption color={Colors.textMuted}>{categoryLabel}</Caption>
          <View style={[styles.statusPill, { backgroundColor: statusColor + '18' }]}>
            <Text style={[styles.statusPillText, { color: statusColor }]}>{statusLabel}</Text>
          </View>
        </View>

        {/* Description */}
        <Card>
          <Caption color={Colors.textPrimary} style={styles.description}>
            {bot.description}
          </Caption>
        </Card>

        {/* Command */}
        <Section title="Command">
          <Card>
            <View style={styles.commandRow}>
              <Ionicons name="terminal-outline" size={18} color={Colors.textMuted} />
              <BodyEmphasis style={styles.commandText}>{bot.commandHint}</BodyEmphasis>
            </View>
          </Card>
        </Section>

        {/* Permissions */}
        <Section title="Permissions">
          <Card>
            {bot.permissions.length === 0 ? (
              <Caption color={Colors.textMuted}>No special permissions required.</Caption>
            ) : (
              bot.permissions.map((perm) => (
                <View key={perm} style={styles.permissionRow}>
                  <Ionicons name="checkmark-circle-outline" size={16} color={Colors.brand} />
                  <Caption color={Colors.textPrimary} style={styles.permissionText}>
                    {perm}
                  </Caption>
                </View>
              ))
            )}
          </Card>
        </Section>

        {/* Compatible contexts */}
        <Section title="Works in">
          <Card>
            <View style={styles.contextRow}>
              {contextLabels.map((ctx) => (
                <View key={ctx} style={styles.contextPill}>
                  <Caption color={Colors.textSecondary}>{ctx}</Caption>
                </View>
              ))}
              {contextLabels.length === 0 && (
                <Caption color={Colors.textMuted}>All chat contexts</Caption>
              )}
            </View>
          </Card>
        </Section>

        {/* Global toggle */}
        <Section title="Account setting">
          <Card>
            <AnimatedPressable
              onPress={handleToggleGlobal}
              activeOpacity={0.7}
              scaleValue={0.98}
              hapticFeedback="light"
              style={styles.toggleRow}
              accessibilityRole="switch"
              accessibilityLabel="Toggle bot globally"
              accessibilityState={{ checked: isBotEnabled(botId) }}
            >
              <BodyEmphasis>Enabled in my account</BodyEmphasis>
              <Ionicons
                name={isBotEnabled(botId) ? 'toggle' : 'toggle-outline'}
                size={28}
                color={isBotEnabled(botId) ? Colors.brand : Colors.textMuted}
              />
            </AnimatedPressable>
            <Caption color={Colors.textMuted} style={styles.toggleHint}>
              This controls whether the bot can be deployed to your groups. It does not affect deployments already made.
            </Caption>
          </Card>
        </Section>

        {/* Group action */}
        {conversationId && (
          <View style={styles.groupAction}>
            {isDeployedInGroup ? (
              <AppButton
                title="Remove from group"
                variant="secondary"
                size="md"
                align="center"
                onPress={handleRemove}
              />
            ) : (
              <AppButton
                title="Deploy to group"
                variant="primary"
                size="md"
                align="center"
                onPress={handleDeploy}
              />
            )}
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
        {title.toUpperCase()}
      </Meta>
      {children}
    </View>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.card}>{children}</View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.xxl,
    gap: Space.md,
  },
  identity: {
    alignItems: 'center',
    paddingVertical: Space.xl,
    gap: Space.sm,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  botName: {
    fontSize: Type.title.size,
    marginTop: Space.sm,
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.md,
    marginTop: Space.xs,
  },
  statusPillText: {
    fontSize: 11,
    fontFamily: Typography.family.bold,
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
    padding: Space.md,
    gap: Space.sm,
  },
  description: {
    fontSize: Type.body.size,
    lineHeight: 22,
  },
  commandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  commandText: {
    fontFamily: Typography.family.regular,
    fontSize: Type.body.size,
  },
  permissionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: 4,
  },
  permissionText: {
    flex: 1,
  },
  contextRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm,
  },
  contextPill: {
    backgroundColor: Colors.surfaceAlt,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.md,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  toggleHint: {
    marginTop: Space.xs,
    lineHeight: 18,
  },
  groupAction: {
    marginTop: Space.md,
  },
});
