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
import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';
import { Colors } from '../../constants/colors';
import { Type, Space, Radius } from '../../theme/designTokens';
import { Typography } from '../../constants/typography';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../navigation/types';
import { useHaptic } from '../../hooks/useHaptic';
import { useToast } from '../../context/ToastContext';
import { HeroCarousel, HeroItem } from '../discover/HeroCarousel';
import { EditorialSection } from '../discover/EditorialSection';
import { FeaturedBoardCard, FeaturedBoard } from '../discover/FeaturedBoardCard';
import { EditorialImageRow, EditorialImage } from '../discover/EditorialImageRow';

const { width: SCREEN_W } = Dimensions.get('window');

type NavT = StackNavigationProp<RootStackParamList>;

/* ── Editorial seed data ── */
const HERO_ITEMS: HeroItem[] = [
  { id: 'hero1', type: 'image', uri: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=800&q=80', title: 'The Archive Issue', ctaLabel: 'Read' },
  { id: 'hero2', type: 'image', uri: 'https://images.unsplash.com/photo-1509631179647-0177331693ae?w=800&q=80', title: 'Winter Layering Guide', ctaLabel: 'Explore' },
  { id: 'hero3', type: 'image', uri: 'https://images.unsplash.com/photo-1552374196-1ab2a1c593e8?w=800&q=80', title: 'Streetwear Essentials 2026', ctaLabel: 'Shop' },
];

const FEATURED_BOARDS: FeaturedBoard[] = [
  { id: 'board1', title: 'Gorpcore Gods', subtitle: 'Editors Pick', meta: '42 Items • Hot', isVerified: true, images: ['https://images.unsplash.com/photo-1509631179647-0177331693ae?w=400&q=80', 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=400&q=80', 'https://images.unsplash.com/photo-1433086966358-a548c30072b5?w=400&q=80'] },
  { id: 'board2', title: 'Vintage Denim', subtitle: 'Community', meta: '128 Items • Curated', isVerified: false, images: ['https://images.unsplash.com/photo-1542751371-adc38448a05e?w=400&q=80', 'https://images.unsplash.com/photo-1593305841991-05c29736f97c?w=400&q=80', 'https://images.unsplash.com/photo-1616499370260-485b3e5ed653?w=400&q=80'] },
  { id: 'board3', title: 'Minimal Wardrobe', subtitle: 'Editors Pick', meta: '56 Items • New', isVerified: true, images: ['https://images.unsplash.com/photo-1552374196-1ab2a1c593e8?w=400&q=80', 'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?w=400&q=80', 'https://images.unsplash.com/photo-1485231183945-ef89e404cf89?w=400&q=80'] },
];

const EDITORIAL_SECTIONS: { id: string; kicker: string; title: string; images: EditorialImage[] }[] = [
  { id: 'sec1', kicker: 'Ideas for you', title: 'Shirt dress outfit', images: [{ id: 'e1-1', uri: 'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=400&q=80', aspectRatio: 1.4 }, { id: 'e1-2', uri: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=400&q=80', aspectRatio: 1.2 }, { id: 'e1-3', uri: 'https://images.unsplash.com/photo-1581044777550-4cfa60707efb?w=400&q=80', aspectRatio: 1.5 }, { id: 'e1-4', uri: 'https://images.unsplash.com/photo-1434389677669-e08b4a3a7a5e?w=400&q=80', aspectRatio: 1.1 }] },
  { id: 'sec2', kicker: 'Brand deep dive', title: 'Comme des Garçons Archive', images: [{ id: 'e2-1', uri: 'https://images.unsplash.com/photo-1509631179647-0177331693ae?w=400&q=80', aspectRatio: 1.3 }, { id: 'e2-2', uri: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=400&q=80', aspectRatio: 1.1 }, { id: 'e2-3', uri: 'https://images.unsplash.com/photo-1552374196-1ab2a1c593e8?w=400&q=80', aspectRatio: 1.4 }, { id: 'e2-4', uri: 'https://images.unsplash.com/photo-1485231183945-ef89e404cf89?w=400&q=80', aspectRatio: 1.2 }] },
];

const DROP_CALENDAR = [
  { id: 'drop1', date: 'Today', title: 'YSL Knit Auction Ends', time: '18:00 GMT', image: 'https://images.unsplash.com/photo-1509631179647-0177331693ae?w=200&q=80' },
  { id: 'drop2', date: 'Tomorrow', title: 'New Arrivals: Japanese Denim', time: '09:00 GMT', image: 'https://images.unsplash.com/photo-1552374196-1ab2a1c593e8?w=200&q=80' },
  { id: 'drop3', date: 'Jun 3', title: 'Vintage Sneaker Drop', time: '12:00 GMT', image: 'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=200&q=80' },
];

/* ── Sub-components ── */
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
        <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
      </AnimatedPressable>
    </Reanimated.View>
  );
}

/* ── Main Tab ── */
export default function EditTab() {
  const navigation = useNavigation<NavT>();
  const haptic = useHaptic();
  const { show } = useToast();

  const handleHeroAction = (item: HeroItem) => { haptic.light(); navigation.navigate('Browse', { categoryId: 'all', title: item.title }); };
  const handleBoardPress = (boardId: string) => { haptic.light(); navigation.navigate('Browse', { categoryId: 'search', title: FEATURED_BOARDS.find(b => b.id === boardId)?.title ?? 'Browse' }); };
  const handleEditorialImagePress = (id: string) => { haptic.light(); navigation.push('ItemDetail', { itemId: id }); };
  const handleDropPress = (item: typeof DROP_CALENDAR[0]) => { haptic.light(); navigation.navigate('Browse', { categoryId: 'all', title: item.title }); };

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
      {/* Hero Carousel */}
      <Reanimated.View entering={FadeInDown.duration(300)}>
        <HeroCarousel items={HERO_ITEMS.map((h) => ({ ...h, ctaAction: () => handleHeroAction(h) }))} autoPlayInterval={6000} />
      </Reanimated.View>

      {/* Featured Boards */}
      <EditorialSection kicker="Curated by editors" title="Collections We Love" style={{ marginTop: Space.md }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.boardsScroll}>
          {FEATURED_BOARDS.map((board) => (
            <View key={board.id} style={styles.boardWrap}>
              <FeaturedBoardCard board={{ ...board, onPress: () => handleBoardPress(board.id) }} />
            </View>
          ))}
        </ScrollView>
      </EditorialSection>

      {/* Editorial Image Rows */}
      {EDITORIAL_SECTIONS.map((section) => (
        <Reanimated.View key={section.id} entering={FadeInDown.duration(350).delay(100)}>
          <EditorialSection kicker={section.kicker} title={section.title} onSearchPress={() => navigation.navigate('Browse', { categoryId: 'search', title: section.title })}>
            <EditorialImageRow images={section.images} onPressImage={handleEditorialImagePress} sharedTransitionPrefix={`explore-edit-${section.id}`} />
          </EditorialSection>
        </Reanimated.View>
      ))}

      {/* Seasonal Theme Banner */}
      <Reanimated.View entering={FadeInDown.duration(350).delay(120)}>
        <AnimatedPressable style={styles.seasonBanner} onPress={() => navigation.navigate('Browse', { categoryId: 'all', title: 'Summer Collection' })} activeOpacity={0.92}>
          <CachedImage uri="https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=600&q=80" style={styles.seasonBannerImage} containerStyle={{ borderRadius: Radius.lg }} contentFit="cover" />
          <View style={styles.seasonBannerOverlay}>
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
      <Reanimated.View entering={FadeInDown.duration(350).delay(140)}>
        <Text style={[styles.sectionTitle, { marginTop: Space.lg }]}>Brand Spotlight</Text>
        <AnimatedPressable style={styles.brandCard} onPress={() => navigation.navigate('Browse', { categoryId: 'search', title: 'Comme des Garçons' })} activeOpacity={0.92}>
          <View style={styles.brandHeader}>
            <CachedImage uri="https://images.unsplash.com/photo-1509631179647-0177331693ae?w=200&q=80" style={styles.brandLogo} containerStyle={{ borderRadius: Radius.md }} contentFit="cover" />
            <View style={styles.brandInfo}>
              <Text style={styles.brandName}>Comme des Garçons</Text>
              <Text style={styles.brandMeta}>Archive · 42 items · Verified</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.brandGallery}>
            {[
              'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=200&q=80',
              'https://images.unsplash.com/photo-1552374196-1ab2a1c593e8?w=200&q=80',
              'https://images.unsplash.com/photo-1485231183945-ef89e404cf89?w=200&q=80',
              'https://images.unsplash.com/photo-1507679799987-c73779b96318?w=200&q=80',
            ].map((uri, i) => (
              <CachedImage key={i} uri={uri} style={styles.brandGalleryImg} containerStyle={{ borderRadius: Radius.md }} contentFit="cover" />
            ))}
          </ScrollView>
        </AnimatedPressable>
      </Reanimated.View>

      {/* Style Quiz Teaser */}
      <Reanimated.View entering={FadeInDown.duration(350).delay(160)}>
        <AnimatedPressable style={styles.quizCard} onPress={() => show('Style Quiz coming soon', 'info')} activeOpacity={0.92}>
          <View style={styles.quizContent}>
            <Text style={styles.quizTitle}>Find Your Aesthetic</Text>
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
      <Reanimated.View entering={FadeInDown.duration(350).delay(180)}>
        <Text style={[styles.sectionTitle, { marginTop: Space.lg }]}>Drop Calendar</Text>
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
  sectionTitle: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    letterSpacing: Type.subtitle.letterSpacing,
    paddingHorizontal: Space.md,
    marginBottom: Space.sm,
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
    height: 180,
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
  seasonBannerOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: Space.md,
    backgroundColor: 'rgba(0,0,0,0.45)',
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
    marginTop: 2,
  },
  seasonBannerSub: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
  seasonBannerCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: Space.sm,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
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
    padding: Space.sm,
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
    gap: Space.sm,
    paddingVertical: 6,
  },
  dropImage: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceAlt,
  },
  dropInfo: {
    flex: 1,
    gap: 2,
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
});
