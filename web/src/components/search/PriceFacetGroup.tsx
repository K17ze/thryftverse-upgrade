'use client';

/**
 * PriceFacetGroup — price range inputs for the desktop RefinementRail.
 * Commits on Enter or blur with sheet-parity live update feel.
 */

import { useEffect, useState } from 'react';
import type { ListingFilters } from '@/components/filters/filterTypes';

const FIELD =
  'h-10 w-full rounded-lg border border-border bg-input pl-7 pr-2.5 text-body text-input-text placeholder:text-text-muted focus:border-text-muted focus:outline-none';

interface PriceFacetGroupProps {
  filters: ListingFilters;
  onChange: (next: ListingFilters) => void;
}

export function PriceFacetGroup({ filters, onChange }: PriceFacetGroupProps) {
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
