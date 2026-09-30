'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { coOwnMarkGbp, type CoOwnAsset, type CoOwnPosition } from '@/lib/contracts/coown';
import { AssetThumb } from '../AssetThumb';
import { gbp, signedPct } from '../format';

interface HubPositionsRailProps {
  positions: CoOwnPosition[];
  assets: CoOwnAsset[];
}

/**
 * Compact "what you hold" rail — holders land on their book before the
 * day's highlight, matching the mobile hub ordering (positions →
 * highlights → markets).
 */
export function HubPositionsRail({ positions, assets }: HubPositionsRailProps) {
  const rows = useMemo(
    () =>
      positions
        .filter((p) => p.units > 0)
        .flatMap((p) => {
          const asset = assets.find((a) => a.id === p.assetId);
          return asset ? [{ position: p, asset }] : [];
        })
        .sort(
          (a, b) =>
            (b.position.marketValueGbp ?? b.position.units * (b.position.markPriceGbp ?? coOwnMarkGbp(b.asset))) -
            (a.position.marketValueGbp ?? a.position.units * (a.position.markPriceGbp ?? coOwnMarkGbp(a.asset))),
        ),
    [positions, assets],
  );

  if (rows.length === 0) return null;

  const totalValue = rows.reduce(
    (sum, r) =>
      sum + (r.position.marketValueGbp ?? r.position.units * (r.position.markPriceGbp ?? coOwnMarkGbp(r.asset))),
    0,
  );

  return (
    <section aria-label="Your positions" className="mt-8">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-label text-text-muted">
          Your positions
        </h2>
        <Link
          href="/co-own/portfolio"
          className="text-meta font-medium text-text-secondary hover:text-text-primary"
        >
          Portfolio · <span className="tnum">{gbp(totalValue)}</span>
        </Link>
      </div>
      <ul className="mt-3 divide-y divide-border-subtle border-y border-border-subtle">
        {rows.slice(0, 4).map(({ position, asset }) => {
          const value = position.marketValueGbp ?? position.units * (position.markPriceGbp ?? coOwnMarkGbp(asset));
          const cost = position.costBasisGbp ?? position.units * position.avgEntryPriceGbp;
          const pl = position.unrealisedPnlGbp ?? value - cost;
          const plPct = cost > 0 ? (pl / cost) * 100 : 0;
          return (
            <li key={asset.id}>
              <Link
                href={`/co-own/${asset.id}`}
                className="group flex items-center gap-3 px-1 py-3 transition-colors hover:bg-row"
              >
                <AssetThumb src={asset.imageUrl} alt="" className="h-10 w-10 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="clamp-1 text-body font-semibold text-text-primary">
                    {asset.title}
                  </p>
                  <p className="mt-0.5 text-meta text-text-muted tnum">
                    {position.units} {position.units === 1 ? 'unit' : 'units'} · avg{' '}
                    {gbp(position.avgEntryPriceGbp)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-body font-semibold text-text-primary tnum">
                    {gbp(value)}
                  </p>
                  <p
                    className={`mt-0.5 text-meta tnum ${
                      plPct >= 0 ? 'text-coown-up' : 'text-coown-down'
                    }`}
                  >
                    {signedPct(plPct)} since entry
                  </p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
