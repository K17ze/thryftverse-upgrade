import React, { useMemo } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StackScreenProps } from '@react-navigation/stack';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { CachedImage } from '../components/CachedImage';
import { ChatInfoRow, ChatInfoSection } from '../components/chat/ChatInfoSection';
import { FlagshipHeader, FlagshipScreen } from '../components/flagship';
import { Caption } from '../components/ui/Text';
import { Colors } from '../constants/colors';
import { useBackendData } from '../context/BackendDataContext';
import { useToast } from '../context/ToastContext';
import { useHaptic } from '../hooks/useHaptic';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { Radius, Space, Type, TypeStyles } from '../theme/designTokens';

type Props = StackScreenProps<RootStackParamList, 'ConversationInfo'>;

export default function ConversationInfoScreen({ navigation, route }: Props) {
  const { conversationId } = route.params;
  const { show } = useToast();
  const haptic = useHaptic();
  const { listings } = useBackendData();
  const conversations = useStore((state) => state.conversations);
  const deleteConversation = useStore((state) => state.deleteConversation);
  const archiveConversation = useStore((state) => state.archiveConversation);
  const mutedIds = useStore((state) => state.mutedConversationIds);
  const toggleMuted = useStore((state) => state.toggleMutedConversation);
  const blockedUsers = useStore((state) => state.blockedUsers);
  const toggleBlockedUser = useStore((state) => state.toggleBlockedUser);
  const profileMediaOverrides = useStore((state) => state.profileMediaOverrides);
  const participantNameLookup = useStore(
    (state) => (state as typeof state & { participantNameLookup?: Map<string, string> }).participantNameLookup
  );

  const conversation = useMemo(
    () => conversations.find((item) => item.id === conversationId),
    [conversations, conversationId]
  );

  if (!conversation) {
    return (
      <FlagshipScreen
        header={<FlagshipHeader title="Chat details" onBack={() => navigation.goBack()} />}
        scrollEnabled={false}
      >
        <View style={styles.center}>
          <Caption color={Colors.textMuted}>Conversation not found</Caption>
        </View>
      </FlagshipScreen>
    );
  }

  const counterpartyId = conversation.participantIds?.find((id) => id !== 'me');
  const isMuted = mutedIds.includes(conversationId);
  const isBlocked = counterpartyId ? blockedUsers.includes(counterpartyId) : false;
  const displayName =
    (counterpartyId ? participantNameLookup?.get(counterpartyId) : undefined) ||
    conversation.title ||
    'Thryft user';
  const avatarUrl =
    conversation.avatar ||
    (counterpartyId ? profileMediaOverrides[counterpartyId]?.avatar || null : null);
  const handle = counterpartyId ? `@${counterpartyId.slice(0, 12)}` : 'Direct message';
  const mediaCount = conversation.messages?.filter((message) => message.mediaUri).length ?? 0;
  const linkCount =
    conversation.messages?.filter((message) => message.text && /https?:\/\//.test(message.text)).length ?? 0;
  const offerCount = conversation.messages?.filter((message) => message.type === 'offer').length ?? 0;
  const linkedListing = conversation.itemId
    ? listings.find((listing) => listing.id === conversation.itemId)
    : undefined;

  const viewProfile = () => {
    if (counterpartyId) navigation.navigate('UserProfile', { userId: counterpartyId });
  };

  const toggleMute = () => {
    haptic.light();
    toggleMuted(conversationId);
    show(isMuted ? 'Conversation unmuted' : 'Conversation muted', 'success');
  };

  const archive = () => {
    haptic.medium();
    archiveConversation(conversationId);
    show('Conversation archived', 'success');
    navigation.navigate('MainTabs', { screen: 'Inbox' });
  };

  const toggleBlock = () => {
    if (!counterpartyId) return;
    haptic.heavy();
    toggleBlockedUser(counterpartyId);
    show(isBlocked ? 'User unblocked' : 'User blocked', isBlocked ? 'success' : 'info');
  };

  const deleteForMe = () => {
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

  return (
    <FlagshipScreen
      header={<FlagshipHeader title="Chat details" onBack={() => navigation.goBack()} />}
      scrollEnabled={false}
    >
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <AnimatedPressable
          style={styles.identity}
          onPress={viewProfile}
          disabled={!counterpartyId}
          activeOpacity={0.7}
          scaleValue={0.985}
          hapticFeedback="light"
          accessibilityRole="button"
          accessibilityLabel={`View ${displayName}'s profile`}
        >
          <View style={styles.avatar}>
            {avatarUrl ? (
              <CachedImage
                uri={avatarUrl}
                style={styles.avatarImage}
                containerStyle={styles.avatarImage}
                contentFit="cover"
              />
            ) : (
              <Text style={styles.avatarText}>{displayName.charAt(0).toUpperCase()}</Text>
            )}
          </View>
          <Text style={styles.displayName} numberOfLines={1}>
            {displayName}
          </Text>
          <Text style={styles.handle} numberOfLines={1}>
            {handle}
          </Text>
        </AnimatedPressable>

        <View style={styles.quickActions}>
          <QuickAction icon="person-outline" label="Profile" onPress={viewProfile} />
          <QuickAction
            icon="images-outline"
            label="Media"
            onPress={() => navigation.navigate('SharedConversationMedia', { conversationId })}
          />
          <QuickAction
            icon={isMuted ? 'volume-mute-outline' : 'notifications-outline'}
            label={isMuted ? 'Unmute' : 'Mute'}
            onPress={toggleMute}
          />
        </View>

        <ChatInfoSection title="Shared in this chat">
          <ChatInfoRow
            icon="images-outline"
            label="Photos and videos"
            detail={mediaCount > 0 ? String(mediaCount) : undefined}
            onPress={() => navigation.navigate('SharedConversationMedia', { conversationId })}
            showChevron
          />
          {linkCount > 0 ? (
            <ChatInfoRow icon="link-outline" label="Links shared" detail={String(linkCount)} />
          ) : null}
          {offerCount > 0 ? (
            <ChatInfoRow icon="pricetag-outline" label="Offers exchanged" detail={String(offerCount)} />
          ) : null}
        </ChatInfoSection>

        {conversation.itemId ? (
          <ChatInfoSection title="Marketplace">
            <ChatInfoRow
              icon="bag-handle-outline"
              label={linkedListing?.title || 'Linked listing'}
              subtitle="Open the product linked to this conversation"
              detail={linkedListing ? `£${linkedListing.price.toFixed(2)}` : undefined}
              onPress={() => navigation.navigate('ItemDetail', { itemId: conversation.itemId! })}
              showChevron
            />
          </ChatInfoSection>
        ) : null}

        <ChatInfoSection title="Conversation">
          <ChatInfoRow
            icon="archive-outline"
            label="Archive conversation"
            subtitle="Move this chat out of your active inbox"
            onPress={archive}
          />
        </ChatInfoSection>

        <ChatInfoSection title="Privacy and safety" danger>
          <ChatInfoRow
            icon={isBlocked ? 'person-add-outline' : 'person-remove-outline'}
            label={isBlocked ? 'Unblock user' : 'Block user'}
            onPress={toggleBlock}
            danger={!isBlocked}
          />
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
    paddingBottom: Space.xxl,
    gap: Space.lg,
  },
  center: {
    flex: 1,
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
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceAlt,
    marginBottom: Space.sm,
  },
  avatarImage: {
    width: 76,
    height: 76,
    borderRadius: Radius.full,
  },
  avatarText: {
    color: Colors.textPrimary,
    fontFamily: TypeStyles.title.fontFamily,
    fontSize: 27,
  },
  displayName: {
    maxWidth: '88%',
    color: Colors.textPrimary,
    fontFamily: TypeStyles.title.fontFamily,
    fontSize: Type.title.size,
    lineHeight: Type.title.lineHeight,
    letterSpacing: Type.title.letterSpacing,
  },
  handle: {
    color: Colors.textMuted,
    fontFamily: TypeStyles.body.fontFamily,
    fontSize: Type.captionElevated.size,
    marginTop: 3,
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
