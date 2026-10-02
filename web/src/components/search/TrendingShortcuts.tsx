'use client';

/**
 * TrendingShortcuts — the discovery query-shortcut block shared by the
 * /search landing and the Explore header. One labeled section: trending
 * queries as chips, then a quiet hairline and a single-line brand row at
 * text-link weight ("Popular brands — A · B · C"). Brands recede to a
 * scan-line so the section reads as one discovery unit, not two stacked
 * chip groups.
 */

import { Fragment } from 'react';
import { Chip } from '@/components/ui/Chip';

interface TrendingShortcutsProps {
  terms: string[];
  brands: string[];
  onSelect: (term: string) => void;
  className?: string;
}

export function TrendingShortcuts({
  terms,
  brands,
  onSelect,
  className = '',
}: TrendingShortcutsProps) {
  if (terms.length === 0 && brands.length === 0) return null;
  return (
    <section className={className}>
      <h2 className="text-label text-text-muted">Trending</h2>
      {terms.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {terms.map((term) => (
            <Chip key={term} icon="trending" onClick={() => onSelect(term)}>
              {term}
            </Chip>
          ))}
        </div>
      ) : null}
      {brands.length > 0 ? (
        <div
          className={`flex items-center border-t border-border-subtle ${
            terms.length > 0 ? 'mt-3.5 pt-2' : 'mt-2'
          }`}
        >
          <span className="shrink-0 py-1.5 pr-2 text-caption font-medium text-text-muted">
            Popular brands
          </span>
          {/* Scrollable single line — every brand stays reachable on
              narrow viewports instead of truncating. */}
          <div className="no-scrollbar flex min-w-0 flex-1 items-center overflow-x-auto">
            {brands.map((brand, i) => (
              <Fragment key={brand}>
                {i > 0 ? (
                  <span aria-hidden className="shrink-0 px-0.5 text-text-muted">
                    ·
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => onSelect(brand)}
                  className="pressable relative inline-flex h-9 shrink-0 items-center px-1.5 text-caption font-medium text-text-secondary after:absolute after:-inset-y-1 after:content-[''] hover:text-text-primary"
                >
                  {brand}
                </button>
              </Fragment>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
