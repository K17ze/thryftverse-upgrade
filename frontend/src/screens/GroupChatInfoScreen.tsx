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
import { Space, Radius, Type, TypeStyles, Elevation } from '../theme/designTokens';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { useHaptic } from '../hooks/useHaptic';
import { Caption, BodyEmphasis, Meta } from '../components/ui/Text';

type Props = StackScreenProps<RootStackParamList, 'GroupChatInfo'>;

export default function GroupChatInfoScreen({ navigation, route }: Props) {
  const { conversationId } = route.params;
  const { show } = useToast();
  const haptic = useHaptic();

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
      'You will no longer receive messages from this group.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: () => {
            haptic.heavy();
            show('You left the group', 'info');
            navigation.goBack();
          },
        },
      ]
    );
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete conversation?',
      'This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            haptic.heavy();
            deleteConversation(conversationId);
            show('Conversation deleted', 'info');
            navigation.navigate('MainTabs');
          },
        },
      ]
    );
  };

  const handleArchive = () => {
    haptic.medium();
    archiveConversation(conversationId);
    show('Conversation archived', 'success');
    navigation.goBack();
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
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {/* Group Identity */}
        <View style={styles.identityCard}>
          <View style={styles.avatarRing}>
            <View style={[styles.avatar, { backgroundColor: Colors.surfaceAlt }]}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
          </View>
          <BodyEmphasis style={styles.groupName} numberOfLines={1}>
            {conversation.title ?? 'Group chat'}
          </BodyEmphasis>
          {description ? (
            <Caption color={Colors.textMuted} style={styles.groupDesc}>{description}</Caption>
          ) : null}
          <Caption color={Colors.textMuted}>{memberCount} members</Caption>
          {deployedBotCount > 0 && (
            <View style={styles.botBadge}>
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
            onPress={() => navigation.navigate({ name: 'EditGroup', params: { conversationId } })}
            showChevron
          />
        </Section>

        {/* Members */}
        <Section title="Members">
          <RowItem
            icon="people-outline"
            label={`${memberCount} member${memberCount !== 1 ? 's' : ''}`}
            onPress={() => navigation.navigate('GroupMembers', { conversationId })}
            showChevron
          />
        </Section>

        {/* Bots */}
        <Section title="Bots & Automation">
          <RowItem
            icon="hardware-chip-outline"
            label="Manage bots"
            onPress={() => navigation.navigate('GroupBotManagement', { conversationId })}
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
  onPress,
  showChevron,
  danger,
  isLast,
}: {
  icon: string;
  label: string;
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
      <Text
        style={[
          styles.rowLabel,
          { color: danger ? Colors.danger : Colors.textPrimary },
        ]}
      >
        {label}
      </Text>
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
    ...Elevation.subtle,
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
    ...Elevation.subtle,
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
  rowLabel: {
    flex: 1,
    fontSize: Type.body.size,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
  },
});