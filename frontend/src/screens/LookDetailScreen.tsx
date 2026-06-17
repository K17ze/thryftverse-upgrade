import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Dimensions,
  StatusBar,
  Pressable,
} from 'react-native';
import Reanimated, { FadeInDown, useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useBackendData } from '../context/BackendDataContext';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { CachedImage } from '../components/CachedImage';
import { Colors } from '../constants/colors';
import { Type, Space, Radius, Typography } from '../theme/designTokens';
import { useHaptic } from '../hooks/useHaptic';
import { useToast } from '../context/ToastContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { EmptyState } from '../components/EmptyState';
import { SkeletonLoader } from '../components/SkeletonLoader';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

type NavT = StackNavigationProp<RootStackParamList>;
type RouteT = RouteProp<RootStackParamList, 'LookDetail'>;

interface TaggedListing {
  id: string;
  label: string;
  x: number;
  y: number;
  listingId?: string;
  listingTitle?: string;
  listingPrice?: number;
  listingImage?: string;
  listingBrand?: string;
}

export default function LookDetailScreen() {
  const route = useRoute<RouteT>();
  const navigation = useNavigation<NavT>();
  const haptic = useHaptic();
  const { show } = useToast();
  const { listings } = useBackendData();
  const reducedMotion = useReducedMotion();

  const { lookId } = route.params;
  const userLooks = useStore((state) => state.userLooks);
  const toggleUserLookLike = useStore((state) => state.toggleUserLookLike);
  const currentUser = useStore((state) => state.currentUser);

  const look = userLooks.find((l) => l.id === lookId);

  const [activeTagId, setActiveTagId] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);

  const scale = useSharedValue(1);

  const handleLike = () => {
    haptic.medium();
    toggleUserLookLike(lookId);
  };

  const handleSave = () => {
    haptic.medium();
    setIsSaved((s) => !s);
    show(!isSaved ? 'Saved to closet' : 'Removed from closet', 'info');
  };

  const handleShare = () => {
    haptic.light();
    show('Link copied to clipboard', 'success');
  };

  const resolveListing = (tag: TaggedListing) => {
    if (tag.listingId) {
      return listings.find((l) => l.id === tag.listingId);
    }
    return undefined;
  };

  const handleTagPress = (tag: TaggedListing) => {
    haptic.light();
    const listing = resolveListing(tag);
    if (listing) {
      navigation.push('ItemDetail', { itemId: listing.id });
    } else {
      show('This item is no longer available', 'info');
    }
  };

  const isOwner = currentUser?.id && look?.creator?.name === currentUser.username;

  if (!look) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.headerRow}>
          <AnimatedPressable style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.85}>
            <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
          </AnimatedPressable>
        </View>
        <EmptyState
          icon="images-outline"
          title="Look not found"
          subtitle="This look may have been removed or is unavailable."
          ctaLabel="Back to Explore"
          onCtaPress={() => navigation.goBack()}
        />
      </SafeAreaView>
    );
  }

  const likeCount = look.likes;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" />

      {/* Floating Header */}
      <View style={styles.headerRow}>
        <AnimatedPressable style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.85}>
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </AnimatedPressable>
        <View style={styles.headerActions}>
          {isOwner && (
            <AnimatedPressable style={styles.headerBtn} onPress={() => show('Edit look coming soon', 'info')} activeOpacity={0.85}>
              <Ionicons name="create-outline" size={20} color={Colors.textPrimary} />
            </AnimatedPressable>
          )}
          <AnimatedPressable style={styles.headerBtn} onPress={handleShare} activeOpacity={0.85}>
            <Ionicons name="share-outline" size={20} color={Colors.textPrimary} />
          </AnimatedPressable>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Hero Image */}
        <Reanimated.View entering={reducedMotion ? undefined : FadeInDown.duration(300)}>
          <View style={styles.heroWrap}>
            <CachedImage
              uri={look.coverImage}
              style={styles.heroImage}
              contentFit="cover"
              emptyLabel={look.title}
              emptyIcon="image-outline"
            />

            {/* Hotspots */}
            {look.items.map((item) => {
              const isActive = activeTagId === item.id;
              const listing = resolveListing(item as TaggedListing);
              return (
                <Pressable
                  key={item.id}
                  style={[styles.hotspotWrap, { left: `${(item.x * 100)}%`, top: `${(item.y * 100)}%` }]}
                  onPress={() => {
                    setActiveTagId(isActive ? null : item.id);
                    if (!isActive && listing) handleTagPress(item as TaggedListing);
                  }}
                  hitSlop={20}
                >
                  <View style={[styles.hotspotDot, isActive && styles.hotspotDotActive]} />
                  {isActive && listing && (
                    <Reanimated.View entering={FadeInDown.duration(180)} style={styles.tagTooltip}>
                      {listing.images?.[0] && (
                        <CachedImage uri={listing.images[0]} style={styles.tagTooltipImg} containerStyle={{ borderRadius: 4 }} contentFit="cover" />
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={styles.tagTooltipTitle} numberOfLines={1}>{listing.title}</Text>
                        <Text style={styles.tagTooltipPrice}>£{listing.price}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.7)" />
                    </Reanimated.View>
                  )}
                </Pressable>
              );
            })}

            <LinearGradient colors={['transparent', 'rgba(0,0,0,0.45)']} style={styles.heroGradient} />
          </View>
        </Reanimated.View>

        {/* Info */}
        <Reanimated.View entering={reducedMotion ? undefined : FadeInDown.duration(350).delay(80)} style={styles.infoSection}>
          <Text style={styles.title}>{look.title}</Text>
          <View style={styles.creatorRow}>
            <View style={styles.creatorAvatar}>
              {look.creator.avatar ? (
                <CachedImage uri={look.creator.avatar} style={styles.creatorAvatarImg} contentFit="cover" />
              ) : (
                <Ionicons name="person-circle" size={32} color={Colors.textMuted} />
              )}
            </View>
            <View style={styles.creatorInfo}>
              <Text style={styles.creatorName}>@{look.creator.name}</Text>
              <Text style={styles.creatorMeta}>{look.items.length} items tagged</Text>
            </View>
          </View>
        </Reanimated.View>

        {/* Action Bar */}
        <Reanimated.View entering={reducedMotion ? undefined : FadeInDown.duration(350).delay(120)} style={styles.actionBar}>
          <AnimatedPressable style={styles.actionBtn} onPress={handleLike} activeOpacity={0.85}>
            <Ionicons name={likeCount > 0 ? 'heart' : 'heart-outline'} size={22} color={likeCount > 0 ? Colors.danger : Colors.textPrimary} />
            <Text style={styles.actionText}>{likeCount}</Text>
          </AnimatedPressable>
          <AnimatedPressable style={styles.actionBtn} onPress={handleSave} activeOpacity={0.85}>
            <Ionicons name={isSaved ? 'bookmark' : 'bookmark-outline'} size={22} color={isSaved ? Colors.textPrimary : Colors.textPrimary} />
            <Text style={styles.actionText}>{isSaved ? 'Saved' : 'Save'}</Text>
          </AnimatedPressable>
          <AnimatedPressable style={styles.actionBtn} onPress={handleShare} activeOpacity={0.85}>
            <Ionicons name="share-outline" size={22} color={Colors.textPrimary} />
            <Text style={styles.actionText}>Share</Text>
          </AnimatedPressable>
        </Reanimated.View>

        {/* Tagged Products Tray */}
        {look.items.length > 0 && (
          <Reanimated.View entering={reducedMotion ? undefined : FadeInDown.duration(350).delay(160)} style={styles.traySection}>
            <Text style={styles.trayTitle}>Tagged Products</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.trayScroll}>
              {look.items.map((item) => {
                const listing = resolveListing(item as TaggedListing);
                return (
                  <AnimatedPressable
                    key={item.id}
                    style={styles.trayCard}
                    onPress={() => listing ? handleTagPress(item as TaggedListing) : show('Item unavailable', 'info')}
                    activeOpacity={0.9}
                    accessibilityRole="button"
                    accessibilityLabel={listing ? `${listing.title} by ${listing.brand}` : 'Unavailable item'}
                  >
                    <View style={styles.trayImgWrap}>
                      {listing?.images?.[0] ? (
                        <CachedImage uri={listing.images[0]} style={styles.trayImg} contentFit="cover" />
                      ) : (
                        <View style={styles.trayImgEmpty}>
                          <Ionicons name="pricetag" size={20} color={Colors.textMuted} />
                        </View>
                      )}
                      {!listing && (
                        <View style={styles.unavailableOverlay}>
                          <Text style={styles.unavailableText}>Unavailable</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.trayCardTitle} numberOfLines={1}>{listing?.title ?? item.label}</Text>
                    {listing && <Text style={styles.trayCardPrice}>£{listing.price}</Text>}
                  </AnimatedPressable>
                );
              })}
            </ScrollView>
          </Reanimated.View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  headerRow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    zIndex: 10,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerActions: { flexDirection: 'row', gap: 8 },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: { paddingBottom: 24 },
  heroWrap: {
    width: SCREEN_W,
    height: SCREEN_W * 1.15,
    position: 'relative',
    backgroundColor: Colors.surfaceAlt,
    overflow: 'hidden',
  },
  heroImage: { width: '100%', height: '100%' },
  heroGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 120,
  },
  hotspotWrap: {
    position: 'absolute',
    width: 44,
    height: 44,
    marginLeft: -22,
    marginTop: -22,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
  },
  hotspotDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderWidth: 2,
    borderColor: 'rgba(0,0,0,0.25)',
  },
  hotspotDotActive: {
    backgroundColor: Colors.brand,
    borderColor: '#fff',
  },
  tagTooltip: {
    position: 'absolute',
    top: 24,
    left: -80,
    width: 180,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.88)',
    borderRadius: 12,
    padding: 8,
  },
  tagTooltipImg: { width: 36, height: 36, borderRadius: 6, backgroundColor: Colors.surfaceAlt },
  tagTooltipTitle: { fontSize: 11, fontFamily: Typography.family.semibold, color: '#fff' },
  tagTooltipPrice: { fontSize: 10, fontFamily: Typography.family.medium, color: 'rgba(255,255,255,0.7)' },

  infoSection: {
    paddingHorizontal: Space.md,
    paddingTop: Space.lg,
    gap: Space.sm,
  },
  title: {
    fontSize: Type.title.size,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    letterSpacing: Type.title.letterSpacing,
  },
  creatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  creatorAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  creatorAvatarImg: { width: 36, height: 36, borderRadius: 18 },
  creatorInfo: { gap: 2 },
  creatorName: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  creatorMeta: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.medium,
    color: Colors.textMuted,
  },

  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    marginTop: Space.md,
    marginHorizontal: Space.md,
    padding: Space.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: Radius.md,
  },
  actionText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },

  traySection: {
    marginTop: Space.lg,
    paddingHorizontal: Space.md,
  },
  trayTitle: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    marginBottom: Space.sm,
  },
  trayScroll: {
    gap: Space.sm,
  },
  trayCard: {
    width: 140,
    gap: 4,
  },
  trayImgWrap: {
    width: 140,
    height: 170,
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceAlt,
    position: 'relative',
  },
  trayImg: { width: '100%', height: '100%' },
  trayImgEmpty: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceAlt,
  },
  trayCardTitle: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
    marginTop: 4,
  },
  trayCardPrice: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.bold,
    color: Colors.brand,
  },
  unavailableOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  unavailableText: {
    fontSize: 11,
    fontFamily: Typography.family.semibold,
    color: '#fff',
  },
});
