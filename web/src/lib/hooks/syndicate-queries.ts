'use client';

/**
 * Syndicate queries — the react-query cache doubles as the session pool
 * store, mirroring useSupportTickets. Seeds from fixtures-syndicate on
 * first mount; create/contribute mutate the cache so pools survive
 * in-app navigation for the whole client session. A hard reload
 * re-seeds — honest fixture-mode behaviour.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
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
  await tick();
  return seedSyndicates();
}

export function useSyndicates() {
  return useQuery({
    queryKey: SYNDICATES_KEY,
    queryFn: fetchSyndicates,
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

export function useSyndicate(id: string) {
  return useQuery({
    queryKey: SYNDICATES_KEY,
    queryFn: fetchSyndicates,
    staleTime: Infinity,
    gcTime: Infinity,
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

export type ContributeResult =
  | { ok: true; funded: boolean }
  | { ok: false; issue: ContributionIssue };

let counter = 0;
const nextId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}`;

function assetFor(s: Syndicate): CoOwnAsset | undefined {
  return CO_OWN_ASSETS.find((a) => a.id === s.assetId);
}

export function useSyndicateActions() {
  const queryClient = useQueryClient();

  const update = (fn: (list: Syndicate[]) => Syndicate[]) => {
    // Seed on a cold cache — the create wizard can write before the hub
    // or a detail page ever fetched the list.
    queryClient.setQueryData<Syndicate[]>(SYNDICATES_KEY, (old) =>
      fn(old ?? seedSyndicates()),
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
     */
    contribute(syndicateId: string, amountGbp: number, actor: SyndicateActor): ContributeResult {
      const list = queryClient.getQueryData<Syndicate[]>(SYNDICATES_KEY) ?? seedSyndicates();
      const target = list.find((s) => s.id === syndicateId);
      const asset = target ? assetFor(target) : undefined;
      if (!target || !asset) return { ok: false, issue: 'pool_closed' };

      const issue = checkContribution(target, asset, actor.id, amountGbp);
      if (issue) return { ok: false, issue };

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
      return { ok: true, funded: closesPool };
    },
  };
}
