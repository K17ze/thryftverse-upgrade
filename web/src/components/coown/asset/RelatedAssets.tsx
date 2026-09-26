'use client';

/** RelatedAssets — other live markets, same rail grammar as the hub list. */

import Link from 'next/link';
import type { CoOwnAsset } from '@/lib/contracts/coown';
import { gbp } from '../format';
import { AssetThumb } from '../AssetThumb';
import { MovePill } from '../MovePill';

export function RelatedAssets({ assets, currentId }: { assets: CoOwnAsset[]; currentId: string }) {
  const seen = new Set<string>();
  const related = assets.filter((a) => {
    if (a.id === currentId || seen.has(a.id)) return false;
    seen.add(a.id);
    return true;
  });

  if (related.length === 0) return null;

  return (
    <section aria-labelledby="related-heading">
      <div className="flex items-baseline justify-between">
        <h2 className="text-section-title font-semibold text-text-primary">More markets</h2>
        <p className="text-meta text-text-muted tnum">{related.length}</p>
      </div>
      <ul className="no-scrollbar -mx-4 mt-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3">
        {related.map((a) => (
          <li key={a.id} className="min-w-[240px] shrink-0 sm:min-w-0">
            <Link
              href={`/co-own/${a.id}`}
              className="pressable flex items-center gap-3 rounded-lg p-2 hover:bg-row"
            >
              <AssetThumb src={a.imageUrl} alt="" className="h-12 w-12 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="clamp-1 block text-body-emphasis font-semibold text-text-primary">
                  {a.title}
                </span>
                <span className="mt-1 flex items-center gap-2">
                  <span className="text-body text-text-primary tnum">{gbp(a.unitPriceGbp)}</span>
                  <MovePill pct={a.marketMovePct24h} />
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
