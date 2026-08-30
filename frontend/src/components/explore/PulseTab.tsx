import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';
import { useAppTheme } from '../../theme/ThemeContext';
import type { ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, Typography } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { useStore } from '../../store/useStore';
import { useBackendData } from '../../context/BackendDataContext';
import { useScrollToTop } from '@react-navigation/native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import { useHaptic } from '../../hooks/useHaptic';
import { useFormattedPrice } from '../../hooks/useFormattedPrice';
import { useToast } from '../../context/ToastContext';
import { EmptyState } from '../EmptyState';
import { formatCountdown } from '../../data/tradeHub';
import { DiscoverySectionHeader } from '../discover/DiscoverySectionHeader';
import { HorizontalRail } from '../HorizontalRail';
import { fetchTrendingListings, type TrendingListing } from '../../services/marketApi';
import { openProductDetail } from '../../platform/product/openProductDetail';

type NavT = NativeStackNavigationProp<RootStackParamList>;

/* ── Activity item types ── */
type ActivityType = 'auction_live' | 'fresh_drop' | 'price_drop';

interface ActivityItem {
  id: string;
  type: ActivityType;
  title: string;
  subtitle: string;
  image: string;
  meta: string;
  metaAccent?: boolean;
  actionLabel?: string;
  routeId?: string;
}

interface LiveAuctionItem {
  id: string;
  title: string;
  image: string;
  currentBid: number;
  endsAtMs: number;
  listingId: string;
}

/* ── Trending rail item (merged from EditTab) ── */
function TrendingRailItem({ item, onPress, styles, formatPrice }: { item: { id: string; title: string; brand: string; price: number; image: string }; onPress: () => void; styles: ReturnType<typeof createStyles>; formatPrice: (n: number) => string }) {
  return (
    <AnimatedPressable style={styles.trendingItem} onPress={onPress} activeOpacity={0.92}>
      <CachedImage uri={item.image} style={styles.trendingImage} containerStyle={{ borderRadius: Radius.md }} contentFit="cover" />
      <Text style={styles.trendingBrand} numberOfLines={1}>{item.brand}</Text>
      <Text style={styles.trendingTitle} numberOfLines={1}>{item.title}</Text>
      <Text style={styles.trendingPrice}>{formatPrice(item.price)}</Text>
    </AnimatedPressable>
  );
}

/* ── Sub-components ── */
function LiveNowCard({ auction, now, onPress, styles, formatPrice }: { auction: LiveAuctionItem; now: number; onPress: () => void; styles: ReturnType<typeof createStyles>; formatPrice: (n: number) => string }) {
  const countdown = formatCountdown(Math.max(0, auction.endsAtMs - now));
  return (
    <AnimatedPressable style={styles.liveCard} onPress={onPress} activeOpacity={0.92}>
      <CachedImage uri={auction.image} style={styles.liveImage} containerStyle={{ borderRadius: Radius.md }} contentFit="cover" />
      <View style={styles.liveContent}>
        <Text style={styles.liveTitle} numberOfLines={1}>{auction.title}</Text>
        <Text style={styles.liveBid}>Current bid · {formatPrice(auction.currentBid)}</Text>
        <Text style={styles.liveText}>{countdown}</Text>
      </View>
    </AnimatedPressable>
  );
}

function ActivityCard({ item, onPress, colors, styles, formatPrice }: { item: ActivityItem; onPress: () => void; colors: ThemeColors; styles: ReturnType<typeof createStyles>; formatPrice: (n: number) => string }) {
  const iconMap: Record<ActivityType, React.ComponentProps<typeof Ionicons>['name']> = {
    auction_live: 'flame-outline',
    fresh_drop: 'cube-outline',
    price_drop: 'trending-down-outline' };
  const accentMap: Record<ActivityType, string> = {
    auction_live: colors.danger,
    fresh_drop: colors.brand,
    price_drop: colors.warning };

  return (
    <AnimatedPressable style={styles.activityCard} onPress={onPress} activeOpacity={0.92}>
      <CachedImage uri={item.image} style={styles.activityImage} containerStyle={{ borderRadius: Radius.md }} contentFit="cover" />
      <View style={styles.activityContent}>
        <View style={styles.activityHeader}>
          <Ionicons name={iconMap[item.type]} size={14} color={accentMap[item.type]} />
          <Text style={[styles.activityTypeLabel, { color: accentMap[item.type] }]}>
            {item.type === 'auction_live' ? 'Auction in progress'
              : item.type === 'fresh_drop' ? 'FRESH DROP'
                  : 'PRICE DROP'}
          </Text>
        </View>
        <Text style={styles.activityTitle} numberOfLines={2}>{item.title}</Text>
        <Text style={styles.activitySubtitle} numberOfLines={1}>{item.subtitle}</Text>
        <Text style={[styles.activityMeta, item.metaAccent && styles.activityMetaAccent]} numberOfLines={1}>{item.meta}</Text>
      </View>
      {item.actionLabel && (
        <View style={styles.activityAction}>
          <Text style={styles.activityActionText}>{item.actionLabel}</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.brand} />
        </View>
      )}
    </AnimatedPressable>
  );
}

/* ── Main Tab ── */
export default function PulseTab() {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<NavT>();
  const haptic = useHaptic();
  const { show } = useToast();
  const { listings } = useBackendData();
  const { formatFromFiat, currencyCode } = useFormattedPrice();
  const formatPrice = React.useCallback((n: number) => formatFromFiat(n, currencyCode, { displayMode: 'fiat' }), [formatFromFiat, currencyCode]);
  const customAuctions = useStore((state) => state.customAuctions);
  const auctionRuntime = useStore((state) => state.auctionRuntime);

  // Trending state (merged from EditTab to preserve trending rail + style quiz)
  const [trending, setTrending] = React.useState<TrendingListing[]>([]);
  const [trendingLoading, setTrendingLoading] = React.useState(true);
  const [trendingWindow, setTrendingWindow] = React.useState<'24h' | '7d' | '30d'>('24h');

  React.useEffect(() => {
    let cancelled = false;
    setTrendingLoading(true);
    fetchTrendingListings({ window: trendingWindow, limit: 20 })
      .then((items) => { if (!cancelled) setTrending(items); })
      .catch(() => { if (!cancelled) setTrending([]); })
      .finally(() => { if (!cancelled) setTrendingLoading(false); });
    return () => { cancelled = true; };
  }, [trendingWindow]);

  const trendingListings = React.useMemo(() => {
    if (trending.length > 0) {
      return trending.map((t) => ({
        id: t.id,
        title: t.title,
        brand: t.brand ?? '',
        price: t.priceGbp,
        image: t.images[0] ?? t.imageUrl ?? '' }));
    }
    // Fallback to client-side sorting when backend returns no data
    return [...listings]
      .filter((l) => l.images && l.images.length > 0)
      .sort((a, b) => (b.views ?? 0) - (a.views ?? 0))
      .slice(0, 10)
      .map((l) => ({
        id: l.id,
        title: l.title,
        brand: l.brand ?? '',
        price: l.price,
        image: l.images[0] ?? '' }));
  }, [trending, listings]);

  const [now, setNow] = useState(() => Date.now());
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);

  const liveAuctions = useMemo<LiveAuctionItem[]>(() => {
    return customAuctions
      .filter((a) => {
        const endsAtMs = new Date(a.endsAt).getTime();
        const isLive = now >= new Date(a.startsAt).getTime() && now < endsAtMs;
        return isLive;
      })
      .map((a) => ({
        id: a.id,
        title: a.title,
        image: a.image,
        currentBid: a.currentBid,
        endsAtMs: new Date(a.endsAt).getTime(),
        listingId: a.listingId }));
  }, [customAuctions, now]);

  // Tick the clock every second only while there are live auctions, so idle
  // renders don't fire and countdown text stays accurate without Date.now()
  // being recomputed during render.
  useEffect(() => {
    if (liveAuctions.length === 0) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [liveAuctions.length]);

  const activities = useMemo<ActivityItem[]>(() => {
    const items: ActivityItem[] = [];

    customAuctions.forEach((a) => {
      const endsAtMs = new Date(a.endsAt).getTime();
      const isLive = now >= new Date(a.startsAt).getTime() && now < endsAtMs;
      if (isLive) {
        items.push({
          id: `auction_${a.id}`, type: 'auction_live',
          title: a.title, subtitle: `Current bid · ${formatPrice(a.currentBid)}`,
          image: a.image, meta: formatCountdown(Math.max(0, endsAtMs - now)),
          metaAccent: true, actionLabel: 'Bid', routeId: a.listingId });
      }
    });

    const recent = [...listings]
      .sort((a, b) => { const da = a.createdAt ? Date.parse(a.createdAt) : 0; const db = b.createdAt ? Date.parse(b.createdAt) : 0; return db - da; })
      .slice(0, 6);
    recent.forEach((l) => {
      items.push({ id: `drop_${l.id}`, type: 'fresh_drop', title: l.title ?? 'New Listing', subtitle: l.brand ?? 'ThryftVerse', image: l.images?.[0] ?? '', meta: formatPrice(l.price), routeId: l.id });
    });

    listings.filter((l) => l.originalPrice && l.originalPrice > l.price)
      .sort((a, b) => (b.originalPrice! - b.price) / b.originalPrice! - (a.originalPrice! - a.price) / a.originalPrice!)
      .slice(0, 6)
      .forEach((l) => {
      const dropPct = Math.round(((l.originalPrice! - l.price) / l.originalPrice!) * 100);
      items.push({ id: `drop_${l.id}_price`, type: 'price_drop', title: l.title ?? 'Item', subtitle: l.brand ?? 'ThryftVerse', image: l.images?.[0] ?? '', meta: `Down ${dropPct}% · Now ${formatPrice(l.price)}`, metaAccent: true, actionLabel: 'View', routeId: l.id });
    });

    return items.slice(0, 14);
  }, [customAuctions, auctionRuntime, listings, now, formatPrice]);

  const handleActivityPress = (item: ActivityItem) => {
    haptic.light();
    if (!item.routeId) return;
    if (item.type === 'auction_live') {
      openProductDetail(navigation, { referenceKind: 'auction', canonicalId: item.routeId, sourceSurface: 'Pulse' });
    } else {
      openProductDetail(navigation, { referenceKind: 'listing', canonicalId: item.routeId, sourceSurface: 'Pulse' });
    }
  };

  const handleViewAll = () => {
    haptic.light();
    navigation.navigate('PulseFeed');
  };

  if (activities.length === 0 && liveAuctions.length === 0 && trendingListings.length === 0) {
    return (
      <EmptyState
        icon="pulse-outline"
        title="The marketplace is quiet"
        subtitle="Check back soon for live auctions, fresh drops, and recent sales."
        ctaLabel="Browse All"
        onCtaPress={() => navigation.navigate('Browse', { categoryId: 'all', title: 'Browse' })}
      />
    );
  }

  return (
    <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
      {/* Trending Now Rail (merged from EditTab) */}
      {trendingListings.length > 0 && (
        <View>
          <DiscoverySectionHeader
            title="Popular this week"
            actionLabel="See all"
            onAction={() => navigation.navigate('Browse', { categoryId: 'all', title: 'Trending' })}
          />
          <HorizontalRail contentContainerStyle={styles.trendingScroll}>
            {trendingListings.map((item) => (
              <TrendingRailItem
                key={item.id}
                item={item}
                onPress={() => { haptic.light(); openProductDetail(navigation, { referenceKind: 'listing', canonicalId: item.id, sourceSurface: 'Pulse' }); }}
                styles={styles}
                formatPrice={formatPrice}
              />
            ))}
          </HorizontalRail>
          {/* Window tabs below the first rail so the first viewport shows
              media, not chrome (audit §3.4, §4.5). */}
          <View style={styles.windowTabs}>
            {(['24h', '7d', '30d'] as const).map((w) => {
              const isActive = trendingWindow === w;
              return (
                <AnimatedPressable
                  key={w}
                  style={[styles.windowTab, isActive && styles.windowTabActive]}
                  onPress={() => { haptic.selection(); setTrendingWindow(w); }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.windowTabText, isActive && styles.windowTabTextActive]}>
                    {w === '24h' ? '24 hours' : w === '7d' ? '7 days' : '30 days'}
                  </Text>
                </AnimatedPressable>
              );
            })}
          </View>
        </View>
      )}

      {/* Live Now Rail */}
      {liveAuctions.length > 0 && (
        <View>
          <DiscoverySectionHeader
            title="Live Now"
            actionLabel="View all"
            onAction={handleViewAll}
          />
          <HorizontalRail contentContainerStyle={styles.liveScroll}>
            {liveAuctions.map((auction) => (
              <LiveNowCard
                key={auction.id}
                auction={auction}
                now={now}
                onPress={() => { haptic.light(); openProductDetail(navigation, { referenceKind: 'auction', canonicalId: auction.id, sourceSurface: 'Pulse' }); }}
                styles={styles}
                formatPrice={formatPrice}
              />
            ))}
          </HorizontalRail>
        </View>
      )}

      {/* Activity feed */}
      <View style={{ marginTop: Space.lg }}>
        <DiscoverySectionHeader
          title="Live Feed"
          actionLabel="View all"
          onAction={handleViewAll}
        />
        {activities.map((item) => (
          <ActivityCard key={item.id} item={item} onPress={() => handleActivityPress(item)} colors={colors} styles={styles} formatPrice={formatPrice} />
        ))}
      </View>

      {/* Style Quiz (merged from EditTab) */}
      <View style={{ marginTop: Space.lg }}>
        <DiscoverySectionHeader
          title="Find Your Aesthetic"
        />
        <AnimatedPressable style={styles.quizCard} onPress={() => navigation.navigate('StyleQuiz')} activeOpacity={0.92} accessibilityRole="button" accessibilityLabel="Take the style quiz">
          <Ionicons name="color-palette-outline" size={22} color={colors.brand} aria-hidden={true} />
          <Text style={styles.quizActionText}>Take the style quiz</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} aria-hidden={true} />
        </AnimatedPressable>
      </View>

      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  scrollContent: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.xl },

  /* Live Now Rail */
  liveScroll: {
    paddingHorizontal: Space.md,
    marginHorizontal: -Space.md,
    gap: Space.sm },
  liveCard: {
    width: 150,
    gap: Space.sm },
  liveImage: {
    width: '100%',
    height: 120,
    borderRadius: Radius.md,
    backgroundColor: colors.surfaceAlt },
  liveContent: {
    gap: 3 },
  liveTitle: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textPrimary,
    letterSpacing: TypographyV2.meta.letterSpacing },
  liveBid: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textSecondary,
    letterSpacing: TypographyV2.meta.letterSpacing,
    fontVariant: ['tabular-nums'] },
  liveText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: Typography.family.semibold,
    color: colors.warning,
    fontVariant: ['tabular-nums'],
    marginTop: Space.xs },

  /* Activity */
  activityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Space.md,
    gap: Space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border },
  activityImage: {
    width: 80,
    height: 80,
    borderRadius: Radius.md,
    backgroundColor: colors.surfaceAlt },
  activityContent: {
    flex: 1,
    gap: 4 },
  activityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6 },
  activityTypeLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: 0.8 },
  activityTitle: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textPrimary,
    letterSpacing: TypographyV2.body.letterSpacing,
    lineHeight: TypographyV2.body.lineHeight },
  activitySubtitle: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textSecondary,
    letterSpacing: TypographyV2.meta.letterSpacing },
  activityMeta: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted,
    letterSpacing: TypographyV2.meta.letterSpacing,
    marginTop: 2,
    fontVariant: ['tabular-nums'] },
  activityMetaAccent: {
    color: colors.danger,
    fontFamily: Typography.family.semibold },
  activityAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4 },
  activityActionText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.brand },

  /* Trending Rail (merged from EditTab) */
  trendingScroll: {
    paddingHorizontal: Space.md,
    marginHorizontal: -Space.md,
    gap: Space.sm },
  trendingItem: {
    width: 140,
    gap: 4 },
  trendingImage: {
    width: 140,
    height: 180,
    borderRadius: Radius.md,
    backgroundColor: colors.surfaceAlt },
  trendingBrand: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted,
    letterSpacing: TypographyV2.meta.letterSpacing,
    marginTop: Space.xs },
  trendingTitle: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textPrimary,
    letterSpacing: TypographyV2.body.letterSpacing },
  trendingPrice: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.brand,
    letterSpacing: TypographyV2.meta.letterSpacing,
    fontVariant: ['tabular-nums'] },
  windowTabs: {
    flexDirection: 'row',
    gap: Space.xs,
    marginBottom: Space.sm },
  windowTab: {
    paddingVertical: Space.xs,
    paddingHorizontal: Space.sm + 2,
    borderRadius: Radius.full,
    backgroundColor: colors.surfaceAlt },
  windowTabActive: {
    backgroundColor: colors.brand },
  windowTabText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textSecondary,
    letterSpacing: TypographyV2.meta.letterSpacing },
  windowTabTextActive: {
    color: colors.textInverse },

  /* Style Quiz — flat action row, hairline separator (no surface card) */
  quizCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Space.md,
    gap: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border },
  quizActionText: {
    flex: 1,
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textPrimary,
    letterSpacing: TypographyV2.body.letterSpacing } });
}
