'use client';

/**
 * The personal-liability recourse terms — shared verbatim between the
 * issue wizard's signing step and the asset page's preview-tier panel so
 * the same legal promise can never read two different ways.
 */

import type { CoOwnAsset } from '@/lib/contracts/coown';
import { gbp } from './format';
import { CheckRow } from './create/controls';

interface RecourseTermsProps {
  asset: CoOwnAsset;
  accepted: boolean;
  onAccept: (v: boolean) => void;
}

export function RecourseTerms({ asset, accepted, onAccept }: RecourseTermsProps) {
  const maxLiability = asset.totalUnits * asset.unitPriceGbp;
  return (
    <div className="flex flex-col gap-5">
      <dl className="flex flex-col gap-2 text-body">
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-text-secondary">You keep</dt>
          <dd className="text-right text-text-primary">Custody of the item</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-text-secondary">You promise</dt>
          <dd className="text-right text-text-primary">
            Safeguard · prove · produce · repay
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-4 border-t border-border-subtle pt-2">
          <dt className="text-text-secondary">Maximum liability</dt>
          <dd className="tnum text-right font-semibold text-text-primary">
            {gbp(maxLiability)}
          </dd>
        </div>
      </dl>

      <CheckRow
        checked={accepted}
        onChange={onAccept}
        label="I accept the personal-liability recourse agreement"
      />
    </div>
  );
}
