'use client';

/**
 * SearchSuggestions — anchored dropdown for the header search field.
 * Empty query: recent searches + trending + popular brands.
 * With text: a "search for" row leads, then matching items and members,
 * with the remaining sections filtered live. Presentational — the
 * Header owns open/active state, keyboard nav and navigation.
 */

import Link from 'next/link';
import { AppImage } from '@/components/ui/AppImage';
import { Avatar } from '@/components/ui/Avatar';
import { Chip } from '@/components/ui/Chip';
import { Icon, type AppIconName } from '@/components/ui/Icon';
import type { Listing, User } from '@/lib/contracts/domain';
import { LISTINGS, USERS } from '@/lib/data/fixtures';
import { formatCount, formatPrice } from '@/lib/utils/format';
import { TRENDING_SEARCHES } from '@/components/search/taxonomy';

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
    <p className="px-4 pb-1 pt-3 text-label font-semibold uppercase tracking-wide text-text-muted">
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
  const indexed = options.map((option, index) => ({ option, index }));
  const byKind = (kind: SuggestionKind) =>
    indexed.filter(({ option }) => option.kind === kind);

  const searchRows = byKind('search');
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
    trailing?: React.ReactNode,
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
      {trailing}
    </div>
  );

  return (
    <div
      id={listboxId}
      role="listbox"
      aria-label="Search suggestions"
      className="absolute left-0 right-0 top-full z-dropdown mt-2 max-h-[420px] overflow-y-auto rounded-lg border border-border bg-surface-elevated py-1.5 shadow-subtle"
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

      {listingRows.length > 0 ? (
        <div role="group" aria-label="Matching items">
          <SectionLabel>Items</SectionLabel>
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
        <div role="group" aria-label="Members">
          <SectionLabel>Members</SectionLabel>
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
        <div role="group" aria-label="Recent searches">
          <SectionLabel>Recent</SectionLabel>
          {recentRows.map(({ option, index }) =>
            textRow(
              option,
              index,
              'clock',
              option.term,
              <button
                type="button"
                aria-label={`Remove “${option.term}” from recent searches`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onRemoveRecent(option.term);
                }}
                className="pressable -mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-muted hover:text-text-primary"
              >
                <Icon name="close" size={14} />
              </button>,
            ),
          )}
        </div>
      ) : null}

      {trendingRows.length > 0 ? (
        <div role="group" aria-label="Trending searches">
          <SectionLabel>Trending</SectionLabel>
          {trendingRows.map(({ option, index }) =>
            textRow(option, index, 'trending', option.term),
          )}
        </div>
      ) : null}

      {brandRows.length > 0 ? (
        <div role="group" aria-label="Popular brands">
          <SectionLabel>Popular brands</SectionLabel>
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

      {/* Photo-driven discovery — pinned affordance, outside the combobox
          option list since it navigates rather than submits a term. */}
      <div className="mt-1 border-t border-border-subtle pt-1">
        <Link
          href="/search/visual"
          onMouseDown={(e) => e.preventDefault()}
          className="flex h-11 cursor-pointer items-center gap-3 px-4 text-left hover:bg-row"
        >
          <Icon name="camera" size={18} className="shrink-0 text-text-muted" />
          <span className="clamp-1 min-w-0 flex-1 text-body text-text-primary">
            Search by photo
          </span>
          <Icon name="forward" size={14} className="shrink-0 text-text-muted" />
        </Link>
      </div>
    </div>
  );
}
