import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, Radius, TypeStyles, Control } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { useHaptic } from '../hooks/useHaptic';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { AvatarRing } from '../components/chat/AvatarRing';
import { CachedImage } from '../components/CachedImage';
import { Caption } from '../components/ui/Text';
import { ConfirmationSheet } from '../components/ConfirmationSheet';
import { EmptyState } from '../components/EmptyState';
import { ConversationListSkeleton } from '../components/skeletons/ConversationListSkeleton';
import { useBackendData } from '../context/BackendDataContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import { blockUser } from '../services/profileApi';
import { deleteConversationOnApi, acceptMessageRequestOnApi } from '../services/chatApi';

type NavT = NativeStackNavigationProp<RootStackParamList>;

type PendingAction = 'accept' | 'delete' | 'block' | null;

export default function MessageRequestsScreen() {
  const navigation = useNavigation<NavT>();
  const { show } = useToast();
  const haptic = useHaptic();
  const { formatFromFiat, currencyCode } = useFormattedPrice();
  const { colors } = useAppTheme();

  const conversations = useStore((state) => state.conversations);
  const conversationsLoaded = useStore((state) => state.conversationsLoaded);
  const messageRequests = useStore((state) => state.messageRequests);
  const acceptMessageRequest = useStore((state) => state.acceptMessageRequest);
  const declineMessageRequest = useStore((state) => state.declineMessageRequest);
  const profileMediaOverrides = useStore((state) => state.profileMediaOverrides);
  const currentUser = useStore((state) => state.currentUser);
  const toggleBlockedUser = useStore((state) => state.toggleBlockedUser);

  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [confirmSheet, setConfirmSheet] = useState<{
    visible: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    onConfirm: () => void;
    variant?: 'default' | 'danger';
  }>({ visible: false, title: '', message: '', onConfirm: () => {} });

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

  const handleAccept = async (id: string) => {
    if (pendingId) return;
    haptic.medium();
    setPendingId(id);
    setPendingAction('accept');
    try {
      await acceptMessageRequestOnApi(id);
      acceptMessageRequest(id);
      show('Request accepted', 'success');
      navigation.navigate('Chat', { conversationId: id });
    } catch {
      show('Could not accept this request. Check your connection and try again.', 'error');
    } finally {
      setPendingId(null);
      setPendingAction(null);
    }
  };

  const handleDelete = (id: string) => {
    if (pendingId) return;
    setConfirmSheet({
      visible: true,
      title: 'Delete request?',
      message: 'This removes the request. They can still send another message later.',
      confirmLabel: 'Delete',
      variant: 'danger',
      onConfirm: async () => {
        setConfirmSheet((s) => ({ ...s, visible: false }));
        haptic.heavy();
        setPendingId(id);
        setPendingAction('delete');
        try {
          await deleteConversationOnApi(id, 'me');
          declineMessageRequest(id);
          show('Request deleted', 'info');
        } catch {
          show('Could not delete this request. Check your connection and try again.', 'error');
        } finally {
          setPendingId(null);
          setPendingAction(null);
        }
      } });
  };

  const handleBlock = (id: string, name: string) => {
    if (pendingId) return;
    setConfirmSheet({
      visible: true,
      title: `Block ${name}?`,
      message: 'They will not be able to message you or see your profile. The request will be removed.',
      confirmLabel: 'Block',
      variant: 'danger',
      onConfirm: async () => {
        setConfirmSheet((s) => ({ ...s, visible: false }));
        haptic.heavy();
        setPendingId(id);
        setPendingAction('block');
        const counterpartyId = resolveCounterpartyId(id);
        try {
          if (counterpartyId) {
            await blockUser(counterpartyId);
            toggleBlockedUser(counterpartyId);
          }
          await deleteConversationOnApi(id, 'me');
          declineMessageRequest(id);
          show(`${name} blocked`, 'info');
        } catch {
          show('Could not block this account. Check your connection and try again.', 'error');
        } finally {
          setPendingId(null);
          setPendingAction(null);
        }
      } });
  };

  const handleReport = (id: string, _name: string) => {
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
          {/* Identity — the dominant object */}
          <View style={styles.requestIdentity}>
            <AvatarRing
              uri={avatarUri}
              size={48}
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

          {/* Marketplace context — flat hairline row, not a nested card.
              No card-on-card: this shares the row's surface, separated by a hairline. */}
          {listing && (
            <View style={styles.listingContext}>
              {listing.images?.[0] ? (
                <CachedImage uri={listing.images[0]} style={styles.listingThumb} contentFit="cover" />
              ) : (
                <View style={styles.listingThumbPlaceholder}>
                  <Ionicons name="pricetag-outline" size={14} color={colors.textMuted} />
                </View>
              )}
              <Text style={styles.listingTitle} numberOfLines={1}>{listing.title}</Text>
              {listing.price != null && (
                <Text style={styles.listingPrice}>{formatFromFiat(listing.price, currencyCode)}</Text>
              )}
            </View>
          )}

          {/* Primary actions — Accept dominates, Delete is secondary.
              One hierarchy, not symmetry. */}
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

          {/* Safety actions — quiet, low-weight text links.
              Block is destructive (danger text), Report is secondary.
              Not equal full-width buttons — they recede until needed. */}
          <View style={styles.safetyActions}>
            <AnimatedPressable
              onPress={() => handleBlock(item.id, displayTitle)}
              activeOpacity={0.7}
              scaleValue={0.96}
              hapticFeedback="medium"
              disabled={isPending}
              accessibilityRole="button"
              accessibilityLabel={`Block ${displayTitle}`}
              accessibilityState={{ busy: isPending && pendingAction === 'block', disabled: isPending }}
              style={styles.safetyLink}
            >
              <Ionicons name="ban-outline" size={13} color={colors.danger} />
              <Text style={styles.safetyLinkTextDanger}>Block</Text>
            </AnimatedPressable>
            <View style={styles.safetyDivider} />
            <AnimatedPressable
              onPress={() => handleReport(item.id, displayTitle)}
              activeOpacity={0.7}
              scaleValue={0.96}
              hapticFeedback="light"
              disabled={isPending}
              accessibilityRole="button"
              accessibilityLabel={`Report ${displayTitle}`}
              style={styles.safetyLink}
            >
              <Ionicons name="flag-outline" size={13} color={colors.textMuted} />
              <Text style={styles.safetyLinkText}>Report</Text>
            </AnimatedPressable>
          </View>
        </View>
        <View style={styles.requestSeparator} />
      </View>
    );
  };

  const showLoading = !conversationsLoaded;
  const showEmpty = !showLoading && requestConversations.length === 0;

  return (
    <SafeAreaView edges={['top']} style={styles.screenRoot}>
      <ScreenHeader
        title="Message requests"
        onBack={() => navigation.goBack()}
        style={{
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border }}
      />
      {showLoading ? (
        <ConversationListSkeleton count={5} />
      ) : showEmpty ? (
        <EmptyState
          icon="mail-outline"
          title="No message requests"
          subtitle="Messages from people you don't follow appear here."
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
      <ConfirmationSheet
        visible={confirmSheet.visible}
        onDismiss={() => setConfirmSheet((s) => ({ ...s, visible: false }))}
        title={confirmSheet.title}
        message={confirmSheet.message}
        confirmLabel={confirmSheet.confirmLabel ?? 'Confirm'}
        variant={confirmSheet.variant ?? 'danger'}
        onConfirm={confirmSheet.onConfirm}
      />
    </SafeAreaView>
  );
}

function BodyEmphasisLine({
  title,
  time,
  colors }: {
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
    gap: Space.sm },
  requestName: {
    flex: 1,
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    color: undefined,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing },
  requestTime: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypeStyles.body.fontFamily } });

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screenRoot: {
      flex: 1,
      backgroundColor: colors.background },
    listContent: {
      paddingHorizontal: Space.md,
      paddingTop: Space.sm,
      paddingBottom: Space.xxl },
    requestRow: {
      paddingVertical: Space.md,
      paddingHorizontal: Space.sm,
      gap: Space.sm },
    requestIdentity: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Space.sm + 2 },
    requestText: {
      flex: 1,
      justifyContent: 'center',
      gap: Space.xs / 2 },
    requestHandle: {
      marginTop: -Space.xs / 2 },
    requestPreview: {
      lineHeight: TypographyV2.meta.lineHeight + 2,
      marginTop: Space.xs / 2 },
    // ── Marketplace context — flat hairline row, not a nested card ──
    listingContext: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingTop: Space.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border },
    listingThumb: {
      width: Space.xl + 4,
      height: Space.xl + 4,
      borderRadius: Radius.sm },
    listingThumbPlaceholder: {
      width: Space.xl + 4,
      height: Space.xl + 4,
      borderRadius: Radius.sm,
      backgroundColor: colors.surface,
      justifyContent: 'center',
      alignItems: 'center' },
    listingTitle: {
      flex: 1,
      fontSize: TypographyV2.meta.size,
      fontFamily: TypeStyles.body.fontFamily,
      color: colors.textSecondary },
    listingPrice: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypeStyles.bodyEmphasis.fontFamily,
      color: colors.textPrimary },
    // ── Primary actions ──
    requestActions: {
      flexDirection: 'row',
      gap: Space.sm },
    requestDecline: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: Control.hit,
      borderRadius: Radius.md,
      backgroundColor: colors.surfaceAlt,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border },
    requestDeclineText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypeStyles.bodyEmphasis.fontFamily,
      color: colors.textPrimary },
    requestAccept: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: Control.hit,
      borderRadius: Radius.md,
      backgroundColor: colors.textPrimary },
    requestAcceptText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypeStyles.bodyEmphasis.fontFamily,
      color: colors.textInverse },
    actionDisabled: {
      opacity: 0.4 },
    actionDisabledBg: {
      opacity: 0.5 },
    // ── Safety actions — quiet text links, not equal buttons ──
    safetyActions: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Space.sm },
    safetyLink: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingVertical: Space.xs,
      paddingHorizontal: Space.sm,
      minHeight: 36 },
    safetyLinkTextDanger: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypeStyles.bodyEmphasis.fontFamily,
      color: colors.danger },
    safetyLinkText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypeStyles.bodyEmphasis.fontFamily,
      color: colors.textMuted },
    safetyDivider: {
      width: 1,
      height: 14,
      backgroundColor: colors.border },
    requestSeparator: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginLeft: Space.md,
      marginRight: Space.md } });
}
