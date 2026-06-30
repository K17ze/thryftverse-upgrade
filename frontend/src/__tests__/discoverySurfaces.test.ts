import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock fetchJson before importing modules that depend on it
vi.mock('../lib/apiClient', () => ({
  fetchJson: vi.fn(),
  getApiBaseUrl: vi.fn(() => 'http://localhost:3000'),
}));

// Mock react-native-reanimated
vi.mock('react-native-reanimated', () => ({
  useSharedValue: vi.fn((init: unknown) => ({ value: init })),
  useAnimatedScrollHandler: vi.fn(),
  useAnimatedStyle: vi.fn(() => ({})),
  withTiming: vi.fn(),
  interpolateColor: vi.fn(),
  FadeInDown: { delay: () => ({ duration: () => ({}) }) },
}));

// Mock react-native-safe-area-context
vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: 'SafeAreaView',
  useSafeAreaInsets: vi.fn(() => ({ top: 0, bottom: 0 })),
}));

// Mock @react-navigation/native
vi.mock('@react-navigation/native', () => ({
  useNavigation: vi.fn(),
  useRoute: vi.fn(),
}));

// Mock @react-navigation/stack
vi.mock('@react-navigation/stack', () => ({
  StackNavigationProp: vi.fn(),
  StackScreenProps: vi.fn(),
}));

// Mock the store
vi.mock('../store/useStore', () => ({
  useStore: vi.fn((selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      wishlist: [],
      isWishlisted: () => false,
      toggleWishlist: vi.fn(),
      isSavedProduct: () => false,
      toggleSavedProduct: vi.fn(),
      savedProducts: [],
      notificationCount: 0,
      hasSeenPoster: false,
      customPosters: [],
      browseFilters: { brands: [], sizes: [], condition: 'Any', sort: 'Recommended', query: '' },
      updateBrowseFilters: vi.fn(),
      resetBrowseFilters: vi.fn(),
      customAuctions: [],
    })
  ),
}));

// Mock haptics
vi.mock('../hooks/useHaptic', () => ({
  useHaptic: () => ({
    light: vi.fn(),
    medium: vi.fn(),
    success: vi.fn(),
    selection: vi.fn(),
  }),
}));

// Mock formatted price
vi.mock('../hooks/useFormattedPrice', () => ({
  useFormattedPrice: () => ({
    formatFromFiat: vi.fn((amount: number) => `£${amount}`),
  }),
}));

// Mock theme
vi.mock('../theme/ThemeContext', () => ({
  useAppTheme: () => ({ isDark: false }),
}));

// Mock tab scroll
vi.mock('../hooks/useTabScroll', () => ({
  useTabScroll: () => ({ tabBarVisible: true }),
}));

// Mock BackendDataContext
vi.mock('../context/BackendDataContext', () => ({
  useBackendData: () => ({
    listings: [],
    source: 'api',
    isSyncing: false,
    lastError: null,
    hasMore: false,
    isLoadingMore: false,
    refreshListings: vi.fn(),
    loadMoreListings: vi.fn(),
    updateListing: vi.fn(),
    deleteListing: vi.fn(),
    apiBaseUrl: 'http://localhost:3000',
  }),
}));

// Mock ToastContext
vi.mock('../context/ToastContext', () => ({
  useToast: () => ({ show: vi.fn() }),
}));

// ── Tests ──

import { fetchJson } from '../lib/apiClient';
import { fetchListingsFromApi, fetchFilteredListings } from '../services/listingsApi';
import { fetchHomeFeed, searchListingsFromApi } from '../services/feedApi';

const mockedFetchJson = vi.mocked(fetchJson);

describe('Discovery surfaces — backend data truth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listingsApi — cursor pagination', () => {
    it('fetchListingsFromApi returns nextCursor from API response', async () => {
      mockedFetchJson.mockResolvedValueOnce({
        items: [
          {
            id: 'l1',
            sellerId: 's1',
            title: 'Test listing',
            description: 'desc',
            priceGbp: 25,
            imageUrl: null,
            images: ['img1.jpg'],
            status: 'active',
            category: 'women',
            brand: 'Nike',
            size: 'M',
            condition: 'Good',
            originalPriceGbp: null,
            createdAt: '2025-01-01T00:00:00Z',
            seller: null,
          },
        ],
        nextCursor: 'eyJzb3J0VmFsdWUiOiIyMDI1LTAxLTAxVDAwOjAwOjAwWiIsImlkIjoibDEifQ==',
      });

      const result = await fetchListingsFromApi();
      expect(result.listings).toHaveLength(1);
      expect(result.listings[0].id).toBe('l1');
      expect(result.nextCursor).toBeDefined();
      expect(result.nextCursor).toBe('eyJzb3J0VmFsdWUiOiIyMDI1LTAxLTAxVDAwOjAwOjAwWiIsImlkIjoibDEifQ==');
    });

    it('fetchListingsFromApi passes cursor param when provided', async () => {
      mockedFetchJson.mockResolvedValueOnce({ items: [], nextCursor: undefined });

      await fetchListingsFromApi('some-cursor-value');
      expect(mockedFetchJson).toHaveBeenCalledWith(
        '/listings?cursor=some-cursor-value'
      );
    });

    it('fetchFilteredListings passes cursor param', async () => {
      mockedFetchJson.mockResolvedValueOnce({ items: [], nextCursor: undefined });

      await fetchFilteredListings({ category: 'women', cursor: 'abc123' });
      expect(mockedFetchJson).toHaveBeenCalled();
      const callArg = mockedFetchJson.mock.calls[0][0] as string;
      expect(callArg).toContain('cursor=abc123');
      expect(callArg).toContain('category=women');
    });

    it('fetchFilteredListings returns nextCursor', async () => {
      mockedFetchJson.mockResolvedValueOnce({
        items: [
          {
            id: 'l2',
            sellerId: 's2',
            title: 'Filtered item',
            description: '',
            priceGbp: 50,
            imageUrl: 'img.jpg',
            images: [],
            status: 'active',
            category: 'men',
            brand: 'Adidas',
            size: 'L',
            condition: 'New with tags',
            originalPriceGbp: 80,
            createdAt: '2025-02-01T00:00:00Z',
            seller: { id: 's2', username: 'seller2', avatar: null, rating: null, reviewCount: null, location: null },
          },
        ],
        nextCursor: 'next-page-cursor',
      });

      const result = await fetchFilteredListings({ brand: 'Adidas' });
      expect(result.listings).toHaveLength(1);
      expect(result.listings[0].brand).toBe('Adidas');
      expect(result.listings[0].originalPrice).toBe(80);
      expect(result.listings[0].seller?.username).toBe('seller2');
      expect(result.nextCursor).toBe('next-page-cursor');
    });
  });

  describe('feedApi — home feed', () => {
    it('fetchHomeFeed maps listings, posters, and looks from /feed/home', async () => {
      mockedFetchJson.mockResolvedValueOnce({
        listings: [
          {
            id: 'fl1',
            sellerId: 'fs1',
            title: 'Feed listing',
            description: 'Feed desc',
            priceGbp: 30,
            imageUrl: 'feed-img.jpg',
            images: [],
            status: 'active',
            category: 'women',
            brand: 'Zara',
            size: 'S',
            condition: 'Very good',
            originalPriceGbp: null,
            createdAt: '2025-03-01T00:00:00Z',
          },
        ],
        posters: [
          { id: 'p1', creatorId: 'c1', mediaUrl: 'poster.jpg', caption: 'New drop', createdAt: '2025-03-01T00:00:00Z' },
        ],
        looks: [
          { id: 'look1', creatorId: 'c2', title: 'Summer look', mediaUrl: 'look.jpg', createdAt: '2025-03-01T00:00:00Z' },
        ],
      });

      const result = await fetchHomeFeed();
      expect(result.listings).toHaveLength(1);
      expect(result.listings[0].id).toBe('fl1');
      expect(result.listings[0].brand).toBe('Zara');
      expect(result.posterIds).toEqual(['p1']);
      expect(result.lookIds).toEqual(['look1']);
      expect(result.source).toBe('api');
      expect(result.error).toBeUndefined();
    });

    it('fetchHomeFeed returns error when zero listings returned', async () => {
      mockedFetchJson.mockResolvedValueOnce({
        listings: [],
        posters: [],
        looks: [],
      });

      const result = await fetchHomeFeed();
      expect(result.listings).toHaveLength(0);
      expect(result.error).toBe('Feed returned zero listings.');
    });

    it('fetchHomeFeed handles API errors gracefully', async () => {
      mockedFetchJson.mockRejectedValueOnce(new Error('Network error'));

      const result = await fetchHomeFeed();
      expect(result.listings).toHaveLength(0);
      expect(result.error).toBe('Network error');
    });
  });

  describe('feedApi — search listings', () => {
    it('searchListingsFromApi returns mapped results', async () => {
      mockedFetchJson.mockResolvedValueOnce({
        ok: true,
        query: 'nike',
        items: [
          {
            id: 's1',
            sellerId: 'sel1',
            title: 'Nike sneakers',
            description: '',
            priceGbp: 45,
            imageUrl: 'nike.jpg',
            rank: 1,
            createdAt: '2025-04-01T00:00:00Z',
            seller: null,
          },
        ],
      });

      const result = await searchListingsFromApi('nike', 20);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe('s1');
      expect(result.items[0].priceGbp).toBe(45);
      expect(result.fallback).toBe(false);
      expect(result.error).toBeUndefined();
    });

    it('searchListingsFromApi returns empty for queries shorter than 2 chars', async () => {
      const result = await searchListingsFromApi('a');
      expect(result.items).toHaveLength(0);
      expect(mockedFetchJson).not.toHaveBeenCalled();
    });

    it('searchListingsFromApi handles fallback flag', async () => {
      mockedFetchJson.mockResolvedValueOnce({
        ok: true,
        query: 'xyz',
        fallback: true,
        items: [
          {
            id: 's2',
            sellerId: 'sel2',
            title: 'Fuzzy match',
            description: '',
            priceGbp: 15,
            imageUrl: 'fuzzy.jpg',
            rank: 5,
            createdAt: '2025-04-01T00:00:00Z',
          },
        ],
      });

      const result = await searchListingsFromApi('xyz');
      expect(result.fallback).toBe(true);
    });

    it('searchListingsFromApi handles API errors', async () => {
      mockedFetchJson.mockRejectedValueOnce(new Error('Search service down'));

      const result = await searchListingsFromApi('nike');
      expect(result.items).toHaveLength(0);
      expect(result.error).toBe('Search service down');
    });
  });
});

describe('Discovery surfaces — ProductAnalytics wiring', () => {
  it('ProductAnalytics exports expected event functions', async () => {
    const { ProductAnalytics } = await import('../platform/product/productAnalytics');
    expect(typeof ProductAnalytics.itemView).toBe('function');
    expect(typeof ProductAnalytics.itemSave).toBe('function');
    expect(typeof ProductAnalytics.recommendationClick).toBe('function');
    expect(typeof ProductAnalytics.recommendationImpression).toBe('function');
  });

  it('trackProductEvent calls registered handler', async () => {
    const { setProductAnalyticsHandler, trackProductEvent, setProductSessionId } = await import('../platform/product/productAnalytics');
    const handler = vi.fn();
    setProductAnalyticsHandler(handler);
    setProductSessionId('test-session');
    trackProductEvent('test_event', { listingId: 'l1' });
    expect(handler).toHaveBeenCalledWith({
      event: 'test_event',
      listingId: 'l1',
      sessionId: 'test-session',
    });
  });
});
