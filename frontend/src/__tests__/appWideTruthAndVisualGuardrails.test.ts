import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

function readSrc(filePath: string): string {
  return readFileSync(resolve(__dirname, '..', filePath), 'utf-8');
}

function readSrcOptional(filePath: string): string | null {
  try {
    return readFileSync(resolve(__dirname, '..', filePath), 'utf-8');
  } catch {
    return null;
  }
}

describe('app-wide truth and visual guardrails', () => {
  const productionScreens = [
    'screens/AuthLandingScreen.tsx',
    'screens/LoginScreen.tsx',
    'screens/SignUpScreen.tsx',
    'screens/ForgotPasswordScreen.tsx',
    'screens/MyProfileScreen.tsx',
    'screens/UserProfileScreen.tsx',
    'screens/EditProfileScreen.tsx',
    'screens/PersonalisationScreen.tsx',
    'screens/InviteFriendsScreen.tsx',
    'screens/SettingsScreen.tsx',
    'screens/AccountSettingsScreen.tsx',
    'screens/PrivacySettingsScreen.tsx',
    'screens/ActiveSessionsScreen.tsx',
    'screens/BlockedUsersScreen.tsx',
    'screens/PushNotificationsScreen.tsx',
    'screens/ChatSettingsScreen.tsx',
    'screens/ChangePasswordScreen.tsx',
    'screens/TwoFactorSetupScreen.tsx',
    'screens/HelpSupportScreen.tsx',
    'screens/AboutScreen.tsx',
    'screens/HomeScreen.tsx',
    'screens/BrowseScreen.tsx',
    'screens/SearchScreen.tsx',
    'screens/ClosetScreen.tsx',
    'screens/MyOrdersScreen.tsx',
    'screens/OrderDetailScreen.tsx',
    'screens/CheckoutScreen.tsx',
    'screens/SuccessScreen.tsx',
    'screens/PaymentsScreen.tsx',
    'screens/BalanceScreen.tsx',
    'screens/WithdrawScreen.tsx',
    'screens/BalanceHistoryScreen.tsx',
    'screens/TradeHubScreen.tsx',
    'screens/SyndicateHubScreen.tsx',
    'screens/PortfolioScreen.tsx',
    'screens/AssetDetailScreen.tsx',
    'screens/TradeScreen.tsx',
    'screens/BuyoutScreen.tsx',
    'screens/CoOwnIssueScreen.tsx',
    'screens/MarketLedgerScreen.tsx',
    'screens/AssetLeaderboardScreen.tsx',
    'screens/MyBidsScreen.tsx',
    'screens/CreateSyndicateScreen.tsx',
    'screens/CreateAuctionScreen.tsx',
    'screens/GlobalSearchScreen.tsx',
    'screens/CategoryTreeScreen.tsx',
    'screens/NotificationsScreen.tsx',
    'screens/ManageListingScreen.tsx',
    'screens/PosterViewerScreen.tsx',
  ];

  const productionComponents = [
    'components/explore/PulseTab.tsx',
    'components/explore/LooksTab.tsx',
    'components/explore/EditTab.tsx',
    'components/discover/FeaturedBoardCard.tsx',
  ];

  const productionData = [
    'data/mockData.ts',
    'data/tradeHub.ts',
    'data/posters.ts',
  ];

  // 1. No images.unsplash.com in production screens/components/data
  it('no images.unsplash.com in production screens', () => {
    for (const screen of productionScreens) {
      const src = readSrcOptional(screen);
      if (!src) continue;
      expect(src).not.toContain('images.unsplash.com');
    }
  });

  it('no images.unsplash.com in production components', () => {
    for (const comp of productionComponents) {
      const src = readSrcOptional(comp);
      if (!src) continue;
      expect(src).not.toContain('images.unsplash.com');
    }
  });

  it('no images.unsplash.com in production data files', () => {
    for (const file of productionData) {
      const src = readSrcOptional(file);
      if (!src) continue;
      expect(src).not.toContain('images.unsplash.com');
    }
  });

  // 2. No picsum.photos in production screens/components/data
  it('no picsum.photos in production screens', () => {
    for (const screen of productionScreens) {
      const src = readSrcOptional(screen);
      if (!src) continue;
      expect(src).not.toContain('picsum.photos');
    }
  });

  it('no picsum.photos in production components', () => {
    for (const comp of productionComponents) {
      const src = readSrcOptional(comp);
      if (!src) continue;
      expect(src).not.toContain('picsum.photos');
    }
  });

  it('no picsum.photos in production data files', () => {
    for (const file of productionData) {
      const src = readSrcOptional(file);
      if (!src) continue;
      expect(src).not.toContain('picsum.photos');
    }
  });

  // 3. No placeholder.com
  it('no placeholder.com in production screens', () => {
    for (const screen of productionScreens) {
      const src = readSrcOptional(screen);
      if (!src) continue;
      expect(src).not.toContain('placeholder.com');
    }
  });

  // 4. No production MOCK_USERS / MOCK_CONTACTS usage
  it('no MOCK_USERS in production screens', () => {
    for (const screen of productionScreens) {
      const src = readSrcOptional(screen);
      if (!src) continue;
      expect(src).not.toContain('MOCK_USERS');
    }
  });

  it('no MOCK_CONTACTS in production screens', () => {
    for (const screen of productionScreens) {
      const src = readSrcOptional(screen);
      if (!src) continue;
      expect(src).not.toContain('MOCK_CONTACTS');
    }
  });

  it('no MOCK_LISTINGS in production screens', () => {
    for (const screen of productionScreens) {
      const src = readSrcOptional(screen);
      if (!src) continue;
      expect(src).not.toContain('MOCK_LISTINGS');
    }
  });

  // 5. No gold/yellow hardcoded CTA colors
  it('no gold/yellow hardcoded colors in production screens', () => {
    const badColors = /#(?:f0ad4e|ffd700|ffdf00|FFE66D|F5A623|d7b98f)/i;
    for (const screen of productionScreens) {
      const src = readSrcOptional(screen);
      if (!src) continue;
      expect(src).not.toMatch(badColors);
    }
  });

  // 6. No fake followers/reviews/ratings strings in profile/public UI
  it('no fake followers text in profile screens', () => {
    const badTerms = /\b\d+\s*(followers|following|reviews?|ratings?)\b/i;
    for (const screen of ['screens/MyProfileScreen.tsx', 'screens/UserProfileScreen.tsx']) {
      const src = readSrcOptional(screen);
      if (!src) continue;
      expect(src).not.toMatch(badTerms);
    }
  });

  // 7. No fake vault/custody/ROI/growth claims
  it('no fake financial claims in co-own screens', () => {
    const badTerms = /\b(vault|custody|guaranteed return|ROI|annual growth|projected value|syntheticOwners|MOCK_HOLDERS)\b/i;
    const coOwnScreens = [
      'screens/AssetDetailScreen.tsx',
      'screens/PortfolioScreen.tsx',
      'screens/TradeHubScreen.tsx',
      'screens/SyndicateHubScreen.tsx',
      'screens/TradeScreen.tsx',
      'screens/BuyoutScreen.tsx',
    ];
    for (const screen of coOwnScreens) {
      const src = readSrcOptional(screen);
      if (!src) continue;
      expect(src).not.toMatch(badTerms);
    }
  });

  // 8. No external placeholder image providers
  it('no loremflickr in production', () => {
    for (const screen of productionScreens) {
      const src = readSrcOptional(screen);
      if (!src) continue;
      expect(src).not.toContain('loremflickr');
    }
  });

  // 9. AuthLandingScreen has no remote image dependencies
  it('AuthLandingScreen has no remote image URLs', () => {
    const src = readSrc('screens/AuthLandingScreen.tsx');
    expect(src).not.toContain('http');
  });

  // 10. No glass/blur in production screens (except BottomSheet and tests)
  it('no glass/blur in production screens', () => {
    for (const screen of productionScreens) {
      const src = readSrcOptional(screen);
      if (!src) continue;
      expect(src).not.toContain('expo-blur');
      expect(src).not.toContain('BlurView');
    }
  });
});