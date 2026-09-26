'use client';

import { Badge } from '@/components/ui/Badge';
import type { Distribution } from '@/lib/contracts/coown';
import { formatDate } from '@/lib/utils/format';
import { gbp } from './format';

const KIND_LABEL = {
  rental_income: 'Rental income',
  resale_gain: 'Resale gain',
  licensing: 'Licensing',
} as const;

/** Distributions history — paid and scheduled income, one quiet rail. */
export function DistributionsTable({
  distributions,
  assetTitle,
}: {
  distributions: Distribution[];
  assetTitle: (assetId: string) => string;
}) {
  return (
    <section aria-labelledby="distributions-heading">
      <div className="flex items-baseline justify-between">
        <h2 id="distributions-heading" className="text-section-title font-semibold text-text-primary">
          Distributions
        </h2>
        <p className="text-meta text-text-muted tnum">{distributions.length} records</p>
      </div>

      {distributions.length === 0 ? (
        <p className="mt-4 text-body text-text-secondary">
          No distributions yet. Income lands here the moment an asset pays out.
        </p>
      ) : (
        <>
          <div className="mt-4 hidden gap-4 border-b border-border-subtle px-1 pb-2 text-micro font-semibold uppercase tracking-[0.08em] text-text-muted md:grid md:grid-cols-[minmax(0,1fr)_9rem_6.5rem_7rem_7rem]">
            <span>Asset</span>
            <span>Kind</span>
            <span className="text-right">Per unit</span>
            <span>Status</span>
            <span className="text-right">Date</span>
          </div>
          <ul className="divide-y divide-border-subtle">
            {distributions.map((d) => (
              <li key={d.id}>
                {/* Mobile */}
                <div className="flex items-start justify-between gap-3 py-4 md:hidden">
                  <div className="min-w-0">
                    <p className="clamp-1 text-body-emphasis font-semibold text-text-primary">
                      {assetTitle(d.assetId)}
                    </p>
                    <p className="mt-0.5 text-meta text-text-secondary">{KIND_LABEL[d.kind]}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-body-emphasis text-text-primary tnum">{gbp(d.amountPerUnitGbp)}</p>
                    <Badge variant={d.status === 'paid' ? 'success' : 'warning'} className="mt-1">
                      {d.status === 'paid' ? 'Paid' : 'Scheduled'}
                    </Badge>
                  </div>
                </div>
                {/* Desktop */}
                <div className="hidden items-center gap-4 px-1 py-3.5 md:grid md:grid-cols-[minmax(0,1fr)_9rem_7rem_7rem_7rem]">
                  <p className="clamp-1 text-body-emphasis font-semibold text-text-primary">{assetTitle(d.assetId)}</p>
                  <p className="text-body text-text-secondary">{KIND_LABEL[d.kind]}</p>
                  <p className="text-body text-text-primary tnum">{gbp(d.amountPerUnitGbp)}</p>
                  <Badge variant={d.status === 'paid' ? 'success' : 'warning'}>
                    {d.status === 'paid' ? 'Paid' : 'Scheduled'}
                  </Badge>
                  <p className="text-right text-body text-text-secondary tnum">
                    {formatDate(d.paidAt ?? d.scheduledFor)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
