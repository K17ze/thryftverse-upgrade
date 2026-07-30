import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Dimensions,
  Pressable,
  ActivityIndicator,
  Share,
} from 'react-native';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
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
import { useAppTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/ThemeContext';
import { Type, Space, Radius, Typography } from '../theme/designTokens';
import { useHaptic } from '../hooks/useHaptic';
import { useToast } from '../context/ToastContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { EmptyState } from '../components/EmptyState';
import { LookSocialActions } from '../components/look/LookSocialActions';
import { LookCommentsSheet } from '../components/look/LookCommentsSheet';
import { fetchLookByIdFromApi, type LookApiItem } from '../services/looksApi';
import { Video, ResizeMode } from '../components/compat/Video';

const { width: SCREEN_W } = Dimensions.get('window');

type NavT = StackNavigationProp<RootStackParamList>;
type RouteT = RouteProp<RootStackParamList, 'LookDetail'>;

export default function LookDetailScreen() {
  const route = useRoute<RouteT>();
  const navigation = useNavigation<NavT>();
  const haptic = useHaptic();
  const { show } = useToast();
  const { listings } = useBackendData();
  const reducedMotion = useReducedMotion();
  const currentUser = useStore((state) => state.currentUser);
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const { lookId } = route.params;

  const [look, setLook] = useState<LookApiItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTagId, setActiveTagId] = useState<string | null>(null);
  const [commentsVisible, setCommentsVisible] = useState(false);
  const [commentCount, setCommentCount] = useState(0);

  const loadLook = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const res = await fetchLookByIdFromApi(lookId);
      if (res.ok && res.look) {
        setLook(res.look);
        setCommentCount(res.look.commentCount);
      } else {
        setLoadError(res.error ?? 'Look not found');
      }
    } catch {
      setLoadError('Failed to load look');
    } finally {
      setIsLoading(false);
    }
  }, [lookId]);

  useEffect(() => {
    loadLook();
  }, [loadLook]);

  const handleShare = useCallback(async () => {
    haptic.light();
    try {
      await Share.share({
        title: 'Thryftverse Look',
        message: look?.caption
          ? `${look.caption}\n\nLook ID: ${look?.id}`
          : `View this Look on Thryftverse.\n\nLook ID: ${look?.id}`,
      });
    } catch {
      // Share failed or was dismissed — no feedback needed unless it's a real error
    }
  }, [haptic, look]);

  const resolveListing = useCallback(
    (listingId: string | null) => {
      if (!listingId) return undefined;
      return listings.find((l) => l.id === listingId);
    },
    [listings]
  );

  const handleTagPress = useCallback(
    (tag: { listingId: string | null; label: string }) => {
      haptic.light();
      const listing = resolveListing(tag.listingId);
      if (listing) {
        navigation.push('ItemDetail', { itemId: listing.id });
      } else if (tag.listingId) {
        show('This item is no longer available', 'info');
      }
    },
    [haptic, resolveListing, navigation, show]
  );

  const isVideoMedia = (() => {
    if (!look) return false;
    if (look.mediaType === 'video') return true;
    // Fallback: detect video by URL extension for backward compatibility
    const url = look.mediaUrl.toLowerCase();
    return url.endsWith('.mp4') || url.endsWith('.mov') || url.endsWith('.webm') || url.includes('/video/');
  })();

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.headerRow}>
          <AnimatedPressable style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.85}>
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </AnimatedPressable>
        </View>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.brand} />
        </View>
      </SafeAreaView>
    );
  }

  if (!look || loadError) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.headerRow}>
          <AnimatedPressable style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.85}>
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </AnimatedPressable>
        </View>
        <EmptyState
          icon="images-outline"
          title="Look not found"
          subtitle={loadError ?? 'This look may have been removed or is unavailable.'}
          ctaLabel="Back to Explore"
          onCtaPress={() => navigation.goBack()}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Floating Header */}
      <View style={styles.headerRow}>
        <AnimatedPressable style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.85}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </AnimatedPressable>
        <View style={styles.headerActions}>
          <AnimatedPressable
            style={styles.headerBtn}
            onPress={handleShare}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Share look"
          >
            <Ionicons name="share-outline" size={20} color={colors.textPrimary} />
          </AnimatedPressable>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Hero Image */}
        <Reanimated.View entering={reducedMotion ? undefined : FadeInDown.duration(300)}>
          <View style={styles.heroWrap}>
            {isVideoMedia ? (
              <Video
                source={{ uri: look.mediaUrl }}
                style={styles.heroImage}
                resizeMode={ResizeMode.COVER}
                shouldPlay
                isMuted
                isLooping
                useNativeControls
              />
            ) : (
              <CachedImage
                uri={look.mediaUrl}
                style={styles.heroImage}
                contentFit="cover"
                emptyLabel={look.title || look.caption}
                emptyIcon="image-outline"
              />
            )}

            {/* Hotspots — editorial pin with halo for legibility on any media */}
            {look.tags.map((tag) => {
              const isActive = activeTagId === tag.id;
              const listing = resolveListing(tag.listingId);
              return (
                <Pressable
                  key={tag.id}
                  style={[styles.hotspotWrap, { left: `${tag.x * 100}%`, top: `${tag.y * 100}%` }]}
                  onPress={() => {
                    setActiveTagId(isActive ? null : tag.id);
                    if (!isActive && listing) handleTagPress(tag);
                  }}
                  hitSlop={20}
                  accessibilityRole="button"
                  accessibilityLabel={tag.label || 'Tagged item'}
                >
                  <View style={styles.hotspotHalo} />
                  <View style={[styles.hotspotDot, isActive && styles.hotspotDotActive]} />
                  {isActive && listing && (
                    <Reanimated.View entering={FadeInDown.duration(180)} style={styles.tagTooltip}>
                      {listing.images?.[0] && (
                        <CachedImage uri={listing.images[0]} style={styles.tagTooltipImg} containerStyle={{ borderRadius: 6 }} contentFit="cover" />
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={styles.tagTooltipTitle} numberOfLines={1}>{listing.title}</Text>
                        {listing.isSold ? (
                          <Text style={styles.tagTooltipSold}>Sold</Text>
                        ) : (
                          <Text style={styles.tagTooltipPrice}>£{listing.price}</Text>
                        )}
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

        {/* Info — editorial chapter: eyebrow, caption, creator attribution */}
        <Reanimated.View entering={reducedMotion ? undefined : FadeInDown.duration(350).delay(80)} style={styles.infoSection}>
          <Text style={styles.eyebrow}>Look</Text>
          {look.caption ? (
            <Text style={styles.caption}>{look.caption}</Text>
          ) : look.title ? (
            <Text style={styles.caption}>{look.title}</Text>
          ) : null}
          <View style={styles.creatorRow}>
            <View style={styles.creatorAvatar}>
              {look.creator.avatar ? (
                <CachedImage uri={look.creator.avatar} style={styles.creatorAvatarImg} contentFit="cover" />
              ) : (
                <Ionicons name="person-circle" size={36} color={colors.textMuted} />
              )}
            </View>
            <View style={styles.creatorInfo}>
              <Text style={styles.creatorName}>@{look.creator.username ?? 'unknown'}</Text>
              <Text style={styles.creatorMeta}>{look.tags.length} pieces tagged</Text>
            </View>
          </View>
        </Reanimated.View>

        {/* Social Actions */}
        <Reanimated.View entering={reducedMotion ? undefined : FadeInDown.duration(350).delay(120)}>
          <LookSocialActions
            lookId={look.id}
            initialLikeCount={look.likeCount}
            commentCount={commentCount}
            initialSaveCount={look.saveCount}
            initialLikedByViewer={look.likedByViewer}
            initialSavedByViewer={look.savedByViewer}
            isAuthenticated={!!currentUser?.id}
            onCommentPress={() => setCommentsVisible(true)}
            onSharePress={handleShare}
            onSignInRequired={() => {
              show('Sign in to like, save, and comment', 'info');
              navigation.navigate('Login');
            }}
          />
        </Reanimated.View>

        {/* Tagged Products Tray — editorial shop-the-look rail */}
        {look.tags.length > 0 && (
          <Reanimated.View entering={reducedMotion ? undefined : FadeInDown.duration(350).delay(160)} style={styles.traySection}>
            <View style={styles.trayHeader}>
              <Text style={styles.trayTitle}>Shop the look</Text>
              <Text style={styles.trayCount}>{look.tags.length} pieces</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.trayScroll}>
              {look.tags.map((tag) => {
                const listing = resolveListing(tag.listingId);
                return (
                  <AnimatedPressable
                    key={tag.id}
                    style={styles.trayCard}
                    onPress={() => handleTagPress(tag)}
                    activeOpacity={0.9}
                    accessibilityRole="button"
                    accessibilityLabel={listing ? `${listing.title}` : tag.label || 'Tagged item'}
                  >
                    <View style={styles.trayImgWrap}>
                      {listing?.images?.[0] ? (
                        <CachedImage uri={listing.images[0]} style={styles.trayImg} contentFit="cover" />
                      ) : (
                        <View style={styles.trayImgEmpty}>
                          <Ionicons name="pricetag" size={20} color={colors.textMuted} />
                        </View>
                      )}
                      {listing?.isSold && <View style={styles.traySoldScrim} />}
                    </View>
                    <Text style={styles.trayCardTitle} numberOfLines={1}>{listing?.title ?? tag.label ?? 'Untitled'}</Text>
                    {listing && (
                      listing.isSold
                        ? <Text style={styles.trayCardSold}>Sold</Text>
                        : <Text style={styles.trayCardPrice}>£{listing.price}</Text>
                    )}
                  </AnimatedPressable>
                );
              })}
            </ScrollView>
          </Reanimated.View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Comments Sheet */}
      <LookCommentsSheet
        lookId={look.id}
        currentUserId={currentUser?.id}
        visible={commentsVisible}
        onClose={() => setCommentsVisible(false)}
        onCommentCountChange={setCommentCount}
        isAuthenticated={!!currentUser?.id}
        onSignInRequired={() => {
          show('Sign in to comment', 'info');
          navigation.navigate('Login');
        }}
      />
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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
    backgroundColor: colors.surfaceAlt,
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
  hotspotHalo: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  hotspotDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 2,
    borderColor: 'rgba(0,0,0,0.18)',
  },
  hotspotDotActive: {
    backgroundColor: colors.brand,
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
  tagTooltipImg: { width: 36, height: 36, borderRadius: 6, backgroundColor: colors.surfaceAlt },
  tagTooltipTitle: { fontSize: 11, fontFamily: Typography.family.semibold, color: '#fff' },
  tagTooltipPrice: { fontSize: 10, fontFamily: Typography.family.medium, color: 'rgba(255,255,255,0.7)' },
  tagTooltipSold: { fontSize: 10, fontFamily: Typography.family.semibold, color: colors.danger },

  infoSection: {
    paddingHorizontal: Space.md,
    paddingTop: Space.lg,
    gap: Space.sm,
  },
  eyebrow: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    color: colors.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: -2,
  },
  caption: {
    fontSize: Type.title.size,
    fontFamily: Typography.family.bold,
    color: colors.textPrimary,
    letterSpacing: Type.title.letterSpacing,
    lineHeight: 26,
  },
  creatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    marginTop: 2,
  },
  creatorAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  creatorAvatarImg: { width: 40, height: 40, borderRadius: 20 },
  creatorInfo: { gap: 2 },
  creatorName: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
  },
  creatorMeta: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.medium,
    color: colors.textMuted,
  },

  traySection: {
    marginTop: Space.xl,
    paddingHorizontal: Space.md,
  },
  trayHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: Space.sm,
  },
  trayTitle: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.bold,
    color: colors.textPrimary,
    letterSpacing: -0.2,
  },
  trayCount: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.medium,
    color: colors.textMuted,
  },
  trayScroll: {
    gap: Space.sm,
    paddingRight: Space.md,
  },
  trayCard: {
    width: 148,
    gap: 6,
  },
  trayImgWrap: {
    width: 148,
    height: 184,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
    position: 'relative',
  },
  trayImg: { width: '100%', height: '100%' },
  trayImgEmpty: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  traySoldScrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  trayCardTitle: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
    marginTop: 2,
  },
  trayCardPrice: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.bold,
    color: colors.brand,
  },
  trayCardSold: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.bold,
    color: colors.danger,
  },
  });
}
