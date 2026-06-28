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

describe('VQ-10A PASS 2: AuctionHome route registration', () => {
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

describe('VQ-10A PASS 2: AuctionHome is a full independent screen', () => {
  it('AuctionHomeScreen.tsx exists', () => {
    expect(fileExists('screens/AuctionHomeScreen.tsx')).toBe(true);
  });

  it('does not import or embed AuctionsScreen', () => {
    const src = readSrc('screens/AuctionHomeScreen.tsx');
    expect(src).not.toContain('AuctionsScreen');
  });

  it('imports useServerClockTick from shared utility', () => {
    const src = readSrc('screens/AuctionHomeScreen.tsx');
    expect(src).toContain('useServerClockTick');
    expect(src).toContain('useServerClock');
  });

  it('imports listAuctions and getWatchlist from marketApi', () => {
    const src = readSrc('screens/AuctionHomeScreen.tsx');
    expect(src).toContain('listAuctions');
    expect(src).toContain('getWatchlist');
  });

  it('uses SafeAreaView as root container (full screen)', () => {
    const src = readSrc('screens/AuctionHomeScreen.tsx');
    expect(src).toContain('SafeAreaView');
  });

  it('does not use hardcoded 6-hour denominator', () => {
    const src = readSrc('screens/AuctionHomeScreen.tsx');
    expect(src).not.toContain('6 * 60 * 60 * 1000');
    expect(src).not.toContain('WINDOW_6_HOURS');
  });

  it('does not use Date.now() for countdown calculation', () => {
    const src = readSrc('screens/AuctionHomeScreen.tsx');
    expect(src).not.toMatch(/Date\.now\(\)\s*[,;\)]/);
  });
});

describe('VQ-10A PASS 2: Trade Hub auction entry migrated', () => {
  const tradeHubSrc = readSrc('screens/TradeHubScreen.tsx');

  it('TradeHubScreen imports AuctionHomeScreen, not AuctionsScreen', () => {
    expect(tradeHubSrc).toContain('AuctionHomeScreen');
    expect(tradeHubSrc).not.toContain("import AuctionsScreen from './AuctionsScreen'");
  });

  it('TradeHubScreen renders AuctionHomeScreen for AUCTIONS tab', () => {
    expect(tradeHubSrc).toContain('<AuctionHomeScreen />');
  });

  it('TradeHubScreen has Browse Auctions quick action navigating to AuctionHome', () => {
    expect(tradeHubSrc).toContain("navigation.navigate('AuctionHome')");
  });

  it('CreateAuction quick action is preserved', () => {
    expect(tradeHubSrc).toContain("navigation.navigate('CreateAuction')");
  });

  it('MyBids quick action is preserved', () => {
    expect(tradeHubSrc).toContain("navigation.navigate('MyBids')");
  });

  it('Co-Own tab content is preserved', () => {
    expect(tradeHubSrc).toContain('CoOwnScreen');
  });
});

describe('VQ-10A PASS 2: Section information architecture', () => {
  const src = readSrc('screens/AuctionHomeScreen.tsx');

  it('has Needs your attention section', () => {
    expect(src).toContain('attention');
    expect(src).toContain('Needs your attention');
  });

  it('has Live now section', () => {
    expect(src).toContain("'live'");
    expect(src).toContain('Live now');
  });

  it('has Ending soon section', () => {
    expect(src).toContain('endingSoon');
    expect(src).toContain('Ending soon');
  });

  it('has Upcoming section', () => {
    expect(src).toContain('upcoming');
    expect(src).toContain('Upcoming');
  });

  it('has Watchlist section', () => {
    expect(src).toContain('watchlist');
    expect(src).toContain('Watching');
  });

  it('has Recently ended section', () => {
    expect(src).toContain('recentlyEnded');
    expect(src).toContain('Recently ended');
  });

  it('has Seller tools section', () => {
    expect(src).toContain('sellerTools');
    expect(src).toContain('Your auctions');
  });

  it('attention section only includes outbid, won, and seller-with-settledAt', () => {
    expect(src).toContain("'outbid'");
    expect(src).toContain("'won'");
  });

  it('sections are only rendered when they have items', () => {
    expect(src).toContain('items.length === 0');
    expect(src).toMatch(/section\.items\.length\s*===\s*0/);
  });

  it('prevents duplicate auction IDs across sections', () => {
    expect(src).toContain('usedIds');
    expect(src).toContain('usedIds.has');
    expect(src).toContain('usedIds.add');
  });
});

describe('VQ-10A PASS 2: Server clock utility', () => {
  it('useServerClock.ts exists', () => {
    expect(fileExists('hooks/useServerClock.ts')).toBe(true);
  });

  const src = readSrc('hooks/useServerClock.ts');

  it('exports resolveAuctionTiming function', () => {
    expect(src).toContain('export function resolveAuctionTiming');
  });

  it('exports formatCountdown function', () => {
    expect(src).toContain('export function formatCountdown');
  });

  it('exports useServerClock hook', () => {
    expect(src).toContain('export function useServerClock');
  });

  it('exports useServerClockTick hook', () => {
    expect(src).toContain('export function useServerClockTick');
  });

  it('prioritises cancelledAt over settledAt and lifecycle', () => {
    expect(src).toContain('cancelledAt');
    expect(src).toMatch(/cancelledAt.*settledAt|cancelledAt.*ended|cancelledAt.*live/s);
  });

  it('prioritises settledAt over lifecycle', () => {
    expect(src).toContain('settledAt');
  });

  it('uses AppState for resync on app active', () => {
    expect(src).toContain('AppState');
    expect(src).toContain("'active'");
  });

  it('never produces negative countdown (uses Math.max(0, ...))', () => {
    expect(src).toContain('Math.max(0,');
  });

  it('progress uses (now - startsAt) / (endsAt - startsAt)', () => {
    expect(src).toContain('elapsed');
    expect(src).toContain('totalDuration');
    expect(src).toMatch(/elapsed\s*\/\s*totalDuration/);
  });
});

describe('VQ-10A PASS 2: Navigation contracts', () => {
  const src = readSrc('screens/AuctionHomeScreen.tsx');

  it('navigates to AuctionDetail with auctionId', () => {
    expect(src).toContain("navigation.navigate('AuctionDetail'");
    expect(src).toContain('auctionId');
  });

  it('navigates to CreateAuction', () => {
    expect(src).toContain("navigation.navigate('CreateAuction'");
  });

  it('navigates to MyBids', () => {
    expect(src).toContain("navigation.navigate('MyBids'");
  });
});

describe('VQ-10A PASS 2: Cursor pagination support', () => {
  const src = readSrc('screens/AuctionHomeScreen.tsx');

  it('tracks nextCursor state', () => {
    expect(src).toContain('nextCursor');
  });

  it('has loadMore function', () => {
    expect(src).toContain('loadMore');
  });

  it('deduplicates auction IDs on pagination', () => {
    expect(src).toContain('existingIds');
  });
});

describe('VQ-10A PASS 2: Visual hierarchy guardrails', () => {
  const src = readSrc('screens/AuctionHomeScreen.tsx');

  it('does not use MetricGrid', () => {
    expect(src).not.toContain('MetricGrid');
  });

  it('does not use uppercase labels everywhere', () => {
    expect(src).not.toMatch(/textTransform:\s*['"]uppercase['"]/);
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
    expect(src).toContain('formatCountdown');
  });
});
