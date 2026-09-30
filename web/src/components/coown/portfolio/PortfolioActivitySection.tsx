'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { useMyMarketHistory } from '@/lib/hooks/coown-history-queries';
import type {
  MarketHistoryChannelFilter,
  MarketHistoryItem,
} from '@/lib/api/services/coownHistory';
import { timeAgo } from '@/lib/utils/format';
import { gbp } from '../format';
import { PortfolioSectionState } from './PortfolioSectionState';

const ACTION_LABEL: Record<MarketHistoryItem['action'], string> = {
  'buy-units': 'Bought units',
  'sell-units': 'Sold units',
  bid: 'Auction bid',
};

const HISTORY_STATUS: Record<
  string,
  { label: string; variant: 'success' | 'warning' | 'danger' | 'neutral' }
> = {
  open: { label: 'Open', variant: 'neutral' },
  partially_filled: { label: 'Part filled', variant: 'warning' },
  filled: { label: 'Filled', variant: 'success' },
  cancelled: { label: 'Cancelled', variant: 'neutral' },
  rejected: { label: 'Rejected', variant: 'danger' },
};

export function PortfolioActivitySection() {
  const [channel, setChannel] = useState<MarketHistoryChannelFilter>('all');
  const historyQ = useMyMarketHistory(channel);
  const items = useMemo(
    () => historyQ.data?.pages.flatMap((p) => p.items) ?? [],
    [historyQ.data],
  );

  // The Auctions chip only disappears once the complete 'all' read
  // proves the viewer has no auction rows — an unloaded tail can't
  // prove absence, so the chip stays until then. And a filter over a
  // provably empty history is meaningless chrome — the chips hide until
  // there's something to filter (a non-'all' selection keeps them so the
  // viewer can always get back to All).
  const historyComplete = historyQ.data != null && !historyQ.hasNextPage;
  const hasAuctionRows = items.some((i) => i.channel === 'auction');
  const showChips = channel !== 'all' || !historyComplete || items.length > 0;
  const showAuctionChip = channel !== 'all' || !historyComplete || hasAuctionRows;

  return (
    <section aria-labelledby="activity-heading" className="mt-10">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-3">
        <h2 id="activity-heading" className="text-section-title font-semibold text-text-primary">
          Your activity
        </h2>
        {showChips ? (
          <div className="flex gap-2" role="group" aria-label="Filter by channel">
            <Chip selected={channel === 'all'} onClick={() => setChannel('all')}>
              All
            </Chip>
            <Chip selected={channel === 'co-own'} onClick={() => setChannel('co-own')}>
              Co-Own
            </Chip>
            {showAuctionChip ? (
              <Chip selected={channel === 'auction'} onClick={() => setChannel('auction')}>
                Auctions
              </Chip>
            ) : null}
          </div>
        ) : null}
      </div>

      <PortfolioSectionState
        loading={historyQ.isLoading}
        error={historyQ.isError}
        onRetry={() => void historyQ.refetch()}
        hasRows={items.length > 0}
        empty={
          channel === 'auction'
            ? 'No auction bids yet — bids you place land here.'
            : channel === 'co-own'
              ? 'No co-own orders yet — orders you place land here.'
              : 'No market activity yet — co-own orders and auction bids land here.'
        }
      />

      {items.length > 0 ? (
        <>
          <ul className="mt-3 divide-y divide-border-subtle border-y border-border-subtle">
            {items.map((item) => {
              const href =
                item.channel === 'auction'
                  ? `/auctions/${item.referenceId}`
                  : `/co-own/${item.referenceId}`;
              const status = item.status ? HISTORY_STATUS[item.status] : null;
              return (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-1 py-3"
                >
                  <div className="min-w-0">
                    <p className="clamp-1 text-body font-semibold text-text-primary">
                      <Link href={href} className="pressable">
                        {item.note ?? (item.channel === 'auction' ? 'Auction' : 'Market')}
                      </Link>
                    </p>
                    <p className="mt-0.5 text-meta text-text-secondary tnum">
                      {ACTION_LABEL[item.action]}
                      {item.units != null
                        ? ` · ${item.units} ${item.units === 1 ? 'unit' : 'units'}${
                            item.unitPriceGbp != null ? ` @ ${gbp(item.unitPriceGbp)}` : ''
                          }`
                        : ''}
                      {item.status === 'partially_filled' && item.filledUnits != null
                        ? ` — ${item.filledUnits} filled`
                        : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-body text-text-primary tnum">{gbp(item.amountGbp)}</span>
                    {status ? <Badge variant={status.variant}>{status.label}</Badge> : null}
                    <span className="text-meta text-text-muted tnum">{timeAgo(item.timestamp)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
          {historyQ.hasNextPage || historyQ.isFetchingNextPage || historyQ.isFetchNextPageError ? (
            <div className="mt-4 flex justify-center pb-2">
              <Button
                variant="outline"
                size="sm"
                disabled={historyQ.isFetchingNextPage}
                onClick={() => void historyQ.fetchNextPage()}
              >
                {historyQ.isFetchingNextPage
                  ? 'Loading…'
                  : historyQ.isFetchNextPageError
                    ? 'Couldn’t load more — try again'
                    : 'Load more'}
              </Button>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
