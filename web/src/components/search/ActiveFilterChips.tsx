'use client';

/**
 * ActiveFilterChips — scrollable horizontal chip rail for applied search/browse filters.
 * Features Depop/Vinted-style instant dismiss pill tags with swatches and 'Clear all'.
 */

import { Icon } from '@/components/ui/Icon';

export interface ResultsChip {
  key: string;
  label: string;
  /** Colour chips carry the vocabulary swatch. */
  swatch?: string;
  onRemove: () => void;
}

interface ActiveFilterChipsProps {
  chips: ResultsChip[];
  onClearAll: () => void;
}

export function ActiveFilterChips({ chips, onClearAll }: ActiveFilterChipsProps) {
  if (chips.length === 0) return null;

  return (
    <div
      className="no-scrollbar -mt-0.5 flex items-center gap-1.5 overflow-x-auto px-4 pb-2.5 sm:px-6"
      role="list"
      aria-label="Active filters"
    >
      {chips.map((chip) => (
        <div key={chip.key} role="listitem" className="shrink-0">
          <button
            type="button"
            onClick={chip.onRemove}
            aria-label={`Remove filter: ${chip.label}`}
            className="pressable inline-flex h-8 items-center gap-1 rounded-full bg-surface-alt pl-3 pr-2 text-caption font-semibold text-text-primary hover:bg-surface-raised"
          >
            {chip.swatch ? (
              <span
                aria-hidden
                className="h-3 w-3 shrink-0 rounded-full border border-border-subtle"
                style={{ backgroundColor: chip.swatch }}
              />
            ) : null}
            <span className="max-w-44 truncate">{chip.label}</span>
            <Icon name="close" size={13} className="shrink-0 text-text-muted" />
          </button>
        </div>
      ))}
      <div role="listitem" className="shrink-0">
        <button
          type="button"
          onClick={onClearAll}
          className="pressable h-8 px-1 text-caption font-semibold text-text-secondary hover:text-text-primary"
        >
          Clear all
        </button>
      </div>
    </div>
  );
}
