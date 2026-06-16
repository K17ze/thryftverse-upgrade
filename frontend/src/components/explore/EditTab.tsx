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
import { HeroCarousel, HeroItem } from '../discover/HeroCarousel';
import { EditorialSection } from '../discover/EditorialSection';
import { FeaturedBoardCard, FeaturedBoard } from '../discover/FeaturedBoardCard';
import { EditorialImageRow, EditorialImage } from '../discover/EditorialImageRow';
import { DiscoverySectionHeader } from '../discover/DiscoverySectionHeader';

const { width: SCREEN_W } = Dimensions.get('window');

type NavT = StackNavigationProp<RootStackParamList>;

/* ── Editorial seed data ── */
const HERO_ITEMS: HeroItem[] = [
  { id: 'hero1', type: 'image', uri: '', title: 'The Archive Issue', ctaLabel: 'Read' },
  { id: 'hero2', type: 'image', uri: '', title: 'Winter Layering Guide', ctaLabel: 'Explore' },
  { id: 'hero3', type: 'image', uri: '', title: 'Streetwear Essentials 2026', ctaLabel: 'Shop' },
];

const FEATURED_BOARDS: FeaturedBoard[] = [
  { id: 'board1', title: 'Gorpcore Gods', subtitle: 'Editors Pick', meta: '42 Items • Hot', isVerified: true, images: ['', '', ''] },
  { id: 'board2', title: 'Vintage Denim', subtitle: 'Community', meta: '128 Items • Curated', isVerified: false, images: ['', '', ''] },
  { id: 'board3', title: 'Minimal Wardrobe', subtitle: 'Editors Pick', meta: '56 Items • New', isVerified: true, images: ['', '', ''] },
];

const EDITORIAL_SECTIONS: { id: string; kicker: string; title: string; images: EditorialImage[] }[] = [
  { id: 'sec1', kicker: 'Ideas for you', title: 'Shirt dress outfit', images: [{ id: 'e1-1', uri: '', aspectRatio: 1.4 }, { id: 'e1-2', uri: '', aspectRatio: 1.2 }, { id: 'e1-3', uri: '', aspectRatio: 1.5 }, { id: 'e1-4', uri: '', aspectRatio: 1.1 }] },
  { id: 'sec2', kicker: 'Brand deep dive', title: 'Comme des Garçons Archive', images: [{ id: 'e2-1', uri: '', aspectRatio: 1.3 }, { id: 'e2-2', uri: '', aspectRatio: 1.1 }, { id: 'e2-3', uri: '', aspectRatio: 1.4 }, { id: 'e2-4', uri: '', aspectRatio: 1.2 }] },
];

const DROP_CALENDAR = [
  { id: 'drop1', date: 'Today', title: 'YSL Knit Auction Ends', time: '18:00 GMT', image: '' },
  { id: 'drop2', date: 'Tomorrow', title: 'New Arrivals: Japanese Denim', time: '09:00 GMT', image: '' },
  { id: 'drop3', date: 'Jun 3', title: 'Vintage Sneaker Drop', time: '12:00 GMT', image: '' },
];

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

function DropCalendarItem({ item, onPress, index }: { item: typeof DROP_CALENDAR[0]; onPress: () => void; index: number }) {
  return (
    <Reanimated.View entering={FadeInDown.duration(350).delay(index * 70).springify()}>
      <AnimatedPressable style={styles.dropItem} onPress={onPress} activeOpacity={0.92}>
        <CachedImage uri={item.image} style={styles.dropImage} containerStyle={{ borderRadius: Radius.md }} contentFit="cover" />
        <View style={styles.dropInfo}>
          <Text style={styles.dropDate}>{item.date}</Text>
          <Text style={styles.dropTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.dropTime}>{item.time}</Text>
        </View>
        <View style={styles.dropAction}>
          <Text style={styles.dropActionText}>Remind</Text>
          <Ionicons name="chevron-forward" size={14} color={Colors.brand} />
        </View>
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

  const trendingListings = React.useMemo(() => {
    return [...listings]
      .filter((l) => l.images && l.images.length > 0)
      .sort((a, b) => (b.views ?? 0) - (a.views ?? 0))
      .slice(0, 10)
      .map((l) => ({
        id: l.id,
        title: l.title,
        brand: l.brand,
        price: l.price,
        image: l.images[0] ?? '',
      }));
  }, [listings]);

  const handleHeroAction = (item: HeroItem) => { haptic.light(); navigation.navigate('Browse', { categoryId: 'all', title: item.title }); };
  const handleBoardPress = (boardId: string) => { haptic.light(); navigation.navigate('Browse', { categoryId: 'search', title: FEATURED_BOARDS.find(b => b.id === boardId)?.title ?? 'Browse' }); };
  const handleEditorialImagePress = (id: string) => { haptic.light(); navigation.push('ItemDetail', { itemId: id }); };
  const handleDropPress = (item: typeof DROP_CALENDAR[0]) => { haptic.light(); navigation.navigate('Browse', { categoryId: 'all', title: item.title }); };

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

      {/* Hero Carousel */}
      <Reanimated.View entering={FadeInDown.duration(300).delay(trendingListings.length > 0 ? 60 : 0)}>
        <HeroCarousel items={HERO_ITEMS.map((h) => ({ ...h, ctaAction: () => handleHeroAction(h) }))} autoPlayInterval={6000} />
      </Reanimated.View>

      {/* Featured Boards */}
      <Reanimated.View entering={FadeInDown.duration(350).delay(80)} style={{ marginTop: Space.md }}>
        <DiscoverySectionHeader
          kicker="Curated by editors"
          title="Collections We Love"
          actionLabel="Explore"
          onAction={() => navigation.navigate('Browse', { categoryId: 'all', title: 'Collections' })}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.boardsScroll}>
          {FEATURED_BOARDS.map((board) => (
            <View key={board.id} style={styles.boardWrap}>
              <FeaturedBoardCard board={{ ...board, onPress: () => handleBoardPress(board.id) }} />
            </View>
          ))}
        </ScrollView>
      </Reanimated.View>

      {/* Editorial Image Rows */}
      {EDITORIAL_SECTIONS.map((section, idx) => (
        <Reanimated.View key={section.id} entering={FadeInDown.duration(350).delay(100 + idx * 40)} style={{ marginTop: Space.lg }}>
          <DiscoverySectionHeader
            kicker={section.kicker}
            title={section.title}
            actionLabel="View"
            onAction={() => navigation.navigate('Browse', { categoryId: 'search', title: section.title })}
          />
          <EditorialImageRow images={section.images} onPressImage={handleEditorialImagePress} sharedTransitionPrefix={`explore-edit-${section.id}`} />
        </Reanimated.View>
      ))}

      {/* Seasonal Theme Banner */}
      <Reanimated.View entering={FadeInDown.duration(350).delay(160)} style={{ marginTop: Space.lg }}>
        <DiscoverySectionHeader
          kicker="This Season"
          title="Summer Essentials"
        />
        <AnimatedPressable style={styles.seasonBanner} onPress={() => navigation.navigate('Browse', { categoryId: 'all', title: 'Summer Collection' })} activeOpacity={0.92}>
          <CachedImage uri="" style={styles.seasonBannerImage} contentFit="cover" />
          <LinearGradient
            colors={['rgba(0,0,0,0.05)', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.75)']}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={styles.seasonBannerContent}>
            <Text style={styles.seasonBannerKicker}>This Season</Text>
            <Text style={styles.seasonBannerTitle}>Summer Essentials</Text>
            <Text style={styles.seasonBannerSub}>Light layers, linen, and sun-faded denim</Text>
            <View style={styles.seasonBannerCta}>
              <Text style={styles.seasonBannerCtaText}>Explore</Text>
              <Ionicons name="arrow-forward" size={14} color={Colors.background} />
            </View>
          </View>
        </AnimatedPressable>
      </Reanimated.View>

      {/* Brand Spotlight */}
      <Reanimated.View entering={FadeInDown.duration(350).delay(180)} style={{ marginTop: Space.lg }}>
        <DiscoverySectionHeader
          kicker="In focus"
          title="Brand Spotlight"
          actionLabel="View"
          onAction={() => navigation.navigate('Browse', { categoryId: 'search', title: 'Comme des Garçons' })}
        />
        <AnimatedPressable style={styles.brandCard} onPress={() => navigation.navigate('Browse', { categoryId: 'search', title: 'Comme des Garçons' })} activeOpacity={0.92}>
          <View style={styles.brandHeader}>
            <CachedImage uri="" style={styles.brandLogo} containerStyle={{ borderRadius: Radius.md }} contentFit="cover" />
            <View style={styles.brandInfo}>
              <Text style={styles.brandName}>Comme des Garçons</Text>
              <Text style={styles.brandMeta}>Archive · 42 items · Verified</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.brandGallery}>
            {['', '', '', ''].map((uri, i) => (
              <CachedImage key={i} uri={uri} style={styles.brandGalleryImg} containerStyle={{ borderRadius: Radius.md }} contentFit="cover" />
            ))}
          </ScrollView>
          <View style={styles.brandAccent}>
            <LinearGradient
              colors={[Colors.brand, 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.brandAccentLine}
            />
          </View>
        </AnimatedPressable>
      </Reanimated.View>

      {/* Style Quiz Teaser */}
      <Reanimated.View entering={FadeInDown.duration(350).delay(200)} style={{ marginTop: Space.lg }}>
        <DiscoverySectionHeader
          kicker="Personalise"
          title="Find Your Aesthetic"
        />
        <AnimatedPressable style={styles.quizCard} onPress={() => show('Style Quiz coming soon', 'info')} activeOpacity={0.92}>
          <View style={styles.quizContent}>
            <Text style={styles.quizTitle}>Discover your style</Text>
            <Text style={styles.quizSub}>Take a 2-minute quiz to discover your personal style and get curated picks.</Text>
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

      {/* Drop Calendar */}
      <Reanimated.View entering={FadeInDown.duration(350).delay(220)} style={{ marginTop: Space.lg }}>
        <DiscoverySectionHeader
          kicker="Don't miss"
          title="Drop Calendar"
        />
        <View style={styles.calendarCard}>
          {DROP_CALENDAR.map((item, i) => (
            <DropCalendarItem key={item.id} item={item} onPress={() => handleDropPress(item)} index={i} />
          ))}
        </View>
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

  boardsScroll: {
    paddingHorizontal: Space.md,
    gap: Space.sm,
  },
  boardWrap: {
    marginRight: Space.sm,
  },

  /* Season Banner */
  seasonBanner: {
    marginHorizontal: Space.md,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    height: 220,
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  seasonBannerImage: {
    width: '100%',
    height: '100%',
  },
  seasonBannerContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: Space.lg,
  },
  seasonBannerKicker: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    color: 'rgba(255,255,255,0.85)',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  seasonBannerTitle: {
    fontSize: Type.title.size,
    fontFamily: Typography.family.bold,
    color: '#fff',
    letterSpacing: Type.title.letterSpacing,
    marginTop: 4,
  },
  seasonBannerSub: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 4,
    lineHeight: 20,
  },
  seasonBannerCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: Space.md,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.full,
  },
  seasonBannerCtaText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    color: '#fff',
  },

  /* Brand Spotlight */
  brandCard: {
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
    overflow: 'hidden',
  },
  brandHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  brandLogo: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceAlt,
  },
  brandInfo: {
    flex: 1,
    gap: 2,
  },
  brandName: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
    letterSpacing: Type.subtitle.letterSpacing,
  },
  brandMeta: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.medium,
    color: Colors.textMuted,
    letterSpacing: Type.meta.letterSpacing,
  },
  brandGallery: {
    gap: Space.sm,
  },
  brandGalleryImg: {
    width: 88,
    height: 88,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceAlt,
  },
  brandAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  brandAccentLine: {
    width: '100%',
    height: '100%',
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

  /* Drop Calendar */
  calendarCard: {
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
  dropItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingVertical: Space.sm,
  },
  dropImage: {
    width: 64,
    height: 64,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceAlt,
  },
  dropInfo: {
    flex: 1,
    gap: 3,
  },
  dropDate: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    color: Colors.brand,
    letterSpacing: Type.meta.letterSpacing,
    textTransform: 'uppercase',
  },
  dropTitle: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
    letterSpacing: Type.body.letterSpacing,
  },
  dropTime: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.medium,
    color: Colors.textMuted,
    letterSpacing: Type.meta.letterSpacing,
  },
  dropAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.surfaceAlt,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.full,
  },
  dropActionText: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    color: Colors.brand,
    letterSpacing: Type.meta.letterSpacing,
  },
});