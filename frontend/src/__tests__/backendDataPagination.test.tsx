import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';
import type { Listing } from '../domain';

vi.mock('../lib/apiClient', () => ({
  fetchJson: vi.fn(),
  getApiBaseUrl: vi.fn(() => 'http://localhost:3000'),
}));

vi.mock('../services/feedApi', () => ({
  fetchHomeFeed: vi.fn(),
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

// mockData pulls native modules through transitive imports; fixtures are
// disabled in this suite so the data is never read.
vi.mock('../data/mockData', () => ({
  MOCK_LISTINGS: [],
  MOCK_USERS: [],
}));

vi.mock('../dev/BackendDiagnosticsOverlay', () => ({
  BackendDiagnosticsOverlay: () => null,
}));

import { fetchHomeFeed } from '../services/feedApi';
import { BackendDataProvider, useBackendData } from '../context/BackendDataContext';

const mockedFetchHomeFeed = vi.mocked(fetchHomeFeed);

const listing = (id: string): Listing =>
  ({ id, sellerId: `seller-${id}`, title: `Listing ${id}` }) as unknown as Listing;

const feedPage = (ids: string[], nextCursor: string | null) => ({
  listings: ids.map(listing),
  posterIds: [],
  lookIds: [],
  source: 'api' as const,
  nextCursor,
});

type Ctx = ReturnType<typeof useBackendData>;

let latest: Ctx;
const Probe = () => {
  latest = useBackendData();
  return null;
};

const mount = async () => {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      <BackendDataProvider>
        <Probe />
      </BackendDataProvider>,
    );
  });
  return renderer;
};

describe('BackendDataContext — cursor pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('appends the next page and advances the cursor', async () => {
    mockedFetchHomeFeed
      .mockResolvedValueOnce(feedPage(['a', 'b'], 'cursor-2'))
      .mockResolvedValueOnce(feedPage(['c'], 'cursor-3'));

    await mount();
    expect(latest.hasMore).toBe(true);
    expect(latest.listings.map((l) => l.id)).toEqual(['a', 'b']);

    await act(async () => { await latest.loadMoreListings(); });

    expect(mockedFetchHomeFeed).toHaveBeenLastCalledWith('cursor-2');
    expect(latest.listings.map((l) => l.id)).toEqual(['a', 'b', 'c']);
    expect(latest.hasMore).toBe(true);
  });

  it('dedupes listing ids across pages', async () => {
    mockedFetchHomeFeed
      .mockResolvedValueOnce(feedPage(['a', 'b'], 'cursor-2'))
      .mockResolvedValueOnce(feedPage(['b', 'c'], 'cursor-3'));

    await mount();
    expect(latest.hasMore).toBe(true);

    await act(async () => { await latest.loadMoreListings(); });

    expect(latest.listings.map((l) => l.id)).toEqual(['a', 'b', 'c']);
  });

  it('clears the cursor on an empty page and stops further pagination', async () => {
    // Regression: an empty page used to leave the cursor set while hasMore
    // went false — every subsequent onEndReached re-fetched the same cursor.
    mockedFetchHomeFeed
      .mockResolvedValueOnce(feedPage(['a'], 'cursor-2'))
      .mockResolvedValueOnce(feedPage([], null));

    await mount();
    expect(latest.hasMore).toBe(true);

    await act(async () => { await latest.loadMoreListings(); });
    expect(latest.hasMore).toBe(false);
    expect(latest.isLoadingMore).toBe(false);

    const callsBefore = mockedFetchHomeFeed.mock.calls.length;
    await act(async () => { await latest.loadMoreListings(); });
    await act(async () => { await latest.loadMoreListings(); });
    expect(mockedFetchHomeFeed.mock.calls.length).toBe(callsBefore);
  });

  it('resets isLoadingMore when the page fetch resolves to an error', async () => {
    mockedFetchHomeFeed
      .mockResolvedValueOnce(feedPage(['a'], 'cursor-2'))
      .mockResolvedValueOnce({ ...feedPage([], null), error: 'boom' });

    await mount();
    expect(latest.hasMore).toBe(true);

    await act(async () => { await latest.loadMoreListings(); });

    expect(latest.isLoadingMore).toBe(false);
    expect(latest.listings.map((l) => l.id)).toEqual(['a']);
  });
});
