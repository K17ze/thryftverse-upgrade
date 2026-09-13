import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  StyleSheet,
  StatusBar,
  useWindowDimensions,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAppTheme } from '../theme/ThemeContext';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { Space } from '../theme/designTokens';
import { useStore } from '../store/useStore';
import { RootStackParamList } from '../navigation/types';
import { openProfile } from '../navigation/openProfile';
import { openProductDetail } from '../platform/product/openProductDetail';
import type { ListingApiItem } from '../services/listingsApi';
import type { LookApiItem } from '../services/looksApi';
import type { SellerReviewItem } from '../services/sellerReviewsApi';
import { ProfileSkeleton } from '../components/profile/ProfileSkeleton';
import { ProfileErrorState, ProfileUnavailableState, ProfileBlockedState } from '../components/profile/ProfileStates';
import { ProfileShopTile } from '../components/profile/ProfileShopTile';
import { ProfileLookTile } from '../components/profile/ProfileLookTile';
import { ProfileReviewRow } from '../components/profile/ProfileReviews';
import { type TabKey } from '../components/profile/ProfileTabRail';
import { OfflineBanner } from '../components/OfflineBanner';
import { track } from '../analytics';
import {
  useUserProfileData,
  useUserProfileActions,
  useUserProfileScroll,
  COVER_HEIGHT,
  GRID_GAP,
  CARD_ASPECT,
  SHOP_COLS,
  LOOK_GAP,
  LOOK_COLS,
  type UserProfileTab,
  type UserProfileShopSegment,
} from '../hooks/userprofile';
import { UserProfileHeader } from '../components/userprofile/UserProfileHeader';
import { UserProfileListStates } from '../components/userprofile/UserProfileListStates';
import { UserProfileList } from '../components/userprofile/UserProfileList';
import { UserProfileTopUtilityRow } from '../components/userprofile/UserProfileTopUtilityRow';
import { UserProfileCollapsedHeader } from '../components/userprofile/UserProfileCollapsedHeader';
import { UserProfileStickyRail } from '../components/userprofile/UserProfileStickyRail';
import { UserProfileSheets } from '../components/userprofile/UserProfileSheets';

type Props = NativeStackScreenProps<RootStackParamList, 'UserProfile'>;

export default function UserProfileScreen({ navigation, route }: Props) {
  // -----------------------------------------------------------------------
  // ALL HOOKS - unconditional, no early returns before this section ends
  // -----------------------------------------------------------------------
  const { colors, isDark } = useAppTheme();
  const { width: screenWidth } = useWindowDimensions();
  const { formatFromFiat } = useFormattedPrice();

  const [activeTab, setActiveTab] = useState<UserProfileTab>('Listings');
  const [shopSegment, setShopSegment] = useState<UserProfileShopSegment>('forsale');

  // UserProfile is a public-only projection. Self-navigation is normalised
  // to the MyProfile tab by the openProfile() resolver before this screen
  // mounts. If a self-ID somehow reaches this screen (e.g. stale deep
  // link), redirect to the owner tab instead of rendering owner data.
  const userId = route.params?.userId;
  const targetUserId = userId;
  const currentUserId = useStore(s => s.currentUser?.id);
  useEffect(() => {
    if (userId && currentUserId && userId === currentUserId) {
      navigation.replace('MainTabs', { screen: 'Profile' });
    }
  }, [userId, currentUserId, navigation]);

  useEffect(() => {
    if (userId && userId !== currentUserId) {
      track('profile_viewed', { user_id: userId });
    }
  }, [userId, currentUserId]);

  // Data lifecycle: profile aggregate + tab-scoped infinite queries, seller
  // trust, highlights, focus-refetch, readiness milestones, and every
  // derived display field / list projection.
  const {
    activeQuery,
    isLoadingProfile,
    profileError,
    stats,
    viewer,
    targetProfile,
    displayUsername,
    displayHandle,
    displayAvatar,
    displayCover,
    memberSince,
    sellerTrust,
    awayState,
    traderDisclosure,
    storefrontSummary,
    highlights,
    activeCount,
    soldCount,
    lookCount,
    reviewCount,
    listData,
    shopRailItems,
    isRefreshing,
    isFetchingNextPage,
    reviewSummary,
    handleLoadMore,
    handleRefresh,
    refetchProfile,
    refetchReviews,
  } = useUserProfileData(targetUserId, activeTab, shopSegment);

  const currentDestination: string = activeTab === 'Listings' ? `${activeTab}-${shopSegment}` : activeTab;

  // Scroll chrome: shared scroll position, collapsed-header / sticky-rail
  // visibility, animated + web scroll handlers, per-destination offsets.
  const {
    reducedMotion,
    scrollY,
    collapsedShared,
    stickyShared,
    stickyThreshold,
    collapsedVisible,
    stickyRailVisible,
    listRef,
    scrollHandler,
    handleContentSizeChange,
    onTabRailLayout,
  } = useUserProfileScroll(currentDestination);

  // Actions: follow/block/report mutations plus the sheet state and
  // handlers wired to the hero, collapsed header, rows and sheets.
  const {
    connectionsSheet,
    moreSheetVisible,
    showPassportModal,
    reportSheetVisible,
    blockConfirmVisible,
    restrictConfirmVisible,
    responseComposer,
    reportSheet,
    followPending,
    blockPending,
    restrictPending,
    reportPending,
    handleShare,
    handleCopyLink,
    handleMessageProfile,
    handleFollowToggle,
    handleMore,
    handleReport,
    handleBlock,
    handleRestrict,
    handleMute,
    handleUnmute,
    confirmRestrict,
    handleUnrestrict,
    handleRespondToReview,
    handleCloseResponseComposer,
    confirmBlock,
    handleUnblock,
    openConnections,
    handleReportSubmit,
    handleOpenProfile,
    openResponseComposer,
    openReviewReport,
    dismissMoreSheet,
    dismissReportSheet,
    dismissBlockConfirm,
    dismissRestrictConfirm,
    dismissConnections,
    closePassportModal,
    dismissReviewReport,
    handleReviewReportSubmitted,
    handleReviewReportError,
  } = useUserProfileActions({
    navigation,
    targetUserId,
    currentUserId,
    viewer,
    displayUsername,
    refetchReviews,
  });

  // Responsive geometry
  const cardWidth = useMemo(() => (screenWidth - Space.md * 2 - GRID_GAP * (SHOP_COLS - 1)) / SHOP_COLS, [screenWidth]);
  const cardHeight = cardWidth * CARD_ASPECT;
  const lookTileWidth = useMemo(() => (screenWidth - Space.md * 2 - LOOK_GAP * (LOOK_COLS - 1)) / LOOK_COLS, [screenWidth]);
  const lookTileHeight = lookTileWidth * (4 / 3);

  // Render item
  const renderItem = useCallback(({ item }: { item: ListingApiItem | LookApiItem | SellerReviewItem }): React.ReactElement | null => {
    if (activeTab === 'Listings') {
      return (
        <ProfileShopTile
          item={item as ListingApiItem}
          isSold={shopSegment === 'sold'}
          onPress={() => openProductDetail(navigation, { referenceKind: 'listing', canonicalId: (item as ListingApiItem).id, sourceSurface: 'UserProfile' })}
          formatPrice={formatFromFiat}
          cardWidth={cardWidth}
          cardHeight={cardHeight}
        />
      );
    }
    if (activeTab === 'Looks') {
      return <ProfileLookTile item={item as LookApiItem} onPress={() => navigation.navigate('LookDetail', { lookId: (item as LookApiItem).id })} cardWidth={lookTileWidth} cardHeight={lookTileHeight} gap={LOOK_GAP} />;
    }
    const reviewItem = item as SellerReviewItem;
    return (
      <ProfileReviewRow
        item={reviewItem}
        onOpenReviewer={(uid) => openProfile(navigation, uid, currentUserId)}
        onOpenListing={(lid) => openProductDetail(navigation, { referenceKind: 'listing', canonicalId: lid, sourceSurface: 'UserProfileReview' })}
        onRespond={targetUserId === currentUserId
          ? openResponseComposer
          : undefined}
        onReport={targetUserId !== currentUserId
          ? openReviewReport
          : undefined}
      />
    );
  }, [activeTab, shopSegment, navigation, formatFromFiat, cardWidth, cardHeight, lookTileWidth, lookTileHeight, targetUserId, currentUserId, openResponseComposer, openReviewReport]);

  // -----------------------------------------------------------------------
  // DERIVED RENDER STATE - after all hooks
  // -----------------------------------------------------------------------
  const isBlockedByTarget = viewer?.isBlockedByTarget && !viewer.isSelf;
  const isBlocked = viewer?.isBlocked ?? false;
  const isMuted = viewer?.isMuted ?? false;
  const isRestricted = viewer?.isRestricted ?? false;
  const canMessage = viewer?.canMessage ?? false;

  // State labels - rendered by ProfileStates subcomponents:
  // "Profile unavailable" (ProfileUnavailableState)
  // "You've been blocked" (ProfileBlockedState)
  // canMessage gates the Message button (ProfileHero)

  // -----------------------------------------------------------------------
  // CONDITIONAL RENDERS - loading, error, unavailable, blocked
  // -----------------------------------------------------------------------
  if (isLoadingProfile && !targetProfile) {
    return <ProfileSkeleton coverHeight={COVER_HEIGHT} screenWidth={screenWidth} destination={activeTab as 'Listings' | 'Looks' | 'About' | 'Reviews'} />;
  }
  if (profileError && !targetProfile) {
    return <ProfileErrorState onRetry={refetchProfile} onBack={() => navigation.goBack()} coverHeight={COVER_HEIGHT} />;
  }
  if (!targetProfile) {
    // Renders "Profile unavailable" state
    return <ProfileUnavailableState onBack={() => navigation.goBack()} coverHeight={COVER_HEIGHT} />;
  }
  if (isBlockedByTarget) {
    // Renders "You've been blocked" state
    return <ProfileBlockedState onBack={() => navigation.goBack()} onShare={handleShare} coverHeight={COVER_HEIGHT} />;
  }

  // -----------------------------------------------------------------------
  // MAIN RENDER
  // -----------------------------------------------------------------------
  const numColumns = activeTab === 'Reviews' || activeTab === 'About' ? 1 : activeTab === 'Looks' ? LOOK_COLS : SHOP_COLS;
  const gridGap = activeTab === 'Listings' ? GRID_GAP : LOOK_GAP;

  const tabs: { key: TabKey; label: string; count?: number }[] = [
    { key: 'Listings', label: 'Listings', count: activeCount + soldCount },
    { key: 'Looks', label: 'Looks', count: lookCount },
    { key: 'About', label: 'About' },
    ...(reviewCount > 0 ? [{ key: 'Reviews' as const, label: 'Reviews', count: reviewCount }] : []),
  ];

  const listHeader = (
    <UserProfileHeader
      targetProfile={targetProfile}
      displayUsername={displayUsername}
      displayAvatar={displayAvatar}
      displayCover={displayCover}
      viewer={viewer}
      stats={stats}
      activeCount={activeCount}
      soldCount={soldCount}
      reviewCount={reviewCount}
      memberSince={memberSince}
      sellerTrust={sellerTrust}
      traderDisclosure={traderDisclosure}
      awayState={awayState}
      storefrontSummary={storefrontSummary}
      highlights={highlights}
      shopRailItems={shopRailItems}
      followPending={followPending}
      isBlocked={isBlocked}
      scrollY={scrollY}
      reducedMotion={reducedMotion}
      activeTab={activeTab}
      shopSegment={shopSegment}
      tabs={tabs}
      reviewSummary={reviewSummary}
      onFollowToggle={handleFollowToggle}
      onMessage={handleMessageProfile}
      onMore={handleMore}
      onOpenConnections={openConnections}
      onTabChange={setActiveTab}
      onSegmentChange={setShopSegment}
      onTabRailLayout={onTabRailLayout}
      onOpenHighlight={(highlightId) => {
        navigation.navigate('PosterHighlightViewer', { highlightId });
      }}
      onPressShopItem={(id) => openProductDetail(navigation, { referenceKind: 'listing', canonicalId: id, sourceSurface: 'UserProfileShopRail' })}
    />
  );

  // The empty component must stay null (not an element rendering null) so
  // the list can distinguish "no state to show" from a mounted empty view.
  const showListState = activeTab === 'About' || (!activeQuery.isLoading && (Boolean(activeQuery.error) || listData.length === 0));
  const listEmpty = showListState ? (
    <UserProfileListStates
      activeTab={activeTab}
      shopSegment={shopSegment}
      isLoading={activeQuery.isLoading}
      hasError={Boolean(activeQuery.error)}
      isEmpty={listData.length === 0}
      onRetry={() => activeQuery.refetch()}
      targetProfile={targetProfile}
      storefrontSummary={storefrontSummary}
      sellerTrust={sellerTrust}
    />
  ) : null;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={!isDark ? 'dark-content' : 'light-content'} backgroundColor={colors.background} />

      <OfflineBanner onRetry={() => void handleRefresh()} />

      <UserProfileTopUtilityRow
        scrollY={scrollY}
        collapsedVisible={collapsedVisible}
        onBack={() => navigation.goBack()}
        onShare={handleShare}
        onMore={handleMore}
      />

      <UserProfileCollapsedHeader
        scrollY={scrollY}
        collapsedShared={collapsedShared}
        reducedMotion={reducedMotion}
        collapsedVisible={collapsedVisible}
        displayAvatar={displayAvatar}
        displayName={targetProfile?.displayName || displayUsername}
        viewer={viewer}
        followPending={followPending}
        isBlocked={isBlocked}
        onFollowToggle={handleFollowToggle}
        onBack={() => navigation.goBack()}
        onShare={handleShare}
      />

      <UserProfileStickyRail
        scrollY={scrollY}
        stickyShared={stickyShared}
        stickyThreshold={stickyThreshold}
        reducedMotion={reducedMotion}
        stickyRailVisible={stickyRailVisible}
        tabs={tabs}
        activeTab={activeTab}
        shopSegment={shopSegment}
        onTabChange={setActiveTab}
        onSegmentChange={setShopSegment}
      />

      <UserProfileList
        listRef={listRef}
        data={listData as (ListingApiItem | LookApiItem | SellerReviewItem)[]}
        renderItem={renderItem}
        header={listHeader}
        emptyContent={listEmpty}
        numColumns={numColumns}
        gridGap={gridGap}
        cellWidth={cardWidth}
        currentDestination={currentDestination}
        reducedMotion={reducedMotion}
        scrollHandler={scrollHandler}
        isRefreshing={isRefreshing}
        isFetchingNextPage={isFetchingNextPage}
        onRefresh={handleRefresh}
        onLoadMore={handleLoadMore}
        onContentSizeChange={handleContentSizeChange}
      />

      <UserProfileSheets
        moreSheetVisible={moreSheetVisible}
        onDismissMoreSheet={dismissMoreSheet}
        isBlocked={isBlocked}
        isMuted={isMuted}
        isRestricted={isRestricted}
        onShare={handleShare}
        onCopyLink={handleCopyLink}
        onReport={handleReport}
        onMute={handleMute}
        onUnmute={handleUnmute}
        onRestrict={handleRestrict}
        onUnrestrict={handleUnrestrict}
        onBlock={handleBlock}
        onUnblock={handleUnblock}
        reportSheetVisible={reportSheetVisible}
        onDismissReportSheet={dismissReportSheet}
        reportPending={reportPending}
        onSubmitReport={handleReportSubmit}
        blockConfirmVisible={blockConfirmVisible}
        onDismissBlockConfirm={dismissBlockConfirm}
        displayHandle={displayHandle}
        blockPending={blockPending}
        onConfirmBlock={confirmBlock}
        restrictConfirmVisible={restrictConfirmVisible}
        onDismissRestrictConfirm={dismissRestrictConfirm}
        restrictPending={restrictPending}
        onConfirmRestrict={confirmRestrict}
        connectionsSheet={connectionsSheet}
        onDismissConnections={dismissConnections}
        targetUserId={targetUserId}
        followerCount={stats?.followerCount ?? 0}
        followingCount={stats?.followingCount ?? 0}
        onOpenProfile={handleOpenProfile}
        responseComposer={responseComposer}
        onCloseResponseComposer={handleCloseResponseComposer}
        onSubmitResponse={handleRespondToReview}
        reviewReportSheet={reportSheet}
        onDismissReviewReport={dismissReviewReport}
        onReviewReportSubmitted={handleReviewReportSubmitted}
        onReviewReportError={handleReviewReportError}
        targetProfile={targetProfile}
        passportVisible={showPassportModal}
        onClosePassport={closePassportModal}
        displayAvatar={displayAvatar}
        sellerTrust={sellerTrust}
        memberSince={memberSince}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
