'use client';

/**
 * PoolActions — the lifecycle rail of a pool detail. What shows is
 * phase-driven and limited to what the contract exposes: members of an
 * open pool can withdraw their commitment. Settlement happens
 * server-side once the pool is funded (there is no execute endpoint)
 * and 'dissolved' is a backend-set status, so neither is offered here.
 * Every transition writes the shared syndicate cache — the order
 * history the page renders is the record it produces.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Sheet } from '@/components/ui/Sheet';
import { useToast } from '@/components/ui/Toast';
import { gbp } from '@/components/coown/format';
import type { CoOwnAsset } from '@/lib/contracts/coown';
import type { Syndicate } from '@/lib/contracts/syndicate';
import { memberByUserId, syndicatePhase } from '@/lib/contracts/syndicate';
import { useSession } from '@/lib/session/SessionProvider';
import { usePoolLifecycle } from './poolLifecycle';

export function PoolActions({
  syndicate,
  asset,
}: {
  syndicate: Syndicate;
  asset: CoOwnAsset;
}) {
  const { user } = useSession();
  const { withdraw } = usePoolLifecycle();
  const { show } = useToast();
  const [confirming, setConfirming] = useState(false);

  const phase = syndicatePhase(syndicate, asset);
  const member = user ? memberByUserId(syndicate, user.id) : undefined;

  const doWithdraw = () => {
    if (!user) return;
    const r = withdraw(syndicate.id, user.id);
    if (!r.ok) show(r.reason, 'error');
    else show('Commitment withdrawn', 'success');
    setConfirming(false);
  };

  // Withdrawal is open to every member of an open pool — the wire
  // contract draws no organizer/member distinction for it.
  const canWithdraw = phase === 'open' && member != null;

  if (!canWithdraw) return null;

  return (
    <div className="mt-3">
      <Button
        variant="outline"
        size="md"
        fullWidth
        onClick={() => setConfirming(true)}
      >
        Withdraw {gbp(member!.contributionGbp)}
      </Button>

      <Sheet
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Withdraw commitment?"
        maxWidth={420}
      >
        <div className="p-5">
          <p className="flex items-start gap-2 text-body text-text-secondary">
            <Icon name="info" size={16} className="mt-0.5 shrink-0 text-text-muted" />
            Your {gbp(member.contributionGbp)} commitment is released and you leave the
            pool. You can rejoin while it stays open.
          </p>
          <div className="mt-5 flex gap-2">
            <Button variant="secondary" fullWidth onClick={() => setConfirming(false)}>
              Keep pool
            </Button>
            <Button variant="primary" fullWidth onClick={doWithdraw}>
              Withdraw
            </Button>
          </div>
        </div>
      </Sheet>
    </div>
  );
}
