'use client';

/**
 * /co-own/distributions — the full income history across holdings.
 * Port of mobile DistributionHistoryScreen: YTD strip, calendar,
 * receipts table, and per-asset DRIP reinvestment.
 * Factored into domain subcomponents:
 * - DistributionCalendar: stage chips (record, ex, payable, paid)
 * - DistributionReceiptRow: stacked mobile & tabular desktop rows
 * - DripSection: live-mode automatic reinvestment controls
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { DATA_MODE } from '@/lib/api/client';
import {
  useCoOwnAssets,
  useCoOwnPositions,
  useDistributionReceipts,
  useDistributions,
  useDripEnrollments,
  useSetDripEnrollment,
} from '@/lib/hooks/coown-queries';
import { useSession } from '@/lib/session/SessionProvider';
import { gbp } from './format';
import { DistributionCalendar } from './distributions/DistributionCalendar';
import { ReceiptRow, shortDate } from './distributions/DistributionReceiptRow';
import { DripSection } from './distributions/DripSection';

export function DistributionsView() {
  const router = useRouter();
  const { isGuest, sessionLoading } = useSession();
  const assetsQ = useCoOwnAssets();
  const receiptsQ = useDistributionReceipts();
  const distributionsQ = useDistributions();
  const positionsQ = useCoOwnPositions();
  const dripQ = useDripEnrollments();
  const setDrip = useSetDripEnrollment();

  const loading =
    sessionLoading || assetsQ.isLoading || receiptsQ.isLoading || distributionsQ.isLoading;

  if (!loading && isGuest) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 pb-20 pt-8 sm:px-6 md:pt-10 lg:max-w-[1440px]">
        <EmptyState
          icon="payout"
          title="Sign in to see your income"
          subtitle="Distribution receipts are tied to your Co-Own holdings."
          actionLabel="Sign in"
          onAction={() => router.push('/auth')}
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 pb-20 pt-8 sm:px-6 md:pt-10 lg:max-w-[1440px]">
        <Skeleton className="h-8 w-52" />
        <div className="mt-8 grid grid-cols-3 gap-6" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
        <div className="mt-10 space-y-1.5" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      </div>
    );
  }

  if (assetsQ.isError || receiptsQ.isError || !receiptsQ.data) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <EmptyState
          icon="payout"
          title="Income history unavailable"
          subtitle="We couldn't load your distribution history. Check your connection and try again."
          actionLabel="Retry"
          onAction={() => {
            void assetsQ.refetch();
            void receiptsQ.refetch();
          }}
        />
      </div>
    );
  }

  const titleFor = (assetId: string) =>
    assetsQ.data?.find((a) => a.id === assetId)?.title ?? 'Unknown market';

  const receipts = receiptsQ.data;
  const heldAssetIds = new Set(
    (positionsQ.data ?? []).filter((p) => p.units > 0).map((p) => p.assetId),
  );
  const distributingIds = new Set(
    (distributionsQ.data?.items ?? []).map((d) => d.assetId),
  );
  const dripAssets = (assetsQ.data ?? []).filter(
    (a) => heldAssetIds.has(a.id) && distributingIds.has(a.id),
  );
  const dripByAsset = new Map((dripQ.data ?? []).map((e) => [e.assetId, e.enrolled]));

  const year = receipts.length > 0 ? new Date(receipts[0]!.exDate).getFullYear() : new Date().getFullYear();
  const ytd = receipts.filter(
    (r) =>
      (r.status === 'settled' || r.status === 'paid') &&
      new Date(r.exDate).getFullYear() === year,
  );
  const ytdTotal = ytd.reduce((s, r) => s + r.totalGbp, 0);
  const nextScheduled =
    receipts
      .filter((r) => r.status === 'scheduled' || r.status === 'pending')
      .sort((a, b) => Date.parse(a.exDate) - Date.parse(b.exDate))[0] ?? null;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-20 pt-8 sm:px-6 md:pt-10 lg:max-w-[1440px]">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <h1 className="text-editorial-display text-text-primary">Distributions</h1>
          <p className="mt-2 text-meta text-text-secondary">
            Income paid (and scheduled) across your Co-Own holdings
          </p>
        </div>
        <nav aria-label="Co-Own" className="flex items-center gap-5">
          <Link
            href="/co-own/portfolio"
            className="text-body font-medium text-text-secondary underline-offset-4 hover:text-text-primary hover:underline"
          >
            Portfolio
          </Link>
          <Link
            href="/co-own"
            className="text-body font-medium text-text-secondary underline-offset-4 hover:text-text-primary hover:underline"
          >
            Markets
          </Link>
        </nav>
      </header>

      {/* DRIP — per-asset reinvestment enrolment */}
      {DATA_MODE === 'live' && dripAssets.length > 0 ? (
        <DripSection
          dripAssets={dripAssets}
          dripByAsset={dripByAsset}
          onSetDrip={setDrip}
        />
      ) : null}

      {/* Distribution calendar */}
      {distributionsQ.isError ? (
        <div className="mt-8 flex items-center justify-between gap-4 border-y border-border-subtle py-4">
          <p className="text-body text-text-secondary">Couldn’t load the distribution calendar.</p>
          <button
            type="button"
            onClick={() => void distributionsQ.refetch()}
            className="pressable text-body font-semibold text-text-primary underline-offset-4 hover:underline"
          >
            Retry
          </button>
        </div>
      ) : (
        <DistributionCalendar
          items={distributionsQ.data?.items ?? []}
          titleFor={titleFor}
        />
      )}

      {receipts.length === 0 ? (
        <div className="mt-8 border-t border-border-subtle">
          <EmptyState
            icon="payout"
            title="No income yet"
            subtitle="When an asset you hold pays out, the receipt lands here — per-unit rate, units held and the paid date."
            actionLabel="Browse markets"
            onAction={() => router.push('/co-own')}
          />
        </div>
      ) : (
        <>
          {/* YTD strip — hairline-separated, no cards */}
          <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5 border-y border-border-subtle py-6 sm:grid-cols-3">
            <div>
              <dt className="text-meta text-text-secondary">Income {year} YTD</dt>
              <dd className="mt-1 text-item-title font-semibold text-text-primary tnum">
                {gbp(ytdTotal)}
              </dd>
            </div>
            <div>
              <dt className="text-meta text-text-secondary">Payments this year</dt>
              <dd className="mt-1 text-item-title font-semibold text-text-primary tnum">
                {ytd.length}
              </dd>
            </div>
            <div>
              <dt className="text-meta text-text-secondary">Next scheduled</dt>
              <dd className="mt-1 text-item-title font-semibold text-text-primary tnum">
                {nextScheduled ? (
                  <>
                    {gbp(nextScheduled.totalGbp)}
                    <span className="ml-1.5 text-meta font-normal text-text-muted">
                      {shortDate(nextScheduled.exDate)}
                    </span>
                  </>
                ) : (
                  '—'
                )}
              </dd>
            </div>
          </dl>

          {/* Receipts — desktop grid, stacked rows on mobile */}
          <section className="mt-8" aria-label="Income history">
            <div
              aria-hidden="true"
              className="hidden gap-4 border-b border-border-subtle px-1 pb-2 text-micro font-semibold uppercase tracking-[0.08em] text-text-muted md:grid md:grid-cols-[minmax(0,1fr)_6.5rem_5rem_6rem_7rem_7rem_6.5rem]"
            >
              <span>Asset</span>
              <span className="text-right">Per unit</span>
              <span className="text-right">Units</span>
              <span className="text-right">Total</span>
              <span className="text-right">Ex-date</span>
              <span className="text-right">Paid</span>
              <span className="text-right">Status</span>
            </div>

            <ul className="divide-y divide-border-subtle md:border-b md:border-border-subtle">
              {receipts.map((r) => (
                <ReceiptRow key={r.id} receipt={r} title={titleFor(r.assetId)} />
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
