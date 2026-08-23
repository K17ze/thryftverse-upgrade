import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View, ActivityIndicator, Pressable, Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { ChatInfoRow, ChatInfoSection } from '../components/chat/ChatInfoSection';
import { FlagshipHeader, FlagshipScreen } from '../components/flagship';
import { Caption, Meta } from '../components/ui/Text';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { useToast } from '../context/ToastContext';
import { useHaptic } from '../hooks/useHaptic';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { Control, Radius, Space, Type, TypeStyles } from '../theme/designTokens';
import { deleteConversationOnApi, leaveGroupOnApi, createGroupInviteLinkOnApi, type GroupInviteLink } from '../services/chatApi';
import { parseApiError } from '../lib/apiClient';

type Props = NativeStackScreenProps<RootStackParamList, 'GroupChatInfo'>;

export default function GroupChatInfoScreen({ navigation, route }: Props) {
  const { conversationId } = route.params;
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { show } = useToast();
  const haptic = useHaptic();
  const insets = useSafeAreaInsets();
  const conversations = useStore((state) => state.conversations);
  const currentUser = useStore((state) => state.currentUser);
  const archiveConversation = useStore((state) => state.archiveConversation);
  const deleteConversation = useStore((state) => state.deleteConversation);
  const mutedIds = useStore((state) => state.mutedConversationIds);
  const toggleMuted = useStore((state) => state.toggleMutedConversation);

  const [isLeaving, setIsLeaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isGeneratingInvite, setIsGeneratingInvite] = useState(false);
  const [inviteLink, setInviteLink] = useState<GroupInviteLink | null>(null);

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
          <Caption color={colors.textMuted}>Group not found</Caption>
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
  const description = conversation?.description;

  const leaveGroup = () => {
    Alert.alert(
      'Leave group?',
      'You will be removed from this group on all devices. Other members will keep their copy.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave group',
          style: 'destructive',
          onPress: async () => {
            haptic.heavy();
            setIsLeaving(true);
            try {
              await leaveGroupOnApi(conversationId, currentUser?.id ?? '');
              deleteConversation(conversationId);
              show('You left the group', 'info');
              navigation.navigate('MainTabs', { screen: 'Inbox' });
            } catch {
              show('Could not leave group. Check your connection and try again.', 'error');
            } finally {
              setIsLeaving(false);
            }
          },
        },
      ]
    );
  };

  const deleteForMe = () => {
    Alert.alert(
      'Delete for me?',
      'This removes the conversation from your inbox on all your devices.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete for me',
          style: 'destructive',
          onPress: async () => {
            haptic.heavy();
            setIsDeleting(true);
            try {
              await deleteConversationOnApi(conversationId);
              deleteConversation(conversationId);
              show('Conversation removed from your inbox', 'info');
              navigation.navigate('MainTabs', { screen: 'Inbox' });
            } catch {
              show('Could not delete conversation. Check your connection and try again.', 'error');
            } finally {
              setIsDeleting(false);
            }
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

  const handleGenerateInviteLink = async () => {
    haptic.light();
    setIsGeneratingInvite(true);
    try {
      const link = await createGroupInviteLinkOnApi(conversationId, {
        expiresInHours: 72,
      });
      setInviteLink(link);
      show('Invite link created', 'success');
    } catch (err) {
      show(parseApiError(err, 'Could not create invite link. Try again.').message, 'error');
    } finally {
      setIsGeneratingInvite(false);
    }
  };

  const handleCopyInviteLink = async () => {
    if (!inviteLink) return;
    haptic.light();
    try {
      await Clipboard.setStringAsync(inviteLink.inviteLink);
      show('Invite link copied', 'success');
    } catch {
      show('Could not copy link. Long-press to copy manually.', 'error');
    }
  };

  const handleShareInviteLink = async () => {
    if (!inviteLink) return;
    haptic.light();
    try {
      await Share.share({ message: inviteLink.inviteLink });
    } catch {
      // user cancelled or share failed — no action needed
    }
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
              <Ionicons name="create-outline" size={21} color={colors.textPrimary} />
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

        <ChatInfoSection title="Invite">
          <ChatInfoRow
            icon="link-outline"
            label="Invite via link"
            subtitle={inviteLink ? 'Link ready · tap to share' : 'Create a shareable invite link'}
            onPress={handleGenerateInviteLink}
            showChevron={!inviteLink}
            trailing={isGeneratingInvite ? <ActivityIndicator size="small" color={colors.brand} /> : undefined}
          />
          {inviteLink && (
            <View style={styles.inviteLinkCard}>
              <Text style={styles.inviteLinkText} numberOfLines={2}>{inviteLink.inviteLink}</Text>
              <View style={styles.inviteLinkActions}>
                <Pressable
                  onPress={handleCopyInviteLink}
                  style={({ pressed }) => [styles.inviteActionBtn, pressed && styles.inviteActionPressed]}
                  accessibilityRole="button"
                  accessibilityLabel="Copy invite link"
                >
                  <Ionicons name="copy-outline" size={16} color={colors.brand} />
                  <Text style={styles.inviteActionText}>Copy</Text>
                </Pressable>
                <Pressable
                  onPress={handleShareInviteLink}
                  style={({ pressed }) => [styles.inviteActionBtn, pressed && styles.inviteActionPressed]}
                  accessibilityRole="button"
                  accessibilityLabel="Share invite link"
                >
                  <Ionicons name="share-outline" size={16} color={colors.brand} />
                  <Text style={styles.inviteActionText}>Share</Text>
                </Pressable>
              </View>
              <Caption color={colors.textMuted} style={styles.inviteExpiry}>
                Expires in 72 hours
              </Caption>
            </View>
          )}
        </ChatInfoSection>

        <ChatInfoSection title="Membership" danger>
          <ChatInfoRow
            icon="log-out-outline"
            label={isLeaving ? 'Leaving…' : 'Leave group'}
            onPress={leaveGroup}
            danger
            trailing={isLeaving ? <ActivityIndicator size="small" color={colors.danger} /> : undefined}
          />
          <ChatInfoRow
            icon="trash-outline"
            label={isDeleting ? 'Deleting…' : 'Delete for me'}
            onPress={deleteForMe}
            danger
            trailing={isDeleting ? <ActivityIndicator size="small" color={colors.danger} /> : undefined}
          />
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
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
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
      <Ionicons name={icon} size={21} color={colors.textPrimary} />
      <Text style={styles.quickActionLabel}>{label}</Text>
    </AnimatedPressable>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
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
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identity: {
    alignItems: 'center',
    paddingTop: Space.sm,
    paddingBottom: Space.xs,
  },
  avatar: {
    width: Space.xxl + Space.xl - Space.xs,
    height: Space.xxl + Space.xl - Space.xs,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
    marginBottom: Space.sm,
  },
  avatarText: {
    color: colors.textPrimary,
    fontFamily: TypeStyles.title.fontFamily,
    fontSize: Type.title.size + 1,
    letterSpacing: -0.5,
  },
  groupName: {
    maxWidth: '88%',
    color: colors.textPrimary,
    fontFamily: TypeStyles.title.fontFamily,
    fontSize: Type.title.size,
    lineHeight: Type.title.lineHeight,
    letterSpacing: Type.title.letterSpacing,
  },
  description: {
    maxWidth: '84%',
    color: colors.textSecondary,
    fontFamily: TypeStyles.body.fontFamily,
    fontSize: Type.caption.size,
    lineHeight: Type.caption.size + 6,
    textAlign: 'center',
    marginTop: Space.xs,
  },
  identityMeta: {
    color: colors.textMuted,
    fontFamily: TypeStyles.body.fontFamily,
    fontSize: Type.caption.size,
    marginTop: Space.xs / 2 + 1,
  },
  quickActions: {
    minHeight: Space.xxl + Space.xxl + Space.xxl - 24,
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  quickAction: {
    flex: 1,
    minHeight: Space.xxl + Space.xxl + Space.xxl - 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs / 2 + 1,
  },
  quickActionLabel: {
    color: colors.textSecondary,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    fontSize: Type.caption.size,
  },
  inviteLinkCard: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: Radius.lg,
    padding: Space.md,
    gap: Space.sm,
    marginTop: Space.xs,
  },
  inviteLinkText: {
    fontSize: Type.caption.size,
    fontFamily: TypeStyles.body.fontFamily,
    color: colors.textPrimary,
    lineHeight: Type.caption.size + 6,
  },
  inviteLinkActions: {
    flexDirection: 'row',
    gap: Space.md,
  },
  inviteActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    minHeight: Control.hit,
    paddingHorizontal: Space.sm,
  },
  inviteActionPressed: {
    opacity: 0.6,
  },
  inviteActionText: {
    fontSize: Type.caption.size,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    color: colors.brand,
  },
  inviteExpiry: {
    fontSize: Type.meta.size,
  },
  });
}
