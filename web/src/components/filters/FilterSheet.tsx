'use client';

/**
 * FilterSheet — the sub-lg facet editor for search/category/browse
 * results (desktop refines through the rail instead; the surface gates
 * this sheet off at lg+). Bottom sheet on mobile via the Sheet primitive.
 * Applies live — footer CTA reports the preview count, mobile-style.
 * Facet options carry the same honest counts the rail computes: what
 * the grid would show after toggling, never a fabricated tally.
 * Brand/size/category/colour are multi-select (union semantics), and the
 * colour facet ships the vocabulary swatch on each chip.
 */

import { useMemo, useState } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Icon } from '@/components/ui/Icon';
import { CATEGORIES } from '@/lib/data/fixtures';
import type { Listing, ListingCondition } from '@/lib/contracts/domain';
import {
  categoryFacets,
  colourFacets,
  conditionFacets,
  optionsWithSelected,
  soldFacetCount,
  type FacetOption,
} from '@/components/search/facetCounts';
import {
  CONDITION_OPTIONS,
  EMPTY_FILTERS,
  type ListingFilters,
} from './filterTypes';

interface FilterSheetProps {
  open: boolean;
  onClose: () => void;
  /** The current result set — facet counts derive from this, unfiltered. */
  listings: Listing[];
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

/** Chip-list cap before the "Show more" affordance — rail uses six rows,
 *  the wrap layout fits more without scroll. */
const MAX_CHIP_OPTIONS = 8;

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-label text-text-muted">
      {children}
    </h3>
  );
}

/** Toggle one value in/out of a multi-select list (case-insensitive). */
function toggleValue(list: string[], value: string): string[] {
  const v = value.toLowerCase();
  return list.some((x) => x.toLowerCase() === v)
    ? list.filter((x) => x.toLowerCase() !== v)
    : [...list, value];
}

/** Counted multi-select chips for a facet — the sheet counterpart of a
 *  rail checkbox group; same options, same honest counts. */
function FacetChips({
  options,
  selected,
  onToggle,
}: {
  options: FacetOption[];
  selected: string[];
  onToggle: (o: FacetOption) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? options : options.slice(0, MAX_CHIP_OPTIONS);
  const hidden = options.length - visible.length;

  return (
    <div className="mt-2.5">
      <div className="flex flex-wrap gap-1.5">
        {visible.map((o) => (
          <Chip
            key={o.value}
            selected={selected.some((s) => s.toLowerCase() === o.value)}
            onClick={() => onToggle(o)}
          >
            {o.swatch ? (
              <span
                aria-hidden
                className="h-3 w-3 rounded-full border border-border-subtle"
                style={{ backgroundColor: o.swatch }}
              />
            ) : null}
            {o.label}
            <span className="tnum opacity-60">{o.count}</span>
          </Chip>
        ))}
      </div>
      {options.length > MAX_CHIP_OPTIONS ? (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          className="pressable relative mt-2 flex h-8 items-center gap-1 rounded-md px-1 text-caption font-semibold text-text-secondary after:absolute after:-inset-y-1.5 after:content-[''] hover:text-text-primary"
        >
          {expanded ? 'Show less' : `Show ${hidden} more`}
          <Icon name={expanded ? 'chevronUp' : 'chevronDown'} size={13} />
        </button>
      ) : null}
    </div>
  );
}

/** Checkbox row grammar shared by Condition and the availability toggle. */
function CheckRow({
  label,
  checked,
  count,
  onToggle,
}: {
  label: string;
  checked: boolean;
  count?: number;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onToggle}
      className="pressable flex h-11 w-full items-center gap-3 text-left"
    >
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border ${
          checked
            ? 'border-brand bg-brand text-text-inverse'
            : 'border-border bg-surface'
        }`}
      >
        {checked ? <Icon name="check" size={14} /> : null}
      </span>
      <span className="min-w-0 flex-1 text-body text-text-primary">
        {label}
      </span>
      {count != null ? (
        <span className="tnum shrink-0 text-caption text-text-muted">
          {count}
        </span>
      ) : null}
    </button>
  );
}

export function FilterSheet({
  open,
  onClose,
  listings,
  filters,
  onChange,
  resultCount,
  hideCategory,
  onSaveSearch,
}: FilterSheetProps) {
  const categoryNames = useMemo(
    () => new Map(CATEGORIES.map((c) => [c.slug, c.name])),
    [],
  );

  // Condition counts — all five options stay listed (they're OR'd, so a
  // zero count just means this condition adds nothing right now); the
  // tallies come from facetCounts with the condition dim relaxed.
  const conditionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const o of conditionFacets(listings, filters)) {
      counts.set(o.value, o.count);
    }
    return counts;
  }, [listings, filters]);

  // Category options — zero-count departments disappear like the rail's,
  // except selected ones: they stay visible (honest 0) so they can be
  // unchecked here.
  const categoryOptions = useMemo<FacetOption[]>(() => {
    const options = categoryFacets(listings, filters, categoryNames);
    for (const slug of filters.categories) {
      if (!options.some((o) => o.value === slug.toLowerCase())) {
        options.push({
          value: slug.toLowerCase(),
          label: categoryNames.get(slug.toLowerCase()) ?? slug,
          count: 0,
        });
      }
    }
    return options;
  }, [listings, filters, categoryNames]);

  // Brand/size/colour lists — the same counted options the desktop rail
  // renders (facetCounts), with active URL-seeded values appended when
  // they aren't among them.
  const brandOptions = useMemo(
    () => optionsWithSelected(listings, filters, 'brand'),
    [listings, filters],
  );
  const sizeOptions = useMemo(
    () => optionsWithSelected(listings, filters, 'size'),
    [listings, filters],
  );
  const colourOptions = useMemo(
    () => colourFacets(listings, filters),
    [listings, filters],
  );
  const soldCount = useMemo(
    () => soldFacetCount(listings, filters),
    [listings, filters],
  );

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

          {/* Section order mirrors the desktop rail: Category → Brand →
              Size → Colour → Condition → Show → Price — one grammar on
              both facet surfaces. */}
          {hideCategory ? null : (
            <section>
              <SectionLabel>Category</SectionLabel>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                <Chip
                  selected={filters.categories.length === 0}
                  onClick={() => onChange({ ...filters, categories: [] })}
                >
                  All
                </Chip>
                {categoryOptions.map((o) => (
                  <Chip
                    key={o.value}
                    selected={filters.categories.some(
                      (c) => c.toLowerCase() === o.value,
                    )}
                    onClick={() =>
                      onChange({
                        ...filters,
                        categories: toggleValue(filters.categories, o.value),
                      })
                    }
                  >
                    {o.label}
                    <span className="tnum opacity-60">{o.count}</span>
                  </Chip>
                ))}
              </div>
            </section>
          )}

          {brandOptions.length > 0 ? (
            <section>
              <SectionLabel>Brand</SectionLabel>
              <FacetChips
                options={brandOptions}
                selected={filters.brands}
                onToggle={(o) =>
                  onChange({
                    ...filters,
                    brands: toggleValue(filters.brands, o.label),
                  })
                }
              />
            </section>
          ) : null}

          {sizeOptions.length > 0 ? (
            <section>
              <SectionLabel>Size</SectionLabel>
              <FacetChips
                options={sizeOptions}
                selected={filters.sizes}
                onToggle={(o) =>
                  onChange({
                    ...filters,
                    sizes: toggleValue(filters.sizes, o.label),
                  })
                }
              />
            </section>
          ) : null}

          {colourOptions.length > 0 ? (
            <section>
              <SectionLabel>Colour</SectionLabel>
              <FacetChips
                options={colourOptions}
                selected={filters.colours}
                onToggle={(o) =>
                  onChange({
                    ...filters,
                    colours: toggleValue(filters.colours, o.value),
                  })
                }
              />
            </section>
          ) : null}

          <section>
            <SectionLabel>Condition</SectionLabel>
            <div className="mt-1">
              {CONDITION_OPTIONS.map((c) => (
                <CheckRow
                  key={c}
                  label={c}
                  checked={filters.conditions.includes(c)}
                  count={conditionCounts.get(c) ?? 0}
                  onToggle={() => toggleCondition(c)}
                />
              ))}
            </div>
          </section>

          {soldCount > 0 || filters.includeSold ? (
            <section>
              <SectionLabel>Show</SectionLabel>
              <div className="mt-1">
                <CheckRow
                  label="Sold items"
                  checked={filters.includeSold}
                  count={soldCount}
                  onToggle={() =>
                    onChange({ ...filters, includeSold: !filters.includeSold })
                  }
                />
              </div>
            </section>
          ) : null}

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
