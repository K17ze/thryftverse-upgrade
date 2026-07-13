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
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useBackendData } from '../context/BackendDataContext';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { CachedImage } from '../components/CachedImage';
import { useAppTheme } from '../theme/ThemeContext';
import { Type, Space, Radius, Typography } from '../theme/designTokens';
import { useHaptic } from '../hooks/useHaptic';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { EmptyState } from '../components/EmptyState';
import { formatCountdown } from '../data/tradeHub';
import { ScreenHeader } from '../components/ui/ScreenHeader';

const { width: SCREEN_W } = Dimensions.get('window');

type NavT = StackNavigationProp<RootStackParamList>;

type ActivityType = 'auction_live' | 'fresh_drop' | 'price_drop' | 'sold';

interface FeedEvent {
  id: string;
  type: ActivityType;
  title: string;
  subtitle: string;
  image: string;
  meta: string;
  metaAccent?: boolean;
  routeId?: string;
  timestamp: number;
}

function EventCard({ event, index }: { event: FeedEvent; index: number }) {
  const navigation = useNavigation<NavT>();
  const haptic = useHaptic();
  const { colors, isDark } = useAppTheme();
  const reducedMotionEnabled = useReducedMotion();

  const iconMap: Record<ActivityType, string> = {
    auction_live: 'flame-outline',
    fresh_drop: 'cube-outline',
    price_drop: 'trending-down-outline',
    sold: 'checkmark-circle-outline',
  };
  const accentMap: Record<ActivityType, string> = {
    auction_live: colors.danger,
    fresh_drop: colors.brand,
    // Price-drop orange — semantic accent not yet in token system
    price_drop: '#dd6a33',
    sold: colors.success,
  };

  const handlePress = () => {
    haptic.light();
    if (event.routeId) {
      navigation.push('ItemDetail', { itemId: event.routeId });
    }
  };

  return (
    <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(240).delay(Math.min(index, 6) * 40)}>
      <AnimatedPressable style={styles.card} onPress={handlePress} activeOpacity={0.92}>
        <CachedImage uri={event.image} style={styles.cardImage} containerStyle={{ borderRadius: Radius.md }} contentFit="cover" />
        <View style={styles.cardContent}>
          <View style={styles.cardHeader}>
            <Ionicons name={iconMap[event.type] as any} size={14} color={accentMap[event.type]} />
            <Text style={[styles.cardTypeLabel, { color: accentMap[event.type] }]}>
              {event.type === 'auction_live' ? 'LIVE AUCTION'
                : event.type === 'fresh_drop' ? 'FRESH DROP'
                  : event.type === 'price_drop' ? 'PRICE DROP'
                    : 'SOLD'}
            </Text>
          </View>
          <Text style={styles.cardTitle} numberOfLines={2}>{event.title}</Text>
          <Text style={styles.cardSubtitle} numberOfLines={1}>{event.subtitle}</Text>
          <Text style={[styles.cardMeta, event.metaAccent && styles.cardMetaAccent]}>{event.meta}</Text>
        </View>
      </AnimatedPressable>
    </Reanimated.View>
  );
}

export default function PulseFeedScreen() {
  const navigation = useNavigation<NavT>();
  const haptic = useHaptic();
  const { colors, isDark } = useAppTheme();
  const reducedMotionEnabled = useReducedMotion();
  const { listings } = useBackendData();
  const customAuctions = useStore((state) => state.customAuctions);
  const now = Date.now();

  const events = useMemo<FeedEvent[]>(() => {
    const items: FeedEvent[] = [];

    // Real live auctions
    customAuctions.forEach((a) => {
      const endsAtMs = new Date(a.endsAt).getTime();
      const isLive = now >= new Date(a.startsAt).getTime() && now < endsAtMs;
      if (isLive) {
        items.push({
          id: `auction_${a.id}`,
          type: 'auction_live',
          title: a.title,
          subtitle: `Current bid · £${a.currentBid}`,
          image: a.image,
          meta: `Ends ${formatCountdown(Math.max(0, endsAtMs - now))}`,
          metaAccent: true,
          routeId: a.listingId,
          timestamp: endsAtMs,
        });
      }
    });

    // Real fresh drops (newest listings)
    const recent = [...listings]
      .sort((a, b) => {
        const da = a.createdAt ? Date.parse(a.createdAt) : 0;
        const db = b.createdAt ? Date.parse(b.createdAt) : 0;
        return db - da;
      })
      .slice(0, 10);
    recent.forEach((l) => {
      items.push({
        id: `drop_${l.id}`,
        type: 'fresh_drop',
        title: l.title ?? 'New Listing',
        subtitle: l.brand ?? 'ThryftVerse',
        image: l.images?.[0] ?? '',
        meta: `£${l.price}`,
        routeId: l.id,
        timestamp: l.createdAt ? Date.parse(l.createdAt) : now,
      });
    });

    // Real price drops
    listings
      .filter((l) => l.originalPrice && l.originalPrice > l.price)
      .slice(0, 6)
      .forEach((l) => {
        const dropPct = Math.round(((l.originalPrice! - l.price) / l.originalPrice!) * 100);
        items.push({
          id: `drop_${l.id}_price`,
          type: 'price_drop',
          title: l.title ?? 'Item',
          subtitle: l.brand ?? 'ThryftVerse',
          image: l.images?.[0] ?? '',
          meta: `Down ${dropPct}% · Now £${l.price}`,
          metaAccent: true,
          routeId: l.id,
          timestamp: now - 3600000, // Approximate recent
        });
      });

    // Sort by recency
    items.sort((a, b) => b.timestamp - a.timestamp);
    return items;
  }, [customAuctions, listings, now]);

  if (events.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScreenHeader title="Pulse Feed" onBack={() => navigation.goBack()} />
        <EmptyState
          icon="pulse-outline"
          title="The marketplace is quiet"
          subtitle="Check back soon for live auctions, fresh drops and recent sales."
          ctaLabel="Browse All"
          onCtaPress={() => navigation.navigate('Browse', { categoryId: 'all', title: 'Browse' })}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title="Pulse Feed" onBack={() => navigation.goBack()} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {events.map((event, i) => (
          <EventCard key={event.id} event={event} index={i} />
        ))}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.xl,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Space.md,
    marginBottom: Space.sm,
    gap: Space.md,
  },
  cardImage: {
    width: 80,
    height: 80,
    borderRadius: Radius.md,
  },
  cardContent: {
    flex: 1,
    gap: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cardTypeLabel: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: 0.8,
  },
  cardTitle: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.body.letterSpacing,
    lineHeight: Type.body.lineHeight,
  },
  cardSubtitle: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
    letterSpacing: Type.caption.letterSpacing,
  },
  cardMeta: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.medium,
    letterSpacing: Type.meta.letterSpacing,
    marginTop: 2,
  },
  cardMetaAccent: {
    fontFamily: Typography.family.semibold,
  },
});
