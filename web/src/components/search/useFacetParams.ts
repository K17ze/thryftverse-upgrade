'use client';

/**
 * useFacetParams — facet state persisted in the URL, so a refined result
 * set is shareable and back/forward replays it exactly (eBay/Vinted
 * grammar: the filter state IS the address). Reads through
 * filtersFromParams (the same codec saved searches and the conv-search
 * hand-off write); writes merge onto the current params so q/sort/sub
 * survive untouched.
 *
 * Discrete changes (toggling a facet value, clearing a chip) push a
 * history entry — Back undoes the last refinement. Continuous edits
 * (price digits landing live in the sheet) replace instead, so typing a
 * price doesn't mint one history entry per keystroke.
 */

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  filtersFromParams,
  writeFilterParams,
  type ListingFilters,
} from '@/components/filters/filterTypes';

/** Do two filter sets differ only on the price bounds? */
function onlyPriceChanged(a: ListingFilters, b: ListingFilters): boolean {
  return (
    (a.priceMin !== b.priceMin || a.priceMax !== b.priceMax) &&
    a.conditions.join() === b.conditions.join() &&
    a.categories.join() === b.categories.join() &&
    a.brands.join() === b.brands.join() &&
    a.sizes.join() === b.sizes.join() &&
    a.colours.join() === b.colours.join() &&
    a.includeSold === b.includeSold
  );
}

export function useFacetParams(): [
  ListingFilters,
  (next: ListingFilters) => void,
] {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const filters = useMemo(() => filtersFromParams(params), [params]);

  const setFilters = useCallback(
    (next: ListingFilters) => {
      // Merge onto the freshest params — window.location wins over the
      // React snapshot so rapid consecutive toggles can't clobber an
      // in-flight write.
      const sp = new URLSearchParams(
        typeof window !== 'undefined'
          ? window.location.search
          : params.toString(),
      );
      writeFilterParams(sp, next);
      const qs = sp.toString();
      const href = qs ? `${pathname}?${qs}` : pathname;
      if (onlyPriceChanged(filtersFromParams(params), next)) {
        router.replace(href, { scroll: false });
      } else {
        router.push(href, { scroll: false });
      }
    },
    [params, router, pathname],
  );

  return [filters, setFilters];
}
