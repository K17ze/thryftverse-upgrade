'use client';

import { EmptyState } from '@/components/ui/EmptyState';
import type { CoOwnAsset } from '@/lib/contracts/coown';
import { MARKET_GRID, MarketRow } from './MarketRow';

/** Polymarket-style market list — flat rows over hairlines, column rail on md+. */
export function MarketList({
  assets,
  watched,
  onToggleWatch,
}: {
  assets: CoOwnAsset[];
  watched: ReadonlySet<string>;
  onToggleWatch: (assetId: string) => void;
}) {
  if (assets.length === 0) {
    return (
      <EmptyState
        compact
        icon="search"
        title="Nothing in this category yet"
        subtitle="New offerings list weekly. Check another segment or check back soon."
      />
    );
  }

  return (
    <section aria-label="Co-Own markets">
      <div className={`${MARKET_GRID} gap-4 border-b border-border-subtle px-1 pb-2`}>
        <span className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">Market</span>
        <span className="text-right text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">Price</span>
        <span className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">7d</span>
        <span className="hidden text-right text-micro font-semibold uppercase tracking-[0.08em] text-text-muted lg:block">
          Holders
        </span>
        <span className="text-right text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">24h vol</span>
        <span className="hidden text-micro font-semibold uppercase tracking-[0.08em] text-text-muted lg:block">
          Allocated
        </span>
        <span className="sr-only">Watch</span>
      </div>
      <ul className="divide-y divide-border-subtle">
        {assets.map((asset) => (
          <MarketRow
            key={asset.id}
            asset={asset}
            watched={watched.has(asset.id)}
            onToggleWatch={onToggleWatch}
          />
        ))}
      </ul>
    </section>
  );
}
