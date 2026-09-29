'use client';

/**
 * Step 7 — the recourse signature. The asset exists at 'preview' tier
 * and only becomes tradeable when the issuer signs the personal-
 * liability agreement (migration 101's consignment-with-recourse model):
 * the custodian keeps the physical item but is personally liable for
 * safeguarding it, proving authenticity on demand, producing it on
 * demand, and repaying the traded value if they fail. Signing is the
 * act that promotes the market to 'listed'.
 */

import type { CoOwnAsset } from '@/lib/contracts/coown';
import { gbp } from '../format';
import { RecourseTerms } from '../RecourseTerms';

interface RecourseStepProps {
  asset: CoOwnAsset;
  /** The custodied listing's title — falls back to the asset's own. */
  listingTitle: string;
  accepted: boolean;
  onAccept: (v: boolean) => void;
}

export function RecourseStep({ asset, listingTitle, accepted, onAccept }: RecourseStepProps) {
  const maxLiability = asset.totalUnits * asset.unitPriceGbp;
  return (
    <div className="flex flex-col gap-5">
      <div className="border-b border-border-subtle pb-4">
        <p className="text-body text-text-primary">
          <span className="font-semibold">{asset.title}</span> is created — one
          signature left before it can trade.
        </p>
        <p className="mt-1 text-meta text-text-secondary">
          {listingTitle} stays yours to custody, but you are personally liable
          for it: safeguard it, prove authenticity on demand, produce it on
          demand, and repay the traded value if you fail. The maximum liability
          is the full pool value —{' '}
          <span className="tnum font-medium text-text-primary">
            {gbp(maxLiability)}
          </span>{' '}
          ({asset.totalUnits} {asset.totalUnits === 1 ? 'unit' : 'units'} ×{' '}
          {gbp(asset.unitPriceGbp)}).
        </p>
      </div>

      <RecourseTerms asset={asset} accepted={accepted} onAccept={onAccept} />

      {!accepted ? (
        <p className="text-caption text-text-muted">
          The market stays unsigned and untradeable until you sign — you can
          finish this later from the asset page.
        </p>
      ) : null}
    </div>
  );
}
