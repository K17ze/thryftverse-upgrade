import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Listing } from '../data/mockData';

type FeedLookPayload = {
  id: string;
  rank: number;
  creator: { id: string; name: string; avatar: string; isVerified?: boolean };
  title: string;
  description: string;
  coverImage: string;
  items: { id: string; label: string }[];
  likes: number;
  comments: number;
  timeAgo: string;
};

const buildFeedLook = (id: string, rank: number): FeedLookPayload => ({
  id,
  rank,
  creator: { id: `${id}_u`, name: `${id}_creator`, avatar: `https://picsum.photos/seed/${id}/200/200` },
  title: `Title ${id}`,
  description: `Description ${id}`,
  coverImage: `https://picsum.photos/seed/${id}/400/400`,
  items: [{ id: `${id}_item`, label: `Item ${id}` }],
  likes: rank,
  comments: rank,
  timeAgo: `${rank}h ago`,
});

const FALLBACK_LISTINGS: Listing[] = [
  {
    id: 'l_1',
    title: 'Fallback Listing One',
    brand: 'Fallback Brand',
    size: 'M',
    condition: 'Very good',
    price: 12,
    priceWithProtection: 13.3,
    images: ['https://img.example/one.jpg', 'https://img.example/two.jpg'],
    likes: 3,
    sellerId: 'u1',
    category: 'women',
    subcategory: 'Clothing',
    description: 'Fallback description',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'l_2',
    title: 'Fallback Listing Two',
    brand: 'Fallback Brand Two',
    size: 'L',
    condition: 'Good',
    price: 9,
    priceWithProtection: 10.15,
    images: ['https://img.example/three.jpg'],
    likes: 1,
    sellerId: 'u2',
    category: 'men',
    subcategory: 'Shoes',
    description: 'Fallback description two',
  },
];

async function importFeedLooksService(enableMocks: boolean, fetchJsonMock: ReturnType<typeof vi.fn>) {
  vi.resetModules();
  vi.doMock('../constants/runtimeFlags', () => ({ ENABLE_RUNTIME_MOCKS: enableMocks }));
  vi.doMock('../lib/apiClient', () => ({ fetchJson: fetchJsonMock }));
  return import('../services/feedLooksApi');
}

async function importListingsService(enableMocks: boolean, fetchJsonMock: ReturnType<typeof vi.fn>) {
  vi.resetModules();
  vi.doMock('../constants/runtimeFlags', () => ({ ENABLE_RUNTIME_MOCKS: enableMocks }));
  vi.doMock('../lib/apiClient', () => ({ fetchJson: fetchJsonMock }));
  return import('../services/listingsApi');
}

afterEach(() => {
  vi.clearAllMocks();
  vi.doUnmock('../constants/runtimeFlags');
  vi.doUnmock('../lib/apiClient');
  vi.resetModules();
});

describe('feed looks fallback behavior', () => {
  it('sorts API feed looks by rank and id with source api', async () => {
    const fetchJsonMock = vi.fn().mockResolvedValue({
      items: [buildFeedLook('look_b', 2), buildFeedLook('look_a', 1), buildFeedLook('look_c', 2)],
    });

    const { fetchFeedLooksWithFallback } = await importFeedLooksService(false, fetchJsonMock);
    const result = await fetchFeedLooksWithFallback();

    expect(result.source).toBe('api');
    expect(result.looks.map((look) => look.id)).toEqual(['look_a', 'look_b', 'look_c']);
    expect((result.looks[0] as { rank?: number }).rank).toBeUndefined();
  });

  it('returns empty api result when API rows are empty and runtime mocks are disabled', async () => {
    const fetchJsonMock = vi.fn().mockResolvedValue({ items: [] });

    const { fetchFeedLooksWithFallback } = await importFeedLooksService(false, fetchJsonMock);
    const result = await fetchFeedLooksWithFallback();

    expect(result).toEqual({
      looks: [],
      source: 'api',
      error: 'API returned zero feed looks.',
    });
  });

  it('returns empty api result when API throws', async () => {
    const fetchJsonMock = vi.fn().mockRejectedValue(new Error('network down'));

    const { fetchFeedLooksWithFallback } = await importFeedLooksService(false, fetchJsonMock);
    const result = await fetchFeedLooksWithFallback();

    expect(result.source).toBe('api');
    expect(result.error).toBe('network down');
    expect(result.looks).toEqual([]);
  });
});

describe('listings api behavior', () => {
  it('maps API listings with source api', async () => {
    const fetchJsonMock = vi.fn().mockResolvedValue({
      items: [
        {
          id: 'l_1',
          sellerId: 'u_api',
          title: 'API Listing Title',
          description: 'API description',
          priceGbp: 21,
          imageUrl: 'https://img.example/one.jpg',
          images: ['https://img.example/one.jpg'],
          createdAt: '2026-02-01T00:00:00.000Z',
        },
      ],
    });

    const { fetchListingsFromApi } = await importListingsService(false, fetchJsonMock);
    const result = await fetchListingsFromApi();

    expect(result.source).toBe('api');
    expect(result.listings.map((item: any) => item.id)).toEqual(['l_1']);
    expect(result.listings[0].price).toBe(21);
  });

  it('returns empty api result when listings API is empty', async () => {
    const fetchJsonMock = vi.fn().mockResolvedValue({ items: [] });

    const { fetchListingsFromApi } = await importListingsService(false, fetchJsonMock);
    const result = await fetchListingsFromApi();

    expect(result).toEqual({
      listings: [],
      source: 'api',
      error: 'API returned zero listings.',
    });
  });

  it('returns empty listings when API throws', async () => {
    const fetchJsonMock = vi.fn().mockRejectedValue(new Error('request timeout'));

    const { fetchListingsFromApi } = await importListingsService(false, fetchJsonMock);
    const result = await fetchListingsFromApi();

    expect(result.source).toBe('api');
    expect(result.error).toBe('request timeout');
    expect(result.listings).toEqual([]);
  });
});
