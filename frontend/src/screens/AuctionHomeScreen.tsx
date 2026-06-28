import React from 'react';
import {
  View,
  StyleSheet,
  RefreshControl,
  Pressable,
  StatusBar,
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
import { isAttentionItem, isEndingSoon, type AuctionHomeItem } from '../utils/auctionHomeLogic';
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
} from '../services/marketApi';

type NavT = StackNavigationProp<RootStackParamList>;

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
    cancelledAt: api.cancelledAt ?? null,
    settledAt: api.settledAt ?? null,
    winnerBidderId: api.winnerBidderId ?? null,
  };
}

type FormatFromFiat = (amount: number, currency?: SupportedCurrencyCode, opts?: { displayMode?: CurrencyDisplayMode }) => string;

function AuctionHomeCard({
  item,
  nowMs,
  onPress,
  formatFromFiat,
}: {
  item: AuctionHomeItem;
  nowMs: number;
  onPress: () => void;
  formatFromFiat: FormatFromFiat;
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

function SectionHeader({ title }: { title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <BodyEmphasis style={styles.sectionTitle}>{title}</BodyEmphasis>
    </View>
  );
}

function AttentionCard({
  item,
  onPress,
  formatFromFiat,
}: {
  item: AuctionHomeItem;
  onPress: () => void;
  formatFromFiat: FormatFromFiat;
}) {
  const ctaText =
    item.viewerState === 'outbid' ? 'Bid again' :
    item.viewerState === 'won' ? 'View result' :
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

interface SectionData {
  live: AuctionHomeItem[];
  upcoming: AuctionHomeItem[];
  ended: AuctionHomeItem[];
  seller: AuctionHomeItem[];
  watchlist: AuctionHomeItem[];
  serverNow: string | null;
}

const EMPTY_SECTION_DATA: SectionData = {
  live: [],
  upcoming: [],
  ended: [],
  seller: [],
  watchlist: [],
  serverNow: null,
};

export default function AuctionHomeScreen() {
  const navigation = useNavigation<NavT>();
  const { formatFromFiat } = useFormattedPrice();

  const [sectionData, setSectionData] = React.useState<SectionData>(EMPTY_SECTION_DATA);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [debouncedQuery, setDebouncedQuery] = React.useState('');
  const [searchResults, setSearchResults] = React.useState<AuctionHomeItem[] | null>(null);
  const [searchLoading, setSearchLoading] = React.useState(false);
  const [searchError, setSearchError] = React.useState<string | null>(null);
  const [searchCursor, setSearchCursor] = React.useState<string | null>(null);
  const [isLoadingMoreSearch, setIsLoadingMoreSearch] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const { nowMs, resync, needsResync, clearResync } = useServerClockTick(sectionData.serverNow);

  const requestIdRef = React.useRef(0);

  const fetchSections = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    const reqId = ++requestIdRef.current;
    try {
      const [liveResult, upcomingResult, endedResult, sellerResult, watchlistResult] = await Promise.all([
        listAuctions({ status: 'live', sort: 'endingSoon', limit: 30 }),
        listAuctions({ status: 'scheduled', sort: 'newest', limit: 20 }),
        listAuctions({ status: 'ended', sort: 'newest', limit: 20 }),
        listAuctions({ seller: 'me', sort: 'endingSoon', limit: 20 }),
        getWatchlist(),
      ]);

      if (reqId !== requestIdRef.current) return;

      const serverNow = liveResult.serverNow;
      setSectionData({
        live: liveResult.items.map(toViewModel),
        upcoming: upcomingResult.items.map(toViewModel),
        ended: endedResult.items.map(toViewModel),
        seller: sellerResult.items.map(toViewModel),
        watchlist: watchlistResult.items.map(toViewModel),
        serverNow,
      });
      resync(serverNow);
    } catch {
      if (reqId === requestIdRef.current) {
        setError('Unable to load auctions');
      }
    } finally {
      if (reqId === requestIdRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [resync]);

  React.useEffect(() => {
    void fetchSections();
  }, [fetchSections]);

  React.useEffect(() => {
    if (needsResync) {
      clearResync();
      void fetchSections();
    }
  }, [needsResync, clearResync, fetchSections]);

  const handleRefresh = React.useCallback(() => {
    setRefreshing(true);
    void fetchSections();
  }, [fetchSections]);

  const searchReqIdRef = React.useRef(0);

  React.useEffect(() => {
    if (debouncedQuery.trim().length === 0) {
      setSearchResults(null);
      setSearchError(null);
      setSearchCursor(null);
      return;
    }
    const timer = setTimeout(() => {
      const reqId = ++searchReqIdRef.current;
      setSearchLoading(true);
      setSearchError(null);
      listAuctions({ query: debouncedQuery, status: 'all', sort: 'endingSoon', limit: 30 })
        .then((result) => {
          if (reqId !== searchReqIdRef.current) return;
          setSearchResults(result.items.map(toViewModel));
          setSearchCursor(result.nextCursor);
        })
        .catch(() => {
          if (reqId !== searchReqIdRef.current) return;
          setSearchError('Search failed');
          setSearchResults([]);
        })
        .finally(() => {
          if (reqId === searchReqIdRef.current) {
            setSearchLoading(false);
          }
        });
    }, 400);
    return () => clearTimeout(timer);
  }, [debouncedQuery]);

  const loadMoreSearch = React.useCallback(async () => {
    if (!searchCursor || isLoadingMoreSearch) return;
    setIsLoadingMoreSearch(true);
    const reqId = ++searchReqIdRef.current;
    try {
      const result = await listAuctions({ query: debouncedQuery, status: 'all', sort: 'endingSoon', cursor: searchCursor, limit: 30 });
      if (reqId !== searchReqIdRef.current) return;
      setSearchResults((prev) => {
        if (!prev) return prev;
        const existingIds = new Set(prev.map((a) => a.id));
        const newItems = result.items.map(toViewModel).filter((a) => !existingIds.has(a.id));
        return [...prev, ...newItems];
      });
      setSearchCursor(result.nextCursor);
    } catch {
      // Silent fail on pagination
    } finally {
      if (reqId === searchReqIdRef.current) {
        setIsLoadingMoreSearch(false);
      }
    }
  }, [searchCursor, isLoadingMoreSearch, debouncedQuery]);

  const sections = React.useMemo(() => {
    if (searchResults !== null) return [];

    const usedIds = new Set<string>();
    const result: Section[] = [];

    const allItems = [
      ...sectionData.live,
      ...sectionData.upcoming,
      ...sectionData.ended,
      ...sectionData.seller,
      ...sectionData.watchlist,
    ];

    // 1. Needs your attention
    const attentionItems = allItems.filter((item) => {
      if (usedIds.has(item.id)) return false;
      return isAttentionItem(item, nowMs);
    });
    if (attentionItems.length > 0) {
      attentionItems.forEach((a) => usedIds.add(a.id));
      result.push({ kind: 'attention', title: 'Needs your attention', items: attentionItems });
    }

    // 2. Ending soon
    const endingSoonItems = sectionData.live.filter((item) => {
      if (usedIds.has(item.id)) return false;
      return isEndingSoon(item, nowMs);
    });
    if (endingSoonItems.length > 0) {
      endingSoonItems.forEach((a) => usedIds.add(a.id));
      result.push({ kind: 'endingSoon', title: 'Ending soon', items: endingSoonItems });
    }

    // 3. Live now
    const liveItems = sectionData.live.filter((item) => {
      if (usedIds.has(item.id)) return false;
      const timing = resolveAuctionTiming(item, nowMs);
      return timing.effectiveState === 'live' && !isEndingSoon(item, nowMs);
    });
    if (liveItems.length > 0) {
      liveItems.forEach((a) => usedIds.add(a.id));
      result.push({ kind: 'live', title: 'Live now', items: liveItems });
    }

    // 4. Upcoming
    const upcomingItems = sectionData.upcoming.filter((item) => {
      if (usedIds.has(item.id)) return false;
      const timing = resolveAuctionTiming(item, nowMs);
      return timing.effectiveState === 'upcoming';
    });
    if (upcomingItems.length > 0) {
      upcomingItems.forEach((a) => usedIds.add(a.id));
      result.push({ kind: 'upcoming', title: 'Upcoming', items: upcomingItems });
    }

    // 5. Watchlist
    const watchlistItems = sectionData.watchlist.filter((item) => {
      if (usedIds.has(item.id)) return false;
      const timing = resolveAuctionTiming(item, nowMs);
      return timing.effectiveState === 'live' || timing.effectiveState === 'upcoming';
    });
    if (watchlistItems.length > 0) {
      watchlistItems.forEach((a) => usedIds.add(a.id));
      result.push({ kind: 'watchlist', title: 'Watching', items: watchlistItems });
    }

    // 6. Recently ended
    const endedItems = sectionData.ended.filter((item) => {
      if (usedIds.has(item.id)) return false;
      const timing = resolveAuctionTiming(item, nowMs);
      return timing.effectiveState === 'ended';
    });
    if (endedItems.length > 0) {
      endedItems.forEach((a) => usedIds.add(a.id));
      result.push({ kind: 'recentlyEnded', title: 'Recently ended', items: endedItems });
    }

    // 7. Seller tools
    const sellerItems = sectionData.seller.filter((item) => {
      if (usedIds.has(item.id)) return false;
      return item.viewerState === 'seller';
    });
    if (sellerItems.length > 0) {
      sellerItems.forEach((a) => usedIds.add(a.id));
      result.push({ kind: 'sellerTools', title: 'Your auctions', items: sellerItems });
    }

    return result;
  }, [sectionData, nowMs]);

  const navigateToDetail = React.useCallback((auctionId: string) => {
    navigation.navigate('AuctionDetail', { auctionId });
  }, [navigation]);

  const handleBack = React.useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('MainTabs');
    }
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
      onPress={() => navigateToDetail(item.id)}
      formatFromFiat={formatFromFiat}
    />
  );

  const renderSection = (section: Section) => {
    if (section.items.length === 0) return null;

    const isHorizontal = section.kind === 'upcoming' || section.kind === 'watchlist';

    return (
      <View key={section.kind} style={styles.sectionWrap}>
        <SectionHeader title={section.title} />
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
          onChangeText={(text) => {
            setSearchQuery(text);
            setDebouncedQuery(text);
          }}
          placeholder="Search auctions..."
          prefix={<Ionicons name="search-outline" size={16} color={Colors.textMuted} />}
          accessibilityLabel="Search auctions"
          returnKeyType="search"
          onSubmitEditing={() => setDebouncedQuery(searchQuery)}
        />
        {searchQuery.length > 0 && (
          <Pressable
            style={styles.clearSearchBtn}
            onPress={() => { setSearchQuery(''); setDebouncedQuery(''); }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
          >
            <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
          </Pressable>
        )}
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

  const isSearching = searchResults !== null;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />

      <View style={styles.headerBar}>
        <Pressable
          onPress={handleBack}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={styles.headerBackBtn}
        >
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </Pressable>
        <BodyEmphasis style={styles.headerTitle}>Auctions</BodyEmphasis>
        <Pressable
          onPress={() => { haptics.tap(); navigation.navigate('MyBids'); }}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="My auction activity"
          style={styles.headerActionBtn}
        >
          <Ionicons name="list-outline" size={22} color={Colors.textPrimary} />
        </Pressable>
      </View>

      {isSearching ? (
        <FlashList
          data={searchResults}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={
            searchLoading ? renderLoadingState() : (
              <EmptyState
                icon="search-outline"
                title="No results"
                subtitle={searchError ?? `No auctions match "${searchQuery}"`}
              />
            )
          }
          ListFooterComponent={
            searchCursor ? (
              <View style={styles.loadMoreWrap}>
                <AppButton
                  title={isLoadingMoreSearch ? 'Loading...' : 'Load More'}
                  variant="secondary"
                  size="sm"
                  onPress={() => void loadMoreSearch()}
                  disabled={isLoadingMoreSearch}
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
      ) : (
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
      )}
    </SafeAreaView>
  );
}

const HEADER_HEIGHT = 44;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.sm,
    height: HEADER_HEIGHT,
  },
  headerBackBtn: {
    width: HEADER_HEIGHT,
    height: HEADER_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
  },
  headerActionBtn: {
    width: HEADER_HEIGHT,
    height: HEADER_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentContainer: {
    paddingBottom: Space.xl,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    marginBottom: Space.sm,
  },
  clearSearchBtn: {
    position: 'absolute',
    right: Space.md + 8,
    top: Space.sm + 14,
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
