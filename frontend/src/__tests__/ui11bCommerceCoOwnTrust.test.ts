import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

function readSrc(filePath: string): string {
  return readFileSync(resolve(__dirname, '..', filePath), 'utf-8');
}

describe('UI-11B commerce + co-own trust UI rebuild', () => {
  // 1. OrderDetail uses premium hero/stepper/action components
  it('OrderDetailScreen uses FlagshipActionCluster and premium timeline', () => {
    const src = readSrc('screens/OrderDetailScreen.tsx');
    expect(src).toContain('FlagshipActionCluster');
    expect(src).toContain('PremiumStatusPill');
    expect(src).toContain('ElevatedSurface');
    expect(src).toContain('borderWidth: 3');
    expect(src).toContain('borderColor: Colors.background');
    expect(src).toContain('shadowRadius');
  });

  // 2. Checkout uses premium summary/action components
  it('CheckoutScreen uses PremiumActionBar and ElevatedSurface', () => {
    const src = readSrc('screens/CheckoutScreen.tsx');
    expect(src).toContain('PremiumActionBar');
    expect(src).toContain('ElevatedSurface');
    expect(src).toContain('FadeInDown');
  });

  // 3. MyOrders does not use fake product fallback
  it('MyOrdersScreen uses real backend data and OrderLedgerRow', () => {
    const src = readSrc('screens/MyOrdersScreen.tsx');
    expect(src).toContain('OrderLedgerRow');
    expect(src).toContain('listUserOrders');
    expect(src).not.toContain('MOCK_ORDERS');
    expect(src).not.toContain('picsum.photos');
  });

  // 4. CoOwnIssue uses flagship action/graphic/form hierarchy
  it('CoOwnIssueScreen uses FlagshipEmptyGraphic and FlagshipActionCluster', () => {
    const src = readSrc('screens/CoOwnIssueScreen.tsx');
    expect(src).toContain('FlagshipEmptyGraphic');
    expect(src).toContain('FlagshipActionCluster');
    expect(src).toContain('AppInput');
    expect(src).toContain('FadeInDown');
  });

  // 5. Co-own screens do not contain fake ROI/growth/vault/custody claims
  it('co-own screens do not contain fake financial claims', () => {
    const screens = [
      'screens/AssetDetailScreen.tsx',
      'screens/PortfolioScreen.tsx',
      'screens/TradeHubScreen.tsx',
      'screens/SyndicateHubScreen.tsx',
      'screens/TradeScreen.tsx',
      'screens/BuyoutScreen.tsx',
    ];
    for (const screen of screens) {
      const src = readSrc(screen);
      expect(src).not.toContain('vault');
      expect(src).not.toContain('custody');
      expect(src).not.toContain('guaranteed return');
      expect(src).not.toContain('ROI');
      expect(src).not.toContain('annual growth');
      expect(src).not.toContain('projected value');
      expect(src).not.toContain('syntheticOwners');
      expect(src).not.toContain('MOCK_HOLDERS');
    }
  });

  // 6. Financial screens do not show fake balances
  it('financial screens do not hardcode balance amounts', () => {
    const screens = [
      'screens/BalanceScreen.tsx',
      'screens/WithdrawScreen.tsx',
      'screens/BalanceHistoryScreen.tsx',
      'screens/PaymentsScreen.tsx',
    ];
    for (const screen of screens) {
      const src = readSrc(screen);
      expect(src).not.toContain('useState(120.5)');
      expect(src).not.toContain('useState(50000)');
      expect(src).not.toContain('useState(1000)');
      expect(src).not.toContain('£1,234');
      expect(src).not.toContain('fake balance');
    }
  });

  // 7. No picsum images in commerce/co-own screens
  it('commerce and co-own screens do not use picsum images', () => {
    const screens = [
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
    ];
    for (const screen of screens) {
      const src = readSrc(screen);
      expect(src).not.toContain('picsum.photos');
      expect(src).not.toContain('placeholder.com');
      expect(src).not.toContain('loremflickr');
    }
  });

  // 8. No gold/yellow in commerce/co-own screens
  it('commerce and co-own screens do not use gold or yellow colors', () => {
    const screens = [
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
      'components/flagship/FlagshipAssetCard.tsx',
      'components/flagship/FlagshipOrderCard.tsx',
    ];
    for (const screen of screens) {
      const src = readSrc(screen);
      expect(src).not.toMatch(/#(?:f0ad4e|ffd700|ffdf00|FFE66D|F5A623)/i);
      expect(src).not.toMatch(/color:\s*['"]gold['"]/i);
      expect(src).not.toMatch(/color:\s*['"]yellow['"]/i);
    }
  });

  // 9. No glass/blur except explicitly allowed files
  it('commerce and co-own screens do not use glass/blur', () => {
    const screens = [
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
    ];
    for (const screen of screens) {
      const src = readSrc(screen);
      expect(src).not.toContain('expo-blur');
      expect(src).not.toContain('BlurView');
      expect(src).not.toContain('glassCard');
      expect(src).not.toContain('GlassCard');
    }
  });

  // 10. No double-boxing in financial screens
  it('financial screens do not nest ElevatedSurface inside list sections', () => {
    const screens = [
      'screens/PaymentsScreen.tsx',
      'screens/BalanceScreen.tsx',
      'screens/WithdrawScreen.tsx',
    ];
    for (const screen of screens) {
      const src = readSrc(screen);
      const pattern1 = /<PremiumListSection[\s\S]*?<ElevatedSurface[\s\S]*?<\/PremiumListSection>/;
      const pattern2 = /<SettingsSection[\s\S]*?<ElevatedSurface[\s\S]*?<\/SettingsSection>/;
      expect(src).not.toMatch(pattern1);
      expect(src).not.toMatch(pattern2);
    }
  });

  // Additional: SuccessScreen uses FlagshipActionCluster instead of raw pressables
  it('SuccessScreen uses FlagshipActionCluster and proper border colors', () => {
    const src = readSrc('screens/SuccessScreen.tsx');
    expect(src).toContain('FlagshipActionCluster');
    expect(src).not.toContain("borderColor: '#333'");
    expect(src).toContain('FadeInDown');
  });

  // Additional: BalanceHistoryScreen uses ScreenHeader and no hardcoded gold
  it('BalanceHistoryScreen uses ScreenHeader and design tokens', () => {
    const src = readSrc('screens/BalanceHistoryScreen.tsx');
    expect(src).toContain('ScreenHeader');
    expect(src).toContain('FadeInDown');
    expect(src).toContain('FlagshipEmptyGraphic');
    expect(src).not.toContain('#FFE66D');
  });

  // Additional: FlagshipAssetCard does not hardcode yellow
  it('FlagshipAssetCard uses design system colors only', () => {
    const src = readSrc('components/flagship/FlagshipAssetCard.tsx');
    expect(src).not.toContain('#F5A623');
    expect(src).toContain('Colors.');
  });
});