'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import type { CoOwnAsset, CoOwnPosition } from '@/lib/contracts/coown';
import { usePriceHistory } from '@/lib/hooks/coown-queries';
import { AssetThumb } from './AssetThumb';
import { Sparkline } from './Sparkline';
import { gbp, signedGbp, signedPct } from './format';

export interface PositionRow {
  position: CoOwnPosition;
  asset: CoOwnAsset;
  /** units × last trade price. */
  value: number;
  /** (last − avg entry) × units — honest unrealised P&L. */
  plGbp: number;
  plPct: number;
}

type SortKey = 'name' | 'value' | 'pl';
type SortDir = 'asc' | 'desc';

const SORTABLE: { key: SortKey; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'value', label: 'Value' },
  { key: 'pl', label: 'P&L' },
];

// Asset | Units | Avg | Last | Value | P&L | Spark — TradingView watchlist
// density: numbers right-aligned, tnum, hairline rows.
const GRID =
  'hidden md:grid md:grid-cols-[minmax(0,1.7fr)_3.5rem_5.5rem_5.5rem_6.5rem_8.5rem_5.5rem]';

function issuerName(asset: CoOwnAsset): string {
  return asset.issuer.displayName ?? `@${asset.issuer.username}`;
}

/** Per-row price-history query — the sparkline's data source. */
function PositionSparkline({ assetId }: { assetId: string }) {
  const history = usePriceHistory(assetId, '1M');
  return (
    <span className="inline-block h-6 w-20">
      {history.data && history.data.length > 1 ? <Sparkline candles={history.data} /> : null}
    </span>
  );
}

function SortHead({
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
      } ${active ? 'text-text-primary' : 'text-text-muted hover:text-text-secondary'}`}
    >
      {label}
      {active ? (
        <Icon name={dir === 'asc' ? 'chevronUp' : 'chevronDown'} size={12} />
      ) : null}
    </button>
  );
}

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
                <Icon name={sortDir === 'asc' ? 'chevronUp' : 'chevronDown'} size={11} />
              ) : null}
            </button>
          );
        })}
      </div>

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

      <ul className="divide-y divide-border-subtle">
        {sorted.map(({ position, asset, value, plGbp, plPct }) => {
          const up = plGbp >= 0;
          const tone = up ? 'text-coown-up' : 'text-coown-down';
          return (
            <li key={asset.id} className="group relative transition-colors hover:bg-row">
              <Link
                href={`/co-own/${asset.id}`}
                className="absolute inset-0 z-0"
                aria-label={`Open ${asset.title} market`}
              />
              {/* Mobile */}
              <div className="pointer-events-none relative z-[1] py-4 md:hidden">
                <div className="flex items-start gap-3">
                  <AssetThumb src={asset.imageUrl} alt="" className="h-12 w-12 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="clamp-1 text-body-emphasis font-semibold text-text-primary">
                      {asset.title}
                    </p>
                    <p className="mt-0.5 text-meta text-text-secondary">
                      <span className="clamp-1">{issuerName(asset)}</span>
                      <span className="text-text-muted"> · </span>
                      <span className="tnum">{position.units} units</span>
                    </p>
                    <p className="mt-0.5 text-meta text-text-muted tnum">
                      avg {gbp(position.avgEntryPriceGbp)} · last {gbp(asset.unitPriceGbp)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <PositionSparkline assetId={asset.id} />
                    <p className="mt-1 text-body-emphasis text-text-primary tnum">{gbp(value)}</p>
                    <p className={`mt-0.5 text-meta font-semibold tnum ${tone}`}>
                      {signedGbp(plGbp)} ({signedPct(plPct)})
                    </p>
                  </div>
                </div>
              </div>
              {/* Desktop */}
              <div className={`${GRID} pointer-events-none relative z-[1] items-center gap-4 px-1 py-3.5`}>
                <div className="flex min-w-0 items-center gap-3">
                  <AssetThumb src={asset.imageUrl} alt="" className="h-10 w-10 shrink-0" />
                  <div className="min-w-0">
                    <p className="clamp-1 text-body-emphasis font-semibold text-text-primary">
                      {asset.title}
                    </p>
                    <p className="clamp-1 text-meta text-text-secondary">{issuerName(asset)}</p>
                  </div>
                </div>
                <p className="text-right text-body text-text-primary tnum">{position.units}</p>
                <p className="text-right text-body text-text-secondary tnum">
                  {gbp(position.avgEntryPriceGbp)}
                </p>
                <p className="text-right text-body text-text-primary tnum">
                  {gbp(asset.unitPriceGbp)}
                </p>
                <p className="text-right text-body-emphasis text-text-primary tnum">{gbp(value)}</p>
                <p className={`text-right text-body-emphasis tnum ${tone}`}>
                  {signedGbp(plGbp)}
                  <span className="ml-1.5 text-meta text-text-secondary">{signedPct(plPct)}</span>
                </p>
                <div className="justify-self-end">
                  <PositionSparkline assetId={asset.id} />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
