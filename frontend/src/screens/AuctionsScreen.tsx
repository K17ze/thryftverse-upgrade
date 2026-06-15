import React from 'react';
import { View, StyleSheet, RefreshControl } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { ActiveTheme, Colors } from '../constants/colors';
import { RootStackParamList } from '../navigation/types';
import { getFreshPosters } from '../data/posters';
import { useToast } from '../context/ToastContext';
import { EmptyState } from '../components/EmptyState';
import { useStore } from '../store/useStore';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useCurrencyContext } from '../context/CurrencyContext';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { SyncStatusPill } from '../components/SyncStatusPill';
import { SyncRetryBanner } from '../components/SyncRetryBanner';
import { parseApiError } from '../lib/apiClient';
import { AppButton } from '../components/ui/AppButton';
import { AppInput } from '../components/ui/AppInput';
import {
  convertDisplayToGbpAmount,
  getSuggestedBidDisplayAmount,
  sanitizeDecimalInput,
} from '../utils/currencyAuthoringFlows';
import { listAuctions, placeAuctionBid as placeAuctionBidRemote } from '../services/marketApi';
import { t } from '../i18n';
import { Motion } from '../constants/motion';
import { Space, Radius } from '../theme/designTokens';
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

type AuctionLifecycle = 'upcoming' | 'live' | 'ended';

interface AuctionMarketItem {
  id: string;
  listingId: string;
  sellerId: string;
  title: string;
  image: string;
  startsAt: string;
  endsAt: string;
  startingBid: number;
  currentBid: number;
  bidCount: number;
  buyNowPrice?: number;
}

interface AuctionViewModel extends AuctionMarketItem {
  lifecycle: AuctionLifecycle;
  msToStart: number;
  msToEnd: number;
  progress: number;
}

function formatCompact(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return `${value}`;
}

function formatCountdown(ms: number) {
  if (ms <= 0) return '00:00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
  const minutes = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

type NavT = StackNavigationProp<RootStackParamList>;

export default function AuctionsScreen() {
  const navigation = useNavigation<NavT>();
  const { show } = useToast();
  const { formatFromFiat } = useFormattedPrice();
  const { currencyCode, goldRates } = useCurrencyContext();
  const currentUser = useStore((state) => state.currentUser);
  const customPosters = useStore((state) => state.customPosters);
  const customAuctions = useStore((state) => state.customAuctions);
  const auctionRuntime = useStore((state) => state.auctionRuntime);
  const settleExpiredAuctions = useStore((state) => state.settleExpiredAuctions);
  const reducedMotionEnabled = useReducedMotion();

  const actingUserId = currentUser?.id ?? 'u1';

  const [nowTs, setNowTs] = React.useState(Date.now());
  const [refreshing, setRefreshing] = React.useState(false);
  const [bidComposerVisible, setBidComposerVisible] = React.useState(false);
  const [selectedBidAuction, setSelectedBidAuction] = React.useState<AuctionViewModel | null>(null);
  const [bidInput, setBidInput] = React.useState('');
  const [remoteAuctions, setRemoteAuctions] = React.useState<AuctionMarketItem[]>([]);
  const [isSyncingAuctions, setIsSyncingAuctions] = React.useState(false);
  const [syncError, setSyncError] = React.useState<string | null>(null);
  const [isSubmittingBid, setIsSubmittingBid] = React.useState(false);
  const [buyNowAuctionId, setBuyNowAuctionId] = React.useState<string | null>(null);
  const [watchedAuctionIds, setWatchedAuctionIds] = React.useState<Set<string>>(() => new Set());
  const [searchQuery, setSearchQuery] = React.useState('');

  const syncAuctions = React.useCallback(async () => {
    setIsSyncingAuctions(true);
    try {
      const items = await listAuctions({ limit: 120, sellerId: actingUserId });
      const mapped: AuctionMarketItem[] = items.map((item) => ({
        id: item.id,
        listingId: item.listingId,
        sellerId: item.sellerId,
        title: item.title,
        image: item.imageUrl ?? '',
        startsAt: item.startsAt,
        endsAt: item.endsAt,
        startingBid: item.startingBidGbp,
        currentBid: item.currentBidGbp,
        bidCount: item.bidCount,
        buyNowPrice: item.buyNowPriceGbp ?? undefined,
      }));
      setRemoteAuctions(mapped);
      setSyncError(null);
    } catch (error) {
      setSyncError((error as Error).message || t('auctions.sync.unable'));
    } finally {
      setIsSyncingAuctions(false);
    }
  }, [actingUserId]);

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

  const baseAuctions = React.useMemo(() => {
    const merged = new Map<string, AuctionMarketItem>();
    for (const item of remoteAuctions) {
      merged.set(item.id, item);
    }
    for (const item of customAuctions) {
      if (item.sellerId !== actingUserId) continue;
      merged.set(item.id, item);
    }
    return [...merged.values()];
  }, [actingUserId, customAuctions, remoteAuctions]);

  const marketAuctions = React.useMemo(() => {
    const WINDOW_6_HOURS_MS = 6 * 60 * 60 * 1000;
    const lifecycleRank: Record<AuctionLifecycle, number> = { live: 0, upcoming: 1, ended: 2 };
    return baseAuctions
      .map<AuctionViewModel>((auction) => {
        const startsAtMs = new Date(auction.startsAt).getTime();
        const endsAtMs = new Date(auction.endsAt).getTime();
        const msToStart = startsAtMs - nowTs;
        const msToEnd = endsAtMs - nowTs;
        let lifecycle: AuctionLifecycle = 'upcoming';
        if (msToStart <= 0 && msToEnd > 0) lifecycle = 'live';
        else if (msToEnd <= 0) lifecycle = 'ended';
        const elapsedMs = Math.max(0, WINDOW_6_HOURS_MS - msToEnd);
        const progress = Math.min(1, Math.max(0, elapsedMs / WINDOW_6_HOURS_MS));
        return { ...auction, lifecycle, msToStart, msToEnd, progress };
      })
      .sort((a, b) => {
        if (lifecycleRank[a.lifecycle] !== lifecycleRank[b.lifecycle]) {
          return lifecycleRank[a.lifecycle] - lifecycleRank[b.lifecycle];
        }
        if (a.lifecycle === 'live') return a.msToEnd - b.msToEnd;
        if (a.lifecycle === 'upcoming') return a.msToStart - b.msToStart;
        return b.currentBid - a.currentBid;
      });
  }, [baseAuctions, nowTs]);

  const auctions = React.useMemo(() => {
    return marketAuctions.map((item) => {
      const runtime = auctionRuntime[item.id];
      if (!runtime) return item;
      const isClosed = !!runtime.closedAtMs;
      return {
        ...item,
        lifecycle: isClosed ? 'ended' : item.lifecycle,
        msToEnd: isClosed ? 0 : item.msToEnd,
        progress: isClosed ? 1 : item.progress,
        currentBid: runtime.currentBid,
        bidCount: runtime.bidCount,
      };
    });
  }, [auctionRuntime, marketAuctions]);

  React.useEffect(() => {
    settleExpiredAuctions(auctions);
  }, [auctions, settleExpiredAuctions]);

  const liveAuctions = React.useMemo(() => auctions.filter((item) => item.lifecycle === 'live'), [auctions]);
  const upcomingAuctions = React.useMemo(() => auctions.filter((item) => item.lifecycle === 'upcoming'), [auctions]);

  const totalLiveBids = React.useMemo(() => liveAuctions.reduce((sum, item) => sum + item.bidCount, 0), [liveAuctions]);

  const adPosters = React.useMemo(() => {
    const upcomingListingIds = new Set(upcomingAuctions.map((item) => item.listingId));
    return getFreshPosters(nowTs, 24, customPosters).filter((poster) => upcomingListingIds.has(poster.listingId));
  }, [customPosters, nowTs, upcomingAuctions]);

  const marketStatus = React.useMemo(() => {
    if (isSyncingAuctions) return { tone: 'syncing' as const, label: t('auctions.status.syncing') };
    if (syncError) return { tone: 'offline' as const, label: t('auctions.status.reconnecting') };
    if (remoteAuctions.length > 0) return { tone: 'live' as const, label: t('auctions.status.synced') };
    if (auctions.length > 0) return { tone: 'offline' as const, label: t('auctions.status.localMode') };
    return { tone: 'offline' as const, label: t('auctions.status.none') };
  }, [auctions.length, isSyncingAuctions, remoteAuctions.length, syncError]);

  const filteredLiveAuctions = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return liveAuctions;
    return liveAuctions.filter((item) => item.title.toLowerCase().includes(q));
  }, [liveAuctions, searchQuery]);

  const openBidComposer = (auction: AuctionViewModel) => {
    const suggestedDisplayBid = getSuggestedBidDisplayAmount(auction.currentBid, currencyCode, goldRates);
    setSelectedBidAuction(auction);
    setBidInput(suggestedDisplayBid.toFixed(2));
    setBidComposerVisible(true);
  };

  const handleToggleWatch = (auction: AuctionViewModel) => {
    const isWatching = watchedAuctionIds.has(auction.id);
    setWatchedAuctionIds((current) => {
      const next = new Set(current);
      if (next.has(auction.id)) next.delete(auction.id);
      else next.add(auction.id);
      return next;
    });
    show(
      isWatching
        ? t('auctions.watch.removed', { title: auction.title })
        : t('auctions.watch.added', { title: auction.title }),
      'info'
    );
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

    if (amountInGbp <= selectedBidAuction.currentBid) {
      show(t('auctions.bid.error.mustBeAbove', { amount: formatFromFiat(selectedBidAuction.currentBid, 'GBP', { displayMode: 'fiat' }) }), 'error');
      return;
    }

    const roundedAmount = Number(amountInGbp.toFixed(2));
    setIsSubmittingBid(true);

    try {
      const remoteResult = await placeAuctionBidRemote(selectedBidAuction.id, {
        bidderId: actingUserId,
        amountGbp: roundedAmount,
      });
      await syncAuctions();
      setNowTs(Date.now());
      show(t('auctions.bid.success.placed', { title: selectedBidAuction.title, amount: formatFromFiat(roundedAmount, 'GBP', { displayMode: 'fiat' }) }), 'success');
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
      const remoteResult = await placeAuctionBidRemote(auction.id, {
        bidderId: actingUserId,
        amountGbp: Number(auction.buyNowPrice.toFixed(2)),
      });
      await syncAuctions();
      show(t('auctions.buy.success.won', { title: auction.title }), 'success');
      if (remoteResult.aml?.alertId) show(t('auctions.buy.info.aml'), 'info');
      navigation.navigate('Checkout', { itemId: auction.listingId });
    } catch (error) {
      const parsedError = parseApiError(error, t('auctions.buy.error.unableComplete'));
      show(parsedError.message, 'error');
    } finally {
      setBuyNowAuctionId(null);
    }
  };

  const renderHeader = () => (
    <View>
      <MetricGrid
        metrics={[
          { label: 'Live Auctions', value: String(liveAuctions.length) },
          { label: 'Active Bids', value: String(totalLiveBids) },
          { label: 'Watchlist', value: String(watchedAuctionIds.size) },
        ]}
        columns={3}
        style={{ marginTop: Space.sm }}
      />

      <View style={styles.searchWrap}>
        <AppInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search auctions..."
          prefix={<Ionicons name="search-outline" size={16} color={Colors.textMuted} />}
          accessibilityLabel="Search auctions"
        />
      </View>

      <View style={styles.launchRow}>
        <View>
          <BodyEmphasis style={styles.launchTitle}>{t('auctions.cta.createAuction')}</BodyEmphasis>
          <Meta style={styles.launchHint}>Schedule a 6-hour drop</Meta>
        </View>
        <View style={styles.actionBtnRow}>
          <AnimatedPressable
            style={styles.myBidsBtn}
            activeOpacity={0.9}
            onPress={() => navigation.navigate('MyBids')}
            accessibilityRole="button"
            accessibilityLabel="My Bids"
            accessibilityHint="View your active bids"
          >
            <Ionicons name="list-outline" size={15} color={Colors.brand} />
            <Meta style={styles.myBidsBtnText}>My Bids</Meta>
          </AnimatedPressable>
          <AppButton
            title="Create"
            icon={<Ionicons name="add" size={15} color={Colors.background} />}
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

      {upcomingAuctions.length > 0 && (
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
            renderItem={({ item }) => (
              <AnimatedPressable
                style={styles.upcomingCard}
                activeOpacity={0.9}
                onPress={() => navigation.push('ItemDetail', { itemId: item.listingId })}
                accessibilityRole="button"
                accessibilityLabel={`Open upcoming auction ${item.title}`}
              >
                <SharedTransitionView style={styles.upcomingImageFrame} sharedTransitionTag={`image-${item.listingId}-0`}>
                  <CachedImage uri={item.image} style={styles.upcomingImage} containerStyle={styles.upcomingImageContainer} contentFit="cover" />
                </SharedTransitionView>
                <View style={styles.upcomingMeta}>
                  <BodyEmphasis style={styles.upcomingTitle} numberOfLines={1}>{item.title}</BodyEmphasis>
                  <Body style={styles.upcomingTimer}>{t('auctions.upcoming.startsIn', { countdown: formatCountdown(item.msToStart) })}</Body>
                  <Meta style={styles.upcomingBid}>{t('auctions.upcoming.startingBid', { amount: formatFromFiat(item.startingBid, 'GBP', { displayMode: 'fiat' }) })}</Meta>
                </View>
              </AnimatedPressable>
            )}
          />
        </View>
      )}

      {adPosters.length > 0 && (
        <View style={styles.sectionWrap}>
          <View style={styles.sectionTitleRow}>
            <BodyEmphasis style={styles.sectionTitle}>{t('auctions.section.upcomingPosters')}</BodyEmphasis>
          </View>
          <FlashList
            data={adPosters}
            horizontal
            keyExtractor={(item) => item.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.horizontalListContent}
            renderItem={({ item }) => (
              <AnimatedPressable
                style={styles.posterCard}
                activeOpacity={0.9}
                onPress={() => navigation.navigate('PosterViewer', { posterId: item.id })}
                accessibilityRole="button"
              >
                <CachedImage uri={item.image} style={styles.posterImage} containerStyle={styles.posterImageContainer} contentFit="cover" />
                <View style={styles.posterOverlay}>
                  <Meta style={styles.posterSeller} numberOfLines={1}>@{item.uploader?.username ?? t('auctions.poster.unknownSeller')}</Meta>
                  <Body style={styles.posterTime}>{item.remainingHours}h</Body>
                </View>
              </AnimatedPressable>
            )}
          />
        </View>
      )}

      {liveAuctions.length > 0 && (
        <View style={styles.sectionTitleRow}>
          <BodyEmphasis style={styles.sectionTitle}>Live Auctions</BodyEmphasis>
          <SyncStatusPill tone={marketStatus.tone} label={marketStatus.label} compact />
        </View>
      )}
    </View>
  );

  const renderLoadingState = () => (
    <View style={styles.loadingWrap}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={styles.loadingCard}>
          <SkeletonLoader width="100%" height={172} borderRadius={12} />
          <View style={{ padding: 12 }}>
            <SkeletonLoader width="70%" height={16} borderRadius={8} style={{ marginBottom: 8 }} />
            <SkeletonLoader width="40%" height={12} borderRadius={6} style={{ marginBottom: 8 }} />
            <SkeletonLoader width="100%" height={40} borderRadius={10} />
          </View>
        </View>
      ))}
    </View>
  );

  return (
    <>
      <FlashList
        data={filteredLiveAuctions}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => {
          const isWatching = watchedAuctionIds.has(item.id);
          const sellerLabel = `@${item.sellerId.slice(0, 12)}`;
          return (
            <Reanimated.View
              entering={
                reducedMotionEnabled
                  ? undefined
                  : FadeInDown
                      .duration(Motion.list.enterDuration)
                      .delay(Math.min(index, Motion.list.maxStaggerItems) * Motion.list.staggerStep)
              }
            >
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
                isWatching={isWatching}
                buyNowPrice={item.buyNowPrice ? formatFromFiat(item.buyNowPrice, 'GBP', { displayMode: 'fiat' }) : undefined}
                onPress={() => navigation.push('ItemDetail', { itemId: item.listingId })}
                onBid={() => openBidComposer(item)}
                onBuyNow={() => void handleBuyNow(item)}
                onToggleWatch={() => handleToggleWatch(item)}
                onPressSeller={() => navigation.navigate('UserProfile', { userId: item.sellerId })}
                onMessageSeller={() =>
                  navigation.navigate('Chat', {
                    conversationId: `${item.sellerId}_${item.listingId}`,
                    focusQuery: sellerLabel,
                    partnerUserId: item.sellerId,
                  })
                }
                isBuyNowLoading={buyNowAuctionId === item.id}
                isBidSubmitting={isSubmittingBid}
              />
            </Reanimated.View>
          );
        }}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={
          isSyncingAuctions ? renderLoadingState() : (
            <EmptyState
              icon="hourglass-outline"
              title={t('auctions.empty.noActive')}
            />
          )
        }
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={{ height: Space.sm }} />}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.brand}
            colors={[Colors.brand]}
            progressBackgroundColor={Colors.surfaceAlt}
          />
        }
      />

      <BidComposer
        visible={bidComposerVisible}
        auctionTitle={selectedBidAuction?.title ?? ''}
        bidInput={bidInput}
        currencyCode={currencyCode}
        isSubmitting={isSubmittingBid}
        onBidChange={(value) => setBidInput(sanitizeDecimalInput(value))}
        onBump={bumpBid}
        onCancel={closeBidComposer}
        onSubmit={() => void submitBid()}
      />
    </>
  );
}

const styles = StyleSheet.create({
  contentContainer: {
    paddingBottom: 130,
    paddingTop: Space.sm,
  },
  searchWrap: {
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
  },
  launchRow: {
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  launchTitle: {},
  launchHint: {
    marginTop: 2,
  },
  launchBtn: {
    borderRadius: 14,
    minHeight: 34,
    paddingHorizontal: 12,
  },
  actionBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  myBidsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  myBidsBtnText: {
    color: Colors.brand,
  },
  syncBanner: {
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
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
  sectionTitle: {},
  horizontalListContent: {
    paddingHorizontal: Space.md,
    gap: Space.sm,
  },
  upcomingCard: {
    width: 208,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  upcomingImageFrame: {
    width: '100%',
    height: 120,
  },
  upcomingImageContainer: {
    width: '100%',
    height: 120,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
  },
  upcomingImage: {
    width: '100%',
    height: '100%',
  },
  upcomingMeta: {
    padding: Space.sm + 2,
  },
  upcomingTitle: {
    marginBottom: 4,
  },
  upcomingTimer: {
    color: Colors.brand,
    marginBottom: 2,
  },
  upcomingBid: {},
  posterCard: {
    width: 96,
    height: 126,
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  posterImageContainer: {
    width: '100%',
    height: '100%',
  },
  posterImage: {
    width: '100%',
    height: '100%',
  },
  posterOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 6,
    paddingVertical: 6,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  posterSeller: {
    color: '#fff',
  },
  posterTime: {
    color: Colors.brand,
    marginTop: 2,
  },
  loadingWrap: {
    paddingHorizontal: Space.md,
    gap: Space.sm,
  },
  loadingCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
    marginBottom: Space.sm,
  },
});
