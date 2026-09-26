'use client';

/**
 * useSortParam — sort order persisted in the URL (`?sort=`), so a sorted
 * result set survives share/back exactly like the query itself. Reads the
 * validated param, falls back to relevance, and writes with
 * router.replace (scroll preserved) so the grid re-sorts in place.
 */

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { SORT_OPTIONS, type SortKey } from '@/components/filters/filterTypes';

const SORT_VALUES = new Set<string>(SORT_OPTIONS.map((o) => o.value));

export function useSortParam(): [SortKey, (next: SortKey) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const raw = params.get('sort');
  const sort: SortKey = raw && SORT_VALUES.has(raw) ? (raw as SortKey) : 'relevance';

  const setSort = useCallback(
    (next: SortKey) => {
      const sp = new URLSearchParams(params.toString());
      if (next === 'relevance') sp.delete('sort');
      else sp.set('sort', next);
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, router, pathname],
  );

  return [sort, setSort];
}
