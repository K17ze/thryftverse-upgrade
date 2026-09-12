/**
 * CorporateActionVoteScreen — governance ballot regression tests (Wave B).
 *
 * Covers:
 *  1. Loading state renders before data resolves.
 *  2. Loaded state renders action title, type, tally, and quorum meter.
 *  3. Ballot select → confirm calls castGovernanceVote with correct args;
 *     confirm stays disabled until an option is selected.
 *  4. Persisted myVote renders the voted state and the change-vote affordance.
 *  5. Quorum block omitted when quorum fields are absent.
 *  6. Voting-closed state renders no interactive ballot.
 *  7. Ineligible state shows the server reason and no ballot.
 *  8. Action-not-found renders an honest unavailable state.
 *  9. Fetch error renders the error canvas with a working Retry.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

// ── Theme mock (same tokens as coownAssetDetailRuntime.test.tsx) ──
vi.mock('../theme/ThemeContext', () => {
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
    successBorder: '#bfe3cd',
    warning: '#ffc765',
    warningSubtle: '#fff6e5',
    danger: '#9b0202',
    dangerSubtle: '#fdeaea',
    coownUp: '#1C5631',
    coownDown: '#5F1616',
    coownUpSubtle: '#e7f2ea',
    coownUpBorder: '#bfe3cd',
    coownDownSubtle: '#fdeaea',
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

// ── Navigation mock — the screen is route-driven. ──
const mockNavigate = vi.fn();
const mockGoBack = vi.fn();
const mockReplace = vi.fn();
let routeParams: { actionId: string; assetId: string } = { actionId: 'action-1', assetId: 'asset-1' };

vi.mock('@react-navigation/native', () => ({
  useRoute: () => ({ params: routeParams }),
  useNavigation: () => ({
    canGoBack: () => true,
    goBack: (...args: unknown[]) => mockGoBack(...args),
    navigate: (...args: unknown[]) => mockNavigate(...args),
    replace: (...args: unknown[]) => mockReplace(...args),
  }),
  useFocusEffect: () => {},
}));

vi.mock('@react-navigation/native-stack', () => ({}));

// ── marketApi mock: stub the fetchers WITHOUT importOriginal — the real
// module transitively imports expo-secure-store/expo-network and triggers
// the RN Flow `import typeof` parse error under vitest. ──
const fetchCoOwnAssetCorporateActions = vi.fn();
const fetchGovernanceVotes = vi.fn();
const castGovernanceVote = vi.fn();

vi.mock('../services/marketApi', () => ({
  fetchCoOwnAssetCorporateActions: (...args: unknown[]) => fetchCoOwnAssetCorporateActions(...args),
  fetchGovernanceVotes: (...args: unknown[]) => fetchGovernanceVotes(...args),
  castGovernanceVote: (...args: unknown[]) => castGovernanceVote(...args),
}));

// ── Coown barrel mock — the barrel transitively pulls Skia. The screen
// consumes exactly CoOwnStateCanvas + CoOwnOfflineBanner. ──
vi.mock('../components/coown', () => {
  const React = require('react');
  return {
    CoOwnStateCanvas: (props: Record<string, any>) =>
      React.createElement(
        'View',
        null,
        React.createElement('Text', null, props.title ?? props.variant),
        props.subtitle ? React.createElement('Text', null, props.subtitle) : null,
        props.actionLabel && props.onAction
          ? React.createElement(
              'Pressable',
              { onPress: props.onAction, accessibilityLabel: props.actionLabel, accessibilityRole: 'button' },
              React.createElement('Text', null, props.actionLabel),
            )
          : null,
      ),
    CoOwnOfflineBanner: () => null,
  };
});

// ── Flagship barrel mock — FlagshipScreen pulls reanimated/keyboard
// providers; the stubs preserve the props the tests assert against. ──
vi.mock('../components/flagship', () => {
  const React = require('react');
  return {
    FlagshipScreen: (props: Record<string, any>) =>
      React.createElement('View', null, props.header, props.children, props.stickyFooter),
    FlagshipHeader: (props: Record<string, any>) =>
      React.createElement(
        'View',
        null,
        React.createElement('Text', { accessibilityRole: 'header' }, props.title),
        props.subtitle ? React.createElement('Text', null, props.subtitle) : null,
        props.rightAction ?? null,
      ),
  };
});

// ── AppButton stub — keeps disabled/onPress/a11y props pressable in tests. ──
vi.mock('../components/ui/AppButton', () => {
  const React = require('react');
  return {
    AppButton: (props: Record<string, any>) =>
      React.createElement(
        'Pressable',
        {
          onPress: props.onPress,
          disabled: props.disabled || props.loading,
          accessibilityLabel: props.accessibilityLabel ?? props.title,
          accessibilityHint: props.accessibilityHint,
          accessibilityRole: 'button',
          accessibilityState: { disabled: !!(props.disabled || props.loading) },
        },
        React.createElement('Text', null, props.title),
      ),
  };
});

vi.mock('../context/ToastContext', () => ({
  useToast: () => ({ show: vi.fn() }),
}));

vi.mock('../hooks/useFormattedPrice', () => ({
  useFormattedPrice: () => ({
    formatFromFiat: (n: number) => `£${n.toFixed(2)}`,
    currencySymbol: '£',
  }),
}));

vi.mock('../hooks/useConnectivity', () => ({
  useConnectivity: () => ({ isOffline: false, isConnected: true, connectionType: 'wifi' }),
}));

vi.mock('../hooks/useReducedMotion', () => ({
  useReducedMotion: () => true,
}));

vi.mock('../platform/screenCapture', () => ({
  useScreenCaptureProtection: () => {},
}));

// ── Native-module mocks (same coverage as the dossier regression test) ──
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
  default: { expoConfig: { extra: { apiUrl: 'http://localhost' } } },
}));

import CorporateActionVoteScreen from '../screens/CorporateActionVoteScreen';

// ── Fixtures ──
const FUTURE_DEADLINE = '2099-01-01T00:00:00Z';

function makeAction(overrides: Record<string, unknown> = {}) {
  return {
    id: 'action-1',
    assetId: 'asset-1',
    actionType: 'governance',
    title: 'Approve refinance of vault asset',
    description: 'Holder vote on the proposed refinancing terms.',
    perUnitValueGbpMinor: 1250,
    totalValueGbpMinor: 125000,
    recordDate: '2026-09-01T00:00:00Z',
    exDate: null,
    payableDate: null,
    status: 'open',
    metadata: null,
    createdAt: '2026-09-05T00:00:00Z',
    quorumUnits: 5000,
    passThresholdPct: 50,
    votingDeadline: FUTURE_DEADLINE,
    ...overrides,
  };
}

function makeVotes(overrides: Record<string, unknown> = {}) {
  return {
    summary: [
      { vote: 'for', votingPowerUnits: 1240, voteCount: 3 },
      { vote: 'against', votingPowerUnits: 200, voteCount: 1 },
    ],
    totalVotingPower: 1440,
    myVote: null,
    eligibility: {
      eligible: true,
      reason: '',
      votingPowerUnits: 120,
      recordDate: '2026-09-01T00:00:00Z',
      status: 'open',
    },
    ...overrides,
  };
}

// ── Render helpers (same pattern as coownAssetDetailRuntime.test.tsx) ──
function renderSync(el: React.ReactElement): TestRenderer.ReactTestRenderer {
  let renderer: TestRenderer.ReactTestRenderer | null = null;
  act(() => {
    renderer = TestRenderer.create(el);
  });
  return renderer!;
}

async function renderAsync(el: React.ReactElement): Promise<TestRenderer.ReactTestRenderer> {
  let renderer: TestRenderer.ReactTestRenderer | null = null;
  await act(async () => {
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

function findByA11yLabel(renderer: TestRenderer.ReactTestRenderer, label: string) {
  return renderer.root.findAll(
    (node) => node.props?.accessibilityLabel === label && typeof node.props?.onPress === 'function',
  );
}

beforeEach(() => {
  fetchCoOwnAssetCorporateActions.mockReset();
  fetchGovernanceVotes.mockReset();
  castGovernanceVote.mockReset();
  mockNavigate.mockReset();
  mockGoBack.mockReset();
  mockReplace.mockReset();
  routeParams = { actionId: 'action-1', assetId: 'asset-1' };
  fetchCoOwnAssetCorporateActions.mockResolvedValue([makeAction()]);
  fetchGovernanceVotes.mockResolvedValue(makeVotes());
  castGovernanceVote.mockResolvedValue({
    actionId: 'action-1',
    vote: 'for',
    votingPowerUnits: 120,
    createdAt: '2026-09-10T00:00:00Z',
  });
});

describe('CorporateActionVoteScreen', () => {
  it('renders the loading state before data resolves', () => {
    fetchCoOwnAssetCorporateActions.mockReturnValue(new Promise(() => {}));
    fetchGovernanceVotes.mockReturnValue(new Promise(() => {}));
    const renderer = renderSync(React.createElement(CorporateActionVoteScreen));
    expect(hasText(renderer, 'Loading vote')).toBe(true);
  });

  it('renders the action title, governance type, tally, and quorum meter', async () => {
    const renderer = await renderAsync(React.createElement(CorporateActionVoteScreen));
    expect(hasText(renderer, 'Approve refinance of vault asset')).toBe(true);
    expect(hasText(renderer, 'Governance')).toBe(true);
    expect(hasText(renderer, '1,440 of 5,000 units voted')).toBe(true);
    expect(hasText(renderer, '50% of votes cast')).toBe(true);
    expect(hasText(renderer, 'Current tally')).toBe(true);
    expect(hasText(renderer, '£12.50')).toBe(true); // perUnitValueGbpMinor 1250 → £12.50
    expect(fetchGovernanceVotes).toHaveBeenCalledWith('action-1');
    expect(fetchCoOwnAssetCorporateActions).toHaveBeenCalledWith('asset-1', { limit: 100 });
  });

  it('keeps confirm disabled until a ballot option is selected, then casts via API', async () => {
    const renderer = await renderAsync(React.createElement(CorporateActionVoteScreen));

    const confirmBefore = findByA11yLabel(renderer, 'Cast vote')[0];
    expect(confirmBefore).toBeDefined();
    expect(confirmBefore.props.accessibilityState?.disabled ?? confirmBefore.props.disabled).toBeTruthy();

    const forOption = findByA11yLabel(renderer, 'Vote For')[0];
    expect(forOption).toBeDefined();
    expect(forOption.props.accessibilityRole).toBe('radio');
    act(() => forOption.props.onPress());

    const confirmAfter = findByA11yLabel(renderer, 'Cast vote')[0];
    expect(confirmAfter.props.accessibilityState?.disabled ?? confirmAfter.props.disabled).toBeFalsy();
    await act(async () => {
      confirmAfter.props.onPress();
    });

    expect(castGovernanceVote).toHaveBeenCalledWith('action-1', { assetId: 'asset-1', vote: 'for' });
    // Tallies are refetched after a successful cast.
    expect(fetchGovernanceVotes.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('renders the persisted myVote state and the change-vote affordance', async () => {
    fetchGovernanceVotes.mockResolvedValue(
      makeVotes({ myVote: 'against' }),
    );
    const renderer = await renderAsync(React.createElement(CorporateActionVoteScreen));
    expect(hasText(renderer, 'You voted Against')).toBe(true);
    expect(hasText(renderer, '120 units voting power')).toBe(true);
    // Backend upserts while open — the change-vote path stays available.
    expect(findByA11yLabel(renderer, 'Update vote').length).toBeGreaterThan(0);
  });

  it('omits the quorum block when the action carries no quorum fields', async () => {
    fetchCoOwnAssetCorporateActions.mockResolvedValue([
      makeAction({ quorumUnits: null, passThresholdPct: null, votingDeadline: null }),
    ]);
    const renderer = await renderAsync(React.createElement(CorporateActionVoteScreen));
    expect(hasText(renderer, 'Quorum')).toBe(false);
    expect(hasText(renderer, 'Pass threshold')).toBe(false);
    // The ballot still renders — the action is open and the user is eligible.
    expect(findByA11yLabel(renderer, 'Vote For').length).toBeGreaterThan(0);
  });

  it('renders the voting-closed state with no interactive ballot', async () => {
    fetchCoOwnAssetCorporateActions.mockResolvedValue([
      makeAction({ status: 'completed' }),
    ]);
    fetchGovernanceVotes.mockResolvedValue(
      makeVotes({
        eligibility: { eligible: false, reason: 'This vote has closed', votingPowerUnits: 0, recordDate: null, status: 'completed' },
      }),
    );
    const renderer = await renderAsync(React.createElement(CorporateActionVoteScreen));
    expect(hasText(renderer, 'Voting closed')).toBe(true);
    expect(findByA11yLabel(renderer, 'Cast vote')).toHaveLength(0);
    expect(findByA11yLabel(renderer, 'Vote For')).toHaveLength(0);
  });

  it('shows the server ineligibility reason and hides the ballot', async () => {
    fetchGovernanceVotes.mockResolvedValue(
      makeVotes({
        eligibility: {
          eligible: false,
          reason: 'You must hold units of this asset to vote',
          votingPowerUnits: 0,
          recordDate: '2026-09-01T00:00:00Z',
          status: 'open',
        },
      }),
    );
    const renderer = await renderAsync(React.createElement(CorporateActionVoteScreen));
    expect(hasText(renderer, 'You must hold units of this asset to vote')).toBe(true);
    expect(findByA11yLabel(renderer, 'Cast vote')).toHaveLength(0);
    expect(findByA11yLabel(renderer, 'Vote For')).toHaveLength(0);
  });

  it('renders an honest not-found state when the action is absent', async () => {
    fetchCoOwnAssetCorporateActions.mockResolvedValue([
      makeAction({ id: 'action-other' }),
    ]);
    const renderer = await renderAsync(React.createElement(CorporateActionVoteScreen));
    expect(hasText(renderer, 'Vote not found')).toBe(true);
    expect(findByA11yLabel(renderer, 'Cast vote')).toHaveLength(0);
  });

  it('renders the error canvas and retries on action failure', async () => {
    fetchCoOwnAssetCorporateActions.mockRejectedValueOnce(new Error('Network request failed'));
    const renderer = await renderAsync(React.createElement(CorporateActionVoteScreen));
    expect(hasText(renderer, "Couldn't load this vote")).toBe(true);

    const retry = findByA11yLabel(renderer, 'Retry')[0];
    expect(retry).toBeDefined();
    await act(async () => {
      retry.props.onPress();
    });
    expect(fetchCoOwnAssetCorporateActions.mock.calls.length).toBe(2);
    expect(hasText(renderer, 'Approve refinance of vault asset')).toBe(true);
  });
});
