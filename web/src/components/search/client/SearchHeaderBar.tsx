'use client';

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { SearchField } from '../SearchField';
import { SearchAutocompleteDropdown } from './SearchAutocompleteDropdown';
import type { QuerySuggestion } from '../searchMatch';

interface SearchHeaderBarProps {
  input: string;
  isLanding: boolean;
  suggestOpen: boolean;
  suggestId: string;
  activeSug: number;
  optionId: (i: number) => string;
  rows: (QuerySuggestion & { submit?: boolean })[];
  chatHref: string;
  onInputChange: (v: string) => void;
  onSubmit: (term: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onFocus: () => void;
  onBlurContainer: (e: React.FocusEvent<HTMLDivElement>) => void;
  onSelectSuggestion: (term: string, category?: string) => void;
  onHoverSuggestion: (i: number) => void;
}

export function SearchHeaderBar({
  input,
  isLanding,
  suggestOpen,
  suggestId,
  activeSug,
  optionId,
  rows,
  chatHref,
  onInputChange,
  onSubmit,
  onKeyDown,
  onFocus,
  onBlurContainer,
  onSelectSuggestion,
  onHoverSuggestion,
}: SearchHeaderBarProps) {
  return (
    <div className="px-4 pt-4 sm:px-6 md:hidden">
      <div
        className="flex max-w-2xl items-center gap-1 lg:max-w-3xl"
        onBlur={onBlurContainer}
      >
        <div className="relative min-w-0 flex-1">
          <SearchField
            value={input}
            onChange={onInputChange}
            onSubmit={onSubmit}
            onKeyDown={onKeyDown}
            onFocus={onFocus}
            autoFocus={isLanding}
            listbox={{
              id: suggestId,
              expanded: suggestOpen,
              activeOptionId: activeSug >= 0 ? optionId(activeSug) : undefined,
            }}
          />
          {suggestOpen ? (
            <SearchAutocompleteDropdown
              id={suggestId}
              rows={rows}
              input={input}
              activeSug={activeSug}
              optionId={optionId}
              onSelectSuggestion={onSelectSuggestion}
              onHoverSuggestion={onHoverSuggestion}
            />
          ) : null}
        </div>
        {/* Photo-search entry */}
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
  );
}
