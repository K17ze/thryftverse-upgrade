import React from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
  Text,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Reanimated, { FadeIn } from 'react-native-reanimated';
import { Colors } from '../constants/colors';
import { RootStackParamList } from '../navigation/types';
import { useToast } from '../context/ToastContext';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useCurrencyContext } from '../context/CurrencyContext';
import { parseApiError } from '../lib/apiClient';
import { AppButton } from '../components/ui/AppButton';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { CachedImage } from '../components/CachedImage';
import { EmptyState } from '../components/EmptyState';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { Meta, Body, BodyEmphasis, Headline } from '../components/ui/Text';
import { Space, Radius } from '../theme/designTokens';
import { useReducedMotion } from '../hooks/useReducedMotion';
import {
  getAuctionDetail,
  placeAuctionBid,
  buyAuctionNow,
  addToWatchlist,
  removeFromWatchlist,
  type AuctionDetail as AuctionDetailType,
  type AuctionBidActivity,
  type AuctionDetailResponse,
  type BuyNowResult,
} from '../services/marketApi';
import { BidSheet } from '../components/ui/BidSheet';
import { BuyNowSheet } from '../components/ui/BuyNowSheet';
import { useBucketedServerClock, type AuctionEffectiveState } from '../hooks/useServerClock';
import {
  resolveStateAction,
  resolveDetailPriceLabel,
  resolveDetailPriceAmount,
  resolveDetailCountdown,
  resolveViewerContextMessage,
  isBuyNowAvailable,
  areBidControlsRemoved,
  buildDetailAccessibilityLabel,
  formatBidActivityRow,
  detectLifecycleTransition,
  type AuctionDetailInput,
} from '../utils/auctionDetailLogic';

type NavT = StackNavigationProp<RootStackParamList>;
type RouteT = RouteProp<RootStackParamList, 'AuctionDetail'>;

export default function AuctionDetailScreen() {
  const navigation = useNavigation<NavT>();
  const route = useRoute<RouteT>();
  const { auctionId } = route.params;
  const { show } = useToast();
  const { formatFromFiat } = useFormattedPrice();
  const { currencyCode, goldRates } = useCurrencyContext();
  const reducedMotionEnabled = useReducedMotion();
  const insets = useSafeAreaInsets();

  const [auction, setAuction] = React.useState<AuctionDetailType | null>(null);
  const [bidActivity, setBidActivity] = React.useState<AuctionBidActivity[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [bidActivityError, setBidActivityError] = React.useState(false);

  const [bidSheetVisible, setBidSheetVisible] = React.useState(false);
  const [buyNowSheetVisible, setBuyNowSheetVisible] = React.useState(false);
  const [isSubmittingBid, setIsSubmittingBid] = React.useState(false);
  const [isBuyNowLoading, setIsBuyNowLoading] = React.useState(false);
  const [watchToggling, setWatchToggling] = React.useState(false);
  const [isTransitionRefreshing, setIsTransitionRefreshing] = React.useState(false);

  const serverNowRef = React.useRef<string | null>(null);
  const { secondClock, minuteClock, resync, needsResync, resyncFailed, markResyncFailed, clearResyncFailed } =
    useBucketedServerClock(serverNowRef.current);

  const prevLifecycleRef = React.useRef<AuctionEffectiveState | null>(null);

  const fetchDetail = React.useCallback(async (): Promise<AuctionDetailResponse | null> => {
    try {
      const res = await getAuctionDetail(auctionId);
      serverNowRef.current = res.serverNow;
      setAuction(res.auction);
      setBidActivity(res.bidActivity);
      setBidActivityError(false);
      setError(null);
      resync(res.serverNow);
      clearResyncFailed();
      return res;
    } catch (err) {
      const parsed = parseApiError(err, 'Failed to load auction');
      setError(parsed.message);
      markResyncFailed();
      return null;
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [auctionId, resync, clearResyncFailed, markResyncFailed]);

  React.useEffect(() => {
    void fetchDetail();
  }, [fetchDetail]);

  React.useEffect(() => {
    if (needsResync) {
      void fetchDetail();
    }
  }, [needsResync, fetchDetail]);

  const effectiveState = React.useMemo(() => {
    if (!auction) return null;
    return resolveEffectiveState(auction, minuteClock);
  }, [auction, minuteClock]);

  React.useEffect(() => {
    if (!effectiveState) return;
    if (
      prevLifecycleRef.current !== null &&
      !isTransitionRefreshing &&
      detectLifecycleTransition(prevLifecycleRef.current, effectiveState)
    ) {
      setIsTransitionRefreshing(true);
      void fetchDetail().finally(() => setIsTransitionRefreshing(false));
    }
    prevLifecycleRef.current = effectiveState;
  }, [effectiveState, fetchDetail, isTransitionRefreshing]);

  const handleRefresh = () => {
    setRefreshing(true);
    void fetchDetail();
  };

  const handleToggleWatch = async () => {
    if (!auction || watchToggling) return;
    setWatchToggling(true);
    const wasWatching = auction.isWatched;
    setAuction({ ...auction, isWatched: !wasWatching });
    try {
      if (wasWatching) {
        await removeFromWatchlist(auctionId);
        show('Removed from watchlist', 'info');
      } else {
        await addToWatchlist(auctionId);
        show('Added to watchlist', 'info');
      }
    } catch {
      setAuction({ ...auction, isWatched: wasWatching });
      show('Failed to update watchlist', 'error');
    } finally {
      setWatchToggling(false);
    }
  };

  // Authoritative refresh that returns the fetched snapshot for transaction preflight
  const refreshDetailForTransaction = React.useCallback(async (): Promise<AuctionDetailResponse | null> => {
    return fetchDetail();
  }, [fetchDetail]);

  const openBidSheet = () => {
    if (!auction) return;
    setBidSheetVisible(true);
  };

  const closeBidSheet = () => {
    setBidSheetVisible(false);
  };

  // PASS 6: Sheet owns transaction feedback. Parent only calls API and returns typed result.
  // No duplicate toast — sheet handles inline error/success presentation.
  const handleSubmitBid = async (gbpAmount: number, idempotencyKey: string): Promise<void> => {
    if (!auction || isSubmittingBid) return;
    setIsSubmittingBid(true);

    try {
      await placeAuctionBid(auction.id, { amountGbp: gbpAmount, idempotencyKey });
      // Post-success refresh — do not convert to error if refresh fails
      await fetchDetail();
    } catch (err) {
      // Sheet owns reconciliation refresh — parent does not duplicate
      throw err;
    } finally {
      setIsSubmittingBid(false);
    }
  };

  const openBuyNowSheet = () => {
    if (!auction?.buyNowPriceGbp || isBuyNowLoading) return;
    setBuyNowSheetVisible(true);
  };

  const closeBuyNowSheet = () => {
    setBuyNowSheetVisible(false);
  };

  // PASS 4: Buy Now calls dedicated API, verifies isBuyNow in response
  // PASS 6: Sheet owns feedback — no duplicate toast from parent
  const handleSubmitBuyNow = async (gbpAmount: number, idempotencyKey: string): Promise<BuyNowResult> => {
    if (!auction?.buyNowPriceGbp || isBuyNowLoading) throw new Error('Buy Now not available');
    setIsBuyNowLoading(true);

    try {
      const result = await buyAuctionNow(auction.id, {
        idempotencyKey,
        expectedPriceGbp: gbpAmount,
      });
      // Verify the response explicitly confirms Buy Now
      if (!result.isBuyNow) {
        throw new Error('Buy Now response did not confirm purchase. Please try again.');
      }
      // Post-success refresh — do not convert to error if refresh fails
      try {
        await fetchDetail();
      } catch {
        // Retain successful transaction result; sheet shows sync-pending message
      }
      return result;
    } catch (err) {
      // Sheet owns reconciliation refresh — parent does not duplicate
      throw err;
    } finally {
      setIsBuyNowLoading(false);
    }
  };

  const detailInput: AuctionDetailInput | null = React.useMemo(() => {
    if (!auction) return null;
    return {
      id: auction.id,
      listingId: auction.listingId,
      sellerId: auction.seller.id,
      title: auction.title,
      imageUrl: auction.imageUrl,
      brand: auction.brand,
      category: auction.category,
      conditionLabel: auction.conditionLabel,
      description: auction.description,
      startsAt: auction.startsAt,
      endsAt: auction.endsAt,
      startingBidGbp: auction.startingBidGbp,
      currentBidGbp: auction.currentBidGbp,
      minimumNextBidGbp: auction.minimumNextBidGbp,
      buyNowPriceGbp: auction.buyNowPriceGbp,
      bidCount: auction.bidCount,
      viewerState: auction.viewerState,
      isWatched: auction.isWatched,
      cancelledAt: auction.cancelledAt,
      settledAt: auction.settledAt,
      winnerBidderId: auction.winnerBidderId,
      lifecycle: auction.lifecycle,
      terminalReason: auction.terminalReason,
    };
  }, [auction]);

  const timing = React.useMemo(() => {
    if (!auction || !effectiveState) return null;
    const clockMs = minuteClock;
    return {
      effectiveState,
      msToStart: Math.max(0, new Date(auction.startsAt).getTime() - clockMs),
      msToEnd: Math.max(0, new Date(auction.endsAt).getTime() - clockMs),
    } as const;
  }, [auction, effectiveState, minuteClock]);

  const stateAction = React.useMemo(() => {
    if (!detailInput || !timing) return null;
    return resolveStateAction(timing.effectiveState, detailInput.viewerState, detailInput);
  }, [detailInput, timing]);

  const priceLabel = React.useMemo(() => {
    if (!detailInput || !timing) return 'Starting bid' as const;
    return resolveDetailPriceLabel(detailInput, timing.effectiveState);
  }, [detailInput, timing]);

  const priceAmount = React.useMemo(() => {
    if (!detailInput) return 0;
    return resolveDetailPriceAmount(detailInput);
  }, [detailInput]);

  const priceText = React.useMemo(() => {
    if (priceLabel === 'No bids') return 'No bids';
    return formatFromFiat(priceAmount, 'GBP', { displayMode: 'fiat' });
  }, [priceLabel, priceAmount, formatFromFiat]);

  const countdown = React.useMemo(() => {
    if (!timing) return { text: '', isFinalMinutes: false };
    return resolveDetailCountdown(timing, secondClock, minuteClock);
  }, [timing, secondClock, minuteClock]);

  const viewerContext = React.useMemo(() => {
    if (!detailInput || !timing) return null;
    return resolveViewerContextMessage(timing.effectiveState, detailInput.viewerState, detailInput, formatFromFiat);
  }, [detailInput, timing, formatFromFiat]);

  const accessibilityLabel = React.useMemo(() => {
    if (!detailInput || !timing) return '';
    return buildDetailAccessibilityLabel(detailInput, timing, priceLabel, priceText, countdown.text, detailInput.viewerState);
  }, [detailInput, timing, priceLabel, priceText, countdown]);

  const isLive = effectiveState === 'live';
  const isUpcoming = effectiveState === 'upcoming';
  const isEnded = effectiveState === 'ended';
  const isCancelled = effectiveState === 'cancelled';
  const isSettled = effectiveState === 'settled';
  const isTerminal = isEnded || isCancelled || isSettled;
  const viewerState = auction?.viewerState ?? 'not_participating';
  const isSeller = viewerState === 'seller';
  const buyNowAvailable = detailInput ? isBuyNowAvailable(detailInput, effectiveState ?? 'upcoming') : false;
  const showBidControls = !isTerminal && !isSeller;
  const treatmentStyle = stateAction?.viewerTreatment ?? 'none';

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScrollView contentContainerStyle={styles.loadingContainer}>
          <SkeletonLoader width="100%" height={360} borderRadius={0} />
          <View style={{ padding: Space.md }}>
            <SkeletonLoader width="60%" height={28} borderRadius={8} style={{ marginBottom: Space.sm }} />
            <SkeletonLoader width="40%" height={16} borderRadius={6} style={{ marginBottom: Space.md }} />
            <SkeletonLoader width="100%" height={80} borderRadius={12} style={{ marginBottom: Space.sm }} />
            <SkeletonLoader width="100%" height={50} borderRadius={12} />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (error || !auction) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.errorContainer}>
          <EmptyState icon="alert-circle-outline" title={error ?? 'Auction not found'} />
          <AppButton
            title="Go Back"
            variant="secondary"
            onPress={() => navigation.goBack()}
            style={styles.backBtn}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        accessible
        accessibilityLabel={accessibilityLabel}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.brand}
            colors={[Colors.brand]}
            progressBackgroundColor={Colors.surfaceAlt}
          />
        }
      >
        {/* ── 1. Media Hero ── */}
        <Reanimated.View
          entering={reducedMotionEnabled ? undefined : FadeIn.duration(300)}
        >
          <View style={styles.heroWrap}>
            {auction.imageUrl ? (
              <CachedImage
                uri={auction.imageUrl}
                style={styles.heroImage}
                containerStyle={styles.heroImageContainer}
                contentFit="cover"
              />
            ) : (
              <View style={styles.heroPlaceholder}>
                <Ionicons name="image-outline" size={48} color={Colors.textMuted} />
              </View>
            )}

            <View style={styles.heroOverlayRow}>
              {isLive && (
                <View style={styles.livePill}>
                  <View style={styles.liveDot} />
                  <Text style={styles.livePillText}>LIVE</Text>
                </View>
              )}
              {isUpcoming && (
                <View style={styles.scheduledPill}>
                  <Ionicons name="time-outline" size={11} color={Colors.textInverse} />
                  <Text style={styles.scheduledPillText}>UPCOMING</Text>
                </View>
              )}
              {isEnded && (
                <View style={styles.endedPill}>
                  <Text style={styles.endedPillText}>ENDED</Text>
                </View>
              )}
              {isCancelled && (
                <View style={styles.cancelledPill}>
                  <Text style={styles.cancelledPillText}>CANCELLED</Text>
                </View>
              )}
              {isSettled && (
                <View style={styles.settledPill}>
                  <Text style={styles.settledPillText}>SETTLED</Text>
                </View>
              )}
            </View>

            <AnimatedPressable
              style={styles.backBtnFloating}
              onPress={() => navigation.goBack()}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              hitSlop={4}
            >
              <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
            </AnimatedPressable>

            <AnimatedPressable
              style={[styles.watchBtnFloating, auction.isWatched && styles.watchBtnFloatingActive]}
              onPress={handleToggleWatch}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={auction.isWatched ? 'Remove from watchlist' : 'Add to watchlist'}
              accessibilityHint={watchToggling ? 'Updating' : undefined}
              hitSlop={4}
            >
              <Ionicons
                name={auction.isWatched ? 'heart' : 'heart-outline'}
                size={18}
                color={auction.isWatched ? '#ff4444' : Colors.textPrimary}
              />
            </AnimatedPressable>
          </View>
        </Reanimated.View>

        {/* ── 2. Viewer state banner (active states only — terminal states use body transformation) ── */}
        {viewerContext && !isTerminal && (
          <View style={[styles.viewerMessage, stylesViewerTreatment[treatmentStyle] ?? null]}>
            <Ionicons
              name={
                viewerContext.treatment === 'warning' ? 'trending-up'
                : viewerContext.treatment === 'calm' ? 'trophy-outline'
                : viewerContext.treatment === 'result' ? 'ribbon'
                : viewerContext.treatment === 'seller' ? 'storefront-outline'
                : viewerContext.treatment === 'subdued' ? 'close-circle-outline'
                : 'eye-outline'
              }
              size={14}
              color={
                viewerContext.treatment === 'warning' ? Colors.danger
                : viewerContext.treatment === 'calm' || viewerContext.treatment === 'result' ? Colors.success
                : viewerContext.treatment === 'seller' ? Colors.brand
                : viewerContext.treatment === 'subdued' ? Colors.textMuted
                : Colors.textSecondary
              }
            />
            <View style={styles.viewerMessageContent}>
              <Text style={[styles.viewerMessageTitle, stylesViewerTitle[treatmentStyle] ?? null]}>
                {viewerContext.title}
              </Text>
              {viewerContext.subtitle && (
                <Meta style={styles.viewerMessageSubtitle}>{viewerContext.subtitle}</Meta>
              )}
            </View>
          </View>
        )}

        {/* ── 3. Current price ── */}
        <View style={styles.stateHeader}>
          <View style={styles.priceRow}>
            <View style={styles.pricePrimary}>
              <Meta style={styles.priceLabel}>{priceLabel}</Meta>
              <Text
                style={styles.priceValue}
                accessibilityRole="text"
                accessibilityLabel={`${priceLabel} ${priceText}`}
              >
                {priceText}
              </Text>
              {isLive && viewerState === 'outbid' && auction.minimumNextBidGbp > 0 && (
                <View style={styles.outbidHint}>
                  <Ionicons name="trending-up" size={14} color={Colors.danger} />
                  <Text style={styles.outbidHintText}>
                    You've been outbid — minimum bid:{' '}
                    <Text style={styles.outbidHintAmount}>
                      {formatFromFiat(auction.minimumNextBidGbp, 'GBP', { displayMode: 'fiat' })}
                    </Text>
                  </Text>
                </View>
              )}
            </View>
            <View style={styles.priceSecondary}>
              <View style={styles.bidCountBadge}>
                <Text style={styles.bidCountValue}>{auction.bidCount}</Text>
                <Text style={styles.bidCountLabel}>
                  {auction.bidCount === 1 ? 'bid' : 'bids'}
                </Text>
              </View>
            </View>
          </View>

          {/* ── 4. Time and bid activity ── */}
          <View style={styles.timeRow}>
            <Ionicons
              name={
                isLive ? 'flash-outline'
                : isUpcoming ? 'time-outline'
                : isCancelled ? 'close-circle-outline'
                : isSettled ? 'checkmark-circle-outline'
                : 'checkmark-done-outline'
              }
              size={14}
              color={
                countdown.isFinalMinutes ? Colors.danger
                : isLive ? Colors.danger
                : isUpcoming ? Colors.brand
                : Colors.textMuted
              }
            />
            <Text
              style={[
                styles.timeText,
                countdown.isFinalMinutes && styles.timeTextUrgent,
              ]}
              accessibilityRole="text"
              accessibilityLabel={countdown.text}
            >
              {countdown.text}
            </Text>
          </View>

          {resyncFailed && !error && (
            <View style={styles.resyncBanner}>
              <Ionicons name="sync-circle-outline" size={14} color={Colors.textMuted} />
              <Meta style={styles.resyncText}>Clock sync failed — pull to refresh</Meta>
            </View>
          )}
        </View>

        {/* ── Terminal body transformation — editorial, no bordered cards ── */}
        {isTerminal && !isCancelled && (
          <View style={styles.terminalBodySection}>
            {viewerState === 'won' && (
              <View style={styles.terminalResultBlock}>
                <Ionicons name="trophy" size={28} color={Colors.success} />
                <Text style={styles.terminalResultTitle}>You won</Text>
                <Text style={styles.terminalResultPrice}>
                  {formatFromFiat(auction.currentBidGbp || auction.buyNowPriceGbp || 0, 'GBP', { displayMode: 'fiat' })}
                </Text>
                <Meta style={styles.terminalResultDetail}>{auction.title}</Meta>
                <Meta style={styles.terminalResultNote}>
                  Transaction fulfilment is not yet available for this auction result.
                </Meta>
              </View>
            )}
            {viewerState === 'lost' && (
              <View style={styles.terminalResultBlock}>
                <Ionicons name="checkmark-done-outline" size={28} color={Colors.textMuted} />
                <Text style={styles.terminalResultTitle}>Auction ended</Text>
                <Text style={styles.terminalResultPrice}>
                  {formatFromFiat(auction.currentBidGbp, 'GBP', { displayMode: 'fiat' })}
                </Text>
                <Meta style={styles.terminalResultDetail}>
                  {auction.bidCount} {auction.bidCount === 1 ? 'bid' : 'bids'} were placed
                </Meta>
                <Pressable
                  style={styles.discoverLinkInline}
                  onPress={() => navigation.navigate('AuctionHome')}
                  accessibilityRole="button"
                  accessibilityLabel="Discover similar auctions"
                >
                  <Ionicons name="search-outline" size={14} color={Colors.brand} />
                  <Text style={styles.discoverLinkInlineText}>Discover similar</Text>
                  <Ionicons name="chevron-forward" size={12} color={Colors.brand} />
                </Pressable>
              </View>
            )}
            {viewerState === 'seller' && auction.bidCount > 0 && (
              <View style={styles.terminalResultBlock}>
                <Ionicons name="checkmark-circle" size={28} color={Colors.success} />
                <Text style={styles.terminalResultTitle}>Sold</Text>
                <Text style={styles.terminalResultPrice}>
                  {formatFromFiat(auction.currentBidGbp || auction.buyNowPriceGbp || 0, 'GBP', { displayMode: 'fiat' })}
                </Text>
                <Meta style={styles.terminalResultDetail}>
                  {auction.bidCount} {auction.bidCount === 1 ? 'bid' : 'bids'}
                </Meta>
                <Meta style={styles.terminalResultNote}>
                  Transaction fulfilment is not yet available for this auction result.
                </Meta>
              </View>
            )}
            {viewerState === 'seller' && auction.bidCount === 0 && (
              <View style={styles.terminalResultBlock}>
                <Ionicons name="close-circle-outline" size={28} color={Colors.textMuted} />
                <Text style={styles.terminalResultTitle}>Ended without bids</Text>
                <Meta style={styles.terminalResultDetail}>
                  No bids were placed on this auction
                </Meta>
              </View>
            )}
            {viewerState === 'not_participating' && (
              <View style={styles.terminalResultBlock}>
                <Ionicons name="checkmark-done-outline" size={28} color={Colors.textMuted} />
                <Text style={styles.terminalResultTitle}>Auction ended</Text>
                <Text style={styles.terminalResultPrice}>
                  {formatFromFiat(auction.currentBidGbp, 'GBP', { displayMode: 'fiat' })}
                </Text>
                <Meta style={styles.terminalResultDetail}>
                  {auction.bidCount} {auction.bidCount === 1 ? 'bid' : 'bids'}
                </Meta>
              </View>
            )}
          </View>
        )}

        {/* ── 6. Item identity and condition ── */}
        <View style={styles.titleSection}>
          {auction.brand && <Meta style={styles.brandLabel}>{auction.brand}</Meta>}
          <Headline style={styles.title} numberOfLines={2}>{auction.title}</Headline>
          {auction.conditionLabel && (
            <Meta style={styles.conditionLabel}>{auction.conditionLabel}</Meta>
          )}
        </View>

        {/* ── 7. Seller confidence ── */}
        <View style={styles.sellerSection}>
          <AnimatedPressable
            style={styles.sellerInfo}
            onPress={() => navigation.navigate('UserProfile', { userId: auction.seller.id })}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`View ${auction.seller.username} profile`}
          >
            {auction.seller.avatarUrl ? (
              <CachedImage
                uri={auction.seller.avatarUrl}
                style={styles.sellerAvatar}
                containerStyle={styles.sellerAvatarContainer}
                contentFit="cover"
              />
            ) : (
              <View style={styles.sellerAvatarPlaceholder}>
                <Ionicons name="person" size={16} color={Colors.textMuted} />
              </View>
            )}
            <View style={styles.sellerTextCol}>
              <BodyEmphasis style={styles.sellerName} numberOfLines={1}>
                {auction.seller.displayName ?? `@${auction.seller.username}`}
              </BodyEmphasis>
              <Meta style={styles.sellerHandle}>@{auction.seller.username}</Meta>
            </View>
          </AnimatedPressable>
          {!isSeller && (
            <Pressable
              style={styles.sellerMessageBtn}
              onPress={() =>
                navigation.navigate('NewMessage', {
                  preselectedUserId: auction.seller.id,
                  preselectedDisplayName: auction.seller.username,
                })
              }
              accessibilityRole="button"
              accessibilityLabel={`Message ${auction.seller.username}`}
            >
              <Ionicons name="chatbubble-ellipses-outline" size={18} color={Colors.textPrimary} />
            </Pressable>
          )}
        </View>

        {/* ── 8. Transaction truth (terminal states only) ── */}
        {isTerminal && !isCancelled && viewerState !== 'lost' && (
          <View style={styles.transactionTruthSection}>
            <Meta style={styles.transactionTruthText}>
              Transaction fulfilment is not yet available for this auction result.
            </Meta>
          </View>
        )}

        {/* ── 9. Bid history ── */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <BodyEmphasis style={styles.sectionTitle}>Bid history</BodyEmphasis>
            {auction.bidCount > 0 && (
              <Meta style={styles.bidCountTotal}>{auction.bidCount} total</Meta>
            )}
          </View>
          {bidActivity.length > 0 ? (
            <View style={styles.bidList}>
              {bidActivity.map((bid, index) => {
                const row = formatBidActivityRow(bid, index, formatFromFiat);
                return (
                  <View
                    key={bid.id}
                    style={[styles.bidRow, index === 0 && styles.bidRowTop]}
                  >
                    <View style={styles.bidRowLeft}>
                      {row.isViewer ? (
                        <View style={styles.viewerBadge}>
                          <Text style={styles.viewerBadgeText}>YOU</Text>
                        </View>
                      ) : (
                        <Ionicons name="person-circle-outline" size={18} color={Colors.textMuted} />
                      )}
                      <Text style={styles.bidderName}>
                        {row.isViewer ? 'You' : 'Bidder'}
                      </Text>
                    </View>
                    <View style={styles.bidRowRight}>
                      <Text style={styles.bidAmount}>{row.amountText}</Text>
                      {row.isTopBid && <Text style={styles.topBidLabel}>Highest</Text>}
                    </View>
                  </View>
                );
              })}
            </View>
          ) : bidActivityError ? (
            <View style={styles.subSectionError}>
              <Meta style={styles.subSectionErrorText}>Bid history unavailable</Meta>
              <Pressable
                onPress={() => void fetchDetail()}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Retry loading bid history"
              >
                <Text style={styles.retryText}>Retry</Text>
              </Pressable>
            </View>
          ) : (
            <Text style={styles.noBidsText}>No bids yet</Text>
          )}
        </View>

        {/* ── 10. Description and item details ── */}
        {auction.description && (
          <View style={styles.section}>
            <BodyEmphasis style={styles.sectionTitle}>Description</BodyEmphasis>
            <Body style={styles.descriptionText}>{auction.description}</Body>
          </View>
        )}

        {(auction.brand || auction.category || auction.conditionLabel) && (
          <View style={styles.section}>
            <BodyEmphasis style={styles.sectionTitle}>Item details</BodyEmphasis>
            <View style={styles.itemInfoList}>
              {auction.brand && (
                <View style={styles.itemInfoRow}>
                  <Meta style={styles.itemInfoLabel}>Brand</Meta>
                  <Body style={styles.itemInfoValue}>{auction.brand}</Body>
                </View>
              )}
              {auction.category && (
                <View style={styles.itemInfoRow}>
                  <Meta style={styles.itemInfoLabel}>Category</Meta>
                  <Body style={styles.itemInfoValue}>{auction.category}</Body>
                </View>
              )}
              {auction.conditionLabel && (
                <View style={styles.itemInfoRow}>
                  <Meta style={styles.itemInfoLabel}>Condition</Meta>
                  <Body style={styles.itemInfoValue}>{auction.conditionLabel}</Body>
                </View>
              )}
            </View>
          </View>
        )}

        {/* ── 11. Auction rules ── */}
        <View style={styles.section}>
          <BodyEmphasis style={styles.sectionTitle}>Auction rules</BodyEmphasis>
          <View style={styles.infoList}>
            <View style={styles.infoRow}>
              <Ionicons name="hammer-outline" size={16} color={Colors.textSecondary} />
              <Body style={styles.infoText}>
                Bids are binding commitments. Once placed, they cannot be withdrawn.
              </Body>
            </View>
            <View style={styles.infoRow}>
              <Ionicons name="time-outline" size={16} color={Colors.textSecondary} />
              <Body style={styles.infoText}>
                The auction ends at the scheduled time. The highest bid at close wins.
              </Body>
            </View>
            {auction.buyNowPriceGbp && (
              <View style={styles.infoRow}>
                <Ionicons name="flash-outline" size={16} color={Colors.textSecondary} />
                <Body style={styles.infoText}>
                  Buy Now ends the auction immediately at the fixed price. This is a purchase, not a bid.
                </Body>
              </View>
            )}
          </View>
        </View>

        <View style={{ height: 100 + insets.bottom }} />
      </ScrollView>

      {/* ── Sticky bottom action dock ── */}
      {showBidControls && stateAction && stateAction.primary.type !== 'none' && (
        <View style={[styles.actionDock, { paddingBottom: insets.bottom + Space.sm }]}>
          <AppButton
            style={styles.actionDockFull}
            onPress={() => {
              if (stateAction.primary.type === 'placeBid' || stateAction.primary.type === 'increaseBid' || stateAction.primary.type === 'bidAgain') {
                openBidSheet();
              } else if (stateAction.primary.type === 'watchAuction') {
                void handleToggleWatch();
              } else if (stateAction.primary.type === 'viewSimilar') {
                navigation.navigate('MainTabs', { screen: 'Explore' });
              }
            }}
            disabled={isSubmittingBid || watchToggling}
            variant={stateAction.primary.type === 'watchAuction' ? 'secondary' : 'primary'}
            size="md"
            title={stateAction.primary.label}
            accessibilityLabel={stateAction.primary.label}
          />
          {buyNowAvailable && stateAction.secondary.type === 'buyNow' && (
            <Pressable
              style={styles.buyNowLink}
              onPress={openBuyNowSheet}
              disabled={isBuyNowLoading}
              accessibilityRole="button"
              accessibilityLabel={`Buy now for ${formatFromFiat(auction.buyNowPriceGbp!, 'GBP', { displayMode: 'fiat' })}`}
              accessibilityHint="Fixed price purchase. Ends auction immediately. Requires confirmation."
            >
              <Text style={styles.buyNowLinkText}>
                {isBuyNowLoading ? 'Processing...' : `or Buy Now for ${formatFromFiat(auction.buyNowPriceGbp!, 'GBP', { displayMode: 'fiat' })}`}
              </Text>
            </Pressable>
          )}
        </View>
      )}

      {isSeller && !isTerminal && stateAction && stateAction.primary.type !== 'none' && (
        <View style={[styles.actionDock, { paddingBottom: insets.bottom + Space.sm }]}>
          <View style={styles.sellerDockInfo}>
            <Ionicons name="storefront-outline" size={16} color={Colors.brand} />
            <Text style={styles.sellerDockText}>
              {isUpcoming ? 'Your auction is scheduled' : `${auction.bidCount} ${auction.bidCount === 1 ? 'bid' : 'bids'} so far`}
            </Text>
          </View>
        </View>
      )}

      {isTerminal && (
        <View style={[styles.terminalDock, { paddingBottom: insets.bottom + Space.sm }]}>
          {isCancelled ? (
            <View style={styles.terminalDockRow}>
              <Ionicons name="close-circle-outline" size={16} color={Colors.textMuted} />
              <Text style={styles.terminalDockText}>Auction cancelled</Text>
            </View>
          ) : viewerState === 'won' ? (
            <View style={styles.terminalDockRow}>
              <Ionicons name="trophy-outline" size={16} color={Colors.success} />
              <Text style={[styles.terminalDockText, { color: Colors.success }]}>You won this auction</Text>
            </View>
          ) : viewerState === 'lost' ? (
            <View style={styles.terminalDockRow}>
              <Ionicons name="close-circle-outline" size={16} color={Colors.textMuted} />
              <Text style={styles.terminalDockText}>Auction ended — you did not win</Text>
            </View>
          ) : isSeller && auction.bidCount > 0 ? (
            <View style={styles.terminalDockRow}>
              <Ionicons name="checkmark-circle-outline" size={16} color={Colors.brand} />
              <Text style={[styles.terminalDockText, { color: Colors.brand }]}>Sold — {auction.bidCount} {auction.bidCount === 1 ? 'bid' : 'bids'}</Text>
            </View>
          ) : isSeller ? (
            <View style={styles.terminalDockRow}>
              <Ionicons name="close-circle-outline" size={16} color={Colors.textMuted} />
              <Text style={styles.terminalDockText}>Ended without bids</Text>
            </View>
          ) : (
            <View style={styles.terminalDockRow}>
              <Ionicons name="checkmark-done-outline" size={16} color={Colors.textMuted} />
              <Text style={styles.terminalDockText}>Auction ended</Text>
            </View>
          )}
        </View>
      )}

      {/* ── Bid transaction sheet ── */}
      {auction && (
        <BidSheet
          visible={bidSheetVisible}
          onDismiss={closeBidSheet}
          auction={{
            id: auction.id,
            title: auction.title,
            imageUrl: auction.imageUrl,
            currentBidGbp: auction.currentBidGbp,
            minimumNextBidGbp: auction.minimumNextBidGbp,
            endsAt: auction.endsAt,
            sellerName: auction.seller.displayName ?? auction.seller.username,
            effectiveState: effectiveState ?? 'upcoming',
            isSeller,
            countdownText: countdown.text,
          }}
          currencyCode={currencyCode}
          goldRates={goldRates}
          formatFromFiat={formatFromFiat}
          onSubmitBid={handleSubmitBid}
          onRefreshDetail={refreshDetailForTransaction}
          onReviewBuyNow={() => {
            setBidSheetVisible(false);
            setBuyNowSheetVisible(true);
          }}
          serverClockMs={minuteClock}
        />
      )}

      {/* ── Buy Now transaction sheet ── */}
      {auction && (
        <BuyNowSheet
          visible={buyNowSheetVisible}
          onDismiss={closeBuyNowSheet}
          auction={{
            id: auction.id,
            title: auction.title,
            imageUrl: auction.imageUrl,
            buyNowPriceGbp: auction.buyNowPriceGbp,
            sellerName: auction.seller.displayName ?? auction.seller.username,
            effectiveState: effectiveState ?? 'upcoming',
            isSeller,
          }}
          currencyCode={currencyCode}
          formatFromFiat={formatFromFiat}
          onSubmitBuyNow={handleSubmitBuyNow}
          onRefreshDetail={refreshDetailForTransaction}
        />
      )}
    </View>
  );
}

function resolveEffectiveState(
  auction: AuctionDetailType,
  clockMs: number,
): 'cancelled' | 'settled' | 'upcoming' | 'live' | 'ended' {
  // 1. Cancelled — highest precedence
  if (auction.cancelledAt) return 'cancelled';
  // 2. Settled — explicit settlement
  if (auction.settledAt) return 'settled';
  // 3. Winner set or Buy Now terminal — ended regardless of dates
  if (auction.winnerBidderId) return 'ended';
  if (auction.terminalReason === 'buy_now') return 'ended';
  // 4. Authoritative lifecycle from backend
  if (auction.lifecycle === 'ended') return 'ended';
  if (auction.lifecycle === 'cancelled') return 'cancelled';
  if (auction.lifecycle === 'settled') return 'settled';
  // 5. Scheduled end according to server clock
  const endsMs = new Date(auction.endsAt).getTime();
  const startsMs = new Date(auction.startsAt).getTime();
  if (clockMs >= endsMs) return 'ended';
  // 6. Live
  if (clockMs >= startsMs) return 'live';
  // 7. Upcoming
  return 'upcoming';
}

const stylesViewerTreatment: Record<string, { backgroundColor: string; borderColor: string }> = {
  calm: { backgroundColor: 'rgba(22,163,74,0.08)', borderColor: 'rgba(22,163,74,0.2)' },
  warning: { backgroundColor: 'rgba(220,38,38,0.08)', borderColor: 'rgba(220,38,38,0.2)' },
  restrained: { backgroundColor: Colors.surfaceAlt, borderColor: Colors.border },
  result: { backgroundColor: 'rgba(22,163,74,0.08)', borderColor: 'rgba(22,163,74,0.2)' },
  subdued: { backgroundColor: Colors.surfaceAlt, borderColor: Colors.border },
  seller: { backgroundColor: 'rgba(244,240,232,0.06)', borderColor: 'rgba(244,240,232,0.15)' },
  none: { backgroundColor: Colors.surfaceAlt, borderColor: Colors.border },
};

const stylesViewerTitle: Record<string, { color: string }> = {
  calm: { color: Colors.success },
  warning: { color: Colors.danger },
  restrained: { color: Colors.textSecondary },
  result: { color: Colors.success },
  subdued: { color: Colors.textMuted },
  seller: { color: Colors.brand },
  none: { color: Colors.textPrimary },
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loadingContainer: {
    flex: 1,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Space.xl,
  },
  backBtn: {
    marginTop: Space.md,
    minWidth: 120,
  },
  heroWrap: {
    position: 'relative',
    width: '100%',
    height: 360,
  },
  heroImageContainer: {
    width: '100%',
    height: 360,
  },
  heroImage: {
    width: '100%',
    height: 360,
  },
  heroPlaceholder: {
    width: '100%',
    height: 360,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroOverlayRow: {
    position: 'absolute',
    bottom: Space.sm,
    left: Space.sm,
    flexDirection: 'row',
    gap: 6,
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.danger,
  },
  livePillText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  scheduledPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  scheduledPillText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  endedPill: {
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  endedPillText: {
    color: Colors.textMuted,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  cancelledPill: {
    backgroundColor: 'rgba(220,38,38,0.8)',
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  cancelledPillText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  settledPill: {
    backgroundColor: 'rgba(22,163,74,0.8)',
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  settledPillText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  backBtnFloating: {
    position: 'absolute',
    top: Space.sm,
    left: Space.sm,
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  watchBtnFloating: {
    position: 'absolute',
    top: Space.sm,
    right: Space.sm,
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  watchBtnFloatingActive: {
    backgroundColor: 'rgba(255,68,68,0.2)',
  },
  stateHeader: {
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  pricePrimary: {
    flex: 1,
  },
  priceLabel: {
    marginBottom: 4,
  },
  priceValue: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
    letterSpacing: -0.5,
    color: Colors.textPrimary,
    fontFamily: 'Inter_700Bold',
  },
  priceSecondary: {
    alignItems: 'flex-end',
  },
  bidCountBadge: {
    alignItems: 'center',
  },
  bidCountValue: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textSecondary,
    fontFamily: 'Inter_600SemiBold',
  },
  bidCountLabel: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 1,
  },
  outbidHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  outbidHintText: {
    fontSize: 13,
    color: Colors.danger,
    fontFamily: 'Inter_500Medium',
  },
  outbidHintAmount: {
    fontFamily: 'Inter_700Bold',
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: Space.sm,
  },
  timeText: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontFamily: 'Inter_500Medium',
  },
  timeTextUrgent: {
    color: Colors.danger,
    fontWeight: '700',
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
  },
  viewerMessage: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  viewerMessageContent: {
    flex: 1,
  },
  viewerMessageTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
    fontFamily: 'Inter_600SemiBold',
  },
  viewerMessageSubtitle: {
    marginTop: 2,
  },
  resyncBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: Space.sm,
  },
  resyncText: {
    color: Colors.textMuted,
  },
  // ── Removed inline action styles (PASS 4 correction pass 1) ──
  titleSection: {
    paddingHorizontal: Space.md,
    paddingTop: Space.lg,
  },
  brandLabel: {
    color: Colors.textSecondary,
    marginBottom: 4,
    fontSize: 12,
    fontWeight: '500',
  },
  title: {
    marginBottom: 4,
  },
  conditionLabel: {
    color: Colors.textMuted,
  },
  sellerSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
    marginTop: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  sellerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    flex: 1,
  },
  sellerAvatarContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  sellerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  sellerAvatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sellerTextCol: {
    flex: 1,
  },
  sellerName: {
    fontSize: 14,
  },
  sellerHandle: {
    color: Colors.textMuted,
  },
  sellerMessageBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: {
    paddingHorizontal: Space.md,
    paddingTop: Space.lg,
  },
  sectionTitle: {
    marginBottom: Space.sm,
    fontSize: 15,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Space.sm,
  },
  bidCountTotal: {
    color: Colors.textMuted,
  },
  bidList: {
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
  },
  bidRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  bidRowTop: {
    backgroundColor: Colors.surfaceAlt,
  },
  bidRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    flex: 1,
  },
  viewerBadge: {
    backgroundColor: Colors.brand,
    borderRadius: Radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  viewerBadgeText: {
    color: Colors.textInverse,
    fontSize: 9,
    fontWeight: '700',
  },
  bidderName: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
  },
  bidRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  bidAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
    fontFamily: 'Inter_600SemiBold',
  },
  topBidLabel: {
    color: Colors.success,
    fontSize: 10,
    fontWeight: '600',
  },
  noBidsText: {
    color: Colors.textMuted,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
  subSectionError: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceAlt,
  },
  subSectionErrorText: {
    color: Colors.textMuted,
  },
  retryText: {
    color: Colors.brand,
    fontSize: 13,
    fontWeight: '600',
  },
  descriptionText: {
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  itemInfoList: {
    gap: Space.sm,
  },
  itemInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemInfoLabel: {
    color: Colors.textMuted,
  },
  itemInfoValue: {
    fontSize: 14,
    color: Colors.textPrimary,
  },
  infoList: {
    gap: Space.sm,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.sm,
  },
  infoText: {
    flex: 1,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  actionDock: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    backgroundColor: Colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  // ── Removed actionDockRow/Primary/Secondary (PASS 4 correction: single primary CTA) ──
  actionDockFull: {
    width: '100%',
  },
  buyNowLink: {
    alignItems: 'center',
    paddingVertical: Space.sm,
    marginTop: Space.xs,
  },
  buyNowLinkText: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontFamily: 'Inter_500Medium',
    textDecorationLine: 'underline',
  },
  sellerDockInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm,
  },
  sellerDockText: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontFamily: 'Inter_500Medium',
  },
  terminalDock: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    backgroundColor: Colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    alignItems: 'center',
    paddingVertical: Space.md,
  },
  terminalDockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  terminalDockText: {
    fontSize: 14,
    color: Colors.textMuted,
    fontFamily: 'Inter_500Medium',
  },
  terminalBodySection: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
  },
  terminalResultBlock: {
    alignItems: 'center',
    paddingVertical: Space.md,
    gap: 4,
  },
  terminalResultTitle: {
    fontSize: 22,
    fontFamily: 'Inter_700Bold',
    color: Colors.textPrimary,
    marginTop: Space.xs,
  },
  terminalResultPrice: {
    fontSize: 20,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.brand,
  },
  terminalResultDetail: {
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  terminalResultNote: {
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: Space.xs,
    fontSize: 13,
  },
  discoverLinkInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: Space.sm,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignSelf: 'center',
  },
  discoverLinkInlineText: {
    color: Colors.brand,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
  transactionTruthSection: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  transactionTruthText: {
    color: Colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  discoverLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: Space.sm,
  },
  discoverLinkText: {
    flex: 1,
    fontSize: 15,
    color: Colors.brand,
    fontFamily: 'Inter_600SemiBold',
  },
});
