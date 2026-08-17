import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Dimensions,
} from 'react-native';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';
import { useAppTheme } from '../../theme/ThemeContext';
import type { ThemeColors } from '../../theme/ThemeContext';
import { Type, Space, Radius, Typography } from '../../theme/designTokens';
import { useStore } from '../../store/useStore';
import { useBackendData } from '../../context/BackendDataContext';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import { useHaptic } from '../../hooks/useHaptic';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useFormattedPrice } from '../../hooks/useFormattedPrice';
import { useToast } from '../../context/ToastContext';
import { EmptyState } from '../EmptyState';
import { formatCountdown } from '../../data/tradeHub';
import { DiscoverySectionHeader } from '../discover/DiscoverySectionHeader';
import { HorizontalRail } from '../HorizontalRail';
import { fetchTrendingListings, type TrendingListing } from '../../services/marketApi';

type NavT = NativeStackNavigationProp<RootStackParamList>;
const { width: SCREEN_W } = Dimensions.get('window');

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
function TrendingRailItem({ item, index, onPress, styles, reducedMotion, formatPrice }: { item: { id: string; title: string; brand: string; price: number; image: string }; index: number; onPress: () => void; styles: ReturnType<typeof createStyles>; reducedMotion: boolean; formatPrice: (n: number) => string }) {
  return (
    <Reanimated.View entering={reducedMotion ? undefined : FadeInDown.duration(350).delay(index * 60).springify()}>
      <AnimatedPressable style={styles.trendingItem} onPress={onPress} activeOpacity={0.92}>
        <CachedImage uri={item.image} style={styles.trendingImage} containerStyle={{ borderRadius: Radius.md }} contentFit="cover" />
        <Text style={styles.trendingBrand} numberOfLines={1}>{item.brand}</Text>
        <Text style={styles.trendingTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.trendingPrice}>{formatPrice(item.price)}</Text>
      </AnimatedPressable>
    </Reanimated.View>
  );
}

/* ── Sub-components ── */
function LiveNowCard({ auction, index, onPress, styles, reducedMotion, formatPrice }: { auction: LiveAuctionItem; index: number; onPress: () => void; styles: ReturnType<typeof createStyles>; reducedMotion: boolean; formatPrice: (n: number) => string }) {
  const countdown = formatCountdown(Math.max(0, auction.endsAtMs - Date.now()));
  return (
    <Reanimated.View entering={reducedMotion ? undefined : FadeInDown.duration(350).delay(index * 60).springify()}>
      <AnimatedPressable style={styles.liveCard} onPress={onPress} activeOpacity={0.92}>
        <CachedImage uri={auction.image} style={styles.liveImage} containerStyle={{ borderRadius: Radius.md }} contentFit="cover" />
        <View style={styles.liveContent}>
          <Text style={styles.liveTitle} numberOfLines={1}>{auction.title}</Text>
          <Text style={styles.liveBid}>Current bid · {formatPrice(auction.currentBid)}</Text>
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>{countdown}</Text>
          </View>
        </View>
      </AnimatedPressable>
    </Reanimated.View>
  );
}

function ActivityCard({ item, onPress, index, colors, styles, reducedMotion, formatPrice }: { item: ActivityItem; onPress: () => void; index: number; colors: ThemeColors; styles: ReturnType<typeof createStyles>; reducedMotion: boolean; formatPrice: (n: number) => string }) {
  const iconMap: Record<ActivityType, React.ComponentProps<typeof Ionicons>['name']> = {
    auction_live: 'flame-outline',
    fresh_drop: 'cube-outline',
    price_drop: 'trending-down-outline',
  };
  const accentMap: Record<ActivityType, string> = {
    auction_live: colors.danger,
    fresh_drop: colors.brand,
    price_drop: '#dd6a33',
  };

  return (
    <Reanimated.View entering={reducedMotion ? undefined : FadeInDown.duration(350).delay(index * 60).springify()}>
      <AnimatedPressable style={styles.activityCard} onPress={onPress} activeOpacity={0.92}>
        <CachedImage uri={item.image} style={styles.activityImage} containerStyle={{ borderRadius: Radius.md }} contentFit="cover" />
        <View style={styles.activityContent}>
          <View style={styles.activityHeader}>
            <Ionicons name={iconMap[item.type]} size={14} color={accentMap[item.type]} />
            <Text style={[styles.activityTypeLabel, { color: accentMap[item.type] }]}>
              {item.type === 'auction_live' ? 'LIVE AUCTION'
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
    </Reanimated.View>
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
  const { formatFromFiat } = useFormattedPrice();
  const formatPrice = React.useCallback((n: number) => formatFromFiat(n, 'GBP', { displayMode: 'fiat' }), [formatFromFiat]);
  const customAuctions = useStore((state) => state.customAuctions);
  const auctionRuntime = useStore((state) => state.auctionRuntime);
  const reducedMotion = useReducedMotion();

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
        image: t.images[0] ?? t.imageUrl ?? '',
      }));
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
        image: l.images[0] ?? '',
      }));
  }, [trending, listings]);

  const now = Date.now();

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
        listingId: a.listingId,
      }));
  }, [customAuctions, now]);

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
          metaAccent: true, actionLabel: 'Bid', routeId: a.listingId,
        });
      }
    });

    const recent = [...listings]
      .sort((a, b) => { const da = a.createdAt ? Date.parse(a.createdAt) : 0; const db = b.createdAt ? Date.parse(b.createdAt) : 0; return db - da; })
      .slice(0, 6);
    recent.forEach((l) => {
      items.push({ id: `drop_${l.id}`, type: 'fresh_drop', title: l.title ?? 'New Listing', subtitle: l.brand ?? 'ThryftVerse', image: l.images?.[0] ?? '', meta: formatPrice(l.price), routeId: l.id });
    });

    listings.filter((l) => l.originalPrice && l.originalPrice > l.price).slice(0, 6).forEach((l) => {
      const dropPct = Math.round(((l.originalPrice! - l.price) / l.originalPrice!) * 100);
      items.push({ id: `drop_${l.id}_price`, type: 'price_drop', title: l.title ?? 'Item', subtitle: l.brand ?? 'ThryftVerse', image: l.images?.[0] ?? '', meta: `Down ${dropPct}% · Now ${formatPrice(l.price)}`, metaAccent: true, actionLabel: 'View', routeId: l.id });
    });

    return items.slice(0, 14);
  }, [customAuctions, auctionRuntime, listings, now, formatPrice]);

  const handleActivityPress = (item: ActivityItem) => {
    haptic.light();
    if (item.routeId) navigation.push('ItemDetail', { itemId: item.routeId });
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
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
      {/* Trending Now Rail (merged from EditTab) */}
      {trendingListings.length > 0 && (
        <Reanimated.View entering={reducedMotion ? undefined : FadeInDown.duration(300)}>
          <DiscoverySectionHeader
            kicker="What's hot"
            title="Trending Now"
            actionLabel="See all"
            onAction={() => navigation.navigate('Browse', { categoryId: 'all', title: 'Trending' })}
          />
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
          <HorizontalRail contentContainerStyle={styles.trendingScroll}>
            {trendingListings.map((item, i) => (
              <TrendingRailItem
                key={item.id}
                item={item}
                index={i}
                onPress={() => { haptic.light(); navigation.push('ItemDetail', { itemId: item.id }); }}
                styles={styles}
                reducedMotion={reducedMotion}
                formatPrice={formatPrice}
              />
            ))}
          </HorizontalRail>
        </Reanimated.View>
      )}

      {/* Live Now Rail */}
      {liveAuctions.length > 0 && (
        <Reanimated.View entering={reducedMotion ? undefined : FadeInDown.duration(300)}>
          <DiscoverySectionHeader
            kicker="Bidding now"
            title="Live Now"
            actionLabel="View all"
            onAction={handleViewAll}
          />
          <HorizontalRail contentContainerStyle={styles.liveScroll}>
            {liveAuctions.map((auction, i) => (
              <LiveNowCard
                key={auction.id}
                auction={auction}
                index={i}
                onPress={() => { haptic.light(); navigation.push('ItemDetail', { itemId: auction.listingId }); }}
                styles={styles}
                reducedMotion={reducedMotion}
                formatPrice={formatPrice}
              />
            ))}
          </HorizontalRail>
        </Reanimated.View>
      )}

      {/* Live Pulse Banner */}
      <Reanimated.View entering={reducedMotion ? undefined : FadeInDown.duration(300)}>
        <AnimatedPressable style={styles.pulseBanner} onPress={handleViewAll} activeOpacity={0.92}>
          <View style={styles.pulseDot}>
            <View style={styles.pulseRing} />
            <View style={styles.pulseCore} />
          </View>
          <View>
            <Text style={styles.pulseBannerTitle}>Marketplace Live</Text>
            <Text style={styles.pulseBannerSub}>{activities.length} active events · {liveAuctions.length} live auctions</Text>
          </View>
          <Ionicons name="arrow-forward" size={18} color={colors.brand} />
        </AnimatedPressable>
      </Reanimated.View>

      {/* Activity feed */}
      <Reanimated.View entering={reducedMotion ? undefined : FadeInDown.duration(300)} style={{ marginTop: Space.lg }}>
        <DiscoverySectionHeader
          kicker="Updates"
          title="Live Feed"
          actionLabel="View all"
          onAction={handleViewAll}
        />
        {activities.map((item, i) => (
          <ActivityCard key={item.id} item={item} onPress={() => handleActivityPress(item)} index={i} colors={colors} styles={styles} reducedMotion={reducedMotion} formatPrice={formatPrice} />
        ))}
      </Reanimated.View>

      {/* Style Quiz (merged from EditTab) */}
      <Reanimated.View entering={reducedMotion ? undefined : FadeInDown.duration(300)} style={{ marginTop: Space.lg }}>
        <DiscoverySectionHeader
          kicker="Personalise"
          title="Find Your Aesthetic"
        />
        <AnimatedPressable style={styles.quizCard} onPress={() => navigation.navigate('StyleQuiz')} activeOpacity={0.92}>
          <View style={styles.quizContent}>
            <Text style={styles.quizTitle}>Discover your style</Text>
            <Text style={styles.quizSub}>Take a short quiz to tailor your Explore feed to your preferences.</Text>
            <View style={styles.quizPills}>
              {['Minimal', 'Streetwear', 'Vintage', 'Gorpcore'].map((pill) => (
                <View key={pill} style={styles.quizPill}>
                  <Text style={styles.quizPillText}>{pill}</Text>
                </View>
              ))}
            </View>
          </View>
          <View style={styles.quizIconWrap}>
            <Ionicons name="color-palette-outline" size={28} color={colors.brand} />
          </View>
        </AnimatedPressable>
      </Reanimated.View>

      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  scrollContent: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.xl,
  },

  /* Live Now Rail */
  liveScroll: {
    paddingHorizontal: Space.md,
    marginHorizontal: -Space.md,
    gap: Space.sm,
  },
  liveCard: {
    width: 150,
    backgroundColor: colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: Space.sm,
    gap: Space.sm,
  },
  liveImage: {
    width: '100%',
    height: 120,
    borderRadius: Radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  liveContent: {
    gap: 3,
  },
  liveTitle: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
    letterSpacing: Type.caption.letterSpacing,
  },
  liveBid: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.medium,
    color: colors.textSecondary,
    letterSpacing: Type.meta.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: Space.xs,
    backgroundColor: 'rgba(239,68,68,0.10)',
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
    borderRadius: Radius.full,
    alignSelf: 'flex-start',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: Radius.sm,
    backgroundColor: colors.danger,
  },
  liveText: {
    fontSize: 10,
    fontFamily: Typography.family.semibold,
    color: colors.danger,
    fontVariant: ['tabular-nums'],
  },

  /* Pulse Banner */
  pulseBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    backgroundColor: colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: Space.md,
    marginBottom: Space.md,
  },
  pulseDot: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: Radius.lg,
    backgroundColor: colors.danger,
    opacity: 0.25,
  },
  pulseCore: {
    width: 12,
    height: 12,
    borderRadius: Radius.md,
    backgroundColor: colors.danger,
  },
  pulseBannerTitle: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.bold,
    color: colors.textPrimary,
    letterSpacing: Type.subtitle.letterSpacing,
  },
  pulseBannerSub: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.medium,
    color: colors.textMuted,
    letterSpacing: Type.meta.letterSpacing,
    fontVariant: ['tabular-nums'],
  },

  /* Trending */
  trendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm,
  },
  trendBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: Space.sm,
    borderRadius: Radius.full,
    gap: 6,
  },
  trendLabel: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.body.letterSpacing,
  },
  heatDot: {
    width: 6,
    height: 6,
    borderRadius: Radius.sm,
  },

  /* Hot Sellers */
  sellerScroll: {
    paddingHorizontal: Space.md,
    marginHorizontal: -Space.md,
    gap: Space.sm,
  },
  sellerCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: Space.sm,
    width: 110,
  },
  sellerAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surfaceAlt,
  },
  sellerName: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
    marginTop: Space.sm,
    letterSpacing: Type.caption.letterSpacing,
  },
  sellerMeta: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.medium,
    color: colors.textMuted,
    marginTop: 2,
    letterSpacing: Type.meta.letterSpacing,
  },
  sellerLiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    backgroundColor: 'rgba(52,199,89,0.12)',
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
    borderRadius: Radius.full,
  },
  sellerLiveDot: {
    width: 6,
    height: 6,
    borderRadius: Radius.sm,
    backgroundColor: colors.success,
  },
  sellerLiveText: {
    fontSize: 10,
    fontFamily: Typography.family.semibold,
    color: colors.success,
  },

  /* Activity */
  activityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: Space.md,
    marginBottom: Space.sm,
    gap: Space.md,
  },
  activityImage: {
    width: 80,
    height: 80,
    borderRadius: Radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  activityContent: {
    flex: 1,
    gap: 4,
  },
  activityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  activityTypeLabel: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: 0.8,
  },
  activityTitle: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
    letterSpacing: Type.body.letterSpacing,
    lineHeight: Type.body.lineHeight,
  },
  activitySubtitle: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
    color: colors.textSecondary,
    letterSpacing: Type.caption.letterSpacing,
  },
  activityMeta: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.medium,
    color: colors.textMuted,
    letterSpacing: Type.meta.letterSpacing,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  activityMetaAccent: {
    color: colors.danger,
    fontFamily: Typography.family.semibold,
  },
  activityAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  activityActionText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    color: colors.brand,
  },

  /* Trending Rail (merged from EditTab) */
  trendingScroll: {
    paddingHorizontal: Space.md,
    marginHorizontal: -Space.md,
    gap: Space.sm,
  },
  trendingItem: {
    width: 140,
    gap: 4,
  },
  trendingImage: {
    width: 140,
    height: 180,
    borderRadius: Radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  trendingBrand: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.medium,
    color: colors.textMuted,
    letterSpacing: Type.meta.letterSpacing,
    marginTop: Space.xs,
  },
  trendingTitle: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
    letterSpacing: Type.body.letterSpacing,
  },
  trendingPrice: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.bold,
    color: colors.brand,
    letterSpacing: Type.caption.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
  windowTabs: {
    flexDirection: 'row',
    gap: Space.xs,
    marginBottom: Space.sm,
  },
  windowTab: {
    paddingVertical: Space.xs,
    paddingHorizontal: Space.sm + 2,
    borderRadius: Radius.full,
    backgroundColor: colors.surfaceAlt,
  },
  windowTabActive: {
    backgroundColor: colors.brand,
  },
  windowTabText: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.medium,
    color: colors.textSecondary,
    letterSpacing: Type.meta.letterSpacing,
  },
  windowTabTextActive: {
    color: '#fff',
  },

  /* Style Quiz (merged from EditTab) */
  quizCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: Space.md,
    gap: Space.sm,
  },
  quizContent: {
    flex: 1,
    gap: 4,
  },
  quizTitle: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
    letterSpacing: Type.subtitle.letterSpacing,
  },
  quizSub: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: colors.textSecondary,
    letterSpacing: Type.caption.letterSpacing,
    lineHeight: 18,
  },
  quizPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: Space.xs,
  },
  quizPill: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: Space.xs,
  },
  quizPillText: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    color: colors.brand,
    letterSpacing: Type.meta.letterSpacing,
  },
  quizIconWrap: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  });
}
