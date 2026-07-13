import React, { useMemo, useState } from 'react';
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
import { Space, Radius, Type, TypeStyles } from '../theme/designTokens';
import { useAppTheme } from '../theme/ThemeContext';
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
  const { colors } = useAppTheme();
  const navigation = useNavigation<NavT>();
  const { show } = useToast();
  const haptic = useHaptic();

  const conversations = useStore((state) => state.conversations);
  const messageRequests = useStore((state) => state.messageRequests);
  const acceptMessageRequest = useStore((state) => state.acceptMessageRequest);
  const declineMessageRequest = useStore((state) => state.declineMessageRequest);
  const profileMediaOverrides = useStore((state) => state.profileMediaOverrides);
  const currentUser = useStore((state) => state.currentUser);
  const toggleBlockedUser = useStore((state) => state.toggleBlockedUser);

  const [expandedId, setExpandedId] = useState<string | null>(null);

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

  const handleBlock = (id: string, name: string) => {
    Alert.alert(
      `Block ${name}?`,
      'They will not be able to message you or see your profile.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: () => {
            haptic.heavy();
            declineMessageRequest(id);
            const counterpartyId = conversations.find((c) => c.id === id)?.participantIds?.find(
              (pid) => pid !== 'me' && pid !== currentUser?.id
            );
            if (counterpartyId) {
              toggleBlockedUser(counterpartyId);
            }
            show(`${name} blocked`, 'info');
          },
        },
      ]
    );
  };

  const handleReport = (id: string, name: string) => {
    Alert.alert(
      `Report ${name}?`,
      'Report this user for suspicious or inappropriate behaviour. They will be declined automatically.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Report',
          style: 'destructive',
          onPress: () => {
            haptic.heavy();
            declineMessageRequest(id);
            show('Report submitted. Request declined.', 'info');
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
                  <Caption color={colors.textMuted}>{item.lastMessageTime}</Caption>
                )}
              </View>
              <Caption color={colors.textMuted} numberOfLines={2} style={styles.requestPreview}>
                {item.lastMessage ?? 'Wants to message you'}
              </Caption>
            </View>
          </View>

          {/* Listing context card */}
          {listing && (
            <View style={[styles.listingCard, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
              {listing.images?.[0] ? (
                <CachedImage uri={listing.images[0]} style={styles.listingThumb} contentFit="cover" />
              ) : (
                <View style={[styles.listingThumbPlaceholder, { backgroundColor: colors.surface }]}>
                  <Ionicons name="pricetag-outline" size={16} color={colors.textMuted} />
                </View>
              )}
              <View style={styles.listingInfo}>
                <Caption color={colors.textSecondary} numberOfLines={1} style={styles.listingTitle}>{listing.title}</Caption>
                {listing.price != null && (
                  <Text style={[styles.listingPrice, { color: colors.textPrimary }]}>
                    £{listing.price.toFixed(2)}
                  </Text>
                )}
              </View>
              <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
            </View>
          )}

          {/* Safety note — only for non-marketplace requests */}
          {!listing && (
            <View style={styles.safetyNote}>
              <Ionicons name="shield-outline" size={12} color={colors.textMuted} />
              <Text style={[styles.safetyNoteText, { color: colors.textMuted }]}>
                If this seems suspicious, decline and block.
              </Text>
            </View>
          )}

          {/* Actions */}
          <View style={styles.requestActions}>
            <AnimatedPressable
              style={[styles.requestDecline, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
              onPress={() => handleDecline(item.id)}
              activeOpacity={0.85}
              scaleValue={0.96}
              hapticFeedback="light"
              accessibilityRole="button"
              accessibilityLabel="Decline message request"
            >
              <Text style={[styles.requestDeclineText, { color: colors.textPrimary }]}>Decline</Text>
            </AnimatedPressable>
            <AnimatedPressable
              style={[styles.requestAccept, { backgroundColor: colors.textPrimary }]}
              onPress={() => handleAccept(item.id)}
              activeOpacity={0.85}
              scaleValue={0.96}
              hapticFeedback="medium"
              accessibilityRole="button"
              accessibilityLabel="Accept message request"
            >
              <Text style={[styles.requestAcceptText, { color: colors.textInverse }]}>Accept</Text>
            </AnimatedPressable>
          </View>

          {/* Progressive disclosure: expanded actions */}
          {expandedId === item.id ? (
            <View style={styles.expandedActions}>
              <AnimatedPressable
                onPress={() => handleBlock(item.id, displayTitle)}
                activeOpacity={0.85}
                scaleValue={0.96}
                hapticFeedback="medium"
                accessibilityRole="button"
                accessibilityLabel={`Block ${displayTitle}`}
                style={[styles.expandedBtn, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
              >
                <Ionicons name="ban-outline" size={14} color={colors.danger} />
                <Text style={styles.expandedBtnTextDanger}>Block</Text>
              </AnimatedPressable>
              <AnimatedPressable
                onPress={() => handleReport(item.id, displayTitle)}
                activeOpacity={0.85}
                scaleValue={0.96}
                hapticFeedback="medium"
                accessibilityRole="button"
                accessibilityLabel={`Report ${displayTitle}`}
                style={[styles.expandedBtn, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
              >
                <Ionicons name="flag-outline" size={14} color={colors.danger} />
                <Text style={styles.expandedBtnTextDanger}>Report</Text>
              </AnimatedPressable>
              <AnimatedPressable
                onPress={() => setExpandedId(null)}
                activeOpacity={0.85}
                scaleValue={0.96}
                hapticFeedback="light"
                accessibilityRole="button"
                accessibilityLabel="Hide options"
                style={[styles.expandedBtn, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
              >
                <Ionicons name="chevron-up-outline" size={14} color={colors.textMuted} />
                <Text style={styles.expandedBtnTextMuted}>Less</Text>
              </AnimatedPressable>
            </View>
          ) : (
            <AnimatedPressable
              onPress={() => setExpandedId(item.id)}
              activeOpacity={0.85}
              scaleValue={0.96}
              hapticFeedback="light"
              accessibilityRole="button"
              accessibilityLabel="Show more options"
              style={styles.moreBtn}
            >
              <Text style={styles.moreBtnText}>Block or report</Text>
              <Ionicons name="chevron-down-outline" size={12} color={colors.textMuted} />
            </AnimatedPressable>
          )}
        </View>
        <View style={[styles.requestSeparator, { backgroundColor: colors.border }]} />
      </View>
    );
  };

  return (
    <SafeAreaView edges={['top']} style={[styles.screenRoot, { backgroundColor: colors.background }]}>
      <View style={[styles.compactHeader, { borderBottomColor: colors.border }]}>
        <AnimatedPressable
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
          scaleValue={0.92}
          hapticFeedback="light"
          accessibilityLabel="Go back"
          accessibilityRole="button"
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </AnimatedPressable>
        <View style={styles.headerTitleWrap}>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Requests</Text>
          <Text style={[styles.headerSubtitle, { color: colors.textMuted }]}>
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
  },
  compactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
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
    letterSpacing: Type.subtitle.letterSpacing,
  },
  headerSubtitle: {
    fontSize: Type.caption.size,
    fontFamily: TypeStyles.body.fontFamily,
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
    borderRadius: Radius.md,
    padding: Space.sm,
    borderWidth: StyleSheet.hairlineWidth,
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
    borderWidth: StyleSheet.hairlineWidth,
  },
  requestDeclineText: {
    fontSize: Type.caption.size,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
  },
  requestAccept: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    borderRadius: Radius.md,
  },
  requestAcceptText: {
    fontSize: Type.caption.size,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
  },
  requestSeparator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: Space.md,
    marginRight: Space.md,
  },
  expandedActions: {
    flexDirection: 'row',
    gap: Space.sm,
    paddingTop: Space.xs,
  },
  expandedBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  expandedBtnTextDanger: {
    fontSize: Type.caption.size,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
  },
  expandedBtnTextMuted: {
    fontSize: Type.caption.size,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
  },
  moreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
  },
  moreBtnText: {
    fontSize: Type.meta.size,
    fontFamily: TypeStyles.body.fontFamily,
  },
});