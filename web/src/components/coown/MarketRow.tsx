'use client';

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { usePriceHistory } from '@/lib/hooks/coown-queries';
import type { CoOwnAsset } from '@/lib/contracts/coown';
import { coOwnMarkGbp } from '@/lib/contracts/coown';
import { formatCount } from '@/lib/utils/format';
import { AssetThumb } from './AssetThumb';
import { gbp, gbpCompact, pctAllocated } from './format';
import { LifecycleTag } from './LifecycleTag';
import { MovePill } from './MovePill';
import { Sparkline } from './Sparkline';

/**
 * Desktop column grammar — shared by the header rail and every row so the
 * two always stay aligned. Holders + allocation join at lg.
 */
export const MARKET_GRID =
  'hidden md:grid md:grid-cols-[minmax(0,1fr)_7rem_5.5rem_5.5rem_2.5rem] lg:grid-cols-[minmax(0,1fr)_7rem_5.5rem_4rem_5.5rem_7rem_2.5rem]';

function AllocationMeter({ pct }: { pct: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-1 flex-1 overflow-hidden rounded-full bg-surface-alt">
        <span className="block h-full rounded-full bg-text-primary" style={{ width: `${pct}%` }} />
      </span>
      <span className="w-9 text-right text-meta text-text-secondary tnum">{pct}%</span>
    </div>
  );
}

function WatchStar({
  watched,
  onToggle,
  title,
  className = '',
}: {
  watched: boolean;
  onToggle: () => void;
  title: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={watched}
      aria-label={watched ? `Remove ${title} from watchlist` : `Watch ${title}`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle();
      }}
      className={`pressable pointer-events-auto relative z-elevated flex h-11 w-11 items-center justify-center rounded-full hover:text-text-primary ${
        watched ? 'text-rating-star hover:text-rating-star' : 'text-text-muted'
      } ${className}`}
    >
      <Icon name="star" size={18} filled={watched} />
    </button>
  );
}

/**
 * Per-row 7d sparkline — the query layer owns the data, so live mode reads
 * the price-history endpoint rather than fixtures. Until the series lands
 * the cell stays empty: an absent sparkline beats a fabricated one.
 */
function MarketSparkline({
  assetId,
  title,
  width,
  height,
}: {
  assetId: string;
  title: string;
  width: number;
  height: number;
}) {
  const { data } = usePriceHistory(assetId, '1W');
  if (!data || data.length < 2) {
    return <span className="inline-block" style={{ width, height }} aria-hidden="true" />;
  }
  return (
    <Sparkline
      candles={data}
      width={width}
      height={height}
      label={`${title} 7-day trend`}
    />
  );
}

export function MarketRow({
  asset,
  watched,
  onToggleWatch,
}: {
  asset: CoOwnAsset;
  watched: boolean;
  onToggleWatch: (assetId: string) => void;
}) {
  const tier = asset.issuer.verificationTier;

  return (
    <li className="group relative transition-colors hover:bg-row">
      {/* Stretched link — the whole row trades; the star keeps its own target. */}
      <Link
        href={`/co-own/${asset.id}`}
        className="absolute inset-0 z-0 rounded-lg"
        aria-label={`Trade ${asset.title}`}
      />

      {/* Mobile — stacked row */}
      <div className="pointer-events-none relative z-[1] py-4 md:hidden">
        <div className="flex items-start gap-3">
          <AssetThumb src={asset.imageUrl} alt="" className="h-14 w-14 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="clamp-1 text-body-emphasis font-semibold text-text-primary">{asset.title}</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-meta text-text-secondary">
              <span className="truncate">@{asset.issuer.username}</span>
              {tier ? (
                <Icon name="verified" size={13} className="shrink-0 text-commerce-trust" aria-label={tier} />
              ) : null}
            </p>
            <LifecycleTag asset={asset} className="mt-1" />
          </div>
          <WatchStar
            watched={watched}
            onToggle={() => onToggleWatch(asset.id)}
            title={asset.title}
            className="-mr-2 -mt-1"
          />
        </div>
        <div className="mt-3 flex items-end justify-between gap-3">
          <div>
            <p className="text-body-emphasis text-text-primary tnum">{gbp(coOwnMarkGbp(asset))}</p>
            <MovePill pct={asset.marketMovePct24h} className="mt-1" />
          </div>
          <MarketSparkline assetId={asset.id} title={asset.title} width={96} height={28} />
        </div>
        <div className="mt-3 flex items-center gap-3">
          <AllocationMeter pct={pctAllocated(asset)} />
          <p className="shrink-0 text-meta text-text-secondary tnum">
            {formatCount(asset.holders)} holders · {gbpCompact(asset.volume24hGbp)}
          </p>
        </div>
      </div>

      {/* Desktop — one dense market row */}
      <div className={`${MARKET_GRID} pointer-events-none relative z-[1] items-center gap-4 px-1 py-3.5`}>
        <div className="flex min-w-0 items-center gap-3">
          <AssetThumb src={asset.imageUrl} alt="" className="h-12 w-12 shrink-0" />
          <div className="min-w-0">
            <p className="clamp-1 text-body-emphasis font-semibold text-text-primary">{asset.title}</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-meta text-text-secondary">
              <span className="truncate">@{asset.issuer.username}</span>
              {tier ? (
                <Icon name="verified" size={13} className="shrink-0 text-commerce-trust" aria-label={tier} />
              ) : null}
              {/* Halted/closed grammar — same tag the mobile card shows on
                  every row, rendered inline at desktop density. */}
              <LifecycleTag asset={asset} />
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-body-emphasis text-text-primary tnum">{gbp(coOwnMarkGbp(asset))}</p>
          <MovePill pct={asset.marketMovePct24h} className="mt-1" />
        </div>
        <MarketSparkline assetId={asset.id} title={asset.title} width={76} height={26} />
        <p className="hidden text-body text-text-secondary tnum lg:block">{formatCount(asset.holders)}</p>
        <p className="text-body text-text-secondary tnum">{gbpCompact(asset.volume24hGbp)}</p>
        <div className="hidden lg:block">
          <AllocationMeter pct={pctAllocated(asset)} />
        </div>
        <WatchStar
          watched={watched}
          onToggle={() => onToggleWatch(asset.id)}
          title={asset.title}
          className="justify-self-end"
        />
      </div>
    </li>
  );
}
