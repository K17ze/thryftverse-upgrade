'use client';

/**
 * CorporateActionVoteView — the ballot. Port of mobile
 * CorporateActionVoteScreen: the proposal context, the viewer's voting
 * power (settled units at record), a For / Against / Abstain radio group,
 * the quorum meter and one commit. Casting persists through
 * useCastCorporateVote — the store-backed mutation, not local state — so
 * a reload returns to a recorded ballot, and re-voting while the ballot
 * is open replaces the previous choice (mobile upsert semantics).
 *
 * Eligibility is server-computed in live mode and derived from the real
 * held position in fixture mode — zero units means no ballot.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import type { VoteChoice } from '@/lib/contracts/coown';
import { DATA_MODE } from '@/lib/api/client';
import {
  useCastCorporateVote,
  useCoOwnAsset,
  useCoOwnPositions,
  useGovernanceActions,
  useGovernanceVotes,
} from '@/lib/hooks/coown-queries';
import { useSession } from '@/lib/session/SessionProvider';
import { gbp } from '../format';
import { GovernanceMeter } from './GovernanceMeter';

const OPTIONS: { value: VoteChoice; label: string; hint: string }[] = [
  { value: 'for', label: 'For', hint: 'Vote in favour of the resolution' },
  { value: 'against', label: 'Against', hint: 'Vote against the resolution' },
  {
    value: 'abstain',
    label: 'Abstain',
    hint: 'Counted toward quorum, not toward the outcome',
  },
];

const VOTE_WORD: Record<VoteChoice, string> = {
  for: 'for',
  against: 'against',
  abstain: 'abstain',
};

function VoteSkeleton() {
  return (
    <div className="mx-auto w-full max-w-xl px-4 pb-20 pt-6 sm:px-6 lg:max-w-2xl" aria-busy="true" aria-label="Loading ballot">
      <Skeleton className="h-11 w-11 rounded-full" />
      <Skeleton className="mt-6 h-4 w-36" />
      <Skeleton className="mt-3 h-7 w-64" />
      <div className="mt-8 space-y-3" aria-hidden="true">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
      <Skeleton className="mt-8 h-[52px] w-full rounded-md" />
    </div>
  );
}

export function CorporateActionVoteView({
  assetId,
  actionId,
}: {
  assetId: string;
  actionId: string;
}) {
  const router = useRouter();
  const { show } = useToast();
  const { isGuest } = useSession();
  const { data: asset } = useCoOwnAsset(assetId);
  const actionsQ = useGovernanceActions(assetId);
  const { data: positions } = useCoOwnPositions();
  const votesQ = useGovernanceVotes(actionId);
  const { cast } = useCastCorporateVote();

  const action = actionsQ.data?.find((a) => a.id === actionId);

  const [selected, setSelected] = useState<VoteChoice | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<{
    vote: VoteChoice;
    votingPowerUnits: number;
  } | null>(null);

  // Seed the radio with the recorded ballot — mobile pre-selects myVote so
  // re-voting reads as changing a choice, not casting blind.
  const recordedVote: VoteChoice | null =
    DATA_MODE === 'live'
      ? (votesQ.data?.myVote ?? action?.yourVote ?? null)
      : (action?.yourVote ?? null);
  useEffect(() => {
    if (recordedVote && selected == null) setSelected(recordedVote);
  }, [recordedVote, selected]);

  if (actionsQ.isPending) return <VoteSkeleton />;

  if (!action) {
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-8 sm:px-6">
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

  const closesMs = Date.parse(action.closesAt);
  const open =
    action.status === 'open' && (!Number.isFinite(closesMs) || closesMs > Date.now());

  // Voting power — the server computes it in live mode; fixture mode reads
  // the viewer's real held units. Both paths fail closed at zero.
  const fixtureUnits = positions?.find((p) => p.assetId === assetId)?.units ?? 0;
  const votingPower =
    DATA_MODE === 'live'
      ? (votesQ.data?.eligibility?.votingPowerUnits ?? null)
      : fixtureUnits;

  const eligibilityReason =
    DATA_MODE === 'live'
      ? votesQ.data?.eligibility && !votesQ.data.eligibility.eligible
        ? votesQ.data.eligibility.reason || "Voting isn't available on this action"
        : null
      : fixtureUnits <= 0
        ? 'You hold no units in this market — holders vote, proportionate to their units.'
        : null;

  const canVote =
    open &&
    !isGuest &&
    eligibilityReason == null &&
    (votingPower ?? 0) > 0 &&
    !(DATA_MODE === 'live' && votesQ.isLoading);

  const submit = async () => {
    if (!selected || !canVote || submitting || votingPower == null) return;
    setSubmitting(true);
    const ok = await cast({
      actionId,
      assetId,
      vote: selected,
      votingPowerUnits: votingPower,
    });
    setSubmitting(false);
    if (ok) {
      setReceipt({ vote: selected, votingPowerUnits: votingPower });
      show(`Vote recorded — ${VOTE_WORD[selected]}`, 'success');
    } else {
      show('Your vote could not be recorded', 'error');
    }
  };

  // ── Ballot receipt — the recorded vote, durable across reloads ──────
  if (receipt) {
    return (
      <div className="mx-auto w-full max-w-xl px-4 pb-20 pt-6 sm:px-6 lg:max-w-2xl">
        <div className="flex flex-col items-center pt-10 text-center">
          <Icon name="check" filled size={56} className="text-success-text" />
          <h1 className="mt-4 text-screen-title text-text-primary">
            Vote recorded
          </h1>
          <p className="mt-1 text-body text-text-secondary">
            {VOTE_WORD[receipt.vote].charAt(0).toUpperCase() + VOTE_WORD[receipt.vote].slice(1)} ·{' '}
            {receipt.votingPowerUnits.toLocaleString()}{' '}
            {receipt.votingPowerUnits === 1 ? 'unit' : 'units'} of voting power
          </p>
          <p className="mt-3 max-w-sm text-meta text-text-muted">
            Counted toward the {action.title} tally{open ? ' — you can change it until the deadline' : ''}.
          </p>
        </div>
        <div className="mt-8 flex flex-col gap-2">
          <Button
            size="lg"
            fullWidth
            onClick={() => router.push(`/co-own/${assetId}/actions/${actionId}`)}
          >
            Back to the action
          </Button>
          <Button variant="secondary" size="md" fullWidth onClick={() => router.push(`/co-own/${assetId}`)}>
            Back to {asset?.title ?? 'market'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-xl px-4 pb-20 pt-6 sm:px-6 lg:max-w-2xl">
      <div className="flex items-center gap-1">
        <IconButton
          name="back"
          aria-label="Back to the action"
          onClick={() => router.push(`/co-own/${assetId}/actions/${actionId}`)}
          className="-ml-2"
        />
        <span className="text-meta font-semibold uppercase tracking-wide text-text-muted">
          Vote
        </span>
      </div>

      <header className="mt-6">
        <h1 className="text-editorial-title text-text-primary">{action.title}</h1>
        {asset ? (
          <p className="mt-2 text-meta text-text-secondary">
            <Link href={`/co-own/${assetId}`} className="underline-offset-4 hover:underline">
              {asset.title}
            </Link>
            {' · '}
            <time dateTime={action.closesAt} className="tnum">
              closes {new Date(action.closesAt).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </time>
          </p>
        ) : null}
      </header>

      {/* Voting power — real held units; guests and non-holders see the
          reason instead of the ballot. */}
      {!open ? (
        <div className="mt-8" role="status">
          <Badge variant="neutral">Voting closed</Badge>
          <p className="mt-3 text-body text-text-secondary">
            The deadline has passed — the tally below is the final position.
            {recordedVote ? ` You voted ${VOTE_WORD[recordedVote]}.` : ''}
          </p>
        </div>
      ) : isGuest ? (
        <div className="mt-8">
          <p className="text-body text-text-secondary">
            Holders vote in proportion to their units. Sign in to cast yours.
          </p>
          <Button className="mt-4" size="lg" fullWidth onClick={() => router.push('/auth')}>
            Sign in to vote
          </Button>
        </div>
      ) : (
        <>
          <div className="mt-6 flex items-baseline justify-between border-b border-border-subtle pb-3">
            <span className="text-meta font-semibold uppercase tracking-wide text-text-muted">
              Your voting power
            </span>
            <span className="tnum text-body-emphasis font-semibold text-text-primary">
              {votingPower == null ? '—' : `${votingPower.toLocaleString()} ${votingPower === 1 ? 'unit' : 'units'}`}
            </span>
          </div>

          {eligibilityReason ? (
            <p className="mt-6 flex items-start gap-2 text-body text-text-secondary" role="status">
              <Icon name="info" size={16} className="mt-0.5 shrink-0" />
              {eligibilityReason}
            </p>
          ) : (
            <fieldset className="mt-6" disabled={submitting}>
              <legend className="sr-only">Vote options</legend>
              <div role="radiogroup" aria-label="Vote options" className="space-y-2">
                {OPTIONS.map((opt) => {
                  const active = selected === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      disabled={!canVote}
                      onClick={() => setSelected(opt.value)}
                      className={`flex w-full items-center gap-3 rounded-lg border px-4 py-3.5 text-left transition-colors disabled:opacity-50 ${
                        active
                          ? 'border-brand bg-brand-subtle'
                          : 'border-border bg-transparent hover:border-text-muted'
                      }`}
                    >
                      <Icon
                        name={active ? 'check' : 'remove'}
                        size={18}
                        className={active ? 'shrink-0 text-brand' : 'shrink-0 text-text-muted'}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-body-emphasis font-semibold text-text-primary">
                          {opt.label}
                        </span>
                        <span className="block text-meta text-text-secondary">{opt.hint}</span>
                      </span>
                      {recordedVote === opt.value ? (
                        <span className="shrink-0 text-meta text-text-muted">current</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}

          {canVote ? (
            <>
              <Button
                size="lg"
                fullWidth
                className="mt-6"
                disabled={!selected || submitting}
                onClick={submit}
              >
                {submitting
                  ? 'Recording…'
                  : selected
                    ? `Submit ${VOTE_WORD[selected]} — ${votingPower?.toLocaleString() ?? ''} ${votingPower === 1 ? 'unit' : 'units'}`
                    : 'Choose a vote'}
              </Button>
              <p className="mt-2 text-center text-meta text-text-muted">
                One ballot per action — you can change your vote until it closes.
              </p>
            </>
          ) : null}
        </>
      )}

      {/* The standing tally is context on the ballot too — same figures as
          the record, quorum included when the resolution carries it. */}
      <section aria-labelledby="vote-tally-heading" className="mt-10">
        <h2
          id="vote-tally-heading"
          className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted"
        >
          Tally so far
        </h2>
        <div className="mt-3">
          <GovernanceMeter
            votesFor={
              DATA_MODE === 'live'
                ? (votesQ.data?.summary.find((s) => s.vote === 'for')?.votingPowerUnits ??
                  action.votesFor)
                : action.votesFor
            }
            votesAgainst={
              DATA_MODE === 'live'
                ? (votesQ.data?.summary.find((s) => s.vote === 'against')?.votingPowerUnits ??
                  action.votesAgainst)
                : action.votesAgainst
            }
            votesAbstain={
              DATA_MODE === 'live'
                ? (votesQ.data?.summary.find((s) => s.vote === 'abstain')?.votingPowerUnits ??
                  action.votesAbstain)
                : action.votesAbstain
            }
            quorumUnits={action.quorumUnits}
            passThresholdPct={action.passThresholdPct}
          />
        </div>
        {action.perUnitValueGbp != null ? (
          <p className="mt-3 text-meta text-text-secondary tnum">
            If it passes: {gbp(action.perUnitValueGbp)} per unit
            {action.totalValueGbp != null ? ` · ${gbp(action.totalValueGbp)} total` : ''}
          </p>
        ) : null}
      </section>
    </div>
  );
}
