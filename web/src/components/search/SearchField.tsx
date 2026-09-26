'use client';

/**
 * SearchField — the canonical search input: rounded-xl field on surface,
 * leading search glyph, clear affordance, brand submit arrow.
 * One grammar everywhere search appears.
 */

import { Icon } from '@/components/ui/Icon';

interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (term: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
}

export function SearchField({
  value,
  onChange,
  onSubmit,
  placeholder = 'Search items, brands, members',
  autoFocus,
  className = '',
}: SearchFieldProps) {
  return (
    <form
      role="search"
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(value.trim());
      }}
    >
      <label className="relative block">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-text-muted">
          <Icon name="search" size={20} />
        </span>
        <input
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          autoFocus={autoFocus}
          enterKeyHint="search"
          className="h-12 w-full rounded-xl border border-border bg-surface pl-12 pr-[88px] text-body-emphasis text-input-text placeholder:text-text-muted focus:border-text-muted focus:outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        {value ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => onChange('')}
            className="pressable absolute right-12 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-text-muted hover:text-text-primary"
          >
            <Icon name="close" size={18} />
          </button>
        ) : null}
        <button
          type="submit"
          aria-label="Search"
          className="pressable absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg bg-brand text-text-inverse"
        >
          <Icon name="forward" size={18} />
        </button>
      </label>
    </form>
  );
}
