'use client';

import { Chip } from '@/components/ui/Chip';
import { Icon } from '@/components/ui/Icon';
import {
  HUB_SORTS,
  type HubSortKey,
  type HubView,
} from './hubTypes';

interface HubMarketControlsProps {
  view: HubView;
  query: string;
  onQueryChange: (q: string) => void;
  segments: string[];
  segment: string;
  onSegmentChange: (s: string) => void;
  sort: HubSortKey;
  onSortChange: (sort: HubSortKey) => void;
  count: number;
}

export function HubMarketControls({
  view,
  query,
  onQueryChange,
  segments,
  segment,
  onSegmentChange,
  sort,
  onSortChange,
  count,
}: HubMarketControlsProps) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <div className="relative min-w-44 flex-1">
        <Icon
          name="search"
          size={14}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={view === 'offerings' ? 'Search offerings' : 'Search markets'}
          aria-label="Search markets"
          className="h-9 w-full rounded-full border border-border-subtle bg-transparent pl-8 pr-3 text-body text-text-primary placeholder:text-text-muted focus:border-text-muted focus:outline-none"
        />
      </div>
      <div
        className="no-scrollbar -mx-1 flex flex-1 gap-2 overflow-x-auto px-1"
        role="group"
        aria-label="Filter by category"
      >
        {segments.map((s) => (
          <Chip key={s} selected={segment === s} onClick={() => onSegmentChange(s)}>
            {s}
          </Chip>
        ))}
      </div>
      <select
        value={sort}
        onChange={(e) => onSortChange(e.target.value as HubSortKey)}
        aria-label="Sort markets"
        className="h-9 rounded-full border border-border-subtle bg-transparent px-3 text-meta font-medium text-text-secondary focus:border-text-muted focus:outline-none"
      >
        {HUB_SORTS.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
      <p className="text-meta text-text-muted tnum" aria-live="polite">
        {count} {count === 1 ? 'market' : 'markets'}
      </p>
    </div>
  );
}
