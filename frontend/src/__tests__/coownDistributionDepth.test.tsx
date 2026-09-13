/**
 * Wave D (distributions depth) + Wave F (hygiene) regression tests.
 *
 * Covers:
 *  1. CoOwnDistributionCalendar renders record / ex / payable dates when the
 *     payload carries them and omits them entirely when absent.
 *  2. DistributionHistoryScreen renders the honest partial proceeds
 *     waterfall (gross → per unit → units at record → received) built only
 *     from contract fields that exist — no fabricated cost/fee lines — and
 *     discloses that costs/fees are not itemised.
 *  3. Token hygiene: CoOwnPortfolioAllocation derives its segment palette
 *     from theme tokens (no hardcoded slate/taupe hexes), and the media
 *     scrims in CoOwnFeaturedAsset / CoOwnMarketHighlightsCarousel derive
 *     their gradient stops from colors.shadow (no rgba(0,0,0,…) literals).
 *
 * Mock preamble mirrors coownDossierSheetRegression.test.tsx to prevent the
 * RN Flow `import typeof` parse crash under vitest.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

// The highlights carousel schedules scroll corrections via rAF; Node has no
// implementation, so stub it. The callback is irrelevant to these tests — the
// mocked FlatList never calls scrollToIndex.
vi.stubGlobal('requestAnimationFrame', () => 0);

// ── react-native mock (file-level): mirrors setup.ts but adds Switch and a
// functional FlatList so DistributionHistoryScreen DRIP rows and the market
// highlights carousel actually render their items. ──
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
    FlatList: (props: any) =>
      React.createElement(
        'FlatList',
        props,
        (props.data ?? []).map((item: any, index: number) =>
          React.createElement(React.Fragment, { key: index }, props.renderItem?.({ item, index }))
        )
      ),
    Pressable: createMock('Pressable'),
    TouchableOpacity: createMock('TouchableOpacity'),
    Switch: createMock('Switch'),
    KeyboardAvoidingView: createMock('KeyboardAvoidingView'),
    SafeAreaView: createMock('SafeAreaView'),
    StatusBar: createMock('StatusBar'),
    ActivityIndicator: createMock('ActivityIndicator'),
    RefreshControl: createMock('RefreshControl'),
    Modal: createMock('Modal'),
    StyleSheet: {
      create: (s: any) => s,
      hairlineWidth: 0.5,
      absoluteFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    },
    Platform: { OS: 'ios', select: (obj: any) => obj.ios },
    Dimensions: {
      get: () => ({ width: 375, height: 812, scale: 3, fontScale: 1 }),
    },
    useWindowDimensions: () => ({ width: 375, height: 812, scale: 3, fontScale: 1 }),
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
  };
});

// ── Theme mock (extends the dossier-regression palette with the scrim,
// overlay, shadow and glass tokens the hygiene-pass components consume) ──
// vi.hoisted: the ThemeContext mock factory reads this object when the module
// under test is imported — before ordinary consts are initialised.
const mockColors = vi.hoisted(() => ({
  background: '#ffffff',
  surface: '#f5f5f5',
  surfaceElevated: '#ffffff',
  surfaceRaised: '#f8f8f8',
  surfaceAlt: '#f0f0f0',
  textPrimary: '#000000',
  textSecondary: '#666666',
  textMuted: '#999999',
  textInverse: '#ffffff',
  border: '#e0e0e0',
  borderSubtle: '#f0f0f0',
  brand: '#111111',
  brandPressed: '#333333',
  brandSubtle: '#eeeeee',
  brandBorder: '#dddddd',
  success: '#215634',
  successSubtle: '#e7f2ea',
  successBorder: '#bfe3cd',
  warning: '#ffc765',
  warningSubtle: '#fff6e5',
  warningBorder: '#f3d9a8',
  danger: '#9b0202',
  dangerSubtle: '#fdeaea',
  dangerBorder: '#f0c5c5',
  coownUp: '#1C5631',
  coownDown: '#5F1616',
  coownUpSubtle: '#e7f2ea',
  coownUpBorder: '#bfe3cd',
  coownDownSubtle: '#fdeaea',
  coownDownBorder: '#eccaca',
  commerceTrust: '#06489A',
  commerceTrustBorder: '#c4d4ea',
  commerceTrustSubtle: '#e8eef8',
  social: '#6B3245',
  discovery: '#7B0E1E',
  discoverySubtle: '#f7e6e9',
  antiqueGold: '#C9A46A',
  bronze: '#8A6A3F',
  bronzeSubtle: '#f0e8dc',
  scrimTextPrimary: '#FFFFFF',
  scrimTextSecondary: 'rgba(255,255,255,0.88)',
  scrimTextTertiary: 'rgba(255,255,255,0.40)',
  scrimDeltaPositive: '#3a9d5e',
  scrimDeltaNegative: '#852a2a',
  mediaOverlayText: '#FFFFFF',
  mediaOverlayTextMuted: 'rgba(255,255,255,0.7)',
  mediaOverlayScrim: 'rgba(0,0,0,0.6)',
  mediaOverlayShadow: 'rgba(0,0,0,0.6)',
  overlay: 'rgba(0,0,0,0.44)',
  input: '#FFFFFF',
  inputText: '#000000',
  row: '#F5F5F5',
  rowPressed: '#EBEBEB',
  tabBar: '#FFFFFF',
  header: '#FFFFFF',
  shadow: '#000000',
  glassBg: 'rgba(0,0,0,0.04)',
  glassBorder: 'rgba(0,0,0,0.08)',
  outfitBackgrounds: ['#F5F1EA'],
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

vi.mock('../hooks/useReducedMotion', () => ({
  useReducedMotion: () => true,
}));

// ── marketApi mock: stub the fetchers the history screen consumes so the
// real module never loads apiClient → sentry → expo-updates Flow source. ──
const fetchCoOwnDistributions = vi.fn();
const fetchDripEnrollments = vi.fn();
const updateDripEnrollment = vi.fn();
const fetchCoOwnAssetById = vi.fn();

vi.mock('../services/marketApi', () => ({
  fetchCoOwnDistributions: (...args: unknown[]) => fetchCoOwnDistributions(...args),
  fetchDripEnrollments: (...args: unknown[]) => fetchDripEnrollments(...args),
  updateDripEnrollment: (...args: unknown[]) => updateDripEnrollment(...args),
  fetchCoOwnAssetById: (...args: unknown[]) => fetchCoOwnAssetById(...args),
}));

// ── Navigation mocks — the screen binds navigation/route/focus hooks. ──
const mockNavigate = vi.fn();
vi.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    canGoBack: () => true,
    goBack: vi.fn(),
    navigate: mockNavigate,
  }),
  useRoute: () => ({ params: {} }),
  useFocusEffect: () => {},
}));
vi.mock('@react-navigation/native-stack', () => ({}));

// ── Barrel / component mocks that cut native-module chains. ──
vi.mock('../components/coown', () => {
  const React = require('react');
  return {
    CoOwnStateCanvas: (props: Record<string, unknown>) =>
      React.createElement('CoOwnStateCanvasStub', props),
  };
});

vi.mock('../components/flagship', () => {
  const React = require('react');
  return {
    FlagshipScreen: ({ header, children }: { header?: React.ReactNode; children?: React.ReactNode }) =>
      React.createElement('View', null, header, children),
    FlagshipHeader: ({ title, subtitle }: { title?: string; subtitle?: string }) =>
      React.createElement('View', null, title, subtitle),
  };
});

vi.mock('../components/coown/CoOwnSkeletons', () => ({
  CoOwnActivitySkeleton: () => null,
}));

vi.mock('../context/ToastContext', () => ({
  useToast: () => ({ show: vi.fn() }),
}));

vi.mock('../platform/screenCapture', () => ({
  useScreenCaptureProtection: () => {},
  useScreenshotTracking: () => {},
}));

vi.mock('../hooks/useFormattedPrice', () => ({
  useFormattedPrice: () => ({
    formatFromFiat: (v: number) => `£${v.toFixed(2)}`,
  }),
}));

vi.mock('../components/ui/AppButton', () => ({
  AppButton: () => null,
}));

vi.mock('../components/CachedImage', () => ({
  CachedImage: () => null,
}));

vi.mock('../components/AnimatedPressable', () => {
  const React = require('react');
  return {
    AnimatedPressable: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('Pressable', props, children),
  };
});

// ── expo-linear-gradient mock — captures the colors prop so the scrim stops
// can be asserted as token-derived rather than rgba literals. ──
const linearGradientRenders: Array<{ colors?: unknown; locations?: unknown }> = [];
vi.mock('expo-linear-gradient', () => {
  const React = require('react');
  return {
    LinearGradient: (props: { colors?: unknown; locations?: unknown; children?: React.ReactNode }) => {
      linearGradientRenders.push({ colors: props.colors, locations: props.locations });
      return React.createElement('LinearGradient', props, props.children);
    },
  };
});

// ── react-native-svg mock — captures Circle strokes so the allocation
// segment palette can be asserted as token-derived. ──
vi.mock('react-native-svg', () => {
  const React = require('react');
  return {
    default: (props: Record<string, unknown>) => React.createElement('Svg', props),
    Svg: (props: Record<string, unknown>) => React.createElement('Svg', props),
    Circle: (props: Record<string, unknown>) => React.createElement('Circle', props),
  };
});

vi.mock('expo-video', () => ({
  useVideoPlayer: () => ({}),
  VideoView: () => null,
}));

vi.mock('@shopify/flash-list', () => ({
  FlashList: () => null,
}));

vi.mock('../components/BottomSheet', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
  BottomSheet: ({ children }: { children: React.ReactNode }) => children,
}));

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
  };
});

vi.mock('expo-secure-store', () => ({
  default: {
    getItemAsync: vi.fn(() => Promise.resolve(null)),
    setItemAsync: vi.fn(() => Promise.resolve()),
    deleteItemAsync: vi.fn(() => Promise.resolve()),
  },
  getItemAsync: vi.fn(() => Promise.resolve(null)),
  setItemAsync: vi.fn(() => Promise.resolve()),
  deleteItemAsync: vi.fn(() => Promise.resolve()),
}));
vi.mock('expo-network', () => ({
  default: {
    getNetworkStateAsync: vi.fn(() => Promise.resolve({ isConnected: true, isInternetReachable: true })),
  },
  getNetworkStateAsync: vi.fn(() => Promise.resolve({ isConnected: true, isInternetReachable: true })),
}));
vi.mock('expo-constants', () => ({
  default: {
    expoConfig: { extra: { apiUrl: 'http://localhost' } },
  },
}));
vi.mock('react-native-mmkv', () => ({
  createMMKV: () => ({
    set: vi.fn(),
    getString: vi.fn(),
    getBoolean: vi.fn(),
    getNumber: vi.fn(),
    contains: vi.fn(),
    remove: vi.fn(),
    getAllKeys: vi.fn(() => []),
    clearAll: vi.fn(),
    addOnValueChangedListener: vi.fn(() => ({ remove: vi.fn() })),
  }),
  MMKV: class {},
}));
vi.mock('../lib/apiClient', () => ({
  fetchJson: vi.fn(),
  fetchWithAuth: vi.fn(),
}));
vi.mock('../lib/offlineQueue', () => ({
  useOfflineQueue: vi.fn(() => ({ enqueue: vi.fn() })),
  OFFLINE_WRITE_QUEUED_CODE: 499,
}));

import { CoOwnDistributionCalendar, type CoOwnDistributionCalendarEntry } from '../components/coown/CoOwnDistributionCalendar';
import DistributionHistoryScreen from '../screens/DistributionHistoryScreen';
import { CoOwnPortfolioAllocation } from '../components/coown/CoOwnPortfolioAllocation';
import { CoOwnFeaturedAsset } from '../components/coown/CoOwnFeaturedAsset';
import { CoOwnMarketHighlightsCarousel } from '../components/coown/CoOwnMarketHighlightsCarousel';

// ── Render helpers ──
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

// ── Fixtures ──
function makeCalendarEntry(overrides: Partial<CoOwnDistributionCalendarEntry> = {}): CoOwnDistributionCalendarEntry {
  return {
    id: 'dist-1',
    date: '2026-09-20T00:00:00Z',
    perUnitGbp: 0.5,
    totalPoolGbp: 500,
    status: 'scheduled',
    ...overrides,
  };
}

function makeDistribution(overrides: Record<string, unknown> = {}) {
  return {
    id: 'dist-1',
    assetId: 'asset-1',
    amountGbpMinor: 1250,
    unitsAtRecord: 25,
    perUnitGbpMinor: 50,
    distributionType: 'revenue_share',
    status: 'settled',
    reference: 'DIST-2026-09',
    createdAt: '2026-09-20T10:00:00Z',
    settledAt: '2026-09-22T10:00:00Z',
    projectedPayableDate: '2026-09-22T00:00:00Z',
    recordDate: '2026-09-15T00:00:00Z',
    exDate: '2026-09-16T00:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  fetchCoOwnDistributions.mockReset();
  fetchDripEnrollments.mockReset();
  updateDripEnrollment.mockReset();
  fetchCoOwnAssetById.mockReset();
  linearGradientRenders.length = 0;
});

// ═══════════════════════════════════════════════════════════════════
// A. Distribution calendar — record / ex / payable disclosures
// ═══════════════════════════════════════════════════════════════════
describe('CoOwnDistributionCalendar — record/ex/payable dates', () => {
  it('renders record, ex and payable dates when the entry carries them', () => {
    const renderer = renderTree(
      React.createElement(CoOwnDistributionCalendar, {
        entries: [makeCalendarEntry({
          recordDate: '2026-09-15T00:00:00Z',
          exDate: '2026-09-16T00:00:00Z',
          payableDate: '2026-09-22T00:00:00Z',
        })],
      })
    );
    expect(hasText(renderer, 'Record date')).toBe(true);
    expect(hasText(renderer, 'Ex date')).toBe(true);
    expect(hasText(renderer, 'Payable')).toBe(true);
    // Honest labels carry the formatted date value inline. The month
    // abbreviation is ICU-dependent ('Sep' vs 'Sept' in en-GB), so assert
    // day + year rather than the exact month token.
    const texts = getAllText(renderer);
    expect(texts.some((t) => /Record date 15 \w+ 2026/.test(t))).toBe(true);
    expect(texts.some((t) => /Ex date 16 \w+ 2026/.test(t))).toBe(true);
    expect(texts.some((t) => /Payable 22 \w+ 2026/.test(t))).toBe(true);
  });

  it('omits the disclosure lines entirely when the fields are absent', () => {
    const renderer = renderTree(
      React.createElement(CoOwnDistributionCalendar, {
        entries: [makeCalendarEntry()],
      })
    );
    expect(hasText(renderer, 'Record date')).toBe(false);
    expect(hasText(renderer, 'Ex date')).toBe(false);
    expect(hasText(renderer, 'Payable')).toBe(false);
    // Core row content still renders.
    expect(hasText(renderer, 'Scheduled')).toBe(true);
    expect(hasText(renderer, '£0.50')).toBe(true);
  });

  it('renders only the dates that are present (partial disclosure)', () => {
    const renderer = renderTree(
      React.createElement(CoOwnDistributionCalendar, {
        entries: [makeCalendarEntry({ recordDate: '2026-09-15T00:00:00Z' })],
      })
    );
    expect(hasText(renderer, 'Record date')).toBe(true);
    expect(hasText(renderer, 'Ex date')).toBe(false);
    expect(hasText(renderer, 'Payable')).toBe(false);
  });

  it('includes the disclosed dates in the accessibility label', () => {
    const renderer = renderTree(
      React.createElement(CoOwnDistributionCalendar, {
        entries: [makeCalendarEntry({
          recordDate: '2026-09-15T00:00:00Z',
          exDate: '2026-09-16T00:00:00Z',
          payableDate: '2026-09-22T00:00:00Z',
        })],
      })
    );
    const row = renderer.root.findAll(
      (node) => typeof node.props.accessibilityLabel === 'string'
        && node.props.accessibilityLabel.includes('Record date')
    )[0];
    expect(row).toBeDefined();
    expect(row.props.accessibilityLabel).toContain('Ex date');
    expect(row.props.accessibilityLabel).toContain('Payable');
  });
});

// ═══════════════════════════════════════════════════════════════════
// B. DistributionHistoryScreen — proceeds waterfall
// ═══════════════════════════════════════════════════════════════════
describe('DistributionHistoryScreen — proceeds waterfall', () => {
  async function renderScreen(items: Array<Record<string, unknown>>) {
    fetchCoOwnDistributions.mockResolvedValue({ items, nextCursor: null });
    fetchDripEnrollments.mockResolvedValue([]);
    fetchCoOwnAssetById.mockResolvedValue({ title: 'Fractional Vault Asset' });
    const renderer = renderTree(React.createElement(DistributionHistoryScreen));
    await act(async () => {});
    return renderer;
  }

  it('renders the honest partial waterfall gross → per unit → units → received', async () => {
    const renderer = await renderScreen([makeDistribution()]);
    const text = getAllText(renderer).join('\n');
    expect(text).toContain('Proceeds');
    expect(text).toContain('Gross distribution');
    expect(text).toContain('Per unit');
    expect(text).toContain('Your units at record');
    expect(text).toContain('You received');
    // Values: gross = amountGbpMinor (12.50 1ZE), per-unit via price hook.
    expect(text).toContain('12.50 1ZE');
    expect(text).toContain('£0.50/unit');
    expect(text).toContain('25');
  });

  it('discloses that costs and fees are not itemised instead of fabricating lines', async () => {
    const renderer = await renderScreen([makeDistribution()]);
    const text = getAllText(renderer).join('\n');
    expect(text).toContain('Costs and fees are not itemised');
    // No fabricated deduction rows.
    expect(text).not.toContain('Platform fee');
    expect(text).not.toContain('Withholding');
    expect(text).not.toContain('Management fee');
  });

  it('renders record, ex and payable dates on the detail rows when present', async () => {
    const renderer = await renderScreen([makeDistribution()]);
    const text = getAllText(renderer).join('\n');
    expect(text).toContain('Record date');
    expect(text).toContain('Ex date');
    expect(text).toContain('Payable');
  });

  it('omits date rows when the payload does not carry them', async () => {
    const renderer = await renderScreen([makeDistribution({
      recordDate: null,
      exDate: null,
      projectedPayableDate: null,
    })]);
    const text = getAllText(renderer).join('\n');
    expect(text).not.toContain('Record date');
    expect(text).not.toContain('Ex date');
    expect(text).not.toContain('Payable');
    // Waterfall still renders.
    expect(text).toContain('Gross distribution');
  });

  it('labels the net line "Projected to you" for pending distributions', async () => {
    const renderer = await renderScreen([makeDistribution({ status: 'pending', settledAt: null })]);
    const text = getAllText(renderer).join('\n');
    expect(text).toContain('Projected to you');
    expect(text).not.toContain('You received');
  });

  it('labels the net line honestly for reversed distributions', async () => {
    const renderer = await renderScreen([makeDistribution({ status: 'reversed' })]);
    const text = getAllText(renderer).join('\n');
    expect(text).toContain('Paid (later reversed)');
  });
});

// ═══════════════════════════════════════════════════════════════════
// C. Token hygiene — allocation palette + media scrims
// ═══════════════════════════════════════════════════════════════════
describe('token compliance — allocation palette', () => {
  // Expected deterministic ramp: mix(textPrimary #000000 → border #e0e0e0)
  // at t = 0.08 + 0.84·i/7 for i = 0…7 (per buildSegmentPalette).
  const EXPECTED_RAMP = ['#121212', '#2D2D2D', '#484848', '#636363', '#7D7D7D', '#989898', '#B3B3B3', '#CECECE'];
  const OLD_HARDCODED_PALETTE = ['#A8A8A8', '#8A8A8A', '#6E6E6E', '#565656', '#424242', '#9C8E7E', '#7E7468', '#645A50'];

  it('derives segment colors from theme tokens, not the removed hex palette', () => {
    const renderer = renderTree(
      React.createElement(CoOwnPortfolioAllocation, {
        positions: [
          { assetId: 'a1', title: 'Alpha', marketValueGbp: 600 },
          { assetId: 'a2', title: 'Beta', marketValueGbp: 300 },
          { assetId: 'a3', title: 'Gamma', marketValueGbp: 100 },
        ],
        totalValueGbp: 1000,
      })
    );
    // Segment circles carry the palette color as their stroke; the track
    // ring uses surfaceAlt and is filtered out.
    const strokes = renderer.root
      .findAll((node) => node.type === ('Circle' as unknown) && typeof node.props.stroke === 'string')
      .map((node) => node.props.stroke as string)
      .filter((stroke) => stroke !== mockColors.surfaceAlt);
    expect(strokes).toHaveLength(3);
    for (const stroke of strokes) {
      expect(EXPECTED_RAMP).toContain(stroke);
      expect(OLD_HARDCODED_PALETTE).not.toContain(stroke);
    }
    // Largest slice takes the highest-contrast tone.
    expect(strokes[0]).toBe(EXPECTED_RAMP[0]);
  });
});

describe('token compliance — media scrims', () => {
  const SCRIM_BASE = mockColors.shadow; // '#000000'

  it('CoOwnFeaturedAsset builds its scrim gradient from colors.shadow', () => {
    renderTree(
      React.createElement(CoOwnFeaturedAsset, {
        title: 'Vault Asset',
        unitPriceLabel: '£10.00',
        availableUnits: 400,
        totalUnits: 1000,
        status: 'open',
      })
    );
    expect(linearGradientRenders.length).toBeGreaterThan(0);
    const stops = linearGradientRenders[0].colors as string[];
    expect(stops).toEqual([
      `${SCRIM_BASE}00`,
      `${SCRIM_BASE}73`,
      `${SCRIM_BASE}C7`,
    ]);
    // No hardcoded rgba(0,0,0,…) literals survive.
    for (const stop of stops) {
      expect(stop).not.toMatch(/^rgba\(/);
      expect(stop).not.toBe('transparent');
    }
  });

  it('CoOwnMarketHighlightsCarousel builds its scrim gradient from colors.shadow', () => {
    renderTree(
      React.createElement(CoOwnMarketHighlightsCarousel, {
        items: [{
          id: 'm1',
          title: 'Vault Asset',
          categoryLabel: 'Collectibles',
          unitPriceLabel: '£10.00',
          localReferenceLabel: 'Ref 001',
          availabilityLabel: '400 of 1000',
          allocatedPct: 60,
          statusLabel: 'Available',
          status: 'open',
        }],
        onPressItem: () => {},
      })
    );
    expect(linearGradientRenders.length).toBeGreaterThan(0);
    const stops = linearGradientRenders[0].colors as string[];
    expect(stops).toEqual([
      `${SCRIM_BASE}00`,
      `${SCRIM_BASE}33`,
      `${SCRIM_BASE}C7`,
    ]);
    for (const stop of stops) {
      expect(stop).not.toMatch(/^rgba\(/);
    }
  });
});
