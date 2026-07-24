import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StackScreenProps } from '@react-navigation/stack';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { AgentIcon } from '../components/agents/AgentIcon';
import { FlagshipHeader, FlagshipScreen } from '../components/flagship';
import { BodyEmphasis, Caption, Meta } from '../components/ui/Text';
import { Colors } from '../constants/colors';
import { useToast } from '../context/ToastContext';
import { useHaptic } from '../hooks/useHaptic';
import { RootStackParamList } from '../navigation/types';
import {
  deployBotToConversationOnApi,
  undeployBotFromConversationOnApi,
} from '../services/chatApi';
import { useStore } from '../store/useStore';
import { Space, Type } from '../theme/designTokens';

type Props = StackScreenProps<RootStackParamList, 'GroupBotManagement'>;

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
  const { show } = useToast();
  const haptic = useHaptic();
  const conversations = useStore((state) => state.conversations);
  const bots = useStore((state) => state.availableChatBots);
  const customBots = useStore((state) => state.customBots);
  const deployBotToConversation = useStore((state) => state.deployBotToConversation);
  const undeployBotFromConversation = useStore((state) => state.undeployBotFromConversation);
  const [pendingBotId, setPendingBotId] = useState<string | null>(null);

  const conversation = useMemo(
    () => conversations.find((item) => item.id === conversationId),
    [conversations, conversationId]
  );
  const deployedBotIds = conversation?.botIds ?? [];
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
    Alert.alert('Remove agent?', `${botName} will stop responding in this chat.`, [
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
            show('Failed to remove agent. Please try again.', 'error');
          } finally {
            setPendingBotId(null);
          }
        },
      },
    ]);
  };

  const handleDeploy = async (botId: string) => {
    haptic.success();
    setPendingBotId(botId);
    try {
      await deployBotToConversationOnApi(conversationId, botId);
      deployBotToConversation(conversationId, botId);
      show('Agent connected', 'success');
    } catch {
      show('Failed to connect agent. Please try again.', 'error');
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
              accessibilityLabel="My agents"
            >
              <View style={styles.headerAction}>
                <Ionicons name="person-outline" size={21} color={Colors.textPrimary} />
              </View>
            </AnimatedPressable>
          }
        />
      }
      scrollEnabled={false}
    >
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
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
          <View style={styles.empty}>
            <Ionicons name="chatbubble-ellipses-outline" size={30} color={Colors.textMuted} />
            <Caption color={Colors.textMuted} style={styles.emptyText}>
              No agents are ready to connect.
            </Caption>
          </View>
        )}
      </ScrollView>
    </FlagshipScreen>
  );
}

function AgentSection({
  title,
  agents,
  renderAgent,
}: {
  title: string;
  agents: AgentRowModel[];
  renderAgent: (bot: AgentRowModel) => React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Meta color={Colors.textMuted} style={styles.sectionLabel}>
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
  onView,
}: {
  bot: AgentRowModel;
  deployed: boolean;
  pending: boolean;
  onRemove: () => void;
  onDeploy: () => void;
  onView: () => void;
}) {
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
            color={Colors.textPrimary}
          />
        </View>

        <View style={styles.agentText}>
          <BodyEmphasis numberOfLines={1}>{bot.name}</BodyEmphasis>
          <Caption color={Colors.textMuted} numberOfLines={1}>
            {bot.description}
          </Caption>
          <View style={styles.detailLine}>
            <Caption
              color={deployed ? Colors.textPrimary : Colors.textMuted}
              style={styles.detailText}
              numberOfLines={1}
            >
              {deployed ? bot.commandHint : bot.type === 'custom' ? 'Your agent' : 'ThryftVerse agent'}
            </Caption>
            <View style={styles.metaDot} />
            <Caption color={Colors.textMuted} style={styles.statusText} numberOfLines={1}>
              {statusLabel}
            </Caption>
          </View>
        </View>

        {pending ? (
          <View style={styles.rowAction}>
            <ActivityIndicator size="small" color={Colors.textMuted} />
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
              <Ionicons
                name={deployed ? 'remove' : 'add'}
                size={deployed ? 20 : 21}
                color={deployed ? Colors.danger : Colors.textPrimary}
              />
            </View>
          </AnimatedPressable>
        )}
      </View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
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
  },
  agentRow: {
    minHeight: 82,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  agentIcon: {
    width: 32,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  agentText: {
    flex: 1,
    justifyContent: 'center',
    gap: 2,
  },
  detailLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  detailText: {
    fontSize: 11,
    flexShrink: 1,
  },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: Colors.textMuted,
  },
  statusText: {
    fontSize: 11,
    flexShrink: 0,
  },
  rowAction: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginLeft: 44,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: Space.xxl,
    gap: Space.md,
  },
  emptyText: {
    textAlign: 'center',
  },
  headerAction: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
