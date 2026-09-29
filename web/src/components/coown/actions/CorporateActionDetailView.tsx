'use client';

/**
 * CorporateActionDetailView — the event record for one corporate action.
 * Port of mobile CorporateActionDetailScreen: status, kind, dates, the
 * governance figures the resolution actually carries (quorum, pass
 * threshold, per-unit / total value — all fail closed when absent), the
 * running tally and the viewer's recorded ballot. Vote casting lives on
 * the dedicated /vote route — this screen links there when the ballot
 * is open, mirroring mobile's detail → ballot split.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconButton } from '@/components/ui/IconButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { DATA_MODE } from '@/lib/api/client';
import {
  useCoOwnAsset,
  useCoOwnPositions,
  useGovernanceActions,
  useGovernanceVotes,
} from '@/lib/hooks/coown-queries';
import { useSession } from '@/lib/session/SessionProvider';
import { formatCount } from '@/lib/utils/format';
import { AssetThumb } from '../AssetThumb';
import {
  corporateActionKindLabel,
  corporateActionStatusLabel,
  corporateActionStatusVariant,
  gbp,
} from '../format';
import { GovernanceMeter } from './GovernanceMeter';

function deadlineLabel(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '—';
  const formatted = d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const days = Math.ceil((d.getTime() - Date.now()) / 86_400_000);
  if (days <= 0) return `${formatted} · closed`;
  if (days === 1) return `${formatted} · closes in 1 day`;
  if (days <= 7) return `${formatted} · closes in ${days} days`;
  return formatted;
}

const VOTE_WORD = { for: 'for', against: 'against', abstain: 'abstain' } as const;

function DetailSkeleton() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-20 pt-6 sm:px-6 lg:max-w-[1440px]" aria-busy="true" aria-label="Loading corporate action">
      <Skeleton className="h-11 w-11 rounded-full" />
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-x-16">
        <div className="min-w-0">
          <Skeleton className="mt-6 h-4 w-40" />
          <Skeleton className="mt-3 h-8 w-72" />
          <Skeleton className="mt-4 h-16 w-full" />
          <div className="mt-8 space-y-3" aria-hidden="true">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
        </div>
        <div className="mt-8 space-y-3 lg:mt-6" aria-hidden="true">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="mt-6 h-[52px] w-full rounded-md" />
        </div>
      </div>
    </div>
  );
}

export function CorporateActionDetailView({
  assetId,
  actionId,
}: {
  assetId: string;
  actionId: string;
}) {
  const router = useRouter();
  const { isGuest } = useSession();
  const { data: asset } = useCoOwnAsset(assetId);
  const actionsQ = useGovernanceActions(assetId);
  const { data: positions } = useCoOwnPositions();
  const votesQ = useGovernanceVotes(actionId);

  const action = actionsQ.data?.find((a) => a.id === actionId);

  if (actionsQ.isPending) {
    return <DetailSkeleton />;
  }

  if (!action) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
        <EmptyState
          icon="document"
          title="Action not found"
          subtitle={
            actionsQ.isError
              ? "We couldn't load this corporate action. Check your connection and try again."
              : 'This corporate action does not exist or is no longer listed.'
          }
          actionLabel={actionsQ.isError ? 'Retry' : 'Back to market'}
          onAction={() => (actionsQ.isError ? void actionsQ.refetch() : router.push(`/co-own/${assetId}`))}
        />
      </div>
    );
  }

  // Tally source: live mode prefers the votes endpoint's server-authority;
  // fixture mode reads the overlaid action row. Both are real data.
  const liveTally = DATA_MODE === 'live' ? votesQ.data : undefined;
  const tallyFor = liveTally
    ? (liveTally.summary.find((s) => s.vote === 'for')?.votingPowerUnits ?? action.votesFor)
    : action.votesFor;
  const tallyAgainst = liveTally
    ? (liveTally.summary.find((s) => s.vote === 'against')?.votingPowerUnits ?? action.votesAgainst)
    : action.votesAgainst;
  const tallyAbstain = liveTally
    ? (liveTally.summary.find((s) => s.vote === 'abstain')?.votingPowerUnits ?? action.votesAbstain)
    : action.votesAbstain;
  const myVote = DATA_MODE === 'live' ? (liveTally?.myVote ?? action.yourVote) : action.yourVote;

  const closesMs = Date.parse(action.closesAt);
  const open =
    action.status === 'open' && (!Number.isFinite(closesMs) || closesMs > Date.now());

  const myUnits = positions?.find((p) => p.assetId === assetId)?.units ?? null;
  // Estimated effect = real per-unit figure × real held units — both
  // inputs contract data, never extrapolated. Omitted otherwise.
  const estimatedEffect =
    myUnits != null && myUnits > 0 && action.perUnitValueGbp != null
      ? myUnits * action.perUnitValueGbp
      : null;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-20 pt-6 sm:px-6 lg:max-w-[1440px]">
      <div className="flex items-center gap-1">
        <IconButton
          name="back"
          aria-label="Back to market"
          onClick={() => router.push(`/co-own/${assetId}`)}
          className="-ml-2"
        />
        <span className="text-meta font-semibold uppercase tracking-wide text-text-muted">
          Corporate action
        </span>
      </div>

      {/* Desktop grammar: the resolution reads in the main column; the
          tally + ballot rail sits to its right like a brokerage proxy
          card. Mobile keeps the single stacked flow. */}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-x-16">
        <div className="min-w-0">
      <header className="mt-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={corporateActionStatusVariant(action.status)}>
            {corporateActionStatusLabel(action.status)}
          </Badge>
          <span className="text-meta text-text-muted">{corporateActionKindLabel(action)}</span>
        </div>
        <h1 className="mt-3 text-editorial-title text-text-primary">{action.title}</h1>
        {asset ? (
          <Link
            href={`/co-own/${assetId}`}
            className="mt-3 flex w-fit items-center gap-2 text-body text-text-secondary underline-offset-4 hover:text-text-primary hover:underline"
          >
            <AssetThumb src={asset.imageUrl} alt="" className="h-6 w-6" />
            {asset.title}
          </Link>
        ) : null}
        <p className="mt-4 text-body leading-relaxed text-text-secondary">
          {action.description}
        </p>
      </header>

      {/* The figures the resolution actually carries — absent fields stay
          absent rather than reading as placeholders. */}
      <dl className="mt-7 divide-y divide-border-subtle border-y border-border-subtle">
        <div className="flex items-baseline justify-between gap-4 py-2.5">
          <dt className="text-body text-text-secondary">Voting deadline</dt>
          <dd className="tnum text-body text-text-primary">
            <time dateTime={action.closesAt}>{deadlineLabel(action.closesAt)}</time>
          </dd>
        </div>
        {action.quorumUnits != null ? (
          <div className="flex items-baseline justify-between gap-4 py-2.5">
            <dt className="text-body text-text-secondary">Quorum</dt>
            <dd className="tnum text-body text-text-primary">
              {action.quorumUnits.toLocaleString()} units must vote
            </dd>
          </div>
        ) : null}
        {action.passThresholdPct != null ? (
          <div className="flex items-baseline justify-between gap-4 py-2.5">
            <dt className="text-body text-text-secondary">Pass threshold</dt>
            <dd className="tnum text-body text-text-primary">{action.passThresholdPct}% for</dd>
          </div>
        ) : null}
        {action.perUnitValueGbp != null ? (
          <div className="flex items-baseline justify-between gap-4 py-2.5">
            <dt className="text-body text-text-secondary">Value per unit</dt>
            <dd className="tnum text-body text-text-primary">{gbp(action.perUnitValueGbp)}</dd>
          </div>
        ) : null}
        {action.totalValueGbp != null ? (
          <div className="flex items-baseline justify-between gap-4 py-2.5">
            <dt className="text-body text-text-secondary">Total value</dt>
            <dd className="tnum text-body text-text-primary">{gbp(action.totalValueGbp)}</dd>
          </div>
        ) : null}
      </dl>

      {estimatedEffect != null ? (
        <p className="mt-4 text-body text-text-secondary">
          On your {myUnits} {myUnits === 1 ? 'unit' : 'units'} —{' '}
          <span className="tnum font-semibold text-text-primary">
            {gbp(estimatedEffect)}
          </span>{' '}
          if the resolution passes.
        </p>
      ) : null}
        </div>

        <aside className="min-w-0 lg:pt-6">
      <section aria-labelledby="tally-heading" className="mt-8 lg:mt-0">
        <h2
          id="tally-heading"
          className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted"
        >
          Tally
        </h2>
        <div className="mt-3">
          <GovernanceMeter
            votesFor={tallyFor}
            votesAgainst={tallyAgainst}
            votesAbstain={tallyAbstain}
            quorumUnits={action.quorumUnits}
            passThresholdPct={action.passThresholdPct}
          />
        </div>
      </section>

      <div className="mt-8">
        {myVote ? (
          <p className="text-body text-text-secondary">
            You voted{' '}
            <span className="font-semibold text-text-primary">{VOTE_WORD[myVote]}</span>
            {open ? ' — you can change your vote until the deadline.' : '.'}
          </p>
        ) : null}
        {open ? (
          isGuest ? (
            <Button className="mt-4" size="lg" fullWidth onClick={() => router.push('/auth')}>
              Sign in to vote
            </Button>
          ) : (
            <Button
              className="mt-4"
              size="lg"
              fullWidth
              onClick={() => router.push(`/co-own/${assetId}/actions/${actionId}/vote`)}
            >
              {myVote ? 'Review your vote' : `Vote — ${formatCount(myUnits ?? 0)} ${(myUnits ?? 0) === 1 ? 'unit' : 'units'} of power`}
            </Button>
          )
        ) : null}
      </div>
        </aside>
      </div>
    </div>
  );
}
