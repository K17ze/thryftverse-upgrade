'use client';

/**
 * Settings search — the Instagram/mobile grammar: a field at the top of
 * the settings index that swaps the sectioned hierarchy for a flat,
 * filtered list of real destinations. Every result activates something
 * true (route push, index sheet, or the theme toggle) — no dead rows.
 */

import { useMemo, useRef } from 'react';
import { Icon } from '@/components/ui/Icon';
import { SettingsRow } from './SettingsRow';
import { filterSettingsDestinations, type SettingsDestination } from './settingsDestinations';

interface SettingsSearchProps {
  query: string;
  onQueryChange: (q: string) => void;
  /** Fires for a picked destination — the view owns navigation, sheets
      and the theme toggle. */
  onActivate: (d: SettingsDestination) => void;
}

export function SettingsSearch({ query, onQueryChange, onActivate }: SettingsSearchProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const searching = query.trim().length > 0;
  const results = useMemo(() => filterSettingsDestinations(query), [query]);

  // Screen-reader mirror of the result state — the list itself isn't a
  // live region, so the count (and the no-match case) is announced here.
  const announcement = !searching
    ? ''
    : results.length === 0
      ? `No settings match “${query.trim()}”`
      : `${results.length} ${results.length === 1 ? 'setting matches' : 'settings match'}`;

  return (
    <>
      <div className="mb-6 px-4 sm:px-5" role="search">
        <label className="relative block">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted">
            <Icon name="search" size={18} />
          </span>
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && searching) {
                e.preventDefault();
                onQueryChange('');
              } else if (e.key === 'Enter' && results.length > 0) {
                // Flat-list grammar: Enter activates the top result.
                e.preventDefault();
                onActivate(results[0]);
              }
            }}
            placeholder="Search settings"
            aria-label="Search settings"
            autoComplete="off"
            className="h-10 w-full rounded-full border border-transparent bg-surface-alt pl-10 pr-10 text-body text-input-text placeholder:text-text-muted focus:border-border focus:bg-surface-raised focus:outline-none"
          />
          {searching ? (
            <button
              type="button"
              aria-label="Clear settings search"
              onClick={() => {
                onQueryChange('');
                inputRef.current?.focus();
              }}
              className="pressable absolute right-0 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center text-text-muted"
            >
              <Icon name="close" size={16} />
            </button>
          ) : null}
        </label>
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {searching ? (
        <div className="border-y border-border-subtle">
          {results.length === 0 ? (
            <p className="px-4 py-6 text-center text-body text-text-muted sm:px-5">
              No settings match &ldquo;{query.trim()}&rdquo;
            </p>
          ) : (
            <ul className="divide-y divide-border-subtle" aria-label="Settings search results">
              {results.map((d) => (
                <li key={d.id}>
                  <SettingsRow
                    icon={d.icon}
                    label={d.label}
                    subtitle={d.section}
                    onClick={() => onActivate(d)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </>
  );
}
