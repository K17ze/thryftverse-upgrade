import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { Colors } from '../constants/colors';
import { Space, Radius, Type, TypeStyles } from '../theme/designTokens';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { useHaptic } from '../hooks/useHaptic';
import { AvatarRing } from '../components/chat/AvatarRing';
import { CachedImage } from '../components/CachedImage';
import { Caption, BodyEmphasis } from '../components/ui/Text';
import { EmptyState } from '../components/EmptyState';
import { useBackendData } from '../context/BackendDataContext';
import { SafeAreaView } from 'react-native-safe-area-context';

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
      <View>
        <View style={styles.requestRow}>
          {/* Identity section */}
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
            </View>
          </View>

          {/* Listing context card */}
          {listing && (
            <View style={styles.listingCard}>
              {listing.images?.[0] ? (
                <CachedImage uri={listing.images[0]} style={styles.listingThumb} contentFit="cover" />
              ) : (
                <View style={styles.listingThumbPlaceholder}>
                  <Ionicons name="pricetag-outline" size={16} color={Colors.textMuted} />
                </View>
              )}
              <View style={styles.listingInfo}>
                <Caption color={Colors.textSecondary} numberOfLines={1} style={styles.listingTitle}>{listing.title}</Caption>
                {listing.price != null && (
                  <Text style={styles.listingPrice}>
                    £{listing.price.toFixed(2)}
                  </Text>
                )}
              </View>
              <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} />
            </View>
          )}

          {/* Safety note */}
          <View style={styles.safetyNote}>
            <Ionicons name="shield-outline" size={12} color={Colors.textMuted} />
            <Text style={styles.safetyNoteText}>
              If this seems suspicious, decline and block.
            </Text>
          </View>

          {/* Actions */}
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
      </View>
    );
  };

  return (
    <SafeAreaView edges={['top']} style={styles.screenRoot}>
      <View style={styles.compactHeader}>
        <AnimatedPressable
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
          scaleValue={0.92}
          hapticFeedback="light"
          accessibilityLabel="Go back"
          accessibilityRole="button"
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={26} color={Colors.textPrimary} />
        </AnimatedPressable>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>Requests</Text>
          <Text style={styles.headerSubtitle}>
            {requestConversations.length > 0
              ? `${requestConversations.length} pending · Accept to chat`
              : 'People you don\'t follow'}
          </Text>
        </View>
        <View style={styles.backBtn} />
      </View>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screenRoot: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  compactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  headerTitle: {
    fontSize: Type.subtitle.size,
    fontFamily: TypeStyles.title.fontFamily,
    color: Colors.textPrimary,
    letterSpacing: Type.subtitle.letterSpacing,
  },
  headerSubtitle: {
    fontSize: Type.caption.size,
    fontFamily: TypeStyles.body.fontFamily,
    color: Colors.textMuted,
  },
  listContent: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.xxl,
  },
  requestRow: {
    paddingVertical: Space.md,
    paddingHorizontal: Space.md,
    gap: Space.sm,
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
  listingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.md,
    padding: Space.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  listingThumb: {
    width: 40,
    height: 40,
    borderRadius: Radius.sm,
  },
  listingThumbPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listingInfo: {
    flex: 1,
    gap: 2,
  },
  listingTitle: {
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
  },
  listingPrice: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    color: Colors.textPrimary,
  },
  safetyNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.xs,
  },
  safetyNoteText: {
    fontSize: Type.meta.size,
    fontFamily: TypeStyles.body.fontFamily,
    color: Colors.textMuted,
  },
  requestActions: {
    flexDirection: 'row',
    gap: Space.sm,
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
    marginLeft: Space.md,
    marginRight: Space.md,
  },
});