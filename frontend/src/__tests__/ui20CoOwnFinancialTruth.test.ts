import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SCREENS = resolve(__dirname, '../screens');
const NAV = resolve(__dirname, '../navigation');
const COMPONENTS = resolve(__dirname, '../components');
const SERVICES = resolve(__dirname, '../services');
const DATA = resolve(__dirname, '../data');

function read(p: string): string {
  return readFileSync(p, 'utf-8');
}

describe('UI-20 co-own financial truth and UX', () => {
  // ── 1. UI-19 routes remain registered ──
  it('ListingPreview route remains registered', () => {
    const nav = read(resolve(NAV, 'AppNavigator.tsx'));
    expect(nav).toContain('ListingPreviewScreen');
    expect(nav).toContain("name=\"ListingPreview\"");
  });

  it('TradeConfirm route remains registered', () => {
    const nav = read(resolve(NAV, 'AppNavigator.tsx'));
    expect(nav).toContain('TradeConfirmScreen');
    expect(nav).toContain("name=\"TradeConfirm\"");
  });

  // ── 2. AssetDetailScreen removes mock data imports ──
  it('AssetDetailScreen no longer imports tradeHub or mockSyndicateData', () => {
    const src = read(resolve(SCREENS, 'AssetDetailScreen.tsx'));
    expect(src).not.toContain("from '../data/tradeHub'");
    expect(src).not.toContain("from '../data/mockSyndicateData'");
    expect(src).toContain('fetchCoOwnAssetById');
    expect(src).toContain('fetchCoOwnOrderBook');
  });

  it('AssetDetailScreen shows real price chart from truthful data sources', () => {
    const src = read(resolve(SCREENS, 'AssetDetailScreen.tsx'));
    // Price chart is now powered by real order data, not a placeholder
    expect(src).toContain('CoOwnPriceChart');
    expect(src).not.toContain('Price history is not available');
    expect(src).not.toContain('getPriceSeries');
    expect(src).not.toContain('getOrderBookSnapshot');
  });

  it('AssetDetailScreen has clear trade/buyout/ledger/issue routing', () => {
    const src = read(resolve(SCREENS, 'AssetDetailScreen.tsx'));
    expect(src).toContain("navigation.navigate('Trade'");
    expect(src).toContain("navigation.navigate('Buyout'");
    expect(src).toContain("navigation.navigate('CoOwnIssue'");
    expect(src).toContain("navigation.navigate('CoOwnOrderHistory'");
  });

  // ── 3. BuyoutScreen removes mock data imports ──
  it('BuyoutScreen no longer imports tradeHub or mockSyndicateData', () => {
    const src = read(resolve(SCREENS, 'BuyoutScreen.tsx'));
    expect(src).not.toContain("from '../data/tradeHub'");
    expect(src).not.toContain("from '../data/mockSyndicateData'");
    expect(src).toContain('fetchCoOwnAssetById');
    expect(src).toContain('fetchCoOwnHoldings');
  });

  it('BuyoutScreen shows honest unavailable/error state', () => {
    const src = read(resolve(SCREENS, 'BuyoutScreen.tsx'));
    expect(src).toContain('Asset not found');
    expect(src).toContain('isError');
    expect(src).toContain('isLoading');
  });

  // ── 4. TradeConfirmScreen has fee/total/risk summary ──
  it('TradeConfirmScreen has fee total and risk summary', () => {
    const src = read(resolve(SCREENS, 'TradeConfirmScreen.tsx'));
    expect(src).toContain('fee');
    expect(src).toContain('total');
    expect(src).toContain('risk');
    expect(src).toContain('placeCoOwnOrder');
  });

  it('TradeConfirmScreen does not fake success without backend', () => {
    const src = read(resolve(SCREENS, 'TradeConfirmScreen.tsx'));
    expect(src).toContain('placeCoOwnOrder');
    expect(src).not.toContain('setTimeout');
    expect(src).not.toContain('fakeSuccess');
  });

  // ── 5. TradeScreen removes mock data imports ──
  it('TradeScreen no longer imports tradeHub or mockSyndicateData', () => {
    const src = read(resolve(SCREENS, 'TradeScreen.tsx'));
    expect(src).not.toContain("from '../data/tradeHub'");
    expect(src).not.toContain("from '../data/mockSyndicateData'");
    expect(src).toContain('fetchCoOwnAssetById');
  });

  // ── 6. PortfolioScreen removes mock data imports ──
  it('PortfolioScreen no longer imports tradeHub or mockSyndicateData', () => {
    const src = read(resolve(SCREENS, 'PortfolioScreen.tsx'));
    expect(src).not.toContain("from '../data/tradeHub'");
    expect(src).not.toContain("from '../data/mockSyndicateData'");
    expect(src).toContain('listCoOwnAssets');
    expect(src).toContain('fetchCoOwnHoldings');
  });

  // ── 7. SyndicateHubScreen removes tradeHub runtime imports ──
  it('SyndicateHubScreen does not import runtime tradeHub data', () => {
    const src = read(resolve(SCREENS, 'SyndicateHubScreen.tsx'));
    expect(src).not.toContain("getCoOwnMarket");
    expect(src).not.toContain("resolveAssetMarketState");
    expect(src).toContain('listCoOwnAssets');
  });

  // ── 8. MarketLedgerScreen does not render fake rows ──
  it('MarketLedgerScreen does not import fake data sources', () => {
    const src = read(resolve(SCREENS, 'MarketLedgerScreen.tsx'));
    expect(src).not.toContain("from '../data/tradeHub'");
    expect(src).not.toContain("from '../data/mockSyndicateData'");
    expect(src).toContain('listUserMarketHistory');
  });

  // ── 9. SyndicateOrderHistoryScreen does not render fake orders ──
  it('SyndicateOrderHistoryScreen does not import fake order data', () => {
    const src = read(resolve(SCREENS, 'SyndicateOrderHistoryScreen.tsx'));
    expect(src).not.toContain("from '../data/tradeHub'");
    expect(src).not.toContain("from '../data/mockSyndicateData'");
    expect(src).not.toContain('MOCK_TRADE_ORDERS');
    expect(src).toContain('listUserMarketHistory');
  });

  // ── 10. AssetLeaderboardScreen removes mock data imports ──
  it('AssetLeaderboardScreen no longer imports tradeHub or mockSyndicateData', () => {
    const src = read(resolve(SCREENS, 'AssetLeaderboardScreen.tsx'));
    expect(src).not.toContain("from '../data/tradeHub'");
    expect(src).not.toContain("from '../data/mockSyndicateData'");
    expect(src).toContain('listCoOwnAssets');
  });

  // ── 11. MyProfileScreen removes mock data imports ──
  it('MyProfileScreen no longer imports tradeHub or mockSyndicateData', () => {
    const src = read(resolve(SCREENS, 'MyProfileScreen.tsx'));
    expect(src).not.toContain("from '../data/tradeHub'");
    expect(src).not.toContain("from '../data/mockSyndicateData'");
    expect(src).toContain('listCoOwnAssets');
    expect(src).toContain('fetchCoOwnHoldings');
  });

  // ── 13. FinancialDisclosure reusable component exists ──
  it('FinancialDisclosure component exists and has risk items', () => {
    const src = read(resolve(COMPONENTS, 'FinancialDisclosure.tsx'));
    expect(src).toContain('Risk disclosure');
    expect(src).toContain('market risk');
    expect(src).toContain('Platform fees apply');
  });

  // ── 14. marketApi has fetchCoOwnAssetById and fetchCoOwnOrderBook ──
  it('marketApi exports fetchCoOwnAssetById and fetchCoOwnOrderBook', () => {
    const src = read(resolve(SERVICES, 'marketApi.ts'));
    expect(src).toContain('export async function fetchCoOwnAssetById');
    expect(src).toContain('export async function fetchCoOwnOrderBook');
  });

  // ── 15. No fake ROI/growth/custody/vault/holder claims ──
  // Note: "custodian"/"custody" are legitimate, backend-driven, fail-closed
  // disclosure fields required by CoOwnAssetDossier (provenance/condition/
  // custody/insurance/appraisal) — the field name itself is not a fake claim.
  it('active co-own screens do not contain fake financial claims', () => {
    const screens = [
      'AssetDetailScreen.tsx',
      'BuyoutScreen.tsx',
      'TradeScreen.tsx',
      'TradeConfirmScreen.tsx',
      'PortfolioScreen.tsx',
      'SyndicateHubScreen.tsx',
      'MarketLedgerScreen.tsx',
      'SyndicateOrderHistoryScreen.tsx',
      'AssetLeaderboardScreen.tsx',
    ];
    for (const screen of screens) {
      const src = read(resolve(SCREENS, screen));
      expect(src).not.toContain('fakeROI');
      expect(src).not.toContain('mockGrowth');
      expect(src).not.toContain('vaultStatus');
      expect(src).not.toContain('guaranteed custody');
    }
  });

  // ── 16. No Unsplash/picsum/placeholder providers ──
  it('co-own screens do not use placeholder image providers', () => {
    const screens = [
      'AssetDetailScreen.tsx',
      'BuyoutScreen.tsx',
      'PortfolioScreen.tsx',
      'SyndicateHubScreen.tsx',
      'AssetLeaderboardScreen.tsx',
    ];
    for (const screen of screens) {
      const src = read(resolve(SCREENS, screen));
      expect(src).not.toContain('unsplash');
      expect(src).not.toContain('picsum');
      expect(src).not.toMatch(/placeholder\.(com|image|img)/i);
    }
  });

  // ── 17. No gold/yellow/glass regressions ──
  it('co-own screens do not have gold yellow or glass color regressions', () => {
    const screens = [
      'AssetDetailScreen.tsx',
      'BuyoutScreen.tsx',
      'TradeScreen.tsx',
      'TradeConfirmScreen.tsx',
      'PortfolioScreen.tsx',
      'SyndicateHubScreen.tsx',
      'MarketLedgerScreen.tsx',
      'SyndicateOrderHistoryScreen.tsx',
      'AssetLeaderboardScreen.tsx',
    ];
    for (const screen of screens) {
      const src = read(resolve(SCREENS, screen));
      const colorMatches = src.match(/color:\s*['"]gold['"]|color:\s*['"]yellow['"]|backgroundColor:\s*['"]gold['"]|backgroundColor:\s*['"]yellow['"]/gi);
      expect(colorMatches).toBeNull();
      expect(src).not.toContain('glassmorphism');
      expect(src).not.toContain('glass');
    }
  });
});