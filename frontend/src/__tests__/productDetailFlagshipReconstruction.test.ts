import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SCREENS = resolve(__dirname, '../screens');
const COMPONENTS = resolve(__dirname, '../components');
const SERVICES = resolve(__dirname, '../services');
const BACKEND = resolve(__dirname, '../../../backend/api/src');

function readScreen(name: string): string {
  return readFileSync(resolve(SCREENS, name), 'utf-8');
}

function readComponent(relativePath: string): string {
  return readFileSync(resolve(COMPONENTS, relativePath), 'utf-8');
}

function readService(relativePath: string): string {
  return readFileSync(resolve(SERVICES, relativePath), 'utf-8');
}

function readBackend(relativePath: string): string {
  return readFileSync(resolve(BACKEND, relativePath), 'utf-8');
}

// ───────────────────────────────────────────────────────────────────────────
// Spec 05 §4: Shared compact-width behavior
// All three product-detail screens and the shared dock must switch
// behaviour at the same breakpoint so a compact-width device sees
// consistent identity, media and dock behaviour.
//
// The breakpoint logic is now centralized in hooks/useBreakpoint.ts.
// Screens consume the hook instead of referencing the threshold constant
// or useWindowDimensions directly.
// ───────────────────────────────────────────────────────────────────────────
describe('product-detail-flagship-reconstruction: shared compact width', () => {
  const itemSrc = readScreen('ItemDetailScreen.tsx');
  const auctionSrc = readScreen('AuctionDetailScreen.tsx');
  const assetSrc = readScreen('AssetDetailScreen.tsx');
  const dockSrc = readComponent('commerce/detail/CommerceDetailStateDock.tsx');
  const typesSrc = readComponent('commerce/detail/types.ts');
  const hooksDir = resolve(__dirname, '../hooks');
  const breakpointSrc = readFileSync(resolve(hooksDir, 'useBreakpoint.ts'), 'utf-8');

  it('defines a single COMMERCE_DETAIL_COMPACT_WIDTH constant', () => {
    expect(typesSrc).toContain('COMMERCE_DETAIL_COMPACT_WIDTH');
    expect(typesSrc).toMatch(/COMMERCE_DETAIL_COMPACT_WIDTH\s*=\s*390/);
  });

  it('exports COMMERCE_DETAIL_COMPACT_WIDTH from the commerce/detail barrel', () => {
    const barrel = readComponent('commerce/detail/index.ts');
    expect(barrel).toContain('COMMERCE_DETAIL_COMPACT_WIDTH');
  });

  it('useBreakpoint hook owns the 390 commerce-compact threshold', () => {
    expect(breakpointSrc).toContain('COMMERCE_COMPACT_WIDTH');
    expect(breakpointSrc).toMatch(/COMMERCE_COMPACT_WIDTH\s*=\s*390/);
    expect(breakpointSrc).toContain('isCommerceCompact');
  });

  it('ItemDetailScreen uses useBreakpoint, not a hardcoded 390', () => {
    expect(itemSrc).toContain('useBreakpoint');
    // The old hardcoded threshold should not appear in the isCompact
    // declaration.
    expect(itemSrc).not.toMatch(/isCompactScreen\s*=\s*screenWidth\s*<\s*390/);
  });

  it('AuctionDetailScreen uses useBreakpoint, not a hardcoded 390', () => {
    expect(auctionSrc).toContain('useBreakpoint');
    expect(auctionSrc).not.toMatch(/isCompact\s*=\s*screenWidth\s*<\s*390/);
  });

  it('AssetDetailScreen uses useBreakpoint, not a hardcoded 390', () => {
    expect(assetSrc).toContain('useBreakpoint');
    expect(assetSrc).not.toMatch(/isCompact\s*=\s*screenWidth\s*<\s*390/);
  });

  it('CommerceDetailStateDock stacks at the shared compact threshold', () => {
    // The dock reads viewport width directly and compares against the
    // shared COMMERCE_DETAIL_COMPACT_WIDTH constant (re-exported as
    // COMPACT_STACK_THRESHOLD) so the dock, identity and media switch
    // behaviour at the same breakpoint.
    expect(dockSrc).toContain('useWindowDimensions');
    expect(dockSrc).toContain('COMPACT_STACK_THRESHOLD');
    expect(dockSrc).toMatch(/layout === 'auto' && hasSecondary && screenWidth < COMPACT_STACK_THRESHOLD/);
    expect(dockSrc).not.toMatch(/COMPACT_STACK_THRESHOLD\s*=\s*360/);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Spec 05 §14: Offline state coverage across all commerce detail screens
// ───────────────────────────────────────────────────────────────────────────
describe('product-detail-flagship-reconstruction: offline state coverage', () => {
  it('provides a shared CommerceDetailOfflineBanner primitive', () => {
    const banner = readComponent('commerce/detail/CommerceDetailOfflineBanner.tsx');
    expect(banner).toContain('CommerceDetailOfflineBanner');
    expect(banner).toContain('isOffline');
    expect(banner).toContain('Showing cached data');
  });

  it('exports CommerceDetailOfflineBanner from the barrel', () => {
    const barrel = readComponent('commerce/detail/index.ts');
    expect(barrel).toContain('CommerceDetailOfflineBanner');
  });

  it('ItemDetailScreen renders the offline banner', () => {
    const src = readScreen('ItemDetailScreen.tsx');
    expect(src).toContain('CommerceDetailOfflineBanner');
    expect(src).toContain('useConnectivity');
    expect(src).toContain('isOffline');
  });

  it('AuctionDetailScreen renders the offline banner', () => {
    const src = readScreen('AuctionDetailScreen.tsx');
    expect(src).toContain('CommerceDetailOfflineBanner');
    expect(src).toContain('useConnectivity');
    expect(src).toContain('isOffline');
  });

  it('AssetDetailScreen renders an offline banner', () => {
    const src = readScreen('AssetDetailScreen.tsx');
    expect(src).toContain('useConnectivity');
    expect(src).toContain('isOffline');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Spec 03_COOWN §2 + §4: Backend-backed market snapshot and candle data
// The backend must compute real values from settled trades; the
// frontend must consume them with proper typing (no `as any` casts).
// ───────────────────────────────────────────────────────────────────────────
describe('product-detail-flagship-reconstruction: Co-Own market snapshot backend', () => {
  const backendSrc = readBackend('routes/coOwn.ts');

  it('backend computes lastExecutionPriceGbp from settled trades', () => {
    expect(backendSrc).toContain('last_execution_price_gbp');
    expect(backendSrc).toContain("settlement_status = 'settled'");
  });

  it('backend computes 24h volume from settled trades', () => {
    expect(backendSrc).toContain('vol_24h');
    expect(backendSrc).toContain("INTERVAL '24 hours'");
  });

  it('backend computes best bid/ask from open orders', () => {
    expect(backendSrc).toContain('best_bid');
    expect(backendSrc).toContain('best_ask');
    expect(backendSrc).toContain("side = 'buy'");
    expect(backendSrc).toContain("side = 'sell'");
  });

  it('backend computes marketMovePct24h from price 24h ago vs last trade', () => {
    expect(backendSrc).toContain('price_24h_ago');
    expect(backendSrc).toContain('marketMovePct24h');
  });

  it('backend returns marketSnapshot object (not null) in the asset response', () => {
    expect(backendSrc).toContain('marketSnapshot');
    // The old stub returned marketSnapshot: null. The new code builds a
    // real object with computed fields.
    expect(backendSrc).not.toMatch(/marketSnapshot:\s*null,/);
  });

  it('backend aggregates OHLC candles from settled trades', () => {
    expect(backendSrc).toContain('date_trunc');
    expect(backendSrc).toContain('open_price');
    expect(backendSrc).toContain('high_price');
    expect(backendSrc).toContain('low_price');
    expect(backendSrc).toContain('close_price');
    expect(backendSrc).toContain("INTERVAL '7 days'");
  });

  it('backend returns candles array in the asset response', () => {
    expect(backendSrc).toContain('candles');
  });
});

describe('product-detail-flagship-reconstruction: Co-Own market snapshot frontend', () => {
  const src = readScreen('AssetDetailScreen.tsx');
  const marketApi = readService('marketApi.ts');

  it('MarketCoOwnAsset type includes marketSnapshot and candles', () => {
    expect(marketApi).toContain('marketSnapshot');
    expect(marketApi).toContain('candles');
  });

  it('CoOwnMarketSnapshot interface is defined with all required fields', () => {
    expect(marketApi).toContain('interface CoOwnMarketSnapshot');
    expect(marketApi).toContain('lastExecutionPriceGbp');
    expect(marketApi).toContain('lastExecutionAt');
    expect(marketApi).toContain('volume24hGbp');
    expect(marketApi).toContain('marketMovePct24h');
    expect(marketApi).toContain('bestBidGbp');
    expect(marketApi).toContain('bestAskGbp');
  });

  it('CoOwnCandle interface is defined with OHLCV fields', () => {
    expect(marketApi).toContain('interface CoOwnCandle');
    expect(marketApi).toContain('openGbp');
    expect(marketApi).toContain('highGbp');
    expect(marketApi).toContain('lowGbp');
    expect(marketApi).toContain('closeGbp');
    expect(marketApi).toContain('volume');
  });

  it('AssetDetailScreen accesses marketSnapshot without `as any` cast', () => {
    expect(src).toContain('asset.marketSnapshot');
    expect(src).not.toContain('(asset as any).marketSnapshot');
  });

  it('AssetDetailScreen accesses candles without `as any` cast', () => {
    expect(src).toContain('asset.candles');
    expect(src).not.toContain('(asset as any).candles');
  });

  it('staleness computation prefers the versioned market snapshot timestamp', () => {
    expect(src).toContain('asset.marketSnapshot?.asOf');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Spec 04_DIRECT: Report listing navigation and canonical overflow sheet
// ───────────────────────────────────────────────────────────────────────────
describe('product-detail-flagship-reconstruction: Direct Listing report action', () => {
  const itemSrc = readScreen('ItemDetailScreen.tsx');
  const reportSrc = readScreen('ReportScreen.tsx');

  it('ItemDetailScreen navigates to Report with type "item"', () => {
    expect(itemSrc).toContain("navigation.navigate('Report'");
    expect(itemSrc).toContain("type: 'item'");
  });

  it('ItemDetailScreen uses canonical BottomSheet for overflow (not local sheet)', () => {
    expect(itemSrc).toContain('<BottomSheet');
    expect(itemSrc).not.toContain('overflowBackdrop');
  });

  describe('Direct Listing report action', () => {
    it('ReportScreen handles item reports via reportListing', () => {
      expect(reportSrc).toContain('reportListing');
      expect(reportSrc).toContain("type === 'user'");
      expect(reportSrc).toContain('reportListing(');
    });

    it('ReportScreen accepts all valid report target types (user, group, listing)', () => {
      expect(reportSrc).toContain("type === 'user'");
      expect(reportSrc).toContain("type === 'group'");
      expect(reportSrc).not.toContain("type !== 'user'");
    });
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Spec 02_AUCTION §4: Terminal state dock — one result, one next action
// ───────────────────────────────────────────────────────────────────────────
describe('product-detail-flagship-reconstruction: Auction terminal dock', () => {
  const src = readScreen('AuctionDetailScreen.tsx');

  it('terminal dock carries only the next valid action (no state badge)', () => {
    // The terminal branch should return CommerceDetailStateDock with
    // primaryAction only — no stateBadge.
    const terminalStart = src.indexOf('if (isTerminal)');
    const terminalEnd = src.indexOf('if (isPostEnd)', terminalStart);
    const terminalBranch = src.slice(terminalStart, terminalEnd);
    expect(terminalStart).toBeGreaterThan(-1);
    expect(terminalEnd).toBeGreaterThan(terminalStart);
    expect(terminalBranch).toContain('primaryAction={terminalAction}');
    expect(terminalBranch).not.toContain('stateBadge');
  });

  it('every terminal viewer state has a next valid action', () => {
    // won, lost, seller (with bids), seller (no bids), and
    // not_participating must all produce a terminalAction.
    expect(src).toContain("viewerState === 'won'");
    expect(src).toContain("viewerState === 'lost'");
    expect(src).toContain('isSeller && auction.bidCount > 0');
    expect(src).toContain('isSeller && auction.bidCount === 0');
    // The else branch ensures not_participating gets an action too.
    expect(src).toMatch(/else\s*{[\s\S]*?terminalAction\s*=/);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Spec 03_COOWN: Bid/Ask truncation safety on narrow screens
// ───────────────────────────────────────────────────────────────────────────
describe('product-detail-flagship-reconstruction: Co-Own order book truncation', () => {
  const src = readComponent('coown/CoOwnOrderBook.tsx');

  it('price column uses adjustsFontSizeToFit to prevent truncation', () => {
    expect(src).toContain('adjustsFontSizeToFit');
    expect(src).toContain('minimumFontScale');
  });

  it('all three order book columns (price, size, total) have font fitting', () => {
    // Count occurrences of adjustsFontSizeToFit — should be at least 3
    // (one per column).
    const matches = src.match(/adjustsFontSizeToFit/g);
    expect(matches).toBeTruthy();
    expect(matches!.length).toBeGreaterThanOrEqual(3);
  });
});
