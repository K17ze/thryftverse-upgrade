import React, { useCallback } from 'react';
import {
  View,
  StyleSheet,
  StatusBar,
  useWindowDimensions } from 'react-native';
import { EmptyState } from '../components/EmptyState';
import Reanimated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../theme/ThemeContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { Space } from '../theme/designTokens';
import { useStore } from '../store/useStore';
import { useNavigation, useScrollToTop } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useBackendData } from '../context/BackendDataContext';
import { useHaptic } from '../hooks/useHaptic';
import { MyProfileIdentityHero } from '../components/profile/MyProfileIdentityHero';
import { SharePassportModal } from '../components/profile/SharePassportModal';
import { ProfileUtilityRail } from '../components/profile/ProfileUtilityRail';
import { ShopRail } from '../components/profile/ShopRail';
import { PosterHighlightsRail } from '../components/poster/PosterHighlightsRail';
import { OfflineBanner } from '../components/OfflineBanner';
import { openProfile } from '../navigation/openProfile';
import { openProductDetail } from '../platform/product/openProductDetail';
import { useAppTranslation } from '../i18n/useAppTranslation';
import type { Listing } from '../domain';
import {
  ProfileHeaderHero,
  CompletionGrowthPanel,
  StorefrontTabs,
  ClosetGridItem,
  AwayModeBanner } from '../components/myprofile';
import { formatMemberSince } from '../components/myprofile/myProfileViewModels';
import {
  useMyProfileData,
  useMyProfileMedia,
  useMyProfileReorder,
  useMyProfileCompletion,
  useMyProfileScroll,
  COVER_HEIGHT,
  GRID_GAP,
  GRID_COLS,
  CARD_ASPECT,
  type MyProfileTab } from '../hooks/myprofile';

type NavT = NativeStackNavigationProp<RootStackParamList>;

export default function MyProfileScreen() {
  const { colors, isDark } = useAppTheme();
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const { t: tt } = useAppTranslation('myProfile');

  const navigation = useNavigation<NavT>();
  const insets = useSafeAreaInsets();
  const scrollRef = React.useRef<Reanimated.ScrollView>(null);
  useScrollToTop(scrollRef);
  const [activeTab, setActiveTab] = React.useState<MyProfileTab>('listings');

  const haptic = useHaptic();
  const { formatFromFiat } = useFormattedPrice();
  const { listings } = useBackendData();

  const currentUser = useStore((state) => state.currentUser);
  const holidayMode = useStore((state) => state.accountPreferences?.holidayMode === true);
  const user = currentUser;
  const profileUserId = user?.id ?? null;

  // Data lifecycle — profile refresh on mount, seller trust, reviews,
  // follow counts, co-own holdings, looks (focus refetch) and highlights.
  const {
    sellerTrust,
    reviews: myReviews,
    reviewSummary: myReviewSummary,
    reviewCount: myReviewCount,
    reviewsLoading,
    reviewsError,
    refetchReviews,
    followCounts,
    followCountsStatus,
    coOwnHoldings,
    myLooks,
    looksLoading,
    looksError,
    loadMyLooks,
    highlights } = useMyProfileData(currentUser?.id);

  // Profile media — avatar/cover upload wiring, display priority and
  // upload-status toasts. The upload state machine is untouched.
  const {
    avatarState,
    coverState,
    pickAvatar,
    pickCover,
    retryCover,
    revertCover,
    displayAvatar,
    displayCover } = useMyProfileMedia(user);

  // G4: grid pin/reorder — owns the featured-override ordering and the
  // save/discard flow against setFeaturedListings.
  const {
    allOwnedListings,
    shopRailItems,
    isReorderMode,
    isSavingReorder,
    isItemFeatured,
    getItemFeaturedRank,
    handleTogglePin,
    handleShiftFeatured,
    handleSaveReorder,
    handleToggleReorderMode } = useMyProfileReorder(listings, profileUserId);

  // Completion + growth prompts — identity-field completion only; listing
  // and audience tasks are growth prompts, not completion requirements.
  const {
    completion,
    completionCta,
    showCompletionPrompt,
    showGrowthPrompt,
    showFirstListingGrowth,
    showAudienceGrowth,
    dismissCompletion,
    dismissGrowth } = useMyProfileCompletion({
    displayName: user?.displayName,
    bio: user?.bio,
    hasAvatar: Boolean(displayAvatar),
    hasCover: Boolean(displayCover),
    listingCount: allOwnedListings.length,
    followCountsStatus,
    followerCount: followCounts.followerCount });

  // Parallax scroll for cover
  const { scrollY, scrollHandler } = useMyProfileScroll();

  const [showPassportModal, setShowPassportModal] = React.useState(false);
  const handleShare = () => {
    if (!user) return;
    haptic.light();
    setShowPassportModal(true);
  };

  const utilityItems = React.useMemo(
    () => [
      {
        icon: 'storefront-outline' as const,
        label: tt('utility.sellerHub'),
        value: 'Commerce & Ops',
        onPress: () => { haptic.light(); navigation.navigate('SellerHub'); },
        accessibilityLabel: tt('accessibility.sellerHub'),
        accessibilityHint: 'Open Seller Hub for Orders, Wallet, Analytics, and Closet' },
      {
        icon: 'timer-outline' as const,
        label: tt('utility.auctions'),
        onPress: () => { haptic.light(); navigation.navigate('AuctionHome'); },
        accessibilityLabel: tt('accessibility.browseAuctions') },
      {
        icon: 'layers-outline' as const,
        label: tt('utility.coOwn'),
        value: coOwnHoldings.length > 0 ? tt('utility.assetsCount', { count: coOwnHoldings.length }) : undefined,
        onPress: () => { haptic.light(); navigation.navigate('CoOwnHub'); },
        accessibilityLabel: tt('accessibility.browseCoOwnMarket') },
    ],
    [coOwnHoldings.length, haptic, navigation, tt]
  );

  const CARD_WIDTH = (SCREEN_WIDTH - Space.md * 2 - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS;
  const CARD_HEIGHT = CARD_WIDTH * CARD_ASPECT; // 3:4 portrait grid

  const renderListingItem = useCallback(
    ({ item, index }: { item: Listing; index: number }) => {
      const isFeatured = isItemFeatured(item.id, item.featured);
      const featuredRank = isFeatured ? getItemFeaturedRank(item.id, item.featured) : 0;
      return (
        <ClosetGridItem
          item={item}
          index={index}
          cardHeight={CARD_HEIGHT}
          isReorderMode={isReorderMode}
          isFeatured={isFeatured}
          featuredRank={featuredRank}
          priceLabel={formatFromFiat(item.price, 'GBP', { displayMode: 'fiat' })}
          onPress={() => {
            if (isReorderMode) {
              handleTogglePin(item.id);
            } else {
              navigation.navigate('ManageListing', { itemId: item.id });
            }
          }}
          onTogglePin={() => handleTogglePin(item.id)}
          onShiftLeft={() => handleShiftFeatured(item.id, -1)}
          onShiftRight={() => handleShiftFeatured(item.id, 1)}
        />
      );
    },
    [navigation, formatFromFiat, CARD_HEIGHT, isReorderMode, isItemFeatured, getItemFeaturedRank, handleTogglePin, handleShiftFeatured]
  );

  const tabs = React.useMemo(
    () => [
      { key: 'listings', label: tt('tabs.shop'), count: allOwnedListings.length },
      { key: 'looks', label: tt('tabs.looks'), count: myLooks.length },
      { key: 'about', label: tt('tabs.about') },
      ...(myReviewCount > 0 ? [{ key: 'reviews' as const, label: tt('tabs.reviews'), count: myReviewCount }] : []),
    ],
    [tt, allOwnedListings.length, myLooks.length, myReviewCount]
  );

  if (!user) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={!isDark ? 'dark-content' : 'light-content'} backgroundColor={colors.background} />
        <EmptyState
          icon="person-outline"
          title={tt('common:misc.notSignedIn')}
          subtitle={tt('notSignedIn.subtitle')}
          ctaLabel={tt('notSignedIn.signIn')}
          onCtaPress={() => navigation.navigate('Login')}
        />
      </View>
    );
  }

  const memberSince = formatMemberSince(user.createdAt);

  return (
    <View testID="profile-screen" style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={!isDark ? 'dark-content' : 'light-content'} backgroundColor={colors.background} />

      <OfflineBanner />

      <ProfileHeaderHero
        coverMedia={displayCover}
        coverState={coverState}
        avatarState={avatarState}
        insetsTop={insets.top}
        scrollY={scrollY}
        username={user.username}
        onSettings={() => { haptic.light(); navigation.navigate('Settings'); }}
        onShare={handleShare}
        onEditCover={pickCover}
        onRetryCover={retryCover}
        onRevertCover={revertCover}
      />

      <Reanimated.ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingTop: COVER_HEIGHT }]}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
      >
        {/* ── 3-9: IDENTITY HERO + ACTIONS ── */}
        <View>
          <MyProfileIdentityHero
            avatarUri={displayAvatar}
            displayName={user.displayName || user.username}
            username={user.username}
            bio={user.bio ?? undefined}
            location={user.location ?? undefined}
            website={user.website ?? null}
            memberSince={memberSince}
            sellerTrust={sellerTrust}
            ratingAverage={sellerTrust?.rating ?? null}
            reviewCount={sellerTrust?.reviewCount}
            responseTimeLabel={sellerTrust?.responseTimeLabel ?? null}
            followerCount={followCounts.followerCount}
            followingCount={followCounts.followingCount}
            followCountsStatus={followCountsStatus}
            onEditAvatar={pickAvatar}
            onEditProfile={() => navigation.navigate('EditProfile', {})}
            onShare={handleShare}
            onPressSold={() => { haptic.light(); navigation.navigate('MyOrders'); }}
            onPressFollowers={() => { haptic.light(); navigation.navigate('ConnectionList', { userId: currentUser!.id, mode: 'followers' }); }}
            onPressFollowing={() => { haptic.light(); navigation.navigate('ConnectionList', { userId: currentUser!.id, mode: 'following' }); }}
          />

          {/* Away-mode indicator — shown when holiday mode is enabled */}
          {holidayMode ? (
            <AwayModeBanner onPress={() => navigation.navigate('PrivacySettings')} />
          ) : null}

          {/* ── STORY HIGHLIGHTS RAIL ──
              Highlights sit between the identity hero and
              the utility rail. Renders only when highlights exist (truthful UI —
              no fabricated placeholder content). Owner sees a "New" tile. */}
          {highlights.length > 0 ? (
            <PosterHighlightsRail
              highlights={highlights}
              isOwner
              onOpenHighlight={(highlightId) => {
                haptic.light();
                navigation.navigate('PosterHighlightViewer', { highlightId });
              }}
              onCreateHighlight={() => {
                haptic.light();
                navigation.navigate('CreatePosterHighlight', {});
              }}
              onHighlightLongPress={(highlightId) => {
                haptic.light();
                navigation.navigate('PosterHighlightViewer', { highlightId });
              }}
            />
          ) : null}

          {/* ── 8. COMPACT MARKETPLACE UTILITY RAIL ── */}
          <ProfileUtilityRail items={utilityItems} />

          {/* ── 8b. CURATED SHOP WINDOW ──
              Horizontal rail of featured listings — the shop's front window.
              Renders only when featured items exist (ShopRail returns null
              when empty). Sits between the utility rail and the tab rail so
              the curated selection leads into the full shop grid. */}
          <ShopRail
            items={shopRailItems}
            onPressItem={(id) => { haptic.light(); navigation.navigate('ManageListing', { itemId: id }); }}
          />

        </View>

        <StorefrontTabs
          tabs={tabs}
          activeKey={activeTab}
          onTabChange={(key) => setActiveTab(key)}
          reducedMotion={reducedMotion}
          listings={allOwnedListings}
          reorderMode={isReorderMode}
          isSaving={isSavingReorder}
          onToggleReorder={() => {
            if (isReorderMode) {
              void handleSaveReorder();
            } else {
              handleToggleReorderMode();
            }
          }}
          onViewAll={() => navigation.navigate('MyListings')}
          onStartSelling={() => navigation.navigate('Sell')}
          onImport={() => navigation.navigate('CatalogImportStart')}
          renderItem={renderListingItem}
          looks={myLooks}
          looksLoading={looksLoading}
          looksError={looksError}
          onRetryLooks={() => { void loadMyLooks(); }}
          onCreateLook={() => navigation.navigate('CreatorStudio', { type: 'look' })}
          looksNavigation={navigation}
          coOwnHoldings={coOwnHoldings}
          website={user.website ?? null}
          sellerTrust={sellerTrust}
          onViewPortfolio={() => { haptic.light(); navigation.navigate('CoOwnHub'); }}
          reviewSummary={myReviewSummary}
          reviewCount={myReviewCount}
          reviewsLoading={reviewsLoading}
          reviewsError={reviewsError}
          reviews={myReviews}
          onRefetchReviews={refetchReviews}
          onOpenReviewer={(uid) => openProfile(navigation, uid, currentUser?.id)}
          onOpenListing={(lid) => openProductDetail(navigation, { referenceKind: 'listing', canonicalId: lid, sourceSurface: 'MyProfileReview' })}
        />

        <CompletionGrowthPanel
          showCompletionPrompt={showCompletionPrompt}
          showGrowthPrompt={showGrowthPrompt}
          completionPercent={completion.percent}
          completionDone={completion.done}
          completionTotal={completion.total}
          completionCtaLabel={completionCta.label}
          completionCtaFocus={completionCta.focus}
          showFirstListingGrowth={showFirstListingGrowth}
          showAudienceGrowth={showAudienceGrowth}
          onDismissCompletion={() => { haptic.light(); dismissCompletion(); }}
          onDismissGrowth={() => { haptic.light(); dismissGrowth(); }}
          onCompleteProfile={(focus) => { haptic.light(); navigation.navigate('EditProfile', focus ? { focus } : {}); }}
          onListFirstItem={() => { haptic.light(); navigation.navigate('Sell'); }}
          onGrowAudience={() => { haptic.light(); navigation.navigate('CreatorAnalyticsDashboard'); }}
        />
      </Reanimated.ScrollView>

      {user ? (
        <SharePassportModal
          visible={showPassportModal}
          onClose={() => setShowPassportModal(false)}
          username={user.username}
          displayName={user.displayName || user.username}
          avatarUri={displayAvatar}
          ratingAverage={sellerTrust?.rating ?? null}
          completedSales={sellerTrust?.completedSales ?? 0}
          verificationTier={sellerTrust?.verificationTier ?? (sellerTrust?.verified ? 'seller' : null)}
          memberSince={memberSince}
          bio={user.bio ?? null}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden' },
  scrollContent: { paddingBottom: Space.xxl + Space.xxl + Space.xs, overflow: 'hidden' } });
