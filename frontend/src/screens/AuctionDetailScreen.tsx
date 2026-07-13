import React from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
  Text,
  useWindowDimensions,
  LayoutAnimation,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Reanimated, { FadeIn } from 'react-native-reanimated';
import { useAppTheme } from '../theme/ThemeContext';
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
import { toIze, formatIzeAmount } from '../utils/currency';
import { Space, Radius, Typography } from '../theme/designTokens';
import { useReducedMotion } from '../hooks/useReducedMotion';
import {
  getAuctionDetail,
  placeAuctionBid,
  buyAuctionNow,
  addToWatchlist,
  removeFromWatchlist,
  listAuctions,
  type AuctionDetail as AuctionDetailType,
  type AuctionBidActivity,
  type AuctionDetailResponse,
  type BuyNowResult,
  type MarketAuction,
} from '../services/marketApi';
import { BottomSheet } from '../components/BottomSheet';
import { BidSheet } from '../components/ui/BidSheet';
import { BuyNowSheet } from '../components/ui/BuyNowSheet';
import { FullscreenMediaViewer } from '../components/product/FullscreenMediaViewer';
import { SellerTrustCard, ProductFamilyBadge, RecommendationRail } from '../components/product';
import { SaveToCollectionModal } from '../components/closet/SaveToCollectionModal';
import { ShareSheet } from '../components/ShareSheet';
import { CommerceStickyDock, CommerceStateCanvas, CommerceRelatedRail, CategoryEvidence } from '../components/commerce';
import { resolveEvidenceGroups } from '../platform/commerce/categoryEvidence';
import {
  useBucketedServerClock,
  resolveAuctionTiming,
  type AuctionEffectiveState,
} from '../hooks/useServerClock';
import {
  buildAuctionViewModel,
  useProductSocialState,
  useRecommendations,
  useSellerTrust,
  useSellerFollow,
  isRecommendationLook,
} from '../platform/product';
import type { RecommendationLook } from '../platform/product';
import { useStore } from '../store/useStore';
import { Listing } from '../data/mockData';
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
  resolveReserveStatus,
} from '../utils/auctionDetailLogic';
import {
  AuctionStateBadge,
  AuctionStickyBidDock,
  AuctionCountdown,
  ReserveStatusBadge,
} from '../components/auction';

type NavT = StackNavigationProp<RootStackParamList>;
type RouteT = RouteProp<RootStackParamList, 'AuctionDetail'>;

export default function AuctionDetailScreen() {
  const navigation = useNavigation<NavT>();
  const route = useRoute<RouteT>();
  const { auctionId, openBidSheet, initialBidAmount } = route.params;
  const { show } = useToast();
  const { colors, isDark } = useAppTheme();
  const { formatFromFiat } = useFormattedPrice();
  const { currencyCode, goldRates, displayMode } = useCurrencyContext();
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
  const [bidHistorySheetVisible, setBidHistorySheetVisible] = React.useState(false);
  const [rulesSheetVisible, setRulesSheetVisible] = React.useState(false);
  const [mediaViewerVisible, setMediaViewerVisible] = React.useState(false);
  const [relatedAuctions, setRelatedAuctions] = React.useState<MarketAuction[]>([]);
  const [relatedLoading, setRelatedLoading] = React.useState(false);

  const currentUser = useStore((state) => state.currentUser);

  const { height: screenHeight } = useWindowDimensions();
  const HERO_HEIGHT = Math.min(screenHeight * 0.48, 440);

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

  const fetchRelatedAuctions = React.useCallback(async (category: string | null, currentId: string) => {
    setRelatedLoading(true);
    try {
      const result = await listAuctions({ status: 'live', category: category ?? undefined, limit: 6 });
      setRelatedAuctions(result.items.filter((a) => a.id !== currentId).slice(0, 4));
    } catch {
      setRelatedAuctions([]);
    } finally {
      setRelatedLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (auction?.category) {
      void fetchRelatedAuctions(auction.category, auction.id);
    } else if (auction) {
      void fetchRelatedAuctions(null, auction.id);
    }
  }, [auction?.id, auction?.category, fetchRelatedAuctions]);

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

  const handleOpenBidSheet = () => {
    if (!auction) return;
    setBidSheetVisible(true);
  };

  const closeBidSheet = () => {
    setBidSheetVisible(false);
  };

  // Auto-open BidSheet when arriving from an outbid notification
  React.useEffect(() => {
    if (openBidSheet && auction && !loading && !bidSheetVisible) {
      // Only auto-open if the auction is still live (bidding is possible)
      const effectiveState = auction.lifecycle;
      if (effectiveState === 'live') {
        setBidSheetVisible(true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openBidSheet, auction, loading]);

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
      reservePriceGbp: auction.reservePriceGbp,
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
    return formatFromFiat(priceAmount, 'GBP');
  }, [priceLabel, priceAmount, formatFromFiat]);

  const countdown = React.useMemo(() => {
    if (!timing) return { text: '', isFinalMinutes: false, stage: 'plenty' as const };
    return resolveDetailCountdown(timing, secondClock, minuteClock);
  }, [timing, secondClock, minuteClock]);

  const countdownProgress = React.useMemo(() => {
    if (!auction || !timing) return undefined;
    const totalMs = new Date(auction.endsAt).getTime() - new Date(auction.startsAt).getTime();
    if (totalMs <= 0) return undefined;
    const elapsedMs = minuteClock - new Date(auction.startsAt).getTime();
    return Math.max(0, Math.min(1, elapsedMs / totalMs));
  }, [auction, timing, minuteClock]);

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
  const reserveStatus = detailInput ? resolveReserveStatus(detailInput) : 'none';
  const showBidControls = !isTerminal && !isSeller;
  const treatmentStyle = stateAction?.viewerTreatment ?? 'none';

  // ── PRODUCT-01: unified view model + shared social state + seller trust + recommendations ──
  const viewModel = React.useMemo(() => {
    if (!auction) return null;
    return buildAuctionViewModel({
      auction,
      currentUserId: currentUser?.id,
    });
  }, [auction, currentUser?.id]);

  const social = useProductSocialState(viewModel);

  const { data: sellerTrustData } = useSellerTrust(auction?.seller.id);
  const sellerFollowMutation = useSellerFollow(auction?.seller.id);

  const { data: recommendationsData, isLoading: recsLoading } = useRecommendations(
    auction?.listingId
  );
  const recommendationSections = recommendationsData?.sections ?? [];
  const railSections = recommendationSections.filter(
    (s) => s.key !== 'seen_in_looks' && s.key !== 'continue_exploring'
  );
  const seenInLooksSection = recommendationSections.find((s) => s.key === 'seen_in_looks');

  const handlePressRecommendation = (recItem: Listing) => {
    navigation.push('ItemDetail', { itemId: recItem.id });
  };
  const handlePressLook = (lookItem: RecommendationLook) => {
    navigation.navigate('LookDetail', { lookId: lookItem.id });
  };

  // Family badge state accent
  const familyStateAccent = isLive ? 'Live' : isUpcoming ? 'Upcoming' : isCancelled ? 'Cancelled'
    : isSettled ? 'Settled' : isEnded ? 'Ended' : null;

  if (loading) {
    return (
      <View style={styles.container}>
        <CommerceStateCanvas state="loading" />
      </View>
    );
  }

  if (error || !auction) {
    return (
      <View style={styles.container}>
        <CommerceStateCanvas
          state="error"
          title={error ?? 'Auction not found'}
          onRetry={() => navigation.goBack()}
          retryLabel="Go Back"
        />
      </View>
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
            tintColor={colors.brand}
            colors={[colors.brand]}
            progressBackgroundColor={colors.surfaceAlt}
          />
        }
      >
        {/* ── 1. Media Hero — near-full-screen with gradient legibility layer ── */}
        <Reanimated.View
          entering={reducedMotionEnabled ? undefined : FadeIn.duration(300)}
        >
          <View style={[styles.heroWrap, { height: HERO_HEIGHT }]}>
            {auction.imageUrl ? (
              <Pressable
                onPress={() => setMediaViewerVisible(true)}
                accessibilityRole="button"
                accessibilityLabel="Open full-screen image viewer"
              >
                <CachedImage
                  uri={auction.imageUrl}
                  style={styles.heroImage}
                  containerStyle={styles.heroImageContainer}
                  contentFit="cover"
                />
              </Pressable>
            ) : (
              <View style={styles.heroPlaceholder}>
                <Ionicons name="image-outline" size={48} color={colors.textMuted} />
              </View>
            )}

            {/* Gradient legibility layer — top-only for floating controls */}
            <LinearGradient
              colors={['rgba(0,0,0,0.35)', 'transparent', 'transparent', 'rgba(0,0,0,0.25)']}
              locations={[0, 0.25, 0.7, 1]}
              style={styles.heroGradient}
            />

            {/* Lifecycle indicator — single clean badge */}
            <View style={styles.heroTopRow}>
              <AuctionStateBadge
                state={isLive ? 'live' : isUpcoming ? 'upcoming' : isCancelled ? 'cancelled' : isSettled ? 'settled' : 'ended'}
              />
            </View>

            {/* Floating controls — back (left), share + save + like + watch (right) */}
            <AnimatedPressable
              style={[styles.backBtnFloating, { top: insets.top + Space.xs }]}
              onPress={() => navigation.goBack()}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              hitSlop={8}
            >
              <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
            </AnimatedPressable>

            <View style={[styles.floatingControlsRight, { top: insets.top + Space.xs }]}>
              <AnimatedPressable
                style={styles.floatingControlBtn}
                onPress={social.openShare}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Share auction"
                hitSlop={8}
              >
                <Ionicons name="share-outline" size={20} color="#FFFFFF" />
              </AnimatedPressable>

              <AnimatedPressable
                style={styles.floatingControlBtn}
                onPress={social.openCollectionPicker}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={social.isSavedToCollection ? 'Saved to collection' : 'Save to collection'}
                hitSlop={8}
              >
                <Ionicons
                  name={social.isSavedToCollection ? 'bookmark' : 'bookmark-outline'}
                  size={20}
                  color={social.isSavedToCollection ? colors.brand : '#FFFFFF'}
                />
              </AnimatedPressable>

              <AnimatedPressable
                style={styles.floatingControlBtn}
                onPress={social.toggleLike}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={social.isLiked ? 'Remove from wishlist' : 'Add to wishlist'}
                hitSlop={8}
              >
                <Ionicons
                  name={social.isLiked ? 'heart' : 'heart-outline'}
                  size={20}
                  color={social.isLiked ? colors.danger : '#FFFFFF'}
                />
              </AnimatedPressable>

              {/* Auction watch — separate from like/save. Eye icon = participation tracking. */}
              <AnimatedPressable
                style={[styles.floatingControlBtn, auction.isWatched && styles.watchBtnFloatingActive]}
                onPress={handleToggleWatch}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={auction.isWatched ? 'Remove from watchlist' : 'Add to watchlist'}
                accessibilityHint={watchToggling ? 'Updating' : undefined}
                hitSlop={8}
              >
                <Ionicons
                  name={auction.isWatched ? 'eye' : 'eye-outline'}
                  size={20}
                  color={auction.isWatched ? colors.brand : '#FFFFFF'}
                />
              </AnimatedPressable>
            </View>

            {/* Unified family badge */}
            <View style={[styles.familyBadgeWrap, { top: insets.top + Space.xs + 48 }]}>
              <ProductFamilyBadge family="auction" stateAccent={familyStateAccent} compact />
            </View>

            {/* Media count hint when multiple media exists (kept minimal) */}
          </View>
        </Reanimated.View>

        {resyncFailed && !error && (
          <View style={styles.resyncBanner}>
            <Ionicons name="sync-circle-outline" size={14} color={colors.textMuted} />
            <Meta style={styles.resyncText}>Clock sync failed — pull to refresh</Meta>
          </View>
        )}

        {/* ── B. Item identity — one primary location, editorial negative space ── */}
        <View style={styles.itemIdentitySection}>
          {auction.brand && <Text style={styles.itemIdentityEyebrow} numberOfLines={1}>{auction.brand}</Text>}
          <Headline style={styles.itemIdentityTitle} numberOfLines={2}>{auction.title}</Headline>
          {auction.conditionLabel && (
            <Text style={styles.itemIdentityCondition}>{auction.conditionLabel}</Text>
          )}
        </View>

        {/* ── C. Auction transaction module — one strong surface ── */}
        <View style={styles.transactionModule}>
          {/* State line */}
          {viewerContext && !isTerminal && (
            <Text
              style={[
                styles.transactionStateLine,
                viewerContext.treatment === 'warning' && { color: colors.danger },
                viewerContext.treatment === 'calm' && { color: colors.success },
                viewerContext.treatment === 'seller' && { color: colors.brand },
              ]}
              numberOfLines={1}
            >
              {viewerContext.title}
              {viewerContext.subtitle ? `  ·  ${viewerContext.subtitle}` : ''}
            </Text>
          )}

          {/* Price — dominant hierarchy with label above */}
          <View style={styles.transactionPriceRow}>
            <View style={styles.transactionPricePrimary}>
              <Text style={styles.transactionPriceLabel}>{priceLabel}</Text>
              {(() => {
                const izeAmount = toIze(priceAmount, 'GBP', goldRates);
                const izeText = formatIzeAmount(izeAmount, 2);
                const localText = formatFromFiat(priceAmount, 'GBP');
                if (displayMode === 'fiat') {
                  return (
                    <>
                      <Text style={styles.transactionPriceValue} numberOfLines={1}>{localText}</Text>
                      <Text style={styles.transactionPriceSecondary} numberOfLines={1}>{izeText}</Text>
                    </>
                  );
                }
                return (
                  <>
                    <Text style={styles.transactionPriceValue} numberOfLines={1}>{izeText}</Text>
                    {displayMode !== 'ize' && (
                      <Text style={styles.transactionPriceSecondary} numberOfLines={1}>≈ {localText}</Text>
                    )}
                  </>
                );
              })()}
            </View>
            <View style={styles.transactionPriceMeta}>
              <Text style={styles.transactionBidCount}>
                {auction.bidCount} {auction.bidCount === 1 ? 'bid' : 'bids'}
              </Text>
            </View>
          </View>

          {/* Minimum to lead (outbid) — actionable emphasis */}
          {isLive && viewerState === 'outbid' && auction.minimumNextBidGbp > 0 && (
            <View style={styles.transactionMinRow}>
              <Text style={styles.transactionMinLabel}>Minimum to lead</Text>
              <Text style={styles.transactionMinValue}>
                {formatIzeAmount(toIze(auction.minimumNextBidGbp, 'GBP', goldRates), 2)}
              </Text>
            </View>
          )}

          {/* Reserve price status — only when reserve is set and auction is live or upcoming */}
          {reserveStatus !== 'none' && !isTerminal && (
            <View style={styles.transactionReserveRow}>
              <ReserveStatusBadge status={reserveStatus} showExplanation />
              {reserveStatus === 'not-met' && isLive && (
                <Text style={styles.transactionReserveHint} numberOfLines={1}>
                  Bidding continues until reserve is met
                </Text>
              )}
            </View>
          )}

          {/* Countdown — tabular-nums, urgency color, progress bar */}
          <View style={styles.transactionCountdownRow}>
            <AuctionCountdown
              text={countdown.text}
              urgent={countdown.isFinalMinutes}
              stage={countdown.stage}
              progress={isLive ? countdownProgress : undefined}
              showProgress={isLive}
            />
          </View>
        </View>

        {/* ── D. Viewer-state action — compact, single next action ── */}
        {!isTerminal && viewerState === 'outbid' && isLive && (
          <View style={styles.outbidActionBlock}>
            <AppButton
              style={styles.outbidAction}
              onPress={handleOpenBidSheet}
              variant="primary"
              size="md"
              align="center"
              title="Bid again"
              accessibilityLabel="Place a new bid to regain the lead"
            />
          </View>
        )}
        {!isTerminal && viewerState === 'leading' && isLive && (
          <View style={styles.leadingBlock}>
            <Ionicons name="checkmark-circle" size={18} color={colors.success} />
            <View style={styles.leadingTextWrap}>
              <Text style={styles.leadingTitle}>You're leading</Text>
              <Text style={styles.leadingSubtitle}>Current value: {formatFromFiat(auction.currentBidGbp, 'GBP')}</Text>
            </View>
          </View>
        )}
        {!isTerminal && viewerState === 'watching' && isLive && (
          <View style={styles.watchingBlock}>
            <Ionicons name="eye-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.watchingText}>You're watching this auction</Text>
          </View>
        )}

        {/* ── Terminal result — one compact module, no duplicate title/brand ── */}
        {isTerminal && !isCancelled && (
          <View style={styles.terminalResultModule}>
            {viewerState === 'won' && (
              <>
                <Text style={styles.terminalResultTitleWon}>You won</Text>
                <Text style={styles.terminalResultValue}>
                  {formatIzeAmount(toIze(auction.currentBidGbp || auction.buyNowPriceGbp || 0, 'GBP', goldRates), 2)}
                </Text>
                <Text style={styles.terminalResultNote}>Next step required — view result for fulfilment details.</Text>
              </>
            )}
            {viewerState === 'lost' && (
              <>
                <Text style={styles.terminalResultTitleLost}>Auction closed</Text>
                <Text style={styles.terminalResultValue}>
                  {formatIzeAmount(toIze(auction.currentBidGbp, 'GBP', goldRates), 2)}
                </Text>
                <Pressable
                  style={styles.discoverLinkInline}
                  onPress={() => navigation.navigate('AuctionHome')}
                  accessibilityRole="button"
                  accessibilityLabel="Discover similar auctions"
                >
                  <Ionicons name="search-outline" size={14} color={colors.brand} />
                  <Text style={styles.discoverLinkInlineText}>Discover similar</Text>
                  <Ionicons name="chevron-forward" size={12} color={colors.brand} />
                </Pressable>
              </>
            )}
            {viewerState === 'seller' && auction.bidCount > 0 && (
              <>
                <Text style={styles.terminalResultTitleSold}>Sold</Text>
                <Text style={styles.terminalResultValue}>
                  {formatIzeAmount(toIze(auction.currentBidGbp || auction.buyNowPriceGbp || 0, 'GBP', goldRates), 2)}
                </Text>
                <Text style={styles.terminalResultNote}>Fulfilment not yet available for this result.</Text>
              </>
            )}
            {viewerState === 'seller' && auction.bidCount === 0 && (
              <Text style={styles.terminalResultTitleLost}>Ended without bids</Text>
            )}
            {viewerState === 'not_participating' && (
              <>
                <Text style={styles.terminalResultTitleLost}>Auction closed</Text>
                <Text style={styles.terminalResultValue}>
                  {formatIzeAmount(toIze(auction.currentBidGbp, 'GBP', goldRates), 2)}
                </Text>
              </>
            )}
          </View>
        )}

        {/* ── Cancelled terminal module ── */}
        {isCancelled && (
          <View style={styles.terminalResultModule}>
            <Text style={styles.terminalResultTitleLost}>Auction cancelled</Text>
            <Text style={styles.terminalResultNote}>
              Cancelled by the seller or platform. No bids were charged.
            </Text>
          </View>
        )}

        {/* ── E. Item evidence/details — description + category evidence ── */}
        {auction.description && (
          <View style={styles.itemDetailsSection}>
            <Text style={styles.itemDetailsDescription}>{auction.description}</Text>
          </View>
        )}

        {/* ── Category evidence — editorial product details ── */}
        {(() => {
          const evidenceGroups = resolveEvidenceGroups({
            category: auction.category,
            brand: auction.brand,
            condition: auction.conditionLabel,
            description: auction.description,
          });
          return evidenceGroups.length > 0 ? (
            <CategoryEvidence groups={evidenceGroups} />
          ) : null;
        })()}

        {/* ── 7. Seller confidence — one canonical module (SellerTrustCard below) ── */}

        {/* ── Bid history — tap to open sheet ── */}
        <View style={styles.section}>
          <Pressable
            style={styles.expandableHeader}
            onPress={() => setBidHistorySheetVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="View bid history"
          >
            <BodyEmphasis style={styles.sectionTitle}>Bid history</BodyEmphasis>
            <View style={styles.expandableHeaderRight}>
              {auction.bidCount > 0 && (
                <Meta style={styles.bidCountTotal}>{auction.bidCount} total</Meta>
              )}
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </View>
          </Pressable>
          {auction.bidCount > 0 && bidActivity.length > 0 && (
            <View style={styles.bidPreviewList}>
              {bidActivity.slice(0, 3).map((bid, index) => {
                const row = formatBidActivityRow(bid, index, formatFromFiat, serverNowRef.current);
                return (
                  <View
                    key={bid.id}
                    style={[styles.bidPreviewRow, row.isTopBid && styles.bidPreviewRowTop]}
                  >
                    <View style={styles.bidPreviewLeft}>
                      <Text style={styles.bidPreviewRank}>{index + 1}</Text>
                      <Text style={styles.bidPreviewBidder} numberOfLines={1}>
                        {row.bidderLabel}
                      </Text>
                      {row.isTopBid && (
                        <View style={styles.bidPreviewTopBadge}>
                          <Text style={styles.bidPreviewTopBadgeText}>LEADING</Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.bidPreviewRight}>
                      <Text style={styles.bidPreviewAmount}>{row.amountText}</Text>
                      {row.relativeTime && (
                        <Text style={styles.bidPreviewTime}>{row.relativeTime}</Text>
                      )}
                    </View>
                  </View>
                );
              })}
              {bidActivity.length > 3 && (
                <Pressable
                  style={styles.bidPreviewMore}
                  onPress={() => setBidHistorySheetVisible(true)}
                  accessibilityRole="button"
                  accessibilityLabel={`View all ${auction.bidCount} bids`}
                >
                  <Text style={styles.bidPreviewMoreText}>
                    View all {auction.bidCount} bids
                  </Text>
                  <Ionicons name="chevron-forward" size={14} color={colors.brand} />
                </Pressable>
              )}
            </View>
          )}
          {auction.bidCount > 0 && bidActivity.length === 0 && (
            <View style={styles.bidSummaryRow}>
              <Text style={styles.bidSummaryLabel}>Highest bid</Text>
              <Text style={styles.bidSummaryValue}>{formatFromFiat(auction.currentBidGbp, 'GBP')}</Text>
            </View>
          )}
        </View>

        {/* ── How bidding works — tap to open sheet ── */}
        <View style={styles.section}>
          <Pressable
            style={styles.expandableHeader}
            onPress={() => setRulesSheetVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="View bidding rules"
          >
            <BodyEmphasis style={styles.sectionTitle}>How bidding works</BodyEmphasis>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </Pressable>
        </View>

        {/* ── Related auction discovery ── */}
        {relatedAuctions.length > 0 && (
          <CommerceRelatedRail
            label="More from this category"
            items={relatedAuctions.map((rel) => {
              const relTiming = resolveAuctionTiming(rel, secondClock);
              const relPrice = rel.bidCount > 0 ? rel.currentBidGbp : rel.startingBidGbp;
              const relStateLabel = relTiming.effectiveState === 'live' ? 'LIVE'
                : relTiming.effectiveState === 'upcoming' ? 'SOON'
                : relTiming.effectiveState === 'cancelled' ? 'CANCELLED'
                : relTiming.effectiveState === 'settled' ? 'SETTLED'
                : 'ENDED';
              const relTimeLabel = relTiming.effectiveState === 'live'
                ? `${Math.floor(relTiming.msToEnd / 60000)}m left`
                : relTiming.effectiveState === 'upcoming'
                ? `in ${Math.floor(relTiming.msToStart / 60000)}m`
                : '';
              return {
                id: rel.id,
                title: rel.title,
                imageUrl: rel.imageUrl,
                priceText: formatFromFiat(relPrice, 'GBP'),
                izeText: displayMode !== 'fiat' ? formatIzeAmount(toIze(relPrice, 'GBP', goldRates), 2) : undefined,
                badgeText: relStateLabel,
                mode: 'auction' as const,
                stateText: relStateLabel,
                countdownText: relTimeLabel || undefined,
              };
            })}
            onPressItem={(id) => navigation.push('AuctionDetail', { auctionId: id })}
          />
        )}

        {/* ── PRODUCT-01: Premium seller trust card with follow ── */}
        {(() => {
          const seller = sellerTrustData ?? {
            id: auction.seller.id,
            username: auction.seller.username,
            avatar: auction.seller.avatarUrl,
            verified: false,
          };
          return (
            <SellerTrustCard
              seller={seller}
              onFollow={() => sellerFollowMutation.mutate()}
              onOpenProfile={() => navigation.navigate('UserProfile', { userId: auction.seller.id })}
              onMessage={!isSeller ? () =>
                navigation.navigate('NewMessage', {
                  preselectedUserId: auction.seller.id,
                  preselectedDisplayName: auction.seller.username,
                })
              : undefined}
            />
          );
        })()}

        {/* ── PRODUCT-01: Seen in Looks ── */}
        {seenInLooksSection && seenInLooksSection.items.length > 0 && (
          <View style={styles.recommendationSection}>
            <RecommendationRail
              section={seenInLooksSection}
              listingId={auction.listingId}
              onPressItem={(recItem) => {
                if (isRecommendationLook(recItem)) {
                  handlePressLook(recItem);
                } else {
                  handlePressRecommendation(recItem as Listing);
                }
              }}
            />
          </View>
        )}

        {/* ── PRODUCT-01: Personalised recommendation rails via underlying listingId ── */}
        {recsLoading && railSections.length === 0 ? null : (
          railSections.map((section) => (
            <View key={section.key} style={styles.recommendationSection}>
              <RecommendationRail
                section={section}
                listingId={auction.listingId}
                onPressItem={(recItem) => {
                  if (isRecommendationLook(recItem)) {
                    handlePressLook(recItem);
                  } else {
                    handlePressRecommendation(recItem as Listing);
                  }
                }}
              />
            </View>
          ))
        )}

        <View style={{ height: 100 + insets.bottom }} />
      </ScrollView>

      {/* ── Sticky bottom action dock ── */}
      {showBidControls && stateAction && stateAction.primary.type !== 'none' && (
        <AuctionStickyBidDock
          primaryLabel={stateAction.primary.label}
          onPrimary={() => {
            if (stateAction.primary.type === 'placeBid' || stateAction.primary.type === 'increaseBid' || stateAction.primary.type === 'bidAgain') {
              handleOpenBidSheet();
            } else if (stateAction.primary.type === 'watchAuction') {
              void handleToggleWatch();
            } else if (stateAction.primary.type === 'viewSimilar') {
              navigation.navigate('MainTabs', { screen: 'Explore' });
            }
          }}
          primaryLoading={isSubmittingBid || watchToggling}
          disabled={isSubmittingBid || watchToggling}
          secondaryLabel={buyNowAvailable && stateAction.secondary.type === 'buyNow' && !isBuyNowLoading
            ? `Buy Now · ${formatFromFiat(auction.buyNowPriceGbp!, 'GBP')}`
            : isBuyNowLoading ? 'Processing…' : undefined}
          onSecondary={buyNowAvailable && stateAction.secondary.type === 'buyNow' ? openBuyNowSheet : undefined}
          contextLine={isLive && auction.minimumNextBidGbp > 0
            ? `Min bid · ${formatFromFiat(auction.minimumNextBidGbp, 'GBP')}`
            : undefined}
        />
      )}

      {isSeller && !isTerminal && stateAction && stateAction.primary.type !== 'none' && (
        <AuctionStickyBidDock
          variant="seller"
          primaryLabel=""
          onPrimary={() => {}}
          terminalMessage={isUpcoming ? 'Your auction is scheduled' : `${auction.bidCount} ${auction.bidCount === 1 ? 'bid' : 'bids'} so far`}
        />
      )}

      {isTerminal && (
        <AuctionStickyBidDock
          variant="terminal"
          primaryLabel=""
          onPrimary={() => {}}
          terminalMessage={
            isCancelled ? 'Auction cancelled'
            : viewerState === 'won' ? 'You won this auction'
            : viewerState === 'lost' ? 'Auction ended — you did not win'
            : isSeller && auction.bidCount > 0 ? `Sold — ${auction.bidCount} ${auction.bidCount === 1 ? 'bid' : 'bids'}`
            : isSeller ? 'Ended without bids'
            : 'Auction ended'
          }
          terminalIcon={
            isCancelled ? 'close-circle-outline'
            : viewerState === 'won' ? 'trophy-outline'
            : viewerState === 'lost' ? 'close-circle-outline'
            : isSeller && auction.bidCount > 0 ? 'checkmark-circle-outline'
            : isSeller ? 'close-circle-outline'
            : 'checkmark-done-outline'
          }
          terminalAccent={
            viewerState === 'won' ? colors.success
            : isSeller && auction.bidCount > 0 ? colors.brand
            : colors.textMuted
          }
        />
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
          initialBidAmount={initialBidAmount}
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

      {/* ── Bid history bottom sheet ── */}
      <BottomSheet
        visible={bidHistorySheetVisible}
        onDismiss={() => setBidHistorySheetVisible(false)}
        snapPoint={0.6}
      >
        <View style={styles.sheetHeader}>
          <Headline style={styles.sheetTitle}>Bid history</Headline>
          {auction && auction.bidCount > 0 && (
            <Meta style={styles.sheetSubtitle}>{auction.bidCount} bids</Meta>
          )}
        </View>

        {bidActivityError && (
          <View style={styles.subSectionError}>
            <Text style={styles.subSectionErrorText}>Couldn't load bid history</Text>
            <Pressable onPress={() => { setBidActivityError(false); void fetchDetail(); }}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        )}

        {!bidActivityError && bidActivity.length === 0 && (
          <Text style={styles.noBidsText}>No bids placed yet.</Text>
        )}

        {!bidActivityError && bidActivity.length > 0 && (
          <ScrollView style={styles.sheetScroll} showsVerticalScrollIndicator={false}>
            <View style={styles.bidList}>
              {bidActivity.map((bid, index) => {
                const row = formatBidActivityRow(bid, index, formatFromFiat, serverNowRef.current);
                return (
                  <View
                    key={bid.id}
                    style={[styles.bidRow, row.isTopBid && styles.bidRowTop]}
                  >
                    <View style={styles.bidRowLeft}>
                      {row.isViewer && (
                        <View style={styles.viewerBadge}>
                          <Text style={styles.viewerBadgeText}>YOU</Text>
                        </View>
                      )}
                      <View style={styles.bidRowInfo}>
                        <View style={styles.bidRowNameLine}>
                          <Text style={styles.bidderName}>{row.bidderLabel}</Text>
                          {row.isTopBid && (
                            <Text style={styles.topBidLabel}>Top bid</Text>
                          )}
                        </View>
                        {row.relativeTime && (
                          <Text style={styles.bidRelativeTime}>{row.relativeTime}</Text>
                        )}
                      </View>
                    </View>
                    <View style={styles.bidRowRight}>
                      <Text style={styles.bidAmount}>{row.amountText}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        )}
      </BottomSheet>

      {/* ── How bidding works bottom sheet ── */}
      <BottomSheet
        visible={rulesSheetVisible}
        onDismiss={() => setRulesSheetVisible(false)}
        snapPoint={0.65}
      >
        <View style={styles.sheetHeader}>
          <Headline style={styles.sheetTitle}>How bidding works</Headline>
        </View>
        <ScrollView style={styles.sheetScroll} showsVerticalScrollIndicator={false}>
          <View style={styles.rulesContainer}>
            <View style={styles.ruleItem}>
              <View style={styles.ruleNumber}>
                <Text style={styles.ruleNumberText}>1</Text>
              </View>
              <View style={styles.ruleContent}>
                <BodyEmphasis style={styles.ruleTitle}>Place your bid</BodyEmphasis>
                <Text style={styles.ruleDescription}>
                  Enter an amount equal to or above the minimum next bid shown. The system accepts your bid instantly if it's higher than the current top bid.
                </Text>
              </View>
            </View>

            <View style={styles.ruleItem}>
              <View style={styles.ruleNumber}>
                <Text style={styles.ruleNumberText}>2</Text>
              </View>
              <View style={styles.ruleContent}>
                <BodyEmphasis style={styles.ruleTitle}>Outbid alerts</BodyEmphasis>
                <Text style={styles.ruleDescription}>
                  If another bidder places a higher bid, you'll be notified immediately. Come back and place a new bid to reclaim the top spot.
                </Text>
              </View>
            </View>

            <View style={styles.ruleItem}>
              <View style={styles.ruleNumber}>
                <Text style={styles.ruleNumberText}>3</Text>
              </View>
              <View style={styles.ruleContent}>
                <BodyEmphasis style={styles.ruleTitle}>Winning the auction</BodyEmphasis>
                <Text style={styles.ruleDescription}>
                  When the auction ends, the highest bidder wins. You'll be prompted to complete checkout and arrange delivery.
                </Text>
              </View>
            </View>

            <View style={styles.ruleItem}>
              <View style={styles.ruleNumber}>
                <Text style={styles.ruleNumberText}>4</Text>
              </View>
              <View style={styles.ruleContent}>
                <BodyEmphasis style={styles.ruleTitle}>Buy Now option</BodyEmphasis>
                <Text style={styles.ruleDescription}>
                  Some auctions include a Buy Now price. Use it to skip bidding and purchase the item instantly before the auction ends.
                </Text>
              </View>
            </View>

            <View style={styles.ruleItem}>
              <View style={styles.ruleNumber}>
                <Text style={styles.ruleNumberText}>5</Text>
              </View>
              <View style={styles.ruleContent}>
                <BodyEmphasis style={styles.ruleTitle}>Reserve prices</BodyEmphasis>
                <Text style={styles.ruleDescription}>
                  Some auctions have a hidden reserve price set by the seller. If the highest bid hasn't met the reserve when the auction ends, the seller isn't obligated to sell. The "Reserve met" badge means the current top bid has reached or exceeded this threshold.
                </Text>
              </View>
            </View>

            <View style={styles.ruleItem}>
              <View style={styles.ruleNumber}>
                <Text style={styles.ruleNumberText}>6</Text>
              </View>
              <View style={styles.ruleContent}>
                <BodyEmphasis style={styles.ruleTitle}>Currency & payments</BodyEmphasis>
                <Text style={styles.ruleDescription}>
                  Bids are placed in GBP and automatically converted to your local currency for display. Final settlement uses the 1ZE platform value.
                </Text>
              </View>
            </View>

            <View style={{ height: Space.xl }} />
          </View>
        </ScrollView>
      </BottomSheet>

      {/* ── Fullscreen media viewer ── */}
      <FullscreenMediaViewer
        images={auction.imageUrl ? [auction.imageUrl] : []}
        initialIndex={0}
        visible={mediaViewerVisible}
        onClose={() => setMediaViewerVisible(false)}
      />

      {/* ── PRODUCT-01: Save to collection + share (shared social actions) ── */}
      <SaveToCollectionModal
        visible={social.collectionModalVisible}
        itemId={auction.id}
        onClose={social.closeCollectionPicker}
      />
      <ShareSheet
        visible={social.shareVisible}
        onDismiss={social.closeShare}
        url={`https://thryftverse.com/auction/${auction.id}`}
        title={auction.title}
      />
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
  },
  heroImageContainer: {
    width: '100%',
    height: '100%',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  heroTopRow: {
    position: 'absolute',
    top: Space.sm,
    left: Space.sm,
    flexDirection: 'row',
    gap: 6,
  },
  heroBottomStage: {
    position: 'absolute',
    bottom: Space.md,
    left: Space.md,
    right: Space.md,
    gap: 6,
  },
  stateLine: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    fontFamily: Typography.family.semibold,
  },
  priceStageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  priceStagePrimary: {
    flex: 1,
  },
  priceStageLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    marginBottom: 2,
    fontFamily: Typography.family.regular,
  },
  priceStageValue: {
    fontSize: 42,
    lineHeight: 48,
    fontWeight: '700',
    letterSpacing: -1,
    color: '#FFFFFF',
    fontFamily: Typography.family.bold,
  },
  outbidMinText: {
    fontSize: 13,
    marginTop: 4,
    fontFamily: Typography.family.medium,
  },
  priceStageIze: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 2,
    fontFamily: Typography.family.regular,
  },
  priceStageMeta: {
    alignItems: 'flex-end',
    paddingBottom: 4,
  },
  bidCountInline: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    fontFamily: Typography.family.medium,
  },
  countdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  countdownText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
    fontFamily: Typography.family.medium,
  },
  countdownTextUrgent: {
    fontWeight: '700',
    fontSize: 16,
    fontFamily: Typography.family.bold,
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
    left: Space.sm,
    width: 42,
    height: 42,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  watchBtnFloating: {
    position: 'absolute',
    right: Space.sm,
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  watchBtnFloatingActive: {
    backgroundColor: 'rgba(244,240,232,0.15)',
    borderColor: 'rgba(244,240,232,0.3)',
  },
  floatingControlsRight: {
    position: 'absolute',
    right: Space.sm,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  floatingControlBtn: {
    width: 42,
    height: 42,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  familyBadgeWrap: {
    position: 'absolute',
    left: Space.sm,
  },
  recommendationSection: {
    marginTop: Space.md,
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
    fontFamily: Typography.family.bold,
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
    fontFamily: Typography.family.semibold,
  },
  bidCountLabel: {
    fontSize: 11,
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
    fontFamily: Typography.family.medium,
  },
  outbidHintAmount: {
    fontFamily: Typography.family.bold,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: Space.sm,
  },
  timeText: {
    fontSize: 14,
    fontFamily: Typography.family.medium,
  },
  timeTextUrgent: {
    fontWeight: '700',
    fontSize: 16,
    fontFamily: Typography.family.bold,
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
    fontFamily: Typography.family.semibold,
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
  },
  // ── Removed inline action styles (PASS 4 correction pass 1) ──
  // ── Active viewer-state compositions ──
  outbidActionBlock: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.lg,
    alignItems: 'center',
    gap: Space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  outbidHeadline: {
    fontSize: 18,
    fontFamily: Typography.family.bold,
    marginBottom: Space.xs,
  },
  outbidMinLabel: {
    fontSize: 13,
    fontFamily: Typography.family.regular,
  },
  outbidMinValue: {
    fontSize: 28,
    fontFamily: Typography.family.bold,
    letterSpacing: -0.5,
    marginBottom: Space.sm,
  },
  outbidAction: {
    width: '100%',
  },
  leadingBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  leadingTextWrap: {
    flex: 1,
  },
  leadingTitle: {
    fontSize: 16,
    fontFamily: Typography.family.semibold,
  },
  leadingSubtitle: {
    fontSize: 13,
    fontFamily: Typography.family.regular,
    marginTop: 2,
  },
  watchingBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  watchingText: {
    fontSize: 14,
    fontFamily: Typography.family.regular,
  },
  // ── Item story ──
  itemStorySection: {
    paddingHorizontal: Space.md,
    paddingTop: Space.lg,
    gap: Space.xs,
  },
  itemStoryBrand: {
    fontSize: 13,
    fontFamily: Typography.family.medium,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  itemStoryTitle: {
    fontSize: 22,
    fontFamily: Typography.family.bold,
    letterSpacing: -0.3,
  },
  itemStoryCondition: {
    fontSize: 13,
    fontFamily: Typography.family.regular,
  },
  itemStoryDescription: {
    fontSize: 15,
    lineHeight: 22,
    fontFamily: Typography.family.regular,
    marginTop: Space.xs,
  },

  // ── B. Item identity — one primary location below media ──
  itemIdentitySection: {
    paddingHorizontal: Space.md,
    paddingTop: Space.lg,
    paddingBottom: Space.sm,
    gap: Space.xs,
  },
  itemIdentityEyebrow: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: Typography.family.semibold,
    textTransform: 'uppercase',
    letterSpacing: 1.0,
  },
  itemIdentityTitle: {
    fontSize: 26,
    lineHeight: 32,
    fontFamily: Typography.family.bold,
    letterSpacing: -0.6,
  },
  itemIdentityCondition: {
    fontSize: 13,
    fontFamily: Typography.family.regular,
    marginTop: 2,
  },

  // ── C. Auction transaction module — one strong surface ──
  transactionModule: {
    marginHorizontal: Space.md,
    marginTop: Space.sm,
    padding: Space.md + 2,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: Space.sm,
  },
  transactionStateLine: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: Typography.family.semibold,
    letterSpacing: -0.1,
  },
  transactionPriceRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  transactionPricePrimary: {
    flex: 1,
  },
  transactionPriceLabel: {
    fontSize: 11,
    fontWeight: '500',
    fontFamily: Typography.family.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  transactionPriceValue: {
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '700',
    fontFamily: Typography.family.bold,
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
  transactionPriceSecondary: {
    fontSize: 14,
    fontFamily: Typography.family.regular,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  transactionPriceMeta: {
    alignItems: 'flex-end',
    paddingBottom: 2,
  },
  transactionBidCount: {
    fontSize: 13,
    fontFamily: Typography.family.medium,
  },
  transactionMinRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingVertical: Space.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  transactionMinLabel: {
    fontSize: 12,
    fontFamily: Typography.family.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  transactionMinValue: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: Typography.family.bold,
    fontVariant: ['tabular-nums'],
  },
  transactionReserveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    flexWrap: 'wrap',
  },
  transactionReserveHint: {
    fontSize: 11,
    fontFamily: Typography.family.regular,
    flexShrink: 1,
  },
  transactionCountdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  transactionCountdownText: {
    fontSize: 14,
    fontWeight: '500',
    fontFamily: Typography.family.medium,
    fontVariant: ['tabular-nums'],
  },

  // ── Terminal result — one compact module (120-220pt) ──
  terminalResultModule: {
    marginHorizontal: Space.md,
    marginTop: Space.sm,
    padding: Space.md + 2,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: Space.xs + 2,
  },
  terminalResultTitleWon: {
    fontSize: 20,
    fontWeight: '700',
    fontFamily: Typography.family.bold,
  },
  terminalResultTitleLost: {
    fontSize: 20,
    fontWeight: '700',
    fontFamily: Typography.family.bold,
  },
  terminalResultTitleSold: {
    fontSize: 20,
    fontWeight: '700',
    fontFamily: Typography.family.bold,
  },
  terminalResultValue: {
    fontSize: 22,
    fontWeight: '700',
    fontFamily: Typography.family.bold,
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
  },
  terminalResultNote: {
    fontSize: 13,
    fontFamily: Typography.family.regular,
    lineHeight: 18,
  },

  // ── E. Item details ──
  itemDetailsSection: {
    paddingHorizontal: Space.md,
    paddingTop: Space.lg,
  },
  itemDetailsDescription: {
    fontSize: 15,
    lineHeight: 22,
    fontFamily: Typography.family.regular,
  },
  titleSection: {
    paddingHorizontal: Space.md,
    paddingTop: Space.lg,
  },
  brandLabel: {
    marginBottom: 4,
    fontSize: 12,
    fontWeight: '500',
  },
  title: {
    marginBottom: 4,
  },
  conditionLabel: {
  },
  expandableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Space.xs,
  },
  expandableHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
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
  },
  bidSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Space.xs,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.sm,
    borderRadius: Radius.sm,
  },
  bidSummaryLabel: {
    fontSize: 13,
    fontFamily: Typography.family.medium,
  },
  bidSummaryValue: {
    fontSize: 15,
    fontWeight: '600',
    fontFamily: Typography.family.semibold,
  },
  bidPreviewList: {
    marginTop: Space.xs,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  bidPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  bidPreviewRowTop: {
      },
  bidPreviewLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    flex: 1,
  },
  bidPreviewRank: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: Typography.family.bold,
    minWidth: 14,
  },
  bidPreviewBidder: {
    fontSize: 13,
    fontFamily: Typography.family.regular,
    flexShrink: 1,
  },
  bidPreviewTopBadge: {
    borderRadius: 3,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  bidPreviewTopBadgeText: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  bidPreviewRight: {
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 1,
  },
  bidPreviewAmount: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: Typography.family.semibold,
    fontVariant: ['tabular-nums'],
  },
  bidPreviewTime: {
    fontSize: 10,
    fontFamily: Typography.family.regular,
  },
  bidPreviewMore: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: Space.sm,
  },
  bidPreviewMoreText: {
    fontSize: 13,
    fontFamily: Typography.family.medium,
  },
  bidList: {
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  bidRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  bidRowTop: {
  },
  bidRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    flex: 1,
  },
  viewerBadge: {
    borderRadius: Radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  viewerBadgeText: {
    fontSize: 9,
    fontWeight: '700',
  },
  bidderName: {
    fontSize: 13,
    fontFamily: Typography.family.regular,
  },
  bidRowInfo: {
    flexDirection: 'column',
    gap: 1,
  },
  bidRowNameLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  bidRelativeTime: {
    fontSize: 11,
    fontFamily: Typography.family.regular,
  },
  bidRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  bidAmount: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: Typography.family.semibold,
  },
  topBidLabel: {
    fontSize: 10,
    fontWeight: '600',
  },
  noBidsText: {
    fontSize: 14,
    fontFamily: Typography.family.regular,
  },
  subSectionError: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderRadius: Radius.md,
  },
  subSectionErrorText: {
  },
  retryText: {
    fontSize: 13,
    fontWeight: '600',
  },
  descriptionText: {
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
  },
  itemInfoValue: {
    fontSize: 14,
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
    lineHeight: 20,
  },
  actionDock: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
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
    fontFamily: Typography.family.medium,
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
    fontFamily: Typography.family.medium,
  },
  terminalDock: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
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
    fontFamily: Typography.family.medium,
  },
  resultBodySection: {
    paddingHorizontal: Space.md,
    paddingTop: Space.xl,
    paddingBottom: Space.md,
  },
  resultExperience: {
    alignItems: 'center',
    gap: Space.sm,
  },
  resultEyebrow: {
    fontSize: 12,
    fontFamily: Typography.family.medium,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  resultTitleWon: {
    fontSize: 32,
    fontFamily: Typography.family.bold,
    letterSpacing: -0.5,
  },
  resultTitleLost: {
    fontSize: 32,
    fontFamily: Typography.family.bold,
    letterSpacing: -0.5,
  },
  resultTitleSold: {
    fontSize: 32,
    fontFamily: Typography.family.bold,
    letterSpacing: -0.5,
  },
  resultPrice: {
    fontSize: 28,
    fontFamily: Typography.family.semibold,
    marginTop: Space.xs,
  },
  resultPriceSecondary: {
    fontSize: 22,
    fontFamily: Typography.family.medium,
    marginTop: Space.xs,
  },
  resultItemTitle: {
    fontSize: 16,
    fontFamily: Typography.family.regular,
    textAlign: 'center',
    marginTop: Space.xs,
  },
  resultBrand: {
    fontSize: 13,
    fontFamily: Typography.family.regular,
  },
  resultMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    marginTop: Space.xs,
  },
  resultMetaText: {
    fontSize: 14,
    fontFamily: Typography.family.medium,
  },
  resultNote: {
    textAlign: 'center',
    marginTop: Space.sm,
    fontSize: 13,
    lineHeight: 18,
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
    fontFamily: Typography.family.semibold,
    fontSize: 14,
  },
  transactionTruthSection: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  transactionTruthText: {
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
    fontFamily: Typography.family.semibold,
  },
  // ── Bottom sheet styles ──
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingBottom: Space.md,
  },
  sheetTitle: {
    fontSize: 22,
  },
  sheetSubtitle: {
  },
  sheetScroll: {
    flex: 1,
  },
  rulesContainer: {
    gap: Space.lg,
  },
  ruleItem: {
    flexDirection: 'row',
    gap: Space.md,
  },
  ruleNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  ruleNumberText: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: Typography.family.bold,
  },
  ruleContent: {
    flex: 1,
    gap: 4,
  },
  ruleTitle: {
    fontSize: 15,
  },
  ruleDescription: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: Typography.family.regular,
  },
});
