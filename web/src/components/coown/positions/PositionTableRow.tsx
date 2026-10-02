'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Icon } from '@/components/ui/Icon';
import type { CandlePoint } from '@/lib/contracts/coown';
import { coOwnMarkGbp, deriveLifecycleState } from '@/lib/contracts/coown';
import { formatDate } from '@/lib/utils/format';
import { AssetThumb } from '../AssetThumb';
import { LifecycleTag } from '../LifecycleTag';
import { gbp, signedGbp, signedPct } from '../format';
import {
  GRID,
  activeLockup,
  formatOwnershipPct,
  issuerName,
  markDetail,
  ownershipPct,
  PositionSparkline,
  reservedUnits,
  type PositionRow,
} from './positionEnrichment';

interface PositionTableRowProps {
  row: PositionRow;
  candles: CandlePoint[];
}

export function PositionTableRow({ row, candles }: PositionTableRowProps) {
  const { position, asset, value, plGbp, plPct } = row;
  const up = plGbp >= 0;
  // The "last" column is the mark — the server projection's mark
  // when it reports one, else the last settled trade over the
  // issue price. Never the stale issuance print alone.
  const mark = position.markPriceGbp ?? coOwnMarkGbp(asset);
  const tone = up ? 'text-coown-up' : 'text-coown-down';
  // Halted/exiting holdings carry the tag — a live position doesn't
  // need the noise.
  const halted =
    deriveLifecycleState(asset) !== 'secondaryTrading' &&
    deriveLifecycleState(asset) !== 'initialOffering';
  // Live-projection enrichments — every one null-safe; fixture
  // positions carry none of these and the lines stay absent.
  const share = ownershipPct(position, asset);
  const reserved = reservedUnits(position);
  const lockup = activeLockup(position);
  const markMeta = markDetail(position);

  return (
    <li className="group relative transition-colors hover:bg-row">
      <Link
        href={`/co-own/${asset.id}`}
        className="absolute inset-0 z-0"
        aria-label={`Open ${asset.title} market`}
      />
      {/* Mobile */}
      <div className="pointer-events-none relative z-[1] py-4 md:hidden">
        <div className="flex items-start gap-3">
          <AssetThumb
            src={asset.imageUrl}
            alt=""
            className="h-12 w-12 shrink-0"
          />
          <div className="min-w-0 flex-1">
            <p className="clamp-1 text-body-emphasis font-semibold text-text-primary">
              {asset.title}
            </p>
            <p className="mt-0.5 text-meta text-text-secondary">
              <span className="clamp-1">{issuerName(asset)}</span>
              <span className="text-text-muted"> · </span>
              <span className="tnum">
                {position.units} units
                {share != null
                  ? ` · ${formatOwnershipPct(share)} of issue`
                  : ''}
              </span>
            </p>
            <p className="mt-0.5 text-meta text-text-muted tnum">
              avg {gbp(position.avgEntryPriceGbp)} · last {gbp(mark)}
              {markMeta ? (
                <span className="font-normal"> — {markMeta}</span>
              ) : null}
            </p>
            {reserved != null || lockup ? (
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2.5 text-meta text-text-secondary">
                {reserved != null ? (
                  <span className="tnum">{reserved} reserved</span>
                ) : null}
                {lockup ? (
                  <span className="inline-flex items-center gap-1">
                    <Icon name="lock" size={12} className="text-text-muted" />
                    Locked until {formatDate(lockup)}
                  </span>
                ) : null}
              </p>
            ) : null}
            {halted ? <LifecycleTag asset={asset} className="mt-1" /> : null}
          </div>
          <div className="shrink-0 text-right">
            <PositionSparkline
              candles={candles}
              assetTitle={asset.title}
            />
            <p className="mt-1 text-body-emphasis text-text-primary tnum">
              {gbp(value)}
            </p>
            <p className={`mt-0.5 text-meta font-semibold tnum ${tone}`}>
              {signedGbp(plGbp)} ({signedPct(plPct)})
            </p>
          </div>
        </div>
      </div>
      {/* Desktop */}
      <div
        className={`${GRID} pointer-events-none relative z-[1] items-center gap-4 px-1 py-3.5`}
      >
        <div className="flex min-w-0 items-center gap-3">
          <AssetThumb
            src={asset.imageUrl}
            alt=""
            className="h-10 w-10 shrink-0"
          />
          <div className="min-w-0">
            <p className="clamp-1 text-body-emphasis font-semibold text-text-primary">
              {asset.title}
            </p>
            <p className="clamp-1 flex items-center gap-1.5 text-meta text-text-secondary">
              <span className="truncate">{issuerName(asset)}</span>
              {share != null ? (
                <span className="shrink-0 text-text-muted tnum">
                  · {formatOwnershipPct(share)} of issue
                </span>
              ) : null}
              {lockup ? (
                <Badge
                  variant="warning"
                  icon="lock"
                  className="px-2 py-0.5 text-micro"
                >
                  Until {formatDate(lockup)}
                </Badge>
              ) : null}
              {halted ? <LifecycleTag asset={asset} /> : null}
            </p>
          </div>
        </div>
        <p className="text-right text-body text-text-primary tnum">
          {position.units}
          {reserved != null ? (
            <span className="block text-meta font-normal text-text-muted">
              {reserved} reserved
            </span>
          ) : null}
        </p>
        <p className="text-right text-body text-text-secondary tnum">
          {gbp(position.avgEntryPriceGbp)}
        </p>
        <p className="text-right text-body text-text-primary tnum">
          {gbp(mark)}
          {markMeta ? (
            <span className="block text-meta font-normal text-text-muted">
              {markMeta}
            </span>
          ) : null}
        </p>
        <p className="text-right text-body-emphasis text-text-primary tnum">
          {gbp(value)}
        </p>
        <p className={`text-right text-body-emphasis tnum ${tone}`}>
          {signedGbp(plGbp)}
          <span className="ml-1.5 text-meta text-text-secondary">
            {signedPct(plPct)}
          </span>
        </p>
        <div className="justify-self-end">
          <PositionSparkline
            candles={candles}
            assetTitle={asset.title}
          />
        </div>
      </div>
    </li>
  );
}
