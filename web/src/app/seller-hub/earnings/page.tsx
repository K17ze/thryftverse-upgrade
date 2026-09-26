'use client';

/**
 * /seller-hub/earnings — payout schedule, per-order breakdown and monthly
 * totals. The buyer-protection deduction reuses the shared commerce helper
 * (5% + £0.70). "Download statement" builds a CSV client-side via Blob —
 * an honest local export, no server claims.
 */

import { SellerSectionNav } from '@/components/seller/SellerSectionNav';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { useSellerEarnings } from '@/lib/hooks/seller-queries';
import { formatPrice, formatDate } from '@/lib/utils/format';

function csvCell(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function EarningsPage() {
  const { data, isLoading, isError, refetch } = useSellerEarnings();
  const { show } = useToast();

  const downloadCsv = () => {
    if (!data) return;
    const header = 'Order,Item,Sold,Item price,Protection fee,Net proceeds,Releases';
    const rows = data.entries.map((e) =>
      [
        e.orderId,
        e.title,
        formatDate(e.soldAt),
        e.itemPrice.toFixed(2),
        e.protectionFee.toFixed(2),
        e.net.toFixed(2),
        formatDate(e.releaseAt),
      ]
        .map(csvCell)
        .join(','),
    );
    const monthly = ['Monthly totals', ...data.monthly.map((m) => `${m.label},${m.orders},${m.revenue.toFixed(2)}`)];
    const csv = [header, ...rows, '', ...monthly].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `thryftverse-earnings-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    show('Earnings statement downloaded', 'success');
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-8 sm:px-6 md:pt-12">
      <h1 className="text-screen-title font-semibold text-text-primary">Earnings</h1>
      <SellerSectionNav />

      {isLoading ? (
        <div aria-busy aria-label="Loading earnings">
          <Skeleton className="mt-8 h-3 w-24" />
          <Skeleton className="mt-3 h-10 w-40" />
          <div className="mt-8 space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </div>
      ) : isError || !data ? (
        <EmptyState
          icon="payout"
          title="Couldn't load earnings"
          subtitle="We couldn't reach your payout ledger. Try again in a moment."
          actionLabel="Retry"
          onAction={() => void refetch()}
        />
      ) : (
        <>
          {/* Next payout — the dominant figure, flat */}
          <section aria-label="Next payout" className="mt-8">
            <p className="text-label font-semibold uppercase tracking-wider text-text-muted">
              Next payout
            </p>
            <p className="tnum mt-2 text-display font-bold tracking-tight text-text-primary">
              {formatPrice(data.schedule.nextAmount)}
            </p>
            <p className="mt-2 text-body text-text-secondary">
              {formatDate(data.schedule.nextDate)} · {data.schedule.method}
            </p>
            <Button
              variant="secondary"
              size="sm"
              icon="download"
              className="mt-4"
              onClick={downloadCsv}
            >
              Download statement
            </Button>
          </section>

          {/* Balances — flat hairline rows */}
          <section aria-label="Balances" className="mt-8">
            <dl className="divide-y divide-border-subtle border-y border-border-subtle">
              <div className="flex items-center justify-between py-3">
                <dt className="text-body text-text-secondary">Available</dt>
                <dd className="tnum text-body-emphasis font-semibold text-text-primary">
                  {formatPrice(data.schedule.available)}
                </dd>
              </div>
              <div className="flex items-center justify-between py-3">
                <dt className="text-body text-text-secondary">Pending clearance</dt>
                <dd className="tnum text-body-emphasis font-semibold text-text-primary">
                  {formatPrice(data.schedule.pendingTotal)}
                </dd>
              </div>
            </dl>
          </section>

          {/* Per-order breakdown */}
          <section aria-label="Earnings breakdown" className="mt-10">
            <h2 className="text-section-title font-semibold text-text-primary">
              Earnings breakdown
            </h2>
            {data.entries.length === 0 ? (
              <p className="mt-3 text-body text-text-muted">No proceeds in clearance.</p>
            ) : (
              <ul className="mt-3 divide-y divide-border-subtle border-y border-border-subtle">
                {data.entries.map((e) => (
                  <li key={e.id} className="flex items-center gap-3.5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="clamp-1 text-body-emphasis font-medium text-text-primary">
                        {e.title}
                      </p>
                      <p className="tnum mt-0.5 text-meta text-text-muted">
                        Sold {formatDate(e.soldAt)} · protection −{formatPrice(e.protectionFee)} · releases{' '}
                        {formatDate(e.releaseAt)}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="tnum text-body-emphasis font-semibold text-text-primary">
                        {formatPrice(e.net)}
                      </p>
                      <p className="tnum text-meta text-text-muted">of {formatPrice(e.itemPrice)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Monthly totals */}
          <section aria-label="Monthly totals" className="mt-10">
            <h2 className="text-section-title font-semibold text-text-primary">Monthly totals</h2>
            <ul className="mt-3 divide-y divide-border-subtle border-y border-border-subtle">
              {data.monthly.map((m) => (
                <li key={m.label} className="flex items-center justify-between py-3">
                  <span className="text-body text-text-secondary">{m.label}</span>
                  <span className="flex items-baseline gap-3">
                    <span className="tnum text-meta text-text-muted">{m.orders} sales</span>
                    <span className="tnum text-body-emphasis font-semibold text-text-primary">
                      {formatPrice(m.revenue)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
