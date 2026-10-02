'use client';

import { Icon } from '@/components/ui/Icon';
import {
  GRID,
  SORTABLE,
  type SortDir,
  type SortKey,
} from './positionEnrichment';

export function SortHead({
  sortKey,
  label,
  active,
  dir,
  align = 'right',
  onSort,
}: {
  sortKey: SortKey;
  label: string;
  active: boolean;
  dir: SortDir;
  align?: 'left' | 'right';
  onSort: (key: SortKey) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={() => onSort(sortKey)}
      className={`inline-flex items-center gap-1 text-micro font-semibold uppercase tracking-[0.08em] transition-colors ${
        align === 'right' ? 'justify-end text-right' : 'text-left'
      } ${
        active
          ? 'text-text-primary'
          : 'text-text-muted hover:text-text-secondary'
      }`}
    >
      {label}
      {active ? (
        <Icon name={dir === 'asc' ? 'chevronUp' : 'chevronDown'} size={12} />
      ) : null}
    </button>
  );
}

interface PositionSortControlsProps {
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
}

export function PositionSortControls({
  sortKey,
  sortDir,
  onSort,
}: PositionSortControlsProps) {
  return (
    <>
      {/* Mobile sort control — the column headers are desktop-only. */}
      <div className="mb-1 flex items-center gap-4 border-b border-border-subtle pb-2 md:hidden">
        <span className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">
          Sort
        </span>
        {SORTABLE.map((s) => {
          const active = sortKey === s.key;
          return (
            <button
              key={s.key}
              type="button"
              aria-pressed={active}
              onClick={() => onSort(s.key)}
              className={`inline-flex items-center gap-0.5 text-meta font-semibold ${
                active ? 'text-text-primary' : 'text-text-muted'
              }`}
            >
              {s.label}
              {active ? (
                <Icon
                  name={sortDir === 'asc' ? 'chevronUp' : 'chevronDown'}
                  size={11}
                />
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Desktop column header track */}
      <div className={`${GRID} gap-4 border-b border-border-subtle px-1 pb-2`}>
        <SortHead
          sortKey="name"
          label="Asset"
          active={sortKey === 'name'}
          dir={sortDir}
          align="left"
          onSort={onSort}
        />
        <span className="text-right text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">
          Units
        </span>
        <span className="text-right text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">
          Avg cost
        </span>
        <span className="text-right text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">
          Last
        </span>
        <SortHead
          sortKey="value"
          label="Value"
          active={sortKey === 'value'}
          dir={sortDir}
          onSort={onSort}
        />
        <SortHead
          sortKey="pl"
          label="P&L"
          active={sortKey === 'pl'}
          dir={sortDir}
          onSort={onSort}
        />
        <span className="text-right text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">
          1M
        </span>
      </div>
    </>
  );
}
