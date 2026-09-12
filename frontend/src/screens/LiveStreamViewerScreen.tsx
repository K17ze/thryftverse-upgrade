/**
 * LiveStreamViewerScreen — immersive live shopping viewer.
 *
 * Composition: the live video stage is the dominant object and fills the
 * viewport; overlays are restrained chrome on the dark media canvas
 * (EditorCanvas + scrim tokens, identical in both app themes). Chat is a
 * flat list with hairlines, not a card stack. The commerce dock is a single
 * contained panel: current lot, price, and bid/buy actions.
 *
 * Truthful UI (AGENTS §11): viewer counts, chat, bids and lot state come
 * from the realtime contract only. Capabilities the backend does not
 * expose (likes, buy-now price, winner badge on real lots) are omitted —
 * never fabricated. Video playback needs the LiveKit room: when the session
 * carries no token, or the native module is unavailable, the stage states
 * it plainly instead of pretending to play.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  useWindowDimensions,
  StatusBar,
  Platform,
  KeyboardAvoidingView,
  Share,
  ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { RootStackParamList, NativeStackNavigationProp } from '../navigation/types';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { useHaptic } from '../hooks/useHaptic';
import { useSignupWall } from '../hooks/useSignupWall';
import { useToast } from '../context/ToastContext';
import { useFollowMutation } from '../platform/server';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useConnectivity } from '../hooks/useConnectivity';
import { Space, Radius, Control, Stroke, EditorCanvas } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { CachedImage } from '../components/CachedImage';
import { AppIcon } from '../components/common/AppIcon';
import { IconSize } from '../theme/iconTokens';
import { LiveBadge } from '../components/live/LiveBadge';
import {
  FlagshipScreen,
  FlagshipHeader,
  FlagshipState,
  FlagshipMetricLine,
  SkeletonBlock,
  SkeletonTextLine } from '../components/flagship';
import { useLiveKitRoom } from '../platform/streaming';
import { fetchPublicProfile } from '../services/profileApi';
import {
  LiveStream,
  LiveLot,
  LiveStreamChatMessage,
  StreamEndEventPayload,
  connectToStream,
  disconnectFromStream,
  subscribeToStreamEvents,
  subscribeToChat,
  subscribeToViewerCount,
  subscribeToBids,
  subscribeToLotChanges,
  placeStreamBid,
  checkBidStatus,
  buyNowDuringStream,
  sendStreamChatMessage,
  fetchStreamChatHistory,
  settleLot,
  type LotStatus } from '../services/liveShoppingApi';
import { useAppTranslation } from '../i18n/useAppTranslation';
import { track } from '../analytics';

// ---------------------------------------------------------------------------
// Types & helpers
// ---------------------------------------------------------------------------

type LiveStreamViewerRoute = RouteProp<RootStackParamList, 'LiveStreamViewer'>;

type ConnectionState = 'connecting' | 'live' | 'error' | 'ended';

type BidOutcome = 'idle' | 'submitting' | 'accepted' | 'rejected' | 'unknown';

interface SellerIdentity {
  name: string;
  avatar: string | null;
  verified: boolean;
}

function lotStatusLabel(status: LotStatus, currentPrice: number, t: (key: string, options?: Record<string, unknown>) => string): string {
  switch (status) {
    case 'scheduled':
      return t('lotStatus.comingUp');
    case 'open':
      return t('lotStatus.openForBidding');
    case 'closing':
      return t('lotStatus.closingSoon');
    case 'sold':
      return t('lotStatus.sold', { price: currentPrice });
    case 'passed':
      return t('lotStatus.passed');
    case 'cancelled':
      return t('lotStatus.cancelled');
  }
}

function lotStatusColor(status: LotStatus, colors: ThemeColors): string {
  switch (status) {
    case 'open':
    case 'sold':
      return colors.scrimDeltaPositive;
    case 'closing':
      return colors.warning;
    default:
      return colors.scrimTextSecondary;
  }
}

function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LiveStreamViewerScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<LiveStreamViewerRoute>();
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const insets = useSafeAreaInsets();
  const { show } = useToast();
  const { requireAuth } = useSignupWall();
  const reducedMotion = useReducedMotion();
  const { formatFromFiat, currencySymbol } = useFormattedPrice();
  const { isOffline } = useConnectivity();
  const { height: SCREEN_HEIGHT } = useWindowDimensions();
  const styles = useMemo(() => createStyles(colors, SCREEN_HEIGHT), [colors, SCREEN_HEIGHT]);
  const { t } = useAppTranslation('liveStreamViewer');

  const sessionId = route.params?.sessionId;

  // ── Real-time state ──
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const [stream, setStream] = useState<LiveStream | null>(null);
  const [messages, setMessages] = useState<LiveStreamChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [bidSheetVisible, setBidSheetVisible] = useState(false);
  const [itemSheetVisible, setItemSheetVisible] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  const [sellerIdentity, setSellerIdentity] = useState<SellerIdentity | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [bidPending, setBidPending] = useState(false);
  const [buyNowPending, setBuyNowPending] = useState(false);
  const [bidOutcome, setBidOutcome] = useState<BidOutcome>('idle');
  const [lastBidId, setLastBidId] = useState<string | null>(null);
  const [lastBidAmount, setLastBidAmount] = useState<number>(0);
  const [bidCheckPending, setBidCheckPending] = useState(false);
  const [streamEndSummary, setStreamEndSummary] = useState<StreamEndEventPayload | null>(null);
  const [currentLot, setCurrentLot] = useState<LiveLot | null>(null);
  const [settlePending, setSettlePending] = useState(false);

  const chatListRef = useRef<FlatList<LiveStreamChatMessage>>(null);
  const [reconnectCount, setReconnectCount] = useState(0);

  // Real video plane — LiveKit room joined with the viewer token the backend
  // issued. When the session carries no credentials the hook stays
  // disconnected and the stage degrades honestly (no fake video surface).
  const liveKit = useLiveKitRoom(stream?.wsUrl ?? null, stream?.token ?? null);

  // Follow / unfollow — wired to the real profile social API. Rendered only
  // when the contract supplies a seller identity.
  const followMutation = useFollowMutation(stream?.sellerId ?? '');

  // ── Connect to stream on mount ──
  useEffect(() => {
    let cancelled = false;
    let unsubChat: (() => void) | null = null;
    let unsubViewer: (() => void) | null = null;
    let unsubBids: (() => void) | null = null;
    let unsubLotChanges: (() => void) | null = null;
    let unsubStreamEnd: (() => void) | null = null;

    (async () => {
      try {
        const connected = await connectToStream(sessionId);
        if (cancelled) return;
        if (!connected) {
          setConnectionState('error');
          return;
        }

        setStream(connected);
        setViewerCount(connected.viewerCount);
        const lot = connected.lots[connected.currentLotIndex] ?? null;
        setCurrentLot(lot);
        setConnectionState('live');
        track('live_stream_viewed', { stream_id: sessionId });

        // Resolve seller identity: the stream contract carries a name on
        // demo sessions; real sessions only carry hostUserId, so fetch the
        // public profile to fill identity honestly.
        if (!connected.sellerName && connected.sellerId) {
          try {
            const profile = await fetchPublicProfile(connected.sellerId);
            if (!cancelled && profile) {
              setSellerIdentity({
                name: profile.displayName ?? profile.username,
                avatar: profile.avatar,
                verified: profile.sellerVerified ?? profile.identityVerified ?? false,
              });
            }
          } catch {
            // Identity is best-effort — the header simply stays minimal.
          }
        } else if (connected.sellerName) {
          setSellerIdentity({
            name: connected.sellerName,
            avatar: connected.sellerAvatar ?? null,
            verified: connected.sellerVerified ?? false,
          });
        }

        const history = await fetchStreamChatHistory(sessionId);
        if (cancelled) return;
        setMessages(history);

        unsubChat = subscribeToChat(sessionId, (payload) => {
          setMessages((prev) => [...prev.slice(-80), payload.message]);
        });

        unsubViewer = subscribeToViewerCount(sessionId, (payload) => {
          setViewerCount(payload.count);
        });

        unsubBids = subscribeToBids(sessionId, (payload) => {
          setCurrentLot((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              currentPrice: payload.newCurrentPrice ?? prev.currentPrice,
              bidCount: payload.newBidCount ?? prev.bidCount };
          });
        });

        unsubLotChanges = subscribeToLotChanges(sessionId, (payload) => {
          setCurrentLot({ ...payload.lot });
          setStream((prev) => prev ? { ...prev, currentLotIndex: payload.newLotIndex } : prev);
        });

        unsubStreamEnd = subscribeToStreamEvents(sessionId, (event) => {
          if (event.type === 'stream_end') {
            const summary = event.payload as StreamEndEventPayload;
            setStreamEndSummary(summary);
            setConnectionState('ended');
          }
        });
      } catch {
        if (!cancelled) {
          setConnectionState('error');
        }
      }
    })();

    return () => {
      cancelled = true;
      unsubChat?.();
      unsubViewer?.();
      unsubBids?.();
      unsubLotChanges?.();
      unsubStreamEnd?.();
      disconnectFromStream(sessionId);
    };
  }, [sessionId, reconnectCount]);

  const handleSendChat = useCallback(async () => {
    if (!chatInput.trim()) return;
    if (!requireAuth('message_seller')) return;
    const text = chatInput.trim();
    setChatInput('');
    haptic.light();
    try {
      await sendStreamChatMessage(sessionId, text);
    } catch {
      show(t('toast.couldNotSend'), 'error');
    }
  }, [chatInput, haptic, sessionId, show, requireAuth, t]);

  const handleBid = useCallback(async (amount: number) => {
    if (!currentLot) return;
    if (!requireAuth('place_bid')) return;
    setBidPending(true);
    setBidOutcome('submitting');
    haptic.medium();
    try {
      const result = await placeStreamBid(sessionId, currentLot.id, amount);
      track('live_bid_placed', { stream_id: sessionId, bid_amount: amount });
      setLastBidId(result.clientBidId);
      setLastBidAmount(amount);
      if (result.success) {
        if (result.lot) {
          setCurrentLot({ ...result.lot });
        }
        setBidOutcome('accepted');
        haptic.success();
      } else {
        setBidOutcome('rejected');
        show(result.error ?? t('toast.bidFailed'), 'error');
        haptic.error();
      }
    } catch {
      setBidOutcome('unknown');
      haptic.warning();
    } finally {
      setBidPending(false);
      setBidSheetVisible(false);
    }
  }, [currentLot, haptic, sessionId, show, requireAuth, t]);

  const handleCheckBidStatus = useCallback(async () => {
    if (!currentLot || !lastBidId) return;
    setBidCheckPending(true);
    haptic.light();
    try {
      const result = await checkBidStatus(sessionId, currentLot.id, lastBidAmount, lastBidId);
      if (result.status === 'accepted') {
        if (result.lot) {
          setCurrentLot({ ...result.lot });
        }
        setBidOutcome('accepted');
        haptic.success();
      } else if (result.status === 'rejected') {
        setBidOutcome('rejected');
        show(result.error ?? t('toast.bidNotAccepted'), 'error');
        haptic.error();
      } else {
        show(t('toast.stillChecking'), 'info');
      }
    } catch {
      show(t('toast.stillChecking'), 'info');
    } finally {
      setBidCheckPending(false);
    }
  }, [currentLot, haptic, lastBidAmount, lastBidId, sessionId, show, t]);

  const handleBuyNow = useCallback(async () => {
    if (!currentLot) return;
    if (!requireAuth('purchase')) return;
    setBuyNowPending(true);
    haptic.medium();
    try {
      const result = await buyNowDuringStream(sessionId, currentLot.id);
      if (result.success) {
        show(t('toast.purchaseComplete'), 'success');
      } else {
        show(result.error ?? t('toast.couldNotPurchase'), 'error');
      }
    } catch {
      show(t('toast.couldNotPurchase'), 'error');
    } finally {
      setBuyNowPending(false);
    }
  }, [currentLot, haptic, sessionId, show, requireAuth, t]);

  const handleShare = useCallback(async () => {
    haptic.light();
    try {
      await Share.share({
        message: t('share.message', { sellerName: sellerIdentity?.name ?? t('share.defaultSeller') }) });
    } catch {
      // User cancelled the share sheet — no error toast needed.
    }
  }, [haptic, sellerIdentity?.name, t]);

  const handleFollowToggle = useCallback(() => {
    haptic.light();
    if (!requireAuth('follow_seller')) return;
    if (!stream?.sellerId) return;
    followMutation.mutate(!isFollowing, {
      onSuccess: () => {
        setIsFollowing((prev) => !prev);
        show(isFollowing ? t('toast.unfollowed') : t('toast.following'), 'success');
      },
      onError: () => {
        show(t('toast.followError'), 'error');
      } });
  }, [haptic, followMutation, isFollowing, show, stream?.sellerId, requireAuth, t]);

  const derivedLotStatus: LotStatus | null = useMemo(() => {
    if (!currentLot) return null;
    if (currentLot.status === 'upcoming') return 'scheduled';
    if (currentLot.status === 'active') {
      if (currentLot.timeRemaining != null && currentLot.timeRemaining <= 10) return 'closing';
      return 'open';
    }
    if (currentLot.status === 'sold') return 'sold';
    if (currentLot.status === 'passed') return 'passed';
    return null;
  }, [currentLot]);

  const isWinner = currentLot?.status === 'sold' && currentLot?.currentHighBidder === 'You';

  const handleCompleteCheckout = useCallback(async () => {
    if (!currentLot) return;
    if (!requireAuth('purchase')) return;
    setSettlePending(true);
    haptic.medium();
    try {
      const result = await settleLot(sessionId, currentLot.id);
      if (result.orderId) {
        haptic.success();
        navigation.navigate('Checkout', { itemId: currentLot.listingId });
      }
    } catch {
      show(t('toast.checkoutError'), 'error');
      haptic.error();
    } finally {
      setSettlePending(false);
    }
  }, [currentLot, haptic, navigation, requireAuth, sessionId, show, t]);

  const handleRetry = useCallback(() => {
    setConnectionState('connecting');
    setStream(null);
    setMessages([]);
    setStreamEndSummary(null);
    setCurrentLot(null);
    setSellerIdentity(null);
    setReconnectCount((n) => n + 1);
  }, []);

  const timeRemaining = currentLot?.timeRemaining ?? 0;
  const buyNowPrice = currentLot?.buyNowPrice ?? 0;
  const suggestedBids = useMemo(() => {
    const base = currentLot?.currentPrice ?? 0;
    return [base + 1, base + 5, base + 10, base + 20];
  }, [currentLot?.currentPrice]);

  // Video stage caption — honest about what the LiveKit room is doing.
  const hasVideoCredentials = Boolean(stream?.wsUrl && stream?.token);
  const hasRemoteVideo = liveKit.remoteParticipants.some((p) =>
    p.tracks.some((trackInfo) => trackInfo.kind === 'video'));
  const stageCaption = !hasVideoCredentials
    ? null
    : liveKit.state === 'connecting' || liveKit.state === 'reconnecting'
      ? t('video.connecting')
      : liveKit.state === 'error'
        ? 'Video unavailable'
        : liveKit.state === 'connected' && !hasRemoteVideo
          ? 'Waiting for host video…'
          : null;

  const renderChatMessage = useCallback(({ item }: { item: LiveStreamChatMessage }) => {
    if (item.type === 'system' || item.type === 'bid' || item.type === 'purchase') {
      return (
        <View style={styles.chatRow}>
          <Text style={[styles.systemMessageText, { color: colors.scrimTextSecondary }]}>
            {item.message}
          </Text>
        </View>
      );
    }
    return (
      <View style={styles.chatRow}>
        <Text style={styles.chatLine} numberOfLines={2}>
          {item.isSeller ? (
            <Text style={[styles.chatSellerMark, { color: colors.warning }]}>{t('chat.seller')} · </Text>
          ) : null}
          <Text style={[styles.chatSender, { color: colors.scrimTextSecondary }]}>
            {item.userName}
            {'  '}
          </Text>
          <Text style={[styles.chatText, { color: colors.scrimTextPrimary }]}>
            {item.message}
          </Text>
        </Text>
      </View>
    );
  }, [colors, styles, t]);

  // ── Connecting state — skeleton matching the live layout ──
  if (connectionState === 'connecting') {
    return (
      <FlagshipScreen
        header={<FlagshipHeader title={t('live.label')} onBack={() => navigation.goBack()} />}
        scrollEnabled={false}
        contentStyle={styles.stateFlush}
      >
        <FlagshipState
          variant={isOffline ? 'offline' : 'loading'}
          title={isOffline ? undefined : t('connecting.title')}
          subtitle={isOffline ? undefined : t('connecting.subtitle')}
          skeleton={isOffline ? undefined : (
            <View style={styles.connectSkeleton}>
              <SkeletonBlock width="100%" height={SCREEN_HEIGHT * 0.42} radius={Radius.none} />
              <View style={styles.connectSkeletonChat}>
                <SkeletonTextLine width="70%" height={12} />
                <SkeletonTextLine width="52%" height={12} />
                <SkeletonTextLine width="64%" height={12} />
              </View>
              <SkeletonBlock width="100%" height={56} radius={Radius.lg} />
            </View>
          )}
          actionLabel={isOffline ? t('error.reconnect') : undefined}
          onAction={isOffline ? handleRetry : undefined}
        />
      </FlagshipScreen>
    );
  }

  // ── Error state ──
  if (connectionState === 'error') {
    return (
      <FlagshipScreen
        header={<FlagshipHeader title={t('live.label')} onBack={() => navigation.goBack()} />}
        scrollEnabled={false}
        contentStyle={styles.stateFlush}
      >
        <FlagshipState
          variant={isOffline ? 'offline' : 'error'}
          title={t('error.title')}
          subtitle={t('error.subtitle')}
          actionLabel={t('error.reconnect')}
          onAction={handleRetry}
          secondaryActionLabel={t('error.goBack')}
          onSecondaryAction={() => navigation.goBack()}
        />
      </FlagshipScreen>
    );
  }

  // ── Stream ended state ──
  if (connectionState === 'ended') {
    return (
      <FlagshipScreen
        header={<FlagshipHeader title={t('ended.title')} onBack={() => navigation.goBack()} />}
        scrollEnabled={false}
        contentStyle={styles.stateFlush}
      >
        <View style={styles.endedWrap}>
          <AppIcon name="check" variant="filled" size={IconSize.display} color="success" accessible={false} />
          <Text style={[styles.endedTitle, { color: colors.textPrimary }]} accessibilityRole="header">
            {t('ended.title')}
          </Text>
          <Text style={[styles.endedSubtitle, { color: colors.textSecondary }]}>
            {t('ended.subtitle')}
          </Text>
          {streamEndSummary ? (
            <View style={styles.endedStats}>
              <FlagshipMetricLine
                label={t('ended.viewers')}
                value={String(streamEndSummary.totalViewers)}
                separated
              />
              <FlagshipMetricLine
                label={t('ended.lotsSold')}
                value={String(streamEndSummary.lotsSold)}
                separated
              />
              <FlagshipMetricLine
                label={t('ended.totalSales')}
                value={formatFromFiat(streamEndSummary.totalSales, 'GBP') ?? ''}
                separated
              />
            </View>
          ) : null}
          <AnimatedPressable
            onPress={() => navigation.goBack()}
            style={[styles.endedDoneBtn, { backgroundColor: colors.brand }]}
            hapticFeedback="light"
            accessibilityRole="button"
            accessibilityLabel={t('ended.done')}
          >
            <Text style={[styles.endedDoneText, { color: colors.textInverse }]}>{t('ended.done')}</Text>
          </AnimatedPressable>
        </View>
      </FlagshipScreen>
    );
  }

  // ── Live state — video-dominant stage with restrained chrome ──
  return (
    <View style={styles.stage}>
      <StatusBar barStyle="light-content" />

      {/* Video plane — the dominant object. LiveKit connects in the
          background; when no video can play the stage states it plainly. */}
      {stageCaption ? (
        <View style={styles.stageCenter} pointerEvents="none">
          <Text style={[styles.stageCaption, { color: colors.scrimTextSecondary }]}>
            {stageCaption}
          </Text>
        </View>
      ) : null}

      {/* ── Top chrome: leave + seller identity (left), live badge + viewer
          count + share (right) ── */}
      <View style={[styles.topOverlay, { paddingTop: insets.top + Space.xs }]}>
        <View style={styles.topLeftCluster}>
          <AnimatedPressable
            onPress={() => navigation.goBack()}
            style={styles.iconHit}
            hapticFeedback="light"
            accessibilityRole="button"
            accessibilityLabel="Leave stream"
          >
            <AppIcon name="back" size={IconSize.lg} color="scrimTextPrimary" accessible={false} />
          </AnimatedPressable>
          {sellerIdentity ? (
            <View style={styles.sellerIdentity}>
              {sellerIdentity.avatar ? (
                <CachedImage
                  uri={sellerIdentity.avatar}
                  style={styles.sellerAvatar}
                  contentFit="cover"
                  accessible={false}
                />
              ) : null}
              <View style={styles.sellerNameRow}>
                <Text style={[styles.sellerName, { color: colors.scrimTextPrimary }]} numberOfLines={1}>
                  {sellerIdentity.name}
                </Text>
                {sellerIdentity.verified ? (
                  <AppIcon name="verified" size={IconSize.micro} color="scrimTextPrimary" accessible={false} />
                ) : null}
              </View>
              {stream?.sellerId ? (
                <AnimatedPressable
                  onPress={handleFollowToggle}
                  disabled={followMutation.isPending}
                  style={styles.followHit}
                  hapticFeedback="light"
                  accessibilityRole="button"
                  accessibilityLabel={isFollowing ? 'Unfollow seller' : 'Follow seller'}
                  accessibilityState={{ busy: followMutation.isPending }}
                >
                  {followMutation.isPending ? (
                    <ActivityIndicator size="small" color={colors.scrimTextPrimary} />
                  ) : (
                    <Text style={[styles.followText, { color: colors.scrimTextPrimary }]}>
                      {isFollowing ? t('seller.following') : t('seller.follow')}
                    </Text>
                  )}
                </AnimatedPressable>
              ) : null}
            </View>
          ) : null}
        </View>

        <View style={styles.topRightCluster}>
          <LiveBadge compact label={t('live.label')} />
          {viewerCount > 0 ? (
            <View style={styles.viewerMeta} accessible={false}>
              <AppIcon name="eye" size={IconSize.xs} color="scrimTextPrimary" accessible={false} />
              <Text style={[styles.viewerText, { color: colors.scrimTextPrimary }]}>
                {viewerCount >= 1000 ? `${(viewerCount / 1000).toFixed(1)}K` : viewerCount}
              </Text>
            </View>
          ) : null}
          <AnimatedPressable
            onPress={handleShare}
            style={styles.iconHit}
            hapticFeedback="light"
            accessibilityRole="button"
            accessibilityLabel="Share stream"
          >
            <AppIcon name="share" size={IconSize.md} color="scrimTextPrimary" accessible={false} />
          </AnimatedPressable>
        </View>
      </View>

      {/* ── Bottom chrome: chat list, lot dock, composer ── */}
      <KeyboardAvoidingView
        style={styles.bottomOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {/* Chat — flat rows with hairlines over the stage */}
        <FlatList
          ref={chatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderChatMessage}
          style={styles.chatList}
          contentContainerStyle={styles.chatListContent}
          onContentSizeChange={() => chatListRef.current?.scrollToEnd({ animated: !reducedMotion })}
          showsVerticalScrollIndicator={false}
        />

        {/* Lot status + winner checkout */}
        {currentLot && derivedLotStatus ? (
          <View style={styles.lotStatusRow}>
            <Text style={[styles.lotStatusText, { color: lotStatusColor(derivedLotStatus, colors) }]}>
              {lotStatusLabel(derivedLotStatus, currentLot.currentPrice, t)}
            </Text>
            {isWinner ? (
              <AnimatedPressable
                onPress={handleCompleteCheckout}
                disabled={settlePending}
                style={[styles.checkoutBtn, { backgroundColor: colors.success }]}
                hapticFeedback="medium"
                accessibilityRole="button"
                accessibilityLabel="Complete checkout for won lot"
                accessibilityState={{ busy: settlePending }}
              >
                {settlePending ? (
                  <ActivityIndicator size="small" color={colors.textInverse} />
                ) : (
                  <Text style={[styles.checkoutBtnText, { color: colors.textInverse }]}>
                    {t('bid.completeCheckout')}
                  </Text>
                )}
              </AnimatedPressable>
            ) : null}
          </View>
        ) : null}

        {/* Lot dock — the single contained panel on this surface */}
        {currentLot ? (
          <View style={[styles.lotDock, { backgroundColor: colors.overlay, borderColor: colors.scrimTextTertiary }]}>
            <AnimatedPressable
              onPress={() => setItemSheetVisible(true)}
              style={styles.lotDockPress}
              hapticFeedback="light"
              accessibilityRole="button"
              accessibilityLabel={`View ${currentLot.title} details`}
            >
              {currentLot.imageUri ? (
                <CachedImage
                  uri={currentLot.imageUri}
                  style={styles.lotThumb}
                  contentFit="cover"
                  accessible={false}
                />
              ) : null}
              <View style={styles.lotInfo}>
                {currentLot.title ? (
                  <Text style={[styles.lotTitle, { color: colors.scrimTextPrimary }]} numberOfLines={1}>
                    {currentLot.title}
                  </Text>
                ) : null}
                <View style={styles.lotPriceRow}>
                  <Text style={[styles.lotPrice, { color: colors.scrimTextPrimary }]}>
                    {formatFromFiat(currentLot.currentPrice, 'GBP')}
                  </Text>
                  {currentLot.bidCount > 0 ? (
                    <Text style={[styles.lotMeta, { color: colors.scrimTextSecondary }]}>
                      {currentLot.bidCount} {t('product.bids')}
                    </Text>
                  ) : null}
                  {timeRemaining > 0 ? (
                    <Text
                      style={[
                        styles.lotTimer,
                        { color: timeRemaining <= 10 ? colors.scrimDeltaNegative : colors.scrimTextSecondary },
                      ]}
                    >
                      {formatClock(timeRemaining)}
                    </Text>
                  ) : null}
                </View>
              </View>
            </AnimatedPressable>
            <View style={styles.lotActions}>
              <AnimatedPressable
                onPress={() => setBidSheetVisible(true)}
                disabled={bidPending}
                style={[styles.bidBtn, { backgroundColor: colors.danger }]}
                hapticFeedback="medium"
                accessibilityRole="button"
                accessibilityLabel={t('bid.placeBid')}
                accessibilityState={{ busy: bidPending }}
              >
                {bidPending ? (
                  <ActivityIndicator size="small" color={colors.scrimTextPrimary} />
                ) : (
                  <Text style={[styles.bidBtnText, { color: colors.scrimTextPrimary }]}>
                    {t('bid.placeBid')}
                  </Text>
                )}
              </AnimatedPressable>
              {buyNowPrice > 0 ? (
                <AnimatedPressable
                  onPress={handleBuyNow}
                  disabled={buyNowPending}
                  style={[styles.buyNowBtn, { borderColor: colors.scrimTextTertiary }]}
                  hapticFeedback="medium"
                  accessibilityRole="button"
                  accessibilityLabel={`Buy now for ${currencySymbol}${buyNowPrice}`}
                  accessibilityState={{ busy: buyNowPending }}
                >
                  {buyNowPending ? (
                    <ActivityIndicator size="small" color={colors.scrimTextPrimary} />
                  ) : (
                    <Text style={[styles.buyNowBtnText, { color: colors.scrimTextPrimary }]}>
                      {t('bid.buyNow')} {currencySymbol}{buyNowPrice}
                    </Text>
                  )}
                </AnimatedPressable>
              ) : null}
            </View>
          </View>
        ) : null}

        {/* Composer */}
        <View style={[styles.composerRow, { paddingBottom: insets.bottom || Space.sm }]}>
          <TextInput
            style={[styles.composerInput, { color: colors.scrimTextPrimary, borderColor: colors.scrimTextTertiary }]}
            placeholder={t('chat.placeholder')}
            placeholderTextColor={colors.scrimTextTertiary}
            value={chatInput}
            onChangeText={setChatInput}
            onSubmitEditing={handleSendChat}
            returnKeyType="send"
            accessibilityLabel="Chat message input"
          />
          <AnimatedPressable
            onPress={handleSendChat}
            disabled={!chatInput.trim()}
            style={[styles.iconHit, !chatInput.trim() && { opacity: 0.4 }]}
            hapticFeedback="light"
            accessibilityRole="button"
            accessibilityLabel="Send message"
          >
            <AppIcon name="send" size={IconSize.md} color="scrimTextPrimary" accessible={false} />
          </AnimatedPressable>
        </View>
      </KeyboardAvoidingView>

      {/* ── Unknown bid outcome — the bid may have committed; offer a real
          idempotent re-check, never fabricate confirmation ── */}
      {bidOutcome === 'unknown' ? (
        <View
          style={[styles.unknownBanner, { backgroundColor: colors.surface, borderColor: colors.warningBorder, top: insets.top + Space.lg }]}
          pointerEvents="box-none"
        >
          <View style={styles.unknownBannerContent}>
            <AppIcon name="warning" size={IconSize.md} color="warning" accessible={false} />
            <View style={styles.unknownBannerText}>
              <Text style={[styles.unknownBannerTitle, { color: colors.textPrimary }]}>
                {t('unknown.title')}
              </Text>
              <Text style={[styles.unknownBannerSubtitle, { color: colors.textSecondary }]}>
                {t('unknown.subtitle')}
              </Text>
            </View>
          </View>
          <View style={styles.unknownBannerActions}>
            <AnimatedPressable
              onPress={handleCheckBidStatus}
              disabled={bidCheckPending}
              style={[styles.unknownCheckBtn, { backgroundColor: colors.warning }]}
              hapticFeedback="medium"
              accessibilityRole="button"
              accessibilityLabel="Check bid status"
              accessibilityState={{ busy: bidCheckPending }}
            >
              {bidCheckPending ? (
                <ActivityIndicator size="small" color={colors.textInverse} />
              ) : (
                <Text style={[styles.unknownCheckBtnText, { color: colors.textInverse }]}>
                  {t('unknown.checkResult')}
                </Text>
              )}
            </AnimatedPressable>
            <AnimatedPressable
              onPress={() => { setBidOutcome('idle'); setLastBidId(null); }}
              style={styles.unknownDismissBtn}
              hapticFeedback="light"
              accessibilityRole="button"
              accessibilityLabel="Dismiss unknown bid status"
            >
              <Text style={[styles.unknownDismissBtnText, { color: colors.textSecondary }]}>
                {t('unknown.dismiss')}
              </Text>
            </AnimatedPressable>
          </View>
        </View>
      ) : null}

      {/* ── Item detail sheet ── */}
      {itemSheetVisible && currentLot ? (
        <AnimatedPressable
          style={[styles.sheetOverlay, { backgroundColor: colors.overlay }]}
          onPress={() => setItemSheetVisible(false)}
          accessibilityRole="button"
          accessibilityLabel="Close item details"
        >
          <AnimatedPressable
            style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => {}}
            accessibilityRole="button"
            accessibilityLabel="Item details"
          >
            <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
            {currentLot.imageUri ? (
              <CachedImage
                uri={currentLot.imageUri}
                style={styles.sheetImage}
                contentFit="cover"
                accessible={false}
              />
            ) : null}
            {currentLot.title ? (
              <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>{currentLot.title}</Text>
            ) : null}
            <View style={styles.sheetPriceRow}>
              <View>
                <Text style={[styles.sheetFieldLabel, { color: colors.textSecondary }]}>
                  {t('bidSheet.currentBid')}
                </Text>
                <Text style={[styles.sheetPrice, { color: colors.textPrimary }]}>
                  {formatFromFiat(currentLot.currentPrice, 'GBP')}
                </Text>
              </View>
              {currentLot.bidCount > 0 ? (
                <View style={styles.sheetBidCount}>
                  <AppIcon name="auction" size={IconSize.xs} color="textSecondary" accessible={false} />
                  <Text style={[styles.sheetBidCountText, { color: colors.textSecondary }]}>
                    {currentLot.bidCount} {t('product.bids')}
                  </Text>
                </View>
              ) : null}
            </View>
            {timeRemaining > 0 ? (
              <View style={styles.sheetTimeRow}>
                <AppIcon
                  name="clock"
                  size={IconSize.xs}
                  color={timeRemaining <= 10 ? 'danger' : 'textSecondary'}
                  accessible={false}
                />
                <Text
                  style={[
                    styles.sheetTimeText,
                    { color: timeRemaining <= 10 ? colors.danger : colors.textSecondary },
                  ]}
                >
                  {formatClock(timeRemaining)}
                </Text>
              </View>
            ) : null}
            <View style={styles.sheetActions}>
              <AnimatedPressable
                onPress={() => { setItemSheetVisible(false); setBidSheetVisible(true); }}
                style={[styles.sheetPrimaryBtn, { backgroundColor: colors.danger }]}
                hapticFeedback="medium"
                accessibilityRole="button"
                accessibilityLabel={t('bid.placeBid')}
              >
                <Text style={[styles.sheetPrimaryBtnText, { color: colors.scrimTextPrimary }]}>
                  {t('bid.placeBid')}
                </Text>
              </AnimatedPressable>
              {buyNowPrice > 0 ? (
                <AnimatedPressable
                  onPress={() => { setItemSheetVisible(false); handleBuyNow(); }}
                  disabled={buyNowPending}
                  style={[styles.sheetSecondaryBtn, { borderColor: colors.border }]}
                  hapticFeedback="medium"
                  accessibilityRole="button"
                  accessibilityLabel={`Buy now for ${currencySymbol}${buyNowPrice}`}
                  accessibilityState={{ busy: buyNowPending }}
                >
                  {buyNowPending ? (
                    <ActivityIndicator size="small" color={colors.textPrimary} />
                  ) : (
                    <Text style={[styles.sheetSecondaryBtnText, { color: colors.textPrimary }]}>
                      {t('bid.buyNowFull')} {currencySymbol}{buyNowPrice}
                    </Text>
                  )}
                </AnimatedPressable>
              ) : null}
            </View>
            <AnimatedPressable
              onPress={() => setItemSheetVisible(false)}
              style={styles.sheetCloseBtn}
              hapticFeedback="light"
              accessibilityRole="button"
              accessibilityLabel="Close item details"
            >
              <Text style={[styles.sheetCloseText, { color: colors.textSecondary }]}>{t('bidSheet.close')}</Text>
            </AnimatedPressable>
          </AnimatedPressable>
        </AnimatedPressable>
      ) : null}

      {/* ── Bid sheet ── */}
      {bidSheetVisible && currentLot ? (
        <AnimatedPressable
          style={[styles.sheetOverlay, { backgroundColor: colors.overlay }]}
          onPress={() => setBidSheetVisible(false)}
          accessibilityRole="button"
          accessibilityLabel="Close bid sheet"
        >
          <AnimatedPressable
            style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => {}}
            accessibilityRole="button"
            accessibilityLabel="Place a bid"
          >
            <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>{t('bidSheet.title')}</Text>
            <Text style={[styles.sheetFieldLabel, { color: colors.textSecondary, textAlign: 'center' }]}>
              {t('bidSheet.currentBid')}
            </Text>
            <Text style={[styles.sheetPrice, { color: colors.textPrimary, textAlign: 'center' }]}>
              {formatFromFiat(currentLot.currentPrice, 'GBP')}
            </Text>
            <View style={styles.quickBidRow}>
              {suggestedBids.map((amount) => (
                <AnimatedPressable
                  key={amount}
                  onPress={() => handleBid(amount)}
                  disabled={bidPending}
                  style={[styles.quickBidBtn, { borderColor: colors.border }]}
                  hapticFeedback="medium"
                  accessibilityRole="button"
                  accessibilityLabel={`Bid ${currencySymbol}${amount}`}
                  accessibilityState={{ busy: bidPending }}
                >
                  <Text style={[styles.quickBidText, { color: colors.textPrimary }]}>
                    {formatFromFiat(amount, 'GBP')}
                  </Text>
                </AnimatedPressable>
              ))}
            </View>
            <AnimatedPressable
              onPress={() => setBidSheetVisible(false)}
              style={styles.sheetCloseBtn}
              hapticFeedback="light"
              accessibilityRole="button"
              accessibilityLabel={t('bidSheet.cancel')}
            >
              <Text style={[styles.sheetCloseText, { color: colors.textSecondary }]}>{t('bidSheet.cancel')}</Text>
            </AnimatedPressable>
          </AnimatedPressable>
        </AnimatedPressable>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const createStyles = (colors: ThemeColors, screenHeight: number) => StyleSheet.create({
  // ── Video stage — theme-independent dark media canvas ──
  stage: {
    flex: 1,
    backgroundColor: EditorCanvas },
  stageCenter: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center' },
  stageCaption: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily },
  // ── Top overlay ──
  topOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: Space.sm,
    zIndex: 10 },
  topLeftCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    flexShrink: 1 },
  iconHit: {
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center' },
  sellerIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    flexShrink: 1 },
  sellerAvatar: {
    width: Space.lg + Space.xs,
    height: Space.lg + Space.xs,
    borderRadius: Radius.full },
  sellerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs / 2,
    flexShrink: 1 },
  sellerName: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    flexShrink: 1 },
  followHit: {
    minHeight: Control.hit,
    justifyContent: 'center',
    paddingHorizontal: Space.xs },
  followText: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily },
  topRightCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs },
  viewerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs / 2 },
  viewerText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    fontVariant: ['tabular-nums'] },
  // ── Bottom overlay ──
  bottomOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10 },
  // ── Chat — flat rows separated by hairlines ──
  chatList: {
    maxHeight: screenHeight * 0.28 },
  chatListContent: {
    paddingHorizontal: Space.md },
  chatRow: {
    paddingVertical: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.14)' },
  chatLine: {
    flexShrink: 1 },
  chatSender: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },
  chatText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    lineHeight: TypographyV2.body.lineHeight },
  chatSellerMark: {
    fontSize: TypographyV2.label.size,
    fontFamily: TypographyV2.label.fontFamily,
    letterSpacing: TypographyV2.label.letterSpacing },
  systemMessageText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    fontStyle: 'italic' },
  // ── Lot status line ──
  lotStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs },
  lotStatusText: {
    fontSize: TypographyV2.label.size,
    fontFamily: TypographyV2.label.fontFamily,
    letterSpacing: TypographyV2.label.letterSpacing },
  checkoutBtn: {
    paddingHorizontal: Space.md,
    minHeight: Control.chrome,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center' },
  checkoutBtnText: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily },
  // ── Lot dock — the one contained panel on this surface ──
  lotDock: {
    marginHorizontal: Space.md,
    marginBottom: Space.xs,
    padding: Space.sm,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: Space.sm },
  lotDockPress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    minHeight: Control.hit },
  lotThumb: {
    width: Space.xxl,
    height: Space.xxl,
    borderRadius: Radius.md },
  lotInfo: {
    flex: 1,
    gap: Space.xs / 2 },
  lotTitle: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily },
  lotPriceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Space.sm },
  lotPrice: {
    fontSize: TypographyV2.priceList.size,
    lineHeight: TypographyV2.priceList.lineHeight,
    fontFamily: TypographyV2.priceList.fontFamily,
    fontVariant: ['tabular-nums'] },
  lotMeta: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    fontVariant: ['tabular-nums'] },
  lotTimer: {
    fontSize: TypographyV2.numericMeta.size,
    fontFamily: TypographyV2.numericMeta.fontFamily,
    fontVariant: ['tabular-nums'],
    marginLeft: 'auto' },
  lotActions: {
    flexDirection: 'row',
    gap: Space.sm },
  bidBtn: {
    flex: 1,
    minHeight: Control.hit,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center' },
  bidBtnText: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily },
  buyNowBtn: {
    flex: 1,
    minHeight: Control.hit,
    borderRadius: Radius.md,
    borderWidth: Stroke.standard,
    alignItems: 'center',
    justifyContent: 'center' },
  buyNowBtnText: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    fontVariant: ['tabular-nums'] },
  // ── Composer ──
  composerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.md,
    paddingTop: Space.xs },
  composerInput: {
    flex: 1,
    minHeight: Control.hit,
    paddingHorizontal: Space.sm,
    borderBottomWidth: Stroke.standard,
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily },
  // ── Non-live states ──
  stateFlush: {
    paddingHorizontal: 0,
    paddingTop: 0,
    justifyContent: 'center' },
  connectSkeleton: {
    flex: 1,
    gap: Space.md },
  connectSkeletonChat: {
    paddingHorizontal: Space.md,
    gap: Space.sm },
  endedWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.xl,
    gap: Space.md },
  endedTitle: {
    fontSize: TypographyV2.sectionTitle.size,
    fontFamily: TypographyV2.sectionTitle.fontFamily,
    letterSpacing: TypographyV2.sectionTitle.letterSpacing },
  endedSubtitle: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily },
  endedStats: {
    width: '100%',
    marginTop: Space.sm },
  endedDoneBtn: {
    width: '100%',
    minHeight: Control.hit,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Space.sm },
  endedDoneText: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily },
  // ── Sheets ──
  sheetOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    top: 0,
    justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: Radius.sheet,
    borderTopRightRadius: Radius.sheet,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Space.lg,
    paddingTop: Space.sm,
    paddingBottom: Space.xl,
    gap: Space.sm },
  sheetHandle: {
    width: Space.xxl,
    height: Space.xs / 2 + 1,
    borderRadius: Radius.full,
    alignSelf: 'center' },
  sheetImage: {
    width: '100%',
    height: Space.xxl * 3,
    borderRadius: Radius.lg },
  sheetTitle: {
    fontSize: TypographyV2.sectionTitle.size,
    lineHeight: TypographyV2.sectionTitle.lineHeight,
    fontFamily: TypographyV2.sectionTitle.fontFamily,
    letterSpacing: TypographyV2.sectionTitle.letterSpacing,
    textAlign: 'center' },
  sheetPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between' },
  sheetBidCount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs / 2 },
  sheetBidCountText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    fontVariant: ['tabular-nums'] },
  sheetTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs / 2 },
  sheetTimeText: {
    fontSize: TypographyV2.numericMeta.size,
    fontFamily: TypographyV2.numericMeta.fontFamily,
    fontVariant: ['tabular-nums'] },
  sheetActions: {
    flexDirection: 'row',
    gap: Space.sm },
  sheetFieldLabel: {
    fontSize: TypographyV2.label.size,
    lineHeight: TypographyV2.label.lineHeight,
    fontFamily: TypographyV2.label.fontFamily,
    letterSpacing: TypographyV2.label.letterSpacing },
  sheetPrice: {
    fontSize: TypographyV2.priceHero.size,
    lineHeight: TypographyV2.priceHero.lineHeight,
    fontFamily: TypographyV2.priceHero.fontFamily,
    letterSpacing: TypographyV2.priceHero.letterSpacing,
    fontVariant: ['tabular-nums'] },
  sheetPrimaryBtn: {
    flex: 1,
    minHeight: Control.hit,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center' },
  sheetPrimaryBtnText: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily },
  sheetSecondaryBtn: {
    flex: 1,
    minHeight: Control.hit,
    borderRadius: Radius.lg,
    borderWidth: Stroke.standard,
    alignItems: 'center',
    justifyContent: 'center' },
  sheetSecondaryBtnText: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    fontVariant: ['tabular-nums'] },
  sheetCloseBtn: {
    minHeight: Control.hit,
    alignItems: 'center',
    justifyContent: 'center' },
  sheetCloseText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily },
  quickBidRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm,
    justifyContent: 'center' },
  quickBidBtn: {
    paddingHorizontal: Space.lg,
    minHeight: Control.hit,
    borderRadius: Radius.md,
    borderWidth: Stroke.standard,
    minWidth: Space.xxl * 2,
    alignItems: 'center',
    justifyContent: 'center' },
  quickBidText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    fontVariant: ['tabular-nums'] },
  // ── Unknown-outcome banner ──
  unknownBanner: {
    position: 'absolute',
    left: Space.md,
    right: Space.md,
    borderRadius: Radius.lg,
    borderWidth: Stroke.standard,
    padding: Space.md,
    gap: Space.sm,
    zIndex: 20 },
  unknownBannerContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.sm },
  unknownBannerText: {
    flex: 1,
    gap: Space.xs / 2 },
  unknownBannerTitle: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: TypographyV2.bodyStrong.fontFamily },
  unknownBannerSubtitle: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily },
  unknownBannerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingLeft: Space.xl },
  unknownCheckBtn: {
    minHeight: Control.hit,
    paddingHorizontal: Space.lg,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center' },
  unknownCheckBtnText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily },
  unknownDismissBtn: {
    minHeight: Control.hit,
    paddingHorizontal: Space.md,
    justifyContent: 'center' },
  unknownDismissBtnText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily } });
