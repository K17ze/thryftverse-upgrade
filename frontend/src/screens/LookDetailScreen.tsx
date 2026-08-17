import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Dimensions,
  Pressable,
  Share,
  Alert,
  Modal,
} from 'react-native';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useBackendData } from '../context/BackendDataContext';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { CachedImage } from '../components/CachedImage';
import { useAppTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/ThemeContext';
import { Type, Space, Radius, Typography, Stroke, Control, LetterSpacing } from '../theme/designTokens';
import { useHaptic } from '../hooks/useHaptic';
import { useToast } from '../context/ToastContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { EmptyState } from '../components/EmptyState';
import { LookDetailSkeleton } from '../components/skeletons/LookDetailSkeleton';
import { LookSocialActions } from '../components/look/LookSocialActions';
import { LookCommentsSheet } from '../components/look/LookCommentsSheet';
import { fetchLookByIdFromApi, deleteLookOnApi, type LookApiItem } from '../services/looksApi';
import { Video, ResizeMode } from '../components/compat/Video';

const { width: SCREEN_W } = Dimensions.get('window');

type NavT = NativeStackNavigationProp<RootStackParamList>;
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
  const [overflowVisible, setOverflowVisible] = useState(false);

  const isOwner = look?.creatorId === currentUser?.id;

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

  const handleEdit = useCallback(() => {
    if (!look || !isOwner) return;
    setOverflowVisible(false);
    haptic.light();
    navigation.navigate('CreatorStudio', {
      type: 'look',
      sourceDocumentId: look.id,
    });
  }, [look, isOwner, navigation, haptic]);

  const handleDelete = useCallback(() => {
    if (!look || !isOwner) return;
    setOverflowVisible(false);
    Alert.alert(
      'Delete look',
      'This look will be permanently removed. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteLookOnApi(look.id);
              show('Look deleted', 'success');
              navigation.goBack();
            } catch {
              show('Unable to delete look', 'error');
            }
          },
        },
      ]
    );
  }, [look, isOwner, show, navigation]);

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
          <AnimatedPressable style={styles.backBtnSolid} onPress={() => navigation.goBack()} activeOpacity={0.85}>
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </AnimatedPressable>
        </View>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <LookDetailSkeleton />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (!look || loadError) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.headerRow}>
          <AnimatedPressable style={styles.backBtnSolid} onPress={() => navigation.goBack()} activeOpacity={0.85}>
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
      {/* Floating Header — transparent hit targets with text-shadow scrim.
          Per AGENTS.md: ordinary Back/Share controls default to transparent
          44pt targets. No circular chrome; glyph legibility from shadow. */}
      <View style={styles.headerRow}>
        <AnimatedPressable style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.85}>
          <Ionicons name="arrow-back" size={24} color="#fff" style={styles.headerGlyph} />
        </AnimatedPressable>
        <View style={styles.headerActions}>
          <AnimatedPressable
            style={styles.headerBtn}
            onPress={handleShare}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Share look"
          >
            <Ionicons name="share-outline" size={20} color="#fff" style={styles.headerGlyph} />
          </AnimatedPressable>
          {isOwner && (
            <AnimatedPressable
              style={styles.headerBtn}
              onPress={handleEdit}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Edit look"
            >
              <Ionicons name="create-outline" size={20} color="#fff" style={styles.headerGlyph} />
            </AnimatedPressable>
          )}
          {isOwner && (
            <AnimatedPressable
              style={styles.headerBtn}
              onPress={() => {
                haptic.light();
                setOverflowVisible(true);
              }}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="More look options"
            >
              <Ionicons name="ellipsis-horizontal" size={20} color="#fff" style={styles.headerGlyph} />
            </AnimatedPressable>
          )}
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
                        <CachedImage uri={listing.images[0]} style={styles.tagTooltipImg} containerStyle={{ borderRadius: Radius.md }} contentFit="cover" />
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

            <LinearGradient
              colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.12)', 'rgba(0,0,0,0.42)']}
              locations={[0, 0.4, 1]}
              style={styles.heroGradient}
            />
          </View>
        </Reanimated.View>

        {/* Info — editorial chapter: eyebrow, caption, creator attribution */}
        <Reanimated.View entering={reducedMotion ? undefined : FadeInDown.duration(300)} style={styles.infoSection}>
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
        <Reanimated.View entering={reducedMotion ? undefined : FadeInDown.duration(300)}>
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
          <Reanimated.View entering={reducedMotion ? undefined : FadeInDown.duration(300)} style={styles.traySection}>
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

        <View style={{ height: Space.xl + Space.sm }} />
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

      {/* Owner Overflow Menu */}
      <Modal
        visible={overflowVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setOverflowVisible(false)}
      >
        <Pressable style={styles.overflowBackdrop} onPress={() => setOverflowVisible(false)}>
          <Pressable
            style={styles.overflowSheet}
            onPress={(e) => e.stopPropagation()}
            accessibilityRole="menu"
          >
            <Pressable
              style={styles.overflowItem}
              onPress={handleEdit}
              accessibilityRole="menuitem"
              accessibilityLabel="Edit look"
            >
              <Ionicons name="create-outline" size={20} color={colors.textPrimary} />
              <Text style={styles.overflowItemText}>Edit look</Text>
            </Pressable>
            <View style={styles.overflowDivider} />
            <Pressable
              style={styles.overflowItem}
              onPress={handleDelete}
              accessibilityRole="menuitem"
              accessibilityLabel="Delete look"
            >
              <Ionicons name="trash-outline" size={20} color={colors.danger} />
              <Text style={[styles.overflowItemText, { color: colors.danger }]}>Delete look</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  headerRow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.sm,
    paddingTop: Space.sm,
    zIndex: 10,
  },
  // Transparent 44pt hit targets — no circular chrome.
  // Glyph legibility comes from the text-shadow scrim below.
  backBtn: {
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerActions: { flexDirection: 'row', gap: Space.xs },
  headerBtn: {
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Solid back button for loading/error states (no media behind)
  backBtnSolid: {
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Text-shadow scrim for glyph legibility on media
  headerGlyph: {
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  scrollContent: { paddingBottom: Space.lg },
  heroWrap: {
    width: SCREEN_W,
    height: SCREEN_W * 1.15,
    position: 'relative',
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
  },
  heroImage: { width: '100%', height: '100%' },
  // Extended gradient — 180px with 3-stop falloff for smooth editorial fade
  heroGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: Space.xxl * 3 + Space.xl + Space.xs,
  },
  hotspotWrap: {
    position: 'absolute',
    width: Control.hit,
    height: Control.hit,
    marginLeft: -(Space.lg - 2),
    marginTop: -(Space.lg - 2),
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
  },
  hotspotHalo: {
    position: 'absolute',
    width: Space.xl - Space.xs,
    height: Space.xl - Space.xs,
    borderRadius: Radius.xl,
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  hotspotDot: {
    width: Space.sm + Space.xs,
    height: Space.sm + Space.xs,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: Stroke.emphasis,
    borderColor: 'rgba(0,0,0,0.18)',
  },
  hotspotDotActive: {
    backgroundColor: colors.brand,
    borderColor: '#fff',
  },
  tagTooltip: {
    position: 'absolute',
    top: Space.lg + 4,
    left: -Space.xxl - Space.xxl - Space.xl - 8,
    width: Space.xxl + Space.xxl + Space.xxl + Space.xxl + Space.xxl + Space.xxl + Space.xxl + Space.xxl + Space.xl + 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    backgroundColor: 'rgba(0,0,0,0.88)',
    borderRadius: Radius.lg,
    padding: Space.sm,
  },
  tagTooltipImg: { width: Space.xl + 4, height: Space.xl + 4, borderRadius: Radius.md, backgroundColor: colors.surfaceAlt },
  tagTooltipTitle: { fontSize: Type.meta.size, fontFamily: Typography.family.semibold, color: '#fff' },
  tagTooltipPrice: { fontSize: Type.meta.size - 1, fontFamily: Typography.family.medium, color: 'rgba(255,255,255,0.7)' },
  tagTooltipSold: { fontSize: Type.meta.size - 1, fontFamily: Typography.family.semibold, color: colors.danger },

  infoSection: {
    paddingHorizontal: Space.md,
    paddingTop: Space.lg,
    gap: Space.sm,
  },
  eyebrow: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    color: colors.textMuted,
    letterSpacing: LetterSpacing.caps,
    textTransform: 'uppercase',
    marginBottom: -(Space.xs - 2),
  },
  caption: {
    fontSize: Type.title.size,
    fontFamily: Typography.family.bold,
    color: colors.textPrimary,
    letterSpacing: Type.title.letterSpacing,
    lineHeight: Type.title.size + 6,
  },
  creatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    marginTop: Space.xs / 2,
  },
  creatorAvatar: {
    width: Space.xl + Space.sm,
    height: Space.xl + Space.sm,
    borderRadius: Radius.xxl,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  creatorAvatarImg: { width: Space.xl + Space.sm, height: Space.xl + Space.sm, borderRadius: Radius.xxl },
  creatorInfo: { gap: Space.xs - 2 },
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
    letterSpacing: Type.body.letterSpacing,
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
    width: Space.xxl + Space.xxl + Space.xxl + Space.xxl + Space.xxl + Space.xxl + Space.xxl + 12,
    gap: Space.xs + 2,
  },
  trayImgWrap: {
    width: Space.xxl + Space.xxl + Space.xxl + Space.xxl + Space.xxl + Space.xxl + Space.xxl + 12,
    height: Space.xxl + Space.xxl + Space.xxl + Space.xxl + Space.xxl + Space.xxl + Space.xxl + Space.xxl + Space.xxl + 8,
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
    marginTop: Space.xs / 2,
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

  // Owner overflow menu
  overflowBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  overflowSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingBottom: Space.lg,
    paddingTop: Space.sm,
  },
  overflowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingVertical: Space.md,
    paddingHorizontal: Space.lg,
  },
  overflowItemText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
    color: colors.textPrimary,
  },
  overflowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: Space.xs,
  },
  });
}
