import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator } from 'react-native';
import Reanimated, { FadeIn } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { EmptyState } from '../EmptyState';
import { SkeletonLoader } from '../SkeletonLoader';
import { MyProfileTabRail } from '../profile/MyProfileTabRail';
import { ProfileLooksGrid } from '../profile/ProfileLooksGrid';
import { ReviewSummaryBlock, ProfileReviewRow } from '../profile/ProfileReviews';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space } from '../../theme/designTokens';
import { RadiusRoleValue } from '../../theme/surfaceRadiusRules';
import { useAppTranslation } from '../../i18n/useAppTranslation';
import type { RootStackParamList } from '../../navigation/types';
import type { Listing } from '../../domain';
import type { LookApiItem } from '../../services/looksApi';
import type { SellerReviewItem, SellerReviewSummary } from '../../services/sellerReviewsApi';
import type { SellerTrustSummary } from '../../platform/product';
import { ClosetGrid, type ClosetGridProps } from './ClosetGrid';
import { StorefrontAboutTab, type CoOwnHoldingPreview } from './StorefrontAboutTab';

type TabKey = 'listings' | 'looks' | 'about' | 'reviews';
type NavT = NativeStackNavigationProp<RootStackParamList>;

interface TabItem {
  key: string;
  label: string;
  count?: number;
}

export interface StorefrontTabsProps {
  // Tab rail
  tabs: TabItem[];
  activeKey: TabKey;
  onTabChange: (key: TabKey) => void;
  onTabContentLayout: (y: number) => void;

  // Shared
  reducedMotion: boolean;

  // Listings tab (ClosetGrid)
  listings: Listing[];
  reorderMode: boolean;
  isSaving: boolean;
  onToggleReorder: () => void;
  onViewAll: () => void;
  onStartSelling: () => void;
  onImport: () => void;
  renderItem: (info: { item: Listing; index: number }) => React.ReactElement;

  // Looks tab
  looks: LookApiItem[];
  looksLoading: boolean;
  looksError: boolean;
  onRetryLooks: () => void;
  onCreateLook: () => void;
  looksNavigation: NavT;

  // About tab
  coOwnHoldings: CoOwnHoldingPreview[];
  website: string | null;
  sellerTrust: SellerTrustSummary | null | undefined;
  onViewPortfolio: () => void;

  // Reviews tab
  reviewSummary: SellerReviewSummary | null;
  reviewCount: number;
  reviewsLoading: boolean;
  reviewsError: unknown;
  reviews: SellerReviewItem[];
  onRefetchReviews: () => void;
  onOpenReviewer: (uid: string) => void;
  onOpenListing: (lid: string) => void;
}

/**
 * Tab shell and tab bodies for the profile storefront. Composes ClosetGrid
 * for the listings tab, StorefrontAboutTab for the about tab, and inline
 * looks/reviews tabs. Extracted from MyProfileScreen.
 */
export function StorefrontTabs(props: StorefrontTabsProps) {
  const {
    tabs,
    activeKey,
    onTabChange,
    onTabContentLayout,
    reducedMotion,
    // Listings
    listings,
    reorderMode,
    isSaving,
    onToggleReorder,
    onViewAll,
    onStartSelling,
    onImport,
    renderItem,
    // Looks
    looks,
    looksLoading,
    looksError,
    onRetryLooks,
    onCreateLook,
    looksNavigation,
    // About
    coOwnHoldings,
    website,
    sellerTrust,
    onViewPortfolio,
    // Reviews
    reviewSummary,
    reviewCount,
    reviewsLoading,
    reviewsError,
    reviews,
    onRefetchReviews,
    onOpenReviewer,
    onOpenListing } = props;

  const { colors } = useAppTheme();
  const { t: tt } = useAppTranslation('myProfile');

  return (
    <>
      {/* ── 9. STICKY FLAT TAB RAIL ── */}
      <MyProfileTabRail
        tabs={tabs}
        activeKey={activeKey}
        onChange={(key) => onTabChange(key as TabKey)}
      />

      {/* ── 10. ACTIVE TAB CONTENT ── */}
      <View
        onLayout={(e) => { onTabContentLayout(e.nativeEvent.layout.y); }}
      >
        {/* LISTINGS TAB — two-column portfolio grid */}
        {activeKey === 'listings' && (
          <ClosetGrid
            listings={listings}
            reorderMode={reorderMode}
            isSaving={isSaving}
            reducedMotion={reducedMotion}
            onToggleReorder={onToggleReorder}
            onViewAll={onViewAll}
            onStartSelling={onStartSelling}
            onImport={onImport}
            renderItem={renderItem}
          />
        )}

        {/* LOOKS TAB — 2-column grid (standard profile pattern) */}
        {activeKey === 'looks' && (
          <Reanimated.View
            key="looks"
            entering={reducedMotion ? undefined : FadeIn.duration(200)}
            style={{ backgroundColor: colors.background, paddingBottom: 100, paddingTop: Space.md }}
          >
            {looksLoading ? (
              <View style={{ paddingHorizontal: Space.md, gap: Space.md }} accessibilityLabel={tt('accessibility.loadingLooks')}>
                <SkeletonLoader width="100%" height={360} borderRadius={RadiusRoleValue.standalonePanel} />
                <SkeletonLoader width="100%" height={280} borderRadius={RadiusRoleValue.standalonePanel} />
              </View>
            ) : looksError ? (
              <EmptyState
                density="compact"
                icon="cloud-offline-outline"
                title={tt('looks.errorTitle')}
                subtitle={tt('looks.errorSubtitle')}
                ctaLabel={tt('looks.tryAgain')}
                onCtaPress={onRetryLooks}
              />
            ) : looks.length === 0 ? (
              <EmptyState
                density="compact"
                icon="images-outline"
                title={tt('looks.emptyTitle')}
                subtitle={tt('looks.emptySubtitle')}
                ctaLabel={tt('looks.createLook')}
                onCtaPress={onCreateLook}
              />
            ) : (
              <ProfileLooksGrid
                looks={looks}
                isLoading={false}
                error={null}
                isSelfProfile
                onRetry={onRetryLooks}
                onCreateLook={onCreateLook}
                navigation={looksNavigation}
              />
            )}
          </Reanimated.View>
        )}

        {/* ABOUT TAB — flat editorial layout */}
        {/* Bio, location, and member-since are shown in the IdentityHero above.
            The About tab shows only information NOT already visible: website,
            shop policies, and Co-Own portfolio (recessed from the hero). */}
        {activeKey === 'about' && (
          <StorefrontAboutTab
            coOwnHoldings={coOwnHoldings}
            website={website}
            sellerTrust={sellerTrust}
            reducedMotion={reducedMotion}
            onViewPortfolio={onViewPortfolio}
          />
        )}

        {/* REVIEWS TAB — reputation summary + review rows.
            Only rendered when the seller has reviews (the tab itself is
            conditional on myReviewCount > 0). Owner can respond to reviews. */}
        {activeKey === 'reviews' && (
          <Reanimated.View
            key="reviews"
            entering={reducedMotion ? undefined : FadeIn.duration(200)}
            style={{ backgroundColor: colors.background, paddingBottom: 100, paddingTop: Space.md }}
          >
            {reviewSummary && reviewCount > 0 ? (
              <ReviewSummaryBlock summary={reviewSummary} />
            ) : null}
            {reviewsLoading && reviews.length === 0 ? (
              <View style={{ paddingVertical: Space.xl, alignItems: 'center' }}>
                <ActivityIndicator size="small" color={colors.brand} />
              </View>
            ) : reviewsError && reviews.length === 0 ? (
              <EmptyState
                density="compact"
                icon="cloud-offline-outline"
                title="Couldn't load reviews"
                subtitle="Check your connection and try again."
                ctaLabel="Try again"
                onCtaPress={onRefetchReviews}
              />
            ) : reviews.length === 0 ? (
              <EmptyState
                density="compact"
                icon="chatbubble-ellipses-outline"
                title="No reviews yet"
                subtitle="Reviews from completed orders will appear here."
              />
            ) : (
              <View style={{ paddingHorizontal: Space.md }}>
                {reviews.map((review) => (
                  <ProfileReviewRow
                    key={review.id}
                    item={review}
                    onOpenReviewer={onOpenReviewer}
                    onOpenListing={onOpenListing}
                  />
                ))}
              </View>
            )}
          </Reanimated.View>
        )}
      </View>
    </>
  );
}
