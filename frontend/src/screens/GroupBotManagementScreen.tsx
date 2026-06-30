import React, { useMemo, useState } from 'react';
import { deployBotToConversationOnApi, undeployBotFromConversationOnApi } from '../services/chatApi';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import { StackScreenProps } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useAppTheme } from '../theme/ThemeContext';
import { Colors } from '../constants/colors';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { useHaptic } from '../hooks/useHaptic';
import { Caption, BodyEmphasis, Meta } from '../components/ui/Text';

type Props = StackScreenProps<RootStackParamList, 'GroupBotManagement'>;

export default function GroupBotManagementScreen({ navigation, route }: Props) {
  const { conversationId } = route.params;
  const { isDark } = useAppTheme();
  const { show } = useToast();
  const haptic = useHaptic();

  const conversations = useStore((state) => state.conversations);
  const bots = useStore((state) => state.availableChatBots);
  const customBots = useStore((state) => state.customBots);
  const deployBotToConversation = useStore((state) => state.deployBotToConversation);
  const undeployBotFromConversation = useStore((state) => state.undeployBotFromConversation);

  const conversation = useMemo(
    () => conversations.find((c) => c.id === conversationId),
    [conversations, conversationId]
  );

  const deployedBotIds = conversation?.botIds ?? [];
  const allBots = useMemo(() => [...bots, ...customBots], [bots, customBots]);

  const deployedBots = useMemo(
    () => allBots.filter((b) => deployedBotIds.includes(b.id)),
    [allBots, deployedBotIds]
  );

  const availableToDeploy = useMemo(
    () => allBots.filter((b) => !deployedBotIds.includes(b.id) && !b.isDraft && !b.isDisabled && b.status !== 'backend-required'),
    [allBots, deployedBotIds]
  );

  const [pendingBotId, setPendingBotId] = useState<string | null>(null);

  const handleRemove = (botId: string, botName: string) => {
    Alert.alert(
      'Remove bot?',
      `${botName} will stop responding in this group.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            haptic.medium();
            setPendingBotId(botId);
            try {
              await undeployBotFromConversationOnApi(conversationId, botId);
              undeployBotFromConversation(conversationId, botId);
              show(`${botName} removed`, 'info');
            } catch {
              show('Failed to remove bot. Please try again.', 'error');
            } finally {
              setPendingBotId(null);
            }
          },
        },
      ]
    );
  };

  const handleDeploy = async (botId: string) => {
    haptic.success();
    setPendingBotId(botId);
    try {
      await deployBotToConversationOnApi(conversationId, botId);
      deployBotToConversation(conversationId, botId);
      show('Bot deployed', 'success');
    } catch {
      show('Failed to deploy bot. Please try again.', 'error');
    } finally {
      setPendingBotId(null);
    }
  };

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title="Bots"
          onBack={() => navigation.goBack()}
          rightAction={
            <AnimatedPressable
              onPress={() => navigation.navigate('CustomBots')}
              activeOpacity={0.7}
              scaleValue={0.92}
              hapticFeedback="light"
              accessibilityRole="button"
              accessibilityLabel="My bots"
            >
              <View style={styles.headerActionBtn}>
                <Ionicons name="hardware-chip-outline" size={20} color={Colors.textPrimary} />
              </View>
            </AnimatedPressable>
          }
        />
      }
      scrollEnabled={false}
    >

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {/* Deployed bots */}
        {deployedBots.length > 0 && (
          <View style={styles.section}>
            <Meta color={Colors.textMuted} style={styles.sectionLabel}>
              ACTIVE IN THIS GROUP
            </Meta>
            <View style={styles.card}>
              {deployedBots.map((bot, index) => (
                <View key={bot.id}>
                  <BotRow
                    bot={bot}
                    deployed
                    onRemove={() => handleRemove(bot.id, bot.name)}
                    onView={() => navigation.navigate('BotDetail', { botId: bot.id, conversationId })}
                  />
                  {index < deployedBots.length - 1 && <View style={styles.divider} />}
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Available bots */}
        {availableToDeploy.length > 0 && (
          <View style={styles.section}>
            <Meta color={Colors.textMuted} style={styles.sectionLabel}>
              AVAILABLE TO DEPLOY
            </Meta>
            <View style={styles.card}>
              {availableToDeploy.map((bot, index) => (
                <View key={bot.id}>
                  <BotRow
                    bot={bot}
                    onDeploy={() => handleDeploy(bot.id)}
                    onView={() => navigation.navigate('BotDetail', { botId: bot.id, conversationId })}
                  />
                  {index < availableToDeploy.length - 1 && <View style={styles.divider} />}
                </View>
              ))}
            </View>
          </View>
        )}

        {deployedBots.length === 0 && availableToDeploy.length === 0 && (
          <View style={styles.empty}>
            <Ionicons name="hardware-chip-outline" size={40} color={Colors.textMuted} />
            <Caption color={Colors.textMuted} style={styles.emptyText}>
              No bots available for this group.
            </Caption>
          </View>
        )}
      </ScrollView>
    </FlagshipScreen>
  );
}

function BotRow({
  bot,
  deployed,
  onRemove,
  onDeploy,
  onView,
}: {
  bot: { id: string; name: string; category: string; status: string; description: string; commandHint: string; type?: 'system' | 'custom' };
  deployed?: boolean;
  onRemove?: () => void;
  onDeploy?: () => void;
  onView?: () => void;
}) {
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

  return (
    <AnimatedPressable
      onPress={onView}
      activeOpacity={0.7}
      scaleValue={0.98}
      hapticFeedback="light"
      accessibilityRole="button"
      accessibilityLabel={`View ${bot.name}`}
    >
      <View style={styles.botRow}>
        <View style={styles.botIconWrap}>
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
          <View style={styles.botNameRow}>
            <BodyEmphasis numberOfLines={1}>{bot.name}</BodyEmphasis>
            <View style={styles.badgeRow}>
              <View style={[styles.typeBadge, { backgroundColor: bot.type === 'custom' ? Colors.brand + '18' : Colors.surfaceAlt }]}>
                <Text style={[styles.typeBadgeText, { color: bot.type === 'custom' ? Colors.brand : Colors.textSecondary }]}>
                  {bot.type === 'custom' ? 'Custom' : 'System'}
                </Text>
              </View>
              <View style={[styles.statusPill, { backgroundColor: statusColor + '18' }]}>
                <Text style={[styles.statusPillText, { color: statusColor }]}>{statusLabel}</Text>
              </View>
            </View>
          </View>
          <Caption color={Colors.textMuted} numberOfLines={1}>
            {bot.description}
          </Caption>
          {deployed && (
            <Caption color={Colors.brand} style={styles.commandHint}>
              {bot.commandHint}
            </Caption>
          )}
        </View>

        {deployed ? (
          <AnimatedPressable
            onPress={onRemove}
            activeOpacity={0.7}
            scaleValue={0.92}
            hapticFeedback="medium"
            accessibilityRole="button"
            accessibilityLabel={`Remove ${bot.name}`}
          >
            <Ionicons name="remove-circle" size={24} color={Colors.danger} />
          </AnimatedPressable>
        ) : (
          <AnimatedPressable
            onPress={onDeploy}
            activeOpacity={0.7}
            scaleValue={0.92}
            hapticFeedback="light"
            accessibilityRole="button"
            accessibilityLabel={`Deploy ${bot.name}`}
          >
            <Ionicons name="add-circle" size={24} color={Colors.brand} />
          </AnimatedPressable>
        )}
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
  },
  botRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    paddingVertical: 14,
    gap: Space.sm,
  },
  botIconWrap: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
  },
  botText: {
    flex: 1,
    justifyContent: 'center',
    gap: 2,
  },
  botNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  statusPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  statusPillText: {
    fontSize: 10,
    fontFamily: Typography.family.bold,
  },
  commandHint: {
    fontSize: 11,
    marginTop: 2,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginLeft: Space.md + 40 + Space.sm,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: Space.xxl,
    gap: Space.md,
  },
  emptyText: {
    textAlign: 'center',
  },
  headerActionBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  typeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  typeBadgeText: {
    fontSize: 10,
    fontFamily: Typography.family.bold,
  },
});