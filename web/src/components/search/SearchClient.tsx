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
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Icon } from '@/components/ui/Icon';
import { RefinedResults } from '@/components/search/RefinedResults';
import { useToast } from '@/components/ui/Toast';
import { useListings } from '@/lib/hooks/queries';
import type { Listing } from '@/lib/contracts/domain';
import { useLoadMoreSentinel } from '@/lib/hooks/useLoadMoreSentinel';
import { savedSearchKey, useSavedSearches } from '@/lib/store/savedSearches';
import {
  countActiveFilters,
} from '@/components/filters/filterTypes';
import { DATA_MODE } from '@/lib/api/client';
import { fetchAutocompleteSuggestions } from '@/lib/api/services/search';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import { useSignupWall } from '@/components/auth/SignupWall';
import { MemberResults } from './MemberResults';
import { SearchField } from './SearchField';
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

/** Split a suggestion into before/match/after around the typed fragment —
 *  the matched portion renders emphasised (SearchAutocomplete grammar). */
function splitMatch(
  term: string,
  query: string,
): { before: string; match: string; after: string } {
  const q = query.trim().toLowerCase();
  if (!q) return { before: '', match: '', after: term };
  const idx = term.toLowerCase().indexOf(q);
  if (idx < 0) return { before: '', match: '', after: term };
  return {
    before: term.slice(0, idx),
    match: term.slice(idx, idx + q.length),
    after: term.slice(idx + q.length),
  };
}

export function SearchClient() {
  const router = useRouter();
  const params = useSearchParams();
  const q = (params.get('q') ?? '').trim();
  const toast = useToast();
  const { requireAuth } = useSignupWall();
  const saveSearch = useSavedSearches((s) => s.saveSearch);
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
  // Live mode is server-side end to end: the query, facets and sort go
  // on the wire, the returned order IS the rank order, and the sentinel
  // below walks the synthesised nextCursor over the catalogue.
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
  // Live rows surface un-re-matched — the server is the matcher. The
  // local pass still drives the correction heuristic and fixture mode.
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
  // Gated with `enabled` so a populated result set never pays for it.
  const shouldCorrect =
    DATA_MODE === 'live' && suggestion !== null && surfaceEmpty;
  const correctionParam = shouldCorrect ? (suggestion ?? undefined) : rawParam;
  const { data: correctedFetched, isLoading: correctedLoading, refetch: refetchCorrected } =
    useListings(undefined, correctionParam, {
      // Fixture mode shares the main query's full-catalogue cache (same
      // key — same limit — already loaded); the gate only matters live.
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
    // Live surfaces the corrected server's rows directly — the same
    // "server is the matcher" rule as the primary pass.
    if (DATA_MODE === 'live') return { ...none, listings: correctedItems };
    return matchListings(correctedItems, suggestion);
  }, [correctedFetched, suggestion, surfaceEmpty]);
  const relaxed = relaxedMatch.listings;

  const isRelaxed =
    suggestion !== null && surfaceEmpty && relaxed.length > 0;
  // A weak result set keeps its own results and offers the correction as
  // a link — Google grammar, no silent swap.
  const weakSuggestion =
    suggestion !== null && !surfaceEmpty ? suggestion : null;
  const surfaceListings = isRelaxed ? relaxed : primaryListings;
  const surfaceScores = isRelaxed ? relaxedMatch.scores : match.scores;
  const surfaceLoading =
    isLoading || (suggestion !== null && surfaceEmpty && correctedLoading);
  // Both the raw and corrected passes came back empty — the recovery
  // surface replaces the results area entirely. A fetch failure is NOT
  // exhaustion: the results machine renders its error-retry state.
  const exhausted =
    q.length > 0 &&
    !isError &&
    !isLoading &&
    !correctedLoading &&
    surfaceEmpty &&
    relaxed.length === 0;

  // Infinite scroll — the tail sentinel walks the server's nextCursor
  // while it exists (feed pattern, shared hook). Relaxed "did you mean"
  // results are a single suggestion pass — they don't paginate.
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

  // Autocomplete — a "Search for <input>" submit row leads (mobile grammar:
  // the dropdown always offers one actionable row while typing), then the
  // ranked suggestions sourced from the same honest vocabulary the landing
  // chips and the matcher publish (suggestQueries in searchMatch). When a
  // category facet is active, verified scoped rows ("X in Women") lead.
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

  // Autocomplete — live mode is backend-first (GET /search/autocomplete,
  // mobile parity): debounced so a request fires once per typing pause,
  // abortable via the react-query signal, and gated on the native
  // 2-char minimum. A failed request falls back to the local vocabulary
  // pools (suggestQueries) rather than going dark.
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
  // A saved-search write that failed server-side surfaces once — the
  // store records the failure domain; we toast and consume it so a
  // guest's rolled-back save never reads as a success.
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

  // Focus-gated — a URL-seeded query must not open the list on mount.
  const suggestOpen = fieldFocused && !suggestDismissed && rows.length > 0;
  const SUGGEST_ID = 'search-suggestions';
  const optionId = (i: number) => `${SUGGEST_ID}-opt-${i}`;

  // Keyboard-highlighted option stays inside the dropdown's scroll port.
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
    // Full APG listbox travel: arrows cycle, Home/End jump the ends,
    // PageUp/PageDown step a page of options at a time.
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
      <div className="px-4 pt-4 sm:px-6 md:hidden">
        <div
          className="flex max-w-2xl items-center gap-1 lg:max-w-3xl"
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              setFieldFocused(false);
              setSuggestDismissed(true);
              setActiveSug(-1);
            }
          }}
        >
          <div className="relative min-w-0 flex-1">
            <SearchField
              value={input}
              onChange={(v) => {
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
              autoFocus={isLanding}
              listbox={{
                id: SUGGEST_ID,
                expanded: suggestOpen,
                activeOptionId:
                  activeSug >= 0 ? optionId(activeSug) : undefined,
              }}
            />
            {suggestOpen ? (
              <ul
                id={SUGGEST_ID}
                role="listbox"
                aria-label="Search suggestions"
                className="no-scrollbar absolute inset-x-0 top-full z-dropdown mt-1.5 max-h-[min(60vh,368px)] overflow-y-auto rounded-xl border border-border-subtle bg-surface-elevated py-1 shadow-floating"
              >
                {rows.map((s, i) => {
                  const { before, match, after } = s.submit
                    ? { before: '', match: '', after: '' }
                    : splitMatch(s.term, input);
                  return (
                    <li
                      key={
                        s.submit
                          ? `submit:${s.term.toLowerCase()}`
                          : `${s.term.toLowerCase()}|${s.category?.slug ?? ''}`
                      }
                      role="none"
                    >
                      <button
                        type="button"
                        role="option"
                        id={optionId(i)}
                        aria-selected={i === activeSug}
                        // Keep input focus while the row is pressed — blur
                        // dismissal belongs to leaving the field region.
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => runSearch(s.term, s.category?.slug)}
                        onMouseEnter={() => setActiveSug(i)}
                        className={`flex h-11 w-full items-center gap-3 px-4 text-left ${
                          i === activeSug ? 'bg-surface-alt' : ''
                        }`}
                      >
                        <Icon
                          name={s.icon}
                          size={16}
                          className="shrink-0 text-text-muted"
                        />
                        {s.submit ? (
                          <span className="min-w-0 flex-1 truncate text-body text-text-primary">
                            Search for “{s.term}”
                          </span>
                        ) : (
                          <span className="min-w-0 flex-1 truncate text-body text-text-primary">
                            {before}
                            {match ? (
                              <span className="font-semibold text-brand">
                                {match}
                              </span>
                            ) : null}
                            {after}
                            {s.category ? (
                              <span className="text-text-muted">
                                {' '}
                                in {s.category.name}
                              </span>
                            ) : null}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
          {/* Photo-search entry — same affordance the mobile search bar
              carries trailing (AppSearchBar onCameraPress). */}
          <Link
            href="/search/visual"
            aria-label="Search by photo"
            className="pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-text-secondary hover:bg-brand-subtle hover:text-text-primary"
          >
            <Icon name="camera" size={20} />
          </Link>
        </div>
        <Link
          href={chatHref}
          className="pressable mt-1.5 inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-caption font-medium text-text-muted hover:text-text-primary"
        >
          <Icon name="chat" size={13} />
          Refine in chat
        </Link>
      </div>

      {q || hasFacets ? (
        exhausted ? (
          // Members can still match when listings don't — the recovery
          // surface isn't a dead end.
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
        <div className="pt-4">
          <RefinedResults
            // New query = new surface context (sheet/skeleton reset);
            // facets themselves come from the URL, not the mount.
            key={q.toLowerCase()}
            listings={surfaceListings}
            isLoading={surfaceLoading}
            isError={isError}
            stateDomain="search"
            onRetry={() => {
              void refetch();
              void refetchCorrected();
            }}
            filters={filters}
            onFiltersChange={setFilters}
            relevanceScores={surfaceScores}
            serverOrdered={DATA_MODE === 'live'}
            totalCount={
              isRelaxed
                ? (correctedFetched?.total ?? null)
                : (fetched?.total ?? null)
            }
            query={q}
            sort={sort}
            onSortChange={setSort}
            preamble={q ? <MemberResults query={q} /> : undefined}
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
              ) : weakSuggestion ? (
                <p className="text-caption text-text-muted">
                  Showing results for “{q}” — did you mean{' '}
                  <Link
                    href={`/search?q=${encodeURIComponent(weakSuggestion)}`}
                    className="font-medium text-text-secondary underline underline-offset-2 hover:text-text-primary"
                  >
                    {weakSuggestion}
                  </Link>
                  ?
                </p>
              ) : undefined
            }
            heading={(n) => (
              <h1 className="break-words text-item-title font-semibold text-text-primary">
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
            // Save is gated on a real query (the backend's own q ≥ 2
            // floor). Guests hit the auth wall — no optimistic insert,
            // no success toast for a write that can't sync. A repeat
            // save of the same normalized intent is an honest "already
            // saved" rather than a duplicate.
            onSaveSearch={
              q.trim().length >= 2
                ? (f) => {
                    if (!requireAuth('save_item')) return;
                    const duplicate = useSavedSearches
                      .getState()
                      .searches.find(
                        (s) =>
                          savedSearchKey(s.query, s.filters) ===
                          savedSearchKey(q, f),
                      );
                    if (duplicate) {
                      toast.show('Already saved — find it under Saved', 'info');
                      return;
                    }
                    saveSearch(q, f);
                    toast.show(
                      'Search saved — alerts on, find it under Saved',
                      'success',
                    );
                  }
                : undefined
            }
            emptyTitle={q ? `No results for “${q}”` : 'No matches with these filters'}
            emptySubtitle={
              q
                ? 'Check the spelling or try a more general term.'
                : 'Try widening the price range or removing a filter.'
            }
            emptyActionLabel="Clear search"
            onEmptyAction={() => router.push('/search')}
          />
          {/* Tail sentinel — fetches the next page while the server has
              a nextCursor; suppressed on the relaxed-correction surface. */}
          {hasNextPage && !isRelaxed ? (
            <>
              <div ref={resultsSentinelRef} className="h-px" aria-hidden />
              <div className="flex flex-col items-center gap-2 px-4 py-8">
                {isFetchingNextPage ? (
                  <>
                    <Icon name="refresh" size={18} className="animate-spin text-text-muted" />
                    <p className="sr-only" role="status">
                      Loading more results
                    </p>
                  </>
                ) : null}
                {isFetchNextPageError ? (
                  // A failed page fetch must not silently stall the
                  // sentinel — same retry grammar as /explore.
                  <button
                    type="button"
                    onClick={() => void fetchNextPage()}
                    className="pressable rounded-md px-3 py-2 text-caption font-semibold text-brand"
                  >
                    Couldn&apos;t load more — try again
                  </button>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
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
