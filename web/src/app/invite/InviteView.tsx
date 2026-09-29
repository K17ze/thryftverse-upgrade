'use client';

/**
 * /invite — the mobile InviteFriendsScreen's web counterpart. Referral
 * code + link with copy/share, reward stats, loyalty tier, history.
 *
 * Live mode reads the real referral API (web/lib/api/services/referrals,
 * mirroring the native referralsApi): the code is server-issued
 * (GET /users/:id/referral-code, get-or-create), stats come from
 * user_referral_attributions and history is the attributed signups. A
 * failed fetch renders an honest unavailable state with retry — never
 * fabricated zeros, never a client-minted code that cannot attribute.
 *
 * Fixture mode has no backend: it renders the designed zero states and a
 * clearly-labelled demo code so the surface is reviewable without
 * pretending attribution exists.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { useSession } from '@/lib/session/SessionProvider';
import { DATA_MODE } from '@/lib/api/client';
import {
  fetchReferralCode,
  fetchReferralHistory,
  fetchReferralStats,
  type ReferralHistoryItem,
} from '@/lib/api/services/referrals';
import { formatPrice } from '@/lib/utils/format';

const LIVE = DATA_MODE === 'live';

interface ReferralHistoryRow {
  id: string;
  name: string;
  dateLabel: string;
  status: 'invited' | 'joined' | 'rewarded';
  rewardAmount: number | null;
}

/** Fixture-only display code — labelled "Demo" wherever it renders. The
 *  live code is issued by the server; a client-derived value can never
 *  attribute a signup. */
function demoReferralCode(username: string): string {
  const base = username.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  const suffix = [...username].reduce((a, c) => (a + c.charCodeAt(0)) % 997, 7).toString(36).toUpperCase().padStart(3, '0');
  return `${base}-${suffix}`;
}

const STATUS_BADGE: Record<ReferralHistoryRow['status'], { label: string; className: string }> = {
  invited: { label: 'Invited', className: 'text-text-muted' },
  joined: { label: 'Joined', className: 'text-brand' },
  rewarded: { label: 'Rewarded', className: 'text-success-text' },
};

function historyRowFor(item: ReferralHistoryItem): ReferralHistoryRow {
  const joinedAt = new Date(item.joinedAt);
  return {
    id: item.id,
    name: item.username ? `@${item.username}` : 'A new member',
    dateLabel: Number.isNaN(joinedAt.getTime())
      ? ''
      : joinedAt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
    status: 'joined',
    // No reward ledger exists yet — an attributed join carries no amount.
    rewardAmount: null,
  };
}

export function InviteView() {
  const router = useRouter();
  const { user, isGuest } = useSession();
  const toast = useToast();
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);

  const authed = LIVE && !!user && !isGuest;

  const codeQuery = useQuery({
    queryKey: ['referral-code', user?.id],
    queryFn: ({ signal }) => fetchReferralCode(signal),
    enabled: authed,
    staleTime: 5 * 60_000,
  });
  const statsQuery = useQuery({
    queryKey: ['referral-stats', user?.id],
    queryFn: ({ signal }) => fetchReferralStats(signal),
    enabled: authed,
    staleTime: 60_000,
  });
  const historyQuery = useQuery({
    queryKey: ['referral-history', user?.id],
    queryFn: ({ signal }) => fetchReferralHistory(signal),
    enabled: authed,
    staleTime: 60_000,
  });

  const code = LIVE ? (codeQuery.data ?? null) : user ? demoReferralCode(user.username) : null;
  const link = code ? `https://thryftverse.com/invite/${code}` : null;

  const stats = LIVE
    ? statsQuery.data ?? null
    : { invited: 0, joined: 0, rewarded: 0, creditsBalance: 0 };
  const history: ReferralHistoryRow[] = LIVE
    ? (historyQuery.data ?? []).slice(0, 20).map(historyRowFor)
    : [];

  const copy = async (text: string, which: 'code' | 'link') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      toast.show('Copied', 'success');
      window.setTimeout(() => setCopied((c) => (c === which ? null : c)), 1600);
    } catch {
      toast.show("Couldn't copy — select the text manually", 'error');
    }
  };

  const share = async () => {
    if (!link || !code) return;
    const message = `Join me on ThryftVerse — the marketplace for second-hand fashion. Sign up with my code ${code}: ${link}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'ThryftVerse', text: message });
      } catch {
        /* dismissed */
      }
      return;
    }
    await copy(message, 'link');
  };

  if (isGuest || !user) {
    return (
      <div className="mx-auto max-w-xl px-4 py-10">
        <h1 className="text-screen-title text-text-primary">Invite &amp; earn</h1>
        <p className="mt-3 text-body text-text-secondary">
          Invite friends to ThryftVerse — the marketplace for second-hand fashion.
          Your referral code is issued to your account once you sign in.
        </p>
        <Button variant="primary" className="mt-6" onClick={() => router.push('/auth')}>
          Sign in to get your code
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-6 sm:px-0 lg:max-w-5xl lg:px-6 lg:py-10">
      <h1 className="text-screen-title text-text-primary">Invite &amp; earn</h1>
      <p className="mt-2 max-w-md text-body text-text-secondary lg:max-w-lg">
        Invite friends to ThryftVerse — the marketplace for second-hand fashion.
        Friends who sign up with your code count toward your referrer tier.
      </p>

      {/* Two-column at lg — share tools left, reward record right. The
          sections carry the same hairline tops, so the columns start on
          one line; mobile is the original single stack. */}
      <div className="lg:mt-4 lg:grid lg:grid-cols-2 lg:gap-x-14">
      <div>
      {/* Referral code */}
      <section className="mt-8 border-t border-border-subtle pt-5" aria-labelledby="invite-code">
        <h2 id="invite-code" className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">
          Your referral code
        </h2>
        {LIVE && codeQuery.isPending ? (
          <Skeleton className="mt-2 h-8 w-40" />
        ) : LIVE && codeQuery.isError ? (
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-body text-text-muted">
              <Icon name="alert" size={16} className="shrink-0" />
              Referral code unavailable right now.
            </p>
            <Button variant="outline" size="sm" icon="refresh" onClick={() => void codeQuery.refetch()}>
              Retry
            </Button>
          </div>
        ) : code ? (
          <>
            <div className="mt-2 flex items-center justify-between gap-3">
              <code className="select-all text-price-list tracking-[0.2em] text-text-primary">{code}</code>
              <Button variant="outline" size="sm" icon={copied === 'code' ? 'check' : 'document'} onClick={() => copy(code, 'code')}>
                {copied === 'code' ? 'Copied' : 'Copy'}
              </Button>
            </div>
            <p className="mt-2 text-meta text-text-muted">
              {LIVE
                ? 'Issued to your account — friends apply it at signup.'
                : "Demo code — the design preview can't attribute signups."}
            </p>
          </>
        ) : null}
      </section>

      {/* Invite link — only exists once a real code is issued */}
      {link ? (
        <section className="mt-8 border-t border-border-subtle pt-5" aria-labelledby="invite-link">
          <h2 id="invite-link" className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">
            Your invite link
          </h2>
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="min-w-0 flex-1 truncate text-body text-text-secondary">{link}</p>
            <IconButton name="link" aria-label="Copy invite link" onClick={() => copy(link, 'link')} />
          </div>
          <Button variant="primary" className="mt-3 w-full lg:w-auto lg:min-w-[200px]" icon="share" onClick={share}>
            Share invite
          </Button>
        </section>
      ) : null}
      </div>

      <div>
      {/* Rewards */}
      <section className="mt-8 border-t border-border-subtle pt-5" aria-labelledby="invite-rewards">
        <h2 id="invite-rewards" className="text-caption font-semibold text-text-secondary">Your rewards</h2>
        {LIVE && statsQuery.isPending ? (
          <div className="mt-3 grid grid-cols-3 divide-x divide-border-subtle text-center">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex flex-col items-center gap-1.5">
                <Skeleton className="h-7 w-8" />
                <Skeleton className="h-3 w-12" />
              </div>
            ))}
          </div>
        ) : LIVE && statsQuery.isError ? (
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-body text-text-muted">
              <Icon name="alert" size={16} className="shrink-0" />
              Stats unavailable right now.
            </p>
            <Button variant="outline" size="sm" icon="refresh" onClick={() => void statsQuery.refetch()}>
              Retry
            </Button>
          </div>
        ) : stats ? (
          <>
            <div className="mt-3 grid grid-cols-3 divide-x divide-border-subtle text-center">
              <Stat value={stats.invited} label="Invited" />
              <Stat value={stats.joined} label="Joined" />
              <Stat value={stats.rewarded} label="Rewarded" accent />
            </div>
            {stats.creditsBalance > 0 ? (
              <p className="mt-3 text-center text-body font-semibold text-success-text">
                {formatPrice(stats.creditsBalance)} credit earned
              </p>
            ) : null}
          </>
        ) : null}
        <p className="mt-4 text-meta text-text-muted">
          Referral credit payouts aren&apos;t live yet — when they are, your balance lands here.
        </p>
      </section>

      {/* Loyalty tier — only shown once actually earned, like mobile */}
      {stats && stats.rewarded > 0 ? (
        <section className="mt-8 border-t border-border-subtle pt-5">
          <p className="flex items-center gap-2 text-body font-semibold text-text-primary">
            <Icon name="verified" size={16} className="text-commerce-trust" />
            {stats.rewarded >= 10 ? 'Gold' : stats.rewarded >= 3 ? 'Silver' : 'Bronze'} referrer
            {stats.rewarded < 10 ? (
              <span className="text-meta font-normal text-text-muted">
                · {stats.rewarded >= 3 ? 10 - stats.rewarded : 3 - stats.rewarded} more to{' '}
                {stats.rewarded >= 3 ? 'Gold' : 'Silver'}
              </span>
            ) : null}
          </p>
        </section>
      ) : null}

      {/* History */}
      <section className="mt-8 border-t border-border-subtle pt-5" aria-labelledby="invite-history">
        <h2 id="invite-history" className="text-caption font-semibold text-text-secondary">Referral history</h2>
        {LIVE && historyQuery.isPending ? (
          <div className="mt-3 space-y-3">
            {[0, 1].map((i) => (
              <div key={i} className="flex items-center justify-between gap-3 py-1">
                <div className="flex flex-col gap-1.5">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-16" />
                </div>
                <Skeleton className="h-4 w-12" />
              </div>
            ))}
          </div>
        ) : LIVE && historyQuery.isError ? (
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-body text-text-muted">
              <Icon name="alert" size={16} className="shrink-0" />
              History unavailable right now.
            </p>
            <Button variant="outline" size="sm" icon="refresh" onClick={() => void historyQuery.refetch()}>
              Retry
            </Button>
          </div>
        ) : history.length === 0 ? (
          <EmptyState
            compact
            icon="people"
            title="No invites yet"
            subtitle="Share your link — friends who join with your code show up here."
          />
        ) : (
          <ul className="mt-3 divide-y divide-border-subtle">
            {history.map((h) => (
              <li key={h.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="clamp-1 text-body font-semibold text-text-primary">{h.name}</p>
                  {h.dateLabel ? <p className="text-meta text-text-muted">{h.dateLabel}</p> : null}
                </div>
                {h.rewardAmount != null ? (
                  <span className="tnum text-body font-semibold text-success-text">
                    +£{h.rewardAmount.toFixed(2)}
                  </span>
                ) : null}
                <span className={`text-meta font-semibold ${STATUS_BADGE[h.status].className}`}>
                  {STATUS_BADGE[h.status].label}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      </div>
      </div>
    </div>
  );
}

function Stat({ value, label, accent }: { value: number; label: string; accent?: boolean }) {
  return (
    <div>
      <p className={`text-price-list ${accent ? 'text-success-text' : 'text-text-primary'}`}>{value}</p>
      <p className="mt-0.5 text-meta text-text-muted">{label}</p>
    </div>
  );
}
