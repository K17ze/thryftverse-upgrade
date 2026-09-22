/**
 * Regression tests for PKG-07 — FRESH-03 (failed-page retry on a populated
 * result list), FRESH-08 (editorial hero is a real navigation target or
 * honestly non-interactive), FRESH-10 (per-module failure attribution), and
 * S20-05 (recommendation controls surface persistence state; hides do not
 * filter explicit search results).
 *
 * The screen tests exercise the production UnifiedDiscoveryScreen with the
 * discovery hooks barrel and child views mocked at the module boundary, so
 * the assertions run against real screen logic (hiddenListingIds filtering,
 * the feedback-notice state machine, undo window). On the pre-fix code the
 * hidden item was filtered out of search results too, the notice strip did
 * not exist, and there was no retry for a failed persistence write.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import type { DiscoveryFeedUnit } from '../contracts/discoveryFeedUnit';
import type { DiscoveryListingSummary } from '../contracts/DiscoveryListingSummary';
import type { FeedControlResult } from '../services/recommendationFeedbackApi';

// ── Shared mutable harness (hoisted so mock factories can close over it) ──
const h = vi.hoisted(() => {
  const colors = new Proxy({}, { get: () => '#000000' });
  const allChip = {
    id: 'all',
    label: 'All',
    filterKey: 'all',
    kind: 'all' as const,
    score: 100,
    isPersonalized: false,
  };
  return {
    colors,
    allChip,
    feedViewProps: { current: null as any },
    searchViewProps: { current: null as any },
    gridProps: { current: null as any },
    markItemNotInterested: vi.fn(
      async (..._args: unknown[]): Promise<FeedControlResult> => ({ persisted: true })),
    showFewerLikeThis: vi.fn(
      async (..._args: unknown[]): Promise<FeedControlResult> => ({ persisted: true })),
    undoItemNotInterested: vi.fn(
      async (..._args: unknown[]): Promise<FeedControlResult> => ({ persisted: true })),
    forYouRefresh: vi.fn(async (..._args: unknown[]) => {}),
    dismissListing: vi.fn((..._args: unknown[]) => {}),
    storeState: {
      currentUser: { id: 'u1' } as { id: string } | null,
      isSavedProduct: () => false,
      savedSearches: [] as unknown[],
      addSavedSearch: vi.fn(),
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
    },
    content: {
      looks: [] as unknown[],
      posters: [] as unknown[],
      moodboards: [] as unknown[],
      collections: [] as unknown[],
      editorials: [] as unknown[],
      isDiscoveryLoading: false,
      discoveryError: null as string | null,
      staleModules: [] as string[],
      loadDiscoveryContent: vi.fn(async () => {}),
    },
    categories: {
      activeCategory: 'All',
      activeSignalChip: allChip,
      categoryPills: [allChip],
      handleCategoryChange: vi.fn(),
    },
    feed: {
      forYouFeed: {
        items: [] as unknown[],
        listings: [] as unknown[],
        requestId: undefined as string | undefined,
        policyVersion: undefined as string | undefined,
        isLoading: false,
        dismissListing: (...args: unknown[]) => h.dismissListing(...args),
        refresh: (...args: unknown[]) => h.forYouRefresh(...args),
      },
      refreshListings: vi.fn(async () => {}),
      feedUnits: [] as unknown[],
      hasAnyContent: true,
      showLoadingSkeleton: false,
      showError: false,
      showEmpty: false,
      showFilteredEmpty: false,
      lastError: null as string | null,
      isSyncing: false,
      feedHasMore: false,
      feedIsLoadingMore: false,
      loadMore: undefined as unknown,
    },
    search: {
      query: '',
      setQuery: vi.fn(),
      setIsSearchFocused: vi.fn(),
      isSearchingMode: false,
      searchScope: 'items' as 'items' | 'people',
      setSearchScope: vi.fn(),
      searchResults: [] as unknown[],
      isSearching: false,
      searchError: null as string | null,
      retrySearch: vi.fn(),
      searchPageError: null as string | null,
      retrySearchPage: vi.fn(),
      searchUsedFallback: false,
      searchHasMore: false,
      isSearchingMore: false,
      loadMoreSearch: vi.fn(),
      peopleResults: [] as unknown[],
      isSearchingPeople: false,
      peopleError: null as string | null,
      retryPeopleSearch: vi.fn(),
      activeSearchFilterCount: 0,
      clearSearchFilters: vi.fn(),
      handleSubmitSearch: vi.fn(),
    },
  };
});

// ── react-native — string-component mock (same convention as
//  coownDistributionDepth.test.tsx) so the real views render host nodes. ──
vi.mock('react-native', async () => {
  const React = await import('react');
  const createMock = (name: string) =>
    React.forwardRef((props: any, ref: any) =>
      React.createElement(name, { ref, ...props }));
  return {
    View: createMock('View'),
    Text: createMock('Text'),
    Pressable: createMock('Pressable'),
    ScrollView: createMock('ScrollView'),
    RefreshControl: createMock('RefreshControl'),
    Modal: createMock('Modal'),
    ActivityIndicator: createMock('ActivityIndicator'),
    TextInput: createMock('TextInput'),
    KeyboardAvoidingView: createMock('KeyboardAvoidingView'),
    StyleSheet: {
      create: (s: any) => s,
      hairlineWidth: 0.5,
      absoluteFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    },
    Platform: { OS: 'ios', select: (o: any) => o.ios },
    Dimensions: { get: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }) },
    useWindowDimensions: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }),
    Appearance: { getColorScheme: () => 'light', addChangeListener: () => ({ remove: () => {} }) },
    I18nManager: { isRTL: false },
  };
});

vi.mock('../theme/ThemeContext', () => ({
  useAppTheme: () => ({ colors: h.colors, isDark: false }),
}));

vi.mock('expo-linear-gradient', async () => {
  const React = await import('react');
  return { LinearGradient: (props: any) => React.createElement('LinearGradient', props) };
});

vi.mock('../components/CachedImage', async () => {
  const React = await import('react');
  return { CachedImage: (props: any) => React.createElement('CachedImage', props) };
});

vi.mock('../components/OfflineBanner', async () => {
  const React = await import('react');
  return { OfflineBanner: (props: any) => React.createElement('OfflineBanner', props) };
});

vi.mock('../components/skeletons/MasonrySkeleton', async () => {
  const React = await import('react');
  return { MasonrySkeleton: (props: any) => React.createElement('Skeleton', props) };
});

vi.mock('../components/flagship', async () => {
  const React = await import('react');
  return {
    FlagshipState: (props: any) => React.createElement('FlagshipState', props),
    FlagshipScreen: ({ header, children }: any) =>
      React.createElement(React.Fragment, null, header, children),
  };
});

vi.mock('../components/discover/PinterestMasonryGrid', async () => {
  const React = await import('react');
  return {
    PinterestMasonryGrid: (props: any) => {
      h.gridProps.current = props;
      return React.createElement('MasonryGrid', props, props.listHeaderComponent);
    },
  };
});

vi.mock('../components/HorizontalRail', async () => {
  const React = await import('react');
  return {
    HorizontalRail: (props: any) => React.createElement('HorizontalRail', props, props.children),
  };
});

vi.mock('../components/discovery/DiscoveryCollectionRailCard', async () => {
  const React = await import('react');
  return {
    DiscoveryCollectionRailCard: (props: any) =>
      React.createElement('RailCard', props),
  };
});

vi.mock('../components/discovery/DiscoveryPeopleResultRow', async () => {
  const React = await import('react');
  return {
    DiscoveryPeopleResultRow: (props: any) => React.createElement('PeopleRow', props),
  };
});

vi.mock('../components/common/AppIcon', async () => {
  const React = await import('react');
  return { AppIcon: (props: any) => React.createElement('AppIcon', props) };
});

// ── Screen-level mocks: the hooks barrel and child views are stubbed so the
//  assertions run against the real screen orchestration. ──
vi.mock('../hooks/discovery', () => ({
  useDiscoveryContent: () => h.content,
  useDiscoveryCategories: () => h.categories,
  useDiscoveryFeed: () => h.feed,
  useDiscoverySearch: () => h.search,
}));

vi.mock('../components/discovery', () => ({
  DiscoveryFeedView: (props: any) => {
    h.feedViewProps.current = props;
    return null;
  },
  DiscoverySearchResultsView: (props: any) => {
    h.searchViewProps.current = props;
    return null;
  },
  DiscoverySearchHeader: () => null,
  createUnifiedDiscoveryStyles: () => ({}),
}));

vi.mock('../components/closet/SaveToCollectionModal', () => ({
  SaveToCollectionModal: () => null,
}));
vi.mock('../components/algorithm/FeedExplanationSheet', () => ({
  FeedExplanationSheet: () => null,
}));
vi.mock('../platform/product/openProductDetail', () => ({
  openProductDetail: vi.fn(),
}));
vi.mock('../hooks/useConnectivity', () => ({
  useConnectivity: () => ({ isOffline: false }),
}));
vi.mock('../hooks/useHaptic', () => ({
  useHaptic: () => ({ light: vi.fn(), medium: vi.fn(), selection: vi.fn(), success: vi.fn() }),
}));
vi.mock('../hooks/useSaveToCollectionPicker', () => ({
  useSaveToCollectionPicker: () => ({
    savePickerItemId: null,
    handleQuickSave: vi.fn(),
    handleSaveLongPress: vi.fn(),
    closeSavePicker: vi.fn(),
  }),
}));
vi.mock('../store/useStore', () => {
  const useStore: any = (selector: (s: typeof h.storeState) => unknown) => selector(h.storeState);
  useStore.getState = () => h.storeState;
  return { useStore };
});
vi.mock('../services/recommendationFeedbackApi', () => ({
  markItemNotInterested: (...args: unknown[]) => h.markItemNotInterested(...args),
  showFewerLikeThis: (...args: unknown[]) => h.showFewerLikeThis(...args),
  undoItemNotInterested: (...args: unknown[]) => h.undoItemNotInterested(...args),
}));
vi.mock('../navigation/types', () => ({}));

import { DiscoveryFeedView } from '../components/discovery/DiscoveryFeedView';
import { DiscoverySearchResultsView } from '../components/discovery/DiscoverySearchResultsView';
import UnifiedDiscoveryScreen from '../screens/UnifiedDiscoveryScreen';

// ── Fixtures ──
const listingSummary = (id: string): DiscoveryListingSummary =>
  ({
    id,
    sellerId: `seller-${id}`,
    title: `Jacket ${id}`,
    brand: null,
    size: null,
    condition: null,
    price: 20,
    images: [`https://img.test/${id}.jpg`],
    likes: null,
    category: 'women',
    createdAt: '2026-01-01T00:00:00Z',
  }) as unknown as DiscoveryListingSummary;

const listingUnit = (id: string): DiscoveryFeedUnit =>
  ({
    id: `listing:${id}`,
    type: 'listing',
    listing: listingSummary(id),
    mediaUri: `https://img.test/${id}.jpg`,
    aspectRatio: 1,
  }) as DiscoveryFeedUnit;

const editorial = {
  id: 'e1',
  title: 'The Archive Edit',
  excerpt: '',
  heroImage: 'https://img.test/hero.jpg',
  author: 'Ana',
  authorAvatar: '',
  publishedAt: '2026-01-01T00:00:00Z',
  readTime: '4 min',
  content: [],
  isDemo: false,
} as any;

const collection = {
  id: 'c1',
  title: 'Archive',
  subtitle: '',
  curator: 'Curator',
  curatorAvatar: '',
  coverImage: 'https://img.test/c1.jpg',
  theme: 'Archive',
  publishedAt: '2026-01-01T00:00:00Z',
  itemIds: [],
  isDemo: false,
} as any;

const feedViewProps = (over: Record<string, unknown> = {}) => ({
  units: [listingUnit('x1')],
  isLoading: false,
  showError: false,
  showEmpty: false,
  showFilteredEmpty: false,
  isOffline: false,
  activeCategory: 'All',
  onCategoryChange: vi.fn(),
  categoryPills: [h.allChip],
  heroEditorial: undefined,
  collections: [] as any[],
  onListingPress: vi.fn(),
  onLookPress: vi.fn(),
  onPosterPress: vi.fn(),
  onMoodboardPress: vi.fn(),
  onCollectionPress: vi.fn(),
  onRefresh: vi.fn(),
  isRefreshing: false,
  hasMore: false,
  isLoadingMore: false,
  scrollRef: { current: null },
  ...over,
});

const searchViewProps = (over: Record<string, unknown> = {}) => ({
  units: [listingUnit('x1')],
  isSearching: false,
  isSearchingPeople: false,
  peopleResults: [],
  searchScope: 'items' as const,
  searchError: null,
  onRetry: vi.fn(),
  onScopeChange: vi.fn(),
  activeFilterCount: 0,
  onOpenFilters: vi.fn(),
  onClearFilters: vi.fn(),
  onListingPress: vi.fn(),
  onLookPress: vi.fn(),
  onPosterPress: vi.fn(),
  onMoodboardPress: vi.fn(),
  onUserPress: vi.fn(),
  ...over,
});

// Host nodes only — the string-component mocks mean findAll matches both
// the composite (Pressable) and its rendered host element for the same
// props; restricting to string types dedupes to the single host node.
const findByA11yLabel = (root: TestRenderer.ReactTestInstance, label: string) =>
  root.findAll((n) => typeof n.type === 'string' && n.props?.accessibilityLabel === label);

const jsonText = (node: any): string[] => {
  if (node == null || typeof node === 'boolean') return [];
  if (typeof node === 'string' || typeof node === 'number') return [String(node)];
  if (Array.isArray(node)) return node.flatMap(jsonText);
  return node.children ? jsonText(node.children) : [];
};

const screenText = (renderer: TestRenderer.ReactTestRenderer) =>
  jsonText(renderer.toJSON()).join('\n');

// ============================================================================
// FRESH-03 — failed-page retry strip on a populated result list
// ============================================================================
describe('DiscoverySearchResultsView — failed-page retry (FRESH-03)', () => {
  it('renders an inline retry strip when a page fails on a populated list', async () => {
    const onRetryPage = vi.fn();
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <DiscoverySearchResultsView
          {...searchViewProps({
            pageError: 'Couldn’t load more results.',
            onRetryPage,
            resultCount: 1,
          })}
        />,
      );
    });

    const retry = findByA11yLabel(renderer.root, 'Retry loading more results');
    expect(retry).toHaveLength(1);
    expect(screenText(renderer)).toContain('Couldn’t load more results.');

    act(() => { retry[0].props.onPress(); });
    expect(onRetryPage).toHaveBeenCalledTimes(1);

    act(() => renderer.unmount());
  });

  it('does not render the strip on an empty result set', async () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <DiscoverySearchResultsView
          {...searchViewProps({
            units: [],
            pageError: 'Couldn’t load more results.',
            onRetryPage: vi.fn(),
          })}
        />,
      );
    });
    expect(findByA11yLabel(renderer.root, 'Retry loading more results')).toHaveLength(0);
    act(() => renderer.unmount());
  });
});

// ============================================================================
// FRESH-10 + FRESH-08 — module attribution and editorial hero
// ============================================================================
describe('DiscoveryFeedView — per-module failure attribution (FRESH-10)', () => {
  it('renders an inline retry at a failed module’s position', async () => {
    const onRefresh = vi.fn();
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <DiscoveryFeedView
          {...feedViewProps({ staleModules: ['collections'], collections: [], onRefresh })}
        />,
      );
    });

    const retry = findByA11yLabel(renderer.root, "Collections couldn't load. Tap to retry.");
    expect(retry).toHaveLength(1);
    act(() => { retry[0].props.onPress(); });
    expect(onRefresh).toHaveBeenCalledTimes(1);

    act(() => renderer.unmount());
  });

  it('keeps cached collections visible AND attributes the stale refresh', async () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <DiscoveryFeedView
          {...feedViewProps({ staleModules: ['collections'], collections: [collection] })}
        />,
      );
    });

    // Cached content stays on screen (the rail card renders) and the failure
    // is still attributed inline — never silently absent.
    expect(renderer.root.findAll((n) => n.type === ('RailCard' as unknown))).toHaveLength(1);
    expect(
      findByA11yLabel(renderer.root, "Collections couldn't load. Tap to retry."),
    ).toHaveLength(1);

    act(() => renderer.unmount());
  });

  it('attributes feed-woven module failures and the listings sync error', async () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <DiscoveryFeedView
          {...feedViewProps({
            staleModules: ['looks', 'posters', 'moodboards', 'editorials'],
            listingsError: 'Listings sync failed',
          })}
        />,
      );
    });

    const labels = renderer.root
      .findAll((n) => typeof n.type === 'string'
        && typeof n.props?.accessibilityLabel === 'string'
        && n.props.accessibilityLabel.includes("couldn't load"))
      .map((n) => n.props.accessibilityLabel);
    expect(labels).toEqual(expect.arrayContaining([
      "Looks couldn't load. Tap to retry.",
      "Posters couldn't load. Tap to retry.",
      "Moodboards couldn't load. Tap to retry.",
      "Editorial couldn't load. Tap to retry.",
      "Latest items couldn't load. Tap to retry.",
    ]));
    expect(labels).toHaveLength(5);

    act(() => renderer.unmount());
  });

  it('suppresses module retry rows while offline (the banner owns the state)', async () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <DiscoveryFeedView
          {...feedViewProps({ staleModules: ['collections'], collections: [], isOffline: true })}
        />,
      );
    });
    expect(
      findByA11yLabel(renderer.root, "Collections couldn't load. Tap to retry."),
    ).toHaveLength(0);
    act(() => renderer.unmount());
  });
});

describe('DiscoveryFeedView — editorial hero destination (FRESH-08)', () => {
  it('is a real navigation target when a handler is provided', async () => {
    const onEditorialPress = vi.fn();
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <DiscoveryFeedView
          {...feedViewProps({ heroEditorial: editorial, onEditorialPress })}
        />,
      );
    });

    const hero = findByA11yLabel(renderer.root, 'The Archive Edit');
    expect(hero).toHaveLength(1);
    expect(hero[0].props.accessibilityRole).toBe('button');
    act(() => { hero[0].props.onPress(); });
    expect(onEditorialPress).toHaveBeenCalledTimes(1);

    act(() => renderer.unmount());
  });

  it('renders non-interactive without a handler — no fake affordance', async () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <DiscoveryFeedView {...feedViewProps({ heroEditorial: editorial })} />,
      );
    });

    expect(
      findByA11yLabel(renderer.root, 'The Archive Edit'),
    ).toHaveLength(0);
    expect(screenText(renderer)).toContain('The Archive Edit');

    act(() => renderer.unmount());
  });
});

// ============================================================================
// S20-05 — recommendation controls: persistence states, undo, and the
// recommendation-vs-search scope boundary
// ============================================================================
describe('UnifiedDiscoveryScreen — feed-control persistence (S20-05)', () => {
  const nav = { navigate: vi.fn(), goBack: vi.fn(), dispatch: vi.fn() } as any;
  const route = { key: 'k', name: 'UnifiedDiscovery', params: {} } as any;

  const mountScreen = async () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<UnifiedDiscoveryScreen navigation={nav} route={route} />);
    });
    return renderer;
  };

  const hideFromFeedControls = (renderer: TestRenderer.ReactTestRenderer, id = 'x1') => {
    const target = listingSummary(id);
    act(() => { h.feedViewProps.current.onListingLongPress(target); });
    const row = findByA11yLabel(renderer.root, `Not interested in Jacket ${id}`);
    expect(row).toHaveLength(1);
    act(() => { row[0].props.onPress(); });
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    h.markItemNotInterested.mockResolvedValue({ persisted: true });
    h.showFewerLikeThis.mockResolvedValue({ persisted: true });
    h.undoItemNotInterested.mockResolvedValue({ persisted: true });
    h.feed.feedUnits = [listingUnit('x1')];
    h.feed.lastError = null;
    h.search.isSearchingMode = false;
    h.search.searchResults = [];
    h.search.query = '';
    h.content.staleModules = [];
    h.feedViewProps.current = null;
    h.searchViewProps.current = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('filters a hidden listing from the feed but NOT from explicit search results', async () => {
    const renderer = await mountScreen();
    expect(h.feedViewProps.current.units.map((u: any) => u.id)).toEqual(['listing:x1']);

    hideFromFeedControls(renderer);

    // Hidden from the personalised feed…
    expect(h.feedViewProps.current.units.map((u: any) => u.id)).toEqual([]);

    // …but an explicit text search for it is direct user intent — the
    // recommendation preference must not suppress the result.
    h.search.isSearchingMode = true;
    h.search.query = 'jacket';
    h.search.searchResults = [listingUnit('x1')];
    await act(async () => {
      renderer.update(<UnifiedDiscoveryScreen navigation={nav} route={route} />);
    });
    expect(h.searchViewProps.current.units.map((u: any) => u.id)).toEqual(['listing:x1']);

    act(() => renderer.unmount());
  });

  it('queues the durable write and surfaces a retry when persistence fails', async () => {
    h.markItemNotInterested.mockResolvedValue({ persisted: false, failure: 'unavailable' });
    const renderer = await mountScreen();

    hideFromFeedControls(renderer);
    // Nothing persisted yet — the undo window is still open.
    expect(h.markItemNotInterested).not.toHaveBeenCalled();
    expect(screenText(renderer)).toContain('Hidden from your feed');

    await act(async () => { vi.advanceTimersByTime(4000); });
    await act(async () => {});
    expect(h.markItemNotInterested).toHaveBeenCalledTimes(1);

    // The failure is honest: a retry affordance, not silence.
    expect(screenText(renderer)).toContain("Couldn't save this preference");
    const retry = findByA11yLabel(renderer.root, 'Retry saving preference');
    expect(retry).toHaveLength(1);

    h.markItemNotInterested.mockResolvedValueOnce({ persisted: true });
    await act(async () => { retry[0].props.onPress(); });
    expect(h.markItemNotInterested).toHaveBeenCalledTimes(2);
    await act(async () => {});
    expect(screenText(renderer)).toContain("won't be recommended again");

    act(() => renderer.unmount());
  });

  it('says session-only for guests instead of offering a dead retry', async () => {
    h.markItemNotInterested.mockResolvedValue({ persisted: false, failure: 'anonymous' });
    const renderer = await mountScreen();

    hideFromFeedControls(renderer);
    await act(async () => { vi.advanceTimersByTime(4000); });
    await act(async () => {});

    expect(screenText(renderer)).toContain('Hidden for this session');
    expect(findByA11yLabel(renderer.root, 'Retry saving preference')).toHaveLength(0);

    act(() => renderer.unmount());
  });

  it('undo inside the window cancels the write and restores the tile', async () => {
    const renderer = await mountScreen();
    hideFromFeedControls(renderer);
    expect(h.feedViewProps.current.units.map((u: any) => u.id)).toEqual([]);

    await act(async () => { vi.advanceTimersByTime(1000); });
    const undo = findByA11yLabel(renderer.root, 'Undo hiding Jacket x1');
    expect(undo).toHaveLength(1);
    await act(async () => { undo[0].props.onPress(); });

    // Restored locally and the durable write never fired — a true reversal.
    expect(h.feedViewProps.current.units.map((u: any) => u.id)).toEqual(['listing:x1']);
    await act(async () => { vi.advanceTimersByTime(6000); });
    expect(h.markItemNotInterested).not.toHaveBeenCalled();
    expect(h.forYouRefresh).toHaveBeenCalled();

    act(() => renderer.unmount());
  });

  it('flushes a queued hide on unmount — the explicit choice still persists', async () => {
    const renderer = await mountScreen();
    hideFromFeedControls(renderer);
    expect(h.markItemNotInterested).not.toHaveBeenCalled();

    act(() => renderer.unmount());
    expect(h.markItemNotInterested).toHaveBeenCalledTimes(1);
  });

  // ── S21-03: queued writes are bound to the action-time identity ──
  it('binds the delayed hide write to the account captured at hide-time', async () => {
    const renderer = await mountScreen();
    hideFromFeedControls(renderer);

    // The account switches inside the undo window — the queued job must
    // still present the ORIGINAL identity to the service, never re-resolve
    // whoever is signed in when the timer fires.
    h.storeState.currentUser = { id: 'u2' };
    await act(async () => { vi.advanceTimersByTime(4000); });
    await act(async () => {});

    expect(h.markItemNotInterested).toHaveBeenCalledTimes(1);
    expect(h.markItemNotInterested.mock.calls[0][2]).toEqual({ userId: 'u1' });

    h.storeState.currentUser = { id: 'u1' };
    act(() => renderer.unmount());
  });

  it('the unmount flush also submits under the captured identity', async () => {
    const renderer = await mountScreen();
    hideFromFeedControls(renderer);
    h.storeState.currentUser = { id: 'u2' };

    act(() => renderer.unmount());
    expect(h.markItemNotInterested).toHaveBeenCalledTimes(1);
    expect(h.markItemNotInterested.mock.calls[0][2]).toEqual({ userId: 'u1' });
    h.storeState.currentUser = { id: 'u1' };
  });
});

// ============================================================================
// S21-02 — the editorial hero navigates to the piece's own article screen
// ============================================================================
describe('UnifiedDiscoveryScreen — editorial destination identity (S21-02)', () => {
  const nav = { navigate: vi.fn(), goBack: vi.fn(), dispatch: vi.fn() } as any;
  const route = { key: 'k', name: 'UnifiedDiscovery', params: {} } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    h.feed.feedUnits = [listingUnit('x1')];
    h.content.editorials = [editorial];
    h.storeState.currentUser = { id: 'u1' };
  });

  it('navigates to GalleriaEditorial with the piece ID — not a generic section push', async () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<UnifiedDiscoveryScreen navigation={nav} route={route} />);
    });

    act(() => { h.feedViewProps.current.onEditorialPress(editorial); });
    expect(nav.navigate).toHaveBeenCalledWith('GalleriaEditorial', { editorialId: 'e1' });

    act(() => renderer.unmount());
  });
});
