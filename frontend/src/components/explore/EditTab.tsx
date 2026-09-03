import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView } from 'react-native';
import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';
import { useAppTheme } from '../../theme/ThemeContext';
import type { ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import { useHaptic } from '../../hooks/useHaptic';
import { useBackendData } from '../../context/BackendDataContext';
import { fetchTrendingListings, type TrendingListing } from '../../services/marketApi';
import { DiscoverySectionHeader } from '../discover/DiscoverySectionHeader';
import { HorizontalRail } from '../HorizontalRail';
import { useFormattedPrice } from '../../hooks/useFormattedPrice';

type NavT = NativeStackNavigationProp<RootStackParamList>;

/* ── Sub-components ── */
function TrendingRailItem({ item, onPress, styles }: { item: { id: string; title: string; brand: string | null; price: number; image: string }; onPress: () => void; styles: ReturnType<typeof createStyles> }) {
  const { formatFromFiat } = useFormattedPrice();
  return (
    <AnimatedPressable style={styles.trendingItem} onPress={onPress} activeOpacity={0.92}>
      <CachedImage uri={item.image} style={styles.trendingImage} containerStyle={{ borderRadius: Radius.md }} contentFit="cover" />
      <Text style={styles.trendingBrand} numberOfLines={1}>{item.brand}</Text>
      <Text style={styles.trendingTitle} numberOfLines={1}>{item.title}</Text>
      <Text style={styles.trendingPrice}>{formatFromFiat(item.price)}</Text>
    </AnimatedPressable>
  );
}

/* ── Main Tab ── */
export default function EditTab() {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<NavT>();
  const haptic = useHaptic();
  const { listings } = useBackendData();

  const [trending, setTrending] = React.useState<TrendingListing[]>([]);
  const [trendingWindow, setTrendingWindow] = React.useState<'24h' | '7d' | '30d'>('24h');

  React.useEffect(() => {
    let cancelled = false;
    fetchTrendingListings({ window: trendingWindow, limit: 20 })
      .then((items) => { if (!cancelled) setTrending(items); })
      .catch(() => { if (!cancelled) setTrending([]); });
    return () => { cancelled = true; };
  }, [trendingWindow]);

  const toRailItem = (l: typeof listings[0]) => ({
    id: l.id,
    title: l.title,
    brand: l.brand,
    price: l.price,
    image: l.images[0] ?? '' });

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
      .map(toRailItem);
  }, [trending, listings]);

  const newestListings = React.useMemo(() => {
    return [...listings]
      .filter((l) => l.images && l.images.length > 0)
      .sort((a, b) => {
        const da = a.createdAt ? Date.parse(a.createdAt) : 0;
        const db = b.createdAt ? Date.parse(b.createdAt) : 0;
        return db - da;
      })
      .slice(0, 10)
      .map(toRailItem);
  }, [listings]);

  const priceDropListings = React.useMemo(() => {
    return [...listings]
      .filter((l) => l.originalPrice && l.originalPrice > l.price && l.images && l.images.length > 0)
      .sort((a, b) => ((b.originalPrice! - b.price) / b.originalPrice!) - ((a.originalPrice! - a.price) / a.originalPrice!))
      .slice(0, 10)
      .map(toRailItem);
  }, [listings]);

  const handleExploreCollection = (params: RootStackParamList['ExploreCollection']) => {
    haptic.light();
    navigation.navigate('ExploreCollection', params);
  };

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
      {/* Trending Rail */}
      {trendingListings.length > 0 && (
        <View>
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
            {trendingListings.map((item) => (
              <TrendingRailItem
                key={item.id}
                item={item}
                onPress={() => { haptic.light(); navigation.push('ItemDetail', { itemId: item.id }); }}
                styles={styles}
              />
            ))}
          </HorizontalRail>
        </View>
      )}

      {/* New Arrivals */}
      {newestListings.length > 0 && (
        <View style={{ marginTop: Space.lg }}>
          <DiscoverySectionHeader
            kicker="Fresh listings"
            title="New Arrivals"
            actionLabel="See all"
            onAction={() => handleExploreCollection({ title: 'New Arrivals', source: { type: 'newest' } })}
          />
          <HorizontalRail contentContainerStyle={styles.trendingScroll}>
            {newestListings.map((item) => (
              <TrendingRailItem
                key={item.id}
                item={item}
                onPress={() => { haptic.light(); navigation.push('ItemDetail', { itemId: item.id }); }}
                styles={styles}
              />
            ))}
          </HorizontalRail>
        </View>
      )}

      {/* Price Drops */}
      {priceDropListings.length > 0 && (
        <View style={{ marginTop: Space.lg }}>
          <DiscoverySectionHeader
            kicker="Reduced"
            title="Price Drops"
            actionLabel="See all"
            onAction={() => handleExploreCollection({ title: 'Price Drops', source: { type: 'price_drop' } })}
          />
          <HorizontalRail contentContainerStyle={styles.trendingScroll}>
            {priceDropListings.map((item) => (
              <TrendingRailItem
                key={item.id}
                item={item}
                onPress={() => { haptic.light(); navigation.push('ItemDetail', { itemId: item.id }); }}
                styles={styles}
              />
            ))}
          </HorizontalRail>
        </View>
      )}

      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  scrollContent: {
    paddingTop: Space.sm,
    paddingBottom: Space.xl },

  /* Trending Rail */
  trendingScroll: {
    paddingHorizontal: Space.md,
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
    letterSpacing: TypographyV2.meta.letterSpacing },

  /* Window Tabs */
  windowTabs: {
    flexDirection: 'row',
    paddingHorizontal: Space.md,
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
    color: colors.textInverse } });
}
