'use client';

/**
 * Co-Own governance votes — the ballots the session has cast, persisted
 * locally. Mirrors the mobile vote upsert: one vote per corporate action,
 * re-voting while the ballot is open replaces the previous choice. The
 * stored voting power is the units held at cast time, so the local tally
 * overlay stays honest after a reload.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { VoteChoice } from '@/lib/contracts/coown';

export interface StoredVote {
  vote: VoteChoice;
  /** Units held when the ballot was cast — the viewer's voting power. */
  votingPowerUnits: number;
  castAt: string;
}

interface CoOwnVotesState {
  /** Corporate-action id → the viewer's recorded ballot. */
  votes: Record<string, StoredVote>;
  castVote: (actionId: string, vote: VoteChoice, votingPowerUnits: number) => void;
  /** Removes the local record — used when the server contradicts it
   *  (live mode only; the backend is authoritative there). */
  clearVote: (actionId: string) => void;
}

export const useCoOwnVotes = create<CoOwnVotesState>()(
  persist(
    (set) => ({
      votes: {},
      castVote: (actionId, vote, votingPowerUnits) =>
        set((s) => ({
          votes: {
            ...s.votes,
            [actionId]: {
              vote,
              votingPowerUnits,
              castAt: new Date().toISOString(),
            },
          },
        })),
      clearVote: (actionId) =>
        set((s) => {
          if (!(actionId in s.votes)) return s;
          const votes = { ...s.votes };
          delete votes[actionId];
          return { votes };
        }),
    }),
    {
      name: 'thryftverse.web.coown-votes',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ votes: s.votes }),
    },
  ),
);
