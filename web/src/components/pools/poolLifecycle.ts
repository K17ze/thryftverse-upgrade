'use client';

/**
 * Pool lifecycle — withdraw is the only member-facing state
 * transition the syndicate contract exposes client-side
 * (POST /co-own/syndicates/:id/withdrawals in the native marketApi
 * contract). A funded pool's buy settles server-side — there is no
 * execute/settle endpoint — and 'dissolved' is a status the backend
 * sets, not a client action, so neither is offered here. The actions
 * live in the component layer and write the same `['syndicates']` cache
 * `useSyndicates` reads, so every surface stays consistent.
 *
 * Session-ledger posture (same as the query hooks): a contribution debits
 * the wallet's GBP pocket when it lands, so withdrawal is a real refund —
 * the wallet only ever pays back what this session debited
 * (see syndicateStakeInWallet). Seeded commitments release without cash
 * movement, exactly what the order history records.
 */

import { useQueryClient } from '@tanstack/react-query';
import type { Syndicate, SyndicateExecution } from '@/lib/contracts/syndicate';
import { memberByUserId, syndicatePhase } from '@/lib/contracts/syndicate';
import type { CoOwnAsset } from '@/lib/contracts/coown';
import { CO_OWN_ASSETS } from '@/lib/data/fixtures-coown';
import { SYNDICATES } from '@/lib/data/fixtures-syndicate';
import { walletKeys } from '@/components/wallet/walletKeys';
import type { WalletData } from '@/components/wallet/useWalletData';
import {
  creditSyndicateRefund,
  syndicateStakeInWallet,
} from '@/lib/hooks/syndicate-queries';

const SYNDICATES_KEY = ['syndicates'] as const;

/** Same seeding contract as the query hooks — never mutate the fixture. */
function seedSyndicates(): Syndicate[] {
  return SYNDICATES.map((s) => ({
    ...s,
    members: s.members.map((m) => ({ ...m })),
    executions: s.executions.map((e) => ({ ...e })),
  }));
}

let counter = 0;
const nextId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}${Math.random()
    .toString(36)
    .slice(2, 5)}`;

export type LifecycleResult = { ok: true } | { ok: false; reason: string };

function entry(partial: Omit<SyndicateExecution, 'id' | 'at'>): SyndicateExecution {
  return { id: nextId('syn-e'), at: new Date().toISOString(), ...partial };
}

export function usePoolLifecycle() {
  const queryClient = useQueryClient();

  const readPool = (id: string) =>
    (queryClient.getQueryData<Syndicate[]>([...SYNDICATES_KEY]) ?? seedSyndicates()).find(
      (s) => s.id === id,
    );

  /** Session price first (fills move it in the cache), fixture fallback. */
  const readAsset = (id: string): CoOwnAsset | undefined =>
    queryClient.getQueryData<CoOwnAsset | null>(['coown', 'asset', id]) ??
    (queryClient.getQueryData<CoOwnAsset[]>(['coown', 'assets']) ?? CO_OWN_ASSETS).find(
      (a) => a.id === id,
    ) ??
    CO_OWN_ASSETS.find((a) => a.id === id);

  const writePool = (fn: (list: Syndicate[]) => Syndicate[]) => {
    queryClient.setQueryData<Syndicate[]>([...SYNDICATES_KEY], (old) =>
      fn(old ?? seedSyndicates()),
    );
  };

  return {
    /**
     * A member pulls their commitment out of an open pool — the wallet is
     * refunded whatever the session ledger actually debited, and the
     * history logs the release. The wire contract withdraws an amount;
     * the UI exposes the full commitment, which leaves the pool.
     */
    withdraw(poolId: string, userId: string): LifecycleResult {
      const pool = readPool(poolId);
      if (!pool) return { ok: false, reason: 'Pool not found.' };
      const asset = readAsset(pool.assetId);
      if (!asset || syndicatePhase(pool, asset) !== 'open') {
        return { ok: false, reason: 'Commitments are locked once the pool is funded.' };
      }
      const member = memberByUserId(pool, userId);
      if (!member) return { ok: false, reason: 'You have no commitment in this pool.' };

      // Refund only what this session debited — capped at the commitment,
      // and zero for seeded memberships that never moved wallet funds.
      const wallet = queryClient.getQueryData<WalletData>(walletKeys.all(userId));
      const refundGbp = Math.min(
        member.contributionGbp,
        syndicateStakeInWallet(wallet, poolId, userId),
      );

      writePool((list) =>
        list.map((s) =>
          s.id === poolId
            ? {
                ...s,
                members: s.members.filter((m) => m.userId !== userId),
                executions: [
                  ...s.executions,
                  entry({
                    kind: 'refund',
                    actorUsername: member.username,
                    amountGbp: member.contributionGbp,
                    units: null,
                    note: `@${member.username} withdrew their commitment.`,
                  }),
                ],
              }
            : s,
        ),
      );
      creditSyndicateRefund(queryClient, userId, pool, refundGbp);
      return { ok: true };
    },
  };
}
