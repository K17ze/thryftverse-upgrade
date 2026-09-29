'use client';

/**
 * Featured hero — the day's deepest market. Media leads; price, move and
 * the four stats that matter sit in a quiet right column.
 */

import { useRouter } from 'next/navigation';
import { AppImage } from '@/components/ui/AppImage';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { usePriceHistory } from '@/lib/hooks/coown-queries';
import type { CoOwnAsset } from '@/lib/contracts/coown';
import { coOwnMarkGbp, deriveLifecycleState } from '@/lib/contracts/coown';
import { formatCount } from '@/lib/utils/format';
import { gbp, gbpCompact } from './format';
import { LifecycleTag } from './LifecycleTag';
import { MovePill } from './MovePill';
import { Sparkline } from './Sparkline';

export function FeaturedHero({ asset }: { asset: CoOwnAsset }) {
  const router = useRouter();
  // Query layer, not the fixture directly — live mode reads the real
  // price-history endpoint; while it loads the slot stays empty.
  const weekQ = usePriceHistory(asset.id, '1W');
  const tier = asset.issuer.verificationTier;
  const href = `/co-own/${asset.id}`;

  // A halted or exiting market's hero CTA navigates, it doesn't promise
  // a trade — label follows the lifecycle.
  const state = deriveLifecycleState(asset);
  const tradable = state === 'secondaryTrading' || state === 'initialOffering';

  const stats = [
    { label: 'Holders', value: formatCount(asset.holders) },
    { label: '24h volume', value: gbpCompact(asset.volume24hGbp) },
    { label: 'Available', value: formatCount(asset.availableUnits) },
    { label: 'Units', value: formatCount(asset.totalUnits) },
  ];

  return (
    <section aria-label={`Featured market — ${asset.title}`} className="grid items-start gap-6 md:grid-cols-12 md:gap-10">
      <AppImage
        src={asset.imageUrl}
        alt={asset.title}
        aspectRatio={4 / 3}
        priority
        sizes="(max-width: 768px) 100vw, 58vw"
        className="rounded-xl md:col-span-7"
      />

      <div className="md:col-span-5">
        <div className="flex items-center gap-2.5">
          <LifecycleTag asset={asset} />
          <span aria-hidden="true" className="text-text-muted">·</span>
          <span className="text-meta text-text-secondary">{asset.category}</span>
        </div>

        <h2 className="mt-2 text-editorial-display text-text-primary">{asset.title}</h2>
        {asset.subtitle ? <p className="clamp-1 mt-1 text-body text-text-secondary">{asset.subtitle}</p> : null}

        <p className="mt-3 flex items-center gap-1.5 text-body text-text-secondary">
          @{asset.issuer.username}
          {tier ? (
            <Icon name="verified" size={14} className="text-commerce-trust" aria-label={tier} />
          ) : null}
        </p>

        <div className="mt-5 flex flex-wrap items-baseline gap-x-3 gap-y-2">
          <p className="text-price-hero font-semibold text-text-primary tnum">{gbp(coOwnMarkGbp(asset))}</p>
          <MovePill pct={asset.marketMovePct24h} />
          <span className="text-meta text-text-muted">24h</span>
        </div>

        <div className="mt-3 flex items-center gap-2.5">
          {weekQ.data && weekQ.data.length >= 2 ? (
            <>
              <Sparkline
                candles={weekQ.data}
                width={180}
                height={44}
                label={`${asset.title} 1-week trend`}
              />
              <span className="text-micro text-text-muted">1W</span>
            </>
          ) : null}
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-border-subtle pt-4 sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label}>
              <dt className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">{s.label}</dt>
              <dd className="mt-1 text-body-emphasis text-text-primary tnum">{s.value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-6 flex flex-wrap gap-3">
          <Button icon="trending" className="min-w-36 flex-1 sm:flex-none" onClick={() => router.push(href)}>
            {tradable ? 'Trade' : 'View market'}
          </Button>
          <Button variant="secondary" icon="document" className="min-w-36 flex-1 sm:flex-none" onClick={() => router.push(href)}>
            View dossier
          </Button>
        </div>
      </div>
    </section>
  );
}
