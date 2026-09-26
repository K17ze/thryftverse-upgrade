'use client';

/**
 * /co-own/syndicate/[id] — one pool. Target market card and funding
 * progress on the left with members and the pool's order history; a
 * sticky rail on the right carries the contribution composer and the
 * pool rules. Every pool phase degrades to an honest notice.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { AssetThumb } from '@/components/coown/AssetThumb';
import { LifecycleTag } from '@/components/coown/LifecycleTag';
import { gbp } from '@/components/coown/format';
import {
  memberByUserId,
  poolProgressPct,
  pooledGbp,
  remainingGbp,
  sharePctOfPool,
  syndicatePhase,
  targetTotalGbp,
} from '@/lib/contracts/syndicate';
import { useCoOwnAsset } from '@/lib/hooks/coown-queries';
import { useSyndicate } from '@/lib/hooks/syndicate-queries';
import { useSession } from '@/lib/session/SessionProvider';
import { formatDate } from '@/lib/utils/format';
import { ContributionComposer } from './ContributionComposer';
import { ExecutionList } from './ExecutionList';
import { MemberList } from './MemberList';
import { PoolMeter } from './PoolMeter';
import { SyndicateStatusTag } from './SyndicateStatusTag';

const PHASE_LINE: Record<string, string | null> = {
  open: null,
  funded: 'The pool is fully funded — the pooled buy is queued.',
  executed: 'The pooled buy executed and units were allocated pro-rata.',
  dissolved: 'This pool was dissolved and contributions returned.',
};

function DetailSkeleton() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-20 pt-8 sm:px-6 md:pt-10">
      <div className="skeleton h-4 w-24 rounded-sm" aria-hidden="true" />
      <div className="mt-4 skeleton h-9 w-64 rounded-sm" aria-hidden="true" />
      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="space-y-6">
          <div className="skeleton h-24 rounded-lg" aria-hidden="true" />
          <div className="skeleton h-40 rounded-lg" aria-hidden="true" />
        </div>
        <div className="skeleton h-56 rounded-lg" aria-hidden="true" />
      </div>
    </div>
  );
}

export function SyndicateDetailView({ id }: { id: string }) {
  const router = useRouter();
  const { user } = useSession();
  const { data: syndicate, isLoading, isError, refetch } = useSyndicate(id);
  const { data: asset, isLoading: assetLoading } = useCoOwnAsset(syndicate?.assetId ?? '');

  if (isLoading || (syndicate && assetLoading)) return <DetailSkeleton />;

  if (isError) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <EmptyState
          icon="people"
          title="Syndicate unavailable"
          subtitle="We couldn't load this pool. Check your connection and try again."
          actionLabel="Retry"
          onAction={() => void refetch()}
        />
      </div>
    );
  }

  if (!syndicate || !asset) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <EmptyState
          icon="people"
          title="Syndicate not found"
          subtitle="This pool may have closed, or the link is out of date."
          actionLabel="All syndicates"
          onAction={() => router.push('/co-own/syndicate')}
        />
      </div>
    );
  }

  const member = user ? memberByUserId(syndicate, user.id) : undefined;
  const phase = syndicatePhase(syndicate, asset);
  const pct = poolProgressPct(syndicate, asset);
  const pooled = pooledGbp(syndicate);
  const target = targetTotalGbp(syndicate, asset);
  const remaining = remainingGbp(syndicate, asset);
  const phaseLine = PHASE_LINE[phase];
  const sharePct = member ? sharePctOfPool(member.contributionGbp, syndicate, asset) : null;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-20 pt-8 sm:px-6 md:pt-10">
      <Link
        href="/co-own/syndicate"
        className="pressable inline-flex items-center gap-1.5 text-body font-medium text-text-secondary hover:text-text-primary"
      >
        <Icon name="back" size={16} />
        Syndicates
      </Link>

      <header className="mt-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <div>
          <h1 className="text-editorial-display text-text-primary">{syndicate.name}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-text-secondary">
            <SyndicateStatusTag syndicate={syndicate} asset={asset} viewerIsMember={member != null} />
            <span aria-hidden="true" className="text-text-muted">·</span>
            <span>
              Organized by <span className="font-medium text-text-primary">@{syndicate.organizerUsername}</span>
            </span>
            <span aria-hidden="true" className="text-text-muted">·</span>
            <span className="tnum">
              {syndicate.members.length}/{syndicate.memberCap} members
            </span>
            <span aria-hidden="true" className="text-text-muted">·</span>
            <span>Opened {formatDate(syndicate.createdAt)}</span>
          </p>
        </div>
      </header>

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_19rem] lg:gap-12">
        {/* ── Left: target, members, order history ── */}
        <div className="min-w-0">
          <section aria-labelledby="syndicate-target">
            <h2 id="syndicate-target" className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">
              Target
            </h2>
            <Link
              href={`/co-own/${asset.id}`}
              className="pressable mt-3 flex items-center gap-4 rounded-lg py-1 transition-colors hover:bg-row"
              aria-label={`Open ${asset.title} market`}
            >
              <AssetThumb src={asset.imageUrl} alt={asset.title} className="w-20 sm:w-24" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-body-emphasis font-semibold text-text-primary">{asset.title}</p>
                {asset.subtitle ? (
                  <p className="mt-0.5 truncate text-meta text-text-secondary">{asset.subtitle}</p>
                ) : null}
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <LifecycleTag asset={asset} />
                  <span className="text-meta text-text-muted tnum">
                    {gbp(asset.unitPriceGbp)} / unit
                  </span>
                </div>
              </div>
              <Icon name="forward" size={18} className="shrink-0 text-text-muted" />
            </Link>

            <div className="mt-5 border-t border-border-subtle pt-5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="text-body text-text-secondary">
                  <span className="font-semibold text-text-primary tnum">{gbp(pooled)}</span>
                  {' pooled of '}
                  <span className="tnum">{gbp(target)}</span>
                  {' · '}
                  <span className="tnum">{syndicate.unitsTarget} units</span>
                </p>
                <p className="text-meta text-text-muted tnum">
                  {phase === 'open' ? `${gbp(remaining)} to go` : `${pct}% funded`}
                </p>
              </div>
              <PoolMeter pct={pct} className="mt-3" />
              {phaseLine ? (
                <p className="mt-3 flex items-start gap-2 text-meta text-text-secondary">
                  <Icon
                    name={phase === 'open' ? 'info' : 'check'}
                    size={14}
                    className={`mt-0.5 shrink-0 ${phase === 'funded' ? 'text-antique-gold' : 'text-coown-up'}`}
                  />
                  {phaseLine}
                </p>
              ) : null}
            </div>
          </section>

          <section aria-labelledby="syndicate-members" className="mt-10 border-t border-border-subtle pt-6">
            <h2
              id="syndicate-members"
              className="flex items-baseline justify-between text-micro font-semibold uppercase tracking-[0.08em] text-text-muted"
            >
              Members
              <span className="tnum normal-case tracking-normal">
                {syndicate.members.length} of {syndicate.memberCap}
              </span>
            </h2>
            <MemberList syndicate={syndicate} asset={asset} viewerId={user?.id ?? null} />
          </section>

          <section aria-labelledby="syndicate-history" className="mt-10 border-t border-border-subtle pt-6">
            <h2 id="syndicate-history" className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">
              Order history
            </h2>
            <ExecutionList syndicate={syndicate} />
          </section>
        </div>

        {/* ── Right: composer rail ── */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-lg border border-border-subtle bg-surface-alt p-4 sm:p-5">
            <h2 className="text-label font-semibold uppercase tracking-wider text-text-muted">
              {phase === 'open' ? (member ? 'Your position' : 'Join the pool') : 'Pool status'}
            </h2>
            {member ? (
              <p className="mt-2 text-body text-text-secondary">
                <span className="font-semibold text-text-primary tnum">{gbp(member.contributionGbp)}</span>
                {' committed · '}
                <span className="tnum">{sharePct!.toFixed(1)}%</span> of the pooled buy
              </p>
            ) : null}
            <div className={member ? 'mt-4 border-t border-border-subtle pt-4' : 'mt-3'}>
              <ContributionComposer syndicate={syndicate} asset={asset} />
            </div>
          </div>

          {syndicate.termsNote ? (
            <p className="mt-4 flex items-start gap-2 px-1 text-meta text-text-secondary">
              <Icon name="document" size={14} className="mt-0.5 shrink-0 text-text-muted" />
              <span>
                <span className="font-medium text-text-primary">Pool terms — </span>
                {syndicate.termsNote}
              </span>
            </p>
          ) : null}

          <p className="mt-3 px-1 text-meta text-text-muted">
            Commitments are pooled in GBP and used only to buy the target units. Capital at risk.
          </p>
        </aside>
      </div>
    </div>
  );
}
