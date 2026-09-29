'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import type { CandlePoint, CoOwnAsset, CoOwnPosition } from '@/lib/contracts/coown';
import { coOwnMarkGbp, deriveLifecycleState } from '@/lib/contracts/coown';
import { usePriceHistoryMap } from '@/lib/hooks/coown-queries';
import { formatDate, timeAgo } from '@/lib/utils/format';
import { AssetThumb } from './AssetThumb';
import { LifecycleTag } from './LifecycleTag';
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
// density: numbers right-aligned, tnum, hairline rows. The Units/Last
// columns carry a provenance sub-line (reserved units, mark source+age),
// so they're sized for two lines of meta text.
const GRID =
  'hidden md:grid md:grid-cols-[minmax(0,1.6fr)_4.5rem_5.5rem_8rem_6.5rem_8.5rem_5.5rem]';

function issuerName(asset: CoOwnAsset): string {
  return asset.issuer.displayName ?? `@${asset.issuer.username}`;
}

// ── Row enrichment — every field is wire-verified or derived from ────
// joined wire fields; nothing is invented for fixture rows (they carry
// none of the live projection's extras, so the sub-lines stay absent).

/** The viewer's share of the issue — units held ÷ asset.totalUnits
 *  (the position row only renders against a joined asset row). */
function ownershipPct(position: CoOwnPosition, asset: CoOwnAsset): number | null {
  if (asset.totalUnits <= 0 || position.units <= 0) return null;
  const pct = (position.units / asset.totalUnits) * 100;
  if (!Number.isFinite(pct) || pct <= 0) return null;
  return pct;
}

function formatOwnershipPct(pct: number): string {
  if (pct < 0.05) return '<0.1%';
  const rounded = Math.round(pct * 10) / 10;
  return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)}%`;
}

/** Units locked by live sell orders/reservations — the wire reports
 *  sellableUnits; reserved is the honest difference, nothing more. */
function reservedUnits(position: CoOwnPosition): number | null {
  if (position.sellableUnits == null) return null;
  const reserved = position.units - position.sellableUnits;
  return reserved > 0 ? reserved : null;
}

const MARK_BASIS_LABEL: Record<string, string> = {
  last_trade: 'Last trade',
  reference: 'Appraisal',
  offering: 'Offering',
};

/** Mark provenance + staleness — prefers the server's own markAgeSeconds
 *  (immune to client clock skew) and falls back to the mark timestamp. */
function markDetail(position: CoOwnPosition): string | null {
  const basis = position.markBasis;
  if (!basis || basis === 'none') return null;
  const label = MARK_BASIS_LABEL[basis] ?? basis;
  const seconds = position.markAgeSeconds;
  if (seconds != null && Number.isFinite(seconds)) {
    if (seconds < 90) return `${label} · just now`;
    const mins = Math.floor(seconds / 60);
    if (mins < 60) return `${label} · ${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${label} · ${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 60) return `${label} · ${days}d ago`;
    return `${label} · ${Math.floor(days / 30)}mo ago`;
  }
  const ago = position.markTimestamp ? timeAgo(position.markTimestamp) : '';
  return ago ? `${label} · ${ago}` : label;
}

/** A lockup only matters while it's still in force — a past
 *  lockupEndDate is history, not a badge. Returns the date string when
 *  the lockup is still active, null otherwise. */
function activeLockup(position: CoOwnPosition): string | null {
  if (!position.lockupEndDate) return null;
  const t = Date.parse(position.lockupEndDate);
  return Number.isFinite(t) && t > Date.now() ? position.lockupEndDate : null;
}

/** Row sparkline — candles come from the table-level batched history
 *  read (usePriceHistoryMap), not a query per row. */
function PositionSparkline({ candles, assetTitle }: { candles: CandlePoint[]; assetTitle: string }) {
  if (!candles || candles.length < 2) return <span className="inline-block h-6 w-20" />;
  const first = candles[0]!.c;
  const last = candles[candles.length - 1]!.c;
  const movePct = first > 0 ? ((last - first) / first) * 100 : 0;
  const trend =
    Math.abs(movePct) < 0.05 ? 'flat' : movePct > 0 ? `up ${movePct.toFixed(1)}%` : `down ${Math.abs(movePct).toFixed(1)}%`;
  return (
    <span className="inline-block h-6 w-20">
      <Sparkline candles={candles} label={`${assetTitle} 1-month trend — ${trend}`} />
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
          // The "last" column is the mark — the server projection's mark
          // when it reports one, else the last settled trade over the
          // issue price. Never the stale issuance print alone.
          const mark = position.markPriceGbp ?? coOwnMarkGbp(asset);
          const tone = up ? 'text-coown-up' : 'text-coown-down';
          // Halted/exiting holdings carry the tag — a live position doesn't
          // need the noise.
          const halted = deriveLifecycleState(asset) !== 'secondaryTrading'
            && deriveLifecycleState(asset) !== 'initialOffering';
          // Live-projection enrichments — every one null-safe; fixture
          // positions carry none of these and the lines stay absent.
          const share = ownershipPct(position, asset);
          const reserved = reservedUnits(position);
          const lockup = activeLockup(position);
          const markMeta = markDetail(position);
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
                      <span className="tnum">
                        {position.units} units
                        {share != null ? ` · ${formatOwnershipPct(share)} of issue` : ''}
                      </span>
                    </p>
                    <p className="mt-0.5 text-meta text-text-muted tnum">
                      avg {gbp(position.avgEntryPriceGbp)} · last {gbp(mark)}
                      {markMeta ? <span className="font-normal"> — {markMeta}</span> : null}
                    </p>
                    {reserved != null || lockup ? (
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2.5 text-meta text-text-secondary">
                        {reserved != null ? (
                          <span className="tnum">{reserved} reserved</span>
                        ) : null}
                        {lockup ? (
                          <span className="inline-flex items-center gap-1">
                            <Icon name="lock" size={12} className="text-text-muted" />
                            Locked until {formatDate(lockup)}
                          </span>
                        ) : null}
                      </p>
                    ) : null}
                    {halted ? <LifecycleTag asset={asset} className="mt-1" /> : null}
                  </div>
                  <div className="shrink-0 text-right">
                    <PositionSparkline
                      candles={candlesById.get(asset.id) ?? []}
                      assetTitle={asset.title}
                    />
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
                    <p className="clamp-1 flex items-center gap-1.5 text-meta text-text-secondary">
                      <span className="truncate">{issuerName(asset)}</span>
                      {share != null ? (
                        <span className="shrink-0 text-text-muted tnum">
                          · {formatOwnershipPct(share)} of issue
                        </span>
                      ) : null}
                      {lockup ? (
                        <Badge
                          variant="warning"
                          icon="lock"
                          className="px-2 py-0.5 text-micro"
                        >
                          Until {formatDate(lockup)}
                        </Badge>
                      ) : null}
                      {halted ? <LifecycleTag asset={asset} /> : null}
                    </p>
                  </div>
                </div>
                <p className="text-right text-body text-text-primary tnum">
                  {position.units}
                  {reserved != null ? (
                    <span className="block text-meta font-normal text-text-muted">
                      {reserved} reserved
                    </span>
                  ) : null}
                </p>
                <p className="text-right text-body text-text-secondary tnum">
                  {gbp(position.avgEntryPriceGbp)}
                </p>
                <p className="text-right text-body text-text-primary tnum">
                  {gbp(mark)}
                  {markMeta ? (
                    <span className="block text-meta font-normal text-text-muted">
                      {markMeta}
                    </span>
                  ) : null}
                </p>
                <p className="text-right text-body-emphasis text-text-primary tnum">{gbp(value)}</p>
                <p className={`text-right text-body-emphasis tnum ${tone}`}>
                  {signedGbp(plGbp)}
                  <span className="ml-1.5 text-meta text-text-secondary">{signedPct(plPct)}</span>
                </p>
                <div className="justify-self-end">
                  <PositionSparkline
                    candles={candlesById.get(asset.id) ?? []}
                    assetTitle={asset.title}
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
