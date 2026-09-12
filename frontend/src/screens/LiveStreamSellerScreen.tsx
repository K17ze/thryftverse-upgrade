/**
 * LiveStreamSellerScreen — broadcaster experience.
 *
 * Three phases: setup → live → summary.
 *
 * Truthful UI (AGENTS §11):
 * - Lots are the seller's real active listings, scheduled onto the session
 *   through the backend lot engine — no demo lots, no simulated go-live.
 * - The camera surface is a local framing preview (BroadcastPreview). Video
 *   publishing to the LiveKit room is not wired in the shared streaming
 *   layer yet, so the surface is labelled as a preview, not a broadcast.
 * - Session lifecycle goes through the real backend routes
 *   (components/live/liveBroadcastApi). When session creation fails, the
 *   screen reports the error — it never pretends to be live.
 * - Viewer count, chat and bid events come from realtime subscriptions.
 *   Metrics that are not reported (likes, earnings mid-stream) are omitted.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  ScrollView,
  StatusBar,
  ActivityIndicator,
  useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { useHaptic } from '../hooks/useHaptic';
import { useToast } from '../context/ToastContext';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useConnectivity } from '../hooks/useConnectivity';
import { useStore } from '../store/useStore';
import { Space, Radius, Control, Stroke } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { CachedImage } from '../components/CachedImage';
import { AppIcon } from '../components/common/AppIcon';
import { IconSize } from '../theme/iconTokens';
import { OfflineBanner } from '../components/OfflineBanner';
import {
  FlagshipScreen,
  FlagshipHeader,
  FlagshipState,
  FlagshipMetricLine,
  SkeletonBlock,
  SkeletonTextLine } from '../components/flagship';
import { BroadcastPreview } from '../components/live/BroadcastPreview';
import { LiveBadge } from '../components/live/LiveBadge';
import { useLiveKitRoom } from '../platform/streaming';
import { fetchUserListingsFromApi, type ListingApiItem } from '../services/listingsApi';
import {
  createBroadcastSession,
  startBroadcastSession,
  endBroadcastSession,
  fetchBroadcastSession,
  fetchBroadcastHostToken,
  type BroadcastSession } from '../components/live/liveBroadcastApi';
import {
  scheduleLot,
  openLot,
  closeLot,
  cancelLot,
  settleLot,
  fetchSessionLots,
  setCurrentLot,
  subscribeToChat,
  subscribeToViewerCount,
  subscribeToStreamEvents,
  fetchStreamChatHistory,
  type LiveLotAggregate,
  type LiveStreamChatMessage,
  type LotStatus,
  type LotSettlementStatus } from '../services/liveShoppingApi';

// ---------------------------------------------------------------------------
// Types & helpers
// ---------------------------------------------------------------------------

type SellerPhase = 'setup' | 'live' | 'summary';

type LiveStreamSellerRoute = RouteProp<RootStackParamList, 'LiveStreamSeller'>;
type NavT = NativeStackNavigationProp<RootStackParamList>;

function lotStatusLabel(status: LotStatus): string {
  switch (status) {
    case 'scheduled': return 'Scheduled';
    case 'open': return 'Open for bidding';
    case 'closing': return 'Closing soon';
    case 'sold': return 'Sold';
    case 'passed': return 'Passed';
    case 'cancelled': return 'Cancelled';
  }
}

function lotStatusColor(status: LotStatus, colors: ThemeColors): string {
  switch (status) {
    case 'open':
    case 'sold':
      return colors.success;
    case 'closing':
      return colors.warning;
    case 'scheduled':
      return colors.textSecondary;
    default:
      return colors.textMuted;
  }
}

function settlementLabel(status: LotSettlementStatus | null): string | null {
  switch (status) {
    case 'settling': return 'Settling…';
    case 'order_created': return 'Order created';
    case 'payment_reserved': return 'Payment pending';
    case 'payment_failed': return 'Payment failed';
    case 'completed': return 'Completed';
    default: return null;
  }
}

function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LiveStreamSellerScreen() {
  const navigation = useNavigation<NavT>();
  const route = useRoute<LiveStreamSellerRoute>();
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const { show } = useToast();
  const { currencySymbol, formatFromFiat } = useFormattedPrice();
  const { isOffline } = useConnectivity();
  const insets = useSafeAreaInsets();
  const { height: SCREEN_HEIGHT } = useWindowDimensions();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const currentUser = useStore((s) => s.currentUser);

  const resumeSessionId = route.params?.sessionId;

  // ── Phase & setup state ──
  const [phase, setPhase] = useState<SellerPhase>('setup');
  const [title, setTitle] = useState('');
  const [listings, setListings] = useState<ListingApiItem[] | null>(null);
  const [listingsLoading, setListingsLoading] = useState(true);
  const [listingsError, setListingsError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [goingLive, setGoingLive] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);

  // ── Live state ──
  const [session, setSession] = useState<BroadcastSession | null>(null);
  const [lots, setLots] = useState<LiveLotAggregate[]>([]);
  const [currentLotIndex, setCurrentLotIndex] = useState(0);
  const [viewerCount, setViewerCount] = useState(0);
  const [messages, setMessages] = useState<LiveStreamChatMessage[]>([]);
  const [liveSeconds, setLiveSeconds] = useState(0);
  const [lotsSold, setLotsSold] = useState(0);
  const [totalSalesMinor, setTotalSalesMinor] = useState(0);
  const [lotActionPending, setLotActionPending] = useState(false);
  const [endingStream, setEndingStream] = useState(false);
  const [endError, setEndError] = useState<string | null>(null);
  const [settlementStatus, setSettlementStatus] = useState<LotSettlementStatus | null>(null);
  const [settlePending, setSettlePending] = useState(false);
  const [hostCredentials, setHostCredentials] = useState<{ wsUrl: string; token: string } | null>(null);

  const startedAtRef = useRef<number>(0);
  const chatListRef = useRef<FlatList<LiveStreamChatMessage>>(null);
  const sessionId = session?.roomId ?? null;

  // Host joins the LiveKit room with the host token. Publishing camera
  // frames requires publish controls in the shared streaming layer — a
  // known backend/frontend gap; the room join still keeps presence real.
  const liveKit = useLiveKitRoom(hostCredentials?.wsUrl ?? null, hostCredentials?.token ?? null);

  const currentLot = lots[currentLotIndex] ?? null;
  const selectedListings = useMemo(
    () => (listings ?? []).filter((l) => selectedIds.includes(l.id)),
    [listings, selectedIds],
  );

  // ── Load the seller's active listings for lot selection ──
  const loadListings = useCallback(async () => {
    if (!currentUser?.id) {
      setListings([]);
      setListingsLoading(false);
      return;
    }
    setListingsLoading(true);
    setListingsError(null);
    try {
      const res = await fetchUserListingsFromApi(currentUser.id, { status: 'active', limit: 50 });
      setListings(res.items ?? []);
    } catch (e) {
      setListingsError(e instanceof Error ? e.message : 'Could not load your listings');
    } finally {
      setListingsLoading(false);
    }
  }, [currentUser?.id]);

  useEffect(() => {
    void loadListings();
  }, [loadListings]);

  // ── Resume an in-progress session when the route carries one ──
  useEffect(() => {
    if (!resumeSessionId) return;
    let cancelled = false;
    (async () => {
      try {
        const existing = await fetchBroadcastSession(resumeSessionId);
        if (cancelled || !existing || existing.status !== 'live') return;
        const { lots: existingLots } = await fetchSessionLots(resumeSessionId);
        if (cancelled) return;
        setSession(existing);
        setLots(existingLots.sort((a, b) => a.lotNumber - b.lotNumber));
        setPhase('live');
        startedAtRef.current = existing.startedAt ? new Date(existing.startedAt).getTime() : Date.now();
        try {
          const token = await fetchBroadcastHostToken(resumeSessionId);
          if (!cancelled) setHostCredentials({ wsUrl: token.wsUrl, token: token.token });
        } catch {
          // Host token failure degrades to chat/lot-only control — honest,
          // the preview label below already says video is local-only.
        }
      } catch {
        // Resume is best-effort; seller stays on setup.
      }
    })();
    return () => { cancelled = true; };
  }, [resumeSessionId]);

  // ── Elapsed timer while live ──
  useEffect(() => {
    if (phase !== 'live') return;
    const interval = setInterval(() => {
      setLiveSeconds(Math.max(0, Math.floor((Date.now() - startedAtRef.current) / 1000)));
    }, 1000);
    return () => clearInterval(interval);
  }, [phase]);

  // ── Realtime subscriptions while live ──
  useEffect(() => {
    if (phase !== 'live' || !sessionId) return;

    let cancelled = false;
    void fetchStreamChatHistory(sessionId).then((history) => {
      if (!cancelled) setMessages(history);
    }).catch(() => {});

    const unsubChat = subscribeToChat(sessionId, (payload) => {
      setMessages((prev) => [...prev.slice(-80), payload.message]);
    });
    const unsubViewers = subscribeToViewerCount(sessionId, (payload) => {
      setViewerCount(payload.count);
    });
    const unsubEvents = subscribeToStreamEvents(sessionId, (event) => {
      if (event.type === 'lot_sold') {
        const payload = event.payload as { finalPrice?: number };
        const finalPrice = payload.finalPrice;
        if (typeof finalPrice === 'number') {
          setTotalSalesMinor((prev) => prev + Math.round(finalPrice * 100));
          setLotsSold((prev) => prev + 1);
        }
      }
    });

    return () => {
      cancelled = true;
      unsubChat();
      unsubViewers();
      unsubEvents();
    };
  }, [phase, sessionId]);

  // ── Actions ──

  const toggleListing = useCallback((listingId: string) => {
    haptic.selection();
    setSelectedIds((prev) =>
      prev.includes(listingId) ? prev.filter((id) => id !== listingId) : [...prev, listingId]);
  }, [haptic]);

  const handleGoLive = useCallback(async () => {
    if (selectedListings.length === 0 || goingLive) return;
    haptic.medium();
    setGoingLive(true);
    setSetupError(null);
    try {
      // 1. Create the session on the backend.
      const created = await createBroadcastSession({
        title: title.trim() || 'Live auction' });
      // 2. Schedule the selected listings as real lots.
      const scheduled: LiveLotAggregate[] = [];
      for (let i = 0; i < selectedListings.length; i += 1) {
        const listing = selectedListings[i];
        const lot = await scheduleLot(created.roomId, {
          listingId: listing.id,
          lotNumber: i + 1,
          startPriceMinor: Math.round((listing.priceGbp ?? 0) * 100) });
        scheduled.push(lot);
      }
      // 3. Point viewers at the first lot.
      try {
        await setCurrentLot(created.roomId, scheduled[0].listingId, scheduled[0].lotNumber);
      } catch {
        // Current-lot is best-effort; the seller can still open bidding.
      }
      // 4. Host token → join the LiveKit room (presence; publishing is a
      //    shared-layer gap — see file header).
      try {
        const token = await fetchBroadcastHostToken(created.roomId);
        setHostCredentials({ wsUrl: token.wsUrl, token: token.token });
      } catch {
        // Degrade honestly: lots/chat still work without media.
      }
      // 5. Flip the session to live.
      const started = await startBroadcastSession(created.roomId);
      setSession(started);
      setLots(scheduled);
      setCurrentLotIndex(0);
      setViewerCount(0);
      setMessages([]);
      setLotsSold(0);
      setTotalSalesMinor(0);
      setSettlementStatus(null);
      startedAtRef.current = started.startedAt
        ? new Date(started.startedAt).getTime()
        : Date.now();
      setPhase('live');
      haptic.success();
    } catch (e) {
      setSetupError(e instanceof Error ? e.message : 'Could not start the stream — try again.');
      haptic.error();
    } finally {
      setGoingLive(false);
    }
  }, [selectedListings, goingLive, haptic, title]);

  const handleOpenLot = useCallback(async () => {
    if (!sessionId || !currentLot || lotActionPending) return;
    setLotActionPending(true);
    haptic.medium();
    try {
      const updated = await openLot(sessionId, currentLot.id);
      setLots((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
      setSettlementStatus(null);
    } catch {
      show('Could not open bidding — try again.', 'error');
      haptic.error();
    } finally {
      setLotActionPending(false);
    }
  }, [sessionId, currentLot, lotActionPending, haptic, show]);

  const handleCloseLot = useCallback(async () => {
    if (!sessionId || !currentLot || lotActionPending) return;
    setLotActionPending(true);
    haptic.medium();
    try {
      const result = await closeLot(sessionId, currentLot.id);
      setLots((prev) => prev.map((l) => (l.id === result.id ? { ...l, ...result } : l)));
      setSettlementStatus(result.settlementStatus ?? null);
      if (result.status === 'sold' && result.highBidMinor > 0) {
        setLotsSold((prev) => prev + 1);
        setTotalSalesMinor((prev) => prev + result.highBidMinor);
      }
      haptic.success();
    } catch {
      show('Could not close the lot — try again.', 'error');
      haptic.error();
    } finally {
      setLotActionPending(false);
    }
  }, [sessionId, currentLot, lotActionPending, haptic, show]);

  const handleCancelLot = useCallback(async () => {
    if (!sessionId || !currentLot || lotActionPending) return;
    setLotActionPending(true);
    haptic.light();
    try {
      const updated = await cancelLot(sessionId, currentLot.id);
      setLots((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
    } catch {
      show('Could not cancel the lot — try again.', 'error');
      haptic.error();
    } finally {
      setLotActionPending(false);
    }
  }, [sessionId, currentLot, lotActionPending, haptic, show]);

  const handleNextLot = useCallback(async () => {
    if (!sessionId || lotActionPending) return;
    const nextIndex = currentLotIndex + 1;
    const next = lots[nextIndex];
    if (!next) return;
    setLotActionPending(true);
    haptic.light();
    try {
      await setCurrentLot(sessionId, next.listingId, next.lotNumber);
      setCurrentLotIndex(nextIndex);
      setSettlementStatus(null);
    } catch {
      show('Could not move to the next lot — try again.', 'error');
      haptic.error();
    } finally {
      setLotActionPending(false);
    }
  }, [sessionId, lots, currentLotIndex, lotActionPending, haptic, show]);

  const handleSettleLot = useCallback(async () => {
    if (!sessionId || !currentLot || settlePending) return;
    setSettlePending(true);
    haptic.medium();
    try {
      const result = await settleLot(sessionId, currentLot.id);
      setSettlementStatus(result.status);
      haptic.success();
    } catch {
      show('Could not settle the lot — try again.', 'error');
      haptic.error();
    } finally {
      setSettlePending(false);
    }
  }, [sessionId, currentLot, settlePending, haptic, show]);

  const handleEndStream = useCallback(async () => {
    if (endingStream) return;
    haptic.medium();
    setEndingStream(true);
    setEndError(null);
    try {
      if (sessionId) {
        await endBroadcastSession(sessionId);
      }
      setPhase('summary');
    } catch {
      // Honest unknown outcome — the session may already be closed server-
      // side. Surface the error and stay on the live surface so the seller
      // can retry rather than fabricating a clean end.
      setEndError('End of stream could not be confirmed — check before going live again.');
      haptic.error();
    } finally {
      setEndingStream(false);
    }
  }, [sessionId, endingStream, haptic]);

  const renderChatMessage = useCallback(({ item }: { item: LiveStreamChatMessage }) => {
    const isSystem = item.type === 'system' || item.type === 'bid' || item.type === 'purchase';
    return (
      <View style={[styles.chatRow, { borderBottomColor: colors.border }]}>
        {isSystem ? (
          <Text style={[styles.chatSystemText, { color: colors.textMuted }]} numberOfLines={2}>
            {item.message}
          </Text>
        ) : (
          <Text style={styles.chatLine} numberOfLines={2}>
            <Text style={[styles.chatSender, { color: colors.textMuted }]}>
              {item.userName}{'  '}
            </Text>
            <Text style={[styles.chatText, { color: colors.textPrimary }]}>{item.message}</Text>
          </Text>
        )}
      </View>
    );
  }, [colors, styles]);

  // =========================================================================
  // SETUP PHASE
  // =========================================================================

  if (phase === 'setup') {
    const showListingsLoading = listingsLoading && listings == null;
    const showListingsError = !listingsLoading && listingsError != null;
    const showListingsEmpty = !listingsLoading && !listingsError && listings != null && listings.length === 0;

    return (
      <FlagshipScreen
        testID="live-seller-setup"
        header={
          <FlagshipHeader
            title="Go live"
            onBack={() => navigation.goBack()}
          />
        }
        scrollEnabled={false}
        contentStyle={styles.flushContent}
        stickyFooter={
          <View style={[styles.footer, { paddingBottom: insets.bottom || Space.sm }]}>
            {setupError ? (
              <Text style={[styles.footerError, { color: colors.danger }]}>{setupError}</Text>
            ) : null}
            <AnimatedPressable
              onPress={handleGoLive}
              disabled={selectedIds.length === 0 || goingLive || isOffline}
              style={[
                styles.goLiveBtn,
                { backgroundColor: colors.danger },
                (selectedIds.length === 0 || goingLive || isOffline) && { opacity: 0.45 },
              ]}
              hapticFeedback="medium"
              accessibilityRole="button"
              accessibilityLabel="Go live"
              accessibilityState={{ disabled: selectedIds.length === 0 || goingLive || isOffline, busy: goingLive }}
            >
              {goingLive ? (
                <ActivityIndicator size="small" color={colors.textInverse} />
              ) : (
                <Text style={[styles.goLiveBtnText, { color: colors.textInverse }]}>Go live</Text>
              )}
            </AnimatedPressable>
          </View>
        }
      >
        <OfflineBanner onRetry={loadListings} />
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.setupScroll}
        >
          {/* Local camera preview — honest label, real device feed */}
          <BroadcastPreview
            active
            facing="back"
            height={Math.round(SCREEN_HEIGHT * 0.32)}
            accessibilityLabel="Local camera preview"
          />
          <Text style={[styles.previewCaption, { color: colors.textMuted }]}>
            Camera preview — check framing before you go live
          </Text>

          {/* Stream title */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Stream title</Text>
            <TextInput
              style={[styles.titleInput, { color: colors.textPrimary, borderBottomColor: colors.border }]}
              placeholder="e.g. Vintage finds live auction"
              placeholderTextColor={colors.textMuted}
              value={title}
              onChangeText={(text) => { setTitle(text); setSetupError(null); }}
              maxLength={60}
              accessibilityLabel="Stream title"
            />
          </View>

          {/* Lot selection — real active listings */}
          <View style={styles.fieldGroup}>
            <View style={styles.lotHeaderRow}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                Lots{selectedIds.length > 0 ? ` · ${selectedIds.length} selected` : ''}
              </Text>
            </View>

            {showListingsLoading && (
              <View>
                {Array.from({ length: 4 }).map((_, i) => (
                  <View key={`lot-skel-${i}`} style={[styles.lotSelectRow, { borderBottomColor: colors.border }]}>
                    <SkeletonBlock width={48} height={48} radius={Radius.md} />
                    <View style={styles.lotSelectInfo}>
                      <SkeletonTextLine width="65%" height={14} />
                      <SkeletonTextLine width="30%" height={12} />
                    </View>
                  </View>
                ))}
              </View>
            )}

            {showListingsError && (
              <FlagshipState
                variant={isOffline ? 'offline' : 'error'}
                title="Listings unavailable"
                subtitle={listingsError ?? undefined}
                actionLabel="Try again"
                onAction={loadListings}
              />
            )}

            {showListingsEmpty && (
              <FlagshipState
                variant="empty"
                icon="pricetag-outline"
                title="No active listings"
                subtitle="List an item first — only your active listings can be sold live."
                actionLabel="Create a listing"
                onAction={() => navigation.navigate('Sell')}
              />
            )}

            {listings != null && listings.length > 0 && (
              <View>
                {listings.map((listing) => {
                  const selected = selectedIds.includes(listing.id);
                  const order = selectedIds.indexOf(listing.id);
                  return (
                    <AnimatedPressable
                      key={listing.id}
                      onPress={() => toggleListing(listing.id)}
                      style={[styles.lotSelectRow, { borderBottomColor: colors.border }]}
                      hapticFeedback="selection"
                      scaleValue={0.99}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected }}
                      accessibilityLabel={`${listing.title}, ${currencySymbol}${listing.priceGbp}`}
                    >
                      {listing.imageUrl || listing.images?.[0] ? (
                        <CachedImage
                          uri={listing.imageUrl ?? listing.images[0]}
                          style={styles.lotSelectThumb}
                          contentFit="cover"
                          accessible={false}
                        />
                      ) : (
                        <View style={[styles.lotSelectThumb, styles.lotSelectThumbFallback, { backgroundColor: colors.surfaceAlt }]}>
                          <AppIcon name="image" size={IconSize.sm} color="textMuted" accessible={false} />
                        </View>
                      )}
                      <View style={styles.lotSelectInfo}>
                        <Text style={[styles.lotSelectTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                          {listing.title}
                        </Text>
                        <Text style={[styles.lotSelectPrice, { color: colors.textSecondary }]}>
                          {formatFromFiat(listing.priceGbp, 'GBP')}
                        </Text>
                      </View>
                      {selected ? (
                        <View style={[styles.lotOrderMark, { borderColor: colors.brand }]}>
                          <Text style={[styles.lotOrderText, { color: colors.brand }]}>{order + 1}</Text>
                        </View>
                      ) : (
                        <View style={[styles.lotOrderMark, { borderColor: colors.border }]} />
                      )}
                    </AnimatedPressable>
                  );
                })}
              </View>
            )}
          </View>
        </ScrollView>
      </FlagshipScreen>
    );
  }

  // =========================================================================
  // SUMMARY PHASE
  // =========================================================================

  if (phase === 'summary') {
    return (
      <FlagshipScreen
        testID="live-seller-summary"
        header={<FlagshipHeader title="Stream ended" onBack={() => navigation.goBack()} />}
        scrollEnabled={false}
        contentStyle={styles.flushContent}
      >
        <View style={styles.summaryWrap}>
          <AppIcon name="check" variant="filled" size={IconSize.display} color="success" accessible={false} />
          <Text style={[styles.summaryTitle, { color: colors.textPrimary }]} accessibilityRole="header">
            Stream ended
          </Text>
          <View style={styles.summaryStats}>
            <FlagshipMetricLine
              label="Viewers"
              value={String(viewerCount)}
              separated
            />
            <FlagshipMetricLine
              label="Lots sold"
              value={String(lotsSold)}
              separated
            />
            <FlagshipMetricLine
              label="Total sales"
              value={formatFromFiat(totalSalesMinor / 100, 'GBP') ?? ''}
              separated
            />
          </View>
          <AnimatedPressable
            onPress={() => navigation.goBack()}
            style={[styles.goLiveBtn, { backgroundColor: colors.brand }]}
            hapticFeedback="light"
            accessibilityRole="button"
            accessibilityLabel="Done"
          >
            <Text style={[styles.goLiveBtnText, { color: colors.textInverse }]}>Done</Text>
          </AnimatedPressable>
        </View>
      </FlagshipScreen>
    );
  }

  // =========================================================================
  // LIVE PHASE
  // =========================================================================

  const nextLot = lots[currentLotIndex + 1] ?? null;
  const remainingLots = lots.filter((l) => l.status === 'scheduled').length;
  const canOpen = currentLot?.status === 'scheduled';
  const canClose = currentLot?.status === 'open' || currentLot?.status === 'closing';
  const lotClosed = currentLot != null && ['sold', 'passed', 'cancelled'].includes(currentLot.status);
  const needsSettle = currentLot?.status === 'sold' && (settlementStatus == null || settlementStatus === 'none');
  const allDone = lotClosed && !nextLot;

  return (
    <FlagshipScreen
      testID="live-seller-live"
      header={
        <FlagshipHeader
          title={session?.title || 'Live'}
          subtitle={session?.status === 'live' ? undefined : 'Starting…'}
          rightAction={
            <AnimatedPressable
              onPress={handleEndStream}
              disabled={endingStream}
              style={styles.endHit}
              hapticFeedback="medium"
              accessibilityRole="button"
              accessibilityLabel="End stream"
              accessibilityState={{ busy: endingStream }}
            >
              {endingStream ? (
                <ActivityIndicator size="small" color={colors.danger} />
              ) : (
                <Text style={[styles.endText, { color: colors.danger }]}>End</Text>
              )}
            </AnimatedPressable>
          }
        />
      }
      scrollEnabled={false}
      contentStyle={styles.flushContent}
    >
      <View style={styles.liveWrap}>
        {/* Camera — dominant object. Local preview only; publishing is a
            shared-layer gap, so the label stays honest. */}
        <View style={styles.previewWrap}>
          <BroadcastPreview
            active
            facing="back"
            height={Math.round(SCREEN_HEIGHT * 0.3)}
            accessibilityLabel="Local camera preview"
          />
          <View style={styles.liveChromeRow}>
            <LiveBadge compact label="Live" />
            <View style={styles.liveMetaCluster}>
              <View style={styles.liveMetaItem}>
                <AppIcon name="eye" size={IconSize.xs} color="textSecondary" accessible={false} />
                <Text style={[styles.liveMetaText, { color: colors.textSecondary }]}>
                  {viewerCount}
                </Text>
              </View>
              <View style={styles.liveMetaItem}>
                <AppIcon name="clock" size={IconSize.xs} color="textSecondary" accessible={false} />
                <Text style={[styles.liveMetaText, { color: colors.textSecondary }]}>
                  {formatClock(liveSeconds)}
                </Text>
              </View>
            </View>
          </View>
          <Text style={[styles.previewCaption, { color: colors.textMuted }]}>
            {liveKit.state === 'connected'
              ? 'Local preview — camera publishing is not wired in this build'
              : 'Local camera preview'}
          </Text>
          {endError ? (
            <Text style={[styles.footerError, { color: colors.danger, paddingHorizontal: 0 }]}>
              {endError}
            </Text>
          ) : null}
        </View>

        {/* Lot command — flat panel, status + real actions */}
        {currentLot ? (
          <View style={[styles.lotPanel, { borderColor: colors.border }]}>
            <View style={styles.lotPanelTop}>
              {currentLot.snapshot?.imageUrl ? (
                <CachedImage
                  uri={currentLot.snapshot.imageUrl}
                  style={styles.lotPanelThumb}
                  contentFit="cover"
                  accessible={false}
                />
              ) : null}
              <View style={styles.lotPanelInfo}>
                <Text style={[styles.lotPanelTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                  {currentLot.snapshot?.title ?? `Lot ${currentLot.lotNumber}`}
                </Text>
                <View style={styles.lotPanelMetaRow}>
                  <Text style={[styles.lotPanelPrice, { color: colors.textPrimary }]}>
                    {formatFromFiat((currentLot.highBidMinor > 0 ? currentLot.highBidMinor : currentLot.startPriceMinor) / 100, 'GBP')}
                  </Text>
                  <Text style={[styles.lotPanelStatus, { color: lotStatusColor(currentLot.status, colors) }]}>
                    {lotStatusLabel(currentLot.status)}
                  </Text>
                </View>
                {settlementLabel(settlementStatus) ? (
                  <Text style={[styles.lotPanelSettle, { color: colors.textSecondary }]}>
                    {settlementLabel(settlementStatus)}
                  </Text>
                ) : null}
              </View>
              <Text style={[styles.lotPanelIndex, { color: colors.textMuted }]}>
                {currentLotIndex + 1}/{lots.length}
              </Text>
            </View>

            {/* Actions — real lot engine transitions only */}
            <View style={styles.lotActionsRow}>
              {canOpen && (
                <AnimatedPressable
                  onPress={handleOpenLot}
                  disabled={lotActionPending}
                  style={[styles.lotActionBtn, { backgroundColor: colors.brand }]}
                  hapticFeedback="medium"
                  accessibilityRole="button"
                  accessibilityLabel="Open bidding"
                  accessibilityState={{ busy: lotActionPending }}
                >
                  {lotActionPending ? (
                    <ActivityIndicator size="small" color={colors.textInverse} />
                  ) : (
                    <Text style={[styles.lotActionText, { color: colors.textInverse }]}>Open bidding</Text>
                  )}
                </AnimatedPressable>
              )}
              {canClose && (
                <>
                  <AnimatedPressable
                    onPress={handleCloseLot}
                    disabled={lotActionPending}
                    style={[styles.lotActionBtn, { backgroundColor: colors.brand }]}
                    hapticFeedback="medium"
                    accessibilityRole="button"
                    accessibilityLabel="Close lot"
                    accessibilityState={{ busy: lotActionPending }}
                  >
                    {lotActionPending ? (
                      <ActivityIndicator size="small" color={colors.textInverse} />
                    ) : (
                      <Text style={[styles.lotActionText, { color: colors.textInverse }]}>Close lot</Text>
                    )}
                  </AnimatedPressable>
                  <AnimatedPressable
                    onPress={handleCancelLot}
                    disabled={lotActionPending}
                    style={[styles.lotActionGhost, { borderColor: colors.border }]}
                    hapticFeedback="light"
                    accessibilityRole="button"
                    accessibilityLabel="Cancel lot"
                  >
                    <Text style={[styles.lotActionGhostText, { color: colors.textSecondary }]}>Cancel</Text>
                  </AnimatedPressable>
                </>
              )}
              {lotClosed && needsSettle && (
                <AnimatedPressable
                  onPress={handleSettleLot}
                  disabled={settlePending}
                  style={[styles.lotActionBtn, { backgroundColor: colors.brand }]}
                  hapticFeedback="medium"
                  accessibilityRole="button"
                  accessibilityLabel="Settle lot"
                  accessibilityState={{ busy: settlePending }}
                >
                  {settlePending ? (
                    <ActivityIndicator size="small" color={colors.textInverse} />
                  ) : (
                    <Text style={[styles.lotActionText, { color: colors.textInverse }]}>Settle</Text>
                  )}
                </AnimatedPressable>
              )}
              {lotClosed && nextLot && (
                <AnimatedPressable
                  onPress={handleNextLot}
                  disabled={lotActionPending}
                  style={[styles.lotActionBtn, { backgroundColor: colors.brand }]}
                  hapticFeedback="medium"
                  accessibilityRole="button"
                  accessibilityLabel={`Next lot: ${nextLot.snapshot?.title ?? `Lot ${nextLot.lotNumber}`}`}
                  accessibilityState={{ busy: lotActionPending }}
                >
                  {lotActionPending ? (
                    <ActivityIndicator size="small" color={colors.textInverse} />
                  ) : (
                    <Text style={[styles.lotActionText, { color: colors.textInverse }]}>
                      Next lot
                    </Text>
                  )}
                </AnimatedPressable>
              )}
              {allDone && (
                <AnimatedPressable
                  onPress={handleEndStream}
                  disabled={endingStream}
                  style={[styles.lotActionBtn, { backgroundColor: colors.danger }]}
                  hapticFeedback="medium"
                  accessibilityRole="button"
                  accessibilityLabel="End stream"
                  accessibilityState={{ busy: endingStream }}
                >
                  <Text style={[styles.lotActionText, { color: colors.textInverse }]}>End stream</Text>
                </AnimatedPressable>
              )}
            </View>

            {remainingLots > 0 && (
              <Text style={[styles.queueText, { color: colors.textMuted }]}>
                {remainingLots} lot{remainingLots === 1 ? '' : 's'} in queue
              </Text>
            )}
          </View>
        ) : null}

        {/* Chat — flat list with hairlines, read-only for the host */}
        <FlatList
          ref={chatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderChatMessage}
          style={styles.chatList}
          contentContainerStyle={styles.chatListContent}
          onContentSizeChange={() => chatListRef.current?.scrollToEnd({ animated: false })}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <Text style={[styles.chatEmptyText, { color: colors.textMuted }]}>
              Viewer chat appears here
            </Text>
          }
        />
      </View>
    </FlagshipScreen>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  flushContent: {
    paddingHorizontal: 0,
    paddingTop: 0 },
  // ── Setup ──
  setupScroll: {
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
    paddingBottom: Space.xl,
    gap: Space.sm },
  previewCaption: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    textAlign: 'center' },
  fieldGroup: {
    gap: Space.xs,
    marginTop: Space.sm },
  fieldLabel: {
    fontSize: TypographyV2.label.size,
    fontFamily: TypographyV2.label.fontFamily,
    letterSpacing: TypographyV2.label.letterSpacing },
  titleInput: {
    minHeight: Control.hit,
    borderBottomWidth: Stroke.standard,
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    paddingVertical: Space.xs },
  lotHeaderRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between' },
  lotSelectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    minHeight: Control.hit + Space.sm,
    paddingVertical: Space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth },
  lotSelectThumb: {
    width: Space.xxl,
    height: Space.xxl,
    borderRadius: Radius.md,
    overflow: 'hidden' },
  lotSelectThumbFallback: {
    alignItems: 'center',
    justifyContent: 'center' },
  lotSelectInfo: {
    flex: 1,
    gap: 2 },
  lotSelectTitle: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily },
  lotSelectPrice: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    fontVariant: ['tabular-nums'] },
  lotOrderMark: {
    width: IconSize.lg,
    height: IconSize.lg,
    borderRadius: Radius.full,
    borderWidth: Stroke.emphasis,
    alignItems: 'center',
    justifyContent: 'center' },
  lotOrderText: {
    fontSize: TypographyV2.caption.size,
    fontFamily: TypographyV2.caption.fontFamily,
    fontVariant: ['tabular-nums'] },
  footer: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    gap: Space.xs },
  footerError: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    textAlign: 'center' },
  goLiveBtn: {
    minHeight: Control.hit,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center' },
  goLiveBtnText: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily },
  // ── Live ──
  liveWrap: {
    flex: 1 },
  previewWrap: {
    paddingHorizontal: Space.md,
    paddingTop: Space.xs,
    gap: Space.xs },
  liveChromeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between' },
  liveMetaCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md },
  liveMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs / 2 },
  liveMetaText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    fontVariant: ['tabular-nums'] },
  endHit: {
    minWidth: Control.hit,
    minHeight: Control.hit,
    alignItems: 'center',
    justifyContent: 'center' },
  endText: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily },
  // ── Lot panel ──
  lotPanel: {
    marginHorizontal: Space.md,
    marginTop: Space.sm,
    padding: Space.sm,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: Space.sm },
  lotPanelTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm },
  lotPanelThumb: {
    width: Space.xxl,
    height: Space.xxl,
    borderRadius: Radius.md },
  lotPanelInfo: {
    flex: 1,
    gap: 2 },
  lotPanelTitle: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily },
  lotPanelMetaRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Space.sm },
  lotPanelPrice: {
    fontSize: TypographyV2.priceList.size,
    fontFamily: TypographyV2.priceList.fontFamily,
    fontVariant: ['tabular-nums'] },
  lotPanelStatus: {
    fontSize: TypographyV2.label.size,
    fontFamily: TypographyV2.label.fontFamily,
    letterSpacing: TypographyV2.label.letterSpacing },
  lotPanelSettle: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },
  lotPanelIndex: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    fontVariant: ['tabular-nums'] },
  lotActionsRow: {
    flexDirection: 'row',
    gap: Space.sm },
  lotActionBtn: {
    flex: 1,
    minHeight: Control.hit,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center' },
  lotActionText: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily },
  lotActionGhost: {
    minHeight: Control.hit,
    paddingHorizontal: Space.md,
    borderRadius: Radius.md,
    borderWidth: Stroke.standard,
    alignItems: 'center',
    justifyContent: 'center' },
  lotActionGhostText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily },
  queueText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    textAlign: 'center' },
  // ── Chat ──
  chatList: {
    flex: 1,
    marginTop: Space.sm },
  chatListContent: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.lg },
  chatRow: {
    paddingVertical: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth },
  chatLine: {
    flexShrink: 1 },
  chatSender: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },
  chatText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    lineHeight: TypographyV2.body.lineHeight },
  chatSystemText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    fontStyle: 'italic' },
  chatEmptyText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    textAlign: 'center',
    paddingVertical: Space.lg },
  // ── Summary ──
  summaryWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.xl,
    gap: Space.md },
  summaryTitle: {
    fontSize: TypographyV2.sectionTitle.size,
    fontFamily: TypographyV2.sectionTitle.fontFamily,
    letterSpacing: TypographyV2.sectionTitle.letterSpacing },
  summaryStats: {
    width: '100%',
    marginTop: Space.sm,
    marginBottom: Space.sm } });
