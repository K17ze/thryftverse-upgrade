'use client';

/**
 * InventorySummaryStrip — mobile InventorySummaryRow parity. One flat
 * hairline strip of tnum counts (items / active / paused / sold / shelf
 * value); the counts are the filters' truth, so the strip is read-only.
 */

import { formatPrice } from '@/lib/utils/format';
import type { ManagedListingRow } from './listingManagementModel';

interface InventorySummaryStripProps {
  rows: ManagedListingRow[];
}

export function InventorySummaryStrip({ rows }: InventorySummaryStripProps) {
  const counts = { active: 0, paused: 0, sold: 0, draft: 0, held: 0 };
  let value = 0;
  for (const r of rows) {
    counts[r.status] += 1;
    // Shelf value counts what could still sell — sold rows are history.
    if (r.status === 'active' || r.status === 'paused') value += r.listing.price;
  }

  const cells: { label: string; value: string }[] = [
    { label: 'Items', value: String(rows.length) },
    { label: 'Active', value: String(counts.active) },
    { label: 'Paused', value: String(counts.paused) },
    { label: 'Sold', value: String(counts.sold) },
    { label: 'Value', value: formatPrice(Math.round(value * 100) / 100) },
  ];

  return (
    <dl
      aria-label="Inventory summary"
      className="grid grid-cols-5 divide-x divide-border-subtle border-y border-border-subtle"
    >
      {cells.map((c) => (
        <div key={c.label} className="px-3 py-2.5 first:pl-0">
          <dt className="text-meta text-text-muted">{c.label}</dt>
          <dd className="tnum mt-0.5 text-body-emphasis font-semibold text-text-primary">
            {c.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
