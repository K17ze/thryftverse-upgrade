'use client';

/**
 * OverviewTab — about text derived from the asset record (no invented
 * facts), the key market stats, custody & provenance, and the fee note.
 */

import { Icon } from '@/components/ui/Icon';
import type { CoOwnAsset, DueDiligenceProfile } from '@/lib/contracts/coown';
import { gbpCompact } from '../format';
import { DueDiligenceSection } from './DueDiligenceSection';

export function OverviewTab({
  asset,
  diligence,
}: {
  asset: CoOwnAsset;
  diligence: DueDiligenceProfile | null | undefined;
}) {
  const marketCap = asset.totalUnits * asset.unitPriceGbp;

  const stats = [
    { label: 'Market cap', value: gbpCompact(marketCap) },
    { label: '24h volume', value: gbpCompact(asset.volume24hGbp) },
    { label: 'Holders', value: String(asset.holders) },
    {
      label: 'Available units',
      value: `${asset.availableUnits} of ${asset.totalUnits}`,
    },
  ];

  const provenance: { label: string; value: string | null }[] = [
    { label: 'Custody', value: asset.custodyNote },
    { label: 'Issuer location', value: asset.issuer.location },
    { label: 'Jurisdiction', value: asset.issuerJurisdiction },
    { label: 'Settlement', value: '1ZE — single-price clearing' },
  ];

  return (
    <div className="grid gap-10 lg:grid-cols-2">
      <div>
        <h3 className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">
          About
        </h3>
        <p className="mt-3 text-body leading-relaxed text-text-secondary">
          {asset.subtitle
            ? `${asset.title} — ${asset.subtitle.replace(' · ', ', ')}.`
            : `${asset.title}.`}{' '}
          {asset.custodyNote ?? 'Custody arrangements are confirmed at allocation.'}
        </p>

        <dl className="mt-6 divide-y divide-border-subtle border-y border-border-subtle">
          {provenance.map((row) =>
            row.value ? (
              <div key={row.label} className="flex items-baseline justify-between gap-6 py-3">
                <dt className="shrink-0 text-meta font-semibold uppercase tracking-[0.08em] text-text-muted">
                  {row.label}
                </dt>
                <dd className="text-right text-body text-text-primary">{row.value}</dd>
              </div>
            ) : null,
          )}
        </dl>

        <p className="mt-4 flex items-start gap-2 text-meta text-text-muted">
          <Icon name="info" size={14} className="mt-0.5 shrink-0" />
          A 1% platform fee applies to every Co-Own trade, added to buys and
          deducted from sale proceeds.
        </p>

        <DueDiligenceSection asset={asset} diligence={diligence} />
      </div>

      <div>
        <h3 className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">
          Key stats
        </h3>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-5">
          {stats.map((s) => (
            <div key={s.label}>
              <dd className="text-item-title font-semibold text-text-primary tnum">{s.value}</dd>
              <dt className="mt-0.5 text-meta text-text-secondary">{s.label}</dt>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
