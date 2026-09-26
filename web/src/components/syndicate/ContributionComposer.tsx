'use client';

/**
 * Contribution composer — the join/commit surface of a pool. Amount in,
 * live share of the pooled buy out, then commit. Every non-open phase
 * degrades to a quiet notice; guests get the soft signup wall on commit.
 */

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { useSignupWall } from '@/components/auth/SignupWall';
import { gbp } from '@/components/coown/format';
import type { CoOwnAsset } from '@/lib/contracts/coown';
import type { ContributionIssue, Syndicate } from '@/lib/contracts/syndicate';
import {
  isMemberCapReached,
  memberByUserId,
  remainingGbp,
  sharePctOfPool,
  syndicatePhase,
  unitsForContribution,
} from '@/lib/contracts/syndicate';
import { useSyndicateActions } from '@/lib/hooks/syndicate-queries';
import { useSession } from '@/lib/session/SessionProvider';

const ISSUE_COPY: Record<ContributionIssue, string> = {
  pool_closed: 'This pool is no longer accepting funds.',
  member_cap: 'This pool has reached its member cap.',
  below_min: '',
  above_max: '',
  over_remaining: '',
};

function parseAmount(raw: string): number | null {
  const n = Number(raw);
  return raw.trim() !== '' && Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

export function ContributionComposer({
  syndicate,
  asset,
}: {
  syndicate: Syndicate;
  asset: CoOwnAsset;
}) {
  const { user, isGuest } = useSession();
  const { requireAuth, wall } = useSignupWall();
  const { contribute } = useSyndicateActions();
  const { show } = useToast();
  const [raw, setRaw] = useState('');
  const [touched, setTouched] = useState(false);

  const phase = syndicatePhase(syndicate, asset);
  const member = user ? memberByUserId(syndicate, user.id) : undefined;
  const cappedOut = isMemberCapReached(syndicate) && !member;
  const headroom = Math.max(0, syndicate.maxContributionGbp - (member?.contributionGbp ?? 0));
  const remaining = remainingGbp(syndicate, asset);
  const amount = parseAmount(raw);

  // Live validation — the same rules the action enforces, surfaced early.
  const issue = useMemo<ContributionIssue | null>(() => {
    if (phase !== 'open') return 'pool_closed';
    if (cappedOut) return 'member_cap';
    if (amount == null) return null;
    if (amount < syndicate.minContributionGbp) return 'below_min';
    if (amount > headroom + 0.005) return 'above_max';
    if (amount > remaining + 0.005) return 'over_remaining';
    return null;
  }, [phase, cappedOut, amount, syndicate.minContributionGbp, headroom, remaining]);

  const issueText =
    issue === 'below_min'
      ? `Minimum contribution is ${gbp(syndicate.minContributionGbp)}`
      : issue === 'above_max'
        ? `Your total commitment can't exceed ${gbp(syndicate.maxContributionGbp)} — you can add up to ${gbp(headroom)}`
        : issue === 'over_remaining'
          ? `Only ${gbp(remaining)} left to fund`
          : issue
            ? ISSUE_COPY[issue]
            : null;

  const preview = amount != null && issue == null && amount > 0;

  const commit = () => {
    if (amount == null || issue != null) {
      setTouched(true);
      return;
    }
    if (!requireAuth('purchase')) return;
    if (!user) return;
    const result = contribute(syndicate.id, amount, {
      id: user.id,
      username: user.username,
      displayName: null,
      avatar: user.avatar,
    });
    if (!result.ok) {
      show('Contribution not accepted — check the pool rules', 'error');
      return;
    }
    setRaw('');
    setTouched(false);
    show(result.funded ? 'Committed — the pool is fully funded' : 'Contribution committed', 'success');
  };

  if (phase === 'executed') {
    return (
      <p className="flex items-start gap-2 text-meta text-text-secondary">
        <Icon name="check" size={14} className="mt-0.5 shrink-0 text-coown-up" />
        Buy executed — {syndicate.unitsTarget} units allocated to members pro-rata.
      </p>
    );
  }
  if (phase === 'dissolved') {
    return (
      <p className="flex items-start gap-2 text-meta text-text-secondary">
        <Icon name="info" size={14} className="mt-0.5 shrink-0 text-text-muted" />
        This pool was dissolved and contributions returned.
      </p>
    );
  }
  if (phase === 'funded') {
    return (
      <p className="flex items-start gap-2 text-meta text-text-secondary">
        <Icon name="check" size={14} className="mt-0.5 shrink-0 text-antique-gold" />
        Pool fully funded — the pooled buy is queued.
      </p>
    );
  }
  if (cappedOut) {
    return (
      <p className="flex items-start gap-2 text-meta text-text-secondary">
        <Icon name="people" size={14} className="mt-0.5 shrink-0 text-text-muted" />
        Member cap reached — this pool isn&rsquo;t taking new members.
      </p>
    );
  }

  return (
    <div>
      <label htmlFor="syndicate-amount" className="text-label font-semibold uppercase tracking-wider text-text-muted">
        Your contribution
      </label>
      <div className="relative mt-2">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-body text-text-muted">
          £
        </span>
        <input
          id="syndicate-amount"
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          onBlur={() => setTouched(true)}
          placeholder={gbp(syndicate.minContributionGbp).replace('£', '')}
          aria-invalid={touched && issue != null}
          className="h-11 w-full rounded-md border border-border bg-input pl-8 pr-3.5 text-body tnum text-input-text placeholder:text-text-muted transition-colors focus:border-text-muted focus:outline-none"
        />
      </div>
      <p className="mt-1.5 text-meta text-text-muted">
        {gbp(syndicate.minContributionGbp)}–{gbp(syndicate.maxContributionGbp)} per member
        {member ? ` · ${gbp(headroom)} headroom left` : ''}
      </p>

      {touched && issue != null && amount != null ? (
        <p className="mt-2 flex items-start gap-1.5 text-meta text-danger-text" role="alert">
          <Icon name="alert" size={13} className="mt-0.5 shrink-0" />
          {issueText}
        </p>
      ) : null}

      {preview ? (
        <p className="mt-2 text-meta text-text-secondary">
          Your share:{' '}
          <span className="font-semibold text-text-primary tnum">
            {sharePctOfPool(amount, syndicate, asset).toFixed(1)}%
          </span>
          {' · ≈'}
          <span className="tnum">{unitsForContribution(amount, asset).toFixed(2)}</span> units
          {member ? (
            <>
              {' · total '}
              <span className="tnum">{gbp(member.contributionGbp + amount)}</span>
            </>
          ) : null}
        </p>
      ) : null}

      <Button
        variant="primary"
        size="md"
        fullWidth
        className="mt-4"
        disabled={amount == null || (touched && issue != null)}
        onClick={commit}
      >
        {isGuest ? 'Sign in to join' : member ? 'Add funds' : 'Join this pool'}
      </Button>
      {wall}
    </div>
  );
}
