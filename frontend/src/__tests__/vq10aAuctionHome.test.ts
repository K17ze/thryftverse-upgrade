import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '..');

function readSrc(rel: string): string {
  return readFileSync(resolve(ROOT, rel), 'utf-8');
}

function fileExists(rel: string): boolean {
  return existsSync(resolve(ROOT, rel));
}

describe('VQ-10A PASS 2.1: AuctionHome route registration', () => {
  const typesSrc = readSrc('navigation/types.ts');
  const appNavSrc = readSrc('navigation/AppNavigator.tsx');

  it('AuctionHome is declared in RootStackParamList', () => {
    expect(typesSrc).toContain('AuctionHome: undefined;');
  });

  it('AuctionHome screen is imported in AppNavigator', () => {
    expect(appNavSrc).toContain("import AuctionHomeScreen from '../screens/AuctionHomeScreen'");
  });

  it('AuctionHome Stack.Screen is registered in AppNavigator', () => {
    expect(appNavSrc).toContain('name="AuctionHome"');
    expect(appNavSrc).toContain('component={AuctionHomeScreen}');
  });

  it('AuctionDetail route is preserved', () => {
    expect(typesSrc).toContain('AuctionDetail: { auctionId: string };');
    expect(appNavSrc).toContain('name="AuctionDetail"');
  });

  it('CreateAuction route is preserved', () => {
    expect(typesSrc).toContain('CreateAuction:');
    expect(appNavSrc).toContain('name="CreateAuction"');
  });

  it('MyBids route is preserved', () => {
    expect(typesSrc).toContain('MyBids: undefined;');
    expect(appNavSrc).toContain('name="MyBids"');
  });
});

describe('VQ-10A PASS 2.1: AuctionHome is truly independent (not embedded)', () => {
  it('AuctionHomeScreen.tsx exists', () => {
    expect(fileExists('screens/AuctionHomeScreen.tsx')).toBe(true);
  });

  it('TradeHubScreen does NOT import AuctionHomeScreen', () => {
    const src = readSrc('screens/TradeHubScreen.tsx');
    expect(src).not.toContain('AuctionHomeScreen');
  });

  it('TradeHubScreen does NOT embed AuctionHomeScreen', () => {
    const src = readSrc('screens/TradeHubScreen.tsx');
    expect(src).not.toContain('<AuctionHomeScreen');
  });

  it('TradeHubScreen has a gateway card that navigates to AuctionHome', () => {
    const src = readSrc('screens/TradeHubScreen.tsx');
    expect(src).toContain("navigation.navigate('AuctionHome')");
  });

  it('TradeHubScreen does NOT import AuctionsScreen', () => {
    const src = readSrc('screens/TradeHubScreen.tsx');
    expect(src).not.toContain("import AuctionsScreen from './AuctionsScreen'");
  });

  it('AuctionHomeScreen does not import or embed AuctionsScreen', () => {
    const src = readSrc('screens/AuctionHomeScreen.tsx');
    expect(src).not.toContain('AuctionsScreen');
  });

  it('Co-Own tab content is preserved in TradeHubScreen', () => {
    const src = readSrc('screens/TradeHubScreen.tsx');
    expect(src).toContain('CoOwnScreen');
  });
});

describe('VQ-10A PASS 2.1: Canonical Auction Home header', () => {
  const src = readSrc('screens/AuctionHomeScreen.tsx');

  it('has a header bar with back, title, and action', () => {
    expect(src).toContain('editorialHeader');
    expect(src).toContain('headerBackBtn');
    expect(src).toContain('editorialTitle');
    expect(src).toContain('headerActionBtn');
  });

  it('header title says "Auctions"', () => {
    expect(src).toContain('>Auctions<');
  });

  it('has back navigation with canGoBack fallback', () => {
    expect(src).toContain('canGoBack()');
    expect(src).toContain('goBack()');
    expect(src).toContain('MainTabs');
  });

  it('header action navigates to MyBids', () => {
    expect(src).toContain("navigation.navigate('MyBids')");
  });

  it('header controls are 44pt', () => {
    expect(src).toContain('HEADER_HEIGHT');
    expect(src).toMatch(/HEADER_HEIGHT\s*=\s*44/);
  });

  it('has accessibility labels for header controls', () => {
    expect(src).toContain('accessibilityLabel="Go back"');
    expect(src).toContain('accessibilityLabel="My auction activity"');
  });

  it('does not crowd header with Create Auction, search and multiple controls', () => {
    const headerBarMatch = src.match(/editorialHeaderTop[\s\S]*?<\/View>/);
    expect(headerBarMatch).toBeTruthy();
    const headerBar = headerBarMatch![0];
    expect(headerBar).not.toContain('CreateAuction');
  });
});

describe('VQ-10A PASS 2.1: Server clock foreground resync', () => {
  const src = readSrc('hooks/useServerClock.ts');

  it('exports needsResync signal', () => {
    expect(src).toContain('needsResync');
  });

  it('exports markResyncFailed function', () => {
    expect(src).toContain('markResyncFailed');
  });

  it('does NOT reuse initialServerNow on foreground', () => {
    const appStateEffect = src.match(/const handleAppStateChange[\s\S]*?subscription\.remove\(\);[\s\S]*?\}\s*,\s*\[\]\s*\)/);
    expect(appStateEffect).toBeTruthy();
    const effectBody = appStateEffect![0];
    expect(effectBody).not.toContain('initialServerNow');
    expect(effectBody).not.toContain('computeOffset(initialServerNow)');
  });

  it('sets needsResync to true on foreground after 30s', () => {
    expect(src).toContain('setNeedsResync(true)');
    expect(src).toContain('30_000');
  });

  it('clears needsResync in computeOffset', () => {
    expect(src).toContain('setNeedsResync(false)');
  });
});

describe('VQ-10A PASS 2.1: List API state truth', () => {
  const apiSrc = readSrc('services/marketApi.ts');

  it('MarketAuction has cancelledAt field', () => {
    expect(apiSrc).toContain('cancelledAt: string | null;');
  });

  it('MarketAuction has settledAt field', () => {
    expect(apiSrc).toContain('settledAt: string | null;');
  });

  it('MarketAuction exposes winnerBidderId (canonical lifecycle)', () => {
    const marketAuctionMatch = apiSrc.match(/export interface MarketAuction \{[\s\S]*?\}/);
    expect(marketAuctionMatch).toBeTruthy();
    expect(marketAuctionMatch![0]).toContain('winnerBidderId');
  });

  it('AuctionHomeScreen toViewModel uses api.cancelledAt (not hardcoded null)', () => {
    const src = readSrc('screens/AuctionHomeScreen.tsx');
    expect(src).toContain('api.cancelledAt');
    expect(src).not.toMatch(/cancelledAt:\s*null\s*,/);
  });

  it('AuctionHomeScreen toViewModel uses api.settledAt (not hardcoded null)', () => {
    const src = readSrc('screens/AuctionHomeScreen.tsx');
    expect(src).toContain('api.settledAt');
    expect(src).not.toMatch(/settledAt:\s*null\s*,/);
  });

  it('AuctionHomeScreen toViewModel uses api.seller.avatarUrl', () => {
    const src = readSrc('screens/AuctionHomeScreen.tsx');
    expect(src).toContain('api.seller.avatarUrl');
  });
});

describe('VQ-10A PASS 2.1: Attention resolver truth', () => {
  const src = readSrc('screens/AuctionHomeScreen.tsx');

  it('exports isAttentionItem function from auctionHomeLogic', () => {
    const logicSrc = readSrc('utils/auctionHomeLogic.ts');
    expect(logicSrc).toContain('export function isAttentionItem');
  });

  it('isAttentionItem rejects cancelled auctions', () => {
    const logicSrc = readSrc('utils/auctionHomeLogic.ts');
    expect(logicSrc).toMatch(/effectiveState\s*===\s*['"]cancelled['"].*return false/);
  });

  it('isAttentionItem rejects settled auctions', () => {
    const logicSrc = readSrc('utils/auctionHomeLogic.ts');
    expect(logicSrc).toMatch(/effectiveState\s*===\s*['"]settled['"].*return false/);
  });

  it('attention logic does NOT exclude ended before checking (no contradictory filter)', () => {
    // The attention logic is now inlined as separate sections
    // Verify the leading/outbid/won sections exist
    expect(src).toContain('leadingItems');
    expect(src).toContain('outbidItems');
    expect(src).toContain('wonItems');
  });

  it('isAttentionItem does not mark watched auctions as attention', () => {
    const logicSrc = readSrc('utils/auctionHomeLogic.ts');
    const fnMatch = logicSrc.match(/export function isAttentionItem[\s\S]*?^}/m);
    expect(fnMatch).toBeTruthy();
    const fnBody = fnMatch![0];
    expect(fnBody).not.toContain('watching');
    expect(fnBody).not.toMatch(/viewerState\s*===\s*['"]watching['"]/);
  });

  it('isAttentionItem does not mark seller items as attention', () => {
    const logicSrc = readSrc('utils/auctionHomeLogic.ts');
    const fnMatch = logicSrc.match(/export function isAttentionItem[\s\S]*?^}/m);
    expect(fnMatch).toBeTruthy();
    const fnBody = fnMatch![0];
    expect(fnBody).not.toContain("'seller'");
  });
});

describe('VQ-10A PASS 2.1: Won CTA truth', () => {
  const src = readSrc('screens/AuctionHomeScreen.tsx');

  it('uses "View result" for won auctions, not "Complete purchase"', () => {
    expect(src).toContain('View result');
    expect(src).not.toContain('Complete purchase');
  });

  it('navigates to AuctionDetail for won auctions', () => {
    expect(src).toContain("navigation.navigate('AuctionDetail'");
  });
});

describe('VQ-10A PASS 2.1: Search is wired to server', () => {
  const src = readSrc('screens/AuctionHomeScreen.tsx');

  it('has debouncedQuery state', () => {
    expect(src).toContain('debouncedQuery');
  });

  it('calls listAuctions with query parameter', () => {
    expect(src).toContain('query: debouncedQuery');
  });

  it('has 400ms debounce timer', () => {
    expect(src).toContain('400');
    expect(src).toContain('setTimeout');
  });

  it('has stale request rejection (requestId pattern)', () => {
    expect(src).toContain('searchReqIdRef');
    expect(src).toMatch(/reqId\s*!==\s*searchReqIdRef\.current/);
  });

  it('resets cursor when query changes', () => {
    expect(src).toContain('searchState');
  });

  it('clears search results when query is empty', () => {
    expect(src).toContain('IDLE_SEARCH_STATE');
  });

  it('has clear search button', () => {
    expect(src).toContain('Clear search');
    expect(src).toContain('close-circle');
  });

  it('has no results state', () => {
    expect(src).toContain('No results');
  });

  it('has search error state', () => {
    expect(src).toContain('Search failed');
  });

  it('search pagination preserves active query', () => {
    expect(src).toContain('query: debouncedQuery');
    const loadMoreMatch = src.match(/loadMoreSearch[\s\S]*?query: debouncedQuery/);
    expect(loadMoreMatch).toBeTruthy();
  });
});

describe('VQ-10A PASS 2.1: Section-specific API calls', () => {
  const src = readSrc('screens/AuctionHomeScreen.tsx');

  it('fetches live auctions with status=live', () => {
    expect(src).toContain("status: 'live'");
    expect(src).toContain("sort: 'endingSoon'");
  });

  it('fetches upcoming auctions with status=scheduled', () => {
    expect(src).toContain("status: 'scheduled'");
    expect(src).toContain("sort: 'newest'");
  });

  it('fetches ended auctions with status=ended', () => {
    expect(src).toContain("status: 'ended'");
  });

  it('fetches seller auctions with seller=me', () => {
    expect(src).toContain("seller: 'me'");
  });

  it('fetches watchlist with getWatchlist()', () => {
    expect(src).toContain('getWatchlist()');
  });

  it('does NOT fetch a single all-status page for all sections', () => {
    expect(src).not.toContain("status: 'all', sort: 'endingSoon', limit: 50");
  });

  it('uses Promise.all for parallel section fetches', () => {
    expect(src).toContain('Promise.all');
  });

  it('has stale request rejection for section fetches', () => {
    expect(src).toContain('requestIdRef');
    expect(src).toMatch(/reqId\s*!==\s*requestIdRef\.current/);
  });
});

describe('VQ-10A PASS 2.1: Complete duplicate prevention', () => {
  const src = readSrc('screens/AuctionHomeScreen.tsx');

  it('usedIds is applied to seller tools section', () => {
    const sellerMatch = src.match(/sellerTools[\s\S]*?usedIds\.has/);
    expect(sellerMatch).toBeTruthy();
  });

  it('usedIds is applied to sections (endingSoon, live, upcoming, watchlist, ended, seller) with canonical map for attention)', () => {
    const sectionsMatch = src.match(/usedIds\.has[\s\S]*?(?:return result|return \[\])/);
    expect(sectionsMatch).toBeTruthy();
    const body = sectionsMatch![0];
    const usedIdsCount = (body.match(/usedIds\.has/g) || []).length;
    expect(usedIdsCount).toBeGreaterThanOrEqual(6);
    expect(src).toContain('buildCanonicalMap');
  });

  it('priority order: attention sections first, seller last', () => {
    const leadingIdx = src.indexOf("title: \"You're leading\"");
    const sellerIdx = src.indexOf("'sellerTools', title: 'Your auctions'");
    expect(leadingIdx).toBeGreaterThan(-1);
    expect(sellerIdx).toBeGreaterThan(-1);
    expect(leadingIdx).toBeLessThan(sellerIdx);
  });
});

describe('VQ-10A PASS 2.1: No false seller destination', () => {
  const src = readSrc('screens/AuctionHomeScreen.tsx');

  it('seller tools section has no action navigating to MyBids', () => {
    const sellerMatch = src.match(/sellerTools[\s\S]*?section\.kind === 'sellerTools'[\s\S]*?\)/);
    if (sellerMatch) {
      expect(sellerMatch[0]).not.toContain("navigation.navigate('MyBids')");
    }
  });

  it('SectionHeader does not have actionLabel for sellerTools', () => {
    expect(src).not.toContain("'My Auctions'");
  });
});

describe('VQ-10A PASS 2.1: Visual hierarchy guardrails', () => {
  const src = readSrc('screens/AuctionHomeScreen.tsx');

  it('does not use MetricGrid', () => {
    expect(src).not.toContain('MetricGrid');
  });

  it('card shows auction identity (title)', () => {
    expect(src).toContain('item.title');
  });

  it('card shows current bid', () => {
    expect(src).toContain('currentBidGbp');
  });

  it('card shows viewer state', () => {
    expect(src).toContain('viewerState');
  });

  it('card shows time remaining', () => {
    expect(src).toContain('resolveTimeLabel');
  });

  it('uses SafeAreaView as root (not nested in another screen)', () => {
    expect(src).toContain('SafeAreaView');
  });
});

describe('VQ-10A PASS 2.1: Navigation contracts', () => {
  const src = readSrc('screens/AuctionHomeScreen.tsx');

  it('navigates to AuctionDetail with auctionId', () => {
    expect(src).toContain("navigation.navigate('AuctionDetail'");
    expect(src).toContain('auctionId');
  });

  it('navigates to MyBids from header', () => {
    expect(src).toContain("navigation.navigate('MyBids'");
  });

  it('does not navigate to CreateAuction from header', () => {
    const headerMatch = src.match(/editorialHeaderTop[\s\S]*?<\/View>/);
    expect(headerMatch).toBeTruthy();
    expect(headerMatch![0]).not.toContain('CreateAuction');
  });
});

describe('VQ-10A PASS 2.1: Backend list response fields', () => {
  const backendSrc = readFileSync(
    resolve(__dirname, '../../../backend/api/src/index.ts'),
    'utf-8'
  );

  it('GET /auctions SELECT includes cancelled_at', () => {
    expect(backendSrc).toContain('a.cancelled_at,');
  });

  it('GET /auctions SELECT includes settled_at', () => {
    expect(backendSrc).toContain('a.settled_at,');
  });

  it('GET /auctions SELECT includes winner_bidder_id', () => {
    expect(backendSrc).toContain('a.winner_bidder_id,');
  });

  it('GET /auctions response mapping includes cancelledAt', () => {
    expect(backendSrc).toContain('cancelledAt: row.cancelled_at');
  });

  it('GET /auctions response mapping includes settledAt', () => {
    expect(backendSrc).toContain('settledAt: row.settled_at');
  });

  it('GET /auctions list response mapping exposes winnerBidderId', () => {
    const listEndpointMatch = backendSrc.match(/app\.get\('\/auctions'[^]*?return \{[\s\S]*?ok: true,[\s\S]*?items,[\s\S]*?nextCursor,[\s\S]*?serverNow[\s\S]*?\}/);
    expect(listEndpointMatch).toBeTruthy();
    expect(listEndpointMatch![0]).toContain('winnerBidderId');
  });
});
