'use client';

import { Icon } from '@/components/ui/Icon';

interface OrdersSearchBarProps {
  query: string;
  onChange: (value: string) => void;
  onClear: () => void;
}

export function OrdersSearchBar({ query, onChange, onClear }: OrdersSearchBarProps) {
  return (
    <div className="mt-4 flex h-11 items-center rounded-lg border border-border bg-input px-3.5 focus-within:border-text-muted lg:max-w-md">
      <Icon name="search" size={16} className="shrink-0 text-text-muted" />
      <input
        type="search"
        value={query}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search orders — item, order number, seller"
        aria-label="Search orders"
        className="ml-2 w-full bg-transparent text-body text-input-text placeholder:text-text-muted focus:outline-none [&::-webkit-search-cancel-button]:hidden"
      />
      {query ? (
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear search"
          className="pressable -mr-2 flex h-11 w-11 shrink-0 items-center justify-center text-text-muted hover:text-text-primary"
        >
          <Icon name="close" size={16} />
        </button>
      ) : null}
    </div>
  );
}
