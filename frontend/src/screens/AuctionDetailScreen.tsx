import React from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
  Text,
  Dimensions,
  LayoutAnimation,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
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
import { toIze, formatIzeAmount } from '../utils/currency';
import { Space, Radius } from '../theme/designTokens';
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
} from '../utils/auctionDetailLogic';

type NavT = StackNavigationProp<RootStackParamList>;
type RouteT = RouteProp<RootStackParamList, 'AuctionDetail'>;

export default function AuctionDetailScreen() {
  const navigation = useNavigation<NavT>();
  const route = useRoute<RouteT>();
  const { auctionId } = route.params;
  const { show } = useToast();
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

  const SCREEN_HEIGHT = Dimensions.get('window').height;
  const HERO_HEIGHT = Math.min(SCREEN_HEIGHT * 0.48, 440);

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
    return formatFromFiat(priceAmount, 'GBP');
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
            tintColor={Colors.brand}
            colors={[Colors.brand]}
            progressBackgroundColor={Colors.surfaceAlt}
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
                <Ionicons name="image-outline" size={48} color={Colors.textMuted} />
              </View>
            )}

            {/* Gradient legibility layer — top-only for floating controls */}
            <LinearGradient
              colors={['rgba(0,0,0,0.35)', 'transparent', 'transparent', 'rgba(0,0,0,0.25)']}
              locations={[0, 0.25, 0.7, 1]}
              style={styles.heroGradient}
            />

            {/* Lifecycle indicator — single clean pill */}
            <View style={styles.heroTopRow}>
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

            {/* Floating controls — back (left), share + save + like + watch (right) */}
            <AnimatedPressable
              style={[styles.backBtnFloating, { top: insets.top + Space.xs }]}
              onPress={() => navigation.goBack()}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              hitSlop={4}
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
                hitSlop={4}
              >
                <Ionicons name="share-outline" size={20} color="#FFFFFF" />
              </AnimatedPressable>

              <AnimatedPressable
                style={styles.floatingControlBtn}
                onPress={social.openCollectionPicker}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={social.isSavedToCollection ? 'Saved to collection' : 'Save to collection'}
                hitSlop={4}
              >
                <Ionicons
                  name={social.isSavedToCollection ? 'bookmark' : 'bookmark-outline'}
                  size={20}
                  color={social.isSavedToCollection ? Colors.brand : '#FFFFFF'}
                />
              </AnimatedPressable>

              <AnimatedPressable
                style={styles.floatingControlBtn}
                onPress={social.toggleLike}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={social.isLiked ? 'Remove from wishlist' : 'Add to wishlist'}
                hitSlop={4}
              >
                <Ionicons
                  name={social.isLiked ? 'heart' : 'heart-outline'}
                  size={20}
                  color={social.isLiked ? Colors.danger : '#FFFFFF'}
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
                hitSlop={4}
              >
                <Ionicons
                  name={auction.isWatched ? 'eye' : 'eye-outline'}
                  size={20}
                  color={auction.isWatched ? Colors.brand : '#FFFFFF'}
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
            <Ionicons name="sync-circle-outline" size={14} color={Colors.textMuted} />
            <Meta style={styles.resyncText}>Clock sync failed — pull to refresh</Meta>
          </View>
        )}

        {/* ── B. Item identity — one primary location, editorial negative space ── */}
        <View style={styles.itemIdentitySection}>
          {auction.brand && <Text style={styles.itemIdentityEyebrow} numberOfLines={1}>{auction.brand.toUpperCase()}</Text>}
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
                viewerContext.treatment === 'warning' && { color: Colors.danger },
                viewerContext.treatment === 'calm' && { color: Colors.success },
                viewerContext.treatment === 'seller' && { color: Colors.brand },
              ]}
              numberOfLines={1}
            >
              {viewerContext.title}
              {viewerContext.subtitle ? `  ·  ${viewerContext.subtitle}` : ''}
            </Text>
          )}

          {/* Price — 1ZE visually primary in both-mode display */}
          <View style={styles.transactionPriceRow}>
            <View style={styles.transactionPricePrimary}>
              <Text style={styles.transactionPriceLabel}>{priceLabel}</Text>
              {(() => {
                const izeAmount = toIze(priceAmount, 'GBP', goldRates);
                const izeText = formatIzeAmount(izeAmount);
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

          {/* Minimum to lead (outbid) */}
          {isLive && viewerState === 'outbid' && auction.minimumNextBidGbp > 0 && (
            <View style={styles.transactionMinRow}>
              <Text style={styles.transactionMinLabel}>Minimum to lead</Text>
              <Text style={styles.transactionMinValue}>
                {formatIzeAmount(toIze(auction.minimumNextBidGbp, 'GBP', goldRates))}
              </Text>
            </View>
          )}

          {/* Countdown / state time */}
          <View style={styles.transactionCountdownRow}>
            <Ionicons
              name={
                isLive ? 'flash-outline'
                : isUpcoming ? 'time-outline'
                : isCancelled ? 'close-circle-outline'
                : isSettled ? 'checkmark-circle-outline'
                : 'checkmark-done-outline'
              }
              size={14}
              color={countdown.isFinalMinutes ? Colors.danger : Colors.textSecondary}
            />
            <Text
              style={[styles.transactionCountdownText, countdown.isFinalMinutes && { color: Colors.danger }]}
              accessibilityRole="text"
              accessibilityLabel={countdown.text}
              numberOfLines={1}
            >
              {countdown.text}
            </Text>
          </View>
        </View>

        {/* ── D. Viewer-state action — compact, single next action ── */}
        {!isTerminal && viewerState === 'outbid' && isLive && (
          <View style={styles.outbidActionBlock}>
            <AppButton
              style={styles.outbidAction}
              onPress={openBidSheet}
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
            <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
            <View style={styles.leadingTextWrap}>
              <Text style={styles.leadingTitle}>You're leading</Text>
              <Text style={styles.leadingSubtitle}>Current value: {formatFromFiat(auction.currentBidGbp, 'GBP')}</Text>
            </View>
          </View>
        )}
        {!isTerminal && viewerState === 'watching' && isLive && (
          <View style={styles.watchingBlock}>
            <Ionicons name="eye-outline" size={16} color={Colors.textSecondary} />
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
                  {formatIzeAmount(toIze(auction.currentBidGbp || auction.buyNowPriceGbp || 0, 'GBP', goldRates))}
                </Text>
                <Text style={styles.terminalResultNote}>Next step required — view result for fulfilment details.</Text>
              </>
            )}
            {viewerState === 'lost' && (
              <>
                <Text style={styles.terminalResultTitleLost}>Auction closed</Text>
                <Text style={styles.terminalResultValue}>
                  {formatIzeAmount(toIze(auction.currentBidGbp, 'GBP', goldRates))}
                </Text>
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
              </>
            )}
            {viewerState === 'seller' && auction.bidCount > 0 && (
              <>
                <Text style={styles.terminalResultTitleSold}>Sold</Text>
                <Text style={styles.terminalResultValue}>
                  {formatIzeAmount(toIze(auction.currentBidGbp || auction.buyNowPriceGbp || 0, 'GBP', goldRates))}
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
                  {formatIzeAmount(toIze(auction.currentBidGbp, 'GBP', goldRates))}
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
              <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
            </View>
          </Pressable>
          {auction.bidCount > 0 && (
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
            <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
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
                izeText: displayMode !== 'fiat' ? formatIzeAmount(toIze(relPrice, 'GBP', goldRates)) : undefined,
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
        <CommerceStickyDock bottomInset={insets.bottom}>
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
              accessibilityLabel={`Buy now for ${formatFromFiat(auction.buyNowPriceGbp!, 'GBP')}`}
              accessibilityHint="Fixed price purchase. Ends auction immediately. Requires confirmation."
            >
              <Text style={styles.buyNowLinkText}>
                {isBuyNowLoading ? 'Processing...' : `or Buy Now for ${formatFromFiat(auction.buyNowPriceGbp!, 'GBP')}`}
              </Text>
            </Pressable>
          )}
        </CommerceStickyDock>
      )}

      {isSeller && !isTerminal && stateAction && stateAction.primary.type !== 'none' && (
        <CommerceStickyDock bottomInset={insets.bottom}>
          <View style={styles.sellerDockInfo}>
            <Ionicons name="storefront-outline" size={16} color={Colors.brand} />
            <Text style={styles.sellerDockText}>
              {isUpcoming ? 'Your auction is scheduled' : `${auction.bidCount} ${auction.bidCount === 1 ? 'bid' : 'bids'} so far`}
            </Text>
          </View>
        </CommerceStickyDock>
      )}

      {isTerminal && (
        <CommerceStickyDock bottomInset={insets.bottom}>
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
        </CommerceStickyDock>
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
                const row = formatBidActivityRow(bid, index, formatFromFiat);
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
                      <Text style={styles.bidderName}>{row.bidderLabel}</Text>
                      {row.isTopBid && (
                        <Text style={styles.topBidLabel}>Top bid</Text>
                      )}
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
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '50%',
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
    fontFamily: 'Inter_600SemiBold',
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
    fontFamily: 'Inter_400Regular',
  },
  priceStageValue: {
    fontSize: 42,
    lineHeight: 48,
    fontWeight: '700',
    letterSpacing: -1,
    color: '#FFFFFF',
    fontFamily: 'Inter_700Bold',
  },
  outbidMinText: {
    fontSize: 13,
    color: '#ff6b6b',
    marginTop: 4,
    fontFamily: 'Inter_500Medium',
  },
  priceStageIze: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 2,
    fontFamily: 'Inter_400Regular',
  },
  priceStageMeta: {
    alignItems: 'flex-end',
    paddingBottom: 4,
  },
  bidCountInline: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    fontFamily: 'Inter_500Medium',
  },
  countdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  countdownText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
    fontFamily: 'Inter_500Medium',
  },
  countdownTextUrgent: {
    color: '#ff6b6b',
    fontWeight: '700',
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
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
  floatingControlsRight: {
    position: 'absolute',
    right: Space.sm,
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  floatingControlBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
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
  // ── Active viewer-state compositions ──
  outbidActionBlock: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.lg,
    alignItems: 'center',
    gap: Space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  outbidHeadline: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    color: Colors.danger,
    marginBottom: Space.xs,
  },
  outbidMinLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontFamily: 'Inter_400Regular',
  },
  outbidMinValue: {
    fontSize: 28,
    fontFamily: 'Inter_700Bold',
    color: Colors.textPrimary,
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
    borderBottomColor: Colors.border,
  },
  leadingTextWrap: {
    flex: 1,
  },
  leadingTitle: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.success,
  },
  leadingSubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },
  watchingBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  watchingText: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontFamily: 'Inter_400Regular',
  },
  // ── Item story ──
  itemStorySection: {
    paddingHorizontal: Space.md,
    paddingTop: Space.lg,
    gap: Space.xs,
  },
  itemStoryBrand: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontFamily: 'Inter_500Medium',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  itemStoryTitle: {
    fontSize: 22,
    fontFamily: 'Inter_700Bold',
    color: Colors.textPrimary,
    letterSpacing: -0.3,
  },
  itemStoryCondition: {
    fontSize: 13,
    color: Colors.textMuted,
    fontFamily: 'Inter_400Regular',
  },
  itemStoryDescription: {
    fontSize: 15,
    color: Colors.textSecondary,
    lineHeight: 22,
    fontFamily: 'Inter_400Regular',
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
    color: Colors.textSecondary,
    fontFamily: 'Inter_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  itemIdentityTitle: {
    fontSize: 24,
    lineHeight: 30,
    fontFamily: 'Inter_700Bold',
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  itemIdentityCondition: {
    fontSize: 13,
    color: Colors.textMuted,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },

  // ── C. Auction transaction module — one strong surface ──
  transactionModule: {
    marginHorizontal: Space.md,
    marginTop: Space.sm,
    padding: Space.md,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Space.sm,
  },
  transactionStateLine: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
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
    color: Colors.textMuted,
    fontFamily: 'Inter_500Medium',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  transactionPriceValue: {
    fontSize: 26,
    lineHeight: 30,
    fontWeight: '700',
    color: Colors.textPrimary,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.4,
  },
  transactionPriceSecondary: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },
  transactionPriceMeta: {
    alignItems: 'flex-end',
    paddingBottom: 2,
  },
  transactionBidCount: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontFamily: 'Inter_500Medium',
  },
  transactionMinRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingVertical: Space.xs,
    borderTopWidth: 0.5,
    borderTopColor: Colors.border,
  },
  transactionMinLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontFamily: 'Inter_500Medium',
  },
  transactionMinValue: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.danger,
    fontFamily: 'Inter_700Bold',
  },
  transactionCountdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  transactionCountdownText: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.textSecondary,
    fontFamily: 'Inter_500Medium',
    fontVariant: ['tabular-nums'],
  },

  // ── Terminal result — one compact module (120-220pt) ──
  terminalResultModule: {
    marginHorizontal: Space.md,
    marginTop: Space.sm,
    padding: Space.md,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Space.xs,
  },
  terminalResultTitleWon: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.success,
    fontFamily: 'Inter_700Bold',
  },
  terminalResultTitleLost: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textPrimary,
    fontFamily: 'Inter_700Bold',
  },
  terminalResultTitleSold: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.brand,
    fontFamily: 'Inter_700Bold',
  },
  terminalResultValue: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.textPrimary,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.3,
  },
  terminalResultNote: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontFamily: 'Inter_400Regular',
    lineHeight: 18,
  },

  // ── E. Item details ──
  itemDetailsSection: {
    paddingHorizontal: Space.md,
    paddingTop: Space.lg,
  },
  itemDetailsDescription: {
    fontSize: 15,
    color: Colors.textSecondary,
    lineHeight: 22,
    fontFamily: 'Inter_400Regular',
  },
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
    color: Colors.textMuted,
  },
  bidSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Space.xs,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.sm,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surfaceAlt,
  },
  bidSummaryLabel: {
    color: Colors.textMuted,
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
  },
  bidSummaryValue: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
    fontFamily: 'Inter_600SemiBold',
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
    color: Colors.textMuted,
    fontFamily: 'Inter_500Medium',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  resultTitleWon: {
    fontSize: 32,
    fontFamily: 'Inter_700Bold',
    color: Colors.success,
    letterSpacing: -0.5,
  },
  resultTitleLost: {
    fontSize: 32,
    fontFamily: 'Inter_700Bold',
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  resultTitleSold: {
    fontSize: 32,
    fontFamily: 'Inter_700Bold',
    color: Colors.brand,
    letterSpacing: -0.5,
  },
  resultPrice: {
    fontSize: 28,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.textPrimary,
    marginTop: Space.xs,
  },
  resultPriceSecondary: {
    fontSize: 22,
    fontFamily: 'Inter_500Medium',
    color: Colors.textSecondary,
    marginTop: Space.xs,
  },
  resultItemTitle: {
    fontSize: 16,
    color: Colors.textSecondary,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    marginTop: Space.xs,
  },
  resultBrand: {
    fontSize: 13,
    color: Colors.textMuted,
    fontFamily: 'Inter_400Regular',
  },
  resultMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    marginTop: Space.xs,
  },
  resultMetaText: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontFamily: 'Inter_500Medium',
  },
  resultNote: {
    color: Colors.textMuted,
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
    color: Colors.textMuted,
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
    backgroundColor: Colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  ruleNumberText: {
    color: Colors.textInverse,
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
  },
  ruleContent: {
    flex: 1,
    gap: 4,
  },
  ruleTitle: {
    fontSize: 15,
  },
  ruleDescription: {
    color: Colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: 'Inter_400Regular',
  },
});
