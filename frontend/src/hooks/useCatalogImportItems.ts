/**
 * useCatalogImportItems — paginated review-workbench item list for a single
 * catalog import batch.
 *
 * Uses cursor-based pagination and exposes a flat `items` array ready for
 * FlashList. Filter changes reset the list and re-fetch from the first page.
 * The summary counts (ready / needsInput / probableDuplicate / excluded /
 * total) are refreshed on every page load so the workbench tabs stay in sync
 * with the backend's view of the batch.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchImportItems,
  CatalogImportError,
} from '../services/catalogImportApi';
import type {
  ImportItemDTO,
  ItemReadiness,
  ItemListSummary,
  SellerDecision,
  FetchItemsResult,
} from '../services/catalogImportApi';

export interface ImportItemsFilter {
  readiness?: ItemReadiness;
  decision?: SellerDecision;
}

export interface UseCatalogImportItemsResult {
  items: ImportItemDTO[];
  summary: ItemListSummary | null;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  filter: ImportItemsFilter;
  setFilter: (filter: ImportItemsFilter) => void;
}

const DEFAULT_PAGE_SIZE = 50;

export function useCatalogImportItems(
  batchId: string | null | undefined,
  initialFilter?: ImportItemsFilter
): UseCatalogImportItemsResult {
  const [items, setItems] = useState<ImportItemDTO[]>([]);
  const [summary, setSummary] = useState<ItemListSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(batchId));
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [filter, setFilterState] = useState<ImportItemsFilter>(initialFilter ?? {});

  const isMountedRef = useRef<boolean>(true);
  const batchIdRef = useRef<string | null | undefined>(batchId);
  batchIdRef.current = batchId;
  const filterRef = useRef<ImportItemsFilter>(filter);
  filterRef.current = filter;
  const cursorRef = useRef<string | null>(null);
  const loadingMoreRef = useRef<boolean>(false);

  const fetchPage = useCallback(
    async (cursor: string | null): Promise<FetchItemsResult> => {
      const id = batchIdRef.current;
      if (!id) {
        return { items: [], nextCursor: null, summary: { ready: 0, needsInput: 0, probableDuplicate: 0, excluded: 0, total: 0 } };
      }
      const activeFilter = filterRef.current;
      return fetchImportItems(id, {
        cursor: cursor ?? undefined,
        readiness: activeFilter.readiness,
        decision: activeFilter.decision,
        limit: DEFAULT_PAGE_SIZE,
      });
    },
    []
  );

  // Reset and load the first page.
  const loadFirstPage = useCallback(async (): Promise<void> => {
    const id = batchIdRef.current;
    if (!id) {
      setItems([]);
      setSummary(null);
      setHasMore(false);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    cursorRef.current = null;
    try {
      const result = await fetchPage(null);
      if (!isMountedRef.current || !result) return;
      setItems(result.items);
      setSummary(result.summary);
      cursorRef.current = result.nextCursor;
      setHasMore(result.nextCursor !== null);
    } catch (cause) {
      if (!isMountedRef.current) return;
      const message =
        cause instanceof CatalogImportError ? cause.message : 'Failed to load import items.';
      setError(message);
      setItems([]);
      setHasMore(false);
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }, [fetchPage]);

  // Initial load + teardown.
  useEffect(() => {
    isMountedRef.current = true;
    void loadFirstPage();
    return () => {
      isMountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId]);

  // Filter changes reset the list and re-fetch from the first page.
  const setFilter = useCallback((nextFilter: ImportItemsFilter): void => {
    setFilterState(nextFilter);
    void loadFirstPage();
  }, [loadFirstPage]);

  const loadMore = useCallback(async (): Promise<void> => {
    const id = batchIdRef.current;
    if (!id) return;
    if (loadingMoreRef.current) return;
    if (cursorRef.current === null) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const result = await fetchPage(cursorRef.current);
      if (!isMountedRef.current || !result) return;
      setItems((prev) => {
        // De-duplicate by item id in case the backend cursor overlaps.
        const seen = new Set(prev.map((item) => item.id));
        const merged = prev.slice();
        for (const item of result.items) {
          if (!seen.has(item.id)) {
            merged.push(item);
            seen.add(item.id);
          }
        }
        return merged;
      });
      setSummary(result.summary);
      cursorRef.current = result.nextCursor;
      setHasMore(result.nextCursor !== null);
    } catch (cause) {
      if (!isMountedRef.current) return;
      const message =
        cause instanceof CatalogImportError ? cause.message : 'Failed to load more items.';
      setError(message);
    } finally {
      loadingMoreRef.current = false;
      if (isMountedRef.current) setLoadingMore(false);
    }
  }, [fetchPage]);

  const refresh = useCallback(async (): Promise<void> => {
    await loadFirstPage();
  }, [loadFirstPage]);

  return {
    items,
    summary,
    loading,
    loadingMore,
    error,
    hasMore,
    loadMore,
    refresh,
    filter,
    setFilter,
  };
}
