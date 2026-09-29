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
import { Skeleton } from '@/components/ui/Skeleton';
import { Switch } from '@/components/settings/Switch';
import { useToast } from '@/components/ui/Toast';
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
import type { Distribution, DistributionReceipt } from '@/lib/contracts/coown';
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
  // The raw distribution rows — the calendar's source. For the signed-in
  // viewer these are per-recipient rows carrying the record/ex/projected
  // stage dates; guests never reach this branch (the wall returns early).
  const distributionsQ = useDistributions();
  const positionsQ = useCoOwnPositions();
  const dripQ = useDripEnrollments();
  const setDrip = useSetDripEnrollment();

  const loading =
    sessionLoading || assetsQ.isLoading || receiptsQ.isLoading || distributionsQ.isLoading;

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
  // DRIP applies only where a payout can exist: a held asset with at
  // least one distribution row on the wire (settled or scheduled).
  // Same gate OwnershipTab applies per-asset — enrolment on a market
  // that has never published a distribution is a dead toggle.
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

      {/* Distribution calendar — record / ex / payable stage dates grouped
          upcoming vs past. Reads the raw per-recipient rows (not receipts):
          a scheduled distribution appears here before it's owed, which is
          exactly what a calendar is for. Only dates the wire carries get a
          chip. */}
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

// ── Calendar ──────────────────────────────────────────────────────────
// Upcoming = the wire status is still scheduled/pending; everything
// else (settled, reversed, reinvested, …) is history. Stage chips render
// only when that date is present on the row — a distribution with no
// record date simply shows none.

function stageDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

function CalendarRow({ d, title }: { d: Distribution; title: string }) {
  const upcoming = d.status === 'scheduled' || d.status === 'pending';
  const record = stageDate(d.recordDate);
  const ex = stageDate(d.exDate);
  // For unpaid rows the payable date is the projection (or the derived
  // scheduledFor); once settled the paid date speaks instead.
  const paysIso = upcoming && !d.paidAt ? d.projectedPayableDate ?? d.scheduledFor : null;
  const pays = stageDate(paysIso);
  const paid = stageDate(d.paidAt);
  // One badge only where it earns it: a payable date already past on a
  // row still claiming scheduled/pending is late — everything else is
  // quiet text, not chrome.
  const paysOverdue = paysIso != null && Date.parse(paysIso) < Date.now();
  const stages = [
    record ? `Record ${record}` : null,
    ex ? `Ex ${ex}` : null,
    pays ? `Pays ${pays}` : null,
    paid ? `Paid ${paid}` : null,
  ].filter((s): s is string => s != null);
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-1 py-3">
      <div className="min-w-0">
        <Link
          href={`/co-own/${d.assetId}`}
          className="pressable clamp-1 block text-body font-semibold text-text-primary"
        >
          {title}
        </Link>
        <p className="mt-0.5 text-meta text-text-muted tnum">
          {distributionKindLabel(d)} · {gbp(d.amountPerUnitGbp)}/unit
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-x-2 gap-y-1">
        {stages.length > 0 ? (
          <p className="text-meta text-text-muted tnum">{stages.join(' · ')}</p>
        ) : null}
        {paysOverdue ? <Badge variant="warning">Overdue</Badge> : null}
      </div>
    </li>
  );
}

function DistributionCalendar({
  items,
  titleFor,
}: {
  items: Distribution[];
  titleFor: (assetId: string) => string;
}) {
  if (items.length === 0) return null;

  const upcoming = items
    .filter((d) => d.status === 'scheduled' || d.status === 'pending')
    .sort((a, b) => Date.parse(a.scheduledFor) - Date.parse(b.scheduledFor));
  const past = items
    .filter((d) => d.status !== 'scheduled' && d.status !== 'pending')
    .sort(
      (a, b) =>
        Date.parse(b.paidAt ?? b.scheduledFor) - Date.parse(a.paidAt ?? a.scheduledFor),
    );

  return (
    <section aria-labelledby="calendar-heading" className="mt-8">
      <h2 id="calendar-heading" className="text-section-title font-semibold text-text-primary">
        Calendar
      </h2>
      {upcoming.length > 0 ? (
        <>
          <h3 className="mt-4 text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">
            Upcoming
          </h3>
          <ul className="mt-1 divide-y divide-border-subtle border-b border-border-subtle">
            {upcoming.map((d) => (
              <CalendarRow key={d.id} d={d} title={titleFor(d.assetId)} />
            ))}
          </ul>
        </>
      ) : null}
      {past.length > 0 ? (
        <>
          <h3 className="mt-4 text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">
            Past
          </h3>
          <ul className="mt-1 divide-y divide-border-subtle border-b border-border-subtle">
            {past.map((d) => (
              <CalendarRow key={d.id} d={d} title={titleFor(d.assetId)} />
            ))}
          </ul>
        </>
      ) : null}
    </section>
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
