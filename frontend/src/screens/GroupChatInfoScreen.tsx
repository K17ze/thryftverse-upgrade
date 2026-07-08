import React, { useMemo } from 'react';
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
import { Colors } from '../constants/colors';
import { Space, Radius, Type, TypeStyles } from '../theme/designTokens';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { useHaptic } from '../hooks/useHaptic';
import { Caption, BodyEmphasis, Meta } from '../components/ui/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = StackScreenProps<RootStackParamList, 'GroupChatInfo'>;

export default function GroupChatInfoScreen({ navigation, route }: Props) {
  const { conversationId } = route.params;
  const { show } = useToast();
  const haptic = useHaptic();
  const insets = useSafeAreaInsets();

  const conversations = useStore((state) => state.conversations);
  const currentUser = useStore((state) => state.currentUser);
  const archiveConversation = useStore((state) => state.archiveConversation);
  const deleteConversation = useStore((state) => state.deleteConversation);
  const mutedIds = useStore((state) => state.mutedConversationIds);
  const toggleMuted = useStore((state) => state.toggleMutedConversation);

  const conversation = useMemo(
    () => conversations.find((c) => c.id === conversationId),
    [conversations, conversationId]
  );

  const memberCount = conversation?.participantIds?.length ?? 0;
  const deployedBotCount = conversation?.botIds?.length ?? 0;
  const isMuted = mutedIds.includes(conversationId);

  if (!conversation || conversation.type !== 'group') {
    return (
      <FlagshipScreen header={<FlagshipHeader title="Group Info" onBack={() => navigation.goBack()} />} scrollEnabled={false}>
        <View style={styles.center}>
          <Caption color={Colors.textMuted}>Group not found</Caption>
        </View>
      </FlagshipScreen>
    );
  }

  const handleLeave = () => {
    Alert.alert(
      'Leave group?',
      'This removes the group from your inbox on this device. Other members will still see the group. You can rejoin if you receive a new invite.',
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

  const handleDelete = () => {
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

  const handleArchive = () => {
    haptic.medium();
    archiveConversation(conversationId);
    show('Conversation archived', 'success');
    navigation.navigate('MainTabs', { screen: 'Inbox' });
  };

  const handleToggleMute = () => {
    haptic.light();
    toggleMuted(conversationId);
    show(isMuted ? 'Conversation unmuted' : 'Conversation muted', 'success');
  };

  const initials = (conversation.title ?? 'Group')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const description = (conversation as any)?.description;
  const isOwner = (conversation as any)?.creatorId === currentUser?.id;

  return (
    <FlagshipScreen header={<FlagshipHeader title="Group Info" onBack={() => navigation.goBack()} />} scrollEnabled={false}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, Space.xxl) + Space.lg }]}>
        {/* Group Identity */}
        <View style={styles.identityCardV2}>
          <View style={styles.groupAvatarWrap}>
            <View style={[styles.groupAvatar, { backgroundColor: Colors.surfaceAlt }]}>
              <Text style={styles.groupAvatarText}>{initials}</Text>
            </View>
          </View>
          <BodyEmphasis style={styles.groupNameV2} numberOfLines={1}>
            {conversation.title ?? 'Group chat'}
          </BodyEmphasis>
          {description ? (
            <Caption color={Colors.textMuted} style={styles.groupDescV2}>{description}</Caption>
          ) : null}
          <Caption color={Colors.textMuted}>{memberCount} members</Caption>
          {deployedBotCount > 0 && (
            <View style={styles.botBadgeV2}>
              <Ionicons name="hardware-chip-outline" size={12} color={Colors.brand} />
              <Caption color={Colors.brand} style={styles.botBadgeText}>
                {deployedBotCount} bot{deployedBotCount > 1 ? 's' : ''} active
              </Caption>
            </View>
          )}
        </View>

        {/* Edit group */}
        <Section title="Settings">
          <RowItem
            icon="create-outline"
            label="Edit group"
            subtitle="Name, description, photo"
            onPress={() => navigation.navigate('EditGroup', { conversationId })}
            showChevron
          />
        </Section>

        {/* Members */}
        <Section title="Members">
          <RowItem
            icon="people-outline"
            label={`${memberCount} member${memberCount !== 1 ? 's' : ''}`}
            subtitle="View, add, or remove members"
            onPress={() => navigation.navigate('GroupMembers', { conversationId })}
            showChevron
          />
        </Section>

        {/* Shared content */}
        <Section title="Shared">
          <RowItem
            icon="images-outline"
            label="Shared media"
            subtitle="Photos and videos shared in this chat"
            onPress={() => navigation.navigate('SharedConversationMedia', { conversationId })}
            showChevron
          />
          <RowItem
            icon="document-outline"
            label="Files"
            subtitle="Backend support required"
            onPress={() => show('File sharing requires backend support.', 'info')}
            showChevron
          />
        </Section>

        {/* Bots */}
        <Section title="Bots & Automation">
          <RowItem
            icon="hardware-chip-outline"
            label="Manage bots"
            subtitle={deployedBotCount > 0 ? `${deployedBotCount} active` : 'Deploy automation bots'}
            onPress={() => navigation.navigate('GroupBotManagement', { conversationId })}
            showChevron
          />
          <RowItem
            icon="chatbubbles-outline"
            label="Quick replies"
            subtitle="Reusable message templates"
            onPress={() => navigation.navigate('ManageQuickReplies', { role: 'seller' })}
            showChevron
          />
        </Section>

        {/* Group Actions */}
        <Section title="Actions">
          <RowItem
            icon={isMuted ? 'volume-mute-outline' : 'volume-high-outline'}
            label={isMuted ? 'Unmute notifications' : 'Mute notifications'}
            onPress={handleToggleMute}
          />
          <RowItem
            icon="archive-outline"
            label="Archive chat"
            onPress={handleArchive}
          />
        </Section>

        {/* Danger zone */}
        <Section title="Danger zone" danger>
          <RowItem
            icon="log-out-outline"
            label="Leave group"
            onPress={handleLeave}
            danger
          />
          <RowItem
            icon="trash-outline"
            label="Delete chat"
            onPress={handleDelete}
            danger
          />
        </Section>
      </ScrollView>
    </FlagshipScreen>
  );
}

function Section({ title, children, danger }: { title: string; children: React.ReactNode; danger?: boolean }) {
  const childArray = React.Children.toArray(children);
  const lastIndex = childArray.length - 1;
  const childrenWithIsLast = childArray.map((child, index) => {
    if (React.isValidElement(child)) {
      return React.cloneElement(child, { isLast: index === lastIndex } as any);
    }
    return child;
  });
  return (
    <View style={styles.section}>
      <Meta color={danger ? Colors.danger : Colors.textMuted} style={styles.sectionLabel}>
        {title.toUpperCase()}
      </Meta>
      <View style={[styles.sectionCard, danger && styles.sectionCardDanger]}>{childrenWithIsLast}</View>
    </View>
  );
}

function RowItem({
  icon,
  label,
  subtitle,
  onPress,
  showChevron,
  danger,
  isLast,
}: {
  icon: string;
  label: string;
  subtitle?: string;
  onPress?: () => void;
  showChevron?: boolean;
  danger?: boolean;
  isLast?: boolean;
}) {
  const content = (
    <View style={[styles.row, !isLast && styles.rowBorder]}>
      <Ionicons
        name={icon as any}
        size={20}
        color={danger ? Colors.danger : Colors.textSecondary}
      />
      <View style={styles.rowTextBody}>
        <Text
          style={[
            styles.rowLabel,
            { color: danger ? Colors.danger : Colors.textPrimary },
          ]}
        >
          {label}
        </Text>
        {subtitle ? (
          <Text style={styles.rowSubtitle} numberOfLines={1}>{subtitle}</Text>
        ) : null}
      </View>
      {showChevron && (
        <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
      )}
    </View>
  );

  if (onPress) {
    return (
      <AnimatedPressable
        onPress={onPress}
        activeOpacity={0.7}
        scaleValue={0.98}
        hapticFeedback="light"
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        {content}
      </AnimatedPressable>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.xxl,
    gap: Space.lg,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  identityCard: {
    alignItems: 'center',
    paddingVertical: Space.xl,
    gap: Space.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    borderRadius: Radius.xl,
    marginHorizontal: Space.xs,
  },
  avatarRing: {
    width: 88,
    height: 88,
    borderRadius: Radius.full,
    borderWidth: 2,
    borderColor: Colors.border,
    padding: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 28,
    fontFamily: TypeStyles.title.fontFamily,
    color: Colors.textPrimary,
  },
  groupName: {
    fontSize: Type.title.size,
    fontFamily: TypeStyles.title.fontFamily,
    color: Colors.textPrimary,
    marginTop: Space.sm,
  },
  groupDesc: {
    textAlign: 'center',
    paddingHorizontal: Space.lg,
    marginTop: 2,
  },
  botBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  botBadgeText: {
    fontSize: Type.caption.size,
  },
  identityCardV2: {
    alignItems: 'center',
    paddingVertical: Space.xl + 8,
    gap: Space.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    borderRadius: Radius.xl,
    marginHorizontal: Space.xs,
  },
  groupAvatarWrap: {
    width: 96,
    height: 96,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    marginBottom: Space.xs,
  },
  groupAvatar: {
    width: 96,
    height: 96,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  groupAvatarText: {
    fontSize: 32,
    fontFamily: TypeStyles.title.fontFamily,
    color: Colors.textPrimary,
  },
  groupNameV2: {
    fontSize: Type.title.size,
    fontFamily: TypeStyles.title.fontFamily,
    color: Colors.textPrimary,
    marginTop: Space.sm,
  },
  groupDescV2: {
    textAlign: 'center',
    paddingHorizontal: Space.lg,
    marginTop: 2,
  },
  botBadgeV2: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  section: {
    gap: Space.sm,
  },
  sectionLabel: {
    fontSize: Type.meta.size,
    letterSpacing: Type.meta.letterSpacing,
    marginLeft: Space.xs,
  },
  sectionCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  sectionCardDanger: {
    borderColor: `${Colors.danger}30`,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    paddingVertical: 14,
    gap: Space.sm,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  rowTextBody: {
    flex: 1,
    gap: 2,
  },
  rowLabel: {
    fontSize: Type.body.size,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
  },
  rowSubtitle: {
    fontSize: Type.caption.size,
    fontFamily: TypeStyles.body.fontFamily,
    color: Colors.textMuted,
  },
});