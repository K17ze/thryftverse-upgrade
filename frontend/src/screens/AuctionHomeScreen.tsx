import React, { memo, useCallback, useMemo, useRef } from 'react';
import {
  View,
  StyleSheet,
  RefreshControl,
  Pressable,
  StatusBar,
  Text,
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
import { useBucketedServerClock, resolveAuctionTiming } from '../hooks/useServerClock';
import {
  isAttentionItem,
  isEndingSoon,
  buildCanonicalMap,
  resolvePriceLabel,
  resolvePriceText,
  resolveTimeLabel,
  resolveUrgency,
  resolveViewerStatePresentation,
  formatFinalMinutesCountdown,
  getSellerInitials,
  buildAuctionAccessibilityLabel,
  selectFirstServerTime,
  isAllRejected,
  fulfilledCount,
  makeSectionLoadState,
  createSearchState,
  IDLE_SEARCH_STATE,
  type AuctionHomeItem,
  type PriceLabel,
  type UrgencyLevel,
  type SectionLoadState,
  type AuctionSearchState,
  type SearchStatus,
} from '../utils/auctionHomeLogic';
import { useAppTheme } from '../theme/ThemeContext';
import { CachedImage } from '../components/CachedImage';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { EmptyState } from '../components/EmptyState';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { Meta, Body, BodyEmphasis } from '../components/ui/Text';
import { AppInput } from '../components/ui/AppInput';
import { Space, Radius } from '../theme/designTokens';
import {
  listAuctions,
  getWatchlist,
  type MarketAuction,
} from '../services/marketApi';

type NavT = StackNavigationProp<RootStackParamList>;

type SectionKind =
  | 'attention'
  | 'endingSoon'
  | 'live'
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
    sellerAvatarUrl: api.seller.avatarUrl,
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
    winnerBidderId: api.winnerBidderId ?? null,
    cancelledAt: api.cancelledAt ?? null,
    settledAt: api.settledAt ?? null,
    lifecycle: api.lifecycle,
    terminalReason: api.terminalReason,
  };
}

type FormatFromFiat = (amount: number, currency?: SupportedCurrencyCode, opts?: { displayMode?: CurrencyDisplayMode }) => string;

// ── Color resolver for viewer state ──
function getColorForKey(key: 'danger' | 'brand' | 'success' | 'textSecondary' | 'textMuted'): string {
  switch (key) {
    case 'danger': return Colors.danger;
    case 'brand': return Colors.brand;
    case 'success': return Colors.success;
    case 'textSecondary': return Colors.textSecondary;
    case 'textMuted': return Colors.textMuted;
  }
}

// ── Seller identity component ──
const SellerIdentity = memo(function SellerIdentity({ item, size }: { item: AuctionHomeItem; size: number }) {
  if (item.sellerAvatarUrl) {
    return (
      <CachedImage
        uri={item.sellerAvatarUrl}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        containerStyle={{ width: size, height: size, borderRadius: size / 2 }}
        contentFit="cover"
      />
    );
  }
  return (
    <View style={[styles.sellerInitials, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.sellerInitialsText, { fontSize: size * 0.4 }]}>
        {getSellerInitials(item.sellerDisplayName, item.sellerUsername)}
      </Text>
    </View>
  );
});

// ── Viewer state badge ──
function ViewerStateBadge({ item, style }: { item: AuctionHomeItem; style?: object }) {
  const presentation = resolveViewerStatePresentation(item.viewerState);
  if (!presentation) return null;
  const color = getColorForKey(presentation.colorKey);
  return (
    <View style={[styles.viewerBadge, { backgroundColor: color + 'E6' }, style]}>
      <Ionicons name={presentation.icon as any} size={8} color={Colors.textInverse} />
      <Text style={styles.viewerBadgeText}>{presentation.text}</Text>
    </View>
  );
}

// ── Live pill ──
function LivePill() {
  return (
    <View style={styles.livePill}>
      <View style={[styles.liveDot, { backgroundColor: Colors.danger }]} />
      <Text style={styles.livePillText}>Live</Text>
    </View>
  );
}

// ── PASS 3.1: AuctionAttentionCard — prominent full-width row ──
const AuctionAttentionCard = memo(function AuctionAttentionCard({
  item,
  clockMs,
  onPress,
  formatFromFiat,
}: {
  item: AuctionHomeItem;
  clockMs: number;
  onPress: () => void;
  formatFromFiat: FormatFromFiat;
}) {
  const timing = resolveAuctionTiming(item, clockMs);
  const priceLabel = resolvePriceLabel(item, timing);
  const priceText = resolvePriceText(item, timing, priceLabel, formatFromFiat);
  const timeLabel = resolveTimeLabel(timing);
  const ctaText = item.viewerState === 'outbid' ? 'Bid again' : item.viewerState === 'won' ? 'View result' : 'View';
  const a11yLabel = buildAuctionAccessibilityLabel(item, timing, priceLabel, priceText);

  return (
    <AnimatedPressable
      style={styles.attentionCard}
      onPress={onPress}
      activeOpacity={0.92}
      scaleValue={0.985}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityHint="Opens auction details"
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
        <ViewerStateBadge item={item} style={styles.attentionViewerBadge} />
      </View>
      <View style={styles.attentionBody}>
        <BodyEmphasis style={styles.attentionTitle} numberOfLines={1}>{item.title}</BodyEmphasis>
        <Meta style={styles.attentionReason}>
          {item.viewerState === 'outbid' && 'You have been outbid'}
          {item.viewerState === 'won' && 'You won this auction'}
        </Meta>
        <View style={styles.attentionRow}>
          <View style={styles.attentionPriceCol}>
            <Meta style={styles.attentionPriceLabel}>{priceLabel}</Meta>
            <Body style={styles.attentionBid}>{priceText}</Body>
          </View>
          <View style={styles.attentionCtaWrap}>
            <Text style={styles.attentionCtaLabel}>{ctaText}</Text>
            <Ionicons name="chevron-forward" size={14} color={Colors.brand} />
          </View>
        </View>
      </View>
    </AnimatedPressable>
  );
});

// ── PASS 3.1: AuctionFeedCard — media-led cards for live/ending soon ──
const AuctionFeedCard = memo(function AuctionFeedCard({
  item,
  clockMs,
  onPress,
  formatFromFiat,
}: {
  item: AuctionHomeItem;
  clockMs: number;
  onPress: () => void;
  formatFromFiat: FormatFromFiat;
}) {
  const timing = resolveAuctionTiming(item, clockMs);
  const urgency = resolveUrgency(timing);
  const priceLabel = resolvePriceLabel(item, timing);
  const priceText = resolvePriceText(item, timing, priceLabel, formatFromFiat);

  const timeLabel = urgency === 'finalMinutes'
    ? formatFinalMinutesCountdown(timing.msToEnd)
    : resolveTimeLabel(timing);

  const a11yLabel = buildAuctionAccessibilityLabel(item, timing, priceLabel, priceText);
  const sellerLabel = item.sellerDisplayName ?? `@${item.sellerUsername}`;

  return (
    <AnimatedPressable
      style={styles.feedCard}
      onPress={onPress}
      activeOpacity={0.92}
      scaleValue={0.985}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityHint="Opens auction details"
    >
      <View style={styles.feedCardImageWrap}>
        {item.imageUrl ? (
          <CachedImage
            uri={item.imageUrl}
            style={styles.feedCardImage}
            containerStyle={styles.feedCardImageContainer}
            contentFit="cover"
          />
        ) : (
          <View style={styles.feedCardImagePlaceholder}>
            <Ionicons name="image-outline" size={24} color={Colors.textMuted} />
          </View>
        )}
        {timing.effectiveState === 'live' && <LivePill />}
        <ViewerStateBadge item={item} />
        {urgency === 'finalMinutes' && (
          <View style={styles.finalMinutesPill}>
            <Text style={styles.finalMinutesText}>{timeLabel}</Text>
          </View>
        )}
      </View>
      <View style={styles.feedCardBody}>
        <BodyEmphasis style={styles.feedCardTitle} numberOfLines={1}>{item.title}</BodyEmphasis>
        <View style={styles.feedCardSellerRow}>
          <SellerIdentity item={item} size={16} />
          <Meta style={styles.feedCardSeller} numberOfLines={1}>{sellerLabel}</Meta>
        </View>
        <View style={styles.feedCardStatsRow}>
          <View style={styles.feedCardStat}>
            <Meta style={styles.feedCardStatLabel}>{priceLabel}</Meta>
            <Body style={styles.feedCardStatValue}>{priceText}</Body>
          </View>
          <View style={styles.feedCardStatRight}>
            <Meta style={styles.feedCardBidCount}>{item.bidCount > 0 ? `${item.bidCount} bids` : 'No bids'}</Meta>
            {urgency !== 'finalMinutes' && (
              <Body style={[
                styles.feedCardTimer,
                urgency === 'endingSoon' && { color: Colors.danger },
              ]}>{timeLabel}</Body>
            )}
          </View>
        </View>
      </View>
    </AnimatedPressable>
  );
});

// ── PASS 3.1: AuctionCompactCard — horizontal cards for upcoming/watching ──
const AuctionCompactCard = memo(function AuctionCompactCard({
  item,
  clockMs,
  onPress,
  formatFromFiat,
}: {
  item: AuctionHomeItem;
  clockMs: number;
  onPress: () => void;
  formatFromFiat: FormatFromFiat;
}) {
  const timing = resolveAuctionTiming(item, clockMs);
  const priceLabel = resolvePriceLabel(item, timing);
  const priceText = resolvePriceText(item, timing, priceLabel, formatFromFiat);
  const timeLabel = resolveTimeLabel(timing);
  const a11yLabel = buildAuctionAccessibilityLabel(item, timing, priceLabel, priceText);

  return (
    <AnimatedPressable
      style={styles.compactCard}
      onPress={onPress}
      activeOpacity={0.92}
      scaleValue={0.985}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityHint="Opens auction details"
    >
      <View style={styles.compactCardImageWrap}>
        {item.imageUrl ? (
          <CachedImage
            uri={item.imageUrl}
            style={styles.compactCardImage}
            containerStyle={styles.compactCardImageContainer}
            contentFit="cover"
          />
        ) : (
          <View style={styles.compactCardImagePlaceholder}>
            <Ionicons name="image-outline" size={20} color={Colors.textMuted} />
          </View>
        )}
        {timing.effectiveState === 'live' && <LivePill />}
        <ViewerStateBadge item={item} style={styles.compactViewerBadge} />
      </View>
      <View style={styles.compactCardBody}>
        <BodyEmphasis style={styles.compactCardTitle} numberOfLines={1}>{item.title}</BodyEmphasis>
        <Meta style={styles.compactCardPriceLabel}>{priceLabel}</Meta>
        <Body style={styles.compactCardPrice}>{priceText}</Body>
        <Meta style={styles.compactCardTime}>{timeLabel}</Meta>
      </View>
    </AnimatedPressable>
  );
});

// ── PASS 3.1: AuctionEndedCard — restrained result rows for recently ended ──
const AuctionEndedCard = memo(function AuctionEndedCard({
  item,
  clockMs,
  onPress,
  formatFromFiat,
}: {
  item: AuctionHomeItem;
  clockMs: number;
  onPress: () => void;
  formatFromFiat: FormatFromFiat;
}) {
  const timing = resolveAuctionTiming(item, clockMs);
  const priceLabel = resolvePriceLabel(item, timing);
  const priceText = resolvePriceText(item, timing, priceLabel, formatFromFiat);
  const a11yLabel = buildAuctionAccessibilityLabel(item, timing, priceLabel, priceText);

  return (
    <AnimatedPressable
      style={styles.endedCard}
      onPress={onPress}
      activeOpacity={0.92}
      scaleValue={0.985}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityHint="Opens auction details"
    >
      <View style={styles.endedCardImageWrap}>
        {item.imageUrl ? (
          <CachedImage
            uri={item.imageUrl}
            style={styles.endedCardImage}
            containerStyle={styles.endedCardImageContainer}
            contentFit="cover"
          />
        ) : (
          <View style={styles.endedCardImagePlaceholder}>
            <Ionicons name="image-outline" size={20} color={Colors.textMuted} />
          </View>
        )}
        <ViewerStateBadge item={item} style={styles.endedViewerBadge} />
      </View>
      <View style={styles.endedCardBody}>
        <BodyEmphasis style={styles.endedCardTitle} numberOfLines={1}>{item.title}</BodyEmphasis>
        <View style={styles.endedCardStatsRow}>
          <View>
            <Meta style={styles.endedCardPriceLabel}>{priceLabel}</Meta>
            <Body style={styles.endedCardPrice}>{priceText}</Body>
          </View>
          <View style={styles.endedCardRightCol}>
            <Meta style={styles.endedCardBidCount}>{item.bidCount > 0 ? `${item.bidCount} bids` : 'No bids'}</Meta>
            <Body style={styles.endedCardStatus}>{resolveTimeLabel(timing)}</Body>
          </View>
        </View>
      </View>
    </AnimatedPressable>
  );
});

// ── Section header ──
const SectionHeader = memo(function SectionHeader({ title }: { title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <BodyEmphasis style={styles.sectionTitle}>{title}</BodyEmphasis>
    </View>
  );
});

// ── Section data ──
interface SectionData {
  live: AuctionHomeItem[];
  upcoming: AuctionHomeItem[];
  ended: AuctionHomeItem[];
  seller: AuctionHomeItem[];
  watchlist: AuctionHomeItem[];
  serverNow: string | null;
  sectionErrors: Partial<Record<SectionKind, boolean>>;
  sectionStates: Partial<Record<SectionKind, SectionLoadState>>;
}

const EMPTY_SECTION_DATA: SectionData = {
  live: [],
  upcoming: [],
  ended: [],
  seller: [],
  watchlist: [],
  serverNow: null,
  sectionErrors: {},
  sectionStates: {},
};

// ── Main screen ──
export default function AuctionHomeScreen() {
  const navigation = useNavigation<NavT>();
  const { formatFromFiat } = useFormattedPrice();
  const { isDark } = useAppTheme();

  const [sectionData, setSectionData] = React.useState<SectionData>(EMPTY_SECTION_DATA);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [searchState, setSearchState] = React.useState<AuctionSearchState>(IDLE_SEARCH_STATE);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [debouncedQuery, setDebouncedQuery] = React.useState('');
  const [isLoadingMoreSearch, setIsLoadingMoreSearch] = React.useState(false);
  const [paginationError, setPaginationError] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const { secondClock, minuteClock, resync, needsResync, resyncFailed, markResyncFailed, clearResyncFailed } = useBucketedServerClock(sectionData.serverNow);

  const requestIdRef = React.useRef(0);

  const fetchSections = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    const reqId = ++requestIdRef.current;
    try {
      const results = await Promise.allSettled([
        listAuctions({ status: 'live', sort: 'endingSoon', limit: 30 }),
        listAuctions({ status: 'scheduled', sort: 'newest', limit: 20 }),
        listAuctions({ status: 'ended', sort: 'newest', limit: 20 }),
        listAuctions({ seller: 'me', sort: 'endingSoon', limit: 20 }),
        getWatchlist(),
      ]);

      if (reqId !== requestIdRef.current) return;

      const [liveRes, upcomingRes, endedRes, sellerRes, watchlistRes] = results;
      const sectionErrors: Partial<Record<SectionKind, boolean>> = {};
      const sectionStates: Partial<Record<SectionKind, SectionLoadState>> = {};

      const live = liveRes.status === 'fulfilled' ? liveRes.value.items.map(toViewModel) : [];
      if (liveRes.status === 'rejected') { sectionErrors.live = true; sectionStates.live = makeSectionLoadState([], true); }
      else { sectionStates.live = makeSectionLoadState(live, false); }

      const upcoming = upcomingRes.status === 'fulfilled' ? upcomingRes.value.items.map(toViewModel) : [];
      if (upcomingRes.status === 'rejected') { sectionErrors.upcoming = true; sectionStates.upcoming = makeSectionLoadState([], true); }
      else { sectionStates.upcoming = makeSectionLoadState(upcoming, false); }

      const ended = endedRes.status === 'fulfilled' ? endedRes.value.items.map(toViewModel) : [];
      if (endedRes.status === 'rejected') { sectionErrors.recentlyEnded = true; sectionStates.recentlyEnded = makeSectionLoadState([], true); }
      else { sectionStates.recentlyEnded = makeSectionLoadState(ended, false); }

      const seller = sellerRes.status === 'fulfilled' ? sellerRes.value.items.map(toViewModel) : [];
      if (sellerRes.status === 'rejected') { sectionErrors.sellerTools = true; sectionStates.sellerTools = makeSectionLoadState([], true); }
      else { sectionStates.sellerTools = makeSectionLoadState(seller, false); }

      const watchlist = watchlistRes.status === 'fulfilled' ? watchlistRes.value.items.map(toViewModel) : [];
      if (watchlistRes.status === 'rejected') { sectionErrors.watchlist = true; sectionStates.watchlist = makeSectionLoadState([], true); }
      else { sectionStates.watchlist = makeSectionLoadState(watchlist, false); }

      // PASS 2: Select first valid serverNow from any fulfilled source
      const serverNow = selectFirstServerTime([
        liveRes.status === 'fulfilled' ? liveRes.value : null,
        upcomingRes.status === 'fulfilled' ? upcomingRes.value : null,
        endedRes.status === 'fulfilled' ? endedRes.value : null,
        sellerRes.status === 'fulfilled' ? sellerRes.value : null,
      ].filter(Boolean) as { serverNow: string | null }[]);

      setSectionData({ live, upcoming, ended, seller, watchlist, serverNow, sectionErrors, sectionStates });

      if (serverNow) {
        resync(serverNow);
        clearResyncFailed();
      } else if (isAllRejected(results)) {
        // PASS 2: Only show global error when ALL requests failed
        setError('Unable to load auctions');
        markResyncFailed();
      } else if (fulfilledCount(results) > 0) {
        // Partial success — some sections loaded, serverNow may be null if clock sources failed
        if (!serverNow) {
          markResyncFailed();
        }
      }
    } catch {
      if (reqId === requestIdRef.current) {
        setError('Unable to load auctions');
        markResyncFailed();
      }
    } finally {
      if (reqId === requestIdRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [resync, clearResyncFailed, markResyncFailed]);

  React.useEffect(() => {
    void fetchSections();
  }, [fetchSections]);

  // ── PASS 1: needsResync triggers refetch; cleared on success or marked failed ──
  React.useEffect(() => {
    if (needsResync) {
      void fetchSections();
    }
  }, [needsResync, fetchSections]);

  // ── PASS 4: Search state with generation token ──
  const searchReqIdRef = useRef(0);

  const handleRefresh = React.useCallback(() => {
    setRefreshing(true);
    if (searchState.status !== 'idle' && debouncedQuery.trim().length > 0) {
      setPaginationError(null);
      const reqId = ++searchReqIdRef.current;
      setSearchState(createSearchState(debouncedQuery, 'loading'));
      listAuctions({ query: debouncedQuery, status: 'all', sort: 'endingSoon', limit: 30 })
        .then((result) => {
          if (reqId !== searchReqIdRef.current) return;
          const items = result.items.map(toViewModel);
          setSearchState(createSearchState(debouncedQuery, items.length > 0 ? 'ready' : 'empty', items, result.nextCursor));
        })
        .catch(() => {
          if (reqId !== searchReqIdRef.current) return;
          setSearchState(createSearchState(debouncedQuery, 'error'));
        })
        .finally(() => {
          if (reqId === searchReqIdRef.current) {
            setRefreshing(false);
          }
        });
    } else {
      void fetchSections();
    }
  }, [fetchSections, searchState, debouncedQuery]);

  // PASS 4: Clear stale results immediately on query change
  const handleSearchChange = useCallback((text: string) => {
    searchReqIdRef.current++;
    setSearchQuery(text);
    setDebouncedQuery(text);
    if (text.trim().length === 0) {
      setSearchState(IDLE_SEARCH_STATE);
    } else {
      // Clear previous results — no stale-result flash
      setSearchState(createSearchState(text, 'loading'));
    }
    setPaginationError(null);
  }, []);

  const handleClearSearch = useCallback(() => {
    searchReqIdRef.current++;
    setSearchQuery('');
    setDebouncedQuery('');
    setSearchState(IDLE_SEARCH_STATE);
    setPaginationError(null);
  }, []);

  React.useEffect(() => {
    if (debouncedQuery.trim().length === 0) {
      setSearchState(IDLE_SEARCH_STATE);
      return;
    }
    const timer = setTimeout(() => {
      const reqId = ++searchReqIdRef.current;
      setSearchState(createSearchState(debouncedQuery, 'loading'));
      listAuctions({ query: debouncedQuery, status: 'all', sort: 'endingSoon', limit: 30 })
        .then((result) => {
          if (reqId !== searchReqIdRef.current) return;
          const items = result.items.map(toViewModel);
          setSearchState(createSearchState(debouncedQuery, items.length > 0 ? 'ready' : 'empty', items, result.nextCursor));
        })
        .catch(() => {
          if (reqId !== searchReqIdRef.current) return;
          setSearchState(createSearchState(debouncedQuery, 'error'));
        });
    }, 400);
    return () => clearTimeout(timer);
  }, [debouncedQuery]);

  // Cleanup on unmount — invalidate any in-flight search
  React.useEffect(() => {
    return () => { searchReqIdRef.current++; };
  }, []);

  const loadMoreSearch = React.useCallback(async () => {
    if (!searchState.cursor || isLoadingMoreSearch) return;
    setIsLoadingMoreSearch(true);
    setPaginationError(null);
    const reqId = ++searchReqIdRef.current;
    try {
      const result = await listAuctions({ query: debouncedQuery, status: 'all', sort: 'endingSoon', cursor: searchState.cursor, limit: 30 });
      if (reqId !== searchReqIdRef.current) return;
      setSearchState((prev) => {
        const existingIds = new Set(prev.items.map((a) => a.id));
        const newItems = result.items.map(toViewModel).filter((a) => !existingIds.has(a.id));
        return { ...prev, items: [...prev.items, ...newItems], cursor: result.nextCursor };
      });
    } catch {
      if (reqId === searchReqIdRef.current) {
        setPaginationError('Failed to load more results');
      }
    } finally {
      if (reqId === searchReqIdRef.current) {
        setIsLoadingMoreSearch(false);
      }
    }
  }, [searchState.cursor, isLoadingMoreSearch, debouncedQuery]);

  // ── PASS 3.0C: Deduplicate before attention filtering ──
  const sections = useMemo(() => {
    if (searchState.status !== 'idle') return [];

    // Build canonical unique map before any section computation
    const canonicalMap = buildCanonicalMap([
      sectionData.live,
      sectionData.upcoming,
      sectionData.ended,
      sectionData.seller,
      sectionData.watchlist,
    ]);

    const usedIds = new Set<string>();
    const result: Section[] = [];

    // 1a. You're leading — live auctions where viewer is leading
    const leadingItems: AuctionHomeItem[] = [];
    for (const item of canonicalMap.values()) {
      const timing = resolveAuctionTiming(item, minuteClock);
      if (timing.effectiveState === 'live' && item.viewerState === 'leading') {
        leadingItems.push(item);
        usedIds.add(item.id);
      }
    }
    if (leadingItems.length > 0) {
      result.push({ kind: 'attention', title: "You're leading", items: leadingItems });
    }

    // 1b. You've been outbid — live auctions where viewer is outbid
    const outbidItems: AuctionHomeItem[] = [];
    for (const item of canonicalMap.values()) {
      if (usedIds.has(item.id)) continue;
      const timing = resolveAuctionTiming(item, minuteClock);
      if (timing.effectiveState === 'live' && item.viewerState === 'outbid') {
        outbidItems.push(item);
        usedIds.add(item.id);
      }
    }
    if (outbidItems.length > 0) {
      result.push({ kind: 'attention', title: "You've been outbid", items: outbidItems });
    }

    // 1c. You won — ended auctions where viewer won (needs attention for payment)
    const wonItems: AuctionHomeItem[] = [];
    for (const item of canonicalMap.values()) {
      if (usedIds.has(item.id)) continue;
      const timing = resolveAuctionTiming(item, minuteClock);
      if (timing.effectiveState === 'ended' && item.viewerState === 'won') {
        wonItems.push(item);
        usedIds.add(item.id);
      }
    }
    if (wonItems.length > 0) {
      result.push({ kind: 'attention', title: 'You won', items: wonItems });
    }

    // 2. Ending soon
    const endingSoonItems = sectionData.live.filter((item) => {
      if (usedIds.has(item.id)) return false;
      return isEndingSoon(item, minuteClock);
    });
    if (endingSoonItems.length > 0) {
      endingSoonItems.forEach((a) => usedIds.add(a.id));
      result.push({ kind: 'endingSoon', title: 'Ending soon', items: endingSoonItems });
    }

    // 3. Live now
    const liveItems = sectionData.live.filter((item) => {
      if (usedIds.has(item.id)) return false;
      const timing = resolveAuctionTiming(item, minuteClock);
      return timing.effectiveState === 'live' && !isEndingSoon(item, minuteClock);
    });
    if (liveItems.length > 0) {
      liveItems.forEach((a) => usedIds.add(a.id));
      result.push({ kind: 'live', title: 'Live now', items: liveItems });
    }

    // 4. Upcoming
    const upcomingItems = sectionData.upcoming.filter((item) => {
      if (usedIds.has(item.id)) return false;
      const timing = resolveAuctionTiming(item, minuteClock);
      return timing.effectiveState === 'upcoming';
    });
    if (upcomingItems.length > 0) {
      upcomingItems.forEach((a) => usedIds.add(a.id));
      result.push({ kind: 'upcoming', title: 'Starting soon', items: upcomingItems });
    }

    // 5. Watchlist
    const watchlistItems = sectionData.watchlist.filter((item) => {
      if (usedIds.has(item.id)) return false;
      const timing = resolveAuctionTiming(item, minuteClock);
      return timing.effectiveState === 'live' || timing.effectiveState === 'upcoming';
    });
    if (watchlistItems.length > 0) {
      watchlistItems.forEach((a) => usedIds.add(a.id));
      result.push({ kind: 'watchlist', title: 'Watching', items: watchlistItems });
    }

    // 6. Recently ended
    const endedItems = sectionData.ended.filter((item) => {
      if (usedIds.has(item.id)) return false;
      const timing = resolveAuctionTiming(item, minuteClock);
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
  }, [sectionData, minuteClock, searchState.status]);

  const navigateToDetail = useCallback((auctionId: string) => {
    navigation.navigate('AuctionDetail', { auctionId });
  }, [navigation]);

  const handleBack = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('MainTabs');
    }
  }, [navigation]);

  // ── Render dispatchers ──
  // PASS 5: Attention and feed cards may show final-minute countdowns → secondClock
  // Compact and ended cards never need second precision → minuteClock
  const renderAttentionItem = useCallback(({ item }: { item: AuctionHomeItem }) => (
    <AuctionAttentionCard
      item={item}
      clockMs={secondClock}
      onPress={() => navigateToDetail(item.id)}
      formatFromFiat={formatFromFiat}
    />
  ), [secondClock, navigateToDetail, formatFromFiat]);

  const renderFeedItem = useCallback(({ item }: { item: AuctionHomeItem }) => (
    <AuctionFeedCard
      item={item}
      clockMs={secondClock}
      onPress={() => navigateToDetail(item.id)}
      formatFromFiat={formatFromFiat}
    />
  ), [secondClock, navigateToDetail, formatFromFiat]);

  const renderCompactItem = useCallback(({ item }: { item: AuctionHomeItem }) => (
    <AuctionCompactCard
      item={item}
      clockMs={minuteClock}
      onPress={() => navigateToDetail(item.id)}
      formatFromFiat={formatFromFiat}
    />
  ), [minuteClock, navigateToDetail, formatFromFiat]);

  const renderEndedItem = useCallback(({ item }: { item: AuctionHomeItem }) => (
    <AuctionEndedCard
      item={item}
      clockMs={minuteClock}
      onPress={() => navigateToDetail(item.id)}
      formatFromFiat={formatFromFiat}
    />
  ), [minuteClock, navigateToDetail, formatFromFiat]);

  const renderSection = useCallback((section: Section) => {
    const isHorizontal = section.kind === 'upcoming' || section.kind === 'watchlist';
    const sectionState = sectionData.sectionStates[section.kind];

    // PASS 3: If section errored, render error+retry even with no items
    if (section.items.length === 0) {
      if (sectionState?.status === 'error') {
        return (
          <View key={section.kind} style={styles.sectionWrap}>
            <SectionHeader title={section.title} />
            <View style={styles.sectionErrorCard}>
              <Meta style={styles.sectionErrorText}>{section.title} is unavailable</Meta>
              <Pressable
                onPress={() => void fetchSections()}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Retry ${section.title}`}
              >
                <Text style={styles.retryBtn}>Retry</Text>
              </Pressable>
            </View>
          </View>
        );
      }
      return null;
    }

    let renderItem: (props: { item: AuctionHomeItem }) => React.ReactElement;
    if (section.kind === 'attention') renderItem = renderAttentionItem;
    else if (section.kind === 'recentlyEnded') renderItem = renderEndedItem;
    else if (isHorizontal) renderItem = renderCompactItem;
    else renderItem = renderFeedItem;

    return (
      <View key={section.kind} style={styles.sectionWrap}>
        <SectionHeader title={section.title} />
        {isHorizontal ? (
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
  }, [renderAttentionItem, renderFeedItem, renderCompactItem, renderEndedItem, sectionData.sectionStates, fetchSections]);

  const renderHeader = useCallback(() => (
    <View>
      <View style={styles.searchWrap}>
        <AppInput
          value={searchQuery}
          onChangeText={handleSearchChange}
          placeholder="Search auctions..."
          prefix={<Ionicons name="search-outline" size={16} color={Colors.textMuted} />}
          accessibilityLabel="Search auctions"
          returnKeyType="search"
          onSubmitEditing={() => setDebouncedQuery(searchQuery)}
        />
        {searchQuery.length > 0 && (
          <Pressable
            style={styles.clearSearchBtn}
            onPress={handleClearSearch}
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

      {resyncFailed && !error && (
        <View style={styles.errorBanner}>
          <Ionicons name="sync-outline" size={16} color={Colors.textMuted} />
          <Meta style={styles.errorText}>Clock sync failed — pull to refresh</Meta>
        </View>
      )}
    </View>
  ), [searchQuery, handleSearchChange, handleClearSearch, error, resyncFailed]);

  const renderLoadingState = useCallback(() => (
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
  ), []);

  const isSearching = searchState.status !== 'idle';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* PASS 3.0E: Use theme for StatusBar */}
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={Colors.background}
      />

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
          onPress={() => navigation.navigate('MyBids')}
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
          data={searchState.items}
          keyExtractor={(item) => item.id}
          renderItem={renderFeedItem}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={
            searchState.status === 'loading' ? renderLoadingState() : (
              <EmptyState
                icon="search-outline"
                title={searchState.status === 'error' ? 'Search failed' : 'No results'}
                subtitle={searchState.status === 'error' ? 'Pull to refresh and try again.' : `No auctions match "${searchQuery}"`}
              />
            )
          }
          ListFooterComponent={
            searchState.cursor ? (
              <View style={styles.loadMoreWrap}>
                {paginationError && (
                  <Meta style={styles.paginationErrorText}>{paginationError}</Meta>
                )}
                <Text
                  style={styles.loadMoreBtn}
                  onPress={() => void loadMoreSearch()}
                  accessibilityRole="button"
                  accessibilityLabel={isLoadingMoreSearch ? 'Loading more results' : 'Load more results'}
                >
                  {isLoadingMoreSearch ? 'Loading...' : 'Load More'}
                </Text>
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
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.3,
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
  sectionErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Space.md,
    paddingTop: Space.xs,
  },
  sectionErrorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    marginHorizontal: Space.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceAlt,
  },
  retryBtn: {
    fontSize: 13,
    color: Colors.brand,
    fontWeight: '600',
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  sectionErrorText: {
    color: Colors.textMuted,
    fontSize: 11,
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
    fontSize: 17,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.2,
  },
  horizontalListContent: {
    paddingHorizontal: Space.md,
    gap: Space.sm,
  },
  // ── Seller identity ──
  sellerInitials: {
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sellerInitialsText: {
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  // ── Viewer state badge ──
  viewerBadge: {
    position: 'absolute',
    top: Space.xs,
    right: Space.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: Radius.full,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  viewerBadgeText: {
    color: Colors.textInverse,
    fontSize: 9,
    fontWeight: '700',
  },
  // ── Live pill ──
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
  },
  livePillText: {
    color: '#fff',
    fontSize: 9,
  },
  // ── Attention card ──
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
  attentionViewerBadge: {
    top: 4,
    left: 4,
    right: 'auto',
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
  attentionPriceCol: {},
  attentionPriceLabel: {
    color: Colors.textMuted,
    marginBottom: 2,
  },
  attentionBid: {
    fontSize: 15,
    color: Colors.brand,
  },
  attentionCtaWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  attentionCtaLabel: {
    fontSize: 13,
    color: Colors.brand,
    fontWeight: '600',
  },
  // ── Feed card (live, ending soon) ──
  feedCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    width: 260,
  },
  feedCardImageWrap: {
    position: 'relative',
  },
  feedCardImageContainer: {
    width: '100%',
    height: 180,
  },
  feedCardImage: {
    width: '100%',
    height: '100%',
  },
  feedCardImagePlaceholder: {
    width: '100%',
    height: 180,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  finalMinutesPill: {
    position: 'absolute',
    bottom: Space.xs,
    left: Space.xs,
    backgroundColor: Colors.danger,
    borderRadius: Radius.full,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  finalMinutesText: {
    color: Colors.textInverse,
    fontSize: 10,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  feedCardBody: {
    padding: Space.sm,
  },
  feedCardTitle: {
    fontSize: 13,
    marginBottom: 4,
  },
  feedCardSellerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: Space.sm,
  },
  feedCardSeller: {
    color: Colors.textMuted,
    flex: 1,
  },
  feedCardStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  feedCardStat: {},
  feedCardStatLabel: {
    color: Colors.textMuted,
    marginBottom: 2,
  },
  feedCardStatValue: {
    fontSize: 14,
    color: Colors.brand,
  },
  feedCardStatRight: {
    alignItems: 'flex-end',
  },
  feedCardBidCount: {
    color: Colors.textMuted,
    marginBottom: 2,
  },
  feedCardTimer: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'right',
  },
  // ── Compact card (upcoming, watching) ──
  compactCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    width: 180,
  },
  compactCardImageWrap: {
    position: 'relative',
  },
  compactCardImageContainer: {
    width: '100%',
    height: 120,
  },
  compactCardImage: {
    width: '100%',
    height: '100%',
  },
  compactCardImagePlaceholder: {
    width: '100%',
    height: 120,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactViewerBadge: {
    top: 4,
    left: 4,
    right: 'auto',
  },
  compactCardBody: {
    padding: Space.xs + 2,
  },
  compactCardTitle: {
    fontSize: 12,
    marginBottom: 4,
  },
  compactCardPriceLabel: {
    color: Colors.textMuted,
    marginBottom: 1,
  },
  compactCardPrice: {
    fontSize: 13,
    color: Colors.brand,
    marginBottom: 4,
  },
  compactCardTime: {
    color: Colors.textSecondary,
  },
  // ── Ended card ──
  endedCard: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    marginHorizontal: Space.md,
  },
  endedCardImageWrap: {
    position: 'relative',
  },
  endedCardImageContainer: {
    width: 72,
    height: 72,
  },
  endedCardImage: {
    width: 72,
    height: 72,
  },
  endedCardImagePlaceholder: {
    width: 72,
    height: 72,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  endedViewerBadge: {
    top: 4,
    left: 4,
    right: 'auto',
  },
  endedCardBody: {
    flex: 1,
    padding: Space.sm,
    justifyContent: 'center',
  },
  endedCardTitle: {
    fontSize: 13,
    marginBottom: 4,
  },
  endedCardStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  endedCardPriceLabel: {
    color: Colors.textMuted,
    marginBottom: 1,
  },
  endedCardPrice: {
    fontSize: 13,
    color: Colors.brand,
  },
  endedCardRightCol: {
    alignItems: 'flex-end',
  },
  endedCardBidCount: {
    color: Colors.textMuted,
    marginBottom: 1,
  },
  endedCardStatus: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  // ── Loading ──
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
  // ── Pagination ──
  loadMoreWrap: {
    alignItems: 'center',
    paddingVertical: Space.md,
    gap: 6,
  },
  loadMoreBtn: {
    fontSize: 14,
    color: Colors.brand,
    fontWeight: '600',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  paginationErrorText: {
    color: Colors.danger,
    fontSize: 12,
  },
});
