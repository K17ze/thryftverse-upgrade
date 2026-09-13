import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { SharedValue } from 'react-native-reanimated';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, FontFamily } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { RadiusRoleValue } from '../../theme/surfaceRadiusRules';
import type {
  PublicProfileUser,
  PublicProfileStats,
  PublicProfileViewer,
  PublicProfileAway,
  PublicProfileTrader,
  PublicProfileStorefrontSummary,
} from '../../services/profileApi';
import type { SellerTrustSummary } from '../../platform/product';
import type { SellerReviewSummary } from '../../services/sellerReviewsApi';
import type { PosterHighlight } from '../../services/postersApi';
import { ProfileHero } from '../profile/ProfileHero';
import { TabRail, SegmentedControl, type TabKey } from '../profile/ProfileTabRail';
import { ReviewSummaryBlock } from '../profile/ProfileReviews';
import { PosterHighlightsRail } from '../poster/PosterHighlightsRail';
import { ShopRail, type ShopRailItem } from '../profile/ShopRail';
import type { UserProfileTab, UserProfileShopSegment } from '../../hooks/userprofile';

interface UserProfileHeaderProps {
  targetProfile: PublicProfileUser | null;
  displayUsername: string;
  displayAvatar?: string;
  displayCover: string;
  viewer: PublicProfileViewer | null;
  stats: PublicProfileStats | null;
  activeCount: number;
  soldCount: number;
  reviewCount: number;
  memberSince?: string;
  sellerTrust?: SellerTrustSummary | null;
  traderDisclosure: PublicProfileTrader | null;
  awayState: PublicProfileAway | null;
  storefrontSummary: PublicProfileStorefrontSummary | null;
  highlights: PosterHighlight[];
  shopRailItems: ShopRailItem[];
  followPending: boolean;
  isBlocked: boolean;
  scrollY: SharedValue<number>;
  reducedMotion: boolean;
  activeTab: UserProfileTab;
  shopSegment: UserProfileShopSegment;
  tabs: { key: TabKey; label: string; count?: number }[];
  reviewSummary: SellerReviewSummary | null;
  onFollowToggle: () => void;
  onMessage: () => void;
  onMore: () => void;
  onOpenConnections: (segment: 'followers' | 'following') => void;
  onTabChange: (tab: UserProfileTab) => void;
  onSegmentChange: (segment: UserProfileShopSegment) => void;
  onTabRailLayout: (y: number) => void;
  onOpenHighlight: (highlightId: string) => void;
  onPressShopItem: (id: string) => void;
}

/**
 * The list header for the public profile: identity hero, away-mode banner,
 * storefront announcement, DSA trader disclosure, story highlights rail,
 * curated shop window, and the tab rail (whose layout Y seeds the sticky
 * rail threshold) with its For sale / Sold segment.
 */
export function UserProfileHeader({
  targetProfile,
  displayUsername,
  displayAvatar,
  displayCover,
  viewer,
  stats,
  activeCount,
  soldCount,
  reviewCount,
  memberSince,
  sellerTrust,
  traderDisclosure,
  awayState,
  storefrontSummary,
  highlights,
  shopRailItems,
  followPending,
  isBlocked,
  scrollY,
  reducedMotion,
  activeTab,
  shopSegment,
  tabs,
  reviewSummary,
  onFollowToggle,
  onMessage,
  onMore,
  onOpenConnections,
  onTabChange,
  onSegmentChange,
  onTabRailLayout,
  onOpenHighlight,
  onPressShopItem,
}: UserProfileHeaderProps) {
  const { colors } = useAppTheme();
  const MUTED = colors.textMuted;
  const TEXT = colors.textPrimary;

  return (
    <View>
      <ProfileHero
        targetProfile={targetProfile}
        displayUsername={displayUsername}
        displayAvatar={displayAvatar}
        displayCover={displayCover}
        isSelfProfile={false}
        viewer={viewer}
        stats={stats}
        activeCount={activeCount}
        soldCount={soldCount}
        reviewCount={reviewCount}
        memberSince={memberSince}
        sellerTrust={sellerTrust}
        traderClassification={traderDisclosure}
        followPending={followPending}
        isBlocked={isBlocked}
        scrollY={scrollY}
        reducedMotion={reducedMotion}
        onFollowToggle={onFollowToggle}
        onMessage={onMessage}
        onMore={onMore}
        onOpenConnections={onOpenConnections}
        onTabSelect={(t) => onTabChange(t)}
        onShopSegmentSelect={(s) => onSegmentChange(s)}
      />

      {/* Away-mode banner - shown when the profile aggregate reports holiday mode.
          The aggregate is the authoritative source for away state (privacy-aware,
          viewer-dependent). sellerTrust is a secondary signal for detailed trust. */}
      {awayState?.holidayMode === true ? (
        <View style={[styles.awayBanner, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
          <Ionicons name="pause-circle" size={18} color={MUTED} />
          <View style={styles.awayBannerTextWrap}>
            <Text style={[styles.awayBannerTitle, { color: TEXT }]}>
              This shop is on holiday
            </Text>
            <Text style={[styles.awayBannerSub, { color: MUTED }]}>
              {awayState.awayMessage?.trim()
                ? awayState.awayMessage.trim()
                : 'The seller is away right now. Listings are paused and will return when they are back.'}
            </Text>
          </View>
        </View>
      ) : null}

      {/* Storefront announcement — the seller's shop greeting.
          Only rendered when a published storefront with an announcement exists.
          No decorative container — just text with spacing, per anti-AI design. */}
      {storefrontSummary?.announcement?.trim() ? (
        <View style={styles.announcementWrap}>
          <Text style={[styles.announcementText, { color: TEXT }]}>
            {storefrontSummary.announcement.trim()}
          </Text>
        </View>
      ) : null}

      {/* DSA Article 30 trader disclosure — legally required in EU/UK.
          Subtle, factual, no decorative chrome. Buyers must know whether
          they are transacting with a business or a private individual.
          Legal details (name, address, registration) are only shown for
          verified traders — non-traders see only the classification. */}
      {traderDisclosure ? (
        <View style={styles.traderDisclosureWrap}>
          <Text style={[styles.traderClassification, { color: TEXT }]}>
            {traderDisclosure.classification === 'trader'
              ? 'Business seller'
              : 'Private seller'}
          </Text>
          {traderDisclosure.classification === 'trader' && traderDisclosure.legalName ? (
            <Text style={[styles.traderDetail, { color: MUTED }]}>
              {traderDisclosure.legalName}
            </Text>
          ) : null}
          {traderDisclosure.classification === 'trader' && traderDisclosure.address ? (
            <Text style={[styles.traderDetail, { color: MUTED }]}>
              {traderDisclosure.address}
            </Text>
          ) : null}
          {traderDisclosure.classification === 'trader' && traderDisclosure.registrationNumber ? (
            <Text style={[styles.traderDetail, { color: MUTED }]}>
              Reg: {traderDisclosure.registrationNumber}
            </Text>
          ) : null}
          {traderDisclosure.classification === 'trader' && traderDisclosure.vatNumber ? (
            <Text style={[styles.traderDetail, { color: MUTED }]}>
              VAT: {traderDisclosure.vatNumber}
            </Text>
          ) : null}
          {traderDisclosure.classification === 'trader' && traderDisclosure.contactEmail ? (
            <Text style={[styles.traderDetail, { color: MUTED }]}>
              {traderDisclosure.contactEmail}
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* Story highlights rail — renders only when highlights exist.
          No "New" tile for public profiles (viewer is not the owner). */}
      {highlights.length > 0 ? (
        <PosterHighlightsRail
          highlights={highlights}
          isOwner={false}
          onOpenHighlight={onOpenHighlight}
          onHighlightLongPress={onOpenHighlight}
        />
      ) : null}

      {/* Curated shop window — horizontal rail of featured listings.
          Renders only when the storefront aggregate provides featured IDs
          and matching listings are loaded (ShopRail returns null when empty). */}
      <ShopRail
        items={shopRailItems}
        onPressItem={onPressShopItem}
      />

      {/* Tab rail - measures Y for sticky threshold */}
      <View onLayout={(e) => onTabRailLayout(e.nativeEvent.layout.y)}>
        <TabRail
          tabs={tabs}
          activeKey={activeTab as any}
          onChange={(k) => onTabChange(k)}
          reducedMotion={reducedMotion}
        />
      </View>

      {activeTab === 'Listings' ? (
        <View style={styles.segmentWrap}>
          <SegmentedControl
            segments={[{ key: 'forsale', label: 'For sale' }, { key: 'sold', label: 'Sold' }]}
            activeKey={shopSegment}
            onChange={(k) => onSegmentChange(k)}
            reducedMotion={reducedMotion}
          />
        </View>
      ) : null}

      {activeTab === 'Reviews' && reviewSummary && reviewCount > 0 ? (
        <ReviewSummaryBlock summary={reviewSummary} />
      ) : null}


    </View>
  );
}

const styles = StyleSheet.create({
  segmentWrap: { paddingHorizontal: Space.md, paddingVertical: Space.sm, flexDirection: 'row' },
  awayBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.sm + 2,
    marginHorizontal: Space.md,
    marginTop: Space.sm,
    marginBottom: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.md - 2,
    borderRadius: RadiusRoleValue.sheetDialog,
    borderWidth: StyleSheet.hairlineWidth,
  },
  awayBannerTextWrap: {
    flex: 1,
    gap: Space.xs / 2,
  },
  awayBannerTitle: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: FontFamily.semibold,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
  },
  awayBannerSub: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.regular,
    lineHeight: TypographyV2.meta.lineHeight + 1,
  },
  // Storefront announcement — seller's shop greeting. No decorative
  // container, just text with horizontal padding matching the screen.
  announcementWrap: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.xs,
  },
  announcementText: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.regular,
    lineHeight: TypographyV2.body.lineHeight,
  },
  // DSA Article 30 trader disclosure — factual, no decorative chrome.
  // Hairline top separator distinguishes it from the announcement above.
  traderDisclosureWrap: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: Space.xs,
    gap: Space.xs / 2,
  },
  traderClassification: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.semibold,
    lineHeight: TypographyV2.meta.lineHeight,
  },
  traderDetail: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.regular,
    lineHeight: TypographyV2.meta.lineHeight,
  },
});
