'use client';

/**
 * /invite — the mobile InviteFriendsScreen's web counterpart. Referral
 * code + link with copy/share, reward stats, loyalty tier, history.
 * Fixture mode: the session has no referral activity yet, so the page
 * ships its honest zero states rather than a fabricated history.
 */

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { useToast } from '@/components/ui/Toast';
import { useSession } from '@/lib/session/SessionProvider';
import { useSignupWall } from '@/components/auth/SignupWall';

interface ReferralHistoryItem {
  name: string;
  dateLabel: string;
  status: 'invited' | 'joined' | 'rewarded';
  rewardAmount: number | null;
}

function referralCodeFor(username: string): string {
  // Deterministic per-account code — a live build issues this server-side
  // so attribution can't be guessed from client state.
  const base = username.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  const suffix = [...username].reduce((a, c) => (a + c.charCodeAt(0)) % 997, 7).toString(36).toUpperCase().padStart(3, '0');
  return `${base}-${suffix}`;
}

const STATUS_BADGE: Record<ReferralHistoryItem['status'], { label: string; className: string }> = {
  invited: { label: 'Invited', className: 'text-text-muted' },
  joined: { label: 'Joined', className: 'text-brand' },
  rewarded: { label: 'Rewarded', className: 'text-success-text' },
};

export default function InvitePage() {
  const { user, isGuest } = useSession();
  const toast = useToast();
  const { requireAuth, wall } = useSignupWall();
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);

  const code = useMemo(() => (user ? referralCodeFor(user.username) : ''), [user]);
  const link = code ? `https://thryftverse.com/invite/${code}` : '';

  // The session has no referral history in fixtures — honest zeros.
  const history: ReferralHistoryItem[] = [];
  const rewarded = history.filter((h) => h.status === 'rewarded').length;
  const joined = history.filter((h) => h.status !== 'invited').length;

  const copy = async (text: string, which: 'code' | 'link') => {
    if (!requireAuth('purchase')) return;
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
    if (!requireAuth('purchase')) return;
    const message = `Join me on ThryftVerse — the marketplace for second-hand fashion. Use my code ${code} and we both earn credit when you make your first sale. ${link}`;
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

  if (isGuest) {
    return (
      <div className="mx-auto max-w-xl px-4 py-10">
        <h1 className="text-title font-semibold text-text-primary">Invite &amp; earn</h1>
        <p className="mt-3 text-body text-text-secondary">
          Invite friends to ThryftVerse. When they make their first sale, you both earn
          ThryftVerse credit — give credit, get credit.
        </p>
        <Button variant="primary" className="mt-6" onClick={() => requireAuth('purchase')}>
          Sign in to get your code
        </Button>
        {wall}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-6 sm:px-0">
      <h1 className="text-title font-semibold text-text-primary">Invite &amp; earn</h1>
      <p className="mt-2 max-w-md text-body text-text-secondary">
        Invite friends to ThryftVerse. When they make their first sale, you both earn
        ThryftVerse credit — give credit, get credit.
      </p>

      {/* Referral code */}
      <section className="mt-8 border-t border-border-subtle pt-5" aria-labelledby="invite-code">
        <h2 id="invite-code" className="text-micro font-semibold uppercase tracking-wide text-text-muted">
          Your referral code
        </h2>
        <div className="mt-2 flex items-center justify-between gap-3">
          <code className="select-all text-title font-bold tracking-[0.2em] text-text-primary">{code}</code>
          <Button variant="outline" size="sm" icon={copied === 'code' ? 'check' : 'document'} onClick={() => copy(code, 'code')}>
            {copied === 'code' ? 'Copied' : 'Copy'}
          </Button>
        </div>
      </section>

      {/* Invite link */}
      <section className="mt-8 border-t border-border-subtle pt-5" aria-labelledby="invite-link">
        <h2 id="invite-link" className="text-micro font-semibold uppercase tracking-wide text-text-muted">
          Your invite link
        </h2>
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="min-w-0 flex-1 truncate text-body text-text-secondary">{link}</p>
          <IconButton name="link" aria-label="Copy invite link" onClick={() => copy(link, 'link')} />
        </div>
        <Button variant="primary" className="mt-3 w-full" icon="share" onClick={share}>
          Share invite
        </Button>
      </section>

      {/* Rewards */}
      <section className="mt-8 border-t border-border-subtle pt-5" aria-labelledby="invite-rewards">
        <h2 id="invite-rewards" className="text-caption font-semibold text-text-secondary">Your rewards</h2>
        <div className="mt-3 grid grid-cols-3 divide-x divide-border-subtle text-center">
          <Stat value={history.length} label="Invited" />
          <Stat value={joined} label="Joined" />
          <Stat value={rewarded} label="Rewarded" accent />
        </div>
        <p className="mt-4 text-meta text-text-muted">
          Earn ThryftVerse credit for each friend who completes their first sale. Credits apply to
          platform fees on your next listing.
        </p>
      </section>

      {/* Loyalty tier — only shown once actually earned, like mobile */}
      {rewarded > 0 ? (
        <section className="mt-8 border-t border-border-subtle pt-5">
          <p className="flex items-center gap-2 text-body font-semibold text-text-primary">
            <Icon name="verified" size={16} className="text-brand" />
            {rewarded >= 10 ? 'Gold' : rewarded >= 3 ? 'Silver' : 'Bronze'} referrer
            {rewarded < 10 ? (
              <span className="text-meta font-normal text-text-muted">
                · {rewarded >= 3 ? 10 - rewarded : 3 - rewarded} more to{' '}
                {rewarded >= 3 ? 'Gold' : 'Silver'}
              </span>
            ) : null}
          </p>
        </section>
      ) : null}

      {/* History */}
      <section className="mt-8 border-t border-border-subtle pt-5" aria-labelledby="invite-history">
        <h2 id="invite-history" className="text-caption font-semibold text-text-secondary">Referral history</h2>
        {history.length === 0 ? (
          <EmptyState
            compact
            icon="people"
            title="No invites yet"
            subtitle="Share your link — when a friend makes their first sale, it shows up here."
          />
        ) : (
          <ul className="mt-3 divide-y divide-border-subtle">
            {history.map((h, i) => (
              <li key={i} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="clamp-1 text-body font-semibold text-text-primary">{h.name}</p>
                  <p className="text-meta text-text-muted">{h.dateLabel}</p>
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
      {wall}
    </div>
  );
}

function Stat({ value, label, accent }: { value: number; label: string; accent?: boolean }) {
  return (
    <div>
      <p className={`tnum text-title font-bold ${accent ? 'text-success-text' : 'text-text-primary'}`}>{value}</p>
      <p className="mt-0.5 text-meta text-text-muted">{label}</p>
    </div>
  );
}
