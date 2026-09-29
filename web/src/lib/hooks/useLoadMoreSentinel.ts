'use client';

/**
 * Load-more sentinel — the feed's IntersectionObserver pagination
 * pattern extracted for reuse: attach the returned ref to a tail
 * element; `onLoadMore` fires while it intersects (with a pre-flight
 * margin so the next page arrives before the fold). `enabled` gates the
 * observer entirely — no nextCursor, mid-fetch, or a failed append
 * (manual retry only) all mean "don't auto-fire".
 */

import { useEffect, useRef } from 'react';

export function useLoadMoreSentinel(
  enabled: boolean,
  onLoadMore: (() => void) | undefined,
) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!enabled || !onLoadMore) return;
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) onLoadMore();
      },
      { rootMargin: '600px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [enabled, onLoadMore]);

  return sentinelRef;
}
