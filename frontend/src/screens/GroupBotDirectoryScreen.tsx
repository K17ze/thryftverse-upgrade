import React, { useMemo, useState } from 'react';
import { AnimatedPressable } from '../components/AnimatedPressable';
import {
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { StackScreenProps } from '@react-navigation/stack';
import { useAppTheme } from '../theme/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { EmptyState } from '../components/EmptyState';
import { deployBotToConversationOnApi, undeployBotFromConversationOnApi } from '../services/chatApi';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { AppButton } from '../components/ui/AppButton';
import { ChatCard } from '../components/chat/ChatCard';
import { Space, Radius, Type } from '../theme/designTokens';
import { Meta, Caption, BodyEmphasis } from '../components/ui/Text';
import { useHaptic } from '../hooks/useHaptic';
import { Typography } from '../theme/designTokens';

type Props = StackScreenProps<RootStackParamList, 'GroupBotDirectory'>;

export default function GroupBotDirectoryScreen({ navigation, route }: Props) {
  const { conversationId } = route.params;
  const { colors, isDark } = useAppTheme();
  const { show } = useToast();
  const haptic = useHaptic();
  const [pendingBotId, setPendingBotId] = useState<string | null>(null);

  const conversations = useStore((state) => state.conversations);
  const bots = useStore((state) => state.availableChatBots);
  const deployBotToConversation = useStore((state) => state.deployBotToConversation);
  const undeployBotFromConversation = useStore((state) => state.undeployBotFromConversation);

  const conversation = useMemo(
    () => conversations.find((item) => item.id === conversationId),
    [conversationId, conversations]
  );

  const deployedBotIds = conversation?.botIds ?? [];

  const handleToggleBot = async (botId: string, isDeployed: boolean) => {
    if (!conversation || conversation.type !== 'group') {
      show('Bots can only be deployed inside group chats.', 'error');
      return;
    }

    setPendingBotId(botId);

    try {
      if (isDeployed) {
        await undeployBotFromConversationOnApi(conversation.id, botId);
        undeployBotFromConversation(conversation.id, botId);
        show('Bot removed from group.', 'info');
        haptic.light();
        return;
      }

      await deployBotToConversationOnApi(conversation.id, botId);
      deployBotToConversation(conversation.id, botId);
      show('Bot deployed to group.', 'success');
      haptic.success();
      return;
    } catch {
      show('Failed to sync bot. Please try again.', 'error');
    } finally {
      setPendingBotId(null);
    }
  };

  return (
    <FlagshipScreen header={<FlagshipHeader title="Group Bots" onBack={() => navigation.goBack()} />} scrollEnabled={false}>

      {!conversation || conversation.type !== 'group' ? (
        <EmptyState
          icon="alert-circle-outline"
          title="Group not found"
          subtitle="Open this directory from a group chat to deploy bots."
        />
      ) : (
        <FlashList
          data={bots}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: Space.sm + 2 }} />}
          renderItem={({ item, index }) => {
            const deployed = deployedBotIds.includes(item.id);
            const isPending = pendingBotId === item.id;

            return (
              <View>
                <ChatCard variant="surface">
                  <View style={styles.botHeadRow}>
                    <View style={styles.botIconWrap}>
                      <Ionicons
                        name={item.category === 'moderation' ? 'shield-checkmark-outline' : item.category === 'commerce' ? 'trending-up-outline' : 'flash-outline'}
                        size={20}
                        color={colors.textPrimary}
                      />
                    </View>

                    <View style={styles.botTextWrap}>
                      <BodyEmphasis>{item.name}</BodyEmphasis>
                      <Meta>{item.category.toUpperCase()}</Meta>
                    </View>

                    <AppButton
                      style={[styles.deployBtn, deployed && styles.deployBtnActive]}
                      variant={deployed ? 'primary' : 'secondary'}
                      size="sm"
                      title={isPending ? 'Syncing...' : deployed ? 'Remove' : 'Deploy'}
                      onPress={() => {
                        void handleToggleBot(item.id, deployed);
                      }}
                      disabled={isPending}
                      accessibilityLabel={isPending ? 'Syncing bot' : deployed ? 'Remove bot' : 'Deploy bot'}
                      accessibilityRole="button"
                      accessibilityHint={deployed ? 'Removes this bot from the group' : 'Deploys this bot to the group'}
                    />
                  </View>

                  <Caption color={colors.textSecondary} style={styles.botDescription}>{item.description}</Caption>
                  <View style={styles.commandPill}>
                    <Caption color={colors.textPrimary} style={styles.commandText}>{item.commandHint}</Caption>
                  </View>
                </ChatCard>
              </View>
            );
          }}
        />
      )}
    </FlagshipScreen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.xxl,
  },
  botHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm + 2,
  },
  botIconWrap: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  botTextWrap: { flex: 1 },
  deployBtn: {
    minWidth: 80,
    height: 34,
    borderRadius: Radius.full,
    paddingHorizontal: Space.sm + 4,
  },
  deployBtnActive: {
  },
  botDescription: {
    marginTop: Space.sm + 4,
    lineHeight: 19,
  },
  commandPill: {
    marginTop: Space.sm + 4,
    alignSelf: 'flex-start',
    borderRadius: Radius.sm,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs + 2,
  },
  commandText: {
    fontFamily: Typography.family.semibold,
  },
});