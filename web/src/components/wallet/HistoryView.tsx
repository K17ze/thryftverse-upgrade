'use client';

/**
 * History surface — the canonical wallet Activity destination.
 * Mirrors mobile's WalletHistoryScreen and elevates to Polymarket/eBay standards:
 *  - Real-time search by keyword, item title, or reference ID
 *  - Category filter chips (All, Sales, Purchases, Deposits, Payouts, Fees, Conversions)
 *  - Date-range filter selector (All time, This month, Last 30 days, Last 90 days)
 *  - Summary metrics strip (Money In, Money Out, Net Movement)
 *  - Click-to-inspect TransactionDetailDrawer
 *  - Official CSV statement export
 * Flat canvas, hairline dividers, strict Anti-AI design.
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconButton } from '@/components/ui/IconButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { DATA_MODE } from '@/lib/api/client';
import type { WalletLedgerAssetFilter } from '@/lib/api/services/walletLedger';
import { useSession } from '@/lib/session/SessionProvider';
import { LedgerList } from './LedgerList';
import { TransactionDetailDrawer } from './TransactionDetailDrawer';
import { useWalletData, useWalletTransactions } from './useWalletData';
import {
  buildLedger,
  filterLedger,
  formatMonthLabel,
  LEDGER_PAGE_SIZE,
  netsByCurrency,
  ledgerToCsv,
  type LedgerFilter,
  type WalletLedgerEntry,
} from './ledgerViewModel';
import { HistoryMetricsStrip } from './history/HistoryMetricsStrip';
import { HistoryControls, type DateRangeFilter } from './history/HistoryControls';

/**
 * The current UTC month key ('2026-09') — ledger dates are ISO strings and
 * groupByMonth groups on the same slice, so this_month compares prefixes,
 * never a hard-coded literal.
 */
function currentMonthKey(): string {
  return new Date().toISOString().slice(0, 7);
}

function HistorySkeleton() {
  return (
    <div aria-busy aria-label="Loading activity" className="mx-auto w-full max-w-3xl lg:max-w-[1440px]">
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
  const { isGuest, sessionLoading } = useSession();
  const { data, isLoading, isError, refetch } = useWalletData();
  // Live mode reads the canonical wallet ledger — useWalletData only
  // carries the first window, the feed widens the limit on "load more"
  // (the endpoint paginates by limit alone). Disabled outside live mode
  // (the fixture ledger already ships whole inside useWalletData).
  const isLive = DATA_MODE === 'live';
  const [assetFilter, setAssetFilter] = useState<WalletLedgerAssetFilter>('ALL');
  const txQuery = useWalletTransactions(assetFilter);

  const [filter, setFilter] = useState<LedgerFilter>('all');
  const [dateRange, setDateRange] = useState<DateRangeFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(LEDGER_PAGE_SIZE);

  const [selectedEntry, setSelectedEntry] = useState<WalletLedgerEntry | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // "This month" is a live month key + label, not a pinned fixture date.
  const monthKey = useMemo(() => currentMonthKey(), []);
  const dateRangeOptions = useMemo(
    () =>
      [
        { value: 'all' as const, label: 'All time' },
        { value: 'this_month' as const, label: formatMonthLabel(monthKey) },
        { value: 'last_30' as const, label: 'Last 30 days' },
        { value: 'last_90' as const, label: 'Last 90 days' },
      ],
      [monthKey],
  );

  // Live rows come from the wallet_ledger feed; fixture rows ship inside
  // useWalletData. Session entries (demo top-ups/conversions) ride on top
  // in both modes via buildLedger.
  const transactions = useMemo(() => {
    if (isLive) {
      return txQuery.items;
    }
    return data?.transactions ?? [];
  }, [isLive, txQuery.items, data]);

  const fullLedger = useMemo(
    () => (data ? buildLedger(data.session, data.available, transactions) : []),
    [data, transactions],
  );

  // Multi-dimensional filtering: asset, type, date, search
  const filtered = useMemo(() => {
    // Asset rail — live mode refetches server-side with asset=...; the
    // client-side pass keeps fixture mode honest on the same grammar
    // (a 1ZE filter genuinely yields the token legs only).
    let result =
      assetFilter === 'ALL'
        ? fullLedger
        : fullLedger.filter((e) =>
            assetFilter === '1ZE' ? e.asset === '1ZE' : e.asset !== '1ZE',
          );

    result = filterLedger(result, filter);

    // Date range filter — real wall-clock now and the live month prefix.
    if (dateRange !== 'all') {
      const now = Date.now();
      result = result.filter((entry) => {
        const entryTime = new Date(entry.date).getTime();
        if (dateRange === 'this_month') {
          return entry.date.slice(0, 7) === monthKey;
        }
        if (dateRange === 'last_30') {
          return entryTime <= now && now - entryTime <= 30 * 24 * 60 * 60 * 1000;
        }
        if (dateRange === 'last_90') {
          return entryTime <= now && now - entryTime <= 90 * 24 * 60 * 60 * 1000;
        }
        return true;
      });
    }

    // Keyword search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (e) =>
          e.description.toLowerCase().includes(q) ||
          e.amount.toString().includes(q) ||
          e.kind.toLowerCase().includes(q),
      );
    }

    return result;
  }, [fullLedger, assetFilter, filter, dateRange, searchQuery, monthKey]);

  const visible = filtered.slice(0, visibleCount);

  // Financial volume metrics — grouped per currency.
  const moneyInByCurrency = useMemo(() => {
    const buckets = new Map<string, { currency: string; asset?: '1ZE' | 'FIAT'; total: number }>();
    for (const e of filtered) {
      if (e.amount <= 0) continue;
      const code = (e.currency ?? 'GBP').toUpperCase();
      const bucket = buckets.get(code) ?? { currency: code, asset: e.asset, total: 0 };
      bucket.total += e.amount;
      buckets.set(code, bucket);
    }
    return [...buckets.values()];
  }, [filtered]);

  const moneyOutByCurrency = useMemo(() => {
    const buckets = new Map<string, { currency: string; asset?: '1ZE' | 'FIAT'; total: number }>();
    for (const e of filtered) {
      if (e.amount >= 0) continue;
      const code = (e.currency ?? 'GBP').toUpperCase();
      const bucket = buckets.get(code) ?? { currency: code, asset: e.asset, total: 0 };
      bucket.total += Math.abs(e.amount);
      buckets.set(code, bucket);
    }
    return [...buckets.values()];
  }, [filtered]);

  const nets = useMemo(() => netsByCurrency(filtered), [filtered]);

  const handleSelectEntry = (entry: WalletLedgerEntry) => {
    setSelectedEntry(entry);
    setDrawerOpen(true);
  };

  // "Load more" reveals buffered rows first; once the loaded slice is
  // exhausted it widens the server-side window (limit grows, capped at
  // the endpoint's max).
  const localRemaining = filtered.length - visible.length;
  const canFetchMore = isLive && txQuery.hasMore;
  const showLoadMore = localRemaining > 0 || canFetchMore;
  const handleLoadMore = () => {
    if (localRemaining > 0) {
      setVisibleCount((c) => c + LEDGER_PAGE_SIZE);
      if (localRemaining <= LEDGER_PAGE_SIZE && canFetchMore && !txQuery.isFetchingMore) {
        txQuery.fetchMore();
      }
      return;
    }
    txQuery.fetchMore();
  };

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

  if (sessionLoading || isLoading || (isLive && txQuery.isLoading)) {
    return <HistorySkeleton />;
  }

  if (isGuest) {
    return (
      <EmptyState
        icon="wallet"
        title="Sign in to see your activity"
        subtitle="Your wallet transactions live behind your account."
        actionLabel="Sign in"
        onAction={() => router.push('/auth')}
      />
    );
  }

  if (isError || !data || (isLive && txQuery.isError)) {
    return (
      <EmptyState
        icon="wallet"
        title="Activity unavailable"
        subtitle="We couldn't load your transactions. Check your connection and try again."
        actionLabel="Retry"
        onAction={() => {
          void refetch();
          if (isLive) void txQuery.refetch();
        }}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl pb-16 lg:max-w-[1440px]">
      {/* Navigation header */}
      <div className="flex items-center gap-1 px-2 pt-1 sm:px-4 lg:px-6">
        <IconButton
          name="back"
          aria-label="Back to wallet"
          onClick={() => router.push('/wallet')}
        />
        <div>
          <h1 className="text-screen-title text-text-primary">Wallet Activity</h1>
          <p className="text-caption text-text-secondary">
            Official financial ledger &amp; statement movements
          </p>
        </div>
      </div>

      {/* Metrics Summary Strip (Polymarket / eBay financial standard) —
          flat hairline cells at lg. */}
      <HistoryMetricsStrip
        moneyInByCurrency={moneyInByCurrency}
        moneyOutByCurrency={moneyOutByCurrency}
        nets={nets}
        transactionCount={filtered.length}
      />

      {/* Filters + ledger — below lg they stack in document order; at lg
          the controls pin to a ~200px left rail (the settings grammar)
          and the ledger takes the fluid column. */}
      <div className="lg:mt-6 lg:grid lg:grid-cols-[200px_minmax(0,1fr)] lg:items-start lg:gap-10 lg:px-6 xl:gap-14">
        <HistoryControls
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          dateRangeOptions={dateRangeOptions}
          onExportCsv={exportCsv}
          assetFilter={assetFilter}
          onAssetFilterChange={(val) => {
            setAssetFilter(val);
            setVisibleCount(LEDGER_PAGE_SIZE);
          }}
          categoryFilter={filter}
          onCategoryFilterChange={(val) => {
            setFilter(val);
            setVisibleCount(LEDGER_PAGE_SIZE);
          }}
          visibleCount={visible.length}
          totalCount={filtered.length}
        />

        <div className="min-w-0">
          {/* Grouped Month Ledger with Click-to-Inspect */}
          <div className="mt-3 lg:mt-0">
            <LedgerList
              entries={visible}
              emptyTitle="No activity found"
              emptySubtitle="No movements match your current filters or search term."
              onSelectEntry={handleSelectEntry}
            />
          </div>

          {/* Load More Pagination — local reveal first, then a wider
              server window via the wallet ledger feed (live mode). */}
          {showLoadMore ? (
            <div className="mt-6 flex justify-center px-4 sm:px-6">
              <Button
                variant="secondary"
                size="md"
                onClick={handleLoadMore}
                disabled={txQuery.isFetchingMore}
              >
                {txQuery.isFetchingMore
                  ? 'Loading…'
                  : localRemaining > 0
                    ? `Load more transactions (${localRemaining} remaining)`
                    : 'Load more transactions'}
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      {/* Transaction Detail Slide-Over Drawer */}
      <TransactionDetailDrawer
        entry={selectedEntry}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}
