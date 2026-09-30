'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import type { Distribution } from '@/lib/contracts/coown';
import { distributionKindLabel, gbp } from '../format';

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
  const paysIso = upcoming && !d.paidAt ? d.projectedPayableDate ?? d.scheduledFor : null;
  const pays = stageDate(paysIso);
  const paid = stageDate(d.paidAt);
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

export function DistributionCalendar({
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
