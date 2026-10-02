'use client';

import type { CandlePoint, CoOwnAsset, CoOwnPosition } from '@/lib/contracts/coown';
import { timeAgo } from '@/lib/utils/format';
import { Sparkline } from '../Sparkline';

export interface PositionRow {
  position: CoOwnPosition;
  asset: CoOwnAsset;
  /** units × last trade price. */
  value: number;
  /** (last − avg entry) × units — honest unrealised P&L. */
  plGbp: number;
  plPct: number;
}

export type SortKey = 'name' | 'value' | 'pl';
export type SortDir = 'asc' | 'desc';

export const SORTABLE: { key: SortKey; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'value', label: 'Value' },
  { key: 'pl', label: 'P&L' },
];

// Asset | Units | Avg | Last | Value | P&L | Spark — TradingView watchlist
// density: numbers right-aligned, tnum, hairline rows. The Units/Last
// columns carry a provenance sub-line (reserved units, mark source+age),
// so they're sized for two lines of meta text.
export const GRID =
  'hidden md:grid md:grid-cols-[minmax(0,1.6fr)_4.5rem_5.5rem_8rem_6.5rem_8.5rem_5.5rem]';

export function issuerName(asset: CoOwnAsset): string {
  return asset.issuer.displayName ?? `@${asset.issuer.username}`;
}

/** The viewer's share of the issue — units held ÷ asset.totalUnits
 *  (the position row only renders against a joined asset row). */
export function ownershipPct(
  position: CoOwnPosition,
  asset: CoOwnAsset,
): number | null {
  if (asset.totalUnits <= 0 || position.units <= 0) return null;
  const pct = (position.units / asset.totalUnits) * 100;
  if (!Number.isFinite(pct) || pct <= 0) return null;
  return pct;
}

export function formatOwnershipPct(pct: number): string {
  if (pct < 0.05) return '<0.1%';
  const rounded = Math.round(pct * 10) / 10;
  return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)}%`;
}

/** Units locked by live sell orders/reservations — the wire reports
 *  sellableUnits; reserved is the honest difference, nothing more. */
export function reservedUnits(position: CoOwnPosition): number | null {
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
export function markDetail(position: CoOwnPosition): string | null {
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
export function activeLockup(position: CoOwnPosition): string | null {
  if (!position.lockupEndDate) return null;
  const t = Date.parse(position.lockupEndDate);
  return Number.isFinite(t) && t > Date.now() ? position.lockupEndDate : null;
}

/** Row sparkline — candles come from the table-level batched history
 *  read (usePriceHistoryMap), not a query per row. */
export function PositionSparkline({
  candles,
  assetTitle,
}: {
  candles: CandlePoint[];
  assetTitle: string;
}) {
  if (!candles || candles.length < 2)
    return <span className="inline-block h-6 w-20" />;
  const first = candles[0]!.c;
  const last = candles[candles.length - 1]!.c;
  const movePct = first > 0 ? ((last - first) / first) * 100 : 0;
  const trend =
    Math.abs(movePct) < 0.05
      ? 'flat'
      : movePct > 0
        ? `up ${movePct.toFixed(1)}%`
        : `down ${Math.abs(movePct).toFixed(1)}%`;
  return (
    <span className="inline-block h-6 w-20">
      <Sparkline
        candles={candles}
        label={`${assetTitle} 1-month trend — ${trend}`}
      />
    </span>
  );
}
