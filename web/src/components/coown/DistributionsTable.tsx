'use client';

import { Badge } from '@/components/ui/Badge';
import type { DistributionReceipt } from '@/lib/contracts/coown';
import { formatDate } from '@/lib/utils/format';
import { distributionKindLabel, distributionStatusLabel, distributionStatusVariant, gbp } from './format';

/**
 * Income receipts — what the viewer was actually paid (or is owed), one
 * line per distribution they were entitled to: units held on the ex-date
 * snapshot × the per-unit rate, with the total that lands in the wallet.
 * Market-level pot sizes belong on the asset page, not the portfolio.
 */
export function DistributionsTable({
  receipts,
  assetTitle,
}: {
  receipts: DistributionReceipt[];
  assetTitle: (assetId: string) => string;
}) {
  return (
    <section aria-labelledby="distributions-heading">
      <div className="flex items-baseline justify-between">
        <h2 id="distributions-heading" className="text-section-title font-semibold text-text-primary">
          Distributions
        </h2>
        <p className="text-meta text-text-muted tnum">
          {receipts.length} {receipts.length === 1 ? 'receipt' : 'receipts'}
        </p>
      </div>

      {receipts.length === 0 ? (
        <p className="mt-4 text-body text-text-secondary">
          No distributions yet. Income lands here the moment an asset you hold pays out.
        </p>
      ) : (
        <>
          <div className="mt-4 hidden gap-4 border-b border-border-subtle px-1 pb-2 text-micro font-semibold uppercase tracking-[0.08em] text-text-muted md:grid md:grid-cols-[minmax(0,1fr)_8rem_9rem_6.5rem_6rem_7rem]">
            <span>Asset</span>
            <span>Kind</span>
            <span className="text-right">Units × rate</span>
            <span className="text-right">Total</span>
            <span>Status</span>
            <span className="text-right">Date</span>
          </div>
          <ul className="divide-y divide-border-subtle">
            {receipts.map((r) => (
              <li key={r.id}>
                {/* Mobile */}
                <div className="flex items-start justify-between gap-3 py-4 md:hidden">
                  <div className="min-w-0">
                    <p className="clamp-1 text-body-emphasis font-semibold text-text-primary">
                      {assetTitle(r.assetId)}
                    </p>
                    <p className="mt-0.5 text-meta text-text-secondary tnum">
                      {distributionKindLabel(r)} · {r.unitsHeld} {r.unitsHeld === 1 ? 'unit' : 'units'} × {gbp(r.amountPerUnitGbp)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-body-emphasis text-text-primary tnum">{gbp(r.totalGbp)}</p>
                    <Badge variant={distributionStatusVariant(r.status)} className="mt-1">
                      {distributionStatusLabel(r.status)}
                    </Badge>
                  </div>
                </div>
                {/* Desktop */}
                <div className="hidden items-center gap-4 px-1 py-3.5 md:grid md:grid-cols-[minmax(0,1fr)_8rem_9rem_6.5rem_6rem_7rem]">
                  <p className="clamp-1 text-body-emphasis font-semibold text-text-primary">{assetTitle(r.assetId)}</p>
                  <p className="text-body text-text-secondary">{distributionKindLabel(r)}</p>
                  <p className="text-right text-body text-text-secondary tnum">
                    {r.unitsHeld} × {gbp(r.amountPerUnitGbp)}
                  </p>
                  <p className="text-right text-body text-text-primary tnum">{gbp(r.totalGbp)}</p>
                  <Badge variant={distributionStatusVariant(r.status)}>
                    {distributionStatusLabel(r.status)}
                  </Badge>
                  <p className="text-right text-body text-text-secondary tnum">
                    {formatDate(r.paidAt ?? r.exDate)}
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
