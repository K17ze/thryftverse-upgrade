'use client';

/**
 * Imported-draft session state — the react-query cache doubles as the
 * session draft store, mirroring the mobile import batch's draft records.
 * Starts empty; each completed import prepends drafts that survive in-app
 * navigation for the whole client session. A hard reload resets — honest
 * fixture-mode behaviour (mirrors useSupportTickets.ts).
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Listing } from '@/lib/contracts/domain';

const DRAFTS_KEY = ['catalog-import-drafts'] as const;

const tick = (ms = 240) => new Promise((r) => setTimeout(r, ms));

async function fetchDrafts(): Promise<Listing[]> {
  await tick();
  return [];
}

/** Session-scoped draft list — persists across in-app navigation only. */
export function useImportDrafts() {
  return useQuery({
    queryKey: DRAFTS_KEY,
    queryFn: fetchDrafts,
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

/** Draft mutations — all cache-local, matching the session-store pattern. */
export function useImportDraftActions() {
  const queryClient = useQueryClient();

  return {
    /** Commit a completed import — newest drafts first. */
    appendDrafts: (drafts: Listing[]) => {
      queryClient.setQueryData<Listing[]>(DRAFTS_KEY, (old) => [
        ...drafts,
        ...(old ?? []),
      ]);
    },
  };
}
