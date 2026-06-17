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
import { Colors } from '../../constants/colors';
import { Type, Space, Radius, Typography } from '../../theme/designTokens';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../navigation/types';
import { useHaptic } from '../../hooks/useHaptic';
import { useToast } from '../../context/ToastContext';
import { useBackendData } from '../../context/BackendDataContext';
import { DiscoverySectionHeader } from '../discover/DiscoverySectionHeader';

const { width: SCREEN_W } = Dimensions.get('window');

type NavT = StackNavigationProp<RootStackParamList>;

/* ── Sub-components ── */
function TrendingRailItem({ item, index, onPress }: { item: { id: string; title: string; brand: string; price: number; image: string }; index: number; onPress: () => void }) {
  return (
    <Reanimated.View entering={FadeInDown.duration(350).delay(index * 60).springify()}>
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
  const navigation = useNavigation<NavT>();
  const haptic = useHaptic();
  const { show } = useToast();
  const { listings } = useBackendData();

  const toRailItem = (l: typeof listings[0]) => ({
    id: l.id,
    title: l.title,
    brand: l.brand,
    price: l.price,
    image: l.images[0] ?? '',
  });

  const trendingListings = React.useMemo(() => {
    return [...listings]
      .filter((l) => l.images && l.images.length > 0)
      .sort((a, b) => (b.views ?? 0) - (a.views ?? 0))
      .slice(0, 10)
      .map(toRailItem);
  }, [listings]);

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
        <Reanimated.View entering={FadeInDown.duration(300)}>
          <DiscoverySectionHeader
            kicker="What's hot"
            title="Trending Now"
            actionLabel="See all"
            onAction={() => navigation.navigate('Browse', { categoryId: 'all', title: 'Trending' })}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.trendingScroll}>
            {trendingListings.map((item, i) => (
              <TrendingRailItem
                key={item.id}
                item={item}
                index={i}
                onPress={() => { haptic.light(); navigation.push('ItemDetail', { itemId: item.id }); }}
              />
            ))}
          </ScrollView>
        </Reanimated.View>
      )}

      {/* New Arrivals */}
      {newestListings.length > 0 && (
        <Reanimated.View entering={FadeInDown.duration(350).delay(80)} style={{ marginTop: Space.lg }}>
          <DiscoverySectionHeader
            kicker="Fresh listings"
            title="New Arrivals"
            actionLabel="See all"
            onAction={() => handleExploreCollection({ title: 'New Arrivals', source: { type: 'newest' } })}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.trendingScroll}>
            {newestListings.map((item, i) => (
              <TrendingRailItem
                key={item.id}
                item={item}
                index={i}
                onPress={() => { haptic.light(); navigation.push('ItemDetail', { itemId: item.id }); }}
              />
            ))}
          </ScrollView>
        </Reanimated.View>
      )}

      {/* Price Drops */}
      {priceDropListings.length > 0 && (
        <Reanimated.View entering={FadeInDown.duration(350).delay(120)} style={{ marginTop: Space.lg }}>
          <DiscoverySectionHeader
            kicker="Reduced"
            title="Price Drops"
            actionLabel="See all"
            onAction={() => handleExploreCollection({ title: 'Price Drops', source: { type: 'price_drop' } })}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.trendingScroll}>
            {priceDropListings.map((item, i) => (
              <TrendingRailItem
                key={item.id}
                item={item}
                index={i}
                onPress={() => { haptic.light(); navigation.push('ItemDetail', { itemId: item.id }); }}
              />
            ))}
          </ScrollView>
        </Reanimated.View>
      )}

      {/* Style Quiz */}
      <Reanimated.View entering={FadeInDown.duration(350).delay(160)} style={{ marginTop: Space.lg }}>
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
            <Ionicons name="color-wand" size={28} color={Colors.brand} />
          </View>
        </AnimatedPressable>
      </Reanimated.View>

      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
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
    backgroundColor: Colors.surfaceAlt,
  },
  trendingBrand: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.medium,
    color: Colors.textMuted,
    letterSpacing: Type.meta.letterSpacing,
    marginTop: 4,
  },
  trendingTitle: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
    letterSpacing: Type.body.letterSpacing,
  },
  trendingPrice: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.bold,
    color: Colors.brand,
    letterSpacing: Type.caption.letterSpacing,
  },

  /* Quiz Card */
  quizCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
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
    color: Colors.textPrimary,
    letterSpacing: Type.subtitle.letterSpacing,
  },
  quizSub: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: Colors.textSecondary,
    letterSpacing: Type.caption.letterSpacing,
    lineHeight: 18,
  },
  quizPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  quizPill: {
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  quizPillText: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    color: Colors.brand,
    letterSpacing: Type.meta.letterSpacing,
  },
  quizIconWrap: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
});