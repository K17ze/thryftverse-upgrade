'use client';

import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import type { CoOwnAsset } from '@/lib/contracts/coown';
import { coOwnMarkGbp } from '@/lib/contracts/coown';
import { gbp } from '../format';
import { MovePill } from '../MovePill';

interface AssetMobileTradeDockProps {
  asset: CoOwnAsset;
  halted?: boolean;
  preview?: boolean;
  delisted?: boolean;
  isIssuer?: boolean;
  onOpenComposer: () => void;
}

export function AssetMobileTradeDock({
  asset,
  halted,
  preview,
  delisted,
  isIssuer,
  onOpenComposer,
}: AssetMobileTradeDockProps) {
  return (
    <div
      className="fixed inset-x-0 z-sticky border-t border-border-subtle bg-header/95 backdrop-blur-xl md:hidden"
      style={{ bottom: 'calc(68px + env(safe-area-inset-bottom))' }}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <p className="text-body-emphasis font-semibold text-text-primary tnum">
            {gbp(coOwnMarkGbp(asset))}
          </p>
          <MovePill pct={asset.marketMovePct24h} className="mt-0.5" />
        </div>
        {halted ? (
          <span className="inline-flex items-center gap-1.5 text-meta font-semibold text-warning-text">
            <Icon name="pause" size={16} />
            {asset.marketStatus === 'closed' ? 'Exit underway' : 'Paused'}
          </span>
        ) : preview ? (
          isIssuer ? (
            <Button onClick={onOpenComposer}>Sign</Button>
          ) : (
            <span className="text-meta font-semibold text-text-muted">
              Not live
            </span>
          )
        ) : delisted ? (
          <span className="text-meta font-semibold text-text-muted">
            Delisted
          </span>
        ) : (
          <Button onClick={onOpenComposer}>Trade</Button>
        )}
      </div>
    </div>
  );
}
