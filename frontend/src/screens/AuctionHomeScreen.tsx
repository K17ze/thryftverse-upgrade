import React, { memo, useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  RefreshControl,
  Pressable,
  StatusBar,
  Text,
  ScrollView,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
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
import { haptics } from '../utils/haptics';
import { AppInput } from '../components/ui/AppInput';
import { Space, Radius, Typography } from '../theme/designTokens';
import { toIze, formatIzeAmount, formatFiatAmount } from '../utils/currency';
import { BottomSheet } from '../components/BottomSheet';
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
    category: api.category,
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

// ── Personal state rail — compact image-led tiles ──
const STATE_RAIL_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  outbid: { label: 'Outbid', icon: 'trending-down-outline', color: Colors.danger },
  leading: { label: 'Leading', icon: 'trending-up-outline', color: Colors.success },
  won: { label: 'Won', icon: 'trophy-outline', color: Colors.brand },
  watching: { label: 'Watching', icon: 'eye-outline', color: Colors.textSecondary },
};

const PersonalStateTile = memo(function PersonalStateTile({
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
  const config = STATE_RAIL_CONFIG[item.viewerState] ?? STATE_RAIL_CONFIG.watching;
  const timing = resolveAuctionTiming(item, clockMs);
  const priceText = resolvePriceText(item, timing, resolvePriceLabel(item, timing), formatFromFiat);

  return (
    <AnimatedPressable
      style={styles.stateTile}
      onPress={onPress}
      activeOpacity={0.9}
      scaleValue={0.97}
      accessibilityRole="button"
      accessibilityLabel={`${config.label}: ${item.title}, ${priceText}`}
      accessibilityHint="Opens auction details"
    >
      <View style={styles.stateTileImageWrap}>
        {item.imageUrl ? (
          <CachedImage
            uri={item.imageUrl}
            style={styles.stateTileImage}
            containerStyle={styles.stateTileImageContainer}
            contentFit="cover"
          />
        ) : (
          <View style={styles.stateTilePlaceholder}>
            <Ionicons name="image-outline" size={20} color={Colors.textMuted} />
          </View>
        )}
        <View style={[styles.stateTileAccent, { backgroundColor: config.color }]} />
      </View>
      <Text style={[styles.stateTileLabel, { color: config.color }]} numberOfLines={1}>
        {config.label}
      </Text>
      <Text style={styles.stateTileTitle} numberOfLines={1}>{item.title}</Text>
      <Text style={styles.stateTilePrice} numberOfLines={1}>{priceText}</Text>
    </AnimatedPressable>
  );
});

// ── PASS 3.1: AuctionAttentionCard — dominant image-led auction stage ──
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
  const urgency = resolveUrgency(timing);
  const presentation = resolveViewerStatePresentation(item.viewerState);
  const stateColor = presentation ? getColorForKey(presentation.colorKey) : Colors.brand;
  const a11yLabel = buildAuctionAccessibilityLabel(item, timing, priceLabel, priceText);

  // Context-aware CTA and state text
  const isOutbid = item.viewerState === 'outbid';
  const isLeading = item.viewerState === 'leading';
  const isWon = item.viewerState === 'won';
  const isWatching = item.viewerState === 'watching';
  const isNeutral = !isOutbid && !isLeading && !isWon && !isWatching;

  const stateText = isOutbid ? "You've been outbid"
    : isLeading ? 'You\u2019re leading'
    : isWon ? 'You won'
    : isWatching ? 'Watching'
    : timing.effectiveState === 'live' ? 'Live'
    : timing.effectiveState === 'upcoming' ? 'Starting soon'
    : '';

  const ctaText = isOutbid ? 'Bid again'
    : isWon ? 'View result'
    : isLeading ? 'View auction'
    : isWatching ? 'View auction'
    : isNeutral ? 'View Auction'
    : 'View';

  const subtitleText = isOutbid && item.minimumNextBidGbp
    ? `Min to lead: ${formatFromFiat(item.minimumNextBidGbp, 'GBP')}`
    : isLeading || isWon
    ? priceText
    : isNeutral && item.bidCount > 0
    ? `${item.bidCount} bids`
    : '';

  return (
    <AnimatedPressable
      style={styles.leadStage}
      onPress={onPress}
      activeOpacity={0.92}
      scaleValue={0.98}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityHint="Opens auction details"
    >
      <View style={styles.leadImageWrap}>
        {item.imageUrl ? (
          <CachedImage
            uri={item.imageUrl}
            style={styles.leadImage}
            containerStyle={styles.leadImageContainer}
            contentFit="cover"
          />
        ) : (
          <View style={styles.leadImagePlaceholder}>
            <Ionicons name="image-outline" size={32} color={Colors.textMuted} />
          </View>
        )}
        <LinearGradient
          colors={['transparent', 'transparent', 'rgba(0,0,0,0.5)', 'rgba(0,0,0,0.9)']}
          locations={[0, 0.3, 0.65, 1]}
          style={styles.leadGradient}
        />
        {timing.effectiveState === 'live' && (
          <View style={styles.leadLivePill}>
            <View style={[styles.leadLiveDot, { backgroundColor: Colors.danger }]} />
            <Text style={styles.leadLiveText}>LIVE</Text>
          </View>
        )}
        {urgency === 'finalMinutes' && (
          <View style={styles.leadUrgencyPill}>
            <Text style={styles.leadUrgencyText}>{formatFinalMinutesCountdown(timing.msToEnd)}</Text>
          </View>
        )}
      </View>
      <View style={styles.leadBottomStage}>
        <Text style={[styles.leadStateLine, { color: stateColor }]} numberOfLines={1}>
          {stateText}
        </Text>
        <Text style={styles.leadPriceLabel}>{priceLabel}</Text>
        <Text style={styles.leadPriceValue} numberOfLines={1}>{priceText}</Text>
        {subtitleText ? (
          <Text style={styles.leadSubtitle} numberOfLines={1}>{subtitleText}</Text>
        ) : null}
        <View style={styles.leadMetaRow}>
          <Text style={styles.leadTimeText}>{timeLabel}</Text>
          <View style={styles.leadCtaWrap}>
            <Text style={styles.leadCtaText}>{ctaText}</Text>
            <Ionicons name="chevron-forward" size={13} color={Colors.brand} />
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
  const { formatFromFiat, currencyCode, displayMode, goldRates } = useFormattedPrice();
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

    // Dominant stage is rendered separately above the list, so we exclude
    // personal-state items from the feed sections to avoid duplication.
    // Mark all personal-state items as used so they don't appear in feed sections.
    for (const item of canonicalMap.values()) {
      if (item.viewerState === 'leading' || item.viewerState === 'outbid' || item.viewerState === 'won') {
        usedIds.add(item.id);
      }
    }

    // 1. Ending soon
    const endingSoonItems = sectionData.live.filter((item) => {
      if (usedIds.has(item.id)) return false;
      return isEndingSoon(item, minuteClock);
    });
    if (endingSoonItems.length > 0) {
      endingSoonItems.forEach((a) => usedIds.add(a.id));
      result.push({ kind: 'endingSoon', title: 'Ending soon', items: endingSoonItems });
    }

    // 2. Live now
    const liveItems = sectionData.live.filter((item) => {
      if (usedIds.has(item.id)) return false;
      const timing = resolveAuctionTiming(item, minuteClock);
      return timing.effectiveState === 'live' && !isEndingSoon(item, minuteClock);
    });
    if (liveItems.length > 0) {
      liveItems.forEach((a) => usedIds.add(a.id));
      result.push({ kind: 'live', title: 'Live now', items: liveItems });
    }

    // 3. Starting soon
    const upcomingItems = sectionData.upcoming.filter((item) => {
      if (usedIds.has(item.id)) return false;
      const timing = resolveAuctionTiming(item, minuteClock);
      return timing.effectiveState === 'upcoming';
    });
    if (upcomingItems.length > 0) {
      upcomingItems.forEach((a) => usedIds.add(a.id));
      result.push({ kind: 'upcoming', title: 'Starting soon', items: upcomingItems });
    }

    // 4. Watching
    const watchlistItems = sectionData.watchlist.filter((item) => {
      if (usedIds.has(item.id)) return false;
      const timing = resolveAuctionTiming(item, minuteClock);
      return timing.effectiveState === 'live' || timing.effectiveState === 'upcoming';
    });
    if (watchlistItems.length > 0) {
      watchlistItems.forEach((a) => usedIds.add(a.id));
      result.push({ kind: 'watchlist', title: 'Watching', items: watchlistItems });
    }

    // 5. Recently ended
    const endedItems = sectionData.ended.filter((item) => {
      if (usedIds.has(item.id)) return false;
      const timing = resolveAuctionTiming(item, minuteClock);
      return timing.effectiveState === 'ended';
    });
    if (endedItems.length > 0) {
      endedItems.forEach((a) => usedIds.add(a.id));
      result.push({ kind: 'recentlyEnded', title: 'Recently ended', items: endedItems });
    }

    // 6. Your auctions (seller)
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
        <View style={styles.sectionHeaderRow}>
          <SectionHeader title={section.title} />
          {section.kind === 'sellerTools' && (
            <Pressable
              onPress={() => navigation.navigate('SellerAuctionCentre')}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="View all your auctions in Seller Centre"
            >
              <View style={styles.sectionLinkRow}>
                <Text style={styles.sectionLinkText}>Seller Centre</Text>
                <Ionicons name="chevron-forward" size={12} color={Colors.brand} />
              </View>
            </Pressable>
          )}
        </View>
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

  const renderHeader = useCallback(() => null, []);

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

  // ── Dominant stage selector: one personal auction at top priority ──
  const dominantStage = useMemo(() => {
    const all = [
      ...sectionData.live,
      ...sectionData.upcoming,
      ...sectionData.ended,
      ...sectionData.watchlist,
    ];
    const seen = new Set<string>();
    const priority: Record<string, number> = {
      won: 0, outbid: 1, leading: 2, watching: 3, seller: 4,
    };
    const candidates = all.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return item.viewerState !== 'not_participating';
    });
    candidates.sort((a, b) => (priority[a.viewerState] ?? 99) - (priority[b.viewerState] ?? 99));
    if (candidates.length > 0) return candidates[0];
    // Fallback: strongest ending-soon market auction
    const endingSoonLive = sectionData.live.filter((item) => isEndingSoon(item, minuteClock));
    if (endingSoonLive.length > 0) return endingSoonLive[0];
    // Fallback: first live
    if (sectionData.live.length > 0) return sectionData.live[0];
    // Fallback: first upcoming
    if (sectionData.upcoming.length > 0) return sectionData.upcoming[0];
    return null;
  }, [sectionData, minuteClock]);

  // ── Activity summary counts ──
  const activityCounts = useMemo(() => {
    const all = [
      ...sectionData.live,
      ...sectionData.upcoming,
      ...sectionData.ended,
      ...sectionData.watchlist,
    ];
    const seen = new Set<string>();
    const counts = { leading: 0, outbid: 0, won: 0, watching: 0 };
    for (const item of all) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      if (item.viewerState === 'leading') counts.leading++;
      else if (item.viewerState === 'outbid') counts.outbid++;
      else if (item.viewerState === 'won') counts.won++;
      else if (item.viewerState === 'watching') counts.watching++;
    }
    return counts;
  }, [sectionData]);

  const hasActivity = activityCounts.leading + activityCounts.outbid + activityCounts.won + activityCounts.watching > 0;

  // ── Seller capability signal ──
  const hasSellerAuctions = sectionData.seller.length > 0;

  // ── Filter state ──
  const [filterStatus, setFilterStatus] = useState<'all' | 'live' | 'scheduled' | 'ended'>('all');
  const [filterSort, setFilterSort] = useState<'endingSoon' | 'newest' | 'mostBids' | 'priceLow' | 'priceHigh'>('endingSoon');
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [filterSheetVisible, setFilterSheetVisible] = useState(false);

  const activeFilterCount = (filterStatus !== 'all' ? 1 : 0) + (filterCategory ? 1 : 0) + (filterSort !== 'endingSoon' ? 1 : 0);

  // ── Category discovery from real data ──
  const categories = useMemo(() => {
    const catSet = new Set<string>();
    for (const item of [...sectionData.live, ...sectionData.upcoming, ...sectionData.ended]) {
      if (item.category) catSet.add(item.category);
    }
    return Array.from(catSet).sort();
  }, [sectionData]);

  // ── 1ZE + local semantic display ──
  const formatPriceDual = useCallback((amountGbp: number) => {
    const izeAmount = toIze(amountGbp, 'GBP', goldRates);
    const izeText = formatIzeAmount(izeAmount, 4);
    const fiatValue = izeAmount * (goldRates?.[currencyCode] ?? 1);
    const fiatText = formatFiatAmount(fiatValue, currencyCode, 2);
    if (displayMode === 'ize') return { primary: izeText, secondary: null };
    if (displayMode === 'fiat') return { primary: fiatText, secondary: izeText };
    return { primary: izeText, secondary: fiatText };
  }, [goldRates, currencyCode, displayMode]);

  // ── Filtered sections for display ──
  const filteredSections = useMemo(() => {
    if (searchState.status !== 'idle') return [];
    // If filters are active, we need to fetch with filters — for now, filter client-side from existing data
    // This is a bridge until the filter fetch is implemented
    if (filterStatus === 'all' && !filterCategory && filterSort === 'endingSoon') return sections;
    // Client-side filter
    const filterFn = (item: AuctionHomeItem) => {
      const timing = resolveAuctionTiming(item, minuteClock);
      if (filterStatus === 'live' && timing.effectiveState !== 'live') return false;
      if (filterStatus === 'scheduled' && timing.effectiveState !== 'upcoming') return false;
      if (filterStatus === 'ended' && timing.effectiveState !== 'ended') return false;
      return true;
    };
    const sortFn = (a: AuctionHomeItem, b: AuctionHomeItem) => {
      if (filterSort === 'newest') return 0; // preserve order
      if (filterSort === 'mostBids') return b.bidCount - a.bidCount;
      if (filterSort === 'priceLow') return a.currentBidGbp - b.currentBidGbp;
      if (filterSort === 'priceHigh') return b.currentBidGbp - a.currentBidGbp;
      // endingSoon: sort by msToEnd ascending
      const ta = resolveAuctionTiming(a, minuteClock);
      const tb = resolveAuctionTiming(b, minuteClock);
      return (ta.msToEnd ?? Infinity) - (tb.msToEnd ?? Infinity);
    };
    const all = [...sectionData.live, ...sectionData.upcoming, ...sectionData.ended].filter(filterFn);
    // Dedupe
    const seen = new Set<string>();
    const unique = all.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
    unique.sort(sortFn);
    return [{ kind: 'live' as SectionKind, title: 'Results', items: unique }];
  }, [sections, sectionData, minuteClock, searchState.status, filterStatus, filterCategory, filterSort]);

  const displaySections = (filterStatus !== 'all' || filterCategory || filterSort !== 'endingSoon') ? filteredSections : sections;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={Colors.background}
      />

      {/* ── Editorial header ── */}
      <View style={styles.editorialHeader}>
        <View style={styles.editorialHeaderTop}>
          <Pressable
            onPress={handleBack}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={styles.headerBackBtn}
          >
            <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
          </Pressable>
          <View style={styles.editorialTitleWrap}>
            <Text style={styles.editorialTitle}>Auctions</Text>
            <Text style={styles.editorialSubtitle}>
              {sectionData.live.length > 0
                ? `${sectionData.live.length} live now`
                : loading ? 'Loading market…'
                : 'Live, upcoming and ending soon'}
            </Text>
          </View>
          {hasActivity ? (
            <Pressable
              onPress={() => { haptics.tap(); navigation.navigate('MyBids'); }}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={`Activity: ${activityCounts.leading} leading, ${activityCounts.outbid} outbid, ${activityCounts.won} won, ${activityCounts.watching} watching`}
              style={styles.headerActivityBtn}
            >
              <View style={styles.headerActivityPill}>
                <Text style={styles.headerActivityText}>
                  {activityCounts.leading + activityCounts.outbid + activityCounts.won + activityCounts.watching}
                </Text>
              </View>
              <Text style={styles.headerActivityLabel}>Activity</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => { haptics.tap(); navigation.navigate('MyBids'); }}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="My auction activity"
              style={styles.headerActionBtn}
            >
              <Ionicons name="list-outline" size={22} color={Colors.textMuted} />
            </Pressable>
          )}
        </View>

        {/* Search + Filter row */}
        <View style={styles.searchFilterRow}>
          <View style={styles.searchWrapFlex}>
            <AppInput
              value={searchQuery}
              onChangeText={handleSearchChange}
              placeholder="Search auctions"
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
          <Pressable
            style={[styles.filterBtn, activeFilterCount > 0 && styles.filterBtnActive]}
            onPress={() => { haptics.tap(); setFilterSheetVisible(true); }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Filter and sort${activeFilterCount > 0 ? `, ${activeFilterCount} active` : ''}`}
          >
            <Ionicons name="options-outline" size={18} color={activeFilterCount > 0 ? Colors.brand : Colors.textSecondary} />
            {activeFilterCount > 0 && (
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
              </View>
            )}
          </Pressable>
        </View>

        {/* Active filter chips */}
        {activeFilterCount > 0 && !isSearching && (
          <View style={styles.activeFilterChips}>
            {filterStatus !== 'all' && (
              <Pressable
                style={styles.filterChip}
                onPress={() => { haptics.tap(); setFilterStatus('all'); }}
              >
                <Text style={styles.filterChipText}>{filterStatus === 'live' ? 'Live' : filterStatus === 'scheduled' ? 'Starting soon' : 'Ended'}</Text>
                <Ionicons name="close" size={12} color={Colors.textMuted} />
              </Pressable>
            )}
            {filterSort !== 'endingSoon' && (
              <Pressable
                style={styles.filterChip}
                onPress={() => { haptics.tap(); setFilterSort('endingSoon'); }}
              >
                <Text style={styles.filterChipText}>{filterSort === 'newest' ? 'Newest' : filterSort === 'mostBids' ? 'Most bids' : filterSort === 'priceLow' ? 'Price: low to high' : 'Price: high to low'}</Text>
                <Ionicons name="close" size={12} color={Colors.textMuted} />
              </Pressable>
            )}
          </View>
        )}

        {(error || resyncFailed) && (
          <View style={styles.errorBanner}>
            <Ionicons name={error ? 'cloud-offline-outline' : 'sync-outline'} size={16} color={Colors.textMuted} />
            <Meta style={styles.errorText}>{error ?? 'Clock sync failed — pull to refresh'}</Meta>
          </View>
        )}
      </View>

      {/* ── Dominant auction stage ── */}
      {!isSearching && dominantStage && (
        <AuctionAttentionCard
          item={dominantStage}
          clockMs={secondClock}
          onPress={() => navigateToDetail(dominantStage.id)}
          formatFromFiat={formatFromFiat}
        />
      )}

      {/* ── Seller contextual area ── */}
      {!isSearching && hasSellerAuctions && (
        <View style={styles.sellerContextBar}>
          <Pressable
            style={styles.sellerContextBtn}
            onPress={() => { haptics.tap(); navigation.navigate('SellerAuctionCentre'); }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Seller Centre — manage your auctions"
          >
            <Ionicons name="storefront-outline" size={16} color={Colors.brand} />
            <Text style={styles.sellerContextText}>Seller Centre</Text>
            <Text style={styles.sellerContextCount}>{sectionData.seller.length}</Text>
          </Pressable>
          <Pressable
            style={styles.sellerCreateBtn}
            onPress={() => { haptics.tap(); navigation.navigate('CreateAuction'); }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Create auction"
          >
            <Text style={styles.sellerCreateText}>Create Auction</Text>
          </Pressable>
        </View>
      )}

      {/* ── No seller: restrained create control ── */}
      {!isSearching && !hasSellerAuctions && !loading && (
        <View style={styles.createBar}>
          <Pressable
            style={styles.createLink}
            onPress={() => { haptics.tap(); navigation.navigate('CreateAuction'); }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Create auction"
          >
            <Ionicons name="add-outline" size={14} color={Colors.brand} />
            <Text style={styles.createLinkText}>Create Auction</Text>
          </Pressable>
        </View>
      )}

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
          data={displaySections}
          keyExtractor={(item) => item.kind}
          renderItem={({ item }) => renderSection(item)}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={
            loading ? renderLoadingState() : (
              <EmptyState
                icon="hammer-outline"
                title="No live auctions right now"
                subtitle="Check back soon or explore upcoming auctions."
                ctaLabel="Create Auction"
                onCtaPress={() => { haptics.tap(); navigation.navigate('CreateAuction'); }}
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

      {/* ── Filter sheet ── */}
      <BottomSheet
        visible={filterSheetVisible}
        onDismiss={() => setFilterSheetVisible(false)}
      >
        <View style={styles.filterSheetContent}>
          <Text style={styles.filterSheetTitle}>Filter & Sort</Text>

          <Text style={styles.filterSectionLabel}>Status</Text>
          <View style={styles.filterOptionRow}>
            {(['all', 'live', 'scheduled', 'ended'] as const).map((opt) => (
              <Pressable
                key={opt}
                style={[styles.filterOption, filterStatus === opt && styles.filterOptionActive]}
                onPress={() => { haptics.tap(); setFilterStatus(opt); }}
              >
                <Text style={[styles.filterOptionText, filterStatus === opt && styles.filterOptionTextActive]}>
                  {opt === 'all' ? 'All' : opt === 'live' ? 'Live' : opt === 'scheduled' ? 'Starting soon' : 'Ended'}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.filterSectionLabel}>Sort</Text>
          <View style={styles.filterOptionRow}>
            {(['endingSoon', 'newest', 'mostBids', 'priceLow', 'priceHigh'] as const).map((opt) => (
              <Pressable
                key={opt}
                style={[styles.filterOption, filterSort === opt && styles.filterOptionActive]}
                onPress={() => { haptics.tap(); setFilterSort(opt); }}
              >
                <Text style={[styles.filterOptionText, filterSort === opt && styles.filterOptionTextActive]}>
                  {opt === 'endingSoon' ? 'Ending soon' : opt === 'newest' ? 'Newest' : opt === 'mostBids' ? 'Most bids' : opt === 'priceLow' ? 'Price: low' : 'Price: high'}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.filterSheetActions}>
            <Pressable
              style={styles.filterResetBtn}
              onPress={() => { haptics.tap(); setFilterStatus('all'); setFilterSort('endingSoon'); setFilterCategory(null); }}
            >
              <Text style={styles.filterResetText}>Reset</Text>
            </Pressable>
            <Pressable
              style={styles.filterApplyBtn}
              onPress={() => { haptics.tap(); setFilterSheetVisible(false); }}
            >
              <Text style={styles.filterApplyText}>Apply</Text>
            </Pressable>
          </View>
        </View>
      </BottomSheet>
    </SafeAreaView>
  );
}

const HEADER_HEIGHT = 44;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  // ── Personal state rail ──
  stateRail: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  stateRailScroll: {
    gap: Space.sm,
  },
  stateTile: {
    width: 130,
  },
  stateTileImageWrap: {
    width: 130,
    height: 160,
    borderRadius: Radius.md,
    overflow: 'hidden',
    position: 'relative',
  },
  stateTileImage: {
    width: 130,
    height: 160,
    borderRadius: Radius.md,
  },
  stateTileImageContainer: {
    width: 130,
    height: 160,
    borderRadius: Radius.md,
  },
  stateTilePlaceholder: {
    width: 130,
    height: 160,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateTileAccent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  stateTileLabel: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    marginTop: Space.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  stateTileTitle: {
    fontSize: 13,
    color: Colors.textPrimary,
    fontFamily: 'Inter_500Medium',
    marginTop: 2,
  },
  stateTilePrice: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontFamily: 'Inter_400Regular',
    marginTop: 1,
  },
  // ── Editorial header ──
  editorialHeader: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.xs,
  },
  editorialHeaderTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  editorialTitleWrap: {
    flex: 1,
  },
  editorialTitle: {
    fontSize: 34,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -1,
    color: Colors.textPrimary,
  },
  editorialSubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },
  headerBackBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerActionBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentContainer: {
    paddingBottom: Space.xl,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Space.sm,
    marginBottom: Space.sm,
  },
  clearSearchBtn: {
    position: 'absolute',
    right: 8,
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
  // ── Utility rail ──
  utilityRail: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs,
    gap: Space.md,
  },
  utilityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  utilityLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontFamily: 'Inter_500Medium',
  },
  utilityCreate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 'auto',
  },
  utilityCreateLabel: {
    fontSize: 13,
    color: Colors.brand,
    fontFamily: 'Inter_600SemiBold',
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
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    marginBottom: Space.sm,
  },
  sectionLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  sectionLinkText: {
    fontSize: 13,
    color: Colors.brand,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
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
  // ── Lead stage (dominant image-led auction) ──
  leadStage: {
    marginHorizontal: Space.md,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
  },
  leadImageWrap: {
    position: 'relative',
    width: '100%',
    height: 320,
  },
  leadImageContainer: {
    width: '100%',
    height: 320,
  },
  leadImage: {
    width: '100%',
    height: 320,
  },
  leadImagePlaceholder: {
    width: '100%',
    height: 320,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leadGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '60%',
  },
  leadLivePill: {
    position: 'absolute',
    top: Space.sm,
    left: Space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  leadLiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  leadLiveText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  leadUrgencyPill: {
    position: 'absolute',
    top: Space.sm,
    right: Space.sm,
    backgroundColor: 'rgba(220,38,38,0.85)',
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  leadUrgencyText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
  },
  leadBottomStage: {
    position: 'absolute',
    bottom: Space.md,
    left: Space.md,
    right: Space.md,
    gap: 4,
  },
  leadStateLine: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
  },
  leadPriceLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
    fontFamily: 'Inter_400Regular',
  },
  leadPriceValue: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '700',
    letterSpacing: -0.5,
    color: '#FFFFFF',
    fontFamily: 'Inter_700Bold',
  },
  leadSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
    fontFamily: 'Inter_500Medium',
    marginTop: 2,
  },
  leadMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  leadTimeText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
    fontFamily: 'Inter_500Medium',
  },
  leadCtaWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  leadCtaText: {
    fontSize: 13,
    color: Colors.brand,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
  },
  attentionReason: {
    color: Colors.textSecondary,
    marginBottom: Space.sm,
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
  // ── Header activity ──
  headerActivityBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  headerActivityPill: {
    backgroundColor: Colors.brand,
    borderRadius: Radius.full,
    minWidth: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  headerActivityText: {
    color: Colors.textInverse,
    fontSize: 12,
    fontFamily: Typography.family.semibold,
  },
  headerActivityLabel: {
    fontSize: 9,
    color: Colors.textMuted,
    fontFamily: Typography.family.regular,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  // ── Search + filter row ──
  searchFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingTop: Space.sm,
    marginBottom: Space.sm,
  },
  searchWrapFlex: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  filterBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBtnActive: {
    borderColor: Colors.brand,
  },
  filterBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: Radius.full,
    backgroundColor: Colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  filterBadgeText: {
    color: Colors.textInverse,
    fontSize: 9,
    fontFamily: Typography.family.semibold,
  },
  // ── Active filter chips ──
  activeFilterChips: {
    flexDirection: 'row',
    gap: Space.xs,
    marginBottom: Space.sm,
    flexWrap: 'wrap',
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Space.sm,
    paddingVertical: 4,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceAlt,
  },
  filterChipText: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontFamily: Typography.family.medium,
  },
  // ── Seller context bar ──
  sellerContextBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs,
    gap: Space.sm,
  },
  sellerContextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sellerContextText: {
    fontSize: 13,
    color: Colors.brand,
    fontFamily: Typography.family.semibold,
  },
  sellerContextCount: {
    fontSize: 11,
    color: Colors.textMuted,
    fontFamily: Typography.family.medium,
  },
  sellerCreateBtn: {
    paddingHorizontal: Space.sm,
    paddingVertical: 6,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sellerCreateText: {
    fontSize: 12,
    color: Colors.textPrimary,
    fontFamily: Typography.family.semibold,
  },
  // ── Create bar (no seller) ──
  createBar: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs,
  },
  createLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  createLinkText: {
    fontSize: 12,
    color: Colors.brand,
    fontFamily: Typography.family.semibold,
  },
  // ── Filter sheet ──
  filterSheetContent: {
    paddingHorizontal: Space.lg,
    paddingVertical: Space.md,
  },
  filterSheetTitle: {
    fontSize: 18,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    marginBottom: Space.md,
  },
  filterSectionLabel: {
    fontSize: 12,
    color: Colors.textMuted,
    fontFamily: Typography.family.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Space.xs,
    marginTop: Space.sm,
  },
  filterOptionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.xs,
  },
  filterOption: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  filterOptionActive: {
    borderColor: Colors.brand,
    backgroundColor: Colors.surface,
  },
  filterOptionText: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontFamily: Typography.family.medium,
  },
  filterOptionTextActive: {
    color: Colors.brand,
  },
  filterSheetActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Space.lg,
    gap: Space.md,
  },
  filterResetBtn: {
    flex: 1,
    paddingVertical: Space.sm,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
  },
  filterResetText: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontFamily: Typography.family.semibold,
  },
  filterApplyBtn: {
    flex: 1,
    paddingVertical: Space.sm,
    borderRadius: Radius.md,
    backgroundColor: Colors.brand,
    alignItems: 'center',
  },
  filterApplyText: {
    fontSize: 14,
    color: Colors.textInverse,
    fontFamily: Typography.family.semibold,
  },
});
