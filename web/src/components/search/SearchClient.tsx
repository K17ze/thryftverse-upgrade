'use client';

/**
 * SearchClient — /search surface. Reads ?q= via useSearchParams (parent
 * wraps in Suspense). Empty query renders the discovery landing; a query
 * renders RefinedResults with save-search wired to localStorage. Sort AND
 * facets live in the URL (?sort=, facet params) so share/back replay the
 * exact refined view; facet writes push history entries so Back undoes
 * the last refinement.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useToast } from '@/components/ui/Toast';
import { useListings } from '@/lib/hooks/queries';
import type { Listing } from '@/lib/contracts/domain';
import { useLoadMoreSentinel } from '@/lib/hooks/useLoadMoreSentinel';
import { useSavedSearches } from '@/lib/store/savedSearches';
import { countActiveFilters } from '@/components/filters/filterTypes';
import { DATA_MODE } from '@/lib/api/client';
import { fetchAutocompleteSuggestions } from '@/lib/api/services/search';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import { MemberResults } from './MemberResults';
import { SearchLanding } from './SearchLanding';
import { SearchRecovery } from './SearchRecovery';
import { categoryLabel } from './categoryDirectoryStore';
import {
  matchListings,
  normalizeTerm,
  suggestCorrection,
  suggestQueries,
  type QuerySuggestion,
} from './searchMatch';
import { useRecentSearches } from './searchHistory';
import { useFacetParams } from './useFacetParams';
import { useSortParam } from './useSortParam';
import { SearchHeaderBar } from './client/SearchHeaderBar';
import { SearchResultsContainer } from './client/SearchResultsContainer';

export function SearchClient() {
  const router = useRouter();
  const params = useSearchParams();
  const q = (params.get('q') ?? '').trim();
  const toast = useToast();
  const savedSyncError = useSavedSearches((s) => s.syncError);
  const [sort, setSort] = useSortParam();
  // Facets are URL state — reads, share and back/forward all hit the same
  // params the rail/sheet write through setFilters.
  const [filters, setFilters] = useFacetParams();
  const hasFacets = countActiveFilters(filters) > 0;

  const [input, setInput] = useState(q);
  useEffect(() => setInput(q), [q]);

  // Refine-in-chat entry — hands the live query + facets to /search/chat.
  const chatHref = params.toString() ? `/search/chat?${params.toString()}` : '/search/chat';

  // Fixture mode fetches the full catalogue once — tolerant matching
  // (normalize + per-token + typo correction) lives in searchMatch.
  // Live mode is server-side end to end.
  const rawParam = DATA_MODE === 'live' ? q || undefined : undefined;
  const {
    data: fetched,
    isLoading,
    isError,
    refetch,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
  } = useListings(undefined, rawParam, { limit: 24, filters, sort });
  const serverResults = useMemo(() => fetched?.items ?? [], [fetched]);
  const match = useMemo(
    () => matchListings(serverResults, q),
    [serverResults, q],
  );
  // Live rows surface un-re-matched — the server is the matcher.
  const primaryListings = DATA_MODE === 'live' ? serverResults : match.listings;
  const surfaceEmpty = primaryListings.length === 0;
  const suggestion =
    DATA_MODE === 'live'
      ? surfaceEmpty || serverResults.length <= 3
        ? suggestCorrection(q)
        : null
      : match.suggestion;

  // "Did you mean" — the correction query only exists when it could
  // display: live mode, a canonical suggestion, and a zero-hit raw pass.
  const shouldCorrect =
    DATA_MODE === 'live' && suggestion !== null && surfaceEmpty;
  const correctionParam = shouldCorrect ? (suggestion ?? undefined) : rawParam;
  const { data: correctedFetched, isLoading: correctedLoading, refetch: refetchCorrected } =
    useListings(undefined, correctionParam, {
      enabled: DATA_MODE !== 'live' || shouldCorrect,
      limit: 24,
      filters,
      sort,
    });
  const relaxedMatch = useMemo(() => {
    const none = {
      listings: [] as Listing[],
      suggestion: null,
      scores: new Map<string, number>(),
    };
    if (!suggestion || !surfaceEmpty) return none;
    const correctedItems = correctedFetched?.items ?? [];
    if (DATA_MODE === 'live') return { ...none, listings: correctedItems };
    return matchListings(correctedItems, suggestion);
  }, [correctedFetched, suggestion, surfaceEmpty]);
  const relaxed = relaxedMatch.listings;

  const isRelaxed =
    suggestion !== null && surfaceEmpty && relaxed.length > 0;
  const weakSuggestion =
    suggestion !== null && !surfaceEmpty ? suggestion : null;
  const surfaceListings = isRelaxed ? relaxed : primaryListings;
  const surfaceScores = isRelaxed ? relaxedMatch.scores : match.scores;
  const surfaceLoading =
    isLoading || (suggestion !== null && surfaceEmpty && correctedLoading);
  const exhausted =
    q.length > 0 &&
    !isError &&
    !isLoading &&
    !correctedLoading &&
    surfaceEmpty &&
    relaxed.length === 0;

  // Infinite scroll — the tail sentinel walks the server's nextCursor
  const loadMoreResults = useCallback(() => void fetchNextPage(), [fetchNextPage]);
  const resultsSentinelRef = useLoadMoreSentinel(
    DATA_MODE === 'live' &&
      !isRelaxed &&
      hasNextPage === true &&
      !isFetchingNextPage &&
      !isFetchNextPageError,
    loadMoreResults,
  );

  const { recent, add, remove, clear } = useRecentSearches();

  // Autocomplete suggestions
  const activeCategory = filters.categories[0] ?? null;
  const activeCategoryScope = useMemo(() => {
    if (!activeCategory) return undefined;
    const name = categoryLabel(activeCategory);
    return { slug: activeCategory, name };
  }, [activeCategory]);
  const isLanding = !q && !hasFacets;
  const [suggestDismissed, setSuggestDismissed] = useState(false);
  const [fieldFocused, setFieldFocused] = useState(false);
  const [activeSug, setActiveSug] = useState(-1);

  const debouncedInput = useDebouncedValue(input.trim(), 220);
  const autocomplete = useQuery({
    queryKey: ['search', 'autocomplete', 'results-field', debouncedInput],
    queryFn: ({ signal }) =>
      fetchAutocompleteSuggestions(debouncedInput, 8, signal),
    enabled:
      DATA_MODE === 'live' && fieldFocused && debouncedInput.length >= 2,
    staleTime: 30_000,
    retry: false,
  });

  const rows = useMemo<(QuerySuggestion & { submit?: boolean })[]>(() => {
    const term = input.trim();
    let base: QuerySuggestion[];
    if (DATA_MODE === 'live') {
      if (!term) {
        base = [];
      } else if (autocomplete.isError) {
        base = suggestQueries(input, recent, 7, activeCategory);
      } else {
        const norm = normalizeTerm(term);
        const seen = new Set<string>([norm]);
        base = [];
        for (const s of autocomplete.data?.suggestions ?? []) {
          const key = normalizeTerm(s.text);
          if (!key || seen.has(key)) continue;
          seen.add(key);
          base.push({ term: s.text, icon: 'search', category: activeCategoryScope });
        }
        for (const r of recent) {
          const key = normalizeTerm(r);
          if (!key.startsWith(norm) || seen.has(key)) continue;
          seen.add(key);
          base.push({ term: r, icon: 'clock' });
        }
        base = base.slice(0, 7);
      }
    } else {
      base = suggestQueries(input, recent, 7, activeCategory);
    }
    return term ? [{ term, icon: 'search' as const, submit: true }, ...base] : base;
  }, [
    input,
    recent,
    activeCategory,
    activeCategoryScope,
    autocomplete.data,
    autocomplete.isError,
  ]);

  useEffect(() => {
    if (!savedSyncError) return;
    toast.show(
      savedSyncError === 'save'
        ? "Couldn't save the search — it didn't sync. Try again."
        : savedSyncError === 'remove'
          ? "Couldn't remove the saved search — try again."
          : "Couldn't update alerts — try again.",
      'error',
    );
    useSavedSearches.setState({ syncError: null });
  }, [savedSyncError, toast]);

  const suggestOpen = fieldFocused && !suggestDismissed && rows.length > 0;
  const SUGGEST_ID = 'search-suggestions';
  const optionId = (i: number) => `${SUGGEST_ID}-opt-${i}`;

  useEffect(() => {
    if (!suggestOpen || activeSug < 0) return;
    document
      .getElementById(optionId(activeSug))
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeSug, suggestOpen]);

  const onFieldKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setSuggestDismissed(true);
      setActiveSug(-1);
      return;
    }
    if (!suggestOpen) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveSug((i) => (i + 1) % rows.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveSug((i) => (i <= 0 ? rows.length - 1 : i - 1));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActiveSug(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActiveSug(rows.length - 1);
    } else if (e.key === 'PageDown') {
      e.preventDefault();
      setActiveSug((i) => Math.min(rows.length - 1, (i < 0 ? -1 : i) + 10));
    } else if (e.key === 'PageUp') {
      e.preventDefault();
      setActiveSug((i) => Math.max(0, (i < 0 ? rows.length : i) - 10));
    } else if (e.key === 'Enter' && activeSug >= 0) {
      e.preventDefault();
      const row = rows[activeSug];
      runSearch(row.term, row.category?.slug);
    }
  };

  const runSearch = (term: string, category?: string) => {
    const t = term.trim();
    if (!t) return;
    add(t);
    const sameTerm = t.toLowerCase() === q.toLowerCase();
    const sameScope = (category ?? null) === activeCategory;
    if (sameTerm && sameScope) {
      setInput(t);
      return;
    }
    const sp = new URLSearchParams({ q: t });
    if (category) sp.set('category', category);
    router.push(`/search?${sp.toString()}`);
  };

  return (
    <div className="mx-auto max-w-[1440px]">
      <SearchHeaderBar
        input={input}
        isLanding={isLanding}
        suggestOpen={suggestOpen}
        suggestId={SUGGEST_ID}
        activeSug={activeSug}
        optionId={optionId}
        rows={rows}
        chatHref={chatHref}
        onInputChange={(v) => {
          setInput(v);
          setActiveSug(-1);
          setSuggestDismissed(false);
        }}
        onSubmit={(term) => runSearch(term)}
        onKeyDown={onFieldKeyDown}
        onFocus={() => {
          setFieldFocused(true);
          setSuggestDismissed(false);
          setActiveSug(-1);
        }}
        onBlurContainer={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setFieldFocused(false);
            setSuggestDismissed(true);
            setActiveSug(-1);
          }
        }}
        onSelectSuggestion={(term, category) => runSearch(term, category)}
        onHoverSuggestion={setActiveSug}
      />

      {q || hasFacets ? (
        exhausted ? (
          <div className="pt-4">
            <MemberResults query={q} />
            <SearchRecovery
              query={q}
              suggestion={suggestion}
              hasActiveFilters={hasFacets}
              onSelect={(term) => runSearch(term)}
            />
          </div>
        ) : (
          <SearchResultsContainer
            query={q}
            listings={surfaceListings}
            isLoading={surfaceLoading}
            isError={isError}
            filters={filters}
            onFiltersChange={setFilters}
            relevanceScores={surfaceScores}
            totalCount={
              isRelaxed
                ? (correctedFetched?.total ?? null)
                : (fetched?.total ?? null)
            }
            sort={sort}
            onSortChange={setSort}
            isRelaxed={isRelaxed}
            suggestion={suggestion}
            weakSuggestion={weakSuggestion}
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            isFetchNextPageError={isFetchNextPageError}
            onFetchNextPage={() => void fetchNextPage()}
            sentinelRef={resultsSentinelRef}
            onRetry={() => {
              void refetch();
              void refetchCorrected();
            }}
          />
        )
      ) : (
        <SearchLanding
          recent={recent}
          onSelect={(term) => runSearch(term)}
          onClearRecent={clear}
          onRemoveRecent={remove}
        />
      )}
    </div>
  );
}
