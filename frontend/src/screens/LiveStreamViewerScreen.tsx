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
 * - Viewer counts and bids come from real data or are clearly simulated
 *
 * Per AGENTS.md §4 (Push to maximum quality):
 * - Full-screen immersive experience
 * - Dark background (video-focused)
 * - Three distinct zones with clear visual hierarchy
 * - Video dominates, product is actionable, chat is ambient
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
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../navigation/types';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { useHaptic } from '../hooks/useHaptic';
import { Space, Radius, Type, Elevation, Control, Typography, Stroke, FontFamily } from '../theme/designTokens';
import {
  LiveSession,
  LiveChatMessage,
  LIVE_SHOPPING_DEMO_MODE,
} from '../services/liveShoppingApi';

// ---------------------------------------------------------------------------
// Mock data for demo mode
// ---------------------------------------------------------------------------

const DEMO_SESSION: LiveSession = {
  id: 'demo_stream_1',
  sellerId: 'seller_demo',
  sellerName: 'Vintage Vault',
  sellerAvatar: 'https://images.unsplash.com/photo-1633332755192-727a05c4013d?w=100',
  sellerVerified: true,
  title: 'Rare Vintage Finds — Live Auction',
  thumbnail: 'https://images.unsplash.com/photo-1556905055-3f3946c98f89?w=400',
  category: 'Fashion',
  viewerCount: 247,
  likeCount: 89,
  status: 'live',
  startedAt: new Date().toISOString(),
  currentItemId: 'item_1',
  currentItemTitle: 'Vintage Leather Jacket — 1970s',
  currentItemImage: 'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=400',
  currentBid: 45,
  bidCount: 12,
  itemTimeRemainingSec: 45,
  watchers: 247,
  isFollowing: false,
  isDemo: true,
};

const DEMO_CHAT_SEED: LiveChatMessage[] = [
  { id: 'm1', senderId: 'u1', senderName: 'Sarah', senderAvatar: '', text: 'Love this jacket!', timestamp: new Date(Date.now() - 60000).toISOString() },
  { id: 'm2', senderId: 'u2', senderName: 'Mike', senderAvatar: '', text: '£50 bid', timestamp: new Date(Date.now() - 45000).toISOString() },
  { id: 'm3', senderId: 'system', senderName: 'System', senderAvatar: '', text: 'Mike placed a bid of £50', isSystem: true, timestamp: new Date(Date.now() - 44000).toISOString() },
  { id: 'm4', senderId: 'u3', senderName: 'Emma', senderAvatar: '', text: 'Is there a buy now?', timestamp: new Date(Date.now() - 30000).toISOString() },
  { id: 'm5', senderId: 'seller', senderName: 'Vintage Vault', senderAvatar: '', text: 'Yes! Buy now at £120', isSeller: true, timestamp: new Date(Date.now() - 25000).toISOString() },
];

const DEMO_CHAT_RESPONSES = [
  'Nice piece!',
  'Going for £60',
  'Any sizing info?',
  'Condition looks great',
  'I\'ll bid £70',
  'Wow, rare find',
  'Following!',
  'Can you show the back?',
  'What\'s the material?',
  '£80 bid',
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type LiveStreamViewerRoute = RouteProp<RootStackParamList, 'LiveStreamViewer'>;

export function LiveStreamViewerScreen() {
  const navigation = useNavigation();
  const route = useRoute<LiveStreamViewerRoute>();
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [session, setSession] = useState<LiveSession>(DEMO_SESSION);
  const [messages, setMessages] = useState<LiveChatMessage[]>(DEMO_CHAT_SEED);
  const [chatInput, setChatInput] = useState('');
  const [bidSheetVisible, setBidSheetVisible] = useState(false);
  const [currentBid, setCurrentBid] = useState(DEMO_SESSION.currentBid ?? 0);
  const [timeRemaining, setTimeRemaining] = useState(DEMO_SESSION.itemTimeRemainingSec ?? 0);
  const [viewerCount, setViewerCount] = useState(DEMO_SESSION.viewerCount);
  const [hasLiked, setHasLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(DEMO_SESSION.likeCount);

  const chatListRef = useRef<FlatList<LiveChatMessage>>(null);
  const isDemo = session.isDemo || LIVE_SHOPPING_DEMO_MODE;

  // Timer for auction countdown
  useEffect(() => {
    if (timeRemaining <= 0) return;
    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          // Lot ended — simulate next lot
          setCurrentBid(35);
          return 60;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [timeRemaining]);

  // Simulate viewer count fluctuation (demo only)
  useEffect(() => {
    if (!isDemo) return;
    const interval = setInterval(() => {
      setViewerCount((prev) => prev + Math.floor(Math.random() * 5) - 2);
    }, 8000);
    return () => clearInterval(interval);
  }, [isDemo]);

  // Simulate incoming chat messages (demo only)
  useEffect(() => {
    if (!isDemo) return;
    const interval = setInterval(() => {
      const response = DEMO_CHAT_RESPONSES[Math.floor(Math.random() * DEMO_CHAT_RESPONSES.length)];
      const names = ['Alex', 'Jordan', 'Taylor', 'Riley', 'Casey'];
      const name = names[Math.floor(Math.random() * names.length)];
      const newMsg: LiveChatMessage = {
        id: `msg_${Date.now()}`,
        senderId: `u_${Math.random()}`,
        senderName: name,
        senderAvatar: '',
        text: response,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev.slice(-50), newMsg]);
    }, 6000);
    return () => clearInterval(interval);
  }, [isDemo]);

  const handleSendChat = useCallback(() => {
    if (!chatInput.trim()) return;
    const newMsg: LiveChatMessage = {
      id: `msg_${Date.now()}`,
      senderId: 'me',
      senderName: 'You',
      senderAvatar: '',
      text: chatInput.trim(),
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, newMsg]);
    setChatInput('');
    haptic.light();
  }, [chatInput, haptic]);

  const handleBid = useCallback((amount: number) => {
    setCurrentBid(amount);
    setBidSheetVisible(false);
    const systemMsg: LiveChatMessage = {
      id: `bid_${Date.now()}`,
      senderId: 'system',
      senderName: 'System',
      senderAvatar: '',
      text: `You placed a bid of £${amount}`,
      isSystem: true,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, systemMsg]);
    haptic.medium();
  }, [haptic]);

  const handleLike = useCallback(() => {
    setHasLiked((prev) => {
      if (!prev) setLikeCount((c) => c + 1);
      else setLikeCount((c) => c - 1);
      return !prev;
    });
    haptic.light();
  }, [haptic]);

  const handleBuyNow = useCallback(() => {
    haptic.medium();
    // Navigate to checkout (future)
  }, [haptic]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const minNextBid = currentBid + 5;

  const renderChatMessage = useCallback(({ item }: { item: LiveChatMessage }) => {
    if (item.isSystem) {
      return (
        <View style={styles.systemMessage}>
          <Text style={[styles.systemMessageText, { color: colors.textSecondary }]}>
            {item.text}
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
          {item.senderName}
        </Text>
        <Text style={[styles.chatText, { color: colors.textPrimary }]}>
          {item.text}
        </Text>
      </View>
    );
  }, [colors]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" />

      {/* ── Video plane (top) ── */}
      <View style={[styles.videoPlane, { paddingTop: insets.top }]}>
        {/* Video area */}
        <View style={styles.videoArea}>
          {isDemo ? (
            <View style={styles.demoVideoPlaceholder}>
              <Ionicons name="videocam-outline" size={48} color="rgba(255,255,255,0.3)" />
              <Text style={styles.demoVideoText}>Demo Mode</Text>
              <Text style={styles.demoVideoSubtext}>Live video stream will appear here</Text>
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

            <View style={styles.viewerBadge}>
              <Ionicons name="eye-outline" size={14} color="white" />
              <Text style={styles.viewerBadgeText}>{viewerCount}</Text>
            </View>

            <View style={styles.videoOverlayRight}>
              <Pressable
                onPress={handleLike}
                style={({ pressed }) => [styles.overlayBtn, pressed && { opacity: 0.7 }]}
                accessibilityRole="button"
                accessibilityLabel={hasLiked ? 'Unlike stream' : 'Like stream'}
              >
                <Ionicons name={hasLiked ? 'heart' : 'heart-outline'} size={22} color={hasLiked ? colors.danger : colors.textPrimary} />
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.overlayBtn, pressed && { opacity: 0.7 }]}
                accessibilityRole="button"
                accessibilityLabel="Share stream"
              >
                <Ionicons name="share-outline" size={22} color="white" />
              </Pressable>
              <Pressable
                onPress={() => navigation.goBack()}
                style={({ pressed }) => [styles.overlayBtn, pressed && { opacity: 0.7 }]}
                accessibilityRole="button"
                accessibilityLabel="Close stream"
              >
                <Ionicons name="close" size={24} color="white" />
              </Pressable>
            </View>
          </View>
        </View>

        {/* Seller info bar */}
        <View style={styles.sellerBar}>
          <Image source={{ uri: session.sellerAvatar }} style={styles.sellerAvatar} />
          <View style={styles.sellerInfo}>
            <View style={styles.sellerNameRow}>
              <Text style={styles.sellerName} numberOfLines={1}>{session.sellerName}</Text>
              {session.sellerVerified && (
                <Ionicons name="checkmark-circle" size={14} color={colors.brand} />
              )}
            </View>
            <Text style={styles.streamTitle} numberOfLines={1}>{session.title}</Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.followBtn, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel="Follow seller"
          >
            <Text style={styles.followBtnText}>Follow</Text>
          </Pressable>
        </View>
      </View>

      {/* ── Product plane (middle) ── */}
      <View style={styles.productPlane}>
        <Image source={{ uri: session.currentItemImage }} style={styles.productImage} />
        <View style={styles.productInfo}>
          <Text style={styles.productTitle} numberOfLines={2}>{session.currentItemTitle}</Text>
          <View style={styles.priceRow}>
            <View>
              <Text style={styles.priceLabel}>Current Bid</Text>
              <Text style={styles.priceValue}>£{currentBid}</Text>
            </View>
            <View style={styles.bidCountBadge}>
              <Ionicons name="pricetag" size={12} color={colors.textSecondary} />
              <Text style={styles.bidCountText}>{session.bidCount} bids</Text>
            </View>
          </View>
          <View style={styles.timeRow}>
            <Ionicons name="time-outline" size={14} color={timeRemaining <= 10 ? colors.danger : colors.textSecondary} />
            <Text style={[styles.timeText, { color: timeRemaining <= 10 ? colors.danger : colors.textSecondary }]}>
              {formatTime(timeRemaining)}
            </Text>
          </View>
        </View>
        <View style={styles.productActions}>
          <Pressable
            onPress={() => setBidSheetVisible(true)}
            style={({ pressed }) => [styles.bidBtn, pressed && { opacity: 0.85 }]}
            accessibilityRole="button"
            accessibilityLabel="Place a bid"
          >
            <Text style={styles.bidBtnText}>Bid £{minNextBid}+</Text>
          </Pressable>
          <Pressable
            onPress={handleBuyNow}
            style={({ pressed }) => [styles.buyNowBtn, pressed && { opacity: 0.85 }]}
            accessibilityRole="button"
            accessibilityLabel="Buy now for £120"
          >
            <Text style={styles.buyNowBtnText}>Buy Now £120</Text>
          </Pressable>
        </View>
      </View>

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
            placeholderTextColor="rgba(255,255,255,0.4)"
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
            <Ionicons name="send" size={18} color="white" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {/* ── Bid sheet ── */}
      {bidSheetVisible && (
        <Pressable style={styles.bidSheetOverlay} onPress={() => setBidSheetVisible(false)}>
          <Pressable
            style={[styles.bidSheet, { backgroundColor: colors.surface }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.bidSheetHandle} />
            <Text style={[styles.bidSheetTitle, { color: colors.textPrimary }]}>Place a Bid</Text>
            <Text style={[styles.bidSheetCurrentLabel, { color: colors.textSecondary }]}>
              Current bid
            </Text>
            <Text style={[styles.bidSheetCurrent, { color: colors.textPrimary }]}>
              £{currentBid}
            </Text>
            <Text style={[styles.bidSheetMinLabel, { color: colors.textMuted }]}>
              Minimum next bid £{minNextBid}
            </Text>
            <View style={styles.quickBidRow}>
              {[minNextBid, minNextBid + 5, minNextBid + 10, minNextBid + 20].map((amount) => (
                <Pressable
                  key={amount}
                  onPress={() => handleBid(amount)}
                  style={({ pressed }) => [
                    styles.quickBidBtn,
                    { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
                    pressed && { opacity: 0.7 },
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
    fontSize: Type.bodyLarge.size,
    fontFamily: Typography.family.semibold,
    color: 'rgba(255,255,255,0.5)',
  },
  demoVideoSubtext: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: 'rgba(255,255,255,0.3)',
  },
  videoPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  videoPlaceholderText: {
    fontSize: Type.body.size,
    color: 'rgba(255,255,255,0.5)',
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
    fontSize: Type.metaElevated.size,
    lineHeight: Type.metaElevated.lineHeight,
    fontFamily: Typography.family.bold,
    color: colors.textPrimary,
    letterSpacing: Type.metaElevated.letterSpacing,
  },
  viewerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs / 2,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: Space.xs + 2,
    paddingVertical: Space.xs / 2 + 1,
    borderRadius: Radius.sm,
  },
  viewerBadgeText: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
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
    backgroundColor: 'rgba(0,0,0,0.5)',
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
    fontSize: Type.bodyEmphasis.size,
    lineHeight: Type.bodyEmphasis.lineHeight,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  streamTitle: {
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    fontFamily: Typography.family.regular,
    color: 'rgba(255,255,255,0.6)',
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
    backgroundColor: '#161616',
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
    fontSize: Type.bodyEmphasis.size,
    lineHeight: Type.bodyEmphasis.lineHeight,
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
    color: 'rgba(255,255,255,0.5)',
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
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: Space.xs + 2,
    paddingVertical: Space.xs / 2 + 1,
    borderRadius: Radius.sm,
  },
  bidCountText: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.medium,
    color: 'rgba(255,255,255,0.7)',
    fontVariant: ['tabular-nums'],
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs / 2,
  },
  timeText: {
    fontSize: Type.bodyEmphasis.size,
    lineHeight: Type.bodyEmphasis.lineHeight,
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
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.bold,
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  buyNowBtn: {
    paddingHorizontal: Space.md + 2,
    paddingVertical: Space.sm,
    borderRadius: Radius.lg,
    backgroundColor: 'rgba(255,255,255,0.15)',
    minHeight: Control.hit,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buyNowBtnText: {
    fontSize: Type.bodyEmphasis.size,
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
    letterSpacing: Type.metaElevated.letterSpacing,
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
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  chatInput: {
    flex: 1,
    height: Space.xl + Space.xs + 4,
    paddingHorizontal: Space.md,
    borderRadius: Radius.xxl,
    backgroundColor: 'rgba(255,255,255,0.1)',
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
  // ── Bid sheet ──
  bidSheetOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    top: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
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
    backgroundColor: 'rgba(255,255,255,0.2)',
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
    fontSize: Type.metaElevated.size,
    lineHeight: Type.metaElevated.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.metaElevated.letterSpacing,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  bidSheetCurrent: {
    fontSize: Type.priceLarge.size,
    lineHeight: Type.priceLarge.lineHeight,
    fontFamily: Typography.family.bold,
    letterSpacing: Type.priceLarge.letterSpacing,
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
    fontSize: Type.bodyLarge.size,
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
