'use client';

/**
 * SearchClient — /search surface. Reads ?q= via useSearchParams (parent
 * wraps in Suspense). Empty query renders the discovery landing; a query
 * renders RefinedResults with save-search wired to localStorage. Sort AND
 * facets live in the URL (?sort=, facet params) so share/back replay the
 * exact refined view; facet writes push history entries so Back undoes
 * the last refinement.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { RefinedResults } from '@/components/search/RefinedResults';
import { useToast } from '@/components/ui/Toast';
import { useListings } from '@/lib/hooks/queries';
import { useSavedSearches } from '@/lib/store/savedSearches';
import {
  countActiveFilters,
} from '@/components/filters/filterTypes';
import { DATA_MODE } from '@/lib/api/client';
import { MemberResults } from './MemberResults';
import { SearchField } from './SearchField';
import { SearchLanding } from './SearchLanding';
import { SearchRecovery } from './SearchRecovery';
import {
  matchListings,
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
  const saveSearch = useSavedSearches((s) => s.saveSearch);
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
  // Live mode keeps the server-side query and applies the same pass
  // over the returned page.
  const rawParam = DATA_MODE === 'live' ? q || undefined : undefined;
  const { data: fetched, isLoading, isError, refetch } = useListings(
    undefined,
    rawParam,
  );
  const match = useMemo(() => matchListings(fetched ?? [], q), [fetched, q]);
  const suggestion = match.suggestion;

  // "Did you mean" — when the raw query misses but a canonical
  // correction hits, show the corrected results without rewriting the
  // URL. The corrected page is only fetched when it will actually
  // display (zero hits) — a weak-set suggestion just links out.
  const correctionParam =
    DATA_MODE === 'live' && suggestion && match.listings.length === 0
      ? suggestion
      : rawParam;
  const { data: correctedFetched, isLoading: correctedLoading, refetch: refetchCorrected } =
    useListings(undefined, correctionParam);
  const relaxedMatch = useMemo(
    () =>
      suggestion && match.listings.length === 0
        ? matchListings(correctedFetched ?? [], suggestion)
        : { listings: [] as typeof match.listings, suggestion: null, scores: new Map<string, number>() },
    [correctedFetched, suggestion, match],
  );
  const relaxed = relaxedMatch.listings;

  const isRelaxed =
    suggestion !== null && match.listings.length === 0 && relaxed.length > 0;
  // A weak result set keeps its own results and offers the correction as
  // a link — Google grammar, no silent swap.
  const weakSuggestion =
    suggestion !== null && match.listings.length > 0 ? suggestion : null;
  const surfaceListings = isRelaxed ? relaxed : match.listings;
  const surfaceScores = isRelaxed ? relaxedMatch.scores : match.scores;
  const surfaceLoading =
    isLoading ||
    (suggestion !== null && match.listings.length === 0 && correctedLoading);
  // Both the raw and corrected passes came back empty — the recovery
  // surface replaces the results area entirely. A fetch failure is NOT
  // exhaustion: the results machine renders its error-retry state.
  const exhausted =
    q.length > 0 &&
    !isError &&
    !isLoading &&
    !correctedLoading &&
    match.listings.length === 0 &&
    relaxed.length === 0;

  const { recent, add, remove, clear } = useRecentSearches();

  // Autocomplete — a "Search for <input>" submit row leads (mobile grammar:
  // the dropdown always offers one actionable row while typing), then the
  // ranked suggestions sourced from the same honest vocabulary the landing
  // chips and the matcher publish (suggestQueries in searchMatch). When a
  // category facet is active, verified scoped rows ("X in Women") lead.
  const activeCategory = filters.categories[0] ?? null;
  const isLanding = !q && !hasFacets;
  const [suggestDismissed, setSuggestDismissed] = useState(false);
  const [fieldFocused, setFieldFocused] = useState(false);
  const [activeSug, setActiveSug] = useState(-1);
  const rows = useMemo<(QuerySuggestion & { submit?: boolean })[]>(() => {
    const term = input.trim();
    const base = suggestQueries(input, recent, 7, activeCategory);
    return term ? [{ term, icon: 'search' as const, submit: true }, ...base] : base;
  }, [input, recent, activeCategory]);
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
      <div className="px-4 pt-5 sm:px-6">
        <div
          className="flex max-w-2xl items-center gap-1"
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
            onSaveSearch={(f) => {
              saveSearch(q, f);
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
          onSelect={(term) => runSearch(term)}
          onClearRecent={clear}
          onRemoveRecent={remove}
        />
      )}
    </div>
  );
}
