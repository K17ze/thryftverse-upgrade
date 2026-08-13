import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Dimensions,
} from 'react-native';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';
import { useAppTheme } from '../../theme/ThemeContext';
import type { ThemeColors } from '../../theme/ThemeContext';
import { Type, Space, Radius, Typography } from '../../theme/designTokens';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import { useHaptic } from '../../hooks/useHaptic';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useToast } from '../../context/ToastContext';
import { useBackendData } from '../../context/BackendDataContext';
import { fetchTrendingListings, type TrendingListing } from '../../services/marketApi';
import { DiscoverySectionHeader } from '../discover/DiscoverySectionHeader';
import { HorizontalRail } from '../HorizontalRail';

const { width: SCREEN_W } = Dimensions.get('window');

type NavT = NativeStackNavigationProp<RootStackParamList>;

/* ── Sub-components ── */
function TrendingRailItem({ item, index, onPress, styles, reducedMotion }: { item: { id: string; title: string; brand: string; price: number; image: string }; index: number; onPress: () => void; styles: ReturnType<typeof createStyles>; reducedMotion: boolean }) {
  return (
    <Reanimated.View entering={reducedMotion ? undefined : FadeInDown.duration(350).delay(index * 60).springify()}>
      <AnimatedPressable style={styles.trendingItem} onPress={onPress} activeOpacity={0.92}>
        <CachedImage uri={item.image} style={styles.trendingImage} containerStyle={{ borderRadius: Radius.md }} contentFit="cover" />
        <Text style={styles.trendingBrand} numberOfLines={1}>{item.brand}</Text>
        <Text style={styles.trendingTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.trendingPrice}>£{item.price}</Text>
      </AnimatedPressable>
    </Reanimated.View>
  );
}

/* ── Main Tab ── */
export default function EditTab() {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<NavT>();
  const haptic = useHaptic();
  const { show } = useToast();
  const { listings } = useBackendData();
  const reducedMotionEnabled = useReducedMotion();

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

  const toRailItem = (l: typeof listings[0]) => ({
    id: l.id,
    title: l.title,
    brand: l.brand,
    price: l.price,
    image: l.images[0] ?? '',
  });

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
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)}>
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
                reducedMotion={reducedMotionEnabled}
              />
            ))}
          </HorizontalRail>
        </Reanimated.View>
      )}

      {/* New Arrivals */}
      {newestListings.length > 0 && (
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(350).delay(80)} style={{ marginTop: Space.lg }}>
          <DiscoverySectionHeader
            kicker="Fresh listings"
            title="New Arrivals"
            actionLabel="See all"
            onAction={() => handleExploreCollection({ title: 'New Arrivals', source: { type: 'newest' } })}
          />
          <HorizontalRail contentContainerStyle={styles.trendingScroll}>
            {newestListings.map((item, i) => (
              <TrendingRailItem
                key={item.id}
                item={item}
                index={i}
                onPress={() => { haptic.light(); navigation.push('ItemDetail', { itemId: item.id }); }}
                styles={styles}
                reducedMotion={reducedMotionEnabled}
              />
            ))}
          </HorizontalRail>
        </Reanimated.View>
      )}

      {/* Price Drops */}
      {priceDropListings.length > 0 && (
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(350).delay(120)} style={{ marginTop: Space.lg }}>
          <DiscoverySectionHeader
            kicker="Reduced"
            title="Price Drops"
            actionLabel="See all"
            onAction={() => handleExploreCollection({ title: 'Price Drops', source: { type: 'price_drop' } })}
          />
          <HorizontalRail contentContainerStyle={styles.trendingScroll}>
            {priceDropListings.map((item, i) => (
              <TrendingRailItem
                key={item.id}
                item={item}
                index={i}
                onPress={() => { haptic.light(); navigation.push('ItemDetail', { itemId: item.id }); }}
                styles={styles}
                reducedMotion={reducedMotionEnabled}
              />
            ))}
          </HorizontalRail>
        </Reanimated.View>
      )}

      {/* Style Quiz */}
      <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(350).delay(160)} style={{ marginTop: Space.lg }}>
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
    paddingTop: Space.sm,
    paddingBottom: Space.xl,
  },

  /* Trending Rail */
  trendingScroll: {
    paddingHorizontal: Space.md,
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
  },

  /* Window Tabs */
  windowTabs: {
    flexDirection: 'row',
    paddingHorizontal: Space.md,
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

  /* Quiz Card */
  quizCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginHorizontal: Space.md,
    padding: Space.md,
    gap: Space.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
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
