import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  ScrollView,
  Pressable,
} from 'react-native';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';
import { SharedTransitionView } from '../SharedTransitionView';
import { Colors } from '../../constants/colors';
import { Type, Space, Radius } from '../../theme/designTokens';
import { Typography } from '../../constants/typography';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../navigation/types';
import { useHaptic } from '../../hooks/useHaptic';
import { useToast } from '../../context/ToastContext';
import { useStore } from '../../store/useStore';
import { EmptyState } from '../EmptyState';
import { useBackendData } from '../../context/BackendDataContext';

const { width: SCREEN_W } = Dimensions.get('window');

type NavT = StackNavigationProp<RootStackParamList>;

/* ── Look data ── */
interface LookItem {
  id: string;
  title: string;
  coverImage: string;
  items: { id: string; label: string; x: number; y: number }[];
  creator: { name: string; avatar: string };
  likes: number;
  comments: number;
  saved: boolean;
}

const LOOKS_SEED: LookItem[] = [
  {
    id: 'look1',
    title: 'Winter Layers',
    coverImage: 'https://images.unsplash.com/photo-1509631179647-0177331693ae?w=600&q=80',
    items: [
      { id: 'l5', label: 'Off-White Hoodie', x: 0.2, y: 0.3 },
      { id: 'l7', label: 'Cargo Trousers', x: 0.6, y: 0.65 },
      { id: 'l6', label: 'Air Max 90', x: 0.5, y: 0.85 },
    ],
    creator: { name: 'mariefullery', avatar: 'https://picsum.photos/seed/user1/80/80' },
    likes: 234,
    comments: 18,
    saved: true,
  },
  {
    id: 'look2',
    title: 'Minimal Monochrome',
    coverImage: 'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?w=600&q=80',
    items: [
      { id: 'l2', label: 'AMI Striped Shirt', x: 0.35, y: 0.25 },
      { id: 'l3', label: 'RL Harrington', x: 0.7, y: 0.4 },
    ],
    creator: { name: 'scott_art', avatar: 'https://picsum.photos/seed/user2/80/80' },
    likes: 156,
    comments: 12,
    saved: true,
  },
  {
    id: 'look3',
    title: 'Streetwear Daily',
    coverImage: 'https://images.unsplash.com/photo-1552374196-1ab2a1c593e8?w=600&q=80',
    items: [
      { id: 'l4', label: 'Stussy Logo Tee', x: 0.4, y: 0.3 },
      { id: 'l9', label: 'Represent Hoodie', x: 0.25, y: 0.15 },
      { id: 'l10', label: 'Chuck Taylor', x: 0.6, y: 0.8 },
    ],
    creator: { name: 'dankdunksuk', avatar: 'https://picsum.photos/seed/user3/80/80' },
    likes: 89,
    comments: 7,
    saved: true,
  },
  {
    id: 'look4',
    title: 'Vintage Denim Fit',
    coverImage: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=600&q=80',
    items: [
      { id: 'l11', label: 'Levis 501', x: 0.5, y: 0.55 },
      { id: 'l12', label: 'Carhartt Detroit', x: 0.3, y: 0.2 },
    ],
    creator: { name: 'vintagelover', avatar: 'https://picsum.photos/seed/user4/80/80' },
    likes: 312,
    comments: 24,
    saved: false,
  },
  {
    id: 'look5',
    title: 'Techwear Essentials',
    coverImage: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=600&q=80',
    items: [
      { id: 'l13', label: "Arc'teryx Alpha", x: 0.45, y: 0.35 },
      { id: 'l14', label: 'ACG Pants', x: 0.55, y: 0.7 },
      { id: 'l15', label: 'Salomon XT-6', x: 0.35, y: 0.9 },
    ],
    creator: { name: 'gorpgod', avatar: 'https://picsum.photos/seed/user5/80/80' },
    likes: 178,
    comments: 15,
    saved: false,
  },
];

/* ── Animated Tag Dot ── */
function TagDot() {
  return (
    <View style={tagDotStyles.wrap}>
      <View style={tagDotStyles.ring} />
      <View style={tagDotStyles.core}>
        <View style={tagDotStyles.inner} />
      </View>
    </View>
  );
}

const tagDotStyles = StyleSheet.create({
  wrap: { width: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: 16, height: 16, borderRadius: 8, backgroundColor: Colors.brand, opacity: 0.35 },
  core: { width: 16, height: 16, borderRadius: 8, backgroundColor: Colors.brand, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 4 },
  inner: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
});

/* ── Look Card ── */
function LookCard({
  look,
  onPress,
  onLikePress,
  onCommentPress,
  onSavePress,
  isLiked,
  isSaved,
  index,
}: {
  look: LookItem;
  onPress: () => void;
  onLikePress: () => void;
  onCommentPress: () => void;
  onSavePress: () => void;
  isLiked: boolean;
  isSaved: boolean;
  index: number;
}) {
  const likeCount = look.likes + (isLiked ? 1 : 0);
  const [activeTag, setActiveTag] = useState<string | null>(null);

  return (
    <Reanimated.View entering={FadeInDown.duration(350).delay(index * 80).springify()}>
      <AnimatedPressable style={styles.card} onPress={onPress} activeOpacity={0.92}>
        {/* Cover Image */}
        <View style={styles.imageWrap}>
          <SharedTransitionView style={styles.imageShared} sharedTransitionTag={`look-${look.id}`}>
            <CachedImage
              uri={look.coverImage}
              style={styles.image}
              containerStyle={{ width: '100%', height: SCREEN_W * 1.1, borderRadius: Radius.lg }}
              contentFit="cover"
            />
          </SharedTransitionView>

          {/* Floating item tags — tap to expand label */}
          {look.items.map((item) => {
            const isActive = activeTag === item.id;
            return (
              <Pressable
                key={item.id}
                style={[styles.tagWrap, { left: `${item.x * 100}%`, top: `${item.y * 100}%` }]}
                onPress={(e) => {
                  e.stopPropagation();
                  setActiveTag(isActive ? null : item.id);
                }}
                hitSlop={16}
              >
                <TagDot />
                {isActive && (
                  <Reanimated.View entering={FadeInDown.duration(180)} style={styles.tagPill}>
                    <Text style={styles.tagPillText} numberOfLines={1}>{item.label}</Text>
                  </Reanimated.View>
                )}
              </Pressable>
            );
          })}

          {/* Tag count badge */}
          {look.items.length > 0 && (
            <View style={styles.tagBadge}>
              <Ionicons name="pricetag" size={10} color={Colors.brand} />
              <Text style={styles.tagBadgeText}>{look.items.length}</Text>
            </View>
          )}
        </View>

        {/* Bottom info row */}
        <View style={styles.infoRow}>
          <CachedImage
            uri={look.creator.avatar}
            style={styles.creatorAvatar}
            containerStyle={{ width: 32, height: 32, borderRadius: 16 }}
            contentFit="cover"
          />
          <View style={styles.infoText}>
            <Text style={styles.lookTitle}>{look.title}</Text>
            <Text style={styles.creatorName}>@{look.creator.name}</Text>
          </View>
          <View style={styles.statsRow}>
            <AnimatedPressable
              style={styles.statBtn}
              onPress={(event) => { event.stopPropagation(); onLikePress(); }}
            >
              <Ionicons name={isLiked ? 'heart' : 'heart-outline'} size={18} color={isLiked ? Colors.danger : Colors.brand} />
              <Text style={styles.statCount}>{likeCount}</Text>
            </AnimatedPressable>
            <AnimatedPressable
              style={styles.statBtn}
              onPress={(event) => { event.stopPropagation(); onCommentPress(); }}
            >
              <Ionicons name="chatbubble-outline" size={16} color={Colors.textSecondary} />
              <Text style={styles.statCount}>{look.comments}</Text>
            </AnimatedPressable>
            <AnimatedPressable
              style={styles.statBtn}
              onPress={(event) => { event.stopPropagation(); onSavePress(); }}
            >
              <Ionicons name={isSaved ? 'bookmark' : 'bookmark-outline'} size={16} color={isSaved ? Colors.brand : Colors.textSecondary} />
            </AnimatedPressable>
          </View>
        </View>
      </AnimatedPressable>
    </Reanimated.View>
  );
}

/* ── Main Tab ── */
export default function LooksTab() {
  const navigation = useNavigation<NavT>();
  const haptic = useHaptic();
  const { show } = useToast();
  const [likedLooks, setLikedLooks] = useState<Record<string, boolean>>({});
  const [savedLooks, setSavedLooks] = useState<Record<string, boolean>>({});
  const { listings } = useBackendData();
  const toggleSavedProduct = useStore((state) => state.toggleSavedProduct);

  const listingIdSet = React.useMemo(() => new Set(listings.map((item) => item.id)), [listings]);

  const handleToggleLike = React.useCallback(
    (look: LookItem) => {
      setLikedLooks((prev) => {
        const nextLiked = !prev[look.id];
        show(nextLiked ? 'Added to liked looks' : 'Removed from liked looks', 'info');
        return { ...prev, [look.id]: nextLiked };
      });
    },
    [show],
  );

  const userLooks = useStore((state) => state.userLooks);
  const allLooks = React.useMemo<LookItem[]>(
    () => [...userLooks.map((ul) => ({ ...ul, saved: false })), ...LOOKS_SEED],
    [userLooks],
  );

  const handleToggleSave = React.useCallback(
    (look: LookItem) => {
      haptic.medium();
      setSavedLooks((prev) => {
        const nextSaved = !prev[look.id];
        show(nextSaved ? 'Saved to closet' : 'Removed from closet', 'info');
        return { ...prev, [look.id]: nextSaved };
      });
      const matchId = look.items.find((item) => listingIdSet.has(item.id))?.id ?? listings[0]?.id;
      if (matchId) toggleSavedProduct(matchId);
    },
    [haptic, show, listingIdSet, listings, toggleSavedProduct],
  );

  const resolveLookItemId = React.useCallback(
    (look: LookItem) => look.items.find((entry) => listingIdSet.has(entry.id))?.id ?? listings[0]?.id,
    [listingIdSet, listings],
  );

  const handleCommentPress = React.useCallback(
    (look: LookItem) => {
      haptic.light();
      show('Comments coming soon', 'info');
    },
    [haptic, show],
  );

  if (allLooks.length === 0) {
    return (
      <EmptyState
        icon="camera-outline"
        title="No looks yet"
        subtitle="Be the first to share your style. Looks with shoppable tags coming soon."
        ctaLabel="Browse"
        onCtaPress={() => navigation.navigate('Browse', { categoryId: 'all', title: 'Browse' })}
      />
    );
  }

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.scrollContent}
    >
      {allLooks.map((look, i) => (
        <LookCard
          key={look.id}
          look={look}
          index={i}
          isLiked={!!likedLooks[look.id]}
          isSaved={!!savedLooks[look.id] || look.saved}
          onPress={() => {
            haptic.light();
            const itemId = resolveLookItemId(look);
            if (itemId) navigation.push('ItemDetail', { itemId });
          }}
          onLikePress={() => handleToggleLike(look)}
          onCommentPress={() => handleCommentPress(look)}
          onSavePress={() => handleToggleSave(look)}
        />
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
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    marginBottom: Space.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  imageWrap: {
    width: '100%',
    height: SCREEN_W * 1.1,
    position: 'relative',
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imageShared: {
    ...StyleSheet.absoluteFillObject,
  },

  /* Tags */
  tagWrap: {
    position: 'absolute',
    transform: [{ translateX: -24 }, { translateY: -24 }],
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  tagPill: {
    position: 'absolute',
    top: 22,
    left: -40,
    width: 80,
    backgroundColor: 'rgba(0,0,0,0.85)',
    borderRadius: Radius.md,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignItems: 'center',
  },
  tagPillText: {
    color: '#fff',
    fontSize: 10,
    fontFamily: Typography.family.semibold,
    letterSpacing: 0.2,
  },
  tagBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  tagBadgeText: {
    fontSize: 10,
    fontFamily: Typography.family.semibold,
    color: Colors.brand,
  },

  /* Info row */
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Space.md,
    gap: Space.sm,
  },
  creatorAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.surfaceAlt,
  },
  infoText: {
    flex: 1,
  },
  lookTitle: {
    color: Colors.textPrimary,
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.subtitle.letterSpacing,
    marginBottom: 2,
  },
  creatorName: {
    color: Colors.textMuted,
    fontSize: Type.meta.size,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.meta.letterSpacing,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  statBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statCount: {
    color: Colors.textSecondary,
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
    letterSpacing: Type.caption.letterSpacing,
  },
});
