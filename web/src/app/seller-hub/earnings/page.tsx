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
import { useSellerEarnings, useFulfilmentCounts } from '@/lib/hooks/seller-queries';
import { formatPrice, formatDate } from '@/lib/utils/format';

function csvCell(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function EarningsPage() {
  const { data, isLoading, isError, refetch } = useSellerEarnings();
  const counts = useFulfilmentCounts();
  const { show } = useToast();

  const downloadCsv = () => {
    if (!data) return;
    // Money cells carry the same £ formatting the screen shows — the
    // statement reads like the page, not like a different ledger.
    const header = 'Order,Item,Sold,Item price,Protection fee,Net proceeds,Releases';
    const rows = data.entries.map((e) =>
      [
        e.orderId,
        e.title,
        formatDate(e.soldAt),
        formatPrice(e.itemPrice),
        e.protectionFee != null ? formatPrice(e.protectionFee) : '—',
        e.net != null ? formatPrice(e.net) : '—',
        formatDate(e.releaseAt),
      ]
        .map(csvCell)
        .join(','),
    );
    const monthly = [
      'Monthly totals',
      'Month,Sales,Revenue',
      ...data.monthly.map((m) =>
        [m.label, m.orders, formatPrice(m.revenue)].map(csvCell).join(','),
      ),
    ];
    const payout = [
      'Payout',
      [
        'Next payout',
        data.schedule.nextAmount != null ? formatPrice(data.schedule.nextAmount) : '—',
        data.schedule.nextDate ? formatDate(data.schedule.nextDate) : '—',
      ]
        .map(csvCell)
        .join(','),
      // A fixture destination is labelled on the statement too — the CSV
      // is the same truth as the screen, never a cleaner version of it.
      [
        'Method',
        data.schedule.method
          ? `${data.schedule.method}${data.schedule.methodIsDemo ? ' (demo)' : ''}`
          : '—',
      ]
        .map(csvCell)
        .join(','),
      ['Available', formatPrice(data.schedule.available)].map(csvCell).join(','),
      ['Pending clearance', formatPrice(data.schedule.pendingTotal)].map(csvCell).join(','),
    ];
    const csv = [header, ...rows, '', ...monthly, '', ...payout].join('\n');
    // BOM keeps £ rendering correctly in Excel/Numbers.
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
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
      <SellerSectionNav toPost={counts.toPost} posted={counts.posted} />

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
          {/* Next payout — the dominant figure, flat. Live mode may know
              the scheduled date without the amount (or nothing at all) —
              render exactly what the server said, never an invented £0. */}
          <section aria-label="Next payout" className="mt-8">
            <p className="text-label font-semibold uppercase tracking-wider text-text-muted">
              Next payout
            </p>
            {data.schedule.nextAmount != null ? (
              <>
                <p className="tnum mt-2 text-display font-bold tracking-tight text-text-primary">
                  {formatPrice(data.schedule.nextAmount)}
                </p>
                <p className="mt-2 text-body text-text-secondary">
                  {[
                    data.schedule.nextDate ? formatDate(data.schedule.nextDate) : null,
                    data.schedule.method
                      ? `${data.schedule.method}${data.schedule.methodIsDemo ? ' (demo)' : ''}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </>
            ) : (
              <p className="mt-2 text-body text-text-secondary">
                {data.schedule.nextDate
                  ? `Scheduled for ${formatDate(data.schedule.nextDate)} — the amount confirms when clearance completes.`
                  : 'Nothing scheduled yet — your proceeds land here once a sale clears.'}
              </p>
            )}
            <Button
              variant="secondary"
              size="sm"
              icon="download"
              className="mt-4"
              onClick={downloadCsv}
            >
              Download statement
            </Button>
            <p className="mt-2.5 text-meta text-text-muted">
              CSV is generated on this device from your payout ledger.
            </p>
            {data.schedule.methodIsDemo ? (
              <p className="mt-1.5 text-meta text-text-muted">
                Demo mode — the payout destination is a placeholder; no bank account is
                connected in this preview.
              </p>
            ) : null}
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
              <>
                <ul className="mt-3 divide-y divide-border-subtle border-y border-border-subtle">
                  {data.entries.map((e) => (
                    <li key={e.id} className="flex items-center gap-3.5 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="clamp-1 text-body-emphasis font-medium text-text-primary">
                          {e.title}
                        </p>
                        <p className="tnum mt-0.5 text-meta text-text-muted">
                          Sold {formatDate(e.soldAt)}
                          {e.protectionFee != null
                            ? ` · protection −${formatPrice(e.protectionFee)}`
                            : ''}{' '}
                          · releases {formatDate(e.releaseAt)}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="tnum text-body-emphasis font-semibold text-text-primary">
                          {e.net != null ? formatPrice(e.net) : '—'}
                        </p>
                        <p className="tnum text-meta text-text-muted">
                          {e.net != null ? `of ${formatPrice(e.itemPrice)}` : formatPrice(e.itemPrice)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
                {/* Sum ties back to the "Pending clearance" balance — the
                    breakdown and the ledger are one number, not two. */}
                <p className="tnum mt-2.5 text-right text-meta text-text-muted">
                  Total in clearance{' '}
                  <span className="font-semibold text-text-secondary">
                    {formatPrice(data.schedule.pendingTotal)}
                  </span>
                </p>
              </>
            )}
          </section>

          {/* Monthly totals */}
          <section aria-label="Monthly totals" className="mt-10">
            <h2 className="text-section-title font-semibold text-text-primary">Monthly totals</h2>
            {data.monthly.length === 0 ? (
              <p className="mt-3 text-body text-text-muted">No settled sales yet.</p>
            ) : null}
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
