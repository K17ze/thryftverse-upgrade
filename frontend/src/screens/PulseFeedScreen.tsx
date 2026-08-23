import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useBackendData } from '../context/BackendDataContext';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { CachedImage } from '../components/CachedImage';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Type, Space, Radius, Typography, LetterSpacing } from '../theme/designTokens';
import { useHaptic } from '../hooks/useHaptic';
import { EmptyState } from '../components/EmptyState';
import { formatCountdown } from '../data/tradeHub';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';

type NavT = NativeStackNavigationProp<RootStackParamList>;

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
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const iconMap: Record<ActivityType, React.ComponentProps<typeof Ionicons>['name']> = {
    auction_live: 'flame-outline',
    fresh_drop: 'cube-outline',
    price_drop: 'trending-down-outline',
    sold: 'checkmark-circle-outline',
  };
  const accentMap: Record<ActivityType, string> = {
    auction_live: colors.danger,
    fresh_drop: colors.brand,
    // Price-drop orange — mapped to warning token
    price_drop: colors.warning,
    sold: colors.success,
  };

  const handlePress = () => {
    haptic.light();
    if (event.routeId) {
      navigation.push('ItemDetail', { itemId: event.routeId });
    }
  };

  return (
    <AnimatedPressable style={styles.card} onPress={handlePress} activeOpacity={0.92}>
      <CachedImage uri={event.image} style={styles.cardImage} containerStyle={{ borderRadius: Radius.md }} contentFit="cover" />
      <View style={styles.cardContent}>
        <View style={styles.cardHeader}>
          <Ionicons name={iconMap[event.type]} size={14} color={accentMap[event.type]} />
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
  );
}

/**
 * PulseFeedSkeleton — loading frame that mirrors the EventCard silhouette.
 * Each skeleton row is a horizontal layout: square image thumbnail + text
 * column (type label, title, subtitle, meta), matching the final card
 * geometry so there is no loading→final layout shift (AGENTS.md §14).
 */
function PulseFeedSkeleton({ count = 5 }: { count?: number }) {
  const { colors } = useAppTheme();
  const thumbSize = Space.xxl + Space.xl;
  return (
    <View>
      {Array.from({ length: count }).map((_, i) => (
        <View
          key={i}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: Space.md,
            gap: Space.md,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.border,
          }}
        >
          <SkeletonLoader
            width={thumbSize}
            height={thumbSize}
            borderRadius={Radius.md}
          />
          <View style={{ flex: 1, gap: Space.xs }}>
            <SkeletonLoader width="35%" height={Type.meta.size} borderRadius={Radius.sm} />
            <SkeletonLoader width="80%" height={Type.body.size} borderRadius={Radius.sm} />
            <SkeletonLoader width="55%" height={Type.caption.size} borderRadius={Radius.sm} />
            <SkeletonLoader width="40%" height={Type.meta.size} borderRadius={Radius.sm} />
          </View>
        </View>
      ))}
    </View>
  );
}

export default function PulseFeedScreen() {
  const navigation = useNavigation<NavT>();
  const haptic = useHaptic();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { listings, isSyncing } = useBackendData();
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

  if (isSyncing && listings.length === 0) {
    return (
      <FlagshipScreen
        scrollEnabled={false}
        header={<FlagshipHeader title="Pulse Feed" onBack={() => navigation.goBack()} />}
      >
        <View style={styles.scrollContent}>
          <PulseFeedSkeleton />
        </View>
      </FlagshipScreen>
    );
  }

  if (!isSyncing && events.length === 0) {
    return (
      <FlagshipScreen
        scrollEnabled={false}
        header={<FlagshipHeader title="Pulse Feed" onBack={() => navigation.goBack()} />}
      >
        <EmptyState
          icon="pulse-outline"
          title="The marketplace is quiet"
          subtitle="Check back soon for live auctions, fresh drops and recent sales."
          ctaLabel="Browse All"
          onCtaPress={() => navigation.navigate('Browse', { categoryId: 'all', title: 'Browse' })}
        />
      </FlagshipScreen>
    );
  }

  return (
    <FlagshipScreen
      scrollEnabled={false}
      header={<FlagshipHeader title="Pulse Feed" onBack={() => navigation.goBack()} />}
    >
      <FlashList
        data={events}
        renderItem={({ item, index }) => <EventCard event={item} index={index} />}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      />
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    scrollContent: {
      paddingHorizontal: Space.md,
      paddingTop: Space.sm,
      paddingBottom: Space.xl,
    },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: Space.md,
      gap: Space.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    cardImage: {
      width: Space.xxl + Space.xl,
      height: Space.xxl + Space.xl,
      borderRadius: Radius.md,
      backgroundColor: colors.surfaceAlt,
    },
    cardContent: {
      flex: 1,
      gap: Space.xs,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs + 2,
    },
    cardTypeLabel: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.semibold,
      letterSpacing: LetterSpacing.caps,
    },
    cardTitle: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
      letterSpacing: Type.body.letterSpacing,
      lineHeight: Type.body.lineHeight,
    },
    cardSubtitle: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.medium,
      color: colors.textSecondary,
      letterSpacing: Type.caption.letterSpacing,
    },
    cardMeta: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.medium,
      color: colors.textMuted,
      letterSpacing: Type.meta.letterSpacing,
      marginTop: Space.xs / 2,
    },
    cardMetaAccent: {
      color: colors.danger,
      fontFamily: Typography.family.semibold,
    },
  });
}
