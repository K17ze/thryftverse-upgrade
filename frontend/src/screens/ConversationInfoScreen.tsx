import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { CachedImage } from '../components/CachedImage';
import { ChatInfoRow, ChatInfoSection } from '../components/chat/ChatInfoSection';
import { FlagshipHeader, FlagshipScreen } from '../components/flagship';
import { Caption } from '../components/ui/Text';
import { useAppTheme } from '../theme/ThemeContext';
import { useBackendData } from '../context/BackendDataContext';
import { useToast } from '../context/ToastContext';
import { useHaptic } from '../hooks/useHaptic';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { RootStackParamList } from '../navigation/types';
import { openProfile } from '../navigation/openProfile';
import { useStore } from '../store/useStore';
import { Radius, Space, Type, TypeStyles } from '../theme/designTokens';
import { deleteConversationOnApi, archiveConversationOnApi } from '../services/chatApi';
import { blockUser, unblockUser } from '../services/profileApi';

type Props = NativeStackScreenProps<RootStackParamList, 'ConversationInfo'>;

export default function ConversationInfoScreen({ navigation, route }: Props) {
  const { colors, isDark } = useAppTheme();
  const { conversationId } = route.params;

  const t = useMemo(() => ({
    avatar: { backgroundColor: colors.surfaceAlt },
    avatarText: { color: colors.textPrimary },
    displayName: { color: colors.textPrimary },
    handle: { color: colors.textMuted },
    quickActions: { borderColor: colors.border },
  }), [colors]);
  const { show } = useToast();
  const haptic = useHaptic();
  const { formatFromFiat, currencyCode } = useFormattedPrice();
  const { listings } = useBackendData();
  const conversations = useStore((state) => state.conversations);
  const deleteConversation = useStore((state) => state.deleteConversation);
  const archiveConversation = useStore((state) => state.archiveConversation);
  const mutedIds = useStore((state) => state.mutedConversationIds);
  const toggleMuted = useStore((state) => state.toggleMutedConversation);
  const blockedUsers = useStore((state) => state.blockedUsers);
  const toggleBlockedUser = useStore((state) => state.toggleBlockedUser);
  const profileMediaOverrides = useStore((state) => state.profileMediaOverrides);
  const currentUser = useStore((state) => state.currentUser);

  const conversation = useMemo(
    () => conversations.find((item) => item.id === conversationId),
    [conversations, conversationId]
  );

  const [isTogglingMute, setIsTogglingMute] = useState(false);

  if (!conversation) {
    return (
      <FlagshipScreen
        header={<FlagshipHeader title="Chat details" onBack={() => navigation.goBack()} />}
        scrollEnabled={false}
      >
        <View style={styles.center}>
          <Caption color={colors.textMuted}>Conversation not found</Caption>
        </View>
      </FlagshipScreen>
    );
  }

  const counterpartyId = conversation.participantIds?.find(
    (id) => id !== 'me' && id !== currentUser?.id,
  );
  const isMuted = mutedIds.includes(conversationId);
  const isBlocked = counterpartyId ? blockedUsers.includes(counterpartyId) : false;
  const counterpartyProfile = counterpartyId
    ? conversation.participantProfiles?.find((p) => p.id === counterpartyId)
    : undefined;
  const displayName =
    counterpartyProfile?.displayName ||
    counterpartyProfile?.username ||
    conversation.title ||
    'Thryft user';
  const avatarUrl =
    conversation.avatar ||
    (counterpartyId ? profileMediaOverrides[counterpartyId]?.avatar || null : null);
  const handle = counterpartyId
    ? counterpartyProfile?.username
      ? `@${counterpartyProfile.username}`
      : 'Member'
    : 'Direct message';
  const mediaCount = conversation.messages?.filter((message) => message.mediaUri).length ?? 0;
  const linkCount =
    conversation.messages?.filter((message) => message.text && /https?:\/\//.test(message.text)).length ?? 0;
  const offerCount = conversation.messages?.filter((message) => message.type === 'offer').length ?? 0;
  const linkedListing = conversation.itemId
    ? listings.find((listing) => listing.id === conversation.itemId)
    : undefined;

  const viewProfile = () => {
    if (counterpartyId) openProfile(navigation, counterpartyId, currentUser?.id);
  };

  const toggleMute = async () => {
    haptic.light();
    setIsTogglingMute(true);
    try {
      await toggleMuted(conversationId);
      show(isMuted ? 'Conversation unmuted' : 'Conversation muted', 'success');
    } catch {
      show('Could not update mute status. Check your connection and try again.', 'error');
    } finally {
      setIsTogglingMute(false);
    }
  };

  const reportUser = () => {
    if (!counterpartyId) return;
    haptic.light();
    navigation.navigate('Report', { type: 'user', targetId: counterpartyId });
  };

  const archive = async () => {
    haptic.medium();
    try {
      await archiveConversationOnApi(conversationId);
      archiveConversation(conversationId);
      show('Conversation archived', 'success');
      navigation.navigate('MainTabs', { screen: 'Inbox' });
    } catch {
      show('Could not archive this conversation. Check your connection and try again.', 'error');
    }
  };

  const toggleBlock = async () => {
    if (!counterpartyId) return;
    haptic.heavy();
    try {
      if (isBlocked) {
        await unblockUser(counterpartyId);
        toggleBlockedUser(counterpartyId);
        show('User unblocked', 'success');
      } else {
        await blockUser(counterpartyId);
        toggleBlockedUser(counterpartyId);
        show('User blocked', 'info');
      }
    } catch {
      show('Could not update block status. Check your connection and try again.', 'error');
    }
  };

  const deleteForMe = () => {
    Alert.alert(
      'Remove from inbox?',
      'This removes the conversation from your inbox on this device. The other participant keeps their copy.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            haptic.heavy();
            try {
              await deleteConversationOnApi(conversationId, 'me');
              deleteConversation(conversationId);
              show('Conversation removed from your inbox', 'info');
              navigation.navigate('MainTabs', { screen: 'Inbox' });
            } catch {
              show('Could not delete this conversation. Check your connection and try again.', 'error');
            }
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
          <View style={[styles.avatar, t.avatar]}>
            {avatarUrl ? (
              <CachedImage
                uri={avatarUrl}
                style={styles.avatarImage}
                containerStyle={styles.avatarImage}
                contentFit="cover"
              />
            ) : (
              <Text style={[styles.avatarText, t.avatarText]}>{displayName.charAt(0).toUpperCase()}</Text>
            )}
          </View>
          <Text style={[styles.displayName, t.displayName]} numberOfLines={1}>
            {displayName}
          </Text>
          <Text style={[styles.handle, t.handle]} numberOfLines={1}>
            {handle}
          </Text>
        </AnimatedPressable>

        <View style={[styles.quickActions, t.quickActions]}>
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
            busy={isTogglingMute}
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
              detail={linkedListing ? formatFromFiat(linkedListing.price, currencyCode) : undefined}
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
          <ChatInfoRow
            icon="flag-outline"
            label="Report user"
            onPress={reportUser}
            showChevron
          />
          <ChatInfoRow icon="trash-outline" label="Remove from inbox" onPress={deleteForMe} danger />
        </ChatInfoSection>
      </ScrollView>
    </FlagshipScreen>
  );
}

function QuickAction({
  icon,
  label,
  onPress,
  busy,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  busy?: boolean;
}) {
  const { colors } = useAppTheme();
  const quickThemed = useMemo(() => ({
    quickActionLabel: { color: colors.textSecondary },
  }), [colors]);
  return (
    <AnimatedPressable
      style={styles.quickAction}
      onPress={onPress}
      activeOpacity={0.68}
      scaleValue={0.96}
      hapticFeedback="light"
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy }}
      disabled={busy}
    >
      {busy ? (
        <ActivityIndicator size="small" color={colors.textPrimary} />
      ) : (
        <Ionicons name={icon} size={21} color={colors.textPrimary} />
      )}
      <Text style={[styles.quickActionLabel, quickThemed.quickActionLabel]}>{label}</Text>
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
    width: Space.xxl + Space.xl - Space.xs,
    height: Space.xxl + Space.xl - Space.xs,
    borderRadius: Radius.full,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Space.sm,
  },
  avatarImage: {
    width: Space.xxl + Space.xl - Space.xs,
    height: Space.xxl + Space.xl - Space.xs,
    borderRadius: Radius.full,
  },
  avatarText: {
    fontFamily: TypeStyles.title.fontFamily,
    fontSize: Type.title.size + 3,
  },
  displayName: {
    maxWidth: '88%',
    fontFamily: TypeStyles.title.fontFamily,
    fontSize: Type.title.size,
    lineHeight: Type.title.lineHeight,
    letterSpacing: Type.title.letterSpacing,
  },
  handle: {
    fontFamily: TypeStyles.body.fontFamily,
    fontSize: Type.caption.size,
    marginTop: Space.xs / 2 + 1,
  },
  quickActions: {
    minHeight: Space.xxl + Space.xxl + Space.xxl - 24,
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  quickAction: {
    flex: 1,
    minHeight: Space.xxl + Space.xxl + Space.xxl - 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs / 2 + 1,
  },
  quickActionLabel: {
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    fontSize: Type.caption.size,
  },
});
