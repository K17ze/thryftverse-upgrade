'use client';

/**
 * FilterSheet — the sub-lg facet editor for search/category/browse results.
 * Factored into domain subcomponents:
 * - FilterPrimitives: SectionLabel, FacetChips, CheckRow, FIELD styling
 * - useFilterSheetWorkflow: counted facets derivation, directory categories, canonical logic
 */

import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Icon } from '@/components/ui/Icon';
import type { Listing } from '@/lib/contracts/domain';
import {
  CONDITION_OPTIONS,
  EMPTY_FILTERS,
  type ListingFilters,
} from './filterTypes';
import {
  FIELD,
  SectionLabel,
  FacetChips,
  CheckRow,
  toggleValue,
} from './FilterPrimitives';
import { useFilterSheetWorkflow } from './useFilterSheetWorkflow';

interface FilterSheetProps {
  open: boolean;
  onClose: () => void;
  listings: Listing[];
  filters: ListingFilters;
  onChange: (next: ListingFilters) => void;
  resultCount: number;
  hideCategory?: boolean;
  onSaveSearch?: () => void;
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
  const {
    categoryOptions,
    canonicalCategory,
    toggleCategory,
    brandOptions,
    sizeOptions,
    colourOptions,
    conditionCounts,
    soldCount,
    toggleCondition,
    setPrice,
  } = useFilterSheetWorkflow(listings, filters, onChange);

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

          {/* Section order: Category → Brand → Size → Colour → Condition → Show → Price */}
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
                      (c) => canonicalCategory(c) === o.value,
                    )}
                    onClick={() => toggleCategory(o.value)}
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
