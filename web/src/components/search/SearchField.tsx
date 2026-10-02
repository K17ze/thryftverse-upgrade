'use client';

/**
 * SearchField — the canonical search input: rounded-xl field on surface,
 * leading search glyph, clear affordance, brand submit arrow.
 * One grammar everywhere search appears.
 */

import { useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import {
  RotatingSearchHint,
  useRotatingSearchHint,
} from './RotatingSearchHint';

interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (term: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
  /** Forwarded to the input — suggestion-list keyboard navigation. */
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  /** Forwarded to the input — reopens the suggestion list on re-focus. */
  onFocus?: () => void;
  /** Combobox semantics for an attached suggestion list. */
  listbox?: {
    id: string;
    expanded: boolean;
    activeOptionId?: string;
  };
}

export function SearchField({
  value,
  onChange,
  onSubmit,
  placeholder = 'Search items, brands, members',
  autoFocus,
  className = '',
  onKeyDown,
  onFocus,
  listbox,
}: SearchFieldProps) {
  const [focused, setFocused] = useState(false);
  const fieldRef = useRef<HTMLLabelElement>(null);
  // Idle-empty hint rotation — the placeholder cycles personal terms and
  // departments while the field rests. The aria-label stays the canonical
  // placeholder; the input's own placeholder is blanked while the overlay
  // is up so the two never double-render.
  const hint = useRotatingSearchHint({
    base: placeholder,
    idle: value === '' && !focused && listbox?.expanded !== true,
    containerRef: fieldRef,
  });
  return (
    <form
      role="search"
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(value.trim());
      }}
    >
      <label ref={fieldRef} className="relative block">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-text-muted">
          <Icon name="search" size={20} />
        </span>
        <input
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => {
            setFocused(true);
            onFocus?.();
          }}
          onBlur={() => setFocused(false)}
          role={listbox ? 'combobox' : undefined}
          aria-autocomplete={listbox ? 'list' : undefined}
          aria-expanded={listbox ? listbox.expanded : undefined}
          aria-controls={listbox ? listbox.id : undefined}
          aria-activedescendant={listbox?.activeOptionId}
          placeholder={hint.active ? '' : placeholder}
          aria-label={placeholder}
          autoFocus={autoFocus}
          enterKeyHint="search"
          className="h-12 w-full rounded-xl border border-border bg-surface pl-12 pr-[88px] text-body-emphasis text-input-text placeholder:text-text-muted focus:border-text-muted focus:outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        {/* Rotating idle hint — aligned to the input's text start (pl-12),
            clipped before the clear/submit affordances (pr-[88px]). */}
        {hint.active ? (
          <RotatingSearchHint
            text={hint.text}
            className="left-12 right-[88px] text-body-emphasis text-text-muted"
          />
        ) : null}
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
