'use client';

/**
 * SearchSuggestions — anchored dropdown for the header search field.
 * Empty query: recent searches + trending + popular brands.
 * With text: a "search for" row leads, then matching items and members,
 * with the remaining sections filtered live. Presentational — the
 * Header owns open/active state, keyboard nav and navigation.
 */

import Link from 'next/link';
import { useDeferredValue, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AppImage } from '@/components/ui/AppImage';
import { Avatar } from '@/components/ui/Avatar';
import { Chip } from '@/components/ui/Chip';
import { Icon, type AppIconName } from '@/components/ui/Icon';
import type { Listing, User } from '@/lib/contracts/domain';
import { LISTINGS, USERS } from '@/lib/data/fixtures';
import { DATA_MODE } from '@/lib/api/client';
import { searchListings } from '@/lib/api/services/listings';
import { fetchAutocompleteSuggestions } from '@/lib/api/services/search';
import { searchUsers } from '@/lib/api/services/users';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import {
  rankBrands,
  useTrendingListings,
  useTrendingSearches,
} from '@/lib/hooks/search-queries';
import { formatCount, formatPrice } from '@/lib/utils/format';
import { TRENDING_SEARCHES } from '@/components/search/taxonomy';
import { useLocale } from '@/lib/i18n';

const MAX_LISTING_RESULTS = 5;
const MAX_MEMBER_RESULTS = 3;
const MAX_RECENT = 6;
const MAX_BRANDS = 8;

/** Top brands by fixture occurrence — same derivation as SearchLanding. */
const POPULAR_BRANDS = (() => {
  const counts = new Map<string, number>();
  for (const l of LISTINGS) {
    if (l.brand) counts.set(l.brand, (counts.get(l.brand) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([brand]) => brand);
})();

export type SuggestionKind =
  | 'search'
  | 'suggestion'
  | 'listing'
  | 'member'
  | 'recent'
  | 'trending'
  | 'brand';

export interface SuggestionOption {
  id: string;
  kind: SuggestionKind;
  term: string;
  listing?: Listing;
  user?: User;
  /** Set when selection navigates to a route instead of running a query. */
  href?: string;
}

export function suggestionOptionId(listboxId: string, index: number): string {
  return `${listboxId}-option-${index}`;
}

/**
 * Flat, ordered option list — keyboard-nav order matches visual order:
 * "search for" → matching items → members → recent → trending → brands.
 */
export function buildSuggestionOptions(
  query: string,
  recent: string[],
): SuggestionOption[] {
  const q = query.trim();
  const needle = q.toLowerCase();
  const matches = (s: string) => !needle || s.toLowerCase().includes(needle);
  const options: SuggestionOption[] = [];

  if (q) {
    options.push({ id: 'search-query', kind: 'search', term: q });
    let found = 0;
    for (const l of LISTINGS) {
      if (found >= MAX_LISTING_RESULTS) break;
      if (
        l.title.toLowerCase().includes(needle) ||
        (l.brand ?? '').toLowerCase().includes(needle)
      ) {
        options.push({
          id: `listing-${l.id}`,
          kind: 'listing',
          term: l.title,
          listing: l,
        });
        found += 1;
      }
    }
    let members = 0;
    for (const u of USERS) {
      if (members >= MAX_MEMBER_RESULTS) break;
      if (u.username.toLowerCase().includes(needle)) {
        options.push({
          id: `member-${u.id}`,
          kind: 'member',
          term: u.username,
          user: u,
          href: `/u/${u.username}`,
        });
        members += 1;
      }
    }
  }

  for (const term of recent.filter(matches).slice(0, MAX_RECENT)) {
    options.push({ id: `recent-${term}`, kind: 'recent', term });
  }
  for (const term of TRENDING_SEARCHES.filter(matches)) {
    options.push({ id: `trending-${term}`, kind: 'trending', term });
  }
  for (const brand of POPULAR_BRANDS.filter(matches).slice(0, MAX_BRANDS)) {
    options.push({ id: `brand-${brand}`, kind: 'brand', term: brand });
  }

  return options;
}

const LIVE = DATA_MODE === 'live';

/**
 * Suggestion options against the active data source. Fixture mode runs
 * the pure fixture matcher; live mode is backend-first — query text
 * suggestions come from GET /search/autocomplete (mobile parity), item
 * rows from the real catalogue (GET /listings?q=) and member rows from
 * the real directory (GET /users/search), with trending queries/brands
 * from the shared trending hooks. No fixture row can appear in live
 * mode: the autocomplete payload carries no listing/member objects, and
 * every rendered object row is a real fetch result.
 */
export function useSuggestionOptions(query: string, recent: string[]): SuggestionOption[] {
  // Deferred + debounced — keystrokes trail the input by one commit and
  // a typing pause, so the request fires once per pause (and a
  // superseded fetch aborts via the react-query signal), not per char.
  const deferredQ = useDeferredValue(query.trim());
  const debouncedQ = useDebouncedValue(deferredQ, 220);
  // Backend gates: autocomplete/listings want q ≥ 1 but mobile holds the
  // stricter 2-char client gate; members/search also needs auth.
  const usable = debouncedQ.length >= 2;
  const autocompleteQuery = useQuery({
    queryKey: ['search-suggest', 'autocomplete', debouncedQ],
    queryFn: ({ signal }) => fetchAutocompleteSuggestions(debouncedQ, 8, signal),
    enabled: LIVE && usable,
    staleTime: 30_000,
  });
  const listingsQuery = useQuery({
    queryKey: ['search-suggest', 'listings', debouncedQ],
    queryFn: ({ signal }) => searchListings({ q: debouncedQ, limit: MAX_LISTING_RESULTS }, signal),
    enabled: LIVE && usable,
    staleTime: 30_000,
  });
  const membersQuery = useQuery({
    queryKey: ['search-suggest', 'members', debouncedQ],
    queryFn: ({ signal }) => searchUsers(debouncedQ, signal),
    enabled: LIVE && usable,
    staleTime: 30_000,
  });
  const trending = useTrendingListings(24);
  const trendingSearches = useTrendingSearches();

  return useMemo<SuggestionOption[]>(() => {
    if (!LIVE) return buildSuggestionOptions(query, recent);

    const q = query.trim();
    const needle = q.toLowerCase();
    const matches = (s: string) => !needle || s.toLowerCase().includes(needle);
    const options: SuggestionOption[] = [];
    // Text kinds share a term-key so "nike" can't repeat across the
    // suggestion / trending / brand sections.
    const seenText = new Set<string>();
    const pushText = (option: SuggestionOption) => {
      const key = option.term.toLowerCase();
      if (seenText.has(key)) return;
      seenText.add(key);
      options.push(option);
    };

    if (q) {
      options.push({ id: 'search-query', kind: 'search', term: q });
      if (autocompleteQuery.isError) {
        // Request failed — the local vocabulary pools answer instead of
        // going dark (mobile parity). Text-only: the autocomplete
        // response carries no listing/member objects either way.
        for (const term of TRENDING_SEARCHES.filter(matches)) {
          pushText({ id: `suggestion-${term}`, kind: 'suggestion', term });
        }
        for (const brand of POPULAR_BRANDS.filter(matches)) {
          pushText({ id: `suggestion-${brand}`, kind: 'suggestion', term: brand });
        }
      } else {
        for (const s of autocompleteQuery.data?.suggestions ?? []) {
          pushText({ id: `suggestion-${s.text}`, kind: 'suggestion', term: s.text });
        }
      }
      for (const l of (listingsQuery.data?.items ?? []).slice(0, MAX_LISTING_RESULTS)) {
        options.push({ id: `listing-${l.id}`, kind: 'listing', term: l.title, listing: l });
      }
      for (const u of (membersQuery.data ?? []).slice(0, MAX_MEMBER_RESULTS)) {
        options.push({
          id: `member-${u.id}`,
          kind: 'member',
          term: u.username,
          user: u,
          href: `/u/${u.username}`,
        });
      }
    }

    for (const term of recent.filter(matches).slice(0, MAX_RECENT)) {
      options.push({ id: `recent-${term}`, kind: 'recent', term });
    }
    for (const term of trendingSearches.terms.filter(matches)) {
      pushText({ id: `trending-${term}`, kind: 'trending', term });
    }
    for (const brand of rankBrands(trending.listings, 10).filter(matches).slice(0, MAX_BRANDS)) {
      pushText({ id: `brand-${brand}`, kind: 'brand', term: brand });
    }
    return options;
  }, [
    query,
    recent,
    autocompleteQuery.data,
    autocompleteQuery.isError,
    listingsQuery.data,
    membersQuery.data,
    trending.listings,
    trendingSearches.terms,
  ]);
}

interface SearchSuggestionsProps {
  listboxId: string;
  options: SuggestionOption[];
  activeIndex: number;
  onActiveIndex: (index: number) => void;
  onSelect: (option: SuggestionOption) => void;
  onRemoveRecent: (term: string) => void;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-4 pb-1 pt-3 text-label text-text-muted">
      {children}
    </p>
  );
}

export function SearchSuggestions({
  listboxId,
  options,
  activeIndex,
  onActiveIndex,
  onSelect,
  onRemoveRecent,
}: SearchSuggestionsProps) {
  const { t } = useLocale();
  const indexed = options.map((option, index) => ({ option, index }));
  const byKind = (kind: SuggestionKind) =>
    indexed.filter(({ option }) => option.kind === kind);

  const searchRows = byKind('search');
  const suggestionRows = byKind('suggestion');
  const listingRows = byKind('listing');
  const memberRows = byKind('member');
  const recentRows = byKind('recent');
  const trendingRows = byKind('trending');
  const brandRows = byKind('brand');

  const optionProps = (index: number, option: SuggestionOption) => ({
    id: suggestionOptionId(listboxId, index),
    role: 'option' as const,
    'aria-selected': index === activeIndex,
    onMouseDown: (e: React.MouseEvent) => {
      // Select before the input blurs; keep focus in the field.
      e.preventDefault();
      onSelect(option);
    },
    onMouseEnter: () => onActiveIndex(index),
  });

  const textRow = (
    option: SuggestionOption,
    index: number,
    icon: AppIconName,
    label: React.ReactNode,
  ) => (
    <div
      key={option.id}
      {...optionProps(index, option)}
      className={`flex h-11 cursor-pointer items-center gap-3 px-4 text-left ${
        index === activeIndex ? 'bg-row' : ''
      }`}
    >
      <Icon name={icon} size={18} className="shrink-0 text-text-muted" />
      <span className="clamp-1 min-w-0 flex-1 text-body text-text-primary">
        {label}
      </span>
    </div>
  );

  return (
    <div className="absolute left-0 right-0 top-full z-dropdown mt-2 overflow-hidden rounded-lg border border-border bg-surface-elevated shadow-subtle">
      {/* ARIA APG: a listbox's children must be options or groups of
          options — the pinned navigation link lives outside it. */}
      <div
        id={listboxId}
        role="listbox"
        aria-label={t('chrome.search.suggestions')}
        className="max-h-[420px] overflow-y-auto py-1.5"
      >
      {searchRows.map(({ option, index }) =>
        textRow(
          option,
          index,
          'search',
          <>
            Search for{' '}
            <span className="font-semibold">“{option.term}”</span>
          </>,
        ),
      )}

      {suggestionRows.map(({ option, index }) =>
        textRow(option, index, 'search', option.term),
      )}

      {listingRows.length > 0 ? (
        <div role="group" aria-label={t('chrome.search.matchingItems')}>
          <SectionLabel>{t('common.misc.items')}</SectionLabel>
          {listingRows.map(({ option, index }) => (
            <div
              key={option.id}
              {...optionProps(index, option)}
              className={`flex cursor-pointer items-center gap-3 px-4 py-2 ${
                index === activeIndex ? 'bg-row' : ''
              }`}
            >
              <AppImage
                src={option.listing?.images[0]}
                alt=""
                fill
                sizes="40px"
                className="h-10 w-10 shrink-0 rounded-md"
              />
              <span className="min-w-0 flex-1">
                <span className="clamp-1 block text-body text-text-primary">
                  {option.listing?.title ?? option.term}
                </span>
                <span className="tnum block text-caption text-text-secondary">
                  {formatPrice(option.listing?.price)}
                </span>
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {memberRows.length > 0 ? (
        <div role="group" aria-label={t('chrome.search.members')}>
          <SectionLabel>{t('chrome.search.members')}</SectionLabel>
          {memberRows.map(({ option, index }) => (
            <div
              key={option.id}
              {...optionProps(index, option)}
              className={`flex h-11 cursor-pointer items-center gap-3 px-4 text-left ${
                index === activeIndex ? 'bg-row' : ''
              }`}
            >
              <Avatar
                src={option.user?.avatar}
                name={option.user?.username}
                size={26}
              />
              <span className="flex min-w-0 flex-1 items-center gap-1.5">
                <span className="clamp-1 text-body text-text-primary">
                  {option.user?.username ?? option.term}
                </span>
                {option.user?.isVerified ? (
                  <Icon
                    name="verified"
                    size={14}
                    className="shrink-0 text-commerce-trust"
                  />
                ) : null}
              </span>
              <span className="tnum shrink-0 text-caption text-text-muted">
                {formatCount(option.user?.followers)} followers
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {recentRows.length > 0 ? (
        <div role="group" aria-label={t('chrome.search.recent')}>
          <SectionLabel>{t('chrome.search.recent')}</SectionLabel>
          {recentRows.map(({ option, index }) => (
            // The remove button must sit OUTSIDE role="option" — a
            // focusable descendant inside an option is presentational
            // per ARIA and strands keyboard users. It's absolutely
            // anchored over the row's trailing edge instead.
            <div key={option.id} role="presentation" className="relative">
              {textRow(option, index, 'clock', option.term)}
              <button
                type="button"
                aria-label={t('chrome.search.removeRecent', { term: option.term })}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onRemoveRecent(option.term);
                }}
                className="pressable absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-text-muted after:absolute after:-inset-2 after:content-[''] hover:text-text-primary"
              >
                <Icon name="close" size={14} />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {trendingRows.length > 0 ? (
        <div role="group" aria-label={t('chrome.search.trending')}>
          <SectionLabel>{t('chrome.search.trending')}</SectionLabel>
          {trendingRows.map(({ option, index }) =>
            textRow(option, index, 'trending', option.term),
          )}
        </div>
      ) : null}

      {brandRows.length > 0 ? (
        <div role="group" aria-label={t('chrome.search.popularBrands')}>
          <SectionLabel>{t('chrome.search.popularBrands')}</SectionLabel>
          <div className="flex flex-wrap gap-1.5 px-4 pb-1 pt-1">
            {brandRows.map(({ option, index }) => (
              <Chip
                key={option.id}
                {...optionProps(index, option)}
                className={`h-8 px-3 text-caption ${
                  index === activeIndex
                    ? 'bg-surface-raised ring-1 ring-inset ring-text-muted'
                    : ''
                }`}
              >
                {option.term}
              </Chip>
            ))}
          </div>
        </div>
      ) : null}
      </div>

      {/* Photo-driven discovery — pinned affordance, outside the combobox
          option list since it navigates rather than submits a term. */}
      <div className="border-t border-border-subtle">
        <Link
          href="/search/visual"
          onMouseDown={(e) => e.preventDefault()}
          className="flex h-11 cursor-pointer items-center gap-3 px-4 text-left hover:bg-row"
        >
          <Icon name="camera" size={18} className="shrink-0 text-text-muted" />
          <span className="clamp-1 min-w-0 flex-1 text-body text-text-primary">
            {t('chrome.links.searchByPhoto')}
          </span>
          <Icon name="forward" size={14} className="shrink-0 text-text-muted" />
        </Link>
      </div>
    </div>
  );
}
