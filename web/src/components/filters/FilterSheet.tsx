'use client';

/**
 * FilterSheet — facet editor for search/category/browse results.
 * Bottom sheet on mobile, dialog on desktop (Sheet primitive).
 * Applies live — footer CTA reports the preview count, mobile-style.
 */

import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Icon } from '@/components/ui/Icon';
import { CATEGORIES } from '@/lib/data/fixtures';
import type { ListingCondition } from '@/lib/contracts/domain';
import {
  CONDITION_OPTIONS,
  EMPTY_FILTERS,
  type ListingFilters,
} from './filterTypes';

interface FilterSheetProps {
  open: boolean;
  onClose: () => void;
  filters: ListingFilters;
  onChange: (next: ListingFilters) => void;
  /** Live count of listings matching the draft filters. */
  resultCount: number;
  /** Hide the category facet when the surface is already category-scoped. */
  hideCategory?: boolean;
  /** Quiet "Save search" action — only shown when provided. */
  onSaveSearch?: () => void;
}

const FIELD =
  'h-11 w-full rounded-lg border border-border bg-input px-3.5 text-body text-input-text placeholder:text-text-muted focus:border-text-muted focus:outline-none';

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-label font-semibold uppercase tracking-wide text-text-muted">
      {children}
    </h3>
  );
}

export function FilterSheet({
  open,
  onClose,
  filters,
  onChange,
  resultCount,
  hideCategory,
  onSaveSearch,
}: FilterSheetProps) {
  const toggleCondition = (c: ListingCondition) => {
    const on = filters.conditions.includes(c);
    onChange({
      ...filters,
      conditions: on
        ? filters.conditions.filter((x) => x !== c)
        : [...filters.conditions, c],
    });
  };

  const setPrice = (key: 'priceMin' | 'priceMax', raw: string) => {
    if (raw === '') {
      onChange({ ...filters, [key]: null });
      return;
    }
    const n = Number(raw);
    if (!Number.isNaN(n) && n >= 0) onChange({ ...filters, [key]: n });
  };

  return (
    <Sheet open={open} onClose={onClose} title="Filters" maxWidth={480}>
      <div className="flex min-h-full flex-col">
        <div className="flex-1 space-y-7 px-5 py-5">
          {onSaveSearch ? (
            <button
              type="button"
              onClick={onSaveSearch}
              className="pressable -mx-2 flex h-11 w-[calc(100%+16px)] items-center gap-3 rounded-md px-2 text-left text-body-emphasis font-medium text-text-primary hover:bg-surface-alt"
            >
              <Icon name="bookmark" size={18} className="text-text-secondary" />
              Save search
            </button>
          ) : null}

          <section>
            <SectionLabel>Condition</SectionLabel>
            <div className="mt-1">
              {CONDITION_OPTIONS.map((c) => {
                const on = filters.conditions.includes(c);
                return (
                  <button
                    key={c}
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => toggleCondition(c)}
                    className="pressable flex h-11 w-full items-center gap-3 text-left"
                  >
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border ${
                        on
                          ? 'border-brand bg-brand text-text-inverse'
                          : 'border-border bg-surface'
                      }`}
                    >
                      {on ? <Icon name="check" size={14} /> : null}
                    </span>
                    <span className="text-body text-text-primary">{c}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <SectionLabel>Price</SectionLabel>
            <div className="mt-2.5 flex items-center gap-2.5">
              <div className="relative flex-1">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-body text-text-muted">
                  £
                </span>
                <input
                  inputMode="decimal"
                  value={filters.priceMin ?? ''}
                  onChange={(e) => setPrice('priceMin', e.target.value)}
                  placeholder="Min"
                  aria-label="Minimum price"
                  className={`${FIELD} pl-7`}
                />
              </div>
              <span className="text-text-muted" aria-hidden>
                –
              </span>
              <div className="relative flex-1">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-body text-text-muted">
                  £
                </span>
                <input
                  inputMode="decimal"
                  value={filters.priceMax ?? ''}
                  onChange={(e) => setPrice('priceMax', e.target.value)}
                  placeholder="Max"
                  aria-label="Maximum price"
                  className={`${FIELD} pl-7`}
                />
              </div>
            </div>
          </section>

          {hideCategory ? null : (
            <section>
              <SectionLabel>Category</SectionLabel>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                <Chip
                  selected={filters.category === null}
                  onClick={() => onChange({ ...filters, category: null })}
                >
                  All
                </Chip>
                {CATEGORIES.map((cat) => (
                  <Chip
                    key={cat.slug}
                    selected={filters.category === cat.slug}
                    onClick={() =>
                      onChange({ ...filters, category: cat.slug })
                    }
                  >
                    {cat.name}
                  </Chip>
                ))}
              </div>
            </section>
          )}

          <section>
            <SectionLabel>Size</SectionLabel>
            <input
              value={filters.size}
              onChange={(e) => onChange({ ...filters, size: e.target.value })}
              placeholder="e.g. M or UK 9"
              aria-label="Size"
              className={`${FIELD} mt-2.5`}
            />
          </section>

          <section>
            <SectionLabel>Brand</SectionLabel>
            <input
              value={filters.brand}
              onChange={(e) => onChange({ ...filters, brand: e.target.value })}
              placeholder="e.g. Nike or Levi's"
              aria-label="Brand"
              className={`${FIELD} mt-2.5`}
            />
          </section>
        </div>

        <div className="sticky bottom-0 flex items-center gap-2 border-t border-border-subtle bg-surface px-5 py-4">
          <Button
            variant="quiet"
            size="sm"
            onClick={() => onChange(EMPTY_FILTERS)}
          >
            Clear all
          </Button>
          <Button variant="primary" size="md" fullWidth onClick={onClose}>
            <span className="tnum">Show {resultCount} results</span>
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
