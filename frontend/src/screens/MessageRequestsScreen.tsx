import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { FlashList } from '@shopify/flash-list';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { Colors } from '../constants/colors';
import { Space, Radius, Type, TypeStyles, Elevation } from '../theme/designTokens';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { useHaptic } from '../hooks/useHaptic';
import { AvatarRing } from '../components/chat/AvatarRing';
import { CachedImage } from '../components/CachedImage';
import { Caption, BodyEmphasis } from '../components/ui/Text';
import { EmptyState } from '../components/EmptyState';
import { useBackendData } from '../context/BackendDataContext';

type NavT = StackNavigationProp<RootStackParamList>;

export default function MessageRequestsScreen() {
  const navigation = useNavigation<NavT>();
  const { show } = useToast();
  const haptic = useHaptic();

  const conversations = useStore((state) => state.conversations);
  const messageRequests = useStore((state) => state.messageRequests);
  const acceptMessageRequest = useStore((state) => state.acceptMessageRequest);
  const declineMessageRequest = useStore((state) => state.declineMessageRequest);
  const profileMediaOverrides = useStore((state) => state.profileMediaOverrides);
  const currentUser = useStore((state) => state.currentUser);

  const requestConversations = useMemo(() => {
    return conversations.filter((c) => messageRequests.includes(c.id));
  }, [conversations, messageRequests]);

  const handleAccept = (id: string) => {
    haptic.medium();
    acceptMessageRequest(id);
    show('Request accepted', 'success');
    navigation.navigate('Chat', { conversationId: id });
  };

  const handleDecline = (id: string) => {
    Alert.alert(
      'Decline request?',
      'This person will not be able to message you.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Decline',
          style: 'destructive',
          onPress: () => {
            haptic.heavy();
            declineMessageRequest(id);
            show('Request declined', 'info');
          },
        },
      ]
    );
  };

  const { listings } = useBackendData();

  const renderItem = ({ item, index }: { item: typeof requestConversations[0]; index: number }) => {
    const counterpartyId = item.participantIds?.find((id) => id !== 'me' && id !== currentUser?.id);
    const displayTitle = item.title ?? 'Thryft user';
    const avatarUri = item.avatar ?? (counterpartyId ? profileMediaOverrides[counterpartyId]?.avatar ?? undefined : undefined);
    const listing = item.itemId ? listings.find((l) => l.id === item.itemId) : undefined;

    return (
      <Reanimated.View entering={FadeInDown.duration(300).delay(index * 60)}>
        <View style={styles.requestRow}>
          <View style={styles.requestIdentity}>
            <AvatarRing
              uri={avatarUri}
              size={56}
              ringWidth={2}
              fallbackInitials={displayTitle.slice(0, 2).toUpperCase()}
            />
            <View style={styles.requestText}>
              <View style={styles.requestTop}>
                <BodyEmphasis numberOfLines={1} style={styles.requestName}>{displayTitle}</BodyEmphasis>
                {item.lastMessageTime && (
                  <Caption color={Colors.textMuted}>{item.lastMessageTime}</Caption>
                )}
              </View>
              <Caption color={Colors.textMuted} numberOfLines={2} style={styles.requestPreview}>
                {item.lastMessage ?? 'Wants to message you'}
              </Caption>
              {listing && (
                <View style={styles.requestListingContext}>
                  {listing.images?.[0] ? (
                    <CachedImage uri={listing.images[0]} style={styles.requestListingThumb} contentFit="cover" />
                  ) : (
                    <View style={styles.requestListingThumbPlaceholder}>
                      <Ionicons name="pricetag-outline" size={12} color={Colors.textMuted} />
                    </View>
                  )}
                  <Caption color={Colors.textSecondary} numberOfLines={1} style={styles.requestListingTitle}>{listing.title}</Caption>
                </View>
              )}
            </View>
          </View>

          <View style={styles.requestActions}>
            <AnimatedPressable
              style={styles.requestDecline}
              onPress={() => handleDecline(item.id)}
              activeOpacity={0.85}
              scaleValue={0.96}
              hapticFeedback="light"
              accessibilityRole="button"
              accessibilityLabel="Decline message request"
            >
              <Text style={styles.requestDeclineText}>Decline</Text>
            </AnimatedPressable>
            <AnimatedPressable
              style={styles.requestAccept}
              onPress={() => handleAccept(item.id)}
              activeOpacity={0.85}
              scaleValue={0.96}
              hapticFeedback="medium"
              accessibilityRole="button"
              accessibilityLabel="Accept message request"
            >
              <Text style={styles.requestAcceptText}>Accept</Text>
            </AnimatedPressable>
          </View>
        </View>
        <View style={styles.requestSeparator} />
      </Reanimated.View>
    );
  };

  return (
    <FlagshipScreen header={<FlagshipHeader title="Message Requests" onBack={() => navigation.goBack()} />} scrollEnabled={false}>
      {requestConversations.length === 0 ? (
        <EmptyState
          icon="mail-outline"
          title="No requests"
          subtitle="When someone new messages you, they will appear here."
          ctaLabel="Back to Inbox"
          onCtaPress={() => navigation.goBack()}
        />
      ) : (
        <FlashList
          data={requestConversations}
          keyExtractor={(c) => c.id}
          renderItem={renderItem as any}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </FlagshipScreen>
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.xxl,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Space.md,
    marginBottom: Space.sm,
    ...Elevation.subtle,
    gap: Space.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.sm + 6,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.sm,
  },
  nameText: {
    flex: 1,
  },
  cardText: {
    flex: 1,
    justifyContent: 'center',
    gap: 2,
  },
  previewText: {
    lineHeight: Type.caption.lineHeight + 2,
    marginTop: 2,
  },
  listingContext: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    marginTop: Space.xs,
    alignSelf: 'flex-start',
    backgroundColor: Colors.surfaceAlt,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  listingThumb: {
    width: 20,
    height: 20,
    borderRadius: Radius.sm,
  },
  listingThumbPlaceholder: {
    width: 20,
    height: 20,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listingTitle: {
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    maxWidth: 180,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: Space.sm,
  },
  declineBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    ...Elevation.subtle,
  },
  declineText: {
    fontSize: Type.caption.size,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    color: Colors.textPrimary,
  },
  acceptBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    borderRadius: Radius.md,
    backgroundColor: Colors.textPrimary,
    ...Elevation.subtle,
  },
  acceptText: {
    fontSize: Type.caption.size,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    color: Colors.textInverse,
  },
  requestRow: {
    paddingVertical: Space.md,
    paddingHorizontal: Space.md,
    gap: Space.md,
  },
  requestIdentity: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.sm + 6,
  },
  requestText: {
    flex: 1,
    justifyContent: 'center',
    gap: 2,
  },
  requestTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.sm,
  },
  requestName: {
    flex: 1,
  },
  requestPreview: {
    lineHeight: Type.caption.lineHeight + 2,
    marginTop: 2,
  },
  requestListingContext: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    marginTop: Space.xs,
    alignSelf: 'flex-start',
    backgroundColor: Colors.surfaceAlt,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  requestListingThumb: {
    width: 20,
    height: 20,
    borderRadius: Radius.sm,
  },
  requestListingThumbPlaceholder: {
    width: 20,
    height: 20,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  requestListingTitle: {
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    maxWidth: 180,
  },
  requestActions: {
    flexDirection: 'row',
    gap: Space.sm,
    paddingLeft: 56 + Space.sm + 6,
  },
  requestDecline: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  requestDeclineText: {
    fontSize: Type.caption.size,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    color: Colors.textPrimary,
  },
  requestAccept: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    borderRadius: Radius.md,
    backgroundColor: Colors.textPrimary,
  },
  requestAcceptText: {
    fontSize: Type.caption.size,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    color: Colors.textInverse,
  },
  requestSeparator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginLeft: 56 + Space.sm + 6 + Space.md,
    marginRight: Space.md,
  },
});