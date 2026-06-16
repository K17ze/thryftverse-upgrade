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
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useAppTheme } from '../theme/ThemeContext';
import { Colors } from '../constants/colors';
import { Space, Radius, Type, Typography, Elevation } from '../theme/designTokens';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { useHaptic } from '../hooks/useHaptic';
import { CachedImage } from '../components/CachedImage';
import { Caption, BodyEmphasis, Meta } from '../components/ui/Text';

type Props = StackScreenProps<RootStackParamList, 'ConversationInfo'>;

export default function ConversationInfoScreen({ navigation, route }: Props) {
  const { conversationId } = route.params;
  const { isDark } = useAppTheme();
  const { show } = useToast();
  const haptic = useHaptic();

  const conversations = useStore((state) => state.conversations);
  const deleteConversation = useStore((state) => state.deleteConversation);
  const archiveConversation = useStore((state) => state.archiveConversation);
  const mutedIds = useStore((state) => state.mutedConversationIds);
  const toggleMuted = useStore((state) => state.toggleMutedConversation);
  const blockedUsers = useStore((state) => state.blockedUsers);
  const toggleBlockedUser = useStore((state) => state.toggleBlockedUser);

  const conversation = useMemo(
    () => conversations.find((c) => c.id === conversationId),
    [conversations, conversationId]
  );

  const isMuted = mutedIds.includes(conversationId);
  const counterpartyId = conversation?.participantIds?.find(
    (id) => id !== 'me'
  );
  const isBlocked = counterpartyId ? blockedUsers.includes(counterpartyId) : false;

  if (!conversation) {
    return (
      <FlagshipScreen header={<FlagshipHeader title="Conversation" onBack={() => navigation.goBack()} />} scrollEnabled={false}>
        <View style={styles.center}>
          <Caption color={Colors.textMuted}>Conversation not found</Caption>
        </View>
      </FlagshipScreen>
    );
  }

  const handleDelete = () => {
    Alert.alert(
      'Delete conversation?',
      'This cannot be undone. Messages will be removed from this device.',
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

  const handleToggleBlock = () => {
    if (!counterpartyId) return;
    haptic.heavy();
    toggleBlockedUser(counterpartyId);
    show(isBlocked ? 'User unblocked' : 'User blocked', isBlocked ? 'success' : 'info');
  };

  const handleViewProfile = () => {
    if (counterpartyId) {
      navigation.navigate('UserProfile', { userId: counterpartyId });
    }
  };

  const displayName = conversation.title ?? 'Thryft user';
  const avatarUrl = conversation.avatar ?? null;

  return (
    <FlagshipScreen header={<FlagshipHeader title="Conversation Info" onBack={() => navigation.goBack()} />} scrollEnabled={false}>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {/* Partner Identity */}
        <Reanimated.View entering={FadeInDown.duration(300).delay(40)}>
          <View style={styles.identityCard}>
            {avatarUrl ? (
              <CachedImage uri={avatarUrl} style={styles.avatarImage} contentFit="cover" />
            ) : (
              <View style={[styles.avatar, { backgroundColor: Colors.surfaceAlt }]}>
                <Text style={styles.avatarText}>{displayName.charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <BodyEmphasis style={styles.name} numberOfLines={1}>{displayName}</BodyEmphasis>
            <Caption color={Colors.textMuted}>Direct message</Caption>
          </View>
        </Reanimated.View>

        {/* Profile */}
        <Reanimated.View entering={FadeInDown.duration(300).delay(80)}>
          <Section title="Profile">
            <RowItem
              icon="person-outline"
              label="View profile"
              onPress={handleViewProfile}
              showChevron
            />
          </Section>
        </Reanimated.View>

        {/* Media & shared */}
        <Reanimated.View entering={FadeInDown.duration(300).delay(120)}>
          <Section title="Media & shared">
            <RowItem
              icon="images-outline"
              label="Photos & videos"
              onPress={() => {
                // Future: open shared media gallery when backend supports it
              }}
              showChevron
            />
            <RowItem
              icon="document-outline"
              label="Shared links"
              onPress={() => {
                // Future: open shared links when backend supports it
              }}
              showChevron
            />
          </Section>
        </Reanimated.View>

        {/* Marketplace context */}
        {conversation.itemId && (
          <Reanimated.View entering={FadeInDown.duration(300).delay(140)}>
            <Section title="Context">
              <RowItem
                icon="pricetag-outline"
                label="View linked listing"
                onPress={() => {
                if (conversation.itemId) {
                  navigation.navigate('ItemDetail', { itemId: conversation.itemId });
                }
              }}
                showChevron
              />
            </Section>
          </Reanimated.View>
        )}

        {/* Actions */}
        <Reanimated.View entering={FadeInDown.duration(300).delay(160)}>
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
        </Reanimated.View>

        {/* Danger zone */}
        <Reanimated.View entering={FadeInDown.duration(300).delay(200)}>
          <Section title="Danger zone" danger>
            <RowItem
              icon={isBlocked ? 'person-add-outline' : 'person-remove-outline'}
              label={isBlocked ? 'Unblock user' : 'Block user'}
              onPress={handleToggleBlock}
              danger={!isBlocked}
            />
            <RowItem
              icon="trash-outline"
              label="Delete chat"
              onPress={handleDelete}
              danger
            />
          </Section>
        </Reanimated.View>
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
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
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
    paddingVertical: Space.lg,
    gap: Space.sm,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarImage: {
    width: 80,
    height: 80,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceAlt,
  },
  avatarText: {
    fontSize: 28,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    textTransform: 'uppercase',
  },
  name: {
    fontSize: Type.subtitle.size,
    letterSpacing: Type.subtitle.letterSpacing,
    lineHeight: Type.subtitle.lineHeight,
  },
  section: {
    gap: Space.sm,
  },
  sectionLabel: {
    marginLeft: Space.sm,
    letterSpacing: 1.2,
  },
  sectionCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    ...Elevation.subtle,
  },
  sectionCardDanger: {
    borderColor: `${Colors.danger}30`,
    borderWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: Space.md,
    gap: Space.sm + 4,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  rowLabel: {
    flex: 1,
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
    letterSpacing: Type.body.letterSpacing,
    lineHeight: Type.body.lineHeight,
  },
});
