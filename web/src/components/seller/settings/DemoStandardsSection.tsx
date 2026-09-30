'use client';

interface DemoStandardsSectionProps {
  standards: {
    averageShipTimeDays: number | null;
    ordersShipped: number;
    cancellationRate: number;
    returnCaseRate: null;
  };
}

export function DemoStandardsSection({ standards }: DemoStandardsSectionProps) {
  return (
    <div className="mt-3">
      <dl className="divide-y divide-border-subtle border-y border-border-subtle">
        <div className="flex items-center justify-between py-3">
          <dt className="text-body text-text-secondary">Average ship time</dt>
          <dd className="tnum text-body-emphasis font-semibold text-text-primary">
            {standards.averageShipTimeDays != null
              ? `${standards.averageShipTimeDays.toFixed(1)} days`
              : '—'}
          </dd>
        </div>
        <div className="flex items-center justify-between py-3">
          <dt className="text-body text-text-secondary">Orders shipped</dt>
          <dd className="tnum text-body-emphasis font-semibold text-text-primary">
            {standards.ordersShipped}
          </dd>
        </div>
        <div className="flex items-center justify-between py-3">
          <dt className="text-body text-text-secondary">Cancellation rate</dt>
          <dd className="tnum text-body-emphasis font-semibold text-text-primary">
            {(standards.cancellationRate * 100).toFixed(1)}%
          </dd>
        </div>
        <div className="flex items-center justify-between py-3">
          <dt className="text-body text-text-secondary">Return-case rate</dt>
          <dd className="tnum text-body-emphasis font-semibold text-text-primary">—</dd>
        </div>
      </dl>
      <p className="mt-2.5 text-meta text-text-muted">
        Demo mode — ship time and shipped count are computed from the sample fulfilment queue;
        return cases and the performer tier aren&apos;t measured here.
      </p>
    </div>
  );
}
