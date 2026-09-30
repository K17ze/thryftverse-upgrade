'use client';

/**
 * RefinementRail — the desktop (lg+) refinement column behind search,
 * category and browse results. eBay grammar: collapsible facet groups
 * (Category, Brand, Size, Colour, Condition, Show, Price), each option
 * carrying its real count from the current result set, "Show more" past
 * six options. Brand/size/category/colour are multi-select checkboxes —
 * union semantics like the mobile sheet. Counts come from facetCounts.ts
 * — what the grid would show on click, never a fabricated tally. Mobile
 * keeps the sheet/toolbar pattern.
 */

import { useMemo, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { useCategoryDirectory } from './useCategoryDirectory';
import type { Listing, ListingCondition } from '@/lib/contracts/domain';
import type { ListingFilters } from '@/components/filters/filterTypes';
import {
  categoryFacets,
  colourFacets,
  conditionFacets,
  optionsWithSelected,
  soldFacetCount,
  type FacetOption,
} from './facetCounts';
import { FacetOptionRow } from './FacetOptionRow';
import { PriceFacetGroup } from './PriceFacetGroup';

const MAX_VISIBLE = 6;

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

/** Toggle one value in/out of a multi-select list (case-insensitive). */
function toggleValue(list: string[], value: string): string[] {
  const v = value.toLowerCase();
  return list.some((x) => x.toLowerCase() === v)
    ? list.filter((x) => x.toLowerCase() !== v)
    : [...list, value];
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

  const { categories: directoryCategories } = useCategoryDirectory();
  const categoryNames = useMemo(
    () =>
      new Map(
        directoryCategories.flatMap((c) => [
          [c.slug, c.name] as const,
          [c.name.toLowerCase(), c.name] as const,
        ]),
      ),
    [directoryCategories],
  );
  // spelling → canonical value — id-stored and name-stored rows merge
  // into one option (see FilterSheet).
  const categoryCanonical = useMemo(
    () =>
      new Map(
        directoryCategories.flatMap((c) => [
          [c.slug, c.slug] as const,
          [c.name.toLowerCase(), c.slug] as const,
        ]),
      ),
    [directoryCategories],
  );

  const groups = useMemo<FacetGroup[]>(() => {
    const g: FacetGroup[] = [];

    if (!hideCategory) {
      // Selected slugs that aren't present in the result set stay visible
      // (honest 0) so they can be unchecked here.
      const catOptions = categoryFacets(listings, filters, categoryNames, categoryCanonical);
      for (const slug of filters.categories) {
        const canonical = categoryCanonical.get(slug.toLowerCase()) ?? slug.toLowerCase();
        if (!catOptions.some((o) => o.value === canonical)) {
          catOptions.push({
            value: canonical,
            label: categoryNames.get(canonical) ?? categoryNames.get(slug.toLowerCase()) ?? slug,
            count: 0,
          });
        }
      }
      g.push({
        key: 'category',
        title: 'Category',
        options: catOptions,
        isSelected: (o) =>
          filters.categories.some(
            (c) => (categoryCanonical.get(c.toLowerCase()) ?? c.toLowerCase()) === o.value,
          ),
        // Canonical-aware toggle — a stored display-name spelling counts
        // as the same option, so unchecking drops every alias of the
        // value instead of leaving a stuck-selected ghost.
        toggle: (o) => {
          const canonicalOf = (c: string) =>
            categoryCanonical.get(c.toLowerCase()) ?? c.toLowerCase();
          const selected = filters.categories.some((c) => canonicalOf(c) === o.value);
          onChange({
            ...filters,
            categories: selected
              ? filters.categories.filter((c) => canonicalOf(c) !== o.value)
              : [...filters.categories, o.value],
          });
        },
      });
    }

    g.push(
      {
        key: 'brand',
        title: 'Brand',
        options: optionsWithSelected(listings, filters, 'brand'),
        isSelected: (o) =>
          filters.brands.some((b) => b.trim().toLowerCase() === o.value),
        toggle: (o) =>
          onChange({ ...filters, brands: toggleValue(filters.brands, o.label) }),
      },
      {
        key: 'size',
        title: 'Size',
        options: optionsWithSelected(listings, filters, 'size'),
        isSelected: (o) =>
          filters.sizes.some((s) => s.trim().toLowerCase() === o.value),
        toggle: (o) =>
          onChange({ ...filters, sizes: toggleValue(filters.sizes, o.label) }),
      },
      {
        key: 'colour',
        title: 'Colour',
        options: colourFacets(listings, filters),
        isSelected: (o) =>
          filters.colours.some((c) => c.toLowerCase() === o.value.toLowerCase()),
        toggle: (o) =>
          onChange({ ...filters, colours: toggleValue(filters.colours, o.value) }),
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
      {
        // eBay "Show only" grammar — sold listings surface on demand.
        key: 'sold',
        title: 'Show',
        options: [
          {
            value: 'sold',
            label: 'Sold items',
            count: soldFacetCount(listings, filters),
          },
        ],
        isSelected: () => filters.includeSold,
        toggle: () =>
          onChange({ ...filters, includeSold: !filters.includeSold }),
      },
    );

    return g;
  }, [listings, filters, hideCategory, categoryNames, categoryCanonical, onChange]);

  // Groups with no refinements under the current combination disappear —
  // an empty facet list is noise, not honesty. The availability row stays
  // even at 0 so the "Sold items" escape is discoverable.
  const activeGroups = groups.filter(
    (g) => g.options.length > 0 && (g.key !== 'sold' || g.options[0]?.count > 0 || g.isSelected(g.options[0])),
  );

  return (
    <div className="pb-4">
      <div className="flex h-9 items-center justify-between">
        <h2 className="text-label text-text-muted">
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
                <span className="text-label text-text-primary">
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
                      <FacetOptionRow
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
        <h3 className="text-label text-text-muted">
          Price
        </h3>
        <PriceFacetGroup filters={filters} onChange={onChange} />
      </div>
    </div>
  );
}
