'use client';

/**
 * ClosetFilterSheet — the full facet set for one seller's closet. Applies
 * live; the footer CTA reports the preview count (mobile-style). Facets
 * only render when they offer a real choice (≥2 stocked options) — a
 * one-option facet is trivia, not a filter.
 */

import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Icon } from '@/components/ui/Icon';
import type { ListingCondition } from '@/lib/contracts/domain';
import {
  EMPTY_CLOSET_FILTERS,
  facetHasChoice,
  type ClosetFacets,
  type ClosetFilters,
} from './closetFilters';

interface ClosetFilterSheetProps {
  open: boolean;
  onClose: () => void;
  filters: ClosetFilters;
  onChange: (next: ClosetFilters) => void;
  facets: ClosetFacets;
  /** Live count of listings matching the current filters. */
  resultCount: number;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-label font-semibold uppercase tracking-wide text-text-muted">
      {children}
    </h3>
  );
}

function FacetCount({ count }: { count: number }) {
  return <span className="tnum text-meta opacity-60">{count}</span>;
}

export function ClosetFilterSheet({
  open,
  onClose,
  filters,
  onChange,
  facets,
  resultCount,
}: ClosetFilterSheetProps) {
  const toggleSize = (size: string) => {
    const on = filters.sizes.includes(size);
    onChange({
      ...filters,
      sizes: on ? filters.sizes.filter((s) => s !== size) : [...filters.sizes, size],
    });
  };

  const toggleCondition = (c: ListingCondition) => {
    const on = filters.conditions.includes(c);
    onChange({
      ...filters,
      conditions: on
        ? filters.conditions.filter((x) => x !== c)
        : [...filters.conditions, c],
    });
  };

  return (
    <Sheet open={open} onClose={onClose} title="Filters" maxWidth={480}>
      <div className="flex min-h-full flex-col">
        <div className="flex-1 space-y-7 px-5 py-5">
          {facetHasChoice(facets.brands) ? (
            <section>
              <SectionLabel>Brand</SectionLabel>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {facets.brands.map((b) => (
                  <Chip
                    key={b.value}
                    selected={filters.brand === b.value}
                    onClick={() =>
                      onChange({
                        ...filters,
                        brand: filters.brand === b.value ? null : b.value,
                      })
                    }
                  >
                    {b.label}
                    <FacetCount count={b.count} />
                  </Chip>
                ))}
              </div>
            </section>
          ) : null}

          {facetHasChoice(facets.sizes) ? (
            <section>
              <SectionLabel>Size</SectionLabel>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {facets.sizes.map((s) => (
                  <Chip
                    key={s.value}
                    selected={filters.sizes.includes(s.value)}
                    onClick={() => toggleSize(s.value)}
                  >
                    {s.label}
                    <FacetCount count={s.count} />
                  </Chip>
                ))}
              </div>
            </section>
          ) : null}

          {facetHasChoice(facets.conditions) ? (
            <section>
              <SectionLabel>Condition</SectionLabel>
              <div className="mt-1">
                {facets.conditions.map((c) => {
                  const on = filters.conditions.includes(c.value);
                  return (
                    <button
                      key={c.value}
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      onClick={() => toggleCondition(c.value)}
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
                      <span className="text-body text-text-primary">{c.label}</span>
                      <span className="tnum ml-auto text-meta text-text-muted">
                        {c.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}

          {facetHasChoice(facets.categories) ? (
            <section>
              <SectionLabel>Category</SectionLabel>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {facets.categories.map((cat) => (
                  <Chip
                    key={cat.value}
                    selected={filters.category === cat.value}
                    onClick={() =>
                      onChange({
                        ...filters,
                        category:
                          filters.category === cat.value ? null : cat.value,
                      })
                    }
                  >
                    {cat.label}
                    <FacetCount count={cat.count} />
                  </Chip>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <div className="sticky bottom-0 flex items-center gap-2 border-t border-border-subtle bg-surface px-5 py-4">
          <Button
            variant="quiet"
            size="sm"
            onClick={() => onChange({ ...EMPTY_CLOSET_FILTERS, query: filters.query })}
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
