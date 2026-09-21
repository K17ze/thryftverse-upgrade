import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

/**
 * S20-01 / S20-02 — visual search result hook regressions.
 *
 * S20-01: resetResults (and image removal) must invalidate the in-flight
 * request — abort the controller AND advance the epoch — so a response from
 * the removed image can never repopulate results after reset.
 *
 * S20-02: when the client-side cache supplies the displayed set, the API's
 * retrieval claims (visualMatching / similarityMethod / queryScope / facet
 * counts) describe a DIFFERENT candidate set — provenance must travel with
 * the collection actually shown: explicit filter-only provenance.
 *
 * Both tests FAIL on the pre-fix hook: the old reset left the sequence
 * untouched (late resolve repopulated results), and the old fallback path
 * attached the API's visual/region claims to filter-matched cache rows.
 */

// ── Boundary mocks — the hook's only side-effecting imports. ─────────────
const visualSearchMock = vi.fn();

vi.mock('../services/listingsApi', () => ({
  visualSearch: (...args: unknown[]) => visualSearchMock(...args),
}));

vi.mock('expo-file-system/legacy', () => ({
  readAsStringAsync: vi.fn(() => Promise.resolve('')),
  EncodingType: { Base64: 'base64' },
}));

import { useVisualSearchResults } from '../hooks/visualsearch/useVisualSearchResults';
import type { Listing } from '../domain';
import type { VisualSearchResult } from '../services/listingsApi';
import type { VisualSearchFilterPayload } from '../components/visualsearch/visualSearchTypes';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const makeListing = (id: string): Listing => ({
  id,
  title: `Listing ${id}`,
  brand: 'Brand',
  size: 'M',
  condition: 'Good',
  price: 20,
  images: [`https://img/${id}.jpg`],
  likes: 0,
  sellerId: 'seller-1',
  category: 'tops',
  description: 'A listing',
});

const buildFilterPayload = (): VisualSearchFilterPayload => ({
  sort: 'similarity',
  limit: 24,
});

let filterCachedListingsMock: () => Listing[];
let latest: ReturnType<typeof useVisualSearchResults>;

function Harness({ imageUri }: { imageUri: string | null }) {
  latest = useVisualSearchResults({
    imageUri,
    buildFilterPayload,
    filterCachedListings: filterCachedListingsMock,
  });
  return null;
}

async function mount(imageUri: string | null) {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(<Harness imageUri={imageUri} />);
  });
  return renderer;
}

beforeEach(() => {
  visualSearchMock.mockReset();
  filterCachedListingsMock = () => [];
});

// ---------------------------------------------------------------------------
// S20-01 — reset invalidates the pending search
// ---------------------------------------------------------------------------

describe('useVisualSearchResults — S20-01 reset/race', () => {
  it('a response that resolves after resetResults must NOT repopulate results', async () => {
    const apiItem = makeListing('api-1');
    const pending = deferred<VisualSearchResult>();
    visualSearchMock.mockReturnValue(pending.promise);

    await mount('https://img.example/query.jpg');

    await act(async () => {
      // Start the search but do not await — the HTTP call stays in flight.
      void latest.runSearch();
      // Flush the readImageAsBase64 microtask so the request is dispatched.
      await Promise.resolve();
    });
    expect(latest.status).toBe('loading');

    await act(async () => {
      latest.resetResults();
    });
    expect(latest.status).toBe('idle');
    expect(latest.results).toEqual([]);

    // The removed image's response arrives AFTER the reset.
    await act(async () => {
      pending.resolve({
        listings: [apiItem] as VisualSearchResult['listings'],
        source: 'api',
        visualMatching: true,
        similarityMethod: 'heuristic_color_features',
        retrievalMeta: { method: 'heuristic', embedderConfigured: true, queryScope: 'whole_image' },
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(latest.status).toBe('idle');
    expect(latest.results).toEqual([]);
    expect(latest.facetCounts).toBeNull();
    expect(latest.visualMatching).toBe(false);
  });

  it('removing the image invalidates the pending search and clears all provenance', async () => {
    const pending = deferred<VisualSearchResult>();
    visualSearchMock.mockReturnValue(pending.promise);

    const renderer = await mount('https://img.example/query.jpg');
    await act(async () => {
      void latest.runSearch();
      await Promise.resolve();
    });
    expect(latest.status).toBe('loading');

    // "Remove photo" — imageUri becomes null while the request is in flight.
    await act(async () => {
      renderer.update(<Harness imageUri={null} />);
    });
    expect(latest.status).toBe('idle');
    expect(latest.results).toEqual([]);
    expect(latest.region).toBeNull();
    expect(latest.queryScope).toBeUndefined();

    await act(async () => {
      pending.resolve({
        listings: [makeListing('api-late')] as VisualSearchResult['listings'],
        source: 'api',
        visualMatching: true,
        similarityMethod: 'heuristic_color_features',
        retrievalMeta: { method: 'heuristic', embedderConfigured: true, queryScope: 'region' },
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(latest.status).toBe('idle');
    expect(latest.results).toEqual([]);
    expect(latest.queryScope).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// S20-02 — cached fallback carries filter-only provenance
// ---------------------------------------------------------------------------

describe('useVisualSearchResults — S20-02 fallback provenance', () => {
  it('cache-substituted results never inherit the API visual/region claims', async () => {
    const cached = makeListing('cached-1');
    filterCachedListingsMock = () => [cached];
    visualSearchMock.mockResolvedValue({
      // The API ran a REGION-scoped visual match and found nothing —
      // its claims describe the empty set it actually produced.
      listings: [],
      source: 'api',
      visualMatching: true,
      similarityMethod: 'heuristic_color_features',
      retrievalMeta: { method: 'heuristic', embedderConfigured: true, queryScope: 'region' },
      facets: {
        colors: [{ value: 'Red', count: 4 }],
        styles: [{ value: 'Vintage', count: 2 }],
      },
      note: 'Matched visually within the framed area.',
    } satisfies VisualSearchResult);

    await mount('https://img.example/query.jpg');
    await act(async () => {
      await latest.runSearch();
    });

    // The displayed collection is the cached/filter-matched one…
    expect(latest.results).toEqual([cached]);
    // …so its provenance must be filter-only: no visual match claim, no
    // region scope, no facet counts that describe a different candidate set.
    expect(latest.visualMatching).toBe(false);
    expect(latest.similarityMethod).toBe('filter_only');
    expect(latest.queryScope).toBeUndefined();
    expect(latest.facetCounts).toBeNull();
    // 'partial' — the bannered "some results from your saved data" state,
    // never a silent swap that reads as the visual match that ran.
    expect(latest.status).toBe('partial');
    expect(latest.honestNoteText).toBe(
      'Showing matches from your category, brand, and description filters.');
  });

  it('API results keep their real provenance untouched', async () => {
    const apiItem = makeListing('api-1');
    visualSearchMock.mockResolvedValue({
      listings: [apiItem],
      source: 'api',
      visualMatching: true,
      similarityMethod: 'heuristic_color_features',
      retrievalMeta: { method: 'heuristic', embedderConfigured: true, queryScope: 'region' },
      facets: {
        colors: [{ value: 'Red', count: 4 }],
        styles: [{ value: 'Vintage', count: 2 }],
      },
    } satisfies VisualSearchResult);

    await mount('https://img.example/query.jpg');
    await act(async () => {
      await latest.runSearch();
    });

    expect(latest.results).toEqual([apiItem]);
    expect(latest.visualMatching).toBe(true);
    expect(latest.similarityMethod).toBe('heuristic_color_features');
    expect(latest.queryScope).toBe('region');
    expect(latest.facetCounts).toEqual({
      colors: { Red: 4 },
      styles: { Vintage: 2 },
    });
    expect(latest.status).toBe('populated');
  });
});
