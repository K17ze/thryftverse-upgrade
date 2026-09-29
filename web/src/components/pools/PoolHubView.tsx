'use client';

/**
 * /co-own/pools — the pools hub. "Your pools" first (pools the viewer
 * has committed to), then every other pool sorted by how joinable it
 * is: open, member-capped, funded, executed. Flat canvas, hairline
 * sections — same surface grammar as the Co-Own hub.
 */

import { useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import type { CoOwnAsset } from '@/lib/contracts/coown';
import type { Syndicate } from '@/lib/contracts/syndicate';
import { isMemberCapReached, syndicatePhase } from '@/lib/contracts/syndicate';
import { useCoOwnAssets } from '@/lib/hooks/coown-queries';
import { useSyndicates } from '@/lib/hooks/syndicate-queries';
import { useSession } from '@/lib/session/SessionProvider';
import { PoolRow, POOL_ROW_GRID } from './PoolRow';

/** Column header riding the same grid template as PoolRow — the hub
 *  reads as a dense table at lg, not stretched cards. */
function TableHeader() {
  return (
    <div
      aria-hidden="true"
      className={`hidden border-b border-border-subtle px-1 pb-2 lg:grid ${POOL_ROW_GRID} lg:gap-x-6`}
    >
      <span className="text-label text-text-muted">
        Pool
      </span>
      <span className="text-label text-text-muted">
        Members
      </span>
      <span className="text-label text-text-muted">
        Pooled
      </span>
      <span className="text-right text-label text-text-muted">
        Your share
      </span>
      <span />
    </div>
  );
}

/** Joinability order — pools you can still act on first. */
function rank(s: Syndicate, asset: CoOwnAsset): number {
  switch (syndicatePhase(s, asset)) {
    case 'open':
      return isMemberCapReached(s) ? 1 : 0;
    case 'funded':
      return 2;
    case 'executed':
      return 3;
    default:
      return 4;
  }
}

function HubSkeleton() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-20 pt-8 sm:px-6 md:pt-10 lg:max-w-[1440px]">
      <div className="skeleton h-9 w-44 rounded-sm" aria-hidden="true" />
      <div className="mt-2 skeleton h-4 w-72 rounded-sm" aria-hidden="true" />
      <div className="mt-10 space-y-4" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className={`flex gap-3.5 lg:grid ${POOL_ROW_GRID} lg:items-center lg:gap-x-6`}>
            <div className="flex flex-1 gap-3.5">
              <div className="skeleton h-16 w-16 rounded-lg lg:h-11 lg:w-11" />
              <div className="flex-1 space-y-2 pt-1">
                <div className="skeleton h-4 w-40 rounded-sm" />
                <div className="skeleton h-3 w-56 rounded-sm" />
                <div className="skeleton h-1.5 w-48 rounded-full lg:hidden" />
              </div>
            </div>
            <div className="skeleton hidden h-4 w-24 rounded-sm lg:block" />
            <div className="skeleton hidden h-4 w-32 rounded-sm lg:block" />
            <div className="skeleton hidden h-4 w-12 rounded-sm lg:block" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function PoolHubView() {
  const router = useRouter();
  const { user } = useSession();
  const syndicatesQ = useSyndicates();
  const assetsQ = useCoOwnAssets();

  const assetById = useMemo(() => {
    const map = new Map<string, CoOwnAsset>();
    for (const a of assetsQ.data ?? []) map.set(a.id, a);
    return map;
  }, [assetsQ.data]);

  const { yours, discover } = useMemo(() => {
    const yours: Syndicate[] = [];
    const discover: Syndicate[] = [];
    for (const s of syndicatesQ.data ?? []) {
      const isMember = user ? s.members.some((m) => m.userId === user.id) : false;
      (isMember ? yours : discover).push(s);
    }
    discover.sort((a, b) => {
      const aa = assetById.get(a.assetId);
      const bb = assetById.get(b.assetId);
      const ra = aa ? rank(a, aa) : 4;
      const rb = bb ? rank(b, bb) : 4;
      if (ra !== rb) return ra - rb;
      return b.createdAt.localeCompare(a.createdAt);
    });
    return { yours, discover };
  }, [syndicatesQ.data, assetById, user]);

  if (syndicatesQ.isLoading || assetsQ.isLoading) return <HubSkeleton />;

  if (syndicatesQ.isError || !syndicatesQ.data) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <EmptyState
          icon="people"
          title="Pools unavailable"
          subtitle="We couldn't load the pools. Check your connection and try again."
          actionLabel="Retry"
          onAction={() => void syndicatesQ.refetch()}
        />
      </div>
    );
  }

  const withAsset = (list: Syndicate[]) =>
    list
      .map((s) => ({ s, asset: assetById.get(s.assetId) }))
      .filter((x): x is { s: Syndicate; asset: CoOwnAsset } => x.asset != null);

  const yourRows = withAsset(yours);
  const discoverRows = withAsset(discover);
  const isEmpty = yourRows.length === 0 && discoverRows.length === 0;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-20 pt-8 sm:px-6 md:pt-10 lg:max-w-[1440px]">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <h1 className="text-editorial-display text-text-primary">Pools</h1>
          <p className="mt-2 max-w-md text-meta text-text-secondary">
            Pool funds with other members to share ownership of one asset.
          </p>
        </div>
        <div className="flex items-center gap-5">
          <Link
            href="/co-own/pools/history"
            className="text-body font-medium text-text-secondary underline-offset-4 hover:text-text-primary hover:underline"
          >
            Activity
          </Link>
          <Link
            href="/co-own"
            className="text-body font-medium text-text-secondary underline-offset-4 hover:text-text-primary hover:underline"
          >
            Markets
          </Link>
          <Button size="sm" icon="plus" onClick={() => router.push('/co-own/pools/create')}>
            Start a pool
          </Button>
        </div>
      </header>

      {isEmpty ? (
        <div className="mt-8 border-t border-border-subtle">
          <EmptyState
            icon="people"
            title="No pools yet"
            subtitle="Start a pool, pick an asset and invite members to co-fund the buy — or join one when pools open."
            actionLabel="Start a pool"
            onAction={() => router.push('/co-own/pools/create')}
          />
        </div>
      ) : (
        <>
          {yourRows.length > 0 ? (
            <section aria-labelledby="pools-yours" className="mt-8">
              <h2
                id="pools-yours"
                className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted"
              >
                Your pools
              </h2>
              <TableHeader />
              <ul className="mt-2 divide-y divide-border-subtle border-b border-border-subtle lg:mt-0">
                {yourRows.map(({ s, asset }) => (
                  <PoolRow key={s.id} syndicate={s} asset={asset} viewerId={user?.id ?? null} />
                ))}
              </ul>
            </section>
          ) : null}

          {discoverRows.length > 0 ? (
            <section aria-labelledby="pools-open" className="mt-10">
              <h2
                id="pools-open"
                className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted"
              >
                Open pools
              </h2>
              <TableHeader />
              <ul className="mt-2 divide-y divide-border-subtle border-b border-border-subtle lg:mt-0">
                {discoverRows.map(({ s, asset }) => (
                  <PoolRow key={s.id} syndicate={s} asset={asset} viewerId={user?.id ?? null} />
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
