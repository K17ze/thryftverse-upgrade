'use client';

/**
 * Syndicate queries — the react-query cache doubles as the session pool
 * store, mirroring useSupportTickets. Seeds from fixtures-syndicate on
 * first mount; create/contribute mutate the cache so pools survive
 * in-app navigation for the whole client session. A hard reload
 * re-seeds — honest fixture-mode behaviour.
 * Live mode: no syndicate endpoints exist on the backend, so reads
 * return an empty list and writes stay disabled — fixture pools are
 * never presented as a real user's pools.
 */

import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { CoOwnAsset } from '@/lib/contracts/coown';
import type {
  ContributionIssue,
  Syndicate,
  SyndicateMember,
} from '@/lib/contracts/syndicate';
import {
  checkContribution,
  remainingGbp,
} from '@/lib/contracts/syndicate';
import { CO_OWN_ASSETS } from '@/lib/data/fixtures-coown';
import { SYNDICATES } from '@/lib/data/fixtures-syndicate';
import { DATA_MODE } from '@/lib/api/client';
import {
  fetchWallet,
  type WalletData,
} from '@/components/wallet/useWalletData';
import type { WalletLedgerEntry } from '@/components/wallet/ledgerViewModel';
import { walletKeys } from '@/components/wallet/walletKeys';

const SYNDICATES_KEY = ['syndicates'] as const;

const tick = (ms = 120) => new Promise((r) => setTimeout(r, ms));

/** Deep copy — session mutations must never write into the fixture. */
function seedSyndicates(): Syndicate[] {
  return SYNDICATES.map((s) => ({
    ...s,
    members: s.members.map((m) => ({ ...m })),
    executions: s.executions.map((e) => ({ ...e })),
  }));
}

async function fetchSyndicates(): Promise<Syndicate[]> {
  // Live mode: no syndicate endpoints exist on the backend, so the
  // honest answer is an empty list — the app routes render an explicit
  // "not available in this build" notice over it. Fixture pools are
  // never presented as a live user's pools.
  if (DATA_MODE === 'live') return [];
  await tick();
  return seedSyndicates();
}

export function useSyndicates() {
  return useQuery({
    queryKey: SYNDICATES_KEY,
    queryFn: fetchSyndicates,
    staleTime: DATA_MODE === 'live' ? undefined : Infinity,
    gcTime: DATA_MODE === 'live' ? undefined : Infinity,
  });
}

export function useSyndicate(id: string) {
  return useQuery({
    queryKey: SYNDICATES_KEY,
    queryFn: fetchSyndicates,
    staleTime: DATA_MODE === 'live' ? undefined : Infinity,
    gcTime: DATA_MODE === 'live' ? undefined : Infinity,
    select: (list) => list.find((s) => s.id === id) ?? null,
  });
}

// ── Session actions ───────────────────────────────────────────────────

/** Who the session writes as — the organizer on create, the member on join. */
export interface SyndicateActor {
  id: string;
  username: string;
  displayName: string | null;
  avatar: string | null;
}

export interface NewSyndicateInput {
  name: string;
  assetId: string;
  memberCap: number;
  unitsTarget: number;
  minContributionGbp: number;
  maxContributionGbp: number;
  termsNote: string | null;
}

/**
 * Contribution outcomes beyond the pool rules: 'insufficient_funds' when
 * the wallet can't cover the commitment, 'live_unavailable' when the
 * syndicate surface is running on fixture pools under a live session.
 */
export type ContributeIssue = ContributionIssue | 'insufficient_funds' | 'live_unavailable';

export type ContributeResult =
  | { ok: true; funded: boolean }
  | { ok: false; issue: ContributeIssue };

let counter = 0;
const nextId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}`;

function assetFor(s: Syndicate): CoOwnAsset | undefined {
  return CO_OWN_ASSETS.find((a) => a.id === s.assetId);
}

// ── Wallet settlement ─────────────────────────────────────────────────
// A contribution is real money out of the GBP pocket: debited on commit,
// credited back when the commitment is released (withdraw / dissolve).
// The session ledger is the source of truth for what was actually moved —
// seeded memberships never touched the wallet, so refunds only ever pay
// out amounts this session debited.

const round2 = (n: number) => Math.round(n * 100) / 100;

const DEBIT_PREFIX = (poolId: string, userId: string) => `sync-${poolId}-${userId}`;
const REFUND_PREFIX = (poolId: string, userId: string) => `synr-${poolId}-${userId}`;

/** GBP still held against this member's commitment in the session ledger. */
export function syndicateStakeInWallet(
  wallet: WalletData | undefined,
  poolId: string,
  userId: string,
): number {
  if (!wallet) return 0;
  const debit = DEBIT_PREFIX(poolId, userId);
  const refund = REFUND_PREFIX(poolId, userId);
  let out = 0;
  for (const e of wallet.session) {
    if (e.id.startsWith(debit)) out -= e.amount;
    else if (e.id.startsWith(refund)) out += e.amount;
  }
  return round2(Math.max(0, out));
}

/** Credit a released commitment back to the wallet + session ledger. */
export function creditSyndicateRefund(
  queryClient: QueryClient,
  userId: string,
  pool: Syndicate,
  amountGbp: number,
): void {
  if (amountGbp <= 0) return;
  const now = new Date().toISOString();
  queryClient.setQueryData<WalletData>(walletKeys.all(userId), (old) => {
    if (!old) return old;
    const entry: WalletLedgerEntry = {
      id: `${REFUND_PREFIX(pool.id, userId)}-${Date.now().toString(36)}-${(counter++).toString(36)}`,
      kind: 'refund',
      amount: round2(amountGbp),
      status: 'completed',
      date: now,
      description: `Syndicate commitment returned — ${pool.name}`,
      balance: null,
    };
    return {
      ...old,
      available: round2(old.available + amountGbp),
      session: [entry, ...old.session],
    };
  });
}

export function useSyndicateActions() {
  const queryClient = useQueryClient();

  const update = (fn: (list: Syndicate[]) => Syndicate[]) => {
    // Seed on a cold cache — the create wizard can write before the hub
    // or a detail page ever fetched the list. Live mode never seeds:
    // fixture pools must not appear as real data.
    queryClient.setQueryData<Syndicate[]>(SYNDICATES_KEY, (old) =>
      fn(old ?? (DATA_MODE === 'live' ? [] : seedSyndicates())),
    );
  };

  return {
    /** Create a pool from the wizard and return it for navigation. */
    createSyndicate(input: NewSyndicateInput, organizer: SyndicateActor): Syndicate {
      const now = new Date().toISOString();
      const id = nextId('syn');
      const syndicate: Syndicate = {
        id,
        name: input.name.trim(),
        assetId: input.assetId,
        organizerId: organizer.id,
        organizerUsername: organizer.username,
        memberCap: input.memberCap,
        unitsTarget: input.unitsTarget,
        minContributionGbp: input.minContributionGbp,
        maxContributionGbp: input.maxContributionGbp,
        termsNote: input.termsNote?.trim() ? input.termsNote.trim() : null,
        status: 'open',
        members: [],
        executions: [
          {
            id: `${id}-e0`,
            kind: 'note',
            actorUsername: null,
            amountGbp: null,
            units: null,
            note: `Pool opened by @${organizer.username}.`,
            at: now,
          },
        ],
        createdAt: now,
      };
      update((list) => [syndicate, ...list]);
      return syndicate;
    },

    /**
     * Commit funds to a pool. Validates against the pool rules first —
     * join is folded in: a non-member with a valid contribution becomes a
     * member; an existing member's amount folds into their commitment.
     * When a contribution closes the target, a milestone lands in the
     * order history and the pool reads as funded.
     *
     * Settlement: the commitment debits the wallet's GBP pocket and lands
     * in the session ledger, so withdraw/dissolve can refund exactly what
     * was put up. Live mode is gated — there is no syndicates endpoint,
     * so committing would touch no real ledger.
     */
    async contribute(
      syndicateId: string,
      amountGbp: number,
      actor: SyndicateActor,
    ): Promise<ContributeResult> {
      if (DATA_MODE === 'live') return { ok: false, issue: 'live_unavailable' };
      const list = queryClient.getQueryData<Syndicate[]>(SYNDICATES_KEY) ?? seedSyndicates();
      const target = list.find((s) => s.id === syndicateId);
      const asset = target ? assetFor(target) : undefined;
      if (!target || !asset) return { ok: false, issue: 'pool_closed' };

      const issue = checkContribution(target, asset, actor.id, amountGbp);
      if (issue) return { ok: false, issue };

      // Seed the wallet cache on a cold session — a contribution can be
      // the first wallet touch — then gate on the real balance.
      const walletKey = walletKeys.all(actor.id);
      const wallet =
        queryClient.getQueryData<WalletData>(walletKey) ??
        (await queryClient.ensureQueryData<WalletData>({
          queryKey: [...walletKey],
          queryFn: () => fetchWallet(actor.id),
        }));
      if (!wallet || wallet.available + 0.005 < amountGbp) {
        return { ok: false, issue: 'insufficient_funds' };
      }

      const now = new Date().toISOString();
      const wasMember = target.members.some((m) => m.userId === actor.id);
      const closesPool = amountGbp >= remainingGbp(target, asset) - 0.005;

      update((current) =>
        current.map((s) => {
          if (s.id !== syndicateId) return s;
          const members: SyndicateMember[] = wasMember
            ? s.members.map((m) =>
                m.userId === actor.id
                  ? { ...m, contributionGbp: Math.round((m.contributionGbp + amountGbp) * 100) / 100 }
                  : m,
              )
            : [
                ...s.members,
                {
                  id: `${s.id}-m${Date.now().toString(36)}`,
                  userId: actor.id,
                  username: actor.username,
                  displayName: actor.displayName,
                  avatar: actor.avatar,
                  role: s.organizerId === actor.id ? ('organizer' as const) : ('member' as const),
                  contributionGbp: amountGbp,
                  joinedAt: now,
                },
              ];
          const executions = [
            ...s.executions,
            {
              id: nextId(`${s.id}-e`),
              kind: 'contribution' as const,
              actorUsername: actor.username,
              amountGbp,
              units: null,
              note: null,
              at: now,
            },
            ...(closesPool
              ? [
                  {
                    id: nextId(`${s.id}-e`),
                    kind: 'note' as const,
                    actorUsername: null,
                    amountGbp: null,
                    units: null,
                    note: 'Pool target reached — the pooled buy is queued.',
                    at: now,
                  },
                ]
              : []),
          ];
          return { ...s, members, executions };
        }),
      );

      // The money side: the commitment leaves the GBP pocket now and is
      // returned by creditSyndicateRefund if it's released before settle.
      queryClient.setQueryData<WalletData>(walletKey, (old) => {
        if (!old) return old;
        const debit: WalletLedgerEntry = {
          id: `${DEBIT_PREFIX(target.id, actor.id)}-${Date.now().toString(36)}-${(counter++).toString(36)}`,
          kind: 'purchase',
          amount: -amountGbp,
          status: 'completed',
          date: now,
          description: `Syndicate commitment — ${target.name}`,
          balance: null,
        };
        return {
          ...old,
          available: round2(old.available - amountGbp),
          session: [debit, ...old.session],
        };
      });
      return { ok: true, funded: closesPool };
    },
  };
}
