'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import type { MarketHistoryItem } from '@/lib/api/services/coownHistory';
import { timeAgo } from '@/lib/utils/format';
import { gbp } from '../format';

export type SideFilter = 'all' | 'buy' | 'sell';

export const SIDE_TONE = { buy: 'text-coown-up', sell: 'text-coown-down' } as const;

export const TYPE_LABEL = {
  limit: 'Limit',
  market: 'Market',
  protected_market: 'Protected',
} as const;

export const STATUS_LABEL: Record<string, string> = {
  open: 'Open',
  partially_filled: 'Part filled',
  filled: 'Filled',
  cancelled: 'Cancelled',
  rejected: 'Refused',
};

export const FILTER_OPTIONS: { key: SideFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'buy', label: 'Buys' },
  { key: 'sell', label: 'Sells' },
];

export const HISTORY_GRID =
  'lg:grid-cols-[minmax(0,1.6fr)_4.5rem_5.5rem_5rem_6rem_auto_5.5rem]';

export const HEAD_CELL =
  'text-micro font-semibold uppercase tracking-[0.08em] text-text-muted';

export function historySide(item: MarketHistoryItem): 'buy' | 'sell' | null {
  return item.action === 'buy-units' ? 'buy' : item.action === 'sell-units' ? 'sell' : null;
}

export function HistoryRow({
  item,
  highlighted,
}: {
  item: MarketHistoryItem;
  highlighted: boolean;
}) {
  const side = historySide(item);
  const title = item.note ?? 'Co-Own asset';
  const partialFill =
    item.filledUnits != null && item.units != null && item.filledUnits !== item.units;

  return (
    <li
      id={`order-${item.orderId ?? item.id}`}
      className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-1 py-3 lg:grid ${HISTORY_GRID} lg:gap-x-5 ${
        highlighted ? 'bg-row -mx-1 px-2' : ''
      }`}
    >
      <div className="min-w-0">
        <Link
          href={`/co-own/${item.referenceId}`}
          className="clamp-1 block text-body font-semibold text-text-primary underline-offset-4 hover:underline"
        >
          {title}
        </Link>
        <p className="mt-0.5 text-meta text-text-secondary tnum lg:hidden">
          {side ? (
            <span className={`font-semibold ${SIDE_TONE[side]}`}>
              {side === 'buy' ? 'Buy' : 'Sell'}
            </span>
          ) : null}
          {item.orderType ? ` · ${TYPE_LABEL[item.orderType]}` : ''}
          {item.units != null
            ? ` · ${item.units} ${item.units === 1 ? 'unit' : 'units'}`
            : ''}
          {item.unitPriceGbp != null ? ` @ ${gbp(item.unitPriceGbp)}` : ''}
          {partialFill ? ` — ${item.filledUnits} filled` : ''}
        </p>
      </div>

      <p className="hidden lg:block">
        {side ? (
          <span className={`text-body font-semibold tnum ${SIDE_TONE[side]}`}>
            {side === 'buy' ? 'Buy' : 'Sell'}
          </span>
        ) : (
          <span className="text-body text-text-muted">—</span>
        )}
      </p>
      <p className="hidden text-body text-text-secondary lg:block">
        {item.orderType ? TYPE_LABEL[item.orderType] : '—'}
      </p>
      <p className="hidden text-right text-body text-text-secondary tnum lg:block">
        {item.units ?? '—'}
        {partialFill ? (
          <span className="block text-meta text-text-muted">{item.filledUnits} filled</span>
        ) : null}
      </p>
      <p className="hidden text-right text-body text-text-primary tnum lg:block">
        {item.unitPriceGbp != null ? gbp(item.unitPriceGbp) : '—'}
      </p>
      <div className="flex shrink-0 items-center gap-3 lg:contents">
        {item.status ? (
          <Badge
            variant={item.status === 'filled' ? 'success' : 'neutral'}
            className="lg:justify-self-end"
          >
            {STATUS_LABEL[item.status] ?? item.status}
          </Badge>
        ) : null}
        <span className="text-meta text-text-muted tnum lg:justify-self-end">
          {timeAgo(item.timestamp)}
        </span>
      </div>
    </li>
  );
}
