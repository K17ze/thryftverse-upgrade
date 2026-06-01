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
import { Colors } from '../../constants/colors';
import { Type, Space, Radius } from '../../theme/designTokens';
import { Typography } from '../../constants/typography';
import { useStore } from '../../store/useStore';
import { useBackendData } from '../../context/BackendDataContext';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../navigation/types';
import { useHaptic } from '../../hooks/useHaptic';
import { useToast } from '../../context/ToastContext';
import { EmptyState } from '../EmptyState';
import { formatCountdown } from '../../data/tradeHub';

type NavT = StackNavigationProp<RootStackParamList>;
const { width: SCREEN_W } = Dimensions.get('window');

const HOT_SELLERS = [
  { id: 'u1', name: 'mariefullery', avatar: 'https://picsum.photos/seed/user1/80/80', sales: 124, viewers: 24 },
  { id: 'u2', name: 'scott_art', avatar: 'https://picsum.photos/seed/user2/80/80', sales: 89, viewers: 18 },
  { id: 'u3', name: 'dankdunksuk', avatar: 'https://picsum.photos/seed/user3/80/80', sales: 203, viewers: 31 },
  { id: 'u4', name: 'vintagelover', avatar: 'https://picsum.photos/seed/user4/80/80', sales: 156, viewers: 12 },
  { id: 'u5', name: 'gorpgod', avatar: 'https://picsum.photos/seed/user5/80/80', sales: 67, viewers: 9 },
];

const TRENDING_TAGS = [
  { label: '#gorpcore', heat: 'hot', color: '#D4E6F1', textColor: '#2E4A62' },
  { label: 'archive', heat: 'hot', color: '#E8D5C4', textColor: '#5C3D2E' },
  { label: 'y2k', heat: 'warm', color: '#D5DBDB', textColor: '#2C3E50' },
  { label: 'techwear', heat: 'warm', color: '#D6EAF8', textColor: '#1B4F72' },
  { label: 'japanese denim', heat: 'rising', color: '#FADBD8', textColor: '#6E2C3D' },
  { label: 'streetwear', heat: 'rising', color: '#E8DAEF', textColor: '#4A235A' },
  { label: 'minimal', heat: 'cool', color: '#D5F5E3', textColor: '#1E8449' },
  { label: 'vintage', heat: 'cool', color: '#F9E79F', textColor: '#7D6608' },
];

/* ── Activity item types ── */
type ActivityType = 'auction_live' | 'fresh_drop' | 'just_sold' | 'price_drop';

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

/* ── Sub-components ── */
function ActivityCard({ item, onPress, index }: { item: ActivityItem; onPress: () => void; index: number }) {
  const iconMap: Record<ActivityType, string> = {
    auction_live: 'flame-outline',
    fresh_drop: 'cube-outline',
    just_sold: 'checkmark-circle-outline',
    price_drop: 'trending-down-outline',
  };
  const accentMap: Record<ActivityType, string> = {
    auction_live: Colors.danger,
    fresh_drop: Colors.brand,
    just_sold: Colors.success,
    price_drop: '#dd6a33',
  };

  return (
    <Reanimated.View entering={FadeInDown.duration(350).delay(index * 60).springify()}>
      <AnimatedPressable style={styles.activityCard} onPress={onPress} activeOpacity={0.92}>
        <CachedImage uri={item.image} style={styles.activityImage} containerStyle={{ borderRadius: Radius.md }} contentFit="cover" />
        <View style={styles.activityContent}>
          <View style={styles.activityHeader}>
            <Ionicons name={iconMap[item.type] as any} size={14} color={accentMap[item.type]} />
            <Text style={[styles.activityTypeLabel, { color: accentMap[item.type] }]}>
              {item.type === 'auction_live' ? 'LIVE AUCTION'
                : item.type === 'fresh_drop' ? 'FRESH DROP'
                  : item.type === 'just_sold' ? 'JUST SOLD'
                    : 'PRICE DROP'}
            </Text>
          </View>
          <Text style={styles.activityTitle} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.activitySubtitle} numberOfLines={1}>{item.subtitle}</Text>
          <Text style={[styles.activityMeta, item.metaAccent && styles.activityMetaAccent]}>{item.meta}</Text>
        </View>
        {item.actionLabel && (
          <View style={styles.activityAction}>
            <Text style={styles.activityActionText}>{item.actionLabel}</Text>
            <Ionicons name="chevron-forward" size={14} color={Colors.brand} />
          </View>
        )}
      </AnimatedPressable>
    </Reanimated.View>
  );
}

function TrendingBubble({ tag, onPress, index }: { tag: typeof TRENDING_TAGS[0]; onPress: () => void; index: number }) {
  return (
    <Reanimated.View entering={FadeInDown.duration(300).delay(index * 40).springify()}>
      <AnimatedPressable style={[styles.trendBubble, { backgroundColor: tag.color }]} onPress={onPress} activeOpacity={0.88}>
        <Text style={[styles.trendLabel, { color: tag.textColor }]}>{tag.label}</Text>
        <View style={[styles.heatDot, {
          backgroundColor:
            tag.heat === 'hot' ? Colors.danger
              : tag.heat === 'warm' ? '#f3c17c'
                : tag.heat === 'rising' ? Colors.brand
                  : Colors.textMuted,
        }]} />
      </AnimatedPressable>
    </Reanimated.View>
  );
}

/* ── Main Tab ── */
export default function PulseTab() {
  const navigation = useNavigation<NavT>();
  const haptic = useHaptic();
  const { show } = useToast();
  const { listings } = useBackendData();
  const customAuctions = useStore((state) => state.customAuctions);
  const auctionRuntime = useStore((state) => state.auctionRuntime);

  const now = Date.now();

  const activities = useMemo<ActivityItem[]>(() => {
    const items: ActivityItem[] = [];

    customAuctions.forEach((a) => {
      const endsAtMs = new Date(a.endsAt).getTime();
      const isLive = now >= new Date(a.startsAt).getTime() && now < endsAtMs;
      if (isLive) {
        items.push({
          id: `auction_${a.id}`, type: 'auction_live',
          title: a.title, subtitle: `Current bid · £${a.currentBid}`,
          image: a.image, meta: formatCountdown(Math.max(0, endsAtMs - now)),
          metaAccent: true, actionLabel: 'Bid', routeId: a.listingId,
        });
      }
    });

    const recent = [...listings]
      .sort((a, b) => { const da = a.createdAt ? Date.parse(a.createdAt) : 0; const db = b.createdAt ? Date.parse(b.createdAt) : 0; return db - da; })
      .slice(0, 6);
    recent.forEach((l) => {
      items.push({ id: `drop_${l.id}`, type: 'fresh_drop', title: l.title ?? 'New Listing', subtitle: l.brand ?? 'ThryftVerse', image: l.images?.[0] ?? `https://picsum.photos/seed/${l.id}/500/700`, meta: `£${l.price}`, routeId: l.id });
    });

    listings.slice(0, 4).forEach((l, i) => {
      if (i % 2 === 0) {
        items.push({ id: `sold_${l.id}_${i}`, type: 'just_sold', title: l.title ?? 'Item', subtitle: l.brand ?? 'ThryftVerse', image: l.images?.[0] ?? `https://picsum.photos/seed/sold${i}/500/700`, meta: `Sold for £${(l.price * 0.92).toFixed(0)}`, routeId: l.id });
      }
    });

    listings.filter((l) => l.originalPrice && l.originalPrice > l.price).slice(0, 3).forEach((l) => {
      const dropPct = Math.round(((l.originalPrice! - l.price) / l.originalPrice!) * 100);
      items.push({ id: `drop_${l.id}_price`, type: 'price_drop', title: l.title ?? 'Item', subtitle: l.brand ?? 'ThryftVerse', image: l.images?.[0] ?? `https://picsum.photos/seed/${l.id}/500/700`, meta: `Down ${dropPct}% · Now £${l.price}`, metaAccent: true, actionLabel: 'View', routeId: l.id });
    });

    return items.slice(0, 14);
  }, [customAuctions, auctionRuntime, listings, now]);

  const handleActivityPress = (item: ActivityItem) => {
    haptic.light();
    if (item.routeId) navigation.push('ItemDetail', { itemId: item.routeId });
  };

  const handleTagPress = (tag: string) => {
    haptic.light();
    show(`Searching ${tag}`, 'info');
    navigation.navigate('Browse', { categoryId: 'search', title: `Trending: ${tag}`, searchQuery: tag.replace('#', '') });
  };

  if (activities.length === 0) {
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
      {/* Live Pulse Banner */}
      <Reanimated.View entering={FadeInDown.duration(300)}>
        <AnimatedPressable style={styles.pulseBanner} onPress={() => navigation.navigate('Browse', { categoryId: 'all', title: 'Live Now' })} activeOpacity={0.92}>
          <View style={styles.pulseDot}>
            <View style={styles.pulseRing} />
            <View style={styles.pulseCore} />
          </View>
          <View>
            <Text style={styles.pulseBannerTitle}>Marketplace Live</Text>
            <Text style={styles.pulseBannerSub}>{activities.length} active events · {HOT_SELLERS.reduce((a, s) => a + s.viewers, 0)} people browsing</Text>
          </View>
          <Ionicons name="arrow-forward" size={18} color={Colors.brand} />
        </AnimatedPressable>
      </Reanimated.View>

      {/* Trending tags */}
      <Reanimated.View entering={FadeInDown.duration(300).delay(60)}>
        <Text style={styles.sectionTitle}>Trending Now</Text>
        <View style={styles.trendRow}>
          {TRENDING_TAGS.map((tag, i) => (
            <TrendingBubble key={tag.label} tag={tag} onPress={() => handleTagPress(tag.label)} index={i} />
          ))}
        </View>
      </Reanimated.View>

      {/* Hot Sellers */}
      <Reanimated.View entering={FadeInDown.duration(350).delay(80)}>
        <Text style={[styles.sectionTitle, { marginTop: Space.lg }]}>Hot Sellers</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sellerScroll}>
          {HOT_SELLERS.map((seller, i) => (
            <Reanimated.View key={seller.id} entering={FadeInDown.duration(300).delay(i * 50)}>
              <AnimatedPressable style={styles.sellerCard} onPress={() => navigation.navigate('UserProfile', { userId: seller.id })} activeOpacity={0.92}>
                <CachedImage uri={seller.avatar} style={styles.sellerAvatar} containerStyle={{ borderRadius: Radius.full }} contentFit="cover" />
                <Text style={styles.sellerName} numberOfLines={1}>@{seller.name}</Text>
                <Text style={styles.sellerMeta}>{seller.sales} sales</Text>
                <View style={styles.liveBadge}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveText}>{seller.viewers} viewing</Text>
                </View>
              </AnimatedPressable>
            </Reanimated.View>
          ))}
        </ScrollView>
      </Reanimated.View>

      {/* Activity feed */}
      <Text style={[styles.sectionTitle, { marginTop: Space.lg }]}>Live Feed</Text>
      {activities.map((item, i) => (
        <ActivityCard key={item.id} item={item} onPress={() => handleActivityPress(item)} index={i} />
      ))}

      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.xl,
  },

  /* Pulse Banner */
  pulseBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Space.md,
    marginBottom: Space.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
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
    borderRadius: 12,
    backgroundColor: Colors.danger,
    opacity: 0.25,
  },
  pulseCore: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.danger,
  },
  pulseBannerTitle: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    letterSpacing: Type.subtitle.letterSpacing,
  },
  pulseBannerSub: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.medium,
    color: Colors.textMuted,
    letterSpacing: Type.meta.letterSpacing,
  },

  /* Section title */
  sectionTitle: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    letterSpacing: Type.subtitle.letterSpacing,
    marginBottom: Space.sm,
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
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: Radius.full,
    gap: 8,
  },
  trendLabel: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.body.letterSpacing,
  },
  heatDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  /* Hot Sellers */
  sellerScroll: {
    paddingHorizontal: Space.md,
    marginHorizontal: -Space.md,
    gap: Space.sm,
  },
  sellerCard: {
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Space.sm,
    width: 110,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  sellerAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.surfaceAlt,
  },
  sellerName: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
    marginTop: 8,
    letterSpacing: Type.caption.letterSpacing,
  },
  sellerMeta: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.medium,
    color: Colors.textMuted,
    marginTop: 2,
    letterSpacing: Type.meta.letterSpacing,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    backgroundColor: 'rgba(52,199,89,0.12)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.success,
  },
  liveText: {
    fontSize: 10,
    fontFamily: Typography.family.semibold,
    color: Colors.success,
  },

  /* Activity */
  activityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Space.sm,
    marginBottom: Space.sm,
    gap: Space.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2,
  },
  activityImage: {
    width: 72,
    height: 72,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceAlt,
  },
  activityContent: {
    flex: 1,
    gap: 3,
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
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
    letterSpacing: Type.subtitle.letterSpacing,
    lineHeight: Type.subtitle.lineHeight,
  },
  activitySubtitle: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
    color: Colors.textSecondary,
    letterSpacing: Type.caption.letterSpacing,
  },
  activityMeta: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.medium,
    color: Colors.textMuted,
    letterSpacing: Type.meta.letterSpacing,
    marginTop: 2,
  },
  activityMetaAccent: {
    color: Colors.danger,
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
    color: Colors.brand,
  },
});
