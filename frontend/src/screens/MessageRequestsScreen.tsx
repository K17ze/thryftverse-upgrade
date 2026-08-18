import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, Radius, Type, TypeStyles, Control } from '../theme/designTokens';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { useHaptic } from '../hooks/useHaptic';
import { AvatarRing } from '../components/chat/AvatarRing';
import { CachedImage } from '../components/CachedImage';
import { Caption } from '../components/ui/Text';
import { EmptyState } from '../components/EmptyState';
import { useBackendData } from '../context/BackendDataContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import { blockUser } from '../services/profileApi';

type NavT = NativeStackNavigationProp<RootStackParamList>;

type PendingAction = 'accept' | 'delete' | 'block' | null;

export default function MessageRequestsScreen() {
  const navigation = useNavigation<NavT>();
  const { show } = useToast();
  const haptic = useHaptic();
  const { colors } = useAppTheme();

  const conversations = useStore((state) => state.conversations);
  const messageRequests = useStore((state) => state.messageRequests);
  const acceptMessageRequest = useStore((state) => state.acceptMessageRequest);
  const declineMessageRequest = useStore((state) => state.declineMessageRequest);
  const profileMediaOverrides = useStore((state) => state.profileMediaOverrides);
  const currentUser = useStore((state) => state.currentUser);
  const toggleBlockedUser = useStore((state) => state.toggleBlockedUser);

  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  const requestConversations = useMemo(() => {
    return conversations.filter((c) => messageRequests.includes(c.id));
  }, [conversations, messageRequests]);

  const styles = useMemo(() => createStyles(colors), [colors]);

  const { listings } = useBackendData();

  const resolveCounterpartyId = (id: string): string | undefined => {
    const convo = conversations.find((c) => c.id === id);
    return convo?.participantIds?.find(
      (pid) => pid !== 'me' && pid !== currentUser?.id
    );
  };

  const handleAccept = (id: string) => {
    if (pendingId) return;
    haptic.medium();
    setPendingId(id);
    setPendingAction('accept');
    try {
      acceptMessageRequest(id);
      show('Request accepted', 'success');
      navigation.navigate('Chat', { conversationId: id });
    } catch {
      show('Could not accept this request. Try again.', 'error');
    } finally {
      setPendingId(null);
      setPendingAction(null);
    }
  };

  const handleDelete = (id: string) => {
    if (pendingId) return;
    Alert.alert(
      'Delete request?',
      'This removes the request. They can still send another message later.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            haptic.heavy();
            setPendingId(id);
            setPendingAction('delete');
            try {
              declineMessageRequest(id);
              show('Request deleted', 'info');
            } catch {
              show('Could not delete this request. Try again.', 'error');
            } finally {
              setPendingId(null);
              setPendingAction(null);
            }
          },
        },
      ]
    );
  };

  const handleBlock = (id: string, name: string) => {
    if (pendingId) return;
    Alert.alert(
      `Block ${name}?`,
      'They will not be able to message you or see your profile. The request will be removed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            haptic.heavy();
            setPendingId(id);
            setPendingAction('block');
            const counterpartyId = resolveCounterpartyId(id);
            try {
              if (counterpartyId) {
                await blockUser(counterpartyId);
                toggleBlockedUser(counterpartyId);
              }
              declineMessageRequest(id);
              show(`${name} blocked`, 'info');
            } catch {
              show('Could not block this account. Check your connection and try again.', 'error');
            } finally {
              setPendingId(null);
              setPendingAction(null);
            }
          },
        },
      ]
    );
  };

  const handleReport = (id: string, name: string) => {
    if (pendingId) return;
    haptic.light();
    const counterpartyId = resolveCounterpartyId(id);
    if (!counterpartyId) {
      show('This account cannot be reported here.', 'error');
      return;
    }
    navigation.navigate('Report', { type: 'user', targetId: counterpartyId });
  };

  const renderItem = ({ item }: { item: typeof requestConversations[0] }) => {
    const counterpartyId = item.participantIds?.find(
      (id) => id !== 'me' && id !== currentUser?.id
    );
    const counterpartyProfile = counterpartyId
      ? item.participantProfiles?.find((p) => p.id === counterpartyId)
      : undefined;
    const displayTitle = item.title ?? counterpartyProfile?.displayName ?? 'Thryft user';
    const username = counterpartyProfile?.username;
    const avatarUri =
      item.avatar ??
      (counterpartyId ? profileMediaOverrides[counterpartyId]?.avatar ?? undefined : undefined);
    const listing = item.itemId ? listings.find((l) => l.id === item.itemId) : undefined;
    const isPending = pendingId === item.id;

    const renderActionContent = (action: PendingAction, label: string) =>
      isPending && pendingAction === action ? (
        <ActivityIndicator size="small" color={action === 'accept' ? colors.textInverse : colors.textPrimary} />
      ) : (
        <Text
          style={[
            action === 'accept' ? styles.requestAcceptText : styles.requestDeclineText,
            isPending && styles.actionDisabled,
          ]}
        >
          {label}
        </Text>
      );

    return (
      <View>
        <View style={styles.requestRow}>
          {/* Identity */}
          <View style={styles.requestIdentity}>
            <AvatarRing
              uri={avatarUri}
              size={52}
              ringWidth={2}
              fallbackInitials={displayTitle.slice(0, 2).toUpperCase()}
            />
            <View style={styles.requestText}>
              <BodyEmphasisLine
                title={displayTitle}
                time={item.lastMessageTime}
                colors={colors}
              />
              {username ? (
                <Caption color={colors.textMuted} numberOfLines={1} style={styles.requestHandle}>
                  @{username}
                </Caption>
              ) : null}
              <Caption color={colors.textSecondary} numberOfLines={1} style={styles.requestPreview}>
                {item.lastMessage ?? 'Wants to message you'}
              </Caption>
            </View>
          </View>

          {/* Listing context */}
          {listing && (
            <View style={styles.listingCard}>
              {listing.images?.[0] ? (
                <CachedImage uri={listing.images[0]} style={styles.listingThumb} contentFit="cover" />
              ) : (
                <View style={styles.listingThumbPlaceholder}>
                  <Ionicons name="pricetag-outline" size={16} color={colors.textMuted} />
                </View>
              )}
              <View style={styles.listingInfo}>
                <Caption color={colors.textSecondary} numberOfLines={1} style={styles.listingTitle}>{listing.title}</Caption>
                {listing.price != null && (
                  <Text style={styles.listingPrice}>£{listing.price.toFixed(2)}</Text>
                )}
              </View>
              <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
            </View>
          )}

          {/* Safety note for non-marketplace requests */}
          {!listing && (
            <View style={styles.safetyNote}>
              <Ionicons name="shield-outline" size={12} color={colors.textMuted} />
              <Text style={styles.safetyNoteText}>
                If this seems suspicious, delete and block.
              </Text>
            </View>
          )}

          {/* Primary actions */}
          <View style={styles.requestActions}>
            <AnimatedPressable
              style={styles.requestDecline}
              onPress={() => handleDelete(item.id)}
              activeOpacity={0.85}
              scaleValue={0.96}
              hapticFeedback="light"
              disabled={isPending}
              accessibilityRole="button"
              accessibilityLabel="Delete message request"
              accessibilityState={{ busy: isPending && pendingAction === 'delete', disabled: isPending }}
            >
              {renderActionContent('delete', 'Delete')}
            </AnimatedPressable>
            <AnimatedPressable
              style={[styles.requestAccept, isPending && pendingAction !== 'accept' && styles.actionDisabledBg]}
              onPress={() => handleAccept(item.id)}
              activeOpacity={0.85}
              scaleValue={0.96}
              hapticFeedback="medium"
              disabled={isPending}
              accessibilityRole="button"
              accessibilityLabel="Accept message request"
              accessibilityState={{ busy: isPending && pendingAction === 'accept', disabled: isPending }}
            >
              {renderActionContent('accept', 'Accept')}
            </AnimatedPressable>
          </View>

          {/* Secondary actions: Block + Report */}
          <View style={styles.secondaryActions}>
            <AnimatedPressable
              onPress={() => handleBlock(item.id, displayTitle)}
              activeOpacity={0.85}
              scaleValue={0.96}
              hapticFeedback="medium"
              disabled={isPending}
              accessibilityRole="button"
              accessibilityLabel={`Block ${displayTitle}`}
              accessibilityState={{ busy: isPending && pendingAction === 'block', disabled: isPending }}
              style={styles.secondaryBtn}
            >
              <Ionicons name="ban-outline" size={14} color={colors.danger} />
              <Text style={styles.secondaryBtnTextDanger}>Block</Text>
            </AnimatedPressable>
            <AnimatedPressable
              onPress={() => handleReport(item.id, displayTitle)}
              activeOpacity={0.85}
              scaleValue={0.96}
              hapticFeedback="light"
              disabled={isPending}
              accessibilityRole="button"
              accessibilityLabel={`Report ${displayTitle}`}
              style={styles.secondaryBtn}
            >
              <Ionicons name="flag-outline" size={14} color={colors.textSecondary} />
              <Text style={styles.secondaryBtnText}>Report</Text>
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
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </AnimatedPressable>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>Message requests</Text>
          <Text style={styles.headerSubtitle}>
            {requestConversations.length > 0
              ? `${requestConversations.length} pending · Accept to chat`
              : "People you don't follow"}
          </Text>
        </View>
        <View style={styles.backBtn} />
      </View>
      {requestConversations.length === 0 ? (
        <EmptyState
          icon="mail-outline"
          title="No message requests"
          subtitle="When someone you don't follow sends you a message, it will appear here for you to review."
          ctaLabel="Back to Inbox"
          onCtaPress={() => navigation.goBack()}
        />
      ) : (
        <FlashList
          data={requestConversations}
          keyExtractor={(c) => c.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

function BodyEmphasisLine({
  title,
  time,
  colors,
}: {
  title: string;
  time?: string;
  colors: ThemeColors;
}) {
  return (
    <View style={styles$inline.requestTop}>
      <Text
        numberOfLines={1}
        style={styles$inline.requestName}
      >
        {title}
      </Text>
      {time ? (
        <Text style={[styles$inline.requestTime, { color: colors.textMuted }]}>{time}</Text>
      ) : null}
    </View>
  );
}

const styles$inline = StyleSheet.create({
  requestTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.sm,
  },
  requestName: {
    flex: 1,
    fontSize: Type.bodyEmphasis.size,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    color: undefined,
    letterSpacing: Type.bodyEmphasis.letterSpacing,
  },
  requestTime: {
    fontSize: Type.caption.size,
    fontFamily: TypeStyles.body.fontFamily,
  },
});

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screenRoot: {
      flex: 1,
      backgroundColor: colors.background,
    },
    compactHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    backBtn: {
      width: Control.hit,
      height: Control.hit,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitleWrap: {
      flex: 1,
      alignItems: 'center',
      gap: Space.xs / 2,
    },
    headerTitle: {
      fontSize: Type.subtitle.size,
      fontFamily: TypeStyles.title.fontFamily,
      color: colors.textPrimary,
      letterSpacing: Type.subtitle.letterSpacing,
    },
    headerSubtitle: {
      fontSize: Type.caption.size,
      fontFamily: TypeStyles.body.fontFamily,
      color: colors.textMuted,
    },
    listContent: {
      paddingHorizontal: Space.md,
      paddingTop: Space.sm,
      paddingBottom: Space.xxl,
    },
    requestRow: {
      paddingVertical: Space.md,
      paddingHorizontal: Space.sm,
      gap: Space.sm,
    },
    requestIdentity: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Space.sm + 4,
    },
    requestText: {
      flex: 1,
      justifyContent: 'center',
      gap: Space.xs / 2,
    },
    requestHandle: {
      marginTop: -Space.xs / 2,
    },
    requestPreview: {
      lineHeight: Type.caption.lineHeight + 2,
      marginTop: Space.xs / 2,
    },
    listingCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      backgroundColor: colors.surfaceAlt,
      borderRadius: Radius.md,
      padding: Space.sm,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    listingThumb: {
      width: Space.xl + Space.xs + 4,
      height: Space.xl + Space.xs + 4,
      borderRadius: Radius.sm,
    },
    listingThumbPlaceholder: {
      width: Space.xl + Space.xs + 4,
      height: Space.xl + Space.xs + 4,
      borderRadius: Radius.sm,
      backgroundColor: colors.surface,
      justifyContent: 'center',
      alignItems: 'center',
    },
    listingInfo: {
      flex: 1,
      gap: Space.xs / 2,
    },
    listingTitle: {
      fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    },
    listingPrice: {
      fontSize: Type.bodyEmphasis.size,
      fontFamily: TypeStyles.bodyEmphasis.fontFamily,
      color: colors.textPrimary,
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
      color: colors.textMuted,
    },
    requestActions: {
      flexDirection: 'row',
      gap: Space.sm,
    },
    requestDecline: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: Control.hit,
      borderRadius: Radius.md,
      backgroundColor: colors.surfaceAlt,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    requestDeclineText: {
      fontSize: Type.caption.size,
      fontFamily: TypeStyles.bodyEmphasis.fontFamily,
      color: colors.textPrimary,
    },
    requestAccept: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: Control.hit,
      borderRadius: Radius.md,
      backgroundColor: colors.textPrimary,
    },
    requestAcceptText: {
      fontSize: Type.caption.size,
      fontFamily: TypeStyles.bodyEmphasis.fontFamily,
      color: colors.textInverse,
    },
    actionDisabled: {
      opacity: 0.4,
    },
    actionDisabledBg: {
      opacity: 0.5,
    },
    secondaryActions: {
      flexDirection: 'row',
      gap: Space.sm,
    },
    secondaryBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Space.xs + 2,
      minHeight: Control.hit,
      borderRadius: Radius.md,
      backgroundColor: colors.surfaceAlt,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    secondaryBtnTextDanger: {
      fontSize: Type.caption.size,
      fontFamily: TypeStyles.bodyEmphasis.fontFamily,
      color: colors.danger,
    },
    secondaryBtnText: {
      fontSize: Type.caption.size,
      fontFamily: TypeStyles.bodyEmphasis.fontFamily,
      color: colors.textSecondary,
    },
    requestSeparator: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginLeft: Space.md,
      marginRight: Space.md,
    },
  });
}
