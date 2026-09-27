/**
 * Regression tests for FRESH-02 in useForYouFeed.
 *
 * The pre-fix hook called setPage(null) in its catch path, so ANY failed
 * load — including a pull-to-refresh on a populated feed — blanked the
 * For You content. Post-fix:
 *
 *  - a failed refresh keeps the last-good page on screen and surfaces a
 *    distinct `refreshError` channel (inline retry note), never the
 *    no-content `error` channel;
 *  - every async write is keyed to a monotonic epoch bumped when the feed
 *    identity (user + surface) changes, so a slow response from a previous
 *    identity can never clobber the new identity's page;
 *  - the cached page is cleared ONLY on identity change.
 *
 * These tests FAIL on the pre-fix hook.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

const fetchJsonMock = vi.hoisted(() => vi.fn());
vi.mock('../lib/apiClient', () => ({ fetchJson: fetchJsonMock }));

// ── Store mock — a mutable bag the test edits to simulate user changes ──
const storeState = vi.hoisted(() => ({
  currentUser: { id: 'u1' } as { id: string } | null,
}));
vi.mock('../store/useStore', () => {
  const useStore: any = (selector: (s: typeof storeState) => unknown) => selector(storeState);
  useStore.getState = () => storeState;
  return { useStore };
});

// listingMapper pulls native modules through transitive imports; the hook
// contract only needs id-bearing display-ready listings.
vi.mock('../services/listingMapper', () => ({
  mapBackendListingToListing: (row: { id: string }) => ({
    id: row.id,
    sellerId: `seller-${row.id}`,
    title: `Listing ${row.id}`,
  }),
  isDisplayReadyListing: () => true,
}));

import { useForYouFeed } from '../hooks/useForYouFeed';

type HookValue = ReturnType<typeof useForYouFeed>;

const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
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

let latest!: HookValue;
const Probe = () => {
  latest = useForYouFeed();
  return null;
};

const mount = async () => {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(<Probe />);
  });
  return renderer;
};

const ids = () => latest.listings.map((l) => l.id);

describe('useForYouFeed — refresh resilience (FRESH-02)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storeState.currentUser = { id: 'u1' };
  });

  it('keeps the last-good page and flags refreshError when a refresh fails', async () => {
    const d1 = deferred<any>();
    fetchJsonMock.mockImplementationOnce(() => d1.promise);

    const renderer = await mount();
    await act(async () => { d1.resolve(recPage(['a', 'b'])); });
    expect(ids()).toEqual(['a', 'b']);

    fetchJsonMock.mockImplementationOnce(() => Promise.reject(new Error('network down')));
    await act(async () => { await latest.refresh(); });

    // Old behaviour blanked the feed via setPage(null); the failure must
    // now surface on the distinct refresh channel while content stays.
    expect(ids()).toEqual(['a', 'b']);
    expect(latest.refreshError).toBeTruthy();
    expect(latest.error).toBeNull();
    expect(latest.isRefreshing).toBe(false);

    act(() => { renderer.unmount(); });
  });

  it('clears refreshError and applies the new page when a retry succeeds', async () => {
    const d1 = deferred<any>();
    const d3 = deferred<any>();
    fetchJsonMock
      .mockImplementationOnce(() => d1.promise)
      .mockImplementationOnce(() => Promise.reject(new Error('down')))
      .mockImplementationOnce(() => d3.promise);

    const renderer = await mount();
    await act(async () => { d1.resolve(recPage(['a'])); });

    await act(async () => { await latest.refresh(); });
    expect(latest.refreshError).toBeTruthy();
    expect(ids()).toEqual(['a']);

    await act(async () => {
      const pending = latest.refresh();
      d3.resolve(recPage(['c']));
      await pending;
    });
    expect(ids()).toEqual(['c']);
    expect(latest.refreshError).toBeNull();
    expect(latest.error).toBeNull();

    act(() => { renderer.unmount(); });
  });

  it('drops a stale response that resolves after the user identity changed', async () => {
    const d1 = deferred<any>();
    const d2 = deferred<any>();
    fetchJsonMock
      .mockImplementationOnce(() => d1.promise)
      .mockImplementationOnce(() => d2.promise);

    const renderer = await mount();

    // u1 → u2 re-issues the load under a new request identity.
    storeState.currentUser = { id: 'u2' };
    act(() => { renderer.update(<Probe />); });
    expect(fetchJsonMock.mock.calls[1][0]).toContain('u2');

    await act(async () => { d2.resolve(recPage(['b'])); });
    expect(ids()).toEqual(['b']);

    // u1's slow response lands last — every write from it is dead.
    await act(async () => { d1.resolve(recPage(['stale'])); });
    expect(ids()).toEqual(['b']);
    expect(latest.isLoading).toBe(false);

    act(() => { renderer.unmount(); });
  });

  it('uses the no-content error channel when a refresh fails with nothing cached', async () => {
    fetchJsonMock
      .mockImplementationOnce(() => Promise.reject(new Error('down')))
      .mockImplementationOnce(() => Promise.reject(new Error('down again')));

    const renderer = await mount();
    expect(latest.error).toBeTruthy();
    expect(latest.refreshError).toBeNull();

    // Refresh on an empty feed still reports through `error` — there is no
    // last-good page to keep, so the honest state is the error surface.
    await act(async () => { await latest.refresh(); });
    expect(latest.error).toBeTruthy();
    expect(latest.refreshError).toBeNull();
    expect(ids()).toEqual([]);

    act(() => { renderer.unmount(); });
  });
});
