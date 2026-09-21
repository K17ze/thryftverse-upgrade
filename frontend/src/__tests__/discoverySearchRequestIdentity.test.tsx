/**
 * Regression tests for PKG-07 FRESH-02 / FRESH-03 — search request identity
 * and append-page failure handling in useDiscoverySearch.
 *
 * FRESH-02: every async write (initial fetch AND paginated loadMore) is
 * keyed to a monotonic epoch bumped on each new query/filter/scope identity.
 * A slow page-2 response from query A must never append into query B's
 * results or clobber its paging state. These tests resolve deferred
 * responses out of order across two query identities — they FAIL on the
 * pre-fix hook, which appended page responses with no guard.
 *
 * FRESH-03: a failed page on a populated list is a distinct
 * `searchPageError` (inline failed-page retry), never the full-screen
 * `searchError`, and `retrySearchPage` re-issues the exact failed page.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

// ── Store mock — a mutable bag the test edits to simulate filter edits ──
const storeState = vi.hoisted(() => ({
  currentUser: { id: 'u1' } as { id: string } | null,
  browseFilters: {
    brands: [] as string[],
    sizes: [] as string[],
    condition: 'Any',
    priceMin: null as number | null,
    priceMax: null as number | null,
    sort: 'Recommended',
  },
  updateBrowseFilters: vi.fn(),
  activateBrowseContext: vi.fn(),
  isSavedProduct: () => false,
  savedSearches: [] as unknown[],
  addSavedSearch: vi.fn(),
}));

vi.mock('../store/useStore', () => {
  const useStore: any = (selector: (s: typeof storeState) => unknown) => selector(storeState);
  useStore.getState = () => storeState;
  return { useStore };
});

const searchListings = vi.hoisted(() => vi.fn());
vi.mock('../services/feedApi', () => ({ searchListingsFromApi: searchListings }));

vi.mock('../services/profileApi', () => ({ searchUsers: vi.fn(async () => []) }));
vi.mock('../services/searchHistory', () => ({
  recordRecentSearch: vi.fn(async () => undefined),
}));
vi.mock('../hooks/useHaptic', () => ({
  useHaptic: () => ({ light: vi.fn(), medium: vi.fn(), selection: vi.fn(), success: vi.fn() }),
}));

import { useDiscoverySearch } from '../hooks/discovery/useDiscoverySearch';

const DEBOUNCE_MS = 180;

type HookValue = ReturnType<typeof useDiscoverySearch>;

const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const apiItem = (id: string) => ({
  id,
  sellerId: `seller-${id}`,
  title: `Item ${id}`,
  priceGbp: 10,
  imageUrl: `https://img.test/${id}.jpg`,
  images: [],
  createdAt: '2026-01-01T00:00:00Z',
});

const pageOf = (prefix: string, count: number) =>
  Array.from({ length: count }, (_, i) => apiItem(`${prefix}${i}`));

let latest!: HookValue;
const Probe = () => {
  latest = useDiscoverySearch();
  return null;
};

const mount = async () => {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(<Probe />);
  });
  return renderer;
};

const unitIds = () => latest.searchResults.map((u) => u.id);

describe('useDiscoverySearch — request identity (FRESH-02)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    storeState.browseFilters = {
      brands: [],
      sizes: [],
      condition: 'Any',
      priceMin: null,
      priceMax: null,
      sort: 'Recommended',
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('drops a page response issued under a previous query identity', async () => {
    const d1 = deferred<any>();
    const d2 = deferred<any>();
    const d3 = deferred<any>();
    searchListings
      .mockImplementationOnce(() => d1.promise)
      .mockImplementationOnce(() => d2.promise)
      .mockImplementationOnce(() => d3.promise);

    const renderer = await mount();

    // Query A: initial page fills a full page so pagination is live.
    act(() => { latest.setQuery('aa'); });
    act(() => { vi.advanceTimersByTime(DEBOUNCE_MS + 20); });
    await act(async () => { d1.resolve({ items: pageOf('a', 50) }); });
    expect(unitIds()).toHaveLength(50);
    expect(latest.searchHasMore).toBe(true);

    // Query A page 2 is issued and stays in flight.
    act(() => { latest.loadMoreSearch(); });
    expect(latest.isSearchingMore).toBe(true);
    expect(searchListings).toHaveBeenLastCalledWith(
      'aa',
      expect.objectContaining({ page: 2 }),
    );

    // The query identity moves to B and serves its first page.
    act(() => { latest.setQuery('bb'); });
    act(() => { vi.advanceTimersByTime(DEBOUNCE_MS + 20); });
    await act(async () => { d3.resolve({ items: pageOf('b', 1) }); });
    expect(unitIds()).toEqual(['listing:b0']);

    // A's stale page-2 lands last — every write from it is dead.
    await act(async () => { d2.resolve({ items: pageOf('stale', 50) }); });
    expect(unitIds()).toEqual(['listing:b0']);
    expect(latest.searchHasMore).toBe(false);
    expect(latest.isSearchingMore).toBe(false);

    act(() => { renderer.unmount(); });
  });

  it('drops a stale page response when filters change mid-load', async () => {
    const d1 = deferred<any>();
    const d2 = deferred<any>();
    const d3 = deferred<any>();
    searchListings
      .mockImplementationOnce(() => d1.promise)
      .mockImplementationOnce(() => d2.promise)
      .mockImplementationOnce(() => d3.promise);

    const renderer = await mount();

    act(() => { latest.setQuery('aa'); });
    act(() => { vi.advanceTimersByTime(DEBOUNCE_MS + 20); });
    await act(async () => { d1.resolve({ items: pageOf('a', 50) }); });

    act(() => { latest.loadMoreSearch(); });
    expect(latest.isSearchingMore).toBe(true);

    // A filter edit is a new request identity — the pending page is dead.
    storeState.browseFilters = { ...storeState.browseFilters, brands: ['Nike'] };
    act(() => { renderer.update(<Probe />); });
    act(() => { vi.advanceTimersByTime(DEBOUNCE_MS + 20); });

    // The re-issued fetch carries the new filter set and no page offset.
    expect(searchListings).toHaveBeenLastCalledWith(
      'aa',
      expect.objectContaining({ brands: ['Nike'] }),
    );
    expect(searchListings.mock.calls[2][1].page).toBeUndefined();

    await act(async () => { d3.resolve({ items: pageOf('n', 3) }); });
    expect(unitIds()).toEqual(['listing:n0', 'listing:n1', 'listing:n2']);

    await act(async () => { d2.resolve({ items: pageOf('stale', 50) }); });
    expect(unitIds()).toEqual(['listing:n0', 'listing:n1', 'listing:n2']);

    act(() => { renderer.unmount(); });
  });

  it('keeps the latest query result when initial searches resolve out of order', async () => {
    const d1 = deferred<any>();
    const d2 = deferred<any>();
    searchListings
      .mockImplementationOnce(() => d1.promise)
      .mockImplementationOnce(() => d2.promise);

    const renderer = await mount();

    act(() => { latest.setQuery('aa'); });
    act(() => { vi.advanceTimersByTime(DEBOUNCE_MS + 20); });
    act(() => { latest.setQuery('bb'); });
    act(() => { vi.advanceTimersByTime(DEBOUNCE_MS + 20); });

    await act(async () => { d2.resolve({ items: pageOf('b', 2) }); });
    expect(unitIds()).toEqual(['listing:b0', 'listing:b1']);

    // The earlier query's response is stale — it must not overwrite.
    await act(async () => { d1.resolve({ items: pageOf('a', 5) }); });
    expect(unitIds()).toEqual(['listing:b0', 'listing:b1']);

    act(() => { renderer.unmount(); });
  });
});

describe('useDiscoverySearch — failed page state (FRESH-03)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    storeState.browseFilters = {
      brands: [],
      sizes: [],
      condition: 'Any',
      priceMin: null,
      priceMax: null,
      sort: 'Recommended',
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps loaded results and flags a retryable page error when a page fetch fails', async () => {
    const d1 = deferred<any>();
    const d2 = deferred<any>();
    const d3 = deferred<any>();
    searchListings
      .mockImplementationOnce(() => d1.promise)
      .mockImplementationOnce(() => d2.promise)
      .mockImplementationOnce(() => d3.promise);

    const renderer = await mount();

    act(() => { latest.setQuery('aa'); });
    act(() => { vi.advanceTimersByTime(DEBOUNCE_MS + 20); });
    await act(async () => { d1.resolve({ items: pageOf('a', 50) }); });

    act(() => { latest.loadMoreSearch(); });
    await act(async () => { d2.resolve({ items: [], error: 'boom' }); });

    // The append failure is a page error — loaded results stay on screen
    // and the initial-load error channel stays clear.
    expect(latest.searchPageError).toBeTruthy();
    expect(latest.searchError).toBeNull();
    expect(latest.searchResults).toHaveLength(50);
    expect(latest.searchHasMore).toBe(true);
    expect(latest.isSearchingMore).toBe(false);

    // Retry re-issues the exact failed page — searchPage only advanced on
    // successful appends, so the request is page 2 again.
    act(() => { latest.retrySearchPage(); });
    expect(searchListings).toHaveBeenLastCalledWith(
      'aa',
      expect.objectContaining({ page: 2 }),
    );
    expect(latest.searchPageError).toBeNull();

    await act(async () => { d3.resolve({ items: pageOf('p2', 10) }); });
    expect(latest.searchResults).toHaveLength(60);
    expect(latest.searchPageError).toBeNull();

    act(() => { renderer.unmount(); });
  });
});
