'use client';

/**
 * ClosetBrandRail — horizontal brand chips derived from the seller's own
 * listings (port of ClosetBrandFilterRow): "All" + the brands they stock,
 * each with a tnum count. Only rendered when the closet stocks >1 brand.
 */

import { Chip } from '@/components/ui/Chip';
import type { ClosetFacet } from './closetFilters';

interface ClosetBrandRailProps {
  brands: ClosetFacet[];
  active: string | null;
  /** `null` selects the "All" chip; tapping the active brand deselects it. */
  onSelect: (brand: string | null) => void;
}

export function ClosetBrandRail({ brands, active, onSelect }: ClosetBrandRailProps) {
  return (
    <nav
      className="no-scrollbar flex gap-1.5 overflow-x-auto px-4 pb-3 sm:px-6"
      aria-label="Filter by brand"
    >
      <Chip selected={active === null} onClick={() => onSelect(null)}>
        All
      </Chip>
      {brands.map((b) => (
        <Chip
          key={b.value}
          selected={active === b.value}
          aria-label={`Filter by ${b.label}, ${b.count} items`}
          onClick={() => onSelect(active === b.value ? null : b.value)}
        >
          {b.label}
          <span className="tnum text-meta opacity-60">{b.count}</span>
        </Chip>
      ))}
    </nav>
  );
}
