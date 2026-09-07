import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import type { MarketCoOwnAsset, MarketCoOwnExecution, PriceCandle } from '../services/marketApi';
import type { CandleDataPoint } from '../components/coown/asset-detail/types';
import type { CoOwnCandleRange } from '../components/coown';

// ── Theme mock (extends the commerceDetailRuntime pattern with the
// financial-direction tokens the sections consume) ──
vi.mock('../theme/ThemeContext', () => {
  const React = require('react');
  const mockColors = {
    background: '#ffffff',
    surface: '#f5f5f5',
    surfaceElevated: '#ffffff',
    surfaceAlt: '#f0f0f0',
    textPrimary: '#000000',
    textSecondary: '#666666',
    textMuted: '#999999',
    textInverse: '#ffffff',
    border: '#e0e0e0',
    borderSubtle: '#f0f0f0',
    brand: '#111111',
    brandSubtle: '#eeeeee',
    success: '#215634',
    successSubtle: '#e7f2ea',
    warning: '#ffc765',
    warningSubtle: '#fff6e5',
    danger: '#9b0202',
    coownUp: '#1C5631',
    coownDown: '#5F1616',
    coownUpSubtle: '#e7f2ea',
    coownUpBorder: '#bfe3cd',
  };
  const ctx = {
    themePreference: 'light' as const,
    resolvedTheme: 'light' as const,
    colors: mockColors,
    isDark: false,
    setThemePreference: () => {},
  };
  return {
    ThemeProvider: ({ children }: { children: React.ReactNode }) =>
      React.createElement('ThemeProvider', null, children),
    useAppTheme: () => ctx,
  };
});

// ── useReducedMotion mock: CommerceDetailDisclosureRow consumes it via
// the accessibility-preferences provider, which the test doesn't mount. ──
vi.mock('../hooks/useReducedMotion', () => ({
  useReducedMotion: () => true,
}));

// ── marketApi mock: real module for types, mocked fetchers ──
const fetchCoOwnPriceHistory = vi.fn();
const listCoOwnExecutions = vi.fn();

vi.mock('../services/marketApi', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    fetchCoOwnPriceHistory: (...args: unknown[]) => fetchCoOwnPriceHistory(...args),
    listCoOwnExecutions: (...args: unknown[]) => listCoOwnExecutions(...args),
  };
});

// ── Coown barrel mock: the barrel transitively pulls Skia. The sections
// consume exactly these three exports; chart and ladder become stubs. ──
const candleChartRenderProps: { current: Array<{ candles: unknown[]; range: string; showVolume: boolean }> } = { current: [] };
vi.mock('../components/coown', () => {
  const React = require('react');
  return {
    CoOwnCandleChart: (props: { candles: unknown[]; range: string; showVolume: boolean }) => {
      candleChartRenderProps.current.push(props);
      return React.createElement('CoOwnCandleChartStub', { candlesJson: JSON.stringify(props.candles) });
    },
    CoOwnOrderBook: (props: Record<string, unknown>) => React.createElement('CoOwnOrderBookStub', props),
    CoOwnCorporateActionRow: (props: Record<string, unknown>) => React.createElement('View', props),
  };
});

// ── expo-video mock: resolveAssetSource imports an RN internals path
// that does not resolve under node. ──
vi.mock('expo-video', () => ({
  useVideoPlayer: () => ({}),
  VideoView: () => null,
}));

// ── FlashList mock: the commerce/detail barrel re-exports
// RelatedItemsRail, whose FlashList build node cannot parse (same class
// of issue as react-native-mmkv in setup.ts). The sections never render
// a FlashList. ──
vi.mock('@shopify/flash-list', () => ({
  FlashList: () => null,
}));

// ── BottomSheet mock: pulls react-native-reanimated, whose build node
// cannot parse. The barrel re-exports MakeOfferSheet which imports it. ──
vi.mock('../components/BottomSheet', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));

import { AssetOverviewSection } from '../components/coown/asset-detail/AssetOverviewSection';
import { AssetMarketSection } from '../components/coown/asset-detail/AssetMarketSection';
import { AssetOwnershipSection } from '../components/coown/asset-detail/AssetOwnershipSection';

// ── Render helpers (same pattern as commerceDetailRuntime.test.tsx) ──
function renderTree(el: React.ReactElement): TestRenderer.ReactTestRenderer {
  let renderer: TestRenderer.ReactTestRenderer | null = null;
  act(() => {
    renderer = TestRenderer.create(el);
  });
  return renderer!;
}

function findTextInstances(node: TestRenderer.ReactTestInstance | string | null): string[] {
  if (typeof node === 'string') return [node];
  if (!node) return [];
  const instances: string[] = [];
  const children = node.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      if (typeof child === 'string') instances.push(child);
      else if (child && typeof child === 'object') instances.push(...findTextInstances(child as TestRenderer.ReactTestInstance));
    }
  }
  return instances;
}

function getAllText(renderer: TestRenderer.ReactTestRenderer): string[] {
  return findTextInstances(renderer.root);
}

function hasText(renderer: TestRenderer.ReactTestRenderer, text: string): boolean {
  return getAllText(renderer).some((t) => t.includes(text));
}

function lastChartCandles(): Array<Record<string, unknown>> | null {
  const last = candleChartRenderProps.current[candleChartRenderProps.current.length - 1];
  if (!last) return null;
  const raw = (last as { candles?: unknown }).candles;
  return Array.isArray(raw) ? (raw as Array<Record<string, unknown>>) : null;
}

const noop = () => {};

function makeAsset(overrides: Partial<MarketCoOwnAsset> = {}): MarketCoOwnAsset {
  return {
    id: 'asset-1',
    listingId: 'listing-1',
    issuerId: 'issuer-1',
    title: 'Fractional Vault Asset',
    imageUrl: null,
    totalUnits: 1000,
    availableUnits: 400,
    unitPriceGbp: 10,
    unitPriceStable: 10,
    settlementMode: 'ONEZE',
    issuerJurisdiction: null,
    marketMovePct24h: null,
    holders: 12,
    volume24hGbp: null,
    isOpen: true,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-07T09:00:00Z',
    ...overrides,
  } as MarketCoOwnAsset;
}

function makeExecution(overrides: Partial<MarketCoOwnExecution> = {}): MarketCoOwnExecution {
  return {
    id: 1,
    assetId: 'asset-1',
    units: 5,
    unitPriceGbp: 10.5,
    notionalGbp: 52.5,
    executedAt: '2026-09-07T10:00:00Z',
    settlementStatus: 'settled',
    ...overrides,
  };
}

function makePriceCandle(overrides: Partial<PriceCandle> = {}): PriceCandle {
  return {
    timestamp: '2026-09-07T09:00:00Z',
    openGbpMinor: 1250,
    highGbpMinor: 1300,
    lowGbpMinor: 1200,
    closeGbpMinor: 1275,
    volumeUnits: 40,
    tradeCount: 2,
    ...overrides,
  } as PriceCandle;
}

beforeEach(() => {
  fetchCoOwnPriceHistory.mockReset();
  listCoOwnExecutions.mockReset();
  candleChartRenderProps.current = [];
});

// ═══════════════════════════════════════════════════════════════════
// A. AssetOverviewSection — ranged price history
// ═══════════════════════════════════════════════════════════════════
describe('AssetOverviewSection — ranged price history', () => {
  const embedded: CandleDataPoint[] = [{ t: 1, o: 10, h: 11, l: 9, c: 10, v: 5 }];

  function renderOverview(overrides: {
    asset?: MarketCoOwnAsset;
    candleRange?: CoOwnCandleRange;
    candleData?: CandleDataPoint[];
  } = {}) {
    return renderTree(React.createElement(AssetOverviewSection, {
      asset: overrides.asset ?? makeAsset(),
      candleData: overrides.candleData ?? embedded,
      candleRange: overrides.candleRange ?? '1W',
      onCandleRangeChange: noop,
      showVolume: false,
      lastExecutionPriceGbp: null,
      appraisedValuePerUnitGbp: null,
      referenceVsAppraisalPct: null,
      dossierDocuments: [],
      hasDocuments: false,
      onOpenDiligence: noop,
      onOpenRiskDisclosure: noop,
      lifecycleState: 'secondaryTrading',
    }));
  }

  it('fetches history with the mapped interval/limit for the active range', async () => {
    fetchCoOwnPriceHistory.mockResolvedValue({ interval: '4h', candles: [] });
    renderOverview({ candleRange: '1W' });
    await act(async () => {});
    expect(fetchCoOwnPriceHistory).toHaveBeenCalledWith('asset-1', { interval: '4h', limit: 42 });
  });

  it('maps 1M to daily and 1D to hourly', async () => {
    fetchCoOwnPriceHistory.mockResolvedValue({ interval: '1d', candles: [] });
    renderOverview({ candleRange: '1M' });
    await act(async () => {});
    expect(fetchCoOwnPriceHistory).toHaveBeenLastCalledWith('asset-1', { interval: '1d', limit: 30 });

    fetchCoOwnPriceHistory.mockResolvedValue({ interval: '1h', candles: [] });
    renderOverview({ candleRange: '1D' });
    await act(async () => {});
    expect(fetchCoOwnPriceHistory).toHaveBeenLastCalledWith('asset-1', { interval: '1h', limit: 48 });
  });

  it('renders history candles converted from minor units to GBP', async () => {
    fetchCoOwnPriceHistory.mockResolvedValue({ interval: '1d', candles: [makePriceCandle()] });
    renderOverview({ candleRange: '1M' });
    await act(async () => {});
    const candles = lastChartCandles();
    expect(candles).not.toBeNull();
    expect(candles![0].o).toBe(12.5);
    expect(candles![0].c).toBe(12.75);
    expect(candles![0].v).toBe(40);
  });

  it('falls back to embedded candles when the history fetch rejects', async () => {
    fetchCoOwnPriceHistory.mockRejectedValue(new Error('network down'));
    renderOverview({ candleRange: '1M', candleData: embedded });
    await act(async () => {});
    const candles = lastChartCandles();
    expect(candles).not.toBeNull();
    expect(candles![0].o).toBe(10);
  });

  it('falls back to embedded candles when history comes back empty', async () => {
    fetchCoOwnPriceHistory.mockResolvedValue({ interval: '1w', candles: [] });
    renderOverview({ candleRange: 'ALL', candleData: embedded });
    await act(async () => {});
    const candles = lastChartCandles();
    expect(candles).not.toBeNull();
    expect(candles![0].o).toBe(10);
  });

  it('never renders the previous range history under a new range while loading', async () => {
    fetchCoOwnPriceHistory.mockResolvedValueOnce({
      interval: '1d',
      candles: [makePriceCandle({ openGbpMinor: 9900, closeGbpMinor: 9900, highGbpMinor: 9900, lowGbpMinor: 9900 })],
    });
    const renderer = renderOverview({ candleRange: '1M', candleData: embedded });
    await act(async () => {});
    expect(lastChartCandles()![0].o).toBe(99);

    // Switch range with a never-resolving fetch: the chart must show the
    // embedded fallback (o: 10), never the previous range (o: 99).
    fetchCoOwnPriceHistory.mockReturnValue(new Promise(() => {}));
    await act(async () => {
      renderer.update(React.createElement(AssetOverviewSection, {
        asset: makeAsset(),
        candleData: embedded,
        candleRange: '1D',
        onCandleRangeChange: noop,
        showVolume: false,
        lastExecutionPriceGbp: null,
        appraisedValuePerUnitGbp: null,
        referenceVsAppraisalPct: null,
        dossierDocuments: [],
        hasDocuments: false,
        onOpenDiligence: noop,
        onOpenRiskDisclosure: noop,
        lifecycleState: 'secondaryTrading',
      }));
    });
    const candles = lastChartCandles();
    expect(candles).not.toBeNull();
    expect(candles![0].o).toBe(10);
  });
});

// ═══════════════════════════════════════════════════════════════════
// B. AssetMarketSection — execution tape + 24h stats strip
// ═══════════════════════════════════════════════════════════════════
describe('AssetMarketSection', () => {
  function renderMarket(asset: MarketCoOwnAsset) {
    return renderTree(React.createElement(AssetMarketSection, {
      asset,
      orderBook: null,
      orderBookStreaming: false,
      orderBookHasGap: false,
      orderBookError: false,
      onRetryOrderBook: noop,
      bestBid: null,
      bestAsk: null,
      spreadGbp: null,
      depthStatusLabel: 'Live depth',
      reconciliationActive: false,
      isOffline: false,
      onOpenSupply: noop,
      onOpenPriceAlert: noop,
      onSelectOrderBookLevel: noop,
      lifecycleState: 'secondaryTrading',
    }));
  }

  it('renders only settled executions on the tape', async () => {
    listCoOwnExecutions.mockResolvedValue({
      ok: true,
      serverTimestamp: '2026-09-07T10:00:00Z',
      items: [
        makeExecution({ id: 1, settlementStatus: 'settled' }),
        makeExecution({ id: 2, settlementStatus: 'failed' }),
        makeExecution({ id: 3, settlementStatus: 'settled' }),
        makeExecution({ id: 4, settlementStatus: 'reversed' }),
        makeExecution({ id: 5, settlementStatus: 'settled' }),
      ],
    });
    const renderer = renderMarket(makeAsset());
    await act(async () => {});
    expect(hasText(renderer, 'Executions unavailable')).toBe(false);
    const priceHits = getAllText(renderer).filter((t) => t.includes('10.5')).length;
    expect(priceHits).toBeGreaterThanOrEqual(3);
  });

  it('shows a quiet inline error when the tape fetch fails', async () => {
    listCoOwnExecutions.mockRejectedValue(new Error('offline'));
    const renderer = renderMarket(makeAsset());
    await act(async () => {});
    expect(hasText(renderer, 'Executions unavailable')).toBe(true);
  });

  it('omits null segments from the 24h stats strip', async () => {
    listCoOwnExecutions.mockResolvedValue({ ok: true, serverTimestamp: 'x', items: [] });
    const renderer = renderMarket(makeAsset({
      marketMovePct24h: 1.5,
      volume24hGbp: null,
      marketSnapshot: null,
    }));
    await act(async () => {});
    // The strip renders label/value as separate text nodes ("24h", "+",
    // "1.5", "%"); the volume segment is absent entirely.
    const text = getAllText(renderer).join('\n');
    expect(text).toContain('24h');
    expect(text).toContain('+');
    expect(text).toContain('1.5');
    expect(text).toContain('%');
    expect(text).not.toContain('Vol ');
  });

  it('renders no stats strip when every 24h field is null', async () => {
    listCoOwnExecutions.mockResolvedValue({ ok: true, serverTimestamp: 'x', items: [] });
    const renderer = renderMarket(makeAsset({
      marketMovePct24h: null,
      volume24hGbp: null,
      marketSnapshot: null,
      bestBidGbp: null,
      bestAskGbp: null,
    }));
    await act(async () => {});
    // No strip segments: no "24h" label and no "Spread {value}" segment
    // ("Spread unavailable" from the quote line is not a strip segment).
    const text = getAllText(renderer).join('\n');
    expect(text).not.toContain('24h');
    expect(text).not.toMatch(/Spread \d/);
  });
});

// ═══════════════════════════════════════════════════════════════════
// C. AssetOwnershipSection — fail-visible states
// ═══════════════════════════════════════════════════════════════════
describe('AssetOwnershipSection — fail-visible states', () => {
  function renderOwnership(props: Record<string, unknown> = {}) {
    return renderTree(React.createElement(AssetOwnershipSection, {
      isHolder: true,
      yourUnits: 10,
      viewerPct: 1,
      avgEntryPriceGbp: 9,
      unrealizedPnlGbp: 1,
      unrealizedPnlPct: 1,
      yourSegmentPct: 1,
      otherHoldersSegmentPct: 59,
      availableSegmentPct: 40,
      availableUnits: 400,
      totalUnits: 1000,
      onOpenRights: noop,
      lastDistribution: null,
      lastDistributionAmount: null,
      lastDistributionDate: null,
      lastDistributionPerUnit: null,
      onNavigateToDistributionHistory: noop,
      corporateActions: null,
      onNavigateToCorporateAction: noop,
      onOpenBuyout: noop,
      ...props,
    }));
  }

  it('shows "Events unavailable" when the corporate-actions fetch failed', () => {
    const renderer = renderOwnership({ corporateActions: null, corporateActionsFailed: true });
    expect(hasText(renderer, 'Events unavailable')).toBe(true);
  });

  it('omits the events block entirely when actions are genuinely absent', () => {
    const renderer = renderOwnership({ corporateActions: [], corporateActionsFailed: false });
    expect(hasText(renderer, 'Events unavailable')).toBe(false);
    expect(hasText(renderer, 'Corporate actions')).toBe(false);
  });

  it('shows "Distribution history unavailable" when the distributions fetch failed', () => {
    const renderer = renderOwnership({ lastDistribution: null, distributionsFailed: true });
    expect(hasText(renderer, 'Distribution history unavailable')).toBe(true);
  });

  it('keeps the plain empty state when distributions simply do not exist', () => {
    const renderer = renderOwnership({ lastDistribution: null, distributionsFailed: false });
    expect(hasText(renderer, 'Distribution history unavailable')).toBe(false);
    expect(hasText(renderer, 'No distributions settled yet')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// D. Contract surface — the fetchers the new backend routes back
// ═══════════════════════════════════════════════════════════════════
describe('marketApi contract surface', () => {
  it('exposes the fetchers backing the new backend routes', async () => {
    const api = await import('../services/marketApi');
    expect(typeof api.fetchCoOwnDistributions).toBe('function');
    expect(typeof api.fetchCoOwnAssetCorporateActions).toBe('function');
    expect(typeof api.fetchCoOwnPriceHistory).toBe('function');
    expect(typeof api.listCoOwnExecutions).toBe('function');
  });
});
