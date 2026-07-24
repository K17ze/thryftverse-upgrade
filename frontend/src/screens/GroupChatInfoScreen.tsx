import React, { useMemo } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StackScreenProps } from '@react-navigation/stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { ChatInfoRow, ChatInfoSection } from '../components/chat/ChatInfoSection';
import { FlagshipHeader, FlagshipScreen } from '../components/flagship';
import { Caption } from '../components/ui/Text';
import { Colors } from '../constants/colors';
import { useToast } from '../context/ToastContext';
import { useHaptic } from '../hooks/useHaptic';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { Radius, Space, Type, TypeStyles } from '../theme/designTokens';

type Props = StackScreenProps<RootStackParamList, 'GroupChatInfo'>;

export default function GroupChatInfoScreen({ navigation, route }: Props) {
  const { conversationId } = route.params;
  const { show } = useToast();
  const haptic = useHaptic();
  const insets = useSafeAreaInsets();
  const conversations = useStore((state) => state.conversations);
  const archiveConversation = useStore((state) => state.archiveConversation);
  const deleteConversation = useStore((state) => state.deleteConversation);
  const mutedIds = useStore((state) => state.mutedConversationIds);
  const toggleMuted = useStore((state) => state.toggleMutedConversation);

  const conversation = useMemo(
    () => conversations.find((item) => item.id === conversationId),
    [conversations, conversationId]
  );
  const memberCount = conversation?.participantIds?.length ?? 0;
  const connectedAgentCount = conversation?.botIds?.length ?? 0;
  const isMuted = mutedIds.includes(conversationId);

  if (!conversation || conversation.type !== 'group') {
    return (
      <FlagshipScreen
        header={<FlagshipHeader title="Group details" onBack={() => navigation.goBack()} />}
        scrollEnabled={false}
      >
        <View style={styles.center}>
          <Caption color={Colors.textMuted}>Group not found</Caption>
        </View>
      </FlagshipScreen>
    );
  }

  const initials = (conversation.title || 'Group')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const description = (conversation as typeof conversation & { description?: string }).description;

  const leaveGroup = () => {
    Alert.alert(
      'Leave group?',
      'This removes the group from your inbox on this device. Other members keep their copy.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave group',
          style: 'destructive',
          onPress: () => {
            haptic.heavy();
            deleteConversation(conversationId);
            show('Group removed from your inbox', 'info');
            navigation.navigate('MainTabs', { screen: 'Inbox' });
          },
        },
      ]
    );
  };

  const deleteForMe = () => {
    Alert.alert(
      'Delete for me?',
      'This removes the conversation from your inbox on this device.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete for me',
          style: 'destructive',
          onPress: () => {
            haptic.heavy();
            deleteConversation(conversationId);
            show('Conversation removed from your inbox', 'info');
            navigation.navigate('MainTabs', { screen: 'Inbox' });
          },
        },
      ]
    );
  };

  const archive = () => {
    haptic.medium();
    archiveConversation(conversationId);
    show('Conversation archived', 'success');
    navigation.navigate('MainTabs', { screen: 'Inbox' });
  };

  const toggleMute = () => {
    haptic.light();
    toggleMuted(conversationId);
    show(isMuted ? 'Conversation unmuted' : 'Conversation muted', 'success');
  };

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title="Group details"
          onBack={() => navigation.goBack()}
          rightAction={
            <AnimatedPressable
              onPress={() => navigation.navigate('EditGroup', { conversationId })}
              style={styles.headerAction}
              activeOpacity={0.68}
              scaleValue={0.94}
              hapticFeedback="light"
              accessibilityRole="button"
              accessibilityLabel="Edit group"
            >
              <Ionicons name="create-outline" size={21} color={Colors.textPrimary} />
            </AnimatedPressable>
          }
        />
      }
      scrollEnabled={false}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, Space.xl) + Space.lg },
        ]}
      >
        <View style={styles.identity}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <Text style={styles.groupName} numberOfLines={1}>
            {conversation.title || 'Group chat'}
          </Text>
          {description ? (
            <Text style={styles.description} numberOfLines={2}>
              {description}
            </Text>
          ) : null}
          <Text style={styles.identityMeta}>
            {memberCount} member{memberCount === 1 ? '' : 's'}
            {connectedAgentCount > 0
              ? `  ·  ${connectedAgentCount} agent${connectedAgentCount === 1 ? '' : 's'} connected`
              : ''}
          </Text>
        </View>

        <View style={styles.quickActions}>
          <QuickAction
            icon="people-outline"
            label="Members"
            onPress={() => navigation.navigate('GroupMembers', { conversationId })}
          />
          <QuickAction
            icon="images-outline"
            label="Media"
            onPress={() => navigation.navigate('SharedConversationMedia', { conversationId })}
          />
          <QuickAction
            icon="chatbox-ellipses-outline"
            label="Agents"
            onPress={() => navigation.navigate('GroupBotManagement', { conversationId })}
          />
        </View>

        <ChatInfoSection title="Conversation">
          <ChatInfoRow
            icon="chatbubble-ellipses-outline"
            label="Quick replies"
            subtitle="Reusable message templates"
            onPress={() => navigation.navigate('ManageQuickReplies', { role: 'seller' })}
            showChevron
          />
          <ChatInfoRow
            icon={isMuted ? 'volume-mute-outline' : 'notifications-outline'}
            label={isMuted ? 'Unmute notifications' : 'Mute notifications'}
            onPress={toggleMute}
          />
        </ChatInfoSection>

        <ChatInfoSection title="Chat history">
          <ChatInfoRow
            icon="archive-outline"
            label="Archive conversation"
            subtitle="Move this chat out of your active inbox"
            onPress={archive}
          />
        </ChatInfoSection>

        <ChatInfoSection title="Membership" danger>
          <ChatInfoRow icon="log-out-outline" label="Leave group" onPress={leaveGroup} danger />
          <ChatInfoRow icon="trash-outline" label="Delete for me" onPress={deleteForMe} danger />
        </ChatInfoSection>
      </ScrollView>
    </FlagshipScreen>
  );
}

function QuickAction({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <AnimatedPressable
      style={styles.quickAction}
      onPress={onPress}
      activeOpacity={0.68}
      scaleValue={0.96}
      hapticFeedback="light"
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={21} color={Colors.textPrimary} />
      <Text style={styles.quickActionLabel}>{label}</Text>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Space.md,
    gap: Space.lg,
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
  identity: {
    alignItems: 'center',
    paddingTop: Space.sm,
    paddingBottom: Space.xs,
  },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceAlt,
    marginBottom: Space.sm,
  },
  avatarText: {
    color: Colors.textPrimary,
    fontFamily: TypeStyles.title.fontFamily,
    fontSize: 25,
    letterSpacing: -0.5,
  },
  groupName: {
    maxWidth: '88%',
    color: Colors.textPrimary,
    fontFamily: TypeStyles.title.fontFamily,
    fontSize: Type.title.size,
    lineHeight: Type.title.lineHeight,
    letterSpacing: Type.title.letterSpacing,
  },
  description: {
    maxWidth: '84%',
    color: Colors.textSecondary,
    fontFamily: TypeStyles.body.fontFamily,
    fontSize: Type.captionElevated.size,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 4,
  },
  identityMeta: {
    color: Colors.textMuted,
    fontFamily: TypeStyles.body.fontFamily,
    fontSize: Type.caption.size,
    marginTop: 5,
  },
  quickActions: {
    minHeight: 72,
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  quickAction: {
    flex: 1,
    minHeight: 72,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  quickActionLabel: {
    color: Colors.textSecondary,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    fontSize: Type.caption.size,
  },
});
