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
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Image as ExpoImage } from 'expo-image';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { useAppTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/ThemeContext';
import { Type, Space, Radius, Typography, Stroke, Control, LetterSpacing, AspectRatio } from '../theme/designTokens';
import { useHaptic } from '../hooks/useHaptic';
import { useToast } from '../context/ToastContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { EmptyState } from '../components/EmptyState';
import { LookDetailSkeleton } from '../components/skeletons/LookDetailSkeleton';
import { LookSocialActions } from '../components/look/LookSocialActions';
import { LookCommentsSheet } from '../components/look/LookCommentsSheet';
import {
  fetchLookByIdFromApi,
  deleteLookOnApi,
  fetchLooksFromApi,
  type LookApiItem,
  type LookTagApiItem,
} from '../services/looksApi';
import {
  fetchPublicProfileAggregate,
  followUser,
  unfollowUser,
  type PublicProfileAggregate,
} from '../services/profileApi';
import { Video, ResizeMode } from '../components/compat/Video';
import {
  openProductDetail,
  type ProductReference,
  type ProductReferenceKind,
} from '../platform/product/openProductDetail';

const { width: SCREEN_W } = Dimensions.get('window');

type NavT = NativeStackNavigationProp<RootStackParamList>;
type RouteT = RouteProp<RootStackParamList, 'LookDetail'>;

/**
 * A look tag may carry hydrated product data when the backend includes it
 * (title, price, image, isSold, assetId, referenceKind). When hydrated data
 * is absent, the tag still renders with its label and taps resolve through the
 * canonical product resolver using whatever id is present. We never search the
 * global listing cache to resolve tags — that path is unreliable.
 */
type HydratedLookTag = LookTagApiItem & {
  title?: string;
  price?: number;
  image?: string;
  images?: string[];
  isSold?: boolean;
  assetId?: string;
  referenceKind?: ProductReferenceKind;
};

interface MediaPage {
  id: string;
  uri: string;
  isVideo: boolean;
}

/** Resolve a hydrated tag into a canonical ProductReference, or null when no
 *  id is available to navigate on. */
function tagToReference(tag: HydratedLookTag, lookId: string): ProductReference | null {
  if (tag.assetId) {
    return { referenceKind: 'co_own', canonicalId: tag.assetId, sourceSurface: 'LookDetail', sourceItemId: lookId };
  }
  if (tag.listingId) {
    return { referenceKind: 'listing', canonicalId: tag.listingId, sourceSurface: 'LookDetail', sourceItemId: lookId };
  }
  return null;
}

export default function LookDetailScreen() {
  const route = useRoute<RouteT>();
  const navigation = useNavigation<NavT>();
  const haptic = useHaptic();
  const { show } = useToast();
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
  const [inspectTag, setInspectTag] = useState<HydratedLookTag | null>(null);
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const [heroAspectRatio, setHeroAspectRatio] = useState<number>(AspectRatio.marketplace);
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);

  // Creator relationship — fetched so the Follow button reflects server truth.
  const [creatorProfile, setCreatorProfile] = useState<PublicProfileAggregate | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);

  // More from creator — related looks rail (same creator, excluding this look).
  const [moreLooks, setMoreLooks] = useState<LookApiItem[]>([]);
  const [moreLooksLoading, setMoreLooksLoading] = useState(false);

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

  // Fetch the creator's public profile (for follow state + provenance) and a
  // small batch of their other published looks. These run after the look loads.
  useEffect(() => {
    if (!look?.creator?.id) return;
    const creatorId = look.creator.id;
    let cancelled = false;

    fetchPublicProfileAggregate(creatorId)
      .then((agg) => {
        if (cancelled) return;
        setCreatorProfile(agg);
        setIsFollowing(agg.viewer.isFollowing);
      })
      .catch(() => {
        // Profile fetch is non-fatal — the Follow button simply stays in its
        // default resting state.
      });

    setMoreLooksLoading(true);
    fetchLooksFromApi({ creatorId, status: 'published', limit: 12 })
      .then((res) => {
        if (cancelled) return;
        setMoreLooks(res.items.filter((l) => l.id !== look.id).slice(0, 8));
      })
      .catch(() => {
        // Non-fatal — rail is simply hidden.
      })
      .finally(() => {
        if (!cancelled) setMoreLooksLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [look]);

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

  // Remix — open the creator studio seeded from this look so the user can
  // fork it into a new composition. Available to everyone (not just owner).
  const handleRemix = useCallback(() => {
    if (!look) return;
    haptic.light();
    navigation.navigate('CreatorStudio', {
      type: 'look',
      sourceDocumentId: look.id,
    });
  }, [look, navigation, haptic]);

  const handleReport = useCallback(() => {
    if (!look?.creator?.id) return;
    haptic.light();
    navigation.navigate('Report', { type: 'user', targetId: look.creator.id });
  }, [look, navigation, haptic]);

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

  const handleFollow = useCallback(async () => {
    if (!look?.creator?.id) return;
    if (!currentUser?.id) {
      show('Sign in to follow creators', 'info');
      navigation.navigate('Login');
      return;
    }
    if (followBusy) return;
    const next = !isFollowing;
    setFollowBusy(true);
    haptic.light();
    // Optimistic update.
    setIsFollowing(next);
    try {
      if (next) {
        await followUser(look.creator.id);
      } else {
        await unfollowUser(look.creator.id);
      }
    } catch {
      // Revert on failure.
      setIsFollowing(!next);
      show('Unable to update follow status', 'error');
    } finally {
      setFollowBusy(false);
    }
  }, [look, currentUser, followBusy, isFollowing, haptic, show, navigation]);

  // Tap-to-inspect: open the bottom sheet first. Navigation to the canonical
  // product detail only happens when the user confirms "View details".
  const handleTagTap = useCallback(
    (tag: HydratedLookTag) => {
      haptic.light();
      const ref = tagToReference(tag, look?.id ?? '');
      if (!ref) {
        // No id to navigate on — surface an honest message instead of a dead tap.
        show('This tag has no product attached', 'info');
        return;
      }
      setActiveTagId(tag.id);
      setInspectTag(tag);
    },
    [haptic, look, show]
  );

  const handleViewDetails = useCallback(() => {
    if (!inspectTag || !look) return;
    const ref = tagToReference(inspectTag, look.id);
    setInspectTag(null);
    if (ref) {
      openProductDetail(navigation, ref);
    } else {
      show('This item is no longer available', 'info');
    }
  }, [inspectTag, look, navigation, show]);

  const handleCreatorPress = useCallback(() => {
    if (!look?.creator?.id) return;
    haptic.light();
    navigation.navigate('UserProfile', { userId: look.creator.id });
  }, [look, navigation, haptic]);

  const handleMoreLookPress = useCallback(
    (other: LookApiItem) => {
      haptic.light();
      // Push a fresh LookDetail route so the back stack is preserved.
      navigation.push('LookDetail', { lookId: other.id });
    },
    [navigation, haptic]
  );

  // Build the media pager pages. The current data model exposes a single
  // mediaUrl, but the pager is structured to accept multiple pages when the
  // API grows — no fixed height is imposed by the screen.
  const mediaPages: MediaPage[] = useMemo(() => {
    if (!look) return [];
    const isVideo =
      look.mediaType === 'video' ||
      (() => {
        const url = look.mediaUrl.toLowerCase();
        return (
          url.endsWith('.mp4') ||
          url.endsWith('.mov') ||
          url.endsWith('.webm') ||
          url.includes('/video/')
        );
      })();
    return [{ id: 'media-0', uri: look.mediaUrl, isVideo }];
  }, [look]);

  const heroHeight = SCREEN_W / heroAspectRatio;

  const tags: HydratedLookTag[] = (look?.tags ?? []) as HydratedLookTag[];

  const captionText = look?.caption || look?.title || '';
  const captionIsLong = captionText.length > 140;

  const creatorDisplayName =
    creatorProfile?.user.displayName || look?.creator.username || 'unknown';
  const creatorHandle = look?.creator.username ?? 'unknown';
  const followerCount = creatorProfile?.stats.followerCount;

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
      {/* Floating Header — transparent 44pt hit targets; glyph legibility from
          the text-shadow scrim. No circular chrome. */}
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
        {/* Aspect-aware media pager — height follows the media's real aspect
            ratio (defaulting to 4:5 until the first frame loads), not a fixed
            value imposed by the screen. */}
        <View style={[styles.heroWrap, { height: heroHeight }]}>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => {
              const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
              setActiveMediaIndex(idx);
            }}
            accessibilityLabel={`Look media, ${mediaPages.length} image${mediaPages.length === 1 ? '' : 's'}`}
          >
            {mediaPages.map((page) => (
              <View
                key={page.id}
                style={styles.heroPage}
                accessibilityLabel={captionText || 'Look media'}
              >
                {page.isVideo ? (
                  <Video
                    source={{ uri: page.uri }}
                    style={styles.heroImage}
                    resizeMode={ResizeMode.COVER}
                    shouldPlay
                    isMuted
                    isLooping
                    useNativeControls
                  />
                ) : (
                  <ExpoImage
                    source={{ uri: page.uri }}
                    style={styles.heroImage}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    recyclingKey={page.uri}
                    transition={reducedMotion ? 0 : 240}
                    onLoad={(e) => {
                      const { width, height } = e.source;
                      if (width && height && width > 0 && height > 0) {
                        setHeroAspectRatio((prev) =>
                          prev === AspectRatio.marketplace ? width / height : prev
                        );
                      }
                    }}
                  />
                )}
              </View>
            ))}
          </ScrollView>

          {/* Pager indicators — only when multiple pages exist */}
          {mediaPages.length > 1 && (
            <View style={styles.pagerDots} pointerEvents="none">
              {mediaPages.map((page, i) => (
                <View
                  key={page.id}
                  style={[styles.pagerDot, i === activeMediaIndex && styles.pagerDotActive]}
                />
              ))}
            </View>
          )}

          {/* Interactive product hotspots — tap opens the inspect sheet, never
              navigates directly. */}
          {tags.map((tag) => {
            const isActive = activeTagId === tag.id;
            const tagImage = tag.image ?? tag.images?.[0];
            const tagTitle = tag.title ?? tag.label;
            return (
              <Pressable
                key={tag.id}
                style={[styles.hotspotWrap, { left: `${tag.x * 100}%`, top: `${tag.y * 100}%` }]}
                onPress={() => handleTagTap(tag)}
                hitSlop={20}
                accessibilityRole="button"
                accessibilityLabel={`Tagged item: ${tagTitle || 'product'}`}
                accessibilityHint="Opens a product preview before viewing details"
              >
                <View style={styles.hotspotHalo} />
                <View style={[styles.hotspotDot, isActive && styles.hotspotDotActive]} />
                {isActive && tagImage && tagTitle && (
                  <View style={styles.tagTooltip}>
                    <ExpoImage
                      source={{ uri: tagImage }}
                      style={styles.tagTooltipImg}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                      recyclingKey={tagImage}
                    />
                    <View style={styles.tagTooltipText}>
                      <Text style={styles.tagTooltipTitle} numberOfLines={1}>{tagTitle}</Text>
                      {tag.isSold ? (
                        <Text style={styles.tagTooltipSold}>Sold</Text>
                      ) : typeof tag.price === 'number' ? (
                        <Text style={styles.tagTooltipPrice}>£{tag.price}</Text>
                      ) : null}
                    </View>
                    <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.7)" />
                  </View>
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

        {/* Info — editorial chapter: eyebrow + provenance, expandable caption,
            creator row with follow. Lives below the media so it never covers
            the creator's composition. */}
        <View style={styles.infoSection}>
          <Text style={styles.eyebrow}>Look</Text>
          {captionText ? (
            <Pressable
              onPress={() => {
                if (captionIsLong) {
                  haptic.light();
                  setCaptionExpanded((v) => !v);
                }
              }}
              disabled={!captionIsLong}
              accessibilityRole={captionIsLong ? 'button' : undefined}
              accessibilityLabel={captionExpanded ? 'Collapse caption' : 'Expand caption'}
            >
              <Text
                style={styles.caption}
                numberOfLines={captionExpanded || !captionIsLong ? undefined : 3}
              >
                {captionText}
              </Text>
              {captionIsLong && (
                <Text style={styles.captionToggle}>
                  {captionExpanded ? 'Less' : 'More'}
                </Text>
              )}
            </Pressable>
          ) : null}

          <Pressable
            style={styles.creatorRow}
            onPress={handleCreatorPress}
            accessibilityRole="button"
            accessibilityLabel={`View ${creatorHandle}'s profile`}
          >
            <View style={styles.creatorAvatar}>
              {look.creator.avatar ? (
                <ExpoImage
                  source={{ uri: look.creator.avatar }}
                  style={styles.creatorAvatarImg}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  recyclingKey={look.creator.avatar}
                />
              ) : (
                <Ionicons name="person-circle" size={36} color={colors.textMuted} />
              )}
            </View>
            <View style={styles.creatorInfo}>
              <Text style={styles.creatorName}>@{creatorHandle}</Text>
              <Text style={styles.creatorMeta}>
                {look.tags.length} piece{look.tags.length === 1 ? '' : 's'} tagged
                {typeof followerCount === 'number' ? ` · ${followerCount} followers` : ''}
              </Text>
            </View>
            {!isOwner && (
              <AnimatedPressable
                style={[styles.followBtn, isFollowing && styles.followBtnActive]}
                onPress={handleFollow}
                activeOpacity={0.85}
                disabled={followBusy}
                accessibilityRole="button"
                accessibilityLabel={isFollowing ? 'Unfollow creator' : 'Follow creator'}
                accessibilityState={{ selected: isFollowing }}
              >
                {followBusy ? (
                  <ActivityIndicator size="small" color={isFollowing ? colors.textPrimary : colors.textInverse} />
                ) : (
                  <Text style={[styles.followBtnText, isFollowing && styles.followBtnTextActive]}>
                    {isFollowing ? 'Following' : 'Follow'}
                  </Text>
                )}
              </AnimatedPressable>
            )}
          </Pressable>
        </View>

        {/* Social Actions — like / comment / save / share engagement */}
        <View style={styles.socialWrap}>
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
        </View>

        {/* Object actions — Remix + Report, semantically labelled. Save and
            Share live in the social row above; these are the look-level
            actions that don't belong there. */}
        <View style={styles.actionRow}>
          <AnimatedPressable
            style={styles.actionBtn}
            onPress={handleRemix}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Remix this look"
            accessibilityHint="Opens the creator studio seeded from this look"
          >
            <Ionicons name="color-wand-outline" size={20} color={colors.textPrimary} />
            <Text style={styles.actionBtnLabel}>Remix</Text>
          </AnimatedPressable>
          <View style={styles.actionDivider} />
          <AnimatedPressable
            style={styles.actionBtn}
            onPress={handleReport}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Report this look"
            accessibilityHint="Reports the creator of this look"
          >
            <Ionicons name="flag-outline" size={20} color={colors.danger} />
            <Text style={[styles.actionBtnLabel, { color: colors.danger }]}>Report</Text>
          </AnimatedPressable>
        </View>

        {/* Tagged Products Rail — shop-the-look. Uses hydrated tag data when
            the backend provides it; otherwise shows the tag label and still
            resolves taps through the canonical product resolver. */}
        {tags.length > 0 && (
          <View style={styles.traySection}>
            <View style={styles.trayHeader}>
              <Text style={styles.trayTitle}>Shop the look</Text>
              <Text style={styles.trayCount}>{tags.length} piece{tags.length === 1 ? '' : 's'}</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.trayScroll}>
              {tags.map((tag) => {
                const tagImage = tag.image ?? tag.images?.[0];
                const tagTitle = tag.title ?? tag.label ?? 'Untitled';
                const ref = tagToReference(tag, look.id);
                return (
                  <AnimatedPressable
                    key={tag.id}
                    style={styles.trayCard}
                    onPress={() => handleTagTap(tag)}
                    activeOpacity={0.9}
                    accessibilityRole="button"
                    accessibilityLabel={`${tagTitle}${typeof tag.price === 'number' ? `, £${tag.price}` : ''}`}
                    accessibilityHint="Opens a product preview before viewing details"
                  >
                    <View style={styles.trayImgWrap}>
                      {tagImage ? (
                        <ExpoImage
                          source={{ uri: tagImage }}
                          style={styles.trayImg}
                          contentFit="cover"
                          cachePolicy="memory-disk"
                          recyclingKey={tagImage}
                        />
                      ) : (
                        <View style={styles.trayImgEmpty}>
                          <Ionicons name="pricetag" size={20} color={colors.textMuted} />
                        </View>
                      )}
                      {tag.isSold && <View style={styles.traySoldScrim} />}
                    </View>
                    <Text style={styles.trayCardTitle} numberOfLines={1}>{tagTitle}</Text>
                    {tag.isSold ? (
                      <Text style={styles.trayCardSold}>Sold</Text>
                    ) : typeof tag.price === 'number' ? (
                      <Text style={styles.trayCardPrice}>£{tag.price}</Text>
                    ) : ref ? (
                      <Text style={styles.trayCardCta}>View</Text>
                    ) : null}
                  </AnimatedPressable>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* More from creator — related looks rail. Truthful: only the creator's
            other published looks, fetched from the API. */}
        {(moreLooks.length > 0 || moreLooksLoading) && (
          <View style={styles.traySection}>
            <View style={styles.trayHeader}>
              <Text style={styles.trayTitle}>More from @{creatorHandle}</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.trayScroll}>
              {moreLooksLoading ? (
                <View style={styles.moreLoading}>
                  <ActivityIndicator size="small" color={colors.textMuted} />
                </View>
              ) : (
                moreLooks.map((other) => (
                  <AnimatedPressable
                    key={other.id}
                    style={styles.moreCard}
                    onPress={() => handleMoreLookPress(other)}
                    activeOpacity={0.9}
                    accessibilityRole="button"
                    accessibilityLabel={`Look by @${other.creator.username ?? 'unknown'}${other.caption ? `, ${other.caption}` : ''}`}
                  >
                    <View style={styles.moreImgWrap}>
                      <ExpoImage
                        source={{ uri: other.mediaUrl }}
                        style={styles.moreImg}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                        recyclingKey={other.mediaUrl}
                      />
                    </View>
                  </AnimatedPressable>
                ))
              )}
            </ScrollView>
          </View>
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

      {/* Tap-to-inspect sheet — shows the tagged product's identity and a
          "View details" confirmation before navigating to the canonical
          product detail. Causal slide transition only. */}
      <Modal
        visible={inspectTag !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setInspectTag(null)}
      >
        <Pressable style={styles.inspectBackdrop} onPress={() => setInspectTag(null)}>
          <Pressable
            style={styles.inspectSheet}
            onPress={(e) => e.stopPropagation()}
            accessibilityLabel="Product preview"
          >
            {(() => {
              if (!inspectTag) return null;
              const tagImage = inspectTag.image ?? inspectTag.images?.[0];
              const tagTitle = inspectTag.title ?? inspectTag.label ?? 'Tagged item';
              const ref = tagToReference(inspectTag, look.id);
              return (
                <>
                  <View style={styles.inspectHandle} />
                  <View style={styles.inspectContent}>
                    <View style={styles.inspectImgWrap}>
                      {tagImage ? (
                        <ExpoImage
                          source={{ uri: tagImage }}
                          style={styles.inspectImg}
                          contentFit="cover"
                          cachePolicy="memory-disk"
                          recyclingKey={tagImage}
                        />
                      ) : (
                        <View style={styles.inspectImgEmpty}>
                          <Ionicons name="pricetag" size={28} color={colors.textMuted} />
                        </View>
                      )}
                      {inspectTag.isSold && <View style={styles.traySoldScrim} />}
                    </View>
                    <View style={styles.inspectInfo}>
                      <Text style={styles.inspectTitle} numberOfLines={2}>{tagTitle}</Text>
                      {inspectTag.isSold ? (
                        <Text style={styles.inspectSold}>Sold</Text>
                      ) : typeof inspectTag.price === 'number' ? (
                        <Text style={styles.inspectPrice}>£{inspectTag.price}</Text>
                      ) : null}
                      {inspectTag.label && inspectTag.title && (
                        <Text style={styles.inspectLabel}>{inspectTag.label}</Text>
                      )}
                    </View>
                  </View>
                  <AnimatedPressable
                    style={[styles.inspectCta, !ref && styles.inspectCtaDisabled]}
                    onPress={handleViewDetails}
                    activeOpacity={0.9}
                    disabled={!ref}
                    accessibilityRole="button"
                    accessibilityLabel="View product details"
                  >
                    <Text style={styles.inspectCtaText}>
                      {ref ? 'View details' : 'Unavailable'}
                    </Text>
                    <Ionicons name="arrow-forward" size={18} color={colors.textInverse} />
                  </AnimatedPressable>
                </>
              );
            })()}
          </Pressable>
        </Pressable>
      </Modal>

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
    backBtnSolid: {
      width: Control.hit,
      height: Control.hit,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerGlyph: {
      textShadowColor: colors.overlay,
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 4,
    },
    scrollContent: { paddingBottom: Space.lg },

    // ── Media pager ──
    heroWrap: {
      width: SCREEN_W,
      position: 'relative',
      backgroundColor: colors.surfaceAlt,
      overflow: 'hidden',
    },
    heroPage: { width: SCREEN_W, height: '100%' },
    heroImage: { width: '100%', height: '100%' },
    heroGradient: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      height: Space.xxl * 3 + Space.xl + Space.xs,
    },
    pagerDots: {
      position: 'absolute',
      top: Space.sm,
      left: 0,
      right: 0,
      flexDirection: 'row',
      justifyContent: 'center',
      gap: Space.xs,
      zIndex: 4,
    },
    pagerDot: {
      width: Space.sm,
      height: Space.xxs,
      borderRadius: Space.xxs,
      backgroundColor: 'rgba(255,255,255,0.45)',
    },
    pagerDotActive: {
      backgroundColor: '#fff',
      width: Space.sm + Space.xs,
    },

    // ── Hotspots ──
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
      width: Space.xxl * 8 + Space.xl + 4,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      backgroundColor: 'rgba(0,0,0,0.88)',
      borderRadius: Radius.lg,
      padding: Space.sm,
    },
    tagTooltipImg: { width: Space.xl + 4, height: Space.xl + 4, borderRadius: Radius.md, backgroundColor: colors.surfaceAlt },
    tagTooltipText: { flex: 1, gap: Space.xxs },
    tagTooltipTitle: { fontSize: Type.meta.size, fontFamily: Typography.family.semibold, color: '#fff' },
    tagTooltipPrice: { fontSize: Type.meta.size - 1, fontFamily: Typography.family.medium, color: 'rgba(255,255,255,0.7)' },
    tagTooltipSold: { fontSize: Type.meta.size - 1, fontFamily: Typography.family.semibold, color: colors.danger },

    // ── Info section ──
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
    captionToggle: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.semibold,
      color: colors.textSecondary,
      marginTop: Space.xs,
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
    creatorInfo: { flex: 1, gap: Space.xs - 2 },
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
    followBtn: {
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm - 2,
      borderRadius: Radius.full,
      backgroundColor: colors.brand,
    },
    followBtnActive: {
      backgroundColor: colors.surfaceAlt,
    },
    followBtnText: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.semibold,
      color: colors.textInverse,
    },
    followBtnTextActive: {
      color: colors.textPrimary,
    },

    // ── Social + actions ──
    socialWrap: { marginTop: Space.md },
    actionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: Space.sm,
      paddingHorizontal: Space.md,
    },
    actionBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Space.xs + 2,
      paddingVertical: Space.sm,
    },
    actionDivider: {
      width: StyleSheet.hairlineWidth,
      height: Space.xl - Space.xs,
      backgroundColor: colors.border,
    },
    actionBtnLabel: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.medium,
      color: colors.textPrimary,
    },

    // ── Tagged products rail ──
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
      width: Space.xxl * 7 + 12,
      gap: Space.xs + 2,
    },
    trayImgWrap: {
      width: Space.xxl * 7 + 12,
      height: Space.xxl * 9 + 8,
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
    trayCardCta: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.semibold,
      color: colors.textSecondary,
    },

    // ── More from creator rail ──
    moreLoading: {
      width: Space.xxl * 5 + 8,
      height: Space.xxl * 6,
      alignItems: 'center',
      justifyContent: 'center',
    },
    moreCard: {
      width: Space.xxl * 5 + 8,
    },
    moreImgWrap: {
      width: Space.xxl * 5 + 8,
      height: Space.xxl * 6,
      borderRadius: Radius.lg,
      overflow: 'hidden',
      backgroundColor: colors.surfaceAlt,
    },
    moreImg: { width: '100%', height: '100%' },

    // ── Inspect sheet ──
    inspectBackdrop: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: 'flex-end',
    },
    inspectSheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: Radius.xl,
      borderTopRightRadius: Radius.xl,
      paddingBottom: Space.lg,
      paddingTop: Space.sm,
      paddingHorizontal: Space.md,
    },
    inspectHandle: {
      width: Space.xl + Space.sm,
      height: Space.xxs,
      borderRadius: Space.xxs,
      backgroundColor: colors.border,
      alignSelf: 'center',
      marginBottom: Space.md,
    },
    inspectContent: {
      flexDirection: 'row',
      gap: Space.md,
      marginBottom: Space.lg,
    },
    inspectImgWrap: {
      width: Space.xxl + Space.xl,
      height: Space.xxl + Space.xl,
      borderRadius: Radius.lg,
      overflow: 'hidden',
      backgroundColor: colors.surfaceAlt,
      position: 'relative',
    },
    inspectImg: { width: '100%', height: '100%' },
    inspectImgEmpty: {
      width: '100%',
      height: '100%',
      alignItems: 'center',
      justifyContent: 'center',
    },
    inspectInfo: { flex: 1, justifyContent: 'center', gap: Space.xs },
    inspectTitle: {
      fontSize: Type.itemTitle.size,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
      letterSpacing: Type.itemTitle.letterSpacing,
    },
    inspectPrice: {
      fontSize: Type.priceList.size,
      fontFamily: Typography.family.bold,
      color: colors.brand,
    },
    inspectSold: {
      fontSize: Type.priceList.size,
      fontFamily: Typography.family.bold,
      color: colors.danger,
    },
    inspectLabel: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.medium,
      color: colors.textMuted,
    },
    inspectCta: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Space.xs + 2,
      paddingVertical: Space.md - 2,
      borderRadius: Radius.lg,
      backgroundColor: colors.brand,
    },
    inspectCtaDisabled: {
      backgroundColor: colors.surfaceAlt,
    },
    inspectCtaText: {
      fontSize: Type.bodyEmphasis.size,
      fontFamily: Typography.family.semibold,
      color: colors.textInverse,
    },

    // ── Owner overflow menu ──
    overflowBackdrop: {
      flex: 1,
      backgroundColor: colors.overlay,
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
