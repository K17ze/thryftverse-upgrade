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
export const IMPORT_DRAFTS_KEY = DRAFTS_KEY;

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
    /**
     * The sell composer writes back through this when a resumed imported
     * draft is edited — the draft keeps living in its source store.
     */
    updateDraft: (id: string, patch: Partial<Listing>) => {
      queryClient.setQueryData<Listing[]>(DRAFTS_KEY, (old) =>
        (old ?? []).map((d) => (d.id === id ? { ...d, ...patch, id: d.id } : d)),
      );
    },
    /** Publish or discard — the draft leaves the shelf. */
    removeDraft: (id: string) => {
      queryClient.setQueryData<Listing[]>(DRAFTS_KEY, (old) =>
        (old ?? []).filter((d) => d.id !== id),
      );
    },
  };
}
