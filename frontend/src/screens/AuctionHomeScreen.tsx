import React from 'react';
import {
  View,
  StyleSheet,
  RefreshControl,
  Pressable,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';
import { RootStackParamList } from '../navigation/types';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import type { SupportedCurrencyCode } from '../constants/currencies';
import type { CurrencyDisplayMode } from '../utils/currency';
import { useServerClockTick, resolveAuctionTiming, formatCountdown } from '../hooks/useServerClock';
import { CachedImage } from '../components/CachedImage';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { EmptyState } from '../components/EmptyState';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { Meta, Body, BodyEmphasis } from '../components/ui/Text';
import { AppButton } from '../components/ui/AppButton';
import { AppInput } from '../components/ui/AppInput';
import { Space, Radius } from '../theme/designTokens';
import { haptics } from '../utils/haptics';
import {
  listAuctions,
  getWatchlist,
  type MarketAuction,
  type AuctionViewerState,
} from '../services/marketApi';

type NavT = StackNavigationProp<RootStackParamList>;

interface AuctionHomeItem {
  id: string;
  listingId: string;
  sellerId: string;
  sellerUsername: string;
  sellerDisplayName: string | null;
  title: string;
  imageUrl: string;
  brand: string | null;
  startsAt: string;
  endsAt: string;
  startingBidGbp: number;
  currentBidGbp: number;
  minimumNextBidGbp: number;
  bidCount: number;
  buyNowPriceGbp: number | null;
  viewerState: AuctionViewerState;
  isWatched: boolean;
  cancelledAt: string | null;
  settledAt: string | null;
}

type SectionKind =
  | 'attention'
  | 'live'
  | 'endingSoon'
  | 'upcoming'
  | 'watchlist'
  | 'recentlyEnded'
  | 'sellerTools';

interface Section {
  kind: SectionKind;
  title: string;
  items: AuctionHomeItem[];
}

function isAttentionItem(item: AuctionHomeItem): boolean {
  if (item.viewerState === 'outbid') return true;
  if (item.viewerState === 'won') return true;
  if (item.viewerState === 'seller' && item.settledAt) return true;
  return false;
}

function isEndingSoon(item: AuctionHomeItem, nowMs: number): boolean {
  const timing = resolveAuctionTiming(item, nowMs);
  if (timing.effectiveState !== 'live') return false;
  return timing.msToEnd > 0 && timing.msToEnd <= 60 * 60 * 1000;
}

function toViewModel(api: MarketAuction): AuctionHomeItem {
  return {
    id: api.id,
    listingId: api.listingId,
    sellerId: api.seller.id,
    sellerUsername: api.seller.username,
    sellerDisplayName: api.seller.displayName,
    title: api.title,
    imageUrl: api.imageUrl ?? '',
    brand: api.brand,
    startsAt: api.startsAt,
    endsAt: api.endsAt,
    startingBidGbp: api.startingBidGbp,
    currentBidGbp: api.currentBidGbp,
    minimumNextBidGbp: api.minimumNextBidGbp,
    bidCount: api.bidCount,
    buyNowPriceGbp: api.buyNowPriceGbp,
    viewerState: api.viewerState,
    isWatched: api.isWatched,
    cancelledAt: null,
    settledAt: null,
  };
}

function AuctionHomeCard({
  item,
  nowMs,
  onPress,
  formatFromFiat,
}: {
  item: AuctionHomeItem;
  nowMs: number;
  onPress: () => void;
  formatFromFiat: (amount: number, currency?: SupportedCurrencyCode, opts?: { displayMode?: CurrencyDisplayMode }) => string;
}) {
  const timing = resolveAuctionTiming(item, nowMs);
  const sellerLabel = item.sellerDisplayName ?? `@${item.sellerUsername}`;

  const stateLabel: string =
    timing.effectiveState === 'cancelled' ? 'Cancelled' :
    timing.effectiveState === 'settled' ? 'Settled' :
    timing.effectiveState === 'ended' ? 'Ended' :
    timing.effectiveState === 'upcoming' ? `Starts ${formatCountdown(timing.msToStart)}` :
    formatCountdown(timing.msToEnd);

  const viewerBadge: { text: string; color: string } | null =
    item.viewerState === 'outbid' ? { text: 'Outbid', color: '#ff4444' } :
    item.viewerState === 'leading' ? { text: 'Leading', color: Colors.brand } :
    item.viewerState === 'won' ? { text: 'Won', color: Colors.brand } :
    item.viewerState === 'lost' ? { text: 'Lost', color: '#ff4444' } :
    item.viewerState === 'seller' ? { text: 'Your auction', color: Colors.brand } :
    null;

  return (
    <AnimatedPressable
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.92}
      scaleValue={0.985}
      accessibilityRole="button"
      accessibilityLabel={`Auction: ${item.title}`}
      accessibilityHint="Opens auction details"
    >
      <View style={styles.cardImageWrap}>
        {item.imageUrl ? (
          <CachedImage
            uri={item.imageUrl}
            style={styles.cardImage}
            containerStyle={styles.cardImageContainer}
            contentFit="cover"
          />
        ) : (
          <View style={styles.cardImagePlaceholder}>
            <Ionicons name="image-outline" size={24} color={Colors.textMuted} />
          </View>
        )}
        {timing.effectiveState === 'live' && (
          <View style={styles.livePill}>
            <View style={styles.liveDot} />
            <Meta style={styles.livePillText}>Live</Meta>
          </View>
        )}
        {viewerBadge && (
          <View style={[styles.viewerBadge, { backgroundColor: viewerBadge.color + 'E6' }]}>
            <Meta style={styles.viewerBadgeText}>{viewerBadge.text}</Meta>
          </View>
        )}
      </View>
      <View style={styles.cardBody}>
        <BodyEmphasis style={styles.cardTitle} numberOfLines={1}>{item.title}</BodyEmphasis>
        <Meta style={styles.cardSeller}>by {sellerLabel}</Meta>
        <View style={styles.cardStatsRow}>
          <View style={styles.cardStat}>
            <Meta style={styles.cardStatLabel}>Current bid</Meta>
            <Body style={styles.cardStatValue}>
              {formatFromFiat(item.currentBidGbp, 'GBP', { displayMode: 'fiat' })}
            </Body>
          </View>
          <View style={styles.cardStat}>
            <Meta style={styles.cardStatLabel}>{item.bidCount} bids</Meta>
            <Body style={styles.cardTimer}>{stateLabel}</Body>
          </View>
        </View>
      </View>
    </AnimatedPressable>
  );
}

function SectionHeader({ title, actionLabel, onAction }: { title: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <View style={styles.sectionHeader}>
      <BodyEmphasis style={styles.sectionTitle}>{title}</BodyEmphasis>
      {actionLabel && onAction && (
        <Pressable onPress={onAction} hitSlop={8} accessibilityRole="button" accessibilityLabel={actionLabel}>
          <Meta style={styles.sectionAction}>{actionLabel}</Meta>
        </Pressable>
      )}
    </View>
  );
}

function AttentionCard({
  item,
  nowMs,
  onPress,
  formatFromFiat,
}: {
  item: AuctionHomeItem;
  nowMs: number;
  onPress: () => void;
  formatFromFiat: (amount: number, currency?: SupportedCurrencyCode, opts?: { displayMode?: CurrencyDisplayMode }) => string;
}) {
  const ctaText =
    item.viewerState === 'outbid' ? 'Bid again' :
    item.viewerState === 'won' ? 'Complete purchase' :
    item.viewerState === 'seller' && item.settledAt ? 'View outcome' :
    'View';

  return (
    <AnimatedPressable
      style={styles.attentionCard}
      onPress={onPress}
      activeOpacity={0.92}
      scaleValue={0.985}
      accessibilityRole="button"
      accessibilityLabel={`Attention: ${item.title} — ${ctaText}`}
    >
      <View style={styles.attentionImageWrap}>
        {item.imageUrl ? (
          <CachedImage
            uri={item.imageUrl}
            style={styles.attentionImage}
            containerStyle={styles.attentionImageContainer}
            contentFit="cover"
          />
        ) : (
          <View style={styles.attentionImagePlaceholder}>
            <Ionicons name="image-outline" size={24} color={Colors.textMuted} />
          </View>
        )}
      </View>
      <View style={styles.attentionBody}>
        <BodyEmphasis style={styles.attentionTitle} numberOfLines={1}>{item.title}</BodyEmphasis>
        <Meta style={styles.attentionReason}>
          {item.viewerState === 'outbid' && 'You have been outbid'}
          {item.viewerState === 'won' && 'You won this auction'}
          {item.viewerState === 'seller' && item.settledAt && 'Auction settled — view outcome'}
        </Meta>
        <View style={styles.attentionRow}>
          <Body style={styles.attentionBid}>
            {formatFromFiat(item.currentBidGbp, 'GBP', { displayMode: 'fiat' })}
          </Body>
          <AppButton
            title={ctaText}
            variant="primary"
            size="sm"
            onPress={onPress}
            hapticFeedback="medium"
            accessibilityLabel={ctaText}
          />
        </View>
      </View>
    </AnimatedPressable>
  );
}

export default function AuctionHomeScreen() {
  const navigation = useNavigation<NavT>();
  const { formatFromFiat } = useFormattedPrice();

  const [allAuctions, setAllAuctions] = React.useState<MarketAuction[]>([]);
  const [watchlistAuctions, setWatchlistAuctions] = React.useState<MarketAuction[]>([]);
  const [serverNowStr, setServerNowStr] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);

  const { nowMs, resync } = useServerClockTick(serverNowStr);

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [auctionsResult, watchlistResult] = await Promise.all([
        listAuctions({ status: 'all', sort: 'endingSoon', limit: 50 }),
        getWatchlist(),
      ]);
      setAllAuctions(auctionsResult.items);
      setServerNowStr(auctionsResult.serverNow);
      setNextCursor(auctionsResult.nextCursor);
      setWatchlistAuctions(watchlistResult.items);
      resync(auctionsResult.serverNow);
    } catch (err) {
      setError('Unable to load auctions');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [resync]);

  React.useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleRefresh = React.useCallback(() => {
    setRefreshing(true);
    void fetchData();
  }, [fetchData]);

  const loadMore = React.useCallback(async () => {
    if (!nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const result = await listAuctions({
        status: 'all',
        sort: 'endingSoon',
        cursor: nextCursor,
        limit: 30,
      });
      setAllAuctions((prev) => {
        const existingIds = new Set(prev.map((a) => a.id));
        const newItems = result.items.filter((a) => !existingIds.has(a.id));
        return [...prev, ...newItems];
      });
      setNextCursor(result.nextCursor);
    } catch {
      // Silent fail on pagination
    } finally {
      setIsLoadingMore(false);
    }
  }, [nextCursor, isLoadingMore]);

  const viewModels = React.useMemo(() => allAuctions.map(toViewModel), [allAuctions]);
  const watchlistVMs = React.useMemo(() => watchlistAuctions.map(toViewModel), [watchlistAuctions]);

  const sections = React.useMemo(() => {
    const usedIds = new Set<string>();
    const result: Section[] = [];

    // 1. Needs your attention
    const attentionItems = viewModels.filter((item) => {
      const timing = resolveAuctionTiming(item, nowMs);
      if (timing.effectiveState === 'cancelled' || timing.effectiveState === 'settled') return false;
      return isAttentionItem(item);
    });
    if (attentionItems.length > 0) {
      attentionItems.forEach((a) => usedIds.add(a.id));
      result.push({ kind: 'attention', title: 'Needs your attention', items: attentionItems });
    }

    // 2. Live now
    const liveItems = viewModels.filter((item) => {
      if (usedIds.has(item.id)) return false;
      const timing = resolveAuctionTiming(item, nowMs);
      return timing.effectiveState === 'live' && !isEndingSoon(item, nowMs);
    });
    if (liveItems.length > 0) {
      liveItems.forEach((a) => usedIds.add(a.id));
      result.push({ kind: 'live', title: 'Live now', items: liveItems });
    }

    // 3. Ending soon
    const endingSoonItems = viewModels.filter((item) => {
      if (usedIds.has(item.id)) return false;
      return isEndingSoon(item, nowMs);
    });
    if (endingSoonItems.length > 0) {
      endingSoonItems.forEach((a) => usedIds.add(a.id));
      result.push({ kind: 'endingSoon', title: 'Ending soon', items: endingSoonItems });
    }

    // 4. Upcoming
    const upcomingItems = viewModels.filter((item) => {
      if (usedIds.has(item.id)) return false;
      const timing = resolveAuctionTiming(item, nowMs);
      return timing.effectiveState === 'upcoming';
    });
    if (upcomingItems.length > 0) {
      upcomingItems.forEach((a) => usedIds.add(a.id));
      result.push({ kind: 'upcoming', title: 'Upcoming', items: upcomingItems });
    }

    // 5. Watchlist
    const watchlistItems = watchlistVMs.filter((item) => {
      if (usedIds.has(item.id)) return false;
      const timing = resolveAuctionTiming(item, nowMs);
      return timing.effectiveState === 'live' || timing.effectiveState === 'upcoming';
    });
    if (watchlistItems.length > 0) {
      watchlistItems.forEach((a) => usedIds.add(a.id));
      result.push({ kind: 'watchlist', title: 'Watching', items: watchlistItems });
    }

    // 6. Recently ended
    const endedItems = viewModels.filter((item) => {
      if (usedIds.has(item.id)) return false;
      const timing = resolveAuctionTiming(item, nowMs);
      return timing.effectiveState === 'ended';
    });
    if (endedItems.length > 0) {
      result.push({ kind: 'recentlyEnded', title: 'Recently ended', items: endedItems });
    }

    // 7. Seller tools
    const sellerItems = viewModels.filter((item) => item.viewerState === 'seller');
    if (sellerItems.length > 0) {
      result.push({ kind: 'sellerTools', title: 'Your auctions', items: sellerItems });
    }

    return result;
  }, [viewModels, watchlistVMs, nowMs]);

  const navigateToDetail = React.useCallback((auctionId: string) => {
    navigation.navigate('AuctionDetail', { auctionId });
  }, [navigation]);

  const renderItem = ({ item }: { item: AuctionHomeItem }) => (
    <AuctionHomeCard
      item={item}
      nowMs={nowMs}
      onPress={() => navigateToDetail(item.id)}
      formatFromFiat={formatFromFiat}
    />
  );

  const renderAttentionItem = ({ item }: { item: AuctionHomeItem }) => (
    <AttentionCard
      item={item}
      nowMs={nowMs}
      onPress={() => navigateToDetail(item.id)}
      formatFromFiat={formatFromFiat}
    />
  );

  const renderSection = (section: Section) => {
    if (section.items.length === 0) return null;

    const isHorizontal = section.kind === 'upcoming' || section.kind === 'watchlist';

    return (
      <View key={section.kind} style={styles.sectionWrap}>
        <SectionHeader
          title={section.title}
          actionLabel={
            section.kind === 'sellerTools' ? 'My Auctions' :
            undefined
          }
          onAction={
            section.kind === 'sellerTools' ? () => { haptics.tap(); navigation.navigate('MyBids'); } :
            undefined
          }
        />
        {section.kind === 'attention' ? (
          <FlashList
            data={section.items}
            keyExtractor={(item) => item.id}
            renderItem={renderAttentionItem}
            scrollEnabled={false}
            ItemSeparatorComponent={() => <View style={{ height: Space.sm }} />}
          />
        ) : isHorizontal ? (
          <FlashList
            data={section.items}
            keyExtractor={(item) => item.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.horizontalListContent}
            renderItem={renderItem}
          />
        ) : (
          <FlashList
            data={section.items}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            renderItem={renderItem}
            ItemSeparatorComponent={() => <View style={{ height: Space.sm }} />}
          />
        )}
      </View>
    );
  };

  const renderHeader = () => (
    <View>
      <View style={styles.searchWrap}>
        <AppInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search auctions..."
          prefix={<Ionicons name="search-outline" size={16} color={Colors.textMuted} />}
          accessibilityLabel="Search auctions"
          returnKeyType="search"
          onSubmitEditing={() => void fetchData()}
        />
      </View>

      <View style={styles.quickActionsRow}>
        <AppButton
          title="My Bids"
          icon={<Ionicons name="list-outline" size={14} color={Colors.textSecondary} />}
          variant="secondary"
          size="sm"
          style={styles.quickActionBtn}
          onPress={() => { haptics.tap(); navigation.navigate('MyBids'); }}
          accessibilityLabel="My auction activity"
        />
        <AppButton
          title="Create Auction"
          icon={<Ionicons name="add" size={14} color={Colors.background} />}
          variant="primary"
          size="sm"
          style={styles.quickActionBtn}
          onPress={() => { haptics.tap(); navigation.navigate('CreateAuction'); }}
          accessibilityLabel="Create auction"
        />
      </View>

      {error && (
        <View style={styles.errorBanner}>
          <Ionicons name="cloud-offline-outline" size={16} color={Colors.textMuted} />
          <Meta style={styles.errorText}>{error}</Meta>
        </View>
      )}
    </View>
  );

  const renderLoadingState = () => (
    <View style={styles.loadingWrap}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={styles.loadingCard}>
          <SkeletonLoader width="100%" height={160} borderRadius={12} />
          <View style={{ padding: 12 }}>
            <SkeletonLoader width="70%" height={16} borderRadius={8} style={{ marginBottom: 8 }} />
            <SkeletonLoader width="40%" height={12} borderRadius={6} />
          </View>
        </View>
      ))}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <FlashList
        data={sections}
        keyExtractor={(item) => item.kind}
        renderItem={({ item }) => renderSection(item)}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={
          loading ? renderLoadingState() : (
            <EmptyState
              icon="hammer-outline"
              title="No auctions yet"
              subtitle="Check back later for live auctions."
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  contentContainer: {
    paddingBottom: Space.xl,
  },
  searchWrap: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    marginBottom: Space.sm,
  },
  quickActionsRow: {
    flexDirection: 'row',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    marginBottom: Space.md,
  },
  quickActionBtn: {
    flex: 1,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceAlt,
  },
  errorText: {
    color: Colors.textMuted,
  },
  sectionWrap: {
    marginBottom: Space.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    marginBottom: Space.sm,
  },
  sectionTitle: {
    fontSize: 16,
  },
  sectionAction: {
    color: Colors.brand,
  },
  horizontalListContent: {
    paddingHorizontal: Space.md,
    gap: Space.sm,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    width: 260,
  },
  cardImageWrap: {
    position: 'relative',
  },
  cardImageContainer: {
    width: '100%',
    height: 140,
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  cardImagePlaceholder: {
    width: '100%',
    height: 140,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  livePill: {
    position: 'absolute',
    top: Space.xs,
    left: Space.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: Radius.full,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#ff4444',
  },
  livePillText: {
    color: '#fff',
    fontSize: 9,
  },
  viewerBadge: {
    position: 'absolute',
    top: Space.xs,
    right: Space.xs,
    borderRadius: Radius.full,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  viewerBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
  },
  cardBody: {
    padding: Space.sm,
  },
  cardTitle: {
    fontSize: 13,
    marginBottom: 2,
  },
  cardSeller: {
    color: Colors.textMuted,
    marginBottom: Space.sm,
  },
  cardStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  cardStat: {},
  cardStatLabel: {
    color: Colors.textMuted,
    marginBottom: 2,
  },
  cardStatValue: {
    fontSize: 14,
    color: Colors.brand,
  },
  cardTimer: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'right',
  },
  attentionCard: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    marginHorizontal: Space.md,
  },
  attentionImageWrap: {
    position: 'relative',
  },
  attentionImageContainer: {
    width: 100,
    height: 100,
  },
  attentionImage: {
    width: 100,
    height: 100,
  },
  attentionImagePlaceholder: {
    width: 100,
    height: 100,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attentionBody: {
    flex: 1,
    padding: Space.sm,
    justifyContent: 'space-between',
  },
  attentionTitle: {
    fontSize: 14,
    marginBottom: 2,
  },
  attentionReason: {
    color: Colors.textSecondary,
    marginBottom: Space.sm,
  },
  attentionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  attentionBid: {
    fontSize: 15,
    color: Colors.brand,
  },
  loadingWrap: {
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
  },
  loadingCard: {
    marginBottom: Space.sm,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  loadMoreWrap: {
    alignItems: 'center',
    paddingVertical: Space.md,
  },
  loadMoreBtn: {
    minWidth: 140,
  },
});
