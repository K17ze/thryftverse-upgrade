/**
 * LiveStreamViewerScreen — immersive full-screen live shopping viewer
 *
 * Architecture (2026 August research — TikTok/Whatnot pattern):
 * - Full-screen video plane (dominant, fills the viewport)
 * - Semi-transparent chat overlay (bottom-left, ambient)
 * - Product showcase panel (bottom, floating above chat)
 * - Top-left: leave button; top-right: like/share/close
 * - Viewer count + live badge overlaid on video
 *
 * Per AGENTS.md §11 (Truthful UI):
 * - Demo mode is clearly labeled — we never fabricate that a stream is live
 * - Viewer counts, chat, and bids come from the real-time service layer
 *   (connectToStream + subscribeTo*). No fabricated viewer-count drift, no
 *   fabricated chat messages, no fabricated "someone just bought" toasts.
 *
 * Per AGENTS.md §4 (Push to maximum quality):
 * - Full-screen immersive experience — video dominates
 * - Overlays are semi-transparent, never blocking the stream
 * - Product panel is actionable but compact
 * - Chat is ambient, bottom-left, auto-scrolling
 *
 * Per AGENTS.md §14 (State coverage):
 * - Connecting, live, error (reconnect), stream ended, offline states
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  FlatList,
  Image,
  Dimensions,
  StatusBar,
  Platform,
  KeyboardAvoidingView,
  Share,
  ActivityIndicator } from 'react-native';
import Reanimated, {
  FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { RootStackParamList, NativeStackNavigationProp } from '../navigation/types';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { useHaptic } from '../hooks/useHaptic';
import { useSignupWall } from '../hooks/useSignupWall';
import { useToast } from '../context/ToastContext';
import { useFollowMutation } from '../platform/server';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { Space, Radius, Control, Stroke } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import {
  LiveStream,
  LiveLot,
  LiveStreamChatMessage,
  StreamEndEventPayload,
  LIVE_SHOPPING_DEMO_MODE,
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
  likeStream,
  fetchStreamChatHistory,
  settleLot,
  type LotStatus } from '../services/liveShoppingApi';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type LiveStreamViewerRoute = RouteProp<RootStackParamList, 'LiveStreamViewer'>;

type ConnectionState = 'connecting' | 'live' | 'error' | 'ended' | 'offline';

type BidOutcome = 'idle' | 'submitting' | 'accepted' | 'rejected' | 'unknown';

function lotStatusLabel(status: LotStatus, currentPrice: number): string {
  switch (status) {
    case 'scheduled':
      return 'Coming up';
    case 'open':
      return 'Open for bidding';
    case 'closing':
      return 'Closing soon!';
    case 'sold':
      return `Sold for \u00A3${currentPrice}`;
    case 'passed':
      return 'Passed (reserve not met)';
    case 'cancelled':
      return 'Cancelled';
  }
}

function lotStatusBgColor(status: LotStatus, colors: ThemeColors): string {
  switch (status) {
    case 'scheduled':
      return colors.overlay;
    case 'open':
      return colors.success;
    case 'closing':
      return colors.warning;
    case 'sold':
      return colors.success;
    case 'passed':
    case 'cancelled':
      return colors.overlay;
  }
}

function lotStatusTextColor(status: LotStatus, colors: ThemeColors): string {
  switch (status) {
    case 'scheduled':
      return colors.scrimTextPrimary;
    case 'open':
    case 'sold':
      return colors.textInverse;
    case 'closing':
      return colors.textInverse;
    case 'passed':
    case 'cancelled':
      return colors.scrimTextSecondary;
  }
}

export function LiveStreamViewerScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<LiveStreamViewerRoute>();
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const insets = useSafeAreaInsets();
  const { show } = useToast();
  const { requireAuth } = useSignupWall();
  const reducedMotion = useReducedMotion();
  const { formatFromFiat, currencyCode, currencySymbol } = useFormattedPrice();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const sessionId = route.params.sessionId;

  // ── Real-time state ──
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const [stream, setStream] = useState<LiveStream | null>(null);
  const [messages, setMessages] = useState<LiveStreamChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [bidSheetVisible, setBidSheetVisible] = useState(false);
  const [itemSheetVisible, setItemSheetVisible] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  const [likeCount, setLikeCount] = useState(0);
  const [hasLiked, setHasLiked] = useState(false);
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
  const isDemo = stream?.isDemo ?? LIVE_SHOPPING_DEMO_MODE;

  // Follow / unfollow — wired to the real profile social API. In demo mode the
  // session may carry a placeholder sellerId, so we truthfully surface that the
  // action is unavailable rather than firing a request against a non-existent user.
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
        setLikeCount(connected.likeCount);
        setIsFollowing(false);
        const lot = connected.lots[connected.currentLotIndex] ?? null;
        setCurrentLot(lot);
        setConnectionState('live');

        // Load chat history
        const history = await fetchStreamChatHistory(sessionId);
        if (cancelled) return;
        setMessages(history);

        // Subscribe to real-time chat
        unsubChat = subscribeToChat(sessionId, (payload) => {
          setMessages((prev) => [...prev.slice(-80), payload.message]);
        });

        // Subscribe to viewer count (real backend events — no fabrication)
        unsubViewer = subscribeToViewerCount(sessionId, (payload) => {
          setViewerCount(payload.count);
        });

        // Subscribe to bid updates
        unsubBids = subscribeToBids(sessionId, (payload) => {
          setCurrentLot((prev) => {
            if (!prev || prev.id !== payload.lotId) return prev;
            return {
              ...prev,
              currentPrice: payload.newCurrentPrice,
              bidCount: payload.newBidCount };
          });
        });

        // Subscribe to lot changes
        unsubLotChanges = subscribeToLotChanges(sessionId, (payload) => {
          setCurrentLot({ ...payload.lot });
          setStream((prev) => prev ? { ...prev, currentLotIndex: payload.newLotIndex } : prev);
        });

        // Subscribe to stream end and lot_sold/purchase events
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
  }, [sessionId]);

  const handleSendChat = useCallback(async () => {
    if (!chatInput.trim()) return;
    if (!requireAuth('message_seller')) return;
    const text = chatInput.trim();
    setChatInput('');
    haptic.light();
    try {
      await sendStreamChatMessage(sessionId, text);
    } catch {
      show('Could not send message', 'error');
    }
  }, [chatInput, haptic, sessionId, show]);

  const handleBid = useCallback(async (amount: number) => {
    if (!currentLot) return;
    if (!requireAuth('place_bid')) return;
    setBidPending(true);
    setBidOutcome('submitting');
    haptic.medium();
    try {
      const result = await placeStreamBid(sessionId, currentLot.id, amount);
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
        show(result.error ?? 'Bid failed', 'error');
        haptic.error();
      }
    } catch {
      setBidOutcome('unknown');
      haptic.warning();
    } finally {
      setBidPending(false);
      setBidSheetVisible(false);
    }
  }, [currentLot, haptic, sessionId, show]);

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
        show(result.error ?? 'Bid was not accepted', 'error');
        haptic.error();
      } else {
        show('Still checking — your bid may have been placed', 'info');
      }
    } catch {
      show('Still checking — your bid may have been placed', 'info');
    } finally {
      setBidCheckPending(false);
    }
  }, [currentLot, haptic, lastBidAmount, lastBidId, sessionId, show]);

  const handleLike = useCallback(async () => {
    if (hasLiked) {
      haptic.light();
      return;
    }
    setHasLiked(true);
    setLikeCount((c) => c + 1);
    haptic.light();
    try {
      const result = await likeStream(sessionId);
      if (result.success) {
        setLikeCount(result.totalLikes);
      }
    } catch {
      // Revert on failure
      setHasLiked(false);
      setLikeCount((c) => Math.max(0, c - 1));
    }
  }, [hasLiked, haptic, sessionId]);

  const handleBuyNow = useCallback(async () => {
    if (!currentLot) return;
    if (!requireAuth('purchase')) return;
    setBuyNowPending(true);
    haptic.medium();
    try {
      const result = await buyNowDuringStream(sessionId, currentLot.id);
      if (result.success) {
        show('Purchase complete — check your inbox', 'success');
      } else {
        show(result.error ?? 'Could not complete purchase', 'error');
      }
    } catch {
      show('Could not complete purchase', 'error');
    } finally {
      setBuyNowPending(false);
    }
  }, [currentLot, haptic, sessionId, show]);

  const handleShare = useCallback(async () => {
    haptic.light();
    try {
      await Share.share({
        message: `Watch ${stream?.sellerName ?? 'this seller'}'s live stream on ThryftVerse` });
    } catch {
      // User cancelled the share sheet — no error toast needed.
    }
  }, [haptic, stream?.sellerName]);

  const handleFollowToggle = useCallback(() => {
    haptic.light();
    if (!requireAuth('follow_seller')) return;
    if (isDemo) {
      // Demo session may use a placeholder sellerId, not a real user record.
      // Following would call the API against a non-existent user; be truthful.
      show('Follow unavailable in demo mode', 'info');
      return;
    }
    if (!stream?.sellerId) {
      show('Follow unavailable', 'info');
      return;
    }
    followMutation.mutate(!isFollowing, {
      onSuccess: () => {
        setIsFollowing((prev) => !prev);
        show(isFollowing ? 'Unfollowed' : 'Following', 'success');
      },
      onError: () => {
        show('Could not update follow status', 'error');
      } });
  }, [haptic, isDemo, followMutation, isFollowing, show, stream?.sellerId]);

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
      show('Could not start checkout. Please try again.', 'error');
      haptic.error();
    } finally {
      setSettlePending(false);
    }
  }, [currentLot, haptic, navigation, requireAuth, sessionId, show]);

  const handleRetry = useCallback(() => {
    setConnectionState('connecting');
    setStream(null);
    setMessages([]);
    setStreamEndSummary(null);
    // Re-trigger the connect effect by forcing a re-render.
    // The effect depends on sessionId which doesn't change, so we use a
    // manual reconnect by calling the connect logic directly.
    (async () => {
      try {
        const connected = await connectToStream(sessionId);
        if (!connected) {
          setConnectionState('error');
          return;
        }
        setStream(connected);
        setViewerCount(connected.viewerCount);
        setLikeCount(connected.likeCount);
        const lot = connected.lots[connected.currentLotIndex] ?? null;
        setCurrentLot(lot);
        setConnectionState('live');
        const history = await fetchStreamChatHistory(sessionId);
        setMessages(history);
      } catch {
        setConnectionState('error');
      }
    })();
  }, [sessionId]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const minNextBid = (currentLot?.currentPrice ?? 0) + 5;
  const buyNowPrice = currentLot?.buyNowPrice ?? 0;
  const timeRemaining = currentLot?.timeRemaining ?? 0;

  const renderChatMessage = useCallback(({ item }: { item: LiveStreamChatMessage }) => {
    if (item.type === 'system' || item.type === 'bid' || item.type === 'purchase') {
      return (
        <View style={styles.systemMessage}>
          <Text style={[styles.systemMessageText, { color: colors.textSecondary }]}>
            {item.message}
          </Text>
        </View>
      );
    }
    return (
      <View style={styles.chatMessage}>
        {item.isSeller && (
          <View style={[styles.sellerBadge, { backgroundColor: colors.brand }]}>
            <Text style={styles.sellerBadgeText}>SELLER</Text>
          </View>
        )}
        <Text style={[styles.chatSender, { color: item.isSeller ? colors.brand : colors.textPrimary }]}>
          {item.userName}
        </Text>
        <Text style={[styles.chatText, { color: colors.textPrimary }]}>
          {item.message}
        </Text>
      </View>
    );
  }, [colors, styles]);

  // ── Connecting state ──
  if (connectionState === 'connecting') {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar barStyle="light-content" />
        <View style={styles.stateContainer}>
          <ActivityIndicator size="large" color={colors.brand} />
          <Text style={[styles.stateTitle, { color: colors.textPrimary }]}>Connecting to stream</Text>
          <Text style={[styles.stateSubtitle, { color: colors.textSecondary }]}>Setting up real-time connection</Text>
        </View>
      </View>
    );
  }

  // ── Error state ──
  if (connectionState === 'error') {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar barStyle="light-content" />
        <View style={styles.stateContainer}>
          <Ionicons name="cloud-offline-outline" size={48} color={colors.textMuted} />
          <Text style={[styles.stateTitle, { color: colors.textPrimary }]}>Couldn't connect to stream</Text>
          <Text style={[styles.stateSubtitle, { color: colors.textSecondary }]}>The stream may have ended or your connection dropped.</Text>
          <Pressable
            onPress={handleRetry}
            style={({ pressed }) => [styles.retryBtn, { backgroundColor: colors.danger }, pressed && { opacity: 0.85 }]}
            accessibilityRole="button"
            accessibilityLabel="Reconnect to stream"
          >
            <Text style={styles.retryBtnText}>Reconnect</Text>
          </Pressable>
          <Pressable
            onPress={() => navigation.goBack()}
            style={({ pressed }) => [styles.secondaryBtn, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Text style={[styles.secondaryBtnText, { color: colors.textSecondary }]}>Go back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ── Stream ended state ──
  if (connectionState === 'ended') {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar barStyle="light-content" />
        <View style={styles.stateContainer}>
          <View style={[styles.endedIcon, { backgroundColor: colors.successSubtle }]}>
            <Ionicons name="checkmark-done-circle" size={48} color={colors.success} />
          </View>
          <Text style={[styles.stateTitle, { color: colors.textPrimary }]}>Stream Ended</Text>
          <Text style={[styles.stateSubtitle, { color: colors.textSecondary }]}>Thanks for watching</Text>
          {streamEndSummary && (
            <View style={[styles.endedStats, { backgroundColor: colors.surface }]}>
              <View style={styles.endedStatItem}>
                <Text style={[styles.endedStatValue, { color: colors.textPrimary }]}>{streamEndSummary.totalViewers}</Text>
                <Text style={[styles.endedStatLabel, { color: colors.textSecondary }]}>Viewers</Text>
              </View>
              <View style={[styles.endedStatDivider, { backgroundColor: colors.border }]} />
              <View style={styles.endedStatItem}>
                <Text style={[styles.endedStatValue, { color: colors.textPrimary }]}>{streamEndSummary.lotsSold}</Text>
                <Text style={[styles.endedStatLabel, { color: colors.textSecondary }]}>Lots Sold</Text>
              </View>
              <View style={[styles.endedStatDivider, { backgroundColor: colors.border }]} />
              <View style={styles.endedStatItem}>
                <Text style={[styles.endedStatValue, { color: colors.textPrimary }]}>{formatFromFiat(streamEndSummary.totalSales, currencyCode)}</Text>
                <Text style={[styles.endedStatLabel, { color: colors.textSecondary }]}>Total Sales</Text>
              </View>
            </View>
          )}
          <Pressable
            onPress={() => navigation.goBack()}
            style={({ pressed }) => [styles.retryBtn, { backgroundColor: colors.danger }, pressed && { opacity: 0.85 }]}
            accessibilityRole="button"
            accessibilityLabel="Done"
          >
            <Text style={styles.retryBtnText}>Done</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ── Live state — immersive full-screen with overlays ──
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" />

      {/* ── Full-screen video plane ── */}
      <View style={styles.fullScreenVideo}>
        {isDemo ? (
          <View style={styles.demoVideoPlaceholder}>
            <View style={styles.demoPill}>
              <Text style={styles.demoPillText}>DEMO</Text>
            </View>
            <Ionicons name="videocam-outline" size={48} color={colors.textMuted} />
            <Text style={styles.demoVideoText}>Demo stream</Text>
          </View>
        ) : (
          <View style={styles.videoPlaceholder}>
            <Text style={styles.videoPlaceholderText}>Connecting to stream...</Text>
          </View>
        )}

        {/* ── Top overlay: leave (left) + live badge + viewer count + actions (right) ── */}
        <View style={[styles.topOverlay, { paddingTop: insets.top + Space.xs }]}>
          {/* Left: leave button + seller identity */}
          <View style={styles.topLeftCluster}>
            <Pressable
              onPress={() => navigation.goBack()}
              hitSlop={12}
              style={({ pressed }) => [styles.overlayBtnScrim, pressed && { opacity: 0.7 }]}
              accessibilityRole="button"
              accessibilityLabel="Leave stream"
            >
              <Ionicons name="chevron-back" size={24} color={colors.scrimTextPrimary} />
            </Pressable>
            <View style={styles.sellerIdentityChip}>
              <Image source={{ uri: stream?.sellerAvatar }} style={styles.sellerAvatarSmall} />
              <View style={styles.sellerIdentityText}>
                <View style={styles.sellerNameRowOverlay}>
                  <Text style={styles.sellerNameOverlay} numberOfLines={1}>{stream?.sellerName}</Text>
                  {stream?.sellerVerified && (
                    <Ionicons name="checkmark-circle" size={12} color={colors.scrimTextPrimary} />
                  )}
                </View>
                <Pressable
                  onPress={handleFollowToggle}
                  disabled={followMutation.isPending}
                  hitSlop={4}
                  style={({ pressed }) => [styles.followChip, pressed && { opacity: 0.7 }]}
                  accessibilityRole="button"
                  accessibilityLabel={isFollowing ? 'Unfollow seller' : 'Follow seller'}
                  accessibilityState={{ busy: followMutation.isPending }}
                >
                  {followMutation.isPending ? (
                    <ActivityIndicator size={10} color={colors.scrimTextPrimary} />
                  ) : (
                    <Text style={styles.followChipText}>{isFollowing ? 'Following' : 'Follow'}</Text>
                  )}
                </Pressable>
              </View>
            </View>
          </View>

          {/* Right: live badge + viewer count + like + share */}
          <View style={styles.topRightCluster}>
            <View style={styles.liveBadgeOverlay}>
              <View style={styles.liveDotOverlay} />
              <Text style={styles.liveBadgeTextOverlay}>LIVE</Text>
            </View>
            {viewerCount > 0 && (
              <View style={styles.viewerBadgeOverlay}>
                <Ionicons name="eye-outline" size={12} color={colors.scrimTextPrimary} />
                <Text style={styles.viewerBadgeTextOverlay}>{viewerCount >= 1000 ? `${(viewerCount / 1000).toFixed(1)}K` : viewerCount}</Text>
              </View>
            )}
            <Pressable
              onPress={handleLike}
              hitSlop={8}
              style={({ pressed }) => [styles.overlayBtnScrim, pressed && { opacity: 0.7 }]}
              accessibilityRole="button"
              accessibilityLabel={hasLiked ? 'Unlike stream' : 'Like stream'}
            >
              <Ionicons name={hasLiked ? 'heart' : 'heart-outline'} size={22} color={hasLiked ? colors.danger : colors.scrimTextPrimary} />
            </Pressable>
            <Pressable
              onPress={handleShare}
              hitSlop={8}
              style={({ pressed }) => [styles.overlayBtnScrim, pressed && { opacity: 0.7 }]}
              accessibilityRole="button"
              accessibilityLabel="Share stream"
            >
              <Ionicons name="share-outline" size={20} color={colors.scrimTextPrimary} />
            </Pressable>
          </View>
        </View>

        {/* ── Bottom overlay: chat (semi-transparent) + product showcase panel ── */}
        <KeyboardAvoidingView
          style={styles.bottomOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
        >
          {/* Chat overlay — semi-transparent, bottom-left, ambient */}
          <View style={styles.chatOverlayContainer}>
            <FlatList
              ref={chatListRef}
              data={messages}
              keyExtractor={(item) => item.id}
              renderItem={renderChatMessage}
              contentContainerStyle={styles.chatListContent}
              onContentSizeChange={() => chatListRef.current?.scrollToEnd({ animated: !reducedMotion })}
              showsVerticalScrollIndicator={false}
            />
          </View>

          {/* Lot status badge — commerce-critical lifecycle state */}
          {currentLot && derivedLotStatus && (
            <View style={styles.lotStatusRow}>
              <View
                style={[
                  styles.lotStatusBadge,
                  { backgroundColor: lotStatusBgColor(derivedLotStatus, colors) },
                ]}
              >
                <Text
                  style={[
                    styles.lotStatusText,
                    { color: lotStatusTextColor(derivedLotStatus, colors) },
                  ]}
                >
                  {lotStatusLabel(derivedLotStatus, currentLot.currentPrice)}
                </Text>
              </View>
              {isWinner && (
                <Pressable
                  onPress={handleCompleteCheckout}
                  disabled={settlePending}
                  style={({ pressed }) => [
                    styles.checkoutBtn,
                    { backgroundColor: colors.success },
                    pressed && { opacity: 0.85 },
                    settlePending && { opacity: 0.6 },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Complete checkout for won lot"
                  accessibilityState={{ busy: settlePending }}
                >
                  {settlePending ? (
                    <ActivityIndicator size="small" color={colors.textInverse} />
                  ) : (
                    <Text style={styles.checkoutBtnText}>Complete checkout</Text>
                  )}
                </Pressable>
              )}
            </View>
          )}

          {/* Product showcase panel — floating, semi-transparent */}
          {currentLot && (
            <Reanimated.View
              entering={reducedMotion ? FadeIn.duration(0) : FadeIn.duration(300)}
              style={styles.productShowcasePanel}
            >
              <Pressable
                onPress={() => setItemSheetVisible(true)}
                style={styles.productShowcasePress}
                accessibilityRole="button"
                accessibilityLabel={`View ${currentLot.title} details`}
              >
                <Image source={{ uri: currentLot.imageUri }} style={styles.productImageSmall} />
                <View style={styles.productInfoCompact}>
                  <Text style={styles.productTitleOverlay} numberOfLines={1}>{currentLot.title}</Text>
                  <View style={styles.productPriceRow}>
                    <Text style={styles.productPriceValue}>{formatFromFiat(currentLot.currentPrice, currencyCode)}</Text>
                    <Text style={styles.productPriceLabel}>{currentLot.bidCount} bids</Text>
                    {timeRemaining > 0 && (
                      <Text style={[styles.productTimer, { color: timeRemaining <= 10 ? colors.danger : colors.scrimTextSecondary }]}>
                        {formatTime(timeRemaining)}
                      </Text>
                    )}
                  </View>
                </View>
              </Pressable>
              <View style={styles.productActionRow}>
                <Pressable
                  onPress={() => setBidSheetVisible(true)}
                  disabled={bidPending}
                  style={({ pressed }) => [styles.bidBtnOverlay, pressed && { opacity: 0.85 }, bidPending && { opacity: 0.6 }]}
                  accessibilityRole="button"
                  accessibilityLabel="Place a bid"
                >
                  {bidPending ? (
                    <ActivityIndicator size="small" color={colors.textInverse} />
                  ) : (
                    <Text style={styles.bidBtnTextOverlay}>Bid {currencySymbol}{minNextBid}+</Text>
                  )}
                </Pressable>
                {buyNowPrice > 0 && (
                  <Pressable
                    onPress={handleBuyNow}
                    disabled={buyNowPending}
                    style={({ pressed }) => [styles.buyNowBtnOverlay, pressed && { opacity: 0.85 }, buyNowPending && { opacity: 0.6 }]}
                    accessibilityRole="button"
                    accessibilityLabel={`Buy now for ${currencySymbol}${buyNowPrice}`}
                  >
                    {buyNowPending ? (
                      <ActivityIndicator size="small" color={colors.textPrimary} />
                    ) : (
                      <Text style={styles.buyNowBtnTextOverlay}>Buy {currencySymbol}{buyNowPrice}</Text>
                    )}
                  </Pressable>
                )}
              </View>
            </Reanimated.View>
          )}

          {/* Chat input — semi-transparent, at the very bottom */}
          <View style={[styles.chatInputRowOverlay, { paddingBottom: insets.bottom || Space.sm }]}>
            <TextInput
              style={styles.chatInputOverlay}
              placeholder="Send a message..."
              placeholderTextColor={colors.scrimTextTertiary}
              value={chatInput}
              onChangeText={setChatInput}
              onSubmitEditing={handleSendChat}
              returnKeyType="send"
              accessibilityLabel="Chat message input"
            />
            <Pressable
              onPress={handleSendChat}
              disabled={!chatInput.trim()}
              hitSlop={4}
              style={({ pressed }) => [
                styles.chatSendBtnOverlay,
                !chatInput.trim() && { opacity: 0.4 },
                pressed && { opacity: 0.7 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Send message"
            >
              <Ionicons name="send" size={16} color={colors.scrimTextPrimary} />
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </View>

      {bidOutcome === 'unknown' && (
        <View style={[styles.unknownBanner, { backgroundColor: colors.warningSubtle, borderColor: colors.warningBorder, top: insets.top + Space.lg }]} pointerEvents="box-none">
          <View style={styles.unknownBannerContent}>
            <Ionicons name="cloud-offline-outline" size={20} color={colors.warning} />
            <View style={styles.unknownBannerText}>
              <Text style={[styles.unknownBannerTitle, { color: colors.textPrimary }]}>
                Bid status unknown
              </Text>
              <Text style={[styles.unknownBannerSubtitle, { color: colors.textSecondary }]}>
                Your bid may have been placed. We couldn't confirm the result.
              </Text>
            </View>
          </View>
          <View style={styles.unknownBannerActions}>
            <Pressable
              onPress={handleCheckBidStatus}
              disabled={bidCheckPending}
              style={({ pressed }) => [
                styles.unknownCheckBtn,
                { backgroundColor: colors.warning },
                pressed && { opacity: 0.85 },
                bidCheckPending && { opacity: 0.6 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Check bid status"
              accessibilityState={{ busy: bidCheckPending }}
            >
              {bidCheckPending ? (
                <ActivityIndicator size="small" color={colors.textInverse} />
              ) : (
                <Text style={styles.unknownCheckBtnText}>Check result</Text>
              )}
            </Pressable>
            <Pressable
              onPress={() => { setBidOutcome('idle'); setLastBidId(null); }}
              style={({ pressed }) => [styles.unknownDismissBtn, pressed && { opacity: 0.7 }]}
              accessibilityRole="button"
              accessibilityLabel="Dismiss unknown bid status"
            >
              <Text style={[styles.unknownDismissBtnText, { color: colors.textSecondary }]}>Dismiss</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* ── Item detail sheet (in-stream, not navigation away) ── */}
      {itemSheetVisible && currentLot && (
        <Pressable style={styles.bidSheetOverlay} onPress={() => setItemSheetVisible(false)} accessibilityRole="button" accessibilityLabel="Close item details">
          <Pressable
            style={[styles.bidSheet, { backgroundColor: colors.surface }]}
            onPress={(e) => e.stopPropagation()}
          accessibilityRole="button"
          >
            <View style={styles.bidSheetHandle} />
            <Image source={{ uri: currentLot.imageUri }} style={styles.itemSheetImage} />
            <Text style={[styles.bidSheetTitle, { color: colors.textPrimary }]}>{currentLot.title}</Text>
            <View style={styles.itemSheetPriceRow}>
              <View>
                <Text style={[styles.bidSheetCurrentLabel, { color: colors.textSecondary }]}>Current bid</Text>
                <Text style={[styles.bidSheetCurrent, { color: colors.textPrimary }]}>{formatFromFiat(currentLot.currentPrice, currencyCode)}</Text>
              </View>
              <View style={styles.itemSheetBidCount}>
                <Ionicons name="pricetag" size={14} color={colors.textSecondary} />
                <Text style={[styles.itemSheetBidCountText, { color: colors.textSecondary }]}>{currentLot.bidCount} bids</Text>
              </View>
            </View>
            {timeRemaining > 0 && (
              <View style={styles.timeRow}>
                <Ionicons name="time-outline" size={14} color={timeRemaining <= 10 ? colors.danger : colors.textSecondary} />
                <Text style={[styles.timeText, { color: timeRemaining <= 10 ? colors.danger : colors.textSecondary }]}>
                  {formatTime(timeRemaining)}
                </Text>
              </View>
            )}
            <View style={styles.productActions}>
              <Pressable
                onPress={() => { setItemSheetVisible(false); setBidSheetVisible(true); }}
                style={({ pressed }) => [styles.bidBtn, pressed && { opacity: 0.85 }]}
                accessibilityRole="button"
                accessibilityLabel="Place a bid"
              >
                <Text style={styles.bidBtnText}>Bid {currencySymbol}{minNextBid}+</Text>
              </Pressable>
              {buyNowPrice > 0 && (
                <Pressable
                  onPress={() => { setItemSheetVisible(false); handleBuyNow(); }}
                  disabled={buyNowPending}
                  style={({ pressed }) => [styles.buyNowBtn, pressed && { opacity: 0.85 }, buyNowPending && { opacity: 0.6 }]}
                  accessibilityRole="button"
                  accessibilityLabel={`Buy now for ${currencySymbol}${buyNowPrice}`}
                >
                  {buyNowPending ? (
                    <ActivityIndicator size="small" color={colors.textPrimary} />
                  ) : (
                    <Text style={styles.buyNowBtnText}>Buy Now {currencySymbol}{buyNowPrice}</Text>
                  )}
                </Pressable>
              )}
            </View>
            <Pressable
              onPress={() => setItemSheetVisible(false)}
              style={({ pressed }) => [styles.cancelBidBtn, pressed && { opacity: 0.7 }]}
              accessibilityRole="button"
              accessibilityLabel="Close item details"
            >
              <Text style={[styles.cancelBidText, { color: colors.textSecondary }]}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      )}

      {/* ── Bid sheet ── */}
      {bidSheetVisible && currentLot && (
        <Pressable style={styles.bidSheetOverlay} onPress={() => setBidSheetVisible(false)} accessibilityRole="button" accessibilityLabel="Close bid sheet">
          <Pressable
            style={[styles.bidSheet, { backgroundColor: colors.surface }]}
            onPress={(e) => e.stopPropagation()}
          accessibilityRole="button"
          >
            <View style={styles.bidSheetHandle} />
            <Text style={[styles.bidSheetTitle, { color: colors.textPrimary }]}>Place a Bid</Text>
            <Text style={[styles.bidSheetCurrentLabel, { color: colors.textSecondary }]}>
              Current bid
            </Text>
            <Text style={[styles.bidSheetCurrent, { color: colors.textPrimary }]}>
              {currencySymbol}{currentLot.currentPrice}
            </Text>
            <Text style={[styles.bidSheetMinLabel, { color: colors.textMuted }]}>
              Minimum next bid {currencySymbol}{minNextBid}
            </Text>
            <View style={styles.quickBidRow}>
              {[minNextBid, minNextBid + 5, minNextBid + 10, minNextBid + 20].map((amount) => (
                <Pressable
                  key={amount}
                  onPress={() => handleBid(amount)}
                  disabled={bidPending}
                  style={({ pressed }) => [
                    styles.quickBidBtn,
                    { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
                    pressed && { opacity: 0.7 },
                    bidPending && { opacity: 0.5 },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Bid ${currencySymbol}${amount}`}
                >
                  <Text style={[styles.quickBidText, { color: colors.textPrimary }]}>{formatFromFiat(amount, currencyCode)}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              onPress={() => setBidSheetVisible(false)}
              style={({ pressed }) => [styles.cancelBidBtn, pressed && { opacity: 0.7 }]}
              accessibilityRole="button"
              accessibilityLabel="Cancel bid"
            >
              <Text style={[styles.cancelBidText, { color: colors.textSecondary }]}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1 },
  // ── Full-screen video plane ──
  fullScreenVideo: {
    flex: 1,
    position: 'relative',
    backgroundColor: colors.background },
  demoVideoPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
    gap: Space.xs },
  demoVideoText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textSecondary },
  demoPill: {
    paddingHorizontal: Space.xs + 2,
    paddingVertical: 2,
    borderRadius: Radius.sm,
    backgroundColor: colors.warningSubtle,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.warningBorder,
    marginBottom: Space.xs },
  demoPillText: {
    fontSize: TypographyV2.meta.size - 2,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.label.letterSpacing,
    color: colors.warning },
  videoPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background },
  videoPlaceholderText: {
    fontSize: TypographyV2.body.size,
    color: colors.textSecondary },
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
  overlayBtnScrim: {
    width: Control.hit,
    height: Control.hit,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.overlay },
  sellerIdentityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    backgroundColor: colors.overlay,
    borderRadius: Radius.full,
    paddingLeft: Space.xs,
    paddingRight: Space.sm,
    paddingVertical: Space.xs / 2,
    flexShrink: 1 },
  sellerAvatarSmall: {
    width: Space.lg + 2,
    height: Space.lg + 2,
    borderRadius: Radius.full,
    backgroundColor: colors.surfaceAlt },
  sellerIdentityText: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    flexShrink: 1 },
  sellerNameRowOverlay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs / 2,
    flexShrink: 1 },
  sellerNameOverlay: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.scrimTextPrimary,
    flexShrink: 1 },
  followChip: {
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs / 2,
    borderRadius: Radius.full,
    backgroundColor: colors.scrimTextPrimary },
  followChipText: {
    fontSize: TypographyV2.meta.size - 1,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textInverse },
  topRightCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs },
  liveBadgeOverlay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs / 2,
    backgroundColor: colors.danger,
    paddingHorizontal: Space.xs + 2,
    paddingVertical: Space.xs / 2 + 1,
    borderRadius: Radius.sm },
  liveDotOverlay: {
    width: Space.xs + 2,
    height: Space.xs + 2,
    borderRadius: Radius.full,
    backgroundColor: colors.scrimTextPrimary },
  liveBadgeTextOverlay: {
    fontSize: TypographyV2.label.size,
    lineHeight: TypographyV2.label.lineHeight,
    fontFamily: TypographyV2.label.fontFamily,
    color: colors.scrimTextPrimary,
    letterSpacing: TypographyV2.label.letterSpacing },
  viewerBadgeOverlay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs / 2,
    backgroundColor: colors.overlay,
    paddingHorizontal: Space.xs + 2,
    paddingVertical: Space.xs / 2 + 1,
    borderRadius: Radius.sm },
  viewerBadgeTextOverlay: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.scrimTextPrimary,
    fontVariant: ['tabular-nums'] },
  // ── Bottom overlay (chat + product panel + input) ──
  bottomOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10 },
  // ── Chat overlay (semi-transparent) ──
  chatOverlayContainer: {
    height: SCREEN_HEIGHT * 0.22,
    paddingLeft: Space.md,
    paddingRight: Space.md },
  chatListContent: {
    paddingVertical: Space.xs,
    gap: Space.xs / 2 },
  chatMessage: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    gap: Space.xs / 2,
    backgroundColor: colors.overlay,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs / 2 + 1,
    borderRadius: Radius.chat,
    alignSelf: 'flex-start',
    maxWidth: '80%' },
  sellerBadge: {
    paddingHorizontal: Space.xs,
    paddingVertical: Space.xs / 4,
    borderRadius: Radius.sm,
    backgroundColor: colors.brand },
  sellerBadgeText: {
    fontSize: TypographyV2.meta.size - 2,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textInverse,
    letterSpacing: TypographyV2.label.letterSpacing },
  chatSender: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.scrimTextPrimary },
  chatText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.scrimTextPrimary,
    flexShrink: 1 },
  systemMessage: {
    alignItems: 'center',
    backgroundColor: colors.overlay,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs / 2 + 1,
    borderRadius: Radius.sm,
    alignSelf: 'center' },
  systemMessageText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    fontStyle: 'italic',
    color: colors.scrimTextSecondary },
  // ── Product showcase panel (floating, semi-transparent) ──
  productShowcasePanel: {
    backgroundColor: colors.overlay,
    borderRadius: Radius.lg,
    marginHorizontal: Space.sm,
    marginBottom: Space.xs,
    padding: Space.sm,
    gap: Space.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder },
  lotStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.sm,
    marginBottom: Space.xs },
  lotStatusBadge: {
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs / 2 + 1,
    borderRadius: Radius.sm },
  lotStatusText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.label.letterSpacing },
  checkoutBtn: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs / 2 + 1,
    borderRadius: Radius.sm,
    minHeight: Control.chrome,
    alignItems: 'center',
    justifyContent: 'center' },
  checkoutBtnText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textInverse },
  productShowcasePress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm },
  productImageSmall: {
    width: Space.xxl + Space.xs,
    height: Space.xxl + Space.xs,
    borderRadius: Radius.md,
    backgroundColor: colors.surfaceAlt },
  productInfoCompact: {
    flex: 1,
    gap: Space.xs / 2 },
  productTitleOverlay: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.scrimTextPrimary },
  productPriceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Space.sm },
  productPriceValue: {
    fontSize: TypographyV2.priceList.size,
    lineHeight: TypographyV2.priceList.lineHeight,
    fontFamily: TypographyV2.priceList.fontFamily,
    letterSpacing: TypographyV2.priceList.letterSpacing,
    color: colors.scrimTextPrimary,
    fontVariant: ['tabular-nums'] },
  productPriceLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.scrimTextSecondary,
    fontVariant: ['tabular-nums'] },
  productTimer: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    fontVariant: ['tabular-nums'],
    marginLeft: 'auto' },
  productActionRow: {
    flexDirection: 'row',
    gap: Space.xs },
  bidBtnOverlay: {
    flex: 1,
    paddingVertical: Space.sm,
    borderRadius: Radius.lg,
    backgroundColor: colors.danger,
    minHeight: Control.chrome,
    alignItems: 'center',
    justifyContent: 'center' },
  bidBtnTextOverlay: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    color: colors.scrimTextPrimary,
    fontVariant: ['tabular-nums'] },
  buyNowBtnOverlay: {
    flex: 1,
    paddingVertical: Space.sm,
    borderRadius: Radius.lg,
    backgroundColor: colors.glassBorder,
    minHeight: Control.chrome,
    alignItems: 'center',
    justifyContent: 'center' },
  buyNowBtnTextOverlay: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    color: colors.scrimTextPrimary,
    fontVariant: ['tabular-nums'] },
  // ── Chat input (semi-transparent) ──
  chatInputRowOverlay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.sm,
    paddingTop: Space.xs },
  chatInputOverlay: {
    flex: 1,
    height: Space.xl + Space.xs,
    paddingHorizontal: Space.md,
    borderRadius: Radius.xxl,
    backgroundColor: colors.overlay,
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.scrimTextPrimary,
    paddingTop: (Space.xl + Space.xs - TypographyV2.body.lineHeight) / 2 },
  chatSendBtnOverlay: {
    width: Control.hit,
    height: Control.hit,
    borderRadius: Radius.full,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center' },
  // ── State containers (connecting, error, ended) ──
  stateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.xl,
    gap: Space.md },
  stateTitle: {
    fontSize: TypographyV2.sectionTitle.size,
    lineHeight: TypographyV2.sectionTitle.lineHeight,
    fontFamily: TypographyV2.sectionTitle.fontFamily,
    textAlign: 'center' },
  stateSubtitle: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: TypographyV2.body.fontFamily,
    textAlign: 'center' },
  retryBtn: {
    paddingHorizontal: Space.xl,
    paddingVertical: Space.md,
    borderRadius: Radius.xxl,
    minHeight: Control.hit,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Space.sm },
  retryBtnText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textPrimary },
  secondaryBtn: {
    paddingVertical: Space.sm },
  secondaryBtnText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily },
  endedIcon: {
    width: Space.xxl + Space.xxl + Space.xs,
    height: Space.xxl + Space.xxl + Space.xs,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center' },
  endedStats: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.lg,
    paddingVertical: Space.lg,
    paddingHorizontal: Space.md,
    width: '100%',
    marginTop: Space.sm },
  endedStatItem: {
    flex: 1,
    alignItems: 'center',
    gap: Space.xs / 2 },
  endedStatValue: {
    fontSize: TypographyV2.screenTitle.size,
    fontFamily: TypographyV2.screenTitle.fontFamily,
    fontVariant: ['tabular-nums'] },
  endedStatLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },
  endedStatDivider: {
    width: Stroke.hairline,
    height: Space.xxl + Space.xs },
  // ── Item detail sheet ──
  itemSheetImage: {
    width: '100%',
    height: Space.xxl * 3,
    borderRadius: Radius.lg,
    backgroundColor: colors.surfaceAlt,
    resizeMode: 'cover' },
  itemSheetPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between' },
  itemSheetBidCount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs / 2 },
  itemSheetBidCountText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    fontVariant: ['tabular-nums'] },
  // ── Shared action styles (used by item detail sheet) ──
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs / 2 },
  timeText: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    fontVariant: ['tabular-nums'] },
  productActions: {
    flexDirection: 'row',
    gap: Space.xs },
  bidBtn: {
    flex: 1,
    paddingVertical: Space.sm,
    borderRadius: Radius.lg,
    backgroundColor: colors.danger,
    minHeight: Control.hit,
    alignItems: 'center',
    justifyContent: 'center' },
  bidBtnText: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    color: colors.scrimTextPrimary,
    fontVariant: ['tabular-nums'] },
  buyNowBtn: {
    flex: 1,
    paddingVertical: Space.sm,
    borderRadius: Radius.lg,
    backgroundColor: colors.surfaceAlt,
    minHeight: Control.hit,
    alignItems: 'center',
    justifyContent: 'center' },
  buyNowBtnText: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'] },
  // ── Bid sheet ──
  bidSheetOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    top: 0,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end' },
  bidSheet: {
    borderTopLeftRadius: Radius.xxl,
    borderTopRightRadius: Radius.xxl,
    paddingHorizontal: Space.lg,
    paddingTop: Space.sm,
    paddingBottom: Space.xl,
    gap: Space.sm },
  bidSheetHandle: {
    width: Space.xxl + Space.xs,
    height: Space.xs / 2 + 1,
    borderRadius: Radius.full,
    backgroundColor: colors.border,
    alignSelf: 'center' },
  bidSheetTitle: {
    fontSize: TypographyV2.sectionTitle.size,
    lineHeight: TypographyV2.sectionTitle.lineHeight,
    fontFamily: TypographyV2.sectionTitle.fontFamily,
    letterSpacing: TypographyV2.sectionTitle.letterSpacing,
    textAlign: 'center' },
  bidSheetCurrentLabel: {
    fontSize: TypographyV2.label.size,
    lineHeight: TypographyV2.label.lineHeight,
    fontFamily: TypographyV2.label.fontFamily,
    letterSpacing: TypographyV2.label.letterSpacing,
    textTransform: 'uppercase',
    textAlign: 'center' },
  bidSheetCurrent: {
    fontSize: TypographyV2.priceHero.size,
    lineHeight: TypographyV2.priceHero.lineHeight,
    fontFamily: TypographyV2.priceHero.fontFamily,
    letterSpacing: TypographyV2.priceHero.letterSpacing,
    textAlign: 'center',
    fontVariant: ['tabular-nums'] },
  bidSheetMinLabel: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    textAlign: 'center',
    fontVariant: ['tabular-nums'] },
  quickBidRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm,
    justifyContent: 'center' },
  quickBidBtn: {
    paddingHorizontal: Space.lg,
    paddingVertical: Space.md,
    borderRadius: Radius.lg,
    borderWidth: Stroke.standard,
    minWidth: Space.xxl + Space.xl + Space.xs,
    alignItems: 'center' },
  quickBidText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    fontVariant: ['tabular-nums'] },
  cancelBidBtn: {
    paddingVertical: Space.sm,
    alignItems: 'center' },
  cancelBidText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily },
  unknownBanner: {
    position: 'absolute',
    left: Space.sm,
    right: Space.sm,
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
    paddingLeft: Space.xl + Space.xs },
  unknownCheckBtn: {
    paddingVertical: Space.sm,
    paddingHorizontal: Space.lg,
    borderRadius: Radius.lg,
    minHeight: Control.hit,
    alignItems: 'center',
    justifyContent: 'center' },
  unknownCheckBtnText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textInverse },
  unknownDismissBtn: {
    paddingVertical: Space.sm,
    paddingHorizontal: Space.md },
  unknownDismissBtnText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily } });
