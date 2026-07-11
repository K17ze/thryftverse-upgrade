import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const SRC = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(SRC, '..', '..');

function readFile(rel: string) {
  return fs.readFileSync(path.join(SRC, rel), 'utf-8');
}

function readBackendFile(rel: string) {
  return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf-8');
}

function fileExists(rel: string) {
  return fs.existsSync(path.join(SRC, rel));
}

describe('VQ-11A: Public Profile Flagship Elevation', () => {
  // ── Screen architecture ──────────────────────────────────────────
  describe('Screen architecture', () => {
    it('UserProfileScreen uses ProfileHero which renders FlagshipProfileMedia', () => {
      const screen = readFile('screens/UserProfileScreen.tsx');
      const hero = readFile('components/profile/ProfileHero.tsx');
      expect(screen).toContain('ProfileHero');
      expect(hero).toContain('FlagshipProfileMedia');
    });

    it('UserProfileScreen uses FlashList for virtualization', () => {
      const src = readFile('screens/UserProfileScreen.tsx');
      expect(src).toContain('FlashList');
    });

    it('UserProfileScreen uses Reanimated for scroll-driven header', () => {
      const src = readFile('screens/UserProfileScreen.tsx');
      expect(src).toContain('useAnimatedScrollHandler');
      expect(src).toContain('useAnimatedStyle');
      expect(src).toContain('scrollY');
    });

    it('UserProfileScreen has collapsed header that fades in on scroll', () => {
      const src = readFile('screens/UserProfileScreen.tsx');
      expect(src).toContain('collapsedHeader');
      expect(src).toContain('interpolate');
    });

    it('UserProfileScreen has three tabs: Shop, Looks, Reviews', () => {
      const src = readFile('screens/UserProfileScreen.tsx');
      expect(src).toMatch(/type Tab = 'Shop' \| 'Looks' \| 'Reviews'/);
      expect(src).toContain('TabRail');
    });

    it('UserProfileScreen has Shop sub-segment for For Sale / Sold', () => {
      const src = readFile('screens/UserProfileScreen.tsx');
      expect(src).toMatch(/type ShopSegment = 'forsale' \| 'sold'/);
      expect(src).toContain('SegmentedControl');
    });
  });

  // ── Data binding: real backend data, no fabrication ──────────────
  describe('Data binding', () => {
    it('UserProfileScreen uses usePublicProfileQuery for profile data', () => {
      const src = readFile('screens/UserProfileScreen.tsx');
      expect(src).toContain('usePublicProfileQuery');
    });

    it('UserProfileScreen consumes aggregate stats from backend', () => {
      const src = readFile('screens/UserProfileScreen.tsx');
      expect(src).toContain('profileAggregate');
      expect(src).toContain('stats');
      expect(src).toContain('activeListingCount');
      expect(src).toContain('soldListingCount');
      expect(src).toContain('followerCount');
      expect(src).toContain('followingCount');
      expect(src).toContain('reviewCount');
      expect(src).toContain('ratingAverage');
    });

    it('UserProfileScreen consumes viewer block for relationship state', () => {
      const src = readFile('screens/UserProfileScreen.tsx');
      expect(src).toContain('viewer');
      expect(src).toContain('isFollowing');
      expect(src).toContain('isBlocked');
      expect(src).toContain('canMessage');
    });

    it('UserProfileScreen uses useUserListingsInfinite for Shop tab', () => {
      const src = readFile('screens/UserProfileScreen.tsx');
      expect(src).toContain('useUserListingsInfinite');
      expect(src).toContain('activeListingsQuery');
      expect(src).toContain('soldListingsQuery');
    });

    it('UserProfileScreen uses useUserLooksInfinite for Looks tab', () => {
      const src = readFile('screens/UserProfileScreen.tsx');
      expect(src).toContain('useUserLooksInfinite');
      expect(src).toContain('looksQuery');
    });

    it('UserProfileScreen uses useSellerReviewsInfinite for Reviews tab', () => {
      const src = readFile('screens/UserProfileScreen.tsx');
      expect(src).toContain('useSellerReviewsInfinite');
      expect(src).toContain('reviewsQuery');
    });

    it('UserProfileScreen does not hardcode follower/review counts', () => {
      const src = readFile('screens/UserProfileScreen.tsx');
      expect(src).not.toMatch(/\b\d{2,}\s*followers\b/i);
      expect(src).not.toMatch(/\b\d{2,}\s*following\b/i);
      expect(src).not.toMatch(/\b\d{2,}\s*reviews\b/i);
      expect(src).not.toContain('MOCK_FOLLOWERS');
      expect(src).not.toContain('MOCK_REVIEWS');
    });
  });

  // ── Social actions: follow, message, block, report ──────────────
  describe('Social actions', () => {
    it('UserProfileScreen uses useFollowMutation for follow toggle', () => {
      const src = readFile('screens/UserProfileScreen.tsx');
      expect(src).toContain('useFollowMutation');
      expect(src).toContain('handleFollowToggle');
    });

    it('UserProfileScreen uses useBlockMutation for block/unblock', () => {
      const src = readFile('screens/UserProfileScreen.tsx');
      expect(src).toContain('useBlockMutation');
      expect(src).toContain('confirmBlock');
      expect(src).toContain('handleUnblock');
    });

    it('UserProfileScreen uses useReportUserMutation for reporting', () => {
      const src = readFile('screens/UserProfileScreen.tsx');
      const sheets = readFile('components/profile/ProfileSheets.tsx');
      expect(src).toContain('useReportUserMutation');
      expect(src).toContain('ProfileReportSheet');
      expect(sheets).toContain('REPORT_REASONS');
    });

    it('UserProfileScreen has NativeSheet for more actions', () => {
      const src = readFile('screens/UserProfileScreen.tsx');
      const sheets = readFile('components/profile/ProfileSheets.tsx');
      expect(src).toContain('ProfileMoreSheet');
      expect(src).toContain('moreSheetVisible');
      expect(src).toContain('reportSheetVisible');
      expect(src).toContain('blockConfirmVisible');
      expect(sheets).toContain('NativeSheet');
    });

    it('UserProfileScreen has block confirmation dialog', () => {
      const src = readFile('screens/UserProfileScreen.tsx');
      const sheets = readFile('components/profile/ProfileSheets.tsx');
      expect(src).toContain('ProfileBlockConfirmSheet');
      expect(sheets).toContain('Block');
      expect(sheets).toContain('confirmBlockBtn');
      expect(sheets).toContain('cancelBtn');
    });

    it('UserProfileScreen has share and copy link actions', () => {
      const src = readFile('screens/UserProfileScreen.tsx');
      expect(src).toContain('Share.share');
      expect(src).toContain('handleShare');
      expect(src).toContain('handleCopyLink');
      expect(src).toContain('profileDeepLink');
    });
  });

  // ── States: loading, error, empty, blocked ───────────────────────
  describe('State completeness', () => {
    it('UserProfileScreen has loading skeleton state', () => {
      const screen = readFile('screens/UserProfileScreen.tsx');
      const skeleton = readFile('components/profile/ProfileSkeleton.tsx');
      expect(screen).toContain('ProfileSkeleton');
      expect(skeleton).toContain('coverSkeleton');
      expect(skeleton).toContain('skeletonAvatar');
    });

    it('UserProfileScreen has error state with retry', () => {
      const src = readFile('screens/UserProfileScreen.tsx');
      expect(src).toContain('profileError');
      expect(src).toContain('Unable to load profile');
      expect(src).toContain('refetch');
    });

    it('UserProfileScreen has blocked-by-target state', () => {
      const src = readFile('screens/UserProfileScreen.tsx');
      expect(src).toContain('isBlockedByTarget');
      expect(src).toContain("You've been blocked");
    });

    it('UserProfileScreen has unavailable profile state', () => {
      const src = readFile('screens/UserProfileScreen.tsx');
      expect(src).toContain('Profile unavailable');
    });

    it('UserProfileScreen has empty states for each tab', () => {
      const src = readFile('screens/UserProfileScreen.tsx');
      expect(src).toContain('No active listings');
      expect(src).toContain('No sold items yet');
      expect(src).toContain('No published Looks');
      expect(src).toContain('No reviews yet');
    });

    it('UserProfileScreen has refresh control', () => {
      const src = readFile('screens/UserProfileScreen.tsx');
      expect(src).toContain('RefreshControl');
      expect(src).toContain('handleRefresh');
    });

    it('UserProfileScreen has load-more pagination', () => {
      const src = readFile('screens/UserProfileScreen.tsx');
      expect(src).toContain('hasNextPage');
      expect(src).toContain('fetchNextPage');
      expect(src).toContain('handleLoadMore');
    });
  });

  // ── Accessibility ────────────────────────────────────────────────
  describe('Accessibility', () => {
    it('UserProfileScreen has accessibility labels on key controls', () => {
      const src = readFile('screens/UserProfileScreen.tsx');
      expect(src).toContain('accessibilityLabel');
      expect(src).toContain('accessibilityRole');
      expect(src).toContain('Go back');
      expect(src).toContain('Share profile');
      expect(src).toContain('More options');
    });

    it('UserProfileScreen has accessibility labels on follow/message', () => {
      const hero = readFile('components/profile/ProfileHero.tsx');
      expect(hero).toMatch(/accessibilityLabel.*Follow/);
      expect(hero).toMatch(/accessibilityLabel.*message/i);
    });

    it('UserProfileScreen has accessibility labels on tabs', () => {
      const tabRail = readFile('components/profile/ProfileTabRail.tsx');
      expect(tabRail).toContain('accessibilityRole="tab"');
      expect(tabRail).toContain('accessibilityState');
    });
  });

  // ── Grid: 4:5 portrait tiles ─────────────────────────────────────
  describe('Grid composition', () => {
    it('ShopTile uses 4:5 portrait aspect ratio via responsive geometry', () => {
      const src = readFile('screens/UserProfileScreen.tsx');
      // Brief §2: no module-level screen-width calculation; useWindowDimensions
      // for responsive geometry. 4:5 portrait is enforced via CARD_ASPECT.
      expect(src).toContain('useWindowDimensions');
      expect(src).toContain('CARD_ASPECT');
      expect(src).toMatch(/cardWidth \* CARD_ASPECT/);
      // Module-level Dimensions.get must be gone
      expect(src).not.toMatch(/Dimensions\.get/);
    });

    it('ShopTile shows sold marker for sold items', () => {
      const shopTile = readFile('components/profile/ProfileShopTile.tsx');
      expect(shopTile).toContain('soldFade');
      expect(shopTile).toContain('Sold');
    });

    it('LookTile shows video badge and tag count', () => {
      const lookTile = readFile('components/profile/ProfileLookTile.tsx');
      expect(lookTile).toContain('videoGlyph');
      expect(lookTile).toContain('tagGlyph');
    });

    it('ReviewRow shows reviewer identity, rating, and listing context', () => {
      const reviews = readFile('components/profile/ProfileReviews.tsx');
      expect(reviews).toContain('reviewName');
      // Flagship review row uses inline 5-star display + verified buyer badge
      expect(reviews).toContain('verifiedBadge');
      expect(reviews).toContain('reviewMetaRow');
      expect(reviews).toContain('reviewListingContext');
    });
  });

  // ── Frontend services ────────────────────────────────────────────
  describe('Frontend services', () => {
    it('profileApi exports PublicProfileAggregate with stats and viewer', () => {
      const src = readFile('services/profileApi.ts');
      expect(src).toContain('PublicProfileAggregate');
      expect(src).toContain('PublicProfileStats');
      expect(src).toContain('PublicProfileViewer');
      expect(src).toContain('fetchPublicProfileAggregate');
    });

    it('profileApi exports follow/unfollow functions', () => {
      const src = readFile('services/profileApi.ts');
      expect(src).toContain('followUser');
      expect(src).toContain('unfollowUser');
    });

    it('profileApi exports block/unblock and report functions', () => {
      const src = readFile('services/profileApi.ts');
      expect(src).toContain('blockUser');
      expect(src).toContain('unblockUser');
      expect(src).toContain('reportUser');
      expect(src).toContain('ReportReason');
    });

    it('listingsApi supports cursor pagination', () => {
      const src = readFile('services/listingsApi.ts');
      expect(src).toContain('nextCursor');
      expect(src).toContain('cursor');
    });

    it('looksApi supports cursor pagination', () => {
      const src = readFile('services/looksApi.ts');
      expect(src).toContain('nextCursor');
      expect(src).toContain('cursor');
    });

    it('sellerReviewsApi exports SellerReviewItem and SellerReviewSummary', () => {
      const src = readFile('services/sellerReviewsApi.ts');
      expect(src).toContain('SellerReviewItem');
      expect(src).toContain('SellerReviewSummary');
      expect(src).toContain('distribution');
      expect(src).toContain('reviewer');
      expect(src).toContain('listing');
    });
  });

  // ── Frontend hooks ───────────────────────────────────────────────
  describe('Frontend hooks', () => {
    it('usePublicProfileQuery returns aggregate with stats and viewer', () => {
      const src = readFile('platform/server/usePublicProfileQuery.ts');
      expect(src).toContain('aggregate');
      expect(src).toContain('PublicProfileAggregate');
    });

    it('useProfileSocialQueries exports all infinite query hooks', () => {
      const src = readFile('platform/server/useProfileSocialQueries.ts');
      expect(src).toContain('useUserListingsInfinite');
      expect(src).toContain('useUserLooksInfinite');
      expect(src).toContain('useSellerReviewsInfinite');
      expect(src).toContain('useFollowMutation');
      expect(src).toContain('useBlockMutation');
      expect(src).toContain('useReportUserMutation');
    });

    it('useFollowMutation has optimistic update for follower count', () => {
      const src = readFile('platform/server/useProfileSocialQueries.ts');
      expect(src).toContain('onMutate');
      expect(src).toContain('followerCount');
      expect(src).toContain('isFollowing');
    });

    it('queryKeys has profile and social keys', () => {
      const src = readFile('platform/server/queryKeys.ts');
      expect(src).toContain('profile');
    });
  });

  // ── Backend migration ────────────────────────────────────────────
  describe('Backend migration', () => {
    it('migration 048 creates user_follows table', () => {
      const src = readBackendFile('backend/api/src/db/migrations/048_user_social_graph.sql');
      expect(src).toContain('user_follows');
      expect(src).toContain('follower_id');
      expect(src).toContain('followed_id');
    });

    it('migration 048 creates user_blocks table', () => {
      const src = readBackendFile('backend/api/src/db/migrations/048_user_social_graph.sql');
      expect(src).toContain('user_blocks');
      expect(src).toContain('blocker_id');
      expect(src).toContain('blocked_id');
    });

    it('migration 048 creates user_reports table', () => {
      const src = readBackendFile('backend/api/src/db/migrations/048_user_social_graph.sql');
      expect(src).toContain('user_reports');
      expect(src).toContain('reporter_id');
      expect(src).toContain('reported_id');
      expect(src).toContain('reason');
    });
  });

  // ── Backend routes ───────────────────────────────────────────────
  describe('Backend routes', () => {
    it('backend has public profile aggregate endpoint', () => {
      const src = readBackendFile('backend/api/src/index.ts');
      expect(src).toContain('/users/:userId/profile');
      expect(src).toContain('followerCount');
      expect(src).toContain('isFollowing');
      expect(src).toContain('isBlocked');
    });

    it('backend has seller reviews endpoint', () => {
      const src = readBackendFile('backend/api/src/index.ts');
      expect(src).toContain('/sellers/:sellerId/reviews');
    });

    it('backend has follow/unfollow endpoint', () => {
      const src = readBackendFile('backend/api/src/index.ts');
      expect(src).toMatch(/\/sellers\/:sellerId\/follow/);
    });

    it('backend has block/unblock endpoint', () => {
      const src = readBackendFile('backend/api/src/index.ts');
      expect(src).toContain('/users/:userId/block');
    });

    it('backend has report user endpoint', () => {
      const src = readBackendFile('backend/api/src/index.ts');
      expect(src).toContain('/users/:userId/report');
    });

    it('backend has cursor pagination on user listings', () => {
      const src = readBackendFile('backend/api/src/index.ts');
      expect(src).toContain('nextCursor');
      expect(src).toContain('cursor');
    });
  });

  // ── Truthful UI: no fake data ────────────────────────────────────
  describe('Truthful UI', () => {
    it('UserProfileScreen does not use Coming soon or Backend required labels', () => {
      const src = readFile('screens/UserProfileScreen.tsx');
      expect(src).not.toMatch(/Coming soon/i);
      expect(src).not.toMatch(/Backend required/i);
    });

    it('UserProfileScreen does not fabricate review data', () => {
      const src = readFile('screens/UserProfileScreen.tsx');
      expect(src).not.toContain('MOCK_REVIEW');
      expect(src).not.toContain('fakeReview');
    });

    it('UserProfileScreen message button respects canMessage from backend', () => {
      const src = readFile('screens/UserProfileScreen.tsx');
      expect(src).toContain('!viewer.canMessage');
      expect(src).toContain('styles.btnDisabled');
    });
  });
});
