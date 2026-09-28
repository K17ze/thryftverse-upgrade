import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Audit 2026-09-28, findings 23 + 24:
 *  - Portfolio partial state: visible retry wired to pull-to-refresh, no
 *    clamped warning, qualified totals, per-position stale naming.
 *  - Group permissions: geometry-matched loading skeleton and a read-only
 *    explanation that sits before the first affected control and reads
 *    differently for offline vs authority-denied.
 */

const harness = vi.hoisted(() => ({
  // ── portfolio ──
  portfolioData: null as Record<string, unknown> | null,
  derived: {
    totalCostBasisGbp: 0,
    allocationBars: [] as unknown[],
    issuerBands: [] as unknown[],
    classBars: [] as unknown[],
    performers: { best: null, worst: null },
  },
  actions: {
    handleBack: vi.fn(),
    handleOpenActivity: vi.fn(),
    handleBrowseItems: vi.fn(),
    handleViewDistributions: vi.fn(),
    handleOpenMarketOverview: vi.fn(),
    handleOpenWatchlist: vi.fn(),
    handlePositionPress: vi.fn(),
    handleBuyMore: vi.fn(),
    handleSell: vi.fn(),
    actionSheetAsset: null,
    closeActionSheet: vi.fn(),
    actionSheetActions: [] as unknown[],
  },
  handleRefresh: vi.fn(),
  // ── portfolio data hook (real usePortfolioData, mocked service) ──
  fetchPortfolio: vi.fn(),
  viewer: { id: 'viewer-a' } as { id: string },
  // Stable reference — `listings` is a `loadPortfolio` dependency, so a new
  // array per render would re-fire the focus effect and consume mock queue.
  listings: [] as unknown[],
  // ── group permissions ──
  fetchSettings: vi.fn(),
  updateSettings: vi.fn(),
  show: vi.fn(),
  haptic: { selection: vi.fn(), success: vi.fn() },
  isOffline: false,
}));

vi.mock('../theme/ThemeContext', () => ({
  useAppTheme: () => ({ colors: new Proxy({}, { get: () => '#222222' }) }),
}));
vi.mock('../components/SkeletonLoader', () => ({
  SkeletonLoader: (props: Record<string, unknown>) => React.createElement('SkeletonLoader', props),
}));
vi.mock('../components/flagship', () => ({
  FlagshipScreen: (props: { children?: React.ReactNode; header?: React.ReactNode }) =>
    React.createElement('View', null, props.header, props.children),
  FlagshipHeader: () => React.createElement('View'),
  FlagshipState: (props: { title?: string; subtitle?: string }) =>
    React.createElement('View', null,
      React.createElement('Text', null, props.title),
      React.createElement('Text', null, props.subtitle)),
}));
vi.mock('../components/coown', () => ({
  CoOwnPositionActionSheet: () => null,
  CoOwnOfflineBanner: () => null,
  CoOwnPortfolioSkeleton: () => null,
  CoOwnStateCanvas: () => null,
}));
vi.mock('../store/useStore', () => ({
  useStore: Object.assign(
    (selector: (state: { coOwnWatchlist: unknown[]; currentUser: { id: string } }) => unknown) =>
      selector({ coOwnWatchlist: [], currentUser: harness.viewer }),
    { getState: () => ({ currentUser: harness.viewer }) },
  ),
}));
vi.mock('@react-navigation/native', () => ({
  useFocusEffect: (effect: React.EffectCallback) => React.useEffect(effect, [effect]),
}));
vi.mock('../context/BackendDataContext', () => ({
  useBackendData: () => ({ listings: harness.listings }),
}));
vi.mock('../services/coOwnPortfolio', () => ({
  fetchCoOwnPortfolioPositions: (...args: unknown[]) => harness.fetchPortfolio(...args),
}));
vi.mock('../lib/apiClient', () => ({
  parseApiError: () => ({ message: 'Unavailable' }),
}));
vi.mock('../hooks/useFormattedPrice', () => ({
  useFormattedPrice: () => ({ formatFromFiat: (value: number) => `${value} 1ZE` }),
}));
vi.mock('../hooks/useConnectivity', () => ({
  useConnectivity: () => ({
    isOffline: harness.isOffline,
    isConnected: !harness.isOffline,
    connectionType: 'wifi',
  }),
}));
vi.mock('../platform/screenCapture', () => ({ useScreenCaptureProtection: () => {} }));
vi.mock('../hooks/portfolio', () => ({
  usePortfolioData: () => harness.portfolioData,
  usePortfolioDerived: () => harness.derived,
  usePortfolioActions: () => harness.actions,
}));
vi.mock('@shopify/flash-list', () => ({
  FlashList: (props: {
    data?: unknown[];
    renderItem?: (args: { item: unknown; index: number }) => React.ReactNode;
    ListHeaderComponent?: React.ReactNode;
    ListFooterComponent?: React.ReactNode;
    refreshControl?: React.ReactNode;
  }) =>
    React.createElement('View', null,
      props.ListHeaderComponent,
      ...(props.data ?? []).map((item, index) => props.renderItem?.({ item, index })),
      props.refreshControl,
      props.ListFooterComponent),
}));
vi.mock('../components/portfolio/PortfolioHeader', () => ({ PortfolioHeader: () => null }));
vi.mock('../components/portfolio/PortfolioTabBar', () => ({ PortfolioTabBar: () => null }));
vi.mock('../components/portfolio/PortfolioInsightsTab', () => ({ PortfolioInsightsTab: () => null }));
vi.mock('../components/portfolio/PortfolioPositionsHeader', () => ({ PortfolioPositionsHeader: () => null }));
vi.mock('../components/portfolio/PortfolioPositionRow', () => ({
  PortfolioPositionRow: (props: { item: { assetId: string; title: string } }) =>
    React.createElement('Text', { testID: `position-${props.item.assetId}` }, props.item.title),
}));
vi.mock('../components/ui/CoOwnNumericText', () => ({
  CoOwnNumericText: ({ value }: { value: number }) => React.createElement('Text', null, String(value)),
}));
vi.mock('../services/chatApi', () => ({
  fetchGroupSettingsFromApi: (...args: unknown[]) => harness.fetchSettings(...args),
  updateGroupSettingsOnApi: (...args: unknown[]) => harness.updateSettings(...args),
}));
vi.mock('../context/ToastContext', () => ({ useToast: () => ({ show: harness.show }) }));
vi.mock('../hooks/useHaptic', () => ({ useHaptic: () => harness.haptic }));

import { Space } from '../theme/designTokens';
import { PortfolioPartialBanner } from '../components/portfolio/PortfolioPartialBanner';
import { usePortfolioData } from '../hooks/portfolio/usePortfolioData';
import PortfolioScreen from '../screens/PortfolioScreen';
import GroupPermissionsScreen from '../screens/GroupPermissionsScreen';

function render(element: React.ReactElement) {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => { tree = TestRenderer.create(element); });
  return tree;
}

async function renderAsync(element: React.ReactElement) {
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => { tree = TestRenderer.create(element); });
  return tree;
}

function content(tree: TestRenderer.ReactTestRenderer): string {
  const flatten = (node: TestRenderer.ReactTestInstance | string): string =>
    typeof node === 'string' ? node : node.children.map(flatten).join('');
  return flatten(tree.root);
}

function byA11yLabel(tree: TestRenderer.ReactTestRenderer, label: string) {
  return tree.root.findAll((node) => node.props?.accessibilityLabel === label)[0];
}

/** True for host nodes of the given element name — the RN mocks render each
 *  component as a same-named host element, so matching on the type string
 *  skips the composite wrapper (avoids double-counting). */
function isHost(node: TestRenderer.ReactTestInstance, type: string) {
  return typeof node.type === 'string' && node.type === type;
}

function position(assetId: string, title: string, markStale = false) {
  return { assetId, title, mark: { source: 'last', price: 10, ageSeconds: 60, isStale: markStale } };
}

const baseSummary = {
  totalValueGbp: 120, totalUnits: 7, totalUnrealizedGbp: 5,
  totalRealizedGbp: 0, positionCount: 2,
};

function groupSnapshot(canManage: boolean, settingsOverride: Record<string, unknown> = {}) {
  return {
    settings: {
      editGroupInfo: 'admins', sendMessages: 'everyone', addMembers: 'admins',
      updatedBy: null, updatedAt: null,
      ...settingsOverride,
    },
    capabilities: {
      canManage,
      canEditGroupInfo: canManage,
      canAddMembers: canManage,
      canSendMessages: true,
    },
  };
}

function renderGroupScreen() {
  return renderAsync(React.createElement(GroupPermissionsScreen, {
    navigation: { goBack: vi.fn() },
    route: { params: { conversationId: 'conv-1' } },
  } as never));
}

beforeEach(() => {
  harness.portfolioData = null;
  harness.handleRefresh.mockClear();
  harness.fetchSettings.mockReset();
  harness.updateSettings.mockReset();
  harness.fetchPortfolio.mockReset();
  harness.show.mockClear();
  harness.isOffline = false;
  harness.viewer = { id: 'viewer-a' };
});

describe('PortfolioPartialBanner — finding 23', () => {
  it('exposes a quiet retry action wired to the supplied refresh handler', () => {
    const onRetry = vi.fn();
    const tree = render(<PortfolioPartialBanner onRetry={onRetry} />);
    const retry = byA11yLabel(tree, 'Retry loading portfolio');
    expect(retry).toBeTruthy();
    expect(retry.props.accessibilityRole).toBe('button');
    act(() => { retry.props.onPress(); });
    expect(onRetry).toHaveBeenCalledTimes(1);
    act(() => { tree.unmount(); });
  });

  it('does not clamp the warning — no line limits anywhere in the banner', () => {
    const tree = render(<PortfolioPartialBanner onRetry={() => {}} staleCount={3} />);
    for (const text of tree.root.findAll((node) => isHost(node, 'Text'))) {
      expect(text.props.numberOfLines).toBeUndefined();
    }
    act(() => { tree.unmount(); });
  });

  it('reports busy/disabled while a refresh is already in flight', () => {
    const tree = render(<PortfolioPartialBanner onRetry={() => {}} refreshing />);
    const retry = byA11yLabel(tree, 'Retry loading portfolio');
    expect(retry.props.disabled).toBe(true);
    expect(retry.props.accessibilityState).toEqual({ busy: true, disabled: true });
    act(() => { tree.unmount(); });
  });

  it('names how many positions carry a stale mark when the data supports it', () => {
    const tree = render(<PortfolioPartialBanner onRetry={() => {}} staleCount={1} />);
    expect(content(tree)).toContain('1 position shows a stale mark');
    act(() => { tree.unmount(); });
  });
});

describe('PortfolioScreen partial state — finding 23', () => {
  it('keeps positions visible, qualifies the total, and retries via the banner', () => {
    harness.portfolioData = {
      positions: [position('asset-1', 'Leather bag'), position('asset-2', 'Chrono watch', true)],
      summary: baseSummary,
      isLoading: false,
      isError: false,
      refreshing: false,
      isPartial: true,
      loadPortfolio: vi.fn(),
      handleRefresh: harness.handleRefresh,
    };
    const tree = render(<PortfolioScreen />);
    const flat = content(tree);

    // Positions remain visible — the banner is advisory, not a replacement.
    expect(flat).toContain('Leather bag');
    expect(flat).toContain('Chrono watch');

    // The total is never presented as complete: the qualifier sits directly
    // above the summary figure in reading order.
    expect(flat).toContain('Portfolio value');
    expect(flat.indexOf('Totals may be incomplete')).toBeLessThan(flat.indexOf('Portfolio value'));
    expect(flat).toContain('1 position shows a stale mark');

    // The banner retry invokes the same handler as pull-to-refresh.
    const retry = byA11yLabel(tree, 'Retry loading portfolio');
    act(() => { retry.props.onPress(); });
    expect(harness.handleRefresh).toHaveBeenCalledTimes(1);

    // Pull-to-refresh is still wired to the same handler.
    const refreshControl = tree.root.findAll((node) => isHost(node, 'RefreshControl'))[0];
    expect(refreshControl?.props.onRefresh).toBe(harness.handleRefresh);
    act(() => { tree.unmount(); });
  });
});

describe('usePortfolioData — failed refresh keeps the partial qualifier', () => {
  it('retains positions and isPartial after a failed refresh (F23)', async () => {
    let current!: ReturnType<typeof usePortfolioData>;
    function Reader() {
      current = usePortfolioData();
      return null;
    }
    harness.fetchPortfolio
      .mockResolvedValueOnce({
        positions: [position('asset-1', 'Leather bag')],
        summary: baseSummary,
        holdingsCount: 2,
        partial: true,
        failedAssetIds: ['asset-2'],
      })
      .mockRejectedValueOnce(new Error('refresh failed'));

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(<Reader />); });
    expect(current.isPartial).toBe(true);
    expect(current.positions).toHaveLength(1);

    await act(async () => { current.handleRefresh(); });
    await act(async () => {});

    // The retained partial data must keep its qualifier — a failed refresh
    // cannot present the same incomplete totals as complete.
    expect(current.isPartial).toBe(true);
    expect(current.positions).toHaveLength(1);
    expect(current.isError).toBe(true);
    expect(harness.show).toHaveBeenCalledWith('Unavailable', 'error');
    act(() => { tree.unmount(); });
  });

  it('clears the qualifier only when a fresh fetch replaces the data', async () => {
    let current!: ReturnType<typeof usePortfolioData>;
    function Reader() {
      current = usePortfolioData();
      return null;
    }
    harness.fetchPortfolio
      .mockResolvedValueOnce({
        positions: [position('asset-1', 'Leather bag')],
        summary: baseSummary,
        holdingsCount: 2,
        partial: true,
        failedAssetIds: ['asset-2'],
      })
      .mockResolvedValueOnce({
        positions: [position('asset-1', 'Leather bag'), position('asset-2', 'Chrono watch')],
        summary: baseSummary,
        holdingsCount: 2,
      });

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => { tree = TestRenderer.create(<Reader />); });
    expect(current.isPartial).toBe(true);

    await act(async () => { current.handleRefresh(); });
    await act(async () => {});

    expect(current.isPartial).toBe(false);
    expect(current.positions).toHaveLength(2);
    act(() => { tree.unmount(); });
  });
});

describe('GroupPermissionsScreen — finding 24', () => {
  it('renders a restrained three-row skeleton instead of a spinner while loading', async () => {
    harness.fetchSettings.mockReturnValue(new Promise(() => {}));
    const tree = await renderGroupScreen();

    expect(byA11yLabel(tree, 'Loading group permissions')).toBeTruthy();
    expect(tree.root.findAll((node) => isHost(node, 'ActivityIndicator'))).toHaveLength(0);

    const list = tree.root.findAll((node) => node.props?.testID === 'group-permissions-skeleton')[0];
    expect(list).toBeTruthy();

    const flatStyle = (node: TestRenderer.ReactTestInstance) =>
      (Array.isArray(node.props?.style) ? node.props.style : [node.props?.style])
        .filter(Boolean) as Record<string, unknown>[];

    // Three row blocks matching the loaded permissionBlock geometry.
    // Host nodes only — the RN mock renders composite + host pairs that
    // would otherwise double-count.
    const rows = list.findAll((node) =>
      isHost(node, 'View') && flatStyle(node).some((s) => s.paddingVertical === Space.lg));
    expect(rows).toHaveLength(3);

    // Geometry mirrors the loaded rows: a bodyStrong title line, a meta
    // value line and a 20pt chevron slot per permission.
    const skeletons = tree.root.findAll((node) => isHost(node, 'SkeletonLoader'));
    expect(skeletons.filter((s) => s.props.height === 21)).toHaveLength(3);
    expect(skeletons.filter((s) => s.props.height === 14)).toHaveLength(3);
    expect(skeletons.filter((s) => s.props.height === 20)).toHaveLength(3);

    // Hairline-separated rows like the populated list — not a card stack.
    const hasDivider = (node: TestRenderer.ReactTestInstance) =>
      flatStyle(node).some((s) => 'borderTopWidth' in s);
    expect(hasDivider(rows[0])).toBe(false);
    expect(hasDivider(rows[1])).toBe(true);
    expect(hasDivider(rows[2])).toBe(true);
    act(() => { tree.unmount(); });
  });

  it('explains authority-denied read-only before the first affected control', async () => {
    harness.fetchSettings.mockResolvedValue(groupSnapshot(false));
    const tree = await renderGroupScreen();
    const flat = content(tree);

    const explainer = 'only an owner or admin can change them';
    expect(flat).toContain(explainer);
    expect(flat.indexOf(explainer)).toBeLessThan(flat.indexOf('Edit group info'));
    // Must not read like a connectivity problem.
    expect(flat).not.toContain('Offline — reconnect');
    act(() => { tree.unmount(); });
  });

  it('explains offline differently from authority-denied', async () => {
    harness.isOffline = true;
    harness.fetchSettings.mockResolvedValue(groupSnapshot(true));
    const tree = await renderGroupScreen();
    const flat = content(tree);

    expect(flat).toContain('Offline — reconnect to change permissions');
    expect(flat).not.toContain('only an owner or admin can change them');
    act(() => { tree.unmount(); });
  });

  it('keeps permission values inspectable while options stay disabled read-only', async () => {
    harness.fetchSettings.mockResolvedValue(groupSnapshot(false));
    const tree = await renderGroupScreen();

    const heading = byA11yLabel(tree, 'Edit group info, Admins only');
    expect(heading).toBeTruthy();
    act(() => { heading.props.onPress(); });

    const everyone = byA11yLabel(tree, 'Edit group info: Everyone');
    const admins = byA11yLabel(tree, 'Edit group info: Admins only');
    expect(everyone.props.accessibilityRole).toBe('radio');
    expect(everyone.props.accessibilityState).toEqual({ checked: false, disabled: true });
    expect(admins.props.accessibilityState).toEqual({ checked: true, disabled: true });
    act(() => { tree.unmount(); });
  });

  it('reconciles with the server when an update response is lost mid-commit', async () => {
    harness.fetchSettings.mockResolvedValue(groupSnapshot(true));
    const tree = await renderGroupScreen();

    act(() => { byA11yLabel(tree, 'Edit group info, Admins only').props.onPress(); });

    harness.updateSettings.mockRejectedValueOnce(new Error('response lost'));
    harness.fetchSettings.mockResolvedValueOnce(groupSnapshot(true, { editGroupInfo: 'everyone' }));

    await act(async () => {
      byA11yLabel(tree, 'Edit group info: Everyone').props.onPress();
    });

    // The PATCH rejection triggered a re-fetch (reconciliation), and the
    // confirmed server value — not the optimistic one — is what is shown.
    expect(harness.fetchSettings).toHaveBeenCalledTimes(2);
    expect(harness.show).toHaveBeenCalledWith('Permission updated', 'success');
    expect(byA11yLabel(tree, 'Edit group info, Everyone')).toBeTruthy();
    act(() => { tree.unmount(); });
  });

  it('reports failure and reverts when reconciliation shows the update did not apply', async () => {
    harness.fetchSettings.mockResolvedValue(groupSnapshot(true));
    const tree = await renderGroupScreen();

    act(() => { byA11yLabel(tree, 'Edit group info, Admins only').props.onPress(); });

    harness.updateSettings.mockRejectedValueOnce(new Error('response lost'));
    harness.fetchSettings.mockResolvedValueOnce(groupSnapshot(true)); // server kept 'admins'

    await act(async () => {
      byA11yLabel(tree, 'Edit group info: Everyone').props.onPress();
    });

    expect(harness.fetchSettings).toHaveBeenCalledTimes(2);
    expect(harness.show).toHaveBeenCalledWith('Could not update this permission', 'error');
    expect(byA11yLabel(tree, 'Edit group info, Admins only')).toBeTruthy();
    act(() => { tree.unmount(); });
  });
});
