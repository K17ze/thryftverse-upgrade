import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StackScreenProps } from '@react-navigation/stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AgentIcon } from '../components/agents/AgentIcon';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { ChatInfoRow, ChatInfoSection } from '../components/chat/ChatInfoSection';
import { AppButton } from '../components/ui/AppButton';
import { Caption } from '../components/ui/Text';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { Colors } from '../constants/colors';
import { useToast } from '../context/ToastContext';
import { useHaptic } from '../hooks/useHaptic';
import { RootStackParamList } from '../navigation/types';
import {
  deployBotToConversationOnApi,
  undeployBotFromConversationOnApi,
} from '../services/chatApi';
import { useStore } from '../store/useStore';
import { Space, Type, Typography } from '../theme/designTokens';
import { useAppTheme } from '../theme/ThemeContext';

type Props = StackScreenProps<RootStackParamList, 'BotDetail'>;

export default function BotDetailScreen({ navigation, route }: Props) {
  const { botId, conversationId } = route.params;
  const { isDark } = useAppTheme();
  const { show } = useToast();
  const haptic = useHaptic();
  const bots = useStore((state) => state.availableChatBots);
  const customBots = useStore((state) => state.customBots);
  const conversations = useStore((state) => state.conversations);
  const deployBotToConversation = useStore((state) => state.deployBotToConversation);
  const undeployBotFromConversation = useStore((state) => state.undeployBotFromConversation);
  const [isDeploying, setIsDeploying] = useState(false);

  const allBots = useMemo(() => [...bots, ...customBots], [bots, customBots]);
  const bot = useMemo(() => allBots.find((item) => item.id === botId), [allBots, botId]);
  const connectedToCurrentChat = useMemo(() => {
    if (!conversationId) return false;
    return conversations
      .find((conversation) => conversation.id === conversationId)
      ?.botIds?.includes(botId) ?? false;
  }, [conversations, conversationId, botId]);
  const connectedGroups = useMemo(
    () =>
      conversations.filter(
        (conversation) =>
          conversation.type === 'group' && conversation.botIds?.includes(botId)
      ),
    [conversations, botId]
  );

  if (!bot) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <ScreenHeader title="Agent details" onBack={() => navigation.goBack()} />
        <View style={styles.center}>
          <Caption color={Colors.textMuted}>Agent not found</Caption>
        </View>
      </SafeAreaView>
    );
  }

  const isCustomAgent = bot.type === 'custom';
  const statusLabel =
    bot.runtimeReady === false
      ? 'Provider setup needed'
      : bot.isDraft
        ? 'Draft'
        : bot.status === 'available'
          ? 'Ready'
          : bot.status === 'local-only'
            ? 'Limited runtime'
            : 'Setup required';
  const invocation =
    bot.agentConfig?.triggerMode === 'mention'
      ? `@${bot.slug}`
      : bot.agentConfig?.triggerMode === 'always'
        ? 'Every message'
        : bot.commandHint;
  const contextLabels = [
    bot.category === 'moderation' ? 'Group chats' : undefined,
    bot.category === 'commerce' ? 'Marketplace chats' : undefined,
    bot.category === 'safety' ? 'All supported chats' : undefined,
    bot.category === 'assistant' ? 'Direct and group chats' : undefined,
    bot.category === 'automation' ? 'Group chats' : undefined,
  ].filter(Boolean) as string[];

  const connect = async () => {
    if (!conversationId) return;
    setIsDeploying(true);
    try {
      await deployBotToConversationOnApi(conversationId, botId);
      deployBotToConversation(conversationId, botId);
      haptic.success();
      show(`${bot.name} connected`, 'success');
      navigation.goBack();
    } catch {
      show('Failed to connect agent. Please try again.', 'error');
    } finally {
      setIsDeploying(false);
    }
  };

  const remove = () => {
    if (!conversationId) return;
    Alert.alert('Remove agent?', `${bot.name} will stop responding in this chat.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setIsDeploying(true);
          try {
            await undeployBotFromConversationOnApi(conversationId, botId);
            undeployBotFromConversation(conversationId, botId);
            haptic.medium();
            show(`${bot.name} removed`, 'info');
            navigation.goBack();
          } catch {
            show('Failed to remove agent. Please try again.', 'error');
          } finally {
            setIsDeploying(false);
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <ScreenHeader
        title="Agent details"
        onBack={() => navigation.goBack()}
        rightAction={
          isCustomAgent ? (
            <AnimatedPressable
              onPress={() => navigation.navigate('BotBuilder', { botId: bot.id })}
              style={styles.headerAction}
              activeOpacity={0.68}
              scaleValue={0.92}
              hapticFeedback="light"
              accessibilityRole="button"
              accessibilityLabel="Edit agent"
            >
              <Ionicons name="create-outline" size={21} color={Colors.textPrimary} />
            </AnimatedPressable>
          ) : undefined
        }
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.identity}>
          <View style={styles.identityIcon}>
            <AgentIcon
              category={bot.category}
              name={bot.name}
              size={25}
              color={Colors.textPrimary}
            />
          </View>
          <View style={styles.identityCopy}>
            <Text style={styles.agentName} numberOfLines={1}>
              {bot.name}
            </Text>
            <Text style={styles.identityMeta}>
              {bot.category} · {isCustomAgent ? 'Your agent' : 'ThryftVerse agent'} · {statusLabel}
            </Text>
          </View>
        </View>

        <Text style={styles.description}>{bot.description}</Text>

        <ChatInfoSection title="How it joins">
          <ChatInfoRow
            icon={bot.agentConfig?.triggerMode === 'mention' ? 'at' : 'terminal-outline'}
            label={invocation}
            subtitle={
              bot.agentConfig?.triggerMode === 'always'
                ? 'Responds automatically to messages in connected chats'
                : 'Use this in a connected chat to invoke the agent'
            }
          />
        </ChatInfoSection>

        {bot.agentConfig ? (
          <ChatInfoSection title="Intelligence">
            <ChatInfoRow icon="server-outline" label="Model" detail={bot.agentConfig.model} />
            <ChatInfoRow icon="chatbox-outline" label="Voice" detail={bot.agentConfig.tone} />
            <ChatInfoRow
              icon="reader-outline"
              label="Conversation context"
              detail={`${bot.agentConfig.historyLimit} messages`}
            />
            {bot.runtimeReady === false ? (
              <ChatInfoRow
                icon="alert-circle-outline"
                label="Runtime unavailable"
                subtitle={bot.runtimeReadinessReason || 'The AI provider is not configured.'}
              />
            ) : null}
          </ChatInfoSection>
        ) : null}

        <ChatInfoSection title="Access">
          {bot.permissions.length > 0 ? (
            bot.permissions.map((permission) => (
              <ChatInfoRow
                key={permission}
                icon="checkmark-circle-outline"
                label={permission.replace(/_/g, ' ')}
              />
            ))
          ) : (
            <ChatInfoRow
              icon="lock-closed-outline"
              label="No additional access"
              subtitle="This agent does not request special permissions"
            />
          )}
          <ChatInfoRow
            icon="chatbubbles-outline"
            label="Supported conversations"
            detail={contextLabels.join(', ') || 'All chat contexts'}
          />
        </ChatInfoSection>

        {connectedGroups.length > 0 ? (
          <ChatInfoSection title="Connected chats">
            {connectedGroups.map((group) => (
              <ChatInfoRow
                key={group.id}
                icon="people-outline"
                label={group.title || 'Untitled group'}
                detail={`${group.participantIds?.length || 0} members`}
              />
            ))}
          </ChatInfoSection>
        ) : null}

        {conversationId ? (
          <View style={styles.chatAction}>
            <AppButton
              title={connectedToCurrentChat ? 'Remove from chat' : 'Connect to chat'}
              variant={connectedToCurrentChat ? 'secondary' : 'primary'}
              size="md"
              align="center"
              onPress={connectedToCurrentChat ? remove : connect}
              loading={isDeploying}
              disabled={bot.isDraft || bot.runtimeReady === false}
            />
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAction: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.xxl,
    gap: Space.lg,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: Space.sm,
  },
  identityIcon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityCopy: {
    flex: 1,
    gap: 2,
  },
  agentName: {
    color: Colors.textPrimary,
    fontFamily: Typography.family.bold,
    fontSize: Type.title.size,
    letterSpacing: Type.title.letterSpacing,
  },
  identityMeta: {
    color: Colors.textMuted,
    fontFamily: Typography.family.regular,
    fontSize: Type.caption.size,
    textTransform: 'capitalize',
  },
  description: {
    color: Colors.textSecondary,
    fontFamily: Typography.family.regular,
    fontSize: Type.body.size,
    lineHeight: 22,
  },
  chatAction: {
    marginTop: Space.xs,
  },
});
