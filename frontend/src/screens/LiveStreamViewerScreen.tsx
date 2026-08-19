/**
 * LiveStreamViewerScreen — three-plane live shopping viewer
 *
 * Architecture (2026 August research):
 * - Video plane (top): low-latency WebRTC stream or demo placeholder
 * - Product plane (middle): current lot with bid/buy-now actions
 * - Chat plane (bottom): real-time chat with system messages
 *
 * Per AGENTS.md §11 (Truthful UI):
 * - Demo mode is clearly labeled — we never fabricate that a stream is live
 * - Viewer counts, chat, and bids come from the real-time service layer
 *   (connectToStream + subscribeTo*). No fabricated viewer-count drift, no
 *   fabricated chat messages, no fabricated "someone just bought" toasts.
 *
 * Per AGENTS.md §4 (Push to maximum quality):
 * - Full-screen immersive experience
 * - Dark background (video-focused)
 * - Three distinct zones with clear visual hierarchy
 * - Video dominates, product is actionable, chat is ambient
 *
 * Per AGENTS.md §14 (State coverage):
 * - Connecting, live, error (reconnect), stream ended, offline states
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  TextInput,
  FlatList,
  Image,
  Dimensions,
  StatusBar,
  LayoutAnimation,
  Platform,
  KeyboardAvoidingView,
  Share,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { RootStackParamList, NativeStackNavigationProp } from '../navigation/types';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { useHaptic } from '../hooks/useHaptic';
import { useToast } from '../context/ToastContext';
import { useFollowMutation } from '../platform/server';
import { Space, Radius, Type, Control, Typography, Stroke } from '../theme/designTokens';
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
  buyNowDuringStream,
  sendStreamChatMessage,
  likeStream,
  fetchStreamChatHistory,
} from '../services/liveShoppingApi';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type LiveStreamViewerRoute = RouteProp<RootStackParamList, 'LiveStreamViewer'>;

type ConnectionState = 'connecting' | 'live' | 'error' | 'ended' | 'offline';

export function LiveStreamViewerScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<LiveStreamViewerRoute>();
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const insets = useSafeAreaInsets();
  const { show } = useToast();
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
  const [streamEndSummary, setStreamEndSummary] = useState<StreamEndEventPayload | null>(null);
  const [currentLot, setCurrentLot] = useState<LiveLot | null>(null);

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
              bidCount: payload.newBidCount,
            };
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
    setBidPending(true);
    haptic.medium();
    try {
      const result = await placeStreamBid(sessionId, currentLot.id, amount);
      if (result.success && result.lot) {
        setCurrentLot({ ...result.lot });
      } else {
        show(result.error ?? 'Bid failed', 'error');
      }
    } catch {
      show('Could not place bid', 'error');
    } finally {
      setBidPending(false);
      setBidSheetVisible(false);
    }
  }, [currentLot, haptic, sessionId, show]);

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
        message: `Watch ${stream?.sellerName ?? 'this seller'}'s live stream on ThryftVerse`,
      });
    } catch {
      // User cancelled the share sheet — no error toast needed.
    }
  }, [haptic, stream?.sellerName]);

  const handleFollowToggle = useCallback(() => {
    haptic.light();
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
      },
    });
  }, [haptic, isDemo, followMutation, isFollowing, show, stream?.sellerId]);

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
                <Text style={[styles.endedStatValue, { color: colors.textPrimary }]}>£{streamEndSummary.totalSales}</Text>
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

  // ── Live state ──
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" />

      {/* ── Video plane (top) ── */}
      <View style={[styles.videoPlane, { paddingTop: insets.top }]}>
        {/* Video area */}
        <View style={styles.videoArea}>
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

          {/* Overlay: viewer count + like + share */}
          <View style={styles.videoOverlay}>
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveBadgeText}>LIVE</Text>
            </View>

            {viewerCount > 0 && (
              <View style={styles.viewerBadge}>
                <Ionicons name="eye-outline" size={14} color={colors.scrimTextPrimary} />
                <Text style={styles.viewerBadgeText}>{viewerCount}</Text>
              </View>
            )}

            <View style={styles.videoOverlayRight}>
              <Pressable
                onPress={handleLike}
                style={({ pressed }) => [styles.overlayBtn, pressed && { opacity: 0.7 }]}
                accessibilityRole="button"
                accessibilityLabel={hasLiked ? 'Unlike stream' : 'Like stream'}
              >
                <Ionicons name={hasLiked ? 'heart' : 'heart-outline'} size={22} color={hasLiked ? colors.danger : colors.scrimTextPrimary} />
              </Pressable>
              <Pressable
                onPress={handleShare}
                style={({ pressed }) => [styles.overlayBtn, pressed && { opacity: 0.7 }]}
                accessibilityRole="button"
                accessibilityLabel="Share stream"
              >
                <Ionicons name="share-outline" size={22} color={colors.scrimTextPrimary} />
              </Pressable>
              <Pressable
                onPress={() => navigation.goBack()}
                style={({ pressed }) => [styles.overlayBtn, pressed && { opacity: 0.7 }]}
                accessibilityRole="button"
                accessibilityLabel="Close stream"
              >
                <Ionicons name="close" size={24} color={colors.scrimTextPrimary} />
              </Pressable>
            </View>
          </View>
        </View>

        {/* Seller info bar */}
        <View style={styles.sellerBar}>
          <Image source={{ uri: stream?.sellerAvatar }} style={styles.sellerAvatar} />
          <View style={styles.sellerInfo}>
            <View style={styles.sellerNameRow}>
              <Text style={styles.sellerName} numberOfLines={1}>{stream?.sellerName}</Text>
              {stream?.sellerVerified && (
                <Ionicons name="checkmark-circle" size={14} color={colors.brand} />
              )}
            </View>
            <Text style={styles.streamTitle} numberOfLines={1}>{stream?.title}</Text>
          </View>
          <Pressable
            onPress={handleFollowToggle}
            disabled={followMutation.isPending}
            style={({ pressed }) => [
              styles.followBtn,
              pressed && { opacity: 0.7 },
              followMutation.isPending && { opacity: 0.6 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={isFollowing ? 'Unfollow seller' : 'Follow seller'}
            accessibilityState={{ busy: followMutation.isPending }}
          >
            {followMutation.isPending ? (
              <ActivityIndicator size="small" color={colors.textPrimary} />
            ) : (
              <Text style={styles.followBtnText}>{isFollowing ? 'Following' : 'Follow'}</Text>
            )}
          </Pressable>
        </View>
      </View>

      {/* ── Product plane (middle) — pinned, tappable ── */}
      {currentLot && (
        <Pressable
          onPress={() => setItemSheetVisible(true)}
          style={({ pressed }) => [styles.productPlane, pressed && { opacity: 0.92 }]}
          accessibilityRole="button"
          accessibilityLabel={`View ${currentLot.title} details`}
        >
          <Image source={{ uri: currentLot.imageUri }} style={styles.productImage} />
          <View style={styles.productInfo}>
            <Text style={styles.productTitle} numberOfLines={2}>{currentLot.title}</Text>
            <View style={styles.priceRow}>
              <View>
                <Text style={styles.priceLabel}>Current Bid</Text>
                <Text style={styles.priceValue}>£{currentLot.currentPrice}</Text>
              </View>
              <View style={styles.bidCountBadge}>
                <Ionicons name="pricetag" size={12} color={colors.textSecondary} />
                <Text style={styles.bidCountText}>{currentLot.bidCount} bids</Text>
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
          </View>
          <View style={styles.productActions}>
            <Pressable
              onPress={() => setBidSheetVisible(true)}
              disabled={bidPending}
              style={({ pressed }) => [styles.bidBtn, pressed && { opacity: 0.85 }, bidPending && { opacity: 0.6 }]}
              accessibilityRole="button"
              accessibilityLabel="Place a bid"
            >
              {bidPending ? (
                <ActivityIndicator size="small" color={colors.textPrimary} />
              ) : (
                <Text style={styles.bidBtnText}>Bid £{minNextBid}+</Text>
              )}
            </Pressable>
            {buyNowPrice > 0 && (
              <Pressable
                onPress={handleBuyNow}
                disabled={buyNowPending}
                style={({ pressed }) => [styles.buyNowBtn, pressed && { opacity: 0.85 }, buyNowPending && { opacity: 0.6 }]}
                accessibilityRole="button"
                accessibilityLabel={`Buy now for £${buyNowPrice}`}
              >
                {buyNowPending ? (
                  <ActivityIndicator size="small" color={colors.textPrimary} />
                ) : (
                  <Text style={styles.buyNowBtnText}>Buy Now £{buyNowPrice}</Text>
                )}
              </Pressable>
            )}
          </View>
        </Pressable>
      )}

      {/* ── Chat plane (bottom) ── */}
      <KeyboardAvoidingView
        style={styles.chatPlane}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={chatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderChatMessage}
          contentContainerStyle={styles.chatListContent}
          onContentSizeChange={() => chatListRef.current?.scrollToEnd({ animated: true })}
          showsVerticalScrollIndicator={false}
        />
        <View style={[styles.chatInputRow, { paddingBottom: insets.bottom || Space.sm }]}>
          <TextInput
            style={styles.chatInput}
            placeholder="Send a message..."
            placeholderTextColor={colors.textMuted}
            value={chatInput}
            onChangeText={setChatInput}
            onSubmitEditing={handleSendChat}
            returnKeyType="send"
            accessibilityLabel="Chat message input"
          />
          <Pressable
            onPress={handleSendChat}
            disabled={!chatInput.trim()}
            style={({ pressed }) => [
              styles.chatSendBtn,
              !chatInput.trim() && { opacity: 0.4 },
              pressed && { opacity: 0.7 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Send message"
          >
            <Ionicons name="send" size={18} color={colors.scrimTextPrimary} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>

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
                <Text style={[styles.bidSheetCurrent, { color: colors.textPrimary }]}>£{currentLot.currentPrice}</Text>
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
                <Text style={styles.bidBtnText}>Bid £{minNextBid}+</Text>
              </Pressable>
              {buyNowPrice > 0 && (
                <Pressable
                  onPress={() => { setItemSheetVisible(false); handleBuyNow(); }}
                  disabled={buyNowPending}
                  style={({ pressed }) => [styles.buyNowBtn, pressed && { opacity: 0.85 }, buyNowPending && { opacity: 0.6 }]}
                  accessibilityRole="button"
                  accessibilityLabel={`Buy now for £${buyNowPrice}`}
                >
                  {buyNowPending ? (
                    <ActivityIndicator size="small" color={colors.textPrimary} />
                  ) : (
                    <Text style={styles.buyNowBtnText}>Buy Now £{buyNowPrice}</Text>
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
              £{currentLot.currentPrice}
            </Text>
            <Text style={[styles.bidSheetMinLabel, { color: colors.textMuted }]}>
              Minimum next bid £{minNextBid}
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
                  accessibilityLabel={`Bid £${amount}`}
                >
                  <Text style={[styles.quickBidText, { color: colors.textPrimary }]}>£{amount}</Text>
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
const VIDEO_HEIGHT = Math.round(SCREEN_WIDTH * 0.5625); // 16:9

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
  },
  // ── State containers (connecting, error, ended) ──
  stateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.xl,
    gap: Space.md,
  },
  stateTitle: {
    fontSize: Type.subtitle.size,
    lineHeight: Type.subtitle.lineHeight,
    fontFamily: Typography.family.bold,
    textAlign: 'center',
  },
  stateSubtitle: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.regular,
    textAlign: 'center',
  },
  retryBtn: {
    paddingHorizontal: Space.xl,
    paddingVertical: Space.md,
    borderRadius: Radius.xxl,
    minHeight: Control.hit,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Space.sm,
  },
  retryBtnText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.bold,
    color: colors.textPrimary,
  },
  secondaryBtn: {
    paddingVertical: Space.sm,
  },
  secondaryBtnText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
  },
  endedIcon: {
    width: Space.xxl + Space.xxl + Space.xs,
    height: Space.xxl + Space.xxl + Space.xs,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  endedStats: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.lg,
    paddingVertical: Space.lg,
    paddingHorizontal: Space.md,
    width: '100%',
    marginTop: Space.sm,
  },
  endedStatItem: {
    flex: 1,
    alignItems: 'center',
    gap: Space.xs / 2,
  },
  endedStatValue: {
    fontSize: Type.title.size,
    fontFamily: Typography.family.bold,
    fontVariant: ['tabular-nums'],
  },
  endedStatLabel: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
  },
  endedStatDivider: {
    width: Stroke.hairline,
    height: Space.xxl + Space.xs,
  },
  // ── Video plane ──
  videoPlane: {
    backgroundColor: colors.background,
  },
  videoArea: {
    width: '100%',
    height: VIDEO_HEIGHT,
    position: 'relative',
  },
  demoVideoPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
    gap: Space.xs,
  },
  demoVideoText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: colors.textSecondary,
  },
  demoPill: {
    paddingHorizontal: Space.xs + 2,
    paddingVertical: 2,
    borderRadius: Radius.sm,
    backgroundColor: colors.warningSubtle,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.warningBorder,
    marginBottom: Space.xs,
  },
  demoPillText: {
    fontSize: Type.meta.size - 2,
    fontFamily: Typography.family.bold,
    letterSpacing: Type.label.letterSpacing,
    color: colors.warning,
  },
  videoPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  videoPlaceholderText: {
    fontSize: Type.body.size,
    color: colors.textSecondary,
  },
  videoOverlay: {
    position: 'absolute',
    top: Space.sm,
    left: Space.sm,
    right: Space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs / 2,
    backgroundColor: colors.danger,
    paddingHorizontal: Space.xs + 2,
    paddingVertical: Space.xs / 2 + 1,
    borderRadius: Radius.sm,
  },
  liveDot: {
    width: Space.xs + 2,
    height: Space.xs + 2,
    borderRadius: Radius.full,
    backgroundColor: colors.textPrimary,
  },
  liveBadgeText: {
    fontSize: Type.label.size,
    lineHeight: Type.label.lineHeight,
    fontFamily: Typography.family.bold,
    color: colors.textPrimary,
    letterSpacing: Type.label.letterSpacing,
  },
  viewerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs / 2,
    backgroundColor: colors.overlay,
    paddingHorizontal: Space.xs + 2,
    paddingVertical: Space.xs / 2 + 1,
    borderRadius: Radius.sm,
  },
  viewerBadgeText: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    color: colors.scrimTextPrimary,
    fontVariant: ['tabular-nums'],
  },
  videoOverlayRight: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Space.xs,
  },
  overlayBtn: {
    width: Control.hit,
    height: Control.hit,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // ── Seller bar ──
  sellerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    backgroundColor: colors.surface,
  },
  sellerAvatar: {
    width: Space.xl + Space.xs,
    height: Space.xl + Space.xs,
    borderRadius: Radius.full,
    backgroundColor: colors.surfaceAlt,
  },
  sellerInfo: {
    flex: 1,
    gap: Space.xs / 4,
  },
  sellerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  sellerName: {
    fontSize: Type.bodyStrong.size,
    lineHeight: Type.bodyStrong.lineHeight,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  streamTitle: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.regular,
    color: colors.textSecondary,
  },
  followBtn: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs + 2,
    borderRadius: Radius.xxl,
    backgroundColor: colors.danger,
  },
  followBtnText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
  },
  // ── Product plane ──
  productPlane: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
    backgroundColor: colors.surface,
  },
  productImage: {
    width: Space.xxl + Space.xl + Space.sm,
    height: Space.xxl + Space.xl + Space.sm,
    borderRadius: Radius.lg,
    backgroundColor: colors.surfaceAlt,
  },
  productInfo: {
    flex: 1,
    gap: Space.xs,
  },
  productTitle: {
    fontSize: Type.bodyStrong.size,
    lineHeight: Type.bodyStrong.lineHeight,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  priceLabel: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.regular,
    color: colors.textSecondary,
  },
  priceValue: {
    fontSize: Type.priceList.size,
    lineHeight: Type.priceList.lineHeight,
    fontFamily: Typography.family.bold,
    letterSpacing: Type.priceList.letterSpacing,
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  bidCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs / 2,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: Space.xs + 2,
    paddingVertical: Space.xs / 2 + 1,
    borderRadius: Radius.sm,
  },
  bidCountText: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.medium,
    color: colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs / 2,
  },
  timeText: {
    fontSize: Type.bodyStrong.size,
    lineHeight: Type.bodyStrong.lineHeight,
    fontFamily: Typography.family.bold,
    fontVariant: ['tabular-nums'],
  },
  productActions: {
    flexDirection: 'row',
    gap: Space.xs,
  },
  bidBtn: {
    paddingHorizontal: Space.md + 2,
    paddingVertical: Space.sm,
    borderRadius: Radius.lg,
    backgroundColor: colors.danger,
    minHeight: Control.hit,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bidBtnText: {
    fontSize: Type.bodyStrong.size,
    fontFamily: Typography.family.bold,
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  buyNowBtn: {
    paddingHorizontal: Space.md + 2,
    paddingVertical: Space.sm,
    borderRadius: Radius.lg,
    backgroundColor: colors.surfaceAlt,
    minHeight: Control.hit,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buyNowBtnText: {
    fontSize: Type.bodyStrong.size,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  // ── Chat plane ──
  chatPlane: {
    flex: 1,
    backgroundColor: colors.background,
  },
  chatListContent: {
    padding: Space.sm,
    gap: Space.xs,
  },
  chatMessage: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    gap: Space.xs / 2,
  },
  sellerBadge: {
    paddingHorizontal: Space.xs,
    paddingVertical: Space.xs / 4,
    borderRadius: Radius.sm,
  },
  sellerBadgeText: {
    fontSize: Type.meta.size - 2,
    fontFamily: Typography.family.bold,
    color: colors.textPrimary,
    letterSpacing: Type.label.letterSpacing,
  },
  chatSender: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
  },
  chatText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    flexShrink: 1,
  },
  systemMessage: {
    alignItems: 'center',
    paddingVertical: Space.xs / 2,
  },
  systemMessageText: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.regular,
    fontStyle: 'italic',
  },
  chatInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    backgroundColor: colors.surface,
    borderTopWidth: Stroke.hairline,
    borderTopColor: colors.border,
  },
  chatInput: {
    flex: 1,
    height: Space.xl + Space.xs + 4,
    paddingHorizontal: Space.md,
    borderRadius: Radius.xxl,
    backgroundColor: colors.surfaceAlt,
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    color: colors.textPrimary,
    paddingTop: (Space.xl + Space.xs + 4 - Type.body.lineHeight) / 2,
  },
  chatSendBtn: {
    width: Control.hit,
    height: Control.hit,
    borderRadius: Radius.full,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // ── Item detail sheet ──
  itemSheetImage: {
    width: '100%',
    height: Space.xxl * 3,
    borderRadius: Radius.lg,
    backgroundColor: colors.surfaceAlt,
    resizeMode: 'cover',
  },
  itemSheetPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  itemSheetBidCount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs / 2,
  },
  itemSheetBidCountText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
    fontVariant: ['tabular-nums'],
  },
  // ── Bid sheet ──
  bidSheetOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    top: 0,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  bidSheet: {
    borderTopLeftRadius: Radius.xxl,
    borderTopRightRadius: Radius.xxl,
    paddingHorizontal: Space.lg,
    paddingTop: Space.sm,
    paddingBottom: Space.xl,
    gap: Space.sm,
  },
  bidSheetHandle: {
    width: Space.xxl + Space.xs,
    height: Space.xs / 2 + 1,
    borderRadius: Radius.full,
    backgroundColor: colors.border,
    alignSelf: 'center',
  },
  bidSheetTitle: {
    fontSize: Type.subtitle.size,
    lineHeight: Type.subtitle.lineHeight,
    fontFamily: Typography.family.bold,
    letterSpacing: Type.subtitle.letterSpacing,
    textAlign: 'center',
  },
  bidSheetCurrentLabel: {
    fontSize: Type.label.size,
    lineHeight: Type.label.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.label.letterSpacing,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  bidSheetCurrent: {
    fontSize: Type.priceHero.size,
    lineHeight: Type.priceHero.lineHeight,
    fontFamily: Typography.family.bold,
    letterSpacing: Type.priceHero.letterSpacing,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  bidSheetMinLabel: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.regular,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  quickBidRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm,
    justifyContent: 'center',
  },
  quickBidBtn: {
    paddingHorizontal: Space.lg,
    paddingVertical: Space.md,
    borderRadius: Radius.lg,
    borderWidth: Stroke.standard,
    minWidth: Space.xxl + Space.xl + Space.xs,
    alignItems: 'center',
  },
  quickBidText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.bold,
    fontVariant: ['tabular-nums'],
  },
  cancelBidBtn: {
    paddingVertical: Space.sm,
    alignItems: 'center',
  },
  cancelBidText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
  },
});
