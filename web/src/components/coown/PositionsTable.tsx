'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { EmptyState } from '@/components/ui/EmptyState';
import { usePriceHistoryMap } from '@/lib/hooks/coown-queries';
import {
  type PositionRow,
  type SortDir,
  type SortKey,
} from './positions/positionEnrichment';
import { PositionSortControls } from './positions/PositionSortControls';
import { PositionTableRow } from './positions/PositionTableRow';

export type { PositionRow };

/** Positions — sortable watchlist on desktop, stacked asset rows on mobile. */
export function PositionsTable({ rows }: { rows: PositionRow[] }) {
  const router = useRouter();
  const [sortKey, setSortKey] = useState<SortKey>('value');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    const list = [...rows];
    if (sortKey === 'name') {
      list.sort((a, b) => dir * a.asset.title.localeCompare(b.asset.title));
    } else if (sortKey === 'pl') {
      list.sort((a, b) => dir * (a.plGbp - b.plGbp));
    } else {
      list.sort((a, b) => dir * (a.value - b.value));
    }
    return list;
  }, [rows, sortKey, sortDir]);

  const onSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'name' ? 'asc' : 'desc');
    }
  };

  // One batched price-history read for every row's 1M sparkline —
  // a per-row hook would fan out N requests per render pass.
  const assetIds = useMemo(() => rows.map((r) => r.asset.id), [rows]);
  const historyMap = usePriceHistoryMap(assetIds, '1M');
  const candlesById = useMemo(
    () => new Map(historyMap.map((h) => [h.assetId, h.candles] as const)),
    [historyMap],
  );

  if (rows.length === 0) {
    return (
      <EmptyState
        compact
        icon="layers"
        title="No positions yet"
        subtitle="Buy units in any Co-Own market and it will show up here."
        actionLabel="Browse markets"
        onAction={() => router.push('/co-own')}
      />
    );
  }

  return (
    <section aria-label="Positions">
      <PositionSortControls
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={onSort}
      />

      <ul className="divide-y divide-border-subtle">
        {sorted.map((row) => (
          <PositionTableRow
            key={row.asset.id}
            row={row}
            candles={candlesById.get(row.asset.id) ?? []}
          />
        ))}
      </ul>
    </section>
  );
}
