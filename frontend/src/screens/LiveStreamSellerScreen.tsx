/**
 * LiveStreamSellerScreen — broadcaster experience
 *
 * Pre-stream setup → live broadcast → post-stream summary
 *
 * Per AGENTS.md §11 (Truthful UI):
 * - Demo mode is clearly labeled
 * - Camera preview is a placeholder until real WebRTC is wired
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
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../navigation/types';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { useHaptic } from '../hooks/useHaptic';
import { Space, Radius, Type, Control, Typography, Stroke, LetterSpacing } from '../theme/designTokens';
import {
  LIVE_SHOPPING_DEMO_MODE,
  connectToStream,
  disconnectFromStream,
  subscribeToViewerCount,
  subscribeToStreamEvents,
  advanceToNextLot,
  endCurrentLot,
  endLiveStream,
  createLiveStream,
  openLot,
  closeLot,
  cancelLot,
  settleLot,
  type StreamEndEventPayload,
  type LotSoldEventPayload,
  type LotStatus,
  type LotSettlementStatus,
} from '../services/liveShoppingApi';

type SellerPhase = 'setup' | 'live' | 'summary';

interface LotItem {
  id: string;
  title: string;
  imageUri: string;
  startingPrice: number;
  status: 'upcoming' | 'active' | 'sold' | 'passed';
}

const DEMO_LOTS: LotItem[] = [
  { id: 'lot_1', title: 'Vintage Leather Jacket', imageUri: 'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=200', startingPrice: 30, status: 'active' },
  { id: 'lot_2', title: 'Designer Sunglasses', imageUri: 'https://images.unsplash.com/photo-1572635196237-14b3f281509f?w=200', startingPrice: 20, status: 'upcoming' },
  { id: 'lot_3', title: 'Retro Sneakers', imageUri: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=200', startingPrice: 40, status: 'upcoming' },
  { id: 'lot_4', title: 'Silk Scarf', imageUri: 'https://images.unsplash.com/photo-1601924994987-69e26d50dc26?w=200', startingPrice: 15, status: 'upcoming' },
];

type LiveStreamSellerRoute = RouteProp<RootStackParamList, 'LiveStreamSeller'>;

function sellerLotStatusLabel(status: LotStatus, soldAmount: number | null): string {
  switch (status) {
    case 'scheduled':
      return 'Scheduled';
    case 'open':
      return 'Open for bidding';
    case 'closing':
      return 'Closing soon';
    case 'sold':
      return soldAmount != null ? `Sold for \u00A3${soldAmount}` : 'Sold';
    case 'passed':
      return 'Passed';
    case 'cancelled':
      return 'Cancelled';
  }
}

function sellerLotStatusBg(status: LotStatus, colors: ThemeColors): string {
  switch (status) {
    case 'scheduled':
      return colors.surfaceAlt;
    case 'open':
    case 'sold':
      return colors.successSubtle;
    case 'closing':
      return colors.warningSubtle;
    case 'passed':
    case 'cancelled':
      return colors.surfaceAlt;
  }
}

function sellerLotStatusFg(status: LotStatus, colors: ThemeColors): string {
  switch (status) {
    case 'scheduled':
      return colors.textSecondary;
    case 'open':
    case 'sold':
      return colors.success;
    case 'closing':
      return colors.warning;
    case 'passed':
    case 'cancelled':
      return colors.textMuted;
  }
}

function settlementStatusLabel(status: LotSettlementStatus): string {
  switch (status) {
    case 'none':
      return '';
    case 'settling':
      return 'Settling...';
    case 'order_created':
      return 'Order created';
    case 'payment_reserved':
      return 'Payment pending';
    case 'payment_failed':
      return 'Payment failed';
    case 'completed':
      return 'Completed';
  }
}

export function LiveStreamSellerScreen() {
  const navigation = useNavigation();
  const route = useRoute<LiveStreamSellerRoute>();
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const isDemo = LIVE_SHOPPING_DEMO_MODE;
  const [phase, setPhase] = useState<SellerPhase>('setup');
  const [title, setTitle] = useState('');
  const [lots, setLots] = useState<LotItem[]>(isDemo ? DEMO_LOTS : []);
  const [viewerCount, setViewerCount] = useState(0);
  const [currentLotIndex, setCurrentLotIndex] = useState(0);
  const [liveDuration, setLiveDuration] = useState(0);
  const [totalSales, setTotalSales] = useState(0);
  const [lotsSold, setLotsSold] = useState(0);
  const [goingLive, setGoingLive] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [endingStream, setEndingStream] = useState(false);
  const [endError, setEndError] = useState<string | null>(null);
  const [lotActionPending, setLotActionPending] = useState(false);
  const [currentLotStatus, setCurrentLotStatus] = useState<LotStatus>('scheduled');
  const [settlementStatus, setSettlementStatus] = useState<LotSettlementStatus>('none');
  const [settlePending, setSettlePending] = useState(false);
  const [soldAmount, setSoldAmount] = useState<number | null>(null);

  const streamIdRef = useRef<string | null>(null);

  // ── Duration timer — ticks every second while live ──
  useEffect(() => {
    if (phase !== 'live') return;
    const interval = setInterval(() => {
      setLiveDuration((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [phase]);

  // ── Real-time subscriptions during live phase ──
  useEffect(() => {
    if (phase !== 'live' || !streamIdRef.current) return;
    const sid = streamIdRef.current;

    const unsubViewer = subscribeToViewerCount(sid, (payload) => {
      setViewerCount(payload.count);
    });

    const unsubEvents = subscribeToStreamEvents(sid, (event) => {
      if (event.type === 'lot_sold') {
        const payload = event.payload as LotSoldEventPayload;
        setTotalSales((prev) => prev + payload.finalPrice);
        setLotsSold((prev) => prev + 1);
      }
    });

    return () => {
      unsubViewer();
      unsubEvents();
    };
  }, [phase]);

  // ── Cleanup on unmount ──
  useEffect(() => {
    return () => {
      if (streamIdRef.current) {
        disconnectFromStream(streamIdRef.current);
      }
    };
  }, []);

  const handleGoLive = useCallback(async () => {
    haptic.medium();
    setGoingLive(true);
    setSetupError(null);
    try {
      // Create a stream via the service layer, then connect to it.
      const result = await createLiveStream({
        sellerId: 'me',
        sellerName: 'You',
        title: title.trim() || 'Live Auction',
        lotListingIds: lots.map((l) => l.id),
      });
      if (!result.success || !result.stream) {
        setGoingLive(false);
        setSetupError(result.error || 'Could not start stream. Please try again.');
        return;
      }
      streamIdRef.current = result.stream.id;
      await connectToStream(result.stream.id);
      setPhase('live');
      setViewerCount(0);
      setCurrentLotStatus('scheduled');
      setSettlementStatus('none');
      setSoldAmount(null);
    } catch {
      setGoingLive(false);
      setSetupError('Network error — could not start stream. Please try again.');
    }
  }, [haptic, title, lots]);

  const handleEndStream = useCallback(async () => {
    haptic.medium();
    if (!streamIdRef.current) {
      setPhase('summary');
      return;
    }
    setEndingStream(true);
    try {
      const result = await endLiveStream(streamIdRef.current);
      if (result.success && result.summary) {
        setViewerCount(result.summary.totalViewers);
        setLotsSold(result.summary.lotsSold);
        setTotalSales(result.summary.totalSales);
      }
    } catch {
      setEndError('Stream end status unknown — your stream may have ended. Check your stream history.');
    }
    setEndingStream(false);
    setPhase('summary');
  }, [haptic]);

  const handleNextLot = useCallback(async () => {
    if (!streamIdRef.current) return;
    setLotActionPending(true);
    haptic.light();
    try {
      // Sell the current lot, then advance to the next.
      await endCurrentLot(streamIdRef.current);
      const advanceResult = await advanceToNextLot(streamIdRef.current);
      if (advanceResult.success) {
        setLots((prev) => prev.map((lot, i) => {
          if (i === currentLotIndex) return { ...lot, status: 'sold' as const };
          if (i === currentLotIndex + 1) return { ...lot, status: 'active' as const };
          return lot;
        }));
        setCurrentLotIndex((i) => Math.min(i + 1, lots.length - 1));
        setCurrentLotStatus('scheduled');
        setSettlementStatus('none');
        setSoldAmount(null);
      }
    } catch {
      // Service error — don't mutate local state
    }
    setLotActionPending(false);
  }, [currentLotIndex, lots.length, haptic]);

  const handleSkipLot = useCallback(async () => {
    if (!streamIdRef.current) return;
    setLotActionPending(true);
    haptic.light();
    try {
      const result = await advanceToNextLot(streamIdRef.current);
      if (result.success) {
        setLots((prev) => prev.map((lot, i) => {
          if (i === currentLotIndex) return { ...lot, status: 'passed' as const };
          if (i === currentLotIndex + 1) return { ...lot, status: 'active' as const };
          return lot;
        }));
        setCurrentLotIndex((i) => Math.min(i + 1, lots.length - 1));
        setCurrentLotStatus('scheduled');
        setSettlementStatus('none');
        setSoldAmount(null);
      }
    } catch {
      // Service error — don't mutate local state
    }
    setLotActionPending(false);
  }, [currentLotIndex, haptic]);

  const handleOpenLot = useCallback(async () => {
    if (!streamIdRef.current) return;
    setLotActionPending(true);
    haptic.medium();
    try {
      const currentLot = lots[currentLotIndex];
      if (!currentLot) return;
      await openLot(streamIdRef.current, currentLot.id);
      setCurrentLotStatus('open');
      setSettlementStatus('none');
      setSoldAmount(null);
    } catch {
      // Service error — don't mutate local state
    }
    setLotActionPending(false);
  }, [currentLotIndex, lots, haptic]);

  const handleCloseLot = useCallback(async () => {
    if (!streamIdRef.current) return;
    setLotActionPending(true);
    haptic.medium();
    try {
      const currentLot = lots[currentLotIndex];
      if (!currentLot) return;
      const result = await closeLot(streamIdRef.current, currentLot.id);
      setCurrentLotStatus(result.status);
      setSettlementStatus(result.settlementStatus);
      if (result.status === 'sold') {
        setSoldAmount(result.highBidMinor / 100);
      }
    } catch {
      // Service error — don't mutate local state
    }
    setLotActionPending(false);
  }, [currentLotIndex, lots, haptic]);

  const handleCancelLot = useCallback(async () => {
    if (!streamIdRef.current) return;
    setLotActionPending(true);
    haptic.light();
    try {
      const currentLot = lots[currentLotIndex];
      if (!currentLot) return;
      await cancelLot(streamIdRef.current, currentLot.id);
      setCurrentLotStatus('cancelled');
    } catch {
      // Service error — don't mutate local state
    }
    setLotActionPending(false);
  }, [currentLotIndex, lots, haptic]);

  const handleSettleLot = useCallback(async () => {
    if (!streamIdRef.current) return;
    const currentLot = lots[currentLotIndex];
    if (!currentLot) return;
    setSettlePending(true);
    haptic.medium();
    try {
      const result = await settleLot(streamIdRef.current, currentLot.id);
      setSettlementStatus(result.status);
      haptic.success();
    } catch {
      // Service error — don't mutate local state
    }
    setSettlePending(false);
  }, [currentLotIndex, lots, haptic]);

  // ── Setup phase ──
  if (phase === 'setup') {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar barStyle="dark-content" />
        <SafeAreaView style={styles.safeArea} edges={['top']}>
          <View style={styles.header}>
            <Pressable onPress={() => navigation.goBack()} style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]} accessibilityRole="button" accessibilityLabel="Go back">
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </Pressable>
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Go Live</Text>
            <View style={{ width: Control.hit }} />
          </View>

          <ScrollView style={styles.setupScroll} contentContainerStyle={styles.setupContent}>
            {/* Demo banner */}
            {isDemo && (
              <View style={[styles.demoBanner, { backgroundColor: colors.warningSubtle }]} accessibilityRole="header">
                <Ionicons name="flask-outline" size={16} color={colors.warning} />
                <Text style={[styles.demoBannerText, { color: colors.warning }]}>Demo Mode — sample lots loaded</Text>
              </View>
            )}

            {/* Camera preview placeholder */}
            <View style={[styles.cameraPreview, { backgroundColor: colors.surfaceAlt }]}>
              <Ionicons name="videocam-outline" size={40} color={colors.textMuted} />
              <Text style={[styles.cameraPreviewText, { color: colors.textMuted }]}>
                {isDemo ? 'Camera preview unavailable in demo mode' : 'Camera preview'}
              </Text>
            </View>

            {/* Title input */}
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Stream Title</Text>
              <TextInput
                style={[styles.titleInput, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]}
                placeholder="e.g. Vintage Finds Live Auction"
                placeholderTextColor={colors.textMuted}
                value={title}
                onChangeText={(text) => {
                  setTitle(text);
                  setSetupError(null);
                }}
                maxLength={60}
              />
            </View>

            {/* Lot selection */}
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Lots ({lots.length})</Text>
              {lots.length > 0 ? (
                <FlatList
                  data={lots}
                  keyExtractor={(item) => item.id}
                  renderItem={({ item, index }) => (
                    <View style={[styles.lotRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                      <Text style={[styles.lotNumber, { color: colors.textMuted }]}>#{index + 1}</Text>
                      <Image source={{ uri: item.imageUri }} style={styles.lotImage} />
                      <View style={styles.lotInfo}>
                        <Text style={[styles.lotTitle, { color: colors.textPrimary }]} numberOfLines={1}>{item.title}</Text>
                        <Text style={[styles.lotPrice, { color: colors.textSecondary }]}>Start: £{item.startingPrice}</Text>
                      </View>
                      <Ionicons name="reorder-three-outline" size={20} color={colors.textMuted} />
                    </View>
                  )}
                  scrollEnabled={false}
                />
              ) : (
                <View style={[styles.emptyLots, { borderColor: colors.border }]}>
                  <Ionicons name="pricetags-outline" size={28} color={colors.textMuted} />
                  <Text style={[styles.emptyLotsText, { color: colors.textSecondary }]}>No lots added yet</Text>
                  <Text style={[styles.emptyLotsSubtext, { color: colors.textMuted }]}>Add listings to your stream before going live</Text>
                </View>
              )}
            </View>
          </ScrollView>

          <View style={[styles.setupFooter, { paddingBottom: insets.bottom || Space.md }]}>
            {setupError && (
              <View style={[styles.setupErrorBanner, { backgroundColor: colors.dangerSubtle }]}>
                <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
                <Text style={[styles.setupErrorText, { color: colors.danger }]}>{setupError}</Text>
              </View>
            )}
            <Pressable
              onPress={handleGoLive}
              disabled={lots.length === 0 || goingLive}
              style={({ pressed }) => [styles.goLiveBtn, (lots.length === 0 || goingLive) && styles.goLiveBtnDisabled, pressed && { opacity: 0.85 }]}
              accessibilityRole="button"
              accessibilityLabel="Go live now"
              accessibilityState={{ disabled: lots.length === 0 || goingLive, busy: goingLive }}
            >
              {goingLive ? (
                <ActivityIndicator size="small" color={colors.textPrimary} />
              ) : (
                <>
                  <View style={styles.liveDot} />
                  <Text style={styles.goLiveBtnText}>Go Live Now</Text>
                </>
              )}
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // ── Live phase ──
  if (phase === 'live') {
    const currentLot = lots[currentLotIndex];
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar barStyle="light-content" />
        <View style={{ paddingTop: insets.top }}>
          {/* Camera preview (small) */}
          <View style={styles.sellerCameraPreview}>
            <Ionicons name="videocam" size={24} color={colors.textMuted} />
            <Text style={styles.sellerCameraText}>{isDemo ? 'Demo broadcast' : 'Broadcasting'}</Text>
            <View style={[styles.liveBadgeSmall, isDemo && { backgroundColor: colors.warning }]}>
              <View style={[styles.liveDot, isDemo && { backgroundColor: colors.textPrimary }]} />
              <Text style={styles.liveBadgeTextSmall}>{isDemo ? 'DEMO' : 'LIVE'}</Text>
            </View>
          </View>

          {/* Stats bar */}
          <View style={styles.sellerStatsBar}>
            <View style={styles.sellerStat}>
              <Ionicons name="eye-outline" size={14} color={colors.textSecondary} />
              <Text style={styles.sellerStatText}>{viewerCount} viewers</Text>
            </View>
            <View style={styles.sellerStat}>
              <Ionicons name="time-outline" size={14} color={colors.textSecondary} />
              <Text style={styles.sellerStatText}>{Math.floor(liveDuration / 60)}:{(liveDuration % 60).toString().padStart(2, '0')}</Text>
            </View>
            <Pressable
              onPress={handleEndStream}
              disabled={endingStream}
              style={({ pressed }) => [styles.endStreamBtn, pressed && { opacity: 0.7 }, endingStream && { opacity: 0.6 }]}
              accessibilityRole="button"
              accessibilityLabel="End stream"
              accessibilityState={{ busy: endingStream }}
            >
              {endingStream ? (
                <ActivityIndicator size="small" color={colors.textPrimary} />
              ) : (
                <Text style={styles.endStreamBtnText}>End</Text>
              )}
            </Pressable>
          </View>

          {/* Current lot */}
          <View style={styles.sellerCurrentLot}>
            <Image source={{ uri: currentLot?.imageUri }} style={styles.sellerLotImage} />
            <View style={styles.sellerLotInfo}>
              <Text style={styles.sellerLotTitle} numberOfLines={1}>{currentLot?.title}</Text>
              <Text style={styles.sellerLotPrice}>£{currentLot?.startingPrice}</Text>
              <View
                style={[
                  styles.sellerLotStatusBadge,
                  { backgroundColor: sellerLotStatusBg(currentLotStatus, colors) },
                ]}
              >
                <Text style={[styles.sellerLotStatusText, { color: sellerLotStatusFg(currentLotStatus, colors) }]}>
                  {sellerLotStatusLabel(currentLotStatus, soldAmount)}
                </Text>
              </View>
            </View>
          </View>

          {/* Lot management */}
          <View style={styles.sellerLotActions}>
            {currentLotStatus === 'scheduled' && (
              <Pressable
                onPress={handleOpenLot}
                disabled={lotActionPending}
                style={({ pressed }) => [styles.nextLotBtn, { backgroundColor: colors.success }, pressed && { opacity: 0.85 }, lotActionPending && { opacity: 0.6 }]}
                accessibilityRole="button"
                accessibilityLabel="Open lot for bidding"
                accessibilityState={{ busy: lotActionPending }}
              >
                {lotActionPending ? (
                  <ActivityIndicator size="small" color={colors.textPrimary} />
                ) : (
                  <Text style={styles.nextLotBtnText}>Open Lot</Text>
                )}
              </Pressable>
            )}
            {(currentLotStatus === 'open' || currentLotStatus === 'closing') && (
              <>
                <Pressable
                  onPress={handleCancelLot}
                  disabled={lotActionPending}
                  style={({ pressed }) => [styles.skipLotBtn, pressed && { opacity: 0.7 }, lotActionPending && { opacity: 0.5 }]}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel current lot"
                  accessibilityState={{ busy: lotActionPending }}
                >
                  <Text style={styles.skipLotBtnText}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={handleCloseLot}
                  disabled={lotActionPending}
                  style={({ pressed }) => [styles.nextLotBtn, pressed && { opacity: 0.85 }, lotActionPending && { opacity: 0.6 }]}
                  accessibilityRole="button"
                  accessibilityLabel="Close lot and determine winner"
                  accessibilityState={{ busy: lotActionPending }}
                >
                  {lotActionPending ? (
                    <ActivityIndicator size="small" color={colors.textPrimary} />
                  ) : (
                    <Text style={styles.nextLotBtnText}>Close Lot</Text>
                  )}
                </Pressable>
              </>
            )}
            {currentLotStatus === 'sold' && (
              <>
                <Pressable
                  onPress={handleNextLot}
                  disabled={lotActionPending}
                  style={({ pressed }) => [styles.skipLotBtn, pressed && { opacity: 0.7 }, lotActionPending && { opacity: 0.5 }]}
                  accessibilityRole="button"
                  accessibilityLabel="Go to next lot"
                  accessibilityState={{ busy: lotActionPending }}
                >
                  <Text style={styles.skipLotBtnText}>Next →</Text>
                </Pressable>
                <Pressable
                  onPress={handleSettleLot}
                  disabled={settlePending || settlementStatus !== 'none' && settlementStatus !== 'payment_failed'}
                  style={({ pressed }) => [styles.nextLotBtn, { backgroundColor: colors.success }, pressed && { opacity: 0.85 }, (settlePending || (settlementStatus !== 'none' && settlementStatus !== 'payment_failed')) && { opacity: 0.6 }]}
                  accessibilityRole="button"
                  accessibilityLabel="Create order for sold lot"
                  accessibilityState={{ busy: settlePending }}
                >
                  {settlePending ? (
                    <ActivityIndicator size="small" color={colors.textPrimary} />
                  ) : (
                    <Text style={styles.nextLotBtnText}>Create order</Text>
                  )}
                </Pressable>
              </>
            )}
            {(currentLotStatus === 'passed' || currentLotStatus === 'cancelled') && (
              <Pressable
                onPress={handleNextLot}
                disabled={lotActionPending}
                style={({ pressed }) => [styles.nextLotBtn, pressed && { opacity: 0.85 }, lotActionPending && { opacity: 0.6 }]}
                accessibilityRole="button"
                accessibilityLabel="Go to next lot"
                accessibilityState={{ busy: lotActionPending }}
              >
                {lotActionPending ? (
                  <ActivityIndicator size="small" color={colors.textPrimary} />
                ) : (
                  <Text style={styles.nextLotBtnText}>Next →</Text>
                )}
              </Pressable>
            )}
          </View>

          {/* Settlement status */}
          {currentLotStatus === 'sold' && settlementStatus !== 'none' && (
            <View style={styles.settlementRow}>
              <Text style={[styles.settlementLabel, { color: colors.textSecondary }]}>
                {settlementStatusLabel(settlementStatus)}
              </Text>
            </View>
          )}

          {/* Upcoming lots */}
          <Text style={styles.upcomingLabel}>Up Next</Text>
          <FlatList
            data={lots.slice(currentLotIndex + 1, currentLotIndex + 4)}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <View style={styles.upcomingLotRow}>
                <Image source={{ uri: item.imageUri }} style={styles.upcomingLotImage} />
                <Text style={styles.upcomingLotTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.upcomingLotPrice}>£{item.startingPrice}</Text>
              </View>
            )}
            scrollEnabled={false}
          />
        </View>
      </View>
    );
  }

  // ── Summary phase ──
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.summaryContainer}>
          <View style={[styles.summaryIcon, { backgroundColor: colors.successSubtle }]}>
            <Ionicons name="checkmark-circle" size={48} color={colors.success} />
          </View>
          <Text style={[styles.summaryTitle, { color: colors.textPrimary }]}>Stream Ended</Text>

          {endError && (
            <View style={[styles.summaryWarningBanner, { backgroundColor: colors.warningSubtle }]}>
              <Ionicons name="alert-circle-outline" size={16} color={colors.warning} />
              <Text style={[styles.summaryWarningText, { color: colors.warning }]}>{endError}</Text>
            </View>
          )}

          {isDemo && (
            <View style={[styles.summaryDemoBadge, { backgroundColor: colors.warningSubtle }]}>
              <Ionicons name="flask-outline" size={14} color={colors.warning} />
              <Text style={[styles.summaryDemoText, { color: colors.warning }]}>Demo Mode — mock figures</Text>
            </View>
          )}

          <View style={[styles.summaryStats, { backgroundColor: colors.surface }]}>
            <View style={styles.summaryStatItem}>
              <Text style={[styles.summaryStatValue, { color: colors.textPrimary }]}>{viewerCount}</Text>
              <Text style={[styles.summaryStatLabel, { color: colors.textSecondary }]}>Peak Viewers</Text>
            </View>
            <View style={[styles.summaryStatDivider, { backgroundColor: colors.border }]} />
            <View style={styles.summaryStatItem}>
              <Text style={[styles.summaryStatValue, { color: colors.textPrimary }]}>{lotsSold}</Text>
              <Text style={[styles.summaryStatLabel, { color: colors.textSecondary }]}>Lots Sold</Text>
            </View>
            <View style={[styles.summaryStatDivider, { backgroundColor: colors.border }]} />
            <View style={styles.summaryStatItem}>
              <Text style={[styles.summaryStatValue, { color: colors.textPrimary }]}>£{totalSales}</Text>
              <Text style={[styles.summaryStatLabel, { color: colors.textSecondary }]}>Total Sales</Text>
            </View>
          </View>

          <View style={styles.summaryActions}>
            <Pressable
              onPress={() => navigation.goBack()}
              style={({ pressed }) => [styles.summaryDoneBtn, { backgroundColor: colors.brand }, pressed && { opacity: 0.85 }]}
              accessibilityRole="button"
              accessibilityLabel="Done"
            >
              <Text style={styles.summaryDoneBtnText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const SCREEN_WIDTH = Dimensions.get('window').width;

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  // ── Setup ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  backBtn: {
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
  },
  setupScroll: { flex: 1 },
  setupContent: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.xl,
    gap: Space.lg,
  },
  cameraPreview: {
    width: '100%',
    aspectRatio: 9 / 16,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs,
    maxHeight: 300,
  },
  cameraPreviewText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
  },
  inputGroup: { gap: Space.xs + 2 },
  inputLabel: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
  },
  titleInput: {
    height: Space.xl + Space.sm + 6,
    paddingHorizontal: Space.md,
    borderRadius: Radius.lg,
    borderWidth: Stroke.standard,
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
  },
  lotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs + 2,
    borderRadius: Radius.md,
    borderWidth: Stroke.hairline,
    marginBottom: Space.xs,
  },
  lotNumber: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    fontVariant: ['tabular-nums'],
    minWidth: Space.lg,
  },
  lotImage: {
    width: Space.xl + Space.xs,
    height: Space.xl + Space.xs,
    borderRadius: Radius.sm,
    backgroundColor: colors.border,
  },
  lotInfo: { flex: 1, gap: Space.xs / 4 },
  lotTitle: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
  },
  lotPrice: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
  },
  demoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderRadius: Radius.md,
  },
  demoBannerText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
  },
  emptyLots: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs,
    paddingVertical: Space.xl,
    borderRadius: Radius.lg,
    borderWidth: Stroke.hairline,
    borderStyle: 'dashed',
  },
  emptyLotsText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
  },
  emptyLotsSubtext: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    textAlign: 'center',
  },
  setupFooter: {
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
  },
  setupErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderRadius: Radius.md,
    marginBottom: Space.md,
  },
  setupErrorText: {
    flex: 1,
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
  },
  goLiveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs + 2,
    paddingVertical: Space.md + 2,
    borderRadius: Radius.xxl,
    backgroundColor: colors.danger,
    minHeight: Control.hit + 4,
  },
  goLiveBtnDisabled: {
    opacity: 0.4,
  },
  goLiveBtnText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.bold,
    color: colors.textPrimary,
  },
  liveDot: {
    width: Space.sm,
    height: Space.sm,
    borderRadius: Radius.full,
    backgroundColor: colors.textPrimary,
  },
  // ── Live ──
  sellerCameraPreview: {
    width: SCREEN_WIDTH,
    height: Space.xxl * 4 + Space.sm,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs,
  },
  sellerCameraText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
    color: colors.textMuted,
  },
  liveBadgeSmall: {
    position: 'absolute',
    top: Space.sm,
    left: Space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs / 2,
    backgroundColor: colors.danger,
    paddingHorizontal: Space.xs + 2,
    paddingVertical: Space.xs / 2 + 1,
    borderRadius: Radius.sm,
  },
  liveBadgeTextSmall: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.bold,
    color: colors.textPrimary,
  },
  sellerStatsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    backgroundColor: colors.surface,
  },
  sellerStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs / 2,
  },
  sellerStatText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
    color: colors.textSecondary,
  },
  endStreamBtn: {
    marginLeft: 'auto',
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs + 2,
    borderRadius: Radius.sm,
    backgroundColor: colors.danger,
  },
  endStreamBtnText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
  },
  sellerCurrentLot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderTopWidth: Stroke.hairline,
    borderTopColor: colors.border,
  },
  sellerLotImage: {
    width: Space.xxl + Space.xl,
    height: Space.xxl + Space.xl,
    borderRadius: Radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  sellerLotInfo: { flex: 1, gap: Space.xs / 2 },
  sellerLotTitle: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
  },
  sellerLotPrice: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.bold,
    color: colors.textPrimary,
  },
  sellerLotStatusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs / 2 + 1,
    borderRadius: Radius.sm,
    marginTop: Space.xs / 2,
  },
  sellerLotStatusText: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.label.letterSpacing,
  },
  settlementRow: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs,
  },
  settlementLabel: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
  },
  sellerLotActions: {
    flexDirection: 'row',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  skipLotBtn: {
    flex: 1,
    paddingVertical: Space.md,
    borderRadius: Radius.lg,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    minHeight: Control.hit,
    justifyContent: 'center',
  },
  skipLotBtnText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
  },
  nextLotBtn: {
    flex: 2,
    paddingVertical: Space.md,
    borderRadius: Radius.lg,
    backgroundColor: colors.danger,
    alignItems: 'center',
    minHeight: Control.hit,
    justifyContent: 'center',
  },
  nextLotBtnText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.bold,
    color: colors.textPrimary,
  },
  upcomingLabel: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    color: colors.textMuted,
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.xs,
    textTransform: 'uppercase',
    letterSpacing: LetterSpacing.caps,
  },
  upcomingLotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs + 2,
  },
  upcomingLotImage: {
    width: Space.xl + Space.xs,
    height: Space.xl + Space.xs,
    borderRadius: Radius.sm,
    backgroundColor: colors.surfaceAlt,
  },
  upcomingLotTitle: {
    flex: 1,
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    color: colors.textPrimary,
  },
  upcomingLotPrice: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: colors.textSecondary,
  },
  // ── Summary ──
  summaryContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.xl,
    gap: Space.md,
  },
  summaryIcon: {
    width: Space.xxl + Space.xxl + Space.xs,
    height: Space.xxl + Space.xxl + Space.xs,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryTitle: {
    fontSize: Type.title.size,
    fontFamily: Typography.family.bold,
  },
  summaryWarningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderRadius: Radius.md,
    width: '100%',
  },
  summaryWarningText: {
    flex: 1,
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
  },
  summaryDemoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.sm + 2,
    paddingVertical: Space.xs + 2,
    borderRadius: Radius.full,
  },
  summaryDemoText: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
  },
  summaryStats: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.lg,
    paddingVertical: Space.lg,
    width: '100%',
  },
  summaryStatItem: {
    flex: 1,
    alignItems: 'center',
    gap: Space.xs / 2,
  },
  summaryStatValue: {
    fontSize: Type.title.size,
    fontFamily: Typography.family.bold,
  },
  summaryStatLabel: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
  },
  summaryStatDivider: {
    width: Stroke.hairline,
    height: Space.xxl + Space.xs,
  },
  summaryActions: {
    width: '100%',
    paddingTop: Space.md,
  },
  summaryDoneBtn: {
    paddingVertical: Space.md + 2,
    borderRadius: Radius.xxl,
    alignItems: 'center',
    minHeight: Control.hit + 4,
    justifyContent: 'center',
  },
  summaryDoneBtnText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.bold,
    color: colors.textPrimary,
  },
});
