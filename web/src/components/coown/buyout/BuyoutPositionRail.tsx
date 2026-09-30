'use client';

import type { CoOwnAsset } from '@/lib/contracts/coown';
import { coOwnMarkGbp } from '@/lib/contracts/coown';
import { AssetThumb } from '../AssetThumb';
import { gbp } from '../format';
import { Row } from './BuyoutPrimitives';

interface BuyoutPositionRailProps {
  asset: CoOwnAsset;
  viewerUnits: number;
  ownershipPct: number | null;
  remainingUnits: number;
}

export function BuyoutPositionRail({
  asset,
  viewerUnits,
  ownershipPct,
  remainingUnits,
}: BuyoutPositionRailProps) {
  return (
    <aside className="min-w-0 lg:order-2 lg:col-start-2">
      {/* Asset context */}
      <div className="mt-6 flex items-center gap-3.5 border-b border-border-subtle pb-5 lg:mt-0">
        <AssetThumb src={asset.imageUrl} alt={asset.title} className="w-14" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-body font-semibold text-text-primary">{asset.title}</p>
          <p className="mt-0.5 text-meta text-text-muted tnum">
            {gbp(coOwnMarkGbp(asset))} / unit · {asset.totalUnits.toLocaleString()} units
          </p>
        </div>
      </div>

      {/* Position summary — flat hairline rows */}
      <section aria-label="Your position" className="mt-4">
        <Row
          label="Your units"
          value={`${viewerUnits.toLocaleString()} / ${asset.totalUnits.toLocaleString()}`}
        />
        <Row label="Ownership" value={ownershipPct != null ? `${ownershipPct.toFixed(1)}%` : '—'} />
        <Row label="Remaining" value={`${remainingUnits.toLocaleString()} units`} last />
      </section>
    </aside>
  );
}
