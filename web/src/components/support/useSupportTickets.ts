'use client';

/**
 * Support session state — the react-query cache doubles as the session
 * ticket store, mirroring the mobile store's supportTickets slice. Seeds
 * from fixtures-support on first mount; create/reply/accept/escalate/CSAT
 * mutate the cache so tickets survive in-app navigation for the whole
 * client session. A hard reload re-seeds — honest fixture-mode behaviour.
 *
 * Live mode merges the two real server models: support cases (GET
 * /support/cases — ops-desk records whose thread derives from the case's
 * public event log) and order-bound support tickets (GET
 * /support/tickets). Case detail is a separate read (GET
 * /support/cases/:id returns the events) — useSupportCaseDetail fetches
 * it and merges the full record back into the list cache, preserving any
 * in-flight optimistic replies.
 *
 * Guests never see the fixture seeds: they belong to the demo identity, so
 * a signed-out session starts from an empty case list — and the query is
 * disabled entirely (`enabled: !!user`) so it never 401-churns.
 */

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupportTicket } from '@/lib/contracts/support';
import { DATA_MODE } from '@/lib/api/client';
import * as supportService from '@/lib/api/services/support';
import { useSession } from '@/lib/session/SessionProvider';
import {
  CASE_KEY,
  fetchTickets,
  type NewTicketInput,
  ticketsKey,
} from './supportModel';

export type { NewTicketInput };
export { useSupportActions } from './useSupportActions';

/**
 * Session-scoped ticket state: staleTime/gcTime Infinity keeps created
 * cases and replies alive across in-app navigation in fixture mode; live
 * mode refetches normally.
 */
export function useSupportTickets() {
  const { user, isGuest } = useSession();
  return useQuery({
    queryKey: ticketsKey(isGuest),
    queryFn: () => fetchTickets(isGuest),
    // Guest gate — the list is account-bound; without this the query
    // 401-churns before the sign-in wall.
    enabled: !!user,
    staleTime: DATA_MODE === 'live' ? undefined : Infinity,
    gcTime: DATA_MODE === 'live' ? undefined : Infinity,
  });
}

/**
 * Case detail — GET /support/cases/:id carries the public event log the
 * thread and activity views derive from (the list read returns none).
 * Order-bound tickets (`ticket_` ids) have no detail route — their list
 * row is the whole record. The fetched case merges into the ticket-list
 * cache so every consumer keeps a single source of truth.
 */
export function useSupportCaseDetail(caseId: string) {
  const queryClient = useQueryClient();
  const { user, isGuest } = useSession();
  const key = ticketsKey(isGuest);

  const query = useQuery({
    queryKey: [CASE_KEY, isGuest ? 'guest' : 'authed', caseId],
    queryFn: ({ signal }) => supportService.fetchSupportCase(caseId, signal),
    enabled:
      DATA_MODE === 'live' && !!user && !caseId.startsWith('ticket_'),
    staleTime: 15_000,
  });

  const detail = query.data;
  useEffect(() => {
    if (!detail) return;
    queryClient.setQueryData<SupportTicket[]>(key, (old) => {
      if (!old) return [detail];
      const existing = old.find((t) => t.id === detail.id);
      if (!existing) return [detail, ...old];
      return old.map((t) =>
        t.id === detail.id
          ? {
              ...detail,
              // Keep in-flight optimistic sends — the server event log
              // doesn't carry them yet.
              messages: [
                ...detail.messages,
                ...t.messages.filter(
                  (m) => m.status === 'sending' || m.status === 'failed',
                ),
              ],
            }
          : t,
      );
    });
  }, [detail, key, queryClient]);

  return query;
}

/**
 * Reports the viewer has filed — GET /users/me/reports joins the three
 * report tables to their safety notice and case outcome. Live-mode only:
 * fixtures seed no report history and guests have none.
 */
export function useMyReports() {
  const { user } = useSession();
  return useQuery({
    queryKey: ['my-reports', user?.id ?? 'guest'],
    queryFn: ({ signal }) => supportService.fetchMyReports(signal),
    enabled: DATA_MODE === 'live' && !!user,
    staleTime: 30_000,
  });
}
