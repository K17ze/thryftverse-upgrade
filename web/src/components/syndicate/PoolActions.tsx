'use client';

/**
 * PoolActions — the lifecycle rail of a syndicate detail. What shows is
 * phase-driven: members of a funded pool settle the queued buy; members
 * of an open pool withdraw their commitment; the organizer of an
 * unsettled pool can dissolve it (releases every commitment). Every
 * transition writes the shared syndicate cache — the order history the
 * page renders is the record it produces.
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
import { useSyndicateLifecycle } from './syndicateActions';

type ConfirmKind = 'withdraw' | 'dissolve' | null;

export function PoolActions({
  syndicate,
  asset,
}: {
  syndicate: Syndicate;
  asset: CoOwnAsset;
}) {
  const { user } = useSession();
  const { withdraw, dissolve, executePool } = useSyndicateLifecycle();
  const { show } = useToast();
  const [confirming, setConfirming] = useState<ConfirmKind>(null);

  const phase = syndicatePhase(syndicate, asset);
  const member = user ? memberByUserId(syndicate, user.id) : undefined;
  const isOrganizer = user?.id === syndicate.organizerId;

  const fail = (reason: string) => show(reason, 'error');

  const doWithdraw = () => {
    if (!user) return;
    const r = withdraw(syndicate.id, user.id);
    if (!r.ok) fail(r.reason);
    else show('Commitment withdrawn', 'success');
    setConfirming(null);
  };

  const doDissolve = () => {
    if (!user) return;
    const r = dissolve(syndicate.id, user.id);
    if (!r.ok) fail(r.reason);
    else show('Pool dissolved — commitments returned', 'success');
    setConfirming(null);
  };

  const doExecute = () => {
    if (!user) return;
    const r = executePool(syndicate.id, { id: user.id, username: user.username });
    if (!r.ok) fail(r.reason);
    else show('Pooled buy executed — your units are in Portfolio', 'success');
  };

  const canSettle = phase === 'funded' && member != null;
  const canWithdraw = phase === 'open' && member != null && member.role !== 'organizer';
  const canDissolve = (phase === 'open' || phase === 'funded') && isOrganizer;

  if (!canSettle && !canWithdraw && !canDissolve) return null;

  return (
    <div className={canSettle ? 'mt-4 border-t border-border-subtle pt-4' : 'mt-3'}>
      {canSettle ? (
        <>
          <Button size="md" fullWidth onClick={doExecute}>
            Settle pooled buy
          </Button>
          <p className="mt-2 text-meta text-text-muted">
            Executes {syndicate.unitsTarget} units at the current price and allocates them to members pro-rata.
          </p>
        </>
      ) : null}

      {canWithdraw ? (
        <Button
          variant="outline"
          size="md"
          fullWidth
          className={canSettle ? 'mt-3' : ''}
          onClick={() => setConfirming('withdraw')}
        >
          Withdraw {gbp(member!.contributionGbp)}
        </Button>
      ) : null}

      {canDissolve ? (
        <Button
          variant="quiet"
          size="md"
          fullWidth
          className="mt-2 text-danger-text hover:bg-danger-subtle"
          onClick={() => setConfirming('dissolve')}
        >
          Dissolve pool
        </Button>
      ) : null}

      <Sheet
        open={confirming != null}
        onClose={() => setConfirming(null)}
        title={confirming === 'withdraw' ? 'Withdraw commitment?' : 'Dissolve pool?'}
        maxWidth={420}
      >
        <div className="p-5">
          {confirming === 'withdraw' ? (
            <p className="flex items-start gap-2 text-body text-text-secondary">
              <Icon name="info" size={16} className="mt-0.5 shrink-0 text-text-muted" />
              Your {gbp(member?.contributionGbp ?? 0)} commitment is released and you leave the
              pool. You can rejoin while it stays open.
            </p>
          ) : (
            <p className="flex items-start gap-2 text-body text-text-secondary">
              <Icon name="warning" size={16} className="mt-0.5 shrink-0 text-warning-text" />
              Dissolving returns every member&rsquo;s commitment and closes the pool
              permanently. This can&rsquo;t be undone.
            </p>
          )}
          <div className="mt-5 flex gap-2">
            <Button variant="secondary" fullWidth onClick={() => setConfirming(null)}>
              Keep pool
            </Button>
            <Button
              variant={confirming === 'dissolve' ? 'danger' : 'primary'}
              fullWidth
              onClick={confirming === 'withdraw' ? doWithdraw : doDissolve}
            >
              {confirming === 'withdraw' ? 'Withdraw' : 'Dissolve'}
            </Button>
          </div>
        </div>
      </Sheet>
    </div>
  );
}
