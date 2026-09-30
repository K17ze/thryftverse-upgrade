'use client';

/**
 * FacetOptionRow — single checkbox facet row in RefinementRail.
 * Shows selected state, optional colour swatch, label, and result count in tabular numerals.
 */

import { Icon } from '@/components/ui/Icon';
import type { FacetOption } from './facetCounts';

interface FacetOptionRowProps {
  option: FacetOption;
  selected: boolean;
  onToggle: () => void;
}

export function FacetOptionRow({ option, selected, onToggle }: FacetOptionRowProps) {
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
        {option.swatch ? (
          <span
            aria-hidden
            className="h-3.5 w-3.5 shrink-0 rounded-full border border-border-subtle"
            style={{ backgroundColor: option.swatch }}
          />
        ) : null}
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
