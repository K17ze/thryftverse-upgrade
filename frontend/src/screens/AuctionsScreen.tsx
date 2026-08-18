import React, { useMemo, useCallback } from 'react';
import { View, StyleSheet, RefreshControl, ScrollView } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { openProfile } from '../navigation/openProfile';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { EmptyState } from '../components/EmptyState';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useCurrencyContext } from '../context/CurrencyContext';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { SyncStatusPill } from '../components/SyncStatusPill';
import { SyncRetryBanner } from '../components/SyncRetryBanner';
import { parseApiError } from '../lib/apiClient';
import { AppButton } from '../components/ui/AppButton';
import { AppInput } from '../components/ui/AppInput';
import { BottomSheet } from '../components/BottomSheet';
import {
  convertDisplayToGbpAmount,
  getSuggestedBidDisplayAmount,
  sanitizeDecimalInput,
} from '../utils/currencyAuthoringFlows';
import {
  listAuctions,
  placeAuctionBid as placeAuctionBidRemote,
  addToWatchlist,
  removeFromWatchlist,
  getAuctionDetail,
  type MarketAuction,
  type AuctionSortMode,
  type AuctionViewerState,
  type AuctionBidActivity,
} from '../services/marketApi';
import { t } from '../i18n';
import { Space, Radius, Type, Stroke, Control, Typography } from '../theme/designTokens';
import { useReducedMotion } from '../hooks/useReducedMotion';
import {
  MetricGrid,
  AuctionCard,
  BidComposer,
} from '../components/trade';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { CachedImage } from '../components/CachedImage';
import { SharedTransitionView } from '../components/SharedTransitionView';
import { Meta, Body, BodyEmphasis } from '../components/ui/Text';
import { createStableId } from '../utils/createStableId';
import { formatBidActivityRow } from '../utils/auctionDetailLogic';

type AuctionLifecycle = 'upcoming' | 'live' | 'ended';

interface AuctionViewModel {
  id: string;
  listingId: string;
  sellerId: string;
  sellerUsername: string;
  sellerDisplayName: string | null;
  sellerAvatarUrl: string | null;
  title: string;
  image: string;
  brand: string | null;
  category: string | null;
  startsAt: string;
  endsAt: string;
  startingBid: number;
  currentBid: number;
  minimumNextBid: number;
  bidCount: number;
  buyNowPrice?: number;
  lifecycle: AuctionLifecycle;
  msToStart: number;
  msToEnd: number;
  progress: number;
  viewerState: AuctionViewerState;
  isWatched: boolean;
}

type StatusFilter = 'all' | 'live' | 'scheduled' | 'ended';

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

type TimerUrgency = 'critical' | 'urgent' | 'normal';

function getTimerUrgency(msToEnd: number): TimerUrgency {
  if (msToEnd <= 0) return 'normal';
  const ONE_HOUR_MS = 60 * 60 * 1000;
  const SIX_HOURS_MS = 6 * ONE_HOUR_MS;
  if (msToEnd < ONE_HOUR_MS) return 'critical';
  if (msToEnd < SIX_HOURS_MS) return 'urgent';
  return 'normal';
}

function FeaturedLiveDot({ reducedMotion, color }: { reducedMotion: boolean; color: string }) {
  return (
    <View
      style={[
        { width: Space.xs + 2, height: Space.xs + 2, borderRadius: Radius.md, backgroundColor: color },
      ]}
    />
  );
}

type NavT = NativeStackNavigationProp<RootStackParamList>;

const SORT_OPTIONS: { label: string; value: AuctionSortMode }[] = [
  { label: 'Ending Soon', value: 'endingSoon' },
  { label: 'Newest', value: 'newest' },
  { label: 'Most Bids', value: 'mostBids' },
  { label: 'Price: Low', value: 'priceLow' },
  { label: 'Price: High', value: 'priceHigh' },
];

const STATUS_OPTIONS: { label: string; value: StatusFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Live', value: 'live' },
  { label: 'Upcoming', value: 'scheduled' },
  { label: 'Ended', value: 'ended' },
];

export default function AuctionsScreen() {
  const navigation = useNavigation<NavT>();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { show } = useToast();
  const { formatFromFiat } = useFormattedPrice();
  const { currencyCode, goldRates } = useCurrencyContext();
  const reducedMotionEnabled = useReducedMotion();
  const currentUser = useStore((state) => state.currentUser);

  const [nowTs, setNowTs] = React.useState(Date.now());
  const [refreshing, setRefreshing] = React.useState(false);
  const [bidComposerVisible, setBidComposerVisible] = React.useState(false);
  const [selectedBidAuction, setSelectedBidAuction] = React.useState<AuctionViewModel | null>(null);
  const [bidInput, setBidInput] = React.useState('');
  const [remoteAuctions, setRemoteAuctions] = React.useState<MarketAuction[]>([]);
  const [isSyncingAuctions, setIsSyncingAuctions] = React.useState(false);
  const [syncError, setSyncError] = React.useState<string | null>(null);
  const [isSubmittingBid, setIsSubmittingBid] = React.useState(false);
  const [buyNowAuctionId, setBuyNowAuctionId] = React.useState<string | null>(null);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>('all');
  const [sortMode, setSortMode] = React.useState<AuctionSortMode>('endingSoon');
  const [watchTogglingIds, setWatchTogglingIds] = React.useState<Set<string>>(new Set());
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);
  const [bidHistoryVisible, setBidHistoryVisible] = React.useState(false);
  const [bidHistoryAuction, setBidHistoryAuction] = React.useState<AuctionViewModel | null>(null);
  const [bidHistory, setBidHistory] = React.useState<AuctionBidActivity[]>([]);
  const [bidHistoryLoading, setBidHistoryLoading] = React.useState(false);
  const [bidHistoryError, setBidHistoryError] = React.useState(false);

  const syncAuctions = React.useCallback(async () => {
    setIsSyncingAuctions(true);
    try {
      const result = await listAuctions({
        status: statusFilter === 'all' ? 'all' : statusFilter,
        sort: sortMode,
        query: searchQuery.trim() || undefined,
        limit: 30,
      });
      setRemoteAuctions(result.items);
      setNextCursor(result.nextCursor);
      setSyncError(null);
    } catch (error) {
      setSyncError((error as Error).message || t('auctions.sync.unable'));
    } finally {
      setIsSyncingAuctions(false);
    }
  }, [statusFilter, sortMode, searchQuery]);

  const loadMore = React.useCallback(async () => {
    if (!nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const result = await listAuctions({
        status: statusFilter === 'all' ? 'all' : statusFilter,
        sort: sortMode,
        query: searchQuery.trim() || undefined,
        cursor: nextCursor,
        limit: 30,
      });
      setRemoteAuctions((prev) => [...prev, ...result.items]);
      setNextCursor(result.nextCursor);
    } catch {
      // Silent fail on pagination
    } finally {
      setIsLoadingMore(false);
    }
  }, [nextCursor, isLoadingMore, statusFilter, sortMode, searchQuery]);

  React.useEffect(() => {
    const intervalId = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(intervalId);
  }, []);

  React.useEffect(() => {
    void syncAuctions();
  }, [syncAuctions]);

  const handleRefresh = async () => {
    setRefreshing(true);
    setNowTs(Date.now());
    await syncAuctions();
    setRefreshing(false);
  };

  const auctions = React.useMemo<AuctionViewModel[]>(() => {
    const WINDOW_6_HOURS_MS = 6 * 60 * 60 * 1000;
    return remoteAuctions.map((item) => {
      const startsAtMs = new Date(item.startsAt).getTime();
      const endsAtMs = new Date(item.endsAt).getTime();
      const msToStart = startsAtMs - nowTs;
      const msToEnd = endsAtMs - nowTs;
      let lifecycle: AuctionLifecycle = 'upcoming';
      if (msToStart <= 0 && msToEnd > 0) lifecycle = 'live';
      else if (msToEnd <= 0) lifecycle = 'ended';
      const elapsedMs = Math.max(0, WINDOW_6_HOURS_MS - msToEnd);
      const progress = Math.min(1, Math.max(0, elapsedMs / WINDOW_6_HOURS_MS));
      return {
        id: item.id,
        listingId: item.listingId,
        sellerId: item.seller.id,
        sellerUsername: item.seller.username,
        sellerDisplayName: item.seller.displayName,
        sellerAvatarUrl: item.seller.avatarUrl,
        title: item.title,
        image: item.imageUrl ?? '',
        brand: item.brand,
        category: item.category,
        startsAt: item.startsAt,
        endsAt: item.endsAt,
        startingBid: item.startingBidGbp,
        currentBid: item.currentBidGbp,
        minimumNextBid: item.minimumNextBidGbp,
        bidCount: item.bidCount,
        buyNowPrice: item.buyNowPriceGbp ?? undefined,
        lifecycle,
        msToStart,
        msToEnd,
        progress,
        viewerState: item.viewerState,
        isWatched: item.isWatched,
      };
    });
  }, [remoteAuctions, nowTs]);

  const liveAuctions = React.useMemo(() => auctions.filter((item) => item.lifecycle === 'live'), [auctions]);
  const upcomingAuctions = React.useMemo(() => auctions.filter((item) => item.lifecycle === 'upcoming'), [auctions]);
  const endedAuctions = React.useMemo(() => auctions.filter((item) => item.lifecycle === 'ended'), [auctions]);

  const totalLiveBids = React.useMemo(() => liveAuctions.reduce((sum, item) => sum + item.bidCount, 0), [liveAuctions]);
  const watchlistCount = React.useMemo(() => auctions.filter((a) => a.isWatched).length, [auctions]);

  const featuredAuction = React.useMemo(() => {
    return liveAuctions.find((a) => a.viewerState === 'outbid')
      ?? liveAuctions.find((a) => a.viewerState === 'leading')
      ?? liveAuctions[0]
      ?? null;
  }, [liveAuctions]);

  const marketStatus = React.useMemo(() => {
    if (isSyncingAuctions) return { tone: 'syncing' as const, label: t('auctions.status.syncing') };
    if (syncError) return { tone: 'offline' as const, label: t('auctions.status.reconnecting') };
    if (remoteAuctions.length > 0) return { tone: 'live' as const, label: t('auctions.status.synced') };
    return { tone: 'offline' as const, label: t('auctions.status.none') };
  }, [remoteAuctions.length, isSyncingAuctions, syncError]);

  const openBidComposer = (auction: AuctionViewModel) => {
    const suggestedDisplayBid = getSuggestedBidDisplayAmount(auction.minimumNextBid, currencyCode, goldRates);
    setSelectedBidAuction(auction);
    setBidInput(suggestedDisplayBid.toFixed(2));
    setBidComposerVisible(true);
  };

  const handleToggleWatch = async (auction: AuctionViewModel) => {
    if (watchTogglingIds.has(auction.id)) return;
    setWatchTogglingIds((prev) => new Set(prev).add(auction.id));

    const wasWatching = auction.isWatched;
    setRemoteAuctions((prev) =>
      prev.map((a) => (a.id === auction.id ? { ...a, isWatched: !wasWatching } : a))
    );

    try {
      if (wasWatching) {
        await removeFromWatchlist(auction.id);
        show('Removed from watchlist', 'info');
      } else {
        await addToWatchlist(auction.id);
        show('Added to watchlist', 'info');
      }
    } catch {
      setRemoteAuctions((prev) =>
        prev.map((a) => (a.id === auction.id ? { ...a, isWatched: wasWatching } : a))
      );
      show('Failed to update watchlist', 'error');
    } finally {
      setWatchTogglingIds((prev) => {
        const next = new Set(prev);
        next.delete(auction.id);
        return next;
      });
    }
  };

  const closeBidComposer = () => {
    setBidComposerVisible(false);
    setSelectedBidAuction(null);
    setBidInput('');
  };

  const bumpBid = (pct: number) => {
    if (!selectedBidAuction) return;
    const base = Number(bidInput);
    const current = Number.isFinite(base) && base > 0 ? base : selectedBidAuction.currentBid;
    const nextValue = Number((current * (1 + pct)).toFixed(2));
    setBidInput(nextValue.toFixed(2));
  };

  const submitBid = async () => {
    if (!selectedBidAuction) return;
    if (isSubmittingBid) return;

    const amount = Number(bidInput);
    if (!Number.isFinite(amount) || amount <= 0) {
      show(t('auctions.bid.error.invalid'), 'error');
      return;
    }

    const amountInGbp = convertDisplayToGbpAmount(amount, currencyCode, goldRates);
    if (!Number.isFinite(amountInGbp) || amountInGbp <= 0) {
      show(t('auctions.bid.error.invalid'), 'error');
      return;
    }

    if (amountInGbp < selectedBidAuction.minimumNextBid) {
      show(
        `Bid must be at least ${formatFromFiat(selectedBidAuction.minimumNextBid, 'GBP', { displayMode: 'fiat' })}`,
        'error'
      );
      return;
    }

    const roundedAmount = Number(amountInGbp.toFixed(2));
    const idempotencyKey = createStableId();
    setIsSubmittingBid(true);

    try {
      const remoteResult = await placeAuctionBidRemote(selectedBidAuction.id, {
        amountGbp: roundedAmount,
        idempotencyKey,
      });
      await syncAuctions();
      setNowTs(Date.now());
      show(
        t('auctions.bid.success.placed', { title: selectedBidAuction.title, amount: formatFromFiat(roundedAmount, 'GBP', { displayMode: 'fiat' }) }),
        'success'
      );
      if (remoteResult.aml?.alertId) show(t('auctions.bid.info.aml'), 'info');
      closeBidComposer();
    } catch (error) {
      const parsedError = parseApiError(error, t('auctions.bid.error.unablePlace'));
      show(parsedError.message, 'error');
    } finally {
      setIsSubmittingBid(false);
    }
  };

  const handleBuyNow = async (auction: AuctionViewModel) => {
    if (!auction.buyNowPrice || buyNowAuctionId) return;
    setBuyNowAuctionId(auction.id);

    try {
      const idempotencyKey = createStableId();
      const remoteResult = await placeAuctionBidRemote(auction.id, {
        amountGbp: Number(auction.buyNowPrice.toFixed(2)),
        idempotencyKey,
      });
      await syncAuctions();
      show(t('auctions.buy.success.won', { title: auction.title }), 'success');
      if (remoteResult.aml?.alertId) show(t('auctions.buy.info.aml'), 'info');
      if (remoteResult.auction.isBuyNow) {
        navigation.navigate('Checkout', { itemId: auction.listingId });
      }
    } catch (error) {
      const parsedError = parseApiError(error, t('auctions.buy.error.unableComplete'));
      show(parsedError.message, 'error');
    } finally {
      setBuyNowAuctionId(null);
    }
  };

  const navigateToDetail = useCallback((auction: AuctionViewModel) => {
    navigation.navigate('AuctionDetail', { auctionId: auction.id });
  }, [navigation]);

  const openBidHistory = async (auction: AuctionViewModel) => {
    setBidHistoryAuction(auction);
    setBidHistoryVisible(true);
    setBidHistoryLoading(true);
    setBidHistoryError(false);
    setBidHistory([]);
    try {
      const detail = await getAuctionDetail(auction.id);
      setBidHistory(detail.bidActivity);
    } catch {
      setBidHistoryError(true);
    } finally {
      setBidHistoryLoading(false);
    }
  };

  const closeBidHistory = () => {
    setBidHistoryVisible(false);
    setBidHistoryAuction(null);
    setBidHistory([]);
    setBidHistoryError(false);
  };

  const renderSortBar = () => (
    <View style={styles.sortBar}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sortScrollContent}>
        {SORT_OPTIONS.map((opt) => (
          <AnimatedPressable
            key={opt.value}
            style={[styles.sortChip, sortMode === opt.value && styles.sortChipActive]}
            activeOpacity={0.85}
            onPress={() => setSortMode(opt.value)}
            accessibilityRole="radio"
            accessibilityLabel={`Sort by ${opt.label}`}
            accessibilityState={{ selected: sortMode === opt.value }}
          >
            <Meta style={[styles.sortChipText, sortMode === opt.value && styles.sortChipTextActive]}>
              {opt.label}
            </Meta>
          </AnimatedPressable>
        ))}
      </ScrollView>
    </View>
  );

  const renderStatusFilter = () => (
    <View style={styles.statusFilterBar}>
      {STATUS_OPTIONS.map((opt) => (
        <AnimatedPressable
          key={opt.value}
          style={[styles.statusChip, statusFilter === opt.value && styles.statusChipActive]}
          activeOpacity={0.85}
          onPress={() => setStatusFilter(opt.value)}
          accessibilityRole="tab"
          accessibilityLabel={`Filter by ${opt.label}`}
          accessibilityState={{ selected: statusFilter === opt.value }}
        >
          <Meta style={[styles.statusChipText, statusFilter === opt.value && styles.statusChipTextActive]}>
            {opt.label}
          </Meta>
        </AnimatedPressable>
      ))}
    </View>
  );

  // FlashList v2 performance: memoized renderItem for upcoming auctions rail
  // prevents full re-render of all visible cards on every parent state change.
  // (Audit §FlashList v2 / LIST_RENDERING_POLICY.md §3.1)
  const renderUpcomingItem = useCallback(
    ({ item }: { item: AuctionViewModel }) => (
      <AnimatedPressable
        style={styles.upcomingCard}
        activeOpacity={0.9}
        onPress={() => navigateToDetail(item)}
        accessibilityRole="button"
        accessibilityLabel={`Open upcoming auction ${item.title}`}
      >
        <SharedTransitionView style={styles.upcomingImageFrame} sharedTransitionTag={`image-${item.listingId}-0`}>
          <CachedImage uri={item.image} style={styles.upcomingImage} containerStyle={styles.upcomingImageContainer} contentFit="cover" downscaleWidth={160} />
        </SharedTransitionView>
        <View style={styles.upcomingMeta}>
          <BodyEmphasis style={styles.upcomingTitle} numberOfLines={1}>{item.title}</BodyEmphasis>
          <Body style={styles.upcomingTimer}>{t('auctions.upcoming.startsIn', { countdown: formatCountdown(item.msToStart) })}</Body>
          <Meta style={styles.upcomingBid}>{t('auctions.upcoming.startingBid', { amount: formatFromFiat(item.startingBid, 'GBP', { displayMode: 'fiat' }) })}</Meta>
        </View>
      </AnimatedPressable>
    ),
    [styles, navigateToDetail, t, formatFromFiat],
  );

  const renderFeaturedAuction = () => {
    if (!featuredAuction) return null;
    const urgency = getTimerUrgency(featuredAuction.msToEnd);
    const timerColor = urgency === 'critical' ? colors.danger : urgency === 'urgent' ? colors.warning : colors.success;
    const endingSoon = featuredAuction.msToEnd > 0 && featuredAuction.msToEnd < 60 * 60 * 1000;
    return (
      <View style={styles.featuredWrap}>
        <BodyEmphasis style={styles.featuredLabel}>Featured Auction</BodyEmphasis>
        <AnimatedPressable
          style={styles.featuredCard}
          activeOpacity={0.92}
          onPress={() => navigateToDetail(featuredAuction)}
          accessibilityRole="button"
          accessibilityLabel={`Featured auction: ${featuredAuction.title}`}
        >
          <View style={styles.featuredImageFrame}>
            {featuredAuction.image ? (
              <CachedImage
                uri={featuredAuction.image}
                style={styles.featuredImage}
                containerStyle={styles.featuredImageContainer}
                contentFit="cover"
              />
            ) : (
              <View style={styles.featuredImagePlaceholder}>
                <Ionicons name="image-outline" size={32} color={colors.textMuted} />
              </View>
            )}
            <View style={styles.featuredOverlay}>
              <View style={styles.featuredLivePill}>
                <FeaturedLiveDot reducedMotion={reducedMotionEnabled} color={colors.danger} />
                <Meta style={styles.featuredLiveText}>LIVE</Meta>
              </View>
              {endingSoon ? (
                <View style={styles.endingSoonBadge}>
                  <Ionicons name="time-outline" size={10} color="#fff" />
                  <Meta style={styles.endingSoonText}>ENDING SOON</Meta>
                </View>
              ) : null}
            </View>
          </View>
          <View style={styles.featuredMeta}>
            <BodyEmphasis style={styles.featuredTitle} numberOfLines={1}>{featuredAuction.title}</BodyEmphasis>
            <View style={styles.featuredStatsRow}>
              <View>
                <Meta style={styles.featuredStatLabel}>Current Bid</Meta>
                <BodyEmphasis style={styles.featuredStatValue}>
                  {formatFromFiat(featuredAuction.currentBid, 'GBP', { displayMode: 'fiat' })}
                </BodyEmphasis>
              </View>
              <View>
                <Meta style={styles.featuredStatLabel}>Bids</Meta>
                <BodyEmphasis style={styles.featuredStatValue}>{featuredAuction.bidCount}</BodyEmphasis>
              </View>
              <View>
                <Meta style={styles.featuredStatLabel}>Ends In</Meta>
                <BodyEmphasis style={[styles.featuredStatValue, { color: timerColor }]}>
                  {formatCountdown(featuredAuction.msToEnd)}
                </BodyEmphasis>
              </View>
            </View>
            {featuredAuction.viewerState === 'outbid' && (
              <View style={styles.outbidBanner}>
                <Ionicons name="trending-down-outline" size={14} color={colors.danger} />
                <Meta style={styles.outbidText}>You've been outbid</Meta>
              </View>
            )}
            {featuredAuction.viewerState === 'leading' && (
              <View style={styles.leadingBanner}>
                <Ionicons name="trophy-outline" size={14} color={colors.brand} />
                <Meta style={styles.leadingText}>You're leading</Meta>
              </View>
            )}
          </View>
        </AnimatedPressable>
      </View>
    );
  };

  const renderHeader = () => (
    <View>
      <View>
        <MetricGrid
          metrics={[
            { label: 'Live', value: String(liveAuctions.length) },
            { label: 'Bids', value: String(totalLiveBids) },
            { label: 'Watching', value: String(watchlistCount) },
          ]}
          columns={3}
          style={{ marginTop: Space.sm }}
        />
      </View>

      <View>
      <View style={styles.searchWrap}>
        <AppInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search auctions..."
          prefix={<Ionicons name="search-outline" size={16} color={colors.textMuted} />}
          accessibilityLabel="Search auctions"
          returnKeyType="search"
          onSubmitEditing={() => void syncAuctions()}
        />
      </View>
      </View>

      {renderStatusFilter()}
      {renderSortBar()}

      <View style={styles.launchRow}>
        <View>
          <BodyEmphasis style={styles.launchTitle}>{t('auctions.cta.createAuction')}</BodyEmphasis>
          <Meta style={styles.launchHint}>Schedule a drop</Meta>
        </View>
        <View style={styles.actionBtnRow}>
          <AnimatedPressable
            style={styles.myBidsBtn}
            activeOpacity={0.9}
            onPress={() => navigation.navigate('MyBids')}
            accessibilityRole="button"
            accessibilityLabel="My Bids"
            accessibilityHint="Active bids"
          >
            <Ionicons name="list-outline" size={15} color={colors.brand} />
            <Meta style={styles.myBidsBtnText}>My Bids</Meta>
          </AnimatedPressable>
          <AppButton
            title="Create"
            icon={<Ionicons name="add" size={15} color={colors.background} />}
            style={styles.launchBtn}
            variant="primary"
            size="sm"
            onPress={() => navigation.navigate('CreateAuction')}
            hapticFeedback="medium"
            accessibilityLabel="Create auction"
          />
        </View>
      </View>

      {syncError ? (
        <SyncRetryBanner
          message={t('auctions.sync.delayed')}
          onRetry={() => void syncAuctions()}
          isRetrying={isSyncingAuctions}
          telemetryContext="auction_market_sync"
          containerStyle={styles.syncBanner}
        />
      ) : null}

      {renderFeaturedAuction()}

      {upcomingAuctions.length > 0 && statusFilter === 'all' && (
        <View style={styles.sectionWrap}>
          <View style={styles.sectionTitleRow}>
            <BodyEmphasis style={styles.sectionTitle}>{t('auctions.section.startingSoon')}</BodyEmphasis>
          </View>
          <FlashList
            data={upcomingAuctions}
            horizontal
            keyExtractor={(item) => item.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.horizontalListContent}
            renderItem={renderUpcomingItem}
          />
        </View>
      )}

      {liveAuctions.length > 0 && (statusFilter === 'all' || statusFilter === 'live') && (
        <View style={styles.sectionTitleRow}>
          <BodyEmphasis style={styles.sectionTitle}>Live Auctions</BodyEmphasis>
          <SyncStatusPill tone={marketStatus.tone} label={marketStatus.label} compact />
        </View>
      )}

      {endedAuctions.length > 0 && statusFilter === 'ended' && (
        <View style={styles.sectionTitleRow}>
          <BodyEmphasis style={styles.sectionTitle}>Ended Auctions</BodyEmphasis>
        </View>
      )}
    </View>
  );

  const renderLoadingState = () => (
    <View style={styles.loadingWrap}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={styles.loadingCard}>
          <SkeletonLoader width="100%" height={172} borderRadius={12} />
          <View style={{ padding: Space.sm + Space.xs }}>
            <SkeletonLoader width="70%" height={16} borderRadius={8} style={{ marginBottom: Space.sm }} />
            <SkeletonLoader width="40%" height={12} borderRadius={6} style={{ marginBottom: Space.sm }} />
            <SkeletonLoader width="100%" height={40} borderRadius={10} />
          </View>
        </View>
      ))}
    </View>
  );

  const displayAuctions = React.useMemo(() => {
    if (statusFilter === 'live') return liveAuctions;
    if (statusFilter === 'scheduled') return upcomingAuctions;
    if (statusFilter === 'ended') return endedAuctions;
    return auctions;
  }, [auctions, liveAuctions, upcomingAuctions, endedAuctions, statusFilter]);

  const renderAuctionCard = useCallback(({ item }: { item: AuctionViewModel }) => {
    const sellerLabel = item.sellerDisplayName ?? `@${item.sellerUsername}`;
    return (
      <AuctionCard
        id={item.id}
        title={item.title}
        image={item.image}
        sellerName={sellerLabel}
        sellerId={item.sellerId}
        currentBid={formatFromFiat(item.currentBid, 'GBP', { displayMode: 'fiat' })}
        bidCount={item.bidCount}
        timeRemaining={formatCountdown(item.msToEnd ?? 0)}
        progress={item.progress ?? 0}
        isLive={item.lifecycle === 'live'}
        isWatching={item.isWatched}
        viewerState={item.viewerState}
        timerUrgency={getTimerUrgency(item.msToEnd ?? 0)}
        endingSoon={item.lifecycle === 'live' && item.msToEnd > 0 && item.msToEnd < 60 * 60 * 1000}
        buyNowPrice={item.buyNowPrice ? formatFromFiat(item.buyNowPrice, 'GBP', { displayMode: 'fiat' }) : undefined}
        onPress={() => navigateToDetail(item)}
        onBid={() => openBidComposer(item)}
        onBuyNow={() => void handleBuyNow(item)}
        onToggleWatch={() => void handleToggleWatch(item)}
        onPressSeller={() => openProfile(navigation, item.sellerId, currentUser?.id)}
        onMessageSeller={() =>
          navigation.navigate('Chat', {
            conversationId: `${item.sellerId}_${item.listingId}`,
            focusQuery: sellerLabel,
            partnerUserId: item.sellerId,
          })
        }
        onViewBidHistory={() => void openBidHistory(item)}
        isBuyNowLoading={buyNowAuctionId === item.id}
        isBidSubmitting={isSubmittingBid}
      />
    );
  }, [
    formatFromFiat,
    navigateToDetail,
    openBidComposer,
    handleBuyNow,
    handleToggleWatch,
    navigation,
    buyNowAuctionId,
    isSubmittingBid,
    openBidHistory,
  ]);

  return (
    <>
      <FlashList
        data={displayAuctions}
        keyExtractor={(item) => item.id}
        renderItem={renderAuctionCard}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={
          isSyncingAuctions ? renderLoadingState() : (
            <EmptyState
              icon="hourglass-outline"
              title={t('auctions.empty.noActive')}
            />
          )
        }
        ListFooterComponent={
          nextCursor ? (
            <View style={styles.loadMoreWrap}>
              <AppButton
                title={isLoadingMore ? 'Loading...' : 'Load More'}
                variant="secondary"
                size="sm"
                onPress={() => void loadMore()}
                disabled={isLoadingMore}
                style={styles.loadMoreBtn}
              />
            </View>
          ) : null
        }
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={{ height: Space.sm }} />}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.brand}
            colors={[colors.brand]}
            progressBackgroundColor={colors.surfaceAlt}
          />
        }
      />

      <BidComposer
        visible={bidComposerVisible}
        auctionTitle={selectedBidAuction?.title ?? ''}
        currentBid={selectedBidAuction ? formatFromFiat(selectedBidAuction.currentBid, 'GBP', { displayMode: 'fiat' }) : undefined}
        minimumNextBid={selectedBidAuction ? formatFromFiat(selectedBidAuction.minimumNextBid, 'GBP', { displayMode: 'fiat' }) : undefined}
        bidInput={bidInput}
        currencyCode={currencyCode}
        isSubmitting={isSubmittingBid}
        onBidChange={(value) => setBidInput(sanitizeDecimalInput(value))}
        onBump={bumpBid}
        onCancel={closeBidComposer}
        onSubmit={() => void submitBid()}
      />

      <BottomSheet
        visible={bidHistoryVisible}
        onDismiss={closeBidHistory}
        snapPoint={0.6}
      >
        <View style={styles.bidHistorySheetContent}>
          <BodyEmphasis style={styles.bidHistoryTitle}>Bid History</BodyEmphasis>
          {bidHistoryAuction ? (
            <Meta style={styles.bidHistorySubtitle} numberOfLines={1}>{bidHistoryAuction.title}</Meta>
          ) : null}

          {bidHistoryLoading ? (
            <View style={styles.bidHistoryLoadingWrap}>
              {[0, 1, 2, 3, 5].map((i) => (
                <SkeletonLoader key={i} width="100%" height={48} borderRadius={8} style={{ marginBottom: Space.sm }} />
              ))}
            </View>
          ) : bidHistoryError ? (
            <View style={styles.bidHistoryEmptyWrap}>
              <Ionicons name="cloud-offline-outline" size={32} color={colors.textMuted} />
              <Meta style={styles.bidHistoryEmptyText}>Bid history unavailable</Meta>
              <AppButton
                title="Retry"
                variant="secondary"
                size="sm"
                onPress={() => bidHistoryAuction ? void openBidHistory(bidHistoryAuction) : undefined}
                style={{ marginTop: Space.sm }}
              />
            </View>
          ) : bidHistory.length === 0 ? (
            <View style={styles.bidHistoryEmptyWrap}>
              <Ionicons name="hammer-outline" size={32} color={colors.textMuted} />
              <Meta style={styles.bidHistoryEmptyText}>No bids yet</Meta>
            </View>
          ) : (
            <>
              {bidHistoryAuction ? (
                <View style={styles.bidHistoryStatusRow}>
                  {bidHistoryAuction.viewerState === 'leading' ? (
                    <View style={styles.bidHistoryLeadingBanner}>
                      <Ionicons name="trophy-outline" size={14} color={colors.brand} />
                      <Meta style={styles.bidHistoryLeadingText}>You are the highest bidder</Meta>
                    </View>
                  ) : bidHistoryAuction.viewerState === 'outbid' ? (
                    <View style={styles.bidHistoryOutbidBanner}>
                      <Ionicons name="trending-down-outline" size={14} color={colors.danger} />
                      <Meta style={styles.bidHistoryOutbidText}>Outbid</Meta>
                    </View>
                  ) : null}
                </View>
              ) : null}

              {bidHistoryAuction ? (
                <View style={styles.bidHistoryMinNextBidRow}>
                  <Meta style={styles.bidHistoryMinNextBidLabel}>Min next bid</Meta>
                  <BodyEmphasis style={styles.bidHistoryMinNextBidValue}>
                    {formatFromFiat(bidHistoryAuction.minimumNextBid, 'GBP', { displayMode: 'fiat' })}
                  </BodyEmphasis>
                </View>
              ) : null}

              <ScrollView style={styles.bidHistoryList} showsVerticalScrollIndicator={false}>
                {bidHistory.slice(0, 5).map((bid, index) => {
                  const row = formatBidActivityRow(bid, index, formatFromFiat);
                  return (
                    <View
                      key={bid.id}
                      style={[styles.bidHistoryRow, index === 0 && styles.bidHistoryRowTop]}
                    >
                      <View style={styles.bidHistoryRowLeft}>
                        <Meta style={styles.bidHistoryRowLabel} numberOfLines={1}>
                          {index === 0 ? 'Leading bid' : `Bid #${bidHistory.length - index}`}
                        </Meta>
                        <Meta style={styles.bidHistoryRowBidder} numberOfLines={1}>
                          {row.bidderLabel}
                          {row.relativeTime ? `  ·  ${row.relativeTime}` : ''}
                        </Meta>
                      </View>
                      <BodyEmphasis style={styles.bidHistoryRowAmount}>
                        {row.amountText}
                      </BodyEmphasis>
                    </View>
                  );
                })}
              </ScrollView>
            </>
          )}
        </View>
      </BottomSheet>
    </>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  contentContainer: {
    paddingBottom: Space.xxl * 2 + Space.xl + 2,
    paddingTop: Space.sm,
  },
  searchWrap: {
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
  },
  sortBar: {
    marginBottom: Space.sm,
  },
  sortScrollContent: {
    paddingHorizontal: Space.md,
    gap: Space.xs + 2,
  },
  sortChip: {
    borderRadius: Radius.full,
    borderWidth: Stroke.standard,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: Space.smMd,
    paddingVertical: Space.xs + 2,
  },
  sortChipActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  sortChipText: {
    color: colors.textSecondary,
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
  },
  sortChipTextActive: {
    color: colors.textInverse,
  },
  statusFilterBar: {
    flexDirection: 'row',
    paddingHorizontal: Space.md,
    marginBottom: Space.sm,
    gap: Space.sm,
  },
  statusChip: {
    flex: 1,
    borderRadius: Radius.md,
    borderWidth: Stroke.standard,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingVertical: Space.xs + 3,
    alignItems: 'center',
  },
  statusChipActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  statusChipText: {
    color: colors.textSecondary,
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
  },
  statusChipTextActive: {
    color: colors.textInverse,
  },
  launchRow: {
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
    borderRadius: Radius.lg,
    borderWidth: Stroke.standard,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  launchTitle: {},
  launchHint: {
    marginTop: Space.xs / 2,
  },
  launchBtn: {
    borderRadius: Radius.md,
    minHeight: Control.chromeCompact + 2,
    paddingHorizontal: Space.smMd,
  },
  actionBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  myBidsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    borderRadius: Radius.full,
    borderWidth: Stroke.standard,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: Space.sm + 2,
    paddingVertical: Space.xs + 3,
  },
  myBidsBtnText: {
    color: colors.brand,
  },
  syncBanner: {
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
  },
  featuredWrap: {
    marginHorizontal: Space.md,
    marginBottom: Space.md,
  },
  featuredLabel: {
    marginBottom: Space.sm,
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.captionElevated.letterSpacing,
    color: colors.textSecondary,
    textTransform: 'uppercase',
  },
  featuredCard: {
    borderRadius: Radius.lg,
    borderWidth: Stroke.standard,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  featuredImageFrame: {
    width: '100%',
    height: Space.xxl * 4 + Space.sm,
    position: 'relative',
  },
  featuredImageContainer: {
    width: '100%',
    height: Space.xxl * 4 + Space.sm,
  },
  featuredImage: {
    width: '100%',
    height: Space.xxl * 4 + Space.sm,
  },
  featuredImagePlaceholder: {
    width: '100%',
    height: Space.xxl * 4 + Space.sm,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featuredOverlay: {
    position: 'absolute',
    top: Space.sm,
    left: Space.sm,
    right: Space.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  featuredLivePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: Radius.full,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
  },
  featuredLiveDot: {
    width: Space.xs + 2,
    height: Space.xs + 2,
    borderRadius: Radius.md,
    backgroundColor: colors.danger,
  },
  endingSoonBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs / 2 + 1,
    backgroundColor: 'rgba(220,38,38,0.9)',
    borderRadius: Radius.full,
    paddingHorizontal: Space.xs + 3,
    paddingVertical: Space.xs / 2 + 1,
  },
  endingSoonText: {
    color: '#fff',
    fontSize: Type.meta.size - 3,
    fontFamily: Typography.family.bold,
    letterSpacing: 0.5,
  },
  featuredLiveText: {
    color: colors.textInverse,
    fontSize: Type.meta.size - 1,
    fontFamily: Typography.family.semibold,
    letterSpacing: 0.5,
  },
  featuredMeta: {
    padding: Space.md + 2,
  },
  featuredTitle: {
    marginBottom: Space.sm + 2,
    fontSize: Type.subtitle.size,
    lineHeight: Type.subtitle.lineHeight,
    fontFamily: Typography.family.semibold,
  },
  featuredStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Space.sm,
  },
  featuredStatLabel: {
    fontSize: Type.metaElevated.size,
    lineHeight: Type.metaElevated.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.metaElevated.letterSpacing,
    color: colors.textSecondary,
    marginBottom: Space.xs / 2 + 1,
    textTransform: 'uppercase',
  },
  featuredStatValue: {
    fontSize: Type.priceList.size,
    lineHeight: Type.priceList.lineHeight,
    fontFamily: Typography.family.semibold,
    fontVariant: ['tabular-nums'],
  },
  featuredTimer: {
    color: colors.danger,
  },
  outbidBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    marginTop: Space.sm,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs + 2,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(255,68,68,0.1)',
  },
  outbidText: {
    color: colors.danger,
  },
  leadingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    marginTop: Space.sm,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs + 2,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  leadingText: {
    color: colors.brand,
  },
  sectionWrap: {
    marginBottom: Space.sm,
  },
  sectionTitleRow: {
    paddingHorizontal: Space.md,
    marginBottom: Space.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontFamily: Typography.family.semibold,
  },
  horizontalListContent: {
    paddingHorizontal: Space.md,
    gap: Space.sm,
  },
  upcomingCard: {
    width: Space.xxl * 4 + Space.md,
    backgroundColor: colors.surface,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: Stroke.standard,
    borderColor: colors.border,
  },
  upcomingImageFrame: {
    width: '100%',
    height: Space.xxl * 2 + Space.lg,
  },
  upcomingImageContainer: {
    width: '100%',
    height: Space.xxl * 2 + Space.lg,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
  },
  upcomingImage: {
    width: '100%',
    height: '100%',
  },
  upcomingMeta: {
    padding: Space.sm + 4,
  },
  upcomingTitle: {
    marginBottom: Space.xs + 1,
    fontFamily: Typography.family.semibold,
  },
  upcomingTimer: {
    color: colors.brand,
    marginBottom: Space.xs / 2,
    fontVariant: ['tabular-nums'],
  },
  upcomingBid: {
    fontVariant: ['tabular-nums'],
  },
  loadingWrap: {
    paddingHorizontal: Space.md,
    gap: Space.sm,
  },
  loadingCard: {
    borderRadius: Radius.lg,
    borderWidth: Stroke.standard,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    marginBottom: Space.sm,
  },
  loadMoreWrap: {
    paddingVertical: Space.md,
    alignItems: 'center',
  },
  loadMoreBtn: {
    minWidth: 140,
  },
  bidHistorySheetContent: {
    padding: Space.md,
    flex: 1,
  },
  bidHistoryTitle: {
    fontSize: Type.subtitle.size,
    lineHeight: Type.subtitle.lineHeight,
    fontFamily: Typography.family.semibold,
    marginBottom: Space.xs / 2,
  },
  bidHistorySubtitle: {
    color: colors.textSecondary,
    marginBottom: Space.md,
  },
  bidHistoryLoadingWrap: {
    paddingVertical: Space.sm,
  },
  bidHistoryEmptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Space.xxl,
    gap: Space.sm,
  },
  bidHistoryEmptyText: {
    color: colors.textMuted,
  },
  bidHistoryStatusRow: {
    marginBottom: Space.sm,
  },
  bidHistoryLeadingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs + 2,
    borderRadius: Radius.md,
    backgroundColor: `${colors.brand}1A`,
  },
  bidHistoryLeadingText: {
    color: colors.brand,
    fontFamily: Typography.family.semibold,
  },
  bidHistoryOutbidBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs + 2,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(255,68,68,0.1)',
  },
  bidHistoryOutbidText: {
    color: colors.danger,
    fontFamily: Typography.family.semibold,
  },
  bidHistoryMinNextBidRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.sm,
    paddingVertical: Space.sm,
    borderRadius: Radius.md,
    backgroundColor: colors.surfaceAlt,
    marginBottom: Space.md,
  },
  bidHistoryMinNextBidLabel: {
    color: colors.textSecondary,
    fontFamily: Typography.family.medium,
  },
  bidHistoryMinNextBidValue: {
    color: colors.brand,
    fontSize: Type.priceList.size,
    lineHeight: Type.priceList.lineHeight,
    fontFamily: Typography.family.semibold,
    fontVariant: ['tabular-nums'],
  },
  bidHistoryList: {
    flex: 1,
  },
  bidHistoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Space.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  bidHistoryRowTop: {
    borderRadius: Radius.md,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: Space.sm,
    marginBottom: Space.xs,
    borderBottomWidth: 0,
  },
  bidHistoryRowLeft: {
    flex: 1,
    marginRight: Space.sm,
  },
  bidHistoryRowLabel: {
    color: colors.textSecondary,
    marginBottom: 3,
    fontFamily: Typography.family.medium,
  },
  bidHistoryRowBidder: {
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  bidHistoryRowAmount: {
    color: colors.textPrimary,
    fontSize: Type.priceList.size,
    lineHeight: Type.priceList.lineHeight,
    fontFamily: Typography.family.semibold,
    fontVariant: ['tabular-nums'],
  },
  });
}
