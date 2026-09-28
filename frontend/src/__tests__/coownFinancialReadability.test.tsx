/**
 * Audit 2026-09-28 — Task A: co-own financial readability (findings 10–14).
 *
 * Covers:
 *  1. CoOwnOrderBook responsive layout — measured width / fontScale below
 *     the rail breakpoint switches each level to a stacked two-line row
 *     (exact price, then units + running total). Quotes never truncate.
 *  2. Imbalance gauge — visible "Bid"/"Ask" end labels + scope caption so
 *     a monochrome screenshot explains it.
 *  3. AssetMarketSection — when the embedded ladder's spread band is on
 *     screen it owns the canonical quote; the section strip carries only
 *     the units resting at the top of the book. When the band is absent
 *     (tape/depth/error) the strip keeps the full bid/spread/ask row and
 *     no value is single-line-clamped.
 *  4. AssetDetailIdentity — dominant price has no shrink caps; the 24h
 *     move pill has three states (up/down/unchanged) with sign-aware
 *     rounding so a tiny negative never prints "-0.0%".
 *  5. Trading rules + sheet titles — static summary wraps (no clip) and
 *     AssetDetailModals titles carry no 1.3 font-multiplier cap.
 *
 * Mock preamble mirrors coownDistributionDepth.test.tsx / the setup.ts RN
 * mock, with a controllable useWindowDimensions so fontScale and width can
 * be varied per test.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import type { MarketCoOwnAsset } from '../services/marketApi';

// ── Controllable window dimensions (width + fontScale drive the F10
// responsive breakpoint inside CoOwnOrderBook). ──
const rnDims = vi.hoisted(() => ({
  current: { width: 375, height: 812, scale: 3, fontScale: 1 },
}));

// ── react-native mock (file-level): mirrors setup.ts / distributionDepth
// but exposes rnDims through useWindowDimensions and Dimensions. ──
vi.mock('react-native', async () => {
  const React = await import('react');
  const createMock = (name: string) =>
    React.forwardRef((props: any, ref: any) =>
      React.createElement(name, { ref, ...props })
    );
  return {
    View: createMock('View'),
    Text: createMock('Text'),
    TextInput: createMock('TextInput'),
    ScrollView: createMock('ScrollView'),
    Pressable: createMock('Pressable'),
    TouchableOpacity: createMock('TouchableOpacity'),
    ActivityIndicator: createMock('ActivityIndicator'),
    StyleSheet: {
      create: (s: any) => s,
      hairlineWidth: 0.5,
      absoluteFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    },
    Platform: { OS: 'ios', select: (obj: any) => obj.ios },
    Dimensions: { get: () => rnDims.current },
    useWindowDimensions: () => rnDims.current,
    I18nManager: {
      isRTL: false,
      forceRTL: vi.fn(),
      allowRTL: vi.fn(),
      swapLeftAndRightInRTL: vi.fn(),
    },
    Appearance: {
      getColorScheme: () => 'light',
      addChangeListener: () => ({ remove: () => {} }),
    },
    Linking: {
      openURL: vi.fn(),
      addEventListener: vi.fn(() => ({ remove: () => {} })),
      removeEventListener: vi.fn(),
      canOpenURL: vi.fn(async () => true),
    },
  };
});

// ── Theme mock — full financial palette incl. both subtle fills. ──
const mockColors = vi.hoisted(() => ({
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
  successText: '#215634',
  warning: '#ffc765',
  warningSubtle: '#fff6e5',
  warningText: '#8a5a00',
  danger: '#9b0202',
  dangerText: '#9b0202',
  coownUp: '#1C5631',
  coownDown: '#5F1616',
  coownUpSubtle: '#e7f2ea',
  coownUpBorder: '#bfe3cd',
  coownDownSubtle: '#fdeaea',
  coownDownBorder: '#eccaca',
}));

vi.mock('../theme/ThemeContext', () => {
  const React = require('react');
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

// ── commerce/detail barrel mock: cuts the native-chained module load
// while preserving the label/value text contract the sections render. ──
vi.mock('../components/commerce/detail', () => {
  const React = require('react');
  return {
    CommerceDetailSection: ({ label, children }: { label?: string; children?: React.ReactNode }) =>
      React.createElement('View', null, label, children),
    CommerceDetailUnavailableInline: ({ title, body }: { title?: string; body?: string }) =>
      React.createElement('View', null, title, body),
    CommerceDetailDisclosureRow: ({ label, onPress }: { label?: string; onPress?: () => void }) =>
      React.createElement('Pressable', { onPress, accessibilityRole: 'button' }, label),
    CommerceDetailMetricRow: ({ label, value, subLabel, trailing }: {
      label?: string;
      value?: React.ReactNode;
      subLabel?: string;
      trailing?: React.ReactNode;
    }) => React.createElement('View', null, label, value, subLabel ?? null, trailing ?? null),
    CommerceDetailIdentity: ({ title }: { title?: string }) =>
      React.createElement('View', null, title),
    CommerceDetailSellerRow: ({ name }: { name?: string }) =>
      React.createElement('View', null, name),
  };
});

// ── marketApi mock: AssetMarketSection calls listCoOwnExecutions at
// runtime; every other import from this module is type-only. Stubbing the
// module outright avoids loading apiClient → sentry → expo Flow source. ──
const listCoOwnExecutions = vi.fn();
vi.mock('../services/marketApi', () => ({
  listCoOwnExecutions: (...args: unknown[]) => listCoOwnExecutions(...args),
}));

// ── coown barrel mock: AssetMarketSection imports { CoOwnOrderBook,
// CoOwnDepthChart } from '../'. The barrel transitively pulls Skia, so the
// REAL CoOwnOrderBook is loaded from its own file and the depth chart is
// stubbed. The imbalance strip and stacked rows under test are real. ──
vi.mock('../components/coown', async () => {
  const React = require('react');
  const real = await import('../components/coown/CoOwnOrderBook');
  const stub = (name: string) => (props: Record<string, unknown>) =>
    React.createElement(name, props);
  return {
    CoOwnOrderBook: real.CoOwnOrderBook,
    CoOwnDepthChart: (props: Record<string, unknown>) =>
      React.createElement('CoOwnDepthChartStub', props),
    // AssetDetailModals re-exports its sheet bodies through the barrel —
    // stub them so the sheet TITLE nodes under test render in isolation.
    CoOwnFirstTradeGuide: stub('CoOwnFirstTradeGuide'),
    CoOwnRightsSheet: stub('CoOwnRightsSheet'),
    CoOwnRiskDisclosure: stub('CoOwnRiskDisclosure'),
    CoOwnSupplySheet: stub('CoOwnSupplySheet'),
    CoOwnOverflowSheet: stub('CoOwnOverflowSheet'),
    CoOwnPriceAlertForm: stub('CoOwnPriceAlertForm'),
    CoOwnAssetDossier: stub('CoOwnAssetDossier'),
  };
});

// ── AssetDetailModals dependency stubs (mirrors the runtime suite's
// BottomSheet passthrough convention). BottomSheet renders its children
// unconditionally so every sheet's header is inspectable in one render. ──
vi.mock('../components/BottomSheet', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
  BottomSheet: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('../components/product', () => ({
  FullscreenMediaViewer: () => null,
}));
vi.mock('../components/closet/SaveToCollectionModal', () => ({
  SaveToCollectionModal: () => null,
}));
vi.mock('../components/ShareSheet', () => ({
  ShareSheet: () => null,
}));
vi.mock('../components/coown/CoOwnAssetProspectus', () => ({
  CoOwnAssetProspectus: () => null,
}));
vi.mock('../components/common/AppIcon', () => {
  const React = require('react');
  return {
    AppIcon: (props: Record<string, unknown>) => React.createElement('AppIcon', props),
  };
});

import { CoOwnOrderBook } from '../components/coown/CoOwnOrderBook';
import { AssetMarketSection } from '../components/coown/asset-detail/AssetMarketSection';
import { AssetDetailIdentity } from '../components/coown/asset-detail/AssetDetailIdentity';
import { AssetDetailModals } from '../components/coown/asset-detail/AssetDetailModals';

// ── Render helpers (same pattern as the existing coown suites) ──
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
      else if (child && typeof child === 'object')
        instances.push(...findTextInstances(child as TestRenderer.ReactTestInstance));
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
    conditionGrade: null,
    legalVehicleName: null,
    marketSnapshot: null,
    issuer: null,
    issuerVerification: null,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-07T09:00:00Z',
    ...overrides,
  } as MarketCoOwnAsset;
}

function renderIdentity(overrides: Record<string, unknown> = {}) {
  return renderTree(React.createElement(AssetDetailIdentity, {
    asset: makeAsset(),
    isVeryCompact: false,
    dominantPriceValue: 42,
    dominantPriceLabel: 'Reference',
    dominantPriceTimestamp: null,
    movePct24h: null,
    isInitialOffering: false,
    allocatedPct: 60,
    availableUnits: 400,
    reconciliationActive: false,
    dataStale: false,
    dataStaleAgeLabel: null,
    lifecycleState: 'secondaryTrading',
    bestBidGbp: null,
    bestAskGbp: null,
    issuerUsername: 'issuer-1',
    issuerTrust: null,
    onPressIssuer: noop,
    ...overrides,
  }));
}

function makeBookLevel(price: number, size: number) {
  return { price, size };
}

function renderBook(overrides: Record<string, unknown> = {}) {
  return renderTree(React.createElement(CoOwnOrderBook, {
    bids: [makeBookLevel(10.0, 100), makeBookLevel(9.9, 200)],
    asks: [makeBookLevel(10.1, 50), makeBookLevel(10.2, 75)],
    mode: 'continuous',
    onSelectLevel: noop,
    ...overrides,
  }));
}

function renderMarket(overrides: Record<string, unknown> = {}) {
  return renderTree(React.createElement(AssetMarketSection, {
    asset: makeAsset(),
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
    ...overrides,
  }));
}

function renderModals(overrides: Record<string, unknown> = {}) {
  return renderTree(React.createElement(AssetDetailModals, {
    asset: makeAsset(),
    images: [],
    fullscreenIndex: 0,
    onActiveFullscreenIndexChange: noop,
    fullscreenVisible: false,
    guideVisible: false,
    pendingTradeSide: null,
    rightsSheetVisible: false,
    riskDisclosureVisible: true,
    supplySheetVisible: false,
    overflowVisible: false,
    dossierSheetVisible: true,
    prospectusSheetVisible: true,
    priceAlertVisible: false,
    alertTargetPrice: '',
    alertCondition: 'below',
    alertSubmitting: false,
    yourUnits: null,
    totalUnits: 1000,
    availableUnits: 400,
    allocatedPct: 60,
    viewerPct: null,
    feePct: 1,
    rightsRows: [],
    isWatched: false,
    social: {
      collectionModalVisible: false,
      closeCollectionPicker: noop,
      shareVisible: false,
      closeShare: noop,
      isLiked: false,
      openShare: noop,
    },
    onCloseSheet: noop,
    onClearPendingTradeSide: noop,
    onGuideComplete: noop,
    onGuideContinueToTrade: noop,
    onToggleFav: noop,
    onToggleWatch: noop,
    onClosePriceAlert: noop,
    onAlertTargetPriceChange: noop,
    onAlertConditionChange: noop,
    onCreatePriceAlert: noop,
    onNavigateOrderHistory: noop,
    onNavigatePriceAlerts: noop,
    onNavigateIssue: noop,
    onOpenDiligence: noop,
    onOpenRiskDisclosure: noop,
    onOpenProspectus: noop,
    ...overrides,
  }));
}

beforeEach(() => {
  rnDims.current = { width: 375, height: 812, scale: 3, fontScale: 1 };
  listCoOwnExecutions.mockReset();
  listCoOwnExecutions.mockResolvedValue({ ok: true, serverTimestamp: 'x', items: [] });
});

// ═══════════════════════════════════════════════════════════════════
// A. CoOwnOrderBook — responsive financial layout (F10)
// ═══════════════════════════════════════════════════════════════════
describe('CoOwnOrderBook — responsive financial layout', () => {
  it('keeps the three-rail header at default width and text scale', () => {
    const renderer = renderBook();
    const texts = getAllText(renderer);
    expect(texts.some((t) => t === 'Units')).toBe(true);
    expect(texts.some((t) => t === 'Total units')).toBe(true);
    // Exact values render, stacked meta form is absent.
    expect(hasText(renderer, '10.00')).toBe(true);
    expect(hasText(renderer, 'units ·')).toBe(false);
  });

  it('switches to stacked rows at 200% text scale — exact price and units never clip', () => {
    rnDims.current = { width: 375, height: 812, scale: 3, fontScale: 2 };
    const renderer = renderBook();
    const texts = getAllText(renderer);
    // Stacked header mirrors the stacked row structure.
    expect(texts.some((t) => t === 'Units · Total units')).toBe(true);
    // The single-word "Units" rail header is gone.
    expect(texts.some((t) => t === 'Units')).toBe(false);
    // Exact price on its own line; units + running total below.
    expect(hasText(renderer, '10.00')).toBe(true);
    expect(hasText(renderer, '100 units · 100 total')).toBe(true);
    expect(hasText(renderer, '200 units · 300 total')).toBe(true);
    expect(hasText(renderer, '50 units · 50 total')).toBe(true);
    expect(hasText(renderer, '75 units · 125 total')).toBe(true);
  });

  it('switches to stacked rows when the measured book width is narrow', () => {
    const renderer = renderBook();
    // Default window width → rails.
    expect(getAllText(renderer).some((t) => t === 'Units')).toBe(true);
    // A real layout pass reporting a narrower container flips the layout.
    const layoutTarget = renderer.root.findAll(
      (n) => typeof n.props.onLayout === 'function'
    )[0];
    expect(layoutTarget).toBeDefined();
    act(() => {
      layoutTarget.props.onLayout({ nativeEvent: { layout: { width: 200, height: 400, x: 0, y: 0 } } });
    });
    const texts = getAllText(renderer);
    expect(texts.some((t) => t === 'Units · Total units')).toBe(true);
    expect(texts.some((t) => t === 'Units')).toBe(false);
    expect(hasText(renderer, '100 units · 100 total')).toBe(true);
  });

  it('never truncates long executable values in stacked mode', () => {
    rnDims.current = { width: 375, height: 812, scale: 3, fontScale: 2 };
    const renderer = renderBook({
      bids: [makeBookLevel(123456.78, 1234567)],
      asks: [makeBookLevel(123457.12, 9)],
    });
    expect(hasText(renderer, '123456.78')).toBe(true);
    expect(hasText(renderer, '1,234,567 units · 1,234,567 total')).toBe(true);
  });

  it('keeps row selection wired to the order ticket in stacked mode', () => {
    rnDims.current = { width: 375, height: 812, scale: 3, fontScale: 2 };
    const selectSpy = vi.fn();
    const renderer = renderBook({ onSelectLevel: selectSpy });
    const row = renderer.root.findAll(
      (n) => typeof n.props.onPress === 'function'
        && typeof n.props.accessibilityLabel === 'string'
        && n.props.accessibilityLabel.startsWith('Bid 10.00 1ZE')
    )[0];
    expect(row).toBeDefined();
    act(() => row.props.onPress());
    expect(selectSpy).toHaveBeenCalledWith('bid', 10.0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// B. CoOwnOrderBook — imbalance gauge labels + scope (F11)
// ═══════════════════════════════════════════════════════════════════
describe('CoOwnOrderBook — imbalance gauge', () => {
  it('labels both strip ends in text and states the visible-depth scope', () => {
    const renderer = renderBook(); // bids 300 units, asks 125 → 71% / 29%
    expect(hasText(renderer, 'Bid 71%')).toBe(true);
    expect(hasText(renderer, '29% Ask')).toBe(true);
    expect(hasText(renderer, 'visible depth')).toBe(true);
    const gauge = renderer.root.findAll(
      (n) => typeof n.props.accessibilityLabel === 'string'
        && n.props.accessibilityLabel.startsWith('Order book imbalance')
    )[0];
    expect(gauge).toBeDefined();
    expect(gauge.props.accessibilityLabel).toContain('71% bids');
    expect(gauge.props.accessibilityLabel).toContain('29% asks');
  });
});

// ═══════════════════════════════════════════════════════════════════
// C. AssetMarketSection — quote strip vs spread band (F10 + F11)
// ═══════════════════════════════════════════════════════════════════
describe('AssetMarketSection — quote strip division of labor', () => {
  const liveBook = {
    bids: [{ side: 'buy', unitPriceGbp: 10, units: 150, orderCount: 1 }],
    asks: [{ side: 'sell', unitPriceGbp: 10.5, units: 40, orderCount: 1 }],
    snapshotSequence: 1,
    eventSequence: 1,
    serverTimestamp: null,
    lastExecutionTimestamp: null,
    stalenessThresholdSeconds: 15,
    reconciliationState: 'reconciled',
    source: 'live',
  };

  it('demotes the strip to top-of-book units while the ladder band owns the quote', async () => {
    const renderer = renderMarket({
      orderBook: liveBook,
      bestBid: { side: 'buy', unitPriceGbp: 10, units: 150, orderCount: 1 },
      bestAsk: { side: 'sell', unitPriceGbp: 10.5, units: 40, orderCount: 1 },
      spreadGbp: 0.5,
    });
    await act(async () => {});
    // The strip carries only what the band lacks — resting units.
    expect(hasText(renderer, '150 units at best bid · 40 units at best ask')).toBe(true);
    // The section-level formatted quote ("10.00 1ZE") is not repeated —
    // the band's bare "10.00"/"10.50" values carry the quote.
    expect(hasText(renderer, '10.00 1ZE')).toBe(false);
    expect(hasText(renderer, '10.50 1ZE')).toBe(false);
    // "Spread" appears exactly once — inside the canonical band.
    const spreadCount = getAllText(renderer).filter((t) => t === 'Spread').length;
    expect(spreadCount).toBe(1);
  });

  it('restores the full quote row when the tape view replaces the ladder', async () => {
    const renderer = renderMarket({
      orderBook: liveBook,
      bestBid: { side: 'buy', unitPriceGbp: 10, units: 150, orderCount: 1 },
      bestAsk: { side: 'sell', unitPriceGbp: 10.5, units: 40, orderCount: 1 },
      spreadGbp: 0.5,
    });
    await act(async () => {});
    act(() => {
      renderer.root.findByProps({ accessibilityLabel: 'Order book view: tape' }).props.onPress();
    });
    // No band on screen → the strip is the only quote surface.
    expect(hasText(renderer, '10.00 1ZE')).toBe(true);
    expect(hasText(renderer, '10.50 1ZE')).toBe(true);
    // Quote values are unclamped — no numberOfLines prop on the value text.
    const quoteValue = renderer.root.findAll(
      (n) => (n.type as unknown) === 'Text'
        && findTextInstances(n).join('') === '10.00 1ZE'
    )[0];
    expect(quoteValue).toBeDefined();
    expect(quoteValue.props.numberOfLines).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════
// D. AssetDetailIdentity — uncapped price + three-state move (F12, F13)
// ═══════════════════════════════════════════════════════════════════
describe('AssetDetailIdentity — dominant price large-text strategy', () => {
  it('renders the exact price with no shrink clamps or font caps', () => {
    const renderer = renderIdentity();
    const price = renderer.root.findAll(
      (n) => (n.type as unknown) === 'Text' && findTextInstances(n).join('').includes('42.00 1ZE')
    )[0];
    expect(price).toBeDefined();
    expect(price.props.adjustsFontSizeToFit).toBeUndefined();
    expect(price.props.minimumFontScale).toBeUndefined();
    expect(price.props.maxFontSizeMultiplier).toBeUndefined();
    expect(price.props.numberOfLines).toBeUndefined();
  });
});

describe('AssetDetailIdentity — three-state 24h move', () => {
  function movePillNode(renderer: TestRenderer.ReactTestRenderer) {
    return renderer.root.findAll(
      (n) => typeof n.props.accessibilityLabel === 'string'
        && n.props.accessibilityLabel.startsWith('24 hour change')
    )[0];
  }

  // The mocked Ionicons forwardRef renders a host 'Ionicons' element —
  // match the host only so each glyph counts once.
  function iconsNamed(renderer: TestRenderer.ReactTestRenderer, name: string) {
    return renderer.root.findAll((n) => (n.type as unknown) === 'Ionicons' && n.props.name === name);
  }

  it('treats an exact zero move as unchanged, not up', () => {
    const renderer = renderIdentity({ movePct24h: 0 });
    const pill = movePillNode(renderer);
    expect(pill.props.accessibilityLabel).toBe('24 hour change unchanged at 0.0 percent');
    expect(hasText(renderer, '0.0%')).toBe(true);
    // Neutral glyph — no up/down trend icons anywhere.
    expect(iconsNamed(renderer, 'remove')).toHaveLength(1);
    expect(iconsNamed(renderer, 'trending-up')).toHaveLength(0);
    expect(iconsNamed(renderer, 'trending-down')).toHaveLength(0);
  });

  it('treats a tiny negative that rounds to zero as unchanged', () => {
    const renderer = renderIdentity({ movePct24h: -0.04 });
    const pill = movePillNode(renderer);
    expect(pill.props.accessibilityLabel).toBe('24 hour change unchanged at 0.0 percent');
    // Sign-aware: never prints "-0.0%" styled as a down move.
    expect(getAllText(renderer).some((t) => t.includes('-0.0%'))).toBe(false);
    expect(hasText(renderer, '0.0%')).toBe(true);
    expect(iconsNamed(renderer, 'trending-down')).toHaveLength(0);
  });

  it('treats a tiny positive that rounds to zero as unchanged', () => {
    // Rounding rule is symmetric: a displayed magnitude of "0.0" is
    // unchanged regardless of sign — a "+0.0%" pill would imply motion
    // where none is visible.
    const renderer = renderIdentity({ movePct24h: 0.04 });
    const pill = movePillNode(renderer);
    expect(pill.props.accessibilityLabel).toBe('24 hour change unchanged at 0.0 percent');
    expect(hasText(renderer, '0.0%')).toBe(true);
    expect(iconsNamed(renderer, 'trending-up')).toHaveLength(0);
    expect(iconsNamed(renderer, 'remove')).toHaveLength(1);
  });

  it.each([NaN, Infinity, -Infinity])(
    'renders no move pill for non-finite input (%s)',
    (value) => {
      const renderer = renderIdentity({ movePct24h: value });
      expect(movePillNode(renderer)).toBeUndefined();
      // No fabricated direction text like "-NaN%" or "+Infinity%".
      const all = getAllText(renderer).join('');
      expect(all).not.toContain('NaN');
      expect(all).not.toContain('Infinity');
      expect(iconsNamed(renderer, 'trending-up')).toHaveLength(0);
      expect(iconsNamed(renderer, 'trending-down')).toHaveLength(0);
      expect(iconsNamed(renderer, 'remove')).toHaveLength(0);
    },
  );

  it('announces and styles a positive move as up', () => {
    const renderer = renderIdentity({ movePct24h: 1.5 });
    const pill = movePillNode(renderer);
    expect(pill.props.accessibilityLabel).toBe('24 hour change up 1.5 percent');
    expect(hasText(renderer, '+1.5%')).toBe(true);
    expect(iconsNamed(renderer, 'trending-up')).toHaveLength(1);
  });

  it('announces and styles a negative move as down', () => {
    const renderer = renderIdentity({ movePct24h: -2.5 });
    const pill = movePillNode(renderer);
    expect(pill.props.accessibilityLabel).toBe('24 hour change down 2.5 percent');
    expect(hasText(renderer, '-2.5%')).toBe(true);
    expect(iconsNamed(renderer, 'trending-down')).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════
// E. Trading rules + sheet titles (F14 + F12)
// ═══════════════════════════════════════════════════════════════════
describe('AssetMarketSection — trading rules static summary', () => {
  it('renders contract-backed terms with unclamped wrapping values', async () => {
    const renderer = renderMarket({ asset: makeAsset({ tradingFeeRate: 0.01 }) });
    await act(async () => {});
    expect(hasText(renderer, 'Trading rules')).toBe(true);
    // Protection copy names the real backend mechanism — the per-order
    // price cap on protected_market orders — not an unproven market-wide
    // circuit breaker.
    expect(hasText(renderer, 'Protected orders never fill beyond their price cap')).toBe(true);
    // JSX interpolations split into separate string children — assert on
    // the joined text for the composed settlement value.
    expect(getAllText(renderer).join('')).toContain('1ZE · 1% fee');
    const ruleValue = renderer.root.findAll(
      (n) => (n.type as unknown) === 'Text'
        && findTextInstances(n).join('').includes('Protected orders never fill beyond')
    )[0];
    expect(ruleValue.props.numberOfLines).toBeUndefined();
  });
});

describe('Sheet titles — large-text parity (F12)', () => {
  it('renders AssetDetailModals sheet titles with no shrink props at 200% text', () => {
    rnDims.current = { width: 375, height: 812, scale: 3, fontScale: 2 };
    const renderer = renderModals();
    // 'Risk disclosure' also renders inside the dossier sheet as a link
    // label — the sheet TITLE is distinguished by its style signature
    // (riskDisclosureSheetTitle: flex + flexShrink, i.e. wraps instead of
    // clipping the header). Any Text matching the copy with that style is
    // a title node.
    const isTitleNode = (n: TestRenderer.ReactTestInstance, title: string) =>
      (n.type as unknown) === 'Text'
      && findTextInstances(n).join('') === title
      && Array.isArray(n.props.style)
      && n.props.style.some((s: { flex?: number; flexShrink?: number } | null) =>
        s != null && s.flex === 1 && s.flexShrink === 1);
    for (const title of ['Risk disclosure', 'Asset dossier', 'Asset prospectus']) {
      const node = renderer.root.findAll((n) => isTitleNode(n, title))[0];
      expect(node, title).toBeDefined();
      expect(node.props.maxFontSizeMultiplier).toBeUndefined();
      expect(node.props.numberOfLines).toBeUndefined();
      expect(node.props.adjustsFontSizeToFit).toBeUndefined();
      expect(node.props.minimumFontScale).toBeUndefined();
      // Font scaling must not be disabled either — a cap under any name
      // is a cap.
      expect(node.props.allowFontScaling).not.toBe(false);
    }
  });
});
