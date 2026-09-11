import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import type { MarketCoOwnAsset, MarketCoOwnExecution, MarketHistoryItem, PriceCandle } from '../services/marketApi';
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

// ── gesture-handler + linear-gradient mocks: the commerce/detail barrel
// re-exports CommerceMediaHero → CommerceMediaStage, whose build nodes
// carry Flow syntax vitest cannot parse under node (same failure class
// as react-native-mmkv in setup.ts). The sections never render these. ──
vi.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: ({ children }: { children: React.ReactNode }) => children,
  PanGestureHandler: () => null,
  GestureDetector: ({ children }: { children: React.ReactNode }) => children,
  Gesture: { Pan: () => ({ onStart: () => ({ onUpdate: () => ({ onEnd: () => ({ runOnJS: () => ({}) }) }) }) }) },
}));
vi.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children: React.ReactNode }) => children,
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

  it('fetches history with the mapped interval/limit and an explicit window for the active range', async () => {
    fetchCoOwnPriceHistory.mockResolvedValue({ interval: '4h', candles: [] });
    renderOverview({ candleRange: '1W' });
    await act(async () => {});
    // F11: each range passes an explicit from/to window so a label can
    // never silently return an arbitrary latest-N slice.
    expect(fetchCoOwnPriceHistory).toHaveBeenCalledWith(
      'asset-1',
      expect.objectContaining({ interval: '4h', limit: 42 }),
    );
    const call = fetchCoOwnPriceHistory.mock.calls.at(-1)?.[1] as { from: string; to: string };
    expect(typeof call.from).toBe('string');
    expect(typeof call.to).toBe('string');
    const spanDays = (new Date(call.to).getTime() - new Date(call.from).getTime()) / 86_400_000;
    expect(spanDays).toBeGreaterThanOrEqual(6.9);
    expect(spanDays).toBeLessThan(7.1);
  });

  it('maps 1M to daily and 1D to hourly with bounded windows', async () => {
    fetchCoOwnPriceHistory.mockResolvedValue({ interval: '1d', candles: [] });
    renderOverview({ candleRange: '1M' });
    await act(async () => {});
    expect(fetchCoOwnPriceHistory).toHaveBeenLastCalledWith(
      'asset-1',
      expect.objectContaining({ interval: '1d', limit: 30 }),
    );

    fetchCoOwnPriceHistory.mockResolvedValue({ interval: '1h', candles: [] });
    renderOverview({ candleRange: '1D' });
    await act(async () => {});
    expect(fetchCoOwnPriceHistory).toHaveBeenLastCalledWith(
      'asset-1',
      expect.objectContaining({ interval: '1h', limit: 48 }),
    );
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

  it('keeps non-default range visibly unavailable when the history fetch rejects', async () => {
    fetchCoOwnPriceHistory.mockRejectedValue(new Error('network down'));
    renderOverview({ candleRange: '1M', candleData: embedded });
    await act(async () => {});
    // F12: the chart stays mounted through failure — its empty state owns
    // the messaging. The data contract must still be empty, never the
    // embedded one-week candles relabelled as another range.
    const lastRender = candleChartRenderProps.current.at(-1);
    expect(lastRender).toBeDefined();
    expect(lastRender!.candles).toHaveLength(0);
  });

  it('keeps non-default range visibly unavailable when history comes back empty', async () => {
    fetchCoOwnPriceHistory.mockResolvedValue({ interval: '1w', candles: [] });
    renderOverview({ candleRange: 'ALL', candleData: embedded });
    await act(async () => {});
    const lastRender = candleChartRenderProps.current.at(-1);
    expect(lastRender!.candles).toHaveLength(0);
  });

  it('honors an empty successful one-week response instead of restoring embedded candles', async () => {
    fetchCoOwnPriceHistory.mockResolvedValue({ interval: '4h', candles: [] });
    const renderer = renderOverview({ candleRange: '1W', candleData: embedded });
    await act(async () => {});
    expect(lastChartCandles()).toEqual([]);
    expect(hasText(renderer, 'Saved history')).toBe(false);
  });

  it('labels the saved one-week history after failure and retries the live fetch', async () => {
    fetchCoOwnPriceHistory.mockRejectedValueOnce(new Error('offline'));
    const renderer = renderOverview({ candleRange: '1W', candleData: embedded });
    await act(async () => {});
    expect(lastChartCandles()).toEqual(embedded);
    expect(hasText(renderer, 'Saved history')).toBe(true);
    const retry = renderer.root.findAll(node =>
      node.props.accessibilityLabel === 'Retry price history'
      && typeof node.props.onPress === 'function')[0];
    expect(retry).toBeDefined();
    fetchCoOwnPriceHistory.mockResolvedValue({ interval: '4h', candles: [makePriceCandle()] });
    await act(async () => retry.props.onPress());
    expect(fetchCoOwnPriceHistory).toHaveBeenCalledTimes(2);
    expect(lastChartCandles()![0].o).toBe(12.5);
    expect(hasText(renderer, 'Saved history')).toBe(false);
    expect(hasText(renderer, 'Retry price history')).toBe(false);
  });

  it('never renders the previous range history under a new range while loading', async () => {
    fetchCoOwnPriceHistory.mockResolvedValueOnce({
      interval: '1d',
      candles: [makePriceCandle({ openGbpMinor: 9900, closeGbpMinor: 9900, highGbpMinor: 9900, lowGbpMinor: 9900 })],
    });
    const renderer = renderOverview({ candleRange: '1M', candleData: embedded });
    await act(async () => {});
    expect(lastChartCandles()![0].o).toBe(99);

    // Switch range with a never-resolving fetch: the chart stays mounted
    // (F12) but must show neither the previous range (o: 99) nor the
    // embedded one-week data relabelled as 1D — its data contract goes
    // empty while the new range loads.
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
    const lastRender = candleChartRenderProps.current.at(-1);
    expect(lastRender).toBeDefined();
    expect(lastRender!.range).toBe('1D');
    expect(lastRender!.candles).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// B. AssetMarketSection — execution tape + 24h stats strip
// ═══════════════════════════════════════════════════════════════════
function renderMarket(asset: MarketCoOwnAsset, extraProps: Record<string, unknown> = {}) {
  return renderTree(React.createElement(AssetMarketSection, {
    asset,
    orderBook: null,
    orderBookStreaming: false,
    orderBookError: false,
    onRetryOrderBook: noop,
    bestBid: null,
    bestAsk: null,
    spreadGbp: null,
    depthStatusLabel: 'Live depth',
    reconciliationActive: false,
    isOffline: false,
    onOpenPriceAlert: noop,
    onSelectOrderBookLevel: noop,
    lifecycleState: 'secondaryTrading',
    ...extraProps,
  }));
}

describe('AssetMarketSection', () => {

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
    // Switch to the Tape tab (default view is Ladder)
    act(() => {
      const tapeTab = renderer.root.findByProps({ accessibilityLabel: 'Order book view: tape' });
      tapeTab.props.onPress();
    });
    expect(hasText(renderer, 'Executions unavailable')).toBe(false);
    const priceHits = getAllText(renderer).filter((t) => t.includes('10.5')).length;
    expect(priceHits).toBeGreaterThanOrEqual(3);
  });

  it('shows a quiet inline error when the tape fetch fails', async () => {
    listCoOwnExecutions.mockRejectedValue(new Error('offline'));
    const renderer = renderMarket(makeAsset());
    await act(async () => {});
    // Switch to the Tape tab (default view is Ladder)
    act(() => {
      const tapeTab = renderer.root.findByProps({ accessibilityLabel: 'Order book view: tape' });
      tapeTab.props.onPress();
    });
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
// C. AssetMarketSection — Your Open Orders panel
// ═══════════════════════════════════════════════════════════════════
describe('AssetMarketSection — open orders panel', () => {
  function makeOpenOrder(overrides: Partial<MarketHistoryItem> = {}): MarketHistoryItem {
    return {
      id: 'hist-1',
      channel: 'co-own',
      action: 'buy-units',
      referenceId: 'asset-1',
      amountGbp: 100,
      units: 10,
      filledUnits: 0,
      remainingUnits: 10,
      unitPriceGbp: 10,
      feeGbp: 1.5,
      status: 'open',
      orderType: 'limit',
      note: null,
      timestamp: '2026-09-07T10:00:00Z',
      orderId: 42,
      ...overrides,
    } as MarketHistoryItem;
  }

  it('renders open orders with side, price, and remaining units', async () => {
    listCoOwnExecutions.mockResolvedValue({ ok: true, serverTimestamp: 'x', items: [] });
    const renderer = renderMarket(makeAsset(), {
      yourOpenOrders: [
        makeOpenOrder({ action: 'buy-units', unitPriceGbp: 10, remainingUnits: 7, units: 10, orderId: 42 }),
        makeOpenOrder({ id: 'hist-2', action: 'sell-units', unitPriceGbp: 11, remainingUnits: 3, units: 3, orderId: 43 }),
      ],
    });
    await act(async () => {});
    expect(hasText(renderer, 'Buy')).toBe(true);
    expect(hasText(renderer, 'Sell')).toBe(true);
    const text = getAllText(renderer).join('');
    expect(text).toContain('7/10u');
    expect(text).toContain('3/3u');
  });

  it('shows "No resting orders" when the list is empty', async () => {
    listCoOwnExecutions.mockResolvedValue({ ok: true, serverTimestamp: 'x', items: [] });
    const renderer = renderMarket(makeAsset(), {
      yourOpenOrders: [],
    });
    await act(async () => {});
    expect(hasText(renderer, 'No resting orders on this asset')).toBe(true);
  });

  it('shows unavailable line when the open-orders fetch failed', async () => {
    listCoOwnExecutions.mockResolvedValue({ ok: true, serverTimestamp: 'x', items: [] });
    const renderer = renderMarket(makeAsset(), {
      yourOpenOrders: null,
      yourOpenOrdersFailed: true,
    });
    await act(async () => {});
    expect(hasText(renderer, 'Open orders unavailable')).toBe(true);
  });

  it('omits the open-orders panel entirely for anonymous viewers', async () => {
    listCoOwnExecutions.mockResolvedValue({ ok: true, serverTimestamp: 'x', items: [] });
    const renderer = renderMarket(makeAsset(), {
      yourOpenOrders: null,
      yourOpenOrdersFailed: false,
    });
    await act(async () => {});
    expect(hasText(renderer, 'Your open orders')).toBe(false);
    expect(hasText(renderer, 'No resting orders')).toBe(false);
  });

  it('renders a Cancel control for each open order with an orderId', async () => {
    listCoOwnExecutions.mockResolvedValue({ ok: true, serverTimestamp: 'x', items: [] });
    const cancelSpy = vi.fn();
    const renderer = renderMarket(makeAsset(), {
      yourOpenOrders: [makeOpenOrder({ orderId: 99 })],
      onCancelOrder: cancelSpy,
    });
    await act(async () => {});
    expect(hasText(renderer, 'Cancel')).toBe(true);
  });

  it('shows a spinner instead of Cancel when an order is being cancelled', async () => {
    listCoOwnExecutions.mockResolvedValue({ ok: true, serverTimestamp: 'x', items: [] });
    const renderer = renderMarket(makeAsset(), {
      yourOpenOrders: [makeOpenOrder({ orderId: 99 })],
      onCancelOrder: vi.fn(),
      cancellingOrderId: 99,
    });
    await act(async () => {});
    // Cancel text is hidden while cancelling
    expect(hasText(renderer, 'Cancel')).toBe(false);
  });

  it('shows a loading spinner when yourOpenOrdersLoading is true', async () => {
    listCoOwnExecutions.mockResolvedValue({ ok: true, serverTimestamp: 'x', items: [] });
    const renderer = renderMarket(makeAsset(), {
      yourOpenOrders: null,
      yourOpenOrdersLoading: true,
    });
    await act(async () => {});
    expect(hasText(renderer, 'Your open orders')).toBe(true);
    // No content rows, no empty message — just the loading state
    expect(hasText(renderer, 'No resting orders')).toBe(false);
    expect(hasText(renderer, 'Open orders unavailable')).toBe(false);
  });

  it('does not render a phantom spinner for orders with orderId null', async () => {
    listCoOwnExecutions.mockResolvedValue({ ok: true, serverTimestamp: 'x', items: [] });
    const renderer = renderMarket(makeAsset(), {
      yourOpenOrders: [makeOpenOrder({ orderId: null })],
      onCancelOrder: vi.fn(),
      cancellingOrderId: null,
    });
    await act(async () => {});
    // The order row renders but no Cancel button (orderId is null)
    // and no phantom spinner (cancellingOrderId is null, not matching)
    expect(hasText(renderer, 'Cancel')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════
// D. AssetOwnershipSection — holder count transparency
// ═══════════════════════════════════════════════════════════════════
describe('AssetOwnershipSection — holder count', () => {
  function renderOwnershipHolderCount(holderCount: number | null | undefined) {
    return renderTree(React.createElement(AssetOwnershipSection, {
      isHolder: false,
      yourUnits: 0,
      viewerPct: null,
      positionValueGbp: null,
      avgEntryPriceGbp: null,
      unrealizedPnlGbp: null,
      unrealizedPnlPct: null,
      yourSegmentPct: 0,
      otherHoldersSegmentPct: 60,
      availableSegmentPct: 40,
      availableUnits: 400,
      totalUnits: 1000,
      holderCount,
      onOpenRights: noop,
      lastDistribution: null,
      lastDistributionAmount: null,
      lastDistributionDate: null,
      lastDistributionPerUnit: null,
      onNavigateToDistributionHistory: noop,
      corporateActions: null,
      onNavigateToCorporateAction: noop,
      onOpenBuyout: noop,
    }));
  }

  function toggleBreakdown(renderer: TestRenderer.ReactTestRenderer) {
    const disclosure = renderer.root.findAll(node =>
      node.props.accessibilityLabel === 'Ownership breakdown'
      && typeof node.props.onPress === 'function')[0];
    act(() => disclosure.props.onPress());
    return renderer.root.findAll(node =>
      node.props.accessibilityLabel === 'Ownership breakdown'
      && typeof node.props.onPress === 'function')[0];
  }

  it('reveals holder count and allocated units on demand and collapses them again', () => {
    const renderer = renderOwnershipHolderCount(12);
    expect(hasText(renderer, 'Co-owners')).toBe(false);
    expect(toggleBreakdown(renderer).props.accessibilityState.expanded).toBe(true);
    const text = getAllText(renderer).join('');
    expect(text).toContain('Co-owners12');
    expect(text).toContain('Allocated units600');
    expect(toggleBreakdown(renderer).props.accessibilityState.expanded).toBe(false);
    expect(hasText(renderer, 'Co-owners')).toBe(false);
  });

  it('preserves a single holder in the expanded breakdown', () => {
    const renderer = renderOwnershipHolderCount(1);
    toggleBreakdown(renderer);
    const text = getAllText(renderer).join('');
    expect(text).toContain('Co-owners1');
  });

  it('omits the holder count line when holderCount is null', () => {
    const renderer = renderOwnershipHolderCount(null);
    toggleBreakdown(renderer);
    const text = getAllText(renderer).join('');
    expect(text).not.toContain('Co-owners');
    expect(text).toContain('Allocated units600');
  });

  it('renders zero holders as a valid state (not hidden)', () => {
    const renderer = renderOwnershipHolderCount(0);
    toggleBreakdown(renderer);
    const text = getAllText(renderer).join('');
    expect(text).toContain('Co-owners0');
  });
});

// ═══════════════════════════════════════════════════════════════════
// E. AssetOwnershipSection — fail-visible states
// ═══════════════════════════════════════════════════════════════════
describe('AssetOwnershipSection — fail-visible states', () => {
  function renderOwnership(props: Record<string, unknown> = {}) {
    return renderTree(React.createElement(AssetOwnershipSection, {
      isHolder: true,
      yourUnits: 10,
      viewerPct: 1,
      positionValueGbp: 90,
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

  it('shows a refresh failure when the corporate-actions fetch failed', () => {
    const renderer = renderOwnership({ corporateActions: null, corporateActionsFailed: true });
    expect(hasText(renderer, 'Events could not be refreshed')).toBe(true);
  });

  it('omits the events block entirely when actions are genuinely absent', () => {
    const renderer = renderOwnership({ corporateActions: [], corporateActionsFailed: false });
    expect(hasText(renderer, 'Events could not be refreshed')).toBe(false);
    expect(hasText(renderer, 'Ownership events')).toBe(false);
  });

  it('shows "Distribution history unavailable" when the distributions fetch failed', () => {
    const renderer = renderOwnership({ lastDistribution: null, distributionsFailed: true });
    expect(hasText(renderer, 'Distribution history unavailable')).toBe(true);
  });

  it('keeps the plain empty state when distributions simply do not exist', () => {
    const renderer = renderOwnership({ lastDistribution: null, distributionsFailed: false });
    expect(hasText(renderer, 'Distribution history unavailable')).toBe(false);
    expect(hasText(renderer, 'No distributions yet')).toBe(true);
  });

  it('does not infer unrestricted selling when the holding period is unknown', () => {
    const renderer = renderOwnership({ lockupEndDate: null });
    expect(hasText(renderer, 'No lockup')).toBe(false);
    expect(hasText(renderer, 'Lockup ended')).toBe(false);
    expect(hasText(renderer, 'Holding period')).toBe(false);
    expect(hasText(renderer, 'Full rights agreement')).toBe(true);
  });

  it('distinguishes unreserved units from units reserved in orders', () => {
    const renderer = renderOwnership({ sellableUnits: 7, reservedUnits: 3 });
    const text = getAllText(renderer).join('');
    expect(text).toContain('Unreserved units7 units');
    expect(text).toContain('Reserved in orders3 units');
  });

  it('keeps an unresolved position distinct from owning no units', () => {
    const renderer = renderOwnership({ isHolder: false, yourUnits: null });
    expect(hasText(renderer, 'Your position is unavailable')).toBe(true);
    expect(hasText(renderer, 'You do not own units')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════
// F. Contract surface — the fetchers the new backend routes back
// ═══════════════════════════════════════════════════════════════════
describe('marketApi contract surface', () => {
  it('exposes the fetchers backing the new backend routes', async () => {
    const api = await import('../services/marketApi');
    expect(typeof api.fetchCoOwnDistributions).toBe('function');
    expect(typeof api.fetchCoOwnAssetCorporateActions).toBe('function');
    expect(typeof api.fetchCoOwnPriceHistory).toBe('function');
    expect(typeof api.listCoOwnExecutions).toBe('function');
    expect(typeof api.cancelCoOwnOrder).toBe('function');
    expect(typeof api.listCoOwnAssets).toBe('function');
  });
});

// ═══════════════════════════════════════════════════════════════════
// E. Position resolution state machine (P0 lockout prevention)
// ═══════════════════════════════════════════════════════════════════
describe('Position resolution state machine', () => {
  function resolveYourUnits(
    currentUserId: string | null | undefined,
    holdingsData: Array<{ assetId: string; unitsOwned: number }> | undefined,
    targetAssetId: string
  ): number | null {
    const yourHolding = holdingsData?.find((entry) => entry.assetId === targetAssetId) ?? null;
    return currentUserId
      ? (holdingsData ? (yourHolding?.unitsOwned ?? 0) : null)
      : 0;
  }

  it('resolves to 0 (tradable non-holder) for logged-in user with no units once holdings arrive', () => {
    const result = resolveYourUnits('user-1', [], 'asset-42');
    expect(result).toBe(0);
  });

  it('resolves to unitsOwned when user holds units in the asset', () => {
    const result = resolveYourUnits('user-1', [{ assetId: 'asset-42', unitsOwned: 15 }], 'asset-42');
    expect(result).toBe(15);
  });

  it('resolves to null (unresolved position) while holdings data is loading', () => {
    const result = resolveYourUnits('user-1', undefined, 'asset-42');
    expect(result).toBeNull();
  });

  it('resolves to 0 for logged-out / anonymous visitor', () => {
    const result = resolveYourUnits(null, undefined, 'asset-42');
    expect(result).toBe(0);
  });
});
