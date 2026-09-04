import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useInfiniteList, type InfiniteListPage } from './useInfiniteList';

function renderHook<TResult, TProps>(
  render: (props: TProps) => TResult,
  options?: { wrapper?: React.ComponentType<{ children: React.ReactNode }> }
) {
  const result = { current: undefined as unknown as TResult };

  function TestComponent({ hookProps }: { hookProps: TProps }) {
    result.current = render(hookProps);
    return null;
  }

  const Wrapper = options?.wrapper;
  function getElement(hookProps: TProps) {
    const child = React.createElement(TestComponent, { hookProps });
    return Wrapper ? React.createElement(Wrapper, null, child) : child;
  }

  let testRenderer: TestRenderer.ReactTestRenderer;
  act(() => {
    testRenderer = TestRenderer.create(getElement({} as TProps));
  });

  return {
    result,
    rerender: (newProps: TProps = {} as TProps) => {
      act(() => {
        testRenderer.update(getElement(newProps));
      });
    },
    unmount: () => {
      act(() => {
        testRenderer.unmount();
      });
    },
  };
}

async function waitFor(
  callback: () => void | Promise<void>,
  options?: { timeout?: number; interval?: number }
): Promise<void> {
  const timeout = options?.timeout ?? 4000;
  const interval = options?.interval ?? 30;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      await callback();
      return;
    } catch {
      await act(async () => {
        await new Promise((r) => setTimeout(r, interval));
      });
    }
  }
  await callback();
}

// ─────────────────────────────────────────────────────────────────────────────
// Test types
// ─────────────────────────────────────────────────────────────────────────────

interface TestItem {
  id: string;
  name: string;
}

interface TestParams {
  cursor: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Creates a fresh QueryClient per test so cache state never leaks. */
function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
    },
  });
}

import { ThemeProvider } from '../theme/ThemeContext';
import { AccessibilityPreferencesProvider } from '../context/AccessibilityPreferencesContext';

/** Wraps a hook in the providers it needs (React Query + Accessibility + Theme). */
function createWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client },
      React.createElement(
        AccessibilityPreferencesProvider,
        null,
        React.createElement(ThemeProvider, null, children)
      )
    );
  };
}

/** Builds a mock queryFn that returns pages from a predefined list. */
function createMockQueryFn(
  allItems: TestItem[],
  pageSize: number,
  delayMs = 0,
) {
  return vi.fn(async (params: TestParams): Promise<InfiniteListPage<TestItem>> => {
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    const cursor = params.cursor;
    const startIndex = cursor ? parseInt(cursor, 10) : 0;
    const slice = allItems.slice(startIndex, startIndex + pageSize);
    const nextIndex = startIndex + pageSize;
    const nextCursor = nextIndex < allItems.length ? String(nextIndex) : null;
    return { items: slice, nextCursor };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('useInfiniteList', () => {

  it('flattens items from all loaded pages', async () => {
    const items = Array.from({ length: 50 }, (_, i) => ({
      id: `item-${i}`,
      name: `Item ${i}`,
    }));
    const queryFn = createMockQueryFn(items, 10);
    const client = createQueryClient();

    const { result } = await renderHook(
      () =>
        useInfiniteList<TestItem, TestParams>({
          queryKey: ['test', 'flatten'],
          queryFn,
        }),
      { wrapper: createWrapper(client) },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.items).toHaveLength(10);
    expect(result.current.items[0].id).toBe('item-0');

    await act(async () => {
      await result.current.fetchNextPage();
    });
    await waitFor(() => {
      expect(result.current.items).toHaveLength(20);
      expect(result.current.items[19].id).toBe('item-19');
    });
  });

  it('tracks hasNextPage based on nextCursor', async () => {
    const items = Array.from({ length: 15 }, (_, i) => ({
      id: `item-${i}`,
      name: `Item ${i}`,
    }));
    const queryFn = createMockQueryFn(items, 10);
    const client = createQueryClient();

    const { result } = await renderHook(
      () =>
        useInfiniteList<TestItem, TestParams>({
          queryKey: ['test', 'hasNextPage'],
          queryFn,
        }),
      { wrapper: createWrapper(client) },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasNextPage).toBe(true);

    await act(async () => {
      await result.current.fetchNextPage();
    });
    await waitFor(() => {
      expect(result.current.items).toHaveLength(15);
      expect(result.current.hasNextPage).toBe(false);
    });
  });

  it('returns empty items when disabled', async () => {
    const queryFn = createMockQueryFn([{ id: '1', name: 'A' }], 10);
    const client = createQueryClient();

    const { result } = await renderHook(
      () =>
        useInfiniteList<TestItem, TestParams>({
          queryKey: ['test', 'disabled'],
          queryFn,
          enabled: false,
        }),
      { wrapper: createWrapper(client) },
    );

    expect(result.current.items).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(queryFn).not.toHaveBeenCalled();
  });

  it('keyExtractor uses item.id when available', async () => {
    const queryFn = createMockQueryFn([], 10);
    const client = createQueryClient();

    const { result } = await renderHook(
      () =>
        useInfiniteList<TestItem, TestParams>({
          queryKey: ['test', 'keyExtractor'],
          queryFn,
        }),
      { wrapper: createWrapper(client) },
    );

    const item: TestItem = { id: 'abc', name: 'Test' };
    expect(result.current.keyExtractor(item, 0)).toBe('abc');
  });

  it('keyExtractor falls back to index when item has no id', async () => {
    const queryFn = createMockQueryFn([], 10);
    const client = createQueryClient();

    const { result } = await renderHook(
      () =>
        useInfiniteList<{ name: string }, { cursor: string | null }>({
          queryKey: ['test', 'keyExtractor-fallback'],
          queryFn: queryFn as unknown as (
            params: { cursor: string | null },
          ) => Promise<InfiniteListPage<{ name: string }>>,
        }),
      { wrapper: createWrapper(client) },
    );

    expect(result.current.keyExtractor({ name: 'Test' }, 5)).toBe('5');
  });

  it('debounces onEndReached to prevent duplicate fetches', async () => {
    const items = Array.from({ length: 100 }, (_, i) => ({
      id: `item-${i}`,
      name: `Item ${i}`,
    }));
    const queryFn = createMockQueryFn(items, 10, 50);
    const client = createQueryClient();

    const { result } = await renderHook(
      () =>
        useInfiniteList<TestItem, TestParams>({
          queryKey: ['test', 'debounce'],
          queryFn,
        }),
      { wrapper: createWrapper(client) },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const initialCallCount = queryFn.mock.calls.length;

    // Fire onEndReached 5 times in rapid succession
    act(() => {
      result.current.onEndReached();
      result.current.onEndReached();
      result.current.onEndReached();
      result.current.onEndReached();
      result.current.onEndReached();
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 350));
    });
    await waitFor(() => {
      expect(queryFn.mock.calls.length).toBeGreaterThan(initialCallCount);
      expect(result.current.items).toHaveLength(20);
    });
  });

  it('onRefresh triggers a refetch', async () => {
    const items = Array.from({ length: 10 }, (_, i) => ({
      id: `item-${i}`,
      name: `Item ${i}`,
    }));
    const queryFn = createMockQueryFn(items, 10);
    const client = createQueryClient();

    const { result } = await renderHook(
      () =>
        useInfiniteList<TestItem, TestParams>({
          queryKey: ['test', 'refresh'],
          queryFn,
        }),
      { wrapper: createWrapper(client) },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const initialCallCount = queryFn.mock.calls.length;

    await act(async () => {
      result.current.onRefresh();
    });
    await waitFor(() => {
      expect(queryFn.mock.calls.length).toBeGreaterThan(initialCallCount);
    });
  });

  it('provides sensible defaults for estimatedItemSize', async () => {
    const queryFn = createMockQueryFn([], 10);
    const client = createQueryClient();

    const { result } = await renderHook(
      () =>
        useInfiniteList<TestItem, TestParams>({
          queryKey: ['test', 'defaults'],
          queryFn,
        }),
      { wrapper: createWrapper(client) },
    );

    expect(result.current.estimatedItemSize).toBe(80);
  });

  it('respects custom estimatedItemSize', async () => {
    const queryFn = createMockQueryFn([], 10);
    const client = createQueryClient();

    const { result } = await renderHook(
      () =>
        useInfiniteList<TestItem, TestParams>({
          queryKey: ['test', 'custom-size'],
          queryFn,
          estimatedItemSize: 150,
        }),
      { wrapper: createWrapper(client) },
    );

    expect(result.current.estimatedItemSize).toBe(150);
  });

  it('handles error state and allows retry via refetch', async () => {
    const queryFn = vi.fn(async (): Promise<InfiniteListPage<TestItem>> => {
      throw new Error('Network error');
    });
    const client = createQueryClient();

    const { result } = await renderHook(
      () =>
        useInfiniteList<TestItem, TestParams>({
          queryKey: ['test', 'error'],
          queryFn,
        }),
      { wrapper: createWrapper(client) },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.items).toEqual([]);
    expect(result.current.error).toBeInstanceOf(Error);

    // Fix the queryFn and retry
    queryFn.mockResolvedValue({
      items: [{ id: '1', name: 'Recovered' }],
      nextCursor: null,
    });

    await act(async () => {
      await result.current.refetch();
    });
    await waitFor(() => expect(result.current.isError).toBe(false));
    expect(result.current.items).toHaveLength(1);
  });

  it('returns empty array for items when query has no data', async () => {
    const queryFn = createMockQueryFn([], 10);
    const client = createQueryClient();

    const { result } = await renderHook(
      () =>
        useInfiniteList<TestItem, TestParams>({
          queryKey: ['test', 'no-data'],
          queryFn,
        }),
      { wrapper: createWrapper(client) },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.items).toEqual([]);
    expect(result.current.hasNextPage).toBe(false);
  });

  it('exposes ListEmptyComponent and ListFooterComponent as component types', async () => {
    const queryFn = createMockQueryFn([], 10);
    const client = createQueryClient();

    const { result } = await renderHook(
      () =>
        useInfiniteList<TestItem, TestParams>({
          queryKey: ['test', 'components'],
          queryFn,
        }),
      { wrapper: createWrapper(client) },
    );

    expect(typeof result.current.ListEmptyComponent).toBe('function');
    expect(typeof result.current.ListFooterComponent).toBe('function');
  });
});
