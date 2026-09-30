'use client';

/**
 * SearchSuggestions — anchored dropdown for the header search field.
 * Empty query: recent searches + trending + popular brands.
 * With text: a "search for" row leads, then matching items and members,
 * with the remaining sections filtered live. Presentational — the
 * Header owns open/active state, keyboard nav and navigation.
 */

import Link from 'next/link';
import type React from 'react';
import { AppImage } from '@/components/ui/AppImage';
import { Avatar } from '@/components/ui/Avatar';
import { Chip } from '@/components/ui/Chip';
import { Icon, type AppIconName } from '@/components/ui/Icon';
import { formatCount, formatPrice } from '@/lib/utils/format';
import { useLocale } from '@/lib/i18n';
import {
  suggestionOptionId,
  type SuggestionKind,
  type SuggestionOption,
} from './useSuggestionOptions';

export {
  useSuggestionOptions,
  buildSuggestionOptions,
  suggestionOptionId,
  POPULAR_BRANDS,
  MAX_LISTING_RESULTS,
  MAX_MEMBER_RESULTS,
  MAX_RECENT,
  MAX_BRANDS,
  type SuggestionKind,
  type SuggestionOption,
} from './useSuggestionOptions';

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
              // The remove button sits OUTSIDE role="option" for keyboard a11y
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

      {/* Photo-driven discovery — pinned affordance */}
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
