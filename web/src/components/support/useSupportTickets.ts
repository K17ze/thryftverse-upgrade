'use client';

/**
 * Support session state — the react-query cache doubles as the session
 * ticket store, mirroring the mobile store's supportTickets slice. Seeds
 * from fixtures-support on first mount; create/reply/accept/escalate/CSAT
 * mutate the cache so tickets survive in-app navigation for the whole
 * client session. A hard reload re-seeds — honest fixture-mode behaviour.
 *
 * Guests never see the fixture seeds: they belong to the demo identity, so
 * a signed-out session starts from an empty case list.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  SupportTicket,
  SupportTicketMessage,
  SupportTopicId,
} from '@/lib/contracts/support';
import { topicById } from '@/lib/contracts/support';
import { SUPPORT_TICKETS } from '@/lib/data/fixtures-support';
import { DATA_MODE } from '@/lib/api/client';
import * as supportService from '@/lib/api/services/support';
import { useSession } from '@/lib/session/SessionProvider';

const TICKETS_KEY = ['support-tickets'] as const;

const tick = (ms = 360) => new Promise((r) => setTimeout(r, ms));
/** Optimistic-send settle delay — fixture mode only, mirrors the composer. */
const SEND_MS = 700;

async function fetchTickets(isGuest: boolean): Promise<SupportTicket[]> {
  // Guests have no case list — fixture seeds belong to the demo identity
  // and a live fetch would just 401.
  if (isGuest) return [];
  if (DATA_MODE === 'live') {
    return supportService.fetchSupportCases();
  }
  await tick();
  return SUPPORT_TICKETS.map((t) => ({ ...t }));
}

/**
 * Session-scoped ticket state: staleTime/gcTime Infinity keeps created
 * cases and replies alive across in-app navigation in fixture mode; live
 * mode refetches normally.
 */
/** Guest and authed sessions keep separate caches — signing in or out
 *  re-seeds rather than leaking one identity's cases into the other. */
const ticketsKey = (isGuest: boolean) =>
  [...TICKETS_KEY, isGuest ? 'guest' : 'authed'] as const;

export function useSupportTickets() {
  const { isGuest } = useSession();
  return useQuery({
    queryKey: ticketsKey(isGuest),
    queryFn: () => fetchTickets(isGuest),
    staleTime: DATA_MODE === 'live' ? undefined : Infinity,
    gcTime: DATA_MODE === 'live' ? undefined : Infinity,
  });
}

export interface NewTicketInput {
  topicId: SupportTopicId;
  orderRef: string | null;
  message: string;
  /** Evidence photo URLs — uploaded media URLs in live mode, session-local
   *  object URLs in fixture mode (the same honesty boundary as messages). */
  evidenceUris?: string[];
}

/** One mutation surface for every case action — all cache-local. */
export function useSupportActions() {
  const queryClient = useQueryClient();
  const { isGuest } = useSession();
  const key = ticketsKey(isGuest);

  const update = (fn: (tickets: SupportTicket[]) => SupportTicket[]) => {
    queryClient.setQueryData<SupportTicket[]>(key, (old) =>
      old ? fn(old) : old,
    );
  };

  const mapTicket = (
    ticketId: string,
    fn: (ticket: SupportTicket) => SupportTicket,
  ) => {
    update((tickets) =>
      tickets.map((t) => (t.id === ticketId ? fn(t) : t)),
    );
  };

  const setMessageStatus = (
    ticketId: string,
    messageId: string,
    status: SupportTicketMessage['status'],
  ) => {
    mapTicket(ticketId, (ticket) => ({
      ...ticket,
      messages: ticket.messages.map((m) =>
        m.id === messageId ? { ...m, status } : m,
      ),
      updatedAt: new Date().toISOString(),
    }));
  };

  /**
   * Resolve an optimistic send. Live mode trusts the POST only — resolve
   * marks the line sent, reject marks it failed (the row offers retry).
   * Fixture mode settles on the local tick.
   */
  const deliver = (ticketId: string, messageId: string, body: string) => {
    if (DATA_MODE === 'live') {
      void supportService
        .postSupportCaseMessage(ticketId, body)
        .then(() => {
          setMessageStatus(ticketId, messageId, 'sent');
          void queryClient.invalidateQueries({ queryKey: TICKETS_KEY });
        })
        .catch(() => setMessageStatus(ticketId, messageId, 'failed'));
      return;
    }
    window.setTimeout(
      () => setMessageStatus(ticketId, messageId, 'sent'),
      SEND_MS,
    );
  };

  return {
    /** Create a case — live mode posts to /support/cases and invalidates;
     *  fixture mode writes the session cache for navigation. */
    createTicket: (input: NewTicketInput): Promise<SupportTicket> | SupportTicket => {
      if (DATA_MODE === 'live') {
        return supportService
          .createSupportCase({ ...input, evidenceMediaUrls: input.evidenceUris })
          .then((created) => {
            void queryClient.invalidateQueries({ queryKey: TICKETS_KEY });
            return created;
          });
      }
      const now = new Date().toISOString();
      const id = `tv-${Date.now().toString(36)}`;
      const topic = topicById(input.topicId);
      const evidence = (input.evidenceUris ?? []).map((uri, i) => ({
        id: `${id}-ev${i + 1}`,
        uri,
      }));
      const ticket: SupportTicket = {
        id,
        ref: id.toUpperCase(),
        topicId: input.topicId,
        topicLabel: topic?.label ?? 'Support',
        orderRef: input.orderRef?.trim() ? input.orderRef.trim() : null,
        evidence: evidence.length ? evidence : undefined,
        status: 'open',
        priority: 'normal',
        messages: [
          {
            id: `${id}-m1`,
            role: 'customer',
            authorName: null,
            body: input.message.trim(),
            createdAt: now,
            status: 'sent',
          },
        ],
        events: [
          {
            kind: 'opened',
            label: 'Case opened',
            detail: topic?.label,
            at: now,
          },
          // The evidence event is the same record mobile writes
          // (evidence_received) — the activity log renders it.
          ...(evidence.length
            ? [
                {
                  kind: 'evidence' as const,
                  label: 'Evidence received',
                  detail: `${evidence.length} photo${evidence.length === 1 ? '' : 's'} attached`,
                  at: now,
                },
              ]
            : []),
        ],
        resolution: null,
        csat: null,
        createdAt: now,
        updatedAt: now,
      };
      update((tickets) => [ticket, ...tickets]);
      return ticket;
    },

    /** Optimistic customer reply — clock receipt until the send resolves
     *  (live POST) or the fixture tick lands. */
    appendMessage: (ticketId: string, body: string): string => {
      const messageId = `m-${Date.now().toString(36)}`;
      const now = new Date().toISOString();
      mapTicket(ticketId, (ticket) => ({
        ...ticket,
        messages: [
          ...ticket.messages,
          {
            id: messageId,
            role: 'customer' as const,
            authorName: null,
            body,
            createdAt: now,
            status: 'sending' as const,
          },
        ],
        updatedAt: now,
      }));
      deliver(ticketId, messageId, body);
      return messageId;
    },

    /** Re-send a failed reply — same body, fresh attempt. */
    retryMessage: (ticketId: string, messageId: string): void => {
      let body: string | null = null;
      mapTicket(ticketId, (ticket) => {
        const message = ticket.messages.find((m) => m.id === messageId);
        body = message?.body ?? null;
        return {
          ...ticket,
          messages: ticket.messages.map((m) =>
            m.id === messageId ? { ...m, status: 'sending' as const } : m,
          ),
        };
      });
      if (body != null) deliver(ticketId, messageId, body);
    },

    /** Fixture mode only — no accept endpoint exists yet, so live cases
     *  keep the proposed resolution without a fake cache write. */
    acceptResolution: (ticketId: string): void => {
      if (DATA_MODE === 'live') return;
      const now = new Date().toISOString();
      mapTicket(ticketId, (ticket) => ({
        ...ticket,
        status: 'closed',
        messages: [
          ...ticket.messages,
          {
            id: `m-${Date.now().toString(36)}`,
            role: 'system' as const,
            authorName: null,
            body: 'You accepted the resolution. The case is now closed.',
            createdAt: now,
            status: 'sent' as const,
          },
        ],
        events: [
          ...ticket.events,
          { kind: 'closed' as const, label: 'Case closed', at: now },
        ],
        updatedAt: now,
      }));
    },

    /**
     * Bot→human handoff — mirrors mobile POST /support/conversations/:id/
     * handoff. The case API has no handoff route, so live mode makes the
     * request through the channel that does exist: a real message on the
     * case (delivered via the same optimistic-send path as a typed reply).
     * Fixture mode additionally records the queue event + acknowledgement.
     */
    requestHandoff: (ticketId: string): string => {
      const messageId = `m-${Date.now().toString(36)}`;
      const now = new Date().toISOString();
      const handoffBody = "I'd like to talk to a person about this case.";
      mapTicket(ticketId, (ticket) => ({
        ...ticket,
        messages: [
          ...ticket.messages,
          {
            id: messageId,
            role: 'customer' as const,
            authorName: null,
            body: handoffBody,
            createdAt: now,
            status: 'sending' as const,
          },
          // Fixture only — the queue acknowledgement a specialist request
          // produces. Live mode relies on the real reply instead.
          ...(DATA_MODE === 'live'
            ? []
            : [
                {
                  id: `${messageId}-sys`,
                  role: 'system' as const,
                  authorName: null,
                  body: 'A support specialist will continue here — expect a reply within one working day.',
                  createdAt: now,
                  status: 'sent' as const,
                },
              ]),
        ],
        events:
          DATA_MODE === 'live'
            ? ticket.events
            : [
                ...ticket.events,
                {
                  kind: 'handoff' as const,
                  label: 'Specialist handoff requested',
                  at: now,
                },
              ],
        updatedAt: now,
      }));
      deliver(ticketId, messageId, handoffBody);
      return messageId;
    },

    /**
     * Contest a proposed resolution. Live mode POSTs the real case-appeal
     * endpoint (/support/cases/:id/appeal) — a specialist reopens review.
     * Fixture mode writes the equivalent local transition.
     */
    contestResolution: async (ticketId: string, reason: string): Promise<boolean> => {
      if (DATA_MODE === 'live') {
        try {
          await supportService.appealSupportCase(ticketId, reason);
          await queryClient.invalidateQueries({ queryKey: TICKETS_KEY });
          return true;
        } catch {
          return false;
        }
      }
      const now = new Date().toISOString();
      mapTicket(ticketId, (ticket) => ({
        ...ticket,
        status: 'in_review',
        messages: [
          ...ticket.messages,
          {
            id: `m-${Date.now().toString(36)}`,
            role: 'system' as const,
            authorName: null,
            body: reason.trim()
              ? `You contested the resolution: ${reason.trim()} A specialist will review the decision.`
              : 'Case escalated — a specialist will review the decision.',
            createdAt: now,
            status: 'sent' as const,
          },
        ],
        events: [
          ...ticket.events,
          { kind: 'note' as const, label: 'Appeal requested', at: now },
        ],
        updatedAt: now,
      }));
      return true;
    },

    /** CSAT — live mode posts to /support/cases/:id/feedback and only
     *  records the rating when the server accepts it. */
    submitCsat: async (
      ticketId: string,
      rating: number,
      note: string,
    ): Promise<boolean> => {
      const apply = () =>
        mapTicket(ticketId, (ticket) => ({
          ...ticket,
          csat: { rating, note: note.trim() },
          updatedAt: new Date().toISOString(),
        }));
      if (DATA_MODE === 'live') {
        try {
          await supportService.submitSupportCsat(ticketId, { rating, note: note.trim() });
          apply();
          return true;
        } catch {
          return false;
        }
      }
      apply();
      return true;
    },
  };
}
