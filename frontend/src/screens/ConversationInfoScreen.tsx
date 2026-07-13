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
import { useAppTheme } from '../theme/ThemeContext';
import { Space, Radius, Type, TypeStyles } from '../theme/designTokens';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { useHaptic } from '../hooks/useHaptic';
import { CachedImage } from '../components/CachedImage';
import { Caption, BodyEmphasis, Meta } from '../components/ui/Text';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { useBackendData } from '../context/BackendDataContext';

type Props = StackScreenProps<RootStackParamList, 'ConversationInfo'>;

export default function ConversationInfoScreen({ navigation, route }: Props) {
  const { colors } = useAppTheme();
  const { conversationId } = route.params;
  const { show } = useToast();
  const haptic = useHaptic();

  const conversations = useStore((state) => state.conversations);
  const deleteConversation = useStore((state) => state.deleteConversation);
  const archiveConversation = useStore((state) => state.archiveConversation);
  const mutedIds = useStore((state) => state.mutedConversationIds);
  const toggleMuted = useStore((state) => state.toggleMutedConversation);
  const blockedUsers = useStore((state) => state.blockedUsers);
  const toggleBlockedUser = useStore((state) => state.toggleBlockedUser);
  const profileMediaOverrides = useStore((state) => state.profileMediaOverrides);
  const participantNameLookup = useStore((state) => (state as any).participantNameLookup as Map<string, string> | undefined);
  const { listings } = useBackendData();

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
          <Caption color={colors.textMuted}>Conversation not found</Caption>
        </View>
      </FlagshipScreen>
    );
  }

  const handleDelete = () => {
    Alert.alert(
      'Delete for me?',
      'This removes the conversation from your inbox on this device. The other participant keeps their copy.',
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

  const displayName =
    (counterpartyId ? participantNameLookup?.get(counterpartyId) : undefined) ??
    conversation.title ??
    'Thryft user';
  const avatarUrl =
    conversation.avatar ??
    (counterpartyId ? profileMediaOverrides[counterpartyId]?.avatar ?? null : null);
  const handle = counterpartyId ? `@${counterpartyId.slice(0, 12)}` : 'Direct message';

  return (
    <FlagshipScreen header={<FlagshipHeader title="Chat details" onBack={() => navigation.goBack()} />} scrollEnabled={false}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {/* Partner Identity */}
        <View>
          <AnimatedPressable
            style={[styles.identityCardV2, { borderColor: colors.border }]}
            onPress={handleViewProfile}
            disabled={!counterpartyId}
            activeOpacity={0.85}
            scaleValue={0.98}
            hapticFeedback="light"
            accessibilityRole="button"
            accessibilityLabel={`View ${displayName}'s profile`}
          >
            <View style={styles.identityAvatarWrap}>
              {avatarUrl ? (
                <CachedImage uri={avatarUrl} style={styles.identityAvatarImage} contentFit="cover" />
              ) : (
                <View style={[styles.identityAvatarFallback, { backgroundColor: colors.surfaceAlt }]}>
                  <Text style={styles.identityAvatarText}>{displayName.charAt(0).toUpperCase()}</Text>
                </View>
              )}
            </View>
            <BodyEmphasis style={styles.identityName} numberOfLines={1}>{displayName}</BodyEmphasis>
            <Caption color={colors.textMuted}>{handle}</Caption>
          </AnimatedPressable>
        </View>

        {/* Profile */}
        <View>
          <Section title="Profile">
            <RowItem
              icon="person-outline"
              label="View profile"
              onPress={handleViewProfile}
              showChevron
            />
          </Section>
        </View>

        {/* Media & shared */}
        <View>
          <Section title="Shared">
            <RowItem
              icon="images-outline"
              label="Photos & videos"
              onPress={() => navigation.navigate('SharedConversationMedia', { conversationId })}
              showChevron
              detail={(() => {
                const count = conversation.messages?.filter((m) => m.mediaUri).length ?? 0;
                return count > 0 ? `${count}` : undefined;
              })()}
            />
            {(() => {
              const linkCount = conversation.messages?.filter((m) => m.text && /https?:\/\//.test(m.text)).length ?? 0;
              return linkCount > 0 ? (
                <RowItem
                  icon="link-outline"
                  label="Links"
                  detail={`${linkCount}`}
                />
              ) : null;
            })()}
            {(() => {
              const offerCount = conversation.messages?.filter((m) => m.type === 'offer').length ?? 0;
              return offerCount > 0 ? (
                <RowItem
                  icon="cash-outline"
                  label="Offers"
                  detail={`${offerCount}`}
                />
              ) : null;
            })()}
          </Section>
        </View>

        {/* Marketplace context */}
        {conversation.itemId && (() => {
          const listing = listings.find((l) => l.id === conversation.itemId);
          return (
            <View>
              <Section title="Listing">
                <RowItem
                  icon="pricetag-outline"
                  label={listing?.title ?? 'View linked listing'}
                  detail={listing ? `£${listing.price.toFixed(2)}` : undefined}
                  onPress={() => navigation.navigate('ItemDetail', { itemId: conversation.itemId! })}
                  showChevron
                />
              </Section>
            </View>
          );
        })()}

        {/* Actions */}
        <View>
          <Section title="Actions">
            <RowItem
              icon={isMuted ? 'volume-mute-outline' : 'volume-high-outline'}
              label={isMuted ? 'Unmute' : 'Mute'}
              onPress={handleToggleMute}
            />
            <RowItem
              icon="archive-outline"
              label="Archive"
              onPress={handleArchive}
            />
          </Section>
        </View>

        {/* Danger zone */}
        <View>
          <Section title="Danger" danger>
            <RowItem
              icon={isBlocked ? 'person-add-outline' : 'person-remove-outline'}
              label={isBlocked ? 'Unblock user' : 'Block user'}
              onPress={handleToggleBlock}
              danger={!isBlocked}
            />
            <RowItem
              icon="trash-outline"
              label="Delete for me"
              onPress={handleDelete}
              danger
            />
          </Section>
        </View>
      </ScrollView>
    </FlagshipScreen>
  );
}

function Section({ title, children, danger }: { title: string; children: React.ReactNode; danger?: boolean }) {
  const { colors } = useAppTheme();
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
      <Meta color={danger ? colors.danger : colors.textMuted} style={styles.sectionLabel}>
        {title.toUpperCase()}
      </Meta>
      <View style={[styles.sectionCard, { backgroundColor: colors.surface }, danger && { borderColor: `${colors.danger}30`, borderWidth: StyleSheet.hairlineWidth }]}>{childrenWithIsLast}</View>
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
  detail,
}: {
  icon: string;
  label: string;
  onPress?: () => void;
  showChevron?: boolean;
  danger?: boolean;
  isLast?: boolean;
  detail?: string;
}) {
  const { colors } = useAppTheme();
  const content = (
    <View style={[styles.row, !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
      <Ionicons
        name={icon as any}
        size={20}
        color={danger ? colors.danger : colors.textSecondary}
      />
      <Text
        style={[
          styles.rowLabel,
          { color: danger ? colors.danger : colors.textPrimary },
        ]}
      >
        {label}
      </Text>
      {detail && (
        <Caption color={colors.textMuted}>{detail}</Caption>
      )}
      {showChevron && (
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
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
    paddingVertical: Space.lg,
    gap: Space.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.xl,
    marginHorizontal: Space.xs,
  },
  avatarRing: {
    width: 88,
    height: 88,
    borderRadius: Radius.full,
    borderWidth: 2,
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
  avatarImage: {
    width: 76,
    height: 76,
    borderRadius: Radius.full,
  },
  avatarText: {
    fontSize: 28,
    fontFamily: TypeStyles.title.fontFamily,
    textTransform: 'uppercase',
  },
  name: {
    fontSize: Type.subtitle.size,
    letterSpacing: Type.subtitle.letterSpacing,
    lineHeight: Type.subtitle.lineHeight,
  },
  identityCardV2: {
    alignItems: 'center',
    paddingVertical: Space.lg + 8,
    gap: Space.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.xl,
    marginHorizontal: Space.xs,
  },
  identityAvatarWrap: {
    width: 96,
    height: 96,
    borderRadius: Radius.full,
    overflow: 'hidden',
    marginBottom: Space.xs,
  },
  identityAvatarImage: {
    width: 96,
    height: 96,
    borderRadius: Radius.full,
  },
  identityAvatarFallback: {
    width: 96,
    height: 96,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  identityAvatarText: {
    fontSize: 32,
    fontFamily: TypeStyles.title.fontFamily,
    textTransform: 'uppercase',
  },
  identityName: {
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
    borderRadius: Radius.xl,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: Space.md,
    gap: Space.sm + 4,
  },
  rowLabel: {
    flex: 1,
    fontSize: Type.body.size,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    letterSpacing: Type.body.letterSpacing,
    lineHeight: Type.body.lineHeight,
  },
});