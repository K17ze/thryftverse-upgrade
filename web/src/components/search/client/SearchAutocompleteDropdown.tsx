'use client';

import { Icon } from '@/components/ui/Icon';
import type { QuerySuggestion } from '../searchMatch';

/** Split a suggestion into before/match/after around the typed fragment —
 *  the matched portion renders emphasised (SearchAutocomplete grammar). */
export function splitMatch(
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

interface SearchAutocompleteDropdownProps {
  id: string;
  rows: (QuerySuggestion & { submit?: boolean })[];
  input: string;
  activeSug: number;
  optionId: (i: number) => string;
  onSelectSuggestion: (term: string, category?: string) => void;
  onHoverSuggestion: (i: number) => void;
}

export function SearchAutocompleteDropdown({
  id,
  rows,
  input,
  activeSug,
  optionId,
  onSelectSuggestion,
  onHoverSuggestion,
}: SearchAutocompleteDropdownProps) {
  return (
    <ul
      id={id}
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
              onClick={() => onSelectSuggestion(s.term, s.category?.slug)}
              onMouseEnter={() => onHoverSuggestion(i)}
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
  );
}
