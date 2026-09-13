import React, { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  StatusBar,
  RefreshControl,
} from 'react-native';
import Reanimated, { FadeIn, withSpring } from 'react-native-reanimated';
import { GestureDetector } from 'react-native-gesture-handler';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { openProductDetail } from '../platform/product/openProductDetail';
import { useAppTheme } from '../theme/ThemeContext';
import type { Listing } from '../services/listingsApi';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useHaptic } from '../hooks/useHaptic';
import { useSignupWall } from '../hooks/useSignupWall';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useConnectivity } from '../hooks/useConnectivity';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useMotionConfig } from '../hooks/useMotionConfig';
import { useBreakpoint } from '../hooks/useBreakpoint';
import { Motion } from '../theme/motionTokens';
import { useBackendData } from '../context/BackendDataContext';

import {
  BundleUpsellRow,
  SeenInLooksRail,
} from '../components/product';
import {
  CommerceDetailSection,
  CommerceDetailDisclosureRow,
  CommerceDetailUnavailableInline,
  CommerceDetailOfflineBanner,
  CommerceMediaHero,
  CommerceIdentityBlock,
  CommerceTrustDossier,
  CommerceActionDock,
} from '../components/commerce/detail';
import {
  ItemDetailStateCanvas,
  ItemDetailHeader,
  ItemDetailItemDetails,
  ItemDetailSellerSection,
  ItemDetailBuyingSection,
  ItemDetailPriceMarket,
  ItemDetailSimilarGrid,
  ItemDetailFooterNotices,
  ItemDetailSheets,
} from '../components/itemdetail';
import {
  ProductAnalytics,
} from '../platform/product';
import { useVisuallyComplete } from '../performance/visuallyComplete';
import { Space } from '../theme/designTokens';
import { t } from '../i18n';
import { useItemDetailData } from '../hooks/itemDetail/useItemDetailData';
import { useItemDetailActions } from '../hooks/itemDetail/useItemDetailActions';
import { useItemDetailMedia } from '../hooks/itemDetail/useItemDetailMedia';
import { useItemDetailDismiss } from '../hooks/itemDetail/useItemDetailDismiss';
import { useItemDetailOverlays } from '../hooks/itemDetail/useItemDetailOverlays';
import { buildItemDetailDerived } from '../hooks/itemDetail/itemDetailDerived';
import { useRefetchOnFocus } from '../hooks/useRefetchOnFocus';
import { queryKeys } from '../platform/server/queryKeys';

type ItemDetailRoute = RouteProp<RootStackParamList, 'ItemDetail'>;
type ItemDetailNav = NativeStackNavigationProp<RootStackParamList>;

export default function ItemDetailScreen() {
  const { isDark, colors } = useAppTheme();
  const route = useRoute<ItemDetailRoute>();
  const navigation = useNavigation<ItemDetailNav>();
  const insets = useSafeAreaInsets();
  const { height: screenHeight, isCommerceCompact: isCompactScreen } = useBreakpoint();
  const { isOffline } = useConnectivity();
  const reducedMotion = useReducedMotion();
  const { spring } = useMotionConfig();
  const reportReady = useVisuallyComplete('ItemDetail');
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [priceHistoryExpanded, setPriceHistoryExpanded] = useState(false);
  // ── Overlay visibility (collection modal, size guide, Q&A, purchase
  // details, overflow, make offer, condition info) — independent flags
  // grouped by the overlays hook. Share + fullscreen live in the
  // actions/media hooks. ──
  const overlay = useItemDetailOverlays();

  const currentUser = useStore((state) => state.currentUser);
  const [refreshing, setRefreshing] = useState(false);
  const { isSyncing, lastError, refreshListings } = useBackendData();

  const { itemId, sectionKey, position, reasonCode, personalised } = route.params || {};

  // ── Product-query domain (listing, seller, recommendations, comparables,
  // price history, Q&A, continue-exploring prefetch, analytics session) ──
  const data = useItemDetailData({
    itemId,
    sectionKey,
    position,
    reasonCode,
    personalised,
  });

  const item = data.listing;
  // Refetch the listing on screen focus. React Navigation keeps pushed
  // screens mounted, so refetchOnMount never refires on back-navigation —
  // without this, price edits, sales, or offer-count changes made while
  // the user was away would be served from cache for up to `staleTime`.
  // Debounced (5s) inside the hook; keepPreviousData prevents flicker.
  useRefetchOnFocus(
    itemId ? queryKeys.listing.detail(itemId) : ['listing', 'detail', 'none'],
    Boolean(itemId),
  );
  const serverCommerce = data.commerce;
  const seller = data.seller;
  const sellerFollowMutation = data.sellerFollow;
  const recommendationSections = data.recommendationSections;
  const recsError = data.recommendationsError;
  const soldComps = data.soldComparables;
  const priceHistory = data.priceHistory;
  const qaSummary = data.qaSummary;

  // Readiness milestones: 'data-ready' when the listing query settles
  // (success, error, or not-found are all terminal for readiness);
  // 'interaction-ready' once an item is actually rendered with its
  // actionable controls. Mount alone never completes the visit.
  React.useEffect(() => {
    if (!data.isLoading) reportReady('data-ready');
    if (item) reportReady('interaction-ready');
  }, [data.isLoading, item, reportReady]);

  // ── Action orchestration (share, save, report, seller nav, buy-now,
  // make-offer, price-alert toggle, enquire / request viewing) ──
  const actions = useItemDetailActions({
    listing: item,
    seller,
    currentUserId: currentUser?.id,
    navigation,
  });
  const {
    isFav,
    handleShare,
    shareVisible,
    closeShare: setShareVisible,
    handleToggleFav,
    handleViewSeller,
    handleMessageSeller,
    handleEnquire,
    handleRequestViewing,
    handleTogglePriceAlert,
    priceAlertEnabled,
    priceAlertLoading,
  } = actions;
  const isItemSavedAnywhere = useStore((state) => state.isItemSavedAnywhere);
  const isSavedProduct = useStore((state) => state.isSavedProduct);
  const toggleSavedProduct = useStore((state) => state.toggleSavedProduct);

  // ── Media stage (active image index + full-screen viewer) ──
  const media = useItemDetailMedia({ listing: item });
  const fullscreenVisible = media.isViewerVisible;

  const { formatFromFiat, fxRates, displayMode } = useFormattedPrice();
  const { show } = useToast();
  const haptic = useHaptic();
  const { requireAuth } = useSignupWall();

  // ── Gesture/worklet domain ──
  // Scroll offset, spring-driven pagination index, swipe-to-dismiss pan,
  // chrome-fade styles, and the double-tap big-heart values all live in
  // the dismiss hook — the screen only binds them to the tree.
  const {
    scrollY, scrollHandler, paginationIndex, dismissPan,
    dismissContainerStyle, dismissChromeStyle,
    bigHeartScale, bigHeartOpacity, handleDoubleTap,
  } = useItemDetailDismiss({
    navigation, screenHeight, reducedMotion, spring,
    onDoubleTap: actions.handleDoubleTap,
  });

  // Pull-to-refresh — refetches the listing and backend data in parallel.
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.allSettled([
        data.refetch(),
        refreshListings(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [data, refreshListings]);

  // These values are consumed by the planned continuation surface. Retaining
  // them here ensures pagination state remains available when that route lands.
  void data.explore.items;
  void data.explore.fetchNextPage;
  void data.explore.hasNextPage;
  void data.explore.isFetchingNextPage;

  const listingEngagement = item?.engagement ?? null;

  if (data.isLoading && !item) {
    return (
      <ItemDetailStateCanvas
        state="loading"
        family="direct"
        heroFraction={isCompactScreen ? 0.56 : 0.6}
      />
    );
  }

  if (data.isError && !item) {
    return (
      <ItemDetailStateCanvas
        state="error"
        title={isOffline ? "You're offline" : undefined}
        message={isOffline
          ? 'Connect to the internet to load this listing.'
          : undefined}
        onRetry={() => data.refetch()}
      />
    );
  }

  if (!item) {
    return (
      <ItemDetailStateCanvas
        state="unavailable"
        title="Item not found"
        message="This listing may have been removed or is no longer available."
        onRetry={() => navigation.navigate('MainTabs', { screen: 'Explore' })}
        retryLabel={t('product.browseSimilar')}
      />
    );
  }

  // ── Derived display model ──
  // Every display string, flag and dock-geometry constant is built once
  // from the resolved listing by the pure derived builder.
  const {
    displayTitle, hasPrice, hasDiscount, formattedPrice, formattedOriginal,
    discountPercent, formattedProtectionTotal, priceIzeText, capabilities,
    commerce, bundleItems, seenInLooksItems, interestSignal, socialProofLine,
    attributeLine, conditionMeta, secondaryLine, familyStateAccent,
    scrollBottomPadding, priceInsightRows, priceInsightSummary,
    purchaseSummary, sellerStatsLine, sellerVerified,
  } = buildItemDetailDerived({
    item, seller, listingEngagement, serverCommerce,
    currentUserId: currentUser?.id, isFav, isItemSavedAnywhere,
    recommendationSections, soldComps, priceHistory,
    insetsBottom: insets.bottom, colors, formatFromFiat, fxRates, displayMode,
  });

  // ── Two-tier save (Pinterest pattern) ──
  // Tap = instant quick-save toggle on the generic Saved list — low
  // commitment, reversible with a second tap. Long-press = "file to
  // board" — opens the collection picker. Both tiers are gated by the
  // save auth wall.
  const handleQuickSave = () => {
    if (!requireAuth('save_item')) return;
    haptic.patterns.save();
    const wasSaved = isSavedProduct(item.id);
    toggleSavedProduct(item.id);
    show(wasSaved ? 'Removed from Saved' : 'Saved', 'success');
  };

  const handleSaveToCollection = () => {
    if (!requireAuth('save_item')) return;
    haptic.selection();
    overlay.open.collection();
  };

  const handlePressRecommendation = (
    recItem: Listing,
    recSectionKey?: string,
    recPosition?: number,
    recReasonCode?: string,
    recPersonalised?: boolean,
  ) => {
    openProductDetail(navigation, {
      referenceKind: 'listing',
      canonicalId: recItem.id,
      sourceSurface: 'ItemDetailRecommendation',
      sectionKey: recSectionKey,
      position: recPosition,
      reasonCode: recReasonCode,
      personalised: recPersonalised,
    });
  };

  // When any sheet/overlay is open, the whole screen content behind it is
  // hidden from screen readers. This must live on a container that wraps ALL
  // behind-the-sheet chrome (header, scroll content, action dock) — not just
  // the ScrollView — so TalkBack cannot reach Buy now / Make offer while a
  // sheet covers them. The sheets themselves stay OUTSIDE this container:
  // BottomSheet renders in-tree, so hiding an ancestor would hide the sheet
  // too (audit M2).
  const anyOverlayVisible = overlay.visibility.collection || actions.shareVisible || fullscreenVisible || overlay.visibility.sizeGuide || overlay.visibility.qa || overlay.visibility.purchaseDetails || overlay.visibility.overflow || overlay.visibility.makeOffer || overlay.visibility.conditionInfo;

  return (
    <GestureDetector gesture={dismissPan}>
    <Reanimated.View
      testID="item-detail-screen"
      entering={reducedMotion ? FadeIn.duration(0) : FadeIn.duration(Motion.transitions.mediaLoad.duration)}
      style={[styles.container, { backgroundColor: colors.background }, dismissContainerStyle]}
    >
      <StatusBar translucent backgroundColor="transparent" barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View
        style={styles.a11yContentWrap}
        accessibilityElementsHidden={anyOverlayVisible}
        importantForAccessibility={anyOverlayVisible ? 'no-hide-descendants' : 'auto'}
      >
      <ItemDetailHeader
        chromeStyle={dismissChromeStyle}
        scrollY={scrollY}
        title={displayTitle}
        onBack={() => navigation.goBack()}
        onShare={actions.handleShare}
      />

      <Reanimated.ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: scrollBottomPadding }}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.brand}
            colors={[colors.brand]}
            progressBackgroundColor={colors.surfaceAlt}
          />
        }
      >
        {/* ── Zone A — Media stage ──
            CommerceMediaStage handles paging/zoom/fullscreen only.
            CommerceDetailMediaRail overlays the max-3-visible-controls
            (Back, Share, Save) + overflow (Fav, Watch, Report). */}
        <CommerceMediaHero
          images={item.images}
          category={item.category ?? undefined}
          objectId={item.id}
          isFav={isFav}
          isSaved={isItemSavedAnywhere(item.id)}
          isSold={!!item.isSold}
          topInset={insets.top}
          scrollY={scrollY}
          onBack={() => navigation.goBack()}
          onShare={actions.handleShare}
          onSave={handleQuickSave}
          onSaveLongPress={handleSaveToCollection}
          onToggleFav={actions.handleToggleFav}
          onDoubleTap={handleDoubleTap}
          onZoomStart={() => { if (item) ProductAnalytics.mediaZoom(item.id); }}
          onOpenFullscreen={media.openViewer}
          heightFraction={isCompactScreen ? 0.56 : 0.6}
          initialIndex={media.activeIndex}
          onActiveIndexChange={(index) => {
            media.setActiveIndex(index);
            paginationIndex.value = reducedMotion
              ? index
              : withSpring(index, spring.tap);
          }}
          bigHeartOpacity={bigHeartOpacity}
          bigHeartScale={bigHeartScale}
          showThumbnailStrip={item.images ? item.images.length > 1 : false}
          familyStateAccent={familyStateAccent}
          onRailSave={handleQuickSave}
          onOverflow={() => overlay.open.overflow()}
        />

        {/* ── Image pagination ──
            Thumbnail strip is rendered inside CommerceMediaStage
            (showThumbnailStrip=true). No external dots/counter needed —
            the thumbnail rail is the premium 2026 pattern. */}

        <CommerceDetailOfflineBanner isOffline={isOffline} />

        {/* ── Stale-data notice ──
            The listing query failed while a previously resolved listing
            is on screen (background refetch error, dropped connection).
            The rendered content is still the last authoritative read —
            say so plainly and offer retry instead of silently presenting
            potentially stale price/availability as current. */}
        {data.isError ? (
          <View style={styles.staleNoticeWrap}>
            <CommerceDetailUnavailableInline
              title="Couldn't refresh listing"
              body={isOffline
                ? "You're offline — showing the last loaded details."
                : 'Showing the last loaded details.'}
              icon="refresh-outline"
              onRetry={() => data.refetch()}
            />
          </View>
        ) : null}

        {/* ── Zone B — Identity seam ──
            Direct keeps critical copy off arbitrary seller photography.
            Media establishes desire first; the stable editorial canvas
            then owns brand, identity and price. The dock is the only
            actionable repetition of that price. Per 2026 PDP research:
            the buyer sees *what* and *how much* before *who*. */}
        <CommerceIdentityBlock
          item={item}
          displayTitle={displayTitle}
          formattedPrice={formattedPrice}
          formattedOriginal={formattedOriginal}
          hasDiscount={hasDiscount}
          discountPercent={discountPercent}
          secondaryLine={secondaryLine}
          interestSignal={interestSignal}
          priceIzeText={priceIzeText}
          attributeLine={attributeLine}
          socialProofLine={socialProofLine}
          conditionMeta={conditionMeta}
          isCompactScreen={isCompactScreen}
          onConditionPress={() => overlay.open.conditionInfo()}
          onSizeGuidePress={() => overlay.open.sizeGuide()}
        />

        {/* ── First-viewport seller trust row (display-only) ──
            Seller identity + verification badge + stats line appears
            after the price/identity chapter. This is the buyer's trust
            signal — who is selling this item. Display-only — no onPress.
            The full SellerInfoCard (with Follow / Message / View shop
            actions and the "More from this seller" rail) lives in Zone
            E below and is the sole profile navigation point. */}
        <CommerceTrustDossier
          seller={seller}
          sellerStatsLine={sellerStatsLine}
          sellerVerified={sellerVerified}
          commerce={commerce}
        />

        {/* ── Zone D — Description (progressive disclosure) ──
            Description + condition + category evidence + posted date.
            Sits after trust facts, before shipping. */}
        <ItemDetailItemDetails
          item={item}
          conditionMeta={conditionMeta}
          descriptionExpanded={descriptionExpanded}
          setDescriptionExpanded={setDescriptionExpanded}
          onOpenViewer={media.openViewer}
        />

        {/* ── Zone E — Seller row (compact, links to profile) ──
            Seller identity sits in the second viewport (after description,
            before shipping). The buyer sees media, identity, trust facts,
            description, then the seller — before shipping and similar
            items. This is the evidence role: source credibility immediately
            after the item evidence.
            The seller section closes with a "More from this seller" rail. */}
        <ItemDetailSellerSection
          item={item}
          seller={seller}
          isOwner={capabilities.isOwner}
          isFollowing={seller?.isFollowing ?? false}
          isFollowPending={sellerFollowMutation.isPending}
          onFollow={() => {
            if (!requireAuth('follow_seller')) return;
            sellerFollowMutation.mutate(undefined, {
              onSuccess: (data) => {
                show(data.isFollowing ? 'Followed seller' : 'Unfollowed seller', 'success');
              },
              onError: () => {
                show('Could not follow seller. Try again.', 'error');
              },
            });
          }}
          onMessage={handleMessageSeller}
          onViewShop={handleViewSeller}
          onPressRailItem={(railItem) => handlePressRecommendation(railItem, 'more_from_seller')}
        />

        {/* ── Zone F — Shipping & returns (collapsed by default) ──
            Full commerce details: costs, delivery, protection, returns,
            authenticity. Progressive disclosure — summary visible, details
            expand on tap. Sits after the seller. */}
        <ItemDetailBuyingSection
          purchaseSummary={purchaseSummary}
          commerce={commerce}
          listingId={item.id}
          onShowPurchaseDetails={() => {
            haptic.light();
            overlay.open.purchaseDetails();
          }}
        />

        {/* ── Price history & market ──
            Consolidated disclosure: one inline insight surfaces the
            most material fact (price drop, sold comparables, etc.);
            the full breakdown expands on tap. */}
        <ItemDetailPriceMarket
          rows={priceInsightRows}
          summary={priceInsightSummary}
          expanded={priceHistoryExpanded}
          onToggleExpanded={() => setPriceHistoryExpanded((prev) => !prev)}
          showPriceAlert={!!(hasDiscount && discountPercent && discountPercent > 0)}
          priceAlertEnabled={priceAlertEnabled}
          priceAlertLoading={priceAlertLoading}
          onTogglePriceAlert={handleTogglePriceAlert}
        />

        <CommerceDetailSection label="Questions" variant="compact" divider>
          <CommerceDetailDisclosureRow
            label={qaSummary?.questionCount ? 'View all questions' : 'Ask a question'}
            summary={qaSummary?.questionCount ? undefined : 'No questions yet'}
            count={qaSummary?.questionCount ?? listingEngagement?.questionCount}
            onPress={() => overlay.open.qa()}
            leadingIcon="help-circle-outline"
            accessibilityLabel="View questions and answers"
          />
        </CommerceDetailSection>

        {/* ── Zone G — Related / recommended (below fold) ──
            Bundle upsell + visual-similar grid. These are discovery
            surfaces that extend the session — they belong below all
            item-critical content. */}
        <BundleUpsellRow
          items={bundleItems}
          currentListingId={item.id}
          shippingPayer={commerce.shippingPayer}
          onPressItem={handlePressRecommendation}
          sellerId={item.seller?.id ?? undefined}
          sellerName={item.seller?.username ?? undefined}
          onOpenBundleBag={(sellerId, sellerName) => navigation.navigate('BundleBag', { sellerId, sellerName })}
        />

        {/* More like this — backend-driven recommendations.
            Uses the similar_style section from GET /listings/:id/recommendations,
            falling back to same_brand. Per 2026 PDP research: show only when
            >=3 items are available; hide silently when fewer. */}
        <ItemDetailSimilarGrid
          sections={recommendationSections}
          itemBrand={item.brand}
          itemCategory={item.category}
          formatFromFiat={formatFromFiat}
          onPressItem={handlePressRecommendation}
        />

        {/* Seen in Looks — community-styled outfits featuring this item.
            Per Design.md: "Seen in Looks" below core decision info.
            Only rendered when the backend supplies real look data. */}
        {seenInLooksItems.length > 0 ? (
          <SeenInLooksRail
            items={seenInLooksItems}
            onPressItem={(look) => navigation.navigate('LookDetail', { lookId: look.id })}
          />
        ) : null}

        <ItemDetailFooterNotices
          showRecsError={recsError && recommendationSections.length === 0}
          hasSyncError={!!lastError}
          isSyncing={isSyncing}
          onSyncRetry={() => void refreshListings()}
        />
      </Reanimated.ScrollView>

      {/* ── Zone I — Sticky action dock ──
          Buyer: price + Buy now + Make offer.
          Seller: Manage listing.
          Sold/unavailable: factual state + one next action. */}
      <CommerceActionDock
        item={item}
        capabilities={capabilities}
        commerce={commerce}
        formattedPrice={formattedPrice}
        formattedOriginal={formattedOriginal}
        hasDiscount={hasDiscount}
        onManageListing={() => navigation.navigate('ManageListing', { itemId: item.id })}
        onBrowseSimilar={() => navigation.navigate('MainTabs', { screen: 'Explore' })}
        onBuyNow={() => {
          if (!requireAuth('purchase')) return;
          if (item) ProductAnalytics.checkoutStart(item.id);
          // Do not fire a success haptic before the purchase has
          // actually completed. "Buy now" navigates to checkout — it
          // does not complete the purchase. A medium impact acknowledges
          // the primary-action press; the success pattern belongs in the
          // Checkout confirmation flow.
          haptic.medium();
          navigation.navigate('Checkout', { itemId: item.id });
        }}
        onMakeOffer={() => {
          if (!requireAuth('purchase')) return;
          if (item) ProductAnalytics.offerStart(item.id);
          overlay.open.makeOffer();
        }}
        onEnquire={handleEnquire}
        onRequestViewing={handleRequestViewing}
      />
      </View>

      {/* ── Sheets & modals ──
          Rendered outside the a11y-hidden content wrap so the sheet
          itself stays reachable while the content behind it is hidden. */}
      <ItemDetailSheets
        item={item}
        displayTitle={displayTitle}
        formattedPrice={formattedPrice}
        hasPrice={hasPrice}
        commerce={commerce}
        formattedProtectionTotal={formattedProtectionTotal}
        conditionMeta={conditionMeta}
        isFav={isFav}
        isSeller={item.seller?.id === currentUser?.id}
        currentUserName={currentUser?.username ?? 'You'}
        formatFromFiat={formatFromFiat}
        media={media}
        visibility={overlay.visibility}
        dismiss={overlay.dismiss}
        shareVisible={shareVisible}
        onShareDismiss={setShareVisible}
        onShare={handleShare}
        onToggleFav={handleToggleFav}
        onReport={() => navigation.navigate('Report', { type: 'item', targetId: item.id })}
        onOfferSent={(payload) => {
          overlay.dismiss.makeOffer();
          show('Offer sent', 'success');
          // Only navigate to Chat if the backend provisioned a real conversation.
          // If conversationId is null, the offer was created but no conversation
          // exists — stay on the detail screen rather than navigating to a dead route.
          if (payload.conversationId) {
            navigation.navigate('Chat', {
              conversationId: payload.conversationId,
              partnerUserId: payload.partnerUserId,
            });
          }
        }}
      />
    </Reanimated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  // Wraps everything behind the sheets (header, scroll content, dock) so a
  // single accessibilityElementsHidden flag covers all of it. flex:1 keeps
  // the geometry identical to the screen root it fills.
  a11yContentWrap: { flex: 1 },
  // ── Stale-data notice ──
  // Horizontal padding matches the section rhythm; the inline
  // component supplies its own vertical spacing.
  staleNoticeWrap: {
    paddingHorizontal: Space.md,
  },
});
