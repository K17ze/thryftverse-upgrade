'use client';

/**
 * SearchClient — /search surface. Reads ?q= via useSearchParams (parent
 * wraps in Suspense). Empty query renders the discovery landing; a query
 * renders RefinedResults with save-search wired to localStorage. Sort
 * lives in the URL (?sort=) so share/back replay it; facets stay in
 * surface state and the surface only remounts when the query or a
 * replayed facet changes.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { RefinedResults } from '@/components/search/RefinedResults';
import { useToast } from '@/components/ui/Toast';
import { useListings } from '@/lib/hooks/queries';
import { useSavedSearches } from '@/lib/store/savedSearches';
import type { ListingCondition } from '@/lib/contracts/domain';
import {
  CONDITION_OPTIONS,
  EMPTY_FILTERS,
  type ListingFilters,
} from '@/components/filters/filterTypes';
import { DATA_MODE } from '@/lib/api/client';
import { SearchField } from './SearchField';
import { SearchLanding } from './SearchLanding';
import { SearchRecovery } from './SearchRecovery';
import { matchListings } from './searchMatch';
import { useRecentSearches } from './searchHistory';
import { useSortParam } from './useSortParam';

/** Parse ?category=&condition=a|b&size=&brand=&min=&max= into filters —
 *  the same keys searchHref() writes, so saved searches replay exactly. */
function filtersFromParams(
  params: Pick<URLSearchParams, 'get'>,
): ListingFilters | null {
  const rawConditions = params.get('condition');
  const conditions = (rawConditions?.split('|') ?? []).filter((c): c is ListingCondition =>
    (CONDITION_OPTIONS as string[]).includes(c),
  );
  const min = params.get('min');
  const max = params.get('max');
  const f: ListingFilters = {
    ...EMPTY_FILTERS,
    conditions,
    category: params.get('category'),
    brand: params.get('brand') ?? '',
    size: params.get('size') ?? '',
    priceMin: min != null && !Number.isNaN(Number(min)) ? Number(min) : null,
    priceMax: max != null && !Number.isNaN(Number(max)) ? Number(max) : null,
  };
  const hasAny =
    conditions.length > 0 ||
    f.category ||
    f.brand ||
    f.size ||
    f.priceMin != null ||
    f.priceMax != null;
  return hasAny ? f : null;
}

/** Facet params that seed the surface — sort is deliberately excluded so
 *  re-sorting never remounts (and never resets) the active refinements. */
const SEED_PARAM_KEYS = ['category', 'condition', 'size', 'brand', 'min', 'max'];

export function SearchClient() {
  const router = useRouter();
  const params = useSearchParams();
  const q = (params.get('q') ?? '').trim();
  const toast = useToast();
  const saveSearch = useSavedSearches((s) => s.saveSearch);
  const [sort, setSort] = useSortParam();

  const [input, setInput] = useState(q);
  useEffect(() => setInput(q), [q]);

  const initialFilters = useMemo(() => filtersFromParams(params), [params]);
  // Refine-in-chat entry — hands the live query + facets to /search/chat.
  const chatHref = params.toString() ? `/search/chat?${params.toString()}` : '/search/chat';
  // Remount the surface when the query or a replayed facet changes — the
  // seed only applies on mount.
  const surfaceKey = useMemo(() => {
    const seed = SEED_PARAM_KEYS.map((k) => {
      const v = params.get(k);
      return v ? `${k}=${v}` : null;
    })
      .filter(Boolean)
      .join('&');
    return `${q.toLowerCase()}|${seed}`;
  }, [q, params]);

  // Fixture mode fetches the full catalogue once — tolerant matching
  // (normalize + per-token + typo correction) lives in searchMatch.
  // Live mode keeps the server-side query and applies the same pass
  // over the returned page.
  const rawParam = DATA_MODE === 'live' ? q || undefined : undefined;
  const { data: fetched, isLoading } = useListings(undefined, rawParam);
  const match = useMemo(() => matchListings(fetched ?? [], q), [fetched, q]);
  const suggestion = match.suggestion;

  // "Did you mean" — when the raw query misses but a canonical
  // correction hits, show the corrected results without rewriting the
  // URL. Same query key when there's no correction → no extra fetch.
  const correctionParam =
    DATA_MODE === 'live' && suggestion ? suggestion : rawParam;
  const { data: correctedFetched, isLoading: correctedLoading } =
    useListings(undefined, correctionParam);
  const relaxed = useMemo(
    () =>
      suggestion ? matchListings(correctedFetched ?? [], suggestion).listings : [],
    [correctedFetched, suggestion],
  );

  const isRelaxed =
    suggestion !== null && match.listings.length === 0 && relaxed.length > 0;
  const surfaceListings = isRelaxed ? relaxed : match.listings;
  const surfaceLoading =
    isLoading ||
    (suggestion !== null && match.listings.length === 0 && correctedLoading);
  // Both the raw and corrected passes came back empty — the recovery
  // surface replaces the results area entirely.
  const exhausted =
    q.length > 0 &&
    !isLoading &&
    !correctedLoading &&
    match.listings.length === 0 &&
    relaxed.length === 0;

  const { recent, add, remove, clear } = useRecentSearches();

  const runSearch = (term: string) => {
    const t = term.trim();
    if (!t) return;
    add(t);
    if (t.toLowerCase() === q.toLowerCase()) {
      setInput(t);
      return;
    }
    router.push(`/search?q=${encodeURIComponent(t)}`);
  };

  return (
    <div className="mx-auto max-w-[1600px]">
      <div className="px-4 pt-5 sm:px-6">
        <SearchField
          value={input}
          onChange={setInput}
          onSubmit={runSearch}
          className="max-w-2xl"
        />
        <Link
          href={chatHref}
          className="pressable mt-1.5 inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-caption font-medium text-text-muted hover:text-text-primary"
        >
          <Icon name="chat" size={13} />
          Refine in chat
        </Link>
      </div>

      {q || initialFilters ? (
        exhausted ? (
          <SearchRecovery
            query={q}
            hasActiveFilters={initialFilters !== null}
            onSelect={runSearch}
          />
        ) : (
        <div className="pt-4">
          <RefinedResults
            key={surfaceKey}
            listings={surfaceListings}
            isLoading={surfaceLoading}
            sort={sort}
            onSortChange={setSort}
            initialFilters={initialFilters ?? undefined}
            notice={
              isRelaxed && suggestion ? (
                <p className="text-caption text-text-muted">
                  No results for “{q}” — showing{' '}
                  <Link
                    href={`/search?q=${encodeURIComponent(suggestion)}`}
                    className="font-medium text-text-secondary underline underline-offset-2 hover:text-text-primary"
                  >
                    {suggestion}
                  </Link>
                </p>
              ) : undefined
            }
            heading={(n) => (
              <h1 className="text-item-title font-semibold text-text-primary">
                {n === null ? (
                  q ? (
                    <>Results for “{q}”</>
                  ) : (
                    <>Results</>
                  )
                ) : (
                  <>
                    <span className="tnum">{n.toLocaleString('en-GB')}</span>{' '}
                    result{n === 1 ? '' : 's'}
                    {q ? (
                      <> for “{isRelaxed && suggestion ? suggestion : q}”</>
                    ) : null}
                  </>
                )}
              </h1>
            )}
            onSaveSearch={(filters) => {
              saveSearch(q, filters);
              toast.show('Search saved — alerts on, find it under Saved', 'success');
            }}
            emptyTitle={q ? `No results for “${q}”` : 'No matches with these filters'}
            emptySubtitle={
              q
                ? 'Check the spelling or try a more general term.'
                : 'Try widening the price range or removing a filter.'
            }
            emptyActionLabel="Clear search"
            onEmptyAction={() => router.push('/search')}
          />
        </div>
        )
      ) : (
        <SearchLanding
          recent={recent}
          onSelect={runSearch}
          onClearRecent={clear}
          onRemoveRecent={remove}
        />
      )}
    </div>
  );
}
