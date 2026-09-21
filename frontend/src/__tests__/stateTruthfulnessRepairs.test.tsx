import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Repair-round-5 regression tests — every test FAILS on the pre-repair code.
 *
 *  - P1-1  useDiscoveryContent: no request-identity guard — a stale load
 *          could overwrite fresher module data, re-mark a just-refreshed
 *          module as stale, or clear isDiscoveryLoading while a newer load
 *          was still in flight.
 *  - P1-2  BackendDataContext.refreshListings: unsequenced — a slower older
 *          response could roll back the app-wide feed, a stale failure
 *          could downgrade fresh content to source:'cache', and the first
 *          finisher cleared isSyncing under a second in-flight refresh.
 *  - P1-3  VisualSearch "Clear filters" re-dispatched the PRE-clear filter
 *          payload through a stale runSearch closure.
 *  - P2    moodboard multi-delete / bring-to-front never reconciled the
 *          canvas after a partial server success.
 *  - P2    moodboard history recorded transform/theme inverses before the
 *          forward mutation's outcome was known.
 *  - P2    branded wallet CTAs rendered while capability was unverified
 *          (fail-open fallback).
 *  - P2    useForYouFeed same-identity refreshes were not serialized.
 *  - P2    LiveShoppingHomeScreen.load had no epoch guard.
 *  - P3    ListingQA fabricated "just now" for unparseable timestamps.
 *  - P2-5  MAX_FONT_SCALE named tiers adopted in campaign-touched files.
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
  scrimTextPrimary: '#ffffff',
  border: '#e0e0e0',
  borderSubtle: '#f0f0f0',
  brand: '#0066cc',
  brandSubtle: '#e6f0ff',
  success: '#00aa44',
  successText: '#007a33',
  dangerText: '#cc0000',
  overlay: 'rgba(0,0,0,0.5)',
};

vi.mock('../theme/ThemeContext', () => ({
  useAppTheme: () => ({ colors: mockColors, isDark: false }),
}));

vi.mock('../i18n/useAppTranslation', () => {
  const t = (key: string) => key;
  return { useAppTranslation: () => ({ t }) };
});

vi.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: vi.fn(), goBack: vi.fn() }),
  useRoute: () => ({ params: {} }),
  useFocusEffect: () => {},
  useScrollToTop: () => {},
}));

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

vi.mock('../hooks/useFormattedPrice', () => ({
  useFormattedPrice: () => ({
    formatFromFiat: (v: number) => `£${v.toFixed(2)}`,
    currencySymbol: '£',
  }),
}));

vi.mock('../context/ToastContext', () => ({
  useToast: () => ({ show: vi.fn() }),
}));

vi.mock('../hooks/useSignupWall', () => ({
  useSignupWall: () => ({ requireAuth: () => true }),
}));

const storeState = vi.hoisted(() => ({
  currentUser: { id: 'viewer-1', username: 'viewer' } as { id: string; username: string } | null,
}));
vi.mock('../store/useStore', () => {
  const useStore: any = (selector: (s: typeof storeState) => unknown) => selector(storeState);
  useStore.getState = () => storeState;
  return { useStore };
});

// ── API boundaries ──────────────────────────────────────────────────────────

const fetchJsonMock = vi.hoisted(() => vi.fn());
vi.mock('../lib/apiClient', () => ({
  fetchJson: fetchJsonMock,
  getApiBaseUrl: () => 'http://localhost:3000',
  parseApiError: (err: unknown, fallback: string) => ({
    message: err instanceof Error ? err.message : fallback,
  }),
}));

const fetchHomeFeedMock = vi.hoisted(() => vi.fn());
vi.mock('../services/feedApi', () => ({
  fetchHomeFeed: (...args: unknown[]) => fetchHomeFeedMock(...args),
}));

vi.mock('../constants/runtimeFlags', () => ({
  ENABLE_RUNTIME_MOCKS: false,
  IS_INTEGRATION_TRUTH_MODE: false,
  MOCK_MODE: 'integration-truth',
  SHOW_BACKEND_DIAGNOSTICS: false,
}));

vi.mock('../lib/backendDiagnostics', () => ({
  recordListingsSync: vi.fn(),
}));

vi.mock('../data/mockData', () => ({
  MOCK_LISTINGS: [],
  MOCK_USERS: [],
}));

vi.mock('../dev/BackendDiagnosticsOverlay', () => ({
  BackendDiagnosticsOverlay: () => null,
}));

const fetchLooksMock = vi.hoisted(() => vi.fn());
vi.mock('../services/looksApi', () => ({
  fetchLooksFromApi: (...args: unknown[]) => fetchLooksMock(...args),
}));

const fetchPostersMock = vi.hoisted(() => vi.fn());
vi.mock('../services/postersApi', () => ({
  fetchPosterStories: (...args: unknown[]) => fetchPostersMock(...args),
}));

const fetchCollectionsMock = vi.hoisted(() => vi.fn());
const fetchEditorialsMock = vi.hoisted(() => vi.fn());
vi.mock('../services/galleriaApi', () => ({
  fetchGalleriaCollections: (...args: unknown[]) => fetchCollectionsMock(...args),
  fetchGalleriaEditorials: (...args: unknown[]) => fetchEditorialsMock(...args),
}));

const fetchPublicMoodboardsMock = vi.hoisted(() => vi.fn());
const fetchMoodboardDetailMock = vi.hoisted(() => vi.fn());
const removeItemMock = vi.hoisted(() => vi.fn());
const reorderItemMock = vi.hoisted(() => vi.fn());
vi.mock('../services/moodboardApi', () => ({
  fetchPublicMoodboards: (...args: unknown[]) => fetchPublicMoodboardsMock(...args),
  fetchMoodboardDetail: (...args: unknown[]) => fetchMoodboardDetailMock(...args),
  addItemToMoodboard: vi.fn(),
  removeItemFromMoodboard: (...args: unknown[]) => removeItemMock(...args),
  reorderItem: (...args: unknown[]) => reorderItemMock(...args),
  publishMoodboardAsPoster: vi.fn(),
}));

vi.mock('../services/listingMapper', () => ({
  mapBackendListingToListing: (row: { id: string }) => ({
    id: row.id,
    sellerId: `seller-${row.id}`,
    title: `Listing ${row.id}`,
  }),
  isDisplayReadyListing: () => true,
}));

const fetchLiveSessionsMock = vi.hoisted(() => vi.fn());
vi.mock('../services/liveShoppingApi', () => ({
  fetchLiveSessions: (...args: unknown[]) => fetchLiveSessionsMock(...args),
}));

vi.mock('../components/live/liveBroadcastApi', () => ({
  remindBroadcastSession: vi.fn(() => Promise.resolve()),
  unremindBroadcastSession: vi.fn(() => Promise.resolve()),
  persistLocalReminder: vi.fn(() => Promise.resolve()),
  LiveRemindersUnavailableError: class LiveRemindersUnavailableError extends Error {},
}));

vi.mock('../components/live/SessionCards', () => {
  const React = require('react');
  return {
    LiveSessionCard: ({ session }: { session: { id: string } }) =>
      React.createElement('Text', null, `LIVE-CARD ${session.id}`),
    UpcomingSessionRow: () => null,
    ReplaySessionCard: () => null,
    LIVE_CARD_WIDTH: 280,
    UPCOMING_THUMB_SIZE: 56,
  };
});

const fetchQuestionsMock = vi.hoisted(() => vi.fn());
vi.mock('../services/listingsApi', () => ({
  fetchListingQuestions: (...args: unknown[]) => fetchQuestionsMock(...args),
  askListingQuestion: vi.fn(),
  answerListingQuestion: vi.fn(),
}));

vi.mock('../storage/db', () => ({ isDbAvailable: () => false }));
vi.mock('../storage/moodboardOutbox', () => ({
  clearMoodboardOutboxForBoard: vi.fn(() => Promise.resolve()),
}));
vi.mock('../utils/createStableId', () => ({
  createStableId: (prefix: string) => `${prefix}-test`,
}));

// ── Component boundary mocks ────────────────────────────────────────────────

vi.mock('../components/AnimatedPressable', () => {
  const React = require('react');
  return {
    AnimatedPressable: React.forwardRef((props: Record<string, unknown>, ref: unknown) =>
      React.createElement('Pressable', { ref, ...props })),
  };
});

vi.mock('../components/HorizontalRail', () => {
  const React = require('react');
  return {
    HorizontalRail: (props: { children?: React.ReactNode }) =>
      React.createElement('View', null, props.children),
  };
});

vi.mock('../components/OfflineBanner', () => {
  const React = require('react');
  return {
    OfflineBanner: (props: { onRetry?: () => void }) =>
      React.createElement('Pressable', { testID: 'offline-retry', onPress: props.onRetry }),
  };
});

vi.mock('../components/flagship', () => {
  const React = require('react');
  return {
    FlagshipScreen: (props: { children?: React.ReactNode; header?: React.ReactNode }) =>
      React.createElement('View', null, props.header, props.children),
    FlagshipHeader: () => null,
    FlagshipState: (props: { title?: string; actionLabel?: string; onAction?: () => void }) =>
      React.createElement('View', null,
        React.createElement('Text', null, props.title),
        props.actionLabel
          ? React.createElement('Pressable', { accessibilityLabel: props.actionLabel, onPress: props.onAction })
          : null),
    SkeletonBlock: () => null,
    SkeletonTextLine: () => null,
  };
});

vi.mock('../components/commerce/detail', () => {
  const React = require('react');
  return {
    CommerceDetailUnavailableInline: (props: { title?: string; body?: string; onRetry?: () => void }) =>
      React.createElement('View', null,
        React.createElement('Text', null, props.title),
        props.body ? React.createElement('Text', null, props.body) : null,
        props.onRetry
          ? React.createElement('Pressable', { testID: 'inline-retry', onPress: props.onRetry })
          : null),
    CommerceDetailSection: (props: { children?: React.ReactNode }) =>
      React.createElement('View', null, props.children),
  };
});

// ── Imports under test (after mocks) ────────────────────────────────────────

import { useDiscoveryContent } from '../hooks/discovery/useDiscoveryContent';
import { BackendDataProvider, useBackendData } from '../context/BackendDataContext';
import { useVisualSearchFilters } from '../hooks/visualsearch/useVisualSearchFilters';
import { useForYouFeed } from '../hooks/useForYouFeed';
import { useMoodboardMutations } from '../components/moodboard/useMoodboardMutations';
import { useMoodboardHistory } from '../components/moodboard/useMoodboardHistory';
import { isPaymentMethodAllowed } from '../utils/capabilityPolicy';
import LiveShoppingHomeScreen from '../screens/LiveShoppingHomeScreen';
import { ListingQA } from '../components/product/ListingQA';
import type { Listing } from '../domain';
import type { Moodboard, MoodboardItem, MoodboardItemPosition } from '../services/moodboardApi';
import type { useMoodboardBoard, SubmitBoardOpsOutcome } from '../components/moodboard/useMoodboardBoard';
import type { useMoodboardSelection } from '../components/moodboard/useMoodboardSelection';
import type { MoodboardQueuedOp } from '../components/moodboard/moodboardHistory';

// ── Helpers ─────────────────────────────────────────────────────────────────

const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

async function mount(el: React.ReactElement) {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(el);
  });
  return renderer;
}

function allText(renderer: TestRenderer.ReactTestRenderer): string[] {
  const out: string[] = [];
  const walk = (node: TestRenderer.ReactTestInstance | string) => {
    if (typeof node === 'string') {
      out.push(node);
      return;
    }
    for (const child of node.children) {
      if (typeof child === 'string') out.push(child);
      else walk(child as TestRenderer.ReactTestInstance);
    }
  };
  walk(renderer.root);
  return out;
}

const hasText = (renderer: TestRenderer.ReactTestRenderer, s: string) =>
  allText(renderer).some((t) => t.includes(s));

const findHost = (renderer: TestRenderer.ReactTestRenderer, type: string) =>
  renderer.root.findAll((n) => n.type === type);

function readSource(rel: string): string {
  return readFileSync(resolve(__dirname, '..', rel), 'utf-8');
}

const listing = (id: string): Listing =>
  ({ id, sellerId: `seller-${id}`, title: `Listing ${id}` }) as unknown as Listing;

const feedPage = (ids: string[], nextCursor: string | null = null) => ({
  listings: ids.map(listing),
  posterIds: [],
  lookIds: [],
  source: 'api' as const,
  nextCursor,
});

const POS: MoodboardItemPosition = { x: 0.5, y: 0.5, scale: 1, rotation: 0 };

function makeItem(id: string): MoodboardItem {
  return {
    id,
    sourceType: 'listing',
    listingId: `listing-${id}`,
    sourceLookId: null,
    mediaAssetId: null,
    imageUri: `https://img/${id}.jpg`,
    videoUri: '',
    mediaType: 'image',
    title: `Item ${id}`,
    caption: '',
    price: 10,
    aspectRatio: 1,
    position: POS,
    addedAt: '2026-01-01T00:00:00.000Z',
    isDemo: false,
    revision: 1,
  };
}

function makeBoard(itemIds: string[]): Moodboard {
  return {
    id: 'board-1',
    title: 'Board',
    description: '',
    curator: 'curator',
    curatorAvatar: '',
    items: itemIds.map(makeItem),
    coverImage: '',
    isPublic: false,
    theme: 'theme-linen',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    creatorId: 'user-1',
    viewerRole: 'owner',
    isDemo: false,
    revision: 3,
    deletedAt: null,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// P1-1 — useDiscoveryContent epoch guard
// ════════════════════════════════════════════════════════════════════════════

type DiscoveryHook = ReturnType<typeof useDiscoveryContent>;
let discovery!: DiscoveryHook;
const DiscoveryProbe = () => {
  discovery = useDiscoveryContent();
  return null;
};

/** Queue the five module fetches for two overlapping loads: A (older) then
 *  B (newer). Each returns the per-call deferred so the test controls
 *  resolution order. */
function queueDiscoveryLoads() {
  const looksA = deferred<any>();
  const postersA = deferred<any>();
  const boardsA = deferred<any>();
  const colsA = deferred<any>();
  const edsA = deferred<any>();
  const looksB = deferred<any>();
  const postersB = deferred<any>();
  const boardsB = deferred<any>();
  const colsB = deferred<any>();
  const edsB = deferred<any>();
  fetchLooksMock
    .mockImplementationOnce(() => looksA.promise)
    .mockImplementationOnce(() => looksB.promise);
  fetchPostersMock
    .mockImplementationOnce(() => postersA.promise)
    .mockImplementationOnce(() => postersB.promise);
  fetchPublicMoodboardsMock
    .mockImplementationOnce(() => boardsA.promise)
    .mockImplementationOnce(() => boardsB.promise);
  fetchCollectionsMock
    .mockImplementationOnce(() => colsA.promise)
    .mockImplementationOnce(() => colsB.promise);
  fetchEditorialsMock
    .mockImplementationOnce(() => edsA.promise)
    .mockImplementationOnce(() => edsB.promise);
  return {
    A: { looksA, postersA, boardsA, colsA, edsA },
    B: { looksB, postersB, boardsB, colsB, edsB },
  };
}

const resolveDiscoveryLoad = (
  d: { looksA?: any; postersA?: any; boardsA?: any; colsA?: any; edsA?: any } & Record<string, any>,
  tag: string,
) => {
  const looks = d.looksA ?? d.looksB;
  const posters = d.postersA ?? d.postersB;
  const boards = d.boardsA ?? d.boardsB;
  const cols = d.colsA ?? d.colsB;
  const eds = d.edsA ?? d.edsB;
  looks.resolve({ items: [{ id: `look-${tag}` }] });
  posters.resolve({ items: [{ id: `poster-${tag}` }] });
  boards.resolve([{ id: `mb-${tag}`, isDemo: false }]);
  cols.resolve([{ id: `col-${tag}` }]);
  eds.resolve([{ id: `ed-${tag}` }]);
};

describe('P1-1 — useDiscoveryContent request identity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('drops a stale load that resolves after a newer load committed', async () => {
    const { A, B } = queueDiscoveryLoads();
    const renderer = await mount(<DiscoveryProbe />);
    // Load A (mount) is in flight — issue load B (pull-to-refresh).
    let pB!: Promise<void>;
    await act(async () => {
      pB = discovery.loadDiscoveryContent();
    });

    // The NEWER load settles first and commits fresh module data.
    await act(async () => {
      resolveDiscoveryLoad(B, 'new');
      await pB;
    });
    expect(discovery.looks[0]?.id).toBe('look-new');
    expect(discovery.isDiscoveryLoading).toBe(false);

    // The OLDER load settles last — every write belongs to a dead epoch.
    // Pre-repair: line 63 re-wrote staleModules and the module arrays with
    // the older snapshot.
    await act(async () => {
      resolveDiscoveryLoad(A, 'stale');
      await Promise.resolve();
    });
    expect(discovery.looks[0]?.id).toBe('look-new');
    expect(discovery.posters[0]?.id).toBe('poster-new');
    expect(discovery.staleModules).toEqual([]);
    expect(discovery.discoveryError).toBeNull();

    act(() => { renderer.unmount(); });
  });

  it('a stale load whose module rejected cannot re-mark a just-refreshed module stale', async () => {
    const { A, B } = queueDiscoveryLoads();
    const renderer = await mount(<DiscoveryProbe />);
    let pB!: Promise<void>;
    await act(async () => {
      pB = discovery.loadDiscoveryContent();
    });

    // Newer load: looks succeeds — the module is fresh.
    await act(async () => {
      resolveDiscoveryLoad(B, 'new');
      await pB;
    });
    expect(discovery.staleModules).toEqual([]);

    // Older load: its looks request REJECTED — last-writer-wins would
    // render "Looks couldn't load. Tap to retry." over fresh content.
    await act(async () => {
      A.looksA.reject(new Error('stale failure'));
      A.postersA.resolve({ items: [{ id: 'poster-stale' }] });
      A.boardsA.resolve([]);
      A.colsA.resolve([]);
      A.edsA.resolve([]);
      await Promise.resolve();
    });
    expect(discovery.staleModules).toEqual([]);
    expect(discovery.looks[0]?.id).toBe('look-new');
    expect(discovery.discoveryError).toBeNull();

    act(() => { renderer.unmount(); });
  });

  it('holds isDiscoveryLoading until the LATEST load settles, not the first finisher', async () => {
    const { A, B } = queueDiscoveryLoads();
    const renderer = await mount(<DiscoveryProbe />);
    let pB!: Promise<void>;
    await act(async () => {
      pB = discovery.loadDiscoveryContent();
    });

    // Older load finishes FIRST — the pre-repair code cleared the flag here
    // while the newer load was still in flight.
    await act(async () => {
      resolveDiscoveryLoad(A, 'stale');
      await Promise.resolve();
    });
    expect(discovery.isDiscoveryLoading).toBe(true);

    await act(async () => {
      resolveDiscoveryLoad(B, 'new');
      await pB;
    });
    expect(discovery.isDiscoveryLoading).toBe(false);
    expect(discovery.looks[0]?.id).toBe('look-new');

    act(() => { renderer.unmount(); });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// P1-2 — BackendDataContext.refreshListings sequencing
// ════════════════════════════════════════════════════════════════════════════

type BackendCtx = ReturnType<typeof useBackendData>;
let backend!: BackendCtx;
const BackendProbe = () => {
  backend = useBackendData();
  return null;
};

describe('P1-2 — refreshListings is sequenced latest-wins', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchHomeFeedMock.mockResolvedValue(feedPage([]));
  });

  it('a stale failed refresh cannot downgrade fresh content to cache', async () => {
    const dA = deferred<any>();
    const dB = deferred<any>();
    fetchHomeFeedMock
      .mockImplementationOnce(() => dA.promise)
      .mockImplementationOnce(() => dB.promise);

    const renderer = await mount(
      <BackendDataProvider>
        <BackendProbe />
      </BackendDataProvider>,
    );
    // Mount refresh A in flight; pull-to-refresh issues B.
    let pB!: Promise<void>;
    await act(async () => {
      pB = backend.refreshListings();
    });

    // Newer refresh lands first with fresh content.
    await act(async () => {
      dB.resolve(feedPage(['fresh-1', 'fresh-2'], 'cursor-9'));
      await pB;
    });
    expect(backend.listings.map((l) => l.id)).toEqual(['fresh-1', 'fresh-2']);
    expect(backend.source).toBe('api');
    // A is still in flight — isSyncing tracks the in-flight COUNT, so the
    // first finisher must not clear it (pre-repair cleared on first settle).
    expect(backend.isSyncing).toBe(true);

    // Older refresh resolves last as a FAILURE — pre-repair it set
    // lastError + source:'cache' over the newer successful refresh.
    await act(async () => {
      dA.resolve({ ...feedPage([]), error: 'stale network down', failed: true });
      await Promise.resolve();
    });
    expect(backend.listings.map((l) => l.id)).toEqual(['fresh-1', 'fresh-2']);
    expect(backend.source).toBe('api');
    expect(backend.lastError).toBeNull();
    expect(backend.isSyncing).toBe(false);

    act(() => { renderer.unmount(); });
  });

  it('a stale successful refresh cannot roll back a newer feed snapshot', async () => {
    const dA = deferred<any>();
    const dB = deferred<any>();
    fetchHomeFeedMock
      .mockImplementationOnce(() => dA.promise)
      .mockImplementationOnce(() => dB.promise);

    const renderer = await mount(
      <BackendDataProvider>
        <BackendProbe />
      </BackendDataProvider>,
    );
    let pB!: Promise<void>;
    await act(async () => {
      pB = backend.refreshListings();
    });

    await act(async () => {
      dB.resolve(feedPage(['new'], 'cursor-2'));
      await pB;
    });

    await act(async () => {
      dA.resolve(feedPage(['old'], 'cursor-1'));
      await Promise.resolve();
    });
    expect(backend.listings.map((l) => l.id)).toEqual(['new']);
    expect(backend.isSyncing).toBe(false);

    act(() => { renderer.unmount(); });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// P1-3 — visual-search "Clear filters" must not dispatch the pre-clear payload
// ════════════════════════════════════════════════════════════════════════════

type FiltersHook = ReturnType<typeof useVisualSearchFilters>;
let filters!: FiltersHook;
const FiltersProbe = () => {
  filters = useVisualSearchFilters();
  return null;
};

describe('P1-3 — clear-then-research uses the cleared payload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchHomeFeedMock.mockResolvedValue(feedPage([]));
  });

  it('a payload builder captured before the clear still produces the cleared payload', async () => {
    const renderer = await mount(
      <BackendDataProvider>
        <FiltersProbe />
      </BackendDataProvider>,
    );

    await act(async () => {
      filters.setDescription('vintage');
      filters.setSelectedCategory('coats');
      filters.setBrand('barbour');
    });
    // The screen's stale runSearch closure calls the payload builder it
    // captured at render time — simulate that exact capture.
    const capturedBuild = filters.buildFilterPayload;
    expect(capturedBuild().query).toBe('vintage');

    await act(async () => {
      filters.clearFields();
    });

    // Pre-repair: buildFilterPayload was a useCallback closed over the
    // pre-clear filter state — the captured builder re-dispatched
    // 'vintage'/'coats'/'barbour' while the UI showed every field empty.
    const payload = capturedBuild();
    expect(payload.query).toBeUndefined();
    expect(payload.category).toBeUndefined();
    expect(payload.brand).toBeUndefined();
    expect(filters.hasActiveFilters).toBe(false);

    act(() => { renderer.unmount(); });
  });

  it('handleClearFilters no longer re-dispatches runSearch through a deferred stale closure', () => {
    const src = readSource('screens/VisualSearchScreen.tsx');
    const handler = src.match(/const handleClearFilters = useCallback\(\(\) => \{([\s\S]*?)\}, \[/);
    expect(handler).toBeTruthy();
    // Pre-repair: setTimeout(() => void runSearch(), 0) still invoked the
    // runSearch captured BEFORE the clear — a stale-closure dispatch.
    expect(handler![1]).not.toMatch(/setTimeout\s*\(/);
    expect(handler![1]).toContain('void runSearch()');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// P2 — moodboard multi-delete / bring-to-front reconcile on partial failure
// ════════════════════════════════════════════════════════════════════════════

let boardState: Moodboard;
const setMoodboardSpy = vi.fn((mb: Moodboard | null) => {
  if (mb) boardState = mb;
});

const mutationsBoard = {
  get moodboard() {
    return boardState;
  },
  setMoodboard: (mb: Moodboard | null) => setMoodboardSpy(mb),
  setSaving: vi.fn(),
  setSyncStatus: vi.fn(),
  setConflictDetail: vi.fn(),
  setActiveThemeId: vi.fn(),
  boardRevisionRef: { current: 3 },
  submitBoardOps: vi.fn(async (_ops: MoodboardQueuedOp[]): Promise<SubmitBoardOpsOutcome> => 'applied'),
  loadAll: vi.fn(async () => {}),
} as unknown as ReturnType<typeof useMoodboardBoard>;

const mutationsSelection = {
  selectedItemId: null,
  selectedItemIds: new Set<string>(['a', 'b']),
  setSelectedItemId: vi.fn(),
  setSelectedItemIds: vi.fn(),
  setMultiSelectMode: vi.fn(),
} as unknown as ReturnType<typeof useMoodboardSelection>;

let mutations!: ReturnType<typeof useMoodboardMutations>;
const MutationsProbe = () => {
  mutations = useMoodboardMutations({ board: mutationsBoard, selection: mutationsSelection });
  return null;
};

describe('P2 — moodboard fan-out mutations reconcile on partial failure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    boardState = makeBoard(['a', 'b', 'c']);
    mutationsSelection.selectedItemIds = new Set(['a', 'b']);
    setMoodboardSpy.mockImplementation((mb: Moodboard | null) => {
      if (mb) boardState = mb;
    });
  });

  it('handleDeleteSelected reconciles the canvas when only some deletes persisted', async () => {
    // 'a' deletes server-side; 'b' fails — the server board still has b,c.
    removeItemMock.mockImplementation((_boardId: string, id: string) =>
      id === 'a' ? Promise.resolve(true) : Promise.reject(new Error('down')),
    );
    fetchMoodboardDetailMock.mockResolvedValue(makeBoard(['b', 'c']));

    const renderer = await mount(<MutationsProbe />);
    let ok = true;
    await act(async () => {
      ok = await mutations.handleDeleteSelected();
    });

    expect(ok).toBe(false);
    // Pre-repair: the catch returned false without re-fetching — the canvas
    // kept rendering items the server no longer has.
    expect(fetchMoodboardDetailMock).toHaveBeenCalledWith('board-1');
    expect(boardState.items.map((it) => it.id)).toEqual(['b', 'c']);

    act(() => { renderer.unmount(); });
  });

  it('handleBringAllToFront reconciles layer order when a reorder prefix persisted', async () => {
    reorderItemMock
      .mockImplementationOnce(() => Promise.resolve(true))
      .mockImplementationOnce(() => Promise.reject(new Error('down')));
    // Server truth after the partial reorder: only 'a' moved to front.
    fetchMoodboardDetailMock.mockResolvedValue(makeBoard(['b', 'c', 'a']));

    const renderer = await mount(<MutationsProbe />);
    let ok = true;
    await act(async () => {
      ok = await mutations.handleBringAllToFront();
    });

    expect(ok).toBe(false);
    expect(fetchMoodboardDetailMock).toHaveBeenCalledWith('board-1');
    expect(boardState.items.map((it) => it.id)).toEqual(['b', 'c', 'a']);

    act(() => { renderer.unmount(); });
  });

  it('handleDeleteSelected still reports success when every delete resolves', async () => {
    removeItemMock.mockResolvedValue(true);
    fetchMoodboardDetailMock.mockResolvedValue(makeBoard(['c']));

    const renderer = await mount(<MutationsProbe />);
    let ok = false;
    await act(async () => {
      ok = await mutations.handleDeleteSelected();
    });

    expect(ok).toBe(true);
    expect(boardState.items.map((it) => it.id)).toEqual(['c']);

    act(() => { renderer.unmount(); });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// P2 — history entries for transform/theme record only on applied/queued
// ════════════════════════════════════════════════════════════════════════════

const historyMutations = {
  handlePositionCommit: vi.fn(async (_id: string, _p: MoodboardItemPosition): Promise<SubmitBoardOpsOutcome> => 'applied'),
  handleThemeChange: vi.fn(async (_t: string): Promise<SubmitBoardOpsOutcome> => 'applied'),
  handleAddItem: vi.fn(async () => null),
  handleDeleteItem: vi.fn(async () => true),
  handleReorder: vi.fn(async () => true),
  handleDeleteSelected: vi.fn(async () => true),
  handleBringAllToFront: vi.fn(async () => true),
  handleKeepLocalVersion: vi.fn(async () => {}),
  handleKeepServerVersion: vi.fn(async () => {}),
} as unknown as ReturnType<typeof useMoodboardMutations>;

const historyBoard = {
  get moodboard() {
    return boardState;
  },
  setMoodboard: (mb: Moodboard | null) => {
    if (mb) boardState = mb;
  },
  setActiveThemeId: vi.fn(),
  submitBoardOps: vi.fn(async (): Promise<SubmitBoardOpsOutcome> => 'applied'),
  reconcileBoard: vi.fn(async () => {}),
} as unknown as ReturnType<typeof useMoodboardBoard>;

const historySelection = {
  selectedItemId: null,
  selectedItemIds: new Set<string>(),
  setSelectedItemId: vi.fn(),
  setSelectedItemIds: vi.fn(),
} as unknown as ReturnType<typeof useMoodboardSelection>;

let history!: ReturnType<typeof useMoodboardHistory>;
const HistoryProbe = () => {
  history = useMoodboardHistory({ board: historyBoard, selection: historySelection, mutations: historyMutations });
  return null;
};

describe('P2 — history records transform/theme only on applied/queued', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    boardState = makeBoard(['a', 'b']);
  });

  it('a failed position commit records NO undo entry', async () => {
    (historyMutations.handlePositionCommit as ReturnType<typeof vi.fn>)
      .mockResolvedValue('failed');
    const renderer = await mount(<HistoryProbe />);

    await act(async () => {
      await history.handlePositionCommit('a', { x: 0.9, y: 0.5, scale: 1, rotation: 0 });
    });
    // Pre-repair recorded the inverse eagerly — a failed drag landed on the
    // undo stack claiming an applied edit.
    expect(history.canUndo).toBe(false);

    act(() => { renderer.unmount(); });
  });

  it('a queued position commit DOES record the inverse (durable intent)', async () => {
    (historyMutations.handlePositionCommit as ReturnType<typeof vi.fn>)
      .mockResolvedValue('queued');
    const renderer = await mount(<HistoryProbe />);

    await act(async () => {
      await history.handlePositionCommit('a', { x: 0.9, y: 0.5, scale: 1, rotation: 0 });
    });
    expect(history.canUndo).toBe(true);

    act(() => { renderer.unmount(); });
  });

  it('a failed theme change records NO undo entry; an applied one does', async () => {
    (historyMutations.handleThemeChange as ReturnType<typeof vi.fn>)
      .mockResolvedValue('failed');
    const renderer = await mount(<HistoryProbe />);

    await act(async () => {
      await history.handleThemeChange('theme-slate');
    });
    expect(history.canUndo).toBe(false);

    (historyMutations.handleThemeChange as ReturnType<typeof vi.fn>)
      .mockResolvedValue('applied');
    boardState = { ...boardState, theme: 'theme-linen' };
    await act(async () => {
      await history.handleThemeChange('theme-slate');
    });
    expect(history.canUndo).toBe(true);

    act(() => { renderer.unmount(); });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// P2-3 — branded wallet CTAs fail closed on unverified capability
// ════════════════════════════════════════════════════════════════════════════

describe('P2-3 — payment capability policy fails closed for branded tenders', () => {
  it('an unverified capability never backs a branded tender', () => {
    // Pre-repair: isPaymentMethodAllowed(null, 'apple_pay') === true.
    expect(isPaymentMethodAllowed(null, 'apple_pay', false)).toBe(false);
    expect(isPaymentMethodAllowed(null, 'google_pay', false)).toBe(false);
    expect(isPaymentMethodAllowed(undefined, 'apple_pay', false)).toBe(false);
  });

  it('the card rail keeps its fail-open default while branded CTAs opt out', () => {
    expect(isPaymentMethodAllowed(null, 'card')).toBe(true);
    // A verified payload that omits the method still fails closed.
    const caps = { payments: { methodTypes: ['card'] } } as Parameters<typeof isPaymentMethodAllowed>[0];
    expect(isPaymentMethodAllowed(caps, 'apple_pay', false)).toBe(false);
    const withApple = { payments: { methodTypes: ['apple_pay'] } } as Parameters<typeof isPaymentMethodAllowed>[0];
    expect(isPaymentMethodAllowed(withApple, 'apple_pay', false)).toBe(true);
  });

  it('CheckoutScreen passes the fail-closed fallback to both branded CTAs', () => {
    const src = readSource('screens/CheckoutScreen.tsx');
    // Pre-repair: no third argument — the default fallback rendered the
    // branded button next to "Could not verify payment capabilities".
    expect(src).toContain("isPaymentMethodAllowed(checkoutCapabilities, 'apple_pay', false)");
    expect(src).toContain("isPaymentMethodAllowed(checkoutCapabilities, 'google_pay', false)");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// P2-4 — same-identity refreshes are serialized in useForYouFeed
// ════════════════════════════════════════════════════════════════════════════

type FeedHook = ReturnType<typeof useForYouFeed>;
let feed!: FeedHook;
const FeedProbe = () => {
  feed = useForYouFeed();
  return null;
};

const recPage = (ids: string[]) => ({
  source: 'decision_service',
  serveMode: 'personalized',
  intentVersion: 1,
  decision: {
    requestId: `req-${ids.join('-') || 'empty'}`,
    policyVersion: 'p1',
    featureSchemaVersion: 'f1',
    capabilityLevel: 'full',
    trainedModel: true,
    generatedAt: '2026-01-01T00:00:00Z',
    explorationRate: 0.1,
    coldStart: false,
    diagnostics: {},
  },
  items: ids.map((id, i) => ({
    listing: { id },
    score: 0.9 - i * 0.05,
    model: 'm1',
    policy: 'exploit' as const,
    position: i,
    reasonCodes: [] as string[],
    componentScores: {},
  })),
});

describe('P2-4 — same-identity refresh dedup in useForYouFeed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storeState.currentUser = { id: 'u1', username: 'u1' };
  });

  it('a refresh issued while the mount load is in flight does not open a second request', async () => {
    const d1 = deferred<any>();
    fetchJsonMock.mockImplementationOnce(() => d1.promise);
    const renderer = await mount(<FeedProbe />);
    expect(fetchJsonMock).toHaveBeenCalledTimes(1);

    // Pre-repair: refresh() shared one epoch with the in-flight mount load,
    // so a second request raced it last-writer-wins.
    await act(async () => {
      await feed.refresh();
    });
    expect(fetchJsonMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      d1.resolve(recPage(['a']));
    });
    expect(feed.listings.map((l) => l.id)).toEqual(['a']);
    expect(feed.isLoading).toBe(false);
    expect(feed.isRefreshing).toBe(false);

    act(() => { renderer.unmount(); });
  });

  it('two overlapping refreshes settle as one request', async () => {
    const d1 = deferred<any>();
    const d2 = deferred<any>();
    fetchJsonMock
      .mockImplementationOnce(() => d1.promise)
      .mockImplementationOnce(() => d2.promise);
    const renderer = await mount(<FeedProbe />);
    await act(async () => {
      d1.resolve(recPage(['a']));
    });

    let p!: Promise<void>;
    await act(async () => {
      p = feed.refresh();
      // Second refresh while the first is still in flight — deduped.
      void feed.refresh();
    });
    expect(fetchJsonMock).toHaveBeenCalledTimes(2);
    expect(feed.isRefreshing).toBe(true);

    await act(async () => {
      d2.resolve(recPage(['b']));
      await p;
    });
    expect(feed.listings.map((l) => l.id)).toEqual(['b']);
    expect(feed.isRefreshing).toBe(false);

    act(() => { renderer.unmount(); });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// P2 — LiveShoppingHomeScreen.load epoch guard
// ════════════════════════════════════════════════════════════════════════════

describe('P2 — LiveShoppingHomeScreen request identity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('a stale load resolving last cannot overwrite a fresher summary', async () => {
    const dA = deferred<any>();
    const dB = deferred<any>();
    fetchLiveSessionsMock
      .mockImplementationOnce(() => dA.promise)
      .mockImplementationOnce(() => dB.promise);

    const renderer = await mount(<LiveShoppingHomeScreen />);
    // Mount load A in flight — pull-to-refresh issues load B. The
    // RefreshControl is an element prop on the mocked ScrollView, not a
    // rendered child, so it is read off the ScrollView's props.
    const refreshControl = () =>
      (findHost(renderer, 'ScrollView')[0].props.refreshControl as React.ReactElement)
        .props as { onRefresh: () => void; refreshing: boolean };
    await act(async () => {
      refreshControl().onRefresh();
    });
    expect(fetchLiveSessionsMock).toHaveBeenCalledTimes(2);

    // Newer load lands first.
    await act(async () => {
      dB.resolve({ sessions: [{ id: 'fresh', status: 'live', title: 'Fresh show' }] });
      await Promise.resolve();
    });
    expect(hasText(renderer, 'LIVE-CARD fresh')).toBe(true);

    // Older load resolves last — pre-repair it overwrote summary wholesale.
    await act(async () => {
      dA.resolve({ sessions: [{ id: 'stale', status: 'live', title: 'Stale show' }] });
      await Promise.resolve();
    });
    expect(hasText(renderer, 'LIVE-CARD fresh')).toBe(true);
    expect(hasText(renderer, 'LIVE-CARD stale')).toBe(false);

    act(() => { renderer.unmount(); });
  });

  it('a stale finisher does not clear refreshing while a newer load runs', async () => {
    const dA = deferred<any>();
    const dB = deferred<any>();
    fetchLiveSessionsMock
      .mockImplementationOnce(() => dA.promise)
      .mockImplementationOnce(() => dB.promise);

    const renderer = await mount(<LiveShoppingHomeScreen />);
    const refreshControl = () =>
      (findHost(renderer, 'ScrollView')[0].props.refreshControl as React.ReactElement)
        .props as { onRefresh: () => void; refreshing: boolean };
    await act(async () => {
      refreshControl().onRefresh();
    });
    expect(refreshControl().refreshing).toBe(true);

    // OLDER load finishes first — its finally must not clear the pending
    // flag the newer load still owns.
    await act(async () => {
      dA.resolve({ sessions: [{ id: 'stale', status: 'live', title: 'Stale' }] });
      await Promise.resolve();
    });
    expect(refreshControl().refreshing).toBe(true);
    // And the stale summary never reached the canvas.
    expect(hasText(renderer, 'LIVE-CARD stale')).toBe(false);

    await act(async () => {
      dB.resolve({ sessions: [{ id: 'fresh', status: 'live', title: 'Fresh' }] });
      await Promise.resolve();
    });
    expect(refreshControl().refreshing).toBe(false);
    expect(hasText(renderer, 'LIVE-CARD fresh')).toBe(true);

    act(() => { renderer.unmount(); });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// P3 — ListingQA never fabricates "just now" for unparseable timestamps
// ════════════════════════════════════════════════════════════════════════════

describe('P3 — ListingQA timestamp honesty', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('omits the time line when the API timestamp is unparseable', async () => {
    fetchQuestionsMock.mockResolvedValue([
      {
        id: 'q1',
        listingId: 'l1',
        askerId: 'asker-7',
        askerName: 'asker',
        text: 'Is the strap original?',
        createdAt: 'not-a-real-date',
        answer: { text: 'Yes it is', responderName: 'seller', createdAt: '' },
      },
    ]);
    const renderer = await mount(
      <ListingQA listingId="l1" currentUserName="viewer" isSeller={false} />,
    );
    await act(async () => {
      await Promise.resolve();
    });

    expect(hasText(renderer, 'Is the strap original?')).toBe(true);
    // Pre-repair: Date.parse(...) || Date.now() → NaN → now → "just now"
    // for a question that could be days old.
    expect(hasText(renderer, 'just now')).toBe(false);
    expect(hasText(renderer, 'ago')).toBe(false);

    act(() => { renderer.unmount(); });
  });

  it('still renders relative time for a parseable timestamp', async () => {
    fetchQuestionsMock.mockResolvedValue([
      {
        id: 'q1',
        listingId: 'l1',
        askerId: 'asker-7',
        askerName: 'asker',
        text: 'Does it fit true to size?',
        createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
        answer: null,
      },
    ]);
    const renderer = await mount(
      <ListingQA listingId="l1" currentUserName="viewer" isSeller={false} />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(hasText(renderer, '2d ago')).toBe(true);

    act(() => { renderer.unmount(); });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// P2-5 — campaign-touched files use named MAX_FONT_SCALE tiers
// ════════════════════════════════════════════════════════════════════════════

describe('P2-5 — dynamic-type ceilings use named tiers in campaign-touched files', () => {
  const CAMPAIGN_TOUCHED = [
    'components/myprofile/ClosetGrid.tsx',
    'components/checkout/CheckoutFooter.tsx',
    'components/discovery/DiscoveryFeedView.tsx',
    'components/discovery/DiscoverySearchResultsView.tsx',
    'components/itemdetail/ItemDetailItemDetails.tsx',
    'components/itemdetail/ItemDetailSheets.tsx',
    'components/home/HomeFeedHeader.tsx',
    'components/ui/AppSegmentControl.tsx',
    'components/coown/CoOwnDistributionCalendar.tsx',
    'components/visualsearch/VisualSearchRegionCropper.tsx',
    'components/product/ListingQA.tsx',
    'screens/CheckoutScreen.tsx',
    'screens/UnifiedDiscoveryScreen.tsx',
    'screens/VisualSearchScreen.tsx',
    'screens/MyProfileScreen.tsx',
    'screens/PortfolioScreen.tsx',
    'screens/ItemDetailScreen.tsx',
    'screens/LiveShoppingHomeScreen.tsx',
    'screens/LiveStreamReplayScreen.tsx',
  ];

  it('no campaign-touched file passes an ad-hoc numeric maxFontSizeMultiplier', () => {
    for (const rel of CAMPAIGN_TOUCHED) {
      const src = readSource(rel);
      // The tier grammar forbids literals — every cap must name its tier.
      expect(src, `${rel} still uses a numeric maxFontSizeMultiplier`).not.toMatch(
        /maxFontSizeMultiplier=\{[0-9]/,
      );
    }
  });
});
