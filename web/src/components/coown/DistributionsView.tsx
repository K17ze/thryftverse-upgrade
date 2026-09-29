'use client';

/**
 * /co-own/distributions — the full income history across holdings.
 * Port of the mobile DistributionHistoryScreen: a YTD strip, then the
 * receipts table (asset, per-unit, units held, total, ex-date, paid,
 * status). All numbers derive from the shared coown fixtures.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Switch } from '@/components/settings/Switch';
import { useToast } from '@/components/ui/Toast';
import { DATA_MODE } from '@/lib/api/client';
import {
  useCoOwnAssets,
  useCoOwnPositions,
  useDistributionReceipts,
  useDripEnrollments,
  useSetDripEnrollment,
} from '@/lib/hooks/coown-queries';
import { useSession } from '@/lib/session/SessionProvider';
import type { DistributionReceipt } from '@/lib/contracts/coown';
import { distributionKindLabel, distributionStatusLabel, distributionStatusVariant, gbp } from './format';

function shortDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function DistributionsView() {
  const router = useRouter();
  const { isGuest, sessionLoading } = useSession();
  const { show } = useToast();
  const assetsQ = useCoOwnAssets();
  const receiptsQ = useDistributionReceipts();
  const positionsQ = useCoOwnPositions();
  const dripQ = useDripEnrollments();
  const setDrip = useSetDripEnrollment();

  const loading = sessionLoading || assetsQ.isLoading || receiptsQ.isLoading;

  // Income receipts are account-bound — guests sign in rather than read
  // the demo identity's distribution history.
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
        <div className="skeleton h-8 w-52 rounded-sm" aria-hidden="true" />
        <div className="mt-8 grid grid-cols-3 gap-6" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-12 rounded-sm" />
          ))}
        </div>
        <div className="mt-10 space-y-1.5" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton h-12 rounded-sm" />
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
  // DRIP applies to assets the viewer actually holds — the enrolment
  // list alone would show toggles for assets with no position.
  const heldAssetIds = new Set(
    (positionsQ.data ?? []).filter((p) => p.units > 0).map((p) => p.assetId),
  );
  const dripAssets = (assetsQ.data ?? []).filter((a) => heldAssetIds.has(a.id));
  const dripByAsset = new Map((dripQ.data ?? []).map((e) => [e.assetId, e.enrolled]));
  // Fixture-anchored "now": the newest ex-date defines the current year.
  const year = receipts.length > 0 ? new Date(receipts[0]!.exDate).getFullYear() : new Date().getFullYear();
  // 'settled' is the wire's paid-out state (fixture 'paid' accepted too
  //  for legacy session rows); 'pending' waits alongside 'scheduled'.
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

      {/* DRIP — per-asset reinvestment enrolment. Live-mode control:
          enrolment is a server-side flag, so fixture mode renders nothing
          rather than a toggle that can't act. */}
      {DATA_MODE === 'live' && dripAssets.length > 0 ? (
        <section aria-labelledby="drip-heading" className="mt-8">
          <h2
            id="drip-heading"
            className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted"
          >
            Reinvest income (DRIP)
          </h2>
          <p className="mt-1 text-meta text-text-secondary">
            Distributions on enrolled markets buy more units automatically.
          </p>
          <ul className="mt-3 divide-y divide-border-subtle border-y border-border-subtle">
            {dripAssets.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <Link
                    href={`/co-own/${a.id}`}
                    className="pressable clamp-1 block text-body font-semibold text-text-primary"
                  >
                    {a.title}
                  </Link>
                  <p className="mt-0.5 text-meta text-text-muted">
                    {dripByAsset.get(a.id) ? 'Enrolled — payouts buy units' : 'Payouts settle to 1ZE'}
                  </p>
                </div>
                <Switch
                  checked={dripByAsset.get(a.id) ?? false}
                  onChange={(enrolled) => {
                    void setDrip(a.id, enrolled).then((ok) =>
                      show(
                        ok
                          ? enrolled
                            ? `${a.title} enrolled — next payout reinvests`
                            : `${a.title} unenrolled — payouts settle to 1ZE`
                          : "Couldn't update reinvestment — try again",
                        ok ? 'success' : 'error',
                      ),
                    );
                  }}
                  aria-label={`Reinvest income for ${a.title}`}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

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

function ReceiptRow({ receipt: r, title }: { receipt: DistributionReceipt; title: string }) {
  return (
    <li>
      {/* Mobile — stacked */}
      <div className="flex items-start justify-between gap-3 py-4 md:hidden">
        <div className="min-w-0">
          <Link
            href={`/co-own/${r.assetId}`}
            className="pressable clamp-1 block text-body-emphasis font-semibold text-text-primary"
          >
            {title}
          </Link>
          <p className="mt-0.5 text-meta text-text-secondary">{distributionKindLabel(r)}</p>
          <p className="mt-1.5 text-meta text-text-muted tnum">
            {r.unitsHeld} units @ {gbp(r.amountPerUnitGbp)} · ex {shortDate(r.exDate)}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-body-emphasis font-semibold text-text-primary tnum">{gbp(r.totalGbp)}</p>
          <Badge variant={distributionStatusVariant(r.status)} className="mt-1">
            {r.status === 'settled' || r.status === 'paid'
              ? `Paid ${shortDate(r.paidAt)}`
              : distributionStatusLabel(r.status)}
          </Badge>
        </div>
      </div>

      {/* Desktop — grid row */}
      <div className="hidden items-center gap-4 px-1 py-3.5 md:grid md:grid-cols-[minmax(0,1fr)_6.5rem_5rem_6rem_7rem_7rem_6.5rem]">
        <div className="min-w-0">
          <Link
            href={`/co-own/${r.assetId}`}
            className="pressable clamp-1 block text-body-emphasis font-semibold text-text-primary"
          >
            {title}
          </Link>
          <p className="mt-0.5 text-meta text-text-muted">{distributionKindLabel(r)}</p>
        </div>
        <p className="text-right text-body text-text-primary tnum">{gbp(r.amountPerUnitGbp)}</p>
        <p className="text-right text-body text-text-secondary tnum">{r.unitsHeld}</p>
        <p className="text-right text-body font-semibold text-text-primary tnum">{gbp(r.totalGbp)}</p>
        <p className="text-right text-body text-text-secondary tnum">{shortDate(r.exDate)}</p>
        <p className="text-right text-body text-text-secondary tnum">{shortDate(r.paidAt)}</p>
        <p className="text-right">
          <Badge variant={distributionStatusVariant(r.status)}>
            {distributionStatusLabel(r.status)}
          </Badge>
        </p>
      </div>
    </li>
  );
}
