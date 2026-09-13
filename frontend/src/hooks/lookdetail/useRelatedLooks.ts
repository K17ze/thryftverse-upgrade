import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchRelatedLooksFromApi, type LookApiItem } from '../../services/looksApi';

export interface UseRelatedLooksResult {
  relatedLooks: LookApiItem[];
  relatedLoading: boolean;
  relatedLoadingMore: boolean;
  relatedHasMore: boolean;
  relatedError: boolean;
  /** Infinite-scroll: load more related looks when the user nears the bottom. */
  loadMoreRelated: () => Promise<void>;
  /** Retry the initial related-looks fetch after an error. */
  retryRelatedFetch: () => void;
  /** Retry pagination after a load-more error — preserves already-loaded items. */
  retryLoadMore: () => void;
}

/**
 * Owns the "More to explore" masonry-grid domain: the backend
 * /looks/:lookId/related endpoint with tag-overlap ranking and cursor
 * pagination for infinite scroll. Replaces the former two horizontal rails
 * (more-from-creator + similar-looks) with a single dense masonry grid that
 * flows directly from the detail.
 */
export function useRelatedLooks(look: LookApiItem | null): UseRelatedLooksResult {
  const [relatedLooks, setRelatedLooks] = useState<LookApiItem[]>([]);
  const [relatedCursor, setRelatedCursor] = useState<string | null>(null);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const [relatedLoadingMore, setRelatedLoadingMore] = useState(false);
  const [relatedHasMore, setRelatedHasMore] = useState(true);
  const [relatedError, setRelatedError] = useState(false);

  // Ref guard prevents race condition: FlashList can fire onEndReached
  // multiple times before setRelatedLoadingMore(true) propagates through
  // React's async state update, causing duplicate API calls and duplicate
  // items. The ref check is synchronous.
  const loadingMoreRef = useRef(false);

  // Related looks — server-ranked by tag overlap, cursor-paginated for
  // infinite scroll. Runs after the look loads.
  useEffect(() => {
    if (!look?.creator?.id) return;
    let cancelled = false;

    setRelatedLoading(true);
    setRelatedLooks([]);
    setRelatedCursor(null);
    setRelatedHasMore(true);
    setRelatedError(false);
    fetchRelatedLooksFromApi(look.id, { limit: 24 })
      .then((res) => {
        if (cancelled) return;
        setRelatedLooks(res.items);
        setRelatedCursor(res.nextCursor ?? null);
        setRelatedHasMore(!!res.nextCursor);
      })
      .catch(() => {
        if (cancelled) return;
        setRelatedError(true);
        setRelatedHasMore(false);
      })
      .finally(() => {
        if (!cancelled) setRelatedLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [look]);

  // Shared page fetch — reads the cursor passed in so retries are not
  // hostage to stale guard closures (a failed load-more leaves hasMore
  // false in the render that produced the last loadMoreRelated closure).
  const fetchPage = useCallback(async (cursor: string) => {
    if (!look || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setRelatedLoadingMore(true);
    setRelatedError(false);
    try {
      const res = await fetchRelatedLooksFromApi(look.id, { cursor, limit: 24 });
      // Dedup guard — prevents duplicate items if the race-condition ref
      // guard ever fails or the backend cursor pagination has edge cases.
      setRelatedLooks((prev) => {
        const existingIds = new Set(prev.map(l => l.id));
        const fresh = res.items.filter(l => !existingIds.has(l.id));
        return fresh.length === res.items.length ? [...prev, ...res.items] : [...prev, ...fresh];
      });
      setRelatedCursor(res.nextCursor ?? null);
      setRelatedHasMore(!!res.nextCursor);
    } catch {
      // Non-fatal — surface a retry affordance in the footer.
      setRelatedError(true);
      setRelatedHasMore(false);
    } finally {
      loadingMoreRef.current = false;
      setRelatedLoadingMore(false);
    }
  }, [look]);

  // Infinite-scroll: load more related looks when the user nears the bottom.
  const loadMoreRelated = useCallback(async () => {
    if (relatedLoading || !relatedHasMore || !relatedCursor) return;
    await fetchPage(relatedCursor);
  }, [relatedLoading, relatedHasMore, relatedCursor, fetchPage]);

  // Retry the initial related-looks fetch after an error.
  const retryRelatedFetch = useCallback(() => {
    if (!look) return;
    setRelatedError(false);
    setRelatedLoading(true);
    setRelatedLooks([]);
    setRelatedCursor(null);
    setRelatedHasMore(true);
    fetchRelatedLooksFromApi(look.id, { limit: 24 })
      .then((res) => {
        setRelatedLooks(res.items);
        setRelatedCursor(res.nextCursor ?? null);
        setRelatedHasMore(!!res.nextCursor);
      })
      .catch(() => {
        setRelatedError(true);
        setRelatedHasMore(false);
      })
      .finally(() => setRelatedLoading(false));
  }, [look]);

  // Retry pagination after a load-more error — preserves already-loaded
  // items. Calls fetchPage directly with the last-known cursor: the
  // load-more catch path leaves relatedHasMore=false, so delegating to
  // loadMoreRelated would hit its stale guard closure and silently no-op.
  const retryLoadMore = useCallback(() => {
    if (!relatedCursor) return;
    setRelatedHasMore(true);
    void fetchPage(relatedCursor);
  }, [relatedCursor, fetchPage]);

  return {
    relatedLooks,
    relatedLoading,
    relatedLoadingMore,
    relatedHasMore,
    relatedError,
    loadMoreRelated,
    retryRelatedFetch,
    retryLoadMore,
  };
}
