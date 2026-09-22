/**
 * Repairs for the 2026-09-21 validation report — frontend halves:
 *
 *  - S21-01: money/action text must reach WCAG 200% — checkout amounts,
 *    fee lines, totals and payment labels use the `financial` tier (cap 2),
 *    and the footer layout adapts (minHeight + wrap + measured scroll
 *    padding) instead of capping the user's text size.
 *  - S21-02: editorial teasers resolve to the piece's own article screen —
 *    the destination renders the editorial's real body or an honest
 *    unavailable state, never the same teaser.
 *  - S21-03: delayed feed-control writes bind to the account captured at
 *    action time — an account switch inside the undo window drops the write
 *    honestly (with a metric) rather than misattributing it.
 *  - S21-05: the settings wallet snapshot is owned by the account identity
 *    it was fetched for — a retained hook can never render account A's
 *    balance as account B's — and refetches on screen focus.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { DiscoveryListingSummary } from '../contracts/DiscoveryListingSummary';
import type { GalleriaEditorial } from '../services/galleriaApi';

const readSource = (rel: string) => readFileSync(resolve(__dirname, '..', rel), 'utf-8');

// ── Shared mutable harness (hoisted so mock factories can close over it) ──
const h = vi.hoisted(() => {
  const colors = new Proxy({}, { get: () => '#000000' });
  return {
    colors,
    fetchJson: vi.fn(async (..._args: unknown[]) => ({})),
    trackRaw: vi.fn(),
    focusCallback: { current: null as null | (() => void) },
    storeState: {
      currentUser: { id: 'user-a' } as { id: string } | null,
    },
    walletFetch: vi.fn(async (..._args: unknown[]) => ({
      snapshot: { availableGbp: 0, pendingGbp: 0, currency: 'GBP' },
      payoutSummary: { currentPendingWithdrawalGbp: 0, cumulativeWithdrawnGbp: 0 },
    })),
    editorialsFetch: vi.fn(async (..._args: unknown[]) => [] as unknown[]),
    editorialFetch: vi.fn(async (..._args: unknown[]) => null as unknown),
    biometric: { isAvailable: true },
  };
});

vi.mock('react-native', async () => {
  const React = await import('react');
  const createMock = (name: string) =>
    React.forwardRef((props: any, ref: any) =>
      React.createElement(name, { ref, ...props }));
  return {
    View: createMock('View'),
    Text: createMock('Text'),
    Pressable: createMock('Pressable'),
    ScrollView: createMock('ScrollView'),
    StyleSheet: {
      create: (s: any) => s,
      hairlineWidth: 0.5,
      absoluteFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    },
    Platform: { OS: 'ios', select: (o: any) => o.ios },
    Dimensions: { get: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }) },
    useWindowDimensions: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }),
    Appearance: { getColorScheme: () => 'light', addChangeListener: () => ({ remove: () => {} }) },
    I18nManager: { isRTL: false },
  };
});

vi.mock('@react-navigation/native', () => ({
  // Capture the focus callback so tests can simulate refocus explicitly;
  // it is NOT auto-run — the debounce would swallow the first call anyway.
  useFocusEffect: (effect: () => void) => {
    h.focusCallback.current = effect;
  },
}));

vi.mock('../lib/apiClient', () => ({
  fetchJson: (...args: unknown[]) => h.fetchJson(...args),
}));

vi.mock('../analytics', () => ({
  trackRaw: (...args: unknown[]) => h.trackRaw(...args),
}));

vi.mock('../store/useStore', () => {
  const useStore: any = (selector: (s: typeof h.storeState) => unknown) => selector(h.storeState);
  useStore.getState = () => h.storeState;
  useStore.persist = {
    hasHydrated: () => true,
    onFinishHydration: () => () => {},
  };
  return { useStore };
});

vi.mock('../services/walletApi', () => ({
  getWalletSnapshot: (...args: unknown[]) => h.walletFetch(...args),
}));

vi.mock('../services/galleriaApi', () => ({
  fetchGalleriaEditorials: (...args: unknown[]) => h.editorialsFetch(...args),
  fetchGalleriaEditorial: (...args: unknown[]) => h.editorialFetch(...args),
}));

vi.mock('../hooks/useBiometricGate', () => ({
  useBiometricGate: () => h.biometric,
}));

vi.mock('../theme/ThemeContext', () => ({
  useAppTheme: () => ({ colors: h.colors, isDark: false }),
}));

vi.mock('../components/CachedImage', async () => {
  const React = await import('react');
  return { CachedImage: (props: any) => React.createElement('CachedImage', props) };
});

vi.mock('../components/flagship', async () => {
  const React = await import('react');
  return {
    FlagshipScreen: ({ header, children }: any) =>
      React.createElement(React.Fragment, null, header, children),
    FlagshipHeader: (props: any) => React.createElement('FlagshipHeader', props),
    FlagshipState: (props: any) => React.createElement('FlagshipState', props),
  };
});

import { MAX_FONT_SCALE } from '../theme/typography.v2';
import {
  markItemNotInterested,
  showFewerLikeThis,
  undoItemNotInterested } from '../services/recommendationFeedbackApi';
import { useSettingsScreenData } from '../hooks/settings/useSettingsScreenData';
import GalleriaEditorialScreen from '../screens/GalleriaEditorialScreen';

const listing = (id = 'l1'): DiscoveryListingSummary =>
  ({
    id,
    sellerId: 'seller-1',
    title: `Jacket ${id}`,
    brand: 'Acme',
    category: 'women',
    price: 20,
    images: [],
  }) as unknown as DiscoveryListingSummary;

const editorialFixture = (id = 'e1'): GalleriaEditorial =>
  ({
    id,
    title: 'The Archive Edit',
    excerpt: 'A standfirst line.',
    heroImage: 'https://img.test/hero.jpg',
    author: 'Ana Curator',
    authorAvatar: '',
    publishedAt: '2026-09-01T00:00:00Z',
    readTime: '6 min read',
    content: ['First real paragraph.', 'Second real paragraph.'],
    isDemo: false,
  }) as GalleriaEditorial;

const jsonText = (node: any): string[] => {
  if (node == null || typeof node === 'boolean') return [];
  if (typeof node === 'string' || typeof node === 'number') return [String(node)];
  if (Array.isArray(node)) return node.flatMap(jsonText);
  return node.children ? jsonText(node.children) : [];
};

const screenText = (renderer: TestRenderer.ReactTestRenderer) =>
  jsonText(renderer.toJSON()).join('\n');

// ============================================================================
// S21-01 — financial/action typography tier
// ============================================================================
describe('S21-01 — financial/action text scales to 200%', () => {
  it('exposes a named financial tier at cap >= 2 (named-tier lint still passes)', () => {
    expect(MAX_FONT_SCALE.financial).toBeGreaterThanOrEqual(2);
    // The named-tier convention is preserved — the map is still the single
    // source of tier names the lint rule enforces.
    expect(Object.keys(MAX_FONT_SCALE)).toEqual(
      expect.arrayContaining(['utility', 'heading', 'content', 'financial']));
  });

  it('checkout footer money/action text uses the financial tier, never the 1.3 utility cap', () => {
    const src = readSource('components/checkout/CheckoutFooter.tsx');
    // No ad-hoc literals — the named-tier lint contract still holds.
    expect(src).not.toMatch(/maxFontSizeMultiplier=\{[0-9]/);
    // Every text node in the footer is financial/action content — none may
    // be capped at the 1.3 utility tier.
    expect(src).not.toMatch(/MAX_FONT_SCALE\.utility/);
    expect(src).toMatch(/MAX_FONT_SCALE\.financial/);
    // The wallet button adapts at 200% — minHeight, not a fixed height.
    expect(src).toMatch(/minHeight:\s*56/);
    expect(src).not.toMatch(/^\s*height:\s*56/m);
  });

  it('the checkout screen pads its scroll content by the measured footer height', () => {
    const src = readSource('screens/CheckoutScreen.tsx');
    // A fixed 300pt inset would clip content when the footer grows at 200%.
    expect(src).toMatch(/footerHeight/);
    expect(src).toMatch(/onHeightChange/);
  });
});

// ============================================================================
// S21-03 — delayed feed-control writes bind to the action-time identity
// ============================================================================
describe('S21-03 — feedback writes bind to the captured account identity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.storeState.currentUser = { id: 'user-a' };
    h.fetchJson.mockResolvedValue({});
  });

  it('submits under the captured account while the session still belongs to it', async () => {
    const result = await markItemNotInterested(listing(), {}, { userId: 'user-a' });
    expect(result.persisted).toBe(true);
    const bodies = h.fetchJson.mock.calls.map((c) => JSON.parse((c[1] as any).body));
    // Both writes carry the captured user id.
    expect(bodies[0].userId).toBe('user-a');
    // The intent mutation path encodes the captured account in the URL.
    expect(String(h.fetchJson.mock.calls[1][0])).toContain('/recommendations/intent/user-a/mutate');
  });

  it('drops honestly — never under the new account — when the session switches in the grace window', async () => {
    // Choice made as user-a; session is now user-b.
    h.storeState.currentUser = { id: 'user-b' };
    const result = await markItemNotInterested(listing(), {}, { userId: 'user-a' });
    expect(result).toEqual({ persisted: false, failure: 'identity_changed' });
    expect(h.fetchJson).not.toHaveBeenCalled();
    expect(h.trackRaw).toHaveBeenCalledWith(
      'feed_feedback_dropped',
      expect.objectContaining({ reason: 'identity_changed', action: 'not_interested' }),
    );
  });

  it('drops the undo compensation write under a switched session too', async () => {
    h.storeState.currentUser = { id: 'user-b' };
    const result = await undoItemNotInterested(listing(), { userId: 'user-a' });
    expect(result).toEqual({ persisted: false, failure: 'identity_changed' });
    expect(h.fetchJson).not.toHaveBeenCalled();
  });

  it('drops after sign-out — a captured id is never submitted without its session', async () => {
    h.storeState.currentUser = null;
    const result = await markItemNotInterested(listing(), {}, { userId: 'user-a' });
    expect(result).toEqual({ persisted: false, failure: 'identity_changed' });
    expect(h.fetchJson).not.toHaveBeenCalled();
  });

  it('keeps guest hides honest — an anonymous choice never lands on a signed-in account', async () => {
    h.storeState.currentUser = { id: 'user-b' };
    const result = await markItemNotInterested(listing(), {}, { userId: null });
    expect(result).toEqual({ persisted: false, failure: 'anonymous' });
    expect(h.fetchJson).not.toHaveBeenCalled();
  });

  it('show_fewer retries stay bound to the captured identity', async () => {
    const ok = await showFewerLikeThis(listing(), {}, { userId: 'user-a' });
    expect(ok.persisted).toBe(true);
    h.fetchJson.mockClear();
    h.storeState.currentUser = { id: 'user-b' };
    const dropped = await showFewerLikeThis(listing(), {}, { userId: 'user-a' });
    expect(dropped).toEqual({ persisted: false, failure: 'identity_changed' });
    expect(h.fetchJson).not.toHaveBeenCalled();
  });

  it('immediate callers (no actor) still resolve the live session', async () => {
    const result = await markItemNotInterested(listing());
    expect(result.persisted).toBe(true);
    const body = JSON.parse((h.fetchJson.mock.calls[0][1] as any).body);
    expect(body.userId).toBe('user-a');
  });
});

// ============================================================================
// S21-05 — settings wallet snapshot is identity-scoped and refetches on focus
// ============================================================================
// A probe component that re-renders the hook under the CURRENT store state —
// captures the latest result for identity-switch assertions.
let lastResult: ReturnType<typeof useSettingsScreenData>;
function ReaderProbe() {
  lastResult = useSettingsScreenData();
  return null;
}

describe('S21-05 — settings balance is owned by account identity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.storeState.currentUser = { id: 'user-a' };
    h.focusCallback.current = null;
  });

  const mount = async () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<ReaderProbe />);
    });
    return renderer;
  };

  const walletResult = (gbp: number) => ({
    snapshot: { availableGbp: gbp, pendingGbp: 0, currency: 'GBP' },
    payoutSummary: { currentPendingWithdrawalGbp: 0, cumulativeWithdrawnGbp: 0 },
  });

  it('never renders account A’s balance under account B — not even for one render', async () => {
    h.walletFetch
      .mockResolvedValueOnce(walletResult(150))
      .mockImplementationOnce(() => new Promise(() => {})); // B's fetch hangs
    const renderer = await mount();
    expect(lastResult.walletBalance).toBe(150);

    // Account switch — before B's fetch resolves, A's £150 must not show.
    h.storeState.currentUser = { id: 'user-b' };
    await act(async () => { renderer.update(<ReaderProbe />); });
    expect(lastResult.walletBalance).toBeNull();

    act(() => renderer.unmount());
  });

  it('a late response for account A cannot overwrite account B’s snapshot', async () => {
    let resolveOld: any;
    h.walletFetch
      .mockImplementationOnce(() => new Promise((r) => { resolveOld = r; }))
      .mockResolvedValueOnce(walletResult(20));
    const renderer = await mount();
    h.storeState.currentUser = { id: 'user-b' };
    await act(async () => { renderer.update(<ReaderProbe />); });
    expect(lastResult.walletBalance).toBe(20);
    await act(async () => { resolveOld(walletResult(999)); });
    expect(lastResult.walletBalance).toBe(20);
    act(() => renderer.unmount());
  });

  it('refetches on screen focus — returning from a withdrawal shows the fresh amount', async () => {
    h.walletFetch
      .mockResolvedValueOnce(walletResult(150))
      .mockResolvedValueOnce(walletResult(80));
    const renderer = await mount();
    expect(lastResult.walletBalance).toBe(150);
    expect(h.walletFetch).toHaveBeenCalledTimes(1);

    // Simulate leaving for a withdrawal and coming back past the debounce.
    vi.useFakeTimers();
    try {
      vi.advanceTimersByTime(6_000);
      const cb = h.focusCallback.current;
      expect(typeof cb).toBe('function');
      await act(async () => { cb!(); });
    } finally {
      vi.useRealTimers();
    }
    expect(h.walletFetch).toHaveBeenCalledTimes(2);
    expect(lastResult.walletBalance).toBe(80);

    act(() => renderer.unmount());
  });

  it('keeps malformed-snapshot validation — success without a number is unavailable, not £0', async () => {
    h.walletFetch.mockResolvedValueOnce({
      snapshot: { pendingGbp: 0, currency: 'GBP' },
      payoutSummary: { currentPendingWithdrawalGbp: 0, cumulativeWithdrawnGbp: 0 },
    } as any);
    const renderer = await mount();
    expect(lastResult.walletBalance).toBeNull();
    expect(lastResult.walletBalanceFailed).toBe(true);
    act(() => renderer.unmount());
  });
});

// ============================================================================
// S21-02 — the editorial destination renders the piece's real body
// ============================================================================
describe('S21-02 — GalleriaEditorialScreen resolves the named story', () => {
  const nav = { navigate: vi.fn(), goBack: vi.fn(), canGoBack: () => true } as any;

  const mountScreen = async (editorialId: string) => {
    const route = { key: 'k', name: 'GalleriaEditorial', params: { editorialId } } as any;
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<GalleriaEditorialScreen navigation={nav} route={route} />);
    });
    return renderer;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    h.editorialFetch.mockResolvedValue(editorialFixture('e1'));
  });

  it('renders the article body for the piece whose ID was passed', async () => {
    const renderer = await mountScreen('e1');
    const text = screenText(renderer);
    expect(text).toContain('The Archive Edit');
    expect(text).toContain('First real paragraph.');
    expect(text).toContain('Second real paragraph.');
    act(() => renderer.unmount());
  });

  it('shows an honest unavailable state when the piece is gone — not the teaser', async () => {
    h.editorialFetch.mockResolvedValue(null);
    const renderer = await mountScreen('deleted-piece');
    const states = renderer.root.findAll((n) => n.type === ('FlagshipState' as unknown));
    expect(states).toHaveLength(1);
    expect(states[0].props.variant).toBe('empty');
    expect(states[0].props.title).toBe('This story is no longer available');
    // Recovery goes to the Galleria section — a real next step.
    act(() => { states[0].props.onAction(); });
    expect(nav.navigate).toHaveBeenCalledWith('Galleria');
    act(() => renderer.unmount());
  });

  it('shows an error state with a working retry when the fetch fails', async () => {
    h.editorialFetch.mockRejectedValueOnce(new Error('network'));
    const renderer = await mountScreen('e1');
    const states = renderer.root.findAll((n) => n.type === ('FlagshipState' as unknown));
    expect(states).toHaveLength(1);
    expect(states[0].props.variant).toBe('error');

    await act(async () => { states[0].props.onAction(); });
    expect(h.editorialFetch).toHaveBeenCalledTimes(2);
    expect(screenText(renderer)).toContain('First real paragraph.');
    act(() => renderer.unmount());
  });
});
