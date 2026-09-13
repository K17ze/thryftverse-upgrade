import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space } from '../theme/designTokens';
import { useHaptic } from '../hooks/useHaptic';
import { useToast } from '../context/ToastContext';
import { useAnalyticsEvent } from '../hooks/useAnalyticsEvent';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import type { SupportedCurrencyCode } from '../constants/currencies';
import { LookSocialActions } from '../components/look/LookSocialActions';
import { LookCommentsSheet } from '../components/look/LookCommentsSheet';
import type { HydratedLookTag } from '../components/look/LookHotspots';
import { type LookApiItem } from '../services/looksApi';
import { resolveLookTemplate } from '../utils/lookTemplates';
import { FullscreenMediaViewer } from '../components/product';
import { ConfirmationSheet } from '../components/ConfirmationSheet';
import {
  useLookDetailData,
  useRelatedLooks,
  useCreatorFollow,
  useLookDetailActions,
  useLookMedia,
  useLookInspect } from '../hooks/lookdetail';
import { LookDetailNavBar } from '../components/lookdetail/LookDetailNavBar';
import { LookDetailHero } from '../components/lookdetail/LookDetailHero';
import { LookDetailInfoSection } from '../components/lookdetail/LookDetailInfoSection';
import { LookExploreTile } from '../components/lookdetail/LookExploreTile';
import { ExploreSeam, ExploreFooter, ExploreEmpty } from '../components/lookdetail/LookExploreStates';
import { LookInspectSheet } from '../components/lookdetail/LookInspectSheet';
import { LookOverflowMenu } from '../components/lookdetail/LookOverflowMenu';
import { LookDetailLoadingState, LookDetailErrorState } from '../components/lookdetail/LookDetailStates';

type NavT = NativeStackNavigationProp<RootStackParamList>;
type RouteT = RouteProp<RootStackParamList, 'LookDetail'>;

export default function LookDetailScreen() {
  const route = useRoute<RouteT>();
  const navigation = useNavigation<NavT>();
  const haptic = useHaptic();
  const { show } = useToast();
  const analyticsEvent = useAnalyticsEvent();
  const { formatFromFiat, currencyCode } = useFormattedPrice();
  const currentUser = useStore((state) => state.currentUser);
  const { colors } = useAppTheme();
  const { width: SCREEN_W } = useWindowDimensions();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const { lookId } = route.params ?? {};

  // ── Domain hooks — the screen orchestrates, the hooks own the state ──
  const {
    look,
    isLoading,
    loadError,
    commentCount,
    setCommentCount,
    loadLook,
    reportFirstMedia } = useLookDetailData(lookId);

  const isOwner = look?.creatorId === currentUser?.id;

  const {
    creatorProfile,
    isFollowing,
    followBusy,
    handleFollow } = useCreatorFollow(look, currentUser?.id);

  const {
    relatedLooks,
    relatedLoading,
    relatedLoadingMore,
    relatedHasMore,
    relatedError,
    loadMoreRelated,
    retryRelatedFetch,
    retryLoadMore } = useRelatedLooks(look);

  const {
    mediaPages,
    compositionDocument,
    compositionPage,
    resolvedHeroAspectRatio,
    heroHeight,
    fullscreenVisible,
    fullscreenIndex,
    setFullscreenIndex,
    openFullscreen,
    closeFullscreen } = useLookMedia(look, SCREEN_W);

  const {
    inspectTag,
    closeInspect,
    handleTagTap,
    handleViewDetails } = useLookInspect(look);

  const {
    overflowVisible,
    openOverflow,
    closeOverflow,
    confirmSheet,
    setConfirmSheet,
    repostBusy,
    handleShare,
    handleEdit,
    handleRecreate,
    handleRepost,
    handleReport,
    handleDelete,
    handleCreatorPress } = useLookDetailActions({
    look,
    isOwner,
    currentUserId: currentUser?.id });

  const [commentsVisible, setCommentsVisible] = useState(false);

  const tags: HydratedLookTag[] = (look?.tags ?? []) as HydratedLookTag[];

  const captionText = look?.caption || look?.title || '';

  const creatorDisplayName =
    creatorProfile?.user?.displayName || look?.creator.username || 'unknown';
  const creatorHandle = look?.creator.username ?? 'unknown';
  const followerCount = creatorProfile?.stats?.followerCount;

  const goBack = useCallback(() => navigation.goBack(), [navigation]);

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
    (pressedLookId: string) => {
      haptic.light();
      navigation.push('LookDetail', { lookId: pressedLookId });
    },
    [navigation, haptic],
  );

  // Repost-attribution tap — opens the source creator's profile.
  const handleSourceCreatorPress = useCallback(
    (creatorId: string) => {
      navigation.navigate('UserProfile', { userId: creatorId });
    },
    [navigation],
  );

  // Price formatter for LookHotspots — hoisted so the memoized hero gets a
  // stable reference.
  const formatHotspotPrice = useCallback(
    (price: number, code?: string) => formatFromFiat(price, code as SupportedCurrencyCode),
    [formatFromFiat],
  );

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
        <LookDetailHero
          height={heroHeight}
          width={SCREEN_W}
          compositionDocument={compositionDocument}
          compositionPage={compositionPage}
          mediaPages={mediaPages}
          aspectRatio={resolvedHeroAspectRatio}
          captionText={captionText}
          onFirstMediaLoad={reportFirstMedia}
          onFullscreenRequest={openFullscreen}
          tags={tags}
          onTagTap={handleTagTap}
          formatPrice={formatHotspotPrice}
          currencyCode={currencyCode}
        />

        <LookDetailInfoSection
          look={look}
          captionText={captionText}
          creatorHandle={creatorHandle}
          followerCount={followerCount}
          isOwner={!!isOwner}
          isFollowing={isFollowing}
          followBusy={followBusy}
          onCreatorPress={handleCreatorPress}
          onFollow={handleFollow}
          onSourceCreatorPress={handleSourceCreatorPress}
        />

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

        <ExploreSeam />
      </>
    );
  }, [
    look, heroHeight, SCREEN_W, compositionDocument, compositionPage, captionText,
    mediaPages, resolvedHeroAspectRatio,
    tags, handleTagTap, formatHotspotPrice, currencyCode,
    creatorHandle, followerCount, isOwner, isFollowing, handleFollow, followBusy,
    handleCreatorPress, handleSourceCreatorPress,
    commentCount, currentUser?.id, handleShare, handleCommentPress, handleSignInRequired,
    styles,
    // reportFirstMedia feeds the hero carousel's first-decode telemetry hook
    reportFirstMedia,
    openFullscreen,
    analyticsEvent,
  ]);

  // Explore tile gutter — tighter gutters (Space.xs = 4px) for discovery
  // density.
  const exploreGap = Space.xs;

  const keyExtractor = useCallback((item: LookApiItem) => item.id, []);

  const renderExploreTile = useCallback(
    ({ item, index }: { item: LookApiItem; index: number }) => (
      <LookExploreTile
        look={item}
        index={index}
        gap={exploreGap}
        onPress={handleRelatedLookPress}
      />
    ),
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

  // Footer — full state machine lives in ExploreFooter: loading, error+retry,
  // end state, spacer.
  const renderFooter = useMemo(() => (
    <ExploreFooter
      loading={relatedLoading}
      loadingMore={relatedLoadingMore}
      error={relatedError}
      hasItems={relatedLooks.length > 0}
      hasMore={relatedHasMore}
      onRetryMore={retryLoadMore}
    />
  ), [relatedLoading, relatedLoadingMore, relatedError, relatedLooks.length, relatedHasMore, retryLoadMore]);

  // Empty state — shown when the first page returns zero items or the initial
  // fetch failed. Distinguishes error (with retry) from truly empty.
  const renderEmpty = useMemo(() => (
    <ExploreEmpty
      loading={relatedLoading}
      error={relatedError}
      onRetry={retryRelatedFetch}
    />
  ), [relatedLoading, relatedError, retryRelatedFetch]);

  if (isLoading) {
    return <LookDetailLoadingState onBack={goBack} />;
  }

  if (!look || loadError) {
    return (
      <LookDetailErrorState
        loadError={loadError}
        onRetry={loadLook}
        onBack={goBack}
      />
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
      <LookDetailNavBar
        onBack={goBack}
        onOverflow={openOverflow}
        iconColor={colors.scrimTextPrimary}
      />

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

      <LookInspectSheet
        tag={inspectTag}
        lookId={look.id}
        formatPrice={formatFromFiat}
        onClose={closeInspect}
        onViewDetails={handleViewDetails}
      />

      <LookOverflowMenu
        visible={overflowVisible}
        isOwner={!!isOwner}
        repostBusy={repostBusy}
        onClose={closeOverflow}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onRecreate={handleRecreate}
        onRepost={handleRepost}
        onReport={handleReport}
      />

      {/* Fullscreen media viewer — opened on single-tap of a carousel page */}
      <FullscreenMediaViewer
        images={mediaPages.map((p) => p.uri)}
        videoUris={mediaPages.filter((p) => p.isVideo).map((p) => p.uri)}
        initialIndex={fullscreenIndex}
        visible={fullscreenVisible}
        onActiveIndexChange={setFullscreenIndex}
        onClose={closeFullscreen}
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

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scrollContent: { paddingBottom: Space.lg },

    // ── Social actions ──
    socialWrap: { marginTop: Space.md } });
}
