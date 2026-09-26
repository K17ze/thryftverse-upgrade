'use client';

/**
 * RefinementRail — the desktop (lg+) refinement column behind search,
 * category and browse results. eBay grammar: collapsible facet groups
 * (Category, Brand, Size, Condition, Price), each option carrying its
 * real count from the current result set, "Show more" past six options.
 * Counts come from facetCounts.ts — what the grid would show on click,
 * never a fabricated tally. Mobile keeps the sheet/toolbar pattern.
 */

import { useEffect, useMemo, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { CATEGORIES } from '@/lib/data/fixtures';
import type { Listing, ListingCondition } from '@/lib/contracts/domain';
import type { ListingFilters } from '@/components/filters/filterTypes';
import {
  brandFacets,
  categoryFacets,
  conditionFacets,
  sizeFacets,
  type FacetOption,
} from './facetCounts';

const MAX_VISIBLE = 6;

const FIELD =
  'h-10 w-full rounded-lg border border-border bg-input pl-7 pr-2.5 text-body text-input-text placeholder:text-text-muted focus:border-text-muted focus:outline-none';

interface RefinementRailProps {
  /** The current result set — facet counts derive from this, unfiltered. */
  listings: Listing[];
  filters: ListingFilters;
  onChange: (next: ListingFilters) => void;
  /** Hide the category group on category-scoped surfaces. */
  hideCategory?: boolean;
  activeCount: number;
  onClearAll: () => void;
}

interface FacetGroup {
  key: string;
  title: string;
  options: FacetOption[];
  /** Is this option value currently applied? */
  isSelected: (o: FacetOption) => boolean;
  /** Apply / clear one option value. */
  toggle: (o: FacetOption) => void;
}

function OptionRow({
  option,
  selected,
  onToggle,
}: {
  option: FacetOption;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        role="checkbox"
        aria-checked={selected}
        onClick={onToggle}
        className="pressable flex h-11 w-full items-center gap-2.5 text-left"
      >
        <span
          className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-sm border ${
            selected
              ? 'border-brand bg-brand text-text-inverse'
              : 'border-border bg-surface'
          }`}
        >
          {selected ? <Icon name="check" size={12} /> : null}
        </span>
        <span
          className={`min-w-0 flex-1 truncate text-body ${
            selected ? 'font-medium text-text-primary' : 'text-text-secondary'
          }`}
        >
          {option.label}
        </span>
        <span className="tnum shrink-0 text-caption text-text-muted">
          {option.count}
        </span>
      </button>
    </li>
  );
}

/** Price bounds — draft inputs commit on Enter/blur, sheet-parity live feel. */
function PriceGroup({
  filters,
  onChange,
}: Pick<RefinementRailProps, 'filters' | 'onChange'>) {
  const [min, setMin] = useState(filters.priceMin?.toString() ?? '');
  const [max, setMax] = useState(filters.priceMax?.toString() ?? '');

  useEffect(() => {
    setMin(filters.priceMin?.toString() ?? '');
    setMax(filters.priceMax?.toString() ?? '');
  }, [filters.priceMin, filters.priceMax]);

  const commit = () => {
    const parse = (raw: string): number | null => {
      if (raw.trim() === '') return null;
      const n = Number(raw);
      return Number.isNaN(n) || n < 0 ? null : n;
    };
    const nextMin = parse(min);
    const nextMax = parse(max);
    if (nextMin === filters.priceMin && nextMax === filters.priceMax) return;
    onChange({ ...filters, priceMin: nextMin, priceMax: nextMax });
  };

  return (
    <div className="flex items-center gap-2 pb-4 pt-1.5">
      <div className="relative flex-1">
        <span
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-body text-text-muted"
          aria-hidden
        >
          £
        </span>
        <input
          inputMode="decimal"
          value={min}
          onChange={(e) => setMin(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && commit()}
          placeholder="Min"
          aria-label="Minimum price"
          className={FIELD}
        />
      </div>
      <span className="text-text-muted" aria-hidden>
        –
      </span>
      <div className="relative flex-1">
        <span
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-body text-text-muted"
          aria-hidden
        >
          £
        </span>
        <input
          inputMode="decimal"
          value={max}
          onChange={(e) => setMax(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && commit()}
          placeholder="Max"
          aria-label="Maximum price"
          className={FIELD}
        />
      </div>
    </div>
  );
}

export function RefinementRail({
  listings,
  filters,
  onChange,
  hideCategory,
  activeCount,
  onClearAll,
}: RefinementRailProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [expandedOptions, setExpandedOptions] = useState<Record<string, boolean>>({});

  const categoryNames = useMemo(
    () => new Map(CATEGORIES.map((c) => [c.slug, c.name])),
    [],
  );

  const groups = useMemo<FacetGroup[]>(() => {
    const g: FacetGroup[] = [];

    if (!hideCategory) {
      g.push({
        key: 'category',
        title: 'Category',
        options: categoryFacets(listings, filters, categoryNames),
        isSelected: (o) => filters.category?.toLowerCase() === o.value,
        toggle: (o) =>
          onChange({
            ...filters,
            category: filters.category?.toLowerCase() === o.value ? null : o.value,
          }),
      });
    }

    g.push(
      {
        key: 'brand',
        title: 'Brand',
        options: brandFacets(listings, filters),
        isSelected: (o) => filters.brand.trim().toLowerCase() === o.value,
        toggle: (o) =>
          onChange({
            ...filters,
            brand: filters.brand.trim().toLowerCase() === o.value ? '' : o.label,
          }),
      },
      {
        key: 'size',
        title: 'Size',
        options: sizeFacets(listings, filters),
        isSelected: (o) => filters.size.trim().toLowerCase() === o.value,
        toggle: (o) =>
          onChange({
            ...filters,
            size: filters.size.trim().toLowerCase() === o.value ? '' : o.label,
          }),
      },
      {
        key: 'condition',
        title: 'Condition',
        options: conditionFacets(listings, filters),
        isSelected: (o) => filters.conditions.includes(o.label as ListingCondition),
        toggle: (o) => {
          const c = o.label as ListingCondition;
          onChange({
            ...filters,
            conditions: filters.conditions.includes(c)
              ? filters.conditions.filter((x) => x !== c)
              : [...filters.conditions, c],
          });
        },
      },
    );

    return g;
  }, [listings, filters, hideCategory, categoryNames, onChange]);

  // Groups with no refinements under the current combination disappear —
  // an empty facet list is noise, not honesty.
  const activeGroups = groups.filter((g) => g.options.length > 0);

  return (
    <div className="pb-4">
      <div className="flex h-9 items-center justify-between">
        <h2 className="text-label font-semibold uppercase tracking-wide text-text-muted">
          Refine
        </h2>
        {activeCount > 0 ? (
          <button
            type="button"
            onClick={onClearAll}
            className="pressable rounded-md px-1.5 text-caption font-semibold text-text-secondary hover:text-text-primary"
          >
            Clear all
          </button>
        ) : null}
      </div>

      <ul className="divide-y divide-border-subtle border-b border-border-subtle">
        {activeGroups.map((group) => {
          const isCollapsed = collapsed[group.key] ?? false;
          const showAll = expandedOptions[group.key] ?? false;
          const visible = showAll
            ? group.options
            : group.options.slice(0, MAX_VISIBLE);
          const hidden = group.options.length - visible.length;

          return (
            <li key={group.key} className="py-1.5">
              <button
                type="button"
                aria-expanded={!isCollapsed}
                onClick={() =>
                  setCollapsed((c) => ({ ...c, [group.key]: !isCollapsed }))
                }
                className="pressable flex h-10 w-full items-center justify-between text-left"
              >
                <span className="text-label font-semibold uppercase tracking-wide text-text-primary">
                  {group.title}
                </span>
                <Icon
                  name="chevronUp"
                  size={16}
                  className={`text-text-muted transition-transform duration-200 ${
                    isCollapsed ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {!isCollapsed ? (
                <>
                  <ul className="mt-0.5">
                    {visible.map((o) => (
                      <OptionRow
                        key={o.value}
                        option={o}
                        selected={group.isSelected(o)}
                        onToggle={() => group.toggle(o)}
                      />
                    ))}
                  </ul>
                  {hidden > 0 ? (
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedOptions((e) => ({
                          ...e,
                          [group.key]: !showAll,
                        }))
                      }
                      aria-expanded={showAll}
                      className="pressable mt-0.5 flex h-8 items-center gap-1 rounded-md px-1 text-caption font-semibold text-text-secondary hover:text-text-primary"
                    >
                      {showAll ? 'Show less' : `Show ${hidden} more`}
                      <Icon name={showAll ? 'chevronUp' : 'chevronDown'} size={13} />
                    </button>
                  ) : null}
                </>
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className="pt-3">
        <h3 className="text-label font-semibold uppercase tracking-wide text-text-muted">
          Price
        </h3>
        <PriceGroup filters={filters} onChange={onChange} />
      </div>
    </div>
  );
}
