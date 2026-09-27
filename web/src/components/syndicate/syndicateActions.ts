'use client';

/**
 * Syndicate lifecycle actions — withdraw, dissolve and settle. These are
 * the pool state transitions the contract already models (members leave,
 * pools dissolve into refunds, a funded pool's queued buy executes) but
 * lib/hooks only wrote create/contribute. The actions live in the
 * component layer because the syndicate hook file sits outside the
 * ownership boundary — they write the same `['syndicates']` cache
 * `useSyndicates` reads, so every surface stays consistent.
 *
 * Session-ledger posture (same as the query hooks): a contribution debits
 * the wallet's GBP pocket when it lands, so withdrawal and dissolution are
 * real refunds — the wallet only ever pays back what this session debited
 * (see syndicateStakeInWallet). Seeded commitments release without cash
 * movement, exactly what the order history records.
 */

import { useQueryClient } from '@tanstack/react-query';
import type { CoOwnAsset, CoOwnPosition } from '@/lib/contracts/coown';
import type { Syndicate, SyndicateExecution } from '@/lib/contracts/syndicate';
import {
  memberByUserId,
  pooledGbp,
  syndicatePhase,
  unitsForContribution,
} from '@/lib/contracts/syndicate';
import { CO_OWN_ASSETS, CO_OWN_POSITIONS } from '@/lib/data/fixtures-coown';
import { SYNDICATES } from '@/lib/data/fixtures-syndicate';
import { walletKeys } from '@/components/wallet/walletKeys';
import type { WalletData } from '@/components/wallet/useWalletData';
import {
  creditSyndicateRefund,
  syndicateStakeInWallet,
} from '@/lib/hooks/syndicate-queries';

const SYNDICATES_KEY = ['syndicates'] as const;
const POSITIONS_KEY = ['coown', 'positions'] as const;

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

const round2 = (n: number) => Math.round(n * 100) / 100;

export type LifecycleResult = { ok: true } | { ok: false; reason: string };

function entry(partial: Omit<SyndicateExecution, 'id' | 'at'>): SyndicateExecution {
  return { id: nextId('syn-e'), at: new Date().toISOString(), ...partial };
}

export function useSyndicateLifecycle() {
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
     * history logs the release. Organizers can't withdraw; dissolving the
     * pool is their exit.
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
      if (member.role === 'organizer') {
        return { ok: false, reason: 'Organizers dissolve a pool rather than withdraw.' };
      }

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

    /**
     * Organizer dissolves a pool that hasn't executed — every member's
     * commitment is released and each release lands as a refund line.
     * The viewer's released stake is credited back to the wallet; other
     * members' releases are recorded on the pool, not on our ledger.
     */
    dissolve(poolId: string, userId: string): LifecycleResult {
      const pool = readPool(poolId);
      if (!pool) return { ok: false, reason: 'Pool not found.' };
      if (pool.organizerId !== userId) {
        return { ok: false, reason: 'Only the organizer can dissolve this pool.' };
      }
      if (pool.status !== 'open') {
        return { ok: false, reason: 'This pool has already settled.' };
      }

      const wallet = queryClient.getQueryData<WalletData>(walletKeys.all(userId));
      const viewerStake = syndicateStakeInWallet(wallet, poolId, userId);

      const refunds: SyndicateExecution[] = pool.members.map((m) =>
        entry({
          kind: 'refund',
          actorUsername: m.username,
          amountGbp: m.contributionGbp,
          units: null,
          note: null,
        }),
      );
      writePool((list) =>
        list.map((s) =>
          s.id === poolId
            ? {
                ...s,
                status: 'dissolved',
                executions: [
                  ...s.executions,
                  ...refunds,
                  entry({
                    kind: 'note',
                    actorUsername: null,
                    amountGbp: null,
                    units: null,
                    note: `Pool dissolved by @${pool.organizerUsername} — commitments returned.`,
                  }),
                ],
              }
            : s,
        ),
      );
      creditSyndicateRefund(queryClient, userId, pool, viewerStake);
      return { ok: true };
    },

    /**
     * Settle a funded pool — the queued buy executes at the current unit
     * price, members' pro-rata shares are recorded, and the viewer's
     * share lands in their Co-Own positions. Any member can settle a
     * funded pool; the history records who did.
     */
    executePool(poolId: string, actor: { id: string; username: string }): LifecycleResult {
      const pool = readPool(poolId);
      if (!pool) return { ok: false, reason: 'Pool not found.' };
      const asset = readAsset(pool.assetId);
      if (!asset) return { ok: false, reason: 'Target asset unavailable.' };
      if (syndicatePhase(pool, asset) !== 'funded') {
        return { ok: false, reason: 'This pool isn\u2019t ready to settle.' };
      }
      const member = memberByUserId(pool, actor.id);
      if (!member) return { ok: false, reason: 'Only pool members can settle the buy.' };

      const amountGbp = pooledGbp(pool);
      writePool((list) =>
        list.map((s) =>
          s.id === poolId
            ? {
                ...s,
                status: 'executed',
                executions: [
                  ...s.executions,
                  entry({
                    kind: 'purchase',
                    actorUsername: actor.username,
                    amountGbp,
                    units: pool.unitsTarget,
                    note: `Settled by @${actor.username} — ${gbpShare(amountGbp)} bought ${pool.unitsTarget} units at ${gbpShare(asset.unitPriceGbp)} each.`,
                  }),
                ],
              }
            : s,
        ),
      );

      // The viewer's pro-rata share lands in their positions — blended
      // into avg entry like any other buy.
      const shareUnits = round2(unitsForContribution(member.contributionGbp, asset));
      if (shareUnits > 0) {
        queryClient.setQueryData<CoOwnPosition[]>([...POSITIONS_KEY], (old) => {
          const list = old ?? CO_OWN_POSITIONS;
          const existing = list.find((p) => p.assetId === pool.assetId);
          if (!existing) {
            return [
              ...list,
              {
                assetId: pool.assetId,
                units: shareUnits,
                avgEntryPriceGbp: asset.unitPriceGbp,
                realizedProfitGbp: 0,
              },
            ];
          }
          return list.map((p) =>
            p.assetId === pool.assetId
              ? {
                  ...p,
                  units: round2(p.units + shareUnits),
                  avgEntryPriceGbp: round2(
                    (p.units * p.avgEntryPriceGbp + shareUnits * asset.unitPriceGbp) /
                      (p.units + shareUnits),
                  ),
                }
              : p,
          );
        });
      }
      return { ok: true };
    },
  };
}

/** Cheap inline formatter — the execution note is prose, not a money cell. */
function gbpShare(n: number): string {
  return `£${n.toFixed(2)}`;
}
