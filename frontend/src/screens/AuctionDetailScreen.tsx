import React from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import Reanimated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { ActiveTheme, Colors } from '../constants/colors';
import { RootStackParamList } from '../navigation/types';
import { useToast } from '../context/ToastContext';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useCurrencyContext } from '../context/CurrencyContext';
import { parseApiError } from '../lib/apiClient';
import { AppButton } from '../components/ui/AppButton';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { CachedImage } from '../components/CachedImage';
import { SyncStatusPill } from '../components/SyncStatusPill';
import { EmptyState } from '../components/EmptyState';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { Meta, Body, BodyEmphasis, Headline } from '../components/ui/Text';
import { Space, Radius, Typography } from '../theme/designTokens';
import { Motion } from '../constants/motion';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { haptics } from '../utils/haptics';
import {
  getAuctionDetail,
  placeAuctionBid,
  addToWatchlist,
  removeFromWatchlist,
  type AuctionDetail as AuctionDetailType,
  type AuctionBidActivity,
} from '../services/marketApi';
import {
  convertDisplayToGbpAmount,
  getSuggestedBidDisplayAmount,
  sanitizeDecimalInput,
} from '../utils/currencyAuthoringFlows';
import { AppInput } from '../components/ui/AppInput';
import { createStableId } from '../utils/createStableId';

type NavT = StackNavigationProp<RootStackParamList>;
type RouteT = RouteProp<RootStackParamList, 'AuctionDetail'>;

function formatCountdown(ms: number) {
  if (ms <= 0) return 'Ended';
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600).toString().padStart(2, '0');
  const minutes = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  return `${hours}:${minutes}:${seconds}`;
}

export default function AuctionDetailScreen() {
  const navigation = useNavigation<NavT>();
  const route = useRoute<RouteT>();
  const { auctionId } = route.params;
  const { show } = useToast();
  const { formatFromFiat } = useFormattedPrice();
  const { currencyCode, goldRates } = useCurrencyContext();
  const reducedMotionEnabled = useReducedMotion();

  const [auction, setAuction] = React.useState<AuctionDetailType | null>(null);
  const [bidActivity, setBidActivity] = React.useState<AuctionBidActivity[]>([]);
  const [serverNow, setServerNow] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [nowTs, setNowTs] = React.useState(Date.now());

  const [bidComposerVisible, setBidComposerVisible] = React.useState(false);
  const [bidInput, setBidInput] = React.useState('');
  const [isSubmittingBid, setIsSubmittingBid] = React.useState(false);
  const [isBuyNowLoading, setIsBuyNowLoading] = React.useState(false);
  const [watchToggling, setWatchToggling] = React.useState(false);

  const fetchDetail = React.useCallback(async () => {
    try {
      const res = await getAuctionDetail(auctionId);
      setAuction(res.auction);
      setBidActivity(res.bidActivity);
      setServerNow(res.serverNow);
      setError(null);
    } catch (err) {
      const parsed = parseApiError(err, 'Failed to load auction');
      setError(parsed.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [auctionId]);

  React.useEffect(() => {
    void fetchDetail();
  }, [fetchDetail]);

  React.useEffect(() => {
    const intervalId = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(intervalId);
  }, []);

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

  const openBidComposer = () => {
    if (!auction) return;
    const suggested = getSuggestedBidDisplayAmount(auction.minimumNextBidGbp, currencyCode, goldRates);
    setBidInput(suggested.toFixed(2));
    setBidComposerVisible(true);
  };

  const closeBidComposer = () => {
    setBidComposerVisible(false);
    setBidInput('');
  };

  const bumpBid = (pct: number) => {
    const base = Number(bidInput);
    const current = Number.isFinite(base) && base > 0 ? base : (auction?.currentBidGbp ?? 0);
    const nextValue = Number((current * (1 + pct)).toFixed(2));
    setBidInput(nextValue.toFixed(2));
  };

  const submitBid = async () => {
    if (!auction || isSubmittingBid) return;

    const amount = Number(bidInput);
    if (!Number.isFinite(amount) || amount <= 0) {
      show('Invalid bid amount', 'error');
      return;
    }

    const amountInGbp = convertDisplayToGbpAmount(amount, currencyCode, goldRates);
    if (!Number.isFinite(amountInGbp) || amountInGbp <= 0) {
      show('Invalid bid amount', 'error');
      return;
    }

    if (amountInGbp < auction.minimumNextBidGbp) {
      show(
        `Bid must be at least ${formatFromFiat(auction.minimumNextBidGbp, 'GBP', { displayMode: 'fiat' })}`,
        'error'
      );
      return;
    }

    const roundedAmount = Number(amountInGbp.toFixed(2));
    const idempotencyKey = createStableId();
    setIsSubmittingBid(true);

    try {
      await placeAuctionBid(auction.id, { amountGbp: roundedAmount, idempotencyKey });
      await fetchDetail();
      show(
        `Bid placed: ${formatFromFiat(roundedAmount, 'GBP', { displayMode: 'fiat' })}`,
        'success'
      );
      closeBidComposer();
    } catch (err) {
      const parsed = parseApiError(err, 'Unable to place bid');
      show(parsed.message, 'error');
    } finally {
      setIsSubmittingBid(false);
    }
  };

  const handleBuyNow = async () => {
    if (!auction?.buyNowPriceGbp || isBuyNowLoading) return;
    setIsBuyNowLoading(true);

    try {
      const idempotencyKey = createStableId();
      const result = await placeAuctionBid(auction.id, {
        amountGbp: Number(auction.buyNowPriceGbp.toFixed(2)),
        idempotencyKey,
      });
      await fetchDetail();
      show(`Won via Buy Now: ${auction.title}`, 'success');
      if (result.auction.isBuyNow) {
        navigation.navigate('Checkout', { itemId: auction.listingId });
      }
    } catch (err) {
      const parsed = parseApiError(err, 'Unable to complete buy now');
      show(parsed.message, 'error');
    } finally {
      setIsBuyNowLoading(false);
    }
  };

  const msToEnd = auction ? new Date(auction.endsAt).getTime() - nowTs : 0;
  const msToStart = auction ? new Date(auction.startsAt).getTime() - nowTs : 0;
  const isLive = auction?.lifecycle === 'live';
  const isScheduled = auction?.lifecycle === 'upcoming';
  const isEnded = auction?.lifecycle === 'ended';
  const isSeller = auction?.viewerState === 'seller';

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScrollView contentContainerStyle={styles.loadingContainer}>
          <SkeletonLoader width="100%" height={300} borderRadius={0} />
          <View style={{ padding: Space.md }}>
            <SkeletonLoader width="70%" height={24} borderRadius={8} style={{ marginBottom: Space.sm }} />
            <SkeletonLoader width="40%" height={16} borderRadius={6} style={{ marginBottom: Space.md }} />
            <SkeletonLoader width="100%" height={60} borderRadius={12} style={{ marginBottom: Space.sm }} />
            <SkeletonLoader width="100%" height={60} borderRadius={12} />
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
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
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
        {/* Hero Image */}
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
            <View style={styles.heroOverlay}>
              {isLive && (
                <View style={styles.livePill}>
                  <View style={styles.liveDot} />
                  <Meta style={styles.liveText}>LIVE</Meta>
                </View>
              )}
              {isScheduled && (
                <View style={styles.scheduledPill}>
                  <Ionicons name="time-outline" size={12} color={Colors.textInverse} />
                  <Meta style={styles.scheduledText}>SCHEDULED</Meta>
                </View>
              )}
              {isEnded && (
                <View style={styles.endedPill}>
                  <Meta style={styles.endedText}>ENDED</Meta>
                </View>
              )}
            </View>
            <AnimatedPressable
              style={styles.backBtn_floating}
              onPress={() => navigation.goBack()}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
            </AnimatedPressable>
            <AnimatedPressable
              style={[styles.watchBtn_floating, auction.isWatched && styles.watchBtn_floatingActive]}
              onPress={handleToggleWatch}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={auction.isWatched ? 'Remove from watchlist' : 'Add to watchlist'}
            >
              <Ionicons
                name={auction.isWatched ? 'heart' : 'heart-outline'}
                size={18}
                color={auction.isWatched ? '#ff4444' : Colors.textPrimary}
              />
            </AnimatedPressable>
          </View>
        </Reanimated.View>

        {/* Title & Brand */}
        <Reanimated.View
          entering={reducedMotionEnabled ? undefined : FadeInDown.duration(350).delay(50)}
          style={styles.titleSection}
        >
          {auction.brand && <Meta style={styles.brand}>{auction.brand}</Meta>}
          <Headline style={styles.title} numberOfLines={2}>{auction.title}</Headline>
          {auction.conditionLabel && (
            <Meta style={styles.condition}>{auction.conditionLabel}</Meta>
          )}
        </Reanimated.View>

        {/* Seller Row */}
        <Reanimated.View
          entering={reducedMotionEnabled ? undefined : FadeInDown.duration(350).delay(100)}
          style={styles.sellerRow}
        >
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
            <View>
              <BodyEmphasis style={styles.sellerName}>
                {auction.seller.displayName ?? `@${auction.seller.username}`}
              </BodyEmphasis>
              <Meta style={styles.sellerHandle}>@{auction.seller.username}</Meta>
            </View>
          </AnimatedPressable>
          <View style={styles.sellerActions}>
            <AnimatedPressable
              style={styles.sellerActionBtn}
              onPress={() =>
                navigation.navigate('Chat', {
                  conversationId: `${auction.seller.id}_${auction.listingId}`,
                  partnerUserId: auction.seller.id,
                  itemId: auction.listingId,
                })
              }
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={`Message ${auction.seller.username}`}
            >
              <Ionicons name="chatbubble-ellipses-outline" size={18} color={Colors.textPrimary} />
            </AnimatedPressable>
          </View>
        </Reanimated.View>

        {/* Bid Info Card */}
        <Reanimated.View
          entering={reducedMotionEnabled ? undefined : FadeInDown.duration(350).delay(150)}
          style={styles.bidInfoCard}
        >
          <View style={styles.bidInfoRow}>
            <View style={styles.bidInfoItem}>
              <Meta style={styles.bidInfoLabel}>Current Bid</Meta>
              <BodyEmphasis style={styles.bidInfoValue}>
                {formatFromFiat(auction.currentBidGbp, 'GBP', { displayMode: 'fiat' })}
              </BodyEmphasis>
            </View>
            <View style={styles.bidInfoDivider} />
            <View style={styles.bidInfoItem}>
              <Meta style={styles.bidInfoLabel}>Min Next Bid</Meta>
              <BodyEmphasis style={styles.bidInfoValue}>
                {formatFromFiat(auction.minimumNextBidGbp, 'GBP', { displayMode: 'fiat' })}
              </BodyEmphasis>
            </View>
            <View style={styles.bidInfoDivider} />
            <View style={styles.bidInfoItem}>
              <Meta style={styles.bidInfoLabel}>Bids</Meta>
              <BodyEmphasis style={styles.bidInfoValue}>{auction.bidCount}</BodyEmphasis>
            </View>
          </View>

          <View style={styles.timerRow}>
            <Ionicons
              name={isLive ? 'flash-outline' : isScheduled ? 'time-outline' : 'checkmark-done-outline'}
              size={16}
              color={isLive ? '#ff4444' : isScheduled ? Colors.brand : Colors.textMuted}
            />
            <Body style={styles.timerText}>
              {isLive
                ? `Ends in ${formatCountdown(msToEnd)}`
                : isScheduled
                ? `Starts in ${formatCountdown(msToStart)}`
                : 'Auction ended'}
            </Body>
          </View>
        </Reanimated.View>

        {/* Viewer State Banner */}
        {auction.viewerState !== 'not_participating' && (
          <Reanimated.View
            entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(200)}
            style={styles.viewerBanner}
          >
            <Ionicons
              name={
                auction.viewerState === 'leading' ? 'trophy-outline'
                : auction.viewerState === 'outbid' ? 'trending-down-outline'
                : auction.viewerState === 'won' ? 'ribbon-outline'
                : auction.viewerState === 'lost' ? 'close-circle-outline'
                : auction.viewerState === 'seller' ? 'storefront-outline'
                : 'eye-outline'
              }
              size={16}
              color={
                auction.viewerState === 'leading' || auction.viewerState === 'won'
                  ? Colors.brand
                : auction.viewerState === 'outbid' || auction.viewerState === 'lost'
                  ? '#ff4444'
                : Colors.textSecondary
              }
            />
            <Meta style={styles.viewerBannerText}>
              {auction.viewerState === 'leading' && 'You are the highest bidder'}
              {auction.viewerState === 'outbid' && 'You have been outbid'}
              {auction.viewerState === 'won' && 'You won this auction!'}
              {auction.viewerState === 'lost' && 'You did not win this auction'}
              {auction.viewerState === 'seller' && 'This is your auction'}
              {auction.viewerState === 'watching' && 'You are watching this auction'}
            </Meta>
          </Reanimated.View>
        )}

        {/* Description */}
        {auction.description && (
          <Reanimated.View
            entering={reducedMotionEnabled ? undefined : FadeInDown.duration(350).delay(200)}
            style={styles.section}
          >
            <BodyEmphasis style={styles.sectionTitle}>Description</BodyEmphasis>
            <Body style={styles.description}>{auction.description}</Body>
          </Reanimated.View>
        )}

        {/* Bid Activity */}
        <Reanimated.View
          entering={reducedMotionEnabled ? undefined : FadeInDown.duration(350).delay(250)}
          style={styles.section}
        >
          <View style={styles.sectionHeaderRow}>
            <BodyEmphasis style={styles.sectionTitle}>Bid Activity</BodyEmphasis>
            {auction.bidCount > 0 && (
              <SyncStatusPill tone="live" label={`${auction.bidCount} total`} compact />
            )}
          </View>
          {bidActivity.length > 0 ? (
            <View style={styles.bidList}>
              {bidActivity.map((bid, index) => (
                <View
                  key={bid.id}
                  style={[styles.bidRow, index === 0 && styles.bidRowTop]}
                >
                  <View style={styles.bidRowLeft}>
                    {bid.isViewer ? (
                      <View style={styles.viewerBadge}>
                        <Meta style={styles.viewerBadgeText}>YOU</Meta>
                      </View>
                    ) : (
                      <Ionicons name="person-circle-outline" size={20} color={Colors.textMuted} />
                    )}
                    <Meta style={styles.bidderName}>
                      {bid.isViewer ? 'You' : `@${bid.bidderUsername}`}
                    </Meta>
                  </View>
                  <View style={styles.bidRowRight}>
                    <BodyEmphasis style={styles.bidAmount}>
                      {formatFromFiat(bid.amountGbp, 'GBP', { displayMode: 'fiat' })}
                    </BodyEmphasis>
                    {index === 0 && <Meta style={styles.topBidLabel}>Top</Meta>}
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <EmptyState icon="document-text-outline" title="No bids yet" />
          )}
        </Reanimated.View>

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Sticky Action Bar */}
      {!isSeller && !isEnded && (
        <View style={styles.actionBar}>
          {auction.buyNowPriceGbp && isLive ? (
            <View style={styles.actionBarRow}>
              <AppButton
                style={styles.actionBarBtnPrimary}
                onPress={openBidComposer}
                disabled={isSubmittingBid}
                variant="primary"
                size="md"
                title="Place Bid"
                hapticFeedback="medium"
                accessibilityLabel="Place bid"
              />
              <AppButton
                style={[styles.actionBarBtnSecondary, isBuyNowLoading && styles.actionBtnDisabled]}
                onPress={handleBuyNow}
                disabled={isBuyNowLoading}
                variant="secondary"
                size="md"
                title={isBuyNowLoading ? 'Buying...' : `Buy Now ${formatFromFiat(auction.buyNowPriceGbp, 'GBP', { displayMode: 'fiat' })}`}
                hapticFeedback="medium"
                accessibilityLabel="Buy now"
              />
            </View>
          ) : isLive ? (
            <AppButton
              style={styles.actionBarFullBtn}
              onPress={openBidComposer}
              disabled={isSubmittingBid}
              variant="primary"
              size="md"
              title="Place Bid"
              hapticFeedback="medium"
              accessibilityLabel="Place bid"
            />
          ) : isScheduled ? (
            <AppButton
              style={styles.actionBarFullBtn}
              onPress={handleToggleWatch}
              disabled={watchToggling}
              variant="secondary"
              size="md"
              title={auction.isWatched ? 'Watching' : 'Watch Auction'}
              hapticFeedback="light"
              accessibilityLabel={auction.isWatched ? 'Remove from watchlist' : 'Add to watchlist'}
            />
          ) : null}
        </View>
      )}

      {/* Bid Composer Modal */}
      {bidComposerVisible && (
        <View style={styles.overlay}>
          <AnimatedPressable
            style={styles.dismissLayer}
            activeOpacity={1}
            onPress={closeBidComposer}
            accessibilityRole="button"
            accessibilityLabel="Dismiss bid composer"
          />
          <Reanimated.View
            entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)}
            style={styles.bidComposerCard}
          >
            <Headline style={styles.composerTitle} numberOfLines={1}>{auction.title}</Headline>

            <View style={styles.composerBidInfo}>
              <View>
                <Meta style={styles.composerLabel}>Current bid</Meta>
                <BodyEmphasis style={styles.composerCurrentValue}>
                  {formatFromFiat(auction.currentBidGbp, 'GBP', { displayMode: 'fiat' })}
                </BodyEmphasis>
              </View>
              <View>
                <Meta style={styles.composerLabel}>Minimum</Meta>
                <BodyEmphasis style={styles.composerMinValue}>
                  {formatFromFiat(auction.minimumNextBidGbp, 'GBP', { displayMode: 'fiat' })}
                </BodyEmphasis>
              </View>
            </View>

            <AppInput
              value={bidInput}
              onChangeText={(v) => setBidInput(sanitizeDecimalInput(v))}
              keyboardType="decimal-pad"
              placeholder="0.00"
              prefix={currencyCode}
              accessibilityLabel="Bid amount"
              accessibilityHint="Enter your bid amount"
              containerStyle={styles.composerInput}
            />

            <View style={styles.bumpRow}>
              {[0.01, 0.03, 0.05].map((pct) => (
                <AppButton
                  key={pct}
                  title={`+${Math.round(pct * 100)}%`}
                  style={styles.bumpChip}
                  variant="secondary"
                  size="sm"
                  onPress={() => bumpBid(pct)}
                  accessibilityLabel={`Increase bid by ${Math.round(pct * 100)} percent`}
                />
              ))}
            </View>

            <View style={styles.composerActions}>
              <AppButton
                style={styles.composerActionBtn}
                onPress={closeBidComposer}
                variant="secondary"
                size="sm"
                align="center"
                title="Cancel"
                accessibilityLabel="Cancel bid"
              />
              <AppButton
                style={[styles.composerActionBtn, styles.composerSubmitBtn]}
                onPress={submitBid}
                disabled={isSubmittingBid}
                variant="primary"
                size="sm"
                align="center"
                title={isSubmittingBid ? 'Submitting...' : 'Place Bid'}
                hapticFeedback="medium"
                accessibilityLabel="Place bid"
              />
            </View>
          </Reanimated.View>
        </View>
      )}
    </SafeAreaView>
  );
}

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
    height: 320,
  },
  heroImageContainer: {
    width: '100%',
    height: 320,
  },
  heroImage: {
    width: '100%',
    height: 320,
  },
  heroPlaceholder: {
    width: '100%',
    height: 320,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroOverlay: {
    position: 'absolute',
    top: Space.sm,
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
    backgroundColor: '#ff4444',
  },
  liveText: {
    color: '#fff',
    fontSize: 10,
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
  scheduledText: {
    color: '#fff',
    fontSize: 10,
  },
  endedPill: {
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  endedText: {
    color: Colors.textMuted,
    fontSize: 10,
  },
  backBtn_floating: {
    position: 'absolute',
    top: Space.sm,
    right: Space.sm,
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  watchBtn_floating: {
    position: 'absolute',
    top: Space.sm,
    right: Space.sm + 36 + 8,
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  watchBtn_floatingActive: {
    backgroundColor: 'rgba(255,68,68,0.2)',
  },
  titleSection: {
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
  },
  brand: {
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
    fontSize: 11,
  },
  title: {
    marginBottom: 4,
  },
  condition: {
    color: Colors.textMuted,
  },
  sellerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
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
  sellerName: {
    fontSize: 14,
  },
  sellerHandle: {
    color: Colors.textMuted,
  },
  sellerActions: {
    flexDirection: 'row',
    gap: Space.sm,
  },
  sellerActionBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bidInfoCard: {
    marginHorizontal: Space.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    padding: Space.md,
  },
  bidInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Space.sm,
  },
  bidInfoItem: {
    flex: 1,
    alignItems: 'center',
  },
  bidInfoDivider: {
    width: 1,
    height: 32,
    backgroundColor: Colors.border,
  },
  bidInfoLabel: {
    marginBottom: 4,
    fontSize: 11,
  },
  bidInfoValue: {
    fontSize: 16,
  },
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: Space.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  timerText: {
    color: Colors.textSecondary,
  },
  viewerBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: Space.md,
    marginTop: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceAlt,
  },
  viewerBannerText: {
    flex: 1,
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
  description: {
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  bidList: {
    borderRadius: Radius.md,
    borderWidth: 1,
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
    borderBottomWidth: 1,
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
  },
  bidRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  bidAmount: {
    fontSize: 14,
  },
  topBidLabel: {
    color: Colors.brand,
    fontSize: 10,
    fontWeight: '600',
  },
  bottomSpacer: {
    height: 100,
  },
  actionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.lg,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  actionBarRow: {
    flexDirection: 'row',
    gap: Space.sm,
  },
  actionBarBtnPrimary: {
    flex: 1,
  },
  actionBarBtnSecondary: {
    flex: 1,
  },
  actionBarFullBtn: {
    width: '100%',
  },
  actionBtnDisabled: {
    opacity: 0.52,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 300,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  dismissLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  bidComposerCard: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingHorizontal: Space.md,
    paddingTop: Space.lg,
    paddingBottom: Space.xl,
    borderTopWidth: 1,
    borderColor: Colors.border,
  },
  composerTitle: {
    marginBottom: Space.md,
    textAlign: 'center',
  },
  composerBidInfo: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: Space.md,
    paddingHorizontal: Space.md,
  },
  composerLabel: {
    fontSize: 11,
    marginBottom: 2,
  },
  composerCurrentValue: {
    fontSize: 15,
  },
  composerMinValue: {
    fontSize: 15,
    color: Colors.brand,
  },
  composerInput: {
    marginBottom: Space.sm,
  },
  bumpRow: {
    flexDirection: 'row',
    gap: Space.sm,
    marginBottom: Space.md,
  },
  bumpChip: {
    flex: 1,
  },
  composerActions: {
    flexDirection: 'row',
    gap: Space.sm,
  },
  composerActionBtn: {
    flex: 1,
  },
  composerSubmitBtn: {
    flex: 1.5,
  },
});
