'use client';

/**
 * /co-own/syndicate — the syndicate hub. "Your syndicates" first (pools
 * the viewer has committed to), then every other pool sorted by how
 * joinable it is: open, member-capped, funded, executed. Flat canvas,
 * hairline sections — same surface grammar as the Co-Own hub.
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
import { SyndicateRow } from './SyndicateRow';

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
    <div className="mx-auto w-full max-w-3xl px-4 pb-20 pt-8 sm:px-6 md:pt-10">
      <div className="skeleton h-9 w-44 rounded-sm" aria-hidden="true" />
      <div className="mt-2 skeleton h-4 w-72 rounded-sm" aria-hidden="true" />
      <div className="mt-10 space-y-4" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex gap-3.5">
            <div className="skeleton h-16 w-16 rounded-lg" />
            <div className="flex-1 space-y-2 pt-1">
              <div className="skeleton h-4 w-40 rounded-sm" />
              <div className="skeleton h-3 w-56 rounded-sm" />
              <div className="skeleton h-1.5 w-48 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SyndicateHubView() {
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
          title="Syndicates unavailable"
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
    <div className="mx-auto w-full max-w-3xl px-4 pb-20 pt-8 sm:px-6 md:pt-10">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <h1 className="text-editorial-display text-text-primary">Syndicates</h1>
          <p className="mt-2 max-w-md text-meta text-text-secondary">
            Pool funds with other members to share ownership of one asset.
          </p>
        </div>
        <div className="flex items-center gap-5">
          <Link
            href="/co-own/syndicate/history"
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
          <Button size="sm" icon="plus" onClick={() => router.push('/co-own/syndicate/create')}>
            Start a syndicate
          </Button>
        </div>
      </header>

      {isEmpty ? (
        <div className="mt-8 border-t border-border-subtle">
          <EmptyState
            icon="people"
            title="No syndicates yet"
            subtitle="Start a pool, pick an asset and invite members to co-fund the buy — or join one when pools open."
            actionLabel="Start a syndicate"
            onAction={() => router.push('/co-own/syndicate/create')}
          />
        </div>
      ) : (
        <>
          {yourRows.length > 0 ? (
            <section aria-labelledby="syndicates-yours" className="mt-8">
              <h2
                id="syndicates-yours"
                className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted"
              >
                Your syndicates
              </h2>
              <ul className="mt-2 divide-y divide-border-subtle border-b border-border-subtle">
                {yourRows.map(({ s, asset }) => (
                  <SyndicateRow key={s.id} syndicate={s} asset={asset} viewerId={user?.id ?? null} />
                ))}
              </ul>
            </section>
          ) : null}

          {discoverRows.length > 0 ? (
            <section aria-labelledby="syndicates-open" className="mt-10">
              <h2
                id="syndicates-open"
                className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted"
              >
                Open syndicates
              </h2>
              <ul className="mt-2 divide-y divide-border-subtle border-b border-border-subtle">
                {discoverRows.map(({ s, asset }) => (
                  <SyndicateRow key={s.id} syndicate={s} asset={asset} viewerId={user?.id ?? null} />
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
