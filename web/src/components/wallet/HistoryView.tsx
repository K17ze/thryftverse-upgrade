'use client';

/**
 * History surface — the canonical wallet Activity destination, mirroring
 * mobile's WalletHistoryScreen: one ledger, filter chips, running balance,
 * and a real client-side CSV export of the rows currently shown. Loads in
 * pages of twelve with a quiet load-more affordance.
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { formatPrice } from '@/lib/utils/format';
import { LedgerList } from './LedgerList';
import { useWalletData } from './useWalletData';
import {
  buildLedger,
  filterLedger,
  LEDGER_FILTERS,
  LEDGER_PAGE_SIZE,
  netOf,
  ledgerToCsv,
  type LedgerFilter,
} from './ledgerViewModel';

function HistorySkeleton() {
  return (
    <div aria-busy aria-label="Loading activity">
      <div className="flex items-center gap-1 px-2 pt-1 sm:px-4">
        <Skeleton className="h-11 w-11 rounded-full" />
        <Skeleton className="h-7 w-28" />
      </div>
      <div className="mt-6 flex items-center justify-between px-4 sm:px-6">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-9 w-28 rounded-md" />
      </div>
      <div className="mt-5 flex gap-2 px-4 sm:px-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-20 rounded-full" />
        ))}
      </div>
      <div className="mt-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3.5 border-b border-border-subtle px-4 py-3.5 sm:px-6">
            <Skeleton className="h-9 w-9 rounded-full" />
            <Skeleton className="h-4 flex-1" style={{ maxWidth: `${55 - i * 6}%` }} />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function HistoryView() {
  const router = useRouter();
  const { show } = useToast();
  const { data, isLoading, isError, refetch } = useWalletData();

  const [filter, setFilter] = useState<LedgerFilter>('all');
  const [visibleCount, setVisibleCount] = useState(LEDGER_PAGE_SIZE);

  const ledger = useMemo(
    () => (data ? buildLedger(data.session, data.available) : []),
    [data],
  );
  const filtered = useMemo(() => filterLedger(ledger, filter), [ledger, filter]);
  const visible = filtered.slice(0, visibleCount);
  const net = netOf(filtered);

  const exportCsv = () => {
    const csv = ledgerToCsv(filtered);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `thryftverse-activity-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    show(`Exported ${filtered.length} transaction${filtered.length === 1 ? '' : 's'}`, 'success');
  };

  if (isLoading) return <HistorySkeleton />;

  if (isError || !data) {
    return (
      <EmptyState
        icon="wallet"
        title="Activity unavailable"
        subtitle="We couldn't load your transactions. Check your connection and try again."
        actionLabel="Retry"
        onAction={() => void refetch()}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl pb-16">
      <div className="flex items-center gap-1 px-2 pt-1 sm:px-4">
        <IconButton name="back" aria-label="Back to wallet" onClick={() => router.push('/wallet')} />
        <h1 className="text-screen-title font-semibold text-text-primary">Activity</h1>
      </div>
      <p className="mt-1 px-4 text-caption text-text-secondary sm:px-6">Wallet money movement</p>

      {/* Summary + export — flat row, no card */}
      <div className="mt-6 flex items-center justify-between gap-3 px-4 sm:px-6">
        <p className="text-body text-text-secondary">
          <span className="tnum font-semibold text-text-primary">{filtered.length}</span>{' '}
          transaction{filtered.length === 1 ? '' : 's'}
          {filtered.length > 0 ? (
            <>
              <span aria-hidden> · </span>
              <span className="tnum">
                Net {net >= 0 ? '+' : '−'}
                {formatPrice(Math.abs(net), 'GBP')}
              </span>
            </>
          ) : null}
        </p>
        <Button variant="secondary" size="sm" icon="download" onClick={exportCsv}>
          Export CSV
        </Button>
      </div>

      {/* Filter rail */}
      <div
        role="tablist"
        aria-label="Filter transactions"
        className="no-scrollbar mt-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:px-6"
      >
        {LEDGER_FILTERS.map((f) => (
          <Chip
            key={f.value}
            selected={filter === f.value}
            onClick={() => {
              setFilter(f.value);
              setVisibleCount(LEDGER_PAGE_SIZE);
            }}
            aria-label={`Show ${f.label.toLowerCase()}`}
          >
            {f.label}
          </Chip>
        ))}
      </div>

      <div className="mt-2">
        <LedgerList
          entries={visible}
          emptyTitle={
            filter === 'all'
              ? 'No transactions yet'
              : `No ${LEDGER_FILTERS.find((f) => f.value === filter)?.label.toLowerCase() ?? 'transactions'} yet`
          }
          emptySubtitle="Sales, purchases, top-ups and withdrawals will appear here."
        />
      </div>

      {visibleCount < filtered.length ? (
        <div className="mt-2 border-t border-border-subtle">
          <button
            type="button"
            onClick={() => setVisibleCount((c) => c + LEDGER_PAGE_SIZE)}
            className="pressable w-full py-4 text-body font-medium text-brand hover:opacity-80"
          >
            Load {Math.min(LEDGER_PAGE_SIZE, filtered.length - visibleCount)} more
          </button>
        </div>
      ) : null}

      <p className="mt-10 flex items-center gap-1.5 px-4 text-caption text-text-muted sm:px-6">
        <Icon name="info" size={14} className="shrink-0" />
        Fixture mode — balances are reconstructed from sample data. The export downloads
        every row matching the current filter.
      </p>
    </div>
  );
}
