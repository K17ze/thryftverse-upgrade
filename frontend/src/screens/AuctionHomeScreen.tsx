import React, { memo, useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  RefreshControl,
  Pressable,
  StatusBar,
  Text,
  ScrollView,
  TextInput,
  Dimensions,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';
import { RootStackParamList } from '../navigation/types';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useBucketedServerClock, resolveAuctionTiming } from '../hooks/useServerClock';
import {
  resolvePriceLabel,
  resolveTimeLabel,
  resolveUrgency,
  formatFinalMinutesCountdown,
  buildAuctionAccessibilityLabel,
  createSearchState,
  IDLE_SEARCH_STATE,
  type AuctionHomeItem,
  type AuctionSearchState,
} from '../utils/auctionHomeLogic';
import { CachedImage } from '../components/CachedImage';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { EmptyState } from '../components/EmptyState';
import { haptics } from '../utils/haptics';
import { Space, Radius, Typography } from '../theme/designTokens';
import { toIze, formatIzeAmount, formatFiatAmount } from '../utils/currency';
import { BottomSheet } from '../components/BottomSheet';
import {
  listAuctions,
  getAuctionHome,
  type MarketAuction,
  type AttentionReason,
  type CategoryWorld,
  type AuctionHomeActivity,
  type SellerSummary,
} from '../services/marketApi';

type NavT = StackNavigationProp<RootStackParamList>;

const SCREEN_WIDTH = Dimensions.get('window').width;
// Closing Soon runway: 72-78% viewport-width first card so the next lot peeks
// (marketplace plurality, not a single-product page).
const CLOSING_SOON_CARD_WIDTH = SCREEN_WIDTH * 0.76;

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

interface DualPriceResult {
  primaryText: string;
  secondaryText: string | null;
}

type FormatDualPrice = (amountGbp: number) => DualPriceResult;

// ════════════════════════════════════════════════════════════════
// ZONE A: MARKETPLACE HEADER — compact native lobby header (56-88pt)
// Replaces the rejected single-lot CinematicMasthead. Communicates
// plurality (Auctions marketplace) not a product-detail hero.
// ════════════════════════════════════════════════════════════════
const MarketplaceHeader = memo(function MarketplaceHeader({
  liveContext,
  onSearch,
  onFilter,
  onActivity,
  onBack,
  showBack,
}: {
  liveContext: string;
  onSearch: () => void;
  onFilter: () => void;
  onActivity: () => void;
  onBack: () => void;
  showBack: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.marketHeader, { paddingTop: insets.top + Space.xs }]}>
      <View style={styles.marketHeaderRow}>
        {showBack ? (
          <Pressable
            onPress={onBack}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={styles.marketHeaderIconBtn}
          >
            <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
          </Pressable>
        ) : null}
        <View style={styles.marketHeaderTitleWrap}>
          <Text style={styles.marketHeaderTitle} numberOfLines={1}>Auctions</Text>
          <Text style={styles.marketHeaderContext} numberOfLines={1}>{liveContext}</Text>
        </View>
        <View style={styles.marketHeaderActions}>
          <Pressable
            onPress={onSearch}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Search auctions"
            style={styles.marketHeaderIconBtn}
          >
            <Ionicons name="search-outline" size={22} color={Colors.textPrimary} />
          </Pressable>
          <Pressable
            onPress={onFilter}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Filter auctions"
            style={styles.marketHeaderIconBtn}
          >
            <Ionicons name="options-outline" size={22} color={Colors.textPrimary} />
          </Pressable>
          <Pressable
            onPress={onActivity}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="View your auction activity"
            style={styles.marketHeaderIconBtn}
          >
            <Ionicons name="pulse-outline" size={22} color={Colors.textPrimary} />
          </Pressable>
        </View>
      </View>
    </View>
  );
});

// ════════════════════════════════════════════════════════════════
// ZONE B: PERSONAL ACTION BANNER — compact action layer (64-92pt)
// Personal attention is separated from market discovery. Never the
// marketplace masthead. One thumbnail only where useful.
// ════════════════════════════════════════════════════════════════
const PersonalActionBanner = memo(function PersonalActionBanner({
  activity,
  attentionItem,
  attentionReason,
  clockMs,
  onPress,
  onDetail,
  formatDualPrice,
}: {
  activity: AuctionHomeActivity;
  attentionItem: AuctionHomeItem | null;
  attentionReason: AttentionReason;
  clockMs: number;
  onPress: () => void;
  onDetail: () => void;
  formatDualPrice: FormatDualPrice;
}) {
  const hasActivity = activity.activeCount > 0 || activity.needsAttentionCount > 0;
  if (!hasActivity && !attentionItem) return null;

  const isOutbid = attentionReason === 'outbid';
  const isLeading = attentionReason === 'leading' || attentionReason === 'leading_ending';
  const isWon = attentionReason === 'won_action';

  // ── Outbid: urgent personal action ──
  if (isOutbid && attentionItem) {
    const timing = resolveAuctionTiming(attentionItem, clockMs);
    const timeLabel = resolveUrgency(timing) === 'finalMinutes'
      ? formatFinalMinutesCountdown(timing.msToEnd)
      : resolveTimeLabel(timing);
    const minPrice = attentionItem.minimumNextBidGbp ? formatDualPrice(attentionItem.minimumNextBidGbp) : null;
    return (
      <Pressable
        style={[styles.actionBanner, styles.actionBannerUrgent]}
        onPress={() => { haptics.tap(); onDetail(); }}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`You've been outbid. ${minPrice ? `Minimum to lead ${minPrice.primaryText}.` : ''} ${timeLabel} left. Bid again.`}
      >
        {attentionItem.imageUrl ? (
          <CachedImage
            uri={attentionItem.imageUrl}
            style={styles.actionBannerThumb}
            containerStyle={styles.actionBannerThumbContainer}
            contentFit="cover"
          />
        ) : null}
        <View style={styles.actionBannerBody}>
          <Text style={[styles.actionBannerTitle, { color: Colors.danger }]} numberOfLines={1}>You've been outbid</Text>
          <Text style={styles.actionBannerMeta} numberOfLines={1}>
            {timeLabel} left{minPrice ? ` · ${minPrice.primaryText}` : ''}
          </Text>
        </View>
        <View style={styles.actionBannerCta}>
          <Text style={styles.actionBannerCtaText}>Bid again</Text>
          <Ionicons name="chevron-forward" size={14} color={Colors.danger} />
        </View>
      </Pressable>
    );
  }

  // ── Leading: calm confirmation ──
  if (isLeading && attentionItem) {
    const timing = resolveAuctionTiming(attentionItem, clockMs);
    const timeLabel = resolveUrgency(timing) === 'finalMinutes'
      ? formatFinalMinutesCountdown(timing.msToEnd)
      : resolveTimeLabel(timing);
    return (
      <Pressable
        style={[styles.actionBanner, styles.actionBannerCalm]}
        onPress={() => { haptics.tap(); onDetail(); }}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`You're leading. Ends in ${timeLabel}. View activity.`}
      >
        {attentionItem.imageUrl ? (
          <CachedImage
            uri={attentionItem.imageUrl}
            style={styles.actionBannerThumb}
            containerStyle={styles.actionBannerThumbContainer}
            contentFit="cover"
          />
        ) : null}
        <View style={styles.actionBannerBody}>
          <Text style={[styles.actionBannerTitle, { color: Colors.success }]} numberOfLines={1}>You're leading</Text>
          <Text style={styles.actionBannerMeta} numberOfLines={1}>Ends in {timeLabel}</Text>
        </View>
        <View style={styles.actionBannerCta}>
          <Text style={styles.actionBannerCtaText}>View Activity</Text>
          <Ionicons name="chevron-forward" size={14} color={Colors.success} />
        </View>
      </Pressable>
    );
  }

  // ── Won requiring action ──
  if (isWon && attentionItem) {
    return (
      <Pressable
        style={[styles.actionBanner, styles.actionBannerWon]}
        onPress={() => { haptics.tap(); onDetail(); }}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="You won. Next step required. View result."
      >
        {attentionItem.imageUrl ? (
          <CachedImage
            uri={attentionItem.imageUrl}
            style={styles.actionBannerThumb}
            containerStyle={styles.actionBannerThumbContainer}
            contentFit="cover"
          />
        ) : null}
        <View style={styles.actionBannerBody}>
          <Text style={[styles.actionBannerTitle, { color: Colors.brand }]} numberOfLines={1}>You won</Text>
          <Text style={styles.actionBannerMeta} numberOfLines={1}>Next step required</Text>
        </View>
        <View style={styles.actionBannerCta}>
          <Text style={styles.actionBannerCtaText}>View result</Text>
          <Ionicons name="chevron-forward" size={14} color={Colors.brand} />
        </View>
      </Pressable>
    );
  }

  // ── No urgent action: restrained summary ──
  const summary = `${activity.activeCount} active · ${activity.watchingCount} watching`;
  return (
    <Pressable
      style={styles.actionBanner}
      onPress={() => { haptics.tap(); onPress(); }}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={`${activity.activeCount} active auctions, ${activity.watchingCount} watching. View activity.`}
    >
      <View style={styles.actionBannerBody}>
        <Text style={styles.actionBannerSummary} numberOfLines={1}>{summary}</Text>
      </View>
      <View style={styles.actionBannerCta}>
        <Text style={styles.actionBannerCtaText}>View Activity</Text>
        <Ionicons name="chevron-forward" size={14} color={Colors.textSecondary} />
      </View>
    </Pressable>
  );
});

// ════════════════════════════════════════════════════════════════
// ZONE C: CLOSING SOON PROGRAMME — cinematic runway
// ════════════════════════════════════════════════════════════════
const ClosingSoonCard = memo(function ClosingSoonCard({
  item,
  index,
  clockMs,
  onPress,
  formatDualPrice,
}: {
  item: AuctionHomeItem;
  index: number;
  clockMs: number;
  onPress: () => void;
  formatDualPrice: FormatDualPrice;
}) {
  const timing = resolveAuctionTiming(item, clockMs);
  const urgency = resolveUrgency(timing);
  const dualPrice = formatDualPrice(item.currentBidGbp || item.startingBidGbp);
  const timeLabel = urgency === 'finalMinutes'
    ? formatFinalMinutesCountdown(timing.msToEnd)
    : resolveTimeLabel(timing);
  const a11yLabel = buildAuctionAccessibilityLabel(item, timing, resolvePriceLabel(item, timing), dualPrice.primaryText);
  const eyebrow = item.brand ?? item.category ?? '';

  return (
    <AnimatedPressable
      style={styles.closingSoonCard}
      onPress={onPress}
      activeOpacity={0.94}
      scaleValue={0.98}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityHint="Opens auction details"
    >
      <View style={styles.closingSoonImageWrap}>
        {item.imageUrl ? (
          <CachedImage
            uri={item.imageUrl}
            style={styles.closingSoonImage}
            containerStyle={StyleSheet.absoluteFill}
            contentFit="cover"
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: Colors.surface }]} />
        )}
        <LinearGradient
          colors={['transparent', 'transparent', 'rgba(0,0,0,0.7)']}
          locations={[0, 0.45, 1]}
          style={styles.closingSoonGradient}
          pointerEvents="none"
        />
        <View style={styles.closingSoonSequenceWrap}>
          <Text style={styles.closingSoonSequence}>{String(index + 1).padStart(2, '0')}</Text>
        </View>
        <View style={styles.closingSoonCountdownWrap}>
          <Text style={styles.closingSoonCountdown}>{timeLabel}</Text>
        </View>
      </View>
      <View style={styles.closingSoonBody}>
        {eyebrow ? <Text style={styles.closingSoonEyebrow} numberOfLines={1}>{eyebrow.toUpperCase()}</Text> : null}
        <Text style={styles.closingSoonTitle} numberOfLines={1}>{item.title}</Text>
        <View style={styles.closingSoonPriceRow}>
          <Text style={styles.closingSoonPrice}>{dualPrice.primaryText}</Text>
          {dualPrice.secondaryText ? (
            <Text style={styles.closingSoonPriceSecondary}>≈ {dualPrice.secondaryText}</Text>
          ) : null}
        </View>
        <Text style={styles.closingSoonBids}>{item.bidCount > 0 ? `${item.bidCount} bids` : 'No bids'}</Text>
      </View>
    </AnimatedPressable>
  );
});

// ════════════════════════════════════════════════════════════════
// ZONE D: LIVE AUCTION FLOOR — borderless editorial grid
// ════════════════════════════════════════════════════════════════
const LiveFloorCard = memo(function LiveFloorCard({
  item,
  clockMs,
  onPress,
  formatDualPrice,
}: {
  item: AuctionHomeItem;
  clockMs: number;
  onPress: () => void;
  formatDualPrice: FormatDualPrice;
}) {
  const timing = resolveAuctionTiming(item, clockMs);
  const urgency = resolveUrgency(timing);
  const dualPrice = formatDualPrice(item.currentBidGbp || item.startingBidGbp);
  const timeLabel = urgency === 'finalMinutes'
    ? formatFinalMinutesCountdown(timing.msToEnd)
    : resolveTimeLabel(timing);
  const a11yLabel = buildAuctionAccessibilityLabel(item, timing, resolvePriceLabel(item, timing), dualPrice.primaryText);

  return (
    <AnimatedPressable
      style={styles.liveFloorCard}
      onPress={onPress}
      activeOpacity={0.92}
      scaleValue={0.985}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityHint="Opens auction details"
    >
      <View style={styles.liveFloorImageWrap}>
        {item.imageUrl ? (
          <CachedImage
            uri={item.imageUrl}
            style={styles.liveFloorImage}
            containerStyle={StyleSheet.absoluteFill}
            contentFit="cover"
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: Colors.surface }]} />
        )}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.55)']}
          locations={[0.5, 1]}
          style={styles.liveFloorGradient}
          pointerEvents="none"
        />
        <View style={styles.liveFloorLiveBadge}>
          <View style={styles.liveFloorLiveDot} />
          <Text style={styles.liveFloorLiveText}>LIVE</Text>
        </View>
        {urgency === 'finalMinutes' && (
          <View style={styles.liveFloorUrgencyBadge}>
            <Text style={styles.liveFloorUrgencyText}>{timeLabel}</Text>
          </View>
        )}
      </View>
      <View style={styles.liveFloorBody}>
        <Text style={styles.liveFloorTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.liveFloorPrice}>{dualPrice.primaryText}</Text>
        {dualPrice.secondaryText ? (
          <Text style={styles.liveFloorPriceSecondary} numberOfLines={1}>≈ {dualPrice.secondaryText}</Text>
        ) : null}
        <View style={styles.liveFloorMetaRow}>
          <Text style={styles.liveFloorBids}>{item.bidCount > 0 ? `${item.bidCount} bids` : 'No bids'}</Text>
          {urgency !== 'finalMinutes' && (
            <Text style={[styles.liveFloorTime, urgency === 'endingSoon' && { color: Colors.danger }]}>{timeLabel}</Text>
          )}
        </View>
      </View>
    </AnimatedPressable>
  );
});

// ════════════════════════════════════════════════════════════════
// ZONE E: CATEGORY WORLDS — compact editorial mosaic
// One featured category tile + two or four secondary tiles.
// Replaces the rejected six full-width 180px stacked banners that
// created excessive scrolling and repeated hero-like sections.
// Max initial section height ~360-480pt.
// ════════════════════════════════════════════════════════════════
const CategoryTile = memo(function CategoryTile({
  world,
  onPress,
  variant,
}: {
  world: CategoryWorld;
  onPress: () => void;
  variant: 'featured' | 'secondary';
}) {
  return (
    <Pressable
      style={[styles.categoryTile, variant === 'featured' ? styles.categoryTileFeatured : styles.categoryTileSecondary]}
      onPress={() => { haptics.tap(); onPress(); }}
      accessibilityRole="button"
      accessibilityLabel={`Browse ${world.displayName} auctions`}
    >
      {world.representativeImageUrl ? (
        <CachedImage
          uri={world.representativeImageUrl}
          style={StyleSheet.absoluteFill}
          containerStyle={StyleSheet.absoluteFill}
          contentFit="cover"
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: Colors.surfaceAlt }]} />
      )}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.65)']}
        locations={[0.45, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={styles.categoryTileOverlay}>
        <Text
          style={[styles.categoryTileName, variant === 'featured' && styles.categoryTileNameFeatured]}
          numberOfLines={variant === 'featured' ? 2 : 1}
        >
          {world.displayName}
        </Text>
        {variant === 'featured' && world.availableCount != null && world.availableCount > 0 ? (
          <Text style={styles.categoryTileCount}>{world.availableCount} live now</Text>
        ) : null}
      </View>
    </Pressable>
  );
});

const CategoryMosaic = memo(function CategoryMosaic({
  worlds,
  onPress,
}: {
  worlds: CategoryWorld[];
  onPress: (categoryKey: string) => void;
}) {
  if (worlds.length === 0) return null;
  // 1 featured + up to 4 secondary (2x2). Falls back to 2-col grid when <3.
  if (worlds.length < 3) {
    return (
      <View style={styles.categoryMosaicRow}>
        {worlds.slice(0, 2).map((world) => (
          <CategoryTile
            key={world.categoryKey}
            world={world}
            variant="secondary"
            onPress={() => onPress(world.categoryKey)}
          />
        ))}
      </View>
    );
  }
  const featured = worlds[0];
  const secondary = worlds.slice(1, 5); // up to 4
  return (
    <View style={styles.categoryMosaicContainer}>
      <CategoryTile world={featured} variant="featured" onPress={() => onPress(featured.categoryKey)} />
      <View style={styles.categoryMosaicSecondaryRow}>
        {secondary.map((world) => (
          <CategoryTile
            key={world.categoryKey}
            world={world}
            variant="secondary"
            onPress={() => onPress(world.categoryKey)}
          />
        ))}
      </View>
    </View>
  );
});

// ════════════════════════════════════════════════════════════════
// ZONE F: UPCOMING DROPS — programme-style rows
// ════════════════════════════════════════════════════════════════
const UpcomingDropRow = memo(function UpcomingDropRow({
  item,
  clockMs,
  onPress,
  formatDualPrice,
}: {
  item: AuctionHomeItem;
  clockMs: number;
  onPress: () => void;
  formatDualPrice: FormatDualPrice;
}) {
  const timing = resolveAuctionTiming(item, clockMs);
  const dualPrice = formatDualPrice(item.startingBidGbp);
  const a11yLabel = buildAuctionAccessibilityLabel(item, timing, resolvePriceLabel(item, timing), dualPrice.primaryText);
  const eyebrow = item.brand ?? item.category ?? '';
  const startDate = new Date(item.startsAt);
  const timeStr = startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateStr = startDate.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });

  return (
    <Pressable
      style={styles.upcomingDropRow}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityHint="Opens auction details"
    >
      <View style={styles.upcomingDropImageWrap}>
        {item.imageUrl ? (
          <CachedImage
            uri={item.imageUrl}
            style={styles.upcomingDropImage}
            containerStyle={StyleSheet.absoluteFill}
            contentFit="cover"
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: Colors.surface }]} />
        )}
      </View>
      <View style={styles.upcomingDropBody}>
        <Text style={styles.upcomingDropDate}>STARTS {dateStr.toUpperCase()} · {timeStr}</Text>
        {eyebrow ? <Text style={styles.upcomingDropEyebrow} numberOfLines={1}>{eyebrow}</Text> : null}
        <Text style={styles.upcomingDropTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.upcomingDropPrice}>Starting at {dualPrice.primaryText}</Text>
      </View>
      <Pressable
        style={styles.upcomingDropNotify}
        onPress={() => { haptics.tap(); onPress(); }}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="View auction"
      >
        <Ionicons name="notifications-outline" size={18} color={Colors.brand} />
      </Pressable>
    </Pressable>
  );
});

// ════════════════════════════════════════════════════════════════
// ZONE G: WATCHING CONTINUITY — compact image-led rail
// ════════════════════════════════════════════════════════════════
const WatchingRailCard = memo(function WatchingRailCard({
  item,
  clockMs,
  onPress,
  formatDualPrice,
}: {
  item: AuctionHomeItem;
  clockMs: number;
  onPress: () => void;
  formatDualPrice: FormatDualPrice;
}) {
  const timing = resolveAuctionTiming(item, clockMs);
  const dualPrice = formatDualPrice(item.currentBidGbp || item.startingBidGbp);
  const timeLabel = resolveTimeLabel(timing);
  const a11yLabel = buildAuctionAccessibilityLabel(item, timing, resolvePriceLabel(item, timing), dualPrice.primaryText);
  const stateText = item.viewerState === 'leading' ? 'Leading'
    : item.viewerState === 'outbid' ? 'Outbid'
    : timing.effectiveState === 'live' ? 'Live'
    : 'Upcoming';

  return (
    <Pressable
      style={styles.watchingRailCard}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityHint="Opens auction details"
    >
      <View style={styles.watchingRailImageWrap}>
        {item.imageUrl ? (
          <CachedImage
            uri={item.imageUrl}
            style={styles.watchingRailImage}
            containerStyle={StyleSheet.absoluteFill}
            contentFit="cover"
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: Colors.surface }]} />
        )}
      </View>
      <View style={styles.watchingRailBody}>
        <Text style={styles.watchingRailTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.watchingRailState}>{stateText}</Text>
        <Text style={styles.watchingRailPrice}>{dualPrice.primaryText}</Text>
        <Text style={styles.watchingRailTime}>{timeLabel}</Text>
      </View>
    </Pressable>
  );
});

// ════════════════════════════════════════════════════════════════
// ZONE H: RECENTLY CLOSED — quiet results ledger
// ════════════════════════════════════════════════════════════════
const ClosedLedgerRow = memo(function ClosedLedgerRow({
  item,
  clockMs,
  onPress,
  formatDualPrice,
}: {
  item: AuctionHomeItem;
  clockMs: number;
  onPress: () => void;
  formatDualPrice: FormatDualPrice;
}) {
  const timing = resolveAuctionTiming(item, clockMs);
  const dualPrice = formatDualPrice(item.currentBidGbp || item.startingBidGbp);
  const a11yLabel = buildAuctionAccessibilityLabel(item, timing, resolvePriceLabel(item, timing), dualPrice.primaryText);
  const resultText = item.viewerState === 'won' ? 'Won'
    : item.viewerState === 'lost' ? 'Lost'
    : item.terminalReason === 'cancelled' ? 'Cancelled'
    : item.bidCount === 0 ? 'No sale'
    : 'Sold';
  const resultColor = item.viewerState === 'won' ? Colors.success
    : item.viewerState === 'lost' ? Colors.danger
    : item.terminalReason === 'cancelled' ? Colors.textMuted
    : item.bidCount === 0 ? Colors.textMuted
    : Colors.textSecondary;

  return (
    <Pressable
      style={styles.closedLedgerRow}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityHint="Opens auction details"
    >
      <View style={styles.closedLedgerImageWrap}>
        {item.imageUrl ? (
          <CachedImage
            uri={item.imageUrl}
            style={styles.closedLedgerImage}
            containerStyle={StyleSheet.absoluteFill}
            contentFit="cover"
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: Colors.surface }]} />
        )}
      </View>
      <View style={styles.closedLedgerBody}>
        <Text style={styles.closedLedgerTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.closedLedgerPrice}>{dualPrice.primaryText}</Text>
      </View>
      <View style={styles.closedLedgerRight}>
        <Text style={[styles.closedLedgerResult, { color: resultColor }]}>{resultText}</Text>
        {item.bidCount > 0 && (
          <Text style={styles.closedLedgerBids}>{item.bidCount} bids</Text>
        )}
      </View>
    </Pressable>
  );
});

// ════════════════════════════════════════════════════════════════
// ZONE I: SELLER STUDIO — seller-specific rows
// ════════════════════════════════════════════════════════════════
const SellerStudioRow = memo(function SellerStudioRow({
  item,
  clockMs,
  onPress,
  formatDualPrice,
}: {
  item: AuctionHomeItem;
  clockMs: number;
  onPress: () => void;
  formatDualPrice: FormatDualPrice;
}) {
  const timing = resolveAuctionTiming(item, clockMs);
  const dualPrice = formatDualPrice(item.currentBidGbp || item.startingBidGbp);
  const timeLabel = resolveTimeLabel(timing);
  const a11yLabel = buildAuctionAccessibilityLabel(item, timing, resolvePriceLabel(item, timing), dualPrice.primaryText);
  const stateText = timing.effectiveState === 'live' ? 'Live'
    : timing.effectiveState === 'upcoming' ? 'Scheduled'
    : timing.effectiveState === 'ended' ? 'Ended'
    : '';
  const stateColor = timing.effectiveState === 'live' ? Colors.success
    : timing.effectiveState === 'upcoming' ? Colors.textSecondary
    : Colors.textMuted;

  return (
    <Pressable
      style={styles.sellerStudioRow}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityHint="Opens auction details"
    >
      <View style={styles.sellerStudioImageWrap}>
        {item.imageUrl ? (
          <CachedImage
            uri={item.imageUrl}
            style={styles.sellerStudioImage}
            containerStyle={StyleSheet.absoluteFill}
            contentFit="cover"
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: Colors.surface }]} />
        )}
      </View>
      <View style={styles.sellerStudioBody}>
        <Text style={styles.sellerStudioTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.sellerStudioPrice}>{dualPrice.primaryText}</Text>
      </View>
      <View style={styles.sellerStudioRight}>
        <Text style={[styles.sellerStudioState, { color: stateColor }]}>{stateText}</Text>
        <Text style={styles.sellerStudioBids}>{item.bidCount > 0 ? `${item.bidCount} bids` : 'No bids'}</Text>
        <Text style={styles.sellerStudioTime}>{timeLabel}</Text>
      </View>
    </Pressable>
  );
});

// ════════════════════════════════════════════════════════════════
// ZONE I: SELLER STRIP — compact seller access (not a long feed)
// "Seller Centre · 2 live · 1 scheduled · Manage"
// Full seller inventory belongs in SellerAuctionCentre.
// ════════════════════════════════════════════════════════════════
const SellerStrip = memo(function SellerStrip({
  summary,
  onManage,
}: {
  summary: SellerSummary;
  onManage: () => void;
}) {
  const context = `${summary.liveCount} live · ${summary.scheduledCount} scheduled`;
  return (
    <Pressable
      style={styles.sellerStrip}
      onPress={() => { haptics.tap(); onManage(); }}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={`Seller Centre. ${context}. Manage your auctions.`}
    >
      <View style={styles.sellerStripIconWrap}>
        <Ionicons name="storefront-outline" size={18} color={Colors.brand} />
      </View>
      <View style={styles.sellerStripBody}>
        <Text style={styles.sellerStripTitle} numberOfLines={1}>Seller Centre</Text>
        <Text style={styles.sellerStripContext} numberOfLines={1}>{context}</Text>
      </View>
      <View style={styles.sellerStripManage}>
        <Text style={styles.sellerStripManageText}>Manage</Text>
        <Ionicons name="chevron-forward" size={14} color={Colors.brand} />
      </View>
    </Pressable>
  );
});

// ── Section header ──
const SectionHeader = memo(function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
    </View>
  );
});

// ── Home data shape from /auctions/home ──
interface HomeData {
  attentionItem: AuctionHomeItem | null;
  attentionReason: AttentionReason;
  activity: AuctionHomeActivity;
  closingSoon: AuctionHomeItem[];
  live: AuctionHomeItem[];
  upcoming: AuctionHomeItem[];
  categoryWorlds: CategoryWorld[];
  recentlyClosed: AuctionHomeItem[];
  sellerSummary?: SellerSummary;
  sellerAuctions: AuctionHomeItem[];
  watchlist: AuctionHomeItem[];
  serverNow: string | null;
}

const EMPTY_HOME_DATA: HomeData = {
  attentionItem: null,
  attentionReason: null,
  activity: { activeCount: 0, needsAttentionCount: 0, leadingCount: 0, outbidCount: 0, watchingCount: 0, unresolvedWonCount: 0 },
  closingSoon: [],
  live: [],
  upcoming: [],
  categoryWorlds: [],
  recentlyClosed: [],
  sellerAuctions: [],
  watchlist: [],
  serverNow: null,
};

// ── Main screen: Thryftverse Auction House ──
export default function AuctionHomeScreen() {
  const navigation = useNavigation<NavT>();
  const { currencyCode, displayMode, goldRates } = useFormattedPrice();
  const [homeData, setHomeData] = React.useState<HomeData>(EMPTY_HOME_DATA);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // ── Search overlay ──
  const [searchOverlayVisible, setSearchOverlayVisible] = React.useState(false);
  const [searchState, setSearchState] = React.useState<AuctionSearchState>(IDLE_SEARCH_STATE);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [debouncedQuery, setDebouncedQuery] = React.useState('');
  const [isLoadingMoreSearch, setIsLoadingMoreSearch] = React.useState(false);
  const [paginationError, setPaginationError] = React.useState<string | null>(null);

  // ── Filter result mode ──
  const [filterResult, setFilterResult] = React.useState<{
    status: 'idle' | 'loading' | 'ready' | 'empty' | 'error';
    items: AuctionHomeItem[];
    cursor: string | null;
  }>({ status: 'idle', items: [], cursor: null });
  const [isLoadingMoreFilters, setIsLoadingMoreFilters] = React.useState(false);
  const filterReqIdRef = React.useRef(0);
  const [filterRefreshTick, setFilterRefreshTick] = React.useState(0);

  // ── Filter state ──
  const [filterStatus, setFilterStatus] = useState<'all' | 'live' | 'scheduled' | 'ended'>('all');
  const [filterSort, setFilterSort] = useState<'endingSoon' | 'newest' | 'mostBids' | 'priceLow' | 'priceHigh'>('endingSoon');
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [filterSheetVisible, setFilterSheetVisible] = React.useState(false);

  // ── Draft filter state ──
  const [draftStatus, setDraftStatus] = useState<'all' | 'live' | 'scheduled' | 'ended'>('all');
  const [draftSort, setDraftSort] = useState<'endingSoon' | 'newest' | 'mostBids' | 'priceLow' | 'priceHigh'>('endingSoon');
  const [draftCategory, setDraftCategory] = useState<string | null>(null);

  const isFiltering = filterStatus !== 'all' || !!filterCategory || filterSort !== 'endingSoon';
  const isSearching = searchState.status !== 'idle';

  const openFilterSheet = useCallback(() => {
    setDraftStatus(filterStatus);
    setDraftSort(filterSort);
    setDraftCategory(filterCategory);
    setFilterSheetVisible(true);
  }, [filterStatus, filterSort, filterCategory]);

  const applyDraftFilters = useCallback(() => {
    haptics.tap();
    setFilterStatus(draftStatus);
    setFilterSort(draftSort);
    setFilterCategory(draftCategory);
    setFilterSheetVisible(false);
  }, [draftStatus, draftSort, draftCategory]);

  const resetDraftFilters = useCallback(() => {
    haptics.tap();
    setDraftStatus('all');
    setDraftSort('endingSoon');
    setDraftCategory(null);
  }, []);

  const clearAllFilters = useCallback(() => {
    haptics.tap();
    setFilterStatus('all');
    setFilterSort('endingSoon');
    setFilterCategory(null);
  }, []);

  const { secondClock, minuteClock, resync, needsResync, markResyncFailed, clearResyncFailed } = useBucketedServerClock(homeData.serverNow);

  const requestIdRef = React.useRef(0);

  const fetchHome = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    const reqId = ++requestIdRef.current;
    try {
      const response = await getAuctionHome();
      if (reqId !== requestIdRef.current) return;

      const attentionItem = response.attention.item ? toViewModel(response.attention.item) : null;
      setHomeData({
        attentionItem,
        attentionReason: response.attention.reason,
        activity: response.activity,
        closingSoon: response.closingSoon.map(toViewModel),
        live: response.live.map(toViewModel),
        upcoming: response.upcoming.map(toViewModel),
        categoryWorlds: response.categoryWorlds,
        recentlyClosed: response.recentlyClosed.map(toViewModel),
        sellerSummary: response.sellerSummary,
        sellerAuctions: response.sellerAuctions.map(toViewModel),
        watchlist: response.watchlist.map(toViewModel),
        serverNow: response.serverNow,
      });

      if (response.serverNow) {
        resync(response.serverNow);
        clearResyncFailed();
      }
    } catch (err) {
      if (reqId === requestIdRef.current) {
        const devHint = __DEV__ && err instanceof Error ? err.message : null;
        setError(devHint ? `Unable to load auctions: ${devHint}` : 'Unable to load auctions');
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
    void fetchHome();
  }, [fetchHome]);

  React.useEffect(() => {
    if (needsResync) {
      void fetchHome();
    }
  }, [needsResync, fetchHome]);

  // ── Search ──
  const searchReqIdRef = useRef(0);

  const handleRefresh = React.useCallback(() => {
    setRefreshing(true);
    if (isSearching && debouncedQuery.trim().length > 0) {
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
    } else if (isFiltering) {
      setPaginationError(null);
      setFilterRefreshTick((t) => t + 1);
      void fetchHome().finally(() => setRefreshing(false));
    } else {
      void fetchHome();
    }
  }, [fetchHome, isSearching, debouncedQuery, isFiltering]);

  const handleSearchChange = useCallback((text: string) => {
    searchReqIdRef.current++;
    setSearchQuery(text);
    setDebouncedQuery(text);
    if (text.trim().length === 0) {
      setSearchState(IDLE_SEARCH_STATE);
    } else {
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

  // ── Filter results fetching ──
  React.useEffect(() => {
    if (!isFiltering) {
      setFilterResult({ status: 'idle', items: [], cursor: null });
      return;
    }
    const reqId = ++filterReqIdRef.current;
    setFilterResult({ status: 'loading', items: [], cursor: null });
    const apiStatus = filterStatus === 'all' ? undefined : filterStatus === 'scheduled' ? 'scheduled' : filterStatus;
    listAuctions({
      status: apiStatus as 'live' | 'scheduled' | 'ended' | 'all' | undefined,
      sort: filterSort,
      category: filterCategory ?? undefined,
      limit: 30,
    })
      .then((result) => {
        if (reqId !== filterReqIdRef.current) return;
        const items = result.items.map(toViewModel);
        setFilterResult({
          status: items.length > 0 ? 'ready' : 'empty',
          items,
          cursor: result.nextCursor,
        });
      })
      .catch(() => {
        if (reqId !== filterReqIdRef.current) return;
        setFilterResult({ status: 'error', items: [], cursor: null });
      });
  }, [filterStatus, filterSort, filterCategory, isFiltering, filterRefreshTick]);

  const loadMoreFilters = React.useCallback(async () => {
    if (filterResult.cursor === null || isLoadingMoreFilters) return;
    setIsLoadingMoreFilters(true);
    setPaginationError(null);
    const reqId = ++filterReqIdRef.current;
    try {
      const apiStatus = filterStatus === 'all' ? undefined : filterStatus === 'scheduled' ? 'scheduled' : filterStatus;
      const result = await listAuctions({
        status: apiStatus as 'live' | 'scheduled' | 'ended' | 'all' | undefined,
        sort: filterSort,
        category: filterCategory ?? undefined,
        cursor: filterResult.cursor,
        limit: 30,
      });
      if (reqId !== filterReqIdRef.current) return;
      setFilterResult((prev) => {
        const existingIds = new Set(prev.items.map((a) => a.id));
        const newItems = result.items.map(toViewModel).filter((a) => !existingIds.has(a.id));
        return { ...prev, items: [...prev.items, ...newItems], cursor: result.nextCursor };
      });
    } catch {
      if (reqId === filterReqIdRef.current) {
        setPaginationError('Failed to load more results');
      }
    } finally {
      if (reqId === filterReqIdRef.current) {
        setIsLoadingMoreFilters(false);
      }
    }
  }, [filterResult.cursor, isLoadingMoreFilters, filterStatus, filterSort, filterCategory]);

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

  const handleActivity = useCallback(() => {
    navigation.navigate('MyBids');
  }, [navigation]);

  const handleCategoryPress = useCallback((categoryKey: string) => {
    haptics.tap();
    setFilterCategory(categoryKey);
    setFilterStatus('all');
    setFilterSort('endingSoon');
  }, []);

  // ── 1ZE + local semantic display ──
  const formatDualPrice = useCallback((amountGbp: number): DualPriceResult => {
    const izeAmount = toIze(amountGbp, 'GBP', goldRates);
    const izeText = formatIzeAmount(izeAmount, 4);
    const fiatValue = izeAmount * (goldRates?.[currencyCode] ?? 1);
    const fiatText = formatFiatAmount(fiatValue, currencyCode, 2);
    if (displayMode === 'ize') return { primaryText: izeText, secondaryText: null };
    if (displayMode === 'fiat') return { primaryText: fiatText, secondaryText: izeText };
    return { primaryText: izeText, secondaryText: fiatText };
  }, [goldRates, currencyCode, displayMode]);

  // ── Renderers ──
  const renderClosingSoonItem = useCallback(({ item, index }: { item: AuctionHomeItem; index: number }) => (
    <ClosingSoonCard
      item={item}
      index={index}
      clockMs={secondClock}
      onPress={() => navigateToDetail(item.id)}
      formatDualPrice={formatDualPrice}
    />
  ), [secondClock, navigateToDetail, formatDualPrice]);

  const renderLiveFloorItem = useCallback(({ item }: { item: AuctionHomeItem }) => (
    <LiveFloorCard
      item={item}
      clockMs={secondClock}
      onPress={() => navigateToDetail(item.id)}
      formatDualPrice={formatDualPrice}
    />
  ), [secondClock, navigateToDetail, formatDualPrice]);

  const renderUpcomingDrop = useCallback(({ item }: { item: AuctionHomeItem }) => (
    <UpcomingDropRow
      item={item}
      clockMs={minuteClock}
      onPress={() => navigateToDetail(item.id)}
      formatDualPrice={formatDualPrice}
    />
  ), [minuteClock, navigateToDetail, formatDualPrice]);

  const renderWatchingRailItem = useCallback(({ item }: { item: AuctionHomeItem }) => (
    <WatchingRailCard
      item={item}
      clockMs={secondClock}
      onPress={() => navigateToDetail(item.id)}
      formatDualPrice={formatDualPrice}
    />
  ), [secondClock, navigateToDetail, formatDualPrice]);

  const renderClosedLedgerItem = useCallback(({ item }: { item: AuctionHomeItem }) => (
    <ClosedLedgerRow
      item={item}
      clockMs={minuteClock}
      onPress={() => navigateToDetail(item.id)}
      formatDualPrice={formatDualPrice}
    />
  ), [minuteClock, navigateToDetail, formatDualPrice]);

  const renderSearchItem = useCallback(({ item }: { item: AuctionHomeItem }) => (
    <LiveFloorCard
      item={item}
      clockMs={secondClock}
      onPress={() => navigateToDetail(item.id)}
      formatDualPrice={formatDualPrice}
    />
  ), [secondClock, navigateToDetail, formatDualPrice]);

  const renderFilterItem = useCallback(({ item }: { item: AuctionHomeItem }) => (
    <LiveFloorCard
      item={item}
      clockMs={secondClock}
      onPress={() => navigateToDetail(item.id)}
      formatDualPrice={formatDualPrice}
    />
  ), [secondClock, navigateToDetail, formatDualPrice]);

  // ── Category options for filter sheet ──
  const categoryOptions = useMemo(() => {
    const cats = new Set<string>();
    [...homeData.live, ...homeData.upcoming, ...homeData.recentlyClosed].forEach((a) => {
      if (a.category) cats.add(a.category);
    });
    return Array.from(cats).sort();
  }, [homeData]);

  // ── Active filter chips ──
  const activeFilterChips = useMemo(() => {
    const chips: string[] = [];
    if (filterStatus !== 'all') chips.push(filterStatus);
    if (filterSort !== 'endingSoon') chips.push(filterSort);
    if (filterCategory) chips.push(filterCategory);
    return chips;
  }, [filterStatus, filterSort, filterCategory]);

  const renderLoadingState = useCallback(() => (
    <View style={styles.loadingContainer}>
      <Text style={styles.loadingText}>Loading auctions…</Text>
    </View>
  ), []);

  // ── Derived values and hooks MUST be before any conditional return ──
  // (React hooks-order rule: hooks must execute unconditionally on every render)
  const hasSellerAuctions = homeData.sellerAuctions.length > 0;

  const hasActiveMarket =
    homeData.closingSoon.length > 0 ||
    homeData.live.length > 0 ||
    homeData.upcoming.length > 0;

  const hasPersonalActivity =
    homeData.activity.activeCount > 0 ||
    homeData.activity.needsAttentionCount > 0 ||
    !!homeData.attentionItem;

  const spotlightIds = useMemo(() => {
    const ids = new Set<string>();
    homeData.closingSoon.forEach((a) => ids.add(a.id));
    homeData.live.forEach((a) => ids.add(a.id));
    return ids;
  }, [homeData.closingSoon, homeData.live]);

  const dedupedWatchlist = useMemo(
    () => homeData.watchlist.filter((a) => !spotlightIds.has(a.id)),
    [homeData.watchlist, spotlightIds]
  );

  const hasAnyContent =
    hasActiveMarket ||
    hasPersonalActivity ||
    homeData.recentlyClosed.length > 0 ||
    hasSellerAuctions ||
    homeData.categoryWorlds.length > 0 ||
    dedupedWatchlist.length > 0;

  const liveContext = homeData.closingSoon.length > 0
    ? `${homeData.closingSoon.length} closing soon`
    : homeData.live.length > 0
      ? `${homeData.live.length} live now`
      : homeData.upcoming.length > 0
        ? `${homeData.upcoming.length} upcoming`
        : 'Nothing live or scheduled right now';

  // ════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════

  // ── Search overlay ──
  if (searchOverlayVisible) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.searchOverlayHeader}>
          <Pressable
            onPress={() => { haptics.tap(); setSearchOverlayVisible(false); handleClearSearch(); }}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close search"
          >
            <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
          </Pressable>
          <TextInput
            value={searchQuery}
            onChangeText={handleSearchChange}
            placeholder="Search auctions…"
            autoFocus
            placeholderTextColor={Colors.textMuted}
            style={styles.searchOverlayInput}
          />
          {searchQuery.length > 0 && (
            <Pressable
              onPress={handleClearSearch}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <Ionicons name="close-circle" size={20} color={Colors.textMuted} />
            </Pressable>
          )}
        </View>

        {isSearching ? (
          <FlashList
            data={searchState.items}
            keyExtractor={(item) => item.id}
            renderItem={renderSearchItem}
            numColumns={2}
            ListEmptyComponent={
              searchState.status === 'loading' ? renderLoadingState() : (
                searchState.status === 'error' ? (
                  <EmptyState icon="cloud-offline-outline" title="Search failed" subtitle="Please try again" />
                ) : (
                  <EmptyState icon="search-outline" title="No results" subtitle="Try a different search term" />
                )
              )
            }
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={Colors.brand}
                colors={[Colors.brand]}
                progressBackgroundColor={Colors.surfaceAlt}
              />
            }
            onEndReached={loadMoreSearch}
            onEndReachedThreshold={0.5}
          />
        ) : (
          <View style={styles.searchIdleContainer}>
            <Text style={styles.searchIdleHint}>Search by title, brand, or category</Text>
          </View>
        )}
      </SafeAreaView>
    );
  }

  // ── Filter result mode ──
  if (isFiltering && !isSearching) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.filterResultHeader}>
          <Pressable
            onPress={() => { haptics.tap(); clearAllFilters(); }}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Clear filters and go back"
            style={styles.filterResultBackBtn}
          >
            <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
          </Pressable>
          <View style={styles.filterResultTitleWrap}>
            <Text style={styles.filterResultTitle}>Filtered results</Text>
            <Text style={styles.filterResultCount}>
              {filterResult.status === 'ready' ? `${filterResult.items.length} auctions` : '…'}
            </Text>
          </View>
          <Pressable
            onPress={() => { haptics.tap(); openFilterSheet(); }}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Open filter sheet"
          >
            <Ionicons name="options-outline" size={24} color={Colors.textPrimary} />
          </Pressable>
        </View>

        {activeFilterChips.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterChipsRow}>
            {activeFilterChips.map((chip) => (
              <View key={chip} style={styles.filterChip}>
                <Text style={styles.filterChipText}>{chip}</Text>
              </View>
            ))}
            <Pressable
              onPress={clearAllFilters}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Clear all filters"
              style={styles.filterChipClear}
            >
              <Text style={styles.filterChipClearText}>Clear all</Text>
            </Pressable>
          </ScrollView>
        )}

        {filterResult.status === 'loading' ? renderLoadingState() :
         filterResult.status === 'error' ? (
          <EmptyState icon="cloud-offline-outline" title="Filter failed" subtitle="Please try again" />
         ) : filterResult.status === 'empty' ? (
          <EmptyState icon="filter-outline" title="No matches" subtitle="Try adjusting your filters" />
         ) : (
          <FlashList
            data={filterResult.items}
            keyExtractor={(item) => item.id}
            renderItem={renderFilterItem}
            numColumns={2}
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
            onEndReached={loadMoreFilters}
            onEndReachedThreshold={0.5}
          />
        )}

        {/* Filter sheet */}
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
                  style={[styles.filterOption, draftStatus === opt && styles.filterOptionActive]}
                  onPress={() => { haptics.tap(); setDraftStatus(opt); }}
                >
                  <Text style={[styles.filterOptionText, draftStatus === opt && styles.filterOptionTextActive]}>
                    {opt === 'all' ? 'All' : opt === 'live' ? 'Live' : opt === 'scheduled' ? 'Scheduled' : 'Ended'}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.filterSectionLabel}>Sort</Text>
            <View style={styles.filterOptionRow}>
              {(['endingSoon', 'newest', 'mostBids', 'priceLow', 'priceHigh'] as const).map((opt) => (
                <Pressable
                  key={opt}
                  style={[styles.filterOption, draftSort === opt && styles.filterOptionActive]}
                  onPress={() => { haptics.tap(); setDraftSort(opt); }}
                >
                  <Text style={[styles.filterOptionText, draftSort === opt && styles.filterOptionTextActive]}>
                    {opt === 'endingSoon' ? 'Ending soon' : opt === 'newest' ? 'Newest' : opt === 'mostBids' ? 'Most bids' : opt === 'priceLow' ? 'Price ↑' : 'Price ↓'}
                  </Text>
                </Pressable>
              ))}
            </View>

            {categoryOptions.length > 0 && (
              <>
                <Text style={styles.filterSectionLabel}>Category</Text>
                <View style={styles.filterOptionRow}>
                  <Pressable
                    style={[styles.filterOption, draftCategory === null && styles.filterOptionActive]}
                    onPress={() => { haptics.tap(); setDraftCategory(null); }}
                  >
                    <Text style={[styles.filterOptionText, draftCategory === null && styles.filterOptionTextActive]}>All</Text>
                  </Pressable>
                  {categoryOptions.map((cat) => (
                    <Pressable
                      key={cat}
                      style={[styles.filterOption, draftCategory === cat && styles.filterOptionActive]}
                      onPress={() => { haptics.tap(); setDraftCategory(cat); }}
                    >
                      <Text style={[styles.filterOptionText, draftCategory === cat && styles.filterOptionTextActive]}>{cat}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}

            <View style={styles.filterActionsRow}>
              <Pressable
                style={styles.filterResetBtn}
                onPress={resetDraftFilters}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Reset filters"
              >
                <Text style={styles.filterResetText}>Reset</Text>
              </Pressable>
              <Pressable
                style={styles.filterApplyBtn}
                onPress={applyDraftFilters}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Show results"
              >
                <Text style={styles.filterApplyText}>Show results</Text>
              </Pressable>
            </View>
          </View>
        </BottomSheet>
      </SafeAreaView>
    );
  }

  // ── Default: 9-zone Auction House ──
  if (loading && !homeData.attentionItem) {
    return (
      <View style={[styles.container, { backgroundColor: Colors.background }]}>
        {renderLoadingState()}
      </View>
    );
  }

  if (error && !homeData.attentionItem) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <EmptyState
          icon="cloud-offline-outline"
          title="Unable to load"
          subtitle={__DEV__ && error !== 'Unable to load auctions' ? error : 'Pull to refresh'}
          ctaLabel="Retry"
          onCtaPress={() => void fetchHome()}
        />
      </SafeAreaView>
    );
  }

  // Build zone list for the main ScrollView.
  // Hierarchy: header → actionBanner → market spotlight (closing/live/upcoming)
  // → category → watching → recentlyClosed → sellerStrip → createCta
  type ZoneItem =
    | { zone: 'header' }
    | { zone: 'actionBanner' }
    | { zone: 'closingSoon' }
    | { zone: 'liveFloor' }
    | { zone: 'upcomingDrops' }
    | { zone: 'categoryWorlds' }
    | { zone: 'watching' }
    | { zone: 'recentlyClosed' }
    | { zone: 'sellerStrip' }
    | { zone: 'createCta' };

  const zones: ZoneItem[] = [];
  zones.push({ zone: 'header' });
  if (hasPersonalActivity) zones.push({ zone: 'actionBanner' });
  // Market spotlight order: Closing Soon → Live → Upcoming.
  // Upcoming leads when no Live exists (per acceptance rule 4).
  if (homeData.closingSoon.length > 0) zones.push({ zone: 'closingSoon' });
  if (homeData.live.length > 0) zones.push({ zone: 'liveFloor' });
  if (homeData.categoryWorlds.length > 0) zones.push({ zone: 'categoryWorlds' });
  if (homeData.upcoming.length > 0) zones.push({ zone: 'upcomingDrops' });
  if (dedupedWatchlist.length > 2) zones.push({ zone: 'watching' });
  if (homeData.recentlyClosed.length > 0) zones.push({ zone: 'recentlyClosed' });
  if (hasSellerAuctions && homeData.sellerSummary) zones.push({ zone: 'sellerStrip' });
  // createCta only when there is real content above (so the list is not
  // artificially non-empty and the screen-level empty state can render).
  if (hasAnyContent) zones.push({ zone: 'createCta' });

  // Plain function (not a hook) so it can live after conditional returns.
  const renderZone = ({ item }: { item: ZoneItem }) => {
    switch (item.zone) {
      case 'header':
        return (
          <MarketplaceHeader
            liveContext={liveContext}
            onSearch={() => { haptics.tap(); setSearchOverlayVisible(true); }}
            onFilter={() => { haptics.tap(); openFilterSheet(); }}
            onActivity={() => { haptics.tap(); handleActivity(); }}
            onBack={handleBack}
            showBack={navigation.canGoBack()}
          />
        );

      case 'actionBanner':
        return (
          <View style={styles.actionBannerZone}>
            <PersonalActionBanner
              activity={homeData.activity}
              attentionItem={homeData.attentionItem}
              attentionReason={homeData.attentionReason}
              clockMs={secondClock}
              onPress={handleActivity}
              onDetail={() => homeData.attentionItem && navigateToDetail(homeData.attentionItem.id)}
              formatDualPrice={formatDualPrice}
            />
          </View>
        );

      case 'closingSoon':
        return (
          <View style={styles.zoneWrap}>
            <SectionHeader title="Closing Soon" subtitle="Final minutes" />
            <FlashList
              data={homeData.closingSoon}
              keyExtractor={(a) => a.id}
              renderItem={renderClosingSoonItem}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalRailContent}
              ItemSeparatorComponent={() => <View style={{ width: Space.md }} />}
            />
          </View>
        );

      case 'liveFloor':
        return (
          <View style={styles.zoneWrap}>
            <SectionHeader title="Live Now" subtitle={`${homeData.live.length} active`} />
            <View style={styles.liveGridContainer}>
              {homeData.live.map((item) => (
                <View key={item.id} style={styles.liveGridItem}>
                  <LiveFloorCard
                    item={item}
                    clockMs={secondClock}
                    onPress={() => navigateToDetail(item.id)}
                    formatDualPrice={formatDualPrice}
                  />
                </View>
              ))}
            </View>
          </View>
        );

      case 'categoryWorlds':
        return (
          <View style={styles.zoneWrap}>
            <SectionHeader title="Categories" subtitle="Browse by world" />
            <CategoryMosaic
              worlds={homeData.categoryWorlds.slice(0, 5)}
              onPress={handleCategoryPress}
            />
          </View>
        );

      case 'upcomingDrops':
        return (
          <View style={styles.zoneWrap}>
            <SectionHeader title="Upcoming Auctions" subtitle="Scheduled" />
            <View style={styles.upcomingDropsContainer}>
              {homeData.upcoming.map((item) => (
                <UpcomingDropRow
                  key={item.id}
                  item={item}
                  clockMs={minuteClock}
                  onPress={() => navigateToDetail(item.id)}
                  formatDualPrice={formatDualPrice}
                />
              ))}
            </View>
          </View>
        );

      case 'watching':
        return (
          <View style={styles.zoneWrap}>
            <SectionHeader title="Watching" subtitle="Your tracked auctions" />
            <FlashList
              data={dedupedWatchlist}
              keyExtractor={(a) => a.id}
              renderItem={renderWatchingRailItem}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalRailContent}
              ItemSeparatorComponent={() => <View style={{ width: Space.sm }} />}
            />
          </View>
        );

      case 'recentlyClosed':
        return (
          <View style={styles.zoneWrap}>
            <SectionHeader title="Recently Closed" subtitle="Results" />
            <View style={styles.closedLedgerContainer}>
              {homeData.recentlyClosed.slice(0, 3).map((item) => (
                <ClosedLedgerRow
                  key={item.id}
                  item={item}
                  clockMs={minuteClock}
                  onPress={() => navigateToDetail(item.id)}
                  formatDualPrice={formatDualPrice}
                />
              ))}
            </View>
          </View>
        );

      case 'sellerStrip':
        return homeData.sellerSummary ? (
          <View style={styles.zoneWrap}>
            <SellerStrip
              summary={homeData.sellerSummary}
              onManage={() => { haptics.tap(); navigation.navigate('SellerAuctionCentre'); }}
            />
          </View>
        ) : null;

      case 'createCta':
        return (
          <View style={styles.createCtaZone}>
            <Pressable
              style={styles.createCtaBtn}
              onPress={() => { haptics.tap(); navigation.navigate('CreateAuction'); }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Create a new auction"
            >
              <Ionicons name="add-outline" size={18} color={Colors.textInverse} />
              <Text style={styles.createCtaText}>Create Auction</Text>
            </Pressable>
          </View>
        );

      default:
        return null;
    }
  };

  // ── No-active-market screen-level empty state.
  // Rendered independently so it is never masked by a permanent CTA zone.
  if (!hasActiveMarket && !hasPersonalActivity && !hasAnyContent) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" />
        <MarketplaceHeader
          liveContext="Nothing live or scheduled right now"
          onSearch={() => { haptics.tap(); setSearchOverlayVisible(true); }}
          onFilter={() => { haptics.tap(); openFilterSheet(); }}
          onActivity={() => { haptics.tap(); handleActivity(); }}
          onBack={handleBack}
          showBack={navigation.canGoBack()}
        />
        <ScrollView
          contentContainerStyle={styles.emptyMarketContainer}
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
          <EmptyState
            icon="pricetag-outline"
            title="Nothing live or scheduled right now"
            subtitle="Check back soon or create your own auction"
            ctaLabel="Create Auction"
            onCtaPress={() => { haptics.tap(); navigation.navigate('CreateAuction'); }}
          />
          {homeData.recentlyClosed.length > 0 && (
            <View style={styles.emptyMarketClosedWrap}>
              <SectionHeader title="Recently Closed" subtitle="Results" />
              <View style={styles.closedLedgerContainer}>
                {homeData.recentlyClosed.slice(0, 3).map((item) => (
                  <ClosedLedgerRow
                    key={item.id}
                    item={item}
                    clockMs={minuteClock}
                    onPress={() => navigateToDetail(item.id)}
                    formatDualPrice={formatDualPrice}
                  />
                ))}
              </View>
            </View>
          )}
        </ScrollView>
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
                  style={[styles.filterOption, draftStatus === opt && styles.filterOptionActive]}
                  onPress={() => { haptics.tap(); setDraftStatus(opt); }}
                >
                  <Text style={[styles.filterOptionText, draftStatus === opt && styles.filterOptionTextActive]}>
                    {opt === 'all' ? 'All' : opt === 'live' ? 'Live' : opt === 'scheduled' ? 'Scheduled' : 'Ended'}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.filterSectionLabel}>Sort</Text>
            <View style={styles.filterOptionRow}>
              {(['endingSoon', 'newest', 'mostBids', 'priceLow', 'priceHigh'] as const).map((opt) => (
                <Pressable
                  key={opt}
                  style={[styles.filterOption, draftSort === opt && styles.filterOptionActive]}
                  onPress={() => { haptics.tap(); setDraftSort(opt); }}
                >
                  <Text style={[styles.filterOptionText, draftSort === opt && styles.filterOptionTextActive]}>
                    {opt === 'endingSoon' ? 'Ending soon' : opt === 'newest' ? 'Newest' : opt === 'mostBids' ? 'Most bids' : opt === 'priceLow' ? 'Price ↑' : 'Price ↓'}
                  </Text>
                </Pressable>
              ))}
            </View>

            {categoryOptions.length > 0 && (
              <>
                <Text style={styles.filterSectionLabel}>Category</Text>
                <View style={styles.filterOptionRow}>
                  <Pressable
                    style={[styles.filterOption, draftCategory === null && styles.filterOptionActive]}
                    onPress={() => { haptics.tap(); setDraftCategory(null); }}
                  >
                    <Text style={[styles.filterOptionText, draftCategory === null && styles.filterOptionTextActive]}>All</Text>
                  </Pressable>
                  {categoryOptions.map((cat) => (
                    <Pressable
                      key={cat}
                      style={[styles.filterOption, draftCategory === cat && styles.filterOptionActive]}
                      onPress={() => { haptics.tap(); setDraftCategory(cat); }}
                    >
                      <Text style={[styles.filterOptionText, draftCategory === cat && styles.filterOptionTextActive]}>{cat}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}

            <View style={styles.filterActionsRow}>
              <Pressable
                style={styles.filterResetBtn}
                onPress={resetDraftFilters}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Reset filters"
              >
                <Text style={styles.filterResetText}>Reset</Text>
              </Pressable>
              <Pressable
                style={styles.filterApplyBtn}
                onPress={applyDraftFilters}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Show results"
              >
                <Text style={styles.filterApplyText}>Show results</Text>
              </Pressable>
            </View>
          </View>
        </BottomSheet>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <ScrollView
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
      >
        {zones.length === 0 ? (
          <EmptyState
            icon="pricetag-outline"
            title="Nothing live or scheduled right now"
            subtitle="Check back soon or create your own"
            ctaLabel="Create Auction"
            onCtaPress={() => { haptics.tap(); navigation.navigate('CreateAuction'); }}
          />
        ) : (
          zones.map((item, index) => (
            <View key={`${item.zone}-${index}`}>
              {renderZone({ item })}
            </View>
          ))
        )}
      </ScrollView>
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
                style={[styles.filterOption, draftStatus === opt && styles.filterOptionActive]}
                onPress={() => { haptics.tap(); setDraftStatus(opt); }}
              >
                <Text style={[styles.filterOptionText, draftStatus === opt && styles.filterOptionTextActive]}>
                  {opt === 'all' ? 'All' : opt === 'live' ? 'Live' : opt === 'scheduled' ? 'Scheduled' : 'Ended'}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.filterSectionLabel}>Sort</Text>
          <View style={styles.filterOptionRow}>
            {(['endingSoon', 'newest', 'mostBids', 'priceLow', 'priceHigh'] as const).map((opt) => (
              <Pressable
                key={opt}
                style={[styles.filterOption, draftSort === opt && styles.filterOptionActive]}
                onPress={() => { haptics.tap(); setDraftSort(opt); }}
              >
                <Text style={[styles.filterOptionText, draftSort === opt && styles.filterOptionTextActive]}>
                  {opt === 'endingSoon' ? 'Ending soon' : opt === 'newest' ? 'Newest' : opt === 'mostBids' ? 'Most bids' : opt === 'priceLow' ? 'Price ↑' : 'Price ↓'}
                </Text>
              </Pressable>
            ))}
          </View>

          {categoryOptions.length > 0 && (
            <>
              <Text style={styles.filterSectionLabel}>Category</Text>
              <View style={styles.filterOptionRow}>
                <Pressable
                  style={[styles.filterOption, draftCategory === null && styles.filterOptionActive]}
                  onPress={() => { haptics.tap(); setDraftCategory(null); }}
                >
                  <Text style={[styles.filterOptionText, draftCategory === null && styles.filterOptionTextActive]}>All</Text>
                </Pressable>
                {categoryOptions.map((cat) => (
                  <Pressable
                    key={cat}
                    style={[styles.filterOption, draftCategory === cat && styles.filterOptionActive]}
                    onPress={() => { haptics.tap(); setDraftCategory(cat); }}
                  >
                    <Text style={[styles.filterOptionText, draftCategory === cat && styles.filterOptionTextActive]}>{cat}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          <View style={styles.filterActionsRow}>
            <Pressable
              style={styles.filterResetBtn}
              onPress={resetDraftFilters}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Reset filters"
            >
              <Text style={styles.filterResetText}>Reset</Text>
            </Pressable>
            <Pressable
              style={styles.filterApplyBtn}
              onPress={applyDraftFilters}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Show results"
            >
              <Text style={styles.filterApplyText}>Show results</Text>
            </Pressable>
          </View>
        </View>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  contentContainer: {
    paddingBottom: Space.xxl,
  },

  // ── Zone wrapper ──
  zoneWrap: {
    paddingHorizontal: Space.md,
    marginTop: Space.lg,
  },

  // ── Loading ──
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Space.xxl,
  },
  loadingText: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontFamily: Typography.family.regular,
  },

  // ── Section header ──
  sectionHeader: {
    marginBottom: Space.sm,
  },
  sectionTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
    letterSpacing: -0.4,
    color: Colors.textPrimary,
    fontFamily: Typography.family.semibold,
  },
  sectionSubtitle: {
    fontSize: 12,
    lineHeight: 16,
    color: Colors.textSecondary,
    fontFamily: Typography.family.regular,
    marginTop: 2,
  },

  // ════════════════════════════════════════════════════════════════
  // ZONE A: MARKETPLACE HEADER — compact native lobby header (56-88pt)
  // ════════════════════════════════════════════════════════════════
  marketHeader: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.sm,
    backgroundColor: Colors.background,
  },
  marketHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    minHeight: 44,
  },
  marketHeaderTitleWrap: {
    flex: 1,
  },
  marketHeaderTitle: {
    fontSize: 22,
    lineHeight: 26,
    fontWeight: '700',
    letterSpacing: -0.5,
    color: Colors.textPrimary,
    fontFamily: Typography.family.bold,
  },
  marketHeaderContext: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontFamily: Typography.family.regular,
    marginTop: 1,
  },
  marketHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  marketHeaderIconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },

  // ════════════════════════════════════════════════════════════════
  // ZONE B: PERSONAL ACTION BANNER — compact action layer (64-92pt)
  // ════════════════════════════════════════════════════════════════
  actionBannerZone: {
    paddingHorizontal: Space.md,
    marginTop: Space.sm,
  },
  actionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: 12,
    paddingHorizontal: Space.md,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: 64,
    maxHeight: 92,
  },
  actionBannerUrgent: {
    borderColor: Colors.danger,
    backgroundColor: Colors.surfaceAlt,
  },
  actionBannerCalm: {
    borderColor: Colors.success,
    backgroundColor: Colors.surfaceAlt,
  },
  actionBannerWon: {
    borderColor: Colors.brand,
    backgroundColor: Colors.surfaceAlt,
  },
  actionBannerThumbContainer: {
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  actionBannerThumb: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
  },
  actionBannerBody: {
    flex: 1,
  },
  actionBannerTitle: {
    fontSize: 15,
    fontWeight: '600',
    fontFamily: Typography.family.semibold,
    marginBottom: 2,
  },
  actionBannerSummary: {
    fontSize: 14,
    color: Colors.textPrimary,
    fontFamily: Typography.family.medium,
  },
  actionBannerMeta: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontFamily: Typography.family.regular,
  },
  actionBannerCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  actionBannerCtaText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
    fontFamily: Typography.family.semibold,
  },

  // ════════════════════════════════════════════════════════════════
  // ZONE C: CLOSING SOON PROGRAMME
  // ════════════════════════════════════════════════════════════════
  closingSoonCard: {
    width: CLOSING_SOON_CARD_WIDTH,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
  },
  closingSoonImageWrap: {
    width: '100%',
    height: 280,
    position: 'relative',
  },
  closingSoonImage: {
    width: '100%',
    height: 280,
  },
  closingSoonGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  closingSoonSequenceWrap: {
    position: 'absolute',
    top: Space.sm,
    left: Space.sm,
    zIndex: 5,
  },
  closingSoonSequence: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -1,
    color: 'rgba(255,255,255,0.5)',
    fontFamily: Typography.family.extrabold,
  },
  closingSoonCountdownWrap: {
    position: 'absolute',
    top: Space.sm,
    right: Space.sm,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    zIndex: 5,
  },
  closingSoonCountdown: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
    fontFamily: Typography.family.semibold,
    fontVariant: ['tabular-nums'],
  },
  closingSoonBody: {
    padding: Space.md,
  },
  closingSoonEyebrow: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1,
    color: Colors.textSecondary,
    fontFamily: Typography.family.semibold,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  closingSoonTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
    color: Colors.textPrimary,
    fontFamily: Typography.family.semibold,
    marginBottom: 6,
  },
  closingSoonPriceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Space.xs,
    marginBottom: 2,
  },
  closingSoonPrice: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
    color: Colors.textPrimary,
    fontFamily: Typography.family.bold,
  },
  closingSoonPriceSecondary: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontFamily: Typography.family.regular,
  },
  closingSoonBids: {
    fontSize: 12,
    color: Colors.textMuted,
    fontFamily: Typography.family.regular,
  },

  // ════════════════════════════════════════════════════════════════
  // ZONE D: LIVE AUCTION FLOOR
  // ════════════════════════════════════════════════════════════════
  liveFloorCard: {
    flex: 1,
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
    marginHorizontal: Space.xs,
  },
  liveGridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -Space.xs,
  },
  liveGridItem: {
    width: '50%',
    marginBottom: Space.md,
  },
  liveFloorImageWrap: {
    width: '100%',
    height: 200,
    position: 'relative',
  },
  liveFloorImage: {
    width: '100%',
    height: 200,
  },
  liveFloorGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  liveFloorLiveBadge: {
    position: 'absolute',
    top: Space.sm,
    left: Space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
    zIndex: 5,
  },
  liveFloorLiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.success,
  },
  liveFloorLiveText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: '#FFFFFF',
    fontFamily: Typography.family.bold,
  },
  liveFloorUrgencyBadge: {
    position: 'absolute',
    top: Space.sm,
    right: Space.sm,
    backgroundColor: Colors.danger,
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
    zIndex: 5,
  },
  liveFloorUrgencyText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFFFFF',
    fontFamily: Typography.family.semibold,
    fontVariant: ['tabular-nums'],
  },
  liveFloorBody: {
    padding: Space.sm,
  },
  liveFloorTitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    color: Colors.textPrimary,
    fontFamily: Typography.family.semibold,
    marginBottom: 4,
  },
  liveFloorPrice: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
    color: Colors.textPrimary,
    fontFamily: Typography.family.bold,
    marginBottom: 2,
  },
  liveFloorPriceSecondary: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontFamily: Typography.family.regular,
    marginBottom: 4,
  },
  liveFloorMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  liveFloorBids: {
    fontSize: 11,
    color: Colors.textMuted,
    fontFamily: Typography.family.regular,
  },
  liveFloorTime: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontFamily: Typography.family.medium,
  },

  // ════════════════════════════════════════════════════════════════
  // ZONE E: CATEGORY WORLDS — compact editorial mosaic
  // ════════════════════════════════════════════════════════════════
  categoryMosaicContainer: {
    gap: Space.sm,
  },
  categoryMosaicRow: {
    flexDirection: 'row',
    gap: Space.sm,
  },
  categoryMosaicSecondaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm,
  },
  categoryTile: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceAlt,
  },
  categoryTileFeatured: {
    width: '100%',
    height: 200,
  },
  categoryTileSecondary: {
    flex: 1,
    minWidth: (SCREEN_WIDTH - Space.md * 2 - Space.sm) / 2,
    maxWidth: (SCREEN_WIDTH - Space.md * 2 - Space.sm) / 2,
    height: 120,
  },
  categoryTileOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: Space.md,
  },
  categoryTileName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: Typography.family.bold,
  },
  categoryTileNameFeatured: {
    fontSize: 20,
  },
  categoryTileCount: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.75)',
    fontFamily: Typography.family.medium,
    marginTop: 2,
  },

  // ════════════════════════════════════════════════════════════════
  // ZONE F: UPCOMING DROPS
  // ════════════════════════════════════════════════════════════════
  upcomingDropsContainer: {
    gap: Space.sm,
  },
  upcomingDropRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingVertical: Space.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  upcomingDropImageWrap: {
    width: 64,
    height: 64,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  upcomingDropImage: {
    width: 64,
    height: 64,
  },
  upcomingDropBody: {
    flex: 1,
  },
  upcomingDropDate: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.8,
    color: Colors.textSecondary,
    fontFamily: Typography.family.semibold,
    marginBottom: 3,
  },
  upcomingDropEyebrow: {
    fontSize: 11,
    color: Colors.textMuted,
    fontFamily: Typography.family.regular,
    marginBottom: 2,
  },
  upcomingDropTitle: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '600',
    color: Colors.textPrimary,
    fontFamily: Typography.family.semibold,
    marginBottom: 2,
  },
  upcomingDropPrice: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontFamily: Typography.family.medium,
  },
  upcomingDropNotify: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ════════════════════════════════════════════════════════════════
  // ZONE G: WATCHING CONTINUITY
  // ════════════════════════════════════════════════════════════════
  watchingRailCard: {
    width: 120,
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
  },
  watchingRailImageWrap: {
    width: '100%',
    height: 120,
  },
  watchingRailImage: {
    width: '100%',
    height: 120,
  },
  watchingRailBody: {
    padding: Space.sm,
  },
  watchingRailTitle: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
    fontFamily: Typography.family.semibold,
    marginBottom: 2,
  },
  watchingRailState: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.textSecondary,
    fontFamily: Typography.family.semibold,
    marginBottom: 4,
  },
  watchingRailPrice: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
    fontFamily: Typography.family.bold,
    marginBottom: 2,
  },
  watchingRailTime: {
    fontSize: 10,
    color: Colors.textMuted,
    fontFamily: Typography.family.regular,
  },

  // ════════════════════════════════════════════════════════════════
  // ZONE H: RECENTLY CLOSED
  // ════════════════════════════════════════════════════════════════
  closedLedgerContainer: {
    gap: 0,
  },
  closedLedgerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingVertical: Space.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  closedLedgerImageWrap: {
    width: 48,
    height: 48,
    borderRadius: Radius.sm,
    overflow: 'hidden',
  },
  closedLedgerImage: {
    width: 48,
    height: 48,
  },
  closedLedgerBody: {
    flex: 1,
  },
  closedLedgerTitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    color: Colors.textPrimary,
    fontFamily: Typography.family.medium,
    marginBottom: 2,
  },
  closedLedgerPrice: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontFamily: Typography.family.regular,
  },
  closedLedgerRight: {
    alignItems: 'flex-end',
  },
  closedLedgerResult: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: Typography.family.semibold,
    marginBottom: 2,
  },
  closedLedgerBids: {
    fontSize: 11,
    color: Colors.textMuted,
    fontFamily: Typography.family.regular,
  },

  // ════════════════════════════════════════════════════════════════
  // ZONE I: SELLER STUDIO
  // ════════════════════════════════════════════════════════════════
  sellerStudioHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Space.sm,
  },
  sellerStudioSummary: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontFamily: Typography.family.regular,
    marginTop: 2,
  },
  sellerStudioManageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: Space.sm,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sellerStudioManageText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.brand,
    fontFamily: Typography.family.semibold,
  },
  sellerStudioContainer: {
    gap: 0,
  },
  sellerStudioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingVertical: Space.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  sellerStudioImageWrap: {
    width: 48,
    height: 48,
    borderRadius: Radius.sm,
    overflow: 'hidden',
  },
  sellerStudioImage: {
    width: 48,
    height: 48,
  },
  sellerStudioBody: {
    flex: 1,
  },
  sellerStudioTitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    color: Colors.textPrimary,
    fontFamily: Typography.family.medium,
    marginBottom: 2,
  },
  sellerStudioPrice: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontFamily: Typography.family.regular,
  },
  sellerStudioRight: {
    alignItems: 'flex-end',
  },
  sellerStudioState: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: Typography.family.semibold,
    marginBottom: 2,
  },
  sellerStudioBids: {
    fontSize: 11,
    color: Colors.textMuted,
    fontFamily: Typography.family.regular,
    marginBottom: 2,
  },
  sellerStudioTime: {
    fontSize: 10,
    color: Colors.textMuted,
    fontFamily: Typography.family.regular,
  },

  // ════════════════════════════════════════════════════════════════
  // ZONE I: SELLER STRIP — compact seller access
  // ════════════════════════════════════════════════════════════════
  sellerStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: 14,
    paddingHorizontal: Space.md,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sellerStripIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sellerStripBody: {
    flex: 1,
  },
  sellerStripTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
    fontFamily: Typography.family.semibold,
    marginBottom: 2,
  },
  sellerStripContext: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontFamily: Typography.family.regular,
  },
  sellerStripManage: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  sellerStripManageText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.brand,
    fontFamily: Typography.family.semibold,
  },

  // ── No-active-market empty state ──
  emptyMarketContainer: {
    flexGrow: 1,
    paddingBottom: Space.xxl,
  },
  emptyMarketClosedWrap: {
    marginTop: Space.xl,
    paddingHorizontal: Space.md,
  },

  // ── Create CTA ──
  createCtaZone: {
    paddingHorizontal: Space.md,
    marginTop: Space.xl,
    marginBottom: Space.lg,
  },
  createCtaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs,
    paddingVertical: 14,
    borderRadius: Radius.full,
    backgroundColor: Colors.brand,
  },
  createCtaText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textInverse,
    fontFamily: Typography.family.semibold,
  },

  // ── Horizontal rail content ──
  horizontalRailContent: {
    paddingHorizontal: Space.md,
  },

  // ── Search overlay ──
  searchOverlayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  searchOverlayInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Space.md,
    paddingVertical: 10,
    fontSize: 15,
    color: Colors.textPrimary,
    fontFamily: Typography.family.medium,
    backgroundColor: Colors.surfaceAlt,
  },
  searchIdleContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.xl,
  },
  searchIdleHint: {
    fontSize: 14,
    color: Colors.textMuted,
    fontFamily: Typography.family.regular,
    textAlign: 'center',
  },

  // ── Filter result mode ──
  filterResultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  filterResultBackBtn: {
    padding: Space.xs,
  },
  filterResultTitleWrap: {
    flex: 1,
  },
  filterResultTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.textPrimary,
    fontFamily: Typography.family.bold,
  },
  filterResultCount: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontFamily: Typography.family.regular,
    marginTop: 2,
  },
  filterChipsRow: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  filterChip: {
    paddingVertical: 4,
    paddingHorizontal: Space.sm,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    marginRight: Space.xs,
  },
  filterChipText: {
    fontSize: 12,
    color: Colors.textPrimary,
    fontFamily: Typography.family.medium,
  },
  filterChipClear: {
    paddingVertical: 4,
    paddingHorizontal: Space.sm,
    marginRight: Space.xs,
  },
  filterChipClearText: {
    fontSize: 12,
    color: Colors.danger,
    fontFamily: Typography.family.medium,
  },

  // ── Filter sheet ──
  filterSheetContent: {
    padding: Space.lg,
  },
  filterSheetTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textPrimary,
    fontFamily: Typography.family.bold,
    marginBottom: Space.lg,
  },
  filterSectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
    color: Colors.textSecondary,
    fontFamily: Typography.family.semibold,
    textTransform: 'uppercase',
    marginBottom: Space.sm,
    marginTop: Space.md,
  },
  filterOptionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm,
  },
  filterOption: {
    paddingVertical: 8,
    paddingHorizontal: Space.md,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterOptionActive: {
    backgroundColor: Colors.brand,
    borderColor: Colors.brand,
  },
  filterOptionText: {
    fontSize: 13,
    color: Colors.textPrimary,
    fontFamily: Typography.family.medium,
  },
  filterOptionTextActive: {
    color: Colors.textInverse,
  },
  filterActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Space.xl,
  },
  filterResetBtn: {
    paddingVertical: 10,
    paddingHorizontal: Space.lg,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterResetText: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontFamily: Typography.family.medium,
  },
  filterApplyBtn: {
    flex: 1,
    paddingVertical: Space.sm,
    borderRadius: Radius.md,
    backgroundColor: Colors.brand,
    alignItems: 'center',
    marginLeft: Space.md,
  },
  filterApplyText: {
    fontSize: 14,
    color: Colors.textInverse,
    fontFamily: Typography.family.semibold,
  },
});

