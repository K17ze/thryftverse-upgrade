'use client';

/**
 * InventorySearchField — title/brand search over the management shelf,
 * mobile InventorySearchBar parity. One quiet input; the × clears.
 */

import { Icon } from '@/components/ui/Icon';

interface InventorySearchFieldProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

export function InventorySearchField({
  value,
  onChange,
  placeholder = 'Search title or brand',
}: InventorySearchFieldProps) {
  return (
    <div className="relative">
      <Icon
        name="search"
        size={16}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label="Search your listings"
        className="h-11 w-full rounded-md border border-border bg-surface pl-9 pr-9 text-body text-text-primary placeholder:text-text-muted focus:border-text-muted focus:outline-none"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          className="pressable absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-text-muted hover:text-text-primary"
        >
          <Icon name="close" size={14} />
        </button>
      ) : null}
    </div>
  );
}
