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
import { LinearGradient } from 'expo-linear-gradient';
import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';
import { SharedTransitionView } from '../SharedTransitionView';
import { Colors } from '../../constants/colors';
import { Type, Space, Radius , Typography  } from '../../theme/designTokens';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../navigation/types';
import { useHaptic } from '../../hooks/useHaptic';
import { useToast } from '../../context/ToastContext';
import { useStore } from '../../store/useStore';
import { EmptyState } from '../EmptyState';
import { useBackendData } from '../../context/BackendDataContext';
import { DiscoverySectionHeader } from '../discover/DiscoverySectionHeader';
import { LookPreviewCard } from '../profile/LookPreviewCard';

const { width: SCREEN_W } = Dimensions.get('window');

type NavT = StackNavigationProp<RootStackParamList>;

/* ── Look data ── */
interface LookItem {
  id: string;
  title: string;
  coverImage: string;
  items: { id: string; label: string; x: number; y: number }[];
  creator: { name: string; avatar?: string };
  likes: number;
  comments: number;
  saved: boolean;
}

const LOOKS_SEED: LookItem[] = [
  {
    id: 'look1',
    title: 'Winter Layers',
    coverImage: '',
    items: [
      { id: 'l5', label: 'Off-White Hoodie', x: 0.2, y: 0.3 },
      { id: 'l7', label: 'Cargo Trousers', x: 0.6, y: 0.65 },
      { id: 'l6', label: 'Air Max 90', x: 0.5, y: 0.85 },
    ],
    creator: { name: 'mariefullery', avatar: '' },
    likes: 234,
    comments: 18,
    saved: true,
  },
  {
    id: 'look2',
    title: 'Minimal Monochrome',
    coverImage: '',
    items: [
      { id: 'l2', label: 'AMI Striped Shirt', x: 0.35, y: 0.25 },
      { id: 'l3', label: 'RL Harrington', x: 0.7, y: 0.4 },
    ],
    creator: { name: 'scott_art', avatar: '' },
    likes: 156,
    comments: 12,
    saved: true,
  },
  {
    id: 'look3',
    title: 'Streetwear Daily',
    coverImage: '',
    items: [
      { id: 'l4', label: 'Stussy Logo Tee', x: 0.4, y: 0.3 },
      { id: 'l9', label: 'Represent Hoodie', x: 0.25, y: 0.15 },
      { id: 'l10', label: 'Chuck Taylor', x: 0.6, y: 0.8 },
    ],
    creator: { name: 'dankdunksuk', avatar: '' },
    likes: 89,
    comments: 7,
    saved: true,
  },
];

/* ── Tag dot ── */
function TagDot() {
  return (
    <View style={tagDotStyles.core}>
      <View style={tagDotStyles.inner} />
    </View>
  );
}

const tagDotStyles = StyleSheet.create({
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
              containerStyle={{ width: '100%', height: '100%' }}
              contentFit="cover"
              emptyLabel={look.title}
              emptyIcon="image-outline"
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

          {/* Gradient overlay at bottom */}
          <LinearGradient
            colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.6)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.gradient}
          />

          {/* Overlaid title & creator (Instagram-style) */}
          <View style={styles.overlayInfo}>
            <Text style={styles.overlayTitle}>{look.title}</Text>
            <Text style={styles.overlayCreator}>@{look.creator.name}</Text>
          </View>

          {/* Subtle stats row overlaid at bottom-right */}
          <View style={styles.overlayStats}>
            <AnimatedPressable
              style={styles.overlayStatBtn}
              onPress={(event) => { event.stopPropagation(); onLikePress(); }}
            >
              <Ionicons name={isLiked ? 'heart' : 'heart-outline'} size={14} color={isLiked ? Colors.danger : '#fff'} />
              <Text style={styles.overlayStatCount}>{likeCount}</Text>
            </AnimatedPressable>
            <AnimatedPressable
              style={styles.overlayStatBtn}
              onPress={(event) => { event.stopPropagation(); onCommentPress(); }}
            >
              <Ionicons name="chatbubble-outline" size={13} color="rgba(255,255,255,0.9)" />
              <Text style={styles.overlayStatCount}>{look.comments}</Text>
            </AnimatedPressable>
            <AnimatedPressable
              style={styles.overlayStatBtn}
              onPress={(event) => { event.stopPropagation(); onSavePress(); }}
            >
              <Ionicons name={isSaved ? 'bookmark' : 'bookmark-outline'} size={13} color={isSaved ? Colors.brand : 'rgba(255,255,255,0.9)'} />
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
      <Reanimated.View entering={FadeInDown.duration(400)}>
        <EmptyState
          icon="camera-outline"
          title="No looks yet"
          subtitle="Be the first to share your style. Looks with shoppable tags coming soon."
          ctaLabel="Browse"
          onCtaPress={() => navigation.navigate('Browse', { categoryId: 'all', title: 'Browse' })}
          graphic={
            <View style={{ alignItems: 'center', marginBottom: Space.md }}>
              <Ionicons name="images-outline" size={48} color={Colors.brand} />
            </View>
          }
        />
      </Reanimated.View>
    );
  }

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.scrollContent}
    >
      <DiscoverySectionHeader
        kicker="Community"
        title="Looks"
      />
      {allLooks.map((look, i) => (
        <LookPreviewCard
          key={look.id}
          id={look.id}
          title={look.title}
          coverImage={look.coverImage}
          items={look.items}
          creatorName={look.creator.name}
          likes={look.likes + (likedLooks[look.id] ? 1 : 0)}
          saved={!!savedLooks[look.id] || look.saved}
          onPress={() => {
            const itemId = resolveLookItemId(look);
            if (itemId) {
              navigation.navigate('ItemDetail', { itemId });
            }
          }}
          onLike={() => handleToggleLike(look)}
          onSave={() => handleToggleSave(look)}
          index={i}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.xl,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.sm,
    marginBottom: Space.lg,
    overflow: 'hidden',
  },
  imageWrap: {
    width: '100%',
    height: SCREEN_W * 1.1,
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imageShared: {
    ...StyleSheet.absoluteFillObject,
  },
  gradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 140,
  },
  overlayInfo: {
    position: 'absolute',
    bottom: 44,
    left: Space.md,
    right: 100,
  },
  overlayTitle: {
    fontFamily: Typography.family.bold,
    fontSize: 18,
    color: '#fff',
    letterSpacing: -0.3,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  overlayCreator: {
    fontFamily: Typography.family.medium,
    fontSize: 12,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 4,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  overlayStats: {
    position: 'absolute',
    bottom: Space.sm,
    right: Space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  overlayStatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  overlayStatCount: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 11,
    fontFamily: Typography.family.semibold,
  },
  tagWrap: {
    position: 'absolute',
    zIndex: 3,
  },
  tagPill: {
    position: 'absolute',
    left: 20,
    top: -6,
    backgroundColor: 'rgba(0,0,0,0.8)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
    flexDirection: 'row',
    alignItems: 'center',
  },
  tagPillText: {
    color: '#fff',
    fontSize: 11,
    fontFamily: Typography.family.medium,
    marginLeft: 6,
  },
  tagBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
    zIndex: 2,
  },
  tagBadgeText: {
    fontSize: 11,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
});