import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  useWindowDimensions,
  Pressable,
  Share,
  Modal,
  ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Image as ExpoImage } from 'expo-image';
import { FlashList } from '@shopify/flash-list';
import { useVisuallyComplete } from '../performance/visuallyComplete';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, Radius, Control, LetterSpacing, AspectRatio } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { AppIcon } from '../components/common/AppIcon';
import { IconSize } from '../theme/iconTokens';
import { useHaptic } from '../hooks/useHaptic';
import { useConnectivity } from '../hooks/useConnectivity';
import { useToast } from '../context/ToastContext';
import { useAnalyticsEvent } from '../hooks/useAnalyticsEvent';
import { track } from '../analytics';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import type { SupportedCurrencyCode } from '../constants/currencies';
import { EmptyState } from '../components/EmptyState';
import { LookDetailSkeleton } from '../components/skeletons/LookDetailSkeleton';
import { LookSocialActions } from '../components/look/LookSocialActions';
import { LookCommentsSheet } from '../components/look/LookCommentsSheet';
import { LookMasonryTile } from '../components/look/LookMasonryTile';
import { LookHotspots, type HydratedLookTag } from '../components/look/LookHotspots';
import { ExpandableCaption } from '../components/look/ExpandableCaption';
import {
  fetchLookByIdFromApi,
  deleteLookOnApi,
  fetchRelatedLooksFromApi,
  repostLookOnApi,
  type LookApiItem,
  type LookTagApiItem } from '../services/looksApi';
import { resolveLookTemplate } from '../utils/lookTemplates';
import { LookMediaCarousel, type LookMediaCarouselPage } from '../components/look/LookMediaCarousel';
import { FullscreenMediaViewer } from '../components/product';
import { ConfirmationSheet } from '../components/ConfirmationSheet';
import {
  fetchPublicProfileAggregate,
  followUser,
  unfollowUser,
  type PublicProfileAggregate } from '../services/profileApi';
import {
  openProductDetail,
  type ProductReference,
  type ProductReferenceKind } from '../platform/product/openProductDetail';
import { ApiRequestError } from '../lib/apiClient';
import { CreatorCanvas } from '../creator/CreatorCanvas';
import { safeValidateDocument, type CreatorDocument } from '../creator/composition';

type NavT = NativeStackNavigationProp<RootStackParamList>;
type RouteT = RouteProp<RootStackParamList, 'LookDetail'>;

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
  const { isOffline } = useConnectivity();
  const { show } = useToast();
  const analyticsEvent = useAnalyticsEvent();
  const { formatFromFiat, currencyCode } = useFormattedPrice();
  const currentUser = useStore((state) => state.currentUser);
  const { colors } = useAppTheme();
  const { width: SCREEN_W } = useWindowDimensions();
  const styles = useMemo(() => createStyles(colors, SCREEN_W), [colors, SCREEN_W]);
  useVisuallyComplete('LookDetail');

  const { lookId } = route.params ?? {};

  const [look, setLook] = useState<LookApiItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<{
    kind: 'not-found' | 'connection' | 'offline' | 'missing';
    message: string;
  } | null>(null);
  const [commentsVisible, setCommentsVisible] = useState(false);
  const [commentCount, setCommentCount] = useState(0);
  const [overflowVisible, setOverflowVisible] = useState(false);
  const [inspectTag, setInspectTag] = useState<HydratedLookTag | null>(null);
  const [heroAspectRatio] = useState<number>(AspectRatio.marketplace);
  const [confirmSheet, setConfirmSheet] = useState<{
    visible: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    variant?: 'default' | 'danger';
    onConfirm: () => void;
  }>({ visible: false, title: '', message: '', onConfirm: () => {} });

  // Creator relationship — fetched so the Follow button reflects server truth.
  const [creatorProfile, setCreatorProfile] = useState<PublicProfileAggregate | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);

  // Related looks — Pinterest-style "More to explore" masonry grid below the
  // look detail. Uses the backend /looks/:lookId/related endpoint with tag-
  // overlap ranking and cursor pagination for infinite scroll. Replaces the
  // former two horizontal rails (more-from-creator + similar-looks) with a
  // single dense masonry grid that flows directly from the detail.
  const [relatedLooks, setRelatedLooks] = useState<LookApiItem[]>([]);
  const [relatedCursor, setRelatedCursor] = useState<string | null>(null);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const [relatedLoadingMore, setRelatedLoadingMore] = useState(false);
  const [relatedHasMore, setRelatedHasMore] = useState(true);
  const [relatedError, setRelatedError] = useState(false);

  // Repost — lightweight re-publish with attribution to the original creator.
  const [repostBusy, setRepostBusy] = useState(false);

  // Fullscreen media viewer — opened when the user single-taps a carousel page.
  const [fullscreenVisible, setFullscreenVisible] = useState(false);
  const [fullscreenIndex, setFullscreenIndex] = useState(0);

  const isOwner = look?.creatorId === currentUser?.id;

  const loadLook = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const res = await fetchLookByIdFromApi(lookId);
      if (res.ok && res.look) {
        setLook(res.look);
        setCommentCount(res.look.commentCount);
        // ── Fire analytics view event to the backend pipeline ──
        // This feeds the creator analytics v2 event table, which drives
        // the summary/timeline/content-ranking dashboards. Self-views are
        // filtered in the hook.
        analyticsEvent.view('look', lookId, { surface: 'look_detail', ownerId: res.look.creatorId });
      } else {
        setLoadError({
          kind: 'not-found',
          message: res.error ?? 'This look may have been removed or is unavailable.' });
      }
    } catch (error) {
      if (error instanceof ApiRequestError && (error.status === 404 || error.status === 410)) {
        setLoadError({
          kind: 'missing',
          message: 'This content is no longer available.' });
      } else if (isOffline) {
        setLoadError({
          kind: 'offline',
          message: "You're offline. Check your connection and try again." });
      } else {
        setLoadError({
          kind: 'connection',
          message: 'Check your connection and try again.' });
      }
    } finally {
      setIsLoading(false);
    }
  }, [lookId]);

  useEffect(() => {
    loadLook();
  }, [loadLook]);

  useEffect(() => {
    track('look_viewed', { look_id: lookId });
  }, [lookId]);

  // Fetch the creator's public profile (for follow state + provenance) and
  // the related-looks masonry grid. These run after the look loads.
  useEffect(() => {
    if (!look?.creator?.id) return;
    const creatorId = look.creator.id;
    let cancelled = false;

    fetchPublicProfileAggregate(creatorId)
      .then((agg) => {
        if (cancelled) return;
        setCreatorProfile(agg);
        setIsFollowing(agg.viewer?.isFollowing ?? false);
      })
      .catch(() => {
        // Profile fetch is non-fatal — the Follow button simply stays in its
        // default resting state.
      });

    // Related looks — server-ranked by tag overlap, cursor-paginated for
    // infinite scroll. Replaces the former two horizontal rails with a single
    // Pinterest-style masonry grid that flows directly from the detail.
    setRelatedLoading(true);
    setRelatedLooks([]);
    setRelatedCursor(null);
    setRelatedHasMore(true);
    setRelatedError(false);
    fetchRelatedLooksFromApi(look.id, { limit: 24 })
      .then((res) => {
        if (cancelled) return;
        setRelatedLooks(res.items);
        setRelatedCursor(res.nextCursor ?? null);
        setRelatedHasMore(!!res.nextCursor);
      })
      .catch(() => {
        if (cancelled) return;
        setRelatedError(true);
        setRelatedHasMore(false);
      })
      .finally(() => {
        if (!cancelled) setRelatedLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [look]);

  // Ref guard prevents race condition: FlashList can fire onEndReached
  // multiple times before setRelatedLoadingMore(true) propagates through
  // React's async state update, causing duplicate API calls and duplicate
  // items. The ref check is synchronous.
  const loadingMoreRef = useRef(false);

  // Infinite-scroll: load more related looks when the user nears the bottom.
  const loadMoreRelated = useCallback(async () => {
    if (loadingMoreRef.current || relatedLoading || !relatedHasMore || !relatedCursor || !look) return;
    loadingMoreRef.current = true;
    setRelatedLoadingMore(true);
    setRelatedError(false);
    try {
      const res = await fetchRelatedLooksFromApi(look.id, { cursor: relatedCursor, limit: 24 });
      // Dedup guard — prevents duplicate items if the race-condition ref
      // guard ever fails or the backend cursor pagination has edge cases.
      setRelatedLooks((prev) => {
        const existingIds = new Set(prev.map(l => l.id));
        const fresh = res.items.filter(l => !existingIds.has(l.id));
        return fresh.length === res.items.length ? [...prev, ...res.items] : [...prev, ...fresh];
      });
      setRelatedCursor(res.nextCursor ?? null);
      setRelatedHasMore(!!res.nextCursor);
    } catch {
      // Non-fatal — surface a retry affordance in the footer.
      setRelatedError(true);
      setRelatedHasMore(false);
    } finally {
      loadingMoreRef.current = false;
      setRelatedLoadingMore(false);
    }
  }, [relatedLoading, relatedHasMore, relatedCursor, look]);

  // Retry the initial related-looks fetch after an error.
  const retryRelatedFetch = useCallback(() => {
    if (!look) return;
    setRelatedError(false);
    setRelatedLoading(true);
    setRelatedLooks([]);
    setRelatedCursor(null);
    setRelatedHasMore(true);
    fetchRelatedLooksFromApi(look.id, { limit: 24 })
      .then((res) => {
        setRelatedLooks(res.items);
        setRelatedCursor(res.nextCursor ?? null);
        setRelatedHasMore(!!res.nextCursor);
      })
      .catch(() => {
        setRelatedError(true);
        setRelatedHasMore(false);
      })
      .finally(() => setRelatedLoading(false));
  }, [look]);

  // Retry pagination after a load-more error — preserves already-loaded items.
  const retryLoadMore = useCallback(() => {
    setRelatedError(false);
    setRelatedHasMore(true);
    loadingMoreRef.current = false;
    loadMoreRelated();
  }, [loadMoreRelated]);

  const handleShare = useCallback(async () => {
    haptic.light();
    if (look) {
      analyticsEvent.share('look', look.id, { surface: 'look_detail', ownerId: look.creatorId });
    }
    try {
      await Share.share({
        title: 'Thryftverse Look',
        message: look?.caption
          ? `${look.caption}\n\nLook ID: ${look?.id}`
          : `View this Look on Thryftverse.\n\nLook ID: ${look?.id}` });
    } catch {
      // Share failed or was dismissed — no feedback needed unless it's a real error
    }
  }, [haptic, look, analyticsEvent]);

  const handleEdit = useCallback(() => {
    if (!look || !isOwner) return;
    setOverflowVisible(false);
    haptic.light();
    navigation.navigate('CreatorStudio', {
      type: 'look',
      sourceDocumentId: look.id,
      sourceMode: 'edit' });
  }, [look, isOwner, navigation, haptic]);

  // Recreate — open the creator studio seeded from this look so the user can
  // build their own version from this composition. Fashion-native term for
  // the fork/derivative action — "recreate this look" is what stylists and
  // creators say, not "remix" (which reads as video/audio).
  // Available to everyone (not just owner), but requires authentication.
  const handleRecreate = useCallback(() => {
    if (!look) return;
    if (!currentUser?.id) {
      show('Sign in to recreate looks', 'info');
      navigation.navigate('Login');
      return;
    }
    haptic.light();
    setOverflowVisible(false);
    navigation.navigate('CreatorStudio', {
      type: 'look',
      sourceDocumentId: look.id,
      sourceMode: 'remix' });
  }, [look, currentUser, navigation, haptic, show]);

  // Repost — lightweight re-publish with attribution to the original creator.
  // Creates a new look owned by the reposter that references the source via
  // source_look_id. The media and tags are copied; attribution is preserved.
  const handleRepost = useCallback(async () => {
    if (!look) return;
    if (!currentUser?.id) {
      show('Sign in to repost looks', 'info');
      navigation.navigate('Login');
      return;
    }
    if (repostBusy) return;
    if (isOwner) {
      show('You can\'t repost your own look', 'info');
      return;
    }
    haptic.medium();
    setOverflowVisible(false);
    setRepostBusy(true);
    try {
      const res = await repostLookOnApi(look.id);
      if (res.ok) {
        show('Reposted to your profile', 'success');
      }
    } catch {
      show('Unable to repost this look', 'error');
    } finally {
      setRepostBusy(false);
    }
  }, [look, currentUser, isOwner, repostBusy, haptic, show, navigation]);

  const handleReport = useCallback(() => {
    if (!look?.creator?.id) return;
    haptic.light();
    setOverflowVisible(false);
    navigation.navigate('Report', { type: 'user', targetId: look.creator.id });
  }, [look, navigation, haptic]);

  const handleDelete = useCallback(() => {
    if (!look || !isOwner) return;
    setOverflowVisible(false);
    setConfirmSheet({
      visible: true,
      title: 'Delete look',
      message: 'This look will be permanently removed. This action cannot be undone.',
      confirmLabel: 'Delete',
      variant: 'danger',
      onConfirm: async () => {
        try {
          await deleteLookOnApi(look.id);
          show('Look deleted', 'success');
          navigation.goBack();
        } catch {
          show('Unable to delete look', 'error');
        }
      } });
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
      setInspectTag(tag);
    },
    [haptic, look, show]
  );

  const handleViewDetails = useCallback(() => {
    if (!inspectTag || !look) return;
    const ref = tagToReference(inspectTag, look.id);
    setInspectTag(null);
    if (ref) {
      analyticsEvent.productClick('look', look.id, { surface: 'look_detail', ownerId: look.creatorId });
      openProductDetail(navigation, ref);
    } else {
      show('This item is no longer available', 'info');
    }
  }, [inspectTag, look, navigation, show, analyticsEvent]);

  const handleCreatorPress = useCallback(() => {
    if (!look?.creator?.id) return;
    haptic.light();
    analyticsEvent.profileVisit('look', look.id, { surface: 'look_detail', ownerId: look.creatorId });
    navigation.navigate('UserProfile', { userId: look.creator.id });
  }, [look, navigation, haptic, analyticsEvent]);

  // Hoisted stable callbacks for LookSocialActions — avoids inline arrows
  // that would break React.memo and cause unnecessary re-renders.
  const handleCommentPress = useCallback(() => setCommentsVisible(true), []);
  const handleSignInRequired = useCallback(() => {
    show('Sign in to like, save, and comment', 'info');
    navigation.navigate('Login');
  }, [show, navigation]);

  // Stable callback for explore tile onPress (takes lookId string).
  // Avoids inline arrow at the call site that would break React.memo on
  // LookMasonryTile (audit item-29 §5.4).
  const handleRelatedLookPress = useCallback(
    (lookId: string) => {
      haptic.light();
      navigation.push('LookDetail', { lookId });
    },
    [navigation, haptic],
  );

  // Build the media pager pages. The primary mediaUrl is slide 0;
  // additional carousel slides from look.mediaUrls follow. When the API
  // has no carousel slides, this degrades to a single-page carousel.
  const mediaPages: LookMediaCarouselPage[] = useMemo(() => {
    if (!look) return [];
    const primaryIsVideo =
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
    const pages: LookMediaCarouselPage[] = [
      { id: 'media-0', uri: look.mediaUrl, isVideo: primaryIsVideo },
    ];
    if (look.mediaUrls && look.mediaUrls.length > 0) {
      look.mediaUrls.forEach((slide, i) => {
        pages.push({
          id: `media-${i + 1}`,
          uri: slide.url,
          isVideo: slide.mediaType === 'video' });
      });
    }
    return pages;
  }, [look]);

  const compositionDocument = useMemo<CreatorDocument | null>(() => {
    if (!look?.compositionDocument) return null;
    const parsed = safeValidateDocument(look.compositionDocument);
    const candidate = parsed.data;
    if (!parsed.success || !candidate || candidate.type !== 'look' || !candidate.pages[0]) {
      return null;
    }
    return candidate;
  }, [look?.compositionDocument]);

  const resolvedHeroAspectRatio = compositionDocument?.canvas.aspectRatio || heroAspectRatio;
  const heroHeight = SCREEN_W / resolvedHeroAspectRatio;

  const tags: HydratedLookTag[] = (look?.tags ?? []) as HydratedLookTag[];

  const captionText = look?.caption || look?.title || '';

  const creatorDisplayName =
    creatorProfile?.user?.displayName || look?.creator.username || 'unknown';
  const creatorHandle = look?.creator.username ?? 'unknown';
  const followerCount = creatorProfile?.stats?.followerCount;

  // ── FlashList callbacks for the single-scroll-surface architecture ────────
  // The look detail (hero + info + social + actions) renders as
  // ListHeaderComponent — full-width, above the masonry columns. The related
  // looks render as virtualized masonry items with onEndReached pagination.
  // This is the correct architecture for unlimited scrolling: one scroll
  // surface, proper virtualization, no nested ScrollView + FlashList.

  const renderDetailHeader = useMemo(() => {
    if (!look) return null;
    return (
      <>
        {/* Aspect-aware media carousel — height follows the media's real aspect
            ratio (defaulting to 4:5 until the first frame loads). Uses the
            flagship LookMediaCarousel with pinch/zoom/double-tap/preload/
            progress dots/swipe hint — matching CommerceMediaStage quality. */}
        <View style={[styles.heroWrap, { height: heroHeight }]}>
          {compositionDocument ? (
            <View
              style={styles.heroPage}
              accessibilityLabel={captionText || 'Authored Look composition'}
            >
              <CreatorCanvas
                document={compositionDocument}
                page={compositionDocument.pages[0]}
                canvasWidth={SCREEN_W}
                canvasHeight={heroHeight}
                mode="view"
              />
            </View>
          ) : (
            <LookMediaCarousel
              pages={mediaPages}
              aspectRatio={resolvedHeroAspectRatio}
              accessibilityLabel={`Look media, ${mediaPages.length} image${mediaPages.length === 1 ? '' : 's'}`}
              onFullscreenRequest={(index) => {
                setFullscreenIndex(index);
                setFullscreenVisible(true);
              }}
            />
          )}

          {/* Interactive product hotspots — tap opens the inspect sheet, never
              navigates directly. Extracted to its own component with local
              activeTagId state so hotspot taps don't re-render the entire
              FlashList header (CreatorCanvas, LookSocialActions, etc). */}
          <LookHotspots
            tags={tags}
            onTagTap={handleTagTap}
            formatPrice={(price, code) => formatFromFiat(price, code as SupportedCurrencyCode)}
            currencyCode={currencyCode}
          />

          <LinearGradient
            colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.12)', 'rgba(0,0,0,0.42)']}
            locations={[0, 0.4, 1]}
            style={styles.heroGradient}
          />
        </View>

        {/* Info — expandable caption, repost attribution, creator row with follow.
            Lives below the media so it never covers the creator's composition.
            No "Look" eyebrow — the media is the label. */}
        <View style={styles.infoSection}>
          {captionText ? (
            <ExpandableCaption text={captionText} />
          ) : null}

          {/* Repost attribution — when this look is a repost, show a quiet
              "Reposted from @creator" line with a link to the source creator.
              No decorative chrome; the attribution is the signal. */}
          {look.sourceLookId && look.sourceLook && (
            <Pressable
              style={styles.repostAttribution}
              onPress={() => look.sourceLook && navigation.navigate('UserProfile', { userId: look.sourceLook.creatorId })}
              accessibilityRole="link"
              accessibilityLabel={`Reposted from @${look.sourceLook.creatorUsername ?? 'creator'}`}
            >
              <Ionicons name="repeat-outline" size={14} color={colors.textMuted} aria-hidden={true} />
              <Text style={styles.repostAttributionText}>
                Reposted from @{look.sourceLook.creatorUsername ?? 'creator'}
              </Text>
            </Pressable>
          )}

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
                <Ionicons name="person-circle" size={28} color={colors.textMuted} aria-hidden={true} />
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
            onCommentPress={handleCommentPress}
            onSharePress={handleShare}
            onSignInRequired={handleSignInRequired}
            onLikeChange={(liked) => { if (liked) analyticsEvent.like('look', look.id, { surface: 'look_detail', ownerId: look.creatorId }); }}
            onSaveChange={(saved) => { if (saved) analyticsEvent.save('look', look.id, { surface: 'look_detail', ownerId: look.creatorId }); }}
          />
        </View>

        {/* Labeled soft seam — a deliberate mode-shift between the detail
            (evaluate this one) and the explore grid (discover among many).
            Research: a hard unbroken scroll erodes choice confidence on
            commerce surfaces (CUHK 2026). A labeled seam is the cognitive
            reset cue — "you are now entering browse mode." Editorial
            microcopy reads as human curation; "Recommended for you" is
            the AI tell. Hairline divider + generous whitespace, not a
            heavy card or different background. Magazine section break,
            not screen boundary. */}
        <View style={styles.exploreSeam}>
          <View style={styles.exploreSeamDivider} />
          <Text style={styles.exploreSeamLabel}>More looks you might like</Text>
        </View>
      </>
    );
  }, [
    look, heroHeight, compositionDocument, captionText, mediaPages, resolvedHeroAspectRatio,
    tags, handleTagTap, formatFromFiat, currencyCode, colors,
    handleCreatorPress, creatorHandle,
    followerCount, isOwner, isFollowing, handleFollow, followBusy,
    commentCount, currentUser?.id, handleShare, handleCommentPress, handleSignInRequired,
    styles,
    // navigation is used for repost attribution link — must be in deps
    navigation,
  ]);

  // Explore tile renderer — Instagram-style: media-only, no text overlays,
  // media-type badges (video/carousel), template-driven aspect ratios for
  // masonry rhythm. Tighter gutters (Space.xs = 4px) for discovery density.
  const exploreGap = Space.xs;

  const keyExtractor = useCallback((item: LookApiItem) => item.id, []);

  const renderExploreTile = useCallback(
    ({ item, index }: { item: LookApiItem; index: number }) => {
      const template = resolveLookTemplate(item, index, 1);
      return (
        <View style={{ paddingHorizontal: exploreGap / 2, paddingBottom: exploreGap, width: '100%' }}>
          <LookMasonryTile
            look={item}
            onPress={handleRelatedLookPress}
            aspectRatio={template.aspect}
            variant="explore"
          />
        </View>
      );
    },
    [handleRelatedLookPress, exploreGap],
  );

  // Span control — all tiles are span-1 in the 3-column explore grid.
  // Instagram's 3-column explore grid uses uniform single-column tiles;
  // the visual rhythm comes from the varying aspect ratios (portrait 3:4,
  // marketplace 4:5, square 1:1) in the HEIGHT_RHYTHM cycle, not from
  // span-2 tiles. Span-2 tiles in a 3-column grid with
  // optimizeItemArrangement={false} leave 1-column gaps (masonry holes).
  // The 2-column LooksTab keeps span-2 editorial/cinematic tiles.
  const overrideItemLayout = useCallback(
    (layout: { span?: number }, item: LookApiItem, index: number) => {
      const template = resolveLookTemplate(item, index, 1);
      if (template.span > 1) {
        layout.span = template.span;
      }
    },
    [],
  );

  // Footer — full state machine: loading, error+retry, end state, spacer.
  const renderFooter = useMemo(() => {
    if (relatedLoading) {
      return (
        <View style={styles.exploreLoading}>
          <ActivityIndicator size="small" color={colors.textMuted} />
        </View>
      );
    }
    if (relatedLoadingMore) {
      return (
        <View style={styles.exploreLoading}>
          <ActivityIndicator size="small" color={colors.textMuted} />
        </View>
      );
    }
    // Pagination error — inline retry, preserves already-loaded items.
    if (relatedError && relatedLooks.length > 0) {
      return (
        <Pressable
          style={styles.exploreRetry}
          onPress={retryLoadMore}
          accessibilityRole="button"
          accessibilityLabel="Retry loading more looks"
        >
          <Ionicons name="refresh-outline" size={16} color={colors.textSecondary} aria-hidden={true} />
          <Text style={styles.exploreRetryText}>Couldn't load more. Tap to retry.</Text>
        </Pressable>
      );
    }
    // End state — a stopping cue. Reintroducing stopping cues is a 2026 HCI
    // and regulatory recommendation for infinite scroll surfaces. This is
    // a positive brand moment, not a dead end.
    if (!relatedHasMore && relatedLooks.length > 0) {
      return (
        <View style={styles.exploreEnd}>
          <View style={styles.exploreEndDivider} />
          <Text style={styles.exploreEndText}>You're all caught up</Text>
          <Text style={styles.exploreEndSub}>Fresh looks drop daily — come back tomorrow</Text>
        </View>
      );
    }
    return <View style={{ height: Space.xl + Space.sm }} />;
  }, [relatedLoading, relatedLoadingMore, relatedError, relatedHasMore, relatedLooks.length, retryLoadMore, styles, colors.textMuted, colors.textSecondary]);

  // Empty state — shown when the first page returns zero items or the initial
  // fetch failed. Distinguishes error (with retry) from truly empty.
  const renderEmpty = useMemo(() => {
    if (relatedLoading) return null; // footer handles loading
    if (relatedError) {
      return (
        <View style={styles.exploreEmpty}>
          <Ionicons name="cloud-offline-outline" size={32} color={colors.textMuted} aria-hidden={true} />
          <Text style={styles.exploreEmptyTitle}>Couldn't load more looks</Text>
          <Text style={styles.exploreEmptySub}>Check your connection and try again.</Text>
          <Pressable
            style={styles.exploreEmptyRetry}
            onPress={retryRelatedFetch}
            accessibilityRole="button"
            accessibilityLabel="Retry loading looks"
          >
            <Text style={styles.exploreEmptyRetryText}>Try again</Text>
          </Pressable>
        </View>
      );
    }
    return (
      <View style={styles.exploreEmpty}>
        <AppIcon name="search-outline" size={IconSize.hero} color="textMuted" opticalCenter accessible={false} />
        <Text style={styles.exploreEmptyTitle}>No more looks to explore</Text>
        <Text style={styles.exploreEmptySub}>Fresh looks drop daily — check back soon.</Text>
      </View>
    );
  }, [relatedLoading, relatedError, retryRelatedFetch, styles, colors.textMuted]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.headerRow}>
          <AnimatedPressable style={styles.backBtnSolid} onPress={() => navigation.goBack()} activeOpacity={0.85} accessibilityLabel="Go back" accessibilityRole="button">
            <AppIcon name="back" size={IconSize.lg} color="textPrimary" opticalCenter accessible={false} />
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
    const canRetry = loadError?.kind === 'connection' || loadError?.kind === 'offline';
    const isMissing = loadError?.kind === 'missing' || loadError?.kind === 'not-found';
    const errorIcon = loadError?.kind === 'offline'
      ? 'offline' as const
      : isMissing
        ? 'trash' as const
        : 'offline' as const;
    const errorTitle = loadError?.kind === 'offline'
      ? "You're offline"
      : isMissing
        ? 'This content is no longer available'
        : "Couldn't load this look";
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.headerRow}>
          <AnimatedPressable style={styles.backBtnSolid} onPress={() => navigation.goBack()} activeOpacity={0.85} accessibilityLabel="Go back" accessibilityRole="button">
            <AppIcon name="back" size={IconSize.lg} color="textPrimary" opticalCenter accessible={false} />
          </AnimatedPressable>
        </View>
        <EmptyState
          icon={errorIcon}
          title={errorTitle}
          subtitle={loadError?.message ?? 'This look may have been removed or is unavailable.'}
          ctaLabel={canRetry ? 'Try again' : 'Back to Explore'}
          onCtaPress={canRetry ? loadLook : () => navigation.goBack()}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Floating Header — transparent 44pt hit targets; glyph legibility from
          the text-shadow scrim. No circular chrome. Back + overflow only.
          Share lives in the social action rail (LookSocialActions) — not
          duplicated in the header. The three-dots overflow is shown to ALL
          users (context-aware contents), matching Instagram/Pinterest/TikTok
          where every viewer can access secondary actions. */}
      <View style={styles.headerRow}>
        <AnimatedPressable style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.85} accessibilityLabel="Go back" accessibilityRole="button">
          <AppIcon name="back" size={IconSize.lg} color={colors.scrimTextPrimary} opticalCenter accessible={false} />
        </AnimatedPressable>
        <AnimatedPressable
          style={styles.headerBtn}
          onPress={() => {
            haptic.light();
            setOverflowVisible(true);
          }}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="More options"
          accessibilityHint="Open the look options menu"
        >
          <AppIcon name="more" size={IconSize.lg} color={colors.scrimTextPrimary} opticalCenter accessible={false} />
        </AnimatedPressable>
      </View>

      {/* Single FlashList scroll surface — the look detail content renders as
          ListHeaderComponent (full-width, above the masonry columns) and the
          related looks render as virtualized masonry items below. This is the
          correct architecture for unlimited scrolling: one scroll surface,
          proper virtualization, no nested ScrollView + FlashList. */}
      <FlashList
        data={relatedLooks}
        masonry
        numColumns={3}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyExtractor={keyExtractor}
        ListHeaderComponent={renderDetailHeader}
        ListFooterComponent={renderFooter}
        ListEmptyComponent={renderEmpty}
        renderItem={renderExploreTile}
        overrideItemLayout={overrideItemLayout}
        onEndReached={loadMoreRelated}
        onEndReachedThreshold={0.5}
        optimizeItemArrangement={false}
      />

      {/* Comments Sheet */}
      <LookCommentsSheet
        lookId={look.id}
        lookCreatorId={look.creatorId}
        currentUserId={currentUser?.id}
        visible={commentsVisible}
        onClose={() => setCommentsVisible(false)}
        onCommentCountChange={setCommentCount}
        onCommentPosted={() => analyticsEvent.comment('look', look.id, { surface: 'look_detail', ownerId: look.creatorId })}
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
        <Pressable style={styles.inspectBackdrop} onPress={() => setInspectTag(null)} accessibilityRole="button" accessibilityLabel="Close product preview">
          <Pressable
            style={styles.inspectSheet}
            onPress={(e) => e.stopPropagation()}
            accessibilityLabel="Product preview"
          accessibilityRole="button"
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
                          <AppIcon name="bag-handle-outline" size={IconSize.xl} color="textMuted" opticalCenter accessible={false} />
                        </View>
                      )}
                      {inspectTag.isSold && <View style={styles.inspectSoldScrim} />}
                    </View>
                    <View style={styles.inspectInfo}>
                      <Text style={styles.inspectTitle} numberOfLines={2}>{tagTitle}</Text>
                      {inspectTag.isSold ? (
                        <Text style={styles.inspectSold}>Sold</Text>
                      ) : typeof inspectTag.price === 'number' ? (
                        <Text style={styles.inspectPrice}>{formatFromFiat(inspectTag.price, currencyCode)}</Text>
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
                    <AppIcon name="forward" size={IconSize.sm} color="textInverse" opticalCenter accessible={false} />
                  </AnimatedPressable>
                </>
              );
            })()}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Overflow Menu — context-aware bottom sheet shown to ALL users.
          Owner sees: Edit → Delete (destructive, red, separated).
          Non-owner sees: Recreate → Repost → Report (destructive, red, separated).
          Anatomy: drag handle, icon+label rows, 48pt targets, hairline dividers
          between groups, destructive actions last in red. Matches the
          Instagram/Pinterest/TikTok bottom-sheet overflow pattern. */}
      <Modal
        visible={overflowVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setOverflowVisible(false)}
      >
        <Pressable style={styles.overflowBackdrop} onPress={() => setOverflowVisible(false)} accessibilityRole="button" accessibilityLabel="Close menu">
          <Pressable
            style={styles.overflowSheet}
            onPress={(e) => e.stopPropagation()}
            accessibilityRole="menu"
            accessibilityLabel="Look options menu"
          >
            <View style={styles.overflowHandle} />

            {isOwner ? (
              <>
                {/* ── Owner: management actions ── */}
                <Pressable
                  style={styles.overflowItem}
                  onPress={handleEdit}
                  accessibilityRole="menuitem"
                  accessibilityLabel="Edit look"
                >
                  <AppIcon name="edit" size={IconSize.md} color="textPrimary" opticalCenter accessible={false} />
                  <Text style={styles.overflowItemText}>Edit look</Text>
                </Pressable>
                <View style={styles.overflowDivider} />
                {/* ── Destructive ── */}
                <Pressable
                  style={styles.overflowItem}
                  onPress={handleDelete}
                  accessibilityRole="menuitem"
                  accessibilityLabel="Delete look"
                >
                  <AppIcon name="trash" size={IconSize.md} color="danger" opticalCenter accessible={false} />
                  <Text style={[styles.overflowItemText, { color: colors.danger }]}>Delete look</Text>
                </Pressable>
              </>
            ) : (
              <>
                {/* ── Non-owner: creative + distributive actions ── */}
                <Pressable
                  style={styles.overflowItem}
                  onPress={handleRecreate}
                  accessibilityRole="menuitem"
                  accessibilityLabel="Recreate this look"
                  accessibilityHint="Open the creator studio seeded from this look to build your own version"
                >
                  <AppIcon name="bulb-outline" size={IconSize.md} color="textPrimary" opticalCenter accessible={false} />
                  <Text style={styles.overflowItemText}>Recreate this look</Text>
                </Pressable>
                <Pressable
                  style={styles.overflowItem}
                  onPress={handleRepost}
                  accessibilityRole="menuitem"
                  accessibilityLabel="Repost this look"
                  accessibilityHint="Re-publishes this look to your profile with attribution to the original creator"
                  disabled={repostBusy}
                >
                  {repostBusy ? (
                    <ActivityIndicator size="small" color={colors.textPrimary} />
                  ) : (
                    <AppIcon name="repeat" size={IconSize.md} color="textPrimary" opticalCenter accessible={false} />
                  )}
                  <Text style={[styles.overflowItemText, repostBusy && { color: colors.textMuted }]}>
                    {repostBusy ? 'Reposting…' : 'Repost'}
                  </Text>
                </Pressable>
                <View style={styles.overflowDivider} />
                {/* ── Destructive ── */}
                <Pressable
                  style={styles.overflowItem}
                  onPress={handleReport}
                  accessibilityRole="menuitem"
                  accessibilityLabel="Report this look"
                  accessibilityHint="Reports the creator of this look"
                >
                  <AppIcon name="warning" size={IconSize.md} color="danger" opticalCenter accessible={false} />
                  <Text style={[styles.overflowItemText, { color: colors.danger }]}>Report</Text>
                </Pressable>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Fullscreen media viewer — opened on single-tap of a carousel page */}
      <FullscreenMediaViewer
        images={mediaPages.map((p) => p.uri)}
        videoUris={mediaPages.filter((p) => p.isVideo).map((p) => p.uri)}
        initialIndex={fullscreenIndex}
        visible={fullscreenVisible}
        onActiveIndexChange={setFullscreenIndex}
        onClose={() => setFullscreenVisible(false)}
      />
      <ConfirmationSheet
        visible={confirmSheet.visible}
        onDismiss={() => setConfirmSheet((s) => ({ ...s, visible: false }))}
        title={confirmSheet.title}
        message={confirmSheet.message}
        confirmLabel={confirmSheet.confirmLabel ?? 'Confirm'}
        variant={confirmSheet.variant ?? 'default'}
        onConfirm={() => { confirmSheet.onConfirm(); setConfirmSheet((s) => ({ ...s, visible: false })); }}
      />
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors, screenWidth: number) {
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
      zIndex: 10 },
    backBtn: {
      width: Control.hit,
      height: Control.hit,
      alignItems: 'center',
      justifyContent: 'center' },
    headerBtn: {
      width: Control.hit,
      height: Control.hit,
      alignItems: 'center',
      justifyContent: 'center' },
    backBtnSolid: {
      width: Control.hit,
      height: Control.hit,
      alignItems: 'center',
      justifyContent: 'center' },
    headerGlyph: {
      textShadowColor: colors.overlay,
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 4 },
    scrollContent: { paddingBottom: Space.lg },

    // ── Media pager ──
    heroWrap: {
      width: screenWidth,
      position: 'relative',
      backgroundColor: colors.surfaceAlt,
      overflow: 'hidden' },
    heroPage: { width: screenWidth, height: '100%' },
    heroGradient: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      height: Space.xxl * 3 + Space.xl + Space.xs },

    // ── Info section ──
    infoSection: {
      paddingHorizontal: Space.md,
      paddingTop: Space.lg,
      gap: Space.sm },
    repostAttribution: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingVertical: Space.xs },
    repostAttributionText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textMuted },
    creatorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      marginTop: Space.xs / 2 },
    creatorAvatar: {
      width: Space.xl + Space.sm,
      height: Space.xl + Space.sm,
      borderRadius: Radius.xxl,
      backgroundColor: colors.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden' },
    creatorAvatarImg: { width: Space.xl + Space.sm, height: Space.xl + Space.sm, borderRadius: Radius.xxl },
    creatorInfo: { flex: 1, gap: Space.xs - 2 },
    creatorName: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      color: colors.textPrimary },
    creatorMeta: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textMuted },
    followBtn: {
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm - 2,
      borderRadius: Radius.full,
      backgroundColor: colors.brand },
    followBtnActive: {
      backgroundColor: colors.surfaceAlt },
    followBtnText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textInverse },
    followBtnTextActive: {
      color: colors.textPrimary },

    // ── Social actions ──
    socialWrap: { marginTop: Space.md },

    // ── Explore grid loading footer ──
    exploreLoading: {
      paddingVertical: Space.xl,
      alignItems: 'center',
      justifyContent: 'center' },

    // ── Labeled soft seam (detail → explore transition) ──
    // A magazine section break: hairline divider + editorial label.
    // Not a heavy card, not a different background — just a deliberate
    // mode-shift cue. Reads as human curation, not algorithmic bleed.
    exploreSeam: {
      paddingHorizontal: Space.md,
      paddingTop: Space.xl,
      paddingBottom: Space.sm,
      gap: Space.sm },
    exploreSeamDivider: {
      height: 1,
      backgroundColor: colors.borderSubtle },
    exploreSeamLabel: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textSecondary,
      letterSpacing: LetterSpacing.caps,
      textTransform: 'uppercase' },

    // ── Explore empty state ──
    exploreEmpty: {
      paddingVertical: Space.xxl,
      paddingHorizontal: Space.lg,
      alignItems: 'center',
      gap: Space.sm },
    exploreEmptyTitle: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      color: colors.textPrimary },
    exploreEmptySub: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textSecondary,
      textAlign: 'center' },
    exploreEmptyRetry: {
      marginTop: Space.xs,
      paddingHorizontal: Space.lg,
      paddingVertical: Space.sm,
      borderRadius: Radius.full,
      backgroundColor: colors.surfaceAlt },
    exploreEmptyRetryText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textPrimary },

    // ── Explore footer: retry + end state ──
    exploreRetry: {
      paddingVertical: Space.lg,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Space.xs },
    exploreRetryText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textSecondary },
    exploreEnd: {
      paddingVertical: Space.xl,
      alignItems: 'center',
      gap: Space.xs },
    exploreEndDivider: {
      width: 40,
      height: 2,
      backgroundColor: colors.borderSubtle,
      borderRadius: 1,
      marginBottom: Space.xs },
    exploreEndText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textSecondary },
    exploreEndSub: {
      fontSize: TypographyV2.meta.size - 1,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textMuted },

    // ── Inspect sheet ──
    inspectBackdrop: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: 'flex-end' },
    inspectSheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: Radius.xl,
      borderTopRightRadius: Radius.xl,
      paddingBottom: Space.lg,
      paddingTop: Space.sm,
      paddingHorizontal: Space.md },
    inspectHandle: {
      width: Space.xl + Space.sm,
      height: Space.xxs,
      borderRadius: Space.xxs,
      backgroundColor: colors.border,
      alignSelf: 'center',
      marginBottom: Space.md },
    inspectContent: {
      flexDirection: 'row',
      gap: Space.md,
      marginBottom: Space.lg },
    inspectImgWrap: {
      width: Space.xxl + Space.xl,
      height: Space.xxl + Space.xl,
      borderRadius: Radius.lg,
      overflow: 'hidden',
      backgroundColor: colors.surfaceAlt,
      position: 'relative' },
    inspectImg: { width: '100%', height: '100%' },
    inspectImgEmpty: {
      width: '100%',
      height: '100%',
      alignItems: 'center',
      justifyContent: 'center' },
    inspectSoldScrim: {
      ...StyleSheet.absoluteFill,
      backgroundColor: colors.scrimTextTertiary },
    inspectInfo: { flex: 1, justifyContent: 'center', gap: Space.xs },
    inspectTitle: {
      fontSize: TypographyV2.itemTitle.size,
      fontFamily: TypographyV2.itemTitle.fontFamily,
      color: colors.textPrimary,
      letterSpacing: TypographyV2.itemTitle.letterSpacing },
    inspectPrice: {
      fontSize: TypographyV2.priceList.size,
      fontFamily: TypographyV2.priceList.fontFamily,
      color: colors.brand },
    inspectSold: {
      fontSize: TypographyV2.priceList.size,
      fontFamily: TypographyV2.priceList.fontFamily,
      color: colors.danger },
    inspectLabel: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textMuted },
    inspectCta: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Space.xs + 2,
      paddingVertical: Space.md - 2,
      borderRadius: Radius.lg,
      backgroundColor: colors.brand },
    inspectCtaDisabled: {
      backgroundColor: colors.surfaceAlt },
    inspectCtaText: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      color: colors.textInverse },

    // ── Overflow menu — flagship bottom sheet anatomy ──
    // Drag handle, icon+label rows, 48pt targets, hairline dividers,
    // destructive actions in red. Slide-up animation, tap-outside dismiss.
    overflowBackdrop: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: 'flex-end' },
    overflowSheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: Radius.sheet,
      borderTopRightRadius: Radius.sheet,
      paddingBottom: Space.lg,
      paddingTop: Space.sm },
    overflowHandle: {
      width: Space.xl + Space.sm,
      height: Space.xxs,
      borderRadius: Space.xxs,
      backgroundColor: colors.border,
      alignSelf: 'center',
      marginBottom: Space.md },
    overflowItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.md,
      minHeight: 48,
      paddingVertical: Space.smMd,
      paddingHorizontal: Space.lg },
    overflowItemText: {
      flex: 1,
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      color: colors.textPrimary },
    overflowDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginVertical: Space.xs } });
}
