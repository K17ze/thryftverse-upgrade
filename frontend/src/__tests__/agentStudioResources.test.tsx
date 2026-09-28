import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

/**
 * Task D — Agent Studio operational clarity (audit findings 15, 16, 17).
 *
 *  - F17  useAgentStudioResources keeps per-resource freshness/error state:
 *         a single rejection marks only that resource, previously loaded
 *         data is labelled 'stale' (never confirmed-empty), and reload(key)
 *         retries just one resource.
 *  - F15  Provider selector chips carry radio semantics + selected state,
 *         wrapped in a ≥44pt transparent target around the compact chip.
 *  - F16  Agent rows lead with the contract's real purpose (description /
 *         runtimeReadinessReason) while runtime+version demote to metadata;
 *         name and status reflow together (no single-line clamps).
 */

// ── Shared mocks ────────────────────────────────────────────────────────────

const mockColors = {
  background: '#ffffff',
  surface: '#f5f5f5',
  surfaceAlt: '#f0f0f0',
  textPrimary: '#000000',
  textSecondary: '#666666',
  textMuted: '#999999',
  textInverse: '#ffffff',
  border: '#e0e0e0',
  borderSubtle: '#f0f0f0',
  brand: '#0066cc',
  brandSubtle: '#e6f0ff',
  input: '#ffffff',
  inputText: '#000000',
  successText: '#007a33',
  successSubtle: '#e6f6ec',
  successBorder: '#bfe6cd',
  danger: '#cc0000',
  dangerText: '#cc0000',
  dangerSubtle: '#fdecec',
  dangerBorder: '#f2c1c1',
  warningText: '#9a6a00',
  overlay: 'rgba(0,0,0,0.5)',
};

vi.mock('../theme/ThemeContext', () => ({
  useAppTheme: () => ({ colors: mockColors, isDark: false }),
}));

// Echo key + params so tests can assert both the key and the interpolated
// resource label.
vi.mock('../i18n/useAppTranslation', () => {
  const t = (key: string, params?: Record<string, unknown>) =>
    params ? `${key} ${JSON.stringify(params)}` : key;
  return { useAppTranslation: () => ({ t }) };
});

vi.mock('@react-navigation/native', () => {
  const React = require('react');
  return {
    useNavigation: () => ({ navigate: vi.fn(), goBack: vi.fn() }),
    useRoute: () => ({ params: {} }),
    // Actually run the focus callback so the hook fetches on mount.
    useFocusEffect: (cb: () => void | (() => void)) => {
      React.useEffect(() => cb(), [cb]);
    },
    useScrollToTop: () => {},
  };
});

vi.mock('../hooks/useHaptic', () => ({
  useHaptic: () => ({
    light: () => {},
    medium: () => {},
    heavy: () => {},
    selection: () => {},
    error: () => {},
    warning: () => {},
    success: () => {},
    patterns: { save: () => {} },
  }),
}));

const storeState = vi.hoisted(() => ({
  currentUser: { id: 'viewer-1', username: 'viewer' } as { id: string; username: string } | null,
  customBots: [] as unknown[],
  providerConnections: [] as unknown[],
  pendingApprovals: [] as unknown[],
}));
vi.mock('../store/useStore', () => {
  const useStore: any = (selector: (s: typeof storeState) => unknown) => selector(storeState);
  useStore.getState = () => storeState;
  useStore.setState = (patch: Record<string, unknown>) => Object.assign(storeState, patch);
  return { useStore };
});

const fetchBotsMock = vi.hoisted(() => vi.fn());
const fetchConnectionsMock = vi.hoisted(() => vi.fn());
const fetchApprovalsMock = vi.hoisted(() => vi.fn());
vi.mock('../services/botsApi', () => ({
  fetchCustomBotsFromApi: (...args: unknown[]) => fetchBotsMock(...args),
  fetchConnectionsFromApi: (...args: unknown[]) => fetchConnectionsMock(...args),
  fetchPendingApprovalsFromApi: (...args: unknown[]) => fetchApprovalsMock(...args),
}));

vi.mock('../components/flagship', () => {
  const React = require('react');
  return {
    FlagshipState: () => React.createElement('View', null, 'FLAGSHIP-STATE'),
  };
});

// ── Imports under test (after mocks) ────────────────────────────────────────

import { useAgentStudioResources } from '../hooks/useAgentStudioResources';
import type { AgentStudioResources } from '../hooks/useAgentStudioResources';
import { AgentStudioStatusOverview } from '../components/agents/AgentStudioStatusOverview';
import { AgentStudioConnectionsSection } from '../components/agents/AgentStudioConnectionsSection';
import { AgentStudioAgentsSection } from '../components/agents/AgentStudioAgentsSection';
import { createAgentStudioStyles } from '../components/agents/agentStudioStyles';
import type { ChatBot } from '../domain';

// ── Helpers ─────────────────────────────────────────────────────────────────

const styles = createAgentStudioStyles(mockColors as never);

async function mount(el: React.ReactElement) {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(el);
  });
  return renderer;
}

function collectText(node: TestRenderer.ReactTestInstance): string[] {
  const out: string[] = [];
  const walk = (child: unknown) => {
    if (typeof child === 'string' || typeof child === 'number') out.push(String(child));
    else if (Array.isArray(child)) child.forEach(walk);
    else if (child && typeof child === 'object' && (child as any).props?.children !== undefined) {
      walk((child as any).props.children);
    }
  };
  walk(node.props?.children);
  return out;
}

/** Match host nodes by element name (the RN mock renders string host types). */
const isHost = (n: TestRenderer.ReactTestInstance, type: string) =>
  n.type === (type as never);

function allText(root: TestRenderer.ReactTestInstance): string {
  return root
    .findAll((n) => isHost(n, 'Text'))
    .flatMap(collectText)
    .join(' ');
}

/** Resolve a Pressable's style prop (possibly a function) to a flat object. */
function flatStyle(style: unknown): Record<string, unknown> {
  const resolved = typeof style === 'function' ? (style as (s: { pressed: boolean }) => unknown)({ pressed: false }) : style;
  if (Array.isArray(resolved)) {
    return resolved.reduce<Record<string, unknown>>((acc, s) => ({ ...acc, ...flatStyle(s) }), {});
  }
  return (resolved as Record<string, unknown>) ?? {};
}

const resourcesOf = (over: Partial<AgentStudioResources> = {}): AgentStudioResources => ({
  bots: { status: 'ok', errorMessage: null },
  connections: { status: 'ok', errorMessage: null },
  approvals: { status: 'ok', errorMessage: null },
  ...over });

const makeBot = (over: Partial<ChatBot>): ChatBot => ({
  id: 'bot-1',
  slug: 'bot-1',
  name: 'Wardrobe assistant',
  description: '',
  commandHint: '',
  category: 'styling',
  status: 'available',
  permissions: [],
  type: 'custom',
  ...over });

const connectionStub = {
  showConnectForm: true,
  connectProvider: 'openai' as const,
  setConnectProvider: vi.fn(),
  connectKey: '',
  setConnectKey: vi.fn(),
  connectLabel: '',
  setConnectLabel: vi.fn(),
  connectBaseUrl: '',
  setConnectBaseUrl: vi.fn(),
  creatingConnection: false,
  reverifyingId: null,
  confirmRemove: null,
  removingId: null,
  toast: null,
  openConnectForm: vi.fn(),
  cancelConnectForm: vi.fn(),
  handleCreateConnection: vi.fn(),
  handleReverify: vi.fn(),
  handleRequestRemove: vi.fn(),
  handleConfirmRemove: vi.fn(),
  cancelConfirmRemove: vi.fn(),
};

const navigationStub = { navigate: vi.fn(), goBack: vi.fn() } as never;

const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

// ── F17 — per-resource freshness/error state ────────────────────────────────

type ResourcesHook = ReturnType<typeof useAgentStudioResources>;
let hook!: ResourcesHook;
const HookProbe = () => {
  hook = useAgentStudioResources();
  return null;
};

describe('F17 — useAgentStudioResources keeps per-resource state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storeState.currentUser = { id: 'viewer-1', username: 'viewer' };
    storeState.customBots = [];
    storeState.providerConnections = [];
    storeState.pendingApprovals = [];
    fetchBotsMock.mockResolvedValue([{ id: 'b1' }]);
    fetchConnectionsMock.mockResolvedValue([{ id: 'c1' }]);
    fetchApprovalsMock.mockResolvedValue([{ id: 'a1' }]);
  });

  it('marks only the rejected resource and keeps the other two ok', async () => {
    fetchConnectionsMock.mockRejectedValue(new Error('provider unreachable'));
    const renderer = await mount(<HookProbe />);

    expect(hook.resources.bots.status).toBe('ok');
    expect(hook.resources.approvals.status).toBe('ok');
    expect(hook.resources.connections.status).toBe('error');
    expect(hook.resources.connections.errorMessage).toBe('provider unreachable');

    // Fulfilled resources still land in the store; the failed one is not
    // written, so nothing masquerades as confirmed-empty.
    expect(storeState.customBots).toEqual([{ id: 'b1' }]);
    expect(storeState.pendingApprovals).toEqual([{ id: 'a1' }]);
    expect(storeState.providerConnections).toEqual([]);

    act(() => { renderer.unmount(); });
  });

  it('labels a previously loaded resource as stale when a refresh fails', async () => {
    const renderer = await mount(<HookProbe />);
    expect(hook.resources.connections.status).toBe('ok');
    expect(storeState.providerConnections).toEqual([{ id: 'c1' }]);

    fetchConnectionsMock.mockRejectedValue(new Error('socket hang up'));
    await act(async () => {
      await hook.reload();
    });

    // Prior data survives, marked stale — not error, not empty.
    expect(hook.resources.connections.status).toBe('stale');
    expect(hook.resources.connections.errorMessage).toBe('socket hang up');
    expect(storeState.providerConnections).toEqual([{ id: 'c1' }]);
    expect(hook.resources.bots.status).toBe('ok');

    act(() => { renderer.unmount(); });
  });

  it('a per-key retry racing a full reload still commits the full reload\'s other payloads', async () => {
    const renderer = await mount(<HookProbe />);
    expect(hook.resources.bots.status).toBe('ok');

    // Queue: full reload gets dBots/dConnsFull/dAppr; the retry gets dRetry.
    const dBots = deferred<unknown[]>();
    const dConnsFull = deferred<unknown[]>();
    const dAppr = deferred<unknown[]>();
    const dRetry = deferred<unknown[]>();
    fetchBotsMock.mockImplementationOnce(() => dBots.promise);
    fetchConnectionsMock.mockImplementationOnce(() => dConnsFull.promise);
    fetchApprovalsMock.mockImplementationOnce(() => dAppr.promise);
    fetchConnectionsMock.mockImplementationOnce(() => dRetry.promise);

    let fullPromise!: Promise<void>;
    await act(async () => {
      fullPromise = hook.reload();
    });
    // The retry supersedes ONLY the connections request — last-writer-wins
    // per key; bots/approvals from the full reload must still land.
    await act(async () => {
      void hook.reload('connections');
    });
    await act(async () => {
      dRetry.resolve([{ id: 'c-retry' }]);
    });
    await act(async () => {
      dBots.resolve([{ id: 'b-fresh' }]);
      dAppr.resolve([{ id: 'a-fresh' }]);
      dConnsFull.resolve([{ id: 'c-superseded' }]);
      await fullPromise;
    });

    // Pre-fix bug: the shared sequence counter made the whole full reload
    // early-return — bots/approvals never wrote and stayed 'loading' with no
    // retry affordance in the overview.
    expect(storeState.customBots).toEqual([{ id: 'b-fresh' }]);
    expect(storeState.pendingApprovals).toEqual([{ id: 'a-fresh' }]);
    expect(hook.resources.bots.status).toBe('ok');
    expect(hook.resources.approvals.status).toBe('ok');
    // The newer per-key request owns connections.
    expect(storeState.providerConnections).toEqual([{ id: 'c-retry' }]);
    expect(hook.resources.connections.status).toBe('ok');

    act(() => { renderer.unmount(); });
  });

  it('reload(key) retries only that resource', async () => {
    const renderer = await mount(<HookProbe />);
    vi.clearAllMocks();
    fetchConnectionsMock.mockResolvedValue([{ id: 'c2' }]);

    await act(async () => {
      await hook.reload('connections');
    });

    expect(fetchConnectionsMock).toHaveBeenCalledTimes(1);
    expect(fetchBotsMock).not.toHaveBeenCalled();
    expect(fetchApprovalsMock).not.toHaveBeenCalled();
    expect(storeState.providerConnections).toEqual([{ id: 'c2' }]);

    act(() => { renderer.unmount(); });
  });
});

describe('F17 — AgentStudioStatusOverview marks only the affected resource', () => {
  const baseProps = {
    loading: false,
    agentCount: 2,
    healthyConnections: 1,
    totalConnections: 1,
    pendingApprovalCount: 1,
    onViewPending: vi.fn(),
    styles,
  };

  it('keeps healthy counts, drops the failed count, shows the full error and a labelled retry', async () => {
    const onRetry = vi.fn();
    const renderer = await mount(
      <AgentStudioStatusOverview
        {...baseProps}
        resources={resourcesOf({
          connections: { status: 'error', errorMessage: 'ECONNREFUSED 10.0.0.2:443' } })}
        onRetry={onRetry}
      />);

    const text = allText(renderer.root);
    const flat = text.replace(/\s+/g, '');
    // Healthy segments preserved.
    expect(text).toContain('status.agents');
    expect(text).toContain('status.pendingApprovals');
    // Failed segment does not render "0/0 connections" as confirmed-empty.
    expect(flat).not.toContain('0/0');
    // Only the affected resource is marked, with the full actionable error.
    expect(text).toContain('status.resourceFailed');
    expect(text).toContain('"resource":"status.resources.connections"');
    expect(text).toContain('ECONNREFUSED 10.0.0.2:443');
    expect(text).toContain('status.retryResource');

    // Retry identifies what is being refreshed.
    const retry = renderer.root.findAll(
      (n) => isHost(n, 'Pressable')
        && typeof n.props?.accessibilityLabel === 'string'
        && n.props.accessibilityLabel.includes('status.retryResource'));
    expect(retry).toHaveLength(1);
    act(() => { retry[0].props.onPress(); });
    expect(onRetry).toHaveBeenCalledWith('connections');

    act(() => { renderer.unmount(); });
  });

  it('a stale resource marks its own section while preserving rows', async () => {
    const onRetry = vi.fn();
    const bot = makeBot({ id: 'b1', name: 'Outfit planner', description: 'Suggests outfits' });
    const renderer = await mount(
      <AgentStudioAgentsSection
        loading={false}
        customBots={[bot]}
        botVersions={{}}
        activeAgentSessions={0}
        onPauseAll={vi.fn()}
        stale
        onRetry={onRetry}
        navigation={navigationStub}
        styles={styles}
      />);

    const text = allText(renderer.root);
    // Rows preserved, and the section itself labels the staleness — a
    // scrolled user never reads last-refresh-failed data as fresh.
    expect(text).toContain('Outfit planner');
    expect(text).toContain('status.resourceStale');
    expect(text).toContain('"resource":"status.resources.agents"');

    const retry = renderer.root.findAll(
      (n) => isHost(n, 'Pressable')
        && typeof n.props?.accessibilityLabel === 'string'
        && n.props.accessibilityLabel.includes('status.retryResource'));
    expect(retry).toHaveLength(1);
    act(() => { retry[0].props.onPress(); });
    expect(onRetry).toHaveBeenCalledTimes(1);

    act(() => { renderer.unmount(); });
  });

  it('keeps stale counts on screen and labels them as possibly out of date', async () => {
    const renderer = await mount(
      <AgentStudioStatusOverview
        {...baseProps}
        resources={resourcesOf({
          connections: { status: 'stale', errorMessage: 'timeout' } })}
        onRetry={vi.fn()}
      />);

    const text = allText(renderer.root);
    // Stale data still renders — it is labelled, not hidden or zeroed.
    expect(text.replace(/\s+/g, '')).toContain('1/1');
    expect(text).toContain('status.resourceStale');
    expect(text).toContain('timeout');

    act(() => { renderer.unmount(); });
  });
});

// ── F15 — provider chips: radio semantics + ≥44pt transparent target ────────

describe('F15 — provider chips expose single-select semantics on a full-size target', () => {
  it('renders both providers as radios with selected state and ≥44pt targets', async () => {
    const renderer = await mount(
      <AgentStudioConnectionsSection
        loading={false}
        connections={[]}
        controller={connectionStub as never}
        styles={styles}
      />);

    // Host nodes only (the RN mock renders a forwardRef component + host).
    const radios = renderer.root.findAll(
      (n) => isHost(n, 'Pressable') && n.props?.accessibilityRole === 'radio');
    expect(radios).toHaveLength(2);

    const byLabel = new Map(radios.map((n) => [n.props.accessibilityLabel, n]));
    expect(byLabel.get('OpenAI')?.props.accessibilityState?.selected).toBe(true);
    expect(byLabel.get('Custom')?.props.accessibilityState?.selected).toBe(false);

    for (const radio of radios) {
      const style = flatStyle(radio.props.style);
      expect(style.minHeight).toBeGreaterThanOrEqual(44);
      expect(style.minWidth).toBeGreaterThanOrEqual(44);
    }

    // No unreachable "coming soon" branches remain in the two-provider list.
    expect(allText(renderer.root)).not.toContain('provider.soon');
    expect(allText(renderer.root)).not.toContain('coming soon');

    // Pressing the unselected chip selects it.
    act(() => { byLabel.get('Custom')?.props.onPress(); });
    expect(connectionStub.setConnectProvider).toHaveBeenCalledWith('custom');

    act(() => { renderer.unmount(); });
  });
});

// ── F16 — agent rows lead with purpose; runtime/version demoted ─────────────

describe('F16 — agent rows lead with purpose before implementation metadata', () => {
  it('renders description as the purpose line and runtime/version as quiet metadata', async () => {
    const bot = makeBot({
      id: 'b1',
      name: 'Outfit planner for weekday listings',
      description: 'Suggests outfits from saved wardrobe items',
      runtimeMode: 'ai',
      runtimeReady: true });
    const renderer = await mount(
      <AgentStudioAgentsSection
        loading={false}
        customBots={[bot]}
        botVersions={{ b1: [{ versionNumber: 3 }] }}
        activeAgentSessions={0}
        onPauseAll={vi.fn()}
        navigation={navigationStub}
        styles={styles}
      />);

    const text = allText(renderer.root);
    expect(text).toContain('Outfit planner for weekday listings');
    expect(text).toContain('Suggests outfits from saved wardrobe items');
    expect(text).toContain('agentStatus.published');
    // Runtime/version demoted — still present but as detail metadata.
    expect(text.replace(/\s+/g, '')).toContain('AI·v3');

    // The name is not clamped to a single line, so it can reflow beside the
    // status at large text.
    const nameNode = renderer.root
      .findAll((n) => isHost(n, 'Text'))
      .find((n) => collectText(n).join('') === 'Outfit planner for weekday listings');
    expect(nameNode?.props.numberOfLines).not.toBe(1);

    act(() => { renderer.unmount(); });
  });

  it('leads with the actionable readiness reason when runtime is not ready', async () => {
    const bot = makeBot({
      id: 'b2',
      name: 'Moderation helper',
      description: 'Keeps chats tidy',
      runtimeMode: 'ai',
      runtimeReady: false,
      runtimeReadinessReason: 'Connect a provider key to enable AI runtime' });
    const renderer = await mount(
      <AgentStudioAgentsSection
        loading={false}
        customBots={[bot]}
        botVersions={{}}
        activeAgentSessions={0}
        onPauseAll={vi.fn()}
        navigation={navigationStub}
        styles={styles}
      />);

    const text = allText(renderer.root);
    // The actionable setup issue wins over the plain description.
    expect(text).toContain('Connect a provider key to enable AI runtime');
    expect(text).toContain('agentStatus.setupNeeded');

    act(() => { renderer.unmount(); });
  });

  it('a failed bots fetch shows the error instead of a confirmed-empty state', async () => {
    const renderer = await mount(
      <AgentStudioAgentsSection
        loading={false}
        customBots={[]}
        botVersions={{}}
        activeAgentSessions={0}
        onPauseAll={vi.fn()}
        loadError="HTTP 503"
        onRetry={vi.fn()}
        navigation={navigationStub}
        styles={styles}
      />);

    const text = allText(renderer.root);
    expect(text).toContain('agents.loadFailed');
    expect(text).toContain('HTTP 503');
    expect(text).not.toContain('agents.empty');

    act(() => { renderer.unmount(); });
  });
});
